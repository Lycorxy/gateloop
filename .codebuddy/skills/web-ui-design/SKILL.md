---
name: web-ui-design
description: >
  Web 端 UI/交互/视觉设计（含管理系统/B端/C端/工具型产品）。
  覆盖：需求理解→功能思考→信息架构→布局决策→交互设计→线框图→视觉设计（设计概念/
  色彩系统/字体系统/背景质感/签名元素）→容错→设计检测。
  融入 HCI 七定律/诺曼七阶段/目标导向/微交互/渐进披露/错误容错/信息层级理论
  + 视觉设计系统（60-30-10/字族配对/背景层次/标志性记忆点）。
  由 GateLoop harness 驱动，引擎 schema+custom+review 三层验证。
  触发词：设计页面、设计布局、设计组件、优化UI、美化界面、设计面板、
  设计表格/表单/列表页、设计仪表盘、设计工具栏、设计弹窗、设计侧边栏、交互设计、
  配色方案、视觉风格。
  不要用于：纯后端开发、纯CSS编写、纯前端代码逻辑、纯技术架构。
version: 3.1.0
dependencies: []
conflict-with: [frontend-design]
allowed-tools: [read_file, write_file, replace_in_file, search_content, search_file, execute_command, list_dir]
max-token: 3000
---

# Web UI Design v3.1 — GateLoop Harness 驱动（需求→线框图→视觉系统）

> v3.1 核心变更：**新增 Phase 5 视觉设计**——修复"生成没有设计感、颜色/字体/背景不提就不加"的问题。
> visualDesign（设计概念+色彩系统+字体系统+背景质感+签名元素）进 schema+custom 强制完备：用户不提视觉要求也必须主动给出有主见的视觉系统；review 扩到 9 项（+3 视觉质量）。
> v3.0 核心变更：由 GateLoop harness 驱动，融入交互设计理论（HCI定律/诺曼/目标导向/微交互/渐进披露/容错/信息层级）。
> 引擎 schema 校验设计稿完备性 + custom 跑客观项脚本 + review 9 项设计质量主观评审。

## 🔧 环境前置：ai-ultra（执行前提，未装先装）

本 skill 靠 `nut gateloop` CLI 驱动（npm 包 `ai-ultra` 提供）。执行前必须确认：

```
1. 检测：npx nut --version 执行成功（exit 0）= 已安装
2. 未安装 → 先装（devDependency）：npm install ai-ultra --save-dev
   （pnpm: pnpm add -D ai-ultra；yarn: yarn add -D ai-ultra；裸目录先 npm init -y；禁 -g）
3. 验证：npx nut gateloop --help 能列出子命令 = 可用
4. ai-ultra 本仓库内：直接 node dist/cli/index.cjs gateloop ...（改过 src 先 npm run build），禁止再 npm 安装
```

## GateLoop Harness 驱动模式

```
传统模式（v2）                   GateLoop Harness 模式（v3）
──────────────                  ──────────────────────────
模型自觉执行 Phase 0-7    →     引擎状态机推进 ui-design anchor
模型自报"检测通过"        →     GateLoop verify schema+custom+review 判定
状态在模型脑子             →     anchor-state.json 引擎唯一写入
断线就丢                   →     nut gateloop status 随时恢复
```

### 启动流程

```bash
# manifest 路径 = 本 skill 目录下的 anchor.config.json（skill 可放任意位置，如 knote）
MANIFEST=<skillDir>/anchor.config.json
nut gateloop init $MANIFEST --task "设计用户列表页"
# 引擎返回 ui-design anchor 指令（rulesInline 已内联 RULE.mdc）
# 模型执行 8 Phase → 写 ui-design.json → nut gateloop next
# 引擎 schema + custom(check-ui-objective) + review(9项) 校验 → 通过推进/失败修复
```

### 模型只做三件事

1. **读指令** — rulesInline（已内联 RULE.mdc 铁律）+ 按需 read knowledge/
2. **执行 8 Phase** — 需求→功能→布局→交互→线框图→视觉→容错→检测
3. **推进** — 写 ui-design.json + emit + `nut gateloop next`，引擎三层验证

⚠️ **不要自己声称"设计完成"**，引擎会 schema+custom+review 校验，exit code 说了算。

---

## 8 Phase 流程（融入交互设计理论 + 视觉设计系统）

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
  不包含：色彩/图标风格/圆角/图片（归 Phase 5 视觉设计）

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

### Phase 5：视觉设计（v3.1 新增·设计感与视觉系统）

