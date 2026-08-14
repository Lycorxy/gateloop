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

import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, rmSync } from 'node:fs'
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
    SubTask,
    VerifyHooks,
    ContextItem,
    HookContext,
    AnchorHooks,
    ContextArchive,
    AnchorEvent
} from './types'
import {
    generateTaskId,
    initScratch,
    cleanupScratch,
    gcScratch,
    getWorkspaceDir
} from './workspace'
import { readMemory, writeMemory, checkMemoryWritten, type MemoryHooks } from './memory'

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
    cwd: string = manifest.cwd || process.cwd(),
    anchorHooks?: AnchorHooks
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

    appendLog(
        cwd,
        {
            timestamp: now,
            skill: manifest.name,
            task,
            stage: firstAnchor?.id || '',
            action: 'init',
            message: `任务初始化: ${task} (taskId=${taskId})${recycled.length ? `, GC 回收 ${recycled.length} 个残留目录` : ''}`
        },
        manifest.logFile
    )

    // ★ 统一事件流：节点开始（第一个阶段）
    if (firstAnchor) {
        emitEvent(anchorHooks, {
            type: 'stage_start',
            stageId: firstAnchor.id,
            stageName: firstAnchor.name,
            timestamp: now
        })
    }

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

    appendLog(
        cwd,
        {
            timestamp: now,
            skill: manifest.name,
            task: state.task,
            stage: stageRecord.anchorId,
            action: 'subtask',
            message: `拆分 ${subtasks.length} 个子任务，当前共 ${existing.length} 个`
        },
        manifest.logFile
    )

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

    appendLog(
        cwd,
        {
            timestamp: now,
            skill: manifest.name,
            task: state.task,
            stage: stageRecord!.anchorId,
            action: 'subtask',
            message: `子任务完成: ${subtaskId}`
        },
        manifest.logFile
    )

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

    appendLog(
        cwd,
        {
            timestamp: now,
            skill: manifest.name,
            task: state.task,
            stage: producedBy,
            action: 'artifact',
            message: `产出 artifact: ${artifact.key} (${artifact.kind})`
        },
        manifest.logFile
    )

    return state.artifacts
}

/**
 * ★ 补丁A：回写一条决策记忆（供 CLI mem-write 命令调用）
 *
 * 落本地 store（确定性事实源）+ MCP（若注入）。writesMemory 门禁以本地 store 为准。
 */
export async function writeMemoryEntry(
    manifest: AnchorManifest,
    key: string,
    value: unknown,
    cwd: string = manifest.cwd || process.cwd(),
    memoryHooks?: MemoryHooks
): Promise<void> {
    await writeMemory(key, value, cwd, manifest.memory, memoryHooks)

    const state = readState(cwd, manifest.stateFile)
    appendLog(
        cwd,
        {
            timestamp: new Date().toISOString(),
            skill: manifest.name,
            task: state?.task || '',
            stage: state?.currentStage || '',
            action: 'artifact',
            message: `回写决策记忆: ${key}`
        },
        manifest.logFile
    )
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
    verifyFn: (
        anchor: AnchorDefinition,
        cwd: string,
        state: AnchorState,
        hooks?: VerifyHooks
    ) => Promise<VerifyResult>,
    cwd: string = manifest.cwd || process.cwd(),
    memoryHooks?: MemoryHooks,
    anchorHooks?: AnchorHooks
): Promise<AnchorInstruction> {
    const state = readState(cwd, manifest.stateFile)

    if (!state) {
        return notInitialized()
    }

    if (state.done) {
        return allDone()
    }

    const currentAnchor = manifest.anchors[state.currentAnchorIndex]
    if (!currentAnchor) {
        return allDone()
    }

    const stageRecord = state.stages[state.currentAnchorIndex]

    // ★ 前置门禁 1：子任务闭环校验
    const subtaskError = checkSubtasks(currentAnchor, stageRecord)
    if (subtaskError) {
        return buildInstruction(
            manifest,
            currentAnchor,
            state,
            false,
            subtaskError,
            cwd,
            memoryHooks
        )
    }

    // ★ 核心防作弊：强制重跑验证
    logStageEvent(
        cwd,
        manifest,
        state,
        currentAnchor.id,
        'verify',
        undefined,
        `验证阶段: ${currentAnchor.id}`
    )

    // autoEmit 钩子：produceScripts 成功后更新 state.artifacts 并持久化
    const verifyHooks: VerifyHooks = {
        emit: (artifact) => {
            state.artifacts[artifact.key] = {
                key: artifact.key,
                producedBy: currentAnchor.id,
                kind: artifact.kind,
                path: artifact.path,
                value: artifact.value,
                producedAt: new Date().toISOString()
            }
            writeState(cwd, state, manifest.stateFile)
        }
    }

    const verifyResult = await verifyFn(currentAnchor, cwd, state, verifyHooks)

    // ★ 前置门禁 2：emits 校验（并入 verifyResult）
    checkEmits(currentAnchor, verifyResult, state)

    // ★ 前置门禁 3（补丁A）：writesMemory 校验——本 anchor 声明的记忆必须已回写
    checkMemory(currentAnchor, verifyResult, cwd, manifest.memory)

    stageRecord.attempts++
    stageRecord.verifyResult = verifyResult

    const maxAttempts = resolveMaxAttempts(manifest, currentAnchor)

    if (!verifyResult.passed) {
        return handleFailure(
            cwd,
            manifest,
            state,
            currentAnchor,
            stageRecord,
            verifyResult,
            maxAttempts,
            memoryHooks,
            anchorHooks
        )
    }

    return handleSuccess(
        cwd,
        manifest,
        state,
        currentAnchor,
        stageRecord,
        verifyResult,
        memoryHooks,
        anchorHooks
    )
}

