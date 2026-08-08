/**
 * 知识库生成器（主入口）
 *
 * 为 ESLint 和 Stylelint 规则生成高质量的知识库文档
 * 规则数据和文档生成逻辑已拆分到独立模块
 */

import type {
    RuleSource,
    RuleMetadata,
    KnowledgeEntry,
    KnowledgeBase,
    GenerateKnowledgeInput
} from './types'
import { extractAllRules } from './extractor'
// 规则描述和示例数据
import {
    eslintRuleDescriptions,
    stylelintRuleDescriptions,
    eslintRuleExamples,
    stylelintRuleExamples
} from './rule-descriptions'
// 文档写入功能
import { saveDetailedRuleDoc } from './doc-writer'
// 索引和参考文档生成
import { generateKnowledgeIndex, generateQuickReference, saveRulesData } from './index-generator'

// ==================== 配置 ====================

const KNOWLEDGE_DIR = '.codebuddy/knowledge/lint'

// ==================== 导出查询函数（从 knowledge-query 重新导出） ====================

export {
    loadKnowledgeBase as loadKnowledgeBase,
    queryKnowledgeBase as queryKnowledgeBase
} from './knowledge-query'

// ==================== 知识库生成主函数 ====================

/**
 * 生成规则知识库（完整 6 步流程）
 */
export async function generateKnowledgeBase(input: GenerateKnowledgeInput): Promise<KnowledgeBase> {
    const { cwd, source, rules: specifiedRules, overwrite = false, outputDir } = input
    const knowledgeDir = outputDir || KNOWLEDGE_DIR

    // 第一步：递归收集所有层级规则
    const ruleLists = await extractAllRules(cwd, source)

    const knowledgeBase: KnowledgeBase = {
        version: '1.0.0',
        lastUpdated: new Date(),
        eslint: [],
        stylelint: [],
        typescript: []
    }

    // 为每条规则生成知识库条目
    for (const ruleList of ruleLists) {
        const rules = specifiedRules
            ? ruleList.rules.filter((r) => specifiedRules.includes(r.name))
            : ruleList.rules

        for (const rule of rules) {
            // 生成知识库条目
            const entry = generateKnowledgeEntry(rule)

            // 保存到知识库
            switch (ruleList.source) {
                case 'eslint':
                    knowledgeBase.eslint.push(entry)
                    break
                case 'stylelint':
                    knowledgeBase.stylelint.push(entry)
                    break
                case 'typescript':
                    knowledgeBase.typescript.push(entry)
                    break
            }

            // 生成详细的 MD 文件
            await saveDetailedRuleDoc(entry, knowledgeDir, overwrite)
        }
    }

    // 生成知识库索引和快速参考
    await generateKnowledgeIndex(knowledgeBase, knowledgeDir)
    await generateQuickReference(knowledgeBase, knowledgeDir)

    // 保存完整的规则数据
    await saveRulesData(knowledgeBase, knowledgeDir)

    return knowledgeBase
}

// ==================== 知识库条目生成 ====================

/**
 * 生成知识库条目（同步版本，避免 async 开销）
 */
function generateKnowledgeEntry(rule: RuleMetadata): KnowledgeEntry {
    const source = rule.source
    const ruleName = rule.name

    // 获取规则详细说明
    const description = getRuleDescription(ruleName, source)

    // 生成规则文档 URL
    const url = rule.url || generateRuleUrl(ruleName, source)

    // 获取代码示例
    const examples = getRuleExamples(ruleName, source)

    return {
        ruleName,
        source,
        description,
        url,
        examples: examples.map((ex) => ({
            title: ex.title,
            code: ex.code,
            explanation: ex.explanation
        })),
        notes: generateNotes(ruleName, source),
        incorrectExamples: examples
            .filter((ex) => ex.type === 'incorrect')
            .map((ex) => ({
                code: ex.code,
                explanation: ex.explanation
            })),
        correctExamples: examples
            .filter((ex) => ex.type === 'correct')
            .map((ex) => ({
                code: ex.code,
                explanation: ex.explanation
            })),
        fixable: rule.fixable || false,
        relatedRules: rule.relatedRules || [],
        lastUpdated: new Date(),
        // 传递配置信息
        configValue: rule.configValue,
        configSource: rule.configSource,
        extendsChain: rule.extendsChain,
        depth: rule.depth,
        category: rule.category
    }
}

