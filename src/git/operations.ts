/**
 * Git 核心操作
 *
 * 封装暂存、提交、回滚、分支管理、合并等常用操作
 * 每个操作前自动创建快照，确保可以安全回退
 */

import { gitExec, gitExecOrThrow, gitExecLines, getCurrentBranch, getStagedFiles } from './executor'
import { SnapshotManager } from './backup'
import { checkAndFixLineEndings } from './line-ending'
import { successResult, errorResult } from './result'
import type {
    GitResult,
    StageOptions,
    CommitOptions,
    RollbackOptions,
    FileStatus,
    BranchInfo,
    CommitInfo,
    GitOperation,
    Snapshot
} from './types'

// ==================== 辅助函数 ====================

/** 分支名安全校验 */
const BRANCH_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/
const MAX_BRANCH_NAME_LENGTH = 250

function validateBranchName(name: string): void {
    if (!name || name.length > MAX_BRANCH_NAME_LENGTH) {
        throw new Error('分支名长度无效')
    }
    if (!BRANCH_NAME_PATTERN.test(name)) {
        throw new Error(`无效的分支名: ${name}`)
    }
    // 禁止包含 .. 防止路径遍历
    if (name.includes('..')) {
        throw new Error('分支名包含非法字符')
    }
}

// ==================== Git 操作管理器 ====================

/** 构建 git add 参数；返回 string 表示错误消息 */
function buildStageArgs(all: boolean, files?: string[]): string[] | string {
    if (all) return ['add', '--all']
    if (files && files.length > 0) return ['add', '--', ...files]
    return '请指定要暂存的文件或使用 --all'
}

/**
 * Git 操作管理器
 */
export class GitOperator {
    private snapshotManager: SnapshotManager
    private cwd: string
    private autoBackup: boolean

    constructor(snapshotManager: SnapshotManager, cwd?: string, autoBackup: boolean = true) {
        this.snapshotManager = snapshotManager
        this.cwd = cwd || process.cwd()
        this.autoBackup = autoBackup
    }

    /**
     * 操作前自动备份（完整安全网）
     *
     * 默认保存所有状态：已暂存 + 未暂存 + 未跟踪文件。
     * 确保 AI 操作失误时可以完整恢复。
     */
    private async preBackup(
        operation: GitOperation,
        description?: string
    ): Promise<Snapshot | null> {
        if (!this.autoBackup) return null

        try {
            return await this.snapshotManager.createSnapshot(operation, {
                description: description || `[SAFETY-NET] ${operation} 操作前完整备份`,
                includeUnstaged: true,
                includeUntracked: true // ✅ 默认也保存未跟踪文件
            })
        } catch {
            return null
        }
    }

    // ==================== 状态查询 ====================

    /**
     * 获取工作区状态
     */
    async status(): Promise<GitResult> {
        const startTime = Date.now()

        try {
            // 分别获取分支和文件状态，避免大输出溢出管道
            let branch = ''
            try {
                const branchOutput = await gitExecOrThrow(['rev-parse', '--abbrev-ref', 'HEAD'], {
                    cwd: this.cwd,
                    silent: true
                })
                branch = branchOutput.trim()
            } catch {
                branch = 'unknown'
            }

            const output = await gitExecOrThrow(['status', '--porcelain'], { cwd: this.cwd })

            const lines = output.split('\n').filter(Boolean)
            const files: FileStatus[] = []

            for (const line of lines) {
                const statusCode = line.slice(0, 2)
                const filePath = line.slice(3).trim()

                const statusMap: Record<string, { worktree: string; index: string }> = {
                    'M ': { worktree: 'modified', index: 'unmodified' },
                    ' M': { worktree: 'unmodified', index: 'modified' },
                    MM: { worktree: 'modified', index: 'modified' },
                    'A ': { worktree: 'added', index: 'unmodified' },
                    ' A': { worktree: 'unmodified', index: 'added' },
                    AM: { worktree: 'modified', index: 'added' },
                    'D ': { worktree: 'deleted', index: 'unmodified' },
                    ' D': { worktree: 'unmodified', index: 'deleted' },
                    'R ': { worktree: 'renamed', index: 'unmodified' },
                    ' R': { worktree: 'unmodified', index: 'renamed' },
                    '??': { worktree: 'untracked', index: 'unmodified' },
                    '!!': { worktree: 'unmodified', index: 'unmodified' },
                    UU: { worktree: 'conflict', index: 'conflict' }
                }

                const mapped = statusMap[statusCode]
                if (mapped) {
                    files.push({
                        path: filePath,
                        worktree: mapped.worktree as FileStatus['worktree'],
                        index: mapped.index as FileStatus['index']
                    })
                }
            }

            const summary = {
                branch,
                total: files.length,
                staged: files.filter((f) =>
                    ['staged', 'added', 'deleted', 'renamed'].includes(f.index)
                ).length,
                modified: files.filter((f) => f.worktree === 'modified').length,
                added: files.filter((f) => f.index === 'added' || f.worktree === 'added').length,
                deleted: files.filter((f) => f.worktree === 'deleted' || f.index === 'deleted')
                    .length,
                untracked: files.filter((f) => f.worktree === 'untracked').length,
                conflict: files.filter((f) => f.worktree === 'conflict').length
            }

            return successResult(
                'stage',
                '获取状态成功',
                { branch, files, summary },
                undefined,
                Date.now() - startTime
            )
        } catch (error) {
            return errorResult(
                'stage',
                '获取状态失败',
                (error as Error).message,
                Date.now() - startTime
            )
        }
    }

