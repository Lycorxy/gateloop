/**
 * Stylelint 规则提取器
 *
 * 从 Stylelint 和其插件中提取所有规则元数据
 * 从 extractor.ts 中抽取，减少主文件体积
 */

import { join } from 'node:path'
import { exists } from '../helpers'
import type { RuleMetadata, RuleList } from './types'
import { detectLintConfig } from './extractor'

// ==================== 主导出函数 ====================

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

// ==================== 辅助函数 ====================

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
