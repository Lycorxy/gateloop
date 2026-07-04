# MySQL Schema Design — 分库分表策略

> 从知识库 `R4-分库分表策略` 提取的核心决策指南。
> 完整含迁移脚本/雪花算法/路由函数见原始文件。

## 一、拆分时机判断

```
单表数据量？
├── < 100 万     → ❌ 不拆（优化索引 + SQL 足够）
├── 100~500万    → ⚠️ 边界区间
│   ├── 查询毫秒级 → ❌ 不拆
│   └── 已有慢查询 → 先优化再评估
│       ① 加覆盖索引  ② 冷热归档  ③ 垂直拆大字段
│       → 90% 场景可解决
├── 500~2000万   → 🔶 建议准备
│   ✅ 必须做：历史数据归档
│   ⏳ 可考虑：垂直拆分 / 只读从库 / 预留路由字段
└── > 2000万     → ✅ 应该水平分表 > 分区表

其他触发信号（任一满足即关注）：
  □ 单表 .ibd 文件 > 2 GB
  □ DML 锁等待频繁
  □ 主从延迟持续 > 1 秒
  □ 磁盘空间不均衡
```

## 二、预防措施（百万级以内即可实施）

| 措施 | 成本 | 说明 |
|------|------|------|
| 预留路由字段 | 零成本 | 用户表加 tenant_id 作为潜在分片键 |
| 主表用 BIGINT 自增 | 零成本 | 未来可改雪花算法 |
| 归档机制 | 低 | 日志/操作记录定期归档（>90天） |
| 大字段分离 | 低 | TEXT/BLOB 独立成子表 |
| 监控告警 | 低 | 单表 >300万行时报警 |

## 三、水平分表示例

```sql
-- 按 user_id 取模分 8 张表
CREATE TABLE `order_info_0` (
    `id`          BIGINT NOT NULL AUTO_INCREMENT,
    `order_no`    VARCHAR(32) NOT NULL,
    `user_id`     BIGINT NOT NULL COMMENT '路由键',
    `amount`      INT NOT NULL COMMENT '金额(分)',
    `status`      TINYINT NOT NULL DEFAULT 0,
    `create_time` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `update_time` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_order_no` (`order_no`),
    KEY `idx_user_id` (`user_id`),
    KEY `idx_user_status` (`user_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单表(分片0)';
-- order_info_1 ~ order_info_7 结构完全相同
```

### 路由键选择优先级

| 优先级 | 选择 | 优点 | 缺点 |
|--------|------|------|------|
| ⭐⭐⭐⭐⭐ | 业务实体 ID (user_id/tenant_id) | 绝大多数查询带此条件、分布均匀 | 无 |
| ⭐⭐⭐⭐ | 时间字段 (create_time) | 日志类天然适配 | 跨时间范围需 UNION ALL |
| ⭐⭐⭐ | 地域/区域字段 | 有明确地域属性的业务 | 可能热点不均 |
| ⚠️ 不推荐 | 哈希值 MD5/SHA | 无法预测落点 | 运维困难 |
| ❌ 禁止 | UUID/随机值 | 必须全扫描 | 无法定位 |

### 分片数量选择

| 总量 | 分片数 | 每片行数 | 备注 |
|------|-------|---------|------|
| 500万~2000万 | 2~4 | 250万~500万 | 单张可控 |
| 2000万~1亿 | 4~8 | 250万~1250万 | 平衡查询和维护 |
| 1亿~10亿 | 8~32 | 1250万~3125万 | 配合中间件 |
| >10亿 | 16~64+ | 需专业工具 | ShardingSphere/Vitess |

## 四、在线迁移方案：双写迁移法

```
阶段1 准备(T-0): 创建空新表 + 开发路由代码 + 部置但不启用(OFF)
阶段2 双写(T开始): INSERT 同时写新旧表，读仍走旧表
阶段3 数据追平(T+Δt): 批量迁移旧数据(每批5000条) + 一致性校验
阶段4 切读: 切换读请求到新表，观察异常
阶段5 清理(T+稳定1周): 关闭双写 → RENAME旧表为bak → 删除兼容代码
```

## 五、全局唯一 ID：雪花算法

```go
// 核心：41位时间戳 + 10位机器ID + 12位序列号
// 可支持：1024个节点 × 4096/ms = 每秒400万+ ID
type Snowflake struct {
    mu       sync.Mutex
    timestamp int64
    workerID int64 // 0~1023
    sequence int64 // 0~4095
}
// epoch = 2021-01-01 00:00:00 UTC
// NextID() → ((now - epoch) << 22) | (workerID << 12) | sequence
```
