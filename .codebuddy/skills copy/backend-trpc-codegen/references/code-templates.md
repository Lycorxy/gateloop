# 代码生成模板（完整版）

> 用于 Phase 4/5 代码生成阶段，覆盖所有场景的完整模板。SKILL.md 中的为精简版，此处为带完整依赖的详细版。

---

## TPL-01: Proto 文件

```protobuf
syntax = "proto3";

package trpc.{app}.{server};

option go_package = "trpc.tech/trpc-go/{app}/{server}";

import "buf/validate/validate.proto";

// ====== 枚举 ======
enum {Entity}Status {
    {ENTITY}_STATUS_UNSPECIFIED = 0;
    {ENTITY}_STATUS_ACTIVE     = 1;
    {ENTITY}_STATUS_INACTIVE   = 2;
    {ENTITY}_STATUS_DELETED    = 99;
}

// ====== 通用响应 ======
message BaseResponse {
    int32  code = 1;
    string msg  = 2;
}

// ====== {Entity}Info（通用对象） ======
message {Entity}Info {
    int64  id         = 1;
    string name       = 2;
    int32  status     = 3;
    string created_at = 4;  // RFC3339
    string updated_at = 5;
}

// ====== Create ======
message Create{Entity}Req {
    string name    = 1 [(buf.validate.field).string.min_len = 1];
    string email   = 2 [(buf.validate.field).string.email = true];
    string phone   = 3 [(buf.validate.field).string.pattern = "^\\\\+?[0-9]{7,15}$"];
}

message Create{Entity}Rsp {
    BaseResponse base    = 1;
    int64        id      = 2;  // 新创建的 ID
}

// ====== Get ======
message Get{Entity}Req {
    int64 id = 1 [(buf.validate.field).int64.gt = 0];
}

message Get{Entity}Rsp {
    BaseResponse base  = 1;
    {Entity}Info info = 2;
}

// ====== List ======
message List{Entity}Req {
    int32  page     = 1 [(buf.validate.field).int32.gte = 1];
    int32  page_size = 2 [(buf.validate.field).int32 = {gte: 1, lte: 100}];
    string keyword  = 3;  // 可选搜索
    int32  status   = 4;  // 可选筛选
}

message List{Entity}Rsp {
    BaseResponse       base  = 1;
    repeated {Entity}Info list = 2;
    int64              total = 3;
}

// ====== Update ======
message Update{Entity}Req {
    int64  id    = 1 [(buf.validate.field).int64.gt = 0];
    string name  = 2;
    string email = 3;
    string phone = 4;
}

message Update{Entity}Rsp {
    BaseResponse base = 1;
}

// ====== Delete ======
message Delete{Entity}Req {
    int64 id = 1 [(buf.validate.field).int64.gt = 0];
}

message Delete{Entity}Rsp {
    BaseResponse base = 1;
}

// ====== Service ======
service {Entity}Service {
    rpc Create{Entity} (Create{Entity}Req) returns (Create{Entity}Rsp) {}
    rpc Get{Entity}    (Get{Entity}Req)    returns (Get{Entity}Rsp)    {}
    rpc List{Entity}   (List{Entity}Req)   returns (List{Entity}Rsp)   {}
    rpc Update{Entity} (Update{Entity}Req) returns (Update{Entity}Rsp) {}
    rpc Delete{Entity} (Delete{Entity}Req) returns (Delete{Entity}Rsp) {}
}
```

---

## TPL-02: main.go

