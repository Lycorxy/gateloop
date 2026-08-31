/**
 * GateLoop 引擎入口 — Anchor-Driven Skill 运行时（Harness）
 *
 * 任何 Skill 通过声明 AnchorManifest 即可获得 GateLoop 能力。
 * 引擎负责：状态机推进 + 验证判定 + 规则/数据内联 + 子任务编排 +
 *          临时工作区生命周期 + 熔断 + 日志审计。
 *
 * 核心原则：
 *   - 状态只有引擎能写（模型无权）
 *   - 通过与否由 exit code 判定（模型无法伪造）
 *   - 推进前强制重跑验证（防"撒谎说通过"）
 *   - 规则/上游数据内联进指令（模型不需要自己 read）
 *   - 大任务动态拆子任务，全绿才推进
 *   - 阶段间数据走 artifact 契约，不靠猜文件名
 *   - 连续失败熔断，避免死循环
 *   - 临时草稿隔离在 scratch，完成/重置自动清理
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type {
    AnchorManifest,
    AnchorInstruction,
    VerifyResult,
    AnchorDefinition,
    AnchorState,
    SubTask,
    Artifact,
    LogEntry,
    AnchorHooks
} from './types'
import {
    initTask,
    doNext,
    getCurrentInstruction,
    readState,
    resetTask,
    appendLog,
    addSubtasks,
    completeSubtask,
    emitArtifact,
    writeMemoryEntry,
    retryStage
} from './state'
import { verify } from './verify'
import { readMemory, type MemoryHooks } from './memory'
import { tmpFile, tmpDir, gcScratch, getWorkspaceDir, getArtifactsDir } from './workspace'

// ==================== Manifest 加载 ====================

/**
 * 从文件加载 Manifest
 *
 * 支持 .json / .yaml（.yaml 需要 js-yaml 依赖）
 */
export function loadManifest(path: string): AnchorManifest {
    if (!existsSync(path)) {
        throw new Error(`Manifest 文件不存在: ${path}`)
    }

    const content = readFileSync(path, 'utf-8')
    const ext = path.split('.').pop()?.toLowerCase()

    if (ext === 'yaml' || ext === 'yml') {
        try {
            const req = createRequire(import.meta.url)
            const yaml = req('js-yaml') as { load: (s: string) => unknown }
            return yaml.load(content) as AnchorManifest
        } catch {
            throw new Error('YAML manifest 需要 js-yaml 依赖。请用 .json 格式或安装 js-yaml。')
        }
    }

    return JSON.parse(content) as AnchorManifest
}

// ==================== GateLoop 运行时 ====================

/**
 * GateLoop 运行时实例
 *
 * 封装状态机 + 验证器 + 工作区，提供 init/next/status/reset 及
 * 子任务/artifact/临时文件等 harness API。
 */
export class GateLoop {
    private manifest: AnchorManifest
    private cwd: string
    /** ★ 补丁A：记忆读写钩子（接真实 MCP；未注入时降级本地 store） */
    private memoryHooks?: MemoryHooks
    /** ★ 通用钩子层：生命周期钩子（beforeAnchor/afterAnchor，接外部系统） */
    private anchorHooks?: AnchorHooks

    constructor(manifest: AnchorManifest, memoryHooks?: MemoryHooks, anchorHooks?: AnchorHooks) {
        this.manifest = manifest
        this.cwd = manifest.cwd || process.cwd()
        this.memoryHooks = memoryHooks
        this.anchorHooks = anchorHooks
    }

    /**
     * 初始化任务
     *
     * 创建状态文件 + 隔离 scratch 目录，进入第一个锚点。
     * 已有相同任务的状态时不覆盖，返回当前指令（天然支持断点续跑）。
     */
    async init(task: string): Promise<AnchorInstruction> {
        const existing = readState(this.cwd, this.manifest.stateFile)
        if (existing && existing.task === task) {
            return this.status()
        }

        if (existing) {
            resetTask(this.manifest, this.cwd)
        }

        initTask(this.manifest, task, this.cwd, this.anchorHooks)
        return this.status()
    }

