#!/usr/bin/env node
/**
 * check-figma-accuracy.mjs — Figma 还原准确性硬约束校验（补 ADS 通用 verify 管不了的领域校验）
 *
 * 校验铁律要求但 producesExist/schema 查不了的准确性约束：
 *   layout:  spacing-report 消费(铁律1a) + layoutDecisions 有 technique + skeleton 完备
 *   reduce:  task-queue 所有 Task completed(铁律6a) + diffHistory 达标(铁律6a) +
 *            absoluteCount 记录(铁律3a) + iter-final absolute数≤例外数(铁律3a/0f) +
 *            finalIntegration completed
 *   deliver: reduce-review.meta.similarity ≥ 95(铁律6)
 *
 * 用法：node check-figma-accuracy.mjs --anchor <layout|reduce|deliver>
 * exit 0 = 通过，exit 1 = 失败（附缺失项清单）
 */
import { readFileSync, existsSync } from 'node:fs'

const CONTEXT = '.specflow/context'

function parseArgs(argv) {
    const args = { anchor: '' }
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--anchor') args.anchor = argv[++i]
    }
    return args
}

function readJson(path) {
    try {
        return JSON.parse(readFileSync(path, 'utf8'))
    } catch {
        return null
    }
}

function readText(path) {
    try {
        return readFileSync(path, 'utf8')
    } catch {
        return ''
    }
}

// ── layout anchor: 校验布局分析准确性 ──
function checkLayout() {
    const errors = []
    const plan = readJson(`${CONTEXT}/layout-plan.json`)
    if (!plan) {
        return ['layout-plan.json 缺失或非法 JSON']
    }

    // 铁律1a: boxModel 消费 spacing-report（盒模型字段存在）
    if (!plan.boxModel) {
        errors.push('layout-plan.boxModel 缺失（铁律1a: 须消费 spacing-report.json 的盒模型数据）')
    }

    // 铁律0f + 布局决策: layoutDecisions 非空 + 每项有 technique
    if (!Array.isArray(plan.layoutDecisions) || plan.layoutDecisions.length === 0) {
        errors.push('layout-plan.layoutDecisions 为空（须记录每个节点的布局决策+technique）')
    } else {
        plan.layoutDecisions.forEach((d, i) => {
            if (!d.technique) {
                errors.push(
                    `layoutDecisions[${i}] (${d.nodeId || '?'}): 缺 technique（布局转换技术未声明）`
                )
            }
        })
    }

    // skeleton 完备（骨架是后续 Task 拆分的基础）
    if (
        !plan.skeleton ||
        !Array.isArray(plan.skeleton.regions) ||
        plan.skeleton.regions.length === 0
    ) {
        errors.push('layout-plan.skeleton.regions 缺失或为空（骨架布局未定义，无法拆分 Task）')
    }

    return errors
}

