/**
 * Git 差异对比与文件历史
 *
 * 提供代码对比、分支对比、文件历史等功能。
 * 输出结构化数据，针对模型消费优化。
 */

import { gitExecOrThrow, gitExecLines } from './executor'
import type { DiffOptions, DiffHunk, DiffLine, FileChange, CommitInfo, GitResult } from './types'

// ==================== 引用验证 ====================

/** Git 引用安全校验：只允许字母、数字、点、横线、下划线、斜线、~、^ */
const REF_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._/\-~^]*$/

function validateGitRef(ref: string, label: string): void {
    if (!ref || ref.length > 500) {
        throw new Error(`${label} 引用无效`)
    }
    // 允许 HEAD、FETCH_HEAD 等特殊引用
    if (ref === 'HEAD' || ref === 'FETCH_HEAD' || ref === 'ORIG_HEAD' || ref === 'MERGE_HEAD') {
        return
    }
    // 允许 --cached 作为特殊值
    if (ref === '--cached') {
        return
    }
    if (!REF_PATTERN.test(ref)) {
        throw new Error(`${label} 包含非法字符: ${ref}`)
    }
}

function validateFilePath(filePath: string): void {
    if (!filePath || filePath.length > 4096) {
        throw new Error('文件路径无效')
    }
    if (filePath.includes('..')) {
        throw new Error('文件路径包含非法字符: ..')
    }
}

/**
 * 差异对比器
 */
export class DiffViewer {
    private cwd: string

    constructor(cwd?: string) {
        this.cwd = cwd || process.cwd()
    }

    // ==================== 文件差异 ====================

    /**
     * 比较两个版本之间的差异
     * @param fromRef 源引用（commit/branch/tag），为空表示工作区
     * @param toRef 目标引用（commit/branch/tag），为空表示暂存区
     * @param options 差异选项
     */
    async diff(fromRef?: string, toRef?: string, options: DiffOptions = {}): Promise<GitResult> {
        const startTime = Date.now()

        try {
            const args: string[] = ['diff']

            if (options.unified !== undefined) {
                args.push(`-U${options.unified}`)
            } else {
                args.push('-U3') // 默认3行上下文
            }

            if (options.ignoreWhitespace) args.push('--ignore-space-change')
            if (options.nameOnly) args.push('--name-only')
            if (options.stat) args.push('--stat')

            if (fromRef) args.push(fromRef)
            if (toRef) args.push(toRef)
            if (options.filePattern) args.push('--', options.filePattern)

            const output = await gitExecOrThrow(args, { cwd: this.cwd })

            if (options.nameOnly) {
                const files = output.split('\n').filter(Boolean)
                return {
                    success: true,
                    operation: 'stage',
                    message: `${files.length} 个文件有变更`,
                    data: { files, count: files.length },
                    duration: Date.now() - startTime
                }
            }

            // 解析 diff 输出
            const parsed = this.parseDiffOutput(output)
            const stats = this.calculateDiffStats(parsed)

            return {
                success: true,
                operation: 'stage',
                message: this.formatDiffSummary(stats),
                data: {
                    files: parsed.map((f) => ({
                        path: f.path,
                        type: f.type,
                        additions: f.additions,
                        deletions: f.deletions,
                        hunks: f.hunks?.map((h) => ({
                            header: `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`,
                            changes: h.context.filter((l) => l.type !== 'context').length,
                            context: h.context.slice(0, 20) // 限制输出量
                        }))
                    })),
                    stats,
                    rawDiff: output.slice(0, 2000) // 限制原始输出
                },
                duration: Date.now() - startTime,
                summary: {
                    from: fromRef || '工作区',
                    to: toRef || '暂存区',
                    filesChanged: stats.filesChanged,
                    additions: stats.additions,
                    deletions: stats.deletions
                }
            }
        } catch (error) {
            return {
                success: false,
                operation: 'stage',
                message: '获取差异失败',
                error: (error as Error).message,
                duration: Date.now() - startTime
            }
        }
    }

    /**
     * 比较暂存区差异（已暂存 vs HEAD）
     */
    async diffStaged(options: DiffOptions = {}): Promise<GitResult> {
        return this.diff('--cached', undefined, options)
    }

    /**
     * 比较工作区差异（工作区 vs 暂存区）
     */
    async diffWorktree(options: DiffOptions = {}): Promise<GitResult> {
        return this.diff(undefined, undefined, options)
    }

