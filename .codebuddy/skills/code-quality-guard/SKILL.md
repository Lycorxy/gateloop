---
name: code-quality-guard
description: >
    代码质量管控技能，三个强制任务：提取规则（检测+强制生成）→ 注入上下文（给代码生成）→
    代码验证自动修复（到0错误为止，不让用户手动修）。
    覆盖 ESLint + Prettier + Stylelint + TypeScript 四大工具闭环。
    触发词：代码规范、lint检查、ESLint、Stylelint、Prettier、格式化、修复lint、
    类型检查、tsc、ts错误、初始化规则、规则知识库，或用户要求检查/修复/格式化代码时。
    禁止用于：从零开始编写新业务逻辑、仅回答语法问题、
    进行架构设计、审查非代码文档（应使用 code-review-check）。
version: 10.0.0
dependencies: [specflow-rules-engine]
conflict-with: [code-review-check]
allowed-tools: [read_file, write_file, replace_in_file, search_content, search_file, execute_command, list_dir]
max-token: 3000
---

# Code Quality Guard v10 — 三任务强制执行器

> **三个任务，强制执行，不允许跳过，不让用户手动修复：**
> 1. **提取规则** — 检测 `references/references/` 是否已生成，没有就强制生成
> 2. **注入上下文** — 把规则注入给代码生成，让生成的代码准确
> 3. **代码验证+自动修复** — 验证 → 输出错误 → 自动修复 → 再验证，循环到 0 错误

## 🛑 入口守卫（不可绕过·不允许跳过）

```
本 Skill 只有三个任务，每个必须执行到底：

  ✗ 不允许跳过任务1 — 规则未就绪，后续验证无依据
  ✗ 不允许跳过任务3 — 验证未通过 = 任务未完成
  ✗ 不允许把错误留给用户手动修复 — 必须自动修复到 0 错误
  ✗ 不允许用 read_lints 替代 npx nut-lint（read_lints 仅补充确认）
  ✗ 不允许"3轮后放弃" — 最多 5 轮，仍失败则输出详细报告并继续尝试

唯一入口是 npx nut-lint 命令族。
```

**核心定位：像一个严格的代码质量工程师，确保每一行代码都符合项目规范，交付时 0 错误。**

---

## 何时使用 / 何时不使用

**应该触发：** 代码规范、lint检查、ESLint、Stylelint、Prettier、格式化、修复lint、类型检查、tsc、ts错误、初始化规则、规则知识库、代码生成后交付前验证

**不应触发：** 从零写新功能、纯语法问答、架构决策、审查非代码文档(→code-review-check)

---

## 三任务流程

```
任务1: 提取规则（强制·不可跳过）
  ↓ 检测 references/references/ → 没有？强制 nut-lint extract + knowledge 生成
任务2: 注入上下文（强制）
  ↓ RULE.mdc alwaysApply + quick-ref.md → 代码生成即受规则约束
任务3: 验证+自动修复闭环（强制·不跳过·不让用户手动）
  ↓ nut-lint fix --write → nut-lint run → 有错误？→ 回 fix → 循环到 0 错误
```

---

## 中断与恢复

若中断后恢复：
1. 扫描已有输出，确认完成的任务
2. 播报恢复点：`⏯️ [恢复] 已完成：任务1✅ 任务2✅ | 断点：任务3 第{N}轮`
3. 从断点继续

---

## 任务1 — 提取规则（强制 · 不可跳过）

> 检测规则知识库是否已生成。没有就**强制生成**，不允许跳过。

### 1.1 检测规则文件是否存在

```bash
# 检测 references/references/ 目录是否有规则文档（应有 400+ 个 eslint--*.md / stylelint--*.md）
list_dir('.codebuddy/skills/code-quality-guard/references/references')
# 同时检测速查表
read_file('.codebuddy/skills/code-quality-guard/references/quick-ref.md')
```

### 1.2 判定与执行

```
references/references/ 有 400+ 规则文件 且 quick-ref.md 存在？
├── 是 → 规则已就绪，进入 1.3 检测变更
└── 否 → ❌ 规则未生成，强制执行生成（不允许跳过）：
    npx nut-lint extract --verbose
    npx nut-lint knowledge --source eslint --rules all --overwrite true --outputDir .codebuddy/skills/code-quality-guard/references
    npx nut-lint knowledge --source stylelint --rules all --overwrite true --outputDir .codebuddy/skills/code-quality-guard/references
    生成后重新检测，确认 references/references/ 已有规则文件
```

### 1.3 检测规则变更（已就绪时）

```bash
npx nut-lint extract --check
# ├─ 配置有变更 → 重新生成（回到 1.2 的 knowledge 命令）
# └─ 无变更 → 继续
```

### 1.4 验证就绪

```
□ references/references/ 有 400+ 规则文件
□ references/quick-ref.md 存在
□ references/index.md 存在
```

