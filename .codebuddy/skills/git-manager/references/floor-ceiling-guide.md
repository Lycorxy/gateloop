# 脚本（地板）vs 模型（天花板）分工判定 — git-manager

> git-manager 是**全收敛型** skill：所有验证通过 exit code 判定，无主观维度，不配 review。

## 5 类分工

| 类型 | 归属 | git-manager 中的体现 |
|------|------|---------------------|
| A 收敛型 | 脚本 exit code | 命令执行成功/失败（exit code 0/非0） |
| B 完备性 | 脚本 schema | resolve anchor 的命令 JSON 结构校验 |
| C 度量回灌 | 脚本粗筛→模型精判 | N/A（无度量维度） |
| D 主观可评审 | review.model | N/A（无主观维度） |
| E 纯审美 | 模型自由 | N/A（无审美维度） |

## 判定依据

```
命令是否存在？
  → 类型 A：命令在 SKILL.md 速查表中，不存在 = 报错

命令参数是否正确？
  → 类型 A：参照 cli-reference.md，错误参数 = 命令报错（exit code 非0）

命令执行是否成功？
  → 类型 A：exit code 0 = 成功，非 0 = 失败

resolve anchor 产物结构？
  → 类型 B：JSON Schema 校验 command 字段存在
```

## 结论

git-manager **不配 review**（全收敛型，无主观维度，参考 code-quality-guard 模式）。
所有验证通过 exit code 判定，resolve anchor 额外用 schema 校验产物结构。
