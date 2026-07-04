---
name: dev
description: >
  新增功能/生成代码。Phase 0 上下文→Phase 1 影响分析→🎨 Phase 1.5a 视觉设计→🎨 Phase 1.5b 技术架构
  →🔒 Phase 2 代码生成+门控→Phase 3 验证→Phase 4 记忆→Phase 5 自进化。
  触发词：新增、添加、创建、写、实现、开发、生成。
version: 5.0.0
dependencies: [specflow-rules-engine, admin-ui-design, frontend-design, backend-design, frontend-codegen, backend-trpc-codegen, node-backend-codegen, eslint-code-quality]
conflict-with: [fix, resume]allowed-tools: [read_file, search_content, execute_command, use_skill, mcp_call_tool]
max-token: 3000
---

# Dev — 开发模式 v5.0

**流程：Phase 0 上下文 → Phase 1 分析 → 🎨 1.5a 视觉设计 → 🎨 1.5b 技术架构 → 🔒 Phase 2 代码生成 → Phase 3 验证 → Phase 4 记忆 → Phase 5 自进化**

> ⛔ **v5.0 核心变更**：所有 Phase 强制执行，但提供明确的**跳过条件矩阵**。
> 跳过必须播报原因，不得静默跳过。无条件跳过 = 违规。

---

## ⛔ Phase 执行协议（v5.0 新增 · 最高优先级）

### 每个 Phase 的默认状态：必须执行

```
□ Phase 0   (上下文注入)       → 🔴 强制，不可跳过
□ Phase 1   (影响分析)         → 🔴 强制，不可跳过
□ Phase 1.5a(视觉设计)         → 🟡 可跳过，必须匹配跳过条件
□ Phase 1.5b(技术架构)         → 🟡 可跳过，必须匹配跳过条件
□ Phase 2   (代码生成+子Skill)  → 🔴 强制，不可跳过
□ Phase 3   (全量验证)         → 🔴 强制，不可跳过
□ Phase 4   (写记忆)          → 🔴 强制，不可跳过
□ Phase 5   (自进化)          → 🔴 强制，不可跳过
```

### 跳过必须满足：明确定义的条件 + 播报原因

```
禁止行为：
  ❌ "因为简单所以跳过"  → 必须有矩阵中的条件匹配
  ❌ 静默跳过不播报       → 必须在播报中说明跳过原因
  ❌ 部分跳过（调用 Skill 但不走完） → 调用=必须走完

正确方式：
  ✅ 匹配跳过条件矩阵 → 播报 "🟡 Phase 1.5a 跳过：纯后端代码，无前端页面"
  ✅ 不匹配则强制执行 → 播报 "🎨 Phase 1.5a 执行：表单向UI，调用 admin-ui-design"
```

---

## 📋 跳过条件矩阵（v5.0 新增 · 所有 Phase 必须过此表）

### Phase 1.5a 视觉设计 (admin-ui-design) 跳过条件

```
✅ 可以跳过（必须满足至少 1 条，播报原因）：
  □ 纯后端代码    → 只改 electron/ 目录，无任何前端文件
  □ 纯类型定义    → 只改 src/types/，无 UI 变更
  □ 纯逻辑修复    → 只改 .ts 逻辑文件（非组件），不改任何 .tsx/.scss
  □ 配置文件修改  → 只改 .json/.yaml/.toml 等非 UI 文件

❌ 不可跳过（必须调用 use_skill("admin-ui-design")）：
  □ 新增页面/组件 → 任何新的 .tsx 文件
  □ 修改现有页面  → 改变布局、添加/删除区域
  □ 新增弹窗/抽屉 → Modal/Drawer/弹出层
  □ 用户提到"UI/界面/样式/布局/好看/美化/设计"
```

### Phase 1.5b 技术架构 (frontend-design / backend-design) 跳过条件

