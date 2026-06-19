/**
 * Cadence 步频 — 日报 → LinkedIn post generator.
 *
 * Turns one immutable daily edition (briefs/daily/YYYY-MM-DD.json) into a
 * ready-to-PASTE LinkedIn post (English-primary for the US market, plus a
 * Chinese version). No new content is written — it reuses the edition's
 * bilingual lead + scored items, so the post matches the site / 公众号 / XHS / X.
 *
 * Why paste-not-post: LinkedIn has no easy auto-post API for small accounts
 * (Community/Marketing API needs a Company Page + app review + OAuth). So this
 * script generates the text; you paste it (or queue it in Buffer/Taplio).
 *
 * Post shape (how research/clinician accounts post on LinkedIn):
 *   - Hook line (the part shown before "...see more") = brand + date + lead.
 *   - Short lead paragraph.
 *   - Top N items, each: title + one-line clinical takeaway + journal.
 *     LINK-FREE in the body (LinkedIn suppresses reach on posts full of
 *     external links) — all links go in the FIRST COMMENT block.
 *   - CTA: one site link + a few targeted hashtags.
 *   + sources.txt = paste as the FIRST COMMENT for inline citations.
 *
 * Usage:
 *   node scripts/linkedin-brief.js                 # latest edition, en + zh
 *   node scripts/linkedin-brief.js 2026-06-14      # a specific edition
 *   N=5 node scripts/linkedin-brief.js             # item count (default 5)
 *   DRY_RUN=true node scripts/linkedin-brief.js    # print, write nothing
 *
 * Env:
 *   SITE_URL   default https://incadencept.com
 *   N          item count (default 5)
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.env.DRY_RUN === 'true';
const SITE_URL = (process.env.SITE_URL || 'https://incadencept.com').replace(/\/$/, '');
const ITEM_COUNT = Math.max(1, parseInt(process.env.N || '5', 10));

const DAILY_DIR = path.join(__dirname, '..', 'briefs', 'daily');
const OUT_ROOT = path.join(__dirname, '..', 'linkedin');

// Category → 中文名 / English label (mirrors x-thread.js / daily-brief.js).
const CAT = {
  orthopedic:       { zh: '骨科与肌骨', en: 'Orthopedic' },
  neurological:     { zh: '神经康复',   en: 'Neuro' },
  sports:           { zh: '运动康复',   en: 'Sports' },
  pediatric:        { zh: '儿童康复',   en: 'Pediatric' },
  geriatric:        { zh: '老年康复',   en: 'Geriatric' },
  cardiopulmonary:  { zh: '心肺康复',   en: 'Cardiopulmonary' },
  'manual-modality':{ zh: '手法与理疗', en: 'Manual & Modality' },
  practice:         { zh: '行业与执业', en: 'Practice' },
};
const catOf = (c) => CAT[c] || { zh: '研究', en: 'Research' };

const HASHTAGS_EN = '#PhysicalTherapy #Physiotherapy #Rehabilitation #SportsMedicine #EvidenceBasedPractice';
const HASHTAGS_ZH = '#物理治疗 #康复医学 #循证医学 #运动康复 #PhysicalTherapy';

function firstSentence(s, zh) {
  if (!s) return '';
  const m = zh ? s.split(/(?<=[。！？])/)[0] : s.split(/(?<=[.!?])\s/)[0];
  return (m || s).trim();
}

function pickEdition(arg) {
  if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) return path.join(DAILY_DIR, `${arg}.json`);
  const files = fs.readdirSync(DAILY_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (!files.length) throw new Error('no daily editions in ' + DAILY_DIR);
  return path.join(DAILY_DIR, files[files.length - 1]);
}

function topItems(ed, n) {
  return (ed.sections || []).flatMap(s => s.items || [])
    .slice().sort((a, b) => (b.curatedScore || 0) - (a.curatedScore || 0)).slice(0, n);
}

function buildPost(ed, items, zh) {
  const st = ed.stats || {};
  const date = ed.date;
  const lines = [];

  if (zh) {
    lines.push(`Cadence 步频 · 物理治疗与康复 · 每日循证 ${date}`);
    lines.push('');
    lines.push(ed.lead?.titleZh || '');
    lines.push('');
    lines.push(`今日 ${st.events ?? '?'} 条更新，覆盖 ${st.specialties ?? '?'} 个专科。精选 ${items.length} 条 👇`);
  } else {
    lines.push(`Cadence · Physical therapy & rehab · Daily evidence — ${date}`);
    lines.push('');
    lines.push(ed.lead?.titleEn || '');
    lines.push('');
    lines.push(`${st.events ?? '?'} updates today across ${st.specialties ?? '?'} specialties. ${items.length} worth your time 👇`);
  }
  lines.push('');

  items.forEach((it, i) => {
    const c = catOf(it.category);
    const title = zh ? (it.titleZh || it.title) : it.title;
    const gloss = firstSentence(zh ? (it.curatedReason || it.summaryZh) : (it.curatedReasonEn || it.summary), zh);
    const tag = zh ? c.zh : c.en;
    const jrnl = it.journal ? `${zh ? '—' : '—'} ${it.journal}` : '';
    lines.push(`${i + 1}. [${tag}] ${title}`);
    if (gloss) lines.push(gloss);
    if (jrnl) lines.push(jrnl.trim());
    lines.push('');
  });

  if (zh) {
    lines.push(`完整简报(含每条来源与评分):${SITE_URL}`);
    lines.push('');
    lines.push(HASHTAGS_ZH);
  } else {
    lines.push(`Full brief, every source scored: ${SITE_URL}`);
    lines.push('');
    lines.push(HASHTAGS_EN);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// Sources appendix — paste as the FIRST COMMENT (keeps links out of the post body).
function buildSources(items, zh) {
  const head = zh ? '来源(按精选顺序):' : 'Sources (in order):';
  const body = items.map((it, i) => {
    const title = zh ? (it.titleZh || it.title) : it.title;
    return `${i + 1}. ${title}\n${it.sourceUrl || ''}`;
  }).join('\n\n');
  return `${head}\n\n${body}\n`;
}

function main() {
  const file = pickEdition(process.argv[2]);
  const ed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const items = topItems(ed, ITEM_COUNT);
  if (!items.length) throw new Error('edition has no items: ' + file);

  const outputs = {
    'post-en.txt':    buildPost(ed, items, false),
    'post-zh.txt':    buildPost(ed, items, true),
    'sources-en.txt': buildSources(items, false),
    'sources-zh.txt': buildSources(items, true),
  };

  if (DRY_RUN) {
    console.log('===== LinkedIn post (EN) =====\n');
    console.log(outputs['post-en.txt']);
    console.log('===== First comment — sources (EN) =====\n');
    console.log(outputs['sources-en.txt']);
    return;
  }

  const dir = path.join(OUT_ROOT, ed.date);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(outputs)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  console.log(`✓ LinkedIn post written to linkedin/${ed.date}/ (post-en/zh.txt + sources-en/zh.txt)`);
  console.log(`  paste post-en.txt as the post, sources-en.txt as the first comment.`);
}

main();
