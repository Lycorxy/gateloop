/**
 * 跨平台命令执行器
 *
 * 基于 cross-spawn 的稳定、高性能命令执行封装
 * 解决 Windows/Unix 兼容性问题，提供统一的执行接口
 *
 * 特性：
 * - 跨平台兼容 (Windows/macOS/Linux)
 * - 智能输出精简（去冗余保关键）
 * - 结构化错误信息（便于定位）
 * - 安全检查机制（危险命令拦截）
 * - 超时和资源控制
 */

import spawn from 'cross-spawn'
import { platform as getPlatform, arch as getArch, homedir, tmpdir } from 'node:os'
import { resolve, basename } from 'node:path'
import { statSync } from 'node:fs'

// ==================== 类型定义 ====================

/** 错误详情 */
export interface ErrorDetail {
    /** 错误类型 */
    type: 'TIMEOUT' | 'NOT_FOUND' | 'PERMISSION' | 'SPAWN_ERROR' | 'EXIT_ERROR' | 'SECURITY'
    /** 错误消息 */
    message: string
    /** 相关文件路径 */
    file?: string
    /** 错误位置（行号） */
    line?: number
    /** 错误位置（列号） */
    column?: number
    /** 错误码 */
    code?: string
    /** 建议操作 */
    suggestion?: string
}

/** 输出摘要 */
export interface OutputSummary {
    /** 摘要类型 */
    type: 'file_read' | 'file_write' | 'file_list' | 'search' | 'git' | 'npm' | 'test' | 'generic'
    /** 简短描述 */
    brief: string
    /** 关键数据 */
    data?: Record<string, unknown>
}

/** 执行结果 */
export interface ExecResult {
    /** 是否成功 */
    success: boolean
    /** 退出码 */
    exitCode: number
    /** 标准输出 */
    stdout: string
    /** 标准错误 */
    stderr: string
    /** 执行耗时（毫秒） */
    duration: number
    /** 执行的完整命令 */
    command: string
    /** 精简摘要（成功时） */
    summary?: OutputSummary
    /** 错误详情（失败时） */
    error?: ErrorDetail
}

/** 执行选项 */
export interface ExecOptions {
    /** 工作目录 */
    cwd?: string
    /** 环境变量 */
    env?: Record<string, string | undefined>
    /** 超时时间（毫秒），默认 30000 */
    timeout?: number
    /** 是否使用 shell 执行，默认 false */
    shell?: boolean
    /** 输出编码，默认 utf-8 */
    encoding?: BufferEncoding
    /** 最大输出缓冲区大小，默认 10MB */
    maxBuffer?: number
    /** 是否静默执行（不输出日志） */
    silent?: boolean
    /** 输入数据 */
    input?: string
    /** 是否在 Windows 隐藏窗口 */
    windowsHide?: boolean
    /** 是否启用安全检查，默认 true */
    securityCheck?: boolean
    /** 是否生成精简摘要，默认 true */
    generateSummary?: boolean
    /** 命令上下文（用于生成更准确的摘要） */
    context?: {
        /** 操作类型 */
        operation?: 'read' | 'write' | 'delete' | 'search' | 'list' | 'git' | 'npm' | 'test'
        /** 目标文件/目录 */
        target?: string
    }
}

/** 环境信息 */
export interface EnvInfo {
    platform: NodeJS.Platform
    arch: string
    nodeVersion: string
    cwd: string
    homedir: string
    tmpdir: string
    shell: string
    user: string
}

// ==================== 常量 ====================

/** 默认超时时间 30 秒 */
const DEFAULT_TIMEOUT = 30000

/** 最大输出长度 */
const MAX_OUTPUT_LENGTH = 50000

/** 当前平台 */
export const platform = getPlatform()

/** 是否为 Windows */
export const isWindows = platform === 'win32'

/** 是否为 macOS */
export const isMac = platform === 'darwin'

/** 是否为 Linux */
export const isLinux = platform === 'linux'

/** 危险命令黑名单 */
const DANGEROUS_COMMANDS = new Set([
    'rm -rf /',
    'rm -rf /*',
    'del /f /s /q c:\\',
    'format c:',
    'mkfs',
    ':(){:|:&};:',
    'dd if=/dev/zero of=/dev/sda',
    'chmod -R 777 /',
    'chown -R',
    '> /dev/sda',
    'mv /* /dev/null'
])

