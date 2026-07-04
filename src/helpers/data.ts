/**
 * 数据处理辅助函数
 *
 * 封装常用的数据转换、验证、处理功能
 */

// ==================== 深拷贝与合并 ====================

/**
 * 深拷贝对象
 */
export function deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
        return obj
    }

    if (Array.isArray(obj)) {
        return obj.map((item) => deepClone(item)) as T
    }

    if (obj instanceof Date) {
        return new Date(obj.getTime()) as T
    }

    if (obj instanceof RegExp) {
        return new RegExp(obj.source, obj.flags) as T
    }

    const cloned = {} as T
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            cloned[key] = deepClone(obj[key])
        }
    }
    return cloned
}

/**
 * 深度合并对象
 */
export function deepMerge<T extends Record<string, unknown>>(
    target: T,
    ...sources: Partial<T>[]
): T {
    const result = deepClone(target)

    for (const source of sources) {
        if (!source) continue

        for (const key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
                const targetValue = result[key as keyof T]
                const sourceValue = source[key]

                if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
                    result[key as keyof T] = deepMerge(
                        targetValue as Record<string, unknown>,
                        sourceValue as Record<string, unknown>
                    ) as T[keyof T]
                } else {
                    result[key as keyof T] = deepClone(sourceValue) as T[keyof T]
                }
            }
        }
    }

    return result
}

// ==================== 对象操作 ====================

/**
 * 检查是否为普通对象
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Object.prototype.toString.call(value) === '[object Object]'
}

/**
 * 获取嵌套对象的值
 */
export function getNestedValue<T = unknown>(
    obj: Record<string, unknown>,
    path: string,
    defaultValue?: T
): T | undefined {
    const keys = path.split('.')
    let current: unknown = obj

    for (const key of keys) {
        if (current === null || current === undefined) {
            return defaultValue
        }
        current = (current as Record<string, unknown>)[key]
    }

    return (current as T) ?? defaultValue
}

/**
 * 设置嵌套对象的值
 */
export function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split('.')
    let current = obj

    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i]
        if (!(key in current) || !isPlainObject(current[key])) {
            current[key] = {}
        }
        current = current[key] as Record<string, unknown>
    }

    current[keys[keys.length - 1]] = value
}

/**
 * 删除嵌套对象的值
 */
export function deleteNestedValue(obj: Record<string, unknown>, path: string): boolean {
    const keys = path.split('.')
    let current = obj

    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i]
        if (!(key in current) || !isPlainObject(current[key])) {
            return false
        }
        current = current[key] as Record<string, unknown>
    }

    const lastKey = keys[keys.length - 1]
    if (lastKey in current) {
        delete current[lastKey]
        return true
    }
    return false
}

/**
 * 扁平化对象
 */
export function flattenObject(
    obj: Record<string, unknown>,
    prefix: string = '',
    separator: string = '.'
): Record<string, unknown> {
    const result: Record<string, unknown> = {}

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const newKey = prefix ? `${prefix}${separator}${key}` : key
            const value = obj[key]

            if (isPlainObject(value)) {
                Object.assign(
                    result,
                    flattenObject(value as Record<string, unknown>, newKey, separator)
                )
            } else {
                result[newKey] = value
            }
        }
    }

    return result
}

/**
 * 还原扁平化对象
 */
export function unflattenObject(
    obj: Record<string, unknown>,
    separator: string = '.'
): Record<string, unknown> {
    const result: Record<string, unknown> = {}

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            setNestedValue(result, key.split(separator).join('.'), obj[key])
        }
    }

    return result
}

// ==================== 数组操作 ====================

/**
 * 数组去重
 */
export function unique<T>(arr: T[], key?: keyof T): T[] {
    if (!key) {
        return [...new Set(arr)]
    }
    const seen = new Set()
    return arr.filter((item) => {
        const value = item[key]
        if (seen.has(value)) return false
        seen.add(value)
        return true
    })
}

/**
 * 数组分组
 */
export function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
    return arr.reduce(
        (result, item) => {
            const groupKey = String(item[key])
            if (!result[groupKey]) {
                result[groupKey] = []
            }
            result[groupKey].push(item)
            return result
        },
        {} as Record<string, T[]>
    )
}

/**
 * 数组分块
 */
export function chunk<T>(arr: T[], size: number): T[][] {
    const result: T[][] = []
    for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size))
    }
    return result
}

/**
 * 数组打乱
 */
export function shuffle<T>(arr: T[]): T[] {
    const result = [...arr]
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
}

// ==================== 数字操作 ====================

/**
 * 限制数字范围
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max)
}

/**
 * 生成随机数
 */
export function random(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

// ==================== 异步操作 ====================

/**
 * 延迟执行
 */
export function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 重试执行
 */
export async function retry<T>(
    fn: () => Promise<T>,
    options: { times?: number; delay?: number } = {}
): Promise<T> {
    const { times = 3, delay: delayMs = 1000 } = options
    let lastError: Error | undefined

    for (let i = 0; i < times; i++) {
        try {
            return await fn()
        } catch (error) {
            lastError = error as Error
            if (i < times - 1) {
                await delay(delayMs)
            }
        }
    }

    throw lastError
}

/**
 * 限制并发执行
 */
export async function limitConcurrency<T>(
    tasks: (() => Promise<T>)[],
    concurrency: number = 10
): Promise<T[]> {
    const results: T[] = []
    const executing: Promise<void>[] = []

    for (const task of tasks) {
        const promise = task().then((result) => {
            results.push(result)
        })

        executing.push(promise)

        if (executing.length >= concurrency) {
            await Promise.race(executing)
            executing.splice(
                executing.findIndex((p) => p === promise),
                1
            )
        }
    }

    await Promise.all(executing)
    return results
}

/**
 * 超时包装
 */
export function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    message: string = 'Operation timed out'
): Promise<T> {
    return Promise.race([
        promise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms))
    ])
}
