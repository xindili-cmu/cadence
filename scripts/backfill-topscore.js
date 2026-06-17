#!/usr/bin/env node
/**
 * Backfill stats.topScore on existing daily editions.
 *
 * Older editions wrote topScore = sectionItems[0].curatedScore, i.e. the top
 * item of the FIRST category section — not the global maximum across the
 * edition. daily-brief.js now computes the true max; this one-off recomputes the
 * same value for already-shipped editions whose stored topScore disagrees.
 *
 * Pure recompute of a derived stat. Touches ONLY the stats.topScore number,
 * never any lead or item text — the editorial record is left byte-for-byte
 * unchanged. The edit is a single targeted line replacement so formatting and
 * field order are preserved (minimal diff). Idempotent: editions already
 * consistent are skipped, so re-running is a no-op.
 *
 * topScore is currently a write-only field (no reader anywhere in the repo), so
 * this has zero effect on rendered pages or published artifacts (rss/index/
 * ledger don't carry it) — it only makes the stored JSON internally consistent
 * (e.g. 06-14's lead already names a 90-point study while topScore read 85).
 *
 * Usage:
 *   node scripts/backfill-topscore.js              — write changed editions
 *   DRY_RUN=true node scripts/backfill-topscore.js — print what would change
 */
const fs   = require('fs');
const path = require('path');

const DRY_RUN   = process.env.DRY_RUN === 'true';
const DAILY_DIR = path.join(__dirname, '..', 'briefs', 'daily');
const isEdition = f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f);

// Mirror daily-brief.js exactly: max curatedScore over items that made it into
// sections (overflow items live in `flashes` without a curatedScore).
function trueTopScore(edition) {
  const items = (edition.sections || []).flatMap(s => s.items || []);
  if (!items.length) return null;
  return Math.max(...items.map(i => i.curatedScore));
}

let checked = 0, changed = 0;
for (const f of fs.readdirSync(DAILY_DIR).filter(isEdition).sort()) {
  const fp  = path.join(DAILY_DIR, f);
  const raw = fs.readFileSync(fp, 'utf8');
  const ed  = JSON.parse(raw);
  if (!ed.stats || !('topScore' in ed.stats)) continue;
  checked++;

  const stored = ed.stats.topScore;
  const want   = trueTopScore(ed);
  if (stored === want) continue;

  // Targeted single-line replace — preserves formatting, changes nothing else.
  const re = /("topScore"\s*:\s*)(-?\d+|null)/;
  if (!re.test(raw)) { console.warn(`  ! ${f}: topScore line not found, skipped`); continue; }
  const next = raw.replace(re, `$1${want}`);

  // Safety: re-parse and confirm exactly the intended value changed.
  const reparsed = JSON.parse(next);
  if (reparsed.stats.topScore !== want) { console.warn(`  ! ${f}: post-write mismatch, skipped`); continue; }

  console.log(`  ${f}: topScore ${stored} -> ${want}${DRY_RUN ? '  [dry]' : ''}`);
  if (!DRY_RUN) fs.writeFileSync(fp, next);
  changed++;
}

console.log(`\n${DRY_RUN ? '[dry] ' : ''}Checked ${checked} editions, ${changed} ${DRY_RUN ? 'would change' : 'changed'}.`);