    // ==================== 暂存操作 ====================

    /**
     * 暂存文件
     */
    async stage(options: StageOptions = {}): Promise<GitResult> {
        const startTime = Date.now()
        const { files, all = false, fixLineEndings = false, lineEnding } = options

        await this.preBackup('stage', files?.length ? `暂存 ${files.join(', ')}` : '暂存所有文件')

        try {
            if (fixLineEndings) {
                const fixResult = await checkAndFixLineEndings(this.cwd, {
                    expected: lineEnding || 'lf',
                    fix: true
                })
                if (!fixResult.success) {
                    return errorResult(
                        'stage',
                        '行尾符修复失败',
                        fixResult.error,
                        Date.now() - startTime
                    )
                }
            }

            const args = buildStageArgs(all, files)
            if (typeof args === 'string') {
                return errorResult('stage', args, 'NO_FILES', Date.now() - startTime)
            }

            await gitExecOrThrow(args, { cwd: this.cwd })
            const stagedFiles = await getStagedFiles(this.cwd)

            return successResult(
                'stage',
                all ? '已暂存所有文件' : `已暂存 ${files?.length || 0} 个文件`,
                { stagedFiles, count: stagedFiles.length },
                undefined,
                Date.now() - startTime
            )
        } catch (error) {
            return errorResult(
                'stage',
                '暂存失败',
                (error as Error).message,
                Date.now() - startTime
            )
        }
    }

    /**
     * 取消暂存
     */
    async unstage(files?: string[]): Promise<GitResult> {
        const startTime = Date.now()

        await this.preBackup(
            'unstage',
            files?.length ? `取消暂存 ${files.join(', ')}` : '取消暂存所有文件'
        )

        try {
            const args: string[] = ['reset', 'HEAD']
            if (files && files.length > 0) {
                args.push('--')
                args.push(...files)
            }

            await gitExecOrThrow(args, { cwd: this.cwd })

            return successResult(
                'unstage',
                files?.length ? `已取消暂存 ${files.length} 个文件` : '已取消暂存所有文件',
                { files },
                undefined,
                Date.now() - startTime
            )
        } catch (error) {
            return errorResult(
                'unstage',
                '取消暂存失败',
                (error as Error).message,
                Date.now() - startTime
            )
        }
    }

    // ==================== 提交操作 ====================

