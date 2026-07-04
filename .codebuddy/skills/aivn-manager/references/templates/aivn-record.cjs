/**
 * AIVN Record Hook — CodeBuddy 会话自动录制钩子
 *
 * 策略：在用户提交下一条消息时（UserPromptSubmit），视为上一轮对话已结束，自动记录。
 * 注意：第一轮对话不会被立刻记录，会在下一轮开始时才被记录。
 *
 * 触发事件：UserPromptSubmit
 * CodeBuddy 注入数据格式：
 * {
 *   "hook_event_name": "UserPromptSubmit",
 *   "prompt": "用户新问题",
 *   "session_id": "会话ID",
 *   "cwd": "工作目录"
 * }
 */

'use strict'

const { execFileSync } = require('child_process')
const { resolve, join } = require('path')
const { existsSync, appendFileSync, readFileSync, writeFileSync } = require('fs')

// ==================== 调试日志 ====================

const DEBUG_ENABLED = true
const DEBUG_LOG = join(__dirname, '..', 'aivn-hook-debug.log')

function debugLog(msg) {
    if (!DEBUG_ENABLED) return
    try {
        const ts = new Date().toISOString()
        appendFileSync(DEBUG_LOG, `[${ts}] ${msg}\n`, 'utf8')
    } catch {
        // silence
    }
}

// ==================== 工具函数 ====================

/** 读取 stdin（同步） */
function readStdin(timeoutMs) {
    const timeout = timeoutMs || 5000
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

/** 安全截断 */
function safeTruncate(str, maxLen) {
    if (!str) return ''
    const s = String(str).trim()
    if (s.length <= maxLen) return s
    return s.slice(0, maxLen - 3) + '...'
}

// ==================== 对话缓存（跨 hook 调用需要） ====================

const CACHE_FILE = join(__dirname, '..', '.aivn-cache.json')

function loadCache() {
    try {
        if (existsSync(CACHE_FILE)) {
            return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'))
        }
    } catch {}
    return {}
}

function saveCache(data) {
    try {
        writeFileSync(CACHE_FILE, JSON.stringify(data), 'utf-8')
    } catch {}
}

/**
 * 核心逻辑：
 * - UserPromptSubmit 触发时，先保存"上一轮"对话（如果有）
 * - 然后将"当前这一轮"的用户问题缓存起来，等下一轮触发时保存
 */
function processHookEvent(input) {
    if (!input || input.trim().length === 0) return null

    try {
        const data = JSON.parse(input)
        const event = data.hook_event_name || ''

        debugLog(
            `event: ${event}, prompt_len: ${(data.prompt || '').length}, sid: ${data.session_id || 'N/A'}`
        )

        // 只处理 UserPromptSubmit
        if (event !== 'UserPromptSubmit') {
            debugLog(`skip: event ${event} not handled`)
            return null
        }

        const currentPrompt = data.prompt || ''
        const sessionId = data.session_id || ''
        const cwd = data.cwd || process.cwd()

        if (!currentPrompt) {
            debugLog('skip: empty prompt')
            return null
        }

        // 读取缓存：上一轮的对话
        const cache = loadCache()
        const prevKey = `last-${sessionId}`
        const previous = cache[prevKey]

        // 缓存当前轮（下一轮触发时使用）
        cache[prevKey] = {
            prompt: currentPrompt,
            sessionId: sessionId,
            cwd: cwd,
            timestamp: Date.now()
        }
        saveCache(cache)

        // 如果有上一轮对话，则保存
        if (previous && previous.prompt) {
            debugLog(`saving previous round: "${safeTruncate(previous.prompt, 80)}"`)
            return {
                question: safeTruncate(previous.prompt, 500),
                solution: `模型已回复 (${new Date(previous.timestamp).toLocaleTimeString()})`,
                sessionId: previous.sessionId,
                cwd: previous.cwd
            }
        }

        debugLog('first message in session, caching for next round')
        return null
    } catch (e) {
        debugLog(`JSON parse error: ${e.message}`)
        return null
    }
}

// ==================== CLI 查找 ====================

function findAivnCLI(projectRoot) {
    const distCLI = join(projectRoot, 'dist', 'aivn', 'index.cjs')
    if (existsSync(distCLI)) return distCLI
    return null
}

// ==================== 主流程 ====================

const PROJECT_ROOT = resolve(__dirname, '..', '..')

async function main() {
    debugLog('=== aivn hook START ===')

    // 1. 查找 CLI
    const cliPath = findAivnCLI(PROJECT_ROOT)
    if (!cliPath) {
        debugLog('EXIT: aivn CLI not found')
        return
    }

    // 2. 读取 stdin
    let input = ''
    try {
        if (!process.stdin.isTTY) {
            input = await readStdin(5000)
        }
    } catch (e) {
        debugLog(`stdin error: ${e.message}`)
    }

    if (!input) {
        debugLog('EXIT: no stdin data')
        return
    }

    // 3. 处理事件
    const conversation = processHookEvent(input)
    if (!conversation) {
        debugLog('EXIT: no conversation to save')
        return
    }

    // 4. 调用 aivn save
    const args = [
        cliPath,
        'save',
        '--question',
        conversation.question,
        '--solution',
        conversation.solution,
        '--cwd',
        PROJECT_ROOT
    ]

    if (conversation.sessionId) {
        args.push('--session', conversation.sessionId)
    }

    try {
        execFileSync('node', args, {
            cwd: PROJECT_ROOT,
            stdio: 'ignore',
            timeout: 15000,
            env: { ...process.env, NODE_NO_WARNINGS: '1' }
        })
        debugLog(`save SUCCESS: "${conversation.question.slice(0, 60)}"`)
    } catch (e) {
        debugLog(`save FAILED: ${e.message}`)
    }

    debugLog('=== aivn hook END ===')
}

main().catch((e) => {
    debugLog(`FATAL: ${e.message}`)
    process.exit(0)
})
