/**
 * Git 工具主入口
 *
 * GitManager 是 Git 工具的统一入口，整合了备份、操作、差异、SSH 等功能。
 *
 * 使用方式：
 * ```ts
 * import { GitManager } from 'node-ultra/git'
 *
 * const git = new GitManager({ autoBackup: true })
 * await git.init()
 *
 * // 暂存
 * await git.stage({ all: true, fixLineEndings: true })
 *
 * // 提交
 * await git.commit({ message: 'feat: add new feature' })
 *
 * // 回退一步
 * await git.restoreToPrevious()
 *
 * // 查看状态
 * const status = await git.status()
 *
 * // 分支对比
 * const diff = await git.diffBranches('main', 'develop')
 * ```
 */

import { SnapshotManager, SafetyNet } from './backup'
import { GitOperator } from './operations'
import { DiffViewer } from './diff'
import { SSHManager } from './ssh'
import { isGitRepo, getGitRoot, getCurrentBranch, getHeadCommit, isWorktreeClean } from './executor'
import { checkLineEndings, fixLineEndings, setupGitAttributes } from './line-ending'
import type {
    GitManagerConfig,
    GitResult,
    StageOptions,
    CommitOptions,
    DiffOptions,
    LineEnding,
    SSHSetupOptions,
    SSHAccount
} from './types'

// ==================== Git 管理器 ====================

/**
 * Git 管理器
 *
 * 封装所有 Git 操作，提供统一的 API。
 * 支持自动备份、快照回退、差异对比、SSH 配置等功能。
 */
export class GitManager {
    /** 快照管理器 */
    snapshotManager: SnapshotManager
    /** 安全网管理器 */
    safetyNet: SafetyNet
    /** Git 操作器 */
    operator: GitOperator
    /** 差异对比器 */
    diffViewer: DiffViewer
    /** SSH 管理器 */
    sshManager: SSHManager

    private config: Required<GitManagerConfig>
    private initialized: boolean = false

    constructor(config: GitManagerConfig = {}) {
        this.config = {
            cwd: config.cwd || process.cwd(),
            autoBackup: config.autoBackup ?? true,
            maxBackups: config.maxBackups ?? 50,
            enableLog: config.enableLog ?? true,
            defaultLineEnding: config.defaultLineEnding ?? 'lf',
            sshKeyType: config.sshKeyType ?? 'ed25519',
            sshKeyBits: config.sshKeyBits ?? 4096
        }

        this.snapshotManager = new SnapshotManager(this.config.cwd)
        this.safetyNet = new SafetyNet(this.config.cwd)
        this.operator = new GitOperator(
            this.snapshotManager,
            this.config.cwd,
            this.config.autoBackup
        )
        this.diffViewer = new DiffViewer(this.config.cwd)
        this.sshManager = new SSHManager(this.config.cwd)
    }

    /**
     * 初始化
     */
    async init(): Promise<void> {
        const isRepo = await isGitRepo(this.config.cwd)
        if (!isRepo) {
            throw new Error('当前目录不是 Git 仓库，请先执行 git init')
        }

        // 跳过 SnapshotManager 内部的 isGitRepo 检查，避免 Windows 下连续 spawn hang
        await this.snapshotManager.initDirect()
        this.initialized = true

        if (this.config.enableLog) {
            const root = await getGitRoot(this.config.cwd)
            const branch = await getCurrentBranch(this.config.cwd)
            process.stderr.write(`\x1b[36m[GIT] 已初始化: ${root} (${branch})\x1b[0m\n`)
        }
    }

    /** 确保已初始化 */
    private ensureReady(): void {
        if (!this.initialized) {
            throw new Error('GitManager 未初始化，请先调用 init()')
        }
    }

    // ==================== 状态查询 ====================

    /** 获取工作区状态 */
    async status(): Promise<GitResult> {
        this.ensureReady()
        return this.operator.status()
    }

    /** 获取仓库根目录 */
    async getRoot(): Promise<string> {
        this.ensureReady()
        return getGitRoot(this.config.cwd)
    }

