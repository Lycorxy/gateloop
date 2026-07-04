---
description: CSS 最佳实践 — 源自《CSS世界》《CSS新世界》《深入解析CSS》《CSS选择器世界》+ 实战问题速查。按需查阅。
globs: ["**/*.css", "**/*.scss", "**/*.module.css"]
alwaysApply: false
---

# CSS 最佳实践

> 基于 张鑫旭《CSS世界》《CSS新世界》+ 《深入解析CSS》+ `CSS选择器世界` + 问题解决方案速查提炼。
> ⚡ 本文件为知识库参考，遇到布局/选择器/动画/响应式/深色模式等问题时按需查阅。
> 核心原则：**兼容性 > 简洁性 > 新特性**

---

## 一、布局方案决策树

```
需要什么布局？
│
├─ 一维排列 → Flexbox（IE11+ 全支持）
│   - 间距用 gap（Chrome 84+, Safari 14.1+）
│   - 如需 IE11：用 margin 替代 gap
│
├─ 二维网格
│   ├─ 需 IE11？→ Flexbox 嵌套模拟
│   └─ 仅现代浏览器？→ Grid
│       - ❌ 禁止 subgrid
│       - ✅ repeat(auto-fill, minmax(280px, 1fr))
│
├─ 居中 → flex + justify-content + align-items
│     或 grid + place-items: center
│
└─ 固定侧栏+弹性主区 → flex-shrink:0 + flex:1
```

### 常见布局代码模板

> 来源：Q10 — 常见布局模式代码模板

#### 圣杯布局（Grid）

```css
.holy-grail {
  display: grid;
  grid-template:
    "header header header" auto
    "nav    main   aside" 1fr
    "footer footer footer" auto
    / auto 1fr auto;
  min-height: 100vh;
}
```

#### 固定侧栏 + 主内容（后台管理标配）

```css
.sidebar-layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: 100vh;
}
/* Flex 替代 */
.sidebar-flex { display: flex; min-height: 100vh; }
.sidebar-flex aside { width: 260px; flex-shrink: 0; }
.sidebar-flex main { flex: 1; overflow-y: auto; }
```

#### 全屏居中覆盖（Modal/Lightbox）

```css
.overlay-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: grid;
  place-items: center;
  z-index: 1000;
}
```

#### Sticky Footer

```css
.sticky-footer-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.sf-main { flex: 1; }  /* 主内容撑开剩余空间，Footer始终贴底 */
```

#### 等分布局 & 栅格系统

```css
.equal-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
.grid-system  { display: grid; grid-template-columns: repeat(12, 1fr); gap: 1.5rem; }
.col-span-6   { grid-column: span 6; }
/* 自动等分（自适应数量）*/
.auto-equal   { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
```

#### 响应式断点（Mobile First）

```css
.base { display: flex; flex-direction: column; }  /* Mobile: 单列 */
@media (min-width: 640px) { .base { flex-direction: row; flex-wrap: wrap; } }  /* Tablet */
@media (min-width: 1024px) { .base { flex-wrap: nowrap; } }  /* Desktop */
```

---

## 二、居中对齐方案大全

> 来源：Q01 — 居中对齐方案大全

### 双轴居中（同时水平+垂直）

| # | 方案 | 代码量 | 推荐度 | 适用场景 |
|---|------|--------|-------|---------|
| A | **Grid: `place-items: center`** | **1行** | ⭐⭐⭐⭐⭐ **首选** | 弹窗/模态框/居中卡片 |
| B | **Flex: `justify + align`** | 2行 | ⭐⭐⭐⭐⭐ **次选** | 兼容性要求更高的场景 |
| C | Absolute + `translate(-50%, -50%)` | 3行 | ⭐⭐⭐ | 未知尺寸元素 |
| D | `margin: auto` + absolute 四方向0 | 3行 | ⭐⭐ | 需设宽高的场景 |

### 居中决策树

