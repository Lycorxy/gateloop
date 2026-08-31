/**
 * HTTP/HTTPS 请求封装
 *
 * 基于 Node 原生 fetch（Node 18+，同时支持 http / https），提供稳定可靠的请求发送与响应返回。
 * 设计原则：无事件监听、无拦截器/过滤器，仅做「发送请求 → 解析响应 → 返回/抛错」这一件事。
 * 支持 GET / POST / PUT / DELETE / PATCH / HEAD / OPTIONS，以及超时、网络层重试、Body 自动序列化。
 */

import { Buffer } from 'node:buffer'
import { retry, type RetryOptions } from './async'

/** 支持的 HTTP 方法 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

/** 响应体解析方式 */
export type HttpResponseType = 'auto' | 'json' | 'text' | 'arrayBuffer' | 'blob'

/** 重试配置（仅针对网络层错误，不含状态码过滤） */
export interface HttpRetryOptions {
    /** 重试次数（不含首次） */
    times?: number
    /** 重试间隔（毫秒） */
    delay?: number
    /** 指数退避 */
    exponential?: boolean
    /** 最大延迟（毫秒） */
    maxDelay?: number
    /** 每次重试回调 */
    onRetry?: (error: Error, attempt: number) => void
}

/** 请求选项 */
export interface HttpRequestOptions {
    /** 请求方法，默认 GET */
    method?: HttpMethod
    /** 基础地址，会与 url 拼接（自动处理多余斜杠） */
    baseURL?: string
    /** 请求头 */
    headers?: Record<string, string> | Headers
    /** URL 查询参数（对象或 URLSearchParams）；数组值会展开为多参数 */
    params?: Record<string, unknown> | URLSearchParams
    /** params 的别名 */
    query?: Record<string, unknown> | URLSearchParams
    /** 请求体：对象/数组 → JSON；string → 原样；FormData/URLSearchParams/Blob/Buffer → 透传 */
    body?: unknown
    /** 超时时间（毫秒），超时后中止请求 */
    timeout?: number
    /** 外部 AbortSignal，与 timeout 通过 AbortSignal.any 合并（不手动监听） */
    signal?: AbortSignal
    /** 响应解析方式，默认 auto（按 Content-Type 自动选择 json / text） */
    responseType?: HttpResponseType
    /** 状态码非 2xx 时是否抛出 HttpError，默认 true */
    throwOnError?: boolean
    /** Basic Auth */
    auth?: { username: string; password: string }
    /** 重定向策略，默认 follow */
    redirect?: 'follow' | 'error' | 'manual'
    /** 网络层重试（数字表示重试次数；默认不重试） */
    retry?: number | HttpRetryOptions
}

/** 统一响应结构 */
export interface HttpResponse<T = unknown> {
    /** 是否成功（2xx） */
    ok: boolean
    /** HTTP 状态码 */
    status: number
    /** 状态文本 */
    statusText: string
    /** 响应头（小写键） */
    headers: Record<string, string>
    /** 最终请求地址 */
    url: string
    /** 解析后的响应体 */
    data: T
    /** 原始 Response 对象 */
    raw: Response
    /** 请求耗时（毫秒） */
    timing: number
}

/** HTTP 请求错误 */
export class HttpError extends Error {
    /** HTTP 状态码 */
    status: number
    /** 状态文本 */
    statusText: string
    /** 关联响应（若有） */
    response?: HttpResponse

    constructor(message: string, status: number, statusText: string, response?: HttpResponse) {
        super(message)
        this.name = 'HttpError'
        this.status = status
        this.statusText = statusText
        this.response = response
    }
}

function appendParams(
    target: URLSearchParams,
    params: Record<string, unknown> | URLSearchParams
): void {
    if (params instanceof URLSearchParams) {
        params.forEach((value, key) => target.append(key, value))
        return
    }
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue
        if (Array.isArray(value)) {
            value.forEach((item) => target.append(key, String(item)))
        } else if (typeof value === 'object') {
            target.append(key, JSON.stringify(value))
        } else {
            target.append(key, String(value))
        }
    }
}

