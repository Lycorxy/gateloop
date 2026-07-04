#!/usr/bin/env node
/**
 * sync-rules.js — 动态 Rules 注入/清理管理
 *
 * 将 skills/<name>/RULE.mdc 按需同步到 .codebuddy/rules/<name>/RULE.mdc
 * 框架自动扫描 .codebuddy/rules/ 并将 alwaysApply:true 的规则注入 System Prompt
 *
 * 用法:
 *   node sync-rules.js activate <name>
 *   node sync-rules.js deactivate <name>
 *   node sync-rules.js scan
 *   node sync-rules.js activate-all
 *   node sync-rules.js deactivate-all
 */
const fs = require('fs');
const path = require('path');

// 项目根目录（skill 在 .codebuddy/skills/specflow-rules-engine/scripts/ 下）
const root = path.resolve(__dirname, '..', '..', '..', '..');
const skillsDir = path.join(root, '.codebuddy', 'skills');
const rulesDir = path.join(root, '.codebuddy', 'rules');

const [action, name] = process.argv.slice(2);

function activate(skillName) {
  const src = path.join(skillsDir, skillName, 'RULE.mdc');
  if (!fs.existsSync(src)) {
    console.log(`[rules] skip: ${skillName} (no RULE.mdc)`);
    return false;
  }
  const dest = path.join(rulesDir, skillName);
  fs.mkdirSync(dest, { recursive: true });
  fs.copyFileSync(src, path.join(dest, 'RULE.mdc'));
  console.log(`[rules] activated: ${skillName}`);
  return true;
}

function deactivate(skillName) {
  const dir = path.join(rulesDir, skillName);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
    console.log(`[rules] cleaned: ${skillName}`);
    return true;
  }
  return false;
}

function scan() {
  console.log('\n[rules] Available:');
  const skills = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const s of skills) {
    const hasRule = fs.existsSync(path.join(skillsDir, s.name, 'RULE.mdc'));
    const active = fs.existsSync(path.join(rulesDir, s.name, 'RULE.mdc'));
    const status = hasRule ? (active ? 'active  ' : 'standby ') : 'no-rule ';
    console.log(`  ${status} ${s.name}`);
  }
}

function activateAll() {
  let n = 0;
  for (const s of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (s.isDirectory() && activate(s.name)) n++;
  }
  console.log(`[rules] total activated: ${n}`);
}

function deactivateAll() {
  if (!fs.existsSync(rulesDir)) return;
  let n = 0;
  for (const d of fs.readdirSync(rulesDir, { withFileTypes: true })) {
    if (d.isDirectory()) {
      fs.rmSync(path.join(rulesDir, d.name), { recursive: true });
      n++;
    }
  }
  console.log(`[rules] total cleaned: ${n}`);
}

switch (action) {
  case 'activate':
    if (!name) {
      console.error('Usage: sync-rules.js activate <name>');
      process.exit(1);
    }
    activate(name);
    break;
  case 'deactivate':
    if (!name) {
      console.error('Usage: sync-rules.js deactivate <name>');
      process.exit(1);
    }
    deactivate(name);
    break;
  case 'activate-all':
    activateAll();
    break;
  case 'deactivate-all':
    deactivateAll();
    break;
  case 'scan':
    scan();
    break;
  default:
    console.log('Usage: node sync-rules.js <activate|deactivate|scan|activate-all|deactivate-all> [name]');
}
