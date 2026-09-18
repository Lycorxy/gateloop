---
name: web-ui-design
description: >
  Web 端 UI/交互设计（含管理系统/B端/C端/工具型产品）。
  覆盖：需求理解→功能思考→信息架构→布局决策→交互设计→线框图→容错→设计检测。
  融入 HCI 七定律/诺曼七阶段/目标导向/微交互/渐进披露/错误容错/信息层级理论。
  由 ADS harness 驱动，引擎 schema+custom+review 三层验证。
  触发词：设计页面、设计布局、设计组件、优化UI、美化界面、设计面板、
  设计表格/表单/列表页、设计仪表盘、设计工具栏、设计弹窗、设计侧边栏、交互设计。
  不要用于：纯后端开发、纯CSS编写（→ css-style-writer）、纯前端代码逻辑、
  纯技术架构（→ frontend-design）。
version: 3.0.0
dependencies: []
conflict-with: [frontend-design]
allowed-tools: [read_file, write_file, replace_in_file, search_content, search_file, execute_command, list_dir]
max-token: 3000
---

# Web UI Design v3.0 — ADS Harness 驱动（需求→线框图）

> v3.0 核心变更：由 ADS harness 驱动，融入交互设计理论（HCI定律/诺曼/目标导向/微交互/渐进披露/容错/信息层级）。
> 引擎 schema 校验设计稿完备性 + custom 跑客观项脚本 + review 6 项设计决策质量主观评审。
> v2.0 的设计决策框架/量化标准/组件决策树保留为附录参考。

## ADS Harness 驱动模式

```
传统模式（v2）                   ADS Harness 模式（v3）
──────────────                  ──────────────────────────
模型自觉执行 Phase 0-4    →     引擎状态机推进 ui-design anchor
模型自报"7项检测通过"     →     ADS verify schema+custom+review 判定
状态在模型脑子             →     anchor-state.json 引擎唯一写入
断线就丢                   →     nut ads status 随时恢复
```

### 启动流程

```bash
MANIFEST=.codebuddy/skills/web-ui-design/anchor.config.json
nut ads init $MANIFEST --task "设计用户列表页"
# 引擎返回 ui-design anchor 指令（rulesInline 已内联 RULE.mdc）
# 模型执行 7 Phase → 写 ui-design.json → nut ads next
# 引擎 schema + custom(check-ui-objective) + review(6项) 校验 → 通过推进/失败修复
```

### 模型只做三件事

1. **读指令** — rulesInline（已内联 RULE.mdc 铁律）+ 按需 read knowledge/
2. **执行 7 Phase** — 需求→功能→布局→交互→线框图→容错→检测
3. **推进** — 写 ui-design.json + emit + `nut ads next`，引擎三层验证

⚠️ **不要自己声称"设计完成"**，引擎会 schema+custom+review 校验，exit code 说了算。

---

## 7 Phase 流程（融入交互设计理论）

### Phase 0：需求读 + 目标导向分析

> 理论依据：目标导向设计（About Face）— 区分用户目标/任务/功能

```
输出一行设计读：
"读此为：<页面类型>，面向<用户>，核心诉求<动词+名词>，约束<空间/场景>。"

目标导向分析（必须区分三者）：
  用户目标：用户想要达成的结果（如"快速找到异常订单"）
  任务：达成目标的步骤（如"搜索+筛选+翻页"）
  功能：系统提供的能力（如"查询接口+筛选组件"）
⚠️ 禁止以功能清单驱动设计（"产品要求加筛选按钮"），要先理解用户目标
```

### Phase 1：功能思考

> 理论依据：五层模型·范围层 — 划定功能范围

```
基于用户目标，思考需要哪些功能：
  □ 列出所有功能点（覆盖需求）
  □ 标注每个功能的优先级（P0核心/P1重要/P2次要/P3可选）
  □ 标注操作频率（高频/中频/低频）
  □ 识别可复用的已有功能/组件
⚠️ 禁止堆砌功能（功能越多越好是误区），要围绕用户目标精简
```

### Phase 2：信息架构 + 布局决策

> 理论依据：五层模型·结构层 + HCI 七大定律（费茨/希克/米勒）

