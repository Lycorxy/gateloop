# 表格设计知识库

> 来源：Brandhero Table UX Guide、DSGNMSTR Table UI 设计指南、掘金「密集信息展示」实践指南、Superfiles「10 UX Rules for SaaS Data Tables」、Linear Issue List 逆向分析

---

## 一、核心原则

**表格是管理系统的核心组件。80% 的 B2B 工作流围绕表格展开。**

表格只承担 3 个职责：**列表信息 + 快速对比 + 筛选/排序**

优先展示的字段：
- 唯一标识 / 名称
- 关键指标（1-3 个）
- 状态字段
- 关键操作入口

不要在表格中展示：完整详情类内容（长备注、全文、配置 JSON）

---

## 二、Anatomy（解剖图）

```
┌─────────────────────────────────────────────────────────────┐
│ ════════ 表头（Header）════════                             │
│ □ │ 名称        │ 状态   │ 创建时间   │ 操作     ← sticky │
│═══╪════════════╪═══════╪══════════╪══════════              │
│ □ │ Project A   │ ●运行中│ 01-15    │ 编辑 删除 ← 数据行   │
│   │             │        │          │ (h:44-48px)           │
│ □ │ Project B   │ ○已停止│ 02-20    │ 编辑 删除             │
│═══╪════════════╪═══════╪══════════╪══════════              │
│                         共 100 条  < 1 2 3 >  ← 底部工具栏 │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、对齐规则（基于眼动研究）

| 数据类型 | 对齐方式 | 原因 |
|---------|---------|------|
| 文本（名称、描述） | **左对齐** | 符合阅读习惯，快速扫视 |
| 数字（金额、数量、ID） | **右对齐** | 位数对齐，方便比较大小 |
| 日期时间 | **左对齐** | 格式统一，左对齐更易读 |
| 状态（Tag/Badge） | **居中** | 短文本居中最平衡 |
| 操作按钮 | **右对齐** | 固定位置，肌肉记忆 |

**禁忌**：❌ 全文居中对齐（造成 wobble effect 扫视困难）
**铁律**：✅ 表头对齐方式 = 数据对齐方式

---

## 四、行高规范

| 密度等级 | 行高 | 内边距 | 适用场景 |
|---------|------|--------|---------|
| **超密** | 36px | 6px 12px | 日志/审计/大量数据 |
| **紧凑** | 44px | 8px 16px | **标准列表（推荐）** |
| **标准** | 48px | 10px 16px | 含多信息列的表格 |
| **宽松** | 56px | 12px 20px | 含操作说明/预览的表格 |

---

## 五、列宽策略

```
1. 固定列（操作列、状态列、复选框列）
   - 操作列：120-160px
   - 状态列：80-100px
   - 复选框列：48px

2. 内容自适应列（名称、标题等主要信息列）
   - flex: 1 或 min-width + overflow ellipsis
   - 长文本 tooltip 显示完整内容

3. 比例分配列（数值、日期等）
   - 按 content 比例分配剩余空间
```

---

## 六、操作列设计（3 种方案）

### 方案 A：常驻文字按钮（≤ 3 个操作时）

```
│  编辑  查看  删除  │  ← 文字链接，蓝色
```

### 方案 B：Hover 显现（> 3 个操作时）

```
默认：[编辑]
Hover: [编辑] [复制] [导出] [···]    ← 更多用 Popover
```

### 方案 C：「更多」下拉（操作很多时）

```
[···] → Popover:
  ├── 编辑
  ├── 复制
  ├── 导出
  ├── 移动到...
  ────────
  └── 删除（红色）
```

**来源**：Superfiles UX Rule #7 — "If every row has Edit, Duplicate, and Delete, a 50-row table has 150 buttons. Hide actions behind Hover or Kebab menu."

---

## 七、分割线 vs 斑马纹

```
推荐：水平分割线（1px solid neutral-03）

┌──────────────────────────────────────┐
│  Name A   │ Active  │ 2024-01-15    │
│───────────┼─────────┼───────────────│  ← 仅水平线
│  Name B   │ Stopped │ 2024-02-20    │
└──────────────────────────────────────┘

备选：斑马纹（数据密集时）

┌──────────────────────────────────────┐
│  Name A   │ Active  │ 2024-01-15    │  ← bg: neutral-01
│  Name B   │ Stopped │ 2024-02-20    │  ← bg: neutral-02
│  Name C   │ Active  │ 2024-03-10    │  ← bg: neutral-01
└──────────────────────────────────────┘
```

**来源**：Superfiles UX Rule #6 — "Kill the vertical lines. Use only subtle horizontal borders. For massive dense data, use zebra striping instead."

---

## 八、表头 Sticky（必须）

```
滚动时表头必须固定在顶部。

实现：
- thead { position: sticky; top: 0; z-index: 1; }
- 滚动开始时添加 box-shadow 增加深度感

来源：Superfiles UX Rule #1 — "If a user scrolls to row 50, they should not have to guess what Column 4 means."
```

---

## 九、首列固定（横向滚动时）

```
当列数 > 6 需要横向滚动时，固定首列（名称/ID）：

│ Name (sticky)  │ ... │ Col 5 │ Col 6 │ Col 7 │ ... │ 操作(sticky) │
│ ◄── 固定 ──►  │     │       │ ◄── 滚动 ──►│     │ ◄── 固定 ──► │

