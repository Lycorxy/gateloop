---
name: figma-dom-style
description: >-
    Figma 设计稿全流程还原：布局分析 + DOM+Style DSL 输出 + 像素验证。
    合并了布局规划（原 figma-layout-planner）和 DSL 生成两大能力。
    工作流：获取材料(含基线HTML) → 布局分析 → 直接输出完整优化HTML → MCP渲染对比 → 迭代修复。
    通过 checkpoint.json + layout-plan.json 缓存机制防止步骤遗忘和参数遗漏。
    v13.3 核心：修正 z_index 方向检查（区分 overlay 叠加在上→归并 vs occluded 被遮挡→过滤删除两种关系），避免被 card 遮挡的隐藏开关被错误渲染 + 铁律 6b 新增被遮挡元素过滤类型。
    v13.2 核心：新增铁律 3d 叠加兄弟归并规则（Switch/小按钮叠加在 card 右上角的模式必须 nest-into-sibling，禁止拆为独立区块）+ MCP overlay_hint 字段（自动检测小元素与大元素的叠加关系）。
    v2.0 核心：新增自适应三级拆分（Page→Region→Component，blocked→decomposed 不死路）+ 策略级联（A纯flex→B混合→C基线复用，策略C兜底必定达标）+ 局部验证（只看Task bounds内diff，不全页噪声）+ HTML快照自动回退 + GATE硬阻断（5道门禁防偷懒）+ 强制上下文内联（防遗忘）。
    v12.5 核心：新增铁律 0f 禁止复制基线 HTML 布局（仅提取内容）+ Step 3b per-region 门禁（每个区域完成后必检 absolute 转换）、
    GATE 前移（不等 Step 3c，每个区域就检查）、禁止"先保留后用"绝对定位。
    v12.3 核心：MCP 工具优先（figma_to_html 秒出基线 / figma_compare_html_file 一步渲染对比 / calc_spacing 盒模型精确间距）、
    禁止生成脚本文件、直接写真实内容（不用框线图/占位符）、25 项 CSS 转换技巧库（含 T25 inline-tag）、
    绝对定位转换硬性规则（禁止以"对齐精度"为由保留 absolute）、无效迭代检测、冗余元素过滤、
    盒模型精度约束（box-sizing + border + padding 从 spacing-report.json 精确读取，不可目测）、
    文字颜色逐节点提取（禁止用继承色替代 DSL 中的精确 color）、Switch 三层嵌套结构保真。
    触发词：figma还原优化、设计稿分析、布局规划、优化DSL还原、像素级对比迭代、还原度不够、继续优化还原。
    不要用于：单纯 figma 转 DSL、非 Figma 图片对比、纯代码审查、业务逻辑修改、生成最终代码/CSS。
version: 2.1.0
dependencies: [specflow-rules-engine]
conflict-with: []
allowed-tools: [mcp_call_tool, read_file, write_to_file, replace_in_file, search_content, search_file, execute_command]
max-token: 5000
---

# Figma DOM+Style DSL 全流程 v2.0

> **v14 ADS harness 更新**：harness.mjs（803行状态机）废弃，由 ADS 引擎接管。
> 4 个 anchor（materials/layout/reduce/deliver）替代 Step 0-5 + harness 命令。
> 引擎 schema+custom+review 三层门禁替代 GATE 硬阻断。
> 策略级联/局部验证/快照回退保留为模型执行逻辑（RULE.mdc 铁律10-13约束）。

## ADS Harness 驱动模式（v14）

```
传统模式（v2·harness.mjs）           ADS Harness 模式（v14）
──────────────────────              ──────────────────────────
harness.mjs init/status/gate   →    nut ads init/next/status
checkpoint.json 状态源          →    anchor-state.json（引擎管理）
GATE-1/2/3/4 硬阻断             →    ADS verify schema/custom/review
.trimly/tmp/{fileKey}_{nodeId} →    .specflow/context/（统一路径）
模型自觉执行 Step 0-5           →    引擎状态机推进 4 anchor
```

### 启动流程

```bash
MANIFEST=.codebuddy/skills/figma-dom-style/anchor.config.json
nut ads init $MANIFEST --task "还原 Figma <url>"
# 引擎返回 materials anchor 指令（rulesInline 已内联 RULE.mdc）
# 模型执行：MCP 三并行 → 产物写到 .specflow/context/ → nut ads next
# 引擎 producesExist+producesFresh 校验 → 推进 layout → reduce(需SubTask) → deliver(review 6项)
```

### 4 anchor 对应关系

| ADS anchor | 原 Step | verify | 产出 |
|---|---|---|---|
| materials | Step 1 | producesExist+Fresh | origin-dsl.json / spacing-report.json / baseline.html |
| layout | Step 2 | schema+Fresh | layout-plan.json |
| reduce | Step 3-4 | producesExist+Fresh + requiresSubtasks | iter-final.html |
| deliver | Step 5 | **review 6项** | reduce-review.json |

### 模型执行逻辑（ADS 不管，RULE.mdc 约束）

以下领域逻辑由模型在 anchor 内部执行，ADS 只管推进+verify门禁：
- 策略级联 A→B→C（铁律11）
- 局部验证 Task bounds diff（铁律12）
- 快照回退（铁律13）
- 无效迭代检测（铁律6a）
- absolute 转换（铁律3a/3b）
- 盒模型精度（铁律1a/3c）