```
✅ 可以跳过（必须满足至少 1 条，播报原因）：
  □ 单文件修改    → ≤1 个 .tsx 文件，≤30 行改动，无新增文件
  □ 纯样式调整    → 只改 .scss 文件，不改变组件结构
  □ 纯后端代码    → 无前端文件变更，不需要前端架构设计
  □ 纯类型定义    → 只改 src/types/
  □ 已有明确方案  → 用户给出了完整的技术方案（路由/组件/数据流）
  □ 类型 C 任务   → API 已就绪，Proto 已有，不需要后端设计

❌ 不可跳过（必须调用对应的 use_skill）：
  类型 A/B（前端/全栈）：
    □ 新增路由      → 需要插入 routes.tsx → use_skill("frontend-design")
    □ 新增模块      → 新目录 + 多个文件 → use_skill("frontend-design")
    □ 跨模块改动    → 影响 ≥2 个独立模块 → use_skill("frontend-design")
    □ 状态管理变更  → 新增/修改 Zustand store 或 Context → use_skill("frontend-design")
    □ 数据流变更    → 改变组件间通信方式 → use_skill("frontend-design")

  类型 B（全栈，需后端设计）：
    □ 缺少 DDL      → 需要设计表结构 → use_skill("backend-design")
    □ 缺少 Proto    → 需要设计接口 → use_skill("backend-design")
    □ 新增后端功能  → 需要后端 API → use_skill("backend-design")
    □ 数据库变更    → 新增/修改表 → use_skill("backend-design")

  类型 C（API 已就绪）：
    □ 无需后端设计  → Proto 已有，DB 已定义 → 跳过 backend-design
```

### Phase 2 代码生成跳过条件

```
❌ 不可跳过（必须有子 Skill 负责实际代码生成）：
  dev 本身禁止在 Phase 2 期间调用 write_to_file / replace_in_file
  任何 .tsx/.ts/.scss 必须由子 Skill 生成

  例外（dev 可直接写）：
  ✅ 纯类型定义 (src/types/ 下 .ts 文件)
  ✅ 配置文件 (.json/.yaml/.toml)
  ✅ 文档 (.md)
```

---

## ⛔ 工具使用限制

```
Phase 0-1 (上下文+分析)：
  ✅ 允许: read_file, search_content, mcp_call_tool, execute_command, use_skill

🔒 Phase 2 (子Skill生成期间)：
  ❌ 禁止: write_to_file, replace_in_file  ← 代码只能由子 Skill 写
  ✅ 允许: use_skill, read_file, read_lints, search_content, mcp_call_tool

Phase 3-5 (验证+记忆)：
  ✅ 允许: read_lints, execute_command, mcp_call_tool
  ❌ 禁止: write_to_file, replace_in_file（除非修复子Skill遗漏的≤5行小问题）
```

---

## Phase 0 — 上下文注入（🔴 强制）

```
0.1 build_context (specflow-context-broker)
0.2 search_all (specflow-cognitive-engine)
0.3 scratchpad (specflow-cognitive-engine)
```

---

## Phase 1 — 影响分析（🔴 强制）

```
analyze_file_impact (specflow-impact-analyzer)
输出：影响文件清单 + 代码类型分类
```

**跳过判定**：在此阶段，根据影响范围走跳过条件矩阵：

1. 列出现有文件类型（electron/ts | src/tsx | src/scss | src/types）
2. 逐个匹配跳过条件矩阵
3. 输出：哪些 Phase 可跳过 + 原因

---

## 🎨 Phase 1.5a — 视觉设计（admin-ui-design）

### Step A: 检查跳过条件

```
对照跳过条件矩阵 → 匹配？→ 跳过并播报原因
```

### Step B: 不匹配 → 强制执行

```yaml
调用: use_skill("admin-ui-design")
输出: 布局方案 + 组件选型 + 交互模式 + ASCII线框图
```

### Step C: 播报

```
🟡 Phase 1.5a 跳过：{原因} {匹配的跳过条件}
-- 或 --
🎨 Phase 1.5a 执行：admin-ui-design → {布局} + {N}组件
```

---

## 🎨 Phase 1.5b — 技术架构（frontend-design / backend-design）

### Step A: 检查跳过条件

```
对照跳过条件矩阵 → 匹配？→ 跳过并播报原因
```

### Step B: 不匹配 → 强制执行

```
判断任务类型（A/B/C）→ 确定需要调用哪些 Skill：

类型 A（纯UI）：
  → 只调用 use_skill("frontend-design")

类型 B（全栈，后端需生成）：
  → 先调用 use_skill("backend-design")（设计 Proto + DB Schema）
  → 再调用 use_skill("frontend-design")（设计前端架构）

类型 C（API已就绪，Proto已有）：
  → 只调用 use_skill("frontend-design")
```

### Step C: 执行子 Skill

```yaml
# 类型 A
调用: use_skill("frontend-design")
输出:
  - 路由设计方案
  - 组件拆分方案（容器/展示分离 + Props 接口 + 文件路径）
  - 数据流方案（Zustand/Context/useState 选择）
  - 🔒 红线边界（本次不可影响的文件）
  - ⚡ 性能策略

# 类型 B
调用: use_skill("backend-design") → Proto + DB Schema 设计决策
调用: use_skill("frontend-design") → 同上

# 类型 C
调用: use_skill("frontend-design") → 同上
```