/** 需要警告的命令模式 */
const WARNING_PATTERNS = [
    /rm\s+(-rf?|--recursive)\s+[/~]/i,
    /del\s+\/[sf]/i,
    /format\s+[a-z]:/i,
    /chmod\s+-R\s+777/i,
    />\s*\/dev\/(sda|null)/i
]

// ==================== 辅助函数 ====================

/**
 * 获取默认 shell
 */
export function getDefaultShell(): string {
    if (isWindows) {
        return process.env.ComSpec || 'cmd.exe'
    }
    return process.env.SHELL || '/bin/bash'
}

/**
 * 获取 shell 执行参数
 */
function getShellArgs(command: string): { shell: string; args: string[] } {
    if (isWindows) {
        // Windows: 使用 cmd.exe /c 或 powershell
        const usePS = process.env.ComSpec?.toLowerCase().includes('powershell')
        if (usePS) {
            return { shell: 'powershell.exe', args: ['-Command', command] }
        }
        return { shell: 'cmd.exe', args: ['/c', command] }
    }
    // Unix: 使用默认 shell
    return { shell: getDefaultShell(), args: ['-c', command] }
}

/**
 * 清理输出（去除 ANSI 颜色码和多余空白）
 */
function cleanOutput(output: string, maxLength: number = MAX_OUTPUT_LENGTH): string {
    if (!output) return ''

    // 去除 ANSI 颜色码
    let cleaned = output.replace(/\x1b\[[0-9;]*m/g, '')

    // 去除回车符（Windows 兼容）
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

    // 去除多余空行
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n')

    // 去除首尾空白
    cleaned = cleaned.trim()

    // 截断过长输出
    if (cleaned.length > maxLength) {
        cleaned = cleaned.slice(0, maxLength) + '\n... (输出已截断)'
    }

    return cleaned
}

// ==================== 安全检查 ====================

/**
 * 检查命令是否安全
 */
function checkCommandSecurity(command: string): ErrorDetail | null {
    const fullCmd = command.toLowerCase().trim()

    // 检查黑名单
    for (const dangerous of DANGEROUS_COMMANDS) {
        if (fullCmd.includes(dangerous.toLowerCase())) {
            return {
                type: 'SECURITY',
                message: `危险命令被拦截: ${dangerous}`,
                code: 'DANGEROUS_COMMAND',
                suggestion: '此命令可能造成系统损坏，已被安全机制拦截'
            }
        }
    }

    // 检查警告模式
    for (const pattern of WARNING_PATTERNS) {
        if (pattern.test(fullCmd)) {
            return {
                type: 'SECURITY',
                message: `潜在危险命令: ${command}`,
                code: 'RISKY_COMMAND',
                suggestion: '此命令可能造成数据丢失，请确认后使用 securityCheck: false 执行'
            }
        }
    }

    return null
}

// ==================== 输出精简与摘要 ====================

/**
 * 解析错误输出，提取结构化信息
 */
function parseError(stderr: string, command: string): ErrorDetail {
    const lowerErr = stderr.toLowerCase()

    // 文件不存在
    if (
        lowerErr.includes('enoent') ||
        lowerErr.includes('no such file') ||
        lowerErr.includes('not found')
    ) {
        const fileMatch =
            stderr.match(/['"]([^'"]+)['"]/)?.[1] || stderr.match(/:\s*([^\s:]+)\s*$/m)?.[1]
        return {
            type: 'NOT_FOUND',
            message: '文件或目录不存在',
            file: fileMatch,
            code: 'ENOENT',
            suggestion: '请检查路径是否正确'
        }
    }

    // 权限错误
    if (
        lowerErr.includes('eacces') ||
        lowerErr.includes('permission denied') ||
        lowerErr.includes('access denied')
    ) {
        const fileMatch = stderr.match(/['"]([^'"]+)['"]/)?.[1]
        return {
            type: 'PERMISSION',
            message: '权限不足',
            file: fileMatch,
            code: 'EACCES',
            suggestion: '请检查文件权限或使用管理员权限运行'
        }
    }

    // TypeScript/编译错误 - 提取位置
    const tsMatch = stderr.match(/([^\s]+\.tsx?):(\d+):(\d+)/i)
    if (tsMatch) {
        return {
            type: 'EXIT_ERROR',
            message: '编译错误',
            file: tsMatch[1],
            line: parseInt(tsMatch[2]),
            column: parseInt(tsMatch[3]),
            code: 'COMPILE_ERROR'
        }
    }

    // ESLint 错误
    const eslintMatch = stderr.match(/([^\s]+):(\d+):(\d+):\s*error/i)
    if (eslintMatch) {
        return {
            type: 'EXIT_ERROR',
            message: 'Lint 错误',
            file: eslintMatch[1],
            line: parseInt(eslintMatch[2]),
            column: parseInt(eslintMatch[3]),
            code: 'LINT_ERROR'
        }
    }

    // 通用错误
    return {
        type: 'EXIT_ERROR',
        message: stderr.split('\n')[0].slice(0, 200) || `命令执行失败: ${command}`,
        code: 'UNKNOWN'
    }
}

/**
 * 生成输出摘要
 */
function generateSummary(
    command: string,
    stdout: string,
    context?: ExecOptions['context']
): OutputSummary | undefined {
    const cmd = command.toLowerCase()
    const lines = stdout.split('\n').filter((l) => l.trim())

    // 文件读取
    if (context?.operation === 'read' || cmd.includes('cat ') || cmd.includes('type ')) {
        const target = context?.target || command.split(/\s+/).pop()
        let size = 0
        try {
            if (target) size = statSync(target).size
        } catch {
            /* ignore */
        }
        return {
            type: 'file_read',
            brief: `读取 ${basename(target || 'file')} (${lines.length} 行, ${formatSize(size)})`,
            data: { file: target, lines: lines.length, size }
        }
    }

    // 文件列表
    if (context?.operation === 'list' || cmd.includes('ls ') || cmd.includes('dir ')) {
        const fileCount = lines.length
        const dirs = lines.filter((l) => l.includes('<DIR>') || l.endsWith('/')).length
        return {
            type: 'file_list',
            brief: `列出 ${fileCount} 项 (${dirs} 目录, ${fileCount - dirs} 文件)`,
            data: { total: fileCount, directories: dirs, files: fileCount - dirs }
        }
    }

    // 搜索
    if (context?.operation === 'search' || cmd.includes('grep ') || cmd.includes('findstr ')) {
        const matchCount = lines.length
        return {
            type: 'search',
            brief: `找到 ${matchCount} 处匹配`,
            data: { matches: matchCount }
        }
    }

    // Git 操作
    if (context?.operation === 'git' || cmd.startsWith('git ')) {
        if (cmd.includes('status')) {
            const modified = (stdout.match(/modified:/gi) || []).length
            const added = (stdout.match(/new file:/gi) || []).length
            const deleted = (stdout.match(/deleted:/gi) || []).length
            return {
                type: 'git',
                brief: `Git: ${modified} 修改, ${added} 新增, ${deleted} 删除`,
                data: { modified, added, deleted }
            }
        }
        if (cmd.includes('commit')) {
            const commitMatch = stdout.match(/\[([^\]]+)\s+([a-f0-9]+)\]/)
            return {
                type: 'git',
                brief: commitMatch ? `提交成功: ${commitMatch[2]}` : '提交成功',
                data: { branch: commitMatch?.[1], hash: commitMatch?.[2] }
            }
        }
    }

    // npm/pnpm 操作
    if (context?.operation === 'npm' || cmd.includes('npm ') || cmd.includes('pnpm ')) {
        if (cmd.includes('install')) {
            const pkgMatch = stdout.match(/added (\d+) packages?/i)
            return {
                type: 'npm',
                brief: pkgMatch ? `安装 ${pkgMatch[1]} 个包` : '安装完成',
                data: { packages: pkgMatch ? parseInt(pkgMatch[1]) : 0 }
            }
        }
        if (cmd.includes('run ')) {
            return {
                type: 'npm',
                brief: `脚本执行完成`,
                data: { script: cmd.split('run ')[1]?.split(/\s/)[0] }
            }
        }
    }

    // 测试
    if (context?.operation === 'test' || cmd.includes('jest') || cmd.includes('vitest')) {
        const passMatch = stdout.match(/(\d+)\s*pass/i)
        const failMatch = stdout.match(/(\d+)\s*fail/i)
        const pass = passMatch ? parseInt(passMatch[1]) : 0
        const fail = failMatch ? parseInt(failMatch[1]) : 0
        return {
            type: 'test',
            brief: `测试: ${pass} 通过, ${fail} 失败`,
            data: { passed: pass, failed: fail }
        }
    }

    // 通用摘要
    if (lines.length > 0) {
        return {
            type: 'generic',
            brief: lines.length > 5 ? `输出 ${lines.length} 行` : lines[0].slice(0, 100),
            data: { lines: lines.length }
        }
    }

    return undefined
}