    /**
     * 比较单个文件的差异
     */
    async diffFile(filePath: string, fromRef?: string, toRef?: string): Promise<GitResult> {
        const startTime = Date.now()

        validateFilePath(filePath)
        if (fromRef) validateGitRef(fromRef, 'fromRef')
        if (toRef) validateGitRef(toRef, 'toRef')

        try {
            const args: string[] = ['diff', '-U5']
            if (fromRef) args.push(fromRef)
            if (toRef) args.push(toRef)
            args.push('--', filePath)

            const output = await gitExecOrThrow(args, { cwd: this.cwd })
            const parsed = this.parseDiffOutput(output)

            if (parsed.length === 0) {
                return {
                    success: true,
                    operation: 'stage',
                    message: `文件 ${filePath} 无变更`,
                    data: { file: filePath, hasChanges: false },
                    duration: Date.now() - startTime
                }
            }

            const fileChange = parsed[0]

            // 按块组织输出
            const hunks = (fileChange.hunks || []).map((hunk) => {
                const contextLines = hunk.context.map((line) => ({
                    type: line.type,
                    oldLine: line.oldLine,
                    newLine: line.newLine,
                    content: line.content
                }))

                return {
                    header: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
                    lines: contextLines,
                    addedLines: contextLines.filter((l) => l.type === 'added').length,
                    removedLines: contextLines.filter((l) => l.type === 'removed').length
                }
            })

            return {
                success: true,
                operation: 'stage',
                message: `文件 ${filePath}: +${fileChange.additions} -${fileChange.deletions}`,
                data: {
                    file: filePath,
                    type: fileChange.type,
                    additions: fileChange.additions,
                    deletions: fileChange.deletions,
                    hunks
                },
                duration: Date.now() - startTime,
                summary: {
                    file: filePath,
                    additions: fileChange.additions,
                    deletions: fileChange.deletions,
                    hunksCount: hunks.length
                }
            }
        } catch (error) {
            return {
                success: false,
                operation: 'stage',
                message: `获取文件差异失败: ${filePath}`,
                error: (error as Error).message,
                duration: Date.now() - startTime
            }
        }
    }

    // ==================== 分支差异 ====================

    /**
     * 比较两个分支的差异
     */
    async diffBranches(sourceBranch: string, targetBranch: string): Promise<GitResult> {
        const startTime = Date.now()

        validateGitRef(sourceBranch, '源分支')
        validateGitRef(targetBranch, '目标分支')

        try {
            // 获取超前和落后的提交
            const aheadOutput = await gitExecOrThrow(
                [
                    'log',
                    `${targetBranch}..${sourceBranch}`,
                    '--format=%H|%h|%an|%ae|%aI|%s|%P|%D',
                    '--no-merges'
                ],
                { cwd: this.cwd, silent: true }
            )
            const behindOutput = await gitExecOrThrow(
                [
                    'log',
                    `${sourceBranch}..${targetBranch}`,
                    '--format=%H|%h|%an|%ae|%aI|%s|%P|%D',
                    '--no-merges'
                ],
                { cwd: this.cwd, silent: true }
            )

            const parseCommits = (output: string): CommitInfo[] =>
                output
                    .split('\n')
                    .filter(Boolean)
                    .map((line) => {
                        const parts = line.split('|')
                        return {
                            hash: parts[0] || '',
                            shortHash: parts[1] || '',
                            author: parts[2] || '',
                            email: parts[3] || '',
                            date: parts[4] || '',
                            subject: parts[5] || '',
                            body: '',
                            parents: parts[6] ? parts[6].split(' ') : [],
                            refs: parts[7] ? parts[7].split(', ').filter(Boolean) : []
                        }
                    })

            const ahead = parseCommits(aheadOutput)
            const behind = parseCommits(behindOutput)

            // 获取文件变更
            const diffOutput = await gitExecOrThrow(
                ['diff', '--stat', `${targetBranch}...${sourceBranch}`],
                { cwd: this.cwd, silent: true }
            )
            const fileLines = diffOutput.split('\n').filter(Boolean)
            const statLine = fileLines.pop() || ''
            const statMatch = statLine.match(
                /(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?)?(?:,\s+(\d+)\s+deletions?)?/
            )

            const stats = {
                commitsAhead: ahead.length,
                commitsBehind: behind.length,
                filesChanged: statMatch ? parseInt(statMatch[1]) : 0,
                additions: statMatch && statMatch[2] ? parseInt(statMatch[2]) : 0,
                deletions: statMatch && statMatch[3] ? parseInt(statMatch[3]) : 0
            }

            return {
                success: true,
                operation: 'branch',
                message: `${sourceBranch} 比 ${targetBranch} 超前 ${ahead.length} 个提交，落后 ${behind.length} 个提交`,
                data: {
                    source: sourceBranch,
                    target: targetBranch,
                    ahead: ahead.map((c) => ({
                        hash: c.shortHash,
                        author: c.author,
                        date: c.date,
                        subject: c.subject
                    })),
                    behind: behind.map((c) => ({
                        hash: c.shortHash,
                        author: c.author,
                        date: c.date,
                        subject: c.subject
                    })),
                    stats
                },
                duration: Date.now() - startTime,
                summary: stats
            }
        } catch (error) {
            return {
                success: false,
                operation: 'branch',
                message: '获取分支差异失败',
                error: (error as Error).message,
                duration: Date.now() - startTime
            }
        }
    }

