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

// Embedding-based hot topics (semantic clustering over Voyage vectors). Both
// modules are CLI-guarded, so requiring them here has no side effects.
const { embedMissing } = require('./embed-items');
const { computeHotTopicsEmbed } = require('./hot-topics-embed');
// 已知固定错译的确定性校正（如 hamstring 的 胕绳肌→腘绳肌）。在模型 JSON 落库前跑。
const { fixItem } = require('./term-fixes');

const EXA_API_KEY = process.env.EXA_API_KEY;
const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'deepseek').toLowerCase();
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro';
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
const MAX_ITEMS = 75;
const LOOKBACK_DAYS = 7; // PT news cadence is slower than climate-tech; revisit after 2 weeks
// PubMed is roster-filtered (only journals.json journals get in), which cuts
// volume hard — low-output flagships (JOSPT, Spine, Pain) may publish nothing
// in a 7-day window. Give that leg a wider window so the wall stays populated;
// the incremental gate dedupes anything already in the feed, so the overlap
// with prior runs costs nothing.
const PUBMED_LOOKBACK_DAYS = 14;
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
// last PUBMED_LOOKBACK_DAYS; esearch → efetch(abstract XML), parsed zero-dep.
// NCBI limit is 3 req/s without an API key — the 350ms sleeps keep us under.
//
// The wall applies here too: every query is AND-ed with a [ta] clause built
// from journals.json, so only roster journals get in. Without it, by-date
// retmax windows are dominated by high-volume mega-journals (Frontiers, PLoS
// One, Scientific Reports) and the low-output flagship journals (JOSPT, Spine,
// Pain) almost never surface. Quoted names PubMed can't translate (acronym
// aliases like "jospt", names with "&") are silently ignored — the medline
// abbreviation aliases are what actually match. Adding a journal to
// journals.json automatically widens this gate.

const JOURNALS = require(path.join(__dirname, '..', 'journals.json')).journals;
const JOURNAL_TA_CLAUSE = '(' + [...new Map(
  JOURNALS.flatMap(j => [j.name, ...(j.aliases || [])])
    .map(n => [n.toLowerCase().trim(), n])
).values()].map(n => `"${n}"[ta]`).join(' OR ') + ')';

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

// ── 康复科技 (Rehab Tech) cross-cutting overlay ──────────────────────────────
// Not a 9th category: items keep their clinical specialty and additionally get
// tech:true when title/summary (en or zh) mentions technology-driven rehab —
// AI/ML, VR/AR, robotics, wearables, telerehab, digital health. Deterministic
// keyword rules so the flag is auditable, free, and can be backfilled over the
// archive (scripts/backfill-tech.js). Tune the lists, rerun the backfill.
const TECH_PATTERNS = [
  /\bmachine[ -]learning\b/i, /\bdeep[ -]learning\b/i, /\bartificial intelligence\b/i,
  /\b(artificial|convolutional|recurrent|graph|deep)[ -]neural network/i, /\bAI\b/, /\bML\b/,
  /\bvirtual reality\b/i, /\bVR\b/, /\baugmented reality\b/i, /\bmixed reality\b/i,
  /\bexoskeleton/i, /\brobot/i, /\bwearable/i, /\bsensor(s|-based)?\b/i,
  /\btele-?rehab/i, /\btelehealth\b/i, /\btelemedicine\b/i, /\bm-?health\b/i,
  /\bsmartphone/i, /\bmobile app/i, /\bapp-based\b/i, /\bdigital health\b/i,
  /\bdigital therapeutic/i, /\bdigital rehab/i, /\bremotely[ -]delivered\b/i, /\bdigital tracking\b/i, /\bonline psychological support\b/i, /\bgamif/i, /\bvideo ?gam/i, /\bbrain[- ]computer interface/i,
];
const TECH_ZH = [
  '机器学习', '人工智能', '深度学习', '人工神经网络', '卷积神经网络', '循环神经网络', '图神经网络', '虚拟现实', '增强现实', '混合现实',
  '外骨骼', '机器人', '可穿戴', '传感器', '远程康复', '远程医疗', '智能手机',
  '手机应用', '移动应用', '应用程序', '数字健康', '数字疗法', '数字康复', '远程运动', '数字追踪', '在线心理支持', '游戏化', '脑机接口',
];
function isTech(item) {
  // Title + summary ONLY — LLM-assigned tags are deliberately excluded: they
  // hallucinate at the margin (an *online survey* of Indonesian stroke rehab
  // services got tagged `telehealth` → wrongly badged 康复科技, Cindy
  // 2026-06-13). If a story is genuinely about tech, the tech term appears in
  // the title or summary; a tag alone is not evidence.
  const en = `${item.title || ''} ${item.summary || ''}`;
  const zh = `${item.titleZh || ''} ${item.summaryZh || ''}`;
  // zh summaries often keep English acronyms (VR/AI/ML), so run both rule sets
  // over both languages.
  return TECH_PATTERNS.some((re) => re.test(en) || re.test(zh))
    || TECH_ZH.some((k) => zh.includes(k) || en.includes(k));
}

// ── PT-relevance gate (off-topic medical leakage) ───────────────────────────
// Whole-journal feeds (esp. The Lancet) push pharmacotherapy and organ-disease
// content that the LLM curator sometimes lets through on a cardio-adjacent tag
// (e.g. a finerenone/CKD trial tagged `cardiopulmonary`). The curation prompt
// already says "无关即丢" but is too permissive at the margin, so this is a
// deterministic safety net: drop an item only when it clearly reads as non-PT
// clinical medicine AND carries no rehabilitation signal. Same design as isTech
// — auditable keyword rules, backfillable over the archive (backfill-relevance.js).
//
// Precision over recall by intent. Two tiers, because a drug trial can mention
// "diet and exercise" as trial background and a real rehab RCT can enrol
// diabetes/CKD patients — the same word means different things:
//   HARD — named drug molecules / classes. When the *subject* is finerenone or
//          a GLP-1 agonist it's a pharmacology trial; an incidental "exercise"
//          mention must NOT rescue it, so HARD drops regardless of any signal.
//   SOFT — disease states (CKD, diabetes, oncology). These can legitimately be
//          the population of an exercise/rehab study, so SOFT drops only when no
//          rehab signal is present.
// Denylist by design — needs occasional curation as new off-topic terms appear.
const OFFTOPIC_HARD = [
  /\bfinerenone\b/i, /\bretatrutide\b/i, /\bsemaglutide\b/i, /\btirzepatide\b/i,
  /\bempagliflozin\b/i, /\bdapagliflozin\b/i, /\bGLP-?1\b/i, /\bSGLT2\b/i,
];
const OFFTOPIC_SOFT = [
  /\bstatins?\b/i, /\bmonoclonal antibod/i, /\bchemotherap/i, /\bimmunotherap/i,
  /\bchronic kidney disease\b/i, /\bCKD\b/, /\bnephropathy\b/i, /\bdialysis\b/i,
  /\bnephro/i, /\bhepatic\b/i, /\bcirrhosis\b/i, /\bsepsis\b/i,
  /\btype 2 diabetes\b/i, /\bglycaemic\b/i, /\bglycemic\b/i, /\boncolog/i, /\btumou?r\b/i,
];
const REHAB_SIGNAL = [
  /\brehab/i, /\bphysical therap/i, /\bphysiotherap/i, /\bexercise\b/i, /\btraining\b/i,
  /\bgait\b/i, /\bbalance\b/i, /\bmobilit/i, /\bstrength/i, /\bmotor\b/i, /\bambulat/i,
  /\bfunctional\b/i, /\bfunction\b/i, /\brange of motion\b/i, /\breturn to sport\b/i,
  /\bmusculoskeletal\b/i, /\btendon\b/i, /\bligament\b/i, /\blocomot/i, /\bphysical activit/i,
  /\bpulmonary rehab/i, /\bcardiac rehab/i, /\bsit-to-stand\b/i,
  '康复', '物理治疗', '运动', '步态', '平衡', '肌力', '功能',
];
// Retraction / withdrawal notices — invalid science, drop regardless of topic
// (a retracted PT study still shouldn't surface).
const RETRACTION = [/撤稿/, /\bretraction\b/i, /\bretracted\b/i, /\bwithdrawn\b/i];
// Journal front-matter — obituaries, world-report news, perspectives, photo
// competitions, prizes, book reviews. These ride in on journal RSS (esp. The
// Lancet) and get mis-tagged "news". Match the bracketed section tags (EN + ZH).
// Treated like SOFT: drop unless a rehab signal is present, so a genuine rehab
// editorial/comment still survives.
const JOURNAL_FRONT_MATTER = [
  /\[\s*(editorial|perspectives?|comment|correspondence|obituary|world report|department of error|dept\.? of error|profile|feature|book review|in memoriam)\s*\]/i,
  /[\[【（]\s*(评论|视角|世界报道|讣告|社论|通讯|书评|人物|特写|来信)\s*[\]】）]/,
  /\bwakley prize\b/i, /\bphoto(graphy)? competition\b/i, /摄影比赛/,
];
function isRehabRelevant(item) {
  const text = `${item.title || ''} ${item.summary || ''} ${item.titleZh || ''} ${item.summaryZh || ''}`;
  if (OFFTOPIC_HARD.some((re) => re.test(text))) return false; // pharma trial → drop, no veto
  if (RETRACTION.some((re) => re.test(text))) return false;    // retraction notice → drop, no veto
  // Surgical / non-rehab prognostic models — HARD-style drop that BYPASSES the
  // SOFT veto: a predictive-model / nomogram study whose OUTCOME is a surgical or
  // organ-function endpoint (erectile function, post-op complication, mortality)
  // with no rehab *intervention* present. Must sit with the other unconditional
  // drops — these items often carry NO disease-state SOFT term, so gating them
  // behind the offtopic check (below) would let them straight through (the bug
  // this placement fixes). Guard: a genuine "prediction model for a rehabilitation
  // outcome" still survives via REHAB_INTERVENTION.
  if (
    SURGICAL_PROGNOSIS.some((re) => re.test(text)) &&
    SURGICAL_CONTEXT.some((re) => re.test(text)) &&
    !REHAB_INTERVENTION.some((re) => re.test(text))
  ) return false;
  const offtopic = OFFTOPIC_SOFT.some((re) => re.test(text)) || JOURNAL_FRONT_MATTER.some((re) => re.test(text));
  if (!offtopic) return true;                                  // nothing off-topic → keep
  const rehab = REHAB_SIGNAL.some((p) => (p instanceof RegExp ? p.test(text) : text.includes(p)));
  return rehab; // disease-state OR front-matter term present → keep only if a rehab signal vetoes
}

