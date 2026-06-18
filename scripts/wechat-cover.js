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

const h = (type, style, ...kids) => ({ type, props: { style, children: kids.length === 1 ? kids[0] : kids } });
const col = (style, ...kids) => h('div', { display: 'flex', flexDirection: 'column', ...style }, ...kids);
const row = (style, ...kids) => h('div', { display: 'flex', flexDirection: 'row', alignItems: 'center', ...style }, ...kids);
const txt = (style, s) => h('div', { display: 'flex', ...style }, String(s));
const chip = (s) => h('div', { display: 'flex', padding: '8px 20px', borderRadius: 10, backgroundColor: C.blue100 },
  txt({ fontFamily: SANS, fontWeight: 500, fontSize: 26, color: C.blue700 }, s));

// Headline now carries the day's actual hook (the issue title). satori has no
// auto-shrink, so pick a font size by length and cap to ~2 lines; drop the
// leading date (the eyebrow already shows it).
const CONTENT_W = W - 88 * 2; // inner width after horizontal padding
function fitHeadline(raw) {
  let s = String(raw || '').replace(/^\s*\d{1,2}[.\-/]\d{1,2}\s*/, '').trim();
  if (!s) s = '今日康复信号';
  const size = s.length <= 9 ? 92 : s.length <= 16 ? 70 : s.length <= 26 ? 56 : 48;
  const perLine = Math.floor(CONTENT_W / (size * 1.02));
  const maxChars = perLine * 2; // at most two lines
  if (s.length > maxChars) s = s.slice(0, maxChars - 1).trim() + '…';
  return { text: s, size };
}

function cover({ headline, eyebrow }) {
  const fh = fitHeadline(headline);
  return col({ width: W, height: H, backgroundColor: C.paper, padding: '64px 88px', justifyContent: 'space-between' },
    row({ justifyContent: 'space-between', alignItems: 'center', width: '100%' },
      row({ alignItems: 'center', gap: 16 },
        h('div', { display: 'flex', width: 10, height: 40, borderRadius: 4, backgroundColor: C.blue700 }),
        txt({ fontFamily: SANS, fontWeight: 700, fontSize: 34, color: C.ink900, letterSpacing: 2 }, '步频 Cadence'),
      ),
      txt({ fontFamily: SANS, fontWeight: 500, fontSize: 24, color: C.ink500, letterSpacing: 6 }, 'Evidence in motion'),
    ),
    col({ gap: 22 },
      txt({ fontFamily: SANS, fontWeight: 700, fontSize: 27, color: C.blue700, letterSpacing: 10 }, eyebrow),
      txt({ fontFamily: SERIF, fontWeight: 700, fontSize: fh.size, color: C.ink900, lineHeight: 1.2, maxWidth: CONTENT_W, flexWrap: 'wrap' }, fh.text),
    ),
    row({ gap: 16 }, chip('强信号优先'), chip('临床 PT 速读'), chip('中 · EN 双语')),
  );
}

async function renderCover({ headline = '近期康复高分文献', out, eyebrow = '近期高分文献 · TOP 8' } = {}) {
  if (!out) throw new Error('renderCover: out path required');
  const satori = (await import('satori')).default;
  const { Resvg } = require('@resvg/resvg-js');
  const fontFile = (pkg, f) => fs.readFileSync(require.resolve(`@expo-google-fonts/${pkg}/${f}`));
  const fonts = [
    { name: SANS, weight: 500, style: 'normal', data: fontFile('noto-sans-sc', '500Medium/NotoSansSC_500Medium.ttf') },
    { name: SANS, weight: 700, style: 'normal', data: fontFile('noto-sans-sc', '700Bold/NotoSansSC_700Bold.ttf') },
    { name: SERIF, weight: 700, style: 'normal', data: fontFile('noto-serif-sc', '700Bold/NotoSerifSC_700Bold.ttf') },
  ];
  const svg = await satori(cover({ headline, eyebrow }), { width: W, height: H, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, png);
  return out;
}

module.exports = { renderCover, W, H };

if (require.main === module) {
  const headline = process.argv[2] || '近期康复高分文献';
  const out = process.argv[3] || path.join(__dirname, '..', 'briefs', 'wechat-cover.png');
  const eyebrow = process.argv[4] || '近期高分文献 · TOP 8';
  renderCover({ headline, out, eyebrow })
    .then((o) => console.log(`✓ ${path.relative(path.join(__dirname, '..'), o)} (${W}×${H})`))
    .catch((e) => { console.error(e); process.exit(1); });
}
