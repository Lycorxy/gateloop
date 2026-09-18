# 流水线指南（flowcli）

## 目录
- [命令速查](#命令速查)
- [前置条件](#前置条件)
- [场景流程](#场景流程)
- [常见错误](#常见错误)

## 命令速查

| 命令 | 作用 | 关键选项 |
|---|---|---|
| `flowcli auth` | 管理 ~/.flowclirc token | `list` / `get <KEY>` / `set <KEY> <VAL>` |
| `flowcli config` | 交互式生成 .flowc.ts 配置 | `-c <路径>`（默认 ./.flowc.ts）、`--skip-auth` |
| `flowcli create` | 按配置创建流水线（已存在跳过） | `-c`、`--skip-auth` |
| `flowcli update` | 更新流水线实例启动参数（白名单字段） | `-c` |
| `flowcli sync` | 生产值反向同步回本地 .flowc.ts | `-c`、`--dry-run` |
| `flowcli get` | 获取流水线 | `-c` |
| `flowcli start` | 启动流水线（自动同步 master） | `-e testing/staging`、`-m api/git` |
| `flowcli notice <action>` | 企业微信通知 | `-s success/failure` 等，action ∈ env-setup / code-quality / build-package / deploy / artifact / pipeline-complete |

token 配置项：`ZHIYAN_TOKEN`（智妍）、`ACCESS_TOKEN`（蓝盾）。

## 前置条件

1. **token**：`flowcli auth list` 查看状态；未设置 → `flowcli auth set`（或 `flowcli auth set ZHIYAN_TOKEN xxx`）。
2. **Git 仓库**：当前目录是 git 仓库且有 origin 远程（config 命令会校验代码库关联）。
3. **.flowc.ts**：除 config 外的命令都依赖它；加载失败提示装 typescript（`pnpm add -D typescript`）。
4. **权限**：config/create/update/sync 受用户白名单限制，可 `--skip-auth` 跳过。

## 场景流程

### 场景 A：新项目接入流水线（首次）

| # | 命令 | 验收点 |
|---|---|---|
| 1 | `flowcli auth list` | 两个 token 均"已设置" |
| 2 | `flowcli config` | 输出"配置文件已生成: ./.flowc.ts"；交互中完成项目/应用选择，代码库关联校验通过（未关联则按提示到控制台关联后重试） |
| 3 | 检查 .flowc.ts | 人工核对 ProductPath / DynamicCompileCommand / DeployDirPath 等与项目实际匹配（SavePath 默认=项目名） |
| 4 | `flowcli create` | 每环境"流水线创建成功"；已存在的显示"跳过" |
| 5 | `flowcli start -e testing` | "启动成功"+ 详情 URL；轮询至"流水线构建成功"（默认 10 分钟超时） |

### 场景 B：发布测试 / 预发环境

- API 模式（默认）：`flowcli start -e testing`（自动同步 master → 校验分支已推送 → API 启动 → 轮询状态）
- Git 模式：`flowcli start -e testing -m git`（同步 master 后**强制推送当前分支 → test**；staging → prepare）
- 分支映射：`testing→test`、`staging→prepare`
- ⚠️ 危险操作：git 模式会 `push -f` 覆盖目标分支，执行前必须向用户确认
- 验收点：API 模式看"流水线构建成功!"+URL；git 模式看"推送成功"+"流水线已触发"
- 约束：`-e production` 被工具禁止（提示"请手动操作"），不要绕过

### 场景 C：修改流水线参数（本地 → 生产）

1. 编辑 .flowc.ts 对应字段
2. `flowcli update`（两阶段：先对比 → 确认 → 再写入）
   - 阶段 1：逐环境对比线上与本地，汇总差异
   - 阶段 2：列出差异清单（线上值 → 本地配置值）→ 交互确认 → 确认后才更新；取消则线上零变更
3. 验收点：`检测到 N 个差异` + 差异清单 → 确认提示 → `已更新 N 个启动参数`；无差异则 `线上已是最新`；取消则 `已取消更新，线上配置未做任何变更`
4. 白名单字段（其余不碰）：GitAliasName、BranchName、SavePath、DynamicEnvCommand、DynamicCompileCommand、ProductPath、DeployDirPath、RollbackDirPath、IsRollback

### 场景 D：生产值反向同步（生产 → 本地）

1. `flowcli sync --dry-run` → 仅预览差异清单（本地值 → 生产值），不写入不确认
2. `flowcli sync`（两阶段：先对比 → 确认 → 再写回）
   - 阶段 1：逐配置对比生产与本地，汇总差异
   - 阶段 2：列出差异清单（本地值 → 生产值）→ 交互确认 → 确认后写回（自动备份 `.flowc.ts.bak`）；取消则本地文件零变更
3. 验收点：`检测到 N 个差异` + 清单 → 确认提示 → `已同步 N 个流水线，更新 M 个字段`；无差异则 `本地已是最新`；若提示"以下字段未能自动定位写入" → 对照 `.bak` 手动核对

### 场景 E：发送企业微信通知

`flowcli notice <action> -s success -p <项目名> -b <分支> ...`（按 action 选参数）
验收：命令 exit 0，无 ERROR 输出。

## 常见错误

| 现象 | 原因与处置 |
|---|---|
| 190002 无访问权限 | token 失效或项目名不匹配 → `flowcli auth set` 重设；确认 .flowc.ts 的 ProjectName |
| "项目 xxx 不存在" | .flowc.ts 的 ProjectName 与平台项目名不一致 |
| "未找到流水线 xxx" | 先 `flowcli create`；命名规则：`[AppTagName-]PipeName-环境后缀` |
| 合并 master 失败/冲突 | start 自动中止合并，按 gitflow-guide「冲突解决」处理，然后重新 start |
| 轮询超时 | 10 分钟超时属正常长构建 → 打开详情 URL 人工跟进 |
| 当前分支未推送 | API 模式前置校验 → 先 `gitflow` 推送（或 `git push`）再 start |
