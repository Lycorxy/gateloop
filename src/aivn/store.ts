/**
 * AI 版本管理 - 存储引擎（多会话生产级）
 *
 * 内容寻址存储（Content-Addressable Store），模拟 Git 的对象模型：
 * - Blob：存储文件内容，SHA256 命名，自动去重
 * - Snapshot：记录某个时间点的文件路径 → blob hash 映射
 * - Version：指向 snapshot + 会话元信息
 * - Session：独立的 AI 对话窗口，拥有自己的版本链
 *
 * 多会话特性：
 * - 每个会话有独立的 HEAD 和版本链
 * - 会话间共享 Blob 存储（自动去重）
 * - 支持创建/切换/删除/合并会话
 *
 * 生产级特性：
 * - 原子写入（write-tmp-then-rename），断电不丢数据
 * - 锁机制防止并发写入
 * - blob 垃圾回收，防止磁盘泄漏
 * - 输入校验防止注入攻击
 * - 写入前自动备份旧状态
 */

import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { exists, readJson, writeJson } from '../helpers'
import type {
    AIVersionConfig,
    VersionIndex,
    Session,
    Version,
    Snapshot,
    CreateSessionOptions,
    ListSessionsOptions,
    CleanOptions,
    StoreStats
} from './types'
import { DEFAULT_CONFIG, DEFAULT_SESSION_ID, DEFAULT_SESSION_NAME } from './types'

// ==================== 错误类型 ====================

/** AI 版本管理自定义错误 */
export class AIVersionError extends Error {
    constructor(
        message: string,
        public code: string
    ) {
        super(message)
        this.name = 'AIVersionError'
    }
}

// ==================== 路径工具 ====================

function configPath(config: AIVersionConfig): string {
    return join(config.storeDir, 'config.json')
}

function indexPath(config: AIVersionConfig): string {
    return join(config.storeDir, 'versions.json')
}

function currentSessionPath(config: AIVersionConfig): string {
    return join(config.storeDir, 'current-session')
}

function globalHeadPath(config: AIVersionConfig): string {
    return join(config.storeDir, 'HEAD')
}

function lockPath(config: AIVersionConfig): string {
    return join(config.storeDir, '.lock')
}

// ==================== 配置管理 ====================

export async function loadConfig(projectRoot: string): Promise<AIVersionConfig> {
    const storeDir = join(projectRoot, DEFAULT_CONFIG.storeDir)
    const cfgPath = join(storeDir, 'config.json')

    if (await exists(cfgPath)) {
        const saved = await readJson<Partial<AIVersionConfig>>(cfgPath)
        return {
            storeDir,
            retentionDays:
                typeof saved.retentionDays === 'number' && saved.retentionDays >= 0
                    ? saved.retentionDays
                    : DEFAULT_CONFIG.retentionDays,
            projectRoot
        }
    }

    return { storeDir, retentionDays: DEFAULT_CONFIG.retentionDays, projectRoot }
}

export async function saveConfig(config: AIVersionConfig): Promise<void> {
    await mkdir(config.storeDir, { recursive: true })
    await writeJson(configPath(config), { retentionDays: config.retentionDays })
}

// ==================== 锁机制 ====================

/** 获取写锁，超时 30 秒自动放弃 */
async function acquireLock(config: AIVersionConfig): Promise<string> {
    const path = lockPath(config)
    const lockId = randomBytes(8).toString('hex')
    const start = Date.now()
    const timeout = 30000

    while (Date.now() - start < timeout) {
        try {
            await writeFile(path, lockId, { flag: 'wx' })
            return lockId
        } catch {
            // 锁被占用，检查是否过期
            try {
                const fileStat = await stat(path)
                if (Date.now() - fileStat.mtimeMs > timeout) {
                    // 锁已过期，强制删除
                    await rm(path, { force: true })
                    continue
                }
            } catch {
                // 锁文件已消失
            }
        }
        await new Promise((r) => setTimeout(r, 100))
    }

    throw new AIVersionError('获取写锁超时（30s），可能有其他进程正在操作', 'LOCK_TIMEOUT')
}

