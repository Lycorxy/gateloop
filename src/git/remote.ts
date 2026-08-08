/**
 * Git 远程 MR 管理（工蜂 GitLab API v3/v4 兼容）
 *
 * 依赖 auth.ts 提供的 token。所有 API 调用走 https://git.woa.com。
 *
 * 核心能力：
 *   - getProjectId      从 remote.origin.url 解析项目路径
 *   - createMR          创建 Merge Request
 *   - checkMRExists     检查 MR 是否已存在（防重复创建）
 *   - listMRs           列出 MR（opened/merged/closed/all）
 *
 * 所有方法都需要 token；无 token 时调用方应先 ensureToken()。
 */

import { request } from 'node:https'
import { gitExecOrThrow } from './executor'
import { getToken } from './auth'
import type { GitResult } from './types'

// ==================== 常量 ====================

/** 工蜂主机 */
const GIT_HOST = 'git.woa.com'

/** API 版本前缀（工蜂兼容 v3，也可用 v4） */
const API_BASE = '/api/v3'

// ==================== 类型 ====================

/** MR 状态 */
export type MRState = 'opened' | 'merged' | 'closed' | 'all'

/** MR 创建选项 */
export interface CreateMROptions {
    /** 源分支 */
    sourceBranch: string
    /** 目标分支 */
    targetBranch: string
    /** MR 标题 */
    title: string
    /** 评审人 ID 列表（可选） */
    reviewerIds?: number[]
    /** token（必填，从 auth.ensureToken 取） */
    token: string
}

/** MR 信息 */
export interface MRInfo {
    /** MR 内部 ID（如 !123） */
    iid: number
    /** MR 数据库 ID */
    id: number
    /** 标题 */
    title: string
    /** 状态 */
    state: MRState
    /** 源分支 */
    sourceBranch: string
    /** 目标分支 */
    targetBranch: string
    /** 作者 */
    author: string
    /** web 链接 */
    webUrl: string
    /** 创建时间 */
    createdAt: string
}

/** 创建结果 */
export interface CreateMRResult {
    success: boolean
    /** MR web 链接 */
    url?: string
    /** MR 不存在时给用户手动创建的链接 */
    manualUrl?: string
    /** 错误信息 */
    error?: string
}

// ==================== HTTP 工具 ====================

/**
 * GET 请求
 */
function getJSON(pathUrl: string, token: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const req = request(
            {
                hostname: GIT_HOST,
                port: 443,
                path: `${pathUrl}${pathUrl.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`,
                method: 'GET',
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
            reject(new Error('API 请求超时'))
        })
        req.end()
    })
}

/**
 * POST 请求
 */
function postJSON(pathUrl: string, body: unknown, token: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body)
        const req = request(
            {
                hostname: GIT_HOST,
                port: 443,
                path: `${pathUrl}?access_token=${encodeURIComponent(token)}`,
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
            reject(new Error('API 请求超时'))
        })
        req.write(data)
        req.end()
    })
}

// ==================== 项目信息 ====================

/**
 * 从 remote.origin.url 解析项目路径（如 kfweb/my-project）
 * @returns 项目路径；失败返回空字符串
 */
export async function getProjectId(): Promise<string> {
    try {
        const url = (await gitExecOrThrow(['config', '--get', 'remote.origin.url'])).trim()
        const match = url.match(/git\.woa\.com[:/](.+?)(\.git)?$/)
        return match ? match[1].replace(/\.git$/, '') : ''
    } catch {
        return ''
    }
}

// ==================== MR 操作 ====================

/**
 * 检查 MR 是否已存在（防重复创建）
 */
export async function checkMRExists(
    sourceBranch: string,
    targetBranch: string,
    token: string
): Promise<boolean> {
    const projectId = await getProjectId()
    if (!projectId || !token) return false

    try {
        const url = `${API_BASE}/projects/${encodeURIComponent(projectId)}/merge_requests?state=opened&source_branch=${encodeURIComponent(sourceBranch)}&target_branch=${encodeURIComponent(targetBranch)}`
        const list = (await getJSON(url, token)) as Array<Record<string, unknown>>
        return Array.isArray(list) && list.length > 0
    } catch {
        return false
    }
}

/**
 * 创建 MR
 *
 * @returns 创建结果（含 MR 链接或手动创建链接）
 */
export async function createMR(options: CreateMROptions): Promise<CreateMRResult> {
    const { sourceBranch, targetBranch, title, reviewerIds = [], token } = options
    const projectId = await getProjectId()

    if (!projectId) {
        return { success: false, error: '无法获取项目 ID（请检查 remote.origin.url）' }
    }

    const tokenError = validateToken(token, projectId, sourceBranch, targetBranch)
    if (tokenError) return tokenError

    if (await checkMRExists(sourceBranch, targetBranch, token!)) {
        return { success: false, error: `MR 已存在: ${sourceBranch} -> ${targetBranch}` }
    }

    try {
        const body = buildMRBody(sourceBranch, targetBranch, title, reviewerIds)
        const url = `${API_BASE}/projects/${encodeURIComponent(projectId)}/repository/merge_requests`
        const resp = (await postJSON(url, body, token!)) as {
            web_url?: string
            message?: string | string[]
            error?: string
        }

        if (resp.web_url) return { success: true, url: resp.web_url }

        return { success: false, error: extractErrorMessage(resp) }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        }
    }
}

