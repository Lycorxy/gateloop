---
description: React 组件设计模式与最佳实践 — 源自 React 源码解析 + 状态管理知识库 + React设计模式 + 反模式实战。按需查阅。
globs: ["**/*.tsx"]
alwaysApply: false
---

# React 组件设计模式

> 基于 React 源码深度解析 + 状态管理知识库 + React 设计模式与最佳实践提炼。
> ⚡ 本文件为知识库参考，遇到组件设计/状态管理/性能优化/反模式问题时按需查阅。

---

## 一、组件拆分原则

### 1.1 容器/展示分离

```
容器组件（Smart）：负责数据获取、状态管理、副作用编排
展示组件（View）：只接收 props，只负责渲染，必须 memo 包裹

判断规则：
  如果一个组件既获取数据又渲染复杂 UI → 必须拆分
```

### 1.2 组件大小控制

```
≤ 30 行 JSX  → 无需拆分
30-60 行 JSX → 考虑拆分子组件
> 60 行 JSX  → 必须拆分

拆分策略：
  1. 按区域拆：Header / Content / Footer
  2. 按功能拆：FilterBar / DataTable / Pagination
  3. 按重复拆：ListItem / Card（可复用单元）
```

---

## 二、组件复用三大模式（核心）

> 来源：React设计模式与最佳实践 第3-4章 + RP01

三种模式的本质都是**控制反转（IoC）**——将部分逻辑的控制权从组件内部转移到使用者手中。

### 2.1 方案对比总览

| 维度 | Render Props | HOC | Compound Components |
|------|-------------|-----|---------------------|
| **代码可读性** | 中等（嵌套层级） | 差（包装器堆叠） | **优秀**（声明式） |
| **类型推断** | 好 | 较差（需要泛型透传） | **优秀**（Context约束） |
| **调试体验** | 清晰 | 困难（匿名组件） | **清晰**（具名组件） |
| **灵活性** | 最高 | 高 | 中等 |
| **学习曲线** | 低 | 高 | 低 |
| **适用场景** | 需要自定义渲染 | 跨库逻辑复用 | **UI组件库首选** |
| **React官方态度** | 推荐 | 已不推荐 | **强烈推荐** |

### 2.2 Render Props 模式

```tsx
// 数据获取组件 - 将获取逻辑封装，渲染权交给调用者
function DataFetcher<T>({ 
  url, 
  render, 
  children 
}: {
  url: string
  render: (data: T) => React.ReactNode
  children?: (data: T) => React.ReactNode
}) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(url).then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [url])

  if (loading) return <Skeleton />
  return data ? (render?.(data) ?? children?.(data)) : null
}

// 使用
<DataFetcher<User> url="/api/user">
  {(user) => <Avatar name={user.name} src={user.avatar} />}
</DataFetcher>
```

### 2.3 HOC 模式

```tsx
// withLoading - 加载状态增强
function withLoading<P extends object>(
  WrappedComponent: ComponentType<P>,
): ComponentType<P & { loading?: boolean }> {
  return function WithLoading({ loading, ...props }) {
    if (loading) return <Spinner />
    return <WrappedComponent {...(props as P)} />
  }
}

// withAuth - 认证守卫
function withAuth<P extends object>(
  WrappedComponent: ComponentType<P>,
): ComponentType<P> {
  return function WithAuth(props) {
    const { isAuthenticated } = useAuth()
    if (!isAuthenticated) return <Navigate to="/login" />
    return <WrappedComponent {...props} }
  }

// 组合使用
const ProtectedProfile = compose(withLoading, withAuth)(UserProfile)
```

### 2.4 Compound Components 模式（推荐）

```tsx
// 1. 创建 Context 传递内部状态
const TabsContext = createContext<{
  activeTab: string
  setActiveTab: (id: string) => void
} | null>(null)
const useTabs = () => useContext(TabsContext)!

// 2. 容器组件 - 管理状态
export function Tabs({ children, defaultValue }: { 
  children: React.ReactNode; defaultValue: string 
}) {
  const [activeTab, setActiveTab] = useState(defaultValue)
  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className="tabs">{children}</div>
    </TabsContext.Provider>
  )
}

// 3. 子组件 - 消费 Context
export function Tab({ id, children, disabled }: { 
  id: string; children: React.ReactNode; disabled?: boolean 
}) {
  const { activeTab, setActiveTab } = useTabs()
  const isActive = activeTab === id
  return (
    <button role="tab" aria-selected={isActive} aria-disabled={disabled}
      disabled={disabled}
      onClick={() => !disabled && setActiveTab(id)}
      className={`tab ${isActive ? 'active' : ''}`}
    >{children}</button>
  )
}

export function TabPanel({ id, children }: { id: string; children: React.ReactNode }) {
  const { activeTab } = useTabs()
  if (activeTab !== id) return null
  return <div role="tabpanel">{children}</div>
}

// 使用 —— 声明式 API，最自然的写法
<Tabs defaultValue="tab1">
  <TabList>
    <Tab id="tab1">首页</Tab>
    <Tab id="tab2">详情</Tab>
  </TabList>
  <TabPanel id="tab1"><HomeContent /></TabPanel>
  <TabPanel id="tab2"><DetailContent /></TabPanel>
</Tabs>
```

