# 错误归因分析手册（定位战术）

> 定位目标：确定「错误原因 + 代码位置」，产出带证据链的 error-localization.json。
> 核心原则：每条结论 = JSON 数据证据 + 项目代码证据，双重支撑。

## 目录
- [归因决策树](#归因决策树)
- [api 类战术](#api-类战术)
- [data 类战术](#data-类战术)
- [logic 类战术](#logic-类战术)
- [resource 类战术](#resource-类战术)
- [performance / memory 类战术](#performance--memory-类战术)
- [unknown / noErrors 路径](#unknown--noerrors-路径)
- [时间线重建](#时间线重建)
- [代码定位交叉验证](#代码定位交叉验证)
- [rrweb DOM 深挖命令模板](#rrweb-dom-深挖命令模板)

## 归因决策树

以 `error-data.json` 的 `attribution.type` 为**起点**（导出端预判，可推翻），结合 `errors.primary` 实际 kind：

```
primary.kind = JS 运行时错误(TypeError 等) ──────────→ logic 战术
primary.kind = 资源加载失败 + URL 是 data:URI 内联图  → resource 战术（内联 SVG）
primary.kind = 资源加载失败 + URL 是外链/动态 URL    → resource 战术（动态资源）
network.failedCount > 0 或 status=0 存在             → api 战术
diagnostics.whiteScreen.detected = true              → 白屏路径（jsErrorBeforeFcp?）
diagnostics.memoryLeak.detected = true               → memory 战术
diagnostics.performance.longTasks 多/慢请求多         → performance 战术
attribution.type = data（存储/数据格式）              → data 战术
其他                                                  → unknown 全维度排查
```

注意：`attribution.type` 是按错误事件多数投票的预判（如 resource），**多数 ≠ 根因**——11 个资源加载失败可能全部源于同一段生成 URL 的代码，根因在 logic。

## api 类战术

特征：`network.failedCount > 0` 或请求 status=0。

1. 逐条看 `network.failed[]`：
   - `status === 0` → 网络层失败（CORS/断网/DNS），读 `error` 字段描述；常见于跨域代理配置问题
   - `status >= 400` → 读 URL + 接口路径
2. 代码定位：取 URL **路径片段**（如 `scene_asst/union_auth/UserChatAGUIStatus`）→ `search_content` 项目代码
3. 检查 `mocked/mockRuleId`：请求被拦截规则替换过，可能是 mock 配置问题而非业务代码
4. 时序交叉：失败请求的 `timestamp` 前后有哪些 `console` / `action` 事件（用户点了什么触发的请求）
5. 检查 `requestBody`（error-data 已截断，需要完整 body 时按数据语义陷阱规则处理）
6. 所有请求都 200 但业务仍报错 → 检查 `responseBody` 内容是否符合前端预期（data 类）

## data 类战术

特征：接口返回数据格式不符 / 存储异常 / 状态丢失。

1. `storageKeys.localStorage` 逐个 key → `search_content` 搜 key 名（如 `__lynx_current_domain__`）定位读写代码
2. `console.recent` 中业务数据日志（如 `传入参数 [object Object]`）→ 搜日志文本找打印位置，顺藤摸瓜
3. 接口 200 但数据异常 → 找前端消费该响应的代码：搜接口路径 → 请求调用点 → 响应处理逻辑
4. v2 storage 差分：注意 cookie 空串 = 未变化（陷阱 2）

## logic 类战术

特征：JS 运行时错误（kind 含 TypeError/ReferenceError/SyntaxError 或消息为异常文本）。

1. `primary[].stack` 逐帧解析：
   - 优先找**项目内文件**帧（非 node_modules/内部帧）
   - 打包产物（bundle.js/chunk-xxx）里的行号**不可直接用**——用消息文本搜索代替，行号留给源码文件
2. 错误消息文本 → `search_content` 搜消息模板（如自定义 Error 消息、断言文本）
3. **金矿**：`primary[].precedingEvents[]` —— 错误前最后一条业务 console 日志 → 搜该日志文本 → 定位到代码执行点，错误就在其后的执行路径上
4. 结合 `actions[]`：错误前的最后用户操作（target CSS 选择器）→ 定位组件

## resource 类战术

特征：资源加载失败（message 含 `[img]` / `[script]` / `[taro-image-core]` 等标签 + URL）。

**内联 data:URI 资源失败**（如 `data:image/svg+xml;charset=utf-8,...`）：
1. 这是内联 SVG 图（常见于占位图/默认头像/图标）
2. `data:URI` 本身加载失败多因格式问题（如 `#` 未编码为 `%23`——SVG 中的颜色值 `#242833` 会截断 URI）
3. 代码定位：取 SVG 特征片段（`viewBox` 值、`path d` 前缀、`circle cx` 等唯一形状参数）→ `search_content` 搜项目代码中引用该 SVG 的位置

**外链/动态资源失败**（如 `https://yzf.qq.com/.../KFPIC_xxx.png?imgsign=...`）：
1. URL 含签名参数（imgsign）→ URL 是**服务端下发**的，不是写死在前端
2. 先搜 URL 片段（域名/路径段如 `kf-file/kf_pic`）确认前端是否有引用
3. 搜不到 → 数据来自接口响应：在 `network.requests` 的响应里找不到（已截断）时，反查**哪个接口返回图片列表**（从路由/业务判断，如消息列表接口）→ 定位消费该 URL 的组件（`taro-image-core` 提示是 Taro Image 组件）
4. `cascadingSummary` 聚合：同 URL 模式失败 N 次 = 系统性（签名过期/CDN 故障/防盗链），非偶发
5. **定性**：资源失败 ≠ 前端代码 bug（可能是 CDN/签名/跨域问题）。定位目标是「哪段代码引用/消费了这个资源」，定性写入 rootCause

## performance / memory 类战术

1. `diagnostics.performance.longTasks[]`：`name`（长任务归因，如脚本名）→ 搜对应模块
2. `diagnostics.performance.slowRequests[]` + `network.slowCount`：慢接口 → 搜路径
3. `diagnostics.memoryLeak`：growthTrend 趋势 + possibleSources（泄漏源提示）→ domNodeCount/estimatedLeakedListeners 定位事件监听泄漏
4. metrics 对照：fcp/load/domReady 超阈值（如 fcp > 3000ms）→ 查 failedResources/slowResources/jsErrorBeforeFcp

## unknown / noErrors 路径

`attribution.type = unknown` 或 `noErrors = true`：

1. noErrors：数据里没有 error 事件——用户描述的现象来自性能/白屏/内存/交互问题，按用户描述关键词路由到 performance/memory/白屏战术
2. unknown：全维度排查——primary 错误 → 时间线重建 → 网络 + 控制台交叉 → 归因预判推翻验证
3. 用户描述与数据对不上（用户说白屏但 fcp 正常）→ openQuestions 记录矛盾点，不要强行编结论

## 时间线重建

以 `primary[0].timestamp` 为锚点（或 noErrors 时以最后 action 为锚点）：

1. `precedingEvents[]`（错误前 12 条）——**最重要的上下文**
2. `actions[]`：错误前最后用户操作 → 触发路径
3. `console.recent`：错误前最后业务日志 → 执行到哪
4. `route.routePath` + query：哪个页面（如 `pages/index/index` + `appId=QAPP...`）
5. `meta.pageLifecycle`：页面处于什么阶段（loading/interacting）

## 代码定位交叉验证

每个 codeLocation 必须过五关：

1. **文件存在**：`read_file` 确认（verify-localization.cjs 强制校验）
2. **内容匹配**：读目标位置代码，确认与证据逻辑关联（不能只靠文件名猜）
3. **certainty 分级**：
   - `confirmed`：stack 帧直接指向 / 错误消息文本逐字命中 / 日志文本逐字命中
   - `likely`：接口路径/资源 URL 片段命中 / 路由组件强关联
   - `candidate`：间接关联（同模块/相关逻辑），需 openQuestions 说明
4. **行号规则**：只有源码文件且读过内容确认后才写 line；打包产物/bundle 不写 line
5. **反证**：`excludedHypotheses` 写明排除的备选原因及理由；无竞争假设时说明为何单一假设足够

## rrweb DOM 深挖命令模板

v2 数据 DOM 在 `recording.events`（rrweb 流），**禁止整读**（数百事件 + 全量快照）。按需提取：

```bash
# 1. 统计事件类型分布（2=FullSnapshot 3=IncrementalSnapshot 4=Meta）
node -e "const d=require('<DATA_FILE>');const c={};d.recording.events.forEach(e=>c[e.type]=(c[e.type]||0)+1);console.log(JSON.stringify(c))"

# 2. 提取错误时间戳 T 前最近的文本变更（textContent mutation，data.node.textContent）
node -e "const d=require('<DATA_FILE>');const T=<timestamp>;const ev=d.recording.events.filter(e=>e.timestamp<=T&&e.type===3&&e.data&&e.data.source===5).slice(-10);console.log(JSON.stringify(ev.map(e=>({t:e.timestamp,items:(e.data.items||[]).map(i=>i.text).filter(Boolean)})),null,1))"

# 3. 提取 attribute 变更（style/class 变化，source=2）
node -e "const d=require('<DATA_FILE>');const T=<timestamp>;const ev=d.recording.events.filter(e=>e.timestamp<=T&&e.type===3&&e.data&&e.data.source===2).slice(-10);console.log(JSON.stringify(ev.map(e=>({t:e.timestamp,id:e.data.id,attr:e.data.attributes})),null,1))"

# 4. FullSnapshot 里搜特定元素（如找 taro-image-core 节点的属性）
node -e "const d=require('<DATA_FILE>');const s=JSON.stringify(d.recording.events.filter(e=>e.type===2));const kw='taro-image-core';let i=s.indexOf(kw);while(i>=0){console.log(s.slice(Math.max(0,i-200),i+300));console.log('---');i=s.indexOf(kw,i+1)}"
```

注意：命令行内联避免中文（PowerShell 编码问题）；`<DATA_FILE>` 用绝对路径（Windows 下正斜杠）。
