# 别再信 Agent 说"做完了"：GateLoop 门控闭环，把 AI 交付逼成确定性流水线

> 一种把"执行纪律"从**模型自觉**变成**引擎强制**的 Harness 范式。
> 引擎只信**脚本的 exit code**，不信**模型说"做完了"**——模型能做的只有"声称做完并调 next"，能否推进由 verify 的 exit code 说了算。

---

## 目录

- **〇、先给它起个名字**
- **一、它到底在解决什么痛点？**
- **二、核心创新与优势（重点）**
- **三、功能清单 & 怎么用（上手动手）**
- **四、实战验证：六个 Demo（有 GateLoop vs 没有）**
  - Demo 1：防撒谎——"我验证过了"到底算不算数
  - Demo 2：熔断止损——死循环被自动掐断
  - Demo 3：同题生成——产物质量对比（同一个问题，生成 skill）
  - Demo 4：同题生成——多次稳定性对比（防衰减 / 防随机）
  - Demo 5：子任务不漏做——契约闭环对比
  - Demo 6：真实可验证——lint + TS 类型 + 代码格式化（一个文件，两个 skill，你来跑）
  - 六个 Demo 一句话对照
- **五、解决什么问题，效果如何**
- **六、一句话总结**

> 配套资料：引擎源码 `src/gateloop/`（入口类 `GateLoop`）· 命令行 `nut gateloop` · 配套 Skill `.codebuddy/skills/skill-creator-gateloop`（用 GateLoop 生成 GateLoop Skill 的"元 Skill"，即 **Demo 3** 的实操入口）。

---

## 〇、先给它起个名字

我把这套从 `src/gateloop`（引擎类 `GateLoop`，由历史代号 `Ads` 重命名）里沉淀出来的思想命名为：

- **GateLoop — 门控闭环引擎（Gate + Loop + Harness）**
- **范式定位**：Harness 模式（引擎约束范式 / Runtime-Constraint Paradigm）
- **一句话本质**：
  > 引擎只信「脚本 exit code」，不信「模型说做完了」。
  > 模型能做的只有"声称做完并调 next"，但能否推进由 verify 的 exit code 说了算。

它不叫"提示词技巧"，也不叫"Agent 框架"——它是一套**运行时约束器（harness）**：Skill 只写"要做什么"（What），引擎强制"怎么做才算数"（How）。这句话是全文题眼，后面所有设计都围着它转。

> 命名关系：**GateLoop 是引擎名，Anchor（锚点）是它的核心数据结构名**——锚点描述"把模型执行锚定在可验证步骤上"的机制，闭环描述"执行-验证-修复"的运行哲学，两者互补不冲突。

---

## 一、它到底在解决什么痛点？

写过 AI 编程 Agent 的都踩过这三个坑：

| 痛点 | 日常表现 | 根因 |
|------|----------|------|
| **模型会撒谎** | "我已经验证通过了"——但其实根本没跑命令 | 步骤是"建议"，没有强制执行点 |
| **状态会漂移** | 长对话后模型忘了自己在第几步、前面产出啥 | 状态存在模型脑子里，不可靠 |
| **死循环** | 同一个错误反复修、反复错，token 哗哗烧 | 没有熔断，没有"止损"机制 |

传统做法是在 System Prompt 里写"请务必验证后再提交""请记住当前步骤"。问题是——**这些对 LLM 只是建议，不是约束**。它可以选择性遵守，也可以选择性"装作"遵守。

GateLoop 的核心转变，就是把纪律从"模型的自觉"搬进"引擎的强制"：

```
传统步骤器                          GateLoop Harness
─────────────                      ─────────────
模型自己记状态            →         引擎唯一写状态（模型只读）
模型自己说"验证过了"      →         引擎强制重跑验证（exit code 判定）
模型自己找上游数据        →         引擎把上游数据自动内联进指令
模型自己控制循环          →         引擎熔断计数，超限止损
临时文件随手乱放          →         引擎分配隔离 scratch，自动清理
```

---

## 二、核心创新与优势（重点）

### 创新 1：从"步骤器"到"Harness"——三支柱思想

GateLoop 本质由**三个不可分割的支柱**构成：

```
① 门控（Gate）    —— 每阶段有客观验证门，exit code 守着，"确定的交给脚本"
② 闭环（Loop）    —— 失败重试 + 熔断回滚 + 环检测，"执行-验证-修复"逼收敛
③ 底座（Harness） —— 引擎强制驱动 + 数据自动内联，不信模型自述，防信息衰减
```

对应三层分工哲学：
- **确定的**（能编译 / 无 any / 文件 ≤ 360 行 / 产物存在 / schema 字段齐全）→ 脚本 exit code，模型改不了
- **理解的**（拆分合不合理 / 数据流优不优雅）→ `review.model` 结构化评审，模型评 + 脚本卡形式（逐条评 + 带证据 + fail 必改）
- **纯审美**（视觉效果 / 品牌感）→ 完全交给模型，不进 verify

### 创新 2：状态唯一写入者——根治"失忆漂移"

`anchor-state.json` 是唯一真相源，**只有引擎内部能写**（不导出给模型）。模型能读状态、能通过 API 请求变更，但**不能直接改状态文件**。状态不可伪造、不会漂移。

### 创新 3：exit-code 验证——让"撒谎"成本无限高

验证走真实命令（`tsc` / `ESLint` / `build` / `test` / 自定义命令），**exit 0 才算过**。模型说"我验证过了"没用，引擎会**再跑一遍**。这意味着：你只能真的把代码写对，作弊成本无限高。

