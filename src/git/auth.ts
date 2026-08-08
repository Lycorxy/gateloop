/**
 * Git 远程授权（OAuth device flow + 本地 Token 缓存）
 *
 * 平台：腾讯工蜂 git.woa.com（GitLab 兼容）
 * 流程：
 *   1. 获取设备码 → 弹浏览器让用户授权
 *   2. 轮询换 access_token
 *   3. 缓存到 ~/.gfrc（300 天有效）
 *   4. 后续调用 ensureToken() 自动取本地或触发授权
 *
 * 与 ssh.ts 的联动：拿到 token 后传给 setupSSH({ token })，
 * ssh.ts 会自动 POST 公钥到 /api/v4/user/keys，无需到页面手动添加。
 */

import { request } from 'node:https'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readJson, writeJson, exists, removeFile } from '../helpers/file'
import { execShell, isWindows, isMac, isLinux } from '../helpers/exec'
import type { GitResult } from './types'

// ==================== 常量 ====================

/** 工蜂主机（GitLab 兼容） */
const GIT_HOST = 'git.woa.com'

/** OAuth 客户端 ID（工蜂预注册的公共客户端） */
const CLIENT_ID = '072326b6de0046bc802e9c83d5107174'

/** Token 本地缓存有效期（300 天） */
const TOKEN_EXPIRES_SECONDS = 300 * 24 * 60 * 60

/** Token 缓存文件路径 */
const TOKEN_PATH = join(homedir(), '.gfrc')

// ==================== 类型 ====================

/** 本地缓存结构（~/.gfrc） */
export interface GitLabToken {
    /** access_token */
    private_token: string
    /** 过期时间戳（秒） */
    expires_at?: number
}

/** OAuth device code 响应 */
interface DeviceCodeResponse {
    device_code?: string
    user_code?: string
    expires_in?: number
    interval?: number
    verification_uri?: string
    error?: string
    error_description?: string
}

/** OAuth token 响应 */
interface TokenResponse {
    access_token?: string
    expires_in?: number
    error?: string
    error_description?: string
}

// ==================== 本地 Token 读写 ====================

/**
 * 从本地读取 token
 * @returns token 字符串；不存在或已过期返回 null
 */
export async function getToken(): Promise<string | null> {
    if (!(await exists(TOKEN_PATH))) return null
    try {
        const cfg = await readJson<GitLabToken>(TOKEN_PATH)
        if (!cfg?.private_token) return null
        if (cfg.expires_at) {
            const now = Math.floor(Date.now() / 1000)
            if (now >= cfg.expires_at) return null
        }
        return cfg.private_token
    } catch {
        return null
    }
}

/**
 * 保存 token 到本地（~/.gfrc）
 */
export async function saveToken(token: string): Promise<void> {
    const cfg: GitLabToken = {
        private_token: token,
        expires_at: Math.floor(Date.now() / 1000) + TOKEN_EXPIRES_SECONDS
    }
    await writeJson(TOKEN_PATH, cfg, 2)
}

/**
 * 清除本地 token（登出）
 */
export async function clearToken(): Promise<void> {
    if (await exists(TOKEN_PATH)) {
        await removeFile(TOKEN_PATH)
    }
}

// ==================== HTTPS 工具 ====================

/**
 * 跨平台打开浏览器 URL
 * 失败时不抛异常，仅返回失败（用户可手动复制链接）
 */
async function openUrl(url: string): Promise<void> {
    try {
        if (isWindows) {
            await execShell(`start "" "${url}"`)
        } else if (isMac) {
            await execShell(`open "${url}"`)
        } else if (isLinux) {
            await execShell(`xdg-open "${url}"`)
        }
    } catch {
        // 打开失败不阻断流程
    }
}

/**
 * POST JSON 请求
 * @param pathUrl API 路径（如 /oauth/device/code）
 * @param body 请求体
 * @returns 响应 JSON
 */
function postJSON(pathUrl: string, body: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body)
        const req = request(
            {
                hostname: GIT_HOST,
                port: 443,
                path: pathUrl,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                },
                timeout: 15000
            },
            (res) => {
                let buf = ''
                res.on('data', (c: Buffer) => {
                    buf += c.toString()
                })
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(buf))
                    } catch {
                        resolve(buf)
                    }
                })
            }
        )
        req.on('error', reject)
        req.on('timeout', () => {
            req.destroy()
            reject(new Error('OAuth 请求超时'))
        })
        req.write(data)
        req.end()
    })
}

// ==================== OAuth Device Flow ====================

/**
 * OAuth device flow 授权
 *
 * 1. 获取设备码 → 2. 打开浏览器 → 3. 轮询换 token → 4. 缓存
 *
 * @returns access_token；失败返回 null
 */
export async function oauthLogin(): Promise<string | null> {
    // 1. 获取设备码
    const codeResp = (await postJSON('/oauth/device/code', {
        client_id: CLIENT_ID
    })) as DeviceCodeResponse

    if (!codeResp.device_code) {
        return null
    }

    const {
        device_code,
        user_code,
        expires_in = 300,
        interval = 5,
        verification_uri = '/oauth/device'
    } = codeResp

    // 2. 打开浏览器（用户手动点确认）
    const authUrl = `https://${GIT_HOST}${verification_uri}?user_code=${user_code}`
    await openUrl(authUrl)

    // 3. 轮询获取 token
    const start = Date.now()
    while (Date.now() - start < expires_in * 1000) {
        await new Promise((r) => setTimeout(r, interval * 1000))

        const tokenResp = (await postJSON('/oauth/device/token', {
            client_id: CLIENT_ID,
            device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        })) as TokenResponse

        if (tokenResp.access_token) {
            await saveToken(tokenResp.access_token)
            return tokenResp.access_token
        }

        if (tokenResp.error === 'authorization_pending' || tokenResp.error === 'slow_down') {
            continue
        }
        return null
    }
    return null
}

/**
 * 确保 token 可用
 *
 * 优先读本地缓存；不存在或过期则触发 OAuth 授权。
 *
 * @returns token；失败返回空字符串
 */
export async function ensureToken(): Promise<string> {
    const token = await getToken()
    if (token) return token
    return (await oauthLogin()) || ''
}

// ==================== AuthService 类（供 GitManager 转发） ====================

/**
 * 授权服务
 *
 * 封装 token 的获取/保存/清除，供 GitManager 暴露统一 API。
 */
export class AuthService {
    /**
     * 获取本地 token（不触发授权）
     * @returns token；不存在或过期返回 null
     */
    async getToken(): Promise<string | null> {
        return getToken()
    }

    /**
     * 保存 token 到本地
     */
    async saveToken(token: string): Promise<void> {
        await saveToken(token)
    }

    /**
     * 触发 OAuth 授权流程
     * @returns token；失败返回 null
     */
    async login(): Promise<string | null> {
        return oauthLogin()
    }

    /**
     * 确保 token 可用（取本地或触发授权）
     * @returns token；失败返回空字符串
     */
    async ensureToken(): Promise<string> {
        return ensureToken()
    }

    /**
     * 清除本地 token（登出）
     */
    async logout(): Promise<GitResult> {
        const startTime = Date.now()
        try {
            await clearToken()
            return {
                success: true,
                operation: 'stage',
                message: '已清除本地 token',
                duration: Date.now() - startTime
            }
        } catch (error) {
            return {
                success: false,
                operation: 'stage',
                message: '清除 token 失败',
                error: error instanceof Error ? error.message : String(error),
                duration: Date.now() - startTime
            }
        }
    }
}

export default AuthService
