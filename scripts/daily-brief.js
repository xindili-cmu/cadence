/**
 * Cadence 步频 — web daily edition generator (AIHOT-style 日报).
 *
 * Reads news.json (last 24-26h window) and writes a structured edition file
 * the site's Daily brief view renders directly:
 *
 *   briefs/daily/YYYY-MM-DD.json   one immutable edition (lead + sections +
 *                                  flashes + stats; items are full snapshots,
 *                                  so editions survive feed rotation)
 *   briefs/daily/index.json        archive manifest, newest first
 *
 * Modeled on the AIHOT /daily pattern: one fixed slice per day, a bilingual
 * editor's lead written by the LLM, fixed category sections, footer stats,
 * prev/next navigation via the manifest. The LLM writes ONLY the lead — the
 * sections are deterministic from curated scores, so a failed LLM call
 * degrades to a stats-based lead instead of killing the edition.
 *
 * Usage:
 *   node scripts/daily-brief.js              (skips when REFRESH_MODE=direct)
 *   DRY_RUN=true node scripts/daily-brief.js (prints, writes nothing)
 */

const fs = require('fs');
const path = require('path');
const { callAnthropic, callGemini, LLM_PROVIDER } = require('./news-refresh.js');

const DRY_RUN = process.env.DRY_RUN === 'true';
const NEWS_PATH = path.join(__dirname, '..', 'news.json');
const DAILY_DIR = path.join(__dirname, '..', 'briefs', 'daily');
const IDX_PATH = path.join(DAILY_DIR, 'index.json');
const LEDGER_PATH = path.join(DAILY_DIR, 'published-ledger.json'); // B: already-published sourceUrls
const LEDGER_RETENTION_DAYS = 45;  // prune ledger rows older than this (Beijing date)
// Window caps — NOT the window itself. The real window is a relay baton: it
// starts where the previous edition's window ended (see prevWindowEnd), so
// consecutive editions partition time with zero overlap. These caps only bound
// how far back a single run may reach if a prior run was missed (outage), so a
// gap never dumps an unbounded backlog. Weekend gets a wider cap because
// journals go quiet, so a Mon-morning recovery may need to reach across two
// quiet days. Weekday/weekend is decided in Beijing time (beijingWeekday).
const WINDOW_HOURS_WEEKDAY = 26;
const WINDOW_HOURS_WEEKEND = 50;

// Beijing calendar weekday at run time (0=Sun, 6=Sat).
function beijingWeekday() {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' })).getDay();
}
function windowHours() {
  const day = beijingWeekday();
  return (day === 0 || day === 6) ? WINDOW_HOURS_WEEKEND : WINDOW_HOURS_WEEKDAY;
}
// Age guard for 今日: firstSeen decides what enters the window, but a study
// whose publishedAt is older than this (e.g. a years-old paper a feed only just
// surfaced, or a catch-up backfill) is kept OUT of the daily edition so it can't
// headline "今日". It still lands in the main feed (news.json) normally — this
// only governs the daily edition. Generous enough for real publisher delays,
// tight enough to block ancient backfill. One number to tune.
const MAX_PUBLISH_AGE_DAYS = 14;
const SECTION_CAP = 6;         // per-section item ceiling — keeps one edition scannable

// Section order mirrors the site's CATEGORIES order (components/feed/categories.js).
const SECTION_ORDER = [
  'orthopedic', 'neurological', 'sports', 'pediatric',
  'geriatric', 'cardiopulmonary', 'manual-modality', 'practice',
];
const CAT_ZH = {
  orthopedic: '骨科与肌骨', neurological: '神经康复', sports: '运动康复',
  pediatric: '儿童康复', geriatric: '老年康复', cardiopulmonary: '心肺康复',
  'manual-modality': '手法与理疗', practice: '行业与执业',
};

// Edition date = Beijing calendar date at run time (cron fires 21:30 UTC =
// 05:30 next day Beijing; the edition belongs to the Beijing morning it serves).
function beijingDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

// A — relay baton: the end (windowEnd) of the most recent edition STRICTLY
// before today. The next window starts here, so no time span is ever covered by
// two editions. Returns ms epoch, or null when there is no prior edition (or it
// predates this field — graceful bootstrap to the cap window). Looking only at
// dates < today keeps same-day reruns idempotent.
function prevWindowEnd(todayDate) {
  try {
    const idx = JSON.parse(fs.readFileSync(IDX_PATH, 'utf8'));
    const prior = (idx.editions || [])
      .filter(e => e.date < todayDate && e.windowEnd)
      .sort((a, b) => b.date.localeCompare(a.date));
    return prior.length ? Date.parse(prior[0].windowEnd) : null;
  } catch { return null; }
}

