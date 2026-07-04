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
version: 8.1.0
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
  ✗ 加载 Skill 后用 read_lints 替代 Step 2B/3（npx nut-lint fix/run）
  ✗ 跳过 Step 0 知识库检查
  ✗ 跳过 Step 3 验证（npx nut-lint run）
  ✗ 不播报完成消息

唯一入口是 npx nut-lint 命令族，read_lints 仅用于补充确认。
```

**核心定位：不是"跑一下 lint"，而是"像一个严格的代码质量工程师那样，确保每一行代码都符合项目规范"。**

> 🧠 **设计哲学**：像一个资深的代码质量工程师那样逐步推理——先确认知识库就绪，
> 再按需加载规则，生成/修复代码后必须验证，形成完整闭环。
> 每一步都有约束和验证，不通过不继续。

核心目标排序：**规则准确 > 零遗漏 > 自动修复优先 > 最小改动**

---

## 何时使用 / 何时不使用

**应该触发：**

- "代码规范"、"lint检查"、"ESLint"、"Stylelint"、"代码检查"
- "格式化"、"修复lint"、"类型检查"、"tsc"、"ts错误"
- "初始化规则"、"规则知识库"
- 用户要求检查/修复/格式化代码时
- 代码生成后交付前验证

**不应触发：**

- 从零开始编写新功能（没有现有代码可检查）
- 纯语法问答（"如何编写 for 循环"）
- 架构或技术选型决策
- 审查非代码文档（应使用 code-review-check）

---

## 质量管控流程总览

```
┌─────────────────────────────────────────────────────────┐
│  🔒 Step 0: 知识库就绪检查 + 规则变更检测（强制·不可跳过）│
│  ↓ nut-lint extract --check（检测规则是否变更）          │
│  ↓ 有变更/不存在 → nut-lint extract + knowledge 初始化  │
│  ↓ 无变更 → 跳过初始化，进入验证                        │
│  ↓ 播报完成 → 后续步骤受项目规则约束                    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 1: 加载规则到上下文 [中自由度·强制]               │
│  ↓ quick-ref.md + index.md（每次必须）                  │
│  ↓ 按需读取 references/（懒加载）                      │
└─────────────────────────────────────────────────────────┘
                          ↓
          ┌───────────────┴───────────────┐
          ↓                               ↓
┌─────────────────────┐     ┌─────────────────────────┐
│  Step 2A: 按规则生成 │     │  Step 2B: 格式化与修复   │
│  新代码 [高自由度]   │     │  现有代码 [低自由度]     │
│  ↓ 生成前自检       │     │  ↓ nut-lint fix --write │
└─────────────────────┘     └─────────────────────────┘
          ↓                               ↓
          └───────────────┬───────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 3: 验证 [低自由度·强制]                           │
│  ↓ nut-lint run → ESLint + Stylelint + tsc             │
│  ↓ ⚠️ 不通过 → 自动修复(最多3轮) → AI修复 → 上报      │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 4: TypeScript 类型修复 [中自由度·按需]            │
│  ↓ tsc 错误 → AI 辅助诊断 + 修复 → 重新验证           │
│  ↓ ⚠️ 无 tsc 错误则跳过（声明理由）                    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 5: 输出质量报告 [低自由度·强制]                   │
│  ↓ 标准格式报告 + 交付清单                              │
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

## 🔒 Step 0 — 知识库就绪检查 + 规则变更检测（强制 · 不可跳过）

> **eslint-code-quality 不依赖 specflow-rules-engine**，因为它有独立的规则知识库系统。
> 知识库 = 项目实际 ESLint/Stylelint/TS 配置提取的规则文档。
> **规则变更检测是强制子步骤**：任何 ESLint/Stylelint/TS 配置变更都必须触发知识库重新生成。

### 0.1 检测规则变更（最高优先级 · 必须最先执行）

```
【🔒 不可变约束】
  规则变更检测必须在知识库检查之前执行。
  检测到变更必须重新初始化，无豁免。
  未检测就跳过 = 可能用过时规则检查代码 = 严重违规。
```

