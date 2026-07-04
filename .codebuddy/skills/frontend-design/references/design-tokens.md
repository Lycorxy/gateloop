---
description: 设计权威规则 — 产品定位/设计哲学/布局决策树/组件选型/视觉层级/反AI slop + Figma Token（色彩/间距/圆角/字体/组件规格），Frontend-Agent 和 Architect-Agent 必须遵守，生成前先读第零节
globs: ["**/*.tsx", "**/*.scss"]
alwaysApply: true
---

# 设计 Token 权威规则（源自 Figma 设计稿）

> ⚠️ 本文件是设计的唯一权威来源。所有 SCSS 生成必须以此为准，不得凭空推断。
> 字体：**PingFang SC**（全局统一）

---

## ⚡ 强制执行协议（Frontend-Agent / Architect-Agent 必须在生成前执行）

> 本文件 `alwaysApply: true`，但**加载不等于执行**。以下是强制触发机制：

### 触发时机

```
每次生成 .tsx 或 .scss 文件前，必须执行以下动作（不得跳过）：

1. 【布局锁定】走 §0.3 布局决策树，确认当前页面类型，输出：
   "布局类型：XXX（来源：布局决策树）"

2. 【Token 绑定】从本文件取值，不得凭空推断，输出：
   "颜色：var(--color-xxx) ✅ | 间距：var(--space-xxx) ✅ | 圆角：var(--radius-xxx) ✅"

3. 【组件锁定】走 §0.4 组件选型原则，确认每个区域用什么组件，输出：
   "列表→TTable ✅ | 树→antd Tree ✅ | 表单→TForm ✅"

4. 【反 slop 过滤】走 §0.6 反 AI slop 规则，过滤掉通用后台模板写法，输出：
   "无渐变 ✅ | 无彩色Tag ✅ | 行高48px ✅ | 圆角2px ✅"
```

### 违规处理

```
如果生成的代码中出现以下任一情况，视为违规，必须立即重写：
  ❌ 硬编码色值（如 #1e67fa 直接写在 SCSS 中）
  ❌ 硬编码间距（如 padding: 20px 不用 var()）
  ❌ 按钮/输入框圆角 ≠ 2px
  ❌ 表格行高 ≠ 48px
  ❌ 渐变背景（除顶部导航）
  ❌ 用 div 列表替代 TTable
  ❌ 用手写 ul/li 替代 antd Tree（除非线框图明确要求）
  ❌ 缺少 loading/empty/error 三态
```

---

## 零、设计大脑（模型必读，优先级最高）

### 0.1 产品定位

**企业级知识管理平台**，面向内部研发/产品/运营团队，核心诉求是：

- **高效**：信息密度高，操作路径短，减少无效点击
- **专业**：沉稳克制，不花哨，让内容本身成为主角
- **可信**：一致性强，用户能预测每个操作的结果

设计气质参考：**飞书文档 + Notion + Confluence**，不是 C 端消费产品，不要做成"好看但低效"。

---

### 0.2 设计哲学（3 条核心原则）

#### 原则一：内容优先，界面退后

界面是容器，内容是主角。所有装饰性元素（渐变、阴影、动画）必须服务于内容传达，不能喧宾夺主。

```
✅ 用留白区分层级
✅ 用字重区分主次（600 vs 400）
✅ 用颜色传达状态（蓝=可操作，红=危险，灰=禁用）
❌ 用渐变/彩色背景"装饰"页面
❌ 用大量图标代替文字说明
❌ 用动画吸引注意力
```

#### 原则二：一致性高于创意

同类场景必须用同一种解法，不允许"这个页面用 Modal，那个页面用 Drawer"的随意切换。

```
新增/编辑 → 统一用 Modal（简单表单）或 Drawer（复杂表单 ≥6 字段）
删除确认 → 统一用 Popconfirm（行内）或 Modal（批量）
列表页 → 统一：顶部搜索卡片 + 下方表格卡片
详情页 → 统一：居中单列卡片（max-width: 960px）
```

