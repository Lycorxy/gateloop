# aivn CLI 完整参数参考

## 全局选项

| 参数             | 说明                           |
| ---------------- | ------------------------------ |
| `--cwd <path>`   | 指定项目根目录（默认当前目录） |
| `--session <id>` | 临时指定会话 ID                |
| `--help, -h`     | 帮助信息                       |

## init

```
aivn init [--cwd <path>]
```

初始化 AI 版本管理系统。创建 `.aivnsions/` 目录、默认会话，并自动部署 CodeBuddy Hooks。

初始化会自动完成以下步骤：

1. 创建 `.aivnsions/` 存储目录和默认会话
2. 部署 CodeBuddy Hooks 到 `.codebuddy/hooks/`
3. 确认 `.gitignore` 包含 `.aivnsions/`

## save

```
aivn save --question <问题> --solution <方案> [--tag <标签>] [--session <id>]
```

| 参数         | 简写 | 必填 | 说明         |
| ------------ | ---- | ---- | ------------ |
| `--question` | `-q` | 必填 | 用户问题描述 |
| `--solution` | `-s` | 必填 | 模型方案简述 |
| `--tag`      | `-t` | 可选 | 版本标签     |
| `--session`  | —    | 可选 | 指定会话     |

## log

```
aivn log [--session <id>] [--limit N]
```

| 参数             | 说明                             |
| ---------------- | -------------------------------- |
| `--session <id>` | 查看指定会话历史（默认当前会话） |
| `--limit N`      | 显示数量（默认 20）              |

## restore

```
aivn restore <版本ID> [--file <路径>]
```

| 参数     | 简写 | 说明                         |
| -------- | ---- | ---------------------------- |
| `版本ID` | —    | 必填，完整 ID 或后 12 位简写 |
| `--file` | `-f` | 只恢复指定文件               |

## diff

```
aivn diff [<版本ID>] [--mode <mode>] [--commit <hash>] [--file <path>]
aivn diff <版本ID1> <版本ID2>
```

| 参数       | 简写 | 说明                                       |
| ---------- | ---- | ------------------------------------------ |
| `版本ID`   | —    | 不传则对比 HEAD                            |
| `--mode`   | `-m` | `working-tree`(默认) / `staged` / `commit` |
| `--commit` | `-c` | mode=commit 时指定 commit hash             |
| `--file`   | `-f` | 对比指定文件                               |

## session

```
aivn session create <名称> [--base <版本ID>] [--from-session <会话ID>]
aivn session list [--active] [--limit N]
aivn session use <名称|ID>
aivn session show
aivn session rename <旧名称|ID> <新名称>
aivn session delete <名称|ID>
```

| 子命令   | 说明                                       |
| -------- | ------------------------------------------ |
| `create` | 创建新会话，可基于某个版本或从其他会话分支 |
| `list`   | 列出所有会话，`--active` 只显示有版本的    |
| `use`    | 切换活跃会话                               |
| `show`   | 显示当前会话详情                           |
| `rename` | 重命名会话                                 |
| `delete` | 删除会话（保留版本数据）                   |

## drop

```
aivn drop <版本ID>
```

删除指定版本。

## clean

```
aivn clean [--days N] [--session <id>] [--dry-run]
```

清理 N 天前的版本。`--dry-run` 模式只显示不删除。

## stats

```
aivn stats
```

显示存储统计：版本数、会话数、blob 数、占用空间。

## gc

```
aivn gc
```

垃圾回收孤立的 blob 对象。

## 环境变量

| 变量              | 说明                                                             |
| ----------------- | ---------------------------------------------------------------- |
| `AIVN_SESSION_ID` | 默认会话 ID（优先级：--session > 配置文件 > 环境变量 > default） |

## Hooks

aivn 通过 CodeBuddy Hooks 实现自动初始化和自动记录。

### Hook 文件

| 文件              | 触发事件           | 功能                                                           |
| ----------------- | ------------------ | -------------------------------------------------------------- |
| `aivn-init.cjs`   | `SessionStart`     | 检测 aivn 是否已初始化，未初始化则自动执行 `npx nut-aivn init` |
| `aivn-record.cjs` | `UserPromptSubmit` | 在用户提交新消息时，自动保存上一轮对话的代码变更为版本快照     |

### 部署位置

- 模板源（唯一真实源）：`.codebuddy/skills/aivn-manager/references/templates/`
- 部署目标：`.codebuddy/hooks/`

### 手动部署

如果 hooks 丢失或需要更新，可通过 aivn-manager skill 重新部署：

```bash
# Windows
copy /Y ".codebuddy\skills\aivn-manager\references\templates\aivn-init.cjs" ".codebuddy\hooks\aivn-init.cjs"
copy /Y ".codebuddy\skills\aivn-manager\references\templates\aivn-record.cjs" ".codebuddy\hooks\aivn-record.cjs"

# macOS/Linux
cp .codebuddy/skills/aivn-manager/references/templates/aivn-init.cjs .codebuddy/hooks/aivn-init.cjs
cp .codebuddy/skills/aivn-manager/references/templates/aivn-record.cjs .codebuddy/hooks/aivn-record.cjs
```

### 调试

`aivn-record.cjs` 内置调试日志系统，日志文件位于 `.codebuddy/aivn-hook-debug.log`。
