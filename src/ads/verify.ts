/**
 * ADS 验证器 — 通过与否由 exit code 判定，不由模型自述
 *
 * 多个验证器 AND 关系，全部通过才算 PASS。
 * verify() 是唯一判定函数，exit code 模型改不了。
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
    JSONSchema
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
    state: AnchorState
): Promise<VerifyResult> {
    const startTime = Date.now()
    const checks: VerifyCheck[] = []
    const errors: string[] = []
    const verifyConfig = anchor.verify

    // 1. 产物存在性校验
    if (anchor.produces && anchor.produces.length > 0 && verifyConfig?.producesExist !== false) {
        const check = checkProducesExist(anchor.produces, cwd)
        checks.push(check)
        if (!check.passed) errors.push(...check.output?.split('\n').filter(Boolean) || [])
    }

    // 2. 产物 mtime 校验（防复用旧文件）
    // ★ 断点续跑修复：以"本轮尝试开始时间"(attemptStartedAt) 为基准，
    //   而非首次进入阶段的 startedAt。恢复任务/重做时 retryStage 会刷新
    //   attemptStartedAt，避免把上一轮产物误判为旧文件而永远卡死。
    if (anchor.produces && verifyConfig?.producesFresh) {
        const stageRecord = state.stages[state.currentAnchorIndex]
        const freshBase = stageRecord?.attemptStartedAt || stageRecord?.startedAt
        if (freshBase) {
            const check = checkProducesFresh(anchor.produces, cwd, freshBase)
            checks.push(check)
            if (!check.passed) errors.push(...check.output?.split('\n').filter(Boolean) || [])
        }
    }

    // 3. JSON Schema 校验
    if (verifyConfig?.schema) {
        const check = checkSchema(verifyConfig.schema, anchor.produces, cwd)
        checks.push(check)
        if (!check.passed) errors.push(`Schema 校验失败: ${check.output}`)
    }

    // 4. ESLint
    if (verifyConfig?.lint) {
        const lintCfg = verifyConfig.lint
        const check = await runCheck('ESLint', () => runLint(lintCfg, cwd))
        checks.push(check)
        if (!check.passed) errors.push(`ESLint: ${check.output?.slice(0, 500)}`)
    }

    // 5. TypeScript
    if (verifyConfig?.tsc) {
        const check = await runCheck('tsc', () => runTsc(cwd))
        checks.push(check)
        if (!check.passed) errors.push(`tsc: ${check.output?.slice(0, 500)}`)
    }

    // 6. Stylelint
    if (verifyConfig?.stylelint) {
        const stylelintCfg = verifyConfig.stylelint
        const check = await runCheck('Stylelint', () => runStylelint(stylelintCfg, cwd))
        checks.push(check)
        if (!check.passed) errors.push(`Stylelint: ${check.output?.slice(0, 500)}`)
    }

    // 7. 构建
    if (verifyConfig?.build) {
        const buildCfg = verifyConfig.build
        const check = await runCheck('Build', () => runBuild(buildCfg, cwd))
        checks.push(check)
        if (!check.passed) errors.push(`Build: ${check.output?.slice(0, 500)}`)
    }

    // 8. 单测
    if (verifyConfig?.test) {
        const testCfg = verifyConfig.test
        const check = await runCheck('Test', () => runTest(testCfg, cwd))
        checks.push(check)
        if (!check.passed) errors.push(`Test: ${check.output?.slice(0, 500)}`)
    }

    // 9. 自定义命令
    if (verifyConfig?.custom) {
        const cmds = Array.isArray(verifyConfig.custom) ? verifyConfig.custom : [verifyConfig.custom]
        for (const cmd of cmds) {
            const check = await runCheck(`Custom: ${cmd.slice(0, 50)}`, () => runCustom(cmd, cwd))
            checks.push(check)
            if (!check.passed) errors.push(`${cmd}: ${check.output?.slice(0, 500)}`)
        }
    }

    const passed = checks.every((c) => c.passed)
    return {
        passed,
        checks,
        errors,
        duration: Date.now() - startTime
    }
}

// ==================== 产物校验 ====================

/** 产物文件存在性校验 */
function checkProducesExist(produces: string[], cwd: string): VerifyCheck {
    const startTime = Date.now()
    const missing: string[] = []

    for (const pattern of produces) {
        const files = glob.sync(pattern, { cwd, absolute: true })
        if (files.length === 0) {
            // 不是 glob，检查是否是具体文件
            const fullPath = join(cwd, pattern)
            if (!existsSync(fullPath)) {
                missing.push(pattern)
            }
        }
    }

    return {
        name: '产物存在性',
        passed: missing.length === 0,
        output: missing.length === 0
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
        output: stale.length === 0
            ? '全部产物均为本阶段产出'
            : `旧文件: ${stale.join(', ')}`,
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
                if (files.length > 0) { jsonPath = files[0]; break }
                const fullPath = join(cwd, pattern)
                if (existsSync(fullPath)) { jsonPath = fullPath; break }
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

/** 简易 JSON Schema 校验 */
function validateSchema(data: unknown, schema: JSONSchema, path: string): string[] {
    const errors: string[] = []

    if (schema.type) {
        const actualType = Array.isArray(data) ? 'array' : typeof data
        if (actualType !== schema.type) {
            errors.push(`${path || 'root'}: 期望 ${schema.type}, 实际 ${actualType}`)
            return errors
        }
    }

    if (schema.type === 'object' && schema.properties) {
        if (typeof data !== 'object' || data === null) return errors

        // required 字段
        if (schema.required) {
            for (const field of schema.required) {
                if (!(field in (data as Record<string, unknown>))) {
                    errors.push(`${path || 'root'}.${field}: 缺少必填字段`)
                }
            }
        }

        // 递归校验 properties
        for (const [key, subSchema] of Object.entries(schema.properties)) {
            const value = (data as Record<string, unknown>)[key]
            if (value !== undefined) {
                errors.push(...validateSchema(value, subSchema, path ? `${path}.${key}` : key))
            }
        }
    }

    if (schema.type === 'array' && schema.items) {
        if (Array.isArray(data)) {
            data.forEach((item, i) => {
                errors.push(...validateSchema(item, schema.items!, `${path}[${i}]`))
            })
        }
    }

    return errors
}

// ==================== 命令执行验证器 ====================

/** 运行检查并包装为 VerifyCheck */
async function runCheck(name: string, fn: () => { passed: boolean; output: string }): Promise<VerifyCheck> {
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

/** 执行命令，exit 0 = 通过 */
function execCommand(command: string, cwd: string, timeout = 120000): { passed: boolean; output: string } {
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

/** ESLint */
function runLint(lint: boolean | { files?: string[] }, cwd: string): { passed: boolean; output: string } {
    const files = typeof lint === 'object' ? (lint.files?.join(' ') || '') : ''
    const cmd = `npx nut-lint run ${files}`.trim()
    return execCommand(cmd, cwd)
}

/** tsc --noEmit */
function runTsc(cwd: string): { passed: boolean; output: string } {
    return execCommand('npx tsc --noEmit', cwd)
}

/** Stylelint */
function runStylelint(stylelint: boolean | { files?: string[] }, cwd: string): { passed: boolean; output: string } {
    const files = typeof stylelint === 'object' ? (stylelint.files?.join(' ') || '') : '**/*.{css,scss}'
    const cmd = `npx stylelint "${files}"`.trim()
    return execCommand(cmd, cwd)
}

/** 构建 */
function runBuild(build: boolean | { command?: string }, cwd: string): { passed: boolean; output: string } {
    const cmd = typeof build === 'object' ? (build.command || 'npm run build') : 'npm run build'
    return execCommand(cmd, cwd)
}

/** 单测 */
function runTest(test: boolean | { command?: string }, cwd: string): { passed: boolean; output: string } {
    const cmd = typeof test === 'object' ? (test.command || 'npx vitest run') : 'npx vitest run'
    return execCommand(cmd, cwd)
}

/** 自定义命令 */
function runCustom(command: string, cwd: string): { passed: boolean; output: string } {
    return execCommand(command, cwd)
}
