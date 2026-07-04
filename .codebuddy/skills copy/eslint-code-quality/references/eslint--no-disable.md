# ESLint Disable 禁用规则 — 详细说明

## 规则核心

**禁止使用** `// eslint-disable-next-line` 和 `/* eslint-disable */` 注释。

### 理由

eslint-disable 注释是一种**代码异味**（code smell），它表明开发者选择了"抑制警告"而非"修复问题"。这会导致：

1. **问题隐藏**：lint 错误被掩盖，而非从根本上解决
2. **技术债累积**：抑制的规则越多，代码质量越差
3. **团队标准不一致**：不同开发者可能随意关闭不同规则
4. **代码审查盲区**：审查者可能忽略被禁用规则覆盖的代码

### 正确做法

| ❌ 错误做法                                                      | ✅ 正确做法                                 |
| ---------------------------------------------------------------- | ------------------------------------------- |
| `// eslint-disable-next-line no-any`                             | 修复类型，使用正确的类型定义                |
| `// eslint-disable-next-line no-unused-vars`                     | 删除未使用的变量或添加 `_` 前缀             |
| `/* eslint-disable no-console */`                                | 删除 console 语句或配置项目规则允许特定场景 |
| `// eslint-disable-next-line @typescript-eslint/no-explicit-any` | 使用泛型或正确的接口类型                    |

### 特殊情况处理

**唯一可接受的情况**：第三方库的类型定义错误，且无法修改。

```typescript
// ❌ 一般情况：禁止
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = response.data

// ✅ 正确做法：定义接口
interface ApiResponse {
    data: {
        id: number
        name: string
    }
}
const data = (response.data as ApiResponse).data
```

**第三方库类型修复**：

```typescript
// 如果确实是第三方库类型问题且无法修改：
// 1. 优先提交 PR 给第三方库修复类型
// 2. 使用 @ts-expect-error（而非 eslint-disable）
// 3. 在项目中添加模块扩展声明（declaration merging）
```

### 检测方式

使用 `nut-lint` 验证：

```bash
# 搜索项目中的 eslint-disable 注释
nut-lint run --rule "no-restricted-syntax: [error, {selector: 'Program > ExpressionStatement > CallExpression', message: '禁止 eslint-disable'}]"
```

手动搜索：

```bash
# 使用 grep 搜索
grep -rn "eslint-disable" src/ --include="*.ts" --include="*.tsx"
```

### 修复策略

```
发现 eslint-disable 注释
├─ 查看被禁用的规则
├─ 分析根本原因
│   ├─ 类型问题？ → 定义正确的接口/类型
│   ├─ 未使用变量？ → 删除或添加 _ 前缀
│   ├─ console 语句？ → 删除或替换为日志库
│   ├─ any 类型？ → 使用正确的类型定义
│   └─ 其他规则？ → 按规则要求修复
├─ 修复后验证
└─ 删除 eslint-disable 注释
```

### 反模式

| 反模式                          | 问题                 | 正确做法           |
| ------------------------------- | -------------------- | ------------------ |
| 成片使用 `/* eslint-disable */` | 关闭文件所有规则检查 | 逐条修复问题       |
| 仅添加注释不修复                | 问题仍在             | 必须从根本上修复   |
| 全局禁用规则                    | 失去保护             | 调整规则级别或配置 |
