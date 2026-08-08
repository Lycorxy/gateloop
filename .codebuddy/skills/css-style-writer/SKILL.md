---
name: css-style-writer
description: >
    最优CSS样式设计。当用户要求写样式、生成CSS、创建SCSS文件、
    添加组件样式、写style代码、生成module.scss时使用。
    核心目标：以最少的DOM结构和最少的CSS代码实现最佳视觉效果，
    充分挖掘CSS原生能力（继承/伪元素/gap/flex隐式属性等）。
    严格遵循扁平结构（禁止嵌套class），使用CSS变量Token系统，
    自动检测构建配置确定CSS Module范围和类名规范。
    由 ADS harness 驱动，规则由引擎 reads + rulesInline 内联。
    v7.0 新增：ADS harness 模式 + 已有样式扫描 + TSX-SCSS 交叉验证 + antd 覆盖标准化。
    不要用于：设计页面布局（→ admin-ui-design）、写组件逻辑、工程化配置、
    Tailwind CSS（→ 直接写 className）、styled-components 等 CSS-in-JS 方案。
version: 7.0.0
dependencies: []
conflict-with: [admin-ui-design]
allowed-tools: [read_file, write_file, replace_in_file, search_content, search_file, execute_command]
max-token: 2000
---

# CSS Style Writer v7.0 — 最优样式设计（ADS Harness 驱动）

> v7.0 核心变更：由 ADS harness 驱动，不再依赖 specflow-rules-engine。
> 规则由 ADS reads + rulesInline 内联，门禁由 ADS verify exit code 强制。
> 铁律 1-11 领域知识完全保留，只是注入方式从 use_skill 改为引擎内联。

## ADS Harness 驱动模式

```
传统模式（v6 及之前）                 ADS Harness 模式（v7）
──────────────────────                ──────────────────────────
Step 0 use_skill(specflow)    →      ADS reads → rulesInline 内联 RULE.mdc
门禁协议（模型自觉 PASS/FAIL）→       ADS code anchor verify exit code 判定
状态在模型脑子里               →      anchor-state.json 引擎唯一写入
中断手动扫描                   →      nut ads status 随时恢复
npx nut-lint                  →      npx nut lint（命令统一）
```

### 被 frontend-codegen ADS harness 调用时的对应关系

```
frontend-codegen anchor "code"
  ├─ reads: css-style-writer/RULE.mdc → rulesInline 内联铁律 1-11
  ├─ 执行: 本 skill Step 1→1.5→2→3→4→5→6→6.5 完整流程
  └─ verify: tsc + lint + build + producesFresh（exit 0 才推进；stylelint 按需触发，仅项目有配置时跑）
```

### 模型只做三件事

1. **读指令** — rulesInline（已内联 RULE.mdc 铁律 1-11）
2. **执行样式流程** — Step 1→1.5→2→3→4→5→6→6.5
3. **推进** — 完成后由 frontend-codegen 的 code anchor 调 `nut ads next`

⚠️ **不要自己声称"stylelint 通过"**，引擎会重跑 tsc + lint + build（stylelint 按需触发，仅项目有配置时跑），exit code 说了算。

---

## 🛑 入口守卫（不可绕过·禁止跳过）

```
本 Skill 加载后必须按 Step 1→1.5→2→3→4→5→6→6.5 顺序执行全部步骤。
规则已由 ADS rulesInline 内联，无需 Step 0 规则注入。

禁止行为（不允许跳过）：
  ✗ 跳过 Step 1 环境检测
  ✗ 跳过 Step 1.5 已有样式扫描（会导致重复代码/覆盖已有样式）
  ✗ 跳过 Step 6 自审 + stylelint 验证
  ✗ 跳过 Step 6.5 交叉验证（ADS code anchor 下强制）
  ✗ 自审不通过就交付（必须修复到通过）
  ✗ 行数超限不拆分（SCSS ≤ 300 行）
  ✗ 偷懒放宽规范（扁平结构/变量/尺寸是硬性约束）
  ✗ 不扫描已有样式就写新 SCSS（可能重复/覆盖）
```

**核心定位：用最少的代码实现最好的效果，像 CSS 大师榨干每一个原生能力。严格按规范，不偷懒。**

---

## 何时使用 / 何时不使用

**应该触发：** 写样式、生成CSS、创建SCSS文件、添加组件样式、写style代码、生成module.scss

**不应触发：** 设计页面布局(→admin-ui-design)、写组件逻辑、工程化配置、Tailwind CSS(→直接写className)、styled-components/emotion

---

## 步骤流程总览（v7.0 · ADS Harness 版）

```
   Step 1:    项目环境检测（强制）— 类名规范/CSS Module/变量前缀
   Step 1.5:  已有样式扫描（强制·v6.0新增）— 扫描已有SCSS/防重复/防覆盖
   Step 2:    加载设计 Token（强制）— 项目变量优先/fallback
   Step 3:    CSS 架构决策（强制）— DOM最小化/CSS特性/DRY/antd覆盖
   Step 4:    生成样式代码
   Step 5:    全状态覆盖
   Step 6:    自审 + stylelint 验证（强制·不通过不交付）
   Step 6.5:  TSX-SCSS 交叉验证（ADS code anchor 强制）
```

