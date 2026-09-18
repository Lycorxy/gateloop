# 布局分析参考文档（Step 2b 完整算法）

> 本文件在 Step 2b 执行时加载，为布局分析提供完整算法参考。

---

## 1. 骨架分析算法

### 1.1 布局方向检测

```
输入：parent.children[] 的 bounds (x, y, width, height)
输出：direction = 'column' | 'row' | 'grid' | 'stack' | 'absolute'

算法：
1. 排除 bounds 重叠 > 50% 的节点 → 标记为 stack

2. 将非 stack 节点按 y 排序：
   - 如果所有 |xi - x0| < 3 → direction = 'column'

3. 将非 stack 节点按 x 排序：
   - 如果所有 |yi - y0| < 3 → direction = 'row'

4. 检测网格规律：
   - 分行：y 值相近（差 < 10）的为一行
   - 检查每行列数是否一致
   - 是 → direction = 'grid'，记录 columns/rows

5. 以上都不满足 → direction = 'absolute'
```

### 1.2 间距检测

```
输入：同方向排列的 children
输出：gapValue | 'irregular'

算法：
1. 按排列方向排序
2. 计算相邻元素间距 gaps = [child[i+1].start - child[i].end]
3. 计算方差 variance = var(gaps)
4. variance < 4 → gapValue = round(mean(gaps))
5. variance >= 4 → 'irregular'
```

### 1.3 尺寸策略推断

```
输入：node, parent
输出：sizingStrategy

规则：
1. node.width ≈ parent.width - 2*padding → width: auto (或 100%)
2. node.height 未知/可变 → height: auto
3. node.width == 固定值 且不接近 parent → width: {value}px
4. 多个兄弟等宽 → flex:1 或 grid fr
5. 标注 sizeMode=fill → flex:1
6. 标注 sizeMode=hug → width: fit-content
```

---

## 2. CSS 技巧替代决策树

### 2.1 居中检测

```
条件：
  水平居中：|node.x - (parent.width - node.width)/2| < 3
  垂直居中：|node.y - (parent.height - node.height)/2| < 3

方案：
  - 水平+垂直居中 → parent: display:flex; justify-content:center; align-items:center
  - 仅水平 → child: margin: 0 auto （或 parent flex + justify-content:center）
  - 仅垂直 → parent: display:flex; align-items:center
```

### 2.2 等间距检测

```
条件：sibling gaps 方差 < 4

方案：
  - parent: display:flex; gap:{mean}px
  - 方向取决于排列方向
  - 如果有 wrap 行为 → flex-wrap:wrap
```

### 2.3 撑满宽度检测

```
条件：node.width ≈ parent.width - padding.left - padding.right (±3px)

方案：
  - width: auto（parent 已有 padding）
  - 或 width: 100%（parent 无 padding 但有 box-sizing: border-box）
  - 不用写精确 px
```

### 2.4 贴边检测

```
条件：
  - node.x ≈ 0 (或 padding) → 贴左
  - node.x + node.width ≈ parent.width → 贴右
  - node.y ≈ 0 → 贴顶
  - node.y + node.height ≈ parent.height → 贴底

方案：
  - 贴底 → 在 flex column 中用 margin-top:auto
  - 贴右 → 在 flex row 中用 margin-left:auto
  - 多个元素分散 → justify-content: space-between
```

### 2.5 叠层检测

```
条件：节点 bounds 与兄弟重叠 > 50%

方案：
  - 父容器 position:relative
  - 叠层节点 position:absolute + z-index
  - 这是唯一合理使用 absolute 的场景（除装饰元素外）
```

### 2.6 装饰元素检测

```
条件：
  - 节点无文本内容
  - 面积很小（< parent 10%）
  - 位于角落或边缘
  - 标注 role=decorator

方案：
  - ::before / ::after 伪元素
  - 减少 DOM 节点
```

### 2.7 inline-tag 内联标签检测（v12.1 新增）

```
条件（满足任一即可，按优先级）：
  ① DSL 文本节点带 render_hint.inline_tag 标识 ← figma-trimly 已识别的最强信号
  ② DSL 文本节点 style.text_indent 存在 + 同父级有 absolute 定位的小尺寸兄弟容器
  ③ 视觉判断：小 tag（宽 < 100px）与宽文本（宽 > 300px）在 (0,0) 起点 absolute 重叠
     + 文字前导有多个 nbsp（已被 figma-trimly 转为 text_indent）

⚠️ 与 2.5 叠层检测的区别：
  - 2.5 叠层：两节点 bounds 重叠 > 50%（如弹窗+遮罩），用 absolute + z-index
  - 2.7 inline-tag：tag 小 + 文字宽，部分重叠在首行，用 float:left + 文字流

方案（详见 css-technique-library.md T25）：
  ✅ 推荐：tag float:left + 文字正常流（text-align:justify + word-break:break-all）
  ✅ 备选：absolute + text-indent（仅当 tag 高度 > 第一行 line-height 时）
  🚫 禁止：flex-direction:row 把 tag 和文字分两列（用户反馈过，绝对不能这么写）

典型场景：精选/HOT/NEW 徽章 + 正文、楼主/置顶徽章 + 评论、原创/转载标签 + 文章摘要
```

### 2.8 margin 塌陷规避

```
场景：垂直方向相邻块元素的 margin 会塌陷

规避方案：
  1. 用 padding 替代 margin（推荐）
  2. 用 flex/grid 的 gap（最优）
  3. 如果必须用 margin → 只给一个方向（不同时设 margin-top 和 margin-bottom）

在布局分析中：
  - 相邻元素间距 → 优先转为父容器 gap
  - 首尾元素间距 → 转为父容器 padding
  - 避免在 layout-plan 中输出 margin（除 margin-auto 推边方案）
```