```go
package main

import (
    "log"
    "os"
    "os/signal"
    "syscall"

    trpc "trpc.tech/trpc-go/trpc-go"
    _ "trpc.tech/trpc-go/trpc-database/gorm"
    _ "trpc.tech/trpc-go/trpc-database/goredis"

    pb "trpc.tech/trpc-go/target/{app}/{server}"

    "your-project/internal/logic/{entity}"
    "your-project/internal/repo"
    "your-project/internal/service"
)

func main() {
    s := trpc.NewServer()

    // ====== 初始化 Repo 层 ======
    {entity}Repo, err := repo.New{Entity}Repo("trpc.mysql.{app}.{server}")
    if err != nil {
        log.Fatalf("init {entity} repo failed: %v", err)
    }

    // 可选：Redis 缓存
    var {entity}Cache repo.{Entity}Cache
    if needCache {
        {entity}Cache, err = repo.New{Entity}Cache("trpc.redis.{app}.cache")
        if err != nil {
            log.Printf("warn: init {entity} cache failed: %v, continue without cache", err)
        }
    }

    // ====== 初始化 Logic 层 ======
    {entity}Logic := {entity}.New{Entity}Logic({entity}Repo, {entity}Cache)

    // ====== 初始化 Service 层并注册 ======
    {entity}Svc := service.New{Entity}Service({entity}Logic)
    pb.Register{Entity}ServiceService(s.Service("trpc.{app}.{server}.{Entity}Service"), {entity}Svc)

    // ====== 优雅关闭 ======
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

    go func() {
        if err := s.Serve(); err != nil {
            log.Fatalf("server serve failed: %v", err)
        }
    }()

    <-quit
    log.Println("shutting down server...")
    s.Close(nil)
}
```

---

## TPL-03: Service 层（完整）