    // ==================== 文件历史 ====================

    /**
     * 获取文件历史
     */
    async fileHistory(filePath: string, count: number = 20): Promise<GitResult> {
        const startTime = Date.now()

        validateFilePath(filePath)

        try {
            const format = '%H|%h|%an|%ae|%aI|%s|%P'
            const lines = await gitExecLines(
                ['log', `-${count}`, `--format=${format}`, '--follow', '--', filePath],
                { cwd: this.cwd }
            )

            const commits: CommitInfo[] = lines.map((line) => {
                const parts = line.split('|')
                return {
                    hash: parts[0] || '',
                    shortHash: parts[1] || '',
                    author: parts[2] || '',
                    email: parts[3] || '',
                    date: parts[4] || '',
                    subject: parts[5] || '',
                    body: '',
                    parents: parts[6] ? parts[6].split(' ') : [],
                    refs: []
                }
            })

            // 批量获取每次提交对该文件的变更统计（使用 --format 一次性获取）
            const changes: { commit: string; stats: { additions: number; deletions: number } }[] =
                []

            const targetCommits = commits.slice(0, 10)
            if (targetCommits.length > 0) {
                try {
                    const statFormat = '===COMMIT===%h===STAT==='
                    const statOutput = await gitExecOrThrow(
                        [
                            'log',
                            `-${targetCommits.length}`,
                            `--format=${statFormat}`,
                            '--shortstat',
                            '--follow',
                            '--',
                            filePath
                        ],
                        { cwd: this.cwd, silent: true }
                    )

                    const blocks = statOutput.split('===COMMIT===')
                    for (const block of blocks) {
                        const blockLines = block.split('\n').filter(Boolean)
                        if (blockLines.length < 2) continue
                        const hash = blockLines[0].trim()
                        // shortstat 在最后一行
                        const statLine = blockLines[blockLines.length - 1]
                        const statMatch = statLine.match(
                            /(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?)?(?:,\s+(\d+)\s+deletions?)?/
                        )
                        if (statMatch) {
                            changes.push({
                                commit: hash,
                                stats: {
                                    additions: parseInt(statMatch[2]) || 0,
                                    deletions: parseInt(statMatch[3]) || 0
                                }
                            })
                        }
                    }
                } catch {
                    // 忽略统计获取失败
                }
            }

            return {
                success: true,
                operation: 'stage',
                message: `文件 ${filePath} 共 ${commits.length} 条历史记录`,
                data: {
                    file: filePath,
                    totalCommits: commits.length,
                    commits: commits.map((c) => ({
                        hash: c.shortHash,
                        author: c.author,
                        date: c.date,
                        subject: c.subject
                    })),
                    changes
                },
                duration: Date.now() - startTime,
                summary: {
                    file: filePath,
                    totalCommits: commits.length,
                    recentChanges: changes.slice(0, 5)
                }
            }
        } catch (error) {
            return {
                success: false,
                operation: 'stage',
                message: `获取文件历史失败: ${filePath}`,
                error: (error as Error).message,
                duration: Date.now() - startTime
            }
        }
    }

