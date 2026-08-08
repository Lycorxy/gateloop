# 状态三态约定（约定层 · 收敛型）

> 本文件是"约定"（命名/目录/三态统一），不是"设计样本"（怎么拆由模型自由发挥）。
> 模型读约定统一规范，设计自由创造。

## 交互元素 4 态（必须全覆盖）

| 状态 | 触发 | 样式倾向 |
|---|---|---|
| Default | 默认 | 主色 token + 默认圆角 |
| Hover | 鼠标悬停 | 主色 token +1 深度 / 轻微阴影 |
| Focus/Active | 键盘聚焦/点击 | 主色 token +1 深度 + `outline: 2px solid var(--color-focus-ring, transparent)` |
| Disabled | `disabled` 属性 | 灰阶 `var(--color-text-disabled)` + `cursor: not-allowed` |

**统一约定**：
- 4 态必须平铺写（铁律 1：禁止嵌套选择器）
- `:hover` + `:focus` 不要合并（视觉差异要可区分）
- 动效时长：Hover 120ms / Focus 150ms

```scss
.button { /* default */ }
.button:hover { /* hover */ }
.button:focus,
.button:active { /* focus/active */ }
.button:disabled { /* disabled */ }
```

## 数据区 3 态（必须全覆盖）

| 状态 | 组件 | 内容 |
|---|---|---|
| Loading | Skeleton（**非 spinner**） | 表格行/卡片骨架屏 |
| Empty | Empty + CTA | 插画 + 文案 + 行动按钮 |
| Error | ErrorBoundary + 重试 | 错误描述 + 重试按钮 |

**统一约定**：
- Loading 用 Skeleton（不能用 spinner，spinner 用于按钮内 submit）
- Empty 必须有 CTA（不只是文案"暂无数据"）
- Error 必须有重试按钮（不能只显示错误信息）

## 防呆规则（约定层）

| 场景 | 约定 |
|---|---|
| 数字输入 | `type="number"` + `min/max` + 输入限制 |
| 长文本 | `ellipsis` + tooltip 完整展示 |
| 必填字段 | `*` 红色 + 提交时校验 |
| 删除操作 | `Popconfirm` 二次确认 + 危险色 |
| 分页 | `pageSize` 切换 + `showTotal` 显示总数 |

## 反模式

- ❌ Loading 用 spinner（应该用 Skeleton）
- ❌ Empty 只显示"暂无数据"（应该有 CTA）
- ❌ Error 只显示错误信息（应该有重试按钮）
- ❌ Hover 和 Focus 样式完全一样（应该有视觉差异）
- ❌ Disabled 没有 `cursor: not-allowed`（用户无法感知）
