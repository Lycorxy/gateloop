---
name: figma-ui-spect
description: >-
  Figma DSL → 代码自动匹配 + 逐层对比 + 渲染验证。模型读 DSL 理解设计稿，读 TSX+SCSS 理解代码，
  自行按文本/结构/尺寸/className 多维度匹配对应节点，从布局→交互→间距→尺寸→颜色→边框逐层对比修复，
  改完构建验证 HTML 经 MCP 量化相似度 ≥95%。当用户说 figma还原、figma还原优化、还原度不够、
  继续优化还原、逐层对比、渲染验证、设计稿对齐、修复还原、相似度、量化还原、技巧诊断 时使用。
  不要用于纯 figma 转 DSL、非 Figma 图片对比、纯代码审查、全新页面设计、修 bug、从零生成新组件。
version: 22.0.0
dependencies: []
allowed-tools: [mcp_call_tool, read_file, replace_in_file, write_to_file, search_content, search_file, execute_command, web_fetch]
max-token: 8000
---

# Figma UI 精确还原 — 自动匹配 + 逐层对比 + 渲染验证

## 概述

把已有 TSX+SCSS 代码与 Figma 设计稿 DSL 逐层对比修复，达到 ≥95% 渲染相似度。核心是「先建映射后修复」：枚举 ALL JSX 元素 → 双向映射 → 逐属性差异表 → 容器布局策略 + CSS 技巧诊断 → 修复 → MCP 量化验证。

## 何时使用 / 何时不使用

**触发**：用户要求对齐现有代码与 Figma 设计稿、还原度不够要修复、逐层对比、渲染验证、量化还原。

**反触发**：纯 figma 转 DSL（用 figma_to_dsl 工具）、非 Figma 图片对比（用 compare_images）、纯代码审查、全新页面设计（用 web-ui-design）、修 bug、从零生成新组件（用 frontend-codegen）。

## 🛑 入口守卫

```
本 Skill 被 GateLoop harness 驱动（anchor.config.json），按 mapping→fix→verify 三 anchor 顺序执行。
每个 anchor 的 verify 门禁（exit code）守门，模型"说做完了"无效，必须产出 schema 校验通过的产物。
规则注入方式：GateLoop harness 模式（reads 内联 RULE.mdc），RULE.mdc 同时 alwaysApply 兜底独立运行。

禁止行为：
  ✗ 不建映射（mapping-report）就直接改代码
  ✗ 反向映射省略 ⚠️ 行
  ✗ Stage 3 只做 re-read 静态验证就输出"完成"
  ✗ 未达 ≥95% 就输出"达标"
  ✗ 使用缓存 DSL（每次必须重新获取）
  ✗ 改业务代码/事件逻辑（只改样式+DOM 结构）
```

## 核心工作流

### Step 1（anchor: mapping）：建立映射

#### Step 1.1：获取 DSL + 盒模型数据

🔒 数据契约：`figma-dsl-data`（criticality: required）  详见 skill.config.yaml → step-contracts

##### 契约获取子流程
按 providers 链获取 `{origin_dsl, spacing_report, baseline_diff}`：
1. MCP figma-trimly:`figma_baseline_compare`（优先，存在时必调用，禁止缓存）
2. fallback: `ask-user`（用户手动提供 DSL 文件路径）
播报：✅ [Step 1.1·契约] figma-dsl-data 已就绪（来源：{MCP/用户}）
全部失败且 on-missing=ask → ⛔ 阻断，询问用户 DSL 来源

##### 核心逻辑（消费契约数据，零 MCP 工具名）
1. `read_file` origin-dsl.json（完整读，不 limit）
2. `read_file` spacing-report.json（完整读）
3. 提取设计稿结构/样式/标注/盒模型间距

**播报完成：** `✅ [Step 1.1] DSL + 盒模型数据获取完成`

#### Step 1.2：代码元素枚举

