// Cadence — data loader.
// Fetches news.json (cron-written by scripts/news-refresh.js) and transforms each item
// from the canonical JSON schema into the CD_STORIES shape that app.main.jsx expects.
//
// No slug aliasing needed: this is a fresh fork — scripts/news-refresh.js and
// components/feed/categories.js were built against the same 8 PT slugs.

// ── i18n ─────────────────────────────────────────────────────────────────────
// UI-chrome dictionary. Content fields (titleZh/summaryZh/curatedReasonEn) come
// from news.json per item; missing fields fall back to the original language.
// CD_LANG is read at render time by every component, so FeedApp's setLang
// re-render flips the whole tree in place. Persisted choice wins over the
// browser-language default.
window.CD_DICT = {
  en: {
    'nav.curated': 'Curated', 'nav.all': 'All stories', 'nav.daily': 'Daily brief', 'nav.sources': 'Sources', 'nav.about': 'About', 'nav.feedback': 'Feedback',
    // Short labels for the mobile bottom tab bar (≤8 chars so the tabs fit at 320px)
    'navS.curated': 'Curated', 'navS.all': 'All', 'navS.daily': 'Daily', 'navS.sources': 'Sources', 'navS.about': 'About', 'navS.feedback': 'Feedback',
    'sub.curated': 'AI-selected PT signal · updated daily', 'sub.all': 'Every story Cadence has curated — live feed plus full archive',
    'sub.daily': 'One edition every morning — lead, sections, archive',
    'sub.sources': 'Outlets Cadence monitors', 'sub.about': 'Who Cadence is for, how it works, and why it exists', 'sub.feedback': 'Help shape where Cadence goes next',
    // About page — brand statement, how-it-works, founder story, transparency, disclaimer, contact
    'about.brand': 'Cadence is a daily evidence signal for the rehabilitation field, built for clinicians, students, educators, and coaches across physical therapy, rehab, and sports science. We surface the research and industry news most worth your time, curated from JOSPT, PTJ, PubMed, and 20+ specialty sources, refreshed every morning.',
    'about.hero.lead': 'Every day, we filter out the noise and keep only the few evidence signals worth your time.',
    'about.hero.sub': 'For clinicians, students, educators, and coaches across physical therapy, rehab, and sports science.',
    'about.how.title': 'How Cadence works',
    'about.how.1': 'Every day, an automated crawl sweeps 20+ sources for the latest research and industry news.',
    'about.how.2': 'An AI scoring model ranks each item by clinical relevance, evidence level, and cross-source coverage.',
    'about.how.3': 'An editorial layer filters out off-topic noise, keeping the signal that matters to rehab.',
    'about.why.title': 'Why I built this',
    'about.why.p1': "I studied physical therapy and spent two years in the clinic. A PT's day is packed end to end with patients and your focus is pulled in every direction; by the time it slows down, there's no energy left to keep up with new research, guidelines, or where the field is heading.",
    'about.why.p2': 'I later studied data analytics for my master’s, but never left rehab behind. I kept wondering: could I use data to automate the two or three hours I once spent digging through the literature every day? And it is not only therapists drowning in it. Students, educators, and strength coaches are all stuck against the same wall of time.',
    'about.why.p3': 'In June 2026, my team and I built Cadence. It does those two or three hours of filtering for you and keeps only the few signals worth reading. Whether you are a therapist, a rehab student or educator, or a strength coach, you can catch up with the whole field in a few minutes.',
    'about.sources.title': 'Source transparency',
    'about.sources.body': 'Every source Cadence indexes is listed on the Sources page: journals, associations, and industry outlets, with how each one is wired in.',
    'about.sources.cta': 'View sources',
    'about.disclaimer.title': 'A note on use',
    'about.disclaimer.body': 'Cadence is for informational purposes only and does not constitute clinical advice. Every story links to its original source; always refer to the original.',
    'about.contact.title': 'Get in touch',
    'about.contact.body': 'Have a suggestion, or a source worth adding? We read every note that comes in.',
    'about.contact.cta': 'Send feedback',
    'fb.kindLabel': 'What kind of note is this?',
    'fb.kind.bug': "Something's broken", 'fb.kind.feature': 'Idea or request', 'fb.kind.content': 'Content quality', 'fb.kind.other': 'Just saying hi',
    'fb.contentLabel': 'The details', 'fb.contentPlaceholder': 'What happened, or what you would change…',
    'fb.contactLabel': 'Where to reach you', 'fb.optional': 'optional', 'fb.contactPlaceholder': 'Email or WeChat — only if you want a reply',
    'fb.send': 'Send it', 'fb.sending': 'Sending…', 'fb.sent': 'Signal received — thank you. I read every single one.',
    'fb.error': 'Could not send — please try again.', 'fb.again': 'Send another',
    searchPlaceholder: 'Search stories, sources, companies…',
    signalScore: 'Signal score',
    ifTip: 'Journal impact factor',
    hotNow: 'Hot now', hotSub: 'Multi-source stories & active themes · heat decays over time', nSources: 'sources',
    themeHeat: 'Theme', nOutlets: 'outlets',
    alsoCovered: 'Also covered by',
    whyMatters: 'Why it matters', readOriginal: 'Read original',
    'sources.search': 'Search sources…', 'sources.noMatch': 'No sources match',
    'kindFilter.all': 'All',
    today: 'Today', yesterday: 'Yesterday', older: 'Earlier this week',
    storyOne: 'story', storyMany: 'stories',
    loadingArchive: 'Loading the full archive…', unknownDate: 'Date unknown',
    emptySearch: 'No stories match',
    emptyDaily: 'No stories from yesterday yet — check back after the early-morning crawl (05:30 Beijing).', emptyNone: 'No stories yet.',
    'daily.stories': 'STORIES', 'daily.edition': 'DAILY EDITION',
    'daily.lead': "Editor's lead", 'daily.flashes': 'In brief',
    'daily.prev': '← Previous day', 'daily.next': 'Next day →', 'daily.archive': 'All editions', 'daily.latest': 'Back to latest',
    'daily.archiveTitle': 'Past editions', 'daily.eventsN': 'stories',
    'daily.loading': 'Loading edition…',
    'daily.empty': 'No editions yet — the first one is generated after the next morning crawl (05:30 Beijing).',
    'daily.autoNote': 'Generated daily by the Cadence editorial pipeline · AI-curated, human-edited',
    'daily.stat.events': 'stories today', 'daily.stat.specialties': 'specialties', 'daily.stat.multi': 'multi-source', 'daily.stat.sources': 'sources',
    'daily.read5': 'Only have 5 minutes? Read this one', 'daily.take': 'Clinical bottom line',
    'daily.tier2': 'Practice-changing', 'daily.tier3': 'Worth knowing', 'daily.expand': 'Click a row to expand the summary',
    'daily.share': 'Handoff card — screenshot & share', 'daily.shift': 'morning', 'daily.copy': 'Copy as text', 'daily.copied': 'Copied',
    'daily.shareFoot': 'Full text & references → WeChat 「Cadence步频」 · same name on Xiaohongshu',
    'daily.latestIssue': 'Latest edition',
    yesterdaySignal: "Yesterday's signal", todaysSignal: "Today's Signal", categoryPulse: 'Category pulse',
    whyCats: 'How stories are categorized',
    whyCatsBody: 'The first six mirror PT’s core clinical specialties as recognized by board certification (e.g. ABPTS): orthopedic, neurological, sports, pediatric, geriatric, cardiopulmonary. Manual & Modalities and Practice & Profession cut across them — treatment techniques, and policy/payment/workforce news. Tech is an overlay rather than a category: stories keep their specialty and are additionally flagged when they involve AI, VR, robotics, telerehab or other technology-driven rehab.',
    dailyLeadA: 'PT stories across', dailyLeadB: 'specialties yesterday. Top signal:',
    'kind.journals': 'Journals & Research', 'kind.assoc': 'Associations & Regulators', 'kind.industry': 'Industry News & Platforms',
    'kindL.journal': 'Journal', 'kindL.database': 'Database', 'kindL.preprint': 'Preprint', 'kindL.association': 'Association',
    'kindL.regulator': 'Regulator', 'kindL.news': 'News', 'kindL.platform': 'Platform',
    // Sources wall — ingestion-channel badge + tooltips (how each outlet is actually wired)
    'src.ch.rss': 'RSS', 'src.ch.scrape': 'Scrape', 'src.ch.pubmed': 'PubMed', 'src.ch.api': 'API', 'src.ch.exa': 'Search',
    'src.chTip.rss': 'Polled via RSS feed every crawl', 'src.chTip.scrape': 'Page scraped on each crawl',
    'src.chTip.pubmed': 'New articles arrive via the PubMed pipeline', 'src.chTip.api': 'Queried directly via the PubMed E-utilities API',
    'src.chTip.exa': 'Swept via domain-constrained web search (daily)',
    'src.noneYet': 'Nothing archived from this outlet yet', 'src.countTip': 'stories archived to date',
    'src.suggest.btn': '+ Suggest a source', 'src.suggest.title': 'Suggest a source', 'src.suggest.review': 'reviewed before listing',
    'src.suggest.sent': 'Thanks — your suggestion was sent. We review every submission before adding it to the wall.',
    'src.suggest.name': 'Source name', 'src.suggest.url': 'Official URL',
    'src.suggest.email': 'Your email (optional)', 'src.suggest.emailPh': 'for follow-up',
    'src.suggest.why': 'Why it belongs here (optional)', 'src.suggest.whyPh': 'What does it cover? Why is it credible?',
    'src.suggest.send': 'Submit suggestion', 'src.suggest.sending': 'Sending…', 'src.suggest.cancel': 'Cancel',
    latest: 'Latest',
    errTitle: "Couldn't load the feed",
    errBody: "The news data didn't come through — this is usually a flaky connection rather than anything on our end.",
    tryAgain: 'Try again',
  },
  zh: {
    'nav.curated': '精选', 'nav.all': '全部', 'nav.daily': '每日简报', 'nav.sources': '信源', 'nav.about': '关于', 'nav.feedback': '反馈',
    'navS.curated': '精选', 'navS.all': '全部', 'navS.daily': '简报', 'navS.sources': '信源', 'navS.about': '关于', 'navS.feedback': '反馈',
    'sub.curated': 'AI 精选 PT 信号 · 每日更新', 'sub.all': '全站入库的全部文章 · 实时 + 历史归档',
    'sub.daily': '每日一期 · 导语 + 分版块 + 历史归档',
    'sub.sources': 'Cadence 监测的信源', 'sub.about': '步频写给谁、怎么运作、为什么存在', 'sub.feedback': '一起决定 Cadence 接下来怎么走',
    // 关于页 — 品牌声明、工作原理、创始人故事、信源透明、免责声明、联系
    'about.brand': '步频是一个面向康复领域的每日循证信号聚合器，服务于物理治疗、康复与运动科学的从业者、师生和教练。我们从 JOSPT、PTJ、PubMed 及 20+ 个专业信源中筛选最值得花时间的研究与行业动态，每天早上准时更新。',
    'about.hero.lead': '每天替你筛掉噪音，只把最值得读的几条循证信号留下来。',
    'about.hero.sub': '面向物理治疗、康复与运动科学的从业者、师生和教练。',
    'about.how.title': 'Cadence 是怎么运作的',
    'about.how.1': '每天自动抓取 20+ 个信源的最新研究与行业动态。',
    'about.how.2': 'AI 评分模型按临床相关性、证据等级、多源交叉报道，对每条内容排序。',
    'about.how.3': '编辑层过滤掉无关噪音，只留下对康复真正重要的信号。',
    'about.why.title': '为什么做这个',
    'about.why.p1': '主播本人本科读物理治疗，毕业后做了两年临床。PT 的一天是被患者填满的，心思是涣散的，等忙完，根本没精力再去追最新的研究、指南和行业动态。',
    'about.why.p2': '后来主播读了数据分析硕士，但一直没离开康复。主播常想：能不能用数据，把当年每天花两三个小时翻文献的事自动化？而且被信息淹没的不只是治疗师，康复的学生、老师、体能教练，都困在同样的时间里。',
    'about.why.p3': '2026 年 6 月，我和团队一起做了步频 Cadence，替你做完那两三个小时的筛选，只留最值得读的几条。无论你是治疗师、康复师生还是体能教练，几分钟就能跟上整个领域。',
    'about.sources.title': '信源透明',
    'about.sources.body': '步频收录的所有信源都列在「信源」页，包括期刊、学会与行业媒体，以及每个信源的接入方式。',
    'about.sources.cta': '查看信源',
    'about.disclaimer.title': '使用说明',
    'about.disclaimer.body': '步频仅供信息参考，不构成临床诊疗建议。每条内容都链接到原始出处，请以原文为准。',
    'about.contact.title': '联系我们',
    'about.contact.body': '有建议，或想推荐值得收录的信源？每一条留言我们都会看。',
    'about.contact.cta': '发送反馈',
    'fb.kindLabel': '这条属于哪一类？',
    'fb.kind.bug': '出问题了', 'fb.kind.feature': '想法或需求', 'fb.kind.content': '内容质量', 'fb.kind.other': '随便聊聊',
    'fb.contentLabel': '具体说说', 'fb.contentPlaceholder': '发生了什么，或你想改成什么样…',
    'fb.contactLabel': '怎么找到你', 'fb.optional': '选填', 'fb.contactPlaceholder': '邮箱或微信——想要回复再填',
    'fb.send': '发送', 'fb.sending': '发送中…', 'fb.sent': '信号已收到，谢谢你。每一条我都会看。',
    'fb.error': '发送失败——请再试一次。', 'fb.again': '再发一条',
    searchPlaceholder: '搜索文章、信源、机构…',
    signalScore: '信号分',
    ifTip: '期刊影响因子',
    hotNow: '当前热点', hotSub: '多源报道与活跃主题 · 热度随时间衰减', nSources: '个来源报道',
    themeHeat: '主题热度', nOutlets: '刊',
    alsoCovered: '同题报道',
    whyMatters: '为什么重要', readOriginal: '阅读原文',
    'sources.search': '搜索来源…', 'sources.noMatch': '无匹配来源',
    'kindFilter.all': '全部',
    today: '今天', yesterday: '昨天', older: '本周早些时候',
    storyOne: '条', storyMany: '条',
    loadingArchive: '正在加载历史归档…', unknownDate: '日期不详',
    emptySearch: '没有匹配的文章：',
    emptyDaily: '昨天还没有文章——每日抓取（北京时间早上 5:30）后再来看看。', emptyNone: '暂无文章。',
    'daily.stories': '篇', 'daily.edition': '步频日报',
    'daily.lead': '主编导语', 'daily.flashes': '快讯',
    'daily.prev': '← 前一日', 'daily.next': '后一日 →', 'daily.archive': '查看历史', 'daily.latest': '回到最新',
    'daily.archiveTitle': '历史日报', 'daily.eventsN': '事件',
    'daily.loading': '正在加载日报…',
    'daily.empty': '还没有日报——下一次早间抓取（北京时间 5:30）后生成第一期。',
    'daily.autoNote': 'Cadence 编辑系统每日自动生成 · AI 筛选 · 人工把关',
    'daily.stat.events': '今日事件', 'daily.stat.specialties': '专科', 'daily.stat.multi': '多源报道', 'daily.stat.sources': '信源',
    'daily.read5': '今天只有 5 分钟？读这条', 'daily.take': '临床底线 · Take',
    'daily.tier2': '可改变实践', 'daily.tier3': '了解即可', 'daily.expand': '点击条目展开摘要',
    'daily.share': '交接班卡 · 截图即转发', 'daily.shift': '早班', 'daily.copy': '复制为微信文字', 'daily.copied': '已复制',
    'daily.shareFoot': '全文与参考链接 → 公众号「Cadence步频」 · 小红书同名',
    'daily.latestIssue': '最新一期',
    yesterdaySignal: '昨日信号', todaysSignal: '今日信号', categoryPulse: '分类脉搏',
    whyCats: '分类是怎么定的？',
    whyCatsBody: '前六类对应物理治疗的核心临床专科（参照 ABPTS 等国际专科认证体系）：骨科、神经、运动、儿童、老年、心肺；「手法与理疗」与「行业与执业」是横切维度，分别跟踪治疗技术和政策、医保、职业发展。「科技」是叠加标记而非第九个分类——文章保留所属专科，凡涉及 AI、VR、机器人、远程康复等科技驱动的内容会额外带上它。',
    dailyLeadA: '条 PT 资讯，覆盖', dailyLeadB: '个专科。最高信号：',
    'kind.journals': '期刊与研究', 'kind.assoc': '学会与监管', 'kind.industry': '行业新闻与平台',
    'kindL.journal': '期刊', 'kindL.database': '数据库', 'kindL.preprint': '预印本', 'kindL.association': '学会',
    'kindL.regulator': '监管', 'kindL.news': '新闻', 'kindL.platform': '平台',
    // 信源墙 — 接入方式标识与提示
    'src.ch.rss': 'RSS', 'src.ch.scrape': '抓取', 'src.ch.pubmed': 'PubMed', 'src.ch.api': 'API', 'src.ch.exa': '检索',
    'src.chTip.rss': '每次抓取轮询 RSS 订阅源', 'src.chTip.scrape': '每次抓取解析页面链接',
    'src.chTip.pubmed': '新文章经 PubMed 管线收录', 'src.chTip.api': '直连 PubMed E-utilities API',
    'src.chTip.exa': '每日限定域名网页检索',
    'src.noneYet': '暂未收录过该信源的文章', 'src.countTip': '累计收录',
    'src.suggest.btn': '+ 推荐信源', 'src.suggest.title': '推荐信源', 'src.suggest.review': '审核后添加',
    'src.suggest.sent': '已收到，谢谢推荐。每条建议我们都会核实，确认后加入信源墙。',
    'src.suggest.name': '信源名称', 'src.suggest.url': '官网地址',
    'src.suggest.email': '邮箱（选填）', 'src.suggest.emailPh': '方便后续联系',
    'src.suggest.why': '为什么值得收录（选填）', 'src.suggest.whyPh': '它覆盖什么内容？为什么可信？',
    'src.suggest.send': '提交推荐', 'src.suggest.sending': '提交中…', 'src.suggest.cancel': '取消',
    latest: '最新',
    errTitle: '加载失败',
    errBody: '新闻数据没有加载成功——通常是网络抖动，不是站点的问题。',
    tryAgain: '重试',
  },
};

