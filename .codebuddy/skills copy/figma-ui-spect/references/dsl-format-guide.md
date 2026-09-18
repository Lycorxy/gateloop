# DSL 格式规范与兼容性约束

## 目录
1. [顶层结构](#1-顶层结构)
2. [组件类型](#2-组件类型)
3. [样式字段](#3-样式字段)
4. [兼容性检查清单](#4-兼容性检查清单)

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

**不可修改**：`metadata.width`、`metadata.height`（决定画布尺寸）

## 2. 组件类型

| 类型 | 说明 | 必须字段 |
|------|------|---------|
| `container` | 容器节点 | id, type, style |
| `text` | 文本节点 | id, type, style, props.text |
| `image` | 图片节点 | id, type, style, props.src |

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

### 3.2 支持的样式属性

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

## 4. 兼容性检查清单

```
模型分析 DSL 时检查：
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
