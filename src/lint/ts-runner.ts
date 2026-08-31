/**
 * TypeScript 类型检查执行器
 *
 * 执行 tsc --noEmit 验证并解析输出结果
 * 从 runner.ts 中抽取，减少主文件体积
 */

import { join, resolve, isAbsolute } from 'node:path'
import { statSync } from 'node:fs'
import { glob } from 'glob'
import { exists } from '../helpers'
import { exec, getCommandPath } from '../helpers'
import type { LintIssue, LintResult, BatchLintResult } from './types'
import { detectLintConfig } from './extractor'
import { buildEmptyResult, buildBatchResult } from './eslint-runner'

// ==================== 主导出函数 ====================

/**
 * 执行 TypeScript 类型检查
 */
export async function runTypeScript(
    patterns: string | string[],
    cwd?: string,
    options: { cache?: boolean; progress?: boolean } = {}
): Promise<BatchLintResult> {
    const startTime = Date.now()
    const config = await detectLintConfig(cwd)

    if (!config.hasTypeScript) {
        return buildEmptyResult(startTime)
    }

    // 获取 tsc 可执行文件
    const tscInfo = await getTscPath(config.rootDir)

    if (!tscInfo) {
        throw new Error('TypeScript 未安装')
    }

    // 构建命令
    const args = [...tscInfo.prependArgs, '--noEmit', '--pretty', 'false']

    if (options.cache === false) {
        args.push('--incremental', 'false')
    }

    // 执行 tsc（全项目检查，tsc 不支持只查子集）
    const result = await exec(tscInfo.command, args, {
        cwd: config.rootDir,
        timeout: 120000
    })

    // 按传入的 patterns 过滤结果（只保留目标文件错误，避免全项目错误淹没）
    const patternArray = Array.isArray(patterns) ? patterns : [patterns]
    const lintResults = parseTscOutput(result, patternArray, config.rootDir)

    return buildBatchResult(lintResults, startTime)
}

// ==================== 辅助函数 ====================

/**
 * 获取 tsc 可执行文件路径
 */
async function getTscPath(
    rootDir: string
): Promise<{ command: string; prependArgs: string[] } | null> {
    // 优先使用 JS 入口，跨平台最稳定
    const jsPath = join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc')
    if (await exists(jsPath)) {
        return { command: 'node', prependArgs: [jsPath] }
    }

    // 回退到 .bin 下的可执行文件
    const binPath = join(rootDir, 'node_modules', '.bin')
    const execName = process.platform === 'win32' ? 'tsc.cmd' : 'tsc'
    const execPath = join(binPath, execName)
    if (await exists(execPath)) {
        return { command: execPath, prependArgs: [] }
    }

    // 尝试全局命令
    const globalPath = await getCommandPath('tsc')
    if (globalPath) {
        return { command: globalPath, prependArgs: [] }
    }

    return null
}

/**
 * 解析 tsc 输出
 *
 * tsc 输出格式示例：
 * src/file.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
 *
 * 解析策略：
 * 1. 按行分割输出
 * 2. 匹配错误行格式：file(line,col): error/warning TSxxxx: message
 * 3. 提取文件路径、行列、错误码、消息
 */
function parseTscOutput(
    result: { stdout: string; stderr: string },
    patterns: string[],
    cwd: string
): LintResult[] {
    const results: LintResult[] = []
    const fileIssuesMap = new Map<string, LintIssue[]>()

    // ★ 合并 stdout + stderr（避免 stderr 的错误被遗漏）
    // tsc 通常输出到 stdout，但某些版本/配置输出到 stderr。
    // 旧实现 result.stdout || result.stderr 在两者都有内容时丢弃 stderr → 漏检
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n')

    if (!output || output.trim() === '') {
        return results
    }

    // ★ 展开目标文件集合，过滤非目标文件的错误（聚焦传入 patterns）
    // tsc --noEmit 是全项目检查，不过滤会混入无关文件错误，淹没目标文件问题
    const targetFiles = expandTargetFiles(patterns, cwd)

    // 正则表达式匹配 tsc 错误格式
    const errorRegex = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s*(.+)$/gm

    let match: RegExpExecArray | null
    while ((match = errorRegex.exec(output)) !== null) {
        const filePath = match[1]
        const line = parseInt(match[2], 10)
        const column = parseInt(match[3], 10)
        const severity = match[4]
        const errorCode = `TS${match[5]}`
        const message = match[6]

        // ★ 过滤：只保留目标文件的错误
        if (targetFiles && !isFileInTarget(filePath, targetFiles, cwd)) continue

        const issue: LintIssue = {
            ruleName: errorCode,
            source: 'typescript',
            severity: severity as 'error' | 'warning',
            message,
            filePath,
            line,
            column,
            fixable: false
        }

        // 按文件分组
        if (!fileIssuesMap.has(filePath)) {
            fileIssuesMap.set(filePath, [])
        }
        fileIssuesMap.get(filePath)!.push(issue)
    }

    // 构建结果数组
    for (const [filePath, issues] of fileIssuesMap) {
        results.push({
            success: issues.length === 0,
            filePath,
            issues,
            errorCount: issues.filter((i) => i.severity === 'error').length,
            warningCount: issues.filter((i) => i.severity === 'warning').length,
            fixableCount: 0,
            duration: 0
        })
    }

    return results
}

/**
 * 展开目标文件集合（用于过滤 tsc 全项目结果）
 *
 * tsc --noEmit 是全项目检查，不支持只查子集。此函数把 patterns 展开为文件集合，
 * 让 parseTscOutput 只保留目标文件的错误——
 * 避免 "nut lint run src/gateloop" 时全项目的无关错误淹没目标文件问题。
 *
 * @returns 文件绝对路径集合（/ 分隔）；patterns 为空或无匹配时返回 null（不过滤）
 */
function expandTargetFiles(patterns: string[], cwd: string): Set<string> | null {
    if (!patterns || patterns.length === 0) return null

    const files = new Set<string>()
    for (let pattern of patterns) {
        // 目录 pattern → 展开为目录下所有 TS/JS 文件
        try {
            const stat = statSync(resolve(cwd, pattern))
            if (stat.isDirectory()) {
                pattern = pattern.replace(/[/\\]$/, '') + '/**/*.{ts,tsx,js,jsx}'
            }
        } catch {
            // 不是已存在的目录，当作 glob 模式处理
        }

        const matches = glob.sync(pattern, { cwd, absolute: true, nodir: true })
        for (const m of matches) files.add(m.replace(/\\/g, '/'))
    }

    return files.size > 0 ? files : null
}

/**
 * 判断 tsc 输出的文件路径是否在目标集合内
 */
function isFileInTarget(filePath: string, targetFiles: Set<string>, cwd: string): boolean {
    const abs = (isAbsolute(filePath) ? filePath : resolve(cwd, filePath)).replace(/\\/g, '/')
    return targetFiles.has(abs)
}
