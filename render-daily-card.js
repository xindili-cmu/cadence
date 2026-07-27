/* Render the Claude-Design daily LinkedIn card (2026-06-20) to a 1080x1350 PNG
 * via the repo's satori + resvg pipeline (no browser available in sandbox).
 * Layout mirrors uploads/Cadence-LinkedIn-2026-06-20.html. */
const fs = require('fs');
const path = require('path');

const REPO = '/sessions/clever-pensive-bell/mnt/healthcare future';
const FONT_DIR = path.join(REPO, 'vendor', 'fonts-ttf');
const OUT = process.env.OUT || '/sessions/clever-pensive-bell/mnt/outputs/Cadence-LinkedIn-2026-06-20.png';

const W = 1080, H = 1350;
const C = {
  bgL: '#3465A4', bgR: '#264E83', white: '#FFFFFF', light: '#93B8DE',
  sub: '#C9D8EC', rule: '#4A82BE', div: '#3A6296', scoreLab: '#6E93C2',
  signal: '#7FA3CC', journal: '#A9C2E0',
};
const SANS = 'IBM Plex Sans', SERIF = 'Spectral', MONO = 'IBM Plex Mono', CJK = 'Noto Serif CJK SC';

const h = (type, style, ...kids) => ({ type, props: { style, children: kids.length === 1 ? kids[0] : kids } });
const col = (style, ...kids) => h('div', { display: 'flex', flexDirection: 'column', ...style }, ...kids);
const row = (style, ...kids) => h('div', { display: 'flex', flexDirection: 'row', alignItems: 'center', ...style }, ...kids);
const txt = (style, s) => h('div', { display: 'flex', ...style }, String(s));

// Multi-color equalizer mark (matches the uploaded HTML fills + rx).
const BARS = [
  { x: 664.6, y: 410, width: 40.5, height: 92,  fill: '#93B8DE' },
  { x: 745.6, y: 343, width: 42.5, height: 159, fill: '#93B8DE' },
  { x: 832.5, y: 277, width: 42.6, height: 225, fill: '#C9D8EC' },
  { x: 930.0, y: 121, width: 46.7, height: 474, fill: '#FFFFFF' },
  { x: 1035.4, y: 344, width: 46.9, height: 158, fill: '#C9D8EC' },
  { x: 1128.9, y: 415, width: 39.9, height: 87,  fill: '#93B8DE' },
];
function mark(size) {
  return {
    type: 'svg',
    props: {
      width: size, height: Math.round(size * 508 / 580), viewBox: '446 107 580 508',
      children: {
        type: 'g',
        props: {
          transform: 'skewX(-22.5)',
          children: BARS.map(b => ({ type: 'rect', props: { ...b, rx: 6 } })),
        },
      },
    },
  };
}

const ITEMS = [
  { score: 75, size: 64, tag: '[ NEURO ]', title: 'Changes in Unimanual and Bimanual Upper Extremity Use During the Subacute Phase Post-Stroke (Supervised vs. Unsupervised Contexts)', journal: 'Neurorehabilitation and Neural Repair' },
  { score: 75, size: 64, tag: '[ NEURO ]', title: 'Sex and Gender Differences in Technology-Based Rehabilitation for People with Stroke: A Scoping Review', journal: 'Clinical Rehabilitation' },
  { score: 70, size: 58, tag: '[ SPORTS ]', title: 'Management of Labral Tears Associated with Glenohumeral Instability in Athletes', journal: 'Current Reviews in Musculoskeletal Medicine' },
  { score: 70, size: 58, tag: '[ MANUAL & MODALITY ]', title: 'Preventative Strategies for Non-Contact Lower-Limb Injuries in Male Football Players: A Scoping Review', journal: 'South African Journal of Physiotherapy' },
  { score: 65, size: 52, tag: '[ PRACTICE ]', title: 'Satendra Singh: Reframing Disability Through Advocacy', journal: 'The Lancet' },
];

function itemRow(it, i) {
  return row(
    { width: '100%', alignItems: 'flex-start', gap: 38, paddingTop: 18, paddingBottom: 18,
      borderTop: i === 0 ? 'none' : `1px solid ${C.div}` },
    // score block (right-aligned column)
    col({ width: 120, flexShrink: 0, alignItems: 'flex-end' },
      txt({ fontFamily: MONO, fontWeight: 500, fontSize: 12, letterSpacing: 2.6, color: C.scoreLab, marginBottom: 7 }, 'SIGNAL'),
      txt({ fontFamily: SERIF, fontWeight: 600, fontSize: it.size, lineHeight: 0.9, color: C.light }, String(it.score)),
    ),
    // content column
    col({ flexGrow: 1, flexShrink: 1 },
      txt({ fontFamily: MONO, fontWeight: 500, fontSize: 16, letterSpacing: 2.2, color: C.light }, it.tag),
      txt({ fontFamily: SANS, fontWeight: 500, fontSize: 24, lineHeight: 1.32, color: C.white, marginTop: 8 }, it.title),
      txt({ fontFamily: MONO, fontWeight: 400, fontSize: 15, color: C.journal, marginTop: 9 }, it.journal),
    ),
  );
}