[中] 执行：
1. `search_file` 找到目标组件 TSX 文件（用户指定或按路由/页面名搜索）
2. `read_file` 完整读 TSX（不读片段，不跳行）
3. `search_file` 找对应 SCSS/CSS Module 文件
4. `read_file` 完整读 SCSS（不读片段）
5. 列出 ALL JSX 元素（含容器/antd 组件/自定义组件/内联 style/tagRender 自定义渲染）
6. 冗余元素过滤：堆叠 Switch / 重复 indicator / placeholder → 标记 `[EXTRA-REMOVE]`

🔴 禁止：只列"看起来有问题"的元素；跳过 antd 组件；跳过 tagRender/optionRender

#### Step 1.3：自动匹配 + 双向映射

[高] 模型按 5 级优先级自行匹配 DSL 节点 ↔ 代码元素（命中即用，无需用户指定）：
1. **文本内容匹配**：DSL node.text → `search_content` TSX 找同名文本
2. **结构位置匹配**：DSL 路径（root>sidebar>header>title）↔ 代码 DOM 层级
3. **尺寸匹配**：DSL width/height ↔ SCSS width/height 一致
4. **className 语义匹配**：DSL node.name ↔ className（sidebar/Sidebar/channelList）
5. **组件类型匹配**：DSL annotation.component_desc ↔ `<Tree>`/antd 组件

产出双向映射表：
- **正向**（DSL→代码）：含匹配策略 + 置信度（<0.8 标 `[UNCERTAIN]`）
- **反向**（代码→DSL，🔴 不可省略）：`✅已映射` / `⚠️查Figma` / `[EXTRA-KEEP]` / `[EXTRA-REMOVE]`

🔴 ⚠️ 行必须处理（查其他 frame/按 antd 默认+token 推断/询问用户），不许跳过

#### Step 1.4：属性差异表

[中] 对双向映射表每一行逐属性对比（含 antd 默认值），产出差异表：
- `❌` 行：代码值 ≠ DSL 值（待修复）
- `⚠️` 行：DSL 当前 frame 无对应（待查 Figma）
- DSL→CSS 精确映射规则见 RULE.mdc 第 4 节 + `references/dsl-format-guide.md`

#### Step 1.5：容器布局策略推断

[中] 对每个容器节点，从 DSL 高度求和 + 兄弟位置反推布局策略：
- 容器高度 = 子节点之和 + 无 fill/hug → `flex:none`（内容决定高度）
- 容器 size_preset="fill" + 父容器固定高度 → `flex:1`/`width:100%`
- 兄弟紧随其后（16px gap）→ 不应 flex 撑满

🔴 推断表每个 ❌ 行进入属性差异表，Stage 2 修复
🔴 禁止：不做策略推断就改像素（像素对了布局全错）

#### Step 1.6：CSS 技巧诊断

[中] 对每个容器按决策树（`references/css-technique-library.md`）选最优技巧并核对代码：
1. T3 撑满宽度 → width:auto  2. T4 居中 → flex-center  3. T2 间距规律 → flex+gap
4. T1 流式排列 → flex+gap  5. T6 等宽等分 → flex:1  6. T5 贴边/贴底 → margin-auto
7. T8 树形缩进 → padding-left  8. T7 行内对齐 → align-items:center
9. **T25 内联标签 🔴** → `float:left` + 文字流（text-align:justify）
10. 都不满足 → 保留现状

🔴 T25 高频踩坑（精选/HOT/NEW 徽章+正文）：禁止用 `flex-row` 两列把 tag 和文字分开
🔴 诊断表每个 ❌ 行进入属性差异表；禁止不诊断技巧就改属性

**mapping anchor 产出：** `.specflow/context/mapping-report.json`（含 6 张表：elementEnumeration / forwardMapping / reverseMapping / attributeDiff / containerStrategy / cssTechniqueDiagnosis）

**播报完成：** `✅ [Step 1·mapping] 映射建立完成，6 张表已产出`

