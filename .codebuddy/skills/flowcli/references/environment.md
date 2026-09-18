# 环境检测与安装指南

## 目录
- [执行前缀与检测](#执行前缀与检测)
- [安装方式](#安装方式)
- [前置依赖检测](#前置依赖检测)
- [常见环境问题](#常见环境问题)

## 执行前缀与检测

flowcli 有三种执行方式，任务开始前先检测确定可用前缀（下称 `$`）：

| 检测命令 | 结果 | 前缀 `$` |
|---|---|---|
| `flowcli --version` | 输出版本号（如 `0.0.2`） | `flowcli` |
| `npx flowcli --version`（项目已局部安装） | 输出版本号 | `npx flowcli` |
| `node bin/main.cjs --version`（flowcli 源码仓内） | 输出版本号 | `node bin/main.cjs` |

检测顺序：先 `flowcli --version`（全局最快）；失败再按局部/源码方式检测。三者都失败 → 必须先安装，未安装时**无法执行任何 flowcli 命令**。

验收点：命令 exit 0 且输出形如 `X.Y.Z` 的版本号。

## 安装方式

| 方式 | 命令 | 验收 | 适用 |
|---|---|---|---|
| **全局安装（推荐）** | `npm install -g @tencent/flowcli` 或 `pnpm add -g @tencent/flowcli` | `flowcli --version` 输出版本号 | 日常使用，任意目录可用 |
| **局部安装** | `pnpm add @tencent/flowcli`（或 `npm i @tencent/flowcli`） | `npx flowcli --version` 输出版本号 | 仅项目内使用，不污染全局 |
| **源码执行** | 无需安装，在 flowcli 仓库根目录 `node bin/main.cjs <命令>` | `node bin/main.cjs --version` | 开发/调试 flowcli 本身 |

升级：`npm update -g @tencent/flowcli`（全局）或 `pnpm add -g @tencent/flowcli@latest`。

安装失败排查：node 版本过低（需 ≥ 18）、npm 源不可达（换内网源）、权限不足（全局安装加管理员权限或用局部方式）。

## 前置依赖检测

| 依赖 | 检测命令 | 要求 | 说明 |
|---|---|---|---|
| Node.js | `node -v` | ≥ 18 | 所有命令 |
| Git | `git --version` | 已安装 | gitflow 全部命令 |
| Git 仓库 | `git rev-parse --is-inside-work-tree` | 输出 `true` | gitflow / 流水线命令 |
| origin 远程 | `git config --get remote.origin.url` | 非空 | 流水线命令（config 校验代码库关联）、版本分支命令 |
| 智妍/蓝盾 token | `flowcli auth list` | 两项均"已设置" | 流水线全部命令；未设置 → `flowcli auth set` |
| 工蜂 token（MR/SSH 远程） | `flowcli gitflow mr verify-token` | `"valid": true` | mr create / ssh-keys 等；未授权 → `flowcli gitflow mr login` |
| typescript（加载 .flowc.ts） | `npx tsc -v` | 已安装 | config 之外的流水线命令 |

## 常见环境问题

| 现象 | 原因与处置 |
|---|---|
| `flowcli: command not found` | 未全局安装 → 按上文安装；或 PATH 未包含 npm 全局 bin 目录（`npm config get prefix` 检查） |
| `npx flowcli` 提示找不到包 | 项目未局部安装 → `pnpm add @tencent/flowcli` |
| `.ts` 配置加载失败 / rechoir 报错 | 项目缺 typescript → `pnpm add -D typescript` |
| Windows 终端中文乱码（提交信息/MR 标题） | PowerShell 编码问题 → commit/MR 标题用 `-F <utf8文件>` 传参 |
| token 失效（190002） | `flowcli auth set` 重设 ZHIYAN_TOKEN / ACCESS_TOKEN |
| node 版本低于 18 | 用 nvm 切换：`nvm install 18 && nvm use 18` |