// Surgical-prognosis gate components (used by isRehabRelevant above).
const SURGICAL_PROGNOSIS = [
  /\b(predict(ive|ion)?|prognostic|nomogram)\b[^.]*\bmodel\b/i,
  /\bmodel\b[^.]*\b(predict(ive|ion)?|prognostic)\b/i,
  /(预测|预后)模型/, /列线图/, /预测.{0,6}模型/,
];
const SURGICAL_CONTEXT = [
  /\bpostoperative\b/i, /\bpost-operative\b/i, /\bdecompression\b/i,
  /\barthroplasty\b/i, /\bresection\b/i, /\bsurgical\b/i, /\bsurgery\b/i,
  /\berectile (function|dysfunction)\b/i, /勃起功能/, /术后/,
];
const REHAB_INTERVENTION = [
  /\bphysical therap/i, /\bphysiotherap/i, /\brehabilitat/i, /\bexercise\b/i,
  /\bgait training\b/i, /\bbalance training\b/i, /\bresistance training\b/i,
  /\bstrength training\b/i, /康复/, /物理治疗/,
];

// ── Title normalization ─────────────────────────────────────────────────────
// Some journal RSS feeds (notably Archives of PM&R) ship SHOUTY ALL-CAPS titles.
// Down-case them to sentence case so the feed reads consistently, while keeping
// genuine acronyms (ACL, COPD, RCT, SLAP…) and leaving any normal mixed-case
// title untouched. Deterministic + idempotent — safe on every item (fresh and
// carried-over), so a title curated before this existed self-heals next run.
const TITLE_ACRONYMS = new Set([
  'ACL','PCL','MCL','LCL','COPD','RCT','SLAP','MS','ALS','TBI','SCI','TKA','THA',
  'ICU','PT','OT','SLP','US','UK','USA','AI','VR','AR','TMS','RTMS','FES','NHS',
  'CMS','FDA','APTA','AAOS','GIRFT','BMI','ROM','ADL','ADLS','MSK','DOMS','GRADE',
  'ASIA','COVID','SARS','HIV','MRI','CT','EMG','ECG','EEG','FNIRS','DLPFC','ESRD',
]);
function normalizeTitle(title, meta = {}) {
  if (!title || typeof title !== 'string') return title;
  // Strip stray wrapping quotes some RSS feeds add around the WHOLE title
  // (e.g. `"Are CR programs effective…".`). Only fire when the title both opens
  // with a quote AND closes with one (optionally before trailing punctuation), so
  // internal quotes (`Effect of "mirror therapy" on gait`) are left alone.
  let t = title;
  if (/^[“"「『]/.test(t) && /[”"」』][.。!?]?\s*$/.test(t)) {
    t = t.replace(/^[“"「『]+\s*/, '').replace(/\s*[”"」』]+(?=[.。!?]?\s*$)/, '');
  }
  // Strip scraped publisher tails at the SOURCE so downstream consumers
  // (wechat-brief / xhs-digest / linkedin-brief read raw news.json titles)
  // never see them; the frontend has a mirror of this as a legacy-data
  // fallback (2026-07-08 adversarial-review fix).
  //   " | Tail" — stripped whenever the remainder is still a real title
  //               (pipes are vanishingly rare inside paper titles);
  //   " - Tail" — stripped only when the tail matches the item's source or
  //               journal name (hyphens are common inside real titles).
  const pi = t.lastIndexOf(' | ');
  if (pi >= 20 && t.slice(pi + 3).trim().length <= 40) t = t.slice(0, pi).trim();
  const hy = t.lastIndexOf(' - ');
  if (hy >= 20 && (meta.source || meta.journal)) {
    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/gi, ' ').trim();
    const tail = norm(t.slice(hy + 3));
    if (tail && (tail === norm(meta.source) || tail === norm(meta.journal))) t = t.slice(0, hy).trim();
  }
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length < 8) return t;                           // too short to judge
  const upperRatio = letters.replace(/[^A-Z]/g, '').length / letters.length;
  if (upperRatio < 0.85) return t;                            // not shouty → return de-quoted
  // Lowercase each word unless it's a known acronym, then restore sentence caps.
  let s = t.replace(/[A-Za-z][A-Za-z.&'’-]*/g, (w) => {
    const bare = w.replace(/[^A-Za-z&]/g, '').toUpperCase();
    return TITLE_ACRONYMS.has(bare) ? bare : w.toLowerCase();
  });
  // Capitalize first letter overall + first letter after . ? ! :
  s = s.replace(/(^|[.?!:]\s+)([a-z])/g, (m, p, c) => p + c.toUpperCase());
  return s;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const xmlTag = (s, tag) => (s.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)) || [])[1] || '';
const stripTags = (s) => (s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ' '; } })
  .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(parseInt(n, 10)); } catch { return ' '; } })
  .replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();