```bash
# 检测项目 ESLint/Stylelint/TS 配置是否有变更
# npx nut-lint extract --check 对比配置文件修改时间 vs 知识库生成时间
npx nut-lint extract --check
```

**变更检测逻辑：**

```
npx nut-lint extract --check
  ├─ 知识库不存在 → 进入 0.2 执行初始化
  ├─ 配置有变更（.eslintrc* / .stylelintrc* / tsconfig.json 比知识库新）
  │   └─ ⚠️ 播报："检测到规则变更，需要重新生成知识库"
  │   └─ 进入 0.2 执行重新初始化（--overwrite true）
  └─ 无变更 → ⏭️ 跳过初始化，进入 0.3 确认就绪
```

### 0.2 执行知识库初始化/更新

```bash
# 步骤 1: 提取项目规则
npx nut-lint extract --verbose

# 步骤 2: 生成知识库（--overwrite true 确保规则变更时全量更新）
# 知识库统一存放在 skill 内部的 references/ 目录
npx nut-lint knowledge --source eslint --rules all --overwrite true --outputDir .codebuddy/skills/eslint-code-quality/references
npx nut-lint knowledge --source stylelint --rules all --overwrite true --outputDir .codebuddy/skills/eslint-code-quality/references
```

### 0.3 验证知识库就绪

```typescript
// 验证知识库文件存在且非空（知识库在 skill 内部的 references/ 目录）
const SKILL_REF = '.codebuddy/skills/eslint-code-quality/references';
read_file(`${SKILL_REF}/index.md`);
read_file(`${SKILL_REF}/quick-ref.md`);
list_dir(SKILL_REF);
```

**验证清单：**

```
□ npx nut-lint extract --check 已执行（规则变更检测）
□ index.md 存在且非空（{N} 条规则）
□ quick-ref.md 存在且非空
□ references/ 目录包含 .md 文件（{N} 个详细文档）
□ 知识库生成时间 ≥ 所有配置文件修改时间（无过期风险）
```

> 完成播报：`"✅ Step 0 知识库就绪：{N}条规则 / {N}个参考文档 / 规则变更检测{有/无}变更"` — 未播报不得进入 Step 1。
>
> 🔒 **强制约束**：此步骤不可跳过。没有知识库就执行质量管控 = 无依据检查。未检测规则变更 = 可能用过期规则。
>
> ⏭️ **唯一可跳过条件**：同一次会话中已执行过 Step 0 且播报过完成消息。
> 跳过必须声明：`⏭️ [跳过] Step 0 知识库检查 | 理由：同会话已确认就绪且规则无变更 | 风险：无`

---

## Step 1 — 加载规则到上下文 [中自由度 · 强制]

> **渐进式懒加载**，不一次性加载所有规则文档。

### 1.1 每次必须读取（强制，小文件）

```typescript
const REF = '.codebuddy/skills/eslint-code-quality/references';
read_file(`${REF}/quick-ref.md`); // 核心规则摘要（约50行）
read_file(`${REF}/index.md`); // 规则数量和索引（约30行）
```

### 1.2 按需读取（仅在相关时加载）

```typescript
// 处理特定问题时，读取对应的详细文档（均在 skill 内部 references/）
// 例：处理分号问题
read_file('.codebuddy/skills/eslint-code-quality/references/eslint--semi.md');
// 例：处理复杂度
read_file('.codebuddy/skills/eslint-code-quality/references/eslint--complexity.md');
// 例：处理类型错误
read_file('.codebuddy/skills/eslint-code-quality/references/ts-error-codes.md');
```

**规则**：永远不要一次加载所有 references/ 文件。仅加载当前任务所需的。

> 完成播报：`"✅ Step 1 规则加载完成：quick-ref + index + {N}个按需文档"` — 未播报不得进入 Step 2。
>
> 🔒 **强制约束**：此步骤不可跳过。未加载规则就生成/检查代码 = 无依据。

---

## Step 2A — 按规则生成代码 [高自由度]

> 当任务是**编写新代码**时走此路径。

### 2A.1 生成流程

