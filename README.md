# gateloop

**gateloop** 是一个 AI Agent 运行时约束器（harness）：流程门控 + 多 skill 协作 + exit code 验证的统一执行引擎，内置 `nut` CLI 与编程 API。

一句话：模型负责干活，引擎负责判断"干完了"这三个字什么时候作数。

## 背景

模型在变强，上下文窗口在变大，但执行层没人做：谁来决定流程走到哪一步、阶段之间怎么交接、什么算完成、失败怎么办。在 System Prompt 里写"请务必验证后再提交"，对 LLM 只是建议，不是约束。

gateloop（核心为 GateLoop 门控闭环引擎）把纪律从"模型自觉"搬进"引擎强制"：

```
① 流程门控    —— anchor 状态机推进，每阶段过闸才能走下一步（src/gateloop/state.ts）
② 协作管道    —— 阶段间 emits/consumes 数据契约，多 skill 跨存档上下文（flow.config）
③ 验证门禁    —— 推进前引擎重跑真实命令，exit 0 才算过（src/gateloop/verify.ts）
```

## 特性

- **流程门控**：anchor 状态机，阶段产物（produces）缺失即失败，阶段无法跳过
- **验证门禁**：`tsc` / `build` / `schema` / 自定义脚本（`custom`）等，推进前强制重跑，exit 0 才放行
- **防伪机制**：`modelWritable: false`（产物只允许脚本写）、`producesFresh`（产物必须比本轮新）
- **熔断**：`maxAttempts` 限制每阶段重试次数，避免死循环烧 token
- **断线恢复**：`status` 随时查询当前在哪一步；`retry` / `reset` 控制重试与重置
- **双形态**：CLI 一条命令搞定，或编程 API 直接调用

## 安装

```bash
pnpm add gateloop
# 或
npm install gateloop
```

全局安装后可获得 `nut` 命令：

```bash
npm install -g gateloop
```

## 快速开始

### CLI

所有流程操作都是一条命令（manifest = `anchor.config.json` 路径）：

```bash
nut gateloop init <manifest> --task "实现用户列表页"
nut gateloop next <manifest>      # 推进（内部强制重验 + 熔断）
nut gateloop status <manifest>    # 断线恢复：现在在哪一步
nut gateloop retry <manifest>
nut gateloop reset <manifest>
nut gateloop check <manifest>
nut gateloop gc <manifest>
nut gateloop subtask-add <manifest> --desc "子任务描述" [--id xxx] [--produces "a,b"]
nut gateloop subtask-done <manifest> --id <subtaskId>
nut gateloop emit <manifest> --key <key> --kind file|value [--path xxx] [--value xxx]
nut gateloop metric <name> --input <file>
```

其他子命令：

```bash
nut exec tsc --noEmit                          # 跨端命令执行器
nut request GET https://api.example.com/health # HTTP/HTTPS 请求
```

### 编程 API

```ts
import { GateLoop, loadManifest } from 'gateloop/engine'

const loop = new GateLoop(loadManifest('./anchor.config.json'))
await loop.init('实现用户列表页') // → 指令：先做 inventory（客观清单）
await loop.next()                 // → 引擎重跑验证，exit 0 才推进
```

`gateloop` 主入口同时导出通用工具函数（`gateloop/helpers`）：

```ts
import { async, data, date, exec, file, http, string, type } from 'gateloop/helpers'
```

## 执行契约（anchor.config.json）

一个 skill 的"执行契约"示例（`frontend-codegen` 前端代码生成 skill 节选）：

```jsonc
{
  "name": "frontend-codegen",
  "maxAttempts": 5,                    // 熔断：每阶段最多试 5 次
  "anchors": [
    { "id": "inventory",               // 阶段 1：客观清单，脚本产出，模型改不了
      "produces": [".specflow/context/inventory.json"],
      "emits": ["inventory"],
      "verify": {
        "produceScripts": ["node ${skillDir}/scripts/inventory.mjs --output .specflow/context/inventory.json"],
        "modelWritable": false,        // 清单只能脚本写，防伪
        "producesFresh": true          // 产物必须比本轮新，防复用旧文件
      }
    },
    { "id": "design",                  // 阶段 2：必须覆盖 inventory 的全部违规
      "consumes": ["inventory"],
      "emits": ["frontendPlan", "architectureReview"],
      "verify": {
        "schema": { "required": ["frontendPlan", "architectureReview"] },
        "custom": [
          "node ${skillDir}/scripts/verify-coverage.mjs --inventory .specflow/context/inventory.json --plan .specflow/context/current.json"
        ],
        "review": { "requireEvidence": true, "checklist": [ /* 逐条 verdict + 带行号证据 */ ] }
      }
    },
    { "id": "code",                    // 阶段 3：强制 tsc + build，exit 0 才放行
      "consumes": ["frontendPlan", "architectureReview"],
      "requiresSubtasks": true,
      "maxAttempts": 8,
      "verify": {
        "tsc": true, "build": true, "producesFresh": true,
        "custom": [
          "npx nut gateloop metric style-crosscheck --dir src/"
        ]
      }
    }
  ]
}
```

## 验证层分工

确定的交给脚本，理解的交给清单——把每个质量要求放进它该在的位置：

| 类别 | 手段 | 说明 |
|---|---|---|
| A 收敛（能编译 / 无 any / 圈复杂度） | exit code | 脚本，100% 确定 |
| B 完备（字段齐全） | schema | 脚本卡"想全没" |
| C 度量（依赖环 / 热点） | 脚本粗筛 → 模型精判 → 回灌 | 半自动 |
| D 主观（拆分合不合理） | review 四道门禁 | 模型评 + 脚本卡形式 |
| E 纯审美 | 不进 verify | — |

## 开发

```bash
pnpm install

pnpm dev          # 开发模式（rollup watch）
pnpm build        # 生产构建
pnpm clean        # 清理 dist
pnpm demo         # 运行 demo

# GateLoop 引擎自守护（用引擎守护引擎）
pnpm guard
pnpm guard:status
pnpm guard:retry
pnpm guard:reset
```

## 目录结构

```
gateloop/
├── src/
│   ├── cli/        # nut CLI 入口（gateloop / exec / request）
│   ├── gateloop/   # GateLoop 门控闭环引擎（状态机、验证、指标等）
│   ├── helpers/    # 通用工具函数（async / data / date / exec / file / http / string / type）
│   ├── index.ts    # 主入口
│   └── types.ts    # 类型定义
└── rollup.config.ts
```

## License

[MIT](LICENSE)