async function releaseLock(config: AIVersionConfig, lockId: string): Promise<void> {
    const path = lockPath(config)
    try {
        const content = await readFile(path, 'utf-8').catch(() => '')
        if (content.trim() === lockId) {
            await rm(path, { force: true })
        }
    } catch {
        // 锁文件已不存在
    }
}

// ==================== 原子写入 ====================

/**
 * 原子写入：先写临时文件，再 rename
 * - 不会出现写一半的情况
 * - POSIX rename 是原子操作
 */
async function atomicWrite(filePath: string, content: string): Promise<void> {
    const tmpPath = `${filePath}.tmp.${randomBytes(4).toString('hex')}`
    await mkdir(dirname(filePath), { recursive: true })

    // 备份旧文件
    try {
        await rename(filePath, `${filePath}.bak`)
    } catch {
        // 旧文件不存在，无需备份
    }

    await writeFile(tmpPath, content, 'utf-8')
    await rename(tmpPath, filePath)

    // 删除备份
    try {
        await rm(`${filePath}.bak`, { force: true })
    } catch {
        // 忽略
    }
}

// ==================== 内容寻址存储（Blob）====================

export function hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex')
}

export function blobPath(config: AIVersionConfig, hash: string): string {
    return join(config.storeDir, 'objects', hash.slice(0, 2), hash.slice(2))
}

/**
 * 大文件阈值：超过此大小的文件使用流式读取
 */
const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024 // 10MB

export async function storeBlob(config: AIVersionConfig, content: string): Promise<string> {
    if (content.length > 100 * 1024 * 1024) {
        throw new AIVersionError('文件大小超过 100MB 限制', 'BLOB_TOO_LARGE')
    }

    const hash = hashContent(content)
    const path = blobPath(config, hash)

    if (!(await exists(path))) {
        await atomicWrite(path, content)
    }

    return hash
}

export async function readBlob(config: AIVersionConfig, hash: string): Promise<string> {
    if (!/^[a-f0-9]{64}$/.test(hash)) {
        throw new AIVersionError(`无效的 blob hash: ${hash.slice(0, 16)}...`, 'INVALID_BLOB_HASH')
    }

    const path = blobPath(config, hash)

    try {
        return await readFile(path, 'utf-8')
    } catch {
        throw new AIVersionError(`Blob 不存在或已损坏: ${hash.slice(0, 16)}...`, 'BLOB_NOT_FOUND')
    }
}

export async function blobExists(config: AIVersionConfig, hash: string): Promise<boolean> {
    if (!/^[a-f0-9]{64}$/.test(hash)) return false
    return await exists(blobPath(config, hash))
}

/**
 * 从文件路径存储 blob，大文件使用流式读取避免内存溢出
 */
export async function storeBlobFromFile(
    config: AIVersionConfig,
    filePath: string
): Promise<string> {
    const { size } = await stat(filePath)

    if (size > 100 * 1024 * 1024) {
        throw new AIVersionError('文件大小超过 100MB 限制', 'BLOB_TOO_LARGE')
    }

    if (size < LARGE_FILE_THRESHOLD) {
        // 小文件：直接读入内存
        const content = await readFile(filePath, 'utf-8')
        return await storeBlob(config, content)
    }

    // 大文件：流式读取 + 边读边算 hash + 流式写入
    const hash = createHash('sha256')
    const hashStream = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
            hash.update(chunk)
            callback(null, chunk)
        }
    })

    const tmpPath = join(config.storeDir, 'objects', '.tmp.' + randomBytes(4).toString('hex'))
    await mkdir(dirname(tmpPath), { recursive: true })

    const readStream = createReadStream(filePath)
    const writeStream = createWriteStream(tmpPath)

    await pipeline(readStream, hashStream, writeStream)

    const fileHash = hash.digest('hex')
    const targetPath = blobPath(config, fileHash)

    if (await exists(targetPath)) {
        await rm(tmpPath, { force: true })
        return fileHash
    }

    await rename(tmpPath, targetPath)
    return fileHash
}

// ==================== 快照（Snapshot）====================

