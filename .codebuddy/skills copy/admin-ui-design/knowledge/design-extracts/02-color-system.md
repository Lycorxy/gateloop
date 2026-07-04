# 02 — 色彩系统

> 来源：impeccable DESIGN.md + taste-skill §4.2 + frontend-design + admin RULE.mdc

## 色彩铁律

### 一页一个强调色
- 最大 1 个强调色。饱和度默认 < 80%
- 语义色（红/橙/绿）仅用于状态，不用于装饰
- 中性底色统一调性：Zinc / Slate / Stone，不同时混用暖灰和冷灰

### 禁止AI默认色板
- ❌ AI紫色/蓝色发光渐变
- ❌ 奢华消费的固定色板：暖米色/奶油 (#f5f1ea族) + 黄铜 (#b08947) + 浓缩咖啡 (#1a1714)
- ❌ 纯黑 background + 酸绿/朱红 accent
- ❌ 宽幅报纸式布局黑+白

### 色彩锁定规则
一旦选定强调色，整页统一使用。暖灰页面不会在section 7突然出现蓝色CTA。粉色 accent 页面不会在footer变成蓝绿status badge。

---

## 完整Token色板（PC端管理系统用）

```scss
/* 中性色（禁止硬编码，必须用变量） */
--neutral-01: #ffffff;   /* 卡片 */
--neutral-02: #f5f5f5;   /* 页面底色 */
--neutral-03: #ebebeb;   /* 分割线 */
--neutral-04: #e0e0e0;   /* 输入框边框 */
--neutral-06: #b8b8b8;   /* placeholder */
--neutral-08: #525252;   /* 辅助文字 */
--neutral-09: #2b2b2b;   /* 正文 */
--neutral-10: #131315;   /* 标题 */

/* 品牌蓝（唯一强调色）*/
--blue-01: #f5f8ff;   /* hover 底色 */
--blue-07: #1e67fa;   /* 主色/主按钮 */

/* 语义色（仅3种，仅状态用）*/
--red-07:   #e52e2e;   /* 危险 */
--orange-07:#fa820a;   /* 警告 */
--green-07: #15ad3d;   /* 成功 */
```

## 奢华消费色板轮换

禁止连续两个项目使用相同色板。可选替代方案：

| 色板名 | 组合 |
|--------|------|
| 冷奢华 | silver-grey + chrome + smoke |
| 森林 | deep green + bone + amber |
| 黑棕 | true off-black + warm tan |
| 钴蓝奶油 | saturated blue + cream |
| 赤陶石板 | warm rust + cool grey |
| 橄榄砖红 | muted olive + brick-red |
| 纯单色+亮色 | off-white + off-black + 一个亮 accent |

## Impeccable Kinpaku 系统（参考）

完整 OKLCH 色彩体系示例：
- 金箔主色 `oklch(84% 0.19 80.46)` — 主要 accent
- 铜绿副色 `oklch(70% 0.12 188)` — 状态/constrast
- 漆黑 `oklch(7% 0.006 95)` — 页面底色
- 香槟 `oklch(91% 0 0)` — 标题
- 暖文 `oklch(88% 0 0)` — 正文

**只能使用 OKLCH** 声明颜色，禁止 hex 硬编码。