function card() {
  return col(
    { width: W, height: H, paddingTop: 72, paddingBottom: 72, paddingLeft: 80, paddingRight: 80,
      backgroundImage: `linear-gradient(105deg, ${C.bgL}, ${C.bgR})` },
    // header
    row({ justifyContent: 'space-between', width: '100%', marginBottom: 32 },
      txt({ fontFamily: MONO, fontWeight: 400, fontSize: 18, letterSpacing: 3.6, color: C.sub }, 'DAILY EVIDENCE · 2026-06-20'),
      mark(48),
    ),
    // headline
    txt({ fontFamily: SERIF, fontWeight: 600, fontSize: 60, lineHeight: 1.12, letterSpacing: -0.5, color: C.white, width: '100%' },
      'Stroke Rehab: Subacute Limb-Use Changes & Gender Gaps in Tech-Assisted Rehab'),
    // signal rule
    row({ width: '100%', gap: 18, marginTop: 30, marginBottom: 8 },
      txt({ fontFamily: MONO, fontWeight: 400, fontSize: 15, letterSpacing: 3, color: C.signal }, 'SIGNAL  ↓'),
      h('div', { display: 'flex', flexGrow: 1, height: 1, backgroundColor: C.div }),
    ),
    // items
    col({ flexGrow: 1, justifyContent: 'center', width: '100%' }, ...ITEMS.map(itemRow)),
    // footer
    row({ justifyContent: 'space-between', width: '100%', paddingTop: 28, marginTop: 6, borderTop: `2px solid ${C.rule}` },
      row({ alignItems: 'center', gap: 16 },
        mark(40),
        row({ alignItems: 'baseline' },
          txt({ fontFamily: SANS, fontWeight: 600, fontSize: 30, letterSpacing: -0.5, color: C.white }, 'Ca'),
          txt({ fontFamily: SANS, fontWeight: 600, fontSize: 30, letterSpacing: -0.5, color: C.light }, 'dence'),
          txt({ fontFamily: CJK, fontWeight: 400, fontSize: 23, color: C.sub, marginLeft: 12 }, '步频'),
        ),
      ),
      txt({ fontFamily: MONO, fontWeight: 400, fontSize: 18, letterSpacing: 2.5, color: C.sub }, 'incadencept.com'),
    ),
  );
}

async function main() {
  const satori = (await import('satori')).default;
  const { Resvg } = require('@resvg/resvg-js');
  const ff = (p) => fs.readFileSync(p);
  const v = (f) => ff(path.join(FONT_DIR, f));
  const fonts = [
    { name: SANS,  weight: 500, style: 'normal', data: v('ibm-plex-sans-latin-500-normal.ttf') },
    { name: SANS,  weight: 600, style: 'normal', data: v('ibm-plex-sans-latin-600-normal.ttf') },
    { name: MONO,  weight: 400, style: 'normal', data: v('ibm-plex-mono-latin-400-normal.ttf') },
    { name: MONO,  weight: 500, style: 'normal', data: v('ibm-plex-mono-latin-500-normal.ttf') },
    // Spectral vendor ttf only ships 500; map 600 to it (no faux-bold in satori).
    { name: SERIF, weight: 500, style: 'normal', data: v('spectral-latin-500-normal.ttf') },
    { name: SERIF, weight: 600, style: 'normal', data: v('spectral-latin-500-normal.ttf') },
    // 步频 — subset of Noto Serif CJK SC (LXGW WenKai unavailable offline).
    { name: CJK,   weight: 400, style: 'normal', data: ff('/sessions/clever-pensive-bell/mnt/outputs/fonts/cadence-bupin.ttf') },
    // Fallback for the ↓ arrow glyph.
    { name: 'DejaVu Sans', weight: 400, style: 'normal', data: ff('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf') },
  ];
  const svg = await satori(card(), { width: W, height: H, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, png);
  console.log('✓ wrote', OUT, `(${W}x${H})`);
}
main().catch(e => { console.error(e); process.exit(1); });
