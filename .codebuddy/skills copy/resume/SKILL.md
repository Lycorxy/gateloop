---
name: resume
description: >
  断点继续。Phase 0 读 scratchpad + search_all + build_context 恢复上下文，确认文件状态后委托 dev/fix 继续执行。触发词：继续、上次、接着、恢复。
version: 2.1.0
dependencies: [specflow-rules-engine]
conflict-with: [dev, fix, archive]
allowed-tools: [read_file, write_file, search_content, execute_command, use_skill, mcp_call_tool]
max-token: 1200
---

# Resume — 断点继续 v2.1

**流程：读 scratchpad → search_all → build_context → 确认 → 委托 → 更新**

---

## Phase 0 — 恢复状态

### 0.1 读 scratchpad

```yaml
serverName: specflow-cognitive-engine
toolName: scratchpad
arguments:
  task_id: "{上次 task_id}"
  action: read
```

恢复报告：
```
📋 恢复：{title}
✅ Phase 0-1 完成
🔄 Phase 2 进行中（已生成{N}文件）
⏳ Phase 3-5 待办
```

### 0.2 search_all

```yaml
serverName: specflow-cognitive-engine
toolName: search_all
arguments:
  storage_dir: .specflow/memory
  project_root: .
  query: "{任务关键词}"
  top_k: 3
```

### 0.3 build_context

```yaml
serverName: specflow-context-broker
toolName: build_context
arguments:
  task_type: "{dev 或 fix}"
  query: "{scratchpad 中的任务描述}"
  task_id: "{同上}"
  max_tokens: 8000
  max_results: 5
  rules_paths:
    - .codebuddy/skills/electron-codegen/knowledge/service-management.md
    - .codebuddy/skills/electron-codegen/knowledge/ipc-patterns.md
    - .codebuddy/skills/electron-codegen/knowledge/electron-process.md
    - .codebuddy/skills/electron-codegen/knowledge/code-templates.md
```

---

## Phase 1 — 确认文件状态

```
├─ 未修改 → ✅ 跳过
├─ 外部修改 → ⚠️ 对比差异
├─ 被删除 → ⚠️ 重生成
└─ pkg/tsconfig 变化 → ⚠️ 调整
```

---

## Phase 2 — 委托

```
type=dev → use_skill("dev") 从 Phase 2 继续
type=fix → use_skill("fix") 从 Phase 3 继续
```

---

## Phase 3 — 更新

```yaml
serverName: specflow-cognitive-engine
toolName: scratchpad
arguments:
  task_id: "{task_id}"
  action: append
  key: status
  content: |
    status: {completed/updated}
    resumed_at: {ts}
```

### 自进化报告

```
🧬 resume 自进化

🔄 恢复：{成功/失败}
📋 文件一致：{是/否，不一致原因}
🔧 MCP：scratchpad{OK/FAIL} search_all{OK/FAIL} build_context{OK/FAIL}

💡 优化项：
- 文件经常不一致→scratchpad 记录不完整
- scratchpad 经常空→dev/fix 未正确记录
```

---

## 错误处理

| 场景 | 处理 |
|------|------|
| scratchpad 空 | 提示"无未完成任务" |
| task_id 未提供 | 列最近 5 条让用户选 |
| 文件全丢 | 等同重执行（dev） |

## 验证清单

- [ ] Phase 0: scratchpad + search_all + build_context
- [ ] Phase 1: 文件状态已确认
- [ ] Phase 2: 正确委托
- [ ] Phase 3: scratchpad 已更新 + 自进化
