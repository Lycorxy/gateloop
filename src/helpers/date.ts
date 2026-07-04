/**
 * 日期处理辅助函数
 *
 * 封装常用的日期格式化、计算功能
 */

// ==================== 格式化 ====================

/**
 * 格式化日期
 */
export function formatDate(
    date: Date | number | string,
    format: string = 'YYYY-MM-DD HH:mm:ss'
): string {
    const d = toDate(date)

    const tokens: Record<string, string> = {
        YYYY: String(d.getFullYear()),
        YY: String(d.getFullYear()).slice(-2),
        MM: padZero(d.getMonth() + 1),
        M: String(d.getMonth() + 1),
        DD: padZero(d.getDate()),
        D: String(d.getDate()),
        HH: padZero(d.getHours()),
        H: String(d.getHours()),
        hh: padZero(d.getHours() % 12 || 12),
        h: String(d.getHours() % 12 || 12),
        mm: padZero(d.getMinutes()),
        m: String(d.getMinutes()),
        ss: padZero(d.getSeconds()),
        s: String(d.getSeconds()),
        SSS: padZero(d.getMilliseconds(), 3),
        A: d.getHours() < 12 ? 'AM' : 'PM',
        a: d.getHours() < 12 ? 'am' : 'pm'
    }

    return format.replace(
        /YYYY|YY|MM|M|DD|D|HH|H|hh|h|mm|m|ss|s|SSS|A|a/g,
        (match) => tokens[match]
    )
}

/**
 * 格式化为 ISO 字符串
 */
export function toISOString(date: Date | number | string): string {
    return toDate(date).toISOString()
}

/**
 * 格式化为相对时间
 */
export function formatRelative(date: Date | number | string): string {
    const d = toDate(date)
    const now = Date.now()
    const diff = now - d.getTime()

    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    const months = Math.floor(days / 30)
    const years = Math.floor(days / 365)

    if (seconds < 60) return '刚刚'
    if (minutes < 60) return `${minutes} 分钟前`
    if (hours < 24) return `${hours} 小时前`
    if (days < 30) return `${days} 天前`
    if (months < 12) return `${months} 个月前`
    return `${years} 年前`
}

/**
 * 格式化持续时间
 */
export function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`

    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    const parts: string[] = []
    if (days > 0) parts.push(`${days}d`)
    if (hours % 24 > 0) parts.push(`${hours % 24}h`)
    if (minutes % 60 > 0) parts.push(`${minutes % 60}m`)
    if (seconds % 60 > 0) parts.push(`${seconds % 60}s`)

    return parts.join(' ') || '0s'
}

// ==================== 解析 ====================

/**
 * 转换为 Date 对象
 */
export function toDate(date: Date | number | string): Date {
    if (date instanceof Date) return date
    if (typeof date === 'number') return new Date(date)
    return new Date(date)
}

/**
 * 解析日期字符串
 */
export function parseDate(str: string, format: string = 'YYYY-MM-DD'): Date | null {
    const formatParts = format.match(/YYYY|MM|DD|HH|mm|ss/g) || []
    const regex = format.replace(/YYYY/g, '(\\d{4})').replace(/MM|DD|HH|mm|ss/g, '(\\d{2})')

    const match = str.match(new RegExp(`^${regex}$`))
    if (!match) return null

    const parts: Record<string, number> = {
        YYYY: 1970,
        MM: 1,
        DD: 1,
        HH: 0,
        mm: 0,
        ss: 0
    }

    formatParts.forEach((part, index) => {
        parts[part] = parseInt(match[index + 1], 10)
    })

    return new Date(parts.YYYY, parts.MM - 1, parts.DD, parts.HH, parts.mm, parts.ss)
}

// ==================== 计算 ====================

/**
 * 添加时间
 */
export function addTime(
    date: Date | number | string,
    amount: number,
    unit: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second' | 'millisecond'
): Date {
    const d = new Date(toDate(date))

    switch (unit) {
        case 'year':
            d.setFullYear(d.getFullYear() + amount)
            break
        case 'month':
            d.setMonth(d.getMonth() + amount)
            break
        case 'day':
            d.setDate(d.getDate() + amount)
            break
        case 'hour':
            d.setHours(d.getHours() + amount)
            break
        case 'minute':
            d.setMinutes(d.getMinutes() + amount)
            break
        case 'second':
            d.setSeconds(d.getSeconds() + amount)
            break
        case 'millisecond':
            d.setMilliseconds(d.getMilliseconds() + amount)
            break
    }

    return d
}

/**
 * 计算时间差
 */
export function diffTime(
    date1: Date | number | string,
    date2: Date | number | string,
    unit: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second' | 'millisecond' = 'millisecond'
): number {
    const d1 = toDate(date1)
    const d2 = toDate(date2)
    const diff = d1.getTime() - d2.getTime()

    switch (unit) {
        case 'year':
            return Math.floor(diff / (365 * 24 * 60 * 60 * 1000))
        case 'month':
            return Math.floor(diff / (30 * 24 * 60 * 60 * 1000))
        case 'day':
            return Math.floor(diff / (24 * 60 * 60 * 1000))
        case 'hour':
            return Math.floor(diff / (60 * 60 * 1000))
        case 'minute':
            return Math.floor(diff / (60 * 1000))
        case 'second':
            return Math.floor(diff / 1000)
        case 'millisecond':
        default:
            return diff
    }
}

// ==================== 判断 ====================

/**
 * 是否为有效日期
 */
export function isValidDate(date: unknown): date is Date {
    return date instanceof Date && !isNaN(date.getTime())
}

/**
 * 是否为同一天
 */
export function isSameDay(date1: Date | number | string, date2: Date | number | string): boolean {
    const d1 = toDate(date1)
    const d2 = toDate(date2)
    return (
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate()
    )
}

/**
 * 是否为今天
 */
export function isToday(date: Date | number | string): boolean {
    return isSameDay(date, new Date())
}

/**
 * 是否为闰年
 */
export function isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

// ==================== 获取 ====================

/**
 * 获取某月的天数
 */
export function getDaysInMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate()
}

/**
 * 获取某天是星期几
 */
export function getDayOfWeek(date: Date | number | string): number {
    return toDate(date).getDay()
}

/**
 * 获取某天是一年中的第几天
 */
export function getDayOfYear(date: Date | number | string): number {
    const d = toDate(date)
    const start = new Date(d.getFullYear(), 0, 0)
    const diff = d.getTime() - start.getTime()
    return Math.floor(diff / (24 * 60 * 60 * 1000))
}

/**
 * 获取某天所在周的开始日期
 */
export function getWeekStart(date: Date | number | string, weekStartsOn: number = 0): Date {
    const d = toDate(date)
    const day = d.getDay()
    const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn
    d.setDate(d.getDate() - diff)
    d.setHours(0, 0, 0, 0)
    return d
}

/**
 * 获取某天所在月的开始日期
 */
export function getMonthStart(date: Date | number | string): Date {
    const d = toDate(date)
    return new Date(d.getFullYear(), d.getMonth(), 1)
}

/**
 * 获取某天所在年的开始日期
 */
export function getYearStart(date: Date | number | string): Date {
    const d = toDate(date)
    return new Date(d.getFullYear(), 0, 1)
}

// ==================== 工具函数 ====================

/**
 * 数字补零
 */
function padZero(num: number, length: number = 2): string {
    return String(num).padStart(length, '0')
}

/**
 * 获取当前时间戳
 */
export function now(): number {
    return Date.now()
}

/**
 * 获取当前日期字符串
 */
export function today(format: string = 'YYYY-MM-DD'): string {
    return formatDate(new Date(), format)
}
