# Rollup 打包配置适配指南

根据项目的 rollup.config.ts，确保生成的代码能正确打包。

## 项目打包配置概览

```yaml
入口:
  lint: ./src/cli/lint.ts
  git: ./src/cli/git.ts
  aivn: ./src/cli/aivn.ts

输出格式:
  - CJS: dist/[name]/index.cjs
  - ESM: dist/[name]/index.mjs
  - DTS: dist/[name]/index.d.ts

外部依赖: [esbuild, prettier, eslint]

插件:
  - alias: @ → src/
  - commonjs: 转换 CJS → ESM
  - typescript: 编译 TS
  - node-resolve: 解析 node_modules
  - json: 导入 JSON 文件
```

## 代码适配规则

### 规则 1：命名导出 > 默认导出

```typescript
// ✅ 正确：命名导出（CJS/ESM 互操作性好）
export function myFn(): void {}
export const myConst = 'value'
export type MyType = string

// ❌ 错误：默认导出（CJS require().default）
export default function myFn(): void {}
```

**原因**：Rollup 输出 CJS 时，命名导出直接挂在 `exports` 上，默认导出变成 `exports.default`。

### 规则 2：外部依赖直接 import

```typescript
// ✅ 正确：外部依赖直接 import（Rollup 保留 import 语句）
import prettier from 'prettier'
import eslint from 'eslint'

// ❌ 错误：不要尝试打包这些依赖
// Rollup external 列表中的包不会被包含在 bundle 中
```

### 规则 3：路径别名在打包时解析

```typescript
// ✅ 正确：使用 @ 别名（Rollup alias 插件会解析）
import { exec, readText } from '@/helpers'

// 打包后变为相对路径引用或内联
```

### 规则 4：Node 内置模块自动外部化

```typescript
// ✅ 正确：node: 前缀导入
import { join } from 'node:path'

// Rollup nodeResolve preferBuiltins: true → 不打包 Node 内置模块
// CJS 输出: const path = require('path')
// ESM 输出: import { join } from 'node:path'
```

### 规则 5：CJS 包会自动转换

```typescript
// ✅ 正确：CJS 包直接 import（commonjs 插件会转换）
import spawn from 'cross-spawn'
import { Command } from 'commander'
import chokidar from 'chokidar'
```

## 新增入口时

如果需要新增一个 CLI 入口（如 `nut-xxx`），需同时修改：

1. **`rollup.config.ts`** — 添加入口和 shebang 配置
2. **`package.json`** — 添加 bin 和 exports 条目
3. **`src/cli/`** — 新建入口文件

```typescript
// rollup.config.ts
const entries = {
    lint: './src/cli/lint.ts',
    git: './src/cli/git.ts',
    aivn: './src/cli/aivn.ts',
    xxx: './src/cli/xxx.ts'  // 新增
}

const cliFiles = ['lint', 'git', 'aivn', 'xxx']  // 新增

// package.json
{
    "bin": {
        "nut-lint": "./dist/lint/index.cjs",
        "nut-git": "./dist/git/index.cjs",
        "nut-aivn": "./dist/aivn/index.cjs",
        "nut-xxx": "./dist/xxx/index.cjs"  // 新增
    },
    "exports": {
        "./xxx": {  // 新增
            "import": "./dist/xxx/index.mjs",
            "require": "./dist/xxx/index.cjs",
            "types": "./dist/xxx/index.d.ts"
        }
    }
}
```

## 类型声明注意事项

```typescript
// rollup.config.ts 的 dts 配置中：
// external 函数排除了所有 node: 内置模块
// 因此类型声明中不会包含 Node 内置模块的类型

// ✅ 正确：类型文件中不重复声明 Node 类型
// 它们通过 @types/node 提供

// ❌ 错误：在 .d.ts 中声明 Node 内置类型
```
