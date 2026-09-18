# 模型分析策略 — v16 7 层对比推理指南

> v16 变更：从 v12 的"6 阶段分析"升级为"7 层从外到内对比"。
> 详细方法论见 `analysis-methodology.md`。本文件保留具体的模式识别和映射规则。

## 核心原则

**DSL 是测量报告，不是施工图纸。** 模型读 DSL 理解设计稿后，用最优的 DOM+CSS 结构还原。
现有代码是基线，本 skill 让现有代码与 DSL 对齐（最小改动）。

**v16 核心理念：先分析后修复。**
- Phase 1 先理解现有代码的布局/样式/交互特征
- Phase 2 再理解设计稿的布局/样式/交互特征
- Phase 3 从外到内 7 层对比（L1整体→L7资源）
- Phase 4 规划修复方案后才开始改

## 1. 7 层对比流程（v16 · 从外到内 · 详见 analysis-methodology.md）

```
L1 整体布局层 — 画布尺寸/区域数量/主轴方向/定位策略
L2 区域布局层 — 区域内部排列/尺寸策略/溢出处理/区域间距
L3 组件结构层 — 组件类型/DOM嵌套/语义化标签/冗余层级
L4 尺寸间距层 — width/height/gap/padding/margin（+间距检查表）
L5 样式细节层 — 颜色/字体/边框/圆角/阴影
L6 交互状态层 — hover/selected/active/disabled/动画/data-*
L7 资源层 — 图标尺寸位置/裁剪框/SVG内联组件/antd图标替换

每层独立对比，先外后内，不可跳层。
```

## 2. 阶段 A — 整体布局

### 分析步骤

```
① 看 metadata.width/height → 画布尺寸
② 看第一层 children 的 top 值 → 区域划分
   例：top:0 菜单列表 / top:940 底部触发器
   → 这是一个"上方内容 + 底部固定"的结构
③ 看最外层容器的 border → 是否有边界线
④ 看 annotation → 布局容器？溢出处理？

决策树：
  全部垂直排列（top 递增）→ flex-direction: column
  顶部 + 内容 + 底部 → flex + justify-content: space-between
  左右分栏 → flex-row / grid-template-columns
  复杂网格 → grid
```

### 合并嵌套规则

```
单子节点容器 → 必须合并
  判断：父容器无背景/无边框/无圆角/仅一个子节点
  操作：去掉父容器，把子节点直接提升到祖父层
  效果：三层变两层，CSS 更简洁

例（必须合并）：
  菜单项容器 { w:208, h:40, 无样式 }
    └ 子容器 { w:78, h:20, 仅用于包裹图标+文字 }
       ├ 图标
       └ 文字
  → 菜单项容器 { w:208, h:40, display:flex, align-items:center, gap:8px }
       ├ 图标
       └ 文字
```

## 3. 阶段 B — 区域布局

### 搜索框模式

```
DSL:
  Input { w:192, h:40, left:8, top:12, border:1px #E0E0E0, radius:2px }
    ├ text { left:12, top:10, "请输入分类/导航名称" }
    └ icon { w:16, h:16, left:164, top:12 }

输出:
  .search {
    width: 192px; height: 40px;
    margin: 12px 8px 0;         ← top:12 → margin-top:12, left:8 → margin-left:8
    border: 1px solid #E0E0E0;
    border-radius: 2px;
    display: flex;
    align-items: center;         ← text top:10 + line-height:20 → 垂直居中用 flex
    justify-content: space-between;  ← text left:12 + icon left:164 → 两端对齐
    padding: 0 12px;             ← left:12 缩进
    overflow: hidden;
  }
```

### 菜单列表模式

```
DSL:
  菜单项 top: 0/52/104/156/208/260/312/364/416/468
  每项 height: 40px
  → 间距 = 52 - 40 = 12px

输出:
  .menu {
    display: flex;
    flex-direction: column;
    gap: 12px;                   ← 相邻 top 差 52, 高 40, 间距 12
  }
  .menu-item {
    width: 208px;
    height: 40px;                ← DSL 精确值
    display: flex;
    align-items: center;         ← 垂直居中
  }
```

### 菜单项缩进（用 padding-left 反映层级）

```
一级菜单（有图标+文字）:
  DSL: 图标 left:20, 文字 left:36（或 left:22 在 78px 容器内）
  → padding-left: 20px

二级菜单（有箭头+文字）:
  DSL: 箭头 left:36, 文字 left:58
  → padding-left: 36px（图标用 absolute 或 flex 前置）

三级菜单（仅文字）:
  DSL: 文字 left:72
  → padding-left: 72px

原则：用 padding-left 反映层级，不要每个元素都 absolute left
```

### 选中行模式