```
信息分级：P0/P1/P2/P3 + 操作频率 + 空间预算

布局方案对比（必须 ≥ 2 种，量化评分）：
  | 维度 | 方案A | 方案B |
  | 信息直达率 | ?/10 | ?/10 |
  | 操作效率 | ?/10 | ?/10 |
  | 认知负荷(低优) | ?/10 | ?/10 |
  | 视觉平衡 | ?/10 | ?/10 |
  | 空间利用率 | ?/10 | ?/10 |
  | 综合 | ?/50 | ?/50 |

定律校验：
  □ 费茨定律：高频操作按钮足够大、就近摆放、不放在屏幕边角
  □ 希克定律：单界面选项不超载，次要选项渐进披露
  □ 米勒定律：主导航 ≤ 9 项，表单分组，长列表分页
选择得分最高方案，说明淘汰理由 + 选定方案风险
```

### Phase 3：交互设计

> 理论依据：诺曼七阶段（消除执行/评估鸿沟）+ 微交互四要素 + 渐进披露

```
每个交互点必须论证：
  - 可选方案：Tab | Select | Modal | Drawer | Inline...
  - 选择：X
  - 理由：消除执行鸿沟（用户知道怎么操作）+ 评估鸿沟（用户看懂结果）
  - 排除其他方案原因

微交互四要素（每个关键交互）：
  触发器 → 规则 → 反馈 → 循环/模式
  □ 反馈 < 100ms（伯施定律：无提示变化用户难察觉）

渐进披露校验：
  □ 高频操作不折叠（反复点开关闭增加成本）
  □ 次要/高级/可选信息才折叠
```

### Phase 4：线框图产出

> 理论依据：线框图与信息层级 — 六大视觉手段

```
ASCII 线框图（用 ┌─┐│└┘├┤┬┴┼）：
  只表达：布局 + 信息层级 + 导航 + 交互流向
  不包含：色彩/图标风格/圆角/图片（视觉UI阶段）

信息层级六大视觉手段：
  尺寸(标题更大) / 色彩(强调色突出关键) / 间距(分组) /
  权重(粗体/常规/浅色) / 位置(左上视觉流优先) / 阴影(层级区分)

线框图评审清单：
  □ 第一眼能否看到最重要信息？
  □ 主要操作按钮位置易到达（费茨）？
  □ 信息分组清晰（格式塔）？
  □ 一屏信息是否过载？能否渐进披露？
  □ 异常场景（空/加载/报错）是否考虑？
```

### Phase 5：容错 + 状态覆盖

> 理论依据：错误容错设计 — 四策略 + 四态

```
错误处理四策略：预防 > 捕获 > 告知 > 恢复
  □ 预防：操作前阻止错误（如手机号限制只能输入数字）
  □ 捕获：实时校验
  □ 告知：通俗文案 + 影响 + 解决方案（非 "code 500"）
  □ 恢复：撤销/修复路径

四态全覆盖：
  □ empty：空状态有引导操作（非只说"暂无数据"）
  □ loading：Skeleton 骨架屏（禁大 Spinner）
  □ error：友好提示 + 操作建议
  □ success：成功反馈
```

### Phase 6：设计检测

```
7 项检测全过才产出（沿用 v2）：
  □ 布局合理性（P0首屏可见/层级≤3/网格对齐）
  □ 交互合理性（高频≤2步/反馈<100ms/误操作防护）
  □ 间距系统（4px网格/层级关系/亲密性）
  □ 视觉质量（Token化/阴影克制/圆角一致）
  □ 用户体验（5秒理解/F型扫描/7±2组/容错）
  □ 现代感（无AI紫渐变/无过度圆角/签名元素）
  □ 交互质感（图标系统/5态按钮/复制反馈/键盘可达）
```

---

## ui-design.json 产物结构（schema 校验目标）

```json
{
  "requirement": {
    "userGoal": "用户目标（非功能清单）",
    "tasks": ["任务1", "任务2"],
    "functions": ["功能1", "功能2"]
  },
  "functions": [
    { "name": "功能名", "priority": "P0", "frequency": "高频" }
  ],
  "informationArchitecture": {
    "levels": { "P0": [], "P1": [], "P2": [], "P3": [] },
    "navigation": ["导航项1", "导航项2"]
  },
  "layoutDecisions": {
    "options": [
      { "name": "方案A", "scores": {}, "total": 42 }
    ],
    "selected": "方案A",
    "rationale": "选择理由 + 淘汰理由 + 风险"
  },
  "interactionDesign": {
    "points": [
      { "name": "交互点", "options": [], "selected": "Tab", "rationale": "理由" }
    ]
  },
  "wireframe": "ASCII 线框图（≥50字符）",
  "stateCoverage": {
    "empty": "空状态处理",
    "loading": "加载态处理",
    "error": "错误态处理",
    "success": "成功态处理"
  },
  "designRationale": "设计决策理由汇总"
}
```

