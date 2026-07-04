/**
 * 规则提取器
 *
 * 从 ESLint 和 Stylelint 中提取所有规则
 */

import { join } from 'node:path'
import { exists, readJson } from '../helpers'
import type {
    RuleSource,
    RuleMetadata,
    RuleList,
    ESLintConfig,
    StylelintConfig,
    ProjectLintConfig,
    RuleSeverity
} from './types'

// ==================== 配置检测 ====================

/** ESLint 配置文件 */
const ESLINT_CONFIG_FILES = [
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.mjs',
    '.eslintrc.yaml',
    '.eslintrc.yml',
    '.eslintrc.json',
    '.eslintrc'
]

/** Stylelint 配置文件 */
const STYLELINT_CONFIG_FILES = [
    'stylelint.config.js',
    'stylelint.config.mjs',
    'stylelint.config.cjs',
    '.stylelintrc.js',
    '.stylelintrc.cjs',
    '.stylelintrc.mjs',
    '.stylelintrc.yaml',
    '.stylelintrc.yml',
    '.stylelintrc.json',
    '.stylelintrc'
]

/**
 * 查找项目根目录
 */
async function findProjectRoot(startPath?: string): Promise<string> {
    let currentDir = startPath || process.cwd()

    while (currentDir !== '/') {
        const packagePath = join(currentDir, 'package.json')
        if (await exists(packagePath)) {
            return currentDir
        }

        const parentDir = join(currentDir, '..')
        if (parentDir === currentDir) break
        currentDir = parentDir
    }

    return startPath || process.cwd()
}

/**
 * 查找配置文件
 */
async function findConfigFile(rootDir: string, configFiles: string[]): Promise<string | undefined> {
    for (const configFile of configFiles) {
        const configPath = join(rootDir, configFile)
        if (await exists(configPath)) {
            return configPath
        }
    }
    return undefined
}

/**
 * 检测项目 Lint 配置
 */
export async function detectLintConfig(startPath?: string): Promise<ProjectLintConfig> {
    const rootDir = await findProjectRoot(startPath)

    const eslintConfigPath = await findConfigFile(rootDir, ESLINT_CONFIG_FILES)
    const stylelintConfigPath = await findConfigFile(rootDir, STYLELINT_CONFIG_FILES)

    const hasEslint = !!eslintConfigPath
    const hasStylelint = !!stylelintConfigPath

    // 读取 ESLint 配置
    let eslintConfig: ESLintConfig | undefined
    if (eslintConfigPath) {
        eslintConfig = await readESLintConfig(eslintConfigPath)
    }

    // 读取 Stylelint 配置
    let stylelintConfig: StylelintConfig | undefined
    if (stylelintConfigPath) {
        stylelintConfig = await readStylelintConfig(stylelintConfigPath)
    }

    return {
        rootDir,
        hasEslint: hasEslint,
        hasStylelint: hasStylelint,
        hasTypeScript: await checkTypeScript(rootDir),
        eslintConfig,
        stylelintConfig,
        eslintConfigPath,
        stylelintConfigPath
    }
}

/**
 * 检查是否有 TypeScript
 */
async function checkTypeScript(rootDir: string): Promise<boolean> {
    const packageJsonPath = join(rootDir, 'package.json')
    if (await exists(packageJsonPath)) {
        const pkg = await readJson<{
            devDependencies?: Record<string, string>
            dependencies?: Record<string, string>
        }>(packageJsonPath)
        return !!(
            pkg.devDependencies?.typescript ||
            pkg.dependencies?.typescript ||
            pkg.devDependencies?.['@typescript-eslint/parser']
        )
    }
    return false
}

/**
 * 读取 ESLint 配置
 */
