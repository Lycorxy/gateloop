# 完整 Skill 示例：code-review-check v2

一个展示 v2 最佳实践（含 RULE.mdc + 规则注入 + 任务式流程）的生产级 skill。

## 文件：RULE.mdc

```markdown
---
description: 代码评审铁律。当执行代码评审、检查 bug、代码审查时必须加载此规则。包含：安全审计铁律、逻辑检查铁律、质量检查铁律、输出格式铁律、验证清单。
alwaysApply: true
enabled: true
updatedAt: 2026-07-03T10:00:00.000Z
provider:
---

# 代码评审 — 强制约束（System Prompt 级）

## 铁律 0 — 评审流程（强制 · 最高优先级）

🔒 评审流程中的每个 Step 必须按序执行，不得跳过。

### Step 0：规则注入（🔒 强制 · 不可跳过）

评审开始前必须先调用 use_skill("specflow-rules-engine") 注入本规则。

## 铁律 1 — 安全审计（所有文件必须检查）

| 检查项 | 要查找的内容 |
|-------|------------|
| 注入 | SQL/NoSQL/命令/HTML 注入向量 |
| 密钥 | 源代码中硬编码的密钥、令牌 |
| XSS | 响应中未转义的用户输入 |

## 铁律 2 — 输出格式（强制）

所有发现必须按以下格式报告：
[文件]:[行号] — [严重程度] — [问题标题]
```

## 文件：SKILL.md

```markdown
---
name: code-review-check
description: >
  执行彻底的代码评审，检查 bug、安全漏洞、
  命名违规和性能问题。当用户请求
  代码评审、review code、code review、检查 bug、查找问题、
  优化现有代码或检查 PR 变更时使用。
  不要用于编写新功能、回答语法问题、
  生成样板代码或评审非代码文档。
version: 2.0.0
dependencies: [specflow-rules-engine]    # 🔒 强制依赖
conflict-with: []
allowed-tools: [read_file, search_content]
max-token: 2000
---

# 代码评审检查器 v2

> 核心定位：先注入规则、再系统化评审、最后逐条验证交付。

## 🛑 入口守卫

```
本 Skill 加载后必须按顺序执行 Step 0→1→2→3→4→5 全部步骤。
每步必须播报对应完成消息。未播报的步骤 = 未执行 = 违规。
```

## 工作流总览

```
🔒 Step 0: 规则注入（强制·不可跳过）
    ↓ use_skill("specflow-rules-engine")
Step 1: 读取并映射文件
Step 2: 安全审计
Step 3: 逻辑检查
Step 4: 质量检查
Step 5: 输出报告并验证
```

## 核心工作流

### Step 0：规则注入（🔒 强制 · 不可跳过）

调用 `use_skill("specflow-rules-engine")` → 同步 RULE.mdc → 检测注入 → 兜底。

**播报：** `"✅ [Step 0] 规则注入完成"`

### Step 1：读取并映射文件

[低自由度] 完整读取所有目标文件...

### Step 5：输出报告

⚠️ 交付前必须逐一验证（RULE.mdc 铁律 2 约束）：
- [ ] 每个问题都有具体行号
- [ ] 无假阳性
- [ ] 总结与详细发现匹配

## 中断与恢复机制

若中断后恢复，扫描已有输出，播报恢复点，从断点继续。

## 错误处理

[同 v1]
```

## 文件：skill.config.yaml

```yaml
priority: 85
auto-trigger: true
trigger-keywords:
  - 代码评审
  - review code
  - code review
  - check for bugs
  - 查bug
  - 代码优化
depends-on:
  - specflow-rules-engine              # 🔒 强制依赖
mutual-exclude: []
require-tools: [read_file, search_content]
load-strategy: lazy
unload-after-run: true
max-duration: 180
trigger-weight:
  代码评审: 95
  review code: 90
  查bug: 80
  代码优化: 60
```

## 文件：examples/triggers.json

```json
{
  "should_trigger": [
    "帮我review一下这个文件",
    "检查这段代码有没有隐藏bug",
    "review src/auth/login.ts"
  ],
  "should_not_trigger": [
    "帮我写一个登录接口",
    "JS for循环语法怎么用"
  ]
}
```

## v1 → v2 关键变化

| 维度 | v1（旧） | v2（新） |
|------|---------|---------|
| RULE.mdc | ❌ 无 | ✅ 有（alwaysApply: true） |
| Step 0 规则注入 | ❌ 无 | ✅ use_skill("specflow-rules-engine") |
| dependencies | `[]` | `[specflow-rules-engine]` |
| 入口守卫 | ❌ 无 | ✅ 强制步骤执行 |
| 中断恢复 | ❌ 无 | ✅ 扫描 + 播报 + 续接 |
| 每步播报 | ❌ 无 | ✅ 播报完成消息作为检查点 |
