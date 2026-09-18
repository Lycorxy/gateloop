#!/usr/bin/env node
/**
 * lynx-error-locator — 错误数据提取脚本（确定性 CLI）
 *
 * 用法：
 *   node extract-error.cjs <lynx-data.json> [--out <output.json>]
 *
 * 作用：把 lynx-web 导出的大 JSON（常 >500KB，含 rrweb 事件流/网络 body/控制台日志）
 *      提炼为模型可直接阅读的结构化摘要（<100KB），截断长字段、脱敏存储值。
 *
 * 兼容：v2（version "2.0" + encoding）/ v1（无 encoding，storage 全量，可能含自研 dom 事件）
 *
 * exit 0 = 解析成功（含"无错误事件"场景，此时输出 noErrors:true）
 * exit 1 = 文件不存在 / JSON 非法
 */
const fs = require('fs');
const path = require('path');

const TRUNC_SUFFIX = '…[truncated]';

// 截断：超长字段加截断标记。300 = message 类字段保留上限（兼顾可读性与体积）
function trunc(v, n) {
  if (v === null || v === undefined) return undefined;
  if (typeof v !== 'string') {
    try { v = JSON.stringify(v); } catch (e) { v = String(v); }
    if (v === undefined) return undefined;
  }
  return v.length > n ? v.slice(0, n) + TRUNC_SUFFIX : v;
}
function num(v) {
  return typeof v === 'number' && isFinite(v) ? v : null;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const input = args.find((a) => !a.startsWith('--') && !a.includes('='));
  let out = null;
  const i = args.indexOf('--out');
  if (i >= 0 && args[i + 1]) out = args[i + 1];
  return { input, out };
}

// 从 pageUrl 解析路由信息（Lynx/Taro 常用 hash 路由：#/pages/index/index?appId=xxx）
function parseRoute(url) {
  try {
    const u = new URL(url);
    const hash = u.hash || '';
    const h = hash.startsWith('#') ? hash.slice(1) : hash;
    const [p, q = ''] = h.split('?');
    const query = {};
    for (const [k, v] of new URLSearchParams(q)) query[k] = v;
    return {
      origin: u.origin,
      pathname: u.pathname,
      hash: hash || null,
      routePath: p || null,
      query,
    };
  } catch (e) {
    return { raw: trunc(url, 200) };
  }
}

function consoleText(ev, limit) {
  const args = Array.isArray(ev.args) ? ev.args : [];
  let text = args
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ');
  return trunc(text, limit || 300);
}