```
DSL:
  选中背景 { w:192, h:40, left:8, top:0, bg:#E5EEFF, radius:2px }
  文字 { left:58, top:10, color:#1E67FA }
  拖拽图标 { w:12, h:12, left:157, top:14 }
  more图标 { w:12, h:12, left:177, top:14 }

输出:
  .menu-item.selected {
    position: relative;
    background: #E5EEFF;          ← 背景直接设在行上
    border-radius: 2px;
    color: #1E67FA;
  }
  .menu-item.selected .drag {
    position: absolute;           ← 右侧图标用 absolute（无法用 flex 精确到 157/177）
    right: 39px;                  ← 208 - 157 - 12 = 39
    top: 50%;
    transform: translateY(-50%);
  }
  .menu-item.selected .more {
    position: absolute;
    right: 19px;                  ← 208 - 177 - 12 = 19
    top: 50%;
    transform: translateY(-50%);
  }

注意：选中行的右侧悬浮图标用 absolute 是合理的（它们不在正常文档流中）
```

## 4. 阶段 C — 尺寸和间距

### DSL → CSS 精确映射

| DSL 字段 | CSS 属性 | 说明 |
|----------|---------|------|
| `width: "208px"` | `width: 208px` | 直接取值 |
| `height: "40px"` | `height: 40px` | 直接取值 |
| `left: "16px"` | `padding-left: 16px` 或 `margin-left: 16px` | 上下文决定 |
| `top: "12px"` | `padding-top: 12px` 或 `margin-top: 12px` | 上下文决定 |
| `padding: "20px 16px"` | `padding: 20px 16px` | 直接取值 |
| 相邻元素 top 差 52px | `gap: 12px`（高度 40px） | 计算得出 |
| `border_width: "1px"` | `border-width: 1px` | 直接取值 |

### 间距计算规则

```
容器内第一个子元素的 top → padding-top
容器内最后一个子元素的 bottom → padding-bottom
相邻兄弟的 top 差 → gap（推荐）或 margin-bottom
兄弟之间 left 差 → gap 或 margin-right

⚠️ 关键：如果 DSL 用 absolute 定位，top 值是相对于容器的
         转为 CSS 时必须减去容器自身的 padding
```

## 5. 阶段 D — 样式细节

### 颜色转换

```
rgba → hex:
  rgba(30,103,250,1) → #1E67FA
  rgba(229,238,255,1) → #E5EEFF
  rgba(184,184,184,1) → #B8B8B8
  rgba(82,82,82,1) → #525252
  rgba(255,255,255,1) → #FFFFFF 或 #fff
  rgba(235,235,235,1) → #EBEBEB

带透明度的：
  rgba(0,0,0,0.1) → 保留 rgba 写法或用 opacity
```

### 字体

```
font_family: "PingFang SC" → font-family: "PingFang SC", "Microsoft YaHei", sans-serif
font_size: "14px" → font-size: 14px
font_weight: 600 → font-weight: 600
font_weight: 400 → font-weight: 400（或省略，默认值）
line_height: "20px" → line-height: 20px
```

### CSS 继承优化

```
body 或最外层容器设：
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 14px;
  color: #525252;

子元素只需覆盖不同的：
  .selected { color: #1E67FA; }
  .title { font-weight: 600; }
  .placeholder { color: #B8B8B8; }
```

## 6. 阶段 E — 资源处理（SVG 优先 + 精确尺寸）

### SVG vs PNG 判断

```
DSL image 节点的 props.format 字段：
  'svg' → 矢量图标（VECTOR/BOOLEAN_OPERATION 节点导出）
  'png' → 位图（含 IMAGE fill 的节点导出）
  无 format → 兜底按 PNG 处理
```

### SVG 图标渲染（props.format === 'svg'）

```
关键：不设 img 的 width/height，让 SVG 按原始矢量尺寸渲染

DSL 结构：
  容器 { w:16, h:16, overflow:hidden }  ← 裁剪框
    └ image { w:13.02, h:13.42, left:1.6, top:1.38 }  ← SVG 矢量图

正确输出：
  <div style="width:16px;height:16px;overflow:hidden;position:relative">
    <img src="{svg-url}" alt="图标"
         style="position:absolute;left:1.6px;top:1.38px">
  </div>
  ← img 不设 width/height，SVG 按原始 13.02×13.42 渲染
  ← 外层 overflow:hidden 裁剪超出 16×16 的部分

错误输出（会导致拉伸）：
  <img src="{svg-url}" width="16" height="16">  ← ✗ SVG 被拉伸到 16×16
```

### PNG 图标渲染（props.format === 'png'）

```
DSL 结构：
  容器 { w:16, h:16, overflow:hidden }
    └ image { w:13.02, h:13.42, left:1.6, top:1.38 }

正确输出：
  <div style="width:16px;height:16px;overflow:hidden;position:relative">
    <img src="{png-url}" alt="图标"
         style="width:13.02px;height:13.42px;position:absolute;left:1.6px;top:1.38px">
  </div>
  ← img 设精确 width/height（从 DSL 取）
```

