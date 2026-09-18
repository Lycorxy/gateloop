---
name: lynx-error-locator
description: >
  分析 lynx-web 导出的错误收集数据（lynx-data-*.json / lynx-recording-*.json），
  定位错误原因和代码位置：提取错误与用户描述组装主提示词（master prompt）→
  结合 JSON 内 DOM/网络/路由/日志/内存/性能数据与项目代码交叉分析 →
  输出错误定位报告与解决方案草案（临时记录，修复交给后续流程）。
  当用户提供 lynx-data/lynx-recording 导出 JSON 并说 分析错误、定位错误、
  错误分析、错误收集、这个错误收集的就是、分析这个 json、报错定位、
  找出问题在哪 时使用。
  不要用于 直接修复代码、编写新功能、分析非 lynx-web 导出的 JSON、纯回放查看。
version: 1.0.0
dependencies: []
conflict-with: []
allowed-tools: [read_file, write_to_file, search_content, search_file, execute_command]
max-token: 1800
---

# Lynx 错误定位分析

## 概述

从 lynx-web 导出的错误收集 JSON 中定位错误原因和代码位置：提取「错误 + 用户描述」组装成主提示词（交给后续修复模型），结合 JSON 内 DOM/网络/路由/日志/内存/性能数据与项目代码交叉分析，产出错误定位报告与解决方案草案。**本 skill 到报告产出即结束，不修复代码**（修复是后续流程）。

## 何时使用 / 何时不使用

- 使用：用户拖拽/提供 `lynx-data-*.json` 或 `lynx-recording-*.json` 并要求分析错误、定位错误、找出问题
- 不使用：直接修复代码、编写新功能、分析非 lynx-web 导出的 JSON、仅回放录制数据

## 🛑 入口守卫

```
本 Skill 被 use_skill 加载后，必须按顺序执行 Step 0→1→2→3 全部步骤。
每步必须播报完成消息（含关键结论）。未播报 = 未执行 = 违规。
本 Skill 由 ADS harness 驱动（anchor: extract → locate → resolve），
规则由 reads 内联（RULE.mdc），产物由 verify 门禁（schema + custom 脚本 + review）。
禁止行为：
  ✗ 跳过 Step 0 直接分析
  ✗ 对大 JSON 直接 read_file（必须走 extract-error.cjs）
  ✗ 开始修改源码（职责边界：只定位不修复）
唯一例外：同会话已执行并播报过的步骤可跳过，但必须声明 ⏭️ [跳过] Step N — 原因 | 风险
```

## 核心工作流

### Step 0：定位数据文件

[低自由度·决策树] 执行：

```
1. 用户消息中给了文件路径（@引用/文字路径）
   → 校验文件存在 → 记为 DATA_FILE，播报路径
2. 未给路径 → 在工作区搜索 lynx-data-*.json / lynx-recording-*.json
   （search_file 递归；忽略 .specflow/ 和 node_modules/）
3. 找到多个 → 按 mtime 取最新，播报候选清单让用户确认（有疑问就问）
4. 一个都没有 → 请用户提供文件路径，⛔ 阻断等待
```

约束：`DATA_FILE` > 512KB 时，后续步骤**禁止**对其直接 `read_file`（铁律 1）。

**播报完成：** `"✅ [Step 0] 数据文件定位完成：<DATA_FILE>"`

### Step 1：提取错误与用户描述 → 主提示词

[低自由度] 执行：

1. 运行提取脚本（确定性，处理 v1/v2、截断、脱敏）：
   `node .codebuddy/skills/lynx-error-locator/scripts/extract-error.cjs <DATA_FILE> --out .specflow/context/error-data.json`
2. `read_file` 读取 `.specflow/context/error-data.json`（摘要 <100KB）
3. 从**当前对话的用户消息**中提取用户对问题的口头描述（原文摘录，含页面上看到的现象、什么操作后出现等）；用户没说 → 记 `"（用户未提供描述，仅提交了错误数据）"`
4. 组装 `.specflow/context/error-brief.json` 并写入：

