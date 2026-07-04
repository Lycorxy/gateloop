# 规则：no-ex-assign

## 📋 配置信息

| 项目 | 值 |
|------|-----|
| **规则名称** | `no-ex-assign` |
| **配置值** | `error` |
| **严重程度** | 错误 ❌ |
| **来源** | extends |
| **继承深度** | 1 |

**继承链**：
- `eslint:recommended` (深度 1)

---

## 📖 详细说明

禁止给异常变量赋值，catch 块中的异常变量不应该被重新赋值。

**官方文档**：[https://eslint.org/docs/latest/rules/no-ex-assign](https://eslint.org/docs/latest/rules/no-ex-assign)

**分类**：problem

---

## 💡 代码示例


### ✅ 正确示例

```javascript
// 符合规则的代码示例
// 规则要求：禁止给异常变量赋值，catch 块中的异常变量不应该被重新赋值。...
```

### ❌ 错误示例

```javascript
// 违反规则的代码示例
// 需要避免：禁止给异常变量赋值，catch 块中的异常变量不应该被重新赋值。...
```


---

## ⚙️ 配置选项

### 在 ESLint 配置文件中配置

```javascript
// .eslintrc.cjs
module.exports = {
  rules: {
    'no-ex-assign': 'error'
  }
}
```

### 可选配置值

| 值 | 说明 |
|-----|------|
| `"error"` | 产生错误（红色） |
| `"warn"` | 产生警告（黄色） |
| `"off"` | 关闭规则 |

---

## ❓ 常见问题

### Q: 这个规则的作用是什么？

**A:** 禁止给异常变量赋值，catch 块中的异常变量不应该被重新赋值。

### Q: 如何禁用这个规则？

**A:** 在配置文件中设置为 `"off"`：

```javascript
rules: {
  'no-ex-assign': 'off'
}
```

### Q: 为什么这个规则配置为 `error`？

**A:** 根据项目的 ESLint 配置，这个规则的严重程度为 **错误**，建议遵守此配置以确保代码质量。

### Q: 这条规则来自哪里？

**A:** eslint:recommended

---

## ✅ 最佳实践

1. **遵循规则配置**：严格遵守项目的 ESLint 配置要求
2. **理解规则意图**：理解规则为什么要这样配置，避免盲目禁用
3. **正确处理错误**：遇到规则提示时，认真检查并修复
4. **保持代码一致性**：在团队中保持统一的代码风格
5. **定期检查**：在提交代码前运行 ESLint 检查

---

## 🔗 相关资源

- [ESLint 官方文档](https://eslint.org/docs/latest/)
- [规则官方文档](https://eslint.org/docs/latest/rules/no-ex-assign)
- [项目配置文件](.eslintrc.cjs)
- [完整规则列表](./index.md)

---

> 📌 **提示**：此文档由 lint-knowledge skill 自动生成。如需更详细的信息，请参考官方文档。
