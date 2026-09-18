# DSL vs 代码 逐层对比方法论 — v21

> 模型读 DSL 理解设计稿，读 TSX+SCSS 理解代码，自行匹配对应关系，然后逐层对比。

## 核心流程

```
设计稿侧（DSL）                     代码侧（TSX + SCSS）
┌─────────────────────┐            ┌─────────────────────────┐
│ origin-dsl.json     │            │ 目标组件.tsx             │
│ (Figma DSL 树)      │            │ (JSX 结构 + className)   │
├─────────────────────┤            ├─────────────────────────┤
│ spacing-report.json │            │ 目标组件.module.scss     │
│ (精确盒模型)        │            │ (实际样式值)             │
└─────────┬───────────┘            └─────────┬───────────────┘
          │                                  │
          └──────────┬───────────────────────┘
                     ▼
          ┌─────────────────────┐
          │ 自行匹配             │
          │ 文本 > 结构 > 尺寸   │
          │ > className > 类型   │
          └─────────┬───────────┘
                    ▼
          ┌─────────────────────┐
          │ 7 层逐层对比         │
          │ L1→L2→L3→L4→L5→L6→L7│
          └─────────────────────┘
```

## 自动匹配策略（5 级优先级）

### 优先级 1：文本内容匹配（最可靠）

```
场景：DSL 中有 text 节点，代码中有对应的 JSX 文本

DSL:
  nodeId: "270:29740"
  text: "审核结果"

操作：
  search_content(TSX文件, "审核结果")
  → 找到 <span className={styles.sectionTitle}>审核结果</span>
  → 匹配成功

置信度：0.95（文本唯一性强）
```

### 优先级 2：结构位置匹配

```
场景：DSL 节点路径与 JSX DOM 路径一致

DSL:
  root > children[0] (sidebar) > children[0] (header) > children[0] (title)

Code:
  <div className="layout">      ← root
    <aside className="sidebar">  ← children[0]
      <div className="header">   ← children[0]
        <h1>渠道列表</h1>         ← children[0]

→ 路径一致，匹配成功

置信度：0.90
```

### 优先级 3：尺寸匹配

```
场景：DSL 节点尺寸与 SCSS 中声明的尺寸一致

DSL:
  nodeId: "270:29710"
  width: 200, height: 1008

SCSS:
  .sidebar { width: 200px; height: 1008px; }

→ 尺寸一致，匹配成功

置信度：0.85
```

### 优先级 4：className 语义匹配

```
场景：DSL 节点名称与代码 className 语义相似

DSL:
  node.name = "channel-list" / "Sidebar" / "Tabs-Left"

Code:
  className = "channelList" / "channel_list" / "sidebar" / "tabs-left"

→ 语义相似（忽略大小写/分隔符），匹配成功

置信度：0.80
```

### 优先级 5：组件类型匹配

```
场景：DSL 标注的组件类型与代码使用的组件一致

DSL:
  annotation.component_desc = "tree" / "input" / "button" / "select"

Code:
  <Tree> / <antd Tree> / <Input> / <Button> / <Select>
  或 className 含 "tree" / "input" / "btn" / "select"

→ 类型一致，匹配成功

置信度：0.75
```

### 组合匹配

```
单一策略不确定时，组合 2-3 个策略：

DSL 节点: "审核结果" title, width=698, 在 right-panel 第1个
Code 元素: <div className="section-title">审核结果</div>, SCSS width=698px

→ 文本匹配(0.95) + 尺寸匹配(0.85) + 结构匹配(0.90)
→ 组合置信度 = 0.95（取最高）
```

## 匹配输出格式

```
| # | DSL 节点 | 匹配策略 | 代码 className | 文件:行号 | 置信度 | 备注 |
|---|----------|----------|---------------|----------|--------|------|
| 1 | sidebar | 结构+尺寸 | .sidebar | App.tsx:12 | 0.98 | |
| 2 | 审核结果 title | 文本匹配 | .section-title | AuditPanel.tsx:45 | 0.95 | |
| 3 | channel-list | className | .channel-list | Sidebar.tsx:23 | 0.90 | |
| 4 | 条件1 card | 结构匹配 | .analysis-card | Analysis.tsx:67 | 0.85 | |
| 5 | ??? | [MISSING] | — | — | — | 代码中未找到 |
| 6 | — | [EXTRA] | .custom-wrapper | AuditPanel.tsx:89 | — | DSL 无此节点 |

未匹配统计：
  [MISSING] = 1（代码缺失，需补充）
  [EXTRA] = 1（代码多余或 DSL 未覆盖）
  [UNCERTAIN] = 0
```

## 7 层对比详解

### L1 整体布局层

```
对比内容：
  ① 画布尺寸
     DSL: metadata.width / metadata.height
     Code: 最外层容器的 SCSS width/height 或 100vw/100vh

  ② 区域划分数量
     DSL: root.children.length
     Code: JSX 最外层容器的直接子元素数量

  ③ 主轴方向
     DSL: children top 递增 → column / left 递增 → row
     Code: SCSS display + flex-direction

  ④ 定位策略
     DSL: children position（absolute/relative）
     Code: SCSS position 值
     ❌ 全 absolute → 重构为 flex/grid
```

