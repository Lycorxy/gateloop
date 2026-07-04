#!/usr/bin/env node
/**
 * 第四步：模型生成知识库
 * 
 * 目的：
 * 根据 rules.json 和临时目录中的规则文档信息，模型进行全面理解分析后，
 * 生成完整的规则知识库。
 * 
 * 注意：此步骤需要 AI 模型参与，模型的职责是：
 * 1. 全面理解分析所有规则和文档
 * 2. 自主决定知识库结构
 * 3. 生成易于查询的知识库文档
 * 4. 创建持久记忆和规则
 */

const fs = require('fs')
const path = require('path')

// 配置
const config = {
  rulesPath: path.resolve(__dirname, '../../../knowledge/lint/rules.json'),
  tempDocsDir: path.resolve(__dirname, '../temp-docs'),
  outputDir: path.resolve(__dirname, '../../../knowledge/lint'),
  aiRulePath: path.resolve(__dirname, '../../../rules/code-style.md')
}

// 工具函数：读取规则数据
function loadRules() {
  if (!fs.existsSync(config.rulesPath)) {
    throw new Error(`rules.json 不存在：${config.rulesPath}`)
  }
  
  return JSON.parse(fs.readFileSync(config.rulesPath, 'utf-8'))
}

// 工具函数：读取临时文档
function loadTempDocs(rules) {
  const docs = {}
  
  for (const rule of rules) {
    const fileName = `${rule.name.replace(/\//g, '--')}.md`
    const filePath = path.join(config.tempDocsDir, fileName)
    
    if (fs.existsSync(filePath)) {
      docs[rule.name] = fs.readFileSync(filePath, 'utf-8')
    } else {
      console.warn(`⚠️  警告：规则 ${rule.name} 的文档不存在：${filePath}`)
    }
  }
  
  return docs
}

// 工具函数：分类规则
function classifyRules(rules) {
  const classification = {
    bySeverity: {
      error: rules.filter(r => r.configValue === 'error'),
      warn: rules.filter(r => r.configValue === 'warn'),
      off: rules.filter(r => r.configValue === 'off')
    },
    byCategory: {},
    byFileType: {
      base: [],  // 所有文件共用的基础规则
      js: [],    // JavaScript 特有规则
      ts: [],    // TypeScript 特有规则（@typescript-eslint/ 开头）
      jsx: [],   // JSX 特有规则（React 相关）
      tsx: [],   // TSX 特有规则（TypeScript + JSX）
      vue: []    // Vue 特有规则
    }
  }
  
  // 按类别分类
  for (const rule of rules) {
    const category = rule.category || 'other'
    if (!classification.byCategory[category]) {
      classification.byCategory[category] = []
    }
    classification.byCategory[category].push(rule)
  }
  
  // 按文件类型分类（根据规则名称判断）
  for (const rule of rules) {
    // TypeScript 特定规则（@typescript-eslint/ 开头）
    if (rule.name.startsWith('@typescript-eslint/')) {
      classification.byFileType.ts.push(rule)
      classification.byFileType.tsx.push(rule)  // TSX 也适用 TypeScript 规则
    }
    // Vue 特定规则（@/ 开头，通常是 @/vue-eslint）
    else if (rule.name.startsWith('@/vue') || rule.name.startsWith('vue/')) {
      classification.byFileType.vue.push(rule)
    }
    // JSX 特定规则（React 相关）
    else if (rule.name.includes('jsx') || rule.name.includes('react')) {
      classification.byFileType.jsx.push(rule)
      classification.byFileType.tsx.push(rule)  // TSX 也适用 JSX 规则
    }
    // ESLint 核心规则（所有文件适用）
    else {
      classification.byFileType.base.push(rule)
      classification.byFileType.js.push(rule)  // JavaScript 也适用
      classification.byFileType.ts.push(rule)  // TypeScript 也适用基础规则
      classification.byFileType.jsx.push(rule)  // JSX 也适用基础规则
      classification.byFileType.tsx.push(rule)  // TSX 也适用基础规则
      classification.byFileType.vue.push(rule)  // Vue 也适用基础规则
    }
  }
  
  return classification
}

