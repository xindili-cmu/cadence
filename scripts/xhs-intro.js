/**
 * Cadence 步频 — 小红书「开号介绍」图卡生成器
 *
 * One-off brand-intro card set for XHS, reusing the daily digest's satori/resvg
 * renderer, brand tokens and pageShell so it stays visually identical to the
 * daily 步频日报 cards. No LLM call: every line is sourced from the launch issue
 * (briefs/wechat-launch-issue01.md), the publishing runbook (PUBLISHING.md) and
 * journals.json — nothing invented.
 *
 * Output (xhs/intro/):
 *   cover.png            3:4 封面，钩子文案
 *   01.png               我们做什么
 *   02.png               谁该关注
 *   03.png               和别的号有什么不一样
 *   04.png               更新节奏
 *   05.png               尾页：关注引导
 *   caption.txt          小红书标题 + 正文 + 话题标签
 *
 * Usage: node scripts/xhs-intro.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.env.CADENCE_ROOT || path.join(__dirname, '..');
const OUT_ROOT = process.env.XHS_OUT || path.join(ROOT, 'xhs');

const W = 1242, H = 1656;

// ── Brand tokens (mirrors scripts/xhs-digest.js) ────────────────────────────
const C = {
  paper: '#F7F9FB', white: '#FFFFFF',
  ink900: '#16202B', ink600: '#4D5965', ink500: '#64717F', ink200: '#DFE5EA', ink50: '#F4F7FA',
  blue700: '#2C5A96', blue100: '#E2EDF8', blue50: '#F2F7FC',
};

const SANS = 'Noto Sans SC', SERIF = 'Noto Serif SC';

// ── satori element helpers ──────────────────────────────────────────────────
const h = (type, style, ...children) => ({
  type,
  props: { style, children: children.length === 1 ? children[0] : children },
});
const row = (style, ...kids) => h('div', { display: 'flex', flexDirection: 'row', alignItems: 'center', ...style }, ...kids);
const col = (style, ...kids) => h('div', { display: 'flex', flexDirection: 'column', ...style }, ...kids);
const txt = (style, s) => h('div', { display: 'flex', ...style }, String(s));

// Shared page chrome — identical to the daily cards.
function pageShell(footerRight, ...body) {
  return col({ width: W, height: H, backgroundColor: C.paper, padding: '72px 84px 60px', justifyContent: 'space-between' },
    col({ flex: 1, width: '100%' },
      row({ justifyContent: 'space-between', marginBottom: 56 },
        row({ gap: 14 },
          h('div', { display: 'flex', width: 16, height: 16, borderRadius: 99, backgroundColor: C.blue700 }),
          txt({ fontFamily: SANS, fontWeight: 700, fontSize: 30, letterSpacing: 2, color: C.ink900 }, 'CADENCE 步频'),
        ),
        txt({ fontFamily: SANS, fontWeight: 500, fontSize: 26, color: C.ink500, letterSpacing: 4 }, '关于我们'),
      ),
      ...body,
    ),
    col({ width: '100%' },
      h('div', { display: 'flex', width: '100%', height: 2, backgroundColor: C.ink200, marginBottom: 26 }),
      row({ justifyContent: 'space-between' },
        txt({ fontFamily: SANS, fontSize: 24, color: C.ink500 }, 'AI 评分策展 · 每日更新'),
        txt({ fontFamily: SANS, fontWeight: 500, fontSize: 24, color: C.ink500 }, footerRight),
      ),
    ),
  );
}

// A reusable "labelled block" with the blue left rule (matches 为什么重要 block).
function ruleBlock(label, ...lines) {
  return row({ width: '100%', alignItems: 'stretch', marginBottom: 0 },
    h('div', { display: 'flex', width: 6, borderRadius: 99, backgroundColor: C.blue700, marginRight: 26 }),
    col({ flex: 1, gap: 14, padding: '4px 0' },
      txt({ fontFamily: SANS, fontWeight: 700, fontSize: 26, letterSpacing: 4, color: C.blue700 }, label),
      ...lines,
    ),
  );
}
const bodyLine = (s, mb = 0) => txt({ fontFamily: SANS, fontSize: 31, lineHeight: 1.74, color: C.ink600, marginBottom: mb }, s);

// ── Cards ───────────────────────────────────────────────────────────────────

// 封面：钩子
function coverCard() {
  return pageShell('认识一下',
    col({ flex: 1, justifyContent: 'center' },
      txt({ fontFamily: SANS, fontWeight: 700, fontSize: 30, color: C.blue700, letterSpacing: 8, marginBottom: 40 }, '康复 / 物理治疗 文献精选'),
      col({ marginBottom: 44 },
        txt({ fontFamily: SERIF, fontWeight: 700, fontSize: 88, lineHeight: 1.36, color: C.ink900 }, '每天几分钟,'),
        txt({ fontFamily: SERIF, fontWeight: 700, fontSize: 88, lineHeight: 1.36, color: C.ink900 }, '帮你筛掉康复'),
        txt({ fontFamily: SERIF, fontWeight: 700, fontSize: 88, lineHeight: 1.36, color: C.ink900 }, '文献里的噪音'),
      ),
      row({ gap: 16, marginBottom: 56 },
        h('div', { display: 'flex', padding: '8px 22px', borderRadius: 10, backgroundColor: C.blue100 },
          txt({ fontFamily: SANS, fontWeight: 700, fontSize: 27, color: C.blue700 }, '每日更新')),
        h('div', { display: 'flex', padding: '8px 22px', borderRadius: 10, backgroundColor: C.ink50, border: `1px solid ${C.ink200}` },
          txt({ fontFamily: SANS, fontWeight: 500, fontSize: 27, color: C.ink600 }, '面向同行 · 不面向患者')),
      ),
      h('div', { display: 'flex', width: 72, height: 3, backgroundColor: C.ink200, marginBottom: 44 }),
      txt({ fontFamily: SANS, fontWeight: 500, fontSize: 33, lineHeight: 1.6, color: C.ink600 }, '我是 Cadence 步频，往后翻认识一下 →'),
    ),
  );
}

// 01 我们做什么
function whatCard() {
  return pageShell('1 / 4',
    col({ flex: 1 },
      txt({ fontFamily: SANS, fontWeight: 700, fontSize: 30, color: C.blue700, letterSpacing: 8, marginBottom: 36 }, '我们做什么'),
      col({ flex: 1, justifyContent: 'center', gap: 48 },
        txt({ fontFamily: SERIF, fontWeight: 700, fontSize: 52, lineHeight: 1.5, color: C.ink900 },
          '每天有上百篇康复、物理治疗相关研究上线，绝大多数和你的临床或科研没关系。'),
        ruleBlock('每天做的事',
          bodyLine('从 JOSPT、PTJ、BJSM、Lancet、PubMed 等来源抓取新文献'),
          bodyLine('机器初筛 + 人工复核打分'),
          bodyLine('每天给你留下最值得读的几篇'),
        ),
      ),
    ),
  );
}

// 02 谁该关注
function whoCard() {
  const who = (a, b) => col({ gap: 6, flex: 1 },
    txt({ fontFamily: SANS, fontWeight: 700, fontSize: 34, color: C.ink900 }, a),
    txt({ fontFamily: SANS, fontSize: 27, lineHeight: 1.5, color: C.ink500 }, b),
  );
  const whoRow = (l, r) => row({ gap: 28, alignItems: 'flex-start', width: '100%' }, who(l[0], l[1]), who(r[0], r[1]));
  return pageShell('2 / 4',
    col({ flex: 1 },
      txt({ fontFamily: SANS, fontWeight: 700, fontSize: 30, color: C.blue700, letterSpacing: 8, marginBottom: 32 }, '谁该关注'),
      col({ flex: 1, justifyContent: 'center', gap: 34 },
        txt({ fontFamily: SERIF, fontWeight: 700, fontSize: 48, lineHeight: 1.44, color: C.ink900 },
          '只要你的工作和康复、运动、身体功能有关，这里都有你要的循证更新。'),
        col({ gap: 26 },
          whoRow(['康复治疗师', '物理治疗 / 作业治疗 / 言语 / 物理因子'], ['康复 / 康复科医师', '骨科、神经、疼痛、老年等临床同行']),
          whoRow(['运动康复与运动医学', '运动表现、损伤防护、术后回归'], ['健身与体能教练', '私教、运动表现、损伤防护']),
          whoRow(['手法与传统康复', '手法治疗、推拿、物理因子'], ['康复科研 / 高校师生', '循证、Meta 分析、教学']),
        ),
        ruleBlock('覆盖范围',
          bodyLine('选题横跨骨科肌骨 / 神经 / 运动 / 儿童 / 老年 / 心肺 / 手法理疗 / 行业执业，循证进展覆盖美国、中国、澳大利亚'),
        ),
        h('div', { display: 'flex', padding: '16px 30px', borderRadius: 14, backgroundColor: C.blue50, border: `1px solid ${C.ink200}` },
          txt({ fontFamily: SANS, fontWeight: 500, fontSize: 28, lineHeight: 1.5, color: C.ink600 },
            '面向同行、不面向患者 —— 给专业人士看的内容'),
        ),
      ),
    ),
  );
}

// 03 差异化
function diffCard() {
  return pageShell('3 / 4',
    col({ flex: 1 },
      txt({ fontFamily: SANS, fontWeight: 700, fontSize: 30, color: C.blue700, letterSpacing: 8, marginBottom: 36 }, '有什么不一样'),
      col({ flex: 1, justifyContent: 'center', gap: 40 },
        ruleBlock('每篇都给你三件事',
          bodyLine('中文标题 + 解读 + 来源'),
          bodyLine('一句「为什么重要」，直接对接临床或科研'),
        ),
        ruleBlock('信号分三档，一眼分轻重',
          bodyLine('AI 给每篇打分后换算成：强信号（90 分以上）'),
          bodyLine('值得读（80–89）· 参考（65–79）'),
        ),
        ruleBlock('监测范围',
          bodyLine('持续监测 36+ 本 PT / 康复期刊，期刊库仍在扩充'),
        ),
      ),
    ),
  );
}

// 04 更新节奏
function cadenceCard() {
  const item = (k, v) => row({ gap: 24, alignItems: 'flex-start', marginBottom: 4 },
    h('div', { display: 'flex', padding: '8px 22px', borderRadius: 10, backgroundColor: C.blue100, marginTop: 4 },
      txt({ fontFamily: SANS, fontWeight: 700, fontSize: 28, color: C.blue700 }, k)),
    txt({ fontFamily: SANS, fontSize: 32, lineHeight: 1.6, color: C.ink600, flex: 1 }, v),
  );
  return pageShell('4 / 4',
    col({ flex: 1 },
      txt({ fontFamily: SANS, fontWeight: 700, fontSize: 30, color: C.blue700, letterSpacing: 8, marginBottom: 36 }, '更新节奏'),
      col({ flex: 1, justifyContent: 'center', gap: 40 },
        item('每天', '一篇「文献速递」：当日精选，中文标题 + 解读 + 来源'),
        item('每月', '一篇「深度专题」，展开一个争议或热点'),
        item('月末', '一期「月度榜单」'),
        h('div', { display: 'flex', width: '100%', height: 2, backgroundColor: C.ink200, marginTop: 12, marginBottom: 12 }),
        txt({ fontFamily: SANS, fontSize: 31, lineHeight: 1.74, color: C.ink600 },
          '想随时按专科筛选、读双语摘要？全部条目在配套网站，主页有入口。'),
      ),
    ),
  );
}

// 05 尾页：关注引导
function endCard() {
  return pageShell('关注我们',
    col({ flex: 1, justifyContent: 'center' },
      txt({ fontFamily: SANS, fontWeight: 700, fontSize: 30, color: C.blue700, letterSpacing: 8, marginBottom: 44 }, '每天一篇，只挑值得读的'),
      col({ marginBottom: 56 },
        txt({ fontFamily: SERIF, fontWeight: 700, fontSize: 84, lineHeight: 1.4, color: C.ink900 }, '帮你省下'),
        txt({ fontFamily: SERIF, fontWeight: 700, fontSize: 84, lineHeight: 1.4, color: C.ink900 }, '找文献的时间'),
      ),
      txt({ fontFamily: SANS, fontSize: 31, lineHeight: 1.74, color: C.ink600, marginBottom: 64 },
        '如果有一篇帮你省下了找文献的时间，那这个号就值得你关注。'),
      col({ padding: '36px 40px', borderRadius: 16, backgroundColor: C.blue50, border: `1px solid ${C.ink200}`, gap: 14 },
        txt({ fontFamily: SANS, fontWeight: 700, fontSize: 32, color: C.ink900 }, '关注 @Cadence步频，每天跟上新证据'),
        txt({ fontFamily: SANS, fontSize: 28, lineHeight: 1.6, color: C.ink600 }, '公众号同名「Cadence步频」，同步日更'),
      ),
    ),
  );
}

// ── Caption ──────────────────────────────────────────────────────────────────
function buildCaption() {
  const title = '每天几分钟，帮你筛掉康复文献里的噪音｜Cadence 步频开号';
  const body = [
    '每天有上百篇康复、物理治疗相关的研究上线，绝大多数和你的临床或科研没关系。',
    'Cadence 步频做的事很简单：每天从 JOSPT、PTJ、BJSM、Lancet、PubMed 等来源抓取新文献，机器初筛 + 人工复核打分，每天给你留下最值得读的几篇。👇',
    '',
    '🩺 谁该关注：只要你的工作和康复、运动、身体功能有关，这里都有你要的循证更新——康复治疗师（物理治疗 / 作业治疗 / 言语 / 物理因子）、康复与康复科医师、运动康复与运动医学从业者、健身与体能教练、手法与传统康复（手法治疗 / 推拿 / 物理因子）、康复科研人员与高校师生，以及关注循证的骨科 / 神经 / 疼痛 / 老年 / 儿童 / 护理养老等方向同行。选题横跨骨科肌骨、神经、运动、儿童、老年、心肺、手法理疗、行业执业，循证进展覆盖美国、中国、澳大利亚。面向同行、不面向患者。',
    '',
    '📌 每篇都给你：中文标题 + 解读 + 来源，再加一句「为什么重要」。信号分换算成三档——强信号（90 分以上）· 值得读（80–89）· 参考（65–79），一眼分轻重。',
    '',
    '🗓 更新节奏：每天一篇「文献速递」；每月一篇「深度专题」展开一个争议或热点；月末一期「月度榜单」。想按专科筛选、读双语摘要，全部条目在配套网站，主页有入口。',
    '',
    '关注 @Cadence步频，每天跟上新证据。公众号同名「Cadence步频」，同步日更。',
    '',
    '#康复 #物理治疗 #康复治疗师 #文献阅读 #康复医学 #循证医学 #PT #康复治疗',
  ].join('\n');
  return `${title}\n\n${body}\n`;
}

// ── Render ───────────────────────────────────────────────────────────────────
function fontFile(pkg, file) {
  return fs.readFileSync(require.resolve(`@expo-google-fonts/${pkg}/${file}`));
}

async function main() {
  const satori = (await import('satori')).default;
  const { Resvg } = require('@resvg/resvg-js');
  const fonts = [
    { name: SANS, weight: 400, style: 'normal', data: fontFile('noto-sans-sc', '400Regular/NotoSansSC_400Regular.ttf') },
    { name: SANS, weight: 500, style: 'normal', data: fontFile('noto-sans-sc', '500Medium/NotoSansSC_500Medium.ttf') },
    { name: SANS, weight: 700, style: 'normal', data: fontFile('noto-sans-sc', '700Bold/NotoSansSC_700Bold.ttf') },
    { name: SERIF, weight: 700, style: 'normal', data: fontFile('noto-serif-sc', '700Bold/NotoSerifSC_700Bold.ttf') },
  ];

  const outDir = path.join(OUT_ROOT, 'intro');
  fs.mkdirSync(outDir, { recursive: true });

  const render = async (el, file) => {
    const svg = await satori(el, { width: W, height: H, fonts });
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
    fs.writeFileSync(path.join(outDir, file), png);
    console.log(`  ✓ ${file} (${(png.length / 1024).toFixed(0)} KB)`);
  };

  console.log('\n📕 步频小红书开号介绍');
  await render(coverCard(), 'cover.png');
  await render(whatCard(), '01.png');
  await render(whoCard(), '02.png');
  await render(diffCard(), '03.png');
  await render(cadenceCard(), '04.png');
  await render(endCard(), '05.png');
  fs.writeFileSync(path.join(outDir, 'caption.txt'), buildCaption());
  console.log(`  ✓ caption.txt\n  → ${path.relative(ROOT, outDir)}/`);
}

main().catch((err) => { console.error(err); process.exit(1); });
