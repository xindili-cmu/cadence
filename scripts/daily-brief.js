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
const WINDOW_HOURS_WEEKDAY = 26;  // daily full-run cadence + slack
const WINDOW_HOURS_WEEKEND = 50;  // Sat/Sun: merge two days of articles (journals go quiet on weekends)

// Beijing calendar weekday at run time (0=Sun, 6=Sat).
function beijingWeekday() {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' })).getDay();
}
function windowHours() {
  const day = beijingWeekday();
  return (day === 0 || day === 6) ? WINDOW_HOURS_WEEKEND : WINDOW_HOURS_WEEKDAY;
}
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
    score: i.curatedScore, source: i.source,
    multiSource: (i.related || []).length + 1,
  })));

  const systemPrompt = `你是「步频 Cadence」（面向物理治疗/康复临床医师的循证新闻品牌）日报的主编。口吻：资深同行，给判断不给 recap，数字优先于形容词，不夸大单项研究，不用 emoji 和感叹号。

根据当日条目写日报头版导语，输出严格的 JSON（不要任何其他文字、不要 markdown 代码块）：
{
  "titleZh": "中文头条标题——当天最值得临床 PT 花时间的一条或一个趋势，≤25 字，信息保真不标题党",
  "titleEn": "英文头条标题，与中文同义，简洁",
  "paragraphZh": "中文导语 2-3 句：今天信号的整体观感（几条、哪个方向值得花时间、哪条证据等级最高），口语但专业",
  "paragraphEn": "英文导语，与中文同义，自然英文而非直译"
}

禁止虚构数字；条目里没有的信息不要编。`;

  const userPrompt = `日期：${dateStr}\n统计：${JSON.stringify(stats)}\n条目：\n${JSON.stringify(digest, null, 1)}`;

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

async function main() {
  console.log(`\n📰 步频网页日报 — ${new Date().toISOString()}`);
  if (process.env.REFRESH_MODE === 'direct') { console.log('  direct mode — daily edition is a full-run product, skipping.'); return; }

  const data = JSON.parse(fs.readFileSync(NEWS_PATH, 'utf8'));
  const WINDOW_HOURS = windowHours();
  const isWeekend = WINDOW_HOURS === WINDOW_HOURS_WEEKEND;
  const cutoff = Date.now() - WINDOW_HOURS * 3600 * 1000;
  const windowItems = (data.items || [])
    .filter(i => new Date(i.publishedAt).getTime() >= cutoff)
    .sort((a, b) => b.curatedScore - a.curatedScore);

  if (!windowItems.length) { console.log(`  近 ${WINDOW_HOURS}h 无新条目，今日不出刊。`); return; }

  const dateStr = beijingDate();

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
      });
    }
  }
  // Items with categories outside the roster still surface as flashes.
  for (const stray of windowItems.filter(i => !SECTION_ORDER.includes(i.category))) {
    flashes.push({
      title: stray.title, titleZh: stray.titleZh || null,
      source: stray.source, sourceUrl: stray.sourceUrl, publishedAt: stray.publishedAt,
    });
  }

  const sectionItems = sections.flatMap(s => s.items);
  const stats = {
    events: windowItems.length,
    specialties: sections.length,
    multiSource: windowItems.filter(i => (i.related || []).length > 0).length,
    sources: new Set(windowItems.map(i => i.source)).size,
    topScore: sectionItems.length ? sectionItems[0].curatedScore : null,
  };

  console.log(`  ${stats.events} 条进刊 · ${stats.specialties} 个版块 · ${flashes.length} 条快讯 · 窗口 ${WINDOW_HOURS}h${isWeekend ? '（周末合并）' : ''} · LLM: ${LLM_PROVIDER}`);

  if (DRY_RUN) {
    console.log('  DRY_RUN — sections:', sections.map(s => `${s.category}×${s.items.length}`).join(' '));
    return;
  }

  let lead = await generateLead(dateStr, sections, stats);
  if (!lead) { console.warn('  ⚠️ 导语生成失败，使用确定性导语。'); lead = fallbackLead(sections, stats); }

  const edition = {
    date: dateStr,
    generatedAt: new Date().toISOString(),
    windowHours: WINDOW_HOURS,
    lead,
    stats,
    sections,   // items are full news.json snapshots — render-ready, rotation-proof
    flashes,
  };

  fs.mkdirSync(DAILY_DIR, { recursive: true });
  fs.writeFileSync(path.join(DAILY_DIR, `${dateStr}.json`), JSON.stringify(edition, null, 1) + '\n');

  // Manifest: replace same-date entry (reruns), newest first.
  const idxPath = path.join(DAILY_DIR, 'index.json');
  let editions = [];
  try { editions = (JSON.parse(fs.readFileSync(idxPath, 'utf8')).editions || []); } catch { /* first edition */ }
  editions = editions.filter(e => e.date !== dateStr);
  editions.push({
    date: dateStr,
    leadTitle: lead.titleEn, leadTitleZh: lead.titleZh,
    events: stats.events,
  });
  editions.sort((a, b) => b.date.localeCompare(a.date));
  fs.writeFileSync(idxPath, JSON.stringify({ updatedAt: new Date().toISOString(), editions }, null, 1) + '\n');

  console.log(`  ✅ briefs/daily/${dateStr}.json + index.json（共 ${editions.length} 期）`);
}

if (require.main === module) {
  main().catch(e => { console.error('❌', e); process.exit(1); });
}

module.exports = { main };