> **v2.0 更新**（相对 v12.5）：
>
> 1. 新增 **自适应三级拆分**（铁律 10）：Page→Region→Component，Region 无法收敛时自动降级为 Component 级拆分（decomposed 替代 blocked，不死路）
> 2. 新增 **策略级联保证完成**（铁律 11）：策略 A（纯 flex）→ B（混合模式）→ C（基线复用），策略 C 兜底必定达标
> 3. 新增 **局部验证协议**（铁律 12）：只分析当前 Task bounds 内的 diff，消除全页噪声
> 4. 新增 **HTML 快照 + 自动回退**（铁律 13）：修复后 diff 变差自动 revert 到上轮快照
> 5. 新增 **GATE 硬阻断**（铁律 14）：5 道门禁（完成/顺序/策略升级/Integration/上下文），不通过禁止继续
> 6. 新增 **强制上下文内联**（铁律 15）：每次操作前必读文件 + 内联 Task ID/策略/轮次，防遗忘
> 7. 重写 **references/task-queue-guide.md** v2.0：完整的三级拆分 + 策略级联 + 局部验证 + 快照回退 + GATE 规范

> **v12.4 更新**（相对 v12.3）：
>
> 1. 新增 **Step 2c 标注驱动 + 自动识别的任务拆分**：有 `annotation.role === "container"` 标注时按标注拆分，无标注时模型自动按大布局区域拆分（不回退）
> 2. 新增 **Step 3 渐进式实现**：骨架(3a) → 区域逐个实现(3b) → 整合全量检测(3c)，替代 v12.3 单次输出
> 3. 新增 **task-queue.json 状态管理**：每个 Task 独立 status(pending/in_progress/completed/blocked) + diffHistory，支持中断恢复
> 4. 新增 **铁律 0e 标注驱动拆分规则**：禁止拆分未标注 container 的节点，禁止合并已标注 container 的节点
> 5. 新增 **铁律 5a 任务队列检查点**：每个 Task 完成后必须更新 task-queue.json + 播报
> 6. 新增 **references/task-queue-guide.md**：拆分算法 + task-queue.json 格式 + 执行闭环 + 中断恢复 + 自动拆分模式

> **v12.3 更新**（相对 v12.2）：
>
> 1. 新增 **calc_spacing MCP 调用**：Step 1 新增第 3 个并行 MCP 调用，产出 `spacing-report.json`（盒模型精确数据）
> 2. 新增 **铁律 1a spacing-report 消费规则**：box-sizing / border / padding / sibling-gap 必须从 spacing-report.json 精确读取，禁止目测
> 3. 新增 **铁律 3c 盒模型精度约束**：有 border 的元素必须显式设置 box-sizing: border-box（数据源：spacing-report.json 的 border.boxSizing）
> 4. 强化 **铁律 1 文字颜色精度**：每个 text 节点的 color 必须逐节点从 DSL style.fill 提取，禁止用继承色替代（特别注意同容器内不同 text 节点的语义化颜色）
> 5. 扩展 **铁律 3b 第 4 条 Switch 三层嵌套结构**：底板（outer）+ 轨道（track）+ 圆点（dot），禁止合并层
> 6. 检查清单新增第 9-10 项：box-sizing 检查 + 文字颜色逐节点检查

> **v12.2 更新**（相对 v12.1）：
>
> 1. 新增 **铁律 3a 绝对定位转换硬性规则**：iter-{N}.html 中 absolute 节点必须为 0（除例外场景），禁止以"确保对齐精度"为由保留 absolute
> 2. 新增 **铁律 3b 必须保留 absolute 的例外场景**：对话区高亮叠层 / decorator / 图标偏移 / Switch 圆点
> 3. 新增 **铁律 6a 无效迭代检测**：对同一区域连续修改 2 次后 diff 变化 < 0.5% → 立即停止，转向其他区域
> 4. 新增 **铁律 6b 冗余元素过滤**：堆叠统计 Switch / 重复 indicator / placeholder 必须过滤
> 5. Step 3 输出前必检"绝对定位转换检查清单"（8 项）

> **v12.1 更新**（相对 v12.0）：
>
> 1. 新增 **T25 inline-tag 内联浮于文字流** 技巧：精选/HOT/NEW 徽章 + 正文场景，禁止做成 flex-row 两列
> 2. 决策树第 12 步新增 T25 检测（检查 `render_hint.inline_tag` / `style.text_indent`）
> 3. 禁止模式清单新增"inline-tag 模式做成 flex-row 两列"条目
> 4. Step 2a 材料分析新增 inline_tag 标识检测


> **v12.5 更新**（相对 v12.4）：
> 1. 新增 **铁律 0f 基线 HTML 仅作内容参考**：禁止复制基线 HTML 的 absolute 布局结构，仅提取文字/图标 URL/颜色/字体
> 2. 新增 **Step 3b per-region 门禁（v12.5）**：每个 region Task 完成后必须执行 mini absolute-check，检查通过才标记 completed
> 3. 强化 **铁律 3a**：新增 per-region mini-check 流程 + "先保留后用"禁止条款
> 4. 新增 **Step 1 基线 HTML 正确用法速查表**：明确可用/不可用
>
>---
>
> **v12 核心**（相对 v11 的变化）：
>
> 1. **MCP 工具优先**：`figma_to_html` 秒出基线 HTML 作参考；`figma_compare_html_file` 一步完成渲染+对比
> 2. **禁止生成脚本**：严禁创建 .cjs/.js/.mjs 等脚本文件，所有渲染/对比/分析通过 MCP 工具或内置工具完成
> 3. **直接真实内容**：不用框线图/占位符/skeleton 骨架，直接写完整真实的优化 HTML
> 4. **简化工作流**：Step 3A+3B 合并为单 Step 3，一次性输出完整优化 HTML
>
> **沿用 v11**：checkpoint + layout-plan 缓存机制、CSS 技巧库 24 项、像素对比验收、标注驱动、交互 DSL 驱动