    /** 获取当前分支 */
    async getCurrentBranch(): Promise<string> {
        this.ensureReady()
        return getCurrentBranch(this.config.cwd)
    }

    /** 获取 HEAD 提交 */
    async getHeadCommit(): Promise<string> {
        this.ensureReady()
        return getHeadCommit(this.config.cwd)
    }

    /** 检查工作区是否干净 */
    async isClean(): Promise<boolean> {
        this.ensureReady()
        return isWorktreeClean(this.config.cwd)
    }

    /** 获取提交日志 */
    async log(count?: number): Promise<GitResult> {
        this.ensureReady()
        return this.operator.log(count)
    }

    // ==================== 暂存操作 ====================

    /**
     * 暂存文件
     *
     * @example
     * // 暂存所有文件
     * await git.stage({ all: true })
     *
     * // 暂存指定文件并修复换行符
     * await git.stage({ files: ['src/index.ts'], fixLineEndings: true })
     */
    async stage(options?: StageOptions): Promise<GitResult> {
        this.ensureReady()
        return this.operator.stage(options)
    }

    /**
     * 取消暂存
     */
    async unstage(files?: string[]): Promise<GitResult> {
        this.ensureReady()
        return this.operator.unstage(files)
    }

    // ==================== 提交操作 ====================

    /**
     * 提交代码
     *
     * @example
     * await git.commit({ message: 'feat: add login page' })
     * await git.commit({ message: 'fix: typo', amend: true })
     * await git.commit({ message: 'chore: update deps', all: true, noVerify: true })
     */
    async commit(options: CommitOptions): Promise<GitResult> {
        this.ensureReady()
        return this.operator.commit(options)
    }

    // ==================== 回退操作 ====================

    /**
     * 回退到指定快照
     *
     * @example
     * // 回退到索引为 0 的快照
     * await git.restoreToIndex(0)
     *
     * // 回退到上一个快照
     * await git.restoreToPrevious()
     */
    async restoreToIndex(index: number): Promise<GitResult> {
        this.ensureReady()
        return this.operator.restoreToIndex(index)
    }

    /** 回退到第一个快照 */
    async restoreToFirst(): Promise<GitResult> {
        this.ensureReady()
        return this.operator.restoreToFirst()
    }

    /** 回退到上一个快照 */
    async restoreToPrevious(): Promise<GitResult> {
        this.ensureReady()
        return this.operator.restoreToPrevious()
    }

    /** 回退单个文件 */
    async revertFile(filePath: string): Promise<GitResult> {
        this.ensureReady()
        return this.operator.revertFile(filePath)
    }

    // ==================== 快照管理 ====================

    /** 创建手动快照 */
    async createSnapshot(description: string, tags?: string[]): Promise<GitResult> {
        this.ensureReady()
        return this.operator.createManualSnapshot(description, tags)
    }

    /** 列出所有快照 */
    listSnapshots(): GitResult {
        this.ensureReady()
        return this.operator.listSnapshots()
    }

    /** 获取快照数量 */
    getSnapshotCount(): number {
        this.ensureReady()
        return this.snapshotManager.getCount()
    }

    // ==================== 安全网 ====================

    /**
     * 捕获当前全部工作区状态（安全网）
     *
     * 保存内容包括：已暂存 + 未暂存 + 未跟踪文件 + 已删除文件
     *
     * @example
     * // 在 AI 执行危险操作前
     * await git.safetyNetCapture('add 操作前')
     * await git.stage({ all: true })
     * // 用户确认无误
     * await git.safetyNetConfirm()
     * // 或发现问题
     * await git.safetyNetReject()
     */
    async safetyNetCapture(description: string): Promise<
        GitResult
    > {
        this.ensureReady()
        const startTime = Date.now()

        const result = await this.safetyNet.capture(description)

        return {
            success: result.success,
            operation: 'backup',
            message: result.success
                ? `安全网已捕获 ${result.changedFiles.length} 个文件`
                : '安全网捕获失败（工作区可能为空）',
            data: { changedFiles: result.changedFiles, stashRef: result.stashRef },
            duration: Date.now() - startTime
        }
    }

