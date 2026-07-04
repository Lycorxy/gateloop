#!/usr/bin/env node
/**
 * 第三步：脚本自动获取文档（改进版）
 *
 * 目的：
 * 脚本遍历 rules.json，为每个规则生成高质量的 Markdown 文档，
 * 每个规则对应一个文件。**此时模型不参与**，完全由脚本执行。
 *
 * 改进点：
 * 1. 不依赖网络爬取，使用 rules.json 中的完整信息
 * 2. 生成结构清晰、内容全面的文档
 * 3. 包含规则说明、配置、示例、常见问题等
 * 4. 统一的格式和样式
 */

const fs = require('fs')
const path = require('path')

// 配置
const config = {
  rulesPath: path.resolve(__dirname, '../../../knowledge/lint/rules.json'),
  tempDocsDir: path.resolve(__dirname, '../temp-docs')
}

// 规则分类（基于规则的名称和 category）
const ruleCategories = {
  'Possible Errors': 'error',
  'Best Practices': 'best-practices',
  'Variables': 'variables',
  'Stylistic Issues': 'style',
  'ES6': 'es6',
  'problem': 'problem',
  'suggestion': 'suggestion',
  'layout': 'layout',
  'other': 'other'
}

// 为常见规则提供更详细的说明
const ruleDescriptions = {
  'constructor-super': '要求派生类的构造函数在调用 this 之前必须调用 super()，这是在派生类构造函数中访问 this 的前提条件。',
  'for-direction': '确保 for 循环的更新语句使循环变量向正确的方向移动，防止无限循环或不执行循环。',
  'getter-return': '强制要求 getter 函数必须有返回值，getter 函数应该返回一个值而不应有副作用。',
  'no-async-promise-executor': '禁止将异步函数作为 Promise 的执行器，Promise 执行器应该是同步的。',
  'no-case-declarations': '禁止在 case 子句中声明变量，应该在 switch 语句外声明变量或在 case 块中使用花括号。',
  'no-class-assign': '禁止修改类声明，防止意外地给类变量赋值。',
  'no-compare-neg-zero': '禁止直接与 -0 比较，因为 Object.is(-0, 0) 返回 false，应使用更合适的比较方法。',
  'no-cond-assign': '禁止在条件语句中使用赋值操作符，通常这是一个错误，应该使用比较操作符。',
  'no-const-assign': '禁止修改用 const 声明的变量，const 变量是常量，不能重新赋值。',
  'no-constant-condition': '禁止在条件中使用常量表达式，这通常是错误或代码逻辑有问题。',
  'no-control-regex': '禁止在正则表达式中使用控制字符，这些字符可能会导致意外的行为。',
  'no-debugger': '禁止使用 debugger 语句，debugger 语句应该只在调试时使用，不应提交到代码库。',
  'no-delete-var': '禁止删除变量，使用 var、let 或 const 声明的变量不能被删除。',
  'no-dupe-args': '禁止函数参数重名，重复的参数名会导致混淆和潜在的错误。',
  'no-dupe-class-members': '禁止类成员重名，重复的成员名会导致覆盖和潜在的错误。',
  'no-dupe-else-if': '禁止 if-else-if 链中出现重复的条件，重复的条件会导致某些分支永远无法执行。',
  'no-dupe-keys': '禁止对象字面量中出现重复的键，重复的键会导致后面的覆盖前面的。',
  'no-duplicate-case': '禁止 switch 语句中出现重复的 case 标签，重复的 case 会导致后面的覆盖前面的。',
  'no-empty': '禁止空的块语句，空的块语句通常表示代码不完整或逻辑错误。',
  'no-empty-character-class': '禁止在正则表达式中出现空的字符类，空的字符类 [] 不匹配任何字符。',
  'no-empty-pattern': '禁止在解构模式中出现空模式，空模式没有实际作用。',
  'no-ex-assign': '禁止给异常变量赋值，catch 块中的异常变量不应该被重新赋值。',
  'no-extra-boolean-cast': '禁止不必要的布尔转换，例如 !!x 或 Boolean(x) 可以简化为直接使用布尔值。',
  'no-extra-semi': '禁止不必要的分号，不必要的分号会导致代码冗余和可能的意外行为。',
  'no-fallthrough': '禁止 switch 语句中的 case 贯穿（fallthrough），除非有明确的注释说明。',
  'no-func-assign': '禁止重新赋值函数声明，函数声明不应该被重新赋值。',
  'no-global-assign': '禁止给全局变量赋值，这可能会导致意外的行为和难以调试的问题。',
  'no-import-assign': '禁止重新赋值 import 导入的变量，import 导入的变量是只读的。',
  'no-inner-declarations': '禁止在嵌套块中声明函数或 var，函数应该在块的最外层声明。',
  'no-invalid-regexp': '禁止在 RegExp 构造函数中出现无效的正则表达式，这会立即抛出错误。',
  'no-irregular-whitespace': '禁止在字符串和正则表达式中出现不规则的空白字符。',
  'no-loss-of-precision': '禁止由于数值精度丢失导致小数点后的数字被忽略，应使用更精确的表达方式。',
  'no-misleading-character-class': '禁止在正则表达式中出现具有误导性的字符类，例如 [a-z] 中包含非字母字符。',
  'no-mixed-spaces-and-tabs': '禁止空格和制表符混用，应该统一使用空格或制表符。',
  'no-new-symbol': '禁止使用 new 操作符创建 Symbol 实例，Symbol 应该作为函数调用而不是构造函数。',
  'no-nonoctal-decimal-escape': '禁止在字符串中使用非八进制数字的八进制转义序列，这可能会导致意外的行为。',
  'no-obj-calls': '禁止调用全局对象的属性，例如 Math()、JSON() 等。',
  'no-octal': '禁止使用八进制字面量，应该使用标准的小数或字符串表示。',
  'no-prototype-builtins': '禁止直接调用对象原型上的内置方法，应该使用 Object.prototype 上的方法。',
  'no-redeclare': '禁止重复声明变量，重复声明会导致混淆和潜在的错误。',
  'no-regex-spaces': '禁止在正则表达式中的括号前出现空格，这通常是错误。',
  'no-self-assign': '禁止给自己赋值，给自己赋值没有意义。',
  'no-setter-return': '禁止 setter 函数返回值，setter 函数应该有副作用而不返回值。',
  'no-shadow-restricted-names': '禁止使用与受限名称相同的变量名，如 NaN、undefined 等。',
  'no-sparse-arrays': '禁止使用稀疏数组，稀疏数组会导致意外的行为和性能问题。',
  'no-this-before-super': '禁止在调用 super() 之前使用 this，这会导致运行时错误。',
  'no-undef': '禁止使用未声明的变量，这会导致 ReferenceError。',
  'no-unexpected-multiline': '禁止混淆的多行表达式，这可能导致意外的解析结果。',
  'no-unreachable': '禁止不可达代码，不可达代码永远不会被执行，应该被删除。',
  'no-unsafe-finally': '禁止在 finally 块中使用控制流语句（return、throw、break、continue）。',
  'no-unsafe-negation': '禁止对关系运算符的左操作数进行否定，这可能导致意外的逻辑。',
  'no-unsafe-optional-chaining': '禁止在可选链中使用不必要的运算符，可能导致意外的行为。',
  'no-unused-labels': '禁止使用未使用的标签，未使用的标签应该被删除。',
  'no-unused-vars': '禁止使用未声明的变量，未使用的变量应该被删除或添加下划线前缀。',
  'no-useless-backreference': '禁止在正则表达式中使用无用的反向引用。',
  'no-useless-catch': '禁止不必要的 catch 子句，catch 子句应该处理错误或重新抛出。',
  'no-useless-escape': '禁止不必要的转义字符，不必要的转义会导致代码可读性降低。',
  'no-with': '禁止使用 with 语句，with 语句可能导致意外的行为和性能问题。',
  'object-curly-spacing': '强制对象字面量中花括号内外的空格一致性。',
  'require-yield': '禁止在 generator 函数中没有 yield 语句。',
  'semi': '要求或禁止使用分号，根据配置可以强制使用或不使用分号。',
  'use-isnan': '要求使用 isNaN() 检查 NaN，而不是直接比较，因为 NaN !== NaN。',
  'valid-typeof': '要求 typeof 表达式的结果与有效字符串比较，防止拼写错误。',
  'eol-last': '强制文件末尾有一个换行符，这是代码格式化的常见要求。'
}