### 2.5 常见误区

| # | 误区 | 正解 |
|---|------|------|
| 1 | 多层Render Props嵌套造成缩进地狱 | 用compose工具函数扁平化或改用Compound Components |
| 2 | HOC 名称不以`with`前缀开头导致静态方法丢失 | 始终用`with`/`use`前缀，并用hoist-non-react-statics保留原始静态属性 |
| 3 | 复合组件未处理未包裹在容器中的情况 | 在每个子组件中做Context检查并抛出明确错误 |
| 4 | 复合组件忽略无障碍属性 | 必须添加role/aria-selected/aria-checked等ARIA属性 |

---

## 三、Hook 设计模式

### 3.1 自定义 Hook 提取原则

```typescript
// 何时提取为自定义 Hook：
// 1. useState + useEffect 有逻辑关联
// 2. 多个组件需要相同的状态逻辑
// 3. 组件内有 3+ 个 useState 且有联动关系

function useToggle(initial = false) {
  const [value, setValue] = useState(initial);
  const toggle = useCallback(() => setValue(v => !v), []);
  const setTrue = useCallback(() => setValue(true), []);
  const setFalse = useCallback(() => setValue(false), []);
  return { value, toggle, setTrue, setFalse } as const;
}
```

### 3.2 Hook 组合模式

```typescript
// 大 Hook 由小 Hook 组合而成
function useUserPage() {
  const { users, loading, error, refetch } = useUserList();
  const { selectedId, select, deselect } = useSelection();
  const { isOpen, open, close } = useToggle();

  const handleDelete = useCallback(async (id: string) => {
    await deleteUser(id);
    deselect();
    refetch();
  }, [deleteUser, deselect, refetch]);

  return { users, loading, error, selectedId, select, isOpen, open, close, handleDelete };
}
```

---

## 四、状态管理决策树

```
┌─ 只有当前组件用？ → useState
├─ 派生值（可从其他 state 计算）？ → useMemo
├─ 需要在 URL 中保留？ → useSearchParams
├─ 同模块 2-3 个组件共享？ → React Context + useReducer
├─ 跨模块/跨页面持久共享？ → 考虑第三方库（先评估 URL/localStorage）
└─ 来自服务端（API 数据）？ → React Query / SWR
```

### 4.1 Context 分层隔离技术

> 来源：RP04 — Context作用域与隔离技术

**核心问题**：Context 的值对整个组件树全局可见，导致 Context泄漏/冲突覆盖/性能问题。

**解决方案体系**：

| 技术 | 原理 | 适用场景 |
|------|------|---------|
| **分层Context** | 将大Context拆分为多个小Context，按变化频率分层 | **首选：减少不必要的重渲染** |
| **ContextIsolator** | 在子树边界处阻断指定Context，返回默认值 | Modal、Portal、独立面板 |
| **读写分离** | StateContext + DispatchContext 分开 | 减少非相关state变化触发的重渲染 |

#### 推荐的分层策略

```tsx
// ❌ 反模式：一个大Context导致任何字段变化都触发全部消费者更新
const AppContext = createContext({ user, settings, theme, notifications, locale })

// ✅ 推荐：按变化频率分层拆分

// L1: 极少变化（应用生命周期内基本不变）
const LocaleContext = createContext('zh-CN')

// L2: 少量变化（用户切换时变化）
const UserContext = createContext<User | null>(null)

// L3: 中频变化（设置面板操作）
const SettingsContext = useStateContext<Settings>(defaultSettings)

// L4: 高频变化（每次通知都变）- 独立出来避免拖慢其他消费者
const NotificationContext = createContext<Notification[]>([])

// 消费者只订阅需要的层级
function UserProfile() {
  const user = useContext(UserContext)        // 只在user变化时更新
  const locale = useContext(LocaleContext)     // 只在locale变化时更新
  // settings/notifications 变化不影响此组件 ✅
}
```

#### ContextIsolator — 弹窗内隔离外部Context

