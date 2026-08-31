/**
 * nut request - 稳定可靠的 HTTP/HTTPS 请求（CLI）
 *
 * 复用 helpers/http.ts 的 request()，通过命令行发送请求并返回结果。
 * 用于 skill / 脚本中需要发起网络请求的场景（不自己拼 fetch）。
 *
 * 用法:
 *   nut request GET https://api.example.com/health
 *   nut request POST https://api.example.com/users -d '{"name":"tom"}' -H 'Content-Type: application/json'
 *   nut request GET https://api.example.com/search --query 'q=node&page=2'
 *   nut request GET https://api.example.com/file -o result.json
 *   node dist/cli/index.cjs request GET https://api.example.com/health
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { request, HttpError, type HttpMethod, type HttpResponse } from '../helpers'

interface ParsedRequestArgs {
    method: string
    url: string
    headers: Record<string, string>
    body?: string
    query?: Record<string, string>
    timeout?: number
    auth?: string
    responseType: 'json' | 'text' | 'auto'
    output?: string
    noThrow: boolean
    retry?: number
}

function addHeader(result: ParsedRequestArgs, value: string): void {
    const idx = value.indexOf(':')
    if (idx > 0)
        result.headers[value.slice(0, idx).trim().toLowerCase()] = value.slice(idx + 1).trim()
}

function parseQuery(query?: string): Record<string, string> | undefined {
    if (!query) return undefined
    const result: Record<string, string> = {}
    for (const pair of query.split('&')) {
        const eq = pair.indexOf('=')
        if (eq > 0) result[pair.slice(0, eq)] = pair.slice(eq + 1)
    }
    return result
}

function parseArgs(args: string[]): ParsedRequestArgs {
    const result: ParsedRequestArgs = {
        method: 'GET',
        url: '',
        headers: {},
        responseType: 'auto',
        noThrow: false
    }

    const valueFlags: Record<string, (value: string) => void> = {
        '-H': (v) => addHeader(result, v),
        '--header': (v) => addHeader(result, v),
        '-d': (v) => {
            result.body = v
        },
        '--data': (v) => {
            result.body = v
        },
        '--query': (v) => {
            result.query = parseQuery(v)
        },
        '--params': (v) => {
            result.query = parseQuery(v)
        },
        '--timeout': (v) => {
            result.timeout = parseInt(v, 10)
        },
        '--auth': (v) => {
            result.auth = v
        },
        '--response-type': (v) => {
            result.responseType = (v as 'json' | 'text' | 'auto') || 'auto'
        },
        '-o': (v) => {
            result.output = v
        },
        '--output': (v) => {
            result.output = v
        },
        '--retry': (v) => {
            result.retry = parseInt(v, 10)
        }
    }

    const positionals: string[] = []
    let i = 0
    while (i < args.length) {
        const arg = args[i]
        if (arg === '--help' || arg === '-h') {
            printHelp()
            process.exit(0)
        }
        if (arg === '--no-throw') {
            result.noThrow = true
            i++
            continue
        }
        const handler = valueFlags[arg]
        if (handler) {
            handler(args[++i])
            i++
            continue
        }
        positionals.push(arg)
        i++
    }

    if (positionals.length >= 1) {
        const first = positionals[0]
        if (/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)$/i.test(first)) {
            result.method = first.toUpperCase()
            result.url = positionals[1] || ''
        } else {
            result.url = first
        }
    }

    return result
}

function parseAuth(auth: string): { username: string; password: string } {
    const idx = auth.indexOf(':')
    if (idx < 0) return { username: auth, password: '' }
    return { username: auth.slice(0, idx), password: auth.slice(idx + 1) }
}

function resolveBody(body?: string): unknown {
    if (body === undefined) return undefined
    if (body.startsWith('@')) return readFileSync(body.slice(1), 'utf8')
    const trimmed = body.trim()
    if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
        try {
            return JSON.parse(trimmed)
        } catch {
            return body
        }
    }
    return body
}

function serialize(data: unknown): string {
    return typeof data === 'string' ? data : JSON.stringify(data, null, 2)
}

function printResponse(response: HttpResponse, output?: string): void {
    const payload = serialize(response.data)
    if (output) {
        writeFileSync(output, payload)
        console.log(`✅ ${response.status} ${response.statusText} → 已写入 ${output}`)
    } else {
        console.log(`✅ ${response.status} ${response.statusText}`)
        console.log(payload)
    }
}

function printError(error: unknown): void {
    if (error instanceof HttpError) {
        console.error(`❌ ${error.status} ${error.statusText}`)
        const data = error.response?.data
        if (data !== undefined) console.error(serialize(data))
    } else {
        console.error(`❌ 请求失败: ${error instanceof Error ? error.message : String(error)}`)
    }
}

export async function runRequest(args: string[]): Promise<void> {
    const opts = parseArgs(args)

    if (!opts.url) {
        console.error('请提供请求 URL，例如: nut request GET https://api.example.com')
        process.exit(1)
    }

    const auth = opts.auth ? parseAuth(opts.auth) : undefined
    const body = resolveBody(opts.body)

    try {
        const response = await request(opts.url, {
            method: opts.method as HttpMethod,
            headers: opts.headers,
            body,
            params: opts.query,
            timeout: opts.timeout,
            responseType: opts.responseType,
            throwOnError: !opts.noThrow,
            auth,
            retry: opts.retry
        })
        printResponse(response, opts.output)
        process.exit(0)
    } catch (error) {
        printError(error)
        process.exit(1)
    }
}

function printHelp(): void {
    console.log(`
🌐 nut request - 稳定可靠的 HTTP/HTTPS 请求

复用 helpers/http.ts（基于 Node fetch，超时 + 网络层重试 + Body 自动序列化）。
用于 skill / 脚本发起网络请求，不自己拼 fetch。

用法:
  nut request <METHOD> <url> [选项]

位置参数:
  <METHOD>    GET | POST | PUT | DELETE | PATCH | HEAD | OPTIONS（默认 GET）
  <url>       请求地址

选项:
  -H, --header <header>    请求头，可重复，如 -H 'Content-Type: application/json'
  -d, --data <data>        请求体；JSON 字符串或 @file 读取文件内容
  --query, --params <q>    查询参数，如 --query 'q=node&page=2'
  --timeout <ms>           超时时间（毫秒）
  --auth <user:pass>       Basic Auth
  --response-type <t>      json | text | auto（默认 auto）
  -o, --output <file>      将响应体写入文件
  --no-throw               非 2xx 不视为失败（仍 exit 0）
  --retry <N>              网络层重试次数
  --help, -h               显示帮助

示例:
  nut request GET https://api.example.com/health
  nut request POST https://api.example.com/users -d '{"name":"tom"}' -H 'Content-Type: application/json'
  nut request GET https://api.example.com/search --query 'q=node&page=2'
  nut request GET https://api.example.com/file -o result.json
  node dist/cli/index.cjs request GET https://api.example.com/health
`)
}
