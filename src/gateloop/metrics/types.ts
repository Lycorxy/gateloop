/**
 * 度量脚本通用类型
 *
 * 设计：facts（客观事实）+ metrics（结构化指标）+ passed（收敛型判定）
 *   facts 永远输出（让模型看见真相）
 *   passed 仅在收敛型违规时为 false（如类名不一致、子任务未派生）
 *   发散型度量（如"耦合度高低"）只输出 facts，passed 永远 true
 */

export interface MetricFact {
    /** 事实陈述，例如 "圈复杂度最大值: 12 (file: hook.ts:34)" */
    fact: string
    /** 严重度：info（信息）/ warn（提示）/ fail（违规） */
    severity: 'info' | 'warn' | 'fail'
    /** 关联文件/位置（可选，便于模型定位） */
    location?: string
}

export interface MetricResult {
    /** 是否通过（仅收敛型违规 false，发散型永远 true） */
    passed: boolean
    /** 度量类型 */
    type: string
    /** 结构化指标（值类型动态，用 unknown 兜底） */
    metrics: Record<string, unknown>
    /** 客观事实清单 */
    facts: MetricFact[]
    /** 摘要文本（一行，人类可读） */
    summary: string
}
