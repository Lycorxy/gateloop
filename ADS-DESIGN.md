# ADS — Anchor-Driven Skill 设计思想

> 一句话：**ADS 是一个 harness（运行时约束器），让 Skill 只写"方法论声明"，把"执行纪律"交给引擎强制保证。**
>
> 模型负责"干活"，引擎负责"把关"。通过与否由 exit code 说了算，模型无法用嘴推进。

---

## 1. 为什么需要 ADS：从"步骤器"到"harness"

### 1.1 传统 Prompt 步骤器的三个致命伤

把方法论写进 System Prompt，让模型"按步骤走"，看起来能用，实则脆弱：

| 问题 | 表现 | 根因 |
|------|------|------|
| **模型会撒谎** | "我已经验证通过了" 但其实没跑 | 步骤是"建议"，没有强制执行点 |
| **状态会漂移** | 长对话后模型忘了自己在第几步 | 状态存在模型脑子里，不可靠 |
| **无法防死循环** | 同一个错误反复修反复错 | 没有熔断，没有"止损"机制 |

### 1.2 harness 的核心转变

ADS 把"纪律"从**模型的自觉**变成**引擎的强制**：

```
传统步骤器                        ADS Harness
─────────────                    ─────────────
模型自己记状态         →          引擎唯一写状态（模型只读）
模型自己说"验证过了"    →          引擎强制重跑验证（exit code 判定）
模型自己找上游数据      →          引擎把上游数据内联进指令
模型自己控制循环        →          引擎熔断计数，超限止损
临时文件随手乱放        →          引擎分配隔离 scratch，自动清理
```

**一句话总结**：Skill 声明"要做什么"（What），ADS 引擎强制"怎么做才算数"（How）。

---

## 2. 四层核心模型

ADS 用四个概念把一个复杂任务的执行结构化：

```
Anchor（锚点/阶段）   = 固定的方法论骨架       design → code → verify
   │
   ├─ SubTask（子任务）  = 运行时在某 anchor 内动态拆出的工作项
   │
   ├─ Artifact（产物）   = 阶段间显式传递的数据（consumes / emits 契约）
   │
   └─ Scratch（临时区）  = 每个任务隔离的临时目录，带生命周期清理
```

| 概念 | 定位 | 是否声明式 | 类比 |
|------|------|-----------|------|
| **Anchor** | 方法论骨架，固定阶段 | 声明（manifest 静态定义） | 生产线的工序 |
| **SubTask** | 阶段内动态工作项 | 运行时动态生成 | 工序内的工单 |
| **Artifact** | 阶段间传递的数据 | 声明契约 + 运行时产出 | 工序间的半成品 |
| **Scratch** | 隔离的临时工作区 | 引擎自动管理 | 工位上的草稿台 |

---

## 3. 七大设计原则（引擎不变量）

这七条是 ADS 的"宪法"，任何 Skill 都无法绕过：

### ① 状态只有引擎能写
- `anchor-state.json` 是唯一真相源，**只有 `writeState()` 内部函数能写**（不导出）。
- 模型能读状态、能通过 API 请求变更，但**不能直接改状态文件**。
- 意义：状态不可伪造、不会漂移。

### ② 通过与否由 exit code 判定
- 验证走真实命令（tsc / ESLint / build / 自定义命令），**exit 0 才算过**。
- 模型说"我验证过了"没用，引擎会**再跑一遍**。
- 意义：作弊成本无限高——你只能真的把代码写对。

### ③ 推进前强制重跑验证（防撒谎）
- `doNext()` 的核心：无论模型声称什么，推进前一定重新执行 `verifyFn`。
- 意义：把"信任模型"变成"验证模型"。

### ④ 规则 / 上游数据内联进指令
- `reads` 声明的规则文件内容 → 自动内联进 `rulesInline`。
- `consumes` 声明的上游 artifact → 自动内联进 `artifactsInline`。
- 意义：模型不需要自己去 read / 猜文件名，减少上下文摩擦和出错面。