export async function createSnapshot(
    config: AIVersionConfig,
    filePaths: string[]
): Promise<string> {
    const files: Record<string, string> = {}

    for (const filePath of filePaths) {
        const absPath = join(config.projectRoot, filePath)
        if (await exists(absPath)) {
            const hash = await storeBlobFromFile(config, absPath)
            files[filePath] = hash
        }
    }

    const snapshot: Snapshot = { files, timestamp: Date.now() }
    const snapshotJson = JSON.stringify(snapshot)
    return await storeBlob(config, snapshotJson)
}

export async function readSnapshot(
    config: AIVersionConfig,
    snapshotHash: string
): Promise<Snapshot> {
    const json = await readBlob(config, snapshotHash)
    const parsed = JSON.parse(json) as Snapshot

    if (!parsed.files || typeof parsed.timestamp !== 'number') {
        throw new AIVersionError('快照数据格式损坏', 'CORRUPTED_SNAPSHOT')
    }

    return parsed
}

// ==================== 版本索引管理 ====================

/**
 * 加载版本索引（兼容旧格式和新格式）
 */
export async function loadIndex(config: AIVersionConfig): Promise<VersionIndex> {
    const path = indexPath(config)

    if (await exists(path)) {
        const raw = await readJson<VersionIndex | Record<string, unknown>>(path)

        // 检查是否为新格式（包含 sessions 字段）
        if ('sessions' in raw && typeof raw.sessions === 'object') {
            const newIndex = raw as VersionIndex
            // 校验数据完整性
            if (!newIndex.versions || typeof newIndex.versions !== 'object') {
                throw new AIVersionError('版本索引数据格式损坏', 'CORRUPTED_INDEX')
            }
            if (newIndex.globalHead !== null && typeof newIndex.globalHead !== 'string') {
                throw new AIVersionError('全局 HEAD 格式错误', 'CORRUPTED_INDEX')
            }
            return newIndex
        }

        // 兼容旧格式迁移（只有 head 和 versions）
        if ('head' in raw && 'versions' in raw) {
            const oldIndex = raw as { head: string | null; versions: Record<string, Version> }
            return migrateFromOldFormat(config, oldIndex)
        }

        throw new AIVersionError('版本索引数据格式损坏', 'CORRUPTED_INDEX')
    }

    // 首次初始化，返回空索引
    return {
        globalHead: null,
        sessions: {},
        versions: {}
    }
}

/**
 * 从旧格式迁移到新格式
 */
async function migrateFromOldFormat(
    config: AIVersionConfig,
    oldIndex: { head: string | null; versions: Record<string, Version> }
): Promise<VersionIndex> {
    console.warn('[aivn] 检测到旧格式版本索引，正在迁移...')

    const defaultSession: Session = {
        id: DEFAULT_SESSION_ID,
        name: DEFAULT_SESSION_NAME,
        head: oldIndex.head,
        createdAt: Date.now(),
        updatedAt: Date.now()
    }

    // 为旧版本添加 sessionId
    for (const version of Object.values(oldIndex.versions)) {
        version.sessionId = DEFAULT_SESSION_ID
    }

    const newIndex: VersionIndex = {
        globalHead: oldIndex.head,
        sessions: {
            [DEFAULT_SESSION_ID]: defaultSession
        },
        versions: oldIndex.versions
    }

    // 自动保存迁移后的索引
    await saveIndex(config, newIndex)
    await saveCurrentSession(config, DEFAULT_SESSION_ID)

    console.warn('[aivn] 迁移完成！已创建默认会 "default"')
    return newIndex
}

export async function saveIndex(config: AIVersionConfig, index: VersionIndex): Promise<void> {
    await mkdir(config.storeDir, { recursive: true })
    await atomicWrite(indexPath(config), JSON.stringify(index, null, 2))
}

// ==================== 当前会话管理 ====================

/** 获取当前会话 ID */
export async function getCurrentSessionId(config: AIVersionConfig): Promise<string> {
    // 1. 优先从配置中获取（运行时设置）
    if (config.sessionId) {
        return config.sessionId
    }

    // 2. 从 current-session 文件获取
    const path = currentSessionPath(config)
    if (await exists(path)) {
        const content = (await readFile(path, 'utf-8')).trim()
        if (content) return content
    }

    // 3. 从环境变量获取
    const envSessionId = process.env.AIVN_SESSION_ID
    if (envSessionId) {
        return envSessionId
    }

    // 4. 默认返回 default
    return DEFAULT_SESSION_ID
}

