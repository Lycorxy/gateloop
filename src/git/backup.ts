/**
 * Git 备份与快照系统
 *
 * 在任何 Git 操作前自动创建快照，支持任意步数的回退。
 * 快照存储在工作目录下的 .git/nut-snapshots/ 中。
 *
 * 核心设计：
 * - 每个快照记录完整的仓库状态（HEAD、分支、暂存区、工作区）
 * - 快照ID为递增序号，支持按序号或ID查找
 * - 回退时自动将工作区恢复到快照时的状态
 * - 支持标签系统，方便标记重要节点
 * - 原子写入保证存储安全
 */

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import {
    gitExecOrThrow,
    getCurrentBranch,
    getHeadCommit,
    isWorktreeClean,
    isGitRepo
} from './executor'
import type {
    Snapshot,
    SnapshotStore,
    CreateSnapshotOptions,
    RestoreSnapshotOptions,
    GitOperation,
    GitResult
} from './types'

// ==================== 常量 ====================

const SNAPSHOT_DIR = '.git/nut-snapshots'
const SNAPSHOT_FILE = 'store.json'
const SNAPSHOT_TMP_FILE = 'store.json.tmp'
const MAX_DEFAULT_BACKUPS = 50

// ==================== 快照存储管理 ====================

/**
 * 快照管理器
 */
export class SnapshotManager {
    private storePath: string
    private snapDir: string
    private store: SnapshotStore
    private cwd: string
    private ready: boolean = false

    constructor(cwd?: string) {
        this.cwd = cwd || process.cwd()
        this.snapDir = join(this.cwd, SNAPSHOT_DIR)
        this.storePath = join(this.snapDir, SNAPSHOT_FILE)
        this.store = this.createEmptyStore()
    }

    /** 返回快照存储目录（可用于放置行为日志等附属文件） */
    getSnapshotDir(): string {
        return this.snapDir
    }

    /**
     * 初始化快照管理器
     */
    async init(): Promise<void> {
        const isRepo = await isGitRepo(this.cwd)
        if (!isRepo) {
            throw new Error('当前目录不是 Git 仓库，无法使用快照功能')
        }
        await this.initDirect()
    }

    /**
     * 直接初始化（跳过 Git 仓库检查，由调用方保证）
     * 用于避免 Windows 下连续 spawn hang 问题
     */
    async initDirect(): Promise<void> {
        mkdirSync(this.snapDir, { recursive: true })

        if (existsSync(this.storePath)) {
            try {
                const raw = readFileSync(this.storePath, 'utf-8')
                this.store = JSON.parse(raw) as SnapshotStore
            } catch {
                this.store = this.createEmptyStore()
            }
        } else {
            this.store = this.createEmptyStore()
        }

        this.ready = true
    }

    /**
     * 创建空存储
     */
    private createEmptyStore(): SnapshotStore {
        return {
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            snapshots: [],
            currentIndex: -1,
            totalCount: 0
        }
    }

    /**
     * 确保已初始化
     */
    private ensureReady(): void {
        if (!this.ready) {
            throw new Error('快照管理器未初始化，请先调用 init()')
        }
    }

    /**
     * 持久化存储（原子写入）
     */
    private save(): void {
        this.ensureReady()
        this.store.totalCount = this.store.snapshots.length

        const tmpPath = join(this.snapDir, SNAPSHOT_TMP_FILE)
        const finalPath = this.storePath

        // 先写临时文件，成功后再 rename（原子操作）
        writeFileSync(tmpPath, JSON.stringify(this.store, null, 2), 'utf-8')
        try {
            renameSync(tmpPath, finalPath)
        } catch {
            // Windows 上 rename 可能失败（文件已存在），回退到覆盖写入
            writeFileSync(finalPath, JSON.stringify(this.store, null, 2), 'utf-8')
            try {
                unlinkSync(tmpPath)
            } catch {
                // 忽略清理失败
            }
        }
    }

