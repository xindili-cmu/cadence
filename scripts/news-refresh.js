/**
 * Cadence News Refresh — Curated Physical Therapy / Rehab News Feed
 * (Brand locked 2026-06-09: Cadence, scrubs-blue palette)
 *
 * 8 PT Verticals (slug authority: design-system/components/feed/categories.js):
 *   1. Orthopedic        — spine, knee, shoulder, hand-wrist, foot-ankle, hip, pelvic-floor
 *   2. Neurological      — stroke, parkinson, ms, brain-injury, spinal-cord, vestibular
 *   3. Sports & Athletic — return-to-sport, injury prevention, performance
 *   4. Pediatric         — developmental disorders, early intervention
 *   5. Geriatric         — fall prevention, frailty, aged care
 *   6. Cardiopulmonary   — COPD, cardiac rehab
 *   7. Manual & Modality — dry-needling, iastm, electro, laser, taping, manipulation
 *   8. Practice          — reimbursement, regulation, telehealth, education, ethics, workforce
 *
 * Audience: clinicians (practicing + academic). NOT patient-facing.
 * Geo: US + China + Australia.
 *
 * Pipeline: Exa search → cluster (dedup + related sources) → Claude curation
 *           → merge → hot topics (multi-source heat, time decay) → news.json
 *
 * Env vars:
 *   EXA_API_KEY — required
 *   LLM_PROVIDER — 'anthropic' (default) or 'gemini'
 *   ANTHROPIC_API_KEY — required when LLM_PROVIDER=anthropic
 *   GEMINI_API_KEY — required when LLM_PROVIDER=gemini (free tier OK: 1 call/day)
 *   GEMINI_MODEL — optional, defaults to gemini-flash-latest
 *
 * Usage:
 *   node scripts/news-refresh.js
 *   DRY_RUN=true node scripts/news-refresh.js
 *   LLM_PROVIDER=gemini GEMINI_API_KEY=... node scripts/news-refresh.js
 */

const fs = require('fs');
const path = require('path');

const EXA_API_KEY = process.env.EXA_API_KEY;
const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const DRY_RUN = process.env.DRY_RUN === 'true';
// 'full' = Exa + PubMed + RSS (daily sweep). 'direct' = PubMed + RSS only —
// free to run, so it polls every 2h AIHOT-style; exits before the LLM call
// when nothing new arrived, so quiet runs cost zero.
const REFRESH_MODE = (process.env.REFRESH_MODE || 'full').toLowerCase();

const NEWS_PATH = path.join(__dirname, '..', 'news.json');

// ── Source roster (AIHOT-style: the wall IS the universe) ───────────────────
// sources.json is the single source of truth, shared with the frontend
// (app.data.jsx fetches it for the Sources view). Exa searches are constrained
// to these domains via includeDomains, and anything that still slips through
// is dropped. Adding a source = editing sources.json, nothing else.
const SOURCES = require(path.join(__dirname, '..', 'sources.json'));
const SOURCE_HOSTNAMES = [...new Set(SOURCES.map(s => s.domain.split('/')[0]))];
const MAX_ITEMS = 30;
const LOOKBACK_DAYS = 7; // PT news cadence is slower than climate-tech; revisit after 2 weeks
const CURATE_TOP_N = 40; // Exa + PubMed + RSS all feed one batch now

// ── PT Category Queries ─────────────────────────────────────────────────────
// Slugs are the canonical short form used by the UI components in
// design-system/components/feed/categories.js. Don't drift from that file.
// Taxonomy reference: PT_session_handoff.md locked 8-cat list (2026-06-09).
// Chinese queries are experimental — delete if they return junk after ~1 week
// and route zh ingestion through PubMed/RSS/direct-fetch instead.