> 理论依据：视觉设计系统 — 概念先行 + 60-30-10 色彩法则 + 字族配对 + 背景层次 + 签名元素
> **用户没提颜色/字体/背景，也必须主动给出有主见的视觉系统——这是本 Phase 的存在意义**

```
第一步 设计概念（designConcept）——设计感的源头，禁止跳过：
  □ 3-5 个风格关键词（如：克制/编辑感/暖调/留白/锐利）
  □ mood 气质描述（一句话：这个页面应该让人感觉______）
  □ 参照系（对标产品/风格谱系，读 knowledge/visual-design.md 选型并给理由）
  ⚠️ 禁止"简洁现代大方"这类空话——要能指导具体视觉决策

第二步 色彩系统（palette）：
  □ primary 主色（色值 + 用途：CTA/选中/关键状态，占比 ≤5%）
  □ secondary/accent 辅助（数据可视化区分/悬停层次）
  □ neutral 中性色阶（50-900 至少 5 档：页面底/卡片/边框/主文字/次文字，占比 ≥80%）
  □ 语义色（success/warning/error/info）
  □ 深浅模式策略（是否支持 dark、如何切换）
  □ 选色方法：60-30-10 法则 + 色环关系（类比和谐/互补冲击）声明

第三步 字体系统（typography）：
  □ fontFamilies 字族配对（display 标题族 + body 正族，声明选型理由）
  □ scale 字号阶梯（≥5 级，1.2-1.25 modular scale，如 12/14/16/20/24/32）
  □ weights 字重对比（400/500/600/700 建立层级，不靠颜色单打）
  □ lineHeight 行高（正文 1.5-1.7，标题 1.2-1.3）

第四步 背景与质感（backgrounds）——禁止纯白/纯灰裸奔：
  □ page 页面背景策略（即使浅色也要有层次：微妙渐变/噪点/网格/几何装饰）
  □ card/section 分区背景（区分层级：底色差/边框/阴影至少其一）
  □ 质感手法按概念选（见 knowledge/visual-design.md 背景手法清单）

第五步 效果与签名（effects + signature）：
  □ effects：radius 圆角体系（统一档位）/ shadow 阴影体系（2-3 档）/ border 策略
  □ signature 签名元素（回答"这个设计的记忆点是什么"）：
    如：标志性品牌色斜切、独特空态插画、数字等宽字体强调、
    特定交互微动效、栏目编号系统——至少 1 个可感知的差异点

视觉反模式自检（命中任一即重做，见 RULE.mdc 审美反模式 10 条）：
  ✗ AI 紫渐变 / 深色网格+居中Hero / 三等高卡片 / 全局玻璃态
  ✗ Inter+slate 无特色 / 按钮全 primary / 过度阴影 / 等间距无节奏
  ✗ 无签名元素 / 纯灰底白卡片无层次
```

### Phase 6：容错 + 状态覆盖

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

### Phase 7：设计检测

