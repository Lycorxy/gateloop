/**
 * 知识库生成器
 *
 * 为 ESLint 和 Stylelint 规则生成高质量的知识库文档
 * 参考 lint-knowledge skill 的标准，生成完整的知识库结构
 */

import { resolve, join } from 'node:path'
import { exists, writeText, ensureDir, readJson, writeJson } from '../helpers'
import type {
    RuleSource,
    RuleMetadata,
    KnowledgeEntry,
    KnowledgeBase,
    GenerateKnowledgeInput
} from './types'
import { extractAllRules } from './extractor'

// ==================== 配置 ====================

const KNOWLEDGE_DIR = '.codebuddy/knowledge/lint'
const INDEX_MD = 'index.md'
const QUICK_REF_MD = 'quick-ref.md'

// ==================== 规则说明（详细中文说明） ====================

/**
 * ESLint 规则详细说明（中文）
 */
const eslintRuleDescriptions: Record<string, string> = {
    'constructor-super':
        '要求派生类的构造函数在调用 this 之前必须调用 super()，这是在派生类构造函数中访问 this 的前提条件。',
    'for-direction':
        '确保 for 循环的更新语句使循环变量向正确的方向移动，防止无限循环或循环体不执行。',
    'getter-return': '强制要求 getter 函数必须有返回值，getter 函数应该返回一个值而不应有副作用。',
    'no-async-promise-executor':
        '禁止将异步函数作为 Promise 的执行器，Promise 执行器应该是同步的，异步执行器可能导致意外行为。',
    'no-case-declarations':
        '禁止在 case 子句中声明变量，应该在 switch 语句外声明变量或在 case 块中使用花括号创建块级作用域。',
    'no-class-assign': '禁止修改类声明，防止意外地给类变量赋值导致代码逻辑错误。',
    'no-compare-neg-zero':
        '禁止直接与 -0 比较，因为 Object.is(-0, 0) 返回 false，应使用更合适的比较方法如 Object.is()。',
    'no-cond-assign': '禁止在条件语句中使用赋值操作符，通常这是一个错误，应该使用比较操作符。',
    'no-const-assign': '禁止修改用 const 声明的变量，const 变量是常量，不能重新赋值。',
    'no-constant-condition': '禁止在条件中使用常量表达式，这通常是错误或代码逻辑有问题。',
    'no-debugger': '禁止使用 debugger 语句，debugger 语句应该只在调试时使用，不应提交到代码库。',
    'no-dupe-args': '禁止函数参数重名，重复的参数名会导致混淆和潜在的错误。',
    'no-dupe-class-members': '禁止类成员重名，重复的成员名会导致覆盖和潜在的错误。',
    'no-dupe-else-if': '禁止 if-else-if 链中出现重复的条件，重复的条件会导致某些分支永远无法执行。',
    'no-dupe-keys': '禁止对象字面量中出现重复的键，重复的键会导致后面的覆盖前面的。',
    'no-duplicate-case':
        '禁止 switch 语句中出现重复的 case 标签，重复的 case 会导致后面的覆盖前面的。',
    'no-empty': '禁止空的块语句，空的块语句通常表示代码不完整或逻辑错误。',
    'no-empty-character-class': '禁止在正则表达式中出现空的字符类，空的字符类 [] 不匹配任何字符。',
    'no-empty-pattern': '禁止在解构模式中出现空模式，空模式没有实际作用。',
    'no-func-assign': '禁止重新赋值函数声明，函数声明不应该被重新赋值。',
    'no-undef': '禁止使用未声明的变量，这会导致 ReferenceError。',
    'no-unused-vars': '禁止声明未使用的变量，未使用的变量应该被删除或添加下划线前缀。',
    'no-use-before-define': '禁止在变量定义之前使用它们，这可能导致意外的行为。',
    semi: '要求或禁止使用分号，根据配置可以强制使用或不使用分号。',
    quotes: '强制使用一致的反引号、双引号或单引号。',
    indent: '强制使用一致的缩进，可以是空格或制表符。',
    'no-console': '禁止调用 console 对象的方法，console 应该只在调试时使用。',
    eqeqeq: '要求使用 === 和 !== 而不是 == 和 !=，避免隐式类型转换。',
    curly: '强制所有控制语句使用一致的括号风格。',
    'no-eval': '禁止使用 eval() 函数，eval() 可能导致安全漏洞和性能问题。',
    'no-extra-semi': '禁止不必要的分号，不必要的分号会导致代码冗余。',
    'no-fallthrough': '禁止 switch 语句中的 case 贯穿（fallthrough），除非有明确的注释说明。',
    'no-irregular-whitespace': '禁止在字符串和正则表达式中出现不规则的空白字符。',
    'no-prototype-builtins':
        '禁止直接调用对象原型上的内置方法，应该使用 Object.prototype 上的方法。',
    'no-redeclare': '禁止重复声明变量，重复声明会导致混淆和潜在的错误。',
    'no-shadow-restricted-names': '禁止使用与受限名称相同的变量名，如 NaN、undefined 等。',
    'no-unreachable': '禁止不可达代码，不可达代码永远不会被执行，应该被删除。',
    'use-isnan': '要求使用 isNaN() 检查 NaN，而不是直接比较，因为 NaN !== NaN。',
    'valid-typeof': '要求 typeof 表达式的结果与有效字符串比较，防止拼写错误。'
}