// ==================== doNext 子函数 ====================

/** 状态不存在时的返回 */
function notInitialized(): AnchorInstruction {
    return {
        stage: '',
        advanced: false,
        done: false,
        nextAction: '⚠️ 状态不存在，请先调用 init(task)'
    }
}

/** 全部完成时的返回 */
function allDone(): AnchorInstruction {
    return { stage: '', advanced: false, done: true, nextAction: '✅ 所有阶段已完成' }
}

/**
 * 前置门禁 1：子任务闭环校验
 * @returns 失败时返回 VerifyResult，通过时返回 undefined
 */
function checkSubtasks(
    anchor: AnchorDefinition,
    stageRecord: StageRecord | undefined
): VerifyResult | undefined {
    if (!anchor.requiresSubtasks) return undefined

    const subtasks = stageRecord?.subtasks || []
    if (subtasks.length === 0) {
        return {
            passed: false,
            checks: [],
            errors: ['本阶段要求先拆分子任务（requiresSubtasks），请先调用 addSubtasks'],
            duration: 0
        }
    }

    const pending = subtasks.filter((s) => s.status !== 'done')
    if (pending.length > 0) {
        return {
            passed: false,
            checks: [],
            errors: [
                `还有 ${pending.length} 个子任务未完成: ${pending.map((s) => s.id).join(', ')}`
            ],
            duration: 0
        }
    }

    return undefined
}

/**
 * 前置门禁 2：emits 校验
 * 将缺失的 artifact 并入 verifyResult（仅在 verify 通过时才检查）
 */
function checkEmits(
    anchor: AnchorDefinition,
    verifyResult: VerifyResult,
    state: AnchorState
): void {
    if (!verifyResult.passed || !anchor.emits || anchor.emits.length === 0) return

    const missing = anchor.emits.filter((key) => !state.artifacts[key])
    if (missing.length > 0) {
        verifyResult.passed = false
        verifyResult.errors.push(
            `未产出声明的 artifact: ${missing.join(', ')}（请调用 emitArtifact）`
        )
        verifyResult.checks.push({
            name: 'Artifact 产出',
            passed: false,
            output: `缺失: ${missing.join(', ')}`
        })
    }
}

/**
 * 前置门禁 3（补丁A）：writesMemory 校验
 *
 * 本 anchor 声明的决策记忆 key 必须已回写本地 store，否则不许推进。
 * 保证"本轮结论沉淀到跨任务记忆"这件事不被模型跳过（类比 checkEmits）。
 * 仅在 verify 通过时才检查。
 */
