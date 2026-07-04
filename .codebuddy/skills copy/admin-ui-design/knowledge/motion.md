# 动效系统

> 来源：Linear Motion 逆向分析、Vercel Dashboard Motion 分析、DesignMD「Linear vs Vercel Motion」对比研究

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

| 类型 | Linear 风格 | Vercel 风格 | 本项目采用 |
|------|-----------|------------|-----------|
| **Micro**（hover 颜色） | 100-150ms | 100-150ms | **120ms** |
| **Fast**（focus 状态） | 150ms | 150ms | **150ms** |
| **Base**（展开/收起） | 200ms | 200ms | **200ms** |
| **Slow**（页面转场） | 300-350ms | 200-250ms | **250ms** |
| **Gentle**（空状态入场） | 400ms | — | **350ms** |

---

## 三、动效原则

```
✅ 所有过渡必须有 ease 曲线（禁 linear）
✅ 布局类动画用 transform（避免重排）
✅ 颜色过渡用 opacity/filter（性能最优）
✅ prefers-reduced-motion: reduce 时禁用所有动画
✅ 列表入场用 stagger（逐项延迟 ~20ms，营造"构建感"）

❌ bounce/wobble 等花哨效果
❌ > 350ms 的过渡动画
❌ 同时触发多个区域的动画
❌ Loading 时用大型 spinner（用 Skeleton 替代）
```

---

## 四、Linear vs Vercel 动效哲学对比

| 维度 | Linear | Vercel |
|------|--------|--------|
| **哲学** | 精确、物理感、有重量 | 安静、自信、不表演 |
| **进入** | ease-out-expo（快速启动 + 急停） | ease-decelerate（安静到达） |
| **退出** | ease-accelerate（快速离开） | ease-accelerate（同样快速） |
| **微交互** | ease-spring（轻微过冲） | ease-standard（无过冲） |
| **时长** | 200-350ms | 150-250ms |
| **签名** | Stagger 列表入场 | 无签名动效 |

**本项目选择**：采用 Linear 风格（更有活力，适合数据密集的管理系统）

---

## 五、Stagger 列表入场

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
/* ... */
```

---

## 六、常见动效实现

### 侧边栏展开/收起

```css
.sidebar {
  width: 240px;
  transition: width 200ms var(--ease-standard);
}
.sidebar.collapsed {
  width: 64px;
}
```

### Modal 进入/退出

```css
/* 进入 */
.modal-overlay {
  animation: fadeIn 150ms var(--ease-decelerate);
}
.modal-content {
  animation: scaleIn 200ms var(--ease-out-expo);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95); }
  to   { opacity: 1; transform: scale(1); }
}
```

### Drawer 滑入

```css
.drawer {
  transform: translateX(100%);
  transition: transform 200ms var(--ease-decelerate);
}
.drawer.open {
  transform: translateX(0);
}
```

### Toast 通知

```css
.toast {
  animation: slideInRight 200ms var(--ease-decelerate);
}
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(100%); }
  to   { opacity: 1; transform: translateX(0); }
}
```

---

## 七、Skeleton 骨架屏

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
  border-radius: var(--radius-xs);
}

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

---

## 八、Reduced Motion 适配

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```
