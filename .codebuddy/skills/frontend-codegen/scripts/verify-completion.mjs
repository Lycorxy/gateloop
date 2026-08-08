#!/usr/bin/env node
/**
 * verify-completion.mjs — 完成度闭环验证（code 阶段末尾）
 *
 * 重跑 inventory 扫描，校验所有违规已消除（或已声明 excluded）：
 *   断言: 当前 violations - plan.coverage.excluded.path == ∅
 *
 * 这是核心闭环：就算模型全部造假，最后引擎重跑脚本，只要还有超限文件
 * 且未声明 excluded，直接 FAIL。
 *
 * 用法：
 *   node verify-completion.mjs --root src --plan <path> [--ext .ts,.tsx]
 * exit 0 = 通过，exit 1 = 失败（附剩余违规清单）
 */

import { readFileSync } from 'node:fs'
import { scanInventory } from './inventory.mjs'

function parseArgs(argv) {
    const args = { root: 'src', plan: '', ext: '.ts,.tsx' }
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--root') args.root = argv[++i]
        else if (argv[i] === '--plan') args.plan = argv[++i]
        else if (argv[i] === '--ext') args.ext = argv[++i]
    }
    return args
}

function main() {
    const args = parseArgs(process.argv)
    const errors = []

    let plan
    try {
        plan = JSON.parse(readFileSync(args.plan, 'utf8'))
    } catch {
        console.error(`[verify-completion] FAIL: 无法读取 plan: ${args.plan}`)
        process.exit(1)
    }

    const coverage = plan.frontendPlan?.coverage || plan.coverage
    const excluded = new Set(coverage?.excluded?.map((e) => e.path) || [])

    // 重跑扫描（客观事实，模型无法伪造）
    const extensions = args.ext.split(',').map((e) => e.trim())
    const files = scanInventory(args.root, extensions)
    const violations = files.filter((f) => f.violated).map((f) => f.path)

    // 断言: 违规为空 或 全部在 excluded 中
    const remaining = violations.filter((v) => !excluded.has(v))
    if (remaining.length > 0) {
        errors.push(`remaining-violations (${remaining.length}):`)
        remaining.forEach((v) => {
            const f = files.find((x) => x.path === v)
            errors.push(`  ${v} (${f.lines}/${f.limit} 行)`)
        })
    }

    if (errors.length > 0) {
        console.error('[verify-completion] FAIL: 仍有未消除的违规')
        errors.forEach((e) => console.error('  ✖', e))
        process.exit(1)
    }
    console.log(`[verify-completion] PASS: 无剩余违规（扫描 ${files.length} 个文件）`)
    process.exit(0)
}

main()