### 创新 4：强制重验门禁——推进前必须真跑一遍

`doNext()` 是整个引擎的心脏，门禁顺序刻意设计：

```
调用 next()
 ├─ [门禁1] requiresSubtasks？ → 子任务未全绿 → 拒绝推进
 ├─ 强制重跑 verify（真实命令，exit code 判定）
 ├─ [门禁2] emits 声明的 artifact 是否已产出？ → 缺失 → 验证失败
 ├─ [门禁3] writesMemory 声明的决策记忆是否已回写？ → 未回写 → 拒绝推进
 ├─ attempts++
 ├─ 验证未通过？
 │    ├─ attempts >= maxAttempts → 🛑 熔断（escalated）
 │    └─ 否则 → status=failed，返回错误让模型修复
 └─ 验证通过？ → 推进下一 anchor / 收尾清理
```

把"信任模型"变成"验证模型"——这是防撒谎的总闸。

### 创新 5：子任务闭环 + Artifact 契约——大任务不漏做、数据不对齐

- `requiresSubtasks: true` 的阶段，**子任务未全绿 → 拒绝推进**，避免"一把梭"漏做。
- 阶段间通过 `consumes` / `emits`（结论）、`reads`（规则）、`readsContext`（上下文链）**四条信息管道**传递数据，声明了却没产出 → **拒绝推进**。数据流从"隐式约定"变成"显式契约"，可校验。

### 创新 6：熔断止损——拒绝死循环

每阶段有 `maxAttempts`（manifest / anchor 两级），连续失败超限 → `escalated` 熔断升级；Flow 层还有 `maxJumps` 环检测（默认 3），防回滚跳转死循环。止损机制，避免无意义地烧 token 反复失败。

### 创新 7：临时区隔离 + 断点续跑

- 每个任务分配隔离 scratch 目录（`.specflow/scratch/<taskId>/`），自动清理 + 按 mtime 超期（默认 72h）GC 回收，绝不污染项目。
- `producesFresh` 校验"产物必须比本轮开始新"，防复用旧文件蒙混；基准用**本轮尝试时间**而非阶段开始时间，既防作弊又支持断点续跑。

### 创新 8：单 Skill → 多 Skill 的 Flow 编排 + 五类分工

- **Anchor 层（小 skill）**：`anchor.config.json`，单领域内部防跳步。
- **Flow 层（大流程）**：`flow.config.json`，跨多 skill 编排，`delegateSkill` 委派子 skill、`readsContext` 防衰减、`writesMemory` 沉淀决策、`onEscalate` 回滚（设计不达标 → 回滚到需求重新来）。同一套引擎，两种粒度。
- **5 类分工判定**（floor-ceiling）：A 收敛→exit code / B 完备→schema / C 度量→回灌 / D 主观→review.model 四道门禁 / E 纯审美→不进 verify。让"脚本 vs 模型"的边界清晰，绝不把主观维度塞进 exit code，也不把确定维度交给模型自评。

**优势一句话总结**：确定性交付（不再"看起来对"而是"真的过验证"）、防作弊防幻觉、防失控（不漂移不死循环）、Skill 作者零执行代码、可复用可编排、可量化观测。

---

## 三、功能清单 & 怎么用（上手动手）

### 3.1 两份 manifest：Anchor 管「内」，Flow 管「外」

GateLoop 的 manifest 不是"一个文件"，而是**两种粒度、两种职责**。很多初学者把它们混为一谈，这里一次讲清：

#### ① `anchor.config.json` —— 单 Skill 内部（Anchor 层）

描述**一个领域/一个 skill 内部**的固定阶段序列。真实例子就是 `frontend-codegen`（前端代码生成 skill），它内部排了 3 个锚点：`inventory → design → code`。它解决的是：**模型在一个 skill 内干活时，不能跳步、不能谎报、不能漏文件**。

```jsonc
// .codebuddy/skills/frontend-codegen/anchor.config.json（节选）
{
  "name": "frontend-codegen",
  "scratchDir": ".specflow/scratch",
  "maxAttempts": 5,
  "anchors": [
    {
      "id": "inventory",                 // ① 客观清单：脚本枚举违规文件，模型不参与判断
      "name": "系统性资产清单（客观）",
      "produces": [".specflow/context/inventory.json"],
      "emits": ["inventory"],
      "verify": {
        "produceScripts": ["node scripts/inventory.mjs --output .specflow/context/inventory.json --root src"],
        "autoEmit": { "inventory": ".specflow/context/inventory.json" },
        "modelWritable": false,          // 🔑 关键：清单只能脚本产，模型改不了 → 防伪
        "producesFresh": true
      }
    },
    {
      "id": "design",                    // ② 设计：必须覆盖 inventory 的全部违规
      "name": "技术设计 + 架构精判",
      "reads": ["frontend-design/RULE.mdc"],
      "consumes": ["inventory"],
      "emits": ["frontendPlan", "architectureReview"],
      "verify": {
        "schema": { "required": ["frontendPlan", "architectureReview"] },
        "custom": [
          "node scripts/verify-coverage.mjs --inventory inventory.json --plan current.json",  // 集合闭包：漏文件即 FAIL
          "npx nut gateloop metric design --input current.json"
        ],
        "review": { "requireEvidence": true, "checklist": [ /* 6 项主观质量，逐条 verdict+evidence */ ] }
      }
    },
    {
      "id": "code",                      // ③ 编码：强制 tsc+lint+build，exit 0 才推进
      "name": "编码实现 + 验证交付",
      "consumes": ["frontendPlan", "architectureReview"],
      "requiresSubtasks": true,
      "maxAttempts": 8,
      "verify": {
        "tsc": true, "lint": true, "build": true, "fileSize": true, "prettier": true,
        "producesFresh": true,
        "custom": [
          "npx nut gateloop metric code --dir src/",
          "node scripts/verify-completion.mjs --root src --plan current.json"   // 末尾重跑清零
        ],
        "review": { "requireEvidence": true, "checklist": [ /* 9 项：6 代码 + 3 样式 */ ] }
      }
    }
  ]
}
```