#### 原则三：状态完整，不留空白

任何数据展示区域必须处理 **3 种状态**，缺一不可：

```
loading → <Spin> 或 <Skeleton>（骨架屏优先，避免闪烁）
empty   → <Empty description="暂无数据">（可加引导操作按钮）
error   → message.error() + 重试入口
```

---

### 0.3 布局决策树（遇到新场景必须走这棵树）

```
用户描述的页面是什么类型？
│
├─ 列表管理（增删改查）
│   └─ 标准列表页：顶部搜索卡片(flex-shrink:0) + 下方表格卡片(flex:1)
│       └─ 操作列：编辑(文字按钮) + 删除(文字按钮+Popconfirm)
│
├─ 详情/编辑（单条记录）
│   ├─ 字段 ≤ 6 个 → Modal 弹窗（宽 520px）
│   ├─ 字段 7-15 个 → Drawer 抽屉（宽 720px，从右滑入）
│   └─ 字段 > 15 个 / 有富文本 → 独立详情页（居中卡片 max-width:960px）
│
├─ 树形结构 + 内容（目录+正文）
│   └─ 左右分栏：左侧树(固定宽 240-280px) + 右侧内容(flex:1)
│       └─ 两侧均为卡片三件套，独立滚动（overflow-y: auto）
│
├─ 数据看板（统计/概览）
│   └─ 顶部统计卡片行(flex, gap:16px) + 下方图表/列表区
│       └─ 统计卡片：数字大(28px/600) + 标签小(14px/400/neutral-08)
│
├─ 表单页（配置/设置）
│   └─ 居中卡片(max-width:800px) + 底部操作栏(80px, 按钮右对齐)
│       └─ 表单项：label(14px/400/neutral-08) + 控件(height:40px)
│
└─ 混合页（搜索+树+内容）
    └─ 上下两栏：上栏搜索区(flex-shrink:0) + 下栏左右分栏
        └─ 下栏：左侧目录树(固定宽) + 右侧内容(flex:1)，各自独立滚动
```

---

### 0.4 组件选型原则

| 场景 | 选用组件 | 禁止 |
|------|---------|------|
| 数据列表（多列、可排序、可筛选） | antd `Table` / `TTable` | 自定义 div 列表 |
| 树形目录（层级导航） | antd `Tree` | 手写递归 ul/li |
| 简单选择（≤5 项） | antd `Radio.Group` | Select |
| 简单选择（> 5 项 / 可搜索） | antd `Select` | Radio |
| 日期选择 | antd `DatePicker` + dayjs | 原生 input[type=date] |
| 富文本/Markdown 编辑 | CodeMirror 6 | textarea |
| 长文本展示（超出省略） | `TEllipsis` | CSS overflow:hidden |
| 图片预览 | `TFloatImg` | 自定义 hover |
| 权限控制 | `TWithPermission` | 手写 if 判断 |
| 复杂表单（≥4 字段） | `TForm` | 手写 Form.Item |
| 带搜索的列表页 | `TTable` + `TTableSearch` | 手写搜索逻辑 |

---

### 0.5 视觉层级原则（信息主次）

**字重是层级的第一语言**，颜色是第二语言，尺寸是第三语言。

```
层级 1（页面标题）：18px / 600 / neutral-10
层级 2（卡片标题/分组标题）：16px / 600 / neutral-10
层级 3（正文/表格内容）：14px / 400 / neutral-09
层级 4（辅助说明/label）：14px / 400 / neutral-08
层级 5（占位符/字数限制）：14px / 400 / neutral-06
```

**颜色传达状态，不传达层级**：
```
蓝色(blue-07) = 可操作、选中、链接
红色(red-07)  = 危险、错误、必填
绿色(green-07)= 成功、完成
灰色(neutral) = 中性内容，用深浅区分主次
```

