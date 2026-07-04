# 圈复杂度限制规则 — 详细说明

## 规则核心

**圈复杂度（Cyclomatic Complexity）必须 ≤ 10。** 超过此阈值的函数必须拆分。

### 理由

圈复杂度衡量的是代码中独立执行路径的数量。值越高，意味着：

1. **测试难度指数级增长**：需要 `复杂度 + 1` 个测试用例才能覆盖所有路径
2. **Bug 率升高**：McCabe 的研究表明，复杂度 > 10 的模块缺陷率显著上升
3. **可读性下降**：嵌套的 if/else 和多重条件判断使代码难以理解
4. **维护成本高**：修改复杂函数容易引入回归缺陷

### 阈值解释

| 复杂度 | 评级      | 说明                   |
| ------ | --------- | ---------------------- |
| 1-5    | ✅ 优秀   | 简单、清晰、低风险     |
| 6-10   | ⚠️ 可接受 | 不复杂但有一定路径分支 |
| 11-20  | ❌ 过高   | 应该重构拆分           |
| 21+    | 🚨 危险   | 必须立即重构           |

### 复杂度计算方式

每增加一个独立路径，复杂度 +1：

| 代码结构                          | 复杂度增量 |
| --------------------------------- | ---------- | ---------- | --- |
| `if` 语句                         | +1         |
| `else if` / `else`                | +1         |
| `for` / `while` / `do-while` 循环 | +1         |
| `case` 分支（switch）             | +1         |
| `catch` 块                        | +1         |
| `&&` / `                          |            | ` 短路逻辑 | +1  |
| `??` 空值合并                     | +1         |
| 三元运算符 `? :`                  | +1         |
| 递归调用                          | +1         |

### 重构策略

#### 策略 1：提取函数（最常用）

```typescript
// ❌ 复杂度 12：过高
function processOrder(order: Order) {
    if (order.isPaid) {
        if (order.items.length > 0) {
            for (const item of order.items) {
                if (item.isAvailable) {
                    if (item.discount > 0) {
                        // ...
                    } else {
                        // ...
                    }
                } else {
                    // ...
                }
            }
        } else {
            // ...
        }
    } else {
        // ...
    }
}

// ✅ 拆分后：每个函数复杂度 ≤ 5
function processOrder(order: Order) {
    if (!order.isPaid) return handleUnpaidOrder(order)
    if (order.items.length === 0) return handleEmptyOrder(order)
    return processOrderItems(order.items)
}

function processOrderItems(items: OrderItem[]) {
    return items
        .filter((item) => item.isAvailable)
        .map((item) => (item.discount > 0 ? applyDiscount(item) : processItem(item)))
}
```

#### 策略 2：策略模式替换 switch/case

```typescript
// ❌ 复杂度随 case 线性增长
function getHandler(type: string) {
    switch (type) {
        case 'A':
            return handlerA // +1
        case 'B':
            return handlerB // +1
        case 'C':
            return handlerC // +1
        // ... 更多 case
        default:
            return defaultHandler // +1
    }
}

// ✅ 使用映射表：复杂度恒为 1
const handlers: Record<string, () => void> = {
    A: handlerA,
    B: handlerB,
    C: handlerC
}
function getHandler(type: string) {
    return handlers[type] ?? defaultHandler
}
```

#### 策略 3：提前返回（Guard Clauses）

```typescript
// ❌ 复杂度 6：嵌套 if
function getDiscount(user: User) {
    if (user.isActive) {
        if (user.isPremium) {
            if (user.yearsActive > 5) {
                return 0.3
            } else {
                return 0.2
            }
        } else {
            return 0.1
        }
    } else {
        return 0
    }
}

// ✅ 复杂度 4：提前返回
function getDiscount(user: User) {
    if (!user.isActive) return 0
    if (!user.isPremium) return 0.1
    if (user.yearsActive > 5) return 0.3
    return 0.2
}
```

#### 策略 4：合并条件

```typescript
// ❌ 复杂度 4：多个独立 if
function isValid(data: Data) {
    if (data.name === '') return false // +1
    if (data.age < 0) return false // +1
    if (data.email === '') return false // +1
    return true // +1
}

// ✅ 复杂度 2：合并条件
function isValid(data: Data) {
    return data.name !== '' && data.age >= 0 && data.email !== ''
}
```

#### 策略 5：多态替换条件

```typescript
// ❌ 类型判断 + 不同行为 = 高复杂度
function calculatePrice(product: Product) {
    if (product.type === 'book') return product.price * 1.0
    if (product.type === 'electronics') return product.price * 1.2
    if (product.type === 'food') return product.price * 0.8
    return product.price
}

// ✅ 多态：每种类型有自己的定价逻辑
abstract class Product {
    abstract getFinalPrice(): number
    constructor(public price: number) {}
}

class Book extends Product {
    getFinalPrice() {
        return this.price * 1.0
    }
}
class Electronics extends Product {
    getFinalPrice() {
        return this.price * 1.2
    }
}
class Food extends Product {
    getFinalPrice() {
        return this.price * 0.8
    }
}
```

### ESLint 配置

```json
{
    "rules": {
        "complexity": ["error", 10]
    }
}
```

或使用 `@typescript-eslint` 插件：

```json
{
    "plugins": ["@typescript-eslint"],
    "rules": {
        "@typescript-eslint/cyclomatic-complexity": ["error", { "max": 10 }]
    }
}
```

### 检测方式

```bash
# 使用 nut-lint 检查
nut-lint run --rule "complexity: [error, 10]"

# 使用 ESLint CLI
npx eslint --rule "complexity: [error, 10]" src/

# 仅检查复杂度
npx eslint --rule "complexity: [error, 10]" --no-eslintrc src/
```

### 反模式

| 反模式                           | 问题                   | 正确做法                          |
| -------------------------------- | ---------------------- | --------------------------------- |
| 单个巨型函数处理所有逻辑         | 复杂度失控             | 拆分为多个小函数，每个复杂度 ≤ 10 |
| 深层嵌套 if-else                 | 复杂度线性增长         | 提前返回 / 策略模式               |
| 巨大的 switch-case               | 每个 case 都增加复杂度 | 映射表 / 多态                     |
| 合并多个条件判断为一个巨型表达式 | 难以理解               | 拆分子条件为有意义的函数          |