#### ② `flow.config.json` —— 跨多 Skill 编排（Flow 层）

描述**一个大工程如何由多个子 skill 接力完成**。每个节点用 `delegateSkill` 委派一个具体的 skill（里面再带自己的 anchor.config.json）。它解决的是：**多个 skill 协作时，上下文不丢、决策可沉淀、失败能回滚**。

```jsonc
// flow.config.json —— 跨多 skill 编排
{
  "name": "full-stack-deliver",
  "flow": [
    { "id": "design",   "delegateSkill": "frontend-design", "writesMemory": ["designDecision"],
      "readsContext": ["#req"] },
    { "id": "code",     "delegateSkill": "frontend-codegen", "readsContext": ["design"],
      "onEscalate": { "jumpTo": "design" } },   // 设计不达标 → 回滚重来
    { "id": "review",   "delegateSkill": "code-quality-guard" }
  ]
}
```

#### 两者对比（一张表记住）

| 维度 | `anchor.config.json` | `flow.config.json` |
|------|----------------------|---------------------|
| 层级 | Anchor 层（小） | Flow 层（大） |
| 管什么 | 单 skill 内部阶段 | 多 skill 串成流程 |
| 关键字段 | `anchors` / `verify` | `flow` / `delegateSkill` |
| 防什么 | 跳步、谎报 | 信息衰减、协作断裂 |
| 配合机制 | emits/consumes 阶段间传数据 | readsContext 跨 skill 存档、writesMemory 沉淀决策、onEscalate 回滚 |
| 谁写 | skill 作者（单领域） | 流程编排者（跨领域） |

一句话：**Anchor 把"一个 skill 做对"，Flow 把"一堆 skill 串顺"**。两者共用同一套验证内核，所以小 skill 能平滑升级为大流程。

#### 和 Skill 结合的好处：GateLoop「harness 模式」

这才是重点——GateLoop 不是另起炉灶的框架，而是**给 Skill 装上"强制执行引擎"**的模式：

1. **Skill 作者零执行代码**：你只写"要做什么"（Anchor 序列 + 验证条件），状态机、子任务闭环、熔断、隔离、续跑全部由引擎注入。原来写一个"不跳步的代码生成 skill"要几百行控制逻辑，现在一份 JSON 声明搞定。
2. **从「建议」到「强制」**：普通 skill 的 SKILL.md 对模型只是"建议"——它会选择性遵守；harness 模式下，引擎在 `next()` 时**强制重跑验证**，不过门就卡住，模型无法用嘴推进。
3. **确定性交付**：模型自由度被限制在执行空间内，但"是否完成"由 exit code 说了算——产出从"看起来对"变成"真的过验证"。
4. **可复用 + 可编排**：同一个 `git-manager` anchor 既能单独被调用（用户说"提交代码"），也能被塞进 `flow.config.json` 当某个节点（`code` 阶段委派它），无需改一行代码。
5. **可降级、可审计**：Skill 工具（如 `nut gateloop`）缺失时自动降级为独立 skill 仍可工作；`anchor-state.json` + scratch 让你随时 `nut gateloop status` 看清卡在哪、为什么卡。

声明即能力——状态机、验证、子任务闭环、契约、熔断、隔离、续跑**全自动获得**。

### 3.2 命令行怎么用（三层使用之一：当命令）

GateLoop 是 skill 的执行底座，同一底座三种使用层次（不是三个东西）：

```
层次1：做单一功能   → anchor.config.json   单 skill 内部阶段，门控防「跳步」
层次2：做流程       → flow.config.json     跨多 skill 编排，上下文防「衰减」
层次3：当命令       → nut gateloop init/next... 手动驱动/审计/断点续跑
```

作为命令驱动（manual 形态）：

```bash
# 初始化任务（自动建 scratch + GC 残留）
nut gateloop init <manifest> --task "实现用户列表页"

# 推进（内部强制验证 + 子任务闭环 + artifact 校验 + 熔断）
nut gateloop next <manifest>

# 断线恢复：查看当前在哪一步
nut gateloop status <manifest>

# 手动验证当前阶段（不推进）
nut gateloop check <manifest>

# 重做前刷新 fresh 基准（断点续跑）
nut gateloop retry <manifest>

# 动态拆子任务 / 完成子任务
nut gateloop subtask-add  <manifest> --desc "实现列表分页"
nut gateloop subtask-done <manifest> --id design-sub-1

# 阶段间传数据
nut gateloop emit <manifest> --key frontendPlan --kind file --path artifacts/api.json

# 重置 / 回收过期临时目录
nut gateloop reset <manifest>
nut gateloop gc    <manifest>
```

### 3.3 真实案例：用 `frontend-codegen` skill 拆解 GateLoop（Anchor 层）

这个项目里真实落地的 `frontend-codegen`（前端代码生成 skill，v13）就是 GateLoop Anchor 层的教科书范例。它的 `anchor.config.json` 排了 **3 个锚点**，每一处都在落实"门控 + 闭环 + 底座"：

```
inventory ──→ design ──→ code
  (客观)      (设计)      (编码+验证)
```

