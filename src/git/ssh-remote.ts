/**
 * 工蜂 Git SSH Key 远程 API 客户端
 *
 * 对接腾讯工蜂 git.woa.com（GitLab 兼容），API 版本 v3。
 * 认证方式：PRIVATE-TOKEN 请求头。
 *
 * 核心能力：
 *   - uploadKey      注册公钥（POST /api/v3/user/keys），区分"已存在"
 *   - listKeys       查询已注册的 Key 列表（GET /api/v3/user/keys）
 *   - deleteKey      删除指定 Key（DELETE /api/v3/user/keys/:id）
 *   - verifyToken    验证 Token 有效性（GET /api/v3/user）
 *
 * token 来源：调用方传入（通常由 auth.ensureToken() 自动获取），
 * 本模块不持有 token，也不落盘。
 */

import { request } from 'node:https'
import { hostname } from 'node:os'
import { getToken } from './auth'
import type { SSHKeyInfo, UploadKeyResult, VerifyTokenResult } from './types'

// ==================== 常量 ====================

/** 工蜂主机（GitLab 兼容） */
const GIT_HOST = 'git.woa.com'

/** API 版本前缀 */
const API_BASE = '/api/v3'

/** 请求超时（毫秒） */
const REQUEST_TIMEOUT = 15000

// ==================== 认证类型 ====================

/**
 * Token 认证类型（两种方式必须区分，认证传递方式不同）
 *
 * - oauth：OAuth device flow 获取的 access_token
 *           必须通过 URL query 参数 `?access_token=` 传递（flowcli 实测）
 * - pat：  个人私有 token（Personal Access Token，--token 传入）
 *           通过 `PRIVATE-TOKEN` header 传递（GitLab 标准）
 */
export type AuthType = 'oauth' | 'pat'

// ==================== HTTP 工具 ====================

/**
 * 封装 HTTPS 请求（区分 oauth / pat 两种认证方式）
 *
 * @param method HTTP 方法
 * @param pathUrl API 路径（如 /api/v3/user/keys）
 * @param token access_token 或 PRIVATE-TOKEN
 * @param authType 认证类型：oauth（query 参数）/ pat（header）
 * @param body 请求体（POST 时传）
 * @returns { statusCode, body }；网络错误时 reject
 */
function httpRequest(
    method: 'GET' | 'POST' | 'DELETE',
    pathUrl: string,
    token: string,
    authType: AuthType,
    body?: unknown
): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null

        // 根据认证类型决定 token 传递方式
        let path = pathUrl
        const headers: Record<string, string | number> = { Accept: 'application/json' }

        if (authType === 'oauth') {
            // OAuth access_token → URL query 参数（工蜂只认这个）
            const sep = pathUrl.includes('?') ? '&' : '?'
            path = `${pathUrl}${sep}access_token=${encodeURIComponent(token)}`
        } else {
            // PAT → PRIVATE-TOKEN header
            headers['PRIVATE-TOKEN'] = token
        }

        if (data) {
            headers['Content-Type'] = 'application/json'
            headers['Content-Length'] = Buffer.byteLength(data)
        }

        const req = request(
            {
                hostname: GIT_HOST,
                port: 443,
                path,
                method,
                headers,
                timeout: REQUEST_TIMEOUT
            },
            (res) => {
                let buf = ''
                res.on('data', (c: Buffer) => {
                    buf += c.toString()
                })
                res.on('end', () => {
                    resolve({ statusCode: res.statusCode || 0, body: buf })
                })
            }
        )
        req.on('error', reject)
        req.on('timeout', () => {
            req.destroy()
            reject(new Error('工蜂 API 请求超时'))
        })
        if (data) req.write(data)
        req.end()
    })
}

/**
 * 解析响应体为 JSON（失败返回原字符串）
 */
function parseBody(body: string): unknown {
    try {
        return JSON.parse(body)
    } catch {
        return body
    }
}

// ==================== 核心 API ====================

/**
 * 注册公钥到工蜂平台
 *
 * 调用 POST /api/v3/user/keys。
 * title 格式：{主机名}-{时间戳}。
 * 处理 400 错误（fingerprint 已存在）。
 *
 * @param pubKey 公钥内容（含 ssh-ed25519 前缀）
 * @param token access_token（oauth）或 PRIVATE-TOKEN（pat）
 * @param title 可选自定义标题；默认 {hostname}-{timestamp}
 * @param authType 认证类型：oauth（query 参数）/ pat（header）
 */
export async function uploadKey(
    pubKey: string,
    token: string,
    title?: string,
    authType: AuthType = 'oauth'
): Promise<UploadKeyResult> {
    if (!token) {
        return { success: false, alreadyExists: false, error: '未提供 token' }
    }

    const keyTitle = title || `${hostname()}-${Date.now()}`

    try {
        const { statusCode, body } = await httpRequest(
            'POST',
            `${API_BASE}/user/keys`,
            token,
            authType,
            {
                title: keyTitle,
                key: pubKey
            }
        )

        return resolveUploadResult(statusCode, body)
    } catch (error) {
        return {
            success: false,
            alreadyExists: false,
            error: error instanceof Error ? error.message : String(error)
        }
    }
}

/** 根据状态码解析上传结果 */
function resolveUploadResult(statusCode: number, body: string): UploadKeyResult {
    if (statusCode === 201 || statusCode === 200) {
        return { success: true, alreadyExists: false }
    }

    if (statusCode === 400) {
        return parse400Response(body)
    }

    if (statusCode === 401) {
        return {
            success: false,
            alreadyExists: false,
            error: `Token 无效或已过期（HTTP 401）${body ? `: ${body.slice(0, 200)}` : ''}`
        }
    }

    if (statusCode === 403) {
        return {
            success: false,
            alreadyExists: false,
            error: `权限不足（HTTP 403，可能是 OAuth scope 不含 api）${body ? `: ${body.slice(0, 200)}` : ''}`
        }
    }

    return {
        success: false,
        alreadyExists: false,
        error: `注册失败: HTTP ${statusCode} ${body.slice(0, 200)}`
    }
}

