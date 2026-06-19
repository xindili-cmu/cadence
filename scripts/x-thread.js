/**
 * Cadence 步频 — 日报 → X (Twitter) thread generator.
 *
 * Turns one immutable daily edition (briefs/daily/YYYY-MM-DD.json) into a
 * ready-to-post X thread, in both Chinese and English. No new content is
 * written — it reuses the edition's bilingual lead + scored items, so the
 * thread always matches what the site/公众号/XHS already published.
 *
 * Thread shape (mirrors how research accounts post on X):
 *   1. Hook      — brand + date + lead headline + "今日 N 条更新 … 🧵"
 *   2..N. Items  — top items by curatedScore, one per tweet, LINK-FREE
 *                  (X suppresses reach on posts with external links, so the
 *                  body stays clean and all links live in the final tweet).
 *   last. CTA    — one link to the full daily edition (which lists every
 *                  source) + follow prompt.
 *   +sources     — an optional appendix block (journal + link per item) that
 *                  Cindy can paste as the FIRST REPLY if she wants inline cites.
 *
 * X character budget: weighted length, max 280. CJK/Kana/Hangul count as 2,
 * everything else as 1, any URL is a flat 23. We compute the weight and trim
 * the takeaway (never the title) until each tweet fits, with a hard assert.
 *
 * Usage:
 *   node scripts/x-thread.js                 # latest edition, both langs
 *   node scripts/x-thread.js 2026-06-14      # a specific edition
 *   N=6 node scripts/x-thread.js             # 6 item-tweets (default 5)
 *   DRY_RUN=true node scripts/x-thread.js    # print, write nothing
 *
 * Env:
 *   SITE_URL   default https://incadencept.com
 *   X_HANDLE   e.g. @cadence_pt — appended to the CTA when set
 *   N          item-tweet count (default 5)
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.env.DRY_RUN === 'true';
const SITE_URL = (process.env.SITE_URL || 'https://incadencept.com').replace(/\/$/, '');
const X_HANDLE = process.env.X_HANDLE || '';
const ITEM_COUNT = Math.max(1, parseInt(process.env.N || '5', 10));
const MAX_WEIGHT = 280;
const URL_WEIGHT = 23; // X counts every URL as 23 regardless of length (t.co)

const DAILY_DIR = path.join(__dirname, '..', 'briefs', 'daily');
const OUT_ROOT = path.join(__dirname, '..', 'x');

// Category → emoji + 中文名 (mirrors scripts/daily-brief.js CAT_ZH order).
const CAT = {
  orthopedic:       { e: '🦴', zh: '骨科与肌骨', en: 'Orthopedic' },
  neurological:     { e: '🧠', zh: '神经康复',   en: 'Neuro' },
  sports:           { e: '🏃', zh: '运动康复',   en: 'Sports' },
  pediatric:        { e: '👶', zh: '儿童康复',   en: 'Pediatric' },
  geriatric:        { e: '👴', zh: '老年康复',   en: 'Geriatric' },
  cardiopulmonary:  { e: '🫁', zh: '心肺康复',   en: 'Cardiopulmonary' },
  'manual-modality':{ e: '🤲', zh: '手法与理疗', en: 'Manual & Modality' },
  practice:         { e: '💼', zh: '行业与执业', en: 'Practice' },
};
const catOf = (c) => CAT[c] || { e: '🔬', zh: '研究', en: 'Research' };

// ---- X weighted character length -----------------------------------------
// CJK Unified, Hiragana, Katakana, Hangul, fullwidth forms → weight 2.
function isWide(cp) {
  return (
    (cp >= 0x1100 && cp <= 0x11ff) || // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK radicals / Kangxi / punctuation
    (cp >= 0x3041 && cp <= 0x33ff) || // Hiragana, Katakana, CJK symbols
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Ext A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK compat
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK compat forms
    (cp >= 0xff00 && cp <= 0xff60) || // fullwidth forms
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x20000 && cp <= 0x3fffd)  // CJK Ext B+
  );
}
// Weighted length, treating any http(s) URL token as URL_WEIGHT.
function xLen(text) {
  let weight = 0;
  // Replace URLs with a sentinel of fixed weight, count the rest per-codepoint.
  const parts = text.split(/(https?:\/\/\S+)/g);
  for (const part of parts) {
    if (/^https?:\/\/\S+$/.test(part)) { weight += URL_WEIGHT; continue; }
    for (const ch of part) {
      const cp = ch.codePointAt(0);
      // Emoji / surrogate-pair symbols count as 2 on X.
      weight += (isWide(cp) || cp > 0xffff) ? 2 : 1;
    }
  }
  return weight;
}

// Trim a string to fit `budget` weighted units, adding an ellipsis if cut.
function fitTo(text, budget, ell = '…') {
  if (xLen(text) <= budget) return text;
  const ellW = xLen(ell);
  let out = '';
  let w = 0;
  for (const ch of text) {
    const cw = (isWide(ch.codePointAt(0)) || ch.codePointAt(0) > 0xffff) ? 2 : 1;
    if (w + cw > budget - ellW) break;
    out += ch; w += cw;
  }
  return out.replace(/[\s，,。.;；、]+$/, '') + ell;
}

// First sentence of a takeaway, used as the one-line gloss under a title.
function firstSentence(s, zh) {
  if (!s) return '';
  const m = zh ? s.split(/(?<=[。！？])/)[0] : s.split(/(?<=[.!?])\s/)[0];
  return (m || s).trim();
}

// ---- edition loading ------------------------------------------------------
function pickEdition(arg) {
  if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) {
    return path.join(DAILY_DIR, `${arg}.json`);
  }
  const files = fs.readdirSync(DAILY_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  if (!files.length) throw new Error('no daily editions in ' + DAILY_DIR);
  return path.join(DAILY_DIR, files[files.length - 1]);
}

function topItems(edition, n) {
  const all = (edition.sections || []).flatMap(s => s.items || []);
  return all
    .slice()
    .sort((a, b) => (b.curatedScore || 0) - (a.curatedScore || 0))
    .slice(0, n);
}

// ---- thread builders ------------------------------------------------------
function buildHook(ed, zh) {
  const date = ed.date;
  const st = ed.stats || {};
  if (zh) {
    const head = `🏃 Cadence 步频 · 康复研究日报 ${date}`;
    const meta = `今日 ${st.events ?? '?'} 条更新，${st.specialties ?? '?'} 个专科。精选 ↓ 🧵`;
    // Title gets whatever room is left after the fixed lines.
    const fixed = xLen(head) + xLen('\n\n') + xLen('\n\n') + xLen(meta);
    const title = fitTo(ed.lead?.titleZh || '', MAX_WEIGHT - fixed);
    return `${head}\n\n${title}\n\n${meta}`;
  }
  const head = `🏃 Cadence · Daily Rehab Research Brief ${date}`;
  const meta = `${st.events ?? '?'} updates today across ${st.specialties ?? '?'} specialties. Top picks ↓ 🧵`;
  const fixed = xLen(head) + xLen('\n\n') + xLen('\n\n') + xLen(meta);
  const title = fitTo(ed.lead?.titleEn || '', MAX_WEIGHT - fixed);
  return `${head}\n\n${title}\n\n${meta}`;
}

function buildItemTweet(item, i, total, zh) {
  const c = catOf(item.category);
  const num = `${i}/${total}`;
  const title = zh ? (item.titleZh || item.title) : item.title;
  const gloss = firstSentence(zh ? (item.curatedReason || item.summaryZh)
                                 : (item.curatedReasonEn || item.summary), zh);
  const header = `${num} ${c.e} ${zh ? c.zh : c.en}`;
  // Keep the full title; trim only the gloss to fit.
  const fixedNoGloss = xLen(header) + xLen('\n') + xLen(title) + xLen('\n');
  let glossBudget = MAX_WEIGHT - fixedNoGloss;
  let tweet;
  if (glossBudget < 12) {
    // Title itself is huge — trim title, drop gloss.
    const t = fitTo(title, MAX_WEIGHT - xLen(header) - xLen('\n'));
    tweet = `${header}\n${t}`;
  } else {
    const g = fitTo(gloss, glossBudget);
    tweet = `${header}\n${title}\n${g}`;
  }
  return tweet;
}

function buildCTA(ed, zh) {
  const url = `${SITE_URL}/#daily/${ed.date}`;
  const handle = X_HANDLE ? (zh ? `\n关注 ${X_HANDLE}，每日循证康复研究不错过。`
                               : `\nFollow ${X_HANDLE} for daily evidence-based rehab research.`)
                          : '';
  if (zh) {
    return `完整日报 + 全部文献链接：\n${url}${handle}`;
  }
  return `Full edition + all source links:\n${url}${handle}`;
}

// Optional first-reply appendix: journal + link per item (links live here).
function buildSources(items, zh) {
  const lines = items.map((it, idx) => {
    const j = it.journal || it.source || '';
    return `${idx + 1}. ${j ? j + ' · ' : ''}${it.sourceUrl}`;
  });
  const head = zh ? '文献来源：' : 'Sources:';
  return `${head}\n${lines.join('\n')}`;
}

function buildThread(ed, lang) {
  const zh = lang === 'zh';
  const items = topItems(ed, ITEM_COUNT);
  const tweets = [];
  tweets.push(buildHook(ed, zh));
  items.forEach((it, idx) => tweets.push(buildItemTweet(it, idx + 1, items.length, zh)));
  tweets.push(buildCTA(ed, zh));
  return {
    lang,
    date: ed.date,
    tweets: tweets.map((text, i) => ({ n: i + 1, text, weight: xLen(text) })),
    sources: buildSources(items, zh),
  };
}

// Human-readable .txt: numbered tweets, char counts, copy-paste delimiters.
function renderTxt(thread) {
  const sep = '\n\n' + '─'.repeat(28) + '\n\n';
  const body = thread.tweets.map(t => {
    const flag = t.weight > MAX_WEIGHT ? `  ⚠️ OVER (${t.weight}/${MAX_WEIGHT})`
                                       : `  [${t.weight}/${MAX_WEIGHT}]`;
    return `▌Tweet ${t.n}${flag}\n${t.text}`;
  }).join(sep);
  const appendix = `\n\n${'═'.repeat(28)}\n（可选）首条回复 · 文献来源\n${'═'.repeat(28)}\n\n${thread.sources}\n`;
  return `# Cadence X thread — ${thread.date} — ${thread.lang.toUpperCase()}\n# ${thread.tweets.length} tweets. 复制每段到 X，逐条「+」成 thread；最后由 Cindy 点 Post。\n\n${body}${appendix}`;
}

// ---- main -----------------------------------------------------------------
function main() {
  const editionPath = pickEdition(process.argv[2]);
  const ed = JSON.parse(fs.readFileSync(editionPath, 'utf8'));
  const outDir = path.join(OUT_ROOT, ed.date);

  const results = ['zh', 'en'].map(lang => buildThread(ed, lang));

  // Hard check: no tweet may exceed the X limit.
  const over = results.flatMap(r => r.tweets.filter(t => t.weight > MAX_WEIGHT)
                                            .map(t => `${r.lang} tweet ${t.n} = ${t.weight}`));
  if (over.length) {
    console.error('✗ tweets over 280 weighted chars:\n  ' + over.join('\n  '));
    process.exitCode = 1;
  }

  if (DRY_RUN) {
    for (const r of results) {
      console.log('\n' + '='.repeat(40) + ` ${r.lang.toUpperCase()} ` + '='.repeat(40));
      console.log(renderTxt(r));
    }
    console.log(`\n(DRY_RUN — nothing written) edition: ${path.basename(editionPath)}`);
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  for (const r of results) {
    fs.writeFileSync(path.join(outDir, `thread.${r.lang}.txt`), renderTxt(r));
  }
  fs.writeFileSync(path.join(outDir, 'thread.json'), JSON.stringify(results, null, 2));
  console.log(`✓ wrote ${results.length} threads → x/${ed.date}/ (zh+en .txt + thread.json)`);
  if (!over.length) console.log('✓ all tweets within 280 weighted chars');
}

main();
