/**
 * Lint 工具模块
 *
 * ESLint 和 Stylelint 的规则提取、知识库生成、验证和修复
 */

import type {
    // 规则类型
    RuleSource,
    RuleSeverity,
    RuleConfig,
    RuleMetadata,
    RuleList,

    // 知识库类型
    KnowledgeEntry,
    KnowledgeBase,

    // 验证类型
    LintIssue,
    LintResult,
    BatchLintResult,

    // 修复类型
    FixOptions,
    FixResult,
    BatchFixResult,

    // 配置类型
    ESLintConfig,
    StylelintConfig,
    ProjectLintConfig,

    // 输入类型
    ExtractRulesInput,
    GenerateKnowledgeInput,
    LintInput,
    FixInput
} from './types'

// 导出类型
export type {
    // 规则类型
    RuleSource,
    RuleSeverity,
    RuleConfig,
    RuleMetadata,
    RuleList,

    // 知识库类型
    KnowledgeEntry,
    KnowledgeBase,

    // 验证类型
    LintIssue,
    LintResult,
    BatchLintResult,

    // 修复类型
    FixOptions,
    FixResult,
    BatchFixResult,

    // 配置类型
    ESLintConfig,
    StylelintConfig,
    ProjectLintConfig,

    // 输入类型
    ExtractRulesInput,
    GenerateKnowledgeInput,
    LintInput,
    FixInput
}

// 导入规则提取器
import {
    detectLintConfig,
    extractESLintRules,
    extractStylelintRules,
    extractAllRules,
    getRuleMetadata
} from './extractor'

// 导出规则提取器
export {
    detectLintConfig,
    extractESLintRules,
    extractStylelintRules,
    extractAllRules,
    getRuleMetadata
}

// 导入知识库生成器
import { generateKnowledgeBase, loadKnowledgeBase, queryKnowledgeBase } from './knowledge'

// 导出知识库生成器
export { generateKnowledgeBase, loadKnowledgeBase, queryKnowledgeBase }

// 导入 Lint 执行器
import { runESLint, runStylelint, runTypeScript, runLint } from './runner'

// 导出 Lint 执行器
export { runESLint, runStylelint, runTypeScript, runLint }

// 导入 Lint 修复器
import { fixESLint, fixStylelint, fixTypeScript, fixLint, formatAndFix } from './fixer'

// 导入 Lint 修复器
export { fixESLint, fixStylelint, fixTypeScript, fixLint, formatAndFix }

// 导入独立验证器（不依赖 ESLint 配置）
import { checkFileSize } from './file-size'
import type { FileSizeConfig, FileSizeResult, FileSizeViolation } from './file-size'
import { runPrettierCheck, runPrettierFormat } from './prettier-check'
import type { PrettierCheckResult } from './prettier-check'
import { checkFileNaming } from './check-file-naming'
import type { NamingConfig, NamingResult, NamingViolation } from './check-file-naming'

// 导出独立验证器
export { checkFileSize, runPrettierCheck, runPrettierFormat, checkFileNaming }
export type {
    FileSizeConfig,
    FileSizeResult,
    FileSizeViolation,
    PrettierCheckResult,
    NamingConfig,
    NamingResult,
    NamingViolation
}

// 导出快捷函数
export async function lint(
    patterns: string | string[],
    options: {
        cwd?: string
        source?: 'eslint' | 'stylelint' | 'typescript'
        fix?: boolean
        write?: boolean
    } = {}
): Promise<{ lint: BatchLintResult; fix?: BatchFixResult }> {
    const { cwd, source, fix, write } = options

    // 执行验证
    const lintResult = await runLint({
        patterns,
        cwd,
        source
    })

    let fixResult: BatchFixResult | undefined

    // 如果需要修复
    if (fix && write) {
        fixResult = await fixLint({
            patterns,
            cwd,
            source,
            options: { write }
        })
    }

    return {
        lint: lintResult,
        fix: fixResult
    }
}

// 默认导出
export default {
    // 规则提取
    extract: {
        eslint: extractESLintRules,
        stylelint: extractStylelintRules,
        all: extractAllRules,
        metadata: getRuleMetadata
    },

    // 知识库
    knowledge: {
        generate: generateKnowledgeBase,
        load: loadKnowledgeBase,
        query: queryKnowledgeBase
    },

    // 验证
    run: {
        eslint: runESLint,
        stylelint: runStylelint,
        typescript: runTypeScript,
        all: runLint
    },

    // 修复
    fix: {
        eslint: fixESLint,
        stylelint: fixStylelint,
        typescript: fixTypeScript,
        all: fixLint,
        formatAndFix
    },

    // 配置检测
    detect: detectLintConfig,

    // 快捷函数
    lint
}
