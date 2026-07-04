# 表单设计知识库

> 来源：HubSpot Form Design Best Practices、FormShield UX Research、Baymard Institute Checkout Study、Luke Wroblewski Web Form Design、0xMinds Admin Panel Guide

---

## 一、核心数据

| 指标 | 数据 | 来源 |
|------|------|------|
| 单列 vs 多列完成速度差 | **15.4 秒** | CXL Research |
| Label 上方 vs 旁边速度差 | **5 倍** | NNGroup Eye-tracking |
| 因"太复杂"放弃填写的用户 | **26%** | Baymard Institute |
| 高性能表单字段数 | **6-8 个** | Baymard Checkout Study |
| 平均电商结账字段数 | **11.3 个**（过多） | Baymard Institute |

---

## 二、Anatomy（解剖图）

```
┌─────────────────────────────────────────────┐
│                                             │
│  项目名称 *                                  │  ← Label（永远可见，上方）
│  ┌───────────────────────────────────────┐   │
│  │ 请输入项目名称                        │   │  ← Input（h:40px）
│  └───────────────────────────────────────┘   │
│  支持中英文，不超过 50 个字符                │  ← Help Text（辅助提示）
│  ⚠ 项目名称不能为空                         │  ← Error Message
│                                             │
│  项目描述                                   │
│  ┌───────────────────────────────────────┐   │
│  │                                       │   │  ← TextArea（min-h:80px）
│  └───────────────────────────────────────┘   │
│                                     0/200   │  ← 字数限制
│                                             │
├─────────────────────────────────────────────┤
│                        [取消]  [确定]       │  ← 操作区（右对齐）
└─────────────────────────────────────────────┘
```

---

## 三、布局规则

### ✅ 单列布局（默认首选）

```
完成速度快 15.4 秒（CXL 研究）
移动端友好
减少跳过字段的风险

┌─────────────────────────┐
│  姓名 *                  │
│  ┌───────────────────┐  │
│  └───────────────────┘  │
│                         │
│  邮箱 *                  │
│  ┌───────────────────┐  │
│  └───────────────────┘  │
│                         │
│  电话                   │
│  ┌───────────────────┐  │
│  └───────────────────┘  │
└─────────────────────────┘
```

### ⚠️ 双列布局（仅限紧密关联的字段对）

```
适用：开始/结束日期、省/市、经度/纬度
注意：即使双列，Label 仍在每个 Input 上方

┌──────────────┬──────────────┐
│  开始日期 *   │  结束日期 *   │
│  ┌──────────┐│  ┌──────────┐│
│  └──────────┘│  └──────────┘│
└──────────────┴──────────────┘
```

### ❌ 三列及以上布局（禁止）

```
Z-pattern 扫视导致遗漏
响应式灾难
```

---

## 四、Label 规则

```
✅ Label 永远放在 Input 上方（快 5 倍）
✅ 必填标记：字段名后加红色 *
✅ 可选字段：明确标注"(可选)"或灰色"Optional"
✅ Label 字号 14px，颜色 neutral-08
✅ Label 和 Input 间距 6-8px

❌ 用 Placeholder 替代 Label（输入后消失，用户忘记字段含义）
❌ Floating Label（动画好看但 accessibility 差）
❌ Label 放在 Input 左侧（除非是表格式数据的编辑）
```

---

## 五、校验策略

### 时机对比

| 时机 | 用户体验 | 适用 |
|------|---------|------|
| Submit-time | 最差，认知负荷高 | ❌ 避免 |
| **On-blur** | **最佳平衡，不打断输入** | **✅ 推荐** |
| Inline(live) | 即时反馈，可能过早 | ⚠️ blur 后启用 |

### 错误消息规则

```
✅ 具体描述："邮箱格式不正确，需包含 @ 符号"
❌ 泛化消息："输入无效"
✅ 错误消息紧贴字段下方（不用页面顶部汇总）
✅ 错误时 Input 边框变红 + 红色文字
✅ 成功时可选显示绿色 ✓（不要过度）
```

