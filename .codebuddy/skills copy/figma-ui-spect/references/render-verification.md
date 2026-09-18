# 渲染验证闭环 — Stage 3 详细流程（v20 新增）

> 本文件在 Stage 3 加载。v19 的 Stage 3 只做静态验证（re-read 确认 DSL 值写入），
> 这是"纸上谈兵"——确认代码写了某个值，但不确认渲染出来是否真的匹配设计。
> 本文件定义渲染验证闭环：构建验证 HTML → MCP 对比 → 量化相似度 → 迭代修复。
>
> 精准度提升核心：从"值写对了吗"升级为"渲染匹配吗"。

---

## 0. 两种验证模式

```
figma-ui-spect 场景是「改现有 TSX + SCSS」，渲染验证有两种模式：

模式 A（推荐·量化）：构建验证 HTML → MCP figma_compare_html_file → 量化相似度
  适用：组件 DOM 结构可从 TSX 推导（含 antd 组件的已知 DOM）
  产出：render.png + diff.png + similarity%（精确量化）

模式 B（兜底·半量化）：MCP figma_baseline_compare 获取 DSL 渲染 diff + 静态验证
  适用：组件含复杂 antd 内部 DOM（如 Cascader/Tree），难以构建验证 HTML
  产出：diff.png（DSL 渲染 vs 设计）+ 差异表闭合率（静态）

选择规则：
  ① 能构建验证 HTML → 模式 A
  ② 不能构建但 figma_baseline_compare 已产出 diff → 模式 B
  ③ 两者都不可 → 纯静态验证（re-read + 差异表 100% 闭合）
```

---

## 1. 模式 A：构建验证 HTML

### 1.1 验证 HTML 构建流程

```
Stage 2 修复完 SCSS 后，构建 verify-{N}.html：

① 从 Stage 1.2 代码元素枚举表，提取组件 DOM 结构
   - TSX 中的 JSX 元素层级 → HTML 标签层级
   - className → class 属性
   - 内联 style → style 属性

② 应用修复后的 SCSS 值（Stage 2 产物）
   - 把 .module.scss 中的样式值内联到 HTML style
   - antd 组件用 :global 覆盖的样式 → 内联到对应 .ant-xxx 选择器

③ antd 组件 DOM 近似（已知结构）
   <Modal> → .ant-modal-content > .ant-modal-header/body/footer
   <Input> → .ant-input
   <Select> → .ant-select-selector > .ant-select-selection-item
   <Form.Item> → .ant-form-item > .ant-form-item-label + .ant-form-item-control
   <Button> → .ant-btn
   <Cascader> → 同 Select 结构
   <TextArea> → .ant-input（textarea 变体）

④ 图标处理
   - 内联 SVG 组件 → 直接嵌入 SVG path（fill="currentColor"）
   - figma CDN URL → <img src="{url}">（验证用，不交付）
   - antd 图标 → 替换为 Figma SVG（Stage 2 已处理）

⑤ 画布尺寸 = origin-dsl.json metadata.width × height
   body { margin:0 }，最外层容器 width/height = 画布尺寸
```

### 1.2 MCP 渲染对比

```
构建 verify-{N}.html 后：

MCP figma-trimly:figma_compare_html_file
  params: {
    url: "<Figma URL，从 origin-dsl.json metadata.url>",
    htmlFilePath: "<verify-{N}.html 绝对路径>",
    outDir: "<临时目录>",
    scale: 1,
    dslFilePath: "<origin-dsl.json 绝对路径>"  ← 启用文字遮罩，排除字体抗锯齿差异
  }
  产出：
    render.png  ← 验证 HTML 的渲染图
    diff.png    ← 与 Figma 原图的差异图（红色=差异区域）
    similarity  ← 量化相似度（0-100%）
```

### 1.3 diff 图分析

```
read_file diff.png → 识别差异区域类型：

| 差异区域特征 | 原因 | 修复方向 |
|-------------|------|---------|
| 大块矩形红区 | 元素位置整体偏移 | 查 gap/padding/margin 是否 = DSL |
| 小块红区在边缘 | 边框/圆角/阴影差异 | 查 border/radius/box-shadow |
| 文字位置红区 | 文字偏移 | 查 line-height/text-align/padding |
| 颜色深浅红区 | 颜色值差异 | 查 background/color 是否 = DSL rgba→hex |
| 图标周围红区 | 图标尺寸/位置 | 查 img width/height/left/top + overflow:hidden |
| 整体泛红 | 画布尺寸不对 | 查最外层容器 width/height = metadata |

⚠️ 字体渲染差异（无法修复，标注为已知偏差）：
  - 系统无 PingFang SC 用 Microsoft YaHei → 反走样不同
  - 文字位置精准但有 1-2px 模糊差异 → 字体度量差异，非布局问题
  - 此类差异不阻塞，标注后继续其他区域
```

---

## 2. 量化验收标准

```
模式 A（量化）：
  similarity ≥ 95% → ✅ 达标，进入交付
  90% ≤ similarity < 95% → ⚠️ 接近，分析 Top 3 差异区域迭代
  similarity < 90% → ❌ 未达标，重点排查布局/尺寸

模式 B（半量化）：
  diff 区域面积 < 5% 且差异表 ❌ 行 100% 闭合 → ✅ 达标
  diff 区域面积 < 5% 但有未闭合 ❌ 行 → 继续修复
  diff 区域面积 ≥ 5% → 重点排查

模式 C（纯静态）：
  差异表 ❌ 行 100% 闭合 + 反向映射 ⚠️ 行 100% 处理 → ✅ 达标
  注意：纯静态无法发现"值写对但渲染错"的问题，优先用模式 A/B
```

