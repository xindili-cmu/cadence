/*
 * Cadence Evidence — draft the daily poster's AUTHORED copy (claim + context)
 * and write linkedin/<date>/poster.day.json for linkedin-poster.js.
 *
 * Why an LLM step: the poster handoff (design_handoff_daily_poster, 2026-09-22)
 * makes `claim` the single most important field and bans raw article titles in
 * it — "a raw title is jargon-first and makes the poster a content dump". The
 * edition JSON has no such field, so it has to be written. Cindy's decision
 * (2026-09-22): the cron DRAFTS, she REVIEWS before publishing. Nothing here
 * publishes; the draft is committed with the rest of linkedin/<date>/ and the
 * morning task shows it to her.
 *
 * Papers: the SAME five as the post text (topItems from linkedin-brief.js —
 * evidence lane, per-journal cap), in the same order; #1 is the lead.
 *
 * Non-negotiables, enforced in code (not just asked of the model):
 *   - no number may appear in claim/context unless it appears in that paper's
 *     own title/summary/reason text (handoff rule 1: never fabricate study data)
 *   - study-design words (RCT, cohort, meta-analysis, …) only if the source says so
 *   - claim may not be (near-)copy of the raw title
 *   - lengths, middot ban, font glyph coverage — shared with the renderer
 *     (validateDay in linkedin-poster.js), so draft and render can't disagree
 *   - journal resolved via journal-short.js (≤34, never truncated); unresolvable → fail
 * One retry with the violations fed back; still bad → fail loudly and write
 * linkedin/<date>/POSTER-FAILED.txt so the morning task sees it (a non-blocking
 * CI step must not mean a silent one).
 *
 * Review state lives in linkedin/<date>/poster.review.json (the day.json itself
 * must stay schema-exact): status "draft" | "approved". An approved day is never
 * overwritten by a re-run (manual dispatch) unless FORCE=1.
 *
 * Usage:
 *   node scripts/linkedin-poster-claims.js [YYYY-MM-DD]
 * Needs the same LLM env as the other cron LLM steps (LLM_PROVIDER + key).
 * Cannot run in the Cowork sandbox (no route to the LLM APIs).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DAILY_DIR = path.join(ROOT, 'briefs', 'daily');
const N_PAPERS = 5;

const { topItems } = require('./linkedin-brief');
const { shortJournal } = require('./journal-short');
const { loadTaxonomy, validateDay } = require('./linkedin-poster');

const JOURNAL_AGGREGATORS = new Set(['pubmed', 'exa', 'google scholar']);

const DESIGN_TERMS = [
  [/\brandomi[sz]ed\b|\bRCTs?\b|\bcontrolled trial/i, /randomi[sz]ed|\bRCT|controlled trial/i],
  [/\bmeta-?analys[ie]s\b/i, /meta-?analys/i],
  [/\bsystematic review/i, /systematic review/i],
  [/\bscoping review/i, /scoping review/i],
  [/\bumbrella review/i, /umbrella review/i],
  [/\bcohort\b/i, /cohort/i],
  [/\bcross-?sectional\b/i, /cross-?sectional/i],
  [/\bcase (report|series)\b/i, /case (report|series)/i],
  [/\bcase-?control\b/i, /case-?control/i],
  [/\bqualitative\b/i, /qualitative/i],
  [/\bmixed-?methods?\b/i, /mixed-?method/i],
  [/\bpilot\b/i, /pilot/i],
  [/\bfeasibility\b/i, /feasib/i],
  [/\bdelphi\b/i, /delphi/i],
  [/\bprotocol\b/i, /protocol/i],
  [/\bcrossover\b/i, /cross-?over/i],
];

const decode = (s) => String(s == null ? '' : s)
  .replace(/&#x([0-9a-fA-F]+);/g, (_, x) => String.fromCodePoint(parseInt(x, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

const sourceText = (it) => decode([it.title, it.summary, it.curatedReasonEn, it.limitationEn].filter(Boolean).join(' '));
const words = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 2));

/** Content rules the renderer can't know about (it never sees the source). */
function checkAgainstSource(copy, it) {
  const errs = [];
  const src = sourceText(it);
  const srcNums = new Set((src.match(/\d+(?:\.\d+)?/g) || []));
  for (const k of ['claim', 'context']) {
    const v = copy[k] || '';
    for (const n of v.match(/\d+(?:\.\d+)?/g) || []) {
      if (!srcNums.has(n)) errs.push(`${k} contains the number "${n}", which is not in the source text — never add numbers`);
    }
    for (const [inCopy, inSrc] of DESIGN_TERMS) {
      const m = v.match(inCopy);
      if (m && !inSrc.test(src)) errs.push(`${k} says "${m[0]}" but the source never states that study design`);
    }
  }
  // containment, not Jaccard: a claim that is a title PREFIX has low Jaccard
  // (the title is longer) but is still a scraped title.
  const tw = words(decode(it.title)), cw = words(copy.claim || '');
  const share = cw.size ? [...cw].filter((w) => tw.has(w)).length / cw.size : 0;
  if (cw.size >= 4 && share >= 0.75) errs.push(`claim reuses the raw title (${Math.round(share * 100)}% of its words come from it) — rewrite it as a plain-language clinical claim`);
  // Is this copy about THIS paper at all? (2026-11-18: paper 1 shipped with paper
  // 2's claim — every other rule passed.) Backtest over 35 editions: genuine copy
  // scores >= 0.53, copy paired with the wrong paper <= 0.54 only for same-topic
  // neighbours and 0.00-0.08 for the two real mix-ups; 0.35 separates them.
  const rel = relevance(copy, it);
  if (rel != null && rel < MIN_RELEVANCE) errs.push(`claim/context do not match this paper's title or summary (only ${Math.round(rel * 100)}% of their key words appear there) — you may have written another paper's copy here; rewrite it from THIS paper's text`);
  return errs;
}

