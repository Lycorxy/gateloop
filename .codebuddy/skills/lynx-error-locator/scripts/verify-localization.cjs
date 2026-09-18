#!/usr/bin/env node
/**
 * lynx-error-locator — 代码位置真实性校验（类型 A 收敛型，exit code 门禁）
 *
 * 用法：
 *   node verify-localization.cjs <error-localization.json> [workspaceRoot]
 *
 * 校验项（模型无法伪造）：
 *   1. cause.rootCause 非空且 >= 10 字符
 *   2. codeLocations 非空，每项 file 指向真实存在的文件
 *   3. line 存在时必须为整数且 1 <= line <= 文件总行数
 *   4. 每项 evidence 非空且 >= 10 字符
 *   5. confidence ∈ {high, medium, low}
 *   6. evidence 数组非空
 *
 * exit 0 = 通过；exit 1 = 失败（输出失败清单）
 */
const fs = require('fs');
const path = require('path');

const input = process.argv[2];
const root = process.argv[3] ? path.resolve(process.argv[3]) : process.cwd();

if (!input) {
  console.error('Usage: node verify-localization.cjs <error-localization.json> [workspaceRoot]');
  process.exit(1);
}

const fail = [];

let loc;
try {
  loc = JSON.parse(fs.readFileSync(input, 'utf8'));
} catch (e) {
  console.error('Cannot read/parse localization JSON: ' + e.message);
  process.exit(1);
}

// 1. cause
if (!loc.cause || !loc.cause.rootCause || String(loc.cause.rootCause).trim().length < 10) {
  fail.push('cause.rootCause missing or too short (<10 chars)');
}

// 2-4. codeLocations
const locations = Array.isArray(loc.codeLocations) ? loc.codeLocations : null;
if (!locations || locations.length === 0) {
  fail.push('codeLocations is empty — at least one code location required');
}

let validCount = 0;
for (let i = 0; i < (locations || []).length; i++) {
  const l = locations[i];
  const tag = 'codeLocations[' + i + ']';
  if (!l.file || typeof l.file !== 'string') {
    fail.push(tag + '.file missing');
    continue;
  }
  // 文件存在性：相对 workspaceRoot → 相对 cwd → 绝对路径
  const candidates = [
    path.isAbsolute(l.file) ? l.file : path.join(root, l.file),
    path.resolve(l.file),
  ];
  let real = null;
  for (const p of candidates) {
    try {
      if (fs.statSync(p).isFile()) {
        real = p;
        break;
      }
    } catch (e) {
      /* try next */
    }
  }
  if (!real) {
    fail.push(tag + '.file not found: ' + l.file);
    continue;
  }
  // 行号有效性
  if (l.line !== undefined && l.line !== null) {
    const ln = Number(l.line);
    if (!Number.isInteger(ln) || ln < 1) {
      fail.push(tag + '.line invalid: ' + l.line);
    } else {
      const total = fs.readFileSync(real, 'utf8').split('\n').length;
      if (ln > total) {
        fail.push(tag + '.line=' + ln + ' exceeds file total lines ' + total + ' (' + l.file + ')');
      }
    }
  }
  if (!l.evidence || String(l.evidence).trim().length < 10) {
    fail.push(tag + '.evidence missing or too short (<10 chars)');
  } else {
    validCount += 1;
  }
}

// 5. confidence
if (!['high', 'medium', 'low'].includes(loc.confidence)) {
  fail.push('confidence must be one of high|medium|low, got: ' + JSON.stringify(loc.confidence));
}

// 6. evidence
if (!Array.isArray(loc.evidence) || loc.evidence.length === 0) {
  fail.push('evidence array is empty — supporting evidence required');
}

if (fail.length) {
  console.error('localization verification FAILED (' + fail.length + ' issue(s)):');
  fail.forEach((f) => console.error('  X ' + f));
  process.exit(1);
}
console.log(
  'localization OK: ' + locations.length + ' location(s), ' +
  validCount + ' with evidence, confidence=' + loc.confidence
);
