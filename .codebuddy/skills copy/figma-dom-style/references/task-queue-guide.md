# Task Queue Guide v2.0 — 自适应三级拆分 + 局部验证 + 策略级联

> 本文件是 figma-dom-style skill 的**步骤管理器核心**。
> 解决三大问题：怎么拆分、怎么实现、怎么组合，以及防遗忘防偷懒。

---

## 1. 三级拆分架构

```
Page (骨架 Task-0)
  └─ Region (大布局区域 Task-1..N)
       └─ Component (独立卡片/组件 Task-X-Y, 自动降级生成)
```

### 1.1 拆分粒度规则

| 级别 | 拆分依据 | 典型数量 | 验证方式 |
|------|---------|---------|---------|
| Region | 顶层布局区域（header/sidebar/content/footer） | 4-8 | 全页渲染 + diff.png 局部区域分析 |
| Component | Region 内的独立卡片/列表/表单组 | 每个 Region 2-6 个 | 全页渲染 + diff.png 裁剪到 component 边界框 |

### 1.2 自动降级触发条件

```
当 Region Task 满足以下任一条件时，自动降级为 Component 级拆分：

① 连续 2 次修复 diff 变化 < 0.3%（铁律 6a 增强版）
② Region 内有 3+ 个独立卡片/组件
③ Region diff > 2% 且已尝试 2 轮

降级操作：
  1. 将 Region Task 标记为 decomposed（非 blocked）
  2. 自动生成 Component 子 Tasks（每个卡片一个）
  3. 每个 Component Task 独立执行 + 验证
  4. 所有 Component 完成后，Region Task 自动标记 completed
```

---

## 2. 策略级联（Strategy Cascade）

每个 Task 执行时，按以下顺序尝试策略，自动升级：

### 策略 A — 纯 Flex/Grid 语义化（默认）

```
适用：常规布局（列表/卡片组/表单/导航）
执行：用 flex/grid/gap/padding 还原布局，消除所有 absolute
验证：diff < 1% → completed
失败：diff ≥ 1% 且已尝试 2 轮 → 升级到策略 B
```

### 策略 B — 混合模式（Flex 容器 + Absolute 精确子元素）

```
适用：flex 无法精确匹配的卡片（如多行文本对齐、精确像素偏移）
执行：
  - 容器保持 flex（布局骨架）
  - 子元素中"精确位置敏感"的改用 absolute（如 label-value 对齐、图标偏移）
  - 在 task-queue.json 中记录 absolute 例外清单
验证：diff < 0.5% → completed
失败：diff ≥ 0.5% 且已尝试 2 轮 → 升级到策略 C
```

### 策略 C — 基线片段复用（最小修改）

```
适用：策略 A/B 均无法收敛的复杂区域
执行：
  1. 从 baseline HTML 提取该 component 的 DOM 片段
  2. 保留 absolute 定位（不强行转换）
  3. 仅做最小化修改：
     - 提取内联 style 为 CSS class
     - 补充 box-sizing: border-box
     - 确保图片有 alt
  4. 在 task-queue.json 中标注 strategy: "C-baseline"
验证：diff < 0.3% → completed（策略 C 几乎必定达标，因为是基线本身）
注意：策略 C 是最后手段，每个 Task 最多用 1 次
```

### 策略升级流程

```
Task 开始 → 策略 A（round 1）
  → diff < 1%? → completed ✅
  → diff ≥ 1%? → 策略 A（round 2，修复 diff 红区）
       → diff < 1%? → completed ✅
       → diff ≥ 1%? → 策略 B（round 3，混合模式）
            → diff < 0.5%? → completed ✅
            → diff ≥ 0.5%? → 策略 B（round 4）
                 → diff < 0.5%? → completed ✅
                 → diff ≥ 0.5%? → 策略 C（round 5，基线复用）
                      → completed ✅（基线本身必定达标）
```

**关键：策略 C 是兜底，确保每个 Task 最终都能 completed，不会出现 blocked 死路。**

