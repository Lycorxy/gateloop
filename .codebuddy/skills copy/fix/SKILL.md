---
name: fix
description: >
  问题定位+根因+修复。Phase 0 上下文→Phase 1 影响分析→Phase 2 根因
  →🎨 Phase 2.5 设计评审(条件)→🔒 Phase 3 修复+子Skill验证
  →Phase 4 强制归档→Phase 5 自进化。
  触发词：修复、报错、bug、问题、排查。
version: 5.0.0
dependencies: [specflow-rules-engine, admin-ui-design, frontend-design, eslint-code-quality, frontend-codegen, node-backend-codegen]
conflict-with: [dev, resume]
allowed-tools: [read_file, search_content, execute_command, use_skill, mcp_call_tool]
max-token: 2500
---

# Fix — 修复模式 v5.0

**流程：Phase 0 上下文 → Phase 1 分析 → Phase 2 根因 → 🎨 2.5 设计评审(条件) → 🔒 Phase 3 修复+子Skill门控 → Phase 4 强制归档 → Phase 5 自进化**

> ⛔ **v5.0 核心变更**：fix 也接入设计评审流程（admin-ui-design + frontend-design），
> 当修复涉及 UI 变更时强制执行。所有 Phase 有明确的跳过条件矩阵。

---

## ⛔ Phase 执行协议（v5.0 新增）

```
□ Phase 0   (上下文注入)       → 🔴 强制
□ Phase 1   (影响分析)         → 🔴 强制
□ Phase 2   (根因分析)         → 🔴 强制
□ Phase 2.5a(视觉设计)         → 🟡 可跳过，必须匹配跳过条件
□ Phase 2.5b(技术架构)         → 🟡 可跳过，必须匹配跳过条件
□ Phase 3   (修复+验证)        → 🔴 强制
□ Phase 4   (强制归档)         → 🔴 强制
□ Phase 5   (自进化)          → 🔴 强制
```

---

## 📋 跳过条件矩阵

### Phase 2.5a 视觉设计 (admin-ui-design) 跳过条件

```
✅ 可以跳过（必须匹配，播报原因）：
  □ 纯后端bug     → 只改 electron/，无前端文件变更
  □ 纯逻辑bug     → 只改 .ts 逻辑文件，不改 .tsx/.scss
  □ 纯类型修复    → 只改 src/types/
  □ 配置/脚本bug  → 只改 .json/.yaml/.toml/.js
  □ 样式类名错配  → SCSS 和 TSX 类名不对齐（语义修复，非视觉重设）

❌ 不可跳过（必须调用 use_skill("admin-ui-design")）：
  □ UI变丑/布局崩溃  → 用户反馈"丑/乱/不对齐"
  □ 需要视觉重设计    → 需要改布局/颜色/间距/组件
  □ 新增UI元素        → 修复需要新增弹窗/卡片/按钮布局
```

### Phase 2.5b 技术架构 (frontend-design) 跳过条件

```
✅ 可以跳过（必须匹配，播报原因）：
  □ ≤1 个文件修改，≤30 行         → 单文件小修
  □ 纯样式修复（只改 .scss）        → 不改组件结构
  □ 纯后端修复                      → 无前端代码
  □ 纯类型修复                      → 只改 types/
  □ 已有同问题 INCIDENT 记忆        → 历史方案直接复用

❌ 不可跳过（必须调用 use_skill("frontend-design")）：
  □ 跨模块修复            → 影响 ≥2 个独立模块
  □ 需要改路由/组件拆分    → 结构变更
  □ 需要改数据流/状态管理  → 状态管理变更
  □ 修复影响现有功能       → 需要重新评估边界红线
```

### Phase 3 修复模式跳过条件

```
● 局部修复模式（fix 可直接 write_to_file / replace_in_file）：
  □ <3 个文件 && <50 行总改动
  □ 类名/import/类型 等语义修复

● 子Skill模式（必须调用 codegen）：
  □ ≥3 个文件 或 ≥50 行总改动
  □ 新增任何文件
  □ 重写组件逻辑

● 验证强制（不区分模式）：
  🔴 必须调用 use_skill("eslint-code-quality")
  🔴 read_lints = 0 才能通过
```

---

## Phase 0 — 上下文注入（🔴 强制）

```
0.1 build_context (specflow-context-broker, task_type: fix)
0.2 search_memory (INCIDENT + CONSTRAINT)
0.3 记录 error-log
```

命中 INCIDENT → 输出历史方案，进入跳过判定。

