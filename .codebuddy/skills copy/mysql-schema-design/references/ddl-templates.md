# MySQL Schema Design — DDL 模板库

> 从知识库 `数据库设计规则引擎/R2-DDL模板库` 提取的核心模板。
> 完整版含 GORM 映射和详细说明见原始文件。

## 目录

- [TPL-001 标准业务主表](#tpl-001)
- [TPL-002 关联从表](#tpl-002)
- [TPL-003 字典配置表](#tpl-003)
- [TPL-004 日志操作记录表](#tpl-004)
- [TPL-005 树形结构表](#tpl-005)
- [TPL-006 状态机表](#tpl-006)
- [TPL-007 状态流转记录表](#tpl-007)
- [TPL-008 多对多中间表](#tpl-008)
- [CMB-001 RBAC权限体系(5表)](#cmb-001)
- [CMB-002 审批流程引擎(4表)](#cmb-002)
- [CMB-003 工单系统(3表)](#cmb-003)

---

<a id="tpl-001"></a>
## TPL-001: 标准业务主表

适用：用户、商品、文章、项目等核心实体。

```sql
CREATE TABLE `{table_name}` (
    `id`            BIGINT        NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
    -- 业务字段按需添加
    -- `name`         VARCHAR(100)  NOT NULL DEFAULT ''     COMMENT '名称',
    -- `status`       TINYINT       NOT NULL DEFAULT 0      COMMENT '状态: 0-禁用 1-启用',

    -- 审计字段（必选）
    `created_by`    BIGINT        NOT NULL DEFAULT 0       COMMENT '创建人ID',
    `updated_by`    BIGINT        NOT NULL DEFAULT 0       COMMENT '更新人ID',
    `create_time`   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time`   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    -- 软删除（必选）
    `is_deleted`    TINYINT(1)    NOT NULL DEFAULT 0       COMMENT '逻辑删除: 0-正常 1-已删除',

    -- 乐观锁（高并发更新推荐）
    -- `version`      INT           NOT NULL DEFAULT 0       COMMENT '乐观锁版本号',

    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='{table_comment}';
```

---

<a id="tpl-002"></a>
## TPL-002: 关联从表

适用：订单明细、评论、附件等一对多关系的"多"端。无 FOREIGN KEY。

```sql
CREATE TABLE `{parent_table}_{child_name}` (
    `id`                BIGINT    NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
    `{parent_table}_id`  BIGINT    NOT NULL                 COMMENT '关联父表ID',

    -- 业务字段
    -- `content`          VARCHAR(500) NOT NULL DEFAULT ''  COMMENT '内容',

    `created_by`        BIGINT    NOT NULL DEFAULT 0       COMMENT '创建人ID',
    `create_time`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

    PRIMARY KEY (`id`),
    KEY `idx_{parent}_id` (`{parent_table}_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='{parent_comment}{child_comment}';
```

---

<a id="tpl-003"></a>
## TPL-003: 字典/配置表

```sql
CREATE TABLE `sys_config` (
    `id`            BIGINT        NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
    `config_key`    VARCHAR(100)  NOT NULL                 COMMENT '配置键(唯一)',
    `config_value`  TEXT          NOT NULL                 COMMENT '配置值(JSON)',
    `config_type`   TINYINT       NOT NULL DEFAULT 1        COMMENT '类型: 1-系统 2-租户 3-用户',
    `remark`        VARCHAR(255)  DEFAULT NULL             COMMENT '备注',
    `created_by`    BIGINT        NOT NULL DEFAULT 0       COMMENT '创建人',
    `create_time`   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `is_deleted`    TINYINT(1)    NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_config_key` (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统配置表';
```

---

<a id="tpl-004"></a>
## TPL-004: 日志/操作记录表

特点：只写不改、数据量大、需归档。无 update_time / is_deleted。

```sql
CREATE TABLE `sys_operation_log` (
    `id`              BIGINT       NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
    `module`          VARCHAR(50)  NOT NULL                 COMMENT '模块名',
    `operation`       VARCHAR(50)  NOT NULL                 COMMENT '操作类型',
    `method`          VARCHAR(200) NOT NULL                 COMMENT '请求方法',
    `request_url`     VARCHAR(500) DEFAULT NULL             COMMENT '请求URL',
    `request_params`  TEXT         DEFAULT NULL             COMMENT '请求参数(JSON)',
    `response_data`   TEXT         DEFAULT NULL             COMMENT '响应结果(JSON)',
    `user_id`         BIGINT       NOT NULL DEFAULT 0       COMMENT '操作人ID',
    `ip`              INT UNSIGNED NOT NULL DEFAULT 0        COMMENT 'IP(INET_ATON)',
    `duration`        INT         NOT NULL DEFAULT 0        COMMENT '耗时(ms)',
    `status`          TINYINT     NOT NULL DEFAULT 1        COMMENT '状态: 1-成功 0-失败',
    `error_msg`       VARCHAR(1000) DEFAULT NULL           COMMENT '错误信息',
    `create_time`     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_module_time` (`module`, `create_time`),
    KEY `idx_user_time` (`user_id`, `create_time`),
    KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作日志表';
-- 归档策略: 保留90天热数据 → 分批删除或归档到历史表
```

---

<a id="tpl-005"></a>
## TPL-005: 树形结构表

适用：组织架构、菜单、分类、地区。使用 ancestors 路径法。

```sql
CREATE TABLE `sys_dept` (
    `id`            BIGINT        NOT NULL AUTO_INCREMENT  COMMENT '部门ID',
    `parent_id`     BIGINT        NOT NULL DEFAULT 0       COMMENT '父ID(根=0)',
    `ancestors`     VARCHAR(500)  NOT NULL DEFAULT ''      COMMENT '祖级路径(逗号分隔,如 "0,100,101")',
    `dept_name`     VARCHAR(100)  NOT NULL                 COMMENT '名称',
    `order_num`     INT           NOT NULL DEFAULT 0       COMMENT '排序',
    `leader`        VARCHAR(20)   DEFAULT NULL             COMMENT '负责人',
    `phone`         CHAR(11)      DEFAULT NULL             COMMENT '电话',
    `status`        TINYINT       NOT NULL DEFAULT 1        COMMENT '状态: 0-禁用 1-启用',
    `created_by`    BIGINT        NOT NULL DEFAULT 0,
    `update_time`   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `is_deleted`    TINYINT(1)    NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_dept_name` (`dept_name`),
    KEY `idx_parent_id` (`parent_id`),
    KEY `idx_ancestors` (`ancestors`(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='部门表';
```

---

<a id="tpl-006"></a>
## TPL-006: 状态机表

适用：工单、审批实例、订单等有状态流转的实体。

```sql
CREATE TABLE `{entity_name}` (
    `id`              BIGINT      NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
    `{entity_code}`   VARCHAR(64) NOT NULL                 COMMENT '业务编码(唯一)',

    -- 状态机核心
    `current_status`  TINYINT     NOT NULL DEFAULT 0      COMMENT '当前状态',
    -- 状态定义在 COMMENT 中列出所有值和含义

    `assignee_id`     BIGINT      NOT NULL DEFAULT 0       COMMENT '当前处理人ID',
    `deadline`        DATETIME    DEFAULT NULL             COMMENT '截止时间',

    -- 审计
    `created_by`      BIGINT      NOT NULL DEFAULT 0       COMMENT '发起人',
    `create_time`     TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`     TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `finish_time`     DATETIME    DEFAULT NULL             COMMENT '完成时间',
    `is_deleted`      TINYINT(1)  NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_{code}` (`{entity_code}`),
    KEY `idx_status` (`current_status`),
    KEY `idx_assignee` (`assignee_id`),
    KEY `idx_created_by_time` (`created_by`, `create_time`),
    KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='{entity_comment}';
```

---

<a id="tpl-007"></a>
## TPL-007: 状态流转记录表

与 TPL-006 配合，只写不改。

```sql
CREATE TABLE `{entity}_flow_log` (
    `id`              BIGINT      NOT NULL AUTO_INCREMENT,
    `{entity}_id`     BIGINT      NOT NULL                 COMMENT '关联实体ID',
    `from_status`     TINYINT     NOT NULL                 COMMENT '流转前状态',
    `to_status`       TINYINT     NOT NULL                 COMMENT '流转后状态',
    `operation`       VARCHAR(30) NOT NULL                 COMMENT '操作类型',
    `operator_id`      BIGINT      NOT NULL                 COMMENT '操作人ID',
    `operator_name`    VARCHAR(50) DEFAULT NULL             COMMENT '操作人姓名(冗余)',
    `comment`          VARCHAR(1000) DEFAULT NULL           COMMENT '意见',
    `create_time`      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_{entity}_id` (`{entity}_id`, `create_time`),
    KEY `idx_operator` (`operator_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='{entity}流转记录';
```

---

<a id="tpl-008"></a>
## TPL-008: 多对多中间表

```sql
CREATE TABLE `{a}_{b}_rel` (
    `id`          BIGINT    NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
    `{a}_id`      BIGINT    NOT NULL                 COMMENT '{A}ID',
    `{b}_id`      BIGINT    NOT NULL                 COMMENT '{B}ID',
    `created_by`  BIGINT    NOT NULL DEFAULT 0       COMMENT '创建人',
    `create_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_{a}_{b}` (`{a}_id`, `{b}_id`),
    KEY `idx_{a}_id` (`{a}_id`),
    KEY `idx_{b}_id` (`{b}_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='{A}-{B}关联表';
```

---

<a id="cmb-001"></a>
## CMB-001: RBAC 权限体系 (5 张表)

系统用户-角色-菜单-权限的完整模型。

**ER 图：**
```
sys_user ──┬── sys_user_role ──── sys_role ──┬── sys_role_menu ──── sys_menu
           │      (N:M)                    │      (N:M)
           └── sys_dept (N:1所属部门)
```

```sql
-- [1] 用户表（基于 TPL-001）
CREATE TABLE `sys_user` (
    `id`              BIGINT        NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
    `username`        VARCHAR(50)   NOT NULL                 COMMENT '账号(登录名)',
    `password`        VARCHAR(100)  NOT NULL                 COMMENT '密码(加密)',
    `nickname`        VARCHAR(50)   NOT NULL DEFAULT ''      COMMENT '昵称',
    `email`           VARCHAR(100)  DEFAULT NULL             COMMENT '邮箱',
    `phone`           CHAR(11)      DEFAULT NULL             COMMENT '手机号',
    `sex`             TINYINT       NOT NULL DEFAULT 0        COMMENT '性别: 0-未知 1-男 2-女',
    `status`          TINYINT       NOT NULL DEFAULT 1        COMMENT '状态: 0-禁用 1-启用',
    `dept_id`         BIGINT        DEFAULT NULL             COMMENT '所属部门ID',
    `last_login_time` DATETIME      DEFAULT NULL             COMMENT '最后登录时间',
    `last_login_ip`   INT UNSIGNED  DEFAULT NULL             COMMENT '最后登录IP',
    `created_by`      BIGINT        NOT NULL DEFAULT 0,
    `create_time`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `is_deleted`      TINYINT(1)    NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_username` (`username`),
    UNIQUE KEY `uk_phone` (`phone`),
    UNIQUE KEY `uk_email` (`email`),
    KEY `idx_dept_id` (`dept_id`),
    KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统用户表';

-- [2] 角色表
CREATE TABLE `sys_role` (
    `id`            BIGINT        NOT NULL AUTO_INCREMENT,
    `role_name`     VARCHAR(50)   NOT NULL                 COMMENT '角色名称',
    `role_key`      VARCHAR(50)   NOT NULL                 COMMENT '角色标识(admin/manager/user)',
    `role_sort`     INT           NOT NULL DEFAULT 0        COMMENT '排序',
    `data_scope`    TINYINT       NOT NULL DEFAULT 1        COMMENT '数据范围: 1-全部 2-自定义 3-本部门 4-本部门及以下 5-本人',
    `status`        TINYINT       NOT NULL DEFAULT 1        COMMENT '状态: 0-禁用 1-启用',
    `created_by`    BIGINT        NOT NULL DEFAULT 0,
    `create_time`   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `is_deleted`    TINYINT(1)    NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_role_key` (`role_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统角色表';

-- [3] 权限(菜单)表（基于 TPL-005 树形）
CREATE TABLE `sys_menu` (
    `id`            BIGINT        NOT NULL AUTO_INCREMENT  COMMENT '菜单ID',
    `parent_id`     BIGINT        NOT NULL DEFAULT 0       COMMENT '父ID(根=0)',
    `menu_name`     VARCHAR(50)   NOT NULL                 COMMENT '名称',
    `order_num`     INT           NOT NULL DEFAULT 0        COMMENT '排序',
    `path`          VARCHAR(200)  DEFAULT NULL             COMMENT '路由地址',
    `component`     VARCHAR(255)  DEFAULT NULL             COMMENT '组件路径',
    `menu_type`     CHAR(1)       NOT NULL DEFAULT 'M'      COMMENT '类型: M-目录 C-菜单 F-按钮',
    `perms`         VARCHAR(100)  DEFAULT NULL             COMMENT '权限标识(user:list)',
    `icon`          VARCHAR(100)  DEFAULT NULL             COMMENT '图标',
    `status`        TINYINT       NOT NULL DEFAULT 1,
    `created_by`    BIGINT        NOT NULL DEFAULT 0,
    `create_time`   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `is_deleted`    TINYINT(1)    NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_perms` (`perms`),
    KEY `idx_parent_id` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统菜单权限表';

-- [4] 用户-角色关联（基于 TPL-008）
CREATE TABLE `sys_user_role` (
    `id`          BIGINT    NOT NULL AUTO_INCREMENT,
    `user_id`     BIGINT    NOT NULL                 COMMENT '用户ID',
    `role_id`     BIGINT    NOT NULL                 COMMENT '角色ID',
    `created_by`  BIGINT    NOT NULL DEFAULT 0,
    `create_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_role` (`user_id`, `role_id`),
    KEY `idx_user_id` (`user_id`),
    KEY `idx_role_id` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户角色关联表';

-- [5] 角色-权限关联
CREATE TABLE `sys_role_menu` (
    `id`          BIGINT    NOT NULL AUTO_INCREMENT,
    `role_id`     BIGINT    NOT NULL                 COMMENT '角色ID',
    `menu_id`     BIGINT    NOT NULL                 COMMENT '菜单ID',
    `created_by`  BIGINT    NOT NULL DEFAULT 0,
    `create_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_role_menu` (`role_id`, `menu_id`),
    KEY `idx_role_id` (`role_id`),
    KEY `idx_menu_id` (`menu_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色菜单关联表';
```

---

<a id="cmb-002"></a>
## CMB-002: 审批流程引擎 (4 张表)

```sql
-- [1] 流程定义表
CREATE TABLE `wf_process_def` (
    `id`            BIGINT        NOT NULL AUTO_INCREMENT  COMMENT '流程定义ID',
    `process_key`   VARCHAR(64)   NOT NULL                 COMMENT '流程标识(leave_apply)',
    `process_name`  VARCHAR(100)  NOT NULL                 COMMENT '流程名称',
    `version`       INT           NOT NULL DEFAULT 1        COMMENT '版本号',
    `description`   VARCHAR(500)  DEFAULT NULL             COMMENT '描述',
    `form_config`   TEXT          DEFAULT NULL             COMMENT '表单配置(JSON)',
    `status`        TINYINT       NOT NULL DEFAULT 1        COMMENT '状态: 0-草稿 1-发布 2-停用',
    `created_by`    BIGINT        NOT NULL DEFAULT 0,
    `create_time`   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `is_deleted`    TINYINT(1)    NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_process_version` (`process_key`, `version`),
    KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程定义表';

-- [2] 流程节点定义表
CREATE TABLE `wf_node_def` (
    `id`              BIGINT       NOT NULL AUTO_INCREMENT  COMMENT '节点定义ID',
    `process_def_id`  BIGINT       NOT NULL                 COMMENT '流程定义ID',
    `node_key`        VARCHAR(64)  NOT NULL                 COMMENT '节点标识',
    `node_name`       VARCHAR(100) NOT NULL                 COMMENT '节点名称',
    `node_type`       TINYINT      NOT NULL                 COMMENT '类型: 1-开始 2-审批 3-抄送 4-条件 5-结束',
    `assignee_type`   TINYINT      NOT NULL DEFAULT 0        COMMENT '指定方式: 0-固定 1-部门主管 2-角色',
    `assignee_expr`   VARCHAR(255) DEFAULT NULL             COMMENT '指定表达式',
    `order_num`       INT          NOT NULL DEFAULT 0        COMMENT '节点顺序',
    `time_limit`      INT          DEFAULT NULL             COMMENT '时限(小时)',
    `created_by`      BIGINT       NOT NULL DEFAULT 0,
    `create_time`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_process_def` (`process_def_id`, `order_num`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程节点定义表';

-- [3] 流程实例表（基于 TPL-006 状态机）
CREATE TABLE `wf_instance` (
    `id`              BIGINT       NOT NULL AUTO_INCREMENT  COMMENT '实例ID',
    `instance_no`     VARCHAR(32)  NOT NULL                 COMMENT '实例编号',
    `process_def_id`  BIGINT       NOT NULL                 COMMENT '流程定义ID',
    `process_key`     VARCHAR(64)  NOT NULL                 COMMENT '流程标识(冗余)',
    `business_key`    VARCHAR(64)  DEFAULT NULL             COMMENT '业务Key',
    `title`           VARCHAR(200) NOT NULL DEFAULT ''      COMMENT '标题',
    `current_node`    VARCHAR(64)  NOT NULL                 COMMENT '当前节点key',
    `current_status`  TINYINT      NOT NULL DEFAULT 1        COMMENT '状态: 1-运行中 2-已完成 3-已终止 4-已撤回',
    `applicant_id`    BIGINT       NOT NULL                 COMMENT '发起人ID',
    `start_time`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `end_time`        DATETIME     DEFAULT NULL             COMMENT '结束时间',
    `is_deleted`      TINYINT(1)   NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_instance_no` (`instance_no`),
    KEY `idx_applicant` (`applicant_id`, `start_time`),
    KEY `idx_business` (`business_key`),
    KEY `idx_status` (`current_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程实例表';

-- [4] 待办任务表
CREATE TABLE `wf_task` (
    `id`              BIGINT       NOT NULL AUTO_INCREMENT  COMMENT '任务ID',
    `instance_id`     BIGINT       NOT NULL                 COMMENT '流程实例ID',
    `task_name`       VARCHAR(100) NOT NULL                 COMMENT '任务名称',
    `node_key`        VARCHAR(64)  NOT NULL                 COMMENT '节点标识',
    `assignee_id`     BIGINT       NOT NULL                 COMMENT '待办人ID',
    `assignee_name`   VARCHAR(50)  DEFAULT NULL             COMMENT '待办人(冗余)',
    `task_status`     TINYINT      NOT NULL DEFAULT 0        COMMENT '状态: 0-待处理 1-已完成 2-已转办',
    `comment`         VARCHAR(2000) DEFAULT NULL            COMMENT '处理意见',
    `due_time`        DATETIME     DEFAULT NULL             COMMENT '到期时间',
    `completed_time`  DATETIME     DEFAULT NULL             COMMENT '完成时间',
    `create_time`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_assignee_status` (`assignee_id`, `task_status`),
    KEY `idx_instance` (`instance_id`, `node_key`),
    KEY `idx_due_time` (`due_time`, `task_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='审批待办任务表';
```

**核心查询与索引匹配：**
| 查询 | 索引 |
|------|------|
| 我的待办 | idx_assignee_status(assignee_id, task_status) |
| 我发起的 | idx_applicant(applicant_id, start_time) |
| 流程详情+历史 | idx_instance(instance_id, create_time) |

---

<a id="cmb-003"></a>
## CMB-003: 工单系统 (3 张表)

**状态流转：**
```
1-待接单 → 2-处理中 → 3-待确认 → 4-已完成
  ↑                      ↓
  └──── 6-已撤销 ← 5-已关闭
```

```sql
-- [1] 工单主表（基于 TPL-006 状态机）
CREATE TABLE `ticket` (
    `id`              BIGINT        NOT NULL AUTO_INCREMENT  COMMENT '工单ID',
    `ticket_no`       VARCHAR(32)   NOT NULL                 COMMENT '工单编号',
    `category_id`     BIGINT        NOT NULL                 COMMENT '分类ID',
    `priority`        TINYINT       NOT NULL DEFAULT 2        COMMENT '优先级: 1-低 2-中 3-高 4-紧急',
    `title`           VARCHAR(200)  NOT NULL                 COMMENT '标题',
    `content`         TEXT          NOT NULL                 COMMENT '描述',
    `reporter_id`     BIGINT        NOT NULL                 COMMENT '上报人ID',
    `handler_id`      BIGINT        NOT NULL DEFAULT 0       COMMENT '当前处理人ID',
    `current_status`  TINYINT       NOT NULL DEFAULT 1        COMMENT '状态(见流转图)',
    `accepted_time`   DATETIME      DEFAULT NULL             COMMENT '接单时间',
    `resolved_time`   DATETIME      DEFAULT NULL             COMMENT '解决时间',
    `closed_time`     DATETIME      DEFAULT NULL             COMMENT '关闭时间',
    `satisfaction`    TINYINT       DEFAULT NULL             COMMENT '满意度: 1~5',
    `source`          TINYINT       NOT NULL DEFAULT 1        COMMENT '来源: 1-Web 2-App 3-邮件',
    `created_by`      BIGINT        NOT NULL DEFAULT 0,
    `create_time`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `is_deleted`      TINYINT(1)    NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_ticket_no` (`ticket_no`),
    KEY `idx_reporter` (`reporter_id`, `create_time`),
    KEY `idx_handler` (`handler_id`, `current_status`),
    KEY `idx_category_status` (`category_id`, `current_status`),
    KEY `idx_priority_status` (`priority`, `current_status`),
    KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工单主表';

-- [2] 工单流转记录（基于 TPL-007）
CREATE TABLE `ticket_flow_log` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT,
    `ticket_id`     BIGINT       NOT NULL                 COMMENT '工单ID',
    `from_status`   TINYINT      NOT NULL                 COMMENT '流转前状态',
    `to_status`     TINYINT      NOT NULL                 COMMENT '流转后状态',
    `operator_id`   BIGINT       NOT NULL                 COMMENT '操作人ID',
    `operator_name`  VARCHAR(50)  DEFAULT NULL             COMMENT '操作人(冗余)',
    `action`        VARCHAR(30)  NOT NULL                 COMMENT '操作(assign/handle/resolve/close)',
    `comment`       VARCHAR(2000) DEFAULT NULL            COMMENT '处理内容',
    `internal`      TINYINT(1)   NOT NULL DEFAULT 0       COMMENT '内部备注: 0-否 1-是',
    `create_time`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_ticket_id` (`ticket_id`, `create_time`),
    KEY `idx_operator` (`operator_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工单流转记录';

-- [3] 工单附件表（基于 TPL-002）
CREATE TABLE `ticket_attachment` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT  COMMENT '附件ID',
    `ticket_id`   BIGINT       NOT NULL                 COMMENT '工单ID',
    `file_name`   VARCHAR(200) NOT NULL                 COMMENT '原始文件名',
    `file_path`   VARCHAR(500) NOT NULL                 COMMENT '存储路径(OSS)',
    `file_size`   BIGINT       NOT NULL DEFAULT 0       COMMENT '文件大小(字节)',
    `file_type`   VARCHAR(50)  DEFAULT NULL             COMMENT 'MIME类型',
    `uploader_id` BIGINT       NOT NULL                 COMMENT '上传人ID',
    `create_time` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_ticket_id` (`ticket_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工单附件表';
```
