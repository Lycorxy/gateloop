/**
 * ADS 状态机 — 唯一的状态写入者
 *
 * 只有引擎函数能修改 anchor-state.json。模型无权直接写状态文件。
 *
 * Harness 能力：
 *   - doNext        推进阶段（强制重跑验证 + 熔断 + artifact 传递 + 子任务闭环）
 *   - addSubtasks   运行时动态拆分子任务
 *   - completeSubtask  标记子任务完成
 *   - emitArtifact  产出阶段间传递数据
 *   - retryStage    重置本阶段一轮尝试时间（断点续跑 fresh 校验用）
 */

import {
    existsSync,
    readFileSync,
    writeFileSync,
    mkdirSync,
    appendFileSync,
    rmSync
} from 'node:fs'
import { join, dirname } from 'node:path'
import type {
    AnchorState,
    StageRecord,
    LogEntry,
    AnchorManifest,
    AnchorInstruction,
    AnchorDefinition,
    RuleInline,
    ArtifactInline,
    VerifyResult,
    Artifact,
    SubTask
} from './types'
import {
    generateTaskId,
    initScratch,
    cleanupScratch,
    gcScratch,
    getWorkspaceDir
} from './workspace'

const DEFAULT_STATE_DIR = '.specflow'
const DEFAULT_STATE_FILE = 'anchor-state.json'
const DEFAULT_LOG_FILE = 'anchor-log.jsonl'
const DEFAULT_MAX_ATTEMPTS = 5

// ==================== 状态读写 ====================

/** 获取状态文件路径 */
export function getStatePath(cwd: string, stateFile?: string): string {
    return join(cwd, stateFile || join(DEFAULT_STATE_DIR, DEFAULT_STATE_FILE))
}

/** 获取日志文件路径 */
export function getLogPath(cwd: string, logFile?: string): string {
    return join(cwd, logFile || join(DEFAULT_STATE_DIR, DEFAULT_LOG_FILE))
}

/** 读取状态（不存在返回 null） */
export function readState(cwd: string, stateFile?: string): AnchorState | null {
    const path = getStatePath(cwd, stateFile)
    if (!existsSync(path)) return null
    try {
        return JSON.parse(readFileSync(path, 'utf-8')) as AnchorState
    } catch {
        return null
    }
}

/**
 * 写入状态（仅引擎内部可调用）
 * @internal 不导出给外部，确保唯一写入点
 */
function writeState(cwd: string, state: AnchorState, stateFile?: string): void {
    const path = getStatePath(cwd, stateFile)
    mkdirSync(dirname(path), { recursive: true })
    state.updatedAt = new Date().toISOString()
    writeFileSync(path, JSON.stringify(state, null, 2), 'utf-8')
}

/** 追加日志条目 */
export function appendLog(cwd: string, entry: LogEntry, logFile?: string): void {
    const path = getLogPath(cwd, logFile)
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, JSON.stringify(entry) + '\n', 'utf-8')
}

/** 解析阶段最大重试次数 */
function resolveMaxAttempts(manifest: AnchorManifest, anchor: AnchorDefinition): number {
    return anchor.maxAttempts ?? manifest.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
}

// ==================== 状态初始化 ====================

/**
 * 初始化任务状态
 *
 * 创建状态 + 隔离 scratch 目录，并顺带 GC 过期残留目录。
 */
export function initTask(
    manifest: AnchorManifest,
    task: string,
    cwd: string = manifest.cwd || process.cwd()
): AnchorState {
    const now = new Date().toISOString()
    const taskId = generateTaskId()

    const stages: StageRecord[] = manifest.anchors.map((anchor) => ({
        anchorId: anchor.id,
        status: 'pending',
        attempts: 0
    }))

    const firstAnchor = manifest.anchors[0]
    if (firstAnchor && stages[0]) {
        stages[0].status = 'in_progress'
        stages[0].startedAt = now
        stages[0].attemptStartedAt = now
    }

    const state: AnchorState = {
        skillName: manifest.name,
        task,
        taskId,
        currentAnchorIndex: 0,
        currentStage: firstAnchor?.id || '',
        stages,
        artifacts: {},
        createdAt: now,
        updatedAt: now,
        done: false
    }

    // 创建隔离 scratch + GC 过期残留
    initScratch(cwd, taskId, manifest.scratchDir)
    const recycled = gcScratch(cwd, manifest.scratchDir, manifest.scratchGcHours, taskId)

    writeState(cwd, state, manifest.stateFile)

    appendLog(cwd, {
        timestamp: now,
        skill: manifest.name,
        task,
        stage: firstAnchor?.id || '',
        action: 'init',
        message: `任务初始化: ${task} (taskId=${taskId})${recycled.length ? `, GC 回收 ${recycled.length} 个残留目录` : ''}`
    }, manifest.logFile)

    return state
}