    /**
     * 提交
     */
    async commit(options: CommitOptions): Promise<GitResult> {
        const startTime = Date.now()
        const { message, noVerify = false, amend = false, all = false } = options

        await this.preBackup('commit', message)

        try {
            const args: string[] = ['commit', '-m', message]

            if (noVerify) args.push('--no-verify')
            if (amend) args.push('--amend')
            if (all) args.push('--all')

            const output = await gitExecOrThrow(args, { cwd: this.cwd })

            // 提取提交哈希
            const hashMatch = output.match(/\[[\w-]+\s+([a-f0-9]+)\]/)
            const commitHash = hashMatch ? hashMatch[1] : undefined

            const branch = await getCurrentBranch(this.cwd)

            return successResult(
                'commit',
                `提交成功: ${message}`,
                {
                    branch,
                    hash: commitHash,
                    message,
                    amended: amend
                },
                undefined,
                Date.now() - startTime
            )
        } catch (error) {
            return errorResult(
                'commit',
                '提交失败',
                (error as Error).message,
                Date.now() - startTime
            )
        }
    }

    // ==================== 回滚操作 ====================

    /**
     * 回滚到指定快照
     */
    async rollback(options: RollbackOptions): Promise<GitResult> {
        const startTime = Date.now()
        const { target, mode = 'hard' } = options

        await this.preBackup('rollback', `回滚到 #${target}`)

        try {
            // 先查找快照
            const snapshot = this.snapshotManager.findSnapshot(target)
            if (!snapshot) {
                return errorResult(
                    'rollback',
                    `未找到快照: ${target}`,
                    'SNAPSHOT_NOT_FOUND',
                    Date.now() - startTime
                )
            }

            // 根据模式执行不同的 reset
            let resetMode = '--hard'
            if (mode === 'soft') resetMode = '--soft'
            else if (mode === 'mixed') resetMode = '--mixed'
            if (snapshot.headCommit) {
                await gitExecOrThrow(['reset', resetMode, snapshot.headCommit], { cwd: this.cwd })
            }

            return successResult(
                'rollback',
                `已回滚到快照 #${target} (${mode})`,
                { snapshotIndex: snapshot.index, mode },
                snapshot.id,
                Date.now() - startTime
            )
        } catch (error) {
            return errorResult(
                'rollback',
                '回滚失败',
                (error as Error).message,
                Date.now() - startTime
            )
        }
    }

    /**
     * 回退单个文件的修改
     */
    async revertFile(filePath: string): Promise<GitResult> {
        const startTime = Date.now()

        // 文件路径安全检查
        if (!filePath || filePath.includes('..')) {
            return errorResult('rollback', '无效的文件路径', 'INVALID_PATH', Date.now() - startTime)
        }

        await this.preBackup('rollback', `还原文件 ${filePath}`)

        try {
            await gitExecOrThrow(['checkout', '--', filePath], { cwd: this.cwd })

            return successResult(
                'rollback',
                `已还原文件: ${filePath}`,
                { file: filePath },
                undefined,
                Date.now() - startTime
            )
        } catch (error) {
            return errorResult(
                'rollback',
                `还原文件失败: ${filePath}`,
                (error as Error).message,
                Date.now() - startTime
            )
        }
    }

    // ==================== 分支操作 ====================

    /**
     * 获取分支列表
     */
    async listBranches(includeRemote: boolean = false): Promise<GitResult> {
        const startTime = Date.now()

        try {
            const args = ['branch', '-v', '--no-abbrev']
            if (includeRemote) args.push('--all')

            const output = await gitExecOrThrow(args, { cwd: this.cwd })
            const lines = output.split('\n').filter(Boolean)

            const branches: BranchInfo[] = lines.map((line) => {
                const current = line.startsWith('*')
                const clean = current ? line.slice(1).trim() : line.trim()
                const parts = clean.split(/\s+/)
                const name = parts[0]
                const commit = parts.length > 1 ? parts[1] : ''
                const message = parts.length > 2 ? parts.slice(2).join(' ') : ''

                return {
                    name: name.replace('remotes/', ''),
                    current,
                    remote: name.startsWith('remotes/'),
                    remoteName: name.startsWith('remotes/') ? name.split('/')[1] : undefined,
                    commit,
                    message,
                    date: '',
                    author: ''
                }
            })

            const currentBranch = branches.find((b) => b.current)
            const localBranches = branches.filter((b) => !b.remote)
            const remoteBranches = branches.filter((b) => b.remote)

            return successResult(
                'branch',
                `共 ${branches.length} 个分支`,
                {
                    current: currentBranch?.name,
                    total: branches.length,
                    local: localBranches.length,
                    remote: remoteBranches.length,
                    branches
                },
                undefined,
                Date.now() - startTime
            )
        } catch (error) {
            return errorResult(
                'branch',
                '获取分支列表失败',
                (error as Error).message,
                Date.now() - startTime
            )
        }
    }

