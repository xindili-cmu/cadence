#!/usr/bin/env node
/**
 * Backfill tags[0] content-type on items where it's missing/wrong.
 *
 * The front filter axis (Research / News / Guidelines / Policy tabs) reads
 * tags[0] and only recognises the four canonical values:
 *
 *   research  — journal article / systematic review / RCT / preprint
 *   news      — industry news / product / company move / platform post
 *   guideline — clinical practice guideline (association)
 *   policy    — regulation / reimbursement / scope-of-practice (regulator)
 *
 * Items whose tags[0] is anything else (a specialty word like "spine", or a
 * studyDesign label like "述评") are INVISIBLE to all four tabs — they only show
 * under "All". This script re-derives the correct content type and moves it to
 * the front of the tags array.
 *
 * Decision order (first match wins), all auditable, no LLM:
 *   1. A canonical type already exists elsewhere in tags  → use it (just reorder)
 *   2. Source host matches the journal/news/assoc/regulator maps → that type
 *   3. studyDesign present (or tags[0] is a studyDesign label) → research
 *   4. else → "uncertain": left UNCHANGED, reported for manual/LLM review
 *
 * Idempotent: items already led by a canonical type are skipped.
 * Touches news.json and every archive/*.json.
 *
 * Usage:
 *   DRY_RUN=true node scripts/backfill-content-type.js   — print only, no writes
 *   node scripts/backfill-content-type.js                — apply + write files
 */

const fs   = require('fs');
const path = require('path');

const DRY_RUN = process.env.DRY_RUN === 'true';
const ROOT    = path.join(__dirname, '..');

const CTYPES = new Set(['research', 'news', 'guideline', 'policy']);

// studyDesign labels that sometimes leak into tags[0] (see backfill-study-design.js).
// They describe a research design, so the content type is always research.
const STUDY_DESIGN_LABELS = new Set(['RCT', '系统综述', '观察研究', '综述', '述评']);

// Host → content type. Substring match on the URL hostname (www. stripped).
// Journals / preprint servers / databases → research.
const RESEARCH_HOSTS = [
  'pubmed.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov', 'nature.com', 'link.springer.com',
  'springer.com', 'sciencedirect.com', 'frontiersin.org', 'thelancet.com',
  'researchprotocols.org', 'jmir.org', 'cjter.com', 'jhwcr.com', 'apcz.umk.pl',
  'mdpi.com', 'wiley.com', 'onlinelibrary.wiley.com', 'tandfonline.com', 'bmj.com',
  'jamanetwork.com', 'sagepub.com', 'biomedcentral.com', 'cochranelibrary.com',
  'medrxiv.org', 'biorxiv.org', 'doi.org', 'physoc.onlinelibrary.wiley.com',
];
// News outlets / aggregator platforms / blogs → news.
const NEWS_HOSTS = [
  'statnews.com', 'reuters.com', 'modernhealthcare.com', 'webpt.com',
  'cn-healthcare.com', 'dxy.cn', 'physio-pedia.com', 'medicaldialogues.in',
  'spinalsurgerynews.com', 'doctorally.tw', 'blogspot.com', 'medscape.com',
  // AJMC's /view/ section is secondary reporting, not primary research
  // (the item's own curatedReason flags it as 回顾性报道, 不是原始研究).
  'ajmc.com',
];
// Professional associations → guideline; regulators → policy.
const GUIDELINE_HOSTS = ['apta.org', 'australian.physio', 'physiotherapy.ca', 'csp.org.uk'];
const POLICY_HOSTS    = ['cms.gov', 'ahpra.gov.au', 'nhc.gov.cn', 'fda.gov', 'who.int'];

function hostOf(item) {
  try { return new URL(item.sourceUrl).hostname.replace(/^www\./, ''); }
  catch { return (item.source || '').toLowerCase(); }
}
function hostHits(host, list) { return list.some((h) => host.includes(h)); }

// Returns { type, reason } or { type: null, reason } when undecidable.
function classify(item) {
  const tags = item.tags || [];

  // 1. canonical type already somewhere in tags — just promote it.
  const existing = tags.find((t) => CTYPES.has(t));
  if (existing) return { type: existing, reason: `tags already contain "${existing}"` };

  // 2. host map.
  const host = hostOf(item);
  if (hostHits(host, RESEARCH_HOSTS))  return { type: 'research',  reason: `journal host ${host}` };
  if (hostHits(host, GUIDELINE_HOSTS)) return { type: 'guideline', reason: `association host ${host}` };
  if (hostHits(host, POLICY_HOSTS))    return { type: 'policy',    reason: `regulator host ${host}` };
  if (hostHits(host, NEWS_HOSTS))      return { type: 'news',      reason: `news host ${host}` };

  // 3. studyDesign signal → research.
  if (item.studyDesign || STUDY_DESIGN_LABELS.has(tags[0]))
    return { type: 'research', reason: `studyDesign "${item.studyDesign || tags[0]}"` };

  // 4. give up — needs LLM / human.
  return { type: null, reason: `no rule matched (host ${host})` };
}

// Move/insert `type` at tags[0], removing any later duplicate.
function applyType(tags, type) {
  const rest = tags.filter((t) => t !== type);
  return [type, ...rest];
}

function listDataFiles() {
  const files = [path.join(ROOT, 'news.json')];
  const archDir = path.join(ROOT, 'archive');
  if (fs.existsSync(archDir)) {
    for (const f of fs.readdirSync(archDir)) {
      if (/^\d{4}-\d{2}\.json$/.test(f)) files.push(path.join(archDir, f));
    }
  }
  return files;
}

const tally   = { research: 0, news: 0, guideline: 0, policy: 0, uncertain: 0 };
const changes = [];

for (const file of listDataFiles()) {
  const raw  = JSON.parse(fs.readFileSync(file, 'utf8'));
  const items = Array.isArray(raw) ? raw : (raw.items || []);
  let touched = 0;

  for (const it of items) {
    const tags = it.tags || [];
    if (CTYPES.has(tags[0])) continue;            // already correct — skip (idempotent)

    const { type, reason } = classify(it);
    if (!type) {
      tally.uncertain++;
      changes.push({ file: path.basename(file), id: it.id, from: tags[0], to: '— uncertain', reason });
      continue;
    }
    tally[type]++;
    changes.push({ file: path.basename(file), id: it.id, from: tags[0], to: type, reason });
    if (!DRY_RUN) { it.tags = applyType(tags, type); touched++; }
  }

  if (!DRY_RUN && touched) {
    fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n');
  }
}

// ── report ──────────────────────────────────────────────────────────────────
console.log(`\n${DRY_RUN ? 'DRY RUN — no files written' : 'WRITE MODE — files updated'}\n`);
const W = (s, n) => String(s).padEnd(n);
console.log(W('file', 18), W('tags[0] now', 14), '→', W('assigned', 11), 'reason');
console.log('─'.repeat(96));
for (const c of changes) {
  console.log(W(c.file, 18), W(c.from, 14), '→', W(c.to, 11), c.reason);
}
console.log('─'.repeat(96));
console.log(`total to fix: ${changes.length}`);
console.log(`  research ${tally.research}   news ${tally.news}   guideline ${tally.guideline}   policy ${tally.policy}   uncertain ${tally.uncertain}`);
console.log('\nNote: "uncertain" items are left UNCHANGED — they need a manual call or an LLM pass.');
