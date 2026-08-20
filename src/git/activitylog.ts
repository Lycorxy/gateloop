/**
 * 操作行为日志（Activity Log）
 *
 * 记录每一次「关键 Git 操作」以及它执行前自动创建的快照 ID，
 * 让用户可以按「一次具体行为」而不是抽象的快照序号来回滚。
 *
 * 与 SnapshotManager 的关系：
 * - SnapshotManager 负责「打快照 / 恢复工作区」
 * - ActivityLog 负责「记录发生了什么、回退锚点（快照 ID）在哪」
 * 两者都存放在 .git/nut-snapshots/ 目录下。
 *
 * 典型用法：
 *   nut git activity                查看行为历史
 *   nut git undo                   撤销上一步（回退到上一步操作前的快照）
 *   nut git rollback --action 12   回退到第 12 步操作前的状态
 */

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

export type ActionResult = 'success' | 'failed'

/** 一次操作的记录 */
export interface ActionRecord {
    /** 稳定唯一 ID（回退锚点之一） */
    id: string
    /** 人类友好的递增序号（回退锚点之一） */
    seq: number
    /** ISO 时间戳 */
    timestamp: string
    /** 操作类型：commit / rebase / mergeToTest / createMR ... */
    action: string
    /** 人类可读描述，如「合并 feature/v1.2.3 → test」 */
    description: string
    /** 操作时的分支（可能为 undefined，如仓库未就绪） */
    branch?: string
    /** 操作前自动创建的快照 ID（回退锚点）；纯远程操作可能为 undefined */
    snapshotId?: string
    /** 操作结果 */
    result: ActionResult
    /** 失败原因 */
    error?: string
    /** 附加信息（如 MR 链接、源/目标分支） */
    meta?: Record<string, unknown>
}

interface ActivityLogStore {
    version: string
    createdAt: string
    records: ActionRecord[]
}

const MAX_RECORDS = 200

/**
 * 操作行为日志管理器
 */
export class ActivityLog {
    private filePath: string
    private dir: string
    private store: ActivityLogStore

    constructor(dir: string) {
        this.dir = dir
        this.filePath = join(dir, 'activity-log.json')
        this.store = this.createEmpty()
    }

    private createEmpty(): ActivityLogStore {
        return {
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            records: []
        }
    }

    /** 初始化目录与读取已有日志 */
    init(): void {
        mkdirSync(this.dir, { recursive: true })

        if (existsSync(this.filePath)) {
            try {
                const parsed = JSON.parse(readFileSync(this.filePath, 'utf-8')) as ActivityLogStore
                if (parsed && Array.isArray(parsed.records)) {
                    this.store = parsed
                    return
                }
            } catch {
                // 文件损坏则重建
            }
        }
        this.store = this.createEmpty()
    }

    /** 原子持久化 */
    private save(): void {
        const tmp = `${this.filePath}.tmp`
        writeFileSync(tmp, JSON.stringify(this.store, null, 2), 'utf-8')
        try {
            renameSync(tmp, this.filePath)
        } catch {
            writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), 'utf-8')
            try {
                unlinkSync(tmp)
            } catch {
                // 忽略清理失败
            }
        }
    }

    /**
     * 记录一次操作
     */
    record(entry: Omit<ActionRecord, 'id' | 'seq' | 'timestamp'>): ActionRecord {
        const record: ActionRecord = {
            id: randomUUID().slice(0, 12),
            seq: this.store.records.length + 1,
            timestamp: new Date().toISOString(),
            ...entry
        }

        this.store.records.push(record)

        // 仅保留最近 N 条，避免无限增长
        while (this.store.records.length > MAX_RECORDS) {
            this.store.records.shift()
        }

        this.save()
        return record
    }

    /** 列出所有记录（按时间顺序） */
    list(): ActionRecord[] {
        return [...this.store.records]
    }

    /** 最近一条记录 */
    getLast(): ActionRecord | null {
        return this.store.records.length ? this.store.records[this.store.records.length - 1] : null
    }

    /** 按完整/前缀 ID 查找 */
    findById(id: string): ActionRecord | null {
        const exact = this.store.records.find((r) => r.id === id)
        if (exact) return exact

        if (id.length >= 4) {
            const prefixMatches = this.store.records.filter((r) => r.id.startsWith(id))
            if (prefixMatches.length === 1) return prefixMatches[0]
        }
        return null
    }

    /** 按序号查找 */
    findBySeq(seq: number): ActionRecord | null {
        return this.store.records.find((r) => r.seq === seq) ?? null
    }

    /** 按序号或 ID 解析（数字 → 序号，否则 → ID） */
    resolve(idOrSeq: string): ActionRecord | null {
        if (/^\d+$/.test(idOrSeq)) return this.findBySeq(Number(idOrSeq))
        return this.findById(idOrSeq)
    }

    /** 清空所有记录 */
    clear(): void {
        this.store = this.createEmpty()
        this.save()
    }
}
