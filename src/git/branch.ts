/**
 * Git 分支策略（版本管理 + release/feature 命名 + Monorepo 支持）
 *
 * 纯本地 git 操作，不需要 API token。包括：
 *   - 版本号解析/比较/自增
 *   - release/feature 分支命名（支持 Monorepo projectKey）
 *   - 从远程分支/tags 获取最新版本
 *   - 创建并推送分支
 *   - 提交版本号变更
 *   - 删除远程分支
 *
 * 分支命名规范：
 *   单项目:   feature/{desc}_v{ver}   release/v{ver}
 *   Monorepo: feature/{key}/{desc}_v{ver}   release/{key}/v{ver}
 */

import { readJson, writeJson, exists } from '../helpers/file'
import { join } from 'node:path'
import { gitExecOrThrow, gitExec } from './executor'
import type { GitResult } from './types'

// ==================== 类型 ====================

/** 版本号信息 */
export interface VersionInfo {
    major: number
    minor: number
    patch: number
}

/** 版本类型 */
export type VersionBumpType = 'major' | 'minor' | 'patch'

/** 项目信息（基于当前目录） */
export interface ProjectInfo {
    name: string
    path: string
    pkgPath: string
    version: string
}

/** 分支创建结果 */
export interface BranchResult {
    releaseBranch: string
    featureBranch: string
    version: string
    featureDesc: string
}

/** 分支解析信息 */
export interface BranchInfo {
    name: string
    type: 'release' | 'feature'
    version: string
    featureDesc?: string
}

// ==================== 正则 ====================

const REGEXP = {
    version: /^\d+\.\d+\.\d+$/,
    branchName: /^[0-9a-zA-Z_-]+$/,
    featureBranchSingle: /^feature\/(.+)_v(\d+\.\d+\.\d+)$/,
    releaseBranchSingle: /^release\/v(\d+\.\d+\.\d+)$/,
    featureBranchMono: /^feature\/([^/]+)\/(.+)_v(\d+\.\d+\.\d+)$/,
    releaseBranchMono: /^release\/([^/]+)\/v(\d+\.\d+\.\d+)$/
}

// ==================== 版本号管理 ====================

/** 解析版本号为 { major, minor, patch } */
export function parseVersion(version: string): VersionInfo {
    const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number)
    return { major, minor, patch }
}

/** 格式化版本号为字符串 */
export function formatVersion(info: VersionInfo): string {
    return `${info.major}.${info.minor}.${info.patch}`
}

/** 比较两个版本号：>0 表示 v1>v2，<0 表示 v1<v2，0 表示相等 */
export function compareVersion(v1: string, v2: string): number {
    const a = parseVersion(v1)
    const b = parseVersion(v2)
    if (a.major !== b.major) return a.major - b.major
    if (a.minor !== b.minor) return a.minor - b.minor
    return a.patch - b.patch
}

/** 根据类型自增版本号 */
export function getNextVersion(currentVersion: string, type: VersionBumpType): string {
    const info = parseVersion(currentVersion)
    switch (type) {
        case 'major':
            return formatVersion({ major: info.major + 1, minor: 0, patch: 0 })
        case 'minor':
            return formatVersion({ major: info.major, minor: info.minor + 1, patch: 0 })
        case 'patch':
            return formatVersion({ major: info.major, minor: info.minor, patch: info.patch + 1 })
    }
}

// ==================== 项目信息 ====================

/** 获取当前目录的 package.json 信息 */
export async function getCurrentProjectInfo(cwd = process.cwd()): Promise<ProjectInfo | null> {
    const pkgPath = join(cwd, 'package.json')
    if (!(await exists(pkgPath))) return null
    try {
        const pkg = await readJson<{ name?: string; version?: string }>(pkgPath)
        return {
            name: pkg.name || cwd.split(/[\\/]/).pop() || 'unknown',
            path: cwd,
            pkgPath,
            version: pkg.version || '0.0.0'
        }
    } catch {
        return null
    }
}

/**
 * 检测当前是否在 Monorepo 子项目目录下
 * @returns projectKey（如 packages/web → web）；非子项目返回 undefined
 */
export function detectProjectKey(cwd = process.cwd()): string | undefined {
    const parts = cwd.split(/[\\/]/)
    const idx = parts.findIndex((p) => ['packages', 'apps', 'libs', 'modules'].includes(p))
    if (idx !== -1 && idx + 1 < parts.length) {
        return parts[idx + 1]
    }
    return undefined
}

