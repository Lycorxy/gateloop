/**
 * Lint CLI 入口
 *
 * 命令行工具：规则提取、知识库生成、验证和修复
 */

import type { RuleSource, GenerateKnowledgeInput, LintInput, FixInput } from '../lint/types'
import { extractAllRules, generateKnowledgeBase, runLint, fixLint, detectLintConfig } from '../lint'

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
 */
async function handleRun(args: string[]) {
    const options = parseOptions(args)

    if (!options.patterns) {
        console.error('请提供文件模式，例如: nut_lint run "src/**/*.ts"')
        process.exit(1)
    }

    console.log('🔎 开始验证...')

    const input: LintInput = {
        patterns: options.patterns,
        cwd: options.cwd,
        source: options.source as RuleSource | undefined,
        cache: options.cache !== 'false',
        progress: options.progress === 'true'
    }

    const result = await runLint(input)

    console.log(`\n📊 验证结果:`)
    console.log(`  总文件数: ${result.totalFiles}`)
    console.log(`  成功文件: ${result.successFiles}`)
    console.log(`  失败文件: ${result.failedFiles}`)
    console.log(`  总问题数: ${result.totalIssues}`)
    console.log(`  错误数: ${result.totalErrors}`)
    console.log(`  警告数: ${result.totalWarnings}`)
    console.log(`  可修复数: ${result.fixableIssues}`)

    if (options.output) {
        console.log(`\n💾 详细结果已保存到: ${options.output}`)
    }

    console.log('\n✅ 验证完成')

    // 如果有错误，退出码为 1
    if (result.totalErrors > 0) {
        process.exit(1)
    }
}

/**
 * 处理修复命令
 */
async function handleFix(args: string[]) {
    const options = parseOptions(args)

    if (!options.patterns) {
        console.error('请提供文件模式，例如: nut_lint fix "src/**/*.ts"')
        process.exit(1)
    }

    console.log('🔧 开始修复...')

    const input: FixInput = {
        patterns: options.patterns,
        cwd: options.cwd,
        source: options.source as RuleSource | undefined,
        options: {
            write: options.write === 'true',
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

    // 修复后自动运行验证，检查遗留问题
    if (result.totalRemaining > 0 || result.failedFiles > 0) {
        console.log('\n🔄 修复后验证中...')

        const verifyInput: LintInput = {
            patterns: options.patterns,
            cwd: options.cwd,
            source: options.source as RuleSource | undefined
        }
        const verifyResult = await runLint(verifyInput)

        console.log(`\n📊 验证结果:`)
        console.log(`  总文件数: ${verifyResult.totalFiles}`)
        console.log(`  成功文件: ${verifyResult.successFiles}`)
        console.log(`  失败文件: ${verifyResult.failedFiles}`)
        console.log(`  总问题数: ${verifyResult.totalIssues}`)
        console.log(`  错误数: ${verifyResult.totalErrors}`)
        console.log(`  警告数: ${verifyResult.totalWarnings}`)
        console.log(`  可修复数: ${verifyResult.fixableIssues}`)

        if (verifyResult.totalErrors > 0) {
            console.log('\n⚠️  仍有未修复的问题，请手动修复：')
            for (const fileResult of verifyResult.results) {
                if (fileResult.issues.length > 0) {
                    console.log(`\n  📄 ${fileResult.filePath}`)
                    for (const issue of fileResult.issues) {
                        console.log(
                            `    ${issue.severity === 'error' ? '❌' : '⚠️'}  ${issue.ruleName}: ${issue.message} (line ${issue.line})`
                        )
                    }
                }
            }
        }
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
 */
function parseOptions(args: string[]): Record<string, string> {
    const options: Record<string, string> = {}

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]

        if (arg.startsWith('--')) {
            const key = arg.slice(2)
            const value = args[i + 1]?.startsWith('--') ? 'true' : args[i + 1]
            options[key] = value
            if (value !== 'true') i++
        } else if (!options.patterns) {
            options.patterns = arg
        }
    }

    return options
}

/**
 * 打印帮助信息
 */
function printHelp() {
    console.log(`
🔧 Lint 工具 - 命令行接口

用法:
  nut_lint <命令> [选项]

命令:
  extract     提取 ESLint 和 Stylelint 规则
  knowledge   生成规则知识库
  run         执行 Lint 验证
  fix         修复 Lint 错误
  config      检测项目 Lint 配置

选项:
  --cwd <path>        工作目录
  --source <source>   规则来源 (eslint/stylelint)
  --patterns <glob>   文件模式
  --write             写入文件
  --verbose           显示详细信息
  --help, -h         显示帮助信息

示例:
  # 提取所有规则
  nut_lint extract

  # 生成知识库
  nut_lint knowledge --source eslint

  # 验证文件
  nut_lint run "src/**/*.ts"

  # 修复错误
  nut_lint fix "src/**/*.ts" --write
`)
}

// ==================== 入口 ====================

main()
