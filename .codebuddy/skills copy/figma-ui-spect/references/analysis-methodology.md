# 从外到内 7 层对比方法论 — v16

> Phase 3 的详细执行指南。为什么从外到内？怎么逐层对比？每层看什么？

## 核心原则

```
从外到内 = 先看整体结构，再看局部细节
  L1 错了 → L2-L7 全部受影响（改了也白改）
  L3 错了 → L4-L5 无从对比（结构不对，尺寸无意义）
  先改外层 → 内层自动归位 → 减少无效修改

反面教材（v15 的问题）：
  拿到 DSL → 直接对比 width/height/gap → 改 → 发现布局还是不对
  原因：跳过了 L1/L2/L3，只看了 L4/L5
```

---

## L1 整体布局层（最外层）

### 对比什么

```
① 画布尺寸匹配
   DSL: metadata.width / metadata.height
   代码: 最外层容器的 width / height
   ❌ 不匹配 → 改容器尺寸

② 区域划分数量
   DSL: 第一层 children 的数量
   代码: 最外层容器的直接子元素数量
   ❌ 不匹配 → DOM 结构需要调整（加/删/合并区域）

③ 主轴方向
   DSL: 第一层 children 的 top 值排列方式
     - top 递增 → flex-direction: column
     - left 递增 → flex-direction: row
     - 混合 → grid 或复杂布局
   代码: display / flex-direction / grid-template
   ❌ 不匹配 → 改主轴方向

④ 整体定位策略
   DSL: 第一层 children 的 position
     - 全 absolute → 可能需要改为 flex/grid（铁律 6 禁止全文 absolute）
     - relative/无 → 正常文档流
   代码: position 使用情况
   ❌ 全 absolute → 重构为 flex/grid
```

### 输出格式

```
L1 整体布局：
  □ 画布尺寸：DSL 208×996 vs 代码 240×900 → ❌ 尺寸不匹配
  □ 区域数量：DSL 3 个区域 vs 代码 2 个区域 → ❌ 缺少底部区域
  □ 主轴方向：DSL 垂直排列 vs 代码 flex-direction:column → ✅ 一致
  □ 定位策略：DSL relative vs 代码 absolute → ❌ 需改为 flex
```

---

## L2 区域布局层

### 对比什么

```
对 L1 划分的每个区域，分析其内部布局：

① 区域内部排列方式
   DSL: 该区域 children 的 top/left 排列
   代码: 该区域的 display / flex-direction

② 容器尺寸策略
   DSL: annotation.size_preset
     - fixed-fixed → width: Xpx; height: Ypx
     - fixed-hug → width: Xpx; height: auto
     - fill-hug → width: 100%; height: auto
     - fill-fixed → width: 100%; height: Ypx
   代码: width/height 值
   ❌ 不匹配 → 改尺寸策略

③ 溢出处理
   DSL: annotation.overflow + annotation.overflow_axis
     - scroll + y → overflow-y: auto
     - scroll + x → overflow-x: auto
     - hidden → overflow: hidden
   代码: overflow 值
   ❌ 不匹配 → 改 overflow

④ 区域间间距
   DSL: 相邻区域的 top 差值
   代码: gap / margin
   ❌ 不匹配 → 改间距
```

---

## L3 组件结构层

### 对比什么

```
① 组件类型匹配
   DSL: annotation.component_desc
     - "tree" → 树组件
     - "menu" → 菜单组件
     - "input" → 输入框
     - "button" → 按钮
   代码: 实际使用的组件（antd Tree/Menu/Input/Button 或自定义）
   ❌ 不匹配 → 可能需要换组件或调整结构

② DOM 嵌套层级
   DSL: 节点层级深度
   代码: DOM 层级深度
   判断：
     - 单子节点容器 → 必须合并（铁律 2）
     - 三层以上嵌套 → 考虑扁平化
   ❌ 冗余嵌套 → 合并

③ 语义化标签
   DSL: annotation.role
     - "layout-container" + 名含"导航" → <nav>
     - "layout-container" + 名含"侧边" → <aside>
     - "layout-container" + 名含"主体" → <main>
     - "component" + "tree" → <nav class="tree">
     - "component" + "button" → <button>
   代码: HTML 标签
   ❌ 不匹配 → 改标签

④ 冗余/缺失层级
   DSL: 实际需要的层级
   代码: 现有层级
   ❌ 有冗余 → 删除中间层
   ❌ 有缺失 → 补充结构层
```

---

## L4 尺寸间距层

### 对比什么（铁律 5a 强制间距检查表）

```
① width/height 精确对比
   DSL: style.width / style.height
   代码: width / height
   ❌ 差>1px → 改

② gap 精确对比
   DSL: spacing-report.siblings.verticalGap / horizontalGap
   代码: flex container 的 gap / 子元素的 margin
   ❌ 不匹配 → 改

③ padding 精确对比
   DSL: spacing-report.containers.paddingTop/Right/Bottom/Left
   代码: 容器的 padding
   ❌ 不匹配 → 改

④ margin 精确对比
   DSL: 元素的 top/left 推算
   代码: margin-top / margin-left
   ❌ 不匹配 → 改

⑤ 间距检查表（铁律 5a 强制输出）
   对每一对相邻 siblings：
     □ 垂直间距 = nextChild.top - (prevChild.top + prevChild.height)
     □ 水平间距 = nextChild.left - (prevChild.left + prevChild.width)
     □ 对照代码：gap / margin / padding 是否等于 DSL 计算值？
```

### 间距检查表输出格式