---

## 3. 无效迭代检测（🔴 防止空耗）

```
对同一区域连续修改 2 次后，检查相似度/diff 变化：

  第 1 次修改区域 A → 验证 → 记录 similarity_1（或 diff_area_1）
  第 2 次修改区域 A → 验证 → 记录 similarity_2（或 diff_area_2）

  if |similarity_1 - similarity_2| < 0.5% → 判定无效迭代
    → 立即停止该区域修改
    → 转向其他差异区域
    → 或判定为"字体渲染差异，代码层无法修复"，标注后跳过

常见无效迭代模式（必须避免）：
  ✗ 反复调整文字 line-height / font-size（系统字体度量不同，无法精确匹配）
  ✗ 反复调整 1-2px 的 padding/margin（差异在噪声范围内）
  ✗ 反复调整高亮 rects 的 y 坐标（字体替换导致，无法修复）

最大迭代轮次：5 轮
  第 5 轮仍未达标 → 终止，提示用户手动检查剩余差异
```

---

## 4. 迭代修复流程

```
每次迭代（最多 5 轮）：

  ① 识别 Top 3 差异区域（从 diff.png 红区面积排序）
  ② 针对性 replace_in_file 修复（对照 DSL + 技巧决策树）
  ③ 重新构建 verify-{N+1}.html（仅更新修改部分）
  ④ MCP figma_compare_html_file 重新对比
  ⑤ 记录 similarity 变化，检测无效迭代
  ⑥ 更新迭代记录

迭代记录格式：
  轮次 │ 修改区域      │ similarity 变化      │ 判定
  1    │ 标题栏+按钮区  │ 88% → 93%           │ 继续其他区域
  2    │ 表单控件       │ 93% → 95.2%         │ ✅ 达标
  3    │ 字体微调       │ 95.2% → 95.3%       │ ⚠️ 无效迭代，终止
```

---

## 5. antd 组件 DOM 速查（构建验证 HTML 用）

```
Modal:
  .ant-modal-content
    ├ .ant-modal-header > .ant-modal-title
    ├ .ant-modal-body
    └ .ant-modal-footer
  .ant-modal-close > .ant-modal-close-x

Input:
  .ant-input（或 .ant-input-affix-wrapper > .ant-input）

Input.TextArea:
  textarea.ant-input

Select / Cascader:
  .ant-select
    └ .ant-select-selector
        ├ .ant-select-selection-item（选中项，可多选时多个）
        └ .ant-select-selection-placeholder
    └ .ant-select-arrow

Form.Item:
  .ant-form-item
    ├ .ant-form-item-label > label
    └ .ant-form-item-control > .ant-form-item-control-input

Button:
  .ant-btn（.ant-btn-primary / .ant-btn-default）

Tag:
  .ant-tag

Switch:
  .ant-switch > .ant-switch-handle

Checkbox:
  .ant-checkbox-wrapper > .ant-checkbox > .ant-checkbox-inner

Radio:
  .ant-radio-wrapper > .ant-radio > .ant-radio-inner

Tabs:
  .ant-tabs
    ├ .ant-tabs-nav > .ant-tabs-tab（多个）
    └ .ant-tabs-content > .ant-tabs-tabpane

Tooltip:
  .ant-tooltip-inner

Table:
  .ant-table
    ├ .ant-table-thead > tr > th
    └ .ant-table-tbody > tr > td
```

---

## 6. 验证 HTML 模板

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; }
    * { box-sizing: border-box; }
    /* 字体降级（验证用，与项目一致） */
    body { font-family: "PingFang SC", "Microsoft YaHei", -apple-system, sans-serif; }
    /* antd 基础重置（验证用） */
    .ant-btn { cursor: pointer; border: 1px solid; }
    .ant-input { border: 1px solid; }
    /* Stage 2 修复后的样式值内联至此 */
    /* :global 覆盖的 antd 样式转为此处普通选择器 */
  </style>
</head>
<body>
  <!-- 最外层容器：width/height = origin-dsl.json metadata -->
  <div style="width:{W}px; height:{H}px; position:relative; overflow:hidden">
    <!-- 组件 DOM 结构（从 TSX 推导 + antd DOM 速查） -->
    <!-- 应用修复后的 SCSS 值 -->
  </div>
</body>
</html>
```

---

## 7. 模式选择决策

```
Stage 3 开始时判断用哪种模式：

能构建验证 HTML？
  ├ 是 → 组件 DOM 可推导（Modal/Form/Input/Select/Button/Tag 等）
  │      → 模式 A：构建 verify-{N}.html → figma_compare_html_file
  │      → 量化相似度，≥95% 达标
  │
  └ 否 → 组件含复杂内部 DOM（Tree/Cascader 级联/Transfer/自定义渲染）
         → 模式 B：依赖 figma_baseline_compare 的 diff + 静态差异表闭合率
         → diff 面积 <5% + 差异表 100% 闭合 达标

优先级：模式 A > 模式 B > 纯静态
原因：量化 > 半量化 > 无量化
```