    /**
     * 确认操作无误，清除安全网
     *
     * 调用后 stash 中保存的状态会被永久删除
     */
    async safetyNetConfirm(): Promise<GitResult> {
        this.ensureReady()
        const startTime = Date.now()

        const confirmed = await this.safetyNet.confirm()

        return {
            success: confirmed,
            operation: 'backup',
            message: confirmed ? '安全网已清除（操作确认无误）' : '安全网清除失败',
            duration: Date.now() - startTime
        }
    }

    /**
     * 发现问题，通过安全网恢复一切
     *
     * 调用 git stash pop 恢复之前保存的所有工作区修改
     */
    async safetyNetReject(): Promise<GitResult> {
        this.ensureReady()
        const startTime = Date.now()

        const result = await this.safetyNet.reject()

        return {
            success: result.success,
            operation: 'restore',
            message: result.message,
            duration: Date.now() - startTime
        }
    }

    /**
     * 安全网是否活跃（已捕获未确认）
     */
    isSafetyNetActive(): boolean {
        return this.safetyNet.isActive()
    }

    // ==================== 分支操作 ====================

    /** 获取分支列表 */
    async listBranches(includeRemote?: boolean): Promise<GitResult> {
        this.ensureReady()
        return this.operator.listBranches(includeRemote)
    }

    /** 创建分支 */
    async createBranch(name: string, checkout?: boolean): Promise<GitResult> {
        this.ensureReady()
        return this.operator.createBranch(name, checkout)
    }

    /** 切换分支 */
    async switchBranch(name: string): Promise<GitResult> {
        this.ensureReady()
        return this.operator.switchBranch(name)
    }

    /** 删除分支 */
    async deleteBranch(name: string, force?: boolean): Promise<GitResult> {
        this.ensureReady()
        return this.operator.deleteBranch(name, force)
    }

    // ==================== Stash 操作 ====================

    /** 暂存工作区 */
    async stash(description?: string, includeUntracked?: boolean): Promise<GitResult> {
        this.ensureReady()
        return this.operator.stash(description, includeUntracked)
    }

    /** 恢复 stash */
    async stashPop(): Promise<GitResult> {
        this.ensureReady()
        return this.operator.stashPop()
    }

    /** 列出 stash */
    async stashList(): Promise<GitResult> {
        this.ensureReady()
        return this.operator.stashList()
    }

    // ==================== 差异对比 ====================

    /** 比较差异 */
    async diff(fromRef?: string, toRef?: string, options?: DiffOptions): Promise<GitResult> {
        this.ensureReady()
        return this.diffViewer.diff(fromRef, toRef, options)
    }

    /** 比较暂存区差异 */
    async diffStaged(options?: DiffOptions): Promise<GitResult> {
        this.ensureReady()
        return this.diffViewer.diffStaged(options)
    }

    /** 比较工作区差异 */
    async diffWorktree(options?: DiffOptions): Promise<GitResult> {
        this.ensureReady()
        return this.diffViewer.diffWorktree(options)
    }

    /** 比较单个文件 */
    async diffFile(filePath: string, fromRef?: string, toRef?: string): Promise<GitResult> {
        this.ensureReady()
        return this.diffViewer.diffFile(filePath, fromRef, toRef)
    }

    /** 比较两个分支 */
    async diffBranches(source: string, target: string): Promise<GitResult> {
        this.ensureReady()
        return this.diffViewer.diffBranches(source, target)
    }

    /** 获取文件历史 */
    async fileHistory(filePath: string, count?: number): Promise<GitResult> {
        this.ensureReady()
        return this.diffViewer.fileHistory(filePath, count)
    }

    /** 比较文件在两个提交间的差异 */
    async fileDiffBetween(
        filePath: string,
        oldCommit: string,
        newCommit: string
    ): Promise<GitResult> {
        this.ensureReady()
        return this.diffViewer.fileDiffBetween(filePath, oldCommit, newCommit)
    }