/** 验证 token，返回错误结果或 null */
function validateToken(
    token: string | undefined,
    projectId: string,
    sourceBranch: string,
    targetBranch: string
): CreateMRResult | null {
    if (!token) {
        const manualUrl = `https://${GIT_HOST}/${projectId}/merge_requests/new?source_branch=${encodeURIComponent(sourceBranch)}&target_branch=${encodeURIComponent(targetBranch)}`
        return { success: false, manualUrl, error: '未配置 token，请先 ensureToken()' }
    }
    return null
}

/** 构建 MR 请求体 */
function buildMRBody(
    sourceBranch: string,
    targetBranch: string,
    title: string,
    reviewerIds: number[]
): Record<string, unknown> {
    const body: Record<string, unknown> = {
        source_branch: sourceBranch,
        target_branch: targetBranch,
        title
    }
    if (reviewerIds.length > 0) {
        body.assignee_ids = reviewerIds
        body.reviewer_ids = reviewerIds
    }
    return body
}

/** 从响应中提取错误消息 */
function extractErrorMessage(resp: { message?: string | string[]; error?: string }): string {
    if (resp.message) {
        return Array.isArray(resp.message) ? resp.message.join('; ') : resp.message
    }
    return resp.error || '未知错误'
}

/**
 * 列出 MR
 *
 * @param state MR 状态过滤
 * @param perPage 每页数量，默认 50
 */
export async function listMRs(state: MRState = 'opened', perPage = 50): Promise<MRInfo[]> {
    const projectId = await getProjectId()
    if (!projectId) return []

    const token = await getToken()
    if (!token) return []

    try {
        const url = `${API_BASE}/projects/${encodeURIComponent(projectId)}/merge_requests?state=${state}&per_page=${perPage}`
        const list = (await getJSON(url, token)) as Array<Record<string, unknown>>
        if (!Array.isArray(list)) return []

        return list.map((mr) => ({
            iid: Number(mr.iid ?? 0),
            id: Number(mr.id ?? 0),
            title: String(mr.title ?? ''),
            state: (mr.state as MRState) ?? 'opened',
            sourceBranch: String(mr.source_branch ?? ''),
            targetBranch: String(mr.target_branch ?? ''),
            author: String((mr.author as Record<string, unknown>)?.username ?? 'unknown'),
            webUrl: String(mr.web_url ?? ''),
            createdAt: String(mr.created_at ?? '')
        }))
    } catch {
        return []
    }
}

// ==================== RemoteService 类（供 GitManager 转发） ====================

/**
 * 远程 MR 服务
 *
 * 封装所有 GitLab API 调用，供 GitManager 暴露统一 API。
 */
export class RemoteService {
    /**
     * 创建 MR
     *
     * @example
     * await git.createMR({
     *   sourceBranch: 'feature/login_v1.0.0',
     *   targetBranch: 'release/v1.0.0',
     *   title: 'feat: 登录功能'
     * })  // token 由 GitManager 自动注入
     */
    async createMR(options: Omit<CreateMROptions, 'token'>): Promise<CreateMRResult> {
        const token = await getToken()
        if (!token) {
            // 自动触发授权
            const { ensureToken } = await import('./auth')
            const t = await ensureToken()
            if (!t) {
                return { success: false, error: '未授权，请先 git.auth.login()' }
            }
            return createMR({ ...options, token: t })
        }
        return createMR({ ...options, token })
    }

    /** 检查 MR 是否已存在 */
    async checkMRExists(sourceBranch: string, targetBranch: string): Promise<boolean> {
        const token = await getToken()
        if (!token) return false
        return checkMRExists(sourceBranch, targetBranch, token)
    }

    /** 列出 MR */
    async listMRs(state: MRState = 'opened', perPage = 50): Promise<MRInfo[]> {
        return listMRs(state, perPage)
    }

    /** 获取项目 ID（路径，如 kfweb/my-project） */
    async getProjectId(): Promise<string> {
        return getProjectId()
    }

    /**
     * 列出 MR（GitResult 包装，便于 CLI 输出）
     */
    async listMRsResult(state: MRState = 'opened'): Promise<GitResult> {
        const startTime = Date.now()
        try {
            const mrs = await listMRs(state)
            return {
                success: true,
                operation: 'stage',
                message: `共找到 ${mrs.length} 个 MR`,
                data: { count: mrs.length, mrs },
                duration: Date.now() - startTime
            }
        } catch (error) {
            return {
                success: false,
                operation: 'stage',
                message: '获取 MR 列表失败',
                error: error instanceof Error ? error.message : String(error),
                duration: Date.now() - startTime
            }
        }
    }
}

export default RemoteService