    /**
     * 推进到下一阶段（核心方法）
     *
     * ★ 内部强制重跑验证 + 子任务闭环 + artifact 校验 + 熔断，
     *   模型无法用嘴巴推进。
     */
    async next(): Promise<AnchorInstruction> {
        return doNext(
            this.manifest,
            (anchor: AnchorDefinition, cwd: string, state, hooks) =>
                verify(anchor, cwd, state, hooks),
            this.cwd,
            this.memoryHooks,
            this.anchorHooks
        )
    }

    /**
     * 查询当前指令（不推进、不验证）
     * 用于断线恢复：告诉 LLM "你在哪一步，该做什么"。
     */
    status(): Promise<AnchorInstruction> {
        return getCurrentInstruction(this.manifest, this.cwd, this.memoryHooks, this.anchorHooks)
    }

    /**
     * 标记当前阶段开始新一轮尝试（断点续跑用）
     *
     * 恢复任务后、重新动手做本阶段前调用，刷新 producesFresh 基准，
     * 避免上一轮产物被误判为旧文件。
     */
    retry(): void {
        retryStage(this.manifest, this.cwd)
    }

    /**
     * 重置任务（删除状态 + 清理 scratch，从头开始）
     */
    reset(): void {
        resetTask(this.manifest, this.cwd)
    }

    /**
     * 手动验证当前阶段（不推进）
     */
    async check(): Promise<VerifyResult> {
        const state = readState(this.cwd, this.manifest.stateFile)
        if (!state) {
            return { passed: false, checks: [], errors: ['状态不存在，请先 init'], duration: 0 }
        }

        const anchor = this.manifest.anchors[state.currentAnchorIndex]
        if (!anchor) {
            return { passed: true, checks: [], errors: [], duration: 0 }
        }

        return verify(anchor, this.cwd, state)
    }

    // ==================== 子任务（动态拆分） ====================

    /**
     * 在当前阶段动态拆分子任务（大任务→子任务）
     */
    addSubtasks(
        subtasks: Array<{ id?: string; desc: string; produces?: string[] }>
    ): SubTask[] | null {
        return addSubtasks(this.manifest, subtasks, this.cwd)
    }

    /**
     * 标记子任务完成
     */
    completeSubtask(subtaskId: string): SubTask[] | null {
        return completeSubtask(this.manifest, subtaskId, this.cwd)
    }

    // ==================== Artifact（数据管道） ====================

    /**
     * 产出 artifact（供下阶段 consumes 消费）
     */
    emit(artifact: {
        key: string
        kind: 'file' | 'value'
        path?: string
        value?: unknown
    }): Record<string, Artifact> | null {
        return emitArtifact(this.manifest, artifact, this.cwd)
    }

    /**
     * 读取某个 artifact（只读）
     */
    getArtifact(key: string): Artifact | undefined {
        const state = readState(this.cwd, this.manifest.stateFile)
        return state?.artifacts[key]
    }

    // ==================== Memory（跨任务决策记忆） ====================

    /**
     * ★ 补丁A：回写一条决策记忆（writesMemory 门禁以此为准）
     *
     * 落本地 store + MCP（若注入 hooks）。供 anchor 在完成前沉淀本轮结论。
     */
    async memWrite(key: string, value: unknown): Promise<void> {
        return writeMemoryEntry(this.manifest, key, value, this.cwd, this.memoryHooks)
    }

    /**
     * ★ 补丁A：读取一批决策记忆（只读，返回 key→内容）
     */
    async memRead(keys: string[]): Promise<Array<{ key: string; content: string }>> {
        return readMemory(keys, this.cwd, this.manifest.memory, this.memoryHooks)
    }

    // ==================== 临时工作区 ====================