**① inventory 锚点 —— 客观输入先行，集合闭包防伪**

```jsonc
{ "id": "inventory", "name": "系统性资产清单（客观）",
  "produces": [".specflow/context/inventory.json"], "emits": ["inventory"],
  "verify": {
    "produceScripts": ["node scripts/inventory.mjs --output .specflow/context/inventory.json --root src"],
    "autoEmit": { "inventory": ".specflow/context/inventory.json" },
    "modelWritable": false,   // 🔑 清单只能脚本产，模型改不了 → 防伪
    "producesFresh": true } }
```

关键点：`modelWritable:false` + `produceScripts` 重跑覆盖，意味着**这个清单是脚本说的算，模型无法伪造**。这是 GateLoop 三支柱里"底座"的典型运用——把"事实"交给脚本，不信任模型自述。

**② design 锚点 —— 集合闭包防漏，schema 卡结构**

```jsonc
{ "id": "design", "consumes": ["inventory"], "emits": ["frontendPlan", "architectureReview"],
  "verify": {
    "schema": { "required": ["frontendPlan", "architectureReview"] },
    "custom": ["node scripts/verify-coverage.mjs --inventory inventory.json --plan current.json"],  // 漏文件即 FAIL
    "review": { "requireEvidence": true,
      "checklist": [ /* 6 项主观质量，每条必须 verdict + 带行号的 evidence */ ] } } }
```

`verify-coverage.mjs` 做**集合闭包校验**：`inventory.violations − coverage.targets − coverage.excluded` 必须为空，否则 FAIL。模型想"只处理几个文件糊弄过关"？门禁直接卡死。而 `review` 把"布局决策合不合理"这类**不确定项**交给模型逐条评（带证据），脚本只卡"是否逐条评了"，不卡内容——这就是 5 类分工里"主观走 review.model"的体现。

**③ code 锚点 —— 强制 tsc+lint+build，exit 0 才推进**

```jsonc
{ "id": "code", "consumes": ["frontendPlan", "architectureReview"],
  "requiresSubtasks": true, "maxAttempts": 8,
  "verify": {
    "tsc": true, "lint": true, "build": true, "fileSize": true, "prettier": true,
    "producesFresh": true,
    "custom": ["npx nut gateloop metric code --dir src/",
               "node scripts/verify-completion.mjs --root src --plan current.json"],  // 末尾重跑清零
    "review": { "requireEvidence": true,
      "checklist": [ /* 9 项：6 代码质量 + 3 样式质量 */ ] } } }
```

用户说"生成用户列表页"，引擎先卡 `inventory`（脚本出违规清单）→ 再卡 `design`（必须覆盖全部违规 + 出架构评审）→ 最后卡 `code`（`tsc+lint+build` 全绿 + 子任务全完成 + 末尾重跑断言清零）。**任何一步没真过，模型调 `next` 都会被引擎挡回并拿到 errors**。整个过程模型无法跳过验证、无法谎报成功。

> 旁注：`git-manager` 也是一个 GateLoop Anchor 层 skill（`resolve → execute` 两锚点），逻辑同上，只是领域换成 Git 命令正确性校验。

---

## 四、实战验证：五个 Demo（有 GateLoop vs 没有）

光讲思想不够，下面用五个**可复现**的实验，对比"裸跑 Agent"和"套上 GateLoop 引擎"的差异。**所有终端输出均来自 `demos/gateloop/` 下的真实运行（非编造）**，fixture 可直接克隆复跑。两个 Demo 都能用本仓库的 `nut gateloop` 命令行真实跑出来——核心思想一句话：**引擎只信 exit code，不信模型说"做完了"**。

### Demo 1：防撒谎——"我验证过了"到底算不算数

**场景**：让 Agent 修 `src/utils.ts` 里一个 TS 编译错误（漏改一处类型）。

#### ❌ 没有 GateLoop（只靠 System Prompt 约束）

> System Prompt："请务必验证后再提交。"

```
用户：修复 src/utils.ts 的编译错误
模型：已定位问题，将 count 改为 number 类型，tsc 通过 ✅ 已提交。
（实际：只改了一处，另一处 value: 'x' 赋给 number 字段仍未修，tsc 报 TS2322）
```

没有客观强制点，**模型的自述被直接采信**，带编译错误的代码被合并进主干。

#### ✅ 有 GateLoop（Anchor + verify.tsc）

> 真实 fixture：`demos/gateloop/demo1-tsc/`，`code` 锚点声明 `"verify": { "tsc": true }`。先故意留一个编译错误，跑 `next`：

```bash
$ nut gateloop next anchor.config.json

📌 阶段: code (编码)   🔁 尝试: 1/5
🔍 验证: tsc --noEmit（由引擎内部执行）

❌ 验证结果: 失败 (2 项检查)
  ✅ 产物存在性 (6ms)
  ❌ tsc (2508ms)
     src/utils.ts(4,14): error TS2322: Type 'string' is not assignable to type 'number'.

➡️ ❌ 验证未通过（1 个错误，1/5 次）。修复后重新调用 next。
```

把 `src/utils.ts` 第 4 行改成 `export const total: number = 42;` 再 `next`，引擎重跑 tsc 通过才放行：

```bash
$ nut gateloop next anchor.config.json

📌 阶段: review (评审)   🔁 尝试: 0/5
🔍 验证: 产物存在性（由引擎内部执行）

➡️ ✅ 验证通过，已推进到 review 阶段。
```

引擎在 `doNext()` 里**强制重跑 `tsc`**，exit 1 就挡回、exit 0 才推进（`advanced=false`），把真实错误甩回给模型。模型只能真的修好，`tsc` exit 0 才放行：

