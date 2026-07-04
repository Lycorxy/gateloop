---
name: eslint-code-quality
description: >
    ESLint + Stylelint + TypeScript 代码质量管控技能。
    覆盖：规则知识库生产与注入、代码生成规范、格式化自动修复、
    Lint验证与修复、TypeScript类型检测与修复的完整闭环。
    触发词：代码规范、lint检查、ESLint、Stylelint、代码检查、
    格式化、修复lint、类型检查、tsc、ts错误、初始化规则、
    规则知识库，或用户要求检查/修复/格式化代码时。
    禁止用于：从零开始编写新业务逻辑、仅回答语法问题、
    进行架构设计、审查非代码文档（应使用 code-review-check）。
version: 8.2.0
dependencies: []
conflict-with: [code-review-check]
allowed-tools: [read_file, write_file, search_content, execute_command]
max-token: 3000
---

# ESLint / Stylelint / TypeScript 代码质量管控 v8.2

## 🛑 入口守卫（最高优先级·不可绕过）

```
本 Skill 被 use_skill 加载后，必须按顺序执行 Step 0→1→2B/2A→3 完整闭环。
每步必须播报对应完成消息。

禁止行为：
  ✗ 用 read_lints 替代 Step 2B/3（npx nut-lint fix/run）
  ✗ 跳过 Step 0 知识库检查
  ✗ 跳过 Step 3 验证（npx nut-lint run）
  ✗ 不播报完成消息

唯一入口是 npx nut-lint 命令族，read_lints 仅用于补充确认。
```

**核心定位：像一个严格的代码质量工程师那样，确保每一行代码都符合项目规范。**

> 🧠 **设计哲学**：先确认知识库就绪，再按需加载规则，生成/修复后必须验证形成闭环。

---

## 何时使用 / 何时不使用

**应该触发：** 代码规范、lint检查、ESLint、Stylelint、代码检查、格式化、修复lint、类型检查、tsc、ts错误、初始化规则、规则知识库、代码生成后交付前验证

**不应触发：** 从零写新功能、纯语法问答、架构决策、审查非代码文档(→code-review-check)

---

## 质量管控流程总览

```
┌─────────────────────────────────────────────────────────┐
│  🔒 Step 0: 知识库就绪检查 + 规则变更检测（强制·不可跳过）│
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 1: 加载规则到上下文 [中自由度·强制]               │
│  ↓ quick-ref.md + index.md（每次必须）                  │
└─────────────────────────────────────────────────────────┘
              ┌───────────┴───────────┐
              ↓                       ↓
┌───────────────────┐   ┌─────────────────────────┐
│ Step 2A: 按规则生成│   │ Step 2B: 格式化与修复    │
│ 新代码 [高自由度]  │   │ 现有代码 [低自由度]      │
└───────────────────┘   └─────────────────────────┘
              └───────────┬───────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 3: 验证 [低自由度·强制]                           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 4: TypeScript 类型修复 [中自由度·按需]            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 5: 输出质量报告 [低自由度·强制]                   │
└─────────────────────────────────────────────────────────┘
```

> 🔒 每步按序执行。跳过必须声明：`⏭️ [跳过] Step N — 理由 | 风险`

---

## 中断与恢复机制

若执行过程被中断，重新继续时必须：

1. **扫描已有输出** — 检查已完成的 Step
2. **播报恢复点**：
   ```
   ⏯️ [恢复] 上次进度：X/5 步完成
   已完成：✅ Step 0 — 知识库检查 | ✅ Step 1 — 规则加载
           ✅ Step 2A/B — 生成/修复 | ✅ Step 3 — 验证
   待完成：⬜ Step N — {待完成步骤}
   断点：从 Step N 继续
   ```
3. **从断点继续** — 不重复不遗漏
4. **重启确认** — 播报后主动询问

---

## 🔒 Step 0 — 知识库就绪检查 + 规则变更检测（强制 · 不可跳过）

> 本 Skill 不依赖 specflow-rules-engine，有独立的规则知识库系统。
> RULE.mdc 为 `alwaysApply: true`（全局规则），自动常驻 System Prompt，但 ESLint/Stylelint 规则通过 nut-lint 管理。

### 0.1 检测规则变更（最高优先级·必须最先执行）

```bash
npx nut-lint extract --check
# ├─ 知识库不存在 → 进入 0.2
# ├─ 配置有变更 → 重新初始化
# └─ 无变更 → 进入 0.3
```

### 0.2 执行知识库初始化/更新

```bash
npx nut-lint extract --verbose
npx nut-lint knowledge --source eslint --rules all --overwrite true --outputDir .codebuddy/skills/eslint-code-quality/references
npx nut-lint knowledge --source stylelint --rules all --overwrite true --outputDir .codebuddy/skills/eslint-code-quality/references
```

### 0.3 验证知识库就绪

```typescript
read_file('.codebuddy/skills/eslint-code-quality/references/index.md')
read_file('.codebuddy/skills/eslint-code-quality/references/quick-ref.md')
```

> **完成播报（必须逐字输出）：**
>
> ```
> ✅ [Step 0] 知识库就绪
>   ▸ 注入方式：alwaysApply（RULE.mdc 常驻）+ nut-lint 知识库
>   ▸ {N}条规则 / {N}个参考文档 / 规则变更{有/无}变更
> ```