function extract(data, sourceFile) {
  const isV2 = data.version === '2.0' && !!data.encoding;
  const report = data.report || {};
  const session = data.session || {};
  const meta = report.meta || session.meta || {};
  const events = Array.isArray(session.events) ? session.events : [];

  // ---- 事件类型统计（C 度量回灌：脚本粗筛 facts，模型精判） ----
  const eventStats = {};
  for (const e of events) eventStats[e.type] = (eventStats[e.type] || 0) + 1;

  // ---- 错误分级 ----
  const errs = report.errors || {};
  const primary = (Array.isArray(errs.primary) ? errs.primary : []).map((e) => ({
    kind: e.kind || 'unknown',
    message: trunc(e.message || '', 400),
    filename: trunc(e.filename || '', 250),
    timestamp: num(e.timestamp),
    stack: e.stack ? trunc(e.stack, 800) : undefined,
    // 错误发生前的事件（重建时间线用）
    precedingEvents: (Array.isArray(e.precedingEvents) ? e.precedingEvents : [])
      .slice(0, 12)
      .map((p) => ({ t: p.t, type: p.type, summary: trunc(p.summary || '', 180) })),
  }));

  // 级联错误：按 kind + message 前 60 字符聚合（同类错误只报一次 + 计数）
  const cascadingRaw = Array.isArray(errs.cascading) ? errs.cascading : [];
  const groups = new Map();
  for (const e of cascadingRaw) {
    const key = (e.kind || 'unknown') + '|' + trunc(e.message || '', 60);
    if (!groups.has(key)) {
      groups.set(key, {
        kind: e.kind || 'unknown',
        count: 0,
        sample: trunc(e.message || '', 220),
      });
    }
    groups.get(key).count += 1;
  }
  const cascadingSummary = [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const cascading = cascadingRaw.slice(0, 20).map((e) => ({
    kind: e.kind || 'unknown',
    message: trunc(e.message || '', 200),
    timestamp: num(e.timestamp),
  }));
  const loops = Array.isArray(errs.loops) ? errs.loops.slice(0, 5) : [];

  // ---- 自动归因（导出端已算好，模型只做交叉验证/推翻） ----
  const attr = report.attribution || {};
  const attribution = {
    type: attr.type || 'unknown',
    confidence: num(attr.confidence),
    reasoning: trunc(attr.reasoning || '', 500),
    evidence: (Array.isArray(attr.evidence) ? attr.evidence : [])
      .slice(0, 6)
      .map((e) => trunc(e, 250)),
    suggestions: (Array.isArray(attr.suggestions) ? attr.suggestions : [])
      .slice(0, 5)
      .map((s) => trunc(typeof s === 'string' ? s : JSON.stringify(s), 300)),
  };

  // ---- 诊断 ----
  const diag = report.diagnostics || {};
  const ws = diag.whiteScreen || {};
  const ml = diag.memoryLeak || {};
  const perf = diag.performance || {};
  const diagnostics = {
    whiteScreen: {
      detected: !!ws.detected,
      fcp: num(ws.fcp),
      bodyChildCount: num(ws.bodyChildCount),
      bodyTextLength: num(ws.bodyTextLength),
      possibleCauses: (ws.possibleCauses || []).slice(0, 5),
      jsErrorBeforeFcp: !!ws.jsErrorBeforeFcp,
    },
    memoryLeak: {
      detected: !!ml.detected,
      current: ml.current || null,
      growthRate: num(ml.growthRate),
      growthTrend: (ml.growthTrend || []).slice(0, 10),
      possibleSources: (ml.possibleSources || []).slice(0, 5),
      domNodeCount: num(ml.domNodeCount),
      estimatedLeakedListeners: num(ml.estimatedLeakedListeners),
    },
    performance: {
      metrics:
        perf.metrics ||
        (report.context && report.context.performance && report.context.performance.timing) ||
        null,
      slowRequests: (perf.slowRequests || []).slice(0, 10),
      longTasks: (Array.isArray(perf.longTasks) ? perf.longTasks : [])
        .slice(0, 10)
        .map((t) => ({
          name: trunc(t.name || t.attribution || '', 120),
          duration: num(t.duration),
          startTime: num(t.startTime),
        })),
      assessment: perf.assessment ? trunc(JSON.stringify(perf.assessment), 500) : null,
    },
  };

  // ---- 网络（scene.network 优先，缺失时从 session.events 过滤） ----
  const networkRaw = Array.isArray(report.scene && report.scene.network)
    ? report.scene.network
    : events.filter((e) => e.type === 'network');
  const failedRequests = networkRaw.filter((n) => n.status === 0 || (n.status >= 400));
  const network = {
    failedCount: failedRequests.length,
    slowCount: networkRaw.filter((n) => typeof n.duration === 'number' && n.duration > 1000).length,
    requests: networkRaw.slice(0, 24).map((n) => ({
      method: n.method || 'GET',
      status: num(n.status),
      url: trunc(n.url || '', 200),
      duration: num(n.duration),
      error: n.error ? trunc(n.error, 200) : undefined,
      mocked: n.mocked || undefined,
    })),
    failed: failedRequests.slice(0, 10).map((n) => ({
      method: n.method || 'GET',
      status: num(n.status),
      url: trunc(n.url || '', 200),
      error: n.error ? trunc(n.error, 200) : undefined,
    })),
  };

  // ---- 控制台：error/warn 全保留（含 stack），最近日志截断 ----
  const consoleEv = events.filter((e) => e.type === 'console');
  const errorWarn = consoleEv
    .filter((e) => e.level === 'error' || e.level === 'warn')
    .slice(0, 30)
    .map((e) => ({
      level: e.level,
      text: consoleText(e, 300),
      stack: e.stack ? trunc(e.stack, 600) : undefined,
      timestamp: num(e.timestamp),
    }));
  const recent = consoleEv.slice(-40).map((e) => ({
    level: e.level,
    text: consoleText(e, 200),
    timestamp: num(e.timestamp),
  }));

  // ---- 用户操作（错误前的行为轨迹） ----
  const actions = events
    .filter((e) => e.type === 'action')
    .slice(0, 12)
    .map((a) => ({
      action: a.action,
      target: trunc(a.target || '', 150),
      timestamp: num(a.timestamp),
    }));

  // ---- 存储 key（脱敏：只导出 key 名，不导出值） ----
  const storage = session.storage || (report.scene && report.scene.storage) || {};
  const storageKeys = {
    localStorage: Object.keys(storage.localStorage || {}),
    sessionStorage: Object.keys(storage.sessionStorage || {}),
    cookieKeys: String(storage.cookie || '')
      .split(';')
      .map((s) => s.split('=')[0].trim())
      .filter(Boolean)
      .slice(0, 20),
  };

  // ---- 内存快照 ----
  const memory = session.memory || (report.context && report.context.memory) || null;
  const memOut = memory
    ? {
        usedJSHeapSize: num(memory.usedJSHeapSize),
        totalJSHeapSize: num(memory.totalJSHeapSize),
        jsHeapSizeLimit: num(memory.jsHeapSizeLimit),
      }
    : null;

  const url = data.pageUrl || meta.url || (session.meta && session.meta.url) || '';
  const annotations = data.annotations || {};
  const annotationsCount = Array.isArray(annotations.annotations)
    ? annotations.annotations.length
    : Array.isArray(annotations)
      ? annotations.length
      : 0;

  return {
    format: isV2 ? 'v2' : 'v1',
    source: { file: path.resolve(sourceFile), generatedAt: new Date().toISOString() },
    meta: {
      pageUrl: url,
      userAgent: meta.userAgent || '',
      title: meta.title || '',
      pageLifecycle: meta.pageLifecycle || '',
      windowDuration: num(meta.windowDuration),
    },
    route: url ? parseRoute(url) : null,
    eventStats,
    errors: { primary, cascadingSummary, cascading, loops },
    attribution,
    diagnostics,
    network,
    console: { errorWarn, recent },
    actions,
    storageKeys,
    memory: memOut,
    annotationsCount,
    // rrweb DOM 流在源文件 recording.events，此处不导出（体积大），深挖见 analysis-playbook
    domReplayHint: isV2
      ? 'DOM 在源文件 recording.events（rrweb 事件流），按需用 node 命令深挖，见 analysis-playbook.md'
      : 'v1 数据：DOM 可能含自研 dom 事件（session.events 里 kind=full/incremental），通常忽略',
    noErrors:
      primary.length === 0 && cascadingRaw.length === 0 && errorWarn.length === 0 && loops.length === 0,
  };
}

function main() {
  const { input, out } = parseArgs(process.argv);
  if (!input) {
    console.error('Usage: node extract-error.cjs <lynx-data.json> [--out <output.json>]');
    process.exit(1);
  }
  let raw;
  try {
    raw = fs.readFileSync(input, 'utf8');
  } catch (e) {
    console.error('Cannot read file: ' + input + ' (' + e.message + ')');
    process.exit(1);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('Invalid JSON: ' + e.message);
    process.exit(1);
  }
  const result = extract(data, input);
  const json = JSON.stringify(result, null, 2);
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, json, 'utf8');
    console.log(
      'written: ' + out +
      ' | ' + json.length + ' bytes' +
      ' | format=' + result.format +
      ' | noErrors=' + result.noErrors +
      ' | primary=' + result.errors.primary.length
    );
  } else {
    process.stdout.write(json);
  }
}

main();
