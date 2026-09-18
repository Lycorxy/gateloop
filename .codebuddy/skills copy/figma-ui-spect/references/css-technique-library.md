# CSS 布局技巧决策树 — 现有代码诊断版（v20 新增）

> 本文件在 Stage 1.6 加载。与 figma-dom-style 的技巧库同源，但针对「代码已存在」场景做了适配：
> 不是「从 absolute HTML 选技巧」，而是「诊断现有代码的布局技巧是否最优 + 与 DSL 推断的最优技巧是否一致」。
>
> 精准度提升核心：v19 只对比像素值，但 `flex:1` vs `flex:none`、`float:left` vs `flex-row` 这类**布局行为差异**
> 会导致「像素对了布局全错」。本决策树强制对每个容器选最优技巧并核对代码。

---

## 0. 使用方式

```
Stage 1.6 对双向映射表中每个容器节点执行：
  1. 从 DSL 提取该容器的几何特征（子节点排列/间距/尺寸）
  2. 按下方决策树推断「DSL 期望的最优技巧」
  3. read_file 代码中该容器对应的 className
  4. 对比：代码实际用的技巧 vs DSL 期望技巧
     ✅ 一致 → 该容器布局策略正确
     ❌ 不一致 → 进入属性差异表（Stage 2 修复）
```

---

## 1. L1 核心技巧（必检，confidence ≥ 0.9）

### T1. 流式布局替代 absolute

```
DSL 判据：同级子节点 top 递增（列）或 left 递增（行），间距规律（方差 < 4）
DSL 期望：parent { display:flex; flex-direction:column|row; gap:{mean}px }

代码诊断：
  ✅ 代码 parent 是 flex + gap → 正确
  ❌ 代码 parent 是 position:relative + 子元素各自 absolute top/left → 错误，需改 flex
  ❌ 代码 parent 是 block + 子元素 margin-top → 可接受但非最优，gap 更稳（不塌陷）

confidence: 0.98（gap 方差 < 4 时）
```

### T2. 间距统一化（gap + padding）

```
DSL 判据：容器内子元素等间距
DSL 期望：
  parent { display:flex; flex-direction:column; gap:{mean}px; padding:{首尾间距} }
  关键：gap 不塌陷，margin 会塌陷

代码诊断：
  ✅ 代码用 gap → 正确
  ❌ 代码用子元素 margin-top/bottom → 有塌陷风险，改 gap
  ❌ 代码用 padding 制造兄弟间距（border-box 下）→ 错误，改 gap

计算公式（从 spacing-report）：
  gap = siblings.verticalGap / horizontalGap
  padding-top = containers.paddingTop（第一个子元素 top）
  padding-bottom = containers.paddingBottom（容器高 - 最后子元素 bottom）
```

### T3. 撑满宽度（width: auto / 100%）

```
DSL 判据：|node.width - (parent.width - padding*2)| < 3
DSL 期望：child { width:auto } 或 flex child 不设 width

代码诊断：
  ✅ 代码 child 无 width 或 width:100% → 正确
  ❌ 代码 child width: {固定px} 硬编码 → 错误，改 auto（parent padding 控制边距）
  ❌ 代码 child width: calc(100% - 32px) → 冗余，改 auto（parent padding 已处理）

confidence: 0.96
```

### T4. 居中布局（flex-center / margin-auto）

```
DSL 判据：
  水平居中：|node.x - (parent.width - node.width)/2| < 3
  垂直居中：|node.y - (parent.height - node.height)/2| < 3

DSL 期望：
  双轴：parent { display:flex; justify-content:center; align-items:center }
  仅水平：child { margin:0 auto } 或 parent flex + justify-content:center
  仅垂直：parent { display:flex; align-items:center }

代码诊断：
  ✅ 代码用 flex 居中 → 正确
  ❌ 代码用 position:absolute + top:50% + transform:translate(-50%,-50%) → 非最优，改 flex
  ❌ 代码用 line-height 模拟垂直居中 → 仅单行文本可用，多行必错

confidence: 0.98
```

### T5. 贴边/吸附（margin-auto / space-between）

