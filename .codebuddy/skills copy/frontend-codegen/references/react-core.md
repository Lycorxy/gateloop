---
alwaysApply: true
globs: ["**/*.tsx", "**/*.ts", "**/*.scss"]
---

# React 核心强制规则

> 违反即重写。

## 容器/展示分离

```
容器（Smart）= useSelector/useDispatch/useEffect → 数据获取+状态编排，JSX>50行则拆子组件
展示（Dumb）= 只有 props → 必须 React.memo，禁止 API/dispatch/读 Redux
判断：又获取数据又渲染 UI → 必须拆分
```

## 单向数据流

```
Store → useAppSelector → 容器 → props → 展示 → 回调 → dispatch → Store
禁止：兄弟组件直接通信、展示组件 dispatch/调用 API
```

## Service 层隔离（权威）

```ts
// ✅ 组件通过 service 层：const [error, data] = await listCategoryApi(params);
// ❌ 禁止组件内 fetch/axios/post
```

所有 API 调用必须在 `client/src/service/` 层。

## 类型唯一来源（权威）

`import type { XxxInfo } from '@/api/types/{module}/index'` — 禁止在任何其他文件重定义。

> 按模块分目录：`@/api/types/category/index`、`@/api/types/method/index` 等。

## 状态归属

```
Redux（全局）：跨页面共享、多组件订阅、需持久化
Context（局部）：同一功能模块内的局部共享状态（如弹窗状态、表单上下文）
useState：单组件临时状态（表单值、弹窗开关、loading）
原则：能用 useState 就不用 Context，能用 Context 就不用 Redux
❌ 单组件数据放 Redux | ❌ 两个 Slice 存同一份数据 | ❌ 全局状态过度使用
```

## useEffect 防死循环

```
❌ 依赖数组有对象/数组字面量 → useMemo 稳定
❌ 依赖数组有函数 → useCallback
❌ useEffect 内 setState 且 state 在依赖中 → 改 useMemo
✅ 派生数据用 useMemo，不用 useEffect+setState
```

## 防无效多次更新

```
❌ 3个独立 setState → useReducer 批量
❌ useState+useEffect 算派生值 → useMemo
❌ 连续多个 dispatch → 合并为一个 action
```

## 规模限制（权威）

```
TSX ≤ 200 行 / JSX ≤ 50 行 / Props ≤ 5 / useEffect ≤ 3 / 函数 ≤ 30 行
文件 ≤ 300 行（TSX/TS/SCSS 均适用）
超出必须拆分，不得以任何理由豁免
```

## 不可变性（权威）

`[...arr]/{...obj}` 创建新引用。禁止 push/splice/直接赋值。

## 异步 6 步闭环

```ts
const handleSubmit = async (values) => {
  setLoading(true); // 1.loading
  try {
    const [error, data] = await xxxApi(values); // 2.调用API
    if (error) {
      message.error(error.message);
      return;
    } // 3.错误处理
    dispatch(setXxx(data)); // 4.成功更新
    message.success("操作成功");
    onSuccess?.(); // 5.反馈+刷新
  } finally {
    setLoading(false);
  } // 6.清loading
};
```

## 反模式速查（权威）

| 反模式                      | 正确做法                           |
| --------------------------- | ---------------------------------- |
| 组件内 fetch/post           | service 层                         |
| 重定义 types.ts 类型        | 从 @/api/types/{module}/index 导入 |
| 展示组件无 React.memo       | 必须包裹                           |
| 子组件函数无 useCallback    | 必须包裹                           |
| 列表 index 作 key           | 业务 ID                            |
| useEffect 依赖不完整        | 补全                               |
| 派生值用 useState+useEffect | useMemo                            |
| 3+ state 同时更新           | useReducer                         |
| 删除无确认                  | Popconfirm                         |
| 只处理正常态                | loading/error/empty 三态           |
| import styles from          | import \* as styles from           |
| 硬编码色值/间距             | CSS 变量带 fallback                |
| 局部状态用 Redux            | Context 或 useState                |
| 文件超 300 行               | 必须拆分子组件/子模块              |
