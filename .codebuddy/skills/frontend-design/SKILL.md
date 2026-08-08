---
name: frontend-design
description: >
    前端技术架构设计。路由设计+组件拆分+模块化设计+耦合分析+数据流方案+
    红线约束+性能策略+兼容性策略+交互兜底+技术选型决策树。
    作为代码生成前的独立设计阶段，输出完整 frontendPlan 供下游消费。
    由 ADS harness 驱动，规则由引擎 reads + rulesInline 内联。
    不要用于 UI 视觉设计（→ admin-ui-design）或代码编写（→ frontend-codegen）。
version: 6.0.0
dependencies: []
allowed-tools: [read_file, search_content, search_file, list_dir, RAG_search]
max-token: 1800
---

# 前端技术架构设计 v6.0 — ADS Harness 驱动

> v6.0 核心变更：由 ADS harness 驱动，不再依赖 specflow-rules-engine。
> 规则由 ADS reads + rulesInline 内联，门禁由 ADS verify schema 强制。
> 铁律 1-13 领域知识完全保留，只是注入方式从 use_skill 改为引擎内联。

## ADS Harness 驱动模式

```
传统模式（v5 及之前）               ADS Harness 模式（v6）
──────────────────────              ──────────────────────────
Step 0 use_skill(specflow)  →      ADS reads → rulesInline 内联 RULE.mdc
模型自觉执行 Step 1-6       →      引擎状态机推进 design anchor
模型自报"关卡 PASS"         →      ADS verify schema 校验 frontendPlan
状态在模型脑子里             →      anchor-state.json 引擎唯一写入
断线就丢                     →      nut ads status 随时恢复
```

### 被调用时的指令结构

当 frontend-codegen 的 `nut ads init/next` 推进到 design anchor 时，引擎返回指令包含：

- `brief`: 本阶段目标（产出 frontendPlan）
- `rulesInline`: RULE.mdc 铁律 1-13 已内联（不需要自己 read 或 use_skill）
- `produces`: `.specflow/context/current.json`
- `emits`: `frontendPlan`（产出后引擎自动内联给下游 code anchor）
- `verifyHint`: 引擎将执行 schema 校验

### 模型只做三件事

1. **读指令** — rulesInline（已内联铁律）+ 按需 read references/
2. **执行设计流程** — Phase 0 → Step 1-6（按铁律 1-13）
3. **产出 + 推进** — 写 current.json + emit artifact + `nut ads next`

⚠️ **不要自己声称"设计完成"**，引擎会 schema 校验 frontendPlan 4 张表，缺一不可。

---

## Figma clean-room 契约守卫

当 `.specflow/context/figma-codegen-contract.json` 存在时，Phase 0 必须最先读取并执行：

```text
1. generationMode=clean-room 且 modeLocked=true：禁止改为 enhance-existing。
2. 项目探测只能读取 allowedReadRoots；forbiddenReadRoots 的旧目标组件禁止读取。
3. existingHooksReuse 不得收录 forbiddenReadRoots 内 Hook；覆盖通用"优先复用已有 Hook"规则。
4. 旧组件存在不改变模块边界、DOM 结构或 stagingDir。
5. frontendPlan 必须原样带出 generationMode、stagingDir、finalDir 和 forbiddenReadRoots。
6. 命中禁读路径立即 FAIL，禁止基于已读旧实现继续设计。
```

clean-room 下仍可读取路由、消费页面和公开 API 类型，用于设计 props 与 adapter。

---

## 🛑 入口守卫

```
本 Skill 被 ADS 引擎加载后，必须按 Phase 0 → Step 1-6 顺序执行全部步骤。
规则已由引擎 rulesInline 内联，无需 Step 0 规则注入。

禁止行为：
  ✗ 跳过 Phase 0 直接开始设计
  ✗ 不按铁律 1-13 执行设计决策
  ✗ 无声跳过任何步骤

唯一例外：同会话已执行并播报过的步骤可跳过，但必须声明：
  ⏭️ [跳过] Step N — 理由 | 风险
```

---

## 何时使用 / 何时不使用

**应该触发：**
- "设计前端方案"、"路由设计"、"组件拆分"
- "模块化设计"、"耦合分析"、"技术选型"
- "前端架构方案"、"数据流方案"

**不应触发：**
- UI 视觉设计（→ admin-ui-design）
- 代码编写（→ frontend-codegen）
- 纯技术讨论无输出品

---

## 设计流程总览

