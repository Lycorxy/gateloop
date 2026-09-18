/**
 * GateLoop 类型定义
 *
 * Anchor-Driven Skill 的核心契约类型。
 * 任何 Skill 通过声明 AnchorManifest 即可获得 GateLoop 能力。
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
    /**
     * ★ manifest 文件所在目录的绝对路径（由 loadManifest 自动填充，非用户配置）。
     * 用途：reads 与脚本命令支持相对 skill 目录解析（reads 两级 fallback、命令 ${skillDir} 占位符），
     * 让 skill 可移植——放入任意目录（如 knote），不依赖 .codebuddy/skills/<name> 固定前缀。
     */
    manifestDir?: string
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

    /**
     * ★ 编排层：任务决策记忆配置
     *
     * 管的是「决策事实」——跨任务/跨轮沉淀的结论（需求分析结论、架构选型、项目约定）。
     * 不是「经验记忆」（solution/pitfall/convention 那类语义召回的经验）——
     * 那是经验记忆系统的职责，两者数据模型与检索模型不同，刻意不合并。
     *
     * 区别于 artifact：artifact 是任务内数据管道，任务 done 后随 scratch 清理；
     * 决策记忆跨任务存活，下个工程/下一轮能精确读到。
     *
     * 引擎在 anchor 的 readsMemory 时读入内联进指令，writesMemory 时校验已回写。
     * 本地 JSON 为唯一确定性事实源，MemoryHooks 可选增强但不绑定特定服务。
     */
    memory?: MemoryConfig

    /**
     * ★ 编排层：非线性跳转的环检测阈值（同一 anchor 被跳入的最大次数），默认 3。
     *
     * onPass/onEscalate 引入了非线性编排（设计不通过跳回需求、部署失败回滚质检），
     * 为防死循环，引擎记录每个 anchor 的跳入次数，超阈值强制熔断。
     */
    maxJumps?: number
}

/**
 * ★ 任务决策记忆配置
 *
 * 通用机制：引擎只管"读入内联 + 回写校验"的形式契约，不含任何业务语义。
 * 本地 JSON 永远是唯一确定性事实源；mcp=true 时上层可注入 MemoryHooks 做增强，
 * 但引擎不依赖任何特定 MCP 服务，未注入时降级到本地文件。
 */
export interface MemoryConfig {
    /** 本地兜底存储文件（相对 cwd），默认 .specflow/memory/store.json */
    localStore?: string
    /**
     * 是否接 MCP（真实读写由上层注入 MemoryHooks；未注入时降级到 localStore）。
     * 引擎侧只是声明"期望走 MCP"，保证 MCP 缺失时 skill 仍独立可用。
     */
    mcp?: boolean
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

    /**
     * ★ 补丁C（编排层）：本 anchor 委派执行的子 skill 名。
     *
     * 编排层（flow.config.json）用这个字段表达"这个阶段交给某个子 skill 完成"。
     * 引擎不信"模型说调了 skill"，而是通过本 anchor 的 verify（校验该 skill 的
     * 确定性产物：产物文件 fresh / tsc / lint / review 结论）来证明 skill 真跑了。
     *
     * 仅作声明与提示（内联进 brief 提示模型 use_skill），硬门禁仍落在 verify。
     */
    delegateSkill?: string

    /**
     * ★ 编排层：本 anchor 启动时读入的决策记忆 key 列表（精确 key，非语义搜索）。
     *
     * 类比 consumes：引擎从决策记忆 store 按 key 精确读出内容，内联进指令，
     * 模型不需要自己去找上一个工程留下的决策结论。MCP 缺失时从 localStore 读。
     * 注意：这里要的是"确定性命中"（给定 key 必返回对应值），
     * 不是经验记忆那种"语义召回 topK"——故不走经验记忆系统。
     */
    readsMemory?: string[]

    /**
     * ★ 编排层：本 anchor 完成时必须回写的决策记忆 key 列表。
     *
     * 类比 emits：推进时引擎校验这些 key 已写入决策记忆 store（未写则不许推进），
     * 保证"本轮决策结论沉淀下来"这件事不被模型跳过——确定的交给脚本。
     */
    writesMemory?: string[]

