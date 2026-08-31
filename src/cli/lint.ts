/**
 * Lint CLI 入口
 *
 * 命令行工具：规则提取、知识库生成、验证和修复
 */

import { existsSync, statSync } from 'node:fs'
import type { RuleSource, GenerateKnowledgeInput, LintInput, FixInput } from '../lint/types'
import {
    extractAllRules,
    generateKnowledgeBase,
    runLint as runLintEngine,
    fixLint,
    detectLintConfig,
    checkFileNaming
} from '../lint'

// ==================== 主函数 ====================

export async function runLint(args: string[]): Promise<void> {
    const command = args[0]

    if (!command || command === '--help' || command === '-h') {
        printHelp()
        return
    }

    try {
        switch (command) {
            case 'extract':
                await handleExtract(args.slice(1))
                break

            case 'knowledge':
                await handleKnowledge(args.slice(1))
                break

            case 'run':
                await handleRun(args.slice(1))
                break

            case 'fix':
                await handleFix(args.slice(1))
                break

            case 'config':
                await handleConfig(args.slice(1))
                break

            case 'check-naming':
                handleCheckNaming(args.slice(1))
                break

            default:
                console.error(`未知命令: ${command}`)
                printHelp()
                process.exit(1)
        }
    } catch (error) {
        console.error(`执行失败: ${error}`)
        process.exit(1)
    }
}

// ==================== 命令处理 ====================

/**
 * 处理规则提取命令
 */
async function handleExtract(args: string[]) {
    const options = parseOptions(args)

    console.log('🔍 开始提取规则...')

    const source = options.source as RuleSource | undefined
    const result = await extractAllRules(options.cwd, source)

    for (const ruleList of result) {
        console.log(`\n📋 ${ruleList.source} 规则:`)
        console.log(`  总规则数: ${ruleList.total}`)
        console.log(`  已废弃: ${ruleList.deprecated}`)

        if (options.verbose) {
            console.log('\n规则列表:')
            for (const rule of ruleList.rules) {
                console.log(`  - ${rule.name}${rule.deprecated ? ' (已废弃)' : ''}`)
            }
        }
    }

    console.log('\n✅ 规则提取完成')
}

/**
 * 处理知识库生成命令
 */
async function handleKnowledge(args: string[]) {
    const options = parseOptions(args)

    console.log('📚 开始生成知识库...')

    const rulesArg = options.rules
    const input: GenerateKnowledgeInput = {
        cwd: options.cwd,
        source: options.source as RuleSource | undefined,
        rules:
            rulesArg && rulesArg !== 'all'
                ? rulesArg.split(',').map((r: string) => r.trim())
                : undefined,
        overwrite: options.overwrite === 'true',
        outputDir: options.outputDir || options['output-dir']
    }

    const result = await generateKnowledgeBase(input)

    console.log(`\n📊 知识库生成完成:`)
    console.log(`  ESLint 规则: ${result.eslint.length}`)
    console.log(`  Stylelint 规则: ${result.stylelint.length}`)
    console.log(`  TypeScript 规则: ${result.typescript.length}`)
    const knowledgeDir = input.outputDir || '.codebuddy/knowledge/lint'
    console.log(`\n💾 知识库已保存到: ${knowledgeDir}/`)

    console.log('\n✅ 知识库生成完成')
}

/**
 * 处理验证命令
 *
 * 输出格式与 ESLint 默认一致：
 *   <文件路径>
 *     <行号>:<列号>  <规则名>  <级别>  <消息>
 *   ✖ N problems (M errors, W warnings)
 */
async function handleRun(args: string[]) {
    const options = parseOptions(args)

    const patterns = getPatterns(options)
    if (patterns.length === 0) {
        console.error('请提供文件模式，例如: nut lint run "src/**/*.ts"')
        process.exit(1)
    }

    const expanded = expandPatterns(patterns)

    console.log('🔎 开始验证...')

    const input: LintInput = {
        patterns: expanded,
        cwd: options.cwd,
        source: options.source as RuleSource | undefined,
        cache: options.cache !== 'false',
        progress: options.progress === 'true'
    }

    const result = await runLintEngine(input)

    // 输出详细问题（ESLint 默认格式）
    if (result.totalIssues > 0) {
        for (const fileResult of result.results) {
            if (fileResult.issues.length === 0) continue
            console.log(`\n${fileResult.filePath}`)
            for (const issue of fileResult.issues) {
                const sev = issue.severity === 'error' ? 'error' : 'warning'
                console.log(
                    `  ${issue.line}:${issue.column}  ${issue.ruleName}  ${sev}  ${issue.message}`
                )
            }
        }
    }

    console.log(
        `\n✖ ${result.totalIssues} problems (${result.totalErrors} errors, ${result.totalWarnings} warnings)`
    )
    if (result.fixableIssues > 0) {
        console.log(
            `  ${result.fixableIssues} errors and ${result.fixableIssues} warnings potentially fixable with \`nut lint fix\` command`
        )
    }

    console.log('\n✅ 验证完成')

    if (result.totalErrors > 0) {
        process.exit(1)
    }
}

