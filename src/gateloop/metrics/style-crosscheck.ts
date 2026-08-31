/* eslint-disable complexity */

/**
 * style-crosscheck — SCSS ↔ TSX 类名一致性校验
 *
 * 收敛型门禁（违规 = 错，无主观空间）：
 *   1. SCSS 中定义的每个类名，在对应 TSX 中都有 styles.xxx 引用
 *   2. TSX 中引用的每个 styles.xxx，在 SCSS 中都有定义
 *   3. antd 覆盖的 .ant-xxx 与 TSX 中实际使用的 antd 组件匹配（粗校验）
 *
 * 替代 css-style-writer Step 6.5 的模型自评（自评容易放水）。
 *
 * 用法：nut gateloop metric style-crosscheck --dir src/
 *   exit 0 = 一致
 *   exit 1 = 有不一致（附具体清单）
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { glob } from 'glob'
import type { MetricResult, MetricFact } from './types'

interface CrosscheckInput {
    dir: string
}

interface StyleFilePair {
    scssPath: string
    tsxPath: string | null
    scssClasses: Set<string>
    tsxClassReferences: Set<string>
    antdOverrides: string[]
    tsxAntdComponents: Set<string>
}

// @complexity-justified: SCSS↔TSX 交叉验证涉及 3 类不一致检测（无 TSX/未引用/未定义）+ antd 覆盖匹配，每类有独立分支，本质复杂
export function metricStyleCrosscheck(input: CrosscheckInput): MetricResult {
    const cwd = process.cwd()
    const targetDir = input.dir

    // 1. 找所有 .module.scss 文件
    const scssPattern = join(targetDir, '**/*.module.scss').replace(/\\/g, '/')
    const scssFiles = glob.sync(scssPattern, { cwd, absolute: true })

    if (scssFiles.length === 0) {
        return {
            passed: true,
            type: 'style-crosscheck',
            metrics: { scssFiles: 0, tsxFiles: 0, pairs: 0, mismatches: 0 },
            facts: [
                {
                    fact: `目录 ${targetDir} 下未找到 .module.scss 文件（跳过交叉验证）`,
                    severity: 'info'
                }
            ],
            summary: 'style-crosscheck: 跳过（无 SCSS 文件）'
        }
    }

    // 2. 配对 SCSS ↔ TSX（同名文件）
    const pairs: StyleFilePair[] = []
    for (const scssPath of scssFiles) {
        const baseName = basename(scssPath, '.module.scss')
        const dir = dirname(scssPath)
        const tsxPath = findTsxFor(dir, baseName)
        const scssContent = safeRead(scssPath)
        const tsxContent = tsxPath ? safeRead(tsxPath) : ''

        pairs.push({
            scssPath: scssPath.replace(cwd + '/', '').replace(cwd + '\\', ''),
            tsxPath: tsxPath ? tsxPath.replace(cwd + '/', '').replace(cwd + '\\', '') : null,
            scssClasses: extractScssClasses(scssContent),
            tsxClassReferences: extractTsxStyleReferences(tsxContent),
            antdOverrides: extractAntdOverrides(scssContent),
            tsxAntdComponents: extractAntdComponents(tsxContent)
        })
    }

    // 3. 计算差异
    const facts: MetricFact[] = []
    let mismatchCount = 0

    for (const pair of pairs) {
        // 缺少对应 TSX
        if (!pair.tsxPath) {
            facts.push({
                fact: `${pair.scssPath} 未找到同名 TSX 文件（孤立 SCSS 或路径不一致）`,
                severity: 'warn',
                location: pair.scssPath
            })
            continue
        }

        // SCSS 定义但 TSX 未引用
        const unusedInTsx = [...pair.scssClasses].filter((c) => !pair.tsxClassReferences.has(c))
        if (unusedInTsx.length > 0) {
            mismatchCount++
            facts.push({
                fact: `${pair.scssPath} 定义了类名但在 ${pair.tsxPath} 中未引用: ${unusedInTsx.join(', ')}`,
                severity: 'fail',
                location: pair.scssPath
            })
        }

        // TSX 引用但 SCSS 未定义
        const undefinedInScss = [...pair.tsxClassReferences].filter((c) => !pair.scssClasses.has(c))
        if (undefinedInScss.length > 0) {
            mismatchCount++
            facts.push({
                fact: `${pair.tsxPath} 引用了 styles.xxx 但 ${pair.scssPath} 中未定义: ${undefinedInScss.join(', ')}`,
                severity: 'fail',
                location: pair.tsxPath
            })
        }

        // antd 覆盖与实际使用不匹配（粗校验）
        for (const antOverride of pair.antdOverrides) {
            const componentName = antOverride.replace(/^\.ant-/, '').split('-')[0]
            const usedInTsx = [...pair.tsxAntdComponents].some((c) =>
                c.toLowerCase().includes(componentName.toLowerCase())
            )
            if (!usedInTsx) {
                mismatchCount++
                facts.push({
                    fact: `${pair.scssPath} 覆盖了 ${antOverride} 但 ${pair.tsxPath} 中未发现对应 antd 组件使用`,
                    severity: 'fail',
                    location: pair.scssPath
                })
            }
        }
    }

    const passed = mismatchCount === 0
    const summary = passed
        ? `style-crosscheck: ${pairs.length} 对 SCSS↔TSX 全部一致`
        : `style-crosscheck: ${mismatchCount} 处不一致（${pairs.length} 对配对）`

    return {
        passed,
        type: 'style-crosscheck',
        metrics: {
            scssFiles: scssFiles.length,
            pairs: pairs.length,
            pairsWithTsx: pairs.filter((p) => p.tsxPath).length,
            mismatches: mismatchCount
        },
        facts,
        summary
    }
}

