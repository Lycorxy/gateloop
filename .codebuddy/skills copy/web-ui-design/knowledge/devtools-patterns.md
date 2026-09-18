# 开发者工具专用模式（DevTools Patterns）

> 针对：浏览器扩展浮动面板、网络调试器、JSON 查看器、录制/回放工具
> 参考：Chrome DevTools Network Panel、React DevTools、Redux DevTools、Vue DevTools

---

## 一、浮动面板布局规范

### 尺寸约束

| 属性 | 推荐值 | 原因 |
|------|--------|------|
| 默认宽度 | 420px | 不遮挡页面主内容，足够展示单列信息 |
| 最小宽度 | 360px | 保证 URL 和操作按钮不换行 |
| 最大宽度 | 600px | 超过则应考虑全屏 DevTools |
| 默认高度 | 560px | 约占 1080p 屏幕的 50% |
| 最小高度 | 320px | 保证列表 + 详情可见 |
| 圆角 | 8px | 现代感但不夸张 |
| 阴影 | `0 16px 48px rgba(0,0,0,.5)` | 深阴影营造悬浮感 |

### 面板结构（垂直三段式）

```
┌─────────────────────────────┐
│ Header (44px)               │  拖拽区 + 标题 + 操作
├─────────────────────────────┤
│                             │
│ Body (flex: 1, overflow)    │  主内容区
│                             │
├─────────────────────────────┤
│ Detail (max-height: 50%)    │  详情/操作区（可选）
└─────────────────────────────┘
```

### Header 规范

```css
.devtools-header {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 44px;
  padding: 0 16px;
  background: var(--neutral-01);
  border-bottom: 1px solid var(--neutral-03);
  cursor: move;        /* 整个 header 可拖拽 */
  user-select: none;
}
```

- 品牌名：13px / 700 / 主色
- Tab 切换：使用 Segmented Control（非传统下划线 Tab）
- 操作图标：固定在右侧，28×28px 纯图标按钮

### Segmented Control（胶囊式导航）

```css
.seg-control {
  display: inline-flex;
  background: var(--neutral-02);
  border-radius: 6px;
  padding: 2px;
}
.seg-btn {
  padding: 4px 14px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--neutral-06);
  transition: all 150ms var(--ease-standard);
}
.seg-btn.active {
  background: var(--neutral-03);
  color: var(--neutral-08);
  font-weight: 600;
}
```

**为什么用 Segmented 而非下划线 Tab？**
- 3 个以内的 Tab 适合 Segmented，视觉更紧凑
- 现代工具（Linear、Arc、Figma）都在用
- 下划线 Tab 适合 5+ 个导航项

---

## 二、网络请求列表行设计

### 行结构（参考 Chrome DevTools）

```
┌──────────────────────────────────────────┐
│ [GET] 200 45ms  /api/order/detail    [📋][⚡]│  ← 第一行：状态 + 元信息 + 操作
│ /api/order/detail?id=123                 │  ← 第二行：URL（等宽字体）
└──────────────────────────────────────────┘
```

### 行的视觉规则

| 元素 | 样式 | 说明 |
|------|------|------|
| 方法标签 | 9px/700，彩色背景12%透明度 | GET=蓝 POST=绿 DELETE=红 PUT=黄 |
| 状态码 | 10px/600，等宽字体 | 2xx=灰 4xx/5xx=红 |
| 耗时 | 10px，等宽字体，neutral-06 | 右对齐 |
| URL | 10px，等宽字体，neutral-07 | 截断省略 |
| Mock 标识 | 9px Badge，warning 色 | 仅 mocked 请求显示 |
| 行内操作 | hover 才显示 | 默认隐藏减少噪音 |

### 行的状态色

```css
/* 左边框标识行状态 */
.net-item.mocked { border-left: 2px solid var(--warning); }
.net-item.error  { border-left: 2px solid var(--error); }
.net-item.selected {
  background: var(--primary-bg);  /* 主色背景 8% 透明度 */
  border-left: 2px solid var(--primary);
}
```

### Stagger 入场动画

```css
.net-item {
  animation: stagger-in 250ms var(--ease-decelerate) both;
}
@keyframes stagger-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* JS 控制：每项延迟 18ms，最多延迟 180ms */
/* style={{ animationDelay: `${Math.min(i * 18, 180)}ms` }} */
```

---

## 三、过滤工具栏设计

### 一体化搜索栏

```
┌─────────────────────────────────────┐
│ [🔍 Filter requests...        ] [⚙] │  ← 搜索框 + 配置入口
└─────────────────────────────────────┘
```

```css
.filter-input {
  flex: 1;
  padding: 6px 12px 6px 32px;  /* 左边留出搜索图标空间 */
  background: var(--neutral-01);
  border: 1px solid var(--neutral-03);
  border-radius: 6px;
}
.filter-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(23,125,220,0.15);
}
```

### 多维度过滤芯片

```
[Method ▼] [Status ▼] [Host ▼]  12/48 results    [Export]
```

