# 生产级代码质量验证清单

> 用于 Phase 6 质量验证阶段，逐项检查生成代码的生产就绪度。

---

## 一、编译与静态检查

### 1.1 golangci-lint

```
□ 0 errors, 0 warnings（info 级别可忽略）
□ 常用 linter 通过：
  - errcheck: 所有 error 都被检查
  - gosimple: 无过度复杂的写法
  - govet: 无不安全代码模式
  - ineffassign: 无无效赋值
  - staticcheck: 无静态分析警告
  - unused: 无未使用的变量/函数/导入
```

### 1.2 go vet

```
□ 0 errors
□ 检查项通过：
  - printf: 格式化字符串参数匹配
  - shadow: 变量遮蔽
  - unreachable: 不可达代码
  - copylocks: 锁值拷贝
```

### 1.3 go build

```
□ 所有包编译成功
□ 无循环依赖
□ 无缺失依赖
```

---

## 二、单元测试检查

### 2.1 覆盖率

```
□ 总体覆盖率 ≥ 80%
□ Service 层：≥ 70%（主要是错误路径覆盖）
□ Logic 层：≥ 85%（核心业务逻辑）
□ Repo 层：≥ 60%（需要 mock 数据库）
```

### 2.2 测试质量

```
□ 使用 table-driven tests 风格
□ 每个方法至少覆盖：正常路径 + 错误路径 + 边界条件
□ Mock 设置完整（gomock 或 testify/mock）
□ 使用 require 处理致命错误，assert 处理非致命检查
□ 测试命名格式：Test{Function}_{场景描述}
```

### 2.3 竞态检测

```
□ go test -race ./... 通过
□ 无 data race 警告
□ goroutine 共享变量使用 sync.Mutex 或 channel
□ Handler 结构体字段全部并发安全
```

---

## 三、代码规范检查

### 3.1 Handler 层规范

```
□ ctx 透传到所有下游调用（Logic、Repo）
□ 没有使用 context.Background() 替代请求 ctx
□ Handler 结构体无请求级字段（无状态）
□ Handler 结构体字段全部并发安全
□ 参数校验在 Handler 或 Logic 中完成
□ 业务错误放在 rsp 中，error 返回 nil
□ 系统错误通过 error 返回，rsp 返回 nil
□ 异步 goroutine 使用 trpc.Go 或新 context
```

### 3.2 Logic 层规范

```
□ 通过 interface 定义，方便 mock
□ 不直接依赖具体实现，依赖接口
□ 业务规则内聚在 Logic 层
□ 事务管理在 Logic 层（使用 Repo 的 Transaction 方法）
□ 缓存回写失败不阻塞主流程
□ 错误信息包含足够上下文
```

### 3.3 Repo 层规范

```
□ 通过 interface 定义
□ GORM 所有操作使用 WithContext(ctx)
□ DSN 包含 interpolateParams=true + parseTime=True + charset=utf8mb4
□ ErrRecordNotFound 转换为业务错误，不透传
□ SQL 查询使用参数化（?）而非字符串拼接
□ 事务闭包内只使用传入的 tx
□ ClientProxy 在构造函数中创建一次，全局复用
```

### 3.4 Redis 规范

```
□ ClientProxy 初始化一次，全局复用
□ 所有 SET 操作都有 TTL
□ Key 使用规范格式：{service}:{entity}:{id}
□ 分布式锁使用 Lua 脚本原子释放
□ 缓存穿透有空值保护
□ 缓存写入失败不影响主流程
```

### 3.5 Kafka 规范

```
□ Consumer Handle 始终返回 nil
□ 消费失败发送死信队列
□ Producer 在 Handler 启动时创建，单例复用
□ 消息包含 trace_id Header
□ Topic 命名规范：{domain}.{event}.{version}
```

---

## 四、安全规范检查

### 4.1 输入校验

