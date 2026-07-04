# nut-git CLI 完整参考

## 全局选项

| 参数 | 说明 |
|------|------|
| `--help, -h` | 显示帮助信息 |

## status

```
nut-git status
```

查看工作区状态。输出分支名、文件状态（暂存区/工作区双字母）、统计摘要。

## stage / add

```
nut-git stage --all
nut-git stage --files "a.ts,b.ts"
nut-git stage --fix-lf
```

| 参数 | 简写 | 说明 |
|------|------|------|
| `--all` | `-a` | 暂存所有文件 |
| `--files` | — | 逗号分隔的文件列表 |
| `--fix-lf` | — | 暂存前自动修复换行符 |

## unstage / reset

```
nut-git unstage [文件...]
```

取消暂存指定文件，不传则取消所有。

## commit

```
nut-git commit -m "提交信息"
nut-git commit -m "提交信息" --amend
nut-git commit -m "提交信息" --all
nut-git commit -m "提交信息" --no-verify
```

| 参数 | 简写 | 说明 |
|------|------|------|
| `--message` | `-m` | 提交信息（必填） |
| `--amend` | — | 修改上一次提交 |
| `--all` | `-a` | 提交所有已跟踪文件 |
| `--no-verify` | — | 跳过 pre-commit hook |

## log

```
nut-git log [-n <数量>]
```

| 参数 | 说明 |
|------|------|
| `-n <N>` | 显示数量，默认 20 |

## snapshots

```
nut-git snapshots
```

列出所有快照，显示：索引、操作类型、描述、时间、分支、HEAD 提交、标签。

## snapshot

```
nut-git snapshot -d "描述" [--tag <标签>]
```

| 参数 | 简写 | 说明 |
|------|------|------|
| `--description` | `-d` | 快照描述 |
| `--tag` | — | 标签，多个用逗号分隔 |

## rollback / restore

```
nut-git rollback --to <索引>
nut-git rollback --prev
nut-git rollback --first
```

| 参数 | 说明 |
|------|------|
| `--to <N>` | 回退到指定索引的快照 |
| `--prev` | 回退到上一个快照 |
| `--first` | 回退到第一个快照 |

## revert

```
nut-git revert <文件路径>
```

还原单个文件到 HEAD 状态。

## diff

```
nut-git diff                           # 工作区 vs 暂存区
nut-git diff --staged                  # 暂存区 vs HEAD
nut-git diff-file <路径>               # 单个文件差异
nut-git diff-branch <A> <B>            # 两个分支对比
nut-git history <路径>                 # 文件提交历史
```

### diff-branch 输出

| 字段 | 说明 |
|------|------|
| 超前提交 | source 有但 target 没有的提交 |
| 落后提交 | target 有但 source 没有的提交 |
| 统计 | commitsAhead、commitsBehind、filesChanged、additions、deletions |

## branch / branches

```
nut-git branch                         # 列出本地分支
nut-git branch -a                      # 列出所有分支
nut-git branch -c <名称>               # 创建并切换分支
nut-git branch -d <名称>               # 删除分支
nut-git branch -D <名称>               # 强制删除分支
```

| 参数 | 说明 |
|------|------|
| `--all, -a` | 包含远程分支 |
| `--create, -c` | 创建并切换到新分支 |
| `-d` | 删除分支 |
| `-D` | 强制删除分支 |

## checkout / switch

```
nut-git checkout <分支名>
```

## stash

```
nut-git stash [描述]
nut-git stash-pop
nut-git stash-list
```

| 命令 | 说明 |
|------|------|
| `stash` | 暂存当前工作区修改 |
| `stash-pop` | 恢复最近的 stash 并删除 |
| `stash-list` | 列出所有 stash |

## lf

```
nut-git lf                             # 检测换行符
nut-git lf --fix                       # 修复为 LF
nut-git lf --crlf --fix                # 修复为 CRLF
nut-git lf --setup                     # 配置 .gitattributes (LF)
```

| 参数 | 说明 |
|------|------|
| `--fix, -f` | 修复换行符 |
| `--crlf` | 目标为 CRLF（默认 LF） |
| `--setup` | 生成/更新 .gitattributes |

### lf 输出字段

| 字段 | 说明 |
|------|------|
| total | 扫描总文件数 |
| lf | LF 文件数 |
| crlf | CRLF 文件数 |
| mixed | 混合换行符文件数 |
| expected | 期望换行符类型 |
| mismatched | 不匹配文件列表 |

## ssh

```
nut-git ssh setup                      # GitHub
nut-git ssh setup --gitlab             # GitLab
nut-git ssh setup --gitee              # Gitee
nut-git ssh status                     # 查看配置状态
nut-git ssh key [平台]                 # 查看公钥
```

| 参数 | 说明 |
|------|------|
| `--gitlab` | 使用 GitLab 配置 |
| `--gitee` | 使用 Gitee 配置 |
| `--token` | 可选 Token（预留） |

### SSH setup 流程

1. 生成 ED25519 密钥对（默认）或 RSA 4096
2. 自动配置 `~/.ssh/config`
3. 添加密钥到 ssh-agent
4. 测试连接
5. 输出公钥 + 添加指引

## SafetyNet（安全网）

安全网通过 `GitManager.safetyNetCapture()` / `safetyNetConfirm()` / `safetyNetReject()` API 调用，在 CLI 中自动内嵌于每个操作的前置步骤中。

- **Capture**: `git stash push --include-untracked` 保存全部工作区
- **Confirm**: `git stash drop` 丢弃保存的状态
- **Reject**: `git stash pop` 恢复所有修改
