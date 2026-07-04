---
name: frontend-backend-integration
description: >
    执行前后端联调，将前端从 mock 数据切换到真实 Go 后端 API。当用户说 前后端联调、接口对接、mock替换、接入真实接口、API对接、联调 时使用。
    不要用于纯后端开发、纯前端 UI 开发、数据库设计、纯 mock 数据编写。
version: 4.0.0
dependencies: []
allowed-tools: [read_file, write_file, replace_in_file, search_content, search_file, execute_command]
max-token: 1000
---

# Frontend-Backend Integration v4.0 — 前后端联调

## 🛑 入口守卫

```
本 Skill 必须按序执行 Step 0→1→2→3 四步。
每步播报完成消息，未播报 = 未执行 = 违规。

注意：specflow-rules-engine 由上层（dev/fix skill）统一注入。
```

**核心定位：不是"替换接口"，而是"读懂后端契约，在数据层做最小外科手术，让前端视图和逻辑层零感知"。**

---

## 流程总览

```
Step 0: 契约审查 → 读 Proto/API文档，验证接口设计合理性
Step 1: 对接设计 → 字段映射方案，最小影响范围
Step 2: 执行对接 → transform + 替换调用，逐接口增量
Step 3: 验证交付 → 数据正确 + 交互正常 + lint 通过
```

---

## Step 0 — 契约审查（强制 · 最高优先级）

```
【目的】在写任何代码前，先审查后端 API 设计是否合理。
       不合理的接口设计不允许进入联调，必须要求后端整改后再对接。
```

### 0.1 读取后端契约

```typescript
// 并行读取，获取全局视图
read_file('proto/api.proto')                     // Proto 接口定义（权威来源）
search_content('mock', { glob: '*.{ts,tsx}' })   // 现有 mock 引用
list_dir('src/api/')                              // 已有 API 层
list_dir('src/services/')                         // Service 层结构
```

### 0.2 🔴 API 设计合理性审查（不可跳过）

```
审查清单（逐条判定）：

□ 单一职责：一个 RPC 返回一组明确的数据，不混入无关字段
□ 数据粒度：前端一次请求能拿到所需全部数据（不要求前端拼装/聚合）
□ 分页规范：列表接口有 page/pageSize/total，不返回万级全量数据
□ 无冗余字段：响应不包含前端不需要的数据（浪费带宽）
```

#### 🔴 红线：频繁请求设计 — 直接驳回（不可略过）

```
出现以下任一情况 → ⛔ 立即驳回，输出驳回报告，要求后端整改：

  □ 列表 + 详情需要 N+1 次请求（先拉列表 ID，再逐个查详情）
  □ 前端需要轮询接口获取状态变化（后端应支持 push/SSE/long-polling）
  □ 数据聚合在前端完成（需要调多个接口再拼接，后端应提供聚合 RPC）
  □ 同一页面需要 ≥3 个独立列表接口（应合并为一个复合接口）

驳回报告格式：
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ⛔ API 设计审查不通过：{问题类型}

  问题接口：{RPC 名称}
  问题描述：{具体说明为什么设计不合理}
  前端影响：{会导致频繁请求/性能问题/数据不一致}
  整改建议：{建议后端如何调整接口设计}
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

驳回后不进行后续步骤，直接结束。不得以"前端兼容"为借口绕过红线。
```

> 播报：`"✅ Step 0 契约审查: {N}个RPC / 设计{通过/驳回}"`

---

## Step 1 — 对接设计（强制）

```
【目的】确定字段映射方案和最小改动范围，不动组件内部逻辑。
```

### 1.1 字段对照

```
对于每个接口：
  后端字段（Proto snake_case）  →  前端字段（TS camelCase）
  ─────────────────────────────────────────────────────
  item.id          保持         →  id
  item.task_name   映射         →  name
  item.created_at  映射         →  createdAt
  item.status      值转换       →  status（0→待处理 / 1→进行中）
  后端多出的字段   丢弃         →  不放 transform 输出
```

