// pipeline-gates 测试 —— 纯 node，无框架。运行：node scripts/pipeline-gates.test.js
//
// 覆盖 2026-07-28 复查修掉的三个入库缺陷。每段都带「判别力」断言：把旧实现
// 精确复刻一份，断言「旧的漏 ∧ 新的接住」——若有人把修复回退，右半立刻转红。
//
//   1. normalizeTitle 的 ' | 刊名' 尾巴：旧的 40 字符上限放走了长刊名
//   2. journal 字段：非 PubMed 的 roster 刊只有 source 短名，journal 一直是空
//   3. repairMissingFields：模型漏 summary/titleZh/summaryZh 时重填，兜不住就丢

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  normalizeTitle,
  ROSTER_JOURNAL_BY_NAME,
  repairMissingFields,
  isJunkItem,
} = require('./news-refresh');

let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); console.log('  ✓', msg); passed++; };

// 旧实现的精确复刻 —— 仅用于证明本测试有判别力。
const legacyPipeStrip = (t) => {
  const pi = t.lastIndexOf(' | ');
  if (pi >= 20 && t.slice(pi + 3).trim().length <= 40) return t.slice(0, pi).trim();
  return t;
};

// 2026-07-28 线上 news.json 里真实带尾巴的 8 行，取其两种刊名（各 46 / 47 字符）。
const LIVE_JNER = 'Bypass neural interfaces for paralysis: clinical translation, challenges and future directions | Journal of NeuroEngineering and Rehabilitation';
const LIVE_BMC = 'Outcome indicators and effectiveness of nutrition education for athletes: a systematic review | BMC Sports Science, Medicine and Rehabilitation';

