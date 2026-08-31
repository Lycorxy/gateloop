// Format CLI 入口
//
// 命令行工具：直接格式化代码（类似编辑器「保存时自动格式化」）
//   nut format src/**/*.ts
//   nut format src --check
//   nut format src --formatter prettier

import { existsSync, statSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import { glob } from 'glob'
import { ESLINT_EXTENSIONS, PRETTIER_EXTENSIONS } from '../format'
import { formatFile } from '../format/formatter'
import type { FormatterType } from '../format'

// ==================== 主函数 ====================

export async function runFormat(args: string[]): Promise<void> {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printHelp()
        return
    }

    const options = parseOptions(args)
    const patterns = getPatterns(options)
    if (patterns.length === 0) {
        console.error('请提供文件模式，例如: nut format "src/**/*.ts"')
        process.exit(1)
    }

    const cwd = options.cwd || process.cwd()
    const check = options.check === 'true'
    const write = options.write === 'true' || (options.write === undefined && !check)
    const forceFormatter = (options.formatter as FormatterType) || undefined

    const files = await resolveFiles(patterns, cwd)
    if (files.length === 0) {
        console.log('⚠️ 没有匹配到可格式化的文件')
        return
    }

    console.log(`🎨 开始格式化 ${files.length} 个文件...`)

    let changed = 0
    let failed = 0
    const failures: string[] = []

    for (const file of files) {
        const result = await formatFile(file, cwd, { write, forceFormatter })
        if (result.errors.length > 0) {
            failed++
            failures.push(`${file}: ${result.errors.join('; ')}`)
        } else if (result.changed) {
            changed++
        }
    }

    console.log(`\n📊 格式化结果:`)
    console.log(`  总文件数: ${files.length}`)
    console.log(`  格式变更: ${changed}`)
    console.log(`  处理失败: ${failed}`)
    if (failures.length > 0) {
        console.log('\n❌ 失败详情:')
        for (const f of failures) console.log(`  ${f}`)
    }
    console.log('\n✅ 格式化完成')

    if (failed > 0) process.exit(1)
    if (check && changed > 0) {
        console.log(`\n⚠️ ${changed} 个文件格式不符合规范，请运行 \`nut format\` 修复`)
        process.exit(1)
    }
}

// ==================== 文件解析 ====================

const FORMATABLE_EXT = new Set<string>([...ESLINT_EXTENSIONS, ...PRETTIER_EXTENSIONS])

async function resolveFiles(patterns: string[], cwd: string): Promise<string[]> {
    const collected = new Set<string>()

    for (const pattern of patterns) {
        if (pattern.includes('*') || pattern.includes('?')) {
            const matched = await glob(pattern, { cwd, absolute: true, nodir: true })
            for (const m of matched) collected.add(m)
        } else {
            const abs = resolve(cwd, pattern)
            if (existsSync(abs) && statSync(abs).isDirectory()) {
                const matched = await glob(`${pattern}/**/*`, { cwd, absolute: true, nodir: true })
                for (const m of matched) collected.add(m)
            } else {
                collected.add(abs)
            }
        }
    }

    return [...collected].filter((f) => FORMATABLE_EXT.has(extname(f).toLowerCase()))
}

// ==================== 选项解析 ====================

function parseOptions(args: string[]): Record<string, string> {
    const options: Record<string, string> = {}
    const patterns: string[] = []

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        if (arg.startsWith('--')) {
            const key = arg.slice(2)
            const next = args[i + 1]
            const value = !next || next.startsWith('--') ? 'true' : next
            options[key] = value
            if (value !== 'true') i++
        } else {
            patterns.push(arg)
        }
    }

    if (patterns.length > 0) options.patterns = patterns.join('\n')
    return options
}

function getPatterns(options: Record<string, string>): string[] {
    if (!options.patterns) return []
    return options.patterns.split('\n').filter(Boolean)
}

// ==================== 帮助 ====================

function printHelp(): void {
    console.log(`
🎨 代码格式化工具 - 命令行接口

用法:
  nut format <patterns...> [选项]

选项:
  --write           写入文件（默认开启；与 --check 互斥）
  --check           仅检查格式是否符合规范，不写入（CI / 提交前校验）
  --formatter       强制使用的格式化工具 (prettier/eslint/both)
  --cwd <path>      工作目录（默认当前目录）
  --help, -h        显示帮助信息

patterns:
  支持单文件、目录、glob 模式或混合：
  单文件:    nut format src/index.ts
  目录:      nut format src（递归格式化目录内所有可格式化文件）
  glob:      nut format "src/**/*.ts"
  混合:      nut format src/helpers src/cli

示例:
  # 格式化整个 src 目录（类似保存时自动格式化）
  nut format src

  # 只检查不规范文件，不写入
  nut format src --check

  # 强制用 prettier 格式化
  nut format "src/**/*.ts" --formatter prettier
`)
}