// 为常见规则提供代码示例
const ruleExamples = {
  'constructor-super': {
    correct: `class Dog extends Animal {
  constructor(name) {
    super(name)
    this.name = name
  }
}`,
    incorrect: `class Dog extends Animal {
  constructor(name) {
    this.name = name
    super(name)
  }
}`
  },
  'for-direction': {
    correct: `for (let i = 0 i < 10 i++) {
  console.log(i)
}`,
    incorrect: `for (let i = 0 i < 10 i--) {
  console.log(i)
}`
  },
  'semi': {
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
  }
}

// 工具函数：获取规则的详细说明
function getRuleDescription(rule) {
  // 优先使用预定义的详细说明
  if (ruleDescriptions[rule.name]) {
    return ruleDescriptions[rule.name]
  }
  
  // 使用 rules.json 中的 description
  if (rule.description && rule.description.length > 20) {
    return rule.description
  }
  
  // 生成默认说明
  const ruleName = rule.name
    .replace('no-', '禁止 ')
    .replace('require-', '要求 ')
    .replace('use-', '使用 ')
    .replace('-', ' ')
  
  return `此规则${ruleName}，以确保代码质量和一致性。`
}

// 工具函数：生成规则文档
function generateRuleDoc(rule) {
  const description = getRuleDescription(rule)
  const hasExamples = ruleExamples[rule.name]
  
  const severity = rule.configValue === 'error' ? '错误' : 
                  rule.configValue === 'warn' ? '警告' : 
                  rule.configValue === 'off' ? '关闭' : rule.configValue
  
  const severityIcon = rule.configValue === 'error' ? '❌' :
                     rule.configValue === 'warn' ? '⚠️' :
                     rule.configValue === 'off' ? '🔴' : '📋'

  let markdown = `# 规则：${rule.name}

## 📋 配置信息

| 项目 | 值 |
|------|-----|
| **规则名称** | \`${rule.name}\` |
| **配置值** | \`${rule.configValue}\` |
| **严重程度** | ${severity} ${severityIcon} |
| **来源** | ${rule.source} |
| **继承深度** | ${rule.depth} |

**继承链**：
${rule.extendsChain.map(item => `- \`${item.name}\` (深度 ${item.depth})`).join('\n')}