### 图标尺寸取值规则

```
1. 外层容器的 width/height = DSL 容器的 style.width/height（裁剪框）
2. img 的 width/height = DSL image 节点的 style.width/height（精确值）
3. img 的 left/top = DSL image 节点的 style.left/top（容器内偏移）
4. 外层容器设 overflow:hidden + position:relative
5. img 设 position:absolute

示例（搜索图标）：
  DSL: 容器 16×16 overflow:hidden → image 13.02×13.42 left:1.6 top:1.38
  HTML: <div style="width:16px;height:16px;overflow:hidden;position:relative">
          <img src="..." alt="搜索" style="width:13.02px;height:13.42px;position:absolute;left:1.6px;top:1.38px">
        </div>
```

## 7. 差异分析修复指南（v12 · 不渲染对比）

### 布局差异（区域错位 / 整体偏移）

```
症状：大块区域错位、整体偏移
排查（在响应中分析，不生成 diff 图）：
  1. 检查 gap/margin 值是否 = DSL 的 top 差值
  2. 检查 padding 是否等于第一个子元素的 left/top
  3. 检查容器高度是否正确（可能因为子元素高度问题被撑开）
修复：
  用 replace_in_file 重新对照 DSL 计算间距
```

### 尺寸差异（某区域比原图宽/窄）

```
症状：某元素宽度/高度不对
排查：
  1. 检查 width/height 是否取了 DSL 的精确值
  2. 检查是否有 border 影响了盒模型（box-sizing: border-box）
修复：
  取 DSL style.width/height 精确值，replace_in_file 改 SCSS
```

### 样式差异（颜色/边框/圆角不对）

```
症状：颜色不对、边框缺失、圆角不对
排查：
  1. 颜色是否从 DSL rgba 正确换算为 hex
  2. border 是否遗漏了 border-style（solid/dashed）
  3. border-radius 是否遗漏
修复：
  逐属性对照 DSL，replace_in_file 改 SCSS
```

### 资源差异（图标位置/尺寸不对）

```
症状：图标周围有问题
排查：
  1. 图标尺寸是否精确
  2. overflow: hidden 是否设置
  3. img src 是否正确
修复：
  对照 DSL image 节点的精确尺寸，replace_in_file 改 SCSS/TSX
```

### 字体差异（标注为已知偏差）

```
症状：文字渲染有差异但位置精准
原因：系统没有 PingFang SC，用了 Microsoft YaHei，反走样不同
处理：标注为"字体渲染差异"（⚠️ 已知偏差），不阻塞修复
```

## 8. 禁止模式

```
✗ 全文 absolute 定位 → 能用 flex/grid/block 就不用 absolute
✗ 三层嵌套不合并 → 单子节点容器必须扁平化
✗ 手算居中偏移 → 必须用 flex align-items:center / justify-content:center
✗ 忽略 vcenter hint → 这是 Figma 的垂直居中标记
✗ 跳过阶段 A 直接写样式 → 必须先确定整体布局
✗ 忽略 annotation 数据 → role/component_desc/note/size_preset/overflow 都要用
✗ 有交互 DSL 不生成交互状态 → data-* 属性 + 状态 CSS
✗ 全文内联 style → 超过 3 个相同样式提取为 class
✗ 硬编码颜色 → 用 CSS 变量 :root { --primary: #1E67FA; }
✗ border-box 下用 padding-bottom 制造间距（间距必须用 margin）
✗ 相邻行只设 height 不检查 top 差（gap 被漏掉）
✗ margin-left:auto 推到右边缘不验证 right 间距
```

## 9. 标注驱动的语义化映射

### annotation.role → HTML 标签

```
role = "layout-container" → <nav> / <aside> / <main> / <section>
  判断依据：
    节点名含"导航/sider/menu" → <nav>
    节点名含"侧边/aside" → <aside>
    节点名含"主体/content/main" → <main>
    其他 → <section>

role = "component" + component_desc = "tree" → <nav class="tree">
role = "component" + component_desc = "table" → <div class="table">
role = "component" + component_desc = "form" → <form>
role = "component" + component_desc = "button" → <button>

无 annotation → <div>
```

### annotation.size_preset → CSS 尺寸策略

```
fixed-fixed → width: 237px; height: 921px;（完全固定）
fixed-hug → width: 237px; height: auto;（宽定高不定）
fill-hug → width: 100%; height: auto;（撑满宽度）
fill-fixed → width: 100%; height: 600px;（撑满固定高）
fill-fill → width: 100%; height: 100%;（完全填充）
```

### annotation.overflow → 滚动容器

