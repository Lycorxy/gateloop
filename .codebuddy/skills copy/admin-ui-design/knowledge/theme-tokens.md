# 四模式主题 Token 对照表

---

## 一、完整 Token 对照表

| Token           | Light           | Dark            | Eye-care           | Gray   |
| --------------- | --------------- | --------------- | ------------------ | ------ |
| **页面底色**    | #F5F5F5         | #121214         | #E8EDD5            | filter |
| **卡片背景**    | #FFFFFF         | #1C1C1E         | #F2F5E8            | filter |
| **边框**        | #EBEBEB         | #2A2A2D         | #D0D9BC            | filter |
| **主文字**      | #131315         | #F0F0F0         | #3D4A32            | filter |
| **正文**        | #2B2B2B         | #D9D9D9         | #4A5740            | filter |
| **辅助文字**    | #525252         | #A8A8A8         | #6B7A5E            | filter |
| **Placeholder** | #B8B8B8         | #636363         | #9AA88C            | filter |
| **品牌主色**    | #1E67FA         | #5B9BFF         | #4A7C59            | filter |
| **品牌 hover**  | #4784FF         | #7DB3FF         | #5D9469            | filter |
| **选中底色**    | #E5EEFF         | #1E3A6E         | #D5E0BF            | filter |
| **hover 底色**  | #F5F8FF         | #222228         | #DEE5CC            | filter |
| **卡片阴影**    | rgba(0,0,0,.04) | rgba(0,0,0,.35) | rgba(61,74,50,.06) | filter |

---

## 二、CSS 变量实现

### Light 模式（默认）

```scss
:root,
[data-theme='light'] {
  --color-neutral-01: #ffffff;
  --color-neutral-02: #f5f5f5;
  --color-neutral-03: #ebebeb;
  --color-neutral-04: #e0e0e0;
  --color-neutral-05: #d4d4d4;
  --color-neutral-06: #b8b8b8;
  --color-neutral-07: #808080;
  --color-neutral-08: #525252;
  --color-neutral-09: #2b2b2b;
  --color-neutral-10: #131315;

  --color-blue-01: #f5f8ff;
  --color-blue-02: #e5eeff;
  --color-blue-05: #70a0ff;
  --color-blue-06: #4784ff;
  --color-blue-07: #1e67fa;
  --color-blue-10: #001761;

  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-header: 0 1px 4px rgba(0, 0, 0, 0.06);
}
```

### Dark 模式

```scss
[data-theme='dark'] {
  --color-neutral-01: #1c1c1e;
  --color-neutral-02: #121214;
  --color-neutral-03: #2a2a2d;
  --color-neutral-04: #363639;
  --color-neutral-05: #424245;
  --color-neutral-06: #636363;
  --color-neutral-07: #8c8c8c;
  --color-neutral-08: #a8a8a8;
  --color-neutral-09: #d9d9d9;
  --color-neutral-10: #f0f0f0;

  --color-blue-01: #1e3a6e;
  --color-blue-02: #264a8a;
  --color-blue-05: #4a80d4;
  --color-blue-06: #5b9bff;
  --color-blue-07: #7db3ff;
  --color-blue-10: #f0f6ff;

  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.35);
  --shadow-header: 0 1px 4px rgba(0, 0, 0, 0.4);
}
```

### Eye-care 模式（豆沙绿/羊皮纸色调）

```scss
[data-theme='eyecare'] {
  --color-neutral-01: #f2f5e8;
  --color-neutral-02: #e8edd5;
  --color-neutral-03: #d0d9bc;
  --color-neutral-04: #c4cfb0;
  --color-neutral-06: #9aa88c;
  --color-neutral-07: #7a8b69;
  --color-neutral-08: #6b7a5e;
  --color-neutral-09: #4a5740;
  --color-neutral-10: #3d4a32;

  --color-blue-01: #dde5cc;
  --color-blue-02: #d5e0bf;
  --color-blue-05: #7ba886;
  --color-blue-06: #5d9469;
  --color-blue-07: #4a7c59;
  --color-blue-10: #2d5036;

  --shadow-card: 0 1px 2px rgba(61, 74, 50, 0.06);
  --shadow-header: 0 1px 4px rgba(61, 74, 50, 0.08);
}
```

### Gray 模式（全局灰度滤镜）

```scss
[data-theme='gray'] {
  filter: grayscale(100%) opacity(0.92);
}
```

---

## 三、主题切换机制

```tsx
const THEME_MODES = {
  light: { label: '白色', icon: 'SunOutlined' },
  dark: { label: '夜色', icon: 'MoonOutlined' },
  eyecare: { label: '护眼', icon: 'EyeOutlined' },
  gray: { label: '灰色', icon: 'ThunderboltOutlined' },
} as const;

// 循环切换：light → dark → eyecare → gray → light
// 设置 document.documentElement.dataset.theme 驱动 CSS 变量切换
// gray 模式使用 CSS filter: grayscale(100%) opacity(0.92)
```

---

## 四、主题适配检查清单

```
□ 所有颜色使用 CSS 变量，无硬编码
□ Dark 模式下文字与背景对比度 ≥ 4.5:1
□ Eye-care 模式下品牌色替换为绿色系
□ Gray 模式下 filter 不影响交互（按钮仍可点击）
□ 图片/插画在 Dark 模式下不刺眼
□ 阴影在 Dark 模式下加深
□ 边框在 Dark 模式下可见
□ 状态色（红/绿/橙）在四种模式下均清晰可辨
```
