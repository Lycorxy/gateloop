# 架构质量度量步骤指引（模型按此逐条精判）

> **核心原则**：脚本只做粗筛（输出候选问题），模型按本指引逐条精判。
> 脚本不准的语义判断，全部交给模型按步骤做。
> 每条度量 = ① 脚本粗筛什么 → ② 模型看什么 → ③ 判断标准 → ④ 如何决策

---

## A. 目录结构合理性

### A1. 模块同构性

**度量什么**：所有模块是否遵循统一的文件结构（index.tsx + hook.ts + utils.ts + types.ts）

**脚本粗筛**（architecture-metrics 输出候选）：
```
按目录分组 moduleBoundary，统计每个目录包含哪些文件类型
标准结构 = 出现频率 ≥ 模块数一半的文件类型集合
偏离模块 = 缺少标准结构中文件类型的模块
```

**模型精判步骤**：
1. 看 architecture-metrics 输出的"偏离模块"清单
2. 对每个偏离模块，逐个判断：
   - 该模块的业务复杂度是否真的需要标准结构全部文件？
   - 如果是简单展示页（无状态/无数据加工），缺 hook.ts/utils.ts 是合理的
   - 如果是复杂交互页（有状态/有数据加工），缺 hook.ts = 状态会散在 index.tsx 里
3. 判断标准：
   - 有数据请求/状态管理但缺 hook.ts → 真问题
   - 有数据加工但缺 utils.ts → 真问题
   - 纯展示页缺 hook.ts/utils.ts → 误报，跳过

**模型决策**：真问题 → 在 frontendPlan.splitDecisions 声明补全计划；误报 → 忽略

---

### A2. 模块规模均衡

**度量什么**：模块间函数数量分布是否均衡（有的模块 2 函数，有的 20 函数）

**脚本粗筛**：
```
按模块分组 functionOwnership，统计每个模块的函数数
过载 = 函数数 > 平均 × 2 且 ≥ 8
```

**模型精判步骤**：
1. 看过载模块清单
2. 对每个过载模块，判断：
   - 该模块是否确实承担了过多职责？（看 functionOwnership 里该模块的函数列表）
   - 函数是否可以按职责拆分到子模块？（如"用户列表"可拆为"列表渲染"+"筛选逻辑"+"分页逻辑"）
   - 还是说该模块本身就是一个复杂业务（如权限系统），函数多是合理的？
3. 判断标准：
   - 函数涉及 3+ 个不相关子领域 → 真问题（应拆分）
   - 函数都属于同一业务流程的不同步骤 → 可接受（但建议抽 hook 分层）
   - 函数都是同类工具（formatXxx × 10）→ 可接受（utils 本就是工具集合）

**模型决策**：真问题 → 在 splitDecisions 声明拆分计划

---

### A3. 模块边界对齐

**度量什么**：moduleBoundary 声明的文件 vs functionOwnership 实际归属的文件是否一致

**脚本粗筛**：
```
空壳模块 = moduleBoundary 声明了文件但 functionOwnership 无函数归属
越界文件 = functionOwnership 有函数但 moduleBoundary 未声明
```

**模型精判步骤**：
1. 看空壳模块清单 → 判断：
   - 是真的空壳（设计遗漏）还是该模块暂无函数（纯路由页/布局页）
   - 纯路由页（只有 `<Outlet />`）无函数是合理的
2. 看越界文件清单 → 判断：
   - 是真的越界（函数放错位置）还是公共文件（如 `config.ts` 属于全局配置）
   - `config.ts`/`constants.ts` 等全局文件不归属任何模块是合理的
3. 判断标准：
   - 业务函数在未声明文件 → 真问题
   - 路由页/全局配置文件 → 误报

**模型决策**：真问题 → 补充 moduleBoundary 声明或移动函数

---

## B. 耦合性

### B1. 跨模块共享函数

**度量什么**：同一个文件被多个模块的 functionOwnership 引用

**脚本粗筛**：
```
按 file 分组，统计归属几个不同模块
共享文件 = 被 ≥3 模块引用
```

