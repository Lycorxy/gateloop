---
name: frontend-codegen
description: >
  前端代码生成唯一入口。由 ADS harness 驱动，编排 frontend-design（设计）+
  code-quality-guard（规则+验证）+ css-style-writer（样式）。
  引擎强制验证（exit code），模型无法跳步或谎报通过。
  规则由 ADS reads + rulesInline 内联，不依赖 specflow-rules-engine。
  通用独立 skill，不绑定特定设计稿来源。
version: 12.1.0
dependencies: []
allowed-tools:
  [read_file, write_file, replace_in_file, search_content, search_file, execute_command, list_dir]
max-token: 8000
---

# Frontend Codegen v13 — ADS Harness 驱动（3 阶段 + 客观输入防伪）

> v13 核心变更：新增 inventory anchor（客观输入先行 + 集合闭包防伪）。
> 脚本枚举违规文件 → design 必须覆盖 → code 末尾重跑断言清零，模型无法"只处理部分文件糊弄过关"。
> v12 核心变更：从 4 anchor 精简为 2 anchor（design → code），消除验证冗余。
> rules anchor 已删除（规则注入由 ADS reads 自动完成）。
> verify anchor 已合并到 code anchor（避免 tsc+lint 重跑两遍）。

## 架构演进

```
v11（4 anchor）           v12（2 anchor）           v13（3 anchor + 防伪）
─────────────            ─────────────            ─────────────────────
design→rules→code→verify  design → code            inventory → design → code
  ↑    ↑    ↑    ↑          ↑      ↑                 ↑        ↑      ↑
 4阶段 冗余  编码 重跑      设计   编码+验证          客观清单  覆盖   重跑清零
       anchor      tsc+lint        一步到位          (脚本)   (闭包)  (闭环)
```

**为什么删除 rules anchor？**
规则注入由 ADS `reads` → `rulesInline` 自动完成，不需要一个 anchor 来"检查 quick-ref.md 是否存在"。规则提取是一次性操作，合并到 code anchor 的前置步骤即可。

**为什么合并 verify 到 code？**
code anchor 的 verify 已经跑了 tsc+lint。verify anchor 又跑 tsc+lint+build，tsc+lint 完全重复。合并后 code anchor 的 verify 直接是 tsc+lint+build，一步到位（stylelint 按需触发，仅项目有配置时跑）。

---

## ADS Harness 驱动模式

```
用户调用 nut ads init → 引擎返回 inventory anchor 指令
  ↓
inventory anchor: 脚本产出 inventory.json（违规清单）→ autoEmit → nut ads next → 引擎校验产物+emit
  ↓
design anchor: 消费 inventory → 设计 + coverage(覆盖violations) → emit frontendPlan → nut ads next → 引擎 schema + verify-coverage 集合闭包
  ↓
code anchor: 规则就绪 → 编码(处理coverage.targets) → fix --write → nut ads next → 引擎跑 tsc+lint+build + verify-completion 重跑清零
  ↓
done
```

### 启动流程

```bash
MANIFEST=.codebuddy/skills/frontend-codegen/anchor.config.json

# 1. 初始化任务
nut ads init $MANIFEST --task "实现用户列表页"

# 2. 引擎返回 inventory anchor 指令（客观，模型不参与判断）：
#    - produceScripts 跑 inventory.mjs 产出 inventory.json（违规清单）
#    - autoEmit 自动产出 inventory artifact
#    - 模型无需操作，直接推进：
nut ads next $MANIFEST

# 3. 引擎校验 inventory 产出 + emit → 推进到 design anchor：
#    - brief: 设计目标（coverage 必须覆盖 inventory.violations）
#    - rulesInline: frontend-design/RULE.mdc 已内联
#    - artifactsInline: inventory（违规清单）已内联
#    - produces: .specflow/context/current.json
#    - emits: frontendPlan
#
#    模型执行设计（coverage.targets 覆盖全部 violations）→ 写 current.json → emit → 推进：
nut ads next $MANIFEST

# 4. 引擎 schema 校验 frontendPlan（4 张表 + coverage）+ verify-coverage 集合闭包：
#    通过 → 推进到 code anchor
#
# 5. code anchor 指令：
#    - rulesInline: frontend-codegen/RULE.mdc + css-style-writer/RULE.mdc + code-quality-guard/RULE.mdc 已内联
#    - artifactsInline: frontendPlan 已内联
#    - requiresSubtasks: true
#
#    模型执行：规则就绪 → 拆子任务 → 编码（处理 coverage.targets）→ fix --write → 推进：
nut ads next $MANIFEST

# 6. 引擎强制重跑 tsc + lint + build + verify-completion（重跑 inventory 断言清零）：
#    全绿 → done=true，任务完成
#    有错误 → 返回 errors，模型修复后重新 nut ads next
```

