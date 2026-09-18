# lynx-data JSON 格式速查

> 完整规范见项目根 `PLAYBACK-FORMAT.md`。本文只保留错误定位所需的最小集。
> 文件名：`lynx-data-<ts>.json`（完整导出）/ `lynx-recording-<ts>.json`（仅回放）。

## 目录
- [顶层结构](#顶层结构)
- [report（LLM 可读诊断报告）](#reportllm-可读诊断报告)
- [session.events 事件类型](#sessionevents-事件类型)
- [数据语义陷阱](#数据语义陷阱)

## 顶层结构

```jsonc
{
  "version": "2.0",            // v2 判据：version === "2.0" && !!encoding；否则 v1
  "pageUrl": "...",
  "createdAt": 1787560089866,
  "encoding": { "version": "diff-v1", "storage": {...}, "dom": "rrweb...", "network": "全量, body 截断 50KB" },
  "recording": { "events": [/* rrweb eventWithTime[]，DOM 唯一来源 */] },
  "session": { "meta": {...}, "events": [/* RecorderEvent[] */], "storage": {...}, "performance": {...}, "memory": {...} },
  "annotations": {...},        // 用户标注（画笔/高亮/打码）
  "report": {...}              // 自动诊断报告（LLM 可读）——分析首选入口
}
```

## report（LLM 可读诊断报告）

```
report
├─ meta        createdAt / url / userAgent / title / pageLifecycle（interacting 等）/ windowDuration
├─ timeline[]  按时间排序的关键事件摘要（error/network/action/console）
├─ errors      { primary[], cascading[], loops[] }  错误分级
├─ diagnostics { whiteScreen, memoryLeak, performance }
├─ scene       { dom(通常 null), network[], operations[], storage, console[] }
├─ attribution { type: api|data|logic|resource|unknown, confidence, reasoning, evidence[], suggestions[] }
└─ context     { performance, memory, perfEntries }
```

- `errors.primary[]`：主错误，含 `kind`、`message`、`filename`、`timestamp`、`precedingEvents[]`（错误前事件，重建时间线金矿）
- `errors.cascading[]`：级联错误（重复/同源）
- `attribution`：导出端预判归因——**可推翻**，模型必须交叉验证而非照抄
- `diagnostics.whiteScreen.detected`：v2 判据 = `textLength < 20 && nodeCount < 50`

## session.events 事件类型

公共字段：`type` / `timestamp`（Date.now 毫秒）/ `seq`（全局自增，**排序用 seq 不用 timestamp**）

| type | 关键字段 | 定位用途 |
|---|---|---|
| `error` | kind / message / filename | 错误本体 |
| `console` | level(log/info/warn/error/debug) / args / error 级附 stack | 时间线 + 日志文本→代码搜索 |
| `network` | url / method / status / duration / requestBody / responseBody / mocked / error | 接口失败/慢请求/mock 命中 |
| `action` | action(click 等) / target(CSS 选择器) / x,y | 用户操作轨迹 |
| `storage` | kind=full/diff（v2 差分协议） | 存储变化 |
| `performance` | timing / entries | 性能指标 |
| `memory` | usedJSHeapSize / totalJSHeapSize / jsHeapSizeLimit | 内存快照 |

## 数据语义陷阱

1. `network.status === 0` = **网络层失败**（CORS/断网/DNS），不是 HTTP 状态码；此时看 `error` 字段
2. storage diff 中 cookie 空串 = **未变化**，不是被清空
3. `responseBody` 的 `[binary data-uri NB]` = 二进制占位标记（NB 为原始字节数），无法还原
4. `input.value` 是 `[N chars]` 脱敏格式，无法还原明文（设计如此）
5. v1 数据：无 `encoding` 字段；storage 全量；可能含自研 `dom` 事件（kind=full/incremental，回放忽略）
6. v2 `scene.dom.initial/errorMoment` 通常为 null——DOM 归 rrweb 流（`recording.events`）
7. `annotations` / `report` / `session.storage` 切面在导出时一次性生成，无需增量还原
