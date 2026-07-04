#!/usr/bin/env node
// One-off backfill: rewrites Chinese-language `summary` fields in English.
//
// Why: `summary` is the EN-mode body copy AND the EN share-card description,
// but the curation model wrote Chinese into it on ~30% of PubMed items
// (2026-07-04 adversarial review: 22/75 in news.json, 32 more in archive/).
// news-refresh.js now has a repairChineseSummaries pass for new runs; this
// script fixes the existing data. The Chinese text is preserved into
// summaryZh when that field is missing, so nothing is lost.
//
// Safe to re-run — only items whose summary contains CJK are touched.
// Usage (Cindy's terminal — the sandbox can't reach LLM APIs):
//   node scripts/backfill-summary-en.js
// Reads LLM_PROVIDER / GEMINI_API_KEY etc. from the environment, falling
// back to .env in the repo root.
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

const { callLLM } = require('./news-refresh.js');

const CJK_RE = /[一-鿿]/;

const SYSTEM = `你是 Cadence（步频）物理治疗新闻站的英文编辑。下面每条的 summary 本应是英文，却是中文。请把每条改写成 1-2 句中性英文：
- front-load "what changed"——先说结论方向，再说条件。
- 保留原文里的所有数字（样本量、效应量、p 值 / CI），照抄原值，绝不臆测。
- 缩写（RCT、ACL、COPD 等）保留。专业、紧凑，不是逐字翻译。
- 只讲研究"发现了什么"，不罗列统计方法。
- 可参考随附的英文 title 校准术语。

请只返回 JSON 数组（不要 markdown 代码块）：[{"id":"news-…","summary":"English summary"}]`;

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
  const todo = items.filter(i => CJK_RE.test(i.summary || ''));
  console.log(`${path.basename(filePath)}: ${items.length} items, ${todo.length} Chinese summaries`);
  if (!todo.length) return;

  const byId = {};
  for (let off = 0; off < todo.length; off += 8) {
    const batch = todo.slice(off, off + 8).map(i => ({ id: i.id, title: i.title, summary: i.summary }));
    const user = `重写以下 ${batch.length} 条：\n\n${JSON.stringify(batch, null, 2)}`;
    const text = await callLLM(SYSTEM, user);
    const out = parseArray(text || '');
    out.forEach(o => { if (o.id && o.summary && !CJK_RE.test(o.summary)) byId[o.id] = o.summary; });
    console.log(`  batch ${off / 8 + 1}: ${out.length}/${batch.length} rewritten`);
  }

  let patched = 0;
  for (const i of items) {
    const en = byId[i.id];
    if (!en) continue;
    if (!i.summaryZh) i.summaryZh = i.summary; // 中文版别丢
    i.summary = en;
    patched++;
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`  ✓ ${patched} items patched → ${path.basename(filePath)}`);
}

(async () => {
  await backfillFile(path.join(__dirname, '..', 'news.json'));
  const archDir = path.join(__dirname, '..', 'archive');
  if (fs.existsSync(archDir)) {
    for (const f of fs.readdirSync(archDir).filter(f => /^\d{4}-\d{2}\.json$/.test(f))) {
      await backfillFile(path.join(archDir, f));
    }
  }
  console.log('Done. news-refresh.js 的下一次 cron 会照常重写 rss.xml；无需手动处理。');
})().catch(e => { console.error('❌', e); process.exit(1); });
