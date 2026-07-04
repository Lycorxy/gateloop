---
name: backend-trpc-codegen
description: >
    后端代码生成唯一入口。自动编排 specflow-rules-engine + mysql-schema-design，
    根据任务类型判定是否先设计表结构、再做 API 设计决策（6维度评估）、
    然后生成 Proto + Service/Logic/Repo 三层代码 + 单元测试 + 质量验证。
    生成代码满足生产级标准：并发、安全、性能、稳定性、扩展性、服务器成本。
    当用户说 生成后端代码、生成Go服务、生成tRPC接口、生成proto、
    生成CRUD后端、从需求生成Go代码、生成Kafka消费代码 时使用。
    不要用于纯前端开发（→ frontend-codegen）、纯数据库表设计（本Skill会委派）、
    代码审查（Go用golangci-lint）、纯写SQL。
version: 2.0.0
dependencies: [specflow-rules-engine, mysql-schema-design]
conflict-with: []
allowed-tools:
    [read_file, search_content, execute_command, list_dir, write_to_file, replace_in_file, terminal]
max-token: 4000
---

# Backend tRPC-Go Codegen v2.0 — 后端代码生成（唯一入口）

## 🛑 入口守卫

```
本 Skill 加载后必须按 Step 0→1→2→3 + Phase 2-6 顺序执行全部阶段。
每步播报完成消息，未播报 = 未执行 = 违规。
禁止跳步，禁止跳过子 Skill 委派（如 mysql-schema-design）。
```

**核心定位：不是"写 Go 代码"，而是"像一个资深后端架构师那样，先注入规则、检测环境、判定路径、委派子 Skill、再设计 API 与技术方案、最后生成生产级代码并验证"。**

> 🧠 **设计哲学**：作为唯一入口，像一个经验丰富的技术组长那样——
> 先确认项目规范和工具链，再判断是否需要设计表（委派 DBA 专家），
> 然后基于6维度做 API 设计决策，最后生成代码并验证。每一步都有约束，每一步都有播报。

核心目标排序：**路径正确 > 业务正确 > 性能最优 > 安全可靠 > 扩展预留 > 维护便捷**

---

## 何时使用 / 何时不使用

**应该触发：**

- "根据这个需求生成后端代码"
- "生成 tRPC-Go 服务的 CRUD 接口"
- "把这个表结构转成 Go 服务代码"
- "生成 Proto 文件和后端实现"
- "生成带缓存的查询接口"
- "生成 Kafka 消费者/生产者代码"

**不应触发：**

- 纯数据库表设计 — 本 Skill 会委派 `mysql-schema-design`，不要直接调用
- 纯前端开发（→ `frontend-codegen`）
- 代码审查 / Lint 检查（Go 用 `golangci-lint`）
- 纯写 SQL 查询
- Redis/MongoDB 选型咨询（无代码生成需求时）

---

## 代码生成流程总览

```
┌──────────────────────────────────────────────────────────────┐
│  🔒 Step 0: 规则注入（specflow-rules-engine）                │
│  ↓ use_skill("specflow-rules-engine")                       │
│  ↓ 播报完成 → 后续步骤受铁律约束                            │
├──────────────────────────────────────────────────────────────┤
│  Step 1: 项目环境检测 [低自由度·强制]                        │
│  ↓ Go版本 / 项目结构 / proto目录 / 数据库配置 / go.mod      │
│  ↓ ⚠️ 未检测就编码 = 可能不符合项目规范                    │
├──────────────────────────────────────────────────────────────┤
│  Step 2: Go 工具链检测 [中自由度·强制]                       │
│  ↓ go / golangci-lint / protoc 可用性检查                    │
│  ↓ ⚠️ 工具缺失则降级处理，标注风险                         │
├──────────────────────────────────────────────────────────────┤
│  Step 3: ★ 任务类型判定 & 委派执行 [低自由度·强制]           │
│  ↓ A:缺DDL→mysql-schema-design  B:有DDL→跳过设计            │
│  ↓ C:只Proto  D:只代码  E:全流程                             │
│  ↓ ⚠️ 禁止跳过判定直接写代码                                │
├──────────────────────────────────────────────────────────────┤
│  Phase 2: API 设计决策 [高自由度·专家判断]                   │
│  ↓ 6维度评估表 + 技术选型决策树 + 接口粒度决策               │
├──────────────────────────────────────────────────────────────┤
│  Phase 3: Proto 文件生成 [低自由度]                           │
│  ↓ 输出 .proto → 用户自行 make proto 生成桩代码              │
├──────────────────────────────────────────────────────────────┤
│  Phase 4: 代码生成 [低自由度]                                 │
│  ↓ Service → Logic → Repo 三层                               │
│  Phase 4b: Kafka 代码（按需触发）                             │
├──────────────────────────────────────────────────────────────┤
│  Phase 5: 单元测试生成 [低自由度]                             │
│  ↓ table-driven + gomock                                     │
├──────────────────────────────────────────────────────────────┤
│  Phase 6: 质量验证 [低自由度·强制]                            │
│  ↓ golangci-lint → go vet → go build → go test -race         │
│  ↓ ⚠️ 不通过不得继续                                        │
└──────────────────────────────────────────────────────────────┘
```

