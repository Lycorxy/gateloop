/**
 * ADS 类型定义
 *
 * Anchor-Driven Skill 的核心契约类型。
 * 任何 Skill 通过声明 AnchorManifest 即可获得 ADS 能力。
 *
 * 设计层次：
 *   Anchor（阶段）= 固定的方法论骨架（design → code → verify）
 *   SubTask（子任务）= 运行时在某个 anchor 内动态拆出的工作项
 *   Artifact（产物数据）= 阶段间显式传递的数据（consumes/emits 契约）
 *   Scratch（临时工作区）= 每个任务隔离的临时目录，支持生命周期清理
 */

// ==================== Manifest（Skill 声明）====================

/**
 * Skill 锚点清单（声明式配置）
 *
 * 示例见 anchor.config.json 模板文件
 */
export interface AnchorManifest {
    /** Skill 名称 */
    name: string
    /** 描述 */
    description: string
    /** 锚点（阶段）列表，按执行顺序排列 */
    anchors: AnchorDefinition[]
    /** 状态文件路径（相对工作目录），默认 .specflow/anchor-state.json */
    stateFile?: string
    /** 日志文件路径（相对工作目录），默认 .specflow/anchor-log.jsonl */
    logFile?: string
    /** 临时工作区根目录（相对工作目录），默认 .specflow/scratch */
    scratchDir?: string
    /** scratch 过期回收小时数（超过未更新则 GC），默认 72 小时 */
    scratchGcHours?: number
    /** 单阶段最大重试次数（超过则熔断 escalate），默认 5 */
    maxAttempts?: number
    /** 工作目录，默认 process.cwd() */
    cwd?: string
}

/**
 * 单个锚点（阶段）定义
 */
export interface AnchorDefinition {
    /** 锚点唯一标识（如 design / code / verify） */
    id: string
    /** 锚点名称（人类可读） */
    name?: string
    /** 给 LLM 的简报：目标 + 约束 */
    brief?: string
    /** 本阶段需要读取的规则文件（内容会被内联进指令） */
    reads?: string[]
    /** 本阶段必须产出的文件（glob 或具体路径） */
    produces?: string[]
    /** 本阶段允许调用的工具白名单 */
    allowedTools?: string[]
    /** 声明依赖上游哪些 artifact key（内容会被内联进指令） */
    consumes?: string[]
    /** 声明本阶段产出哪些 artifact key（推进时校验是否已 emit） */
    emits?: string[]
    /** 本阶段单独的最大重试次数（覆盖 manifest.maxAttempts） */
    maxAttempts?: number
    /** 是否要求本阶段拆分子任务（true 时子任务必须全部完成才可推进） */
    requiresSubtasks?: boolean
    /** 验证配置 */
    verify?: AnchorVerify
    /** 子代理提示词模板（可选，用于派 code-explorer 子上下文） */
    subagentPrompt?: string
}

/**
 * 单条评审项（由 skill 在 anchor 配置中注入，模型/脚本都不能增删）
 */
export interface ReviewItem {
    /** 评审项 ID（稳定标识，用于比对结论完整性） */
    id: string
    /** 评审规则描述（给模型看的判定标准） */
    rule: string
    /**
     * 判定方式：
     * - 'script': 确定性规则，由脚本跑 command 判 exit code（引擎重跑核对，不信模型）
     * - 'model':  主观质量，由模型逐条给 verdict + evidence（脚本卡形式不卡内容）
     */
    mode: 'script' | 'model'
    /** mode='script' 时的判定命令（exit 0 = pass） */
    command?: string
    /** 是否为阻断项：fail 时禁止推进（默认 true）；false = 仅告警记录 */
    blocking?: boolean
}

/**
 * 结构化质量评审配置
 *
 * 通用机制：引擎只强制"评审动作"（逐条评+留痕+卡形式），不含任何业务规则。
 * checklist 的具体内容由 skill 在 anchor.config 里注入——
 * 前端组件一套、后端接口一套、DB schema 一套，引擎不认识这些概念。
 *
 * 评审结论产物（ReviewConclusion）由模型/脚本写入 output 指定的文件，
 * 引擎在 verify 时读取并校验四道形式门禁（见 verify.ts runReviewCheck）。
 */
