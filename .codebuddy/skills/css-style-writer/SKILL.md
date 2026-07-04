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
version: 4.1.0
dependencies: [specflow-rules-engine]
conflict-with: [admin-ui-design]
allowed-tools: [read_file, write_file, replace_in_file, search_content, execute_command]
max-token: 1500
---

# CSS Style Writer v4.1 — 最优样式设计

## 🛑 入口守卫

```
本 Skill 加载后必须按 Step 0→1→...→6 顺序执行全部步骤。
每步播报完成消息，未播报 = 未执行 = 违规。
禁止跳步，禁止跳过规则注入（Step 0）。
```

**核心定位：用最少的代码实现最好的效果，像CSS大师那样榨干每一个原生能力。**

---

## 何时使用 / 何时不使用

**应该触发：** 写样式、生成CSS、创建SCSS文件、添加组件样式、写style代码、生成module.scss

**不应触发：** 设计页面布局(→admin-ui-design)、写组件逻辑、工程化配置、Tailwind CSS(→直接写className)、styled-components/emotion

---

## 步骤流程总览

```
┌─────────────────────────────────────────────────────────┐
│  🔒 Step 0: 规则注入 — alwaysApply → specflow-rules-engine  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 1: 项目环境检测 — 类名规范/CSS Module/变量前缀       │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 2: 加载设计 Token — 项目变量优先/fallback          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 3: CSS 架构决策 — DOM最小化/CSS特性/DRY           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 4: 生成样式代码 → Step 5: 全状态覆盖               │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 6: 自审清单 — 不通过不交付                         │
└─────────────────────────────────────────────────────────┘
```

> 🔒 每步按序执行。跳过必须声明：`⏭️ [跳过] Step N — 理由 | 风险`

---

## 中断与恢复机制

若执行过程被中断，重新继续时必须：

1. **扫描已有输出** — 检查已完成的 Step
2. **播报恢复点**：
   ```
   ⏯️ [恢复] 上次进度：X/6 步完成
   已完成：✅ Step 0 — 规则注入
           ✅ Step 1 — 环境检测 | ✅ Step 2 — Token 加载
           ✅ Step 3 — 架构决策 | ✅ Step 4 — 编码
           ✅ Step 5 — 状态覆盖 | ✅ Step 6 — 自审
   待完成：⬜ Step N — {待完成步骤}
   断点：从 Step N 继续
   ```
3. **从断点继续** — 不重复不遗漏
4. **重启确认** — 播报后主动询问

---

## 🔒 Step 0 — 规则注入（强制 · 最高优先级 · 不可跳过）

```
【🔒 不可变约束】
  Step 0 必须在任何样式编写操作之前完成。
  未执行规则注入就开始写 CSS = 严重违规，必须立即停止并回退。
  无任何豁免理由。
```

本 Skill 的 RULE.mdc 为 `alwaysApply: true`（全局规则），需走 **specflow-rules-engine** 同步到 System Prompt：

```typescript
use_skill('specflow-rules-engine') // 同步 RULE.mdc → .codebuddy/rules/ + 检测注入 + read_file 兜底
```

> **完成播报（必须逐字输出）：**
>
> ```
> ✅ [Step 0] 规则注入完成
>   ▸ 注入方式：specflow-rules-engine（alwaysApply: true）
>   ▸ 铁律 1-8 已就绪
> ```

---

## Step 1 — 项目环境检测 [低自由度 · 强制]

### 1.1 检测内容

| 优先级 | 检测项 | 方式 |
|--------|--------|------|
| P0 | stylelint 类名规则 | `search_file('.stylelintrc*')` |
| P1 | 依赖与框架 | `read_file('package.json')` |
| P2 | CSS Module 范围 | `search_content('.module.scss')` |
| P3 | 项目既有命名惯例 | `grep_search('^\.[a-zA-Z]', '*.scss')` |
| P4 | 已有的 CSS 变量 | `grep_search('--color-', '*.{css,scss}')` |

### 1.2 检测清单

```
□ stylelint selector-class-pattern → camelCase/kebab/snake/Pascal
□ 排除检测：Tailwind / styled-components / emotion → 停止并告知
□ CSS Module 判定 | □ 类名规范(三级fallback) | □ CSS 变量前缀
```

> **验证检查点：**
> ```
> □ stylelint 配置已读取 | □ 框架已确认
> □ CSS Module / 非 Module 已判定 | □ 类名规范已确定
> ```
>
> 完成播报：`"✅ Step 1 环境检测完成：{类名规范}/{CSS Module状态}"`

---

## Step 2 — 加载设计 Token [低自由度 · 强制]

```typescript
grep_search('--color-', '*.{css,scss}') // 项目颜色变量
grep_search('--space-', '*.{css,scss}') // 项目间距变量
// 无项目变量 → read_file('.codebuddy/skills/admin-ui-design/knowledge/tokens.css')
```

> 完成播报：`"✅ Step 2 Token加载完成：{项目变量N个 / fallback}"`

---

## Step 3 — CSS 架构决策 [中自由度 · 强制]

按需加载 `references/style-rules.md` 第4章，输出决策摘要：

```
📐 DOM 元素: N 个 | CSS 特性: flex+gap/伪元素/inherit
   公共基类: X 个 | 预估行数: ~Z 行
```

> **验证检查点：**
> ```
> □ DOM 最小化已考虑（伪元素替代装饰 DOM）
> □ CSS 特性优先级已决策 | □ DRY 检查已完成
> ```

> 完成播报：`"✅ Step 3 架构决策完成：{N}个DOM / {X}个基类"`

---

## Step 4 — 生成样式代码 [中自由度]

- 类名规范由 Step 1 检测结果决定
- 按需加载 `references/style-rules.md` 第4章模板

---

## Step 5 — 全状态覆盖 [低自由度]

```
交互元素：Default + Hover + Focus/Active + Disabled
数据区：  Loading(Skeleton) + Empty(插画+CTA) + Error(错误引导)
动效：    Hover 120ms / Focus 150ms / 展开 200ms
```

---

## Step 6 — 自审清单 [低自由度 · 强制]

```
【结构】□ 零嵌套 □ 装饰用伪元素 □ 分隔用border □ 可继承不重复
【Token】□ var(--xxx, fallback) 零硬编码 □ 使用项目自身变量
【尺寸】□ 按钮40px □ 表格48px □ 标题≤18px □ 卡片三件套
【表格】□ 文字left 数字right 状态center 操作right
【状态】□ hover/focus/disabled全覆盖 □ Skeleton非spinner
【反模式】□ 无!important □ z-index≤1000 □ min-h-dvh □ @use
```

> **验证检查点：**
> ```
> □ 6 项自审全部通过 | □ 无嵌套选择器 | □ 无硬编码颜色
> □ 无 !important | □ 状态全覆盖 | □ 表格对齐正确
> ```

> 完成播报：`"✅ Step 6 自审完成：全部清单通过"`

---

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| Tailwind CSS 项目 | 停止，告知直接写 `className="..."` |
| styled-components / emotion | 停止，告知使用 CSS-in-JS 语法 |
| 纯 vanilla HTML/CSS | Step 1 fallback，不确定则询问 |
| 项目变量命名不符合约定 | 使用项目命名，不强行转换 |

## 参考资料

| 文件 | 内容 | 加载时机 |
|------|------|----------|
| `references/style-rules.md` | 铁律/Token表/CSS特性/DRY模板/尺寸/状态矩阵/反模式 | Step 2后按需 |
| `tokens.css` (admin-ui-design) | 默认CSS变量 fallback | Step 2 无项目变量时 |
