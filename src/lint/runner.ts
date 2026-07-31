/**
 * Lint 执行器
 *
 * 执行 ESLint、Stylelint 和 TypeScript 类型检查
 */

import { join } from 'node:path'
import { exists } from '../helpers'
import { exec, getCommandPath } from '../helpers'
import type { LintIssue, LintResult, BatchLintResult, LintInput } from './types'
import { detectLintConfig } from './extractor'

// ==================== ESLint 执行 ====================

/**
 * 执行 ESLint 验证
 */
export async function runESLint(
    patterns: string | string[],
    cwd?: string,
    options: { cache?: boolean; progress?: boolean } = {}
): Promise<BatchLintResult> {
    const startTime = Date.now()
    const config = await detectLintConfig(cwd)

    if (!config.hasEslint) {
        return {
            totalFiles: 0,
            successFiles: 0,
            failedFiles: 0,
            totalIssues: 0,
            totalErrors: 0,
            totalWarnings: 0,
            fixableIssues: 0,
            results: [],
            duration: Date.now() - startTime
        }
    }

    // 获取 ESLint 可执行文件
    const eslintInfo = await getESLintPath(config.rootDir)

    if (!eslintInfo) {
        throw new Error('ESLint 未安装')
    }

    // 构建命令
    const patternArray = Array.isArray(patterns) ? patterns : [patterns]
    const args = [...eslintInfo.prependArgs, '--format', 'json', '--no-color']

    if (options.cache === false) {
        args.push('--no-cache')
    }

    args.push(...patternArray)

    // 执行 ESLint
    const result = await exec(eslintInfo.command, args, {
        cwd: config.rootDir,
        timeout: 60000
    })

    // 解析结果
    const lintResults = parseESLintOutput(result)

    // 汇总结果
    const batchResult: BatchLintResult = {
        totalFiles: lintResults.length,
        successFiles: lintResults.filter((r) => r.success).length,
        failedFiles: lintResults.filter((r) => !r.success).length,
        totalIssues: lintResults.reduce((sum, r) => sum + r.issues.length, 0),
        totalErrors: lintResults.reduce((sum, r) => sum + r.errorCount, 0),
        totalWarnings: lintResults.reduce((sum, r) => sum + r.warningCount, 0),
        fixableIssues: lintResults.reduce((sum, r) => sum + r.fixableCount, 0),
        results: lintResults,
        duration: Date.now() - startTime
    }

    return batchResult
}

/**
 * 获取 ESLint 可执行文件路径
 *
 * 优先使用 JS 入口（node 直接运行），跨平台避免 Windows .cmd 兼容问题
 */
async function getESLintPath(
    rootDir: string
): Promise<{ command: string; prependArgs: string[] } | null> {
    // 优先使用 JS 入口，跨平台最稳定
    const jsPath = join(rootDir, 'node_modules', 'eslint', 'bin', 'eslint.js')
    if (await exists(jsPath)) {
        return { command: 'node', prependArgs: [jsPath] }
    }

    // 回退到 .bin 下的可执行文件
    const binPath = join(rootDir, 'node_modules', '.bin')
    const execName = process.platform === 'win32' ? 'eslint.cmd' : 'eslint'
    const execPath = join(binPath, execName)
    if (await exists(execPath)) {
        return { command: execPath, prependArgs: [] }
    }

    // 尝试全局命令
    const globalPath = await getCommandPath('eslint')
    if (globalPath) {
        return { command: globalPath, prependArgs: [] }
    }

    return null
}

/**
 * 获取 Stylelint 可执行文件路径
 *
 * 优先使用 JS 入口（node 直接运行），跨平台避免 Windows .cmd 兼容问题
 */
async function getStylelintPath(
    rootDir: string
): Promise<{ command: string; prependArgs: string[] } | null> {
    // 优先使用 JS 入口，跨平台最稳定
    const jsPath = join(rootDir, 'node_modules', 'stylelint', 'bin', 'stylelint.mjs')
    if (await exists(jsPath)) {
        return { command: 'node', prependArgs: [jsPath] }
    }

    // 回退到 .bin 下的可执行文件
    const binPath = join(rootDir, 'node_modules', '.bin')
    const execName = process.platform === 'win32' ? 'stylelint.cmd' : 'stylelint'
    const execPath = join(binPath, execName)
    if (await exists(execPath)) {
        return { command: execPath, prependArgs: [] }
    }

    // 尝试全局命令
    const globalPath = await getCommandPath('stylelint')
    if (globalPath) {
        return { command: globalPath, prependArgs: [] }
    }

    return null
}

