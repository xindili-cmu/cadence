#!/usr/bin/env node
/**
 * Cadence — search-box usage report (Phase 0 of the "ask the evidence" bot,
 * decision 2026-09-09: measure one week of search intent BEFORE spending an
 * LLM bill on a bot; kill criterion is in DECISIONS-pending.md).
 *
 * Reads the SEARCH_LOG KV namespace via wrangler (needs `npx wrangler login`
 * once, or CLOUDFLARE_API_TOKEN in env). Every event is a self-describing key
 * — see worker.js handlePing — so one `kv key list` is the whole dataset.
 *
 *   node scripts/search-log-report.js            # last 7 days
 *   node scripts/search-log-report.js --days 14
 *   node scripts/search-log-report.js --json     # raw events, for further slicing
 *
 * Who runs it: Cindy, manually, at the weekly review (scripts/_wiring.json).
 * Nothing here calls an LLM; safe anywhere wrangler can reach Cloudflare.
 */
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const DAYS = Number((args[args.indexOf('--days') + 1]) || 7) || 7;
const JSON_OUT = args.includes('--json');

function b64urlDecode(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(b64, 'base64').toString('utf8');
}

function listKeys() {
  // wrangler prints a JSON array of { name, expiration }.
  const out = execFileSync('npx', ['wrangler', 'kv', 'key', 'list', '--binding', 'SEARCH_LOG', '--remote'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 });
  const start = out.indexOf('[');
  return JSON.parse(out.slice(start)).map((k) => k.name);
}

function parse(name) {
  const p = name.split(':');
  if (p[0] === 'v' && p.length === 5) return { t: 'v', day: p[1], lang: p[3], mobile: p[4] === '1' };
  if (p[0] === 's' && p.length === 7) {
    let q = ''; try { q = b64urlDecode(p[6]); } catch { q = '(undecodable)'; }
    return { t: 's', day: p[1], lang: p[3], hits: Number(p[4]), view: p[5], q };
  }
  return null;
}

const since = new Date(Date.now() - DAYS * 86400e3).toISOString().slice(0, 10);
const events = listKeys().map(parse).filter((e) => e && e.day >= since);

if (JSON_OUT) { console.log(JSON.stringify(events, null, 1)); process.exit(0); }

const views = events.filter((e) => e.t === 'v');
const searches = events.filter((e) => e.t === 's');
const byDay = {};
for (const e of events) {
  byDay[e.day] = byDay[e.day] || { v: 0, s: 0 };
  byDay[e.day][e.t] += 1;
}
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a');

console.log(`Cadence search usage — last ${DAYS} days (since ${since})\n`);
console.log(`pageviews (tab sessions): ${views.length}   searches (settled queries): ${searches.length}   searches/visit: ${pct(searches.length, views.length)}`);
console.log(`lang — visits zh/en: ${views.filter((v) => v.lang === 'zh').length}/${views.filter((v) => v.lang === 'en').length}` +
  `   searches zh/en: ${searches.filter((s) => s.lang === 'zh').length}/${searches.filter((s) => s.lang === 'en').length}` +
  `   mobile visits: ${pct(views.filter((v) => v.mobile).length, views.length)}`);
console.log('\nper day        visits  searches');
for (const d of Object.keys(byDay).sort()) console.log(`${d}     ${String(byDay[d].v).padStart(5)}  ${String(byDay[d].s).padStart(8)}`);

const freq = {};
for (const s of searches) {
  const k = s.q.toLowerCase();
  freq[k] = freq[k] || { n: 0, hits: s.hits, zero: 0 };
  freq[k].n += 1;
  if (s.hits === 0) freq[k].zero += 1;
}
const top = Object.entries(freq).sort((a, b) => b[1].n - a[1].n);
console.log(`\ndistinct queries: ${top.length}   zero-hit searches: ${searches.filter((s) => s.hits === 0).length} (${pct(searches.filter((s) => s.hits === 0).length, searches.length)})`);
console.log('\ntop queries (n · hits · query)');
for (const [q, v] of top.slice(0, 40)) console.log(`  ${String(v.n).padStart(3)} · ${String(v.hits).padStart(4)} · ${q}`);

// The signal that matters for the bot decision: questions, not keywords.
// A keyword ("ACL") is served by search; a sentence ("does BFR help after
// ACLR") is what a bot would add. Crude detector: ≥4 words, or a CJK query ≥8
// chars, or a question mark / question word.
const isQuestion = (q) => /[?？]|^(does|do|is|are|can|should|what|which|how|why|when)\b|(吗|如何|怎么|是否|有没有|多少)/i.test(q)
  || q.split(/\s+/).length >= 4 || (/[一-鿿]/.test(q) && q.length >= 8);
const qs = searches.filter((s) => isQuestion(s.q));
console.log(`\nquestion-shaped queries: ${qs.length} (${pct(qs.length, searches.length)} of searches)`);
for (const s of qs.slice(0, 20)) console.log(`  ${s.day} · ${s.hits} hits · ${s.q}`);