const CATEGORY_QUERIES = [
  {
    category: 'orthopedic',
    queries: [
      'orthopedic physical therapy randomized trial outcomes 2026',
      'low back pain knee shoulder rehabilitation clinical guideline update',
      'pelvic floor physiotherapy evidence research',
      '骨科康复 物理治疗 临床研究进展'
    ]
  },
  {
    category: 'neurological',
    queries: [
      'stroke rehabilitation neuroplasticity physical therapy trial 2026',
      'parkinson vestibular balance training intervention research',
      'spinal cord injury brain injury rehabilitation evidence',
      '神经康复 脑卒中 物理治疗 研究'
    ]
  },
  {
    category: 'sports',
    queries: [
      'sports physical therapy injury prevention research 2026',
      'return to sport criteria ACL hamstring rehabilitation',
      'athletic recovery load management physiotherapy Australia'
    ]
  },
  {
    category: 'pediatric',
    queries: [
      'pediatric physical therapy cerebral palsy intervention 2026',
      'developmental coordination disorder early intervention outcomes',
      'pediatric rehabilitation telehealth research'
    ]
  },
  {
    category: 'geriatric',
    queries: [
      'geriatric physical therapy fall prevention trial 2026',
      'older adult balance strength training sarcopenia research',
      'frailty rehabilitation aged care outcomes Australia'
    ]
  },
  {
    category: 'cardiopulmonary',
    queries: [
      'cardiopulmonary rehabilitation physical therapy 2026',
      'pulmonary rehab COPD exercise prescription research',
      'cardiac rehabilitation phase II adherence outcomes'
    ]
  },
  {
    category: 'manual-modality',
    queries: [
      'dry needling physical therapy evidence trial 2026',
      'spinal manipulation joint mobilization IASTM research',
      'electrotherapy laser therapy taping clinical evidence'
    ]
  },
  {
    category: 'practice',
    queries: [
      'physical therapy reimbursement Medicare CPT policy 2026',
      'telehealth physical therapy regulation scope of practice',
      'physiotherapy workforce education AHPRA Australia policy',
      '康复医学 政策 医保 物理治疗师'
    ]
  }
];

// ── Exa API ─────────────────────────────────────────────────────────────────

async function searchExa(query, numResults = 5) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - LOOKBACK_DAYS);

  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': EXA_API_KEY
    },
    body: JSON.stringify({
      query,
      type: 'auto',
      numResults,
      includeDomains: SOURCE_HOSTNAMES,
      startPublishedDate: startDate.toISOString().split('T')[0],
      useAutoprompt: true,
      contents: {
        text: { maxCharacters: 800 },
        highlights: { numSentences: 2 }
      }
    })
  });

  if (!res.ok) {
    console.error(`  Exa error for "${query}": ${res.status}`);
    return [];
  }

  const data = await res.json();
  return (data.results || []).map(r => ({
    title: r.title || '',
    url: r.url || '',
    text: r.text || '',
    highlights: (r.highlights || []).join(' '),
    publishedDate: r.publishedDate || new Date().toISOString(),
    score: r.score || 0,
    source: matchSource(r.url)
  })).filter(r => r.source); // off-roster results are dropped, not relabeled
}

// Map a URL onto the source roster: hostname equals or is a subdomain of a
// roster domain (bjsm.bmj.com → BMJ). Roster domains with a path part
// ('academic.oup.com/ptj') also require the path prefix, so other OUP
// journals don't masquerade as PTJ. Returns the roster name, or null.
function matchSource(url) {
  try {
    const u = new URL(url);
    const hostname = u.hostname.replace(/^www\./, '');
    for (const s of SOURCES) {
      const [dom, ...pathParts] = s.domain.split('/');
      const hostOk = hostname === dom || hostname.endsWith('.' + dom);
      const pathOk = !pathParts.length || u.pathname.startsWith('/' + pathParts.join('/'));
      if (hostOk && pathOk) return s.name;
    }
    return null;
  } catch { return null; }
}

// ── Direct ingestion: PubMed E-utilities ────────────────────────────────────
// AIHOT-style source-first crawl, leg 1. Per-category PubMed queries over the
// last LOOKBACK_DAYS; esearch → efetch(abstract XML), parsed with zero deps.
// NCBI limit is 3 req/s without an API key — the 350ms sleeps keep us under.

