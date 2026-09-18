# CSS/SCSS 组件样式编写 — 铁律与规范

> 本文件包含样式编写的详细规则，SKILL.md 引用此处内容以保持正文精简。

## 一、扁平结构铁律（最高优先级）

### 1.1 绝对禁止嵌套

```
✗ 禁止任何形式的嵌套选择器（<className> 为占位符）：

  .<className> {
    .child { ... }            ← 子选择器
    &.active { ... }          ← & 前缀
  }
  .<className> .child { ... } ← 级联

✓ 必须全部平铺：

  .<className> { ... }
  .<className>Child { ... }
  .<className>Body { ... }
  .<className>Child:hover { ... }   ← 伪类也平铺
```

### 1.2 类名由 stylelint + 构建配置动态决定（★ 不写死）

```scss
// 优先级 1（最高权威）：stylelint selector-class-pattern 规则
//
//   pattern: "^[a-z][a-zA-Z0-9]+$"     → camelCase
//     例：.searchForm / .searchFormInput / .tableCellActions
//
//   pattern: "^[a-z][a-z0-9-]+$"        → kebab-case
//     例：.search-form / .search-form-input / .table-cell-actions
//
//   pattern: "^[a-z][a-z0-9_]+$"         → snake_case
//     例：.search_form / .search_form_input
//
//   无 stylelint 或无此规则 → 继续往下检测

// 优先级 2：CSS Module 判定 → 通常配合 camelCase
// 优先级 3：项目既有风格 → BEM / OOCSS / 其他

// ★ 实际使用哪种格式，在 Step 1 检测时确定，后续所有代码统一使用该格式
```

### 1.3 伪类/伪元素平铺

```scss
// <className> 为 Step 1 检测到的实际格式（以下为 camelCase 示例）
.<buttonClass> {
  height: var(--btn-height, 40px);
  background: var(--color-blue-07, #1e67fa);
}
.<buttonClass>:hover { opacity: .85; }        // 独立选择器
.<buttonClass>:active { transform: scale(.98); }
.<buttonClass>:disabled { opacity: .5; cursor: not-allowed; }
```

## 二、构建配置检测（Step 1 强制执行）

### 2.1 需检测的文件

| 文件 | 检测内容 |
|------|---------|
| `package.json` | dependencies (antd/less/sass/style-loader) |
| 搜索 `*.module.scss` | 是否存在 Module 文件模式 |
| `webpack.config.*` / `vite.config.*` | CSS Modules 范围配置 |
| 项目既有 `*.scss` 文件 | 类名命名惯例 |

### 2.2 CSS Module 判定规则

```
规则 A：文件名含 .module. → 必定是 CSS Module
规则 B：构建配置 css.modules === true → 全量 Module
规则 C：css.modules.auto 存在 → 按 auto 函数判定
规则 D：无 modules 配置 → 仅 .module.xxx 是 Module
```

### 2.3 类名规范判定

```
优先级 1（最高权威）：读取 .stylelintrc* / stylelint.config.*
  → selector-class-pattern 规则的 pattern 正则决定命名格式
  例：^[a-z][a-zA-Z0-9]+$ → camelCase / ^[a-z][a-z0-9-]+$ → kebab-case
优先级 2：CSS Module 检测 → 通常配合 camelCase（styles.className JS 访问）
优先级 3：非 Module + BEM 约定 → block__element--modifier
优先级 4：跟随项目其他风格（搜索已有 *.scss 文件）
不确定 → 询问用户或跟随最近邻文件
```

## 三、设计 Token 系统（项目优先，零硬编码）

### 3.1 颜色 Token