---

## 3. 组件模式识别库

### 3.1 列表组件

```
特征：
  - 3+ 同级节点
  - 结构高度一致（子节点类型/数量相同）
  - 等间距排列
  - 可能含图标+文字组合

方案：
  - 父容器 flex column + gap
  - 每项为 flex row（图标+文字）
  - 不需要 absolute
```

### 3.2 网格/卡片布局

```
特征：
  - 等宽等高的矩形区块
  - 行列规律排布
  - 间距一致

方案：
  - display: grid
  - grid-template-columns: repeat(N, 1fr)
  - gap: {value}px
```

### 3.3 三段布局（Header-Content-Footer）

```
特征：
  - 3 个区块垂直排列
  - 顶部/底部高度固定
  - 中间区域占满剩余

方案：
  - 父容器 flex column, height:100%
  - header: flex-shrink:0
  - content: flex:1, overflow-y:auto
  - footer: flex-shrink:0
```

### 3.4 侧边栏布局

```
特征：
  - 左侧窄区域 + 右侧宽区域
  - 或反过来

方案：
  - 父容器 flex row
  - sidebar: width: 固定值 或 fit-content
  - main: flex:1
```

### 3.5 树形/缩进结构

```
特征：
  - 节点包含子列表
  - 子列表相对父有缩进
  - 递归结构

方案：
  - 每层 padding-left 增加缩进（如 16px/层）
  - 不用 absolute + left 偏移
  - 不用 margin-left（避免塌陷）
  - flex column 自然流
```

### 3.6 弹窗/模态

```
特征：
  - 蒙层覆盖全屏
  - 内容居中
  - z 层级高于其他

方案：
  - overlay: position:fixed, inset:0, display:flex, align/justify:center
  - modal: 固定宽度或 max-width
```

### 3.7 Tab 组件

```
特征：
  - 标签栏 + 内容区
  - 标签为一行等宽/自适应按钮
  - 当前状态高亮

方案：
  - 标签栏: flex row
  - 内容区: 独立 DOM，通过 data-state 切换显示
  - 当前标签: 通过 CSS 类或 data-active 样式
```

---

## 4. 标注数据映射表

| 标注字段 | 布局决策 |
|---------|---------|
| `role=container` | flex/grid 容器，检测子节点排列方向 |
| `role=component` | 组件边界，独立处理内部布局 |
| `role=decorator` | 伪元素或 absolute 定位 |
| `role=navigation` | `<nav>` 标签，flex row |
| `role=interactive` | `<button>` / `<a>` 标签 |
| `sizeMode=fill` | flex:1 或 width:100% |
| `sizeMode=hug` | width:auto / fit-content |
| `sizeMode=fixed` | 精确 px 值 |
| `overflow=scroll` | overflow-y:auto + 固定高度 |
| `overflow=hidden` | overflow:hidden |
| `component=tree` | padding-left 层级 |
| `component=list` | flex column + gap |
| `component=grid` | display:grid |
| `component=tabs` | flex row 标签 + 切换内容 |
| `component=modal` | fixed + flex center |

---

## 5. 置信度评估标准

| 情况 | 置信度范围 |
|------|-----------|
| 标注明确指定 + 数值精确匹配 | 0.95 - 1.0 |
| 模式明确匹配 + 间距规律 | 0.85 - 0.95 |
| 方向明确 + 间距略有偏差 | 0.75 - 0.85 |
| 模式部分匹配 + 需推断 | 0.65 - 0.75 |
| 不确定 / 边界情况 | < 0.65 |

**规则：confidence < 0.7 → 保留 absolute，不强行优化**

---

## 6. layout-plan.json 完整 Schema

```json
{
  "version": "1.0",
  "figmaUrl": "string",
  "viewport": { "width": "number", "height": "number" },
  "skeleton": {
    "layout": "flex-column | flex-row | grid",
    "regions": [
      {
        "name": "string",
        "layout": "flex-column | flex-row | grid | absolute",
        "sizing": {
          "width": "auto | 100% | {N}px | flex:1",
          "height": "auto | 100% | {N}px | flex:1"
        },
        "overflow": "visible | scroll-y | hidden | null",
        "nodes": ["nodeId1", "nodeId2"]
      }
    ]
  },
  "components": [
    {
      "id": "string",
      "name": "string",
      "type": "list | grid | tree | tabs | modal | card | form | nav",
      "layout": "flex-column | flex-row | grid",
      "nodes": ["nodeId"],
      "cssHints": {
        "gap": "number | null",
        "padding": "string | null",
        "technique": "string"
      }
    }
  ],
  "layoutDecisions": [
    {
      "nodeId": "string",
      "nodeName": "string",
      "original": "string (描述原始 absolute 定位)",
      "optimized": "string (描述优化后方案)",
      "technique": "string (CSS 技巧名)",
      "confidence": "number (0-1)",
      "reason": "string"
    }
  ],
  "implementationOrder": [
    {
      "phase": "number",
      "name": "string",
      "scope": ["nodeId"],
      "dependencies": ["phase-N"],
      "providesContext": {
        "description": "string",
        "cssProperties": ["property"]
      }
    }
  ],
  "annotationSummary": {
    "containers": "number",
    "components": "number",
    "decorators": "number",
    "interactiveNodes": "number",
    "scrollRegions": "number"
  }
}
```