```
7 项检测全过才产出（沿用 v2 + v3.1 视觉强化）：
  □ 布局合理性（P0首屏可见/层级≤3/网格对齐）
  □ 交互合理性（高频≤2步/反馈<100ms/误操作防护）
  □ 间距系统（4px网格/层级关系/亲密性）
  □ 视觉系统（色彩60-30-10/字族配对+阶梯/背景有层次非裸奔/圆角阴影统一）
  □ 设计感（概念能指导决策/签名元素可感知/规避10条审美反模式）
  □ 用户体验（5秒理解/F型扫描/7±2组/容错/对比度4.5:1）
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
  "visualDesign": {
    "designConcept": {
      "keywords": ["克制", "编辑感", "暖调"],
      "mood": "安静而有分量，像一本装帧讲究的杂志",
      "reference": "Linear 的克制 + 杂志排版的信息节奏"
    },
    "palette": {
      "primary": "#0F62FE（CTA/选中，≤5%面积）",
      "secondary": "#8A3FFC（数据可视化区分）",
      "neutral": "gray-50~900 五档（页面底/卡片/边框/主文字/次文字，≥80%面积）",
      "semantic": { "success": "...", "warning": "...", "error": "...", "info": "..." },
      "strategy": "60-30-10：中性底 60 / 次级面 30 / 主色 10；类比色环保和谐"
    },
    "typography": {
      "fontFamilies": { "display": "...（标题族+理由）", "body": "...（正族+理由）", "mono": "..." },
      "scale": "12/14/16/20/24/32（1.25 modular）",
      "weights": "400/500/600/700 建立层级",
      "lineHeight": "正文 1.6 / 标题 1.25"
    },
    "backgrounds": {
      "page": "米白底 + 极浅噪点纹理 + 顶部 2% 透明度主色渐变 wash",
      "card": "纯白卡片 + 1px 边框 + 第一档阴影（与页面底拉开层级）",
      "section": "深一档底色分区 + 64px 大留白"
    },
    "effects": { "radius": "4/8/16 三档", "shadow": "sm/md/lg 三档（克制使用）" },
    "signature": "栏目标题左侧 3px 主色竖条 + 序号等宽字体编号系统——低成本高辨识记忆点"
  },
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
🔴 视觉系统不完备（无设计概念/主色/中性色阶/字族/字号阶梯/页面背景/签名元素）= schema + custom FAIL
🔴 签名元素 < 8 字符（答不上"记忆点是什么"）= custom FAIL

---

## 三层验证分工（v3 核心）

```
┌─────────────────────────────────────────────────────────────┐
│  档1 客观完备性（custom 脚本·exit code·模型无法伪造）        │
│    check-ui-objective.mjs: 功能非空/导航≤9/方案≥2/           │
│    线框图≥50字/四态覆盖/目标非空/交互论证 +                  │
│    视觉系统完备（设计概念/主色/中性色/字族/字号阶梯/         │
│    页面背景/签名元素≥8字）——不提视觉要求也必须给            │
├─────────────────────────────────────────────────────────────┤
│  档2 设计质量（review.model·9项·四道门禁）                   │
│    决策质量 6 项：requirement-understanding /                │
│    function-completeness / layout-decision /                 │
│    interaction-design / information-hierarchy /              │
│    error-robustness                                         │
│    视觉质量 3 项：visual-system / design-distinctiveness /   │
│    visual-contrast-quality                                  │
│    结论写入 ui-review.json，evidence 须引用 ui-design.json   │
├─────────────────────────────────────────────────────────────┤
│  档3 结构完备性（schema·脚本）                               │
│    8 个 required 字段齐全（含 visualDesign）                 │
└─────────────────────────────────────────────────────────────┘

代码级客观项（间距4px/触控44px/动效时长）归下游编码阶段
（frontend-codegen code anchor 已覆盖），本 skill 设计阶段无代码可扫不重复。
视觉系统完备性(字段/长度)在本阶段卡死；色彩对比度(4.5:1)声明进
visual-contrast-quality 评审项，代码实现由下游 stylelint/WCAG 校验。
```

---

## review 9 项（设计质量主观评审：6 决策 + 3 视觉）

| id | 评审维度 | 理论依据 |
|---|---|---|
| requirement-understanding | 需求理解：用户目标清晰，区分目标/任务/功能 | 目标导向（About Face） |
| function-completeness | 功能完整：覆盖需求，无遗漏无冗余 | 五层模型·范围层 |
| layout-decision | 布局决策：≥2方案量化对比，符合费茨/希克/米勒 | HCI 七大定律 |
| interaction-design | 交互设计：消除鸿沟，微交互有反馈，渐进披露适度 | 诺曼七阶段+微交互+渐进披露 |
| information-hierarchy | 信息层级：P0-P3清晰，六大视觉手段 | 线框图信息层级 |
| error-robustness | 容错覆盖：四策略+四态 | 错误容错设计 |
| visual-system | 视觉系统完备且有主见：色彩60-30-10/字族配对/背景层次/效果统一成体系 | 视觉设计系统（v3.1） |
| design-distinctiveness | 设计感：概念清晰+签名元素可感知，与通用模板拉开差异，规避审美反模式10条 | 冯·雷斯托夫效应+情感化设计 |
| visual-contrast-quality | 视觉层次质量：对比/留白/节奏，WCAG AA 4.5:1，主色≤5%中性≥80% | WCAG+格式塔 |

🔴 ui-review.json 缺失/漏评/evidence空话/blocking fail = FAIL

---

## 中断与恢复（GateLoop 引擎驱动）

```
nut gateloop status $MANIFEST
→ 当前 anchor: ui-design | attempt: 0/5 | nextAction: 继续设计...
从断点继续 8 Phase，完成后 nut gateloop next
```

---

## 知识库索引（含交互设计理论）

| 文件 | 内容 | 加载方式 |
|---|---|---|
| `RULE.mdc` | 铁律0(GateLoop+三档) + 交互理论铁律 + 视觉设计铁律 + 审美反模式 + 决策矩阵 | GateLoop reads → rulesInline |
| `knowledge/visual-design.md` | 视觉设计速查：风格谱系/色彩理论/字族配对/背景手法/签名元素案例 | Phase 5 按需（★必读） |
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
