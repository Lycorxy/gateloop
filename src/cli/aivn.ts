/**
 * AI Version CLI 入口（多会话生产级）
 *
 * 命令行工具：AI 会话代码版本管理（支持多会话）
 *
 * 用法:
 *   aivn init                          初始化 AI 版本管理
 *
 *   # === 会话管理（新功能）===
 *   aivn session create <name>         创建新的会话
 *   aivn session list                  列出所有会话
 *   aivn session use <id|name>         切换当前会话
 *   aivn session show                  显示当前会话信息
 *   aivn session rename <id|name> <new> 重命名会话
 *   aivn session delete <id|name>      删除会话
 *
 *   # === 快照管理 ===
 *   aivn save                          保存当前工作区为快照（自动关联当前会话）
 *   aivn log                           查看当前会话版本历史
 *   aivn log --session <id>            查看指定会话的历史
 *   aivn diff <id>                     对比版本与当前工作区
 *   aivn diff <idA> <idB>             对比两个版本（支持跨会话）
 *   aivn restore <id>                  恢复版本到工作区
 *   aivn drop <id>                     删除版本
 *
 *   # === 维护命令 ===
 *   aivn clean                         清理过期版本
 *   aivn stats                         查看存储统计
 *   aivn gc                            垃圾回收
 *   aivn config                        查看/设置配置
 *
 * 多会话使用示例:
 *
 *   # 终端 1 - 修复登录 bug
 *   aivn session create "fix-login"
 *   aivn save -q "修复表单验证"
 *   aivn log  # 只显示 fix-login 会话的历史
 *
 *   # 终端 2 - 重构 API（同时进行）
 *   AIVN_SESSION_ID=refactor-api aivn save -q "重构用户模块"
 *   # 或使用 --session 参数
 *   aivn save --session refactor-api -q "重构订单模块"
 */

import { resolve, join } from 'node:path'
import {
    existsSync,
    mkdirSync,
    writeFileSync,
    copyFileSync,
    readFileSync,
    appendFileSync
} from 'node:fs'
import type { AIVersionConfig, DiffOptions, DiffMode } from '../aivn/types'
import {
    AIVersionError,
    initStore,
    loadConfig,
    saveConfig,
    getVersion,
    deleteVersion,
    cleanOldVersions,
    readGlobalHead,
    runBlobGC,
    getStoreStats,
    // 多会话 API
    createSession,
    switchSession,
    getCurrentSession,
    listSessions,
    renameSession as renameSessionApi,
    deleteSession as deleteSessionApi,
    listSessionVersions,
    getCurrentSessionId
} from '../aivn'
import { saveSnapshot, restoreSnapshot } from '../aivn/snapshot'
import { diffVersion, diffBetweenVersions } from '../aivn/diff'

// ==================== 主函数 ====================

async function main() {
    const args = process.argv.slice(2)
    const command = args[0]

    if (!command || command === '--help' || command === '-h') {
        printHelp()
        return
    }

    try {
        switch (command) {
            // 初始化
            case 'init':
                await handleInit(args.slice(1))
                break

            // === 会话管理 ===
            case 'session':
                await handleSession(args.slice(1))
                break

            // 快照操作
            case 'save':
                await handleSave(args.slice(1))
                break

            case 'log':
                await handleLog(args.slice(1))
                break

            case 'diff':
                await handleDiff(args.slice(1))
                break

            case 'restore':
                await handleRestore(args.slice(1))
                break

            case 'drop':
                await handleDrop(args.slice(1))
                break

            // 维护命令
            case 'clean':
                await handleClean(args.slice(1))
                break

            case 'stats':
                await handleStats(args.slice(1))
                break

            case 'gc':
                await handleGC(args.slice(1))
                break

            case 'config':
                await handleConfig(args.slice(1))
                break

            default:
                console.error(`未知命令: ${command}`)
                printHelp()
                process.exit(1)
        }
    } catch (error) {
        if (error instanceof AIVersionError) {
            console.error(`❌ [${error.code}] ${error.message}`)
        } else {
            console.error(`执行失败: ${error}`)
        }
        process.exit(1)
    }
}

// ==================== 命令处理：初始化 ====================

