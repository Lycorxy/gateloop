/**
 * nut - 统一命令行入口
 *
 * 所有子命令统一通过 nut 调用：
 *   nut ads   <命令> [选项]   ADS (Anchor-Driven Skill) 运行时
 *   nut git   <命令> [选项]   Git 操作封装
 *   nut lint  <命令> [选项]   Lint 规则提取、验证和修复
 *   nut exec  <命令> [args]  跨端命令执行器（类似跨端 exe）
 */

import { runAds } from './ads'
import { runGit } from './git'
import { runLint } from './lint'
import { runExec } from './exec'

async function main(): Promise<void> {
    const [subcommand, ...rest] = process.argv.slice(2)

    if (!subcommand || subcommand === '--help' || subcommand === '-h') {
        printHelp()
        return
    }

    try {
        switch (subcommand) {
            case 'ads':
                await runAds(rest)
                break
            case 'git':
                await runGit(rest)
                break
            case 'lint':
                await runLint(rest)
                break
            case 'exec':
                await runExec(rest)
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
  ads   ADS (Anchor-Driven Skill) 运行时
  git   Git 操作封装
  lint  Lint 规则提取、验证和修复
  exec  跨端命令执行器（类似跨端 exe）

示例:
  nut ads init <manifest> --task "任务描述"
  nut git status
  nut lint run "src/**/*.ts"
  nut exec tsc --noEmit

使用 nut <子命令> --help 查看具体子命令的帮助信息。
`)
}

main()