**模型精判步骤**：
1. 看共享文件清单
2. 对每个共享文件，判断：
   - 是公共工具（utils.ts/types.ts/helpers.ts）→ 共享是合理的
   - 是业务逻辑文件（hook.ts/某模块的 index.tsx）→ 跨模块引用业务逻辑是耦合信号
   - 是共享状态（store.ts）→ 共享是合理的，但需检查是否过度共享
3. 判断标准：
   - 公共工具/类型 → 误报
   - 业务 hook 被其他模块直接 import → 真问题（应通过 props 传递或抽公共 hook）
   - 模块的内部 utils 被其他模块引用 → 真问题（应提升为公共 utils）

**模型决策**：真问题 → 在 splitDecisions 声明解耦计划

---

### B2. 依赖方向（需要 src 目录）

**度量什么**：实际 import 是否有反向依赖（低层 import 高层）

**合法方向**：utils → api → types → hooks → components → pages → app

**脚本粗筛**（需要 `--dir src/`）：
```
扫描 src 的 import 语句
检测反向：utils import components / api import pages 等
```

**脚本局限**：
- 只能粗扫相对路径 import，动态 import / re-export 可能漏
- 目录名可能不标准（如 `services/` 而非 `api/`）

**模型精判步骤**：
1. 看反向依赖清单
2. 对每个反向依赖，判断：
   - 是真的反向（utils import 了 pages 的代码）→ 真问题
   - 是类型引用（utils import pages/types.ts 拿类型定义）→ 可接受（但建议类型下沉到 types/）
   - 是 barrel re-export（index.ts re-export）→ 误报
3. 判断标准：
   - utils 直接 import 业务代码 → 真问题
   - 仅 import 类型定义 → 可接受但建议改进
   - re-export → 误报

**模型决策**：真问题 → 声明重构计划

---

### B3. God module（扇入扇出双高）

**度量什么**：被很多模块依赖同时又依赖很多模块的"枢纽模块"

**脚本粗筛**（需要 `--dir src/`）：
```
按目录统计扇入（被多少模块 import）和扇出（import 多少模块）
God module = 扇入 ≥3 且 扇出 ≥3
```

**模型精判步骤**：
1. 看 God module 清单
2. 对每个 God module，判断：
   - 是公共工具集合（utils/helpers）→ 扇入高合理，但扇出高说明它依赖了业务代码
   - 是核心业务模块（如 auth）→ 扇入扇出高可能是合理的（它是系统中枢）
   - 是低层模块（types/constants）→ 扇出高不合理（它不该依赖任何东西）
3. 判断标准：
   - 低层模块扇出高 → 真问题（应零依赖）
   - 中层模块扇入扇出双高 → 需审视是否职责过多
   - 核心业务模块 → 可接受

**模型决策**：真问题 → 声明拆分计划

---

## C. 全局状态合理性（模型直接精判，不依赖脚本粗筛）

> 状态合理性是语义判断，脚本启发式猜 name 关键词不准（filteredList 不一定是派生，modalOpen 不一定该出 Store）。
> 因此 C1-C4 删除了脚本检测，**模型直接读 stateClassification 逐条精判**。
> 只有 C5（Store 字段过载）保留脚本检测，因为要扫源码找 create() 定位。

### C1. 派生状态误存（模型直接精判）

**模型看什么**：读 stateClassification，找 layer=useState 但 name 暗示派生的条目

**判断标准**：
- name 含 filtered/sorted/computed/derived/formatted/processed 且 **有独立 setState** → 保持 useState
- name 含上述关键词且 **无独立 setState**（只在其他 state 变化时同步）→ 真问题，应改 useMemo
- 看 reason 字段："从 list 派生"/"根据 filter 计算" → 真问题

**模型决策**：真问题 → 修改 layer 为 useMemo

### C2. 弹窗/loading 在 Store（模型直接精判）

**模型看什么**：读 stateClassification，找 layer=Zustand/Context 且 name 含 modal/open/visible/loading/collapse 的条目

