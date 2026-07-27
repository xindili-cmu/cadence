/*
 * Cadence 步频 — DAILY LinkedIn signal CARD generator (image).
 *
 * Renders the branded 1080×1350 (4:5) daily card from one immutable edition
 * (briefs/daily/YYYY-MM-DD.json) — the IMAGE companion to linkedin-brief.js
 * (which writes the paste-ready post TEXT). Same satori + resvg pipeline and
 * web brand fonts (IBM Plex Sans + Spectral + IBM Plex Mono) as
 * scripts/linkedin-card.js, but laid out per the 2026-06 redesign:
 *   header (eyebrow + multi-color equalizer) · serif headline ·
 *   SIGNAL ↓ rule · 5 scored items (big Spectral score + [TAG] + title +
 *   journal, hairline dividers) · footer lockup (Cadence 步频 · incadencept.com).
 *
 * Fonts are the repo's vendor woff2 converted to TTF in vendor/fonts-ttf/
 * (satori can't read woff2); 步频 uses cadence-bupin.ttf — a 4-glyph subset of
 * Noto Serif CJK SC (LXGW WenKai is CDN-only / unavailable offline).
 *
 * Usage:
 *   node scripts/linkedin-daily-card.js                 # latest edition
 *   node scripts/linkedin-daily-card.js 2026-06-20      # a specific edition
 *   N=5 node scripts/linkedin-daily-card.js             # item count (default 5)
 *   OUT=foo.png node scripts/linkedin-daily-card.js     # output path
 *
 * Env:
 *   SITE_URL  default incadencept.com (display only — no protocol shown)
 *   N         item count (default 5)
 *   OUT       output png (default linkedin/<date>/daily-signal.png)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DAILY_DIR = path.join(ROOT, 'briefs', 'daily');
const FONT_DIR = path.join(ROOT, 'vendor', 'fonts-ttf');
const N = Math.max(1, parseInt(process.env.N || '5', 10));
const SITE = (process.env.SITE_URL || 'incadencept.com').replace(/^https?:\/\//, '').replace(/\/$/, '');

const W = 1080, H = 1350;
const C = {
  bgL: '#3465A4', bgR: '#264E83', white: '#FFFFFF', light: '#93B8DE',
  sub: '#C9D8EC', rule: '#4A82BE', div: '#3A6296', scoreLab: '#6E93C2',
  signal: '#7FA3CC', journal: '#A9C2E0',
};
const SANS = 'IBM Plex Sans', SERIF = 'Spectral', MONO = 'IBM Plex Mono', CJK = 'Noto Serif CJK SC';

// category → display label (mirrors linkedin-brief.js CAT.en), uppercased for the tag.
const CAT = {
  orthopedic: 'Orthopedic', neurological: 'Neuro', sports: 'Sports', pediatric: 'Pediatric',
  geriatric: 'Geriatric', cardiopulmonary: 'Cardiopulmonary',
  'manual-modality': 'Manual & Modality', practice: 'Practice',
};
const tagOf = (c) => `[ ${(CAT[c] || 'Research').toUpperCase()} ]`;
// score → headline-number font size (bigger = stronger signal).
const scoreSize = (s) => (s >= 85 ? 68 : s >= 75 ? 64 : s >= 70 ? 58 : s >= 65 ? 52 : 46);
// headline auto-shrink so long leads still fit three lines.
const headSize = (t) => (t.length > 86 ? 50 : t.length > 70 ? 56 : 60);

const h = (type, style, ...kids) => ({ type, props: { style, children: kids.length === 1 ? kids[0] : kids } });
const col = (style, ...kids) => h('div', { display: 'flex', flexDirection: 'column', ...style }, ...kids);
const row = (style, ...kids) => h('div', { display: 'flex', flexDirection: 'row', alignItems: 'center', ...style }, ...kids);
const txt = (style, s) => h('div', { display: 'flex', ...style }, String(s));

// Multi-color equalizer mark (favicon waveform) — inline SVG via satori <svg>.
const BARS = [
  { x: 664.6, y: 410, width: 40.5, height: 92,  fill: '#93B8DE' },
  { x: 745.6, y: 343, width: 42.5, height: 159, fill: '#93B8DE' },
  { x: 832.5, y: 277, width: 42.6, height: 225, fill: '#C9D8EC' },
  { x: 930.0, y: 121, width: 46.7, height: 474, fill: '#FFFFFF' },
  { x: 1035.4, y: 344, width: 46.9, height: 158, fill: '#C9D8EC' },
  { x: 1128.9, y: 415, width: 39.9, height: 87,  fill: '#93B8DE' },
];
const mark = (size) => ({
  type: 'svg',
  props: {
    width: size, height: Math.round(size * 508 / 580), viewBox: '446 107 580 508',
    children: { type: 'g', props: { transform: 'skewX(-22.5)', children: BARS.map(b => ({ type: 'rect', props: { ...b, rx: 6 } })) } },
  },
});

function pickEdition(arg) {
  if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) return path.join(DAILY_DIR, `${arg}.json`);
  const files = fs.readdirSync(DAILY_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (!files.length) throw new Error('no daily editions in ' + DAILY_DIR);
  return path.join(DAILY_DIR, files[files.length - 1]);
}
const topItems = (ed, n) => (ed.sections || []).flatMap(s => s.items || [])
  .slice().sort((a, b) => (b.curatedScore || 0) - (a.curatedScore || 0)).slice(0, n);

function itemRow(it, i) {
  const sz = scoreSize(it.curatedScore || 0);
  return row(
    { width: '100%', alignItems: 'flex-start', gap: 38, paddingTop: 18, paddingBottom: 18,
      borderTop: i === 0 ? 'none' : `1px solid ${C.div}` },
    col({ width: 120, flexShrink: 0, alignItems: 'flex-end' },
      txt({ fontFamily: MONO, fontWeight: 500, fontSize: 12, letterSpacing: 2.6, color: C.scoreLab, marginBottom: 7 }, 'SIGNAL'),
      txt({ fontFamily: SERIF, fontWeight: 600, fontSize: sz, lineHeight: 0.9, color: C.light }, String(it.curatedScore ?? '·')),
    ),
    col({ flexGrow: 1, flexShrink: 1 },
      txt({ fontFamily: MONO, fontWeight: 500, fontSize: 16, letterSpacing: 2.2, color: C.light }, tagOf(it.category)),
      txt({ fontFamily: SANS, fontWeight: 500, fontSize: 24, lineHeight: 1.32, color: C.white, marginTop: 8 }, it.title || ''),
      txt({ fontFamily: MONO, fontWeight: 400, fontSize: 15, color: C.journal, marginTop: 9 }, it.journal || ''),
    ),
  );
}

function card(ed, items) {
  const headline = (ed.lead && ed.lead.titleEn) || 'Daily evidence';
  return col(
    { width: W, height: H, paddingTop: 72, paddingBottom: 72, paddingLeft: 80, paddingRight: 80,
      backgroundImage: `linear-gradient(105deg, ${C.bgL}, ${C.bgR})` },
    row({ justifyContent: 'space-between', width: '100%', marginBottom: 32 },
      txt({ fontFamily: MONO, fontWeight: 400, fontSize: 18, letterSpacing: 3.6, color: C.sub }, `DAILY EVIDENCE · ${ed.date}`),
      mark(48),
    ),
    txt({ fontFamily: SERIF, fontWeight: 600, fontSize: headSize(headline), lineHeight: 1.12, letterSpacing: -0.5, color: C.white, width: '100%' }, headline),
    row({ width: '100%', gap: 18, marginTop: 30, marginBottom: 8 },
      txt({ fontFamily: MONO, fontWeight: 400, fontSize: 15, letterSpacing: 3, color: C.signal }, 'SIGNAL  ↓'),
      h('div', { display: 'flex', flexGrow: 1, height: 1, backgroundColor: C.div }),
    ),
    col({ flexGrow: 1, justifyContent: 'center', width: '100%' }, ...items.map(itemRow)),
    row({ justifyContent: 'space-between', width: '100%', paddingTop: 28, marginTop: 6, borderTop: `2px solid ${C.rule}` },
      row({ alignItems: 'center', gap: 16 },
        mark(40),
        row({ alignItems: 'baseline' },
          txt({ fontFamily: SANS, fontWeight: 600, fontSize: 30, letterSpacing: -0.5, color: C.white }, 'Ca'),
          txt({ fontFamily: SANS, fontWeight: 600, fontSize: 30, letterSpacing: -0.5, color: C.light }, 'dence'),
          txt({ fontFamily: CJK, fontWeight: 400, fontSize: 23, color: C.sub, marginLeft: 12 }, '步频'),
        ),
      ),
      txt({ fontFamily: MONO, fontWeight: 400, fontSize: 18, letterSpacing: 2.5, color: C.sub }, SITE),
    ),
  );
}

async function main() {
  const file = pickEdition(process.argv[2]);
  const ed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const items = topItems(ed, N);
  if (!items.length) throw new Error('edition has no items: ' + file);

  const satori = (await import('satori')).default;
  const { Resvg } = require('@resvg/resvg-js');
  const ff = (f) => fs.readFileSync(path.join(FONT_DIR, f));
  const fonts = [
    { name: SANS,  weight: 500, style: 'normal', data: ff('ibm-plex-sans-latin-500-normal.ttf') },
    { name: SANS,  weight: 600, style: 'normal', data: ff('ibm-plex-sans-latin-600-normal.ttf') },
    { name: MONO,  weight: 400, style: 'normal', data: ff('ibm-plex-mono-latin-400-normal.ttf') },
    { name: MONO,  weight: 500, style: 'normal', data: ff('ibm-plex-mono-latin-500-normal.ttf') },
    // Spectral vendor ttf ships 500 only; map 600 to it (no faux-bold in satori).
    { name: SERIF, weight: 500, style: 'normal', data: ff('spectral-latin-500-normal.ttf') },
    { name: SERIF, weight: 600, style: 'normal', data: ff('spectral-latin-500-normal.ttf') },
    // 步频 — 4-glyph subset of Noto Serif CJK SC.
    { name: CJK,   weight: 400, style: 'normal', data: ff('cadence-bupin.ttf') },
  ];
  const svg = await satori(card(ed, items), { width: W, height: H, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();

  const out = process.env.OUT || path.join(ROOT, 'linkedin', ed.date, 'daily-signal.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, png);
  console.log(`✓ ${path.relative(ROOT, out)} (${W}×${H}) — ${ed.date}, ${items.length} items`);
  for (const it of items) console.log(`   ${it.curatedScore ?? '·'}  ${tagOf(it.category)}  ${(it.title || '').slice(0, 56)}`);
}
main().catch(e => { console.error(e); process.exit(1); });