/**
 * 获取规则详细说明（中文）
 */
function getRuleDescription(ruleName: string, source: RuleSource): string {
    if (source === 'eslint' && eslintRuleDescriptions[ruleName]) {
        return eslintRuleDescriptions[ruleName]
    }

    if (source === 'stylelint' && stylelintRuleDescriptions[ruleName]) {
        return stylelintRuleDescriptions[ruleName]
    }

    // 默认说明：自动翻译规则名
    const formattedName = ruleName
        .replace('no-', '禁止 ')
        .replace('require-', '要求 ')
        .replace('use-', '使用 ')
        .replace(/-/g, ' ')

    return `此规则${formattedName}，以确保代码质量和一致性。`
}

/**
 * 生成规则文档 URL
 */
function generateRuleUrl(ruleName: string, source: RuleSource): string {
    switch (source) {
        case 'eslint':
            return `https://eslint.org/docs/latest/rules/${ruleName}`
        case 'stylelint':
            return `https://stylelint.io/user-guide/rules/list/${ruleName}/`
        case 'typescript':
            return `https://typescript-eslint.io/rules/${ruleName}/`
        default:
            return ''
    }
}

/**
 * 获取规则代码示例
 */
function getRuleExamples(
    ruleName: string,
    source: RuleSource
): Array<{
    type: 'correct' | 'incorrect'
    title: string
    code: string
    explanation?: string
}> {
    const examples: Array<{
        type: 'correct' | 'incorrect'
        title: string
        code: string
        explanation?: string
    }> = []

    if (source === 'eslint' && eslintRuleExamples[ruleName]) {
        const { correct, incorrect } = eslintRuleExamples[ruleName]
        examples.push(
            { type: 'correct', title: '正确示例', code: correct, explanation: '符合规则的代码' },
            { type: 'incorrect', title: '错误示例', code: incorrect, explanation: '违反规则的代码' }
        )
    }

    if (source === 'stylelint' && stylelintRuleExamples[ruleName]) {
        const { correct, incorrect } = stylelintRuleExamples[ruleName]
        examples.push(
            { type: 'correct', title: '正确示例', code: correct, explanation: '符合规则的代码' },
            { type: 'incorrect', title: '错误示例', code: incorrect, explanation: '违反规则的代码' }
        )
    }

    // 如果没有预定义的示例，生成默认示例
    if (examples.length === 0) {
        examples.push(
            {
                type: 'correct',
                title: '正确示例',
                code: `// 符合 ${ruleName} 规则的代码示例\n// 请根据官方文档补充具体示例`,
                explanation: '符合规则的代码'
            },
            {
                type: 'incorrect',
                title: '错误示例',
                code: `// 违反 ${ruleName} 规则的代码示例\n// 请根据官方文档补充具体示例`,
                explanation: '违反规则的代码，需要修复'
            }
        )
    }

    return examples
}

/**
 * 生成注意事项
 */
function generateNotes(ruleName: string, source: RuleSource): string[] {
    const notes: string[] = []

    notes.push(`请参考官方文档获取更详细的信息：${generateRuleUrl(ruleName, source)}`)

    if (source === 'eslint') {
        notes.push('ESLint 规则可以在 .eslintrc.cjs 配置文件中进行配置')
        notes.push('使用 npm run lint 可以检查代码是否符合规则')
    }

    if (source === 'stylelint') {
        notes.push('Stylelint 规则可以在 .stylelintrc.cjs 配置文件中进行配置')
        notes.push('使用 npm run stylelint 可以检查样式代码是否符合规则')
    }

    return notes
}
