---
name: archive
description: >
  经验归档+学习管线+治理报告。Phase 0 读 scratchpad + search_all 评估归档价值，分类写 knowledge/ 文件，commit_solution 门控写入，run_learning_pipeline 去重融合，governance_action 生成健康报告。触发词：记录、归档、沉淀、总结、存档。
version: 2.1.0
dependencies: []
conflict-with: [dev, fix, resume]
allowed-tools: [read_file, write_file, search_content, replace_in_file, mcp_call_tool]
max-token: 1200
---

# Archive — 归档模式 v2.1

**流程：读 scratchpad → search_all → 分类 → 写 knowledge/ + commit_solution → learn → govern → 自进化**

---

## Phase 0 — 评估

### 0.1 读 scratchpad

```yaml
serverName: specflow-cognitive-engine
toolName: scratchpad
arguments:
  task_id: "{task_id}"
  action: read
```

### 0.2 search_all（去重检查）

```yaml
serverName: specflow-cognitive-engine
toolName: search_all
arguments:
  storage_dir: .specflow/memory
  project_root: .
  query: "{任务关键词}"
  top_k: 5
```

### 归档判断

| 条件 | 分值 | 必归档？ |
|------|:----:|:----:|
| 🆕 新模式 | ⭐⭐⭐ | ✅ |
| 🐛 踩坑 | ⭐⭐⭐ | ✅ |
| 🔧 非显而易见 | ⭐⭐ | ✅ |
| 🔄 重复 ≥2 次 | ⭐⭐ | ✅ |
| 📊 多文件协作 | ⭐ | 可选 |

---

## Phase 1 — 分类归档

```
Bug 修复     → knowledge/common-issues.md
代码模板     → knowledge/code-templates.md
服务管理     → knowledge/service-management.md
IPC 通信     → knowledge/ipc-patterns.md
数据持久化   → knowledge/data-persistence.md
进程/窗口    → knowledge/electron-process.md
新领域       → knowledge/ 下新建 .md
```

---

## Phase 2 — 引擎写入

### 2.1 commit_solution

```yaml
serverName: specflow-cognitive-engine
toolName: commit_solution
arguments:
  storage_dir: .specflow/memory
  project_root: .
  question: "{原始问题/需求}"
  solution: "{方案/模式描述}"
  changed_files: [{文件列表}]
  category: SOLUTION
  tags: ["electron", "{分类}"]
  verified: true
```

### 2.2 write_memory

```yaml
serverName: specflow-cognitive-engine
toolName: write_memory
arguments:
  storage_dir: .specflow/memory
  text: "{归档标题}：{摘要}"
  kind: KNOWLEDGE
  domain: electron
  tags: "electron,archive,{分类}"
  severity: medium
  source: archive-skill
```

### 2.3 run_learning_pipeline

```yaml
serverName: specflow-cognitive-engine
toolName: run_learning_pipeline
arguments:
  storage_dir: .specflow/memory
  mode: full-pipeline
```

---

## Phase 3 — 治理 + 自进化

```yaml
serverName: specflow-cognitive-engine
toolName: governance_action
arguments:
  storage_dir: .specflow/memory
  action: health-report

# feedback
serverName: specflow-cognitive-engine
toolName: feedback
arguments:
  storage_dir: .specflow/memory
  id: "{memory id}"
  helpful: true
  reason: "归档完成"
```

### 自进化报告

```
🧬 archive 自进化

📦 归档：{标题} → {目标文件}

📚 知识库：
  文档{N}  新增{N}
  commit_solution{OK/REJECTED}
  评分{healthy/needs-cleanup}

🧠 记忆库：
  总数{N}  冲突{N}  待审{N}
  EPISODIC→KNOWLEDGE 升级{N}
  INCIDENT deprecated{N}

🔄 学习管线：
  observe{OK/FAIL} distill{OK/FAIL} consolidate{OK/FAIL} associate{OK/FAIL}
  合并{N}条 新关联{N}对

🔧 MCP：search_all{OK} commit_solution{OK} write_memory{OK} learn{OK} govern{OK}

💡 优化项：
- 合并{N}条重复→检查是否同一问题多次归档
- 冲突{N}条→需人工审查
- 某类归档频繁→需从架构层面解决
```

---

## 错误处理

| 场景 | 处理 |
|------|------|
| scratchpad 空 | 询问用户描述 |
| 不值得归档 | 告知跳过 |
| commit_solution 被拒 | 修正后重试 |
| learn 失败 | 跳过，记录日志 |
| govern 失败 | 手动统计 |

## 验证清单

- [ ] Phase 0: scratchpad + search_all，归档价值判定
- [ ] Phase 1: knowledge/ 文件已更新
- [ ] Phase 2: commit_solution + write_memory + run_learning_pipeline
- [ ] Phase 3: governance_action + feedback + 自进化报告