> ⚠️ **高频踩坑警示**（v12.3 新增，必读）：
>
> - **box-sizing 遗漏**：有 border 的元素（特别是 active tab、card）必须显式设置 `box-sizing: border-box`，否则 border 会撑高元素 2-4px。数据源：`spacing-report.json` 的 `border.boxSizing`。
> - **文字颜色用继承色**：同容器内不同 text 节点可能有不同 color（语义化颜色），如对话区"被举报人"红色 vs "举报人"深色。必须逐节点从 DSL `style.fill` 提取，禁止用 body/parent 继承色。
> - **非等间距用 gap 统一**：当容器内子元素间距不均匀时（如 divider 到 confirm 15px、confirm 到右边 0px），必须用 `margin-left` 逐个精确控制，禁止用 `gap` 统一。数据源：`spacing-report.json` 的 `siblings[].gap`。
> - **Switch 合并层**：Switch 是三层嵌套（底板 28×18 灰色 + track 20×10 蓝色/灰色 + dot 8.33×8.33 白色），禁止合并为两层或一层。底板 border-radius 通常非对称（如 `0 0 0 4px`）。

> ⚠️ **高频踩坑警示**（v12.1 新增，必读）：
>
> - **inline-tag 模式 ≠ flex-row 两列**：当 DSL 文本节点带 `render_hint.inline_tag` 标识、或 `style.text_indent` + 同父级有 absolute 小尺寸 tag 时，**必须**用 `float:left + 文字流`（技巧 T25），**禁止**用 `display:flex; flex-direction:row` 把 tag 和文字分两列。典型场景：精选/HOT/NEW 徽章紧贴正文首行左侧，文字从 tag 右侧续行。详见 `references/css-technique-library.md` T25。

---

## 1. MCP 工具速查表

> ⚠️ **核心规则**：所有 Figma 数据获取、HTML 渲染、图片对比必须通过 MCP 工具完成。
> **禁止生成脚本文件**（.cjs/.js/.mjs/.ts），**禁止用 `node -e` 执行内联脚本**。

| MCP 工具 | 用途 | 使用步骤 | 关键参数 |
| --- | --- | --- | --- |
| `parse_figma_url` | 解析 URL → fileKey + nodeId | Step 1 | `url` |
| `figma_baseline_compare` | Figma URL → DSL + 原图 + 渲染图 + diff | Step 1 | `url`, `outDir` |
| `figma_to_html` | Figma URL → 基线 HTML（100% absolute） | Step 1 | `url`, `outDir` |
| `figma_to_interaction_dsl` | Figma URL → 交互标注 DSL | Step 2 | `url` |
| `figma_to_dsl` | Figma URL → DSL（手动模式备用） | 备用 | `url`, `outDir` |
| `dsl_to_html` | DSL 文件 → HTML | 备用 | `dslFilePath`, `outDir` |
| `figma_compare_html_file` | **⭐ 核心**：HTML 文件 → 渲染 → 对比原图 → diff | Step 3/4/5 | `url`, `htmlFilePath`, `outDir`, `dslFilePath`, `scale` |
| `figma_compare_dsl_file` | DSL 文件 → 渲染 → 对比 → diff | 备用 | `url`, `dslFilePath`, `outDir` |
| `html_to_image` | HTML 字符串 → PNG | 备用 | `html`, `width`, `height`, `outDir` |
| `compare_image_files` | 两个图片文件对比 | 备用 | `image1Path`, `image2Path`, `dslFilePath`, `outDir` |
| `calc_spacing` | 盒模型间距计算 → spacing-report.json | Step 1 | `url`, `nodeId` |
| `compress_image` | 图片压缩 | 备用 | `imagePath`, `outDir` |

### MCP 调用规则

```
1. 渲染 + 对比 → 一律用 figma_compare_html_file（不要拆成 html_to_image + compare_image_files）
2. 获取基线 HTML → 用 figma_to_html（不要手动解析 DSL 写 HTML）
3. 分析 DSL → 用 read_file + search_content（不要用 node -e 脚本）
4. 图标 URL → 从 figma_to_html 产出的 HTML 或 origin-dsl.json 中用 search_content 提取
5. 无依赖的 MCP 调用 → 并行执行（如 Step 1 的 figma_baseline_compare + figma_to_html）
```

---

## 2. 工作流总览

```
🔒 Step 0:  规则注入 — use_skill(specflow-rules-engine)
   Step 1:  获取基准材料 — MCP(figma_baseline_compare) + MCP(figma_to_html) + MCP(calc_spacing) 三并行
   Step 2:  分析 + 布局方案 + 任务拆分 — MCP(figma_to_interaction_dsl) + read DSL + read spacing-report → layout-plan.json + task-queue.json
   Step 3:  渐进式实现 — 骨架(3a) → 区域逐个实现+验证(3b) → 整合全量检测(3c) → MCP(figma_compare_html_file)
   Step 4:  差异分析+修复 — 看 diff 图，针对性 replace_in_file → MCP(figma_compare_html_file)
   Step 5:  迭代控制 — ≥95% 达标 or 终止

每步完成后必须：
  ① 更新 checkpoint.json（currentStep + completedSteps + artifacts）
  ② 播报完成消息

🚫 禁止行为：
  ✗ 生成 .cjs/.js/.mjs/.ts 脚本文件（用 MCP 工具替代）
  ✗ 用 node -e 执行内联脚本分析 DSL（用 read_file + search_content 替代）
  ✗ 手动用 Playwright/puppeteer 截图（用 figma_compare_html_file 替代）
  ✗ 输出框线图/占位符/skeleton（直接写真实内容）
```

