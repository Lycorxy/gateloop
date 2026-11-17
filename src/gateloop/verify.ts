/**
 * GateLoop 验证器 — 通过与否由 exit code 判定，不由模型自述
 *
 * 多个验证器 AND 关系，全部通过才算 PASS。
 * verify() 是唯一判定函数，exit code 模型改不了。
 *
 * 优化：命令类验证器（lint/tsc/stylelint/build/test/custom）并行执行，
 * 文件类校验（存在性/mtime/schema）先于命令类执行（快速失败）。
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { glob } from 'glob'
import type {
    AnchorDefinition,
    VerifyResult,
    VerifyCheck,
    AnchorState,
    JSONSchema,
    VerifyHooks,
    ReviewConfig,
    ReviewConclusion,
    ReviewVerdict
} from './types'


// ==================== 主验证入口 ====================

/**
 * 执行验证
 *
 * @param anchor 当前锚点定义
 * @param cwd 工作目录
 * @param state 当前状态（用于 producesFresh 校验）
 */
export async function verify(
    anchor: AnchorDefinition,
    cwd: string,
    state: AnchorState,
    hooks?: VerifyHooks,
    manifestDir?: string
): Promise<VerifyResult> {
    const startTime = Date.now()
    const verifyConfig = anchor.verify

    // ── 配置自检：modelWritable:false 必须配 produceScripts ──
    const configCheck = checkModelWritableConfig(verifyConfig)
    if (!configCheck.passed) {
        return {
            passed: false,
            checks: [configCheck],
            errors: collectErrors([configCheck]),
            duration: Date.now() - startTime
        }
    }

    // ── 阶段 0：产出型脚本（最先执行，产出 produces 声明的文件） ──
    // 解决"脚本产出型 anchor 与文件类校验顺序冲突"：原架构文件类校验先于
    // custom，首次进入时产物不存在即死锁。produceScripts 提前产出，再走文件类校验。
    const cmdTimeout = verifyConfig?.commandTimeoutMs ?? 120000
    const produceChecks = runProduceScripts(verifyConfig?.produceScripts, cwd, manifestDir, cmdTimeout)
    const producePassed = produceChecks.every((c) => c.passed)

    // autoEmit：produceScripts 全部成功后，引擎自动产出 artifact（免模型手动 emit）
    if (producePassed && verifyConfig?.autoEmit && hooks?.emit) {
        for (const [key, path] of Object.entries(verifyConfig.autoEmit)) {
            hooks.emit({ key, kind: 'file', path })
        }
    }

    // ── 阶段 1：文件类校验（produceScripts 成功才跑） ──
    const fileChecks = producePassed ? runFileChecks(anchor, verifyConfig, cwd, state) : []

    // 产出 + 文件类全过 → 才跑命令类（节省时间）
    const filePassed = producePassed && fileChecks.every((c) => c.passed)

    // ── 阶段 2+3：修复类 + 命令类校验 + 质量评审（文件类通过才跑，节省时间） ──
    const postChecks = filePassed
        ? await runPostFileChecks(verifyConfig, cwd, manifestDir, cmdTimeout)
        : []

    // ── 汇总结果 ──
    const checks = [...produceChecks, ...fileChecks, ...postChecks]
    const errors = collectErrors(checks)

    return {
        passed: checks.every((c) => c.passed),
        checks,
        errors,
        duration: Date.now() - startTime
    }
}

// ==================== 配置自检 ====================

/**
 * 配置自检：modelWritable:false 时必须配 produceScripts
 *
 * modelWritable:false 声明"产物由脚本产出，模型不应直接写"，
 * 若未配 produceScripts，则配置自相矛盾，直接 FAIL（防误配）。
 */
function checkModelWritableConfig(verifyConfig: AnchorDefinition['verify']): VerifyCheck {
    const startTime = Date.now()
    if (verifyConfig?.modelWritable === false) {
        const hasProduceScripts =
            verifyConfig.produceScripts && verifyConfig.produceScripts.length > 0
        if (!hasProduceScripts) {
            return {
                name: '配置自检',
                passed: false,
                output: 'modelWritable:false 时必须配 produceScripts（产物应由脚本产出）',
                duration: Date.now() - startTime
            }
        }
    }
    return {
        name: '配置自检',
        passed: true,
        output: '配置一致',
        duration: Date.now() - startTime
    }
}

// ==================== 产出型脚本（先于文件类校验） ====================

