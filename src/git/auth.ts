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
 * ssh.ts 会自动 POST 公钥到 /api/v3/user/keys。
 *
 * ⚠️ 已知限制：工蜂公共 OAuth client 的 scope 仅覆盖项目级 API（如 MR），
 * 不含用户级 SSH key 写权限（POST /user/keys 返回 401）。
 * 因此自动上传 SSH key 需用 Personal Access Token（--token 传入），
 * OAuth token 只能用于项目级操作（与 flowcli 一致）。
 */

import { request } from 'node:https'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { execSync, spawn } from 'node:child_process'
import { readJson, writeJson, exists, removeFile } from '../helpers/file'
import { isWindows, isMac, isLinux } from '../helpers/exec'
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
 * 用 execSync 直接执行（比 execShell 更可靠，避免 shell 转义问题）
 * 失败时返回 false（终端已打印手动链接，用户可手动打开）
 */
export function openUrl(url: string): boolean {
    try {
        if (isWindows) {
            // cmd /c start "" "url" 是 Windows 打开默认浏览器最可靠的方式
            execSync(`start "" "${url}"`, { shell: 'cmd.exe', stdio: 'ignore' })
        } else if (isMac) {
            execSync(`open "${url}"`, { stdio: 'ignore' })
        } else if (isLinux) {
            execSync(`xdg-open "${url}"`, { stdio: 'ignore' })
        } else {
            return false
        }
        return true
    } catch {
        return false
    }
}

/**
 * 复制文本到系统剪贴板（用于授权验证码 / 公钥）
 * 用 spawn 写入 stdin，避免 shell 转义和中文编码问题
 * 失败时返回 false（终端已打印文本，用户可手动复制）
 */
export function copyToClipboard(text: string): boolean {
    try {
        if (isWindows) {
            const child = spawn('clip', [], { stdio: ['pipe', 'ignore', 'ignore'] })
            child.stdin.write(text)
            child.stdin.end()
            return true
        }
        if (isMac) {
            const child = spawn('pbcopy', [], { stdio: ['pipe', 'ignore', 'ignore'] })
            child.stdin.write(text)
            child.stdin.end()
            return true
        }
        if (isLinux) {
            // 优先 xclip，回退 xsel
            const child = spawn('xclip', ['-selection', 'clipboard'], {
                stdio: ['pipe', 'ignore', 'ignore']
            })
            child.stdin.write(text)
            child.stdin.end()
            return true
        }
        return false
    } catch {
        return false
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
    let codeResp: DeviceCodeResponse
    try {
        codeResp = (await postJSON('/oauth/device/code', {
            client_id: CLIENT_ID,
            scope: 'api'
        })) as DeviceCodeResponse
    } catch (error) {
        console.error(
            `❌ 获取设备码失败: ${error instanceof Error ? error.message : String(error)}`
        )
        return null
    }

    if (!codeResp.device_code) {
        console.error(
            `❌ 获取设备码失败: ${codeResp.error_description || codeResp.error || '响应无 device_code'}`
        )
        return null
    }

    const {
        device_code,
        user_code,
        expires_in = 300,
        interval = 5,
        verification_uri = '/oauth/device'
    } = codeResp

    if (!user_code) {
        console.error('❌ 获取设备码失败: 响应缺少 user_code（验证码）')
        return null
    }

    // 2. 打印授权提示 + 复制验证码 + 自动打开浏览器
    const authUrl = `https://${GIT_HOST}${verification_uri}?user_code=${user_code}`

    // 复制验证码到剪贴板（用户点授权前自动就绪）
    const copied = copyToClipboard(user_code)

    // 自动打开浏览器（URL 已带 user_code，工蜂页面通常会自动填充）
    const opened = openUrl(authUrl)

    console.log('\n========== 需要授权 ==========')
    console.log('已自动打开浏览器，验证码已复制到剪贴板')
    if (copied) {
        console.log(`  验证码: ${user_code}  ✅ 已复制，如页面未自动填充请 Ctrl+V 粘贴`)
    } else {
        console.log(`  验证码: ${user_code}  （剪贴板复制失败，请手动输入）`)
    }
    if (!opened) {
        console.log(`  ⚠️ 浏览器自动打开失败，请手动打开链接：`)
        console.log(`  链接:   ${authUrl}`)
    }
    console.log('===============================\n')

    // 4. 轮询获取 token
    return pollForToken(device_code, expires_in, interval)
}

/**
 * 轮询换取 access_token
 *
 * @param deviceCode 设备码
 * @param expiresIn 有效期（秒）
 * @param interval 轮询间隔（秒）
 * @returns access_token；失败返回 null
 */
async function pollForToken(
    deviceCode: string,
    expiresIn: number,
    interval: number
): Promise<string | null> {
    const start = Date.now()
    while (Date.now() - start < expiresIn * 1000) {
        await new Promise((r) => setTimeout(r, interval * 1000))

        let tokenResp: TokenResponse
        try {
            tokenResp = (await postJSON('/oauth/device/token', {
                client_id: CLIENT_ID,
                device_code: deviceCode,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
            })) as TokenResponse
        } catch (error) {
            console.error(
                `❌ 轮询 token 失败: ${error instanceof Error ? error.message : String(error)}`
            )
            return null
        }

        if (tokenResp.access_token) {
            console.log('✅ 授权成功')
            await saveToken(tokenResp.access_token)
            return tokenResp.access_token
        }

        if (tokenResp.error === 'authorization_pending' || tokenResp.error === 'slow_down') {
            continue
        }

        console.error(
            `❌ 授权失败: ${tokenResp.error_description || tokenResp.error || '未知错误'}`
        )
        return null
    }

    console.error('⏱️ 授权超时，未在有效期内完成授权')
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