**间距传达关联性**：
```
同一组内的元素：gap: 8px（紧密）
不同组之间：gap: 16px（适中）
不同模块之间：gap: 24px（宽松）
页面边距：padding: 20px（固定）
```

---

### 0.6 反 AI slop 规则（禁止生成"一眼 AI"的通用后台）

以下是模型最容易犯的设计错误，**看到自己要生成这些时立即停下**：

```
❌ 渐变背景卡片（除顶部导航外禁止渐变）
❌ 大量彩色 Tag/Badge 装饰（只用语义色：红/橙/绿）
❌ 每个操作都加图标（文字按钮比图标按钮更专业）
❌ 卡片堆叠阴影过重（只用 0 1px 2px rgba(0,0,0,.05)）
❌ 表格行高超过 48px（信息密度不够）
❌ 弹窗宽度超过 720px（用 Drawer 替代）
❌ 页面内容居中且 max-width 很小（后台要充分利用宽度）
❌ 用 emoji 作为图标（用 antd icons 或 TIcon）
❌ 标题字号超过 18px（内容区标题上限）
❌ 按钮圆角超过 4px（企业风格，不是 C 端圆润风）
```

**正确的企业级后台气质**：
```
✅ 白色卡片 + 浅灰页面底色（neutral-01 on neutral-02）
✅ 蓝色只用于可操作元素（按钮、链接、选中态）
✅ 信息密度高：表格行高 48px，菜单高 40px
✅ 操作按钮右对齐（符合阅读习惯，主操作在最右）
✅ 分割线用 border（1px solid neutral-03），不用阴影
✅ 字体统一 PingFang SC，不混用多种字体
```

---

### 0.7 Architect-Agent 线框生成规则

生成 ASCII 线框时，必须：

1. **先走布局决策树**（0.3节），确定页面类型
2. **标注精确尺寸**：从本文件取值，不猜测（如 `左侧树 240px`、`搜索栏 h:40px`）
3. **标注组件选型**：每个区域注明用什么组件（如 `antd Tree`、`TTable`）
4. **标注交互说明**：hover/选中/空状态如何处理
5. **不生成装饰性元素**：线框只描述结构和功能，不描述颜色和美化

---

## 一、页面骨架（精确值）

```
整体宽度：1920px
顶部导航高度：60px（background: 品牌蓝渐变，白色文字/图标）
左侧导航宽度：208px（background: var(--color-neutral-01, #fff)，右侧 border-right: 1px var(--color-neutral-03, #EBEBEB) solid）
内容区：left: 208px，top: 60px，width: 1712px，height: 1020px
页面底色：var(--color-neutral-02, #F5F5F5)
```

---

## 二、色彩系统（CSS 变量 + 精确色值）

### 中性色

| Token | 色值 | 用途 |
|-------|------|------|
| `--color-neutral-01` | `#FFFFFF` | 卡片/面板/输入框背景 |
| `--color-neutral-02` | `#F5F5F5` | 页面底色、表格表头背景 |
| `--color-neutral-03` | `#EBEBEB` | 边框、分割线、表格行边框 |
| `--color-neutral-04` | `#E0E0E0` | 输入框/Select 边框（outline） |
| `--color-neutral-06` | `#B8B8B8` | 字数限制提示、placeholder |
| `--color-neutral-07` | `#808080` | 辅助图标、次要操作 |
| `--color-neutral-08` | `#525252` | 菜单未选中文字、label 文字、次要文字 |
| `--color-neutral-09` | `#2B2B2B` | 正文、表格内容文字 |
| `--color-neutral-10` | `#131315` | 主标题、卡片标题、页面标题 |

### 品牌蓝