/**
 * 格式化文件大小
 */
function formatSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

/**
 * 解析命令字符串
 */
function parseCommand(
    command: string,
    args: string[] = []
): { cmd: string; args: string[]; full: string } {
    const parts = command.trim().split(/\s+/)
    const cmd = parts[0]
    const cmdArgs = [...parts.slice(1), ...args]
    return {
        cmd,
        args: cmdArgs,
        full: [cmd, ...cmdArgs].join(' ')
    }
}

// ==================== 核心执行函数 ====================

/**
 * 执行命令（核心函数）
 *
 * @param command 命令名称
 * @param args 命令参数
 * @param options 执行选项
 * @returns 执行结果
 *
 * @example
 * ```ts
 * // 简单命令
 * const result = await exec('node', ['--version'])
 *
 * // 带选项
 * const result = await exec('npm', ['install'], { cwd: '/path/to/project', timeout: 60000 })
 *
 * // 带上下文（生成更准确的摘要）
 * const result = await exec('cat', ['file.txt'], {
 *     context: { operation: 'read', target: 'file.txt' }
 * })
 * ```
 */
export async function exec(
    command: string,
    args: string[] = [],
    options: ExecOptions = {}
): Promise<ExecResult> {
    const startTime = Date.now()
    const parsed = parseCommand(command, args)

    const {
        cwd = process.cwd(),
        env,
        timeout = DEFAULT_TIMEOUT,
        shell = false,
        encoding = 'utf-8',
        maxBuffer = 10 * 1024 * 1024,
        input,
        windowsHide = true,
        securityCheck = true,
        generateSummary: shouldGenerateSummary = true,
        context
    } = options

    // 安全检查
    if (securityCheck) {
        const securityError = checkCommandSecurity(parsed.full)
        if (securityError) {
            return {
                success: false,
                exitCode: -1,
                stdout: '',
                stderr: securityError.message,
                duration: Date.now() - startTime,
                command: parsed.full,
                error: securityError
            }
        }
    }

    return new Promise((resolvePromise) => {
        // 合并环境变量
        const mergedEnv = env ? { ...process.env, ...env } : process.env

        const child = spawn(parsed.cmd, parsed.args, {
            cwd,
            env: mergedEnv as NodeJS.ProcessEnv,
            shell,
            windowsHide,
            stdio: ['pipe', 'pipe', 'pipe']
        })

        let stdout = ''
        let stderr = ''
        let killed = false
        let outputSize = 0

        // 超时处理
        const timeoutId = setTimeout(() => {
            killed = true
            // 先尝试优雅终止
            child.kill('SIGTERM')
            // 1秒后强制终止
            setTimeout(() => {
                if (!child.killed) {
                    child.kill('SIGKILL')
                }
            }, 1000)
        }, timeout)

        // 写入输入并关闭 stdin
        if (input && child.stdin) {
            child.stdin.write(input)
            child.stdin.end()
        } else if (child.stdin) {
            // 即使没有输入也要关闭 stdin，避免某些程序等待输入
            child.stdin.end()
        }

        // 收集标准输出
        if (child.stdout) {
            child.stdout.on('data', (data: Buffer) => {
                const chunk = data.toString(encoding)
                outputSize += chunk.length
                if (outputSize <= maxBuffer) {
                    stdout += chunk
                }
            })
        }

        // 收集标准错误
        child.stderr?.on('data', (data: Buffer) => {
            const chunk = data.toString(encoding)
            outputSize += chunk.length
            if (outputSize <= maxBuffer) {
                stderr += chunk
            }
        })

        // 进程关闭
        child.on('close', (code: number | null) => {
            clearTimeout(timeoutId)
            const duration = Date.now() - startTime
            const cleanedStdout = cleanOutput(stdout)
            const cleanedStderr = cleanOutput(stderr)

            if (killed) {
                resolvePromise({
                    success: false,
                    exitCode: -1,
                    stdout: cleanedStdout,
                    stderr: `命令执行超时 (${timeout}ms)`,
                    duration,
                    command: parsed.full,
                    error: {
                        type: 'TIMEOUT',
                        message: `命令执行超时 (${timeout}ms): ${parsed.full}`,
                        code: 'ETIMEDOUT',
                        suggestion: '可以增加 timeout 参数或检查命令是否卡住'
                    }
                })
                return
            }

            const success = code === 0

            const result: ExecResult = {
                success,
                exitCode: code ?? -1,
                stdout: cleanedStdout,
                stderr: cleanedStderr,
                duration,
                command: parsed.full
            }

            // 成功时生成摘要
            if (success && shouldGenerateSummary) {
                result.summary = generateSummary(parsed.full, cleanedStdout, context)
            }

            // 失败时解析错误
            if (!success && cleanedStderr) {
                result.error = parseError(cleanedStderr, parsed.full)
            }

            resolvePromise(result)
        })

        // 进程错误
        child.on('error', (error: Error) => {
            clearTimeout(timeoutId)
            const duration = Date.now() - startTime
            const isNotFound = (error as NodeJS.ErrnoException).code === 'ENOENT'

            resolvePromise({
                success: false,
                exitCode: -1,
                stdout: '',
                stderr: error.message,
                duration,
                command: parsed.full,
                error: {
                    type: isNotFound ? 'NOT_FOUND' : 'SPAWN_ERROR',
                    message: isNotFound
                        ? `命令不存在: ${parsed.cmd}`
                        : `执行失败: ${error.message}`,
                    code: (error as NodeJS.ErrnoException).code,
                    suggestion: isNotFound ? '请检查命令是否已安装并在 PATH 中' : undefined
                }
            })
        })
    })
}