```go
// internal/service/{entity}_service.go
package service

import (
    "context"
    "time"

    pb "trpc.tech/trpc-go/target/app/{entity}"
    "trpc.tech/trpc-go/trpc-go/errs"
    "trpc.tech/trpc-go/trpc-go/log"

    "your-project/internal/entity"
    "your-project/internal/logic/{entity}"
)

// {Entity}ServiceImpl 无状态 Handler
type {Entity}ServiceImpl struct {
    logic {entity}.{Entity}Logic
}

func New{Entity}Service(l {entity}.{Entity}Logic) *{Entity}ServiceImpl {
    return &{Entity}ServiceImpl{logic: l}
}

// Create 创建
func (s *{Entity}ServiceImpl) Create{Entity}(ctx context.Context, req *pb.Create{Entity}Req) (*pb.Create{Entity}Rsp, error) {
    id, err := s.logic.Create(ctx, &{entity}.CreateReq{
        Name:  req.Name,
        Email: req.Email,
        Phone: req.Phone,
    })
    if err != nil {
        log.ErrorContext(ctx, "create {entity} failed", "req", req, "error", err)
        return nil, errs.Wrap(err, "create {entity} failed")
    }
    return &pb.Create{Entity}Rsp{
        Base: &pb.BaseResponse{Code: 0, Msg: "success"},
        Id:   id,
    }, nil
}

// Get 获取
func (s *{Entity}ServiceImpl) Get{Entity}(ctx context.Context, req *pb.Get{Entity}Req) (*pb.Get{Entity}Rsp, error) {
    data, err := s.logic.Get(ctx, req.Id)
    if err != nil {
        if code := errs.Code(err); code >= 10000 {
            return &pb.Get{Entity}Rsp{
                Base: &pb.BaseResponse{Code: int32(code), Msg: errs.Msg(err)},
            }, nil
        }
        log.ErrorContext(ctx, "get {entity} failed", "id", req.Id, "error", err)
        return nil, errs.Wrap(err, "get {entity} failed")
    }
    return &pb.Get{Entity}Rsp{
        Base: &pb.BaseResponse{Code: 0},
        Info: convertToPB(data),
    }, nil
}

// List 列表
func (s *{Entity}ServiceImpl) List{Entity}(ctx context.Context, req *pb.List{Entity}Req) (*pb.List{Entity}Rsp, error) {
    filters := make([]{entity}.Filter, 0)
    if req.Keyword != "" {
        filters = append(filters, {entity}.WithKeyword(req.Keyword))
    }
    if req.Status > 0 {
        filters = append(filters, {entity}.WithStatus(req.Status))
    }
    list, total, err := s.logic.List(ctx, req.Page, req.PageSize, filters...)
    if err != nil {
        log.ErrorContext(ctx, "list {entity} failed", "req", req, "error", err)
        return nil, errs.Wrap(err, "list {entity} failed")
    }
    pbList := make([]*pb.{Entity}Info, 0, len(list))
    for _, item := range list {
        pbList = append(pbList, convertToPB(item))
    }
    return &pb.List{Entity}Rsp{
        Base:  &pb.BaseResponse{Code: 0},
        List:  pbList,
        Total: total,
    }, nil
}

// Update 更新
func (s *{Entity}ServiceImpl) Update{Entity}(ctx context.Context, req *pb.Update{Entity}Req) (*pb.Update{Entity}Rsp, error) {
    if err := s.logic.Update(ctx, &{entity}.UpdateReq{
        ID:    req.Id,
        Name:  req.Name,
        Email: req.Email,
        Phone: req.Phone,
    }); err != nil {
        if code := errs.Code(err); code >= 10000 {
            return &pb.Update{Entity}Rsp{
                Base: &pb.BaseResponse{Code: int32(code), Msg: errs.Msg(err)},
            }, nil
        }
        log.ErrorContext(ctx, "update {entity} failed", "id", req.Id, "error", err)
        return nil, errs.Wrap(err, "update {entity} failed")
    }
    return &pb.Update{Entity}Rsp{Base: &pb.BaseResponse{Code: 0}}, nil
}

// Delete 删除（软删除）
func (s *{Entity}ServiceImpl) Delete{Entity}(ctx context.Context, req *pb.Delete{Entity}Req) (*pb.Delete{Entity}Rsp, error) {
    if err := s.logic.Delete(ctx, req.Id); err != nil {
        if code := errs.Code(err); code >= 10000 {
            return &pb.Delete{Entity}Rsp{
                Base: &pb.BaseResponse{Code: int32(code), Msg: errs.Msg(err)},
            }, nil
        }
        log.ErrorContext(ctx, "delete {entity} failed", "id", req.Id, "error", err)
        return nil, errs.Wrap(err, "delete {entity} failed")
    }
    return &pb.Delete{Entity}Rsp{Base: &pb.BaseResponse{Code: 0}}, nil
}

// convertToPB 模型转 Proto
func convertToPB(m *entity.{Entity}) *pb.{Entity}Info {
    return &pb.{Entity}Info{
        Id:        m.ID,
        Name:      m.Name,
        Status:    int32(m.Status),
        CreatedAt: m.CreatedAt.Format(time.RFC3339),
        UpdatedAt: m.UpdatedAt.Format(time.RFC3339),
    }
}
```

---

## TPL-04: Logic 层接口

```go
// internal/logic/{entity}/api.go
package {entity}

import "context"

// {Entity}Logic 业务逻辑接口
type {Entity}Logic interface {
    Create(ctx context.Context, req *CreateReq) (int64, error)
    Get(ctx context.Context, id int64) (*Entity, error)
    List(ctx context.Context, page, pageSize int32, filters ...Filter) ([]*Entity, int64, error)
    Update(ctx context.Context, req *UpdateReq) error
    Delete(ctx context.Context, id int64) error
}

// CreateReq 创建请求
type CreateReq struct {
    Name  string
    Email string
    Phone string
}

// UpdateReq 更新请求
type UpdateReq struct {
    ID    int64
    Name  string
    Email string
    Phone string
}

// Entity 业务实体
type Entity struct {
    ID        int64
    Name      string
    Email     string
    Phone     string
    Status    int8
}

// Filter 列表筛选
type Filter func(*filterOptions)

type filterOptions struct {
    Keyword string
    Status  int32
}

func WithKeyword(k string) Filter    { return func(o *filterOptions) { o.Keyword = k } }
func WithStatus(s int32) Filter      { return func(o *filterOptions) { o.Status = s } }
```

