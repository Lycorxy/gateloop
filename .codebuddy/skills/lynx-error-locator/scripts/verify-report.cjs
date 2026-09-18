#!/usr/bin/env node
/**
 * lynx-error-locator — 报告章节完备性校验（类型 A 收敛型，exit code 门禁）
 *
 * 用法：
 *   node verify-report.cjs <error-analysis-report.md>
 *
 * 校验项：
 *   1. 必需章节（## ~ #### 标题包含关键词）：
 *      主提示词 / 错误原因 / 代码位置 / 解决方案 / 交接（后续修复说明）
 *   2. 报告正文 >= 800 字符（防空壳报告）
 *
 * exit 0 = 通过；exit 1 = 失败
 */
const fs = require('fs');

const input = process.argv[2];
if (!input) {
  console.error('Usage: node verify-report.cjs <error-analysis-report.md>');
  process.exit(1);
}

let md;
try {
  md = fs.readFileSync(input, 'utf8');
} catch (e) {
  console.error('Cannot read report: ' + e.message);
  process.exit(1);
}

const required = [
  ['主提示词', '主提示词（错误+用户描述，交给修复模型）'],
  ['错误原因', '错误原因（根因分析）'],
  ['代码位置', '代码位置清单'],
  ['解决方案', '解决方案草案'],
  ['交接|后续', '交接说明（后续修复流程如何使用本报告）'],
];

const fail = [];
for (const [kw, desc] of required) {
  const re = new RegExp('^#{2,4}\\s[^\\n]*(?:' + kw + ')', 'm');
  if (!re.test(md)) {
    fail.push('missing section: ' + desc + ' (keyword "' + kw + '")');
  }
}

if (md.length < 800) {
  fail.push('report too short (<800 chars) — looks like an empty shell');
}

if (fail.length) {
  console.error('report verification FAILED (' + fail.length + ' issue(s)):');
  fail.forEach((f) => console.error('  X ' + f));
  process.exit(1);
}
console.log('report OK: all required sections present (' + md.length + ' chars)');
