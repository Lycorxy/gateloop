/**
 * 异步处理辅助函数
 *
 * 封装常用的异步操作工�? */

// ==================== 延迟与定�?====================

/**
 * 延迟执行
 */
export function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 延迟执行并返回�? */
export function delayValue<T>(ms: number, value: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

/**
 * 创建可取消的延迟
 */
export function cancellableDelay(ms: number): { promise: Promise<void>; cancel: () => void } {
    let timeoutId: NodeJS.Timeout
    let rejectFn: (reason: Error) => void

    const promise = new Promise<void>((resolve, reject) => {
        rejectFn = reject
        timeoutId = setTimeout(resolve, ms)
    })

    return {
        promise,
        cancel: () => {
            clearTimeout(timeoutId)
            rejectFn(new Error('Cancelled'))
        }
    }
}

// ==================== 超时控制 ====================

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

/**
 * 超时包装（返回默认值而非抛错�? */
export async function withTimeoutDefault<T>(
    promise: Promise<T>,
    ms: number,
    defaultValue: T
): Promise<T> {
    try {
        return await withTimeout(promise, ms)
    } catch {
        return defaultValue
    }
}

// ==================== 重试机制 ====================

export interface RetryOptions {
    /** 重试次数 */
    times?: number
    /** 重试间隔（毫秒） */
    delay?: number
    /** 指数退�?*/
    exponential?: boolean
    /** 最大延�?*/
    maxDelay?: number
    /** 重试条件 */
    retryIf?: (error: Error) => boolean
    /** 重试回调 */
    onRetry?: (error: Error, attempt: number) => void
}

/**
 * 重试执行
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
    const {
        times = 3,
        delay: delayMs = 1000,
        exponential = false,
        maxDelay = 30000,
        retryIf = () => true,
        onRetry
    } = options

    let lastError: Error | undefined

    for (let attempt = 1; attempt <= times; attempt++) {
        try {
            return await fn()
        } catch (error) {
            lastError = error as Error

            if (attempt === times || !retryIf(lastError)) {
                throw lastError
            }

            onRetry?.(lastError, attempt)

            const waitTime = exponential
                ? Math.min(delayMs * Math.pow(2, attempt - 1), maxDelay)
                : delayMs

            await delay(waitTime)
        }
    }

    throw lastError
}

// ==================== 并发控制 ====================

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
 * 创建并发限制�? */
export function createConcurrencyLimiter(concurrency: number) {
    let running = 0
    const queue: Array<() => void> = []

    const runNext = () => {
        if (queue.length > 0 && running < concurrency) {
            running++
            const next = queue.shift()!
            next()
        }
    }

    return async <T>(fn: () => Promise<T>): Promise<T> => {
        return new Promise((resolve, reject) => {
            const run = async () => {
                try {
                    const result = await fn()
                    resolve(result)
                } catch (error) {
                    reject(error)
                } finally {
                    running--
                    runNext()
                }
            }

            queue.push(run)
            runNext()
        })
    }
}

// ==================== Promise 工具 ====================

/**
 * 等待所�?Promise 完成（包括失败的�? */
export async function settleAll<T>(
    promises: Promise<T>[]
): Promise<Array<{ status: 'fulfilled'; value: T } | { status: 'rejected'; reason: unknown }>> {
    return Promise.allSettled(promises)
}

/**
 * 过滤成功的结�? */
export async function filterFulfilled<T>(promises: Promise<T>[]): Promise<T[]> {
    const results = await settleAll(promises)
    return results
        .filter((r): r is { status: 'fulfilled'; value: T } => r.status === 'fulfilled')
        .map((r) => r.value)
}

/**
 * 创建可解析的 Promise
 */
export function createDeferred<T>(): {
    promise: Promise<T>
    resolve: (value: T) => void
    reject: (reason?: unknown) => void
} {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void

    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })

    return { promise, resolve, reject }
}

// ==================== 队列处理 ====================

/**
 * 串行执行任务队列
 */
export async function serial<T>(tasks: (() => Promise<T>)[]): Promise<T[]> {
    const results: T[] = []
    for (const task of tasks) {
        results.push(await task())
    }
    return results
}

/**
 * 管道执行（前一个结果作为后一个输入）
 */
export async function pipe<T>(initial: T, ...fns: Array<(value: T) => Promise<T> | T>): Promise<T> {
    let result = initial
    for (const fn of fns) {
        result = await fn(result)
    }
    return result
}

// ==================== 防抖与节�?====================

/**
 * 防抖函数
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
    fn: T,
    ms: number
): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout | undefined

    return (...args: Parameters<T>) => {
        if (timeoutId) clearTimeout(timeoutId)
        timeoutId = setTimeout(() => fn(...args), ms)
    }
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
    fn: T,
    ms: number
): (...args: Parameters<T>) => void {
    let lastCall = 0

    return (...args: Parameters<T>) => {
        const now = Date.now()
        if (now - lastCall >= ms) {
            lastCall = now
            fn(...args)
        }
    }
}

/**
 * 异步防抖
 */
export function debounceAsync<T extends (...args: unknown[]) => Promise<unknown>>(
    fn: T,
    ms: number
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
    let timeoutId: NodeJS.Timeout | undefined
    let pendingPromise: Promise<ReturnType<T>> | undefined

    return (...args: Parameters<T>): Promise<ReturnType<T>> => {
        if (timeoutId) clearTimeout(timeoutId)

        return new Promise((resolve, reject) => {
            timeoutId = setTimeout(async () => {
                try {
                    pendingPromise = fn(...args) as Promise<ReturnType<T>>
                    const result = await pendingPromise
                    resolve(result)
                } catch (error) {
                    reject(error)
                }
            }, ms)
        })
    }
}

// ==================== 锁机�?====================

/**
 * 创建互斥�? */
export function createMutex() {
    let locked = false
    const queue: Array<() => void> = []

    return {
        async acquire(): Promise<void> {
            if (!locked) {
                locked = true
                return
            }

            return new Promise((resolve) => {
                queue.push(resolve)
            })
        },

        release(): void {
            if (queue.length > 0) {
                const next = queue.shift()!
                next()
            } else {
                locked = false
            }
        },

        async withLock<T>(fn: () => Promise<T>): Promise<T> {
            await this.acquire()
            try {
                return await fn()
            } finally {
                this.release()
            }
        }
    }
}