    /**
     * 创建快照
     */
    async createSnapshot(
        operation: GitOperation,
        options: CreateSnapshotOptions = {}
    ): Promise<Snapshot> {
        this.ensureReady()

        const {
            description = `${operation} 操作前`,
            tags = [],
            includeUntracked = false,
            includeUnstaged = false
        } = options

        const branch = await getCurrentBranch(this.cwd)
        const headCommit = await getHeadCommit(this.cwd)
        let headMessage = ''

        if (headCommit) {
            try {
                headMessage = await gitExecOrThrow(['log', '-1', '--format=%s', headCommit], {
                    cwd: this.cwd,
                    silent: true
                })
                headMessage = headMessage.trim()
            } catch {
                headMessage = '(无提交记录)'
            }
        } else {
            headMessage = '(初始状态)'
        }

        // 获取变更文件列表
        let changedFiles: string[] = []
        try {
            const statusOutput = await gitExecOrThrow(['status', '--porcelain'], {
                cwd: this.cwd,
                silent: true
            })
            changedFiles = statusOutput
                .split('\n')
                .filter(Boolean)
                .map((line) => line.slice(3).trim())
        } catch {
            changedFiles = []
        }

        // 如果没有未跟踪和未暂存文件，且工作区是干净的，尝试用 stash
        let stashRef: string | undefined
        let worktreeHash: string | undefined
        let indexHash: string | undefined

        if (!includeUntracked && !includeUnstaged) {
            // 只备份暂存区的修改
            try {
                const hashResult = await gitExecOrThrow(['write-tree'], {
                    cwd: this.cwd,
                    silent: true
                })
                indexHash = hashResult.trim()
            } catch {
                // 可能没有暂存的内容
            }
        } else {
            // 备份完整工作区
            const stashMsg = `nut-snapshot-auto-${randomUUID().slice(0, 8)}`
            const stashArgs = ['stash', 'push', '-m', stashMsg]
            if (includeUntracked) stashArgs.splice(1, 0, '--include-untracked')

            try {
                await gitExecOrThrow(stashArgs, { cwd: this.cwd, silent: true })
                stashRef = `stash@{0}`
            } catch {
                // 可能没有需要 stash 的内容
            }
        }

        const snapshot: Snapshot = {
            id: randomUUID().slice(0, 12),
            index: this.store.snapshots.length,
            timestamp: new Date().toISOString(),
            branch,
            headCommit,
            headMessage,
            operation,
            description,
            worktreeHash,
            indexHash,
            stashRef,
            changedFiles,
            success: true,
            tags
        }

        this.store.snapshots.push(snapshot)
        this.store.currentIndex = snapshot.index

        // 限制快照数量
        while (this.store.snapshots.length > MAX_DEFAULT_BACKUPS) {
            this.store.snapshots.shift()
            // 重新索引
            this.store.snapshots.forEach((s, i) => {
                s.index = i
            })
        }

        this.save()
        return snapshot
    }

    /**
     * 查找快照
     * ID 优先完全匹配，其次前缀匹配，最后才是 index 匹配
     */
    findSnapshot(target: string | number): Snapshot | null {
        this.ensureReady()

        if (typeof target === 'number') {
            return this.store.snapshots.find((s) => s.index === target) || null
        }

        // 优先精确匹配 ID
        const exactMatch = this.store.snapshots.find((s) => s.id === target)
        if (exactMatch) {
            return exactMatch
        }

        // 前缀匹配（至少匹配4个字符，避免过于模糊）
        if (target.length >= 4) {
            const prefixMatches = this.store.snapshots.filter((s) => s.id.startsWith(target))
            if (prefixMatches.length === 1) {
                return prefixMatches[0]
            }
        }

        return null
    }

    /**
     * 恢复快照
     */
    async restoreSnapshot(
        target: string | number,
        options: RestoreSnapshotOptions = {}
    ): Promise<GitResult> {
        this.ensureReady()

        const { force = false, backupFirst = true, cleanAfter = false } = options
        const startTime = Date.now()

        const snapshot = this.findSnapshot(target)
        if (!snapshot) {
            return {
                success: false,
                operation: 'restore',
                message: `未找到快照: ${target}`,
                error: 'SNAPSHOT_NOT_FOUND',
                duration: Date.now() - startTime
            }
        }

        if (backupFirst) {
            await this.backupBeforeRestore(snapshot)
        }

        try {
            await this.restoreGitState(snapshot, force, cleanAfter)
            this.updateStoreAfterRestore(snapshot, cleanAfter)

            return {
                success: true,
                operation: 'restore',
                message: `已恢复到快照 #${snapshot.index}: ${snapshot.description}`,
                snapshotId: snapshot.id,
                duration: Date.now() - startTime,
                summary: {
                    snapshotIndex: snapshot.index,
                    branch: snapshot.branch,
                    headCommit: snapshot.headCommit?.slice(0, 7),
                    headMessage: snapshot.headMessage,
                    changedFiles: snapshot.changedFiles
                }
            }
        } catch (error) {
            return {
                success: false,
                operation: 'restore',
                message: `恢复失败: ${(error as Error).message}`,
                error: 'RESTORE_FAILED',
                duration: Date.now() - startTime
            }
        }
    }