export interface ReviewConfig {
    /** 评审项清单（由 skill 注入，模型/脚本都不能增删） */
    checklist: ReviewItem[]
    /** 评审结论产物路径（相对 cwd，模型/脚本写入，引擎校验） */
    output: string
    /** 是否要求每个 model 项都带证据（行号/符号名），默认 true */
    requireEvidence?: boolean
}

/**
 * 验证配置
 * 多个验证器 AND 关系，全部通过才算 PASS
 */
export interface AnchorVerify {
    /** JSON Schema 校验产物结构 */
    schema?: JSONSchema
    /** 跑 ESLint（可指定 files） */
    lint?: boolean | { files?: string[] }
    /**
     * 跑 ESLint 自动修复（npx nut lint fix --write），在 lint run 之前同步执行。
     *
     * 铁律 1 要求：编码 → fix → run → 0 错误。
     * 将 fix 纳入引擎验证管道，模型无法跳过——
     * 引擎在 verify 时自动执行 fix，再跑 lint run 检测剩余错误。
     * 修复操作会修改文件，必须在命令类校验（lint run / tsc）之前完成。
     */
    lintFix?: boolean | { files?: string[] }
    /** 跑 tsc --noEmit */
    tsc?: boolean
    /** 跑 Stylelint */
    stylelint?: boolean | { files?: string[] }
    /** 跑构建（npm run build） */
    build?: boolean | { command?: string }
    /** 跑单测（vitest run / npm test） */
    test?: boolean | { command?: string }
    /** 自定义验证命令（exit 0 = 通过） */
    custom?: string | string[]
    /** 产物文件存在性校验（默认 true，当 produces 非空时） */
    producesExist?: boolean
    /** 产物 mtime 校验：必须晚于本阶段"当前一轮"开始（防复用旧文件） */
    producesFresh?: boolean
    /** 文件规模校验：行数/函数行数/圈复杂度（独立于 ESLint） */
    fileSize?:
        | boolean
        | { maxFileLines?: number; maxFunctionLines?: number; maxComplexity?: number }
    /** Prettier 格式化校验（独立于 ESLint 的 prettier 插件） */
    prettier?: boolean | { files?: string[] }

    /**
     * 结构化质量评审（通用骨架，checklist 内容由 skill 注入）
     *
     * 引擎只负责：强制逐条评审 + 结论留痕 + 卡评审形式完整性。
     * 质量标准本身由 skill 在 checklist 里定义，引擎不含任何业务规则。
     * 详见 ReviewConfig。
     */
    review?: ReviewConfig

    /**
     * 产出型脚本：在文件类校验（producesExist/producesFresh/schema）之前串行执行。
     *
     * 用于"客观输入先行"场景（如 inventory 清单 anchor）：脚本产出 produces
     * 声明的文件，引擎再校验存在性/新鲜度/结构。
     *
     * 解决原架构"文件类校验先于 custom"导致的死锁——
     * 首次进入时产物尚不存在，producesExist 即失败，custom（产出脚本）被跳过。
     *
     * 与 autoEmit 配合可实现"模型不参与判断"的客观 anchor。
     */
    produceScripts?: string[]

    /**
     * 自动 emit：produceScripts 全部成功后，引擎按 key→path 自动产出 artifact。
     *
     * 免除模型手动调 `nut ads emit` 的负担，让客观 anchor 真正零模型参与。
     * key = artifact key（供下游 consumes 引用），path = 产物文件路径（相对 cwd）。
     *
     * 仅在 doNext（推进）时触发；check（手动验证）不触发，避免副作用。
     */
    autoEmit?: Record<string, string>

    /**
     * 产物是否允许模型直接写（默认 true）。
     *
     * false = 产物应由 produceScripts 产出，模型不应直接写。
     * 配置约束：modelWritable:false 时必须配 produceScripts，否则引擎报配置错误。
     * 防伪本质靠 produceScripts 在 verify 重跑覆盖；此字段为声明性约束 + 配置自检。
     */
    modelWritable?: boolean
}