function checkMemory(
    anchor: AnchorDefinition,
    verifyResult: VerifyResult,
    cwd: string,
    memoryConfig: AnchorManifest['memory']
): void {
    if (!verifyResult.passed || !anchor.writesMemory || anchor.writesMemory.length === 0) return

    const missing = checkMemoryWritten(anchor.writesMemory, cwd, memoryConfig)
    if (missing.length > 0) {
        verifyResult.passed = false
        verifyResult.errors.push(
            `未回写声明的记忆: ${missing.join(', ')}（请调用 nut ads mem-write <key> <value>）`
        )
        verifyResult.checks.push({
            name: '记忆回写',
            passed: false,
            output: `缺失: ${missing.join(', ')}`
        })
    }
}

/**
 * 处理验证失败：熔断判定 or 记录失败 + 返回修复指令
 */
async function handleFailure(
    cwd: string,
    manifest: AnchorManifest,
    state: AnchorState,
    anchor: AnchorDefinition,
    stageRecord: StageRecord,
    verifyResult: VerifyResult,
    maxAttempts: number,
    memoryHooks?: MemoryHooks,
    anchorHooks?: AnchorHooks
): Promise<AnchorInstruction> {
    // ★ 熔断判定
    if (stageRecord.attempts >= maxAttempts) {
        stageRecord.status = 'escalated'
        stageRecord.escalated = true

        // ★ 补丁B：熔断跳转（onEscalate）——用于回滚/降级到指定 anchor
        const jumpInst = tryEscalateJump(cwd, manifest, state, anchor, verifyResult, anchorHooks)
        if (jumpInst) return jumpInst

        writeState(cwd, state, manifest.stateFile)

        // ★ 统一事件流：熔断（出错通知）
        emitEvent(anchorHooks, {
            type: 'escalate',
            stageId: anchor.id,
            stageName: anchor.name,
            timestamp: new Date().toISOString(),
            attempts: stageRecord.attempts,
            errors: verifyResult.errors
        })

        logStageEvent(
            cwd,
            manifest,
            state,
            anchor.id,
            'escalate',
            verifyResult,
            `连续失败 ${stageRecord.attempts} 次，触发熔断`
        )

        const inst = await buildInstruction(
            manifest,
            anchor,
            state,
            false,
            verifyResult,
            cwd,
            memoryHooks,
            anchorHooks
        )
        inst.escalate = true
        inst.nextAction = `🛑 连续失败 ${stageRecord.attempts}/${maxAttempts} 次，已熔断。需人工介入或降级方案。可调用 reset 重来，或修正 manifest 后 retry。`
        return inst
    }

    stageRecord.status = 'failed'
    writeState(cwd, state, manifest.stateFile)

    // ★ 统一事件流：节点验证失败（出错通知，将重试）
    emitEvent(anchorHooks, {
        type: 'stage_verify_fail',
        stageId: anchor.id,
        stageName: anchor.name,
        timestamp: new Date().toISOString(),
        attempts: stageRecord.attempts,
        errors: verifyResult.errors
    })

    logStageEvent(
        cwd,
        manifest,
        state,
        anchor.id,
        'verify',
        verifyResult,
        `验证失败: ${verifyResult.errors.length} 个错误 (${stageRecord.attempts}/${maxAttempts})`
    )

    return buildInstruction(
        manifest,
        anchor,
        state,
        false,
        verifyResult,
        cwd,
        memoryHooks,
        anchorHooks
    )
}

/**
 * ★ 补丁B：熔断跳转（onEscalate）
 *
 * 声明了 onEscalate 时，熔断不停机，而是跳转到目标 anchor（回滚/降级）。
 * 带环检测：目标 anchor 被跳入次数超 maxJumps 时放弃跳转、正常停在 escalate 防死循环。
 *
 * @returns 成功跳转时返回目标 anchor 的指令；不跳转返回 undefined（走原熔断停机逻辑）
 */