// ==================== 分支命名 ====================

/** 生成 release 分支名 */
export function getReleaseName(version: string, projectKey?: string): string {
    return projectKey ? `release/${projectKey}/v${version}` : `release/v${version}`
}

/** 生成 feature 分支名 */
export function getFeatureName(branchName: string, version: string, projectKey?: string): string {
    return projectKey
        ? `feature/${projectKey}/${branchName}_v${version}`
        : `feature/${branchName}_v${version}`
}

/** 解析分支名信息（识别 release/feature + 版本） */
export function parseBranchInfo(branchName: string, projectKey?: string): BranchInfo | null {
    if (projectKey) {
        const releaseMatch = branchName.match(REGEXP.releaseBranchMono)
        if (releaseMatch && releaseMatch[1] === projectKey) {
            return { name: branchName, type: 'release', version: releaseMatch[2] }
        }
        const featureMatch = branchName.match(REGEXP.featureBranchMono)
        if (featureMatch && featureMatch[1] === projectKey) {
            return {
                name: branchName,
                type: 'feature',
                version: featureMatch[3],
                featureDesc: featureMatch[2]
            }
        }
    } else {
        const releaseMatch = branchName.match(REGEXP.releaseBranchSingle)
        if (releaseMatch) {
            return { name: branchName, type: 'release', version: releaseMatch[1] }
        }
        const featureMatch = branchName.match(REGEXP.featureBranchSingle)
        if (featureMatch) {
            return {
                name: branchName,
                type: 'feature',
                version: featureMatch[2],
                featureDesc: featureMatch[1]
            }
        }
    }
    return null
}

// ==================== 远程版本获取 ====================

/**
 * 从远程分支和 tags 获取最新版本号
 *
 * 扫描 origin/* 分支和 tags，匹配 release/feature 命名规范，
 * 返回最大版本号。fetch 失败时使用本地缓存。
 *
 * @returns 最新版本号；无任何版本返回 '0.0.0'
 */
export async function getLatestVersionFromRemote(
    projectKey?: string,
    cwd = process.cwd()
): Promise<string> {
    // fetch 失败不阻断
    try {
        await gitExec(['fetch', '--all', '--tags', '--prune'], { cwd, silent: true })
    } catch {
        // 使用本地缓存
    }

    const versions: string[] = []

    // 1. 从远程分支解析版本号
    try {
        const data = await gitExecOrThrow(['branch', '-r'], { cwd, silent: true })
        const branches = parseRemoteBranches(data)
        versions.push(...extractVersionsFromBranches(branches, projectKey))
    } catch {
        // 忽略
    }

    // 2. 从 tags 解析版本号
    try {
        const tagPrefix = projectKey ? `${projectKey}-v` : 'v'
        const tagsData = await gitExecOrThrow(['tag', '-l', `${tagPrefix}*`], {
            cwd,
            silent: true
        })
        versions.push(...extractVersionsFromTags(tagsData))
    } catch {
        // 忽略
    }

    if (versions.length === 0) return '0.0.0'
    versions.sort((a, b) => compareVersion(b, a))
    return versions[0]
}

