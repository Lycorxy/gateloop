---
description: "v10.2 硬规则速查表：违反即工具阻断。详细规则见各权威文件"
alwaysApply: true
---

# 硬规则速查（v10.2）

## ⛔ 生成前强制 Gate（Frontend-Agent 每个组件生成前必须执行）

> 这不是事后检查，是**生成前的强制卡点**。未完成此 Gate 不得开始写代码。

```
【Gate-1：布局结构确认】
  □ 当前组件的布局类型是什么？（列表页/左右分栏/表单页/看板）
  □ 对照 design-tokens.mdc §0.3 布局决策树，确认选型正确
  □ 线框图中的层级结构是几级？→ 代码必须实现同等层级，不得降级

【Gate-2：设计 Token 绑定】
  □ 颜色：全部用 var(--color-xxx, fallback)，无硬编码色值
  □ 间距：全部用 var(--space-xxx, fallback)，无硬编码 px
  □ 圆角：按钮/输入框用 var(--radius-sm, 2px)，卡片用 var(--radius-lg, 8px)
  □ 字体：页面标题 18px/600，正文 14px/400，label 14px/400/neutral-08

【Gate-3：组件选型确认】
  □ 数据列表 → TTable（禁自定义 div 列表）
  □ 树形目录 → antd Tree（禁手写递归 ul/li）
  □ 表单 ≥4 字段 → TForm（禁手写 Form.Item）
  □ 删除操作 → Popconfirm（禁 window.confirm）
  □ 长文本 → TEllipsis（禁 CSS overflow:hidden）

【Gate-4：三态完整性】
  □ loading 态：Spin 或 Skeleton（骨架屏优先）
  □ empty 态：antd Empty + 引导操作
  □ error 态：message.error() + 重试入口

【Gate-5：反 AI slop 检查】（生成前在脑子里过一遍）
  □ 没有渐变背景卡片
  □ 没有大量彩色 Tag 装饰
  □ 没有超过 18px 的标题
  □ 没有超过 4px 的按钮圆角
  □ 没有 emoji 图标
  □ 表格行高 = 48px
```

**执行方式**：在播报中输出 Gate 结果，格式：
```
⚙️ Gate 检查：布局=左右分栏✅ | Token绑定✅ | 组件选型=antd Tree✅ | 三态✅ | 反slop✅
```
未通过的项必须先修正方案，再开始生成代码。

---

## 前端（TSX / SCSS）

```
类型    from '@/api/types/types'（唯一来源，禁重定义）→ 详见 react-core.mdc
样式    import * as styles from './index.module.scss'（禁 default）→ 详见 specflow-frontend-codegen.mdc
API     走 client/src/service/（禁组件内 fetch/post/axios）→ 详见 react-core.mdc
不可变  [...arr] / {...obj}（禁 push/splice）→ 详见 react-core.mdc
规模    TSX≤200行/JSX≤50行/Props≤5/useEffect≤3/函数≤30行 → 详见 tech-stack-and-design.mdc
SCSS    var() 必须带 fallback；禁 @import/border:none/0.8 → 详见 specflow-frontend-codegen.mdc
路径    页面 client/src/pages/{kebab}/index.tsx + 同目录 index.module.scss
命名    组件 PascalCase；CSS kebab-case；路由 kebab-case
线框图  Frontend-Agent 必须严格按线框图实现，不得降级（三级目录不得实现为一级）
```

## 后端（TS Handler / Go）

```
Handler 签名+jsondb API → 详见 specflow-code-conventions.mdc（权威）
Go 三层+错误+日志 → 详见 tech-stack-and-design.mdc（权威）
命名转换 Proto→TS→Go → 详见 tech-stack-and-design.mdc（权威）
Go代码生成（类型B Step2）不可跳过，即使前端已可通过 TS Handler 验证
Go代码追加到 service/service/report_knowledge_service.go（不新建文件）
Repository 接口定义在 api.go，实现在 mysql.go（方便单测 mock）
gorm.ErrRecordNotFound → 返回 nil, nil（不是错误）
乐观锁更新检查 rowsAffected == 0 → 返回版本冲突错误
```

## DB（DDL）

```
主键 id BIGINT UNSIGNED AUTO_INCREMENT | 时间 create_time/update_time DATETIME NOT NULL
软删 is_deleted TINYINT DEFAULT 0 | 索引 至少一个业务查询索引
外键 用注解 -- ref: xxx.id，不建物理外键 | 字符集 utf8mb4/utf8mb4_general_ci
500错误预防：表名/字段名/类型必须与 GORM tag 完全一致（设计阶段就检查）
```

## Proto

```
字段 snake_case | 分页 page/page_size/total | 列表 repeated XxxInfo list
每个 RPC 必须独立 Request+Response message | 服务 trpc.hello_app.service.Knowledge
→ 详见 specflow-proto-contract.mdc（权威）
```

## 流程规则（v10.1 新增）

```
需求澄清后必须检查已有功能复用（Requirements-Agent Step 0.3.5）
先保证功能独立不耦合，后期优化时再提取公共组件（记录到 taskList）
工具调用防冗余：同一工具同一 step 最多调用 1 次，修改后再重试
真实DB验证任务必须记录到 pendingVerification（Backend Step5）
部署后在 change_history/ 目录记录验证结果
```

## 工具阻断点 → 详见 agent-orchestration.mdc（权威）