/**
 * 运行产出型脚本（串行，exit 0 才继续）
 *
 * 在文件类校验之前执行，负责产出 produces 声明的文件。
 * 任一失败立即停止（后续脚本可能依赖前序产物）。
 */
function runProduceScripts(
    scripts: string[] | undefined,
    cwd: string,
    manifestDir?: string,
    timeout = 120000
): VerifyCheck[] {
    if (!scripts || scripts.length === 0) return []

    const checks: VerifyCheck[] = []
    for (const rawCmd of scripts) {
        const startTime = Date.now()
        const result = execCommand(expandCommand(rawCmd, manifestDir), cwd, timeout)
        checks.push({
            name: `Produce: ${rawCmd.slice(0, 50)}`,
            passed: result.passed,
            output: result.output,
            duration: Date.now() - startTime
        })
        if (!result.passed) break
    }
    return checks
}

// ==================== 文件类校验（串行·快速失败） ====================

/**
 * 运行文件类校验：产物存在性 + 产物新鲜度 + Schema
 * 这三类校验很快（本地文件操作），串行执行以便快速失败。
 */
function runFileChecks(
    anchor: AnchorDefinition,
    verifyConfig: AnchorDefinition['verify'],
    cwd: string,
    state: AnchorState
): VerifyCheck[] {
    const checks: VerifyCheck[] = []

    // 1. 产物存在性校验
    if (anchor.produces && anchor.produces.length > 0 && verifyConfig?.producesExist !== false) {
        checks.push(checkProducesExist(anchor.produces, cwd))
    }

    // 2. 产物 mtime 校验（防复用旧文件）
    // ★ 断点续跑修复：以"本轮尝试开始时间"(attemptStartedAt) 为基准，
    //   而非首次进入阶段的 startedAt。恢复任务/重做时 retryStage 会刷新
    //   attemptStartedAt，避免把上一轮产物误判为旧文件而永远卡死。
    if (anchor.produces && verifyConfig?.producesFresh) {
        const stageRecord = state.stages[state.currentAnchorIndex]
        const freshBase = stageRecord?.attemptStartedAt || stageRecord?.startedAt
        if (freshBase) {
            checks.push(checkProducesFresh(anchor.produces, cwd, freshBase))
        }
    }

    // 3. JSON Schema 校验
    if (verifyConfig?.schema) {
        checks.push(checkSchema(verifyConfig.schema, anchor.produces, cwd))
    }

    return checks
}

// ==================== 命令类校验（并行执行） ====================

/**
 * 运行命令类验证器：tsc + build + test + custom
 *
 * 这些验证器相互独立，并行执行大幅缩短总耗时。
 * 例：tsc(3s) + custom(2s) + build(5s)
 *   串行 = 10s → 并行 ≈ 5s（受最慢项制约）
 */
async function runCommandChecks(
    verifyConfig: AnchorDefinition['verify'],
    cwd: string,
    manifestDir?: string,
    cmdTimeout = 120000
): Promise<VerifyCheck[]> {
    if (!verifyConfig) return []

    const tasks: Array<Promise<VerifyCheck>> = []

    // 标准验证器（条件 + 执行器）
    type CheckFn = () =>
        | { passed: boolean; output: string }
        | Promise<{ passed: boolean; output: string }>
    const standardChecks: Array<{ cond: unknown; name: string; run: CheckFn }> = [
        { cond: verifyConfig.tsc, name: 'tsc', run: () => runTsc(cwd) },
        {
            cond: verifyConfig.build,
            name: 'Build',
            run: () => runBuild(verifyConfig.build!, cwd, manifestDir, cmdTimeout)
        },
        {
            cond: verifyConfig.test,
            name: 'Test',
            run: () => runTest(verifyConfig.test!, cwd, manifestDir, cmdTimeout)
        }
    ]

    for (const { cond, name, run } of standardChecks) {
        if (cond) tasks.push(runCheck(name, run))
    }

    // custom 验证器（可多个）
    if (verifyConfig.custom) {
        const cmds = Array.isArray(verifyConfig.custom)
            ? verifyConfig.custom
            : [verifyConfig.custom]
        for (const cmd of cmds) {
            const label = cmd.slice(0, 50)
            tasks.push(
                runCheck(`Custom: ${label}`, () =>
                    runCustom(expandCommand(cmd, manifestDir), cwd, cmdTimeout)
                )
            )
        }
    }

    return Promise.all(tasks)
}

// ==================== 结果汇总 ====================

/**
 * 从检查结果中收集错误信息
 */