    /** 恢复前自动备份 */
    private async backupBeforeRestore(snapshot: Snapshot): Promise<void> {
        const isClean = await isWorktreeClean(this.cwd)
        if (!isClean) {
            await this.createSnapshot('restore', {
                description: `恢复到快照 #${snapshot.index} 前的自动备份`,
                tags: ['auto-backup', 'pre-restore']
            })
        }
    }

    /** 恢复 git 状态：分支 + HEAD + stash */
    private async restoreGitState(
        snapshot: Snapshot,
        force: boolean,
        cleanAfter: boolean
    ): Promise<void> {
        await this.restoreBranch(snapshot.branch)
        await this.restoreHead(snapshot.headCommit, force)
        if (snapshot.stashRef && !cleanAfter) {
            await this.restoreStash(snapshot.stashRef)
        }
    }

    /** 恢复到快照所在分支 */
    private async restoreBranch(branch?: string): Promise<void> {
        if (!branch) return
        const currentBranch = await getCurrentBranch(this.cwd)
        if (currentBranch === branch) return
        try {
            await gitExecOrThrow(['checkout', branch], { cwd: this.cwd })
        } catch {
            // 分支可能已被删除
        }
    }

    /** 回退 HEAD 到指定提交 */
    private async restoreHead(headCommit: string | undefined, force: boolean): Promise<void> {
        if (!headCommit) return
        const mode = force ? '--hard' : '--mixed'
        await gitExecOrThrow(['reset', mode, headCommit], { cwd: this.cwd })
    }

    /** 恢复 stash 工作区 */
    private async restoreStash(stashRef: string): Promise<void> {
        try {
            await gitExecOrThrow(['stash', 'pop', stashRef], {
                cwd: this.cwd,
                silent: true
            })
        } catch {
            // stash 可能已被使用或存在冲突
        }
    }

    /** 更新索引 + 可选清理后续快照 */
    private updateStoreAfterRestore(snapshot: Snapshot, cleanAfter: boolean): void {
        this.store.currentIndex = snapshot.index
        if (cleanAfter) {
            this.store.snapshots = this.store.snapshots.slice(0, snapshot.index + 1)
        }
        this.save()
    }

    /**
     * 列出所有快照
     */
    listSnapshots(): Snapshot[] {
        this.ensureReady()
        return [...this.store.snapshots]
    }

    /**
     * 获取当前快照
     */
    getCurrentSnapshot(): Snapshot | null {
        this.ensureReady()
        if (this.store.currentIndex < 0) return null
        return this.store.snapshots[this.store.currentIndex] || null
    }

    /**
     * 获取快照数量
     */
    getCount(): number {
        this.ensureReady()
        return this.store.snapshots.length
    }

    /**
     * 通过标签查找快照
     */
    findByTag(tag: string): Snapshot[] {
        this.ensureReady()
        return this.store.snapshots.filter((s) => s.tags.includes(tag))
    }

    /**
     * 删除指定快照
     */
    removeSnapshot(target: string | number): boolean {
        this.ensureReady()

        const idx =
            typeof target === 'number'
                ? target
                : this.store.snapshots.findIndex((s) => s.id === target || s.id.startsWith(target))

        if (idx < 0) return false

        this.store.snapshots.splice(idx, 1)
        this.store.snapshots.forEach((s, i) => {
            s.index = i
        })
        this.store.currentIndex = Math.min(this.store.currentIndex, this.store.snapshots.length - 1)
        this.save()
        return true
    }

    /**
     * 清空所有快照
     */
    clearAll(): void {
        this.ensureReady()
        this.store.snapshots = []
        this.store.currentIndex = -1
        this.store.totalCount = 0
        this.save()
    }
}

// ==================== 安全网管理器 ====================

