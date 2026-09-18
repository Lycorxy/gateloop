---
description: 设计 Token 权威规则 — Figma 设计稿提取的项目专属色彩/间距/圆角/字体/组件规格。按需查阅（项目有设计稿时使用）。
globs: ["**/*.tsx", "**/*.scss", "**/*.module.css"]
alwaysApply: false
---

# 设计 Token 权威规则（源自 Figma 设计稿）

> ⚠️ 本文件是项目设计的唯一权威来源。当项目有 Figma 设计稿时参考。
> ⚡ 本文件为知识库参考，仅在有设计稿还原需求时查阅。

---

## 一、色彩系统

### 中性色

| Token | 色值 | 用途 |
|-------|------|------|
| `--color-neutral-01` | `#FFFFFF` | 卡片/面板/输入框背景 |
| `--color-neutral-02` | `#F5F5F5` | 页面底色、表格表头背景 |
| `--color-neutral-03` | `#EBEBEB` | 边框、分割线 |
| `--color-neutral-04` | `#E0E0E0` | 输入框边框 |
| `--color-neutral-06` | `#B8B8B8` | placeholder |
| `--color-neutral-07` | `#808080` | 辅助图标 |
| `--color-neutral-08` | `#525252` | label/次要文字 |
| `--color-neutral-09` | `#2B2B2B` | 正文/表格内容 |
| `--color-neutral-10` | `#131315` | 主标题 |

### 品牌蓝

| Token | 色值 | 用途 |
|-------|------|------|
| `--color-blue-01` | `#F5F8FF` | hover 底色 |
| `--color-blue-02` | `#E5EEFF` | 菜单选中底色 |
| `--color-blue-05` | `#70A0FF` | 头像/图标背景 |
| `--color-blue-06` | `#4784FF` | 线框按钮边框 |
| `--color-blue-07` | `#1E67FA` | 品牌主色、主按钮、链接 |

### 语义色

| Token | 色值 | 用途 |
|-------|------|------|
| `--color-red-07` | `#E52E2E` | 错误、必填 |
| `--color-orange-07` | `#FA820A` | 警告 |
| `--color-green-07` | `#15AD3D` | 成功 |

---

## 二、间距系统（4px 基准）

| Token | 值 | 用途 |
|-------|-----|------|
| `--space-4` | `4px` | 图标与文字间距 |
| `--space-8` | `8px` | 行内元素间距 |
| `--space-12` | `12px` | 列表项内边距 |
| `--space-16` | `16px` | 内容区内边距、卡片间距 |
| `--space-24` | `24px` | 卡片内边距、模块间距 |
| `--space-32` | `32px` | 大模块间距 |

---

## 三、圆角系统

| Token | 值 | 用途 |
|-------|-----|------|
| `--radius-sm` | `2px` | 按钮、输入框 |
| `--radius-md` | `4px` | 小卡片、标签 |
| `--radius-lg` | `8px` | 面板、卡片 |
| `--radius-xl` | `12px` | 大卡片、弹窗 |
| `--radius-full` | `9999px` | 圆形头像 |

---

## 四、字体系统

| 场景 | size | weight | color |
|------|------|--------|-------|
| 页面标题 | 18px | 600 | neutral-10 |
| 卡片标题 | 16px | 600 | neutral-10 |
| 正文/表格 | 14px | 400 | neutral-09 |
| label/辅助 | 14px | 400 | neutral-08 |
| placeholder | 14px | 400 | neutral-06 |

---

## 五、组件规格

### 按钮

```css
/* 主按钮 */
height: 40px; padding: 0 16px; border-radius: 2px;
background: var(--color-blue-07); color: #fff;

/* 文字按钮 */
height: 20px; color: var(--color-blue-07); background: transparent;
```

### 输入框/Select

```css
height: 40px; border-radius: 2px;
outline: 1px solid var(--color-neutral-04);
```

### 表格

```css
/* 表头 */ height: 48px; background: var(--color-neutral-02);
/* 数据行 */ height: 48px; border-bottom: 1px solid var(--color-neutral-03);
```

### 页面骨架

```
顶部导航：60px
左侧导航：208px
页面标题栏：64px
底部操作栏：80px
内容区 padding：20px
```
