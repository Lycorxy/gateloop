# 规则注入策略

ESLint/Stylelint/TypeScript 规则的渐进式加载策略。目标：注入最少的规则以获得最大的合规性。

## 核心原则

> **永远不要批量加载所有规则文档。** 在需要时才加载所需内容。

## 加载层级

### 层级 0：始终加载（约 80 tokens）

每个会话都无条件读取这些文件：

1. `quick-ref.md` — 核心规则摘要表
2. `index.md` — 规则数量和索引链接

这让你了解规则全貌，而无需任何单条规则的详细信息。

### 层级 1：上下文感知加载（约 200-500 tokens）

当任务领域明确时加载：

| 任务领域            | 要加载的文件                                                    |
| ------------------- | --------------------------------------------------------------- |
| 编写 JS/TS 代码     | 仅 `quick-ref.md`（大多数情况下层级 0 已足够）                  |
| 修复引号/分号问题   | `references/eslint--quotes.md` + `references/eslint--semi.md`   |
| 修复格式化问题      | `references/eslint--indent.md` + `references/prettier-rules.md` |
| CSS/SCSS 工作       | `references/stylelint--*.md`（仅相关规则）                      |
| 调试未使用变量      | `references/eslint--no-unused-vars.md`                          |
| eslint-disable 注释 | `references/eslint--no-disable.md`                              |
| 圈复杂度问题        | `references/eslint--complexity.md`                              |
| 安全审计            | 所有安全相关的规则文档（`no-eval`、`no-script-url` 等）         |

### 层级 2：按需加载（特定问题）

当特定规则触发且你需要其详细信息时：

```bash
# 用户问："为什么 semi 规则在这里失败？"
→ 读取 references/eslint--semi.md 获取确切配置和示例
```

## 决策树：加载什么？

```
即将生成/审查代码？
├─ 是 TS/JS 吗？
│   ├─ 新代码生成 → 读取 quick-ref.md（层级 0）
│   │   └─ 如果使用不常见的模式 → 读取特定插件规则文档（层级 2）
│   │
│   └─ 修复现有代码 → 读取 quick-ref.md + 特定错误规则文档（层级 1+2）
│
├─ 是 CSS/SCSS 吗？
│   └─ 读取 quick-ref.md + 特定属性的 stylelint 规则（层级 1）
│
└─ 仅是类型错误吗？
    └─ 完全跳过规则文档 → 改用 ts-error-codes.md 参考
```

## 规则类别及重要性

### 格式化规则（Prettier 处理大部分）

- `semi`、`quotes`、`indent`、`max-len`
- **何时加载**：生成新代码、修复格式化问题
- **通常**：只需遵循 SKILL.md 阶段 2.3 中的强制规则表

### 代码质量规则（ESLint 核心）

- `no-undef`、`no-unused-vars`、`no-console`、`eqeqeq`、`curly`
- **何时加载**：任何代码审查、错误查找、清理
- **策略**：这些都很知名；很少需要查阅文档

### 安全规则

- `no-eval`、`no-script-url`、`no-dangerous-html`
- **何时加载**：安全审查、面向用户的输入处理
- **策略**：在安全敏感上下文中始终加载这些

### 插件规则（@typescript-eslint/\* 等）

- `@typescript-eslint/no-explicit-any`、`@typescript-eslint/explicit-function-return-type`
- **何时加载**：TS 特定的代码生成或修复
- **策略**：在规则触发时加载特定规则；模式在插件中是一致的

### Stylelint 规则

- `indentation`、`string-quotes`、`color-hex-case`、`declaration-block-no-duplicate-properties`
- **何时加载**：任何 CSS/SCSS 编辑
- **策略**：先加载 `quick-ref.md` 样式部分，然后加载特定规则

## 反模式

| 不良模式                       | 问题                                     | 正确方法                                           |
| ------------------------------ | ---------------------------------------- | -------------------------------------------------- |
| 预先加载所有 `references/*.md` | Token 浪费（100+ 规则 × 约 200 行 each） | 始终使用层级 0，按上下文使用层级 1，按需使用层级 2 |
| 完全跳过层级 0                 | 缺少规则全貌，可能违反核心规则           | 在任何代码操作前始终读取 quick-ref.md              |
| 为可自动修复的问题加载规则文档 | 不必要；只需运行 `nut-lint fix`          | 将文档查阅保留用于手动修复问题（逻辑、类型）       |
| 忽略规则严重级别               | 可能将精力集中在警告级别问题上           | 优先级：错误 > 警告 > 建议                         |