```
DSL 判据：
  贴底：node.y + node.height ≈ parent.height
  贴右：node.x + node.width ≈ parent.width

DSL 期望：
  贴底：parent { display:flex; flex-direction:column } + child { margin-top:auto }
  贴右：parent { display:flex } + child { margin-left:auto }
  两端分散：parent { display:flex; justify-content:space-between }

代码诊断：
  ✅ 代码用 margin-top:auto / margin-left:auto → 正确
  ❌ 代码用 position:absolute + bottom:0 / right:0 → 非最优，改 flex + margin-auto
  ❌ 代码用固定 margin-top 计算值 → 脆弱（内容变化会错位），改 margin-top:auto

confidence: 0.92
```

### T6. 等分布局（flex:1 / grid fr）

```
DSL 判据：N 个兄弟等宽（差 < 5px），间距一致
DSL 期望：
  parent { display:flex; gap:{gap}px } + children { flex:1 }
  或 parent { display:grid; grid-template-columns:repeat(N,1fr); gap:{gap}px }

代码诊断：
  ✅ 代码用 flex:1 或 grid 1fr → 正确
  ❌ 代码每个 child width: {计算值}px → 脆弱，改 flex:1
  ⚠️ 内容可能撑开时：加 min-width:0 防止 flex:1 失效

confidence: 0.93
```

### T7. 文本行内对齐（vertical-align / flex 居中）

```
DSL 判据：图标与文字排列在同一行内
DSL 期望：
  .row { display:flex; align-items:center; gap:8px }
  或 input[type=checkbox] { vertical-align:middle; margin-top:-2px }

代码诊断：
  ✅ 代码用 flex align-items:center → 正确
  ❌ 代码图标 absolute + text padding-left 避让 → 非最优，改 flex
  ❌ 代码用 vertical-align 但未微调 margin → 图标偏上/偏下，加 margin-top 修正

confidence: 0.95
```

### T8. 树形缩进（padding-left 替代 absolute left）

```
DSL 判据：递归嵌套的缩进结构（父 left < 子 left）
DSL 期望：每层 padding-left 递增（如 20/36/52/68px）
  关键：用 padding-left 不用 margin-left（margin 会塌陷）

代码诊断：
  ✅ 代码用 padding-left 层级 → 正确
  ❌ 代码每层 absolute left → 错误，改 padding-left
  ❌ 代码用 margin-left → 有塌陷风险，改 padding-left

confidence: 0.97
```

---

## 2. T25 内联标签浮于文字流（🔴 高频踩坑，必检）

```
DSL 判据（满足任一）：
  ① 文本节点带 render_hint.inline_tag 标识（figma-trimly 已识别的最强信号）
  ② 文本节点 style.text_indent 存在 + 同父级有 absolute 小尺寸兄弟容器（tag）
  ③ 小 tag（宽 < 100px）与宽文本（宽 > 300px）在 (0,0) 起点 absolute 重叠
  ④ 视觉：小 tag（精选/HOT/NEW 徽章）紧贴正文首行左侧，正文从 tag 右侧续行

DSL 期望（推荐）：
  .container { font-size; line-height; text-align:justify; word-break:break-all }
  .tag { float:left; width; height; margin-right:{gap}px }
  正文正常流，自动从 tag 右侧续行

DSL 期望（备选，仅当 tag 高度 > 第一行 line-height）：
  .container { position:relative }
  .tag { position:absolute; left:0; top:{offset}px }
  .text { text-indent:{tagWidth+gap}px }

代码诊断（🔴 最易错）：
  ✅ 代码用 float:left + 文字流 → 正确
  ✅ 代码用 absolute + text-indent（tag 高时）→ 正确
  ❌❌ 代码用 display:flex; flex-direction:row 把 tag 和文字分两列 → 严重错误
     原因：文字被压缩到第二列宽度，第一行过早换行，与 Figma 原版不符
     修复：改为 float:left + 文字流

判别要点：
  | 特征 | inline-tag（T25） | 左右两列（T1） |
  | tag 与文字位置 | tag 浮于文字首行左侧 | tag 占独立列 |
  | 文字第一行宽度 | tagWidth → 容器右（绕过 tag） | 容器右（被 tag 列挤压） |
  | 文字第二行起点 | left:0（回退左边缘） | tag 列右侧（保持两列） |

confidence: 0.95（有 inline_tag 标识）/ 0.85（仅视觉判断）
```

---

## 3. 技巧决策树（Stage 1.6 执行顺序）

