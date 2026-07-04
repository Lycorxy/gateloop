---
description: Proto 唯一契约规则（权威文件）
globs: ["proto/**/*.proto", "apis/**/*.ts", "client/src/api/**/*.ts", "service/pb/**/*.go"]
alwaysApply: true
---

# Proto 唯一契约规则

## 核心原则

Proto 是所有前后端代码的唯一数据标准。`PRD → Proto-Agent 生成 proto/api.proto → codegen → types.ts + pb/*.go`

## 生成规则

```
proto/api.proto 不存在           → 从 PRD 全量生成
proto/api.proto 存在且与需求对齐 → 仅追加新增 RPC + message
proto/api.proto 存在但与需求无关 → 忽略旧文件，从 PRD 重新生成
⚠️ 禁止：发现 proto 存在就直接使用，不验证是否与本次需求对齐
生成后必须执行：specflow codegen
```

## 当前 Proto

- 文件：`proto/api.proto` | 包名：`trpc.hello_app.service` | 服务：`Knowledge`（28 RPC）

### RPC 清单

分类：ListCategory/CreateCategory/UpdateCategory/UpdateCategoryLinks/DeleteCategory/ReorderCategory/ToggleVisibility
手法：ListMethod/GetMethod/CreateMethod/UpdateMethod/DeleteMethod/ReorderMethod
版本：ListVersion/GetVersion/SaveSnapshot | 搜索：SearchKnowledge
AI：ListConventionCategoryTree/ListCoreHeadings/GenerateAi/GetAiTaskInfo/GetConventionContent/ApplyAiContent
编辑状态：GetEditingStatus/Heartbeat/ClearEditingStatus
变更：GetChangeImpact/CreateChangeNotify/GetPendingUpdatesSummary/ListPendingUpdates/ResolveChangeNotify/BatchResolveChangeNotify/GetVersionDiff

## 硬规则

```
字段 snake_case | 分页 page/page_size/total | 列表 repeated XxxInfo list
每个 RPC 独立 Request+Response message | 服务名 trpc.hello_app.service.Knowledge
```

## 命名转换 → 详见 tech-stack-and-design.mdc 三、命名转换规则

## 变更流程

`PRD 变更 → Proto-Agent 更新 → codegen → Impact-Agent 分析 → 各 Agent 同步`