```jsonc
{
  "userDescription": "<用户描述原文>",
  "dataSource": { "file": "<DATA_FILE 绝对路径>", "format": "v2|v1", "pageUrl": "...", "route": "..." },
  "noErrors": <error-data.noErrors>,
  "primaryErrors": [<primary 错误 kind+message 精简>],
  "masterPrompt": "<按下方模板组装>"
}
```

5. masterPrompt 模板（这是交给后续修复模型的主提示词）：

```text
【用户描述】<userDescription>
【页面与路由】<pageUrl> → <routePath>（query: <关键参数>）
【主要错误】<每个 primary error 一行：kind + message 精简>
【级联错误】<cascadingSummary 聚合，每行：kind × count + sample>
【环境】<userAgent 摘要> / 生命周期 <pageLifecycle> / 录制窗口 <windowDuration>ms
【数据文件】<DATA_FILE>（修复时需要更多上下文按此文件深挖）
```

6. `noErrors=true` 分支：主提示词聚焦用户描述的现象（性能/白屏/内存/体验问题），进入 Step 2 按对应诊断维度分析。

**播报完成：** `"✅ [Step 1] 主提示词就绪：主要错误 N 个（kind 列表），用户描述：<摘要>"`

### Step 2：定位错误原因与代码位置

[高自由度·启发式推理] 消费 error-data.json + masterPrompt：

1. **按归因决策树分析**（完整战术见 references/analysis-playbook.md，引擎已内联）：

```
attribution.type（导出端预判，可推翻）:
├── api        → 查 network.failed/slowCount、status=0 看-error-字段；定位：搜接口路径片段
├── data       → 查 storageKeys/console 数据日志；定位：搜 localStorage key / 字段名
├── logic      → 查 primary[].stack / console.errorWarn[].stack；定位：stack 帧指向文件 + 消息文本搜索
├── resource   → 查失败资源 URL（data:URI=内联SVG / 外链=动态生成）；定位见 playbook resource 战术
├── performance/memory → 查 longTasks/slowRequests/内存趋势；定位：任务名/接口路径搜索
└── unknown    → 全维度排查：primary 错误 → 时间线重建 → 网络+控制台交叉
```

2. **与项目代码交叉验证**（每条结论都要有 JSON 证据 + 代码证据）：
   - 错误消息/日志文本 → `search_content` 项目源码（如 `didShow--->createAppInitializer`）
   - 失败接口路径 → 搜 URL 片段（如 `scene_asst/union_auth`）
   - 路由 `routePath` → 找路由配置与页面组件
   - 资源 URL → 搜域名/路径片段；搜不到 → 数据来自接口响应 → 定位消费该数据的组件
   - 需要查 rrweb DOM 时：用 node 命令按需提取（模板见 playbook，禁止整读）
3. **排除竞争假设**：每个备选原因写明支持/排除的证据
4. 写入 `.specflow/context/error-localization.json`：

```jsonc
{
  "cause": { "rootCause": "<根因，区分表象与根因>", "category": "api|data|logic|resource|performance|memory|unknown" },
  "codeLocations": [
    { "file": "src/xxx.ts", "line": 123, "symbol": "函数/组件名", "certainty": "confirmed|likely|candidate", "evidence": "<为什么指向这里>" }
  ],
  "confidence": "high|medium|low",
  "evidence": ["<JSON 数据证据>", "<代码证据>"],
  "excludedHypotheses": [{ "hypothesis": "...", "whyExcluded": "..." }],
  "openQuestions": ["<定位不足时待澄清的问题>"]
}
```

约束：找不到位置 → `certainty: "candidate"` + openQuestions，**禁止编造行号**（verify-localization.cjs 会校验文件存在与行号有效）。