---

## TPL-05: Logic 层实现

```go
// internal/logic/{entity}/api_impl.go
package {entity}

import (
    "context"
    "time"

    "trpc.tech/trpc-go/trpc-go/errs"
    "trpc.tech/trpc-go/trpc-go/log"

    "your-project/internal/repo"
)

var (
    Err{Entity}NotFound = errs.New(10404, "{entity} not found")
    Err{Entity}Duplicate = errs.New(10409, "{entity} already exists")
)

type {entity}LogicImpl struct {
    repo  repo.{Entity}Repo
    cache repo.{Entity}Cache
}

func New{Entity}Logic(r repo.{Entity}Repo, c repo.{Entity}Cache) {Entity}Logic {
    return &{entity}LogicImpl{repo: r, cache: c}
}

func (l *{entity}LogicImpl) Create(ctx context.Context, req *CreateReq) (int64, error) {
    // 可选：检查是否重复
    // ...
    entity := &repo.{Entity}{
        Name:   req.Name,
        Email:  req.Email,
    }
    if err := l.repo.Create(ctx, entity); err != nil {
        return 0, errs.Wrap(err, "create {entity} failed")
    }
    return entity.ID, nil
}

func (l *{entity}LogicImpl) Get(ctx context.Context, id int64) (*Entity, error) {
    // 1. 查缓存
    if l.cache != nil {
        if data, err := l.cache.Get(ctx, id); err == nil && data != nil {
            return toEntity(data), nil
        }
    }
    // 2. 查数据库
    data, err := l.repo.FindByID(ctx, id)
    if err != nil {
        return nil, err
    }
    // 3. 异步回写缓存
    if l.cache != nil {
        go func() {
            ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
            defer cancel()
            if err := l.cache.Set(ctx, id, data, 10*time.Minute); err != nil {
                log.WarnContext(ctx, "cache set failed", "id", id, "error", err)
            }
        }()
    }
    return toEntity(data), nil
}

func (l *{entity}LogicImpl) List(ctx context.Context, page, pageSize int32, filters ...Filter) ([]*Entity, int64, error) {
    opts := applyFilters(filters...)
    offset := int((page - 1) * pageSize)
    limit := int(pageSize)
    list, total, err := l.repo.List(ctx, offset, limit, opts)
    if err != nil {
        return nil, 0, err
    }
    result := make([]*Entity, 0, len(list))
    for _, item := range list {
        result = append(result, toEntity(item))
    }
    return result, total, nil
}

func (l *{entity}LogicImpl) Update(ctx context.Context, req *UpdateReq) error {
    return l.repo.Update(ctx, &repo.{Entity}{
        ID:    req.ID,
        Name:  req.Name,
        Email: req.Email,
    })
}

func (l *{entity}LogicImpl) Delete(ctx context.Context, id int64) error {
    return l.repo.Delete(ctx, id)
}

func applyFilters(filters ...Filter) *filterOptions {
    opts := &filterOptions{}
    for _, f := range filters {
        f(opts)
    }
    return opts
}

func toEntity(m *repo.{Entity}) *Entity {
    return &Entity{
        ID:     m.ID,
        Name:   m.Name,
        Email:  m.Email,
        Status: m.Status,
    }
}
```

---

## TPL-06: MySQL Repo（GORM）

