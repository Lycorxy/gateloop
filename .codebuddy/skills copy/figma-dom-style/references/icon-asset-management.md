# 图标与图片资源管理规范（v10 新增）

> **核心原则**：图标/图片与业务代码彻底分离，DSL 中只引用资源路径，不内嵌 SVG 代码、不引用 figma 源 URL。
> **目标**：方便替换、便于维护、不耦合 figma 资源。

---

## 1. 资源目录结构

```
{临时目录}/assets/
├── manifest.json              ← 🔑 资源清单（核心！所有图标/图片的索引）
├── icons/                     ← 矢量图标（SVG 优先）
│   ├── common/                ← 通用图标（搜索、新增、关闭等）
│   │   ├── line_search.svg
│   │   ├── line_add.svg
│   │   └── line_close.svg
│   ├── sidebar/               ← 按模块分组
│   │   ├── fill_sortdown.svg
│   │   └── fill_sortup.svg
│   ├── header/
│   │   └── ...
│   └── tree/
│       ├── line_drag.svg
│       └── line_more.svg
├── images/                    ← 位图（PNG/JPG）
│   ├── avatar.png
│   └── illustration.png
└── fallback/                  ← 小程序/不支持 SVG 环境的 PNG 降级
    ├── icons/                 ← 与 icons/ 同结构，但都是 PNG
    │   └── common/line_search.png
    └── ...
```

### 命名规范

```
SVG 文件名规则：
  - 从 figma 节点 name 推导，去除 `#iconfont=xxx` 后缀
  - snake_case 命名：line_search.svg / fill_sortdown.svg
  - 通用图标（搜索/新增/关闭）放 common/
  - 业务图标按模块分组（sidebar/header/tree/...）

PNG fallback：
  - 与 SVG 同名，扩展名 .png
  - 由构建工具从 SVG 自动生成（本 skill 不生成，仅记录）
```

---

## 2. assets/manifest.json 格式

```json
{
  "version": "1.0",
  "generatedAt": "2026-07-27T10:00:00+08:00",
  "figmaSource": {
    "fileKey": "RUaAbbQdi2ElguDRW9zHrl",
    "nodeId": "2162:30414"
  },
  "icons": [
    {
      "id": "line_search",
      "name": "搜索图标",
      "svg": "icons/common/line_search.svg",
      "png": "fallback/icons/common/line_search.png",
      "figmaNodeId": "I2163:34473;2323:7354;2323:7094",
      "figmaSrc": "https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/97d281b3-...",
      "size": { "width": 13.02, "height": 13.42 },
      "container": { "width": 16, "height": 16 },
      "offset": { "left": 1.6, "top": 1.38 },
      "tags": ["common", "search"],
      "usedBy": ["sidebar-search"]
    }
  ],
  "images": [
    {
      "id": "avatar_default",
      "name": "默认头像",
      "png": "images/avatar_default.png",
      "figmaSrc": "https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/...",
      "size": { "width": 32, "height": 32 },
      "usedBy": ["user-card"]
    }
  ],
  "stats": {
    "totalIcons": 34,
    "totalImages": 0,
    "byModule": {
      "common": 5,
      "sidebar": 8,
      "header": 3,
      "tree": 6,
      "nav": 12
    }
  }
}
```

---

## 3. DSL 中的图标引用规则（强制）

### ❌ 禁止写法（铁律 9）

```json
// 禁止 1：内嵌 figma URL
{
  "tag": "img",
  "attrs": {
    "src": "https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/97d281b3-...",
    "alt": "搜索"
  }
}

// 禁止 2：内嵌 SVG 代码
{
  "tag": "svg",
  "attrs": { "viewBox": "0 0 16 16" },
  "children": [
    { "tag": "path", "attrs": { "d": "M2 2 L14 14..." } }
  ]
}

// 禁止 3：硬编码 base64
{
  "tag": "img",
  "attrs": { "src": "data:image/svg+xml;base64,..." }
}
```

### ✅ 正确写法（iconRef 引用）

```json
// 矢量图标（SVG）
{
  "tag": "icon",
  "iconRef": "line_search",
  "format": "svg",
  "alt": "搜索",
  "size": { "width": 16, "height": 16 },
  "offset": { "left": 1.6, "top": 1.38 }
}

// 位图（PNG/JPG）
{
  "tag": "img",
  "imageRef": "avatar_default",
  "format": "png",
  "alt": "默认头像",
  "size": { "width": 32, "height": 32 }
}
```

### iconRef 解析规则

```
iconRef: "line_search"
  ↓ 查 manifest.json → icons[].id == "line_search"
  ↓ 取 svg 字段 → icons/common/line_search.svg
  ↓ 渲染时：
     - Web 环境 → <img src="assets/icons/common/line_search.svg" alt="搜索">
     - 小程序环境 → <image src="assets/fallback/icons/common/line_search.png" />
     - DSL 渲染验证时 → 用 manifest 中的 figmaSrc 临时渲染（不下载）
