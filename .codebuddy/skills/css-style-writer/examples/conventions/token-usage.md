# CSS 变量使用约定（约定层 · 收敛型）

> 本文件是"约定"（变量命名/使用统一），不是"设计样本"（怎么组合变量由模型自由发挥）。
> 模型读约定统一变量体系，组合方式自由发挥。

## 强制规则

1. **必须使用 CSS 变量**（禁止硬编码 `#ffffff` / `12px` 等）
2. **必须带 fallback**（`var(--color-text, #333)`）
3. **必须使用项目自身变量名**（不强推默认 Token 名）
4. **变量必须从项目 SCSS 探测**（不假设默认值）

## 变量类别与命名约定

### 颜色（color）

```
--color-{语义}-{深度}
  --color-blue-06      主蓝
  --color-blue-07      hover 蓝
  --color-neutral-01   最浅灰（背景）
  --color-neutral-04   边框灰
  --color-text         主文本
  --color-text-disabled 禁用文本
  --color-text-secondary 次要文本
```

**语义优先**（推荐）：
```
--color-primary
--color-success
--color-warning
--color-error
```

### 间距（space）

```
--space-{xs|sm|md|lg|xl}
  --space-xs: 4px
  --space-sm: 8px
  --space-md: 16px
  --space-lg: 24px
  --space-xl: 32px
```

**禁止硬编码 `margin: 12px`**，应该用 `margin: var(--space-sm, 8px)` 或定义中间变量。

### 圆角（radius）

```
--radius-{sm|md|lg}
  --radius-sm: 2px    按钮/输入框
  --radius-md: 4px     小卡片
  --radius-lg: 8px     大卡片/Modal
```

### 阴影（shadow）

```
--shadow-{sm|md|lg}
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04)
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.08)
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12)
```

### 字体（font）

```
--font-family-base       正文
--font-family-heading    标题
--font-size-{xs|sm|md|lg|xl}
--font-weight-{normal|medium|bold}
```

### 动效（transition）

```
--transition-fast: 120ms   hover
--transition-base: 150ms   focus
--transition-slow: 200ms   展开
```

## 使用示例

```scss
.card {
  background: var(--color-neutral-01, #fff);
  border: 1px solid var(--color-neutral-04, #ebebeb);
  border-radius: var(--radius-lg, 8px);
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
  padding: var(--space-md, 16px);
}

.card:hover {
  box-shadow: var(--shadow-md, 0 2px 8px rgba(0, 0, 0, 0.08));
  transition: box-shadow var(--transition-fast, 120ms);
}
```

## 探测步骤（Step 2 必做）

```bash
# 项目变量探测
search_content('--color-', '*.{css,scss}')
search_content('--space-', '*.{css,scss}')
search_content('--radius-', '*.{css,scss}')
search_content('--shadow-', '*.{css,scss}')
search_content('--font-', '*.{css,scss}')
```

- 项目有自身变量 → **必须使用项目变量名**（不强推默认 Token）
- 项目无变量 → 使用 `references/style-rules.md` 中的默认 Token 表
- 不确定 → 询问用户

## 反模式

- ❌ `color: #333`（应该用 `var(--color-text, #333)`）
- ❌ `margin: 12px`（应该用 `var(--space-sm, 8px)` 或定义中间变量）
- ❌ `border-radius: 4px`（应该用 `var(--radius-md, 4px)`）
- ❌ 不带 fallback（应该 `var(--color-text, #333)`，防止变量缺失时崩）
- ❌ 假设默认 Token 名（应该探测项目自身变量名）

## 检测（脚本化）

未来 `style-crosscheck.ts` 可扩展自动扫描：
- 硬编码颜色 `#[0-9a-f]{3,6}`
- 硬编码间距 `\d+px`（不在变量 fallback 内）
- 不带 fallback 的 `var(--xxx)`

当前由 stylelint 自定义规则覆盖部分检测。