```go
// internal/repo/mysql_{entity}.go
package repo

import (
    "context"
    "errors"
    "fmt"
    "time"

    "gorm.io/gorm"
    "trpc.tech/trpc-go/trpc-database/gorm"
    "trpc.tech/trpc-go/trpc-go/errs"
)

// {Entity}Repo 数据访问接口
type {Entity}Repo interface {
    FindByID(ctx context.Context, id int64) (*{Entity}, error)
    Create(ctx context.Context, e *{Entity}) error
    Update(ctx context.Context, e *{Entity}) error
    Delete(ctx context.Context, id int64) error
    List(ctx context.Context, offset, limit int, opts *filterOptions) ([]*{Entity}, int64, error)
    Transaction(ctx context.Context, fn func(tx *gorm.DB) error) error
}

// {Entity} 数据模型
type {Entity} struct {
    ID        int64          `gorm:"primaryKey;autoIncrement" json:"id"`
    Name      string         `gorm:"size:100;not null" json:"name"`
    Email     string         `gorm:"size:100;not null" json:"email"`
    Phone     string         `gorm:"size:20" json:"phone"`
    Status    int8           `gorm:"index;default:1" json:"status"`
    CreatedAt time.Time      `json:"created_at"`
    UpdatedAt time.Time      `json:"updated_at"`
    DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func ({Entity}) TableName() string { return "{entity}s" }

type {entity}RepoImpl struct {
    db *gorm.DB
}

func New{Entity}Repo(serviceName string) ({Entity}Repo, error) {
    db, err := gorm.NewClientProxy(serviceName)
    if err != nil {
        return nil, err
    }
    return &{entity}RepoImpl{db: db}, nil
}

func (r *{entity}RepoImpl) FindByID(ctx context.Context, id int64) (*{Entity}, error) {
    var e {Entity}
    err := r.db.WithContext(ctx).
        Where("id = ? AND deleted_at IS NULL", id).
        First(&e).Error
    if err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, errs.New(10404, "{entity} not found")
        }
        return nil, fmt.Errorf("find {entity} by id %d: %w", id, err)
    }
    return &e, nil
}

func (r *{entity}RepoImpl) Create(ctx context.Context, e *{Entity}) error {
    return r.db.WithContext(ctx).Create(e).Error
}

func (r *{entity}RepoImpl) Update(ctx context.Context, e *{Entity}) error {
    result := r.db.WithContext(ctx).
        Model(&{Entity}{}).
        Where("id = ? AND deleted_at IS NULL", e.ID).
        Updates(map[string]interface{}{
            "name":       e.Name,
            "email":      e.Email,
            "phone":      e.Phone,
            "updated_at": time.Now(),
        })
    if result.Error != nil {
        return result.Error
    }
    if result.RowsAffected == 0 {
        return errs.New(10404, "{entity} not found")
    }
    return nil
}

func (r *{entity}RepoImpl) Delete(ctx context.Context, id int64) error {
    result := r.db.WithContext(ctx).
        Model(&{Entity}{}).
        Where("id = ?", id).
        Update("deleted_at", time.Now())
    if result.Error != nil {
        return result.Error
    }
    if result.RowsAffected == 0 {
        return errs.New(10404, "{entity} not found")
    }
    return nil
}

func (r *{entity}RepoImpl) List(ctx context.Context, offset, limit int, opts *filterOptions) ([]*{Entity}, int64, error) {
    query := r.db.WithContext(ctx).Model(&{Entity}{}).Where("deleted_at IS NULL")

    if opts.Keyword != "" {
        query = query.Where("name LIKE ? OR email LIKE ?",
            "%"+opts.Keyword+"%", "%"+opts.Keyword+"%")
    }
    if opts.Status > 0 {
        query = query.Where("status = ?", opts.Status)
    }

    var total int64
    if err := query.Count(&total).Error; err != nil {
        return nil, 0, err
    }

    var list []*{Entity}
    if err := query.Offset(offset).Limit(limit).
        Order("id DESC").Find(&list).Error; err != nil {
        return nil, 0, err
    }
    return list, total, nil
}

func (r *{entity}RepoImpl) Transaction(ctx context.Context, fn func(tx *gorm.DB) error) error {
    return r.db.WithContext(ctx).Transaction(fn)
}
```

---