function collectErrors(checks: VerifyCheck[]): string[] {
    const errors: string[] = []
    for (const check of checks) {
        if (!check.passed) {
            const detail = check.output?.slice(0, 500) || ''
            errors.push(`${check.name}: ${detail}`)
        }
    }
    return errors
}

// ==================== 产物校验 ====================

/** 产物文件存在性校验 */
function checkProducesExist(produces: string[], cwd: string): VerifyCheck {
    const startTime = Date.now()
    const missing: string[] = []

    for (const pattern of produces) {
        const files = glob.sync(pattern, { cwd, absolute: true })
        if (files.length === 0) {
            const fullPath = join(cwd, pattern)
            if (!existsSync(fullPath)) {
                missing.push(pattern)
            }
        }
    }

    return {
        name: '产物存在性',
        passed: missing.length === 0,
        output:
            missing.length === 0
                ? `全部 ${produces.length} 个产物存在`
                : `缺失: ${missing.join(', ')}`,
        duration: Date.now() - startTime
    }
}

/** 产物 mtime 校验（防复用旧文件） */
function checkProducesFresh(produces: string[], cwd: string, startedAt: string): VerifyCheck {
    const startTime = Date.now()
    const stale: string[] = []
    const stageStart = new Date(startedAt).getTime()

    for (const pattern of produces) {
        const files = glob.sync(pattern, { cwd, absolute: true })
        const paths = files.length > 0 ? files : [join(cwd, pattern)]

        for (const filePath of paths) {
            if (existsSync(filePath)) {
                const mtime = statSync(filePath).mtimeMs
                if (mtime < stageStart) {
                    stale.push(`${filePath} (mtime 早于阶段开始)`)
                }
            }
        }
    }

    return {
        name: '产物新鲜度',
        passed: stale.length === 0,
        output: stale.length === 0 ? '全部产物均为本阶段产出' : `旧文件: ${stale.join(', ')}`,
        duration: Date.now() - startTime
    }
}

// ==================== Schema 校验 ====================

/** JSON Schema 校验产物结构 */
function checkSchema(schema: JSONSchema, produces: string[] | undefined, cwd: string): VerifyCheck {
    const startTime = Date.now()

    // 找到第一个 JSON 产物文件
    let jsonPath: string | null = null
    if (produces) {
        for (const pattern of produces) {
            if (pattern.endsWith('.json')) {
                const files = glob.sync(pattern, { cwd, absolute: true })
                if (files.length > 0) {
                    jsonPath = files[0]
                    break
                }
                const fullPath = join(cwd, pattern)
                if (existsSync(fullPath)) {
                    jsonPath = fullPath
                    break
                }
            }
        }
    }

    if (!jsonPath) {
        return {
            name: 'Schema 校验',
            passed: false,
            output: '未找到 JSON 产物文件',
            duration: Date.now() - startTime
        }
    }

    try {
        const data = JSON.parse(readFileSync(jsonPath, 'utf-8'))
        const errors = validateSchema(data, schema, '')
        return {
            name: 'Schema 校验',
            passed: errors.length === 0,
            output: errors.length === 0 ? 'Schema 校验通过' : errors.join('; '),
            duration: Date.now() - startTime
        }
    } catch (error) {
        return {
            name: 'Schema 校验',
            passed: false,
            output: `JSON 解析失败: ${(error as Error).message}`,
            duration: Date.now() - startTime
        }
    }
}

/** 简易 JSON Schema 校验（按类型分派） */
function validateSchema(data: unknown, schema: JSONSchema, path: string): string[] {
    const errors: string[] = []

    // 类型校验
    if (schema.type) {
        const typeError = checkType(data, schema.type, path)
        if (typeError) return [typeError]
    }

    // 按类型分派
    if (schema.type === 'object') {
        errors.push(...validateObject(data, schema, path))
    } else if (schema.type === 'array') {
        errors.push(...validateArray(data, schema, path))
    }

    return errors
}

/** 类型校验 */
function checkType(data: unknown, expected: string, path: string): string | null {
    if (expected === 'integer') {
        if (typeof data !== 'number' || !Number.isInteger(data)) {
            return `${path || 'root'}: 期望 integer, 实际 ${Array.isArray(data) ? 'array' : typeof data}`
        }
        return null
    }
    const actual = Array.isArray(data) ? 'array' : typeof data
    if (actual !== expected) {
        return `${path || 'root'}: 期望 ${expected}, 实际 ${actual}`
    }
    return null
}

