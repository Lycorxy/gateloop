---
name: aivn-manager
description: >
    AI 会话代码版本管理器。记录、查看、回滚、对比模型产生的代码变更。
    当用户说 保存版本、记录一下、看看改了什么、回滚/恢复代码、对比版本、
    会话管理、版本历史、快照、创建会话、切换会话 时使用。
    不要用于纯 git 操作（add/commit/push）、代码格式化、ESLint 错误修复。
version: 6.0.0
dependencies: []
conflict-with: []
allowed-tools: [execute_command, read_file, write_to_file]
max-token: 800
---

# aivn — 命令执行手册

**行为准则**：匹配意图 → 打印步骤 → 输出命令 → 执行 → 输出结果。不分析、不解释、不说废话。

## 🛑 入口守卫

```
本 Skill 被加载后，必须按顺序执行全部步骤。
如需跳过任一步骤，必须逐条给出充足理由：①为什么可跳过 ②跳过不影响结果。
禁止用一条理由批量跳过多个步骤，禁止无声跳过。
```

## 前置

```bash
npm run build  # 构建失败则停止
```

## 🔒 强制步骤：初始化检测（不可跳过）

**每次执行任何 aivn 命令前，必须先检测初始化状态。未初始化则自动执行 init。**

```
检测条件：项目根目录下不存在 .aivnsions/ 目录
  ├─ 不存在 → 必须执行初始化（步骤如下）
  └─ 已存在 → 跳过，继续执行用户请求的命令

⏭️ [跳过] 初始化检测
理由：.aivnsions/ 目录已存在
风险：无
```

### 初始化步骤（未初始化时必须按序执行）

```
步骤 1/3：执行 aivn init
  → npx nut-aivn init

步骤 2/3：部署 CodeBuddy Hooks（🔒 强制 · 不可跳过）
  → 检测 .codebuddy/hooks/ 下是否存在 aivn-init.cjs 和 aivn-record.cjs
  → 不存在或内容不一致 → 从 skill 的 references/templates/ 复制到 .codebuddy/hooks/
  → 已存在且一致 → 跳过

步骤 3/3：确认 .gitignore
  → 检测 .gitignore 是否包含 .aivnsions/
  → 不包含 → 追加
  → 已包含 → 跳过
```

**⚠️ 步骤 2 不可跳过声明**：Hooks 是 aivn 自动记录的必要条件。
若模型认为可跳过，必须输出：

```
⏭️ [跳过] 步骤 2 — 部署 Hooks
理由：{具体理由，如"用户明确要求不部署 hooks"}
风险：{aivn 将无法自动记录每次对话的代码变更}
```

**禁止无声跳过——任何未声明理由的跳过 = 违规。**

### Hooks 部署命令

```bash
# 检测 hooks 目录
if not exist ".codebuddy\hooks" mkdir ".codebuddy\hooks"

# 复制模板（覆盖以确保最新版本）
# 模板源：.codebuddy/skills/aivn-manager/references/templates/
copy /Y ".codebuddy\skills\aivn-manager\references\templates\aivn-init.cjs" ".codebuddy\hooks\aivn-init.cjs"
copy /Y ".codebuddy\skills\aivn-manager\references\templates\aivn-record.cjs" ".codebuddy\hooks\aivn-record.cjs"
```

## 命令

| 用户意图   | 命令                                                  |
| ---------- | ----------------------------------------------------- |
| 初始化     | `npx nut-aivn init` + 部署 Hooks + 配置 gitignore     |
| 保存快照   | `npx nut-aivn save -q "问题" -s "方案"`               |
| 查看历史   | `npx nut-aivn log [--limit N]`                        |
| 回滚全部   | `npx nut-aivn restore <版本ID>`                       |
| 回滚单文件 | `npx nut-aivn restore <版本ID> --file <路径>`         |
| 对比差异   | `npx nut-aivn diff [版本ID]`                          |
| 对比两版本 | `npx nut-aivn diff <ID1> <ID2>`                       |
| 会话列表   | `npx nut-aivn session list`                           |
| 创建会话   | `npx nut-aivn session create <名称>`                  |
| 切换会话   | `npx nut-aivn session use <名称>`                     |
| 当前会话   | `npx nut-aivn session show`                           |
| 删除版本   | `npx nut-aivn drop <版本ID>`                          |
| 清理过期   | `npx nut-aivn clean [--days N] [--dry-run]`           |
| 统计信息   | `npx nut-aivn stats`                                  |
| 垃圾回收   | `npx nut-aivn gc`                                     |
| 部署 Hooks | 从 `references/templates/` 复制到 `.codebuddy/hooks/` |

## 执行模板（每次必须按此格式）

```
🔄 [开始] {用户意图}，执行 npx nut-aivn {子命令} ...

$ npx nut-aivn {子命令} {参数}

{命令输出}

✅ [完成] {一句话结果}
```

## Hooks 说明

| Hook 文件         | 触发事件         | 功能                       |
| ----------------- | ---------------- | -------------------------- |
| `aivn-init.cjs`   | SessionStart     | 自动检测并初始化 aivn      |
| `aivn-record.cjs` | UserPromptSubmit | 自动记录每轮对话的代码变更 |

模板唯一源：`.codebuddy/skills/aivn-manager/references/templates/`
部署目标：`.codebuddy/hooks/`
