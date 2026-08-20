# DSL 盒子模型间距计算规范

> 供 figma-trimly MCP 实现。目标：从 DSL JSON 自动计算所有间距，输出结构化间距报告。
> AI 模型直接使用报告值，不需要手动计算，消除人为误差。

---

## 1. 核心原则

DSL 中每个元素都有精确的 `top/left/width/height`（相对父容器）。所有间距通过算术计算，**100% 准确**，不需要视觉验证。

```
间距 = 位置差值，不是"看图猜"
gap = B.top - (A.top + A.height)  ← 算术，不是视觉
```

---

## 2. 输入：DSL JSON 结构

```json
{
  "components": [{
    "id": "root",
    "type": "container",
    "style": { "width": "240px", "height": "916px", "position": "relative" },
    "name": "导航分类",
    "children": [{
      "id": "title",
      "type": "container",
      "style": { "width": "240px", "height": "38px", "position": "absolute", "left": "0px", "top": "0px" },
      "name": "title/内容标题",
      "children": [...]
    }]
  }]
}
```

关键字段：
- `style.top` / `style.left` — 相对父容器的偏移（absolute 定位时）
- `style.width` / `style.height` — 元素尺寸
- `style.position` — `absolute` 或 `relative`
- `children` — 子元素数组（有序）

---

## 3. 算法

### 3.1 解析数值

DSL 的 style 值是字符串（如 `"38px"`、`"12.8px"`），需要解析为数字：

```js
function parsePx(val) {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val.replace('px', '')) || 0;
  return 0;
}
```

### 3.2 计算元素边界

对每个元素，计算四条边界（相对父容器）：

```js
function getBox(element) {
  const s = element.style || {};
  return {
    top: parsePx(s.top),
    left: parsePx(s.left),
    width: parsePx(s.width),
    height: parsePx(s.height),
    get bottom() { return this.top + this.height; },
    get right() { return this.left + this.width; },
  };
}
```

### 3.3 兄弟间距（核心）

对同一父容器下的子元素，按 `top` 排序后计算相邻间距：

```js
function calcSiblingGaps(parent) {
  const children = parent.children || [];
  if (children.length < 2) return [];

  // 按 top 排序（同 top 时按 left 排序）
  const sorted = [...children].sort((a, b) => {
    const at = parsePx(a.style?.top);
    const bt = parsePx(b.style?.top);
    if (Math.abs(at - bt) > 1) return at - bt;
    return parsePx(a.style?.left) - parsePx(b.style?.left);
  });

  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = getBox(sorted[i - 1]);
    const curr = getBox(sorted[i]);

    // 垂直间距（curr 在 prev 下方）
    const vGap = curr.top - prev.bottom;
    // 水平间距（curr 在 prev 右方）
    const hGap = curr.left - prev.right;

    gaps.push({
      from: sorted[i - 1].id,
      to: sorted[i].id,
      fromName: sorted[i - 1].name || '',
      toName: sorted[i].name || '',
      verticalGap: vGap,  // >0 表示垂直相邻，<0 表示重叠
      horizontalGap: hGap,
      type: vGap > 0 && hGap < 0 ? 'vertical' : hGap > 0 && vGap < 0 ? 'horizontal' : 'diagonal',
    });
  }
  return gaps;
}
```

### 3.4 父子间距（容器 padding）

对每个有子元素的容器，计算四边 padding：

```js
function calcContainerPadding(container) {
  const children = container.children || [];
  if (children.length === 0) return null;

  const parentBox = getBox(container);
  const childBoxes = children.map(c => ({ id: c.id, name: c.name, box: getBox(c) }));

  // 按 top 排序找第一个/最后一个（垂直方向）
  const sortedByTop = [...childBoxes].sort((a, b) => a.box.top - b.box.top);
  const firstV = sortedByTop[0];
  const lastV = sortedByTop[sortedByTop.length - 1];

  // 按 left 排序找第一个/最后一个（水平方向）
  const sortedByLeft = [...childBoxes].sort((a, b) => a.box.left - b.box.left);
  const firstH = sortedByLeft[0];
  const lastH = sortedByLeft[sortedByLeft.length - 1];

  return {
    containerId: container.id,
    containerName: container.name || '',
    paddingTop: firstV.box.top,                                          // 第一个子元素的 top
    paddingBottom: parentBox.height - lastV.box.bottom,                  // 容器高 - 最后子元素 bottom
    paddingLeft: firstH.box.left,                                        // 第一个子元素的 left
    paddingRight: parentBox.width - lastH.box.right,                     // 容器宽 - 最后子元素 right
    firstChildId: firstV.id,
    lastChildId: lastV.id,
  };
}
```

