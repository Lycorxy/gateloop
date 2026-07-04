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
version: 2.0.0
dependencies: []
allowed-tools: [read_file, write_file, replace_in_file, search_content, execute_command, list_dir]
max-token: 1000
---

# Node.js 后端代码生成 v2.0

## 🛑 入口守卫

```
本 Skill 必须按序执行 Step 0→1→2→3 四步。
只生成代码，不负责规则注入/编排/质量管控。

specflow-rules-engine / eslint-code-quality 由上层统一注入。
```

**核心定位：生成生产级 Node.js TypeScript 代码，零冗余、零妥协。**

---

## 流程总览

```
Step 0: 环境检测 → 读 tsconfig + package.json，确定模块系统/路径别名
Step 1: 规范加载 → 读 references/ 注入编码规范 + helpers 复用规则
Step 2: 代码生成 → node:导入 + createRequire + 文件结构模板
Step 3: 验证交付 → tsc --noEmit + ESLint → 0 错误
```

---

## Step 0 — 环境检测（强制）

```typescript
// 并行读取
read_file('tsconfig.json')   // → module / paths / strict
read_file('package.json')    // → type(ESM/CJS) / dependencies
```

### 检测清单

```
□ 模块系统: type="module" → ESM / 无 → CJS
□ 路径别名: @/* → src/* → import from '@/helpers'
□ TS严格度: strict:true → 禁止 any / false → 谨慎 any
□ 打包输出: rollup config → 确定 CJS+ESM 双格式
```

> 播报：`"✅ Step 0 环境: {ESM/CJS} / {别名} / {严格度}"`

---

## Step 1 — 规范加载（强制）

```typescript
// 按需读取
read_file('.codebuddy/skills/node-backend-codegen/references/node-eslint-rules.md')
read_file('.codebuddy/skills/node-backend-codegen/references/node-modules-quick-ref.md')
```

### 核心铁律速查

| 规则 | 要求 |
|------|------|
| Node 模块 | `node:` 前缀 + 解构导入，禁 `import *` |
| CJS 互操作 | `createRequire(import.meta.url)`，禁 `require()` |
| 类型导入 | `import type { X }` 分离类型 |
| 导出 | 命名导出，禁默认导出（CJS 互操作性差） |
| 格式 | 无分号 / 单引号 / 2空格缩进 |
| 函数 | 导出函数有显式返回类型 / 零 any |
| ❌ 禁止 | 生成测试文件（`*.test.ts` / `*.spec.ts` / `__tests__/`） |

### helpers 复用规则

```
需要某功能 → 先查 src/helpers/
  ├─ 有 → import { fn } from '@/helpers'
  ├─ 无 → 在 helpers/ 子模块新增 + 在 index.ts 导出
  └─ 新增通用函数放 helpers/ 对应子模块（exec/file/data/date/type/async/string）
```

> 播报：`"✅ Step 1 规范: rules + modules-ref + helpers 复用{N}个"`

---

## Step 2 — 代码生成（核心）

### 2.1 文件结构模板

```typescript
/**
 * 模块名称 — 模块描述
 */

// ==================== Node 内置模块 ====================
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'

// ==================== 第三方库 ====================
import spawn from 'cross-spawn'

// ==================== 项目内部模块 ====================
import { exec, readText } from '@/helpers'
import type { ExecResult } from '@/helpers/exec'

// ==================== 类型定义 ====================
export interface ModuleOptions { path: string }

// ==================== 核心实现 ====================
export function processFiles(options: ModuleOptions): string[] {
  return []
}
```

### 2.2 导入顺序

```
1. Node 内置 (node: 前缀)
2. 第三方库（字母序）
3. @/ 别名
4. ./ 相对
5. import type 最后
```

### 2.3 写入前自检

```
□ 全部 node: 前缀 / 解构导入 / 无 import *
□ createRequire 加载 CJS / 无 require() 调用
□ 导入顺序正确（node→第三方→@/→./→type）
□ 命名导出 / 无默认导出 / 显式返回类型
□ 零 any / 零分号 / 单引号
□ helpers 已优先复用 / 新增函数已导出
□ 🚫 无测试文件生成
```

> 播报：`"✅ Step 2 代码生成: {文件名} / {N}行"`

---

## Step 3 — 验证交付（强制）

```bash
# 1. 类型检查
npx tsc --noEmit

# 2. ESLint 检查
npx eslint <file_path>
```

**验证不通过 → 回 Step 2 修复，最多 3 轮，超限则上报。**

> 播报：`"✅ Step 3 验证: tsc✅ ESLint✅ → 交付"`

---

## 参考资料

| 文件 | 内容 | 加载时机 |
|------|------|---------|
| `references/node-eslint-rules.md` | Node.js ESLint 规则详述 | Step 1 |
| `references/node-modules-quick-ref.md` | Node 内置模块速查 | Step 1 |
| `references/create-require-patterns.md` | createRequire 模式 | Step 2 按需 |
| `references/rollup-config-guide.md` | Rollup 适配指南 | Step 2 按需 |
