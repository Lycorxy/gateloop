/**
 * AI 版本管理 - 快照引擎（多会话生产级）
 *
 * 负责：
 * 1. 自动检测工作区文件变更（基于上一个版本的快照对比）
 * 2. 创建快照（只记录变化的文件，自动关联到当前会话）
 * 3. 从快照恢复文件到工作区
 *
 * 多会话支持：
 * - 每个会话有独立的版本链和 HEAD
 * - saveSnapshot 自动关联到当前会话
 * - 支持恢复任意会话的任意版本
 */

import { open } from 'node:fs/promises'
import { readFile, readdir, mkdir as fsMkdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { exists } from '../helpers'
import type { AIVersionConfig, FileChange, Snapshot, Version } from './types'
import {
    blobExists,
    createVersion,
    getSessionHeadVersion,
    readBlob,
    readSnapshot,
    storeBlob,
    getCurrentSessionId
} from './store'

// ==================== 忽略规则（复用 .gitignore）====================

/** 内置强制忽略（不受 .gitignore 影响） */
const ALWAYS_IGNORE = ['.git', '.aivnsions']

/** 从项目根目录 .gitignore 解析规则，返回路径判断函数 */
async function loadGitIgnoreRules(projectRoot: string): Promise<(relPath: string) => boolean> {
    const patterns: { pattern: string; isDir: boolean }[] = []
    try {
        const content = await readFile(join(projectRoot, '.gitignore'), 'utf-8')
        for (let line of content.split('\n')) {
            line = line.trim()
            if (!line || line.startsWith('#') || line.startsWith('!')) continue
            const isDir = line.endsWith('/')
            if (isDir) line = line.slice(0, -1)
            line = line.replace(/^\/+/, '').replace(/\/+$/, '')
            if (line) patterns.push({ pattern: line, isDir })
        }
    } catch {
        /* .gitignore 不存在，仅用强制规则 */
    }

    return (relPath: string): boolean => {
        const p = relPath.replace(/\\/g, '/')
        // 强制忽略
        for (const fi of ALWAYS_IGNORE) {
            if (p === fi || p.startsWith(fi + '/')) return true
        }
        // 匹配 .gitignore 规则
        for (const { pattern, isDir } of patterns) {
            if (isDir) {
                if (p === pattern || p.startsWith(pattern + '/')) return true
                continue
            }
            // glob → regex
            const re = new RegExp(
                '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
                'i'
            )
            for (let i = 0; i < p.split('/').length; i++) {
                if (re.test(p.split('/').slice(i).join('/'))) return true
            }
        }
        return false
    }
}

/** 缓存：避免每次扫描都重新解析 .gitignore */
let _ignoreFn: ((p: string) => boolean) | null = null
let _ignoreRoot: string | null = null

async function getIgnore(projectRoot: string): Promise<(p: string) => boolean> {
    if (_ignoreFn && _ignoreRoot === projectRoot) return _ignoreFn
    _ignoreFn = await loadGitIgnoreRules(projectRoot)
    _ignoreRoot = projectRoot
    return _ignoreFn
}

/**
 * 通过读取文件头判断是否为二进制文件
 * 更可靠的方法：检查前 512 字节中是否包含 null 字节
 */
async function isBinaryFile(absPath: string): Promise<boolean> {
    try {
        const fd = await open(absPath, 'r')
        const buffer = Buffer.alloc(512)
        const { bytesRead } = await fd.read(buffer, 0, 512, 0)
        await fd.close()

        // 如果前 512 字节中有 null 字节，极大可能是二进制
        for (let i = 0; i < bytesRead; i++) {
            if (buffer[i] === 0) {
                return true
            }
        }
        return false
    } catch {
        // 无法读取，保守地认为是二进制
        return true
    }
}

/**
 * 递归获取目录下所有文本文件（复用 .gitignore 规则）
 * 返回相对路径列表
 */
async function collectFiles(
    dirPath: string,
    projectRoot: string,
    shouldIgnore: (relPath: string) => boolean,
    collected: string[] = [],
    depth: number = 0
): Promise<string[]> {
    const MAX_DEPTH = 50
    if (depth > MAX_DEPTH) return collected

    try {
        const entries = await readdir(dirPath, { withFileTypes: true })
        for (const entry of entries) {
            const fullPath = join(dirPath, entry.name)
            const relPath = relative(projectRoot, fullPath).replace(/\\/g, '/')

            if (shouldIgnore(relPath)) continue

            if (entry.isDirectory()) {
                await collectFiles(fullPath, projectRoot, shouldIgnore, collected, depth + 1)
            } else if (entry.isFile()) {
                if (!(await isBinaryFile(fullPath))) {
                    collected.push(relPath)
                }
            }
        }
    } catch {
        // 目录不可访问，不影响其他目录
    }

    return collected
}

/**
 * 检测文件变更（与上一个快照对比）
 */
export async function detectChanges(
    config: AIVersionConfig,
    previousSnapshotHash: string | null
): Promise<FileChange[]> {
    const shouldIgnore = await getIgnore(config.projectRoot)

    if (!previousSnapshotHash || !(await blobExists(config, previousSnapshotHash))) {
        return await detectAllFiles(config, shouldIgnore)
    }

    const previousSnapshot = await readSnapshot(config, previousSnapshotHash)
    const previousFiles = previousSnapshot.files

    const currentFiles = await collectFiles(config.projectRoot, config.projectRoot, shouldIgnore)

    const changes: FileChange[] = []
    const processedFiles = new Set<string>()

    for (const filePath of currentFiles) {
        processedFiles.add(filePath)
        const absPath = join(config.projectRoot, filePath)

        if (!(await exists(absPath))) continue

        const content = await readFile(absPath, 'utf-8')
        const hash = await storeBlob(config, content)

        if (!previousFiles[filePath]) {
            changes.push({ path: filePath, status: 'added', blobHash: hash })
        } else if (previousFiles[filePath] !== hash) {
            changes.push({ path: filePath, status: 'modified', blobHash: hash })
        }
    }

    for (const filePath of Object.keys(previousFiles)) {
        if (!processedFiles.has(filePath)) {
            changes.push({
                path: filePath,
                status: 'deleted',
                blobHash: previousFiles[filePath]
            })
        }
    }

    return changes
}

/**
 * 首次保存时记录所有文件
 */
async function detectAllFiles(config: AIVersionConfig, shouldIgnore: (p: string) => boolean): Promise<FileChange[]> {
    const files = await collectFiles(config.projectRoot, config.projectRoot, shouldIgnore)
    const changes: FileChange[] = []

    for (const filePath of files) {
        const absPath = join(config.projectRoot, filePath)
        if (await exists(absPath)) {
            const content = await readFile(absPath, 'utf-8')
            const hash = await storeBlob(config, content)
            changes.push({ path: filePath, status: 'added', blobHash: hash })
        }
    }

    return changes
}

/**
 * 保存当前工作区快照
 * 自动检测变更，只记录变化的文件，无变化则不创建版本
 * 自动关联到当前会话
 *
 * @param config 配置对象（可包含 sessionId 指定会话）
 * @param question 用户问题描述
 * @param solution 模型方案描述
 * @param tag 可选标签
 */
export async function saveSnapshot(
    config: AIVersionConfig,
    question: string,
    solution: string,
    tag?: string
): Promise<Version | null> {
    // 获取当前会话 ID
    const sessionId = config.sessionId || (await getCurrentSessionId(config))

    // 获取当前会话的 HEAD 版本
    const headVersion = await getSessionHeadVersion(config, sessionId)
    const prevSnapshotHash = headVersion?.snapshotHash ?? null
    const changes = await detectChanges(config, prevSnapshotHash)

    if (changes.length === 0) return null

    // 基于上一个快照 + 变更构建新快照
    let currentSnapshot: Snapshot
    if (headVersion && (await blobExists(config, headVersion.snapshotHash))) {
        const prevSnapshot = await readSnapshot(config, headVersion.snapshotHash)
        const newFiles = { ...prevSnapshot.files }

        for (const change of changes) {
            if (change.status === 'deleted') {
                delete newFiles[change.path]
            } else {
                newFiles[change.path] = change.blobHash
            }
        }

        currentSnapshot = { files: newFiles, timestamp: Date.now() }
    } else {
        currentSnapshot = { files: {}, timestamp: Date.now() }
        for (const change of changes) {
            currentSnapshot.files[change.path] = change.blobHash
        }
    }

    const snapshotJson = JSON.stringify(currentSnapshot)
    const snapshotHash = await storeBlob(config, snapshotJson)

    return await createVersion(config, {
        snapshotHash,
        question,
        solution,
        parentId: headVersion?.id,
        changedFiles: changes,
        tag,
        sessionId // ✅ 明确指定所属会话
    })
}

/**
 * 从版本恢复文件到工作区
 * @param version 要恢复的版本
 * @param targetFiles 指定文件列表，不传则恢复全部
 * @returns 已恢复的文件路径列表
 */
export async function restoreSnapshot(
    config: AIVersionConfig,
    version: Version,
    targetFiles?: string[]
): Promise<string[]> {
    const snapshot = await readSnapshot(config, version.snapshotHash)
    const restoredFiles: string[] = []

    const filesToRestore = targetFiles || Object.keys(snapshot.files)

    // 恢复前先保存当前工作区作为备份版本（undo 用）
    if (!targetFiles) {
        await saveSnapshot(
            config,
            `[auto-backup] 恢复前的自动备份`,
            `从版本 ${version.id.slice(-12)} 恢复前的自动备份`
        )
    }

    for (const filePath of filesToRestore) {
        if (!snapshot.files[filePath]) continue

        const content = await readBlob(config, snapshot.files[filePath])
        const absPath = join(config.projectRoot, filePath)

        // ✅ 使用 dirname 正确获取父目录
        const dir = dirname(absPath)
        await fsMkdir(dir, { recursive: true })

        await writeFile(absPath, content, 'utf-8')
        restoredFiles.push(filePath)
    }

    return restoredFiles
}