```

---

## 4. 渲染验证策略（临时 HTML）

DSL → 临时 HTML 渲染时，图标处理：

```html
<!-- 方案 A：图标文件已下载到 assets/ -->
<div class="search-icon" style="width:16px;height:16px;overflow:hidden;position:relative">
  <img src="assets/icons/common/line_search.svg" alt="搜索"
       style="position:absolute;left:1.6px;top:1.38px">
</div>

<!-- 方案 B：图标文件未下载（验证阶段，临时用 figma URL） -->
<div class="search-icon" style="width:16px;height:16px;overflow:hidden;position:relative">
  <img src="https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/97d281b3-..."
       alt="搜索"
       style="position:absolute;left:1.6px;top:1.38px"
       data-icon-ref="line_search"
       data-fallback-src="assets/icons/common/line_search.svg">
</div>
```

**关键**：
- 临时 HTML 中的 `figma URL` 仅供像素验证用，**不进入交付的 DSL**
- DSL 中只保留 `iconRef`，由 frontend-codegen 阶段下载并替换为本地资源
- `data-icon-ref` 属性帮助后续工具识别并替换

---

## 5. 图标提取流程（Step 2a 中执行）

```
遍历 origin-dsl.json 的所有 image 节点：

for each imageNode in dsl:
  1. 提取基础信息：
     - figmaNodeId: imageNode.id
     - figmaSrc: imageNode.props.src
     - format: imageNode.props.format (svg/png)
     - size: { width, height } (从 imageNode.style)
     - container: { width, height } (从父容器 style)
     - offset: { left, top } (从 imageNode.style)

  2. 推导图标名（name 字段）：
     - 父容器 name 通常是 "line_search #iconfont=line_search"
     - 去掉 #iconfont= 前后部分，取 iconfont 名作为 id
     - 无 iconfont 时用 name 的英文部分 snake_case

  3. 分类到模块：
     - 找出该图标所在的顶层区域（sidebar/header/nav/content/...）
     - 通用图标（出现在多个模块）→ common/
     - 模块专属 → {module}/

  4. 写入 manifest.json
```

### 图标名推导示例

```
figma name → iconRef id
  "line_search #iconfont=line_search"     → "line_search"
  "fill_sortdown #iconfont=fill_sortdown" → "fill_sortdown"
  "line_add #iconfont=line_add"           → "line_add"
  "单箭头"                                  → "arrow_single" (中文转英文)
  "Subtract"                               → "subtract" (英文小写)
```

---

## 6. 模块分组规则

```
图标所属模块由其在 layout-plan 中的位置决定：

  根容器
    ├── sidebar (左侧目录)
    │   ├── search-area        → 图标归 common/ (搜索通用)
    │   ├── sidebar-title      → 图标归 sidebar/
    │   └── sidebar-tree       → 图标归 sidebar/ 或 tree/
    │
    └── main (右侧主区域)
        ├── header             → 图标归 header/
        ├── nav-panel
        │   ├── nav-title      → 图标归 nav/
        │   └── nav-tree       → 图标归 tree/
        └── content-area
            ├── 标准模块        → 图标归 content/
            └── 话术面板        → 图标归 content/

通用规则：
  - 搜索图标 → common/
  - 新增/删除/编辑 → common/
  - 拖拽/排序 → common/
  - 模块专属装饰图标 → {module}/
```

---

## 7. 交付物清单

```
最终交付（到用户指定目录）：
  ├── iter-{N}.dsl.json        ← DOM+Style DSL（iconRef 引用）
  ├── layout-plan.json         ← 布局方案
  ├── assets/
  │   ├── manifest.json        ← 资源清单
  │   ├── icons/               ← SVG 图标（可选，可由后续阶段下载）
  │   └── fallback/            ← PNG 降级（可选）
  └── 渲染验证报告
```

---

## 8. 与 frontend-codegen 的衔接

```
figma-dom-style 产出：
  - DSL 中只有 iconRef / imageRef
  - manifest.json 记录所有资源

frontend-codegen 阶段：
  1. 读取 manifest.json
  2. 下载所有 SVG/PNG 到项目 assets 目录
  3. 把 DSL 中的 <icon iconRef="..."> 转换为目标框架代码：
     - React: <Icon name="line_search" size={16} />
     - Vue:   <Icon name="line_search" :size="16" />
     - 小程序: <image src="/assets/icons/line_search.png" />
  4. 替换 DSL 中的 figma URL 为本地资源路径

这样：
  - DSL 与 figma 资源解耦
  - 图标可独立替换（换图标库只改 manifest）
  - 业务代码不耦合 figma URL
```