### 3 个 Anchor

| Anchor | 职责 | 引擎验证 | 数据流 |
|--------|------|---------|--------|
| **inventory** | 脚本产出违规清单（客观，模型不参与判断） | produceScripts 重跑覆盖 + producesFresh + modelWritable:false | emits: `inventory`（autoEmit 自动产出） |
| **design** | 技术设计 + 架构精判 + coverage 覆盖 violations | schema 校验 frontendPlan 4 张表 + coverage + architectureReview.verdicts + verify-coverage 集合闭包 + producesFresh | consumes: `inventory`, emits: `frontendPlan` + `architectureReview` |
| **code** | 规则就绪 + 编码实现（处理 coverage.targets）+ 验证交付 | tsc + lint + build + style-crosscheck + check-naming + verify-completion 重跑清零 + producesFresh + **review 主观质量评审（9 项 model：6 代码质量 + 3 样式质量，逐条 verdict+evidence → code-review.json）** | consumes: `frontendPlan` + `architectureReview`, requiresSubtasks |

### 模型在每阶段只做三件事

1. **读指令** — `rulesInline`（已内联规则）+ `artifactsInline`（已内联上游数据）
2. **执行核心逻辑** — 按规则和数据做事，产出文件 + emit artifact
3. **推进** — 调 `nut ads next`，引擎强制验证，通过才推进

⚠️ **不要自己声称"验证通过"**，引擎会重跑验证，exit code 说了算。
⚠️ **连续失败超 maxAttempts → 熔断**，需人工介入或 `nut ads retry`。

---

## 🔴 五条铁律（编码时必须遵守，由 RULE.mdc 约束）

### 铁律 1：代码生成 = 检测 + 修复 + 0错误

```
ADS code anchor verify 强制执行 tsc + lint + build（stylelint 按需触发，仅项目有配置时跑），exit 0 才推进。
禁止：留 ERROR 交付 / 把检测当可选。

🔴 tsc 通过 ≠ lint 通过：
   tsc --noEmit 只查 TS 类型错误（TS2304/TS2345/TS2532 等）
   nut lint run 查 Prettier 格式化 + ESLint 规则 + 圈复杂度
   两者是独立验证，必须都跑，缺一不可。
   典型偷懒：只跑 tsc（快）跳过 nut lint run（慢）→ prettier + 圈复杂度全部漏掉。
```

### 铁律 2：目录输入批量验证（禁止逐文件）

```
输入目录 → 批量协议（非逐文件）：
  Phase 1 枚举：list_dir 或 search_file 确认文件清单
  Phase 2 批量验证：npx nut lint run "src/目录名"（一次跑完所有文件）
  Phase 3 批量修复：npx nut lint fix "src/目录名" --write
  Phase 4 全验：npx tsc --noEmit
           + npx nut lint run "src/目录名" 全 ✅

命令前缀说明：
  npx nut <子命令>   统一前缀，跨端兼容
  npx nut lint run <pattern>   验证（批量，1 次跑完目录）
  npx tsc --noEmit    类型检查（直接 npx tsc）

🔴 禁止逐文件验证（慢 + CLIXML 噪声 N 倍）
   错误做法：npx nut lint run src/a.ts && npx nut lint run src/b.ts ...
   正确做法：npx nut lint run "src/lint"（1 次跑完）
```

### 铁律 3：文件规模与圈复杂度（地板 + 逃生口）

```
ADS code anchor verify 强制执行 tsc + lint + build + fileSize + prettier（stylelint 按需触发），exit 0 才推进。

圈复杂度规则（地板，带逃生口）：
  圈复杂度 ≤ 10 / 函数 ≤ 25 行 / 文件 ≤ 360 行 → PASS
  圈复杂度 11-13 → 触发"拆分建议"，模型可选：
    A. 拆分（默认推荐）
    B. 加 // @complexity-justified: <具体理由> 注释声明例外
       （仅当本质复杂，如状态机 reducer / 配置驱动决策表 / 编译器类逻辑）
  圈复杂度 > 13 / 函数 > 25 行 / 文件 > 360 行 → 必须拆分，无逃生口

🔴 禁止：留 ERROR 交付 / 把检测当可选。
🔴 tsc 通过 ≠ lint 通过：
   tsc --noEmit 只查 TS 类型错误（TS2304/TS2345/TS2532 等）
   nut lint run 查 Prettier 格式化 + ESLint 规则 + 圈复杂度
   两者是独立验证，必须都跑，缺一不可。
   典型偷懒：只跑 tsc（快）跳过 nut lint run（慢）→ prettier + 圈复杂度全部漏掉。
🔴 逃生口注释格式严格：// @complexity-justified: <具体理由>
🔴 逃生口滥用（如所有函数都加）= 设计问题，需重新审视
```

