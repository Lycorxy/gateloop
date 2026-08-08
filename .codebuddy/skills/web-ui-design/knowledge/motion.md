# 动效系统

---

## 一、时间曲线

```css
/* 标准：布局过渡（侧边栏展开/收起、面板滑入） */
--ease-standard: cubic-bezier(0.4, 0, 0.2, 1);

/* 减速：弹出层进入（Vercel 风格：安静到达） */
--ease-decelerate: cubic-bezier(0, 0, 0.2, 1);

/* 加速：弹出层退出 */
--ease-accelerate: cubic-bezier(0.4, 0, 1, 1);

/* 弹簧：微交互（Linear 风格：精确响应） */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

/* 指数衰减：Linear 签名曲线（快速启动 + 急停） */
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
```

---

## 二、时长规范

| 类型 | 时长 | 使用场景 | 曲线 |
|------|------|---------|------|
| **Micro** | 120ms | hover 颜色、opacity | ease-standard |
| **Fast** | 150ms | focus 状态、tooltip | ease-decelerate |
| **Base** | 200ms | 展开/收起、slide | ease-out-expo |
| **Slow** | 250ms | 页面转场、大面积 | ease-standard |
| **Gentle** | 350ms | 空状态入场、首屏 | ease-decelerate |

---

## 三、动效决策表

| 场景 | 使用动效？ | 类型 | 参数 |
|------|-----------|------|------|
| Hover 颜色变化 | ✅ | transition | 120ms color |
| 按钮 press | ✅ | transform | scale(0.98), 0ms |
| Tab 切换指示器 | ✅ | transition | 200ms left+width |
| Dropdown 展开 | ✅ | transform+opacity | 150ms scaleY+fade |
| Modal 出现 | ✅ | transform+opacity | 200ms scale(0.95→1) |
| 列表项入场 | ✅ | stagger animation | 200ms + 20ms delay |
| 页面路由切换 | ⚠️ 可选 | fade | 150ms |
| 成功庆祝 | ❌ 禁止 | — | — |
| 纯装饰动画 | ❌ 禁止 | — | — |
| 大型 spinner | ❌ 禁止 | — | 用 skeleton |

---

## 四、核心动效实现

### Stagger 列表入场（Linear 签名）

```css
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

.list-item {
  animation: fadeSlideIn 200ms var(--ease-decelerate) both;
}
.list-item:nth-child(1) { animation-delay: 0ms; }
.list-item:nth-child(2) { animation-delay: 20ms; }
.list-item:nth-child(3) { animation-delay: 40ms; }
/* 最大 stagger 到第 10 项，之后不再增加延迟 */
```

### Modal/Drawer 进出

```css
/* 进入 */
.modal-overlay { animation: fadeIn 150ms var(--ease-decelerate); }
.modal-content { animation: scaleIn 200ms var(--ease-out-expo); }

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

/* 退出 - 比进入快 */
.modal-overlay.exit { animation: fadeOut 100ms var(--ease-accelerate); }
.modal-content.exit { animation: scaleOut 150ms var(--ease-accelerate); }
```

### Skeleton 骨架屏

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--neutral-02) 25%,
    var(--neutral-03) 50%,
    var(--neutral-02) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-sm);
}

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

---

## 五、Reduced Motion 适配（强制）

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 六、动效禁忌

```
❌ bounce/wobble/shake 等花哨效果
❌ > 350ms 的过渡动画（用户感觉卡顿）
❌ 同时触发多个区域的动画（注意力分散）
❌ Loading 时用大型 spinner（用 Skeleton 替代）
❌ 无目的的循环动画（浪费 GPU/分散注意力）
❌ linear 缓动函数（机械感，无自然感）
❌ 入场 + 出场用相同时长（出场应更快）
```