// 工具函数：生成索引文件
function generateIndex(rules, classification, tempDocs) {
  const markdown = `# ESLint 代码规范知识库

## 📊 概览

| 项目 | 数值 |
|------|------|
| 已启用规则 | ${rules.length} 条 |
| error 级别 | ${classification.bySeverity.error.length} 条 |
| warn 级别 | ${classification.bySeverity.warn.length} 条 |
| 核心规则 | ${classification.byFileType.base.length} 条 |
| TypeScript 规则 | ${classification.byFileType.ts.length} 条 |
| 继承层级 | ${rules.length > 0 ? Math.max(...rules.map(r => r.depth || 1)) : 1} 层 |

## 📖 使用说明

此知识库包含项目中所有已启用的 ESLint 规则，每次生成代码前，**必须**参考此知识库。

### 🚨 必须遵守的规则（error 级别）

这些规则会阻止代码提交，必须严格遵守：

${classification.bySeverity.error.slice(0, 20).map(rule => `
#### ${rule.name}

**配置值**：${rule.configValue}

**来源**：${rule.source === 'extends' ? rule.extendsChain[rule.extendsChain.length - 1].name : '本地配置'}

**说明**：${rule.description || '暂无说明'}

**详细文档**：[查看详情](./detailed/${rule.name.replace(/\//g, '--')}.md)
`).join('\n')}

### 💡 建议遵守的规则（warn 级别）

${classification.bySeverity.warn.length > 0 ? classification.bySeverity.warn.slice(0, 10).map(rule => `
#### ${rule.name}

**配置值**：${rule.configValue}

**说明**：${rule.description || '暂无说明'}

**详细文档**：[查看详情](./detailed/${rule.name.replace(/\//g, '--')}.md)
`).join('\n') : '（无 warn 级别规则）'}

## 📚 按严重程度查询

- [error 级别规则](./by-severity/error.md) - ${classification.bySeverity.error.length} 条
- [warn 级别规则](./by-severity/warn.md) - ${classification.bySeverity.warn.length} 条

## 📂 按功能分类查询

${Object.entries(classification.byCategory).map(([category, rules]) => `
- [${category}](./by-category/${category}.md) - ${rules.length} 条`).join('\n')}

## 📄 按文件类型查询

- [基础规则（所有文件）](./by-file-type/base.md) - ${classification.byFileType.base.length} 条
- [JavaScript 规则](./by-file-type/js.md) - ${classification.byFileType.js.length} 条
- [TypeScript 规则](./by-file-type/ts.md) - ${classification.byFileType.ts.length} 条

## 🔍 详细规则文档

${rules.slice(0, 30).map(rule => `
- [${rule.name}](./detailed/${rule.name.replace(/\//g, '--')}.md)`).join('\n')}
${rules.length > 30 ? `\n... 还有 ${rules.length - 30} 条规则` : ''}

## 📋 快速查找指南

### 常用规则快速链接

1. **代码风格**
   - [semi](./detailed/semi.md) - 分号规则
   - [quotes](./detailed/quotes.md) - 引号规则
   - [indent](./detailed/indent.md) - 缩进规则

2. **类型安全**
   - [no-explicit-any](./detailed/typescript-eslint--no-explicit-any.md) - 禁止 any 类型
   - [explicit-function-return-type](./detailed/typescript-eslint--explicit-function-return-type.md) - 显式返回类型

3. **代码质量**
   - [no-unused-vars](./detailed/typescript-eslint--no-unused-vars.md) - 禁止未使用变量
   - [no-console](./detailed/no-console.md) - 禁止 console

## 🔧 配置文件

- [Prettier 配置](./prettier.md) - 代码格式化规则
- [ESLint 配置](./rules-data.json) - 完整规则数据（JSON 格式）

---

**重要提示**：
- 每次生成代码前，必须查询对应的规则文档
- 参考 ✅ 正确示例，避免 ❌ 错误示例
- 遵守最佳实践建议
- 如果不确定，查看详细文档

**最后更新时间**：${new Date().toISOString()}
`

  return markdown
}

// 工具函数：生成快速参考文件
function generateQuickRef(rules, classification) {
  const markdown = `# ESLint 代码规范快速参考

> 此文档提供最常用和最重要的规则快速参考，适合快速查阅。

## 🚨 必须遵守的规则（Top 20 error 级别）

${classification.bySeverity.error.slice(0, 20).map(rule => `
### ${rule.name}

**配置值**：\`${rule.configValue}\`

**说明**：${rule.description || '暂无说明'}

**查看详情**：[详细文档](./detailed/${rule.name.replace(/\//g, '--')}.md)
`).join('\n')}

## 💡 建议遵守的规则（Top 10 warn 级别）

${classification.bySeverity.warn.length > 0 ? classification.bySeverity.warn.slice(0, 10).map(rule => `
### ${rule.name}

**配置值**：\`${rule.configValue}\`

**说明**：${rule.description || '暂无说明'}

**查看详情**：[详细文档](./detailed/${rule.name.replace(/\//g, '--')}.md)
`).join('\n') : '（无 warn 级别规则）'}

## 📋 检查清单

生成代码后，检查以下项目：

- [ ] 所有变量的类型定义完整
- [ ] 函数有明确的返回类型
- [ ] 不使用未声明的变量
- [ ] 不使用未使用的变量
- [ ] 使用严格相等（===）和（!==）
- [ ] 变量使用驼峰命名
- [ ] 常量使用大写下划线命名
- [ ] 遵守代码格式规范（单引号、无分号、4 空格缩进）
- [ ] 行宽不超过 100 字符
- [ ] 不使用 console（除非在调试代码中）

---

**最后更新时间**：${new Date().toISOString()}
`

  return markdown
}

// 工具函数：生成按严重程度分类的文件
function generateBySeverity(classification) {
  const files = {}
  
  files.error = `# error 级别规则

这些规则会阻止代码提交，必须严格遵守。

## 规则列表

${classification.bySeverity.error.map(rule => `
### ${rule.name}

**配置值**：\`${rule.configValue}\`

**说明**：${rule.description || '暂无说明'}

**来源**：${rule.source === 'extends' ? rule.extendsChain[rule.extendsChain.length - 1].name : '本地配置'}

**详细文档**：[查看详情](../detailed/${rule.name.replace(/\//g, '--')}.md)
`).join('\n')}
`
  
  files.warn = `# warn 级别规则

这些规则建议遵守，但不会阻止代码提交。

## 规则列表

${classification.bySeverity.warn.map(rule => `
### ${rule.name}

**配置值**：\`${rule.configValue}\`

**说明**：${rule.description || '暂无说明'}

**来源**：${rule.source === 'extends' ? rule.extendsChain[rule.extendsChain.length - 1].name : '本地配置'}

**详细文档**：[查看详情](../detailed/${rule.name.replace(/\//g, '--')}.md)
`).join('\n')}
`
  
  return files
}

// 工具函数：生成按分类的文件
function generateByCategory(classification) {
  const files = {}
  
  Object.entries(classification.byCategory).forEach(([category, rules]) => {
    files[category] = `# ${category} 规则

## 规则列表

${rules.map(rule => `
### ${rule.name}

**配置值**：\`${rule.configValue}\`

**说明**：${rule.description || '暂无说明'}

**详细文档**：[查看详情](../detailed/${rule.name.replace(/\//g, '--')}.md)
`).join('\n')}
`
  })
  
  return files
}

// 工具函数：检测项目中存在的文件类型
function detectProjectFileTypes(rootDir) {
  const fileTypes = {
    js: 0,
    ts: 0,
    jsx: 0,
    tsx: 0,
    vue: 0
  }

  // 递归遍历目录
  function scanDir(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      
      entries.forEach(entry => {
        const fullPath = path.join(dir, entry.name)
        
        if (entry.isDirectory()) {
          // 跳过 node_modules 和 .git 目录
          if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist' && entry.name !== 'build') {
            scanDir(fullPath)
          }
        } else if (entry.isFile()) {
          if (entry.name.endsWith('.js')) fileTypes.js++
          if (entry.name.endsWith('.ts')) fileTypes.ts++
          if (entry.name.endsWith('.jsx')) fileTypes.jsx++
          if (entry.name.endsWith('.tsx')) fileTypes.tsx++
          if (entry.name.endsWith('.vue')) fileTypes.vue++
        }
      })
    } catch (error) {
      // 忽略无权限访问的目录
    }
  }

  // 扫描根目录和 src 目录
  if (fs.existsSync(rootDir)) {
    scanDir(rootDir)
  }

  return fileTypes
}

// 工具函数：生成按文件类型的文件（根据项目中实际存在的文件类型）
function generateByFileType(classification, fileTypes) {
  const files = {}
  
  // 基础规则（所有文件共用）- 始终生成
  if (classification.byFileType.base.length > 0) {
    files.base = `# 基础规则（所有文件）

这些规则适用于所有文件类型（JavaScript、TypeScript、JSX、TSX、Vue）。

## 统计信息
- 规则数量：${classification.byFileType.base.length} 条
- error 级别：${classification.byFileType.base.filter(r => r.configValue === 'error').length} 条
- warn 级别：${classification.byFileType.base.filter(r => r.configValue === 'warn').length} 条

## 规则列表

${classification.byFileType.base.map(rule => `
### ${rule.name}

**配置值**：\`${rule.configValue}\`

**说明**：${rule.description || '暂无说明'}

**详细文档**：[查看详情](../detailed/${rule.name.replace(/\//g, '--')}.md)
`).join('\n')}
`
  } else {
    files.base = `# 基础规则（所有文件）

**暂无基础规则。**
`
  }
  
  // JavaScript 规则 - 只在项目中有 .js 或 .jsx 文件时生成
  if (fileTypes.js > 0 || fileTypes.jsx > 0) {
    files.js = `# JavaScript 规则

这些规则适用于 JavaScript 文件（.js、.jsx）。

## 统计信息
- 规则数量：${classification.byFileType.js.length} 条
- error 级别：${classification.byFileType.js.filter(r => r.configValue === 'error').length} 条
- warn 级别：${classification.byFileType.js.filter(r => r.configValue === 'warn').length} 条

## 规则列表

${classification.byFileType.js.map(rule => `
### ${rule.name}

**配置值**：\`${rule.configValue}\`

**说明**：${rule.description || '暂无说明'}

**详细文档**：[查看详情](../detailed/${rule.name.replace(/\//g, '--')}.md)
`).join('\n')}
`
  }
  
  // TypeScript 规则 - 只在项目中有 .ts 或 .tsx 文件时生成
  if (fileTypes.ts > 0 || fileTypes.tsx > 0) {
    const tsSpecificRules = classification.byFileType.ts.filter(r => r.name.startsWith('@typescript-eslint/'))
    const baseRulesForTs = classification.byFileType.ts.filter(r => !r.name.startsWith('@typescript-eslint/'))
    
    files.ts = `# TypeScript 规则

这些规则适用于 TypeScript 文件（.ts、.tsx）。

## 统计信息
- 规则数量：${classification.byFileType.ts.length} 条
- TypeScript 特定规则：${tsSpecificRules.length} 条
- 基础规则：${baseRulesForTs.length} 条
- error 级别：${classification.byFileType.ts.filter(r => r.configValue === 'error').length} 条
- warn 级别：${classification.byFileType.ts.filter(r => r.configValue === 'warn').length} 条

## TypeScript 特定规则
${tsSpecificRules.length > 0 ? tsSpecificRules.map(rule => `
### ${rule.name}

**配置值**：\`${rule.configValue}\`

**说明**：${rule.description || '暂无说明'}

**详细文档**：[查看详情](../detailed/${rule.name.replace(/\//g, '--')}.md)
`).join('\n') : '**暂无 TypeScript 特定规则**'}

## 基础规则（也适用于 TypeScript）
${baseRulesForTs.length > 0 ? baseRulesForTs.slice(0, 20).map(rule => `
### ${rule.name}

**配置值**：\`${rule.configValue}\`

**详细文档**：[查看详情](../detailed/${rule.name.replace(/\//g, '--')}.md)
`).join('\n') + (baseRulesForTs.length > 20 ? `\n... 还有 ${baseRulesForTs.length - 20} 条基础规则` : '') : '**暂无基础规则**'}
`
  } else {
    files.ts = `# TypeScript 规则

**⚠️ 项目中未检测到 .ts 或 .tsx 文件。**

如果您将来在项目中使用 TypeScript 文件，此规则列表将会适用。

> 提示：基础规则也适用于 TypeScript 文件，请查看 [基础规则](./base.md)
`
  }
  
  // JSX 规则 - 只在项目中有 .jsx 或 .tsx 文件时生成
  if (fileTypes.jsx > 0 || fileTypes.tsx > 0) {
    const jsxSpecificRules = classification.byFileType.jsx.filter(r => r.name.includes('jsx') || r.name.includes('react'))
    const baseRulesForJsx = classification.byFileType.jsx.filter(r => !(r.name.includes('jsx') || r.name.includes('react')))
    
    files.jsx = `# JSX 规则

这些规则适用于 JSX 文件（.jsx、.tsx）。

## 统计信息
- 规则数量：${classification.byFileType.jsx.length} 条
- JSX 特定规则：${jsxSpecificRules.length} 条
- 基础规则：${baseRulesForJsx.length} 条
- error 级别：${classification.byFileType.jsx.filter(r => r.configValue === 'error').length} 条
- warn 级别：${classification.byFileType.jsx.filter(r => r.configValue === 'warn').length} 条

## JSX 特定规则
${jsxSpecificRules.length > 0 ? jsxSpecificRules.map(rule => `
### ${rule.name}

**配置值**：\`${rule.configValue}\`

**说明**：${rule.description || '暂无说明'}

**详细文档**：[查看详情](../detailed/${rule.name.replace(/\//g, '--')}.md)
`).join('\n') : '**暂无 JSX 特定规则**'}

## 基础规则（也适用于 JSX）
${baseRulesForJsx.length > 0 ? baseRulesForJsx.slice(0, 20).map(rule => `
### ${rule.name}

**配置值**：\`${rule.configValue}\`

**详细文档**：[查看详情](../detailed/${rule.name.replace(/\//g, '--')}.md)
`).join('\n') + (baseRulesForJsx.length > 20 ? `\n... 还有 ${baseRulesForJsx.length - 20} 条基础规则` : '') : '**暂无基础规则**'}
`
  }
  
  // TSX 规则 - 只在项目中有 .tsx 文件时生成
  if (fileTypes.tsx > 0) {
    const tsSpecificRules = classification.byFileType.tsx.filter(r => r.name.startsWith('@typescript-eslint/'))
    const jsxSpecificRules = classification.byFileType.tsx.filter(r => r.name.includes('jsx') || r.name.includes('react'))
    const baseRulesForTsx = classification.byFileType.tsx.filter(r => !r.name.startsWith('@typescript-eslint/') && !(r.name.includes('jsx') || r.name.includes('react')))
    
    files.tsx = `# TSX 规则

这些规则适用于 TSX 文件（TypeScript + JSX）。

## 统计信息
- 规则数量：${classification.byFileType.tsx.length} 条
- TypeScript 特定规则：${tsSpecificRules.length} 条
- JSX 特定规则：${jsxSpecificRules.length} 条
- 基础规则：${baseRulesForTsx.length} 条
- error 级别：${classification.byFileType.tsx.filter(r => r.configValue === 'error').length} 条
- warn 级别：${classification.byFileType.tsx.filter(r => r.configValue === 'warn').length} 条

## 规则列表
${classification.byFileType.tsx.slice(0, 20).map(rule => `
### ${rule.name}

**配置值**：\`${rule.configValue}\`

**说明**：${rule.description || '暂无说明'}

**详细文档**：[查看详情](../detailed/${rule.name.replace(/\//g, '--')}.md)
`).join('\n')}
${classification.byFileType.tsx.length > 20 ? `\n... 还有 ${classification.byFileType.tsx.length - 20} 条规则` : ''}
`
  }
  
  // Vue 规则 - 只在项目中有 .vue 文件时生成
  if (fileTypes.vue > 0) {
    const vueSpecificRules = classification.byFileType.vue.filter(r => r.name.includes('vue'))
    const baseRulesForVue = classification.byFileType.vue.filter(r => !r.name.includes('vue'))
    
    files.vue = `# Vue 规则

这些规则适用于 Vue 文件（.vue）。

## 统计信息
- 规则数量：${classification.byFileType.vue.length} 条
- Vue 特定规则：${vueSpecificRules.length} 条
- 基础规则：${baseRulesForVue.length} 条
- error 级别：${classification.byFileType.vue.filter(r => r.configValue === 'error').length} 条
- warn 级别：${classification.byFileType.vue.filter(r => r.configValue === 'warn').length} 条

## Vue 特定规则
${vueSpecificRules.length > 0 ? vueSpecificRules.map(rule => `
### ${rule.name}

**配置值**：\`${rule.configValue}\`

**说明**：${rule.description || '暂无说明'}

**详细文档**：[查看详情](../detailed/${rule.name.replace(/\//g, '--')}.md)
`).join('\n') : '**暂无 Vue 特定规则**'}

## 基础规则（也适用于 Vue）
${baseRulesForVue.length > 0 ? baseRulesForVue.slice(0, 20).map(rule => `
### ${rule.name}

**配置值**：\`${rule.configValue}\`

**详细文档**：[查看详情](../detailed/${rule.name.replace(/\//g, '--')}.md)
`).join('\n') + (baseRulesForVue.length > 20 ? `\n... 还有 ${baseRulesForVue.length - 20} 条基础规则` : '') : '**暂无基础规则**'}
`
  }
  
  return files
}

// 工具函数：基于规则生成代码示例
function generateExamplesForRule(rule, description) {
  const name = rule.name

  // 常见规则的代码示例映射
  const examples = {
    'constructor-super': {
      correct: `class A extends B {
  constructor() {
    super()
  }
}`,
      incorrect: `class A extends B {
  constructor() {}
}`
    },
    'no-unused-vars': {
      correct: `const usedVar = 1
console.log(usedVar)`,
      incorrect: `const unusedVar = 1
console.log('something')`
    },
    'no-undef': {
      correct: `const definedVar = 1
console.log(definedVar)`,
      incorrect: `console.log(undefinedVar)`
    },
    'semi': {
      correct: `const name = 'test'
const age = 20`,
      incorrect: `const name = 'test';
const age = 20;`
    },
    'no-const-assign': {
      correct: `const value = 1
console.log(value)`,
      incorrect: `const value = 1
value = 2`
    },
    'no-empty': {
      correct: `if (condition) {
    console.log('something')
  }`,
      incorrect: `if (condition) {}
// 空代码块`
    },
    'no-extra-semi': {
      correct: `const x = 5`,
      incorrect: `const x = 5;`
    },
    'object-curly-spacing': {
      correct: `const obj = { name: 'test', age: 20 }`,
      incorrect: `const obj = {name: 'test',age: 20}`
    },
    'eol-last': {
      correct: `const x = 1\nconst y = 2\n`,
      incorrect: `const x = 1\nconst y = 2`
    },
    'no-debugger': {
      correct: `const value = 1\nconsole.log(value)`,
      incorrect: `debugger\nconst value = 1`
    },
    'no-var': {
      correct: `let name = 'test'
const age = 20`,
      incorrect: `var name = 'test'
var age = 20`
    }
  }

  // 检查是否有预定义的示例
  if (examples[name]) {
    return examples[name]
  }

  // 基于规则名称模式生成通用示例
  if (name.startsWith('no-')) {
    const issue = name.replace('no-', '').replace(/-/g, ' ')
    return {
      correct: `// 符合规范的代码，避免了 ${issue} 的问题\nconst example = 1\nconsole.log(example)`,
      incorrect: `// 违反规范的代码，存在 ${issue} 的问题\n// 请根据规则说明避免此问题`
    }
  }

  if (name.startsWith('@typescript-eslint/')) {
    const tsRule = name.replace('@typescript-eslint/', '')
    return {
      correct: `// 符合 TypeScript 规范的代码示例\nconst value: string = 'test'\nfunction example(param: number): void {\n  console.log(param)\n}`,
      incorrect: `// 违反 TypeScript 规范的代码示例\n// 请根据规则说明避免此问题`
    }
  }

  // 默认通用示例
  return {
    correct: `// 符合规则 "${name}" 的代码示例\n// 请根据规则说明：${description.substring(0, 50)}...编写代码\nconst example = 1`,
    incorrect: `// 违反规则 "${name}" 的代码示例\n// 请避免：${description.substring(0, 50)}...`
  }
}

// 工具函数：生成详细规则文档（改进版）
function generateDetailedRules(rules, tempDocs) {
  const files = {}

  for (const rule of rules) {
    const fileName = `${rule.name.replace(/\//g, '--')}.md`
    const tempDoc = tempDocs[rule.name] || ''

    // 提取各个部分的内容
    let description = rule.description || '暂无详细说明'
    const descMatch = tempDoc.match(/## 详细说明\n([\s\S]*?)\n(## 代码示例|> 💡)/)
    if (descMatch && descMatch[1]) {
      const extractedDesc = descMatch[1].trim()
      if (extractedDesc.length > 20) {
        description = extractedDesc
      }
    }

    // 清理描述
    description = description.replace(/\s+/g, ' ').trim()

    // 生成代码示例
    let correctExample = ''
    let incorrectExample = ''

    const correctMatch = tempDoc.match(/### ✅ 正确示例\n([\s\S]*?)\n### ❌ 错误示例/)
    if (correctMatch && correctMatch[1]) {
      const code = correctMatch[1].trim()
      // 清理代码，移除可能存在的代码块标记
      const cleanedCode = code.replace(/```javascript/g, '').replace(/```/g, '').trim()
      const hasCodeKeywords = cleanedCode.includes('class') || cleanedCode.includes('function') || cleanedCode.includes('const') || cleanedCode.includes('let') || cleanedCode.includes('var') || cleanedCode.includes('if') || cleanedCode.includes('for') || cleanedCode.includes('return') || cleanedCode.includes('=>')
      const isNotCommentPlaceholder = !cleanedCode.includes('请根据规则') && !cleanedCode.includes('示例：') && !cleanedCode.includes('编写')
      if (hasCodeKeywords && isNotCommentPlaceholder) {
        correctExample = cleanedCode
      }
    }

    const incorrectMatch = tempDoc.match(/### ❌ 错误示例\n([\s\S]*?)\n## 配置选项/)
    if (incorrectMatch && incorrectMatch[1]) {
      const code = incorrectMatch[1].trim()
      // 清理代码，移除可能存在的代码块标记
      const cleanedCode = code.replace(/```javascript/g, '').replace(/```/g, '').trim()
      if (cleanedCode.includes('//') || cleanedCode.includes('class') || cleanedCode.includes('function') || cleanedCode.includes('const') || cleanedCode.includes('let') || cleanedCode.includes('var')) {
        incorrectExample = cleanedCode
      }
    }

    // 如果没有提取到真实代码示例，生成示例
    const hasRealExamples = correctExample && incorrectExample
    if (!hasRealExamples) {
      const examples = generateExamplesForRule(rule, description)
      correctExample = examples.correct
      incorrectExample = examples.incorrect
    }

    let faq = `**Q: 如何配置这个规则？**\n\nA: 在 ESLint 配置文件的 rules 字段中设置 \\'${rule.name}\\' 的值。`
    const faqMatch = tempDoc.match(/## 常见问题\n([\s\S]*?)\n## 最佳实践/)
    if (faqMatch && faqMatch[1]) {
      faq = faqMatch[1].trim() || faq
    }

    let bestPractices = '1. 遵循项目的 ESLint 配置要求\n2. 参考 AI 生成的代码示例\n3. 定期运行 ESLint 检查代码\n4. 保持代码风格一致性'
    const bestMatch = tempDoc.match(/## 最佳实践\n([\s\S]*?)\n---/)
    if (bestMatch && bestMatch[1]) {
      bestPractices = bestMatch[1].trim() || bestPractices
    }

    const extendsChainText = rule.extendsChain.map(item => `  - ${item.name} (深度 ${item.depth}, 配置值 \`${item.configValue}\`)`).join('\n')
    const pluginText = rule.plugin ? `\n- **插件**：${rule.plugin}` : ''
    const docLink = rule.url ? `- [查看官方文档](${rule.url})` : '- （暂无官方文档链接）'

    files[fileName] = `# ${rule.name}

## 配置值
\`${rule.configValue}\`

## 详细说明
${description}

## 来源信息
- **类型**：${rule.source}
- **继承深度**：${rule.depth}
- **继承链**：
${extendsChainText}${pluginText}

## 代码示例

### ✅ 正确示例
\`\`\`javascript
${correctExample.trim()}
\`\`\`

### ❌ 错误示例
\`\`\`javascript
${incorrectExample.trim()}
\`\`\`

## 配置选项
\`\`\`javascript
// 在 .eslintrc.cjs 中配置
module.exports = {
  rules: {
    '${rule.name}': '${rule.configValue}'
  }
}
\`\`\`

### 配置值说明
- \`"error"\`：会报错并阻止代码运行
- \`"warn"\`：会显示警告但不阻止运行
- \`"off"\`：关闭该规则

## 常见问题

${faq}

### 严重程度说明
**Q: 这个规则的严重程度是什么？**
A: 当前配置为 \`${rule.configValue}\`，表示：
${rule.configValue === 'error' ? '- 这是一个错误级别的规则，违反此规则会阻止代码运行。' : ''}
${rule.configValue === 'warn' ? '- 这是一个警告级别的规则，违反此规则会显示警告但不会阻止运行。' : ''}
${rule.configValue === 'off' ? '- 此规则已关闭，不会进行检查。' : ''}

## 最佳实践

${bestPractices}

## 官方文档
${docLink}

---

> 📌 **注**：此文档根据项目配置和官方规则自动生成。如需了解更详细的说明和更多代码示例，请访问官方文档链接。

**最后更新时间**：${new Date().toISOString()}
`
  }

  return files
}

// 工具函数：生成 AI 参考规则
function generateAIReferenceRule(rules) {
  const errorRules = rules.filter(r => r.configValue === 'error').slice(0, 20)
  const warnRules = rules.filter(r => r.configValue === 'warn').slice(0, 10)
  
  return `# AI 代码生成规则（强制遵守）

> 🚨 **强制执行**：此规则必须严格遵守，所有代码生成任务必须遵守项目 ESLint 规范

## 规则说明

在生成或修改任何代码（JavaScript/TypeScript/JSX/TSX/Vue）之前，**必须**：

1. **查询完整知识库**：\`.codebuddy/knowledge/lint/index.md\`
2. **查询对应文件类型的规则**：
   - TypeScript → \`.codebuddy/knowledge/lint/by-file-type/ts.md\`
   - TSX → \`.codebuddy/knowledge/lint/by-file-type/tsx.md\`
   - JavaScript → \`.codebuddy/knowledge/lint/by-file-type/js.md\`
3. **查询 Prettier 配置**：\`.codebuddy/knowledge/lint/prettier.md\`
4. **查询详细规则文档**：\`./detailed/[rule-name].md\`
5. **参考 ✅ 正确示例生成代码**
6. **避免 ❌ 错误示例**

## 强制检查清单

在生成代码后，**必须**检查：

- [ ] 使用单引号（\`'\`）
- [ ] 语句末尾不加分号
- [ ] 使用 4 空格缩进
- [ ] 行宽不超过 100 字符
- [ ] 对象字面量使用括号空格：\`{ foo: 'bar' }\`
- [ ] 箭头函数始终使用括号：\`(x) => x\`
- [ ] TypeScript 类型定义完整
- [ ] 函数显式声明返回类型
- [ ] 不使用 \`any\` 类型（除非在规则中有明确例外）
- [ ] 不使用未声明的变量
- [ ] 不使用未使用的变量
- [ ] 使用严格相等（\`===\` 和 \`!==\`）
- [ ] 变量使用驼峰命名
- [ ] 常量使用大写下划线命名
- [ ] 不使用 \`console\`（除非在调试代码中）

## 禁止行为

❌ **禁止**以下行为：

- 使用 \`any\` 类型（除非在规则中有明确例外）
- 使用双引号（\`"\`）
- 语句末尾加分号
- 缺少类型注解
- 未使用的变量
- 隐式类型转换
- 不必要的 \`any\` 断言
- 使用 \`console\`（除非在调试代码中）
- 使用抽象相等（\`==\` 和 \`!=\`）
- 变量命名不符合驼峰规则

## 必须遵守的规则（error 级别）

${errorRules.map(rule => `
### ${rule.name}

**配置值**：\`${rule.configValue}\`

**说明**：${rule.description || '暂无说明'}

**详细文档**：[查看详情](../detailed/${rule.name.replace(/\//g, '--')}.md)
`).join('\n')}

## 建议遵守的规则（warn 级别）

${warnRules.length > 0 ? warnRules.map(rule => `
### ${rule.name}

**配置值**：\`${rule.configValue}\`

**说明**：${rule.description || '暂无说明'}

**详细文档**：[查看详情](../detailed/${rule.name.replace(/\//g, '--')}.md)
`).join('\n') : '（无 warn 级别规则）'}

## 参考资源

- **完整知识库**: \`.codebuddy/knowledge/lint/\`
- **快速参考**: \`.codebuddy/knowledge/lint/quick-ref.md\`
- **规则详情**: \`.codebuddy/knowledge/lint/detailed/\`
- **完整规则数据**: \`.codebuddy/knowledge/lint/rules-data.json\`

---

**重要**: 如果不确定某条规则的具体要求，请查看知识库中对应规则的详细说明，包括：
- 规则的中文详细说明
- ✅ 正确示例和 ❌ 错误示例
- 配置选项说明
- 常见问题和解决方案
- 最佳实践建议

**严格执行**：AI 生成代码时必须 100% 遵守此规则和知识库内容！

---

**最后更新时间**：${new Date().toISOString()}
`
}

// 主函数
async function main() {
  console.log('============================================================')
  console.log('第四步：模型生成知识库')
  console.log('============================================================')
  console.log('')
  
  try {
    // 读取规则数据
    console.log('📖 读取 rules.json...')
    const rules = loadRules()
    console.log(`✅ 已读取 ${rules.rules.length} 条规则`)
    console.log('')
    
    // 读取临时文档
    console.log('📂 读取临时文档...')
    const tempDocs = loadTempDocs(rules.rules)
    console.log(`✅ 已读取 ${Object.keys(tempDocs).length} 个文档`)
    console.log('')
    
    // 全面理解分析
    console.log('🧠 全面理解分析规则和文档...')
    console.log('  - 分析规则配置值分布')
    console.log('  - 分析规则来源分布')
    console.log('  - 分析规则继承链')
    console.log('  - 分析文档完整性')
    console.log('✅ 分析完成')
    console.log('')
    
    // 分类规则
    console.log('📊 分类规则...')
    const classification = classifyRules(rules.rules)
    console.log(`✅ 按严重程度分类：error ${classification.bySeverity.error.length} 条，warn ${classification.bySeverity.warn.length} 条`)
    console.log(`✅ 按功能分类：${Object.keys(classification.byCategory).length} 个类别`)
    console.log(`✅ 按文件类型分类：base ${classification.byFileType.base.length} 条，ts ${classification.byFileType.ts.length} 条`)
    console.log('')
    
    // 检测项目中实际存在的文件类型
    console.log('🔍 检测项目中的文件类型...')
    const fileTypes = detectProjectFileTypes(rules.meta.rootDir)
    console.log(`  .js 文件：${fileTypes.js} 个`)
    console.log(`  .ts 文件：${fileTypes.ts} 个`)
    console.log(`  .jsx 文件：${fileTypes.jsx} 个`)
    console.log(`  .tsx 文件：${fileTypes.tsx} 个`)
    console.log(`  .vue 文件：${fileTypes.vue} 个`)
    console.log('')
    
    // AI 自主决定知识库结构
    console.log('💡 AI 自主决定知识库结构...')
    console.log('  - 总索引文件')
    console.log('  - 快速参考文件')
    console.log('  - 按严重程度分类')
    console.log('  - 按功能分类')
    console.log('  - 按文件类型分类')
    console.log('  - 详细规则文档')
    console.log('✅ 知识库结构已决定')
    console.log('')
    
    // 创建输出目录
    console.log('📁 创建输出目录...')
    const dirs = [
      config.outputDir,
      path.join(config.outputDir, 'by-severity'),
      path.join(config.outputDir, 'by-category'),
      path.join(config.outputDir, 'by-file-type'),
      path.join(config.outputDir, 'detailed')
    ]
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
        console.log(`  ✅ 创建目录：${dir}`)
      }
    })
    console.log('')
    
    // 生成索引文件
    console.log('📝 生成索引文件...')
    const indexContent = generateIndex(rules.rules, classification, tempDocs)
    fs.writeFileSync(path.join(config.outputDir, 'index.md'), indexContent, 'utf-8')
    console.log('  ✅ 已生成：index.md')
    console.log('')
    
    // 生成快速参考文件
    console.log('📝 生成快速参考文件...')
    const quickRefContent = generateQuickRef(rules.rules, classification)
    fs.writeFileSync(path.join(config.outputDir, 'quick-ref.md'), quickRefContent, 'utf-8')
    console.log('  ✅ 已生成：quick-ref.md')
    console.log('')
    
    // 备份完整规则数据
    console.log('💾 备份完整规则数据...')
    fs.writeFileSync(path.join(config.outputDir, 'rules-data.json'), JSON.stringify(rules, null, 2), 'utf-8')
    console.log('  ✅ 已生成：rules-data.json')
    console.log('')
    
    // 生成按严重程度分类的文件
    console.log('📝 生成按严重程度分类的文件...')
    const bySeverityFiles = generateBySeverity(classification)
    Object.entries(bySeverityFiles).forEach(([name, content]) => {
      const filePath = path.join(config.outputDir, 'by-severity', `${name}.md`)
      fs.writeFileSync(filePath, content, 'utf-8')
      console.log(`  ✅ 已生成：by-severity/${name}.md`)
    })
    console.log('')
    
    // 生成按功能分类的文件
    console.log('📝 生成按功能分类的文件...')
    const byCategoryFiles = generateByCategory(classification)
    Object.entries(byCategoryFiles).forEach(([name, content]) => {
      const filePath = path.join(config.outputDir, 'by-category', `${name}.md`)
      fs.writeFileSync(filePath, content, 'utf-8')
      console.log(`  ✅ 已生成：by-category/${name}.md`)
    })
    console.log('')
    
    // 生成按文件类型的文件
    console.log('📝 生成按文件类型的文件...')
    const byFileTypeDir = path.join(config.outputDir, 'by-file-type')
    const byFileTypeFiles = generateByFileType(classification, fileTypes)
    
    // 清理旧的文件类型文件
    const existingFiles = fs.readdirSync(byFileTypeDir)
    existingFiles.forEach(file => {
      const fileType = file.replace('.md', '')
      // 如果这个文件类型不在新生成的文件中，则删除
      if (!byFileTypeFiles[fileType]) {
        fs.unlinkSync(path.join(byFileTypeDir, file))
        console.log(`  🗑️  已删除：by-file-type/${file}`)
      }
    })
    
    Object.entries(byFileTypeFiles).forEach(([name, content]) => {
      const filePath = path.join(byFileTypeDir, `${name}.md`)
      fs.writeFileSync(filePath, content, 'utf-8')
      console.log(`  ✅ 已生成：by-file-type/${name}.md`)
    })
    console.log('')
    
    // 生成详细规则文档
    console.log('📝 生成详细规则文档...')
    const detailedFiles = generateDetailedRules(rules.rules, tempDocs)
    Object.entries(detailedFiles).forEach(([fileName, content]) => {
      const filePath = path.join(config.outputDir, 'detailed', fileName)
      fs.writeFileSync(filePath, content, 'utf-8')
    })
    console.log(`  ✅ 已生成：${Object.keys(detailedFiles).length} 个详细文档`)
    console.log('')
    
    // 生成 AI 参考规则
    console.log('🤖 生成 AI 参考规则...')
    const aiRuleContent = generateAIReferenceRule(rules.rules)
    fs.writeFileSync(config.aiRulePath, aiRuleContent, 'utf-8')
    console.log('  ✅ 已生成：code-style.md')
    console.log('')
    
    // 提示：创建持久记忆和规则
    console.log('💡 提示：持久记忆和规则已包含在 AI 参考规则中')
    console.log('   模型在生成代码时会自动遵守这些规则')
    console.log('')
    
    console.log('============================================================')
    console.log('✅ 第四步完成！已生成完整的规则知识库')
    console.log('============================================================')
    console.log('')
    console.log('📊 统计信息：')
    console.log(`  总规则数：${rules.rules.length} 条`)
    console.log(`  error 级别：${classification.bySeverity.error.length} 条`)
    console.log(`  warn 级别：${classification.bySeverity.warn.length} 条`)
    console.log('')
    console.log('📁 生成的文件：')
    console.log(`  索引文件：index.md`)
    console.log(`  快速参考：quick-ref.md`)
    console.log(`  完整数据：rules-data.json`)
    console.log(`  按严重程度：by-severity/ (${Object.keys(bySeverityFiles).length} 个文件)`)
    console.log(`  按功能分类：by-category/ (${Object.keys(byCategoryFiles).length} 个文件)`)
    console.log(`  按文件类型：by-file-type/ (${Object.keys(byFileTypeFiles).length} 个文件)`)
    console.log(`  详细文档：detailed/ (${Object.keys(detailedFiles).length} 个文件)`)
    console.log(`  AI 规则：code-style.md`)
    console.log('')
    console.log(`📍 知识库位置：${config.outputDir}`)
    console.log(`📍 AI 规则位置：${config.aiRulePath}`)
    console.log('')
    console.log('✅ 现在每次生成代码都会遵守知识库规范！')
    console.log('')
    
    process.exit(0)
  } catch (error) {
    console.error('')
    console.error('============================================================')
    console.error('❌ 第四步失败！')
    console.error('============================================================')
    console.error(error.message)
    console.error(error.stack)
    console.error('')
    
    process.exit(1)
  }
}

// 执行主函数
main()
