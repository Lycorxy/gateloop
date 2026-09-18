# CSS 转换技巧库 — 绝对定位 → 流式布局 24 项技巧

> 融合张鑫旭 CSS 系列 80+ 篇文章精华，建立分级技巧决策树。
> 使用方式：Step 2b 布局分析时逐个检测，confidence ≥ 0.7 则应用。

---

## 技巧分级概览

| 级别 | 数量 | 说明 |
|------|------|------|
| L1 核心（必检） | 8 | flex/grid 替代、间距统一、撑满、居中、贴边 |
| L2 常用（推荐） | 8 | 装饰简化、等高、锚点定位、数学函数 |
| L3 进阶（按需） | 8 | 混合模式、mask 优化、3D 视差、容器查询 |

---

## L1 核心技巧（Step 2b 必检，confidence ≥ 0.9）

### T1. 流式布局替代 absolute

```
检测条件：同级元素 top/x 递增，间距规律
原始：  position: absolute; left: Npx; top: Mpx
优化：
  /* Column 排列（top 递增） */
  .parent { display: flex; flex-direction: column; gap: {mean}px; }
  /* Row 排列（left 递增） */
  .parent { display: flex; flex-direction: row; gap: {mean}px; }
  /* Grid 排列（行列规律） */
  .parent { display: grid; grid-template-columns: repeat(N, 1fr); gap: 12px; }

confidence: 0.98 (gap 方差 < 4 时)
```

**来源文章**：`拜拜了,浮动布局` `我熟知的三种三栏布局` `让CSS flex最后一行左对齐`

---

### T2. 间距统一化（gap + padding）

```
检测条件：容器内子元素等间距（间距方差 < 4）
原始：
  每个子元素独立 top/left + margin
优化：
  /* 内部间距 → gap */
  .parent { display: flex; flex-direction: column; gap: 12px; }
  /* 首尾与容器边距 → padding */
  .parent { padding: 16px; }
  /* 关键：gap 不塌陷，margin 会塌陷 */

计算公式：
  gap = mean(相邻子元素 top 差 - 子元素高度)
  padding-top = 第一个子元素 top
  padding-bottom = parent.height - 最后一个子元素 bottom
  
confidence: 0.95
```

**v12.3 新增 — 非等间距处理**：

```
检测条件：容器内子元素间距方差 ≥ 4（非等间距）
数据源：spacing-report.json 的 siblings[].verticalGap / horizontalGap

优化：
  /* 非等间距 → 每个子元素用 margin-left 精确控制 */
  .child-1 { margin-left: 0; }
  .child-2 { margin-left: 15px; }  /* 精确值从 spacing-report 读取 */
  .child-3 { margin-left: 0; }
  
  /* 禁止用 gap 统一非等间距 */
  ✗ .parent { gap: 15px; }  /* 会丢失其他间距的精确值 */

典型场景：
  - audit form 内：selects → divider(16px) → confirm(15px) → 右边(0px)
  - title row 内：marker → text(8px) → separator(12px) → meta(12px) → separator(12px) → ...
  
记录要求：
  layout-plan.json 的 preciseSpacing.items[] 必须记录每个非等间距值 + reason
```

**来源文章**：`可缺省的CSS布局` `去除inline-block元素间间距的N种方法`

---

### T3. 撑满宽度（width: auto / 100%）

```
检测条件：|node.width - (parent.width - padding*2)| < 3
原始：  width: 343px (硬编码)
优化：
  /* block 元素 → 自然撑满 */
  .child { width: auto; }  /* 默认即可 */
  /* flex child → 不设 width 或 width: 100% */
  /* grid child → 1fr */
  /* 配合 parent padding 实现精确边距 */

关键：
  用 parent padding 控制左右边距，child width: auto
  不需要 child 写 width: calc(100% - 32px)
  
confidence: 0.96
```

**来源文章**：`深入理解CSS的widthauto` `理解CSS3_maxmin-content及fit-content`

---

### T4. 居中布局（flex-center / margin-auto）

```
检测条件：
  水平居中：|node.x - (parent.width - node.width)/2| < 3
  垂直居中：|node.y - (parent.height - node.height)/2| < 3

原始：  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%)
优化：
  /* 双轴居中 */
  .parent { display: flex; justify-content: center; align-items: center; }
  /* 仅水平 */
  .child { margin: 0 auto; }
  /* 仅垂直（现代浏览器） */
  .parent { align-content: center; }  /* 无需 flex */
  /* 仅垂直（flex fallback） */
  .parent { display: flex; align-items: center; }

confidence: 0.98
```