/**
 * 执行 shell 命令字符串
 *
 * @param command shell 命令字符串
 * @param options 执行选项
 *
 * @example
 * ```ts
 * const result = await execShell('echo "Hello" && ls -la')
 * ```
 */
export async function execShell(
    command: string,
    options: Omit<ExecOptions, 'shell'> = {}
): Promise<ExecResult> {
    const { shell, args } = getShellArgs(command)
    return exec(shell, args, { ...options, shell: false })
}

/**
 * 执行脚本文件
 *
 * @param scriptPath 脚本路径
 * @param args 脚本参数
 * @param options 执行选项
 */
export async function execScript(
    scriptPath: string,
    args: string[] = [],
    options: ExecOptions = {}
): Promise<ExecResult> {
    const absPath = resolve(scriptPath)
    const ext = absPath.split('.').pop()?.toLowerCase()

    let command: string
    let scriptArgs: string[]

    switch (ext) {
        case 'js':
        case 'mjs':
        case 'cjs':
            command = 'node'
            scriptArgs = [absPath, ...args]
            break
        case 'ts':
        case 'mts':
        case 'cts':
            command = 'npx'
            scriptArgs = ['tsx', absPath, ...args]
            break
        case 'py':
            command = isWindows ? 'python' : 'python3'
            scriptArgs = [absPath, ...args]
            break
        case 'sh':
            command = 'bash'
            scriptArgs = [absPath, ...args]
            break
        case 'ps1':
            command = 'powershell'
            scriptArgs = ['-ExecutionPolicy', 'Bypass', '-File', absPath, ...args]
            break
        case 'bat':
        case 'cmd':
            command = 'cmd.exe'
            scriptArgs = ['/c', absPath, ...args]
            break
        default:
            return {
                success: false,
                exitCode: -1,
                stdout: '',
                stderr: `不支持的脚本类型: ${ext}`,
                duration: 0,
                command: absPath
            }
    }

    return exec(command, scriptArgs, options)
}

