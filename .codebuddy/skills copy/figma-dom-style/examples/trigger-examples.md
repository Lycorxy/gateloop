# 触发示例

## ✅ 正向触发（应该加载本 skill）

### 1. 设计稿分析 + 布局规划
```
用户："帮我分析这个 figma 设计稿怎么布局"
用户："这个设计稿用什么方案实现比较好"
用户："帮我规划一下这个页面的布局"
用户："这些 absolute 节点能不能用 flex 替代"
用户："分析一下这个设计稿的组件划分"
```

### 2. DSL 还原优化
```
用户："优化这个 figma 页面的 DSL 还原"
用户："帮我把这个 Figma 设计稿转成 DOM+Style DSL"
用户："继续优化还原度到 95%"
用户："还原度不够，继续迭代"
用户："像素级对比，看看差在哪"
```

### 3. 已有代码优化（模式 B）
```
用户：[粘贴现有代码] + "对照 figma 设计稿优化"
用户："我的实现和设计稿差异在哪"
用户："帮我对比现有代码和设计稿的差异"
```

### 4. 中断恢复
```
用户："继续之前的还原任务"
（系统自动检测 checkpoint.json 存在 → 恢复）
```

---

## ❌ 反向触发（不应加载本 skill）

### 1. 单纯转换（不需要分析优化）
```
用户："帮我调 figma 的 MCP 工具获取 DSL"
→ 直接调 MCP，不走 skill 流程
```

### 2. 非 figma 对比
```
用户："对比这两张截图"
→ 直接用 compare_images 工具
```

### 3. 生成最终代码
```
用户："根据 DSL 生成 React 代码"
→ 交给 frontend-codegen
```

### 4. CSS 编写
```
用户："帮我写这个组件的 CSS"
→ 交给 css-style-writer
```

### 5. 架构设计
```
用户："设计前端架构"
→ 交给 frontend-design
```

---

## 🔄 流程示例

### 完整流程（模式 A，从零开始）

```
用户："分析这个 figma 设计稿并输出 DSL"
      Figma URL: https://www.figma.com/design/abc123/...?node-id=45-67

=== Step 0 ===
✅ [Step 0] 规则注入完成

=== Step 1 ===
📐 [Step 1] 基准材料就绪：.trimly/tmp/abc123_45-67/ | 模式: A

=== Step 2a ===
📏 [Step 2a] 画布 375×812 | 5 区域 | 23 文字 | 4 图片 | 交互: 2场景

=== Step 2b ===
🏗️ [Step 2b] 布局方案完成：
  骨架: flex-column | 3 区块 | 12 组件
  优化率: 89% 节点可从 absolute 转 flex/grid
  置信度: avg 0.94 | 实现分 4 阶段
  → layout-plan.json 已缓存

=== Step 3 ===
📝 [Step 3] 第 1 轮 DSL 已生成（布局: flex-column，18 class，5 交互节点）

=== Step 4 ===
📊 [Step 4] 第 1 轮: 92.3% | SSIM: 0.94

=== Step 5 ===
🔍 [Step 5] 差异: header 高度偏移 → .header height:44px→48px

=== Step 3 (iter 2) ===
📝 [Step 3] 第 2 轮 DSL 已生成（修复 1 处尺寸）

=== Step 4 (iter 2) ===
📊 [Step 4] 第 2 轮: 96.2% | SSIM: 0.97

=== Step 6 ===
✅ [Step 6] 达标！96.2% | 2 轮迭代 | 布局优化率 89%
```

### 中断恢复示例

```
用户："继续之前的还原任务"

检测到 checkpoint.json:
  currentStep: "2b"
  completedSteps: ["0", "1", "2a", "2b"]
  
→ 跳过 Step 0/1/2a/2b
→ 直接从 Step 3 开始
→ 读取 layout-plan.json 作为输入
```

### 仅分析（不生成 DSL）

```
用户："帮我分析这个设计稿的布局方案，不用生成 DSL"

→ 执行 Step 0 → 1 → 2a → 2b
→ 输出 layout-plan.json 后停止
→ 播报布局方案摘要
```