> **播报（必须输出）：**
> ```
> ✅ [任务1] 规则就绪
>   ▸ references/references/: {N} 个规则文件
>   ▸ quick-ref.md: 已就绪
>   ▸ 规则变更: {有/无}
>   ▸ 状态: {已生成/本次强制生成}
> ```

---

## 任务2 — 注入上下文（强制）

> 把规则注入上下文，让代码生成时就受约束，而不是"生成后再检查"。

### 2.1 RULE.mdc 已自动注入

RULE.mdc `alwaysApply: true` → 自动常驻 System Prompt。铁律 0-12（格式/类型/命名/import/样式/安全/验证清单）在代码生成时即生效。

### 2.2 补充读取速查表（每次必须）

```typescript
read_file('.codebuddy/skills/code-quality-guard/references/quick-ref.md')
// 四工具核心规则速查表，确认模型已"看到"具体规则值
```

### 2.3 按需加载特定规则

仅在处理特定问题时加载 `references/references/` 中的单条规则文档：

| 场景 | 读取文件 |
|------|----------|
| TS 类型错误 | `references/ts-error-codes.md` |
| 圈复杂度超标 | `references/references/eslint--complexity.md` |
| 发现 eslint-disable | `references/references/eslint--no-console.md` |
| 样式选择器问题 | `references/references/stylelint--selector-class-pattern.md` |

### 2.4 核心规则确认（已由 RULE.mdc 强制注入）

| 类别 | 核心规则 |
|------|---------|
| 格式 | 单引号 / 无分号 / 2空格 / 行宽≤100 |
| 规模 | 文件≤360行 / 函数≤25行 / 圈复杂度≤10 |
| 类型 | 显式返回类型 / 禁止any / ===比较 / err守卫 |
| 命名 | camelCase / UPPER_SNAKE / PascalCase |
| Import | node:前缀 / 按需解构 / 顺序：node→三方→@/→./→.scss |
| 禁止 | eslint-disable / console / as any / eval |
| 样式 | 禁止硬编码颜色间距 / 扁平结构 / var() / 无!important |

> **播报：** `✅ [任务2] 规则注入完成：RULE.mdc(常驻) + quick-ref + {N}个按需文档`

---

## 任务3 — 代码验证 + 自动修复闭环（强制 · 不跳过 · 不让用户手动）

> **核心铁律：验证有错误必须自动修复到 0 错误，不允许留给用户手动修。**

### 3.1 自动修复（先跑修复，再验证）

```bash
# 单文件
npx nut-lint fix <file_path> --write
# 批量
npx nut-lint fix "src/**/*.ts" --wrap
# 仅 Prettier 格式化
npx nut-lint format <file_or_pattern>
```

`fix --write` 同时执行：Prettier 格式化 → ESLint 修复 → Stylelint 修复。

### 3.2 验证

```bash
npx nut-lint run <file_path>
# 同时运行 Prettier + ESLint + Stylelint + tsc --noEmit
```

### 3.3 分析驱动修复（强制·禁止盲目循环跑fix）

> ⚠️ **`fix --write` 只能修格式 + 部分可自动修的 ESLint。对 TS 类型错误、圈复杂度、不可自动修的规则完全无效。**
> ❌ **禁止"有错误→再跑fix→还有错误→再跑fix"死循环**（这就是"改了几个小时改了个锤子"的根因）。
> ✅ **正确流程：fix 只跑一次 → 逐条分析剩余错误 → 手动修不可自动修的 → 再验证**

```
第1步: npx nut-lint fix --write（只跑一次，修格式+可自动修的）
第2步: npx nut-lint run（获取剩余错误列表）
第3步: 逐条分析剩余错误，按类型处理（见下表）→ 用 replace_in_file 手动修代码
第4步: npx nut-lint run（验证手动修复结果）
  ├─ 0 错误 → ✅ 完成，进入 3.4
  └─ 有错误 → 回第3步（分析剩余错误，继续手动修）
第5步: 防死循环：同一错误连续2轮没修好 → 换修复策略，禁止重复同样操作
```

**错误分类处理（逐条分析·对应修复方式）：**