    /**
     * 创建分支
     */
    async createBranch(name: string, checkout: boolean = true): Promise<GitResult> {
        const startTime = Date.now()

        validateBranchName(name)

        await this.preBackup('branch', `创建分支 ${name}`)

        try {
            const args = checkout ? ['checkout', '-b', name] : ['branch', name]
            await gitExecOrThrow(args, { cwd: this.cwd })

            return successResult(
                'branch',
                `已创建${checkout ? '并切换到' : ''}分支: ${name}`,
                { branch: name, checkout },
                undefined,
                Date.now() - startTime
            )
        } catch (error) {
            return errorResult(
                'branch',
                '创建分支失败',
                (error as Error).message,
                Date.now() - startTime
            )
        }
    }

    /**
     * 切换分支
     */
    async switchBranch(name: string): Promise<GitResult> {
        const startTime = Date.now()

        validateBranchName(name)

        await this.preBackup('checkout', `切换到分支 ${name}`)

        try {
            await gitExecOrThrow(['checkout', name], { cwd: this.cwd })

            const currentBranch = await getCurrentBranch(this.cwd)

            return successResult(
                'checkout',
                `已切换到分支: ${currentBranch}`,
                { branch: currentBranch },
                undefined,
                Date.now() - startTime
            )
        } catch (error) {
            return errorResult(
                'checkout',
                '切换分支失败',
                (error as Error).message,
                Date.now() - startTime
            )
        }
    }

    /**
     * 删除分支
     */
    async deleteBranch(name: string, force: boolean = false): Promise<GitResult> {
        const startTime = Date.now()

        validateBranchName(name)

        await this.preBackup('branch', `删除分支 ${name}`)

        try {
            const args = ['branch', '-d']
            if (force) args[1] = '-D'
            args.push(name)

            await gitExecOrThrow(args, { cwd: this.cwd })

            return successResult(
                'branch',
                `已删除分支: ${name}`,
                { branch: name },
                undefined,
                Date.now() - startTime
            )
        } catch (error) {
            return errorResult(
                'branch',
                '删除分支失败',
                (error as Error).message,
                Date.now() - startTime
            )
        }
    }

    // ==================== Stash 操作 ====================

    /**
     * 暂存工作区到 stash
     */
    async stash(description?: string, includeUntracked: boolean = false): Promise<GitResult> {
        const startTime = Date.now()

        try {
            const args = ['stash', 'push']
            if (includeUntracked) args.push('--include-untracked')
            if (description) args.push('-m', description)

            await gitExecOrThrow(args, { cwd: this.cwd })

            return successResult(
                'stash',
                `已暂存工作区: ${description || '(无描述)'}`,
                { description, includeUntracked },
                undefined,
                Date.now() - startTime
            )
        } catch (error) {
            return errorResult(
                'stash',
                'Stash 失败',
                (error as Error).message,
                Date.now() - startTime
            )
        }
    }

    /**
     * 恢复 stash
     */
    async stashPop(): Promise<GitResult> {
        const startTime = Date.now()

        try {
            const output = await gitExecOrThrow(['stash', 'pop'], { cwd: this.cwd })

            return successResult(
                'stash',
                '已恢复工作区',
                { raw: output },
                undefined,
                Date.now() - startTime
            )
        } catch (error) {
            return errorResult(
                'stash',
                '恢复 Stash 失败',
                (error as Error).message,
                Date.now() - startTime
            )
        }
    }

    /**
     * 列出所有 stash
     */
    async stashList(): Promise<GitResult> {
        const startTime = Date.now()

        try {
            const lines = await gitExecLines(['stash', 'list'], { cwd: this.cwd })

            const stashItems = lines.map((line) => {
                const match = line.match(/^(stash@\{\d+\}): (.+)$/)
                return match ? { ref: match[1], message: match[2] } : { ref: '', message: line }
            })

            return successResult(
                'stash',
                `共 ${stashItems.length} 个 Stash`,
                { count: stashItems.length, items: stashItems },
                undefined,
                Date.now() - startTime
            )
        } catch (error) {
            return errorResult(
                'stash',
                '获取 Stash 列表失败',
                (error as Error).message,
                Date.now() - startTime
            )
        }
    }

