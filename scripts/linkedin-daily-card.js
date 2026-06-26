/*
 * Cadence 步频 — DAILY LinkedIn signal CARD generator (image).
 *
 * Renders the branded 1080×1350 (4:5) daily card from one immutable edition
 * (briefs/daily/YYYY-MM-DD.json) — the IMAGE companion to linkedin-brief.js
 * (which writes the paste-ready post TEXT). Same satori + resvg pipeline and
 * web brand fonts (IBM Plex Sans + Spectral + IBM Plex Mono) as
 * scripts/linkedin-card.js.
 *
 * 2026-06 REDESIGN — "Signal waveform", on the real Cadence design system:
 *   warm editorial paper (#FAFAF6), clay ink, scrubs blue as ACCENT (never a
 *   full-bleed gradient). Header (mono eyebrow + 6-bar skewed mark) · Spectral
 *   headline · category-keyed accent rule · a 3-tier SIGNAL legend (navy ≥90 /
 *   scrubs 80–89 / clay 65–79) · N scored items, each a skewed "signal bar"
 *   whose HEIGHT encodes the score and whose COLOR encodes the tier — echoing
 *   the brand equalizer mark — beside a colored specialty keyword + Plex Sans
 *   title · footer lockup (Cadence 步频 · incadencept.com). Hairline-led,
 *   no gradients, no repeated "SIGNAL" labels, no boxed chips.
 *
 * Fonts are the repo's vendor woff2 converted to TTF in vendor/fonts-ttf/
 * (satori can't read woff2); 步频 uses cadence-bupin.ttf — a 4-glyph subset of
 * Noto Serif CJK SC. NOTE: only those glyphs exist offline, so the card body
 * is English; full Chinese (lead.titleZh) is intentionally not rendered here.
 *
 * Usage:
 *   node scripts/linkedin-daily-card.js                 # latest edition
 *   node scripts/linkedin-daily-card.js 2026-06-22      # a specific edition
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

// ---- Brand tokens (warm paper · clay ink · scrubs blue accent) ----
const C = {
  paper:  '#FAFAF6',
  ink900: '#1E1C17',
  ink600: '#5E5A4F',
  ink500: '#7A7568',
  ink400: '#9D978A',
  hair:   '#E4DFD1',
  blue:   '#3D74B8',
};
const SANS = 'IBM Plex Sans', SERIF = 'Spectral', MONO = 'IBM Plex Mono', CJK = 'Noto Serif CJK SC';

// Decode HTML entities that leak in from source titles (&#xa0;, &amp;, &#39;, …)
// so the card never renders raw entity codes. NBSP becomes a normal space.
const decode = (s) => String(s == null ? '' : s)
  .replace(/&#x([0-9a-fA-F]+);/g, (_, x) => String.fromCodePoint(parseInt(x, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

// category → { display label, solid accent } (the real --cat-* palette).
const CAT = {
  orthopedic:        { label: 'Orthopedic',          solid: '#3C4C6E' },
  neurological:      { label: 'Neurological',         solid: '#463E7C' },
  sports:            { label: 'Sports',               solid: '#9B4A2C' },
  pediatric:         { label: 'Pediatric',            solid: '#876418' },
  geriatric:         { label: 'Geriatric',            solid: '#2F5D52' },
  cardiopulmonary:   { label: 'Cardiopulmonary',      solid: '#8C3B43' },
  'manual-modality': { label: 'Manual & Modalities',  solid: '#545F2E' },
  practice:          { label: 'Practice',             solid: '#434952' },
};
const catOf = (c) => CAT[c] || { label: 'Research', solid: '#434952' };
const tagOf = (c) => catOf(c).label.toUpperCase();

// SIGNAL authority scale inside the blue family (NOT traffic lights):
// navy ≥90 practice-changing · scrubs 80–89 worth knowing · clay 65–79 reference.
const tierFg = (s) => (s >= 90 ? '#224674' : s >= 80 ? C.blue : C.ink500);
// score → BIG serif score size (px). The score is the per-row focal anchor;
// stronger signals read larger, so the eye lands on the day's best evidence.
const scoreSize = (s) => (s >= 90 ? 56 : s >= 80 ? 50 : s >= 70 ? 44 : 40);
// score → slim signal-bar height (px). A compact waveform accent UNDER the
// number (subordinate to it), mapping the 65–100 band onto a small range.
const barH = (s) => Math.max(10, Math.round(((s - 60) / 40) * 30) + 12);
// headline auto-shrink so long leads still fit two lines (measured against the
// 920px content width). More aggressive than before so real titles don't spill
// to a 3rd line and collide with the legend below.
const headSize = (t) => (t.length > 88 ? 42 : t.length > 72 ? 46 : t.length > 56 ? 52 : 60);
const HEAD_LH = 1.1;

// ranges use ASCII only (the mono TTF subset lacks ≥ and en-dash glyphs).
const TIERS = [
  { color: '#224674', label: 'PRACTICE-CHANGING', range: '90+' },
  { color: C.blue,    label: 'WORTH KNOWING',     range: '80-89' },
  { color: C.ink500,  label: 'REFERENCE',         range: '65-79' },
];

// ---- satori element helpers (flexbox only; explicit flexDirection) ----
const h = (type, style, ...kids) => ({ type, props: { style, children: kids.length === 1 ? kids[0] : kids } });
const col = (style, ...kids) => h('div', { display: 'flex', flexDirection: 'column', ...style }, ...kids);
const row = (style, ...kids) => h('div', { display: 'flex', flexDirection: 'row', alignItems: 'center', ...style }, ...kids);
const txt = (style, s) => h('div', { display: 'flex', ...style }, String(s));
const box = (style) => h('div', { display: 'flex', ...style });

// 6-bar skewed equalizer mark (the brand favicon waveform). The bars step
// navy → scrubs → light across the row, reading as a gradient (stepped so it
// renders identically through satori/resvg, which smooth gradients don't).
const MARK_FILLS = ['#224674', '#2D588F', '#386BAA', '#497FBF', '#6195CD', '#79ABDB'];
const MARK_BARS = [
  { x: 664.6,  y: 410, width: 40.5, height: 92  },
  { x: 745.6,  y: 343, width: 42.5, height: 159 },
  { x: 832.5,  y: 277, width: 42.6, height: 225 },
  { x: 930.0,  y: 121, width: 46.7, height: 474 },
  { x: 1035.4, y: 344, width: 46.9, height: 158 },
  { x: 1128.9, y: 415, width: 39.9, height: 87  },
];
const mark = (width) => ({
  type: 'svg',
  props: {
    width, height: Math.round(width * 500 / 580), viewBox: '440 110 580 500',
    children: { type: 'g', props: { transform: 'skewX(-22.49)', children: MARK_BARS.map((b, i) => ({ type: 'rect', props: { ...b, rx: 8, fill: MARK_FILLS[i] } })) } },
  },
});

// a single skewed "signal bar" (same -22.49° lean as the mark); height encodes score.
const SKEW = Math.tan(22.49 * Math.PI / 180); // ≈ 0.4137
// Signal meter: a faint full-height track (ceiling = max score) with the colored
// fill rising to the item's score — both skewed -22.49° so they echo the mark.
// Bottom edges share an anchor; taller scores fill more of the same ceiling.
const TRACK_H = barH(100);            // 58px — the compact visual ceiling
const TRACK_FILL = 'rgba(30,28,23,0.06)';
const signalBar = (fillH, color) => {
  const w = 15;
  const x = SKEW * TRACK_H;           // pre-skew x so the leaned shape stays in frame
  const width = Math.ceil(x + w);
  return {
    type: 'svg',
    props: {
      width, height: TRACK_H, viewBox: `0 0 ${width} ${TRACK_H}`,
      children: { type: 'g', props: { transform: 'skewX(-22.49)', children: [
        { type: 'rect', props: { x, y: 0, width: w, height: TRACK_H, rx: 2, fill: TRACK_FILL } },
        { type: 'rect', props: { x, y: TRACK_H - fillH, width: w, height: fillH, rx: 2, fill: color } },
      ] } },
    },
  };
};

const swatch = (size, color) => box({ width: size, height: size, borderRadius: 1, flexShrink: 0, backgroundColor: color });

// horizontal dash swatch (matches the in-card legend ticks)
const dash = (color) => box({ width: 14, height: 5, borderRadius: 1, flexShrink: 0, backgroundColor: color });
function legendItem(t) {
  return row({ gap: 9 },
    dash(t.color),
    txt({ fontFamily: MONO, fontWeight: 500, fontSize: 11, letterSpacing: 1.2, color: C.ink600 }, t.label),
    txt({ fontFamily: MONO, fontWeight: 400, fontSize: 11, letterSpacing: 0.4, color: '#B0A99A' }, t.range),
  );
}

function itemRow(it, i) {
  const fg = tierFg(it.curatedScore || 0);
  const c = catOf(it.category);
  const lead = i === 0;                              // the day's top story
  const titleSize = lead ? 26 : 20;                  // lead title bigger = focal point
  return row(
    { width: '100%', alignItems: 'flex-start', gap: 30, paddingTop: lead ? 30 : 32, paddingBottom: 32, borderTop: `1px solid ${C.hair}` },
    // left rail: BIG serif score (the focal anchor) + slim waveform accent.
    col({ width: 96, flexShrink: 0, alignItems: 'center' },
      txt({ fontFamily: SERIF, fontWeight: 600, fontSize: scoreSize(it.curatedScore || 0), lineHeight: 1, letterSpacing: -1, color: fg, marginBottom: 10 }, String(it.curatedScore ?? '·')),
      signalBar(barH(it.curatedScore || 0), fg),
    ),
    // minWidth:0 lets this flex column shrink to its track and WRAP the title
    // instead of letting a long line overflow the right margin.
    col({ flexGrow: 1, flexShrink: 1, minWidth: 0, paddingTop: lead ? 4 : 6 },
      row({ width: '100%', justifyContent: 'space-between' },
        row({ gap: 9, flexShrink: 1, minWidth: 0 },
          swatch(7, c.solid),
          txt({ fontFamily: MONO, fontWeight: 500, fontSize: 12, letterSpacing: 1.6, color: c.solid }, tagOf(it.category)),
        ),
        txt({ fontFamily: MONO, fontWeight: 400, fontSize: 12, letterSpacing: 0.5, color: C.ink400, flexShrink: 0, marginLeft: 16 }, decode(it.source || '')),
      ),
      txt({ fontFamily: SANS, fontWeight: 600, fontSize: titleSize, lineHeight: 1.28, color: C.ink900, marginTop: 11, width: '100%' }, decode(it.title || '')),
    ),
  );
}

function card(ed, items) {
  const headline = decode((ed.lead && ed.lead.titleEn) || 'Daily evidence');
  const hSize = headSize(headline);
  const headClampH = Math.ceil(hSize * HEAD_LH * 2); // hard 2-line ceiling
  const dateDot = String(ed.date || '').replace(/-/g, '·');
  const heroSolid = catOf(items[0].category).solid;

  return col(
    { width: W, height: H, paddingTop: 66, paddingBottom: 58, paddingLeft: 80, paddingRight: 80, backgroundColor: C.paper },

    // header
    row({ width: '100%', justifyContent: 'space-between' },
      txt({ fontFamily: MONO, fontWeight: 500, fontSize: 14, letterSpacing: 2.2, color: C.ink500 }, `DAILY EVIDENCE · ${dateDot}`),
      mark(52),
    ),

    // headline + category-keyed accent rule. The headline lives in a fixed
    // 2-line box (overflow hidden) so a long title can never bleed into the
    // legend/items below — the rest of the card flows beneath a known height.
    h('div', { display: 'flex', width: '100%', height: headClampH, marginTop: 30, overflow: 'hidden' },
      txt({ fontFamily: SERIF, fontWeight: 500, fontSize: hSize, lineHeight: HEAD_LH, letterSpacing: -1, color: C.ink900, width: '100%' }, headline)),
    box({ width: 128, height: 4, borderRadius: 2, marginTop: 24, backgroundColor: heroSolid }),

    // tier legend
    row({ width: '100%', gap: 26, marginTop: 24 },
      txt({ fontFamily: MONO, fontWeight: 500, fontSize: 11, letterSpacing: 2, color: C.ink400 }, 'SIGNAL'),
      ...TIERS.map(legendItem),
    ),

    // items — a tight block with consistent row spacing, vertically CENTERED in
    // the leftover space (like the reference card). Even whitespace above/below,
    // no stretched gaps.
    col({ width: '100%', marginTop: 24, flexGrow: 1, justifyContent: 'center' }, ...items.map(itemRow)),

    // footer lockup
    row({ width: '100%', justifyContent: 'space-between', paddingTop: 22, borderTop: `1px solid ${C.hair}` },
      row({ gap: 14 },
        mark(44),
        row({ alignItems: 'baseline' },
          txt({ fontFamily: SANS, fontWeight: 600, fontSize: 25, color: C.ink900 }, 'Ca'),
          txt({ fontFamily: SANS, fontWeight: 600, fontSize: 25, color: C.blue }, 'dence'),
          txt({ fontFamily: CJK, fontWeight: 400, fontSize: 19, color: C.ink500, marginLeft: 12 }, '步频'),
        ),
      ),
      txt({ fontFamily: MONO, fontWeight: 400, fontSize: 14, letterSpacing: 0.6, color: C.ink500 }, SITE),
    ),
  );
}

function pickEdition(arg) {
  if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) return path.join(DAILY_DIR, `${arg}.json`);
  const files = fs.readdirSync(DAILY_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (!files.length) throw new Error('no daily editions in ' + DAILY_DIR);
  return path.join(DAILY_DIR, files[files.length - 1]);
}
const topItems = (ed, n) => (ed.sections || []).flatMap(s => s.items || [])
  .slice().sort((a, b) => (b.curatedScore || 0) - (a.curatedScore || 0)).slice(0, n);

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
  for (const it of items) console.log(`   ${String(it.curatedScore ?? '·').padStart(3)}  [${tagOf(it.category)}]  ${(it.title || '').slice(0, 56)}`);
}
main().catch(e => { console.error(e); process.exit(1); });