**来源文章**：`大小不固定的图片多行文字的水平垂直居中` `好消息align-content垂直居中`

---

### T5. 贴边/吸附（margin-auto / space-between）

```
检测条件：
  node.y + node.height ≈ parent.height (贴底)
  node.x + node.width ≈ parent.width (贴右)

原始：  position: absolute; bottom: 0; / right: 0;
优化：
  /* 贴底 → flex column + margin-top: auto */
  .parent { display: flex; flex-direction: column; }
  .footer { margin-top: auto; }
  
  /* 贴右 → flex row + margin-left: auto */
  .parent { display: flex; }
  .right-action { margin-left: auto; }
  
  /* 两端分散 → space-between */
  .parent { display: flex; justify-content: space-between; }

confidence: 0.92
```

**来源文章**：`杀了个回马枪说说positionsticky` `深入理解position_sticky粘性定位`

---

### T6. 等分布局（flex:1 / grid fr）

```
检测条件：N 个兄弟等宽（差 < 5px），间距一致
原始：  每个 width: 计算值
优化：
  /* flex 等分 */
  .parent { display: flex; gap: 10px; }
  .child { flex: 1; }
  /* grid 等分 */
  .parent { display: grid; grid-template-columns: repeat(N, 1fr); gap: 10px; }
  /* 内容自适应等宽 */
  .child { flex: 1 1 0; min-width: 0; }  /* 防止内容撑开 */

confidence: 0.93
```

**来源文章**：`我熟知的三种三栏布局` `让CSS flex最后一行左对齐`

---

### T7. 文本行内对齐（vertical-align 替代 absolute）

```
检测条件：图标与文字排列在同一行内
原始：  icon: position: absolute; left: 12; top: 50%; transform: translateY(-50%)
       text: padding-left: 36px (避开图标)
优化：
  /* flex 行内居中 */
  .row { display: flex; align-items: center; gap: 8px; }
  
  /* 复选框与文字对齐 */
  input[type="checkbox"] { vertical-align: middle; margin-top: -2px; }

confidence: 0.95
```

**来源文章**：`复选框单选框与文字对齐` `我对CSS vertical-align的理解`

---

### T8. 树形缩进（padding-left 替代 absolute left）

```
检测条件：递归嵌套的缩进结构（父 left < 子 left）
原始：
  每层 .item { position: absolute; left: 20px; }
  子层 .item { left: 36px; }  // 递增 16
优化：
  .item-level-0 { padding-left: 20px; }
  .item-level-1 { padding-left: 36px; }
  .item-level-2 { padding-left: 52px; }
  .item-level-3 { padding-left: 68px; }
  /* 关键：用 padding-left，不用 margin-left（避免塌陷） */

confidence: 0.97
```

**来源文章**：`可缺省的CSS布局`（装饰与功能分离）`网页布局思想浅议`

---

## L2 常用技巧（推荐应用，confidence 0.8-0.95）

### T9. 装饰元素伪元素化

```
检测条件：
  - 节点无文本内容
  - 面积 < 父元素 10%
  - 位于角落/边缘

原始：  独立 <div> + position: absolute
优化：
  .parent::after {
    content: '';
    position: absolute;
    right: 8px; top: 8px;
    width: 16px; height: 16px;
    background: url(icon.svg);
  }
  /* 减少 DOM 节点，不影响 flex/grid 布局 */
  
适用：选中指示器、角标、拖拽手柄、分隔线、展开箭头
不适用：需要独立 JS 交互的元素

confidence: 0.85
```

**来源文章**：`常见的CSS图形绘制合集` `纯CSS实现各类气球泡泡对话框` `666看hr标签实现分隔线`

---

### T10. 侧边栏等高（负 margin + 正 padding）

```
检测条件：侧栏与内容区高度不同，但视觉需等高背景
原始：  position: absolute; height: 100% (需 JS 计算或限定父高度)
优化：
  .columns { overflow: hidden; }  /* 父容器 */
  .sidebar { margin-bottom: -9999px; padding-bottom: 9999px; }
  .content { margin-bottom: -9999px; padding-bottom: 9999px; }
  
  原理：padding 撑出背景色，margin 收回去，overflow:hidden 裁掉多余
  现代替代：display: flex (子元素自动等高，推荐！)
  
confidence: 0.90
```