/**
 * Git 安全网（Safety Net）
 *
 * 在 AI 执行任何危险 Git 操作前，自动保存所有工作区状态（已暂存 + 未暂存 + 未跟踪）。
 * 用户确认操作无误后调用 confirm() 清除；发现问题时调用 reject() 恢复一切。
 *
 * 典型流程：
 * ```
 * const sn = new SafetyNet(cwd)
 * await sn.capture('add 操作前')          // git stash push --include-untracked
 * await git.add({ all: true })           // AI 执行操作
 * // 用户检查无误
 * await sn.confirm()                     // git stash drop，清除安全网
 * // 或发现问题
 * await sn.reject()                      // git stash pop，恢复一切
 * ```
 */
export class SafetyNet {
    private cwd: string
    private active: boolean = false
    private stashRef: string | null = null

    constructor(cwd?: string) {
        this.cwd = cwd || process.cwd()
    }

    /**
     * 捕获当前所有工作区状态
     * - 已暂存的修改（git add 过的）
     * - 未暂存的修改（工作区改动）
     * - 未跟踪的新文件
     * - 已删除的文件
     *
     * 本质上是 git stash push --include-untracked
     */
    async capture(description: string): Promise<{
        success: boolean
        stashRef: string | null
        changedFiles: string[]
    }> {
        if (this.active) {
            // 已经有一个活跃的安全网，不要覆盖
            return { success: true, stashRef: this.stashRef, changedFiles: [] }
        }

        // 获取变更文件列表（stash 之前）
        let changedFiles: string[] = []
        try {
            const statusOutput = await gitExecOrThrow(['status', '--porcelain'], {
                cwd: this.cwd,
                silent: true
            })
            changedFiles = statusOutput
                .split('\n')
                .filter(Boolean)
                .map((line) => line.slice(3).trim())
        } catch {
            // 忽略
        }

        // 检查是否有东西需要保存
        if (changedFiles.length === 0) {
            return { success: true, stashRef: null, changedFiles: [] }
        }

        const stashMsg = `SAFETY-NET-${Date.now()}-${description.slice(0, 50)}`

        try {
            await gitExecOrThrow(['stash', 'push', '--include-untracked', '-m', stashMsg], {
                cwd: this.cwd,
                silent: true
            })
            this.stashRef = 'stash@{0}'
            this.active = true
            return { success: true, stashRef: this.stashRef, changedFiles }
        } catch (e) {
            // stash 失败（可能完全没有更改）
            return { success: false, stashRef: null, changedFiles: [] }
        }
    }

    /**
     * 确认操作无误，清除安全网
     * 调用 git stash drop 丢弃之前保存的状态
     */
    async confirm(): Promise<boolean> {
        if (!this.active || !this.stashRef) return true

        try {
            await gitExecOrThrow(['stash', 'drop', this.stashRef], {
                cwd: this.cwd,
                silent: true
            })
            this.reset()
            return true
        } catch {
            // stash 可能已经被手动处理了，算作确认
            this.reset()
            return true
        }
    }

    /**
     * 发现问题，恢复一切到安全网捕获时的状态
     * 调用 git stash pop 恢复之前的修改
     */
    async reject(): Promise<{
        success: boolean
        message: string
    }> {
        if (!this.active || !this.stashRef) {
            return { success: true, message: '没有活跃的安全网' }
        }

        try {
            await gitExecOrThrow(['stash', 'pop', this.stashRef], {
                cwd: this.cwd,
                silent: true
            })
            this.reset()
            return { success: true, message: '已恢复所有工作区修改' }
        } catch (e) {
            const err = (e as Error).message || ''

            if (err.includes('conflict') || err.includes('CONFLICT')) {
                return {
                    success: false,
                    message:
                        '恢复时发生冲突，请手动解决。安全网数据仍在 stash 中，可以使用 git stash pop 手动恢复'
                }
            }

            this.reset()
            return { success: false, message: `恢复失败: ${err}` }
        }
    }

    /**
     * 是否活跃（已捕获未确认/拒绝）
     */
    isActive(): boolean {
        return this.active
    }

    /**
     * 重置状态
     */
    private reset(): void {
        this.active = false
        this.stashRef = null
    }
}

// ==================== 全局实例 ====================

let globalManager: SnapshotManager | null = null

/**
 * 获取全局快照管理器
 */
export function getSnapshotManager(cwd?: string): SnapshotManager {
    if (!globalManager) {
        globalManager = new SnapshotManager(cwd)
    }
    return globalManager
}

/**
 * 重置全局快照管理器
 */
export function resetSnapshotManager(): void {
    globalManager = null
}
