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
  isJunkUrl,
  isReasonSlop,
  dateFromUrlPath,
  dateFromArticlePage,
  dateFromPubmedId,
  pmidFromUrl,
  verifyExaDates,
  searchExa,
  SCRAPE_BURST_MAX,
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

    // 同名条目 = 信源墙双卡 + matchSource 归属看运气。多 URL 族（BMC 在
    // biomedcentral 和 link.springer 双住址）用 domains 别名数组表达，不开第二条
    // （BMC Musculoskelet Disord 曾双条目双卡，2026-08-11 合并）。
    const dupNames = Object.entries(SOURCES.reduce((m, s) => ((m[s.name] = (m[s.name] || 0) + 1), m), {}))
      .filter(([, n]) => n > 1).map(([k, n]) => `${k}×${n}`);
    ok(dupNames.length === 0,
      `sources.json 无同名条目（共 ${SOURCES.length} 条）` + (dupNames.length ? ` —— ${dupNames.join(', ')}` : ''));
  }

  // --------------------------------------------------------------------------
  console.log('\nG. 周报告警：只报直接证据，不从总量推断（2026-08-10 审计）');
  {
    // 背景：旧的「入库总量环比下降 → 核对抓取链路」在前 8 期响了 4 次（W26 65→47、
    // W28 147→143、W29 143→101、W32 112→58），4 次全是误报。W28 那次是 -2.7%——
    // 这条规则根本没有阈值。周总量是尖峰序列，从它推断故障必然狼来了；而狼来了的
    // 提示会训练人跳过整个「给本周的提示」段落，等于把周报的行动力清零。
    //
    // 下面每条都按本文件的惯例带判别力：把旧规则精确复刻，断言「旧的误报 ∧ 新的沉默」，
    // 以及「真故障来时新的照样响」。有人把哪条改回按总量判断，右半立刻转红。
    const { silentSources, sourceShifts, categoryBaseline, dailyCounts } = require('./weekly-brief');

    const DAY = 864e5;
    const END = Date.parse('2026-08-10T00:00:00+08:00');
    const at = (daysAgo, extra = {}) => ({ id: `x${Math.random()}`, firstSeen: new Date(END - daysAgo * DAY).toISOString(), ...extra });
    const legacyTotalAlarm = (curTotal, prevTotal) => curTotal < prevTotal; // 旧规则原样

    // G1. W32 实况：112→58，但逐日 8/8/10/7/13/5/7，没有一天断供。
    const w32Daily = [8, 8, 10, 7, 13, 5, 7];
    const w32Items = w32Daily.flatMap((n, i) => Array.from({ length: n }, () => at(7 - i, { source: 'PubMed' })));
    const zeroDays = dailyCounts(w32Items, END - 7 * DAY, END, 'firstSeen').filter((d) => d.n === 0);
    ok(legacyTotalAlarm(58, 112) && zeroDays.length === 0,
      'W32：旧的总量规则会报警 ∧ 新的逐日探针沉默（7 天全有产出，-48% 只是上周三个爆发日的假象）');

    // G2. 静默源要按各源自己的节奏判：PubMed 90 天 54 个产出日、AHPRA 只有 4 天、
    //     最长间隔 35 天。固定天数阈值在这两者之间无解，只能自校准。
    const regular = Array.from({ length: 21 }, (_, i) => at(20 + i * 3, { source: '规律源' })); // 每 3 天一次，停了 20 天
    const batchy = [...Array.from({ length: 12 }, () => at(30, { source: '批量源' })), at(75, { source: '批量源' })]; // 只有 2 个产出日
    const retired = Array.from({ length: 21 }, (_, i) => at(20 + i * 3, { source: '已下线源' }));
    const enabled = new Set(['规律源', '批量源']); // 已下线源 不在 sources.json 里
    const silent = silentSources([...regular, ...batchy, ...retired], END, 'firstSeen', enabled);
    const names = silent.map((s) => s.source);
    ok(names.includes('规律源'), '静默探针：规律产出后停摆的源会响');
    ok(!names.includes('批量源'), '静默探针：天然批量的低频源不响（产出日太少，无节奏可比）');
    ok(!names.includes('已下线源'), '静默探针：已从 sources.json 摘除的源不响（下线是决定，不是故障）');

    // G3. 2026-07-26 的 Springer 错标（W30 实数）：Sports Medicine 66/127 = 52%，
    //     上周 23/101 = 23%。旧规则看到同一个数字，处方却是「可补充其他来源平衡」——
    //     信号对、诊断错。占比阶跃能把它指出来。
    const springer = sourceShifts({ 'Sports Medicine': 66 }, { 'Sports Medicine': 23 }, 127, 101);
    ok(springer.some((s) => s.source === 'Sports Medicine' && s.kind === 'surge'),
      'W30 Springer 错标：占比 23%→52% 被判为结构跳变（旧规则只会说「来源集中」）');
    ok(sourceShifts({ PubMed: 66 }, { PubMed: 23 }, 127, 101).length === 0,
      'PubMed 豁免：它是管线不是刊，占比随其他源增减机械浮动，不该触发错标怀疑');

    // G4. 方向薄弱要跟自己比。W25–W32 的每周中位：神经 23、骨科 15.5 vs 儿科 3、心肺 3.5，
    //     所以跨方向均值线下永远压着小科——旧规则 8 期响 6 次、心肺一家占 5 次。
    const cats = ['neurological', 'pediatric'];
    const hist = [];
    for (let w = 1; w <= 8; w++) {
      const base = 1 + (w - 1) * 7;
      for (let i = 0; i < 23; i++) hist.push(at(base, { category: 'neurological' }));
      for (let i = 0; i < 3; i++) hist.push(at(base, { category: 'pediatric' }));
    }
    const baseline = categoryBaseline(hist, END, 'firstSeen', cats);
    const thisWeek = { neurological: 14, pediatric: 2 };
    const legacyMean = (14 + 2) / 2;
    const legacyWeak = cats.filter((c) => thisWeek[c] < Math.max(2, legacyMean * 0.5));
    const selfWeak = cats.filter((c) => baseline[c] >= 4 && thisWeek[c] < baseline[c] * 0.5);
    ok(legacyWeak.includes('pediatric') && !selfWeak.includes('pediatric'),
      '儿科 2 篇（自身中位 3）：旧的跨方向均值判它薄弱 ∧ 新的自身基线放行（它本来就小，不是本周反常）');
    ok(categoryBaseline(hist, END, 'firstSeen', cats).neurological === 23,
      '自身基线取该方向前 8 周中位（神经 = 23）');
  }

  // --------------------------------------------------------------------------
  console.log('\nH. 抓取腿日期不变量：publishedAt 来自原文，不来自时钟（2026-08-11 APTA 倒灌）');
  {
    // 背景：抓取腿曾用 publishedDate = 发现时间。8-10 APTA 列表页暴露 36 条从未
    // 入账的链接，13 条带着「今天」的伪日期过审、拿 75–85 分——最老的是 2025-11
    // 的旧文，被当成当日头条。根因是把「账本没见过」当成了「世界里是新的」。
    // 修复后：URL 路径 → 页面 meta，两者都拿不到就不进 feed，绝不编造。

    // H1（零延迟）：解析器契约 + 判别力。旧行为对任何 URL 都盖今天的章。
    ok(dateFromUrlPath('https://www.apta.org/article/2026/05/01/apta-opposes-x') === '2026-05-01T00:00:00.000Z',
      'URL 路径里的 /2026/05/01/ 解析为真实日期');
    ok(dateFromUrlPath('https://www.apta.org/article/some-dateless-slug') === null,
      '无日期 URL 返回 null——宁缺毋造，undatable 的链接只入账不进 feed');
    ok(dateFromUrlPath('https://x.org/2026/13/40/a') === null, '假日期段（13 月）不解析');
    const legacyStamp = () => new Date().toISOString(); // 旧行为原样：发现即日期
    ok(legacyStamp().slice(0, 10) !== '2026-05-01'
      && dateFromUrlPath('https://www.apta.org/article/2026/05/01/x').slice(0, 10) === '2026-05-01',
      '同一条 2026/05 旧文：旧的盖今天的章 ∧ 新的读出它自己的日期');

    // H2（产物，挂 SKIP_ARTIFACT_ASSERTS——同 F 段的理由与拆法）：单元断言证明
    // 解析器是对的，证不了「解析器在生产里被用了」。2026-08-02 空 journal 的教训
    // 同款：回退/没上线只有产物看得出来。
    if (process.env.SKIP_ARTIFACT_ASSERTS) {
      console.log('  ⊘ SKIP_ARTIFACT_ASSERTS=1 —— 跳过 news.json 产物断言');
    } else if (!fs.existsSync(path.join(__dirname, '..', 'news.json'))) {
      console.log('  ⊘ news.json 不存在（fresh clone），跳过产物断言');
    } else {
      const items = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'news.json'), 'utf8')).items || [];
      const roster = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'sources.json'), 'utf8'));
      const scrapeSrc = new Set(roster.filter((s) => (s.scrape || []).length).map((s) => s.name));
      const dayOf = (s) => (s || '').slice(0, 10);
      // 伪造签名 = publishedAt 与 firstSeen 同日，而 sourceUrl 自带的日期揭穿它。
      // （只有 URL 能离线证伪；页面 meta 才能证伪的那部分归 fix-scrape-dates.js。）
      const lied = items.filter((i) => scrapeSrc.has(i.source) && i.publishedAt && i.firstSeen
        && dayOf(i.publishedAt) === dayOf(i.firstSeen)
        && (() => { const u = dateFromUrlPath(i.sourceUrl || ''); return u && Math.abs(new Date(u) - new Date(i.publishedAt)) > 864e5; })());
      const who = [...new Set(lied.map((i) => i.source))].slice(0, 4).join(', ');
      ok(lied.length === 0,
        `news.json 里没有「URL 日期揭穿 publishedAt=发现日」的抓取条目`
        + (lied.length ? ` —— ${lied.length} 条（${who}）：抓取腿是不是又在盖章了？跑 fix-scrape-dates.js 修数据` : ''));
      // 同日伪造洪峰：诚实的当日爆发（publishedAt 各不相同）不在此列，
      // 所以只数 publishedAt==firstSeen 的同源同日簇。事故当天 APTA|8-10 = 13。
      const clusters = {};
      items.forEach((i) => {
        if (!scrapeSrc.has(i.source) || !i.publishedAt || !i.firstSeen) return;
        if (dayOf(i.publishedAt) !== dayOf(i.firstSeen)) return;
        const k = `${i.source}|${dayOf(i.firstSeen)}`;
        clusters[k] = (clusters[k] || 0) + 1;
      });
      const floods = Object.entries(clusters).filter(([, n]) => n > SCRAPE_BURST_MAX);
      ok(floods.length === 0,
        `没有单源单日 >${SCRAPE_BURST_MAX} 条的「发现即日期」簇`
        + (floods.length ? ` —— ${floods.map(([k, n]) => `${k}×${n}`).join(', ')}` : ''));
    }
  }

  // --------------------------------------------------------------------------
  console.log('\nI. 检索腿日期不变量 + 非文章闸（2026-08-15 CMS Fee Schedules 上首条）');
  {
    // 背景：H 段只修了抓取腿。检索腿（Exa）同一个不变量没修——它是搜索索引，
    // publishedDate 是爬虫推断的值，对一个从来没有发布日期的常青页就等于「我们
    // 什么时候爬到它」，没推断出来时旧代码还会 `|| new Date().toISOString()`。
    // 两种形态都上过线：8 条 AHPRA 注册/投诉导航页盖着同一个毫秒级运行时间戳、
    // 70–75 分（2026-06-21），以及 CMS《Fee Schedules - General Information》
    // ——一个常年挂着的费率索引入口——85 分上首条（2026-08-14），与同月真正的
    // CY2027 医师收费标准拟议规则同分。分数在 practice 垂直失去了区分度。

    // I1（判别力）：回退检测。修复的全部要害是「没有时钟兜底」，而这一点只在
    // 源码里看得见——盖了章的条目和诚实的条目在产物里长得一模一样。
    ok(!/publishedDate:\s*r\.publishedDate\s*\|\|\s*new Date\(\)/.test(String(searchExa)),
      'searchExa 不再用时钟兜底 publishedDate（回退这行即红）');
    ok(/dateUnverified/.test(String(searchExa)),
      'Exa 结果标记 dateUnverified，交给 verifyExaDates 从原文重新取日期');

    // I1b：同一个时钟兜底在 PubMed 与 RSS 腿上也存在——本次修复第一版只改了 Exa，
    // 漏掉的 10 条 PubMed + 4 条 RSS 行在归档里以「同毫秒成对」的形态留了证据。
    // 这三处必须一起为空，所以断言全文件级别：抓取时段不得再出现时钟兜底。
    const SRC = fs.readFileSync(path.join(__dirname, 'news-refresh.js'), 'utf8');
    const ingestBlock = SRC.slice(0, SRC.indexOf('async function curateWithClaude'));
    ok(!/publishedDate\s*[:=][^;\n]*new Date\(\)\.toISOString\(\)/.test(ingestBlock),
      '三条抓取腿（Exa / PubMed / RSS）都不再用时钟兜底 publishedDate');

    // I1c：学术站的日期在 Highwire meta 里（PubMed / ScienceDirect / Springer），
    // 旧解析器不认，全都掉进 <time datetime> 兜底——那在这些站上是「最后更新」。
    // 用假 fetch 离线跑真函数，不打网络。
    const realFetch = global.fetch;
    const withHtml = async (html) => {
      global.fetch = async () => ({ ok: true, text: async () => html });
      try { return await dateFromArticlePage('https://x.test/a'); } finally { global.fetch = realFetch; }
    };
    ok((await withHtml('<meta name="citation_date" content="2026/07/14">') || '').slice(0, 10) === '2026-07-14',
      'citation_date（PubMed 形态）被解析');
    ok((await withHtml('<meta name="citation_publication_date" content="2026-06-25">') || '').slice(0, 10) === '2026-06-25',
      'citation_publication_date（Springer 形态）被解析');
    ok((await withHtml('<meta name="citation_date" content="2026-05-02"><time datetime="2026-08-15">x</time>') || '').slice(0, 10) === '2026-05-02',
      'citation_date 优先于 <time datetime>（后者在学术站是「最后更新」）');
    ok(await withHtml('<p>nothing</p>') === null, '页面无任何日期 meta → null，不猜');

    // I1d：PubMed 行的 URL 自带 PMID，走 E-utilities 拿 entrez date，
    // 与 fetchPubMed 入库时读的是同一个字段（同一把尺子量新旧数据）。
    ok(pmidFromUrl('https://pubmed.ncbi.nlm.nih.gov/42361357/') === '42361357', '从 URL 取出 PMID');
    ok(pmidFromUrl('https://www.cms.gov/newsroom/x') === null, '非 PubMed URL 不误判');
    const withXml = async (xml) => {
      global.fetch = async () => ({ ok: true, text: async () => xml });
      try { return await dateFromPubmedId('42361357'); } finally { global.fetch = realFetch; }
    };
    ok((await withXml('<PubMedPubDate PubStatus="pubmed"><Year>2026</Year><Month>6</Month><Day>26</Day></PubMedPubDate>') || '').slice(0, 10) === '2026-06-26',
      'efetch 的 PubMedPubDate[pubmed] 被解析为 entrez date');
    ok(await withXml('<PubmedArticle>no pubdate</PubmedArticle>') === null, 'efetch 没有该字段 → null');

    // I2：无法定日期 = 不是文章。127.0.0.1:1 立刻拒连 → 页面 meta 也拿不到。
    const undated = [{ url: 'http://127.0.0.1:1/medicare/payment/fee-schedules', title: 'Fee Schedules - General Information', publishedDate: '2026-08-13T17:42:29.287Z', dateUnverified: true }];
    ok((await verifyExaDates(undated)).length === 0,
      'URL 无日期 ∧ 页面 meta 取不到 → 丢弃（常青索引页不是文章，不是「旧文章」）');

    // I3：原文日期压过索引日期。Exa 说 8-13，URL 说 2026-05-01，以原文为准。
    const misdated = [{ url: 'https://www.apta.org/article/2026/05/01/x', title: 'x', publishedDate: '2026-08-13T17:42:29.287Z', dateUnverified: true }];
    const fixed = await verifyExaDates(misdated);
    ok(fixed.length === 1 && fixed[0].publishedDate.slice(0, 10) === '2026-05-01',
      '原文日期压过 Exa 索引日期（8-13 → 2026-05-01），且 dateUnverified 标记已清除');
    ok(!('dateUnverified' in fixed[0]), 'dateUnverified 不泄漏到策展与产物');

    // I4：其他三条腿自带权威日期（RSS pubDate / PubMed edat / 抓取腿已验），
    // 不打标记就不该被这一关碰到——否则每天多几十次无谓 GET。
    const rss = [{ url: 'https://example.org/no-date-in-path', publishedDate: '2026-08-01T00:00:00.000Z' }];
    ok((await verifyExaDates(rss)).length === 1, '未标记 dateUnverified 的条目原样通过，不触发额外请求');

    // I5（判别力）：旧 JUNK_URL 四条正则放走了报名页/征稿页。
    const legacyJunk = [/^careers?\./i, /\/(careers?|jobs?|vacancies)(\/|$)/i, /\/(login|signin|subscribe|cart|search)(\/|$)/i];
    const WEBINAR = 'https://www.webpt.com/webinars/why-healthcare-rcm-is-still-broken-and-what-comes-next';
    const CFP = 'https://onlinelibrary.wiley.com/page/journal/14712865/call-for-papers/si-2026-000965';
    ok(!legacyJunk.some((re) => re.test(new URL(WEBINAR).pathname)) && isJunkUrl(WEBINAR),
      'webinar 报名页：旧闸放走（75 分上线）∧ 新闸接住');
    ok(!legacyJunk.some((re) => re.test(new URL(CFP).pathname)) && isJunkUrl(CFP),
      '征稿启事页：旧闸放走（70 分上线）∧ 新闸接住');
    ok(!isJunkUrl('https://www.cms.gov/newsroom/fact-sheets/calendar-year-cy-2027-medicare-physician-fee-schedule-proposed-rule'),
      '真正的 CY2027 收费标准拟议规则不受影响——闸拦的是形态，不是话题');

    // I6（判别力）：空效用措辞。中文侧每条正则原本只写了「你」，而策展实际用
    // 「您」——这是 CMS 那条 curatedReason 逃逸的确切原因，不是漏写了某个词。
    const CMS_ZH = 'CMS 提供的这份“收费标准”通用信息是您理解美国 Medicare 支付机制的基础。它详细列出了 Medicare 支付医生或其他服务提供者的费用清单，对您的美国诊所报销策略至关重要。';
    const CMS_EN = 'This general information on "Fee Schedules" from CMS is fundamental for your understanding of the US Medicare payment system. It details the fee listings Medicare uses to pay doctors and other providers, which is crucial for your US clinic\'s reimbursement strategy.';
    ok(isReasonSlop({ curatedReason: CMS_ZH, curatedReasonEn: CMS_EN }),
      '线上那条 CMS why-it-matters 现在判为模板腔（中英两侧都命中）');
    ok(isReasonSlop({ curatedReason: '这有助于帮助您了解报销规则' }) && isReasonSlop({ curatedReason: '这有助于帮助你了解报销规则' }),
      '「您」与「你」两种人称同等覆盖（旧正则只认「你」）');
    ok(!isReasonSlop({ curatedReason: '腰骶矫形器的证据还是撑不起常规处方——效应量小、异质性高。继续当短期辅助用，别替代主动训练。' }),
      '真正的 take 不误伤');

    // I7（产物，挂 SKIP_ARTIFACT_ASSERTS）：单元断言证不了「闸在生产里被用了」。
    // 只约束闸上线之后新入库的条目：存量污染（8 条 AHPRA + CMS 那条）要靠幂等
    // 脚本清，不该卡住 cron——2026-08-12 gate H 全红挂掉四个 workflow 48 小时，
    // 那次教训就是「断言的作用域必须等于修复的作用域」。
    const GATE_SHIPPED = '2026-08-15';
    if (process.env.SKIP_ARTIFACT_ASSERTS) {
      console.log('  ⊘ SKIP_ARTIFACT_ASSERTS=1 —— 跳过 news.json 产物断言');
    } else if (!fs.existsSync(path.join(__dirname, '..', 'news.json'))) {
      console.log('  ⊘ news.json 不存在（fresh clone），跳过产物断言');
    } else {
      const items = (JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'news.json'), 'utf8')).items || [])
        .filter((i) => (i.firstSeen || '').slice(0, 10) >= GATE_SHIPPED);
      const junk = items.filter((i) => isJunkUrl(i.sourceUrl || ''));
      ok(junk.length === 0,
        `${GATE_SHIPPED} 起入库的条目里没有非文章 URL`
        + (junk.length ? ` —— ${junk.map((i) => i.sourceUrl).slice(0, 3).join(', ')}` : ''));
      // 盖章签名：同源多条共享毫秒级 publishedAt = 同一次 run 盖的章。
      const stamp = {};
      items.forEach((i) => {
        if (!/\.\d{3}Z$/.test(i.publishedAt || '') || (i.publishedAt || '').endsWith('.000Z')) return;
        (stamp[i.publishedAt] = stamp[i.publishedAt] || []).push(i.source);
      });
      const stamped = Object.entries(stamp).filter(([, v]) => v.length > 1);
      ok(stamped.length === 0,
        `${GATE_SHIPPED} 起没有「多条共享同一毫秒 publishedAt」的盖章簇`
        + (stamped.length ? ` —— ${stamped.map(([k, v]) => `${k}×${v.length}`).join(', ')}` : ''));
    }
  }

  // --------------------------------------------------------------------------
  console.log('\nJ. JSX 里 i18n 的 t 必须在本组件里取到（2026-08-14 白屏）');
  {
    // 2026-08-14 daily brief 整页打不开：DailyMasthead 里的「快讯」chip 写了
    // t('daily.flashes')，但这个组件没有 `const t = window.CD_T;` —— 本仓库的
    // t 不是模块级导入，是每个组件自己从 window 取的一行局部变量。
    //
    // 为什么静默：那个 chip 只在 edition.flashes 非空时渲染。写它的那天
    // （8-11）之后 cron 挂了两天，8-14 一次灌进 41 条、SECTION_CAP 溢出到
    // flashes，分支第一次执行 → ReferenceError 冒到 React 根 → root 清空、
    // 白屏、无降级。构建不会报（esbuild 把未声明标识符当全局放行），
    // 语法检查也不会报 —— 只有渲染到那条分支才炸。
    //
    // 所以这里查的是「作用域」而不是「能不能跑」：整页渲染没法在纯 node 里做，
    // 但「某个顶层组件用了 t 却没在自己块里声明」是纯静态的、可判定的。
    // 保守优先（这条进 npm test，四个 cron 都消费它，误报的代价是全线停摆）：
    // 行注释整行剥掉、只认顶层块、任何形式的 `const/let/var t =` 或
    // `function t(` 都算数。宁可漏，不可误。
    const scanUnresolvedT = (src) => {
      const lines = src.split('\n').map((l) => l.replace(/\/\/.*$/, '')); // 剥行注释；URL 里的 // 会顺带截断该行 → 只会漏报
      const bounds = [];
      lines.forEach((l, i) => {
        if (/^(export\s+)?(function |const [A-Za-z_$][\w$]*\s*=\s*(\(|function|React\.memo|memo))/.test(l)) bounds.push(i + 1);
      });
      const defs = new Set();
      lines.forEach((l, i) => {
        if (/\b(const|let|var)\s+t\s*=/.test(l) || /\bfunction\s+t\s*\(/.test(l)) defs.add(i + 1);
      });
      const bad = [];
      lines.forEach((l, i) => {
        if (!/(^|[^\w.$'"`])t\(/.test(l)) return;                 // 排除 split( / .t( / 'xxxt(' 之类
        let start = 0;
        for (const b of bounds) { if (b <= i + 1) start = b; else break; }
        const end = bounds.find((b) => b > start) || lines.length + 1;
        let declared = false;
        for (const d of defs) if (d >= start && d < end) declared = true;
        if (!declared) bad.push(`${i + 1}: ${lines[i].trim().slice(0, 60)}`);
      });
      return bad;
    };

    const jsxFiles = [];
    const appDir = path.join(__dirname, '..', 'design-system', 'app');
    for (const f of fs.readdirSync(appDir)) if (f.endsWith('.jsx')) jsxFiles.push(path.join(appDir, f));
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (p.endsWith('.jsx')) jsxFiles.push(p);
      }
    })(path.join(__dirname, '..', 'design-system', 'components'));

    const offenders = [];
    for (const f of jsxFiles) {
      for (const b of scanUnresolvedT(fs.readFileSync(f, 'utf8'))) offenders.push(`${path.basename(f)} L${b}`);
    }
    ok(offenders.length === 0,
      `${jsxFiles.length} 个 jsx 里没有「用了 t 却没在本组件声明」的调用`
      + (offenders.length ? ` —— ${offenders.slice(0, 3).join(' / ')}` : ''));

    // 判别力：把 8-14 那行的声明注释掉，这个扫描必须重新转红。
    const live = fs.readFileSync(path.join(appDir, 'app.main.jsx'), 'utf8');
    const reverted = live.replace(/^(\s*)const t = window\.CD_T;(\s*\/\/ 少了这行.*)$/m, '$1// const t = window.CD_T;');
    ok(reverted !== live && scanUnresolvedT(reverted).length > 0,
      '判别力：还原 DailyMasthead 的 const t 后，扫描立刻抓到（不是恒真断言）');
  }

  // --------------------------------------------------------------------------
  console.log('\nK. 换掉 news.json 的 items 数组就得同步 meta.totalItems（2026-08-14）');
  {
    // 2026-08-14 站点侧栏 All 显示 75、实际 71：fix-nonarticle-rows.js 掉了 6 行
    // 却没动 doc.meta.totalItems。这些修复脚本都记得重建 archive/index.json
    // （那是显式的一段代码），唯独漏了 news.json 自己那三行 meta —— 不对称。
    //
    // 漂移会自愈：news-refresh 每次 run 写 `totalItems: merged.length`。所以这
    // **不能**做成产物断言 —— npm test 在 refresh.yml 里跑在 news-refresh 之前，
    // 一条「meta.totalItems === items.length」的产物断言会正好卡死那次能治好它
    // 的 run（gate H 8-12/8-13 四个 cron 全挂 48h 就是这么来的）。
    // 静态断言没有这个问题：它只看提交进来的源码，绿了就一直绿。
    const scriptsDir = path.join(__dirname);
    const offenders = [];
    let checked = 0;
    for (const f of fs.readdirSync(scriptsDir)) {
      if (!f.endsWith('.js') || f.endsWith('.test.js')) continue;
      const src = fs.readFileSync(path.join(scriptsDir, f), 'utf8');
      if (!src.includes('news.json')) continue;
      const lines = src.split('\n').map((l) => l.replace(/\/\/.*$/, ''));
      // 「整个 items 数组被换掉」：map/enrich 不改条数，不在此列。
      const replaces = lines.some((l) => /[\w.]*\.items\s*=\s*(?!.*\.items\s*\.\s*map)/.test(l) && !/[=!]==?\s*$/.test(l));
      if (!replaces) continue;
      checked++;
      if (!/meta\.totalItems\s*=/.test(src)) offenders.push(f);
    }
    ok(checked > 0, `确实扫到了会换 items 数组的脚本（${checked} 个，否则这条断言是空转）`);
    ok(offenders.length === 0,
      '换 items 数组的脚本都同步了 meta.totalItems'
      + (offenders.length ? ` —— ${offenders.join(', ')}` : ''));

    // 判别力：把其中一个脚本的同步行去掉，这条必须转红。
    const probe = fs.readFileSync(path.join(scriptsDir, 'fix-nonarticle-rows.js'), 'utf8');
    ok(/meta\.totalItems\s*=/.test(probe) && !/meta\.totalItems\s*=/.test(probe.replace(/.*meta\.totalItems\s*=.*/g, '')),
      '判别力：去掉同步行后该脚本就落进 offenders（不是恒真断言）');
  }

  console.log(`\n✅ all ${passed} assertions passed`);
}

run().catch((e) => { console.error('\n❌ FAIL:', e.message); process.exit(1); });
