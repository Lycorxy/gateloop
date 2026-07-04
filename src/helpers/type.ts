/**
 * 类型判断辅助函数
 *
 * 封装常用的类型检测功�? */

// ==================== 基础类型判断 ====================

/**
 * 检查是否为字符�? */
export function isString(value: unknown): value is string {
    return typeof value === 'string'
}

/**
 * 检查是否为数字
 */
export function isNumber(value: unknown): value is number {
    return typeof value === 'number' && !isNaN(value)
}

/**
 * 检查是否为布尔�? */
export function isBoolean(value: unknown): value is boolean {
    return typeof value === 'boolean'
}

/**
 * 检查是否为函数
 */
export function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
    return typeof value === 'function'
}

/**
 * 检查是否为 Symbol
 */
export function isSymbol(value: unknown): value is symbol {
    return typeof value === 'symbol'
}

/**
 * 检查是否为 BigInt
 */
export function isBigInt(value: unknown): value is bigint {
    return typeof value === 'bigint'
}

// ==================== 空值判�?====================

/**
 * 检查是否为 null
 */
export function isNull(value: unknown): value is null {
    return value === null
}

/**
 * 检查是否为 undefined
 */
export function isUndefined(value: unknown): value is undefined {
    return value === undefined
}

/**
 * 检查是否为 null �?undefined
 */
export function isNullish(value: unknown): value is null | undefined {
    return value === null || value === undefined
}

/**
 * 检查是否为空值（null、undefined、空字符串、空数组、空对象�? */
export function isEmpty(value: unknown): boolean {
    if (isNullish(value)) return true
    if (isString(value)) return value.length === 0
    if (isArray(value)) return value.length === 0
    if (isPlainObject(value)) return Object.keys(value).length === 0
    if (value instanceof Map || value instanceof Set) return value.size === 0
    return false
}

// ==================== 对象类型判断 ====================

/**
 * 检查是否为对象（非 null�? */
export function isObject(value: unknown): value is object {
    return typeof value === 'object' && value !== null
}

/**
 * 检查是否为普通对�? */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!isObject(value)) return false
    const proto = Object.getPrototypeOf(value)
    return proto === null || proto === Object.prototype
}

/**
 * 检查是否为数组
 */
export function isArray(value: unknown): value is unknown[] {
    return Array.isArray(value)
}

/**
 * 检查是否为类型化数�? */
export function isTypedArray(value: unknown): value is ArrayBufferView {
    return ArrayBuffer.isView(value) && !(value instanceof DataView)
}

/**
 * 检查是否为 Date 对象
 */
export function isDate(value: unknown): value is Date {
    return value instanceof Date && !isNaN(value.getTime())
}

/**
 * 检查是否为正则表达�? */
export function isRegExp(value: unknown): value is RegExp {
    return value instanceof RegExp
}

/**
 * 检查是否为 Error 对象
 */
export function isError(value: unknown): value is Error {
    return value instanceof Error
}

/**
 * 检查是否为 Map
 */
export function isMap(value: unknown): value is Map<unknown, unknown> {
    return value instanceof Map
}

/**
 * 检查是否为 Set
 */
export function isSet(value: unknown): value is Set<unknown> {
    return value instanceof Set
}

/**
 * 检查是否为 WeakMap
 */
export function isWeakMap(value: unknown): value is WeakMap<object, unknown> {
    return value instanceof WeakMap
}

/**
 * 检查是否为 WeakSet
 */
export function isWeakSet(value: unknown): value is WeakSet<object> {
    return value instanceof WeakSet
}

// ==================== Promise 和异步判�?====================

/**
 * 检查是否为 Promise
 */
export function isPromise(value: unknown): value is Promise<unknown> {
    return value instanceof Promise
}

/**
 * 检查是否为 Promise-like（thenable�? */
export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    return isObject(value) && isFunction((value as Record<string, unknown>).then)
}