// ==================== 子任务（动态拆分）====================

/**
 * 在当前阶段动态拆分子任务
 * @returns 更新后的子任务列表；状态不存在返回 null
 */
export function addSubtasks(
    manifest: AnchorManifest,
    subtasks: Array<{ id?: string; desc: string; produces?: string[] }>,
    cwd: string = manifest.cwd || process.cwd()
): SubTask[] | null {
    const state = readState(cwd, manifest.stateFile)
    if (!state) return null

    const stageRecord = state.stages[state.currentAnchorIndex]
    if (!stageRecord) return null

    const now = new Date().toISOString()
    const existing = stageRecord.subtasks || []
    let seq = existing.length

    for (const st of subtasks) {
        seq++
        existing.push({
            id: st.id || `${stageRecord.anchorId}-sub-${seq}`,
            desc: st.desc,
            status: 'pending',
            produces: st.produces,
            createdAt: now
        })
    }
    stageRecord.subtasks = existing
    writeState(cwd, state, manifest.stateFile)

    appendLog(cwd, {
        timestamp: now,
        skill: manifest.name,
        task: state.task,
        stage: stageRecord.anchorId,
        action: 'subtask',
        message: `拆分 ${subtasks.length} 个子任务，当前共 ${existing.length} 个`
    }, manifest.logFile)

    return existing
}

/**
 * 标记子任务完成
 */
export function completeSubtask(
    manifest: AnchorManifest,
    subtaskId: string,
    cwd: string = manifest.cwd || process.cwd()
): SubTask[] | null {
    const state = readState(cwd, manifest.stateFile)
    if (!state) return null

    const stageRecord = state.stages[state.currentAnchorIndex]
    const target = stageRecord?.subtasks?.find((s) => s.id === subtaskId)
    if (!target) return stageRecord?.subtasks || null

    const now = new Date().toISOString()
    target.status = 'done'
    target.completedAt = now
    writeState(cwd, state, manifest.stateFile)

    appendLog(cwd, {
        timestamp: now,
        skill: manifest.name,
        task: state.task,
        stage: stageRecord!.anchorId,
        action: 'subtask',
        message: `子任务完成: ${subtaskId}`
    }, manifest.logFile)

    return stageRecord!.subtasks || null
}

// ==================== Artifact（数据管道）====================

/**
 * 产出一个 artifact（供下阶段消费）
 */
export function emitArtifact(
    manifest: AnchorManifest,
    artifact: { key: string; kind: 'file' | 'value'; path?: string; value?: unknown },
    cwd: string = manifest.cwd || process.cwd()
): Record<string, Artifact> | null {
    const state = readState(cwd, manifest.stateFile)
    if (!state) return null

    const now = new Date().toISOString()
    const producedBy = state.currentStage
    state.artifacts[artifact.key] = {
        key: artifact.key,
        producedBy,
        kind: artifact.kind,
        path: artifact.path,
        value: artifact.value,
        producedAt: now
    }
    writeState(cwd, state, manifest.stateFile)

    appendLog(cwd, {
        timestamp: now,
        skill: manifest.name,
        task: state.task,
        stage: producedBy,
        action: 'artifact',
        message: `产出 artifact: ${artifact.key} (${artifact.kind})`
    }, manifest.logFile)

    return state.artifacts
}

// ==================== 断点续跑：重置本轮尝试 ====================

/**
 * 标记当前阶段"开始新一轮尝试"，刷新 attemptStartedAt。
 *
 * 断点续跑核心：恢复任务后，模型重新开始做本阶段前先调此函数，
 * producesFresh 会以本轮 attemptStartedAt 为基准，避免拿旧 mtime 误判。
 */
