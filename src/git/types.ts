/**
 * Git 工具类型定义
 *
 * 为 Git 操作封装提供完整的类型系统
 */

// ==================== 基础类型 ====================

/** Git 操作类型 */
export type GitOperation =
    | 'stage'
    | 'unstage'
    | 'commit'
    | 'rollback'
    | 'merge'
    | 'rebase'
    | 'checkout'
    | 'branch'
    | 'reset'
    | 'stash'
    | 'backup'
    | 'restore'

/** Git 操作状态 */
export enum GitStatus {
    /** 未修改 */
    UNMODIFIED = 'unmodified',
    /** 已修改 */
    MODIFIED = 'modified',
    /** 已暂存 */
    STAGED = 'staged',
    /** 已删除 */
    DELETED = 'deleted',
    /** 新增 */
    ADDED = 'added',
    /** 重命名 */
    RENAMED = 'renamed',
    /** 未跟踪 */
    UNTRACKED = 'untracked',
    /** 冲突 */
    CONFLICT = 'conflict'
}

/** 文件状态 */
export interface FileStatus {
    /** 文件路径 */
    path: string
    /** 工作区状态 */
    worktree: GitStatus
    /** 暂存区状态 */
    index: GitStatus
    /** 旧路径（重命名时） */
    oldPath?: string
}

/** 行尾风格 */
export type LineEnding = 'lf' | 'crlf'

// ==================== 快照类型 ====================

/** 快照信息 */
export interface Snapshot {
    /** 快照唯一ID */
    id: string
    /** 快照序号 */
    index: number
    /** 创建时间 */
    timestamp: string
    /** 分支名 */
    branch: string
    /** HEAD 提交哈希 */
    headCommit: string
    /** HEAD 简短描述 */
    headMessage: string
    /** 触发操作 */
    operation: GitOperation
    /** 用户描述 */
    description: string
    /** 工作区树哈希（用于恢复） */
    worktreeHash?: string
    /** 暂存区树哈希 */
    indexHash?: string
    /** stash 引用 */
    stashRef?: string
    /** 变更文件列表 */
    changedFiles: string[]
    /** 操作是否成功 */
    success: boolean
    /** 额外标签 */
    tags: string[]
}

/** 快照存储 */
export interface SnapshotStore {
    /** 版本 */
    version: string
    /** 创建时间 */
    createdAt: string
    /** 快照列表 */
    snapshots: Snapshot[]
    /** 当前快照索引 */
    currentIndex: number
    /** 总快照数 */
    totalCount: number
}

/** 创建快照选项 */
export interface CreateSnapshotOptions {
    /** 描述 */
    description?: string
    /** 标签 */
    tags?: string[]
    /** 是否包含未跟踪文件 */
    includeUntracked?: boolean
    /** 是否包含工作区未暂存的修改 */
    includeUnstaged?: boolean
}

/** 恢复快照选项 */
export interface RestoreSnapshotOptions {
    /** 是否强制恢复（丢弃当前修改） */
    force?: boolean
    /** 是否保留当前修改到新快照 */
    backupFirst?: boolean
    /** 是否恢复后清理快照 */
    cleanAfter?: boolean
}

// ==================== 文件变更类型 ====================

/** 文件变更信息 */
export interface FileChange {
    /** 文件路径 */
    path: string
    /** 变更类型 */
    type: 'added' | 'modified' | 'deleted' | 'renamed'
    /** 旧路径 */
    oldPath?: string
    /** 添加行数 */
    additions: number
    /** 删除行数 */
    deletions: number
    /** 变更块 */
    hunks?: DiffHunk[]
}

/** 差异块 */
export interface DiffHunk {
    /** 旧文件起始行 */
    oldStart: number
    /** 旧文件行数 */
    oldLines: number
    /** 新文件起始行 */
    newStart: number
    /** 新文件行数 */
    newLines: number
    /** 上下文行 */
    context: DiffLine[]
}

/** 差异行 */
export interface DiffLine {
    /** 行类型 */
    type: 'context' | 'added' | 'removed'
    /** 旧文件行号 */
    oldLine?: number
    /** 新文件行号 */
    newLine?: number
    /** 行内容 */
    content: string
}

// ==================== 分支类型 ====================

