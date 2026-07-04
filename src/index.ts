/**
 * Node-Ultra 主入口
 *
 * 统一导出所有工具模块
 */

export * from './helpers'
export * from './git'
export * from './format'
export * from './lint'

// aivn 使用显式导出，避免 Snapshot 与 git 模块中的同名类型冲突
export {
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
    updateHead,
    readHead,
    generateVersionId,
    createVersion,
    getVersion,
    getHeadVersion,
    getSessionHeadVersion,
    deleteVersion,
    cleanOldVersions,
    listVersions,
    runBlobGC,
    getStoreStats,
    AIVersionError,
    detectChanges,
    saveSnapshot,
    restoreSnapshot,
    diffVersion,
    diffBetweenVersions,
    // 多会话 API
    createSession,
    switchSession,
    getCurrentSession,
    getCurrentSessionId,
    listSessions,
    renameSession,
    deleteSession,
    listSessionVersions,
    DEFAULT_CONFIG
} from './aivn'

export type {
    AIVersionConfig,
    FileChange,
    FileStatus,
    Version,
    Snapshot,
    Session,
    VersionIndex,
    CreateSessionOptions,
    ListSessionsOptions,
    DiffMode,
    DiffOptions,
    CleanOptions,
    StoreStats
} from './aivn'
