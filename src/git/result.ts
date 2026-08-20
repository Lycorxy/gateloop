/**
 * Git 操作结果构造辅助
 *
 * 集中定义 successResult / errorResult，供 operations / config 等模块复用，
 * 避免在各处重复实现。
 */

import type { GitOperation, GitResult } from './types'

/**
 * 创建成功结果
 */
export function successResult(
    operation: GitOperation,
    message: string,
    data?: unknown,
    snapshotId?: string,
    duration: number = 0
): GitResult {
    return {
        success: true,
        operation,
        message,
        snapshotId,
        data,
        duration,
        summary:
            typeof data === 'object' && data !== null
                ? (data as Record<string, unknown>)
                : undefined
    }
}

/**
 * 创建失败结果
 */
export function errorResult(
    operation: GitOperation,
    message: string,
    error?: string,
    duration: number = 0
): GitResult {
    return {
        success: false,
        operation,
        message,
        error,
        duration
    }
}
