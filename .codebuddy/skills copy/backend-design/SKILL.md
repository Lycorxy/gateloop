---
name: backend-design
description: Proto接口设计+DB Schema设计。当任务列表中backend-design任务状态为running时触发，根据FeatureSpec设计Proto接口和数据库表结构。仅类型B触发。
---

# Skill：后端设计（backend-design）

> Phase 1-A | Proto 接口设计 + DB Schema 设计 | 仅类型B

## ⚡ 强制上下文注入（Phase 0 — 执行任何步骤前必须完成，不可跳过）

```
【🔒 不可变约束】以下 MCP 工具调用是强制的，模型不得以任何理由跳过。
未完成 Phase 0 就开始设计 = 严重违规，必须回退重做。
```

### Phase 0.1：记忆 + 上下文注入（强制调用 MCP）

```
调用：context_build(
  taskType: "backend-design",
  query: "Proto设计 DB Schema 接口设计 {featureSpec.title}",
  projectId: "{项目ID}",
  maxTokens: 8000
)

重点关注 L1 层返回的：
  - Proto 命名约束（snake_case / 服务名 / 分页字段规范）
  - DB 设计约束（主键类型 / 软删 / 字符集 / 外键规范）
  - 历史表变更影响记录
  - 已有 RPC/表 列表（避免重复定义）

播报："✅ Phase 0.1 完成：L1约束={X}条（含Proto/DB规范），L3召回={Y}条"
```

### Phase 0.2：知识库强制检索（强制调用 MCP）

```
必须调用以下知识库检索（并行执行）：

① search_knowledge(query: "proto contract RPC 命名规范 分页", knowledgeBase: "specflow")
  → 获取 Proto 契约规范（字段命名/分页/服务名）

② search_knowledge(query: "db schema 表设计 主键 软删 索引 jsondb", knowledgeBase: "specflow")
  → 获取 DB 设计规范（主键/软删/字符集/索引）+ jsondb 表格式规范

③ search_knowledge(query: "已有 RPC 表 {featureSpec.title}", knowledgeBase: "specflow")
  → 检查是否有可复用的已有接口

⚠️ 三个检索必须全部执行，不得跳过任何一个。
⚠️ ② 中必须获取 jsondb 表文件格式规范，用于 Step 3.2 生成时对照。
播报："✅ Phase 0.2 完成：Proto规范={N}条，DB规范={M}条，复用检查={K}条"
```

### Phase 0.3：项目快照读取（强制调用 MCP）

```
调用：sf_context_read(section: "accumulated")
  → 获取已有 RPC 列表（避免重名）
  → 获取已有表列表（避免重复建表）
  → 获取项目约定（如 category_id 统一用 BIGINT UNSIGNED）

播报："✅ Phase 0.3 完成：已有{R}个RPC，{T}张表，{C}条约定"
```

**Phase 0 完成播报（强制格式）：**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 Phase 0 上下文注入完成（backend-design）
  L1约束：{X}条（Proto命名/DB规范/历史错误）
  知识库：Proto规范+DB规范+jsondb格式+复用检查 已加载
  项目快照：已有{R}RPC {T}表，不得重复定义
  ⚠️ 以下约束强制执行（基于实际项目代码）：
    - Proto 字段 snake_case，服务名 trpc.specflow.knowledge.Knowledge
    - 主键 BIGINT UNSIGNED，软删 is_deleted，字符集 utf8mb4
    - 每个 RPC 独立 Request+Response message
    - jsondb 初始 data 必须为 []，禁止预填假数据
    - 【实际项目 Go 架构】扁平三层：Handler → Repository → DB（无 Logic 层）
    - 【实际项目 Go 架构】禁止设计 logic/ / entity/dto/ / entity/assembler/ 目录
    - 【实际项目 Go 架构】Repository 接口+实现合并在 repo.go（禁止拆 api.go+mysql.go）
    - 【实际项目 Go 架构】Go module 路径：specflow/service
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 接口定义

```yaml
input:
  - name: featureSpec
    type: FeatureSpec
    source: current.featureSpec

output:
  - name: protoDesign
    type: ProtoDesign
    target: current.protoDesign
  - name: dbSchema
    type: DBSchema
    target: current.dbSchema
    note: "包含 sqlDdlFiles（SQL文件路径列表）和 jsondbFiles（jsondb文件路径列表）"
```

---

## 执行步骤

> ⚠️ 必须先完成 Phase 0 上下文注入，再执行以下步骤。

### Step 1：影响评估（修改已有 Proto/表时必须执行）

```
若本次需求涉及修改已有 Proto message 或已有表：
  调用 impact_quick → 分析受影响文件
  调用 analyze_cross_language → 分析跨语言符号关联
  有影响 → 输出影响报告 + 兼容方案 → 等待用户确认
  无影响 → 播报"影响评估：无影响"→ 继续
```

### Step 1.5：🔒 接口原子性 + 复用评估（必须执行，阻断点）

```
❗ 本步是设计阶段最重要的决策点，必须在 Step 2 之前完成。

【原子性评估】
  对每个拟新增 RPC，回答以下问题：
  1. 这个接口是否只做一件事？（单一责任原则）
  2. 是否可以拆分为更小的原子操作？
  3. 如果拆分，前端组合调用是否会带来性能问题？
  → 输出：接口原子性评估结果（拆分/不拆分 + 原因）

【复用评估】（基于 Phase 0.3 已加载的已有 RPC 列表）
  从以下 4 个角度分析：

  角度① 扩展性：
    - 现有接口加参数能否满足新需求？
    - 新建接口是否会导致现有接口过负载？

  角度② 复用性：
    - 是否已有类似功能的接口？
    - 复用现有接口是否会引入耦合？

  角度③ 稳定性：
    - 复用现有接口是否会影响其他功能？
    - 新建接口是否会引入新的单点故障？

  角度④ 性能（目标 0-50ms）：
    - 复用现有接口是否会带来额外查询开销？
    - 新建表是否需要复合索引优化？
    - 是否需要缓存层（KV）辅助？

  → 输出决策结果：
    ✅ 复用现有接口 {RpcName}：{原因}
    ✅ 新建接口 {RpcName}：{原因}
    ✅ 新建表 {TableName}：{原因}
    ✅ 复用现有表 {TableName}：{原因}

播报格式：
"✅ Step 1.5 接口评估：新建={N}个 RPC，复用={M}个 RPC，新建={K}张表，复用={J}张表"
```

### Step 2：Proto 设计

```
基于 Phase 0 已加载的 Proto 规范，设计接口：
  - 字段 snake_case
  - 分页：page/page_size/total
  - 列表：repeated XxxInfo list
  - 每个 RPC 独立 Request+Response message
  - 服务名：trpc.hello_app.service.Knowledge

⚠️ 不得重复调用知识库（Phase 0.2 已加载）
⚠️ 不得与已有 RPC 重名（Phase 0.3 已确认）
⚠️ 只生成 Step 1.5 评估决定新建的 RPC，不生成已决定复用的 RPC

工具校验：sf_contract_validate → 失败→重试（最多3次）
```

### Step 3：DB Schema 设计（SQL DDL 优先，jsondb 同步派生）