```
L4 尺寸间距 — 间距检查表：
  容器 [导航分类] padding：
    □ padding-top: DSL 0 vs 代码 0 → ✅
    □ padding-bottom: DSL 562 vs 代码 0 → ❌
    □ padding-left: DSL 0 vs 代码 0 → ✅
    □ padding-right: DSL 0 vs 代码 0 → ✅
  兄弟间距：
    □ title→Slot 垂直: DSL 12 vs 代码 gap:0 → ❌
    □ L1-A→L1-B 垂直: DSL 12 vs 代码 gap:12 → ✅
    □ L2-A→L2-B 垂直: DSL 4 vs 代码 gap:0 → ❌
  ❌ 数 = 3
```

---

## L5 样式细节层

### 对比什么

```
① 颜色逐属性对比
   DSL: background_color / color / border_color（rgba→hex）
   代码: background / color / border-color
   ❌ 不匹配 → 改
   ⚠️ 注意 CSS 变量：DSL 是 hex，代码可能用 var(--xxx)，验证变量值

② 字体逐属性对比
   DSL: font_size / font_weight / line_height / font_family
   代码: font-size / font-weight / line-height / font-family
   ❌ 不匹配 → 改
   ⚠️ font-family 豁免：系统无 PingFang SC 用 Microsoft YaHei 是已知偏差

③ 边框逐属性对比（最易漏）
   DSL: border_width / border_style / border_color + 单边变体
   代码: border / border-top / border-right / border-bottom / border-left
   ❌ DSL 有 border 但代码无 → 必须加 border
   ❌ 看到代码注释"无边框"不信，必须查 DSL

④ 圆角对比
   DSL: border_radius
   代码: border-radius
   ❌ 不匹配 → 改

⑤ 阴影/透明度对比
   DSL: box_shadow / opacity
   代码: box-shadow / opacity
   ❌ 不匹配 → 改
```

---

## L6 交互状态层

### 对比什么

```
① hover 状态
   DSL: interaction DSL 中 event="hover" 或 annotation.note 提示
   代码: :hover 伪类
   ❌ DSL 有 hover 交互但代码无 :hover → 加
   ❌ 代码有 :hover 但样式不匹配 → 改

② selected/active 状态
   DSL: 选中节点（通常有不同背景色/文字色）
   代码: .selected / .active class
   ❌ 选中态样式不匹配 → 改
   ⚠️ 选中态用 margin 不用 height（铁律 3）

③ disabled 状态
   DSL: annotation.note 或 interaction DSL
   代码: .disabled class / :disabled 伪类
   ❌ 缺失 → 加

④ 动画/过渡
   DSL: interaction DSL 的 animation 类型（fade/slide/zoom）
   代码: transition / animation
   ❌ 不匹配 → 改

⑤ data-* 属性标注
   DSL: interaction DSL 的 scene_name / step_index / event
   代码: data-scene / data-step / data-event
   ❌ 缺失 → 加
```

---

## L7 资源层（最内层）

### 对比什么

```
① 图标尺寸/位置
   DSL: 容器 width/height + image width/height + left/top
   代码: 容器尺寸 + img/icon 尺寸 + 定位
   ❌ 不匹配 → 改

② 图片裁剪框
   DSL: 容器 overflow:hidden
   代码: overflow:hidden + position:relative
   ❌ 缺失 → 加

③ SVG 内联组件（v15 铁律）
   DSL: props.src（Figma CDN URL）+ props.format='svg'
   代码: <img src="figma-url"> 或 antd 图标
   ❌ 用 <img src=figma-url> → 必须改为内联 SVG 组件
   ❌ 用 antd 图标 → 必须改为 Figma SVG

④ antd 图标替换
   DSL: Figma 设计稿的特定 SVG
   代码: antd 的通用图标
   ❌ 不匹配 → 替换为内联 SVG 组件
```

---

## 7 层对比完整输出格式

```
🔍 7 层对比差异清单：

L1 整体布局：
  □ 画布尺寸：DSL 208×996 vs 代码 240×900 → ❌
  □ 区域数量：DSL 3 vs 代码 2 → ❌
  □ 主轴方向：垂直 vs column → ✅
  □ 定位策略：relative vs absolute → ❌
  ❌ 数 = 3

L2 区域布局：
  □ 区域1 排列：垂直 vs column → ✅
  □ 区域1 尺寸策略：fixed-fixed vs fixed-fixed → ✅
  □ 区域2 溢出：scroll-y vs visible → ❌
  ❌ 数 = 1

L3 组件结构：
  □ 组件类型：tree vs antd Tree → ✅
  □ DOM 嵌套：3层 vs 5层 → ❌ 冗余
  □ 语义化标签：nav vs div → ❌
  ❌ 数 = 2

L4 尺寸间距：
  [间距检查表...]
  ❌ 数 = 3

L5 样式细节：
  □ 颜色：DSL #1E67FA vs 代码 #1890ff → ❌
  □ 字体：DSL 14px/600 vs 代码 14px/400 → ❌
  □ 边框：DSL 1px #E0E0E0 vs 代码 无 → ❌
  □ 圆角：DSL 2px vs 代码 4px → ❌
  ❌ 数 = 4

L6 交互状态：
  □ hover：DSL 有 vs 代码无 → ❌
  □ selected：DSL #E5EEFF vs 代码 #e6f7ff → ❌
  ❌ 数 = 2

L7 资源：
  □ 图标：DSL SVG vs 代码 antd Icon → ❌
  ❌ 数 = 1

总计 ❌ = 16
```
