/**
 * Lint 工具类型定义
 *
 * ESLint 和 Stylelint 的规则提取、验证和修复
 */

// ==================== 规则类型 ====================

/** 规则来源 */
export type RuleSource = 'eslint' | 'stylelint' | 'typescript' | 'custom'

/** 规则严重级别 */
export type RuleSeverity = 'off' | 'warn' | 'error' | 0 | 1 | 2

/** 规则配置 */
export interface RuleConfig {
    /** 规则名称 */
    name: string
    /** 规则来源 */
    source: RuleSource
    /** 严重级别 */
    severity: RuleSeverity
    /** 规则选项 */
    options?: unknown[]
    /** 规则描述 */
    description?: string
    /** 规则分类 */
    category?: string
    /** 是否已废弃 */
    deprecated?: boolean
    /** 替代规则 */
    replacedBy?: string[]
}

/** 规则元数据 */
export interface RuleMetadata {
    /** 规则名称 */
    name: string
    /** 规则来源 */
    source: RuleSource
    /** 规则描述 */
    description: string
    /** 规则分类 */
    category: string
    /** 是否已废弃 */
    deprecated: boolean
    /** 替代规则 */
    replacedBy?: string[]
    /** 规则文档 URL */
    url?: string
    /** 规则示例 */
    examples?: Array<{
        code: string
        output?: string
        description?: string
    }>
    /** 注意事项 */
    notes?: string[]
    /** 相关规则 */
    relatedRules?: string[]
    /** 是否可自动修复 */
    fixable?: boolean
    /** 配置值（来自项目 .eslintrc，如 "error"、"warn"、0、"off"） */
    configValue?: string | number | Array<string | number | Record<string, unknown>>
    /** 配置中的选项参数（如 ['error', { max: 10 }] 中的 { max: 10 }） */
    configOptions?: unknown[]
    /** 配置来源：extends 或 local */
    configSource?: string
    /** 继承链 */
    extendsChain?: Array<{
        name: string
        depth: number
        configValue: string | number | Array<string | number | Record<string, unknown>>
    }>
    /** 继承深度 */
    depth?: number
    /** 是否被覆盖 */
    isOverridden?: boolean
}

/** 规则列表 */
export interface RuleList {
    /** 规则来源 */
    source: RuleSource
    /** 规则列表 */
    rules: RuleMetadata[]
    /** 总规则数 */
    total: number
    /** 已废弃规则数 */
    deprecated: number
}

// ==================== 知识库类型 ====================

/** 知识库条目 */
export interface KnowledgeEntry {
    /** 规则名称 */
    ruleName: string
    /** 规则来源 */
    source: RuleSource
    /** 规则描述 */
    description: string
    /** 规则文档 URL */
    url: string
    /** 规则示例 */
    examples: Array<{
        title: string
        code: string
        output?: string
        explanation?: string
    }>
    /** 注意事项 */
    notes: string[]
    /** 错误示例 */
    incorrectExamples: Array<{
        title?: string
        code: string
        output?: string
        explanation?: string
    }>
    /** 正确示例 */
    correctExamples: Array<{
        title?: string
        code: string
        output?: string
        explanation?: string
    }>
    /** 自动修复 */
    fixable: boolean
    /** 修复示例 */
    fixExamples?: Array<{
        before: string
        after: string
        explanation?: string
    }>
    /** 相关规则 */
    relatedRules: string[]
    /** 最后更新时间 */
    lastUpdated: Date
    /** 配置值（来自项目配置） */
    configValue?: string | number | Array<string | number | Record<string, unknown>>
    /** 配置来源：extends 或 local */
    configSource?: string
    /** 继承链 */
    extendsChain?: Array<{
        name: string
        depth: number
        configValue: string | number | Array<string | number | Record<string, unknown>>
    }>
    /** 继承深度 */
    depth?: number
    /** 规则分类（problem/suggestion/layout） */
    category?: string
}

/** 知识库 */
export interface KnowledgeBase {
    /** 知识库版本 */
    version: string
    /** 最后更新时间 */
    lastUpdated: Date
    /** ESLint 规则知识库 */
    eslint: KnowledgeEntry[]
    /** Stylelint 规则知识库 */
    stylelint: KnowledgeEntry[]
    /** TypeScript 规则知识库 */
    typescript: KnowledgeEntry[]
}

// ==================== 验证类型 ====================

/** 验证问题 */
export interface LintIssue {
    /** 规则名称 */
    ruleName: string
    /** 规则来源 */
    source: RuleSource
    /** 严重级别 */
    severity: 'error' | 'warning' | 'info'
    /** 错误消息 */
    message: string
    /** 文件路径 */
    filePath: string
    /** 行号 */
    line: number
    /** 列号 */
    column: number
    /** 结束行号 */
    endLine?: number
    /** 结束列号 */
    endColumn?: number
    /** 是否可自动修复 */
    fixable: boolean
    /** 修复建议 */
    fix?: {
        range: [number, number]
        text: string
    }
}

/** 验证结果 */
export interface LintResult {
    /** 是否成功 */
    success: boolean
    /** 文件路径 */
    filePath: string
    /** 问题列表 */
    issues: LintIssue[]
    /** 错误数 */
    errorCount: number
    /** 警告数 */
    warningCount: number
    /** 可修复数 */
    fixableCount: number
    /** 执行耗时（毫秒） */
    duration: number
    /** 输出 */
    output?: string
}

