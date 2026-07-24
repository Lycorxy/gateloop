---
name: frontend-codegen
description: >
    前端代码生成唯一入口。自动编排 specflow-rules-engine + code-quality-guard，
    并根据任务类型动态委派 css-style-writer（样式）或 frontend-backend-integration（联调）。
    任何涉及前端代码生成/修改的 Skill（specflow-dev, specflow-fix）都必须通过本 Skill。
    严格按规范执行，禁止跳过，行数超限必须拆分不偷懒，验证0错误才交付。
version: 8.0.0
dependencies:
    [specflow-rules-engine, code-quality-guard, css-style-writer, frontend-backend-integration]
allowed-tools:
    [read_file, write_file, replace_in_file, search_content, search_file, execute_command, list_dir]
max-token: 1500
---

# Frontend Codegen v8.0 — 前端代码生成（唯一入口·禁止跳过）

## 🛑 入口守卫（不可绕过·禁止跳过）

```
本 Skill 被 use_skill 加载后，必须按顺序执行 Step 0→1→2→3→4→5→6 全部 7 步。
每步必须播报完成消息。未播报 = 未执行 = 违规。

禁止行为（不允许跳过）：
  ✗ 跳过 Step 0 规则注入直接写代码
  ✗ 跳过 Step 1 环境检测
  ✗ 跳过 Step 2 code-quality-guard 规则加载
  ✗ 跳过 Step 3 任务类型判定
  ✗ 跳过 Step 5/6 验证（npx nut-lint fix + run）
  ✗ 用 read_lints 替代 npx nut-lint
  ✗ 行数超限不拆分（偷懒）
  ✗ 验证有错误就交付（必须修复到 0 错误）

唯一入口是 npx nut-lint 命令族 + use_skill 委派。
```

**核心定位：像一个严格的前端技术组长——先确认规范，再判定路径委派专家，最后验收 0 错误交付。**

> 🧠 前端架构设计由独立的 `frontend-design` Skill 上游完成，不在本 Skill 流程内。

核心目标排序：**路径正确 > 规则合规 > 代码质量 > 验证通过(0错误)**

---

## 何时使用 / 何时不使用

**应该触发：** 任何前端代码生成/修改、新建组件、修改组件、写页面、写样式、联调接口、其他 Skill 需要生成前端代码

**不应触发：** 纯后端/数据库设计、非 Web 前端、前端架构设计(→frontend-design)

---

## 代码生成流程总览

```
🔒 Step 0: 规则注入（强制·不可跳过）— specflow-rules-engine
Step 1: 项目环境检测（强制）— JSX/TS/别名/UI库/样式方案
Step 2: Lint 规则加载（强制）— use_skill("code-quality-guard")
Step 3: 任务类型判定 & 委派（强制）— A纯样式/B联调/C组件/D纯逻辑/E联调+样式
Step 4: 编码规范（路径C/D/E逻辑部分）— 三文件模式·行数强制
Step 5: 格式化+验证（强制）— npx nut-lint fix → run
Step 6: 全量验证（强制·0错误才交付）— npx nut-lint run + tsc --noEmit
```

> 🔒 每步按序执行，禁止跳过。不通过不继续。

---

## 中断与恢复

若中断后恢复：
1. 扫描已有输出，确认完成的 Step
2. 播报恢复点：`⏯️ [恢复] 已完成：Step0✅ Step1✅... | 断点：Step{N}`
3. 从断点继续，不重复不遗漏

---

## 🔒 Step 0 — 规则注入（强制 · 不可跳过）

```
【🔒 不可变约束】
  Step 0 必须在任何代码生成之前完成。
  未执行规则注入就写代码 = 严重违规，立即停止回退。
```

RULE.mdc `alwaysApply: true`，走 specflow-rules-engine 同步到 System Prompt：

```typescript
use_skill('specflow-rules-engine') // 同步 RULE.mdc → .codebuddy/rules/ + 检测注入 + read_file 兜底
```

> **播报：** `✅ [Step 0] 规则注入完成（specflow-rules-engine / alwaysApply: true）`

---

## Step 1 — 项目环境检测（强制 · 不可跳过）

```
未进行环境检测就写代码 = 代码风格/API 可能不匹配项目 = 违规。
```

### 1.1 并行读取项目配置

```typescript
read_file('package.json')    // JSX Runtime, React版本, UI库, 样式方案, lint工具
read_file('tsconfig.json')   // strict, paths, jsxImportSource, module
read_file('.eslintrc.cjs')   // ESLint 规则集
read_file('.prettierrc')     // 格式化规则
read_file('.stylelintrc.cjs')// 样式 lint 规则（样式任务必需）
```

### 1.2 环境检测清单

```
□ JSX 运行时：react-jsx(automatic无需import React) / react(classic必须import)
□ TS 严格模式：true(禁止any) / false
□ 路径别名：@/* → src/* / 无→相对路径
□ 模块系统：type:module+ESNext(ESM) / CommonJS
□ UI 库：antd / @mui / 无
□ 样式方案：CSS Module(→css-style-writer) / tailwind(直接className) / CSS-in-JS
□ 联调状态：用户提到联调/接口/mock替换(→联调) / 纯前端
```

