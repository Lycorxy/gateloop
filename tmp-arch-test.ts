import { writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { metricArchitecture } from './src/ads/metrics/architecture-metrics'

const tmp = join(process.cwd(), 'tmp-arch-test-plan.json')
const out = join(process.cwd(), 'tmp-arch-output.json')

// 测试 plan：故意包含 5 类架构问题
const plan = {
  frontendPlan: {
    // 7 个模块，其中 2 个偏离标准结构
    moduleBoundary: [
      { file: 'pages/user-list/index.tsx', responsibility: '用户列表页', exports: ['default'] },
      { file: 'pages/user-list/hook.ts', responsibility: '用户列表状态', exports: ['useUserList'] },
      { file: 'pages/user-list/utils.ts', responsibility: '数据处理', exports: ['formatUser'] },
      { file: 'pages/order-list/index.tsx', responsibility: '订单列表页', exports: ['default'] },
      { file: 'pages/order-list/hook.ts', responsibility: '订单状态', exports: ['useOrderList'] },
      { file: 'pages/order-list/utils.ts', responsibility: '数据处理', exports: ['formatOrder'] },
      // 问题1：模块偏离标准结构（缺 hook.ts 和 utils.ts）
      { file: 'pages/dashboard/index.tsx', responsibility: '仪表盘', exports: ['default'] },
      // 问题2：空壳模块（声明了但无函数归属）
      { file: 'pages/empty-page/index.tsx', responsibility: '空页面', exports: ['default'] }
    ],
    // 问题3：越界文件（config.ts 有函数但 moduleBoundary 未声明）
    // 问题4：派生状态误存（filteredList 声明 useState 应改 useMemo）
    // 问题5：弹窗在 Store（modalOpen 声明 Zustand 应改 useState）
    functionOwnership: [
      { name: 'UserList', file: 'pages/user-list/index.tsx', category: '渲染编排' },
      { name: 'useUserList', file: 'pages/user-list/hook.ts', category: '状态+副作用' },
      { name: 'formatUser', file: 'pages/user-list/utils.ts', category: '纯数据处理' },
      { name: 'OrderList', file: 'pages/order-list/index.tsx', category: '渲染编排' },
      { name: 'useOrderList', file: 'pages/order-list/hook.ts', category: '状态+副作用' },
      { name: 'formatOrder', file: 'pages/order-list/utils.ts', category: '纯数据处理' },
      { name: 'Dashboard', file: 'pages/dashboard/index.tsx', category: '渲染编排' },
      // 越界文件：config.ts 有函数但 moduleBoundary 没声明
      { name: 'parseConfig', file: 'config.ts', category: '纯数据处理' }
    ],
    stateClassification: [
      { name: 'selectedId', layer: 'useState', scope: '局部' },
      { name: 'filteredList', layer: 'useState', scope: '局部' }, // 问题4：派生误存
      { name: 'editData', layer: 'Zustand', scope: '共享' },
      { name: 'modalOpen', layer: 'Zustand', scope: '共享' }, // 问题5：弹窗在 Store
      { name: 'loading', layer: 'Zustand', scope: '共享' }, // 问题5：loading 在 Store
      { name: 'sortedData', layer: 'useState', scope: '局部' }, // 问题4：派生误存
      { name: 'userList', layer: 'Zustand', scope: '共享' },
      { name: 'orderList', layer: 'Zustand', scope: '共享' },
      // 问题6：共享比例过高（5/8 = 62.5% > 50%）
    ],
    efficiencyAudit: {
      effects: [{ hook: 'useEffect', deps: '[id]', purpose: 'load' }],
      renderControl: [],
      requestDedup: []
    },
    edgeCases: [{ scenario: '空数据', handling: 'Empty' }],
    errorStates: [{ scenario: '接口失败', handling: '重试' }]
  }
}

writeFileSync(tmp, JSON.stringify(plan))

const r = metricArchitecture({ input: tmp })
writeFileSync(out, JSON.stringify(r, null, 2))

if (existsSync(tmp)) unlinkSync(tmp)
console.log('Result written to tmp-arch-output.json')
