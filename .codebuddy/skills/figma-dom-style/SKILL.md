---
name: figma-dom-style
description: >-
  Figma 设计稿 → DOM+Style DSL 提供者。两条路径：
  (A) 从零设计：Figma URL → 提取 figma DSL → 输出 DOM+Style DSL（JSON 结构规格）；
  (B) 已实现优化：用户提供现有代码 + Figma URL → 对比 figma DSL → 调整 DOM 结构/Style 规格，
  严禁修改业务数据和逻辑。
  本 skill 输出 DOM+Style DSL（JSON），不输出 HTML/代码。
  下游 frontend-codegen 消费 DSL 生成业务代码，css-style-writer 消费 DSL 生成最终 CSS。
  验收：DSL → 临时 HTML → Playwright 渲染 → pixelmatch 像素对比 ≥ 95%。
  触发词：figma还原优化、优化DSL还原、像素级对比迭代、还原度不够、继续优化还原、调整布局结构、优化样式结构。
  不要用于：单纯 figma 转 DSL、非 Figma 图片对比、纯代码审查、业务逻辑修改、生成最终代码/CSS。
version: 8.0.0
dependencies: [specflow-rules-engine]
conflict-with: []
allowed-tools: [mcp_call_tool, read_file, write_to_file, execute_command]
max-token: 4000
---

# Figma DOM+Style DSL 提供者 v8

> 本版核心：经验步骤器 + 数据契约调用 MCP（figma-trimly），核心逻辑零 MCP 工具名。输出 DOM+Style DSL（JSON），HTML 仅临时渲染验证。

## 0. 角色边界（强制）

```
本 skill = DOM+Style DSL 提供者
  ✅ 输出：DOM+Style DSL JSON（DOM 树 + CSS 规格 + 交互标注）
  ✅ 渲染：DSL → 临时 HTML → 截图（仅验证用，不交付）
  ❌ 不做：输出 HTML 文件给用户 / 业务代码（→ frontend-codegen）/ 最终 CSS（→ css-style-writer）

强制禁止（详见 RULE.mdc 铁律 0a 业务隔离）：
  ✗ 修改业务数据/逻辑/引入业务代码/输出 HTML/写最终 CSS
```

## 1. 核心思想 + DSL 格式规范

```
输入：Figma URL（+ 可选：用户已实现的代码）
中间产物：原版截图 + figma DSL 测量报告 + 绝对定位渲染图
输出：DOM+Style DSL（JSON 结构规格）+ 验证截图
验收：DSL → 临时 HTML → Playwright 渲染 → pixelmatch 像素对比 ≥ 95%
```

**figma DSL** = 精准"测量报告"；**DOM+Style DSL** = 模型输出的"结构规格"（JSON）；**模型** = 读测量报告输出 DSL；**对比** = 验收。

### 1a. DOM+Style DSL 格式规范

```json
{
  "type": "dom-style-dsl",
  "version": "1.0",
  "metadata": {
    "source": { "fileKey": "...", "nodeId": "...", "url": "..." },
    "renderSize": { "width": 240, "height": 980 },
    "similarity": 98.35,
    "mode": "A | B"
  },
  "css": {
    "variables": { "--color-text-primary": "#131315", "--color-bg-selected": "#E5EEFF" },
    "classes": {
      ".tree": { "width": "240px", "height": "980px", "display": "flex", "flex-direction": "column" },
      ".tree__search": { "height": "64px", "padding": "12px 16px" }
    }
  },
  "dom": {
    "tag": "nav", "class": "tree", "attributes": { "aria-label": "目录导航" },
    "children": [
      { "tag": "div", "class": "tree__search", "children": [
        { "tag": "div", "class": "tree__input", "children": [
          { "tag": "span", "class": "tree__input-text", "text": "请输入分类/导航名称" },
          { "tag": "img", "attributes": { "src": "...", "alt": "搜索" } }
        ]}
      ]}
    ]
  },
  "interactions": [
    { "selector": ".tree__row", "data": { "event": "click", "animation": "none" },
      "states": { "hover": { "background": "rgba(0,0,0,0.02)" }, "selected": { "background": "var(--color-bg-selected)" } } }
  ],
  "notes": ["<!-- 分类树导航模块（最多三层） -->"]
}
```

**字段说明**：`css.variables` 设计 Token | `css.classes` BEM 样式规格（→ css skill）| `dom` 语义化 DOM 树（→ codegen）| `interactions` 交互标注（→ codegen 绑事件）| `notes` HTML 注释

