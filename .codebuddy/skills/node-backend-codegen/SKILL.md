---
name: node-backend-codegen
description: >
    后端 Node.js (TypeScript) 代码生成技能。
    先注入规则、检测项目环境、复用 helpers 公共函数，
    再按 node: 按需导入 + createRequire + Rollup 打包规范生成代码，
    最后 tsc + ESLint 双重验证后交付。
    当用户说 生成 Node 代码、写后端模块、写 CLI 工具、
    新增 helper、写 TS 后端代码、Node 脚本 时使用。
    不要用于 前端代码生成（→ frontend-codegen）、
    Go 后端（→ backend-trpc-codegen）、
    数据库设计（→ mysql-schema-design）、纯架构讨论。
version: 1.2.0
dependencies: [specflow-rules-engine, code-quality-guard]
conflict-with: [frontend-codegen, backend-trpc-codegen]
allowed-tools: [read_file, write_file, search_content, execute_command, use_skill]
max-token: 2000
---

# Node.js 后端代码生成 v1.2

## 🛑 入口守卫

```
本 Skill 被 use_skill 加载后，必须按顺序执行 Step 0→1→2→3→4→5→6 全部步骤。
每步必须播报对应完成消息。未播报的步骤 = 未执行 = 违规。

禁止行为：
  ✗ 跳过 Step 0 直接写代码
  ✗ 不播报完成消息（无日志 = 没走流程）
  ✗ 无声跳过任何步骤

【强制 · 步骤严格执行】
  如需跳过未执行的步骤，必须逐条给出充足理由：
  ① 该步骤为什么可跳过  ② 跳过不影响最终交付质量
  禁止用一条理由批量跳过多个步骤。
```

**核心定位：像一个资深 Node.js 工程师那样，生成符合项目规范的 TypeScript 后端代码。**

> 🧠 **设计哲学**：先检测项目配置 → 加载规则约束 → 查找公共函数 → 按规范生成代码 → 验证通过后交付。
> 每一步都有约束和验证，不通过不继续。

核心目标排序：**项目规范 > 零遗漏 > 公共函数复用 > ESLint 合规 > 最小改动**

> 🚫 **禁止生成测试文件**：本 Skill 只生成业务代码，不生成测试脚本（`*.test.ts` / `*.spec.ts` / `__tests__/` 等）。
> 这与其他 Skill（如 backend-trpc-codegen）不同 — 测试生成会显著拖慢交付速度且当前项目不需要。

---

## 何时使用 / 何时不使用

**应该触发：**

- "生成 Node 代码"、"写后端模块"、"写 CLI 工具"
- "新增 helper"、"写 TS 后端代码"、"Node 脚本"
- "写一个命令行工具"、"添加 exec 封装"
- 任何涉及 `src/` 下新增 `.ts` 文件的后端任务

**不应触发：**

- 前端代码生成（→ frontend-codegen）
- Go 后端代码（→ backend-trpc-codegen）
- 数据库表设计（→ mysql-schema-design）
- 纯架构讨论或技术选型
- 代码审查（→ code-quality-guard）

---

## 代码生成流程总览

```
┌─────────────────────────────────────────────────────────────────┐
│  🔒 Step 0: 规则注入 — alwaysApply → specflow-rules-engine                  │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 1: 项目环境检测 — tsconfig / package.json / rollup / eslintrc  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 2: 提取 Node 规则 — 读取 references/node-eslint-rules.md    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 3: 查找公共函数 — 搜索 src/helpers/ 优先复用               │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 4: 按规范生成 — node: 按需导入 + createRequire + 打包适配  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 5: 验证 — tsc --noEmit + ESLint（最多3轮修复）           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 6: 交付报告 — 标准格式报告 + 交付清单                      │
└─────────────────────────────────────────────────────────┘
```

> 🔒 **步骤执行约束**：每个 Step 必须按序执行。若模型认为可跳过，**必须输出跳过声明**：
>
> ```
> ⏭️ [跳过] Step {N} — {步骤名称}
> 理由：{为什么可以跳过}
> 风险：{跳过可能带来的风险}
> ```
>
> **禁止无声跳过**——未声明理由的跳过 = 违规。

---

## 中断与恢复机制

若执行过程被中断（如模型输出截断），重新继续时必须：