```
对双向映射表中每个容器节点，按序检测（命中即停）：

 1. T3 撑满宽度？      → child width:auto, parent padding 控制边距
 2. T4 居中于父容器？   → flex + align/justify:center
 3. T2 间距规律？       → flex/grid + gap
 4. T1 流式排列？       → flex-direction + gap
 5. T6 等宽等分？       → flex:1 或 grid fr
 6. T5 贴边/贴底？      → margin-auto 或 space-between
 7. T8 树形缩进？       → padding-left 层级
 8. T7 行内对齐？       → align-items:center, vertical-align
 9. T25 内联标签？      → float:left + 文字流（🔴 检查 inline_tag / text_indent）
10. 以上都不满足        → 容器无特殊布局策略，保留代码现状

输出「容器布局技巧诊断表」：
  # │ 容器(className) │ DSL期望技巧 │ 代码实际技巧 │ 判定
  1 │ .menu           │ T1 flex+gap │ flex+gap     │ ✅
  2 │ .tag-text-row   │ T25 float   │ flex-row     │ ❌
  3 │ .footer         │ T5 margin-auto│ absolute  │ ❌

❌ 行进入属性差异表，Stage 2 修复
```

---

## 4. margin 塌陷规避（代码诊断必查）

```
场景：垂直方向相邻块元素的 margin 会塌陷（取大值非相加）

代码诊断：
  ✅ flex/grid 容器内 → 无塌陷问题（天然 BFC）
  ✅ 用 gap → 无塌陷
  ❌ block 容器内子元素用 margin-top + margin-bottom → 塌陷，改 gap 或单方向
  ❌ 父子间无 padding/border 隔断 + 子 margin-top → margin 穿透到父，改父 padding-top

修复优先级：
  1. gap（最优，flex/grid 天然支持）
  2. padding（次选）
  3. margin 单方向（兜底，且需 BFC 隔断）
```

---

## 5. 不应优化的场景（保留现状）

```
以下场景代码保留现有方案，不强行改：

  1. Z 轴叠层（兄弟 bounds 重叠 > 50%）→ absolute + z-index 合理
  2. 拖拽目标（annotation 含 draggable）→ absolute 合理
  3. 浮动按钮/FAB（固定位置不随滚动）→ fixed/absolute 合理
  4. 工具提示/下拉（依赖触发元素位置）→ absolute 合理
  5. 高亮叠层（rects + 文字 z-index 分层）→ absolute 合理
  6. decorator 装饰元素 → absolute 或伪元素合理
  7. 图标在裁剪框内的偏移 → absolute 合理（容器 overflow:hidden）
  8. Switch 圆点在轨道内偏移 → absolute 合理
  9. confidence < 0.7 的任何决策 → 保留代码现状
```

---

## 6. DSL → CSS 精确映射速查（补充 RULE 中的基础映射）

```
| DSL 字段                     | CSS 属性                    | 说明 |
|------------------------------|----------------------------|------|
| left: "Npx"（容器首子元素）   | padding-left: Npx          | 非子元素 margin-left |
| top: "Npx"（容器首子元素）    | padding-top: Npx           | 非子元素 margin-top |
| width: "100%" 或 ≈parent     | width: auto / flex:1       | 不写固定 px |
| position: absolute（流式子） | 删除 / position:relative   | flex child 不需 |
| rgba(R,G,B,1)                | #RRGGBB                    | A=1 转 hex |
| rgba(R,G,B,0)                | transparent               | A=0 透明 |
| rgba(R,G,B,A<1)              | rgba(R,G,B,A)             | 保留 rgba |
| spacing-report.siblings.gap  | gap: Npx                  | 优先于 margin |
| spacing-report.containers.pad| padding: T R B L          | 首尾元素边距 |
| annotation.size_preset=fill  | width:100% / flex:1       | 撑满 |
| annotation.size_preset=hug   | width:auto / fit-content  | 自适应 |
| render_hint.inline_tag       | float:left + 文字流       | 🔴 非 flex-row |
| style.text_indent            | text-indent: Npx          | inline-tag 信号 |

⚠️ 陷阱：
  - fill 在容器节点 = background-color，在文本节点 = color
  - stroke 必须配 border-style: solid（缺一不可）
  - rgba(255,255,255,1) = #fff（白色，非透明）
  - width 固定值 + margin-left 计算值 → 已被 flex 消解，应删 margin 改 flex
```