**来源文章**：`纯CSS实现侧边栏分栏高度自动相等`

---

### T11. BFC 清除/隔离（flow-root / isolation）

```
检测条件：
  - 容器的浮动子元素未闭合 → 高度塌陷
  - 需要阻止 margin 穿透

原始：
  .clearfix::after { content: ''; display: table; clear: both; }
  或 overflow: hidden (副作用：裁切溢出)

优化：
  /* 清除浮动 → flow-root（零副作用） */
  .container { display: flow-root; }
  
  /* 创建层叠上下文 → isolation（语义化） */
  .container { isolation: isolate; }
  /* 等价于 opacity: 0.999 但语义更清晰 */

confidence: 0.92
```

**来源文章**：`快速了解CSS displayflow-root` `理解CSS3 isolation isolate` `对overflow清除浮动的认识`

---

### T12. 虚线/分隔线（gradient 实现）

```
检测条件：非标准虚线比例（border-style:dashed 比例固定 3:1）
原始：  border-bottom: 1px dashed #ccc (虚实比不可控)
优化：
  /* 精确控制虚实比 */
  .hr {
    height: 1px;
    background: repeating-linear-gradient(to right,
      #ccc 0 4px,      /* 实线 4px */
      transparent 0 6px /* 空白 6px */
    );
  }
  
  /* 两端渐隐分隔线 */
  .hr-fade {
    height: 1px;
    background: linear-gradient(to right, transparent, #d0d0d5, transparent);
  }
  
  /* 波浪线 */
  .hr-wavy::before {
    content: "\2000\2000";
    text-decoration: overline wavy;
    letter-spacing: 100vw;
  }

confidence: 0.88
```

**来源文章**：`666看hr标签实现分隔线` `妙法攻略渐变虚框及边框滚动动画`

---

### T13. 渐变边框（border-image）

```
检测条件：Figma 中有非纯色边框（渐变/条纹边框）
原始：  无法用 border-color 实现
优化：
  .border-gradient {
    border: 10px solid;
    border-image: linear-gradient(deepskyblue, deeppink) 10;
  }
  .border-stripe {
    border-image: repeating-linear-gradient(-45deg, 
      red 0 5px, transparent 5px 10px) 12;
  }

confidence: 0.90
```

**来源文章**：`被低估的border-image属性`

---

### T14. 响应式尺寸精确控制（clamp / min / max）

```
检测条件：元素尺寸需在不同视口下自适应
原始：  @media 多个断点 + 固定宽度
优化：
  /* 容器宽度：最小 200px，最大 800px，首选 50vw */
  .container { width: clamp(200px, 50vw, 800px); }
  /* 字体：最小 14px，最大 24px，首选 2vw */
  h1 { font-size: clamp(14px, 2vw, 24px); }
  /* 图片不超出视口 */
  img { max-width: min(600px, 90vw); }

confidence: 0.92
```

**来源文章**：`了解CSS min()max()clamp()数学函数` `时隔两年Chrome也支持round等CSS数学函数`

---

### T15. 锚点定位（取代 JS 浮层计算）

```
检测条件：Dropdown / Tooltip / Popover 需相对触发元素定位
原始：  position: fixed + JS 计算 left/top
优化（实验性）：
  .tooltip {
    position-anchor: --my-anchor;
    top: anchor(--my-anchor bottom);
    left: anchor(--my-anchor left);
  }
  .trigger { anchor-name: --my-anchor; }
  
兼容性：Chrome 125+ (2024)，需渐进增强

confidence: 0.75 (兼容性受限)
```

**来源文章**：`告别JS浮层全新的CSS Anchor Positioning` `补齐不足CSS锚点定位支持回退检测`

---

### T16. 容器查询（@container）

```
检测条件：组件需根据自身容器宽度（非视口）响应
原始：  @media (max-width: 768px) { ... }  // 全局断点
优化：
  .card-container { container-type: inline-size; }
  @container (min-width: 400px) {
    .card { display: flex; }
  }

confidence: 0.82
```

**来源文章**：`介绍2022年最期待的CSS container容器查询`

---

