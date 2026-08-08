/**
 * TypeScript 类型诊断修复器
 *
 * 处理 TypeScript 类型错误的诊断和修复建议
 * 从 fixer.ts 中抽取，减少主文件体积
 */

import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { FixResult, BatchFixResult } from './types'
import { detectLintConfig } from './extractor'
import { runTypeScript } from './runner'
import { buildBatchFixResult } from './eslint-fixer'

// ==================== TypeScript 错误提示映射 ====================

/**
 * TypeScript 常见错误码的修复提示
 */
const TS_ERROR_HINTS: Record<string, string> = {
    // 未使用变量
    TS6133: '可删除此声明',
    TS6138: '可删除此声明',

    // 空值/未定义
    TS18046: '可在变量后加 ! 或使用 if 守卫',
    TS18047: '可在变量后加 ! 或使用 if 守卫',
    TS2531: '可在对象后加 ?. 可选链或使用 if 守卫',
    TS2532: '可用 ?. 可选链或加 ! 断言',

    // 类型不匹配
    TS2322: '可用 as 类型断言或修正类型定义',
    TS2345: '可用 as 类型断言或修正类型定义',
    TS2339: '可加 as any 临时绕过或补全类型定义',

    // 隐式 any
    TS7006: '可加 : any 类型注解',
    TS7034: '可加 : any 类型注解',

    // 参数数量
    TS2554: '检查参数数量是否匹配',

    // 未找到名称
    TS2304: '检查导入路径或拼写'
}

// ==================== 主导出函数 ====================

/**
 * TypeScript 类型诊断与修复
 *
 * 策略：
 * 1. 运行 tsc --noEmit 获取全部类型错误
 * 2. 返回结构化错误列表（文件、行号、错误码、消息、上下文代码）
 * 3. 由 AI 根据上下文智能修复每个错误
 *
 * TypeScript 本身没有 --fix 命令，类型错误需要理解语义才能正确修复。
 */
export async function fixTypeScript(
    patterns: string | string[],
    cwd?: string
): Promise<BatchFixResult> {
    const startTime = Date.now()

    const lintResult = await runTypeScript(patterns, cwd)
    const config = await detectLintConfig(cwd)
    const rootDir = cwd || config.rootDir

    const results: FixResult[] = []

    for (const fileResult of lintResult.results) {
        if (fileResult.issues.length === 0) {
            results.push({
                success: true,
                filePath: fileResult.filePath,
                fixedCount: 0,
                remainingCount: 0,
                fixedIssues: [],
                unfixedIssues: [],
                duration: 0
            })
            continue
        }

        // 读取文件，为每个错误附加上下文代码
        let fileContent: string[] = []
        try {
            const absPath = join(rootDir, fileResult.filePath)
            fileContent = (await readFile(absPath, 'utf-8')).split('\n')
        } catch {
            // 文件不可读，仍然返回错误信息
        }

        const unfixedIssues = fileResult.issues.map((i) => {
            // 提供出错行的代码上下文
            const lineIdx = i.line - 1
            const codeLine = fileContent[lineIdx] || '(文件不可读)'
            const hint = getTSErrorHint(i.ruleName)

            return {
                ruleName: i.ruleName,
                line: i.line,
                column: i.column,
                reason: [
                    `[${i.ruleName}] ${i.message}`,
                    `  → ${codeLine.trim()}`,
                    `  💡 ${hint}`
                ].join('\n')
            }
        })

        results.push({
            success: false,
            filePath: fileResult.filePath,
            fixedCount: 0,
            remainingCount: fileResult.issues.length,
            fixedIssues: [],
            unfixedIssues,
            duration: 0
        })
    }

    return buildBatchFixResult(results, startTime)
}

// ==================== 辅助函数 ====================

/**
 * 获取 TypeScript 错误的修复提示
 */
function getTSErrorHint(errorCode: string): string {
    return TS_ERROR_HINTS[errorCode] || '请根据错误描述手动修复'
}
