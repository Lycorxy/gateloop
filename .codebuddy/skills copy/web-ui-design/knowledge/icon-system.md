# 图标系统规范

---

## 一、图标库选择

### 推荐方案（按场景）

| 图标库 | 包大小 | 适用场景 | 推荐度 |
|--------|--------|---------|--------|
| **lucide-react** | 按需 tree-shake，单图标 ~1KB | 通用工具型产品、开发者工具 | ⭐⭐⭐⭐⭐ |
| @iconify/react | 按需加载，160+ 图标集 | 需要多种风格混合 | ⭐⭐⭐⭐ |
| @ant-design/icons | ~50KB | 已用 Ant Design | ⭐⭐⭐ |
| SVG 内联 | 0 依赖 | 极简项目、Shadow DOM 隔离环境 | ⭐⭐⭐⭐ |

### Shadow DOM 环境的特殊处理

浏览器扩展面板运行在 Shadow DOM 中，**图标字体（FontAwesome/Iconfont）会失效**，必须使用：

1. **SVG 内联组件**（首选）— 不受 Shadow DOM 隔离影响
2. **lucide-react** — 底层就是 SVG 组件，完美兼容 Shadow DOM
3. **禁止使用** — Iconfont 字体文件、FontAwesome CSS 字体方案

---

## 二、图标尺寸规范

### 三档尺寸系统

| 尺寸 | 像素 | 使用场景 | stroke-width |
|------|------|---------|-------------|
| **SM** | 14px | 行内徽标、紧凑列表操作、表格行内 | 1.5px |
| **MD** | 16px | 按钮图标、导航菜单、工具栏（默认） | 1.5px |
| **LG** | 20px | 空状态插画、卡片头部、Hero 区域 | 2px |

```tsx
// 正确：使用 lucide-react 指定 size
import { Search, Play, Download } from 'lucide-react';

<Search size={14} strokeWidth={1.5} />  // SM
<Play size={16} strokeWidth={1.5} />    // MD
<Download size={20} strokeWidth={2} />  // LG
```

### 图标与文字的关系

| 关系 | 间距 | 对齐 | 示例 |
|------|------|------|------|
| 图标左 + 文字右 | 6px | vertical-align: middle | ▶ 开始录制 |
| 纯图标按钮（有 tooltip） | 无文字 | 居中 | [📋] (tooltip: 复制) |
| 图标 + 文字按钮（等宽） | 6px | 图标居中文字基线 | [▶ 发起请求] |

```css
/* 图标与文字对齐的通用方案 */
.icon-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.icon-text svg {
  flex-shrink: 0;
}
```

---

## 三、开发者工具常用图标清单

### 网络调试面板必备图标

| 功能 | lucide 名称 | 用途 |
|------|------------|------|
| 搜索/过滤 | `Search` | 过滤输入框前缀 |
| 设置/配置 | `Settings` | 配置中心入口 |
| 播放/发起 | `Play` | 模拟请求、开始录制 |
| 停止 | `Square` | 停止录制 |
| 下载/导出 | `Download` | 导出 JSON |
| 复制 | `Copy` | 复制 URL/接口信息 |
| 闪电/操作 | `Zap` | 快捷操作菜单触发 |
| 刷新 | `RefreshCw` | 刷新接口列表 |
| 垃圾桶/删除 | `Trash2` | 删除规则 |
| 编辑/铅笔 | `Pencil` | 编辑规则 |
| 眼睛/查看 | `Eye` | 查看详情 |
| 代码/JSON | `Braces` / `Code` | JSON 数据标识 |
| 锁/加密 | `Lock` / `Unlock` | 加解密配置 |
| 警告/错误 | `AlertTriangle` | 错误提示 |
| 圆点/状态 | `Circle` (filled) | 录制状态指示灯 |

### 录制面板必备图标

| 功能 | lucide 名称 | 用途 |
|------|------------|------|
| 相机/快照 | `Camera` | 抓取快照 |
| 圆点/录制 | `CircleDot` | 录制中状态 |
| 包/导出 | `Package` | 导出会话包 |
| 警告 | `AlertCircle` | 错误列表项 |
| 时钟/时间 | `Clock` | 时间戳前缀 |

### Mock/拦截面板必备图标

| 功能 | lucide 名称 | 用途 |
|------|------------|------|
| 切换开关 | `ToggleLeft` / `ToggleRight` | 规则启用/禁用 |
| 加号/新增 | `Plus` | 新建规则 |
| 变量/替换 | `Variable` | 属性替换 |
| 文档/整体 | `FileText` | 整体替换 |
| 边界 | `ArrowRightLeft` | 边界值测试 |

---

## 四、图标颜色规则

### 图标颜色与语义一致

| 语义 | 颜色 Token | 场景 |
|------|-----------|------|
| 默认 | `currentColor`（继承文字色） | 普通按钮图标 |
| 主色 | `var(--primary)` | 主操作按钮、选中态 |
| 成功 | `var(--success)` | 2xx 状态、成功提示 |
| 警告 | `var(--warning)` | Mock 标识、3xx |
| 错误 | `var(--error)` | 4xx/5xx、删除按钮 |
| 禁用 | `var(--neutral-05)` | disabled 态 |

```tsx
// 图标颜色跟随语义
<Play size={16} color="var(--primary)" />        // 主操作
<Trash2 size={16} color="var(--error)" />        // 删除
<Download size={16} color="var(--neutral-06)" />  // 次要操作
```

### 纯图标按钮的规范

```css
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--neutral-06);
  transition: background var(--duration-fast), color var(--duration-fast);
}
.icon-btn:hover {
  background: var(--neutral-02);
  color: var(--neutral-08);
}
.icon-btn:active {
  background: var(--neutral-03);
}
.icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.icon-btn svg {
  pointer-events: none; /* 点击事件穿透到按钮 */
}
```

---

## 五、禁止事项

1. **禁止使用 emoji 作为功能图标** — `📋` `⚡` `⚙` 在不同系统渲染不一致，且无法控制颜色
2. **禁止使用图片图标** — 无法适配主题、无法控制尺寸
3. **禁止图标字体** — Shadow DOM 中会失效
4. **禁止图标尺寸 > 24px** — 开发者工具不需要大图标
5. **禁止每个按钮都加图标** — 图标是辅助，文字优先；仅高频操作配图标
