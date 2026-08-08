/**
 * Lint 修复器（统一入口）
 *
 * 自动修复 ESLint、Stylelint 和 TypeScript 错误
 * 具体修复逻辑已拆分到独立模块
 */

import type { BatchFixResult, FixInput, FixOptions } from './types'
// 导入各工具的修复器
import { fixESLint, fixESLintFile } from './eslint-fixer'
import { fixStylelint, fixStylelintFile } from './stylelint-fixer'
import { fixTypeScript } from './ts-fixer'
import { detectFormatConfig } from '../format/formatter'
import { exec } from '../helpers'
import { getBinPath } from './eslint-fixer'

// ==================== 重新导出各工具修复器 ====================

export { fixESLint, fixESLintFile }
export { fixStylelint, fixStylelintFile }
export { fixTypeScript }

// ==================== 统一修复接口 ====================

/**
 * 修复 Lint + TypeScript 错误
 */
export async function fixLint(input: FixInput): Promise<BatchFixResult> {
    const { patterns, cwd, source, options } = input

    let results: BatchFixResult = {
        totalFiles: 0,
        successFiles: 0,
        failedFiles: 0,
        totalFixed: 0,
        totalRemaining: 0,
        results: [],
        duration: 0
    }

    // 修复 ESLint 错误
    if (!source || source === 'eslint') {
        const eslintResults = await fixESLint(patterns, cwd, options)
        results = mergeFixResults(results, eslintResults)
    }

    // 修复 Stylelint 错误
    if (!source || source === 'stylelint') {
        const stylelintResults = await fixStylelint(patterns, cwd, options)
        results = mergeFixResults(results, stylelintResults)
    }

    // TypeScript 类型诊断（不可自动修复，报告问题）
    if (!source || source === 'typescript') {
        const tsResults = await fixTypeScript(patterns, cwd)
        results = mergeFixResults(results, tsResults)
    }

    return results
}

/**
 * 合并修复结果
 */
function mergeFixResults(a: BatchFixResult, b: BatchFixResult): BatchFixResult {
    return {
        totalFiles: a.totalFiles + b.totalFiles,
        successFiles: a.successFiles + b.successFiles,
        failedFiles: a.failedFiles + b.failedFiles,
        totalFixed: a.totalFixed + b.totalFixed,
        totalRemaining: a.totalRemaining + b.totalRemaining,
        results: [...a.results, ...b.results],
        duration: a.duration + b.duration
    }
}

// ==================== 格式化 + 修复 ====================

/**
 * 格式化并修复
 * 先自动格式化（类似 VSCode 保存时自动格式化），再修复 lint 错误
 */
export async function formatAndFix(
    patterns: string | string[],
    cwd?: string,
    options: FixOptions & { formatter?: 'prettier' | 'eslint' | 'both' } = {}
): Promise<{ format: BatchFixResult; fix: BatchFixResult }> {
    // 第一步：格式化
    const formatResult = await formatFiles(patterns, cwd, options.formatter)

    // 第二步：修复
    const fixResult = await fixLint({
        patterns,
        cwd,
        options
    })

    return {
        format: formatResult,
        fix: fixResult
    }
}

/**
 * 格式化文件
 *
 * 使用 Prettier 和/或 ESLint 对指定模式的文件进行格式化
 */
async function formatFiles(
    patterns: string | string[],
    cwd?: string,
    formatter?: 'prettier' | 'eslint' | 'both'
): Promise<BatchFixResult> {
    const startTime = Date.now()
    const config = await detectFormatConfig(cwd)
    const rootDir = cwd || config.rootDir

    const patternArray = Array.isArray(patterns) ? patterns : [patterns]

    if (patternArray.length === 0) {
        return emptyFixResult(startTime)
    }

    let successFiles = 0
    let failedFiles = 0

    if (shouldUseTool(formatter, 'prettier', config.hasPrettier)) {
        const result = await formatWithTool(rootDir, 'prettier', config, patternArray)
        successFiles += result.success
        failedFiles += result.failed
    }

    if (shouldUseTool(formatter, 'eslint', config.hasEslint)) {
        const result = await formatWithTool(rootDir, 'eslint', config, patternArray)
        successFiles += result.success
        failedFiles += result.failed
    }

    return {
        totalFiles: patternArray.length,
        successFiles,
        failedFiles,
        totalFixed: successFiles,
        totalRemaining: failedFiles,
        results: [],
        duration: Date.now() - startTime
    }
}

function emptyFixResult(startTime: number): BatchFixResult {
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

function shouldUseTool(
    formatter: 'prettier' | 'eslint' | 'both' | undefined,
    tool: 'prettier' | 'eslint',
    hasConfig: boolean
): boolean {
    if (!hasConfig) return false
    return !formatter || formatter === tool || formatter === 'both'
}

async function formatWithTool(
    rootDir: string,
    tool: 'prettier' | 'eslint',
    config: { prettierConfigPath?: string; eslintConfigPath?: string },
    patterns: string[]
): Promise<{ success: number; failed: number }> {
    const binInfo = await getBinPath(rootDir, tool)
    if (!binInfo) return { success: 0, failed: 0 }

    let success = 0
    let failed = 0
    const configPath = tool === 'prettier' ? config.prettierConfigPath : config.eslintConfigPath
    const flag = tool === 'prettier' ? '--write' : '--fix'

    for (const pattern of patterns) {
        try {
            const args = [flag]
            if (configPath) args.push('--config', configPath)
            args.push(pattern)
            await exec(binInfo.command, [...binInfo.prependArgs, ...args], {
                cwd: rootDir,
                timeout: 60000
            })
            success++
        } catch {
            failed++
        }
    }
    return { success, failed }
}
