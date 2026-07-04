---
name: css-style-writer
description: >
    最优CSS样式设计。当用户要求写样式、生成CSS、创建SCSS文件、
    添加组件样式、写style代码、生成module.scss时使用。
    核心目标：以最少的DOM结构和最少的CSS代码实现最佳视觉效果，
    充分挖掘CSS原生能力（继承/伪元素/gap/flex隐式属性等）。
    严格遵循扁平结构（禁止嵌套class），使用CSS变量Token系统，
    自动检测构建配置确定CSS Module范围和类名规范。
    不要用于：设计页面布局（→ admin-ui-design）、写组件逻辑、工程化配置、
    Tailwind CSS（→ 直接写 className）、styled-components 等 CSS-in-JS 方案。
version: 3.0.0
dependencies: [specflow-rules-engine]
conflict-with: [admin-ui-design]
allowed-tools: [read_file, write_file, replace_in_file, search_content, execute_command]
max-token: 2800
---

# CSS Style Writer v3.0 — 最优样式设计

## 🛑 入口守卫

```
本 Skill 加载后必须按 Step 0→1→...→6 顺序执行全部步骤。
每步播报完成消息，未播报 = 未执行 = 违规。
禁止跳步，禁止跳过规则注入（Step 0 specflow-rules-engine）。
```

**核心定位：不是"写样式"，而是"用最少的代码实现最好的效果，像CSS大师那样榨干每一个原生能力"。**

> 🧠 **设计哲学**：像一个精通 CSS 的前端专家那样逐步推理——先检测环境确定规则，
> 再加载 Token 确定变量，做架构决策确定最简实现，最后编码并自审。
> 每一步都有约束和验证，不通过不继续。

核心目标排序：**最简结构 > 最少代码 > 视觉还原 > Token合规 > 状态完备**

---

## 何时使用 / 何时不使用

**应该触发：**

- "写样式"、"生成CSS"、"创建SCSS文件"、"添加组件样式"
- "写style代码"、"生成module.scss"
- 组件需要新建或修改样式文件

**不应触发：**

- 设计页面布局（→ admin-ui-design）
- 写组件逻辑 / 工程化配置
- Tailwind CSS（→ 直接写 className）
- styled-components / emotion 等 CSS-in-JS

---

## 样式设计流程总览

```
┌─────────────────────────────────────────────────────────┐
│  🔒 Step 0: 规则注入（强制·最高优先级·不可跳过）        │
│  ↓ use_skill("specflow-rules-engine")                  │
│  ↓ 播报完成 → 后续步骤受铁律 1-8 约束                  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 1: 项目环境检测 [低自由度·强制]                   │
│  ↓ stylelint / CSS Module / 类名规范 / 变量前缀         │
│  ↓ ⚠️ Tailwind/CSS-in-JS → 停止                       │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 2: 加载设计 Token [低自由度·强制]                 │
│  ↓ 项目变量优先 / 无变量则 fallback tokens.css          │
│  ↓ ⚠️ 未加载 Token 就编码 = 硬编码风险                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 3: CSS 架构决策 [中自由度·强制]                   │
│  ↓ DOM最小化 / CSS特性优先级 / DRY检查                  │
│  ↓ ⚠️ 未做决策就编码 = 可能不是最简实现                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 4: 生成样式代码 [中自由度]                         │
│  ↓ 文件命名 / 类名规范(Step1) / 模板选择               │
│  ↓ ⚠️ 严格受铁律约束                                  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 5: 全状态覆盖 [低自由度]                          │
│  ↓ 交互元素4态 / 数据区3态 / 动效时长                   │
│  ↓ ⚠️ 缺状态 = 不完整                                  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 6: 自审清单 [低自由度·强制]                       │
│  ↓ 结构最优 / Token合规 / 尺寸 / 状态 / 反模式         │
│  ↓ ⚠️ 不通过不得交付                                  │
└─────────────────────────────────────────────────────────┘
```

