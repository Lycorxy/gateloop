/**
 * ADS CLI 入口 — nut ads
 *
 * Skill 通过这个命令行工具与 ADS 引擎（Harness）交互。
 *
 * 用法：
 *   nut ads init <manifest> --task "任务描述"
 *   nut ads next <manifest>
 *   nut ads status <manifest>
 *   nut ads check <manifest>
 *   nut ads retry <manifest>
 *   nut ads reset <manifest>
 *   nut ads gc <manifest>
 *   nut ads subtask-add <manifest> --desc "子任务描述" [--id xxx] [--produces "a,b"]
 *   nut ads subtask-done <manifest> --id <subtaskId>
 *   nut ads emit <manifest> --key <key> --kind file|value [--path xxx] [--value xxx]
 *
 * manifest = anchor.config.json 路径
 *
 * @example
 *   nut ads init .codebuddy/skills/my-skill/anchor.config.json --task "实现用户列表"
 *   nut ads next .codebuddy/skills/my-skill/anchor.config.json
 */

import { loadManifest, Ads } from '../ads'
import type { AnchorInstruction } from '../ads'
import { runMetric, printMetricHelp } from '../ads/metrics'

export async function runAds(args: string[]): Promise<void> {
    const command = args[0]

    if (!command || command === '--help' || command === '-h') {
        printHelp()
        return
    }

    // ★ metric 子命令不依赖 manifest，独立分发
    if (command === 'metric') {
        const metricArgs = args.slice(1)
        if (!metricArgs.length || metricArgs[0] === '--help' || metricArgs[0] === '-h') {
            printMetricHelp()
            return
        }
        await runMetric(metricArgs)
        return
    }

    // 解析参数
    const manifestPath = args[1]
    const flags: Record<string, string> = {}

    for (let i = 2; i < args.length; i++) {
        const arg = args[i]
        if (arg.startsWith('--')) {
            const key = arg.slice(2)
            const next = args[i + 1]
            const value = !next || next.startsWith('--') ? 'true' : next
            flags[key] = value
            if (value !== 'true') i++
        }
    }

    const task = flags.task || ''

    if (!manifestPath) {
        console.error('请提供 manifest 文件路径')
        process.exit(1)
    }

    try {
        const manifest = loadManifest(manifestPath)
        const ads = new Ads(manifest)

        switch (command) {
            case 'init': {
                if (!task) {
                    console.error('请提供 --task 参数')
                    process.exit(1)
                }
                const instruction = await ads.init(task)
                printInstruction(instruction)
                break
            }

            case 'next': {
                const instruction = await ads.next()
                printInstruction(instruction)
                if (!instruction.advanced && !instruction.done) {
                    // 验证失败/熔断 → exit 1，让脚本链能感知
                    process.exit(1)
                }
                break
            }

            case 'status': {
                printInstruction(await ads.status())
                break
            }

            case 'check': {
                const result = await ads.check()
                console.log(
                    JSON.stringify(
                        {
                            passed: result.passed,
                            errors: result.errors,
                            checks: result.checks.map((c) => ({
                                name: c.name,
                                passed: c.passed,
                                output: c.output
                            })),
                            duration: result.duration
                        },
                        null,
                        2
                    )
                )
                if (!result.passed) process.exit(1)
                break
            }

            case 'retry': {
                ads.retry()
                console.log('🔄 已开始新一轮尝试（producesFresh 基准已刷新）')
                printInstruction(await ads.status())
                break
            }

            case 'reset': {
                ads.reset()
                console.log('✅ 已重置（状态 + scratch 已清理）')
                break
            }

            case 'gc': {
                const recycled = ads.gc()
                console.log(
                    `🧹 GC 完成，回收 ${recycled.length} 个残留 scratch 目录${recycled.length ? ': ' + recycled.join(', ') : ''}`
                )
                break
            }

            case 'subtask-add': {
                if (!flags.desc) {
                    console.error('请提供 --desc 参数')
                    process.exit(1)
                }
                const produces = flags.produces
                    ? flags.produces
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean)
                    : undefined
                const subtasks = ads.addSubtasks([{ id: flags.id, desc: flags.desc, produces }])
                console.log(JSON.stringify(subtasks, null, 2))
                break
            }

            case 'subtask-done': {
                if (!flags.id) {
                    console.error('请提供 --id 参数')
                    process.exit(1)
                }
                const subtasks = ads.completeSubtask(flags.id)
                console.log(JSON.stringify(subtasks, null, 2))
                break
            }

            case 'emit': {
                if (!flags.key || !flags.kind) {
                    console.error('请提供 --key 和 --kind (file|value) 参数')
                    process.exit(1)
                }
                const kind = flags.kind === 'file' ? 'file' : 'value'
                const artifacts = ads.emit({
                    key: flags.key,
                    kind,
                    path: kind === 'file' ? flags.path : undefined,
                    value: kind === 'value' ? parseValue(flags.value) : undefined
                })
                console.log(JSON.stringify(artifacts, null, 2))
                break
            }

            case 'mem-write': {
                if (!flags.key) {
                    console.error('请提供 --key 参数')
                    process.exit(1)
                }
                await ads.memWrite(flags.key, parseValue(flags.value))
                console.log(`🧠 已回写决策记忆: ${flags.key}`)
                break
            }

            case 'mem-read': {
                if (!flags.key) {
                    console.error('请提供 --key 参数（多个用逗号分隔）')
                    process.exit(1)
                }
                const keys = flags.key
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                const mem = await ads.memRead(keys)
                console.log(JSON.stringify(mem, null, 2))
                break
            }

            default:
                console.error(`未知命令: ${command}`)
                printHelp()
                process.exit(1)
        }
    } catch (error) {
        console.error(`执行失败: ${(error as Error).message}`)
        process.exit(1)
    }
}