function tryEscalateJump(
    cwd: string,
    manifest: AnchorManifest,
    state: AnchorState,
    anchor: AnchorDefinition,
    verifyResult: VerifyResult,
    anchorHooks?: AnchorHooks
): AnchorInstruction | undefined {
    if (!anchor.onEscalate) return undefined

    const targetIndex = manifest.anchors.findIndex((a) => a.id === anchor.onEscalate)
    if (targetIndex < 0) return undefined

    const targetStage = state.stages[targetIndex]
    if (!targetStage) return undefined

    // 捕获跳转前当前 anchor 的尝试次数（事件上报用，跳转后 index 会变）
    const currentAttempts = state.stages[state.currentAnchorIndex]?.attempts ?? 0

    // 环检测：目标被跳入次数超阈值 → 放弃跳转，走原停机逻辑
    const maxJumps = manifest.maxJumps ?? 3
    const jumps = (targetStage.jumpCount ?? 0) + 1
    if (jumps > maxJumps) {
        logStageEvent(
            cwd,
            manifest,
            state,
            anchor.id,
            'escalate',
            verifyResult,
            `onEscalate 跳转到 ${anchor.onEscalate} 超过 maxJumps=${maxJumps}，放弃跳转，停机熔断`
        )
        return undefined
    }

    const now = new Date().toISOString()
    // 重置目标 anchor 为新一轮，并回退当前指针
    targetStage.jumpCount = jumps
    targetStage.status = 'in_progress'
    targetStage.attempts = 0
    targetStage.startedAt = now
    targetStage.attemptStartedAt = now
    targetStage.escalated = false
    state.currentAnchorIndex = targetIndex
    state.currentStage = manifest.anchors[targetIndex].id
    writeState(cwd, state, manifest.stateFile)

    // ★ 统一事件流：熔断回滚（出错通知）+ 目标节点重新开始
    const targetAnchor = manifest.anchors[targetIndex]
    emitEvent(anchorHooks, {
        type: 'escalate',
        stageId: anchor.id,
        stageName: anchor.name,
        timestamp: now,
        attempts: currentAttempts,
        errors: verifyResult.errors,
        nextStage: targetAnchor.id
    })
    emitEvent(anchorHooks, {
        type: 'stage_start',
        stageId: targetAnchor.id,
        stageName: targetAnchor.name,
        timestamp: now
    })

    logStageEvent(
        cwd,
        manifest,
        state,
        anchor.id,
        'escalate',
        verifyResult,
        `熔断回滚：${anchor.id} → ${anchor.onEscalate}（第 ${jumps}/${maxJumps} 次跳转）`
    )

    const inst = buildInstructionSync(
        manifest,
        manifest.anchors[targetIndex],
        state,
        false,
        undefined
    )
    inst.nextAction = `🔄 ${anchor.id} 熔断，已回滚到 ${anchor.onEscalate} 重做（第 ${jumps}/${maxJumps} 次）。按 brief 修复后调用 next。`
    return inst
}

/**
 * ★ 补丁B：解析下一个 anchor 索引（onPass 跳转 or 默认 +1）
 */
function resolveNextIndex(
    manifest: AnchorManifest,
    state: AnchorState,
    anchor: AnchorDefinition
): number {
    if (anchor.onPass) {
        return manifest.anchors.findIndex((a) => a.id === anchor.onPass)
    }
    return state.currentAnchorIndex + 1
}

/** 推进日志消息（拆出以避免嵌套三元） */
function buildAdvanceMessage(
    anchor: AnchorDefinition,
    nextAnchor: AnchorDefinition | undefined
): string {
    if (!nextAnchor) return '任务完成'
    if (anchor.onPass) return `跳转到: ${nextAnchor.id}（onPass）`
    return `推进到: ${nextAnchor.id}`
}

/**
 * 处理验证成功：标记完成，推进到下一阶段 or 完成任务
 */