window.CD_LANG = (() => {
  try {
    const v = localStorage.getItem('cd-lang');
    if (v === 'en' || v === 'zh') return v;
  } catch (e) { /* noop */ }
  return (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
})();

window.CD_T = (key, fallback) =>
  (window.CD_DICT[window.CD_LANG] && window.CD_DICT[window.CD_LANG][key]) || window.CD_DICT.en[key] || fallback || key;

window.CD_SET_LANG = (lang) => {
  window.CD_LANG = lang;
  try { localStorage.setItem('cd-lang', lang); } catch (e) { /* noop */ }
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
};

// Calendar-day bucketing. Was rolling 24h windows, which made a UTC-midnight
// story flip from 今日 to 昨日 at 08:00 Beijing mid-morning.
//
// Timestamp semantics (same convention as cdFmtTime below): PubMed and other
// date-only sources are stored as exactly 00:00:00 UTC — that's a calendar
// DATE, not an instant, so its day is read in UTC. Converting it to the
// viewer's zone shifted everything a day back in the Americas (06-11T00:00Z
// = 06-10 20:00 ET), which emptied today+yesterday and hid the signal rail.
// Stamps with a real clock time are genuine instants → viewer-local date.
function cdDayBucket(publishedAt) {
  if (!publishedAt) return 'older';
  const pub = new Date(publishedAt);
  const now = new Date();
  const isDateOnly = pub.getUTCHours() === 0 && pub.getUTCMinutes() === 0 && pub.getUTCSeconds() === 0;
  const pubKey = isDateOnly
    ? Date.UTC(pub.getUTCFullYear(), pub.getUTCMonth(), pub.getUTCDate())
    : Date.UTC(pub.getFullYear(), pub.getMonth(), pub.getDate());
  const nowKey = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((nowKey - pubKey) / 86400000);
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  return 'older';
}

function cdFmtTime(publishedAt) {
  if (!publishedAt) return '';
  const d = new Date(publishedAt);
  // PubMed (and other date-only sources) carry no clock time, so the pipeline
  // stores them at exactly 00:00:00 UTC. That midnight is a placeholder, not a
  // real publish moment — rendering it in the viewer's local zone shows a
  // misleading time (e.g. 20:00 in US Eastern). Suppress it; the exact date is
  // already in the card footer and the feed is grouped by day. Only show a clock
  // time when the source actually provided one.
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) return '';
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

function cdFmtDate(publishedAt) {
  if (!publishedAt) return '';
  return new Date(publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Journal IF / JCR-quartile lookup ─────────────────────────────────────────
// journals.json is a small hand-maintained table (updated once a year when the
// new JCR drops). Items carry a `journal` field (canonical name from sources.json
// or the PubMed record); we match it against name+aliases, normalized.
function cdNormJournal(s) {
  return (s || '').toLowerCase()
    .replace(/\(.*?\)/g, ' ')   // "Lancet (London, England)" → "Lancet"
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/^the /, '');
}

window.CD_JOURNALS = {}; // normalized alias → { name, if, quartile, year }

function cdJournalMeta(journal) {
  if (!journal) return null;
  return window.CD_JOURNALS[cdNormJournal(journal)] || null;
}

// ── Source-wall attribution ─────────────────────────────────────────────────
// Most journal articles arrive via the PubMed pipeline, so item.source says
// "PubMed" while the journal lives in item.journal — keying the Sources wall
// on item.source alone starves every journal card (and inflates PubMed).
// cdWallSource re-attributes a story to its curated journal source when the
// journal matches a sources.json journalName (via the journals.json alias
// table first, then raw normalization). No match → falls back to item.source,
// so PubMed's own card counts only what stays unattributed.
window.CD_WALL_BY_JOURNAL = {}; // normalized journalName → sources.json name (built in CD_DATA_READY)

function cdWallSource(item) {
  const map = window.CD_WALL_BY_JOURNAL;
  if (item.journal) {
    const n = cdNormJournal(item.journal);
    const meta = window.CD_JOURNALS[n]; // canonical name via alias table
    const hit = (meta && map[cdNormJournal(meta.name)]) || map[n];
    if (hit) return hit;
  }
  return item.source;
}

function cdTransformItem(item) {
  return {
    id:          item.id,
    day:         cdDayBucket(item.publishedAt),
    category:    item.category,
    score:       item.curatedScore,
    source:      item.source,
    wallSource:  cdWallSource(item), // curated journal if matched, else item.source (Sources wall stats)
    sourceUrl:   item.sourceUrl,
    journalMeta: cdJournalMeta(item.journal),
    publishedAt: item.publishedAt,  // raw ISO retained for SourcesGrid "latest" sort
    time:        cdFmtTime(item.publishedAt),
    date:        cdFmtDate(item.publishedAt),
    title:       item.title,
    summary:     item.summary,
    why:         item.curatedReason,
    // Bilingual content fields (cron-generated; may be absent on older items —
    // the display layer falls back to the original-language field).
    titleZh:     item.titleZh,
    summaryZh:   item.summaryZh,
    whyEn:       item.curatedReasonEn,
    tags:        item.tags || [],
    tech:        !!item.tech, // 康复科技 overlay flag (cross-cutting, see XCUTS)
    related:     item.related || [],  // other outlets covering the same story (关联讨论)
  };
}
// Exposed for the Daily brief view — edition files store raw news.json
// snapshots, transformed to card shape at render time (files are IIFE-wrapped
// by build-app.js, so cross-file access must go through window.*).
window.cdTransformItem = cdTransformItem;

// ── Static side-rail content ────────────────────────────────────────────────
// Left-nav is not in news.json; it's product chrome.

window.CD_NAV = [
  { id: 'curated',  label: 'Curated',     icon: 'sparkles' },
  { id: 'all',      label: 'All stories', icon: 'list' },
  { id: 'daily',    label: 'Daily brief', icon: 'newspaper' },
  { id: 'sources',  label: 'Sources',     icon: 'rss' },
  { id: 'about',    label: 'About',       icon: 'info' },
  { id: 'feedback', label: 'Feedback',    icon: 'message-circle' },
];

// ── Async load → render ─────────────────────────────────────────────────────
// Module-level promise so app.main.jsx can render after the data is available;
// avoids a flash of empty feed.

window.CD_DATA_READY = (async () => {
  try {
    const [newsRes, srcRes, jrnRes] = await Promise.all([
      fetch('news.json', { cache: 'no-store' }),
      fetch('sources.json', { cache: 'no-store' }),
      fetch('journals.json', { cache: 'no-store' }),
    ]);
    if (!newsRes.ok) throw new Error(`news.json HTTP ${newsRes.status}`);
    // Journal IF table must be indexed BEFORE cdTransformItem runs (badge lookup).
    if (jrnRes.ok) {
      try {
        const jrn = await jrnRes.json();
        (jrn.journals || []).forEach((j) => {
          const meta = { name: j.name, if: j.impactFactor, quartile: j.quartile, year: jrn.jcrYear };
          [j.name, ...(j.aliases || [])].forEach((a) => { window.CD_JOURNALS[cdNormJournal(a)] = meta; });
        });
      } catch (e) { console.error('[Cadence] journals.json parse failed:', e); }
    }
    // Sources must be indexed BEFORE cdTransformItem runs — wallSource
    // attribution (journal → curated source) depends on CD_WALL_BY_JOURNAL.
    window.CD_SOURCES = srcRes.ok ? await srcRes.json() : [];
    window.CD_SOURCES.forEach((s) => {
      if (s.journalName) window.CD_WALL_BY_JOURNAL[cdNormJournal(s.journalName)] = s.name;
    });
    const data = await newsRes.json();
    window.CD_STORIES = (data.items || []).map(cdTransformItem);
    window.CD_META = data.meta || {};
    // Multi-source hot topics; empty = strip hidden. Heat is recomputed
    // client-side (same formula as the cron: sources × 0.5^(days/2)) because
    // quiet-hour runs skip the news.json write — without this, decay freezes
    // and a stale topic could stay pinned for days.
    const cdById = {};
    window.CD_STORIES.forEach((s) => { cdById[s.id] = s; });
    window.CD_HOT = (data.hotTopics || [])
      .map((t) => ({
        ...t,
        titleZh: t.titleZh || (cdById[t.id] && cdById[t.id].titleZh), // zh title via the representative story
        heat: t.sourceCount * Math.pow(0.5, Math.max(0, (Date.now() - new Date(t.publishedAt)) / 86400000) / 2),
      }))
      .filter((t) => t.heat >= 1.2)
      .sort((a, b) => b.heat - a.heat);
  } catch (err) {
    console.error('[Cadence] data load failed:', err);
    window.CD_STORIES = [];
    window.CD_META = { error: err.message };
    window.CD_HOT = [];
    window.CD_SOURCES = window.CD_SOURCES || [];
  }
})();

// ── Archive (历史归档) ────────────────────────────────────────────────────────
// The "All stories" view is the permanent superset: live feed + every story
// ever archived by scripts/news-refresh.js (archive/YYYY-MM.json, manifest in
// archive/index.json). Loaded lazily — only when the user first opens that
// view — so Curated stays as fast as before. Returns archive-only items
// (already-in-feed stories are deduped out by sourceUrl/id) in CD_STORIES
// shape, newest first. Cached promise: at most one network round per session.
window.CD_ARCHIVE_READY = null;
// onProgress(loaded, total) — called after each month file finishes.
// Only fires on the first load; subsequent callers get the cached promise
// with no callback (archive is already in memory).
window.CD_LOAD_ARCHIVE = (onProgress) => {
  if (window.CD_ARCHIVE_READY) return window.CD_ARCHIVE_READY;
  window.CD_ARCHIVE_READY = (async () => {
    try {
      // Manifest changes when new months are added — keep no-store so we
      // always get the current list of files.
      const idxRes = await fetch('archive/index.json', { cache: 'no-store' });
      if (!idxRes.ok) throw new Error(`archive/index.json HTTP ${idxRes.status}`);
      const manifest = await idxRes.json();
      const files = (manifest.months || []).map((m) => m.file).filter(Boolean);
      // Dedupe against the live feed AND across month files (a story can sit
      // in two month files if it straddles a month boundary). Feed ids are
      // regenerated per run, so sourceUrl is the stable identity; id is kept
      // as a secondary guard.
      const seen = new Set();
      (window.CD_STORIES || []).forEach((s) => {
        if (s.sourceUrl) seen.add(s.sourceUrl);
        if (s.id) seen.add(s.id);
      });
      let loaded = 0;
      const total = files.length;
      if (onProgress) onProgress(0, total);
      // Month files are static (historical) — let the browser cache them.
      // Only the manifest (index.json) needs no-store since it changes on
      // each new month. This avoids re-downloading all history every session.
      const months = await Promise.all(files.map((f) =>
        fetch(`archive/${f}`, { cache: 'default' })
          .then((r) => (r.ok ? r.json() : { items: [] }))
          .catch(() => ({ items: [] }))
          .then((data) => { loaded++; if (onProgress) onProgress(loaded, total); return data; })
      ));
      const out = [];
      for (const data of months) {
        for (const item of (data.items || [])) {
          const key = item.sourceUrl || item.title;
          if ((key && seen.has(key)) || (item.id && seen.has(item.id))) continue;
          if (key) seen.add(key);
          if (item.id) seen.add(item.id);
          out.push(cdTransformItem(item));
        }
      }
      out.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
      return out;
    } catch (err) {
      console.error('[Cadence] archive load failed:', err);
      return [];
    }
  })();
  return window.CD_ARCHIVE_READY;
};

// ── Daily editions (网页日报) ─────────────────────────────────────────────────
// AIHOT-style fixed daily slices written by scripts/daily-brief.js. The view
// loads the manifest lazily on first open, then individual editions on demand.
// Both caches are per-session promises — at most one network round per file.
window.CD_DAILY_INDEX_READY = null;
window.CD_LOAD_DAILY_INDEX = () => {
  if (window.CD_DAILY_INDEX_READY) return window.CD_DAILY_INDEX_READY;
  window.CD_DAILY_INDEX_READY = fetch('briefs/daily/index.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : { editions: [] }))
    .then((j) => j.editions || [])
    .catch((err) => { console.error('[Cadence] daily index load failed:', err); return []; });
  return window.CD_DAILY_INDEX_READY;
};
window.CD_DAILY_CACHE = {};
window.CD_LOAD_DAILY = (date) => {
  if (window.CD_DAILY_CACHE[date]) return window.CD_DAILY_CACHE[date];
  window.CD_DAILY_CACHE[date] = fetch(`briefs/daily/${date}.json`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .catch((err) => { console.error('[Cadence] daily edition load failed:', err); return null; });
  return window.CD_DAILY_CACHE[date];
};

// ── Source wall ──────────────────────────────────────────────────────────────
// Canonical roster lives in sources.json (single source of truth, shared with
// scripts/news-refresh.js which constrains Exa to these domains). Loaded into
// window.CD_SOURCES inside CD_DATA_READY above. Add a source: edit sources.json.
