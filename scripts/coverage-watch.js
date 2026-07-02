#!/usr/bin/env node
/**
 * coverage-watch.js — 稀疏专科覆盖量监控（离线）。
 *
 * 背景：2026-07-01 给 journals.json 补了 geriatric / cardiopulmonary /
 * pediatric 三科的主场期刊（白名单缺主场刊 = 那科进不来）。本脚本按
 * firstSeen 周切片统计各专科收录量，对比白名单扩充前后，回答一个问题：
 * 「起色了吗？没起色就得收窄品类承诺。」（对抗式审查点 4/11）
 *
 * 用法：node scripts/coverage-watch.js
 *   判据（写死在下面，改了请同步 PRINCIPLES 讨论）：
 *   扩充后 ≥2 个完整周，watch 专科均值 <2 篇/周 ⇒ 建议收窄或继续补管道
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CUTOVER = '2026-07-01';           // journals.json 三科主场刊补齐日
const WATCH = ['pediatric', 'geriatric', 'cardiopulmonary'];
const CATS = ['orthopedic', 'neurological', 'sports', 'pediatric', 'geriatric', 'cardiopulmonary', 'manual-modality', 'practice'];
const THRESHOLD = 2;                     // 篇/周，低于此为「没起色」

function loadAll() {
  const seen = new Set(); const all = [];
  const take = (list) => {
    for (const i of list || []) {
      if (!i || !i.id) continue;
      if (seen.has(i.id) || (i.sourceUrl && seen.has(i.sourceUrl))) continue;
      seen.add(i.id); if (i.sourceUrl) seen.add(i.sourceUrl);
      all.push(i);
    }
  };
  take(JSON.parse(fs.readFileSync(path.join(ROOT, 'news.json'), 'utf8')).items);
  for (const f of fs.readdirSync(path.join(ROOT, 'archive')).sort()) {
    if (!/^\d{4}-\d{2}\.json$/.test(f)) continue;
    take(JSON.parse(fs.readFileSync(path.join(ROOT, 'archive', f), 'utf8')).items);
  }
  return all.filter((i) => i.firstSeen);
}

// ISO 周一为一周起点
const weekOf = (iso) => {
  const t = new Date(iso);
  const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

function main() {
  const items = loadAll();
  const today = new Date().toISOString().slice(0, 10);
  const thisWeek = weekOf(today);

  // 周 × 专科矩阵
  const weeks = {};
  for (const i of items) {
    const w = weekOf(i.firstSeen);
    (weeks[w] = weeks[w] || {})[i.category] = (weeks[w][i.category] || 0) + 1;
  }
  const wkeys = Object.keys(weeks).sort();

  console.log(`覆盖量监控 — ${today}（cutover ${CUTOVER}，watch: ${WATCH.join('/')}）`);
  console.log(`\n周（firstSeen）  ${CATS.map((c) => c.slice(0, 6).padStart(6)).join(' ')}   合计`);
  for (const w of wkeys) {
    const row = CATS.map((c) => String(weeks[w][c] || 0).padStart(6)).join(' ');
    const total = CATS.reduce((s, c) => s + (weeks[w][c] || 0), 0);
    const mark = w === weekOf(CUTOVER) ? ' ←过渡周' : w > weekOf(CUTOVER) ? ' ←扩充后' : '';
    console.log(`${w}      ${row}  ${String(total).padStart(5)}${w === thisWeek ? '（本周未完）' : mark}`);
  }

  // 前后对比：完整周（排除进行中的本周）。cutover 落在周中（2026-07-01 是
  // 周三），其所在周（6-29）前两天还是旧白名单——算「过渡周」，两边都不计，
  // 避免稀释对比。
  const cutWeek = weekOf(CUTOVER);
  const pre = wkeys.filter((w) => w < cutWeek);
  const post = wkeys.filter((w) => w > cutWeek && w !== thisWeek);
  const avg = (ws, c) => (ws.length ? ws.reduce((s, w) => s + (weeks[w][c] || 0), 0) / ws.length : null);

  console.log(`\n扩充前 ${pre.length} 个完整周 vs 扩充后 ${post.length} 个完整周（过渡周 ${cutWeek} 与进行中的本周不计）：`);
  for (const c of WATCH) {
    const a = avg(pre, c); const b = avg(post, c);
    console.log(`  ${c.padEnd(16)} ${a == null ? '—' : a.toFixed(1)} → ${b == null ? '（还没完整周）' : b.toFixed(1)} 篇/周`);
  }

  // watch 专科的条目都来自哪些期刊——看新白名单期刊有没有真的产出
  console.log('\nwatch 专科条目的期刊来源（全部历史）：');
  for (const c of WATCH) {
    const g = {};
    for (const i of items.filter((x) => x.category === c)) {
      const j = i.journal || i.source || '(unknown)';
      g[j] = (g[j] || 0) + 1;
    }
    const rows = Object.entries(g).sort((a, b) => b[1] - a[1]).map(([j, n]) => `${j}×${n}`).join('，');
    console.log(`  ${c}: ${rows || '（无）'}`);
  }

  // 判定
  console.log('\n判定：');
  if (post.length < 2) {
    console.log(`  数据不足——扩充后只有 ${post.length} 个完整周（过渡周不计），攒够 2 周再跑（预计 ${addDays(weekOf(CUTOVER), 21)} 之后）。`);
  } else {
    let anyFail = false;
    for (const c of WATCH) {
      const b = avg(post, c);
      const ok = b >= THRESHOLD;
      if (!ok) anyFail = true;
      console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${c}：扩充后 ${b.toFixed(1)} 篇/周（阈值 ${THRESHOLD}）`);
    }
    console.log(anyFail
      ? '\n  ⇒ 有专科没起色：要么继续补该科管道（期刊白名单/检索词），要么收窄站点的品类承诺（隐藏/合并稀疏 tab），别让空 tab 劝退用户。'
      : '\n  ⇒ 三科都达标，品类承诺可以维持。');
  }
}

const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

main();