/** 解析远程分支列表 */
function parseRemoteBranches(data: string): string[] {
    return data
        .trim()
        .split('\n')
        .map((b) => b.trim().replace(/^origin\//, ''))
        .filter((b) => b && !b.includes('HEAD'))
}

/** 从远程分支列表中提取版本号 */
function extractVersionsFromBranches(branches: string[], projectKey?: string): string[] {
    const versions: string[] = []
    for (const branch of branches) {
        const version = projectKey
            ? matchMonoRepoVersion(branch, projectKey)
            : matchSingleRepoVersion(branch)
        if (version) versions.push(version)
    }
    return versions
}

/** 匹配 monorepo 分支版本号 */
function matchMonoRepoVersion(branch: string, projectKey: string): string | null {
    const releaseMatch = branch.match(REGEXP.releaseBranchMono)
    if (releaseMatch && releaseMatch[1] === projectKey) return releaseMatch[2]

    const featureMatch = branch.match(REGEXP.featureBranchMono)
    if (featureMatch && featureMatch[1] === projectKey) return featureMatch[3]

    return null
}

/** 匹配单仓库分支版本号 */
function matchSingleRepoVersion(branch: string): string | null {
    const releaseMatch = branch.match(REGEXP.releaseBranchSingle)
    if (releaseMatch) return releaseMatch[1]

    const featureMatch = branch.match(REGEXP.featureBranchSingle)
    if (featureMatch) return featureMatch[2]

    return null
}

/** 从 tags 数据中提取版本号 */
function extractVersionsFromTags(tagsData: string): string[] {
    const versions: string[] = []
    const tags = tagsData.trim().split('\n').filter(Boolean)
    for (const tag of tags) {
        const m = tag.match(/v?(\d+\.\d+\.\d+)$/)
        if (m) versions.push(m[1])
    }
    return versions
}

// ==================== 分支存在性检查 ====================

/** 检查远程分支是否存在 */
export async function hasRemoteBranch(branchName: string, cwd = process.cwd()): Promise<boolean> {
    try {
        const data = await gitExecOrThrow(['branch', '-r'], { cwd, silent: true })
        return data.includes(`origin/${branchName}`)
    } catch {
        return false
    }
}

/** 检查本地分支是否存在 */
export async function hasLocalBranch(branchName: string, cwd = process.cwd()): Promise<boolean> {
    try {
        await gitExecOrThrow(['show-ref', '--verify', `refs/heads/${branchName}`], {
            cwd,
            silent: true
        })
        return true
    } catch {
        return false
    }
}

// ==================== 分支创建/推送/删除 ====================

/**
 * 创建分支并推送到远程
 *
 * - 远程已存在：切换到该分支并 pull
 * - 远程不存在：基于 baseBranch 创建并 push -u
 *
 * @returns 是否成功
 */
export async function createAndPushBranch(
    branchName: string,
    baseBranch: string,
    cwd = process.cwd()
): Promise<boolean> {
    try {
        const remoteExists = await hasRemoteBranch(branchName, cwd)
        if (remoteExists) {
            const localExists = await hasLocalBranch(branchName, cwd)
            if (localExists) {
                await gitExecOrThrow(['checkout', branchName], { cwd })
            } else {
                await gitExecOrThrow(['checkout', '-b', branchName, `origin/${branchName}`], {
                    cwd
                })
            }
            await gitExecOrThrow(['pull'], { cwd })
            return true
        }

        // 切换到基础分支并拉取最新
        try {
            await gitExecOrThrow(['checkout', baseBranch], { cwd })
            await gitExecOrThrow(['pull'], { cwd })
        } catch {
            // checkout/pull 失败不阻断（可能本地无此分支）
        }

        await gitExecOrThrow(['checkout', '-b', branchName], { cwd })
        await gitExecOrThrow(['push', '-u', 'origin', branchName], { cwd })
        return true
    } catch {
        return false
    }
}

/**
 * 更新 package.json 版本号并提交
 */
export async function commitVersionChange(
    pkgPath: string,
    version: string,
    projectKey?: string,
    cwd = process.cwd()
): Promise<boolean> {
    try {
        const pkg = await readJson<{ version?: string }>(pkgPath)
        pkg.version = version
        await writeJson(pkgPath, pkg, 2)

        await gitExecOrThrow(['add', pkgPath], { cwd })
        await gitExecOrThrow(
            ['commit', '-m', `chore(${projectKey || 'release'}): bump version to ${version}`],
            { cwd }
        )
        await gitExecOrThrow(['push'], { cwd })
        return true
    } catch {
        return false
    }
}

/**
 * 删除分支（远程 + 本地）
 *
 * 走 SSH/HTTPS，不需要 API token。
 *
 * @param branchName 分支名
 * @param deleteLocal 是否同时删除本地分支
 * @returns 是否成功
 */
export async function deleteRemoteBranch(
    branchName: string,
    deleteLocal = true,
    cwd = process.cwd()
): Promise<boolean> {
    try {
        // 1. 删除远程分支
        await gitExecOrThrow(['push', 'origin', '--delete', branchName], { cwd })

        // 2. 删除本地分支
        if (deleteLocal) {
            try {
                const currentBranch = (
                    await gitExecOrThrow(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd })
                ).trim()
                if (currentBranch === branchName) {
                    await gitExecOrThrow(['checkout', 'master'], { cwd })
                }
                await gitExecOrThrow(['branch', '-D', branchName], { cwd })
            } catch {
                // 本地分支可能不存在，忽略
            }
        }
        return true
    } catch {
        return false
    }
}

/**
 * 列出可管理的远程分支（仅匹配 release/feature 命名规范）
 */
export async function listManagedBranches(
    projectKey?: string,
    cwd = process.cwd()
): Promise<BranchInfo[]> {
    try {
        await gitExec(['fetch', '--all', '--prune'], { cwd, silent: true })
    } catch {
        // 忽略
    }

    try {
        const data = await gitExecOrThrow(['branch', '-r'], { cwd, silent: true })
        const branches = data
            .trim()
            .split('\n')
            .map((b) => b.trim().replace(/^origin\//, ''))
            .filter((b) => b && !b.includes('HEAD'))

        const result: BranchInfo[] = []
        for (const branch of branches) {
            const info = parseBranchInfo(branch, projectKey)
            if (info) result.push(info)
        }
        return result
    } catch {
        return []
    }
}

// ==================== BranchService 类（供 GitManager 转发） ====================

/**
 * 分支服务
 *
 * 封装版本管理和分支操作，供 GitManager 暴露统一 API。
 */
export class BranchService {
    private cwd: string

    constructor(cwd?: string) {
        this.cwd = cwd || process.cwd()
    }

    /** 获取当前项目信息 */
    async getCurrentProjectInfo(): Promise<ProjectInfo | null> {
        return getCurrentProjectInfo(this.cwd)
    }

    /** 检测 Monorepo projectKey */
    detectProjectKey(): string | undefined {
        return detectProjectKey(this.cwd)
    }

    /** 获取远程最新版本 */
    async getLatestVersion(projectKey?: string): Promise<string> {
        return getLatestVersionFromRemote(projectKey, this.cwd)
    }

    /** 创建并推送分支 */
    async createAndPush(branchName: string, baseBranch: string): Promise<boolean> {
        return createAndPushBranch(branchName, baseBranch, this.cwd)
    }

    /** 提交版本号变更 */
    async commitVersion(pkgPath: string, version: string, projectKey?: string): Promise<boolean> {
        return commitVersionChange(pkgPath, version, projectKey, this.cwd)
    }

    /** 删除分支（远程+本地） */
    async deleteBranch(branchName: string, deleteLocal = true): Promise<boolean> {
        return deleteRemoteBranch(branchName, deleteLocal, this.cwd)
    }

    /** 列出可管理的远程分支 */
    async listManagedBranches(projectKey?: string): Promise<BranchInfo[]> {
        return listManagedBranches(projectKey, this.cwd)
    }

    /**
     * 创建 release + feature 分支（一步完成）
     *
     * @returns 分支创建结果；失败返回 null
     */
    async createReleaseFeatureBranches(options: {
        version: string
        featureDesc: string
        projectKey?: string
        useRelease: boolean
    }): Promise<BranchResult | null> {
        const { version, featureDesc, projectKey, useRelease } = options

        const releaseBranchName = getReleaseName(version, projectKey)
        const featureBranchName = getFeatureName(featureDesc, version, projectKey)

        // 创建 release 分支（如果选择）
        if (useRelease) {
            if (!(await createAndPushBranch(releaseBranchName, 'master', this.cwd))) {
                return null
            }
        }

        // 创建 feature 分支
        const baseBranch = useRelease ? releaseBranchName : 'master'
        if (!(await createAndPushBranch(featureBranchName, baseBranch, this.cwd))) {
            return null
        }

        return {
            releaseBranch: useRelease ? releaseBranchName : 'master',
            featureBranch: featureBranchName,
            version,
            featureDesc
        }
    }

    /**
     * 列出可管理的分支（GitResult 包装）
     */
    async listManagedBranchesResult(projectKey?: string): Promise<GitResult> {
        const startTime = Date.now()
        try {
            const branches = await listManagedBranches(projectKey, this.cwd)
            return {
                success: true,
                operation: 'branch',
                message: `共找到 ${branches.length} 个可管理分支`,
                data: { count: branches.length, branches },
                duration: Date.now() - startTime
            }
        } catch (error) {
            return {
                success: false,
                operation: 'branch',
                message: '获取分支列表失败',
                error: error instanceof Error ? error.message : String(error),
                duration: Date.now() - startTime
            }
        }
    }
}

export default BranchService
