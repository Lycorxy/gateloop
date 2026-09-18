---
description: 目录结构规范 + 文件拆分策略 + 标准代码模板。执行 frontend-codegen Skill 时必须注入。
globs: ["**/*.tsx", "**/*.ts"]
alwaysApply: true
---

# 目录结构规范与代码模板

---

## 一、项目目录结构

```
src/
├── components/              ← 公共组件（跨页面复用）
│   ├── error-boundary/
│   │   └── index.tsx
│   ├── empty-state/
│   │   ├── index.tsx
│   │   └── index.module.css
│   └── loading-skeleton/
│       └── index.tsx
│
├── views/                   ← 页面/视图（按业务域或路由划分）
│   └── user/
│       ├── components/      ← 视图内组件
│       │   ├── user-card/
│       │   │   ├── index.tsx
│       │   │   ├── hook.ts
│       │   │   ├── util.ts
│       │   │   └── index.module.css
│       │   └── user-filter/
│       │       └── index.tsx
│       ├── hooks/           ← 视图级 Hook
│       │   └── use-user-list.ts
│       ├── context/         ← 视图级 Context（替代全局 store）
│       │   └── user-context.tsx
│       ├── types.ts         ← 视图类型
│       ├── constant.ts      ← 视图常量
│       └── index.tsx        ← 视图入口（页面级组件）
│
├── hooks/                   ← 全局公共 Hook
│   ├── use-safe-json.ts
│   ├── use-debounce.ts
│   └── use-async.ts
│
├── utils/                   ← 全局工具函数
│   ├── safe.ts             ← 兜底函数集合
│   ├── format.ts           ← 格式化函数
│   └── transform.ts        ← 数据转换函数
│
├── types/                   ← 全局类型定义
│   └── index.ts
│
└── styles/                  ← 全局样式
    ├── variables.css        ← CSS 变量（颜色/间距/圆角）
    ├── reset.css
    └── global.css
```

---

## 二、文件拆分策略（主从逻辑划分）

```
组件文件（index.tsx）：
  ├── 只负责"组装"和"渲染"
  ├── 从 hook.ts 获取数据和操作方法
  ├── 从 util.ts 获取格式化后的展示数据
  ├── Props 接收 + JSX 输出
  └── ≤ 200 行（推荐），最多 360 行

Hook 文件（hook.ts / use-xxx.ts）：
  ├── 数据获取（useQuery / fetch）
  ├── 状态管理（useState / useReducer）
  ├── 副作用编排（useEffect）
  ├── 事件处理函数（handle*）
  └── 返回：{ data, loading, error, handlers }

工具文件（util.ts / utils.ts）：
  ├── 纯函数（无副作用）
  ├── 数据转换（API Response → UI Model）
  ├── 格式化（日期/金额/状态码映射）
  ├── 校验函数
  └── 每个函数 ≤ 15 行

类型文件（types.ts）：
  ├── 组件 Props 接口
  ├── 内部状态类型
  ├── 事件回调类型
  └── 注意：公共业务类型从 @/types 导入，不重复定义
```

### 2.1 函数分类边界表（v2.1 新增·写代码前必须对照）

```
写代码前必须用此表判定每个函数的文件归属，禁止混放：

┌──────────────────────────────────────────────────────────────────────┐
│ 函数特征                           │ 归属文件        │ 判定标准      │
├──────────────────────────────────────────────────────────────────────┤
│ 不依赖 React hooks/组件状态        │ utils.ts        │ 纯输入→输出   │
│ 例：formatDate, transformResponse, │                 │ 可独立测试    │
│     validateEmail, calcDiscount    │                 │ 无副作用      │
├──────────────────────────────────────────────────────────────────────┤
│ 包含 fetch/axios/请求逻辑         │ api/ 或          │ 网络IO操作    │
│ 例：fetchUserList, updateUser,     │ services/       │ 请求-响应映射 │
│     deleteCategory                 │                 │               │
├──────────────────────────────────────────────────────────────────────┤
│ 使用 useState/useEffect/useRef     │ hooks/use-xxx.ts│ 依赖 React    │
│ 例：useUserList, useFormState,     │ 或 hook.ts      │ 生命周期      │
│     useDebounce, useModalState     │                 │ 返回状态+方法 │
├──────────────────────────────────────────────────────────────────────┤
│ JSX 组装/条件渲染/组件组合         │ index.tsx       │ 纯渲染编排    │
│ 例：<UserTable>, <FilterBar>,      │                 │ 不含业务逻辑  │
│     三态判断 if(loading/error/data) │                 │               │
├──────────────────────────────────────────────────────────────────────┤
│ 接口响应→前端模型的适配转换        │ api/adapters/   │ 解耦后端字段  │
│ 例：adaptUserResponse,             │ 或 api/xxx.ts   │ 和前端展示    │
│     normalizeTreeData              │                 │               │
└──────────────────────────────────────────────────────────────────────┘

🔴 自检规则（写完代码后必须验证）：
  □ index.tsx 中是否有纯计算函数？→ 移到 utils.ts
  □ index.tsx 中是否有 fetch/axios？→ 移到 api/ 或 hook.ts
  □ hook.ts 中是否有不依赖 hooks 的纯函数？→ 移到 utils.ts
  □ 同一功能是否在多处重复实现？→ 提取到公共 utils/ 或 hooks/
  □ 超过 5 行的数据加工逻辑是否在 index.tsx 中？→ 移到 utils.ts
```