### 3.5 递归遍历

```js
function calcAllSpacing(root) {
  const result = {
    containers: [],  // 所有容器的 padding
    siblings: [],    // 所有兄弟间距
  };

  function traverse(element) {
    // 计算当前容器的 padding
    const padding = calcContainerPadding(element);
    if (padding) result.containers.push(padding);

    // 计算子元素间的间距
    const gaps = calcSiblingGaps(element);
    result.siblings.push(...gaps);

    // 递归处理子元素
    (element.children || []).forEach(traverse);
  }

  traverse(root);
  return result;
}
```

---

## 4. 输出格式：间距报告 JSON

```json
{
  "version": "1.0.0",
  "source": "2216:66152",
  "containers": [
    {
      "containerId": "2216:66152",
      "containerName": "导航分类",
      "paddingTop": 0,
      "paddingRight": 0,
      "paddingBottom": 562,
      "paddingLeft": 0,
      "firstChildId": "title",
      "lastChildId": "Slot"
    },
    {
      "containerId": "title",
      "containerName": "title/内容标题",
      "paddingTop": 16,
      "paddingRight": 16,
      "paddingBottom": 0,
      "paddingLeft": 16,
      "firstChildId": "title-text",
      "lastChildId": "line_add"
    }
  ],
  "siblings": [
    {
      "from": "title",
      "to": "Slot",
      "fromName": "title/内容标题",
      "toName": "Slot",
      "verticalGap": 12,
      "horizontalGap": -240,
      "type": "vertical"
    },
    {
      "from": "L1-虚拟资产类商品",
      "to": "children-container",
      "fromName": "虚拟资产类商品",
      "toName": "children",
      "verticalGap": 4,
      "horizontalGap": -240,
      "type": "vertical"
    },
    {
      "from": "L2-WX特征",
      "to": "L2-QQ特征",
      "fromName": "WX特征",
      "toName": "QQ特征",
      "verticalGap": 4,
      "horizontalGap": -240,
      "type": "vertical"
    }
  ]
}
```

---

## 5. 边界情况处理

### 5.1 嵌套容器的坐标累积

DSL 中子元素的 `top/left` 是相对**直接父容器**的。如果有多层嵌套，需要累积坐标：

```js
function getAbsoluteBox(element, parentBox) {
  const s = element.style || {};
  return {
    top: (parentBox ? parentBox.top : 0) + parsePx(s.top),
    left: (parentBox ? parentBox.left : 0) + parsePx(s.left),
    width: parsePx(s.width),
    height: parsePx(s.height),
  };
}
```

但**间距计算只在同一父容器内进行**（兄弟间距），不需要累积坐标。

### 5.2 重叠元素（gap < 0）

```
gap < 0 表示元素重叠，不是间距问题。
  → type: "overlap"
  → 不作为间距输出
  → 但可以标记为"重叠层"（如选中背景 + 文字）
```

### 5.3 Z-index 分层

同一父容器下，不同 z-index 的元素可能是"背景层"和"内容层"：

```js
// 按 z_index 分组，只计算同一 z_index 层内的兄弟间距
function groupByZIndex(children) {
  const groups = new Map();
  children.forEach(child => {
    const z = child.style?.z_index ?? 0;
    if (!groups.has(z)) groups.set(z, []);
    groups.get(z).push(child);
  });
  return groups;
}
```

**规则**：同一 z-index 的元素才算"兄弟"，不同 z-index 的元素是"叠加层"。

### 5.4 单子元素容器

```
children.length === 1 → 无兄弟间距
但仍有父子 padding（paddingTop/Right/Bottom/Left）
```

### 5.5 无子元素容器