export function retryStage(
    manifest: AnchorManifest,
    cwd: string = manifest.cwd || process.cwd()
): void {
    const state = readState(cwd, manifest.stateFile)
    if (!state) return
    const stageRecord = state.stages[state.currentAnchorIndex]
    if (!stageRecord) return
    stageRecord.attemptStartedAt = new Date().toISOString()
    if (stageRecord.status === 'failed') stageRecord.status = 'in_progress'
    writeState(cwd, state, manifest.stateFile)
}

// ==================== 阶段推进 ====================

/**
 * 推进到下一阶段（核心：内部强制重跑验证 + 熔断 + 子任务/artifact 校验）
 *
 * 防作弊机制：
 * 1. 即使模型撒谎"验证过了"，doNext 会再跑一遍 verify
 * 2. requiresSubtasks 的阶段，子任务未全完成不推进
 * 3. emits 声明的 artifact 未产出不推进
 * 4. verify 不通过 → advanced=false；连续失败超上限 → escalate 熔断
 * 5. verify 通过 → 写入状态，推进到下一阶段
 * 6. 全部阶段完成 → done=true，清理 workspace
 */
export async function doNext(
    manifest: AnchorManifest,
    verifyFn: (anchor: AnchorDefinition, cwd: string, state: AnchorState) => Promise<VerifyResult>,
    cwd: string = manifest.cwd || process.cwd()
): Promise<AnchorInstruction> {
    const state = readState(cwd, manifest.stateFile)

    if (!state) {
        return {
            stage: '',
            advanced: false,
            done: false,
            nextAction: '⚠️ 状态不存在，请先调用 init(task)'
        }
    }

    if (state.done) {
        return { stage: '', advanced: false, done: true, nextAction: '✅ 所有阶段已完成' }
    }

    const currentAnchor = manifest.anchors[state.currentAnchorIndex]
    if (!currentAnchor) {
        return { stage: '', advanced: false, done: true, nextAction: '✅ 所有阶段已完成' }
    }

    const stageRecord = state.stages[state.currentAnchorIndex]
    const now = new Date().toISOString()
    const maxAttempts = resolveMaxAttempts(manifest, currentAnchor)

    // ★ 前置门禁 1：子任务闭环校验
    if (currentAnchor.requiresSubtasks) {
        const subtasks = stageRecord.subtasks || []
        if (subtasks.length === 0) {
            return buildInstruction(manifest, currentAnchor, state, false, {
                passed: false,
                checks: [],
                errors: ['本阶段要求先拆分子任务（requiresSubtasks），请先调用 addSubtasks'],
                duration: 0
            })
        }
        const pending = subtasks.filter((s) => s.status !== 'done')
        if (pending.length > 0) {
            return buildInstruction(manifest, currentAnchor, state, false, {
                passed: false,
                checks: [],
                errors: [`还有 ${pending.length} 个子任务未完成: ${pending.map((s) => s.id).join(', ')}`],
                duration: 0
            })
        }
    }

    // ★ 核心防作弊：强制重跑验证
    appendLog(cwd, {
        timestamp: now,
        skill: manifest.name,
        task: state.task,
        stage: currentAnchor.id,
        action: 'verify',
        message: `验证阶段: ${currentAnchor.id}`
    }, manifest.logFile)

    const verifyResult = await verifyFn(currentAnchor, cwd, state)

    // ★ 前置门禁 2：emits 校验（并入 verifyResult）
    if (verifyResult.passed && currentAnchor.emits && currentAnchor.emits.length > 0) {
        const missing = currentAnchor.emits.filter((key) => !state.artifacts[key])
        if (missing.length > 0) {
            verifyResult.passed = false
            verifyResult.errors.push(`未产出声明的 artifact: ${missing.join(', ')}（请调用 emitArtifact）`)
            verifyResult.checks.push({
                name: 'Artifact 产出',
                passed: false,
                output: `缺失: ${missing.join(', ')}`
            })
        }
    }

    stageRecord.attempts++
    stageRecord.verifyResult = verifyResult

    if (!verifyResult.passed) {
        // ★ 熔断判定
        if (stageRecord.attempts >= maxAttempts) {
            stageRecord.status = 'escalated'
            stageRecord.escalated = true
            writeState(cwd, state, manifest.stateFile)

            appendLog(cwd, {
                timestamp: new Date().toISOString(),
                skill: manifest.name,
                task: state.task,
                stage: currentAnchor.id,
                action: 'escalate',
                verifyResult,
                message: `连续失败 ${stageRecord.attempts} 次，触发熔断`
            }, manifest.logFile)

            const inst = buildInstruction(manifest, currentAnchor, state, false, verifyResult)
            inst.escalate = true
            inst.nextAction = `🛑 连续失败 ${stageRecord.attempts}/${maxAttempts} 次，已熔断。需人工介入或降级方案。可调用 reset 重来，或修正 manifest 后 retry。`
            return inst
        }

        stageRecord.status = 'failed'
        writeState(cwd, state, manifest.stateFile)

        appendLog(cwd, {
            timestamp: new Date().toISOString(),
            skill: manifest.name,
            task: state.task,
            stage: currentAnchor.id,
            action: 'verify',
            verifyResult,
            message: `验证失败: ${verifyResult.errors.length} 个错误 (${stageRecord.attempts}/${maxAttempts})`
        }, manifest.logFile)

        return buildInstruction(manifest, currentAnchor, state, false, verifyResult)
    }

    // 验证通过 → 标记完成，推进
    stageRecord.status = 'passed'
    stageRecord.completedAt = now

    const nextIndex = state.currentAnchorIndex + 1
    const nextAnchor = manifest.anchors[nextIndex]

    if (nextAnchor && state.stages[nextIndex]) {
        state.currentAnchorIndex = nextIndex
        state.currentStage = nextAnchor.id
        state.stages[nextIndex].status = 'in_progress'
        state.stages[nextIndex].startedAt = now
        state.stages[nextIndex].attemptStartedAt = now
    } else {
        state.done = true
    }

    writeState(cwd, state, manifest.stateFile)

    appendLog(cwd, {
        timestamp: now,
        skill: manifest.name,
        task: state.task,
        stage: currentAnchor.id,
        action: 'advance',
        verifyResult,
        message: nextAnchor ? `推进到: ${nextAnchor.id}` : '任务完成'
    }, manifest.logFile)

    if (nextAnchor) {
        return buildInstruction(manifest, nextAnchor, state, true, undefined)
    }

    // 全部完成 → 清理 workspace（保留 artifacts 供审计）
    cleanupScratch(cwd, state.taskId, manifest.scratchDir, false)
    appendLog(cwd, {
        timestamp: new Date().toISOString(),
        skill: manifest.name,
        task: state.task,
        stage: currentAnchor.id,
        action: 'cleanup',
        message: `任务完成，已清理 workspace（保留 artifacts）`
    }, manifest.logFile)

    return { stage: '', advanced: true, done: true, nextAction: '✅ 所有阶段已完成' }
}

