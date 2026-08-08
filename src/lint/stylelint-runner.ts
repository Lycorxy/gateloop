/**
 * Stylelint 执行器
 *
 * 执行 Stylelint 验证并解析输出结果
 * 从 runner.ts 中抽取，减少主文件体积
 */

import { join } from 'node:path'
import { exists } from '../helpers'
import { exec, getCommandPath } from '../helpers'
import type { LintIssue, LintResult, BatchLintResult } from './types'
import { detectLintConfig } from './extractor'
import { buildEmptyResult, buildBatchResult } from './eslint-runner'

// ==================== 主导出函数 ====================

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
        return buildEmptyResult(startTime)
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

    return buildBatchResult(lintResults, startTime)
}

// ==================== 辅助函数 ====================

/**
 * 获取 Stylelint 可执行文件路径
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
 * 解析 Stylelint 输出
 */
function parseStylelintOutput(result: { stdout: string; stderr: string }): LintResult[] {
    const results: LintResult[] = []

    try {
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