```
children.length === 0 → 不输出 padding 和 siblings
（纯叶子节点，如 text/image）
```

### 5.6 高度塌陷（height=0 或无 height）

```js
// DSL 可能没有 height 字段（或为 0），此时用子元素推算
function getEffectiveHeight(element) {
  const h = parsePx(element.style?.height);
  if (h > 0) return h;
  // 无 height 时，用子元素的 bottom 推算
  const children = element.children || [];
  if (children.length === 0) return 0;
  return Math.max(...children.map(c => getBox(c).bottom));
}
```

### 5.7 百分比/auto 值

DSL 的 style 值通常是 px 字符串。但可能出现：
- `"100%"` → 需要父容器 width 才能计算
- `"auto"` → 需要用子元素推算
- 无字段 → 默认 0

```js
function parseDim(val, parentSize) {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    if (val.endsWith('%') && parentSize) return parentSize * parseFloat(val) / 100;
    if (val.endsWith('px')) return parseFloat(val);
    if (val === 'auto' || val === '') return null;  // 需要推算
  }
  return 0;
}
```

---

## 6. 实现建议（给 MCP 团队）

### 6.1 新增 MCP 工具

```
工具名：calc_spacing
输入：{ dsl: <DSL JSON> }
输出：{ containers: [...], siblings: [...] }
```

或集成到现有 `figma_baseline_compare` 的输出中：

```json
{
  "SSIM": 0.9999,
  "diff": 3,
  "spacingReport": {
    "containers": [...],
    "siblings": [...]
  }
}
```

### 6.2 与现有 DSL 输出集成

在 `origin-dsl.json` 的 metadata 中增加 `spacing` 字段：

```json
{
  "version": "1.0.0",
  "metadata": { ... },
  "components": [...],
  "spacing": {
    "containers": [...],
    "siblings": [...]
  }
}
```

### 6.3 AI 模型使用方式

AI 模型读取间距报告后，直接对照代码：

```
报告说 title → Slot 的 verticalGap = 12
代码 .nav-tree-wrap 的 margin-top = ?
  → 0 → ❌ 改为 12
  → 12 → ✅ 通过

报告说 L2-WX特征 → L2-QQ特征 的 verticalGap = 4
代码 .tree-node-children 的 gap = ?
  → 0 → ❌ 改为 4
  → 4 → ✅ 通过
```

---

## 7. 完整示例

### 输入（DSL 片段）

```json
{
  "id": "导航分类",
  "style": { "width": "240px", "height": "916px" },
  "children": [
    { "id": "title", "style": { "width": "240px", "height": "38px", "top": "0px", "left": "0px" } },
    { "id": "Slot",  "style": { "width": "240px", "height": "304px", "top": "50px", "left": "0px" } }
  ]
}
```

### 计算

```
导航分类 容器 padding:
  paddingTop = title.top = 0
  paddingBottom = 916 - (50 + 304) = 562
  paddingLeft = title.left = 0
  paddingRight = 240 - (0 + 240) = 0

title → Slot 兄弟间距:
  verticalGap = Slot.top - (title.top + title.height) = 50 - (0 + 38) = 12
  type = vertical (vGap>0, hGap<0)
```

### 输出

```json
{
  "containers": [{
    "containerId": "导航分类",
    "paddingTop": 0, "paddingRight": 0, "paddingBottom": 562, "paddingLeft": 0
  }],
  "siblings": [{
    "from": "title", "to": "Slot",
    "verticalGap": 12, "type": "vertical"
  }]
}
```

---

## 8. 测试用例

| 场景 | DSL 输入 | 期望输出 |
|------|---------|---------|
| 两兄弟垂直排列 | A top0 h40, B top44 h40 | gap=4 |
| 两兄弟水平排列 | A left0 w100, B left108 w100 | hGap=8 |
| 单子元素容器 | A top16 left16, parent w240 h38 | padding top16 right8 bottom0 left16 |
| 重叠元素 | A top0 h40, B top20 h40 (z0,z1) | type=overlap, 不输出 gap |
| 嵌套容器 | A→B→C, 各有 top | 只算同父兄弟，跨层不算 |
| 无 height 容器 | parent 无 height, child h40 | 用 child.bottom 推算 height=40 |