---

## 3. 🛑 入口守卫

```
本 Skill 加载后必须按 Step 0→1→2→3→4→5 顺序执行。
每步必须播报完成消息 + 更新 checkpoint。
未播报 = 未执行 = 违规。

前置条件：
  ① 用户提供有效 Figma URL（含 node-id）
  ② figma-trimly MCP server 已连接（或可降级）
  ③ 临时目录策略：中间产物 → .trimly/tmp/{fileKey}_{nodeId}/
  ④ 模式选择：A 从零设计 / B 已实现优化

禁止行为：
  ✗ 跳过任何步骤
  ✗ 不更新 checkpoint
  ✗ 不播报完成消息
  ✗ 生成脚本文件（.cjs/.js/.mjs/.ts）— 用 MCP 工具替代
  ✗ 用 node -e 执行内联脚本 — 用 read_file + search_content 替代
  ✗ 输出框线图/占位符 — 直接写真实内容
```

---

## Step 0 — 规则注入

```
1. use_skill(specflow-rules-engine) → 注入前端规范
2. read_file(RULE.mdc) → 注入本 Skill 专属规则
3. 确认 MCP server figma-trimly 可用
4. 创建临时目录 .trimly/tmp/{fileKey}_{nodeId}/
5. 初始化 checkpoint.json
```

### checkpoint.json 格式（v12 简化版）

```json
{
  "version": "12.0",
  "figmaUrl": "<Figma URL>",
  "mode": "A",
  "currentStep": "0",
  "completedSteps": ["0"],
  "iteration": 1,
  "similarity": null,
  "artifacts": {
    "dslJson": "origin-dsl.json",
    "spacingReport": "spacing-report.json",
    "baselineHtml": "<figma_to_html 产出的文件名>",
    "originPng": "origin.png",
    "renderPng": "render.png",
    "diffPng": "diff.png",
    "layoutPlan": "layout-plan.json",
    "taskQueue": "task-queue.json",
    "skeletonHtml": "skeleton.html",
    "latestHtml": "iter-{N}.html",
    "latestDsl": "iter-{N}.dsl.json",
    "interactionDsl": null,
    "manifest": "assets/manifest.json"
  },
  "layoutPlanSummary": null,
  "taskQueueSummary": null,
  "history": []
}
```

---

## Step 1 — 获取基准材料 [低自由度 · 强制]

### MCP 工具调用（三个并行）

```
临时目录 = {workspace}/.trimly/tmp/{fileKey}_{nodeId}/

① MCP figma-trimly:figma_baseline_compare
   params: { url: "<Figma URL>", outDir: "<临时目录>" }
   产出：origin-dsl.json / origin.png / render.png / diff.png

② MCP figma-trimly:figma_to_html  ← v12 新增
   params: { url: "<Figma URL>", outDir: "<临时目录>" }
   产出：基线 HTML 文件（100% absolute 定位，含所有真实内容/图标/颜色）
   用途：作为 Step 3 优化参考，从此 HTML 提取真实内容而非手动解析 DSL

   🆕 v12.5 — 基线 HTML 正确用法速查表（铁律 0f 强制）：
   ┌─────────────────────────────────────────────────────┐
   │ ✅ 正确用法（从基线 HTML 提取）：                      │
   │  · 真实文字内容（所有 text 节点的文本）                 │
   │  · 图标图片 URL（所有 <img src="..."> 的 CDN 地址）    │
   │  · 颜色/字体/字号（所有 style 中的精确值）              │
   │  · 图片资源路径（所有图片/头像的 src URL）              │
   │  · z-index 层级关系（谁覆盖谁）                        │
   ├─────────────────────────────────────────────────────┤
   │ 🚫 严禁用法（铁律 0f 禁止）：                         │
   │  · 复制基线 HTML 的整体 DOM 树                        │
   │  · 复制 position:absolute; left:XX; top:YY 定位      │
   │  · 复制 absolute 定位的 width/height                  │
   │  · 以"基线 diff 更低"为由保留 absolute                │
   │  · 将基线 HTML 作为 iter-{N}.html 的模板起点          │
   └─────────────────────────────────────────────────────┘

③ MCP figma-trimly:calc_spacing  ← 🆕 v12.3 新增
   params: { url: "<Figma URL>", nodeId: "<nodeId>" }
   产出：spacing-report.json（每个容器的精确盒模型数据）
   用途：Step 2/3 消费精确的 padding/border/boxSizing/sibling-gap，禁止目测

三个 MCP 调用无依赖，可并行执行。
```

### spacing-report.json 关键字段（v12.3 新增 — Step 2/3 必须消费）

```
每个容器节点包含：
  - paddingTop / paddingRight / paddingBottom / paddingLeft → 精确 padding（px）
  - border: { top, right, bottom, left, boxSizing } → 精确 border-width + box-sizing
  - siblings: [{ from, to, verticalGap, horizontalGap }] → 兄弟元素间精确间距
  - effectiveHeight / effectiveWidth → 包含 padding+border 的实际尺寸
  - firstChildId / lastChildId → 用于 sibling gap 计算

⚠️ 铁律 1a 强制：以上字段必须从 spacing-report.json 读取，禁止从 DSL 目测推算
⚠️ 特别注意 border.boxSizing：有 border 的容器必须设置 box-sizing: border-box
```

### 播报格式

```
📐 [Step 1] 基准材料就绪
  画布: {width}×{height} | 模式: {mode}
  基线 HTML: {baselineHtmlFilename}
  基线 diff: {diffPercent}% | SSIM: {ssim}
  → 进入 Step 2 分析
```

