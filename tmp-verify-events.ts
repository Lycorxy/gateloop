/**
 * 验证统一事件流 onEvent 钩子
 *
 * 验证：
 *  1. init → stage_start（第一个节点）
 *  2. next 失败 → stage_verify_fail
 *  3. next 成功 → stage_complete + stage_start（下一个节点）
 *  4. 全部完成 → done
 *  5. 通知不阻断主流程（钩子抛错不影响推进）
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { initTask, doNext, emitArtifact } from './src/ads/state'
import type { AnchorManifest, AnchorHooks, AnchorEvent, VerifyResult } from './src/ads/types'

const CWD = join(process.cwd(), '.tmp-verify-events')

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail?: unknown): void {
    if (cond) {
        passed++
        console.log(`  ✅ ${name}`)
    } else {
        failed++
        console.log(`  ❌ ${name}`, detail !== undefined ? JSON.stringify(detail) : '')
    }
}

async function main(): Promise<void> {
    rmSync(CWD, { recursive: true, force: true })
    mkdirSync(CWD, { recursive: true })

    const manifest: AnchorManifest = {
        name: 'event-test',
        stateFile: '.specflow/anchor-state.json',
        logFile: '.specflow/anchor-log.jsonl',
        scratchDir: '.specflow/scratch',
        cwd: CWD,
        maxAttempts: 2,
        anchors: [
            { id: 'design', name: '设计', brief: '产出 spec.json', produces: ['spec.json'] },
            { id: 'code', name: '编码', brief: '产出 code.ts', produces: ['code.ts'] },
            { id: 'test', name: '测试', brief: '收尾' }
        ]
    }

    // 收集事件
    const events: AnchorEvent[] = []
    const anchorHooks: AnchorHooks = {
        async onEvent(event) {
            events.push(event)
        }
    }

    // 桩 verifyFn：design 第一次失败，之后成功
    let designCalls = 0
    async function verifyFn(): Promise<VerifyResult> {
        designCalls++
        if (designCalls === 1) {
            return {
                passed: false,
                checks: [],
                errors: ['spec.json 不存在'],
                duration: 0
            }
        }
        return { passed: true, checks: [], errors: [], duration: 0 }
    }

    // ===== init → stage_start =====
    console.log('===== init → stage_start =====')
    initTask(manifest, '验证事件流', CWD, anchorHooks)
    check('init 触发 stage_start', events[0]?.type === 'stage_start' && events[0].stageId === 'design', events[0])
    check('stage_start 带 stageName', events[0]?.stageName === '设计', events[0]?.stageName)

    // ===== next 失败 → stage_verify_fail =====
    console.log('\n===== next 失败 → stage_verify_fail =====')
    await doNext(manifest, verifyFn, CWD, undefined, anchorHooks)
    const failEvt = events.find((e) => e.type === 'stage_verify_fail')
    check('失败触发 stage_verify_fail', failEvt?.type === 'stage_verify_fail', failEvt)
    check('verify_fail 带 errors', failEvt?.errors?.length === 1 && failEvt.errors[0].includes('spec.json'), failEvt?.errors)
    check('verify_fail 带 attempts', failEvt?.attempts === 1, failEvt?.attempts)

    // ===== next 成功 → stage_complete + stage_start =====
    console.log('\n===== next 成功 → stage_complete + stage_start =====')
    writeFileSync(join(CWD, 'spec.json'), '{}')
    await doNext(manifest, verifyFn, CWD, undefined, anchorHooks)
    const completeEvt = events.find((e) => e.type === 'stage_complete')
    check('成功触发 stage_complete', completeEvt?.type === 'stage_complete', completeEvt)
    check('stage_complete 带 nextStage=code', completeEvt?.nextStage === 'code', completeEvt?.nextStage)
    const startCode = events.filter((e) => e.type === 'stage_start' && e.stageId === 'code')
    check('推进触发 stage_start(code)', startCode.length === 1, startCode)

    // ===== 继续推进 code → test → done =====
    console.log('\n===== code → test → done =====')
    writeFileSync(join(CWD, 'code.ts'), 'export {}')
    await doNext(manifest, verifyFn, CWD, undefined, anchorHooks) // code 完成 → test
    await doNext(manifest, verifyFn, CWD, undefined, anchorHooks) // test 完成 → done
    const doneEvt = events.find((e) => e.type === 'done')
    check('全部完成触发 done', doneEvt?.type === 'done', doneEvt)

    // ===== 打印完整事件序列 =====
    console.log('\n===== 完整事件序列 =====')
    for (const e of events) {
        const extra = e.nextStage ? ` → ${e.nextStage}` : e.errors ? ` errs=${e.errors.length}` : ''
        console.log(`  ${e.type.padEnd(18)} ${e.stageId}${extra}`)
    }

    // ===== 负向：通知抛错不阻断流程 =====
    console.log('\n===== 通知抛错不阻断流程 =====')
    rmSync(CWD, { recursive: true, force: true })
    mkdirSync(CWD, { recursive: true })
    const manifest2: AnchorManifest = {
        name: 'event-test-2',
        stateFile: '.specflow/anchor-state.json',
        logFile: '.specflow/anchor-log.jsonl',
        scratchDir: '.specflow/scratch',
        cwd: CWD,
        anchors: [{ id: 'a', brief: 'x', produces: ['x.txt'] }]
    }
    const throwingHooks: AnchorHooks = {
        async onEvent() {
            throw new Error('通知系统挂了')
        }
    }
    initTask(manifest2, '测试通知抛错', CWD, throwingHooks)
    writeFileSync(join(CWD, 'x.txt'), 'x')
    const inst = await doNext(manifest2, async () => ({ passed: true, checks: [], errors: [], duration: 0 }), CWD, undefined, throwingHooks)
    check('通知抛错仍能推进 done=true', inst.done === true, inst.done)

    console.log('\n========================================')
    console.log(`验证结果: ${passed} 通过, ${failed} 失败`)
    console.log('========================================')

    rmSync(CWD, { recursive: true, force: true })
    if (failed > 0) process.exit(1)
}

main().catch((e) => {
    console.error('验证脚本异常:', e)
    process.exit(1)
})