/** 找同名 TSX 文件（支持 .tsx / index.tsx） */
function findTsxFor(dir: string, baseName: string): string | null {
    const candidates = [join(dir, `${baseName}.tsx`), join(dir, 'index.tsx')]
    for (const c of candidates) {
        if (existsSync(c)) return c
    }
    return null
}

function safeRead(path: string): string {
    try {
        return readFileSync(path, 'utf-8')
    } catch {
        return ''
    }
}

/**
 * 从 SCSS 内容提取顶层类名定义
 *   匹配 `.className {` 或 `.className,` 但排除 `:global { .ant-xxx }` 中的 antd 覆盖
 *   支持 `.a, .b {` 多选择器（同一行多个类名）
 */
// @complexity-justified: SCSS 类名提取需处理 :global 块状态机 + 多选择器匹配 + antd 排除，分支多本质复杂
function extractScssClasses(scss: string): Set<string> {
    const classes = new Set<string>()
    const lines = scss.split('\n')
    let inGlobal = false
    let globalDepth = 0

    for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.includes(':global')) {
            inGlobal = true
            globalDepth = (trimmed.match(/{/g) || []).length - (trimmed.match(/}/g) || []).length
            continue
        }
        if (inGlobal) {
            globalDepth += (trimmed.match(/{/g) || []).length - (trimmed.match(/}/g) || []).length
            if (globalDepth <= 0) inGlobal = false
            continue
        }
        // 匹配行内所有 .className（支持 .a, .b { 多选择器）
        // 排除 .ant-xxx（antd 内部类名）
        // 排除 &__xxx 形式（BEM 嵌套，由父类决定，此处不提取）
        const regex = /\.([a-zA-Z][a-zA-Z0-9_-]*)/g
        let match
        while ((match = regex.exec(trimmed)) !== null) {
            if (!match[1].startsWith('ant-')) {
                classes.add(match[1])
            }
        }
    }
    return classes
}

/** 从 TSX 内容提取 styles.xxx 引用 */
function extractTsxStyleReferences(tsx: string): Set<string> {
    const refs = new Set<string>()
    // styles.className 或 styles['className']
    const regex = /styles\.([a-zA-Z][a-zA-Z0-9_]*)|styles\[['"]([a-zA-Z][a-zA-Z0-9_-]*)['"]\]/g
    let match
    while ((match = regex.exec(tsx)) !== null) {
        refs.add(match[1] || match[2])
    }
    return refs
}

/** 从 SCSS :global 块提取 .ant-xxx 覆盖 */
function extractAntdOverrides(scss: string): string[] {
    const overrides: string[] = []
    const regex = /\.ant-[a-z-]+/g
    let match
    while ((match = regex.exec(scss)) !== null) {
        if (!overrides.includes(match[0])) overrides.push(match[0])
    }
    return overrides
}

/** 从 TSX 提取使用的 antd 组件名（粗匹配 <Xxx / from 'antd'） */
function extractAntdComponents(tsx: string): Set<string> {
    const components = new Set<string>()
    // 匹配 <Button / <Input / 等 PascalCase 标签
    const regex = /<([A-Z][a-zA-Z]+)/g
    let match
    while ((match = regex.exec(tsx)) !== null) {
        components.add(match[1])
    }
    return components
}