| Token | 值 | 用途 |
|-------|-----|------|
| `--color-neutral-01` | `#FFFFFF` | 卡片/面板背景 |
| `--color-neutral-02` | `#F5F5F5` | 页面底色/表头 |
| `--color-neutral-03` | `#EBEBEB` | 边框/分割线 |
| `--color-neutral-04` | `#E0E0E0` | 输入框边框 |
| `--color-neutral-06` | `#B8B8B8` | placeholder |
| `--color-neutral-08` | `#525252` | label文字 |
| `--color-neutral-09` | `#2B2B2B` | 正文 |
| `--color-neutral-10` | `#131315` | 主标题 |
| `--color-blue-07` | `#1E67FA` | **品牌主色** |
| `--color-blue-06` | `#4784FF` | hover态 |
| `--color-red-07` | `#E52E2E` | 危险/错误 |
| `--color-orange-07` | `#FA820A` | 警告 |
| `--color-green-07` | `#15AD3D` | 成功 |

> **⚠️ 以上为 fallback 默认值。实际使用时必须读取项目自身变量，使用项目的命名和值。**

### 3.2 间距 Token（4px基准 8pt网格）

| Token | 值 | 用途 |
|-------|-----|------|
| `--space-4` | `4px` | 图标与文字间 |
| `--space-8` | `8px` | 行内元素间距 |
| `--space-12` | `12px` | 列表项内边距 |
| `--space-16` | `16px` | 内容区内边距 |
| `--space-24` | `24px` | 卡片内边距 |
| `--space-32` | `32px` | 大模块间距 |
| `--space-48` | `48px` | 页面级间距 |

### 3.3 圆角 Token

| Token | 值 | 用途 |
|-------|-----|------|
| `--radius-sm` | `2px` | **按钮、输入框** |
| `--radius-md` | `4px` | 标签、小卡片 |
| `--radius-lg` | `8px` | 面板、卡片 |
| `--radius-xl` | `12px` | 弹窗、大卡片 |
| `--radius-full` | `9999px` | 头像(圆形) |

### 3.4 字体层级

| 层级 | Size | Weight | Color | 用途 |
|------|------|--------|-------|------|
| 页面标题 | `18px` | `600` | neutral-10 | 内容区最大字号 |
| 卡片标题 | `16px` | `600` | neutral-10 | 分组标题 |
| 正文/表格 | `14px` | `400` | neutral-09 | 默认字号 |
| Label | `14px` | `400` | neutral-08 | 表单标签 |
| 占位符 | `14px` | `400` | neutral-06 | input placeholder |

### 3.5 阴影系统

| Token | 值 |
|-------|-----|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,.04)` |
| `--shadow-md` | `0 2px 8px rgba(0,0,0,.06)` |
| `--shadow-lg` | `0 4px 16px rgba(0,0,0,.08)` |
| `--shadow-xl` | `0 8px 32px rgba(0,0,0,.12)` |

### 3.6 Z-index 层级

| Token | 值 | 用途 |
|-------|-----|------|
| `--z-base` | `0` | 默认层 |
| `--z-sticky` | `10` | 表头固定 |
| `--z-dropdown` | `100` | 下拉浮层 |
| `--z-overlay` | `500` | 遮罩 |
| `--z-modal` | `501` | 弹窗内容 |
| `--z-toast` | `600` | 通知 |
| `--z-tooltip` | `700` | 提示浮层 |

## 四、★ 最优设计 — CSS 特性利用指南

### 4.1 替代额外 DOM 的 CSS 能力

| 需求 | 传统做法（冗余DOM） | ★ 最优CSS方案 |
|------|-------------------|--------------|
| 装饰线/分隔 | `<div class="divider">` | `border-bottom` / `::after` |
| 装饰性图标 | `<i class="icon">` / `<img>` | `background-image` / `::before` |
| 角标/标记 | `<span class="badge">` | `::after` + content |
| 清除浮动 | `<div class="clearfix">` | `::after` clear 或直接 flex/grid |
| 序号/计数 | JS 动态写入 DOM | `counter-increment/reset` + `content` |
| 选中联动子元素 | JS addClass | `:checked ~ .sibling` |
| 空状态样式 | JS 控制 show/hide | `:empty` / `:blank` 伪类 |
| 第一个/最后个特殊样式 | JS 判断 index | `:first-child` / `:last-child` |
| 奇偶行斑马纹 | JS 判断 odd/even | `:nth-child(even)` |

### 4.2 减少重复声明的 CSS 能力

| 场景 | 冗余写法 | ★ 最优写法 |
|------|---------|-----------|
| 子元素同色 | 每个子元素都写 `color:#333` | 父元素声明，子元素继承 |
| 图标随文字变色 | 图标单独指定颜色 | `color: currentColor` |
| 多元素相同状态 | 每个 focus 都写一遍 | `.a:focus, .b:focus { ... }` |
| 按钮公共属性 | 每个 button 重复 height/padding | 提取 `.btnBase` 基类 |
| 子元素间距 | 每个 child 写 margin-right | 父元素 `display:flex; gap: Npx` |

