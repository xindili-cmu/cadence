/**
 * Kinetics News Refresh — Curated Physical Therapy / Rehab News Feed
 * (Kinetics = working name, pending designer; rename strings at rebrand pass)
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
 * Pipeline: Exa search → deduplicate → Claude curation → news.json
 *
 * Env vars:
 *   EXA_API_KEY, ANTHROPIC_API_KEY
 *
 * Usage:
 *   node scripts/news-refresh.js
 *   DRY_RUN=true node scripts/news-refresh.js
 */

const fs = require('fs');
const path = require('path');

const EXA_API_KEY = process.env.EXA_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const DRY_RUN = process.env.DRY_RUN === 'true';

const NEWS_PATH = path.join(__dirname, '..', 'news.json');
const MAX_ITEMS = 30;
const LOOKBACK_DAYS = 7; // PT news cadence is slower than climate-tech; revisit after 2 weeks
const CURATE_TOP_N = 25;

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
    source: extractDomain(r.url)
  }));
}

function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    const map = {
      'jospt.org': 'JOSPT', 'apta.org': 'APTA',
      'academic.oup.com': 'PTJ', 'physio-pedia.com': 'Physiopedia',
      'pubmed.ncbi.nlm.nih.gov': 'PubMed', 'medrxiv.org': 'medRxiv',
      'thelancet.com': 'The Lancet', 'bmj.com': 'BMJ', 'jamanetwork.com': 'JAMA',
      'nature.com': 'Nature', 'sciencedirect.com': 'ScienceDirect',
      'statnews.com': 'STAT', 'modernhealthcare.com': 'Modern Healthcare',
      'reuters.com': 'Reuters', 'healthline.com': 'Healthline',
      'physiotherapy.asn.au': 'APA (AU)', 'ahpra.gov.au': 'AHPRA',
      'choosept.com': 'ChoosePT', 'webpt.com': 'WebPT',
      'dxy.cn': '丁香园', 'cnhealthcare.com': '健康界'
    };
    return map[hostname] || hostname;
  } catch { return 'Unknown'; }
}

// ── Claude Curation ─────────────────────────────────────────────────────────

async function curateWithClaude(rawItems) {
  const items = rawItems.slice(0, CURATE_TOP_N).map((item, i) => ({
    index: i,
    title: item.title,
    text: item.text?.substring(0, 400),
    category: item.category,
    source: item.source
  }));

  const systemPrompt = `你是 Kinetics 的物理治疗 / 康复医学新闻策展 AI。

Kinetics 是独立物理治疗专业新闻品牌，覆盖临床研究、技术进展、监管动态、行业实践。读者是临床医师，分两类并重：practicing（诊所 + 医院 PT/PTA/owner）和 academic（faculty / student / resident）。不面向患者。语气：clinically authoritative, evidence-graded, accessible without dumbed-down jargon。地理范围：美国 + 中国 + 澳大利亚三市场。

8 个垂直分类（slug 必须精确匹配；不要发明新 slug）：
1. Orthopedic (orthopedic) — 骨科 / 肌肉骨骼康复。sub-tags: spine, knee, shoulder, hand-wrist, foot-ankle, hip, pelvic-floor
2. Neurological (neurological) — 神经康复。sub-tags: stroke, parkinson, ms, brain-injury, spinal-cord, vestibular
3. Sports & Athletic (sports) — 运动康复 / 重返运动 / 表现训练
4. Pediatric (pediatric) — 儿童康复 / 发育障碍 / 早期干预
5. Geriatric (geriatric) — 老年康复 / 跌倒预防 / 衰弱
6. Cardiopulmonary (cardiopulmonary) — 心肺康复 / COPD / 心脏康复
7. Manual Therapy & Modalities (manual-modality) — 手法与理疗。sub-tags: dry-needling, iastm, electro, laser, taping, manipulation
8. Practice & Profession (practice) — 行业与执业。sub-tags: reimbursement, regulation, telehealth, education, ethics, workforce

tags 规则：有 sub-tag axis 的分类（orthopedic / neurological / manual-modality / practice），tags 数组里优先放上面列出的 sub-tag slug（可多选）；其他分类 tags 自由但保持 kebab-case 英文。

评分标准（信号质量为核心）：
- 90+ = 临床实践改变级别：高水平证据更新（大样本 RCT / 系统综述推翻或确立干预）、重大监管 / 报销变化
- 80-89 = 重要进展，值得临床医师 deep dive
- 70-79 = 有参考价值的研究 / 新闻
- 60-69 = 一般动态
- <60 = 噪音（会议预告、产品软文、患者向科普、内容农场转载）

编辑标准：
- summary：1-2 句中性英文，front-load "what changed"。研究类必带样本量 + 关键效应量（或 p 值 / CI），原文没给就不编造。
- curatedReason ("why it matters")：1-2 句中文，**第二人称**对临床读者说话，给 take 而不是 recap——这条研究/新闻怎么改变他的临床判断 / 患者管理 / 技术选择 / 执业决策。
- 数字优先于形容词（样本量、效应量、报销金额、生效日期）。不用 emoji。
- 不夸大研究结论：单个小样本研究不写成实践改变；研究限制（样本量小、无对照、随访短、行业资助）在 curatedReason 里点出。
- 监管 / 报销类新闻必须分清适用市场（US / China / Australia），不要把单一市场政策写成普适。

请只返回 JSON 数组（不要 markdown 代码块），格式：
[{"index":0,"curatedScore":85,"curatedReason":"中文 why-it-matters，第二人称给 take","tags":["tag1","tag2"],"summary":"One-line English neutral summary"}]

只保留 curatedScore >= 65 的条目。`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: `请策展以下 ${items.length} 条新闻：\n\n${JSON.stringify(items, null, 2)}` }]
    })
  });

  if (!res.ok) {
    console.error(`  Claude error: ${res.status}`);
    return [];
  }

  const data = await res.json();
  const text = data.content?.map(c => c.text || '').join('') || '';
  try {
    return JSON.parse(text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());
  } catch (e) {
    console.error('  Parse error:', e.message);
    return [];
  }
}

