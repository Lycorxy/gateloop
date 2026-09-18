# gitflow 指南（flowcli gitflow，工蜂协作）

## 目录
- [命令速查](#命令速查)
- [场景流程](#场景流程)
- [回退与备份体系](#回退与备份体系)

## 命令速查

| 分类 | 命令 |
|---|---|
| 向导 | `flowcli gitflow`（交互式：选版本 → 建 release/feature 分支 → 升版本提交 → 自动建 MR） |
| 状态/日志 | `gitflow status`、`gitflow log [n]` |
| 远程同步 | `gitflow push`（推送当前分支）、`gitflow pull`（拉取最新代码） |
| 暂存/提交 | `gitflow stage -a / -f <files>`、`gitflow unstage`、`gitflow commit -m <msg> [-a] [--amend]` |
| 快照 | `gitflow snapshot list / create [-d] / restore-previous / restore-first / restore-index <i> / revert-file <path>` |
| 回退 | `gitflow undo`（撤上一步）、`gitflow rollback -a <序号>`、`gitflow activity`（操作日志） |
| 差异 | `gitflow diff [from] [to] [-s/-n]`、`diff-staged`、`diff-worktree`、`diff-file <path>`、`diff-branches <src> <tgt>`、`file-history <path>` |
| 分支 | `gitflow branch list [-r] / create <name> / switch <name> / delete <name> [-f] / rebase [branch]` |
| Stash | `gitflow stash [msg] [-u]`、`stash-pop`、`stash-list` |
| 换行符 | `gitflow fix-line-endings [-l lf/crlf]`、`check-line-endings`、`gitflow setup gitattributes/gitignore/editorconfig/project` |
| SSH | `gitflow ssh setup [--host] [--email]`、`status`、`show-key`、`troubleshoot`、`clean` |
| MR/授权 | `gitflow mr create [-s 源] [-t 目标] [-m 标题] [--reviewer-ids]`、`list [opened/merged/closed/all]`、`exists`、`login`、`logout`、`verify-token` |
| SSH Key 远程 | `gitflow mr ssh-keys`、`mr delete-ssh-key <id>` |
| 发布 | `gitflow merge-to-test [源分支]`、`preview-merge-to-test [源分支]` |
| Tag | `gitflow tag <name> [-m msg]`、`list-tags` |
| 版本分支 | `gitflow create-branch feature [version] [--bump patch/minor/major] [--release] [--no-mr] [--desc] [--project-key]`、`create-branch hotfix [version]`（完整流程：建分支+升版本+MR） |
| 删分支 | `gitflow delete-branch <name> [-l]`（仅 feature/hotfix） |
| 版本查询 | `gitflow version current`、`version latest [projectKey]` |

以下命令均省略 `flowcli` 前缀书写。

## 场景流程

### 场景 A：版本发布（推荐向导）

**版本号规则（重要，禁止拍脑袋拟版本）**：
1. 用户明确指定版本号 → 直接用
2. 否则 = `gitflow version latest`（远程最新）+ patch 自增（如 `0.0.0 → 0.0.1`）
3. 大需求用 `--bump minor`，破坏性变更用 `--bump major`

**交互环境**：`gitflow`（向导：版本来源（线上已有/自定义/自动自增）→ 功能描述 → release/直接流程 → 建分支 → 升版本提交 → 自动 MR）

**非交互环境（agent/CI，禁止只跑半截流程）**：`gitflow create-branch feature` 一条命令完成完整流程：

- 版本号缺省 = 远程 latest + patch 自增；`--bump minor/major` 换类型；显式传版本号优先
- 默认直接流程（feature→master）；`--release` 走 release 流程（建 release/v<版本>，feature→release→master）
- 自动完成：升 package.json 版本并提交推送 + 创建 MR；`--no-mr` 跳过；`--desc '<描述>'` 指定 MR 标题

**验收（三条全过才算完成）**：
1. `gitflow branch list` 出现新分支且已推远程
2. package.json 版本已更新并产生 bump 提交
3. `gitflow mr list` 出现新 MR（或 `--no-mr` 时确认跳过）

示例：
- `gitflow create-branch feature` → 自动 0.0.1，直接流程
- `gitflow create-branch feature --release --desc '用户登录优化'` → release 流程 + MR 含描述
- `gitflow create-branch hotfix` → hotfix/v<next> → master

⚠️ 禁止旧用法 `create-branch feature 1.2.0` 只建分支不升版本不建 MR——那是半截流程，仅当用户明确说"只建分支"时使用。

### 场景 B：创建 MR

1. 在 feature/hotfix 分支上（MR 源分支仅允许这两类）：`gitflow branch list` 确认当前分支
2. 确保分支已推送远程：`gitflow push` → 验收：`✓ 已推送到远程`
3. `gitflow mr create -m '标题' [--reviewer-ids id1,id2]`
   - 目标分支自动推导：feature → 同版本 release；hotfix → master（可不传 `-t`）
4. 验收：`gitflow mr list`（opened）出现该 MR
5. 前置：`gitflow mr verify-token` 通过；未授权 → `gitflow mr login` 走 OAuth

### 场景 C：打 Tag

1. `gitflow tag v1.2.0 -m 'release 1.2.0'` → 验收："创建并推送成功"类输出
2. `gitflow list-tags` → 验收：新 tag 出现在列表
3. ⚠️ tag 会推送到远程，确认版本号无误后再执行

### 场景 D：回退代码（三级体系，由轻到重）

| 手段 | 命令 | 适用 |
|---|---|---|
| 撤销上一步操作 | `gitflow undo` | 刚做错一步（如错误 commit/stage） |
| 回退到指定操作前 | `gitflow activity` 查序号 → `gitflow rollback -a <序号>` | 错了多步 |
| 快照恢复 | `gitflow snapshot list` → `restore-index <i>`（或 restore-previous / restore-first） | 回到任意历史快照 |
| 回退单文件 | `gitflow snapshot revert-file <path>` | 只想还原某文件 |

⚠️ 回退前先 `gitflow status` 确认现场；恢复类操作均属危险操作，先向用户复述影响。

### 场景 E：备份代码

- 手动快照：`gitflow snapshot create -d '发布前备份'` → 验收：snapshot id 输出、`snapshot list` 可见
- 自动备份：GitManager 默认 autoBackup=true，commit/merge 等关键操作自动打快照
- 临时备份工作区：`gitflow stash '说明' -u`（含未跟踪文件）→ `stash list` 验收 → `stash-pop` 恢复

### 场景 F：SSH 配置（工蜂）

1. `gitflow ssh setup --host git.woa.com --email <邮箱>` → 验收："一键配置完成"类输出
2. `gitflow ssh status` → 验收：连接可用
3. 失败排查：`gitflow ssh troubleshoot`（按提示修复）
4. 远程注册状态：`gitflow mr ssh-keys`（列出工蜂上已注册 Key；`mr delete-ssh-key <id>` 删除）
5. 查看公钥（贴到工蜂网页用）：`gitflow ssh show-key`

### 场景 G：对比冲突（合并前预检）

- 分支差异：`gitflow diff-branches feature/login master` → 验收：输出差异文件/内容清单
- 预演合并：`gitflow preview-merge-to-test feature/login` → 验收：无冲突输出"可合并"；有冲突输出冲突文件列表并**自动中止**
- 单文件历史：`gitflow file-history <path>`

### 场景 H：解决冲突

1. 冲突来源通常是 merge master / merge-to-test 自动 abort 后：
2. `gitflow diff`（或 `diff-file <path>`）定位冲突文件
3. 手工编辑冲突标记 → `gitflow stage -f <冲突文件>`
4. `gitflow commit -m 'merge: resolve conflicts'`
5. 验收：`gitflow status` 干净 → 重新执行被冲突打断的命令（如 `flowcli start` / `merge-to-test`）

### 场景 I：发布合并到 test 分支

1. 预检：`preview-merge-to-test <源分支>`（冲突则中止，走场景 H）
2. `gitflow merge-to-test <源分支>` → 验收："合并并推送成功"类输出；⚠️ 会推远程 test 分支（触发流水线），执行前确认

### 场景 J：换行符问题（Windows 常见）

`gitflow check-line-endings` → 有问题：`gitflow fix-line-endings -l lf` → 一次性预防：`gitflow setup project -l lf`（生成 .gitattributes + .gitignore + .editorconfig）

## 回退与备份体系

```
操作层（activity log 记录每步）── undo / rollback 沿日志回退
快照层（snapshot 自动+手动）───── restore-* / revert-file 恢复现场
兜底层（stash）────────────────── 工作区临时存取
```

原则：出问题先 `gitflow activity` + `snapshot list` 看现场，再选最小代价的回退手段；回退属危险操作，先确认后执行。