---

## 3. 局部验证协议（Local Diff）

### 3.1 为什么需要局部验证

全页 diff.png 的红区分散在所有 region，无法定位"当前 Task 的问题"。
局部验证 = 只分析当前 Task 边界框内的 diff。

### 3.2 执行方法

```
每次 figma_compare_html_file 后：

① 记录当前 Task 的边界框（从 layout-plan.json 获取）
   bounds = { x, y, width, height }

② 读 diff.png（全页）

③ 只分析 bounds 区域内的红色像素：
   - 该区域红色面积 / 该区域总面积 = local diff %
   - 该区域以外的红色 = 噪声（忽略）

④ 判定：
   - local diff < 阈值 → completed
   - local diff ≥ 阈值 → 修复当前区域
```

### 3.3 边界框获取

```
从 layout-plan.json 的 regions/components 中读取：
  {
    "id": "region-review-left",
    "bounds": { "x": 432, "y": 156, "w": 544, "h": 924 }
  }

如果没有精确 bounds，从 DSL 中对应节点获取。
```

---

## 4. HTML 快照 + 自动回退（Revert）

### 4.1 快照机制

```
每次修复前，保存当前 HTML 为快照：
  iter-{N}.html → snapshot-task-{taskId}-round-{M}.html

修复后对比：
  - diff 变小 → 保留新版本，删除旧快照
  - diff 变大或不变 → 回退到旧快照，尝试下一策略
```

### 4.2 回退规则

```
if (newDiff >= prevDiff * 0.95) {  // 改善不足 5%
  // 回退
  restore snapshot
  // 升级策略
  strategy = nextStrategy(strategy)
}
```

### 4.3 快照文件管理

```
.trimly/tmp/{fileKey}_{nodeId}/
  ├─ iter-1.html              ← 当前工作版本
  ├─ snapshots/
  │   ├─ task-region-header-r1.html
  │   ├─ task-region-header-r2.html
  │   ├─ task-region-sidebar-r1.html
  │   └─ ...
  └─ task-queue.json
```

---

## 5. task-queue.json v2.0 Schema

```json
{
  "version": "2.0",
  "figmaUrl": "string",
  "totalTasks": "number",
  "completedTasks": "number",
  "decomposedTasks": "number",
  "currentTask": "string | null",

  "tasks": [
    {
      "id": "skeleton",
      "level": "skeleton",
      "name": "骨架布局",
      "status": "completed",
      "diffHistory": []
    },
    {
      "id": "region-header",
      "level": "region",
      "name": "顶部导航栏",
      "bounds": { "x": 0, "y": 0, "w": 1920, "h": 60 },
      "status": "completed",
      "strategy": "A",
      "strategyHistory": [
        { "strategy": "A", "round": 1, "diff": 0.3, "result": "pass" }
      ],
      "diffHistory": [
        { "round": 1, "globalDiff": 1.59, "localDiff": 0.3, "ssim": 82.67 }
      ],
      "snapshot": "snapshots/task-region-header-r1.html",
      "absoluteCount": 2,
      "absoluteExceptions": ["decorator-bg-img-1", "decorator-bg-img-2"]
    },
    {
      "id": "region-review-left",
      "level": "region",
      "name": "工单信息列",
      "bounds": { "x": 432, "y": 156, "w": 544, "h": 924 },
      "status": "decomposed",
      "decomposeReason": "策略 A 连续 2 轮 diff ≥ 1%，降级为 Component 级",
      "subTasks": [
        "component-info-card-basic",
        "component-info-card-model",
        "component-info-card-evidence",
        "component-info-card-dialog",
        "component-info-card-account"
      ]
    },
    {
      "id": "component-info-card-basic",
      "level": "component",
      "parentId": "region-review-left",
      "name": "基本信息卡片",
      "bounds": { "x": 452, "y": 216, "w": 504, "h": 88 },
      "status": "completed",
      "strategy": "B",
      "strategyHistory": [
        { "strategy": "A", "round": 1, "diff": 1.2, "result": "fail" },
        { "strategy": "B", "round": 2, "diff": 0.4, "result": "pass" }
      ],
      "diffHistory": [
        { "round": 1, "localDiff": 1.2 },
        { "round": 2, "localDiff": 0.4 }
      ],
      "snapshot": "snapshots/task-component-info-card-basic-r2.html",
      "absoluteCount": 0
    }
  ],

  "finalIntegration": {
    "id": "integration",
    "level": "integration",
    "name": "整合 + 全量检测",
    "status": "pending",
    "checklist": "完整绝对定位转换检查清单"
  }
}
```