1. **扫描已有输出** — 检查已完成的 Step 及其完成播报
2. **播报恢复点** — 使用标准格式：
   ```
   ⏯️ [恢复] 上次进度：X/6 步完成
   已完成：✅ Step 0 — 规则注入
           ✅ Step 1 — 环境检测
           ✅ Step 2 — Node 规则提取
           ✅ Step 3 — 公共函数查找
           ✅ Step 4 — 代码生成
           ✅ Step 5 — 验证
           ✅ Step 6 — 交付报告
   待完成：⬜ Step N — {待完成步骤}
   断点：从 Step N 继续
   ```
3. **从断点继续** — 不重复已完成步骤，不遗漏未完成步骤
4. **重启确认** — 播报恢复后主动询问用户是否继续

---

## 🔒 Step 0 — 规则注入（强制 · 最高优先级 · 不可跳过）

```
【🔒 不可变约束】
  Step 0 必须在任何代码生成之前完成。
  未执行规则注入就开始写代码 = 严重违规，必须立即停止并回退。
  无任何豁免理由。
```

本 Skill 的 RULE.mdc 为 `alwaysApply: true`（全局规则），需走 **specflow-rules-engine** 同步到 System Prompt：

```typescript
use_skill('specflow-rules-engine') // 同步 RULE.mdc → .codebuddy/rules/ + 检测注入 + read_file 兜底
```

此外还需要加载 code-quality-guard 规则：

```typescript
use_skill('code-quality-guard')
```

> **完成播报（必须逐字输出）：**
>
> ```
> ✅ [Step 0] 规则注入完成
>   ▸ 注入方式：specflow-rules-engine（alwaysApply: true）
>   ▸ code-quality-guard 规则已加载
>   ▸ 核心铁律已在上下文中
> ```
>
> 未播报不得进入 Step 1。
>
> ⏭️ **唯一可跳过条件**：同一次会话中已执行过 Step 0 且播报过完成消息。
> 跳过必须声明：`⏭️ [跳过] Step 0 规则注入 | 理由：同会话已注入 | 风险：无`

---

## Step 1 — 项目环境检测（强制 · 不可跳过）

> **没有检测项目配置就生成代码 = 闭眼写代码 = 违规。**

### 1.1 必须检测的配置文件

按以下优先级依次检测，缺失项标记为"未检测到"：

| 配置文件          | 检测项                                          | 影响                           |
| ----------------- | ----------------------------------------------- | ------------------------------ |
| `tsconfig.json`   | `module`、`moduleResolution`、`paths`、`strict` | 导入格式、路径别名、类型严格度 |
| `package.json`    | `type`、`dependencies`、`devDependencies`       | 模块系统(ESM/CJS)、可用依赖    |
| `rollup.config.*` | `input`、`output.format`、`external`、`plugins` | 打包入口、输出格式、外部依赖   |
| `.eslintrc.*`     | `rules`、`extends`、`parser`                    | 代码风格约束                   |

### 1.2 环境检测决策表

| 检测结果                       | 代码生成决策                     |
| ------------------------------ | -------------------------------- |
| `package.json.type = "module"` | 使用 ESM 语法（`import/export`） |
| `tsconfig.module = "ESNext"`   | 使用 `import type` 分离类型导入  |
| `tsconfig.paths` 存在 `@/*`    | 内部模块用 `@/helpers/xxx` 导入  |
| `rollup output = cjs + esm`    | 代码必须同时兼容两种格式         |
| `rollup external` 列表         | 这些包不打包，用 `import` 引入   |
| `.eslintrc rules.semi = 0`     | 不使用分号                       |
| `.eslintrc rules.quotes`       | 使用单引号                       |

### 1.3 本项目默认环境（ai-ultra）

> 如果当前项目是 ai-ultra，以下为已检测到的环境信息：

```yaml
项目: ai-ultra
模块系统: ESM (type: module)
TS模块: ESNext + Bundler 解析
路径别名: @/* → src/*
打包输出: CJS + ESM 双格式 (Rollup)
外部依赖: esbuild, prettier, eslint
ESLint: 无分号 / 单引号 / 2空格 / object-curly-spacing: always
严格模式: strictNullChecks=true, noImplicitAny=false
```