## TPL-07: Redis Cache

```go
// internal/repo/redis_{entity}.go
package repo

import (
    "context"
    "encoding/json"
    "fmt"
    "time"

    "github.com/redis/go-redis/v9"
    redisplugin "trpc.tech/trpc-go/trpc-database/goredis"
)

// {Entity}Cache 缓存接口
type {Entity}Cache interface {
    Get(ctx context.Context, id int64) (*{Entity}, error)
    Set(ctx context.Context, id int64, e *{Entity}, ttl time.Duration) error
    Del(ctx context.Context, id int64) error
}

var ErrCacheMiss = fmt.Errorf("cache: miss")

type {entity}CacheImpl struct {
    cli *redisplugin.ClientProxy
}

func New{Entity}Cache(serviceName string) ({Entity}Cache, error) {
    return &{entity}CacheImpl{
        cli: redisplugin.NewClientProxy(serviceName),
    }, nil
}

func (c *{entity}CacheImpl) key(id int64) string {
    return fmt.Sprintf("{entity}:detail:%d", id)
}

func (c *{entity}CacheImpl) Get(ctx context.Context, id int64) (*{Entity}, error) {
    data, err := c.cli.Get(ctx, c.key(id)).Bytes()
    if err != nil {
        if err == redis.Nil {
            return nil, ErrCacheMiss
        }
        return nil, err
    }
    var e {Entity}
    if err := json.Unmarshal(data, &e); err != nil {
        return nil, err
    }
    return &e, nil
}

func (c *{entity}CacheImpl) Set(ctx context.Context, id int64, e *{Entity}, ttl time.Duration) error {
    data, err := json.Marshal(e)
    if err != nil {
        return err
    }
    return c.cli.Set(ctx, c.key(id), data, ttl).Err()
}

func (c *{entity}CacheImpl) Del(ctx context.Context, id int64) error {
    return c.cli.Del(ctx, c.key(id)).Err()
}
```

---

## TPL-08: Kafka Producer

```go
// internal/repo/kafka_producer.go
package repo

import (
    "context"
    "encoding/json"
    "fmt"

    "github.com/IBM/sarama"
    "trpc.tech/trpc-go/trpc-database/kafka"
    "trpc.tech/trpc-go/trpc-go/log"
)

// {Entity}Event 事件定义
type {Entity}Event struct {
    EventType string `json:"event_type"` // created / updated / deleted
    ID        int64  `json:"id"`
    Timestamp int64  `json:"timestamp"`
    Payload   any    `json:"payload,omitempty"`
}

// {Entity}Producer 生产者接口
type {Entity}Producer interface {
    Send(ctx context.Context, key string, event *{Entity}Event) error
}

type {entity}ProducerImpl struct {
    producer sarama.SyncProducer
    topic    string
}

func New{Entity}Producer(serviceName, topic string) ({Entity}Producer, error) {
    return &{entity}ProducerImpl{
        producer: kafka.NewProducer(serviceName),
        topic:    topic,
    }, nil
}

func (p *{entity}ProducerImpl) Send(ctx context.Context, key string, event *{Entity}Event) error {
    data, err := json.Marshal(event)
    if err != nil {
        return fmt.Errorf("marshal event: %w", err)
    }
    msg := &sarama.ProducerMessage{
        Topic: p.topic,
        Key:   sarama.StringEncoder(key),
        Value: sarama.ByteEncoder(data),
    }
    partition, offset, err := p.producer.SendMessage(msg)
    if err != nil {
        log.ErrorContextf(ctx, "kafka send failed: %v, topic=%s, key=%s", err, p.topic, key)
        return err
    }
    log.DebugContextf(ctx, "kafka sent: topic=%s, partition=%d, offset=%d", p.topic, partition, offset)
    return nil
}
```

---

## TPL-09: Kafka Consumer