```
需要居中？
├─ 只水平？
│  ├─ block元素 → margin: 0 auto（需设width）
│  └─ inline/inline-block → text-align: center
│
├─ 只垂直？
│  ├─ 单行文字 → line-height = height
│  └─ 通用 → Flex: align-items: center
│
└─ 双轴居中？
   ├─ 现代项目 → Grid: place-items: center  ⭐首选
   ├─ 兼容性要求高 → Flex: justify + align    ⭐次选
   ├─ 未知尺寸 → absolute + translate(-50%, -50%)
   └─ 老IE(8+) → table-cell + vertical-align
```

### 组件库实战发现

> 分析 Vant/Element Plus/shadcn 等 6 大组件库源码后：

- **按钮内容/标签/徽标居中** → `inline-flex + align-items:center + justify-content:center`
- **输入框body/导航栏居中** → `display:flex + align-items:center`
- **弹窗居中** → wrapper 层 `flex items-center justify-center`（把 transform 留给动画）
- **角标/Badge 定位** → `absolute + translate(50%, -50%)` 四方向 class

---

## 三、移动端 Hairline 边框方案

> 来源：Q05 — 移动端 1px 边框方案

### 问题

Retina 屏幕（DPR=2/3）下 `border: 1px` 渲染为 2~3 物理像素，视觉偏粗。

### 推荐方案：伪元素 + Transform Scale

```css
/* 底部细线（列表分割线最常用）*/
.hairline-bottom { position: relative; }
.hairline-bottom::after {
  content: ''; position: absolute;
  left: 0; bottom: 0; width: 100%; height: 1px;
  background-color: var(--border-color, #e5e7eb);
  transform: scaleY(0.5);
  transform-origin: 0 100%;
}

/* 四边细线 */
.hairline-all { position: relative; }
.hairline-all::after {
  content: ''; position: absolute;
  top: 0; left: 0; width: 200%; height: 200%;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: inherit;
  transform: scale(0.5);
  transform-origin: 0 0;
  box-sizing: border-box;
  pointer-events: none;  /* 关键：不拦截点击 */
}

/* DPR 适配 */
@media (-webkit-min-device-pixel-ratio: 2) {
  .hairline-bottom::after { transform: scaleY(0.5); }
}
@media (-webkit-min-device-pixel-ratio: 3) {
  .hairline-bottom::after { transform: scaleY(0.333); }
}
```

### 方案对比

| 方案 | 圆角 | 四边 | 兼容性 | 推荐度 |
|------|------|------|--------|-------|
| `border: 0.5px` | ⚠️ 部分 | ✅ | iOS 8+/Android部分 | ⭐⭐⭐ 简单但兼容差 |
| `box-shadow: inset` | ❌ 四角异常 | ✅ | 所有浏览器 | ⭐⭐⭐ 有明显缺陷 |
| **`::after + scale()`** | ✅ | ✅ | **所有浏览器** | **⭐⭐⭐⭐⭐ 推荐** |

---

## 四、CSS Variables 规范

```css
/* ✅ 必须带 fallback 值 */
.card {
  background: var(--color-bg-card, #fff);
  border-radius: var(--radius-md, 8px);
  padding: var(--spacing-16, 16px);
}

/* ❌ 不带 fallback → 变量未定义时是 initial */
/* ❌ 硬编码魔法值 */
```

---

## 五、Flexbox 陷阱与解法

```css
/* ⚠️ flex 子项内容溢出 → 加 min-width: 0 */
.item {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ⚠️ gap 兼容性：Chrome 84+, Safari 14.1+ */
/* 更广兼容用 margin + 负 margin 技巧 */
.list { display: flex; flex-wrap: wrap; margin: -4px; }
.list > * { margin: 4px; }
```

---

## 六、选择器最佳实践

```css
/* ✅ 保持低优先级 */
.card { }              /* 0-1-0 */
.card .title { }       /* 0-2-0 */
.card.is-active { }    /* 0-2-0 */

/* ❌ 避免 */
#app .card .title { }  /* 1-2-0 */
.title { color: red !important; }

/* ✅ CSS Modules 类名 kebab-case，状态 is-/has- */
/* ✅ 覆盖第三方用 :global */
.wrapper :global(.ant-btn) { border-radius: 2px; }
/* ❌ 嵌套不超过 3 层 */
```

