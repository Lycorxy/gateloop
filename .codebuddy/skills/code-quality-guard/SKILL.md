---
name: code-quality-guard
description: >
    代码质量管控技能，三个强制任务：提取规则（检测+强制生成）→ 注入上下文（给代码生成）→
    代码验证自动修复（到0错误为止，不让用户手动修）。
    覆盖 ESLint + Prettier + Stylelint + TypeScript 四大工具闭环。
    由 ADS harness 驱动，规则由引擎 reads + rulesInline 内联。
    触发词：代码规范、lint检查、ESLint、Stylelint、Prettier、格式化、修复lint、
    类型检查、tsc、ts错误、初始化规则、规则知识库，或用户要求检查/修复/格式化代码时。
    禁止用于：从零开始编写新业务逻辑、仅回答语法问题、
    进行架构设计、审查非代码文档（应使用 code-review-check）。
version: 12.0.0
dependencies: []
conflict-with: [code-review-check]
allowed-tools: [read_file, write_file, replace_in_file, search_content, search_file, execute_command, list_dir]
max-token: 3000
---

# Code Quality Guard v12 — ADS Harness 驱动的三任务强制执行器

> **三个任务，强制执行，不允许跳过，不让用户手动修复：**
> 1. **提取规则** — 检测 `references/references/` 是否已生成，没有就强制生成
> 2. **注入上下文** — 把规则注入给代码生成，让生成的代码准确
> 3. **代码验证+自动修复** — 验证 → 输出错误 → 自动修复 → 再验证，循环到 0 错误
>
> v12 核心变更：由 ADS harness 驱动，不再依赖 specflow-rules-engine。
> 规则由 ADS reads + rulesInline 内联，门禁由 ADS verify exit code 强制。

## ADS Harness 驱动模式

```
传统模式（v11 及之前）                 ADS Harness 模式（v12）
──────────────────────                ──────────────────────────
use_skill(specflow-rules-engine)  →   ADS reads → rulesInline 内联 RULE.mdc
门禁协议（模型自觉 Gate 2/Step5/6）→   ADS code anchor 引擎驱动
模型自报"PASS/FAIL"               →   ADS verify exit code 判定
状态在模型脑子里                   →   anchor-state.json 引擎唯一写入
中断手动扫描                       →   nut ads status 随时恢复
npx nut-lint                      →   npx nut lint（命令统一）
```

### 被 frontend-codegen ADS harness 调用时的对应关系

```
frontend-codegen anchor "code"   →  本 skill 任务1（前置：规则提取）+ 任务2（规则内联）+ 任务3（验证修复闭环）
  引擎验证：tsc + lint exit code（exit 0 才推进；stylelint 按需触发，仅项目有配置时跑）
  引擎 reads：RULE.mdc → rulesInline 内联铁律 0-9
  review 分工：本 skill 纯收敛型（tsc/lint exit code 判定），不配 review；
             主观质量评审由 frontend-codegen code anchor 的 review 负责（6 项 model）
```

### 模型只做三件事

1. **读指令** — rulesInline（已内联 RULE.mdc 铁律）+ 按需 read references/
2. **执行三任务** — 任务1提取 → 任务2注入 → 任务3验证修复
3. **推进** — 完成后调 `nut ads next`，引擎强制验证

⚠️ **不要自己声称"验证通过"**，引擎会重跑 tsc + lint + build，exit code 说了算。

---

## 🔴 防遗漏三层锁（每轮必做）

> **不读完所有文件 = 没做验证。不比较文件总数 = 假装完成。**

### 🔒 锁1：目录入口必须枚举

当任务目标是**目录**（非单个文件）时，**在调用任何 read_lints 之前**，必须：

```
① list_dir <目录> → 记下所有 .ts/.tsx/.scss 文件数 = N
② 逐个 read_lints <每个文件> → 逐个收集结果
③ 验证：已 read_lints 文件数 == N？
   ├─ 是 → 进入锁2
   └─ 否 → ❌ 立即输出 "⚠️ 仅验证了 {M}/{N} 个文件" → 补全 → 回到①
```

**🔴 禁止 read_lints(<目录>) — 这个调用对目录返回的 0 不可信（IDE LSP 不触发目录级诊断）。**

### 🔒 锁2：数量匹配

```
已验证文件数 NVERIFIED = 每一个 read_lints 调用计 1
文件总数 N = list_dir 枚举的 .ts/.tsx/.scss 数

NVERIFIED ≠ N → ❌ 不可交付 → 必须补全
NVERIFIED == N → ✅ 进入锁3
```

