#!/usr/bin/env node
// One-off backfill: rewrites English curatedReason fields in Chinese.
//
// Background (2026-06-12): the curation prompt requires curatedReason in
// Chinese with curatedReasonEn as the English twin, but the model sometimes
// ignored this and returned the English take in BOTH fields. news-refresh.js
// now has a repair pass (repairEnglishReasons) for future runs; this script
// fixes the rows already written to disk.
//
// Touches: news.json, archive/2026-*.json (LLM rewrite), then patches
// briefs/daily/*.json by story id from the same map (no extra LLM calls).
// Safe to re-run — items whose curatedReason already contains CJK are skipped.
//
// Usage: node scripts/backfill-reason-zh.js
// Reads ANTHROPIC_API_KEY (or LLM_PROVIDER=gemini + GEMINI_API_KEY) from the
// environment, falling back to .env in the repo root.
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '..', '.env');
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const { callAnthropic, callGemini, LLM_PROVIDER } = require('./news-refresh.js');

const CJK_RE = /[一-鿿]/;
const ROOT = path.join(__dirname, '..');

const SYSTEM = `你是 Cadence（步频）物理治疗新闻站的中文编辑。下面每条的 curatedReason（why-it-matters）本应是中文，却生成成了英文。请把每条改写成 1-2 句中文：
- **第二人称**对临床读者说话，给 take 而不是 recap——直接下判断：这条改变什么、不改变什么、该做什么、别做什么。
- 禁止条件句开头（"如果你在使用…"、"如果你关注…"）——默认读者就是干这行的。
- 禁止空效用措辞："有参考价值"、"帮助你决策"、"值得关注"、"提供了依据/证据/支持"、"有指导意义"。
- 口吻是资深同行，可以泼冷水、可以站队。不是逐字翻译，是同一条专业意见的中文版。
- 缩写（RCT、ACL、COPD 等）保留英文；保留原文里的数字（样本量、效应量、p 值）。

请只返回 JSON 数组（不要 markdown 代码块）：[{"id":"news-…","curatedReason":"中文"}]`;

function parseArray(raw) {
  let text = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const start = text.indexOf('[');
  if (start === -1) return [];
  text = text.slice(start);
  try { return JSON.parse(text); } catch (e) {
    for (let cut = text.lastIndexOf('}'); cut > 0; cut = text.lastIndexOf('}', cut - 1)) {
      try { return JSON.parse(text.slice(0, cut + 1) + ']'); } catch { /* keep cutting */ }
    }
    return [];
  }
}

// id → { curatedReason (zh), curatedReasonEn } — shared across files so the
// same story gets the same rewrite in feed, archive and briefs.
const fixedById = {};

async function rewriteBatch(items) {
  const todo = items.filter(i => i.id && !fixedById[i.id]);
  for (let off = 0; off < todo.length; off += 10) {
    const batch = todo.slice(off, off + 10).map(i => ({
      id: i.id, title: i.title, summary: i.summary, curatedReason: i.curatedReason,
    }));
    const user = `重写以下 ${batch.length} 条：\n\n${JSON.stringify(batch, null, 2)}`;
    const text = LLM_PROVIDER === 'gemini' ? await callGemini(SYSTEM, user) : await callAnthropic(SYSTEM, user);
    for (const o of parseArray(text || '')) {
      if (!o.id || !o.curatedReason || !CJK_RE.test(o.curatedReason)) continue;
      const src = batch.find(b => b.id === o.id);
      if (!src) continue;
      fixedById[o.id] = { curatedReason: o.curatedReason, curatedReasonEn: src.curatedReason };
    }
    console.log(`   batch ${off / 10 + 1}: ${batch.length} sent, ${batch.filter(b => fixedById[b.id]).length} fixed`);
  }
}

function applyFix(item) {
  const fix = item && item.id && fixedById[item.id];
  if (!fix || CJK_RE.test(item.curatedReason || '')) return false;
  if (!item.curatedReasonEn || item.curatedReasonEn === item.curatedReason) {
    item.curatedReasonEn = fix.curatedReasonEn; // 英文版别丢
  }
  item.curatedReason = fix.curatedReason;
  return true;
}

// Recursively patch any object carrying id + curatedReason (briefs nest
// stories inside sections[].items[]).
function patchDeep(node) {
  let n = 0;
  if (Array.isArray(node)) { node.forEach(v => { n += patchDeep(v); }); return n; }
  if (node && typeof node === 'object') {
    if (applyFix(node)) n++;
    for (const v of Object.values(node)) n += patchDeep(v);
  }
  return n;
}

(async () => {
  // 1. Collect offenders from feed + archive, rewrite via LLM.
  const sources = ['news.json',
    ...fs.readdirSync(path.join(ROOT, 'archive')).filter(f => /^\d{4}-\d{2}\.json$/.test(f)).map(f => `archive/${f}`)];
  const parsed = {};
  for (const rel of sources) {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    parsed[rel] = data;
    const bad = (data.items || []).filter(i => i.curatedReason && !CJK_RE.test(i.curatedReason));
    console.log(`${rel}: ${(data.items || []).length} items, ${bad.length} English curatedReason`);
    if (bad.length) await rewriteBatch(bad);
  }

  // 2. Write feed + archive.
  for (const rel of sources) {
    const n = (parsed[rel].items || []).reduce((acc, i) => acc + (applyFix(i) ? 1 : 0), 0);
    if (n) { fs.writeFileSync(path.join(ROOT, rel), JSON.stringify(parsed[rel], null, 2)); console.log(`✓ ${rel}: ${n} fixed`); }
  }

  // 3. Patch daily briefs by id (stories are embedded copies of feed items).
  const briefDir = path.join(ROOT, 'briefs', 'daily');
  if (fs.existsSync(briefDir)) {
    for (const f of fs.readdirSync(briefDir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))) {
      const p = path.join(briefDir, f);
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      const n = patchDeep(data);
      if (n) { fs.writeFileSync(p, JSON.stringify(data, null, 2)); console.log(`✓ briefs/daily/${f}: ${n} fixed`); }
    }
  }

  const total = Object.keys(fixedById).length;
  console.log(`\nDone — ${total} unique stories rewritten.`);
})().catch(err => { console.error(err); process.exit(1); });
