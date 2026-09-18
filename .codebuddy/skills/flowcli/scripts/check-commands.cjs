#!/usr/bin/env node
/**
 * flowcli skill 命令一致性自检（路径1：脚本检测，exit code 判定，100% 准确）
 *
 * 校验 references/*.md 与 SKILL.md 中出现的 flowcli / gitflow 命令，
 * 与 src 实际注册的命令是否一致。
 *
 * 用法：node scripts/check-commands.js   （在 .codebuddy/skills/flowcli 目录下执行）
 * 输出：exit 0 = 全部一致；exit 1 = 存在文档命令未注册（并逐条列出）
 */
const fs = require('fs')
const path = require('path')

const SKILL_DIR = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(SKILL_DIR, '../../..')

// ★ 可移植降级：非 flowcli 源码仓环境（knote/imate 分发后）无 src 可比对，友好跳过
// 必须检查全部依赖的源文件（只查 src/index.ts 会误判——其他仓库也可能有同名入口）
const REQUIRED_SRC = [path.join('src', 'index.ts'), path.join('src', 'cli', 'git', 'index.ts')]
if (REQUIRED_SRC.some((f) => !fs.existsSync(path.join(REPO_ROOT, f)))) {
    console.log(
        '[check-commands] SKIP: 当前不在 flowcli 源码仓内（未找到 src/index.ts 或 src/cli/git/index.ts），一致性自检仅适用于源码仓环境'
    )
    process.exit(0)
}

// ==================== 1. 收集 src 已注册命令 ====================

const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8')

// 顶层命令：src/index.ts 中 program.command('xxx')（gitflow 例外，注册在 cli/git 中）
const collectTopCommands = () => {
    const src = read('src/index.ts')
    const set = new Set()
    const re = /\.command\('([^']+)'\)/g
    let m
    while ((m = re.exec(src))) set.add(m[1].split(/\s/)[0])
    return set
}

// gitflow 子命令：src/cli/git/index.ts 中全部 .command('xxx')（含 gitflow 本身）
const collectGitCommands = () => {
    const src = read('src/cli/git/index.ts')
    const set = new Set()
    const re = /\.command\('([^']+)'\)/g
    let m
    while ((m = re.exec(src))) set.add(m[1].split(/\s/)[0])
    return set
}

// ==================== 2. 收集文档中的命令用法 ====================

const DOC_FILES = [
    'SKILL.md',
    'RULE.mdc',
    path.join('references', 'environment.md'),
    path.join('references', 'pipeline-guide.md'),
    path.join('references', 'gitflow-guide.md'),
    path.join('examples', 'triggers.md')
]

const collectDocCommands = () => {
    const usages = [] // { file, line, raw, kind, name }
    for (const f of DOC_FILES) {
        const fp = path.join(SKILL_DIR, f)
        if (!fs.existsSync(fp)) continue
        const lines = fs.readFileSync(fp, 'utf8').split('\n')
        lines.forEach((line, i) => {
            let m
            // flowcli <top> [args]（仅小写字母开头，避免误匹配中文语境中的 MR/Tag 等大写词）
            const reFlowcli = /\bflowcli\s+([a-z][a-zA-Z0-9-]*)/g
            while ((m = reFlowcli.exec(line))) {
                usages.push({ file: f, line: i + 1, raw: m[0], kind: 'top', name: m[1] })
            }
            // flowcli gitflow <sub> / gitflow <sub>
            const reGit = /\bgitflow\s+([a-z][a-zA-Z0-9-]*)/g
            while ((m = reGit.exec(line))) {
                usages.push({ file: f, line: i + 1, raw: m[0], kind: 'git', name: m[1] })
            }
        })
    }
    return usages
}

// ==================== 3. 校验 ====================

const main = () => {
    const topCmds = collectTopCommands()
    const gitCmds = collectGitCommands()
    const usages = collectDocCommands()

    const errors = []
    for (const u of usages) {
        let ok = false
        if (u.kind === 'top') {
            // gitflow 顶层命令注册在 cli/git/index.ts，转由 git 集合校验
            ok = u.name === 'gitflow' ? gitCmds.has(u.name) : topCmds.has(u.name)
        } else if (u.kind === 'git') {
            ok = gitCmds.has(u.name)
        }
        if (!ok) {
            errors.push(`  [未注册] ${u.file}:${u.line}  "${u.raw}"  (kind=${u.kind})`)
        }
    }

    console.log(`已注册命令：顶层 ${topCmds.size} 个，gitflow 子命令 ${gitCmds.size} 个`)
    console.log(`文档命令用法：${usages.length} 处`)

    if (errors.length) {
        console.error(`\n检测到 ${errors.length} 处文档命令与 src 注册不一致：`)
        errors.forEach((e) => console.error(e))
        console.error('\n请修正文档或补充 src 命令注册。')
        process.exit(1)
    }
    console.log('✓ 全部一致')
    process.exit(0)
}

main()
