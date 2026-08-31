/**
 * GateLoop 任务决策记忆 store
 *
 * ── 作用边界（讲死，避免与经验记忆系统混淆）──────────────────────
 * 本模块管的是「任务决策记忆」：跨任务/跨轮沉淀下来的决策事实。
 *   典型内容：本次需求分析的结论、架构选型、项目约定、上次部署的关键参数。
 *   存取方式：精确 key 读取 + 硬门禁回写（writesMemory 未写则不许推进）。
 *
 * 本模块【不管】的是「经验记忆」：解决过的问题、踩过的坑、通用方案。
 *   那是经验记忆系统（如 semax-store）的职责——走语义搜索召回 topK 相关经验，
 *   带状态机（verified/superseded/disproven）和版本链。
 *   两者数据模型与检索模型都不同，刻意不合并：
 *     - 决策记忆 = 确定性事实源，精确 key 命中，"确定的交给脚本"
 *     - 经验记忆 = 概率性召回，语义相似度排序，"理解的交给模型"
 *
 * ── 独立性 ──────────────────────────────────────────────────────
 * 本地 JSON 文件为唯一确定性事实源，是硬依赖（永远可用）。
 * MemoryHooks 是可选增强：上层可注入任意读写实现接外部存储，
 * 但本模块不绑定任何特定服务（不依赖 semax-store 或其它 MCP）；
 * 未注入时降级到本地文件，skill 照样独立可用。
 *
 * ── 写入原则 ────────────────────────────────────────────────────
 * 只有本模块函数能写 store，与 state.ts 的"唯一写入者"原则对齐。
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { MemoryConfig } from './types'

const DEFAULT_MEMORY_STORE = join('.specflow', 'memory', 'store.json')

/**
 * 记忆读写钩子（由 CLI/上层注入，接真实 MCP）
 *
 * 引擎侧只认这个契约：给 key 返回值 / 把 key-value 写回。
 * 具体走 MCP 记忆服务还是别的，由注入方决定；引擎不关心。
 */
export interface MemoryHooks {
    /** 读一个 key（返回 undefined 表示 MCP 无此记忆，引擎将降级到本地 store） */
    read?: (key: string) => Promise<unknown> | unknown
    /** 写一个 key（引擎在本地 store 落盘的同时调用，双写保证一致） */
    write?: (key: string, value: unknown) => Promise<void> | void
}

/** store 文件结构：扁平 key → value */
interface MemoryStore {
    entries: Record<string, MemoryEntry>
}

interface MemoryEntry {
    key: string
    value: unknown
    updatedAt: string
}

/** 解析 store 文件绝对路径 */
function resolveStorePath(cwd: string, config?: MemoryConfig): string {
    return join(cwd, config?.localStore || DEFAULT_MEMORY_STORE)
}

/** 读取本地 store（不存在返回空） */
function readStore(cwd: string, config?: MemoryConfig): MemoryStore {
    const path = resolveStorePath(cwd, config)
    if (!existsSync(path)) return { entries: {} }
    try {
        const parsed = JSON.parse(readFileSync(path, 'utf-8')) as MemoryStore
        return parsed.entries ? parsed : { entries: {} }
    } catch {
        return { entries: {} }
    }
}

/** 写入本地 store（唯一写入点） */
function writeStore(cwd: string, store: MemoryStore, config?: MemoryConfig): void {
    const path = resolveStorePath(cwd, config)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(store, null, 2), 'utf-8')
}

/**
 * 读一批记忆 key（readsMemory → memoryInline）
 *
 * 优先走 MCP（hooks.read）；MCP 无值或未注入时降级到本地 store。
 * 返回 key → 序列化内容，供 buildInstruction 内联进指令。
 */
export async function readMemory(
    keys: string[],
    cwd: string,
    config?: MemoryConfig,
    hooks?: MemoryHooks
): Promise<Array<{ key: string; content: string }>> {
    if (!keys || keys.length === 0) return []
    const store = readStore(cwd, config)
    const result: Array<{ key: string; content: string }> = []

    for (const key of keys) {
        let value: unknown

        // 优先 MCP
        if (config?.mcp && hooks?.read) {
            try {
                value = await hooks.read(key)
            } catch {
                value = undefined
            }
        }
        // 降级本地 store
        if (value === undefined) {
            value = store.entries[key]?.value
        }

        result.push({
            key,
            content: value === undefined ? `（暂无记忆: ${key}）` : safeStringify(value)
        })
    }
    return result
}

/**
 * 写一个记忆 key（供上层在 anchor 完成时回写）
 *
 * 双写：本地 store 落盘（确定性事实源）+ MCP（若注入）。
 * 本地落盘是硬事实，writesMemory 校验以本地 store 为准。
 */
export async function writeMemory(
    key: string,
    value: unknown,
    cwd: string,
    config?: MemoryConfig,
    hooks?: MemoryHooks
): Promise<void> {
    const store = readStore(cwd, config)
    store.entries[key] = { key, value, updatedAt: new Date().toISOString() }
    writeStore(cwd, store, config)

    if (config?.mcp && hooks?.write) {
        try {
            await hooks.write(key, value)
        } catch {
            // MCP 写失败不阻断：本地 store 已是事实源
        }
    }
}

/**
 * 校验一批记忆 key 是否已写入本地 store（writesMemory 门禁）
 *
 * @returns 缺失的 key 列表（空数组 = 全部已写）
 */
export function checkMemoryWritten(keys: string[], cwd: string, config?: MemoryConfig): string[] {
    if (!keys || keys.length === 0) return []
    const store = readStore(cwd, config)
    return keys.filter((k) => store.entries[k] === undefined)
}

/** 安全序列化 */
function safeStringify(value: unknown): string {
    try {
        return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    } catch {
        return String(value)
    }
}
