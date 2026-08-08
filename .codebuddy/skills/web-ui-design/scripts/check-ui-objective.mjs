#!/usr/bin/env node
/**
 * check-ui-objective.mjs — UI 设计稿客观完备性校验（档1·脚本判定·exit code）
 *
 * 校验 ui-design.json 的客观项（schema 校验不了的 数量/长度/非空 约束）：
 *   1. 功能清单非空（functions ≥ 1）
 *   2. 导航条目 ≤ 9（米勒定律 7±2）
 *   3. 布局方案对比 ≥ 2（强制取舍，不允许直接定方案）
 *   4. 线框图非空且 ≥ 50 字符（ASCII 线框不是占位）
 *   5. 状态覆盖四态都有处理方案（空/加载/错误/成功）
 *   6. 用户目标非空（目标导向设计，非功能清单）
 *   7. 每个交互点有 rationale（交互论证非空）
 *
 * ★ 三档分工说明：
 *   本脚本只校验"设计稿完备性"（档1·可客观判定）。
 *   代码级客观项（间距4px网格/触控≥44px/对比度≥4.5:1/focus态/动效时长）
 *   归下游编码阶段（css-style-writer 间距已覆盖 / code-quality-guard），
 *   本脚本不重复——设计阶段无代码可扫。
 *   主观设计决策（布局哪个优/交互是否消除鸿沟）归 review.model（档2）。
 *
 * 用法：node check-ui-objective.mjs --design <path>
 * exit 0 = 通过，exit 1 = 失败（附缺失项清单）
 */
import { readFileSync } from 'node:fs'

function parseArgs(argv) {
    const args = { design: '' }
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--design') args.design = argv[++i]
    }
    return args
}

function main() {
    const args = parseArgs(process.argv)
    const errors = []

    let design
    try {
        design = JSON.parse(readFileSync(args.design, 'utf8'))
    } catch {
        console.error(`[check-ui-objective] FAIL: 无法读取设计稿: ${args.design}`)
        process.exit(1)
    }

    // 1. 功能清单非空
    const functions = design.functions || design.requirement?.functions || []
    if (!Array.isArray(functions) || functions.length === 0) {
        errors.push('functions: 功能清单为空（至少 1 项）')
    }

    // 2. 导航条目 ≤ 9（米勒定律 7±2）
    const nav = design.informationArchitecture?.navigation || []
    if (Array.isArray(nav) && nav.length > 9) {
        errors.push(
            `informationArchitecture.navigation: ${nav.length} 项 > 9（米勒定律 7±2，主导航条目控制 5-9）`
        )
    }

    // 3. 布局方案对比 ≥ 2（强制取舍）
    const options = design.layoutDecisions?.options || []
    if (!Array.isArray(options) || options.length < 2) {
        errors.push('layoutDecisions.options: 方案对比 < 2（强制至少 2 种方案量化取舍）')
    }

    // 4. 线框图非空且 ≥ 50 字符
    const wireframe = design.wireframe || ''
    if (typeof wireframe !== 'string' || wireframe.trim().length < 50) {
        errors.push('wireframe: 线框图为空或过短（< 50 字符，需 ASCII 线框表达布局/层级/交互流向）')
    }

    // 5. 状态覆盖四态都有处理方案（空/加载/错误/成功）
    // 阈值 < 2：防空/纯空格，允许短描述（"骨架屏""重试"等中文 2-4 字合法）
    const states = design.stateCoverage || {}
    for (const key of ['empty', 'loading', 'error', 'success']) {
        const val = states[key]
        if (!val || (typeof val === 'string' && val.trim().length < 2)) {
            errors.push(`stateCoverage.${key}: 状态处理方案缺失（需具体处理策略，非空）`)
        }
    }

    // 6. 用户目标非空（目标导向设计，非功能清单）
    const userGoal = design.requirement?.userGoal || ''
    if (typeof userGoal !== 'string' || userGoal.trim().length < 5) {
        errors.push(
            'requirement.userGoal: 用户目标缺失或过短（目标导向设计，区分用户目标/任务/功能）'
        )
    }

    // 7. 每个交互点有 rationale（交互论证非空）
    const interactions =
        design.interactionDesign?.points || design.interactionDesign?.interactions || []
    if (Array.isArray(interactions)) {
        interactions.forEach((p, i) => {
            const r = p.rationale || p.reason || ''
            if (typeof r !== 'string' || r.trim().length < 5) {
                errors.push(`interactionDesign[${i}]: 交互点缺 rationale（交互论证非空，需说明选型理由）`)
            }
        })
    }

    if (errors.length > 0) {
        console.error(`[check-ui-objective] FAIL: 设计稿客观完备性未通过（${errors.length} 项）`)
        errors.forEach((e) => console.error('  ✖', e))
        process.exit(1)
    }
    console.log(`[check-ui-objective] PASS: 设计稿客观完备性通过（7 项检查全过）`)
    process.exit(0)
}

main()
