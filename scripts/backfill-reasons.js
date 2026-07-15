#!/usr/bin/env node
/**
 * Cadence — 存量 why-it-matters 反模板腔清洗（2026-07-08 对抗性审查 #8 的 backfill 半边）
 *
 * news-refresh.js 的 repairBoilerplateReasons 只作用于新策展条目；这个脚本把同一套
 * 检测 + 重写跑在存量数据上：news.json（默认）和 archive/YYYY-MM.json（--archive）。
 *
 * 只改 curatedReason / curatedReasonEn 两个字段；id / score / firstSeen 一概不动，
 * 不会触发身份或分数 churn。重写后仍命中模板正则的条目保留原文。
 *
 * ⚠️ 只能在 Cindy 本地终端跑（沙箱连不上 LLM API）：
 *   LLM_PROVIDER=gemini GEMINI_API_KEY=... node scripts/backfill-reasons.js --dry   # 先看命中多少
 *   LLM_PROVIDER=gemini GEMINI_API_KEY=... node scripts/backfill-reasons.js         # 改 news.json
 *   LLM_PROVIDER=gemini GEMINI_API_KEY=... node scripts/backfill-reasons.js --archive  # 连 archive 一起
 *
 * 跑完 git diff 抽查几条再 push；cron 下一轮会原样携带清洗后的字段。
 */

const fs = require('fs');
const path = require('path');
const { repairBoilerplateReasons, isReasonSlop } = require('./news-refresh');

const ROOT = path.join(__dirname, '..');
const NEWS_PATH = path.join(ROOT, 'news.json');
const ARCHIVE_DIR = path.join(ROOT, 'archive');

const DRY = process.argv.includes('--dry');
const DO_ARCHIVE = process.argv.includes('--archive');

// Detection reuses the exported source-of-truth from news-refresh.js, so the
// --dry count and the changed-item report can never drift from what the rewrite
// actually targets (2026-07-15 adversarial review — a duplicated regex here had
// gone stale).
const isSlop = isReasonSlop;

async function processFile(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const items = data.items || [];
  const hits = items.filter(isSlop);
  console.log(`\n${path.relative(ROOT, file)} — ${items.length} items, ${hits.length} boilerplate hit(s)`);
  if (!hits.length || DRY) {
    if (DRY) hits.slice(0, 10).forEach(i => console.log(`   · ${(i.title || '').slice(0, 60)}`));
    return 0;
  }
  const before = new Map(hits.map(i => [i.id, { zh: i.curatedReason, en: i.curatedReasonEn }]));
  await repairBoilerplateReasons(items); // mutates curatedReason/-En in place, id/score untouched
  let changed = 0;
  for (const i of hits) {
    const b = before.get(i.id);
    if (b && (b.zh !== i.curatedReason || b.en !== i.curatedReasonEn)) {
      changed++;
      console.log(`   ✏️  ${(i.title || '').slice(0, 55)}`);
    }
  }
  if (changed) fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`   rewrote ${changed}/${hits.length}${changed ? ' → saved' : ' (nothing accepted, file untouched)'}`);
  return changed;
}

(async () => {
  console.log(`backfill-reasons ${DRY ? '(DRY RUN — no writes)' : ''}`);
  let total = await processFile(NEWS_PATH);
  if (DO_ARCHIVE && fs.existsSync(ARCHIVE_DIR)) {
    const months = fs.readdirSync(ARCHIVE_DIR).filter(f => /^\d{4}-\d{2}\.json$/.test(f)).sort();
    for (const m of months) total += await processFile(path.join(ARCHIVE_DIR, m));
  }
  console.log(`\nDone — ${total} item(s) rewritten${DRY ? ' (dry)' : ''}.`);
})().catch(e => { console.error('❌', e); process.exit(1); });
