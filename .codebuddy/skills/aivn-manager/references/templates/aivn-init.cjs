/**
 * AIVN Init Hook — CodeBuddy SessionStart 自动初始化
 *
 * 触发事件：SessionStart
 * 功能：检测 aivn 是否已初始化，未初始化则自动执行 npx nut-aivn init
 *
 * CodeBuddy 注入数据格式：
 * {
 *   "hook_event_name": "SessionStart",
 *   "session_id": "会话ID",
 *   "cwd": "工作目录"
 * }
 */

'use strict'

const { execFileSync } = require('child_process')
const { resolve, join } = require('path')
const { existsSync } = require('fs')

// ==================== 工具函数 ====================

function isInitialized(projectRoot) {
    const configFile = join(projectRoot, '.aivnsions', 'config.json')
    return existsSync(configFile)
}

function readStdinSync(timeoutMs) {
    const timeout = timeoutMs || 3000
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(''), timeout)
        const chunks = []
        process.stdin.on('readable', () => {
            let chunk
            while ((chunk = process.stdin.read()) !== null) chunks.push(chunk)
        })
        process.stdin.on('end', () => {
            clearTimeout(timer)
            resolve(Buffer.concat(chunks).toString('utf8'))
        })
        process.stdin.on('error', () => {
            clearTimeout(timer)
            resolve('')
        })
    })
}

// ==================== 主流程 ====================

const PROJECT_ROOT = resolve(__dirname, '..', '..')

async function main() {
    // 非 TTY 才处理（CodeBuddy 通过 stdin 注入事件）
    if (process.stdin.isTTY) return

    // 读取 stdin 数据
    let input = ''
    try {
        input = await readStdinSync(3000)
    } catch {
        return
    }
    if (!input) return

    // 只处理 SessionStart 事件
    let data
    try {
        data = JSON.parse(input)
    } catch {
        return
    }
    if (data.hook_event_name !== 'SessionStart') return

    // 已初始化则跳过
    if (isInitialized(PROJECT_ROOT)) return

    // 自动执行 init
    try {
        execFileSync('npx', ['nut-aivn', 'init', '--cwd', PROJECT_ROOT], {
            cwd: PROJECT_ROOT,
            stdio: 'ignore',
            timeout: 10000,
            env: { ...process.env, NODE_NO_WARNINGS: '1' }
        })
    } catch {
        // 静默失败，不影响正常使用
    }
}

main().catch(() => process.exit(0))