> 每步按序执行，禁止跳过。不通过不交付。ADS code anchor 下 Step 6.5 也必须通过。

---

## 中断与恢复（ADS 引擎驱动）

若执行过程被中断，重新继续时：

1. **查看引擎状态** — `nut ads status <manifest>` 返回当前 anchor + attempt
2. **从断点继续** — 引擎记录了当前进度，无需手动扫描
3. **重做当前阶段** — `nut ads retry <manifest>` 刷新 attemptStartedAt

```
断线恢复：
  nut ads status <manifest>
  → 当前 anchor: code | attempt: 0/8 | nextAction: 继续样式...

  从断点继续执行 Step 1→1.5→2→3→4→5→6→6.5
  完成后由 frontend-codegen 调 nut ads next
```

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

## Step 1.5 — 已有样式扫描（强制 · 不可跳过）

```
🔴 写新 SCSS 之前，必须扫描目标目录及关联目录中已有的样式文件。
   不扫描就写 = 可能重复代码/覆盖已有样式 = 违规。
```

### 1.5.1 扫描范围

```typescript
search_file('*.module.scss', target_directory)
search_file('*.module.scss', parent_directory)
search_file('*.scss', target_directory + '/styles')
search_file('global*.scss', src_root)
// 对每个找到的 SCSS 文件，read_file 分析其内容
```

### 1.5.2 分析清单

```
□ 已有 SCSS 文件清单（文件名 + 行数 + 包含的类名）
□ 已有的 CSS 变量定义（避免重复定义）
□ 已有的公共基类（.btnBase/.cardWrap 等，可复用的）
□ 已有的 antd 覆盖样式（:global { .ant-xxx }，避免冲突）
□ 已有文件的命名规范（确认本次新增文件命名一致）
```

### 1.5.3 复用决策

```
🔴 已有样式能满足需求 → 禁止重写（直接复用/composes/扩展）
🔴 已有公共基类 → 禁止在新文件中复制粘贴（用 composes 或引用）
🔴 已有 antd 覆盖 → 检查是否冲突，冲突则合并到已有文件
```

> **播报：** `✅ Step 1.5 已有样式扫描完成：{N}个已有SCSS / {M}个可复用基类 / {P}个antd覆盖`

---

## Step 2 — 加载设计 Token（强制 · 不可跳过）

```typescript
search_content('--color-', '*.{css,scss}')
search_content('--space-', '*.{css,scss}')
search_content('--radius-', '*.{css,scss}')
search_content('--shadow-', '*.{css,scss}')
search_content('--font-', '*.{css,scss}')
// 无项目变量 → 使用 references/style-rules.md 中的默认 Token 表
// ★ 优先使用项目自身变量名，禁止强推默认 Token 名
```

> **播报：** `✅ Step 2 Token加载完成：{颜色N个/间距N个/圆角N个/阴影N个 / 项目变量/fallback}`

---

## Step 3 — CSS 架构决策（强制 · 不可跳过）

按需加载 `references/style-rules.md` 第4章，按决策树逐项输出：

### 3.1 DOM 最小化决策

```
需要装饰线/分隔？   → border-bottom / ::after（不加 DOM）
需要装饰图标？      → background-image / ::before（不加 DOM）
需要角标/标记？     → ::after + content（不加 DOM）
需要序号/计数？     → counter-increment + content（不加 DOM）
需要斑马纹？        → :nth-child(even)（不加 DOM）
需要空状态样式？    → :empty 伪类（不加 DOM）
确实需要新 DOM 元素 → 记录必要性理由
```

### 3.2 CSS 特性利用决策

```
子元素同色/同字体？  → 父元素声明继承（不每个重复写）
图标随文字变色？     → currentColor（不单独指定）
子元素等间距？       → 父元素 gap（不每个写 margin）
多组件公共属性？     → 提取基类 + composes（DRY）
响应式字体？         → clamp()（不写多断点）
```

### 3.3 antd 组件覆盖决策

```
🔴 当目标组件使用了 antd 组件时，必须检查 antd 默认样式是否需要覆盖。

覆盖方式（.module.scss 中）：
  :global {
    .ant-input { border: 1px solid var(--color-neutral-04); border-radius: var(--radius-sm, 2px); }
    .ant-select-selector { height: 40px; }
  }

🔴 禁止：在全局 SCSS 中覆盖 antd 样式（只在组件的 .module.scss 中覆盖）
🔴 禁止：覆盖时漏掉 hover/focus/disabled 状态
🔴 已有 antd 覆盖样式（Step 1.5 扫描到的）→ 合并而非重复
```

### 3.4 架构摘要输出

```
📐 DOM 元素: N 个（其中 M 个用伪元素替代）
   CSS 特性: flex+gap / 伪元素 / inherit / currentColor / clamp()
   公共基类: X 个（从已有SCSS复用 Y 个）
   antd 覆盖: Z 个组件需要覆盖
   预估行数: ~W 行（≤ 300）
```

