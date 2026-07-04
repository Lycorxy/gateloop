# B端页面完整代码模板

> 每个模板都是可直接复制使用的 React + CSS Variables 代码。所有值遵循 RULE.mdc 约束。

---

## 一、列表管理页模板（最常用，70%+ 的B端页面）

```tsx
import { useState } from 'react'
import { Button, Table, Tag, Popconfirm, Input, Select, Card, Space, Pagination } from 'antd'

/* ═══════════════════════════════════════════
   列表管理页：用户管理（典型增删改查）
   
   结构：
   1. 页面标题栏 (h:64px)
   2. 搜索卡片 (flex-shrink:0)
   3. 表格卡片 (flex:1, 占据剩余空间)
   ═══════════════════════════════════════════ */

export default function UserListPage() {
  const [loading, setLoading] = useState(false)

  /* ── 列定义 ── */
  const columns = [
    {
      title: '用户名',          // 表头: 14px/600/neutral-10
      dataIndex: 'name',
      width: 180,
      fixed: 'left',            // 首列固定（列数>6时）
      /* 文本左对齐 */
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      width: 220,
      ellipsis: true,           // 长文本省略 + tooltip
    },
    {
      title: '角色',
      dataIndex: 'role',
      width: 120,
      /* 居中对齐（状态/短文本）*/
      render: (role: string) => (
        <Tag color={role === '管理员' ? 'blue' : 'default'}>{role}</Tag>
        // 仅语义色Tag，禁止自定义彩色
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      align: 'center',
      render: (status: string) => (
        <Tag color={status === '活跃' ? 'green' : 'default'}>{status}</Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 160,
      sorter: true,             // 可排序
      /* 日期左对齐 */
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      fixed: 'right',           // 操作列固定（右对齐）
      render: (_: any, record: any) => (
        <Space size={8}>       {/* space-8 按钮组间距 */}
          <a style={{ height: 20 }}>编辑</a>     {/* Text按钮 h:auto */}
          <a style={{ height: 20 }}>查看</a>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <a style={{ color: 'var(--color-red-07)' }}>删除</a> {/* 危险操作红色 */}
          </Popconfirm>
        </Space>
        /* 操作≤3个常驻；>3个用hover浮现或更多下拉 */
      ),
    },
  ]

  return (
    <div className="admin-page">
      {/* ── 页面标题栏 h:64px ── */}
      <div className="page-header" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 64,
        padding: '0 var(--space-24, 24px)',
        borderBottom: '1px solid var(--color-neutral-03, #ebebeb)',
      }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: 'var(--color-neutral-10)' }}>
          用户管理
        </h1>
        <Space size={8}>
          <Button type="primary" style={{ height: 40 }}>新建用户</Button>  {/* Primary h:40px r:2px */}
          <Button style={{ height: 40 }}>批量导入</Button>              {/* Line h:40px */}
        </Space>
      </div>

      {/* ── 内容区 flex column ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 'var(--space-16, 20px)', flex: 1, overflow: 'auto' }}>

        {/* ── 搜索卡片（三件套）flex-shrink:0 ── */}
        <Card style={{ flexShrink: 0 }}>
          <Space size={16} wrap>
            <Input placeholder="搜索用户名" allowClear style={{ width: 200, height: 40 }} />  {/* h:40px r:2px */}
            <Select placeholder="角色筛选" style={{ width: 140, height: 40 }} options={[]} />
            <Select placeholder="状态筛选" style={{ width: 120, height: 40 }} options={[{ label: '全部', value: '' }]} />
            <Button type="primary" style={{ height: 40 }}>搜索</Button>
            <Button style={{ height: 40 }}>重置</Button>
          </Space>
        </Card>

        {/* ── 表格卡片（三件套）flex:1 ── */}
        <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={[]}
            loading={loading}
            scroll={{ x: 1000, y: 'calc(100% - 56px)' }}
            pagination={{
              showTotal: total => `共 ${total} 条`,
              showSizeChanger: true,
              pageSizeOptions: ['25', '50', '100'],
            }}
            rowClassName={() => 'table-row'}
            size="middle"
          />
        </Card>
      </div>
    </div>
  )
}

/* ── 全局样式（应放入全局CSS文件中）── */
const globalStyles = `
.admin-page {
  background: var(--color-neutral-02, #f5f5f5);
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 卡片三件套 */
.ant-card {
  background: var(--color-neutral-01, #fff);
  border: 1px solid var(--color-neutral-03, #ebebeb) !important;
  border-radius: var(--radius-lg, 8px) !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, .05) !important;
}

/* 表格行高 48px */
.ant-table-tbody > tr > td {
  height: 48px !important;
  padding: 0 16px !important;
}

/* 表头 sticky + 阴影 */
.ant-table-thead > tr > th {
  height: 48px !important;
  background: var(--color-neutral-02, #f5f5f5) !important;
  font-weight: 600 !important;
  position: sticky;
  top: 0;
  z-index: 10;
}

/* 行 hover 效果 */
.table-row:hover > td {
  background: var(--color-blue-01, #f5f8ff) !important;
}

/* 按钮 Primary: h:40px bg:blue-07 r:2px */
.ant-btn-primary {
  height: 40px !important;
  border-radius: var(--radius-sm, 2px) !important;
}

/* 输入框: h:40px r:2px */
.ant-input {
  height: 40px !important;
  border-radius: var(--radius-sm, 2px) !important;
}

.ant-input:focus, .ant-select-focused .ant-select-selector {
  border-color: var(--color-blue-07, #1e67fa) !important;
  box-shadow: 0 0 0 2px rgba(30, 103, 250, 0.15) !important;
}

/* 分页居底 */
.ant-pagination {
  margin-top: 16px;
  text-align: right;
}
`
```

---

## 二、Dashboard 页模板

```tsx
export default function DashboardPage() {
  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>数据概览</h1>
        <Space size={8}>
          <Button style={{ height: 40 }}>刷新数据</Button>
          <Button style={{ height: 40 }}>导出报告</Button>
        </Space>
      </div>

      <div className="dashboard-content" style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        padding: 20,
      }}>
        {/* ── KPI 统计行：每行 4~6 个，gap:16 ── */}
        <div style={{ display: 'flex', gap: 16 }}>
          {[
            { label: '总用户数', value: '12,345', change: '+12.5%', up: true },
            { label: '活跃用户', value: '3,456', change: '+5.2%', up: true },
            { label: '转化率', value: '23.4%', change: '-1.2%', up: false },
            { label: '待处理工单', value: '89', change: '-15.0%', up: true },
          ].map((item) => (
            <KpiCard key={item.label} {...item} />
          ))}
        </div>

        {/* ── 图表区域（左右分栏）── */}
        <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 360 }}>
          <Card style={{ flex: 3 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>趋势分析</h2>
            {/* 图表区域占位 */}
          </Card>
          <Card style={{ flex: 1 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>热门排行</h2>
            {/* 排行榜占位 */}
          </Card>
        </div>
      </div>
    </div>
  )
}

/* KPI 卡组件 */
function KpiCard({ label, value, change, up }: { label: string; value: string; change: string; up: boolean }) {
  return (
    <Card style={{ flex: 1 }}>
      <div style={{ fontSize: 14, color: 'var(--color-neutral-08)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--color-neutral-10)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{
        fontSize: 14,
        color: up ? 'var(--color-green-07)' : 'var(--color-red-07)',
        marginTop: 4,
      }}>
        {up ? '↑' : '↓'} {change}
        <span style={{ color: 'var(--color-neutral-06)', marginLeft: 4 }}>较上月</span>
      </div>
    </Card>
  )
}
```

---

## 三、设置页模板

```tsx
export default function SettingsPage() {
  const [saving, setSaving] = useState(false)

  return (
    <div className="admin-page">
      <div className="page-header"><h1>系统设置</h1></div>

      <div className="settings-content" style={{ maxWidth: 800, margin: '0 auto', padding: '20px var(--space-16, 16px)' }}>
        {/* ── 分组卡片：基本信息 ── */}
        <Card style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>基本信息</h2>
          
          {/* 单列布局：Label 始终在 Input 上方 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 14, color: 'var(--color-neutral-08)', marginBottom: 6 }}>
                系统名称 <span style={{ color: 'var(--color-red-07)' }}>*</span>
              </label>
              <Input placeholder="请输入系统名称" style={{ height: 40 }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 14, color: 'var(--color-neutral-08)', marginBottom: 6 }}>
                系统描述
              </label>
              <Input.TextArea rows={4} placeholder="请输入描述" style={{ minHeight: 80 }} maxLength={200} showCount />
            </div>
          </div>
        </Card>

        {/* ── 分组卡片：安全设置 ── */}
        <Card style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>安全设置</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, color: 'var(--color-neutral-09)' }}>启用双因素认证</span>
              <Switch />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, color: 'var(--color-neutral-09)' }}>登录异常提醒</span>
              <Switch defaultChecked />
            </div>
          </div>
        </Card>

        {/* ── 底部操作栏 h:80px 按钮右对齐 ── */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          paddingTop: 24,
          borderTop: '1px solid var(--color-neutral-03)',
          marginTop: 8,
          height: 80,
          alignItems: 'center',
        }}>
          <Button style={{ height: 40 }}>取消</Button>
          <Button type="primary" loading={saving} style={{ height: 40 }} onClick={() => setSaving(true)}>
            保存更改
          </Button>
        </div>
      </div>
    </div>
  )
}
```

---

## 四、Modal 编辑模板（≤6 字段）

```tsx
function EditModal({ open, onClose, record }: Props) {
  return (
    <Modal
      title="编辑用户"
      open={open}
      onCancel={onClose}
      width={520}                    {/* 小表单 520px */}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose}>取消</Button>         {/* 取消左 */}
          <Button type="primary" onClick={handleSubmit}>确定</Button> {/* 确认右/Primary */}
        </div>
      }
      destroyOnClose
    >
      <Form layout="vertical">  {/* vertical = Label 在上方 */}
        <Form.Item name="name" label="用户名" rules={[{ required: true }]}>
          <Input style={{ height: 40 }} />
        </Form.Item>
        <Form.Item name="email" label="邮箱" rules={[{ required: true }, { type: 'email' }]}>
          <Input style={{ height: 40 }} />
        </Form.Item>
        <Form.Item name="role" label="角色">
          <Select style={{ height: 40 }} options={roleOptions} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
```

---

## 五、Drawer 编辑模板（7~15 字段）

```tsx
function EditDrawer({ open, onClose }: Props) {
  return (
    <Drawer
      title="配置详情"
      open={open}
      onClose={onClose}
      width={720}                   {/* 大表单 720px */}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={handleSubmit}>保存</Button>
        </div>
      }
    >
      <Form layout="vertical">
        {/* 7~15 个字段，单列排列 */}
      </Form>
    </Drawer>
  )
}
```

---

## 六、空状态模板

```tsx
function EmptyState({ 
  title = '暂无数据', 
  description = '这里还没有任何内容',
  actionText = '创建',
  onAction 
}: { 
  title?: string; 
  description?: string; 
  actionText?: string; 
  onAction?: () => void 
}) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 20px',
      textAlign: 'center',
    }}>
      {/* SVG 插画 200x160px，stroke-width:2px, stroke-linecap:round */}
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={false} />
      
      <p style={{
        fontSize: 16,
        fontWeight: 500,
        color: 'var(--color-neutral-09)',
        marginTop: 16,
        marginBottom: 4,
      }}>{title}</p>
      
      <p style={{
        fontSize: 13,
        color: 'var(--color-neutral-06)',
        maxWidth: 300,
        lineHeight: 1.6,
        marginBottom: 20,
      }}>{description}</p>

      {onAction && (
        <Button type="primary" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </div>
  )
}
```

---

## 七、Skeleton 骨架屏模板

```tsx
function TableSkeleton() {
  return (
    <div>
      {/* 模拟搜索区 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <Skeleton.Input active style={{ width: 200, height: 40, borderRadius: 2 }} block />
        <Skeleton.Input active style={{ width: 140, height: 40, borderRadius: 2 }} block />
        <Skeleton.Button active style={{ width: 80, height: 40, borderRadius: 2 }} />
      </div>
      
      {/* 模拟表格：表头 + 5行骨架 */}
      <table style={{ width: '100%' }}>
        <thead>
          <tr>
            {[...Array(6)].map((_, i) => (
              <th key={i} style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-neutral-03)' }}>
                <Skeleton.Input active small block />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...Array(5)].map((_, rowIdx) => (
            <tr key={rowIdx}>
              {[...Array(6)].map((_, colIdx) => (
                <td key={colIdx} style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-neutral-03)' }}>
                  <Skeleton.Input active small block />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

---

## 八、Toast / 反馈规范

```tsx
/* 成功反馈 — 静默确认，不弹窗 */
message.success({ content: '保存成功', duration: 3 })

/* 错误反馈 — 可展开详情 */
message.error({
  content: '操作失败',
  duration: 5,
})

/* 警告 */
message.warning({ content: '部分数据未同步', duration: 4 })

/* 信息 */
message.info({ content: '已自动草稿', duration: 4 })
```
