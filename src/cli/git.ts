/**
 * Git CLI 入口
 *
 * 命令行工具：Git 操作封装，包括暂存、提交、回滚、备份、差异、SSH
 *
 * 使用方式：
 *   nut git status              - 查看工作区状态
 *   nut git stage --all         - 暂存所有文件
 *   nut git stage --files "a.ts,b.ts"  - 暂存指定文件
 *   nut git stage --fix-lf      - 暂存并修复换行符
 *   nut git unstage             - 取消暂存
 *   nut git commit -m "msg"     - 提交
 *   nut git log                 - 查看提交日志
 *   nut git snapshots           - 查看快照列表
 *   nut git snapshot -d "备份"   - 创建快照
 *   nut git activity            - 查看操作行为日志（每次关键动作）
 *   nut git undo                - 撤销上一步操作
 *   nut git rollback --to 0     - 回退到指定快照
 *   nut git rollback --prev     - 回退到上一个快照
 *   nut git rollback --first    - 回退到第一个快照
 *   nut git rollback --action 5 - 回退到第 5 步操作前的状态
 *   nut git diff                - 查看工作区差异
 *   nut git diff --staged       - 查看暂存区差异
 *   nut git diff-file <path>    - 查看文件差异
 *   nut git diff-branch <a> <b> - 分支对比
 *   nut git history <path>      - 文件历史
 *   nut git branch              - 分支列表
 *   nut git branch -c <name>    - 创建分支
 *   nut git checkout <name>     - 切换分支
 *   nut git stash               - 暂存工作区
 *   nut git stash-pop           - 恢复工作区
 *   nut git lf                  - 检测换行符
 *   nut git lf --fix            - 修复换行符
 *   nut git lf --setup          - 配置 .gitattributes
 *   nut git ssh setup           - 一键配置 SSH
 *   nut git ssh status          - 查看 SSH 状态
 *   nut git ssh key             - 查看公钥
 */

import { GitManager } from '../git/index'
import { getNextVersion, getTagName } from '../git/branch'
import type { GitResult, SSHSetupOptions, SSHAccount } from '../git/types'

// ==================== 辅助函数 ====================

/** 输出格式化的结果 */
function printResult(result: Record<string, unknown>, indent: number = 0): void {
    const pad = '  '.repeat(indent)

    for (const [key, value] of Object.entries(result)) {
        if (key === 'rawDiff') {
            console.log(
                `${pad}\x1b[90m[原始差异输出已省略，长度: ${(value as string).length}]\x1b[0m`
            )
            continue
        }
        if (key === 'publicKey') {
            console.log(`${pad}\x1b[33m公钥:\x1b[0m`)
            console.log(`${pad}${value}`)
            continue
        }
        if (key === 'nextSteps' && Array.isArray(value)) {
            console.log(`${pad}\x1b[36m下一步:\x1b[0m`)
            for (const step of value) {
                console.log(`${pad}  ${step}`)
            }
            continue
        }
        if (Array.isArray(value)) {
            console.log(`${pad}\x1b[1m${key}:\x1b[0m`)
            for (const item of value.slice(0, 30)) {
                if (typeof item === 'object' && item !== null) {
                    printResult(item as Record<string, unknown>, indent + 1)
                    console.log('')
                } else {
                    console.log(`${pad}  - ${item}`)
                }
            }
            if (value.length > 30) {
                console.log(`${pad}  ... 还有 ${value.length - 30} 项`)
            }
            continue
        }
        if (typeof value === 'object' && value !== null) {
            console.log(`${pad}\x1b[1m${key}:\x1b[0m`)
            printResult(value as Record<string, unknown>, indent + 1)
            continue
        }
        console.log(`${pad}\x1b[1m${key}:\x1b[0m ${value}`)
    }
}

/** 输出成功 */
function printSuccess(message: string): void {
    console.log(`\n\x1b[32m✅ ${message}\x1b[0m`)
}

/** 输出错误 */
function printError(message: string): void {
    console.error(`\n\x1b[31m❌ ${message}\x1b[0m`)
}

/** 输出分隔线 */
function printSeparator(title?: string): void {
    if (title) {
        console.log(`\n${'═'.repeat(60)}`)
        console.log(`  \x1b[36m${title}\x1b[0m`)
        console.log(`${'═'.repeat(60)}`)
    } else {
        console.log('─'.repeat(60))
    }
}

