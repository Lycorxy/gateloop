---
name: frontend-codegen
description: >
    前端代码生成。负责环境检测→规范加载→代码生成→验证交付的完整闭环。
    生成 TSX+SCSS 高质量代码，禁止 mock/假数据/硬编码。
    触发词：生成前端代码、写页面、写组件、新建模块。
    禁止用于：需求分析、架构设计、后端开发、部署配置。
version: 8.0.0
dependencies: []
allowed-tools: [read_file, write_file, replace_in_file, search_content, search_file, execute_command, list_dir]
max-token: 1000
---

# Frontend Codegen v8.0 — 前端代码生成

## 🛑 入口守卫

```
本 Skill 必须按序执行 Step 0→1→2→3 四步。
每步播报完成消息，未播报 = 未执行 = 违规。

注意：specflow-rules-engine / eslint-code-quality / 任务类型判定/委派编排
      由上层（dev/fix skill）统一注入，本 Skill 不重复处理。
```

**核心定位：不是"编排工具"，而是"高质量代码产出"。**

---

## 流程总览

```
Step 0: 环境检测 → 读 package.json + tsconfig，确定代码风格
Step 1: 规范加载 → 按需读 rules/ 文件，注入编码规范
Step 2: 代码生成 → TSX + SCSS，三文件模式
Step 3: 验证交付 → nut-lint fix → nut-lint run → 0 错误
```

---

## Step 0 — 环境检测（强制）

```
【目的】确认 JSX 运行时 / TS 严格度 / 路径别名 / 样式方案，避免代码风格不匹配。
```

```typescript
// 并行读取，两个文件
read_file('package.json')   // → 确定 react 版本、UI库、样式方案、lint 工具
read_file('tsconfig.json')  // → 确定 jsx、strict、paths、module
```

### 检测清单

```
□ JSX: "react-jsx" → automatic(无需 import React) / 否则 → classic
□ TS:  strict:true → 禁止 any / strict:false → 谨慎 any
□ 别名: "@/*": ["src/*"] → import from '@/xxx' / 无 → 相对路径
□ UI:   antd → antd API / 无 → 自定义组件
□ 样式: .module.scss 存在 → CSS Modules(namedExport:false) / tailwind → className
```

> 播报：`"✅ Step 0 环境检测: {JSX}/{TS}/{别名}/{UI}/{样式}"`

---

## Step 1 — 规范加载（强制）

```
【目的】注入项目编码规范，确保生成代码首次通过 lint。
```

```typescript
// 按需读取（不预加载全量）
read_file('.codebuddy/skills/frontend-codegen/rules/iron-rules.md')     // 强制铁律（文件规模/类型/导入）
read_file('.codebuddy/skills/frontend-codegen/rules/file-structure.md') // 文件结构规范（三文件模式/目录命名）
read_file('.codebuddy/skills/frontend-codegen/rules/anti-patterns.md')  // 反模式清单（禁止写法/正确替代）
```

> 播报：`"✅ Step 1 规范加载: iron-rules + file-structure + anti-patterns"`

---

## Step 2 — 代码生成（核心 · 五维质量关卡）

> **每生成一个组件，必须逐维度通过检查。未通过不得写入文件。**

### 2.1 三文件模式

```
index.tsx          ≤ 120 行（组件组合 + JSX）
index.scss         ≤ 200 行（样式，由 css-style-writer 委派生成）
types.ts           可选（复杂类型定义）
```

### 2.2 五维质量关卡（逐维度检查）

#### 🔒 稳定性

```
□ 异步闭环：try → API → error判断 → success更新 → feedback → finally清loading（6步缺一不可）
□ useEffect 依赖完整，无对象/数组字面量在依赖中
□ 派生值用 useMemo，不 useState+useEffect
□ 列表 key 用业务 ID，不用 index
□ 表单校验在前端完成，不过度依赖后端报错
```

#### 🔒 性能

```
□ 展示组件包 React.memo（Props ≤5）
□ 子组件回调包 useCallback
□ 3+ 独立 setState → useReducer 批量更新
□ 连续 dispatch 合并为一个 action
□ useEffect ≤3/组件，无死循环风险
□ 大列表（>100条）考虑虚拟列表或分页
```

#### 🔒 安全

```
□ 用户输入不直拼 URL → encodeURIComponent / URLSearchParams
□ JSON.parse 有 try/catch + 默认值
□ 数组操作前 Array.isArray() 校验
□ 无 dangerouslySetInnerHTML 渲染用户内容
□ 无 eval() / new Function() 执行动态代码
□ 密钥/Token 不在前端硬编码，不从环境变量外泄
```

#### 🔒 可维护性

```
□ 容器/展示分离：获取数据 vs 渲染 UI 不在同一组件
□ 一个文件一个导出组件（index.tsx 除外）
□ API 调用在 service/ 层，组件不直接 fetch/post/axios
□ 类型从 @/api/types/types 导入，禁止重定义
□ 简单逻辑用 if/else，不堆密集三元链
□ 魔法数字/字符串提取为常量（组件顶层）
```

#### 🔒 质量

```
□ 文件 ≤ 200行(TSX) / 函数 ≤30行 / 缩进 ≤3层
□ 零 any 类型，零 // eslint-disable
□ import 顺序：第三方→@/别名→相对→样式
□ 三态齐全：loading(Skeleton优先) / empty(引导+CTA) / error(重试入口)
□ 删除操作有 Popconfirm 二次确认
□ 所有颜色/间距/圆角用 CSS 变量带 fallback
```

### 2.3 TSX 骨架模板

```typescript
import { memo, useState, useCallback, useMemo } from 'react'
// antd imports ...
import styles from './index.scss'
import type { XxxInfo } from '@/api/types/types'
import { xxxApi } from '@/services/xxx-api'

interface Props { /* ≤5个 */ }

function XxxImpl({ ... }: Props) {
  const [loading, setLoading] = useState(false)

  const handleSubmit = useCallback(async (values: FormValues) => {
    setLoading(true)                               // 1. loading
    try {
      const [error, data] = await xxxApi(values)   // 2. API
      if (error) { message.error('...'); return } // 3. error
      dispatch(setXxx(data))                       // 4. success
      message.success('操作成功')                   // 5. feedback
    } catch (err) {
      message.error(err instanceof Error ? err.message : '未知错误')
    } finally { setLoading(false) }                // 6. clear
  }, [])

  return <div className={styles.xxx}>{/* JSX */}</div>
}

export const Xxx = memo(XxxImpl)
```

> 播报：`"✅ Step 2 代码生成: {N}文件 / 五维检查通过"`

---

## Step 3 — 验证交付（强制）

```
【目的】0 错误才能交付。
```

```bash
# 1. 自动修复
npx nut-lint fix <files> --write

# 2. 全量验证（ESLint + Stylelint + tsc）
npx nut-lint run <files>
```

**验证不通过 → 回 Step 2 修复，最多 3 轮，超限则上报。**

> 播报：`"✅ Step 3 验证: ESLint✅ Stylelint✅ tsc✅ → 交付"`

---

## 参考资料

| 文件 | 内容 | 加载时机 |
|------|------|---------|
| `rules/iron-rules.md` | 强制铁律（规模/类型/导入/状态） | Step 1 |
| `rules/file-structure.md` | 文件结构（三文件模式/命名/拆分） | Step 1 |
| `rules/anti-patterns.md` | 反模式清单（禁止→正确对照） | Step 1 |
| `RULE.mdc` | 全局铁律（由上层注入） | Step 0 前 |