/**
 * 处理修复命令
 */
async function handleFix(args: string[]) {
    const options = parseOptions(args)

    const patterns = getPatterns(options)
    if (patterns.length === 0) {
        console.error('请提供文件模式，例如: nut lint fix "src/**/*.ts" --write')
        process.exit(1)
    }

    const expanded = expandPatterns(patterns)

    console.log('🔧 开始修复...')

    const input: FixInput = {
        patterns: expanded,
        cwd: options.cwd,
        source: options.source as RuleSource | undefined,
        options: {
            write: options.write === 'true' || options.write === undefined,
            fixAll: options.fixAll !== 'false',
            rules: options.rules?.split(',').map((r: string) => r.trim()),
            maxFixes: options.maxFixes ? parseInt(options.maxFixes) : 10,
            skipErrors: options.skipErrors === 'true'
        }
    }

    const result = await fixLint(input)

    console.log(`\n📊 修复结果:`)
    console.log(`  总文件数: ${result.totalFiles}`)
    console.log(`  成功修复: ${result.successFiles}`)
    console.log(`  修复失败: ${result.failedFiles}`)
    console.log(`  修复问题数: ${result.totalFixed}`)
    console.log(`  剩余问题数: ${result.totalRemaining}`)

    // 修复后自动验证，输出剩余问题（ESLint 默认格式）
    if (result.totalRemaining > 0 || result.failedFiles > 0) {
        console.log('\n🔄 修复后验证中...')

        const verifyInput: LintInput = {
            patterns: expanded,
            cwd: options.cwd,
            source: options.source as RuleSource | undefined
        }
        const verifyResult = await runLintEngine(verifyInput)

        if (verifyResult.totalIssues > 0) {
            for (const fileResult of verifyResult.results) {
                if (fileResult.issues.length === 0) continue
                console.log(`\n${fileResult.filePath}`)
                for (const issue of fileResult.issues) {
                    const sev = issue.severity === 'error' ? 'error' : 'warning'
                    console.log(
                        `  ${issue.line}:${issue.column}  ${issue.ruleName}  ${sev}  ${issue.message}`
                    )
                }
            }
        }

        console.log(
            `\n✖ ${verifyResult.totalIssues} problems (${verifyResult.totalErrors} errors, ${verifyResult.totalWarnings} warnings)`
        )
    } else {
        console.log('\n✅ 所有问题已修复')
    }

    console.log('\n✅ 修复完成')
}

/**
 * 处理配置检测命令
 */
async function handleConfig(args: string[]) {
    const options = parseOptions(args)

    console.log('🔍 检测项目 Lint 配置...')

    const result = await detectLintConfig(options.cwd)

    console.log(`\n📋 项目配置:`)
    console.log(`  项目根目录: ${result.rootDir}`)
    console.log(`  有 ESLint: ${result.hasEslint ? '✅' : '❌'}`)
    console.log(`  有 Stylelint: ${result.hasStylelint ? '✅' : '❌'}`)
    console.log(`  有 TypeScript: ${result.hasTypeScript ? '✅' : '❌'}`)

    if (result.eslintConfigPath) {
        console.log(`  ESLint 配置: ${result.eslintConfigPath}`)
    }

    if (result.stylelintConfigPath) {
        console.log(`  Stylelint 配置: ${result.stylelintConfigPath}`)
    }

    console.log('\n✅ 配置检测完成')
}

// ==================== 工具函数 ====================

/**
 * 解析选项
 *
 * 支持：
 *   --key value     → options.key = value
 *   --flag          → options.flag = 'true'
 *   位置参数         → options.patterns = string[]（收集所有位置参数）
 */