### 兼容性速查

```
✅ 安全：.class, :hover, :focus, :nth-child, ::before/after, [attr]
⚠️ 谨慎：:is(), :where(), :focus-visible（Chrome 86+）
❌ 禁止：:has(), @container, @layer, subgrid
```

---

## 七、文本溢出处理

```css
/* 单行省略 */
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 多行省略 */
.line-clamp-2 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

/* ⚠️ flex 子项中使用省略需加 min-width: 0 */
```

---

## 八、深色模式方案

> 来源：Q07 — 深色模式实现方案

### 方案选择

| # | 方案 | 切换方式 | 用户控制 | 适用场景 |
|---|------|---------|---------|---------|
| 1 | **@media (prefers-color-scheme)** | 自动跟随系统 | 间接 | 内容网站/博客 |
| 2 | **[data-theme] 属性切换** | JS切换 | **完全可控** | **SaaS/WebApp（推荐）** |
| 3 | **light-dark() 函数** | 系统优先 | 依赖系统 | 简单项目（2024+） |

### data-theme 方案（推荐用于应用）

```css
:root, [data-theme="light"] {
  --bg: #f8fafc; --text: #0f172a; --card-bg: #fff;
  --border: #e2e8f0; --primary: #4f46e5;
  color-scheme: light;
}
[data-theme="dark"] {
  --bg: #0f172a; --text: #e2e8f0; --card-bg: #1e293b;
  --border: #334155; --primary: #818cf8;
  color-scheme: dark;
}
```

```javascript
// JS 切换逻辑
const toggleTheme = () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
};
// 初始化：读存储 → 跟随系统 → 默认 light
```

### 设计原则

```
✅ 背景不用纯黑 #000 → 用 #0f172a / #121212 / #1a1a2e
✅ 文字不用纯白 #fff → 用 #e2e8f0 / #cbd5e1（降低饱和度）
✅ 保持 WCAG AA 对比度 ≥ 4.5:1
✅ 增大间距补偿暗色下的层次感损失
✅ 品牌色适当提亮保持识别度
❌ 避免纯黑背景+纯白文字（对比度过高刺眼）
❌ 避免高饱和颜色直接放在深色背景上
```

### 图片暗色处理

```css
/* 图标/logo：filter invert */
[data-theme="dark"] .logo-img { filter: invert(1) hue-rotate(180deg); }
/* 图片：降低亮度提高对比度 */
[data-theme="dark"] img.content-image { filter: brightness(0.85) contrast(1.05); }
/* SVG：currentColor 自动跟随文字色 */
.icon-svg { fill: currentColor; }
```

---

## 九、动画与过渡

```css
/* ✅ 只过渡需要的属性 */
.btn { transition: opacity 0.2s ease, background-color 0.2s ease; }

/* ✅ 高性能动画属性：transform / opacity / filter */
/* ❌ 避免动画 width/height/top/left/margin（触发 reflow）*/

/* ✅ 减少动画偏好 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 十、常见坑

### margin 合并

```css
/* 用 Flexbox gap 代替（无 margin 合并）*/
.stack { display: flex; flex-direction: column; gap: 16px; }
```

### z-index 管理

```css
:root {
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-modal-backdrop: 300;
  --z-modal: 400;
  --z-tooltip: 500;
  --z-toast: 600;
}
```

---

## 十一、CSS 自检 Checklist

```
□ 所有颜色/间距/圆角用 CSS Variables + fallback
□ 布局以 Flexbox 为主，复杂二维用 Grid
□ 未使用 :has() / @container / @layer / subgrid
□ 选择器嵌套不超过 3 层
□ 无 !important
□ 动画只用 transform/opacity/filter
□ 有 prefers-reduced-motion 媒体查询
□ Flex 子项有 min-width: 0 防溢出
□ 类名 kebab-case，状态类 is-/has-
□ 无硬编码魔法数字
□ 移动端 1px 边框用 hairline 方案
□ 深色模式已适配（变量切换 or media query）
```