/** 保存当前会话 ID */
export async function saveCurrentSession(
    config: AIVersionConfig,
    sessionId: string
): Promise<void> {
    await mkdir(config.storeDir, { recursive: true })
    await atomicWrite(currentSessionPath(config), sessionId)
}

// ==================== 全局 HEAD（兼容）====================

export async function updateGlobalHead(
    config: AIVersionConfig,
    versionId: string | null
): Promise<void> {
    await mkdir(config.storeDir, { recursive: true })
    if (versionId) {
        await atomicWrite(globalHeadPath(config), versionId)
    } else {
        try {
            await rm(globalHeadPath(config))
        } catch {
            // HEAD 不存在
        }
    }
}

export async function readGlobalHead(config: AIVersionConfig): Promise<string | null> {
    const path = globalHeadPath(config)
    if (await exists(path)) {
        return (await readFile(path, 'utf-8')).trim()
    }
    return null
}

// ==================== 版本 ID 校验 ====================

const VERSION_ID_PATTERN = /^version-\d+-[a-f0-9]{8}$/

function validateVersionId(id: string): void {
    if (!VERSION_ID_PATTERN.test(id)) {
        throw new AIVersionError(`无效的版本 ID: ${id}`, 'INVALID_VERSION_ID')
    }
}

// ==================== 会话 ID 生成 ====================

function generateSessionId(): string {
    return `sess-${randomBytes(6).toString('hex')}`
}

// ==================== 会话操作（带锁）====================

/**
 * 创建新会话
 */
export async function createSession(
    config: AIVersionConfig,
    name: string,
    options?: CreateSessionOptions
): Promise<Session> {
    if (!name || name.trim().length === 0) {
        throw new AIVersionError('会话名称不能为空', 'INVALID_SESSION_NAME')
    }

    const lockId = await acquireLock(config)

    try {
        const index = await loadIndex(config)
        const sessionId = generateSessionId()

        // 检查名称是否重复
        for (const sess of Object.values(index.sessions)) {
            if (sess.name === name) {
                throw new AIVersionError(`会话名称 "${name}" 已存在`, 'DUPLICATE_SESSION_NAME')
            }
        }

        // 确定初始 HEAD
        let initialHead: string | null = null

        if (options?.baseVersionId) {
            validateVersionId(options.baseVersionId)
            if (!index.versions[options.baseVersionId]) {
                throw new AIVersionError(
                    `基础版本不存在: ${options.baseVersionId}`,
                    'VERSION_NOT_FOUND'
                )
            }
            initialHead = options.baseVersionId
        } else if (options?.branchFromSessionId) {
            const sourceSession = index.sessions[options.branchFromSessionId]
            if (!sourceSession) {
                throw new AIVersionError(
                    `源会话不存在: ${options.branchFromSessionId}`,
                    'SESSION_NOT_FOUND'
                )
            }
            initialHead = sourceSession.head
        }

        const now = Date.now()
        const session: Session = {
            id: sessionId,
            name: name.trim(),
            head: initialHead,
            createdAt: now,
            updatedAt: now,
            metadata: options?.metadata
        }

        index.sessions[sessionId] = session
        await saveIndex(config, index)

        return session
    } finally {
        await releaseLock(config, lockId)
    }
}

/**
 * 切换当前会话
 */
export async function switchSession(
    config: AIVersionConfig,
    sessionIdOrName: string
): Promise<Session> {
    const lockId = await acquireLock(config)

    try {
        const index = await loadIndex(config)

        // 查找会话（支持 ID 或名称）
        let targetSession: Session | undefined
        for (const sess of Object.values(index.sessions)) {
            if (sess.id === sessionIdOrName || sess.name === sessionIdOrName) {
                targetSession = sess
                break
            }
        }

        if (!targetSession) {
            throw new AIVersionError(`会话不存在: ${sessionIdOrName}`, 'SESSION_NOT_FOUND')
        }

        // 更新当前会话指针
        await saveCurrentSession(config, targetSession.id)

        return targetSession
    } finally {
        await releaseLock(config, lockId)
    }
}

