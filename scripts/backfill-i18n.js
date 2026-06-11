#!/usr/bin/env node
// One-off backfill: adds titleZh / summaryZh / curatedReasonEn to existing
// news.json items (and archive/*.json if present) that predate the bilingual
// curation prompt. Safe to re-run — items that already have all three fields
// are skipped. New items get the fields from the cron going forward.
//
// Usage: node scripts/backfill-i18n.js
// Reads ANTHROPIC_API_KEY (or LLM_PROVIDER=gemini + GEMINI_API_KEY) from the
// environment, falling back to .env in the repo root.
const fs = require('fs');
const path = require('path');

// .env fallback (repo root, gitignored) — only fills vars not already set.
const ENV_PATH = path.join(__dirname, '..', '.env');
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const { callAnthropic, callGemini, LLM_PROVIDER } = require('./news-refresh.js');

const SYSTEM = `你是 Cadence（步频）物理治疗新闻站的双语编辑。对输入的每条新闻补三个字段：
- titleZh：标题的中文翻译。专业、紧凑，不逐字直译；解剖结构 / 干预手段用临床通用中文译名，缩写（ACL、COPD、RCT 等）保留英文。
- summaryZh：summary 的中文版，1-2 句，front-load 变化点，保留所有数字（样本量、效应量、p 值）。要像中文期刊导读，不要直译腔。
- curatedReasonEn：curatedReason（中文 why-it-matters）的英文版。同一个 take、同样口吻：second-person、直接下判断、不用条件句开头（"If you treat…"禁止）、不用空效用措辞（"provides evidence/helps you decide/worth noting"禁止）。资深同行口吻，可以泼冷水、可以站队。

请只返回 JSON 数组（不要 markdown 代码块）：
[{"id":"news-…","titleZh":"…","summaryZh":"…","curatedReasonEn":"…"}]`;

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

async function backfillFile(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const items = data.items || [];
  const todo = items.filter(i => !(i.titleZh && i.summaryZh && i.curatedReasonEn));
  console.log(`${path.basename(filePath)}: ${items.length} items, ${todo.length} need backfill`);
  if (!todo.length) return;

  const byId = {};
  for (let off = 0; off < todo.length; off += 8) {
    const batch = todo.slice(off, off + 8).map(i => ({
      id: i.id, title: i.title, summary: i.summary, curatedReason: i.curatedReason,
    }));
    const user = `补全以下 ${batch.length} 条：\n\n${JSON.stringify(batch, null, 2)}`;
    const text = LLM_PROVIDER === 'gemini' ? await callGemini(SYSTEM, user) : await callAnthropic(SYSTEM, user);
    const out = parseArray(text);
    out.forEach(o => { if (o.id) byId[o.id] = o; });
    console.log(`  batch ${off / 8 + 1}: ${out.length}/${batch.length} translated`);
  }

  let patched = 0;
  for (const i of items) {
    const o = byId[i.id];
    if (!o) continue;
    if (o.titleZh) i.titleZh = i.titleZh || o.titleZh;
    if (o.summaryZh) i.summaryZh = i.summaryZh || o.summaryZh;
    if (o.curatedReasonEn) i.curatedReasonEn = i.curatedReasonEn || o.curatedReasonEn;
    patched++;
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`  ✓ ${patched} items patched → ${path.basename(filePath)}`);
}

(async () => {
  await backfillFile(path.join(__dirname, '..', 'news.json'));
  const archDir = path.join(__dirname, '..', 'archive');
  if (fs.existsSync(archDir)) {
    for (const f of fs.readdirSync(archDir).filter(f => f.endsWith('.json'))) {
      await backfillFile(path.join(archDir, f));
    }
  }
  console.log('Done.');
})().catch(e => { console.error('❌', e); process.exit(1); });