const MIN_RELEVANCE = 0.35;
const STOP = new Set('this that with from were was are have has had study studies patients patient may can could should would into than then them they their there these those what when which while who why how for the and but not out about after before between during more most less also only over under such very been being does did its use used using among across within without looked explored examined found shows show showed help helps improve improves improved consider matters adults people care'.split(' '));
const stems = (s) => new Set(decode(s).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter((w) => w.length > 3 && !STOP.has(w)).map((w) => w.slice(0, 5)));
/** Share of the copy's key words that occur in the paper's own source text (null = too short to judge). */
function relevance(copy, it) {
  const c = stems(`${copy.claim || ''} ${copy.context || ''}`);
  if (c.size < 3) return null;
  const s = stems(sourceText(it));
  return [...c].filter((w) => s.has(w)).length / c.size;
}

/**
 * Map the model's reply onto the papers STRICTLY by its "i" number. Never fall
 * back to array position: when a reply omits paper 1, position 0 holds paper 2's
 * copy and the lead silently gets another paper's claim (2026-09-25, 2026-11-18).
 */
function alignCopies(got, n) {
  const errs = [];
  const fresh = Array.from({ length: n }, (_, k) => {
    const hits = (Array.isArray(got) ? got : []).filter((p) => p && Number(p.i) === k + 1);
    if (hits.length === 1) return hits[0];
    errs.push(`paper ${k + 1} ${hits.length ? `was returned ${hits.length} times` : 'is missing from your reply'} — return every paper exactly once with its own "i" number`);
    return {};
  });
  return { fresh, errs };
}

