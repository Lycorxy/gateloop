/**
 * AI 版本管理 - 类型定义（多会话版本）
 *
 * 完全独立的版本管理系统，不影响 Git 主线。
 * 支持多会话并行，每个 AI 对话窗口可以有独立的历史记录。
 *
 * 使用场景：
 * - 同时开多个 AI 窗口，各自独立保存快照
 * - 不同功能模块的开发互不干扰
 * - 随时查看/回滚到任意会话的任意版本
 */

// ==================== 配置 ====================

/** 配置 */
export interface AIVersionConfig {
    /** 存储目录 */
    storeDir: string
    /** 保留天数，0 表示永不过期 */
    retentionDays: number
    /** 项目根目录 */
    projectRoot: string
    /** 当前会话 ID（运行时设置） */
    sessionId?: string
}

// ==================== 会话 ====================

/** 会话对象：代表一个独立的 AI 对话窗口 */
export interface Session {
    /** 会话唯一 ID */
    id: string
    /** 会话名称（可读性强的标识） */
    name: string
    /** 该会话当前的 HEAD 版本 ID */
    head: string | null
    /** 创建时间戳 */
    createdAt: number
    /** 最后更新时间戳 */
    updatedAt: number
    /** 可选的元信息（来源、用途等） */
    metadata?: {
        source?: string // 来源：cli | api | ide-plugin
        description?: string
        [key: string]: unknown
    }
}

/** 创建会话选项 */
export interface CreateSessionOptions {
    /** 基于某个版本创建 */
    baseVersionId?: string
    /** 从另一个会话分支 */
    branchFromSessionId?: string
    /** 元信息 */
    metadata?: Session['metadata']
}

/** 会话列表查询选项 */
export interface ListSessionsOptions {
    /** 是否只返回活跃会话（有版本的） */
    activeOnly?: boolean
    /** 返回数量限制 */
    limit?: number
}

// ==================== 文件与快照 ====================

/** 文件变更状态 */
export type FileStatus = 'added' | 'modified' | 'deleted'

/** 文件变更记录 */
export interface FileChange {
    /** 文件路径（相对于项目根目录） */
    path: string
    /** 变更状态 */
    status: FileStatus
    /** 文件内容的 blob hash */
    blobHash: string
}

/** 快照对象：记录某个时间点的所有文件状态 */
export interface Snapshot {
    /** 文件路径 → blob hash 映射 */
    files: Record<string, string>
    /** 快照时间戳 */
    timestamp: number
}

// ==================== 版本 ====================

/** 版本对象：一次 AI 会话记录 */
export interface Version {
    /** 版本 ID */
    id: string
    /** 所属会话 ID */
    sessionId: string
    /** 指向快照的 hash */
    snapshotHash: string
    /** 用户问题 */
    question: string
    /** 模型方案描述 */
    solution: string
    /** 父版本 ID（形成链） */
    parentId?: string
    /** 创建时间戳 */
    timestamp: number
    /** 变更的文件列表 */
    changedFiles: FileChange[]
    /** 用户标签（可选） */
    tag?: string
}

/** 版本索引（多会话版本） */
export interface VersionIndex {
    /** 全局 HEAD（兼容旧逻辑，指向最新版本） */
    globalHead: string | null
    /** 所有会话，key 为会话 ID */
    sessions: Record<string, Session>
    /** 所有版本，key 为版本 ID（跨会话共享存储） */
    versions: Record<string, Version>
}

// ==================== Diff ====================

/** Diff 操作模式 */
export type DiffMode = 'working-tree' | 'staged' | 'commit'

/** Diff 选项 */
export interface DiffOptions {
    /** 对比模式 */
    mode: DiffMode
    /** 指定 commit（mode 为 commit 时使用） */
    commit?: string
    /** 指定文件 */
    file?: string
    /** 生成可视化 HTML 并在浏览器中打开 */
    html?: boolean
}

// ==================== 清理 ====================

/** 清理选项 */
export interface CleanOptions {
    /** 保留天数 */
    days: number
    /** 是否模拟运行（dry run） */
    dryRun?: boolean
    /** 指定会话 ID（不传则清理全部） */
    sessionId?: string
}

// ==================== 统计 ====================

/** 存储统计 */
export interface StoreStats {
    /** 总版本数 */
    versionCount: number
    /** 会话数 */
    sessionCount: number
    /** 总 blob 数 */
    blobCount: number
    /** 总占用字节 */
    totalSize: number
    /** 孤儿 blob 数 */
    orphanBlobCount: number
    /** 各会话统计 */
    perSession?: Array<{
        sessionId: string
        sessionName: string
        versionCount: number
    }>
}

// ==================== 默认配置 ====================

/** 默认配置 */
export const DEFAULT_CONFIG: Omit<AIVersionConfig, 'projectRoot'> = {
    storeDir: '.aivnsions',
    retentionDays: 7
}

/** 默认会话名 */
export const DEFAULT_SESSION_NAME = 'default'

/** 默认会话 ID */
export const DEFAULT_SESSION_ID = 'default'