/** 尝试解析成 JSON，失败则原样字符串 */
function parseValue(raw?: string): unknown {
    if (raw === undefined || raw === 'true') return raw
    try {
        return JSON.parse(raw)
    } catch {
        return raw
    }
}

// ==================== 输出格式化 ====================

function printInstruction(instruction: AnchorInstruction) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    if (instruction.done) {
        console.log('✅ 所有阶段已完成')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        return
    }

    console.log(
        `📌 阶段: ${instruction.stage}${instruction.stageName ? ` (${instruction.stageName})` : ''}`
    )
    if (typeof instruction.attempts === 'number' && instruction.maxAttempts) {
        console.log(`🔁 尝试: ${instruction.attempts}/${instruction.maxAttempts}`)
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    if (instruction.escalate) {
        console.log('\n🛑 已熔断：连续失败超过上限，需人工介入或降级方案。')
    }

    if (instruction.brief) {
        console.log(`\n📋 简报:`)
        console.log(instruction.brief)
    }

    if (instruction.rulesInline && instruction.rulesInline.length > 0) {
        console.log(`\n📖 规则 (${instruction.rulesInline.length} 个文件已内联):`)
        for (const rule of instruction.rulesInline) {
            console.log(`  ─ ${rule.source}`)
        }
    }

    if (instruction.artifactsInline && instruction.artifactsInline.length > 0) {
        console.log(`\n🔗 上游数据 (${instruction.artifactsInline.length} 个 artifact 已内联):`)
        for (const art of instruction.artifactsInline) {
            console.log(`  ─ ${art.key} (来自 ${art.producedBy}, ${art.kind})`)
        }
    }

    if (instruction.memoryInline && instruction.memoryInline.length > 0) {
        console.log(`\n🧠 决策记忆 (${instruction.memoryInline.length} 条已内联):`)
        for (const mem of instruction.memoryInline) {
            console.log(`  ─ ${mem.key}: ${mem.content.slice(0, 120)}`)
        }
    }

    if (instruction.contextInline && instruction.contextInline.length > 0) {
        console.log(`\n🔗 钩子上下文 (${instruction.contextInline.length} 条已注入):`)
        for (const ctx of instruction.contextInline) {
            console.log(`  ─ [${ctx.source}] ${ctx.content.slice(0, 120)}`)
        }
    }

    if (instruction.contextArchiveInline && instruction.contextArchiveInline.length > 0) {
        console.log(`\n📋 上游上下文存档 (${instruction.contextArchiveInline.length} 个 anchor):`)
        for (const arc of instruction.contextArchiveInline) {
            console.log(
                `  ─ ${arc.anchorId}: 消费${arc.consumed.length}/产出${arc.emitted.length}/验证${arc.verifyChecks.length}项`
            )
        }
    }

    if (instruction.requiresSubtasks) {
        const subs = instruction.subtasks || []
        console.log(
            `\n🧩 子任务 (${subs.filter((s) => s.status === 'done').length}/${subs.length} 完成):`
        )
        if (subs.length === 0) {
            console.log('  ⚠️ 本阶段要求先拆分子任务：nut ads subtask-add ... --desc "..."')
        }
        for (const s of subs) {
            console.log(`  ${s.status === 'done' ? '✅' : '⬜'} ${s.id} — ${s.desc}`)
        }
    }

    if (instruction.produces && instruction.produces.length > 0) {
        console.log(`\n📦 产物:`)
        for (const p of instruction.produces) {
            console.log(`  ─ ${p}`)
        }
    }

    if (instruction.emits && instruction.emits.length > 0) {
        console.log(`\n📤 需产出 artifact:`)
        for (const e of instruction.emits) {
            console.log(`  ─ ${e}`)
        }
    }

    if (instruction.scratchDir) {
        console.log(`\n📁 临时工作区: ${instruction.scratchDir}`)
    }

    if (instruction.allowedTools && instruction.allowedTools.length > 0) {
        console.log(`\n🔧 允许工具:`)
        console.log(`  ${instruction.allowedTools.join(', ')}`)
    }

    if (instruction.verifyHint) {
        console.log(`\n🔍 验证: ${instruction.verifyHint}`)
    }

    if (instruction.verifyResult) {
        const vr = instruction.verifyResult
        console.log(
            `\n${vr.passed ? '✅' : '❌'} 验证结果: ${vr.passed ? '通过' : '失败'} (${vr.checks.length} 项检查)`
        )
        for (const check of vr.checks) {
            console.log(
                `  ${check.passed ? '✅' : '❌'} ${check.name}${check.duration ? ` (${check.duration}ms)` : ''}`
            )
            if (!check.passed && check.output) {
                console.log(`     ${check.output.slice(0, 200)}`)
            }
        }
        if (vr.errors.length > 0) {
            console.log(`\n⚠️ 错误 (${vr.errors.length}):`)
            for (const err of vr.errors.slice(0, 10)) {
                console.log(`  ─ ${err.slice(0, 200)}`)
            }
        }
    }

    console.log(`\n➡️ ${instruction.nextAction}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

function printHelp() {
    console.log(`
🔧 ADS CLI - Anchor-Driven Skill 运行时

用法:
  nut ads <命令> <manifest> [选项]

命令:
  init          初始化任务       nut ads init <manifest> --task "任务描述"
  next          推进到下一阶段    nut ads next <manifest>
  status        查看当前指令      nut ads status <manifest>
  check         手动验证当前阶段   nut ads check <manifest>
  retry         开始新一轮尝试     nut ads retry <manifest>
  reset         重置任务          nut ads reset <manifest>
  gc            回收过期临时目录   nut ads gc <manifest>
  subtask-add   拆分子任务        nut ads subtask-add <manifest> --desc "..." [--id x] [--produces "a,b"]
  subtask-done  完成子任务        nut ads subtask-done <manifest> --id <subtaskId>
  emit          产出 artifact    nut ads emit <manifest> --key k --kind file|value [--path p] [--value v]
  mem-write     回写决策记忆      nut ads mem-write <manifest> --key k [--value v]
  mem-read      读取决策记忆      nut ads mem-read <manifest> --key "k1,k2"
  metric        客观度量          nut ads metric <type> [--dir src] [--input plan.json]

manifest:
  anchor.config.json 文件路径

选项:
  --task <text>       任务描述（init 命令必填）
  --desc <text>       子任务描述（subtask-add 必填）
  --id <text>         子任务 ID
  --produces <a,b>    子任务产物（逗号分隔）
  --key <text>        artifact key（emit 必填）
  --kind <file|value> artifact 类型（emit 必填）
  --path <text>       artifact 文件路径（kind=file 时）
  --value <text>      artifact 内联值（kind=value 时，JSON 或字符串）

示例:
  # 初始化前端开发任务（自动创建隔离 scratch + GC 过期残留）
  nut ads init .codebuddy/skills/frontend-dev/anchor.config.json --task "实现用户列表页"

  # 推进（内部强制验证 + 子任务闭环 + artifact 校验 + 熔断）
  nut ads next .codebuddy/skills/frontend-dev/anchor.config.json

  # 大任务动态拆子任务
  nut ads subtask-add <manifest> --desc "实现列表分页"
  nut ads subtask-done <manifest> --id design-sub-1

  # 阶段间传数据
  nut ads emit <manifest> --key apiSpec --kind file --path .specflow/scratch/xxx/artifacts/api.json

  # 断线恢复：查看当前在哪一步；重做前刷新 fresh 基准
  nut ads status <manifest>
  nut ads retry <manifest>
`)
}
