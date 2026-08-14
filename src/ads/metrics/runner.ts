/**
 * Metric Runner — 解析 CLI 参数并分发到具体度量器
 *
 * 调用形式：
 *   nut ads metric <type> [--dir <dir>] [--input <path>] [--plan <path>] [--help]
 */

import { metricDesign } from './design-metrics'
import { metricCode } from './code-metrics'
import { metricStyleCrosscheck } from './style-crosscheck'
import { metricArchitecture } from './architecture-metrics'
import type { MetricResult } from './types'

export async function runMetric(args: string[]): Promise<void> {
    const type = args[0]

    if (!type || type === '--help' || type === '-h') {
        printMetricHelp()
        return
    }

    const flags = parseFlags(args.slice(1))

    try {
        const result = await dispatch(type, flags)
        output(result)
        if (!result.passed) process.exit(1)
    } catch (error) {
        const result: MetricResult = {
            passed: false,
            type,
            metrics: {},
            facts: [
                {
                    fact: `度量执行错误: ${(error as Error).message}`,
                    severity: 'fail'
                }
            ],
            summary: `度量执行错误: ${(error as Error).message}`
        }
        output(result)
        process.exit(1)
    }
}

async function dispatch(type: string, flags: Record<string, string>): Promise<MetricResult> {
    switch (type) {
        case 'design':
            return metricDesign({
                input: flags.input || '.specflow/context/current.json'
            })
        case 'architecture':
            return metricArchitecture({
                input: flags.input || '.specflow/context/current.json',
                dir: flags.dir
            })
        case 'code':
            return metricCode({
                dir: flags.dir || 'src'
            })
        case 'style-crosscheck':
            return metricStyleCrosscheck({
                dir: flags.dir || 'src'
            })
        default:
            throw new Error(
                `未知度量类型: ${type}（可用: design / architecture / code / style-crosscheck）`
            )
    }
}

/** 简易 --flag value 解析 */
function parseFlags(args: string[]): Record<string, string> {
    const flags: Record<string, string> = {}
    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        if (arg.startsWith('--')) {
            const key = arg.slice(2)
            const next = args[i + 1]
            flags[key] = !next || next.startsWith('--') ? 'true' : next
            if (next && !next.startsWith('--')) i++
        }
    }
    return flags
}

/** 严重程度对应的图标 */
function severityIcon(severity: string): string {
    if (severity === 'fail') return '❌'
    if (severity === 'warn') return '⚠️'
    return '•'
}

/** 统一输出：一行 JSON 到 stdout，便于引擎解析；人类可读摘要附后 */
function output(result: MetricResult): void {
    console.log(JSON.stringify(result))
    console.log(`\n📋 ${result.summary}`)
    if (result.facts.length > 0) {
        console.log('\n度量事实:')
        for (const f of result.facts) {
            console.log(`  ${severityIcon(f.severity)} ${f.fact}`)
        }
    }
}

export function printMetricHelp(): void {
    console.log(`
🔧 ADS Metric — 客观度量工具

用法:
  nut ads metric <type> [options]

类型:
  design              度量 frontendPlan 客观指标（组件数/状态数/依赖路径）
  architecture        架构质量度量（模块同构性/耦合/状态合理性·ESLint 覆盖不了的语义级）
  code                度量代码产物（循环依赖/文件规模/改动统计）
  style-crosscheck    SCSS↔TSX 类名一致性校验（收敛型门禁，违规 exit 1）

选项:
  --dir <path>      目标目录（code / style-crosscheck 用，默认 src）
  --input <path>    frontendPlan 路径（design / architecture 用，默认 .specflow/context/current.json）

退出码:
  0 = 度量通过（或仅输出事实，无收敛型违规）
  1 = 收敛型违规（如类名不一致、子任务未派生）

哲学:
  脚本只陈述客观事实（facts），不判定好坏（主观）。
  收敛型违规（违反=错）才 exit 1，发散型度量（有更好）只回灌事实。
`)
}