async function handleInit(args: string[]) {
    const options = parseOptions(args)
    const projectRoot = resolve(options.cwd || process.cwd())

    console.log('🚀 初始化 AI 版本管理...')
    console.log(`  项目目录: ${projectRoot}`)

    const config = await initStore(projectRoot)

    console.log(`  存储目录: ${config.storeDir}`)
    console.log(`  保留天数: ${config.retentionDays} 天`)

    const currentSessionId = await getCurrentSessionId(config)
    console.log(`  当前会话: ${currentSessionId} (default)`)

    // === 部署 CodeBuddy Hooks ===
    console.log('\n🔗 配置 CodeBuddy Hooks...')
    const hooksDir = join(projectRoot, '.codebuddy', 'hooks')
    if (!existsSync(hooksDir)) {
        mkdirSync(hooksDir, { recursive: true })
    }

    // 模板源：优先从 skill 的 references/templates/ 读取
    const templatesDir = join(
        projectRoot,
        '.codebuddy',
        'skills',
        'aivn-manager',
        'references',
        'templates'
    )
    const hasTemplates = existsSync(templatesDir)

    // Hook 1: aivn-init.cjs — SessionStart 自动初始化
    const initHookPath = join(hooksDir, 'aivn-init.cjs')
    const initTemplatePath = join(templatesDir, 'aivn-init.cjs')
    if (hasTemplates && existsSync(initTemplatePath)) {
        copyFileSync(initTemplatePath, initHookPath)
        console.log(`  ✅ aivn-init.cjs → 从模板复制 (SessionStart 自动初始化)`)
    } else {
        writeFileSync(initHookPath, getInitHookContent(), 'utf-8')
        console.log(`  ✅ aivn-init.cjs → 从内联模板生成 (SessionStart 自动初始化)`)
    }

    // Hook 2: aivn-record.cjs — UserPromptSubmit 自动记录
    const recordHookPath = join(hooksDir, 'aivn-record.cjs')
    const recordTemplatePath = join(templatesDir, 'aivn-record.cjs')
    if (hasTemplates && existsSync(recordTemplatePath)) {
        copyFileSync(recordTemplatePath, recordHookPath)
        console.log(`  ✅ aivn-record.cjs → 从模板复制 (UserPromptSubmit 自动记录)`)
    } else {
        writeFileSync(recordHookPath, getRecordHookContent(), 'utf-8')
        console.log(`  ✅ aivn-record.cjs → 从内联模板生成 (UserPromptSubmit 自动记录)`)
    }

    // === 配置 .gitignore ===
    const gitignorePath = join(projectRoot, '.gitignore')
    let gitignoreContent = ''
    if (existsSync(gitignorePath)) {
        gitignoreContent = readFileSync(gitignorePath, 'utf-8')
    }
    if (!gitignoreContent.includes('.aivnsions/')) {
        const newline = gitignoreContent && !gitignoreContent.endsWith('\n') ? '\n' : ''
        appendFileSync(gitignorePath, `${newline}.aivnsions/\n`, 'utf-8')
        console.log(`  ✅ .gitignore 已添加 .aivnsions/`)
    } else {
        console.log(`  ✅ .gitignore 已包含 .aivnsions/`)
    }

    console.log('\n✅ AI 版本管理初始化完成')
    console.log('💡 提示:')
    console.log('   - Hooks 已自动配置，每次对话自动记录变更')
    console.log('   - 使用 `npx nut-aivn session create <name>` 创建新会话')
    console.log('   - 使用 `npx nut-aivn session use <name>` 切换会话')
}

// ==================== 命令处理：会话管理 ====================