async function readESLintConfig(configPath: string): Promise<ESLintConfig> {
    try {
        // 使用 createRequire 加载 .eslintrc.cjs
        const { createRequire } = await import('node:module')
        const req = createRequire(configPath)
        const eslintrc = req(configPath) as Record<string, unknown>

        // 提取 rules
        const rules: Record<string, RuleSeverity | [RuleSeverity, ...unknown[]]> = {}
        if (eslintrc.rules && typeof eslintrc.rules === 'object') {
            Object.assign(
                rules,
                eslintrc.rules as Record<string, RuleSeverity | [RuleSeverity, ...unknown[]]>
            )
        }

        // 提取 extends
        const extendsList: string[] = []
        if (eslintrc.extends) {
            if (Array.isArray(eslintrc.extends)) {
                extendsList.push(...eslintrc.extends.map(String))
            } else if (typeof eslintrc.extends === 'string') {
                extendsList.push(eslintrc.extends)
            }
        }

        // 提取其他配置
        const env = (eslintrc.env as Record<string, boolean>) || {}
        const parserOptions = (eslintrc.parserOptions as Record<string, unknown>) || {}
        const plugins: string[] = []
        if (Array.isArray(eslintrc.plugins)) {
            plugins.push(...eslintrc.plugins.map(String))
        }

        return {
            configPath,
            rules,
            extends: extendsList,
            env,
            parser: eslintrc.parser as string | undefined,
            parserOptions,
            plugins
        }
    } catch {
        // 解析失败时返回空配置
        return {
            configPath,
            rules: {},
            extends: [],
            env: {},
            parser: undefined,
            parserOptions: {},
            plugins: []
        }
    }
}

/**
 * 读取 Stylelint 配置
 */
async function readStylelintConfig(configPath: string): Promise<StylelintConfig> {
    // 简化实现，实际应解析多种配置格式
    return {
        configPath,
        rules: {},
        extends: [],
        plugins: []
    }
}

// ==================== ESLint 规则提取 ====================

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

/**
 * 将项目配置文件中的规则值合并到提取的规则列表中
 */
function mergeConfigValues(
    rules: RuleMetadata[],
    configRules: Record<string, RuleSeverity | [RuleSeverity, ...unknown[]]>,
    extendsList: string[]
): void {
    // 构建规则名 → 规则映射
    const ruleMap = new Map<string, RuleMetadata>()
    for (const rule of rules) {
        ruleMap.set(rule.name, rule)
    }

    // 处理 extends 链中的规则（标记来源）
    for (const rule of rules) {
        // 如果规则在 extends 中且未被本地覆盖
        if (!configRules[rule.name]) {
            // 规则来自 extends
            rule.configSource = 'extends'
            rule.depth = 1
            rule.extendsChain = extendsList.map((ext, idx) => ({
                name: ext,
                depth: idx + 1,
                configValue: 'error' // 默认值
            }))
            // 根据 category 推断 configValue
            if (rule.category === 'problem' || rule.category === 'suggestion') {
                rule.configValue = 'error'
            } else {
                rule.configValue = 'off'
            }
        }
    }

    // 处理本地配置的规则
    for (const [ruleName, ruleValue] of Object.entries(configRules)) {
        const existingRule = ruleMap.get(ruleName)

        // 提取 severity（0/1/2 或 "off"/"warn"/"error"）
        let severity: RuleSeverity
        let options: unknown[] = []

        if (Array.isArray(ruleValue)) {
            severity = ruleValue[0]
            options = ruleValue.slice(1)
        } else {
            severity = ruleValue
        }

        if (existingRule) {
            // 标记为本地覆盖
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
            // 本地定义但 node_modules 中没找到的规则
            rules.push({
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
            })
        }
    }
}

/**
 * 提取 ESLint 核心规则
 */