## L3 进阶技巧（高保真场景使用）

### T17. 背景半透明遮罩（cross-fade 替代伪元素）

```
检测条件：背景图需半透明效果
原始：
  .bg::before {
    content: ''; position: absolute; inset: 0;
    background: url(img.jpg); opacity: 0.4;
  }
优化：
  .bg {
    --transparent: url(data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==);
    background-image: cross-fade(var(--transparent), url(img.jpg), 40%);
  }
  /* 一行替代伪元素+绝对定位 */

confidence: 0.85
```

**来源文章**：`巧用CSS cross-fade()实现背景图像半透明效果`

---

### T18. 多层混合效果（background-blend-mode）

```
检测条件：背景有多层纹理/渐变叠加
原始：  多层绝对定位元素叠加
优化：
  .texture {
    background: 
      linear-gradient(#f00, #00f),  /* 上层 */
      url(texture.png);             /* 下层 */
    background-blend-mode: overlay;
  }
  /* 单元素替代多层 DOM */

confidence: 0.80
```

**来源文章**：`深入理解CSS background-blend-mode`

---

### T19. PNG 尺寸优化（mask-image）

```
检测条件：不规则形状带透明通道的 PNG 体积大
原始：  122K PNG-24
优化：
  /* 内容层（JPG，50% 质量 ~60K）+ 遮罩层（纯黑 PNG ~1K） */
  img {
    -webkit-mask-image: url(mask.png);
    mask-image: url(mask.png);
  }
  /* 总计 ~61K，节省 50%+

confidence: 0.82
```

**来源文章**：`借助CSS mask遮罩显著优化PNG图片的尺寸`

---

### T20. 图标精确变色（mask + background-color）

```
检测条件：同一 SVG 图标需多种颜色变体
原始：  导出多份不同颜色 PNG/SVG
优化：
  .icon {
    display: inline-block;
    width: 16px; height: 16px;
    background-color: #1E67FA;  /* 控制颜色 */
    -webkit-mask: url(icon.svg) no-repeat center / contain;
    mask: url(icon.svg) no-repeat center / contain;
  }
  /* 一个 SVG，任意颜色 */

confidence: 0.88
```

**来源文章**：`纯CSS实现任意格式图标变色的研究` `常见纯CSS图标的代码分离与整理`

---

### T21. 图片内阴影（container + box-shadow:inset + z-index:-1）

```
检测条件：图片/缩略图有内阴影效果
原始：  无法直接在 <img> 上加 box-shadow:inset
优化：
  .card {
    box-shadow: inset 2px 2px 6px rgba(0,0,0,.35);
    display: flex;
    border-radius: 4px;
    overflow: hidden;
  }
  .card img {
    position: relative;
    z-index: -1;  /* 图片退到阴影后面 */
  }
  /* 关键：flex 容器 + img z-index:-1 */

confidence: 0.85
```

**来源文章**：`单IMG标签的图片内阴影效果实现`

---

### T22. 纯 CSS 图标（border 透明法 + box-shadow）

```
检测条件：简单几何形状图标（三角、箭头、加号、叉号等）
原始：  <img> 或 SVG
优化：
  /* 三角形 */
  .triangle-down {
    width: 0; height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid #666;
  }
  /* 加号（渐变法，免绝对定位） */
  .plus {
    background: linear-gradient(#666, #666) no-repeat center,
                linear-gradient(#666, #666) no-repeat center;
    background-size: 10px 2px, 2px 10px;
  }
  
适用场景：
  - 展开/折叠箭头
  - 关闭/删除按钮图标
  - 排序指示器
  - 提示三角
  - 复选框/单选框的自定义外观

confidence: 0.80
```

**来源文章**：`常见的CSS图形绘制合集` `纯CSS实现任意格式图标变色` `CSS3 linear-gradient线性渐变实现虚线等图形`

---

### T23. :has() 父选择器（状态联动）

```
检测条件：父容器样式需根据子元素状态变化
原始：  JS 根据子元素状态切换父容器 class
优化：
  /* 包含图片的卡片用不同样式 */
  .card:has(img) { padding: 0; }
  /* 子元素聚焦时高亮容器 */
  .form-item:has(input:focus) { border-color: #1E67FA; }
  /* 弹窗打开时模糊背景 */
  body:has(.modal-open) .main { filter: blur(2px); }

confidence: 0.85
支持度：Chrome 105+, Safari 15.4+
```

