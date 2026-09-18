# 错误定位分析报告（临时记录）

> 灵活模板：按错误类型可增删小节，但**五个必需章节不可少**（verify-report.cjs 校验）：
> 主提示词 / 错误原因 / 代码位置 / 解决方案 / 交接。
> 本报告是定位阶段的产物，修复由后续流程执行。

---

**数据源**：`{dataSource.file}`（format: {dataSource.format}）
**页面**：{meta.pageUrl}
**路由**：{route.routePath}（query: {route 关键参数}）
**生成时间**：{生成时间 ISO}

## 一、主提示词（master prompt — 后续修复模型直接使用）

```text
{masterPrompt 原文——从 error-brief.json 复制，逐字不改}
```

## 二、错误原因

### 根因

{cause.rootCause —— 一句话根因 + 展开说明：哪段代码的哪个行为导致了什么现象}

### 归类

{cause.category}（导出端预判 attribution.type={type}，本次分析 {验证一致 / 推翻，理由}）

### 证据链

1. {JSON 数据证据：字段 + 值 + seq/时间戳，如 "network.failed[0] status=0, error='网络请求失败（CORS）'"}
2. {代码证据：文件 + 行号 + 内容摘要}
3. {时间线证据：错误前最后用户操作/日志}

### 已排除的竞争假设

| 假设 | 排除理由 |
|---|---|
| {hypothesis} | {whyExcluded} |

## 三、代码位置

| # | 文件 | 行号 | 符号 | 确定性 | 证据摘要 |
|---|------|------|------|--------|----------|
| 1 | src/xxx.ts | 123 | functionName | confirmed | {evidence 一句话} |
| 2 | src/yyy.tsx | — | XxxComponent | likely | {evidence 一句话} |

> certainty 含义：confirmed=直接证据命中 / likely=强关联 / candidate=间接关联（待澄清）。
> 未写行号 = 证据不足以定位到行，禁止猜测。

## 四、解决方案（草案 — 未实施）

**方案概述**：{改什么、怎么改、影响面，1-3 段。写到"后续修复模型能直接开工"的粒度，不展开完整代码。}

- 修改点 1：{文件 + 预期变更}
- 修改点 2：{...}
- 风险与影响面：{影响的调用方/页面/兼容性}
- 验证建议：{修复后如何验证——按本次错误的复现路径}

## 五、交接说明（后续修复流程）

- 后续修复模型直接使用「一、主提示词」作为修复指令输入
- 优先修改位置：见「三、代码位置」（按 certainty 从高到低）
- 需要更多运行时上下文时，按主提示词中的数据文件路径深挖（rrweb DOM 深挖命令见 skill 的 analysis-playbook.md）
- 待澄清问题（openQuestions）：
  - {openQuestion 1}
  - {openQuestion 2}
