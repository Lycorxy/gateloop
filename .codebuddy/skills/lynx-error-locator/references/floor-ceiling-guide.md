# lynx-error-locator 脚本/模型分工判定表

> 依据 skill-creator-gateloop 5 类分工框架（A 收敛/B 完备/C 度量/D 主观/E 审美），
> 逐条标注本 skill 质量要求的归属与 verify 落点。

## 判定表

| # | 质量要求 | 类型 | 归属 | verify 落点 |
|---|---|---|---|---|
| 1 | 产物文件存在且新鲜（error-data/brief/localization/report） | A 收敛 | 脚本 exit code | `producesExist` + `producesFresh` |
| 2 | error-brief 必含 masterPrompt/userDescription/dataSource/noErrors | B 完备 | 脚本 schema | anchor `extract` → `schema` |
| 3 | error-localization 必含 cause/codeLocations/confidence/evidence | B 完备 | 脚本 schema | anchor `locate` → `schema` |
| 4 | codeLocations[].file 真实存在、line 在文件行数范围内 | A 收敛 | 脚本 exit code | anchor `locate` → `custom`（verify-localization.cjs） |
| 5 | 报告五章节齐全（主提示词/原因/位置/方案/交接）+ 非空壳 | A 收敛 | 脚本 exit code | anchor `resolve` → `custom`（verify-report.cjs） |
| 6 | 大 JSON 提取为摘要、截断脱敏（token/cookie 只留 key） | A 收敛 | 确定性脚本本身 | extract-error.cjs 设计保证 |
| 7 | 事件统计/级联聚合/失败请求计数（facts） | C 度量回灌 | 脚本粗筛 → 模型精判 | error-data.json 的 eventStats/cascadingSummary/failedCount 供模型消费 |
| 8 | 证据链完整（每个结论 JSON 证据 + 代码证据） | D 主观可评审 | review.model | anchor `locate` → `review[evidence-chain]` |
| 9 | 根因深度（表象 vs 根因，不照抄归因预判） | D 主观可评审 | review.model | anchor `locate` → `review[root-cause-depth]` |
| 10 | 定位准确（位置与证据逻辑关联，certainty 分级一致） | D 主观可评审 | review.model | anchor `locate` → `review[localization-accuracy]` |
| 11 | 反证排查（竞争假设排除理由） | D 主观可评审 | review.model | anchor `locate` → `review[hypothesis-exclusion]` |
| 12 | masterPrompt 措辞/报告可读性 | E 纯审美 | 模型自由 | 不进 verify |

## 分工总结

```
脚本划地板（不可协商）：
  产物存在/新鲜、schema 字段齐全、代码位置真实、行号有效、报告章节完备
  —— 模型编造文件/行号/空壳报告都会被 exit code 拦下

模型冲天花板（自由推理）：
  归因推理、根因挖掘、假设排查、证据组织、方案设计
  —— review.model 四道门禁（完整性/防伪/证据/阻断）逼"填跑不掉的表"，
     但不预设唯一正确答案（同一错误允许多条合理论证路径）

度量回灌（C）：
  eventStats / cascadingSummary / failedCount / longTasks 统计
  —— 脚本陈述客观事实，是否构成根因由模型精判
```

## 边界说明

- 本 skill 无代码产出 → 不配 tsc/lint/stylelint/build
- 分析型任务主观维度集中在「定位质量」→ review 只配 4 项（克制，避免打卡通胀）
- 「解决方案好不好」不配 review——方案只是草案（修复属后续流程），方案可行性由后续流程验证