---

## Step 2 — 分析 + 布局方案 [中自由度 · 强制]

### 2a. 材料分析

```
1. MCP figma-trimly:figma_to_interaction_dsl → 获取交互标注
2. read_file(origin-dsl.json) → 读取 DSL 元数据 + 顶层结构
3. search_content(origin-dsl.json, pattern) → 提取：
   - 所有 text 节点内容
   - ⚠️ 每个 text 节点的 style.fill（文字颜色，逐节点提取，不可用继承色）  ← 🆕 v12.3
     特别注意：同容器内不同 text 节点可能有不同 color（语义化颜色）
     典型场景：对话区"被举报人"红色 vs "举报人"深色
   - 所有 #iconfont= / #img= 图标引用
   - 所有 image src URL（用于图标渲染）
   - ⚠️ render_hint.inline_tag 标识（标记 inline-tag 模式，避免被误判为两列布局）
   - ⚠️ style.text_indent 字段（inline-tag 模式的强信号）
4. read_file(baselineHtml) → 读取基线 HTML，提取：
   - 真实文字内容
   - 图标图片 URL
   - 颜色/字体/尺寸样式
5. read_file(spacing-report.json) → 读取盒模型精确数据  ← 🆕 v12.3 新增
   提取每个容器的：
   - border.boxSizing（有 border 的容器必须 box-sizing: border-box）
   - border.top/right/bottom/left（精确 border-width）
   - paddingTop/Right/Bottom/Left（精确 padding）
   - siblings[] 的 verticalGap / horizontalGap（精确间距，非等间距也要记录）
   - effectiveHeight / effectiveWidth（实际尺寸）
```

### 2b. 布局分析 → layout-plan.json

```
基于 DSL 结构 + 基线 HTML，分析：
1. 骨架布局：flex-row / flex-column / grid
2. 区域划分：固定宽度 vs flex:1
3. absolute → flex/grid 转换决策（每节点记录 technique + confidence）
   ⚠️ v12.2 强制：confidence ≥ 0.7 的节点必须转 flex/grid，不允许保留 absolute
   ⚠️ v12.2 例外：铁律 3b 场景用 technique: "keep-absolute-exception"
4. CSS 技巧选择：参考 references/css-technique-library.md
5. 冗余元素识别（v12.2 新增 — 铁律 6b）：
   - 堆叠统计 Switch（同 x 位置，y 间隔 ≤ 20px）→ technique: "filter-redundant"
   - 重复 indicator（相同尺寸+样式）→ technique: "filter-redundant"
   - placeholder/temp/draft 命名元素 → technique: "filter-redundant"

输出 layout-plan.json → write_to_file
```

### layout-plan.json 格式

```json
{
  "version": "1.1",
  "viewport": { "width": 1672, "height": 980 },
  "skeleton": {
    "layout": "flex-row",
    "regions": [
      { "name": "sidebar", "sizing": { "width": "240px", "strategy": "fixed" } },
      { "name": "main", "sizing": { "width": "flex:1", "strategy": "fill" } }
    ]
  },
  "layoutDecisions": [
    {
      "nodeId": "xxx",
      "original": "absolute: left=0, top=0, width=240",
      "optimized": "flex-basis:240px; flex-shrink:0",
      "technique": "T1-flex-layout",
      "confidence": 0.98,
      "reason": "..."
    }
  ],
  "boxModel": {
    "containers": [
      {
        "nodeId": "xxx",
        "boxSizing": "border-box",
        "border": { "top": 0, "right": 0, "bottom": 2, "left": 0 },
        "padding": { "top": 16, "right": 0, "bottom": 36, "left": 0 },
        "effectiveHeight": 52,
        "effectiveWidth": 56,
        "note": "active sub-tab，2px 底边框必须 box-sizing: border-box"
      }
    ]
  },
  "preciseSpacing": {
    "items": [
      {
        "nodeId": "confirm-btn",
        "fromPrevious": "15px",
        "reason": "divider at x=576, confirm at x=592, gap=15px（非等间距，不可用 gap 统一）"
      }
    ]
  },
  "textColors": {
    "items": [
      {
        "nodeId": "chat-content",
        "default": "#E52E2E",
        "overrides": [
          { "text": "举报人：等我两分钟", "color": "#2B2B2B", "class": "dark-text" }
        ],
        "reason": "语义化颜色：被举报人=红色，举报人=深色"
      }
    ]
  },
  "stats": {
    "optimizationRate": "89%",
    "avgConfidence": 0.95
  }
}
```

### 2c. 标注驱动的任务拆分 → task-queue.json  ← 🆕 v12.4

```
基于 layout-plan.skeleton.regions + DSL annotation.role，拆分实现任务：

拆分规则（铁律 0e 强制）：
  ■ 唯一拆分信号：annotation.role === "container" 或 "layout-container"
  ■ 只有标注了 container 的节点 → 拆分为独立 Task
  ■ 未标注 container 的节点 → 不拆分，归入最近的已标注父容器
  ■ 用户通过 Figma 标注控制拆分粒度（标注多=拆分细，标注少=拆分粗）
  ■ 全部不标注 → 模型自动按大布局区域拆分（基于 layout-plan.skeleton.regions，不回退）

任务结构：
  Task-0: skeleton（骨架 — 顶层 flex 结构 + 区域占位标记）
  Task-1 ~ Task-N: region（每个标注 container 的节点一个 Task）
  Task-(N+1): integration（整合 + 全量检测）

每个 Task 记录：
  - id / level / name / scope（nodeId 范围）
  - input（该区域的 DSL + spacing-report + layout-plan decisions）
  - output（填充到 skeleton.html 的对应位置）
  - status（pending / in_progress / completed / blocked）
  - checklist（该区域的精简检查项）
  - diffHistory（每次渲染对比的 diff 记录）

详见 references/task-queue-guide.md

输出 task-queue.json → write_to_file
```