/** No two papers may carry the same claim or context. */
function duplicateErrors(copies) {
  const errs = [];
  const norm = (s) => decode(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  for (const k of ['claim', 'context']) {
    for (let a = 0; a < copies.length; a++) for (let b = a + 1; b < copies.length; b++) {
      const x = norm((copies[a] || {})[k]), y = norm((copies[b] || {})[k]);
      if (x && x === y) {
        errs.push(`paper ${a + 1} ${k} is identical to paper ${b + 1}'s — each paper needs its own ${k}, written from its own text`);
        errs.push(`paper ${b + 1} ${k} is identical to paper ${a + 1}'s — each paper needs its own ${k}, written from its own text`);
      }
    }
  }
  return errs;
}

function resolveJournal(it) {
  const raw = decode(it.journal || '');
  if (!raw) {
    const src = decode(it.source || '');
    if (!src || JOURNAL_AGGREGATORS.has(src.toLowerCase())) throw new Error(`no journal for "${decode(it.title).slice(0, 70)}" (source "${src}") — can't print an aggregator as the venue`);
    return src;                       // preprint servers etc. (medRxiv) — the real venue
  }
  const r = shortJournal(raw);
  if (!r.ok) throw new Error(`journal "${raw}" (${raw.length} chars) has no ≤34 short name — add it to sources.json or journals.json aliases (see journal-short.js); never truncate`);
  return r.short;
}

const SYSTEM = `You write the copy for a daily LinkedIn poster that summarises physical-therapy / rehabilitation research for practising clinicians.
For each paper you get its raw title, summary and curator note. Write:
- "claim": ONE sentence (paper 1: AT MOST 80 characters; papers 2-5: AT MOST 90 characters; spaces count, hard limit, count them, shorter is better) a clinician can act on or would stop scrolling for. Plain language, lead with the clinical point, not the jargon. It must NOT restate the title. It may be a question if the paper asks one and does not answer it.
- "context": ONE sentence (max 200 characters), italic "why this matters": what the study actually looked at.
HARD RULES:
1. Use ONLY facts stated in the provided text. Never add numbers, sample sizes, effect sizes, percentages, durations or study designs that are not written there. When unsure, leave the detail out.
2. Name a study design (RCT, cohort, systematic review, …) only if the text states it.
3. Do not overstate: a feasibility or observational study does not "prove" or "show that X works".
4. Never use the middot character "·". Plain ASCII punctuation plus the em dash "—" and curly apostrophe are fine; no arrows, no ≥/≤, no emoji.
5. Sentence case. No hashtags. No trailing ellipsis.
Return JSON only: {"papers":[{"i":1,"claim":"...","context":"..."}, ...]} with one entry per paper, same order.`;

function userPrompt(items, feedback) {
  const blocks = items.map((it, k) => [
    `PAPER ${k + 1}`,
    `title: ${decode(it.title)}`,
    `summary: ${decode(it.summary)}`,
    it.curatedReasonEn ? `curator note: ${decode(it.curatedReasonEn)}` : '',
    it.limitationEn ? `limitation: ${decode(it.limitationEn)}` : '',
  ].filter(Boolean).join('\n'));
  let s = blocks.join('\n\n');
  if (feedback) s += `\n\nYOUR PREVIOUS DRAFT BROKE THESE RULES — fix every one and return all ${items.length} papers again:\n${feedback}`;
  return s;
}

function parseJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('model returned no JSON object');
  const o = JSON.parse(t.slice(a, b + 1));
  if (!Array.isArray(o.papers)) throw new Error('model JSON has no "papers" array');
  return o.papers;
}

function buildDay(date, items, copies) {
  const paper = (it, c) => {
    const p = {
      categoryId: it.category,
      claim: decode(c.claim),
      context: decode(c.context),
      journal: resolveJournal(it),
    };
    if (it.tech === true) p.tech = true;
    if (Number.isInteger(it.curatedScore)) p.signal = it.curatedScore;
    if (it.sourceUrl) p.url = it.sourceUrl;
    return p;
  };
  return { date, lead: paper(items[0], copies[0]), supporting: items.slice(1).map((it, k) => paper(it, copies[k + 1])) };
}

function allErrors(day, items, copies, TAX) {
  const errs = validateDay(day, TAX).map((e) => e.replace(/^lead\./, 'paper 1 ').replace(/^supporting\[(\d)\]\./, (_, d) => `paper ${+d + 2} `));
  items.forEach((it, k) => { for (const e of checkAgainstSource(copies[k] || {}, it)) errs.push(`paper ${k + 1} ${e}`); });
  errs.push(...duplicateErrors(copies));
  return errs;
}

function pickEdition(arg) {
  if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) return path.join(DAILY_DIR, `${arg}.json`);
  const files = fs.readdirSync(DAILY_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (!files.length) throw new Error('no daily editions in ' + DAILY_DIR);
  return path.join(DAILY_DIR, files[files.length - 1]);
}