### 1.2 改动边界约束

```
□ 仅改：src/api/types/（类型声明）+ src/services/（API 调用）+ transform 函数
□ 不动：组件 .tsx 内部逻辑、状态管理、页面路由
□ 涉及 >3 个模块 → ⛔ 暂停，重新审视方向
□ 需要改组件内部 → ⛔ 不碰，说明原因后暂停
```

> 播报：`"✅ Step 1 对接设计: {N}个接口 / {N}个改动文件"`

---

## Step 2 — 执行对接（强制）

> **逐接口增量推进**，每完成一个接口验证后才做下一个。

### 2.1 有 mock 场景

```typescript
// 替换前
const [data] = useState(mockData)

// 替换后：在 service 层加 API 函数 + 组件层加 transform
useEffect(() => {
  void (async () => {
    const [err, res] = await fetchXxx()
    if (err) return
    setData(transformXxx(res))
  })()
}, [])
```

### 2.2 无 mock 场景（新建接口）

```
直接在 service/ 层新建 API 函数 → 组件调用 → 验证。
不需要删除 mock 的操作。
```

### 2.3 transform 函数规范

```typescript
// 输入：后端响应类型（Proto 生成的 types.ts）
// 输出：组件需要的类型（前端自定义）
// 职责：仅字段映射 + 值转换，不做业务逻辑
// 禁止：.filter() / if/else 分支 / 业务判断
export function transformXxx(res: ApiResponse): FrontendType[] {
  return res.list.map(item => ({
    id: item.id,
    name: item.task_name,        // snake_case → camelCase
    status: STATUS_MAP[item.status], // 值映射
  }))
}

const STATUS_MAP: Record<number, string> = { 1: '待处理', 2: '进行中' }
```

> 播报：`"✅ Step 2 对接完成: {接口名} / transform: {N}字段"`

---

## Step 3 — 验证交付（强制）

```
【目的】确保数据正确、交互正常、无 mock 残留。
```

### 3.1 单接口验证

```
□ API 返回正常，transform 字段映射正确
□ 页面表现与 mock 版本一致（数据正确）
□ 交互流正常：loading→数据→empty/error 三态
□ 异常情况：网络错误/超时/空数据 均有兜底
□ 接口调用频率合理：同一数据在单次用户操作中不被重复请求
```

#### 🔴 渲染效率审查（强制 · 不可跳过）

```
组件渲染次数与数据流的因果关系必须清晰可预测。

审查规则：
  □ 单次数据变更 → 组件渲染 ≤1 次（如 setState 一次 → render 一次）
  □ 渲染次数 > 预期必要次数 → 立即定位并修复：

常见原因及修复：
  原因                          修复
  ──────────────────────────────────────────────────
  多次 setState 顺序调用        → useReducer 批量合并
  useEffect 依赖不当导致二次渲染 → 检查依赖数组，移除不必要依赖
  API 响应后 dispatch + setState → 合并为一步更新
  Props 引用不稳定(对象/回调)    → useMemo / useCallback 稳定引用
  Context value 频繁变化          → 拆分 Context，缩小订阅范围

检测方法：
  React DevTools Profiler 或 console.count('render') 确认渲染次数
  → 预期 1 次但渲染 2+ 次 → 🔴 修复后才能交付
```

### 3.2 全量清理

```
□ 所有 mock 文件和 import 已删除
□ USE_MOCK / MOCK_ENABLED 等环境切换代码已移除
□ 无残留 @/mock/ 引用
□ npm run build 通过 / tsc --noEmit 通过
```

> 播报：`"✅ Step 3 验证: 数据正确 + 交互正常 + 零 mock 残留 → 交付"`

---

## 参考资料

| 文件 | 内容 | 加载时机 |
|------|------|---------|
| `RULE.mdc` | 联调铁律（改动边界/成对约束/增量验证） | Step 0 前 |
| `examples/` | transform 完整示例 | Step 2 按需 |
