---
name: lint-knowledge
version: 3.0.0
description: |
    ESLint 代码规范知识库自动生成技能（严格 6 步流程）。
    严格按 6 步执行：1) 递归收集所有层级规则 2) 生成 rules.json 3) 脚本获取文档 4) 模型生成知识库 5) 支持增量更新 6) 持久记忆确保遵守。
---

# ESLint 知识库生成技能（严格 6 步流程）

## ⚠️ 核心原则

**此技能必须严格执行以下 6 个步骤，不得跳过任何步骤：**

1. ✅ **递归收集所有层级规则**：当前项目、extends 继承、插件、共享配置，不管多少层级
2. ✅ **只收集未关闭规则**：只收集配置值不是 `"off"` 的规则
3. ✅ **脚本自动获取文档**：脚本遍历规则 json，为每个规则获取文档并保存到临时目录
4. ✅ **模型生成知识库**：根据规则和文档信息，模型全面理解分析后生成知识库
5. ✅ **支持增量更新**：配置变更时，保留未变化规则，只更新变化、新增、删除的规则
6. ✅ **持久记忆遵守规则**：模型创建持久记忆和规则，确保每次生成文件都按知识库执行

---

## 📋 执行步骤（必须按顺序执行）

### 🎯 第一步：递归收集所有层级规则

**目的**：收集项目中所有未关闭的 ESLint 规则，包括当前项目配置、extends 继承的所有配置、插件规则、共享配置，不管有多少层级都必须全部找出来。

#### 执行规则

**必须执行的命令**：

```bash
node .codebuddy/skills/lint-knowledge/scripts/step1-collect.cjs
```

#### 严格要求

**脚本必须实现**：

1. **解析当前项目配置**：支持 `.eslintrc.*`、`eslint.config.*`、`package.json`

2. **递归追踪 extends**（无限深度）：

    ```
    项目配置 (.eslintrc.cjs)
      ↓ extends: ['eslint:recommended']
    eslint:recommended
      ↓ 加载内置推荐规则
    [规则 A, 规则 B, 规则 C]
      ↓
    ↓ extends: ['plugin:@typescript-eslint/recommended']
    plugin:@typescript-eslint/recommended
      ↓ 加载 @typescript-eslint/eslint-plugin
      ↓ 读取插件的 recommended 配置
    [规则 D, 规则 E, 规则 F]
      ↓
    ↓ extends: ['plugin:prettier/recommended']
    plugin:prettier/recommended
      ↓ 加载 eslint-config-prettier
      ↓ 加载 eslint-plugin-prettier
    [规则 G, 规则 H]
    ```

3. **加载所有插件规则**：
    - 从 `node_modules` 加载所有插件
    - 读取每个插件的 `rules` 配置
    - 读取插件的 `recommended` 配置

4. **筛选未关闭规则**：

    ```javascript
    // 只保留 configValue 不是 "off" 的规则
    const enabledRules = allRules.filter((rule) => rule.configValue !== 'off')
    ```

5. **追踪规则来源**：
    ```javascript
    {
      "name": "semi",
      "configValue": "error",
      "source": "extends",           // 来源：extends / plugins / local
      "extendsChain": [              // 继承链（记录完整层级）
        {
          "name": "eslint:recommended",
          "depth": 1,
          "configValue": "error"
        }
      ],
      "plugin": null,                 // 如果来自插件
      "depth": 1,                     // 继承深度
      "isOverridden": false,          // 是否被覆盖
      "originalValue": "error"        // 原始值（如果被覆盖）
    }
    ```

#### 输出要求

**必须生成**：`.codebuddy/knowledge/lint/rules.json`

