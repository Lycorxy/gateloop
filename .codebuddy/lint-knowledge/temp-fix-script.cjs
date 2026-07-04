const fs = require('fs')

const filePath = '.codebuddy/skills/lint-knowledge/scripts/step4-generate-kb.cjs'
let content = fs.readFileSync(filePath, 'utf8')

// 直接替换字符串模式
content = content.replace(
    "if (cleanedCode.includes('//') || cleanedCode.includes('class') || cleanedCode.includes('function') || cleanedCode.includes('const') || cleanedCode.includes('let') || cleanedCode.includes('var')) {",
    "const hasCodeKeywords = cleanedCode.includes('class') || cleanedCode.includes('function') || cleanedCode.includes('const') || cleanedCode.includes('let') || cleanedCode.includes('var') || cleanedCode.includes('if') || cleanedCode.includes('for') || cleanedCode.includes('return') || cleanedCode.includes('=>')\n      const isNotCommentPlaceholder = !cleanedCode.includes('请根据规则') && !cleanedCode.includes('示例：') && !cleanedCode.includes('编写')\n      if (hasCodeKeywords && isNotCommentPlaceholder) {"
)

fs.writeFileSync(filePath, content, 'utf8')
console.log('✅ 已修改文件：step4-generate-kb.cjs')
