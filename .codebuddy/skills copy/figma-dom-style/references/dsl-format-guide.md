# DSL 格式规范与兼容性约束

## 目录
1. [顶层结构](#1-顶层结构)
2. [组件类型](#2-组件类型)
3. [样式字段](#3-样式字段)
4. [优化后约束](#4-优化后约束)
5. [兼容性检查清单](#5-兼容性检查清单)

---

## 1. 顶层结构

```json
{
  "version": "1.0.0",
  "metadata": {
    "url": "https://www.figma.com/...",
    "node_id": "2:6517",
    "width": 208,
    "height": 996,
    "name": "导航",
    "file_key": "RUaAbbQdi2ElguDRW9zHrl"
  },
  "components": [
    { /* DSLComponent */ }
  ]
}
```

**不可修改**：`metadata.width`、`metadata.height`（决定渲染画布尺寸）

## 2. 组件类型

| 类型 | 说明 | 必须字段 |
|------|------|---------|
| `container` | 容器节点 | id, type, style |
| `text` | 文本节点 | id, type, style, props.text |
| `image` | 图片节点 | id, type, style, props.src |

**不可新增类型**。dsl_to_image 只识别这三种。

## 3. 样式字段

### 3.1 原始（绝对定位）版

```json
{
  "position": "absolute",
  "left": "16px",
  "top": "12px",
  "width": "192px",
  "height": "40px",
  "background_color": "rgba(255,255,255,1)"
}
```

### 3.2 优化后（语义化）版

```json
{
  "position": "relative",
  "display": "flex",
  "flex_direction": "row",
  "align_items": "center",
  "gap": "8px",
  "padding": "0 16px",
  "width": "100%",
  "height": "40px",
  "background_color": "rgba(255,255,255,1)"
}
```

### 3.3 支持的样式属性

所有属性使用 snake_case，对应 CSS 属性：

```
定位：position, top, left, right, bottom, z_index
弹性：display, flex_direction, flex_wrap, align_items, justify_content, gap, flex, flex_grow, flex_shrink
盒模型：width, height, min_width, max_width, min_height, max_height, padding, margin
边框：border, border_radius, border_width, border_style, border_color (+ 单边变体)
背景：background, background_color, background_image, background_size
文字：font_family, font_size, font_weight, line_height, letter_spacing, text_align, text_decoration, white_space, color
效果：box_shadow, opacity, overflow, backdrop_filter, mix_blend_mode
盒模型：box_sizing
```

## 4. 优化后约束

### 4.1 必须保持

```
  - 顶层 components 数组结构不变
  - metadata 完整不变（特别是 width/height）
  - text 节点的 props.text 不变
  - image 节点的 props.src 不变
  - annotation 字段不丢失（只增不减）
```

### 4.2 允许修改

```
  - style 属性值（如 absolute → flex）
  - 节点层级结构（合并/扁平化）
  - 新增 style 属性（如 display, flex_direction）
  - 新增 props 字段（如 component, ref）
  - 节点 id 可保留原始 Figma id，也可用新格式
```

### 4.3 禁止修改

```
  ✗ 新增组件类型（只有 container/text/image）
  ✗ 修改 metadata.width/height
  ✗ 删除 annotation 字段
  ✗ 修改 props.text 的文本内容
  ✗ 修改 props.src 的图片地址
```

## 5. 兼容性检查清单

```
优化后的 DSL 调用 dsl_to_image 前必须检查：
  □ version 字段存在
  □ metadata.width/height 为数字
  □ components 是非空数组
  □ 每个组件有 id + type + style
  □ text 组件有 props.text
  □ image 组件有 props.src
  □ style 属性值都是字符串或数字（非对象/数组）
  □ children 是数组（如果有）
  □ 无未知的 type 值
```
