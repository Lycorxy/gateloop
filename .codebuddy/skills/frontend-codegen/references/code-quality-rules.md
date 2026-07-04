---
description: 代码质量深度参考 — 源自《Clean Code》《代码之外的功夫》《HTDP程序设计方法》。按需查阅，非必须注入。
globs: ["**/*.tsx", "**/*.ts"]
alwaysApply: false
---

# 代码质量核心规则

> 基于《Clean Code》《代码之外的功夫》《HTDP 程序设计方法》三大知识库提炼，面向 AI 代码生成的参考知识。
> ⚡ 本文件为知识库参考，仅在遇到函数设计/命名/错误处理/代码味道/迭进原则等问题时按需查阅。

---

## 一、函数设计原则（来自 Clean Code + HTDP）

### 1.1 单一职责，只做一件事

```typescript
// ✅ 每个函数只完成一个明确的事情
function formatPrice(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

function isExpired(expireAt: string): boolean {
  return new Date(expireAt).getTime() < Date.now();
}

// ❌ 一个函数做了查询 + 转换 + 校验 + 渲染准备
function processUserData(userId: string) {
  const raw = fetchUser(userId);
  const formatted = formatUser(raw);
  if (!isValid(formatted)) throw ...;
  return prepareForRender(formatted);
}
```

### 1.2 参数精简，不超过 3 个

```typescript
// ✅ 超过 3 个参数 → 用 options 对象
interface CreateOrderOptions {
  userId: string;
  items: OrderItem[];
  couponCode?: string;
  remark?: string;
}
function createOrder(options: CreateOrderOptions) {}

// ❌ 参数列表过长
function createOrder(userId: string, items: [], coupon: string, remark: string, urgent: boolean) {}
```

### 1.3 抽象层级一致

```typescript
// ✅ 同一函数内的操作在同一抽象层级
function processCheckout(cart: Cart) {
  const validated = validateCart(cart);
  const priced = calculatePricing(validated);
  const order = createOrder(priced);
  return order;
}
```

---

## 二、命名规则（来自 Clean Code）

### 2.1 动词前缀表达意图

```
获取数据:  fetch* / get* / load* / query*
创建资源:  create* / add* / register*
更新资源:  update* / set* / modify* / patch*
删除资源:  delete* / remove* / clear*
校验判断: is* / has* / can* / should* / validate*
转换格式:  format* / transform* / convert* / parse* / serialize*
计算派生:  calculate* / compute* / derive*
```

### 2.2 避免误导

```typescript
// ❌ 名字暗示是列表但实际是 Map
const userList = new Map<string, User>();  // 应该叫 userMap

// ❌ 缩写不通用
const genRptByTmpl = () => {};  // 应该叫 generateReportByTemplate
```

---

## 三、错误处理原则（来自 Clean Code 第7章 + 代码之外的功夫）

### 3.1 核心原则

> 错误处理很重要，但如果它搞乱了代码逻辑，就是错误的做法。

```
✅ 使用异常/Reject 而非返回码 —— 让调用代码更整洁
✅ 异常携带丰富上下文信息 —— 方便定位问题
✅ 按类型分类捕获异常 —— 不同错误不同处理
✅ fail-fast 原则 —— 入口处快速失败，不让错误数据继续传播
✅ 不要吞掉错误 —— 至少记录日志或返回兜底值
❌ 空catch块 —— 最糟糕的做法，隐藏了所有问题
```

### 3.2 不要吞掉错误

```typescript
// ✅ 明确处理每种失败情况
async function fetchUser(id: string): Promise<User | null> {
  try {
    const res = await fetch(`/api/users/${id}`);
    if (!res.ok) {
      console.error(`[fetchUser] HTTP ${res.status} for id=${id}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`[fetchUser] Network error for id=${id}`, err);
    return null;
  }
}
```

### 3.3 Fail-Fast 原则

```typescript
// ✅ 入口处快速失败，不让错误数据继续传播
function processOrder(order: unknown) {
  if (!order || typeof order !== 'object') {
    throw new TypeError('[processOrder] 参数必须是对象');
  }
  const { items, total } = order as OrderInput;
  if (!Array.isArray(items) || items.length === 0) {
    throw new RangeError('[processOrder] items 不能为空');
  }
  // ... 正常逻辑
}
```

### 3.4 兜底函数统一维护

```typescript
/** 安全 JSON 解析，失败返回 fallback —— 提取到 @/utils/safe.ts 统一维护 */
export function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return (value as T) ?? fallback;
  try { return JSON.parse(value) as T; }
  catch { return fallback; }
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

---

## 四、不可变性原则（来自 HTDP + React 最佳实践）

```typescript
// ✅ 不可变更新
function addItem(list: Item[], newItem: Item): Item[] {
  return [...list, newItem];
}

function updateItem(list: Item[], id: string, patch: Partial<Item>): Item[] {
  return list.map(item =>
    item.id === id ? { ...item, ...patch } : item
  );
}

// ✅ React 状态更新
setCount(prev => prev + 1);
setUser(prev => ({ ...prev, name: newName }));
setItems(prev => prev.filter(item => item.id !== targetId));
```

---

## 五、简单设计规则（来自 Clean Code 第12章 — 迭进/Emergence）

> Kent Beck 的四条简单设计规则，按重要性排列：

