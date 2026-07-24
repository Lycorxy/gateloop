---
name: css-style-writer
description: >
    最优CSS样式设计。当用户要求写样式、生成CSS、创建SCSS文件、
    添加组件样式、写style代码、生成module.scss时使用。
    核心目标：以最少的DOM结构和最少的CSS代码实现最佳视觉效果，
    充分挖掘CSS原生能力（继承/伪元素/gap/flex隐式属性等）。
    严格遵循扁平结构（禁止嵌套class），使用CSS变量Token系统，
    自动检测构建配置确定CSS Module范围和类名规范。
    严格按规范执行，禁止跳过，自审+stylelint验证通过才交付。
    不要用于：设计页面布局（→ admin-ui-design）、写组件逻辑、工程化配置、
    Tailwind CSS（→ 直接写 className）、styled-components 等 CSS-in-JS 方案。
version: 5.0.0
dependencies: [specflow-rules-engine]
conflict-with: [admin-ui-design]
allowed-tools: [read_file, write_file, replace_in_file, search_content, execute_command]
max-token: 1500
---

# CSS Style Writer v5.0 — 最优样式设计（禁止跳过）

## 🛑 入口守卫（不可绕过·禁止跳过）

```
本 Skill 加载后必须按 Step 0→1→2→3→4→5→6 顺序执行全部步骤。
每步播报完成消息，未播报 = 未执行 = 违规。

禁止行为（不允许跳过）：
  ✗ 跳过 Step 0 规则注入
  ✗ 跳过 Step 1 环境检测
  ✗ 跳过 Step 6 自审 + stylelint 验证
  ✗ 自审不通过就交付（必须修复到通过）
  ✗ 行数超限不拆分（SCSS ≤ 300 行）
  ✗ 偷懒放宽规范（扁平结构/变量/尺寸是硬性约束）
```

**核心定位：用最少的代码实现最好的效果，像 CSS 大师榨干每一个原生能力。严格按规范，不偷懒。**

---

## 何时使用 / 何时不使用

**应该触发：** 写样式、生成CSS、创建SCSS文件、添加组件样式、写style代码、生成module.scss

**不应触发：** 设计页面布局(→admin-ui-design)、写组件逻辑、工程化配置、Tailwind CSS(→直接写className)、styled-components/emotion

---

## 步骤流程总览

```
🔒 Step 0: 规则注入（强制·不可跳过）— specflow-rules-engine
Step 1: 项目环境检测（强制）— 类名规范/CSS Module/变量前缀
Step 2: 加载设计 Token（强制）— 项目变量优先/fallback
Step 3: CSS 架构决策（强制）— DOM最小化/CSS特性/DRY
Step 4: 生成样式代码
Step 5: 全状态覆盖
Step 6: 自审 + stylelint 验证（强制·不通过不交付）
```

> 🔒 每步按序执行，禁止跳过。不通过不交付。

---

## 中断与恢复

若中断后恢复：
1. 扫描已有输出，确认完成的 Step
2. 播报恢复点：`⏯️ [恢复] 已完成：Step0✅... | 断点：Step{N}`
3. 从断点继续，不重复不遗漏

---

## 🔒 Step 0 — 规则注入（强制 · 不可跳过）

```
未执行规则注入就写 CSS = 严重违规，立即停止回退。
```

RULE.mdc `alwaysApply: true`，走 specflow-rules-engine 同步到 System Prompt：

```typescript
use_skill('specflow-rules-engine') // 同步 RULE.mdc → .codebuddy/rules/ + 检测注入 + read_file 兜底
```

> **播报：** `✅ [Step 0] 规则注入完成（specflow-rules-engine / alwaysApply: true / 铁律1-8就绪）`

---

## Step 1 — 项目环境检测（强制 · 不可跳过）

### 1.1 检测内容

| 优先级 | 检测项 | 方式 |
|--------|--------|------|
| P0 | stylelint 类名规则 | `search_file('.stylelintrc*')` |
| P1 | 依赖与框架 | `read_file('package.json')` |
| P2 | CSS Module 范围 | `search_content('.module.scss')` |
| P3 | 项目既有命名惯例 | `search_content('^[a-zA-Z]', '*.scss')` |
| P4 | 已有的 CSS 变量 | `search_content('--color-', '*.{css,scss}')` |

