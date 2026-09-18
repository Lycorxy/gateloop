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
 *   8. 视觉设计概念非空（keywords ≥2 + mood——设计感源头，禁止跳过）
 *   9. 色彩系统完备（primary 主色 + neutral 中性色阶）
 *   10. 字体系统完备（fontFamilies 字族 + scale 字号阶梯）
 *   11. 页面背景处理非空（禁止纯白/纯灰裸奔无说明）
 *   12. 签名元素非空（标志性记忆点 ≥8 字符）
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

    // 8. 视觉设计概念非空（keywords ≥2 + mood——设计感的源头，禁止跳过）
    const vd = design.visualDesign || {}
    const concept = vd.designConcept || {}
    const conceptKeywords = concept.keywords || concept.style || ''
    const conceptMood = concept.mood || ''
    const kwOk = Array.isArray(conceptKeywords)
        ? conceptKeywords.length >= 2
        : typeof conceptKeywords === 'string' && conceptKeywords.trim().length >= 2
    const moodOk = typeof conceptMood === 'string' && conceptMood.trim().length >= 2
    if (!kwOk || !moodOk) {
        errors.push(
            'visualDesign.designConcept: 设计概念缺失（需 keywords≥2 个风格关键词 + mood 气质描述——设计感从概念开始，禁止跳过直接套经典模板）'
        )
    }

    // 9. 色彩系统完备（primary 主色 + neutral 中性色阶）
    const palette = vd.palette || {}
    const primary = palette.primary || palette.brand || ''
    const primaryOk =
        (typeof primary === 'string' && primary.trim().length >= 2) ||
        (typeof primary === 'object' && primary !== null && Object.keys(primary).length > 0)
    const neutral = palette.neutral || palette.surface || palette.grays || ''
    const neutralOk = Array.isArray(neutral)
        ? neutral.length > 0
        : (typeof neutral === 'string' && neutral.trim().length >= 2) ||
          (typeof neutral === 'object' && neutral !== null && Object.keys(neutral).length > 0)
    if (!primaryOk) {
        errors.push(
            'visualDesign.palette.primary: 主色缺失（色彩系统必须有主色，含色值或色名+用途——用户没提颜色也要主动给出）'
        )
    }
    if (!neutralOk) {
        errors.push(
            'visualDesign.palette.neutral: 中性色缺失（背景/文字/边框的中性色阶，占页面 80% 面积）'
        )
    }

    // 10. 字体系统完备（fontFamilies 字族 + scale 字号阶梯）
    const typo = vd.typography || {}
    const families = typo.fontFamilies || typo.fonts || typo.family || ''
    const scale = typo.scale || typo.sizes || typo.typeScale || ''
    const famOk = Array.isArray(families)
        ? families.length > 0
        : typeof families === 'string' && families.trim().length >= 2
    const scaleOk = Array.isArray(scale)
        ? scale.length >= 3
        : typeof scale === 'string' && scale.trim().length >= 2
    if (!famOk) {
        errors.push(
            'visualDesign.typography.fontFamilies: 字族缺失（至少 body 字族，建议 display+body 配对——用户没提字体也要主动给出）'
        )
    }
    if (!scaleOk) {
        errors.push('visualDesign.typography.scale: 字号阶梯缺失（≥3 级，如 12/14/16/20/24/32）')
    }

    // 11. 页面背景处理非空（禁止纯白/纯灰裸奔无说明）
    const bgs = vd.backgrounds || {}
    const pageBg = bgs.page || bgs.body || bgs.canvas || ''
    const pageOk =
        (typeof pageBg === 'string' && pageBg.trim().length >= 4) ||
        (typeof pageBg === 'object' && pageBg !== null && Object.keys(pageBg).length > 0)
    if (!pageOk) {
        errors.push(
            'visualDesign.backgrounds.page: 页面背景处理缺失（即使纯色也要声明层次策略；鼓励渐变/噪点/网格/几何装饰建立质感——用户没提背景也要主动给出）'
        )
    }

    // 12. 签名元素非空（标志性记忆点 ≥8 字符）
    const sig = vd.signature || vd.signatureElement || ''
    if (typeof sig !== 'string' || sig.trim().length < 8) {
        errors.push(
            'visualDesign.signature: 签名元素缺失或过短（≥8 字符，回答"这个设计的记忆点是什么"——审美反模式 #9）'
        )
    }

    if (errors.length > 0) {
        console.error(`[check-ui-objective] FAIL: 设计稿客观完备性未通过（${errors.length} 项）`)
        errors.forEach((e) => console.error('  ✖', e))
        process.exit(1)
    }
    console.log(`[check-ui-objective] PASS: 设计稿客观完备性通过（12 项检查全过）`)
    process.exit(0)
}

main()