### 铁律 4：设计约束（来自 frontend-design · 客观地板 + 主观精判 + 完备性）

```
⚠️ 具体约束来自 design anchor 产出的 frontendPlan + architectureReview（artifactsInline 内联）。
   不读设计产物就套用通用规则 = 违规。

【客观地板】（脚本 custom 校验，违反 = code anchor verify FAIL）：
  4.1 组件内不得有 fetch/axios（正则扫 index.tsx）
  4.2 组件内不得有 >5 行数据加工（行数统计）
  4.3 useState ≥ 8 个未做 stateClassification → FAIL
  4.4 SCSS-TSX 类名不一致 → FAIL（style-crosscheck 度量）
  4.5 subtask 未从 plan 派生 → 模型自判（读 subtask 列表和 plan 对比）

【主观精判】（脚本度量 → 模型精判 → architectureReview artifact）：
  4.6 design 阶段跑 metric architecture，拿到候选问题清单
  4.7 模型读 architecture-metrics-checklist.md，逐条精判（真问题/误报/不确定）
  4.8 产出 architectureReview.verdicts，每条 fact 一个 verdict + reason
  4.9 verdict=真问题 → 必须在 splitDecisions 声明修正计划
  code 阶段 consumes architectureReview，编码时遵循修正计划

【完备性】（schema 字段存在校验）：
  4.10 frontendPlan 必须含 4 张表 + edgeCases + errorStates
  4.11 architectureReview 必须含 verdicts 数组，且非空
  4.12 突破默认布局需声明 layoutRationale
  4.13 触发拆分提示需声明 splitDecisions

🔴 客观地板 FAIL → 必须修复
🔴 architectureReview 缺失/verdicts 为空 = 未精判 FAIL
🔴 verdict=真问题 但 splitDecisions 无对应修正计划 = 不一致 FAIL
🔴 完备性 FAIL → 补字段后重新 next
```

### 铁律 5：coverage 闭包（v13 新增·防漏文件）

```
inventory anchor 脚本客观枚举违规文件，design 必须覆盖，code 末尾重跑清零。
模型无法"只处理部分文件糊弄过关"——每一步都有脚本客观断言。

🔴 frontendPlan.coverage 缺失 = schema FAIL
🔴 coverage.inventoryHash ≠ inventory.hash = 用旧数据 FAIL（verify-coverage）
🔴 inventory.violations - coverage.targets - coverage.excluded.path ≠ ∅ = 漏处理 FAIL（verify-coverage）
🔴 coverage.excluded 项无 reason（<10字符）= 甩锅 FAIL（verify-coverage）
🔴 code 末尾重跑 inventory 仍有违规且不在 excluded = 未真正消除 FAIL（verify-completion）
```

---

### 铁律 6：主观质量评审（v14 新增·确定走脚本，不确定走模型）

```
code anchor verify 分两层：
  客观层（脚本·exit code）：tsc/lint/build/check-naming/style-crosscheck/verify-completion/fileSize/prettier
  主观层（review·模型逐条）：6 项 model verdict+evidence → .specflow/context/code-review.json

分工原则（通用引擎机制，checklist 由本 skill 注入）：
  确定项 → 脚本（custom/tsc/lint）exit code 判，模型无法伪造
  不确定项 → review.model 逐条 verdict+evidence，脚本卡形式不卡内容

🔴 review 产物 code-review.json 缺失 = FAIL
🔴 漏评任一 checklist 项 / evidence 无行号符号引用（空话）= FAIL
🔴 blocking 项 verdict=fail = 禁止推进，必须修复

文件名验证分工（check-naming 不是 ESLint，是独立脚本）：
  check-naming（custom·脚本）查格式：kebab-case/单一导出/Hook命名/组件名对应
  naming-semantics（review·model）查语义：命名是否表意
  两者互补：脚本查格式（确定项），模型查语义（不确定项）。
```

