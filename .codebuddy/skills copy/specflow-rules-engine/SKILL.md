---
name: specflow-rules-engine
description: >
  规则引擎基础设施。当其他 Skill 被加载时需要注入 RULE.mdc 规则时调用。
  负责：1) 同步 RULE.mdc 到 .codebuddy/rules/  2) 检测 System Prompt 是否已注入
  3) 未注入则 read_file 兜底到上下文。
version: 4.0.0
dependencies: []
allowed-tools: [execute_command, read_file, search_content]
max-token: 500
---

# SpecFlow Rules Engine — 强制规则注入

## 执行流程（🔒 强制 · 最高优先级 · 不可跳过）

```
【🔒 不可变约束】
  本 Skill 的三个步骤必须按顺序全部完成，缺一不可。
  跳过任一步骤 = 严重违规，规则可能未生效，后续代码生成/联调操作必须立即停止。
  无任何豁免理由，包括"脚本报错跳过"、"上下文看起来已有规则"、"为了节省token"。
```

当被 `use_skill("specflow-rules-engine")` 调用时，读取调用方 Skill 的 `dependencies` 和上下文，为每个依赖的 Skill 执行：

### Step 1 — 同步规则到 System Prompt（强制）

```bash
node .codebuddy/skills/specflow-rules-engine/scripts/sync-rules.cjs activate <skill-name>
node .codebuddy/skills/specflow-rules-engine/scripts/sync-rules.cjs activate specflow-code-quality
```

> 脚本在 Skill 内部，跨平台 `node` 直接执行，无需额外依赖。

### Step 2 — 检测 System Prompt 是否已注入（强制）

在上下文中搜索 RULE.mdc 的关键内容（如铁律标题、反模式关键词）。已注入 → 跳过 Step 3；未注入 → **必须**执行 Step 3。

### Step 3 — read_file 兜底（强制 · 最后防线）

```typescript
read_file('.codebuddy/skills/<skill-name>/RULE.mdc');
read_file('.codebuddy/skills/specflow-code-quality/quick-ref.md');
read_file('.codebuddy/skills/specflow-code-quality/index.md');
```

> 完成播报：`"✅ Rules Engine 完成：规则已同步 + System Prompt 检测 + 上下文兜底"` — 未播报不得返回调用方。

---

## 脚本参考

```bash
node .codebuddy/skills/specflow-rules-engine/scripts/sync-rules.cjs activate <name>
node .codebuddy/skills/specflow-rules-engine/scripts/sync-rules.cjs deactivate <name>
node .codebuddy/skills/specflow-rules-engine/scripts/sync-rules.cjs scan
node .codebuddy/skills/specflow-rules-engine/scripts/sync-rules.cjs activate-all
node .codebuddy/skills/specflow-rules-engine/scripts/sync-rules.cjs deactivate-all
```