### 🔒 锁3：交付前播报

必须输出完整清单方可交付：
```
🗂️ 全文件验证清单：
  [✅] types.ts          (0)
  [✅] utils.ts          (0)
  [✅] hook.ts           (0)
  ...
  — {已文件数}/{总文件数} —
```

**未输出此清单 = 未完成 = 返回锁1。**

---

## 🔴 修复铁流程（不可绕过）

```
【STEP 0: 文件枚举（不可跳过·由防遗漏三层锁强制执行）】
  对目录路径：必须先用 list_dir 或 search_file 枚举所有 *.tsx/*.ts/*.scss 文件
  对单个文件路径：直接进入 STEP 1

  🔴 禁止：read_lints 给目录路径直接检查（IDE lint 对目录返回 0 是假的）
批量修复 + 批量验证（非逐文件）：

  🔴 禁止逐文件验证（慢 + CLIXML 噪声 N 倍）
  🔴 禁止：最后一次 lint 只检查修改的文件（必须检查全部文件）

① npx nut lint fix "src/目录名" --write       批量自动修复

② npx nut lint run "src/目录名"               批量验证
   （或 read_lints <file> 用于 IDE 诊断，但最终以 npx nut lint run 为准）

③ exit=0 → 完成

④ exit≠0 → 错误分类，同类批量修：
┌──────────────────────────────────────────────────┐
│ 🔴 关键规则：不能逐行修！必须看全文件依赖！        │
│                                                  │
│ 修改接口/类型定义 → 必须搜索该类型的所有引用       │
│ 修改函数参数类型   → 必须检查函数体内所有属性访问   │
│ 添加 import/export → 必须检查文件内所有使用处      │
│ 重命名标识符       → 必须一个一个精准 replace      │
│                                                  │
│ 禁止：                                            │
│  ✗ 只读报错行的上下文、不看全文件                   │
│  ✗ 修改定义不查引用                                │
│  ✗ replace_all（精准逐个 rename，避免二次命中）       │
│  ✗ 命令加 2>&1 | Select-Object（项目已处理输出）    │
└──────────────────────────────────────────────────┘

⑤ 同一类错误批量 replace，每个 replace 前确认不会破坏上下文

⑥ npx nut lint fix <file> --write

⑦ npx nut lint run <file> 确认错误数减少

⑧ 若错误数增 → 回滚上批修，阅读全文件重新计划

⑨ 若错误数减 → 回到 ③

🔴 圈复杂度拆分后必须递归验证：
   拆分函数 A → 产生子函数 B/C/D → 必须重新 nut lint run
   确认 B/C/D 复杂度也 ≤ 10（拆 A 可能导致 B 又超标）。
   禁止：只验证 A 降下来了就交付。

🔴 tsc 通过 ≠ lint 通过：
   tsc --noEmit 只查 TS 类型错误
   nut lint run 查 Prettier 格式化 + ESLint 规则 + 圈复杂度
   两者是独立验证，必须都跑，缺一不可。
```

---

## 🛑 入口守卫（不可绕过·不允许跳过）

```
🔴 第一条：读完所有文件再动手 — 详见上方「防遗漏三层锁」

本 Skill 只有三个任务，每个必须执行到底：

  ✗ 不允许跳过任务1 — 规则未就绪，后续验证无依据
  ✗ 不允许跳过任务3 — 验证未通过 = 任务未完成
  ✗ 不允许把错误留给用户手动修复 — 必须自动修复到 0 错误
  ✗ 不允许用 read_lints(<目录>) — 必须逐个文件 read_lints(<文件路径>)
  ✗ 不允许"验证部分文件就说 0 错误" — 必须验证目录下全部文件

total-files == verified-files 是交付硬指标。差一个文件 = 没做完。

【5 轮后处理（v13 新增·地板哲学）】：
  最多 5 轮自动修复循环。第 5 轮仍有错误时：
    ✓ 必须：输出"不可自动修复报告"（每个错误标注分类）
    ✓ 必须：分类标记：
        - 可手动修复（类型守卫/拆分）→ 给修复建议
        - 需设计决策（架构调整）→ 标记 escalated，建议人工介入
        - 规则冲突（ESLint 配置问题）→ 标记 config-issue
    ✗ 不允许：继续硬试超过 5 轮（避免逼出坏拆分）
    ✗ 不允许：第 5 轮后悄悄交付错误代码

  圈复杂度逃生口（与 frontend-codegen 铁律 1 对齐）：
    圈复杂度 11-13 且属"本质复杂"（如状态机 reducer）→
      加 // @complexity-justified: <具体理由> 注释，custom 脚本扫描此注释允许通过
    圈复杂度 > 13 → 必须拆分，无逃生口
```