### 4.3 减少媒体查询的 CSS 能力

| 场景 | 传统写法 | ★ 最优写法 |
|------|---------|-----------|
| 响应式字体 | 3 个断点各写 font-size | `font-size: clamp(14px, 2vw, 18px)` |
| 自适应容器 | JS 监听 resize | `width: min(100%, 500px)` |
| 自适应比例 | padding-bottom hack | `aspect-ratio: 16 / 9` |
| 容器自适应 | 固定值 | `width: fit-content` |

### 4.4 DRY 模式模板

```scss
// ★ <className> 为 Step 1 stylelint selector-class-pattern 决定的实际格式
//   以下使用 camelCase 示例（若项目为 kebab-case 则 .btn-base / .btn-primary）

// ===== 模式 1：基类 + 变体 =====
.<baseClass> {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--btn-height, 40px);
  padding: 0 16px;
  font-size: 14px;
  border: 0;
  border-radius: var(--radius-sm, 2px);
  cursor: pointer;
  transition: all 200ms ease;
}

// CSS Module 组合
.<primaryClass> {
  composes: <baseClass>;
  color: #fff;
  background: var(--color-blue-07, #1e67fa);
}

// 非 Module 多 class
<div class="<baseClass> <primaryClass>">

// ===== 模式 2：继承优化 =====
.<cardWrap> {
  color: var(--color-neutral-09, #2b2b2b);  // 子元素继承
  font-size: 14px;
  line-height: 1.5;
}
.<cardTitle> { font-weight: 600; }           // 只声明差异
.<cardBody>  { font-weight: 400; }

// ===== 模式 3：状态合并 =====
.<inputFocusable>:focus,
.<selectFocusable>:focus,
.<textareaFocusable>:focus {
  outline-color: var(--color-blue-07, #1e67fa);
  outline-width: 2px;
}
```

## 五、组件精确尺寸规格

| 组件 | 高度 | 圆角 | 备注 |
|------|------|------|------|
| Primary/Line按钮 | `40px` | `2px` | padding: 0 16px |
| 文字按钮 | — | — | 无背景无边框 |
| 输入框/Select | `40px` | `2px` | outline: 1px neutral-04 |
| 表格数据行 | `48px` | — | border-bottom |
| 表格表头 | `48px` | — | bg:neutral-02 fw:600 |
| 导航菜单项 | `40px` | — | padding: 0 20px |
| 菜单选中 | `40px` | `2px` | 内缩8px bg:blue-02 |
| 页面标题栏 | `64px` | — | border-bottom |
| 底部操作栏 | `80px` | — | 按钮右对齐 |
| 左侧导航 | `208px`宽 | — | border-right |
| 卡片容器 | — | `8px` | 三件套 |

## 六、CSS 属性顺序

```
1. 定位    position, top, right, bottom, left, z-index
2. 盒模型  display, flex-flow, grid, width, height, margin, padding, box-sizing, overflow, gap
3. 排版    font, line-height, text-align, white-space, color, font-variant-numeric
4. 视觉    background, border, border-radius, box-shadow, opacity, outline
5. 动效    transition, animation, transform, will-change
6. 其他    cursor, pointer-events, user-select, content, visibility
```