async function handleSuccess(
    cwd: string,
    manifest: AnchorManifest,
    state: AnchorState,
    anchor: AnchorDefinition,
    stageRecord: StageRecord,
    verifyResult: VerifyResult,
    memoryHooks?: MemoryHooks,
    anchorHooks?: AnchorHooks
): Promise<AnchorInstruction> {
    const now = new Date().toISOString()

    stageRecord.status = 'passed'
    stageRecord.completedAt = now

    // ★ 补丁B：正向跳转（onPass）——支持非线性编排（条件分支），默认下一个
    const nextIndex = resolveNextIndex(manifest, state, anchor)
    const nextAnchor = nextIndex >= 0 ? manifest.anchors[nextIndex] : undefined

    if (nextAnchor && state.stages[nextIndex]) {
        // 跳转（非 +1）时累加目标的 jumpCount 供环检测
        if (anchor.onPass && nextIndex !== state.currentAnchorIndex + 1) {
            state.stages[nextIndex].jumpCount = (state.stages[nextIndex].jumpCount ?? 0) + 1
        }
        state.currentAnchorIndex = nextIndex
        state.currentStage = nextAnchor.id
        state.stages[nextIndex].status = 'in_progress'
        state.stages[nextIndex].startedAt = now
        state.stages[nextIndex].attemptStartedAt = now
    } else {
        state.done = true
    }

    writeState(cwd, state, manifest.stateFile)

    // ★ 通用钩子层：上下文存档（防信息衰减）+ afterAnchor 钩子
    const archive = buildContextArchive(anchor, verifyResult)
    saveContextArchive(cwd, archive)
    if (anchorHooks?.afterAnchor) {
        try {
            const hookCtx = buildHookContext(anchor, state, cwd)
            await anchorHooks.afterAnchor(hookCtx, verifyResult, archive)
        } catch {
            // 钩子失败不阻断流程
        }
    }

    // ★ 统一事件流：节点完成 / 流程完成 / 推进到下一节点
    emitStageCompleteEvents(anchor, stageRecord, nextAnchor, now, anchorHooks)

    logStageEvent(
        cwd,
        manifest,
        state,
        anchor.id,
        'advance',
        verifyResult,
        buildAdvanceMessage(anchor, nextAnchor)
    )

    if (nextAnchor) {
        return buildInstruction(
            manifest,
            nextAnchor,
            state,
            true,
            undefined,
            cwd,
            memoryHooks,
            anchorHooks
        )
    }

    // 全部完成 → 清理 workspace（保留 artifacts 供审计）
    cleanupScratch(cwd, state.taskId, manifest.scratchDir, false)
    logStageEvent(
        cwd,
        manifest,
        state,
        anchor.id,
        'cleanup',
        undefined,
        '任务完成，已清理 workspace（保留 artifacts）'
    )

    return { stage: '', advanced: true, done: true, nextAction: '✅ 所有阶段已完成' }
}

// ==================== 日志辅助 ====================

/**
 * 构造并追加一条阶段事件日志
 * 消除 doNext 中重复的 appendLog 构造代码
 */
function logStageEvent(
    cwd: string,
    manifest: AnchorManifest,
    state: AnchorState,
    stage: string,
    action: LogEntry['action'],
    verifyResult: VerifyResult | undefined,
    message: string
): void {
    appendLog(
        cwd,
        {
            timestamp: new Date().toISOString(),
            skill: manifest.name,
            task: state.task,
            stage,
            action,
            verifyResult,
            message
        },
        manifest.logFile
    )
}

// ==================== 查询当前状态 ====================

/**
 * 查询当前指令（不推进，不验证）
 * 用于断线恢复：告诉 LLM "你在哪一步，该做什么"
 */
export async function getCurrentInstruction(
    manifest: AnchorManifest,
    cwd: string = manifest.cwd || process.cwd(),
    memoryHooks?: MemoryHooks,
    anchorHooks?: AnchorHooks
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
    return buildInstruction(
        manifest,
        currentAnchor,
        state,
        false,
        undefined,
        cwd,
        memoryHooks,
        anchorHooks
    )
}

/**
 * 构建给 LLM 的指令对象（async：可读入决策记忆内联）
 */
