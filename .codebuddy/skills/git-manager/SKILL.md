---
name: git-manager
description: >
  Git 操作全功能封装：暂存、提交、快照回退、操作行为日志、撤销、差异对比、分支管理、
  rebase、stash、换行符修复、项目配置生成、分支策略（feature/hotfix/tag/MR/合并到test）、
  SSH 一键配置与多帐号。当用户说 git add、git commit、暂存、提交、回退代码、撤销操作、
  查看差异、切换分支、stash、修复换行符、配置 SSH、创建分支、打 tag、创建 MR、
  合并到 test、rebase、查看操作历史、安全网 时使用。
  不要用于 AI 会话版本管理（使用 aivn-manager）、纯代码质量检查（使用 code-quality-guard）。
version: 3.0.0
dependencies: []
conflict-with: []
allowed-tools: [execute_command, read_file, search_content]
max-token: 2000
---

# Git 操作管理器 — 命令执行手册

> **原则**：解析用户意图 → 匹配 `npx nut git` 命令 → 直接执行 → 展示结果。遇错再排查。

## 🛑 入口守卫

```
本 Skill 为命令执行手册，需严格按操作流程执行。
1. 确认当前目录是 Git 仓库（非 Git 仓库时提示 git init）
2. 确认 CLI 已构建（dist/cli/index.cjs 存在，否则先 npm run build）
3. 破坏性操作（rollback / branch -D / flow delete）执行前向用户确认
4. 始终使用 npx nut git 命令（内含自动快照+行为日志+安全网），不直接用 git 原生命令
```

## 前置条件

```bash
# 首次使用前构建 CLI
npm run build
```

## 命令速查

### 📋 状态与日志

| 意图 | 命令 |
|------|------|
| 查看工作区状态 | `npx nut git status` |
| 查看提交日志 | `npx nut git log [-n <数量>]` |

### 📦 暂存与提交

| 意图 | 命令 |
|------|------|
| 暂存所有文件 | `npx nut git stage --all` |
| 暂存指定文件 | `npx nut git stage --files "a.ts,b.ts"` |
| 暂存并修复换行符 | `npx nut git stage --fix-lf` |
| 取消暂存 | `npx nut git unstage [文件...]` |
| 提交代码 | `npx nut git commit -m "信息"` |
| 提交所有已跟踪文件 | `npx nut git commit -m "信息" --all` |
| 修改上一次提交 | `npx nut git commit -m "信息" --amend` |
| 跳过 hook 提交 | `npx nut git commit -m "信息" --no-verify` |

> **注意**：`commit --all` 只暂存**已跟踪**文件的改动，新增文件需先 `npx nut git stage --all`

### ⏪ 快照、行为日志与回退

| 意图 | 命令 |
|------|------|
| 查看快照列表 | `npx nut git snapshots` |
| 创建手动快照 | `npx nut git snapshot -d "描述" [--tag release]` |
| 查看操作行为日志 | `npx nut git activity` |
| 撤销上一步操作 | `npx nut git undo` |
| 回退到指定快照 | `npx nut git rollback --to <索引>` |
| 回退到上一个快照 | `npx nut git rollback --prev` |
| 回退到第一个快照 | `npx nut git rollback --first` |
| 回退到指定操作前 | `npx nut git rollback --action <序号\|ID>` |
| 还原单个文件 | `npx nut git revert <文件路径>` |

### 🔍 差异与历史

| 意图 | 命令 |
|------|------|
| 工作区差异 | `npx nut git diff` |
| 暂存区差异 | `npx nut git diff --staged` |
| 单文件差异 | `npx nut git diff-file <路径>` |
| 分支对比 | `npx nut git diff-branch <A> <B>` |
| 文件提交历史 | `npx nut git history <路径>` |

### 🌿 分支管理

| 意图 | 命令 |
|------|------|
| 列出本地分支 | `npx nut git branch` |
| 列出所有分支（含远程） | `npx nut git branch -a` |
| 创建并切换分支 | `npx nut git branch -c <名称>` |
| 切换分支 | `npx nut git checkout <名称>` |
| 删除分支 | `npx nut git branch -d <名称>` |
| 强制删除分支 | `npx nut git branch -D <名称>` |

### 🔄 Rebase

| 意图 | 命令 |
|------|------|
| rebase 到 master | `npx nut git rebase` |
| rebase 到指定分支 | `npx nut git rebase --onto <分支>` |
| rebase 指定分支到目标 | `npx nut git rebase --branch <分支> --onto <目标>` |

### 📎 Stash

| 意图 | 命令 |
|------|------|
| 暂存工作区 | `npx nut git stash [描述]` |
| 恢复 stash | `npx nut git stash-pop` |
| 查看 stash 列表 | `npx nut git stash-list` |