---

### Step 2（anchor: fix）：执行修复

消费 `mapping-report.json`，按差异表逐行修复。

[低] 执行（顺序至关重要）：
1. **属性差异表 ❌ 行**：每个 ❌ = 一次 `replace_in_file`（改 SCSS 属性值，保留选择器和其他属性）
   - 新增缺失属性（DSL 有代码无）；删除多余属性（DSL 明确 none/0/transparent）
   - 合并同选择器的多个属性为一次修复
2. **容器策略 ❌ 行**：修复 flex:none/flex:1（可能涉及 DOM 结构调整）
3. **技巧诊断 ❌ 行**：修复布局技巧（如 flex-row → float:left，需 DOM 调整非仅改 CSS 值）
4. **⚠️ 行处理**：每个必须处理（查 Figma 其他 frame / 标记 `[EXTRA-KEEP]` / 询问用户），不许跳过
5. **[EXTRA-REMOVE] 元素**：删除冗余 DOM（堆叠 Switch/重复 indicator/placeholder）
6. **表单控件专项**：按 RULE.mdc 第 3 节全属性检查（Input/Select/Cascader/TextArea/Button/Modal/Form.Item/ImageUploader）
7. **SVG 图标**：`web_fetch` SVG URL → 提取 path → 创建 `icons/{name}.tsx`（currentColor/size prop）→ import 使用。禁止 `<img src="figma-url">`，禁止猜旋转方向
8. **antd 覆盖**：DSL值 ≠ antd默认 → `:global { .ant-xxx { prop: val !important } }`，每个 !important 必须有 DSL 支撑，覆盖所有相关子元素

每个修复前注释：`// 修复 #N: .selector { prop: old → new }（DSL: node.style.xxx）`
技巧修复注释：`// 技巧修复 #N: .container flex-row → float:left（T25）`

**播报完成：** `✅ [Step 2·fix] 修复完成，N 文件 / M 属性 / K 个 ⚠️ 已处理 / L 个 EXTRA-REMOVE 已过滤`

---

### Step 3（anchor: verify）：渲染验证

#### Step 3.1-3.6：静态验证

[低] 执行：
1. `read_file` 所有修改过的文件
2. 确认属性差异表每个 ❌ 行的 DSL 值已写入代码
3. 确认反向映射表每个 ⚠️ 行已处理（修复或标记 `[EXTRA-KEEP]`）
4. 确认容器策略推断表 + 技巧诊断表每个 ❌ 行已修复
5. 自检：从 DSL 重建视觉结构，验证兄弟节点相对位置（间距/底部 padding/紧随控件 margin-top）

#### Step 3.7：渲染验证闭环

🔒 数据契约：`render-compare`（criticality: preferred）  详见 skill.config.yaml → step-contracts

##### 契约获取子流程
按 providers 链获取 `{similarity, render_png, diff_png}`：
1. MCP figma-trimly:`figma_compare_html_file`（优先，构建 verify-{N}.html → 量化 similarity%）
2. 内置：`figma_baseline_compare` diff 面积计算 + 差异表闭合率（模式 B 降级）
3. fallback: `static-closure`（模式 C，差异表 100% 闭合）
播报：✅ [Step 3.7·契约] render-compare 已就绪（来源：{MCP/内置/静态}，模式 {A/B/C}）
全部降级 → 模式 C 静态闭合验证

##### 核心逻辑（消费契约数据）
验证模式选择（详见 `references/render-verification.md`）：
- **模式 A**（量化·推荐）：组件 DOM 可推导 → 构建 verify-{N}.html → MCP 量化 similarity%
- **模式 B**（半量化·兜底）：复杂 antd 内部 DOM → diff 面积 + 差异表闭合率
- **模式 C**（纯静态）：两者不可 → 差异表 ❌ 行 100% 闭合 + ⚠️ 行 100% 处理