// ==================== 查询当前状态 ====================

/**
 * 查询当前指令（不推进，不验证）
 * 用于断线恢复：告诉 LLM "你在哪一步，该做什么"
 */
export function getCurrentInstruction(
    manifest: AnchorManifest,
    cwd: string = manifest.cwd || process.cwd()
): AnchorInstruction {
    const state = readState(cwd, manifest.stateFile)

    if (!state) {
        return {
            stage: '',
            advanced: false,
            done: false,
            nextAction: '⚠️ 状态不存在，请先调用 init(task)'
        }
    }

    if (state.done) {
        return { stage: '', advanced: false, done: true, nextAction: '✅ 所有阶段已完成' }
    }

    const currentAnchor = manifest.anchors[state.currentAnchorIndex]
    return buildInstruction(manifest, currentAnchor, state, false, undefined)
}

/**
 * 构建给 LLM 的指令对象
 */
function buildInstruction(
    manifest: AnchorManifest,
    anchor: AnchorDefinition,
    state: AnchorState,
    advanced: boolean,
    verifyResult?: VerifyResult
): AnchorInstruction {
    const baseCwd = manifest.cwd || process.cwd()

    // 内联规则内容
    const rulesInline: RuleInline[] = []
    if (anchor.reads) {
        for (const readPath of anchor.reads) {
            const fullPath = join(baseCwd, readPath)
            if (existsSync(fullPath)) {
                try {
                    rulesInline.push({ source: readPath, content: readFileSync(fullPath, 'utf-8') })
                } catch {
                    rulesInline.push({ source: readPath, content: '⚠️ 规则文件读取失败' })
                }
            }
        }
    }

    // 内联上游 artifact（consumes 声明的数据）
    const artifactsInline: ArtifactInline[] = []
    if (anchor.consumes) {
        for (const key of anchor.consumes) {
            const art = state.artifacts[key]
            if (!art) {
                artifactsInline.push({ key, producedBy: '?', kind: 'value', content: `⚠️ 上游未产出 artifact: ${key}` })
                continue
            }
            let content = ''
            if (art.kind === 'file' && art.path) {
                const fp = join(baseCwd, art.path)
                content = existsSync(fp) ? safeRead(fp) : `⚠️ artifact 文件不存在: ${art.path}`
            } else {
                content = safeStringify(art.value)
            }
            artifactsInline.push({ key, producedBy: art.producedBy, kind: art.kind, path: art.path, content })
        }
    }

    const stageRecord = state.stages[state.currentAnchorIndex]
    const maxAttempts = resolveMaxAttempts(manifest, anchor)
    const attempts = stageRecord?.attempts ?? 0

    const nextAction = advanced
        ? `✅ 验证通过，已推进到 ${anchor.id} 阶段。按 brief 执行，完成后调用 next。`
        : verifyResult
            ? `❌ 验证未通过（${verifyResult.errors.length} 个错误，${attempts}/${maxAttempts} 次）。修复后重新调用 next。\n错误：\n${verifyResult.errors.slice(0, 10).join('\n')}`
            : `当前阶段: ${anchor.id}。按 brief 执行，完成后调用 next 推进。`

    return {
        stage: anchor.id,
        stageName: anchor.name,
        brief: anchor.brief,
        rulesInline: rulesInline.length > 0 ? rulesInline : undefined,
        artifactsInline: artifactsInline.length > 0 ? artifactsInline : undefined,
        produces: anchor.produces,
        emits: anchor.emits,
        allowedTools: anchor.allowedTools,
        subtasks: stageRecord?.subtasks,
        requiresSubtasks: anchor.requiresSubtasks,
        scratchDir: getWorkspaceDir(baseCwd, state.taskId, manifest.scratchDir),
        subagentPrompt: anchor.subagentPrompt,
        verifyHint: buildVerifyHint(anchor.verify),
        advanced,
        done: false,
        attempts,
        maxAttempts,
        verifyResult,
        nextAction
    }
}

