/*
 * Cadence Evidence — DAILY LinkedIn POSTER carousel renderer (5 × 1080×1350 + PDF).
 *
 * Implements design_handoff_daily_poster (Cadence Design System.zip, 2026-09-22).
 * Replaces the single warm-paper signal card (linkedin-daily-card.js) with a
 * five-slide carousel: slide 01 = lead paper on its specialty pigment + an
 * "ALSO TODAY" list; slides 02–05 = one supporting paper each on its own pigment.
 *
 * Input:  linkedin/<date>/poster.day.json — the design's data contract
 *         (poster.day.schema.json). Written by linkedin-poster-claims.js (LLM
 *         draft, human-reviewed) — claim/context are AUTHORED copy, never titles.
 * Output: linkedin/<date>/<date>-01.png … -05.png  (exactly 1080×1350, no scaling)
 *         linkedin/<date>/<date>-carousel.pdf       (one page per slide — LinkedIn
 *         only renders a swipeable carousel for a document post; 5 attached
 *         images show as a grid)
 *
 * Colour decisions (2026-09-17, DECISIONS-pending.md): grounds are the LIVE
 * --cat-<accent> tokens in design-system/tokens/colors.css, NOT the handoff's
 * pigments.json (which carries an unadopted re-tuned palette). The on-pigment
 * tints come from the handoff, promoted into colors.css as
 * --cat-<accent>-on-pigment. Both are READ from colors.css here — no third
 * copy of the palette (see pipeline-gates X段 for why copies are banned).
 * Every tint/white pair is contrast-checked at render time (≥4.5:1) and the
 * render aborts if one fails.
 *
 * Fewer than 5 papers: the handoff leaves this open. We render 1 + N slides
 * (N = supporting count, 0–4); slide 01's list shortens to match, the last
 * slide carries the closing CTA band, and slide counters read "02 / 04".
 *
 * Usage:
 *   node scripts/linkedin-poster.js                  # newest linkedin/<date>/poster.day.json
 *   node scripts/linkedin-poster.js 2026-09-17
 *   IN=path/to/day.json OUT_DIR=/tmp/x node scripts/linkedin-poster.js
 * Env:
 *   SHOW_SIGNAL=0   hide SIGNAL readings (handoff: only when a score is genuinely missing;
 *                   a paper with no `signal` hides its own reading automatically)
 *   NO_PDF=1        skip the PDF
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const FONT_DIR = path.join(ROOT, 'vendor', 'fonts-ttf');
const DS = path.join(ROOT, 'design-system');
const W = 1080, H = 1350;
const PAD_X = 72;
const SITE = 'incadencept.com';

const SANS = 'IBM Plex Sans', MONO = 'IBM Plex Mono', SERIF = 'Source Serif 4';

// ── neutrals (handoff "Neutrals and shared tokens") ─────────────────────────
const N = {
  cream: '#FAFAF6', ink: '#1E1C17', ink3: '#7A7568', muted: '#9D978A',
  faint: '#C4BEAF', hair: '#E4DFD1', link: '#3D74B8',
};
const RAMP = ['#2D588F', '#386BAA', '#497FBF', '#6195CD', '#79ABDB'];
const MARK_FILLS = ['#224674', '#2D588F', '#386BAA', '#497FBF', '#6195CD', '#79ABDB'];
const MARK_WHITE = [0.55, 0.66, 0.76, 1, 0.76, 0.6].map((a) => `rgba(255,255,255,${a})`);
const MARK_BARS = [
  { x: 664.6, y: 410, width: 40.5, height: 92 },
  { x: 745.6, y: 343, width: 42.5, height: 159 },
  { x: 832.5, y: 277, width: 42.6, height: 225 },
  { x: 930.0, y: 121, width: 46.7, height: 474 },
  { x: 1035.4, y: 344, width: 46.9, height: 158 },
  { x: 1128.9, y: 415, width: 39.9, height: 87 },
];

// ── taxonomy: categories.js (order = index) + colors.css (pigment, tint) ────
// categories.js is ESM (browser) — parse the source, same approach as
// pipeline-gates X段 / wiring.test.js, instead of keeping a CJS copy.
function loadTaxonomy() {
  const catsText = fs.readFileSync(path.join(DS, 'components', 'feed', 'categories.js'), 'utf8');
  const block = catsText.split('export const CATEGORIES')[1].split('];')[0];
  const cats = [...block.matchAll(/\{\s*id:\s*'([^']+)'[\s\S]*?\}/g)].map((m) => {
    const f = (k) => (m[0].match(new RegExp(`\\b${k}:\\s*'([^']*)'`)) || [])[1];
    return { id: m[1], label: f('label'), short: f('short'), accent: f('accent') };
  });
  const css = fs.readFileSync(path.join(DS, 'tokens', 'colors.css'), 'utf8');
  const tok = (name) => {
    const m = css.match(new RegExp(`${name}\\s*:\\s*(#[0-9A-Fa-f]{6})\\s*;`));
    return m ? m[1].toUpperCase() : null;
  };
  const out = {};
  cats.forEach((c, i) => {
    const pigment = tok(`--cat-${c.accent}`);
    const tint = tok(`--cat-${c.accent}-on-pigment`);
    if (!pigment || !tint) throw new Error(`colors.css is missing --cat-${c.accent}${pigment ? '-on-pigment' : ''} (category ${c.id})`);
    out[c.id] = { ...c, idx: String(i + 1).padStart(2, '0'), pigment, tint };
  });
  return out;
}

// WCAG relative-luminance contrast. The handoff verified its tints against
// ITS pigments; we render on the live ones, so re-verify every pair here.
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// ── glyph coverage ──────────────────────────────────────────────────────────
// The vendored TTFs are latin subsets. satori renders a missing glyph as a
// blank box with no warning — a silent failure on a post that can't be
// un-published. Parse each font's cmap (format 4 / 12) and refuse any text
// whose characters the font that renders it cannot draw.
function cmapSet(buf) {
  const n = buf.readUInt16BE(4); let cmapOff = null;
  for (let i = 0; i < n; i++) { const o = 12 + i * 16; if (buf.toString('ascii', o, o + 4) === 'cmap') cmapOff = buf.readUInt32BE(o + 8); }
  if (cmapOff == null) throw new Error('font has no cmap');
  const set = new Set(); const tables = buf.readUInt16BE(cmapOff + 2);
  for (let t = 0; t < tables; t++) {
    const rec = cmapOff + 4 + t * 8, pid = buf.readUInt16BE(rec), eid = buf.readUInt16BE(rec + 2);
    const off = cmapOff + buf.readUInt32BE(rec + 4), fmt = buf.readUInt16BE(off);
    if (pid !== 3 && pid !== 0) continue;
    if (fmt === 4) {
      const segX2 = buf.readUInt16BE(off + 6), ends = off + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
      for (let k = 0; k < segX2 / 2; k++) {
        const end = buf.readUInt16BE(ends + k * 2), start = buf.readUInt16BE(starts + k * 2);
        const delta = buf.readInt16BE(deltas + k * 2), ro = buf.readUInt16BE(ranges + k * 2);
        for (let c = start; c <= end && c !== 0xFFFF; c++) {
          let g;
          if (!ro) g = (c + delta) & 0xFFFF;
          else { const gi = ranges + k * 2 + ro + (c - start) * 2; g = buf.readUInt16BE(gi); if (g) g = (g + delta) & 0xFFFF; }
          if (g) set.add(c);
        }
      }
    } else if (fmt === 12) {
      const groups = buf.readUInt32BE(off + 12);
      for (let k = 0; k < groups; k++) {
        const g = off + 16 + k * 12, a = buf.readUInt32BE(g), b = buf.readUInt32BE(g + 4);
        for (let c = a; c <= b; c++) set.add(c);
      }
    }
  }
  return set;
}
const _cov = {};
function missingGlyphs(text, fontFile) {
  if (!_cov[fontFile]) _cov[fontFile] = cmapSet(fs.readFileSync(path.join(FONT_DIR, fontFile)));
  return [...new Set([...String(text)].filter((ch) => !/\s/.test(ch) && !_cov[fontFile].has(ch.codePointAt(0))))];
}
// which font renders which field
const FIELD_FONT = {
  claim: 'source-serif-4-latin-600-normal.ttf',
  context: 'source-serif-4-latin-400-italic.ttf',
  journal: 'ibm-plex-mono-latin-400-normal.ttf',
};

// ── data contract (poster.day.schema.json) ──────────────────────────────────
const LIMITS = { claim: 95, context: 210, journal: 34 };
function validateDay(day, TAX) {
  const errs = [];
  if (!day || typeof day !== 'object') return ['day is not an object'];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date || '')) errs.push(`date "${day.date}" is not YYYY-MM-DD`);
  const sup = Array.isArray(day.supporting) ? day.supporting : null;
  if (!sup) errs.push('supporting must be an array');
  else if (sup.length > 4) errs.push(`supporting has ${sup.length} papers (max 4)`);
  const papers = [['lead', day.lead], ...(sup || []).map((p, i) => [`supporting[${i}]`, p])];
  for (const [where, p] of papers) {
    if (!p || typeof p !== 'object') { errs.push(`${where} missing`); continue; }
    if (!TAX[p.categoryId]) errs.push(`${where}.categoryId "${p.categoryId}" is not one of the 8 specialties`);
    for (const k of ['claim', 'context', 'journal']) {
      const v = p[k];
      if (typeof v !== 'string' || !v.trim()) errs.push(`${where}.${k} is empty`);
      else if (v.length > LIMITS[k]) errs.push(`${where}.${k} is ${v.length} chars (max ${LIMITS[k]}) — overflows the fixed canvas`);
      if (typeof v === 'string' && v.includes('·')) errs.push(`${where}.${k} contains a middot (·) — banned by the handoff content rules`);
      if (typeof v === 'string') {
        const miss = missingGlyphs(v, FIELD_FONT[k]);
        if (miss.length) errs.push(`${where}.${k} has characters the font can't draw (would render as blank boxes): ${miss.map((c) => `"${c}" U+${c.codePointAt(0).toString(16).toUpperCase()}`).join(', ')}`);
      }
    }
    if (p.signal != null && !(Number.isInteger(p.signal) && p.signal >= 0 && p.signal <= 100)) errs.push(`${where}.signal "${p.signal}" is not an integer 0–100`);
    const allowed = new Set(['categoryId', 'tech', 'claim', 'context', 'journal', 'signal', 'url']);
    for (const k of Object.keys(p)) if (!allowed.has(k)) errs.push(`${where}.${k} is not in the schema`);
  }
  return errs;
}

// ── satori element helpers ──────────────────────────────────────────────────
const h = (type, style, ...kids) => ({ type, props: { style, children: kids.length === 1 ? kids[0] : kids } });
const col = (style, ...kids) => h('div', { display: 'flex', flexDirection: 'column', ...style }, ...kids);
const row = (style, ...kids) => h('div', { display: 'flex', flexDirection: 'row', ...style }, ...kids);
const txt = (style, s) => h('div', { display: 'flex', ...style }, String(s));
const em = (px, e) => +(px * e).toFixed(2);   // CSS em letter-spacing → px

const mono = (weight, size, track, color, extra = {}) =>
  ({ fontFamily: MONO, fontWeight: weight, fontSize: size, lineHeight: 1, letterSpacing: em(size, track), color, whiteSpace: 'nowrap', ...extra });

const mark = (w, hgt, onPigment) => ({
  type: 'svg',
  props: {
    width: w, height: hgt, viewBox: '446 107 580 508',
    children: { type: 'g', props: { transform: 'skewX(-22.490)', children: MARK_BARS.map((b, i) => ({ type: 'rect', props: { ...b, fill: onPigment ? MARK_WHITE[i] : MARK_FILLS[i] } })) } },
  },
});

// "Cadence Evidence" — on cream, "dence" in BOTH words takes the ramp, one
// shade per letter; on pigment, solid white.
function wordmark(size, onPigment) {
  const base = { fontFamily: SANS, fontWeight: 500, fontSize: size, lineHeight: 1, letterSpacing: em(size, -0.02) };
  if (onPigment) return txt({ ...base, color: '#fff', whiteSpace: 'nowrap' }, 'Cadence Evidence');
  const word = (head) => [
    txt({ ...base, color: N.ink }, head),
    ...'dence'.split('').map((ch, i) => txt({ ...base, color: RAMP[i] }, ch)),
  ];
  return row({ alignItems: 'baseline' }, ...word('Ca'), h('div', { display: 'flex', width: Math.round(size * 0.26) }), ...word('Evi'));
}

// The cadence rule: 8 cycles × 6 ticks across the 936px measure. Drawn as SVG
// rects — equivalent to the handoff's six stacked repeating-linear-gradients
// (117px cycle, ticks 3px wide at 0/19.5/39/58.5/78/97.5, heights 5/9/13/26/9/4),
// which satori does not render reliably.
function cadenceRule() {
  const measure = W - 2 * PAD_X;               // 936
  const cycle = 117;
  if (measure % cycle !== 0) throw new Error(`cadence rule: ${measure}px measure is not a whole number of ${cycle}px cycles`);
  const offs = [0, 19.5, 39, 58.5, 78, 97.5], hs = [5, 9, 13, 26, 9, 4];
  const rects = [];
  for (let c = 0; c < measure / cycle; c++) offs.forEach((o, k) => rects.push({ type: 'rect', props: { x: c * cycle + o, y: 26 - hs[k], width: 3, height: hs[k], fill: N.hair } }));
  return { type: 'svg', props: { width: measure, height: 26, viewBox: `0 0 ${measure} 26`, children: rects } };
}

// "→" is not in the vendored Plex Mono latin subset (satori would draw tofu),
// so the SWIPE arrow is drawn: 18px shaft + head, 1.6px stroke, mono-cap height.
const arrow = (color) => ({
  type: 'svg',
  props: { width: 20, height: 14, viewBox: '0 0 20 14', children: [
    { type: 'path', props: { d: 'M1 7H18M12.5 1.5L18 7l-5.5 5.5', fill: 'none', stroke: color, strokeWidth: 1.6, strokeLinecap: 'square' } },
  ] },
});

const watermark = (idx, opacity) => txt({
  position: 'absolute', right: -30, bottom: -116,
  fontFamily: MONO, fontWeight: 500, fontSize: 440, lineHeight: 0.78, letterSpacing: em(440, -0.05),
  color: `rgba(255,255,255,${opacity})`,
}, idx);

const eyebrow = (cat) => row({ alignItems: 'baseline', gap: 13 },
  txt(mono(500, 17, 0.22, cat.tint), cat.idx),
  txt(mono(500, 17, 0.22, '#fff'), cat.label.toUpperCase()),
);
const signalText = (p) => `SIGNAL ${p.signal}`;
const hasSignal = (p, opts) => opts.showSignal && Number.isInteger(p.signal);

// ── slide 01 — the hook ─────────────────────────────────────────────────────
function slideLead(day, TAX, opts) {
  const p = day.lead, cat = TAX[p.categoryId];
  const sup = day.supporting;
  const isLast = sup.length === 0;
  const plate = col(
    { position: 'relative', flexGrow: 1, paddingTop: 64, paddingLeft: PAD_X, paddingRight: PAD_X, overflow: 'hidden', color: '#fff' },
    watermark(cat.idx, opts.watermark),
    row({ alignItems: 'center', justifyContent: 'space-between', paddingBottom: 26, borderBottom: '1px solid rgba(255,255,255,0.3)' },
      row({ alignItems: 'center', gap: 16 }, mark(40, 35, true), wordmark(26, true)),
      txt(mono(400, 16, 0.16, cat.tint), day.date),
    ),
    row({ alignItems: 'baseline', marginTop: 44 },
      eyebrow(cat),
      hasSignal(p, opts) ? txt(mono(500, 17, 0.14, cat.tint, { marginLeft: 'auto' }), signalText(p)) : null,
    ),
    txt({ fontFamily: SERIF, fontWeight: 600, fontSize: 76, lineHeight: 1.1, letterSpacing: em(76, -0.02), marginTop: 26, color: '#fff', textWrap: 'balance' }, p.claim),
    txt({ fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400, fontSize: 26, lineHeight: 1.45, color: cat.tint, marginTop: 30, maxWidth: 820 }, p.context),
    txt(mono(400, 19, 0, cat.tint, { marginTop: 'auto', paddingBottom: 54 }), p.journal),
  );

  const list = opts.showAlsoToday && sup.length ? col({},
    txt(mono(500, 16, 0.24, N.muted), 'ALSO TODAY'),
    col({ marginTop: 16 }, ...sup.map((s, i) => {
      const c = TAX[s.categoryId];
      return row({ alignItems: 'baseline', gap: 18, paddingTop: 13, paddingBottom: 13, borderBottom: i < sup.length - 1 ? `1px solid ${N.hair}` : 'none' },
        txt(mono(500, 17, 0, N.faint, { width: 30, flexShrink: 0 }), c.idx),
        txt(mono(500, 19, 0.14, c.pigment, { flexGrow: 1 }), c.short.toUpperCase()),
        txt(mono(400, 18, 0, N.muted), s.journal),
      );
    })),
  ) : null;

  const band = col({ backgroundColor: N.cream, color: N.ink, paddingTop: 34, paddingBottom: 44, paddingLeft: PAD_X, paddingRight: PAD_X, flexShrink: 0 },
    list,
    row({ marginTop: list ? 26 : 0 }, cadenceRule()),
    row({ alignItems: 'center', justifyContent: 'space-between', paddingTop: 20 },
      txt(mono(400, 18, 0.18, N.ink3), 'KEEPING PACE WITH THE EVIDENCE'),
      isLast ? txt(mono(400, 18, 0.06, N.link), SITE)
        : row({ alignItems: 'center', gap: 10 }, txt(mono(400, 18, 0.06, N.muted), 'SWIPE'), arrow(N.muted)),
    ),
  );
  return col({ width: W, height: H, backgroundColor: cat.pigment, overflow: 'hidden' }, plate, band);
}

// ── slides 02–05 — one paper each ───────────────────────────────────────────
function slidePaper(p, pos, total, TAX, opts) {
  const cat = TAX[p.categoryId];
  const isLast = pos === total;
  const plate = col(
    { position: 'relative', flexGrow: 1, paddingTop: 64, paddingLeft: PAD_X, paddingRight: PAD_X, overflow: 'hidden', color: '#fff' },
    watermark(cat.idx, opts.watermark),
    row({ alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 26, borderBottom: '1px solid rgba(255,255,255,0.3)' },
      eyebrow(cat),
      txt(mono(400, 16, 0.16, cat.tint), `${String(pos).padStart(2, '0')} / ${String(total).padStart(2, '0')}`),
    ),
    txt({ fontFamily: SERIF, fontWeight: 600, fontSize: 64, lineHeight: 1.13, letterSpacing: em(64, -0.02), marginTop: 50, color: '#fff', textWrap: 'balance' }, p.claim),
    txt({ fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400, fontSize: 25, lineHeight: 1.45, color: cat.tint, marginTop: 30, maxWidth: 800 }, p.context),
    col({ marginTop: 'auto', paddingBottom: 54 },
      hasSignal(p, opts) ? txt(mono(500, 17, 0.14, cat.tint, { marginBottom: 14 }), signalText(p)) : null,
      txt(mono(400, 19, 0, cat.tint), p.journal),
    ),
  );
  const lockup = row({ alignItems: 'center', gap: 16 }, mark(34, 30, false), wordmark(22, false));
  const band = isLast
    ? col({ backgroundColor: N.cream, paddingTop: 34, paddingBottom: 44, paddingLeft: PAD_X, paddingRight: PAD_X, flexShrink: 0 },
      txt({ fontFamily: SERIF, fontWeight: 600, fontSize: 34, lineHeight: 1.25, letterSpacing: em(34, -0.01), color: N.ink }, "Five papers a day, read so you don't have to."),
      row({ marginTop: 24 }, cadenceRule()),
      row({ alignItems: 'center', justifyContent: 'space-between', paddingTop: 20 },
        lockup, txt(mono(400, 18, 0.06, N.link), SITE)),
    )
    : row({ backgroundColor: N.cream, paddingTop: 30, paddingBottom: 40, paddingLeft: PAD_X, paddingRight: PAD_X, flexShrink: 0, alignItems: 'center', justifyContent: 'space-between' },
      lockup, txt(mono(400, 18, 0.06, N.muted), SITE));
  return col({ width: W, height: H, backgroundColor: cat.pigment, overflow: 'hidden' }, plate, band);
}

// ── PDF (no dependency): one image XObject per page, RGB, FlateDecode ───────
function buildPdf(pages) {           // pages: [{ width, height, rgba: Buffer }]
  const objs = [];                   // index = obj number - 1
  const add = (body) => { objs.push(body); return objs.length; };
  const catalogId = add(null), pagesId = add(null);
  const kids = [];
  for (const pg of pages) {
    const rgb = Buffer.alloc(pg.width * pg.height * 3);
    for (let i = 0, j = 0; i < pg.rgba.length; i += 4, j += 3) {
      const a = pg.rgba[i + 3] / 255;             // composite on white (slides are opaque; belt-and-braces)
      rgb[j] = Math.round(pg.rgba[i] * a + 255 * (1 - a));
      rgb[j + 1] = Math.round(pg.rgba[i + 1] * a + 255 * (1 - a));
      rgb[j + 2] = Math.round(pg.rgba[i + 2] * a + 255 * (1 - a));
    }
    const data = zlib.deflateSync(rgb, { level: 9 });
    const imgId = add({ dict: `<< /Type /XObject /Subtype /Image /Width ${pg.width} /Height ${pg.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${data.length} >>`, stream: data });
    const content = Buffer.from(`q ${pg.width} 0 0 ${pg.height} 0 0 cm /Im0 Do Q`);
    const contId = add({ dict: `<< /Length ${content.length} >>`, stream: content });
    kids.push(add({ dict: `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pg.width} ${pg.height}] /Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contId} 0 R >>` }));
  }
  objs[catalogId - 1] = { dict: `<< /Type /Catalog /Pages ${pagesId} 0 R >>` };
  objs[pagesId - 1] = { dict: `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>` };

  const chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  let offset = chunks[0].length;
  const xref = [];
  objs.forEach((o, i) => {
    xref.push(offset);
    const parts = [Buffer.from(`${i + 1} 0 obj\n${o.dict}\n`, 'latin1')];
    if (o.stream) parts.push(Buffer.from('stream\n'), o.stream, Buffer.from('\nendstream\n'));
    parts.push(Buffer.from('endobj\n'));
    for (const p of parts) { chunks.push(p); offset += p.length; }
  });
  const xrefStart = offset;
  let tail = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const x of xref) tail += `${String(x).padStart(10, '0')} 00000 n \n`;
  tail += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(tail, 'latin1'));
  return Buffer.concat(chunks);
}

function pickDate(arg) {
  if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) return arg;
  const dir = path.join(ROOT, 'linkedin');
  const dates = fs.readdirSync(dir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && fs.existsSync(path.join(dir, d, 'poster.day.json'))).sort();
  if (!dates.length) throw new Error('no linkedin/<date>/poster.day.json found — run linkedin-poster-claims.js first');
  return dates[dates.length - 1];
}

async function main() {
  const date = process.env.IN ? null : pickDate(process.argv[2]);
  const inFile = process.env.IN || path.join(ROOT, 'linkedin', date, 'poster.day.json');
  const day = JSON.parse(fs.readFileSync(inFile, 'utf8'));
  const outDir = process.env.OUT_DIR || path.join(ROOT, 'linkedin', day.date);

  const TAX = loadTaxonomy();
  const errs = validateDay(day, TAX);
  if (errs.length) throw new Error(`poster.day.json failed validation (${inFile}):\n  - ${errs.join('\n  - ')}`);

  // contrast gate for every ground actually used today
  for (const p of [day.lead, ...day.supporting]) {
    const c = TAX[p.categoryId];
    const t = contrast(c.tint, c.pigment), w = contrast('#FFFFFF', c.pigment);
    if (t < 4.5 || w < 4.5) throw new Error(`${c.id}: on-pigment contrast below 4.5:1 (tint ${t.toFixed(2)}, white ${w.toFixed(2)}) on ${c.pigment}`);
  }

  const opts = {
    showSignal: process.env.SHOW_SIGNAL !== '0',
    showAlsoToday: true,
    watermark: 0.12,
  };
  const total = 1 + day.supporting.length;
  const trees = [slideLead(day, TAX, opts), ...day.supporting.map((p, i) => slidePaper(p, i + 2, total, TAX, opts))];

  const satori = (await import('satori')).default;
  const { Resvg } = require('@resvg/resvg-js');
  const ff = (f) => fs.readFileSync(path.join(FONT_DIR, f));
  const fonts = [
    { name: SANS, weight: 500, style: 'normal', data: ff('ibm-plex-sans-latin-500-normal.ttf') },
    { name: SANS, weight: 400, style: 'normal', data: ff('ibm-plex-sans-latin-400-normal.ttf') },
    { name: MONO, weight: 400, style: 'normal', data: ff('ibm-plex-mono-latin-400-normal.ttf') },
    { name: MONO, weight: 500, style: 'normal', data: ff('ibm-plex-mono-latin-500-normal.ttf') },
    { name: SERIF, weight: 400, style: 'normal', data: ff('source-serif-4-latin-400-normal.ttf') },
    { name: SERIF, weight: 400, style: 'italic', data: ff('source-serif-4-latin-400-italic.ttf') },
    { name: SERIF, weight: 600, style: 'normal', data: ff('source-serif-4-latin-600-normal.ttf') },
  ];

  fs.mkdirSync(outDir, { recursive: true });
  const pages = [];
  for (let i = 0; i < trees.length; i++) {
    const svg = await satori(trees[i], { width: W, height: H, fonts });
    const img = new Resvg(svg, { fitTo: { mode: 'original' } }).render();
    if (img.width !== W || img.height !== H) throw new Error(`slide ${i + 1} rendered ${img.width}×${img.height}, expected ${W}×${H}`);
    const out = path.join(outDir, `${day.date}-${String(i + 1).padStart(2, '0')}.png`);
    fs.writeFileSync(out, img.asPng());
    pages.push({ width: W, height: H, rgba: Buffer.from(img.pixels) });
    console.log(`✓ ${path.relative(ROOT, out)}  ${TAX[(i ? day.supporting[i - 1] : day.lead).categoryId].short}`);
  }
  if (process.env.NO_PDF !== '1') {
    const pdf = path.join(outDir, `${day.date}-carousel.pdf`);
    fs.writeFileSync(pdf, buildPdf(pages));
    console.log(`✓ ${path.relative(ROOT, pdf)}  (${pages.length} pages — upload as a LinkedIn document for the swipe carousel)`);
  }
}

module.exports = { loadTaxonomy, validateDay, contrast, missingGlyphs, LIMITS, buildPdf };

if (require.main === module) main().catch((e) => {
  console.error('✗ linkedin-poster:', e.message);
  // non-blocking CI step ≠ silent: leave the reason where the morning task looks
  const d = process.argv[2];
  if (!process.env.IN && d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const dir = path.join(ROOT, 'linkedin', d);
    try { fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(path.join(dir, 'POSTER-FAILED.txt'), `linkedin-poster.js failed at ${new Date().toISOString()}\n\n${e.message}\n\n`); } catch (_) { /* best effort */ }
  }
  process.exit(1);
});