> 🔒 **步骤执行约束**：每个 Step/Phase 必须按序执行。若模型认为可跳过，**必须输出跳过声明**：
>
> ```
> ⏭️ [跳过] Step/Phase {N} — {名称}
> 理由：{为什么可以跳过}
> 风险：{跳过可能带来的风险}
> ```
>
> **禁止无声跳过**——未声明理由的跳过 = 违规。

---

## 🔒 Step 0 — 规则注入（强制·最高优先级·不可跳过）

```
【🔒 不可变约束】
  Step 0 必须在任何代码生成之前完成。
  未执行 use_skill("specflow-rules-engine") 就开始写代码 = 严重违规，必须立即停止并回退。
  无任何豁免理由。
```

```typescript
use_skill('specflow-rules-engine') // 强制：同步 RULE.mdc + 检测 System Prompt + read_file 兜底
```

> 完成播报：`"✅ Step 0 规则注入完成：铁律 0-8 已在上下文中"` — 未播报不得进入 Step 1。
>
> ⏭️ **唯一可跳过条件**：同一次会话中已执行过 Step 0 且播报过完成消息。
> 跳过必须声明：`⏭️ [跳过] Step 0 规则注入 | 理由：同会话已注入 | 风险：无`

---

## Step 1 — 项目环境检测 [低自由度·强制]

```
【🔒 不可变约束】
  Step 1 必须在任何代码生成之前完成。
  未进行项目环境检测就开始写代码 = 严重违规。
```

### 1.1 并行读取项目配置

```typescript
read_file('go.mod') // Go版本、模块路径、项目依赖
read_file('Makefile') // 检查 proto 生成命令、构建命令
list_dir('proto/') // 已有 proto 文件列表
list_dir('internal/') // 已有项目结构
```

### 1.2 环境检测清单（强制逐条检查）

```
□ Go 版本
    - go.mod 中的 go x.xx → 代码中用该版本的语法特性
    - 无 go.mod → 询问用户是否要初始化项目

□ 模块路径
    - module trpc.tech/trpc-go/{app}/{server} → proto 的 go_package 匹配
    - 非标准路径 → 仅生成内部代码，proto 标记 go_package 待确认

□ Proto 目录
    - proto/ 存在 → 新 proto 放入同目录
    - 无 proto/ → 创建 proto/ 目录

□ 项目结构
    - internal/service/ 存在 → 沿用
    - internal/logic/   存在 → 沿用
    - internal/repo/    存在 → 沿用
    - 都不存在 → 按标准结构创建

□ 数据库配置
    - trpc_go.yaml 中有 MySQL client 配置 → 提取 service name 用于代码
    - 无 → 生成时使用占位符，标注需补充配置
```

> 完成播报：`"✅ Step 1 环境检测完成：Go{版本} / 模块{路径} / Proto{目录} / 项目结构{状态}"` — 未播报不得进入 Step 2。

---

## Step 2 — Go 工具链检测 [中自由度·强制]

### 2.1 并行检测工具可用性

```typescript
execute_command('go version') // Go 是否安装
execute_command('golangci-lint version') // Lint 工具是否可用
execute_command('protoc --version') // Proto 编译器是否可用
```

### 2.2 检测结果处理

