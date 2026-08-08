#!/usr/bin/env node
/**
 * figma-dom-style Harness v2.0
 * 
 * 状态机控制器：管理 Workflow 全流程的步骤转换、GATE 门禁、schema 校验、中断恢复。
 * 
 * 用法:
 *   node harness.mjs init     <figma-url> <fileKey> <nodeId>  --mode A|B
 *   node harness.mjs validate  <tmpDir>                         -- 校验 checkpoint.json schema
 *   node harness.mjs status    <tmpDir>                         -- 显示当前状态
 *   node harness.mjs gate      <tmpDir> --step <N>              -- 检查 Step{N} 的门禁条件
 *   node harness.mjs resume    <tmpDir>                         -- 中断恢复，输出下一步
 *   node harness.mjs next      <tmpDir>                         -- 根据状态确定下一步操作
 *   node harness.mjs complete  <tmpDir> --step <N>              -- 标记步骤完成
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

// ============================================================================
// Schema 定义
// ============================================================================

const CHECKPOINT_SCHEMA = {
  version: 'string',
  figmaUrl: 'string',
  mode: 'string',           // 'A' | 'B'
  currentStep: 'string',    // '0' | '1' | '2' | '3' | '4' | '5' | 'completed'
  completedSteps: ['array'],
  iteration: 'number',
  similarity: 'number|null',
  artifacts: {
    dslJson: 'string|null',
    spacingReport: 'string|null',
    baselineHtml: 'string|null',
    originPng: 'string|null',
    renderPng: 'string|null',
    diffPng: 'string|null',
    layoutPlan: 'string|null',
    taskQueue: 'string|null',
    skeletonHtml: 'string|null',
    latestHtml: 'string|null',
    latestDsl: 'string|null',
    interactionDsl: 'string|null',
    manifest: 'string|null',
  },
  layoutPlanSummary: 'string|null',
  taskQueueSummary: 'string|null',
  history: ['array'],
};

const TASK_QUEUE_SCHEMA = {
  version: 'string',
  figmaUrl: 'string',
  totalTasks: 'number',
  completedTasks: 'number',
  decomposedTasks: 'number',
  currentTask: 'string|null',
  tasks: ['array'],        // Task[]
};

const TASK_SCHEMA = {
  id: 'string',
  level: 'string',         // 'skeleton' | 'region' | 'component' | 'integration'
  name: 'string',
  status: 'string',        // 'pending' | 'in_progress' | 'completed' | 'decomposed' | 'blocked'
  strategy: 'string|null', // 'A' | 'B' | 'C'
  bounds: 'object|null',   // { x, y, w, h }
  diffHistory: ['array'],
  strategyHistory: ['array'],
  absoluteCount: 'number|null',
  absoluteExceptions: ['array|null'],
  snapshot: 'string|null',
  subTasks: ['array|null'],
  dependsOn: ['array|null'],
};

// ============================================================================
// 常量
// ============================================================================

const ALLOWED_STEPS = ['0', '1', '2', '3', '4', '5'];
const TERMINAL_STATES = ['completed'];
const ALLOWED_MODES = ['A', 'B'];
const ALLOWED_STRATEGIES = ['A', 'B', 'C'];
const ALLOWED_STATUSES = ['pending', 'in_progress', 'completed', 'decomposed', 'blocked'];
const ALLOWED_LEVELS = ['skeleton', 'region', 'component', 'integration'];

// 步骤依赖关系
const STEP_DEPENDENCIES = {
  '0': [],
  '1': ['0'],
  '2': ['1'],
  '3': ['2'],
  '4': ['3'],
  '5': ['4'],
};

// Step 所需的 artifacts
const STEP_ARTIFACTS = {
  '0': [],
  '1': ['dslJson', 'baselineHtml', 'spacingReport', 'originPng', 'renderPng', 'diffPng'],
  '2': ['layoutPlan'],
  '3': ['taskQueue', 'skeletonHtml'],
  '4': ['latestHtml'],
  '5': ['latestHtml'],
};

// 策略阈值
const STRATEGY_THRESHOLDS = {
  'A': 1.0,
  'B': 0.5,
  'C': 0.3,
};

// GATE 规则
const GATE_RULES = {
  taskCompletion: ['diffHistory', 'localDiffUnderThreshold', 'taskQueueUpdated', 'broadcastSent', 'absoluteRecorded'],
  taskOrder: ['previousTaskCompleted'],
  strategyUpgrade: ['currentStrategyAttempted2Rounds', 'diffHistoryRecorded', 'diffStagnated'],
  integration: ['allRegionsCompleted', 'allSubTasksCompleted'],
};

// ============================================================================
// CLI 路由
// ============================================================================

const [,, cmd, ...args] = process.argv;

async function main() {
  const parsed = parseArgs(args);

  switch (cmd) {
    case 'init':
      return handleInit(parsed);
    case 'validate':
      return handleValidate(parsed);
    case 'status':
      return handleStatus(parsed);
    case 'gate':
      return handleGate(parsed);
    case 'resume':
      return handleResume(parsed);
    case 'next':
      return handleNext(parsed);
    case 'complete':
      return handleComplete(parsed);
    case 'all-gates':
      return handleAllGates(parsed);
    default:
      printUsage();
      process.exit(1);
  }
}

// ============================================================================
// 命令处理
// ============================================================================

function handleInit({ figmaUrl, fileKey, nodeId, mode }) {
  if (!figmaUrl || !fileKey || !nodeId) {
    error('init 需要参数: <figma-url> <fileKey> <nodeId> [--mode A|B]');
    process.exit(1);
  }
  if (!ALLOWED_MODES.includes(mode)) {
    error(`无效的 mode: ${mode}，允许: ${ALLOWED_MODES.join(', ')}`);
    process.exit(1);
  }

  const tmpDir = `.trimly/tmp/${fileKey}_${nodeId}`;
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }
  if (!existsSync(join(tmpDir, 'snapshots'))) {
    mkdirSync(join(tmpDir, 'snapshots'), { recursive: true });
  }

  const checkpoint = {
    version: '2.0',
    figmaUrl,
    mode,
    currentStep: '0',
    completedSteps: [],
    iteration: 1,
    similarity: null,
    artifacts: {
      dslJson: null,
      spacingReport: null,
      baselineHtml: null,
      originPng: null,
      renderPng: null,
      diffPng: null,
      layoutPlan: null,
      taskQueue: null,
      skeletonHtml: null,
      latestHtml: null,
      latestDsl: null,
      interactionDsl: null,
      manifest: null,
    },
    layoutPlanSummary: null,
    taskQueueSummary: null,
    history: [],
  };

  saveJson(join(tmpDir, 'checkpoint.json'), checkpoint);
  broadcast('✅ [Harness] 初始化完成', {
    tmpDir,
    mode,
    checkpoint: join(tmpDir, 'checkpoint.json'),
  });
}

function handleValidate({ tmpDir }) {
  const cp = readCheckpoint(tmpDir);

  const errors = validateCheckpoint(cp);
  if (errors.length > 0) {
    error(`checkpoint.json 校验失败 (${errors.length} 错误):`);
    errors.forEach(e => console.error(`  ✗ ${e}`));
    process.exit(1);
  }

  // 验证步骤顺序
  const orderErrors = validateStepOrder(cp);
  if (orderErrors.length > 0) {
    error(`步骤顺序异常:`);
    orderErrors.forEach(e => console.error(`  ✗ ${e}`));
    process.exit(1);
  }

  // 验证 task-queue.json 如果存在
  if (cp.artifacts?.taskQueue) {
    const tqPath = join(tmpDir, cp.artifacts.taskQueue);
    if (existsSync(tqPath)) {
      const tq = readJson(tqPath);
      const tqErrors = validateTaskQueue(tq);
      if (tqErrors.length > 0) {
        error(`task-queue.json 校验失败 (${tqErrors.length} 错误):`);
        tqErrors.forEach(e => console.error(`  ✗ ${e}`));
        process.exit(1);
      }
    }
  }

  broadcast('✅ [Harness] 校验通过', {
    step: cp.currentStep,
    completed: cp.completedSteps,
    artifacts: Object.entries(cp.artifacts).filter(([,v]) => v).map(([k]) => k),
  });
}

function handleStatus({ tmpDir }) {
  const cp = readCheckpoint(tmpDir);

  let tq = null;
  if (cp.artifacts?.taskQueue) {
    const tqPath = join(tmpDir, cp.artifacts.taskQueue);
    if (existsSync(tqPath)) {
      tq = readJson(tqPath);
    }
  }

  console.log('═══════════════════════════════════════════════');
  console.log(`  📋 figma-dom-style Workflow 状态`);
  console.log('═══════════════════════════════════════════════');
  console.log(`  模式:        ${cp.mode}`);
  console.log(`  当前步骤:    Step ${cp.currentStep}`);
  console.log(`  已完成步骤:  [${cp.completedSteps.join(', ')}]`);
  console.log(`  迭代轮次:    ${cp.iteration}`);
  console.log(`  相似度:      ${cp.similarity ?? 'N/A'}`);
  console.log('───────────────────────────────────────────────');

  const stepStatus = ALLOWED_STEPS.map(s => {
    const done = cp.completedSteps.includes(s);
    const current = cp.currentStep === s;
    const marker = done ? '✅' : current ? '🔄' : '⏳';
    return `  ${marker} Step ${s}`;
  });
  console.log(stepStatus.join('\n'));

  console.log('───────────────────────────────────────────────');
  console.log('  产物文件:');
  Object.entries(cp.artifacts).forEach(([k, v]) => {
    if (v) console.log(`    ${k}: ${v}`);
  });

  if (tq) {
    console.log('───────────────────────────────────────────────');
    console.log('  📦 任务队列 (task-queue.json):');
    if (tq.totalTasks !== undefined) {
      console.log(`    总任务: ${tq.totalTasks} | 完成: ${tq.completedTasks} | 降级: ${tq.decomposedTasks}`);
    } else {
      console.log(`    任务数: ${tq.tasks?.length || 0} (v12.0 schema)`);
    }
    tq.tasks?.forEach(t => {
      const level = t.level || t.type || '?';
      const statusIcon = t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '🔄' : t.status === 'decomposed' ? '⬇️' : '⏳';
      const strategyInfo = t.strategy ? ` | 策略: ${t.strategy}` : '';
      console.log(`    ${statusIcon} [${level}] ${t.name} (${t.status})${strategyInfo}`);
    });
  }

  // 检查 GATE
  const gateErrors = gateCheck(cp, cp.currentStep, tmpDir);
  if (gateErrors.length > 0) {
    console.log('───────────────────────────────────────────────');
    console.log(`  🚫 GATE 阻断 (${gateErrors.length}):`);
    gateErrors.forEach(e => console.error(`    ✗ ${e}`));
  }

  console.log('═══════════════════════════════════════════════');
}

function handleGate({ tmpDir, step }) {
  if (!step) {
    error('gate 需要参数: --step <N>');
    process.exit(1);
  }

  const cp = readCheckpoint(tmpDir);
  const errors = gateCheck(cp, step, tmpDir);

  if (errors.length > 0) {
    error(`🚫 Step ${step} GATE 未通过 (${errors.length} 阻断):`);
    errors.forEach(e => console.error(`  ✗ ${e}`));
    process.exit(1);
  }

  broadcast(`✅ Step ${step} GATE 通过`, {});
}

function handleResume({ tmpDir }) {
  if (!existsSync(join(tmpDir, 'checkpoint.json'))) {
    error('未找到 checkpoint.json，无法恢复。请先执行 init。');
    process.exit(1);
  }

  const cp = readCheckpoint(tmpDir);

  // 确定下一步
  const nextStep = determineNextStep(cp);

  broadcast('🔄 中断恢复', {
    currentStep: cp.currentStep,
    completedSteps: cp.completedSteps,
    nextStep,
    iteration: cp.iteration,
    similarity: cp.similarity,
  });

  if (cp.currentStep === '3' && cp.artifacts.taskQueue) {
    const tqPath = join(tmpDir, cp.artifacts.taskQueue);
    if (existsSync(tqPath)) {
      const tq = readJson(tqPath);
      const pendingTask = tq.tasks?.find(t => t.status === 'pending' || t.status === 'in_progress');
      if (pendingTask) {
        broadcast(`  📦 待处理 Task: [${pendingTask.level}] ${pendingTask.name}`, {
          taskId: pendingTask.id,
          status: pendingTask.status,
          bounds: pendingTask.bounds,
          strategy: pendingTask.strategy || 'A',
          diffHistory: pendingTask.diffHistory,
        });
      }
    }
  }
}

function handleNext({ tmpDir }) {
  const cp = readCheckpoint(tmpDir);
  const next = determineNextStep(cp);
  const instructions = getStepInstructions(next, cp);

  broadcast(`➡️ 下一步: Step ${next}`, {
    step: next,
    instructions,
    requiredArtifacts: STEP_ARTIFACTS[next] || [],
  });
}

function handleComplete({ tmpDir, step }) {
  if (!step) {
    error('complete 需要参数: --step <N>');
    process.exit(1);
  }

  const cp = readCheckpoint(tmpDir);

  // 验证依赖
  const deps = STEP_DEPENDENCIES[step] || [];
  for (const dep of deps) {
    if (!cp.completedSteps.includes(dep)) {
      error(`无法完成 Step ${step}：前置步骤 ${dep} 未完成`);
      process.exit(1);
    }
  }

  // 验证产物
  const required = STEP_ARTIFACTS[step] || [];
  const missing = required.filter(k => !cp.artifacts[k]);
  if (missing.length > 0) {
    error(`Step ${step} 缺少必需产物: ${missing.join(', ')}`);
    process.exit(1);
  }

  // 更新 checkpoint
  cp.currentStep = step;
  if (!cp.completedSteps.includes(step)) {
    cp.completedSteps.push(step);
  }
  cp.history.push({
    step,
    completedAt: new Date().toISOString(),
    iteration: cp.iteration,
    similarity: cp.similarity,
  });

  saveJson(join(tmpDir, 'checkpoint.json'), cp);

  broadcast(`✅ [Harness] Step ${step} 已标记完成`, {
    completedSteps: cp.completedSteps,
    currentStep: cp.currentStep,
  });
}

function handleAllGates({ tmpDir }) {
  const cp = readCheckpoint(tmpDir);
  let allPassed = true;

  console.log('═══════════════════════════════════════════════');
  console.log('  🔒 全量 GATE 检查');
  console.log('═══════════════════════════════════════════════');

  for (const step of ALLOWED_STEPS) {
    if (step > cp.currentStep) break;
    const errors = gateCheck(cp, step, tmpDir);
    const status = errors.length === 0 ? '✅' : '❌';
    console.log(`  ${status} GATE Step ${step}`);
    errors.forEach(e => console.error(`    ✗ ${e}`));
    if (errors.length > 0) allPassed = false;
  }

  console.log('═══════════════════════════════════════════════');
  if (!allPassed) process.exit(1);
}

// ============================================================================
// 核心逻辑
// ============================================================================

function readCheckpoint(tmpDir) {
  const path = join(tmpDir, 'checkpoint.json');
  if (!existsSync(path)) {
    error(`checkpoint.json 不存在于 ${tmpDir}`);
    process.exit(1);
  }
  return readJson(path);
}

function validateCheckpoint(cp) {
  const errors = [];

  if (!cp.version) errors.push('缺少 version');
  if (!cp.figmaUrl) errors.push('缺少 figmaUrl');
  if (!ALLOWED_MODES.includes(cp.mode)) errors.push(`无效的 mode: ${cp.mode}`);
  if (!ALLOWED_STEPS.includes(cp.currentStep) && !TERMINAL_STATES.includes(cp.currentStep)) {
    errors.push(`无效的 currentStep: ${cp.currentStep}`);
  }

  // 验证所有已完成步骤都在允许范围内
  for (const s of cp.completedSteps) {
    if (!ALLOWED_STEPS.includes(s)) errors.push(`无效的 completedStep: ${s}`);
  }

  // 验证 currentStep 与 completedSteps 一致性
  if (!TERMINAL_STATES.includes(cp.currentStep) && cp.currentStep !== '0' && !cp.completedSteps.includes(cp.currentStep)) {
    // currentStep 可以不在 completedSteps 中（表示正在进行中）
    // 但必须 >= 所有 completedSteps
    const maxCompleted = Math.max(...cp.completedSteps.map(Number));
    if (Number(cp.currentStep) < maxCompleted) {
      errors.push(`currentStep (${cp.currentStep}) 小于最大已完成步骤 (${maxCompleted})`);
    }
  }

  if (typeof cp.iteration !== 'number' || cp.iteration < 0) errors.push('无效的 iteration');
  if (!Array.isArray(cp.history)) errors.push('history 必须是数组');

  return errors;
}

function validateStepOrder(cp) {
  const errors = [];

  // 检查是否有跳步
  for (let i = 1; i < ALLOWED_STEPS.length; i++) {
    const step = ALLOWED_STEPS[i];
    if (cp.completedSteps.includes(step)) {
      const deps = STEP_DEPENDENCIES[step];
      for (const dep of deps) {
        if (!cp.completedSteps.includes(dep)) {
          errors.push(`Step ${step} 依赖 Step ${dep}，但 ${dep} 未完成`);
        }
      }
    }
  }

  return errors;
}

function validateTaskQueue(tq) {
  const errors = [];

  if (!tq.version) errors.push('task-queue.json 缺少 version');

  // v2.0 字段，v12.0 可能没有
  if (tq.totalTasks !== undefined && typeof tq.totalTasks !== 'number') errors.push('totalTasks 类型错误');
  if (tq.completedTasks !== undefined && typeof tq.completedTasks !== 'number') errors.push('completedTasks 类型错误');
  if (tq.decomposedTasks !== undefined && typeof tq.decomposedTasks !== 'number') errors.push('decomposedTasks 类型错误');

  if (!Array.isArray(tq.tasks)) {
    errors.push('tasks 必须是数组');
    return errors;
  }

  const isV12 = !tq.totalTasks && !tq.completedTasks; // v12.0 没有这些顶层字段

  tq.tasks?.forEach((task, i) => {
    if (!task.id) errors.push(`Task[${i}]: 缺少 id`);
    if (!task.name) errors.push(`Task[${i}] (${task.id}): 缺少 name`);
    if (!task.status) {
      errors.push(`Task[${i}] (${task.id}): 缺少 status`);
    } else if (!ALLOWED_STATUSES.includes(task.status)) {
      errors.push(`Task[${i}] (${task.id}): 无效 status: ${task.status}`);
    }

    if (!isV12) {
      // v2.0 严格校验
      if (task.level && !ALLOWED_LEVELS.includes(task.level)) {
        errors.push(`Task[${i}] (${task.id}): 无效 level: ${task.level}`);
      }
      if (task.strategy && !ALLOWED_STRATEGIES.includes(task.strategy)) {
        errors.push(`Task[${i}] (${task.id}): 无效 strategy: ${task.strategy}`);
      }
    }
  });

  // 检查任务顺序（仅 v2.0）
  if (!isV12) {
    let seenSkeleton = false;
    let seenIntegration = false;
    for (const task of tq.tasks || []) {
      if (task.level === 'skeleton') seenSkeleton = true;
      if (task.level === 'integration') seenIntegration = true;
      if (task.level === 'integration' && !seenSkeleton) {
        errors.push('Integration Task 必须排在 Skeleton Task 之后');
      }
    }
    if (!seenIntegration && (tq.tasks || []).length > 0) {
      // v12.0 可能没有 integration task，不算错误
    }
  }

  return errors;
}

function gateCheck(cp, step, tmpDir) {
  const errors = [];

  switch (step) {
    case '0':
      // Step 0: 规则注入完成
      if (!cp.completedSteps?.includes('0') && cp.currentStep === '0') {
        // 允许在 Step 0 进行中
      }
      break;

    case '1':
      // Step 1: 三个 MCP 调用完成
      const step1Artifacts = ['dslJson', 'baselineHtml', 'spacingReport'];
      for (const a of step1Artifacts) {
        if (!cp.artifacts?.[a]) {
          errors.push(`Step 1 缺少产物: ${a}`);
        }
      }
      break;

    case '2':
      // Step 2: layout-plan.json + task-queue.json 生成
      if (!cp.artifacts?.layoutPlan) errors.push('Step 2 缺少 layout-plan.json');
      if (!cp.artifacts?.taskQueue) errors.push('Step 2 缺少 task-queue.json');

      // 验证 task-queue.json 存在且有效
      if (cp.artifacts?.taskQueue) {
        const tqPath = join(tmpDir, cp.artifacts.taskQueue);
        if (!existsSync(tqPath)) {
          errors.push(`task-queue.json 文件不存在: ${tqPath}`);
        } else {
          const tq = readJson(tqPath);
          const tqErrors = validateTaskQueue(tq);
          errors.push(...tqErrors.map(e => `task-queue.json: ${e}`));
        }
      }
      break;

    case '3':
      // Step 3: 渐进式实现
      if (!cp.artifacts?.skeletonHtml) {
        errors.push('Step 3 缺少 skeleton.html (3a)');
      }

      if (cp.artifacts?.taskQueue) {
        const tqPath = join(tmpDir, cp.artifacts.taskQueue);
        if (existsSync(tqPath)) {
          const tq = readJson(tqPath);

          // GATE-1: 检查所有非 completed 的 task
          for (const task of tq.tasks || []) {
            if (task.status === 'completed') {
              // GATE-1 Task Completion Check
              if (!task.diffHistory || task.diffHistory.length === 0) {
                errors.push(`Task ${task.id}: 标记 completed 但没有 diffHistory`);
              }
              if (task.strategy && task.diffHistory) {
                const lastDiff = task.diffHistory[task.diffHistory.length - 1];
                const localDiff = lastDiff?.localDiff;
                const threshold = STRATEGY_THRESHOLDS[task.strategy] || 1.0;
                if (localDiff !== undefined && localDiff > threshold) {
                  errors.push(`Task ${task.id}: local diff (${localDiff}%) > 策略 ${task.strategy} 阈值 (${threshold}%)`);
                }
              }
              if (task.absoluteCount === undefined || task.absoluteCount === null) {
                errors.push(`Task ${task.id}: completed 但未记录 absoluteCount`);
              }
            }
          }

          // GATE-4: Integration 前置条件（仅 v2.0 schema）
          const integrationTask = tq.tasks?.find(t => t.level === 'integration' || t.type === 'layout');
          if (integrationTask && integrationTask.status !== 'pending') {
            const regionTasks = tq.tasks?.filter(t => t.level === 'region' || t.type === 'component');
            const incompleteRegions = regionTasks?.filter(t =>
              t.status !== 'completed' && t.status !== 'decomposed'
            );
            if (incompleteRegions?.length > 0) {
              errors.push(`Integration 前置: ${incompleteRegions.length} 个 Region 未完成: ${incompleteRegions.map(t => t.id).join(', ')}`);
            }

            const decomposedRegions = regionTasks?.filter(t => t.status === 'decomposed');
            for (const dr of decomposedRegions || []) {
              const subTasks = tq.tasks?.filter(t =>
                (t.level === 'component' || t.parentId) && t.parentId === dr.id
              );
              const incompleteSubs = subTasks?.filter(t => t.status !== 'completed');
              if (incompleteSubs?.length > 0) {
                errors.push(`Integration 前置: decomposed Region ${dr.id} 的 ${incompleteSubs.length} 个 Component 未完成`);
              }
            }
          }
        }
      }
      break;

    case '4':
      // Step 4: 差异修复
      if (!cp.artifacts?.latestHtml) errors.push('Step 4 缺少 latestHtml');
      if (cp.similarity === null) errors.push('Step 4 缺少 similarity 值');
      break;

    case '5':
      // Step 5: 交付
      if (cp.similarity === null || cp.similarity < 95) {
        errors.push(`Step 5: similarity (${cp.similarity}%) < 95%，未达标`);
      }
      if (cp.iteration > 5) {
        errors.push(`Step 5: 已超最大迭代次数 (${cp.iteration} > 5)`);
      }
      break;
  }

  return errors;
}

function determineNextStep(cp) {
  if (!cp.currentStep) return '0';
  if (TERMINAL_STATES.includes(cp.currentStep)) return 'completed';

  const current = Number(cp.currentStep);

  // 如果当前步骤在 completedSteps 中，移动到下一步
  if (cp.completedSteps.includes(cp.currentStep)) {
    const next = String(current + 1);
    return ALLOWED_STEPS.includes(next) ? next : 'completed';
  }

  return cp.currentStep;
}

function getStepInstructions(step, cp) {
  const instructions = {
    '0': 'use_skill(code-quality-guard) + read_file(RULE.mdc) + 创建临时目录 + 初始化 checkpoint.json',
    '1': '三并行 MCP: figma_baseline_compare + figma_to_html + calc_spacing',
    '2': 'MCP(figma_to_interaction_dsl) + 分析 DSL + spacing-report → layout-plan.json + task-queue.json',
    '3': '渐进式: 3a 骨架 → 3b 区域逐个 → 3c 整合 + 全量检测 + MCP(figma_compare_html_file)',
    '4': '读 diff.png → 识别差异 → replace_in_file 修复 → MCP(figma_compare_html_file)',
    '5': '交付: final HTML + DSL + manifest + checkpoint',
  };
  return instructions[step] || '未知步骤';
}

// ============================================================================
// 工具函数
// ============================================================================

function readJson(path) {
  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    error(`无法读取 JSON: ${path} — ${e.message}`);
    process.exit(1);
  }
}

function saveJson(path, data) {
  try {
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    error(`无法写入 JSON: ${path} — ${e.message}`);
    process.exit(1);
  }
}

function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode' || args[i] === '-m') {
      result.mode = args[++i] || 'A';
    } else if (args[i] === '--step' || args[i] === '-s') {
      result.step = args[++i];
    } else if (!result.figmaUrl && args[i].startsWith('http')) {
      result.figmaUrl = args[i];
    } else if (!result.fileKey && args[i].match(/^[A-Za-z0-9_-]{20,}$/)) {
      result.fileKey = args[i];
    } else if (!result.nodeId && args[i].match(/^\d+-\d+$/)) {
      result.nodeId = args[i];
    } else if (!result.tmpDir && (args[i].includes('tmp') || args[i].includes('trimly'))) {
      result.tmpDir = args[i];
    }
  }
  return result;
}

function broadcast(message, data = {}) {
  console.log(message);
  if (Object.keys(data).length > 0) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function error(message) {
  console.error(`\n❌ ${message}`);
}

function printUsage() {
  console.log(`
figma-dom-style Harness v2.0 — Workflow State Machine Controller

用法:
  node harness.mjs init     <figma-url> <fileKey> <nodeId>  [--mode A|B]
  node harness.mjs validate  <tmpDir>
  node harness.mjs status    <tmpDir>
  node harness.mjs gate      <tmpDir> --step <N>
  node harness.mjs resume    <tmpDir>
  node harness.mjs next      <tmpDir>
  node harness.mjs complete  <tmpDir> --step <N>
  node harness.mjs all-gates <tmpDir>

命令说明:
  init      初始化新 workflow 的 checkpoint.json
  validate  校验 checkpoint.json / task-queue.json schema + 步骤顺序
  status    显示当前 workflow 状态（步骤/产物/任务/GATE）
  gate      检查指定 Step 的 GATE 门禁条件
  resume    中断恢复：检测 checkpoint 并输出下一步操作
  next      根据当前状态确定下一步操作及指令
  complete  标记步骤完成并更新 checkpoint.json
  all-gates 运行所有步骤的 GATE 全量检查

GATE 规则:
  GATE-1 Task 完成   → 必须有 diffHistory + localDiff 达标 + absoluteCount 记录
  GATE-2 Task 顺序   → 前一个 Task 必须 completed/decomposed
  GATE-3 策略升级    → 当前策略已尝试 2 轮 + diff 停滞
  GATE-4 Integration → 所有 Region completed/decomposed + subTasks 全部 completed

策略阈值:  A < 1.0% | B < 0.5% | C < 0.3%
`);
}

main().catch(e => {
  error(e.message);
  process.exit(1);
});
