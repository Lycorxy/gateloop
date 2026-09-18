---
description: 常见布局完整代码模板集 —— 圣杯/双飞翼/侧栏/Modal/StickyFooter/等分/栅格/响应式。全部可直接复制运行。
globs: ["**/*.css", "**/*.scss", "**/*.module.css"]
alwaysApply: false
---

# 常见布局代码模板集

> 来源：CSS知识库/Q10-常见布局模式代码模板
> ⚡ 按需查阅，遇到布局问题时直接复制对应模板修改使用。

---

## 布局选择决策树

```
需要什么布局？
├─ 三栏(左右固定+中间自适应)
│  ├─ 有Header/Footer? → 圣杯 (grid-template-areas)
│  └─ 只要三栏? → 双飞翼 (grid: auto 1fr auto)
│
├─ 两栏(一侧固定+一侧自适应)
│  └─ 固定侧栏 (grid: 260px 1fr) ← 最常用！后台管理标配
│
├─ 弹窗/对话框
│  └─ 全屏覆盖 (inset:0 + place-items:center)
│
├─ Footer需贴底?
│  └─ Sticky Footer (flex-direction:column + main flex:1)
│
├─ N等分?
│  ├─ 固定N等分 → repeat(N, 1fr)
│  └─ 自动适配 → repeat(auto-fit, minmax(min, 1fr))
│
├─ 复杂多栏响应式?
│  └─ 12列栅格 + @media 断点 + span-N 类
│
└─ 组件级响应式?
   └─ Container Query (@container) ← 2023最新!
```

---

## 模板 1：圣杯布局 (Holy Grail) — Grid

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
.hg-header { grid-area: header; }
.hg-nav    { grid-area: nav; }
.hg-main   { grid-area: main; }
.hg-aside  { grid-area: aside; }
.hg-footer { grid-area: footer; }
```

```html
<div class="holy-grail">
  <header class="hg-header">Header</header>
  <nav class="hg-nav">Nav(左侧)</nav>
  <main class="hg-main">Main Content(自适应)</main>
  <aside class="hg-aside">Aside(右侧)</aside>
  <footer class="hg-footer">Footer</footer>
</div>
```

---

## 模板 2：双飞翼布局 — Grid

```css
.double-wing {
  display: grid;
  grid-template-columns: 200px 1fr 180px;
  gap: 1.5rem;
  min-height: 100vh;
}
```

```html
<div class="double-wing">
  <aside class="dw-left">左侧栏</aside>
  <main class="dw-main">主内容区域</main>
  <aside class="dw-right">右侧栏</aside>
</div>
```

---

## 模板 3：固定侧栏 + 主内容（后台管理标配）

### Grid 版本

```css
.sidebar-layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: 100vh;
}
.sidebar-layout main { overflow-y: auto; }
```

### Flex 版本（更兼容）

```css
.sidebar-layout {
  display: flex;
  min-height: 100vh;
}
.sidebar-layout aside {
  width: 260px;
  flex-shrink: 0;
}
.sidebar-layout main {
  flex: 1;
  overflow-y: auto;
}
```

```html
<div class="sidebar-layout">
  <aside><h3>导航菜单</h3><nav><!-- 导航链接 --></nav></aside>
  <main style="padding:2rem;"><h1>主内容区</h1></main>
</div>
```

---

## 模板 4：全屏居中覆盖 (Modal/Lightbox)

```css
.overlay-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: grid;
  place-items: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}
.overlay-modal {
  background: white;
  border-radius: 16px;
  padding: 2rem;
  max-width: 520px;
  width: 90%;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 25px 50px rgba(0,0,0,0.25);
}
```

```html
<div class="overlay-backdrop">
  <div class="overlay-modal">
    <h2>模态框标题</h2>
    <p>内容区域...</p>
    <button>关闭</button>
  </div>
</div>
```

---

## 模板 5：Sticky Footer

### Flex 方案（推荐）

```css
.sticky-footer-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.sf-header { /* 头部 */ }
.sf-main { flex: 1; /* 撑开剩余空间 */ }
.sf-footer { /* 底部始终贴底 */ }
```

### Grid 方案

```css
.sticky-grid-page {
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 100vh;
}
```

```html
<body class="sticky-footer-page">
  <header class="sf-header">Header</header>
  <main class="sf-main">Main Content（即使内容少Footer也在底部）</main>
  <footer class="sf-footer">Footer (Always at Bottom)</footer>
</body>
```

---

## 模板 6：等分布局

### Flex 等分

```css
.equal-flex { display: flex; gap: 0.75rem; }
.equal-flex > * { flex: 1; min-width: 0; }
```

### Grid 等分（更灵活）

```css
.equal-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
.equal-grid-auto {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
}
```

---

## 模板 7：栅格系统 Grid（12列）

```css
.grid-system { display: grid; grid-template-columns: repeat(12, 1fr); gap: 1.5rem; }
.col-span-1  { grid-column: span 1; }
.col-span-2  { grid-column: span 2; }
.col-span-3  { grid-column: span 3; }
.col-span-4  { grid-column: span 4; }
.col-span-6  { grid-column: span 6; }
.col-span-8  { grid-column: span 8; }
.col-span-12 { grid-column: span 12; }

/* 响应式栅格：自动换行 */
.grid-responsive {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1.5rem;
}
```

---

## 模板 8：响应式断点布局 (Mobile First)

```css
/* Base: Mobile (< 640px) */
.responsive-layout {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
}
.responsive-layout > * { width: 100%; }

/* Tablet (>= 640px) */
@media (min-width: 640px) {
  .responsive-layout {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .rl-sidebar { order: -1; width: 33.333%; }
  .rl-main { width: 66.666%; }
}

/* Desktop (>= 1024px) */
@media (min-width: 1024px) {
  .responsive-layout { flex-wrap: nowrap; }
  .rl-sidebar { width: 280px; flex-shrink: 0; }
  .rl-main { flex: 1; }
  .rl-extra { width: 200px; display: block; }
}

/* Large Desktop (>= 1280px) */
@media (min-width: 1280px) {
  .responsive-layout { max-width: 1280px; margin: 0 auto; }
  .rl-sidebar { width: 300px; }
  .rl-extra { width: 240px; }
}
```

---

## 进阶技巧速查

```css
/* clamp() 动态尺寸 */
.title { font-size: clamp(16px, 2vw + 12px, 24px); }

/* Container Query (2023+) —— 组件级响应式 */
.card-container { container-type: inline-size; }
@container (min-width: 400px) {
  .card-inner { display: grid; grid-template-columns: 120px 1fr; }
}

/* 逻辑属性适配 RTL */
.rtl-safe-sidebar { grid-template-columns: 240px 1fr; }
```

---

## 兼容性速查

| 布局技术 | Chrome | Firefox | Safari | Edge |
|----------|--------|---------|--------|------|
| Grid Layout (含areas) | 57+ | 52+ | 10.1+ | 16+ |
| Flex Layout | 29+ | 20+ | 9+ | 12+ |
| `inset:` 简写 | 87+ | 66+ | 14.1+ | 87+ |
| `place-items: center` | 59+ | 45+ | 11+ | 16+ |
| `repeat(auto-fill/fit, minmax())` | 57+ | 52+ | 10.1+ | 16+ |