/**
 * 解析 ESLint 输出
 */
function parseESLintOutput(result: { stdout: string; stderr: string }): LintResult[] {
    const results: LintResult[] = []

    try {
        // ESLint 输出 JSON 格式的结果
        const jsonOutput = JSON.parse(result.stdout)

        for (const fileResult of jsonOutput) {
            const issues: LintIssue[] = []

            for (const message of fileResult.messages) {
                issues.push({
                    ruleName: message.ruleId || 'unknown',
                    source: 'eslint',
                    severity: message.severity === 2 ? 'error' : 'warning',
                    message: message.message,
                    filePath: fileResult.filePath,
                    line: message.line,
                    column: message.column,
                    endLine: message.endLine,
                    endColumn: message.endColumn,
                    fixable: message.fix !== undefined
                })
            }

            results.push({
                success: fileResult.errorCount === 0,
                filePath: fileResult.filePath,
                issues,
                errorCount: fileResult.errorCount,
                warningCount: fileResult.warningCount,
                fixableCount: fileResult.fixableErrorCount + fileResult.fixableWarningCount,
                duration: 0
            })
        }
    } catch {
        // JSON 解析失败时返回空结果
    }

    return results
}

// ==================== Stylelint 执行 ====================

/**
 * 执行 Stylelint 验证
 */
export async function runStylelint(
    patterns: string | string[],
    cwd?: string,
    options: { cache?: boolean; progress?: boolean } = {}
): Promise<BatchLintResult> {
    const startTime = Date.now()
    const config = await detectLintConfig(cwd)

    if (!config.hasStylelint) {
        return {
            totalFiles: 0,
            successFiles: 0,
            failedFiles: 0,
            totalIssues: 0,
            totalErrors: 0,
            totalWarnings: 0,
            fixableIssues: 0,
            results: [],
            duration: Date.now() - startTime
        }
    }

    // 获取 Stylelint 可执行文件
    const stylelintInfo = await getStylelintPath(config.rootDir)

    if (!stylelintInfo) {
        throw new Error('Stylelint 未安装')
    }

    // 构建命令
    const patternArray = Array.isArray(patterns) ? patterns : [patterns]
    const args = [...stylelintInfo.prependArgs, '--formatter', 'json', '--no-color']

    if (options.cache === false) {
        args.push('--no-cache')
    }

    args.push(...patternArray)

    // 执行 Stylelint
    const result = await exec(stylelintInfo.command, args, {
        cwd: config.rootDir,
        timeout: 60000
    })

    // 解析结果
    const lintResults = parseStylelintOutput(result)

    // 汇总结果
    const batchResult: BatchLintResult = {
        totalFiles: lintResults.length,
        successFiles: lintResults.filter((r) => r.success).length,
        failedFiles: lintResults.filter((r) => !r.success).length,
        totalIssues: lintResults.reduce((sum, r) => sum + r.issues.length, 0),
        totalErrors: lintResults.reduce((sum, r) => sum + r.errorCount, 0),
        totalWarnings: lintResults.reduce((sum, r) => sum + r.warningCount, 0),
        fixableIssues: lintResults.reduce((sum, r) => sum + r.fixableCount, 0),
        results: lintResults,
        duration: Date.now() - startTime
    }

    return batchResult
}

/**
 * 解析 Stylelint 输出
 */
