#!/usr/bin/env node
/**
 * verify-coverage.mjs — 集合闭包验证（design 阶段）
 *
 * 校验 frontendPlan.coverage 是否覆盖 inventory.violations：
 *   断言1: plan.coverage.inventoryHash == inventory.hash（防用旧数据）
 *   断言2: inventory.violations - plan.coverage.targets - plan.coverage.excluded.path == ∅（防漏处理）
 *   断言3: 每个 excluded 项必须有 reason（≥10 字符，防甩锅）
 *
 * 用法：
 *   node verify-coverage.mjs --inventory <path> --plan <path>
 * exit 0 = 通过，exit 1 = 失败（附具体清单）
 */

import { readFileSync } from 'node:fs'

function parseArgs(argv) {
    const args = { inventory: '', plan: '' }
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--inventory') args.inventory = argv[++i]
        else if (argv[i] === '--plan') args.plan = argv[++i]
    }
    return args
}

function readJson(p) {
    return JSON.parse(readFileSync(p, 'utf8'))
}

function main() {
    const args = parseArgs(process.argv)
    const errors = []

    let inv, plan
    try {
        inv = readJson(args.inventory)
    } catch {
        console.error(`[verify-coverage] FAIL: 无法读取 inventory: ${args.inventory}`)
        process.exit(1)
    }
    try {
        plan = readJson(args.plan)
    } catch {
        console.error(`[verify-coverage] FAIL: 无法读取 plan: ${args.plan}`)
        process.exit(1)
    }

    // 兼容 plan.frontendPlan.coverage 或 plan.coverage 两种结构
    const coverage = plan.frontendPlan?.coverage || plan.coverage

    if (!coverage) {
        errors.push('plan 缺少 coverage 字段（frontendPlan.coverage）')
    } else {
        // 断言1: hash 匹配（防用旧 inventory 写 plan）
        if (coverage.inventoryHash !== inv.hash) {
            errors.push(
                `hash-mismatch: plan.inventoryHash=${coverage.inventoryHash || '(空)'} inv.hash=${inv.hash}`
            )
        }
        // 断言2: 违规集合被覆盖（targets ∪ excluded ⊇ violations）
        const targets = new Set(coverage.targets || [])
        const excluded = new Set((coverage.excluded || []).map((e) => e.path))
        const uncovered = (inv.violations || []).filter(
            (v) => !targets.has(v) && !excluded.has(v)
        )
        if (uncovered.length > 0) {
            errors.push(`uncovered-violations (${uncovered.length}): ${uncovered.join(', ')}`)
        }
        // 断言3: excluded 必须有 reason（≥10 字符）
        const badExcluded = (coverage.excluded || []).filter(
            (e) => !e.reason || String(e.reason).trim().length < 10
        )
        if (badExcluded.length > 0) {
            errors.push(
                `excluded-without-reason: ${badExcluded.map((e) => e.path).join(', ')}`
            )
        }
    }

    if (errors.length > 0) {
        console.error('[verify-coverage] FAIL')
        errors.forEach((e) => console.error('  ✖', e))
        process.exit(1)
    }
    console.log(
        `[verify-coverage] PASS: ${inv.violations?.length || 0} 项违规全部被 coverage 覆盖`
    )
    process.exit(0)
}

main()