/** object 类型校验：required + properties */
function validateObject(data: unknown, schema: JSONSchema, path: string): string[] {
    if (typeof data !== 'object' || data === null) return []

    const obj = data as Record<string, unknown>
    const errors = checkRequiredFields(obj, schema, path)
    errors.push(...checkProperties(obj, schema, path))
    // additionalProperties:false → 校验未声明字段（此前声明了但未实现）
    if (schema.additionalProperties === false && schema.properties) {
        const declared = new Set(Object.keys(schema.properties))
        for (const key of Object.keys(obj)) {
            if (!declared.has(key)) {
                errors.push(`${path || 'root'}.${key}: 未声明的字段（additionalProperties:false）`)
            }
        }
    }
    return errors
}

/** required 字段校验 */
function checkRequiredFields(
    obj: Record<string, unknown>,
    schema: JSONSchema,
    path: string
): string[] {
    if (!schema.required) return []
    const prefix = path || 'root'
    return schema.required
        .filter((field) => !(field in obj))
        .map((field) => `${prefix}.${field}: 缺少必填字段`)
}

/** properties 递归校验 */
function checkProperties(obj: Record<string, unknown>, schema: JSONSchema, path: string): string[] {
    if (!schema.properties) return []
    const errors: string[] = []
    for (const [key, subSchema] of Object.entries(schema.properties)) {
        const value = obj[key]
        if (value !== undefined) {
            errors.push(...validateSchema(value, subSchema, path ? `${path}.${key}` : key))
        }
    }
    return errors
}

/** array 类型校验：items 递归 */
function validateArray(data: unknown, schema: JSONSchema, path: string): string[] {
    if (!Array.isArray(data) || !schema.items) return []

    const errors: string[] = []
    data.forEach((item, i) => {
        errors.push(...validateSchema(item, schema.items!, `${path}[${i}]`))
    })
    return errors
}

// ==================== 命令执行验证器 ====================

/** 运行检查并包装为 VerifyCheck */
async function runCheck(
    name: string,
    fn: () => { passed: boolean; output: string } | Promise<{ passed: boolean; output: string }>
): Promise<VerifyCheck> {
    const startTime = Date.now()
    try {
        const result = await fn()
        return {
            name,
            passed: result.passed,
            output: result.output,
            duration: Date.now() - startTime
        }
    } catch (error) {
        return {
            name,
            passed: false,
            output: (error as Error).message,
            duration: Date.now() - startTime
        }
    }
}

/**
 * ★ 替换命令中的 ${skillDir} 占位符为 manifest 所在目录（skill 可移植）。
 * anchor.config.json 中的脚本命令写相对 skill 目录的路径时用此占位符，
 * 如：node ${skillDir}/scripts/inventory.mjs --output .specflow/context/inventory.json
 */
function expandCommand(cmd: string, manifestDir?: string): string {
    if (!manifestDir || !cmd.includes('${skillDir}')) return cmd
    return cmd.replaceAll('${skillDir}', manifestDir)
}

/** 执行命令，exit 0 = 通过 */
function execCommand(
    command: string,
    cwd: string,
    timeout = 120000
): { passed: boolean; output: string } {
    try {
        const output = execSync(command, {
            cwd,
            stdio: 'pipe',
            timeout,
            encoding: 'utf-8',
            env: { ...process.env, FORCE_COLOR: '0' }
        })
        return { passed: true, output: output.slice(0, 2000) }
    } catch (error) {
        const err = error as { stdout?: string; stderr?: string; message: string }
        const output = err.stdout || err.stderr || err.message
        return { passed: false, output: output.slice(0, 2000) }
    }
}

/** tsc --noEmit */
function runTsc(cwd: string): { passed: boolean; output: string } {
    return execCommand('npx tsc --noEmit', cwd)
}

/** 构建 */
function runBuild(
    build: boolean | { command?: string },
    cwd: string,
    manifestDir?: string,
    timeout = 120000
): { passed: boolean; output: string } {
    const cmd = typeof build === 'object' ? build.command || 'npm run build' : 'npm run build'
    return execCommand(expandCommand(cmd, manifestDir), cwd, timeout)
}

/** 单测 */
function runTest(
    test: boolean | { command?: string },
    cwd: string,
    manifestDir?: string,
    timeout = 120000
): { passed: boolean; output: string } {
    const cmd = typeof test === 'object' ? test.command || 'npx vitest run' : 'npx vitest run'
    return execCommand(expandCommand(cmd, manifestDir), cwd, timeout)
}