async function buildInstruction(
    manifest: AnchorManifest,
    anchor: AnchorDefinition,
    state: AnchorState,
    advanced: boolean,
    verifyResult: VerifyResult | undefined,
    cwd: string = manifest.cwd || process.cwd(),
    memoryHooks?: MemoryHooks,
    anchorHooks?: AnchorHooks
): Promise<AnchorInstruction> {
    // ★ 通用钩子层：beforeAnchor 注入上下文（影响分析/知识库/figma等）
    const contextInline = await runBeforeAnchor(anchor, state, cwd, anchorHooks)
    // ★ 通用钩子层：readsContext 读入上游上下文存档（防信息衰减）
    const contextArchiveInline = inlineContextArchive(anchor, cwd)

    const inst = buildInstructionSync(
        manifest,
        anchor,
        state,
        advanced,
        verifyResult,
        contextInline,
        contextArchiveInline
    )

    // ★ 补丁A：读入决策记忆内联（readsMemory → memoryInline）
    if (anchor.readsMemory && anchor.readsMemory.length > 0) {
        const mem = await readMemory(anchor.readsMemory, cwd, manifest.memory, memoryHooks)
        if (mem.length > 0) inst.memoryInline = mem
    }

    return inst
}

/** 非空数组返回自身，空数组/undefined 返回 undefined */
function orUndefined<T>(arr: T[] | undefined): T[] | undefined {
    return arr && arr.length > 0 ? arr : undefined
}

/** 构建委派子 skill 的 brief 提示 */
function buildBrief(anchor: AnchorDefinition): string | undefined {
    return anchor.delegateSkill
        ? `【本阶段委派子 skill：use_skill ${anchor.delegateSkill}】\n引擎不信"说调了"，将通过下方 verify 校验该 skill 的确定性产物证明其真跑。\n\n${anchor.brief ?? ''}`
        : anchor.brief
}

/**
 * 同步组装指令核心（不含 async 的 memory 读入）
 *
 * 抽出供 tryEscalateJump 等同步路径复用；memory 内联由 async 版 buildInstruction 追加。
 */
