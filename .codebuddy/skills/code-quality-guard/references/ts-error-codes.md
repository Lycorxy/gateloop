# TypeScript 错误代码完整参考

## 目录
- [类型错误 (TS23XX)](#类型错误-ts23xx)
- [赋值错误 (TS26XX)](#赋值错误-ts26xx)
- [声明错误 (TS23XX-cont)](#声明错误-ts23xx-cont)
- [模块错误 (TS23XX-modules)](#模块错误-ts23xx-modules)
- [类/接口错误 (TS24XX-26XX)](#类接口错误-ts24xx-26xx)
- [异步/Await 错误 (TS13XX, TS27XX)](#异步await-错误-ts13xx-ts27xx)
- [修复策略矩阵](#修复策略矩阵)

---

## 类型错误 (TS23XX)

### TS2322 — 类型 'X' 不能分配给类型 'Y'

**原因**：将一个类型的值分配给不兼容类型的变量/参数。

**常见场景**：
- 字符串分配给数字参数
- 对象缺少接口所需的属性
- 联合类型不匹配

**修复策略**（按优先级排序）：
1. 修复实际类型定义（最佳：纠正根本原因）
2. 添加显式类型断言 `as TargetType`（当你确定时可以接受）
3. 使用联合放宽目标类型：`string | number`
4. 如果适用，使用泛型约束

**示例**：
```typescript
// 错误：Type 'string' is not assignable to type 'number'
const id: number = getUserInput()  // 返回 string

// 修复 1：转换
const id: number = Number(getUserInput())

// 修复 2：放宽类型
const id: string | number = getUserInput()
```

---

### TS2345 — 类型 'X' 的参数不能分配给类型 'Y' 的参数

**原因**：函数调用参数与参数类型不匹配。

**修复策略**：
1. 在调用点类型断言参数：`func(arg as TargetType)`
2. 检查函数签名 — 可能需要重载或泛型
3. 如果函数参数类型错误，修复函数签名

**示例**：
```typescript
function process(id: number): void { /* ... */ }

// 错误：Argument of type 'string' is not assignable to parameter of type 'number'
process('abc')

// 修复
process(Number('abc'))  // 或 process('abc' as unknown as number) — 最后手段
```

---

### TS2532 — 对象可能为 'undefined'

**原因**：在可能为 undefined 的值上访问属性。

**修复策略**：
1. 可选链：`obj?.prop?.nested`
2. 非空断言：`obj.prop!`（仅在确定时使用）
3. If 守卫：`if (obj?.prop) { ... }`
4. 默认值：`obj.prop ?? defaultValue`
5. 带默认值的解构：`const { prop = default } = obj`

**示例**：
```typescript
interface Response { data?: { items?: Item[] } }

// 错误：Object is possibly 'undefined'
return response.data.items.length

// 修复 A（推荐）：可选链 + 空值合并
return response.data?.items?.length ?? 0

// 修复 B（确定存在）：非空断言
return response.data!.items.length
```

---

### TS18046 / TS18047 — 'X' 可能为 'X'（缩窄失败）

**原因**：TypeScript 控制流分析无法在检查后缩窄类型。

**修复策略**：
1. 显式类型守卫函数：`isString(val): val is string { ... }`
2. 检查后的非空断言：`if (val) { use(val!) }`
3. 自定义类型的类型谓词
4. 验证后的类型断言：`val as ExpectedType`

---

### TS7006 / TS7034 — 隐式 'any' 类型

**原因**：参数缺少类型注解且无法推断。

**修复**：始终添加显式注解：

```typescript
// 错误：Parameter 'x' implicitly has an 'any' type
const double = (x) => x * 2

// 修复
const double = (x: number) => x * 2
```

---

### TS2339 — 属性 'X' 在类型 'Y' 上不存在

**原因**：访问类型化对象上不存在的属性。

**修复策略**：
1. **最佳**：向接口/类型添加属性
2. **快速**：`(obj as any).prop` — 但这破坏了类型安全
3. **索引签名**：向接口添加 `[key: string]: unknown`
4. **品牌类型**：使用交集扩展：`Type & { newProp: Type }`

---

### TS6133 / TS6138 — 未使用的变量 / 声明

**原因**：已声明但从未引用。

**修复**：
1. 删除未使用的声明（推荐）
2. 添加 `_` 前缀：`_unusedVar` 表示有意丢弃
3. 解构时不命名：`const { used, _unused } = obj`

---

### TS2554 — 应有 N 个参数，但获得 M 个

**原因**：函数调用中参数数量错误。

**修复**：
1. 检查函数签名 — 添加/删除参数
2. 对于可选参数：它们可能现在有默认值
3. 对于剩余参数：使用展开传递数组 `...args`
4. 对于重载：确保匹配正确的重载

---

### TS2304 — 找不到名称 'X'

**原因**：引用的名称未导入或声明。

**修复**：
1. 添加导入：`import { X } from 'module'`
2. 检查拼写（区分大小写！）
3. 检查是否是 needing `@types/` 包的全局类型
4. 检查 tsconfig 的 `include` / `paths` 配置

---

### TS2584 — 不能从返回类型不包含 'undefined' 的函数返回可能为 'undefined' 的值

**原因**：代码路径可能返回 undefined 但返回类型不允许。

**修复**：
1. 为所有路径添加显式返回
2. 在末尾添加默认返回
3. 放宽返回类型：`T | undefined`
4. 抛出错误而不是隐式 undefined

---

### TS2696 — 'object' 不是 'Object'

**原因**：使用小写 `object`（非原始类型）而不是大写 `Object`（全局构造函数类型）。

**修复**：对全局构造函数类型使用 `Object`，对"任何非原始类型"使用 `object`。

---

## 赋值错误 (TS26XX)

### TS2696 —（见上文）

---

## 声明错误 (TS23XX-cont)

| 代码 | 含义 | 快速修复 |
|------|------|----------|
| TS2307 | 找不到模块 | 检查导入路径，安装包 |
| TS2314 | 泛型类型需要类型参数 | 向调用添加 `<T>` |
| TS2321 | 过多的堆栈深度（递归类型） | 重构循环引用 |
| TS2352 | 表达式不能用于类型 | 使用 `typeof` 或提取接口 |
| TS2362 | 算术左侧赋值 | 检查 `==` 与 `=` 拼写错误 |
| TS2457 | 实例断言它与静态相同 | 删除冗余的 `this` 上下文 |
| TS2416 | 索引签名中的属性不兼容 | 对齐类型 |

## 模块错误 (TS23XX-modules)

| 代码 | 含义 | 快速修复 |
|------|------|----------|
| TS1149 | 文件已包含 | 删除重复导入 |
| TS1166 | 类必须扩展允许的基础 | 检查继承 |
| TS1170 | 字面量值必须匹配枚举成员 | 使用确切的枚举值 |
| TS1183 | 实现必须匹配接口 | 填充所有必需的成员 |
| TS1196 | Catch 子句变量类型 | 用 `unknown` 注解 |
| TS1202 | 不能使用导入赋值 | 使用 `import X = require('y')` 或默认导入 |
| TS1218 | 不能使用导出赋值 | 使用 `export default` |
| TS1230 | 合并中标识符已声明 | 重命名冲突的成员 |
| TS1245 | 模块需要兼容的类型 | 对齐模块形状 |

## 类/接口错误 (TS24XX-26XX)

| 代码 | 含义 | 快速修复 |
|------|------|----------|
| TS2410 | 重载具有不同的返回 | 匹配所有重载签名 |
| TS2411 | 属性没有实现 | 在类体中实现 |
| TS2412 | 抽象成员未实现 | 实现具体版本 |
| TS2414 | 类错误扩展 | 检查继承链 |
| TS2415 | 类错误实现 | 履行接口契约 |
| TS2416 | 重写中的属性不兼容 | 使用 `override` 关键字，对齐类型 |
| TS2417 | 类静态侧继承不正确 | 检查泛型约束 |
| TS2420 | 类错误实现接口 | 实现所有成员 |
| TS2497 | This 隐式具有类型 'any' | 注解 `this` 参数 |
| TS2564 | 属性没有初始化器 | 添加 `= defaultValue` 或在构造函数中赋值 |
| TS2695 | 'in' 的左侧必须不是原始类型 | 使用正确的对象检查 |

## 异步/Await 错误

| 代码 | 含义 | 快速修复 |
|------|------|----------|
| TS1327 | 只有异步函数可以 await | 使包含的函数异步 |
| TS1343 | `await import()` 需要 `--esModuleInterop` | 在 tsconfig 中启用 |
| TS1375 | `await` 表达式仅在异步函数中有效 | 重构代码或使函数异步 |
| TS1378 | 不允许顶层 await | 包装在异步 IIFE 中，或在 tsconfig 中启用 |
| TS2705 | 异步函数必须返回 Promise | 检查返回类型 |
| TS2707 | 生成器不能是异步的 | 选择其中一种模式 |

---

## 修复策略矩阵

使用此矩阵按错误类别确定方法：

| 类别 | 自动修复？ | 风险 | 策略 |
|------|-----------|------|------|
| 缺少导入 | 是（IDE） | 低 | 添加导入行 |
| 错误的字面量类型 | 是（类型断言） | 低 | `as Type` 断言 |
| Undefined 访问 | 部分 | 中 | 可选链 `?.` |
| 隐式 any | 否 | 中 | 添加类型注解 |
| 接口不匹配 | 否 | 高 | 重新设计类型或类型断言 |
| 循环依赖 | 否 | 高 | 重构模块结构 |
| 泛型约束失败 | 否 | 高 | 检查泛型边界 |

## 批量修复的优先级顺序

当在一个文件中面临多个 TS 错误时，按此顺序修复以最小化级联：

1. **缺少导入**（TS2304）— 为后续错误解锁类型解析
2. **模块解析**（TS2307）— 相同原因
3. **参数类型不匹配**（TS2345）— 局部范围，可控
4. **Undefined/可空性**（TS2532、TS18046）— 常见，通常是局部的
5. **隐式 any**（TS7006）— 清理剩余噪音
6. **未使用的变量**（TS6133）— 最后清理（可能在上述修复期间消失）
