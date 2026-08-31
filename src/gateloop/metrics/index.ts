/**
 * GateLoop Metric — 客观度量入口
 *
 * 哲学：脚本只陈述客观事实（度量），不判定好坏（主观）。
 *   度量脚本输出 JSON 报告 → 引擎 verifyResult 回灌给模型
 *   模型基于事实自主决策是否优化
 *
 * 用法：
 *   nut gateloop metric <type> [options]
 *
 * 子命令：
 *   design              度量 frontendPlan 客观指标（组件数/状态数/依赖路径）
 *   architecture        架构质量度量（模块同构性/耦合/状态合理性·ESLint 覆盖不了的语义级）
 *   code                度量代码产物（新增文件/循环依赖/改动行数）
 *   style-crosscheck    SCSS↔TSX 类名一致性（替代模型自评，收敛型门禁）
 *   subtask-derivation  子任务派生关系校验（锁自由度不锁死）
 *
 * 退出码：
 *   0 = 通过（含"度量完成，输出报告"——无失败，仅事实陈述）
 *   1 = 失败（收敛型违规，如类名不一致、子任务未派生）
 *
 * 输出格式：
 *   stdout 一行 JSON：{ passed, type, metrics: {...}, facts: [...] }
 *   模型可见，引擎可读
 */

export { runMetric, printMetricHelp } from './runner'
export { metricDesign } from './design-metrics'
export { metricArchitecture } from './architecture-metrics'
export { metricCode } from './code-metrics'
export { metricStyleCrosscheck } from './style-crosscheck'

export type { MetricResult, MetricFact } from './types'