**判断标准**：
- 控制方 = 1 个组件 → 真问题（应改 useState）
- 控制方 ≥2 个组件 → 共享是合理的（保持 Store）
- 看 scope 字段：scope=局部 → 真问题；scope=共享 → 确认是否真的有 2+ 控制方

**模型决策**：真问题 → 修改 layer 为 useState

### C3. 状态分布比例（模型直接精判）

**模型看什么**：读 stateClassification，统计 layer 比例

**判断标准**：
- Zustand 占比 >50% → 警惕状态泛滥（大部分状态应该是局部 useState 或派生 useMemo）
- useMemo 占比 <10% → 警惕派生状态被独立存储
- 理想分布：useState 40-60% / useMemo 20-30% / Zustand 10-20% / Context 5-10%

**模型决策**：偏离过大 → 审视状态归属

### C4. 共享比例过高（模型直接精判）

**模型看什么**：读 stateClassification，统计 scope=共享 的占比

**判断标准**：
- 真正需要跨组件读写的状态占比 >50% → 可接受
- 瞬态/派生状态误入 Store 导致比例虚高 → 真问题（结合 C1/C2 判断）

**模型决策**：真问题 → 结合 C1/C2 修正后重新评估

---

### C5. Store 字段过载（脚本定位，模型精判）

**度量什么**：单个 Zustand store 的字段数 >10

**脚本粗筛**（需要 `--dir src/`）：
```
扫描含 create( 的文件，粗匹配 store 字段数
>10 → warn
```

**脚本局限**：正则匹配脆弱，可能漏字段或多算

**模型精判步骤**：
1. 看过载 store 清单
2. 对每个过载 store，**read_file 实际查看 store 定义**，逐字段判断：
   - 字段是否属于同一业务领域？（如用户 store 含 userInfo/userPermissions/userRole 是合理的）
   - 字段是否可以按领域拆分？（如 user store 含订单状态 → 应拆为 order store）
3. 判断标准：
   - 同一领域 >10 字段 → 可接受（复杂业务）
   - 跨领域字段混在一个 store → 真问题（应按领域拆分）
   - 含瞬态字段（modalOpen/loading）→ 真问题（应移出 Store）

**模型决策**：真问题 → 声明 store 拆分计划

---

## 执行流程

```
1. design 阶段产出 frontendPlan 后
   ↓
2. 脚本运行：npx nut ads metric architecture --input plan.json
   ↓ 输出候选问题清单（facts）
3. 模型读 facts，按本指引逐条精判
   ↓ 对每条 fact 判断：真问题 / 误报 / 不确定
4. 产出 architectureReview artifact（verdicts 数组，每条 fact 一个 verdict + reason）
   ↓
5. 真问题 → 修改 frontendPlan + 在 splitDecisions 声明修正计划
   误报 → verdict 标注误报 + reason 说明为何误报
   不确定 → verdict 标注不确定 + reason 说明待编码时验证
   ↓
6. emit frontendPlan + architectureReview
   ↓
7. nut ads next → 引擎 schema 校验两个 artifact 都存在 → 推进到 code
   ↓
8. code 阶段 consumes architectureReview
   编码时遵循 verdict=真问题 的修正计划
```

## 度量结果分类

| 类别 | 来源 | 模型动作 |
|---|---|---|
| **真问题** | 脚本粗筛 + 模型精判确认 | 修改 frontendPlan |
| **误报** | 脚本粗筛 + 模型精判排除 | 忽略 |
| **不确定** | 脚本粗筛 + 模型无法确认 | 标记为需人工评审 |

## 关键认知

> **脚本不是裁判，是助手。**
> 脚本的工作是把"可能有问题的地方"筛出来，减少模型需要检查的范围。
> 真正的质量判断必须模型来做，因为只有模型能理解业务语义。
>
> **度量 ≠ 判定。**
> 度量输出的是"事实"（filteredList 声明了 useState）。
> 判定需要模型结合 reason 字段和业务场景做（它是不是真的派生状态）。
>
> **不要追求脚本 100% 准确。**
> 追求的是"脚本不漏报真问题"，允许有误报（模型精判时排除）。
> 宁可多报 10 个误报让模型排除，也不能漏掉 1 个真问题。