1. 读取 `quick-ref.md` 获取规则摘要
2. 按照强制规则表起草代码
3. 对于特定领域的规则，按需读取相关参考文档
4. 输出干净的代码，能够首次就通过 ESLint + tsc --noEmit

### 2A.2 写入前自检（强制）

```
□ 全部使用单引号，无分号
□ 所有函数都有显式返回类型
□ 无 `any` 类型
□ 所有比较都使用 `===`
□ 无未使用的导入/变量
□ 无 `console.log` 语句
□ 无 `// eslint-disable-next-line` 或 `/* eslint-disable */`（有问题应从根本上修复）
□ 圈复杂度 ≤ 10（函数过于复杂应拆分）
```

> 完成播报：`"✅ Step 2A 代码生成完成：{文件名}"` — 未播报不得进入 Step 3。
>
> 🔒 **强制约束**：自检不通过不得写入文件。

---

## Step 2B — 格式化与修复 [低自由度]

> 当任务是**修复/格式化现有代码**时走此路径。

### 2B.1 单文件修复

```bash
npx nut-lint fix <file_path> --write
```

运行顺序：Prettier → ESLint → Stylelint（自动路由）

### 2B.2 多文件 / 批量

```bash
npx nut-lint fix <file1> <file2> <file3> --wrap
# 或
npx nut-lint format-and-fix "src/**/*.ts"
```

### 2B.3 错误处理

详见 `references/troubleshooting.md`，按需读取。

> 完成播报：`"✅ Step 2B 格式化修复完成：{N}个文件 / {N}个问题已修复"` — 未播报不得进入 Step 3。
>
> 🔒 **强制约束**：此步骤不可跳过（除非走 Step 2A 路径）。
> 跳过声明：`⏭️ [跳过] Step 2B 格式化修复 | 理由：走Step 2A生成路径 | 风险：无`

---

## Step 3 — 验证 [低自由度 · 强制]

> **修复后必须验证。** 这是一个反馈循环，不是一次性操作。

### 3.1 运行验证

```bash
npx nut-lint run <file_path>
```

同时运行：ESLint + Stylelint + tsc --noEmit

### 3.2 验证反馈循环

```
运行验证
  ↓
全部清除？（0 错误，0 警告）
  ├─ 是 → 进入 Step 5 输出报告
  │
  └─ 否 → 分类剩余问题
           ├─ 可自动修复？ → 返回 Step 2B（最多 3 轮）
           │   └─ 3 轮后仍失败？ → 输出错误摘要，上报给用户
           │
           └─ 不可自动修复（逻辑错误、TS 错误）？ → 进入 Step 4
```

### 3.3 验证清单

```
□ ESLint 通过（0 错误，警告可接受）
□ Stylelint 通过（如果涉及 CSS）
□ tsc --noEmit 通过（0 个类型错误）
□ 自动修复后文件仍可读
□ 自动修复没有意外的更改
□ 无 eslint-disable 注释（// eslint-disable-next-line 或 /* eslint-disable */）
□ 圈复杂度 ≤ 10（所有函数）
```

> 完成播报：`"✅ Step 3 验证通过：ESLint✅ Stylelint✅ tsc✅"` — 未通过不得交付。
>
> 🔒 **强制约束**：此步骤不可跳过。跳过验证 = 违规。

---

## Step 4 — TypeScript 类型修复 [中自由度 · 按需]

> **仅当 Step 3 检测到 tsc 错误时才执行。** 无 tsc 错误则跳过。

### 4.1 检测类型错误

```bash
npx nut-lint run <file_or_pattern> --source typescript
# 或
npx tsc --noEmit --pretty false
```

### 4.2 TS 错误修复参考

详见 `references/ts-error-codes.md`（按需读取，不预加载全量）。

### 4.3 修复策略

```
TS 错误
├─ 明显的 1 行修复？ → 直接应用
├─ 更深层类型问题？
│   ├─ 重构风险 > 收益 → TODO 注解，告知用户
│   └─ 局部问题 → 针对性修复
└─ 修复后 → 重新运行 tsc --noEmit 验证
    └─ 引入新错误？ → 连锁修复