```go
// internal/repo/kafka_consumer.go
package repo

import (
    "context"
    "encoding/json"

    "github.com/IBM/sarama"
    "trpc.tech/trpc-go/trpc-go/log"
)

// {Entity}Consumer 消费者
type {Entity}Consumer struct {
    handler func(ctx context.Context, event *{Entity}Event) error
    dlq     *DeadLetterQueue
}

func New{Entity}Consumer(handler func(ctx context.Context, event *{Entity}Event) error, dlq *DeadLetterQueue) *{Entity}Consumer {
    return &{Entity}Consumer{handler: handler, dlq: dlq}
}

// Handle 消费消息。⚠️ 必须始终返回 nil！
func (c *{Entity}Consumer) Handle(ctx context.Context, msg *sarama.ConsumerMessage) error {
    var event {Entity}Event
    if err := json.Unmarshal(msg.Value, &event); err != nil {
        log.ErrorContextf(ctx, "unmarshal {entity} event failed: %v, topic=%s, offset=%d",
            err, msg.Topic, msg.Offset)
        return nil // 返回 nil，避免无限重试
    }

    if err := c.handler(ctx, &event); err != nil {
        log.ErrorContextf(ctx, "handle {entity} event failed: %v, event=%+v", err, event)
        // 发送死信队列
        if c.dlq != nil {
            if dlqErr := c.dlq.Send(msg); dlqErr != nil {
                log.Errorf("dlq send failed: %v", dlqErr)
            }
        }
    }
    return nil // 始终返回 nil
}
```

---

## TPL-10: 单元测试（table-driven）

```go
// internal/service/{entity}_service_test.go
package service_test

import (
    "context"
    "testing"

    "github.com/golang/mock/gomock"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"

    pb "trpc.tech/trpc-go/target/app/{entity}"
    "trpc.tech/trpc-go/trpc-go/errs"

    "your-project/internal/entity"
    "your-project/internal/logic/{entity}"
    "your-project/internal/service"
)

func Test{Entity}Service_Get{Entity}(t *testing.T) {
    tests := []struct {
        name    string
        req     *pb.Get{Entity}Req
        mockFn  func(m *Mock{Entity}Logic)
        want    *pb.Get{Entity}Rsp
        wantErr bool
    }{
        {
            name: "success",
            req:  &pb.Get{Entity}Req{Id: 1},
            mockFn: func(m *Mock{Entity}Logic) {
                m.EXPECT().
                    Get(gomock.Any(), int64(1)).
                    Return(&{entity}.Entity{ID: 1, Name: "test"}, nil)
            },
            want: &pb.Get{Entity}Rsp{
                Base: &pb.BaseResponse{Code: 0},
                Info: &pb.{Entity}Info{Id: 1, Name: "test"},
            },
            wantErr: false,
        },
        {
            name: "not found",
            req:  &pb.Get{Entity}Req{Id: 999},
            mockFn: func(m *Mock{Entity}Logic) {
                m.EXPECT().
                    Get(gomock.Any(), int64(999)).
                    Return(nil, errs.New(10404, "not found"))
            },
            want: &pb.Get{Entity}Rsp{
                Base: &pb.BaseResponse{Code: 10404, Msg: "not found"},
            },
            wantErr: false,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            ctrl := gomock.NewController(t)
            defer ctrl.Finish()

            mock := {entity}.NewMock{Entity}Logic(ctrl)
            tt.mockFn(mock)

            svc := service.New{Entity}Service(mock)
            got, err := svc.Get{Entity}(context.Background(), tt.req)

            if tt.wantErr {
                require.Error(t, err)
                return
            }
            require.NoError(t, err)
            assert.Equal(t, tt.want.Base.Code, got.Base.Code)
            if tt.want.Info != nil {
                assert.Equal(t, tt.want.Info.Id, got.Info.Id)
                assert.Equal(t, tt.want.Info.Name, got.Info.Name)
            }
        })
    }
}
```