#### Step 3.8：量化验收判定

[低] 按模式判定达标：
- 模式 A：similarity ≥ 95% → ✅ 达标；90%≤x<95% → 分析 Top 3 差异迭代；<90% → 排查布局/尺寸
- 模式 B：diff 面积 <5% + 差异表 100% 闭合 → ✅ 达标
- 模式 C：差异表 100% 闭合 → ✅ 达标

#### Step 3.9：无效迭代检测

[低] 防空耗：
- 同区域连续 2 次修改 similarity 变化 <0.5% → 停止该区域（常见：字体度量差异/1-2px 噪声）
- 最大迭代 5 轮，仍未达标 → 终止，提示用户手动检查
- 每次修改后必须验证（`figma_compare_html_file`），不许改完不验证就继续

**verify anchor 产出：** `.specflow/context/render-report.json`（含 mode / result / passed / iterationLog）

**播报完成：** `✅ [Step 3·verify] 验证完成，模式 {A/B/C} | similarity {N}% | {达标/未达标}`

## 中断与恢复机制

若执行被中断，重新继续时必须：

1. 检查 `.specflow/anchor-state.json` 确认当前 anchor 进度
2. 检查已产出 artifact：`mapping-report.json`（mapping 产物）、`render-report.json`（verify 产物）
3. 播报恢复点：
   ```
   ⏯️ [恢复] 上次进度：{anchor} anchor
   已完成：✅ mapping（mapping-report.json 存在）
   待完成：⬜ fix → verify
   断点：从 fix anchor 继续
   ```
4. 若 mapping-report.json 存在且 schema 校验通过 → 从 fix 继续，不重做 mapping
5. 若 mapping-report.json 缺失或不全 → 重做 mapping（重新获取 DSL，禁止用缓存）
6. fix 中断 → `read_file` 修改过的文件确认已应用的修复，从下一行差异表继续
7. verify 中断 → 从 3.7 渲染验证继续，已构建的 verify-{N}.html 可复用

## 输出格式

```
Step 1（mapping）输出：
  📍 目标文件：[TSX + SCSS 文件列表]
  📋 代码元素枚举表：[ALL JSX 元素，冗余元素标 EXTRA-REMOVE]
  🔗 双向映射表：A.正向(DSL→代码) B.反向(代码→DSL，含 ⚠️ 行)
  📐 属性差异表：[含 ❌ 和 ⚠️ 行]
  🏗️ 容器布局策略推断表：[flex:none/flex:1]
  🎯 CSS 技巧诊断表：[T1-T8/T25 对比]

Step 2（fix）输出：
  每个 replace_in_file 前注释：// 修复 #N: .selector { prop: old → new }（DSL: xxx）
  技巧修复注释：// 技巧修复 #N: .container flex-row → float:left（T25）
  ⚠️ 行处理注释：// 处理 ⚠️ #M: 查 Figma frame XXX / 标记 [EXTRA-KEEP] / 询问用户
  冗余过滤注释：// 冗余过滤 #M: 删除重复 Switch

Step 3（verify）输出：
  📊 渲染验证：模式 {A/B/C} | similarity {N}% | diff 面积 {N}% | 闭合率 {N}%
  ✅ 修复完成：改 N 文件 / M 属性 / K 个 ⚠️ 已处理 / L 个 EXTRA-REMOVE 已过滤 / 0 遗漏
  📈 迭代记录：{N} 轮 | 是否无效迭代终止 | 剩余差异说明
```

## 错误处理

