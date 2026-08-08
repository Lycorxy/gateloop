/**
 * Prettier 格式化验证器 — 独立于 ESLint 的 prettier 插件
 *
 * 直接跑 prettier --check，即使 ESLint 没配 prettier/prettier 规则也能检查。
 * 接入 ADS verify 后，nut ads next 强制执行。
 */

import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { exec } from '../helpers'

// ==================== 类型定义 ====================

export interface PrettierCheckResult {
    passed: boolean
    unformattedFiles: string[]
    output: string
    duration: number
}

// ==================== 主入口 ====================

/**
 * 检查文件是否符合 Prettier 格式
 *
 * @param patterns glob 模式或文件路径
 * @param cwd 工作目录
 */
export async function runPrettierCheck(
    patterns: string | string[],
    cwd: string = process.cwd()
): Promise<PrettierCheckResult> {
    const startTime = Date.now()
    const patternArray = Array.isArray(patterns) ? patterns : [patterns]

    // 查找 prettier 可执行文件
    const prettierCmd = await findPrettier(cwd)
    if (!prettierCmd) {
        return {
            passed: true,
            unformattedFiles: [],
            output: 'Prettier 未安装，跳过格式检查',
            duration: Date.now() - startTime
        }
    }

    // 构建 prettier --check 命令
    const args = [...prettierCmd.prependArgs, '--check', ...patternArray]

    try {
        const result = await exec(prettierCmd.command, args, {
            cwd,
            timeout: 30000
        })

        // exit 0 = 全部格式正确
        return {
            passed: result.exitCode === 0,
            unformattedFiles: [],
            output: result.stdout || result.stderr,
            duration: Date.now() - startTime
        }
    } catch (error) {
        // prettier --check exit 1 = 有格式问题（不是错误）
        const err = error as { stdout?: string; stderr?: string; exitCode?: number }
        const output = err.stdout || err.stderr || ''

        // 解析未格式化的文件列表
        const unformatted = parseUnformattedFiles(output)

        return {
            passed: false,
            unformattedFiles: unformatted,
            output,
            duration: Date.now() - startTime
        }
    }
}

/**
 * 自动格式化文件（调用 prettier --write）
 *
 * @param patterns glob 模式或文件路径
 * @param cwd 工作目录
 */
export async function runPrettierFormat(
    patterns: string | string[],
    cwd: string = process.cwd()
): Promise<{ formatted: number; duration: number }> {
    const startTime = Date.now()
    const patternArray = Array.isArray(patterns) ? patterns : [patterns]

    const prettierCmd = await findPrettier(cwd)
    if (!prettierCmd) {
        return { formatted: 0, duration: Date.now() - startTime }
    }

    const args = [...prettierCmd.prependArgs, '--write', ...patternArray]

    try {
        await exec(prettierCmd.command, args, {
            cwd,
            timeout: 30000
        })
    } catch {
        // 忽略错误
    }

    return {
        formatted: patternArray.length,
        duration: Date.now() - startTime
    }
}

// ==================== 辅助函数 ====================

/**
 * 查找 prettier 可执行文件
 */
async function findPrettier(
    cwd: string
): Promise<{ command: string; prependArgs: string[] } | null> {
    // 优先使用本地 node_modules 的 prettier CLI
    const localCli = join(cwd, 'node_modules', 'prettier', 'bin', 'prettier.cjs')
    if (existsSync(localCli)) {
        return { command: 'node', prependArgs: [localCli] }
    }

    // 回退到 .bin
    const binName = process.platform === 'win32' ? 'prettier.cmd' : 'prettier'
    const binPath = join(cwd, 'node_modules', '.bin', binName)
    if (existsSync(binPath)) {
        return { command: binPath, prependArgs: [] }
    }

    // 尝试 npx
    try {
        const npxName = process.platform === 'win32' ? 'npx.cmd' : 'npx'
        const npxPath = join(cwd, 'node_modules', '.bin', npxName)
        if (existsSync(npxPath)) {
            return { command: npxPath, prependArgs: ['prettier'] }
        }
    } catch {
        // 不可用
    }

    return null
}

/**
 * 从 prettier --check 输出中解析未格式化的文件列表
 *
 * 输出格式：
 *   [warn] src/file.ts
 *   [warn] src/other.ts
 *   [warn] Code style issues found in 2 files. Run Prettier to fix.
 */
function parseUnformattedFiles(output: string): string[] {
    const files: string[] = []
    const lines = output.split('\n')

    for (const line of lines) {
        const match = line.match(/^\[warn\]\s+(.+)$/)
        if (match && !match[1].includes('Code style issues')) {
            files.push(match[1].trim())
        }
    }

    return files
}