async function handleSession(args: string[]) {
    const subCommand = args[0]

    if (!subCommand || subCommand === '--help') {
        console.log(`
📦 会话管理命令:

  aivn session create <name>          创建新会话
    [--base <versionId>]              基于某个版本创建
    [--from-session <id>]             从另一个会话分支

  aivn session list                   列出所有会话
    [--active]                        只显示有版本的会话
    [--limit N]                       限制数量

  aivn session use <id|name>          切换当前会话

  aivn session show                   显示当前会话详情

  aivn session rename <id|name> <new> 重命名会话

  aivn session delete <id|name>       删除会话（保留版本数据）

💡 提示:
  - 每个会话有独立的版本历史，互不干扰
  - 可以同时开多个终端，各自使用不同会话
  - 通过环境变量 AIVN_SESSION_ID 指定默认会话
`)
        return
    }

    const options = parseOptions(args.slice(1))
    const config = await loadConfigFromOptions(options)

    switch (subCommand) {
        case 'create': {
            const name = args[1]
            if (!name) {
                console.error('❌ 请指定会话名称')
                console.log('用法: aivn session create <名称>')
                process.exit(1)
            }

            console.log(`📦 创建新会话: ${name}`)

            const session = await createSession(config, name, {
                baseVersionId: options.base,
                branchFromSessionId: options['from-session'],
                metadata: { source: 'cli' }
            })

            console.log(`\n✅ 会话创建成功:`)
            console.log(`  ID: ${session.id}`)
            console.log(`  名称: ${session.name}`)
            console.log(`  初始 HEAD: ${session.head ? `...${session.head.slice(-12)}` : '(空)'}`)
            console.log(`\n💡 使用 \`aivn session use ${session.name}\` 切换到此会话`)

            // 自动切换到新会话
            await switchSession(config, session.id)
            console.log(`\n已自动切换到新会话: ${session.name}`)
            break
        }

        case 'list': {
            const sessions = await listSessions(config, {
                activeOnly: options.active === 'true',
                limit: options.limit ? parseInt(options.limit) : undefined
            })

            const currentId = await getCurrentSessionId(config)

            if (sessions.length === 0) {
                console.log('📭 暂无会话')
                console.log('💡 使用 `aivn session create <名称>` 创建第一个会话')
                return
            }

            console.log(`📦 会话列表 (共 ${sessions.length} 个):\n`)

            for (const sess of sessions) {
                const isCurrent = sess.id === currentId
                const icon = isCurrent ? '🟢' : '⚪'

                console.log(`${icon} ${sess.name} (${sess.id.slice(-8)})`)
                console.log(`   HEAD: ${sess.head ? `...${sess.head.slice(-12)}` : '(空)'}`)
                console.log(`   创建时间: ${new Date(sess.createdAt).toLocaleString('zh-CN')}`)
                console.log(`   最后更新: ${new Date(sess.updatedAt).toLocaleString('zh-CN')}`)

                if (isCurrent) {
                    console.log('   ⬆️  当前活跃会话')
                }
                console.log()
            }
            break
        }

        case 'use': {
            const sessionIdOrName = args[1]
            if (!sessionIdOrName) {
                console.error('❌ 请指定要切换的会话 ID 或名称')
                console.log('用法: aivn session use <ID或名称>')
                process.exit(1)
            }

            console.log(`🔄 切换会话...`)

            const session = await switchSession(config, sessionIdOrName)

            console.log(`\n✅ 已切换到会话:`)
            console.log(`  名称: ${session.name}`)
            console.log(`  ID: ${session.id}`)
            console.log(`  HEAD: ${session.head ? `...${session.head.slice(-12)}` : '(空)'}`)
            console.log('\n💡 后续的 save/log 等操作都会在此会话中进行')
            break
        }

        case 'show': {
            const session = await getCurrentSession(config)

            if (!session) {
                console.error('❌ 当前没有活动会话')
                console.log('💡 使用 `aivn session use <ID或名称>` 选择一个会话')
                process.exit(1)
            }

            console.log(`📋 当前会话详情:\n`)
            console.log(`  名称: ${session.name}`)
            console.log(`  ID: ${session.id}`)
            console.log(`  HEAD: ${session.head ? `...${session.head.slice(-12)}` : '(空)'}`)
            console.log(`  创建时间: ${new Date(session.createdAt).toLocaleString('zh-CN')}`)
            console.log(`  最后更新: ${new Date(session.updatedAt).toLocaleString('zh-CN')}`)

            // 显示该会话的版本数
            const { versions } = await listSessionVersions(config, session.id)
            console.log(`  版本数量: ${versions.length}`)

            if (session.metadata) {
                console.log(`  元信息: ${JSON.stringify(session.metadata)}`)
            }
            break
        }

        case 'rename': {
            const sessionIdOrName = args[1]
            const newName = args[2]

            if (!sessionIdOrName || !newName) {
                console.error('❌ 请指定会话和新名称')
                console.log('用法: aivn session rename <ID或名称> <新名称>')
                process.exit(1)
            }

            const session = await renameSessionApi(config, sessionIdOrName, newName)
            console.log(`✅ 会话已重命名: → ${session.name}`)
            break
        }

        case 'delete': {
            const sessionIdOrName = args[1]

            if (!sessionIdOrName) {
                console.error('❌ 请指定要删除的会话')
                console.log('用法: aivn session delete <ID或名称>')
                process.exit(1)
            }

            const success = await deleteSessionApi(config, sessionIdOrName)

            if (success) {
                console.log('✅ 会话已删除（版本数据保留）')
                console.log('💡 运行 aivn gc 清理不需要的数据')
            } else {
                console.error('❌ 会话不存在')
                process.exit(1)
            }
            break
        }

        default:
            console.error(`未知会话子命令: ${subCommand}`)
            console.log('运行 `aivn session --help` 查看帮助')
            process.exit(1)
    }
}

// ==================== 命令处理：保存 ====================

async function handleSave(args: string[]) {
    const options = parseOptions(args)
    const config = await loadConfigFromOptionsWithSession(options)

    const question = options.question || options.q || 'AI 会话修改'
    const solution = options.solution || options.s || '自动保存'
    const tag = options.tag || options.t

    // 显示当前会话信息
    const currentId = await getCurrentSessionId(config)
    console.log(`💾 保存 AI 会话快照...`)
    console.log(`  当前会话: ${currentId}`)
    console.log(`  问题: ${question}`)

    const version = await saveSnapshot(config, question, solution, tag)

    if (!version) {
        console.log('\n⚠️  工作区没有变化，跳过保存')
        return
    }

    console.log(`\n📋 版本信息:`)
    console.log(`  ID: ${version.id}`)
    console.log(`  所属会话: ${version.sessionId}`)
    console.log(`  变更文件: ${version.changedFiles.length} 个`)

    if (version.changedFiles.length > 0) {
        console.log('\n变更文件列表:')
        const maxShow = 20
        const shown = version.changedFiles.slice(0, maxShow)
        for (const change of shown) {
            const icon = change.status === 'added' ? '+' : change.status === 'deleted' ? '-' : '~'
            console.log(`  ${icon} ${change.path}`)
        }
        if (version.changedFiles.length > maxShow) {
            console.log(`  ... 还有 ${version.changedFiles.length - maxShow} 个文件`)
        }
    }

    console.log('\n✅ 快照保存完成')
}

// ==================== 命令处理：查看日志 ====================

