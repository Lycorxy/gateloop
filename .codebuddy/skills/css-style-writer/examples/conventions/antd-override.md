# antd 覆盖约定（约定层 · 收敛型）

> 本文件是"约定"（antd 覆盖统一规范），不是"设计样本"（怎么用 antd 由模型自由发挥）。
> 模型读约定统一覆盖方式，使用方式自由发挥。

## 强制规则

1. **只在 `.module.scss` 的 `:global { }` 中覆盖**（禁止全局 SCSS 覆盖）
2. **覆盖时必须覆盖全状态**（default + hover + focus + disabled）
3. **覆盖属性来源必须是 CSS 变量**（禁止硬编码具体值）
4. **已有覆盖样式合并到已有文件**（不重复覆盖）

## 标准格式

```scss
:global {
  // 输入框
  .ant-input {
    border: 1px solid var(--color-neutral-04);
    border-radius: var(--radius-sm, 2px);
    height: 40px;
  }
  .ant-input:hover {
    border-color: var(--color-blue-06);
  }
  .ant-input:focus,
  .ant-input-focused {
    border-color: var(--color-blue-07);
    box-shadow: 0 0 0 2px rgba(30, 103, 250, 0.1);
  }
  .ant-input:disabled {
    background: var(--color-neutral-02);
    color: var(--color-text-disabled);
    cursor: not-allowed;
  }

  // 选择器
  .ant-select-selector {
    height: 40px;
    border: 1px solid var(--color-neutral-04);
    border-radius: var(--radius-sm, 2px);
  }
  .ant-select-selector:hover { border-color: var(--color-blue-06); }
  .ant-select-focused .ant-select-selector {
    border-color: var(--color-blue-07);
    box-shadow: 0 0 0 2px rgba(30, 103, 250, 0.1);
  }

  // 按钮（主按钮）
  .ant-btn-primary {
    background: var(--color-blue-06);
    border-color: var(--color-blue-06);
  }
  .ant-btn-primary:hover {
    background: var(--color-blue-07);
    border-color: var(--color-blue-07);
  }
  .ant-btn-primary:disabled {
    background: var(--color-neutral-03);
    border-color: var(--color-neutral-03);
    color: var(--color-text-disabled);
  }
}
```

## 尺寸约定

| 组件 | 高度 | 圆角 |
|---|---|---|
| Input / Select | 40px | `var(--radius-sm, 2px)` |
| Button | 32px / 40px（紧凑/默认） | `var(--radius-sm, 2px)` |
| Modal | 自适应 | `var(--radius-lg, 8px)` |
| Card | 自适应 | `var(--radius-lg, 8px)` |

## 反模式

- ❌ 在全局 SCSS 覆盖 antd（应该只在 `.module.scss` 的 `:global` 中）
- ❌ 覆盖时硬编码 `#1e67fa`（应该用 `var(--color-blue-06)`）
- ❌ 只覆盖 default，漏 hover/focus/disabled
- ❌ 在多个 `.module.scss` 重复覆盖同一组件（应该合并到已有覆盖文件）
- ❌ 覆盖整个 `.ant-btn` 通用样式（应该覆盖特定变体 `.ant-btn-primary`）

## 检测（脚本化）

`style-crosscheck.ts` 会自动检测：
- antd 覆盖的 `.ant-xxx` 与 TSX 中实际使用的 antd 组件是否匹配
- 不匹配 → exit 1（收敛型 FAIL）