// ── Dedup ───────────────────────────────────────────────────────────────────

function dedup(items) {
  const seen = new Map();
  return items.filter(item => {
    const key = item.title.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '').substring(0, 60);
    if (seen.has(key)) return false;
    seen.set(key, true);
    return true;
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n⚡ Kinetics PT News Refresh — ${new Date().toISOString()}`);
  if (DRY_RUN) { console.log('  DRY_RUN mode\n'); return; }
  if (!EXA_API_KEY || !ANTHROPIC_API_KEY) { console.error('❌ Missing API keys'); process.exit(1); }

  let raw = [];
  for (const cat of CATEGORY_QUERIES) {
    console.log(`📡 ${cat.category}`);
    for (const q of cat.queries) {
      const r = await searchExa(q, 4);
      raw.push(...r.map(x => ({ ...x, category: cat.category })));
      console.log(`   "${q}" → ${r.length}`);
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log(`\n📊 Raw: ${raw.length}`);
  const unique = dedup(raw);
  unique.sort((a, b) => (b.score || 0) - (a.score || 0));
  console.log(`   Unique: ${unique.length}`);

  console.log(`\n🤖 Curating with Claude...`);
  const curated = await curateWithClaude(unique);
  console.log(`   Curated: ${curated.length} items`);

  const final = curated.map(c => {
    const o = unique[c.index];
    if (!o) return null;
    return {
      id: `news-${Date.now()}-${c.index}`,
      title: o.title,
      summary: c.summary || o.highlights || o.text?.substring(0, 200),
      category: o.category,
      source: o.source,
      sourceUrl: o.url,
      publishedAt: o.publishedDate,
      curatedScore: c.curatedScore,
      curatedReason: c.curatedReason,
      tags: c.tags || []
    };
  }).filter(Boolean).sort((a, b) => b.curatedScore - a.curatedScore);

  // Merge with existing (keep 7 days)
  let existing = [];
  try {
    const old = JSON.parse(fs.readFileSync(NEWS_PATH, 'utf8'));
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
    existing = (old.items || []).filter(i => new Date(i.publishedAt) > cutoff);
  } catch {}

  const merged = dedup([...final, ...existing]).slice(0, MAX_ITEMS);

  fs.writeFileSync(NEWS_PATH, JSON.stringify({
    meta: {
      lastUpdated: new Date().toISOString(),
      totalItems: merged.length,
      categories: ['orthopedic', 'neurological', 'sports', 'pediatric', 'geriatric', 'cardiopulmonary', 'manual-modality', 'practice']
    },
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