### ⑤ 大任务动态拆子任务，全绿才推进
- `requiresSubtasks: true` 的阶段，子任务未全部 `done` → **拒绝推进**。
- 意义：复杂阶段被强制拆解闭环，避免"一把梭"漏做。

### ⑥ 阶段间数据走 artifact 契约，不靠猜
- 上游 `emits` 产出，下游 `consumes` 消费，key 显式对齐。
- `emits` 声明了却没 `emit` → **拒绝推进**。
- 意义：数据流从"隐式约定"变成"显式契约"，可校验。

### ⑦ 连续失败熔断，避免死循环
- 每阶段有 `maxAttempts`（manifest / anchor 两级），超限 → `escalated` 熔断。
- 意义：止损机制，避免无意义地烧 token 反复失败。

---

## 4. 数据流：一次 `next()` 内部发生了什么

`doNext()` 是整个 harness 的心脏，它的门禁顺序是刻意设计的：

```
调用 next()
   │
   ├─ [门禁1] requiresSubtasks？ ── 子任务未全绿 ─→ 拒绝推进（advanced=false）
   │
   ├─ 强制重跑 verifyFn（真实命令，exit code 判定）
   │
   ├─ [门禁2] emits 声明的 artifact 是否已产出？ ── 缺失 ─→ 验证失败
   │
   ├─ attempts++（记录本轮尝试）
   │
   ├─ 验证未通过？
   │     ├─ attempts >= maxAttempts ─→ 🛑 熔断（escalated）
   │     └─ 否则 ─→ status=failed，返回错误让模型修复
   │
   └─ 验证通过？
         ├─ status=passed，推进到下一 anchor
         │   （刷新下一阶段的 startedAt / attemptStartedAt）
         └─ 已是最后阶段 ─→ done=true，清理 workspace（保留 artifacts）
```

**关键点**：门禁 1（子任务）在验证之前，门禁 2（artifact）并入验证结果——这保证"结构完整性"和"内容正确性"都被卡住。

---

## 5. 断点续跑：`producesFresh` 的坑与修复

### 5.1 问题
`producesFresh` 校验"产物文件必须比阶段开始时间新"，防止模型复用上一次的旧文件蒙混过关。

但如果基准用**首次进入阶段的 `startedAt`**，断点续跑时会出 bug：
- 任务恢复后重做本阶段，产物 mtime 可能早于 `startedAt` → **永远判定为"旧文件"，卡死**。

### 5.2 修复
引入 **`attemptStartedAt`（本轮尝试开始时间）** 作为 fresh 校验基准：

```
首次进入阶段：startedAt = attemptStartedAt = now
断点续跑重做：retry() 刷新 attemptStartedAt = now（startedAt 不变）
fresh 校验基准：attemptStartedAt（而非 startedAt）
```

意义：既能防复用旧文件，又能正确支持断点续跑。

---

## 6. 临时工作区（Scratch）生命周期

每个任务分配一个隔离目录，避免临时文件污染项目、避免多任务互相干扰：

```
.specflow/scratch/<taskId>/
   ├─ workspace/    ← 临时草稿、中间产物（reset / done 时清理）
   └─ artifacts/    ← 阶段正式产出（供下阶段读，完成后可保留供审计）
```

生命周期管理：

| 时机 | 动作 | 函数 |
|------|------|------|
| init | 创建隔离目录 + GC 过期残留 | `initScratch` + `gcScratch` |
| 运行中 | 分配临时文件 / 子目录 | `tmpFile` / `tmpDir` |
| done | 清理 workspace，保留 artifacts | `cleanupScratch(full=false)` |
| reset | 连 artifacts 一并删除 | `cleanupScratch(full=true)` |
| 进程崩溃残留 | 按 mtime 超期（默认 72h）回收 | `gcScratch` |

`taskId` = `时间戳前缀 + 短随机`（如 `20260731143450-be3e9cc3`），既可人类排序又保证唯一。

---

## 7. 架构分层