> 🔒 **步骤执行约束**：每个 Step 必须按序执行。若模型认为可跳过，**必须输出跳过声明**：
>
> ```
> ⏭️ [跳过] Step {N} — {步骤名称}
> 理由：{为什么可以跳过}
> 风险：{跳过可能带来的风险}
> ```
>
> **禁止无声跳过**——未声明理由的跳过 = 违规。

---

## 🔒 Step 0 — 规则注入（强制 · 最高优先级 · 不可跳过）

```
【🔒 不可变约束】
  Step 0 必须在任何样式编写操作之前完成。
  未执行 use_skill("specflow-rules-engine") 就开始写 CSS = 严重违规，必须立即停止并回退。
  无任何豁免理由。
```

```typescript
use_skill('specflow-rules-engine') // 强制：同步 RULE.mdc + 检测 System Prompt + read_file 兜底
```

> 完成播报：`"✅ Step 0 规则注入完成：铁律 1-8 已在上下文中"` — 未播报不得进入 Step 1。
>
> ⏭️ **唯一可跳过条件**：同一次会话中已执行过 Step 0 且播报过完成消息。
> 跳过必须声明：`⏭️ [跳过] Step 0 规则注入 | 理由：同会话已注入 | 风险：无`

---

## Step 1 — 项目环境检测 [低自由度 · 强制]

> **生成任何样式前必须先读取配置**，确定代码风格和约束。
> 像工匠选工具——先看清楚材料再动手。

### 1.1 检测扫描（并行执行）

```typescript
// P0：stylelint 类名规则（★ 最高优先级）
search_file('.stylelintrc*')
search_file('stylelint.config.*')

// P1：依赖与框架
read_file('package.json')

// P2：CSS Module 范围判定
search_content('.module.scss', { outputMode: 'files_with_matches', headLimit: 5 })
search_file('webpack.config.*')
search_file('vite.config.*')

// P3：项目既有样式的命名惯例（fallback）
search_content('^\\.[a-zA-Z]', { glob: '*.{scss,css}', outputMode: 'content', headLimit: 20 })

// P4：已有的 CSS 变量定义
search_content('--color-', { glob: '*.{css,scss}', outputMode: 'files_with_matches', headLimit: 5 })
```

### 1.2 检测清单（逐条执行）

```
□ stylelint selector-class-pattern（★ 最高优先级）：
  ├─ pattern 含 [A-Z] 第二字符起 → camelCase
  ├─ pattern 含 - 分隔          → kebab-case
  ├─ pattern 含 _ 分隔          → snake_case
  └─ 无此规则                  → 往下检测

□ 排除检测（★ 不处理的场景）：
  ├─ 发现 tailwind.config.*    → 停止，告知用户本技能不适用 Tailwind
  ├─ 发现 styled-components    → 停止，告知用户使用 CSS-in-JS 方式
  └─ 发现 @emotion/css / jss   → 同上

□ UI库：antd / 无

□ CSS Module 判定：
  A: 文件名含 .module.         → 必定是 Module
  B: 构建配置 modules === true  → 全量 Module
  C: modules.auto 存在           → 按 auto 函数判定
  D: 无 modules 配置            → 仅 .module.xxx 是 Module

□ 类名规范（三级 fallback）：
  L1: stylelint selector-class-pattern（最高权威）
  L2: CSS Module + 项目惯例
  L3: 项目既有文件风格跟随
  不确定 → 询问用户

□ CSS 变量前缀：--color-xxx / 自定义
```

### 1.3 输出声明

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ CSS Style Writer: 环境检测完成
  适用性: SCSS/CSS ✓ | Tailwind ✗ | CSS-in-JS ✗
  CSS Module: 仅.module.xxx / 全量 / 非
  类名规范: [检测结果]
  变量系统: [项目实际前缀]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

> 完成播报：`"✅ Step 1 环境检测完成：{类名规范}/{CSS Module状态}"` — 未播报不得进入 Step 2。
>
> 🔒 **强制约束**：此步骤不可跳过。不检测就写 = 可能违反项目规范。