/** 分支信息 */
export interface BranchInfo {
    /** 分支名 */
    name: string
    /** 是否当前分支 */
    current: boolean
    /** 是否远程分支 */
    remote: boolean
    /** 远程名 */
    remoteName?: string
    /** 最新提交哈希 */
    commit: string
    /** 最新提交信息 */
    message: string
    /** 最新提交时间 */
    date: string
    /** 作者 */
    author: string
    /** 超前提交数 */
    ahead?: number
    /** 落后提交数 */
    behind?: number
}

/** 提交信息 */
export interface CommitInfo {
    /** 完整哈希 */
    hash: string
    /** 简短哈希 */
    shortHash: string
    /** 作者 */
    author: string
    /** 作者邮箱 */
    email: string
    /** 提交时间 */
    date: string
    /** 提交信息标题 */
    subject: string
    /** 提交信息正文 */
    body: string
    /** 父提交 */
    parents: string[]
    /** 引用名 */
    refs: string[]
    /** 变更统计 */
    stats?: {
        /** 修改文件数 */
        files: number
        /** 添加行数 */
        additions: number
        /** 删除行数 */
        deletions: number
    }
}

// ==================== 差异对比类型 ====================

/** 差异选项 */
export interface DiffOptions {
    /** 上下文行数 */
    context?: number
    /** 是否忽略空白 */
    ignoreWhitespace?: boolean
    /** 是否仅显示文件名 */
    nameOnly?: boolean
    /** 是否显示统计 */
    stat?: boolean
    /** 是否统一格式 */
    unified?: number
    /** 文件过滤 */
    filePattern?: string
}

/** 分支差异 */
export interface BranchDiff {
    /** 源分支 */
    source: string
    /** 目标分支 */
    target: string
    /** 超前提交 */
    ahead: CommitInfo[]
    /** 落后提交 */
    behind: CommitInfo[]
    /** 变更文件 */
    files: FileChange[]
    /** 统计 */
    stats: {
        commitsAhead: number
        commitsBehind: number
        filesChanged: number
        additions: number
        deletions: number
    }
}

/** 文件历史 */
export interface FileHistory {
    /** 文件路径 */
    path: string
    /** 提交历史 */
    commits: CommitInfo[]
    /** 每次提交的变更 */
    changes: {
        commit: string
        diff: FileChange
    }[]
}

// ==================== 操作结果类型 ====================

/** Git 操作结果 */
export interface GitResult {
    /** 是否成功 */
    success: boolean
    /** 操作类型 */
    operation: GitOperation
    /** 操作描述 */
    message: string
    /** 关联的快照ID */
    snapshotId?: string
    /** 输出数据 */
    data?: unknown
    /** 错误信息 */
    error?: string
    /** 执行耗时（毫秒） */
    duration: number
    /** 结构化摘要 */
    summary?: Record<string, unknown>
}

/** 暂存选项 */
export interface StageOptions {
    /** 文件列表 */
    files?: string[]
    /** 是否暂存所有文件 */
    all?: boolean
    /** 是否包含删除的文件 */
    includeDeleted?: boolean
    /** 是否自动修复行尾符 */
    fixLineEndings?: boolean
    /** 行尾符类型（自动检测时不需指定） */
    lineEnding?: LineEnding
}

/** 提交选项 */
export interface CommitOptions {
    /** 提交信息 */
    message: string
    /** 是否跳过 hook */
    noVerify?: boolean
    /** 是否修改上一次提交 */
    amend?: boolean
    /** 是否提交所有已跟踪文件 */
    all?: boolean
    /** 提交描述 */
    description?: string
}

/** 回滚选项 */
export interface RollbackOptions {
    /** 回滚到的快照索引或ID */
    target: string | number
    /** 是否强制 */
    force?: boolean
    /** 回滚模式 */
    mode?: 'soft' | 'mixed' | 'hard'
}

// ==================== SSH 配置类型 ====================

/** SSH 配置 */
export interface SSHConfig {
    /** 服务平台 */
    platform: 'github' | 'gitlab' | 'gitee' | 'gitcode' | 'custom'
    /** 主机名 */
    host: string
    /** 用户名 */
    user: string
    /** Token */
    token?: string
    /** SSH Key 路径 */
    keyPath: string
    /** 是否已配置 */
    configured: boolean
}