async function main() {
  const ed = JSON.parse(fs.readFileSync(pickEdition(process.argv[2]), 'utf8'));
  const outDir = path.join(ROOT, 'linkedin', ed.date);
  const reviewFile = path.join(outDir, 'poster.review.json');
  const failFile = path.join(outDir, 'POSTER-FAILED.txt');
  fs.mkdirSync(outDir, { recursive: true });

  if (fs.existsSync(reviewFile) && process.env.FORCE !== '1') {
    const r = JSON.parse(fs.readFileSync(reviewFile, 'utf8'));
    if (r.status === 'approved') { console.log(`• ${ed.date}: poster copy already approved — not redrafting (FORCE=1 to override)`); return; }
  }

  try {
    const items = topItems(ed, N_PAPERS);
    if (!items.length) throw new Error('edition has no evidence items');
    const TAX = loadTaxonomy();
    for (const it of items) if (!TAX[it.category]) throw new Error(`category "${it.category}" is not one of the 8 specialties ("${decode(it.title).slice(0, 60)}")`);
    for (const it of items) resolveJournal(it);          // fail before spending LLM budget

    const { callLLM, LLM_PROVIDER } = require('./news-refresh.js');
    let feedback = '', copies = null, day = null, errs = [], lastRaw = '';
    const MAX_ATTEMPTS = 4;
    const locked = items.map(() => null);
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const raw = await callLLM(SYSTEM, userPrompt(items, feedback), { json: true, jsonObject: true });
      // A reply with no usable JSON is a failed ATTEMPT, not a fatal error:
      // retry with a format reminder; only the last attempt's failure is fatal.
      let got;
      try {
        if (!raw) throw new Error(`LLM (${LLM_PROVIDER}) returned nothing`);
        got = parseJson(raw);
      } catch (pe) {
        lastRaw = String(raw || '');
        errs = [`${pe.message}`];
        console.warn(`  attempt ${attempt}: unusable reply (${pe.message}); first 300 chars: ${JSON.stringify(lastRaw.slice(0, 300))}`);
        if (attempt === MAX_ATTEMPTS) throw new Error(`${pe.message} on all ${MAX_ATTEMPTS} attempts; last reply began: ${JSON.stringify(lastRaw.slice(0, 300))}`);
        feedback = `Your previous reply was not valid JSON (${pe.message}). Return ONLY the JSON object {"papers":[...]} with all ${items.length} papers, no prose.`;
        continue;
      }
      const aligned = alignCopies(got, items.length);
      const fresh = aligned.fresh;
      copies = items.map((_, k) => locked[k] || fresh[k]);
      day = buildDay(ed.date, items, copies);
      // an alignment error only matters for a paper that still needs copy
      errs = [...aligned.errs.filter((e) => !locked[+e.match(/^paper (\d+) /)[1] - 1]), ...allErrors(day, items, copies, TAX)];
      items.forEach((_, k) => { if (!locked[k] && !errs.some((e) => e.startsWith(`paper ${k + 1} `))) locked[k] = copies[k]; });
      if (!errs.length) break;
      console.warn(`  attempt ${attempt}: ${errs.length} rule violation(s)\n    - ${errs.join('\n    - ')}`);
      feedback = errs.map((e) => `- ${e}`).join('\n') + '\nShorten every over-long claim well below its limit. Cut words, do not just trim a few letters.\nKeep each paper\'s original "i" number and return ALL papers.';
    }
    if (errs.length) throw new Error(`draft still breaks ${errs.length} rule(s) after retry:\n  - ${errs.join('\n  - ')}`);

    fs.writeFileSync(path.join(outDir, 'poster.day.json'), JSON.stringify(day, null, 2) + '\n');
    fs.writeFileSync(reviewFile, JSON.stringify({
      status: 'draft',
      draftedAt: new Date().toISOString(),
      provider: LLM_PROVIDER,
      note: 'Claims/context are LLM drafts. Review against the source titles below; edit poster.day.json if needed, re-render with `node scripts/linkedin-poster.js <date>`, then set status to "approved".',
      sources: items.map((it, k) => ({ slide: k + 1, title: decode(it.title), url: it.sourceUrl || null })),
    }, null, 2) + '\n');
    if (fs.existsSync(failFile)) fs.unlinkSync(failFile);
    console.log(`✓ linkedin/${ed.date}/poster.day.json — ${items.length} papers drafted (${LLM_PROVIDER}), status: draft`);
    day.lead && [day.lead, ...day.supporting].forEach((p, k) => console.log(`   ${k + 1}. ${p.claim}`));
  } catch (e) {
    fs.writeFileSync(failFile, `linkedin-poster-claims.js failed at ${new Date().toISOString()}\n\n${e.message}\n\nThe carousel for ${ed.date} was NOT drafted. Fix the cause, then run:\n  node scripts/linkedin-poster-claims.js ${ed.date} && node scripts/linkedin-poster.js ${ed.date}\n`);
    throw e;
  }
}

module.exports = { checkAgainstSource, resolveJournal, buildDay, parseJson, alignCopies, duplicateErrors, relevance };

if (require.main === module) main().catch((e) => { console.error('✗ linkedin-poster-claims:', e.message); process.exit(1); });
