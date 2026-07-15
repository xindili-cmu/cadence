// worker.js — edge shim in front of the static assets (wrangler.jsonc `main`).
//
// Job: per-item social share cards. Crawlers (WeChat, LinkedIn, X, Slack…)
// don't execute JS, so a shared permalink (/?item=<id>) would otherwise show
// the site-level og:title/description. This worker runs ONLY for the root
// document (assets.run_worker_first: ["/", "/index.html"]) and, when ?item=
// is present, rewrites <head> metadata to the story's own title/summary.
// Every other request (JS/CSS/JSON/images) bypasses the worker entirely.
//
// Failure posture: any error falls through to the untouched asset response —
// the site can never be taken down by this shim.

// Locale-aware copy: links shared from the EN edition carry &lang=en and get
// English og fields (US market); default stays zh-first (core audience).
const CJK_RE = /[一-鿿]/;
function storyMeta(story, lang) {
  const en = lang === 'en';
  const title = (en ? (story.titleEn || story.title) : (story.titleZh || story.title)) || '';
  // en guard (2026-07-04): the pipeline occasionally wrote a Chinese summary
  // into `summary` — an EN share card (LinkedIn daily path) must never carry a
  // Chinese description. Fall back to the English take (curatedReasonEn),
  // which is English by construction; last resort is an empty description.
  const enDesc = !CJK_RE.test(story.summary || '')
    ? (story.summary || story.curatedReasonEn || '')
    : (story.curatedReasonEn || '');
  const rawDesc = (en ? enDesc : (story.summaryZh || story.summary)) || '';
  const desc = rawDesc.length > 200 ? rawDesc.slice(0, 199) + '…' : rawDesc;
  return { title, desc };
}

// Look the id up in the live feed first, then archive months (newest first).
// All fetches go through the assets binding — same-colo, no public egress.
async function findStory(id, url, env) {
  const getJson = async (path) => {
    try {
      const r = await env.ASSETS.fetch(new Request(new URL(path, url)));
      return r.ok ? await r.json() : null;
    } catch { return null; }
  };
  const live = await getJson('/news.json');
  let hit = live && (live.items || []).find((s) => s.id === id);
  if (hit) return hit;
  const idx = await getJson('/archive/index.json');
  const files = ((idx && idx.months) || []).map((m) => m.file).filter(Boolean).sort().reverse();
  for (const f of files) {
    const month = await getJson('/archive/' + f);
    hit = month && (month.items || []).find((s) => s.id === id);
    if (hit) return hit;
  }
  return null;
}

// Daily-brief permalink meta (?daily=YYYY-MM-DD). Same crawler story as
// ?item=: the app's daily view lives behind #daily/<date>, which crawlers
// never see — this real-URL twin gets its own title/description/canonical
// and is listed in the sitemap (2026-07-15 adversarial review).
async function dailyMeta(date, url, env, lang) {
  try {
    const r = await env.ASSETS.fetch(new Request(new URL(`/briefs/daily/${date}.json`, url)));
    if (!r.ok) return null;
    const d = await r.json();
    const en = lang === 'en';
    const lead = d.lead || {};
    const leadTitle = (en ? (lead.titleEn || lead.titleZh) : (lead.titleZh || lead.titleEn)) || '';
    const title = en
      ? `Daily brief ${date}${leadTitle ? ` — ${leadTitle}` : ''}`
      : `每日简报 ${date}${leadTitle ? ` — ${leadTitle}` : ''}`;
    const rawDesc = (en ? (lead.paragraphEn || '') : (lead.paragraphZh || '')) ||
      (en ? `Curated rehab evidence for ${date}.` : `${date} 康复证据精选。`);
    const desc = rawDesc.length > 200 ? rawDesc.slice(0, 199) + '…' : rawDesc;
    return { title, desc };
  } catch { return null; }
}

// Shared head rewrite for both permalink kinds.
function rewriteHead(assetResp, { pageTitle, title, desc, canonical, lang }) {
  const rw = new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(pageTitle); } })
    .on('meta[name="description"]', { element(el) { el.setAttribute('content', desc); } })
    .on('meta[property="og:type"]', { element(el) { el.setAttribute('content', 'article'); } })
    .on('meta[property="og:title"]', { element(el) { el.setAttribute('content', title); } })
    .on('meta[property="og:description"]', { element(el) { el.setAttribute('content', desc); } })
    .on('meta[property="og:url"]', { element(el) { el.setAttribute('content', canonical); } })
    .on('meta[name="twitter:title"]', { element(el) { el.setAttribute('content', title); } })
    .on('meta[name="twitter:description"]', { element(el) { el.setAttribute('content', desc); } })
    .on('head', {
      element(el) {
        el.append(`<link rel="canonical" href="${canonical}">`, { html: true });
      },
    });
  // EN shares shouldn't carry a Chinese-branded image alt (the og:image itself
  // is the shared site card for both editions).
  if (lang === 'en') {
    rw.on('meta[property="og:image:alt"]', { element(el) { el.setAttribute('content', 'Cadence — keeping pace with the evidence'); } });
  }
  return rw.transform(assetResp);
}

export default {
  async fetch(request, env) {
    const assetResp = await env.ASSETS.fetch(request);
    try {
      const url = new URL(request.url);
      const ct = assetResp.headers.get('content-type') || '';
      if (!ct.includes('text/html')) return assetResp;

      const id = url.searchParams.get('item');
      const daily = url.searchParams.get('daily');
      const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'zh';
      const brand = lang === 'en' ? 'Cadence' : 'Cadence 步频';

      if (!id && !daily) {
        // Plain EN homepage (?lang=en, no permalink): the only zh leak in its
        // share card is the image alt — fix just that, touch nothing else.
        if (lang !== 'en') return assetResp;
        return new HTMLRewriter()
          .on('meta[property="og:image:alt"]', { element(el) { el.setAttribute('content', 'Cadence — keeping pace with the evidence'); } })
          .transform(assetResp);
      }

      if (!id && /^\d{4}-\d{2}-\d{2}$/.test(daily || '')) {
        const dm = await dailyMeta(daily, url, env, lang);
        if (!dm) return assetResp;
        return rewriteHead(assetResp, {
          pageTitle: `${dm.title} — ${brand}`,
          title: dm.title,
          desc: dm.desc,
          canonical: `${url.origin}/?daily=${daily}`,
          lang,
        });
      }
      if (!id) return assetResp;

      const story = await findStory(id, url, env);
      if (!story) return assetResp;

      const { title, desc } = storyMeta(story, lang);
      if (!title) return assetResp;
      // Canonical self-URL for this story: language-independent (?item= only),
      // so Google folds ?lang= variants into one canonical URL. id is our own
      // slug ([\w.-]+ today), but encode defensively.
      // HTMLRewriter escapes attribute values / text content itself; the one
      // `html: true` append uses only the encoded canonical URL.
      return rewriteHead(assetResp, {
        pageTitle: `${title} — ${brand}`,
        title,
        desc,
        canonical: `${url.origin}/?item=${encodeURIComponent(id)}`,
        lang,
      });
    } catch (err) {
      // Never let share-card polish break the page itself.
      console.error('[cadence-worker] og rewrite failed:', err && err.message);
      return assetResp;
    }
  },
};
