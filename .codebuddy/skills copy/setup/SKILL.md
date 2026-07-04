---
name: setup
description: 项目一键初始化。安装全局 MCP、项目依赖、配置 IDE MCP 接入，并将 .codebuddy/docs 同步生成知识库图谱。支持 update-docs 触发增量更新知识库。
---

# Skill：项目初始化（setup）

> 新成员克隆项目后执行一次，完成所有环境配置。
> 也可随时执行 `/update-docs` 更新知识库。

---

## 触发时机

```
✅ 用户说 /setup 或 "初始化项目" 或 "帮我安装环境"
✅ 用户说 /update-docs 或 "更新知识库" 或 "docs 有更新"
✅ 新成员首次克隆项目时
❌ 不在任务执行中途触发（避免打断流程）
```

---

## 模式判断

```
用户触发词包含 "update-docs" / "更新知识库" / "docs 有更新"
  → 仅执行 Step 5（知识库增量更新），跳过 Step 1~4

其他情况
  → 完整执行 Step 1~5
```

---

## ⚠️ 已知坑点（必读）

```
【坑1：pnpm store 冲突】
  症状：ERR_PNPM_UNEXPECTED_STORE
  原因：pnpm config set store-dir 改过路径，但全局 node_modules 仍指向旧 store
  修复：pnpm config set store-dir "<旧store路径>" --global，再重新安装
  → Step 2 已自动检测并修复

【坑2：mcp.json BOM 问题】
  症状：解析 MCP 配置文件失败: Unexpected token '﻿', "﻿{"mcpServ"... is not valid JSON
  原因：PowerShell Set-Content 默认写入 UTF-8 with BOM（字节 EF BB BF）
  修复：必须用 Node.js fs.writeFileSync 写入，指定 encoding: 'utf8'（无 BOM）
  → Step 4 已使用 Node.js 写入，禁止用 PowerShell Set-Content

【坑3：MCP 命令名】
  @tencent/specflow-mcp 安装后提供 5 个独立命令（不是单一 specflow-mcp）：
    specflow-mcp-orchestrator
    specflow-mcp-graph
    specflow-mcp-code
    specflow-mcp-knowledge
    specflow-mcp-memory
  mcp.json 中每个 server 的 command 必须对应上述独立命令

【坑4：mcp.json 路径（CodeBuddy/工蜂）】
  正确路径：C:\Users\{用户名}\.gongfeng-copilot\mcp.json
  不是：~/.cursor/mcp.json（Cursor 用）
  不是：%APPDATA%\Claude\...（Claude Desktop 用）

【坑5：pnpm 并行安装 wait 顺序】
  错误写法：先启动所有后台任务，再用 wait $PID_ROOT / wait $PID_CLIENT 顺序等待
  → 如果 PID_CLIENT 先完成，wait $PID_ROOT 会等到 PID_ROOT 完成，但 wait $PID_CLIENT 已经错过
  正确写法：把 PID 存入数组，循环 wait "${PIDS[$i]}"
```

---

## 执行步骤

### Step 1：检测环境前置条件

```
1.1 检测 Node.js 版本
    → 执行：node --version
    → 要求：>= 18.0.0
    → 不满足 → 播报警告，提示用户升级，阻断后续步骤

1.2 检测 pnpm 是否安装
    → 执行：pnpm --version
    → 未安装 → 执行：npm install -g pnpm --registry=<腾讯镜像>
    → 安装失败 → 阻断，提示手动安装

1.3 检测 Go 版本（可选，仅后端开发需要）
    → 执行：go version
    → 未安装 → 播报提示，不阻断

播报：
  🔍 环境检测：
    Node.js：{版本 | ❌ 未安装（阻断）}
    pnpm：{版本 | ⚠️ 未安装，已自动安装}
    Go：{版本 | ℹ️ 未安装（仅后端开发需要）}
```

### Step 2：修复 pnpm store 冲突