    /**
     * 比较某个文件在两个提交之间的差异
     */
    async fileDiffBetween(
        filePath: string,
        oldCommit: string,
        newCommit: string
    ): Promise<GitResult> {
        const startTime = Date.now()

        validateFilePath(filePath)
        validateGitRef(oldCommit, '旧提交')
        validateGitRef(newCommit, '新提交')

        try {
            const args = ['diff', '-U5', oldCommit, newCommit, '--', filePath]
            const output = await gitExecOrThrow(args, { cwd: this.cwd })
            const parsed = this.parseDiffOutput(output)

            return {
                success: true,
                operation: 'stage',
                message: `文件 ${filePath} ${oldCommit.slice(0, 7)}..${newCommit.slice(0, 7)}`,
                data: {
                    file: filePath,
                    oldCommit: oldCommit.slice(0, 7),
                    newCommit: newCommit.slice(0, 7),
                    changes: parsed[0] || null
                },
                duration: Date.now() - startTime
            }
        } catch (error) {
            return {
                success: false,
                operation: 'stage',
                message: '获取文件差异失败',
                error: (error as Error).message,
                duration: Date.now() - startTime
            }
        }
    }

    // ==================== 私有方法 ====================

    /**
     * 解析 git diff 输出
     */
    private parseDiffOutput(output: string): FileChange[] {
        const files: FileChange[] = []
        const lines = output.split('\n')

        let currentFile: FileChange | null = null
        let currentHunk: DiffHunk | null = null
        let oldLineNum = 0
        let newLineNum = 0

        for (const line of lines) {
            // 文件头：diff --git a/path b/path
            const fileMatch = line.match(/^diff --git a\/(.+) b\/(.+)/)
            if (fileMatch) {
                if (currentFile) files.push(currentFile)

                currentFile = {
                    path: fileMatch[2],
                    type: 'modified',
                    additions: 0,
                    deletions: 0,
                    hunks: []
                }
                currentHunk = null
                continue
            }

            // 新增/删除文件
            const newFileMatch = line.match(/^new file mode/)
            const deletedFileMatch = line.match(/^deleted file mode/)
            const renamedMatch = line.match(/^rename from (.+)/)

            if (newFileMatch && currentFile) {
                currentFile.type = 'added'
            }
            if (deletedFileMatch && currentFile) {
                currentFile.type = 'deleted'
            }
            if (renamedMatch && currentFile) {
                currentFile.type = 'renamed'
                currentFile.oldPath = renamedMatch[1]
            }

            // 块头：@@ -oldStart,oldLines +newStart,newLines @@
            const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
            if (hunkMatch && currentFile) {
                currentHunk = {
                    oldStart: parseInt(hunkMatch[1]),
                    oldLines: parseInt(hunkMatch[2] || '1'),
                    newStart: parseInt(hunkMatch[3]),
                    newLines: parseInt(hunkMatch[4] || '1'),
                    context: []
                }
                currentFile.hunks = currentFile.hunks || []
                currentFile.hunks.push(currentHunk)
                oldLineNum = currentHunk.oldStart
                newLineNum = currentHunk.newStart
                continue
            }

            // 差异行
            if (currentFile && currentHunk) {
                let diffLine: DiffLine | null = null

                if (line.startsWith('+') && !line.startsWith('+++')) {
                    diffLine = {
                        type: 'added',
                        newLine: newLineNum++,
                        content: line.slice(1)
                    }
                    currentFile.additions++
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                    diffLine = {
                        type: 'removed',
                        oldLine: oldLineNum++,
                        content: line.slice(1)
                    }
                    currentFile.deletions++
                } else if (
                    !line.startsWith('\\') &&
                    !line.startsWith('index ') &&
                    !line.startsWith('---') &&
                    !line.startsWith('+++')
                ) {
                    diffLine = {
                        type: 'context',
                        oldLine: oldLineNum++,
                        newLine: newLineNum++,
                        content: line.startsWith(' ') ? line.slice(1) : line
                    }
                }

                if (diffLine) {
                    currentHunk.context.push(diffLine)
                }
            }
        }

        if (currentFile) files.push(currentFile)

        return files
    }

    /**
     * 计算差异统计
     */
    private calculateDiffStats(files: FileChange[]): {
        filesChanged: number
        additions: number
        deletions: number
    } {
        return {
            filesChanged: files.length,
            additions: files.reduce((sum, f) => sum + f.additions, 0),
            deletions: files.reduce((sum, f) => sum + f.deletions, 0)
        }
    }

    /**
     * 格式化差异摘要
     */
    private formatDiffSummary(stats: {
        filesChanged: number
        additions: number
        deletions: number
    }): string {
        const parts: string[] = []
        if (stats.filesChanged > 0) parts.push(`${stats.filesChanged} 个文件变更`)
        if (stats.additions > 0) parts.push(`+${stats.additions}`)
        if (stats.deletions > 0) parts.push(`-${stats.deletions}`)
        return parts.join(', ') || '无变更'
    }
}

export default DiffViewer