```json
{
    "meta": {
        "rootDir": "/path/to/project",
        "configPath": "/path/to/.eslintrc.cjs",
        "collectedAt": "2025-01-21T10:00:00.000Z",
        "eslintVersion": "8.57.0"
    },
    "extendsChain": [
        {
            "name": "eslint:recommended",
            "type": "builtin",
            "depth": 1,
            "rulesCount": 73,
            "rules": [
                {
                    "name": "no-undef",
                    "configValue": "error",
                    "description": "Disallow the use of undeclared variables",
                    "url": "https://eslint.org/docs/latest/rules/no-undef"
                }
            ]
        },
        {
            "name": "plugin:@typescript-eslint/recommended",
            "type": "plugin",
            "plugin": "@typescript-eslint",
            "depth": 1,
            "rulesCount": 19,
            "rules": [
                {
                    "name": "@typescript-eslint/no-explicit-any",
                    "configValue": "warn",
                    "description": "Disallow the `any` type",
                    "url": "https://typescript-eslint.io/rules/no-explicit-any"
                }
            ]
        }
    ],
    "plugins": [
        {
            "name": "@typescript-eslint",
            "packageName": "@typescript-eslint/eslint-plugin",
            "version": "7.0.0",
            "rulesCount": 200,
            "recommendedRules": 19
        },
        {
            "name": "prettier",
            "packageName": "eslint-plugin-prettier",
            "version": "5.0.0",
            "rulesCount": 1
        }
    ],
    "rules": [
        {
            "name": "semi",
            "configValue": "error",
            "source": "extends",
            "extendsChain": [
                {
                    "name": "eslint:recommended",
                    "depth": 1,
                    "configValue": "error"
                }
            ],
            "plugin": null,
            "depth": 1,
            "isOverridden": false,
            "description": "Require or disallow semicolons at the end of statements",
            "url": "https://eslint.org/docs/latest/rules/semi",
            "category": "Possible Errors"
        },
        {
            "name": "@typescript-eslint/no-explicit-any",
            "configValue": "warn",
            "source": "extends",
            "extendsChain": [
                {
                    "name": "plugin:@typescript-eslint/recommended",
                    "depth": 1,
                    "configValue": "warn"
                }
            ],
            "plugin": "@typescript-eslint",
            "depth": 1,
            "isOverridden": false,
            "description": "Disallow the `any` type",
            "url": "https://typescript-eslint.io/rules/no-explicit-any",
            "category": "TypeScript"
        }
    ],
    "stats": {
        "totalRules": 92,
        "errorLevel": 62,
        "warnLevel": 0,
        "offLevel": 0,
        "coreRules": 73,
        "pluginRules": 19,
        "extendsLevels": 3,
        "pluginsLoaded": 2
    }
}
```

#### 严格验证标准

**执行后必须验证**：

```javascript
// 验证脚本
const rules = require('./.codebuddy/knowledge/lint/rules.json')

// ✅ 必须满足：
// 1. 所有规则的 configValue 不能是 "off"
const hasOffRules = rules.rules.some((r) => r.configValue === 'off')
if (hasOffRules) {
    throw new Error('❌ 严重错误：收集到已关闭的规则！')
}

// 2. 必须包含 extendsChain 信息
if (!rules.extendsChain || rules.extendsChain.length === 0) {
    throw new Error('❌ 严重错误：缺少继承链信息！')
}

// 3. 必须包含 plugins 信息
if (!rules.plugins || rules.plugins.length === 0) {
    throw new Error('❌ 严重错误：缺少插件信息！')
}

// 4. 每个规则必须包含完整的追踪信息
rules.rules.forEach((rule) => {
    if (!rule.source || !rule.depth) {
        throw new Error(`❌ 严重错误：规则 ${rule.name} 缺少追踪信息！`)
    }
    if (!rule.extendsChain || rule.extendsChain.length === 0) {
        throw new Error(`❌ 严重错误：规则 ${rule.name} 缺少继承链信息！`)
    }
})

console.log('✅ 第一步验证通过：已收集所有层级的未关闭规则')
```

---

### 🎯 第二步：生成 rules.json

**目的**：将第一步收集到的规则数据保存到知识库目录的 `rules.json` 文件中，作为后续步骤的基础数据。

#### 执行规则

**第一步自动生成**：`.codebuddy/knowledge/lint/rules.json`

**无需额外命令**，第一步脚本自动生成。

#### 输出要求

生成的 `rules.json` 必须包含：

- ✅ 完整的规则列表（92 条）
- ✅ 每个规则的配置值（不是 "off"）
- ✅ 继承链信息（extendsChain）
- ✅ 插件信息（plugins）
- ✅ 统计信息（stats）
- ✅ 元数据（meta）

#### 严格验证标准

```javascript
const fs = require('fs')
const path = require('path')

const rulesPath = path.join(process.cwd(), '.codebuddy/knowledge/lint/rules.json')

// ✅ 文件必须存在
if (!fs.existsSync(rulesPath)) {
    throw new Error('❌ 严重错误：rules.json 不存在！')
}

// ✅ 文件必须是有效的 JSON
let rules
try {
    rules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'))
} catch (error) {
    throw new Error('❌ 严重错误：rules.json 不是有效的 JSON！')
}

// ✅ 必须包含必要的字段
const requiredFields = ['meta', 'extendsChain', 'plugins', 'rules', 'stats']
requiredFields.forEach((field) => {
    if (!rules[field]) {
        throw new Error(`❌ 严重错误：rules.json 缺少字段 ${field}！`)
    }
})

console.log('✅ 第二步验证通过：rules.json 生成成功')
```