| Token | 色值 | 用途 |
|-------|------|------|
| `--color-blue-01` | `#F5F8FF` | hover 底色、规范页背景 |
| `--color-blue-02` | `#E5EEFF` | 菜单选中底色、规范页标题背景 |
| `--color-blue-05` | `#70A0FF` | 头像/图标背景（圆形） |
| `--color-blue-06` | `#4784FF` | 线框按钮边框色 |
| `--color-blue-07` | `#1E67FA` | 品牌主色、主按钮背景、链接、选中文字 |
| `--color-blue-10` | `#001761` | 深蓝标题（规范页大标题） |

### 语义色

| Token | 色值 | 用途 |
|-------|------|------|
| `--color-red-07` | `#E52E2E` | 错误、必填 `*` 标记、警告文字 |
| `--color-orange-07` | `#FA820A` | 警告 |
| `--color-green-07` | `#15AD3D` | 成功 |

**禁止**：渐变色（除顶部导航）、纯黑 `#000`、彩色背景、硬编码色值

---

## 三、间距系统（4px 基准）

| Token | 值 | 用途 |
|-------|-----|------|
| `--space-4` | `4px` | 图标与文字间距 |
| `--space-8` | `8px` | 行内元素间距、小间距 |
| `--space-12` | `12px` | 列表项内边距（小） |
| `--space-16` | `16px` | 内容区内边距（Figma 实测 20px → 映射此档）、卡片间距 |
| `--space-24` | `24px` | 卡片内边距、模块间距 |
| `--space-32` | `32px` | 大模块间距 |
| `--space-48` | `48px` | 页面级间距 |

**Figma 实测映射规则**：
- `left: 20px`（内容区内边距）→ `var(--space-16, 16px)`
- `left: 40px`（规范页内边距）→ `var(--space-32, 32px)`
- `left: 48px`（规范页大标题内边距）→ `var(--space-48, 48px)`

---

## 四、圆角系统

| Token | 值 | 用途 |
|-------|-----|------|
| `--radius-sm` | `2px` | 按钮、输入框、Select、菜单选中背景（Figma 实测值） |
| `--radius-md` | `4px` | 小卡片、标签 |
| `--radius-lg` | `8px` | 面板、卡片 |
| `--radius-xl` | `12px` | 大卡片、弹窗 |
| `--radius-full` | `9999px` | 圆形头像/图标 |

> ⚠️ 注意：Figma 中按钮/输入框圆角是 `2px`（`--radius-sm`），不是 `4px`

---

## 五、字体系统

| 场景 | font-size | font-weight | color token |
|------|-----------|-------------|-------------|
| 页面大标题（规范页） | `64px` | `600` | `--color-neutral-01`（白底） |
| 规范页章节标题 | `48px` | `600` | `--color-blue-10` |
| 规范页正文说明 | `28px` | `500` | `--color-neutral-10` |
| 页面标题（内容区） | `18px` | `600` | `--color-neutral-10` |
| 卡片标题 | `18px` | `600` | `--color-neutral-10` |
| 卡片子标题 | `16px` | `600` | `--color-neutral-10` |
| 正文/表格内容 | `14px` | `400` | `--color-neutral-09` |
| 菜单文字（一级） | `14px` | `600` | `--color-neutral-08`（未选中）/ `--color-blue-07`（选中） |
| 菜单文字（二级） | `14px` | `400` | `--color-blue-07`（选中） |
| label 文字 | `14px` | `400` | `--color-neutral-08` |
| 辅助文字/描述 | `14px` | `400` | `--color-neutral-08` |
| 字数限制提示 | `14px` | `400` | `--color-neutral-06` |
| 用户名 | `16px` | `600` | `--color-neutral-01`（白底） |
| 用户描述 | `12px` | `400` | `--color-neutral-01`（白底，opacity: 0.75） |

---

## 六、组件精确规格（Figma 实测）

### 6.1 左侧导航菜单

