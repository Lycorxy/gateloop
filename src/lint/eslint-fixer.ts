/**
 * ESLint 修复器
 *
 * 处理 ESLint 错误的自动修复逻辑
 * 从 fixer.ts 中抽取，减少主文件体积
 */

import { join } from 'node:path'
import { exists } from '../helpers'
import { exec } from '../helpers'
import type { FixResult, BatchFixResult, FixOptions, LintIssue } from './types'
import { detectLintConfig } from './extractor'
import { runLint } from './runner'

// ==================== 主导出函数 ====================

/**
 * 修复 ESLint 错误
 */
export async function fixESLint(
    patterns: string | string[],
    cwd?: string,
    options: FixOptions = {}
): Promise<BatchFixResult> {
    const startTime = Date.now()
    const config = await detectLintConfig(cwd)

    if (!config.hasEslint) {
        return {
            totalFiles: 0,
            successFiles: 0,
            failedFiles: 0,
            totalFixed: 0,
            totalRemaining: 0,
            results: [],
            duration: Date.now() - startTime
        }
    }

    // 获取 ESLint 可执行文件
    const eslintInfo = await getESLintPath(config.rootDir)

    if (!eslintInfo) {
        throw new Error('ESLint 未安装')
    }

    // 先运行验证，获取问题列表
    const lintResult = await runLint({
        patterns,
        cwd,
        source: 'eslint',
        cache: options.skipErrors
    })

    const results: FixResult[] = []

    // 按文件分组处理
    for (const fileResult of lintResult.results) {
        const fixResult = await fixESLintFile(
            fileResult.filePath,
            fileResult.issues,
            eslintInfo,
            config.rootDir,
            options
        )
        results.push(fixResult)
    }

    // 汇总结果
    return buildBatchFixResult(results, startTime)
}

/**
 * 修复单个文件的 ESLint 错误
 */
export async function fixESLintFile(
    filePath: string,
    issues: LintIssue[],
    eslintInfo: { command: string; prependArgs: string[] },
    rootDir: string,
    options: FixOptions
): Promise<FixResult> {
    const startTime = Date.now()
    const fixedIssues: Array<{ ruleName: string; line: number; column: number }> = []
    const unfixedIssues: Array<{ ruleName: string; line: number; column: number; reason: string }> =
        []

    // 按规则分组
    const issuesByRule = groupIssuesByRule(issues)

    // 如果指定了规则，只修复指定的规则
    const rulesToFix = options.rules
        ? Object.keys(issuesByRule).filter((rule) => options.rules!.includes(rule))
        : Object.keys(issuesByRule)

    // 逐个规则修复
    for (const ruleName of rulesToFix) {
        const ruleIssues = issuesByRule[ruleName]

        try {
            // 使用 ESLint --fix 修复特定规则
            const args = ['--fix', '--rule', `${ruleName}: off`]
            args.push(filePath)

            await exec(eslintInfo.command, [...eslintInfo.prependArgs, ...args], {
                cwd: rootDir,
                timeout: 30000
            })

            // 记录修复的问题
            for (const issue of ruleIssues) {
                if (issue.fixable) {
                    fixedIssues.push({
                        ruleName: issue.ruleName,
                        line: issue.line,
                        column: issue.column
                    })
                } else {
                    unfixedIssues.push({
                        ruleName: issue.ruleName,
                        line: issue.line,
                        column: issue.column,
                        reason: '不可自动修复'
                    })
                }
            }
        } catch (error) {
            // 记录未修复的问题
            for (const issue of ruleIssues) {
                unfixedIssues.push({
                    ruleName: issue.ruleName,
                    line: issue.line,
                    column: issue.column,
                    reason: `修复失败: ${error}`
                })
            }
        }
    }

    return {
        success: unfixedIssues.length === 0,
        filePath,
        fixedCount: fixedIssues.length,
        remainingCount: unfixedIssues.length,
        fixedIssues,
        unfixedIssues,
        duration: Date.now() - startTime
    }
}

// ==================== 辅助函数 ====================

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

    return getBinPath(rootDir, 'eslint')
}

/**
 * 按规则分组问题
 */
function groupIssuesByRule(issues: LintIssue[]): Record<string, LintIssue[]> {
    const grouped: Record<string, LintIssue[]> = {}

    for (const issue of issues) {
        if (!grouped[issue.ruleName]) {
            grouped[issue.ruleName] = []
        }
        grouped[issue.ruleName].push(issue)
    }

    return grouped
}

/**
 * 构建批量修复结果
 */
export function buildBatchFixResult(results: FixResult[], startTime: number): BatchFixResult {
    return {
        totalFiles: results.length,
        successFiles: results.filter((r) => r.success).length,
        failedFiles: results.filter((r) => !r.success).length,
        totalFixed: results.reduce((sum, r) => sum + r.fixedCount, 0),
        totalRemaining: results.reduce((sum, r) => sum + r.remainingCount, 0),
        results,
        duration: Date.now() - startTime
    }
}

/**
 * 获取 node_modules/.bin 下的可执行文件路径
 *
 * 优先使用 JS 入口（node 直接运行），跨平台避免 Windows .cmd 兼容问题
 */
async function getBinPath(
    rootDir: string,
    name: string
): Promise<{ command: string; prependArgs: string[] } | null> {
    // 已知工具的 JS 入口映射
    const jsEntryMap: Record<string, string> = {
        eslint: 'node_modules/eslint/bin/eslint.js',
        prettier: 'node_modules/prettier/bin/prettier.cjs',
        stylelint: 'node_modules/stylelint/bin/stylelint.mjs'
    }

    // 优先使用 JS 入口
    const jsEntry = jsEntryMap[name]
    if (jsEntry) {
        const jsPath = join(rootDir, jsEntry)
        if (await exists(jsPath)) {
            return { command: 'node', prependArgs: [jsPath] }
        }
    }

    // 回退到 .bin 下的可执行文件
    const binDir = join(rootDir, 'node_modules', '.bin')
    const execName = process.platform === 'win32' ? `${name}.cmd` : name
    const execPath = join(binDir, execName)

    if (await exists(execPath)) {
        return { command: execPath, prependArgs: [] }
    }

    // 尝试全局命令
    const { getCommandPath } = await import('../helpers')
    const globalPath = await getCommandPath(name)
    if (globalPath) {
        return { command: globalPath, prependArgs: [] }
    }

    return null
}

// 重新导出供其他模块使用
export { getBinPath }
