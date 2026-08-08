/**
 * ESLint 执行器
 *
 * 执行 ESLint 验证并解析输出结果
 * 从 runner.ts 中抽取，减少主文件体积
 */

import { join } from 'node:path'
import { exists } from '../helpers'
import { exec, getCommandPath } from '../helpers'
import type { LintIssue, LintResult, BatchLintResult } from './types'
import { detectLintConfig } from './extractor'

// ==================== 主导出函数 ====================

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
        return buildEmptyResult(startTime)
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

    return buildBatchResult(lintResults, startTime)
}

// ==================== 辅助函数 ====================

/**
 * 获取 ESLint 可执行文件路径
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
 * 解析 ESLint 输出
 */
function parseESLintOutput(result: { stdout: string; stderr: string }): LintResult[] {
    const results: LintResult[] = []

    try {
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

// ==================== 结果构建函数（供其他模块复用） ====================

/**
 * 构建空的批量结果
 */
export function buildEmptyResult(startTime: number): BatchLintResult {
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

/**
 * 构建批量结果
 */
export function buildBatchResult(results: LintResult[], startTime: number): BatchLintResult {
    return {
        totalFiles: results.length,
        successFiles: results.filter((r) => r.success).length,
        failedFiles: results.filter((r) => !r.success).length,
        totalIssues: results.reduce((sum, r) => sum + r.issues.length, 0),
        totalErrors: results.reduce((sum, r) => sum + r.errorCount, 0),
        totalWarnings: results.reduce((sum, r) => sum + r.warningCount, 0),
        fixableIssues: results.reduce((sum, r) => sum + r.fixableCount, 0),
        results,
        duration: Date.now() - startTime
    }
}
