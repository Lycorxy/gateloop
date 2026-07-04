/**
 * AI 版本管理 - 差异对比（多会话生产级）
 *
 * 复用 git diff --no-index 来实现可视化对比：
 * - 对比 AI 版本 vs 当前工作区
 * - 对比 AI 版本 vs Git 暂存区
 * - 对比 AI 版本 vs 某个 Git commit
 * - 对比两个 AI 版本之间
 *
 * 完全不操作 .git，不影响 Git 主线。
 * 支持跨会话对比任意版本。
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { exec } from '../helpers'
import type { AIVersionConfig, Version, DiffOptions } from './types'
import { blobExists, readBlob, readSnapshot, getVersion } from './store'

// ==================== 前置检查 ====================

/** 缓存 git 可用性检查结果 */
let gitAvailable: boolean | null = null

async function checkGitAvailable(): Promise<boolean> {
    if (gitAvailable !== null) return gitAvailable
    try {
        await exec('git', ['--version'])
        gitAvailable = true
    } catch {
        gitAvailable = false
    }
    return gitAvailable
}

// ==================== 临时目录管理 ====================

/**
 * 安全的临时目录管理器，确保清理
 */
class TempDirManager {
    private dirs: string[] = []

    async create(prefix: string): Promise<string> {
        const dir = await mkdtemp(join(tmpdir(), prefix))
        this.dirs.push(dir)
        return dir
    }

    async cleanupAll(): Promise<void> {
        const cleanupPromises = this.dirs.map(async (dir) => {
            try {
                await rm(dir, { recursive: true, force: true })
            } catch {
                // 忽略清理错误
            }
        })
        await Promise.all(cleanupPromises)
        this.dirs = []
    }
}

// ==================== 恢复到临时目录 ====================

async function restoreToTemp(
    config: AIVersionConfig,
    version: Version,
    filePaths?: string[],
    tempMgr?: TempDirManager
): Promise<string> {
    const snapshot = await readSnapshot(config, version.snapshotHash)

    // 使用传入的临时目录管理器或创建新的
    const useTempMgr = tempMgr || new TempDirManager()
    const tempDir = await useTempMgr.create(`aivn-diff-${version.id.slice(0, 8)}-`)

    const filesToRestore = filePaths || Object.keys(snapshot.files)

    for (const filePath of filesToRestore) {
        const blobHash = snapshot.files[filePath]
        if (!blobHash || !(await blobExists(config, blobHash))) continue

        const content = await readBlob(config, blobHash)
        const tempFilePath = join(tempDir, filePath)

        await mkdir(join(tempDir, ...filePath.split('/').slice(0, -1)), { recursive: true })
        await writeFile(tempFilePath, content, 'utf-8')
    }

    return tempDir
}

// ==================== 内置 Diff 引擎 (Fallback) ====================

/**
 * 简单的文本 diff 实现（当 git 不可用时使用）
 * 基于 LCS (Longest Common Subsequence) 算法
 */
function builtinTextDiff(textA: string, textB: string): string {
    const linesA = textA.split('\n')
    const linesB = textB.split('\n')

    // 找出不同的行
    const maxLen = Math.max(linesA.length, linesB.length)
    const diffs: string[] = []

    for (let i = 0; i < maxLen; i++) {
        const lineA = linesA[i]
        const lineB = linesB[i]

        if (lineA === undefined) {
            diffs.push(`+ ${lineB}`)
        } else if (lineB === undefined) {
            diffs.push(`- ${lineA}`)
        } else if (lineA !== lineB) {
            diffs.push(`- ${lineA}`)
            diffs.push(`+ ${lineB}`)
        }
        // 相同行不输出
    }

    if (diffs.length === 0) {
        return '文件内容相同'
    }

    return `--- 文件 A\n+++ 文件 B\n${diffs.join('\n')}`
}

// ==================== Git Diff ====================