function buildInstructionSync(
    manifest: AnchorManifest,
    anchor: AnchorDefinition,
    state: AnchorState,
    advanced: boolean,
    verifyResult?: VerifyResult,
    contextInline?: ContextItem[],
    contextArchiveInline?: ContextArchive[]
): AnchorInstruction {
    const baseCwd = manifest.cwd || process.cwd()

    const rulesInline = inlineRules(anchor, baseCwd)
    const artifactsInline = inlineArtifacts(anchor, state, baseCwd)

    const stageRecord = state.stages[state.currentAnchorIndex]
    const maxAttempts = resolveMaxAttempts(manifest, anchor)
    const attempts = stageRecord?.attempts ?? 0
    const nextAction = buildNextAction(anchor, advanced, verifyResult, attempts, maxAttempts)

    const brief = buildBrief(anchor)

    return {
        stage: anchor.id,
        stageName: anchor.name,
        brief,
        rulesInline: orUndefined(rulesInline),
        artifactsInline: orUndefined(artifactsInline),
        contextInline: orUndefined(contextInline),
        contextArchiveInline: orUndefined(contextArchiveInline),
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

/** 内联规则文件内容（reads → rulesInline） */
function inlineRules(anchor: AnchorDefinition, baseCwd: string): RuleInline[] {
    const rulesInline: RuleInline[] = []
    if (!anchor.reads) return rulesInline

    for (const readPath of anchor.reads) {
        const fullPath = join(baseCwd, readPath)
        if (!existsSync(fullPath)) continue
        try {
            rulesInline.push({ source: readPath, content: readFileSync(fullPath, 'utf-8') })
        } catch {
            rulesInline.push({ source: readPath, content: '⚠️ 规则文件读取失败' })
        }
    }
    return rulesInline
}

/** 内联上游 artifact（consumes → artifactsInline） */
function inlineArtifacts(
    anchor: AnchorDefinition,
    state: AnchorState,
    baseCwd: string
): ArtifactInline[] {
    const artifactsInline: ArtifactInline[] = []
    if (!anchor.consumes) return artifactsInline

    for (const key of anchor.consumes) {
        const art = state.artifacts[key]
        if (!art) {
            artifactsInline.push({
                key,
                producedBy: '?',
                kind: 'value',
                content: `⚠️ 上游未产出 artifact: ${key}`
            })
            continue
        }
        const content = resolveArtifactContent(art, baseCwd)
        artifactsInline.push({
            key,
            producedBy: art.producedBy,
            kind: art.kind,
            path: art.path,
            content
        })
    }
    return artifactsInline
}

/** 解析 artifact 内容：文件类读文件，值类序列化 */
function resolveArtifactContent(art: Artifact, baseCwd: string): string {
    if (art.kind === 'file' && art.path) {
        const fp = join(baseCwd, art.path)
        return existsSync(fp) ? safeRead(fp) : `⚠️ artifact 文件不存在: ${art.path}`
    }
    return safeStringify(art.value)
}

// ==================== 通用钩子层（上下文存档 + 生命周期钩子） ====================

const DEFAULT_ARCHIVE_FILE = join('.specflow', 'context', 'archive.jsonl')

/** 构建上下文存档（anchor 完成时自动构建） */
function buildContextArchive(anchor: AnchorDefinition, verifyResult: VerifyResult): ContextArchive {
    return {
        anchorId: anchor.id,
        anchorName: anchor.name,
        consumed: anchor.consumes || [],
        emitted: anchor.emits || [],
        produced: anchor.produces || [],
        verifyChecks: verifyResult.checks,
        completedAt: new Date().toISOString()
    }
}

/** 存档上下文到本地 JSONL（防信息衰减的确定性事实源） */
function saveContextArchive(cwd: string, archive: ContextArchive): void {
    const path = join(cwd, DEFAULT_ARCHIVE_FILE)
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, JSON.stringify(archive) + '\n', 'utf-8')
}

/** 读取上游 anchor 的上下文存档（readsContext → contextArchiveInline） */
function readContextArchives(anchorIds: string[], cwd: string): ContextArchive[] {
    if (!anchorIds || anchorIds.length === 0) return []
    const path = join(cwd, DEFAULT_ARCHIVE_FILE)
    if (!existsSync(path)) return []

    const result: ContextArchive[] = []
    const lines = readFileSync(path, 'utf-8')
        .split('\n')
        .filter((l) => l.trim())
    for (const line of lines) {
        try {
            const archive = JSON.parse(line) as ContextArchive
            if (anchorIds.includes(archive.anchorId)) {
                result.push(archive)
            }
        } catch {
            // skip malformed lines
        }
    }
    return result
}

/** 内联上游上下文存档（readsContext → contextArchiveInline） */
function inlineContextArchive(anchor: AnchorDefinition, cwd: string): ContextArchive[] | undefined {
    if (!anchor.readsContext || anchor.readsContext.length === 0) return undefined
    return readContextArchives(anchor.readsContext, cwd)
}

/** 构建钩子上下文（传给 beforeAnchor/afterAnchor 的运行时信息） */
function buildHookContext(anchor: AnchorDefinition, state: AnchorState, cwd: string): HookContext {
    const artifacts: Record<string, Artifact> = {}
    if (anchor.consumes) {
        for (const key of anchor.consumes) {
            if (state.artifacts[key]) {
                artifacts[key] = state.artifacts[key]
            }
        }
    }
    return {
        anchorId: anchor.id,
        anchorName: anchor.name,
        cwd,
        state,
        artifacts,
        anchor
    }
}

/** 调用 beforeAnchor 钩子（注入上下文，如影响分析/知识库/figma） */
async function runBeforeAnchor(
    anchor: AnchorDefinition,
    state: AnchorState,
    cwd: string,
    anchorHooks?: AnchorHooks
): Promise<ContextItem[] | undefined> {
    if (!anchorHooks?.beforeAnchor) return undefined
    try {
        const ctx = buildHookContext(anchor, state, cwd)
        return await anchorHooks.beforeAnchor(ctx)
    } catch {
        return undefined
    }
}

/**
 * ★ 触发统一事件流（fire-and-forget，通知不阻断流程）
 *
 * 引擎在状态转换关键节点触发事件，外部通过 onEvent 钩子接收。
 * 采用 fire-and-forget：通知失败（钩子抛错/未注入）静默吞掉，
 * 绝不因通知问题中断主流程。
 */
function emitEvent(anchorHooks: AnchorHooks | undefined, event: AnchorEvent): void {
    if (!anchorHooks?.onEvent) return
    Promise.resolve(anchorHooks.onEvent(event)).catch(() => {
        // 通知失败不阻断主流程
    })
}

/** 节点完成/流程完成/推进到下一节点的事件上报（拆出以降低 handleSuccess 复杂度） */
function emitStageCompleteEvents(
    anchor: AnchorDefinition,
    stageRecord: StageRecord,
    nextAnchor: AnchorDefinition | undefined,
    now: string,
    anchorHooks?: AnchorHooks
): void {
    if (nextAnchor) {
        emitEvent(anchorHooks, {
            type: 'stage_complete',
            stageId: anchor.id,
            stageName: anchor.name,
            timestamp: now,
            attempts: stageRecord.attempts,
            nextStage: nextAnchor.id
        })
        emitEvent(anchorHooks, {
            type: 'stage_start',
            stageId: nextAnchor.id,
            stageName: nextAnchor.name,
            timestamp: now
        })
    } else {
        emitEvent(anchorHooks, {
            type: 'done',
            stageId: anchor.id,
            stageName: anchor.name,
            timestamp: now,
            attempts: stageRecord.attempts
        })
    }
}

/** 构建 nextAction 文本 */
function buildNextAction(
    anchor: AnchorDefinition,
    advanced: boolean,
    verifyResult: VerifyResult | undefined,
    attempts: number,
    maxAttempts: number
): string {
    if (advanced) {
        return `✅ 验证通过，已推进到 ${anchor.id} 阶段。按 brief 执行，完成后调用 next。`
    }
    if (verifyResult) {
        return `❌ 验证未通过（${verifyResult.errors.length} 个错误，${attempts}/${maxAttempts} 次）。修复后重新调用 next。\n错误：\n${verifyResult.errors.slice(0, 10).join('\n')}`
    }
    return `当前阶段: ${anchor.id}。按 brief 执行，完成后调用 next 推进。`
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

    const checks: Array<[unknown, string]> = [
        [verify.schema, 'JSON Schema 校验'],
        [verify.lintFix, 'ESLint Fix（nut lint fix --write）'],
        [verify.lint, 'ESLint'],
        [verify.tsc, 'tsc --noEmit'],
        [verify.stylelint, 'Stylelint'],
        [verify.build, '构建'],
        [verify.test, '单测'],
        [verify.custom, '自定义命令'],
        [verify.fileSize, '文件规模（行数/函数/复杂度）'],
        [verify.prettier, 'Prettier 格式'],
        [verify.review, '结构化质量评审（逐条 verdict+evidence）']
    ]

    const parts = checks.filter(([cond]) => cond).map(([, label]) => label)

    if (verify.producesExist !== false && parts.length === 0) {
        parts.push('产物存在性')
    }

    // 评审详情：让模型知道要评什么、结论写到哪里、用什么格式
    // 不告诉模型这些，review 门禁会因产物不存在永远 FAIL
    if (verify.review) {
        const items = verify.review.checklist.map((c) => {
            const tag = c.mode === 'script' ? '脚本判定' : '模型评审'
            const block = c.blocking === false ? '（非阻断）' : ''
            return `  - [${tag}] ${c.id}: ${c.rule}${block}`
        })
        parts.push(
            `质量评审清单（逐条给 verdict[pass/fail]+evidence，结论写入 ${verify.review.output}，` +
                `格式 {"verdicts":[{"id","mode","verdict","evidence"}]}）:\n${items.join('\n')}`
        )
    }

    return parts.length > 0 ? `${parts.join(' + ')}（由引擎内部执行）` : undefined
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

    appendLog(
        cwd,
        {
            timestamp: new Date().toISOString(),
            skill: manifest.name,
            task: state?.task || '',
            stage: state?.currentStage || '',
            action: 'reset',
            message: '任务已重置，状态与 scratch 已清理'
        },
        manifest.logFile
    )
}