来源：Superfiles UX Rule #5 — "Pin the primary identifier to the left edge. When user scrolls to Column 15, they need to know who that data belongs to."
```

---

## 十、分页 vs 无限滚动

```
✅ 分页（SaaS 管理系统首选）
   - 用户需要定位特定记录
   - 需要跳转到末尾
   - 需要编辑数据
   - 提供 "每页条数" 下拉（25/50/100）

❌ 无限滚动（仅社交/消费类内容）
   - 破坏浏览器滚动条
   - 无法到达底部
   - 点击返回后丢失位置

来源：Superfiles UX Rule #4 — "SaaS uses pagination because the goal is control, not consumption."
```

---

## 十一、空状态与加载状态

### 空状态

```
┌────────────────────────────────────────────┐
│                                            │
│         ╭─────────────╮                    │
│         │   (SVG)     │   200x160px        │
│         │   空状态插画  │                    │
│         ╰─────────────╯                    │
│                                            │
│        暂无数据                             │
│        这里还没有任何内容                   │
│                                            │
│      ┌──────────────┐                      │
│      │   新建项目    │   ← CTA 按钮         │
│      └──────────────┘                      │
└────────────────────────────────────────────┘
```

### 加载状态

- **首次加载**：骨架屏（Skeleton）— 与真实结构一致的脉冲动画
- **切换页码/筛选**：表格区域半透明 overlay + Spinner
- **无限滚动**：底部 Loading indicator

---

## 十二、高级特性清单

| 特性 | 说明 | 何时使用 |
|------|------|---------|
| **排序** | 点击表头箭头排序 | 数值/日期列 |
| **筛选** | 列头下拉筛选 | 状态/类型等枚举列 |
| **搜索** | 顶部搜索框 + 列内搜索 | 数据量大时 |
| **列配置** | 右键/菜单选择显示/隐藏列 | 列数 > 8 时 |
| **列宽拖拽** | 拖动列边界调整宽度 | 用户需要自定义视图时 |
| **固定列** | 左侧 N 列 + 操作列 sticky | 横向滚动时 |
| **行选择** | 复选框 + 全选 + 批量操作 | 需要批量处理时 |
| **展开行** | 点击展开子表格/详情 | 主从关系数据 |
| **虚拟滚动** | 只渲染可视行 | 500+ 条数据时 |
| **行内编辑** | 双击/点击进入编辑模式 | 简单字段快速修改 |
| **导出** | 导出 CSV/Excel | 用户需要离线分析时 |
| **密度切换** | 舒适/紧凑/超密三档 | 用户偏好 |

---

## 十三、真实案例

### 案例 1：Linear Issue List（行业标杆）

```
┌──────────────────────────────────────────────────────────────┐
│ □  ●  FE-142  Fix navigation animation  John  High  2d ago  │
│         ↑    ↑                        ↑      ↑      ↑       │
│       复选  状态  标题(粗)           负责人  优先级  时间(淡)  │
├──────────────────────────────────────────────────────────────┤
│ □  ○  FE-143  API rate limiting        Jane  Medium 1d ago  │
│                                                                    │
│    hover 时行底出现操作栏：[→Move] [Copy] [...]                    │
└──────────────────────────────────────────────────────────────┘

特点：
- 行高 40px，字体 14px
- 状态用 8px 圆点（不用 Badge），极简
- 次要信息（时间）颜色淡化为 neutral-06
- hover 才显示操作按钮
- 每行含 8+ 字段但不拥挤
```

### 案例 2：Stripe 付款列表（交互密度标杆）

```
特点：
- 内联编辑：点击金额直接修改
- 批量操作：勾选后顶部浮动操作栏
- 列宽可拖拽调整
- 状态筛选器嵌入表头
- 行点击展开详情 Drawer
```

### 案例 3：掘金「密集信息展示」实践（中文场景）

```
信息分类策略（来自掘金 LeonGao）：

1. 主识别信息 → 表格前几列，列宽适当
   - 名称、ID、时间、关键状态、主要指标

2. 高频决策信息 → 保留为表格列，支持排序和筛选
   - 金额、状态、优先级、关键指标、负责人

3. 低频细节信息 → 行展开 / Drawer / Popover
   - 备注、历史、异常详情

4. 结构化/层级信息 → 详情区域 / Tab / 专门编辑页
   - JSON 配置、条件组合、ACL 规则

5. 交互型内容 → 操作列 / hover 浮层 / 详情区按钮
   - 启用/停用、编辑、删除、复制链接
```

### 案例 4：0xMinds Admin Panel Prompt（AI 生成最佳实践）

```
用户管理表格 Prompt 示例：

BUILD: User management table with role assignment and account controls
FOR: SaaS admins managing team members and permission levels
MUST:
- Sortable, filterable data table with columns for name, email, role, and account status
- Inline role dropdown per row (Admin, Editor, Viewer, Guest)
- Bulk action toolbar with deactivate, delete, and export CSV buttons
SHOULD:
- Avatar with initials fallback when no profile photo exists
- Confirmation modal before any destructive bulk action executes
CONTEXT: React + Tailwind + shadcn/ui, white admin panel aesthetic, gray sidebar, compact row density

关键：指定了 MUST/SHOULD/CONTEXT 三层优先级
```

---

## 十四、表格信息取舍决策树

```
这条信息属于哪类？
│
├─ 帮助识别"这是谁" → 保留为表格列（前几列）
│
├─ 高频需要比较/排序 → 保留为表格列（支持排序筛选）
│
├─ 只在深入了解时才看 → 行展开 / Drawer / Popover
│
├─ 层级很深/结构复杂 → 详情页 / Tab
│
└─ 操作入口 → 操作列 / hover 浮层
```