/**
 * 获取当前会话信息
 */
export async function getCurrentSession(config: AIVersionConfig): Promise<Session | null> {
    const index = await loadIndex(config)
    const currentId = await getCurrentSessionId(config)
    return index.sessions[currentId] ?? null
}

/**
 * 列出所有会话
 */
export async function listSessions(
    config: AIVersionConfig,
    options?: ListSessionsOptions
): Promise<Session[]> {
    const index = await loadIndex(config)
    let sessions = Object.values(index.sessions)

    // 按 updatedAt 降序排序
    sessions.sort((a, b) => b.updatedAt - a.updatedAt)

    // 过滤活跃会话
    if (options?.activeOnly) {
        const activeIds = new Set(Object.values(index.versions).map((v) => v.sessionId))
        sessions = sessions.filter((s) => activeIds.has(s.id) || s.head !== null)
    }

    // 限制数量
    if (options?.limit && options.limit > 0) {
        sessions = sessions.slice(0, options.limit)
    }

    return sessions
}

/**
 * 重命名会话
 */
export async function renameSession(
    config: AIVersionConfig,
    sessionIdOrName: string,
    newName: string
): Promise<Session> {
    if (!newName || newName.trim().length === 0) {
        throw new AIVersionError('会话名称不能为空', 'INVALID_SESSION_NAME')
    }

    const lockId = await acquireLock(config)

    try {
        const index = await loadIndex(config)
        const session = findSession(index, sessionIdOrName)

        if (!session) {
            throw new AIVersionError(`会话不存在: ${sessionIdOrName}`, 'SESSION_NOT_FOUND')
        }

        // 检查新名称是否冲突
        for (const sess of Object.values(index.sessions)) {
            if (sess.id !== session.id && sess.name === newName.trim()) {
                throw new AIVersionError(`会话名称 "${newName}" 已存在`, 'DUPLICATE_SESSION_NAME')
            }
        }

        session.name = newName.trim()
        session.updatedAt = Date.now()
        index.sessions[session.id] = session

        await saveIndex(config, index)
        return session
    } finally {
        await releaseLock(config, lockId)
    }
}

/**
 * 删除会话（保留版本数据，只删除会话记录）
 */
export async function deleteSession(
    config: AIVersionConfig,
    sessionIdOrName: string
): Promise<boolean> {
    const lockId = await acquireLock(config)

    try {
        const index = await loadIndex(config)
        const session = findSession(index, sessionIdOrName)

        if (!session) {
            return false
        }

        // 不允许删除默认会话
        if (session.id === DEFAULT_SESSION_ID) {
            throw new AIVersionError('不能删除默认会话', 'CANNOT_DELETE_DEFAULT')
        }

        delete index.sessions[session.id]

        // 如果当前会话被删除，切换回默认
        const currentId = await getCurrentSessionId(config)
        if (currentId === session.id) {
            await saveCurrentSession(config, DEFAULT_SESSION_ID)
        }

        await saveIndex(config, index)
        return true
    } finally {
        await releaseLock(config, lockId)
    }
}

/**
 * 在会话列表中查找会话（支持 ID 或名称）
 */
function findSession(index: VersionIndex, sessionIdOrName: string): Session | undefined {
    // 精确匹配 ID
    if (index.sessions[sessionIdOrName]) {
        return index.sessions[sessionIdOrName]
    }
    // 匹配名称
    for (const sess of Object.values(index.sessions)) {
        if (sess.name === sessionIdOrName) {
            return sess
        }
    }
    return undefined
}

// ==================== 版本操作（带锁 + 会话感知）====================

export function generateVersionId(): string {
    const ts = Date.now()
    const rand = randomBytes(4).toString('hex') // ✅ 使用加密安全的随机数
    return `version-${ts}-${rand}`
}

/**
 * 创建版本（自动关联到当前会话）
 */