**验证结论**：无 GateLoop 时"嘴上说过了"就能过关；有 GateLoop 时，模型**无法用嘴推进**，只能真的把代码写对。这就是"从相信你 → exit code 证明你"。

> 想自己跑：准备一个故意留编译错误的仓库，写一份含 `verify.tsc` 的 `anchor.config.json`，反复 `nut gateloop next` 观察"声称通过却被挡回"。

### Demo 2：熔断止损——死循环被自动掐断

**场景**：一个表述歧义的需求，模型针对同一错误反复修、反复错。

#### ❌ 没有 GateLoop

模型陷入"修 → 错 → 修 → 错"的死循环，同一处卡了 20 轮，token 哗哗烧，用户完全不知情，直到账单爆炸才发现。

#### ✅ 有 GateLoop（maxAttempts + escalate 熔断）

> 真实 fixture：`demos/gateloop/demo2-circuit/`，`build` 锚点 `verify.custom` 恒为 `node -e "process.exit(1)"`，`maxAttempts: 2`。连续 `next`：

```bash
$ nut gateloop next anchor.config.json

📌 阶段: build (构建)   🔁 尝试: 1/2
🔍 验证: 自定义命令（由引擎内部执行）
❌ 验证结果: 失败 (1 项检查)
  ❌ Custom: node -e "process.exit(1)" (154ms)
     Command failed: node -e "process.exit(1)"
➡️ ❌ 验证未通过（1 个错误，1/2 次）。修复后重新调用 next。
```

第 2 次仍失败，触及 `maxAttempts`：

```bash
$ nut gateloop next anchor.config.json

📌 阶段: build (构建)   🔁 尝试: 2/2
🛑 已熔断：连续失败超过上限，需人工介入或降级方案。
➡️ 🛑 连续失败 2/2 次，已熔断。需人工介入或降级方案。可调用 reset 重来，或修正 manifest 后 retry。
```

状态机把该锚点标记为 `escalated`，**自动停机止损**——不再无意义地烧 token。配合 Flow 层的 `onEscalate` 还能回滚到上游锚点重做；配合 `maxJumps`（默认 3）防回滚跳转死循环。任何时候 `nut gateloop status` 都能看清卡在哪、为什么卡（Demo 1 末尾已展示 `status` 输出）：

**验证结论**：无 GateLoop 时错误无限重试、token 失控；有 GateLoop 时**到点熔断、自动止损、可审计**。

> 想自己跑：`maxAttempts` 调小（如 2），喂一个永远修不对的输入，连续 `next` 观察第 N 次触发 `🛑 熔断`。

### Demo 3：同题生成——产物质量对比（真写 skill，让 GateLoop 门禁审）

**同一个问题**：_"生成一个能自动修复 lint 错误的 skill"_。我**真的写**了两个 `SKILL.md` 文件，再用 GateLoop 把**同一个客观质量门禁**（`check-skill.cjs`：查真命令 / 无伪命令 / 有重试验证 / ≤500 行）套到两者上——看真实跑出来谁过谁挂。

#### ❌ 没有 GateLoop（裸 skill，无 manifest）

`demos/gateloop/demo3-skill/bare/eslint-fixer-bare/SKILL.md`，模型裸写，长这样：

```markdown
---
name: eslint-fixer-bare
description: 修复项目的 eslint 错误
---

# ESLint Fixer
## 用法
1. 运行 `npm run autofix`
2. 提交改动
搞定。
```

套上质量门禁 `next`：

```bash
$ nut gateloop next ../../quality-gate.config.json

📌 阶段: quality (skill 质量门禁)   🔁 尝试: 1/3
❌ 验证结果: 失败 (2 项检查)
  ✅ 产物存在性 (6ms)
  ❌ Custom: node ../../check-skill.cjs SKILL.md (154ms)
     SKILL 质量门禁未过:
 - 缺少真实 eslint 修复命令（应写 npx eslint . --fix）
 - 含伪命令（npm run autofix 等仓库中不存在的脚本）
 - 缺少失败重试 / 结果验证步骤（无法确认是否真修好）
➡️ ❌ 验证未通过（1 个错误，1/3 次）。修复后重新调用 next。
```

模型觉得自己"搞定"了，门禁一测就露馅：**伪命令根本跑不起来、没有验证、没有重试**。没有 GateLoop，这份 skill 直接被交付，用户踩坑。

#### ✅ 有 GateLoop（skill 自带 anchor.config.json，harness 模式）

`demos/gateloop/demo3-skill/gated/eslint-fixer-gated/` 含 `SKILL.md` + 自己的 `anchor.config.json`（质量门禁跟着 skill 走）。`SKILL.md` 用真实 `npx eslint . --fix`、带 exit 0 验证、带重试上限。直接 `next` 过自己的门禁：

```bash
$ nut gateloop next anchor.config.json

✅ 所有阶段已完成
```

**验证结论**：同样一个问题、同样一个客观门禁，**裸 skill 一测就挂，GateLoop skill 自带门禁一次过**。GateLoop 给 skill 带来的不是"更会写"，而是——

1. **质量可客观验证**：skill 的"成功标准"写成 `verify.custom` 脚本（`npx eslint .` exit 0 才算修好），模型**不能嘴上说修完**；
2. **门禁跟着 skill 走**：`anchor.config.json` 与 `SKILL.md` 同目录打包，谁拿到这个 skill 谁就被同一道门审，质量不随人漂移；
3. **少一道都不算完**：`produces` + `verify` 双重约束，伪命令 / 漏重试这类"看起来能跑其实跑不了"的坑被挡在交付前。