const PUBMED_QUERIES = [
  { category: 'orthopedic',      term: '(physical therapy[tiab] OR physiotherapy[tiab] OR exercise therapy[tiab]) AND (low back pain[tiab] OR knee[tiab] OR shoulder[tiab] OR musculoskeletal[tiab] OR pelvic floor[tiab])' },
  { category: 'neurological',    term: '(rehabilitation[tiab] OR physical therapy[tiab] OR physiotherapy[tiab]) AND (stroke[tiab] OR parkinson[tiab] OR multiple sclerosis[tiab] OR spinal cord injury[tiab] OR vestibular[tiab])' },
  { category: 'sports',          term: '(sports physical therapy[tiab] OR return to sport[tiab] OR athletic rehabilitation[tiab] OR ACL rehabilitation[tiab] OR injury prevention[tiab]) AND (physiotherapy[tiab] OR rehabilitation[tiab])' },
  { category: 'pediatric',       term: '(pediatric[tiab] OR cerebral palsy[tiab] OR developmental coordination[tiab]) AND (physical therapy[tiab] OR physiotherapy[tiab] OR early intervention[tiab])' },
  { category: 'geriatric',       term: '(older adults[tiab] OR geriatric[tiab] OR frailty[tiab] OR sarcopenia[tiab]) AND (fall prevention[tiab] OR balance training[tiab] OR physical therapy[tiab] OR exercise[tiab])' },
  { category: 'cardiopulmonary', term: '(cardiac rehabilitation[tiab] OR pulmonary rehabilitation[tiab] OR COPD[tiab]) AND (exercise[tiab] OR physiotherapy[tiab] OR physical therapy[tiab])' },
  { category: 'manual-modality', term: '(dry needling[tiab] OR spinal manipulation[tiab] OR joint mobilization[tiab] OR taping[tiab] OR laser therapy[tiab] OR electrotherapy[tiab]) AND (trial[tiab] OR review[tiab])' },
  { category: 'practice',        term: '(physical therapy[tiab] OR physiotherapy[tiab]) AND (reimbursement[tiab] OR telehealth[tiab] OR scope of practice[tiab] OR workforce[tiab])' },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const xmlTag = (s, tag) => (s.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)) || [])[1] || '';
const stripTags = (s) => (s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
  .replace(/\s+/g, ' ').trim();

async function fetchPubMed() {
  const out = [];
  const base = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
  for (const q of PUBMED_QUERIES) {
    try {
      const es = await fetch(`${base}/esearch.fcgi?db=pubmed&retmode=json&retmax=8&reldate=${LOOKBACK_DAYS}&datetype=edat&sort=date&term=${encodeURIComponent(q.term)}`);
      if (!es.ok) { console.error(`  PubMed esearch ${q.category}: ${es.status}`); continue; }
      const ids = (await es.json()).esearchresult?.idlist || [];
      console.log(`   pubmed:${q.category} → ${ids.length}`);
      await sleep(350);
      if (!ids.length) continue;
      const ef = await fetch(`${base}/efetch.fcgi?db=pubmed&retmode=xml&rettype=abstract&id=${ids.join(',')}`);
      if (!ef.ok) { console.error(`  PubMed efetch ${q.category}: ${ef.status}`); continue; }
      const xml = await ef.text();
      for (const art of xml.split(/<PubmedArticle\b[^>]*>/).slice(1)) {
        const pmid = stripTags(xmlTag(art, 'PMID'));
        const title = stripTags(xmlTag(art, 'ArticleTitle'));
        if (!pmid || !title) continue;
        const abstract = stripTags((art.match(/<AbstractText[^>]*>[\s\S]*?<\/AbstractText>/g) || []).join(' '));
        const journal = stripTags(xmlTag(art, 'Title'));
        // entrez date ≈ when PubMed first saw it — the freshness signal we filter on
        const pdates = art.match(/<PubMedPubDate PubStatus="pubmed">[\s\S]*?<\/PubMedPubDate>/);
        let publishedDate = new Date().toISOString();
        if (pdates) {
          const y = xmlTag(pdates[0], 'Year'), m = xmlTag(pdates[0], 'Month'), d = xmlTag(pdates[0], 'Day');
          if (y) publishedDate = new Date(Date.UTC(+y, (+m || 1) - 1, +d || 1)).toISOString();
        }
        out.push({
          title, url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
          text: `${journal ? journal + '. ' : ''}${abstract}`.slice(0, 800),
          highlights: '', publishedDate, score: 0.5,
          source: 'PubMed', category: q.category
        });
      }
      await sleep(350);
    } catch (e) { console.error(`  PubMed ${q.category}: ${e.message}`); }
  }
  return out;
}

// ── Direct ingestion: RSS / Atom feeds ──────────────────────────────────────
// Leg 2: every roster source with an `rss` array in sources.json gets polled.
// Zero-dep parser (handles <item> and <entry>, CDATA, Atom href links).
// Items carry category:null — the critic assigns one of the 8 slugs.

function parseFeed(xml, sourceName) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/g) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/g) || [];
  const items = [];
  for (const b of blocks) {
    const title = stripTags(xmlTag(b, 'title'));
    let link = stripTags(xmlTag(b, 'link'));
    if (!link) link = (b.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
    if (!title || !link) continue;
    const dateRaw = stripTags(xmlTag(b, 'pubDate') || xmlTag(b, 'dc:date') || xmlTag(b, 'updated') || xmlTag(b, 'published'));
    const d = new Date(dateRaw);
    items.push({
      title, url: link.trim(),
      text: stripTags(xmlTag(b, 'description') || xmlTag(b, 'summary') || xmlTag(b, 'content')).slice(0, 800),
      highlights: '', publishedDate: isNaN(d) ? new Date().toISOString() : d.toISOString(),
      score: 0.5, source: sourceName, category: null
    });
  }
  return items;
}