---

### 🎯 第三步：脚本自动获取文档

**目的**：脚本遍历 `rules.json`，为每个规则自动获取官方文档，并将文档保存到临时目录，每个规则对应一个文件。**此时模型不参与**，完全由脚本执行。

#### 执行规则

**必须执行的命令**：

```bash
node .codebuddy/skills/lint-knowledge/scripts/step3-fetch-docs.cjs
```

#### 严格要求

**脚本必须实现**（模型不参与）：

1. **读取 rules.json**：

    ```javascript
    const rules = JSON.parse(fs.readFileSync('.codebuddy/knowledge/lint/rules.json', 'utf-8'))
    ```

2. **创建临时文档目录**：

    ```javascript
    const tempDocsDir = '.codebuddy/skills/lint-knowledge/temp-docs'
    fs.mkdirSync(tempDocsDir, { recursive: true })
    ```

3. **遍历每个规则**：

    ```javascript
    for (const rule of rules.rules) {
        // 获取规则文档 URL
        const url = rule.url

        // 获取文档内容
        const docContent = await fetchDocumentation(url)

        // 保存到临时目录
        const fileName = `${rule.name.replace(/\//g, '--')}.md`
        const filePath = path.join(tempDocsDir, fileName)
        fs.writeFileSync(filePath, docContent, 'utf-8')

        console.log(`✅ 已获取文档：${rule.name}`)
    }
    ```

4. **获取文档的方法**（脚本自主决定）：
    - 方法 1：使用 `web_fetch` 获取官方文档
    - 方法 2：从插件的 `package.json` 读取文档链接
    - 方法 3：使用本地缓存的文档
    - 方法 4：组合使用多种方法

5. **提取文档内容**（脚本自主决定）：
    - 规则详细说明
    - 代码示例（正确和错误）
    - 配置选项
    - 常见问题
    - 最佳实践

6. **保存到临时目录**：
    ```
    .codebuddy/skills/lint-knowledge/temp-docs/
    ├── semi.md
    ├── no-undef.md
    ├── typescript-eslint--no-explicit-any.md
    ├── prettier--prettier.md
    └── ... (共 92 个文件)
    ```

#### 输出要求

**必须生成**：`.codebuddy/skills/lint-knowledge/temp-docs/[rule-name].md`

每个文档文件必须包含：

````markdown
# 规则名称：semi

## 官方 URL

https://eslint.org/docs/latest/rules/semi

## 详细说明

Require or disallow semicolons at the end of statements...

## 代码示例

### ✅ 正确示例

```javascript
var name = 'ESLint'
object.method = function () {}
```
````

### ❌ 错误示例

```javascript
var name = 'ESLint'
object.method = function () {}
```

## 配置选项

### "always"（默认）

Always require semicolons...

### "never"

Never require semicolons...

## 常见问题

**Q: 什么时候应该使用分号？**
A: ...

**Q: 不使用分号会有什么问题？**
A: ...

## 最佳实践

1. ...
2. ...
3. ...

````

#### 严格验证标准

```javascript
const fs = require('fs')
const path = require('path')

const rules = JSON.parse(fs.readFileSync('.codebuddy/knowledge/lint/rules.json', 'utf-8'))
const tempDocsDir = '.codebuddy/skills/lint-knowledge/temp-docs'

// ✅ 临时文档目录必须存在
if (!fs.existsSync(tempDocsDir)) {
  throw new Error('❌ 严重错误：临时文档目录不存在！')
}

// ✅ 每个规则必须有对应的文档文件
const docFiles = fs.readdirSync(tempDocsDir)
const missingDocs = rules.rules.filter(rule => {
  const fileName = `${rule.name.replace(/\//g, '--')}.md`
  return !docFiles.includes(fileName)
})

if (missingDocs.length > 0) {
  throw new Error(`❌ 严重错误：${missingDocs.length} 条规则缺少文档！`)
}

// ✅ 每个文档文件必须包含必要的内容
docFiles.forEach(fileName => {
  const filePath = path.join(tempDocsDir, fileName)
  const content = fs.readFileSync(filePath, 'utf-8')

  const requiredSections = ['详细说明', '代码示例', '配置选项', '常见问题', '最佳实践']
  requiredSections.forEach(section => {
    if (!content.includes(section)) {
      throw new Error(`❌ 严重错误：${fileName} 缺少 ${section} 章节！`)
    }
  })
})

console.log('✅ 第三步验证通过：所有规则文档已获取')
````

---

### 🎯 第四步：模型生成知识库

**目的**：根据 `rules.json` 和临时目录中的规则文档信息，模型进行全面理解分析后，生成完整的规则知识库。

#### 执行规则

**必须执行的命令**：

```bash
node .codebuddy/skills/lint-knowledge/scripts/step4-generate-kb.cjs
```

#### 严格要求

**模型必须执行**：

1. **读取数据**：

    ```javascript
    const rules = JSON.parse(fs.readFileSync('.codebuddy/knowledge/lint/rules.json', 'utf-8'))
    const tempDocsDir = '.codebuddy/skills/lint-knowledge/temp-docs'
    ```

2. **全面理解分析**：
    - 分析每条规则的详细说明
    - 理解每条规则的代码示例
    - 理解每条规则的配置选项
    - 理解每条规则的常见问题
    - 理解每条规则的最佳实践
    - 分析规则之间的关系
    - 分析规则的优先级
    - 分析规则的应用场景

3. **AI 自主决定知识库结构**：
    - 如何分类规则（按文件类型？按重要性？按功能？）
    - 如何组织内容
    - 如何提高查询效率
    - 如何突出重要信息

4. **生成知识库文件**：
    - 索引文件（index.md）
    - 快速参考（quick-ref.md）
    - 按分类的规则文档
    - 详细规则文档
    - Prettier 配置文档

#### 输出要求

**必须生成**：

```
.codebuddy/knowledge/lint/
├── index.md                    # 总索引
├── quick-ref.md               # 快速参考
├── rules-data.json            # 完整规则数据（备份）
├── by-severity/               # 按严重程度
│   ├── error.md
│   └── warn.md
├── by-category/               # 按功能分类
│   ├── types.md
│   ├── naming.md
│   ├── style.md
│   └── best-practices.md
├── by-file-type/              # 按文件类型
│   ├── base.md
│   ├── js.md
│   ├── jsx.md
│   ├── ts.md
│   ├── tsx.md
│   └── vue.md
└── detailed/                  # 详细规则文档
    ├── semi.md
    ├── no-undef.md
    ├── typescript-eslint--no-explicit-any.md
    └── ... (共 92 个)
```

#### 知识库内容要求

**每个规则文档必须包含**：

- ✅ 规则名称
- ✅ 规则配置值（error/warn）
- ✅ 中文详细说明
- ✅ 代码示例（✅ 正确 和 ❌ 错误）
- ✅ 配置选项（详细说明）
- ✅ 常见问题（Q&A）
- ✅ 最佳实践
- ✅ 文档链接

#### 严格验证标准

```javascript
const fs = require('fs')
const path = require('path')

const rules = JSON.parse(fs.readFileSync('.codebuddy/knowledge/lint/rules.json', 'utf-8'))
const kbDir = '.codebuddy/knowledge/lint'

// ✅ 知识库目录必须存在
if (!fs.existsSync(kbDir)) {
    throw new Error('❌ 严重错误：知识库目录不存在！')
}

// ✅ 必须包含必要的文件
const requiredFiles = ['index.md', 'quick-ref.md', 'rules-data.json']
requiredFiles.forEach((file) => {
    const filePath = path.join(kbDir, file)
    if (!fs.existsSync(filePath)) {
        throw new Error(`❌ 严重错误：${file} 不存在！`)
    }
})

// ✅ 每个规则必须有详细文档
const detailedDir = path.join(kbDir, 'detailed')
if (!fs.existsSync(detailedDir)) {
    throw new Error('❌ 严重错误：详细文档目录不存在！')
}

const detailedFiles = fs.readdirSync(detailedDir)
if (detailedFiles.length !== rules.rules.length) {
    throw new Error(
        `❌ 严重错误：详细文档数量不匹配！需要 ${rules.rules.length} 个，实际 ${detailedFiles.length} 个`
    )
}

// ✅ 每个详细文档必须包含必要内容
detailedFiles.forEach((fileName) => {
    const filePath = path.join(detailedDir, fileName)
    const content = fs.readFileSync(filePath, 'utf-8')

    const requiredSections = ['中文说明', '代码示例', '配置选项', '常见问题', '最佳实践']
    requiredSections.forEach((section) => {
        if (!content.includes(section)) {
            throw new Error(`❌ 严重错误：${fileName} 缺少 ${section} 章节！`)
        }
    })
})

console.log('✅ 第四步验证通过：知识库生成成功')
```

---

### 🎯 第五步：支持增量更新

**目的**：一旦用户对 ESLint 配置变更，重新生成知识库时，先查询本地 `rules.json` 存在的规则，配置没有变化的可以继续保留，对于变化了配置或删改或新增的规则则继续补充 `rules.json`，并继续按以上逻辑生成完善知识库。

#### 执行规则

**第一步脚本自动检测**：

- 如果 `.codebuddy/knowledge/lint/rules.json` 已存在
- 对比新旧配置
- 识别变化的规则

#### 严格要求

**第一步脚本必须实现**：

1. **检测是否需要增量更新**：

    ```javascript
    const oldRulesPath = '.codebuddy/knowledge/lint/rules.json'
    const needsUpdate = checkIfConfigChanged(oldRulesPath)
    ```

2. **识别变化的规则**：

    ```javascript
    const changes = {
        added: [], // 新增的规则
        removed: [], // 删除的规则
        modified: [], // 配置值变化的规则
        unchanged: [] // 未变化的规则
    }

    // 对比新旧规则
    oldRules.forEach((oldRule) => {
        const newRule = newRules.find((r) => r.name === oldRule.name)

        if (!newRule) {
            // 规则被删除
            changes.removed.push(oldRule)
        } else if (newRule.configValue !== oldRule.configValue) {
            // 规则配置值变化
            changes.modified.push({
                name: oldRule.name,
                oldValue: oldRule.configValue,
                newValue: newRule.configValue
            })
        } else {
            // 规则未变化
            changes.unchanged.push(oldRule)
        }
    })

    // 找出新增的规则
    newRules.forEach((newRule) => {
        const oldRule = oldRules.find((r) => r.name === newRule.name)
        if (!oldRule) {
            changes.added.push(newRule)
        }
    })
    ```

3. **增量更新文档**：

    ```javascript
    // 只获取新增和修改的规则的文档
    const rulesToFetch = [...changes.added, ...changes.modified.map((m) => m.name)]

    for (const ruleName of rulesToFetch) {
        const rule = newRules.find((r) => r.name === ruleName)
        await fetchDocumentation(rule.url)
    }
    ```

4. **生成变化报告**：
    ```javascript
    console.log('=== 配置变化报告 ===')
    console.log(`新增规则：${changes.added.length} 条`)
    console.log(`删除规则：${changes.removed.length} 条`)
    console.log(`修改规则：${changes.modified.length} 条`)
    console.log(`未变化：${changes.unchanged.length} 条`)
    ```

#### 输出要求

**必须生成**：

- ✅ 更新后的 `rules.json`
- ✅ 新增和修改规则的文档
- ✅ 配置变化报告
- ✅ 更新后的知识库

#### 严格验证标准

```javascript
const oldRules = require('./.codebuddy/knowledge/lint/rules-old.json')
const newRules = require('./.codebuddy/knowledge/lint/rules.json')

// ✅ 验证增量更新逻辑
console.log('=== 增量更新验证 ===')

// 未变化的规则应该保留原值
oldRules.rules
    .filter((r) => {
        const newRule = newRules.rules.find((n) => n.name === r.name)
        return newRule && newRule.configValue === r.configValue
    })
    .forEach((rule) => {
        console.log(`✅ 未变化：${rule.name}`)
    })

// 验证新增规则
const addedRules = newRules.rules.filter((n) => !oldRules.rules.find((o) => o.name === n.name))
console.log(`✅ 新增规则：${addedRules.length} 条`)

// 验证删除规则
const removedRules = oldRules.rules.filter((o) => !newRules.rules.find((n) => n.name === o.name))
console.log(`✅ 删除规则：${removedRules.length} 条`)

// 验证修改规则
const modifiedRules = oldRules.rules.filter((o) => {
    const newRule = newRules.rules.find((n) => n.name === o.name)
    return newRule && newRule.configValue !== o.configValue
})
console.log(`✅ 修改规则：${modifiedRules.length} 条`)

console.log('✅ 第五步验证通过：增量更新逻辑正确')
```

---

### 🎯 第六步：持久记忆遵守规则

**目的**：模型创建持久的记忆和规则（模型自己定义），确保每次用户生成文件时，都能按照这个知识库规则要求生成代码或者内容。

#### 执行规则

**第四步脚本自动创建持久记忆和规则**：

```javascript
// 创建持久记忆
await update_memory({
    action: 'create',
    title: 'ESLint 规则知识库',
    knowledge_to_store: `项目 ESLint 配置：已启用 ${rules.rules.length} 条规则。知识库位置：.codebuddy/knowledge/lint/。每次生成代码前必须查询知识库，严格遵守规则。`
})

// 创建强制规则
await create_rule({
    ruleName: 'code-style-strict',
    ruleType: 'always',
    ruleScope: 'project',
    ruleDescription: '强制遵守项目 ESLint 规范',
    ruleContent: generateAIReferenceRule()
})
```

#### 严格要求

**模型必须执行**：

1. **创建持久记忆**：
    - 记录知识库位置
    - 记录规则数量
    - 记录最后更新时间
    - 记录遵守要求

2. **创建强制规则**：
    - 强制查询知识库
    - 强制遵守规则
    - 强制检查清单
    - 强制验证代码

3. **规则内容**（模型自主决定）：
    - 检查清单
    - 禁止行为
    - 参考资源
    - 使用流程

#### 输出要求

**必须生成**：

- ✅ 持久记忆（通过 `update_memory` 创建）
- ✅ 强制规则（`.codebuddy/rules/code-style.md`）
- ✅ 检查清单
- ✅ 禁止行为列表
- ✅ 使用流程说明

#### 严格验证标准

```javascript
// ✅ 验证持久记忆是否创建
//（需要通过系统工具验证）

// ✅ 验证强制规则是否存在
const fs = require('fs')
const rulePath = '.codebuddy/rules/code-style.md'

if (!fs.existsSync(rulePath)) {
    throw new Error('❌ 严重错误：强制规则文件不存在！')
}

const ruleContent = fs.readFileSync(rulePath, 'utf-8')

// ✅ 必须包含必要内容
const requiredSections = ['强制', '检查清单', '禁止', '知识库']
requiredSections.forEach((section) => {
    if (!ruleContent.includes(section)) {
        throw new Error(`❌ 严重错误：强制规则缺少 ${section} 章节！`)
    }
})

console.log('✅ 第六步验证通过：持久记忆和规则已创建')
```

---

## ✅ 一键生成脚本

### Windows 版本

```bash
@echo off
chcp 65001 >nul

echo ============================================================
echo ESLint 知识库自动生成（严格 6 步流程）
echo ============================================================
echo.

echo ### 第一步：递归收集所有层级规则...
node .codebuddy\skills\lint-knowledge\scripts\step1-collect.cjs
if %errorlevel% neq 0 (
  echo ❌ 第一步失败！
  exit /b 1
)
echo.

echo ### 第二步：生成 rules.json...
echo (第一步自动生成)
echo.

echo ### 第三步：脚本自动获取文档...
node .codebuddy\skills\lint-knowledge\scripts\step3-fetch-docs.cjs
if %errorlevel% neq 0 (
  echo ❌ 第三步失败！
  exit /b 1
)
echo.

echo ### 第四步：模型生成知识库...
node .codebuddy\skills\lint-knowledge\scripts\step4-generate-kb.cjs
if %errorlevel% neq 0 (
  echo ❌ 第四步失败！
  exit /b 1
)
echo.

echo ### 第五步：支持增量更新...
echo (第一步自动检测)
echo.

echo ### 第六步：创建持久记忆和规则...
echo (第四步自动创建)
echo.

echo ============================================================
echo ✅ 知识库生成完成！
echo ============================================================
echo.
echo 知识库位置: .codebuddy\knowledge\lint\
echo AI 规则位置: .codebuddy\rules\code-style.md
echo.
echo 已收集 92 条规则
echo 已生成 92 个详细文档
echo 已创建持久记忆和规则
echo.
echo 现在每次生成代码都会遵守知识库规范！
echo.

pause
```

### Linux/Mac 版本

```bash
#!/bin/bash

echo "============================================================"
echo "ESLint 知识库自动生成（严格 6 步流程）"
echo "============================================================"
echo ""

echo "### 第一步：递归收集所有层级规则..."
node .codebuddy/skills/lint-knowledge/scripts/step1-collect.cjs
if [ $? -ne 0 ]; then
  echo "❌ 第一步失败！"
  exit 1
fi
echo ""

echo "### 第二步：生成 rules.json..."
echo "(第一步自动生成)"
echo ""

echo "### 第三步：脚本自动获取文档..."
node .codebuddy/skills/lint-knowledge/scripts/step3-fetch-docs.cjs
if [ $? -ne 0 ]; then
  echo "❌ 第三步失败！"
  exit 1
fi
echo ""

echo "### 第四步：模型生成知识库..."
node .codebuddy/skills/lint-knowledge/scripts/step4-generate-kb.cjs
if [ $? -ne 0 ]; then
  echo "❌ 第四步失败！"
  exit 1
fi
echo ""

echo "### 第五步：支持增量更新..."
echo "(第一步自动检测)"
echo ""

echo "### 第六步：创建持久记忆和规则..."
echo "(第四步自动创建)"
echo ""

echo "============================================================"
echo "✅ 知识库生成完成！"
echo "============================================================"
echo ""
echo "知识库位置: .codebuddy/knowledge/lint/"
echo "AI 规则位置: .codebuddy/rules/code-style.md"
echo ""
echo "已收集 92 条规则"
echo "已生成 92 个详细文档"
echo "已创建持久记忆和规则"
echo ""
echo "现在每次生成代码都会遵守知识库规范！"
echo ""
```

---

## 🔍 脚本实现清单

### step1-collect.cjs

必须实现：

- ✅ 解析 ESLint 配置文件（所有格式）
- ✅ 递归追踪 extends（无限深度，不管多少层级）
- ✅ 加载所有插件（从 node_modules）
- ✅ 筛选未关闭规则（configValue !== "off"）
- ✅ 追踪规则来源（source、depth、extendsChain）
- ✅ 支持增量更新（对比新旧配置）
- ✅ 生成完整的 rules.json
- ✅ 验证输出（确保只包含未关闭规则）

### step3-fetch-docs.cjs

必须实现：

- ✅ 读取 rules.json
- ✅ 遍历每个规则（模型不参与）
- ✅ 为每个规则获取官方文档（脚本自主决定方法）
- ✅ 提取文档内容（详细说明、代码示例、配置选项、常见问题、最佳实践）
- ✅ 保存到临时目录（每个规则一个文件）
- ✅ 验证输出（确保每个规则都有文档）

### step4-generate-kb.cjs

必须实现：

- ✅ 读取 rules.json
- ✅ 读取临时文档目录
- ✅ 模型全面理解分析所有规则和文档
- ✅ AI 自主决定知识库结构
- ✅ 生成索引文件
- ✅ 生成快速参考文件
- ✅ 生成详细规则文档
- ✅ 生成按分类的规则文档
- ✅ 创建持久记忆（update_memory）
- ✅ 创建强制规则（create_rule）
- ✅ 验证输出（确保知识库完整）

---

## 🚀 使用方法

### 快速生成（推荐）

```bash
# Windows
.codebuddy\skills\lint-knowledge\generate-all.bat

# Linux/Mac
bash .codebuddy/skills/lint-knowledge/generate-all.sh
```

### 分步执行

```bash
# 第一步：递归收集所有层级规则
node .codebuddy/skills/lint-knowledge/scripts/step1-collect.cjs

# 第二步：生成 rules.json
# (第一步自动生成)

# 第三步：脚本自动获取文档
node .codebuddy/skills/lint-knowledge/scripts/step3-fetch-docs.cjs

# 第四步：模型生成知识库
node .codebuddy/skills/lint-knowledge/scripts/step4-generate-kb.cjs

# 第五步：支持增量更新
# (第一步自动检测)

# 第六步：创建持久记忆和规则
# (第四步自动创建)
```

---

## 🎯 最终目标

生成的知识库必须确保：

- ✅ **100% 准确**：所有规则都来自项目实际配置
- ✅ **100% 完整**：每个规则都有详细说明、示例、配置
- ✅ **100% 中文**：所有内容都翻译成中文
- ✅ **100% 实用**：易于查询，易于参考
- ✅ **100% 强制**：AI 必须遵守，不得跳过
- ✅ **100% 持久**：持久记忆确保每次都遵守

**AI 生成代码时必须 100% 遵守知识库！**