| 工具            | 可用               | 不可用                                 |
| --------------- | ------------------ | -------------------------------------- |
| `go`            | 正常               | **阻塞** — 无法编译验证，需用户安装    |
| `golangci-lint` | Phase 6 全量验证   | Phase 6 降级为 `go vet` only，标注风险 |
| `protoc`        | Phase 3 可校验语法 | Phase 3 仅生成文件不校验，标注风险     |

> 完成播报：`"✅ Step 2 工具链检测完成：Go{版本} / golangci-lint{可用/不可用} / protoc{可用/不可用}"`
>
> ⏭️ **可跳过条件**：非全流程任务（路径 C/D），且不用到对应工具。声明格式：
> `⏭️ [跳过] Step 2 部分检测 | 理由：路径C仅生成Proto，无需golangci-lint | 风险：无`

---

## Step 3 — ★ 任务类型判定 & 委派执行 [低自由度·强制]

```
【🔒 不可变约束】
  本步骤决定后续所有代码生成的执行路径。
  禁止跳过判定直接写代码。
  需要表设计时必须真正委派 mysql-schema-design，不能口头说"先去设计表"。
```

### 3.1 任务类型矩阵

| #   | 任务类型                                | 判定条件                      | 委派目标                  |
| --- | --------------------------------------- | ----------------------------- | ------------------------- |
| A   | **缺DDL，需表设计+代码生成**            | 用户给了需求描述，但无DDL     | → `mysql-schema-design`   |
| B   | **有DDL，全流程生成**                   | DDL已存在（用户提供或A产出）  | → 当前 Skill 直接执行     |
| C   | **仅生成 Proto**                        | 用户只要 .proto 文件          | → 当前 Skill Phase 3 only |
| D   | **仅生成代码层**                        | 有DDL + 有Proto，只差代码实现 | → 当前 Skill Phase 4→6    |
| E   | **全流程（设计→Proto→代码→测试→验证）** | 从零开始，用户只给了需求描述  | → 先A再B（完整流水线）    |

### 3.2 委派执行流程

```
路径 A: 缺DDL
    → use_skill("mysql-schema-design")
    → 等待 DDL 产出
    → 拿到 DDL 后继续 Phase 2→6

路径 B: 有DDL
    → 当前 Skill Phase 2→6

路径 C: 仅Proto
    → Phase 2(API设计) → Phase 3(Proto) → 交付

路径 D: 仅代码
    → Phase 4→6

路径 E: 全流程
    → 先路径 A → 再路径 B（完整流水线）
```

### 3.3 🔒 强制委派验证（核心机制·不可跳过）

#### 3.3.1 委派判定表（必须填写并播报）

在判定任务类型后，**必须**输出以下判定表：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 任务类型判定：路径 {A/B/C/D/E}
  任务描述：{用户具体要做什么}
  委派目标：{Skill 名称 或 "当前Skill"}
  委派范围：{委派给子Skill做什么，当前Skill保留做什么}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**示例**：

```
📋 任务类型判定：路径 E
  任务描述：用户下单功能从零开始
  委派目标：mysql-schema-design → 当前Skill
  委派范围：表设计（DDL + 索引）→ mysql-schema-design
           API设计 + Proto + 三层代码 + 测试 + 验证 → 当前Skill
```

#### 3.3.2 委派执行验证（强制检查）

```
【🔒 委派执行验证清单（不可跳过）】
□ use_skill() 已调用（不是口头说委派，而是真的调用了）
□ use_skill() 返回成功（子Skill已接管对应领域）
□ DDL 已产出（路径 A/E 时）
□ 当前Skill不再自行处理被委派领域的代码
```

**违规示例**：

- ❌ 判定走路径 A（需表设计），但自己写了 CREATE TABLE 而没有调用 `use_skill("mysql-schema-design")`
- ❌ 判定走路径 E（全流程），口头说"先设计表"后直接跳到写代码，跳过了真正委派
- ❌ 判定走路径 B（有DDL），但 DDL 不完整，强行生成代码

**正确示例**：

- ✅ 判定路径 A → 输出判定表 → 调用 `use_skill("mysql-schema-design")` → 等待 DDL → 确认子Skill完成 → 拿到 DDL 继续
- ✅ 判定路径 C → 输出判定表 → 当前Skill执行 Phase 2→3 → 交付 Proto
- ✅ 判定路径 D → 输出判定表 → 当前Skill执行 Phase 4→6 → 无需委派