// ==================== 包管理器命令 ====================

/**
 * 执行 npm/pnpm/yarn 脚本
 *
 * @param script 脚本名称
 * @param options 执行选项
 */
export async function npmRun(
    script: string,
    options: ExecOptions & {
        packageManager?: 'npm' | 'pnpm' | 'yarn'
        scriptArgs?: string[]
    } = {}
): Promise<ExecResult> {
    const { packageManager = 'npm', scriptArgs = [], ...execOptions } = options
    const args = ['run', script]

    // 添加脚本参数
    if (scriptArgs.length > 0) {
        args.push('--', ...scriptArgs)
    }

    return exec(packageManager, args, execOptions)
}

/**
 * 执行 npx 命令
 *
 * @param pkg 包名
 * @param args 命令参数
 * @param options 执行选项
 */
export async function npx(
    pkg: string,
    args: string[] = [],
    options: ExecOptions = {}
): Promise<ExecResult> {
    // npx 在 Windows 上需要特殊处理
    const npxCmd = isWindows ? 'npx.cmd' : 'npx'
    return exec(npxCmd, [pkg, ...args], options)
}

/**
 * 执行 Git 命令
 *
 * @param args Git 命令参数
 * @param options 执行选项
 */
export async function git(args: string[], options: ExecOptions = {}): Promise<ExecResult> {
    return exec('git', args, options)
}