async function run() {
  console.log('A. normalizeTitle：刊名尾巴');
  {
    ok(!normalizeTitle(LIVE_JNER, { source: 'J NeuroEng Rehabil' }).includes(' | '),
      '剥掉 46 字符刊名尾（Journal of NeuroEngineering and Rehabilitation）');
    ok(!normalizeTitle(LIVE_BMC, { source: 'BMC Sports Sci Med Rehabil' }).includes(' | '),
      '剥掉 47 字符刊名尾（BMC Sports Science, Medicine and Rehabilitation）');
    ok(!normalizeTitle('ASM (Ambulatory Specialty Model) Frequently Asked Questions | CMS', { source: 'CMS' }).includes(' | '),
      '短尾巴（| CMS）仍然剥掉——不是回归');
  }

  console.log('B. 判别力（成对）：同一条真实脏标题，旧 40 上限留脏 ∧ 新的洗净');
  {
    for (const [label, raw, meta] of [
      ['J NeuroEng Rehabil', LIVE_JNER, { source: 'J NeuroEng Rehabil' }],
      ['BMC Sports Sci Med Rehabil', LIVE_BMC, { source: 'BMC Sports Sci Med Rehabil' }],
    ]) {
      ok(legacyPipeStrip(raw).includes(' | ') && !normalizeTitle(raw, meta).includes(' | '),
        `${label}：legacy 留脏 ∧ 新洗净`);
    }
  }

  console.log('C. 过剥防线：真实标题里的长尾巴不该被吃掉');
  {
    // 尾巴既不是 roster 名、又超过 70 字符 —— 必须原样保留。
    const longTail = 'Effect of dry needling on shoulder pain | a chapter-length discussion of methodological heterogeneity across the included trials';
    ok(normalizeTitle(longTail, { source: 'PubMed' }) === longTail,
      '非刊名的超长尾巴保持不动（不过剥）');
    ok(normalizeTitle('A | B', { source: 'PubMed' }) === 'A | B',
      'pi < 20 的短标题不动');
  }

  console.log('C2. 堆叠尾巴 / 前缀式出版商 / 纯 chrome 落地页');
  {
    // 抓取会把两层尾巴叠在一起（archive 里 5 行）——要一路剥干净。
    const stacked = 'Associations between nutritional risk indices and fall history in older adults: a retrospective cross-sectional study | BMC Geriatrics | Springer Nature Link';
    ok(!normalizeTitle(stacked, { source: 'BMC Geriatrics' }).includes(' | '),
      '堆叠的两层尾巴一次剥净（| BMC Geriatrics | Springer Nature Link）');

    // 镜像情形：出版商在前缀，真标题在右边。
    const prefixed = 'Frontiers | Spinal cord stimulation to manage autonomic dysfunction after spinal cord injury: a systematic review';
    ok(normalizeTitle(prefixed, { source: 'frontiersin.org' })
      === 'Spinal cord stimulation to manage autonomic dysfunction after spinal cord injury: a systematic review',
      '前缀式出版商（Frontiers | …）保留右边的真标题');
    ok(normalizeTitle('Knee OA | a 12-month randomised controlled trial of loaded exercise', { source: 'PubMed' })
      === 'Knee OA | a 12-month randomised controlled trial of loaded exercise',
      '左边不是已知出版商 → 不动（前缀规则不误伤）');

    // 整条标题只剩出版商/刊名 = 落地页，不是文章。
    ok(isJunkItem({ title: 'Sports Medicine | Springer Nature Link', source: 'Sports Medicine' }),
      '纯 chrome 标题判为 junk（刊主页而非论文）');
    ok(!isJunkItem({ title: 'Sports Medicine | a scoping review of load management', source: 'Sports Medicine' }),
      '带真内容的同源标题不判 junk（不误杀）');
  }

  console.log('D. journal 回落：roster 短名 → 真实刊名');
  {
    const expect = {
      'J NeuroEng Rehabil': 'Journal of NeuroEngineering and Rehabilitation',
      'BMC Geriatrics': 'BMC Geriatrics',
      'BMC Sports Sci Med Rehabil': 'BMC Sports Science, Medicine and Rehabilitation',
      'BMC Musculoskelet Disord': 'BMC Musculoskeletal Disorders',
    };
    for (const [short, full] of Object.entries(expect)) {
      ok(ROSTER_JOURNAL_BY_NAME.get(short) === full, `${short} → ${full}`);
    }
    ok(!ROSTER_JOURNAL_BY_NAME.has('CMS') && !ROSTER_JOURNAL_BY_NAME.has('APTA'),
      '监管机构 / 协会（kind ≠ journal）不给 journal 徽章');
  }

  console.log('E. repairMissingFields：重填 ∧ 兜不住就丢');
  {
    const items = [
      { index: 0, title: 'Early mobilisation after stroke', text: 'RCT of 240 patients…' },
      { index: 1, title: 'ASM FAQ', text: '# ASM\n\nPayment\n\n- General - Eligibility' },
    ];
    // stub 只补得回第 0 条；第 1 条（原始抓取残渣）返回空串 = 读不出内容。
    const stub = async () => JSON.stringify([
      { index: 0, summary: 'Early mobilisation improved 90-day mRS.', titleZh: '卒中后早期活动', summaryZh: '早期活动改善 90 天 mRS。' },
      { index: 1, summary: '', titleZh: '', summaryZh: '' },
    ]);
    const curated = [
      { index: 0, curatedScore: 80, curatedReason: '早期活动可以放心做' },
      { index: 1, curatedScore: 75, curatedReason: 'CMS 发布了 ASM 的 FAQ' },
    ];
    const out = await repairMissingFields(curated, items, stub);
    ok(out.length === 1 && out[0].index === 0, '补得回的留下、补不回的丢弃（2 → 1）');
    ok(out[0].summaryZh === '早期活动改善 90 天 mRS。', '重填写进了 summaryZh');

    // 全齐的输入必须原样返回，且一次 LLM 都不调用（省钱 + 幂等）。
    let called = 0;
    const complete = [{ index: 0, summary: 'x', titleZh: '中', summaryZh: '中文' }];
    const same = await repairMissingFields(complete, items, async () => { called++; return '[]'; });
    ok(same.length === 1 && called === 0, '字段齐全时直接返回，不调用 LLM');
  }

  console.log('F. 落库不变量：roster 期刊源的条目必须带 journal');
  {
    // 为什么 D 段不够：D 只证明「映射表本身是对的」。2026-08-02 的教训恰恰是
    // 表是对的、回落代码也写好了、注释还很详尽 —— 但那次修复从没提交，CI 跑的
    // HEAD 里 ROSTER_JOURNAL_BY_NAME 出现 0 次，于是 cron 连灌五天空 journal，
    // 实时 news.json 29/75 受影响，而 D 段一路全绿。单元断言看不见「写了没上线」。
    //
    // 所以这里改为对产物下断言。代价是有约一天的检测延迟（回退后要等下一次 cron
    // 重建 news.json 才转红），换来的是能抓住整类「逻辑正确但没生效」的故障：
    // 修复被回退、修复没上线、新增期刊源忘了配 journalName。
    //
    // 影响面不止 IF 徽章：单刊上限的计数键是 journal || source，journal 一空就
    // 退化成短名，同一本刊裂成两个桶（当时 BJSM 全名×48 + BJSM×24，共 12 本刊
    // 绕过上限）。所以这条断言守的是选稿层，不是装饰层。
    //
    // 作用域开关（SKIP_ARTIFACT_ASSERTS）：这条断言的对象是 news.json 的数据状态，
    // 与「前端构建对不对」无关。build-app.yml 由 jsx/css 改动触发，让它因为一个数据
    // 问题而拒绝构建，会挡住与该问题无关的前端改动 —— 包括可能正是用来修这个问题的
    // 那次前端改动。门禁只该拦它所在那条路上的风险，所以 build-app 走 `npm run
    // test:code` 跳过这半条。cron 走 `npm test`，照跑不误。
    //
    // 拆法刻意是「默认包含、显式排除」：新写的断言自动进 npm test 并被所有 cron 消费，
    // 只有像本段这样明确依赖产物的才手动挂开关。反过来做（默认排除）会立刻重现
    // 「写好了没接上」那类故障。
    const NEWS = path.join(__dirname, '..', 'news.json');
    if (process.env.SKIP_ARTIFACT_ASSERTS) {
      console.log('  ⊘ SKIP_ARTIFACT_ASSERTS=1 —— 跳过 news.json 产物断言（下面 sources.json 那条照跑）');
    } else if (!fs.existsSync(NEWS)) {
      console.log('  ⊘ news.json 不存在（fresh clone），跳过产物断言');
    } else {
      const items = JSON.parse(fs.readFileSync(NEWS, 'utf8')).items || [];
      const leaked = items.filter((i) => !i.journal && ROSTER_JOURNAL_BY_NAME.has(i.source));
      const who = [...new Set(leaked.map((i) => i.source))].slice(0, 6).join(', ');
      ok(leaked.length === 0,
        `news.json ${items.length} 条里没有「roster 刊源却缺 journal」的条目`
        + (leaked.length ? ` —— 漏 ${leaked.length} 条：${who}（回落是不是又没上线？）` : ''));
    }

    // 零延迟的那一半：新增期刊源忘了配 journalName，短名就永远回落不到全名。
    // 这条在提交当下就会红，不用等 cron。
    const SOURCES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'sources.json'), 'utf8'));
    const noName = SOURCES.filter((s) => s.kind === 'journal' && !s.journalName).map((s) => s.name);
    ok(noName.length === 0,
      `sources.json 里每个 kind=journal 的源都配了 journalName（共 ${SOURCES.filter((s) => s.kind === 'journal').length} 个）`
      + (noName.length ? ` —— 缺：${noName.join(', ')}` : ''));
  }

  console.log(`\n✅ all ${passed} assertions passed`);
}

run().catch((e) => { console.error('\n❌ FAIL:', e.message); process.exit(1); });