#### 🔧 端到端实操：用 `skill-creator-gateloop` 真生成一个 skill 并跑通门禁

上面是"写好的 skill 套门禁"。更进一步——我**真的用 `.codebuddy/skills/skill-creator-gateloop` 这个 GateLoop skill 本身**生成了一个新 skill（`todo-scanner`：扫描 `src/**` 的 TODO 并产出 `todo-report.json`），并把它自带的 `anchor.config.json` 跑起来。真实 `nut gateloop` 过程：

**① init —— 引擎把"扫描"锚点加载，声明产物 `todo-report.json`：**
```bash
$ nut gateloop init anchor.config.json --task "scan-todo"
📌 阶段: scan (扫描并汇总 TODO)   🔁 尝试: 0/3
📦 产物: ─ todo-report.json
```

**② 啥都没做就 `next` —— 门禁当场拦截"声称做完但没产物"：**
```bash
$ nut gateloop next anchor.config.json
📌 阶段: scan (扫描并汇总 TODO)   🔁 尝试: 1/3
❌ 验证结果: 失败 (1 项检查)
  ❌ 产物存在性 (7ms)
     缺失: todo-report.json
➡️ ❌ 验证未通过（1 个错误，1/3 次）。修复后重新调用 next。
```

**③ 模型真正执行 skill —— 跑 `scripts/scan.cjs`，扫描仓库并写出 `todo-report.json`：**
```bash
$ node scripts/scan.cjs
scan done: 0 个 TODO/FIXME
```

**④ 再 `next` —— 产物存在 + 脚本重跑双过，闭环放行：**
```bash
$ nut gateloop next anchor.config.json
✅ 所有阶段已完成
```

这一步最直观地回答了"GateLoop 给 skill 带来什么"：**没有 GateLoop，模型只要嘴上说"我扫了，没 TODO"就交差；有 GateLoop，它必须先实际跑出 `todo-report.json` 这个产物，否则门禁不认**。skill 的"成功标准"被固化成 `produces` + `verify.custom` 两条硬门，跳步、撒谎、漏产物全部被挡在交付前。

> 想自己跑：`demos/gateloop/demo3-skill/generated/todo-scanner/` 就是这次真生成的 skill；删掉 `todo-report.json` 再 `next`，会复现 ② 的拦截；重跑 `node scripts/scan.cjs` 再 `next`，复现 ④ 的放行。

### Demo 4：同题生成——多次稳定性对比（防衰减 / 防随机）

**同一个问题连跑 3 次**（独立会话），看"裸跑"和"GateLoop"的产物是否一致。

#### ❌ 没有 GateLoop

三次结果参差不齐，因为全靠模型临场发挥，没有任何硬约束：

| 第几次 | 产物特征 |
|--------|----------|
| 第 1 次 | 漏了错误处理，结构还超层 |
| 第 2 次 | 跳过了测试步骤，声称"无需测试" |
| 第 3 次 | 写到一半超 token 截断，半成品 |

#### ✅ 有 GateLoop（consumes/produces 数据契约 + 门控重验）

> 真实 fixture：`demos/gateloop/demo4-determinism/`，对同一份含编译错误的代码连续 `nut gateloop check` 3 次（只读、不改状态）：

```bash
$ nut gateloop check anchor.config.json
{
  "passed": false,
  "errors": ["tsc: src/bad.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number.'"],
  "checks": [{ "name": "tsc", "passed": false, "output": "src/bad.ts(1,14): error TS2322: ..." }],
  "duration": 3507
}
```

第 2、3 次输出与第 1 次**逐字节一致**（仅 `duration` 因机器负载在 3.4~3.5s 微差）。三次都被同一条流水线约束：每阶段 `consumes` 上游产出、`produces` 下游输入、结束前 `verify` 重验。模型"随机发挥"被压成"确定性流水线"：

**验证结论**：没有 GateLoop，同题多次生成像抽奖；有 GateLoop，结果可重现、可量化、可审计。这正是"防信息衰减 + 数据契约"的价值。

### Demo 5：子任务不漏做——契约闭环对比

**问题含 5 个子任务**：设计 / 脚手架 / 接入 CLI / 写测试 / 出文档。

#### ❌ 没有 GateLoop

模型做了设计、脚手架、接入 CLI，觉得"差不多了"就宣布完成，**跳过了写测试和出文档**。没人拦得住。

#### ✅ 有 GateLoop（flow.config 子任务建模）

> 真实 fixture：`demos/gateloop/demo5-subtask/`，`impl` 锚点 `requiresSubtasks: true`。什么子任务都不拆就 `next`：

```bash
$ nut gateloop next anchor.config.json

📌 阶段: impl (实现)   🔁 尝试: 0/3
❌ 验证结果: 失败 (0 项检查)
⚠️ 错误 (1): ─ 本阶段要求先拆分子任务（requiresSubtasks），请先调用 addSubtasks
➡️ ❌ 验证未通过（1 个错误，0/3 次）。
```

`subtask-add --desc "write tests"` 拿到 id `impl-sub-1`，再 `next` 仍被挡（1 个未完）：

```bash
$ nut gateloop next anchor.config.json

🧩 子任务 (0/1 完成): ⬜ impl-sub-1 — write tests
⚠️ 错误 (1): ─ 还有 1 个子任务未完成: impl-sub-1
```

`subtask-done --id impl-sub-1` 后 `next` 才到终态：