### L2 区域布局层

```
  ① 区域内排列方式
     DSL: 该区域 children 的 top/left 排列
     Code: SCSS display + flex-direction + gap

  ② 容器尺寸策略
     DSL: annotation.size_preset (fixed/fill/hug)
     Code: SCSS width/height (px/auto/100%)

  ③ 溢出处理
     DSL: annotation.overflow + overflow_axis
     Code: SCSS overflow / overflow-x / overflow-y

  ④ 区域间间距
     DSL: spacing-report.siblings.verticalGap / horizontalGap
     Code: SCSS gap / margin 值
     ❌ 差 > 1px → 修正
```

### L3 组件结构层

```
  ① 组件类型匹配
     DSL: annotation.component_desc (tree/menu/input/button/select)
     Code: JSX 标签名 + 组件类型（antd Tree/Input/Button 等）

  ② DOM 嵌套层级
     DSL: 节点层级深度
     Code: JSX 嵌套深度
     ❌ 冗余嵌套 → 合并单子节点容器

  ③ 条件渲染 / 动态元素
     DSL 有但 Code 中是条件渲染（{showXxx && ...}）→ 标注条件
     DSL 无但 Code 有 → [EXTRA-KEEP]（功能需要）或 [EXTRA-REMOVE]
```

### L4 尺寸间距层（最关键）

```
  ① width/height 精确对比
     DSL: style.width / style.height
     Code: SCSS width / height
     ❌ 差 > 1px → 修正

  ② gap 精确对比
     DSL: spacing-report.siblings.verticalGap / horizontalGap
     Code: SCSS gap / margin
     ❌ 不匹配 → 修正

  ③ padding 精确对比
     DSL: spacing-report.containers.paddingTop/Right/Bottom/Left
     Code: SCSS padding / padding-top 等
     ❌ 不匹配 → 修正（注意非对称 padding）

  ④ border 精确对比
     DSL: spacing-report.containers.border.top/right/bottom/left
     Code: SCSS border-width
     ❌ 不匹配 → 修正

  ⑤ box-sizing 检查
     DSL: spacing-report.containers.border.boxSizing
     Code: SCSS box-sizing
     ❌ 有 border 但 box-sizing 不是 border-box → 必须修正
```

### L5 样式细节层

```
  ① 颜色逐属性对比
     DSL: style.fill（文字颜色）/ background_color（背景色）
     Code: SCSS color / background-color
     ⚠️ 比较前统一格式：rgba→hex，rgb→hex
     ❌ 不匹配 → 修正
     ⚠️ 同容器内不同 text 节点有不同 color → 用 class 分别设置

  ② 字体逐属性对比
     DSL: font_size / font_weight / line_height
     Code: SCSS font-size / font-weight / line-height

  ③ 边框逐属性对比
     DSL: border_width / border_style / border_color + 单边变体
     Code: SCSS border / border-top 等

  ④ 圆角对比
     DSL: border_radius
     Code: SCSS border-radius

  ⑤ 阴影/透明度
     DSL: box_shadow / opacity
     Code: SCSS box-shadow / opacity
```

### L6 交互状态层

```
  ① hover 状态
     DSL: interaction DSL 中 event="hover"
     Code: SCSS :hover 伪类
     → 检查代码中是否有 :hover 规则

  ② selected/active 状态
     DSL: 选中节点有不同背景色/文字色
     Code: .selected / .active class
     → 对比选中态 vs 非选中态的样式差异

  ③ disabled 状态
     DSL: annotation.note 或 interaction DSL
     Code: .disabled class / :disabled 伪类 / aria-disabled
```

### L7 资源层

```
  ① 图标尺寸/位置
     DSL: 容器 width/height + image width/height + left/top
     Code: JSX img/Icon 的尺寸 + SCSS 容器尺寸

  ② 图片裁剪框
     DSL: 容器 overflow:hidden
     Code: SCSS overflow

  ③ 图片 src
     DSL: image src URL (figma-alpha-api...)
     Code: import 的本地资源 / figma URL
     ⚠️ 开发环境可能用本地资源，不一定是 figma URL
```

## 输出格式

```
🔍 7 层对比差异清单：

L1 整体布局：
  □ 画布尺寸：DSL 1688×1008 vs Code 1688×1008 → ✅
  □ 区域数量：DSL 2 vs Code 2 → ✅
  □ 主轴方向：DSL row vs Code flex-direction:row → ✅
  ❌ 数 = 0

L4 尺寸间距：
  □ .sub-tab height：DSL 52px vs Code 54px → ❌ 高度多 2px
  □ .sub-tab box-sizing：DSL border-box vs Code 未设置 → ❌
  □ .confirm-btn margin-left：DSL 15px vs Code 0px → ❌
  ❌ 数 = 3

L5 样式细节：
  □ .chat-content color：DSL #E52E2E vs Code #2B2B2B → ❌
  □ .channel-switch bg：DSL #EBEBEB vs Code transparent → ❌
  ❌ 数 = 2

总计 ❌ = 5
```