export async function createVersion(
    config: AIVersionConfig,
    version: Omit<Version, 'id' | 'timestamp'>
): Promise<Version> {
    const lockId = await acquireLock(config)

    try {
        const index = await loadIndex(config)
        const id = generateVersionId()

        // 确定所属会话
        const sessionId = version.sessionId || (await getCurrentSessionId(config))

        // 确保 session 存在
        if (!index.sessions[sessionId]) {
            // 自动创建 session（容错）
            index.sessions[sessionId] = {
                id: sessionId,
                name: sessionId,
                head: null,
                createdAt: Date.now(),
                updatedAt: Date.now()
            }
        }

        const newVersion: Version = {
            ...version,
            id,
            timestamp: Date.now(),
            sessionId
        }

        // 更新索引
        index.versions[id] = newVersion

        // 更新会话 HEAD
        index.sessions[sessionId].head = id
        index.sessions[sessionId].updatedAt = Date.now()

        // 更新全局 HEAD
        index.globalHead = id

        await saveIndex(config, index)
        await updateGlobalHead(config, id)

        return newVersion
    } finally {
        await releaseLock(config, lockId)
    }
}

/**
 * 获取版本（跨会话可访问）
 */
export async function getVersion(
    config: AIVersionConfig,
    versionId: string
): Promise<Version | null> {
    validateVersionId(versionId)
    const index = await loadIndex(config)
    return index.versions[versionId] ?? null
}

/**
 * 获取当前会话的 HEAD 版本
 */
export async function getSessionHeadVersion(
    config: AIVersionConfig,
    sessionId?: string
): Promise<Version | null> {
    const sid = sessionId || (await getCurrentSessionId(config))
    const index = await loadIndex(config)
    const session = index.sessions[sid]

    if (!session || !session.head) return null

    return index.versions[session.head] ?? null
}

/** @deprecated 使用 getSessionHeadVersion 替代 */
export async function getHeadVersion(config: AIVersionConfig): Promise<Version | null> {
    return getSessionHeadVersion(config)
}

/**
 * 删除版本（同时更新相关会话的 HEAD）
 */
export async function deleteVersion(config: AIVersionConfig, versionId: string): Promise<boolean> {
    validateVersionId(versionId)
    const lockId = await acquireLock(config)

    try {
        const index = await loadIndex(config)

        if (!index.versions[versionId]) {
            return false
        }

        const version = index.versions[versionId]
        delete index.versions[versionId]

        // 如果删除的是某个会话的 HEAD，更新该会话 HEAD
        const session = index.sessions[version.sessionId]
        if (session && session.head === versionId) {
            // 找到该会话最新的版本作为新的 HEAD
            const sessionVersions = Object.values(index.versions)
                .filter((v) => v.sessionId === version.sessionId)
                .sort((a, b) => b.timestamp - a.timestamp)

            session.head = sessionVersions.length > 0 ? sessionVersions[0].id : null
            session.updatedAt = Date.now()
        }

        // 如果删除的是全局 HEAD，更新全局 HEAD
        if (index.globalHead === versionId) {
            const allVersions = Object.values(index.versions).sort(
                (a, b) => b.timestamp - a.timestamp
            )
            index.globalHead = allVersions.length > 0 ? allVersions[0].id : null
        }

        await saveIndex(config, index)
        if (index.globalHead) {
            await updateGlobalHead(config, index.globalHead)
        }

        return true
    } finally {
        await releaseLock(config, lockId)
    }
}

/**
 * 列出版本（支持按会话过滤）
 */
export async function listVersions(
    config: AIVersionConfig,
    options?: { sessionId?: string; limit?: number }
): Promise<Version[]> {
    const index = await loadIndex(config)
    let versions = Object.values(index.versions)

    // 按会话过滤
    if (options?.sessionId) {
        versions = versions.filter((v) => v.sessionId === options.sessionId)
    }

    // 按时间降序排列
    versions.sort((a, b) => b.timestamp - a.timestamp)

    // 限制数量
    if (options?.limit && options.limit > 0) {
        versions = versions.slice(0, options.limit)
    }

    return versions
}

/**
 * 列出指定会话的所有版本
 */
