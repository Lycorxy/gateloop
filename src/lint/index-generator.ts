/**
 * 知识库索引和参考文档生成器
 *
 * 从 doc-writer.ts 中抽取，减少主文件体积
 */

import { join } from 'node:path'
import { ensureDir, writeText, writeJson } from '../helpers'
import type { KnowledgeBase } from './types'

// ==================== 配置 ====================

const INDEX_MD = 'index.md'
const QUICK_REF_MD = 'quick-ref.md'

// ==================== 主导出函数 ====================

/**
 * 生成知识库索引文件
 */
export async function generateKnowledgeIndex(
    knowledgeBase: KnowledgeBase,
    targetDir: string
): Promise<void> {
    const indexPath = join(targetDir, INDEX_MD)

    const lines: string[] = []

    lines.push('# Lint 规则知识库索引')
    lines.push('')
    lines.push(
        `> **版本**: ${knowledgeBase.version} | **最后更新**: ${knowledgeBase.lastUpdated.toISOString()}`
    )
    lines.push('')
    lines.push('---')
    lines.push('')

    // 概览
    lines.push('## 📊 概览')
    lines.push('')
    lines.push(`- **ESLint 规则**: ${knowledgeBase.eslint.length} 条`)
    lines.push(`- **Stylelint 规则**: ${knowledgeBase.stylelint.length} 条`)
    lines.push(`- **TypeScript 规则**: ${knowledgeBase.typescript.length} 条`)
    lines.push(
        `- **总计**: ${knowledgeBase.eslint.length + knowledgeBase.stylelint.length + knowledgeBase.typescript.length} 条`
    )
    lines.push('')
    lines.push('---')
    lines.push('')

    // ESLint 规则列表
    if (knowledgeBase.eslint.length > 0) {
        lines.push('## 🔍 ESLint 规则')
        lines.push('')
        for (const entry of knowledgeBase.eslint) {
            lines.push(
                `- [\`${entry.ruleName}\`](./references/eslint--${entry.ruleName}.md) - ${entry.description.substring(0, 50)}...`
            )
        }
        lines.push('')
        lines.push('---')
        lines.push('')
    }

    // Stylelint 规则列表
    if (knowledgeBase.stylelint.length > 0) {
        lines.push('## 🎨 Stylelint 规则')
        lines.push('')
        for (const entry of knowledgeBase.stylelint) {
            lines.push(
                `- [\`${entry.ruleName}\`](./references/stylelint--${entry.ruleName}.md) - ${entry.description.substring(0, 50)}...`
            )
        }
        lines.push('')
        lines.push('---')
        lines.push('')
    }

    // TypeScript 规则列表
    if (knowledgeBase.typescript.length > 0) {
        lines.push('## 📘 TypeScript 规则')
        lines.push('')
        for (const entry of knowledgeBase.typescript) {
            lines.push(
                `- [\`${entry.ruleName}\`](./references/typescript--${entry.ruleName}.md) - ${entry.description.substring(0, 50)}...`
            )
        }
        lines.push('')
        lines.push('---')
        lines.push('')
    }

    // 相关资源
    lines.push('## 📚 相关资源')
    lines.push('')
    lines.push('- [快速参考](./quick-ref.md)')
    lines.push('- [ESLint 官方文档](https://eslint.org/docs/latest/)')
    lines.push('- [Stylelint 官方文档](https://stylelint.io/)')
    lines.push('')

    await ensureDir(targetDir)
    await writeText(indexPath, lines.join('\n'))
}

/**
 * 生成快速参考文件
 */
export async function generateQuickReference(
    knowledgeBase: KnowledgeBase,
    targetDir: string
): Promise<void> {
    const quickRefPath = join(targetDir, QUICK_REF_MD)

    const lines: string[] = []

    lines.push('# Lint 规则快速参考')
    lines.push('')
    lines.push('> 快速查找常用规则的配置说明和示例')
    lines.push('')
    lines.push('---')
    lines.push('')

    // ESLint 常用规则
    lines.push('## 🔍 ESLint 常用规则')
    lines.push('')
    const commonEslintRules = [
        'semi',
        'quotes',
        'indent',
        'no-console',
        'eqeqeq',
        'no-undef',
        'no-unused-vars'
    ]
    for (const ruleName of commonEslintRules) {
        const entry = knowledgeBase.eslint.find((e) => e.ruleName === ruleName)
        if (entry) {
            lines.push(`### \`${ruleName}\``)
            lines.push('')
            lines.push(`- **说明**: ${entry.description}`)
            lines.push(`- **文档**: [查看详情](./references/eslint--${ruleName}.md)`)
            lines.push('')
        }
    }
    lines.push('---')
    lines.push('')

    // Stylelint 常用规则
    lines.push('## 🎨 Stylelint 常用规则')
    lines.push('')
    const commonStylelintRules = [
        'indentation',
        'string-quotes',
        'color-hex-case',
        'declaration-block-semicolon-space-before'
    ]
    for (const ruleName of commonStylelintRules) {
        const entry = knowledgeBase.stylelint.find((e) => e.ruleName === ruleName)
        if (entry) {
            lines.push(`### \`${ruleName}\``)
            lines.push('')
            lines.push(`- **说明**: ${entry.description}`)
            lines.push(`- **文档**: [查看详情](./references/stylelint--${ruleName}.md)`)
            lines.push('')
        }
    }
    lines.push('---')
    lines.push('')

    // 命令行快速参考
    lines.push('## 🚀 命令行快速参考')
    lines.push('')
    lines.push('```bash')
    lines.push('# ESLint 检查')
    lines.push('npx eslint . --ext .ts,.tsx')
    lines.push('')
    lines.push('# ESLint 自动修复')
    lines.push('npx eslint . --ext .ts,.tsx --fix')
    lines.push('')
    lines.push('# Stylelint 检查')
    lines.push('npx stylelint "**/*.css"')
    lines.push('')
    lines.push('# Stylelint 自动修复')
    lines.push('npx stylelint "**/*.css" --fix')
    lines.push('```')
    lines.push('')

    await ensureDir(targetDir)
    await writeText(quickRefPath, lines.join('\n'))
}

/**
 * 保存完整的规则数据
 */
export async function saveRulesData(
    knowledgeBase: KnowledgeBase,
    targetDir: string
): Promise<void> {
    const dataPath = join(targetDir, 'rules-data.json')

    const data = {
        version: knowledgeBase.version,
        lastUpdated: knowledgeBase.lastUpdated.toISOString(),
        eslint: knowledgeBase.eslint.map((e) => ({
            name: e.ruleName,
            description: e.description,
            url: e.url,
            fixable: e.fixable,
            relatedRules: e.relatedRules
        })),
        stylelint: knowledgeBase.stylelint.map((e) => ({
            name: e.ruleName,
            description: e.description,
            url: e.url,
            fixable: e.fixable,
            relatedRules: e.relatedRules
        })),
        typescript: knowledgeBase.typescript.map((e) => ({
            name: e.ruleName,
            description: e.description,
            url: e.url,
            fixable: e.fixable,
            relatedRules: e.relatedRules
        }))
    }

    await ensureDir(targetDir)
    await writeJson(dataPath, data)
}
