# createRequire 使用模式与示例

在 ESM 项目中加载 CommonJS 模块的标准方式。

## 基本模式

### 模式 1：静态导入（模块顶层推荐）

```typescript
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// 加载 CJS 模块
const someModule = require('some-cjs-package')
```

**适用场景**：

- 模块加载在初始化阶段，无条件执行
- 需要加载 `.cjs` 配置文件
- 第三方包只有 CJS 版本

### 模式 2：动态导入（按需加载推荐）

```typescript
async function loadConfig(configPath: string): Promise<Config> {
    const { createRequire } = await import('node:module')
    const require = createRequire(configPath)
    return require(configPath) as Config
}
```

**适用场景**：

- 仅在特定条件下需要 CJS 模块
- 配置文件路径运行时确定
- 避免不必要的模块加载

### 模式 3：带缓存的高级用法

```typescript
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// 模块缓存管理
const moduleCache = new Map<string, unknown>()

function loadCjsModule<T>(modulePath: string): T {
    if (moduleCache.has(modulePath)) {
        return moduleCache.get(modulePath) as T
    }
    const mod = require(modulePath) as T
    moduleCache.set(modulePath, mod)
    return mod
}
```

## 项目中的实际用例

### 加载 ESLint 配置（.eslintrc.cjs）

```typescript
// 来自 src/lint/extractor.ts
async function readESLintConfig(configPath: string): Promise<ESLintConfig> {
    const { createRequire } = await import('node:module')
    const req = createRequire(configPath)
    const eslintrc = req(configPath) as Record<string, unknown>
    // 处理 eslintrc...
}
```

**要点**：

- `createRequire(configPath)` 而非 `createRequire(import.meta.url)`
- 这样 require 的解析基准是配置文件所在目录
- 配置文件中的相对路径导入能正确解析

### 加载 ESLint 插件

```typescript
// 来自 src/lint/extractor.ts
const { createRequire } = await import('node:module')
const req = createRequire(join(eslintPath, 'package.json'))
// 基于 eslint 包的目录解析插件
```

**要点**：

- `createRequire(join(eslintPath, 'package.json'))`
- 以 ESLint 包的目录为基准
- 确保插件从正确的 node_modules 解析

## 常见陷阱

### ❌ 陷阱 1：直接使用 require

```typescript
// ❌ ESM 中不存在 require
const someModule = require('some-cjs-package')
```

### ❌ 陷阱 2：createRequire 参数错误

```typescript
// ❌ 传入空字符串或无效路径
const req = createRequire('')

// ✅ 正确：传入当前模块 URL 或文件路径
const req = createRequire(import.meta.url)
```

### ❌ 陷阱 3：忽略返回类型

```typescript
// ❌ any 类型
const config = require('./config.cjs')

// ✅ 正确：类型断言
const config = require('./config.cjs') as Config
```

## 决策树：何时用 createRequire vs import

```
需要加载 CJS 模块？
├─ 模块有 ESM 版本？
│   └─ 是 → 直接 import
│
├─ 是 .cjs 配置文件？
│   └─ 是 → createRequire（动态导入）
│
├─ 第三方包只有 CJS？
│   ├─ Rollup 配置了 commonjs 插件？
│   │   └─ 是 → 直接 import（插件会转换）
│   └─ 否 → createRequire
│
└─ 运行时才确定路径？
    └─ 是 → createRequire（动态导入）
```