```scss
// 容器
.nav {
  width: 208px;
  background: var(--color-neutral-01, #fff);
  border-right: 1px solid var(--color-neutral-03, #ebebeb);
}

// 一级菜单项（未选中）
.nav-item {
  height: 40px;
  padding: 0 20px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-neutral-08, #525252);
  cursor: pointer;
  transition: all 200ms ease;

  &:hover {
    background: var(--color-blue-01, #f5f8ff);
  }
}

// 二级菜单项（选中态）— 内缩 8px，圆角 2px
.nav-sub-item-active {
  margin: 0 8px;
  height: 40px;
  background: var(--color-blue-02, #e5eeff);
  border-radius: var(--radius-sm, 2px);
  font-size: 14px;
  font-weight: 400;
  color: var(--color-blue-07, #1e67fa);
}
```

### 6.2 页面标题栏

```scss
.page-header {
  height: 64px;
  background: var(--color-neutral-01, #fff);
  border-bottom: 1px solid var(--color-neutral-03, #ebebeb);
  padding: 0 20px;
  display: flex;
  align-items: center;

  .title {
    font-size: 18px;
    font-weight: 600;
    color: var(--color-neutral-10, #131315);
  }
}
```

### 6.3 表格（antd Table）

```scss
// 表头
.table-header-cell {
  height: 48px;
  background: var(--color-neutral-02, #f5f5f5);
  border-bottom: 1px solid var(--color-neutral-03, #ebebeb);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-neutral-09, #2b2b2b);
  padding: 0 20px;
}

// 数据行
.table-row {
  height: 48px;
  background: var(--color-neutral-01, #fff);
  border-bottom: 1px solid var(--color-neutral-03, #ebebeb);
  font-size: 14px;
  font-weight: 400;
  color: var(--color-neutral-09, #2b2b2b);
  padding: 0 20px;
}
```

### 6.4 输入框 / Select

```scss
// 统一规格（Figma 实测）
.input, .select {
  height: 40px;
  background: var(--color-neutral-01, #fff);
  border-radius: var(--radius-sm, 2px);
  outline: 1px solid var(--color-neutral-04, #e0e0e0);
  padding: 0 12px;
  font-size: 14px;
  color: var(--color-neutral-09, #2b2b2b);

  &::placeholder {
    color: var(--color-neutral-06, #b8b8b8);
  }

  &:focus {
    outline-color: var(--color-blue-07, #1e67fa);
  }
}
```

### 6.5 按钮

```scss
// 主按钮（primary）
.btn-primary {
  height: 40px;
  padding: 0 16px;
  background: var(--color-blue-07, #1e67fa);
  border-radius: var(--radius-sm, 2px);
  font-size: 14px;
  font-weight: 400;
  color: var(--color-neutral-01, #fff);
  border: none;
  cursor: pointer;
  transition: all 200ms ease;

  &:hover { opacity: .85; }
  &:disabled { opacity: .5; cursor: not-allowed; }
}

// 线框按钮（line）
.btn-line {
  height: 40px;
  padding: 0 16px;
  background: transparent;
  border-radius: var(--radius-sm, 2px);
  outline: 1px solid var(--color-blue-06, #4784ff);
  font-size: 14px;
  font-weight: 400;
  color: var(--color-blue-07, #1e67fa);
  cursor: pointer;
  transition: all 200ms ease;

  &:hover { background: var(--color-blue-01, #f5f8ff); }
}

// 文字按钮（text）
.btn-text {
  height: 20px;
  background: transparent;
  border: none;
  font-size: 14px;
  color: var(--color-blue-07, #1e67fa);
  cursor: pointer;

  &:hover { opacity: .75; }
}
```

### 6.6 表单 label + 必填标记

```scss
.form-label {
  font-size: 14px;
  font-weight: 400;
  color: var(--color-neutral-08, #525252);
  margin-bottom: var(--space-8, 8px);

  .required {
    color: var(--color-red-07, #e52e2e);
    margin-right: var(--space-4, 4px);
  }
}
```

### 6.7 底部操作栏