```bash
$ nut gateloop subtask-done anchor.config.json --id impl-sub-1
[{ "id": "impl-sub-1", "desc": "write tests", "status": "done", ... }]

$ nut gateloop next anchor.config.json
✅ 所有阶段已完成
```

**验证结论**：没有 GateLoop，子任务"凭心情做"；有 GateLoop，"少一个都不算完"。

### Demo 6：真实可验证——lint + TS 类型 + 代码格式化（一个文件，两个 skill，你来跑）

前面五个 Demo 用的是"机制演示" fixture。这个 Demo 不一样：**给你一个真实、复杂、问题多的 `.ts` 文件，做两个真 skill（一个用 GateLoop、一个不用），你亲手跑来验证差异**。

#### 问题文件 `demos/gateloop/demo-fix/broken-sample.ts`

埋了 **lint / TS 类型 / 代码格式化** 三类共 20+ 处问题：

| 类别 | 埋的问题 |
|------|----------|
| lint | `any`（no-explicit-any）、`var`（no-var）、嵌套三元（no-nested-ternary）、分号（semi:never）、双引号、尾逗号、未使用函数（no-unused-vars） |
| TS 类型 | `add(a:number,b:string):number` 返回 `a+b`（string 不赋值 number）、`bad2(label:string):number` 返回 string |
| 格式化 | 双引号、分号、尾逗号、2 空格缩进、超长行（prettier 全报错） |

先确认三个**真实工具**在问题文件上全挂（这就是门禁的意义）：

```bash
$ npx eslint broken-sample.ts
# 17 problems (15 errors, 2 warnings)  ← any / var / 嵌套三元 / 分号 / 双引号 / 尾逗号 / 未使用
$ npx prettier --check broken-sample.ts
# [error] broken-sample.ts  ← 双引号 / 分号 / 尾逗号 / 缩进 / 超长行
$ npx tsc --noEmit --strict --skipLibCheck --types node --moduleResolution node --module commonjs --target ES2019 broken-sample.ts
# error TS2322: Type 'string' is not assignable to type 'number'. (add / bad2)
# error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'. (add 调用处)
```

#### ❌ 没有 GateLoop：`fix-code-bare`（只有 SKILL.md，无 manifest）

我按 SKILL.md 把三类问题都改了，并宣布"已全部修复，可以交付"——**到此裸 skill 的流程就结束了，它内部不跑任何检查**。作为外部验证者我再跑 `npx eslint`，结果当场抓到 1 个漏网错误：

```bash
$ npx eslint broken-sample.ts
  52:11  error  'loooooooooongLine' is assigned a value but never used  @typescript-eslint/no-unused-var
✖ 1 problem (1 error, 0 warnings)
```

也就是说：**裸 skill 已经"交付"了，但代码并不干净**。它自己永远不会发现这 1 个错——全凭模型自觉。补掉这个遗漏后三个工具才全绿。这恰恰是被 GateLoop 门禁自动拦下的那种事：gated skill 的 lint 锚点会在交付前强制跑 `eslint`，看到这 1 个错就拦截返修，绝不让它溜进"完成"。

#### ✅ 有 GateLoop：`fix-code-gated`（SKILL.md + anchor.config.json）

`anchor.config.json` 把三类问题拆成三个锚点，每个锚点用**真实工具 exit 0** 守门：

```json
{ "anchors": [
  { "id": "lint",   "verify": { "custom": "npx eslint ../broken-sample.ts" } },
  { "id": "ts",     "verify": { "custom": "npx tsc --noEmit --strict ... ../broken-sample.ts" } },
  { "id": "format", "verify": { "custom": "npx prettier --check ../broken-sample.ts" } }
] }
```

真实引擎跑起来（我这次直接跑构建产物 `dist/cli/index.cjs`，它正是 `package.json` 里 `bin: { "nut": "./dist/cli/index.cjs" }` 指向的同一个引擎，需先 `npm run build`；`nut` 只是它的全局别名）。模型每修一类再 `next`：

```bash
$ nut gateloop init anchor.config.json --task "fix broken-sample"
📌 阶段: lint (修复 lint 问题)   🔁 尝试: 0/3

# ① 啥都没修就 next —— lint 门禁当场拦截：
$ nut gateloop next anchor.config.json
📌 阶段: lint (修复 lint 问题)   🔁 尝试: 1/3
❌ 验证结果: 失败 (1 项检查)
  ❌ Custom: npx eslint ../broken-sample.ts (1.2s)
     .../broken-sample.ts
       9:29  error  Unexpected any. Use a specific type instead  @typescript-eslint/no-explicit-any
➡️ ❌ 验证未通过（1 个错误，1/3 次）。

# ② 模型修掉 lint + 格式化 → next：lint 过，自动推进到 ts 锚点
$ nut gateloop next anchor.config.json
✅ 验证通过，已推进到 ts 阶段
📌 阶段: ts (修复 TS 类型错误)   🔁 尝试: 0/3

# ③ ts 锚点：类型错误被精准抓出（连参数类型都点名）
$ nut gateloop next anchor.config.json
📌 阶段: ts (修复 TS 类型错误)   🔁 尝试: 1/3
❌ 验证结果: 失败 (1 项检查)
  ❌ Custom: npx tsc ... ../broken-sample.ts (2.4s)
     error TS2322: Type 'string' is not assignable to type 'number'. (add)
     error TS2322: Type 'string' is not assignable to type 'number'. (bad2)
     error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'. (add 调用处)
➡️ ❌ 验证未通过（1 个错误，1/3 次）。

# ④ 模型修正 add/bad2 返回类型 → next：ts 过，推进 format，prettier 检查通过
$ nut gateloop next anchor.config.json
✅ 验证通过，已推进到 format 阶段
📌 阶段: format (修复代码格式化)   🔁 尝试: 0/3
$ nut gateloop next anchor.config.json
✅ 所有阶段已完成
```

