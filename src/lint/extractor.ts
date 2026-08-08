/**
 * 规则提取器（主入口）
 *
 * 从 ESLint 和 Stylelint 中提取所有规则
 * 具体提取逻辑已拆分到独立模块
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
// 导入各工具的规则提取器
import { extractESLintRules } from './eslint-extractor'
import { extractStylelintRules } from './stylelint-extractor'

// ==================== 重新导出各工具提取器 ====================

export { extractESLintRules }
export { extractStylelintRules }

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