/** 自定义命令 */
function runCustom(
    command: string,
    cwd: string,
    timeout = 120000
): { passed: boolean; output: string } {
    return execCommand(command, cwd, timeout)
}

// ==================== 命令类 + 评审编排 ====================

/**
 * 运行阶段 2+3：命令类校验 + 结构化质量评审
 *
 * 文件类校验通过后才执行（节省时间）。
 * 命令类校验（tsc/build/test/custom）；质量评审串行（依赖评审结论产物文件）。
 */
async function runPostFileChecks(
    verifyConfig: AnchorDefinition['verify'] | undefined,
    cwd: string,
    manifestDir?: string,
    cmdTimeout = 120000
): Promise<VerifyCheck[]> {
    // 阶段 2：命令类校验
    const cmdChecks = await runCommandChecks(verifyConfig, cwd, manifestDir, cmdTimeout)

    // 阶段 3：质量评审
    const reviewCheck = runReviewCheck(verifyConfig?.review, cwd, manifestDir, cmdTimeout)
    return [...cmdChecks, ...(reviewCheck ? [reviewCheck] : [])]
}

// ==================== 结构化质量评审 ====================

/**
 * 运行结构化质量评审校验
 *
 * 引擎不判断"质量好坏"，只卡四道形式门禁（脚本客观可判，与质量内容无关）：
 * ① 完整性：结论必须恰好覆盖全部 checklist id（不许漏评、不许擅自增项）
 * ② script 项防伪：mode=script 的项，引擎自己重跑 command，
 *    模型写的 verdict 必须与真实 exit code 一致（彻底不信模型）
 * ③ model 项要证据：requireEvidence 时每项 evidence 必须含行号/符号引用
 *    （写"看起来没问题"这种空话 → FAIL）
 * ④ 阻断判定：任何 blocking 项 verdict=fail → 整体 FAIL（评出问题只能修，不能放行）
 *
 * checklist 内容由 skill 注入，引擎不含任何业务规则。
 *
 * @returns VerifyCheck；未配置评审时返回 null（不计入结果，避免噪音）
 */
function runReviewCheck(
    review: ReviewConfig | undefined,
    cwd: string,
    manifestDir?: string,
    cmdTimeout = 120000
): VerifyCheck | null {
    const startTime = Date.now()
    if (!review) return null

    // 读取评审结论产物
    const readResult = readReviewConclusion(review.output, cwd)
    if (!readResult.ok) {
        return {
            name: '质量评审',
            passed: false,
            output: readResult.error,
            duration: Date.now() - startTime
        }
    }

    const conclusion = readResult.conclusion
    const verdicts = conclusion.verdicts || []
    const verdictMap = new Map(verdicts.map((v) => [v.id, v]))

    const errors: string[] = []
    const blockingFails: string[] = []

    // ① 完整性门禁
    errors.push(...checkReviewCompleteness(review.checklist, verdicts, verdictMap))

    // ②③ 逐项校验 + ④ 阻断判定
    const requireEvidence = review.requireEvidence !== false
    for (const item of review.checklist) {
        const result = validateReviewItem(
            item,
            verdictMap.get(item.id),
            requireEvidence,
            cwd,
            manifestDir,
            cmdTimeout
        )
        errors.push(...result.errors)
        if (result.blockingFail) blockingFails.push(item.id)
    }

    if (blockingFails.length > 0) {
        errors.push(`阻断项未通过: ${blockingFails.join(', ')}（需修复后重新评审）`)
    }

    const output =
        errors.length === 0 ? `评审通过（${review.checklist.length} 项）` : errors.join('\n')
    return {
        name: '质量评审',
        passed: errors.length === 0,
        output,
        duration: Date.now() - startTime
    }
}

/** 读取并解析评审结论产物 */
function readReviewConclusion(
    output: string,
    cwd: string
): { ok: true; conclusion: ReviewConclusion } | { ok: false; error: string } {
    const outputPath = join(cwd, output)
    if (!existsSync(outputPath)) {
        return {
            ok: false,
            error: `评审结论产物不存在: ${output}（请按 checklist 逐条评审并写入结论）`
        }
    }
    try {
        return { ok: true, conclusion: JSON.parse(readFileSync(outputPath, 'utf-8')) }
    } catch (error) {
        return { ok: false, error: `评审结论产物 JSON 解析失败: ${(error as Error).message}` }
    }
}