---

## 三、标准代码模板

### 3.1 组件主文件 — `view-name/index.tsx`

```tsx
import { memo } from 'react';

import { useViewData } from './hook';
import { formatDisplayValue } from './util';

import type { ViewProps } from './types';

import styles from './index.module.css';

function View({ id, onComplete }: ViewProps) {
  const { data, loading, error, handleAction } = useViewData(id);

  if (loading) return <div className={styles.skeleton}>加载中...</div>;
  if (error) return <div className={styles.error}>加载失败，请重试</div>;
  if (!data) return <div className={styles.empty}>暂无数据</div>;

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>{data.title}</h2>
      <p className={styles.value}>{formatDisplayValue(data.rawValue)}</p>
      <button
        type="button"
        className={styles.action}
        onClick={() => handleAction(data.id)}
      >
        确认
      </button>
    </div>
  );
}

export default memo(View);
```

### 3.2 Hook 文件 — `view-name/hook.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';

import { safeJsonParse } from '@/utils/safe';

import type { ViewData } from './types';

interface UseViewReturn {
  data: ViewData | null;
  loading: boolean;
  error: Error | null;
  handleAction: (id: string) => Promise<void>;
}

export function useViewData(id: string): UseViewReturn {
  const [data, setData] = useState<ViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/view/${id}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`请求失败: ${response.status}`);
        }

        const json = await response.json();
        const parsed = safeJsonParse<ViewData>(json, null);
        setData(parsed);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    return () => controller.abort();
  }, [id]);

  const handleAction = useCallback(async (targetId: string) => {
    try {
      await fetch(`/api/view/${targetId}/action`, { method: 'POST' });
    } catch (err) {
      console.error('操作失败', err);
    }
  }, []);

  return { data, loading, error, handleAction };
}
```

### 3.3 工具文件 — `view-name/util.ts`

```typescript
/**
 * 格式化展示值
 * @description 将原始数值转为带单位的展示字符串，兜底返回 '--'
 */
export function formatDisplayValue(value: unknown): string {
  if (value === null || value === undefined) return '--';
  const num = Number(value);
  if (Number.isNaN(num)) return '--';
  if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
  return String(num);
}

/**
 * 转换 API 响应为 UI 模型
 * @description 解耦后端字段与前端展示
 */
export function transformResponse(raw: unknown): ViewData | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  return {
    id: String(record.id ?? ''),
    title: String(record.title ?? ''),
    rawValue: record.value ?? null,
  };
}
```

### 3.4 类型文件 — `view-name/types.ts`

```typescript
export interface ViewProps {
  id: string;
  onComplete?: (id: string) => void;
  className?: string;
}

export interface ViewData {
  id: string;
  title: string;
  rawValue: unknown;
}
```

### 3.5 全局兜底工具 — `@/utils/safe.ts`

```typescript
/** 安全 JSON 解析，失败返回 fallback */
export function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') {
    return (value as T) ?? fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** 确保值是数组，否则返回空数组 */
export function ensureArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return [];
}

/** 安全数字转换，失败返回 fallback */
export function safeNumber(value: unknown, fallback: number = 0): number {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}
```

### 3.6 Context 模板 — `view/context.tsx`

```tsx
import {
  createContext,
  useContext,
  useReducer,
  useMemo,
} from 'react';

import type { ReactNode } from 'react';

// ---- 类型 ----
interface ViewState {
  selectedId: string | null;
  filterText: string;
}

type ViewAction =
  | { type: 'SELECT'; id: string }
  | { type: 'FILTER'; text: string }
  | { type: 'RESET' };

interface ViewContextValue {
  state: ViewState;
  dispatch: React.Dispatch<ViewAction>;
}

// ---- Reducer ----
const initialState: ViewState = {
  selectedId: null,
  filterText: '',
};

function viewReducer(state: ViewState, action: ViewAction): ViewState {
  switch (action.type) {
    case 'SELECT': return { ...state, selectedId: action.id };
    case 'FILTER': return { ...state, filterText: action.text };
    case 'RESET': return initialState;
    default: return state;
  }
}

// ---- Context ----
const ViewContext = createContext<ViewContextValue | null>(null);

export function ViewProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(viewReducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);

  return (
    <ViewContext.Provider value={value}>
      {children}
    </ViewContext.Provider>
  );
}

export function useViewContext(): ViewContextValue {
  const ctx = useContext(ViewContext);
  if (!ctx) {
    throw new Error('useViewContext 必须在 ViewProvider 内使用');
  }
  return ctx;
}
```
