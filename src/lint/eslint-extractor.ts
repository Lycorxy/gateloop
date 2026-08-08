/**
 * ESLint 规则提取器
 *
 * 从 ESLint 和其插件中提取所有规则元数据
 * 从 extractor.ts 中抽取，减少主文件体积
 */

import { join } from 'node:path'
import { exists } from '../helpers'
import type { RuleMetadata, RuleList, RuleSeverity } from './types'
import { detectLintConfig } from './extractor'

// ==================== 主导出函数 ====================

/**
 * 提取 ESLint 规则
 */
export async function extractESLintRules(cwd?: string): Promise<RuleList> {
    const config = await detectLintConfig(cwd)
    const rules: RuleMetadata[] = []

    // 从 node_modules 中提取规则
    if (config.hasEslint) {
        // 提取核心规则
        await extractESLintCoreRules(config.rootDir, rules)

        // 提取插件规则
        if (config.eslintConfig?.plugins) {
            for (const plugin of config.eslintConfig.plugins) {
                await extractESLintPluginRules(config.rootDir, plugin, rules)
            }
        }

        // 合并项目配置中的实际配置值
        if (config.eslintConfig?.rules) {
            mergeConfigValues(rules, config.eslintConfig.rules, config.eslintConfig.extends || [])
        }
    }

    return {
        source: 'eslint',
        rules,
        total: rules.length,
        deprecated: rules.filter((r) => r.deprecated).length
    }
}

// ==================== 辅助函数 ====================

/**
 * 将项目配置文件中的规则值合并到提取的规则列表中
 */
function mergeConfigValues(
    rules: RuleMetadata[],
    configRules: Record<string, RuleSeverity | [RuleSeverity, ...unknown[]]>,
    extendsList: string[]
): void {
    const ruleMap = new Map<string, RuleMetadata>()
    for (const rule of rules) {
        ruleMap.set(rule.name, rule)
    }

    markExtendsRules(rules, configRules, extendsList)
    applyLocalConfig(rules, ruleMap, configRules)
}

function markExtendsRules(
    rules: RuleMetadata[],
    configRules: Record<string, RuleSeverity | [RuleSeverity, ...unknown[]]>,
    extendsList: string[]
): void {
    for (const rule of rules) {
        if (configRules[rule.name]) continue
        rule.configSource = 'extends'
        rule.depth = 1
        rule.extendsChain = extendsList.map((ext, idx) => ({
            name: ext,
            depth: idx + 1,
            configValue: 'error'
        }))
        rule.configValue =
            rule.category === 'problem' || rule.category === 'suggestion' ? 'error' : 'off'
    }
}

function applyLocalConfig(
    rules: RuleMetadata[],
    ruleMap: Map<string, RuleMetadata>,
    configRules: Record<string, RuleSeverity | [RuleSeverity, ...unknown[]]>
): void {
    for (const [ruleName, ruleValue] of Object.entries(configRules)) {
        const existingRule = ruleMap.get(ruleName)
        const { severity, options } = parseRuleValue(ruleValue)

        if (existingRule) {
            existingRule.configValue = severity
            existingRule.configOptions = options.length > 0 ? options : undefined
            existingRule.configSource = 'local'
            existingRule.depth = 1
            existingRule.isOverridden = true
            existingRule.extendsChain = [
                ...(existingRule.extendsChain || []),
                { name: 'local', depth: 1, configValue: severity }
            ]
        } else {
            rules.push(buildLocalRule(ruleName, severity, options))
        }
    }
}

function parseRuleValue(ruleValue: RuleSeverity | [RuleSeverity, ...unknown[]]): {
    severity: RuleSeverity
    options: unknown[]
} {
    if (Array.isArray(ruleValue)) {
        return { severity: ruleValue[0], options: ruleValue.slice(1) }
    }
    return { severity: ruleValue, options: [] }
}

function buildLocalRule(
    ruleName: string,
    severity: RuleSeverity,
    options: unknown[]
): RuleMetadata {
    return {
        name: ruleName,
        source: 'eslint',
        description: `规则 ${ruleName}`,
        category: 'local',
        deprecated: false,
        configValue: severity,
        configOptions: options.length > 0 ? options : undefined,
        configSource: 'local',
        depth: 1,
        extendsChain: [{ name: 'local', depth: 1, configValue: severity }],
        isOverridden: false
    }
}

/**
 * 提取 ESLint 核心规则
 */
async function extractESLintCoreRules(rootDir: string, rules: RuleMetadata[]): Promise<void> {
    try {
        const eslintPath = join(rootDir, 'node_modules', 'eslint')
        const rulesPath = join(eslintPath, 'lib', 'rules')

        if (!(await exists(rulesPath))) return

        const { createRequire } = await import('node:module')
        const req = createRequire(join(eslintPath, 'package.json'))
        const { readdirSync } = await import('node:fs')
        const ruleFiles = readdirSync(rulesPath).filter((f: string) => f.endsWith('.js'))

        for (const ruleFile of ruleFiles) {
            const ruleName = ruleFile.replace('.js', '')
            rules.push(loadRuleMetadata(req, rulesPath, ruleFile, ruleName))
        }
    } catch {
        // 提取失败时静默处理
    }
}

function loadRuleMetadata(
    req: NodeRequire,
    rulesPath: string,
    ruleFile: string,
    ruleName: string
): RuleMetadata {
    try {
        const ruleModule = req(join(rulesPath, ruleFile)) as {
            meta?: Record<string, unknown>
            default?: { meta?: Record<string, unknown> }
        }
        const ruleMeta = (ruleModule.meta || ruleModule.default?.meta) as
            | {
                  type?: string
                  docs?: { description?: string; recommended?: boolean; url?: string }
                  fixable?: string
                  deprecated?: boolean
                  replacedBy?: string[]
              }
            | undefined

        const meta = ruleMeta || {}
        return {
            name: ruleName,
            source: 'eslint',
            description: meta.docs?.description || `ESLint rule: ${ruleName}`,
            category: meta.type || 'core',
            deprecated: meta.deprecated || false,
            replacedBy: meta.replacedBy,
            url: meta.docs?.url || `https://eslint.org/docs/latest/rules/${ruleName}`,
            fixable: !!meta.fixable
        }
    } catch {
        return {
            name: ruleName,
            source: 'eslint',
            description: `ESLint rule: ${ruleName}`,
            category: 'core',
            deprecated: false,
            url: `https://eslint.org/docs/latest/rules/${ruleName}`
        }
    }
}

/**
 * 提取 ESLint 插件规则
 */
async function extractESLintPluginRules(
    rootDir: string,
    pluginName: string,
    rules: RuleMetadata[]
): Promise<void> {
    try {
        // 尝试从插件包中读取规则
        const pluginPath = join(rootDir, 'node_modules', pluginName)

        if (await exists(pluginPath)) {
            // 简化实现
            rules.push({
                name: `${pluginName}/*`,
                source: 'eslint',
                description: `ESLint plugin: ${pluginName}`,
                category: 'plugin',
                deprecated: false
            })
        }
    } catch {
        // 提取插件规则失败时静默处理
    }
}