/** ① 完整性门禁：结论必须恰好覆盖全部 checklist id */
function checkReviewCompleteness(
    checklist: ReviewConfig['checklist'],
    verdicts: ReviewConclusion['verdicts'],
    verdictMap: Map<string, ReviewVerdict>
): string[] {
    const errors: string[] = []
    const checklistIds = checklist.map((c) => c.id)
    const missing = checklistIds.filter((id) => !verdictMap.has(id))
    if (missing.length > 0) {
        errors.push(`评审结论不完整，缺少: ${missing.join(', ')}`)
    }
    const extra = verdicts.filter((v) => !checklistIds.includes(v.id))
    if (extra.length > 0) {
        errors.push(`评审结论含未声明项: ${extra.map((v) => v.id).join(', ')}`)
    }
    return errors
}

/** ②③ 逐项校验 + ④ 阻断判定 */
function validateReviewItem(
    item: ReviewConfig['checklist'][number],
    v: ReviewVerdict | undefined,
    requireEvidence: boolean,
    cwd: string,
    manifestDir?: string,
    cmdTimeout = 120000
): { errors: string[]; blockingFail: boolean } {
    const errors: string[] = []
    if (!v) return { errors, blockingFail: false } // 已在完整性门禁报错

    // verdict 值合法性
    if (v.verdict !== 'pass' && v.verdict !== 'fail') {
        errors.push(`评审项 ${item.id}: verdict 非法（${v.verdict}），应为 pass/fail`)
        return { errors, blockingFail: false }
    }

    // ② script 项防伪：引擎重跑 command 核对
    if (item.mode === 'script') {
        errors.push(...checkScriptItem(item, v, cwd, manifestDir, cmdTimeout))
    }

    // ③ model 项要证据
    if (item.mode === 'model' && requireEvidence) {
        errors.push(...checkModelEvidence(item, v))
    }

    // ④ 阻断判定
    const blocking = item.blocking !== false // 默认 true
    return { errors, blockingFail: blocking && v.verdict === 'fail' }
}

/** ② script 项防伪：引擎重跑 command，模型 verdict 必须与真实 exit code 一致 */
function checkScriptItem(
    item: ReviewConfig['checklist'][number],
    v: ReviewVerdict,
    cwd: string,
    manifestDir?: string,
    timeout = 120000
): string[] {
    if (!item.command) {
        return [`评审项 ${item.id}: mode=script 但缺 command（防伪无法执行，请补配置）`]
    }
    const real = execCommand(expandCommand(item.command, manifestDir), cwd, timeout)
    const realVerdict = real.passed ? 'pass' : 'fail'
    if (v.verdict !== realVerdict) {
        return [
            `评审项 ${item.id}: script 结论造假（模型写 ${v.verdict}，引擎重跑为 ${realVerdict}）`
        ]
    }
    return []
}

/** ③ model 项证据校验：evidence 必须含行号/符号引用 */
function checkModelEvidence(item: ReviewConfig['checklist'][number], v: ReviewVerdict): string[] {
    const ev = (v.evidence || '').trim()
    if (!ev) return [`评审项 ${item.id}: model 项缺少 evidence`]
    if (!hasEvidenceReference(ev)) {
        return [
            `评审项 ${item.id}: evidence 缺少具体引用（行号/符号名），当前: "${ev.slice(0, 60)}"`
        ]
    }
    return []
}

/**
 * 证据引用检测：evidence 是否包含行号或符号引用
 *
 * 匹配模式：
 * - 行号：L12 / :12 / L12-40 / 行12 / 第12行
 * - 文件路径/符号：含扩展名（.tsx/.ts/.js/.go/.py 等）
 *
 * 用于把模型从"看起来没问题"这种空话，逼到"填一张跑不了的表"。
 */
function hasEvidenceReference(evidence: string): boolean {
    // ① 文件引用 + 行号组合（如 a.ts:12 / components/a.tsx:12-40 / a.ts L12 / a.ts 行12）——最强证据形态
    if (/[\w./\\-]+\.\w{1,5}\s*(?::|L|行|第)\s*\d+/.test(evidence)) return true
    // ② 行号引用与文件引用同时出现（L12 且含扩展名 token）
    if (/L\d+|行\s*\d+|第\s*\d+/.test(evidence) && /[\w./\\-]+\.\w{1,5}\b/.test(evidence)) return true
    // 其余一律拒绝：纯版本号（1.2.3）、纯行号（L12）、裸文件名（a.ts）都不能作为有效证据
    return false
}