---

## 六、字段精简原则

```
精简方法：

1. 砍掉 Nice-to-have 字段
   公司规模？首次访问不需要

2. 条件显示 Context-dependent 字段
   选了"公司"才显示公司名

3. 智能默认值
   从用户档案/上下文预填

4. 分步表单（> 8 个字段时用 Wizard 模式）
```

---

## 七、分步表单（Wizard/Stepper）

```
适用：字段 > 8 个 或 逻辑分组的创建流程

Step 1 ─── Step 2 ─── Step 3 ─── 完成
基础信息     详细配置     确认提交     ✓

每步规则：
- 每步 4-7 个字段（Miller's 7±2 法则）
- 进度条显示整体进度
- 支持返回上一步修改
- 最后一步显示所有信息的摘要确认
```

---

## 八、Input 类型速查

| 数据类型 | 推荐控件 | 原因 |
|---------|---------|------|
| 短文本 | Input | 标准 |
| 长文本 | TextArea | 多行 |
| 富文本 | RichEditor | 格式化 |
| 日期 | DatePicker | 格式保证 |
| 日期范围 | RangePicker | 起止关联 |
| 单选（< 5 项）| Radio | 一目了然 |
| 单选（≥ 5 项）| Select | 节省空间 |
| 多选 | Select(multiple) / Checkbox Group | 取决于选项数 |
| 开关 | Switch | 二态切换 |
| 数字 | InputNumber | 格式化 |
| 标签/分类 | Select + 自定义 Tag 输入 | 灵活 |
| 地址 | 级联选择 Cascader | 结构化 |
| 文件 | Upload（拖拽上传） | 直观 |
| 颜色 | ColorPicker | 精确 |
| JSON/代码 | MonacoEditor | 语法高亮 |

---

## 九、真实案例

### 案例 1：Stripe 付款表单（交互密度标杆）

```
特点：
- 实时校验：输入邮箱时即时验证格式
- 智能默认值：根据 IP 自动填充国家/货币
- 条件显示：选"企业"才显示税号字段
- 卡片输入：自动格式化卡号（4位一组）
- 地址自动补全：Google Places API
```

### 案例 2：Notion 创建页面表单（渐进式披露）

```
特点：
- 极简初始态：只需填标题
- 展开态：点击后显示图标选择、封面、描述
- 模板选择：提供预设模板减少空白输入
- 快捷键：Cmd+Enter 直接提交
```

### 案例 3：HubSpot 表单最佳实践

```
关键规则：
1. 减少字段数到最少（每个额外字段降低转化率 5-10%）
2. 使用多步表单代替长表单
3. 清晰的进度指示器
4. 避免使用"提交"按钮文案（用"继续"/"创建"/"保存"等具体动作）
5. 移动端测试必做
```

### 案例 4：0xMinds Settings Page Prompt

```
Settings page prompt 示例：

BUILD: Settings page with tabs for Profile, Notifications, and Security
FOR: SaaS users managing their account preferences
MUST:
- Tab-based navigation with URL-synced active tab
- Profile tab: avatar upload, name, email, bio fields
- Notifications tab: toggle switches for email/push/in-app
- Security tab: password change, 2FA toggle, active sessions
SHOULD:
- Unsaved changes indicator with discard option
- Toast notification on successful save
CONTEXT: React + shadcn/ui, clean white design, subtle borders
```

---

## 十、表单设计检查清单

```
□ 单列布局（除紧密关联字段对外）
□ Label 在 Input 上方
□ 必填字段有红色 * 标记
□ On-blur 校验（非 submit-time）
□ 错误消息具体且紧贴字段
□ Help Text 在 Input 下方
□ 字数限制有计数器
□ 操作按钮右对齐
□ 取消在左，确认在右
□ 确认按钮用 Primary 样式
□ 支持 Cmd+Enter 快捷提交
□ 有 loading 状态（提交中按钮 disabled + spinner）
□ 成功后有反馈（Toast / 页面跳转）
```
