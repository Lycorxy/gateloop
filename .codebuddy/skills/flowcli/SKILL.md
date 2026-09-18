---
name: flowcli
description: >
  使用 flowcli 解决流水线与 Git 工蜂开发问题：流水线的创建、更新、同步、启动（发布测试/预发），
  以及 gitflow 的版本分支、MR、Tag、代码回退、快照备份、SSH 配置、差异对比与冲突解决。
  当用户说 创建流水线、发布测试环境、启动流水线、更新流水线参数、同步流水线配置、创建版本、
  创建 MR、打 tag、回退代码、备份代码、配置 SSH、对比/解决冲突、安装 flowcli、检查环境
  等时使用。不要用于与 flowcli 无关的普通 git 问题（直接用原生 git 命令即可）、
  不用于 CI/CD 平台界面操作咨询、不用于生产环境发布（工具禁止）。
version: 1.2.0
dependencies: []
conflict-with: []
allowed-tools: [read_file, search_content, execute_command]
max-token: 1500
---

# flowcli：流水线 + Git 工蜂操作手册

## 1. 概述

以执行命令为主：**Step 0 环境检测 → 查 `references/` 定场景 → 对话内简短播报方案 → 逐步执行命令 → 每步验收**。不生成任何方案/报告文件，输出只讲重点。

> 分工：本 skill 是 git/流水线命令的**能力底座**——被 code-env（环境检测流程）等流程 skill 编排时，其 flowcli/gitflow 命令与环境安装（Step 0）以本 skill 为准；任何流程需要 flowcli/git/流水线命令，先查本 skill 的指南再执行。

## 2. 何时使用 / 何时不使用

**使用**：流水线管理、gitflow 工蜂协作、flowcli 环境检测与安装场景。

**不使用**：纯原生 git 问题、非工蜂平台、生产环境发布。

## 3. 🛑 入口守卫

```
Step 0 环境检测不通过（未安装且安装失败），禁止执行任何业务命令。
任何 flowcli/gitflow 命令执行前，必须先查 references 对应指南确认语法与前置条件，禁止凭记忆拼命令。
每步验收不通过禁止进入下一步。危险操作未获用户确认禁止执行。
```

## 4. 核心工作流

### Step 0：环境检测（每次任务开始前必做）

1. 检测 flowcli 可用性：执行 `flowcli --version`
   - 输出版本号 → 播报 `✓ flowcli <版本>`，确定**执行前缀** `$` = `flowcli`，进入 Step 1
   - 命令不存在（command not found）→ 转安装流程（见下）
2. **安装流程**（未安装时，询问用户选全局或局部，默认推荐全局）：

   | 方式 | 命令 | 适用 |
   |---|---|---|
   | 全局安装（推荐） | `npm install -g @tencent/flowcli` | 日常使用，任意目录可用 |
   | 局部安装 | `pnpm add @tencent/flowcli`，用 `npx flowcli ...` 执行 | 项目内使用，不污染全局 |
   | 源码仓执行 | `node bin/main.cjs <命令>`（在 flowcli 仓库根目录） | 开发调试 flowcli 本身 |

3. 安装后复测 `flowcli --version`：成功 → 前缀 = `flowcli`（局部安装为 `npx flowcli`）；仍失败 → 检查 PATH / node 版本，报告用户，**禁止继续**
4. 辅助检测（流水线/gitflow 任务需要）：
   - `node -v` ≥ 18
   - `git rev-parse --is-inside-work-tree` → 当前目录是 Git 仓库（流水线命令还需 origin 远程）
   - gitflow MR/SSH 远程操作需 token：`$ gitflow mr verify-token`
5. 后续所有命令统一用确定的执行前缀（下文以 `flowcli` 表示）

### Step 1：诊断意图

1. 识别场景关键词，路由到指南：

   | 问题域 | 查阅 |
   |---|---|
   | 环境检测/安装/升级 | `references/environment.md` |
   | 流水线：创建/更新/同步/启动/发布/通知/token | `references/pipeline-guide.md` |
   | gitflow：版本/MR/tag/回退/备份/SSH/diff/冲突/分支/推送拉取 | `references/gitflow-guide.md` |

2. 在指南中定位场景流程（前置条件 → 命令序列 → 每步验收点）。

### Step 2：播报方案（对话内，≤5 行）

格式：`场景名 | 步骤数 | 危险操作标注`，例：

```
场景 B 发布测试（API 模式）| 3 步 | 无危险操作
1. flowcli start -e testing（自动同步 master → 启动 → 轮询）
```

用户认可后进入 Step 3。简单任务可直接执行，方案一句话带过。

### Step 3：逐步执行与验收

对每条命令循环：

1. 播报 `[n/N] <命令>`（一句话目的）
2. 执行
3. **验收**：exit code = 0 且输出含指南"验收点"列明的成功标志 → 播报 `✓ <关键结果>` 继续；否则**失败即停**，报告原因 + 2-3 个可选下一步
4. 危险操作（强推/删除/回退）先向用户复述影响，确认后执行

完成后做终验：目标达成（结论带命令输出证据）+ `flowcli gitflow status` 确认无意外副作用，一段话交付。

## 5. 中断与恢复

失败或用户中止后重新触发时：凭对话历史确认已完成步骤，从断点下一步继续；环境已变化（如分支切换）则从 Step 1 重新诊断。git 操作失误的兜底回退见 `references/gitflow-guide.md` 回退章节。

## 6. 错误处理

| 错误 | 处置 |
|---|---|
| `flowcli: command not found` | Step 0 安装流程（全局/局部/源码三选一） |
| token 无效 / 190002 无权限 | `flowcli auth set` 重设 token |
| 流水线不存在 | 先 `flowcli create` |
| 合并冲突 | 自动中止合并；按 gitflow-guide「冲突解决」处理 |
| 命令语法不确定 | 回查 references，禁止猜 |
| Windows 中文乱码 | 提交信息/MR 标题用 `-F` 文件方式传 UTF-8 内容 |

## 7. 验证清单（对话内核对，不落盘）

- [ ] Step 0 环境检测已通过（版本已播报）
- [ ] 场景与指南匹配（非臆造流程）
- [ ] 每条命令语法与 references 一致（可用 `node scripts/check-commands.cjs` 自检，仅 flowcli 源码仓内有效，其他环境自动 SKIP）
- [ ] 每步已验收（exit code / 关键输出）
- [ ] 危险操作均已获用户确认
- [ ] 结论带证据，无未声明副作用

## 8. 参考资料

- `references/environment.md` — 环境检测、安装（全局/局部/源码）、升级与常见环境问题
- `references/pipeline-guide.md` — 流水线命令 + 场景流程 + 验收点
- `references/gitflow-guide.md` — gitflow 命令 + 场景流程 + 回退/备份/冲突
- `references/floor-ceiling-guide.md` — 命令验收与理解判断分工
- `scripts/check-commands.cjs` — 文档命令与 src 注册命令一致性自检（exit 0 = 一致；非源码仓环境自动 SKIP）