---

## Step 2 — 加载设计 Token [低自由度 · 强制]

> **项目变量优先于默认 Token。** 不强行使用默认名，除非项目确实没有。

```typescript
// ★ 优先使用项目自身变量定义
search_content('--color-', { glob: '*.{css,scss}', outputMode: 'content', headLimit: 30 })
search_content('--space-', { glob: '*.{css,scss}', outputMode: 'content', headLimit: 15 })

if (项目无自定义Token) {
    read_file('.codebuddy/skills/admin-ui-design/knowledge/tokens.css')
}
```

> 完整 Token 映射表见 `references/style-rules.md` 第三章。

> 完成播报：`"✅ Step 2 Token加载完成：{项目变量N个 / fallback tokens.css}"` — 未播报不得进入 Step 3。
>
> 🔒 **强制约束**：此步骤不可跳过。未加载 Token 就编码 = 硬编码风险。

---

## Step 3 — CSS 架构决策 [中自由度 · 强制]

> **在写任何一行 CSS 之前，先完成架构决策。**
> 这是本 skill 的核心差异——不是拿到需求就写，而是先想清楚最优实现。

### 3.1 DOM 最小化决策树

```
目标视觉效果
  ├─ 能否单元素实现？
  │   背景→background多层 ::before | 分隔→border ::after
  │   图标→background-image | 计数→counter-increment
  ├─ 能否 CSS 原生能力替代额外 DOM？
  │   选中→ :checked ~ 兄弟 | 空态→ :empty | 展收→ details
  └─ 取最小元素数
```

### 3.2 CSS 特性优先级

```
★★★ 第一梯队（零成本）：flex/grid+gap / inherit / currentColor
      / :not() :empty :first-child / ::before ::after / object-fit
★★  第二梯队（高性价比）：clamp() min() max() aspect-ratio
      / conic-gradient / backdrop-filter
★   第三梯队（按需）：@container :has() subgrid
```

### 3.3 DRY 检查

```scss
// ★ 类名为占位符，实际格式由 Step 1 决定
// 提取公共基类：
.<baseClassName > {
    height: 40px;
    padding: 0 16px;
    cursor: pointer;
}
.<variantA > {
    composes: <baseClassName>;
    background: blue;
}

// 利用继承（可继承属性不在子元素重复）：
.<parent > {
    color: var(--color-neutral-09);
}
.<child > {
    font-weight: 600;
} // color 已继承
```

### 3.4 输出决策摘要

```
📐 DOM 元素: N 个(最小可行) | CSS 特性: flex+gap/伪元素/inherit
   公共基类: X 个 | 预估行数: ~Z 行
```

> 完成播报：`"✅ Step 3 架构决策完成：{N}个DOM / {X}个基类 / ~{Z}行"` — 未播报不得进入 Step 4。
>
> 🔒 **强制约束**：此步骤不可跳过。未做决策就编码 = 可能不是最简实现。
>
> ⏭️ **可跳过条件**：仅修改一行样式（非新建文件），且改动不涉及结构变化。
> 跳过声明：`⏭️ [跳过] Step 3 架构决策 | 理由：仅修改单行样式，无结构变化 | 风险：非最简实现`

---

## Step 4 — 生成样式代码 [中自由度]

### 4.1 文件命名

```
Module (.module.xxx): index.module.scss / name.module.scss
非 Module:            index.scss / name.scss
全局:                 global.css / global.scss
```

### 4.2 类名规范

100% 由 Step 1 检测的 stylelint `selector-class-pattern` 决定。

| pattern 正则示例      | 格式       | 示例                  |
| --------------------- | ---------- | --------------------- |
| `^[a-z][a-zA-Z0-9]+$` | camelCase  | `.searchFormInput`    |
| `^[a-z][a-z0-9-]+$`   | kebab-case | `.search-form-input`  |
| `^[a-z][a-z0-9_]+$`   | snake_case | `.search_form_input`  |
| BEM 允许 `__`/`--`    | BEM        | `.search-form__input` |

