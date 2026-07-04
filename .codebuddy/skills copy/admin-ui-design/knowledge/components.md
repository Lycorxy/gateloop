# 组件设计规范

> 来源：Ant Design Pro、Linear 组件逆向分析、Vercel Dashboard 组件、shadcn/ui 设计系统

---

## 一、按钮（3 种形态 + 优先级层次）

### Primary（每区域最多 1 个）

```
┌──────────────┐
│    新建项目    │  h:40px, bg:var(--color-blue-07), text:#fff, r:2px
└──────────────┘
```

### Line（次要操作，每区域最多 2 个）

```
┌──────────────┐
│    导出数据    │  h:40px, outline:1px var(--color-blue-06), text:var(--color-blue-07), r:2px
└──────────────┘
```

### Text（最轻量，不限数量）

```
  编辑  查看  更多  h:20px, text:var(--color-blue-07), no border/bg
```

### 危险操作

```
  删除  text:var(--color-red-07), hover:opacity:.75
```

### 禁用态

```
所有形态 opacity:.5 + cursor:not-allowed + pointer-events:none
```

### 按钮尺寸

| 尺寸 | 高度 | 内边距 | 字号 | 用途 |
|------|------|--------|------|------|
| **Default** | **40px** | **0 16px** | **14px** | **标准（企业级）** |
| Small | 28px | 0 8px | 12px | 表格内/紧凑区域 |

---

## 二、卡片容器

```scss
// 卡片三件套（企业标准：border + radius + shadow 缺一不可）
.card {
  background: var(--color-neutral-01, #fff);
  border: 1px solid var(--color-neutral-03, #ebebeb);
  border-radius: var(--radius-lg, 8px);
  box-shadow: 0 1px 2px rgba(0, 0, 0, .05);

  .card-header {
    padding: 16px 24px;
    border-bottom: 1px solid var(--color-neutral-03, #ebebeb);
    font-size: 16px;
    font-weight: 600;
    color: var(--color-neutral-10, #131315);
  }
  .card-body {
    padding: 24px;
  }
}
```

---

## 三、导航菜单

```scss
.nav-item {
  height: 40px;
  padding: 0 20px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-neutral-08, #525252);
  display: flex;
  align-items: center;
  gap: var(--space-8);
  cursor: pointer;
  transition: all 200ms ease;

  &:hover {
    background: var(--color-blue-01, #f5f8ff);
  }
  // 选中态：内缩8px + 蓝色背景 + 蓝色文字 + 圆角2px
  &.active {
    margin: 0 8px;
    background: var(--color-blue-02, #e5eeff);
    color: var(--color-blue-07, #1e67fa);
    border-radius: var(--radius-sm, 2px);
  }
}
```

---

## 四、状态 Tag / Badge

```
仅允许 5 种语义色状态：

● 运行中  — var(--color-green-07) 背景 + #fff 文字（实心）
○ 已停止  — var(--color-neutral-03) 背景 + var(--color-neutral-08) 文字
▲ 进行中  — var(--color-blue-07) 背景 + #fff 文字
⚠ 警告    — var(--color-orange-07) 背景 + #fff 文字
✕ 异常    — var(--color-red-07) 背景 + #fff 文字

禁止：自定义彩色 Tag（如紫色"VIP"、粉色"新品"等）
```

### Tag 样式选择

```
实心（Filled）：
  ┌──────┐
  │ 运行中 │  bg: green-07, text: white
  └──────┘

描边（Outlined）：
  ┌──────┐
  │ 运行中 │  border: green-07, text: green-07, bg: transparent
  └──────┘

圆点（Dot）— Linear 风格：
  ● 运行中    8px 圆点 + 文字，最简洁
```

---

## 五、Modal vs Drawer 选择

```
Modal（居中弹窗）：
- 宽度：520px（小）/ 640px（中）/ 800px（大）
- 适用：确认对话框、简单编辑（≤ 6 字段）、警告
- 优点：强焦点，用户必须处理
- 缺点：遮挡内容

Drawer（侧边抽屉）：
- 宽度：480px（窄）/ 640px（标准）/ 720px（宽）
- 适用：复杂编辑（7-15 字段）、详情查看、设置面板
- 优点：不遮挡主内容，可参考上下文
- 缺点：焦点较弱

决策：
  字段 ≤ 6   → Modal
  字段 7-15  → Drawer
  字段 > 15  → 独立页面
```

---

## 六、空状态插画规范

```
场景            尺寸        风格
────────────────────────────────────
空数据          200x160px   2px 线描 + 品牌蓝
错误/异常       280x220px   2px 线描 + 红色调
引导/Onboarding 320x240px   填充风 + 品牌蓝
加载/Skeleton   区域同尺寸   脉冲动画

线条风格：
- stroke-width: 2px
- stroke-linecap: round
- stroke-linejoin: round
- 配色：品牌蓝 #1E67FA + 中性灰 #D4D4D4 + 白 #FFFFFF
- 禁止渐变填充
```

---

## 七、KPI 统计卡

```
┌──────────────────┐
│  总用户数          │  ← label: 14px, neutral-08
│  1,234            │  ← value: 28px, neutral-10, fw 600
│  ↑ 12.5%          │  ← change: 14px, green-07/red-07
│  较上月            │  ← period: 12px, neutral-06
└──────────────────┘

规则：
- 每行 4-6 个统计卡
- 卡片间距 16px
- 卡片内边距 24px
- 数字用 tabular-nums 等宽数字
- 变化率：↑绿色 / ↓红色
```

---

## 八、Tooltip / Popover

```
Tooltip（纯文本提示）：
- 触发：hover
- 延迟：300ms 显示 / 100ms 隐藏
- 最大宽度：240px
- 样式：bg neutral-10 + text white + r:4px + shadow-xl
- 位置：优先上方，空间不够则下方

Popover（富内容面板）：
- 触发：click
- 包含：筛选器、操作列表、表单
- 宽度：200-320px
- 点击外部关闭
- 样式：bg neutral-01 + border + shadow-lg + r:6px
```

---

## 九、Tabs 标签页

```
┌────────┬────────┬────────┐
│  基础   │  配置   │  日志   │
═════════╪════════╪════════
         │        │

规则：
- 激活态：底部 2px 蓝色线条 + 文字 blue-07
- 非激活：文字 neutral-07
- hover：文字 neutral-09
- 高度：40px
- 与 URL 同步（刷新不丢失位置）
```

---

## 十、Breadcrumb 面包屑

```
首页 / 项目管理 / 项目详情

规则：
- 分隔符：/ 或 >，颜色 neutral-06
- 当前页：neutral-09，不可点击
- 上级页：neutral-07，hover blue-07
- 字号：14px
- 最多显示 3 级，超出用 ... 折叠
```