function parseOptions(args: string[]): Record<string, string> {
    const options: Record<string, string> = {}
    const patterns: string[] = []

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]

        if (arg.startsWith('--')) {
            const key = arg.slice(2)
            const next = args[i + 1]
            // 下一个是 --xxx 或不存在 → 当前是 flag（boolean）
            // 否则 next 是值
            const value = !next || next.startsWith('--') ? 'true' : next
            options[key] = value
            if (value !== 'true') i++
        } else {
            // 位置参数 → 收集到 patterns 数组
            patterns.push(arg)
        }
    }

    if (patterns.length > 0) {
        options.patterns = patterns.join('\n')
    }

    return options
}

/**
 * 从解析后的选项中获取 patterns 数组
 */
function getPatterns(options: Record<string, string>): string[] {
    if (!options.patterns) return []
    return options.patterns.split('\n').filter(Boolean)
}

/**
 * 展开目录为 glob 模式
 *
 * 裸目录自动追加递归通配符 + 文件扩展名
 * 已有通配符（星号或问号）的模式原样返回
 */
function expandPatterns(patterns: string[]): string[] {
    const extensions = '{js,ts,jsx,tsx,vue,scss,css}'

    return patterns.map((p) => {
        // 已有通配符 → 原样返回
        if (p.includes('*') || p.includes('?')) return p

        // 检查是否是目录
        try {
            if (existsSync(p) && statSync(p).isDirectory()) {
                return `${p}/**/*.${extensions}`
            }
        } catch {
            // 路径不可访问，原样返回
        }

        return p
    })
}

/**
 * 处理文件命名规范检查命令
 *
 * 用法：nut lint check-naming <patterns...>
 *   nut lint check-naming "src/components/*.ts"
 *   nut lint check-naming src/components
 */
function handleCheckNaming(args: string[]) {
    const options = parseOptions(args)
    const patterns = getPatterns(options)

    if (patterns.length === 0) {
        console.error('请提供要检查的文件或目录')
        console.error('示例: nut lint check-naming "src/**/*.{ts,tsx}"')
        process.exit(1)
    }

    const expanded = expandPatterns(patterns).filter(
        (p) => /\.(ts|tsx|js|jsx)$/.test(p) || p.includes('*')
    )

    if (expanded.length === 0) {
        console.error('未匹配到 .ts/.tsx 文件')
        process.exit(1)
    }

    const result = checkFileNaming(expanded, options.cwd || process.cwd())

    if (result.passed) {
        console.log(`✓ 文件命名规范检查通过 (${result.checkedFiles} 文件)`)
        return
    }

    console.log(`✖ ${result.violations.length} 个命名违规:`)
    for (const v of result.violations) {
        console.log(`  ❌ ${v.message}`)
    }
    console.log(`\n✖ ${result.violations.length} problems`)
    process.exit(1)
}

/**
 * 打印帮助信息
 */
function printHelp() {
    console.log(`
🔧 Lint 工具 - 命令行接口

用法:
  nut lint <命令> [选项] <patterns...>

命令:
  extract        提取 ESLint 和 Stylelint 规则
  knowledge      生成规则知识库
  run            执行 Lint 验证
  fix            修复 Lint 错误
  config         检测项目 Lint 配置
  check-naming   文件命名规范检查（kebab-case / 单一导出 / Hook 命名）

选项:
  --cwd <path>        工作目录
  --source <source>   规则来源 (eslint/stylelint)
  --write             写入文件（fix 命令）
  --verbose           显示详细信息
  --help, -h          显示帮助信息

patterns:
  支持单文件、多文件、目录、glob 模式或混合：
  单文件:    src/index.ts
  多文件:    src/index.ts src/types.ts
  目录:      src/helpers（自动展开为 src/helpers/**/*.{js,ts,...}）
  glob:      "src/**/*.ts"
  混合:      src/components/Button.tsx src/hooks

输出格式（与 ESLint 默认一致）:
  <文件路径>
    <行号>:<列号>  <规则名>  <级别>  <消息>
  ✖ N problems (M errors, W warnings)

示例:
  # 提取所有规则
  nut lint extract

  # 生成知识库
  nut lint knowledge --source eslint

  # 验证单文件
  nut lint run src/index.ts

  # 验证多文件
  nut lint run src/index.ts src/types.ts

  # 验证目录
  nut lint run src/helpers

  # 验证 glob
  nut lint run "src/**/*.ts"

  # 修复错误
  nut lint fix src/index.ts --write
  nut lint fix src/helpers --write

  # 文件命名规范检查（收敛型门禁）
  nut lint check-naming "src/**/*.{ts,tsx}"
  nut lint check-naming src/components
`)
}

// ==================== 入口 ====================