async function handleLog(args: string[]) {
    const options = parseOptions(args)
    const config = await loadConfigFromOptionsWithSession(options)
    const limit = options.limit ? parseInt(options.limit) : 20

    let versions: import('../aivn').Version[]
    let sessionInfo = ''

    // 支持按会话过滤
    if (options.session) {
        const result = await listSessionVersions(config, options.session)
        versions = result.versions
        sessionInfo = `\n  过滤会话: ${result.session.name} (${result.session.id})`
    } else {
        // 默认显示当前会话
        const result = await listSessionVersions(config)
        versions = result.versions
        sessionInfo = `\n  当前会话: ${result.session.name}`
    }

    // 排序和限制
    versions.sort((a, b) => b.timestamp - a.timestamp)
    const shown = versions.slice(0, limit)

    if (shown.length === 0) {
        console.log('📭 该会话暂无版本记录')
        console.log('💡 使用 aivn save 保存第一个快照')
        return
    }

    console.log(
        `📋 AI 版本历史 (共 ${versions.length} 个, 显示 ${shown.length} 个)${sessionInfo}:\n`
    )

    for (const version of shown) {
        const date = new Date(version.timestamp).toLocaleString('zh-CN')
        const shortId = version.id.slice(-12)
        const fileCount = version.changedFiles.length

        console.log(`${'  '} ...${shortId}`)
        console.log(`   时间: ${date}`)
        console.log(`   问题: ${version.question}`)
        console.log(`   变更: ${fileCount} 个文件`)
        if (version.tag) {
            console.log(`   标签: ${version.tag}`)
        }
        console.log()
    }

    if (versions.length > limit) {
        console.log(`💡 使用 aivn log --limit ${limit + 20} 查看更多`)
        console.log('   或使用 aivn log --session <会话名> 查看其他会话')
    }
}

// ==================== 命令处理：对比 ====================

async function handleDiff(args: string[]) {
    const options = parseOptions(args)
    const config = await loadConfigFromOptionsWithSession(options)

    if (options.id && options.id2) {
        console.log(`🔍 对比版本 ...${options.id.slice(-12)} vs ...${options.id2.slice(-12)}`)
        const result = await diffBetweenVersions(config, options.id, options.id2, options)
        console.log('\n' + result)

        // 如果请求了 HTML 可视化，保存并在浏览器中打开
        if (options.html !== undefined && result.includes('<!DOCTYPE html>')) {
            const { tmpdir } = await import('node:os')
            const { join } = await import('node:path')
            const { writeFile } = await import('node:fs/promises')
            const tmpFile = join(tmpdir(), `aivn-diff-${Date.now()}.html`)
            await writeFile(tmpFile, result, 'utf-8')
            console.log(`\n📄 可视化对比页面已生成: ${tmpFile}`)

            const platform = process.platform
            let openCmd: string
            if (platform === 'win32') {
                openCmd = `start "" "${tmpFile}"`
            } else if (platform === 'darwin') {
                openCmd = `open "${tmpFile}"`
            } else {
                openCmd = `xdg-open "${tmpFile}"`
            }

            try {
                const { execSync } = await import('node:child_process')
                execSync(openCmd, { stdio: 'ignore' })
                console.log('🌐 已在浏览器中打开可视化对比页面')
            } catch {
                console.log('💡 请手动在浏览器中打开上述文件查看对比')
            }
        }

        return
    }

    const versionId = options.id || options.i
    if (!versionId) {
        const head = await readGlobalHead(config)
        if (!head) {
            console.error('❌ 没有版本可对比，请先执行 aivn save')
            process.exit(1)
        }
        return await doDiff(config, head, options)
    }

    await doDiff(config, versionId, options)
}

async function doDiff(config: AIVersionConfig, versionId: string, options: Record<string, string>) {
    const mode = (options.mode || options.m || 'working-tree') as DiffMode
    const commit = options.commit || options.c
    const file = options.file || options.f
    const html = options.html !== undefined

    const modeLabel =
        mode === 'working-tree'
            ? '当前工作区'
            : mode === 'staged'
              ? 'Git 暂存区'
              : `commit ${commit}`

    console.log(`🔍 对比版本 ...${versionId.slice(-12)} vs ${modeLabel}`)

    const diffOpts: DiffOptions = { mode, commit, file, html }
    const result = await diffVersion(config, versionId, diffOpts)

    if (html && result.includes('<!DOCTYPE html>')) {
        // 写入临时 HTML 文件并用浏览器打开
        const { tmpdir } = await import('node:os')
        const tmpFile = join(tmpdir(), `aivn-diff-${Date.now()}.html`)
        await writeFile(tmpFile, result, 'utf-8')
        console.log(`\n📄 可视化对比页面已生成: ${tmpFile}`)

        // 尝试用浏览器打开
        const platform = process.platform
        let openCmd: string
        if (platform === 'win32') {
            openCmd = `start "" "${tmpFile}"`
        } else if (platform === 'darwin') {
            openCmd = `open "${tmpFile}"`
        } else {
            openCmd = `xdg-open "${tmpFile}"`
        }

        try {
            const { execSync } = await import('node:child_process')
            execSync(openCmd, { stdio: 'ignore' })
            console.log('🌐 已在浏览器中打开可视化对比页面')
        } catch {
            console.log('💡 请手动在浏览器中打开上述文件查看对比')
        }
    } else {
        console.log('\n' + result)
    }
}

// ==================== 命令处理：恢复 ====================