**这就是差异**：裸 skill 靠模型"自觉"，修没修全全凭运气；GateLoop skill 把"修好了"定义成**三个工具 exit 0**，少一道门都不算完——lint 没清就别想碰 ts，ts 没过就别想碰 format，跳步、漏修、嘴上说修完，门禁一个都不认。

> 💡 **本次真实执行记录**：我先用 `node dist/cli/index.cjs gateloop init anchor.config.json --task fix` 初始化，再 `next`——第一次 `next` 被 lint 门禁**当场拦截**（文件未修，`eslint` 报 19 错、exit 非 0，引擎停留在 `lint` 阶段、attempt 1/3，**没有推进**）。修掉三类问题后连续三次 `next`，引擎内部真实重跑工具，依次输出 `✅ 验证通过，已推进到 ts 阶段` → `已推进到 format 阶段` → `✅ 所有阶段已完成`。门禁全部由引擎执行，模型无法伪造 exit code。

> 想自己跑：进 `demos/gateloop/demo-fix/`，
> 1. 裸 skill：`cd fix-code-bare`，按 SKILL.md 改 `../broken-sample.ts`，改完**自己**跑 `npx eslint/prettier/tsc` 看是不是还报错（skill 自身不核验）；
> 2. GateLoop skill：先 `npm run build`（产出 `dist/cli/index.cjs`，即 `bin.nut`），再 `cd fix-code-gated && node ../../dist/cli/index.cjs gateloop init anchor.config.json --task fix && node ../../dist/cli/index.cjs gateloop next anchor.config.json`（每类修完 `next` 一次），直到 `✅ 所有阶段已完成`；
> 3. 跑乱了用 `node ../../dist/cli/index.cjs gateloop reset anchor.config.json` 清零重来。文件 `broken-sample.ts` 已恢复成问题版本，随时可重验。

### 六个 Demo 一句话对照

| 维度 | 没有 GateLoop | 有 GateLoop |
|------|---------------|-------------|
| "验证过了" | 模型自述即采信，坏代码过关 | 引擎强制重跑，exit 0 才放行 |
| 反复失败 | 死循环烧 token，无人知 | `maxAttempts` 到点熔断，自动止损 |
| 同题生成质量 | 看起来能跑其实跑不了 | `verify.review` + `produces` 实测通过 |
| 同题多次稳定性 | 每次像抽奖，结果参差 | 数据契约压成流水线，可重现可量化 |
| 子任务完整性 | 凭心情跳做 | 契约闭环，少一个都不算完 |
| 状态 / 卡点 | 在模型脑子里，不可见 | `anchor-state.json` 可 `status` 审计 |
| 推进权 | 模型自己说了算 | 引擎用 exit code 说了算 |
| 真实代码修复(lint/TS/格式化) | 模型自觉，修没修全凭运气 | 三类工具 exit 0 守门，跳步/漏修全拦截 |

---

## 五、解决什么问题，效果如何

| 问题 | GateLoop 机制 | 效果 |
|------|----------|------|
| 模型撒谎"验证过了" | exit-code 强制重验（推进前必重跑） | 作弊成本无限高，只能真写对 |
| 长对话状态漂移 | 状态引擎唯一写入者，模型只读 | 状态不可伪造、不丢失 |
| 反复失败死循环 | `maxAttempts` 熔断 + `maxJumps` 环检测 | 自动止损，不再烧 token |
| 阶段间数据对不齐 | `consumes`/`emits`/`readsContext` 契约 | 数据流显式可校验 |
| 大任务一把梭漏做 | `requiresSubtasks` 子任务闭环 | 全绿才推进，零遗漏 |
| 临时文件污染项目 | scratch 隔离 + 72h GC | 项目干净，自动回收 |
| 长任务断点无法续跑 | `producesFresh` + 轮次时间基准 | 防复用旧文件且可续跑 |
| 多 skill 协作信息衰减 | 四条信息管道 + `readsContext` 上下文存档 | 跨 skill 决策/上下文不丢 |

**边界哲学**（这点很关键）：GateLoop 自动闭环只覆盖**开发 + 测试**，到发布就停下——因为"生产环境对不对"脚本验证不了，交给人的经验。三层分工因此完整闭合：

```
脚本（确定的） → exit code 门禁，自动 —— 验证能不能跑通
模型（理解的） → 写代码、做设计，自动 —— 把需求变成代码
人  （不可逆的）→ 发布上线，手动      —— 只有人知道"对不对"
```

**前后对比一句话**：以前 Agent 是"看起来干完"，现在 Agent 是"被引擎证明干完"。从"我相信你"变成"exit code 证明你"。

---

## 六、一句话总结

> **GateLoop = 门控（exit code 守门） + 闭环（执行-验证-修复逼收敛） + 底座（强制推进、数据内联、防衰减）。**
>
> Skill 只声明方法论（What），引擎强制执行纪律（How）——这就是 **Harness + Skill** 的最优组合。

如果你也在做 AI 编程 Agent，不妨把"纪律"从 prompt 里拿出来，交给一个冷酷但可靠的引擎。模型负责想象力，引擎负责确定性。

---

*本文基于开源实现 `src/gateloop`（GateLoop 门控闭环引擎，入口类 `GateLoop`，由历史代号 `Ads` 重命名）整理。欢迎在评论区聊聊你被 Agent "撒谎"坑过的经历。*