    // ==================== 换行符处理 ====================

    /** 检测项目换行符状态 */
    async checkLineEndings(): Promise<GitResult> {
        this.ensureReady()
        return checkLineEndings(this.config.cwd)
    }

    /** 修复项目换行符 */
    async fixLineEndings(expected?: LineEnding): Promise<GitResult> {
        this.ensureReady()
        return fixLineEndings(this.config.cwd, expected || this.config.defaultLineEnding)
    }

    /** 配置 .gitattributes */
    async setupGitAttributes(lineEnding?: LineEnding): Promise<GitResult> {
        this.ensureReady()
        return setupGitAttributes(this.config.cwd, lineEnding || this.config.defaultLineEnding)
    }

    // ==================== SSH 配置 ====================

    /** 一键配置 SSH */
    async setupSSH(options: SSHSetupOptions): Promise<GitResult> {
        return this.sshManager.setup({
            keyType: this.config.sshKeyType,
            keyBits: this.config.sshKeyBits,
            ...options
        })
    }

    /** 批量配置多帐号 SSH */
    async setupMultiAccountSSH(
        platform: 'github' | 'gitlab' | 'gitee' | 'gitcode',
        accounts: SSHAccount[]
    ): Promise<GitResult> {
        return this.sshManager.setupMultiAccount(platform, accounts)
    }

    /** 诊断 SSH 常见问题 */
    async troubleshootSSH(host?: string): Promise<GitResult> {
        return this.sshManager.troubleshoot(host)
    }

    /** 检查 SSH 状态 */
    async checkSSHStatus(): Promise<GitResult> {
        return this.sshManager.checkStatus()
    }

    /** 显示 SSH 公钥 */
    async showSSHKey(hostOrPlatform?: string): Promise<GitResult> {
        return this.sshManager.showPublicKey(hostOrPlatform)
    }

    // ==================== 统计信息 ====================

    /** 获取管理器统计信息 */
    async getStats(): Promise<Record<string, unknown>> {
        this.ensureReady()

        return {
            initialized: this.initialized,
            autoBackup: this.config.autoBackup,
            snapshots: this.snapshotManager.getCount(),
            root: await getGitRoot(this.config.cwd).catch(() => 'N/A'),
            branch: await getCurrentBranch(this.config.cwd).catch(() => 'N/A'),
            head: await getHeadCommit(this.config.cwd).catch(() => 'N/A'),
            clean: await isWorktreeClean(this.config.cwd).catch(() => false)
        }
    }
}

// ==================== 全局实例 ====================

let globalGitManager: GitManager | null = null

/**
 * 获取全局 Git 管理器
 */
export function getGitManager(config?: GitManagerConfig): GitManager {
    if (!globalGitManager) {
        globalGitManager = new GitManager(config)
    }
    return globalGitManager
}

/**
 * 重置全局 Git 管理器
 */
export function resetGitManager(): void {
    globalGitManager = null
}

// ==================== 导出子模块 ====================

export { SnapshotManager, SafetyNet } from './backup'
export { GitOperator } from './operations'
export { DiffViewer } from './diff'
export { SSHManager } from './ssh'
export { setupSSH, setupMultiAccountSSH, troubleshootSSH, checkSSHStatus, showSSHKey } from './ssh'
export {
    gitExec,
    gitExecOrThrow,
    gitExecLines,
    isGitRepo,
    getGitRoot,
    getCurrentBranch,
    getHeadCommit,
    isWorktreeClean,
    getStagedFiles
} from './executor'
export {
    checkLineEndings,
    fixLineEndings,
    checkAndFixLineEndings,
    setupGitAttributes,
    generateGitAttributes
} from './line-ending'
export type { GitExecOptions, GitExecResult } from './executor'
export type {
    Snapshot,
    SnapshotStore,
    CreateSnapshotOptions,
    RestoreSnapshotOptions,
    SSHSetupOptions,
    SSHAccount,
    SSHTroubleshootResult,
    SSHTroubleshootCheck
} from './types'

export default GitManager