```
overflow = "scroll" + overflow_axis = "y"
  → overflow-y: auto;
  → 容器需要固定 height（从 DSL 取）

overflow = "scroll" + overflow_axis = "x"
  → overflow-x: auto;
  → 容器需要固定 width

overflow = "hidden"
  → overflow: hidden;
```

### annotation.note → HTML 注释

```
note = "最多两层节点"
  → <!-- 最多两层节点 -->

note = "需防抖处理"
  → <!-- 需防抖处理 -->
```

### annotation.component_desc → class 命名

```
component_desc = "tree"
  → .tree / .tree-item / .tree-children / .tree-selected

component_desc = "button"
  → .btn / .btn-primary / .btn-icon

component_desc = "input"
  → .input / .input-search / .input-label
```

## 10. 交互 DSL 驱动的状态 CSS

### 交互节点 data 属性标注

```
从 figma_to_interaction_dsl 获取的交互数据：
  scene_name: "交互场景1"
  step_index: 0, role: "entry"
  event: "click", animation: "fade"
  next_node: { id: "2091:72324", name: "Rectangle" }

HTML 标注：
  <div class="menu-item selected"
       data-scene="交互场景1"
       data-step="0"
       data-role="entry"
       data-event="click"
       data-animation="fade"
       data-next="2091:72324">
```

### 事件类型 → 状态 CSS

```
event = "click":
  [data-event="click"] { cursor: pointer; }
  [data-event="click"]:active { opacity: 0.8; transform: scale(0.98); }

event = "hover":
  [data-event="hover"]:hover { background: var(--hover-bg); }

event = "dblclick":
  [data-event="dblclick"] { cursor: pointer; user-select: none; }

event = "longpress":
  [data-event="longpress"] { touch-action: none; }

event = "swipe":
  [data-event="swipe"] { touch-action: pan-y; }

event = "timer":
  [data-event="timer"] { /* 自动触发，无需用户交互样式 */ }

event = "scroll":
  [data-event="scroll"] { scroll-behavior: smooth; }
```

### 动画类型 → 过渡 CSS

```
animation = "fade":
  [data-animation="fade"] { transition: opacity 0.3s ease; }

animation = "slide":
  [data-animation="slide"] { transition: transform 0.3s ease; }

animation = "zoom":
  [data-animation="zoom"] { transition: transform 0.2s ease; }

animation = "slide-up":
  [data-animation="slide-up"] { transition: transform 0.3s ease; }

animation = "none":
  无过渡 CSS
```

### 虚拟节点 → CSS 骨架

```
virtual_type = "dismiss":
  [data-virtual="dismiss"] { display: none; }

virtual_type = "clear":
  [data-virtual="clear"] { visibility: hidden; }

virtual_type = "loading":
  [data-virtual="loading"] { position: relative; pointer-events: none; }
  [data-virtual="loading"]::after {
    content: ''; position: absolute; top: 50%; left: 50%;
    width: 16px; height: 16px; margin: -8px 0 0 -8px;
    border: 2px solid #ccc; border-top-color: var(--primary);
    border-radius: 50%; animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

virtual_type = "loading-end":
  [data-virtual="loading-end"] { opacity: 1; transition: opacity 0.3s; }

virtual_type = "refresh":
  [data-virtual="refresh"] { animation: pulse 0.5s ease; }
  @keyframes pulse { 50% { opacity: 0.5; } }

virtual_type = "redirect":
  [data-virtual="redirect"] { cursor: pointer; }
```

## 11. 代码质量检查清单（v12 · 修复后自检）

```
修复完成后，逐项检查：

□ DOM 结构
  □ 无超过 3 层嵌套（单子节点容器已合并）
  □ 语义化标签（nav/main/section/ul/li/button）
  □ annotation.note → HTML 注释

□ CSS 质量
  □ 公共样式提取为 class（非全文内联 style）
  □ CSS 变量用于颜色/间距（:root { --primary: #1E67FA; }）
  □ 无硬编码魔法数字（间距/颜色都从 DSL 取值或用变量）
  □ 可继承样式不重复写（font-family/color 设在父级）

□ 标注驱动
  □ annotation.role → 语义化标签
  □ annotation.size_preset → 尺寸策略
  □ annotation.overflow → 溢出处理
  □ annotation.component_desc → class 命名

□ 交互驱动（如有交互 DSL）
  □ 交互节点有 data-* 属性
  □ 事件类型 → 状态 CSS（:hover/:active/cursor）
  □ 动画类型 → 过渡 CSS（transition）
  □ 虚拟节点 → CSS 骨架

□ 可访问性
  □ 图片有 alt 属性
  □ 按钮用 <button> 标签
  □ 列表用 <ul>/<li> 标签

□ 业务隔离
  □ 业务代码原样保留（事件处理 / Hook / 数据绑定 / 条件渲染）
  □ 仅修改结构层（DOM 标签 / class / data-* / CSS 属性）
```
