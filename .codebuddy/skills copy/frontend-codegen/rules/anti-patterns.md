---
description: 反模式清单 + 决策指南。执行 frontend-codegen Skill 时必须注入，用于 Phase 3 质量验证。
globs: ["**/*.tsx", "**/*.ts", "**/*.css"]
alwaysApply: true
---

# 反模式清单与决策指南

---

## 一、反模式清单（生成时禁止出现）

```
❌ 主文件超过 360 行
❌ 单函数圈复杂度超过 10
❌ if/else 嵌套超过 5 层
❌ switch/case 超过 8 个分支
❌ 组件内直接写 fetch/axios/数据转换
❌ 一个文件既有 Hook 又有组件又有工具函数
❌ 引入 Redux/Zustand/MobX 只为管理一个弹窗开关
❌ props drilling 超过 3 层却不抽 Context
❌ useEffect 无 cleanup（定时器/订阅/请求）
❌ JSON.parse 无 try/catch
❌ array.map 前不检查是否为数组
❌ 硬编码颜色/间距魔法值
❌ 使用 :has() / container queries / @layer 等过新 CSS
❌ 组件命名用 PascalCase 目录（应该 kebab-case 目录 + index.tsx）
❌ 过度设计（简单功能拆 10 个文件）
❌ 过度耦合（一个组件 import 10 个全局 store）
```

---

## 二、决策指南

### 2.1 何时拆分文件？

```
判断标准：
  1. 当前文件 > 200 行 → 必须考虑拆分
  2. 有 ≥2 个复杂函数(>15行) → 提取到 util.ts
  3. 有 useState + useEffect 组合逻辑 → 提取到 hook.ts
  4. 有复杂条件渲染(JSX>40行) → 抽子组件
  5. 有重复的数据转换 → 提取到公共 utils/

不要过度拆分（反设计）：
  - 只有 1 个简单 useState → 不需要 hook.ts
  - 只有 1 个 3 行的工具函数 → 直接写在组件内
  - 类型只有 1 个 interface → 直接写在组件文件顶部
```

### 2.2 何时引入 Context？

```
需要 Context：
  ✅ 同一功能模块内 3+ 个组件需要共享状态
  ✅ 避免 props drilling 超过 2 层
  ✅ 多个操作需要同步更新的联动状态

不需要 Context：
  ❌ 只有父子两层通信（直接 props）
  ❌ 只有一个组件用这个状态（useState）
  ❌ 数据来自服务端且只读（直接 useQuery/SWR）
```

### 2.3 CSS 技术选择

```
布局方案：
  - 一维排列（横/纵） → Flexbox
  - 二维网格（行列对齐） → Grid（目标浏览器支持时）
  - 简单居中 → Flexbox（justify-content + align-items）

间距方案：
  - 子元素等间距 → gap（Flexbox/Grid 都支持）
  - 不等间距 → 各自 margin/padding

响应式方案：
  - 断点媒体查询 @media（兼容性最好）
  - 不用 container queries（兼容性不够）

颜色/间距/圆角：
  - 统一走 CSS Variables（--color-* / --spacing-* / --radius-*）
  - 必须带 fallback 值：var(--color-primary, #1677ff)
```

### 2.4 接口文件正确示例

```typescript
// ✅ 正确：主文件只管「接收 → 渲染」
// user-list/index.tsx
export function UserList() {
  const { users, loading, error, handleDelete } = useUserList();

  if (loading) return <Skeleton />;
  if (error) return <ErrorFallback error={error} />;
  if (!users.length) return <Empty />;

  return <UserTable users={users} onDelete={handleDelete} />;
}

// ❌ 错误：主文件混入转换/加工逻辑
export function UserList() {
  const [data, setData] = useState([]);
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(d => {
      const formatted = d.map(item => ({
        ...item,
        fullName: `${item.firstName} ${item.lastName}`,
        createdAt: dayjs(item.created_at).format('YYYY-MM-DD'),
      }));
      setData(formatted);
    });
  }, []);
  // ...
}
```

---

## 三、质量验证 Checklist（Phase 3 使用）

```
━━━━━━━━ 生成后自检 ━━━━━━━━

【结构检查】
  □ 组件目录 kebab-case + index.tsx 入口
  □ 辅助逻辑已提取到 util.ts / hook.ts
  □ 主文件只有输入→渲染→输出，无数据加工
  □ 每个文件 ≤ 360 行
  □ 单函数 ≤ 25 行

【复杂度检查】
  □ 单函数圈复杂度 ≤ 10
  □ if/else 嵌套 ≤ 5 层
  □ switch/case ≤ 8 个分支（超过用策略映射）
  □ && || 链式条件 ≤ 4 个
  □ 无单函数同时处理正常流程 + 多种异常流程

【状态管理检查】
  □ 未引入不必要的三方状态库
  □ 局部状态用 useState
  □ 模块共享用 Context（如果需要）
  □ 无全局状态深度耦合

【性能与稳定性检查】
  □ JSON.parse 有 try/catch + 默认值
  □ 可选链 ?. 用于不确定的对象路径
  □ Array.isArray() 校验在 .map/.filter 前
  □ useEffect 有 cleanup 返回
  □ 异步操作有 loading/error/success 三态
  □ 大列表有虚拟滚动或分页

【CSS 检查】
  □ 未使用 :has() / container queries / @layer / subgrid
  □ CSS Variables 带 fallback 值
  □ Flexbox 为主要布局方案
  □ 无硬编码魔法值（颜色/间距走变量）
  □ 类名 kebab-case
  □ 无 !important（除非覆盖第三方样式且无其他方案）

【命名检查】
  □ 组件 PascalCase，Hook use* 前缀
  □ 事件：内部 handle*，Props on*
  □ 布尔值 is*/has*/can*/should* 前缀
  □ 异步函数 fetch*/load*/save*/create*/update*/delete* 前缀

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