    /**
     * 分配临时文件路径（在本任务 workspace 下）
     */
    tmpFile(name: string, initialContent?: string): string | null {
        const state = readState(this.cwd, this.manifest.stateFile)
        if (!state) return null
        return tmpFile(this.cwd, state.taskId, name, this.manifest.scratchDir, initialContent)
    }

    /**
     * 分配临时子目录（在本任务 workspace 下）
     */
    tmpDir(name: string): string | null {
        const state = readState(this.cwd, this.manifest.stateFile)
        if (!state) return null
        return tmpDir(this.cwd, state.taskId, name, this.manifest.scratchDir)
    }

    /**
     * 获取本任务的 workspace / artifacts 目录
     */
    dirs(): { workspace: string; artifacts: string } | null {
        const state = readState(this.cwd, this.manifest.stateFile)
        if (!state) return null
        return {
            workspace: getWorkspaceDir(this.cwd, state.taskId, this.manifest.scratchDir),
            artifacts: getArtifactsDir(this.cwd, state.taskId, this.manifest.scratchDir)
        }
    }

    /**
     * 手动 GC 过期残留 scratch 目录
     * @returns 回收的任务 ID 列表
     */
    gc(): string[] {
        const state = readState(this.cwd, this.manifest.stateFile)
        return gcScratch(
            this.cwd,
            this.manifest.scratchDir,
            this.manifest.scratchGcHours,
            state?.taskId
        )
    }

    // ==================== 只读访问 ====================

    /** 获取当前状态（只读） */
    getState(): AnchorState | null {
        return readState(this.cwd, this.manifest.stateFile)
    }

    /** 获取 manifest（只读） */
    getManifest(): AnchorManifest {
        return this.manifest
    }

    /** 手动追加日志（供外部记事） */
    log(action: LogEntry['action'], message: string, verifyResult?: VerifyResult): void {
        const state = readState(this.cwd, this.manifest.stateFile)
        appendLog(
            this.cwd,
            {
                timestamp: new Date().toISOString(),
                skill: this.manifest.name,
                task: state?.task || '',
                stage: state?.currentStage || '',
                action,
                verifyResult,
                message
            },
            this.manifest.logFile
        )
    }
}

// ==================== 导出 ====================

export { verify } from './verify'
export {
    initTask,
    doNext,
    getCurrentInstruction,
    readState,
    resetTask,
    appendLog,
    addSubtasks,
    completeSubtask,
    emitArtifact,
    writeMemoryEntry,
    retryStage
} from './state'
export { readMemory, writeMemory, checkMemoryWritten, type MemoryHooks } from './memory'

// 度量脚本（floor-ceiling 哲学落地）
export { runMetric, printMetricHelp } from './metrics/runner'
export { metricDesign } from './metrics/design-metrics'
export { metricArchitecture } from './metrics/architecture-metrics'
export { metricCode } from './metrics/code-metrics'
export { metricStyleCrosscheck } from './metrics/style-crosscheck'
export type { MetricResult, MetricFact } from './metrics/types'
export {
    generateTaskId,
    initScratch,
    cleanupScratch,
    gcScratch,
    tmpFile,
    tmpDir,
    getWorkspaceDir,
    getArtifactsDir,
    getTaskScratch
} from './workspace'
export type {
    AnchorManifest,
    AnchorDefinition,
    AnchorVerify,
    AnchorState,
    StageRecord,
    SubTask,
    Artifact,
    AnchorInstruction,
    RuleInline,
    ArtifactInline,
    MemoryInline,
    MemoryConfig,
    AnchorHooks,
    ContextItem,
    HookContext,
    ContextArchive,
    AnchorEvent,
    AnchorEventType,
    VerifyResult,
    VerifyCheck,
    VerifyHooks,
    LogEntry,
    AdsOptions,
    JSONSchema,
    ReviewItem,
    ReviewConfig,
    ReviewVerdict,
    ReviewConclusion
} from './types'
