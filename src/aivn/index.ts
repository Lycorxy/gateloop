/**
 * AI Version (aivn) — AI 会话代码版本管理（多会话版本）
 *
 * 提供对外的 API 接口，整合所有子模块。
 *
 * 核心特性：
 * - ✅ 多会话支持：每个 AI 对话窗口可以有独立的历史记录
 * - ✅ 内容寻址存储：自动去重，节省空间
 * - ✅ 原子写入：断电不丢数据
 * - ✅ 锁机制：防止并发冲突
 * - ✅ 垃圾回收：自动清理孤立对象
 *
 * 使用示例：
 * ```typescript
 * import { initStore, saveSnapshot, listVersions, getStoreStats } from 'node-ultra/aivn'
 *
 * // 初始化（自动创建 default 会话）
 * const config = await initStore(process.cwd())
 *
 * // 保存快照（自动关联到当前会话）
 * await saveSnapshot(config, '修复登录页', '调整了校验逻辑')
 *
 * // 创建新会话
 * const session = await createSession(config, 'feature-login')
 * await switchSession(config, session.id)
 *
 * // 查看当前会话的历史
 * const { versions } = await listSessionVersions(config)
 *
 * // 全局统计
 * const stats = await getStoreStats(config)
 * ```
 */

// ==================== 存储引擎 ====================

export {
    AIVersionError,
    initStore,
    loadConfig,
    saveConfig,
    hashContent,
    storeBlob,
    readBlob,
    blobExists,
    blobPath,
    createSnapshot,
    readSnapshot,
    loadIndex,
    saveIndex,
    updateGlobalHead,
    readGlobalHead,
    generateVersionId,
    createVersion,
    getVersion,
    getSessionHeadVersion,
    getHeadVersion,
    deleteVersion,
    cleanOldVersions,
    listVersions,
    runBlobGC,
    getStoreStats
} from './store'

// 兼容旧 API 别名
export { updateGlobalHead as updateHead, readGlobalHead as readHead } from './store'

// ==================== 多会话管理 ====================

export {
    getCurrentSessionId,
    saveCurrentSession,
    getCurrentSession,
    createSession,
    switchSession,
    listSessions,
    renameSession,
    deleteSession,
    listSessionVersions
} from './store'

// ==================== 快照 ====================

export { detectChanges, saveSnapshot, restoreSnapshot } from './snapshot'

// ==================== 差异对比 ====================

export { diffVersion, diffBetweenVersions } from './diff'

// ==================== 类型 ====================

export type {
    AIVersionConfig,
    FileChange,
    FileStatus,
    Snapshot,
    Version,
    Session,
    VersionIndex,
    CreateSessionOptions,
    ListSessionsOptions,
    DiffMode,
    DiffOptions,
    CleanOptions,
    StoreStats
} from './types'

export { DEFAULT_CONFIG, DEFAULT_SESSION_ID, DEFAULT_SESSION_NAME } from './types'
