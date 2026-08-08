/**
 * Lint 工具类型定义
 *
 * ESLint 和 Stylelint 的规则提取、验证和修复
 */

// ==================== 规则类型 ====================

export type RuleSource = 'eslint' | 'stylelint' | 'typescript' | 'custom'
export type RuleSeverity = 'off' | 'warn' | 'error' | 0 | 1 | 2

export interface RuleConfig {
    name: string
    source: RuleSource
    severity: RuleSeverity
    options?: unknown[]
    description?: string
    category?: string
    deprecated?: boolean
    replacedBy?: string[]
}

export interface RuleMetadata {
    name: string
    source: RuleSource
    description: string
    category: string
    deprecated: boolean
    replacedBy?: string[]
    url?: string
    examples?: Array<{ code: string; output?: string; description?: string }>
    notes?: string[]
    relatedRules?: string[]
    fixable?: boolean
    configValue?: string | number | Array<string | number | Record<string, unknown>>
    configOptions?: unknown[]
    configSource?: string
    extendsChain?: Array<{
        name: string
        depth: number
        configValue: string | number | Array<string | number | Record<string, unknown>>
    }>
    depth?: number
    isOverridden?: boolean
}

export interface RuleList {
    source: RuleSource
    rules: RuleMetadata[]
    total: number
    deprecated: number
}

// ==================== 知识库类型 ====================

export interface KnowledgeEntry {
    ruleName: string
    source: RuleSource
    description: string
    url: string
    examples: Array<{ title: string; code: string; output?: string; explanation?: string }>
    notes: string[]
    incorrectExamples: Array<{
        title?: string
        code: string
        output?: string
        explanation?: string
    }>
    correctExamples: Array<{ title?: string; code: string; output?: string; explanation?: string }>
    fixable: boolean
    fixExamples?: Array<{ before: string; after: string; explanation?: string }>
    relatedRules: string[]
    lastUpdated: Date
    configValue?: string | number | Array<string | number | Record<string, unknown>>
    configSource?: string
    extendsChain?: Array<{
        name: string
        depth: number
        configValue: string | number | Array<string | number | Record<string, unknown>>
    }>
    depth?: number
    category?: string
}

export interface KnowledgeBase {
    version: string
    lastUpdated: Date
    eslint: KnowledgeEntry[]
    stylelint: KnowledgeEntry[]
    typescript: KnowledgeEntry[]
}

// ==================== 验证类型 ====================

export interface LintIssue {
    ruleName: string
    source: RuleSource
    severity: 'error' | 'warning' | 'info'
    message: string
    filePath: string
    line: number
    column: number
    endLine?: number
    endColumn?: number
    fixable: boolean
    fix?: { range: [number, number]; text: string }
}

export interface LintResult {
    success: boolean
    filePath: string
    issues: LintIssue[]
    errorCount: number
    warningCount: number
    fixableCount: number
    duration: number
    output?: string
}

export interface BatchLintResult {
    totalFiles: number
    successFiles: number
    failedFiles: number
    totalIssues: number
    totalErrors: number
    totalWarnings: number
    fixableIssues: number
    results: LintResult[]
    duration: number
}

// ==================== 修复类型 ====================

export interface FixOptions {
    write?: boolean
    fixAll?: boolean
    rules?: string[]
    maxFixes?: number
    skipErrors?: boolean
}

export interface FixResult {
    success: boolean
    filePath: string
    fixedCount: number
    remainingCount: number
    fixedIssues: Array<{ ruleName: string; line: number; column: number }>
    unfixedIssues: Array<{ ruleName: string; line: number; column: number; reason: string }>
    duration: number
}

export interface BatchFixResult {
    totalFiles: number
    successFiles: number
    failedFiles: number
    totalFixed: number
    totalRemaining: number
    results: FixResult[]
    duration: number
}

// ==================== 配置类型 ====================

export interface ESLintConfig {
    configPath?: string
    rules?: Record<string, RuleSeverity | [RuleSeverity, ...unknown[]]>
    ignorePatterns?: string[]
    extends?: string[]
    env?: Record<string, boolean>
    parser?: string
    parserOptions?: Record<string, unknown>
    plugins?: string[]
}

export interface StylelintConfig {
    configPath?: string
    rules?: Record<string, RuleSeverity | [RuleSeverity, ...unknown[]]>
    ignorePatterns?: string[]
    extends?: string[]
    plugins?: string[]
    customSyntax?: string
}

export interface ProjectLintConfig {
    rootDir: string
    hasEslint: boolean
    hasStylelint: boolean
    hasTypeScript: boolean
    eslintConfig?: ESLintConfig
    stylelintConfig?: StylelintConfig
    eslintConfigPath?: string
    stylelintConfigPath?: string
    ignorePath?: string
}

// ==================== 工具输入类型 ====================

export interface ExtractRulesInput {
    cwd?: string
    source?: RuleSource
    includeDeprecated?: boolean
}

export interface GenerateKnowledgeInput {
    cwd?: string
    source?: RuleSource
    rules?: string[]
    overwrite?: boolean
    outputDir?: string
}

export interface LintInput {
    patterns: string | string[]
    cwd?: string
    source?: RuleSource
    cache?: boolean
    progress?: boolean
}

export interface FixInput {
    patterns: string | string[]
    cwd?: string
    source?: RuleSource
    options?: FixOptions
}
