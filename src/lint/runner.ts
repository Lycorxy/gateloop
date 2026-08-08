/**
 * Lint 执行器（统一入口）
 *
 * 统一执行 ESLint、Stylelint 和 TypeScript 验证
 * 具体执行逻辑已拆分到独立模块
 */

import type { LintInput, BatchLintResult } from './types'
// 导入各工具的执行器
import { runESLint } from './eslint-runner'
import { runStylelint } from './stylelint-runner'
import { runTypeScript } from './ts-runner'

// ==================== 重新导出各工具执行器 ====================

export { runESLint }
export { runStylelint }
export { runTypeScript }

// ==================== 统一执行接口 ====================

/**
 * 运行 Lint 检查（统一入口）
 *
 * 根据配置自动选择合适的 Lint 工具，支持：
 * - ESLint: JavaScript/TypeScript 代码检查
 * - Stylelint: CSS/SCSS 样式检查
 * - TypeScript: 类型检查 (tsc --noEmit)
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

    // 运行 ESLint
    if (!source || source === 'eslint') {
        try {
            const eslintResults = await runESLint(patterns, cwd, { cache, progress })
            results = mergeBatchResults(results, eslintResults)
        } catch (error) {
            // ESLint 失败时继续运行其他工具
            console.error('ESLint 执行失败:', error)
        }
    }

    // 运行 Stylelint
    if (!source || source === 'stylelint') {
        try {
            const stylelintResults = await runStylelint(patterns, cwd, { cache, progress })
            results = mergeBatchResults(results, stylelintResults)
        } catch (error) {
            // Stylelint 失败时继续运行其他工具
            console.error('Stylelint 执行失败:', error)
        }
    }

    // 运行 TypeScript 类型检查
    if (!source || source === 'typescript') {
        try {
            const tsResults = await runTypeScript(patterns, cwd, { cache, progress })
            results = mergeBatchResults(results, tsResults)
        } catch (error) {
            // TypeScript 失败时继续运行其他工具
            console.error('TypeScript 执行失败:', error)
        }
    }

    return results
}

// ==================== 辅助函数 ====================

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
