#!/usr/bin/env node
/**
 * score-calibration.js — SIGNAL 分数校准报告（离线，不调 LLM）。
 *
 * 干什么：把 news.json + archive 里的全部条目按证据强度代理变量切开
 * （studyDesign / 内容类型 / 期刊分区），检查分数是否朝对的方向排序，
 * 并挑出「分数与证据强度矛盾」的条目生成人工抽查表。
 *
 * 为什么：评分由 LLM 基于摘要产出，公信力要靠校准建立——
 * 「系统综述均分应高于观察研究」这类方向性检查 + 定期人工抽查，
 * 是没有金标准标注时最便宜的校准手段。
 *
 * 用法：node scripts/score-calibration.js [--md]
 *   --md  额外写 briefs/score-audit-YYYY-MM-DD.md（人工抽查清单，含勾选框）
 *
 * 判读（写进报告头）：
 *   - 均分排序期望：系统综述/RCT ≥ 综述 ≥ 观察研究 ≥ 述评
 *   - 抽查表逐条人工判定「分数是否合理」，错误率 >2/10 说明 rubric 或模型需要调
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ── data ─────────────────────────────────────────────────────────────────────
function loadAll() {
  const seen = new Set();
  const all = [];
  const take = (list) => {
    for (const i of list || []) {
      if (!i || !i.id) continue;
      if (seen.has(i.id) || (i.sourceUrl && seen.has(i.sourceUrl))) continue;
      seen.add(i.id);
      if (i.sourceUrl) seen.add(i.sourceUrl);
      all.push(i);
    }
  };
  take(JSON.parse(fs.readFileSync(path.join(ROOT, 'news.json'), 'utf8')).items);
  const dir = path.join(ROOT, 'archive');
  for (const f of fs.readdirSync(dir).sort()) {
    if (!/^\d{4}-\d{2}\.json$/.test(f)) continue;
    take(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).items);
  }
  return all;
}

// journals.json → quartile lookup（复用 app.data.jsx 的归一化思路：小写去符号）
function journalIndex() {
  const idx = {};
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'journals.json'), 'utf8'));
    for (const row of j.journals || []) {
      for (const name of [row.name, ...(row.aliases || [])]) {
        idx[norm(name)] = { quartile: row.quartile, if: row.impactFactor };
      }
    }
  } catch {}
  return idx;
}
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9一-鿿]+/g, ' ').trim();

// ── stats helpers ────────────────────────────────────────────────────────────
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const fmt = (a) => `n=${String(a.length).padStart(3)}  mean=${mean(a).toFixed(1)}  min=${Math.min(...a)}  max=${Math.max(...a)}`;

function groupReport(title, items, keyFn) {
  const g = {};
  for (const i of items) {
    const k = keyFn(i) || '(none)';
    (g[k] = g[k] || []).push(i.curatedScore);
  }
  const rows = Object.entries(g).sort((a, b) => mean(b[1]) - mean(a[1]));
  console.log(`\n${title}`);
  for (const [k, a] of rows) console.log(`  ${k.padEnd(14)} ${fmt(a)}`);
  return g;
}

// ── anomaly flags（人工抽查候选）──────────────────────────────────────────────
// 只用条目自带字段判断，不臆测：
//   A 高分弱证据: score ≥ 80 且 studyDesign ∈ {观察研究, 述评} （research 条目）
//   B 低分强证据: score ≤ 70 且 studyDesign ∈ {RCT, 系统综述}
//   C 高分缺设计: score ≥ 80 的 research 条目没有 studyDesign 字段
function findAnomalies(items) {
  const weak = new Set(['观察研究', '述评']);
  const strong = new Set(['RCT', '系统综述']);
  const out = [];
  for (const i of items) {
    const isResearch = (i.tags || [])[0] === 'research';
    if (!isResearch) continue;
    const d = i.studyDesign;
    if (i.curatedScore >= 80 && d && weak.has(d)) out.push({ flag: 'A 高分弱证据', ...pick(i) });
    else if (i.curatedScore <= 70 && d && strong.has(d)) out.push({ flag: 'B 低分强证据', ...pick(i) });
    else if (i.curatedScore >= 80 && !d) out.push({ flag: 'C 高分缺设计', ...pick(i) });
  }
  return out.sort((a, b) => b.score - a.score);
}
const pick = (i) => ({
  score: i.curatedScore, design: i.studyDesign || '—', journal: i.journal || i.source,
  title: i.title, url: i.sourceUrl, id: i.id,
  date: (i.firstSeen || i.publishedAt || '').slice(0, 10),
});

// ── main ─────────────────────────────────────────────────────────────────────
function main() {
  const items = loadAll();
  const research = items.filter((i) => (i.tags || [])[0] === 'research');
  const jidx = journalIndex();

  console.log(`SIGNAL 校准报告 — ${new Date().toISOString().slice(0, 10)}`);
  console.log(`条目：全部 ${items.length}（research ${research.length}）`);

  // 1. 总分布
  const buckets = { '85+': 0, '75-84': 0, '65-74': 0, '<65': 0 };
  for (const i of items) {
    const s = i.curatedScore;
    buckets[s >= 85 ? '85+' : s >= 75 ? '75-84' : s >= 65 ? '65-74' : '<65']++;
  }
  console.log('\n展示档分布:', Object.entries(buckets).map(([k, v]) => `${k}:${v}`).join('  '));

  // 2. 方向性检查（research 条目）
  const byDesign = groupReport('按研究设计（期望：系统综述/RCT 高于 观察研究/述评）', research, (i) => i.studyDesign);
  groupReport('按期刊分区（期望：Q1 ≥ Q2 ≥ 无分区）', research, (i) => (jidx[norm(i.journal)] || {}).quartile);
  groupReport('按内容类型', items, (i) => (i.tags || [])[0]);

  // 方向性验证：硬断言打印 PASS/FAIL
  const m = (k) => (byDesign[k] ? mean(byDesign[k]) : null);
  const checks = [
    ['系统综述 > 观察研究', m('系统综述'), m('观察研究')],
    ['RCT > 观察研究', m('RCT'), m('观察研究')],
    ['RCT > 述评', m('RCT'), m('述评')],
  ];
  console.log('\n方向性检查:');
  for (const [name, a, b] of checks) {
    if (a == null || b == null) { console.log(`  SKIP  ${name}（缺数据）`); continue; }
    console.log(`  ${a > b ? 'PASS' : 'FAIL'}  ${name}（${a.toFixed(1)} vs ${b.toFixed(1)}，差 ${(a - b).toFixed(1)}）`);
  }

  // 3. 抽查表
  const anomalies = findAnomalies(items);
  console.log(`\n人工抽查候选（分数与证据强度矛盾）：${anomalies.length} 条`);
  for (const a of anomalies.slice(0, 15)) {
    console.log(`  [${a.flag}] ${a.score} ${a.design.padEnd(5)} ${a.date} ${a.title.slice(0, 70)}`);
  }
  if (anomalies.length > 15) console.log(`  …其余 ${anomalies.length - 15} 条见 --md 输出`);

  if (process.argv.includes('--md')) {
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(ROOT, 'briefs', `score-audit-${day}.md`);
    const lines = [
      `# SIGNAL 人工抽查表 — ${day}`, '',
      `全部 ${items.length} 条（research ${research.length}）。以下 ${anomalies.length} 条的分数与证据强度代理指标矛盾，逐条打开原文判断分数是否合理；错误率 >20% 说明 rubric 或模型需要调。`, '',
      '| ✓ | flag | score | 设计 | 期刊 | 日期 | 标题 | 判定 |',
      '|---|------|-------|------|------|------|------|------|',
      ...anomalies.map((a) => `| ☐ | ${a.flag} | ${a.score} | ${a.design} | ${a.journal} | ${a.date} | [${a.title.replace(/\s+/g, ' ').replace(/\|/g, '\\|').slice(0, 90)}](${a.url}) |  |`),
    ];
    fs.writeFileSync(file, lines.join('\n') + '\n');
    console.log(`\n已写 ${path.relative(ROOT, file)}`);
  }
}

main();