/** 批量验证结果 */
export interface BatchLintResult {
    /** 总文件数 */
    totalFiles: number
    /** 成功文件数 */
    successFiles: number
    /** 失败文件数 */
    failedFiles: number
    /** 总问题数 */
    totalIssues: number
    /** 总错误数 */
    totalErrors: number
    /** 总警告数 */
    totalWarnings: number
    /** 可修复问题数 */
    fixableIssues: number
    /** 详细结果 */
    results: LintResult[]
    /** 总耗时（毫秒） */
    duration: number
}

// ==================== 修复类型 ====================

/** 修复选项 */
export interface FixOptions {
    /** 是否写入文件，默认 false */
    write?: boolean
    /** 是否修复所有问题，默认 false */
    fixAll?: boolean
    /** 指定修复的规则 */
    rules?: string[]
    /** 最大修复次数，默认 10 */
    maxFixes?: number
    /** 是否跳过错误 */
    skipErrors?: boolean
}

/** 修复结果 */
export interface FixResult {
    /** 是否成功 */
    success: boolean
    /** 文件路径 */
    filePath: string
    /** 修复的问题数 */
    fixedCount: number
    /** 剩余问题数 */
    remainingCount: number
    /** 修复的问题列表 */
    fixedIssues: Array<{
        ruleName: string
        line: number
        column: number
    }>
    /** 未修复的问题列表 */
    unfixedIssues: Array<{
        ruleName: string
        line: number
        column: number
        reason: string
    }>
    /** 执行耗时（毫秒） */
    duration: number
}

/** 批量修复结果 */
export interface BatchFixResult {
    /** 总文件数 */
    totalFiles: number
    /** 成功修复文件数 */
    successFiles: number
    /** 失败修复文件数 */
    failedFiles: number
    /** 总修复问题数 */
    totalFixed: number
    /** 总剩余问题数 */
    totalRemaining: number
    /** 详细结果 */
    results: FixResult[]
    /** 总耗时（毫秒） */
    duration: number
}

// ==================== 配置类型 ====================

/** ESLint 配置 */
export interface ESLintConfig {
    /** 配置文件路径 */
    configPath?: string
    /** 规则配置 */
    rules?: Record<string, RuleSeverity | [RuleSeverity, ...unknown[]]>
    /** 忽略模式 */
    ignorePatterns?: string[]
    /** 使用的扩展 */
    extends?: string[]
    /** 环境 */
    env?: Record<string, boolean>
    /** 解析器 */
    parser?: string
    /** 解析器选项 */
    parserOptions?: Record<string, unknown>
    /** 插件 */
    plugins?: string[]
}

/** Stylelint 配置 */
export interface StylelintConfig {
    /** 配置文件路径 */
    configPath?: string
    /** 规则配置 */
    rules?: Record<string, RuleSeverity | [RuleSeverity, ...unknown[]]>
    /** 忽略模式 */
    ignorePatterns?: string[]
    /** 使用的扩展 */
    extends?: string[]
    /** 插件 */
    plugins?: string[]
    /** 自定义语法 */
    customSyntax?: string
}

/** 项目 Lint 配置 */
export interface ProjectLintConfig {
    /** 项目根目录 */
    rootDir: string
    /** 是否有 ESLint */
    hasEslint: boolean
    /** 是否有 Stylelint */
    hasStylelint: boolean
    /** 是否有 TypeScript */
    hasTypeScript: boolean
    /** ESLint 配置 */
    eslintConfig?: ESLintConfig
    /** Stylelint 配置 */
    stylelintConfig?: StylelintConfig
    /** ESLint 配置文件路径 */
    eslintConfigPath?: string
    /** Stylelint 配置文件路径 */
    stylelintConfigPath?: string
    /** 忽略文件路径 */
    ignorePath?: string
}

// ==================== 工具输入类型 ====================

/** 提取规则输入 */
export interface ExtractRulesInput {
    /** 工作目录 */
    cwd?: string
    /** 规则来源 */
    source?: RuleSource
    /** 是否包含废弃规则 */
    includeDeprecated?: boolean
}

/** 生成知识库输入 */
export interface GenerateKnowledgeInput {
    /** 工作目录 */
    cwd?: string
    /** 规则来源 */
    source?: RuleSource
    /** 规则列表 */
    rules?: string[]
    /** 是否覆盖已存在的文件 */
    overwrite?: boolean
    /** 输出目录（相对于 cwd），默认 .codebuddy/knowledge/lint */
    outputDir?: string
}

/** 验证输入 */
export interface LintInput {
    /** 文件路径或模式 */
    patterns: string | string[]
    /** 工作目录 */
    cwd?: string
    /** 规则来源 */
    source?: RuleSource
    /** 是否使用缓存 */
    cache?: boolean
    /** 是否显示进度 */
    progress?: boolean
}

/** 修复输入 */
export interface FixInput {
    /** 文件路径或模式 */
    patterns: string | string[]
    /** 工作目录 */
    cwd?: string
    /** 规则来源 */
    source?: RuleSource
    /** 修复选项 */
    options?: FixOptions
}