> 完成播报：`"✅ Step 1 环境检测完成：ESM / ESNext / @别名 / CJS+ESM / 无分号"` — 未播报不得进入 Step 2。
>
> **验证检查点：**
> ```
> □ tsconfig.json 已读取（module / paths / strict）
> □ package.json 已读取（type / dependencies）
> □ rollup.config 已读取（output / external）
> □ .eslintrc 已读取（semi / quotes）

---

## Step 2 — 提取 Node 规则 [中自由度 · 强制]

> **code-quality-guard 已在 Step 0 加载。此步骤仅提取 Node.js 后端专用的 10 条强制规则。**

### 2.1 必读文档

```typescript
read_file('.codebuddy/skills/node-backend-codegen/references/node-eslint-rules.md')
```

### 2.2 Node.js 后端代码强制规则

| 规则          | 要求                                   | 示例                                                    |
| ------------- | -------------------------------------- | ------------------------------------------------------- |
| Node 模块导入 | 使用 `node:` 前缀按需引入              | `import { join } from 'node:path'`                      |
| CJS 模块加载  | 使用 `createRequire`                   | `const req = createRequire(import.meta.url)`            |
| 按需导入      | 解构导入，禁止 `import *`              | `import { readFileSync } from 'node:fs'`                |
| 异步动态导入  | 使用 `await import()`                  | `const { createRequire } = await import('node:module')` |
| 无分号        | 严格遵循 ESLint `semi: 0`              | `const x = 1`                                           |
| 单引号        | 仅使用单引号                           | `import { join } from 'node:path'`                      |
| 无 any        | 优先定义接口，`noImplicitAny` 时补类型 | `function fn(x: string): void`                          |
| 显式返回类型  | 所有导出函数必须有返回类型             | `export function add(a: number, b: number): number`     |
| console 禁用  | 生产代码禁止 `console.log`             | 用 helper 的日志工具                                    |
| 严格比较      | 使用 `===` / `!==`                     | `if (x === null)`                                       |

> 完成播报：`"✅ Step 2 Node ESLint 规则加载完成：10条核心规则"` — 未播报不得进入 Step 3。
>
> **验证检查点：**
> ```
> □ references/node-eslint-rules.md 已读取
> □ 10 条核心规则已确认就绪
> □ code-quality-guard 规则已注入

---

## Step 3 — 查找公共函数引用 [高自由度 · 强制]

> **项目已有 `src/helpers/` 公共函数库，新增代码必须优先复用。**

### 3.1 查找流程

```
需要某个功能？
├─ 先搜索 src/helpers/ 是否已有
│   ├─ exec 模块？  → import { exec, execShell, execNpm, execGit } from '@/helpers'
│   ├─ file 模块？  → import { readText, writeText, ensureDir, exists } from '@/helpers'
│   ├─ data 模块？  → import { deepClone, deepMerge, groupBy, chunk } from '@/helpers'
│   ├─ date 模块？  → import { formatDate, now, parseDate } from '@/helpers'
│   ├─ type 模块？  → import { isString, isNumber, assertType } from '@/helpers'
│   ├─ async 模块？ → import { sleep, retryAsync, parallel, debounce } from '@/helpers'
│   └─ string 模块？→ import { toCamel, toKebab, base64Encode, generateUuid } from '@/helpers'
│
├─ helpers 中没有？
│   ├─ 搜索 src/ 下其他模块是否有类似实现
│   │   └─ 有 → 引用
│   │
│   └─ 确实没有 → 在合适的 helpers 子模块中新增
│       ├─ 通用执行 → helpers/exec.ts
│       ├─ 文件操作 → helpers/file.ts
│       ├─ 数据处理 → helpers/data.ts
│       ├─ 日期时间 → helpers/date.ts
│       ├─ 类型判断 → helpers/type.ts
│       ├─ 异步处理 → helpers/async.ts
│       └─ 字符串处理 → helpers/string.ts
└─ 新增后必须在 helpers/index.ts 中导出
```

### 3.2 导入路径规则

```typescript
// ✅ 正确：从 helpers 统一入口导入
import { exec, readText, writeText, exists } from '@/helpers'

// ✅ 正确：从子模块直接导入（当只需要少量函数时）
import { exec } from '@/helpers/exec'

// ❌ 错误：使用相对路径（项目有 @ 别名）
import { exec } from '../helpers/exec'

// ❌ 错误：import * 一次性导入全部
import * as helpers from '@/helpers'
```

### 3.3 helpers 模块速查表

| 模块   | 文件                | 核心能力                               | 行数  |
| ------ | ------------------- | -------------------------------------- | ----- |
| exec   | `helpers/exec.ts`   | 跨平台命令执行、npm/git 封装、批量执行 | ~1080 |
| data   | `helpers/data.ts`   | 深拷贝/合并、对象操作、数组去重/分组   | ~260  |
| date   | `helpers/date.ts`   | 格式化、解析、计算、判断               | ~270  |
| file   | `helpers/file.ts`   | 路径处理、文件读写、搜索、批量操作     | ~900  |
| type   | `helpers/type.ts`   | 类型判断、类型断言、Type Guard         | ~290  |
| async  | `helpers/async.ts`  | 延迟、超时、重试、并发控制、防抖节流   | ~270  |
| string | `helpers/string.ts` | 大小写转换、模板、编码、随机           | ~280  |