#### 3.3.3 委派冲突检测

```
⚠️ 冲突信号（出现任一即停）：
  - 当前Skill写了 CREATE TABLE，但判定路径是 A/E（表设计应委派）
  - 当前Skill生成Proto，但判定路径是 D（Proto应由上游提供）
  - 同时调用了 mysql-schema-design 又自己设计表（路径冲突）

冲突处理：
  1. 立即停止当前操作
  2. 回退到 Step 3 重新判定
  3. 明确划分当前Skill vs 子Skill的职责边界
```

> 完成播报：`"✅ Step 3 任务执行完成：路径{X} / 委派{目标}"` — 必须包含判定表内容。
>
> 🔒 **强制约束**：此步骤不可跳过。禁止跳过判定直接写代码。禁止跳过委派验证。
>
> ⏭️ **可跳过条件**：仅限路径 B/C/D，且必须声明跳过理由：
> `⏭️ [跳过] Step 3 委派 | 理由：路径B有DDL无需委派，当前Skill直接执行 | 风险：无`

---

## Phase 2 — API 设计决策 [高自由度·专家判断]

> **这是本 Skill 的核心价值所在：在写任何代码前，先做多维评估和技术决策。**
> 详细决策矩阵参见 [references/decision-matrix.md](references/decision-matrix.md)、
> 技术选型指南参见 [references/tech-stack-guide.md](references/tech-stack-guide.md)。

### 2.1 6 维度多维评估表（必须输出）

```
┌─────────────────────────────────────────────────────────────────┐
│ 📊 多维评估决策表                                                │
├──────────┬──────────────────────────┬───────────────────────────┤
│ 维度     │ 评估要点                 │ 设计决策                  │
├──────────┼──────────────────────────┼───────────────────────────┤
│ 并发     │ QPS预估值 / 读写比例     │ 连接池大小 / 协程池 /     │
│          │ 热点Key识别              │ 限流策略 / 异步模型       │
├──────────┼──────────────────────────┼───────────────────────────┤
│ 安全     │ 鉴权方式 / 数据敏感度    │ Filter链 / ValidationV3 / │
│          │ SQL注入防护 / 脱敏需求   │ 输入校验 / 错误信息脱敏   │
├──────────┼──────────────────────────┼───────────────────────────┤
│ 性能     │ 序列化方案 / 压缩策略    │ Proto/JSON选型 / 缓存策略 │
│          │ 查询模式 / 索引覆盖度    │ 批量操作 / Pipeline优化   │
├──────────┼──────────────────────────┼───────────────────────────┤
│ 稳定性   │ 超时层级 / 下游依赖数    │ 多级超时 / Google Breaker │
│          │ 单点风险 / 雪崩风险      │ 优雅关闭 / 健康检查       │
├──────────┼──────────────────────────┼───────────────────────────┤
│ 扩展性   │ 水平扩展能力 / 接口版本  │ 无状态设计 / Proto兼容    │
│          │ 未来可能的功能点         │ 分库分表预留 / 字段预留   │
├──────────┼──────────────────────────┼───────────────────────────┤
│ 服务器   │ 内存/CPU/连接数估算      │ 连接池复用 / 零分配设计   │
│ 成本     │ 带宽/存储预估            │ 协程池限流 / 压缩策略     │
└──────────┴──────────────────────────┴───────────────────────────┘
```

### 2.2 技术选型决策树（必须输出）

```
Redis 是否使用？
  ├─ 有高频读 (>100 QPS) + 数据变更不频繁 → ✅ 使用 Redis 缓存
  ├─ 有分布式锁需求（防并发重复创建等）  → ✅ 使用 Redis 锁
  ├─ 有计数器/排行榜需求                 → ✅ 使用 Redis Sorted Set
  └─ 以上皆无                            → ❌ 不引入（不过度设计）

Kafka 是否使用？
  ├─ 有异步解耦需求（如订单→通知）       → ✅ 使用 Kafka
  ├─ 有事件溯源需求                      → ✅ 使用 Kafka
  └─ 以上皆无                            → ❌ 不引入

序列化选型？
  ├─ 内部 RPC 通信                       → ✅ Protobuf（默认）
  ├─ 对外 HTTP API                       → ⚠️ JSON（配合 HTTP 网关）
  └─ 混合场景                            → ✅ Protobuf + HTTP 别名

缓存策略？
  ├─ 单条查询为主（如 GetUserByID）      → Cache-Aside
  ├─ 列表查询为主（如 ListOrders）        → 不缓存（或短TTL分页缓存）
  └─ 热点数据（如配置/字典）             → 启动加载到本地 + TTL 刷新
```