    // ==================== 日志操作 ====================

    /**
     * 获取提交日志
     */
    async log(count: number = 20): Promise<GitResult> {
        const startTime = Date.now()

        try {
            const format = '%H|%h|%an|%ae|%aI|%s|%b|%P|%D'
            const lines = await gitExecLines(['log', `-${count}`, `--format=${format}`], {
                cwd: this.cwd
            })

            const commits: CommitInfo[] = lines.map((line) => {
                const parts = line.split('|')
                return {
                    hash: parts[0] || '',
                    shortHash: parts[1] || '',
                    author: parts[2] || '',
                    email: parts[3] || '',
                    date: parts[4] || '',
                    subject: parts[5] || '',
                    body: parts[6] || '',
                    parents: parts[7] ? parts[7].split(' ') : [],
                    refs: parts[8] ? parts[8].split(', ').filter(Boolean) : []
                }
            })

            // 批量获取提交统计（一次命令获取所有）
            try {
                const statFormat = '===STAT_START===%H===STAT_END==='
                const statOutput = await gitExecOrThrow(
                    ['log', `-${Math.min(count, 20)}`, `--format=${statFormat}`, '--shortstat'],
                    { cwd: this.cwd, silent: true }
                )

                const statBlocks = statOutput.split('===STAT_START===')
                for (const block of statBlocks) {
                    const lines = block.split('\n').filter(Boolean)
                    if (lines.length < 2) continue
                    const hash = lines[0].trim()
                    const statLine = lines[lines.length - 1]
                    const statMatch = statLine.match(
                        /(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?)?(?:,\s+(\d+)\s+deletions?)?/
                    )
                    if (statMatch) {
                        const commit = commits.find((c) => c.hash === hash)
                        if (commit) {
                            commit.stats = {
                                files: parseInt(statMatch[1]) || 0,
                                additions: parseInt(statMatch[2]) || 0,
                                deletions: parseInt(statMatch[3]) || 0
                            }
                        }
                    }
                }
            } catch {
                // 忽略统计获取失败
            }

            return successResult(
                'commit',
                `获取 ${commits.length} 条提交记录`,
                { count: commits.length, commits },
                undefined,
                Date.now() - startTime
            )
        } catch (error) {
            return errorResult(
                'commit',
                '获取日志失败',
                (error as Error).message,
                Date.now() - startTime
            )
        }
    }

    // ==================== 快照快捷操作 ====================

    /**
     * 创建手动快照
     */
    async createManualSnapshot(description: string, tags: string[] = []): Promise<GitResult> {
        const startTime = Date.now()

        try {
            const snapshot = await this.snapshotManager.createSnapshot('backup', {
                description,
                tags,
                includeUnstaged: true
            })

            return successResult(
                'backup',
                `已创建快照 #${snapshot.index}: ${description}`,
                {
                    index: snapshot.index,
                    id: snapshot.id,
                    description: snapshot.description,
                    tags: snapshot.tags,
                    branch: snapshot.branch,
                    headCommit: snapshot.headCommit?.slice(0, 7)
                },
                snapshot.id,
                Date.now() - startTime
            )
        } catch (error) {
            return errorResult(
                'backup',
                '创建快照失败',
                (error as Error).message,
                Date.now() - startTime
            )
        }
    }

    /**
     * 列出所有快照
     */
    listSnapshots(): GitResult {
        const startTime = Date.now()
        const snapshots = this.snapshotManager.listSnapshots()
        const current = this.snapshotManager.getCurrentSnapshot()

        return successResult(
            'backup',
            `共 ${snapshots.length} 个快照`,
            {
                total: snapshots.length,
                current: current ? { index: current.index, id: current.id } : null,
                snapshots: snapshots.map((s) => ({
                    index: s.index,
                    id: s.id,
                    timestamp: s.timestamp,
                    operation: s.operation,
                    description: s.description,
                    branch: s.branch,
                    headCommit: s.headCommit?.slice(0, 7),
                    headMessage: s.headMessage,
                    tags: s.tags,
                    changedFiles: s.changedFiles
                }))
            },
            undefined,
            Date.now() - startTime
        )
    }