> 完成播报：`"✅ Step 3 公共函数引用完成：复用 {N} 个 / 新增 {N} 个"` — 未播报不得进入 Step 4。
>
> **验证检查点：**
> ```
> □ 已搜索 src/helpers/ 查找可复用函数
> □ 新函数已添加到正确子模块并导出
> □ 导入路径使用 @/ 别名（非相对路径）

---

## Step 4 — 按规范生成代码 [中自由度 · 强制]

> **核心铁律：node: 按需导入 + createRequire + 打包配置适配。**

### 4.1 导入规范（铁律）

#### Node 内置模块 — 必须使用 `node:` 前缀

```typescript
// ✅ 正确：node: 前缀 + 按需解构
import { join, resolve } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
// 完整模块列表见 references/node-modules-quick-ref.md

// ❌ 错误：省略 node: 前缀 或 整体导入
import { join } from 'path' // 缺少 node: 前缀
import * as fs from 'node:fs' // 整体导入，应解构
```

#### CommonJS 模块 — 必须使用 createRequire

```typescript
// ✅ 正确：动态导入 createRequire
const { createRequire } = await import('node:module')
const req = createRequire(import.meta.url)
const someCjsModule = req('some-cjs-package')

// ✅ 正确：静态导入 createRequire（模块顶层）
import { createRequire } from 'node:module'
const req = createRequire(import.meta.url)

// ❌ 错误：直接 require（ESM 中不存在）
const someCjsModule = require('some-cjs-package')
```

#### 第三方包 — 根据打包配置决定

```typescript
// Rollup external 列表中的包 → 直接 import（不打包）
import prettier from 'prettier'
import eslint from 'eslint'

// Rollup 会打包的包 → 正常 import
import spawn from 'cross-spawn'
import { Command } from 'commander'
```

#### 类型导入 — 分离 type 修饰符

```typescript
// ✅ 正确：type 修饰符分离类型导入
import type { ExecResult, ExecOptions } from '@/helpers/exec'
import { exec, execShell } from '@/helpers/exec'

// ✅ 正确：混合导入时 type 标注
import { exec, type ExecResult } from '@/helpers/exec'
```

### 4.2 导入顺序规范

```typescript
// 1. Node 内置（node: 前缀）→ 2. 第三方库（按字母）→ 3. @/ 别名 → 4. ./ 相对 → 5. type 最后
import { join, resolve } from 'node:path'
import { Command } from 'commander'
import spawn from 'cross-spawn'
import { exec, readText } from '@/helpers'
import type { ExecResult } from '@/helpers/exec'
import { formatOutput } from './utils'
import type { Config } from './types'
```

### 4.3 Rollup 打包配置适配

```typescript
// 核心规则（详见 references/rollup-config-guide.md）：
// 1. external: ['esbuild', 'prettier', 'eslint'] → 直接 import，不打包
// 2. output: [cjs, esm] → 代码兼容双格式，用命名导出
// 3. preferBuiltins: true → node: 模块不打包

// ✅ 正确：命名导出
export function myFunction(): void {}
export const myConst = 'value'

// ❌ 错误：默认导出（CJS 互操作性差）
export default function myFunction(): void {}
```

### 4.4 文件结构模板

```typescript
/**
 * 模块名称 — 模块描述
 *
 * 特性：
 * - 特性 1
 */

// ==================== Node 内置模块 ====================
import { join, resolve } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'

// ==================== 第三方库 ====================
import spawn from 'cross-spawn'

// ==================== 项目内部模块 ====================
import { exec, readText } from '@/helpers'
import type { ExecResult } from '@/helpers/exec'

// ==================== 类型定义 ====================
export interface ModuleOptions {
    path: string
    recursive?: boolean
}