/** 输出帮助信息 */
function printHelp(): void {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║           🚀 Node-Ultra Git 工具 - 命令参考                  ║
╚══════════════════════════════════════════════════════════════╝

📋 基本操作:
  nut git status              查看工作区状态
  nut git log [-n <数量>]     查看提交日志

📦 暂存与提交:
  nut git stage --all         暂存所有文件
  nut git stage --files <列表> 暂存指定文件 (逗号分隔)
  nut git stage --fix-lf      暂存并自动修复换行符
  nut git unstage [文件...]    取消暂存
  nut git commit -m <消息>    提交代码
  nut git commit -m <消息> --amend   修改上一次提交

⏪ 回退与快照:
  nut git snapshots           列出所有快照
  nut git snapshot -d <描述>  创建手动快照
  nut git activity           查看操作行为日志（做了什么、能否回退）
  nut git undo               撤销上一步操作（回退到上一步前的快照）
  nut git rollback --to <索引>  回退到指定快照
  nut git rollback --prev     回退到上一个快照
  nut git rollback --first    回退到第一个快照
  nut git rollback --action <序号|ID>  回退到指定操作步骤前的状态
  nut git revert <文件>       还原单个文件

🔍 差异与历史:
  nut git diff                查看工作区差异
  nut git diff --staged       查看暂存区差异
  nut git diff-file <路径>    查看文件差异
  nut git diff-branch <A> <B> 比较两个分支
  nut git history <路径>      查看文件历史

🌿 分支管理:
  nut git branch              列出本地分支
  nut git branch -a           列出所有分支(含远程)
  nut git branch -c <名称>    创建并切换分支
  nut git checkout <名称>     切换分支
  nut git branch -d <名称>    删除分支
  nut git branch -D <名称>    强制删除分支

📎 Stash:
  nut git stash [描述]        暂存工作区
  nut git stash-pop           恢复工作区
  nut git stash-list          查看 Stash 列表

📝 换行符:
  nut git lf                  检测换行符状态
  nut git lf --fix            修复换行符为 LF
  nut git lf --crlf --fix     修复换行符为 CRLF
  nut git lf --setup          配置 .gitattributes

🔑 SSH 配置:
  nut git ssh setup [platform]              一键配置 SSH（github/gitlab/gitee/gitcode，默认 github）
  nut git ssh setup gitcode                 配置腾讯工蜂
  nut git ssh setup gitcode --token xxx     带 token
  nut git ssh multi --platform gitcode --accounts "personal:email,shared:email"
  nut git ssh troubleshoot                 诊断 SSH 问题
  nut git ssh status                        查看 SSH 状态
  nut git ssh key [host]                    查看公钥

🚀 分支策略（feature/hotfix + tag + MR）:
  nut git flow create --type feature [--version <x.y.z>] [--tag] [--mr] [--desc <描述>]
                                            创建需求分支 feature/v{ver}
  nut git flow create --type hotfix [--version <x.y.z>] [--tag] [--mr] [--desc <描述>]
                                            创建缺陷修复分支 hotfix/v{ver}
  nut git flow tag [--version <x.y.z>] [--message <说明>]
                                            打 tag v{ver} 并推送
  nut git flow mr [--source <分支>] [--target <分支>] [--title <标题>]
                                            创建 MR（默认当前分支 → master）
  nut git flow merge [--source <分支>]       合并分支到 test 并推送（默认当前分支）
  nut git flow preview [--source <分支>]     预览合并到 test（无冲突自动合并，有冲突提示手动）
  nut git flow delete [--branch <分支>]      删除分支（仅 feature/hotfix，受保护分支禁止）
  nut git rebase [--onto master] [--branch <分支>]
                                            将分支 rebase 到目标分支（默认 master）
  nut git config init [--force] [--crlf]     生成/完善项目 Git 配置
  nut git config gitignore                  仅生成/完善 .gitignore
  nut git config editorconfig [--crlf]       仅生成/完善 .editorconfig
  nut git flow list                         列出可管理分支 + tags

示例:
  nut git stage --all
  nut git commit -m "feat: 添加新功能"
  nut git snapshot -d "发布前备份" --tag release
  nut git rollback --to 3
  nut git diff-branch main develop
`)
}

// ==================== 命令解析 ====================

/** 简单参数解析（不依赖 commander） */
function parseArgs(args: string[]): {
    command: string
    subcommand: string
    args: string[]
    flags: Record<string, string | boolean>
} {
    const all = args
    const flags: Record<string, string | boolean> = {}
    const positional: string[] = []
    let command = ''
    let subcommand = ''

    for (let i = 0; i < all.length; i++) {
        const arg = all[i]

        if (arg === '--help' || arg === '-h') {
            flags.help = true
            continue
        }

        if (arg.startsWith('--')) {
            const key = arg.slice(2)
            const next = all[i + 1]
            if (next && !next.startsWith('-')) {
                flags[key] = next
                i++
            } else {
                flags[key] = true
            }
        } else if (arg.startsWith('-')) {
            // -m "msg" -> flags.m = "msg"
            const key = arg.slice(1)
            const next = all[i + 1]
            if (next && !next.startsWith('-')) {
                flags[key] = next
                i++
            } else {
                flags[key] = true
            }
        } else {
            if (!command) {
                command = arg
            } else if (!subcommand) {
                subcommand = arg
            } else {
                positional.push(arg)
            }
        }
    }

    return { command, subcommand, args: positional, flags }
}

// ==================== 主函数 ====================

export async function runGit(argv: string[]): Promise<void> {
    const { command, subcommand, args, flags } = parseArgs(argv)

    if (!command || flags.help) {
        printHelp()
        process.exit(0)
    }

    try {
        const git = new GitManager()
        await git.init()

        switch (command) {
            // ==================== 状态 ====================
            case 'status': {
                const result = await git.status()
                printSeparator('工作区状态')

                if (result.success && result.data) {
                    const d = result.data as Record<string, unknown>
                    const summary = d.summary as Record<string, number>
                    console.log(`  分支: \x1b[33m${d.branch}\x1b[0m`)
                    console.log(`  总计: ${summary.total} 个文件`)
                    if (summary.staged > 0)
                        console.log(`  已暂存: \x1b[32m${summary.staged}\x1b[0m`)
                    if (summary.modified > 0)
                        console.log(`  已修改: \x1b[33m${summary.modified}\x1b[0m`)
                    if (summary.added > 0) console.log(`  新增: \x1b[36m${summary.added}\x1b[0m`)
                    if (summary.deleted > 0)
                        console.log(`  已删除: \x1b[31m${summary.deleted}\x1b[0m`)
                    if (summary.untracked > 0)
                        console.log(`  未跟踪: \x1b[90m${summary.untracked}\x1b[0m`)
                    if (summary.conflict > 0)
                        console.log(`  ⚠ 冲突: \x1b[31m${summary.conflict}\x1b[0m`)

                    const files = d.files as Array<Record<string, string>>
                    console.log('')
                    for (const file of files) {
                        const statusIcon: Record<string, string> = {
                            added: 'A',
                            modified: 'M',
                            deleted: 'D',
                            renamed: 'R',
                            unmodified: ' ',
                            untracked: '?',
                            staged: '✓',
                            conflict: '!'
                        }
                        const idx = statusIcon[file.index] || ' '
                        const wt = statusIcon[file.worktree] || ' '
                        const color = file.index !== 'unmodified' ? '\x1b[32m' : '\x1b[33m'
                        console.log(`  ${color}${idx}${wt}\x1b[0m ${file.path}`)
                    }
                } else {
                    printError(result.message)
                }
                break
            }

            // ==================== 暂存 ====================
            case 'stage':
            case 'add': {
                const files = flags.files
                    ? String(flags.files)
                          .split(',')
                          .map((f: string) => f.trim())
                    : undefined

                const result = await git.stage({
                    all: Boolean(flags.all || flags.a),
                    files: args.length > 0 ? args : files,
                    fixLineEndings: Boolean(flags['fix-lf'] || flags.fixLf)
                })

                if (result.success) {
                    printSuccess(result.message)
                    if (result.data) {
                        const d = result.data as Record<string, unknown>
                        const stagedCount = d.count as number
                        if (stagedCount > 0) {
                            console.log(`暂存文件数: ${stagedCount}`)
                        }
                    }
                } else {
                    printError(result.message)
                    if (result.error) console.error(`  原因: ${result.error}`)
                }
                break
            }

            // ==================== 取消暂存 ====================
            case 'unstage':
            case 'reset': {
                const result = await git.unstage(args.length > 0 ? args : undefined)
                if (result.success) {
                    printSuccess(result.message)
                } else {
                    printError(result.message)
                }
                break
            }

            // ==================== 提交 ====================
            case 'commit': {
                const msg = String(flags.m || flags.message || '')
                if (!msg) {
                    printError('请提供提交信息: --message "提交信息" 或 -m "提交信息"')
                    process.exit(1)
                }

                const result = await git.commit({
                    message: msg,
                    amend: Boolean(flags.amend),
                    all: Boolean(flags.all || flags.a),
                    noVerify: Boolean(flags['no-verify'])
                })

                if (result.success) {
                    printSuccess(result.message)
                    if (result.data) {
                        const d = result.data as Record<string, unknown>
                        console.log(`  分支: ${d.branch}`)
                        console.log(`  提交: ${d.hash}`)
                    }
                } else {
                    printError(result.message)
                    if (result.error) console.error(`  原因: ${result.error}`)
                }
                break
            }

            // ==================== 日志 ====================
            case 'log': {
                const count = flags.n ? parseInt(String(flags.n)) : 20
                const result = await git.log(count)

                if (result.success && result.data) {
                    const d = result.data as Record<string, unknown>
                    const commits = d.commits as Array<Record<string, unknown>>
                    printSeparator(`最近 ${commits.length} 条提交`)

                    for (const commit of commits) {
                        const hash = ((commit.shortHash as string) || '').slice(0, 7)
                        console.log(`\n  \x1b[33m${hash}\x1b[0m \x1b[1m${commit.subject}\x1b[0m`)
                        console.log(`  \x1b[90m作者: ${commit.author} | ${commit.date}\x1b[0m`)
                        if (commit.stats) {
                            const s = commit.stats as Record<string, number>
                            console.log(
                                `  \x1b[90m文件: ${s.files} | +${s.additions} -${s.deletions}\x1b[0m`
                            )
                        }
                    }
                } else {
                    printError(result.message)
                }
                break
            }

            // ==================== 快照 ====================
            case 'snapshots':
            case 'snapshot-list': {
                const result = git.listSnapshots()
                if (result.success && result.data) {
                    const d = result.data as Record<string, unknown>
                    const snapshots = d.snapshots as Array<Record<string, unknown>>
                    const current = d.current as Record<string, unknown> | null

                    printSeparator(`快照列表 (共 ${snapshots.length} 个)`)
                    if (current) {
                        console.log(`  当前: #${current.index}`)
                    }
                    console.log('')

                    for (const snap of snapshots) {
                        const marker =
                            current && snap.index === current.index ? ' \x1b[32m◀ 当前\x1b[0m' : ''
                        console.log(`  \x1b[36m[#${snap.index}]\x1b[0m ${snap.operation}${marker}`)
                        console.log(`    描述: ${snap.description}`)
                        console.log(`    时间: ${snap.timestamp}`)
                        console.log(`    分支: ${snap.branch}`)
                        console.log(
                            `    提交: ${(snap.headCommit as string)?.slice(0, 7)} ${snap.headMessage}`
                        )
                        const tags = snap.tags as string[]
                        if (tags.length > 0) {
                            console.log(`    标签: ${tags.map((t: string) => `[${t}]`).join(' ')}`)
                        }
                        console.log('')
                    }
                } else {
                    printError(result.message)
                }
                break
            }

            case 'snapshot': {
                const desc = String(flags.d || flags.description || subcommand || '手动快照')
                const tagList = flags.tag
                    ? String(flags.tag)
                          .split(',')
                          .map((t: string) => t.trim())
                    : []

                const result = await git.createSnapshot(desc, tagList)
                if (result.success) {
                    printSuccess(result.message)
                    if (result.data) {
                        const d = result.data as Record<string, unknown>
                        console.log(`  快照ID: ${d.id}`)
                        console.log(`  索引: #${d.index}`)
                    }
                } else {
                    printError(result.message)
                }
                break
            }

            // ==================== 操作行为日志 ====================
            case 'activity':
            case 'oplog': {
                const records = git.listActivity()
                printSeparator(`操作行为日志 (共 ${records.length} 条)`)
                if (records.length === 0) {
                    console.log('  暂无记录')
                }
                for (const r of records) {
                    const time = new Date(r.timestamp).toLocaleString()
                    const status = r.result === 'success' ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
                    const snap = r.snapshotId
                        ? `\x1b[90m[快照 ${r.snapshotId}]\x1b[0m`
                        : '\x1b[90m[无快照]\x1b[0m'
                    console.log(`  #${r.seq} ${status} \x1b[36m${r.action}\x1b[0m ${snap}`)
                    console.log(`     ${r.description}`)
                    console.log(`     分支: ${r.branch ?? '-'} | 时间: ${time}`)
                    if (r.error) console.log(`     \x1b[31m失败原因: ${r.error}\x1b[0m`)
                }
                console.log(
                    '\n使用 nut git undo 撤销上一步，或 nut git rollback --action <序号> 回退到指定步骤'
                )
                break
            }

            case 'undo': {
                const result = await git.undo()
                if (result.success) printSuccess(result.message)
                else printError(result.message)
                break
            }

            // ==================== 回退 ====================
            case 'rollback':
            case 'restore': {
                if (flags.prev || flags.previous) {
                    const result = await git.restoreToPrevious()
                    if (result.success) printSuccess(result.message)
                    else printError(result.message)
                } else if (flags.first) {
                    const result = await git.restoreToFirst()
                    if (result.success) printSuccess(result.message)
                    else printError(result.message)
                } else if (flags.action !== undefined) {
                    const result = await git.rollbackToAction(String(flags.action))
                    if (result.success) printSuccess(result.message)
                    else printError(result.message)
                } else if (flags.to !== undefined) {
                    const idx = parseInt(String(flags.to))
                    if (isNaN(idx)) {
                        printError('请提供有效的快照索引: --to <数字>')
                        process.exit(1)
                    }
                    const result = await git.restoreToIndex(idx)
                    if (result.success) printSuccess(result.message)
                    else printError(result.message)
                } else {
                    // 显示快照列表供选择
                    const snapResult = git.listSnapshots()
                    if (snapResult.success && snapResult.data) {
                        const d = snapResult.data as Record<string, unknown>
                        const snapshots = d.snapshots as Array<Record<string, unknown>>
                        printSeparator('可用快照')
                        for (const snap of snapshots) {
                            console.log(
                                `  [#${snap.index}] ${snap.description} (${snap.operation})`
                            )
                        }
                        console.log('\n使用 nut git rollback --to <索引> 回退到指定快照')
                        console.log('使用 nut git rollback --prev 回退到上一个快照')
                        console.log('使用 nut git rollback --first 回退到初始快照')
                    }
                }
                break
            }

            // ==================== 文件回退 ====================
            case 'revert': {
                const filePath = args[0]
                if (!filePath) {
                    printError('请提供文件路径')
                    process.exit(1)
                }
                const result = await git.revertFile(filePath)
                if (result.success) printSuccess(result.message)
                else printError(result.message)
                break
            }

            // ==================== 差异 ====================
            case 'diff': {
                if (flags.staged || flags.cached) {
                    const result = await git.diffStaged()
                    printDiffResult(result)
                } else if (flags.branch && args.length >= 2) {
                    const result = await git.diffBranches(args[0], args[1])
                    printDiffResult(result)
                } else {
                    const result = await git.diffWorktree()
                    printDiffResult(result)
                }
                break
            }

            case 'diff-file': {
                const filePath = args[0]
                if (!filePath) {
                    printError('请提供文件路径')
                    process.exit(1)
                }
                const result = await git.diffFile(filePath)
                printDiffResult(result)
                break
            }

            case 'diff-branch':
            case 'diff-branches': {
                if (args.length < 2) {
                    printError('请提供两个分支名: nut git diff-branch <源分支> <目标分支>')
                    process.exit(1)
                }
                const result = await git.diffBranches(args[0], args[1])
                if (result.success && result.data) {
                    const d = result.data as Record<string, unknown>
                    const stats = d.stats as Record<string, number>
                    printSeparator(`分支对比: ${d.source} ↔ ${d.target}`)
                    console.log(`  超前: ${stats.commitsAhead} 个提交`)
                    console.log(`  落后: ${stats.commitsBehind} 个提交`)
                    console.log(`  文件: ${stats.filesChanged} 个变更`)
                    console.log(`  +${stats.additions} -${stats.deletions}`)

                    const ahead = d.ahead as Array<Record<string, string>>
                    if (ahead.length > 0) {
                        console.log(`\n  \x1b[32m超前提交:\x1b[0m`)
                        for (const c of ahead) {
                            console.log(`    ${c.hash} ${c.subject}`)
                        }
                    }
                    const behind = d.behind as Array<Record<string, string>>
                    if (behind.length > 0) {
                        console.log(`\n  \x1b[31m落后提交:\x1b[0m`)
                        for (const c of behind) {
                            console.log(`    ${c.hash} ${c.subject}`)
                        }
                    }
                } else {
                    printError(result.message)
                }
                break
            }

            case 'history': {
                const filePath = args[0]
                if (!filePath) {
                    printError('请提供文件路径')
                    process.exit(1)
                }
                const result = await git.fileHistory(filePath)
                if (result.success && result.data) {
                    const d = result.data as Record<string, unknown>
                    const commits = d.commits as Array<Record<string, string>>
                    printSeparator(`文件历史: ${filePath} (${commits.length} 条)`)

                    for (const c of commits) {
                        console.log(`  \x1b[33m${c.hash}\x1b[0m ${c.subject}`)
                        console.log(`  \x1b[90m${c.author} | ${c.date}\x1b[0m`)
                        console.log('')
                    }
                } else {
                    printError(result.message)
                }
                break
            }

            // ==================== 分支 ====================
            case 'branch':
            case 'branches': {
                if (flags.c || flags.create) {
                    const name = String(flags.c || flags.create)
                    const result = await git.createBranch(name)
                    if (result.success) printSuccess(result.message)
                    else printError(result.message)
                } else if (flags.d || flags.D) {
                    const name = args[0] || String(flags.d || flags.D)
                    if (!name) {
                        printError('请提供分支名')
                        process.exit(1)
                    }
                    const result = await git.deleteBranch(name, Boolean(flags.D))
                    if (result.success) printSuccess(result.message)
                    else printError(result.message)
                } else {
                    const result = await git.listBranches(Boolean(flags.a || flags.all))
                    if (result.success && result.data) {
                        const d = result.data as Record<string, unknown>
                        const branches = d.branches as Array<Record<string, unknown>>
                        printSeparator(`分支列表 (${d.total} 个)`)

                        for (const b of branches) {
                            const marker = b.current ? '\x1b[32m* \x1b[0m' : '  '
                            const color = b.remote ? '\x1b[90m' : ''
                            console.log(`${marker}${color}${b.name}\x1b[0m`)
                        }
                    } else {
                        printError(result.message)
                    }
                }
                break
            }

            case 'checkout':
            case 'switch': {
                const name = subcommand || args[0]
                if (!name) {
                    printError('请提供分支名')
                    process.exit(1)
                }
                const result = await git.switchBranch(name)
                if (result.success) printSuccess(result.message)
                else printError(result.message)
                break
            }

            // ==================== Rebase ====================
            case 'rebase': {
                const onto = flags.onto ? String(flags.onto) : 'master'
                const branch = flags.branch ? String(flags.branch) : undefined
                printSeparator(`Rebase ${branch || '(当前分支)'} → ${onto}`)
                const result = await git.rebase({ branch, onto })
                if (result.success) {
                    printSuccess(result.message)
                } else {
                    printError(result.message)
                    if (result.error) console.error(`  原因: ${result.error}`)
                    if (!result.success) {
                        console.log(
                            '  冲突时请手动: git rebase --continue（解决后） 或 git rebase --abort（放弃）'
                        )
                    }
                }
                break
            }

            // ==================== Stash ====================
            case 'stash': {
                const desc = args[0]
                const result = await git.stash(desc)
                if (result.success) printSuccess(result.message)
                else printError(result.message)
                break
            }

            case 'stash-pop': {
                const result = await git.stashPop()
                if (result.success) printSuccess(result.message)
                else printError(result.message)
                break
            }

            case 'stash-list': {
                const result = await git.stashList()
                if (result.success && result.data) {
                    const d = result.data as Record<string, unknown>
                    const items = d.items as Array<Record<string, string>>
                    printSeparator(`Stash 列表 (${items.length} 个)`)
                    for (const item of items) {
                        console.log(`  ${item.ref}: ${item.message}`)
                    }
                } else {
                    printError(result.message)
                }
                break
            }

            // ==================== 换行符 ====================
            case 'lf': {
                if (flags.setup || flags['setup-gitattributes']) {
                    const ending = flags.crlf ? 'crlf' : 'lf'
                    const result = await git.setupGitAttributes(ending as 'lf' | 'crlf')
                    if (result.success) printSuccess(result.message)
                    else printError(result.message)
                } else if (flags.fix || flags.f) {
                    const ending = flags.crlf ? 'crlf' : 'lf'
                    const result = await git.fixLineEndings(ending as 'lf' | 'crlf')
                    if (result.success) printSuccess(result.message)
                    else printError(result.message)
                } else {
                    const result = await git.checkLineEndings()
                    if (result.success && result.data) {
                        const d = result.data as Record<string, unknown>
                        printSeparator('换行符检测')
                        console.log(`  总文件数: ${d.total}`)
                        console.log(`  LF: ${d.lf}`)
                        console.log(`  CRLF: ${d.crlf}`)
                        console.log(`  混合: ${d.mixed}`)
                        console.log(`  期望: ${d.expected}`)

                        const mismatched = d.mismatched as Array<Record<string, string>>
                        if (mismatched.length > 0) {
                            console.log(`\n  \x1b[33m不匹配文件 (${mismatched.length}):\x1b[0m`)
                            for (const m of mismatched.slice(0, 20)) {
                                console.log(
                                    `    ${m.path} [当前: ${m.current}, 期望: ${m.expected}]`
                                )
                            }
                            if (mismatched.length > 20) {
                                console.log(`    ... 还有 ${mismatched.length - 20} 个文件`)
                            }
                            console.log('\n  使用 nut git lf --fix 修复')
                        }
                    } else {
                        printError(result.message)
                    }
                }
                break
            }

            // ==================== 项目 Git 配置生成 ====================
            case 'config': {
                if (subcommand === 'init' || !subcommand) {
                    const lineEnding = flags.crlf ? 'crlf' : 'lf'
                    const force = Boolean(flags.force)
                    printSeparator(
                        `生成项目 Git 配置 (${lineEnding.toUpperCase()}${force ? '，覆盖重写' : '，仅补充缺失项'})`
                    )
                    const result = await git.setupProjectConfig({ lineEnding, force })
                    if (result.success) {
                        printSuccess(result.message)
                    } else {
                        printError(result.message)
                    }
                } else if (subcommand === 'gitignore') {
                    const result = await git.setupGitIgnore({ force: Boolean(flags.force) })
                    if (result.success) printSuccess(result.message)
                    else printError(result.message)
                } else if (subcommand === 'editorconfig') {
                    const lineEnding = flags.crlf ? 'crlf' : 'lf'
                    const result = await git.setupEditorConfig({
                        lineEnding,
                        force: Boolean(flags.force)
                    })
                    if (result.success) printSuccess(result.message)
                    else printError(result.message)
                } else {
                    printError(`未知 config 子命令: ${subcommand}`)
                    console.log('可用子命令: init, gitignore, editorconfig')
                }
                break
            }

            // ==================== 分支策略（feature/hotfix + tag + MR） ====================
            case 'flow': {
                const projectKey = git.detectProjectKey()

                if (subcommand === 'create' || !subcommand) {
                    // 创建 feature / hotfix 分支（可选 --tag / --mr）
                    const type = flags.type ? String(flags.type) : 'feature'
                    if (type !== 'feature' && type !== 'hotfix') {
                        printError(`--type 只能是 feature 或 hotfix，当前: ${type}`)
                        process.exit(1)
                    }

                    // 版本号：未提供则自动计算（远程最新版本 patch+1）
                    let version = flags.version ? String(flags.version) : ''
                    if (!version) {
                        const latest = await git.getLatestVersion(projectKey)
                        version = getNextVersion(latest, 'patch')
                    }

                    printSeparator(`创建 ${type} 分支`)
                    const branchName = await git.createBranchByType(type, version, projectKey)
                    if (!branchName) {
                        printError('分支创建失败')
                        process.exit(1)
                    }
                    printSuccess(`分支创建成功: ${branchName}`)

                    // 打 tag（可选）
                    if (flags.tag) {
                        const tagName = getTagName(version, projectKey)
                        const ok = await git.createTag(tagName)
                        if (ok) printSuccess(`tag 创建成功: ${tagName}`)
                        else printError(`tag 创建失败: ${tagName}`)
                    }

                    // 创建 MR（可选）
                    if (flags.mr) {
                        const desc = flags.desc ? String(flags.desc) : ''
                        const title =
                            flags.title ||
                            `${type === 'feature' ? 'feat' : 'fix'}${desc ? `: ${desc}` : ''} (${branchName})`
                        const result = await git.createMR({
                            sourceBranch: branchName,
                            targetBranch: flags.target ? String(flags.target) : 'master',
                            title: String(title)
                        })
                        if (result.success) printSuccess(`MR 创建成功: ${result.url}`)
                        else printError(`MR 创建失败: ${result.error}`)
                    }
                } else if (subcommand === 'tag') {
                    // 打 tag
                    let version = flags.version ? String(flags.version) : ''
                    if (!version) {
                        const info = await git.getCurrentProjectInfo()
                        version = info?.version || '0.0.0'
                    }
                    const tagName = getTagName(version, projectKey)
                    const ok = await git.createTag(
                        tagName,
                        flags.message ? String(flags.message) : undefined
                    )
                    if (ok) printSuccess(`tag 创建成功: ${tagName}`)
                    else printError(`tag 创建失败: ${tagName}`)
                } else if (subcommand === 'mr') {
                    // 创建 MR
                    const source = flags.source
                        ? String(flags.source)
                        : await git.getCurrentBranch()
                    const target = flags.target ? String(flags.target) : 'master'
                    const title = flags.title ? String(flags.title) : `MR: ${source} -> ${target}`
                    const result = await git.createMR({
                        sourceBranch: source,
                        targetBranch: target,
                        title
                    })
                    if (result.success) printSuccess(`MR 创建成功: ${result.url}`)
                    else printError(`MR 创建失败: ${result.error}`)
                } else if (subcommand === 'merge') {
                    // 合并分支到 test 测试分支并推送
                    const source = flags.source
                        ? String(flags.source)
                        : await git.getCurrentBranch()
                    printSeparator(`合并 ${source} → test`)
                    const result = await git.mergeToTest(source)
                    if (result.success) {
                        printSuccess(`已合并 ${source} 到 ${result.testBranch} 并推送`)
                    } else {
                        printError(`合并失败: ${result.error}`)
                    }
                } else if (subcommand === 'preview') {
                    // 预览合并到 test：无冲突自动合并，有冲突提示手动
                    const source = flags.source
                        ? String(flags.source)
                        : await git.getCurrentBranch()
                    printSeparator(`预览合并 ${source} → test`)
                    const result = await git.previewMergeToTest(source)
                    if (result.success) {
                        printSuccess(`无冲突，已自动合并 ${source} 到 ${result.testBranch} 并推送`)
                    } else if (result.conflict) {
                        printError(`检测到冲突，已中止自动合并`)
                        if (result.error) console.error(`  ${result.error}`)
                        console.log(
                            `  请手动合并: git checkout ${result.testBranch} && git merge ${source} → 解决冲突 → git push origin ${result.testBranch}`
                        )
                    } else {
                        printError(`预览失败: ${result.error}`)
                    }
                } else if (subcommand === 'delete') {
                    // 安全删除分支（仅 feature/hotfix）
                    const branchName = flags.branch
                        ? String(flags.branch)
                        : flags.source
                          ? String(flags.source)
                          : await git.getCurrentBranch()
                    printSeparator(`删除分支 ${branchName}`)
                    const result = await git.deleteDeletableBranch(branchName)
                    if (result.success) {
                        printSuccess(`已删除分支: ${branchName}（远程 + 本地）`)
                    } else if (result.reason === 'protected') {
                        printError(result.error || '受保护分支禁止删除')
                    } else {
                        printError(`删除失败: ${result.error}`)
                    }
                } else if (subcommand === 'list') {
                    // 列出分支 + tags
                    const branches = await git.listManagedBranches(projectKey)
                    printSeparator(`可管理分支 (${branches.length} 个)`)
                    const typeIcon: Record<string, string> = {
                        release: '🚀',
                        feature: '✨',
                        hotfix: '🐛'
                    }
                    for (const b of branches) {
                        console.log(
                            `  ${typeIcon[b.type] || '📌'} [${b.type}] ${b.name} (v${b.version})`
                        )
                    }

                    const tags = await git.listTags(projectKey)
                    if (tags.length > 0) {
                        printSeparator(`Tags (${tags.length} 个)`)
                        for (const t of tags.slice(0, 15)) {
                            console.log(`  🏷️  ${t}`)
                        }
                        if (tags.length > 15) {
                            console.log(`  ... 还有 ${tags.length - 15} 个`)
                        }
                    }
                } else {
                    printError(`未知 flow 子命令: ${subcommand}`)
                    console.log('可用子命令: create, tag, mr, merge, preview, delete, list')
                }
                break
            }

            // ==================== SSH ====================
            case 'ssh': {
                if (subcommand === 'setup' || !subcommand) {
                    // 简化：位置参数为平台名，--token 可选
                    const validPlatforms = ['github', 'gitlab', 'gitee', 'gitcode', 'custom']
                    let platform: SSHSetupOptions['platform'] = 'github'
                    if (args[0] && validPlatforms.includes(args[0])) {
                        platform = args[0] as SSHSetupOptions['platform']
                    } else if (flags.gitcode) {
                        platform = 'gitcode'
                    } else if (flags.gitlab) {
                        platform = 'gitlab'
                    } else if (flags.gitee) {
                        platform = 'gitee'
                    }

                    const result = await git.setupSSH({
                        platform,
                        token: flags.token ? String(flags.token) : undefined
                    })
                    if (result.success) {
                        printSuccess(result.message)
                        if (result.data) {
                            const d = result.data as Record<string, unknown>
                            const steps = d.nextSteps as string[]
                            if (d.alreadyExists) {
                                console.log('\n\x1b[33m密钥已存在\x1b[0m')
                            }
                            if (steps) {
                                for (const step of steps) {
                                    console.log(step)
                                }
                            }
                        }
                    } else {
                        printError(result.message)
                    }
                } else if (subcommand === 'multi') {
                    const platform = (flags.platform ? String(flags.platform) : 'gitcode') as
                        | 'github'
                        | 'gitlab'
                        | 'gitee'
                        | 'gitcode'
                    const accountsStr = flags.accounts ? String(flags.accounts) : ''
                    if (!accountsStr) {
                        printError('请提供 --accounts，格式: name:email,name:email')
                        break
                    }
                    const accounts: SSHAccount[] = accountsStr.split(',').map((s: string) => {
                        const [name, email] = s.trim().split(':')
                        return { name: name.trim(), email: email.trim() }
                    })
                    const result = await git.setupMultiAccountSSH(platform, accounts)
                    if (result.success) {
                        printSuccess(result.message)
                        if (result.data) printResult(result.data as Record<string, unknown>)
                    } else {
                        printError(result.message)
                    }
                } else if (subcommand === 'troubleshoot') {
                    const host = flags.host ? String(flags.host) : 'git.woa.com'
                    const result = await git.troubleshootSSH(host)
                    if (result.success) {
                        printSuccess(result.message)
                    } else {
                        printError(result.message)
                    }
                    if (result.data) printResult(result.data as Record<string, unknown>)
                } else if (subcommand === 'status') {
                    const result = await git.checkSSHStatus()
                    if (result.success) {
                        printSuccess(result.message)
                        if (result.data) {
                            printResult(result.data as Record<string, unknown>)
                        }
                    } else {
                        printError(result.message)
                    }
                } else if (subcommand === 'key') {
                    const hostOrPlatform = args[0] || 'github'
                    const result = await git.showSSHKey(hostOrPlatform)
                    if (result.success && result.data) {
                        const d = result.data as Record<string, unknown>
                        console.log(`\n\x1b[36mSSH 公钥 (${d.platform}):\x1b[0m`)
                        console.log(d.publicKey)
                    } else {
                        printError(result.message)
                    }
                } else {
                    printError(`未知 SSH 子命令: ${subcommand}`)
                    console.log('可用子命令: setup, multi, troubleshoot, status, key')
                }
                break
            }

            // ==================== 未知命令 ====================
            default:
                printError(`未知命令: ${command}`)
                console.log('使用 nut git --help 查看可用命令')
                process.exit(1)
        }
    } catch (error) {
        printError(`执行失败: ${(error as Error).message}`)
        process.exit(1)
    }
}

/** 输出差异结果 */
function printDiffResult(result: GitResult): void {
    if (result.success && result.data) {
        const d = result.data as Record<string, unknown>
        const summary = result.summary as Record<string, unknown> | undefined

        if (summary) {
            printSeparator(`差异: ${summary.from || ''} → ${summary.to || ''}`)
            console.log(
                `  文件: ${summary.filesChanged} | +${summary.additions} -${summary.deletions}`
            )
        }

        const files = d.files as Array<Record<string, unknown>>
        if (files && files.length > 0) {
            for (const file of files) {
                console.log(`\n  \x1b[1m${file.path}\x1b[0m \x1b[90m[${file.type}]\x1b[0m`)
                const hunks = file.hunks as Array<Record<string, unknown>>
                if (hunks) {
                    for (const hunk of hunks) {
                        console.log(`  \x1b[36m${hunk.header}\x1b[0m`)
                        const changes = hunk.context as Array<Record<string, unknown>>
                        if (changes) {
                            for (const line of changes.slice(0, 30)) {
                                const prefix =
                                    line.type === 'added'
                                        ? '\x1b[32m+'
                                        : line.type === 'removed'
                                          ? '\x1b[31m-'
                                          : ' '
                                console.log(`  ${prefix} ${line.content}\x1b[0m`)
                            }
                        }
                    }
                }
            }
        }
    } else {
        printError(result.message as string)
        if (result.error) console.error(`  原因: ${result.error}`)
    }
}

// ==================== 入口 ====================
