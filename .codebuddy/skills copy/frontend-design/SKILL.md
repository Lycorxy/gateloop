---
name: frontend-design
description: >
    前端技术架构设计。路由设计+组件拆分+模块化设计+耦合分析+数据流方案+
    红线约束+性能策略+兼容性策略+交互兜底+技术选型决策树。
    作为代码生成前的独立设计阶段，输出完整 frontendPlan 供下游消费。
    包含🔒关卡1确认。不要用于 UI 视觉设计（→ admin-ui-design）或代码编写（→ frontend-codegen）。
version: 5.0.0
dependencies: []
allowed-tools: [read_file, search_content, search_file, list_dir]
max-token: 1200
---

# Frontend Design v5.0 — 前端架构设计

## 🛑 入口守卫

```
本 Skill 只做一件事：接收需求 → 输出设计方案报告。

不写代码，不调 MCP，不管后端。
specflow-rules-engine / Rule 注入由上层统一处理。

角色：前端架构师 + 技术负责人
产出：一份可直接交付下游（frontend-codegen）的设计方案
```

**核心目标：设计方案让实现者无需二次决策，且杜绝维护成本膨胀、安全隐患、性能劣化。**

---

## 流程总览

```
Step 0: 上下文收集 → 读懂项目现状（路由/Store/类型/已有组件）
Step 1: 方案设计 → 路由+模块+组件树+数据流+安全+性能+可维护性
Step 2: 线框输出 → ASCII 线框图，标注尺寸和组件
Step 3: 关卡确认 → 🔒 用户确认设计方案
```

---

## Step 0 — 上下文收集（强制）

> **设计必须基于事实，不凭空假设。**

```typescript
// 并行探测，获取项目全貌
search_content('path:|Route ', 'src/router')        // 已有路由
search_content('create\\(|zustand', 'src/store')     // 已有 Store
search_content('export interface', 'src/types')      // 已有类型
list_dir('src/views')                                 // 已有页面模块
read_file('references/design-tokens.md')              // 设计 Token 系统
read_file('references/layout-rules.md')               // 布局规则
```

> 播报：`"✅ Step 0 上下文: {N}路由 / {N}Store / {N}类型 / {N}页面模块"`

---

## Step 1 — 方案设计（核心输出）

> **输出一份结构化设计报告，覆盖以下 7 个维度。缺一不可。**

### 1.1 路由设计

```
新路由路径 + 页面组件路径 + 是否懒加载
示例：
  /users/list  → src/views/user/list/index.tsx  (React.lazy)
  /users/:id   → src/views/user/detail/index.tsx (React.lazy)
```

### 1.2 模块拆分

```
模块目录树 + 每个模块职责说明
示例：
  src/views/user/
    ├── list/        → 用户列表页（搜索+表格+分页）
    ├── detail/      → 用户详情页
    └── components/  → 共享组件（UserAvatar / UserTag）
```

### 1.3 组件树 + 容器/展示分离

```
页面组件（容器）         展示组件（纯渲染）
────────────────────────────────────────
UserListPage             UserTable / UserSearchCard / UserFormModal
  获取数据+编排状态      只接收 Props，React.memo 包裹
```

### 1.4 数据流方案

```
数据范围           方案              理由
──────────────────────────────────────────
全局共享(跨页面)    Zustand store     持久化/跨路由
模块共享(兄弟组件)  React Context     同模块内
页面内(父子)        Props 透传        ≤2层直接传
临时状态            useState          表单/弹窗/loading
```

### 1.5 🔒 安全设计

```
□ XSS 防护：用户输入不直拼 HTML/URL，用 encodeURIComponent
□ 输入校验：表单前端完整校验（不光靠后端），JSON.parse 有兜底
□ 敏感数据：Token/httpOnly Cookie，不在前端缓存敏感信息
□ 路由守卫：需要登录的页面有无权限拦截
```

### 1.6 ⚡ 性能策略

```
场景                  策略
────────────────────────────────────
首屏加载              路由懒加载 + 组件按需导入
大列表 (>200条)       虚拟列表 / 分页
重复渲染              React.memo + useCallback + useMemo
图片                  WebP + 懒加载
状态更新              批量合并（useReducer / batch）
```

### 1.7 🔧 可维护性设计

```
□ 每个模块文件 ≤3 层目录深度
□ 公共组件抽到 src/components/，不跨模块直接引用
□ API 调用统一在 service/ 层
□ 类型唯一来源：@/api/types/types，禁止重定义
□ 魔法数字提取为常量
□ 新模块接口原则：先独立运行，后考虑抽象
```

### 1.8 兼容性与降级

```
□ 浏览器目标：Electron(Chromium) → 无需考虑 IE/Safari 兼容
□ CSS：禁止 :has() / subgrid / @container（兼容性不足）
□ 降级方案：API 失败 → 错误提示+重试 / 大文件加载 → Skeleton
```

> 播报：`"✅ Step 1 方案设计: {N}路由 / {N}模块 / {N}组件"`

---

## Step 2 — 线框输出（强制）

> **ASCII 线框，标注精确尺寸、组件类型、交互说明。**

必须包含：
- 页面整体布局（宽×高，各区域尺寸）
- 每个区域的组件选型（Table / Tree / Form / Modal）
- 交互状态说明（hover/选中/空/加载）

```
┌─────────────────────────────────────────────────────────┐
│  页面标题                        [主操作按钮] [刷新]    │ h:48px
├──────────┬──────────────────────────────────────────────┤
│ 左侧     │ 内容区                                       │
│ w:260px  │  卡片标题                   [操作按钮组]     │
│          │  ┌───────────────────────────────────────┐  │
│ 树形     │  │ 表格（antd Table）                    │  │
│ Tree     │  │ 表头 h:48px / 行 h:44px               │  │
│          │  └───────────────────────────────────────┘  │
│ 选中态   │  分页                                   < > │
│ 蓝底蓝字 │                                              │
└──────────┴──────────────────────────────────────────────┘
```

> 播报：`"✅ Step 2 线框输出完成"`

---

## Step 3 — 🔒 关卡确认（强制）

> **展示完整的方案报告，等待用户确认。**

用户选项：
- ✅ A. 确认 → 交付设计方案
- 🔄 B. 调整 → 说明调整内容，重新输出（最多 2 次）
- 🔴 C. 驳回 → 重新设计

> 播报：`"🔒 Step 3 关卡: 等待用户确认"`

---

## 参考资料

| 文件 | 内容 | 加载时机 |
|------|------|---------|
| `RULE.mdc` | 铁律（布局/架构/模块化/耦合） | 由上层注入 |
| `references/design-tokens.md` | 设计 Token（色彩/间距/圆角） | Step 0 |
| `references/layout-rules.md` | 布局决策树 + 组件选型规则 | Step 0 |
