# 03 — 字体与排版

> 来源：taste-skill §4.1 + frontend-design + redesign-skill

## 字体选择规则

### 默认禁止
- **Inter 不作为默认**。用 Geist、Outfit、Cabinet Grotesk、Satoshi 替代
- Inter 仅在接受 "标准 / Linear风 / 公共部门" brief 时可用

### 衬线字体极度克制
- **衬线不作为任何项目的默认字体**
- 仅当以下条件之一成立时可用：
  - brief 明确命名了某个衬线体
  - 审美族真正是 editorial / 奢侈品 / 出版物 / 复古风
- **明确禁止的默认衬线**：Fraunces、Instrument_Serif

### 推荐配对
| 标题 | 正文 | 场景 |
|------|------|------|
| Geist | Geist Mono | 现代 SaaS |
| Satoshi | JetBrains Mono | 开发者工具 |
| Cabinet Grotesk | Inter Tight | 品牌/代理 |
| GT America | IBM Plex Mono | 企业级 |

### 强调规则
在标题中强调某个词时，用同一字体的 **斜体或粗体**，不要在无衬线标题中插入衬线词（反之亦然）。混合家族强调 = 业余。

---

## 字号层级

| 层级 | Size | Weight | 用途 |
|------|------|--------|------|
| L1 | 18px | 600 | 页面标题 |
| L2 | 16px | 600 | 卡片标题 |
| L3 | 14px | 400 | 正文/表格 |
| Display | text-4xl md:text-6xl | — | Hero 头条 |
| Body | text-base | — | 正文 |

## 排版规则

1. **斜体下行保护**：斜体标题中的 `y g j p q` 会被 `leading-none` 裁剪，改用 `leading-[1.1]` + `pb-1`
2. **行宽**：正文 65-75 字符/行
3. **行高**：正文 1.5-1.75
4. **孤词修复**：`text-wrap: balance` 或 `text-wrap: pretty`
5. **数字表格**：启用 `font-variant-numeric: tabular-nums`
6. **Hero 字号纪律**：头条 ≤ 6 词用 `text-5xl~6xl`，头条 > 6 词用 `text-4xl~5xl`

## AI模板化排版辨识

| 问题 | 修复 |
|------|------|
| 全大写子标题到处都是 | 尝试小写斜体、句子大小写 |
| 只有 Regular(400) + Bold(700) | 引入 Medium(500)、SemiBold(600) |
| 每个section标题上都加eyebrow | 最多每3个section用1个eyebrow |
| 孤词悬在最后一行 | `text-wrap: balance` |
