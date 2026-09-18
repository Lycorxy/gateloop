# npx nut git CLI 完整参考

> 命令前缀：已全局安装用 `npx nut git`，项目内开发用 `node dist/cli/index.cjs git`。

## 目录

- [全局选项](#全局选项)
- [status](#status)
- [stage / add](#stage--add)
- [unstage / reset](#unstage--reset)
- [commit](#commit)
- [log](#log)
- [snapshots](#snapshots)
- [snapshot](#snapshot)
- [activity / oplog](#activity--oplog)
- [undo](#undo)
- [rollback / restore](#rollback--restore)
- [revert](#revert)
- [diff](#diff)
- [diff-file](#diff-file)
- [diff-branch](#diff-branch)
- [history](#history)
- [branch / branches](#branch--branches)
- [checkout / switch](#checkout--switch)
- [rebase](#rebase)
- [stash](#stash)
- [stash-pop](#stash-pop)
- [stash-list](#stash-list)
- [lf](#lf)
- [config](#config)
- [flow](#flow)
- [ssh](#ssh)

## 全局选项

| 参数 | 说明 |
|------|------|
| `--help, -h` | 显示帮助信息 |

---

## status

```
npx nut git status
```

查看工作区状态。输出分支名、文件状态（暂存区/工作区双字母）、统计摘要。

---

## stage / add

```
npx nut git stage --all
npx nut git stage --files "a.ts,b.ts"
npx nut git stage --fix-lf
npx nut git stage a.ts b.ts
```

| 参数 | 简写 | 说明 |
|------|------|------|
| `--all` | `-a` | 暂存所有文件 |
| `--files` | — | 逗号分隔的文件列表 |
| `--fix-lf` | — | 暂存前自动修复换行符 |

也可直接传位置参数作为文件路径：`npx nut git stage a.ts b.ts`

---

## unstage / reset

```
npx nut git unstage
npx nut git unstage a.ts b.ts
```

取消暂存指定文件，不传则取消所有。

---

## commit

```
npx nut git commit -m "提交信息"
npx nut git commit -m "提交信息" --amend
npx nut git commit -m "提交信息" --all
npx nut git commit -m "提交信息" --no-verify
```

| 参数 | 简写 | 说明 |
|------|------|------|
| `--message` | `-m` | 提交信息（必填） |
| `--amend` | — | 修改上一次提交 |
| `--all` | `-a` | 提交所有已跟踪文件（不含新增未跟踪文件） |
| `--no-verify` | — | 跳过 pre-commit hook |

**注意**：`--all` 只暂存已跟踪文件的改动。新增文件需先 `npx nut git stage --all`。

提交前会自动创建快照，可通过 `npx nut git undo` 撤销。

---

## log

```
npx nut git log
npx nut git log -n 50
```

| 参数 | 说明 |
|------|------|
| `-n <N>` | 显示数量，默认 20 |

---

## snapshots

```
npx nut git snapshots
```

列出所有快照，显示：索引、操作类型、描述、时间、分支、HEAD 提交、标签、当前标记。

---

## snapshot

```
npx nut git snapshot -d "描述"
npx nut git snapshot -d "发布前备份" --tag release
npx nut git snapshot "描述"
```

| 参数 | 简写 | 说明 |
|------|------|------|
| `--description` | `-d` | 快照描述 |
| `--tag` | — | 标签，多个用逗号分隔 |

---

## activity / oplog

```
npx nut git activity
```

查看操作行为日志。每次关键 Git 操作（commit / rebase / merge / flow merge / createMR 等）都会记录一条，包含：

- 序号 `#N`
- 状态（✓ 成功 / ✗ 失败）
- 操作类型
- 快照锚点（操作前自动创建的快照 ID）
- 描述、分支、时间
- 失败原因（如有）

输出末尾提示如何回退：`npx nut git undo` 或 `npx nut git rollback --action <序号>`

---

## undo

```
npx nut git undo
```

撤销上一步操作：回退到最近一次操作执行前的快照。

- 回退前会再打一份当前状态快照（可再退回来）
- 保留未跟踪文件（不误删）
- 若上一步是纯远程操作（如 MR）无本地快照，会提示无法本地回退

---

## rollback / restore

```
npx nut git rollback --to 3
npx nut git rollback --prev
npx nut git rollback --first
npx nut git rollback --action 5
npx nut git rollback --action 1dd06f14
```

| 参数 | 说明 |
|------|------|
| `--to <N>` | 回退到指定索引的快照 |
| `--prev` / `--previous` | 回退到上一个快照 |
| `--first` | 回退到第一个快照 |
| `--action <序号\|ID>` | 回退到指定操作步骤前的状态（序号来自 `activity`，或用快照 ID） |
| `--force` | 强制恢复（丢弃当前修改） |

不传参数时显示快照列表供选择。

**回退机制**：回退前自动打一份当前状态快照（`backupFirst: true`），回退错了还能再退回来。

---

## revert

```
npx nut git revert <文件路径>
```

还原单个文件到 HEAD 状态。

---

## diff

```
npx nut git diff                           # 工作区 vs 暂存区
npx nut git diff --staged                  # 暂存区 vs HEAD
```

| 参数 | 说明 |
|------|------|
| `--staged` / `--cached` | 查看暂存区差异 |

---

## diff-file

```
npx nut git diff-file <路径>
```

查看单个文件的工作区差异。

---

## diff-branch

```
npx nut git diff-branch <源分支> <目标分支>
```

比较两个分支。输出：

| 字段 | 说明 |
|------|------|
| 超前提交 | source 有但 target 没有的提交 |
| 落后提交 | target 有但 source 没有的提交 |
| 统计 | commitsAhead、commitsBehind、filesChanged、additions、deletions |

---

## history

```
npx nut git history <文件路径>
```

查看文件的提交历史。

---

## branch / branches

```
npx nut git branch                         # 列出本地分支
npx nut git branch -a                      # 列出所有分支（含远程）
npx nut git branch -c <名称>               # 创建并切换分支
npx nut git branch -d <名称>               # 删除分支
npx nut git branch -D <名称>               # 强制删除分支
```

| 参数 | 说明 |
|------|------|
| `--all, -a` | 包含远程分支 |
| `--create, -c` | 创建并切换到新分支 |
| `-d` | 删除分支 |
| `-D` | 强制删除分支 |

---

## checkout / switch

```
npx nut git checkout <分支名>
npx nut git switch <分支名>
```

切换分支。`checkout` 和 `switch` 等效。

---

## rebase

```
npx nut git rebase                           # 当前分支 rebase 到 master
npx nut git rebase --onto develop             # 当前分支 rebase 到 develop
npx nut git rebase --branch feature/x --onto master
```

| 参数 | 说明 |
|------|------|
| `--onto <分支>` | rebase 目标分支，默认 `master` |
| `--branch <分支>` | 要 rebase 的分支，默认当前分支 |

**冲突处理**：rebase 冲突时自动中止并记录快照，可用 `npx nut git undo` 回退到 rebase 前。

---

## stash

```
npx nut git stash
npx nut git stash "描述信息"
```

暂存当前工作区修改（含未跟踪文件）。

---

## stash-pop

```
npx nut git stash-pop
```

恢复最近的 stash 并删除。

---

## stash-list

```
npx nut git stash-list
```

列出所有 stash。

---

## lf

```
npx nut git lf                             # 检测换行符
npx nut git lf --fix                       # 修复为 LF
npx nut git lf --crlf --fix                # 修复为 CRLF
npx nut git lf --setup                     # 配置 .gitattributes (LF)
npx nut git lf --crlf --setup              # 配置 .gitattributes (CRLF)
```

| 参数 | 简写 | 说明 |
|------|------|------|
| `--fix` | `-f` | 修复换行符 |
| `--crlf` | — | 目标为 CRLF（默认 LF） |
| `--setup` | — | 生成/更新 .gitattributes |

### lf 输出字段

| 字段 | 说明 |
|------|------|
| total | 扫描总文件数 |
| lf | LF 文件数 |
| crlf | CRLF 文件数 |
| mixed | 混合换行符文件数 |
| expected | 期望换行符类型 |
| mismatched | 不匹配文件列表（含路径、当前值、期望值） |

---

## config

```
npx nut git config init                    # 生成/完善 .gitattributes + .gitignore + .editorconfig
npx nut git config init --force            # 覆盖重写
npx nut git config init --crlf             # 使用 CRLF
npx nut git config gitignore               # 仅生成/完善 .gitignore
npx nut git config editorconfig            # 仅生成/完善 .editorconfig
npx nut git config editorconfig --crlf     # .editorconfig 使用 CRLF
```

| 参数 | 说明 |
|------|------|
| `--force` | 已存在时覆盖重写（默认仅追加缺失项） |
| `--crlf` | 目标换行符为 CRLF（默认 LF） |

子命令：`init`（默认）、`gitignore`、`editorconfig`

---

## flow

分支策略命令，管理 feature/hotfix 分支、tag、MR、合并到 test。

### flow create

```
npx nut git flow create --type feature
npx nut git flow create --type feature --version 1.2.3
npx nut git flow create --type hotfix --version 1.2.4 --tag --mr --desc "修复登录问题"
```

| 参数 | 说明 |
|------|------|
| `--type` | `feature` 或 `hotfix`（默认 feature） |
| `--version` | 版本号，不传则自动计算（远程最新版本 patch+1） |
| `--tag` | 同时打 tag |
| `--mr` | 同时创建 MR |
| `--desc` | MR 描述 |
| `--target` | MR 目标分支，默认 master |
| `--title` | MR 标题 |

创建分支命名规则：`feature/v{version}` 或 `hotfix/v{version}`

### flow tag

```
npx nut git flow tag
npx nut git flow tag --version 1.2.3 --message "发布说明"
```

| 参数 | 说明 |
|------|------|
| `--version` | 版本号，不传则用当前项目版本 |
| `--message` | tag 说明信息 |

### flow mr

```
npx nut git flow mr
npx nut git flow mr --source feature/v1.2.3 --target master --title "MR标题"
```

| 参数 | 说明 |
|------|------|
| `--source` | 源分支，默认当前分支 |
| `--target` | 目标分支，默认 master |
| `--title` | MR 标题 |

### flow merge

```
npx nut git flow merge
npx nut git flow merge --source feature/v1.2.3
```

将指定分支合并到 test 测试分支并推送。**操作前自动创建快照**。

| 参数 | 说明 |
|------|------|
| `--source` | 源分支，默认当前分支 |

### flow preview

```
npx nut git flow preview
npx nut git flow preview --source feature/v1.2.3
```

预览合并到 test：无冲突自动合并并推送，有冲突提示手动处理。

| 参数 | 说明 |
|------|------|
| `--source` | 源分支，默认当前分支 |

### flow delete

```
npx nut git flow delete
npx nut git flow delete --branch feature/v1.2.3
```

安全删除分支（仅 feature/hotfix 类型，受保护分支禁止删除）。

| 参数 | 说明 |
|------|------|
| `--branch` | 要删除的分支，默认当前分支 |
| `--source` | 同 `--branch` |

### flow list

```
npx nut git flow list
```

列出可管理分支（release/feature/hotfix）和 tags。

---

## ssh

SSH 配置管理。

### ssh setup

```
npx nut git ssh setup                      # GitHub（默认）
npx nut git ssh setup gitlab               # GitLab
npx nut git ssh setup gitee                # Gitee
npx nut git ssh setup gitcode               # 腾讯工蜂
npx nut git ssh setup gitcode --token xxx   # 工蜂 + token
```

| 参数 | 说明 |
|------|------|
| `[平台]` | 位置参数：github/gitlab/gitee/gitcode（默认 github） |
| `--gitlab` | 使用 GitLab |
| `--gitee` | 使用 Gitee |
| `--gitcode` | 使用腾讯工蜂 |
| `--token` | 可选 Token（工蜂用于自动上传公钥） |

**SSH setup 流程**：
1. 生成 ED25519 密钥对（默认）或 RSA 4096
2. 自动配置 `~/.ssh/config`
3. 添加密钥到 ssh-agent
4. 测试连接
5. 输出公钥 + 添加指引
6. 工蜂平台：自动上传公钥（需 token）

### ssh multi

```
npx nut git ssh multi --platform gitcode --accounts "personal:zhangsan@tencent.com,shared:team@tencent.com"
```

| 参数 | 说明 |
|------|------|
| `--platform` | 平台：github/gitlab/gitee/gitcode（默认 gitcode） |
| `--accounts` | 帐号列表，格式：`name:email,name:email` |

为每个帐号生成独立密钥 + 配置 SSH config Host 别名。

### ssh troubleshoot

```
npx nut git ssh troubleshoot
npx nut git ssh troubleshoot --host git.woa.com
```

| 参数 | 说明 |
|------|------|
| `--host` | 目标主机，默认 git.woa.com |

诊断 SSH 连接问题，检查：密钥存在性、config 配置、ssh-agent、连接测试。

### ssh status

```
npx nut git ssh status
```

查看 SSH 配置状态。

### ssh key

```
npx nut git ssh key
npx nut git ssh key github
npx nut git ssh key gitcode
```

| 参数 | 说明 |
|------|------|
| `[平台]` | 平台名或主机名，默认 github |

查看指定平台的 SSH 公钥内容。

---

## SafetyNet（安全网）

安全网在 CLI 中自动内嵌于每个操作的前置步骤中：

- **Capture**：`git stash push --include-untracked` 保存全部工作区
- **Confirm**：`git stash drop` 丢弃保存的状态
- **Reject**：`git stash pop` 恢复所有修改

用户无需手动调用安全网，它由 npx nut git 自动管理。