```
┌─────────────────────────────────────────────────────────────────┐
│  ADS 引擎返回 design anchor 指令（rulesInline 已内联铁律 1-13）   │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  Phase 0: 上下文注入 — 探测项目现状 + 加载设计规范 + 接口探测    │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  Step 1-3: 路由/布局/架构决策 — 遵循铁律 1-2                     │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  Step 3.5: 模块化设计 → 3.6: 耦合分析 → 3.7: 红线+性能          │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  Step 3.8: 兼容性 → 3.9: 交互兜底 → 3.10: 技术选型              │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  Step 3.11: 函数分类+状态审计+效率审计 — 铁律 11-13（强制）      │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  Step 4: ASCII 线框 → Step 5: 关卡1 → Step 6: 写入 + emit       │
└─────────────────────────────────────────────────────────────────┘
                          ↓
                   nut ads next（引擎 schema 校验）
```

---

## 中断与恢复机制（ADS 引擎驱动）

若执行过程被中断，重新继续时：

1. **查看引擎状态** — `nut ads status <manifest>` 返回当前 anchor + attempt
2. **从断点继续** — 引擎记录了当前进度，无需手动扫描
3. **重做当前阶段** — `nut ads retry <manifest>` 刷新 attemptStartedAt（producesFresh 基准）

```
断线恢复：
  nut ads status <manifest>
  → 当前 anchor: design | attempt: 0/5 | nextAction: 继续设计...
  
  从断点继续执行 Phase 0 → Step 1-6
  完成后 nut ads next <manifest>
```

---

## Phase 0：上下文注入（并行探测）

> 所有设计决策必须基于实际项目上下文，禁止凭空假设。
> 铁律 1-13 已由 ADS rulesInline 内联，无需 use_skill 注入。

### 0.1 项目现状探测（并行）

```
list_dir('.codebuddy/skills')
search_file('package.json')            → 定位前端项目根目录
search_file('tsconfig.json')           → 确认 TS 配置

search_content('path:|Route ', '{项目src}')        → 已有路由
search_content('create\\(|zustand', '{src}/store')  → Zustand stores
search_content('export.*const', '{src}/helpers')     → 可复用 helpers
```

### 0.2 设计规范加载（并行）

```
read_file('references/design-tokens.md')          → 本地设计 Token
read_file('references/layout-rules.md')           → 布局规则

// 知识库检索（背景知识有 UUID 时调用）
RAG_search({
  queryString:"设计Token 色彩系统 间距 圆角 布局约束"
})

search_content('--spacing-|--color-|--radius-', '{src}', '*.{scss,css}')
```

### 0.3 接口探测

```
涉及后端 → search_content('export interface', '{src}/types|{src}/api')
           + search_content('fetch|axios', '{src}/api|{src}/service')
纯前端   → 标记"无后端接口依赖"
```

> 完成播报：`"✅ Phase 0 完成：路由{N}条 Store{K}个 Helpers{J}个 Token已加载"`

---

## 执行步骤

### Step 1：路由冲突检查 → Step 2：布局决策 → Step 3：架构决策

```
遵循 rulesInline 中已内联的铁律 1（布局决策树）、铁律 2（架构决策）进行设计。
路由/数据流/组件拆分/页面路径 全部在此步骤确定。
```

### Step 3.5：模块化设计

```
遵循铁律 3（模块化设计）：
  输出：模块列表 + 目录结构 + 拆分决策 + 接口原则 + 依赖声明
```

### Step 3.6：耦合分析

```
遵循铁律 4（耦合分析）：
  输出：耦合分析报告（评分矩阵 + 健康度判定）
  出现死耦合（≥7分）或循环依赖 → 回退 Step 3.5 重新设计
```

### Step 3.7：红线边界 + 性能策略

```
遵循铁律 5：输出红线文件清单 + 性能策略决策
```

### Step 3.8：兼容性策略

```
遵循铁律 6：输出浏览器目标 + CSS安全/禁止特性 + 降级方案
```

### Step 3.9：交互兜底

```
遵循铁律 7：输出交互7态矩阵 + 数据5态矩阵 + 防呆规则
```

### Step 3.10：技术选型

```
遵循铁律 8：遍历 6 棵决策树，输出每项选型结果
```

### Step 3.11：函数分类 + 状态审计 + 效率审计（强制）