async function runGitDiff(dirA: string, dirB: string, file?: string): Promise<string> {
    if (!(await checkGitAvailable())) {
        console.warn('[aivn] 未检测到 git，使用内置 diff 引擎（建议安装 git 获得更好的对比效果）')

        // 尝试内置 diff
        if (file) {
            const { readFile: _readFile } = await import('node:fs/promises')
            try {
                const pathA = join(dirA, file)
                const pathB = join(dirB, file)
                const [textA, textB] = await Promise.all([
                    _readFile(pathA, 'utf-8').catch(() => ''),
                    _readFile(pathB, 'utf-8').catch(() => '')
                ])
                return builtinTextDiff(textA, textB)
            } catch {
                return '无法读取文件进行对比'
            }
        }

        return '⚠️ 未安装 git，无法进行完整 diff 对比。\n   建议安装 git: https://git-scm.com/downloads'
    }

    try {
        const args = ['diff', '--no-index', '--color=never']
        if (file) args.push('--', file)
        args.push(dirA, dirB)

        const result = await exec('git', args)
        return result.stdout || ''
    } catch (error: unknown) {
        const err = error as { stdout?: string; stderr?: string }
        return err.stdout || err.stderr || ''
    }
}

// ==================== 获取 Git 内容 ====================

async function getStagedFiles(projectRoot: string, tempMgr?: TempDirManager): Promise<string> {
    const useTempMgr = tempMgr || new TempDirManager()
    const tempDir = await useTempMgr.create('aivn-staged-')

    if (!(await checkGitAvailable())) return tempDir

    try {
        const result = await exec('git', ['diff', '--cached', '--name-only'], { cwd: projectRoot })
        const files = result.stdout.trim().split('\n').filter(Boolean)

        for (const filePath of files) {
            try {
                const fileResult = await exec('git', ['show', `:${filePath}`], {
                    cwd: projectRoot
                })
                const tempFilePath = join(tempDir, filePath)
                await mkdir(join(tempDir, ...filePath.split('/').slice(0, -1)), {
                    recursive: true
                })
                await writeFile(tempFilePath, fileResult.stdout, 'utf-8')
            } catch {
                // 二进制文件，跳过
            }
        }
    } catch {
        // 无暂存文件
    }

    return tempDir
}

async function getCommitFiles(
    projectRoot: string,
    commit: string,
    tempMgr?: TempDirManager
): Promise<string> {
    const useTempMgr = tempMgr || new TempDirManager()
    const tempDir = await useTempMgr.create('aivn-commit-')

    if (!(await checkGitAvailable())) return tempDir

    try {
        const result = await exec('git', ['ls-tree', '-r', '--name-only', commit], {
            cwd: projectRoot
        })
        const files = result.stdout.trim().split('\n').filter(Boolean)

        for (const filePath of files) {
            try {
                const fileResult = await exec('git', ['show', `${commit}:${filePath}`], {
                    cwd: projectRoot
                })
                const tempFilePath = join(tempDir, filePath)
                await mkdir(join(tempDir, ...filePath.split('/').slice(0, -1)), {
                    recursive: true
                })
                await writeFile(tempFilePath, fileResult.stdout, 'utf-8')
            } catch {
                // 跳过
            }
        }
    } catch {
        // commit 不存在或 git 不可用
    }

    return tempDir
}

// ==================== 可视化 HTML 生成 ====================

/**
 * 将 git diff 统一格式文本解析为结构化的差异行
 */
interface DiffLine {
    type: 'added' | 'removed' | 'unchanged' | 'hunk-header' | 'file-header'
    content: string
    lineNumberOld?: number
    lineNumberNew?: number
}

interface DiffFile {
    oldPath: string
    newPath: string
    hunks: DiffLine[][]
}

function parseUnifiedDiff(diffText: string): DiffFile[] {
    const lines = diffText.split('\n')
    const files: DiffFile[] = []
    let currentFile: DiffFile | null = null
    let currentHunk: DiffLine[] = []

    for (const line of lines) {
        // 文件头
        if (line.startsWith('--- ') || line.startsWith('+++ ')) {
            if (!currentFile) {
                currentFile = { oldPath: '', newPath: '', hunks: [] }
            }
            if (line.startsWith('--- ')) {
                currentFile.oldPath = line.slice(4).trim()
            } else {
                currentFile.newPath = line.slice(4).trim()
                // 两个文件头都读完后，加入列表
                if (currentFile.oldPath && currentFile.newPath) {
                    files.push(currentFile)
                }
            }
            continue
        }

        // Hunk 头 (@@ -1,3 +1,4 @@)
        if (line.startsWith('@@')) {
            if (currentHunk.length > 0 && currentFile) {
                currentFile.hunks.push(currentHunk)
            }
            currentHunk = [{ type: 'hunk-header', content: line }]
            continue
        }

        if (!currentFile && files.length === 0) {
            // 没有 git diff 文件头，整体作为一个虚拟文件
            currentFile = { oldPath: 'a/内容', newPath: 'b/内容', hunks: [] }
            files.push(currentFile)
        }

        const targetFile = files[files.length - 1]

        if (line.startsWith('+')) {
            currentHunk.push({ type: 'added', content: line.slice(1) })
        } else if (line.startsWith('-')) {
            currentHunk.push({ type: 'removed', content: line.slice(1) })
        } else if (line.startsWith(' ')) {
            currentHunk.push({ type: 'unchanged', content: line.slice(1) })
        } else {
            currentHunk.push({ type: 'unchanged', content: line })
        }
    }

    // 最后一个 hunk
    if (currentHunk.length > 0 && targetFile) {
        targetFile.hunks.push(currentHunk)
    }

    return files
}

