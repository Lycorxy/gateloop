---
name: git-manager
description: >
    Git 操作封装：暂存、提交、回退（基于快照）、差异对比、分支管理、Stash、
    换行符修复、SSH 一键配置。当用户说 git add、git commit、暂存、提交、
    回退代码、查看差异、切换分支、stash、修复换行符、配置 SSH 时使用。
    不要用于 AI 会话版本管理（使用 aivn-manager）、纯代码质量检查（使用 eslint-code-quality）。
version: 2.0.0
dependencies: []
conflict-with: []
allowed-tools: [execute_command]
max-token: 1000
---

# Git 操作管理器 — 命令执行手册

> **原则**：分析用户意图 → 匹配命令 → 直接执行。不出错不多说，遇错再排查。

## 前置条件

```bash
npm run build
```

执行前确认当前目录是 Git 仓库。

## 命令速查

| 用户意图            | 执行命令                                |
| ------------------- | --------------------------------------- |
| 查看工作区状态      | `npx nut-git status`                    |
| 暂存所有文件        | `npx nut-git stage --all`               |
| 暂存指定文件        | `npx nut-git stage --files "a.ts,b.ts"` |
| 暂存并修复换行符    | `npx nut-git stage --fix-lf`            |
| 取消暂存            | `npx nut-git unstage [文件...]`         |
| 提交代码            | `npx nut-git commit -m "信息"`          |
| 提交所有已跟踪文件  | `npx nut-git commit -m "信息" --all`    |
| 修改上一次提交      | `npx nut-git commit -m "信息" --amend`  |
| 查看提交日志        | `npx nut-git log [-n N]`                |
| 查看快照列表        | `npx nut-git snapshots`                 |
| 回退到上一个快照    | `npx nut-git rollback --prev`           |
| 回退到指定快照      | `npx nut-git rollback --to <索引>`      |
| 还原单个文件        | `npx nut-git revert <文件路径>`         |
| 查看工作区差异      | `npx nut-git diff`                      |
| 查看暂存区差异      | `npx nut-git diff --staged`             |
| 查看单文件差异      | `npx nut-git diff-file <路径>`          |
| 分支对比            | `npx nut-git diff-branch <A> <B>`       |
| 列出分支            | `npx nut-git branch`                    |
| 创建并切换分支      | `npx nut-git branch -c <名称>`          |
| 切换分支            | `npx nut-git checkout <名称>`           |
| 删除分支            | `npx nut-git branch -d <名称>`          |
| 暂存工作区          | `npx nut-git stash [描述]`              |
| 恢复最近 stash      | `npx nut-git stash-pop`                 |
| 查看 stash 列表     | `npx nut-git stash-list`                |
| 检测换行符          | `npx nut-git lf`                        |
| 修复为 LF           | `npx nut-git lf --fix`                  |
| 配置 .gitattributes | `npx nut-git lf --setup`                |
| 一键配置 SSH        | `npx nut-git ssh setup`                 |
| 查看 SSH 状态       | `npx nut-git ssh status`                |
| 显示公钥            | `npx nut-git ssh key`                   |

## 执行规则

1. **直接执行**：根据意图匹配上表命令，调 `execute_command` 执行
2. **展示结果**：简要展示命令输出
3. **出错再查**：只命令报错时才排查，不要预先分析

## 常见错误

| 错误          | 处理                                 |
| ------------- | ------------------------------------ |
| 不在 Git 仓库 | 提示用户先 `git init`                |
| CLI 未构建    | `npm run build` 后重试               |
| 快照不存在    | `npx nut-git snapshots` 确认可用快照 |
| 无暂存文件    | 提示提供文件列表或使用 `--all`       |