function parseStylelintOutput(result: { stdout: string; stderr: string }): LintResult[] {
    const results: LintResult[] = []

    try {
        // Stylelint 输出 JSON 格式的结果
        const jsonOutput = JSON.parse(result.stdout)

        for (const fileResult of jsonOutput) {
            const issues: LintIssue[] = []

            for (const warning of fileResult.warnings) {
                issues.push({
                    ruleName: warning.rule,
                    source: 'stylelint',
                    severity: warning.severity === 'error' ? 'error' : 'warning',
                    message: warning.text,
                    filePath: fileResult.source,
                    line: warning.line,
                    column: warning.column,
                    endLine: warning.endLine,
                    endColumn: warning.endColumn,
                    fixable: false // Stylelint 的 fixable 信息在另一个字段
                })
            }

            results.push({
                success: issues.length === 0,
                filePath: fileResult.source,
                issues,
                errorCount: issues.filter((i) => i.severity === 'error').length,
                warningCount: issues.filter((i) => i.severity === 'warning').length,
                fixableCount: issues.filter((i) => i.fixable).length,
                duration: 0
            })
        }
    } catch {
        // JSON 解析失败时返回空结果
    }

    return results
}

// ==================== TypeScript 类型检查 ====================

/**
 * 执行 TypeScript 类型检查（tsc --noEmit）
 *
 * 注意：TypeScript 类型错误不支持自动修复，需手动修改代码。
 * 此函数仅返回诊断信息，帮助 AI 理解并修复类型问题。
 */
export async function runTypeScript(
    patterns: string | string[],
    cwd?: string
): Promise<BatchLintResult> {
    const startTime = Date.now()
    const config = await detectLintConfig(cwd)

    if (!config.hasTypeScript) {
        return {
            totalFiles: 0,
            successFiles: 0,
            failedFiles: 0,
            totalIssues: 0,
            totalErrors: 0,
            totalWarnings: 0,
            fixableIssues: 0,
            results: [],
            duration: Date.now() - startTime
        }
    }

    // 获取 tsc 路径
    const tscInfo = await getTscPath(config.rootDir)
    if (!tscInfo) {
        return {
            totalFiles: 0,
            successFiles: 0,
            failedFiles: 0,
            totalIssues: 0,
            totalErrors: 0,
            totalWarnings: 0,
            fixableIssues: 0,
            results: [],
            duration: Date.now() - startTime
        }
    }

    // 构建 tsconfig 路径
    const tsconfigPath = config.eslintConfig?.parserOptions?.project
        ? join(config.rootDir, String(config.eslintConfig.parserOptions.project))
        : join(config.rootDir, 'tsconfig.json')
    const hasTsconfig = await exists(tsconfigPath)

    // 构建命令：tsc --noEmit --pretty false
    const args = hasTsconfig ? ['--project', tsconfigPath] : []

    try {
        await exec(tscInfo.command, [...tscInfo.prependArgs, '--noEmit', '--pretty', 'false', ...args], {
            cwd: config.rootDir,
            timeout: 120000  // tsc 可能较慢
        })

        // tsc 返回非零退出码时会 throw，但我们在 catch 中处理
        // 如果这里执行到，说明没有错误
        return {
            totalFiles: 0,
            successFiles: 0,
            failedFiles: 0,
            totalIssues: 0,
            totalErrors: 0,
            totalWarnings: 0,
            fixableIssues: 0,
            results: [],
            duration: Date.now() - startTime
        }
    } catch (error: unknown) {
        const err = error as { stdout?: string; stderr?: string }
        const output = err.stdout || err.stderr || ''

        // 解析 tsc 输出
        const lintResults = parseTscOutput(output, config.rootDir)
        const patterns_arr = Array.isArray(patterns) ? patterns : [patterns]

        // 如果指定了文件模式，过滤结果
        const filtered = patterns_arr.length > 0 && patterns_arr[0] !== '.'
            ? lintResults.filter(r => patterns_arr.some(p => r.filePath.includes(p.replace(/[*?]/g, ''))))
            : lintResults

        return {
            totalFiles: filtered.length,
            successFiles: filtered.filter(r => r.success).length,
            failedFiles: filtered.filter(r => !r.success).length,
            totalIssues: filtered.reduce((sum, r) => sum + r.issues.length, 0),
            totalErrors: filtered.reduce((sum, r) => sum + r.errorCount, 0),
            totalWarnings: filtered.reduce((sum, r) => sum + r.warningCount, 0),
            fixableIssues: 0,  // TypeScript 错误不可自动修复
            results: filtered,
            duration: Date.now() - startTime
        }
    }
}

/**
 * 获取 TypeScript 编译器路径
 */