**核心定位：像一个严格的代码质量工程师，确保每一行代码都符合项目规范，交付时 0 错误。但识别"本质复杂"场景，给予逃生口。**

---

## 何时使用 / 何时不使用

**应该触发：** 代码规范、lint检查、ESLint、Stylelint、Prettier、格式化、修复lint、类型检查、tsc、ts错误、初始化规则、规则知识库、代码生成后交付前验证

**不应触发：** 从零写新功能、纯语法问答、架构决策、审查非代码文档(→code-review-check)

---

## 三任务流程

```
任务1: 提取规则（强制·不可跳过）
  ↓ 检测 references/references/ → 没有？强制 npx nut lint extract + knowledge 生成
任务2: 注入上下文（强制）
  ↓ ADS rulesInline 内联 RULE.mdc + quick-ref.md → 代码生成即受规则约束
任务3: 验证+自动修复闭环（强制·不跳过·不让用户手动）
  ↓ npx nut lint fix --write → npx nut lint run → 有错误？→ 回 fix → 循环到 0 错误
```

---

## 中断与恢复（ADS 引擎驱动）

若执行过程被中断，重新继续时：

1. **查看引擎状态** — `nut ads status <manifest>` 返回当前 anchor + attempt
2. **从断点继续** — 引擎记录了当前进度，无需手动扫描
3. **重做当前阶段** — `nut ads retry <manifest>` 刷新 attemptStartedAt

```
断线恢复：
  nut ads status <manifest>
  → 当前 anchor: code | attempt: 0/8 | nextAction: 继续...

  从断点继续执行任务1-3
  完成后 nut ads next <manifest>
```

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
    npx nut lint extract --verbose
    npx nut lint knowledge --source eslint --rules all --overwrite true --outputDir .codebuddy/skills/code-quality-guard/references
    npx nut lint knowledge --source stylelint --rules all --overwrite true --outputDir .codebuddy/skills/code-quality-guard/references
    生成后重新检测，确认 references/references/ 已有规则文件
```

### 1.3 检测规则变更（已就绪时）

```bash
npx nut lint extract --check
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

### 2.1 ADS rulesInline 内联（ADS 模式）

当被 frontend-codegen ADS harness 调用时，引擎通过 `reads` 读取 RULE.mdc 后内联到 `rulesInline` 字段。铁律 0-7（格式/类型/命名/import/样式/安全/验证清单/防遗漏/修复铁流程）在指令 JSON 中直接可用，无需 `use_skill` 注入。

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
| 发现 eslint-disable | `references/references/eslint--no-disable.md` |
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

> **播报：** `✅ [任务2] 规则注入完成：rulesInline(ADS内联) + quick-ref + {N}个按需文档`

---

## 任务3 — 代码验证 + 自动修复闭环（强制 · 不跳过 · 不让用户手动）

> **核心铁律：验证有错误必须自动修复到 0 错误，不允许留给用户手动修。**
> **ADS verify 阶段会强制重跑 tsc + lint + build，exit 0 才推进。**

### 3.1 自动修复（先跑修复，再验证）

```bash
# 单文件
npx nut lint fix <file_path> --write
# 批量
npx nut lint fix "src/**/*.ts" --write
# 仅 Prettier 格式化（nut 无此子命令，直调 prettier）
npx prettier --write <file_or_pattern>
```

`fix --write` 同时执行：Prettier 格式化 → ESLint 修复 → Stylelint 修复。

### 3.2 验证

```bash
npx nut lint run <file_path>
# 同时运行 Prettier + ESLint + Stylelint + tsc --noEmit
```

### 3.3 修复-验证循环（强制·5 轮后输出报告）

```
第 1 轮: fix --write → run
  ├─ 0 错误 → ✅ 完成，进入 3.4
  └─ 有错误 → 分析错误 → 针对性修复 → 第 2 轮

第 2-5 轮: 重复 fix → run
  ├─ 0 错误 → ✅ 完成
  └─ 有错误 → 继续修复

第 5 轮仍有错误（v13 新增·地板哲学）：
  ✓ 必须：输出"不可自动修复报告"，按 3 类分类：
      ┌──────────────────────────────────────────────────────────┐
      │ 1. 可手动修复（类型守卫/拆分）→ 给修复建议              │
      │ 2. 需设计决策（架构调整）  → 标记 escalated，建议人工介入 │
      │ 3. 规则冲突（ESLint 配置） → 标记 config-issue          │
      └──────────────────────────────────────────────────────────┘
  ✓ 必须：对不可自动修复的圈复杂度（11-13），手动加 // @complexity-justified: 注释
  ✗ 不允许：继续硬试超过 5 轮（避免逼出坏拆分）
  ✗ 不允许：第 5 轮后悄悄交付错误代码

圈复杂度逃生口（11-13 允许声明例外）：
  圈复杂度 ≤ 10：PASS
  圈复杂度 11-13 → 加 // @complexity-justified: <具体理由> 注释
    仅当本质复杂场景可用（状态机 reducer / 配置驱动决策表 / 编译器类逻辑）
  圈复杂度 > 13：必须拆分，无逃生口
```