### 播报格式

```
🏗️ [Step 2] 布局方案 + 任务拆分完成
  骨架: {layout} | 区域: {count} | 优化率: {rate}%
  任务队列: {totalTasks} 个 Task（{regionCount} 个区域 + 骨架 + 整合）
  → 进入 Step 3 渐进式实现
```

---

## Step 3 — 渐进式实现 [高自由度 · 核心]  ← 🆕 v12.4 重构

> **v12.4 核心变化**：不再单次输出完整 HTML，改为骨架→区域逐个→整合的渐进式实现。
> 解决大页面注意力衰减、上下文遗忘、diff 无法定位的问题。
> 详见 references/task-queue-guide.md

### Step 3a — 骨架任务 [中自由度 · 强制]

```
1. 读取 layout-plan.json → skeleton.layout + skeleton.regions
2. 读取 task-queue.json → tasks[0] (skeleton)
3. write_to_file(skeleton.html) → 只写顶层结构：
   - root 容器：display:flex; flex-direction:row/column（非 absolute）
   - 每个 region：空容器 + 正确尺寸策略（fixed / flex:1）
   - 每个 region 内放占位标记：<!-- TASK:{taskId} -->
   - 不写具体内容（文字/图标/颜色在 region Task 中填充）
4. MCP figma_compare_html_file → 渲染对比
   - 验证：分区边界与原图一致（±3px 容差）
   - 不要求高相似度（只有空骨架），只验证结构正确
5. 更新 task-queue.json：tasks[0].status = "completed"
6. 播报：✅ [Task-skeleton] 骨架完成 | 分区边界验证通过
```

### Step 3b — 自适应任务执行 × N [高自由度 · 核心]

```
详细规范见 references/task-queue-guide.md v2.0

按 task-queue.json 中 tasks 的顺序，逐个执行。
每个 Task 支持三级策略级联 + 自动降级拆分 + 局部验证 + 快照回退。

每个 Task 执行闭环：

  ① 读取上下文（防遗忘 — 铁律 5a）
     - read_file(task-queue.json) → 获取 currentTask + bounds + strategy
     - read_file(skeleton.html 或 iter-{N}.html) → 获取当前 HTML
     - read_file(layout-plan.json) → 获取该 Task 的 layoutDecisions
     - 内联当前 Task ID + 策略 + 轮次到操作描述中

  ② 策略 A — 纯 Flex/Grid 语义化（默认）
     - replace_in_file：将 <!-- TASK:{taskId} --> 替换为 flex/grid 布局内容
     - 应用 CSS 技巧（T1-T25）+ 铁律 3a/3b/3c/1
     - 保存快照：copy skeleton.html → snapshots/task-{id}-r{M}.html

  ③ per-region absolute 转换门禁（铁律 3a — diff 判定前执行）
     - search_content(HTML, "position:\\s*absolute") → 找 absolute 节点
     - 逐节点检查：是否属于铁律 3b 的 4 种例外
     - 发现非例外 absolute → 立即修复为 flex/grid
     - 不通过 → 禁止渲染对比（GATE 硬阻断）

  ④ MCP figma_compare_html_file → 渲染全页对比
     - 读 diff.png
     - 🆕 v2.0 局部验证：只分析当前 Task bounds 区域内的红色像素
     - 计算 local diff = 红色面积 / bounds 区域面积

  ⑤ local diff 判定 + 策略级联
     - 策略 A: local diff < 1% → completed ✅
     - 策略 A: local diff ≥ 1% → 修复（最多 2 轮）
       → 仍 ≥ 1% → 升级策略 B
     - 策略 B: 混合模式（flex 容器 + absolute 精确子元素）
       → local diff < 0.5% → completed ✅
       → 仍 ≥ 0.5% → 升级策略 C
     - 策略 C: 基线片段复用（从 baseline HTML 提取 + 最小修改）
       → local diff < 0.3% → completed ✅（基线本身必定达标）

  ⑥ 🆕 v2.0 自动降级拆分（替代 blocked）
     - 触发条件：策略 A 连续 2 轮 local diff ≥ 1% + Region 内有 3+ 独立组件
     - 操作：Region Task 标记 decomposed → 自动生成 Component 子 Tasks
     - 每个 Component 独立执行 ②-⑤（策略级联同样适用）
     - 所有 Component completed → Region 自动 completed

  ⑦ 🆕 v2.0 快照回退
     - 修复后 local diff ≥ 上轮 local diff × 0.95（改善不足 5%）
       → 回退到上轮快照 → 升级策略

  ⑧ 更新 task-queue.json（GATE — 不更新禁止标记 completed）
     - status: pending → in_progress → completed / decomposed
     - strategy: A / B / C
     - diffHistory: [{ round, globalDiff, localDiff, strategy }]
     - snapshot: "snapshots/task-{id}-r{M}.html"
     - absoluteCount + absoluteExceptions

  ⑨ 播报（防遗忘 — 每步必播报）
     - 📦 [Task-X] {name} 开始 | 策略: A | bounds: ({x},{y}) {w}×{h}
     - 📊 [Task-X] Round {M} | 策略: {S} | global: {g}% | local: {l}%
     - ✅ [Task-X] {name} 完成 | 策略: {S} | local diff: {x}% | absolute: {n}
     - ⬇️ [Task-X] {name} 降级为 Component 级 | 原因: {reason}
     - ⬆️ [Task-X] 策略升级 A→B | 原因: {reason}
```