    /**
     * 一键恢复到初始状态
     */
    async restoreToIndex(index: number): Promise<GitResult> {
        return this.rollback({ target: index, force: true, mode: 'hard' })
    }

    /**
     * 一键恢复到初始快照
     */
    async restoreToFirst(): Promise<GitResult> {
        return this.restoreToIndex(0)
    }

    /**
     * 一键恢复到上一个快照
     */
    async restoreToPrevious(): Promise<GitResult> {
        const current = this.snapshotManager.getCurrentSnapshot()
        if (!current) {
            return errorResult('restore', '没有快照可恢复', 'NO_SNAPSHOTS')
        }
        const target = Math.max(0, current.index - 1)
        return this.restoreToIndex(target)
    }

    // ==================== 远程同步操作 ====================

    /**
     * 拉取远程代码（git pull）
     */
    async pull(): Promise<GitResult> {
        const startTime = Date.now()
        await this.preBackup('checkout', '拉取远程代码')
        try {
            await gitExecOrThrow(['pull'], { cwd: this.cwd })
            return successResult(
                'checkout',
                '已拉取最新代码',
                undefined,
                undefined,
                Date.now() - startTime
            )
        } catch (error) {
            return errorResult(
                'checkout',
                '拉取代码失败',
                (error as Error).message,
                Date.now() - startTime
            )
        }
    }

    /**
     * 推送当前分支到远程（git push）
     */
    async push(): Promise<GitResult> {
        const startTime = Date.now()
        await this.preBackup('checkout', '推送到远程')
        try {
            await gitExecOrThrow(['push'], { cwd: this.cwd })
            return successResult(
                'checkout',
                '已推送到远程',
                undefined,
                undefined,
                Date.now() - startTime
            )
        } catch (error) {
            return errorResult(
                'checkout',
                '推送失败',
                (error as Error).message,
                Date.now() - startTime
            )
        }
    }

    /**
     * 强制推送当前分支到目标分支
     *
     * @param targetBranch 目标分支名
     */
    async forcePushToBranch(targetBranch: string): Promise<GitResult> {
        const startTime = Date.now()
        validateBranchName(targetBranch)
        await this.preBackup('checkout', `强推到 ${targetBranch}`)

        try {
            const currentBranch = await getCurrentBranch(this.cwd)
            await gitExecOrThrow(['push', 'origin', `${currentBranch}:${targetBranch}`, '-f'], {
                cwd: this.cwd
            })
            return successResult(
                'checkout',
                `已将 ${currentBranch} 强制推送到 ${targetBranch}`,
                { source: currentBranch, target: targetBranch },
                undefined,
                Date.now() - startTime
            )
        } catch (error) {
            return errorResult(
                'checkout',
                '强制推送失败',
                (error as Error).message,
                Date.now() - startTime
            )
        }
    }

    /**
     * 合并分支（带冲突检测）
     *
     * @param branchName 要合并的分支名
     * @returns 含 hasConflict 标志，冲突时不抛异常
     */
    async merge(branchName: string): Promise<GitResult> {
        const startTime = Date.now()
        validateBranchName(branchName)
        await this.preBackup('merge', `合并 ${branchName}`)

        try {
            const r = await gitExec(['merge', branchName], { cwd: this.cwd })
            if (r.success) {
                return successResult(
                    'merge',
                    `已合并 ${branchName}`,
                    { branch: branchName, hasConflict: false },
                    undefined,
                    Date.now() - startTime
                )
            }
            // 检测冲突
            const hasConflict =
                r.stderr.includes('CONFLICT') || r.stderr.includes('Automatic merge failed')
            if (hasConflict) {
                // 有冲突时中止合并，让用户手动处理
                try {
                    await gitExecOrThrow(['merge', '--abort'], { cwd: this.cwd })
                } catch {
                    // 忽略
                }
            }
            return errorResult(
                'merge',
                hasConflict ? '合并存在冲突，请手动解决' : r.stderr || '合并失败',
                hasConflict ? 'CONFLICT' : 'MERGE_FAILED',
                Date.now() - startTime
            )
        } catch (error) {
            return errorResult(
                'merge',
                '合并失败',
                (error as Error).message,
                Date.now() - startTime
            )
        }
    }