```tsx
export function ContextIsolator({ contexts, children }: {
  contexts: Array<React.Context<any>>
  children: React.ReactNode
}) {
  let tree = children
  for (const Ctx of contexts) {
    tree = createElement(Ctx.Provider, { value: undefined }, tree)
  }
  return <>{tree}</>
}

// 使用：Modal中的内容不应感知外部上下文
<Modal open={showModal}>
  <ContextIsolator contexts={[ThemeContext, UserContext]}>
    <PublicWidget />
  </ContextIsolator>
</Modal>
```

### 4.2 避免不必要的重渲染

```typescript
// ✅ Context 值用 useMemo 稳定化
const value = useMemo(() => ({ state, dispatch }), [state]);

// ✅ 拆分 Context（读写分离）
const StateContext = createContext<State>(initialState);
const DispatchContext = createContext<Dispatch>(() => {});

// ✅ 子组件用 memo 隔离
const ExpensiveChild = memo(function ExpensiveChild({ data }: Props) {
  return <div>{/* 复杂渲染 */}</div>;
});
```

---

## 五、受控 vs 非受控组件

```typescript
// ✅ 兼容受控/非受控的通用模式
function useControllable<T>(props: {
  value?: T;
  defaultValue: T;
  onChange?: (val: T) => void;
}) {
  const [internal, setInternal] = useState(props.defaultValue);
  const isControlled = props.value !== undefined;
  const currentValue = isControlled ? props.value : internal;

  const setValue = useCallback((next: T) => {
    if (!isControlled) setInternal(next);
    props.onChange?.(next);
  }, [isControlled, props.onChange]);

  return [currentValue, setValue] as const;
}
```

---

## 六、条件渲染模式

```typescript
// ✅ 三态渲染
function UserList() {
  const { data, loading, error } = useUserList();

  if (loading) return <Skeleton count={5} />;
  if (error) return <ErrorCard message={error.message} onRetry={refetch} />;
  if (!data?.length) return <Empty description="暂无用户" />;

  return (<ul>{data.map(user => <UserItem key={user.id} user={user} />)}</ul>);
}

// ✅ 策略模式替代嵌套三元
const VIEW_MAP: Record<ViewType, React.ComponentType> = {
  list: ListView,
  grid: GridView,
  kanban: KanbanView,
};
function DynamicView({ type }: { type: ViewType }) {
  const Component = VIEW_MAP[type] ?? ListView;
  return <Component />;
}
```

---

## 七、Presence 动画感知挂卸载模式

> 来源：RP11 — 解决 React 一旦卸载组件就无法执行动画的根本矛盾

### 核心思路

```
[初始] → entering → visible → exiting → [卸载]
                ↓                              ↑
           (enter动画完成)              (exit动画完成 → 真正unmount)
```

### Presence 组件实现

```tsx
type PresenceState = 'present' | 'exiting' | 'unmounted'

interface PresenceProps {
  present: boolean
  children: React.ReactNode
  enterClassName?: string
  exitClassName?: string
  enterDuration?: number
  exitDuration?: number
  onAnimationEnd?: (state: 'enter' | 'exit') => void
  onFullyHidden?: () => void
}

export function Presence({
  present, children,
  enterClassName = 'presence--enter',
  exitClassName = 'presence--exit',
  enterDuration = 200, exitDuration = 200,
  onAnimationEnd, onFullyHidden,
}: PresenceProps) {
  const [state, setState] = useState<PresenceState>(
    present ? 'present' : 'unmounted'
  )
  const elementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (present) {
      setState('present')
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          elementRef.current?.classList.add(enterClassName)
          const timer = setTimeout(() => {
            elementRef.current?.classList.remove(enterClassName)
            onAnimationEnd?.('enter')
          }, enterDuration)
          return () => clearTimeout(timer)
        })
      })
    } else if (state === 'present') {
      elementRef.current?.classList.add(exitClassName)
      const timer = setTimeout(() => {
        setState('unmounted')
        elementRef.current?.classList.remove(exitClassName)
        onAnimationEnd?.('exit')
        onFullyHidden?.()
      }, exitDuration)
      return () => clearTimeout(timer)
    }
  }, [present])

  if (state === 'unmounted') return null

  return (
    <div ref={elementRef} data-state={state === 'exiting' ? 'exiting' : 'present'}>
      {children}
    </div>
  )
}
```

### CSS 配合

```css
.presence--animate-enter {
  animation: presence-enter var(--enter-duration, 200ms) ease-out forwards;
}
.presence--animate-exit {
  animation: presence-exit var(--exit-duration, 200ms) ease-in forwards;
}
@keyframes presence-enter {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes presence-exit {
  from { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(-8px); }
}
```

### 使用场景：带动画的 Modal