> **播报：** `✅ Step 3 架构决策完成：{N}个DOM / {X}个基类 / antd覆盖{Z}个`

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

### 6.1 自审清单（拆客观/主观，客观项脚本化）

**客观项（已脚本化，不进模型自审）**：
```
□ 零嵌套（无任何嵌套选择器）           → stylelint 已覆盖
□ var(--xxx, fallback) 零硬编码       → custom 正则扫 #[0-9a-f]{3,6}（可由 style-crosscheck 扩展）
□ SCSS ≤ 300 行                       → fileSize 已覆盖
□ antd 覆盖在 :global 中              → custom 正则扫
□ TSX-SCSS 类名一致                   → style-crosscheck.ts（ADS code anchor 强制）
```

**主观项（部分已纳入 code anchor review 结构化评审，部分保留自评）**：
```
【已纳入 review.model · 四道门禁强制】（写入 code-review.json）：
□ style-dom-minimal — DOM 最小化（伪元素/inherit/gap 充分，无多余装饰 DOM）
□ style-token-usage — CSS 变量与继承（项目变量不硬编码，可继承不重复）
□ style-state-coverage — 全状态覆盖（hover/focus/disabled + loading/empty/error）

【可脚本化 · 建议未来加 custom 正则】：
□ 无 !important / z-index ≤ 1000      → 正则扫 !important / z-index:\s*\d{4,}
□ antd 覆盖全状态                     → 正则扫 :global .ant-xxx 含 hover/focus/disabled

【保留模型自评 · 不阻断 verify】：
□ 按钮 40px / 表格 48px / 标题 ≤ 18px
□ 文字 left / 数字 right + tabular-nums
□ Step 1.5 扫描到的已有基类已复用
□ 无复制粘贴的重复样式块（DRY）
```

### 6.2 stylelint 验证（强制 · 不允许跳过）

```bash
npx nut lint run <scss_file>
# 或 npx nut lint fix <scss_file> --write 自动修复
```

```
□ stylelint: 0 错误（客观项已脚本化，PASS = 收敛型通过）
□ 主观自审项模型自行评估，不阻断 verify（仅作内部检查）
有错误 → npx nut lint fix --write 自动修复 → 再验证 → 循环到 0 错误
不通过 → 必须修复到通过，不允许留给用户手动
```

> ⚠️ ADS code anchor 的 verify 会**强制重跑** tsc + lint + build + style-crosscheck + subtask-derivation（stylelint 按需触发，仅项目有配置时跑），不要自己声称"通过"。

> **播报：** `✅ Step 6 自审+验证完成：客观项 stylelint 0 错误 / 主观项已自评` — 客观项不通过不交付。

---

## Step 6.5 — TSX-SCSS 交叉验证（ADS code anchor 强制·脚本判定·不再依赖模型自评）

```
🔴 被 frontend-codegen ADS code anchor 调用时，Step 6 通过后必须执行 Step 6.5。

v7.0+ 变更：交叉验证已由脚本 `style-crosscheck.ts` 接管，不再依赖模型自评（自评容易放水）。
脚本自动执行：
  1. SCSS 中定义的每个类名，在对应 TSX 中都有 styles.xxx 引用
  2. TSX 中引用的每个 styles.xxx，在 SCSS 中都有定义
  3. antd 覆盖的 .ant-xxx 与 TSX 中实际使用的 antd 组件匹配（粗校验）

调用方式（由 frontend-codegen code anchor verify custom 字段执行）：
  npx nut ads metric style-crosscheck --dir src/

退出码（收敛型门禁）：
  exit 0 = 全部一致（PASS）
  exit 1 = 有不一致（FAIL，附具体清单）

模型只需看到 verifyResult.checks 中的事实，自主修复不一致项后重新 next。
```

> **播报（PASS）：** `✅ Step 6.5 交叉验证完成：SCSS-TSX 对应关系正确（脚本判定）`
> **播报（FAIL）：** `❌ Step 6.5 交叉验证失败：{具体不一致项}（脚本判定），正在修复...`

---

## 错误处理

| 场景 | 处理 |
|------|------|
| Tailwind CSS 项目 | 停止，告知直接写 `className="..."` |
| styled-components / emotion | 停止，告知使用 CSS-in-JS 语法 |
| 纯 vanilla HTML/CSS | Step 1 fallback，不确定则询问 |
| SCSS 超 300 行 | 必须拆分，不偷懒超限交付 |
| stylelint 有错误 | npx nut lint fix --write 自动修复到 0 错误 |
| 已有样式文件存在 | 扫描→复用/扩展，不重复写 |
| antd 覆盖冲突 | 合并到已有覆盖文件，不重复覆盖 |
| 交叉验证 FAIL | 修复不一致项后重新验证 |

---

## 参考资料

| 文件 | 内容 | 加载方式 |
|------|------|---------|
| `RULE.mdc` | 铁律 1-11 + 反模式速查 | ADS reads → rulesInline 内联 |
| `references/style-rules.md` | 铁律/Token表/CSS特性/DRY模板/尺寸/状态矩阵/反模式 | Step 2 后按需 read_file |
