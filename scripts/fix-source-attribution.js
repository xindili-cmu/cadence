#!/usr/bin/env node
/**
 * fix-source-attribution.js — data repair (2026-07-26 review).
 *
 * Three deterministic fixes over news.json + archive/YYYY-MM.json:
 *
 * 1. SPRINGER MIS-ATTRIBUTION (the big one). matchSource() matched roster
 *    domains by hostname only, and all three Springer entries carried the bare
 *    domain `link.springer.com`, so EVERY springer/BMC article that Exa
 *    returned was labelled with the first matching roster entry — "Sports
 *    Medicine". 196 archived rows across ~87 distinct journals were affected
 *    and not one of them was actually published in Sports Medicine (no row
 *    carries the s40279 DOI prefix). sources.json now pins each Springer entry
 *    to its DOI path prefix; this script re-labels history to match.
 *
 *    The roster IS the whitelist: a springer row is kept only if its DOI prefix
 *    maps to a sources.json entry (its `source`/`journal` are then rewritten to
 *    that entry's real names). Everything else — Molecular Cancer, Acta
 *    Neuropathologica, J Nanobiotechnology and the rest of the BMC megaverse —
 *    is dropped, exactly as the fixed pipeline would now drop it off-roster.
 *    To rescue a journal, add it to sources.json and re-run: no code change.
 *
 * 2. TRUNCATED TITLES. Listing-page link text ("… functional capacity during
 *    ...") shipped as headlines and propagated verbatim into the AI briefing.
 *    Recovers the real headline from the article's og:title; rows that can't be
 *    recovered are dropped. A recovered row whose titleZh/summaryZh still
 *    carries the truncation has those fields deleted so backfill-i18n.js
 *    regenerates them (run it afterwards).
 *
 * 3. NON-ARTICLE JUNK. Job boards, journal landing pages, and scraped nav
 *    chrome ("… the the Participant Portal"). Uses the very same isJunkUrl /
 *    isJunkItem predicates the pipeline now applies at ingest, imported from
 *    news-refresh.js — one definition, so history and future runs agree.
 *
 * Rebuilds archive/index.json afterwards. Idempotent — safe to re-run.
 * Needs network for phase 2 (Crossref + og:title); no LLM.
 *
 *   node scripts/fix-source-attribution.js --report   # resolve + print, write nothing
 *   node scripts/fix-source-attribution.js            # apply
 *   DRY_RUN=true node scripts/fix-source-attribution.js
 *
 * --report is the one to run first: it lists every off-roster springer journal
 * by row count so you can decide which deserve a sources.json entry BEFORE the
 * rows get dropped.
 */

const fs = require('fs');
const path = require('path');
const { isJunkUrl, isJunkItem, isTruncatedTitle } = require('./news-refresh.js');