async function fetchRssFeeds() {
  const out = [];
  for (const s of SOURCES) {
    for (const feed of s.rss || []) {
      try {
        const res = await fetch(feed, { headers: {
          'User-Agent': 'CadenceBot/1.0 (PT news aggregator)',
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
        } });
        if (!res.ok) { console.error(`  RSS ${s.name}: ${res.status}`); continue; }
        const got = parseFeed(await res.text(), s.name);
        console.log(`   rss:${s.name} → ${got.length}`);
        out.push(...got);
      } catch (e) { console.error(`  RSS ${s.name}: ${e.message}`); }
      await sleep(200);
    }
  }
  const cutoff = Date.now() - LOOKBACK_DAYS * 86400000;
  return out.filter(i => new Date(i.publishedDate).getTime() >= cutoff);
}

// ── Direct ingestion: listing-page scrape (AIHOT "网页" source type) ─────────
// Leg 3, for roster sources with no feed (associations, regulators, zh sites).
// Poll each `scrape` URL in sources.json, extract <a> links that resolve back
// to the same roster source, and diff against scrape-ledger.json: only links
// never seen before are ingested, stamped with DISCOVERY time (AIHOT does the
// same — 发现时间). First run per source is a silent snapshot, so a freshly
// added listing page never floods the feed with its backlog.

const LEDGER_PATH = path.join(__dirname, '..', 'scrape-ledger.json');
const LEDGER_TTL_DAYS = 60;

async function fetchScrapes() {
  let ledger = {};
  try { ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')); } catch {}
  const out = [];
  let ledgerDirty = false;

  for (const s of SOURCES) {
    for (const entry of s.scrape || []) {
      // Entries are either a bare URL string or {url, category} for listing
      // pages that map 1:1 onto a PT vertical (e.g. dxy.cn/sub/5 = 骨科).
      const listUrl = typeof entry === 'string' ? entry : entry.url;
      const presetCat = typeof entry === 'object' && entry.category ? entry.category : null;
      try {
        const res = await fetch(listUrl, { headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CadenceBot/1.0; PT news aggregator)',
          'Accept': 'text/html,application/xhtml+xml'
        } });
        if (!res.ok) { console.error(`  scrape ${s.name}: ${res.status}`); continue; }
        const html = await res.text();
        const links = new Map(); // canonical url -> {url, title}
        for (const m of html.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
          let abs; try { abs = new URL(m[1], listUrl).href; } catch { continue; }
          const title = stripTags(m[2]);
          // Heuristics: link must resolve to this same roster source, carry a
          // headline-length text, and not be the listing page itself.
          if (matchSource(abs) !== s.name) continue;
          // Headline-length gate; CJK headlines pack the same info into far
          // fewer chars (国家卫健委 titles run 15-20 chars), so lower bar there.
          const minLen = /[一-鿿]/.test(title) ? 10 : 25;
          if (title.length < minLen || abs === listUrl) continue;
          links.set(canonicalUrl(abs), { url: abs, title });
        }
        const bootstrap = !Object.keys(ledger).some(k => k.startsWith(`${s.name}|`));
        let fresh = 0;
        for (const [canon, l] of links) {
          const key = `${s.name}|${canon}`;
          if (ledger[key]) continue;
          ledger[key] = new Date().toISOString();
          ledgerDirty = true;
          if (bootstrap) continue; // snapshot only — backlog stays out of the feed
          fresh++;
          out.push({
            title: l.title, url: l.url, text: '', highlights: '',
            publishedDate: new Date().toISOString(), // discovery time
            score: 0.5, source: s.name, category: presetCat
          });
        }
        console.log(`   scrape:${s.name} → ${links.size} links, ${bootstrap ? 'bootstrap snapshot' : fresh + ' new'}`);
      } catch (e) { console.error(`  scrape ${s.name}: ${e.message}`); }
      await sleep(300);
    }
  }

  if (ledgerDirty) {
    const cutoff = Date.now() - LEDGER_TTL_DAYS * 86400000;
    for (const [k, v] of Object.entries(ledger)) if (new Date(v).getTime() < cutoff) delete ledger[k];
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
  }
  return out;
}