async function fetchPubMed() {
  const out = [];
  const base = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
  for (const q of PUBMED_QUERIES) {
    try {
      // retmax 15 (was 8): roster filtering cut the volume way down, so
      // everything that passes the gate is worth sending to curation.
      // POST, not GET: the [ta] clause grows with journals.json and the full
      // term overruns NCBI's URL-length cap (414) past ~30 journals. E-utilities
      // accept the same params as a POST body, with no length limit.
      const term = `(${q.term}) AND ${JOURNAL_TA_CLAUSE}`;
      const es = await fetch(`${base}/esearch.fcgi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          db: 'pubmed', retmode: 'json', retmax: '15',
          reldate: String(PUBMED_LOOKBACK_DAYS), datetype: 'edat', sort: 'date', term
        })
      });
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
          source: 'PubMed', category: q.category,
          // Actual journal name — the frontend matches it against journals.json
          // (IF / JCR quartile badge). Source stays 'PubMed' for the roster.
          ...(journal ? { journal } : {})
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
        // Journal feeds: stamp the canonical journal name (sources.json
        // journalName) so the IF / JCR badge can match against journals.json.
        if (s.kind === 'journal' && (s.journalName || s.name)) {
          got.forEach(i => { i.journal = s.journalName || s.name; });
        }
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

// llm 默认走真实 callLLM；测试可注入 stub 覆盖落库前的 fixItem 接线（无网络）。
async function curateWithClaude(rawItems, llm = callLLM) {
  const items = rawItems.slice(0, CURATE_TOP_N).map((item, i) => ({
    index: i,
    title: item.title,
    text: item.text?.substring(0, 800), // 入库已存 800；曾砍到 400 把 Methods 段样本量切掉，逼模型臆测 n（2026-06-25）
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
8. Practice & Profession (practice) — **物理治疗行业与执业本身**（PT / PTA 的报销、执业范围、远程 PT、教育认证、伦理、PT 劳动力）。sub-tags: reimbursement, regulation, telehealth, education, ethics, workforce。**边界：只收直接关系 PT 临床执业的内容。**通用医疗系统商业 / 财经 / 政策机制——医院并购、私募基金、保险公司财报或探查、Medicaid / ACA 参保机制、医疗高管任命、非 PT 岗位的劳动力短缺、通用医疗 AI 治理——即便沾 "healthcare" 也一律丢弃（不返回该 index）：那是行业财经新闻，不是 PT 执业新闻。判据：一个临床 PT 读完能不能改变他明天怎么执业 / 收费 / 转诊；不能就丢。

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
- summary：1-2 句中性英文——**必须是英文（English only），绝不能写中文**：它是英文界面与英文分享卡的正文字段，中文摘要只属于 summaryZh。front-load "what changed"。研究类**优先**带样本量 + 关键效应量（或 p 值 / CI）——但**只在所给 text 中明确出现该数字时才写入，并照抄原值**；text 里没有就省略数字，**绝不臆测，也不得套用本批其他条目的数字**。**summary 必须讲研究"发现了什么"（方向 / 结论），不是罗列做了哪些统计**——出现 "calculated mean differences, 95% CI, I² statistic, using the GRADE approach" 这类只讲方法不给结果的写法即重写；摘要里读不出结论方向时，如实写"the review did not report a pooled direction"之类，不要用方法清单充数。
- **双语字段（站点有中英切换，三个字段全部必填）**：
  - titleZh：标题的中文翻译。专业、紧凑，不逐字直译；解剖结构 / 干预手段用临床通用中文译名，缩写（如 ACL、COPD、RCT）保留英文。
  - summaryZh：summary 的中文版，同样 1-2 句、front-load 变化点、保留数字。不是 summary 的直译腔，要像中文期刊导读。
  - curatedReasonEn：curatedReason 的英文版，**同一个 take、同样的口吻规则**（second-person、直接下判断、禁条件句开头、禁空效用措辞）。不是翻译练习——写给英文读者的同一条专业意见。
  - titleEn：**仅当原始 title 不是英文时**（如中文源标题）才填——专业、紧凑的英文标题，缩写（ACL、SLAP、RCT 等）保留。title 本身已是英文则**省略该字段**（英文模式直接用 title）。
- curatedReason ("why it matters")：1-2 句中文，**第二人称**对临床读者说话，给 take 而不是 recap——直接下判断：这条改变什么、不改变什么。涉及"该做 / 别做"这类临床动作指令时，遵守下方"行动建议护栏"。
  - **禁止 recap 开头**：第一句不得复述研究做了什么（"这项研究评估了…"、"该综述估计了…患病率"、"This study examined…"）——那是 summary 的活，已经说过一遍。why-it-matters 必须从判断 / 临床影响开始。
  - 禁止条件句开头（"如果你在使用…"、"如果你关注…"、"如果你治疗…"）——默认读者就是干这行的，直接说事。
  - 禁止空效用措辞："有参考价值"、"帮助你决策"、"帮助你了解/筛查/制定"、"值得关注"、"提供了依据/证据/支持"、"为你提供…"、"增强你的信心"、"有指导意义"、"可以了解"——这些词出现即重写。
  - curatedReasonEn 同样禁止英文版空话："you can use this as a basis for clinical decisions"、"provides valuable insights"、"provides you with the latest evidence/specific data"、"helping you understand / screen / develop / make…"、"guiding you to…"、"represents the latest collective wisdom"、"serves as a(n up-to-date) reference"、"worth your attention / monitoring"、"can inform your … consultations"、"this provides evidence on …"、"high-level evidence"——出现即重写成带方向的判断（说清这条改变什么 / 别做什么）。
  - 口吻是资深同行，不是客服。可以泼冷水（"证据只有短期小样本，别急着写进常规方案"），可以站队（"这基本坐实了运动疗法该是一线"）。
  - 反例（禁止这种写法）："如果你在使用或考虑为患者推荐腰骶矫形器，这篇综述能为你提供基于证据的考量，帮助你决策。"
  - 正例："腰骶矫形器的证据还是撑不起常规处方——效应量小、异质性高。继续当短期辅助用，别替代主动训练。"
  - 正例："5 年随访坐实了运动疗法对退行性半月板撕裂的非劣效。下次跟骨科讨论转诊，这是你手里最硬的一张牌。"
- 数字优先于形容词（样本量、效应量、报销金额、生效日期）。不用 emoji。
- limitation（一句话局限，单独字段）：**凡 studyDesign 有值（research 类）必填**——给读者一句"适用边界"，从研究设计层面说，不是硬挑刺：单一结局指标、特定人群、外推性、随访长度、单中心 vs 多中心、行业资助、替代终点、异质性等，挑最该让读者留神的一条。**即便是高质量大样本 RCT 也有边界（至少是人群 / 结局 / 外推性），照样写一句，不要留空。** 但只能基于研究设计本身能读出的信息——绝不编造数字或不存在的缺陷；只有当标题 / 摘要里真的读不出任何设计信息时才留 ""。news / guideline / policy / 述评 类一律留 ""。limitationEn 为其英文版；limitation 为 "" 时 limitationEn 也留 ""。
- 行动建议护栏：临床动作指令（该做 / 别做 / 改用 / 推荐某处置）只在证据等级足够时给——studyDesign 为 RCT 或 系统综述、且 curatedScore≥80；弱证据（观察 / 综述 / 述评 / 个案 / news）只点相关性与适用边界，不下动作指令。
- 措辞强度匹配证据强度：大样本 RCT / 长随访 / 系统综述可下肯定判断（"坐实"、"非劣效成立"）；单个小样本 / 观察研究 / 短随访不得用"证明、确证、坐实、必然"等定论措辞，改写成"提示 / 可能 / 倾向于"。不夸大：单个小样本不写成实践改变。
- 监管 / 报销类新闻必须分清适用市场（US / China / Australia），不要把单一市场政策写成普适。

category 规则：输入里 category 为 null 的条目（来自期刊 RSS 整刊 feed，没有预设分类），你必须在返回里给出 category 字段，取值为上面 8 个 slug 之一；判断不了或与 PT/康复无关的直接丢弃（不返回该 index）。category 已有值的条目不要改。整刊 feed 里大量内容与 PT 无关（药物试验、外科技术、公共卫生政策），无关即丢，宁缺毋滥。
- **cardiopulmonary 不是"任何心脏/肾脏/代谢疾病"**：它只收心肺**康复**（COPD 肺康复、心脏术后康复、运动耐量训练、呼吸肌训练）。药物试验（finerenone、retatrutide、GLP-1、他汀、SGLT2）、脏器疾病本身（慢性肾病、糖尿病、肿瘤）即使带"cardio"字样也与 PT 无关，一律丢弃，不要因为沾边就硬塞进 cardiopulmonary。整刊 feed 的 [Editorial]/[Correspondence]/[Comment] 段落除非直接讲康复干预，否则默认丢。
- **按主要临床条件归类，不按患者年龄/人群**：神经退行病（帕金森、阿尔茨海默）、脊髓损伤、卒中归 neurological；呼吸系统病（COPD、哮喘、OSA）归 cardiopulmonary——即便受试者是老年人，也不要因"老年"就归 geriatric。geriatric 只收以衰老/衰弱本身为主题的研究（跌倒预防、肌少症、衰弱、综合老年评估等）。
- **manual-modality 仅当干预本身是手法或理疗**（手法治疗 / 关节松动 / 推拿、干针、激光、电疗、冲击波、治疗性超声等）：一般脊柱/腰痛综述、外科或介入决策框架归 orthopedic，运动损伤预防归 sports——不要因为"沾脊柱/沾肌骨"就塞进 manual-modality。**反向亦然——干预手段优先于解剖部位**：当研究主干预本身就是上述手法/理疗（如手法治疗颈痛、关节松动、干针、激光、冲击波、贴扎的 RCT），即便病症在颈/腰/肩/膝等骨科部位，也归 manual-modality，不要因"是骨科部位"而归 orthopedic。
- **盆底 / 女性健康**（子宫内膜异位症、产后压力性尿失禁、盆底功能障碍、性功能康复）默认归 orthopedic（sub-tag pelvic-floor）；只有当主干预本身是单一理疗手段时才归 manual-modality。**笼统的"物理治疗技术/方法/理疗"综述按所治疾病归类**——别因标题含"技术 / 方法 / 理疗 / techniques / modalities"字样就塞进 manual-modality（如内异症的"physical therapy techniques"综述 → orthopedic/pelvic-floor）。一般性医学综述（如 JAMA《Low Back Pain: A Review》）按所述临床条件归类（腰痛 → orthopedic）。
- **丢弃非康复结局的外科 / 预后研究**：以术后勃起功能、术后并发症、死亡率等**非康复结局**为主题的预测模型 / nomogram，或外科术式 / 内固定 / 减压决策本身（无康复干预），即便挂着"脊髓损伤 / 卒中 / 术后恢复"字样也直接丢弃，不返回该 index，别给分。

studyDesign 规则（仅 tags[0]==="research" 的条目需填）：
从标题/摘要判断研究设计，取以下五个值之一：
  "RCT"      — 随机（对照）试验（含 pilot RCT）
  "系统综述"  — systematic review 和/或 meta-analysis
  "观察研究"  — 队列 / 横断面 / 病例对照 / 前瞻 / 回顾性观察
  "综述"      — 叙述综述 / scoping review / 文献综述（非系统）
  "述评"      — editorial / commentary / 专家意见 / perspective
news / guideline / policy 条目不填 studyDesign（省略该字段）。

请只返回 JSON 数组（不要 markdown 代码块），格式：
[{"index":0,"curatedScore":85,"curatedReason":"中文 why-it-matters，第二人称给 take","curatedReasonEn":"Same take in English, same voice rules","limitation":"一句话证据局限，判断不出留空字符串","limitationEn":"One-line study limitation, blank string if none","tags":["research","spine"],"studyDesign":"RCT","summary":"One-line English neutral summary","titleZh":"中文标题","summaryZh":"中文摘要，1-2 句，保留数字","titleEn":"English title（仅当原始 title 非英文时；否则省略）","category":"orthopedic（仅输入为 null 时必填）"}]

只保留 curatedScore >= 65 的条目。`;

  const userPrompt = `请策展以下 ${items.length} 条新闻：\n\n${JSON.stringify(items, null, 2)}`;

  const text = await llm(systemPrompt, userPrompt);
  if (!text) return [];
  let curated = await repairEnglishReasons(parseCuratedArray(text));
  curated = await repairChineseSummaries(curated);
  curated = await repairBoilerplateReasons(curated); // 反模板腔（对抗性审查 #8）
  return curated.map(fixItem); // 落库前确定性校正已知错译（递归，绕开标识符字段）
}

// 语言兜底：curatedReason 必须是中文，但模型偶尔会无视提示词、把英文 take
// 原样塞进两个字段（2026-06-12 一整批 11 条全是英文）。这里检测无 CJK 的
// curatedReason，把英文版挪去 curatedReasonEn，再批量请模型重写中文版。
// 修复失败的条目保持原样（英文总比丢条目好）。
const CJK_RE = /[一-鿿]/;

const REPAIR_SYSTEM = `你是 Cadence（步频）物理治疗新闻站的中文编辑。下面每条的 curatedReason（why-it-matters）本应是中文，却生成成了英文。请把每条改写成 1-2 句中文：
- **第二人称**对临床读者说话，给 take 而不是 recap——直接下判断：这条改变什么、不改变什么、该做什么、别做什么。
- 禁止条件句开头（"如果你在使用…"、"如果你关注…"）——默认读者就是干这行的。
- 禁止空效用措辞："有参考价值"、"帮助你决策"、"值得关注"、"提供了依据/证据/支持"、"有指导意义"。
- 口吻是资深同行，可以泼冷水、可以站队。不是逐字翻译，是同一条专业意见的中文版。
- 缩写（RCT、ACL、COPD 等）保留英文；保留原文里的数字（样本量、效应量、p 值）。

请只返回 JSON 数组（不要 markdown 代码块）：[{"index":0,"curatedReason":"中文"}]`;

async function repairEnglishReasons(curated) {
  const bad = curated.filter(c => c.curatedReason && !CJK_RE.test(c.curatedReason));
  if (!bad.length) return curated;
  console.log(`   🛠  ${bad.length} curatedReason came back in English — rewriting in Chinese`);
  for (let off = 0; off < bad.length; off += 10) {
    const batch = bad.slice(off, off + 10);
    const user = `重写以下 ${batch.length} 条：\n\n` + JSON.stringify(
      batch.map((c, i) => ({ index: i, title: c.summary || '', curatedReason: c.curatedReason })), null, 2);
    const text = await callLLM(REPAIR_SYSTEM, user);
    const fixed = parseCuratedArray(text || '');
    fixed.forEach(f => {
      const c = batch[f.index];
      if (!c || !f.curatedReason || !CJK_RE.test(f.curatedReason)) return;
      if (!c.curatedReasonEn) c.curatedReasonEn = c.curatedReason; // 英文版别丢
      c.curatedReason = f.curatedReason;
    });
  }
  const still = curated.filter(c => c.curatedReason && !CJK_RE.test(c.curatedReason)).length;
  if (still) console.log(`   ⚠️  ${still} reasons still English after repair (kept as-is)`);
  return curated;
}

// 镜像兜底：summary 必须是英文（它是英文界面 + 英文分享卡的正文），但模型
// 会以 ~30% 的频率无视提示词、把中文摘要塞进 summary（2026-07-04 审查实测
// 22/75 条，全部 PubMed leg）。检测含 CJK 的 summary：先把中文版挪去
// summaryZh（若缺），再批量请模型重写英文版。修复失败的条目保持原样。
const SUMMARY_EN_REPAIR_SYSTEM = `你是 Cadence（步频）物理治疗新闻站的英文编辑。下面每条的 summary 本应是英文，却生成成了中文。请把每条改写成 1-2 句中性英文：
- front-load "what changed"——先说结论方向，再说条件。
- 保留原文里的所有数字（样本量、效应量、p 值 / CI），照抄原值，绝不臆测。
- 缩写（RCT、ACL、COPD 等）保留。专业、紧凑，不是逐字翻译。
- 只讲研究"发现了什么"，不罗列统计方法。

请只返回 JSON 数组（不要 markdown 代码块）：[{"index":0,"summary":"English summary"}]`;

async function repairChineseSummaries(curated) {
  const bad = curated.filter(c => CJK_RE.test(c.summary || ''));
  if (!bad.length) return curated;
  console.log(`   🛠  ${bad.length} summary came back in Chinese — rewriting in English`);
  for (let off = 0; off < bad.length; off += 10) {
    const batch = bad.slice(off, off + 10);
    const user = `重写以下 ${batch.length} 条：\n\n` + JSON.stringify(
      batch.map((c, i) => ({ index: i, summary: c.summary })), null, 2);
    const text = await callLLM(SUMMARY_EN_REPAIR_SYSTEM, user);
    const fixed = parseCuratedArray(text || '');
    fixed.forEach(f => {
      const c = batch[f.index];
      if (!c || !f.summary || CJK_RE.test(f.summary)) return;
      if (!c.summaryZh) c.summaryZh = c.summary; // 中文版别丢
      c.summary = f.summary;
    });
  }
  const still = curated.filter(c => CJK_RE.test(c.summary || '')).length;
  if (still) console.log(`   ⚠️  ${still} summaries still Chinese after repair (kept as-is)`);
  return curated;
}

// 模板腔兜底（2026-07-08 对抗性审查 #8）：why-it-matters 的价值在判断，但模型
// 高频回落到两种样板——(a) 第一句复述 summary（"这项研究评估了…"/"This study
// examined…"），(b) 空效用句式（"provides you with the latest evidence…,
// helping you…" / "帮助你了解…"）。提示词已禁；这里做确定性检测 + 批量重写。
// 检测刻意收窄避免误伤真判断（"该系统综述坐实了…"不命中——recap 判定要求
// 主语后面跟"评估/考察/examined/compared"类动词）；重写后仍命中的保留原文。
const REASON_SLOP_EN = new RegExp([
  '^this\\b[^.]{0,80}\\b(study|review|trial|meta-analysis|analysis|consensus|editorial|rct|cohort|protocol)\\b[^.]{0,40}\\b(examined|explored|investigated|evaluated|assessed|estimated|compared|analy[sz]ed|monitored|surveyed|reviewed|identified|determined|generated|provides recommendations|aims to)',
  'provides? you with', 'provides (valuable|the latest|specific)',
  'help(s|ing)? you (better )?(understand|screen|develop|make|select|identify)',
  'guiding you to', 'represents the latest', 'warrants your (attention|consideration)',
].join('|'), 'i');
const REASON_SLOP_ZH = new RegExp([
  '^(这项|这篇|该|本)[^，。]{0,20}(研究|综述|试验|荟萃分析|述评|共识)[^，。]{0,15}(探讨|考察|评估|比较|分析|调查|检验|估计|纳入|旨在|研究了)',
  '为你提供', '帮助你(更好地)?(了解|理解|筛查|制定|做出|识别|选择)',
  '提供了?(最新|具体|宝贵)?的?(证据|数据|信息|见解)', '值得你?(关注|留意)',
].join('|'));

const REASON_SLOP_SYSTEM = `你是 Cadence（步频）物理治疗新闻站的资深编辑。下面每条的 why-it-matters（curatedReason 中文 / curatedReasonEn 英文）写成了模板腔：要么第一句在复述研究做了什么（summary 已经说过），要么是空效用句式（"provides you with the latest evidence…"、"帮助你了解…"）。请基于给出的 summary 重写这两个字段，各 1-2 句：
- 从判断开始，不从"这项研究 / This study"开始——直接说这条改变什么、不改变什么、该做什么、别做什么。
- 第二人称、资深同行口吻，可以泼冷水、可以站队；措辞强度匹配证据强度（小样本 / 观察研究用"提示 / 可能"，不下定论；studyDesign 为 RCT 或系统综述且分数高才可下动作指令）。
- 禁空效用措辞（中英）："有参考价值 / 值得关注 / 帮助你… / 为你提供…"，"provides you with / helping you / valuable insights / worth your attention"。
- 保留原文里的数字；缩写（RCT、ACL 等）保留英文。curatedReason 必须中文，curatedReasonEn 必须英文，是同一条意见的两个语言版本。

请只返回 JSON 数组（不要 markdown 代码块）：[{"index":0,"curatedReason":"中文","curatedReasonEn":"English"}]`;

// Active-Themes 主题短语（2026-07-08 对抗性审查）：theme 名过去直接用代表论文
// 的全题截断——读者读到的是半句论文题，不是"主题"。这里用一次小批量 LLM 调用
// 为每个簇生成中英双语主题短语；调用失败或产出不合格就静默回退（themeZh/En
// 缺省，前端 falls back to 代表论文题），刷新永远不因此中断。
const THEME_LABEL_SYSTEM = `你是 Cadence（步频）物理治疗文献站的编辑。下面每个 theme 是近几天多篇康复研究聚成的簇（给出成员论文标题与分类）。请为每个簇起主题短语：
- themeZh：6-18 字中文短语，概括这簇论文共同的研究主题——是"主题名"，不是任何一篇标题的复述，句末不加标点
- themeEn：3-9 个英文单词的同一主题短语，不加句号；缩写（ACL、RCT、COPD 等）保留
- 短语要具体（「卒中后步态的可穿戴量化」好过「神经康复进展」）

请只返回 JSON 数组（不要 markdown 代码块）：[{"index":0,"themeZh":"…","themeEn":"…"}]`;

async function labelHotTopics(topics) {
  if (!topics || !topics.length) return topics;
  try {
    const user = `为以下 ${topics.length} 个 theme 起短语：\n\n` + JSON.stringify(
      topics.map((t, i) => ({
        index: i, category: t.category,
        memberTitles: (t.members || []).slice(0, 6).map(m => m.title),
      })), null, 2);
    const text = await callLLM(THEME_LABEL_SYSTEM, user);
    const fixed = parseCuratedArray(text || '');
    fixed.forEach(f => {
      const t = topics[f.index];
      if (!t) return;
      const zh = (f.themeZh || '').trim();
      const en = (f.themeEn || '').trim();
      // Accept only well-formed phrases — a bad label is worse than the fallback.
      if (zh && CJK_RE.test(zh) && zh.length <= 24) t.themeZh = zh;
      if (en && !CJK_RE.test(en) && en.split(/\s+/).length <= 12) t.themeEn = en;
    });
    console.log(`   🏷  themed ${topics.filter(t => t.themeZh || t.themeEn).length}/${topics.length} hot topics`);
  } catch (e) {
    console.warn(`   ⚠️  theme labeling failed (${e.message}) — rep titles will show instead`);
  }
  return topics;
}

async function repairBoilerplateReasons(curated) {
  const isSlop = c =>
    (c.curatedReasonEn && REASON_SLOP_EN.test(c.curatedReasonEn)) ||
    (c.curatedReason && REASON_SLOP_ZH.test(c.curatedReason));
  const bad = curated.filter(isSlop);
  if (!bad.length) return curated;
  console.log(`   🛠  ${bad.length} why-it-matters read as boilerplate — rewriting as takes`);
  for (let off = 0; off < bad.length; off += 10) {
    const batch = bad.slice(off, off + 10);
    const user = `重写以下 ${batch.length} 条：\n\n` + JSON.stringify(
      batch.map((c, i) => ({
        index: i, summary: c.summary || '', studyDesign: c.studyDesign || '',
        curatedScore: c.curatedScore, curatedReason: c.curatedReason || '', curatedReasonEn: c.curatedReasonEn || '',
      })), null, 2);
    const text = await callLLM(REASON_SLOP_SYSTEM, user);
    const fixed = parseCuratedArray(text || '');
    fixed.forEach(f => {
      const c = batch[f.index];
      if (!c) return;
      // Accept each language independently, and only when the rewrite actually
      // cleared the pattern — a failed rewrite must not replace the original.
      if (f.curatedReason && CJK_RE.test(f.curatedReason) && !REASON_SLOP_ZH.test(f.curatedReason)) c.curatedReason = f.curatedReason;
      if (f.curatedReasonEn && !CJK_RE.test(f.curatedReasonEn) && !REASON_SLOP_EN.test(f.curatedReasonEn)) c.curatedReasonEn = f.curatedReasonEn;
    });
  }
  const still = curated.filter(isSlop).length;
  if (still) console.log(`   ⚠️  ${still} reasons still boilerplate after rewrite (kept as-is)`);
  return curated;
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
    console.error(`  Parse error: ${e.message} — extracting complete objects`);
    // Scan for every balanced top-level {...} object (string-aware) and parse
    // each independently. Robust to a premature ], trailing prose, or split
    // arrays — the old tail-truncation salvage dropped any object that came
    // AFTER a stray ] (e.g. when Haiku closes the array early then continues).
    const items = [];
    let depth = 0, objStart = -1, inStr = false, esc = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') { if (depth === 0) objStart = i; depth++; }
      else if (ch === '}') {
        if (depth > 0 && --depth === 0 && objStart !== -1) {
          try { items.push(JSON.parse(text.slice(objStart, i + 1))); } catch { /* skip malformed */ }
          objStart = -1;
        }
      }
    }
    console.error(`  Recovered ${items.length} complete items`);
    return items;
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
      model: ANTHROPIC_MODEL,
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

async function callGemini(systemPrompt, userPrompt, json = true) {
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
            // JSON-response mode is for the curation step. Callers that want
            // Markdown prose (e.g. the 公众号 brief) pass json:false — forcing
            // application/json there makes the model emit a JSON object, not an article.
            ...(json ? { responseMimeType: 'application/json' } : {}),
            // Thinking tokens count toward maxOutputTokens — disable so the
            // budget goes entirely to the response payload.
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

// DeepSeek — OpenAI-compatible endpoint. Thinking mode defaults to ENABLED on
// V4; we disable it so the batch JSON comes back fast/cheap without burning
// output budget on chain-of-thought (parity with the Gemini thinkingBudget:0
// above). Model is swappable via DEEPSEEK_MODEL (deepseek-v4-flash / -pro).
async function callDeepSeek(systemPrompt, userPrompt) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      max_tokens: 8000,
      thinking: { type: 'disabled' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!res.ok) {
    console.error(`  DeepSeek error: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return '';
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// One place to route a (system, user) prompt to the configured provider.
function callLLM(systemPrompt, userPrompt, { json = true } = {}) {
  if (LLM_PROVIDER === 'gemini') return callGemini(systemPrompt, userPrompt, json);
  if (LLM_PROVIDER === 'deepseek') return callDeepSeek(systemPrompt, userPrompt);
  return callAnthropic(systemPrompt, userPrompt);
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
    // Keep the EARLIEST firstSeen across cluster members, so a re-found story
    // re-curated today doesn't reset its ingestion time and re-enter the window.
    // ISO strings sort chronologically. (publishedAt is the legacy fallback.)
    const firstSeens = c.members.map(m => m.firstSeen || m.publishedAt).filter(Boolean).sort();
    if (firstSeens.length) main.firstSeen = firstSeens[0];
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
// Theme-level only (Cindy 2026-06-17): in a research-paper vertical the old
// story-level leg — the same story covered by ≥2 independent outlets — almost
// never fires (papers aren't multi-outlet "covered" the way news is), so the
// strip is in practice an active-research-themes tracker; that leg was dropped.
// A theme = ≥2 distinct outlets publishing *different research papers* sharing a
// specific sub-tag within a 4-day window (e.g. two vestibular papers from PubMed
// + JOSPT days apart). Only research items (tags[0] === 'research') aggregate;
// tags[0] is the content-type tag, never a theme, and a denylist of too-generic
// tags is skipped. Heat = distinct-source count × exponential time decay
// (half-life 2 days). Each topic carries kind:'theme' + members[] (the distinct
// papers that fired it). Empty array on quiet days → strip hidden.

const GENERIC_TAGS = new Set(['research', 'news', 'guideline', 'policy', 'rehabilitation', 'physical-therapy', 'pt', 'rehab', 'therapy', 'clinical']);

function computeHotTopics(items) {
  const now = Date.now();
  const decay = (publishedAt) => Math.pow(0.5, Math.max(0, (now - new Date(publishedAt).getTime()) / 86400000) / 2);

  // Theme-level: shared sub-tag, distinct sources, 4-day window.
  // Only research items aggregate into a theme. "Theme heat" is meant to signal
  // an active *research* area; editorials, correspondence, news and policy
  // (tags[0] !== 'research') were inflating themes and surfacing off-topic
  // journal-feed leakage (e.g. a Lancet CKD editorial counted as a
  // cardiopulmonary outlet). tags[0] is the content-type tag.
  const byTag = new Map();
  for (const i of items) {
    if ((i.tags || [])[0] !== 'research') continue;
    const ageDays = (now - new Date(i.publishedAt).getTime()) / 86400000;
    if (!(ageDays <= 4)) continue;
    for (const t of (i.tags || []).slice(1)) {
      if (GENERIC_TAGS.has(t)) continue;
      if (!byTag.has(t)) byTag.set(t, []);
      byTag.get(t).push(i);
    }
  }
  const themeTopics = [];
  for (const [tag, members] of byTag) {
    const srcs = new Set(members.map(m => m.source));
    if (members.length < 2 || srcs.size < 2) continue;
    // Representative card = highest curated score; freshness = newest member
    // (so the client-side decay recompute keeps the theme alive while any
    // member is recent).
    const top = [...members].sort(byCuratedScore)[0];
    const newest = members.reduce((a, b) => (new Date(a.publishedAt) > new Date(b.publishedAt) ? a : b));
    themeTopics.push({
      id: top.id, title: top.title, sourceUrl: top.sourceUrl, category: top.category,
      publishedAt: newest.publishedAt, sourceCount: srcs.size, sources: [...srcs],
      tag, kind: 'theme',
      // Distinct papers under this theme — lets the UI show what actually
      // fired the topic instead of implying N outlets covered one story.
      members: members.map(m => ({ source: m.source, title: m.title, titleZh: m.titleZh })),
      heat: Math.round(srcs.size * decay(newest.publishedAt) * 100) / 100
    });
  }

  const seen = new Set();
  return themeTopics
    .filter(t => t.heat >= 1.2)
    .sort((a, b) => b.heat - a.heat)
    .filter(t => (seen.has(t.id) ? false : seen.add(t.id)))
    .slice(0, 5);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n⚡ Cadence PT News Refresh — ${new Date().toISOString()}`);
  if (DRY_RUN) { console.log('  DRY_RUN mode\n'); return; }
  const llmKeyByProvider = { gemini: GEMINI_API_KEY, deepseek: DEEPSEEK_API_KEY, anthropic: ANTHROPIC_API_KEY };
  const llmKeyName = { gemini: 'GEMINI_API_KEY', deepseek: 'DEEPSEEK_API_KEY', anthropic: 'ANTHROPIC_API_KEY' }[LLM_PROVIDER] || 'ANTHROPIC_API_KEY';
  const llmKey = llmKeyByProvider[LLM_PROVIDER] || ANTHROPIC_API_KEY;
  const needExa = REFRESH_MODE !== 'direct';
  if ((needExa && !EXA_API_KEY) || !llmKey) { console.error(`❌ Missing API keys (${needExa ? 'EXA_API_KEY + ' : ''}${llmKeyName})`); process.exit(1); }
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

  // Archive-aware identity. The append-only archive (archive/YYYY-MM.json) keeps
  // each URL's ORIGINAL firstSeen / curatedScore / id from when we first caught
  // it. A research paper that briefly left the feed and got re-found here must
  // reuse that identity — else it re-stamps firstSeen to today (false "新收录"),
  // re-rolls a non-deterministic LLM score (the 85↔90 churn), and gets a new id
  // (breaking weekly-brief's id-dedup against the archive). Keyed by canonical
  // URL; keep the earliest firstSeen if a URL somehow has multiple rows.
  const archByUrl = (() => {
    const m = new Map();
    try {
      const dir = path.join(__dirname, '..', 'archive');
      for (const f of fs.readdirSync(dir)) {
        if (!/^\d{4}-\d{2}\.json$/.test(f)) continue;
        for (const a of (JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).items || [])) {
          if (!a.sourceUrl || !a.firstSeen) continue;
          const k = canonicalUrl(a.sourceUrl);
          const prev = m.get(k);
          if (!prev || a.firstSeen < prev.firstSeen) m.set(k, { firstSeen: a.firstSeen, curatedScore: a.curatedScore, id: a.id });
        }
      }
    } catch {}
    return m;
  })();

  const VALID_CATS = new Set(['orthopedic', 'neurological', 'sports', 'pediatric', 'geriatric', 'cardiopulmonary', 'manual-modality', 'practice']);
  const final = curated.map(c => {
    const o = unique[c.index];
    if (!o) return null;
    // Reuse the archived identity (firstSeen / score / id) if we've caught this URL before.
    const prior = archByUrl.get(canonicalUrl(o.url));
    // RSS whole-journal items arrive with category:null — critic assigns one.
    const category = o.category || (VALID_CATS.has(c.category) ? c.category : null);
    if (!category) return null;
    // Empty-title guard (one BJSM RSS item shipped a blank title, 2026-07-04):
    // fall back to the summary's first sentence rather than an untitled card.
    const _cleanTitle = normalizeTitle(o.title, o);
    const _summary = c.summary || o.highlights || o.text?.substring(0, 200);
    const _fallbackTitle = () => {
      const s = (_summary || '').trim();
      if (!s) return '(Untitled)';
      const m = s.match(/^.{10,}?[.。！!?？]/);
      const first = (m ? m[0] : s).trim();
      return first.length > 110 ? first.slice(0, 110).trim() + '…' : first;
    };
    const item = {
      id: prior?.id || `news-${Date.now()}-${c.index}`,
      title: (_cleanTitle || '').trim() || _fallbackTitle(),
      summary: _summary,
      category,
      source: o.source,
      sourceUrl: o.url,
      publishedAt: o.publishedDate,
      // Ingestion time — when WE first caught this item. The daily edition
      // windows on firstSeen, not publishedAt, so a journal's lagged publish
      // date can't keep a freshly-ingested study out of "今日". Reuse the
      // archived firstSeen when we've seen this URL before, so a re-found paper
      // keeps its true catch date instead of resetting to today.
      firstSeen: prior?.firstSeen || new Date().toISOString(),
      // Pin the original score: re-curation is non-deterministic, so a re-found
      // paper keeps the score it first earned (avoids the 85↔90 churn).
      curatedScore: prior && typeof prior.curatedScore === 'number' ? prior.curatedScore : c.curatedScore,
      curatedReason: c.curatedReason,
      // Bilingual fields (中英切换) — optional in old data, required in new runs.
      ...(c.titleZh ? { titleZh: c.titleZh } : {}),
      // English title for non-English-source items (model omits it when title is already English).
      ...(c.titleEn ? { titleEn: c.titleEn } : {}),
      ...(c.summaryZh ? { summaryZh: c.summaryZh } : {}),
      ...(c.curatedReasonEn ? { curatedReasonEn: c.curatedReasonEn } : {}),
      // One-line study limitation — emitted only when the model could ground it
      // in the title/abstract; absent (not "") when there's nothing to say.
      ...(c.limitation ? { limitation: c.limitation } : {}),
      ...(c.limitationEn ? { limitationEn: c.limitationEn } : {}),
      tags: c.tags || [],
      // Study-design badge (XHS card): RCT / 系统综述 / 观察研究 / 综述 / 述评
      ...(c.studyDesign ? { studyDesign: c.studyDesign } : {}),
      // Journal identity for the IF / JCR-quartile badge (journals.json lookup)
      ...(o.journal ? { journal: o.journal } : {}),
      ...(o.related?.length ? { related: o.related } : {})
    };
    // 康复科技 cross-cutting overlay — items keep their clinical category and
    // additionally carry tech:true (filter pill / card chip / pulse row).
    if (isTech(item)) item.tech = true;
    return item;
  }).filter(Boolean)
    .filter(i => {
      if (isRehabRelevant(i)) return true;
      console.log(`   ⏭️  off-topic dropped: ${(i.title || '').slice(0, 70)}`);
      return false;
    })
    .sort((a, b) => b.curatedScore - a.curatedScore);

  // Merge with existing — EVERY item carries on firstSeen (when WE caught it).
  // News / guideline / policy are rare and near-static, so they get long windows.
  // Research previously used a 7-day publishedAt window, but the same paper keeps
  // surfacing from PubMed for up to PUBMED_LOOKBACK_DAYS (edat). A 7-day window
  // dropped it at day 7 while PubMed still returned it through day 14 — the gap
  // re-ingested it as "novel" every run, resetting firstSeen (false "新收录") and
  // re-rolling a non-deterministic LLM score. Carrying research on firstSeen for
  // the SAME span as the PubMed window keeps it continuously in the feed, so the
  // incremental gate suppresses the re-find (no re-curation, no churn) and it
  // retires cleanly only when PubMed stops returning it.
  const CARRY_DAYS = { news: 30, guideline: 90, policy: 90 }; // firstSeen-based
  const RESEARCH_CARRY_DAYS = PUBMED_LOOKBACK_DAYS;           // research / default: firstSeen-based, aligned to the PubMed edat window
  const _carryNow = Date.now();
  const inCarryWindow = (i) => {
    const ext = CARRY_DAYS[(i.tags || [])[0]] ?? RESEARCH_CARRY_DAYS;
    const seen = new Date(i.firstSeen || i.publishedAt).getTime();
    return seen > _carryNow - ext * 86400000;
  };
  let existing = [];
  try {
    const old = JSON.parse(fs.readFileSync(NEWS_PATH, 'utf8'));
    existing = (old.items || [])
      .filter(inCarryWindow)
      // Re-validate against the roster so items from since-removed sources
      // age out immediately, and relabel in case a source was renamed.
      // Backfill firstSeen for legacy items (pre-firstSeen) from publishedAt —
      // a past date, so the migration never dumps the whole feed into one edition.
      // Heal already-churned carried items too: if the archive holds an earlier
      // firstSeen / original score / original id for this URL, restore them so a
      // previously-churned entry converges back to its true identity in-place.
      .map(i => {
        const prior = archByUrl.get(canonicalUrl(i.sourceUrl));
        const baseSeen = i.firstSeen || i.publishedAt;
        const firstSeen = prior && prior.firstSeen < baseSeen ? prior.firstSeen : baseSeen;
        return {
          ...i,
          title: normalizeTitle(i.title, i),
          ...(i.titleEn ? { titleEn: normalizeTitle(i.titleEn, i) } : {}),
          source: matchSource(i.sourceUrl),
          firstSeen,
          ...(prior && prior.id ? { id: prior.id } : {}),
          ...(prior && typeof prior.curatedScore === 'number' ? { curatedScore: prior.curatedScore } : {}),
        };
      })
      .filter(i => i.source)
      // Apply the relevance gate to carried-over items too, so off-topic
      // content curated before this gate existed ages out on the next run.
      .filter(isRehabRelevant);
  } catch {}

  // Cluster-aware merge: a re-found story unions its related-source list
  // instead of being silently dropped, so heat can build across days.
  const merged = clusterItems([...final, ...existing], byCuratedScore).slice(0, MAX_ITEMS);
  // Hot topics: prefer semantic clustering over Voyage embeddings; fall back to
  // the legacy tag+source heuristic if VOYAGE_API_KEY is missing or the API
  // errors, so a refresh never breaks on the embedding path.
  let hotTopics;
  try {
    if (!process.env.VOYAGE_API_KEY) throw new Error('VOYAGE_API_KEY not set');
    const embCache = await embedMissing(merged, { verbose: true });
    hotTopics = computeHotTopicsEmbed(merged, embCache);
    console.log(`   Hot topics (embedding): ${hotTopics.length}`);
  } catch (e) {
    console.warn(`   ⚠️  embedding hot-topics unavailable (${e.message}); using tag-based fallback`);
    hotTopics = computeHotTopics(merged);
    console.log(`   Hot topics (tag-based): ${hotTopics.length}`);
  }
  hotTopics = await labelHotTopics(hotTopics); // 双语主题短语（对抗性审查：theme 名不再是论文题截断）

  // Archive — every item that makes it into news.json is mirrored once into
  // archive/YYYY-MM.json so stories rotating out (7-day cutoff / MAX_ITEMS cap)
  // aren't lost. Dedup by canonical URL (re-found stories get fresh ids).
  // NB: we archive from `merged` (the full feed about to be written), not just
  // this run's freshly-curated `final`. Archiving only `final` silently drops
  // carried-over `existing` items — any story first curated before this archive
  // step existed, or surviving multiple runs without re-curation, never reached
  // the archive and vanished permanently when it rotated out. Sourcing from
  // `merged` makes the archive a strict superset of everything the feed ever held.
  {
    const ARCHIVE_DIR = path.join(__dirname, '..', 'archive');
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    const archPath = path.join(ARCHIVE_DIR, `${new Date().toISOString().slice(0, 7)}.json`);
    let arch = [];
    try { arch = JSON.parse(fs.readFileSync(archPath, 'utf8')).items || []; } catch {}
    const known = new Set(arch.map(i => canonicalUrl(i.sourceUrl)));
    const additions = merged.filter(i => !known.has(canonicalUrl(i.sourceUrl)));
    if (additions.length) {
      arch.push(...additions);
      fs.writeFileSync(archPath, JSON.stringify({ items: arch }, null, 2));
      console.log(`   Archive: +${additions.length} → archive/${path.basename(archPath)} (${arch.length} total)`);
    }

    // Integrity check: the archive is meant to be a strict superset of the feed.
    // If anything in news.json isn't in this month's archive, a story will be
    // lost the moment it rotates out — exactly the bug that dropped the 5 early
    // articles. Surface it loudly rather than letting it pass silently.
    const archUrls = new Set(arch.map(i => canonicalUrl(i.sourceUrl)));
    const orphans = merged.filter(i => !archUrls.has(canonicalUrl(i.sourceUrl)));
    if (orphans.length) {
      console.error(`   ⚠️  ARCHIVE GAP: ${orphans.length} feed item(s) not archived — will be lost on rotation:`);
      for (const o of orphans) console.error(`        [${o.curatedScore}] ${(o.title || '').slice(0, 70)}`);
    } else {
      console.log(`   ✓ Archive integrity: all ${merged.length} feed items present in archive`);
    }

    // Manifest — archive/index.json lists every monthly file with item count,
    // score range and date span, so the (future) archive page and the WeChat
    // monthly-leaderboard can discover months without guessing filenames or
    // loading every file. Rebuilt from disk each run; cheap and self-healing.
    try {
      const months = fs.readdirSync(ARCHIVE_DIR)
        .filter(f => /^\d{4}-\d{2}\.json$/.test(f))
        .sort().reverse();
      const manifest = months.map(f => {
        const items = (JSON.parse(fs.readFileSync(path.join(ARCHIVE_DIR, f), 'utf8')).items) || [];
        const scores = items.map(i => i.curatedScore || 0);
        const dates = items.map(i => i.publishedAt).filter(Boolean).sort();
        return {
          month: f.replace('.json', ''),
          file: f,
          count: items.length,
          maxScore: scores.length ? Math.max(...scores) : 0,
          minScore: scores.length ? Math.min(...scores) : 0,
          firstPublished: dates[0] || null,
          lastPublished: dates[dates.length - 1] || null
        };
      });
      fs.writeFileSync(path.join(ARCHIVE_DIR, 'index.json'), JSON.stringify({
        generatedAt: new Date().toISOString(),
        totalItems: manifest.reduce((s, m) => s + m.count, 0),
        months: manifest
      }, null, 2));
      console.log(`   Manifest: archive/index.json (${manifest.length} month(s), ${manifest.reduce((s, m) => s + m.count, 0)} items)`);
    } catch (e) {
      console.error('   ⚠️  manifest write failed:', e.message);
    }
  }

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

  // ── RSS 2.0 feed ────────────────────────────────────────────────────────────
  // SITE_URL is the source of truth (set per-env in the workflow), with the
  // production domain as a fallback so CI / local / manual runs all emit a valid
  // self+channel link instead of an empty one. Preview/branch deploys should set
  // SITE_URL explicitly so they don't write the production URL into their feed.
  const SITE_URL = (process.env.SITE_URL || 'https://incadencept.com').replace(/\/$/, '');
  try {
    const xmlEsc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const rssDate = (iso) => iso ? new Date(iso).toUTCString() : new Date().toUTCString();
    const top = [...merged].sort((a, b) => b.curatedScore - a.curatedScore).slice(0, 20);
    const items = top.map(i => `  <item>
    <title>${xmlEsc(i.title)}</title>
    <link>${SITE_URL}/?item=${xmlEsc(encodeURIComponent(i.id))}</link>
    <guid isPermaLink="true">${xmlEsc(i.sourceUrl)}</guid>
    <pubDate>${rssDate(i.publishedAt)}</pubDate>
    <description><![CDATA[${(i.summary || i.curatedReason || '').replace(/]]>/g, ']]]]><![CDATA[>')}]]></description>
    <category>${xmlEsc(i.category)}</category>
    <author>${xmlEsc(i.source)}</author>
  </item>`).join('\n');
    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>Cadence 步频 — PT Research Signal</title>
  <link>${SITE_URL}/</link>
  <description>Daily curated physical therapy &amp; rehab research for clinicians. AI-scored signal from 50 sources.</description>
  <language>en</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  <ttl>360</ttl>${SITE_URL ? `\n  <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>` : ''}
${items}
</channel>
</rss>`;
    fs.writeFileSync(path.join(__dirname, '..', 'rss.xml'), rss);
    console.log('   rss.xml 已更新');
  } catch (e) { console.error('   ⚠️  rss.xml 生成失败:', e.message); }

  // ── Sitemap ─────────────────────────────────────────────────────────────────
  // Root + one /?item=<id> permalink per story (live + archive) so every item
  // is an indexable URL. Same SITE_URL convention as the RSS block above.
  try {
    const { buildSitemap } = require('./build-sitemap');
    const { urls } = buildSitemap();
    console.log(`   sitemap.xml 已更新 (${urls} URLs)`);
  } catch (e) { console.error('   ⚠️  sitemap.xml 生成失败:', e.message); }

  // NOTE: the homepage <head> keeps brand-level static og:title/description on
  // purpose — the index.html canonical title should be stable ("Cadence — daily
  // PT evidence"), not rewritten to the top article each run. Per-article
  // permalinks are /?item=<id> (client-rendered title/canonical/JSON-LD);
  // static og tags for those URLs would need edge-side injection — not done yet.

  return { newItems: final.length, totalItems: merged.length,
    headlines: merged.slice(0, 5).map(i => `[${i.curatedScore}] ${i.title}`) };
}

// Run only when invoked directly — scripts/wechat-brief.js requires this
// module for the shared LLM callers without triggering a refresh.
if (require.main === module) {
  main().then(s => {
    if (s) { console.log('\n📰 Top:'); s.headlines.forEach(h => console.log(`   ${h}`)); }
    console.log('Done.\n');
  }).catch(e => { console.error('❌', e); process.exit(1); });
}

module.exports = { main, curateWithClaude, callAnthropic, callGemini, callDeepSeek, callLLM, LLM_PROVIDER, computeHotTopics, isTech, isRehabRelevant, repairBoilerplateReasons };
