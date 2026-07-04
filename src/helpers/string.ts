/**
 * 字符串处理辅助函�? *
 * 封装常用的字符串操作
 */

// ==================== 大小写转�?====================

/**
 * 驼峰转短横线
 */
export function kebabCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase()
}

/**
 * 短横线转驼峰
 */
export function camelCase(str: string): string {
    return str
        .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
        .replace(/^./, (c) => c.toLowerCase())
}

/**
 * 转换为帕斯卡命名（大驼峰�? */
export function pascalCase(str: string): string {
    const camel = camelCase(str)
    return camel.charAt(0).toUpperCase() + camel.slice(1)
}

/**
 * 转换为下划线命名
 */
export function snakeCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/[\s-]+/g, '_')
        .toLowerCase()
}

/**
 * 转换为常量命名（大写下划线）
 */
export function constantCase(str: string): string {
    return snakeCase(str).toUpperCase()
}

/**
 * 首字母大�? */
export function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * 首字母小�? */
export function uncapitalize(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1)
}

// ==================== 字符串处�?====================

/**
 * 截断字符�? */
export function truncate(str: string, length: number, suffix: string = '...'): string {
    if (str.length <= length) return str
    return str.slice(0, length - suffix.length) + suffix
}

/**
 * 填充字符�? */
export function pad(
    str: string,
    length: number,
    char: string = ' ',
    position: 'left' | 'right' | 'both' = 'right'
): string {
    const padLength = length - str.length
    if (padLength <= 0) return str

    switch (position) {
        case 'left':
            return char.repeat(padLength) + str
        case 'right':
            return str + char.repeat(padLength)
        case 'both': {
            const leftPad = Math.floor(padLength / 2)
            const rightPad = padLength - leftPad
            return char.repeat(leftPad) + str + char.repeat(rightPad)
        }
    }
}

/**
 * 移除字符串两端的指定字符
 */
export function trim(str: string, chars: string = ' \t\n\r'): string {
    const regex = new RegExp(`^[${escapeRegExp(chars)}]+|[${escapeRegExp(chars)}]+$`, 'g')
    return str.replace(regex, '')
}

/**
 * 移除字符串开头的指定字符
 */
export function trimStart(str: string, chars: string = ' \t\n\r'): string {
    const regex = new RegExp(`^[${escapeRegExp(chars)}]+`)
    return str.replace(regex, '')
}

/**
 * 移除字符串结尾的指定字符
 */
export function trimEnd(str: string, chars: string = ' \t\n\r'): string {
    const regex = new RegExp(`[${escapeRegExp(chars)}]+$`)
    return str.replace(regex, '')
}

// ==================== 字符串检�?====================

/**
 * 检查是否以指定字符串开�? */
export function startsWith(str: string, prefix: string, ignoreCase: boolean = false): boolean {
    if (ignoreCase) {
        return str.toLowerCase().startsWith(prefix.toLowerCase())
    }
    return str.startsWith(prefix)
}

/**
 * 检查是否以指定字符串结�? */
export function endsWith(str: string, suffix: string, ignoreCase: boolean = false): boolean {
    if (ignoreCase) {
        return str.toLowerCase().endsWith(suffix.toLowerCase())
    }
    return str.endsWith(suffix)
}

/**
 * 检查是否包含指定字符串
 */
export function contains(str: string, search: string, ignoreCase: boolean = false): boolean {
    if (ignoreCase) {
        return str.toLowerCase().includes(search.toLowerCase())
    }
    return str.includes(search)
}

/**
 * 检查是否为空白字符�? */
export function isBlank(str: string): boolean {
    return str.trim().length === 0
}

/**
 * 检查是否为非空字符�? */
export function isNotBlank(str: string): boolean {
    return str.trim().length > 0
}

// ==================== 字符串转�?====================

/**
 * 重复字符�? */
export function repeat(str: string, count: number): string {
    return str.repeat(Math.max(0, count))
}

/**
 * 反转字符�? */
export function reverse(str: string): string {
    return str.split('').reverse().join('')
}

/**
 * 分割字符串为单词数组
 */
export function words(str: string): string[] {
    return str.match(/[A-Z]?[a-z]+|[A-Z]+(?=[A-Z][a-z]|\d|\W|$)|\d+/g) || []
}

/**
 * 计算字符串中某个子串出现的次�? */
export function countOccurrences(str: string, search: string): number {
    if (search.length === 0) return 0
    let count = 0
    let pos = 0
    while ((pos = str.indexOf(search, pos)) !== -1) {
        count++
        pos += search.length
    }
    return count
}

// ==================== 模板处理 ====================

/**
 * 模板字符串替�? */
export function template(
    str: string,
    data: Record<string, unknown>,
    pattern: RegExp = /\{\{(\w+)\}\}/g
): string {
    return str.replace(pattern, (_, key) => String(data[key] ?? ''))
}

/**
 * 格式化字符串（类�?printf�? */
export function format(str: string, ...args: unknown[]): string {
    let index = 0
    return str.replace(/%[sdj%]/g, (match) => {
        if (match === '%%') return '%'
        if (index >= args.length) return match
        const arg = args[index++]
        switch (match) {
            case '%s':
                return String(arg)
            case '%d':
                return String(Number(arg))
            case '%j':
                return JSON.stringify(arg)
            default:
                return match
        }
    })
}

// ==================== 转义处理 ====================

/**
 * 转义正则表达式特殊字�? */
export function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 转义 HTML 特殊字符
 */
export function escapeHtml(str: string): string {
    const htmlEscapes: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }
    return str.replace(/[&<>"']/g, (char) => htmlEscapes[char])
}

/**
 * 反转�?HTML 特殊字符
 */
export function unescapeHtml(str: string): string {
    const htmlUnescapes: Record<string, string> = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'"
    }
    return str.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => htmlUnescapes[entity])
}

// ==================== 编码处理 ====================

/**
 * Base64 编码
 */
export function base64Encode(str: string): string {
    return Buffer.from(str, 'utf8').toString('base64')
}

/**
 * Base64 解码
 */
export function base64Decode(str: string): string {
    return Buffer.from(str, 'base64').toString('utf8')
}

/**
 * URL 安全�?Base64 编码
 */
export function base64UrlEncode(str: string): string {
    return base64Encode(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * URL 安全�?Base64 解码
 */
export function base64UrlDecode(str: string): string {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
    const padding = base64.length % 4
    if (padding) {
        base64 += '='.repeat(4 - padding)
    }
    return base64Decode(base64)
}

// ==================== 随机字符�?====================

/**
 * 生成随机字符�? */
export function randomString(
    length: number = 8,
    chars: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
): string {
    let result = ''
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
}

/**
 * 生成随机十六进制字符�? */
export function randomHex(length: number = 8): string {
    return randomString(length, '0123456789abcdef')
}

/**
 * 生成 UUID v4
 */
export function uuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
    })
}

/**
 * 生成�?ID
 */
export function shortId(length: number = 8): string {
    return randomString(length, '0123456789abcdefghijklmnopqrstuvwxyz')
}