async function extractESLintCoreRules(rootDir: string, rules: RuleMetadata[]): Promise<void> {
    try {
        // 尝试从 eslint 包中读取规则
        const eslintPath = join(rootDir, 'node_modules', 'eslint')
        const rulesPath = join(eslintPath, 'lib', 'rules')

        if (await exists(rulesPath)) {
            const { createRequire } = await import('node:module')
            const req = createRequire(join(eslintPath, 'package.json'))

            // 读取所有规则文件
            const { readdirSync } = await import('node:fs')
            const ruleFiles = readdirSync(rulesPath).filter((f: string) => f.endsWith('.js'))

            for (const ruleFile of ruleFiles) {
                const ruleName = ruleFile.replace('.js', '')

                try {
                    // 加载规则文件获取 meta 信息
                    const ruleModule = req(join(rulesPath, ruleFile)) as {
                        meta?: Record<string, unknown>
                        default?: { meta?: Record<string, unknown> }
                    }
                    const ruleMeta = (ruleModule.meta || ruleModule.default?.meta) as
                        | {
                              type?: string
                              docs?: {
                                  description?: string
                                  recommended?: boolean
                                  url?: string
                              }
                              fixable?: string
                              deprecated?: boolean
                              replacedBy?: string[]
                          }
                        | undefined

                    const meta = ruleMeta || {}

                    rules.push({
                        name: ruleName,
                        source: 'eslint',
                        description: meta.docs?.description || `ESLint rule: ${ruleName}`,
                        category: meta.type || 'core',
                        deprecated: meta.deprecated || false,
                        replacedBy: meta.replacedBy,
                        url: meta.docs?.url || `https://eslint.org/docs/latest/rules/${ruleName}`,
                        fixable: !!meta.fixable
                    })
                } catch {
                    // 加载失败时使用基本元数据
                    rules.push({
                        name: ruleName,
                        source: 'eslint',
                        description: `ESLint rule: ${ruleName}`,
                        category: 'core',
                        deprecated: false,
                        url: `https://eslint.org/docs/latest/rules/${ruleName}`
                    })
                }
            }
        }
    } catch {
        // 提取失败时静默处理
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

// ==================== Stylelint 规则提取 ====================

/**
 * 提取 Stylelint 规则
 */
export async function extractStylelintRules(cwd?: string): Promise<RuleList> {
    const config = await detectLintConfig(cwd)
    const rules: RuleMetadata[] = []

    // 从 node_modules 中提取规则
    if (config.hasStylelint) {
        // 提取核心规则
        await extractStylelintCoreRules(config.rootDir, rules)

        // 提取插件规则
        if (config.stylelintConfig?.plugins) {
            for (const plugin of config.stylelintConfig.plugins) {
                await extractStylelintPluginRules(config.rootDir, plugin, rules)
            }
        }
    }

    return {
        source: 'stylelint',
        rules,
        total: rules.length,
        deprecated: rules.filter((r) => r.deprecated).length
    }
}

/**
 * 提取 Stylelint 核心规则
 */
async function extractStylelintCoreRules(rootDir: string, rules: RuleMetadata[]): Promise<void> {
    try {
        // 尝试从 stylelint 包中读取规则
        const stylelintPath = join(rootDir, 'node_modules', 'stylelint')
        const rulesPath = join(stylelintPath, 'lib', 'rules')

        if (await exists(rulesPath)) {
            // 读取所有规则目录
            const { readdirSync } = await import('node:fs')
            const ruleDirs = readdirSync(rulesPath, { withFileTypes: true }).filter(
                (dirent: { isDirectory: () => boolean }) => dirent.isDirectory()
            )

            for (const ruleDir of ruleDirs) {
                const ruleName = ruleDir.name
                rules.push({
                    name: ruleName,
                    source: 'stylelint',
                    description: `Stylelint rule: ${ruleName}`,
                    category: 'core',
                    deprecated: false,
                    url: `https://stylelint.io/user-guide/rules/list/${ruleName}/`
                })
            }
        }
    } catch {
        // 提取失败时静默处理
    }
}

/**
 * 提取 Stylelint 插件规则
 */
async function extractStylelintPluginRules(
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
                source: 'stylelint',
                description: `Stylelint plugin: ${pluginName}`,
                category: 'plugin',
                deprecated: false
            })
        }
    } catch {
        // 提取插件规则失败时静默处理
    }
}

// ==================== 统一提取接口 ====================

/**
 * 提取所有规则
 */
export async function extractAllRules(cwd?: string, source?: RuleSource): Promise<RuleList[]> {
    const results: RuleList[] = []

    if (!source || source === 'eslint') {
        const eslintRules = await extractESLintRules(cwd)
        results.push(eslintRules)
    }

    if (!source || source === 'stylelint') {
        const stylelintRules = await extractStylelintRules(cwd)
        results.push(stylelintRules)
    }

    return results
}

/**
 * 获取规则元数据
 */
export async function getRuleMetadata(
    ruleName: string,
    source: RuleSource,
    cwd?: string
): Promise<RuleMetadata | null> {
    const rules = await extractAllRules(cwd, source)
    const ruleList = rules.find((r) => r.source === source)

    if (ruleList) {
        const rule = ruleList.rules.find((r) => r.name === ruleName)
        return rule || null
    }

    return null
}