```
遵循铁律 11-13，输出三张表：

1. 【函数归属表】— 铁律 11
   列出页面所有预期函数及其文件归属（utils.ts / api/ / hooks/ / index.tsx）
   标注每个函数的分类依据

2. 【状态分类表】— 铁律 12
   列出所有预期 state 及其归属层（局部useState / 共享Context/Zustand / 派生useMemo）
   扫描 hooks/ 目录已有 hook，标注哪些可复用
   标注同类状态合并方案

3. 【效率审计清单】— 铁律 13
   列出所有 useEffect 的触发条件和依赖
   列出所有接口请求及去重策略
   列出子组件 re-render 控制方案（React.memo / useCallback / useMemo）

🔴 不输出这三张表 = 设计方案不完整 = ADS verify schema FAIL
```

### Step 4：ASCII 线框（强制）

```
遵循铁律 9（线框图规则）：
  用 ┌─┐│└┘├┤┬┴┼ 输出线框图 + 标注尺寸/组件/交互 + 强制约束声明
```

### Step 5：关卡1确认

```
展示线框图，等待用户确认（A确认 / B调整最多2次 / C重做）
ADS 模式下可改为自审（6 项全 ✅ = PASS）：
  □ 布局决策已确定（铁律 1）
  □ 架构决策已确定（铁律 2）
  □ 模块化设计已确定（铁律 3）
  □ 函数归属表已输出（铁律 11）
  □ 状态分类表已输出（铁律 12）
  □ 效率审计清单已输出（铁律 13）
```

### Step 6：写入出参 + emit artifact

```
写入 .specflow/context/current.json → { "frontendPlan": {...} }

产出 artifact（引擎自动管理，下游 code anchor 通过 consumes 获取）：
  nut ads emit <manifest> --key frontendPlan --kind file --path .specflow/context/current.json

推进（引擎 schema 校验 → 通过推进到 code anchor）：
  nut ads next <manifest>
```

---

## frontendPlan 结构契约（ADS verify schema 校验目标）

```
frontendPlan: {
  // 表1 — 函数归属表（铁律11）→ codegen 按此放置函数
  functionOwnership: [
    { name: "formatXxx", file: "utils.ts", category: "纯数据处理", reason: "..." },
    { name: "fetchData", file: "api/", category: "接口请求", reason: "..." },
    { name: "useXxx", file: "hook.ts", category: "状态+副作用", reason: "..." },
    { name: "renderXxx", file: "index.tsx", category: "渲染编排", reason: "..." },
  ],

  // 表2 — 状态分类表（铁律12）→ codegen 按此选择状态容器
  stateClassification: [
    { name: "selectedId", layer: "useState", scope: "局部", reason: "..." },
    { name: "filteredList", layer: "useMemo", scope: "派生", reason: "从list派生" },
    { name: "editData", layer: "Zustand", scope: "共享", reason: "2+组件读写" },
  ],
  existingHooksReuse: [
    { name: "useExistingHook", path: "hooks/use-existing.ts", for: "..." },
  ],

  // 表3 — 效率审计清单（铁律13）→ codegen 按此实现
  efficiencyAudit: {
    effects: [
      { hook: "useEffect", deps: "[categoryId]", purpose: "..." },
    ],
    renderControl: [
      { component: "TreeNode", strategy: "React.memo", reason: "列表子组件" },
      { callback: "handleSelect", strategy: "useCallback", reason: "传子组件" },
    ],
    requestDedup: [
      { api: "getList", strategy: "父请求一次+props传递", reason: "..." },
    ],
  },

  // 表4 — 模块拆分边界（铁律3）→ codegen 按此组织文件
  moduleBoundary: [
    { file: "index.tsx", responsibility: "渲染编排", exports: ["default"] },
    { file: "hook.ts", responsibility: "状态+副作用", exports: ["useXxx"] },
    { file: "utils.ts", responsibility: "纯数据处理", exports: ["formatXxx"] },
  ],

  // 完备性维度（v7 新增·脚本校验字段存在，不校验内容）
  edgeCases: [
    { scenario: "空数据", handling: "Empty 组件 + CTA 按钮" },
    { scenario: "超长文本", handling: "ellipsis + tooltip" },
    { scenario: "并发请求", handling: "Promise.all + 取消" },
  ],
  errorStates: [
    { scenario: "接口失败", handling: "Error 组件 + 重试按钮" },
    { scenario: "权限拒绝", handling: "403 提示 + 联系管理员" },
    { scenario: "网络异常", handling: "全局错误处理 + 重试" },
  ],
  layoutRationale: {  // 仅当布局突破默认决策树时必填，否则可省略
    defaultApplied: "标准列表页",
    alternative: "左右分栏 + 详情 Drawer",
    reasons: ["场景是主从表", "表格列数 >10 需更多空间"]
  },
  splitDecisions: [  // 仅当触发拆分提示但不拆时必填，否则可省略
    { trigger: "JSX>50行", decision: "不拆", reason: "整体可视化性更高" },
  ],
}

🔴 缺任一张表（functionOwnership/stateClassification/efficiencyAudit/moduleBoundary） = ADS verify schema FAIL
🔴 缺 edgeCases / errorStates = 完备性 FAIL
🔴 突破默认布局但未声明 layoutRationale = 完备性 FAIL
🔴 触发拆分提示但既不拆也不声明 splitDecisions = 完备性 FAIL
🔴 这些字段的内容合理性由模型自评（design-metrics 仅回灌事实）
```