/**
 * Stylelint 规则详细说明（中文）
 */
const stylelintRuleDescriptions: Record<string, string> = {
    'block-no-empty': '禁止出现空的代码块，空的代码块通常表示代码不完整或逻辑错误。',
    'color-hex-case': '指定十六进制颜色值的大小写，可以选择小写或大写。',
    'color-hex-length': '指定十六进制颜色值的长度，可以选择短格式或长格式。',
    'comment-empty-line-before': '要求注释之前有空行。',
    'declaration-block-no-duplicate-properties': '禁止在声明块中使用重复的属性。',
    'declaration-block-no-shorthand-property-overrides':
        '禁止在声明块中使用简写属性覆盖相关的长写属性。',
    'declaration-block-semicolon-newline-after': '要求或禁止在声明块的分号后换行。',
    'declaration-block-semicolon-space-before': '要求或禁止在声明块的分号前有空格。',
    'declaration-colon-newline-after': '要求或禁止在声明的冒号后换行。',
    'declaration-colon-space-before': '要求或禁止在声明的冒号前有空格。',
    'function-url-quotes': '要求或禁止使用引号包裹 URL。',
    indentation: '强制使用一致的缩进，可以是空格或制表符。',
    'max-empty-lines': '限制文件中连续空行的最大数量。',
    'no-descending-specificity': '禁止在具有较低特异性的规则之后出现具有较高特异性的规则。',
    'no-duplicate-selectors': '禁止出现重复的选择器。',
    'no-empty-source': '禁止出现空的源文件。',
    'no-eol-whitespace': '禁止行尾出现空白。',
    'no-extra-semicolons': '禁止不必要的分号。',
    'no-invalid-double-slash-comments': '禁止在 CSS 中使用 // 注释（某些浏览器不支持）。',
    'no-missing-end-of-source-newline': '要求源文件末尾有换行符。',
    'number-leading-zero': '要求或禁止在数字中使用前导零。',
    'number-no-trailing-zeros': '禁止在数字中使用尾随零。',
    'property-case': '指定属性的大小写。',
    'selector-class-pattern': '指定类选择器的模式。',
    'selector-id-pattern': '指定 ID 选择器的模式。',
    'selector-pseudo-class-case': '指定伪类的大小写。',
    'selector-pseudo-element-case': '指定伪元素的大小写。',
    'selector-type-case': '指定类型选择器的大小写。',
    'string-quotes': '指定字符串使用单引号还是双引号。',
    'unit-case': '指定单位的大小写。',
    'value-compression': '要求压缩颜色值和长度值。'
}

// ==================== 规则代码示例 ====================

/**
 * ESLint 规则代码示例
 */
const eslintRuleExamples: Record<string, { correct: string; incorrect: string }> = {
    'constructor-super': {
        correct: `class Dog extends Animal {
  constructor(name) {
    super(name)
    this.name = name
  }
}`,
        incorrect: `class Dog extends Animal {
  constructor(name) {
    this.name = name  // ❌ 在 super() 之前使用 this
    super(name)
  }
}`
    },
    'for-direction': {
        correct: `for (let i = 0; i < 10; i++) {
  console.log(i)
}`,
        incorrect: `for (let i = 0; i < 10; i--) {
  console.log(i)
}`
    },
    semi: {
        correct: `const name = 'hello'
const obj = { foo: 'bar' }`,
        incorrect: `const name = 'hello';
const obj = { foo: 'bar' };`
    },
    'no-undef': {
        correct: `const myVar = 10
console.log(myVar)`,
        incorrect: `console.log(undeclaredVar)`
    },
    'no-unused-vars': {
        correct: `const x = 1
console.log(x)`,
        incorrect: `const x = 1
// x 从未使用`
    },
    eqeqeq: {
        correct: `if (x === 5) {
  // ...
}`,
        incorrect: `if (x == 5) {
  // ...
}`
    },
    quotes: {
        correct: `const name = 'hello'
const message = 'world'`,
        incorrect: `const name = "hello"
const message = "world"`
    },
    indent: {
        correct: `function foo() {
    const x = 1
    if (x) {
        console.log(x)
    }
}`,
        incorrect: `function foo() {
  const x = 1
    if (x) {
  console.log(x)
    }
}`
    },
    'no-console': {
        correct: `logger.info('message')
log('message')`,
        incorrect: `console.log('message')
console.error('error')`
    },
    curly: {
        correct: `if (x) {
  doSomething()
}`,
        incorrect: `if (x)
  doSomething()`
    }
}

