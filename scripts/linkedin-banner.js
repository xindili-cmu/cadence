/*
 * Cadence — LinkedIn Page cover / banner (one-off brand asset).
 *
 * Company-page cover renders at 1128×191; this outputs @2x (2256×382) on the
 * same brand system as linkedin-daily-card.js: warm paper, ink, scrubs blue,
 * the 6-bar skewed equalizer mark. EN surface → wordmark only, no 步频
 * (2026-08-25 name split, see PRINCIPLES.md 定位).
 *
 * Usage:  node scripts/linkedin-banner.js          # → design-system/assets/linkedin-banner.png
 *         OUT=foo.png node scripts/linkedin-banner.js
 *
 * Re-run only when the brand changes; upload manually on the Cadence PT page
 * (Edit page → Header → upload cover). Fonts: repo vendor TTFs (satori can't
 * read woff2). Latin-only by design.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FONT_DIR = path.join(ROOT, 'vendor', 'fonts-ttf');
const W = 2256, H = 382; // 2× of LinkedIn's 1128×191 company cover

const C = {
  paper:  '#FAFAF6',
  ink900: '#1E1C17',
  ink500: '#7A7568',
  ink400: '#9D978A',
  hair:   '#E4DFD1',
  blue:   '#3D74B8',
};
const SANS = 'IBM Plex Sans', MONO = 'IBM Plex Mono';

// ---- satori helpers (flexbox only; explicit flexDirection) ----
const h = (type, style, ...kids) => ({ type, props: { style, children: kids.length === 1 ? kids[0] : kids } });
const col = (style, ...kids) => h('div', { display: 'flex', flexDirection: 'column', ...style }, ...kids);
const row = (style, ...kids) => h('div', { display: 'flex', flexDirection: 'row', alignItems: 'center', ...style }, ...kids);
const txt = (style, s) => h('div', { display: 'flex', ...style }, String(s));
const box = (style) => h('div', { display: 'flex', ...style });

// 6-bar skewed equalizer mark — same geometry as the daily card / Logo.jsx.
const MARK_BARS = [
  { x: 664.6,  y: 410, width: 40.5, height: 92  },
  { x: 745.6,  y: 343, width: 42.5, height: 159 },
  { x: 832.5,  y: 277, width: 42.6, height: 225 },
  { x: 930.0,  y: 121, width: 46.7, height: 474 },
  { x: 1035.4, y: 344, width: 46.9, height: 158 },
  { x: 1128.9, y: 415, width: 39.9, height: 87  },
];
const MARK_FILLS = ['#224674', '#2D588F', '#386BAA', '#497FBF', '#6195CD', '#79ABDB'];
const mark = (width, fill) => ({
  type: 'svg',
  props: {
    width, height: Math.round(width * 500 / 580), viewBox: '440 110 580 500',
    children: { type: 'g', props: { transform: 'skewX(-22.49)', children: MARK_BARS.map((b, i) => ({ type: 'rect', props: { ...b, rx: 8, fill: fill || MARK_FILLS[i] } })) } },
  },
});

function banner() {
  return h('div', { width: W, height: H, display: 'flex', position: 'relative', backgroundColor: C.paper, overflow: 'hidden' },

    // (no watermark: satori silently dropped the absolutely-positioned oversized
    // mark in every variant tried on 2026-08-25 — clean paper it is)

    // grounding hairline along the bottom edge
    box({ position: 'absolute', left: 0, bottom: 0, width: W, height: 2, backgroundColor: C.hair }),

    // centered lockup + tagline
    col({ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
      row({ gap: 46 },
        mark(176),
        row({ alignItems: 'baseline' },
          txt({ fontFamily: SANS, fontWeight: 500, fontSize: 120, letterSpacing: -2.5, color: C.ink900 }, 'Ca'),
          txt({ fontFamily: SANS, fontWeight: 500, fontSize: 120, letterSpacing: -2.5, color: C.blue }, 'dence'),
        ),
      ),
      txt({ fontFamily: MONO, fontWeight: 500, fontSize: 30, letterSpacing: 13, color: C.ink500, marginTop: 30 }, 'KEEPING PACE WITH THE EVIDENCE'),
    ),

    // site, bottom-right corner
    txt({ position: 'absolute', right: 48, bottom: 26, fontFamily: MONO, fontWeight: 400, fontSize: 24, letterSpacing: 0.6, color: C.ink400 }, 'incadencept.com'),
  );
}

async function main() {
  const satori = (await import('satori')).default;
  const { Resvg } = require('@resvg/resvg-js');
  const ff = (f) => fs.readFileSync(path.join(FONT_DIR, f));
  const fonts = [
    { name: SANS, weight: 500, style: 'normal', data: ff('ibm-plex-sans-latin-500-normal.ttf') },
    { name: MONO, weight: 400, style: 'normal', data: ff('ibm-plex-mono-latin-400-normal.ttf') },
    { name: MONO, weight: 500, style: 'normal', data: ff('ibm-plex-mono-latin-500-normal.ttf') },
  ];
  const svg = await satori(banner(), { width: W, height: H, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
  const out = process.env.OUT || path.join(ROOT, 'design-system', 'assets', 'linkedin-banner.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, png);
  console.log(`✓ ${path.relative(ROOT, out)} (${W}×${H} — upload as Cadence PT page cover, displays at 1128×191)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
