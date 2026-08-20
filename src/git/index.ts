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
import { ActivityLog } from './activitylog'
import type { ActionRecord } from './activitylog'
import { errorResult } from './result'
import { GitOperator } from './operations'
import { DiffViewer } from './diff'
import { SSHManager } from './ssh'
import { AuthService } from './auth'
import { RemoteService } from './remote'
import { SshRemoteService } from './ssh-remote'
import { BranchService } from './branch'
import { isGitRepo, getGitRoot, getCurrentBranch, getHeadCommit, isWorktreeClean } from './executor'
import { checkLineEndings, fixLineEndings, setupGitAttributes } from './line-ending'
import { setupGitIgnore, setupEditorConfig, setupProjectConfig } from './config'
import type {
    GitManagerConfig,
    GitResult,
    GitOperation,
    StageOptions,
    CommitOptions,
    DiffOptions,
    LineEnding,
    SSHSetupOptions,
    SSHAccount,
    ConfigSetupOptions
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
    /** 授权服务（OAuth device flow + token 缓存） */
    authService: AuthService
    /** 远程 MR 服务（GitLab API） */
    remoteService: RemoteService
    /** SSH Key 远程服务（工蜂 API：注册/查询/删除/验证） */
    sshRemoteService: SshRemoteService
    /** 分支服务（版本管理 + release/feature 命名） */
    branchService: BranchService
    /** 操作行为日志（记录关键操作 + 回退锚点，供快速回滚） */
    activityLog: ActivityLog

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
        this.authService = new AuthService()
        this.remoteService = new RemoteService()
        this.sshRemoteService = new SshRemoteService()
        this.branchService = new BranchService(this.config.cwd)

        // 操作行为日志（与快照放同一目录）
        this.activityLog = new ActivityLog(this.snapshotManager.getSnapshotDir())
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
        this.activityLog.init()
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
        return this.withActivity(
            'commit',
            `提交: ${options.message}`,
            () => this.operator.commit(options),
            { meta: { message: options.message } }
        )
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

    // ==================== 操作行为日志 / 快速回滚 ====================

    /**
     * 关键操作统一入口：
     * 1. 操作前自动创建快照（或可复用 operator 已创建的快照）
     * 2. 执行操作
     * 3. 在操作行为日志中记录一条「行为 + 快照锚点」
     *
     * 这样用户可以在 `nut git activity` 看到「做了什么」，
     * 并用 `nut git undo` / `nut git rollback --action <序号>` 精准回退到某次操作前。
     */
    private async withActivity<T>(
        action: string,
        description: string,
        run: () => Promise<T>,
        opts: { snapshot?: boolean; meta?: Record<string, unknown> } = {}
    ): Promise<T> {
        const before = this.snapshotManager.getCount()

        // 若该关键场景自身不带快照（如 mergeToTest / createMR 等上层流程），则在此兜底打一个
        let forcedSnapshotId: string | undefined
        if (opts.snapshot && this.config.autoBackup) {
            forcedSnapshotId = await this.snapshotBefore(action, description)
        }

        const result = await run()

        // 关联快照锚点：优先用本次显式创建的；否则取 operator 在执行期间刚创建的快照
        let snapshotId = forcedSnapshotId
        if (!snapshotId && this.snapshotManager.getCount() > before) {
            snapshotId = this.snapshotManager.getCurrentSnapshot()?.id
        }

        const r = result as { success?: boolean; error?: string }
        const isNullish = result === null || result === undefined
        const failed = r.success === false || isNullish

        await this.activityLog.record({
            action,
            description,
            branch: await this.getCurrentBranch().catch(() => undefined),
            snapshotId,
            result: failed ? 'failed' : 'success',
            error: r.error,
            meta: opts.meta
        })

        // 把快照 ID 顺带给调用方（如 GitResult.snapshotId），方便上层展示
        if (snapshotId) {
            ;(result as { snapshotId?: string }).snapshotId = snapshotId
        }
        return result
    }

    /** 为未自带备份的关键场景创建一个「操作前快照」 */
    private async snapshotBefore(
        action: GitOperation | string,
        description: string
    ): Promise<string | undefined> {
        try {
            const snap = await this.snapshotManager.createSnapshot(action as GitOperation, {
                description,
                includeUnstaged: true,
                includeUntracked: true
            })
            return snap.id
        } catch {
            return undefined
        }
    }

    /** 列出操作行为日志（供 `nut git activity` 使用） */
    listActivity(): ActionRecord[] {
        return this.activityLog.list()
    }

    /**
     * 撤销上一步操作：回退到上一次操作执行前的快照。
     * 若上一步是纯远程操作（如 MR）没有本地快照，则提示无法本地回退。
     */
    async undo(): Promise<GitResult> {
        this.ensureReady()
        const last = this.activityLog.getLast()
        if (!last) {
            return errorResult('restore', '没有可撤销的操作记录', 'NO_ACTIVITY')
        }
        if (!last.snapshotId) {
            return errorResult(
                'restore',
                `上一步「${last.description}」没有可回退的本地快照（如纯远程 MR 操作），需手动处理`,
                'NO_SNAPSHOT'
            )
        }
        return this.snapshotManager.restoreSnapshot(last.snapshotId, { backupFirst: true })
    }

    /**
     * 回退到指定操作步骤执行前的状态（按行为序号或 ID）。
     */
    async rollbackToAction(idOrSeq: string): Promise<GitResult> {
        this.ensureReady()
        const rec = this.activityLog.resolve(idOrSeq)
        if (!rec) {
            return errorResult('restore', `未找到操作记录: ${idOrSeq}`, 'ACTION_NOT_FOUND')
        }
        if (!rec.snapshotId) {
            return errorResult(
                'restore',
                `操作「${rec.description}」没有可回退的本地快照（如纯远程 MR 操作），需手动处理`,
                'NO_SNAPSHOT'
            )
        }
        return this.snapshotManager.restoreSnapshot(rec.snapshotId, { backupFirst: true })
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
    async safetyNetCapture(description: string): Promise<GitResult> {
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

    /**
     * 将指定（或当前）分支 rebase 到目标分支
     *
     * 流程：stash → checkout → fetch → rebase → stash pop。
     * 冲突时自动 abort rebase 并恢复 stash，返回 CONFLICT 提示手动继续。
     * 不自动 force-push（rebase 改写历史，推送需用户显式确认）。
     *
     * @param options.branch 要 rebase 的分支（默认当前分支）
     * @param options.onto   rebase 的目标基准（默认 master）
     */
    async rebase(options?: { branch?: string; onto?: string }): Promise<GitResult> {
        this.ensureReady()
        const onto = options?.onto || 'master'
        const branch = options?.branch
        return this.withActivity(
            'rebase',
            `rebase ${branch || '(当前分支)'} → ${onto}`,
            () => this.operator.rebase(options),
            { meta: { branch, onto } }
        )
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

    /**
     * 生成 / 完善 .gitignore
     *
     * 文件已存在时默认仅追加缺失的推荐项（不覆盖），--force 才覆盖重写。
     */
    async setupGitIgnore(options?: ConfigSetupOptions): Promise<GitResult> {
        this.ensureReady()
        return setupGitIgnore(this.config.cwd, options)
    }

    /**
     * 生成 / 完善 .editorconfig
     */
    async setupEditorConfig(options?: ConfigSetupOptions): Promise<GitResult> {
        this.ensureReady()
        return setupEditorConfig(this.config.cwd, options)
    }

    /**
     * 一键生成 / 完善项目 Git 配置（.gitattributes + .gitignore + .editorconfig）
     *
     * 默认仅追加缺失推荐项，不覆盖已有配置；options.force=true 时覆盖重写。
     */
    async setupProjectConfig(options?: ConfigSetupOptions): Promise<GitResult> {
        this.ensureReady()
        return setupProjectConfig(this.config.cwd, {
            lineEnding: options?.lineEnding || this.config.defaultLineEnding,
            force: options?.force
        })
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

    // ==================== SSH Key 远程管理 ====================

    /**
     * 查询已注册的 SSH Key 列表
     *
     * 自动读取本地缓存的 token；无 token 时返回空列表。
     *
     * @example
     * const keys = await git.listSSHKeys()
     * keys.forEach(k => console.log(k.id, k.title, k.createdAt))
     */
    async listSSHKeys(): Promise<
        Array<{ id: number; title: string; key: string; createdAt: string }>
    > {
        return this.sshRemoteService.listKeys()
    }

    /**
     * 删除远程平台上的 SSH Key
     *
     * 调用 DELETE /api/v3/user/keys/:id（幂等）。
     *
     * @param id Key ID（从 listSSHKeys 获取）
     * @returns 是否删除成功
     *
     * @example
     * const keys = await git.listSSHKeys()
     * await git.deleteSSHKey(keys[0].id)
     */
    async deleteSSHKey(id: number): Promise<boolean> {
        return this.sshRemoteService.deleteKey(id)
    }

    /**
     * 验证当前 token 是否有效
     *
     * 调用 GET /api/v3/user 验证 token，返回用户信息。
     *
     * @example
     * const result = await git.verifyToken()
     * if (result.valid) console.log(result.username)
     */
    async verifyToken(): Promise<{
        valid: boolean
        username?: string
        name?: string
        userId?: number
        error?: string
    }> {
        return this.sshRemoteService.verifyToken()
    }

    /**
     * 清理本地 SSH 配置（密钥文件 + config 块）
     *
     * 删除指定平台的密钥对，并从 ~/.ssh/config 移除对应 Host 块。
     * 不删除远程平台上的公钥（如需删除远程 Key，用 deleteSSHKey）。
     *
     * @param platform 平台名（默认 gitcode）
     * @param account 多帐号标识（可选）
     *
     * @example
     * await git.cleanSSH('gitcode')
     */
    async cleanSSH(platform?: string, account?: string): Promise<GitResult> {
        return this.sshManager.clean(platform, account)
    }

    // ==================== 授权（OAuth + Token） ====================

    /**
     * 触发 OAuth 授权流程（弹浏览器让用户授权）
     *
     * 授权后 token 缓存到 ~/.gfrc（300 天有效）。
     * 后续所有远程操作自动使用缓存 token。
     */
    async login(): Promise<string | null> {
        return this.authService.login()
    }

    /**
     * 确保 token 可用（取本地缓存或触发授权）
     *
     * 远程操作前调用此方法确保已授权。
     * @returns token；失败返回空字符串
     */
    async ensureToken(): Promise<string> {
        return this.authService.ensureToken()
    }

    /** 获取本地缓存的 token（不触发授权） */
    async getToken(): Promise<string | null> {
        return this.authService.getToken()
    }

    /** 清除本地 token（登出） */
    async logout(): Promise<GitResult> {
        return this.authService.logout()
    }

    // ==================== 远程 MR 管理 ====================

    /**
     * 创建 Merge Request
     *
     * 自动使用缓存 token；无 token 时自动触发授权。
     *
     * @example
     * await git.createMR({
     *   sourceBranch: 'feature/login_v1.0.0',
     *   targetBranch: 'release/v1.0.0',
     *   title: 'feat: 登录功能'
     * })
     */
    async createMR(options: {
        sourceBranch: string
        targetBranch: string
        title: string
        reviewerIds?: number[]
    }): Promise<{ success: boolean; url?: string; manualUrl?: string; error?: string }> {
        return this.withActivity(
            'createMR',
            `创建 MR: ${options.sourceBranch} → ${options.targetBranch}`,
            () => this.remoteService.createMR(options),
            { meta: { sourceBranch: options.sourceBranch, targetBranch: options.targetBranch } }
        )
    }

    /** 检查 MR 是否已存在（防重复创建） */
    async checkMRExists(sourceBranch: string, targetBranch: string): Promise<boolean> {
        return this.remoteService.checkMRExists(sourceBranch, targetBranch)
    }

    /** 列出 MR（opened/merged/closed/all） */
    async listMRs(state?: 'opened' | 'merged' | 'closed' | 'all'): Promise<
        Array<{
            iid: number
            title: string
            state: string
            sourceBranch: string
            targetBranch: string
            author: string
            webUrl: string
        }>
    > {
        return this.remoteService.listMRs(state)
    }

    /** 获取当前项目的远程路径（如 kfweb/my-project） */
    async getProjectId(): Promise<string> {
        return this.remoteService.getProjectId()
    }

    // ==================== 分支策略（版本管理 + release/feature） ====================

    /** 获取当前目录的 package.json 信息 */
    async getCurrentProjectInfo(): Promise<{
        name: string
        path: string
        pkgPath: string
        version: string
    } | null> {
        return this.branchService.getCurrentProjectInfo()
    }

    /** 检测 Monorepo 子项目的 projectKey */
    detectProjectKey(): string | undefined {
        return this.branchService.detectProjectKey()
    }

    /** 获取远程最新版本号（扫描远程分支和 tags） */
    async getLatestVersion(projectKey?: string): Promise<string> {
        return this.branchService.getLatestVersion(projectKey)
    }

    /**
     * 创建 release + feature 分支（一步完成）
     *
     * @param options.version 版本号（如 1.2.0）
     * @param options.projectKey Monorepo 项目 key（可选）
     * @param options.useRelease 是否创建 release 分支（false 则 feature 直接基于 master）
     */
    async createReleaseFeatureBranches(options: {
        version: string
        projectKey?: string
        useRelease: boolean
    }): Promise<{
        releaseBranch: string
        featureBranch: string
        version: string
        featureDesc: string
    } | null> {
        return this.branchService.createReleaseFeatureBranches(options)
    }

    /** 提交 package.json 版本号变更并推送 */
    async commitVersionChange(
        pkgPath: string,
        version: string,
        projectKey?: string
    ): Promise<boolean> {
        return this.branchService.commitVersion(pkgPath, version, projectKey)
    }

    /** 删除远程分支（+本地） */
    async deleteRemoteBranch(branchName: string, deleteLocal?: boolean): Promise<boolean> {
        return this.branchService.deleteBranch(branchName, deleteLocal)
    }

    /**
     * 创建 feature / hotfix 分支（从 master 切出并推送）
     *
     * @param type 'feature'（需求）| 'hotfix'（缺陷修复）
     * @param version 版本号（如 1.2.0）
     * @param projectKey Monorepo 项目 key（可选）
     * @returns 分支名；失败返回 null
     */
    async createBranchByType(
        type: 'feature' | 'hotfix',
        version: string,
        projectKey?: string
    ): Promise<string | null> {
        return this.withActivity(
            'createBranch',
            `创建 ${type} 分支 (v${version})`,
            () => this.branchService.createBranchByType(type, version, projectKey),
            { snapshot: true, meta: { type, version, projectKey } }
        )
    }

    /** 创建并推送 tag（v{ver} / {key}-v{ver}） */
    async createTag(tagName: string, message?: string): Promise<boolean> {
        return this.withActivity(
            'createTag',
            `打 tag: ${tagName}`,
            () => this.branchService.createTag(tagName, message),
            { snapshot: true, meta: { tagName, message } }
        )
    }

    /** 列出远程 tags（匹配命名规范，按版本倒序） */
    async listTags(projectKey?: string): Promise<string[]> {
        return this.branchService.listTags(projectKey)
    }

    /** 列出可管理的远程分支（匹配 release/feature/hotfix 命名规范） */
    async listManagedBranches(projectKey?: string): Promise<
        Array<{
            name: string
            type: 'release' | 'feature' | 'hotfix'
            version: string
            featureDesc?: string
        }>
    > {
        return this.branchService.listManagedBranches(projectKey)
    }

    /**
     * 合并源分支到 test 测试分支并推送（发布测试环境）
     *
     * 多人并发开发时，各人 feature/hotfix 开发完成后调用此方法，
     * 自动切换到 test、合并、推送并切回源分支。
     *
     * @param sourceBranch 要合并到 test 的源分支（feature/hotfix），默认当前分支
     * @returns 合并结果
     */
    async mergeToTest(
        sourceBranch?: string
    ): Promise<{ success: boolean; testBranch: string; error?: string }> {
        const branch = sourceBranch || (await this.getCurrentBranch())
        return this.withActivity(
            'mergeToTest',
            `合并 ${branch} → test（含推送）`,
            () => this.branchService.mergeToTest(branch),
            { snapshot: true, meta: { sourceBranch: branch, targetBranch: 'test' } }
        )
    }

    /**
     * 预览合并到 test：无冲突则自动合并并推送，有冲突则中止并提示手动合并
     *
     * 与 mergeToTest 区别：冲突时返回 conflict=true 明确标记，便于引导手动解决。
     *
     * @param sourceBranch 要合并到 test 的源分支（feature/hotfix），默认当前分支
     */
    async previewMergeToTest(
        sourceBranch?: string
    ): Promise<{ success: boolean; testBranch: string; conflict?: boolean; error?: string }> {
        const branch = sourceBranch || (await this.getCurrentBranch())
        return this.withActivity(
            'previewMergeToTest',
            `预览合并 ${branch} → test（含推送）`,
            () => this.branchService.previewMergeToTest(branch),
            { snapshot: true, meta: { sourceBranch: branch, targetBranch: 'test' } }
        )
    }

    /**
     * 判断分支是否允许通过命令删除（仅 feature/hotfix）
     */
    async isDeletableBranch(branchName: string): Promise<boolean> {
        return this.branchService.isDeletableBranch(branchName)
    }

    /**
     * 安全删除分支（仅 feature/hotfix，远程 + 本地）
     *
     * 其它分支（master/test/release 等）一律拒绝删除，避免误删受保护分支。
     *
     * @param branchName 要删除的分支（仅 feature/hotfix 允许）
     * @param deleteLocal 是否同时删除本地分支
     * @returns 删除结果（reason: 'protected' 表示受保护分支）
     */
    async deleteDeletableBranch(
        branchName: string,
        deleteLocal = true
    ): Promise<{ success: boolean; error?: string; reason?: 'protected' | 'git' }> {
        return this.branchService.deleteDeletableBranch(branchName, deleteLocal)
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
export { AuthService } from './auth'
export { RemoteService } from './remote'
export { SshRemoteService } from './ssh-remote'
export { BranchService } from './branch'
export { ActivityLog } from './activitylog'
export type { ActionRecord, ActionResult } from './activitylog'
export {
    setupSSH,
    setupMultiAccountSSH,
    troubleshootSSH,
    checkSSHStatus,
    showSSHKey,
    cleanSSH
} from './ssh'
export { getToken, saveToken, ensureToken, oauthLogin, clearToken } from './auth'
export { uploadKey, listKeys, deleteKey, verifyToken } from './ssh-remote'
export { createMR, checkMRExists, listMRs, getProjectId } from './remote'
export {
    parseVersion,
    formatVersion,
    compareVersion,
    getNextVersion,
    getCurrentProjectInfo,
    detectProjectKey,
    getReleaseName,
    getFeatureName,
    getHotfixName,
    getTagName,
    parseBranchInfo,
    getLatestVersionFromRemote,
    hasRemoteBranch,
    hasLocalBranch,
    createAndPushBranch,
    createAndPushTag,
    listTags,
    commitVersionChange,
    deleteRemoteBranch,
    listManagedBranches,
    mergeToTest,
    previewMergeToTest,
    isDeletableBranch,
    deleteDeletableBranch,
    DELETABLE_BRANCH_TYPES,
    TEST_BRANCH
} from './branch'
export type { GitLabToken } from './auth'
export type { MRState, CreateMROptions, MRInfo, CreateMRResult } from './remote'
export type { SSHKeyInfo, UploadKeyResult, VerifyTokenResult } from './types'
export type {
    VersionInfo,
    VersionBumpType,
    ProjectInfo,
    BranchResult,
    BranchInfo,
    BranchType
} from './branch'
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
export {
    setupGitIgnore,
    setupEditorConfig,
    setupProjectConfig,
    generateGitIgnore,
    generateEditorConfig
} from './config'
export type { ConfigSetupOptions } from './types'
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
