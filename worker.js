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

export default {
  async fetch(request, env) {
    const assetResp = await env.ASSETS.fetch(request);
    try {
      const url = new URL(request.url);
      const id = url.searchParams.get('item');
      if (!id) return assetResp;
      const ct = assetResp.headers.get('content-type') || '';
      if (!ct.includes('text/html')) return assetResp;

      const story = await findStory(id, url, env);
      if (!story) return assetResp;

      const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'zh';
      const { title, desc } = storyMeta(story, lang);
      if (!title) return assetResp;
      const pageTitle = `${title} — ${lang === 'en' ? 'Cadence' : 'Cadence 步频'}`;
      // Canonical self-URL for this story: language-independent (?item= only),
      // so Google folds ?lang= variants into one canonical URL. id is our own
      // slug ([\w.-]+ today), but encode defensively.
      const canonical = `${url.origin}/?item=${encodeURIComponent(id)}`;

      // HTMLRewriter escapes attribute values / text content itself; the one
      // `html: true` append uses only the encoded canonical URL.
      return new HTMLRewriter()
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
        })
        .transform(assetResp);
    } catch (err) {
      // Never let share-card polish break the page itself.
      console.error('[cadence-worker] og rewrite failed:', err && err.message);
      return assetResp;
    }
  },
};
