# DB Schema 设计规则

> 数据库表设计的权威规则，供 backend-design Skill 专用。

## 表设计规范

```
主键：id BIGINT UNSIGNED AUTO_INCREMENT
时间：created_at/updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
软删：is_deleted TINYINT DEFAULT 0
索引：至少一个业务查询索引
外键：用注解 -- ref: xxx.id，不建物理外键
字符集：utf8mb4/utf8mb4_general_ci
```

## 字段规范

```
所有字段必须有 NOT NULL + DEFAULT
所有字段必须有 COMMENT
外键字段必须有索引
禁止冗余索引
```

## 表名规则

```
⚠️ 项目真实表名规范（从 service/entity/model/ 提取）：
  Go Model 中通过 TableName() 方法指定表名
  表名格式：t_{业务模块}_{实体}（如 t_knowledge_doc, t_knowledge_doc_version, t_knowledge_reminder）

jsondb 表名规则（开发态）：
  表名 = Proto message 名.toLowerCase() + 's'（如 CoreCategoryInfo → corecategoryinfos）
  字段名 = camelCase（Proto snake_case 自动转换）
  JSON 文件：db/{表名}.json，_meta 必须含 primaryKey

⚠️ 两套表名必须在 GORM tag 和 jsondb 中分别正确配置
```

## 软删除规范（从真实代码提取）

```
⚠️ 项目使用 enabled 字段做软删除，不用 is_deleted：
  enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否有效：1有效 0无效'

  查询时：WHERE enabled = 1
  删除时：UPDATE SET enabled = 0, modified_user = ?
  不使用 gorm.DeletedAt

jsondb 开发态使用 isDeleted 字段：
  isDeleted: 0（有效）/ 1（已删除）
  查询时过滤 isDeleted = 0
```

## 500 错误预防（设计阶段就检查）

```
□ 表名与 jsondb 表名一致
□ GORM tag 与 MySQL 列名完全一致
□ 外键字段类型一致（都是 BIGINT UNSIGNED）
□ 字段默认值与 Go 零值兼容
```

## 种子数据规范

```json
{
  "_meta": {
    "primaryKey": "id",
    "autoIncrement": true
  },
  "rows": [
    {
      "id": 1,
      "name": "示例1",
      "createdAt": "2026-01-01T00:00:00Z",
      "isDeleted": 0
    },
    {
      "id": 2,
      "name": "示例2",
      "createdAt": "2026-01-01T00:00:00Z",
      "isDeleted": 0
    },
    {
      "id": 3,
      "name": "示例3",
      "createdAt": "2026-01-01T00:00:00Z",
      "isDeleted": 0
    }
  ]
}
```

## 命名转换规则

| 层         | 风格       | 示例            |
| ---------- | ---------- | --------------- |
| Proto/DB   | snake_case | category_id     |
| TypeScript | camelCase  | categoryId      |
| Go (pb)    | PascalCase | CategoryId      |
| CSS 类名   | kebab-case | .category-item  |
| 路由路径   | kebab-case | /core-knowledge |