### 4.3 编码模板索引

完整模板（含注释说明）见 `references/style-rules.md` 第四章 DRY 模式模板。

快速参考 — 核心模式：

**搜索卡片**（flex+gap 单层布局，子元素继承父元素 color）：
→ `references/style-rules.md` 4.4 DRY 模板 2

**按钮组**（composes 公共基类 + 仅声明差异属性）：
→ `references/style-rules.md` 4.4 DRY 模板 1

**表格**（flex 布局 + 单元格只声明对齐，其余继承行）：
→ `references/style-rules.md` 第九章

**卡片容器**（三件套：border + radius + shadow）：
→ `references/style-rules.md` 第八章

> 所有模板中的类名均为 camelCase 示例格式。**实际输出时自动替换为 Step 1 检测到的格式。**

---

## Step 5 — 全状态覆盖 [低自由度]

> 完整的状态矩阵、区域状态、动效时长见 `references/style-rules.md` 第七章。

核心要点：

```
交互元素：Default + Hover + Focus/Active + Disabled（缺一不可）
数据区：   Loading(Skeleton) + Empty(插画+CTA) + Error(错误引导)
动效：     Hover 120ms / Focus 150ms / 展开 200ms
```

> 🔒 **强制约束**：交互元素缺状态 = 不完整。数据区缺状态 = 不完整。

---

## Step 6 — 自审清单 [低自由度 · 强制]

> **交付前逐条检查，不通过不得交付。**

### 6.1 结构最优检查 ★ 核心

```
【DOM】□ 单元素能实现的不用两个 □ 装饰用伪元素 □ 分隔用border
【CSS】□ gap替代margin □ 可继承属性不重复 □ currentColor 图标跟随
      □ 公共基类提取 □ :not()/:first-child 减少选择器
【代码】□ 冗余声明删除 □ 重复块合并 □ 总行数 ≤ Step 3.4 预估值
```

### 6.2 合规检查

```
【Token】□ var(--xxx, fallback) 零硬编码 □ 使用项目自身变量名
【结构】□ 零嵌套 □ 类名符合Step 1 □ 伪类独立平铺 □ 属性顺序正确
        □ 卡片三件套齐全
【尺寸】□ 按钮40px □ 表格48px □ 标题≤18px
【表格】□ 文字left 数字right+tabular-nums 状态center 操作right
【状态】□ hover/focus/disabled全覆盖 □ Skeleton非spinner
【反模式】□ 无!important □ z-index≤1000 □ min-h-dvh非h-screen
         □ border:0非none □ @use非import □ opacity带单位
```

> 完成播报：`"✅ Step 6 自审完成：全部清单通过"` — 不通过不得交付。
>
> 🔒 **强制约束**：此步骤不可跳过。跳过自审 = 违规。

---

## 错误处理

| 场景                                  | 处理方式                                |
| ------------------------------------- | --------------------------------------- |
| **Tailwind CSS 项目**                 | 停止，告知用户直接写 `className="..."`  |
| **styled-components / emotion / JSS** | 停止，告知用户使用 CSS-in-JS 语法       |
| **纯 vanilla HTML/CSS**               | Step 1 fallback 到 L3，不确定则询问用户 |
| **项目变量命名不符合约定**            | 使用项目自己的命名，不强行转换          |

---

## 参考资料

| 文件                                                     | 内容                                                          | 加载时机          |
| -------------------------------------------------------- | ------------------------------------------------------------- | ----------------- |
| `RULE.mdc`                                               | 铁律 1-8（扁平/类名/Token/最优设计/尺寸/卡片/对齐/状态）      | Step 0 自动注入   |
| `references/style-rules.md`                              | 完整 Token 表 / CSS 特性指南 / DRY 模板 / 组件尺寸 / 状态矩阵 | Step 2 后按需查阅 |
| `.codebuddy/skills/admin-ui-design/knowledge/tokens.css` | 默认 CSS 变量（项目无定义时 fallback）                        | Step 2 fallback   |