## 2. 🛑 入口守卫

```
本 Skill 加载后必须按 Step 0→1→2→3→4→5→6 顺序执行全部步骤。
每步必须播报完成消息。未播报 = 未执行 = 违规。

禁止行为：
  ✗ 跳过 Step 0 直接执行
  ✗ 不播报完成消息
  ✗ 无声跳过任何步骤
  ✗ 核心逻辑里直接调用 MCP 工具（MCP 调用仅在契约获取子流程）

前置条件：
  ① 用户提供有效 Figma URL（含 node-id）
  ② figma-trimly MCP server 已连接（或可降级）
  ③ 系统已安装 Chrome/Edge（Playwright 渲染用）
  ④ 临时目录策略：中间产物 → .trimly/tmp/{fileKey}_{nodeId}/，最终 DSL JSON + 验证截图 → 用户指定目录
  ⑤ 模式选择：A 从零设计 / B 已实现优化（用户提供 Figma URL + 现有代码）
```

## 3. 何时使用 / 何时不使用

**应该触发：** figma还原优化、优化DSL还原、像素级对比迭代、还原度不够、继续优化还原、调整布局结构、优化样式结构

**不应触发：** 单纯 figma 转 DSL、非 Figma 图片对比、纯代码审查、业务逻辑修改、生成最终代码/CSS

---

## 工作流总览

```
🔒 Step 0: 规则注入 — use_skill(specflow-rules-engine)
Step 1: 获取基准材料 — 契约(figma-baseline) → figma DSL+截图+渲染图
Step 2: 研读材料 — 契约(figma-interaction) → 理解设计意图
Step 3: 输出 DOM+Style DSL — 6 阶段（A→F）
Step 4: 渲染+对比 — 契约(html-render + image-compare) → 像素对比
Step 5: 差异分析+代码质量检查 → 修复
Step 6: 迭代控制 — ≥95% 达标 or 终止条件
```

---

## 中断恢复

```
恢复时读取临时目录 .trimly/tmp/{fileKey}_{nodeId}/：
  - 找到最大 iter-{N}.dsl.json 确定当前轮次
  - 从 Step 4 继续（重新渲染+对比）
  - 临时目录不存在 → 从 Step 1 重新开始
```

---

## 🔒 Step 0 — 规则注入（强制 · 不可跳过）

```
检测 RULE.mdc 是否已注入 → 未注入则 use_skill("specflow-rules-engine")
```

按需注入 references：

| 文件 | 加载时机 |
|------|---------|
| `references/optimization-strategy.md` | Step 3 六阶段详细策略 |
| `references/dsl-format-guide.md` | figma DSL 字段完整说明 |

> **播报：** `✅ [Step 0] 规则注入完成`

---

## Step 1 — 获取基准材料 [低自由度 · 强制]

### 🔒 数据契约：figma-baseline（criticality: required）

详见 `skill.config.yaml` → `step-contracts`。

#### 契约获取子流程

按 providers 链获取 {dsl_json, origin_png, render_png, diff_png}：

```
临时目录 = {workspace}/.trimly/tmp/{fileKey}_{nodeId}/
（fileKey/nodeId 从 parse_figma_url 获取，连字符替为下划线）

优先级 1 — MCP figma-trimly:figma_baseline_compare（存在时必调用）
  params: { url: "<Figma URL>", outDir: "<临时目录>" }
  产出（全部在临时目录）：
    → origin-dsl.json   — figma DSL 测量报告
    → origin.png        — 原版截图（验收标准）
    → render.png        — 绝对定位渲染图
    → diff.png          — baseline 对比图

优先级 2 — fallback: ask-user（最终降级，Figma 数据无内置工具替代）
```

播报：`✅ [Step 1·契约] figma-baseline 已就绪（来源：{MCP/用户}）`
全部失败且 on-missing=block → ⛔ 阻断

⚠️ 禁止将 origin-dsl.json / origin.png / render.png / diff.png 写入用户指定目录

### 核心逻辑（消费契约数据，零 MCP 工具名）

模式 B 额外步骤（已实现优化）：
1. `read_file` 读取用户现有代码 → 临时目录/existing.html
2. 契约 html-render 渲染 existing.html → existing-render.png（见 Step 4 契约）
3. 契约 image-compare 对比 existing-render.png vs origin.png → existing-diff.png + 相似度
4. 记录初始相似度作为优化基线