---

## Phase 1 — 影响分析（🔴 强制）

```
analyze_file_impact → 确定影响范围
输出：文件清单 + 类型分类
```

---

## Phase 2 — 根因分析（🔴 强制）

```
分析根因 → 分类：
  □ 语义错误（类名/import/类型/字段名）
  □ 逻辑错误（状态/流程/边界）
  □ 样式错误（类名不匹配/Token缺失/布局崩溃）
  □ 架构错误（路由/组件拆分/数据流）
```

---

## 🎨 Phase 2.5a — 视觉设计（admin-ui-design）

### 判定流程

```
1. 根因类型检查 → 对照跳过条件矩阵
2. 匹配跳过条件 → 播报 "🟡 Phase 2.5a 跳过：[条件]"
3. 不匹配 → 强制执行 use_skill("admin-ui-design")
```

---

## 🎨 Phase 2.5b — 技术架构（frontend-design）

### 判定流程

```
1. 影响范围检查 → 对照跳过条件矩阵
2. 匹配跳过条件 → 播报 "🟡 Phase 2.5b 跳过：[条件]"
3. 不匹配 → 强制执行 use_skill("frontend-design")
```

**特别注意**：跨模块修复时，frontend-design 的红线输出是防止修复引入新 bug 的关键。

---

## 🔒 Phase 3 — 修复 + 子Skill门控（🔴 强制）

### 3.1 局部修复

```
1. fix 直接 replace_in_file / write_to_file（<3文件,<50行）
2. 🔒 use_skill("eslint-code-quality") ← 强制
3. 🔒 read_lints → 0错误 / 阻断重试
```

### 3.2 子Skill修复（≥3文件 或 ≥50行）

```
1. 路由到 codegen 子Skill：
   electron/*.ts → use_skill("node-backend-codegen")
   src/*.tsx     → use_skill("frontend-codegen")

2. 门控：
   🔒 确认子Skill Step0-6 播报完成
   🔒 read_lints → 0错误
```

---

## Phase 4 — 强制归档（🔴 强制）

```
4.1 追加 common-issues.md（如为新问题类型）
4.2 write_memory(kind: INCIDENT)
4.3 更新 error-log
```

---

## Phase 5 — 反馈 + 自进化（🔴 强制）

```
feedback + governance_action(health-report)
```

---

## 🔒 完整验证清单

```
□ Phase 0:    build_context + search_memory(INCIDENT) + error-log    🔴强制
□ Phase 1:    analyze_file_impact                                    🔴强制
□ Phase 2:    根因已定位 + 问题类型已分类                              🔴强制
□ Phase 2.5a: 检查跳过条件 → 跳过或执行 admin-ui-design               🟡条件
□ Phase 2.5b: 检查跳过条件 → 跳过或执行 frontend-design               🟡条件
□ Phase 3:    eslint-code-quality 已调用 + read_lints = 0            🔴强制
□ Phase 3:    若调codegen → Step0-6 播报 + read_lints = 0           🔴强制
□ Phase 4:    common-issues + INCIDENT记忆 + error-log更新           🔴强制
□ Phase 5:    feedback + governance + 自进化                         🔴强制
```

---

## 跳过条件速查卡

| Phase | 跳过条件关键词 | 跳过时必须播报 |
|-------|-------------|-------------|
| 2.5a | 纯后端 / 纯逻辑 / 纯类型 / 配置脚本 / 类名错配 | "🟡 Phase 2.5a 跳过：[条件]" |
| 2.5b | ≤1文件≤30行 / 纯样式 / 纯后端 / 纯类型 / 历史方案 | "🟡 Phase 2.5b 跳过：[条件]" |
| 3(局部) | <3文件<50行 → fix直接写 + eslint-code-quality | "🔧 Phase 3 局部修复：{文件}" |
| 3(codegen) | ≥3文件或≥50行 → 必须子Skill | "🔧 Phase 3 子Skill修复：{codegen}" |

## 违规判断标准

```
以下情况视为违规：
  ❌ 跳过 Phase 但未匹配跳过条件矩阵
  ❌ 跳过 Phase 但未播报原因
  ❌ UI修复未调 admin-ui-design（匹配"不可跳过"条件）
  ❌ 跨模块修复未调 frontend-design（匹配"不可跳过"条件）
  ❌ 修复后未调 eslint-code-quality
  ❌ 大改(≥50行)未通过 codegen 子Skill

违规处理：同 dev skill（警告→重做→上报）
```