// ==================== 跨平台命令 ====================

/**
 * 跨平台命令执行
 * 根据当前平台选择对应的命令执行
 *
 * @param windowsCommand Windows 命令
 * @param unixCommand Unix 命令
 * @param options 执行选项
 */
export async function crossExec(
    windowsCommand: string,
    unixCommand: string,
    options: ExecOptions = {}
): Promise<ExecResult> {
    const command = isWindows ? windowsCommand : unixCommand
    return execShell(command, options)
}

/**
 * 跨平台命令映射执行
 * 自动将常用命令转换为当前平台的等效命令
 *
 * @param command 通用命令
 * @param args 命令参数
 * @param options 执行选项
 */
export async function crossCommand(
    command: string,
    args: string[] = [],
    options: ExecOptions = {}
): Promise<ExecResult> {
    // 常用命令的跨平台映射
    const commandMap: Record<string, { win: string; unix: string }> = {
        ls: { win: 'dir', unix: 'ls' },
        cat: { win: 'type', unix: 'cat' },
        rm: { win: 'del', unix: 'rm' },
        cp: { win: 'copy', unix: 'cp' },
        mv: { win: 'move', unix: 'mv' },
        clear: { win: 'cls', unix: 'clear' },
        which: { win: 'where', unix: 'which' }
    }

    const mapped = commandMap[command]
    const actualCommand = mapped ? (isWindows ? mapped.win : mapped.unix) : command

    return exec(actualCommand, args, options)
}

// ==================== 环境信息 ====================

/**
 * 获取环境信息
 */
export function getEnvInfo(): EnvInfo {
    return {
        platform: getPlatform(),
        arch: getArch(),
        nodeVersion: process.version,
        cwd: process.cwd(),
        homedir: homedir(),
        tmpdir: tmpdir(),
        shell: getDefaultShell(),
        user: process.env.USER || process.env.USERNAME || 'unknown'
    }
}

/**
 * 检查命令是否存在
 *
 * @param command 命令名称
 */
export async function commandExists(command: string): Promise<boolean> {
    const checkCmd = isWindows ? 'where' : 'which'
    const result = await exec(checkCmd, [command], { silent: true })
    return result.success
}

/**
 * 获取命令路径
 *
 * @param command 命令名称
 */
export async function getCommandPath(command: string): Promise<string | null> {
    const checkCmd = isWindows ? 'where' : 'which'
    const result = await exec(checkCmd, [command], { silent: true })
    if (result.success && result.stdout) {
        return result.stdout.split('\n')[0].trim()
    }
    return null
}