/**
 * verify 钩子（引擎注入，供 verify 内部回调引擎能力）
 *
 * 当前用于 autoEmit：produceScripts 成功后，引擎通过 emit 回调
 * 更新 state.artifacts 并持久化（由 doNext 注入实现）。
 */
export interface VerifyHooks {
    /** 产出型脚本成功后自动 emit artifact（更新 state + 持久化） */
    emit?: (artifact: {
        key: string
        kind: 'file' | 'value'
        path?: string
        value?: unknown
    }) => void
}

// ==================== 状态机 ====================

/**
 * 状态文件结构（anchor-state.json）
 *
 * 只有 advance() 函数能写入，模型无权修改。
 */
export interface AnchorState {
    /** Manifest 名称 */
    skillName: string
    /** 任务描述 */
    task: string
    /** 任务唯一 ID（用于 scratch 目录隔离） */
    taskId: string
    /** 当前阶段索引 */
    currentAnchorIndex: number
    /** 当前阶段 ID */
    currentStage: string
    /** 阶段历史 */
    stages: StageRecord[]
    /** 阶段间传递的数据管道（key → artifact） */
    artifacts: Record<string, Artifact>
    /** 创建时间 */
    createdAt: string
    /** 最后更新时间 */
    updatedAt: string
    /** 是否已完成 */
    done: boolean
}

/**
 * 单个阶段的执行记录
 */
export interface StageRecord {
    /** 阶段 ID */
    anchorId: string
    /** 状态 */
    status: 'pending' | 'in_progress' | 'passed' | 'failed' | 'escalated'
    /** 开始时间（首次进入本阶段） */
    startedAt?: string
    /** 本轮尝试开始时间（用于 producesFresh，重做/续跑时刷新） */
    attemptStartedAt?: string
    /** 完成时间 */
    completedAt?: string
    /** 验证结果 */
    verifyResult?: VerifyResult
    /** 重试次数 */
    attempts: number
    /** 是否已熔断（超过 maxAttempts） */
    escalated?: boolean
    /** 运行时动态拆分的子任务 */
    subtasks?: SubTask[]
}

/**
 * 子任务（运行时在某个 anchor 内动态生成的工作项）
 */
export interface SubTask {
    /** 子任务 ID */
    id: string
    /** 描述 */
    desc: string
    /** 状态 */
    status: 'pending' | 'done'
    /** 本子任务应产出的文件（可选，用于校验） */
    produces?: string[]
    /** 创建时间 */
    createdAt: string
    /** 完成时间 */
    completedAt?: string
}

/**
 * 阶段间传递的数据（artifact）
 */
export interface Artifact {
    /** artifact key */
    key: string
    /** 产出该 artifact 的阶段 ID */
    producedBy: string
    /** 数据类型：file = 文件路径引用，value = 内联值 */
    kind: 'file' | 'value'
    /** kind=file 时为文件路径；kind=value 时忽略 */
    path?: string
    /** kind=value 时为内联数据（JSON 可序列化） */
    value?: unknown
    /** 产出时间 */
    producedAt: string
}

// ==================== 质量评审结论产物 ====================

/**
 * 单条评审结论（模型/脚本写入 ReviewConfig.output 指定的文件）
 */
export interface ReviewVerdict {
    /** 评审项 ID（对应 ReviewItem.id） */
    id: string
    /** 判定方式（对应 ReviewItem.mode） */
    mode: 'script' | 'model'
    /** 结论：pass / fail */
    verdict: 'pass' | 'fail'
    /** 证据（行号/符号名/脚本输出摘要；model 项必填，script 项可选） */
    evidence?: string
}

/**
 * 评审结论产物（写入 ReviewConfig.output 指定的文件）
 */
export interface ReviewConclusion {
    /** 评审项结论列表（数量须与 ReviewConfig.checklist 一致） */
    verdicts: ReviewVerdict[]
}