### 2.3 接口粒度决策

```
每实体基础接口：Create / Get / List / Update / Delete
按需增补：BatchCreate / GetByXxx / Search / StatusTransition
禁止：万能查询巨接口 / 字段粒度微接口
```

> 完成播报：`"✅ Phase 2 API设计完成：{Redis决策}/{Kafka决策}/{序列化方案}/{缓存策略}"`

---

## Phase 3 — Proto 文件生成 [低自由度·严格规范约束]

> 生成规则依据知识库 #33 Proto编写规范。完整模板参见 [references/code-templates.md](references/code-templates.md) TPL-01。

### 3.1 核心生成规则

```
包名：trpc.{app}.{service}（三级命名）
Service：PascalCase + Service 后缀
Method：PascalCase 动词开头
字段命名：snake_case，编号 1-15 给核心字段
金额：int64（分）或 string（高精度）
时间：string RFC3339
分页：page（从1开始）+ page_size
校验：buf/validate/validate.proto（推荐）
```

### 3.2 交付说明

```
Proto 文件已生成至：{路径}

下一步请运行：
  make proto    # 生成 .pb.go 和 _trpc.go 桩代码
```

> 🔒 **强制约束**：本 Skill 只输出 .proto 文件，不输出 .pb.go 桩代码。用户通过 `make proto` 自行生成。

---

## Phase 4 — 代码生成 [低自由度·严格分层]

> 完整模板参见 [references/code-templates.md](references/code-templates.md) TPL-02～TPL-09。

### 4.1 分层架构（三层）

```
Service 层 → Logic 层 → Repo 层
  ↑ 入口       ↑ 业务       ↑ 数据
  薄层转发     规则+编排    MySQL/Redis/Kafka
```

**单向依赖**：Service → Logic → Repo。**层间通过 interface 通信**。

### 4.2 生成文件清单

```
internal/
├── service/{entity}_service.go     # Handler（薄层）
├── logic/{entity}/
│   ├── api.go                      # 接口定义
│   ├── api_impl.go                 # 实现
│   └── api_impl_test.go            # 测试（Phase 5）
└── repo/
    ├── mysql_{entity}.go           # MySQL Repo（GORM）
    └── redis_{entity}.go           # Redis Cache（按需）
```

### 4.3 核心编码约束

- **ctx 透传到底**：Service → Logic → Repo，全程透传
- **业务错误放 rsp，系统错误放 error**：不混用
- **Handler 无状态**：只存共享资源，不存请求级变量
- **GORM 始终 WithContext(ctx)**：支持 TraceID 透传
- **Redis TTL 必须设置**：防止内存泄漏

> 完整铁律清单见 Phase 6 后的「代码质量铁律」表。

---

## Phase 4b — Kafka（可选能力）[按需触发]

> 仅当 Phase 2 判定使用 Kafka 时触发。规范依据知识库 #36。

- Producer：`Send(ctx, key, event)` 接口，单例复用
- Consumer：`Handle` 方法**必须始终返回 nil**（防无限重试）
- 死信队列：消费失败发送 DLQ

---

## Phase 5 — 单元测试生成 [低自由度]

- 框架：`testify/assert + require`
- Mock：`gomock`
- 风格：`table-driven tests`
- 覆盖：正常路径 + 错误路径 + 边界条件

> 完整模板参见 [references/code-templates.md](references/code-templates.md) TPL-10。

---

## Phase 6 — 质量验证 [低自由度·强制·Go原生工具链]

> 验证清单详见 [references/quality-checklist.md](references/quality-checklist.md)。

### 6.1 验证步骤（按序执行）

```
Step 1: golangci-lint run ./...     ← 静态分析 + 代码规范
Step 2: go vet ./...                ← Go 官方静态分析
Step 3: go build ./...              ← 编译检查
Step 4: go test -race -cover ./...  ← 单元测试 + 竞态检测
```

### 6.2 验证通过标准