```
2.1 执行：pnpm list -g --depth=0 检测是否有 ERR_PNPM_UNEXPECTED_STORE
    → 无冲突 → 播报 "✅ pnpm store 配置正常"，跳过修复
    → 有冲突 → 进入修复流程

2.2 从错误信息中提取旧 store 路径
    → 错误信息格式：linked from the store at "<旧路径>"
    → 提取成功 → 执行：pnpm config set store-dir "<旧路径>" --global
    → 提取失败 → 重置为系统默认路径

2.3 验证修复结果
    → 再次执行：pnpm list -g --depth=0
    → 无报错 → 播报 "✅ pnpm store 冲突已修复"

播报：
  🔧 pnpm store：{✅ 正常 | ✅ 已修复（旧路径: xxx）| ⚠️ 修复失败，请手动处理}
```

### Step 3：安装全局 MCP

```
3.1 检测 @tencent/specflow-mcp 是否已全局安装
    → 执行：pnpm list -g @tencent/specflow-mcp --depth=0
    → 已安装 → 播报当前版本，继续执行更新

3.2 安装/更新全局 MCP（优先 pnpm，失败降级 npm）
    → 执行：pnpm add -g @tencent/specflow-mcp \
        --registry=https://mirrors.tencent.com/npm/
    → 失败 → 执行：npm install -g @tencent/specflow-mcp \
        --registry=https://mirrors.tencent.com/npm/ \
        --@tencent:registry=https://mirrors.tencent.com/npm/

3.3 验证 5 个 MCP 命令可用性
    → 检查：specflow-mcp-orchestrator / specflow-mcp-graph /
             specflow-mcp-code / specflow-mcp-knowledge / specflow-mcp-memory
    → 不可用 → 播报 pnpm 全局 bin 路径，提示加入 PATH

播报：
  📦 全局 MCP：
    specflow-mcp-orchestrator：{✅ 可用 | ⚠️ 不可用}
    specflow-mcp-graph：{✅ 可用 | ⚠️ 不可用}
    specflow-mcp-code：{✅ 可用 | ⚠️ 不可用}
    specflow-mcp-knowledge：{✅ 可用 | ⚠️ 不可用}
    specflow-mcp-memory：{✅ 可用 | ⚠️ 不可用}
```

### Step 4：配置 IDE MCP（写入 mcp.json）

```
⚠️ 关键约束：必须用 Node.js fs.writeFileSync 写入，禁止 PowerShell Set-Content
   原因：PowerShell Set-Content 默认写入 UTF-8 with BOM，导致 JSON 解析失败

4.1 自动检测 IDE 配置路径（按优先级）：
    - CodeBuddy/工蜂：~/.gongfeng-copilot/mcp.json
    - Cursor：~/.cursor/mcp.json
    - Claude Desktop（macOS）：~/Library/Application Support/Claude/claude_desktop_config.json

4.2 写入 mcp.json（Node.js 无 BOM 写入）：
    {
      "mcpServers": {
        "specflow-orchestrator": { "command": "specflow-mcp-orchestrator", "args": [] },
        "specflow-graph":        { "command": "specflow-mcp-graph",        "args": [] },
        "specflow-code":         { "command": "specflow-mcp-code",         "args": [] },
        "specflow-knowledge":    { "command": "specflow-mcp-knowledge",    "args": [] },
        "specflow-memory":       { "command": "specflow-mcp-memory",       "args": [] }
      }
    }

4.3 写入后验证：读取文件前 3 字节，确认不是 EF BB BF（BOM）

播报：
  ⚙️ IDE MCP 配置：
    ~/.gongfeng-copilot/mcp.json：{✅ 已写入（无BOM）| ⚠️ 写入失败}
    ~/.cursor/mcp.json：{✅ 已写入 | ℹ️ 目录不存在，跳过}
```

### Step 5：安装项目依赖

```
并行执行以下安装（互不依赖），使用数组收集 PID 避免 wait 顺序 bug：

5.1 根目录依赖（如 package.json 存在）
    → 执行：pnpm install（在项目根目录）

5.2 前端依赖（如 client/package.json 存在）
    → 执行：pnpm install（在 client/ 目录）

5.3 文档站依赖（可选，如 dockit/package.json 存在）
    → 执行：pnpm install（在 dockit/ 目录）

等待方式：
    PIDS=(); LABELS=()
    各任务 & → PIDS+=($!); LABELS+=("名称")
    for i in "${!PIDS[@]}"; do wait "${PIDS[$i]}" && echo "✅" || echo "❌"; done

播报：
  📦 项目依赖：
    根目录：{✅ 安装完成 | ❌ 失败 | ℹ️ 无 package.json，跳过}
    前端（client）：{✅ 安装完成 | ❌ 失败 | ℹ️ 跳过}
    文档站（dockit）：{✅ 安装完成 | ℹ️ 跳过}
```

