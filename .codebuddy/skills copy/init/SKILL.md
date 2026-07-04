---
name: init
description: 对话初始化。每次新对话开始时第一个执行，自动完成 MCP 项目切换、环境检查、上下文预热、任务队列恢复，确保所有工具指向正确项目目录。
---

# Skill：对话初始化（init）

> 每次新对话的第一步，30 秒内完成所有前期准备。
> 核心目标：**让 AI 在第一句话之前就已经知道"我在哪个项目、项目状态如何、有没有未完成的任务"。**

---

## 触发时机

```
✅ 每次新对话开始时（无论用户说什么，init 都是第一步）
✅ 用户说 /init 或 "初始化" 时
✅ 用户切换项目时（"我现在要做 xxx 项目"）
❌ 不在任务执行中途触发（避免打断流程）
```

---

## 执行步骤（并行优先，总耗时 < 5 秒）

### Step 1：项目切换（🔒 最高优先级）

```
目标：确保所有 MCP 工具指向正确的项目目录

1.1 调用 sf_current_project()
    → 获取当前活跃项目信息

1.2 判断是否需要切换：
    - 当前项目 = 目标项目 → 跳过切换，播报 "✅ 项目已就绪"
    - 当前项目 ≠ 目标项目 → 执行切换

1.3 切换（如需要）：
    调用 sf_switch_project({ project: "<目标项目绝对路径>" })
    → 切换成功后，5 个 MCP 子模块全部指向新项目
    → 知识库/记忆/图谱缓存自动重置

1.4 首次使用新项目时：
    调用 sf_register_project({ rootPath: "<路径>", description: "<项目描述>" })
    → 注册到 ~/.specflow/projects.json

播报：
  🔄 项目：{项目名} ({项目路径})
  来源：{sf_switch_project 切换 | 已是当前项目}
```

### Step 2：MCP 健康检查（并行执行）

```
同时调用以下工具，验证各模块可用性：

2.1 knowledge_status()
    → 检查知识库是否已初始化
    → 未初始化 → 播报警告，提示用户执行 init_knowledge

2.2 graph_status()
    → 检查图谱是否已初始化
    → 未初始化 → 播报警告

2.3 memory_stats()
    → 获取记忆系统统计（记忆条数/健康分）

播报：
  📊 MCP 状态：
    知识库：{已就绪 N 个库 | ⚠️ 未初始化}
    图谱：{已就绪 N 个实体 | ⚠️ 未初始化}
    记忆：{N 条记忆，健康分 S}
```

### Step 3：任务队列检查

```
读取 .specflow/context/task-queue.json

3.1 文件不存在 / 为空 → 播报 "无进行中任务，等待用户指令"

3.2 存在未完成任务（status != "done"）→ 播报：
    ⚠️ 发现未完成任务：
      当前任务：{task.id} - {task.skill}（{task.status}）
      剩余任务：{N} 个
    → 提示用户：输入 /resume 继续，或描述新需求开始新任务

3.3 所有任务已完成 → 播报 "上次迭代已完成，等待新需求"
```

### Step 4：上下文预热（按需）

```
仅当存在未完成任务时执行：

4.1 读取 .specflow/context/current.json
    → 了解当前迭代的需求和进度

4.2 调用 context_build(
      taskType: "resume",
      query: "当前任务 {task.skill} 上下文恢复",
      projectId: "{项目ID}"
    )
    → 注入 L1 约束 + L3 记忆 + L5 项目摘要

播报：
  🧠 上下文预热完成：L1约束={X}条，记忆={N}条
```

---

## 🚀 CLI 优先原则（新增）

> ⚠️ **核心问题**：MCP 在 IDE 中经常初始化失败/超时，导致模型无法验证知识库/图谱/记忆系统的状态。
> **解决方案**：让模型知道 **CLI 是更可靠的选择**。

### CLI vs MCP 决策树

```
遇到以下场景时，优先用 CLI（直接调用 node CLI 命令），而不是 MCP 工具：

✅ 场景 1：验证知识库/图谱/记忆系统是否正常工作
  → 用 CLI：node packages/cli/dist/index.cjs knowledge status
  → 原因：MCP 可能未初始化，CLI 直接调用引擎，不依赖 IDE

✅ 场景 2：确定性的脚本化操作（ init / status / validate）
  → 用 CLI：node packages/cli/dist/index.cjs {command}
  → 原因：CLI 无模型幻觉，执行结果确定

✅ 场景 3：需要快速验证"某个功能是否可用"
  → 用 CLI：直接调用，秒级返回
  → 原因：MCP 需要等待模型决策，CLI 直接执行

✅ 场景 4：MCP 工具调用失败/超时时
  → 降级到 CLI：用 terminal 工具执行 CLI 命令
  → 原因：CLI 是 MCP 的备用通道

❌ 场景（不适合 CLI）：
  → 需要模型理解上下文的复杂任务（如需求分析、代码生成）
  → 需要多轮对话的任务（如需求澄清）
```

### CLI 可用命令清单

```bash
# 知识库
node packages/cli/dist/index.cjs knowledge status          # 查看知识库状态
node packages/cli/dist/index.cjs knowledge init           # 初始化知识库
node packages/cli/dist/index.cjs knowledge search "查询"  # 搜索知识库

# 图谱
node packages/cli/dist/index.cjs graph status             # 查看图谱状态
node packages/cli/dist/index.cjs graph summary           # 查看图谱摘要

# 记忆
node packages/cli/dist/index.cjs memory stats            # 查看记忆统计
node packages/cli/dist/index.cjs memory list             # 列出所有记忆

# 项目
node packages/cli/dist/index.cjs project current         # 查看当前项目
node packages/cli/dist/index.cjs project switch <path>  # 切换项目
```

### 注入到模型上下文的方式

```
在 Step 2（MCP 健康检查）之后，增加 Step 2.5（CLI 可用性检查）：

2.5 检查 CLI 是否可用（作为 MCP 的备用方案）
    → 执行：node packages/cli/dist/index.cjs --version
    → 如果成功：播报 "✅ CLI 可用，MCP 失败时可降级使用"
    → 如果失败：播报 "⚠️ CLI 不可用，请先构建：pnpm build:cli"
```

---

## 完成播报格式

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 初始化完成 | {项目名}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 项目路径：{rootPath}
📊 知识库：{状态} | 图谱：{状态} | 记忆：{N}条
📋 任务队列：{无任务 | 有未完成任务 N 个}
{如有未完成任务}
  ⚠️ 上次中断于：{task.id} - {task.skill}
  → 输入 /resume 继续，或描述新需求
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 异常处理

```
MCP 工具调用失败：
  → 播报具体错误，提示用户重启 MCP 服务
  → 不阻断后续步骤，继续执行能执行的部分

项目路径不存在：
  → 播报 "⚠️ 项目路径不存在: {path}"
  → 提示用户确认路径或重新注册项目

知识库未初始化：
  → 播报 "⚠️ 知识库未初始化，建议执行：init_knowledge()"
  → 不阻断，继续初始化其他模块
```

---

## 工具调用顺序

```
Step 1（串行，最高优先级）：
  sf_current_project → [sf_switch_project] → [sf_register_project]

Step 2+3（并行）：
  knowledge_status + graph_status + memory_stats + 读取 task-queue.json

Step 4（条件执行，仅有未完成任务时）：
  读取 current.json → context_build
```

---

## 文件隔离

```
只读：.specflow/context/task-queue.json, .specflow/context/current.json
禁写：所有代码文件和配置文件
状态写入：~/.specflow/projects.json（通过 MCP 工具写入，不直接操作）
```
