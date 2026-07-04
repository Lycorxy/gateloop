---
description: 7条铁律 — 执行 frontend-codegen Skill 时必须注入到系统的硬约束规则。不可违反，无豁免。
globs: ["**/*.tsx", "**/*.ts", "**/*.css"]
alwaysApply: true
---

# 铁律（生成代码时不可违反的硬约束）

---

## 铁律 1 — 文件规模

```
单文件最多 360 行（TSX/TS/CSS 均适用）
单函数 ≤ 25 行，缩进 ≤ 2 层
超出必须立即拆分，无任何豁免
```

---

## 铁律 2 — 组件命名与结构

```
目录形式：feature-name/index.tsx（组件入口）
命名格式：a-b/index.tsx（kebab-case 目录 + index 入口）
辅助逻辑：同目录下 util.ts / hook.ts / types.ts / constant.ts
样式文件：同目录下 index.module.css 或 index.module.scss

示例结构：
user-card/
├── index.tsx          ← 组件主文件，只写渲染逻辑
├── hook.ts            ← 自定义 Hook（数据获取/状态逻辑）
├── util.ts            ← 纯函数工具（格式化/转换/校验）
├── types.ts           ← 本组件私有类型（公共类型从 @/types 导入）
├── constant.ts        ← 常量/配置/枚举
└── index.module.css   ← 样式
```

---

## 铁律 3 — 接口简洁

```
主文件（index.tsx）只写「输入 → 渲染 → 输出」
数据转换函数 → util.ts
请求/副作用逻辑 → hook.ts
类型定义 → types.ts
❌ 禁止在主文件中混入转换逻辑、复杂计算、数据加工
```

---

## 铁律 4 — 状态管理极简原则

```
优先级（从高到低）：
  1. useState（单组件临时状态）
  2. props 传递（父→子数据流）
  3. React Context（同功能模块局部共享）
  4. URL SearchParams（可分享/可刷新的状态）
  5. 第三方状态库（仅当 1-4 都不满足时）

❌ 禁止：Redux / MobX / Zustand 的过度使用
❌ 禁止：深度耦合全局状态（一个组件依赖 3+ 个 store slice）
✅ 推荐：Context + useReducer 组合解决模块级状态
✅ 推荐：能用 props drilling 2层内就不引入 Context
```

---

## 铁律 5 — 性能与稳定性兜底

```
JSON 解析：必须 try/catch，返回默认值
可选链：对象访问必须 ?. 防 undefined
数组操作：先校验 Array.isArray() 再操作
异步操作：必须有 loading/error/success 三态
网络请求：必须有超时/重试/取消机制
组件卸载：useEffect 必须返回 cleanup
公共兜底函数统一放 @/utils/safe.ts
```

---

## 铁律 6 — CSS 兼容性优先

```
✅ 使用：Flexbox（兼容 IE11+）、Grid（兼容现代浏览器时可用）
✅ 使用：CSS Variables（带 fallback 值）
✅ 使用：CSS Modules（编译时作用域隔离）
❌ 禁止：container queries（兼容性不足）
❌ 禁止：:has() 选择器（Safari 16.4+ 才支持）
❌ 禁止：@layer（部分浏览器不支持）
❌ 禁止：subgrid（兼容性极差）
❌ 禁止：过度使用 calc() 嵌套（可读性差）
⚠️ 原则：宁可多写 2 行兼容代码，也不用一个不确定的新特性
```

---

## 铁律 7 — 圈复杂度控制

```
单个函数圈复杂度（Cyclomatic Complexity）≤ 10
  圈复杂度 = 决策点数 + 1
  决策点：if / else if / case / ? : / && / || / for / while / catch
  超过 10 必须拆分，无豁免

强制拆分策略：
  1. Guard Clause — 提前返回，消灭 else 分支
  2. 策略映射 — Record/Map 替代 switch/case（>4 分支时）
  3. 提取子函数 — 每个子函数复杂度 ≤ 5
  4. 职责拆分 — 正常流程与异常处理分离

硬性上限：
  ❌ if/else 嵌套 > 5 层
  ❌ switch/case > 8 个分支
  ❌ && || 链式条件 > 4 个
  ❌ 单函数同时处理正常 + 多种异常流程
```

示例：

```typescript
// ❌ 圈复杂度 12（超标）
function getDiscount(user: User, order: Order): number {
  if (user.isVip) {
    if (order.total > 1000) {
      if (order.items.length > 5) return 0.15;
      else return 0.1;
    } else if (order.total > 500) {
      return 0.08;
    } else {
      return 0.05;
    }
  } else {
    if (user.isNew) {
      if (order.total > 200) return 0.03;
      else return 0.01;
    } else {
      if (user.years > 3) return 0.02;
      else if (user.years > 1) return 0.01;
      else return 0;
    }
  }
}

// ✅ 圈复杂度 4（策略映射 + 提前返回）
const VIP_DISCOUNT_RULES: Array<{ minTotal: number; minItems: number; rate: number }> = [
  { minTotal: 1000, minItems: 5, rate: 0.15 },
  { minTotal: 1000, minItems: 0, rate: 0.1 },
  { minTotal: 500, minItems: 0, rate: 0.08 },
  { minTotal: 0, minItems: 0, rate: 0.05 },
];

function getVipDiscount(order: Order): number {
  const rule = VIP_DISCOUNT_RULES.find(
    r => order.total >= r.minTotal && order.items.length >= r.minItems
  );
  return rule?.rate ?? 0;
}

function getRegularDiscount(user: User, order: Order): number {
  if (user.isNew) return order.total > 200 ? 0.03 : 0.01;
  if (user.years > 3) return 0.02;
  if (user.years > 1) return 0.01;
  return 0;
}

function getDiscount(user: User, order: Order): number {
  if (user.isVip) return getVipDiscount(order);
  return getRegularDiscount(user, order);
}
```
