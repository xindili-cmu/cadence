#!/usr/bin/env node
/**
 * source-archive-pull.js — 从私有 KV 拉回策展原文存档并审计（Cindy 本地跑）。
 *
 * 用法：
 *   CLOUDFLARE_ACCOUNT_ID=… CURATION_KV_NS=… CURATION_KV_TOKEN=… \
 *     node scripts/source-archive-pull.js [--since 2026-10-01] [--md]
 *
 * 干什么：
 *   1. 列出 run/ 前缀的记录（--since 过滤），下载到 .cache-source-archive/（gitignore + assetsignore）
 *   2. 覆盖率：每天几次运行有存档——断档 = 写入在静默失败（看 refresh 日志里的 ⚠️ source archive）
 *   3. 闸判定统计：fixed / downgraded / dropped 各多少，逐条列出违规原因供人工判断误报
 *   4. 不变量复核：最终入库的每条用**真实原文**重跑 checkCuratedItem，应为 0 违规
 *   --md 额外写 briefs/source-audit-YYYY-MM-DD.md（briefs/*.md 不随站点发布）
 *
 * 这是 source-check.js 离线审计的真数据版——那次只能拿 LLM 写的英文 summary 当原文。
 */
const fs = require('fs');
const path = require('path');
const { kvConfig, kvBase, KEY_PREFIX } = require('./source-archive');
const { checkCuratedItem, hasViolation } = require('./source-check');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, '.cache-source-archive');

/** 纯函数：records → 审计摘要（pipeline-gates Z 段有断言）。 */
function auditRecords(records) {
  const perDay = {}, outcomes = { fixed: 0, downgraded: 0, dropped: 0 }, cases = [], leaks = [];
  let inputs = 0, finals = 0;
  for (const r of records) {
    const day = (r.runAt || '').slice(0, 10);
    perDay[day] = (perDay[day] || 0) + 1;
    inputs += (r.items || []).length;
    finals += (r.final || []).length;
    const byIndex = new Map((r.items || []).map((i) => [i.index, i]));
    for (const ev of r.fidelity || []) {
      if (outcomes[ev.outcome] != null) outcomes[ev.outcome]++;
      cases.push({ runAt: r.runAt, outcome: ev.outcome, title: (byIndex.get(ev.index) || {}).title || '', violations: ev.violations || [] });
    }
    for (const c of r.final || []) {
      const v = checkCuratedItem(c, byIndex.get(c.index) || {});
      if (hasViolation(v)) leaks.push({ runAt: r.runAt, title: (byIndex.get(c.index) || {}).title || '', v });
    }
  }
  return { runs: records.length, perDay, inputs, finals, outcomes, cases, leaks };
}

async function cf(cfg, url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.token}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.replace(/accounts\/[^/]+/, 'accounts/…')}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function listKeys(cfg, since) {
  const names = [];
  let cursor = '';
  do {
    const q = new URLSearchParams({ prefix: KEY_PREFIX, limit: '1000', ...(cursor ? { cursor } : {}) });
    const j = await (await cf(cfg, `${kvBase(cfg)}/keys?${q}`)).json();
    for (const k of j.result || []) if (!since || k.name >= KEY_PREFIX + since) names.push(k.name);
    cursor = (j.result_info && j.result_info.cursor) || '';
  } while (cursor);
  return names.sort();
}

async function main() {
  const cfg = kvConfig();
  if (cfg.missing.length) { console.error(`✗ missing env: ${cfg.missing.join(', ')}`); process.exit(1); }
  const i = process.argv.indexOf('--since');
  const since = i > -1 ? process.argv[i + 1] : '';
  fs.mkdirSync(CACHE, { recursive: true });

  const keys = await listKeys(cfg, since);
  const records = [];
  for (const k of keys) {
    const file = path.join(CACHE, k.replace(/\//g, '_') + '.json');
    if (!fs.existsSync(file)) {
      const body = await (await cf(cfg, `${kvBase(cfg)}/values/${encodeURIComponent(k)}`)).text();
      fs.writeFileSync(file, body);
    }
    records.push(JSON.parse(fs.readFileSync(file, 'utf8')));
  }

  const a = auditRecords(records);
  const lines = [];
  lines.push(`# 策展原文存档审计 ${new Date().toISOString().slice(0, 10)}${since ? `（since ${since}）` : ''}`, '');
  lines.push(`- 运行记录 ${a.runs} 条；送审条目 ${a.inputs}；最终入库 ${a.finals}`);
  lines.push(`- 闸判定：fixed ${a.outcomes.fixed} · downgraded ${a.outcomes.downgraded} · dropped ${a.outcomes.dropped}`);
  lines.push(`- 不变量（入库条目对真实原文 0 违规）：${a.leaks.length ? `✗ ${a.leaks.length} 条泄漏` : '✓'}`, '');
  lines.push('## 每日运行数（断档 = 写入静默失败）', ...Object.entries(a.perDay).sort().map(([d, n]) => `- ${d}: ${n}`), '');
  lines.push('## 逐条判定（人工看误报）');
  for (const c of a.cases) lines.push(`- [${c.outcome}] ${c.title.slice(0, 90)}`, ...c.violations.map((v) => `    - ${v}`));
  if (a.leaks.length) { lines.push('', '## 泄漏'); for (const l of a.leaks) lines.push(`- ${l.title.slice(0, 90)} — ${JSON.stringify(l.v)}`); }
  const out = lines.join('\n') + '\n';
  console.log(out);
  if (process.argv.includes('--md')) {
    const f = path.join(ROOT, 'briefs', `source-audit-${new Date().toISOString().slice(0, 10)}.md`);
    fs.writeFileSync(f, out);
    console.log(`→ ${path.relative(ROOT, f)}`);
  }
  if (a.leaks.length) process.exitCode = 1;
}

module.exports = { auditRecords };
if (require.main === module) main().catch((e) => { console.error('✗ source-archive-pull:', e.message); process.exit(1); });
