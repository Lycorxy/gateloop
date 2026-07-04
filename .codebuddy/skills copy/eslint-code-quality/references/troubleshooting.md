# 故障排除参考

> 按需注入，由 Step 2B.3 懒加载。

## 常见错误速查

| 错误 | 恢复方法 |
|------|----------|
| Prettier 未安装 | `npm install -D prettier` |
| ESLint 未安装 | `npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin` |
| Stylelint 未安装 | `npm install -D stylelint stylelint-config-standard` |
| 未找到配置文件 | 创建或使用 `npx nut-lint config` 诊断 |
| 权限被拒绝 | 检查文件是否在 IDE 中打开 |
| 超时(>30秒) | 拆分为较小批次（每批5个文件） |
| 发现 eslint-disable 注释 | 删除注释，从根本上修复被抑制的 lint 问题 |
| 圈复杂度 > 10 | 拆分函数为多个小函数，每个复杂度 ≤ 10 |

## 救回顺序

```
nut-lint fix 报错
  → 按上表逐条排查
  → 无法自动修复 → 读取对应 references/eslint--*.md 分析根因
  → 手动修复后 nut-lint run 验证
```