---

## Anchor 执行指南

### Anchor 1: design — 技术设计

**引擎指令包含：**
- `rulesInline`: frontend-design/RULE.mdc（铁律 1-13 已内联）
- `brief`: 产出 frontendPlan（函数归属表/状态分类表/效率审计清单/模块拆分边界）

**执行（按 rulesInline 中的铁律）：**
1. Phase 0 上下文注入：探测项目现状（路由/Store/helpers/Token）
2. Step 1-3：路由/布局/架构决策
3. Step 3.5-3.10：模块化/耦合/红线/兼容/交互/选型
4. Step 3.11：输出函数归属表 + 状态分类表 + 效率审计清单
5. Step 4：ASCII 线框
6. 写入 `.specflow/context/current.json`（含 frontendPlan）

**产出 artifact：**
```bash
nut ads emit $MANIFEST --key frontendPlan --kind file --path .specflow/context/current.json
```

**推进（引擎校验 schema → 通过推进到 code）：**
```bash
nut ads next $MANIFEST
```

🔴 frontendPlan 必须包含 4 张表：functionOwnership / stateClassification / efficiencyAudit / moduleBoundary
🔴 缺任一张表 → schema 校验 FAIL → 引擎返回 errors → 补齐后重新 next

---

### Anchor 2: code — 编码实现 + 验证交付

**引擎指令包含：**
- `rulesInline`: frontend-codegen/RULE.mdc + css-style-writer/RULE.mdc + code-quality-guard/RULE.mdc（全部已内联）
- `artifactsInline`: frontendPlan（上游 design 阶段产出，已内联）
- `requiresSubtasks`: true（大任务必须先拆子任务）

#### 步骤 1：规则就绪（code-quality-guard 任务1）

```bash
# 检测规则知识库是否存在
list_dir('.codebuddy/skills/code-quality-guard/references/references')

# 不存在 → 强制生成
npx nut lint extract --verbose
npx nut lint knowledge --source eslint --rules all --overwrite true --outputDir .codebuddy/skills/code-quality-guard/references
npx nut lint knowledge --source stylelint --rules all --overwrite true --outputDir .codebuddy/skills/code-quality-guard/references
```

#### 步骤 2：拆子任务（requiresSubtasks 强制）

```bash
# 按组件/模块拆子任务
nut ads subtask-add $MANIFEST --desc "实现列表组件"
nut ads subtask-add $MANIFEST --desc "实现详情组件"
nut ads subtask-add $MANIFEST --desc "实现筛选栏"

# 逐个完成
nut ads subtask-done $MANIFEST --id design-sub-1
```

🔴 子任务未全部完成 → 引擎拒绝推进

#### 步骤 3：消费 frontendPlan 编码

```
按 artifactsInline 中的 frontendPlan 编码：
  - 函数归属表 → 每个函数写到指定文件
  - 状态分类表 → 每个 state 用指定容器
  - 效率审计清单 → useEffect 依赖 / React.memo / useCallback
  - 模块拆分边界 → 每个文件只做规定的事
```

**编码规范（由 rulesInline 中的铁律约束）：**

```
行数：index.tsx ≤ 120行 | hook.ts ≤ 150行 | .module.scss ≤ 200行 | 其他 ≤ 360行
      单函数 ≤ 25行 | 缩进 ≤ 2层 | 圈复杂度 ≤ 10

TypeScript：禁止 any | T[]/Array<T> | === 严格比较 | err instanceof Error
            async 禁止直接传 onClick → () => { void fn(); }
Import：第三方 → @/别名 → ./相对 → .scss 最后

样式（按 css-style-writer 规范，rulesInline 已内联）：
  - 扁平结构（禁止嵌套选择器）
  - CSS 变量 var(--color-xxx)（禁止硬编码）
  - 全状态覆盖（hover/focus/disabled + loading/empty/error）
  - DOM 最小化（伪元素替代装饰 DOM）
  - SCSS ≤ 300 行
```

#### 步骤 4：修复-验证循环（code-quality-guard 任务3）

```bash
# 1. 批量自动修复（不要逐文件）
npx nut lint fix "src/**/*.ts" --write
npx nut lint fix "src/**/*.tsx" --write
npx nut lint fix "src/**/*.module.scss" --write

# 2. 批量验证
npx nut lint run "src/**/*.ts"
npx nut lint run "src/**/*.tsx"
npx nut lint run "src/**/*.module.scss"
```