```
□ Proto 层使用 ValidationV3 规则
□ Service 层有业务规则校验
□ SQL 使用参数化查询
□ 动态排序/分组字段使用白名单校验
□ 分页参数有上限限制（page_size ≤ 100）
```

### 4.2 数据脱敏

```
□ 敏感字段（手机号/身份证/邮箱）在响应时脱敏
□ 密码使用 bcrypt 哈希，不返回
□ 日志不包含用户密码/Token
□ 错误信息不泄露数据库结构
```

### 4.3 鉴权

```
□ Filter 层统一鉴权
□ Token 校验在请求入口完成
□ 用户信息通过 ctx 透传，不在参数中传递
```

---

## 五、性能检查

### 5.1 连接池

```
□ MySQL max_open 与预期 QPS 匹配
□ MySQL max_idle ≥ 10
□ Redis pool_size 与预期 QPS 匹配
□ 连接池参数在配置文件中可调整
```

### 5.2 查询优化

```
□ 关键查询有对应索引
□ 无 SELECT *（显式列出字段）
□ 批量操作使用批量接口（CreateInBatches / Pipeline）
□ 大列表查询有分页限制
□ N+1 查询已消除
```

### 5.3 缓存

```
□ 热点数据有缓存策略
□ 缓存 TTL 合理（5-30 分钟）
□ 缓存 Key 使用规范格式
□ 有缓存穿透/击穿/雪崩防护
```

---

## 六、稳定性检查

### 6.1 超时控制

```
□ 服务端配置 timeout（建议 1000ms）
□ DB 查询有 context timeout（建议 200ms）
□ Redis 操作有 context timeout（建议 100ms）
□ 下游 RPC 调用有 context timeout
□ 内层超时 ≤ 外层超时
```

### 6.2 错误处理

```
□ 所有 error 都被检查（无 _ 忽略）
□ 业务错误使用 errs.New 带错误码
□ 系统错误使用 errs.Wrap 带上下文
□ 错误码使用分段管理
□ 无空 catch / 空 error 处理
```

### 6.3 优雅关闭

```
□ 配置 close_wait_time 和 max_close_wait_time
□ 收到 SIGTERM 后停止接收新请求
□ 等待存量请求完成后关闭
□ 连接池正确释放
```

---

## 七、扩展性检查

### 7.1 项目结构

```
□ 符合 Service → Logic → Repo 三层架构
□ 层间通过 interface 通信
□ main.go 中有清晰的依赖注入
□ 配置使用 YAML + 环境变量
□ Proto 使用独立仓库管理
```

### 7.2 Proto 兼容性

```
□ 字段编号无冲突
□ 核心字段（1-15）分配合理
□ 无删除旧字段
□ 有预留扩展字段编号
□ 分页参数使用 page + page_size
```

---

## 八、运维可观测性

### 8.1 日志

```
□ 使用 log.ErrorContext / log.InfoContext（带 ctx）
□ 错误日志包含足够的上下文信息
□ 关键操作有 INFO 日志
□ 敏感信息不记录到日志
```

### 8.2 指标

```
□ 服务暴露 /metrics 端点
□ 有请求耗时统计
□ 有请求错误率统计
□ 有 DB/Redis 连接池指标
```

### 8.3 健康检查

```
□ 暴露 /healthz 端点（进程存活）
□ 暴露 /ready 端点（依赖检查）
```

---

## 验证通过标准

```
✅ golangci-lint: 0 errors, 0 warnings
✅ go vet: 0 errors
✅ go build: 编译成功
✅ go test: 全部 PASS, 覆盖率 ≥ 80%
✅ go test -race: 无竞态条件
✅ 代码规范：符合 12 条代码质量铁律
✅ 安全：输入校验 + SQL 参数化 + 数据脱敏
✅ 性能：连接池合理 + 索引覆盖 + 缓存策略
✅ 稳定性：超时控制 + 错误处理 + 优雅关闭
```