/**
 * Stylelint 规则代码示例
 */
const stylelintRuleExamples: Record<string, { correct: string; incorrect: string }> = {
    indentation: {
        correct: `.foo {
    color: red;
    margin: 0;
}`,
        incorrect: `.foo {
color: red;
margin: 0;
}`
    },
    'string-quotes': {
        correct: `.foo {
  content: 'hello';
}`,
        incorrect: `.foo {
  content: "hello";
}`
    },
    'color-hex-case': {
        correct: `.foo {
  color: #ffffff;
}`,
        incorrect: `.foo {
  color: #FFFFFF;
}`
    },
    'declaration-block-semicolon-space-before': {
        correct: `.foo {
  color: red;
  margin: 0;
}`,
        incorrect: `.foo {
  color: red ;
  margin: 0 ;
}`
    },
    'no-eol-whitespace': {
        correct: `.foo {
  color: red;
}`,
        incorrect: `.foo {
  color: red;
}`
    }
}

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
            const entry = await generateKnowledgeEntry(rule)

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
 * 生成知识库条目
 */
async function generateKnowledgeEntry(rule: RuleMetadata): Promise<KnowledgeEntry> {
    const source = rule.source
    const ruleName = rule.name

    // 获取规则详细说明
    const description = getRuleDescription(ruleName, source)

    // 生成规则文档 URL
    const url = rule.url || generateRuleUrl(ruleName, source)

    // 获取代码示例
    const examples = getRuleExamples(ruleName, source)

    const entry: KnowledgeEntry = {
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

    return entry
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

    // 默认说明
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
        examples.push({
            type: 'correct',
            title: '正确示例',
            code: correct,
            explanation: '符合规则的代码'
        })
        examples.push({
            type: 'incorrect',
            title: '错误示例',
            code: incorrect,
            explanation: '违反规则的代码'
        })
    }

    if (source === 'stylelint' && stylelintRuleExamples[ruleName]) {
        const { correct, incorrect } = stylelintRuleExamples[ruleName]
        examples.push({
            type: 'correct',
            title: '正确示例',
            code: correct,
            explanation: '符合规则的代码'
        })
        examples.push({
            type: 'incorrect',
            title: '错误示例',
            code: incorrect,
            explanation: '违反规则的代码'
        })
    }

    // 如果没有预定义的示例，生成默认示例
    if (examples.length === 0) {
        examples.push({
            type: 'correct',
            title: '正确示例',
            code: `// 符合 ${ruleName} 规则的代码示例\n// 请根据官方文档补充具体示例`,
            explanation: '符合规则的代码'
        })
        examples.push({
            type: 'incorrect',
            title: '错误示例',
            code: `// 违反 ${ruleName} 规则的代码示例\n// 请根据官方文档补充具体示例`,
            explanation: '违反规则的代码，需要修复'
        })
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

// ==================== 文档保存 ====================

/**
 * 保存详细的规则文档（按 lint-knowledge skill 标准）
 */
async function saveDetailedRuleDoc(
    entry: KnowledgeEntry,
    targetDir: string,
    overwrite: boolean = false
): Promise<void> {
    const detailedDir = join(targetDir, 'references')
    const safeRuleName = entry.ruleName.replace(/\//g, '--')
    const filePath = join(detailedDir, `${entry.source}--${safeRuleName}.md`)

    // 检查文件是否已存在
    if (!overwrite && (await exists(filePath))) {
        return
    }

    // 生成详细的 Markdown 内容
    const content = generateDetailedMarkdown(entry)

    // 创建目录
    await ensureDir(detailedDir)

    // 写入文件
    await writeText(filePath, content)
}

/**
 * 生成详细的 Markdown 内容（按 lint-knowledge skill 标准）
 */
function generateDetailedMarkdown(entry: KnowledgeEntry): string {
    const lines: string[] = []

    // 标题
    lines.push(`# 规则：${entry.ruleName}`)
    lines.push('')

    // 配置信息表格
    const { configValue, configSource, depth, extendsChain, category } = entry
    const severityLabel = getSeverityLabel(configValue)
    const sourceLabel = getSourceLabel(configSource)

    lines.push('## 📋 配置信息')
    lines.push('')
    lines.push('| 项目 | 值 |')
    lines.push('|------|-----|')
    lines.push(`| **规则名称** | \`${entry.ruleName}\` |`)
    lines.push(`| **配置值** | \`${formatConfigValue(configValue)}\` |`)
    lines.push(`| **严重程度** | ${severityLabel} |`)
    lines.push(`| **来源** | ${sourceLabel} |`)
    lines.push(`| **继承深度** | ${depth ?? '-'} |`)
    lines.push('')

    // 继承链
    if (extendsChain && extendsChain.length > 0) {
        lines.push('**继承链**：')
        for (const chain of extendsChain) {
            lines.push(`- \`${chain.name}\` (深度 ${chain.depth})`)
        }
        lines.push('')
    }

    lines.push('---')
    lines.push('')

    // 详细说明
    lines.push('## 📖 详细说明')
    lines.push('')
    lines.push(entry.description)
    lines.push('')

    // 官方文档链接
    if (entry.url) {
        lines.push(`**官方文档**：[${entry.url}](${entry.url})`)
        lines.push('')
    }

    // 分类
    if (category) {
        lines.push(`**分类**：${category}`)
        lines.push('')
    }

    lines.push('---')
    lines.push('')

    // 代码示例
    lines.push('## 💡 代码示例')
    lines.push('')

    // 正确示例
    const correctExamples = entry.correctExamples || []
    if (correctExamples.length > 0) {
        lines.push('### ✅ 正确示例')
        lines.push('')
        for (const example of correctExamples) {
            lines.push('```javascript')
            lines.push(example.code)
            lines.push('```')
            lines.push('')
        }
    }

    // 错误示例
    const incorrectExamples = entry.incorrectExamples || []
    if (incorrectExamples.length > 0) {
        lines.push('### ❌ 错误示例')
        lines.push('')
        for (const example of incorrectExamples) {
            lines.push('```javascript')
            lines.push(example.code)
            lines.push('```')
            lines.push('')
        }
    }

    lines.push('---')
    lines.push('')

    // 配置选项
    lines.push('## ⚙️ 配置选项')
    lines.push('')
    lines.push('### 在 ESLint 配置文件中配置')
    lines.push('')
    if (entry.source === 'eslint') {
        lines.push('```javascript')
        lines.push('// .eslintrc.cjs')
        lines.push('module.exports = {')
        lines.push('  rules: {')
        lines.push(`    '${entry.ruleName}': ${formatConfigValueJs(configValue)}`)
        lines.push('  }')
        lines.push('}')
        lines.push('```')
    } else if (entry.source === 'stylelint') {
        lines.push('```javascript')
        lines.push('// .stylelintrc.cjs')
        lines.push('module.exports = {')
        lines.push('  rules: {')
        lines.push(`    '${entry.ruleName}': true`)
        lines.push('  }')
        lines.push('}')
        lines.push('```')
    }
    lines.push('')
    lines.push('### 可选配置值')
    lines.push('')
    if (entry.source === 'eslint') {
        lines.push('| 值 | 说明 |')
        lines.push('|-----|------|')
        lines.push('| `"error"` | 产生错误（红色） |')
        lines.push('| `"warn"` | 产生警告（黄色） |')
        lines.push('| `"off"` | 关闭规则 |')
    }
    lines.push('')
    lines.push('---')
    lines.push('')

    // 常见问题
    lines.push('## ❓ 常见问题')
    lines.push('')
    lines.push('### Q: 这个规则的作用是什么？')
    lines.push('')
    lines.push(`**A:** ${entry.description}`)
    lines.push('')
    lines.push('### Q: 如何禁用这个规则？')
    lines.push('')
    lines.push('**A:** 在配置文件中设置为 `"off"`：')
    lines.push('')
    lines.push('```javascript')
    lines.push('rules: {')
    lines.push(`  '${entry.ruleName}': 'off'`)
    lines.push('}')
    lines.push('```')
    lines.push('')
    lines.push(`### Q: 为什么这个规则配置为 \`${formatConfigValue(configValue)}\`？`)
    lines.push('')
    lines.push(
        `**A:** 根据项目的 ESLint 配置，这个规则的严重程度为 **${severityLabel}**，建议遵守此配置以确保代码质量。`
    )
    lines.push('')
    lines.push('### Q: 这条规则来自哪里？')
    lines.push('')
    if (extendsChain && extendsChain.length > 0) {
        const source = extendsChain[0].name
        lines.push(`**A:** ${source}`)
    } else {
        lines.push(`**A:** ${configSource || '未知'}`)
    }
    lines.push('')
    lines.push('---')
    lines.push('')

    // 最佳实践
    lines.push('## ✅ 最佳实践')
    lines.push('')
    lines.push('1. **遵循规则配置**：严格遵守项目的 ESLint 配置要求')
    lines.push('2. **理解规则意图**：理解规则为什么要这样配置，避免盲目禁用')
    lines.push('3. **正确处理错误**：遇到规则提示时，认真检查并修复')
    lines.push('4. **保持代码一致性**：在团队中保持统一的代码风格')
    lines.push('5. **定期检查**：在提交代码前运行 ESLint 检查')
    lines.push('')
    lines.push('---')
    lines.push('')

    // 相关资源
    lines.push('## 🔗 相关资源')
    lines.push('')
    if (entry.source === 'eslint') {
        lines.push('- [ESLint 官方文档](https://eslint.org/docs/latest/)')
        if (entry.url) {
            lines.push(`- [规则官方文档](${entry.url})`)
        }
        lines.push('- [项目配置文件](.eslintrc.cjs)')
        lines.push('- [完整规则列表](./index.md)')
    } else if (entry.source === 'stylelint') {
        lines.push('- [Stylelint 官方文档](https://stylelint.io/)')
        if (entry.url) {
            lines.push(`- [规则官方文档](${entry.url})`)
        }
        lines.push('- [项目配置文件](.stylelintrc.cjs)')
        lines.push('- [完整规则列表](./index.md)')
    }
    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push(
        '> 📌 **提示**：此文档由 lint-knowledge skill 自动生成。如需更详细的信息，请参考官方文档。'
    )
    lines.push('')

    return lines.join('\n')
}

/**
 * 获取严重程度标签
 */
function getSeverityLabel(configValue: unknown): string {
    if (configValue === 'error' || configValue === 2) return '错误 ❌'
    if (configValue === 'warn' || configValue === 1) return '警告 ⚠️'
    if (configValue === 0) return '0 📋'
    if (Array.isArray(configValue)) {
        const sev = configValue[0]
        if (sev === 'error' || sev === 2) return '错误 ❌'
        if (sev === 'warn' || sev === 1) return '警告 ⚠️'
        if (sev === 0) return '0 📋'
    }
    return `${configValue ?? '-'} 📋`
}

/**
 * 获取来源标签
 */
function getSourceLabel(source?: string): string {
    if (!source) return '-'
    if (source === 'extends') return 'extends'
    if (source === 'local') return 'local'
    return source
}

/**
 * 格式化配置值用于 Markdown 显示
 */
function formatConfigValue(value: unknown): string {
    if (value === undefined || value === null) return '-'
    if (Array.isArray(value)) return JSON.stringify(value)
    return String(value)
}

/**
 * 格式化配置值用于 JS 代码
 */
function formatConfigValueJs(value: unknown): string {
    if (value === undefined || value === null) return "'off'"
    if (Array.isArray(value)) return JSON.stringify(value)
    if (typeof value === 'number') return String(value)
    return `'${value}'`
}

// ==================== 知识库索引生成 ====================

/**
 * 生成知识库索引文件
 */
async function generateKnowledgeIndex(
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
async function generateQuickReference(
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
async function saveRulesData(knowledgeBase: KnowledgeBase, targetDir: string): Promise<void> {
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

// ==================== 知识库查询 ====================

/**
 * 加载知识库
 */
export async function loadKnowledgeBase(cwd?: string): Promise<KnowledgeBase | null> {
    const knowledgeDir = resolve(cwd || process.cwd(), KNOWLEDGE_DIR)
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
 * 查询知识库
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

    switch (source) {
        case 'eslint':
            return knowledgeBase.eslint.find((e) => e.ruleName === ruleName) || null
        case 'stylelint':
            return knowledgeBase.stylelint.find((e) => e.ruleName === ruleName) || null
        case 'typescript':
            return knowledgeBase.typescript.find((e) => e.ruleName === ruleName) || null
        default:
            return null
    }
}
