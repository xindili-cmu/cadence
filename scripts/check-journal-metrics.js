#!/usr/bin/env node
/**
 * journals.json 年度刷新助手。
 *
 * 为什么存在：JCR 没有免费 API，影响因子只能一本一本从出版方页面上抄。2026-08-02
 * 那次全量刷新暴露了三件事，这个脚本就是为了让明年不用再发现一遍：
 *
 *   1. 出版方给的东西参差不齐。T&F / BMJ 会同时给 IF 和分区（或排名），Elsevier /
 *      BMC / Wolters Kluwer 只给一个裸 IF，多数还不标 JCR 年份。不标年份就不能断言
 *      版本 —— 这类只能记进 _pending，等 Web of Science 确认。
 *   2. 有几家（Wiley / Sage / ScienceDirect）挂人机验证，自动化根本进不去，只能人工。
 *   3. 真正值得花时间的刊很少。344 次徽章渲染里前 10 本占 72%，尾部 19 本合计不到
 *      18%，其中 7 本从来没出现过。按出现频次排序干活，比从头刷到尾划算得多。
 *
 * 所以默认模式不联网：它把「今年该动哪几行、按什么顺序动、去哪个 URL 看」列成清单。
 * 抓取是可选的 best-effort，抓不到不算失败（页面多半是 JS 渲染的）。
 *
 *   node scripts/check-journal-metrics.js              # 工作清单（按影响力排序）
 *   node scripts/check-journal-metrics.js --fetch      # 额外试着抓一遍 metricsUrl
 *   node scripts/check-journal-metrics.js --all        # 连没出现过的刊也列出来
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FETCH = process.argv.includes('--fetch');
const ALL = process.argv.includes('--all');

// app.data.jsx 的 cdNormJournal 同款归一化。两边必须一致，否则频次统计会对不上徽章。
const norm = (s) => (s || '').toLowerCase()
  .replace(/\(.*?\)/g, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ').trim().replace(/^the /, '');

function loadJournals() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'journals.json'), 'utf8'));
}

// 徽章渲染频次 = 这本刊值多少维护成本。archive/*.json + news.json，按 id/url 去重。
function renderCounts(journals) {
  const alias = new Map();
  journals.forEach((j) => [j.name, ...(j.aliases || [])].forEach((a) => alias.set(norm(a), j.name)));

  const items = [];
  const seen = new Set();
  const push = (arr) => (arr || []).forEach((i) => {
    const k = i.id || i.url;
    if (k && seen.has(k)) return;
    if (k) seen.add(k);
    items.push(i);
  });

  const dir = path.join(ROOT, 'archive');
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).sort()) {
      if (!/^\d{4}-\d{2}\.json$/.test(f)) continue;
      try { push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).items); } catch {}
    }
  }
  try { push(JSON.parse(fs.readFileSync(path.join(ROOT, 'news.json'), 'utf8')).items); } catch {}

  const counts = new Map();
  let matched = 0;
  for (const i of items) {
    if (!i.journal) continue;
    const name = alias.get(norm(i.journal));
    if (!name) continue;
    matched++;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return { counts, matched, corpus: items.length };
}

// 页面上常见的写法：「1.6 (2025)」「Impact Factor: 15.5」「Impact Factor 2.8」。
// 只是给人提个醒，不作为写入依据 —— 抓到什么都要人眼确认年份。
function sniffIF(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const out = [];
  const withYear = /impact factor[^.]{0,40}?(\d{1,3}(?:\.\d)?)\s*\((20\d\d)\)|(\d{1,3}(?:\.\d)?)\s*\((20\d\d)\)\s*impact factor/gi;
  const plain = /impact factor[^\d]{0,25}(\d{1,3}(?:\.\d)?)/gi;
  let m;
  while ((m = withYear.exec(text))) out.push({ value: m[1] || m[3], year: m[2] || m[4] });
  if (!out.length) while ((m = plain.exec(text))) out.push({ value: m[1], year: null });
  const uniq = [];
  for (const o of out) if (!uniq.some((u) => u.value === o.value && u.year === o.year)) uniq.push(o);
  return uniq.slice(0, 3);
}

async function tryFetch(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CadenceBot/1.0 (journal metrics check)', Accept: 'text/html' },
      redirect: 'follow',
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const html = await res.text();
    if (/just a moment|cf-browser-verification|are you a robot|captcha/i.test(html)) {
      return { error: '人机验证拦截 — 需人工打开' };
    }
    const hits = sniffIF(html);
    return hits.length ? { hits } : { error: '页面里没找到 IF（多半是 JS 渲染）' };
  } catch (e) {
    return { error: e.message };
  }
}

(async () => {
  const table = loadJournals();
  const tableYear = table.jcrYear;
  const { counts, matched, corpus } = renderCounts(table.journals);

  const rows = table.journals.map((j) => {
    const year = j.jcrYear || tableYear;
    const qYear = j.quartileYear || year;
    return {
      j,
      n: counts.get(j.name) || 0,
      year,
      qYear,
      quartileHidden: j.impactFactor != null && qYear !== year,
      status: j._blocked ? 'BLOCKED' : j._pending ? 'PENDING' : year < tableYear ? 'OLD'
        : year > tableYear ? 'FRESH' : 'BASE',
    };
  }).sort((a, b) => b.n - a.n || a.j.name.localeCompare(b.j.name));

  const shown = ALL ? rows : rows.filter((r) => r.n > 0);
  const cum = (() => { let s = 0; return rows.map((r) => (s += r.n) / (matched || 1)); })();

  console.log(`\njournals.json — 表级 jcrYear ${tableYear}，updated ${table.updated}`);
  console.log(`语料 ${corpus} 条，命中 roster ${matched} 次（= 徽章渲染次数）\n`);
  console.log('  次数  累计   状态      IF / 分区        版本        期刊');
  console.log('  ' + '─'.repeat(96));

  const ICON = { FRESH: '✅新', BASE: '  ·', OLD: '⚠️旧', PENDING: '⏸待确认', BLOCKED: '⛔被拦' };
  shown.forEach((r, i) => {
    const ifq = `${r.j.impactFactor == null ? '—' : r.j.impactFactor}${r.quartileHidden ? ` (${r.j.quartile}隐藏)` : r.j.quartile ? ` ${r.j.quartile}` : ''}`;
    const ver = r.qYear === r.year ? `'${String(r.year).slice(-2)}` : `IF'${String(r.year).slice(-2)} Q'${String(r.qYear).slice(-2)}`;
    console.log(
      `  ${String(r.n).padStart(4)}  ${(100 * cum[i]).toFixed(0).padStart(3)}%  ${ICON[r.status].padEnd(8)}  ${ifq.padEnd(16)} ${ver.padEnd(12)}${r.j.name}`
    );
  });

  const todo = rows.filter((r) => r.status === 'PENDING' || r.status === 'BLOCKED');
  if (todo.length) {
    console.log('\n需要人工介入的行：');
    for (const r of todo) {
      console.log(`\n  ${r.j.name}  （出现 ${r.n} 次）`);
      console.log(`    ${r.j.metricsUrl || '（无 metricsUrl）'}`);
      console.log(`    ${r.j._pending || r.j._blocked}`);
    }
  }

  const noUrl = rows.filter((r) => r.n > 0 && !r.j.metricsUrl);
  if (noUrl.length) {
    console.log(`\n还没配 metricsUrl 的高频刊（${noUrl.length} 本）：`);
    noUrl.slice(0, 12).forEach((r) => console.log(`  ${String(r.n).padStart(4)}  ${r.j.name}`));
  }

  if (FETCH) {
    console.log('\n──── --fetch：best-effort 抓取，抓不到不代表出错 ────');
    for (const r of rows.filter((x) => x.j.metricsUrl)) {
      const got = await tryFetch(r.j.metricsUrl);
      if (got.error) { console.log(`  ✗ ${r.j.name}: ${got.error}`); continue; }
      const same = got.hits.some((h) => String(h.value) === String(r.j.impactFactor));
      console.log(`  ${same ? '=' : '≠'} ${r.j.name}: 表里 ${r.j.impactFactor}，页面 ${got.hits.map((h) => h.value + (h.year ? ` (${h.year})` : ' (无年份)')).join(' / ')}`);
      await new Promise((s) => setTimeout(s, 800));
    }
  }

  console.log('\n改完记得把 updated 改成今天，并核对每行 jcrYear / quartileYear。');
  console.log('出版方没标年份的，只写 _pending，别猜版本。\n');
})();