**来源文章**：`来了来了CSS has()伪类她来了` `详细介绍CSS focus-within伪类`

---

### T24. Scroll Snap（声明式轮播/分页）

```
检测条件：水平滑页/轮播/列表吸附
原始：  JS Swiper 库 + absolute 定位计算
优化：
  .carousel {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
  }
  .slide {
    flex: 0 0 100%;
    scroll-snap-align: start;
  }
  /* 零 JS 轮播 */

confidence: 0.88
```

**来源文章**：`大侠请留步了解CSS Scroll Snap` `介绍8个和滚动相关的CSS属性`

---

### T25. 内联标签浮于文字流（float 替代 absolute 两列）

```
检测条件（满足任一即可）：
  ① DSL 文本节点带 render_hint.inline_tag 标识（figma-trimly 已识别）
  ② DSL 文本节点 style.text_indent 存在 + 同父级有 absolute 定位的小尺寸兄弟容器
  ③ 基线 HTML 中文字 props.text 前导有多个 \u00A0（nbsp）+ 同父级 absolute tag 与文本起点重叠
  ④ 视觉特征：小 tag（如"精选/HOT/NEW"徽章）紧贴正文首行左侧，正文从 tag 右侧自然续行
    （非"tag 一列 + 文字一列"的左右分栏，而是"tag 内联浮于文字流首行"）

原始（figma-trimly 基线 HTML，100% absolute）：
  <div style="position:relative; width:690px; height:96px">
    <div style="position:absolute; left:0; top:0; width:66px; height:48px">  <!-- tag 容器 -->
      <img...><span>精选</span>
    </div>
    <span style="position:absolute; left:0; top:0; width:690px; text-indent:74px; line-height:48px; text-align:justify">回想起来一阵后怕...</span>
  </div>
  <!-- 注意：tag 和文字都从 (0,0) 起，文字用 text-indent 让出 tag 空间 -->

✅ 优化（推荐：float:left + 文字流，体现"内联 tag"语义）：
  <div style="width:690px; font-size:30px; line-height:48px; text-align:justify; word-break:break-all">
    <span style="float:left; width:66px; height:36px; position:relative; margin-top:6px; margin-right:12px">
      <img...><span>精选</span>
    </span>回想起来一阵后怕，从微商那里购买的智能音响居然有窃听的功能...
  </div>
  <!-- 关键：
    1. tag 用 float:left 浮于文字流首行左侧
    2. 文字正常流，自动从 tag 右侧续行（首行起点 = tagWidth + marginRight）
    3. 第二行起文字回退到 left:0（tag 高度 ≤ line-height 时第二行不会撞 tag）
    4. text-align:justify 让多行文字两端对齐，匹配 Figma 原版
    5. word-break:break-all 避免长英文/URL 撑破容器 -->

✅ 备选方案（绝对定位 + text-indent，保留 figma-trimly 默认渲染）：
  <div style="position:relative; width:690px">
    <div style="position:absolute; left:0; top:6px; width:66px; height:36px">精选tag</div>
    <p style="position:absolute; left:0; top:0; width:690px; text-indent:74px; line-height:48px; text-align:justify">回想起来...</p>
  </div>
  <!-- 仅当 tag 高度 > 第一行 line-height 时才需要此方案
       （此时第二行文字会撞到 tag，必须用 absolute + text-indent 限制首行起点） -->

🚫 禁止方案（用户反馈过，绝对不能这么写）：
  <div style="display:flex; flex-direction:row; align-items:flex-start; gap:12px">
    <div>精选tag</div>
    <p style="flex:1">回想起来...</p>
  </div>
  <!-- 错误原因：
    1. flex-row 把 tag 和文字分成左右两列，文字被压缩到第二列宽度
    2. 原设计中文字是"内联浮于 tag 右侧后续行"，不是"独立成列"
    3. 视觉上文字会过早换行（第一行只占 tag 右侧空间，第二行才能用全宽）
    4. 与 Figma 原版（文字从 tag 右侧起点开始 justify 两端对齐）不符 -->

confidence: 0.95（DSL 带 inline_tag 标识时）/ 0.85（仅视觉判断时）
```