    /**
     * 删除远程分支
     *
     * 走 SSH/HTTPS，不需要 API token。
     *
     * @param branchName 远程分支名
     */
    async deleteRemoteBranch(branchName: string): Promise<GitResult> {
        const startTime = Date.now()
        validateBranchName(branchName)
        await this.preBackup('branch', `删除远程分支 ${branchName}`)

        try {
            await gitExecOrThrow(['push', 'origin', '--delete', branchName], { cwd: this.cwd })
            return successResult(
                'branch',
                `已删除远程分支: ${branchName}`,
                { branch: branchName },
                undefined,
                Date.now() - startTime
            )
        } catch (error) {
            return errorResult(
                'branch',
                '删除远程分支失败',
                (error as Error).message,
                Date.now() - startTime
            )
        }
    }

    /**
     * 同步 master 分支到当前分支
     *
     * 流程：stash → checkout master → pull → checkout back → merge master → stash pop
     * 冲突时自动中止合并并提示用户手动处理。
     */
    async syncWithMaster(): Promise<GitResult> {
        const startTime = Date.now()
        const currentBranch = await getCurrentBranch(this.cwd)

        if (currentBranch === 'master') {
            const pullResult = await this.pull()
            return {
                ...pullResult,
                message: pullResult.success ? '已拉取 master 最新代码' : pullResult.message,
                duration: Date.now() - startTime
            }
        }

        await this.preBackup('merge', `同步 master 到 ${currentBranch}`)

        try {
            const didStash = await this.stashChangesIfNeeded()

            await this.switchToMasterAndPull(currentBranch)

            const mergeResult = await gitExec(['merge', 'master'], { cwd: this.cwd })
            if (!mergeResult.success) {
                return this.handleMergeFailure(mergeResult, didStash, startTime)
            }

            if (didStash) await gitExec(['stash', 'pop'], { cwd: this.cwd })

            return successResult(
                'merge',
                `已同步 master 最新代码到 ${currentBranch}`,
                { branch: currentBranch },
                undefined,
                Date.now() - startTime
            )
        } catch (error) {
            return errorResult(
                'merge',
                '同步 master 失败',
                (error as Error).message,
                Date.now() - startTime
            )
        }
    }

    /**
     * 将指定（或当前）分支 rebase 到目标分支
     *
     * 流程：stash → checkout branch → fetch target → rebase target → stash pop
     * 冲突时自动 abort rebase、恢复 stash，返回 CONFLICT 提示用户手动继续；
     * 不自动 force-push（rebase 改写历史，推送需用户显式确认）。
     *
     * @param options.branch 要 rebase 的分支（默认当前分支）
     * @param options.onto   rebase 的目标基准（默认 master）
     */
    async rebase(options: { branch?: string; onto?: string } = {}): Promise<GitResult> {
        const startTime = Date.now()
        const onto = options.onto || 'master'
        validateBranchName(onto)
        const currentBranch = await getCurrentBranch(this.cwd)
        const branch = options.branch || currentBranch

        if (branch === onto) {
            return errorResult(
                'rebase',
                `分支 ${branch} 与目标 ${onto} 相同，无法 rebase`,
                'SAME_BRANCH',
                Date.now() - startTime
            )
        }

        await this.preBackup('rebase', `rebase ${branch} onto ${onto}`)

        const originalBranch = currentBranch
        const didStash = await this.stashChangesIfNeeded()

        let rebaseResult: { success: boolean; message: string; code: string }
        try {
            if (branch !== originalBranch) {
                await gitExecOrThrow(['checkout', branch], { cwd: this.cwd })
            }
            const targetRef = await this.resolveTargetRef(onto)
            rebaseResult = await this.execRebase(targetRef)
        } catch (error) {
            rebaseResult = {
                success: false,
                message: 'rebase 失败',
                code: (error as Error).message
            }
        } finally {
            if (didStash) await this.restoreStash()
            if (branch !== originalBranch) {
                try {
                    await gitExecOrThrow(['checkout', originalBranch], { cwd: this.cwd })
                } catch {
                    // 忽略
                }
            }
        }

        if (!rebaseResult.success) {
            return errorResult(
                'rebase',
                rebaseResult.message,
                rebaseResult.code,
                Date.now() - startTime
            )
        }
        return successResult(
            'rebase',
            `已将 ${branch} rebase 到 ${onto}`,
            { branch, onto },
            undefined,
            Date.now() - startTime
        )
    }