export async function listSessionVersions(
    config: AIVersionConfig,
    sessionIdOrName?: string
): Promise<{ session: Session; versions: Version[] }> {
    const index = await loadIndex(config)

    let session: Session

    if (sessionIdOrName) {
        const found = findSession(index, sessionIdOrName)
        if (!found) {
            throw new AIVersionError(`会话不存在: ${sessionIdOrName}`, 'SESSION_NOT_FOUND')
        }
        session = found
    } else {
        const currentId = await getCurrentSessionId(config)
        session = index.sessions[currentId]
        if (!session) {
            throw new AIVersionError(`当前会话不存在: ${currentId}`, 'SESSION_NOT_FOUND')
        }
    }

    const versions = Object.values(index.versions)
        .filter((v) => v.sessionId === session.id)
        .sort((a, b) => b.timestamp - a.timestamp)

    return { session, versions }
}

// ==================== 清理管理 ====================

/**
 * 查找过期的版本（不实际删除）
 */
async function findExpiredVersions(
    config: AIVersionConfig,
    days: number,
    sessionId?: string
): Promise<{ expired: string[]; active: string[] }> {
    const index = await loadIndex(config)
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    const versionIds = Object.keys(index.versions)
    const expired: string[] = []
    const active: string[] = []

    for (const id of versionIds) {
        const version = index.versions[id]

        // 按会话过滤
        if (sessionId && version.sessionId !== sessionId) continue

        // 不删除各会话的 HEAD 版本
        const session = index.sessions[version.sessionId]
        if (session && session.head === id) {
            active.push(id)
            continue
        }

        if (version.timestamp < cutoff) {
            expired.push(id)
        } else {
            active.push(id)
        }
    }

    return { expired, active }
}

/**
 * 收集所有被引用的 blob hash
 */
function collectReferencedBlobs(index: VersionIndex): Set<string> {
    const refs = new Set<string>()

    for (const version of Object.values(index.versions)) {
        refs.add(version.snapshotHash)
        for (const change of version.changedFiles) {
            refs.add(change.blobHash)
        }
    }

    return refs
}

/**
 * 清理过期的版本及其孤立的 blob
 */
export async function cleanOldVersions(
    config: AIVersionConfig,
    days: number,
    dryRun: boolean = false,
    options?: Omit<CleanOptions, 'days'>
): Promise<{ deleted: string[]; kept: string[] }> {
    if (days <= 0) {
        throw new AIVersionError('保留天数必须大于 0', 'INVALID_DAYS')
    }

    const lockId = await acquireLock(config)

    try {
        const { expired, active } = await findExpiredVersions(config, days, options?.sessionId)

        if (dryRun || expired.length === 0) {
            return { deleted: expired, kept: active }
        }

        // 实际删除版本
        const index = await loadIndex(config)
        for (const id of expired) {
            const version = index.versions[id]
            if (version) {
                // 更新关联的会话 HEAD
                const session = index.sessions[version.sessionId]
                if (session && session.head === id) {
                    const remaining = Object.values(index.versions)
                        .filter((v) => v.sessionId === version.sessionId && !expired.includes(v.id))
                        .sort((a, b) => b.timestamp - a.timestamp)
                    session.head = remaining.length > 0 ? remaining[0].id : null
                }
            }
            delete index.versions[id]
        }

        await saveIndex(config, index)

        // GC：删除不再被引用的 blob
        const referencedBlobs = collectReferencedBlobs(index)
        await gcOrphanBlobs(config, referencedBlobs)

        return { deleted: expired, kept: active }
    } finally {
        await releaseLock(config, lockId)
    }
}

/**
 * 垃圾回收：删除未被引用的 blob
 */
async function gcOrphanBlobs(
    config: AIVersionConfig,
    referencedBlobs: Set<string>
): Promise<number> {
    const objectsDir = join(config.storeDir, 'objects')
    if (!(await exists(objectsDir))) return 0

    let deleted = 0

    try {
        const prefixDirs = await readdir(objectsDir)

        for (const prefix of prefixDirs) {
            const prefixDir = join(objectsDir, prefix)
            try {
                const files = await readdir(prefixDir)
                for (const file of files) {
                    const fullHash = prefix + file
                    if (!referencedBlobs.has(fullHash)) {
                        await rm(join(prefixDir, file), { force: true })
                        deleted++
                    }
                }

                // 清理空目录
                try {
                    const remaining = await readdir(prefixDir)
                    if (remaining.length === 0) {
                        await rm(prefixDir, { force: true })
                    }
                } catch {
                    // 目录已空
                }
            } catch {
                // 目录不可访问
            }
        }
    } catch {
        // objects 目录不存在
    }

    return deleted
}