**典型场景**：
- 精选/HOT/NEW 徽章 + 内容正文（本案例）
- 评论列表的"楼主/置顶"徽章 + 评论正文
- 商品卡的"包邮/折扣"小标签 + 商品描述
- 文章列表的"原创/转载"标签 + 文章摘要

**判别要点**：
| 特征 | inline-tag（用 T25） | 左右两列（用 T1） |
|------|---------------------|------------------|
| tag 与文字的位置关系 | tag 浮于文字首行左侧，文字续行 | tag 占独立列，文字占独立列 |
| 文字第一行宽度 | tagWidth → 容器右边（绕过 tag） | 容器右边（被 tag 列挤压） |
| 文字第二行起点 | left:0（回退到容器左边缘） | tag 列右侧（保持两列结构） |
| DSL 标识 | render_hint.inline_tag + text_indent | 无特殊标识，正常 flex-row |
| Figma 原始结构 | tag 和文字 absolute 重叠在 (0,0) | tag 和文字 absolute 不重叠（左右排列） |

**来源案例**：`经历分享-分享成功` Figma 设计稿，"精选" tag + "回想起来一阵后怕..."正文。原 DSL 中 tag (66×36) 和文字 (690px wide) 都从 (0,0) absolute 起，文字用 11 个 nbsp 前导给 tag 让位。模型曾错误识别为 flex-row 两列，导致文字换行错位。

---

## 技巧决策树（Step 2b 执行顺序）

```
对 origin-dsl.json 中每个 absolute 定位容器，按序检测：

1. T3 撑满宽度？    → width: auto, padding 控制间距
2. T4 居中于父容器？ → flex + align/justify:center
3. T2 间距规律？     → flex/grid + gap
4. T1 流式排列？     → flex-direction + gap
5. T6 等宽等分？     → flex:1 或 grid fr
6. T5 贴边/贴底？   → margin-auto 或 space-between
7. T8 树形缩进？    → padding-left 层级
8. T7 行内对齐？    → align-items:center, vertical-align
9. T9 装饰元素？    → ::before/::after
10. T10 等高需求？  → flex(min-height:auto) 或 负margin法
11. T11 BFC隔离？   → flow-root / isolation:isolate
12. T25 内联标签浮于文字流？ → float:left + 文字流（检查 render_hint.inline_tag / text_indent）
13. T12-24 进阶检测 → 按需应用
14. 以上都不满足     → 保留 absolute（confidence < 0.7）
```

---

## DSL → CSS 精确映射表

| DSL 字段 | 原始含义 | 优化后 CSS | 说明 |
|----------|---------|-----------|------|
| `left: "Npx"` | 绝对左偏移 | `padding-left: Npx` / 删除 | 容器内首个元素→padding |
| `top: "Npx"` | 绝对顶偏移 | `padding-top: Npx` / 删除 | 同上 |
| `width: "100%"` 或 ≈parent | 撑满 | `width: auto` 或 `flex: 1` | 不写固定宽度 |
| `position: absolute` | 绝对定位 | `position: relative` 或删除 | flex/grid child 不需 |
| `rgba(R,G,B,A)` 颜色 | Figma 精确色 | `#HEX`（A=1时） | A<1 保留 rgba |
| `font_size: "14px"` | 字号 | `font-size: 14px` | 直接映射 |
| `line_height: "20px"` | 行高 | `line-height: 20px` | 用精确数值 |
| `font_weight: 600` | 字重 | `font-weight: 600` | 不用 bold/normal |
| `border_radius: "2px"` | 圆角 | `border-radius: 2px` | 直接映射 |
| `border_color` + `border_width` + `border_style` | 边框 | `border: Npx style #HEX` | 合并写法 |
| `box_shadow` | 阴影 | 保留原始值 | - |
| `overflow: "hidden"` | 溢出隐藏 | `overflow: hidden` | 必需时保留 |
| `image_url` / `props.src` | 图片地址 | `url(...)` | 不修改 |

**不应在优化版写的属性**：
```
✗ left / top / right / bottom（已转为 gap/padding/flex 表达）
✗ position: absolute（除非叠层/装饰元素）
✗ width: {固定值} + margin-left: {计算值}（已由 flex 消解）
✗ height: {固定值} + line-height（若非单行居中）
```

---

## CSS 变量模板（Step 3 阶段 D 生成）