> **播报：** `📐 基准材料已就绪：临时目录 {路径} | 模式: {A 从零 / B 已实现优化(初始 {N}%)}`

---

## Step 2 — 研读材料 [中自由度 · 强制]

> 本步骤必须执行，不可跳过。理解设计稿 + 标注 + 交互。

### 🔒 数据契约：figma-interaction（criticality: preferred）

#### 契约获取子流程

按 providers 链获取 {interaction_dsl}：

```
优先级 1 — MCP figma-trimly:figma_to_interaction_dsl（存在时必调用）
  params: { url: "<Figma URL>" }
  提取：场景列表 / 节点链路 / 过渡事件 / 过渡动画 / 虚拟节点

优先级 2 — fallback: none（无交互标注则跳过）
```

播报来源。MCP 不可用 → 标注"无交互标注"，继续。

### 核心逻辑（消费契约数据，零 MCP 工具名）

1. 读取渲染图 render.png（终端展示：`node scripts/term-img.cjs "<临时目录>/render.png" 60 mono`）
2. `read_file` 读取 figma DSL 测量报告 origin-dsl.json，提取：
   - metadata: 整体尺寸（width × height）
   - 第一层 children: 区域划分 + top 分布
   - annotation: 布局容器/组件/尺寸策略/角色标注
   - 文字节点: 内容/字号/字重/颜色
   - 图片节点: src URL
3. 若 interaction_dsl 可用 → 提取场景/节点链路/事件/动画/虚拟节点
4. 从 DSL + annotation + interaction 构建"设计意图理解"：
   - 这是什么？（导航/表单/列表/卡片）→ 参考 annotation.component_desc
   - 整体怎么布局？（垂直/水平/固定顶+内容+底）→ 参考 annotation.role
   - 层级关系？交互状态？尺寸策略？溢出处理？

> **播报：**
> `📏 画布 {w}×{h} | {N} 个一级区域 | 📝 {N} 文字节点 | 🖼 {N} 图片节点`
> `🏷 annotation: {关键标注} | 🔗 交互: {N} 场景 {M} 节点（或"无交互标注"）`

---

## Step 3 — 输出 DOM+Style DSL [中自由度 · 强制]

> 核心：6 阶段从整体到局部输出 DOM+Style DSL。详细策略见 `references/optimization-strategy.md`。

### 模式分支

**模式 A（从零设计）**：6 阶段从空白构建 DSL
**模式 B（已实现优化）**：
1. `read_file` 读取现有代码，理解现有 DOM + Style
2. 对照 figma DSL 差异分析（DOM 缺失/多余/层级？Style 值不符？class 不语义化？样式可继承但重复？）
3. 在现有代码上做"最小改动"（✅ 调整 DOM 结构/Style 规格/提取变量；✗ 禁止改业务数据/事件/逻辑）
4. 输出 iter-{N}.dsl.json

### 6 阶段输出（详见 references/optimization-strategy.md）

```
阶段 A — 整体布局设计（确定骨架）
  annotation.role 驱动语义化标签（layout-container→nav/aside/main/section）
  决策树：垂直排列→flex-column | 顶+内容+底→space-between | 左右分栏→flex-row/grid
  原则：用 flex/grid 不逐行 absolute；合并单子节点嵌套（三层变两层）

阶段 B — 区域内部布局（确定排列）+ 标注驱动
  annotation.size_preset 驱动尺寸（fixed-fixed/fill-hug/...）
  annotation.overflow 驱动溢出（scroll+axis→overflow-y/x:auto）
  annotation.position_type 驱动定位（relative/absolute/sticky）
  原则：间距用 padding/margin/gap 不硬算偏移；居中用 flex 不手算

阶段 B 易错自检（写 CSS 前逐条核对）：
  □ body margin:0 padding:0 | □ 行 gap=next.top-(prev.top+prev.height) 非0
  □ 列 gap 同理 | □ 容器 padding-top=首子 top | □ 图标 img 尺寸=DSL image 节点尺寸
  □ border-box 下间距用 margin 非 padding | □ space-between/center 需 DSL 验证

阶段 C — 尺寸和间距（精确还原）
  DSL left/top→padding/margin；相邻 top 差=height+gap；首子 top→padding-top

阶段 D — 样式细节（颜色/字体/边框/圆角）
  rgba→hex 换算；font-family 设父级继承；公共样式提取 class

阶段 E — 资源处理（SVG 优先 + 精确尺寸）
  props.format='svg' → <img> 不设宽高 + 外层 overflow:hidden 裁剪
  props.format='png' → <img> 设精确 width/height
  图标：裁剪框尺寸(容器) ≠ 图标内容尺寸(img)

阶段 F — 交互状态 CSS（从 interaction DSL 驱动）
  有交互数据：data-scene/data-step/data-role/data-event/data-animation 标注
    + 事件→状态CSS（click:active/hover:hover）+ 动画→过渡CSS（fade/slide/zoom）
    + 虚拟节点→CSS骨架（dismiss/clear/loading）
  无交互数据：跳过，标注"仅还原静态视觉"
```