🔴 缺任一 required 字段 = schema FAIL
🔴 wireframe 为空/过短 = custom FAIL
🔴 导航 > 9 / 方案 < 2 / 四态缺失 = custom FAIL

---

## 三层验证分工（v3 核心）

```
┌─────────────────────────────────────────────────────────────┐
│  档1 客观完备性（custom 脚本·exit code·模型无法伪造）        │
│    check-ui-objective.mjs: 功能非空/导航≤9/方案≥2/           │
│    线框图≥50字/四态覆盖/目标非空/交互论证                    │
├─────────────────────────────────────────────────────────────┤
│  档2 设计决策质量（review.model·6项·四道门禁）               │
│    requirement-understanding / function-completeness /       │
│    layout-decision / interaction-design /                   │
│    information-hierarchy / error-robustness                 │
│    结论写入 ui-review.json，evidence 须引用 ui-design.json   │
├─────────────────────────────────────────────────────────────┤
│  档3 结构完备性（schema·脚本）                               │
│    7 个 required 字段齐全                                    │
└─────────────────────────────────────────────────────────────┘

代码级客观项（间距4px/触控44px/对比度/focus/动效时长）归下游编码阶段：
  css-style-writer（间距4px已覆盖）/ code-quality-guard
  本 skill 设计阶段无代码可扫，不重复
```

---

## review 6 项（设计决策质量主观评审）

| id | 评审维度 | 理论依据 |
|---|---|---|
| requirement-understanding | 需求理解：用户目标清晰，区分目标/任务/功能 | 目标导向（About Face） |
| function-completeness | 功能完整：覆盖需求，无遗漏无冗余 | 五层模型·范围层 |
| layout-decision | 布局决策：≥2方案量化对比，符合费茨/希克/米勒 | HCI 七大定律 |
| interaction-design | 交互设计：消除鸿沟，微交互有反馈，渐进披露适度 | 诺曼七阶段+微交互+渐进披露 |
| information-hierarchy | 信息层级：P0-P3清晰，六大视觉手段 | 线框图信息层级 |
| error-robustness | 容错覆盖：四策略+四态 | 错误容错设计 |

🔴 ui-review.json 缺失/漏评/evidence空话/blocking fail = FAIL

---

## 中断与恢复（ADS 引擎驱动）

```
nut ads status $MANIFEST
→ 当前 anchor: ui-design | attempt: 0/5 | nextAction: 继续设计...
从断点继续 7 Phase，完成后 nut ads next
```

---

## 知识库索引（含交互设计理论）

| 文件 | 内容 | 加载方式 |
|---|---|---|
| `RULE.mdc` | 铁律0(ADS+三档) + 交互理论铁律 + 审美反模式 + 决策矩阵 | ADS reads → rulesInline |
| `knowledge/layouts.md` | 布局模式详解 | Phase 2 按需 |
| `knowledge/interactions.md` | 交互模式详解 | Phase 3 按需 |
| `knowledge/components.md` | 组件规范 | Phase 2-3 按需 |
| `knowledge/tables.md` / `forms.md` | 表格/表单设计 | 按需 |
| `knowledge/motion.md` | 动效系统 | Phase 3 按需 |
| `knowledge/page-templates.md` | 页面模板 | Phase 2 按需 |
| `knowledge/tokens.css` | CSS 变量 Token 系统 | 按需 |
| `knowledge/references.md` | 业界标杆案例 | 按需 |
| `knowledge/emotional-design.md` | 情感化设计 | Phase 3 按需 |
| `rules/quick-ref.md` | 快速参考卡 | 按需 |

交互设计理论（ui.md 11 份文档精华：HCI定律/诺曼/五层模型/WCAG/原子设计/目标导向/微交互/渐进披露/容错/信息层级）已提炼进 RULE.mdc 铁律 + 各 Phase 理论依据。

---

## 附录：设计决策框架（v2 保留参考）

> 以下为 v2 沉淀的决策工具，作为 7 Phase 的参考补充。
> 组件决策树 / 量化标准 / 快速决策参考（Tab vs Select / Modal vs Drawer / Card vs Table）见 RULE.mdc。