/** 解析 400 响应（可能为公钥重复） */
function parse400Response(body: string): UploadKeyResult {
    const parsed = parseBody(body) as { message?: Record<string, string[]> }
    const msg = parsed?.message

    const isDuplicate =
        msg?.fingerprint?.some((m: string) => m.includes('already been taken')) ||
        msg?.key?.some((m: string) => m.includes('already been taken'))

    if (isDuplicate) {
        return { success: false, alreadyExists: true, error: '公钥已在平台存在（指纹重复）' }
    }

    return {
        success: false,
        alreadyExists: false,
        error: typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
    }
}

/**
 * 查询当前用户已注册的 SSH Key 列表
 *
 * 调用 GET /api/v3/user/keys。
 *
 * @param token PRIVATE-TOKEN；不传则自动读本地缓存
 * @param authType 认证类型；默认 oauth（缓存的是 OAuth access_token）
 * @returns Key 列表（id/title/key/createdAt）
 */
export async function listKeys(
    token?: string,
    authType: AuthType = 'oauth'
): Promise<SSHKeyInfo[]> {
    const tk = token || (await getToken())
    if (!tk) return []

    try {
        const { statusCode, body } = await httpRequest('GET', `${API_BASE}/user/keys`, tk, authType)
        if (statusCode !== 200) return []

        const list = parseBody(body) as Array<Record<string, unknown>>
        if (!Array.isArray(list)) return []

        return list.map((item) => ({
            id: Number(item.id ?? 0),
            title: String(item.title ?? ''),
            key: String(item.key ?? ''),
            createdAt: String(item.created_at ?? '')
        }))
    } catch {
        return []
    }
}

/**
 * 删除指定的 SSH Key
 *
 * 调用 DELETE /api/v3/user/keys/:id（幂等操作，404 视为已删除）。
 *
 * @param id Key ID
 * @param token PRIVATE-TOKEN；不传则自动读本地缓存
 * @param authType 认证类型；默认 oauth（缓存的是 OAuth access_token）
 * @returns 是否删除成功
 */
export async function deleteKey(
    id: number,
    token?: string,
    authType: AuthType = 'oauth'
): Promise<boolean> {
    const tk = token || (await getToken())
    if (!tk) return false

    try {
        const { statusCode } = await httpRequest(
            'DELETE',
            `${API_BASE}/user/keys/${id}`,
            tk,
            authType
        )
        // 200 成功；404 视为已删除（幂等）
        return statusCode === 200 || statusCode === 204 || statusCode === 404
    } catch {
        return false
    }
}

/**
 * 验证 Token 有效性（获取当前认证用户信息）
 *
 * 调用 GET /api/v3/user。
 *
 * @param token PRIVATE-TOKEN；不传则自动读本地缓存
 * @param authType 认证类型；默认 oauth（缓存的是 OAuth access_token）
 * @returns 验证结果（含用户名/全名/ID）
 */
export async function verifyToken(
    token?: string,
    authType: AuthType = 'oauth'
): Promise<VerifyTokenResult> {
    const tk = token || (await getToken())
    if (!tk) {
        return { valid: false, error: '未找到本地 token，请先 git.login() 授权' }
    }

    try {
        const { statusCode, body } = await httpRequest('GET', `${API_BASE}/user`, tk, authType)

        if (statusCode === 200) {
            const user = parseBody(body) as {
                username?: string
                name?: string
                id?: number
            }
            return {
                valid: true,
                username: user.username,
                name: user.name,
                userId: user.id
            }
        }

        if (statusCode === 401) {
            return { valid: false, error: 'Token 无效或已过期，请重新 git.login()' }
        }

        return { valid: false, error: `验证失败: HTTP ${statusCode}` }
    } catch (error) {
        return {
            valid: false,
            error: error instanceof Error ? error.message : String(error)
        }
    }
}

// ==================== SshRemoteService 类（供 GitManager 转发） ====================

/**
 * SSH Key 远程服务
 *
 * 封装所有工蜂 GitLab API 调用，供 GitManager 暴露统一 API。
 * token 由调用方传入或自动读本地缓存，本服务不触发 OAuth 授权。
 */
export class SshRemoteService {
    /**
     * 注册公钥到工蜂
     *
     * @param pubKey 公钥内容
     * @param token PRIVATE-TOKEN（必填，通常由 ensureToken 获取）
     * @param title 可选标题
     */
    async uploadKey(
        pubKey: string,
        token: string,
        title?: string,
        authType: AuthType = 'oauth'
    ): Promise<UploadKeyResult> {
        return uploadKey(pubKey, token, title, authType)
    }

    /** 查询已注册的 Key 列表 */
    async listKeys(authType: AuthType = 'oauth'): Promise<SSHKeyInfo[]> {
        return listKeys(undefined, authType)
    }

    /** 删除指定 Key */
    async deleteKey(id: number, authType: AuthType = 'oauth'): Promise<boolean> {
        return deleteKey(id, undefined, authType)
    }

    /** 验证当前 token 是否有效 */
    async verifyToken(authType: AuthType = 'oauth'): Promise<VerifyTokenResult> {
        return verifyToken(undefined, authType)
    }
}

export default SshRemoteService