- 每个 Select 宽度 80-100px
- 字号 11px
- 选中后显示具体值（如 `GET ▼` 而非 `Method ▼`）
- 结果计数右对齐，neutral-05 色

---

## 四、JSON 查看器配色

### 语法高亮色板（暗色优先）

| 类型 | 颜色 | 说明 |
|------|------|------|
| Key | `#177ddc`（主色） | 蓝色，稍亮 |
| String | `#95de64` | 柔和绿，不刺眼 |
| Number | `#ffc53d` | 琥珀金 |
| Boolean | `#ff7875` | 珊瑚红 |
| Null | `#8c8c8c` | 中性灰 |
| 括号/标点 | `var(--neutral-06)` | 不抢眼 |

### 嵌套层级视觉

```css
.jv-children {
  margin-left: 8px;
  border-left: 1px solid var(--neutral-03);  /* 左侧细线标识层级 */
  padding-left: 12px;
}
```

### 自动解码标识

当字符串值被自动解码（JSON.parse / URL decode / Base64）时，显示徽标：

```
"data": "{\"orderId\":\"123\"}" [JSON]
         ↓ 自动展开
         "orderId": "123"
```

- 徽标：8px / 700 / 圆角3px
- JSON 解码 = 蓝色 `var(--primary)`
- URL 解码 = 琥珀 `var(--warning)`
- Base64 解码 = 紫色 `#b37feb`

---

## 五、详情面板的 Tab 切换

### 三栏详情（Response / Request / Headers）

```
┌──────────────────────────────────────────┐
│ [Response] [Request] [Headers]    [Copy] │  ← Tab + 操作
├──────────────────────────────────────────┤
│ {                                        │  ← 内容区
│   "code": 0,                             │
│   "data": { ... }                        │
│ }                                        │
└──────────────────────────────────────────┘
```

- Tab 用下划线式（非 Segmented），因为这里是内容切换不是导航
- 活跃 Tab：底部 2px 主色线 + 主色文字
- 内容区背景比列表区更深（neutral-00），形成层次

---

## 六、空状态设计

### 空状态三要素

1. **图标** — 20px，neutral-05 色，居中
2. **标题** — 12px / 600 / neutral-07
3. **描述** — 11px / 400 / neutral-06，1-2 行

```tsx
<div className="empty-state">
  <Inbox size={32} color="var(--neutral-05)" />
  <div className="empty-title">No requests captured</div>
  <div className="empty-desc">Network requests will appear here once detected</div>
</div>
```

### 各场景的空状态文案

| 场景 | 图标 | 标题 | 描述 |
|------|------|------|------|
| 无接口记录 | `Inbox` | No requests captured | Network requests will appear here |
| 无错误 | `ShieldCheck` | No errors detected | JS errors are auto-captured with context |
| 无 Mock 规则 | `Filter` | No mock rules | Create a rule to intercept responses |
| 无配置 | `Settings` | No configurations | Add domain-level decrypt rules |

---

## 七、操作按钮的图标配对

### 高频操作必须有图标

| 操作 | 图标 | 按钮样式 | 位置 |
|------|------|---------|------|
| 开始录制 | `CircleDot` | primary | 录制面板 |
| 停止录制 | `Square` | default | 录制面板 |
| 导出 | `Download` | primary/default | 多处 |
| 复制 | `Copy` | ghost（纯图标） | 行内 hover |
| 模拟请求 | `Play` | primary | 详情面板 |
| 模拟返回 | `FileEdit` | primary | 详情面板 |
| 配置 | `Settings` | ghost（纯图标） | 工具栏 |
| 删除 | `Trash2` | danger ghost | 规则项 |

### 按钮内图标 + 文字的排列

```tsx
// 正确：图标在左，文字在右
<button className="btn primary">
  <Play size={14} />
  <span>Replay</span>
</button>

// CSS
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
```

---

## 八、状态指示灯

### 录制状态点

```css
.rec-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--neutral-05);  /* 空闲：灰 */
}
.rec-dot.active {
  background: var(--error);       /* 录制中：红 */
  animation: pulse 1.4s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.4; transform: scale(1.15); }
}
```

**为什么不用 box-shadow 发光？**
- Ant Design / Arco 都不用发光，发光是游戏 UI 的特征
- 呼吸动画（opacity + scale）足够醒目，更专业

---

## 九、Shadow DOM 隔离注意事项

### 必须遵守的规则

1. **所有样式必须内联注入 Shadow DOM** — 不能用外部 CSS 文件
2. **不能用图标字体** — 字体在 Shadow DOM 中加载不可靠
3. **all: initial 重置** — 根元素必须重置，避免继承宿主页面样式
4. **CSS 变量定义在根元素** — 不依赖 :root（Shadow DOM 中 :root 不生效）

```css
.lynx-root {
  all: initial;
  /* 所有 CSS 变量定义在这里，而非 :root */
  --primary: #1677ff;
  /* ... */
}
.lynx-root, .lynx-root * {
  box-sizing: border-box;
  font-family: var(--font-sans);
}
```