// ── Claude Curation ─────────────────────────────────────────────────────────

async function curateWithClaude(rawItems) {
  const items = rawItems.slice(0, CURATE_TOP_N).map((item, i) => ({
    index: i,
    title: item.title,
    text: item.text?.substring(0, 400),
    category: item.category,
    source: item.source,
    url: item.url?.substring(0, 120),
    publishedDate: item.publishedDate?.substring(0, 10)
  }));

  const systemPrompt = `你是 Cadence（中文名：步频）的物理治疗 / 康复医学新闻策展 AI。

Cadence / 步频 是独立物理治疗专业新闻品牌，覆盖临床研究、技术进展、监管动态、行业实践。读者是临床医师，分两类并重：practicing（诊所 + 医院 PT/PTA/owner）和 academic（faculty / student / resident）。不面向患者。语气：clinically authoritative, evidence-graded, accessible without dumbed-down jargon。地理范围：美国 + 中国 + 澳大利亚三市场。

8 个垂直分类（slug 必须精确匹配；不要发明新 slug）：
1. Orthopedic (orthopedic) — 骨科 / 肌肉骨骼康复。sub-tags: spine, knee, shoulder, hand-wrist, foot-ankle, hip, pelvic-floor
2. Neurological (neurological) — 神经康复。sub-tags: stroke, parkinson, ms, brain-injury, spinal-cord, vestibular
3. Sports & Athletic (sports) — 运动康复 / 重返运动 / 表现训练
4. Pediatric (pediatric) — 儿童康复 / 发育障碍 / 早期干预
5. Geriatric (geriatric) — 老年康复 / 跌倒预防 / 衰弱
6. Cardiopulmonary (cardiopulmonary) — 心肺康复 / COPD / 心脏康复
7. Manual Therapy & Modalities (manual-modality) — 手法与理疗。sub-tags: dry-needling, iastm, electro, laser, taping, manipulation
8. Practice & Profession (practice) — 行业与执业。sub-tags: reimbursement, regulation, telehealth, education, ethics, workforce

tags 规则：
- tags[0] 必须是内容类型，四选一：research（期刊论文 / 系统综述 / RCT）/ news（行业新闻 / 产品 / 公司动态）/ guideline（临床实践指南发布或更新）/ policy（监管 / 报销 / 执业规则）。判断不清时按主要信息价值归类。
- 之后：有 sub-tag axis 的分类（orthopedic / neurological / manual-modality / practice）优先放上面列出的 sub-tag slug（可多选）；其他分类 tags 自由但保持 kebab-case 英文。

评分标准（信号质量为核心）：
- 90+ = 临床实践改变级别：高水平证据更新（大样本 RCT / 系统综述推翻或确立干预）、重大监管 / 报销变化
- 80-89 = 重要进展，值得临床医师 deep dive
- 70-79 = 扎实但非实践改变级的研究 / 新闻
- 60-69 = 一般动态
- <60 = 噪音（会议预告、产品软文、患者向科普、内容农场转载）
- **陈旧内容检查**：核对 url 路径和正文里的年份/试验线索。博客或聚合站转载多年前的旧研究（即使 publishedDate 显示很新）一律 <60；研究本身年代久但新闻点是"新指南/新政策引用了它"则按新闻点正常评分。blogspot / 内容农场域名默认重扣。

编辑标准：
- summary：1-2 句中性英文，front-load "what changed"。研究类必带样本量 + 关键效应量（或 p 值 / CI），原文没给就不编造。
- curatedReason ("why it matters")：1-2 句中文，**第二人称**对临床读者说话，给 take 而不是 recap——直接下判断：这条改变什么、不改变什么、该做什么、别做什么。
  - 禁止条件句开头（"如果你在使用…"、"如果你关注…"、"如果你治疗…"）——默认读者就是干这行的，直接说事。
  - 禁止空效用措辞："有参考价值"、"帮助你决策"、"值得关注"、"提供了依据/证据/支持"、"增强你的信心"、"有指导意义"、"可以了解"——这些词出现即重写。
  - 口吻是资深同行，不是客服。可以泼冷水（"证据只有短期小样本，别急着写进常规方案"），可以站队（"这基本坐实了运动疗法该是一线"）。
  - 反例（禁止这种写法）："如果你在使用或考虑为患者推荐腰骶矫形器，这篇综述能为你提供基于证据的考量，帮助你决策。"
  - 正例："腰骶矫形器的证据还是撑不起常规处方——效应量小、异质性高。继续当短期辅助用，别替代主动训练。"
  - 正例："5 年随访坐实了运动疗法对退行性半月板撕裂的非劣效。下次跟骨科讨论转诊，这是你手里最硬的一张牌。"
- 数字优先于形容词（样本量、效应量、报销金额、生效日期）。不用 emoji。
- 不夸大研究结论：单个小样本研究不写成实践改变；研究限制（样本量小、无对照、随访短、行业资助）在 curatedReason 里点出。
- 监管 / 报销类新闻必须分清适用市场（US / China / Australia），不要把单一市场政策写成普适。

category 规则：输入里 category 为 null 的条目（来自期刊 RSS 整刊 feed，没有预设分类），你必须在返回里给出 category 字段，取值为上面 8 个 slug 之一；判断不了或与 PT/康复无关的直接丢弃（不返回该 index）。category 已有值的条目不要改。整刊 feed 里大量内容与 PT 无关（药物试验、外科技术、公共卫生政策），无关即丢，宁缺毋滥。

请只返回 JSON 数组（不要 markdown 代码块），格式：
[{"index":0,"curatedScore":85,"curatedReason":"中文 why-it-matters，第二人称给 take","tags":["research","spine"],"summary":"One-line English neutral summary","category":"orthopedic（仅输入为 null 时必填）"}]

只保留 curatedScore >= 65 的条目。`;

  const userPrompt = `请策展以下 ${items.length} 条新闻：\n\n${JSON.stringify(items, null, 2)}`;

  const text = LLM_PROVIDER === 'gemini'
    ? await callGemini(systemPrompt, userPrompt)
    : await callAnthropic(systemPrompt, userPrompt);
  if (!text) return [];
  return parseCuratedArray(text);
}

