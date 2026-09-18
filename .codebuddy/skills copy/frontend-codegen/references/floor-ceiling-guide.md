# frontend-codegen · 五级分工（floor / ceiling）

本 skill 的验证采用 5 类分工：能机械判定的硬指标交给脚本 exit code，需语义/审美判断的交给模型精判，脚本只卡形式与存在性、不卡评审内容。下表对应 `anchor.config.json` 的 `verify` 字段。

| 类 | 分工 | 本 skill 落点 | 判定方式 |
|----|------|--------------|---------|
| A 脚本确定 | 能机械判定的硬指标 | `tsc` / `lint` / `build` / `prettier` / `fileSize` / `check-naming` / `style-crosscheck` / `verify-coverage` / `verify-completion` | 脚本 exit code，模型无法伪造 |
| B 模型评审 | 需语义/审美判断 | `design-review.json`（6 项）、`code-review.json`（9 项） | `review.model` 逐条 `verdict + evidence`（须含行号/符号引用） |
| C 收敛地板 | 规模/复杂度上限 | 文件 ≤360 行、函数 ≤25 行、圈复杂度 ≤10；11–13 允许 `// @complexity-justified: <理由>` 逃生口 | 脚本（`fileSize`/`check-naming`）+ 模型声明 |
| D 客观权重 | 架构/设计度量 | `metric design` / `metric architecture` / `metric code` / `metric style-crosscheck` | 脚本度量 → 模型逐条 `verdict`（真问题/误报/不确定） |
| E 分层门禁 | 阶段间数据闭包 | `inventory → design → code` 三层 anchor，逐层 `producesFresh` + `schema` + coverage 闭包 | 引擎强制重跑 verify，exit 0 才推进 |

原则：
- 确定项一律脚本化（A 类 + C 类 + D 类的度量部分），不确定项才进 B 类评审。
- 脚本只卡格式与存在性，不卡评审内容——防止模型用空话（无行号/符号引用的 evidence）糊弄过关。
- 每层都有客观断言（inventory 脚本枚举违规、verify-coverage 集合闭包、verify-completion 重跑清零），模型无法"只处理部分文件"蒙混。