/**
 * 检查是否为异步函数
 */
export function isAsyncFunction(value: unknown): value is (...args: unknown[]) => Promise<unknown> {
    return isFunction(value) && value.constructor.name === 'AsyncFunction'
}

/**
 * 检查是否为生成器函�? */
export function isGeneratorFunction(value: unknown): value is GeneratorFunction {
    return isFunction(value) && value.constructor.name === 'GeneratorFunction'
}

// ==================== 数字类型判断 ====================

/**
 * 检查是否为整数
 */
export function isInteger(value: unknown): value is number {
    return Number.isInteger(value)
}

/**
 * 检查是否为安全整数
 */
export function isSafeInteger(value: unknown): value is number {
    return Number.isSafeInteger(value)
}

/**
 * 检查是否为有限�? */
export function isFinite(value: unknown): value is number {
    return Number.isFinite(value)
}

/**
 * 检查是否为 NaN
 */
export function isNaN(value: unknown): value is number {
    return Number.isNaN(value)
}

/**
 * 检查是否为正数
 */
export function isPositive(value: unknown): value is number {
    return isNumber(value) && value > 0
}

/**
 * 检查是否为负数
 */
export function isNegative(value: unknown): value is number {
    return isNumber(value) && value < 0
}

// ==================== 字符串类型判�?====================

/**
 * 检查是否为数字字符�? */
export function isNumericString(value: unknown): value is string {
    return isString(value) && !isNaN(Number(value)) && value.trim() !== ''
}

/**
 * 检查是否为 JSON 字符�? */
export function isJsonString(value: unknown): value is string {
    if (!isString(value)) return false
    try {
        JSON.parse(value)
        return true
    } catch {
        return false
    }
}

/**
 * 检查是否为有效�?URL
 */
export function isUrl(value: unknown): value is string {
    if (!isString(value)) return false
    try {
        new URL(value)
        return true
    } catch {
        return false
    }
}

/**
 * 检查是否为有效的邮�? */
export function isEmail(value: unknown): value is string {
    if (!isString(value)) return false
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(value)
}

/**
 * 检查是否为有效�?UUID
 */
export function isUuid(value: unknown): value is string {
    if (!isString(value)) return false
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    return uuidRegex.test(value)
}

// ==================== Node.js 特定类型判断 ====================

/**
 * 检查是否为 Buffer
 */
export function isBuffer(value: unknown): value is Buffer {
    return Buffer.isBuffer(value)
}

/**
 * 检查是否为 ArrayBuffer
 */
export function isArrayBuffer(value: unknown): value is ArrayBuffer {
    return value instanceof ArrayBuffer
}

/**
 * 检查是否为 SharedArrayBuffer
 */
export function isSharedArrayBuffer(value: unknown): value is SharedArrayBuffer {
    return typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer
}

// ==================== 类型获取 ====================

/**
 * 获取值的类型名称
 */
export function getType(value: unknown): string {
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'

    const type = typeof value
    if (type !== 'object') return type

    // 获取更具体的类型
    const tag = Object.prototype.toString.call(value).slice(8, -1)
    return tag.toLowerCase()
}

/**
 * 获取构造函数名�? */
export function getConstructorName(value: unknown): string | null {
    if (isNullish(value)) return null
    return (value as object).constructor?.name ?? null
}

// ==================== 类型断言辅助 ====================

/**
 * 断言值不�?null �?undefined
 */
export function assertDefined<T>(value: T, message?: string): asserts value is NonNullable<T> {
    if (isNullish(value)) {
        throw new Error(message ?? 'Value is null or undefined')
    }
}

/**
 * 断言值为特定类型
 */
export function assertType<T>(
    value: unknown,
    checker: (v: unknown) => v is T,
    message?: string
): asserts value is T {
    if (!checker(value)) {
        throw new TypeError(message ?? `Type assertion failed`)
    }
}