### 1.2 检测清单

```
□ stylelint selector-class-pattern → camelCase/kebab/snake/Pascal
□ 排除检测：Tailwind / styled-components / emotion → 停止并告知
□ CSS Module 判定 | □ 类名规范(三级fallback) | □ CSS 变量前缀
```

> **播报：** `✅ Step 1 环境检测完成：{类名规范}/{CSS Module状态}`

---

## Step 2 — 加载设计 Token（强制 · 不可跳过）

```typescript
search_content('--color-', '*.{css,scss}') // 项目颜色变量
search_content('--space-', '*.{css,scss}') // 项目间距变量
// 无项目变量 → read_file('.codebuddy/skills/admin-ui-design/knowledge/tokens.css')
```

> **播报：** `✅ Step 2 Token加载完成：{项目变量N个 / fallback}`

---

## Step 3 — CSS 架构决策（强制 · 不可跳过）

按需加载 `references/style-rules.md` 第4章，输出决策摘要：

```
📐 DOM 元素: N 个 | CSS 特性: flex+gap/伪元素/inherit
   公共基类: X 个 | 预估行数: ~Z 行（≤ 300）
```

```
□ DOM 最小化已考虑（伪元素替代装饰 DOM）
□ CSS 特性优先级已决策 | □ DRY 检查已完成
```

> **播报：** `✅ Step 3 架构决策完成：{N}个DOM / {X}个基类`

---

## Step 4 — 生成样式代码

- 类名规范由 Step 1 检测结果决定
- 按需加载 `references/style-rules.md` 第4章模板
- **SCSS 文件 ≤ 300 行，超限必须拆分（不偷懒）**

---

## Step 5 — 全状态覆盖

```
交互元素：Default + Hover + Focus/Active + Disabled
数据区：  Loading(Skeleton) + Empty(插画+CTA) + Error(错误引导)
动效：    Hover 120ms / Focus 150ms / 展开 200ms
```

---

## Step 6 — 自审 + stylelint 验证（强制 · 不通过不交付）

### 6.1 自审清单

```
【结构】□ 零嵌套 □ 装饰用伪元素 □ 分隔用border □ 可继承不重复
【Token】□ var(--xxx, fallback) 零硬编码 □ 使用项目自身变量
【尺寸】□ 按钮40px □ 表格48px □ 标题≤18px □ 卡片三件套
【表格】□ 文字left 数字right 状态center 操作right
【状态】□ hover/focus/disabled全覆盖 □ Skeleton非spinner
【反模式】□ 无!important □ z-index≤1000 □ min-h-dvh □ @use
【规模】□ SCSS 文件 ≤ 300 行（超限已拆分）
```

### 6.2 stylelint 验证（强制 · 不允许跳过）

```bash
npx nut-lint run <scss_file>
# 或 npx nut-lint fix <scss_file> --write 自动修复
```

```
□ stylelint: 0 错误
□ 自审 7 项全部通过
有错误 → fix --write（只跑一次）→ 逐条分析剩余 → 手动修不可自动修的 → 再验证
⚠️ 禁止盲目循环跑 fix（不可自动修的选择器/属性必须手动改）
不通过 → 必须修复到通过，不允许留给用户手动
```

> **播报：** `✅ Step 6 自审+验证完成：7项全通过 / stylelint 0错误` — 不通过不交付。

---

## 错误处理

| 场景 | 处理 |
|------|------|
| Tailwind CSS 项目 | 停止，告知直接写 `className="..."` |
| styled-components / emotion | 停止，告知使用 CSS-in-JS 语法 |
| 纯 vanilla HTML/CSS | Step 1 fallback，不确定则询问 |
| SCSS 超 300 行 | 必须拆分，不偷懒超限交付 |
| stylelint 有错误 | npx nut-lint fix --write 自动修复到 0 错误 |

---

## 参考资料

| 文件 | 内容 | 加载时机 |
|------|------|---------|
| `references/style-rules.md` | 铁律/Token表/CSS特性/DRY模板/尺寸/状态矩阵/反模式 | Step 2后按需 |
| `tokens.css` (admin-ui-design) | 默认CSS变量 fallback | Step 2 无项目变量时 |