```tsx
export function Modal({ open, onClose, title, children }: ModalProps) {
  return createPortal(
    <>
      <Presence present={open} enterDuration={200} exitDuration={200}>
        <div className="modal-mask" onClick={onClose} />
      </Presence>
      <Presence present={open} enterDuration={250} exitDuration={200}>
        <div className="modal-dialog" role="dialog" aria-modal="true">
          <header><h2>{title}</h2><button onClick={onClose}>&times;</button></header>
          <div>{children}</div>
        </div>
      </Presence>
    </>,
    document.body
  )
}
```

---

## 八、性能优化模式

### 8.1 memo / useMemo / useCallback 使用准则

```
必须 memo：展示组件、列表项、接收复杂 props 的子组件
必须 useMemo：大数组排序过滤、Context value、引用类型 deps
必须 useCallback：传给 memo 子组件的回调、useEffect deps 函数
不需要：简单组件（渲染<5ms）、不传给子组件的内部函数
```

### 8.2 列表渲染

```typescript
// ✅ key 用稳定业务 ID
{items.map(item => <ListItem key={item.id} item={item} />)}

// ✅ 大列表（>100项）用虚拟滚动
import { useVirtualizer } from '@tanstack/react-virtual';
```

### 8.3 代码分割

```typescript
// ✅ 路由级懒加载
const UserPage = lazy(() => import('./views/user'));

// ✅ 配合 Suspense
<Suspense fallback={<PageSkeleton />}><UserPage /></Suspense>
```

---

## 九、反模式清单（必须避免）

> 来源：React设计模式与最佳实践 第11章

### 9.1 用 prop 初始化状态（破坏单一数据源）

```tsx
// ❌ prop 变化时 state 不会同步更新
function Counter({ count }: { count: number }) {
  const [value, setValue] = useState(count);  // 只在首次生效！
  // ...
}

// ✅ 如果确实只需要初始值，命名要明确表达意图
function Counter({ initialCount }: { initialCount: number }) {
  const [value, setValue] = useState(initialCount);
  // ...
}

// ✅ 如果需要同步 prop → 直接使用 prop 或用 key 重置
function Counter({ count }: { count: number }) {
  // 直接用 prop，不引入 state
  return <span>{count}</span>
}
```

### 9.2 直接修改状态

```tsx
// ❌ 直接修改 state —— 不触发重渲染 + 导致状态不一致
handleClick() { this.state.items.push('baz'); this.setState({ items }); }

// ✅ 不可变更新
handleClick() {
  this.setState({ items: [...this.state.items, 'baz'] });
  // Hooks 版: setItems(prev => [...prev, 'baz'])
}
```

### 9.3 数组索引作为 key

```tsx
// ❌ 索引作为 key —— 列表增删时导致 DOM 错误复用
{items.map((item, index) => <li key={index}>{item}</li>)}

// ✅ 使用稳定的唯一 ID
{items.map(item => <li key={item.id}>{item}</li>)}
```

### 9.4 在 DOM 元素上展开 props 对象

```tsx
// ❌ 可能传入未知 HTML 属性，React 会报警告
const Spread = props => <div {...props} />

// ✅ 显式声明或过滤 DOM 属性
const Spread = ({ domProps, ...rest }) => <div {...domProps} />
<Spread foo="bar" domProps={{ className: 'baz' }} />
```

### 9.5 反模式速查表

| 反模式 | 问题 | 正确做法 |
|--------|------|---------|
| prop 初始化 state | 单一数据源被破坏 | 用 `initial*` 命名或直接用 prop |
| 直接修改 state | 不触发重渲染、状态不一致 | 不可变更新（展开/concat/filter） |
| 数组索引作 key | 列表增删时 UI 错乱 | 用业务 ID 作 key |
| DOM 元素展开 props | 未知属性警告 | 过滤出合法 DOM 属性 |
| 每个 hook 都用 memo | 不必要的浅比较开销 | 仅在 props 稳定时才 memo |
| Context 存高频数据 | 任何小变动都触发全部消费者重渲染 | 按变化频率拆分 Context |
| 不必要的 HOC | Wrapper Hell、调试困难 | Compound Components 或自定义 Hook |

---

## 十、React 源码级认知

```
1. Fiber 双缓冲：React 18+ 所有更新自动批量（automatic batching）
2. Hooks 链表：不能在 if/for/return 之后调用 Hook（顺序必须一致）
3. useEffect 异步执行（不阻塞绘制），useLayoutEffect 同步执行（99% 用前者）
4. setState 是批量调度：React 事件处理中自动合并，async 中不会（用 flushSync 或 unstable_batchedUpdates）
5. key 的作用：帮助 React 识别哪些元素变化了，而非简单的 "唯一标识"
```