function buildUrl(
    input: string,
    baseURL?: string,
    params?: Record<string, unknown> | URLSearchParams
): string {
    let urlStr = input
    if (baseURL) {
        const base = baseURL.replace(/\/+$/, '')
        const path = input.replace(/^\/+/, '')
        urlStr = path ? `${base}/${path}` : base
    }
    // new URL 会校验必须为绝对地址（http/https），否则抛出清晰错误
    const url = new URL(urlStr)
    if (params) appendParams(url.searchParams, params)
    return url.toString()
}

/** 判断 body 是否为可直接透传给 fetch 的类型 */
function isBodyInitPassthrough(body: unknown): body is BodyInit {
    return (
        body instanceof URLSearchParams ||
        body instanceof FormData ||
        body instanceof Blob ||
        body instanceof ArrayBuffer ||
        ArrayBuffer.isView(body)
    )
}

function serializeBody(body: unknown, headers: Headers): BodyInit | undefined {
    if (body === undefined || body === null) return undefined

    if (isBodyInitPassthrough(body)) {
        return body
    }

    if (typeof body === 'string') {
        if (!headers.has('content-type')) headers.set('content-type', 'text/plain;charset=utf-8')
        return body
    }

    if (typeof body === 'object') {
        if (!headers.has('content-type'))
            headers.set('content-type', 'application/json;charset=utf-8')
        return JSON.stringify(body)
    }

    return String(body)
}

async function toHttpResponse<T>(
    res: Response,
    responseType: HttpResponseType,
    url: string,
    timing: number
): Promise<HttpResponse<T>> {
    const headers: Record<string, string> = {}
    res.headers.forEach((value, key) => {
        headers[key] = value
    })

    const ct = res.headers.get('content-type') ?? ''
    let data: unknown

    if (responseType === 'json') {
        data = await res.json()
    } else if (responseType === 'text') {
        data = await res.text()
    } else if (responseType === 'arrayBuffer') {
        data = await res.arrayBuffer()
    } else if (responseType === 'blob') {
        data = await res.blob()
    } else if (ct.includes('application/json')) {
        data = await res.json().catch(() => null)
    } else if (ct.startsWith('text/') || ct.includes('xml') || ct.includes('html')) {
        data = await res.text()
    } else {
        data = await res.text()
    }

    return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        headers,
        url,
        data: data as T,
        raw: res,
        timing
    }
}

interface ExecuteContext {
    url: string
    method: HttpMethod
    headers: Headers
    body: BodyInit | undefined
    timeout?: number
    signal?: AbortSignal
    responseType: HttpResponseType
    redirect?: 'follow' | 'error' | 'manual'
}

/** 执行单次请求（含超时；外部 signal 通过 AbortSignal.any 合并，无手动监听） */
async function executeOnce<T>(ctx: ExecuteContext): Promise<HttpResponse<T>> {
    const ctrl = new AbortController()
    const timer = ctx.timeout ? setTimeout(() => ctrl.abort(), ctx.timeout) : undefined
    const start = Date.now()
    try {
        const signal = ctx.signal ? AbortSignal.any([ctrl.signal, ctx.signal]) : ctrl.signal
        const res = await fetch(ctx.url, {
            method: ctx.method,
            headers: ctx.headers,
            body: ctx.body,
            signal,
            redirect: ctx.redirect
        })
        return await toHttpResponse<T>(res, ctx.responseType, ctx.url, Date.now() - start)
    } finally {
        if (timer) clearTimeout(timer)
    }
}

/** 归一化重试配置（仅网络层错误重试，无状态码过滤） */
function resolveRetryOptions(retryOpt: number | HttpRetryOptions): RetryOptions {
    const isNum = typeof retryOpt === 'number'
    const opts = isNum ? ({} as HttpRetryOptions) : retryOpt
    return {
        times: isNum ? retryOpt : (opts.times ?? 3),
        delay: opts.delay ?? 1000,
        exponential: opts.exponential ?? true,
        maxDelay: opts.maxDelay ?? 30000,
        onRetry: opts.onRetry
    }
}

