/**
 * nut exec - 跨端命令执行器（类似跨端 exe）
 *
 * 复用 helpers/exec.ts 的跨平台能力（基于 cross-spawn），增加：
 *   - 实时输出（不缓冲全部再输出）
 *   - CLIXML 噪声过滤（PowerShell 进度流）
 *   - crash 自动重试（lint 错误不重试）
 *   - exit code 原样传递
 *
 * 用法:
 *   nut exec tsc --noEmit
 *   nut exec npm run build
 *   nut exec eslint src/ --fix --retry 3
 *   node dist/cli/index.cjs exec tsc --noEmit
 */

import { spawn } from 'cross-spawn'
import { isWindows } from '../helpers'

const DEFAULT_RETRIES = 2
const RETRY_DELAY = 1000

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

// CLIXML 噪声过滤：PowerShell 非交互式执行时附加的进度流 XML
const CLIXML_BLOCK = /#< CLIXML[\s\S]*?<\/Objs>/g
const CLIXML_LINE = /^\s*<(Objs|Obj|TN|MS|PR|I64|AV|Nil|T|S|ToString)\b/

function cleanChunk(chunk: Buffer): string {
    let text = chunk.toString()
    text = text.replace(CLIXML_BLOCK, '')
    const lines = text.split('\n')
    return lines.filter((line) => !CLIXML_LINE.test(line)).join('\n')
}

interface ParsedArgs {
    command: string[]
    retry: number
    silent: boolean
}

function parseArgs(args: string[]): ParsedArgs {
    const result: ParsedArgs = { command: [], retry: DEFAULT_RETRIES, silent: false }
    let i = 0
    while (i < args.length) {
        const arg = args[i]
        if (arg === '--retry') {
            const next = args[i + 1]
            result.retry = next ? parseInt(next, 10) : DEFAULT_RETRIES
            i += 2
        } else if (arg === '--silent') {
            result.silent = true
            i++
        } else if (arg === '--help' || arg === '-h') {
            printHelp()
            process.exit(0)
        } else {
            // 第一个非选项参数开始，后续全部归为命令
            result.command = args.slice(i)
            break
        }
    }
    return result
}

/**
 * 执行命令（实时输出 + CLIXML 过滤 + crash 重试）
 *
 * 重试策略：
 *   - exit 0 → 成功
 *   - exit 1（lint 错误）→ 不重试（真实问题）
 *   - spawn error（crash）→ 重试
 */
async function execWithRetry(
    command: string[],
    retry: number,
    silent: boolean,
    attempt = 0
): Promise<number> {
    const [cmd, ...rest] = command
    if (!cmd) {
        console.error('请提供要执行的命令')
        return 1
    }

    return new Promise((resolve) => {
        const child = spawn(cmd, rest, {
            stdio: ['inherit', 'pipe', 'pipe'],
            windowsHide: true
        })

        child.stdout?.on('data', (data: Buffer) => {
            if (silent) return
            const cleaned = cleanChunk(data)
            if (cleaned.trim()) process.stdout.write(cleaned)
        })

        child.stderr?.on('data', (data: Buffer) => {
            const cleaned = cleanChunk(data)
            if (cleaned.trim()) process.stderr.write(cleaned)
        })

        child.on('close', (code: number | null) => {
            resolve(code ?? 1)
        })

        child.on('error', async (err: Error & { code?: string }) => {
            // ENOENT = 命令不存在，重试无意义，直接失败
            if (err.code === 'ENOENT') {
                console.error(`❌ 命令不存在: ${cmd}`)
                if (isWindows) {
                    console.error(`  → 请检查 ${cmd} 是否已安装并在 PATH 中`)
                    console.error(`  → 本地安装的工具请用 npx 或 npm run 调用`)
                }
                resolve(127)
                return
            }

            // 其他 crash 错误（EAGAIN/文件锁/服务启动失败）→ 重试
            if (attempt < retry) {
                console.error(
                    `\n⚠️ 子进程错误: ${err.message}，${RETRY_DELAY}ms 后重试 (${attempt + 1}/${retry})...`
                )
                await sleep(RETRY_DELAY)
                resolve(await execWithRetry(command, retry, silent, attempt + 1))
            } else {
                console.error(`\n❌ 执行失败（已重试 ${retry} 次）: ${err.message}`)
                resolve(1)
            }
        })
    })
}

export async function runExec(args: string[]): Promise<void> {
    const { command, retry, silent } = parseArgs(args)

    if (command.length === 0) {
        console.error('请提供要执行的命令，例如: nut exec tsc --noEmit')
        process.exit(1)
    }

    const exitCode = await execWithRetry(command, retry, silent)
    process.exit(exitCode)
}

function printHelp(): void {
    console.log(`
🔧 nut exec - 跨端命令执行器

基于 cross-spawn 跨端执行任意命令，过滤 PowerShell CLIXML 噪声，
exit code 原样传递，子进程 crash 自动重试。

用法:
  nut exec <command> [args...] [选项]

选项:
  --retry <N>   crash 重试次数（默认 2，lint 错误 exit 1 不重试）
  --silent      不输出 stdout（stderr 仍输出）
  --help, -h    显示帮助

示例:
  nut exec tsc --noEmit
  nut exec npm run build
  nut exec eslint src/ --fix --retry 3
  nut exec "echo hello && ls -la"
  node dist/cli/index.cjs exec tsc --noEmit
`)
}