---

## 📖 详细说明

${description}

**官方文档**：${rule.url ? `[${rule.url}](${rule.url})` : '暂无'}

**分类**：${rule.category || '未分类'}

---

## 💡 代码示例

${hasExamples ? `
### ✅ 正确示例

\`\`\`javascript
${ruleExamples[rule.name].correct}
\`\`\`

### ❌ 错误示例

\`\`\`javascript
${ruleExamples[rule.name].incorrect}
\`\`\`
` : `
### ✅ 正确示例

\`\`\`javascript
// 符合规则的代码示例
// 规则要求：${description.substring(0, 100)}...
\`\`\`

### ❌ 错误示例

\`\`\`javascript
// 违反规则的代码示例
// 需要避免：${description.substring(0, 100)}...
\`\`\`
`}

---

## ⚙️ 配置选项

### 在 ESLint 配置文件中配置

\`\`\`javascript
// .eslintrc.cjs
module.exports = {
  rules: {
    '${rule.name}': '${rule.configValue}'
  }
}
\`\`\`

### 可选配置值

| 值 | 说明 |
|-----|------|
| \`"error"\` | 产生错误（红色） |
| \`"warn"\` | 产生警告（黄色） |
| \`"off"\` | 关闭规则 |

---

## ❓ 常见问题

### Q: 这个规则的作用是什么？

**A:** ${description}

### Q: 如何禁用这个规则？

**A:** 在配置文件中设置为 \`"off"\`：

\`\`\`javascript
rules: {
  '${rule.name}': 'off'
}
\`\`\`

### Q: 为什么这个规则配置为 \`${rule.configValue}\`？

**A:** 根据项目的 ESLint 配置，这个规则的严重程度为 **${severity}**，建议遵守此配置以确保代码质量。

### Q: 这条规则来自哪里？

**A:** ${rule.extendsChain.map(item => item.name).join(' → ')}

---

## ✅ 最佳实践

1. **遵循规则配置**：严格遵守项目的 ESLint 配置要求
2. **理解规则意图**：理解规则为什么要这样配置，避免盲目禁用
3. **正确处理错误**：遇到规则提示时，认真检查并修复
4. **保持代码一致性**：在团队中保持统一的代码风格
5. **定期检查**：在提交代码前运行 ESLint 检查

---

## 🔗 相关资源

- [ESLint 官方文档](https://eslint.org/docs/latest/)
${rule.url ? `- [规则官方文档](${rule.url})` : ''}
- [项目配置文件](.eslintrc.cjs)
- [完整规则列表](./index.md)

---

> 📌 **提示**：此文档由 lint-knowledge skill 自动生成。如需更详细的信息，请参考官方文档。
`

  return markdown
}

