# 07 — 反模式完整清单

> 来源：taste-skill §4 + redesign-skill + frontend-design + frontend-ui-engineering

## 生成前必查（Shipgate）

```
□ 硬编码色值 → 用 CSS 变量
□ 表格全文居中 → 左对齐
□ 卡片阴影过重 → ≤ shadow-sm
□ 缺少 loading / empty / error 三态
□ 未考虑四主题适配
□ 未考虑 hover / focus / disabled 态
□ Submit 后才校验 → on-blur 校验
□ 操作反馈 > 300ms
```

## 色彩反模式

| 反模式 | 修复 |
|--------|------|
| AI紫色/蓝色发光渐变 | 中性底 + 单一想好的 accent |
| 纯黑 `#000000` 背景 | 偏黑、深炭色、或染色暗色 |
| 过饱和 accent 色 | 饱和度 ≤ 80% |
| 多于 1 个 accent 色 | 选一个，删掉其余 |
| 混用暖灰和冷灰 | 坚持一个灰系 |
| 奢华消费固定色板 | 用轮换替代色板 |
| 轻模式页中插入暗色 section | 整页统一主题，或全暗或全亮 |

## 字体反模式

| 反模式 | 修复 |
|--------|------|
| Inter 作为默认 | Geist、Outfit、Cabinet Grotesk、Satoshi |
| 每个项目用衬线体 | 极少数例外，见03-typography |
| Fraunces / Instrument_Serif 作为默认 | 明确禁止 |
| 在无衬线标题中插入衬线词 | 同字体斜体/粗体强调 |
| 每个 section 标题都加 eyebrow | 最多每3 section 1个 |
| 所有标题 Title Case | 用句子大小写 |

## 布局反模式

| 反模式 | 修复 |
|--------|------|
| 一切居中对称 | 打破对称 |
| 三个等高卡片 = 特性行 | 2列 zigzag/非对称网格/横向滚动 |
| `h-screen` 全屏 section | `min-h-[100dvh]` |
| 复杂 flexbox 百分比数学 | CSS Grid |
| "左大标题 + 右小段落" 分头 | 垂直堆叠 |
| 交替 zigzag 连续 > 2次 | 插入全宽 section/bento 打断 |
| 卡片到处都是 | 仅 elevation 传达层级时用 |
| Bento 网格全是白底文字格 | 至少 2-3 格有真实视觉资产 |
| 暗色 section 插入亮色页中 | 统一主题 |

## 交互反模式

| 反模式 | 修复 |
|--------|------|
| 纯图标按钮无标签 | 加 aria-label |
| 移除焦点环 | 保留可见焦点 |
| 通用圆形 spinner | 骨架屏 |
| `window.alert()` 错误 | 内联错误信息 |
| 0ms 状态切换 | 150-300ms 过渡 |
| 动画 `width/height/top/left` | `transform` + `opacity` |
| 动效装饰性大于功能性 | 每个动画有明确原因 |

## 内容反模式

| 反模式 | 修复 |
|--------|------|
| "Elevate"/"Seamless"/"Unleash"/"Next-Gen" | 通用禁止词 |
| Lorem Ipsum | 写真实草稿文案 |
| 假精确数字 `99.99%` | 有机带小数的数据 `47.2%` |
| 感叹号在成功消息中 | 去掉，自信不喧哗 |
| "Oops!" 错误消息 | "连接失败。请重试。" |
| 被动语态 | 主动语态 |
| 高射炮图标 = launch | 不常见的隐喻替代 |
| 所有卡片 border+shadow+白底 | 去掉边框，或只用背景色 |

## 代码质量反模式

| 反模式 | 修复 |
|--------|------|
| Div soup | 语义化 HTML |
| `z-index: 9999` | 建立干净的 z-index 层级 |
| 行内样式 + CSS 类混合 | 统一到样式系统 |
| 硬编码 px 宽度 | 相对单位 rem/%/max-width |
| 缺少 alt 文本 | 描述图片内容 |
| 注释掉的死代码 | 发布前删除 |
| 导入不存在于 package.json | 检查依赖 |
