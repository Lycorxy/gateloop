#!/bin/bash

echo "============================================================"
echo "ESLint 知识库自动生成（严格 6 步流程）"
echo "============================================================"
echo ""

echo "### 第一步：递归收集所有层级规则..."
node .codebuddy/skills/lint-knowledge/scripts/step1-collect.cjs
if [ $? -ne 0 ]; then
  echo "❌ 第一步失败！"
  exit 1
fi
echo ""

echo "### 第二步：生成 rules.json..."
echo "(第一步自动生成)"
echo ""

echo "### 第三步：脚本自动获取文档（模型不参与）..."
node .codebuddy/skills/lint-knowledge/scripts/step3-fetch-docs.cjs
if [ $? -ne 0 ]; then
  echo "❌ 第三步失败！"
  exit 1
fi
echo ""

echo "### 第四步：模型生成知识库..."
node .codebuddy/skills/lint-knowledge/scripts/step4-generate-kb.cjs
if [ $? -ne 0 ]; then
  echo "❌ 第四步失败！"
  exit 1
fi
echo ""

echo "### 第五步：支持增量更新..."
echo "(第一步自动检测)"
echo ""

echo "### 第六步：创建持久记忆和规则..."
echo "(第四步自动创建)"
echo ""

echo "============================================================"
echo "✅ 知识库生成完成！"
echo "============================================================"
echo "知识库位置: .codebuddy/knowledge/lint/"
echo "AI 规则位置: .codebuddy/rules/code-style.md"
echo ""
echo "已收集所有层级的规则"
echo "已生成详细文档"
echo "已创建持久记忆和规则"
echo ""
echo "现在每次生成代码都会遵守知识库规范！"
echo ""