/**
 * 发起一次 HTTP/HTTPS 请求（核心方法）
 *
 * @example
 * const res = await request('https://api.example.com/users')
 * console.log(res.status, res.data)
 */
export async function request<T = unknown>(
    url: string,
    options: HttpRequestOptions = {}
): Promise<HttpResponse<T>> {
    const {
        method = 'GET',
        baseURL,
        headers,
        params,
        query,
        body,
        timeout,
        signal,
        responseType = 'auto',
        throwOnError = true,
        auth,
        redirect,
        retry: retryOpt
    } = options

    const fullUrl = buildUrl(url, baseURL, params ?? query)
    const finalHeaders = new Headers(headers as HeadersInit)
    const finalBody = serializeBody(body, finalHeaders)

    if (auth) {
        const token = Buffer.from(`${auth.username}:${auth.password}`).toString('base64')
        finalHeaders.set('Authorization', `Basic ${token}`)
    }

    const ctx: ExecuteContext = {
        url: fullUrl,
        method,
        headers: finalHeaders,
        body: finalBody,
        timeout,
        signal,
        responseType,
        redirect
    }

    const response = retryOpt
        ? await retry(() => executeOnce<T>(ctx), resolveRetryOptions(retryOpt))
        : await executeOnce<T>(ctx)

    if (!response.ok && throwOnError) {
        throw new HttpError(
            `Request failed with status ${response.status}`,
            response.status,
            response.statusText,
            response
        )
    }

    return response
}

/** GET 请求 */
export function httpGet<T = unknown>(
    url: string,
    options: Omit<HttpRequestOptions, 'method' | 'body'> = {}
): Promise<HttpResponse<T>> {
    return request<T>(url, { ...options, method: 'GET' })
}

/** POST 请求 */
export function httpPost<T = unknown>(
    url: string,
    body?: unknown,
    options: Omit<HttpRequestOptions, 'method' | 'body'> = {}
): Promise<HttpResponse<T>> {
    return request<T>(url, { ...options, method: 'POST', body })
}

/** PUT 请求 */
export function httpPut<T = unknown>(
    url: string,
    body?: unknown,
    options: Omit<HttpRequestOptions, 'method' | 'body'> = {}
): Promise<HttpResponse<T>> {
    return request<T>(url, { ...options, method: 'PUT', body })
}

/** PATCH 请求 */
export function httpPatch<T = unknown>(
    url: string,
    body?: unknown,
    options: Omit<HttpRequestOptions, 'method' | 'body'> = {}
): Promise<HttpResponse<T>> {
    return request<T>(url, { ...options, method: 'PATCH', body })
}

/** DELETE 请求 */
export function httpDelete<T = unknown>(
    url: string,
    options: Omit<HttpRequestOptions, 'method' | 'body'> = {}
): Promise<HttpResponse<T>> {
    return request<T>(url, { ...options, method: 'DELETE' })
}

/** HEAD 请求 */
export function httpHead<T = unknown>(
    url: string,
    options: Omit<HttpRequestOptions, 'method' | 'body'> = {}
): Promise<HttpResponse<T>> {
    return request<T>(url, { ...options, method: 'HEAD' })
}

/** OPTIONS 请求 */
export function httpOptions<T = unknown>(
    url: string,
    options: Omit<HttpRequestOptions, 'method' | 'body'> = {}
): Promise<HttpResponse<T>> {
    return request<T>(url, { ...options, method: 'OPTIONS' })
}

/** 面向对象的统一门面：`http.get(...)` / `http.post(...)` 等 */
export const http = {
    request,
    get: httpGet,
    post: httpPost,
    put: httpPut,
    patch: httpPatch,
    delete: httpDelete,
    head: httpHead,
    options: httpOptions
}