async function handleRestore(args: string[]) {
    const options = parseOptions(args)
    const config = await loadConfigFromOptionsWithSession(options)

    const versionId = options.id || options.i
    if (!versionId) {
        console.error('❌ 请指定要恢复的版本 ID')
        console.log('💡 使用 aivn log 查看所有版本，然后 aivn restore <id>')
        process.exit(1)
    }

    const version = await getVersion(config, versionId)
    if (!version) {
        console.error(`❌ 版本 ...${versionId.slice(-12)} 不存在`)
        process.exit(1)
    }

    const fileFilter = options.file || options.f
    const targetFiles = fileFilter ? [fileFilter] : undefined

    console.log(`⏪ 恢复版本 ...${versionId.slice(-12)}`)
    console.log(`  时间: ${new Date(version.timestamp).toLocaleString('zh-CN')}`)
    console.log(`  问题: ${version.question}`)
    console.log(`  所属会话: ${version.sessionId}`)

    if (targetFiles) {
        console.log(`  文件: ${targetFiles[0]}`)
    } else {
        console.log('  💡 恢复前已自动创建备份版本')
    }

    const restoredFiles = await restoreSnapshot(config, version, targetFiles)

    console.log(`\n✅ 已恢复 ${restoredFiles.length} 个文件:`)
    for (const file of restoredFiles) {
        console.log(`  ✓ ${file}`)
    }
}

// ==================== 命令处理：删除版本 ====================

async function handleDrop(args: string[]) {
    const options = parseOptions(args)
    const config = await loadConfigFromOptionsWithSession(options)

    const versionId = options.id || options.i
    if (!versionId) {
        console.error('❌ 请指定要删除的版本 ID')
        process.exit(1)
    }

    console.log(`🗑️  删除版本 ...${versionId.slice(-12)}`)

    const success = await deleteVersion(config, versionId)

    if (success) {
        console.log('✅ 版本已删除')
        console.log('💡 运行 aivn gc 清理孤立的 blob 对象')
    } else {
        console.error(`❌ 版本不存在`)
        process.exit(1)
    }
}

// ==================== 命令处理：清理 ====================

async function handleClean(args: string[]) {
    const options = parseOptions(args)
    const config = await loadConfigFromOptionsWithSession(options)

    const days = options.days ? parseInt(options.days) : config.retentionDays
    const dryRun = options['dry-run'] === 'true' || options.n === 'true'

    if (dryRun) {
        console.log(`🧹 模拟清理 (保留 ${days} 天内的版本)...`)
    } else {
        console.log(`🧹 清理 ${days} 天前的版本...`)
    }

    const result = await cleanOldVersions(config, days, dryRun, {
        sessionId: options.session // 可选：只清理特定会话
    })

    console.log(`\n📊 清理结果:`)
    console.log(`  将删除: ${result.deleted.length} 个版本`)
    console.log(`  将保留: ${result.kept.length} 个版本`)

    if (result.deleted.length > 0) {
        if (dryRun) {
            console.log('\n将删除的版本:')
            for (const id of result.deleted.slice(0, 10)) {
                console.log(`  - ...${id.slice(-12)}`)
            }
            if (result.deleted.length > 10) {
                console.log(`  ... 还有 ${result.deleted.length - 10} 个`)
            }
            console.log('\n💡 这是模拟运行，使用 aivn clean --days <n> 实际执行')
        } else {
            console.log('\n✅ 清理完成')
            console.log('💡 运行 aivn gc 回收磁盘空间')
        }
    } else {
        console.log('\n✅ 没有需要清理的版本')
    }
}

// ==================== 命令处理：统计 ====================

async function handleStats(args: string[]) {
    const options = parseOptions(args)
    const config = await loadConfigFromOptionsWithSession(options)

    console.log('📊 获取存储统计...')

    const stats = await getStoreStats(config)

    const formatSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
    }

    console.log('\n⚙️  存储统计:')
    console.log(`  总版本数: ${stats.versionCount}`)
    console.log(`  会话数: ${stats.sessionCount}`)
    console.log(`  Blob 总数: ${stats.blobCount}`)
    console.log(`  存储占用: ${formatSize(stats.totalSize)}`)
    console.log(`  孤儿 Blob: ${stats.orphanBlobCount}`)
    console.log(`  存储目录: ${config.storeDir}`)

    // 显示各会话统计
    if (stats.perSession && stats.perSession.length > 0) {
        console.log('\n📦 各会话统计:')
        for (const ps of stats.perSession) {
            console.log(`  ${ps.sessionName}: ${ps.versionCount} 个版本`)
        }
    }

    // 显示当前会话
    const currentId = await getCurrentSessionId(config)
    console.log(`\n  当前会话: ${currentId}`)

    if (stats.orphanBlobCount > 0) {
        console.log(`\n💡 有 ${stats.orphanBlobCount} 个孤儿 blob，运行 aivn gc 回收空间`)
    }
}

// ==================== 命令处理：垃圾回收 ====================

async function handleGC(args: string[]) {
    const options = parseOptions(args)
    const config = await loadConfigFromOptionsWithSession(options)

    console.log('🗑️  垃圾回收中...')

    const deleted = await runBlobGC(config)

    if (deleted > 0) {
        console.log(`✅ 已回收 ${deleted} 个孤儿 blob`)
    } else {
        console.log('✅ 没有需要回收的孤儿 blob')
    }
}

// ==================== 命令处理：配置 ====================

