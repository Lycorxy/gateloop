/**
 * Git 命令执行器
 *
 * 基于 helpers/exec.ts 的跨平台命令执行封装
 * 提供 Git 专用操作的便捷 API
 */

import { exec } from '../helpers/exec'
import type { ExecResult } from '../helpers/exec'
import { resolve } from 'node:path'

// ==================== 类型定义 ====================

/** Git 执行选项 */
export type GitExecOptions = {
    cwd?: string
    env?: Record<string, string | undefined>
    timeout?: number
    maxBuffer?: number
    silent?: boolean
}

/** Git 执行结果 */
export type GitExecResult = {
    success: boolean
    exitCode: number
    stdout: string
    stderr: string
    duration: number
    command: string
}

// ==================== 内部工具 ====================

/** 被阻止的危险 Git 参数 */
const BLOCKED_ARG_PATTERNS = [/^--upload-pack=/, /^--config=/i]

/** 验证 Git 参数安全性 */
const validateArgs = (args: string[]): void => {
    if (!args || args.length === 0) throw new Error('Git args 不能为空')
    for (const arg of args) {
        for (const pat of BLOCKED_ARG_PATTERNS) {
            if (pat.test(arg)) throw new Error('不安全的 Git 参数: ' + arg)
        }
    }
}

/** 转换 GitExecOptions 为 ExecOptions */
const toExecOptions = (opts?: GitExecOptions) => ({
    cwd: opts?.cwd,
    env: opts?.env,
    timeout: opts?.timeout,
    maxBuffer: opts?.maxBuffer,
    silent: opts?.silent,
    securityCheck: false,
    generateSummary: false
})

// ==================== 核心 API ====================

/**
 * 执行 Git 命令
 */
export const gitExec = async (args: string[], options?: GitExecOptions): Promise<GitExecResult> => {
    validateArgs(args)
    const result: ExecResult = await exec('git', args, toExecOptions(options))
    return {
        success: result.success,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration: result.duration,
        command: result.command
    }
}

/**
 * 执行 Git 命令，失败时抛出异常
 */
export const gitExecOrThrow = async (args: string[], opts?: GitExecOptions): Promise<string> => {
    const r = await gitExec(args, opts)
    if (!r.success) throw new Error('Git 失败 [' + r.command + ']: ' + (r.stderr || '未知'))
    return r.stdout
}

/**
 * 执行 Git 命令，按行返回输出
 */
export const gitExecLines = async (args: string[], opts?: GitExecOptions): Promise<string[]> => {
    const o = await gitExecOrThrow(args, opts)
    return o
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
}

// ==================== 业务函数 ====================

/**
 * 检查是否为 Git 仓库
 */
export const isGitRepo = async (cwd?: string): Promise<boolean> => {
    const r = await gitExec(['rev-parse', '--is-inside-work-tree'], { cwd, silent: true })
    return r.success && r.stdout.trim() === 'true'
}

/**
 * 获取 Git 仓库根目录
 */
export const getGitRoot = async (cwd?: string): Promise<string> =>
    resolve((await gitExecOrThrow(['rev-parse', '--show-toplevel'], { cwd, silent: true })).trim())

/**
 * 获取当前分支名
 */
export const getCurrentBranch = async (cwd?: string): Promise<string> =>
    (await gitExecOrThrow(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, silent: true })).trim()

/**
 * 获取 HEAD commit hash
 */
export const getHeadCommit = async (cwd?: string): Promise<string> => {
    try {
        return (await gitExecOrThrow(['rev-parse', 'HEAD'], { cwd, silent: true })).trim()
    } catch (_) {
        return ''
    }
}

/**
 * 检查工作区是否干净（无未提交的更改）
 */
export const isWorktreeClean = async (cwd?: string): Promise<boolean> => {
    const r1 = await gitExec(['diff', '--quiet'], { cwd, silent: true })
    const r2 = await gitExec(['diff', '--cached', '--quiet'], { cwd, silent: true })
    return r1.success && r2.success
}

/**
 * 获取已暂存文件列表
 */
export const getStagedFiles = async (cwd?: string): Promise<string[]> => {
    const o = await gitExecOrThrow(['diff', '--name-only', '--cached'], { cwd, silent: true })
    return o
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean)
}

// ==================== 默认导出 ====================

export default {
    gitExec,
    gitExecOrThrow,
    gitExecLines,
    isGitRepo,
    getGitRoot,
    getCurrentBranch,
    getHeadCommit,
    isWorktreeClean,
    getStagedFiles
}
