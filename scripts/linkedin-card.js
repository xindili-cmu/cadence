/*
 * Cadence 步频 — weekly "This week's signal" CARD generator (image).
 *
 * Renders a branded 1080×1350 (4:5, max LinkedIn feed real estate) PNG listing
 * the top-N highest-scored items from the last 7 days, using the same
 * satori + resvg pipeline as scripts/wechat-cover.js & xhs-digest.js — but with
 * the WEB brand fonts (IBM Plex Sans + Spectral + IBM Plex Mono), since this card
 * is English-only. Fonts are the repo's own vendor woff2 converted to TTF in
 * vendor/fonts-ttf/ (satori can't read woff2).
 *
 * This is the IMAGE companion to scripts/linkedin-brief.js (which writes the
 * paste-ready post TEXT). Workflow each week: run linkedin-brief.js for the
 * copy, run this for the attached image, post both (link in first comment).
 *
 * Usage:
 *   node scripts/linkedin-card.js                  # last 7 days ending today
 *   node scripts/linkedin-card.js 2026-06-14       # last 7 days ending on date
 *   N=5 node scripts/linkedin-card.js              # item count (default 5)
 *   DAYS=7 node scripts/linkedin-card.js           # window length (default 7)
 *   OUT=foo.png node scripts/linkedin-card.js      # output path
 *
 * Env:
 *   SITE_URL  default incadencept.com (display only — no protocol shown)
 *   N         item count (default 5)
 *   DAYS      look-back window in days (default 7)
 *   OUT       output png path (default linkedin/<endDate>/weekly-signal.png)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NEWS = path.join(ROOT, 'news.json');
const FONT_DIR = path.join(ROOT, 'vendor', 'fonts-ttf');

const N = Math.max(1, parseInt(process.env.N || '5', 10));
const DAYS = Math.max(1, parseInt(process.env.DAYS || '7', 10));
const SITE = (process.env.SITE_URL || 'incadencept.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
// Skip specific items by id (comma-separated). Lets you drop a story from the
// Top-N pick without touching news.json; the next-highest item fills its slot.
const EXCLUDE = new Set((process.env.EXCLUDE || '').split(',').map(s => s.trim()).filter(Boolean));

const W = 1080, H = 1350;
const C = {
  bgL: '#3465A4', bgR: '#264E83',   // left→right gradient (matches the cover banner)
  white: '#FFFFFF', light: '#93B8DE', sub: '#C9D8EC', rule: '#4A82BE', div: '#3A6296',
};
const SANS = 'IBM Plex Sans', SERIF = 'Spectral', MONO = 'IBM Plex Mono';

// Category → short label (mirrors linkedin-brief.js / x-thread.js).
const CAT = {
  orthopedic: 'Ortho', neurological: 'Neuro', sports: 'Sports', pediatric: 'Pediatric',
  geriatric: 'Geriatric', cardiopulmonary: 'Cardiopulmonary',
  'manual-modality': 'Manual & Modality', practice: 'Practice',
};
const catOf = (c) => CAT[c] || 'Research';

// Journal long-name → compact form (cards have no room for full titles).
const JOURNAL_SHORT = {
  'British Journal of Sports Medicine': 'Br J Sports Med',
  'Neurorehabilitation and neural repair': 'Neurorehab & Neural Repair',
  'Disability and rehabilitation': 'Disability & Rehab',
  'Physical Therapy': 'Phys Ther',
  'Journal of physiotherapy': 'J Physiother',
  'Archives of physical medicine and rehabilitation': 'Arch Phys Med Rehabil',
};
const shortJournal = (j) => JOURNAL_SHORT[j] || (j || 'Journal');

// Card titles must be short: drop the subtitle after the first colon, trim a
// trailing period, and hard-cap length so 5 items always fit the 4:5 canvas.
function cleanTitle(t, cap = 72) {
  if (!t) return '';
  let s = String(t).split(':')[0].replace(/\.$/, '').trim();
  if (s.length > cap) s = s.slice(0, cap - 1).replace(/[\s,;-]+\S*$/, '').trim() + '…';
  return s;
}

const h = (type, style, ...kids) => ({ type, props: { style, children: kids.length === 1 ? kids[0] : kids } });
const col = (style, ...kids) => h('div', { display: 'flex', flexDirection: 'column', ...style }, ...kids);
const row = (style, ...kids) => h('div', { display: 'flex', flexDirection: 'row', alignItems: 'center', ...style }, ...kids);
const txt = (style, s) => h('div', { display: 'flex', ...style }, String(s));

function dt(x) { return (x.firstSeen || x.publishedAt || '').slice(0, 10); }

function pickItems(endDate) {
  const items = JSON.parse(fs.readFileSync(NEWS, 'utf8')).items || [];
  const end = new Date(endDate + 'T23:59:59Z');
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - (DAYS - 1));
  const startStr = start.toISOString().slice(0, 10);
  const inWin = items.filter(x => { const d = dt(x); return d && d >= startStr && d <= endDate; });
  let pool = inWin.length ? inWin : items;      // fallback: whole feed if window empty
  if (EXCLUDE.size) pool = pool.filter(x => !EXCLUDE.has(String(x.id)));
  return { startStr, items: pool.slice().sort((a, b) => (b.curatedScore || 0) - (a.curatedScore || 0)).slice(0, N) };
}

// Equalizer mark (the favicon waveform), top-right, as inline SVG via satori <svg>.
function mark() {
  return {
    type: 'svg',
    props: {
      width: 78, height: 68, viewBox: '446 107 580 508',
      children: {
        type: 'g',
        props: {
          transform: 'skewX(-22.490)', fill: C.light,
          children: [
            { type: 'rect', props: { x: 664.6, y: 410, width: 40.5, height: 92 } },
            { type: 'rect', props: { x: 745.6, y: 343, width: 42.5, height: 159 } },
            { type: 'rect', props: { x: 832.5, y: 277, width: 42.6, height: 225 } },
            { type: 'rect', props: { x: 930.0, y: 121, width: 46.7, height: 474 } },
            { type: 'rect', props: { x: 1035.4, y: 344, width: 46.9, height: 158 } },
            { type: 'rect', props: { x: 1128.9, y: 415, width: 39.9, height: 87 } },
          ],
        },
      },
    },
  };
}

function fmtRange(startStr, endStr) {
  const M = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const a = new Date(startStr + 'T00:00:00Z'), b = new Date(endStr + 'T00:00:00Z');
  const da = a.getUTCDate(), db = b.getUTCDate(), yr = b.getUTCFullYear();
  if (a.getUTCMonth() === b.getUTCMonth())
    return `${M[b.getUTCMonth()]} ${da} – ${db}, ${yr}`;
  return `${M[a.getUTCMonth()]} ${da} – ${M[b.getUTCMonth()]} ${db}, ${yr}`;
}

function card(items, startStr, endStr) {
  const itemEls = items.map((it, i) => {
    const last = i === items.length - 1;
    return col({ width: '100%', borderBottom: last ? 'none' : `1px solid ${C.div}`, paddingBottom: last ? 0 : 30, marginBottom: last ? 0 : 30 },
      row({ alignItems: 'flex-start', gap: 24 },
        txt({ fontFamily: SERIF, fontWeight: 500, fontSize: 42, color: C.light, width: 64, flexShrink: 0 }, it.curatedScore ?? '·'),
        col({ flexGrow: 1, gap: 8 },
          txt({ fontFamily: SANS, fontWeight: 500, fontSize: 37, color: C.white, lineHeight: 1.22 }, cleanTitle(it.title)),
          txt({ fontFamily: MONO, fontWeight: 400, fontSize: 23, color: C.sub },
            `${shortJournal(it.journal)} · ${catOf(it.category)}`),
        ),
      ),
    );
  });

  return col(
    { width: W, height: H, padding: '88px', justifyContent: 'space-between',
      backgroundImage: `linear-gradient(90deg, ${C.bgL}, ${C.bgR})` },
    // header
    col({ gap: 0 },
      row({ justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' },
        col({ gap: 8 },
          txt({ fontFamily: MONO, fontWeight: 500, fontSize: 24, color: C.light, letterSpacing: 3 }, "THIS WEEK'S SIGNAL"),
          txt({ fontFamily: MONO, fontWeight: 400, fontSize: 24, color: C.sub, letterSpacing: 3 }, fmtRange(startStr, endStr)),
        ),
        mark(),
      ),
      txt({ fontFamily: SERIF, fontWeight: 500, fontSize: 60, color: C.white, marginTop: 44, lineHeight: 1.15 },
        `${items.length === 5 ? 'Five' : items.length} studies worth your time.`),
      h('div', { display: 'flex', width: 120, height: 6, backgroundColor: C.rule, marginTop: 22 }),
    ),
    // items (flex-grow region, evenly distributed)
    col({ flexGrow: 1, justifyContent: 'center', gap: 0, width: '100%', paddingTop: 48, paddingBottom: 24 }, ...itemEls),
    // footer
    row({ justifyContent: 'space-between', alignItems: 'flex-end', width: '100%' },
      row({},
        txt({ fontFamily: SANS, fontWeight: 600, fontSize: 46, color: C.white }, 'Ca'),
        txt({ fontFamily: SANS, fontWeight: 600, fontSize: 46, color: C.light }, 'dence'),
      ),
      txt({ fontFamily: MONO, fontWeight: 400, fontSize: 27, color: C.light }, SITE),
    ),
  );
}

async function main() {
  const endStr = (process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2]))
    ? process.argv[2] : new Date().toISOString().slice(0, 10);
  const { startStr, items } = pickItems(endStr);
  if (!items.length) throw new Error('no items found for window ending ' + endStr);

  const satori = (await import('satori')).default;
  const { Resvg } = require('@resvg/resvg-js');
  const ff = (f) => fs.readFileSync(path.join(FONT_DIR, f));
  const fonts = [
    { name: SANS,  weight: 500, style: 'normal', data: ff('ibm-plex-sans-latin-500-normal.ttf') },
    { name: SANS,  weight: 600, style: 'normal', data: ff('ibm-plex-sans-latin-600-normal.ttf') },
    { name: MONO,  weight: 400, style: 'normal', data: ff('ibm-plex-mono-latin-400-normal.ttf') },
    { name: MONO,  weight: 500, style: 'normal', data: ff('ibm-plex-mono-latin-500-normal.ttf') },
    { name: SERIF, weight: 500, style: 'normal', data: ff('spectral-latin-500-normal.ttf') },
  ];
  const svg = await satori(card(items, startStr, endStr), { width: W, height: H, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();

  const out = process.env.OUT || path.join(ROOT, 'linkedin', endStr, 'weekly-signal.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, png);
  console.log(`✓ ${path.relative(ROOT, out)} (${W}×${H}) — ${items.length} items, ${startStr} → ${endStr}`);
  console.log('  picked (id · score · title) — pass any id to EXCLUDE= to drop it:');
  for (const it of items) console.log(`   ${it.id}  ${it.curatedScore ?? '·'}  ${cleanTitle(it.title, 60)}`);
  if (EXCLUDE.size) console.log(`  excluded: ${[...EXCLUDE].join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
