/**
 * 知识库查询器
 *
 * 从 doc-writer.ts 中抽取，减少主文件体积
 */

import { join } from 'node:path'
import { exists, readJson } from '../helpers'
import type { KnowledgeBase, RuleSource, KnowledgeEntry } from './types'

// ==================== 主导出函数 ====================

/**
 * 加载知识库
 */
export async function loadKnowledgeBase(cwd?: string): Promise<KnowledgeBase | null> {
    const knowledgeDir = join(resolveCwd(cwd), '.codebuddy/knowledge/lint')
    const dataPath = join(knowledgeDir, 'rules-data.json')

    if (!(await exists(dataPath))) {
        return null
    }

    try {
        const data = (await readJson(dataPath)) as {
            version: string
            lastUpdated: string
            eslint?: Array<{
                name: string
                description: string
                url: string
                fixable: boolean
                relatedRules: string[]
            }>
            stylelint?: Array<{
                name: string
                description: string
                url: string
                fixable: boolean
                relatedRules: string[]
            }>
            typescript?: Array<{
                name: string
                description: string
                url: string
                fixable: boolean
                relatedRules: string[]
            }>
        }

        const makeEntry = (
            item: {
                name: string
                description: string
                url: string
                fixable: boolean
                relatedRules: string[]
            },
            source: RuleSource
        ): KnowledgeEntry => ({
            ruleName: item.name,
            source,
            description: item.description,
            url: item.url,
            examples: [],
            notes: [],
            incorrectExamples: [],
            correctExamples: [],
            fixable: item.fixable,
            relatedRules: item.relatedRules,
            lastUpdated: new Date()
        })

        const knowledgeBase: KnowledgeBase = {
            version: data.version,
            lastUpdated: new Date(data.lastUpdated),
            eslint: (data.eslint || []).map((item) => makeEntry(item, 'eslint')),
            stylelint: (data.stylelint || []).map((item) => makeEntry(item, 'stylelint')),
            typescript: (data.typescript || []).map((item) => makeEntry(item, 'typescript'))
        }

        return knowledgeBase
    } catch {
        return null
    }
}

/**
 * 查询知识库中的规则信息
 */
export async function queryKnowledgeBase(
    ruleName: string,
    source: RuleSource,
    cwd?: string
): Promise<KnowledgeEntry | null> {
    const knowledgeBase = await loadKnowledgeBase(cwd)

    if (!knowledgeBase) {
        return null
    }

    let rules: KnowledgeEntry[] = []
    switch (source) {
        case 'eslint':
            rules = knowledgeBase.eslint
            break
        case 'stylelint':
            rules = knowledgeBase.stylelint
            break
        case 'typescript':
            rules = knowledgeBase.typescript
            break
    }

    return rules.find((r) => r.ruleName === ruleName) || null
}

// ==================== 辅助函数 ====================

/**
 * 解析工作目录
 */
function resolveCwd(cwd?: string): string {
    if (cwd) return cwd
    try {
        return process.cwd()
    } catch {
        return '.'
    }
}