// ==================== 核心实现 ====================
export function processFiles(options: ModuleOptions): string[] {
    return []
}
```

### 4.5 写入前自检（强制）

```
□ 全部使用 node: 前缀导入内置模块
□ 使用 createRequire 加载 CJS 模块（无 require 调用）
□ 按需解构导入，无 import *
□ 导入顺序：node: → 第三方 → @/ → ./ → type
□ 无分号、单引号、2 空格缩进
□ 所有导出函数有显式返回类型
□ 无 any 类型
□ 已搜索 helpers 复用公共函数
□ 新增的通用函数已添加到 helpers 并导出
□ 🚫 未生成测试文件（无 *.test.ts / *.spec.ts / __tests__/）
```

> 完成播报：`"✅ Step 4 代码生成完成：{文件名} / {N}行"` — 未播报不得进入 Step 5。
>
> **验证检查点：**
> ```
> □ 写入前自检已通过（9项全部 ✅）
> □ node: 前缀 | createRequire | 无 import * | 导入顺序正确
> □ 命名导出 | 显式返回类型 | 无 any | helpers 已复用
> □ 🚫 未生成测试文件
> ```
>
> 🔒 **强制约束**：自检不通过不得写入文件。

---

## Step 5 — 验证 [低自由度 · 强制]

> **生成后必须验证。不验证 = 未完成。**

### 5.1 运行验证

```bash
# TypeScript 类型检查
npx tsc --noEmit

# ESLint 检查
npx eslint <file_path>
```

### 5.2 验证反馈循环

```
运行验证
  ↓
全部清除？
  ├─ 是 → 进入 Step 6 输出报告
  │
  └─ 否 → 分类问题
           ├─ tsc 错误 → 修复类型 → 重新验证（最多 3 轮）
           ├─ ESLint 错误 → nut-lint fix --write → 重新验证
           └─ 3 轮后仍失败 → 输出错误摘要，上报用户
```

### 5.3 验证清单

```
□ tsc --noEmit 通过（0 类型错误）
□ ESLint 通过（0 错误）
□ 所有 node: 导入正确
□ createRequire 使用正确
□ helpers 引用有效
□ 无意外依赖引入
□ 🚫 无测试文件生成
```

> 完成播报：`"✅ Step 5 验证通过：tsc✅ ESLint✅"` — 未通过不得交付。
>
> **验证检查点：**
> ```
> □ tsc --noEmit: 0 类型错误
> □ ESLint: 0 错误
> □ node: 导入正确 | createRequire 正确 | helpers 引用有效
> □ 🚫 无测试文件生成
> ```
>
> 🔒 **强制约束**：此步骤不可跳过。最多 3 轮修复。

---

## Step 6 — 输出交付报告 [低自由度 · 强制]

### 6.1 报告格式

```markdown
## Node.js 代码生成报告

**目标：** `<file_path>` | **环境：** ESM / ESNext / @别名 / CJS+ESM

| 检查项       | 状态  | 检查项        | 状态   |
| ------------ | ----- | ------------- | ------ |
| TypeScript   | ✅/❌ | ESLint        | ✅/❌  |
| node: 导入   | ✅    | createRequire | ✅/N/A |
| helpers 复用 | N 个  | 测试文件      | 🚫 禁止 |

### 交付清单

- [ ] 规则注入已完成（specflow-rules-engine + code-quality-guard）
- [ ] helpers 公共函数已复用 | node: 按需导入 | createRequire 正确使用
- [ ] tsc --noEmit 通过 | ESLint 通过
- [ ] 🚫 未生成测试文件
```

> 完成播报：`"✅ Step 6 交付报告输出完成"` — 未播报不得结束。

---

## Node 内置模块速查表

> 完整速查表见 [references/node-modules-quick-ref.md](references/node-modules-quick-ref.md)
>
> 核心规则：node: 前缀 + 按需解构 + 禁止 import \*

---

## 错误处理

| 错误场景                            | 处理方式                          |
| ----------------------------------- | --------------------------------- |
| 找不到 tsconfig.json                | 使用本项目默认环境（Step 0.3）    |
| helpers 中没有需要的函数            | 在合适子模块新增 + 导出           |
| createRequire 不可用（纯 ESM 环境） | 使用 `await import()` 动态导入    |
| Rollup 配置不明确                   | 假设输出 CJS+ESM 双格式，保守编码 |
| ESLint 规则与项目冲突               | 以项目实际 `.eslintrc.*` 为准     |
| 3 轮验证仍失败                      | 上报错误摘要，不强行修复          |

---

## 参考资料

| 文件                                    | 内容                             | 加载时机 |
| --------------------------------------- | -------------------------------- | -------- |
| `references/node-eslint-rules.md`       | Node.js 后端 ESLint 规则详细说明 | Step 2   |
| `references/node-modules-quick-ref.md`  | Node 内置模块速查表              | Step 4   |
| `references/create-require-patterns.md` | createRequire 使用模式与示例     | Step 4   |
| `references/rollup-config-guide.md`     | Rollup 打包配置适配指南          | Step 1/4 |
| `examples/triggers.json`                | 触发/反触发示例                  | 仅供测试 |