---

## architectureReview 产物结构（design 阶段必须产出 · schema 校验存在）

```
architectureReview: {
  verdicts: [
    {
      metric: "A1.模块同构性",
      fact: "pages/dashboard 缺 hook.ts/utils.ts",
      verdict: "真问题",       // 真问题 / 误报 / 不确定
      reason: "dashboard 有数据请求但缺 hook.ts，状态会散在 index.tsx"
    },
    {
      metric: "C2.派生状态误存",
      fact: "filteredList 声明 useState",
      verdict: "误报",
      reason: "filteredList 是用户手动筛选后的结果，有独立 setFilteredList，不是从其他状态计算"
    },
    {
      metric: "C3.弹窗在Store",
      fact: "modalOpen 声明 Zustand",
      verdict: "不确定",
      reason: "需确认是否有跨组件控制场景，编码时再验证"
    }
  ]
}
```

**产出流程**：
1. 产出 frontendPlan 后，跑 `npx nut ads metric architecture --input .specflow/context/current.json`
2. 度量脚本输出候选问题清单（facts）
3. 读 `references/architecture-metrics-checklist.md`，逐条精判
4. 每条 fact 必须给出 verdict + reason，写入 architectureReview

🔴 缺 architectureReview = ADS verify schema FAIL
🔴 architectureReview.verdicts 为空数组 = 未精判 FAIL
🔴 verdict=真问题 但未在 splitDecisions 声明修正计划 = 不一致 FAIL

---

## design-review 产物结构（design 阶段必须产出 · review 门禁校验）

```
design-review: {
  verdicts: [
    {
      "id": "layout-decision",
      "mode": "model",
      "verdict": "pass",
      "evidence": "frontendPlan.layoutRationale.defaultApplied=标准列表页，未突破默认"
    },
    {
      "id": "state-classification",
      "mode": "model",
      "verdict": "fail",
      "evidence": "frontendPlan.stateClassification 中 filteredList 标注 useState，应为 useMemo 派生"
    }
  ]
}
```

**与 architectureReview 的分工：**
- `architectureReview`（铁律14）= 被动响应度量 facts（真问题/误报/不确定），动态、针对度量输出
- `design-review`（铁律15）= 主动质量自评（pass/fail），静态、针对 6 个设计维度本身
- 两者互补：一个查"度量发现的问题"，一个查"设计本身想清楚没"

**产出流程：** 完成 frontendPlan + architectureReview 后，对 6 个维度（布局/模块/状态/函数/耦合/效率）逐条给 verdict+evidence，写入 `.specflow/context/design-review.json`

🔴 design-review.json 缺失 = review 门禁 FAIL
🔴 漏评 / evidence 无 frontendPlan 字段引用（空话）= FAIL
🔴 blocking 项 verdict=fail = 禁止推进

---

## 工具调用顺序

```
ADS 引擎 → rulesInline 内联 RULE.mdc（铁律 1-13 已就绪）
Phase 0 → list_dir+search_file+search_content(×4)+read_file+RAG_search
Step 1-4 → 遵循 rulesInline 中的铁律执行
Step 5 → 关卡确认（或自审 6 项）
Step 6 → 写入出参 + nut ads emit + nut ads next
禁止：写入任何代码文件 / 跳过线框 / 跳过关卡 / 假设技术栈
```

---

## 参考

| 文件 | 内容 | 加载方式 |
|------|------|---------|
| `RULE.mdc` | 铁律 1-13 + 验证清单 | ADS reads → rulesInline 内联 |
| `references/design-tokens.md` | 设计 Token 系统 | Phase 0.2 read_file |
| `references/layout-rules.md` | 布局决策树 + 线框规则 | Phase 0.2 read_file |
| `references/architecture-metrics-checklist.md` | 架构度量步骤指引（脚本粗筛→模型精判） | design 阶段度量后必读 |