// Parse the LLM's JSON array; if the response was truncated mid-item,
// salvage every complete object instead of dropping the whole batch.
function parseCuratedArray(raw) {
  let text = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const start = text.indexOf('[');
  if (start === -1) { console.error('  Parse error: no JSON array in response'); return []; }
  text = text.slice(start);
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error(`  Parse error: ${e.message} — attempting truncation salvage`);
    for (let cut = text.lastIndexOf('}'); cut > 0; cut = text.lastIndexOf('}', cut - 1)) {
      try {
        const salvaged = JSON.parse(text.slice(0, cut + 1) + ']');
        console.error(`  Salvaged ${salvaged.length} complete items from truncated response`);
        return salvaged;
      } catch { /* keep cutting */ }
    }
    console.error('  Salvage failed — 0 items');
    return [];
  }
}

async function callAnthropic(systemPrompt, userPrompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8000, // 40-item batches overflow 4000 (truncation salvage loses tail items)
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!res.ok) {
    console.error(`  Claude error: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return '';
  }

  const data = await res.json();
  return data.content?.map(c => c.text || '').join('') || '';
}

async function callGemini(systemPrompt, userPrompt) {
  // Free tier hits 503 UNAVAILABLE during demand spikes — retry with backoff,
  // then fall back to flash-lite (separate capacity pool).
  const models = [GEMINI_MODEL, 'gemini-2.5-flash-lite'];
  const delays = [0, 15000, 45000];

  for (const model of models) {
    for (const delay of delays) {
      if (delay) {
        console.log(`  Gemini retry in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
      }
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            maxOutputTokens: 16384,
            responseMimeType: 'application/json',
            // Thinking tokens count toward maxOutputTokens — disable so the
            // budget goes entirely to the JSON payload.
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (model !== GEMINI_MODEL) console.log(`  (served by fallback model ${model})`);
        return data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
      }

      const errText = (await res.text()).slice(0, 200);
      console.error(`  Gemini ${model} error: ${res.status} ${errText}`);
      // Retry only transient errors; anything else (400/401/404) won't heal.
      if (![429, 500, 502, 503, 504].includes(res.status)) break;
    }
  }
  return '';
}

// ── Dedup / clustering ──────────────────────────────────────────────────────
// AIHOT-style: same story reported by several outlets collapses into ONE main
// card; the other outlets are kept as `related` (关联讨论) instead of dropped.
// Cluster key = exact normalized title; fuzzy match = token-set Jaccard
// (word tokens for latin, char-bigrams for CJK so Chinese titles cluster too).

function titleKey(title) {
  return (title || '').toLowerCase().replace(/[^a-z0-9一-鿿]/g, '').substring(0, 60);
}

function canonicalUrl(url) {
  try {
    const u = new URL(url);
    return (u.hostname.replace('www.', '') + u.pathname).replace(/\/$/, '').toLowerCase();
  } catch { return url || ''; }
}