// ── reduce anchor: 校验还原过程准确性（铁律6a GATE 的核心） ──
function checkReduce() {
    const errors = []
    const tq = readJson(`${CONTEXT}/task-queue.json`)
    if (!tq) {
        return ['task-queue.json 缺失或非法 JSON（铁律6a: 任务队列是还原过程的状态源）']
    }

    const tasks = tq.tasks || []
    if (tasks.length === 0) {
        return ['task-queue.tasks 为空（无 Task，还原未执行）']
    }

    // 铁律6a: 所有 Task status ∈ {completed, decomposed}
    const incomplete = tasks.filter((t) => t.status !== 'completed' && t.status !== 'decomposed')
    if (incomplete.length > 0) {
        errors.push(
            `task-queue 有未完成 Task: ${incomplete.map((t) => t.id).join(', ')}（须 completed 或 decomposed）`
        )
    }

    // 铁律6a: completed Task 有 diffHistory + localDiff 达标 + absoluteCount 记录
    const thresholds = { A: 1.0, B: 0.5, C: 0.3 }
    for (const t of tasks.filter((t) => t.status === 'completed')) {
        if (!Array.isArray(t.diffHistory) || t.diffHistory.length === 0) {
            errors.push(`Task ${t.id}: 缺 diffHistory（铁律6a GATE: 须有 figma_compare 记录）`)
        } else {
            const last = t.diffHistory[t.diffHistory.length - 1]
            const strat = t.strategy || 'A'
            const threshold = thresholds[strat] ?? 1.0
            const localDiff = last.localDiff ?? last.globalDiff ?? 999
            if (localDiff >= threshold) {
                errors.push(
                    `Task ${t.id}: 末轮 localDiff ${localDiff}% ≥ 阈值 ${threshold}%（策略${strat}，未达标不能 completed）`
                )
            }
        }
        // 铁律3a: absoluteCount 必须记录（即使是 0）
        if (t.absoluteCount === undefined) {
            errors.push(`Task ${t.id}: 缺 absoluteCount（铁律3a: 须记录 absolute 数量，0 也要记）`)
        }
    }

    // 铁律6a: decomposed Task 的 subTasks 非空
    for (const t of tasks.filter((t) => t.status === 'decomposed')) {
        const subs = t.subTasks || []
        if (subs.length === 0) {
            errors.push(`Task ${t.id}: decomposed 但无 subTasks（降级必须生成 Component 子任务）`)
        }
    }

    // finalIntegration completed（整合步骤完成）
    if (tq.finalIntegration && tq.finalIntegration.status !== 'completed') {
        errors.push(
            `finalIntegration.status = ${tq.finalIntegration.status}（整合步骤须 completed）`
        )
    }

    // 铁律3a/0f: iter-final.html 的 position:absolute 数 ≤ task-queue 记录的例外总数
    // 非例外 absolute 必须转为 flex/grid，例外记录在 absoluteExceptions
    const html = readText(`${CONTEXT}/iter-final.html`)
    if (html) {
        const absMatches = html.match(/position:\s*absolute/gi) || []
        const totalExceptions = tasks.reduce(
            (sum, t) => sum + (t.absoluteExceptions?.length || 0),
            0
        )
        if (absMatches.length > totalExceptions) {
            errors.push(
                `iter-final.html 有 ${absMatches.length} 个 position:absolute，但 task-queue 只记录了 ${totalExceptions} 个例外` +
                    `（铁律3a/0f: 非例外 absolute 必须转 flex/grid，例外须登记 absoluteExceptions）`
            )
        }
    } else {
        errors.push('iter-final.html 缺失（reduce 产物未产出）')
    }

    return errors
}

// ── deliver anchor: 校验相似度达标（铁律6） ──
function checkDeliver() {
    const errors = []
    const review = readJson(`${CONTEXT}/reduce-review.json`)

    // review 完整性由 GateLoop review 门禁校验（四道门禁），这里只校验 similarity 数值
    if (review?.meta?.similarity === undefined) {
        // fail-closed：未记录相似度数值 = 禁止交付（防模型空话绕过）
        errors.push('reduce-review.meta.similarity 缺失（铁律6: 必须记录相似度数值，禁止交付）')
    } else if (review.meta.similarity < 95) {
        errors.push(
            `reduce-review.meta.similarity = ${review.meta.similarity}% < 95%（铁律6: 相似度未达标，禁止交付）`
        )
    }

    return errors
}

function main() {
    const args = parseArgs(process.argv)
    const checkers = { layout: checkLayout, reduce: checkReduce, deliver: checkDeliver }
    const checker = checkers[args.anchor]
    if (!checker) {
        console.error(
            `[check-figma-accuracy] 未知 anchor: ${args.anchor}（支持: layout/reduce/deliver）`
        )
        process.exit(1)
    }

    const errors = checker()
    if (errors.length > 0) {
        console.error(
            `[check-figma-accuracy] FAIL: ${args.anchor} 准确性校验未通过（${errors.length} 项）`
        )
        errors.forEach((e) => console.error('  ✖', e))
        process.exit(1)
    }
    console.log(`[check-figma-accuracy] PASS: ${args.anchor} 准确性校验通过`)
    process.exit(0)
}

main()