/** SSH 配置结果 */
export interface SSHResult {
    /** 是否成功 */
    success: boolean
    /** 公钥内容 */
    publicKey?: string
    /** 配置文件路径 */
    configPath?: string
    /** 下一步操作指引 */
    nextSteps: string[]
    /** 错误信息 */
    error?: string
}

/** SSH 配置选项（增强版 v2） */
export interface SSHSetupOptions {
    /** 平台类型（gitcode = 腾讯工蜂 git.woa.com） */
    platform?: 'github' | 'gitlab' | 'gitee' | 'gitcode' | 'custom'
    /** 自定义主机名（custom 模式必填） */
    host?: string
    /** 端口，默认 22 */
    port?: number
    /** 用户名，默认 git */
    user?: string
    /** 密钥注释（邮箱，如 name@tencent.com） */
    email?: string
    /** 密钥类型，默认 ed25519 */
    keyType?: 'rsa' | 'ed25519'
    /** RSA 密钥位数，默认 4096 */
    keyBits?: number
    /** 帐号标识（多帐号用，如 personal/shared） */
    account?: string
    /** 自定义密钥文件名（不含路径，默认 id_ed25519_{platform}） */
    keyName?: string
    /** Token（可选；不传则自动走 OAuth 授权获取） */
    token?: string
    /** 密钥已存在时是否强制覆盖（删除后重新生成） */
    force?: boolean
    /** 是否跳过远程公钥上传（仅本地配置） */
    skipUpload?: boolean
}

/** 工蜂/GitLab 远程 SSH Key 信息 */
export interface SSHKeyInfo {
    /** Key ID（用于删除） */
    id: number
    /** 标题 */
    title: string
    /** 公钥内容 */
    key: string
    /** 创建时间（ISO 字符串） */
    createdAt: string
}

/** 上传公钥结果（区分"已存在"与"其他失败"） */
export interface UploadKeyResult {
    /** 是否成功 */
    success: boolean
    /** 公钥已在平台存在（指纹重复） */
    alreadyExists: boolean
    /** 错误信息 */
    error?: string
}

/** Token 验证结果 */
export interface VerifyTokenResult {
    /** 是否有效 */
    valid: boolean
    /** 用户名 */
    username?: string
    /** 用户全名 */
    name?: string
    /** 用户 ID */
    userId?: number
    /** 错误信息 */
    error?: string
}

/** 多帐号配置项 */
export interface SSHAccount {
    /** 帐号名（如 personal/shared，用于 Host 别名区分） */
    name: string
    /** 邮箱（密钥注释） */
    email: string
    /** 自定义密钥文件名（可选） */
    keyName?: string
}

/** SSH 诊断检查项 */
export interface SSHTroubleshootCheck {
    /** 检查名称 */
    name: string
    /** 状态 */
    status: 'pass' | 'fail' | 'warn'
    /** 检查结果描述 */
    message: string
    /** 修复建议（fail/warn 时提供） */
    fix?: string
}

/** SSH 诊断结果 */
export interface SSHTroubleshootResult {
    /** 目标主机 */
    host: string
    /** 检查项列表 */
    checks: SSHTroubleshootCheck[]
    /** 汇总统计 */
    summary: {
        /** 通过数 */
        passed: number
        /** 失败数 */
        failed: number
        /** 警告数 */
        warnings: number
    }
}

// ==================== 行尾符处理类型 ====================

/** 行尾符检测结果 */
export interface LineEndingReport {
    /** 扫描文件总数 */
    totalFiles: number
    /** LF 文件数 */
    lfFiles: number
    /** CRLF 文件数 */
    crlfFiles: number
    /** 混合换行符文件数 */
    mixedFiles: number
    /** 期望的换行符类型 */
    expected: LineEnding
    /** 不符合期望的文件列表 */
    mismatched: {
        path: string
        current: LineEnding | 'mixed'
        expected: LineEnding
    }[]
}

// ==================== Git 管理器配置 ====================

/** Git 管理器配置 */
export interface GitManagerConfig {
    /** 工作目录 */
    cwd?: string
    /** 是否启用自动备份 */
    autoBackup?: boolean
    /** 备份保留数量 */
    maxBackups?: number
    /** 是否启用操作日志 */
    enableLog?: boolean
    /** 默认行尾符 */
    defaultLineEnding?: LineEnding
    /** SSH 密钥类型 */
    sshKeyType?: 'rsa' | 'ed25519'
    /** SSH 密钥位数 */
    sshKeyBits?: number
}
