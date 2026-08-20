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
 *   单项目:   feature/v{ver}   hotfix/v{ver}   release/v{ver}
 *   Monorepo: feature/{key}/v{ver}   hotfix/{key}/v{ver}   release/{key}/v{ver}
 *   tag:      v{ver}（单项目）   {key}-v{ver}（Monorepo）
 *
 * 测试分支（固定）：
 *   test:     统一的测试环境分支，feature/hotfix 开发完成后合并到 test 发布测试环境
 *             不跑版本号，全项目共享单个 test 分支。
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

/** 分支类型 */
export type BranchType = 'release' | 'feature' | 'hotfix'

/** 分支解析信息 */
export interface BranchInfo {
    name: string
    type: BranchType
    version: string
    featureDesc?: string
}

// ==================== 正则 ====================

const REGEXP = {
    version: /^\d+\.\d+\.\d+$/,
    branchName: /^[0-9a-zA-Z_-]+$/,
    featureBranchSingle: /^feature\/v(\d+\.\d+\.\d+)$/,
    hotfixBranchSingle: /^hotfix\/v(\d+\.\d+\.\d+)$/,
    releaseBranchSingle: /^release\/v(\d+\.\d+\.\d+)$/,
    featureBranchMono: /^feature\/([^/]+)\/v(\d+\.\d+\.\d+)$/,
    hotfixBranchMono: /^hotfix\/([^/]+)\/v(\d+\.\d+\.\d+)$/,
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
export function getFeatureName(version: string, projectKey?: string): string {
    return projectKey ? `feature/${projectKey}/v${version}` : `feature/v${version}`
}

/** 生成 hotfix 分支名 */
export function getHotfixName(version: string, projectKey?: string): string {
    return projectKey ? `hotfix/${projectKey}/v${version}` : `hotfix/v${version}`
}

/** 解析分支名信息（识别 release/feature/hotfix + 版本） */
export function parseBranchInfo(branchName: string, projectKey?: string): BranchInfo | null {
    return projectKey
        ? parseMonoRepoBranch(branchName, projectKey)
        : parseSingleRepoBranch(branchName)
}

/** 解析单仓库分支（release/v{ver}、feature/v{ver}、hotfix/v{ver}） */
function parseSingleRepoBranch(branchName: string): BranchInfo | null {
    const releaseMatch = branchName.match(REGEXP.releaseBranchSingle)
    if (releaseMatch) return { name: branchName, type: 'release', version: releaseMatch[1] }

    return (
        matchVersionBranchSingle(branchName, REGEXP.featureBranchSingle, 'feature') ||
        matchVersionBranchSingle(branchName, REGEXP.hotfixBranchSingle, 'hotfix')
    )
}

/** 解析 monorepo 分支（release/{key}/v{ver}、feature/{key}/v{ver}、hotfix/{key}/v{ver}） */
function parseMonoRepoBranch(branchName: string, projectKey: string): BranchInfo | null {
    const releaseMatch = branchName.match(REGEXP.releaseBranchMono)
    if (releaseMatch && releaseMatch[1] === projectKey) {
        return { name: branchName, type: 'release', version: releaseMatch[2] }
    }

    return (
        matchVersionBranchMono(branchName, REGEXP.featureBranchMono, projectKey, 'feature') ||
        matchVersionBranchMono(branchName, REGEXP.hotfixBranchMono, projectKey, 'hotfix')
    )
}

/** 匹配单仓库带版本的 feature/hotfix 分支 */
function matchVersionBranchSingle(
    branchName: string,
    regexp: RegExp,
    type: 'feature' | 'hotfix'
): BranchInfo | null {
    const m = branchName.match(regexp)
    if (!m) return null
    return { name: branchName, type, version: m[1] }
}

/** 匹配 monorepo 带版本的 feature/hotfix 分支 */
function matchVersionBranchMono(
    branchName: string,
    regexp: RegExp,
    projectKey: string,
    type: 'feature' | 'hotfix'
): BranchInfo | null {
    const m = branchName.match(regexp)
    if (!m || m[1] !== projectKey) return null
    return { name: branchName, type, version: m[2] }
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
    if (featureMatch && featureMatch[1] === projectKey) return featureMatch[2]

    const hotfixMatch = branch.match(REGEXP.hotfixBranchMono)
    if (hotfixMatch && hotfixMatch[1] === projectKey) return hotfixMatch[2]

    return null
}

/** 匹配单仓库分支版本号 */
function matchSingleRepoVersion(branch: string): string | null {
    const releaseMatch = branch.match(REGEXP.releaseBranchSingle)
    if (releaseMatch) return releaseMatch[1]

    const featureMatch = branch.match(REGEXP.featureBranchSingle)
    if (featureMatch) return featureMatch[1]

    const hotfixMatch = branch.match(REGEXP.hotfixBranchSingle)
    if (hotfixMatch) return hotfixMatch[1]

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

// ==================== Tag 管理 ====================

/** 生成 tag 名（单项目 v{ver}，Monorepo {key}-v{ver}） */
export function getTagName(version: string, projectKey?: string): string {
    return projectKey ? `${projectKey}-v${version}` : `v${version}`
}

/**
 * 创建 tag 并推送到远程
 *
 * @param tagName tag 名
 * @param message tag 说明（默认 `release {tagName}`）
 * @param cwd 工作目录
 * @returns 是否成功
 */
export async function createAndPushTag(
    tagName: string,
    message?: string,
    cwd = process.cwd()
): Promise<boolean> {
    try {
        // 若已存在同名 tag，先删除本地（幂等）
        try {
            await gitExec(['tag', '-d', tagName], { cwd, silent: true })
        } catch {
            // 不存在则忽略
        }

        await gitExecOrThrow(['tag', '-a', tagName, '-m', message || `release ${tagName}`], {
            cwd
        })
        await gitExecOrThrow(['push', 'origin', tagName], { cwd })
        return true
    } catch {
        return false
    }
}

/**
 * 列出远程 tags（匹配 tag 命名规范）
 *
 * @param projectKey Monorepo projectKey（可选）
 * @param cwd 工作目录
 * @returns 排序后的 tag 列表
 */
export async function listTags(projectKey?: string, cwd = process.cwd()): Promise<string[]> {
    try {
        await gitExec(['fetch', '--all', '--tags', '--prune'], { cwd, silent: true })
    } catch {
        // 忽略
    }

    try {
        const prefix = projectKey ? `${projectKey}-v` : 'v'
        const data = await gitExecOrThrow(['tag', '-l', `${prefix}*`], { cwd, silent: true })
        return data
            .trim()
            .split('\n')
            .filter(Boolean)
            .sort((a, b) => {
                const va = extractTagVersion(a)
                const vb = extractTagVersion(b)
                return compareVersion(vb, va)
            })
    } catch {
        return []
    }
}

/** 从 tag 名提取版本号（用于排序） */
function extractTagVersion(tag: string): string {
    const m = tag.match(/v?(\d+\.\d+\.\d+)$/)
    return m ? m[1] : '0.0.0'
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
 * 统一的测试环境分支名（固定，不跑版本号）
 *
 * 多人并发开发时，各人从 master 切出 feature/hotfix 分支，
 * 开发完成后合并到 test 发布测试环境。
 */
export const TEST_BRANCH = 'test'

/**
 * 将源分支合并到 test 分支并推送（发布测试环境）
 *
 * 流程：
 *   1. fetch 远程
 *   2. 确保 test 分支存在（远程有则拉取，都没有则基于 master 创建并推送）
 *   3. 切换到 test 并 pull 最新
 *   4. --no-ff 合并 sourceBranch（保留合并记录）
 *   5. push origin test
 *   6. 切回 sourceBranch
 *
 * 合并冲突时自动 abort 并切回源分支，返回错误信息。
 *
 * @param sourceBranch 要合并到 test 的源分支（feature/hotfix）
 * @returns 合并结果（success/testBranch/error）
 */
/**
 * 确保 test 分支存在并切换到 test
 *
 * - 本地和远程都没有：基于 master 创建 test 并推送
 * - 远程有、本地无：从远程检出
 * - 本地有：切换并拉取最新
 */
async function ensureTestBranch(cwd: string): Promise<void> {
    const remoteTest = await hasRemoteBranch(TEST_BRANCH, cwd)
    const localTest = await hasLocalBranch(TEST_BRANCH, cwd)

    if (!remoteTest && !localTest) {
        // 都没有：基于 master 创建 test 并推送
        try {
            await gitExecOrThrow(['checkout', 'master'], { cwd })
            await gitExecOrThrow(['pull'], { cwd })
        } catch {
            // 本地可能无 master 或拉取失败，不阻断
        }
        await gitExecOrThrow(['checkout', '-b', TEST_BRANCH], { cwd })
        await gitExecOrThrow(['push', '-u', 'origin', TEST_BRANCH], { cwd })
        return
    }

    if (!localTest && remoteTest) {
        // 远程有、本地无：从远程检出
        await gitExecOrThrow(['checkout', '-b', TEST_BRANCH, `origin/${TEST_BRANCH}`], { cwd })
        return
    }

    // 本地有：切换并拉取最新
    await gitExecOrThrow(['checkout', TEST_BRANCH], { cwd })
    await gitExecOrThrow(['pull'], { cwd })
}

/**
 * 合并失败时中止合并并切回源分支
 */
async function abortMergeAndRestore(sourceBranch: string, cwd: string): Promise<void> {
    try {
        await gitExec(['merge', '--abort'], { cwd, silent: true })
    } catch {
        // 忽略
    }
    try {
        await gitExecOrThrow(['checkout', sourceBranch], { cwd })
    } catch {
        // 忽略
    }
}

export async function mergeToTest(
    sourceBranch: string,
    cwd = process.cwd()
): Promise<{ success: boolean; testBranch: string; error?: string }> {
    try {
        // 1. fetch 远程
        try {
            await gitExec(['fetch', 'origin'], { cwd, silent: true })
        } catch {
            // 忽略
        }

        // 2. 确保 test 分支存在并切换
        await ensureTestBranch(cwd)

        // 3. 合并源分支（--no-ff 保留合并记录）
        await gitExecOrThrow(
            ['merge', '--no-ff', sourceBranch, '-m', `merge ${sourceBranch} into ${TEST_BRANCH}`],
            { cwd }
        )

        // 4. 推送 test
        await gitExecOrThrow(['push', 'origin', TEST_BRANCH], { cwd })

        // 5. 切回源分支
        try {
            await gitExecOrThrow(['checkout', sourceBranch], { cwd })
        } catch {
            // 忽略
        }

        return { success: true, testBranch: TEST_BRANCH }
    } catch (error) {
        await abortMergeAndRestore(sourceBranch, cwd)
        return {
            success: false,
            testBranch: TEST_BRANCH,
            error: error instanceof Error ? error.message : String(error)
        }
    }
}

// ==================== 安全删除（仅临时/需求迭代分支） ====================

/**
 * 允许通过命令删除的分支类型（仅临时/需求迭代分支）
 * master / test / release / main / develop 等受保护分支禁止删除
 */
export const DELETABLE_BRANCH_TYPES: BranchType[] = ['feature', 'hotfix']

/** 受保护（禁止通过命令删除）的分支名（精确匹配） */
const PROTECTED_BRANCH_NAMES = new Set([
    'master',
    'main',
    'develop',
    'dev',
    'test',
    'release',
    'staging',
    'stage',
    'prod',
    'production',
    'pre',
    'trunk'
])

/**
 * 判断分支是否允许通过命令删除
 *
 * 允许：feature/*、hotfix/*（含 Monorepo 变体）。
 * 禁止：master/test/release 等受保护分支，以及所有非 feature/hotfix 分支。
 *
 * @param branchName 分支名
 * @returns 是否可删除
 */
export async function isDeletableBranch(branchName: string): Promise<boolean> {
    if (PROTECTED_BRANCH_NAMES.has(branchName)) return false

    const info = parseBranchInfo(branchName)
    if (info && DELETABLE_BRANCH_TYPES.includes(info.type)) return true

    // 兜底：按正则直接匹配（不依赖 projectKey）
    const deletableRegexes = [
        REGEXP.featureBranchSingle,
        REGEXP.hotfixBranchSingle,
        REGEXP.featureBranchMono,
        REGEXP.hotfixBranchMono
    ]
    return deletableRegexes.some((re) => re.test(branchName))
}

/**
 * 安全删除分支（仅 feature/hotfix 允许，远程 + 本地）
 *
 * 其它分支（master/test/release 等）一律拒绝删除，避免误删受保护分支。
 *
 * @param branchName 要删除的分支（仅 feature/hotfix 允许）
 * @param deleteLocal 是否同时删除本地分支
 * @returns { success, error?, reason? }
 *   reason: 'protected' 表示受保护分支禁止删除；'git' 表示 git 操作失败
 */
export async function deleteDeletableBranch(
    branchName: string,
    deleteLocal = true,
    cwd = process.cwd()
): Promise<{ success: boolean; error?: string; reason?: 'protected' | 'git' }> {
    if (!(await isDeletableBranch(branchName))) {
        return {
            success: false,
            reason: 'protected',
            error: `禁止删除受保护分支: ${branchName}（只允许删除 feature/hotfix 分支）`
        }
    }

    const ok = await deleteRemoteBranch(branchName, deleteLocal, cwd)
    if (!ok) {
        return { success: false, reason: 'git', error: `删除分支失败: ${branchName}` }
    }
    return { success: true }
}

// ==================== 预览合并（无冲突自动合并，有冲突手动） ====================

/**
 * 预览合并到 test：先试合并（--no-commit），检测冲突。
 *   - 无冲突：自动提交合并、推送到 test，并切回源分支
 *   - 有冲突：中止合并、切回源分支，返回 conflict=true 提示手动合并
 *
 * 与 mergeToTest 的区别：mergeToTest 在冲突时直接 abort 返回失败；
 * 本函数在冲突时明确标记 conflict=true，便于调用方引导用户手动合并。
 *
 * @param sourceBranch 要合并到 test 的源分支（feature/hotfix）
 */
export async function previewMergeToTest(
    sourceBranch: string,
    cwd = process.cwd()
): Promise<{ success: boolean; testBranch: string; conflict?: boolean; error?: string }> {
    try {
        // 1. fetch 远程
        try {
            await gitExec(['fetch', 'origin'], { cwd, silent: true })
        } catch {
            // 忽略
        }

        // 2. 确保 test 分支存在并切换
        await ensureTestBranch(cwd)

        // 3. 试合并（不直接提交）
        const mergeRes = await gitExec(
            [
                'merge',
                '--no-commit',
                '--no-ff',
                sourceBranch,
                '-m',
                `merge ${sourceBranch} into ${TEST_BRANCH}`
            ],
            { cwd }
        )

        // 4. 检测未解决的冲突文件
        const unmerged = await gitExec(['diff', '--name-only', '--diff-filter=U'], {
            cwd,
            silent: true
        })
        const conflictFiles = unmerged.stdout
            .split('\n')
            .map((f) => f.trim())
            .filter(Boolean)

        if (!mergeRes.success || conflictFiles.length > 0) {
            // 有冲突：中止合并并切回源分支
            await gitExec(['merge', '--abort'], { cwd, silent: true })
            try {
                await gitExecOrThrow(['checkout', sourceBranch], { cwd })
            } catch {
                // 忽略
            }
            return {
                success: false,
                testBranch: TEST_BRANCH,
                conflict: true,
                error: `合并存在冲突，已中止自动合并。请手动解决：${sourceBranch} -> ${TEST_BRANCH}，冲突文件: ${conflictFiles.join(', ')}`
            }
        }

        // 5. 无冲突：提交并推送（仅当有实际合并内容时）
        const diffRes = await gitExec(['diff', '--cached', '--quiet'], { cwd, silent: true })
        const hasStaged = diffRes.success === false
        if (hasStaged) {
            await gitExecOrThrow(['commit', '--no-edit'], { cwd })
            await gitExecOrThrow(['push', 'origin', TEST_BRANCH], { cwd })
        }

        // 6. 切回源分支
        try {
            await gitExecOrThrow(['checkout', sourceBranch], { cwd })
        } catch {
            // 忽略
        }

        return { success: true, testBranch: TEST_BRANCH }
    } catch (error) {
        await abortMergeAndRestore(sourceBranch, cwd)
        return {
            success: false,
            testBranch: TEST_BRANCH,
            error: error instanceof Error ? error.message : String(error)
        }
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
     * 合并源分支到 test 测试分支并推送
     *
     * @param sourceBranch 要合并的源分支（feature/hotfix）
     */
    async mergeToTest(
        sourceBranch: string
    ): Promise<{ success: boolean; testBranch: string; error?: string }> {
        return mergeToTest(sourceBranch, this.cwd)
    }

    /**
     * 预览合并到 test：无冲突自动合并，有冲突返回提示
     *
     * @param sourceBranch 要合并到 test 的源分支（feature/hotfix）
     */
    async previewMergeToTest(
        sourceBranch: string
    ): Promise<{ success: boolean; testBranch: string; conflict?: boolean; error?: string }> {
        return previewMergeToTest(sourceBranch, this.cwd)
    }

    /**
     * 判断分支是否允许通过命令删除（仅 feature/hotfix）
     */
    async isDeletableBranch(branchName: string): Promise<boolean> {
        return isDeletableBranch(branchName)
    }

    /**
     * 安全删除分支（仅 feature/hotfix，远程 + 本地）
     */
    async deleteDeletableBranch(
        branchName: string,
        deleteLocal = true
    ): Promise<{ success: boolean; error?: string; reason?: 'protected' | 'git' }> {
        return deleteDeletableBranch(branchName, deleteLocal, this.cwd)
    }

    /** 创建并推送 tag */
    async createTag(tagName: string, message?: string): Promise<boolean> {
        return createAndPushTag(tagName, message, this.cwd)
    }

    /** 列出 tags */
    async listTags(projectKey?: string): Promise<string[]> {
        return listTags(projectKey, this.cwd)
    }

    /**
     * 创建分支（feature / hotfix），从 master 切出
     *
     * @param type 分支类型（feature 需求 / hotfix 缺陷修复）
     * @param version 版本号
     * @returns 分支名；失败返回 null
     */
    async createBranchByType(
        type: 'feature' | 'hotfix',
        version: string,
        projectKey?: string
    ): Promise<string | null> {
        const branchName =
            type === 'feature'
                ? getFeatureName(version, projectKey)
                : getHotfixName(version, projectKey)

        if (!(await createAndPushBranch(branchName, 'master', this.cwd))) {
            return null
        }
        return branchName
    }

    /**
     * 创建 release + feature 分支（一步完成）
     *
     * @returns 分支创建结果；失败返回 null
     */
    async createReleaseFeatureBranches(options: {
        version: string
        projectKey?: string
        useRelease: boolean
    }): Promise<BranchResult | null> {
        const { version, projectKey, useRelease } = options

        const releaseBranchName = getReleaseName(version, projectKey)
        const featureBranchName = getFeatureName(version, projectKey)

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
            featureDesc: ''
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
