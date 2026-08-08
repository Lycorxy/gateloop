/**
 * design-metrics — frontendPlan 完备性校验
 *
 * 【floor-ceiling 哲学】完备性 = 收敛型（缺字段 = FAIL）
 *   schema 已校验 4 张表 + edgeCases + errorStates 存在
 *   本脚本只做 schema 不覆盖的补充校验 + 客观计数回灌
 *
 * 删减说明（v2）：
 *   - 4 张表存在校验 → schema 已做，删除
 *   - edgeCases/errorStates 存在校验 → schema 已做，删除
 *   - useState ≥8 → 模型一眼能看，删除
 *   - 共享依赖检测 → 模型能看，删除
 *   - 基础计数 → 模型看 plan 一眼就知道，降级为 info 回灌
 *
 * 用法：nut ads metric design --input .specflow/context/current.json
 */

import { existsSync, readFileSync } from 'node:fs'
import type { MetricResult, MetricFact } from './types'

interface DesignInput {
    input: string
}

export function metricDesign(input: DesignInput): MetricResult {
    const facts: MetricFact[] = []

    if (!existsSync(input.input)) {
        return {
            passed: false,
            type: 'design',
            metrics: {},
            facts: [{ fact: `plan 文件不存在: ${input.input}`, severity: 'fail' }],
            summary: `design: plan 文件不存在`
        }
    }

    let plan: Record<string, unknown>
    try {
        const raw = JSON.parse(readFileSync(input.input, 'utf-8'))
        plan = raw.frontendPlan || raw
    } catch (e) {
        return {
            passed: false,
            type: 'design',
            metrics: {},
            facts: [{ fact: `plan 解析失败: ${(e as Error).message}`, severity: 'fail' }],
            summary: `design: plan 解析失败`
        }
    }

    // 1. layoutRationale / splitDecisions 提示（schema 不强制，仅 info 提醒模型）
    if (!plan.layoutRationale) {
        facts.push({
            fact: 'plan 未声明 layoutRationale —— 仅当布局突破默认决策树时必填（schema 不强制，由模型自评）',
            severity: 'info'
        })
    }
    if (!plan.splitDecisions) {
        facts.push({
            fact: 'plan 未声明 splitDecisions —— 仅当触发拆分提示但不拆时必填（schema 不强制，由模型自评）',
            severity: 'info'
        })
    }

    // 2. 基础计数（info 回灌，不判定）
    const moduleBoundary = (plan.moduleBoundary as unknown[]) || []
    const functionOwnership = (plan.functionOwnership as unknown[]) || []
    const stateClassification = (plan.stateClassification as unknown[]) || []
    const efficiencyAudit = (plan.efficiencyAudit as Record<string, unknown[]>) || {}
    const effects = efficiencyAudit.effects || []
    const renderControl = efficiencyAudit.renderControl || []
    const requestDedup = efficiencyAudit.requestDedup || []

    facts.push({
        fact: `组件数: ${moduleBoundary.length} | 函数数: ${functionOwnership.length} | 状态数: ${stateClassification.length} | useEffect: ${effects.length} | 渲染控制: ${renderControl.length} | 请求去重: ${requestDedup.length}`,
        severity: 'info'
    })

    const summary = `design: ${moduleBoundary.length} 组件 / ${stateClassification.length} 状态 / ${effects.length} useEffect`

    return {
        passed: true,
        type: 'design',
        metrics: {
            components: moduleBoundary.length,
            functions: functionOwnership.length,
            states: stateClassification.length,
            effects: effects.length
        },
        facts,
        summary
    }
}