    /** 执行 rebase 并检测冲突；冲突时自动 abort 并返回结构化结果 */
    private async execRebase(
        targetRef: string
    ): Promise<{ success: boolean; message: string; code: string }> {
        const r = await gitExec(['rebase', targetRef], { cwd: this.cwd })
        if (r.success) {
            return { success: true, message: '', code: '' }
        }
        const hasConflict = r.stderr.includes('CONFLICT') || r.stderr.includes('could not apply')
        try {
            await gitExecOrThrow(['rebase', '--abort'], { cwd: this.cwd })
        } catch {
            // 忽略
        }
        if (hasConflict) {
            return {
                success: false,
                message:
                    'Rebase 存在冲突，已中止。请手动: git rebase --continue（解决后）/ git rebase --abort（放弃）',
                code: 'CONFLICT'
            }
        }
        return { success: false, message: r.stderr || 'rebase 失败', code: 'REBASE_FAILED' }
    }

    /** 解析 rebase 目标引用：优先使用远程跟踪分支（确保拿到最新提交） */
    private async resolveTargetRef(onto: string): Promise<string> {
        try {
            const r = await gitExec(['rev-parse', '--verify', `origin/${onto}`], {
                cwd: this.cwd,
                silent: true
            })
            if (r.success && r.stdout.trim()) {
                try {
                    await gitExecOrThrow(['fetch', 'origin', onto], { cwd: this.cwd, silent: true })
                } catch {
                    // 忽略 fetch 失败，回退到已有远程引用
                }
                return `origin/${onto}`
            }
        } catch {
            // 忽略
        }
        return onto
    }

    /** 恢复 stash（pop） */
    private async restoreStash(): Promise<void> {
        await gitExec(['stash', 'pop'], { cwd: this.cwd })
    }

    /** 如果有未提交更改则 stash */
    private async stashChangesIfNeeded(): Promise<boolean> {
        const statusResult = await gitExec(['status', '--porcelain'], { cwd: this.cwd })
        const hasChanges = statusResult.success && statusResult.stdout.trim().length > 0
        if (!hasChanges) return false

        const stashResult = await gitExec(['stash', 'push', '-m', 'auto-sync-master'], {
            cwd: this.cwd
        })
        return stashResult.success && !stashResult.stdout.includes('No local changes')
    }

    /** 切到 master 拉取后切回原分支 */
    private async switchToMasterAndPull(currentBranch: string): Promise<void> {
        await gitExecOrThrow(['checkout', 'master'], { cwd: this.cwd })
        await gitExecOrThrow(['pull'], { cwd: this.cwd })
        await gitExecOrThrow(['checkout', currentBranch], { cwd: this.cwd })
    }

    /** 处理合并失败：检测冲突 → abort → 还原 stash → 返回错误 */
    private async handleMergeFailure(
        mergeResult: { stderr: string },
        didStash: boolean,
        startTime: number
    ): Promise<GitResult> {
        const hasConflict =
            mergeResult.stderr.includes('CONFLICT') ||
            mergeResult.stderr.includes('Automatic merge failed')

        if (hasConflict) {
            try {
                await gitExecOrThrow(['merge', '--abort'], { cwd: this.cwd })
            } catch {
                // 忽略
            }
        }

        if (didStash) await gitExec(['stash', 'pop'], { cwd: this.cwd })

        return errorResult(
            'merge',
            hasConflict
                ? '合并 master 存在冲突，请手动执行: git merge master → 解决冲突 → git add . && git commit'
                : '合并 master 失败',
            hasConflict ? 'CONFLICT' : 'MERGE_FAILED',
            Date.now() - startTime
        )
    }
}

export default GitOperator
