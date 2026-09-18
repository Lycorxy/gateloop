# 业界标杆分析与参考

---

## 一、Linear — 速度与精度（工具型产品标杆）

### 核心设计哲学

| 维度 | 做法 | 可借鉴点 |
|------|------|---------|
| **速度** | 所有交互 < 100ms，Optimistic UI | 先更新再同步 |
| **键盘优先** | Cmd+K 全局命令面板 | 每个操作有快捷键 |
| **信息密度** | Issue 列表每行含 8+ 字段但不拥挤 | 次要信息灰化缩小 |
| **微交互** | Hover 精确到位，Drag 有物理感 | Spring 动效 |
| **深色优先** | Dark 为默认主题 | 护眼且显高级 |
| **无装饰** | 0 个无用元素 | 每像素都有功能 |

### Linear 的视觉密度秘诀

```
1. 同一行信息用"字重+颜色+大小"三维区分
   标题: 14px/600/neutral-09
   元数据: 12px/400/neutral-05
   
2. 状态用 8px 彩色圆点（不是 Badge），省空间又清晰

3. Hover 时行底出现操作栏（非始终显示），保持行的视觉干净

4. 列表 stagger 入场（每项延迟 20ms），营造"构建感"
```

### Karri Saarinen 10 条规则

1. **Craft is in the details** — 细节决定品质
2. **Speed is a feature** — 速度就是功能
3. **Reduce, don't add** — 减少而非增加
4. **Consistency over creativity** — 一致性优于创意
5. **Make it feel native** — 让它感觉像原生
6. **Keyboard first** — 键盘优先
7. **Dark mode by default** — 默认深色模式
8. **Motion with purpose** — 动效有目的
9. **Density is good** — 密度是好事
10. **Ship it, then iterate** — 先发布再迭代

---

## 二、Vercel — 克制与自信

| 维度 | 做法 | 可借鉴点 |
|------|------|---------|
| **动效** | 150-250ms ease-out，无弹簧 | 功能信号，非表演 |
| **留白** | 大量负空间，内容聚焦 | 不拥挤但不浪费 |
| **色彩** | 近黑白 + 单一强调色 | 极简有品牌感 |
| **反馈** | 状态变化直接更新，无庆祝动画 | 自信 |
| **Typography** | Geist Sans/Mono 品牌字体 | 字体即品牌 |

### Vercel 的"安静设计"哲学

```
"安静到达，安静离开"

- 弹出层进入：ease-decelerate（减速，安静到位）
- 弹出层退出：ease-accelerate（加速，快速消失）
- 无过冲（overshoot），无弹簧（spring）
- 时长 150-250ms
- 每个动效都是功能信号，不是表演
- 色彩极度克制：只用黑白灰 + 1 个蓝色
```

---

## 三、Stripe — 交互密度的艺术

| 维度 | 做法 | 可借鉴点 |
|------|------|---------|
| **表格** | 内联编辑、批量操作、列宽可调 | 高效数据处理 |
| **表单** | 实时校验、智能默认值、条件显示 | 低摩擦输入 |
| **导航** | 面包屑 + 侧栏 + Tab 三级联动 | 清晰定位 |
| **空状态** | 插画 + 引导文案 + CTA 按钮 | 友好引导 |
| **细节** | 复制按钮、格式化显示、tooltip | 开发者体验 |

---

## 四、Notion — 渐进式披露大师

| 维度 | 做法 | 可借鉴点 |
|------|------|---------|
| **灵活性** | 用户可自定义 Dashboard | 给用户控制权 |
| **渐进式** | 极简初始态 → 按需展开 | 降低入门门槛 |
| **块编辑** | 一切皆块，拖拽组合 | 模块化思维 |
| **命令面板** | / 和 Cmd+K | 键盘优先 |
| **hover 操作** | 行 hover 出 ⋮ 和 + 按钮 | 界面干净 |

---

## 五、现代 UI 趋势（2025-2026）

### 值得采用的趋势

| 趋势 | 说明 | 适用场景 |
|------|------|---------|
| **Bento Grid** | 不等分网格布局 | Dashboard、Landing |
| **Glassmorphism 2.0** | 轻度毛玻璃（仅 overlay） | 弹层/固定栏 |
| **Micro-interactions** | 有目的的微交互 | 状态切换/hover |
| **Variable fonts** | 字重连续变化 | 强调/动画 |
| **Skeleton-first** | 骨架屏优先于 Loading | 所有异步内容 |
| **Command Palette** | Cmd+K 全局搜索 | 专业工具 |

### 不建议采用的趋势

| 趋势 | 问题 | 替代方案 |
|------|------|---------|
| 全局 Glassmorphism | 性能差+可读性差 | 仅弹层用 |
| Neumorphism | 难区分可点击元素 | 传统 shadow 层级 |
| 暗色渐变 mesh | 2022 审美过时 | 中性色 + 主色点缀 |
| 过度 3D 元素 | 分散注意力 | 扁平+微阴影 |
| 花哨的滚动动画 | 降低效率 | 仅首屏/营销页 |

---

## 六、设计系统参考