// 主函数
async function main() {
  console.log('============================================================')
  console.log('第三步：脚本自动获取文档（改进版）')
  console.log('============================================================')
  console.log('')
  
  try {
    // 检查 rules.json 是否存在
    if (!fs.existsSync(config.rulesPath)) {
      throw new Error(`rules.json 不存在，请先执行第一步：${config.rulesPath}`)
    }
    
    // 读取规则数据
    console.log('📖 读取 rules.json...')
    const rulesData = JSON.parse(fs.readFileSync(config.rulesPath, 'utf-8'))
    console.log(`✅ 已读取 ${rulesData.rules.length} 条规则`)
    console.log('')
    
    // 创建临时文档目录
    console.log('📁 准备临时文档目录...')
    if (!fs.existsSync(config.tempDocsDir)) {
      fs.mkdirSync(config.tempDocsDir, { recursive: true })
      console.log(`✅ 已创建目录：${config.tempDocsDir}`)
    } else {
      console.log(`✅ 目录已存在：${config.tempDocsDir}`)
      // 清空目录
      const existingFiles = fs.readdirSync(config.tempDocsDir)
      existingFiles.forEach(file => {
        fs.unlinkSync(path.join(config.tempDocsDir, file))
      })
      console.log(`✅ 已清空目录（删除了 ${existingFiles.length} 个旧文件）`)
    }
    console.log('')
    
    // 遍历每个规则，生成文档
    console.log('📝 开始生成规则文档...')
    console.log('')
    
    let successCount = 0
    let failureCount = 0
    const failedRules = []
    
    for (const rule of rulesData.rules) {
      try {
        console.log(`  📄 生成文档：${rule.name}`)
        
        // 生成文件名
        const fileName = `${rule.name.replace(/\//g, '--')}.md`
        const filePath = path.join(config.tempDocsDir, fileName)
        
        // 生成 Markdown 文档
        const markdown = generateRuleDoc(rule)
        
        // 保存文档
        fs.writeFileSync(filePath, markdown, 'utf-8')
        console.log(`    ✅ 已保存：${fileName}`)
        console.log('')
        
        successCount++
      } catch (error) {
        console.error(`    ❌ 生成文档失败：${rule.name}`)
        console.error(`    错误：${error.message}`)
        console.log('')
        failureCount++
        failedRules.push(rule.name)
      }
    }
    
    console.log('============================================================')
    console.log('✅ 第三步完成！已为所有规则生成文档')
    console.log('============================================================')
    console.log('')
    console.log('📊 统计信息：')
    console.log(`  成功：${successCount} 条`)
    console.log(`  失败：${failureCount} 条`)
    console.log(`  总计：${rulesData.rules.length} 条`)
    console.log('')
    
    if (failedRules.length > 0) {
      console.log('❌ 失败的规则：')
      failedRules.forEach(ruleName => console.log(`  - ${ruleName}`))
      console.log('')
    }
    
    console.log(`📁 文档已保存到：${config.tempDocsDir}`)
    console.log('')
    console.log('💡 特点：')
    console.log('  ✅ 不依赖网络爬取，使用本地规则数据')
    console.log('  ✅ 结构清晰，内容全面')
    console.log('  ✅ 统一的格式和样式')
    console.log('  ✅ 包含配置、示例、常见问题等')
    console.log('')
    
    process.exit(0)
  } catch (error) {
    console.error('')
    console.error('============================================================')
    console.error('❌ 第三步失败！')
    console.error('============================================================')
    console.error(error.message)
    console.error(error.stack)
    console.error('')
    
    process.exit(1)
  }
}

// 执行主函数
main()
