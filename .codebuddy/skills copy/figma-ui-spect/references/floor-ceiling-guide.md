# 脚本（地板）vs 模型（天花板）分工判定表 — figma-ui-spect

> 本 skill 的质量要求按 5 类归属配置 verify 门禁。核心哲学：脚本划地板（过程完备性 + 量化达标，exit code 不可协商），模型冲天花板（语义匹配 + 技巧选择，自由创造）。

## 判定流程

```
Q1: 违反了是否有唯一对错？
  是 → 类型 A（收敛型·脚本 exit code）
  否 → Q2
Q2: 是否能拆成可度量的客观指标？
  能 → 类型 C（度量回灌）
  否 → Q3
Q3: 是否影响"思考完备性"（该做的表/步是否全做了）？
  是 → 类型 B（完备性·schema 字段存在校验）
  否 → Q4
Q4: 是否有可归类的质量维度（能列 checklist 逐条评）？
  是 → 类型 D（主观可评审·review.model）
  否 → 类型 E（纯审美·不进 verify）
```

## 5 类归属速查表

| 质量要求 | 类型 | 归属 | verify 行为 | 落地 anchor |
|---|---|---|---|---|
| SCSS 类名 ↔ TSX 引用一致（无悬空类名） | A 收敛型 | 脚本 custom（`style-crosscheck`） | FAIL | fix |
| SCSS 通过 stylelint（无语法错误） | A 收敛型 | 脚本 stylelint | FAIL | fix |
| 映射报告含全部 6 张表（枚举/正向/反向/差异/策略/技巧） | B 完备性 | 脚本 schema required | FAIL（缺表） | mapping |
| 反向映射含 ⚠️ 行（代码有 DSL 无的元素） | B 完备性 | 脚本 schema（reverseMapping 非空） | FAIL | mapping |
| 属性差异表含 ❌ 与 ⚠️ 行 | B 完备性 | 脚本 schema（attributeDiff 非空） | FAIL | mapping |
| 渲染报告含 mode + result + passed | B 完备性 | 脚本 schema required | FAIL | verify |
| similarity ≥ 95%（模式 A） | A 收敛型 | 脚本 custom（`render-acceptance`） | FAIL | verify |
| diff 面积 < 5% + 差异表 100% 闭合（模式 B） | A 收敛型 | 脚本 custom | FAIL | verify |
| 差异表 ❌ 行 100% 闭合 + ⚠️ 行 100% 处理（模式 C） | A 收敛型 | 脚本 custom | FAIL | verify |
| DSL↔代码语义匹配准确性 | D 主观可评审 | review.model（mapping-accuracy） | blocking fail | mapping |
| CSS 布局技巧选择是否最优 | D 主观可评审 | review.model（technique-choice） | blocking fail | mapping |
| 视觉效果是否完全还原设计意图 | E 纯审美 | MCP 量化 similarity（非 review） | 不进 verify | verify |

## 各类型说明

### 类型 A — 收敛型（脚本 exit code）

**特征**：违反了就是错，没有"更好"。本 skill 的收敛项主要是「量化达标」和「一致性」。

- SCSS 类名在 TSX 中无引用（或反之）→ `style-crosscheck` FAIL
- SCSS 语法错误 → `stylelint` FAIL
- similarity < 95%（模式 A）→ `render-acceptance` FAIL
- 差异表未 100% 闭合（模式 C）→ `render-acceptance` FAIL

**逃生口**：无。量化达标线（95%）不可协商；若为字体渲染差异导致无法达标，走「无效迭代检测」终止并标注，不得自降标准。

### 类型 B — 完备性（脚本 schema 字段存在校验）

**特征**：脚本不管映射对不对，只管"该做的表全做了没"。

- mapping-report 必须含 6 张表：`elementEnumeration` / `forwardMapping` / `reverseMapping` / `attributeDiff` / `containerStrategy` / `cssTechniqueDiagnosis`
- `reverseMapping` 必须非空（反向映射不可省略，含 ⚠️ 行）
- `attributeDiff` 必须非空（含 ❌ 与 ⚠️ 行）
- render-report 必须含 `mode` / `result` / `passed`

**关键**：模型可以自由匹配和诊断，但"6 张表必须全产出""反向映射不可省略"是收敛的。脚本卡的是"过程完备性"，不是"映射质量"。

### 类型 C — 度量回灌

本 skill 暂无纯度量回灌项。所有量化指标（similarity/diff 面积/闭合率）都直接走类型 A 收敛判定（有明确达标线）。

### 类型 D — 主观可评审（review.model）★

**特征**：主观判断，但有可归类维度。本 skill 两个主观维度：

1. **mapping-accuracy**：DSL↔代码语义匹配是否准确（文本/结构/尺寸/className 五级优先是否选对、⚠️ 行处理是否合理）
2. **technique-choice**：CSS 布局技巧选择是否最优（T1-T8/T25 决策树是否按序命中即停、是否违反 T25 inline-tag 铁律）

**anchor.config 配置**（mapping anchor 可选增强）：
```json
"review": {
  "output": ".specflow/context/mapping-review.json",
  "requireEvidence": true,
  "checklist": [
    { "id": "mapping-accuracy", "rule": "DSL↔代码五级优先匹配准确，⚠️ 行已查 Figma/标记 EXTRA-KEEP/询问用户", "mode": "model" },
    { "id": "technique-choice", "rule": "CSS 技巧按决策树选最优，T25 场景用 float:left+文字流而非 flex-row", "mode": "model" }
  ]
}
```

**为什么不能只靠模型自评**：模型可能"我觉得匹配对了"就过，但 T25 inline-tag 场景用 flex-row 是用户反馈过的铁律违规。review.model 强制逐条评 + 带证据（行号/className 引用）+ fail 必改。

### 类型 E — 纯审美（不进 verify）

**特征**：视觉效果是否完全还原设计意图。本 skill 不用 review（无法列主观标准），而是用 MCP 量化 similarity 替代——这是比 review 更强的客观判定。因此视觉还原度实际上走类型 A（similarity ≥ 95%），而非类型 E。

真正的类型 E（纯直觉、无法度量）在本 skill 中不存在——所有视觉差异都被 similarity 量化了。

## 反模式

| 反模式 | 错在哪 | 正确做法 |
|---|---|---|
| 把"映射是否准确"写成 exit code | 语义匹配是主观的，脚本判不了 | 类型 D review.model，模型评+脚本卡证据形式 |
| 把"技巧选择"交给脚本 judge | 决策树有灵活性，脚本无法判定"最优" | 类型 D review.model |
| 不产出反向映射表就 PASS | 反向映射是完备性收敛项 | 类型 B schema required（reverseMapping 非空） |
| similarity 94% 就输出"达标" | 量化达标线不可协商 | 类型 A custom FAIL，继续迭代 |
| 字体渲染差异反复迭代空耗 | 无效迭代未检测 | 类型 A custom + 无效迭代检测（连续 2 次 <0.5% 停止） |
| 全收敛型硬配 review | 本 skill 有主观维度（匹配/技巧），配 review 合理 | 保留 2 项 review，不过度膨胀 |