```

### 4.4 修复优先级

1. 缺少导入（TS2304）— 解锁后续类型解析
2. 错误参数类型（TS2345、TS2322）
3. undefined/可空（TS2532、TS18046）
4. 隐式 any（TS7006、TS7034）
5. 未使用声明（TS6133、TS6138）

> 完成播报：`"✅ Step 4 类型修复完成：{N}个错误已修复"` — 修复后必须回到 Step 3 验证。
>
> 🔒 **强制约束**：有 tsc 错误时此步骤不可跳过。
>
> ⏭️ **可跳过条件**：Step 3 验证无 tsc 错误。
> 跳过声明：`⏭️ [跳过] Step 4 类型修复 | 理由：tsc验证0错误 | 风险：无`

---

## Step 5 — 输出质量报告 [低自由度 · 强制]

> **每次操作结束后必须输出标准格式的质量报告。**

### 5.1 报告格式

```markdown
## 代码质量报告

**目标：** `<file_path or pattern>`
**工具：** ESLint + Stylelint + TypeScript

### 摘要

| 工具       | 状态  | 错误 | 警告 | 可修复 |
| ---------- | ----- | ---- | ---- | ------ |
| ESLint     | ✅/❌ | N    | N    | N      |
| Stylelint  | ✅/❌ | N    | N    | N      |
| TypeScript | ✅/❌ | N    | -    | -      |

### 已执行操作

- Prettier 格式化：N 个文件
- ESLint 修复：N 个问题
- 手动修复（AI）：N 个问题
- 剩余供用户审查：N 个问题

### 交付清单

- [ ] 知识库已初始化
- [ ] 代码遵循所有强制规则
- [ ] npx nut-lint fix 已运行
- [ ] npx nut-lint run 显示 0 错误
- [ ] tsc --noEmit 显示 0 类型错误
- [ ] 自动修复无意外更改
- [ ] 无 eslint-disable 注释
- [ ] 圈复杂度 ≤ 10
```

> 完成播报：`"✅ Step 5 质量报告输出完成"` — 未播报不得结束。
>
> 🔒 **强制约束**：此步骤不可跳过。无报告 = 未完成。

---

## 命令参考

| 命令                                                    | 功能                       | 使用时机      |
| ------------------------------------------------------- | -------------------------- | ------------- |
| `npx nut-lint extract --verbose`                            | 提取项目规则               | Step 0 初始化 |
| `npx nut-lint knowledge --overwrite true --outputDir <dir>` | 生成知识库                 | Step 0 初始化 |
| `npx nut-lint fix <file> --write`                           | 格式化+lint修复            | Step 2B       |
| `npx nut-lint fix "pattern" --write`                        | 批量修复                   | Step 2B       |
| `npx nut-lint format-and-fix <pattern>`                     | Prettier格式化+lint修复    | Step 2B 批量  |
| `npx nut-lint run <file>`                                   | 验证(ESLint+Stylelint+tsc) | Step 3        |
| `npx nut-lint run <pattern> --source typescript`            | 仅TS类型检查               | Step 4        |
| `npx nut-lint config`                                       | 诊断项目配置               | 故障排除      |

---

## 参考资料

| 文件                               | 内容                        | 加载时机                    |
| ---------------------------------- | --------------------------- | --------------------------- |
| `quick-ref.md`                     | 核心规则摘要（约50行）      | Step 1 每次必须             |
| `index.md`                         | 规则数量和索引（约30行）    | Step 1 每次必须             |
| `references/eslint--*.md`          | ESLint 单条规则详情         | Step 1 按需加载             |
| `references/eslint--no-disable.md` | eslint-disable 禁用规则详情 | Step 2B 修复/Step 3 验证时  |
| `references/eslint--complexity.md` | 圈复杂度限制规则详情        | Step 2A 生成/Step 2B 修复时 |
| `references/stylelint--*.md`       | Stylelint 单条规则详情      | Step 1 按需加载             |
| `references/ts-error-codes.md`     | TS 错误代码目录             | Step 4 类型修复时           |