### 输出规则

```
① 每轮 DSL 写入临时目录：iter-{N}.dsl.json
② 从 DSL 生成临时 HTML（仅渲染用）：iter-{N}.html
③ 达标后复制最终 DSL JSON + 验证截图到用户指定目录
④ CSS 规格写 DSL 的 css.classes（BEM，精确值，→ css skill）
⑤ CSS 变量写 css.variables（设计 Token）
⑥ DOM 树写 dom（语义化标签，→ codegen）
⑦ 交互标注写 interactions（data-* + 状态样式，→ codegen 绑事件）
⑧ 图片有 alt；SVG 不设固定宽高；PNG 设精确宽高
⑨ 业务数据 placeholder（模式 A）或保留原代码（模式 B）
⑩ 临时 HTML 不交付（仅渲染验证）
⑪ 禁止 console.log、any、空 catch、硬编码魔法数字
```

> **播报：** `📝 第 {N} 轮 DSL 已生成（布局: {flex/grid/block}，{M} class，{K} 交互节点，模式: {A/B}）`

---

## Step 4 — 渲染 + 对比 [低自由度 · 强制]

### 核心逻辑（DSL → 临时 HTML）

1. 从 DOM+Style DSL 生成临时 HTML（仅用于渲染）：
   - dom.tag → HTML 标签；dom.class → class 属性；dom.attributes → HTML 属性；dom.text → 文本
   - css.variables → `:root { --var: value; }`；css.classes → `.class { prop: value; }`
   - interactions → data-* 属性 + 状态 CSS
   - 临时 HTML 写入 {临时目录}/iter-{N}.html（不交付）

### 🔒 数据契约：html-render（criticality: required）

#### 契约获取子流程

按 providers 链获取 {render_png}：

```
优先级 1 — MCP figma-trimly:html_to_image（存在时必调用）
  params: { html: "<从DSL生成的临时HTML>", width: <figma DSL metadata.width>, height: <metadata.height>, scale: 2, outDir: "<临时目录>" }

优先级 2 — 内置工具降级：execute_command Playwright CLI 渲染

优先级 3 — fallback: ask-user
```

播报来源。全部失败 → block 阻断。

### 🔒 数据契约：image-compare（criticality: required）

#### 契约获取子流程

按 providers 链获取 {diff_png, similarity, ssim}：

```
优先级 1 — MCP figma-trimly:compare_images（存在时必调用）
  对比 iter-{N}-render.png vs origin.png

优先级 2 — 内置工具降级：execute_command html-compare.ts（pixelmatch 脚本）
  diff 图输出到 <临时目录>/iter-{N}-diff.png

优先级 3 — fallback: ask-user
```

播报来源。全部失败 → block 阻断。

### 核心逻辑（消费契约数据，零 MCP 工具名）

1. 基于注入的 render_png + diff_png + similarity + ssim
2. 展示 diff 图（终端字符画）：`node scripts/term-img.cjs "<临时目录>/iter-{N}-diff.png" 60 mono`

> **播报：** `📊 第 {N} 轮: {similarity}% | SSIM: {ssim} | 差异像素: {diff}/{total} ({ratio}%)`

---

## Step 5 — 差异分析与修复 + 代码质量检查 [中自由度 · 强制]

