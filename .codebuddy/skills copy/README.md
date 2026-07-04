# Skill 体系（v11.1）— 3 层分离架构

> 多 Skill 协同 + 任务列表驱动 + 规则按需注入

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1：任务列表（.specflow/context/task-queue.json）       │
│    → 持久化任务队列，模型每次对话读取，按序执行               │
│    → 中断后 /resume 读取继续，全部完成后清空                  │
├─────────────────────────────────────────────────────────────┤
│  Layer 2：Skill 定义（skills/{name}/SKILL.md）               │
│    → 每个 Skill 自带规则引用（references/）                   │
│    → 执行前强制读取规则文件，读完才能生成代码                  │
│    → 入参/出参明确，像函数调用                                │
├─────────────────────────────────────────────────────────────┤
│  Layer 3：规则文件（skills/{name}/references/）               │
│    → 按 Skill 分组，不再全局 alwaysApply                     │
│    → 前端设计规则只有前端 Skill 读取                          │
│    → 后端规则只有后端 Skill 读取                              │
└─────────────────────────────────────────────────────────────┘
```

## Skill 清单

| Skill                 | 目录                          | 触发时机                         |
| --------------------- | ----------------------------- | -------------------------------- |
| init                  | skills/init/                  | 每次新对话开始时（第一步）       |
| requirements-analysis | skills/requirements-analysis/ | 用户提出新需求                   |
| backend-design        | skills/backend-design/        | 类型B，backend-design任务running |
| backend-codegen       | skills/backend-codegen/       | backend-codegen任务running       |
| frontend-design       | skills/frontend-design/       | frontend-design任务running       |
| frontend-codegen      | skills/frontend-codegen/      | frontend-codegen任务running      |
| closure               | skills/closure/               | closure任务running               |
| fix                   | skills/fix/                   | 用户报告bug                      |
| deploy                | skills/deploy/                | 部署需求                         |
| pdf-to-knowledge      | skills/pdf-to-knowledge/      | PDF处理需求                      |
| setup                 | skills/setup/                 | 项目初始化 / 知识库更新          |

```
skills/
├── init/
│   └── SKILL.md                    ← 对话初始化：MCP切换+环境检查+任务队列恢复
│
├── requirements-analysis/
│   └── SKILL.md                    ← Phase 0：需求澄清+类型分类+任务列表生成
│
├── backend-design/
│   ├── SKILL.md                    ← Phase 1A：Proto + DB Schema 设计
│   └── references/
│       ├── proto-contract.md       ← Proto 设计规则
│       └── db-schema.md            ← DB 设计规则
│
├── backend-codegen/
│   ├── SKILL.md                    ← Phase 1B：Go代码 + TS Handler + Go单测
│   └── references/
│       ├── code-conventions.md     ← jsondb API 签名 + TS Handler 规范
│       └── go-codegen.md           ← Go 代码生成规则（分层/命名/技术栈）
│
├── frontend-design/
│   ├── SKILL.md                    ← Phase 2：布局规划 + ASCII线框 + 🔒关卡1
│   └── references/
│       ├── design-tokens.md        ← 设计 Token（色彩/间距/圆角/字体）
│       └── layout-rules.md         ← 布局决策树 + 组件选型 + 线框规则
│
├── frontend-codegen/
│   ├── SKILL.md                    ← Phase 3：TSX+SCSS+Service+Redux + 🔒关卡2
│   └── references/
│       ├── design-tokens.md        ← 设计 Token（SCSS 生成需要）
│       ├── hard-rules.md           ← 硬规则速查（生成前 Gate）
│       ├── react-core.md           ← React 核心强制规则
│       └── frontend-codegen.md     ← 前端代码生成规则（CSS Modules/中台组件/路由/Service）
│
├── closure/
│   └── SKILL.md                    ← Phase 4：图谱+快照+记忆+归档+清空任务列表
│
├── fix/
│   └── SKILL.md                    ← 按需：最小文件集修复（≤3个文件）
│
├── deploy/
│   ├── SKILL.md                    ← 按需：部署配置+迁移脚本
│   └── references/
│       └── tech-stack.md           ← 技术栈版本锁定
│
└── pdf-to-knowledge/               ← 独立工具 Skill
    ├── SKILL.md
    ├── references/
    └── scripts/

└── setup/                          ← 项目初始化 + 知识库同步
    ├── SKILL.md
    └── scripts/
        └── setup.sh                ← 一键安装脚本（可直接 bash 执行）
```

## 执行路径

```
类型A（纯UI）：
  T1:requirements → T2:frontend-design → [🔒关卡1] → T3:frontend-codegen → [🔒关卡2] → T4:closure

类型B（全栈）：
  T1:requirements → T2:backend-design → T3:backend-codegen
  → T4:frontend-design → [🔒关卡1] → T5:frontend-codegen → [🔒关卡2] → T6:closure

类型C（API已就绪）：
  T1:requirements → T2:backend-codegen(Lite: 只读Proto→types.ts)
  → T3:frontend-design → [🔒关卡1] → T4:frontend-codegen → [🔒关卡2] → T5:closure
```

## 入参/出参数据流

```
用户需求 ──→ requirements-analysis
                │ FeatureSpec + task-queue.json
         ┌──────┴──────┬──────────────┐
         │ type=B      │ type=C       │ type=A
         ▼             ▼              ▼
    backend-design   backend-codegen  frontend-design ◄── 直接跳到这里
         │ Proto+DB   │ (Lite:types.ts)
    backend-codegen  frontend-design
         │ Go+Handler+单测  │ FrontendPlan
    frontend-design  [🔒 关卡1]
         │ FrontendPlan     frontend-codegen
    [🔒 关卡1]              │ FrontendArtifacts
    frontend-codegen  [🔒 关卡2]
         │ FrontendArtifacts  closure
    [🔒 关卡2]              │ 归档完成
    closure
         │ 归档完成，清空 task-queue.json
```

## 🔒 不可变约束

详见 `rules/agent-orchestration.mdc`（全局最小规则）