/** 安全读文件 */
function safeRead(path: string): string {
    try {
        return readFileSync(path, 'utf-8')
    } catch {
        return '⚠️ 读取失败'
    }
}

/** 安全序列化 */
function safeStringify(value: unknown): string {
    try {
        return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    } catch {
        return String(value)
    }
}

/** 构建验证提示（只展示，真正执行在 verify.ts） */
function buildVerifyHint(verify?: AnchorDefinition['verify']): string | undefined {
    if (!verify) return undefined
    const parts: string[] = []
    if (verify.schema) parts.push('JSON Schema 校验')
    if (verify.lint) parts.push('ESLint')
    if (verify.tsc) parts.push('tsc --noEmit')
    if (verify.stylelint) parts.push('Stylelint')
    if (verify.build) parts.push('构建')
    if (verify.test) parts.push('单测')
    if (verify.custom) parts.push('自定义命令')
    if (verify.producesExist !== false && parts.length === 0) parts.push('产物存在性')
    return parts.length > 0 ? parts.join(' + ') + '（由引擎内部执行）' : undefined
}

// ==================== 重置 ====================

/**
 * 重置任务（删除状态文件 + 清理该任务的 scratch，从头开始）
 */
export function resetTask(
    manifest: AnchorManifest,
    cwd: string = manifest.cwd || process.cwd()
): void {
    const state = readState(cwd, manifest.stateFile)
    if (state?.taskId) {
        cleanupScratch(cwd, state.taskId, manifest.scratchDir, true)
    }

    const statePath = getStatePath(cwd, manifest.stateFile)
    if (existsSync(statePath)) {
        rmSync(statePath, { force: true })
    }

    appendLog(cwd, {
        timestamp: new Date().toISOString(),
        skill: manifest.name,
        task: state?.task || '',
        stage: state?.currentStage || '',
        action: 'reset',
        message: '任务已重置，状态与 scratch 已清理'
    }, manifest.logFile)
}