### Step D: 播报

```
🟡 Phase 1.5b 跳过：{原因} {匹配的跳过条件}
-- 或 --
🎨 Phase 1.5b 执行：技术架构设计
  类型: {A/B/C}
  backend-design: {已调用/跳过} → Proto决策 + DB决策 + API设计决策
  frontend-design: {已调用/跳过} → 路由: {N}新路由 | 组件: {N}个({M}新建/{K}复用)
  数据流: {方案} | 🔒红线: {文件}
```

---

## 🔒 Phase 2 — 强制子 Skill 代码生成 + 门控（🔴 强制）

### 子 Skill 路由表

```
文件类型                              → 调用的子 Skill
─────────────────────────────────────────────────────────────
electron/ *.ts                        → node-backend-codegen
src/ *.tsx + *.scss                   → frontend-codegen（自动委派css-style-writer）
src/types/ *.ts                       → dev 直接写（仅限纯类型）
service/ *.go + internal/ *.go        → backend-trpc-codegen（Go 三层代码）
apis/handlers/ *.ts                   → backend-trpc-codegen（TS Handler）
db/migrations/ *.sql + db/ *.json     → backend-trpc-codegen（验证 DDL 对齐）
```

### 执行协议

```
Step A: use_skill("{codegen}") → 等待子Skill完成
Step B: 确认子Skill播报 Step0-6 全部完成
Step C: read_lints(生成文件) → 0错误 / >0错误阻断

⚠️ backend-trpc-codegen 执行说明：
  - Step 0: 规则注入（specflow-rules-engine）
  - Step 1: 项目环境检测（go.mod / proto/ / internal/）
  - Step 2: Go 工具链检测（go / golangci-lint / protoc）
  - Step 3: 任务类型判定 & 委派执行
  - Phase 2-6: API设计 → Proto生成 → 代码生成 → 测试 → 验证
  → 等待 backend-trpc-codegen 播报 Phase 6 完成（含质量验证通过）
```

---

## Phase 3-5 — 验证 + 记忆 + 自进化（🔴 强制）

同 v4.0，无变化。

---

## 🔒 完整验证清单

```
□ Phase 0:    build_context + search_all + scratchpad               🔴强制
□ Phase 1:    analyze_file_impact                                   🔴强制
□ Phase 1.5a: 检查跳过条件 → 跳过或执行 admin-ui-design              🟡条件
□ Phase 1.5b: 检查跳过条件 → 跳过或执行 frontend-design              🟡条件
□ Phase 2.A:  use_skill("{codegen}") → Step0-6播报确认              🔴强制
□ Phase 2.B:  read_lints(生成文件) → 0错误                          🔴强制
□ Phase 3:    tsc --noEmit + 全量 read_lints = 0                    🔴强制
□ Phase 4:    write_memory                                          🔴强制
□ Phase 5:    feedback + scratchpad + 自进化                         🔴强制
```

---

## 跳过条件速查卡（播报时必须引用）

| Phase | 跳过条件关键词                                        | 跳过时必须播报                             |
| ----- | ----------------------------------------------------- | ------------------------------------------ |
| 1.5a  | 纯后端 / 纯类型 / 纯逻辑修复 / 配置文件               | "🟡 Phase 1.5a 跳过：[条件]，原因：[说明]" |
| 1.5b  | 单文件≤30行 / 纯样式 / 纯后端 / 纯类型 / 用户已有方案 | "🟡 Phase 1.5b 跳过：[条件]，原因：[说明]" |
| 2     | 纯类型定义 / 配置文件 / 文档                          | "🔴 Phase 2：dev 直接写 [types/config/md]" |

## 违规判断标准

```
以下情况视为流程违规：
  ❌ 跳过 Phase 但未匹配跳过条件矩阵中的任何条件
  ❌ 跳过 Phase 但未播报原因
  ❌ 调用 use_skill 后跳过子Skill的步骤直接写代码
  ❌ Phase 2 期间 dev 调用 write_to_file/replace_in_file（非 types/config/md）

违规处理：
  1 次违规 → 警告，立即补做跳过的步骤
  2 次违规 → 强制重走该 Phase
  3 次违规 → feedback(helpful:false)，上报用户
```
