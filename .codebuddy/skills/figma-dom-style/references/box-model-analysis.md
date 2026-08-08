# 盒模型分析参考（Step 2b CSS 技巧知识库）

> ⚠️ **v11 弃用提示**：本文件已被 `css-technique-library.md` 取代。
> 新技巧库包含 24 项分级技巧（L1/L2/L3）+ 完整决策树 + DSL→CSS 映射表，
> 融合张鑫旭 80+ 篇文章精华。本文保留为历史参考，新代码请使用 `css-technique-library.md`。
>
> Step 2b 布局分析时使用。核心原则：用最少的 CSS 实现同等视觉效果。

---

## 1. CSS 盒模型要点

### 1.1 box-sizing: border-box

```
所有元素默认使用 border-box：
  width = content + padding + border
  不需要手动计算"实际宽度"
  
在 DSL 输出时：
  始终假设 * { box-sizing: border-box }
  宽度直接取 figma 测量值（包含 padding）
```

### 1.2 margin 塌陷（Margin Collapse）

```
发生条件：
  - 垂直方向
  - 相邻的块级元素
  - 父子之间无 padding/border 隔断
  
影响：
  - margin-top 和 margin-bottom 取较大值（非相加）
  
规避策略（layout-plan 中永远使用这些）：
  ✅ 用 gap（flex/grid）替代 margin
  ✅ 用 padding 替代 margin
  ✅ margin-auto 推边方案不受影响
  ❌ 不在 layout-plan 中输出 margin-top/bottom（除 auto）
```

### 1.3 BFC（Block Formatting Context）

```
触发条件（会影响布局计算的）：
  - display: flex/grid → 子元素自动 BFC
  - overflow: hidden/auto/scroll → 创建 BFC
  - position: absolute/fixed → 创建 BFC

影响：
  - BFC 内部 margin 不与外部塌陷
  - flex/grid 容器内无 margin 塌陷问题
  
结论：优先使用 flex/grid，自然解决 margin 塌陷
```

---

## 2. 六大替代技巧详解

### 技巧 1：居中布局（替代 absolute 居中）

```
检测条件：
  |node.centerX - parent.centerX| < 3 && |node.centerY - parent.centerY| < 3

原始 absolute 方案：
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%)

优化方案（按优先级）：
  ① flex 居中（最简洁）
     parent: display:flex; justify-content:center; align-items:center
  
  ② margin auto（单方向居中）
     仅水平：child: margin: 0 auto
     仅垂直：parent: display:flex; child: margin: auto 0
  
  ③ grid place（单一子元素）
     parent: display:grid; place-items:center

confidence: 0.98（几乎无例外）
```

### 技巧 2：间距统一化（替代精确 top/left 偏移）

```
检测条件：
  同级元素间距方差 < 4

原始方案：
  每个子元素 position:absolute; top:Npx

优化方案：
  parent: display:flex; flex-direction:column; gap:{mean}px
  child: 不需要 position/top/left

额外优化：
  - 首元素上方间距 → parent padding-top
  - 尾元素下方间距 → parent padding-bottom
  - 左右间距 → parent padding-left / padding-right

confidence: 0.95（间距一致时）
```

### 技巧 3：撑满宽度（替代固定宽度）

```
检测条件：
  node.width ≈ parent.contentWidth (parent.width - padding*2)
  允许 ±3px 误差

原始方案：
  width: 343px（硬编码）

优化方案（按场景）：
  ① flex child：不设 width（自动撑满）或 width:100%
  ② grid child：同上
  ③ block 元素：本身就是 width:auto 占满
  
  关键：确保 parent 有正确的 padding，child 不再写固定宽度

confidence: 0.96
```

### 技巧 4：底部/尾部吸附（替代 absolute bottom）

```
检测条件：
  |node.bottom - parent.height| < 3 (或减去 parent.paddingBottom)

原始方案：
  position:absolute; bottom:0

优化方案：
  flex column 父容器中：
    吸底元素：margin-top: auto
  
  多元素分散（如 header + content + footer）：
    parent: display:flex; flex-direction:column; height:100%
    content: flex:1
    footer: flex-shrink:0

confidence: 0.92
```

### 技巧 5：等分布局（替代精确宽度计算）

```
检测条件：
  N 个兄弟宽度相近（差 < 5px）
  且间距一致

原始方案：
  每个 width: 计算值 px

优化方案：
  ① flex 等分
     parent: display:flex; gap:{gap}px
     children: flex:1
  
  ② grid 等分
     parent: display:grid; grid-template-columns:repeat(N, 1fr); gap:{gap}px
  
  选择依据：
    - 单行 → flex
    - 多行换行 → grid
    - 列数固定 → grid
    - 列数动态 → flex + flex-wrap

confidence: 0.93
```

### 技巧 6：伪元素替代装饰节点

```
检测条件：
  - 节点无文字内容
  - 面积 < 父元素 10%
  - 位于角落/边缘
  - 或标注 role=decorator

原始方案：
  独立 DOM 节点 + absolute 定位

优化方案：
  父元素::before 或 ::after {
    content: '';
    position: absolute;
    width/height/background/border-radius: 精确值;
    top/left/right/bottom: 相对父容器偏移;
  }

优势：
  - 减少 DOM 节点
  - 语义更清晰（装饰不干扰内容）
  - 不影响 flex/grid 布局

confidence: 0.85（需判断是否确实是装饰）
```

---

## 3. 复合技巧（多个技巧组合）

### 3.1 居中 + 撑满 + 间距

```
场景：一列表单，每项居中且宽度接近容器

方案：
  parent: display:flex; flex-direction:column; align-items:center; gap:16px; padding:24px
  children: width:100%（在 padding 约束下自动撑满）
```

### 3.2 间距 + 底部吸附

```
场景：列表 + 底部按钮

方案：
  parent: display:flex; flex-direction:column; height:100%
  list-area: flex:1; display:flex; flex-direction:column; gap:12px; overflow-y:auto
  button: margin-top:auto (或 flex-shrink:0 如果用 space-between)
```

### 3.3 等分 + 居中内容

```
场景：底部 Tab Bar，N 个等分按钮，每个内容居中

方案：
  parent: display:flex
  children: flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center
```

---

## 4. 不应优化的场景

```
以下场景保留 absolute：
  1. Z 轴叠层（bounds 重叠 > 50%）
  2. 拖拽目标（标注有 draggable）
  3. 浮动按钮/FAB（固定位置不随滚动）
  4. 工具提示/下拉（依赖触发元素位置）
  5. confidence < 0.7 的任何决策

保留固定尺寸的场景：
  1. 图标/Logo（精确尺寸）
  2. 头像/缩略图（固定宽高比）
  3. 设计指定的固定宽度侧边栏
  4. 标注 sizeMode=fixed 的任何节点
```

---

## 5. 输出到 layout-plan.json 的格式

每个检测到的技巧以如下格式写入 `layoutDecisions`：

```json
{
  "nodeId": "1234:5678",
  "nodeName": "submit-button",
  "original": "absolute: x=16, y=756, w=343, h=48",
  "optimized": "flex child, width:auto (parent padding:16px handles margin), margin-top:auto for stick-bottom",
  "technique": "full-width + stick-bottom",
  "confidence": 0.96,
  "reason": "width=343 ≈ parent.width(375)-padding(32), bottom-aligned with margin-top:auto in flex column"
}
```