```scss
.footer-bar {
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 20px;
  gap: var(--space-8, 8px);
  border-top: 1px solid var(--color-neutral-03, #ebebeb);
  background: var(--color-neutral-01, #fff);
}
```

### 6.8 卡片容器（白色内容块三件套）

```scss
.card {
  background: var(--color-neutral-01, #fff);
  border: 1px solid var(--color-neutral-03, #ebebeb);
  border-radius: var(--radius-lg, 8px);
  box-shadow: 0 1px 2px rgba(0, 0, 0, .05);
}
```

---

## 七、交互状态规范

| 状态 | 样式 |
|------|------|
| hover（通用） | `background: var(--color-blue-01, #f5f8ff)` + `cursor: pointer` + `transition: all 200ms ease` |
| 菜单选中 | `background: var(--color-blue-02, #e5eeff)` + `color: var(--color-blue-07)` + `border-radius: 2px`（内缩8px） |
| 表格行 hover | `background: var(--color-blue-01, #f5f8ff)` |
| 输入框 focus | `outline-color: var(--color-blue-07, #1e67fa)` |
| disabled | `opacity: .5` + `cursor: not-allowed` + `pointer-events: none` |
| 加载中 | antd `<Spin>` 或 `<Skeleton>` |
| 空状态 | antd `<Empty description="暂无数据">` |
| 删除确认 | 必须 `<Popconfirm>`，禁 `window.confirm` |

---

## 八、布局模式速查

### 标准后台页面（最常用）

```
┌─────────────────────────────────────────────────────────┐
│ 顶部导航 60px（品牌蓝渐变背景）                           │
├──────────┬──────────────────────────────────────────────┤
│ 左侧导航 │ 内容区（flex:1）                              │
│  208px   │  ┌──────────────────────────────────────┐   │
│          │  │ 页面标题栏 64px + border-bottom        │   │
│ 一级菜单 │  ├──────────────────────────────────────┤   │
│  h:40px  │  │ 内容区 padding: 20px                  │   │
│          │  │                                      │   │
│ 二级菜单 │  │  卡片/表格/表单                        │   │
│  h:38px  │  │                                      │   │
│ 选中:蓝底 │  └──────────────────────────────────────┘   │
│          │  ┌──────────────────────────────────────┐   │
│          │  │ 底部操作栏 80px（按钮右对齐）           │   │
│          │  └──────────────────────────────────────┘   │
└──────────┴──────────────────────────────────────────────┘
```

### 左右分栏内容区

```
内容区内部：
┌──────────────────────┬─────────────────────────────────┐
│ 左侧面板（固定宽）    │ 右侧面板（flex:1）               │
│ 卡片三件套           │ 卡片三件套                       │
│ 标题 18px/600        │ 标题 18px/600                   │
│ border-bottom        │ border-bottom                   │
│ padding: 20px        │ padding: 20px                   │
└──────────────────────┴─────────────────────────────────┘
gap: var(--space-16, 16px)
```

---

## 九、SCSS 生成自检清单（生成后必过）

```
□ 所有颜色使用 var(--color-xxx, fallback)，无硬编码色值
□ 所有间距使用 var(--space-xxx, fallback)，无硬编码 px（布局精确值除外）
□ 所有圆角使用 var(--radius-xxx, fallback)
□ 按钮/输入框圆角是 2px（--radius-sm），不是 4px
□ 菜单选中态：内缩 8px + border-radius: 2px + 蓝色背景 + 蓝色文字
□ 表格表头背景：--color-neutral-02
□ 表格行高：48px
□ 页面标题栏高度：64px + border-bottom
□ 底部操作栏高度：80px + 按钮右对齐
□ 白色内容块有卡片三件套（border + border-radius + box-shadow）
□ 可交互元素有 cursor:pointer + transition: all 200ms ease
□ flex 布局用 gap，不用 margin 堆砌
□ opacity:.5 ✅ | 0.5 ❌ | border: 0 ✅ | border: none ❌ | 无 @import
```