**错误分类处理：**

| 错误类型 | 处理方式 | 不允许 |
|---------|---------|--------|
| 格式错误（Prettier） | `fix --write` 自动修复 | ✗ 手动 |
| 可自动修复的 ESLint/Stylelint | `fix --write` 自动修复 | ✗ 手动 |
| 不可自动修复的 ESLint（圈复杂度 11-13） | 加 `// @complexity-justified:` 注释声明例外（仅本质复杂） | ✗ 留给用户 |
| 不可自动修复的 ESLint（圈复杂度 >13） | 必须手动拆分函数 → 重新验证 | ✗ 留给用户 |
| TS 类型错误 | 按优先级修复（TS2304→2345→2532→7006→6133）→ 重新验证 | ✗ 留给用户 |
| eslint-disable 注释 | 整体思考重构/拆分/类型修复 → 删除注释从根本解决 → 重新验证 | ✗ 保留 disable |
| 5 轮后仍失败（需设计决策） | 输出报告 + 标记 escalated + 建议人工介入 | ✗ 继续硬试 |
| 5 轮后仍失败（规则冲突） | 输出报告 + 标记 config-issue + 建议检查 ESLint 配置 | ✗ 继续硬试 |

**TS 类型修复优先级：**
TS2304(缺少导入) → TS2345/TS2322(参数类型) → TS2532(undefined) → TS7006(隐式any) → TS6133(未使用)

### 3.4 完成判定

```
□ Prettier: 0 格式问题
□ ESLint: 0 错误
□ Stylelint: 0 错误（仅项目有 stylelint 配置时检查，无配置时跳过）
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
| `npx nut lint extract --verbose` | 提取项目规则 | 任务1 |
| `npx nut lint extract --check` | 检测规则变更 | 任务1 |
| `npx nut lint knowledge --source {eslint/stylelint} --rules all --overwrite true --outputDir {dir}` | 生成规则知识库 | 任务1 |
| `npx nut lint fix <file> --write` | Prettier+ESLint+Stylelint 自动修复 | 任务3 |
| `npx nut lint run <file>` | 验证(Prettier+ESLint+Stylelint+tsc)，run 本身就是检查 | 任务3 |
| `npx prettier --write <file>` | 仅 Prettier 格式化（nut 无 format 子命令，直调 prettier） | 任务3 |
| `npx nut lint config` | 诊断项目配置 | 故障排除 |

---

## 错误处理

| 场景 | 处理 |
|------|------|
| nut lint 未安装 | `npm install -D nut-lint` |
| Prettier/ESLint/Stylelint 未安装 | `npm install -D prettier eslint stylelint` |
| 规则知识库生成失败 | 检查 nut-lint 版本，重试；3次失败上报用户 |
| 5轮修复仍有错误 | 输出"不可自动修复报告"，3 类分类（可手动/需设计决策/规则冲突）→ 标记 escalated 给人工介入 |
| tsc 错误无法自动修复 | 按优先级手动修复类型 → 重新验证 |
| 圈复杂度 11-13 | 评估是否本质复杂（reducer/决策表/编译器）→ 是则加 @complexity-justified 注释 |
| 圈复杂度 >13 | 必须拆分，无逃生口 |

---

## 参考资料

| 文件 | 内容 | 加载方式 |
|------|------|---------|
| `RULE.mdc` | 核心铁律 0-7 | ADS reads → rulesInline 内联 |
| `references/quick-ref.md` | 四工具核心规则速查表 | 任务2 每次必读 |
| `references/references/` | 400+ 单条规则文档（自动生成） | 任务1 检测 + 任务3 按需 |
| `references/ts-error-codes.md` | TS 错误代码修复指南 | 任务3 类型修复 |
| `references/index.md` | 自动生成的规则索引 | nut lint 内部用 |
| `references/rules-data.json` | 自动生成的规则数据 | nut lint 内部用 |