// ==================== 验证结果 ====================

export interface VerifyResult {
    /** 是否通过 */
    passed: boolean
    /** 各项检查结果 */
    checks: VerifyCheck[]
    /** 错误汇总（失败时） */
    errors: string[]
    /** 耗时 ms */
    duration: number
}

export interface VerifyCheck {
    /** 检查名称 */
    name: string
    /** 是否通过 */
    passed: boolean
    /** 详情（stdout/错误信息） */
    output?: string
    /** 耗时 ms */
    duration?: number
}

// ==================== 指令（advance 返回给 LLM 的）====================

/**
 * advance() 返回的指令对象
 *
 * LLM 只需按此指令执行，不需要自己判定阶段。
 */
export interface AnchorInstruction {
    /** 当前阶段 ID */
    stage: string
    /** 阶段名称 */
    stageName?: string
    /** 简报（目标 + 约束） */
    brief?: string
    /** 内联的规则内容（reads 文件的内容，模型不需要自己 read） */
    rulesInline?: RuleInline[]
    /** 内联的上游 artifact 内容（consumes 声明的数据，模型不需要自己找） */
    artifactsInline?: ArtifactInline[]
    /** 本阶段产出的文件列表 */
    produces?: string[]
    /** 本阶段需要产出的 artifact key */
    emits?: string[]
    /** 允许调用的工具 */
    allowedTools?: string[]
    /** 当前阶段的子任务清单（若已拆分） */
    subtasks?: SubTask[]
    /** 是否要求先拆分子任务 */
    requiresSubtasks?: boolean
    /** 临时工作区目录（本任务隔离，可写草稿） */
    scratchDir?: string
    /** 子代理提示词 */
    subagentPrompt?: string
    /** 验证命令（展示给 LLM 看，但由 advance 内部执行） */
    verifyHint?: string
    /** 是否已推进（false = 验证未过，需重做） */
    advanced: boolean
    /** 是否已完成所有阶段 */
    done: boolean
    /** 是否已熔断（连续失败超上限，需人工介入/降级） */
    escalate?: boolean
    /** 已尝试次数 / 上限 */
    attempts?: number
    /** 最大尝试次数 */
    maxAttempts?: number
    /** 验证结果（advanced=false 时附带，供 LLM 修复） */
    verifyResult?: VerifyResult
    /** 下一动作指引 */
    nextAction: string
}

/**
 * 内联规则
 */
export interface RuleInline {
    /** 来源文件路径 */
    source: string
    /** 文件内容 */
    content: string
}

/**
 * 内联 artifact（上游产出的数据）
 */
export interface ArtifactInline {
    /** artifact key */
    key: string
    /** 产出阶段 */
    producedBy: string
    /** 类型 */
    kind: 'file' | 'value'
    /** kind=file 时为路径 */
    path?: string
    /** 内容（file 为文件内容，value 为序列化值） */
    content: string
}

// ==================== 日志 ====================

/**
 * 日志条目（anchor-log.jsonl，每行一个 JSON）
 */
export interface LogEntry {
    /** 时间戳 */
    timestamp: string
    /** Skill 名称 */
    skill: string
    /** 任务 */
    task: string
    /** 阶段 */
    stage: string
    /** 动作类型 */
    action:
        | 'init'
        | 'advance'
        | 'verify'
        | 'done'
        | 'subtask'
        | 'artifact'
        | 'escalate'
        | 'cleanup'
        | 'reset'
    /** 验证结果 */
    verifyResult?: VerifyResult
    /** 消息 */
    message: string
}

// ==================== 引擎选项 ====================

export interface AdsOptions {
    /** 工作目录 */
    cwd?: string
    /** 是否静默（不输出日志） */
    silent?: boolean
}

// ==================== JSON Schema 简化类型 ====================

/**
 * 简化的 JSON Schema 类型（用于产物结构校验）
 */
export interface JSONSchema {
    type?: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'integer'
    required?: string[]
    properties?: Record<string, JSONSchema>
    items?: JSONSchema
    additionalProperties?: boolean
}