| 错误场景 | 恢复操作 |
|---|---|
| MCP figma-trimly 不可用（Step 1.1） | on-missing=ask → 询问用户 DSL 文件路径，手动 `read_file` |
| MCP figma_compare_html_file 不可用（Step 3.7） | on-missing=degrade → 降级模式 B（diff 面积 + 闭合率）或模式 C（纯静态） |
| DSL 文件缺失/格式错误 | ⛔ 阻断 mapping，要求用户重新提供 Figma URL |
| SCSS 文件找不到 | `search_file` 扩大范围搜 *.scss/*.module.scss/*.css；仍无 → 询问用户 |
| ⚠️ 行 DSL 无对应且查不到其他 frame | 按 antd 默认值 + 项目 token 推断，或询问用户该控件设计稿位置 |
| similarity 迭代 5 轮仍未达标 | 终止，输出剩余差异说明，提示用户手动检查（字体度量差异等代码层无法修复） |
| 修复后 stylelint 报错 | `read_file` 报错行，修正语法错误后重新 stylelint |
| style-crosscheck 发现悬空类名 | 补充 TSX 引用或删除 SCSS 类，不允许残留无用类名 |

## 验证清单

mapping anchor 交付前：
- [ ] `mapping-report.json` 产出且 schema 校验通过（6 张表齐全）
- [ ] 代码元素枚举含 ALL JSX 元素（含 antd/自定义/内联 style/tagRender）
- [ ] 反向映射表非空，含 ⚠️ 行（不可省略）
- [ ] 属性差异表含 ❌ 和 ⚠️ 行
- [ ] 容器布局策略推断表每个 ❌ 行已标记待修
- [ ] CSS 技巧诊断表每个 ❌ 行已标记待修，T25 场景未用 flex-row
- [ ] DSL 每次重新获取，未使用缓存

fix anchor 交付前：
- [ ] 属性差异表每个 ❌ 行已 `replace_in_file` 修复
- [ ] 每个 ⚠️ 行已处理（查 Figma/标记 EXTRA-KEEP/询问用户）
- [ ] 容器策略 + 技巧诊断 ❌ 行已修复
- [ ] [EXTRA-REMOVE] 冗余元素已删除
- [ ] 表单控件全属性检查完成（Input/Select/Cascader/TextArea/Button/Modal/Form.Item）
- [ ] SVG 图标已组件化（非 `<img src="figma-url">`）
- [ ] antd 覆盖每个 !important 有 DSL 支撑
- [ ] stylelint 通过 + style-crosscheck 无悬空类名

verify anchor 交付前：
- [ ] `render-report.json` 产出且 schema 校验通过
- [ ] re-read 确认每个 ❌ DSL 值已写入代码
- [ ] 渲染验证已尝试模式 A/B（非仅静态 re-read）
- [ ] 量化达标（模式 A ≥95% / 模式 B diff<5%+闭合 / 模式 C 闭合）
- [ ] 无效迭代已检测（连续 2 次 <0.5% 停止，最大 5 轮）
- [ ] 未达标不输出"完成"

## 参考资料

| 文件 | 内容 | 加载时机 |
| --- | --- | --- |
| `references/analysis-methodology.md` | 从外到内 7 层对比方法论（L1整体→L7资源） | mapping |
| `references/dsl-vs-code-dom-comparison.md` | DSL vs Code-DOM 逐层对比（3 列数据） | mapping |
| `references/optimization-strategy.md` | 7 层对比推理 + 标注驱动语义映射 + 交互状态 CSS | mapping/fix |
| `references/dsl-format-guide.md` | figma DSL 字段说明 + DSL→CSS 映射 + 兼容性清单 | mapping |
| `references/spacing-calculation-spec.md` | 盒模型间距计算规范（spacing-report 算法） | mapping |
| `references/css-technique-library.md` | CSS 布局技巧决策树（T1-T8/T25）+ 诊断流程 | mapping/fix |
| `references/render-verification.md` | 渲染验证闭环 + 量化验收 + 无效迭代 + antd DOM 速查 | verify |
| `references/floor-ceiling-guide.md` | 脚本 vs 模型 5 类分工判定表（A收敛/B完备/D主观/E审美） | 配置 verify |
| `examples/trigger-examples.md` | 触发/反触发示例 | 仅供测试 |
