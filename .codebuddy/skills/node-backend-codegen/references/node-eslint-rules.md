# Node.js 后端 ESLint 规则详细说明

从 eslint-code-quality 知识库中提取的、与 Node.js 后端代码生成直接相关的 ESLint 规则。

## 核心格式化规则

### semi — 禁止分号

- **项目配置**: `semi: 0`（关闭）
- **要求**: 所有语句末尾不加分号
- **例外**: 无

```typescript
// ✅ 正确
const x = 1
const fn = () => {
    return 1
}

// ❌ 错误
const x = 1
const fn = () => {
    return 1
}
```

### quotes — 单引号

- **项目配置**: 通过 prettier 集成
- **要求**: 字符串使用单引号，模板字符串中使用反引号

```typescript
// ✅ 正确
const name = 'hello'
const msg = `hello ${name}`

// ❌ 错误
const name = 'hello'
```

### object-curly-spacing — 花括号内空格

- **项目配置**: `'object-curly-spacing': ['error', 'always']`
- **要求**: 花括号内部有空格

```typescript
// ✅ 正确
import { join, resolve } from 'node:path'
const obj = { name: 'test' }

// ❌ 错误
import { join, resolve } from 'node:path'
const obj = { name: 'test' }
```

### eol-last — 文件末尾换行

- **项目配置**: `'eol-last': ['error', 'always']`
- **要求**: 文件最后一行必须有换行符

---

## TypeScript 规则

### @typescript-eslint/no-explicit-any — 关闭

- **项目配置**: `off`
- **说明**: 项目允许 `any`，但应尽量避免
- **建议**: 优先定义接口，仅在过渡期使用 `any`

### 严格空值检查

- **tsconfig**: `strictNullChecks: true`
- **要求**: 处理可能的 `null` / `undefined`

```typescript
// ✅ 正确
function findFile(path: string): string | null {
    // ...
    return null
}
const result = findFile(p)
if (result !== null) {
    // result 是 string
}

// ❌ 错误：忽略空值
const result = findFile(p)
console.log(result.toUpperCase()) // 可能为 null
```

### 显式返回类型

- **要求**: 所有导出函数必须有返回类型注解

```typescript
// ✅ 正确
export function processFile(path: string): Promise<string> {
    // ...
}

// ❌ 错误
export function processFile(path: string) {
    // ...
}
```

---

## Node.js 特定规则

### no-console — 生产代码禁止

- **要求**: 不使用 `console.log`/`console.error`
- **替代**: 使用 helpers 的日志工具或结构化输出

```typescript
// ✅ 正确：结构化输出
function processResult(result: ExecResult): void {
    // 返回结构化数据，由调用方决定如何输出
}

// ❌ 错误
console.log('Processing...')
console.error('Error occurred')
```

### eqeqeq — 严格相等

- **要求**: 使用 `===` / `!==`

```typescript
// ✅ 正确
if (x === null) {
}
if (y !== undefined) {
}

// ❌ 错误
if (x == null) {
}
if (y != undefined) {
}
```

### no-control-regex — 关闭

- **项目配置**: `0`
- **说明**: 正则中的控制字符不报警

---

## 导入相关规则

### 按需解构导入

- **要求**: 不使用 `import *` 命名空间导入
- **原因**: Tree-shaking 优化、明确依赖关系

```typescript
// ✅ 正确
import { join, resolve } from 'node:path'
import { readFileSync } from 'node:fs'

// ❌ 错误
import * as path from 'node:path'
import * as fs from 'node:fs'
```

### 类型导入分离

- **要求**: 使用 `import type` 或内联 `type` 修饰符

```typescript
// ✅ 正确
import type { ExecResult } from '@/helpers/exec'
import { exec } from '@/helpers/exec'

// ✅ 正确（内联 type）
import { exec, type ExecResult } from '@/helpers/exec'
```

### 导入排序

- **顺序**: node: 内置 → 第三方库 → @/ 别名 → ./ 相对 → type 类型
- **每组内**: 按字母排序

---

## 错误处理规则

### try/catch 非空

- **要求**: catch 块不能为空，至少记录或恢复

```typescript
// ✅ 正确
try {
    await riskyOperation()
} catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`操作失败: ${message}`)
}

// ❌ 错误
try {
    await riskyOperation()
} catch (err) {
    // 空 catch
}
```

### 错误类型守卫

- **要求**: catch 中 err 必须类型守卫

```typescript
// ✅ 正确
catch (err) {
    const message = err instanceof Error ? err.message : String(err)
}

// ❌ 错误
catch (err) {
    console.log(err.message) // err 可能不是 Error
}
```