function titleTokens(title) {
  const t = (title || '').toLowerCase();
  if (/[一-鿿]/.test(t)) {
    const s = t.replace(/[^a-z0-9一-鿿]/g, '');
    const grams = new Set();
    for (let i = 0; i < s.length - 1; i++) grams.add(s.slice(i, i + 2));
    return grams;
  }
  return new Set(t.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function sameStory(a, b) {
  if (canonicalUrl(a.sourceUrl || a.url) === canonicalUrl(b.sourceUrl || b.url)) return true;
  if (titleKey(a.title) === titleKey(b.title)) return true;
  return jaccard(titleTokens(a.title), titleTokens(b.title)) >= 0.55;
}

// Collapse a list into clusters. keepBest picks the main card; the rest become
// related entries (one per distinct source domain). Works both on raw Exa
// results (pre-curation) and on final items (merge with yesterday's feed).
function clusterItems(items, keepBest) {
  const clusters = [];
  for (const item of items) {
    const hit = clusters.find(c => sameStory(c.main, item));
    if (hit) hit.members.push(item);
    else clusters.push({ main: item, members: [item] });
  }
  return clusters.map(c => {
    const sorted = [...c.members].sort(keepBest);
    const main = { ...sorted[0] };
    const seenSrc = new Set([main.source]);
    const related = [...(main.related || [])];
    related.forEach(r => seenSrc.add(r.source));
    for (const m of sorted.slice(1)) {
      for (const r of [{ source: m.source, sourceUrl: m.sourceUrl || m.url, title: m.title }, ...(m.related || [])]) {
        if (!r.source || seenSrc.has(r.source)) continue;
        seenSrc.add(r.source);
        related.push({ source: r.source, sourceUrl: r.sourceUrl, title: r.title });
      }
    }
    if (related.length) main.related = related;
    return main;
  });
}

const byExaScore = (a, b) => (b.score || 0) - (a.score || 0);
const byCuratedScore = (a, b) => (b.curatedScore || 0) - (a.curatedScore || 0);

// ── Stale-content pre-filter ────────────────────────────────────────────────
// Blogs/content farms re-surface old studies and Exa's crawl date masks the
// original publication year. If the URL path embeds a year two or more years
// old (e.g. /2015/01/), drop it before curation.
function dropStaleByUrl(items) {
  const thisYear = new Date().getFullYear();
  return items.filter(it => {
    const m = (it.url || '').match(/\/((?:19|20)\d{2})(?:[\/\-]|$)/);
    if (m && parseInt(m[1], 10) <= thisYear - 2) {
      console.log(`   ⏳ stale URL dropped: ${(it.url || '').slice(0, 80)}`);
      return false;
    }
    return true;
  });
}

// ── Hot topics (当前热点) ────────────────────────────────────────────────────
// Heat = distinct-source count with exponential time decay (half-life 2 days).
// Only stories covered by ≥2 independent sources qualify; empty array on
// quiet days → the frontend hides the strip entirely.

function computeHotTopics(items) {
  const now = Date.now();
  return items
    .map(i => {
      const sourceCount = 1 + (i.related?.length || 0);
      const ageDays = Math.max(0, (now - new Date(i.publishedAt).getTime()) / 86400000);
      const heat = sourceCount * Math.pow(0.5, ageDays / 2);
      return {
        id: i.id, title: i.title, sourceUrl: i.sourceUrl, category: i.category,
        publishedAt: i.publishedAt, sourceCount,
        sources: [i.source, ...(i.related || []).map(r => r.source)],
        heat: Math.round(heat * 100) / 100
      };
    })
    .filter(t => t.sourceCount >= 2 && t.heat >= 1.2)
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 5);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n⚡ Cadence PT News Refresh — ${new Date().toISOString()}`);
  if (DRY_RUN) { console.log('  DRY_RUN mode\n'); return; }
  const llmKey = LLM_PROVIDER === 'gemini' ? GEMINI_API_KEY : ANTHROPIC_API_KEY;
  const needExa = REFRESH_MODE !== 'direct';
  if ((needExa && !EXA_API_KEY) || !llmKey) { console.error(`❌ Missing API keys (${needExa ? 'EXA_API_KEY + ' : ''}${LLM_PROVIDER === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY'})`); process.exit(1); }
  console.log(`  LLM provider: ${LLM_PROVIDER} · mode: ${REFRESH_MODE}`);

  let raw = [];
  if (needExa) {
    for (const cat of CATEGORY_QUERIES) {
      console.log(`📡 ${cat.category}`);
      for (const q of cat.queries) {
        const r = await searchExa(q, 4);
        raw.push(...r.map(x => ({ ...x, category: cat.category })));
        console.log(`   "${q}" → ${r.length}`);
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }

  console.log(`\n📚 PubMed E-utilities`);
  raw.push(...await fetchPubMed());

  console.log(`\n📰 RSS feeds`);
  raw.push(...await fetchRssFeeds());

  console.log(`\n🕸️ Listing-page scrapes`);
  raw.push(...await fetchScrapes());

  console.log(`\n📊 Raw: ${raw.length}`);
  const fresh = dropStaleByUrl(raw);

  // Incremental gate: drop URLs the feed already carries (as main cards or
  // related coverage). High-frequency direct runs exit here on quiet hours —
  // no LLM call, no news.json write, no deploy churn.
  const seen = new Set();
  try {
    for (const i of JSON.parse(fs.readFileSync(NEWS_PATH, 'utf8')).items || []) {
      seen.add(canonicalUrl(i.sourceUrl));
      for (const r of i.related || []) seen.add(canonicalUrl(r.sourceUrl));
    }
  } catch {}
  const novel = fresh.filter(i => !seen.has(canonicalUrl(i.url)));
  console.log(`   New since last run: ${novel.length} (${fresh.length - novel.length} already in feed)`);
  if (!novel.length) { console.log('\n💤 Nothing new — skipping curation and write.'); return; }

  const unique = clusterItems(novel, byExaScore);
  unique.sort(byExaScore);
  console.log(`   Unique: ${unique.length} (${unique.filter(u => u.related?.length).length} multi-source)`);

  console.log(`\n🤖 Curating with Claude...`);
  const curated = await curateWithClaude(unique);
  console.log(`   Curated: ${curated.length} items`);

  const VALID_CATS = new Set(['orthopedic', 'neurological', 'sports', 'pediatric', 'geriatric', 'cardiopulmonary', 'manual-modality', 'practice']);
  const final = curated.map(c => {
    const o = unique[c.index];
    if (!o) return null;
    // RSS whole-journal items arrive with category:null — critic assigns one.
    const category = o.category || (VALID_CATS.has(c.category) ? c.category : null);
    if (!category) return null;
    return {
      id: `news-${Date.now()}-${c.index}`,
      title: o.title,
      summary: c.summary || o.highlights || o.text?.substring(0, 200),
      category,
      source: o.source,
      sourceUrl: o.url,
      publishedAt: o.publishedDate,
      curatedScore: c.curatedScore,
      curatedReason: c.curatedReason,
      tags: c.tags || [],
      ...(o.related?.length ? { related: o.related } : {})
    };
  }).filter(Boolean).sort((a, b) => b.curatedScore - a.curatedScore);

  // Merge with existing (keep 7 days)
  let existing = [];
  try {
    const old = JSON.parse(fs.readFileSync(NEWS_PATH, 'utf8'));
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
    existing = (old.items || [])
      .filter(i => new Date(i.publishedAt) > cutoff)
      // Re-validate against the roster so items from since-removed sources
      // age out immediately, and relabel in case a source was renamed.
      .map(i => ({ ...i, source: matchSource(i.sourceUrl) }))
      .filter(i => i.source);
  } catch {}

  // Cluster-aware merge: a re-found story unions its related-source list
  // instead of being silently dropped, so heat can build across days.
  const merged = clusterItems([...final, ...existing], byCuratedScore).slice(0, MAX_ITEMS);
  const hotTopics = computeHotTopics(merged);
  console.log(`   Hot topics: ${hotTopics.length}`);

  fs.writeFileSync(NEWS_PATH, JSON.stringify({
    meta: {
      lastUpdated: new Date().toISOString(),
      totalItems: merged.length,
      categories: ['orthopedic', 'neurological', 'sports', 'pediatric', 'geriatric', 'cardiopulmonary', 'manual-modality', 'practice']
    },
    hotTopics,
    items: merged
  }, null, 2));

  console.log(`\n✅ ${merged.length} items → news.json`);
  return { newItems: final.length, totalItems: merged.length,
    headlines: merged.slice(0, 5).map(i => `[${i.curatedScore}] ${i.title}`) };
}

main().then(s => {
  if (s) { console.log('\n📰 Top:'); s.headlines.forEach(h => console.log(`   ${h}`)); }
  console.log('Done.\n');
}).catch(e => { console.error('❌', e); process.exit(1); });

module.exports = { main };