```
相似度 ≥ 95% → 进入代码质量检查（5f）
相似度 < 95% → 按以下顺序排查：

5a. 布局差异（最常见）— diff 大块红色错位
    原因：间距/padding/margin/高度错误 → 对照 DSL top 重新计算 gap

5b. 尺寸差异 — 某区域宽窄高低不对
    原因：width/height 未取 DSL 精确值 → 直接取 DSL style 值

5c. 样式差异 — 颜色/边框/圆角不对
    原因：rgba 换算错误/border 遗漏/radius 遗漏 → 逐属性对比 DSL

5d. 资源差异 — 图标位置红色/图片尺寸不对
    原因：图标尺寸未精确/overflow:hidden 遗漏 → 对照 DSL image 节点

5e. 字体差异（可接受）— 文字区域红色但位置正确
    原因：系统字体 ≠ PingFang SC → 标记"字体差异"，不阻塞达标

5f. 代码质量检查（像素达标后执行）：
    □ 无超过 3 层 DOM 嵌套 | □ 公共样式提取 class | □ 语义化标签
    □ CSS 变量用于颜色/间距 | □ annotation.note→HTML注释 | □ 交互节点 data-*
    □ 图片有 alt | □ 无硬编码魔法数字 | □ overflow/size_preset 已处理
    不达标 → 修复后重新渲染对比
```

> **播报：**
> `🔍 差异定位: {布局/尺寸/样式/资源}问题 → 修复 {具体改动}`
> `📋 代码质量: {通过项数}/{总项数} → {未通过项}`

---

## Step 6 — 迭代控制 [低自由度 · 强制]

```
① similarity ≥ 95% + 代码质量全通过 → ✅ 达标，停下问用户是否继续
② similarity ≥ 95% + 代码质量未通过 → 回 Step 3 修复代码质量
③ iteration ≥ 5 → ⚠️ 已达最大迭代，停下问用户
④ 连续 2 次提升 < 0.5% → ⚠️ 收益递减，停下问用户
⑤ similarity < 95% + 未达上限 → 回 Step 3 修复

达标后输出（交付到用户目录）：
  → iter-{best-N}.dsl.json   — DOM+Style DSL（最终交付物，下游 skill 消费）
  → iter-{best-N}-render.png — 验证截图
  → 对比报告 + 优化摘要 + 交互标注 + 代码质量
  ⚠️ 临时 HTML / diff 图 / origin 图不交付（留在 .trimly/tmp/）
```

---

## 错误处理

| 场景 | 处理 |
|------|------|
| Figma API 失败 | 检查 FIGMA_TOKEN 环境变量 |
| html_to_image 渲染失败 | 检查 Chrome/Edge 是否可调用；降级 Playwright |
| MCP server 未连接 | 提示用户重启 MCP server；html-render/image-compare 降级内置工具 |
| 图片 URL 加载失败 | 用 Figma API 重新导出图片 |
| ❸ figma-baseline 契约失败 | 无内置降级，block 阻断，提示连接 figma-trimly MCP |
| ❸ html-render/image-compare 契约失败 | 降级内置工具（Playwright/pixelmatch）；全失败则 block |

---

## 禁止项

详见 `RULE.mdc` 铁律 6。核心：
- ✗ 输出 HTML 文件给用户（只输出 DOM+Style DSL JSON）
- ✗ 修改业务数据/逻辑/引入业务代码（角色边界）
- ✗ 核心逻辑直接调 MCP（MCP 仅在契约获取子流程）
- ✗ 跳过 Step 2 材料研读直接写代码
- ✗ 逐像素复制 DSL absolute 坐标（用 flex/grid）
- ✗ 忽略 annotation 数据 / 有交互 DSL 不生成状态 CSS
- ✗ 超过 5 次迭代不停止

---

## 参考资料

| 文件 | 内容 | 加载时机 |
|------|------|---------|
| `references/optimization-strategy.md` | 6 阶段详细策略 + 标注驱动映射 + 交互状态 CSS | Step 3 |
| `references/dsl-format-guide.md` | figma DSL 字段完整说明 + 兼容性检查 | Step 2 |
| `examples/trigger-examples.md` | 触发/反触发示例 | 仅供测试 |
| `skill.config.yaml` → `step-contracts` | 数据契约（figma-baseline/interaction/html-render/image-compare） | Step 1/2/4 |
| MCP 工具 | figma_baseline_compare / html_to_image / compare_images / figma_to_interaction_dsl | 契约获取子流程 |
| 终端工具 | scripts/term-img.cjs — 终端显示 diff 图 | Step 2/4 |
| 对比脚本 | packages/figma-trimly/scripts/html-compare.ts — 降级对比 | Step 4 降级 |
