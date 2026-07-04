/**
 * 通用类型定义
 *
 * 提供项目级别的公共类型
 */

/** 通用 Result 类型（用于 Result 包装模式） */
export interface Result<T = void> {
    success: boolean
    data?: T
    error?: string
}