async function getTscPath(
    rootDir: string
): Promise<{ command: string; prependArgs: string[] } | null> {
    // 优先使用本地安装的 tsc
    const localTsc = join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc')
    if (await exists(localTsc)) {
        return { command: localTsc, prependArgs: [] }
    }

    // 回退到 npx
    const globalPath = await getCommandPath('tsc')
    if (globalPath) {
        return { command: globalPath, prependArgs: [] }
    }

    // 尝试通过 npx 运行
    try {
        const npxName = process.platform === 'win32' ? 'npx.cmd' : 'npx'
        const npxPath = await getCommandPath(npxName) || join(rootDir, 'node_modules', '.bin', npxName)
        if (await exists(npxPath)) {
            return { command: npxPath, prependArgs: ['tsc'] }
        }
    } catch {
        // 不可用
    }

    return null
}

/**
 * 解析 tsc --noEmit 输出
 *
 * 格式: src/file.ts(10,5): error TS2345: Argument of type 'string' is not assignable...
 */
function parseTscOutput(output: string, rootDir: string): LintResult[] {
    const fileMap = new Map<string, LintIssue[]>()

    // 匹配 tsc 错误/警告行
    const lineReg = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/gm
    let match: RegExpExecArray | null

    while ((match = lineReg.exec(output)) !== null) {
        const [, filePath, lineStr, colStr, severity, tsCode, message] = match
        const relPath = filePath.replace(rootDir.replace(/\\/g, '/'), '').replace(/^[\\/]+/, '')

        const issue: LintIssue = {
            ruleName: tsCode,
            source: 'typescript',
            severity: severity === 'error' ? 'error' : 'warning',
            message: message.trim(),
            filePath: relPath,
            line: parseInt(lineStr, 10),
            column: parseInt(colStr, 10),
            fixable: false  // TS 错误不可自动修复
        }

        if (!fileMap.has(relPath)) {
            fileMap.set(relPath, [])
        }
        fileMap.get(relPath)!.push(issue)
    }

    // 转换为 LintResult[]
    const results: LintResult[] = []
    for (const [filePath, issues] of fileMap) {
        results.push({
            success: issues.length === 0,
            filePath,
            issues,
            errorCount: issues.filter(i => i.severity === 'error').length,
            warningCount: issues.filter(i => i.severity === 'warning').length,
            fixableCount: 0,
            duration: 0
        })
    }

    return results
}

// ==================== 统一执行接口 ====================

/**
 * 执行 Lint 验证（统一入口：ESLint + Stylelint + TypeScript）
 */
export async function runLint(input: LintInput): Promise<BatchLintResult> {
    const { patterns, cwd, source, cache, progress } = input

    let results: BatchLintResult = {
        totalFiles: 0,
        successFiles: 0,
        failedFiles: 0,
        totalIssues: 0,
        totalErrors: 0,
        totalWarnings: 0,
        fixableIssues: 0,
        results: [],
        duration: 0
    }

    // 执行 ESLint
    if (!source || source === 'eslint') {
        const eslintResults = await runESLint(patterns, cwd, { cache, progress })
        results = mergeBatchResults(results, eslintResults)
    }

    // 执行 Stylelint
    if (!source || source === 'stylelint') {
        const stylelintResults = await runStylelint(patterns, cwd, { cache, progress })
        results = mergeBatchResults(results, stylelintResults)
    }

    // 执行 TypeScript 类型检查
    if (!source || source === 'typescript') {
        const tsResults = await runTypeScript(patterns, cwd)
        results = mergeBatchResults(results, tsResults)
    }

    return results
}

/**
 * 合并批量结果
 */
function mergeBatchResults(a: BatchLintResult, b: BatchLintResult): BatchLintResult {
    return {
        totalFiles: a.totalFiles + b.totalFiles,
        successFiles: a.successFiles + b.successFiles,
        failedFiles: a.failedFiles + b.failedFiles,
        totalIssues: a.totalIssues + b.totalIssues,
        totalErrors: a.totalErrors + b.totalErrors,
        totalWarnings: a.totalWarnings + b.totalWarnings,
        fixableIssues: a.fixableIssues + b.fixableIssues,
        results: [...a.results, ...b.results],
        duration: a.duration + b.duration
    }
}