### Step 3c — 整合 + 全量检测 [中自由度 · 强制]

```
1. 检查 task-queue.json：所有 Task status ∈ {completed, decomposed}
   - 有 pending/in_progress → 报警：以下 Task 未完成：{list}
   - 全部完成 → 继续

2. 检查 skeleton.html 中是否还有未填充的 <!-- TASK:xxx --> 占位
   - 有 → 报警
   - 无 → 继续

3. 将 skeleton.html 复制为 iter-1.html

4. 执行完整 10 项绝对定位转换检查清单（见下方）

5. 与基线 HTML（figma_to_html 产出）做对比：
   - 基线 HTML 的 absolute 节点数 vs iter-1.html 的 absolute 节点数
   - 确认 iter-1.html 的 absolute 仅限铁律 3b 的 4 种例外 + 策略 B/C 记录的例外
   - absolute 节点数应从基线的 100+ 降至 ≤ 例外数

6. MCP figma_compare_html_file → 全页渲染对比
   - similarity ≥ 95% → 达标，进入交付
   - similarity < 95% → 进入 Step 4 差异修复
     - 读 diff.png 找最大红区
     - 对对应 Task 追加修复轮次（可升级策略）

7. 更新 checkpoint: artifacts.latestHtml = "iter-1.html"
8. 更新 task-queue.json: finalIntegration.status = "completed"
9. 播报最终结果
```

### 🚫 绝对定位转换检查清单（v12.3 沿用 — Step 3c 输出前必检）

> **铁律 3a 强制**：iter-{N}.html 中 absolute 节点必须为 0（除铁律 3b 例外场景外）

```
输出 iter-{N}.html 前，逐项检查以下 10 项（全部 ✓ 才可输出）：

□ 1. root 容器：display:flex（非 position:absolute）
□ 2. sidebar / main：flex item + flex-shrink:0/flex:1（非 absolute）
□ 3. tab-bar：flex-row（非 absolute）
□ 4. dual-panel：flex-row + 左 panel flex:1 + 右 panel flex:1（非 absolute）
□ 5. 左/右 panel 内卡片：flex-column + gap（非 absolute）
□ 6. 卡片内部元素：flex-row/flex-column + gap（非 absolute）
□ 7. footer：flex-row + space-between（非 absolute）
□ 8. 例外场景（铁律 3b）：仅以下允许 absolute
     □ 对话区高亮叠层（rects z-index:0-6 + 文字 z-index:7）
     □ decorator 装饰元素
     □ 图标在裁剪框内的偏移
     □ Switch 圆点在轨道内的偏移

□ 9. 盒模型精度（v12.3 新增 — 铁律 3c 强制）  ← 🆕
     □ 有 border 的元素必须显式设置 box-sizing: border-box
       （数据源：spacing-report.json 的 border.boxSizing）
     □ border-width 精确值来自 spacing-report.json（非目测）
     □ padding 精确值来自 spacing-report.json（非目测）
     □ 非等间距的 sibling gap 用 margin-left 精确控制（非 gap 统一）

□ 10. 文字颜色精度（v12.3 新增 — 铁律 1 强化）  ← 🆕
     □ 每个 text 节点的 color 从 DSL style.fill 逐节点提取
     □ 同容器内不同 text 节点有不同 color 时，用 class 分别设置
     □ 禁止用继承色（body/parent color）替代 DSL 中的精确 color
     □ 特别检查对话区：被举报人 vs 举报人可能有不同颜色

如有任何 ✓ 无法满足 → 禁止输出，必须修正布局
```

### 6 阶段输出策略（沿用 v11）

| 阶段 | 内容 | 参考 |
| --- | --- | --- |
| A. 布局 | flex-row/column、grid、gap | css-technique-library T1-T2 |
| B. 区域 | 固定宽度 vs flex:1、overflow | css-technique-library T3 |
| C. 尺寸/间距 | padding、margin、width/height、box-sizing | spacing-report.json（铁律 1a/3c）+ css-technique-library T2-T3 |
| D. 样式 | color（逐节点）、font、border、background、radius | DSL style.fill + spacing-report.json border |
| E. 资源 | 图标 <img src>、图片背景 | manifest.json |
| F. 交互 | hover、active 状态（如有） | interaction DSL |

### DOM+Style DSL 格式（可选交付物）

> 如需输出结构化 DSL（供 frontend-codegen 消费），在 HTML 验证通过后补充输出。

```json
{
  "type": "dom-style-dsl",
  "version": "1.0",
  "metadata": { "source": { "fileKey": "...", "nodeId": "..." }, "renderSize": { "width": 1672, "height": 980 } },
  "css": {
    "variables": { "--primary": "..." },
    "classes": { ".layout-root": { "display": "flex", "flex-direction": "row" } }
  },
  "dom": {
    "tag": "div", "class": "layout-root",
    "children": [
      { "tag": "aside", "class": "sidebar", "children": [...] },
      { "tag": "main", "class": "main", "children": [...] }
    ]
  },
  "interactions": [],
  "notes": []
}
```

### 播报格式

```
📦 [Step 3c] 整合完成
  相似度: {similarity}% | absolute 节点: {count}（例外: {exceptionCount}）
  任务队列: {completed}/{total} 完成, {blocked} blocked
  检查清单: {10/10 通过 | X 项失败}
  → {≥95% ? "达标" : "需迭代修复"}
```