## 七、交互状态规范

### 7.1 元素状态完整矩阵

```scss
// <className> 为 Step 1 检测到的实际格式
.<className> {
  // Default 样式
}
.<className>:hover {
  // Hover 态
}
.<className>:focus-visible {
  // 键盘聚焦态
}
.<className>:active {
  // 点击按下态（仅按钮类）
}
.<className>:disabled {
  opacity: .5;
  cursor: not-allowed;
  pointer-events: none;
}
```

### 7.2 区域状态

| 状态 | 表格 | 卡片 | 全局 |
|------|------|------|------|
| Loading | Skeleton骨架屏 | Skeleton脉冲 | 全屏Skeleton |
| Empty | 插画+"暂无数据"+CTA | 同上 | 同上 |
| Error | 内联错误+重试 | ErrorBoundary | ErrorBoundary |

## 八、卡片三件套（强制）

```scss
// <className> 为 Step 1 检测到的实际格式
.<cardClass> {
  background: var(--color-neutral-01, #fff);
  border: 1px solid var(--color-neutral-03, #ebebeb);
  border-radius: var(--radius-lg, 8px);
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,.04));
}
// 缺任何一项都是不完整的卡片
```

## 九、表格对齐规则

```scss
// <className> 为 Step 1 检测到的实际格式（以下为 camelCase 示例）
.<cellText>   { text-align: left; }
.<cellNumber> {
  text-align: right;
  font-variant-numeric: tabular-nums;  // 数字等宽对齐
}
.<cellStatus> { text-align: center; }
.<cellActions>{ text-align: right; }
```

## 十、全局字体与重置

```scss
html {
  font-family: "PingFang SC", -apple-system, BlinkMacSystemFont,
               "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-neutral-09, #2b2b2b);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

## 十一、响应式安全

```scss
// ✗ 禁止：h-screen（iOS Safari 地址栏收缩导致跳动）
// ✓ 正确：
.pageContainer { min-height: 100dvh; }

// ✗ 禁止：100vw（忽略滚动条宽度导致横向溢出）
// ✓ 正确：
.fullWidth { width: 100%; }

// 断点参考
@media (max-width: 768px)  { /* 移动端 */ }
@media (min-width: 769px)  { /* 桌面端 */ }

// ★ 间距统一用 gap，禁止 margin 堆砌子元素间距
.flexRow { display: flex; gap: var(--space-8, 8px); }
```

## 十二、反模式清单

```
【结构】
□ 禁止嵌套选择器（扁平）
□ 禁止装饰性真实 DOM（→ 伪元素/CSS实现）
□ 禁止子元素重复父元素可继承属性

【硬编码】
□ 禁止硬编码色值 → var(--color-xxx)
□ 禁止硬编码间距 → var(--space-xxx)
□ 禁止强行替换项目变量名为默认Token名

【尺寸】
□ 禁止按钮圆角 ≠ 2px
□ 禁止表格行高 ≠ 48px
□ 禁止表格全文居中

【兼容/安全】
□ 禁止 !important
□ 禁止 z-index > 1000
□ 禁止 h-screen → min-h-dvh
□ 禁止 100vw → 100%
□ 禁止 :has()/@container/@layer/subgrid（除非明确允许）
□ 禁止动画 width/height/top/left → transform/opacity
□ 禁止 border: none → border: 0
□ 禁止 @import → @use
□ 禁止 opacity 不带单位 → .5
□ 禁止渐变背景（顶部导航除外）
□ 禁止 emoji 作图标

【DRY 违规】
□ 禁止相同样式复制粘贴 → 提取基类
□ 禁止每个子元素都声明 color/font（父元素可继承时）
□ 禁止不用 gap 而给每个子元素写 margin
```