/**
 * 手动触发 blob GC（不删除版本）
 */
export async function runBlobGC(config: AIVersionConfig): Promise<number> {
    const index = await loadIndex(config)
    const refs = collectReferencedBlobs(index)
    return await gcOrphanBlobs(config, refs)
}

// ==================== 统计信息 ====================

/**
 * 获取存储统计信息（包含各会话统计）
 */
export async function getStoreStats(config: AIVersionConfig): Promise<StoreStats> {
    const index = await loadIndex(config)
    const refs = collectReferencedBlobs(index)
    const objectsDir = join(config.storeDir, 'objects')

    let blobCount = 0
    let totalSize = 0
    let orphanBlobCount = 0
    const perSession: StoreStats['perSession'] = []

    if (await exists(objectsDir)) {
        const prefixDirs = await readdir(objectsDir)

        for (const prefix of prefixDirs) {
            const prefixDir = join(objectsDir, prefix)
            try {
                const files = await readdir(prefixDir)
                for (const file of files) {
                    const fullHash = prefix + file
                    blobCount++
                    if (!refs.has(fullHash)) {
                        orphanBlobCount++
                    }
                    try {
                        const s = await stat(join(prefixDir, file))
                        totalSize += s.size
                    } catch {
                        // 文件已不存在
                    }
                }
            } catch {
                // 忽略
            }
        }
    }

    // 统计各会话版本数
    for (const [sessionId, session] of Object.entries(index.sessions)) {
        const count = Object.values(index.versions).filter((v) => v.sessionId === sessionId).length
        perSession.push({
            sessionId,
            sessionName: session.name,
            versionCount: count
        })
    }

    return {
        versionCount: Object.keys(index.versions).length,
        sessionCount: Object.keys(index.sessions).length,
        blobCount,
        totalSize,
        orphanBlobCount,
        perSession: perSession.length > 0 ? perSession : undefined
    }
}

// ==================== 初始化 ====================

export async function initStore(projectRoot: string): Promise<AIVersionConfig> {
    const config = await loadConfig(projectRoot)

    await mkdir(config.storeDir, { recursive: true })
    await mkdir(join(config.storeDir, 'objects'), { recursive: true })
    await mkdir(join(config.storeDir, 'sessions'), { recursive: true })

    // 初始化或加载版本索引
    if (!(await exists(indexPath(config)))) {
        // 创建初始索引（带默认会话）
        const now = Date.now()
        const initialIndex: VersionIndex = {
            globalHead: null,
            sessions: {
                [DEFAULT_SESSION_ID]: {
                    id: DEFAULT_SESSION_ID,
                    name: DEFAULT_SESSION_NAME,
                    head: null,
                    createdAt: now,
                    updatedAt: now
                }
            },
            versions: {}
        }
        await saveIndex(config, initialIndex)
        await saveCurrentSession(config, DEFAULT_SESSION_ID)
    } else {
        // 确保默认会话存在（向后兼容）
        const index = await loadIndex(config)
        if (!index.sessions[DEFAULT_SESSION_ID]) {
            index.sessions[DEFAULT_SESSION_ID] = {
                id: DEFAULT_SESSION_ID,
                name: DEFAULT_SESSION_NAME,
                head: index.globalHead,
                createdAt: Date.now(),
                updatedAt: Date.now()
            }
            await saveIndex(config, index)
        }

        // 确保有当前会话设置
        const currentId = await getCurrentSessionId(config)
        if (!currentId || !index.sessions[currentId]) {
            await saveCurrentSession(config, DEFAULT_SESSION_ID)
        }
    }

    if (!(await exists(globalHeadPath(config)))) {
        await updateGlobalHead(config, null)
    }

    await saveConfig(config)

    return config
}