async function handleConfig(args: string[]) {
    const options = parseOptions(args)
    const config = await loadConfigFromOptionsWithSession(options)

    if (options['set-days']) {
        const days = parseInt(options['set-days'])
        if (isNaN(days) || days < 0) {
            console.error('❌ 保留天数必须是非负整数')
            process.exit(1)
        }
        config.retentionDays = days
        await saveConfig(config)
        console.log(`✅ 保留天数已设置为: ${days} 天`)
        return
    }

    const globalHead = await readGlobalHead(config)
    const currentSession = await getCurrentSession(config)

    console.log('⚙️  AI 版本管理配置:')
    console.log(`  存储目录: ${config.storeDir}`)
    console.log(`  项目根目录: ${config.projectRoot}`)
    console.log(`  保留天数: ${config.retentionDays} 天 (0 = 永不过期)`)
    console.log(`  全局 HEAD: ${globalHead ? `...${globalHead.slice(-12)}` : '(空)'}`)
    console.log(`  当前会话: ${currentSession?.name || currentSession?.id || '(未设置)'}`)

    if (currentSession?.metadata) {
        console.log(`  会话元信息: ${JSON.stringify(currentSession.metadata)}`)
    }

    console.log('\n💡 配置选项:')
    console.log('   aivn config --set-days <n>     设置保留天数')
    console.log('   aivn session use <name>         切换会话')
    console.log('   AIVN_SESSION_ID=<id>           通过环境变量设置默认会话')
}

// ==================== 工具函数 ====================

function parseOptions(args: string[]): Record<string, string> {
    const options: Record<string, string> = {}

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]

        if (arg.startsWith('--')) {
            const key = arg.slice(2)
            const nextArg = args[i + 1]
            if (nextArg && !nextArg.startsWith('--')) {
                options[key] = nextArg
                i++
            } else {
                options[key] = 'true'
            }
        } else if (arg.startsWith('-')) {
            const key = arg.slice(1)
            const nextArg = args[i + 1]
            if (nextArg && !nextArg.startsWith('-')) {
                options[key] = nextArg
                i++
            } else {
                options[key] = 'true'
            }
        } else if (!options.id) {
            options.id = arg
        } else if (options.id && !options.id2) {
            options.id2 = arg
        }
    }

    return options
}

/**
 * 加载配置（基础版）
 */
async function loadConfigFromOptions(options: Record<string, string>): Promise<AIVersionConfig> {
    const projectRoot = resolve(options.cwd || process.cwd())
    return await loadConfig(projectRoot)
}

/**
 * 加载配置（带会话支持）
 * 支持 --session 参数和环境变量 AIVN_SESSION_ID
 */
async function loadConfigFromOptionsWithSession(
    options: Record<string, string>
): Promise<AIVersionConfig> {
    const projectRoot = resolve(options.cwd || process.cwd())
    const config = await loadConfig(projectRoot)

    // 支持通过 --session 参数指定会话
    if (options.session) {
        config.sessionId = options.session
    }
    // 环境变量已在 getCurrentSessionId 中处理

    return config
}

// ==================== Hook 内容生成 ====================

function getInitHookContent(): string {
    return `/**
 * AIVN Init Hook — CodeBuddy SessionStart 自动初始化
 *
 * 触发事件：SessionStart
 * 功能：检测 aivn 是否已初始化，未初始化则自动执行 npx nut-aivn init
 *
 * CodeBuddy 注入数据格式：
 * {
 *   "hook_event_name": "SessionStart",
 *   "session_id": "会话ID",
 *   "cwd": "工作目录"
 * }
 */

'use strict'

const { execFileSync } = require('child_process')
const { resolve, join } = require('path')
const { existsSync } = require('fs')

// ==================== 工具函数 ====================

function isInitialized(projectRoot) {
    const configFile = join(projectRoot, '.aivnsions', 'config.json')
    return existsSync(configFile)
}

function readStdinSync(timeoutMs) {
    const timeout = timeoutMs || 3000
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(''), timeout)
        const chunks = []
        process.stdin.on('readable', () => {
            let chunk
            while ((chunk = process.stdin.read()) !== null) chunks.push(chunk)
        })
        process.stdin.on('end', () => {
            clearTimeout(timer)
            resolve(Buffer.concat(chunks).toString('utf8'))
        })
        process.stdin.on('error', () => {
            clearTimeout(timer)
            resolve('')
        })
    })
}

// ==================== 主流程 ====================

const PROJECT_ROOT = resolve(__dirname, '..', '..')

async function main() {
    // 非 TTY 才处理（CodeBuddy 通过 stdin 注入事件）
    if (process.stdin.isTTY) return

    // 读取 stdin 数据
    let input = ''
    try {
        input = await readStdinSync(3000)
    } catch {
        return
    }
    if (!input) return

    // 只处理 SessionStart 事件
    let data
    try {
        data = JSON.parse(input)
    } catch {
        return
    }
    if (data.hook_event_name !== 'SessionStart') return

    // 已初始化则跳过
    if (isInitialized(PROJECT_ROOT)) return

    // 自动执行 init
    try {
        execFileSync('npx', ['nut-aivn', 'init', '--cwd', PROJECT_ROOT], {
            cwd: PROJECT_ROOT,
            stdio: 'ignore',
            timeout: 10000,
            env: { ...process.env, NODE_NO_WARNINGS: '1' }
        })
    } catch {
        // 静默失败，不影响正常使用
    }
}

main().catch(() => process.exit(0))
`
}