> **播报：** `✅ Step 1 环境检测完成：{JSX}/{TS}/{别名}/{UI库}/{样式方案}`

---

## Step 2 — Lint 规则加载（强制 · 不可跳过）

```typescript
use_skill('code-quality-guard')
// 负责：规则知识库就绪检测 + 规则注入 + 代码格式化 + Lint 验证 + TS 类型检查
```

> **播报：** `✅ Step 2 Lint 规则加载完成` — 未加载规则 = 代码可能不合规。

---

## Step 3 — 任务类型判定 & 委派（强制 · 不可跳过）

```
禁止跳过判定直接写代码。禁止同时走两条路径导致冲突。
```

### 3.1 任务类型矩阵

| # | 任务类型 | 判定条件 | 委派目标 |
|---|---------|---------|---------|
| A | 纯样式 | 创建/修改 .scss/.css/.module.scss | → css-style-writer |
| B | 前后端联调 | mock 替换、接口对接 | → frontend-backend-integration |
| C | 组件代码(含样式) | 新建组件(TSX+TS+SCSS) | → 当前Skill(逻辑) + css-style-writer(样式) |
| D | 纯逻辑/组件 | 只写 TSX/TS/Hook，无样式变更 | → 当前 Skill |
| E | 联调+样式 | 联调含UI调整 | → 先 B 再 A |

### 3.2 委派执行验证（强制 · 不允许口头委派）

判定后必须输出判定表 + 确认 use_skill() 已调用：

```
📋 任务类型判定：路径 {A/B/C/D/E}
  委派目标：{Skill 名称 或 "当前Skill"}
  委派范围：{委派给子Skill做什么，当前Skill保留做什么}
```

委派验证清单：
```
□ use_skill() 已调用（不是口头说委派，而是真的调用了）
□ use_skill() 返回成功
□ 当前Skill不再自行处理被委派领域的代码
```

违规示例：
- ❌ 判定路径A(纯样式→css-style-writer)，但自己写了 SCSS 没调 use_skill
- ❌ 判定路径C(组件含样式)，写了 TSX 后自己写 SCSS 没委派

> **播报：** `✅ Step 3 任务执行完成：路径{X} / 委派{目标}`

---

## Step 4 — 编码规范（路径 C/D/E 逻辑部分）

### 4.1 三文件模式（行数强制·超限必须拆分·不偷懒）

```
index.tsx           ≤ 120 行（纯 JSX + 组件组合）
hook.ts             ≤ 150 行（状态管理 + 副作用）
index.module.scss   ≤ 200 行（★ 由 css-style-writer 负责）
```

❌ **超限必须拆分，不允许偷懒超限交付。** 超限不拆分 = 违规，回退拆分后再交付。

### 4.2 TypeScript 强约束

```
禁止 any，必须定义接口/类型
async 函数禁止直接传 onClick → () => { void fn(); }
简单类型 T[]，复杂类型 Array<T>
try/catch 的 err 必须 instanceof Error 类型守卫
void message.error(...) 消除 floating promise
禁用空 catch 块 | fail-fast 原则
```

### 4.3 Import 顺序

```
1. 第三方库（字母序）→ 2. @/别名 → 3. ./相对 → 4. .scss 最后
```

---

## Step 5 — 格式化 + 验证（强制 · 不可跳过）

```typescript
use_skill('code-quality-guard') // npx nut-lint fix --write → npx nut-lint run
```

```
□ npx nut-lint fix --write 已运行（只跑一次，修格式+可自动修的）
□ npx nut-lint run: 0 错误
有错误 → 逐条分析错误类型 → 手动修复（replace_in_file）→ 再验证
⚠️ 禁止盲目循环跑 fix（fix 修不了 TS类型/复杂度等不可自动修的错误）
```

> **播报：** `✅ Step 5 格式化验证完成（0错误）` — 有错误必须修复后再继续。

---

## Step 6 — 全量验证（强制 · 0 错误才交付）

```typescript
use_skill('code-quality-guard') // npx nut-lint run + tsc --noEmit → 0 错误
```

```
□ npx nut-lint run: 0 错误（Prettier + ESLint + Stylelint）
□ tsc --noEmit: 0 类型错误
□ 文件行数 ≤ 360（超限已拆分）
□ 圈复杂度 ≤ 10
```

❌ **0 错误才能交付。** 有错误必须自动修复到 0，不允许留给用户手动修。

> **播报：** `✅ Step 6 全量验证通过（0错误）` — 未验证就交付 = 违规。

---

## 错误处理

| 场景 | 处理 |
|------|------|
| 任务类型无法判定 | 询问用户："这次改动主要涉及？A.样式 B.联调 C.都有 D.纯逻辑" |
| 委派的 Skill 报错 | 错误原样上报用户，附修复方向 |
| 文件超 360 行 | 必须拆分到合规，不偷懒超限交付 |
| 验证有错误 | 自动修复到 0 错误，不让用户手动 |

---

## 参考资料

| 文件 | 内容 | 加载时机 |
|------|------|---------|
| `RULE.mdc` | 前端代码生成铁律（环境检测/规模/类型/import/样式/安全/响应式/反模式）| Step 0 自动注入 |