| 错误类型 | fix能修? | 修复方式 | 禁止 |
|---------|---------|---------|------|
| Prettier 格式 | ✅ | fix 已跑，如仍有说明配置冲突，检查 .prettierrc | ✗ 手动改格式 |
| ESLint 可自动修(fixable) | ✅ | fix 已跑，如仍有检查为何没修 | - |
| ESLint complexity(圈复杂度) | ❌ | **手动拆分函数**为多个小函数 → replace_in_file | ✗ 再跑fix |
| ESLint no-unused-vars | 部分 | 删除未使用的 import/变量/参数 → replace_in_file | ✗ 留着 |
| ESLint no-console | ❌ | 删除 console 或改用 logger → replace_in_file | ✗ 留着 |
| ESLint eqeqeq | ❌ | `==` 改 `===` → replace_in_file | ✗ 再跑fix |
| ESLint prefer-const | ❌ | `let` 改 `const` → replace_in_file | ✗ 再跑fix |
| eslint-disable 注释 | ❌ | 删除注释 → 从根本修复问题 → replace_in_file | ✗ 保留 |
| TS2304 缺少导入 | ❌ | 补 import 语句 → replace_in_file | ✗ 再跑fix |
| TS2345/2322 类型不匹配 | ❌ | 修参数/返回类型 → replace_in_file | ✗ 再跑fix |
| TS2532/18046 可能为null | ❌ | 加 null 检查/可选链 ?. → replace_in_file | ✗ 再跑fix |
| TS7006/7034 隐式any | ❌ | 补类型标注 → replace_in_file | ✗ 再跑fix |
| TS6133/6138 未使用声明 | ❌ | 删除或使用 → replace_in_file | ✗ 再跑fix |
| Stylelint 不可自动修 | ❌ | 手动改选择器/属性 → replace_in_file | ✗ 再跑fix |

**TS 类型修复优先级（按顺序逐个修）：**
TS2304(缺少导入) → TS2345/TS2322(参数类型) → TS2532(undefined) → TS7006(隐式any) → TS6133(未使用)

**每轮修复必须播报（禁止盲目操作）：**
```
🔄 [任务3·第{N}轮]
  fix 修了: {N}个格式/可自动修问题
  剩余错误: {N}个（逐条列出：文件:行号 — 规则 — 修复方式）
  本轮手动修: {修了哪些}
  修复后 run: {N}错误剩余
```

**防死循环规则：**
- 同一错误连续 2 轮没修好 → 换策略（复杂度拆分方式不对→换拆法；类型修不好→重新分析类型定义）
- 禁止"同一操作重复跑"（fix 跑过了就不再跑，除非代码变了）
- 5 轮后仍有错误 → 输出详细报告 + 继续手动修，不允许交给用户

### 3.4 完成判定

```
□ Prettier: 0 格式问题
□ ESLint: 0 错误
□ Stylelint: 0 错误
□ tsc --noEmit: 0 类型错误
□ 无 eslint-disable 注释
□ 圈复杂度 ≤ 10
全部 ✅ 才算任务3完成。任一 ❌ 必须继续修复。
```

> **播报：**
> - 每轮：`🔄 [任务3·第{N}轮] fix→run：{N}错误剩余`
> - 完成：`✅ [任务3] 验证通过：Prettier✅ ESLint✅ Stylelint✅ tsc✅（共{N}轮）`

---

## 命令参考

| 命令 | 功能 | 任务 |
|------|------|------|
| `npx nut-lint extract --verbose` | 提取项目规则 | 任务1 |
| `npx nut-lint extract --check` | 检测规则变更 | 任务1 |
| `npx nut-lint knowledge --source {eslint/stylelint} --rules all --overwrite true --outputDir {dir}` | 生成规则知识库 | 任务1 |
| `npx nut-lint fix <file> --write` | Prettier+ESLint+Stylelint 自动修复 | 任务3 |
| `npx nut-lint format <file>` | 仅 Prettier 格式化 | 任务3 |
| `npx nut-lint run <file>` | 验证(Prettier+ESLint+Stylelint+tsc) | 任务3 |
| `npx nut-lint check <file>` | 仅检查不修复 | 任务3 |
| `npx nut-lint config` | 诊断项目配置 | 故障排除 |

---

## 错误处理

| 场景 | 处理 |
|------|------|
| nut-lint 未安装 | `npm install -D nut-lint` |
| Prettier/ESLint/Stylelint 未安装 | `npm install -D prettier eslint stylelint` |
| 规则知识库生成失败 | 检查 nut-lint 版本，重试；3次失败上报用户 |
| 5轮修复仍有错误 | 输出详细报告 + 手动修复不可自动修复项 + 继续验证 |
| tsc 错误无法自动修复 | 按优先级手动修复类型 → 重新验证 |

---

## 参考资料

| 文件 | 内容 | 价值 |
|------|------|------|
| `RULE.mdc` | 核心铁律 0-12 | ⭐⭐⭐⭐⭐ alwaysApply 自动注入 |
| `references/quick-ref.md` | 四工具核心规则速查表 | ⭐⭐⭐⭐ 任务2 每次必读 |
| `references/references/` | 400+ 单条规则文档（自动生成） | ⭐⭐⭐ 任务1 检测 + 任务3 按需 |
| `references/ts-error-codes.md` | TS 错误代码修复指南 | ⭐⭐⭐ 任务3 类型修复 |
| `references/index.md` | 自动生成的规则索引 | - nut-lint 内部用 |
| `references/rules-data.json` | 自动生成的规则数据 | - nut-lint 内部用 |