function getRecordHookContent(): string {
    return `/**
 * AIVN Record Hook — CodeBuddy 会话自动录制钩子
 *
 * 策略：在用户提交下一条消息时（UserPromptSubmit），视为上一轮对话已结束，自动记录。
 * 注意：第一轮对话不会被立刻记录，会在下一轮开始时才被记录。
 *
 * 触发事件：UserPromptSubmit
 * CodeBuddy 注入数据格式：
 * {
 *   "hook_event_name": "UserPromptSubmit",
 *   "prompt": "用户新问题",
 *   "session_id": "会话ID",
 *   "cwd": "工作目录"
 * }
 */

'use strict'

const { execFileSync } = require('child_process')
const { resolve, join } = require('path')
const { existsSync, appendFileSync, readFileSync, writeFileSync } = require('fs')

// ==================== 调试日志 ====================

const DEBUG_ENABLED = true
const DEBUG_LOG = join(__dirname, '..', 'aivn-hook-debug.log')

function debugLog(msg) {
    if (!DEBUG_ENABLED) return
    try {
        const ts = new Date().toISOString()
        appendFileSync(DEBUG_LOG, \`[\${ts}] \${msg}\\n\`, 'utf8')
    } catch {
        // silence
    }
}

// ==================== 工具函数 ====================

/** 读取 stdin（同步） */
function readStdin(timeoutMs) {
    const timeout = timeoutMs || 5000
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(''), timeout)
        const chunks = []
        process.stdin.on('readable', () => {
            let chunk
            while ((chunk = process.stdin.read()) !== null) chunks.push(chunk)
        })
        process.stdin.on('end', () => {
            clearTimeout(timer)
            resolve(Buffer.concat(chunks).toString('utf8'))
        })
        process.stdin.on('error', () => {
            clearTimeout(timer)
            resolve('')
        })
    })
}

/** 安全截断 */
function safeTruncate(str, maxLen) {
    if (!str) return ''
    const s = String(str).trim()
    if (s.length <= maxLen) return s
    return s.slice(0, maxLen - 3) + '...'
}

// ==================== 对话缓存（跨 hook 调用需要） ====================

const CACHE_FILE = join(__dirname, '..', '.aivn-cache.json')

function loadCache() {
    try {
        if (existsSync(CACHE_FILE)) {
            return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'))
        }
    } catch {}
    return {}
}

function saveCache(data) {
    try {
        writeFileSync(CACHE_FILE, JSON.stringify(data), 'utf-8')
    } catch {}
}

/**
 * 核心逻辑：
 * - UserPromptSubmit 触发时，先保存"上一轮"对话（如果有）
 * - 然后将"当前这一轮"的用户问题缓存起来，等下一轮触发时保存
 */
function processHookEvent(input) {
    if (!input || input.trim().length === 0) return null

    try {
        const data = JSON.parse(input)
        const event = data.hook_event_name || ''

        debugLog(\`event: \${event}, prompt_len: \${(data.prompt || '').length}, sid: \${data.session_id || 'N/A'}\`)

        // 只处理 UserPromptSubmit
        if (event !== 'UserPromptSubmit') {
            debugLog(\`skip: event \${event} not handled\`)
            return null
        }

        const currentPrompt = data.prompt || ''
        const sessionId = data.session_id || ''
        const cwd = data.cwd || process.cwd()

        if (!currentPrompt) {
            debugLog('skip: empty prompt')
            return null
        }

        // 读取缓存：上一轮的对话
        const cache = loadCache()
        const prevKey = \`last-\${sessionId}\`
        const previous = cache[prevKey]

        // 缓存当前轮（下一轮触发时使用）
        cache[prevKey] = {
            prompt: currentPrompt,
            sessionId: sessionId,
            cwd: cwd,
            timestamp: Date.now()
        }
        saveCache(cache)

        // 如果有上一轮对话，则保存
        if (previous && previous.prompt) {
            debugLog(\`saving previous round: "\${safeTruncate(previous.prompt, 80)}"\`)
            return {
                question: safeTruncate(previous.prompt, 500),
                solution: \`模型已回复 (\${new Date(previous.timestamp).toLocaleTimeString()})\`,
                sessionId: previous.sessionId,
                cwd: previous.cwd
            }
        }

        debugLog('first message in session, caching for next round')
        return null
    } catch (e) {
        debugLog(\`JSON parse error: \${e.message}\`)
        return null
    }
}

// ==================== CLI 查找 ====================

function findAivnCLI(projectRoot) {
    const distCLI = join(projectRoot, 'dist', 'aivn', 'index.cjs')
    if (existsSync(distCLI)) return distCLI
    return null
}

// ==================== 主流程 ====================

const PROJECT_ROOT = resolve(__dirname, '..', '..')

async function main() {
    debugLog('=== aivn hook START ===')

    // 1. 查找 CLI
    const cliPath = findAivnCLI(PROJECT_ROOT)
    if (!cliPath) {
        debugLog('EXIT: aivn CLI not found')
        return
    }

    // 2. 读取 stdin
    let input = ''
    try {
        if (!process.stdin.isTTY) {
            input = await readStdin(5000)
        }
    } catch (e) {
        debugLog(\`stdin error: \${e.message}\`)
    }

    if (!input) {
        debugLog('EXIT: no stdin data')
        return
    }

    // 3. 处理事件
    const conversation = processHookEvent(input)
    if (!conversation) {
        debugLog('EXIT: no conversation to save')
        return
    }

    // 4. 调用 aivn save
    const args = [
        cliPath,
        'save',
        '--question',
        conversation.question,
        '--solution',
        conversation.solution,
        '--cwd',
        PROJECT_ROOT
    ]

    if (conversation.sessionId) {
        args.push('--session', conversation.sessionId)
    }

    try {
        execFileSync('node', args, {
            cwd: PROJECT_ROOT,
            stdio: 'ignore',
            timeout: 15000,
            env: { ...process.env, NODE_NO_WARNINGS: '1' }
        })
        debugLog(\`save SUCCESS: "\${conversation.question.slice(0, 60)}"\`)
    } catch (e) {
        debugLog(\`save FAILED: \${e.message}\`)
    }

    debugLog('=== aivn hook END ===')
}

main().catch((e) => {
    debugLog(\`FATAL: \${e.message}\`)
    process.exit(0)
})
`
}