```
fix --write → run
  ├─ 0 错误 → 进入步骤 5
  └─ 有错误 → read_file 全文理解 → replace_in_file 精准改 → 回 fix
最多 5 轮，仍有错误 → 手动修复不可自动修复项（圈复杂度拆分/类型守卫补全）→ 继续 run
```

#### 步骤 5：推进（引擎跑 tsc + lint + build，exit 0 才完成）

```bash
nut ads next $MANIFEST
```

⚠️ 引擎会**强制重跑** tsc + lint + build（stylelint 按需触发，仅项目有配置时跑），不要自己声称"验证通过"。
⚠️ producesFresh 校验：产物文件 mtime 必须晚于阶段开始时间（防复用旧文件）。
⚠️ 连续失败 8 次 → 熔断，需 `nut ads retry` 或人工介入。

---

## 修复铁流程（强制用 nut 跨端命令，禁用 npx / read_lints）

```
批量修复 + 批量验证（非逐文件）：

  ① npx nut lint fix "src/目录名" --write    （自动修复）
  ② npx nut lint run "src/目录名"             （验证）
  ③ exit=0 → 完成
  ④ exit≠0 → 读取输出中的错误列表 → replace_in_file 精准改
  ⑤ 回到 ①

命令规范（npx nut + 批量验证）：
  ✓ npx nut lint run "src/lint"              验证（批量）
  ✓ npx nut lint fix "src/lint" --write      修复（批量自动修复）
  ✓ npx tsc --noEmit                         类型检查
  ✓ npm run build                            构建
  ✗ npx nut lint run src/a.ts                慢 + 逐文件
  ✗ npx nut lint run "src/lint" 2>&1         2>&1 多余 + 增加噪声

PowerShell CLIXML 噪声规避：
  npx nut 在 PowerShell 下可能输出 <Objs ...> CLIXML 进度流噪声。
  验证时只看 "✖ N problems" 行 + exit code，CLIXML 块可忽略。

🔴 禁止使用 read_lints 替代 nut lint run。
   read_lints 返回 0 不代表实际 0（IDE 缓存问题），
   只有 nut lint run 是权威验证。

🔴 禁止用 tsc --noEmit 替代 nut lint run。
   tsc 只查类型错误（TS2304/TS2345 等），
   nut lint run 才查 Prettier 格式化 + ESLint 规则 + 圈复杂度。
   两者是独立验证，必须都跑。

🔴 禁止在命令末尾加 2>&1（多余 + 增加输出噪声）。

🔴 禁止逐文件验证（慢 + 噪声 N 倍）。
   错误：npx nut lint run src/a.ts && ... src/b.ts
   正确：npx nut lint run "src/lint"（1 次跑完）

🔴 圈复杂度拆分后必须递归验证。
   拆分函数 A → 产生子函数 B/C/D → 必须重新 nut lint run
   确认 B/C/D 复杂度也 ≤ 10（拆 A 可能导致 B 又超标）。

🔴 每次 replace_in_file / write_to_file 后必须立即验证。
   编辑工具不会自动格式化，可能引入 prettier 格式化问题。
   禁止：连续做 3 次编辑后才验证（错误会累积难定位）。
```

---

## 错误处理

| 场景 | 处理 |
|------|------|
| nut ads next 返回 errors | 按 errors 修复代码 → 重新 nut ads next |
| 熔断（escalated） | nut ads retry 刷新 fresh 基准 → 重新编码 → next |
| 断线恢复 | nut ads status 查看当前 anchor → 从断点继续 |
| 子任务未完成 | nut ads subtask-done 逐个完成 → 再 next |
| artifact 缺失 | nut ads emit 产出 → 再 next |
| 文件超限 | 必须拆分 |
| 圈复杂度超标 | 必须拆分函数 |
| 5维度约束不通过 | 标记具体维度，修复后重检 |

---

## 参考资料

| 文件 | 内容 | 加载方式 |
|------|------|---------|
| `anchor.config.json` | ADS harness 配置（2 anchor + verify） | nut ads init/next 读取 |
| `RULE.mdc` | 前端代码生成铁律（ADS reads 内联） | code anchor rulesInline |
| `rules/iron-rules.md` | 铁律详细规范 | 按需 read_file |
| `rules/file-structure.md` | 文件结构规范 | 按需 read_file |
| `rules/anti-patterns.md` | 反模式清单 | 按需 read_file |
| `references/` | 详细规范参考文件 | 按需 read_file |