const DRY = process.env.DRY_RUN === 'true';
const REPORT_ONLY = process.argv.includes('--report');
const ROOT = path.join(__dirname, '..');
const ARCHIVE_DIR = path.join(ROOT, 'archive');
const NEWS_PATH = path.join(ROOT, 'news.json');
const CACHE_PATH = path.join(ROOT, '.cache-springer-journals.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'CadenceBot/1.0 (+https://incadencept.com; mailto:hello@incadencept.com)';

// ── Springer roster, derived from sources.json ──────────────────────────────
// Entries now look like `link.springer.com/article/10.1007/s40279`; key them by
// the DOI prefix so a row's DOI decides its identity.
const SOURCES = JSON.parse(fs.readFileSync(path.join(ROOT, 'sources.json'), 'utf8'));
const SPRINGER_ROSTER = new Map();
for (const s of SOURCES) {
  // domain + domains: BMC journals carry their springer DOI form as an alias
  // now (one roster entry per outlet — the same-name dual entries double-
  // rendered on the sources wall, merged 2026-08-11).
  for (const cand of [s.domain, ...(s.domains || [])]) {
    const m = (cand || '').match(/^link\.springer\.com\/article\/(10\.\d+\/[a-z]+\d+)$/i);
    if (m) SPRINGER_ROSTER.set(m[1].toLowerCase(), s);
  }
}
if (!SPRINGER_ROSTER.size) {
  console.error('❌ No DOI-pinned Springer entries in sources.json — did the domain fix get reverted?');
  process.exit(1);
}

const springerDoi = (url) => {
  const m = String(url || '').match(/link\.springer\.com\/article\/((10\.\d+)\/([a-z]+\d+)[^\s?#]*)/i);
  return m ? { doi: m[1], prefix: `${m[2]}/${m[3]}`.toLowerCase() } : null;
};

// ── Crossref journal resolution (reporting only; caching is by DOI prefix) ───
const cache = fs.existsSync(CACHE_PATH) ? JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) : {};
async function resolveJournal(prefix, sampleDoi) {
  if (cache[prefix]) return cache[prefix];
  try {
    const res = await fetch(`https://api.crossref.org/works/${encodeURI(sampleDoi)}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const name = (j.message?.['container-title'] || [])[0] || null;
    cache[prefix] = name;
  } catch (e) {
    console.log(`   ⚠️  ${prefix}: ${e.message}`);
    cache[prefix] = null;
  }
  await sleep(300); // Crossref politeness
  return cache[prefix];
}

// ── og:title recovery for truncated headlines ───────────────────────────────
const stripTags = (s) => String(s || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

async function fetchOgTitle(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
    || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const full = stripTags(m?.[1] || '');
  return full && !isTruncatedTitle(full) && full.length > 15 ? full : null;
}

async function recoverTitle(url) {
  // Most truncated rows point at BMJ back-catalogue PDFs
  // (bjsm.bmj.com/content/bjsports/59/6/423.full.pdf), which carry no og:title.
  // The HTML article page — same URL minus `.full.pdf` — does.
  const candidates = [url];
  if (/\.full\.pdf$/i.test(url)) candidates.unshift(url.replace(/\.full\.pdf$/i, ''));
  for (const c of candidates) {
    try {
      const full = await fetchOgTitle(c);
      if (full) return full;
    } catch (e) {
      console.log(`   ⚠️  ${e.message} — ${c}`);
    }
    await sleep(300);
  }
  return null;
}

// ── Load every file, then walk rows once ────────────────────────────────────
const months = fs.readdirSync(ARCHIVE_DIR).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort();
const files = [{ label: 'news.json', p: NEWS_PATH }, ...months.map((f) => ({ label: f, p: path.join(ARCHIVE_DIR, f) }))];
const loaded = files.map((f) => ({ ...f, data: JSON.parse(fs.readFileSync(f.p, 'utf8')) }));
const allRows = loaded.flatMap((f) => (f.data.items || []).map((it) => ({ it, file: f.label })));

const stats = { relabelled: 0, springerDropped: 0, junkDropped: 0, titlesRecovered: 0, titlesDropped: 0, zhCleared: 0, relatedRelabelled: 0, relatedDropped: 0 };
const offRoster = new Map(); // prefix → { n, sampleDoi, sampleTitle }

(async () => {
  // ── Phase 1: springer attribution ─────────────────────────────────────────
  for (const { it } of allRows) {
    const s = springerDoi(it.sourceUrl);
    if (!s) continue;
    const entry = SPRINGER_ROSTER.get(s.prefix);
    if (entry) {
      if (it.source !== entry.name || it.journal !== entry.journalName) {
        it.source = entry.name;
        it.journal = entry.journalName;
        stats.relabelled++;
      }
    } else {
      const rec = offRoster.get(s.prefix) || { n: 0, sampleDoi: s.doi, sampleTitle: it.title };
      rec.n++;
      offRoster.set(s.prefix, rec);
      it.__drop = 'springer-off-roster';
    }
  }

  // Related-coverage rows carry their own source label and render in the card,
  // so they inherit the same mislabelling. Relabel on-roster ones, drop the rest.
  for (const { it } of allRows) {
    if (!it.related?.length) continue;
    const kept = [];
    for (const r of it.related) {
      const s = springerDoi(r.sourceUrl);
      if (!s) { kept.push(r); continue; }
      const entry = SPRINGER_ROSTER.get(s.prefix);
      if (!entry) { stats.relatedDropped++; continue; }
      if (r.source !== entry.name) { r.source = entry.name; stats.relatedRelabelled++; }
      kept.push(r);
    }
    if (kept.length !== it.related.length) it.related = kept;
  }

  if (offRoster.size) {
    console.log(`\n🔎 Resolving ${offRoster.size} off-roster Springer journals via Crossref…`);
    for (const [prefix, rec] of offRoster) rec.journal = await resolveJournal(prefix, rec.sampleDoi);
    if (!DRY) fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
    console.log('\n   Off-roster Springer journals (these rows will be DROPPED):');
    console.log('   rows  DOI prefix        journal');
    for (const [prefix, rec] of [...offRoster].sort((a, b) => b[1].n - a[1].n)) {
      console.log(`   ${String(rec.n).padStart(4)}  ${prefix.padEnd(17)} ${rec.journal || '(unresolved)'}`);
    }
    console.log('\n   To keep any of these, add a sources.json entry with');
    console.log('   "domain": "link.springer.com/article/<prefix>" and re-run.');
  }

  // ── Phase 2: truncated titles ─────────────────────────────────────────────
  const truncated = allRows.filter(({ it }) => !it.__drop && isTruncatedTitle(it.title));
  if (truncated.length) {
    console.log(`\n✂️  ${truncated.length} truncated titles — recovering og:title…`);
    for (const { it, file } of truncated) {
      if (REPORT_ONLY) {
        console.log(`   · [${file}] ${String(it.title).slice(0, 60)}`);
        it.__skipJunk = true;   // --report never touches the network for titles
        continue;
      }
      const full = await recoverTitle(it.sourceUrl);
      if (full) {
        console.log(`   ✓ [${file}] ${String(it.title).slice(0, 45)} → ${full.slice(0, 55)}`);
        it.title = full;
        stats.titlesRecovered++;
        // Chinese fields were translated from the fragment — drop them so
        // backfill-i18n.js regenerates against the real headline.
        if (isTruncatedTitle(it.titleZh) || isTruncatedTitle(it.summaryZh)) {
          delete it.titleZh; delete it.summaryZh;
          stats.zhCleared++;
        }
      } else {
        console.log(`   ✗ [${file}] unrecovered → drop: ${String(it.title).slice(0, 55)}`);
        it.__drop = 'truncated-title';
        stats.titlesDropped++;
      }
      await sleep(400);
    }
  }

  // ── Phase 3: non-article junk (same predicates as the live pipeline) ──────
  for (const { it, file } of allRows) {
    if (it.__drop || it.__skipJunk) continue;
    if (isJunkUrl(it.sourceUrl) || isJunkItem(it)) {
      console.log(`   ⏭️  junk [${file}] ${(it.title || '').slice(0, 60)}`);
      it.__drop = 'junk';
    }
  }

  // ── Tally + write ─────────────────────────────────────────────────────────
  for (const { it } of allRows) {
    if (it.__drop === 'springer-off-roster') stats.springerDropped++;
    else if (it.__drop === 'junk') stats.junkDropped++;
  }

  console.log('\n── Summary ──');
  console.log(`  springer rows re-labelled : ${stats.relabelled}`);
  console.log(`  springer rows dropped     : ${stats.springerDropped}`);
  console.log(`  related rows re-labelled  : ${stats.relatedRelabelled}`);
  console.log(`  related rows dropped      : ${stats.relatedDropped}`);
  if (REPORT_ONLY) console.log(`  truncated titles pending  : ${truncated.length} (recovery not attempted in --report)`);
  console.log(`  truncated titles recovered: ${stats.titlesRecovered}`);
  console.log(`  truncated titles dropped  : ${stats.titlesDropped}`);
  console.log(`  zh fields cleared         : ${stats.zhCleared}  ${stats.zhCleared ? '→ run scripts/backfill-i18n.js' : ''}`);
  console.log(`  junk rows dropped         : ${stats.junkDropped}`);

  if (REPORT_ONLY) { console.log('\n(--report — nothing written)'); return; }
  if (DRY) { console.log('\n(DRY_RUN — nothing written)'); return; }

  for (const f of loaded) {
    f.data.items = (f.data.items || []).filter((it) => !it.__drop);
    for (const it of f.data.items) { delete it.__drop; delete it.__skipJunk; }
    fs.writeFileSync(f.p, JSON.stringify(f.data, null, 2));
  }

  // archive/index.json — same shape news-refresh.js writes
  const manifest = months.slice().reverse().map((f) => {
    const items = loaded.find((x) => x.label === f).data.items;
    const scores = items.map((i) => i.curatedScore || 0);
    const dates = items.map((i) => i.publishedAt).filter(Boolean).sort();
    return {
      month: f.replace('.json', ''),
      file: f,
      count: items.length,
      maxScore: scores.length ? Math.max(...scores) : 0,
      minScore: scores.length ? Math.min(...scores) : 0,
      firstPublished: dates[0] || null,
      lastPublished: dates[dates.length - 1] || null,
    };
  });
  fs.writeFileSync(path.join(ARCHIVE_DIR, 'index.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalItems: manifest.reduce((s, m) => s + m.count, 0),
    months: manifest,
  }, null, 2));
  console.log('\narchive/index.json rebuilt.');
})();