---

## 6. GATE 硬阻断规则（防偷懒）

### 6.1 Task 完成 GATE

```
一个 Task 标记为 completed 前，必须满足以下全部条件：

① figma_compare_html_file 已执行（有 diffHistory 记录）
② local diff < 当前策略的阈值
   - 策略 A: local diff < 1%
   - 策略 B: local diff < 0.5%
   - 策略 C: local diff < 0.3%
③ task-queue.json 已更新（status + diffHistory + strategy）
④ 已播报确认消息：✅ [Task-X] {name} 完成 | 策略: {S} | local diff: {x}%
⑤ absolute 节点数已记录（absoluteCount 字段）

缺任一条件 → 禁止标记 completed → 强制继续修复
```

### 6.2 Task 顺序 GATE

```
Task-N 开始执行前，必须满足：
  Task-(N-1) 的 status ∈ {completed, decomposed}

跳过前置 Task → 禁止执行当前 Task
（防止"先做后面简单的再回来做难的"偷懒行为）
```

### 6.3 策略升级 GATE

```
策略升级必须满足：
  ① 当前策略已尝试 ≥ 2 轮
  ② diffHistory 记录了每轮的 diff 值
  ③ 连续 2 轮 diff 变化 < 0.3%

未满足 → 禁止升级策略 → 强制继续当前策略
（防止"一看 diff 高就马上换策略"的偷懒行为）
```

### 6.4 Integration GATE

```
Integration Task 开始前，必须满足：
  所有 Region Task 的 status ∈ {completed, decomposed}
  所有 decomposed 的 Region 的 subTasks 全部 completed

未满足 → 禁止执行 Integration
```

---

## 7. 防遗忘机制

### 7.1 中断恢复

```
模型重新启动时：

① 读 task-queue.json
② 找到 currentTask 字段
③ 找到该 Task 的 status：
   - pending → 从头开始执行
   - in_progress → 读 snapshot 恢复 HTML，从上次 diffHistory 最后一轮继续
   - completed → 跳到下一个 pending Task
④ 播报恢复信息：
   "🔄 恢复执行 | 当前: Task-{X} {name} | 策略: {S} | 上轮 diff: {x}%"
```

### 7.2 状态广播（每步必播报）

```
每个操作后必须播报（写入对话流）：

Task 开始：
  📦 [Task-X] {name} 开始 | 策略: A | bounds: ({x},{y}) {w}×{h}

每轮修复后：
  📊 [Task-X] Round {M} | 策略: {S} | global: {g}% | local: {l}% | {↑/↓/─}

Task 完成：
  ✅ [Task-X] {name} 完成 | 策略: {S} | local diff: {x}% | absolute: {n}

Task 降级：
  ⬇️ [Task-X] {name} 降级为 Component 级 | 原因: {reason}

策略升级：
  ⬆️ [Task-X] 策略升级 A→B | 原因: 连续 2 轮 diff ≥ 1%
```

### 7.3 强制上下文内联

```
每次 replace_in_file 或 write_to_file 前，必须：

① 重新 read_file 当前 HTML（防止文件被外部修改）
② 重新 read_file task-queue.json（获取最新状态）
③ 在操作描述中内联当前 Task ID + 策略 + 轮次

未内联 → 视为"遗忘上下文" → 禁止操作
```

