---
description: 前端代码生成规则 — CSS Modules + 中台组件 API + Hooks + 路由 + Service 层（权威文件）
globs: ["client/src/**/*.tsx", "client/src/**/*.scss", "client/src/**/*.ts"]
alwaysApply: true
---

# 前端代码生成规则

> ⚠️ Design Token（色彩/间距/圆角/字体）、布局原则、交互原则、SCSS 自检 → 统一见 `design-tokens.mdc`，本文件不重复。

---

## 一、CSS Modules（权威）

```ts
import * as styles from "./index.module.scss"; // ✅ 唯一正确写法
// import styles from ...  ❌ default 不存在
```

SCSS `.kebab-case` → TSX `styles.camelCase`（必须转换，不能省略）

**CSS Modules 中覆盖 antd 样式**：用 `:global(.ant-xxx)` 包裹，不能直接写 antd 类名。

---

## 二、中台组件 API

### TTable

```tsx
<TTable
  ref={tableRef}
  columns={columns}
  requestFunction={listApi}
  parseFunction={(data) => ({ dataSource: data.list, total: data.total })}
  searchProps={{ searchItems, onSearch: handleSearch }}
  tableHeadInfo={{
    title: "标题",
    buttonList: [<Button type="primary">新增</Button>],
  }}
/>
// 刷新：tableRef.current?.reload(true)
```

### TForm

```tsx
const fields = [
  {
    name: "x",
    label: "X",
    type: TFormItemType.INPUT,
    rules: [{ required: true }],
    configs: { placeholder: "请输入" },
  },
];
<TForm
  fields={fields}
  onValidateSuccess={handleSubmit}
  formBtnConfigs={[{ type: "submit" }, { type: "cancel" }]}
/>;
// ⚠️ placeholder 等属性必须放 configs 中
```

### TTableSearch

```tsx
const searchItems = [
  {
    name: "keyword",
    label: "关键词",
    type: TSearchItemType.Input,
    placeholder: "请输入",
  },
];
```

其他：`TEllipsis`(省略) · `TIcon`(图标,suffix) · `TWithPermission`(权限) · `TFloatImg`(悬浮预览)

---

## 三、中台 Hooks & 工具

**Hooks**：`useLoadingState` · `useDebounce` · `useThrottle` · `useAsyncEffect` · `useMount` · `useUnmount` · `useRequest` · `useEventListener`

**工具**：`Requester`(返回[error,data]元组) · `EventEmitter` · `StorageManager` · `GlobalMemory`(TTL缓存) · `deepGet` · `findParentNode/findSelfNode`

---

## 四、路由（权威）

```tsx
const routes: IRouteConfig[] = [
  {
    key: "/page-path",
    label: "名称",
    icon: <TIcon suffix="icon-name" />,
    component: lazy(() => import("@/pages/page-name")),
  },
];
// hiddenMenu: true 隐藏菜单 | 一级=顶部Tab，二三级=侧边栏
```

---

## 五、Service 层（权威）

```ts
import { post } from "./index";
import type { XxxRequest, XxxResponse } from "@/api/types/{module}/index";
export const xxxApi = (params: XxxRequest) =>
  post<XxxResponse>("/XxxMethod", params);
// 路径只写方法名，禁硬编码前缀 | 统一用 post
// 调用：const [error, data] = await xxxApi(params); if (error) { message.error('失败'); return; }
```

> 模块分目录示例：`@/api/types/category/index`、`@/api/types/method/index`

---

## 六、类型 A 限制

```
✅ 生成：页面骨架(.tsx) + SCSS + 路由注册
❌ 禁止：Service层 / Redux / API调用 / useDispatch/useSelector / mock数据
```