> ⚠️ **v12.4 强制**：播报中必须包含"任务队列"完成情况和"检查清单"通过情况。
> 如果 absolute 节点 > 0（除例外场景外），禁止播报"达标"，必须回到 Step 3 修正。

---

## Step 4 — 差异分析 + 修复 [中自由度]

```
1. read_file(render.png) → 查看优化版渲染图
2. read_file(diff.png) → 查看差异图（红色=差异区域）
3. read_file(origin.png) → 对比原图
4. 识别差异区域 → 针对性 replace_in_file(iter-{N}.html)
5. MCP figma-trimly:figma_compare_html_file → 重新渲染对比
6. 重复直到 ≥95% 或达到迭代上限
```

### 🚫 无效迭代检测（v12.2 新增 — 铁律 6a 强制）

```
对同一区域连续修改 2 次后，检查 diff 变化：
  if |diff_1 - diff_2| < 0.5% → 判定为无效迭代
    → 立即停止该区域修改
    → 转向其他差异区域
    → 或判定为"字体渲染差异，HTML 层无法修复"

常见无效迭代模式（必须避免）：
  ✗ 反复调整 highlight rects 的 y 坐标（字体替换导致，无法修复）
  ✗ 反复调整文字 line-height / font-size（系统字体度量不同）
  ✗ 反复调整 1-2px 的 padding/margin（差异在噪声范围内）

每次修改后必须用 figma_compare_html_file 验证，禁止"盲改"
```

### 常见差异修复

| 差异类型 | 修复方法 |
| --- | --- |
| 元素位置偏移 | 调整 padding/margin/gap（数据源：spacing-report.json） |
| 文字大小/颜色不符 | 对照 DSL style.fill 逐节点修正颜色（铁律 1）；字号对照 DSL font_size |
| 图标缺失/错误 | 从基线 HTML 提取正确 figmaSrc |
| 背景色不符 | 对照 DSL background_color 修正 |
| 边框/圆角不符 | 对照 spacing-report.json border 字段修正；有 border 时加 box-sizing: border-box（铁律 3c） |
| 元素溢出 | 添加 overflow:hidden 或调整 flex-shrink |
| tag+文字被错排为两列 | 检查 DSL 是否有 `render_hint.inline_tag` / `text_indent`，改用 T25 float:left + 文字流 |
| tab/card 高度多 2px  ← 🆕 v12.3 | 检查 border 元素是否缺少 box-sizing: border-box |
| 对话区文字颜色不对  ← 🆕 v12.3 | 检查同容器内不同 text 节点是否有不同 color（语义化颜色） |
| 按钮间距不对  ← 🆕 v12.3 | 检查 spacing-report.json siblings[].gap，非等间距用 margin-left 精确控制 |
| Switch 缺灰色底板  ← 🆕 v12.3 | 检查 Switch 是否三层嵌套（底板+track+dot），禁止合并层 |

---

## Step 5 — 迭代控制 [低自由度]

```
循环条件：similarity < 95% AND iteration < 5

每次迭代：
  ① 识别 Top 3 差异区域
  ② replace_in_file 针对性修复
  ③ MCP figma_compare_html_file 重新对比
  ④ 更新 checkpoint（iteration++ / similarity）
  ⑤ 播报迭代结果

终止条件：
  ✓ similarity ≥ 95% → 达标，进入交付
  ✗ iteration ≥ 5 → 终止，提示用户手动检查
```

### 交付

```
1. 最终 HTML → iter-{N}.html（临时目录）
2. DOM+Style DSL → iter-{N}.dsl.json（如需）
3. layout-plan.json
4. assets/manifest.json
5. checkpoint.json（完整历史记录）
6. 更新 checkpoint.completedSteps += ["3","4","5"]
```

---

## 错误处理

| 场景 | 处理 |
| --- | --- |
| checkpoint.json 损坏 | 从 Step 0 重新开始 |
| layout-plan.json 缺失 | 回退到 Step 2 重新分析 |
| MCP server 未连接 | block 阻断，提示连接 figma-trimly MCP |
| figma_to_html 失败 | 降级为 figma_to_dsl + 手动分析 |
| calc_spacing 失败 | block 阻断，提示盒模型数据不可用（不可跳过，铁律 1a） |
| figma_compare_html_file 失败 | 降级为 html_to_image + compare_image_files |
| 迭代中途中断 | 恢复时读 checkpoint，从中断处继续 |

---

## 参考资料

| 文件 | 内容 | 加载时机 |
| --- | --- | --- |
| `references/optimization-strategy.md` | 6 阶段详细策略 + 标注驱动 + 交互状态 | Step 3 |
| `references/dsl-format-guide.md` | figma DSL 字段完整说明 | Step 2 |
| `references/layout-analysis.md` | 布局分析完整算法 + CSS 技巧决策树 | Step 2 |
| `references/css-technique-library.md` | ⭐ 25 项技巧（含 T25 inline-tag 内联浮于文字流）+ L1/L2/L3 分级决策树 + DSL→CSS 映射表 + 禁止模式 | Step 2/3 |
| `references/task-queue-guide.md` | 🆕 v12.4 渐进式任务队列：拆分算法（标注驱动+自动识别）+ task-queue.json 格式 + 执行闭环 + 中断恢复 + 自动拆分模式 | Step 2c/3 |
| `references/box-model-analysis.md` | 盒模型 + 居中/间距/撑满技巧（兼容保留） | Step 2 |
| `references/icon-asset-management.md` | 图标资源分离管理规范 | Step 2/3 |
| `examples/trigger-examples.md` | 触发/反触发示例 | 仅供测试 |
| `examples/layout-plan-example.json` | 完整 Layout Plan 示例 | Step 2 参考 |