```
┌─────────────────────────────────────────────┐
│  CLI (src/cli/ads.ts)  —  nut-ads 命令行入口   │
│  init / next / status / check / retry /       │
│  reset / gc / subtask-add / subtask-done/emit │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│  引擎入口 (src/ads/index.ts)  —  Ads 类        │
│  封装状态机 + 验证器 + 工作区，暴露 harness API  │
└───────┬───────────────┬───────────────┬──────┘
        │               │               │
┌───────▼──────┐ ┌──────▼──────┐ ┌──────▼──────────┐
│ state.ts     │ │ verify.ts   │ │ workspace.ts    │
│ 状态机        │ │ 验证器       │ │ 临时区生命周期    │
│（唯一写入者）  │ │（exit code） │ │（scratch/GC）    │
└──────────────┘ └─────────────┘ └─────────────────┘
        │
┌───────▼──────┐
│ types.ts     │  全部契约类型（Manifest / State / Instruction ...）
└──────────────┘
```

| 文件 | 职责 |
|------|------|
| `types.ts` | 所有契约类型定义（Manifest / State / SubTask / Artifact / Instruction） |
| `state.ts` | **唯一状态写入者**：init / doNext / 子任务 / artifact / retry / reset |
| `verify.ts` | 验证器：schema / lint / tsc / build / test / custom / producesFresh |
| `workspace.ts` | scratch 目录分配 / tmpFile / cleanup / GC |
| `index.ts` | `Ads` 类，对外统一 API |
| `cli/ads.ts` | `nut-ads` 命令行，Skill 与引擎交互的入口 |

---

## 8. Skill 如何接入：只需一个 `anchor.config.json`

Skill 作者不写任何执行逻辑，只声明一份 manifest：

```jsonc
{
  "name": "frontend-dev",
  "description": "前端开发方法论",
  "scratchDir": ".specflow/scratch",
  "scratchGcHours": 72,
  "maxAttempts": 5,
  "anchors": [
    {
      "id": "design",
      "name": "技术设计",
      "brief": "拆分组件、设计数据流，产出 frontendPlan",
      "reads": [".codebuddy/rules/frontend.mdc"],
      "produces": ["frontend-plan.json"],
      "emits": ["frontendPlan"],
      "verify": { "schema": { "type": "object", "required": ["components"] } }
    },
    {
      "id": "code",
      "name": "编码实现",
      "consumes": ["frontendPlan"],
      "requiresSubtasks": true,
      "maxAttempts": 8,
      "verify": { "tsc": true, "lint": true, "build": true }
    }
  ]
}
```

声明即能力：一份 manifest 就自动获得状态机 + 强制验证 + 子任务闭环 + artifact 管道 + 熔断 + scratch 隔离 + 断点续跑**全部能力**。

---

## 9. CLI 命令速查

```bash
# 初始化任务（自动建 scratch + GC 残留）
nut-ads init <manifest> --task "实现用户列表页"

# 推进（内部强制验证 + 子任务闭环 + artifact 校验 + 熔断）
nut-ads next <manifest>

# 断线恢复：查看当前在哪一步
nut-ads status <manifest>

# 手动验证当前阶段（不推进）
nut-ads check <manifest>

# 重做前刷新 fresh 基准（断点续跑）
nut-ads retry <manifest>

# 动态拆子任务 / 完成子任务
nut-ads subtask-add  <manifest> --desc "实现列表分页" [--id x] [--produces "a,b"]
nut-ads subtask-done <manifest> --id design-sub-1

# 阶段间传数据
nut-ads emit <manifest> --key frontendPlan --kind file  --path artifacts/api.json
nut-ads emit <manifest> --key config       --kind value --value '{"a":1}'

# 重置 / 回收过期临时目录
nut-ads reset <manifest>
nut-ads gc    <manifest>
```

---

## 10. 一句话回顾

> **ADS = 状态引擎唯一写入 + exit-code 验证 + 强制重验防作弊 + 动态子任务闭环 + artifact 数据契约 + 熔断止损 + 临时区隔离清理 + 断点续跑。**
>
> Skill 只声明方法论（What），引擎强制执行纪律（How）——这就是 harness + skill 的最优组合。