```
1. 通过所有测试
2. 不包含重复（NO DUPLICATION）
3. 表达程序员的意图（EXPRESS INTENT）
4. 少量类和方法（MINIMIZE STRUCTURE）
```

### 5.1 消除重复

> 重复是良好设计系统的头号敌人。重复意味着额外工作、额外风险、额外不必要的复杂度。

```java
// 两个方法的实现可以统一
int size() {}
boolean isEmpty() {}

// ✅ 消除重复：让 isEmpty 依赖 size
boolean isEmpty() { return 0 == size(); }

// TypeScript 同理
function isEmpty(list: unknown[]): boolean {
  return list.length === 0;  // 复用 length 而非自己追踪状态
}
```

### 5.2 表达意图

> 代码应该像散文一样可读——选择好的名字、保持函数短小、使用标准模式。

```
✅ 代码即文档 —— 好的命名和结构让注释变得多余
✅ 每个函数做一件事并做好
✅ 抽象层级一致 —— 函数内的操作在同一层次
```

---

## 六、代码味道与启发（来自 Clean Code 第17章）

### 6.1 注释类味道

| 编号 | 味道 | 说明 | 处理方式 |
|------|------|------|---------|
| C1 | 不适当的信息 | 注释存放了应在版本控制/issue系统中的信息 | 移到合适的位置 |
| C2 | 过时的注释 | 注释已过时、不正确 | 更新或删除 |
| C3 | 冗余注释 | 注释描述了代码本身已经说明的内容（如 `i++ // i加1`） | 删除注释 |
| C4 | 糟糕的注释 | 值得写的注释就值得好好写 | 选词精准、语法正确 |
| C5 | 注释掉的代码 | 无人敢删的废弃代码 | **立即删除！** 版本控制系统记得它 |

### 6.2 函数类味道

| 编号 | 味道 | 说明 |
|------|------|------|
| F1 | 参数过多 | >3 个参数应考虑 options 对象 |
| F2 | 输出参数 | 参数应是输入而非输出，改变对象自身状态 |
| F3 | 标志参数 | Boolean 参数 loud 说明函数做了两件事 |
| F4 | 死函数 | 从未被调用的方法应丢弃 |

### 6.3 通用味道

| 编号 | 味道 | 说明 |
|------|------|------|
| G1 | 一个源文件多种语言 | 理想情况一个源文件只含一种语言 |
| G2 | 明显未实现的行为 | 违反"最小惊讶原则"，如 Day("Monday") 应该能识别 "Mon" |
| G3 | 边界行为不正确 | 每个边界条件和极端情况都需要测试覆盖 |

---

## 七、数据驱动设计（来自 HTDP）

```typescript
// 第一步：明确数据结构
interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}

// 第二步：基于数据结构写函数
function filterTodos(todos: TodoItem[], filter: TodoFilter): TodoItem[] {
  switch (filter) {
    case 'active': return todos.filter(t => !t.completed);
    case 'completed': return todos.filter(t => t.completed);
    default: return todos;
  }
}
```

---

## 八、复杂度管理

### 圈复杂度硬性上限

```
单个函数圈复杂度（Cyclomatic Complexity）≤ 10

计算方式：
  圈复杂度 = 决策点数 + 1
  决策点：if / else if / case / ? : / && / || / for / while / catch

示例：
  function example(a, b, c) {   // 基础 = 1
    if (a) { }                   // +1 (if)
    else if (b) { }              // +1 (else if)
    for (let i = 0; i < c; i++) { } // +1 (for)
    try { } catch { }            // +1 (catch)
    return a && b ? c : 0;       // +1 (&&) +1 (?:)
  }
  // 圈复杂度 = 1 + 5 = 6 ✅

硬性上限：
  ❌ 圈复杂度 > 10 → 必须拆分
  ❌ if/else 嵌套 > 5 层
  ❌ switch/case > 8 个分支
  ❌ && || 链式条件 > 4 个

拆分后目标：
  ✅ 每个子函数圈复杂度 ≤ 5
  ✅ 嵌套 ≤ 3 层
  ✅ switch/case ≤ 4 个分支（超过用策略映射）
```

### Guard Clause 模式（提前返回，减少嵌套）

```typescript
// ✅ 提前返回
function calculateDiscount(user: User, order: Order): number {
  if (!user.isVip) return 0;
  if (order.total < 100) return 0;
  if (order.items.length < 3) return order.total * 0.05;
  return order.total * 0.1;
}
```

### 策略映射（替代长 switch）

```typescript
const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'orange' },
  processing: { label: '处理中', color: 'blue' },
  completed: { label: '已完成', color: 'green' },
  cancelled: { label: '已取消', color: 'gray' },
};

function getStatusDisplay(status: OrderStatus) {
  return STATUS_CONFIG[status] ?? { label: '未知', color: 'gray' };
}
```

---

## 九、注释原则

```
✅ 保留「为什么」的注释：
  // HACK: Chrome 93 以下版本 IntersectionObserver 有 bug，需要延迟 50ms
  // NOTE: 此处故意不做 debounce，UX 要求即时响应
  // TODO: 性能优化点：后续考虑虚拟滚动

❌ 禁止的注释：
  // 获取用户（废话注释）
  // const oldCode = ... （注释掉的代码）
```