// ==================== 批量执行 ====================

/** 批量命令配置 */
export interface BatchCommand {
    command: string
    args?: string[]
    options?: ExecOptions
}

/**
 * 并行执行多个命令
 *
 * @param commands 命令列表
 * @param maxConcurrency 最大并发数，默认 5
 */
export async function execParallel(
    commands: BatchCommand[],
    maxConcurrency: number = 5
): Promise<ExecResult[]> {
    const results: ExecResult[] = new Array(commands.length)
    const executing: Set<Promise<void>> = new Set()

    for (let i = 0; i < commands.length; i++) {
        const { command, args = [], options = {} } = commands[i]

        const promise = exec(command, args, options).then((result) => {
            results[i] = result
            executing.delete(promise)
        })

        executing.add(promise)

        // 达到并发上限时等待
        if (executing.size >= maxConcurrency) {
            await Promise.race(executing)
        }
    }

    // 等待所有剩余任务完成
    await Promise.all(executing)

    return results
}

/**
 * 顺序执行多个命令
 *
 * @param commands 命令列表
 * @param stopOnError 遇到错误是否停止，默认 true
 */
export async function execSequence(
    commands: BatchCommand[],
    stopOnError: boolean = true
): Promise<{ results: ExecResult[]; success: boolean }> {
    const results: ExecResult[] = []

    for (const { command, args = [], options = {} } of commands) {
        const result = await exec(command, args, options)
        results.push(result)

        if (!result.success && stopOnError) {
            return { results, success: false }
        }
    }

    return { results, success: true }
}

/**
 * 管道执行（前一个命令的输出作为后一个命令的输入）
 *
 * @param commands 命令列表
 */
export async function execPipe(commands: BatchCommand[]): Promise<ExecResult> {
    if (commands.length === 0) {
        return {
            success: false,
            exitCode: -1,
            stdout: '',
            stderr: '没有要执行的命令',
            duration: 0,
            command: ''
        }
    }

    let input: string | undefined
    let lastResult: ExecResult | undefined

    for (const { command, args = [], options = {} } of commands) {
        lastResult = await exec(command, args, { ...options, input })

        if (!lastResult.success) {
            return lastResult
        }

        input = lastResult.stdout
    }

    return lastResult!
}

// ==================== 安全执行封装 ====================

/**
 * 安全执行命令（带完整安全检查）
 * 返回精简的结果摘要
 */
export async function safeExec(
    command: string,
    args: string[] = [],
    options: ExecOptions = {}
): Promise<ExecResult> {
    return exec(command, args, {
        ...options,
        securityCheck: true,
        generateSummary: true
    })
}

/**
 * 快速执行（跳过安全检查，用于内部可信命令）
 */
export async function fastExec(
    command: string,
    args: string[] = [],
    options: ExecOptions = {}
): Promise<ExecResult> {
    return exec(command, args, {
        ...options,
        securityCheck: false,
        generateSummary: false
    })
}

/**
 * 格式化执行结果为人类可读字符串
 */
export function formatResult(result: ExecResult): string {
    if (result.success) {
        const summary = result.summary?.brief || '执行成功'
        return `✓ ${summary} (${result.duration}ms)`
    } else {
        const error = result.error
        if (error) {
            let msg = `✗ ${error.message}`
            if (error.file) msg += ` @ ${error.file}`
            if (error.line) msg += `:${error.line}`
            if (error.column) msg += `:${error.column}`
            if (error.suggestion) msg += `\n  → ${error.suggestion}`
            return msg
        }
        return `✗ ${result.stderr || '执行失败'}`
    }
}

// ==================== 默认导出 ====================

export default {
    // 核心执行
    exec,
    execShell,
    execScript,

    // 安全封装
    safeExec,
    fastExec,
    formatResult,

    // 包管理器
    npmRun,
    npx,
    git,

    // 跨平台
    crossExec,
    crossCommand,

    // 环境信息
    getEnvInfo,
    commandExists,
    getCommandPath,

    // 批量执行
    execParallel,
    execSequence,
    execPipe,

    // 平台常量
    platform,
    isWindows,
    isMac,
    isLinux,
    getDefaultShell
}
