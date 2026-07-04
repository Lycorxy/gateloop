# Node 内置模块速查表

从 `node:` 前缀按需解构导入。

| 模块            | node: 前缀             | 常用导入                                             | 场景         |
| --------------- | ---------------------- | ---------------------------------------------------- | ------------ |
| path            | `node:path`            | `join, resolve, dirname, basename, extname`          | 路径处理     |
| fs              | `node:fs`              | `readFileSync, writeFileSync, existsSync, mkdirSync` | 同步文件操作 |
| fs/promises     | `node:fs/promises`     | `readFile, writeFile, mkdir, readdir, rm`            | 异步文件操作 |
| os              | `node:os`              | `platform, homedir, tmpdir, arch`                    | 系统信息     |
| child_process   | `node:child_process`   | `execSync, spawn, exec`                              | 命令执行     |
| crypto          | `node:crypto`          | `createHash, randomBytes, randomUUID`                | 加密/随机    |
| stream          | `node:stream`          | `Transform, Readable, Writable`                      | 流处理       |
| stream/promises | `node:stream/promises` | `pipeline`                                           | 异步流       |
| module          | `node:module`          | `createRequire`                                      | CJS 互操作   |
| url             | `node:url`             | `fileURLToPath, pathToFileURL`                       | URL 处理     |
| util            | `node:util`            | `promisify, callbackify`                             | Promise 转换 |
| buffer          | `node:buffer`          | `Buffer`                                             | 二进制数据   |
| http            | `node:http`            | `createServer, request`                              | HTTP 服务    |
| https           | `node:https`           | `createServer, request`                              | HTTPS 服务   |
| net             | `node:net`             | `createServer, createConnection`                     | TCP          |
| readline        | `node:readline`        | `createInterface`                                    | 交互输入     |
| assert          | `node:assert`          | `strict, equal, deepEqual`                           | 断言         |
| zlib            | `node:zlib`            | `createGzip, createUnzip`                            | 压缩         |
| events          | `node:events`          | `EventEmitter`                                       | 事件处理     |

## 使用规则

```typescript
// ✅ 正确：node: 前缀 + 按需解构
import { join, resolve, dirname } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { platform, homedir, tmpdir } from 'node:os'
import { execSync, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { Transform, Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'
import { EventEmitter } from 'node:events'

// ❌ 错误：省略 node: 前缀
import { join } from 'path'
import { readFileSync } from 'fs'

// ❌ 错误：整体导入
import * as path from 'node:path'
import * as fs from 'node:fs'
```