---

## 8. 完整执行流程（v2.0）

```
Step 0: 规则注入
  → use_skill(code-quality-guard) + read RULE.mdc
  → 创建临时目录 + checkpoint.json

Step 1: 获取基准材料（三并行）
  → figma_baseline_compare + figma_to_html + calc_spacing

Step 2: 布局分析
  → 读 DSL + baseline HTML
  → 生成 layout-plan.json（含 region + component 拆分）
  → 生成 task-queue.json v2.0（含 bounds + strategy）

Step 3a: 骨架 Task
  → 写 skeleton.html（纯 flex 结构 + 占位 div）
  → 渲染验证骨架结构

Step 3b: Region/Component Tasks（逐个执行）
  FOR EACH task in task-queue.tasks:
    ① 读 task-queue.json → 获取 currentTask + bounds + strategy
    ② 读 skeleton.html（或 iter-{N}.html）
    ③ 策略 A：用 flex 填充当前 Task 区域
    ④ 保存快照 snapshot
    ⑤ figma_compare_html_file → 获取 diff
    ⑥ 读 diff.png → 分析 local diff（只看 bounds 区域）
    ⑦ local diff < 阈值?
       → YES: 标记 completed, 更新 task-queue.json, 播报
       → NO: 修复 → 重新对比（最多 2 轮）
            → 仍不达标: 升级策略 B → 重复 ③-⑦
            → 策略 B 也不达标: 升级策略 C → 基线复用
            → 策略 C 必定达标
    ⑧ 如果是 Region 且触发降级条件 → 分解为 Component Tasks
    ⑨ 下一个 Task

Step 3c: 整合 Task
  → 所有 Task completed
  → 复制 skeleton.html → iter-1.html
  → 全量对比 + 绝对定位检查
  → 更新 checkpoint.json

Step 4: 差异修复（如 similarity < 95%）
  → 读 diff.png 找最大红区
  → 对对应 Task 追加修复轮次
```

---

## 9. 内容提取协议（Content Extraction Protocol）

### 9.1 从基线 HTML 提取什么

```
✅ 允许提取（内容层）：
  - 文本内容（所有文字、数字、符号）
  - 图片 URL（figma-alpha-api S3 链接）
  - 颜色值（rgba/hex）
  - 精确尺寸（width/height，从 DSL 或 baseline style 中读取）
  - 间距值（gap/margin/padding，从 spacing-report.json 读取）

🚫 禁止复制（布局层）：
  - position: absolute（必须转为 flex/grid）
  - left/top 偏移（必须转为 padding/margin/gap）
  - 嵌套结构（必须根据语义重新组织）
  - z-index 堆叠（必须用 DOM 顺序替代）
```

### 9.2 提取 → 重写映射

```
baseline absolute 定位 → 优化后 CSS：

position:absolute; left:20px; top:16px;  → padding: 16px 20px;
position:absolute; left:64px; top:16px;  → margin-left: 8px; (在前一个元素后)
position:absolute; left:0; top:52px;     → gap: 12px; (父容器 flex-column)
position:absolute; right:0; top:0;       → align-self: flex-end; (或 margin-left:auto)
width: 504px; height: 88px;              → width: 504px; height: 88px; (保留精确值)
```

---

## 10. 与 v1.0 的对比

| 维度 | v1.0 | v2.0 |
|------|------|------|
| 拆分级别 | 2级（Page→Region） | 3级（Page→Region→Component） |
| blocked 处理 | 标记 blocked，等 integration | 自动降级为 Component 级拆分 |
| 策略 | 单一（纯 flex） | 三级级联（A→B→C） |
| diff 验证 | 全页 diff | 局部 diff（bounds 裁剪） |
| 回退机制 | 无 | HTML 快照 + 自动 revert |
| GATE | 软门禁（建议性） | 硬门禁（阻断性） |
| 最终保证 | 可能 blocked 无法完成 | 策略 C 兜底，必定 completed |
