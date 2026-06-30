/*
 * Cadence 步频 — 公众号封面生成器 (2.35:1, WeChat 大图封面比例)
 *
 * Renders a branded banner at 1410×600 (= 2.35:1) for the WeChat Official
 * Account article cover. Same satori + resvg + Noto fonts + brand tokens as
 * scripts/xhs-digest.js, so the look matches the rest of the system.
 *
 * Used two ways:
 *   - CLI:    node scripts/wechat-cover.js [headline] [out.png] [eyebrow]
 *   - Module: const { renderCover } = require('./wechat-cover.js');
 *             await renderCover({ headline, eyebrow, out });
 *             (wechat-brief.js calls this so every daily issue gets a cover)
 */
const fs = require('fs');
const path = require('path');

const W = 1410, H = 600; // 2.35:1
const C = {
  paper: '#F7F9FB',
  ink900: '#16202B', ink600: '#4D5965', ink500: '#64717F', ink200: '#DFE5EA',
  blue700: '#2C5A96', blue100: '#E2EDF8',
};
const SANS = 'Noto Sans SC', SERIF = 'Noto Serif SC';

// ── Weekly accent rotation ────────────────────────────────────────────────
// Layout, type, and masthead never change; only the accent (left bar / eyebrow
// / chips) rotates by continuous week number so each publish-week (Tue–Sat)
// shares one color and the change lands at the week boundary. 6-theme curated
// palette, all muted/clinical; each `accent` clears AA-large contrast on the
// near-white paper, each `tint` is its matched chip background.
const THEMES = [
  { key: 'blue',   name: '学术蓝', accent: '#2C5A96', tint: '#E2EDF8' },
  { key: 'pine',   name: '墨绿',   accent: '#2F6A5B', tint: '#DCEAE4' },
  { key: 'terra',  name: '赭橙',   accent: '#A65B36', tint: '#F4E7DD' },
  { key: 'indigo', name: '靛紫',   accent: '#534B8C', tint: '#E8E5F2' },
  { key: 'brick',  name: '砖红',   accent: '#9A4444', tint: '#F1E2E2' },
  { key: 'teal',   name: '深青',   accent: '#1F6B73', tint: '#DAEAEC' },
];
// Continuous week count from the rotation-start Monday (2026-06-29). Week 0 is
// that week → THEMES[0] (blue), so "this week stays blue, rotation starts next
// week". UTC-based so it never drifts by timezone or resets at year boundaries.
function weekIndex(date) {
  const anchor = Date.UTC(2026, 5, 29);
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((day - anchor) / (7 * 86400000));
}
function parseDate(v) {
  if (v instanceof Date && !isNaN(v)) return v;
  const m = String(v || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}
// Pick the week's theme. Priority: explicit themeKey → date → date parsed from
// the out filename (briefs/YYYY-MM-DD-cover.png) → today. So existing callers
// that pass only { headline, eyebrow, out } get weekly colors with no change.
function pickTheme({ themeKey, date, out } = {}) {
  if (themeKey) {
    const t = THEMES.find((t) => t.key === themeKey);
    if (t) return t;
  }
  const d = parseDate(date) || parseDate(out) || new Date();
  const i = ((weekIndex(d) % THEMES.length) + THEMES.length) % THEMES.length;
  return THEMES[i];
}

const h = (type, style, ...kids) => ({ type, props: { style, children: kids.length === 1 ? kids[0] : kids } });
const col = (style, ...kids) => h('div', { display: 'flex', flexDirection: 'column', ...style }, ...kids);
const row = (style, ...kids) => h('div', { display: 'flex', flexDirection: 'row', alignItems: 'center', ...style }, ...kids);
const txt = (style, s) => h('div', { display: 'flex', ...style }, String(s));
const chip = (theme, s) => h('div', { display: 'flex', padding: '8px 20px', borderRadius: 10, backgroundColor: theme.tint },
  txt({ fontFamily: SANS, fontWeight: 500, fontSize: 26, color: theme.accent }, s));

// Headline now carries the day's actual hook (the issue title). satori has no
// auto-shrink, so pick a font size by length and cap to ~2 lines; drop the date
// the eyebrow already shows — whether it leads the title or trails in parens.
const CONTENT_W = W - 88 * 2; // inner width after horizontal padding
function fitHeadline(raw) {
  let s = String(raw || '')
    .replace(/^\s*\d{1,2}[.\-/]\d{1,2}\s*/, '')                 // leading date: 6.18 …
    .replace(/\s*[（(]\s*\d{1,2}[.\-/]\d{1,2}\s*[）)]\s*$/, '')  // trailing date: …（6.18）
    .trim();
  if (!s) s = '今日康复信号';
  const size = s.length <= 9 ? 92 : s.length <= 16 ? 70 : s.length <= 26 ? 56 : 48;
  const perLine = Math.floor(CONTENT_W / (size * 1.02));
  const maxChars = perLine * 2; // at most two lines
  if (s.length > maxChars) s = s.slice(0, maxChars - 1).trim() + '…';
  return { text: s, size };
}

function cover({ headline, eyebrow, theme = THEMES[0] }) {
  const fh = fitHeadline(headline);
  return col({ width: W, height: H, backgroundColor: C.paper, padding: '64px 88px', justifyContent: 'space-between' },
    row({ justifyContent: 'space-between', alignItems: 'center', width: '100%' },
      row({ alignItems: 'center', gap: 16 },
        h('div', { display: 'flex', width: 10, height: 40, borderRadius: 4, backgroundColor: theme.accent }),
        txt({ fontFamily: SANS, fontWeight: 700, fontSize: 34, color: C.ink900, letterSpacing: 2 }, '步频 Cadence'),
      ),
      txt({ fontFamily: SANS, fontWeight: 500, fontSize: 24, color: C.ink500, letterSpacing: 6 }, 'Evidence in motion'),
    ),
    col({ gap: 22 },
      txt({ fontFamily: SANS, fontWeight: 700, fontSize: 27, color: theme.accent, letterSpacing: 10 }, eyebrow),
      txt({ fontFamily: SERIF, fontWeight: 700, fontSize: fh.size, color: C.ink900, lineHeight: 1.2, maxWidth: CONTENT_W, flexWrap: 'wrap' }, fh.text),
    ),
    row({ gap: 16 }, chip(theme, '强信号优先'), chip(theme, '临床 PT 速读'), chip(theme, '中 · EN 双语')),
  );
}

async function loadFonts() {
  const fontFile = (pkg, f) => fs.readFileSync(require.resolve(`@expo-google-fonts/${pkg}/${f}`));
  return [
    { name: SANS, weight: 500, style: 'normal', data: fontFile('noto-sans-sc', '500Medium/NotoSansSC_500Medium.ttf') },
    { name: SANS, weight: 700, style: 'normal', data: fontFile('noto-sans-sc', '700Bold/NotoSansSC_700Bold.ttf') },
    { name: SERIF, weight: 700, style: 'normal', data: fontFile('noto-serif-sc', '700Bold/NotoSerifSC_700Bold.ttf') },
  ];
}

// SVG only (pure JS) — used by renderCover and by preview tooling that cannot
// run the native resvg binary (e.g. a Linux sandbox holding Mac binaries).
async function buildCoverSVG({ headline = '近期康复高分文献', eyebrow = '近期高分文献 · TOP 8', theme = THEMES[0] } = {}) {
  const satori = (await import('satori')).default;
  const fonts = await loadFonts();
  return satori(cover({ headline, eyebrow, theme }), { width: W, height: H, fonts });
}

async function renderCover({ headline = '近期康复高分文献', out, eyebrow = '近期高分文献 · TOP 8', themeKey, date } = {}) {
  if (!out) throw new Error('renderCover: out path required');
  const theme = pickTheme({ themeKey, date, out });
  const svg = await buildCoverSVG({ headline, eyebrow, theme });
  const { Resvg } = require('@resvg/resvg-js');
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, png);
  return out;
}

module.exports = { renderCover, buildCoverSVG, pickTheme, THEMES, W, H };

if (require.main === module) {
  const headline = process.argv[2] || '近期康复高分文献';
  const out = process.argv[3] || path.join(__dirname, '..', 'briefs', 'wechat-cover.png');
  const eyebrow = process.argv[4] || '近期高分文献 · TOP 8';
  const themeKey = process.argv[5] || process.env.COVER_THEME; // optional: pin a theme key
  renderCover({ headline, out, eyebrow, themeKey })
    .then((o) => console.log(`✓ ${path.relative(path.join(__dirname, '..'), o)} (${W}×${H}) [theme=${pickTheme({ themeKey, out }).key}]`))
    .catch((e) => { console.error(e); process.exit(1); });
}