---

## Step 1 — 加载规则到上下文 [中自由度 · 强制]

### 1.1 每次必须读取

```typescript
const REF = '.codebuddy/skills/eslint-code-quality/references'
read_file(`${REF}/quick-ref.md`) // 核心规则摘要（约50行）
read_file(`${REF}/index.md`) // 规则数量和索引（约30行）
```

### 1.2 按需读取

仅在处理特定问题时加载对应 `references/eslint--*.md` / `references/stylelint--*.md`。

### 1.3 核心规则摘要（始终强制执行）

| 规则 | 要求 |
|------|------|
| 引号 | 仅使用单引号 `'` |
| 分号 | **不使用**分号 |
| 缩进 | 2 个空格 |
| 行宽 | <= 100 字符 |
| 类型 | 显式返回类型，**永远不要** `any` |
| 比较 | `===` / `!==` |
| 命名 | camelCase（变量）、UPPER_SNAKE（常量） |
| console | 禁止（调试除外） |
| `as any` | 避免 |
| eslint-disable | **禁止**使用；应从根本上修复 |
| 圈复杂度 | **≤ 10** |

> 完成播报：`"✅ Step 1 规则加载完成：quick-ref + index + {N}个按需文档"`

---

## Step 2A — 按规则生成代码 [高自由度]

> 任务是**编写新代码**时走此路径。

### 2A.1 生成 → 2A.2 写入前自检

```
□ 单引号/无分号 | □ 显式返回类型 | □ 无 any | □ === 比较
□ 无未使用导入 | □ 无 console | □ 无 eslint-disable | □ 圈复杂度 ≤ 10
```

> 完成播报：`"✅ Step 2A 代码生成完成：{文件名}"` — 自检不通过不得写入。

---

## Step 2B — 格式化与修复 [低自由度]

> 任务是**修复/格式化现有代码**时走此路径。

```bash
# 单文件
npx nut-lint fix <file_path> --write
# 批量
npx nut-lint fix "src/**/*.ts" --wrap
```

> **验证检查点：**
> ```
> □ Prettier/ESLint/Stylelint 均已安装
> □ eslint-disable 注释已删除并修复
> □ 圈复杂度 > 10 的函数已拆分
> ```

> 完成播报：`"✅ Step 2B 格式化修复完成：{N}个文件"`

---

## Step 3 — 验证 [低自由度 · 强制]

```bash
npx nut-lint run <file_path>  # 同时运行 ESLint + Stylelint + tsc --noEmit
```

**验证反馈循环：** 0错误→Step5 / 有错误→可自动修复→返回2B(最多3轮) / 不可自动修复→Step4

> **验证检查点：**
> ```
> □ ESLint: 0 错误 | □ Stylelint: 0 错误 | □ tsc: 0 类型错误
> □ 无 eslint-disable 注释 | □ 圈复杂度 ≤ 10
> ```

> 完成播报：`"✅ Step 3 验证通过：ESLint✅ Stylelint✅ tsc✅"`

---

## Step 4 — TypeScript 类型修复 [中自由度 · 按需]

仅当 Step 3 检测到 tsc 错误时执行。无 tsc 错误则跳过。

```bash
npx nut-lint run <file_or_pattern> --source typescript
```

修复优先级：TS2304(缺少导入) → TS2345/TS2322(参数类型) → TS2532(undefined) → TS7006(隐式any) → TS6133(未使用)

> 完成播报：`"✅ Step 4 类型修复完成：{N}个错误"` — 修复后回 Step 3 验证。

---

## Step 5 — 输出质量报告 [低自由度 · 强制]

```markdown
## 代码质量报告

**目标：** `<file_path>` | **工具：** ESLint + Stylelint + TypeScript

| 工具 | 状态 | 错误 | 警告 |
|------|------|------|------|
| ESLint | ✅/❌ | N | N |
| Stylelint | ✅/❌ | N | N |
| TypeScript | ✅/❌ | N | - |
```

> 完成播报：`"✅ Step 5 质量报告输出完成"`

---

## 命令参考

| 命令 | 功能 | 时机 |
|------|------|------|
| `npx nut-lint extract --verbose` | 提取项目规则 | Step 0 |
| `npx nut-lint knowledge --overwrite true` | 生成知识库 | Step 0 |
| `npx nut-lint fix <file> --write` | 格式化+lint修复 | Step 2B |
| `npx nut-lint run <file>` | 验证(ESLint+Stylelint+tsc) | Step 3 |
| `npx nut-lint config` | 诊断项目配置 | 故障排除 |

## 参考资料

| 文件 | 内容 | 加载时机 |
|------|------|----------|
| `references/quick-ref.md` | 核心规则摘要 | Step 1 每次必须 |
| `references/index.md` | 规则数量和索引 | Step 1 每次必须 |
| `references/eslint--*.md` | ESLint 单条规则详情 | Step 1 按需 |
| `references/stylelint--*.md` | Stylelint 单条规则详情 | Step 1 按需 |
| `references/ts-error-codes.md` | TS 错误代码目录 | Step 4 |
