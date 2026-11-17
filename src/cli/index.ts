/**
 * nut - 统一命令行入口
 *
 * 所有子命令统一通过 nut 调用：
 *   nut gateloop <命令> [选项]   GateLoop (Anchor-Driven Skill) 运行时
 *   nut lint  <命令> [选项]   Lint 规则提取、验证和修复
 *   nut exec  <命令> [args]  跨端命令执行器（类似跨端 exe）
 */

import { runGateLoop } from './gateloop'
import { runExec } from './exec'
import { runRequest } from './request'

async function main(): Promise<void> {
    const [subcommand, ...rest] = process.argv.slice(2)

    if (!subcommand || subcommand === '--help' || subcommand === '-h') {
        printHelp()
        return
    }

    try {
        switch (subcommand) {
            case 'gateloop':
                await runGateLoop(rest)
                break
            case 'exec':
                await runExec(rest)
                break
            case 'request':
                await runRequest(rest)
                break
            default:
                console.error(`未知子命令: ${subcommand}`)
                printHelp()
                process.exit(1)
        }
    } catch (error) {
        console.error(`执行失败: ${(error as Error).message}`)
        process.exit(1)
    }
}

function printHelp(): void {
    console.log(`
🔧 nut - 统一命令行工具

用法:
  nut <子命令> [选项]

子命令:
  gateloop  GateLoop (Anchor-Driven Skill) 运行时
  exec      跨端命令执行器（类似跨端 exe）
  request   HTTP/HTTPS 请求（复用 helpers/http）

示例:
  nut gateloop init <manifest> --task "任务描述"
  nut exec tsc --noEmit
  nut request GET https://api.example.com/health

使用 nut <子命令> --help 查看具体子命令的帮助信息。
`)
}

main()
