/**
 * 知识库详细文档写入器
 *
 * 负责生成 Markdown 格式的规则文档（单条规则详情）
 * 索引/快速参考/查询已拆分到独立模块
 */

import { join } from 'node:path'
import { exists, writeText, ensureDir } from '../helpers'
import type { KnowledgeEntry } from './types'

// ==================== 主导出函数 ====================

/**
 * 保存详细的规则文档（按 lint-knowledge skill 标准）
 */
export async function saveDetailedRuleDoc(
    entry: KnowledgeEntry,
    targetDir: string,
    overwrite: boolean = false
): Promise<void> {
    const detailedDir = join(targetDir, 'references')
    const safeRuleName = entry.ruleName.replace(/\//g, '--')
    const filePath = join(detailedDir, `${entry.source}--${safeRuleName}.md`)

    if (!overwrite && (await exists(filePath))) {
        return
    }

    const content = generateDetailedMarkdown(entry)
    await ensureDir(detailedDir)
    await writeText(filePath, content)
}

// ==================== 详细文档生成 ====================

function generateDetailedMarkdown(entry: KnowledgeEntry): string {
    const lines: string[] = []
    const { configValue, configSource, depth, extendsChain, category } = entry
    const severityLabel = getSeverityLabel(configValue)
    const sourceLabel = getSourceLabel(configSource)

    lines.push(`# 规则：${entry.ruleName}`, '')
    lines.push(...buildConfigSection(entry, severityLabel, sourceLabel, depth, extendsChain))
    lines.push('---', '')
    lines.push(...buildDetailSection(entry, category))
    lines.push('---', '')
    lines.push(...buildExamplesSection(entry))
    lines.push('---', '')
    lines.push(...buildConfigOptionsSection(entry, configValue, severityLabel))
    lines.push('---', '')
    lines.push(...buildFaqSection(entry, configValue, severityLabel, configSource, extendsChain))
    lines.push('---', '')
    lines.push(...buildBestPracticesSection())
    lines.push('---', '')
    lines.push(...buildResourcesSection(entry))
    lines.push(
        '> 📌 **提示**：此文档由 lint-knowledge skill 自动生成。如需更详细的信息，请参考官方文档。',
        ''
    )

    return lines.join('\n')
}

function buildConfigSection(
    entry: KnowledgeEntry,
    severityLabel: string,
    sourceLabel: string,
    depth: number | undefined,
    extendsChain: KnowledgeEntry['extendsChain']
): string[] {
    const lines: string[] = []
    lines.push('## 📋 配置信息', '', '| 项目 | 值 |', '|------|-----|')
    lines.push(`| **规则名称** | \`${entry.ruleName}\` |`)
    lines.push(`| **配置值** | \`${formatConfigValue(entry.configValue)}\` |`)
    lines.push(`| **严重程度** | ${severityLabel} |`)
    lines.push(`| **来源** | ${sourceLabel} |`)
    lines.push(`| **继承深度** | ${depth ?? '-'} |`, '')

    if (extendsChain && extendsChain.length > 0) {
        lines.push('**继承链**：')
        for (const chain of extendsChain) {
            lines.push(`- \`${chain.name}\` (深度 ${chain.depth})`)
        }
        lines.push('')
    }
    return lines
}

function buildDetailSection(entry: KnowledgeEntry, category?: string): string[] {
    const lines: string[] = []
    lines.push('## 📖 详细说明', '', entry.description, '')

    if (entry.url) {
        lines.push(`**官方文档**：[${entry.url}](${entry.url})`, '')
    }
    if (category) {
        lines.push(`**分类**：${category}`, '')
    }
    return lines
}

function buildExamplesSection(entry: KnowledgeEntry): string[] {
    const lines: string[] = []
    lines.push('## 💡 代码示例', '')

    const correct = entry.correctExamples || []
    if (correct.length > 0) {
        lines.push('### ✅ 正确示例', '')
        for (const ex of correct) {
            lines.push('```javascript', ex.code, '```', '')
        }
    }

    const incorrect = entry.incorrectExamples || []
    if (incorrect.length > 0) {
        lines.push('### ❌ 错误示例', '')
        for (const ex of incorrect) {
            lines.push('```javascript', ex.code, '```', '')
        }
    }
    return lines
}

function buildConfigOptionsSection(
    entry: KnowledgeEntry,
    configValue: unknown,
    severityLabel: string
): string[] {
    const lines: string[] = []
    lines.push('## ⚙️ 配置选项', '', '### 在 ESLint 配置文件中配置', '')

    if (entry.source === 'eslint') {
        lines.push('```javascript', '// .eslintrc.cjs', 'module.exports = {', '  rules: {')
        lines.push(`    '${entry.ruleName}': ${formatConfigValueJs(configValue)}`)
        lines.push('  }', '}', '```', '')
    } else if (entry.source === 'stylelint') {
        lines.push('```javascript', '// .stylelintrc.cjs', 'module.exports = {', '  rules: {')
        lines.push(`    '${entry.ruleName}': true`)
        lines.push('  }', '}', '```', '')
    }

    lines.push('### 可选配置值', '')
    if (entry.source === 'eslint') {
        lines.push('| 值 | 说明 |', '|-----|------|')
        lines.push('| `"error"` | 产生错误（红色） |')
        lines.push('| `"warn"` | 产生警告（黄色） |')
        lines.push('| `"off"` | 关闭规则 |')
    }
    lines.push('', `**当前严重程度**：${severityLabel}`, '')
    return lines
}

function buildFaqSection(
    entry: KnowledgeEntry,
    configValue: unknown,
    severityLabel: string,
    configSource: string | undefined,
    extendsChain: KnowledgeEntry['extendsChain']
): string[] {
    const lines: string[] = []
    lines.push('## ❓ 常见问题', '')
    lines.push('### Q: 这个规则的作用是什么？', '', `**A:** ${entry.description}`, '')
    lines.push('### Q: 如何禁用这个规则？', '', '**A:** 在配置文件中设置为 `"off"`：', '')
    lines.push('```javascript', 'rules: {', `  '${entry.ruleName}': 'off'`, '}', '```', '')
    lines.push(`### Q: 为什么这个规则配置为 \`${formatConfigValue(configValue)}\`？`, '')
    lines.push(
        `**A:** 根据项目的 ESLint 配置，这个规则的严重程度为 **${severityLabel}**，建议遵守此配置以确保代码质量。`,
        ''
    )
    lines.push('### Q: 这条规则来自哪里？', '')
    if (extendsChain && extendsChain.length > 0) {
        lines.push(`**A:** ${extendsChain[0].name}`, '')
    } else {
        lines.push(`**A:** ${configSource || '未知'}`, '')
    }
    return lines
}

function buildBestPracticesSection(): string[] {
    return [
        '## ✅ 最佳实践',
        '',
        '1. **遵循规则配置**：严格遵守项目的 ESLint 配置要求',
        '2. **理解规则意图**：理解规则为什么要这样配置，避免盲目禁用',
        '3. **正确处理错误**：遇到规则提示时，认真检查并修复',
        '4. **保持代码一致性**：在团队中保持统一的代码风格',
        '5. **定期检查**：在提交代码前运行 ESLint 检查',
        ''
    ]
}

function buildResourcesSection(entry: KnowledgeEntry): string[] {
    const lines: string[] = []
    lines.push('## 🔗 相关资源', '')

    if (entry.source === 'eslint') {
        lines.push('- [ESLint 官方文档](https://eslint.org/docs/latest/)')
        if (entry.url) lines.push(`- [规则官方文档](${entry.url})`)
        lines.push('- [项目配置文件](.eslintrc.cjs)', '- [完整规则列表](./index.md)')
    } else if (entry.source === 'stylelint') {
        lines.push('- [Stylelint 官方文档](https://stylelint.io/)')
        if (entry.url) lines.push(`- [规则官方文档](${entry.url})`)
        lines.push('- [项目配置文件](.stylelintrc.cjs)', '- [完整规则列表](./index.md)')
    }
    lines.push('')
    return lines
}

// ==================== 辅助函数 ====================

function getSeverityLabel(configValue: unknown): string {
    const sev = Array.isArray(configValue) ? configValue[0] : configValue
    if (sev === 'error' || sev === 2) return '错误 ❌'
    if (sev === 'warn' || sev === 1) return '警告 ⚠️'
    if (sev === 0) return '0 📋'
    return `${configValue ?? '-'} 📋`
}

function getSourceLabel(source?: string): string {
    if (!source) return '-'
    if (source === 'extends') return 'extends'
    if (source === 'local') return 'local'
    return source
}

function formatConfigValue(value: unknown): string {
    if (value === undefined || value === null) return '-'
    if (Array.isArray(value)) return JSON.stringify(value)
    return String(value)
}

function formatConfigValueJs(value: unknown): string {
    if (value === undefined || value === null) return "'off'"
    if (Array.isArray(value)) return JSON.stringify(value)
    if (typeof value === 'number') return String(value)
    return `'${value}'`
}