// B — published-URL ledger. On first run (file absent) seed it from every
// existing edition so the very next edition already dedups against history —
// no leakage during rollout. Shape: { updatedAt, urls: [{ url, date }] }.
function loadLedger() {
  try {
    const l = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    if (l && Array.isArray(l.urls)) return l;
  } catch { /* missing / malformed → seed below */ }
  const urls = [];
  try {
    for (const f of fs.readdirSync(DAILY_DIR)) {
      if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) continue;
      const e = JSON.parse(fs.readFileSync(path.join(DAILY_DIR, f), 'utf8'));
      const all = (e.sections || []).flatMap(s => s.items || []).concat(e.flashes || []);
      for (const i of all) if (i.sourceUrl) urls.push({ url: i.sourceUrl, date: e.date });
    }
  } catch { /* no editions yet */ }
  return { updatedAt: null, urls };
}

// Beijing-calendar date string N days before `fromDate` (YYYY-MM-DD).
function isoDateNDaysAgo(n, fromDate) {
  const d = new Date(`${fromDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// Strict-ish JSON extraction: LLMs occasionally wrap output in ``` fences.
function parseLeadJson(raw) {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    const o = JSON.parse(cleaned);
    if (o && o.titleZh && o.paragraphZh && o.titleEn && o.paragraphEn) return o;
  } catch { /* fall through */ }
  return null;
}

async function generateLead(dateStr, sections, stats) {
  const digest = sections.flatMap(sec => sec.items.map(i => ({
    category: CAT_ZH[sec.category] || sec.category,
    title: i.title, titleZh: i.titleZh || null,
    score: i.curatedScore, studyDesign: i.studyDesign || null, source: i.source,
    multiSource: (i.related || []).length + 1,
  })));

  // Highest-signal items by global score-desc. The lead must treat these as the
  // entries worth headlining, and must take each study's type verbatim from
  // studyDesign rather than inferring it (the source of the 06-16 CTS mislabel).
  const top = sections.flatMap(s => s.items)
    .slice().sort((a, b) => b.curatedScore - a.curatedScore)
    .slice(0, 3)
    .map(i => ({
      titleZh: i.titleZh || i.title,
      score: i.curatedScore,
      studyDesign: i.studyDesign || null,
      category: CAT_ZH[i.category] || i.category,
    }));

  const systemPrompt = `你是「步频 Cadence」（面向物理治疗/康复临床医师的循证新闻品牌）日报的主编。口吻：资深同行，给判断不给 recap，数字优先于形容词，不夸大单项研究，不用 emoji 和感叹号。

根据当日条目写日报头版导语，输出严格的 JSON（不要任何其他文字、不要 markdown 代码块）：
{
  "titleZh": "中文头条标题——当天最值得临床 PT 花时间的一条或一个趋势，≤25 字，信息保真不标题党",
  "titleEn": "英文头条标题，与中文同义，简洁",
  "paragraphZh": "中文导语 2-3 句：今天信号的整体观感（几条、哪个方向值得花时间、哪条 curatedScore 最高最值得关注），口语但专业",
  "paragraphEn": "英文导语，与中文同义，自然英文而非直译"
}

禁止虚构数字；条目里没有的信息不要编。
研究类型（RCT／系统综述／综述／观察研究／述评）必须直接采用条目提供的 studyDesign 字段，严禁自行推断或改写；提及"最值得关注／证据等级最高"时，以 curatedScore 最高的条目（见"最高分条目"）为准。`;

  const userPrompt = `日期：${dateStr}\n统计：${JSON.stringify(stats)}\n最高分条目（已按分数降序，研究类型以 studyDesign 为准）：\n${JSON.stringify(top, null, 1)}\n条目：\n${JSON.stringify(digest, null, 1)}`;

  // Network/API failures degrade to the deterministic fallback lead — the
  // edition itself never depends on the LLM being reachable.
  try {
    const raw = LLM_PROVIDER === 'gemini'
      ? await callGemini(systemPrompt, userPrompt)
      : await callAnthropic(systemPrompt, userPrompt);
    return parseLeadJson(raw);
  } catch (e) {
    console.warn(`  ⚠️ LLM call failed: ${e.message}`);
    return null;
  }
}

// Deterministic fallback lead — never blocks the edition on an LLM hiccup.
function fallbackLead(sections, stats) {
  const top = sections.flatMap(s => s.items).sort((a, b) => b.curatedScore - a.curatedScore)[0];
  return {
    titleZh: (top && (top.titleZh || top.title)) || '今日康复信号',
    titleEn: (top && top.title) || "Today's rehab signal",
    paragraphZh: `今日共 ${stats.events} 条信号，覆盖 ${stats.specialties} 个专科，其中 ${stats.multiSource} 条为多信源报道。`,
    paragraphEn: `${stats.events} signals across ${stats.specialties} specialties today, ${stats.multiSource} with multi-source coverage.`,
    fallback: true,
  };
}

// Core selection (extracted for deterministic testing): keep items whose
// firstSeen (ingestion time; fallback publishedAt for legacy items) is in the
// relay window (cutoff, nowMs], drop any sourceUrl already published
// (publishedBefore) or seen earlier in this same window, score-desc.
// Windowing on firstSeen, not publishedAt, is deliberate: journals' publish
// dates lag ingestion by days, so a publishedAt window starves "今日" of items
// we actually caught today. firstSeen tracks what we caught, matching the
// daily-update promise. publishFloor (epoch ms) is the age guard: an item whose
// publishedAt is older than the floor is excluded even if freshly caught, so a
// years-old paper can't headline 今日. publishFloor=0 disables the guard
// (legacy/test callers, and items lacking a parseable publishedAt are unaffected).
function selectWindowItems(items, cutoff, nowMs, publishedBefore = new Set(), publishFloor = 0) {
  let ledgerSkips = 0;
  let ageSkips = 0;
  const seen = new Set();
  const windowItems = (items || [])
    .filter(i => {
      const ts = new Date(i.firstSeen || i.publishedAt).getTime();
      if (!(ts > cutoff && ts <= nowMs)) return false;                          // relay window (firstSeen)
      // Age guard: firstSeen got it INTO the window; publishedAt keeps a
      // genuinely ancient study OUT. Only excludes old items, never adds any.
      const pub = new Date(i.publishedAt).getTime();
      if (publishFloor && !Number.isNaN(pub) && pub < publishFloor) { ageSkips++; return false; } // too old for 今日
      if (publishedBefore.has(i.sourceUrl)) { ledgerSkips++; return false; }    // already published
      if (seen.has(i.sourceUrl)) return false;                                  // dup inside window
      seen.add(i.sourceUrl);
      return true;
    })
    .sort((a, b) => b.curatedScore - a.curatedScore);
  return { windowItems, ledgerSkips, ageSkips };
}

async function main() {
  console.log(`\n📰 步频网页日报 — ${new Date().toISOString()}`);
  if (process.env.REFRESH_MODE === 'direct') { console.log('  direct mode — daily edition is a full-run product, skipping.'); return; }

  const data = JSON.parse(fs.readFileSync(NEWS_PATH, 'utf8'));
  const dateStr = beijingDate();
  const WINDOW_HOURS = windowHours();
  const isWeekend = WINDOW_HOURS === WINDOW_HOURS_WEEKEND;
  const nowMs = Date.now();
  const capCutoff = nowMs - WINDOW_HOURS * 3600 * 1000;

  // A — relay baton: this window picks up exactly where the previous edition's
  // window ended, clamped so a missed run never reaches back past the cap.
  const prevEnd = prevWindowEnd(dateStr);
  const cutoff = prevEnd != null ? Math.max(prevEnd, capCutoff) : capCutoff;

  // B — ledger reconcile: drop any sourceUrl already shipped in a PRIOR edition
  // (date !== today keeps same-day reruns idempotent), plus de-dup within the
  // window. Belt-and-suspenders: even if the relay window ever overlaps (clock
  // skew, manual rerun), no URL can go out twice.
  const ledger = loadLedger();
  const publishedBefore = new Set(ledger.urls.filter(u => u.date !== dateStr).map(u => u.url));
  const publishFloor = nowMs - MAX_PUBLISH_AGE_DAYS * 24 * 3600 * 1000;
  const { windowItems, ledgerSkips, ageSkips } = selectWindowItems(data.items, cutoff, nowMs, publishedBefore, publishFloor);

  const winSpan = `${new Date(cutoff).toISOString().slice(5, 16).replace('T', ' ')}→${new Date(nowMs).toISOString().slice(5, 16).replace('T', ' ')}Z`;
  if (!windowItems.length) {
    console.log(`  窗口 ${winSpan} 无新条目（账本去重跳过 ${ledgerSkips} 条，超龄跳过 ${ageSkips} 条），今日不出刊。`);
    return;
  }

  // Sections: fixed category order, score-desc inside, capped. Overflow → 快讯.
  const sections = [];
  const flashes = [];
  for (const cat of SECTION_ORDER) {
    const all = windowItems.filter(i => i.category === cat);
    if (!all.length) continue;
    sections.push({ category: cat, label: CAT_ZH[cat], items: all.slice(0, SECTION_CAP) });
    for (const extra of all.slice(SECTION_CAP)) {
      flashes.push({
        title: extra.title, titleZh: extra.titleZh || null,
        source: extra.source, sourceUrl: extra.sourceUrl, publishedAt: extra.publishedAt,
        // Real journal name for the flash-row label — "PubMed" is a pipeline,
        // not a journal (2026-07-08 adversarial-review fix #10).
        journal: extra.journal || null,
      });
    }
  }
  // Items with categories outside the roster still surface as flashes.
  for (const stray of windowItems.filter(i => !SECTION_ORDER.includes(i.category))) {
    flashes.push({
      title: stray.title, titleZh: stray.titleZh || null,
      source: stray.source, sourceUrl: stray.sourceUrl, publishedAt: stray.publishedAt,
      journal: stray.journal || null,
    });
  }

  const sectionItems = sections.flatMap(s => s.items);
  const stats = {
    events: windowItems.length,
    specialties: sections.length,
    multiSource: windowItems.filter(i => (i.related || []).length > 0).length,
    sources: new Set(windowItems.map(i => i.source)).size,
    topScore: sectionItems.length ? Math.max(...sectionItems.map(i => i.curatedScore)) : null,
  };

  console.log(`  ${stats.events} 条进刊 · ${stats.specialties} 个版块 · ${flashes.length} 条快讯 · 窗口 ${winSpan}（接力${prevEnd != null ? '' : '·首期回看' + WINDOW_HOURS + 'h'}${isWeekend ? '·周末上限' + WINDOW_HOURS + 'h' : ''}）· 账本去重跳过 ${ledgerSkips} 条 · LLM: ${LLM_PROVIDER}`);

  if (DRY_RUN) {
    console.log('  DRY_RUN — sections:', sections.map(s => `${s.category}×${s.items.length}`).join(' '));
    return;
  }

  let lead = await generateLead(dateStr, sections, stats);
  if (!lead) { console.warn('  ⚠️ 导语生成失败，使用确定性导语。'); lead = fallbackLead(sections, stats); }

  const windowEnd = new Date(nowMs).toISOString();
  const edition = {
    date: dateStr,
    generatedAt: new Date().toISOString(),
    windowHours: WINDOW_HOURS,       // the cap in force (relay governs the actual span)
    windowStart: new Date(cutoff).toISOString(),
    windowEnd,                       // next edition's relay baton starts here
    lead,
    stats,
    sections,   // items are full news.json snapshots — render-ready, rotation-proof
    flashes,
  };

  fs.mkdirSync(DAILY_DIR, { recursive: true });
  fs.writeFileSync(path.join(DAILY_DIR, `${dateStr}.json`), JSON.stringify(edition, null, 1) + '\n');

  // Manifest: replace same-date entry (reruns), newest first. windowEnd is the
  // relay baton prevWindowEnd() reads for the next edition.
  let editions = [];
  try { editions = (JSON.parse(fs.readFileSync(IDX_PATH, 'utf8')).editions || []); } catch { /* first edition */ }
  editions = editions.filter(e => e.date !== dateStr);
  editions.push({
    date: dateStr,
    leadTitle: lead.titleEn, leadTitleZh: lead.titleZh,
    events: stats.events,
    windowEnd,
  });
  editions.sort((a, b) => b.date.localeCompare(a.date));
  fs.writeFileSync(IDX_PATH, JSON.stringify({ updatedAt: new Date().toISOString(), editions }, null, 1) + '\n');

  // B — advance the published-URL ledger: drop today's old rows (idempotent
  // reruns), add this edition's URLs, prune rows past the retention horizon.
  const editionUrls = windowItems.map(i => i.sourceUrl).filter(Boolean);
  const minDate = isoDateNDaysAgo(LEDGER_RETENTION_DAYS, dateStr);
  const ledgerRows = ledger.urls
    .filter(u => u.date !== dateStr && u.date >= minDate)
    .concat(editionUrls.map(url => ({ url, date: dateStr })));
  fs.writeFileSync(LEDGER_PATH, JSON.stringify({ updatedAt: new Date().toISOString(), urls: ledgerRows }, null, 1) + '\n');

  console.log(`  ✅ briefs/daily/${dateStr}.json + index.json（共 ${editions.length} 期）· 账本 ${ledgerRows.length} 条`);
}

if (require.main === module) {
  main().catch(e => { console.error('❌', e); process.exit(1); });
}

module.exports = { main, selectWindowItems, isoDateNDaysAgo };