### Step 6：初始化/更新知识库（.codebuddy/docs → 知识库图谱）

```
6.1 确认项目已注册
    → 调用 sf_current_project()
    → 未注册 → 调用 sf_register_project({ rootPath: "<项目绝对路径>" })

6.2 切换到当前项目
    → 调用 sf_switch_project({ project: "<项目绝对路径>" })

6.3 检查知识库状态
    → 调用 knowledge_status()

6.4 扫描 .codebuddy/docs 目录结构
    → 列出所有子目录（每个子目录 = 一个知识库）

6.5 对每个子目录执行知识库初始化或更新：
    【首次初始化】→ 调用 init_knowledge({ knowledgeBase: "{子目录名}" })
    【增量更新】  → 调用 update_knowledge({ knowledgeBase: "{子目录名}" })

6.6 验证知识库可用
    → 调用 knowledge_status()，确认所有知识库状态为 ready

播报：
  📚 知识库同步：
    {模块名}：{✅ 初始化 | 🔄 更新 | ✅ 已是最新}
    共 {N} 个知识库就绪
```

---

## 完成播报格式

### 完整初始化完成

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 项目初始化完成！
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 环境：Node {版本} | pnpm {版本} | Go {版本/未安装}
🔧 pnpm store：{✅ 正常 | ✅ 已修复}
📦 MCP：5个命令 ✅（orchestrator/graph/code/knowledge/memory）
⚙️ IDE 配置：{已写入路径}（无BOM ✅）
📦 依赖：根目录 ✅ | 前端 ✅ | 文档站 {✅/跳过}
📚 知识库：{N} 个模块已就绪
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 下一步：
  1. 重启 IDE 使 MCP 配置生效
  2. 执行 pnpm dev 启动开发服务
  3. 执行 /init 开始新对话
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 仅更新知识库完成

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 知识库更新完成！
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 已更新：{N} 个知识库
  {更新的模块列表}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 异常处理

```
Node.js 未安装：
  → 阻断，提示：请先安装 Node.js >= 18（https://nodejs.org）

pnpm store 冲突（ERR_PNPM_UNEXPECTED_STORE）：
  → 自动修复（Step 2），修复失败则提示手动执行：
    pnpm config set store-dir "<旧store路径>" --global

npm/pnpm 安装失败（网络问题）：
  → 播报："⚠️ 安装失败，请检查网络或尝试：npm config set registry https://registry.npmmirror.com"
  → 不阻断后续步骤

mcp.json 写入失败：
  → 播报具体错误
  → 输出 mcp.json 内容，提示用户手动创建（必须用 Node.js 或文本编辑器，禁止 PowerShell Set-Content）

pnpm install 失败：
  → 播报具体错误信息
  → 提示用户手动执行：pnpm install --no-frozen-lockfile

知识库初始化失败：
  → 播报具体错误
  → 提示用户检查 .codebuddy/docs 目录是否存在
  → 可重试：/update-docs
```

---

## 文件隔离

```
只读：.codebuddy/docs/**（扫描文档源）
可写：~/.gongfeng-copilot/mcp.json（IDE MCP 配置）
禁写：所有代码文件、proto、db、service、client
状态写入：~/.specflow/projects.json（通过 MCP 工具写入）
```

---

## 工具调用顺序

```
Step 1（串行）：
  node --version → pnpm --version → [npm install -g pnpm]

Step 2（串行）：
  pnpm list -g → [pnpm config set store-dir] → pnpm list -g（验证）

Step 3（串行）：
  pnpm list -g @tencent/specflow-mcp → pnpm add -g → 验证5个命令

Step 4（串行）：
  检测IDE路径 → Node.js 写入 mcp.json → 验证无BOM

Step 5（并行）：
  pnpm install(根目录) + pnpm install(client/) + [pnpm install(dockit/)]
  → 数组收集PID → 循环 wait

Step 6（串行）：
  sf_current_project → sf_switch_project → knowledge_status
  → [对每个 docs 子目录] init_knowledge 或 update_knowledge
  → knowledge_status（验证）
```
