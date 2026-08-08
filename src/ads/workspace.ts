/**
 * ADS 临时工作区（scratch）生命周期管理
 *
 * 每个任务分配一个隔离的 scratch 目录：
 *   .specflow/scratch/<taskId>/
 *     workspace/   ← 临时草稿、中间产物（reset/done 时清理）
 *     artifacts/   ← 阶段正式产出（供下阶段读，可选保留）
 *
 * 职责：
 *   - initScratch  创建隔离目录
 *   - tmpFile/tmpDir  分配临时路径
 *   - cleanupScratch  清理指定任务的 workspace
 *   - gcScratch  按 mtime 超期回收残留目录（防进程崩溃残留）
 */

import { existsSync, mkdirSync, rmSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const DEFAULT_SCRATCH_DIR = '.specflow/scratch'
const DEFAULT_GC_HOURS = 72

/** 生成任务 ID（时间戳前缀 + 短随机，便于人类排序 + 唯一） */
export function generateTaskId(): string {
    const ts = new Date()
        .toISOString()
        .replace(/[-:.TZ]/g, '')
        .slice(0, 14)
    return `${ts}-${randomUUID().slice(0, 8)}`
}

/** 获取 scratch 根目录 */
export function getScratchRoot(cwd: string, scratchDir?: string): string {
    return join(cwd, scratchDir || DEFAULT_SCRATCH_DIR)
}

/** 获取某任务的 scratch 目录 */
export function getTaskScratch(cwd: string, taskId: string, scratchDir?: string): string {
    return join(getScratchRoot(cwd, scratchDir), taskId)
}

/** 获取任务 workspace 目录（临时草稿） */
export function getWorkspaceDir(cwd: string, taskId: string, scratchDir?: string): string {
    return join(getTaskScratch(cwd, taskId, scratchDir), 'workspace')
}

/** 获取任务 artifacts 目录（正式产出） */
export function getArtifactsDir(cwd: string, taskId: string, scratchDir?: string): string {
    return join(getTaskScratch(cwd, taskId, scratchDir), 'artifacts')
}

/**
 * 初始化任务 scratch 目录
 * 创建 workspace/ 和 artifacts/ 两个子目录
 */
export function initScratch(cwd: string, taskId: string, scratchDir?: string): string {
    const workspace = getWorkspaceDir(cwd, taskId, scratchDir)
    const artifacts = getArtifactsDir(cwd, taskId, scratchDir)
    mkdirSync(workspace, { recursive: true })
    mkdirSync(artifacts, { recursive: true })
    return getTaskScratch(cwd, taskId, scratchDir)
}

/**
 * 分配临时文件路径（在 workspace 下）
 * 不创建文件，只返回路径；可选写入初始内容
 */
export function tmpFile(
    cwd: string,
    taskId: string,
    name: string,
    scratchDir?: string,
    initialContent?: string
): string {
    const dir = getWorkspaceDir(cwd, taskId, scratchDir)
    mkdirSync(dir, { recursive: true })
    const path = join(dir, name)
    if (initialContent !== undefined) {
        writeFileSync(path, initialContent, 'utf-8')
    }
    return path
}

/**
 * 分配临时子目录（在 workspace 下）
 */
export function tmpDir(cwd: string, taskId: string, name: string, scratchDir?: string): string {
    const dir = join(getWorkspaceDir(cwd, taskId, scratchDir), name || randomUUID().slice(0, 8))
    mkdirSync(dir, { recursive: true })
    return dir
}

/**
 * 清理任务的 workspace（保留 artifacts，供审计/回溯）
 * @param full 为 true 时连整个任务 scratch（含 artifacts）一并删除
 */
export function cleanupScratch(
    cwd: string,
    taskId: string,
    scratchDir?: string,
    full = false
): void {
    if (full) {
        const root = getTaskScratch(cwd, taskId, scratchDir)
        if (existsSync(root)) rmSync(root, { recursive: true, force: true })
        return
    }
    const workspace = getWorkspaceDir(cwd, taskId, scratchDir)
    if (existsSync(workspace)) rmSync(workspace, { recursive: true, force: true })
}

/**
 * GC：回收过期的残留 scratch 目录
 * 遍历 scratch 根目录，删除 mtime 超过 gcHours 的任务目录
 * @returns 被回收的任务 ID 列表
 */
export function gcScratch(
    cwd: string,
    scratchDir?: string,
    gcHours: number = DEFAULT_GC_HOURS,
    keepTaskId?: string
): string[] {
    const root = getScratchRoot(cwd, scratchDir)
    if (!existsSync(root)) return []

    const now = Date.now()
    const ttl = gcHours * 60 * 60 * 1000
    const recycled: string[] = []

    let entries: string[] = []
    try {
        entries = readdirSync(root)
    } catch {
        return []
    }

    for (const entry of entries) {
        if (entry === keepTaskId) continue
        const dir = join(root, entry)
        try {
            const st = statSync(dir)
            if (!st.isDirectory()) continue
            if (now - st.mtimeMs > ttl) {
                rmSync(dir, { recursive: true, force: true })
                recycled.push(entry)
            }
        } catch {
            // 单个目录处理失败不影响整体 GC
            continue
        }
    }

    return recycled
}