**播报完成：** `"✅ [Step 2] 定位完成：<根因一句话>，代码位置 N 处（确定性分布），置信度 <confidence>"`

### Step 3：临时记录与解决方案（交接，本 skill 到此结束）

[中自由度] 执行：

1. 按 `assets/report-template.md` 写 `.specflow/context/error-analysis-report.md`，五要素：
   - 主提示词（原文，后续修复模型直接用）
   - 错误原因（根因 + 证据链 + 已排除假设）
   - 代码位置（表格：文件/行号/符号/确定性/证据）
   - 解决方案（草案：改什么、怎么改、影响面；**不展开成完整代码**）
   - 交接说明（后续修复流程如何使用主提示词与本报告、验证建议、openQuestions）
2. 运行校验：`node .codebuddy/skills/lynx-error-locator/scripts/verify-report.cjs .specflow/context/error-analysis-report.md`
3. **本 skill 结束**——向用户展示报告核心结论（根因 + 代码位置 + 方案一句话），声明"修复交由后续流程，可直接把报告主提示词交给修复模型"。

**播报完成：** `"✅ [Step 3] 错误定位报告已产出（临时记录）：.specflow/context/error-analysis-report.md — 本 skill 结束，修复交由后续流程"`

## 中断与恢复机制

若执行中断，重新继续时必须：

1. 检查 `.specflow/context/` 下产物：`error-data.json` / `error-brief.json` / `error-localization.json` / `error-analysis-report.md`
2. 播报恢复点：
   ```
   ⏯️ [恢复] 上次进度：N/4 步完成
   已完成：✅ Step 0…（列产物）
   断点：从 Step N 继续（产物 mtime 判断是否需重跑）
   ```
3. 从断点继续，不重复不遗漏；`error-data.json` 过旧（源文件更新过）→ 重跑 Step 1 脚本

## 输出格式

最终报告使用 `assets/report-template.md`（灵活模板，可按错误类型增删小节，但五个必需章节不可少）。

## 错误处理

| 错误场景 | 处理 |
|---|---|
| DATA_FILE 不存在 / JSON 解析失败 | 播报具体原因，请用户重新提供文件，⛔ 阻断 |
| 文件 > 512KB 被 read_file 拒绝 | 正常路径——一律走 extract-error.cjs，不重试直接读 |
| noErrors=true（数据无错误事件） | 转入性能/白屏/内存/体验分析路径，masterPrompt 聚焦用户描述现象 |
| 找不到代码位置 | certainty=candidate + openQuestions，禁止编造；报告如实写"定位不足" |
| verify-localization / verify-report 失败 | 按失败清单修复产物后重跑（最多 3 轮），仍失败 → 报告用户 |
| v1 格式数据 | 脚本已兼容（storage 全量、自研 dom 事件忽略），播报 format=v1 |

## 验证清单

- [ ] DATA_FILE 已确认存在，且 >512KB 时未直接 read_file
- [ ] error-brief.json 含 masterPrompt / userDescription / dataSource / noErrors
- [ ] 每个 codeLocation 的 file 真实存在、行号有效、evidence 非空
- [ ] 每个结论有 JSON 证据 + 代码证据双重支撑，竞争假设已排查
- [ ] 报告五章节齐全（主提示词/错误原因/代码位置/解决方案/交接）
- [ ] 未修改任何源码（只定位不修复）
- [ ] 敏感值（token/cookie/用户信息）未出现在任何产物中

## 参考资料

- `references/json-format-guide.md` — lynx-data JSON 格式速查（字段表 + 数据语义陷阱）
- `references/analysis-playbook.md` — 归因决策树 + 代码定位战术 + rrweb 深挖命令模板
- `references/floor-ceiling-guide.md` — 本 skill 脚本/模型分工判定表
- `assets/report-template.md` — 错误定位报告模板
- `examples/trigger-examples.md` — 正向/负向触发示例