function printHelp() {
    console.log(`
🤖 AIVN — AI 会话代码版本管理（多会话版）

用法:
  aivn <命令> [选项]

  aivn session <子命令> [选项]    # 会话管理

命令:
  # === 会话管理 ===
  session create <name>            创建新的独立会话
  session list                     列出所有会话
  session use <id|name>            切换当前会话
  session show                     显示当前会话信息
  session rename <id|name> <new>   重命名会话
  session delete <id|name>         删除会话

  # === 快照管理 ===
  init                            初始化 AI 版本管理
  save                            保存当前工作区为快照
  log                             查看当前会话版本历史
  diff <id>                       对比版本与当前工作区
  diff <idA> <idB>                对比两个版本
  restore <id>                    恢复版本到工作区（自动备份）
  drop <id>                       删除版本

  # === 维护命令 ===
  clean                           清理过期版本
  stats                           查看存储统计信息
  gc                              垃圾回收孤立的 blob 对象
  config                          查看/设置配置

全局选项:
  --cwd                           指定工作目录
  --help, -h                      显示帮助信息

会话相关选项:
  --session <id>                  临时指定会话（覆盖当前设置）

save 命令选项:
  --question, -q                  会话问题描述
  --solution, -s                  模型方案描述
  --tag, -t                       版本标签
  --session <id>                  指定会话

log 命令选项:
  --session <id>                  查看指定会话的历史
  --limit                         显示数量（默认 20）

diff 命令选项:
  --mode, -m                      对比模式: working-tree | staged | commit
  --commit, -c                    指定 Git commit（mode=commit 时）
  --file, -f                      指定文件
  --html                           生成可视化 HTML 对比页面并在浏览器中打开

clean 命令选项:
  --days                          保留天数
  --dry-run, -n                   模拟运行
  --session <id>                  只清理特定会话

环境变量:
  AIVN_SESSION_ID                 默认会话 ID

示例:
  # === 基础使用 ===
  aivn init                       # 初始化（自动创建 default 会话）
  aivn save -q "修复登录页面"     # 保存快照
  aivn log                        # 查看当前会话历史
  aivn diff                       # 对比 HEAD 与工作区
  aivn diff --html                # 可视化对比 HEAD 与工作区（浏览器打开）
  aivn restore session-xxx        # 恢复版本

  # === 多会话场景 ===

  # 终端 1 - 功能开发
  aivn session create "feature-auth"       # 创建功能开发会话
  aivn save -q "添加 OAuth 登录"          # 在 feature-auth 中保存
  aivn log                                 # 只看到 feature-auth 的历史

  # 终端 2 - Bug 修复（同时进行）
  aivn session create "fix-bug-123"        # 创建 Bug 修复会话
  aivn save -q "修复空指针异常"           # 在 fix-bug-123 中保存
  aivn log                                 # 只看到 fix-bug-123 的历史

  # 终端 3 - 查看/对比
  aivn session list                        # 查看所有会话
  aivn log --session feature-auth          # 查看 feature-auth 的历史
  aivn diff vA vB                          # 跨会话对比任意版本
  aivn diff vA vB --html                   # 可视化对比任意两个版本

  # === 高级使用 ===

  # 通过环境变量指定会话
  export AIVN_SESSION_ID=refactor-api
  aivn save -q "重构用户模块"

  # 从某个版本开始新会话
  aivn session create "v2-dev" --base version-xxx

  # 从现有会话分支
  aivn session create "experimental" --from-session sess-xxx

  # 维护
  aivn clean --dry-run                      # 模拟清理
  aivn clean --days 7                      # 清理 7 天前版本
  aivn clean --session old-feature         # 只清理某个旧会话
  aivn gc                                  # 回收磁盘空间
  aivn stats                               # 查看占用情况

设计理念:
  🚫 完全不操作 .git，互不干扰
  📦 内容寻址存储，自动去重
  🔀 多会话并行开发，互不干扰
  ⏪ 随时回退到任意历史版本
  🔒 原子写入 + 写锁，数据安全
  🧹 自动清理 + 手动 GC，不浪费磁盘
`)
}

main()