```
□ golangci-lint: 0 errors, 0 warnings
□ go vet: 0 errors
□ go build: 编译成功
□ go test: 全部 PASS，覆盖率 ≥ 80%
□ go test -race: 无竞态条件
```

### 6.3 验证失败处理

```
失败 → 分析原因 → 修复 → 重新验证（最多 3 次）
3次仍失败 → 输出差异分析，让用户决策
```

> 完成播报：`"✅ Phase 6 全量验证通过"` — 0 错误才能交付。

---

## 代码质量铁律（生成时即遵守，不可事后补救）

| #   | 铁律                                 | 说明                                                    |
| --- | ------------------------------------ | ------------------------------------------------------- |
| 1   | **ctx 透传到底**                     | Handler → Logic → Repo，全程透传                        |
| 2   | **业务错误放 rsp，系统错误放 error** | 不混用，不把业务错误通过 error 返回                     |
| 3   | **Handler 无状态**                   | 只存共享资源，不存请求级变量                            |
| 4   | **层间 interface 通信**              | Service 依赖 Logic interface，Logic 依赖 Repo interface |
| 5   | **异步 goroutine 用新 ctx**          | 不用请求级 ctx，用 trpc.Go 或 context.Background()      |
| 6   | **DSN 必带 interpolateParams=true**  | 防止主从 Prepare 不同步                                 |
| 7   | **GORM 始终 WithContext(ctx)**       | 支持 TraceID 透传                                       |
| 8   | **事务闭包内只用 tx**                | 用外部 client 则事务不生效                              |
| 9   | **Redis TTL 必须设置**               | 防止内存泄漏                                            |
| 10  | **分布式锁 Lua 脚本原子释放**        | GET + DEL 非原子，可能误删                              |
| 11  | **Kafka Consumer 永远返回 nil**      | 返回 error 会无限重试卡死分区                           |
| 12  | **序列化默认 Protobuf**              | 内部服务 Protobuf，对外 HTTP 才用 JSON                  |

---

## 错误处理

| 场景                     | 处理方式                                      |
| ------------------------ | --------------------------------------------- |
| 缺少 DDL                 | 走路径 A/E → 主动委派 `mysql-schema-design`   |
| 缺少并发/规模数据        | 按 L2（标准级）保守设计，标注假设             |
| 既有代码结构不符合规范   | 按规范生成新代码，标注差异点让用户决策        |
| golangci-lint 未安装     | 跳过 lint，执行 go vet + go build 兜底，标注  |
| go test 失败             | 分析原因，最多修复 3 次，仍失败则输出差异分析 |
| mysql-schema-design 报错 | 将错误原样上报用户，附上建议修复方向          |

---

## 参考资料

| 文件                              | 内容                     | 加载时机           |
| --------------------------------- | ------------------------ | ------------------ |
| `references/decision-matrix.md`   | 6维度评估矩阵（详细版）  | Phase 2 评估时     |
| `references/tech-stack-guide.md`  | 技术选型详细指南         | Phase 2 选型时     |
| `references/code-templates.md`    | 完整代码模板（全部场景） | Phase 3/4/5 生成时 |
| `references/quality-checklist.md` | 生产级质量验证清单       | Phase 6 验证时     |

**知识库映射：**

| 生成物          | 引用的规范                                              |
| --------------- | ------------------------------------------------------- |
| Proto 文件      | #33 Proto编写规范                                       |
| Service 层      | #01 Handler黄金法则 + #02 错误码体系 + #04 目录结构     |
| Logic 层        | #03 Context生命周期 + #08 工厂注册表                    |
| Repo 层 (MySQL) | #31 GORM操作规范 + #37 多数据库接入                     |
| Repo 层 (Redis) | #32 Redis缓存规范                                       |
| Repo 层 (Kafka) | #36 Kafka生产消费规范                                   |
| Filter 链       | #07 Filter洋葱模型 + #22 鉴权认证 + #34 ValidationV3    |
| 配置管理        | #14 配置驱动 + #27 环境隔离                             |
| 测试代码        | #24 单测Mock + #25 集成测试                             |
| 序列化选型      | #40 序列化压缩选型                                      |
| 可靠性          | #15 优雅关闭 + #16 熔断器 + #17 超时重试 + #18 健康检查 |
| 性能优化        | #19 连接池 + #20 协程池 + #21 序列化管线                |