    /**
     * ★ 通用钩子层：声明读入哪些上游 anchor 的上下文存档。
     *
     * 引擎自动存档每个 anchor 完成时的完整执行上下文（入参/出参/验证结果），
     * 下游声明 readsContext 即可读到——防多 skill 协作时信息衰减。
     * 类比 consumes（传 artifact 文件内容），readsContext 传的是"上下文链"。
     */
    readsContext?: string[]

    /**
     * ★ 补丁B（编排层）：验证通过后跳转的目标 anchor id（默认下一个）。
     *
     * 支持非线性编排的正向跳转（如条件分支）。目标必须是 manifest 内已声明的 id。
     */
    onPass?: string

    /**
     * ★ 补丁B（编排层）：熔断后跳转的目标 anchor id（默认停在 escalate）。
     *
     * 用于回滚/降级（如部署失败回退到质检、设计不通过跳回需求）。
     * 引擎带环检测（maxJumps），超阈值强制停在 escalate 防死循环。
     */
    onEscalate?: string
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
     * 免除模型手动调 `nut gateloop emit` 的负担，让客观 anchor 真正零模型参与。
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
    /** ★ 补丁B：本 anchor 被跳入的次数（环检测用，超 maxJumps 强制熔断） */
    jumpCount?: number
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
    /** ★ 补丁A：内联的决策记忆内容（readsMemory 声明的 key，模型不需要自己找） */
    memoryInline?: MemoryInline[]
    /** ★ 通用钩子层：beforeAnchor 钩子注入的上下文（影响分析/知识库/figma解析等） */
    contextInline?: ContextItem[]
    /** ★ 通用钩子层：readsContext 声明的上游上下文存档（防信息衰减的上下文链） */
    contextArchiveInline?: ContextArchive[]
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

/**
 * ★ 补丁A：内联决策记忆（readsMemory 读出的 key 内容）
 */
export interface MemoryInline {
    /** 记忆 key */
    key: string
    /** 内容（JSON 序列化值） */
    content: string
}

// ==================== 通用生命周期钩子（编排层） ====================

/**
 * ★ 通用上下文项（钩子产出的信息单元）
 *
 * 统一的信息注入格式：无论来自记忆系统、知识库、figma-to-code、代码影响分析，
 * 都产出 ContextItem，引擎统一内联进指令。引擎不关心内容语义，只管注入。
 */
export interface ContextItem {
    /** 来源标记（如 "impact-analysis" / "knowledge-base" / "figma" / "memory"） */
    source: string
    /** 内容（文本，可直接内联进指令给模型看） */
    content: string
    /** 类型标签（仅供展示分类，如 "analysis" / "knowledge" / "memory" / "design"） */
    kind?: string
}

/**
 * ★ 钩子上下文（传给钩子函数的运行时信息）
 *
 * 引擎在调 beforeAnchor/afterAnchor 时构建，让外部系统拿到当前状态。
 */
export interface HookContext {
    /** 当前 anchor id */
    anchorId: string
    /** anchor 名称 */
    anchorName?: string
    /** 工作目录 */
    cwd: string
    /** 当前状态快照（只读） */
    state: AnchorState
    /** 当前 anchor 消费的上游 artifact（完整内容） */
    artifacts: Record<string, Artifact>
    /** 当前 anchor 定义（只读） */
    anchor: AnchorDefinition
}

/**
 * ★ 生命周期钩子（上层注入，引擎只认契约）
 *
 * 通用接入点：记忆系统、上下文系统、知识库、figma-to-code、代码影响分析等，
 * 都通过这两个钩子接入 GateLoop 流程，保证多 skill/多 agent 协作时信息不衰减。
 *
 * 设计原则（与 MemoryHooks 一致）：
 *   - 可选注入：未注入时引擎降级跳过，skill 照样独立可用
 *   - 引擎不含业务语义：钩子做什么由上层决定，引擎只管调用 + 内联
 *   - 不绑定特定服务：上层注入什么系统就接什么系统
 */
export interface AnchorHooks {
    /**
     * anchor 开始前调用：返回的 ContextItem 会被内联进指令。
     *
     * 典型用途：
     *   - 代码影响分析：分析当前 anchor 要改的文件影响哪些模块
     *   - 知识库检索：按当前 anchor 的 brief 语义搜索相关文档
     *   - figma-to-code：解析设计稿产出 DOM+Style 上下文
     *   - 经验记忆：语义搜索相关经验（区别于 readsMemory 的精确 key）
     */
    beforeAnchor?: (ctx: HookContext) => Promise<ContextItem[] | undefined>
    /**
     * anchor 完成后调用（verify 通过后）：接收完整执行上下文供存档。
     *
     * 典型用途：
     *   - 经验记忆写入：把本轮解决问题的经验写入记忆系统
     *   - 上下文存档：把执行上下文存到外部系统
     *   - 知识库更新：把新产出的知识写入知识库
     *
     * 注意：引擎本身也会自动存档 ContextArchive（本地 JSONL），
     * afterAnchor 是给外部系统"额外存一份"的机会。
     */
    afterAnchor?: (ctx: HookContext, result: VerifyResult, archive: ContextArchive) => Promise<void>
    /**
     * ★ 统一事件流（通知钩子）：节点开始/完成/失败/熔断/流程完成，都走这里。
     *
     * 外部系统（业务方）实现这一个接口，即可：
     *   - 追踪进度：每个节点执行到哪、是否完成（stage_start / stage_complete / done）
     *   - 出错通知：验证失败、熔断（stage_verify_fail / escalate）
     *
     * 与 beforeAnchor/afterAnchor 的区别：onEvent 是纯通知（只读、不返回值、不改流程），
     * 用于把流程进度/异常实时推给外部（发消息、写监控、调 HTTP 接口、调 MCP）。
     * 引擎只负责在关键节点触发事件，通知的具体方式由注入方决定。
     * 后续业务可通过实现该钩子补充任意通知逻辑，无需改引擎。
     */
    onEvent?: (event: AnchorEvent) => Promise<void>
}

/**
 * ★ 节点事件（统一事件流，供 onEvent 钩子消费）
 *
 * 引擎在状态转换的关键节点触发，外部系统通过 onEvent 钩子接收。
 * 事件是纯通知（只读），外部不能通过它改流程。
 */
export type AnchorEventType =
    | 'stage_start' // 节点开始（进入新阶段）
    | 'stage_verify_fail' // 节点验证失败（将重试）
    | 'stage_complete' // 节点完成并推进
    | 'escalate' // 熔断（连续失败超限）
    | 'done' // 流程全部完成

export interface AnchorEvent {
    /** 事件类型 */
    type: AnchorEventType
    /** 当前节点 id */
    stageId: string
    /** 节点名称 */
    stageName?: string
    /** 触发时间 */
    timestamp: string
    /** 尝试次数（verify_fail / complete / escalate 时） */
    attempts?: number
    /** 错误信息（verify_fail / escalate 时） */
    errors?: string[]
    /** 推进到的下一阶段（complete 时） */
    nextStage?: string
}

/**
 * ★ 上下文存档（引擎自动构建，防信息衰减）
 *
 * 每个 anchor 完成时，引擎自动把它的完整执行上下文存档到本地 JSONL。
 * 下游 anchor 通过 readsContext 声明读取，引擎内联进 contextArchiveInline。
 *
 * 解决的问题：多 skill/多 agent 协作时，每经过一个 skill 上下文衰减一层——
 * 最后只剩文件路径，"为什么这么做""验证了什么""考虑过什么"全丢。
 * 存档管道让信息不衰减反累积。
 */
export interface ContextArchive {
    /** anchor id */
    anchorId: string
    /** anchor 名称 */
    anchorName?: string
    /** 消费了哪些上游 artifact key */
    consumed: string[]
    /** 产出了哪些 artifact key */
    emitted: string[]
    /** 产出了哪些文件 */
    produced: string[]
    /** 验证了什么（verify 的 checks 清单 + 结果） */
    verifyChecks: VerifyCheck[]
    /** 完成时间 */
    completedAt: string
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