### 📝 换行符

| 意图 | 命令 |
|------|------|
| 检测换行符 | `npx nut git lf` |
| 修复为 LF | `npx nut git lf --fix` |
| 修复为 CRLF | `npx nut git lf --crlf --fix` |
| 配置 .gitattributes | `npx nut git lf --setup` |
| 配置为 CRLF | `npx nut git lf --crlf --setup` |

### ⚙️ 项目配置

| 意图 | 命令 |
|------|------|
| 生成 Git 配置 | `npx nut git config init [--force] [--crlf]` |
| 仅 .gitignore | `npx nut git config gitignore` |
| 仅 .editorconfig | `npx nut git config editorconfig [--crlf]` |

### 🚀 分支策略（flow）

| 意图 | 命令 |
|------|------|
| 创建 feature 分支 | `npx nut git flow create --type feature [--version <x.y.z>] [--tag] [--mr] [--desc <描述>]` |
| 创建 hotfix 分支 | `npx nut git flow create --type hotfix [--version <x.y.z>] [--tag] [--mr] [--desc <描述>]` |
| 打 tag | `npx nut git flow tag [--version <x.y.z>] [--message <说明>]` |
| 创建 MR | `npx nut git flow mr [--source <分支>] [--target <分支>] [--title <标题>]` |
| 合并到 test 并推送 | `npx nut git flow merge [--source <分支>]` |
| 预览合并到 test | `npx nut git flow preview [--source <分支>]` |
| 删除 feature/hotfix 分支 | `npx nut git flow delete [--branch <分支>]` |
| 列出分支 + tags | `npx nut git flow list` |

### 🔑 SSH 配置

| 意图 | 命令 |
|------|------|
| 一键配置 SSH | `npx nut git ssh setup [平台]` |
| 配置腾讯工蜂 | `npx nut git ssh setup gitcode [--token xxx]` |
| 多帐号配置 | `npx nut git ssh multi --platform <平台> --accounts "name:email,name:email"` |
| 诊断 SSH 问题 | `npx nut git ssh troubleshoot [--host <主机>]` |
| 查看 SSH 状态 | `npx nut git ssh status` |
| 查看公钥 | `npx nut git ssh key [平台]` |

> 详细参数说明见 references/cli-reference.md

## 执行规则

1. **直接执行**：根据意图匹配命令，调 `execute_command` 执行
2. **展示结果**：简要展示命令输出
3. **出错再查**：只命令报错时才排查，不要预先分析
4. **破坏性操作确认**：rollback / branch -D / flow delete 执行前向用户确认

## 自动备份与安全机制

`npx nut git` 在关键操作前**自动创建快照**并**记录行为日志**：

- **自动快照**：commit / push / rebase / merge / mergeToTest / createMR 等操作前自动打快照
- **行为日志**：每次关键操作记录一条「行为 + 快照锚点」，存于 `.git/nut-snapshots/activity-log.json`
- **回退前再备份**：rollback / undo 执行前会再打一份当前状态快照，回退错了还能再退回来
- **保留未跟踪文件**：回退时不 `git clean`，不误删用户新建但未提交的文件
- **失败也记录**：操作失败也会记录（标 `✗`），能看到哪一步出问题

## 中断与恢复

- **操作中断**：用 `npx nut git activity` 查看行为日志，确认最后一步操作状态
- **回退中断**：用 `npx nut git snapshots` 查看快照列表，用 `npx nut git rollback --to <N>` 手动回退
- **冲突中断**：rebase/merge 冲突时，用 `git rebase --abort` 或 `git merge --abort` 退出冲突状态，然后用 `npx nut git undo` 回退到操作前

## 常见错误

| 错误 | 处理 |
|------|------|
| 不在 Git 仓库 | 提示用户先 `git init` |
| CLI 未构建 | `npm run build` 后重试 |
| 快照不存在 | `npx nut git snapshots` 确认可用快照 |
| 无暂存文件 | 提示用 `--all` 或先 `npx nut git stage` |
| commit --all 不含新文件 | 新增文件需先 `npx nut git stage --all`（--all 只暂存已跟踪文件改动） |
| rebase 冲突 | 自动中止 + 记录快照，用 `npx nut git undo` 回退 |
| flow merge 无远程 | 确认 origin 已配置：`git remote add origin <url>` |
| SSH 密钥已存在 | 工具会跳过生成，直接使用已有密钥 |
| 行为日志无快照 | 纯远程操作（如 MR）无本地快照，需手动处理 |

## 验证清单

- [ ] 命令前缀为 `npx nut git`（非 `npx nut-git`）
- [ ] 首次使用前已 `npm run build`
- [ ] 破坏性操作已向用户确认
- [ ] 关键操作后告知用户可用 `undo` / `rollback --action` 回退