```css
:root {
  /* 颜色 */
  --c-text-primary: #131315;
  --c-text-secondary: #525252;
  --c-text-body: #2B2B2B;
  --c-primary: #1E67FA;
  --c-border: #E0E0E0;
  --c-border-soft: #EBEBEB;
  --c-bg-selected: #E5EEFF;
  --c-bg-page: #F7F7F7;
  --c-bg-card-gray: #F5F5F5;
  
  /* 标签三色系 */
  --c-tag-blue-bg: #F5F8FF;
  --c-tag-blue-bd: #E5EEFF;
  --c-tag-blue-tx: #1E67FA;
  --c-tag-green-bg: #F4FBF6;
  --c-tag-green-bd: #DAF2E1;
  --c-tag-green-tx: #15AD3D;
  --c-tag-gray-bg: #F5F5F5;
  --c-tag-gray-bd: #EBEBEB;
  --c-tag-gray-tx: #525252;
  
  /* 尺寸 */
  --sidebar-width: 240px;
  --nav-width: 240px;
  --topbar-height: 64px;
  
  /* 间距 */
  --gap-sm: 8px;
  --gap-md: 12px;
  --gap-lg: 16px;
  --padding-x: 20px;
  
  /* 字体 */
  --font: "PingFang SC", -apple-system, "Microsoft YaHei", sans-serif;
}

/* 全局继承（避免重复声明） */
body {
  font-family: var(--font);
  font-size: 14px;
  color: var(--c-text-body);
  line-height: 1.5;
}
```

---

## 禁止模式清单

```
✗ 全文 absolute → 能用 flex/grid/block 就不用
✗ 三层嵌套不合并 → 单子节点且无样式容器必须扁平化
✗ 手算居中偏移 → 必须用 flex/grid 原生居中
✗ margin 制造间距 → 优先 gap，次选 padding
✗ 相邻元素同时设 margin-top/margin-bottom → 只设一个方向
✗ 忽略 border 对盒模型影响 → 始终设 box-sizing: border-box（v12.3 铁律 3c 强制）
✗ 硬编码颜色 → 必须提取为 CSS 变量
✗ body 设 padding/margin → html_to_image 从 (0,0) 截取
✗ inline-block 列表不消除间隙 → font-size:0 或 flex 替代
✗ 图片容器不等高时用 absolute → flex 子元素默认等高
✗ figma URL 进入交付 DSL → 只用 iconRef/imageRef
✗ 忽略 white-space → 单行文本必须 nowrap + overflow + ellipsis
✗ inline-tag 模式做成 flex-row 两列 → 必须 float:left + 文字流（见 T25）
  判定：DSL 文本带 render_hint.inline_tag 或 style.text_indent + 同父级有 absolute 小 tag
  错误：display:flex; flex-direction:row; gap:Npx 把 tag 和文字分两列
  正确：tag float:left + 文字正常流（text-align:justify）
✗ 文字颜色用继承色替代 DSL 精确值（v12.3 新增 — 铁律 1 强化）
  判定：DSL 中 text 节点有 style.fill，但 HTML 中未设置 color（用 body/parent 继承色）
  错误：.chat-content { /* 无 color */ } → 继承 body 的 #2B2B2B
  正确：.chat-content { color: #E52E2E; } → 逐节点从 DSL style.fill 提取
  特别注意：同容器内不同 text 节点可能有不同 color（语义化颜色）
✗ 非等间距用 gap 统一（v12.3 新增 — 铁律 3c）
  判定：spacing-report.json siblings[].gap 方差 ≥ 4，但 HTML 用了统一 gap
  错误：.form { gap: 15px; } → 丢失了其他间距的精确值
  正确：.child-2 { margin-left: 15px; } → 逐个精确控制
✗ Switch 组件合并层（v12.3 新增 — 铁律 3b 第 4 条）
  判定：Switch 应为三层（底板+track+dot），但 HTML 只有两层或一层
  错误：.switch { background: blue; } .dot { position:absolute; } → 丢失灰色底板
  正确：.switch(底板#EBEBEB) > .track(蓝/灰) > .dot(白色absolute)
✗ padding 目测推算（v12.3 新增 — 铁律 1a）
  判定：HTML 中 padding 值与 spacing-report.json 不一致
  错误：.card { padding: 16px; } → 目测统一值
  正确：.card { padding: 16px 16px 36px 0; } → 从 spacing-report.json 精确读取四方向
```