| 设计系统 | 适用风格 | 核心特征 |
|---------|---------|---------|
| Ant Design | 企业级B端 | 确定性、意义感、生长性、自然 |
| Arco Design | 字节系B端 | 清晰、一致、韵律、开放 |
| Semi Design | 抖音企业 | 设计即服务、模块化 |
| Radix/Shadcn | 极简开发工具 | 无样式基础+可组合 |
| Geist (Vercel) | 克制极简 | 黑白+功能信号 |
| Carbon (IBM) | 企业严肃 | 可靠、可及、一致 |

---

## 七、评分参考（对标）

用这个表格给自己的设计打分：

| 维度 | Linear 水准 | 我的设计 | 差距分析 |
|------|-----------|---------|---------|
| 信息密度 | 9/10 | ?/10 | |
| 视觉层次 | 9/10 | ?/10 | |
| 操作效率 | 10/10 | ?/10 | |
| 动效品质 | 9/10 | ?/10 | |
| 一致性 | 10/10 | ?/10 | |
| 色彩克制 | 9/10 | ?/10 | |
| 空态处理 | 8/10 | ?/10 | |
| 图标系统 | 9/10 | ?/10 | 是否使用专业 SVG 图标而非 emoji |
| 暗色舒适度 | 9/10 | ?/10 | 背景是否暖灰(非纯黑)，色彩是否透明度叠加 |

---

## 八、Ant Design / Arco Design 暗色模式核心要点

### 1. 背景色：#141414 而非纯黑

```
❌ 错误：#000000 / #09090b（太冷太深，长时间使用疲劳）
✅ 正确：#141414（暖灰，Ant Design 默认暗色背景）
```

### 2. 主色 10 级色板（非单一色值）

Ant Design 的主色 `#1677ff` 在暗色 `#141414` 背景上生成 10 级色板：

| 色阶 | 暗色值 | 用途 |
|------|--------|------|
| 1 | `#111d2c` | 最深，主色背景 |
| 6 | `#177ddc` | 暗色主色（比浅色稍亮确保可读） |
| 10 | `#b7e3fa` | 最浅，暗色上的文字/图标 |

**关键规则**：暗色主色用色阶6但比浅色亮，因为暗背景需要更亮的色彩才能可读。

### 3. 透明度叠加规则

```
❌ 错误：语义色背景用纯色块（success-bg: #16230a）
✅ 正确：主色 + 15% 透明度（success-bg: rgba(73,170,25,0.15)）
```

透明度叠加让色彩与暗背景自然融合，不会出现突兀的色块。

### 4. 中性色阶反转但调整

暗色模式不是简单镜像中性色，而是：
- 层级差更小（暗色下相邻层级差异微妙）
- 边框用低透明度白色（`rgba(255,255,255,0.06)`）而非灰色

---

## 九、可直接复制的 CSS 代码片段

### 1. 状态呼吸灯（录制指示器）

```css
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--neutral-05);
}
.status-dot.active {
  background: var(--error);
  animation: status-pulse 1.4s var(--ease-standard) infinite;
}
@keyframes status-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.4; transform: scale(1.15); }
}
```

### 2. 列表 Stagger 入场动画

```css
.list-item {
  animation: stagger-in 250ms var(--ease-decelerate) both;
}
@keyframes stagger-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
/* JS: style={{ animationDelay: `${Math.min(i * 18, 180)}ms` }} */
```

### 3. Focus Ring（输入框聚焦）

```css
.input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(23, 125, 220, 0.15);
  outline: none;
}
```

### 4. Hover 浮现操作（Notion 风格）

```css
.row-actions {
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-standard);
}
.row:hover .row-actions {
  opacity: 1;
}
```

### 5. Segmented Control（胶囊导航）

```css
.seg {
  display: inline-flex;
  background: var(--neutral-02);
  border-radius: 6px;
  padding: 2px;
}
.seg-btn {
  padding: 4px 14px;
  border: none;
  background: none;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--neutral-06);
  cursor: pointer;
  transition: all 150ms var(--ease-standard);
}
.seg-btn:hover { color: var(--neutral-08); }
.seg-btn.active {
  background: var(--neutral-03);
  color: var(--neutral-08);
  font-weight: 600;
}
```

### 6. HTTP 方法标签

```css
.method {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  line-height: 15px;
}
.method.GET    { background: rgba(23,125,220,0.12); color: #177ddc; }
.method.POST   { background: rgba(73,170,25,0.12);  color: #49aa19; }
.method.PUT    { background: rgba(216,150,20,0.12); color: #d89614; }
.method.DELETE { background: rgba(220,68,70,0.12);  color: #dc4446; }
.method.PATCH  { background: rgba(179,127,235,0.12);color: #b37feb; }
```

### 7. 纯图标按钮（28×28px）

```css
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: var(--neutral-06);
  transition: background 150ms, color 150ms;
}
.icon-btn:hover {
  background: var(--neutral-02);
  color: var(--neutral-08);
}
.icon-btn:active { background: var(--neutral-03); }
.icon-btn svg { pointer-events: none; }
```

### 8. JSON 查看器层级线

```css
.jv-children {
  margin-left: 8px;
  border-left: 1px solid var(--neutral-03);
  padding-left: 12px;
}
.jv-key   { color: #177ddc; font-weight: 600; }
.jv-str   { color: #95de64; }
.jv-num   { color: #ffc53d; }
.jv-bool  { color: #ff7875; font-weight: 600; }
.jv-null  { color: #8c8c8c; }
```
