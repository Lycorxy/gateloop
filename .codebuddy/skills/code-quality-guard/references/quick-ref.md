# 代码质量快速参考

> **每次 Step 1 必读**。核心规则摘要，详细说明按需读取 references/。

---

## ESLint 核心规则

| 规则 | 要求 | 错误示例 → 正确示例 |
|------|------|---------------------|
| 引号 | 单引号 | `"hello"` → `'hello'` |
| 分号 | 不使用 | `const x = 1;` → `const x = 1` |
| 缩进 | 2 空格 | `const x = 1` |
| 行宽 | ≤ 100 字符 | 超出需换行 |
| 圈复杂度 | ≤ 10 | 超出拆分函数 |
| eslint-disable | 禁止 | 删除注释，从根本上修复 |
| console | 禁止 | 调试除外 |
| as any | 避免 | 用正确类型 |
| 比较运算 | === / !== | `==` / `!=` 禁止 |
| 未使用变量 | 禁止 | 删除或加 `_` 前缀 |

## Prettier 核心规则

| 规则 | 值 |
|------|-----|
| printWidth | 100 |
| tabWidth | 2 |
| useTabs | false |
| semi | false |
| singleQuote | true |
| trailingComma | es5 |
| bracketSpacing | true |
| arrowParens | always |
| endOfLine | lf |

## Stylelint 核心规则

| 规则 | 要求 |
|------|------|
| 硬编码颜色 | 禁止 → var(--color-xxx) |
| 硬编码间距 | 禁止 → var(--space-xxx) |
| 嵌套选择器 | 禁止 → 扁平平铺 |
| !important | 禁止（覆盖第三方除外） |
| border: none | 禁止 → border: 0 |
| @import | 禁止 → @use |
| :has() / @container / @layer / subgrid | 禁止 |

## TypeScript 核心规则

| 规则 | 要求 |
|------|------|
| 显式返回类型 | 所有导出函数必须标注 |
| any | 禁止 |
| 简单数组 | T[]（string[]） |
| 复杂数组 | Array<T>（Array<Record<string, unknown>>） |
| err 守卫 | err instanceof Error ? err.message : String(err) |
| floating promise | void 前缀 |
| 空 catch | 禁止 |
| async→onClick | ✗ onClick={fn} ✓ onClick={() => { void fn(); }} |

---

## 命令行快速参考

```bash
# Prettier 格式化
npx nut-lint format <file>

# 格式化+lint 修复（Prettier → ESLint → Stylelint）
npx nut-lint fix <file> --write

# 验证（Prettier + ESLint + Stylelint + tsc）
npx nut-lint run <file>

# 仅检查不修复
npx nut-lint check <file>

# 仅 TS 类型检查
npx nut-lint run <file> --source typescript
```
