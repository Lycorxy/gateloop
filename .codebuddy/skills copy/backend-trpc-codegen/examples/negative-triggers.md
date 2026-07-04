# Negative Triggers（不应触发）

## 1. 数据库表设计（→ mysql-schema-design）

```
❌ "设计一张用户表"
❌ "这个订单表的索引怎么建"
❌ "是否需要分库分表"
❌ "帮我写 CREATE TABLE 语句"
❌ "这个字段用什么类型比较好"
```

## 2. 代码审查/Lint（→ eslint-code-quality 或 Go 原生工具）

```
❌ "帮我检查这段 Go 代码"
❌ "跑一下 lint 检查"
❌ "这个函数有什么问题"
❌ "代码格式化一下"
```

## 3. 纯 SQL 编写（不需要设计决策）

```
❌ "写一个查询最近 30 天订单的 SQL"
❌ "这个 JOIN 查询怎么写"
❌ "帮我优化这个慢 SQL"
❌ "写一个统计报表的 SQL"
```

## 4. 纯前端开发（→ frontend-codegen）

```
❌ "生成用户列表页面前端代码"
❌ "写一个订单表单页面"
❌ "前端接口对接"
```

## 5. 非 tRPC/非 Go 的后端

```
❌ "用 Express 写一个 API"
❌ "生成 Java Spring Boot 后端代码"
❌ "Python 的 FastAPI 接口"
```

## 6. 基础设施/运维

```
❌ "配置 Nginx 反向代理"
❌ "Docker Compose 编排服务"
❌ "Kubernetes 部署配置"
❌ "数据库备份脚本"
```

## 7. Redis/MongoDB 选型咨询（无代码生成需求）

```
❌ "这个场景用 Redis 还是 Memcached"
❌ "MongoDB 和 MySQL 怎么选"
```