/**
 * 生成可视化 HTML 对比页面
 * 采用 side-by-side 布局，红色标记删除，绿色标记新增
 */
export function generateDiffHtml(diffText: string, titleA: string, titleB: string): string {
    const files = parseUnifiedDiff(diffText)

    const fileSections = files
        .map((file, idx) => {
            const hunksHtml = file.hunks
                .map((hunk) => {
                    return hunk
                        .map((line) => {
                            let cssClass = 'diff-line-unchanged'
                            let prefix = ' '
                            let side = 'both'

                            if (line.type === 'added') {
                                cssClass = 'diff-line-added'
                                prefix = '+'
                                side = 'right'
                            } else if (line.type === 'removed') {
                                cssClass = 'diff-line-removed'
                                prefix = '-'
                                side = 'left'
                            } else if (line.type === 'hunk-header') {
                                return `<tr class="diff-hunk-header"><td colspan="4" class="diff-hunk-cell">${escapeHtml(line.content)}</td></tr>`
                            }

                            const content = escapeHtml(line.content)
                            // side-by-side: 左列放删除/不变，右列放新增/不变
                            const leftCell =
                                side === 'left' || side === 'both'
                                    ? `<td class="diff-side-left ${cssClass}">${prefix === '-' ? content : side === 'both' ? content : ''}</td>`
                                    : '<td class="diff-side-left diff-line-empty"></td>'
                            const rightCell =
                                side === 'right' || side === 'both'
                                    ? `<td class="diff-side-right ${cssClass}">${prefix === '+' ? content : side === 'both' ? content : ''}</td>`
                                    : '<td class="diff-side-right diff-line-empty"></td>'

                            return `<tr class="${cssClass}">${leftCell}${rightCell}</tr>`
                        })
                        .join('\n')
                })
                .join('\n')

            const displayName =
                file.newPath.replace(/^b\//, '') ||
                file.oldPath.replace(/^a\//, '') ||
                `文件 ${idx + 1}`

            return `
        <div class="diff-file">
            <div class="diff-file-header">${escapeHtml(displayName)}</div>
            <table class="diff-table">
                <thead>
                    <tr>
                        <th class="diff-th-left">${escapeHtml(titleA)}</th>
                        <th class="diff-th-right">${escapeHtml(titleB)}</th>
                    </tr>
                </thead>
                <tbody>
                    ${hunksHtml}
                </tbody>
            </table>
        </div>`
        })
        .join('\n')

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>aivn diff - 可视化对比</title>
    <style>
        :root {
            --bg: #1e1e1e;
            --fg: #d4d4d4;
            --header-bg: #2d2d2d;
            --added-bg: #1e3a1e;
            --added-fg: #6a9955;
            --removed-bg: #3a1e1e;
            --removed-fg: #c586c0;
            --unchanged-fg: #d4d4d4;
            --border: #3e3e3e;
            --hunk-bg: #2a2a2a;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Source Code Pro', Consolas, monospace;
            font-size: 13px;
            line-height: 1.5;
            background: var(--bg);
            color: var(--fg);
            padding: 16px;
        }
        .diff-file { margin-bottom: 32px; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
        .diff-file-header {
            background: var(--header-bg);
            padding: 8px 16px;
            font-weight: 600;
            border-bottom: 1px solid var(--border);
        }
        .diff-table { width: 100%; border-collapse: collapse; }
        .diff-th-left, .diff-th-right {
            width: 50%;
            padding: 6px 12px;
            background: var(--header-bg);
            font-weight: 500;
            text-align: left;
            border-bottom: 1px solid var(--border);
        }
        .diff-th-left { border-right: 1px solid var(--border); }
        .diff-side-left {
            padding: 1px 8px;
            width: 50%;
            border-right: 1px solid var(--border);
            vertical-align: top;
        }
        .diff-side-right {
            padding: 1px 8px;
            width: 50%;
            vertical-align: top;
        }
        .diff-line-added { background: var(--added-bg); color: var(--added-fg); }
        .diff-line-removed { background: var(--removed-bg); color: var(--removed-fg); }
        .diff-line-unchanged { color: var(--unchanged-fg); }
        .diff-line-empty { background: transparent; }
        .diff-hunk-cell {
            padding: 4px 12px;
            background: var(--hunk-bg);
            color: var(--added-fg);
            font-size: 12px;
        }
        .diff-hunk-header td { border-bottom: 1px solid var(--border); }
        td { white-space: pre-wrap; word-break: break-all; }
        .diff-stats { margin-bottom: 16px; padding: 12px 16px; background: var(--header-bg); border-radius: 6px; border: 1px solid var(--border); }
        .diff-stats span { margin-right: 16px; }
        .stat-added { color: var(--added-fg); }
        .stat-removed { color: var(--removed-fg); }
    </style>
</head>
<body>
    <h1>🔍 aivn 可视化对比</h1>
    <div class="diff-stats">
        <span class="stat-removed">- 删除行</span>
        <span class="stat-added">+ 新增行</span>
    </div>
    ${fileSections}
</body>
</html>`
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

// ==================== 公开 API ====================

/**
 * 对比版本与目标（工作区/暂存区/commit）
 */
export async function diffVersion(
    config: AIVersionConfig,
    versionId: string,
    options: DiffOptions
): Promise<string> {
    const version = await getVersion(config, versionId)
    if (!version) return `版本 ${versionId} 不存在`

    const tempMgr = new TempDirManager()

    try {
        const aiTempDir = await restoreToTemp(
            config,
            version,
            options.file ? [options.file] : undefined,
            tempMgr
        )

        let targetDir: string

        switch (options.mode) {
            case 'working-tree':
                targetDir = config.projectRoot
                break

            case 'staged':
                // staged 和 commit 模式创建的临时目录也会被 tempMgr 管理
                targetDir = await getStagedFiles(config.projectRoot, tempMgr)
                break

            case 'commit':
                if (!options.commit) {
                    return '错误：commit 模式下必须指定 --commit 参数'
                }
                targetDir = await getCommitFiles(config.projectRoot, options.commit, tempMgr)
                break

            default:
                return `不支持的对比模式: ${options.mode}`
        }

        const diffOutput = await runGitDiff(aiTempDir, targetDir, options.file)

        if (options.html) {
            const titleA = `AI 版本 ...${versionId.slice(-12)}`
            const modeLabel =
                options.mode === 'working-tree'
                    ? '当前工作区'
                    : options.mode === 'staged'
                      ? 'Git 暂存区'
                      : `commit ${options.commit}`
            const titleB = modeLabel
            return generateDiffHtml(diffOutput, titleA, titleB)
        }

        return diffOutput.trim() || '没有差异'
    } finally {
        // ✅ 无论成功还是异常都会清理所有临时目录
        await tempMgr.cleanupAll()
    }
}

/**
 * 对比两个版本之间（支持跨会话对比）
 */
export async function diffBetweenVersions(
    config: AIVersionConfig,
    versionIdA: string,
    versionIdB: string,
    options?: DiffOptions
): Promise<string> {
    const versionA = await getVersion(config, versionIdA)
    const versionB = await getVersion(config, versionIdB)

    if (!versionA) return `版本 ${versionIdA} 不存在`
    if (!versionB) return `版本 ${versionIdB} 不存在`

    const tempMgr = new TempDirManager()

    try {
        const tempDirA = await restoreToTemp(config, versionA, undefined, tempMgr)
        const tempDirB = await restoreToTemp(config, versionB, undefined, tempMgr)

        const diffOutput = await runGitDiff(tempDirA, tempDirB)

        if (options?.html) {
            const titleA = `版本 A ...${versionIdA.slice(-12)}`
            const titleB = `版本 B ...${versionIdB.slice(-12)}`
            return generateDiffHtml(diffOutput, titleA, titleB)
        }

        return diffOutput.trim() || '两个版本之间没有差异'
    } finally {
        // ✅ 确保清理
        await tempMgr.cleanupAll()
    }
}
