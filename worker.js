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

// Locale-aware copy: links carry an explicit &lang= from the copy-link button
// (both editions). The BARE URL — what Google crawls from the 1000+ sitemap
// permalinks, and what x-default hreflang points at — defaults to EN since
// 2026-08-29: the growth channel is EN SEO + LinkedIn (2026-08-25 decision),
// and the zh default was hobbling it (crawlers indexed Chinese titles for
// every permalink). zh readers keep zh cards via &lang=zh on copied links;
// CN channels are paused, so no new bare links circulate in WeChat.
// Per-item share meta comes from og/<shard>.json, precomputed at deploy time by
// scripts/build-og-index.js (title + ≤200-char desc, EN and ZH — the old
// storyMeta() logic lives there now). 2026-11-15: the previous lookup
// JSON-parsed news.json + every archive month (~4 MB) per request and blew the
// free-tier 10 ms CPU cap 100+ times/day (Googlebot on sitemap permalinks).
// One shard is a few KB. Missing shard/id → untouched page (site-level card).
// ogShard() must stay identical to the one in build-og-index.js
// (pipeline-gates.test.js AC 段 checks).
function ogShard(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % 64).toString(16).padStart(2, '0');
}
async function findStoryMeta(id, url, env, lang) {
  try {
    const r = await env.ASSETS.fetch(new Request(new URL(`/og/${ogShard(id)}.json`, url)));
    if (!r.ok) return null;
    const hit = (await r.json())[id];
    if (!hit) return null;
    const [title, desc] = lang === 'en' ? hit.e : hit.z;
    return { title, desc };
  } catch { return null; }
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
    rw.on('meta[property="og:image:alt"]', { element(el) { el.setAttribute('content', 'Cadence Evidence — keeping pace with the evidence'); } });
  }
  return rw.transform(assetResp);
}

// ── /api/ping — Phase 0 usage telemetry (2026-09-09 decision) ────────────────
// Question being answered: does anyone use the search box? The "ask the
// evidence" bot only earns its LLM bill if search intent already exists on the
// site, so before building it we count for one week (PRINCIPLES.md: 止损先于投入).
// The site had zero analytics before this; this is deliberately the smallest
// possible kind: no cookies, no IP, no third party. Two event kinds:
//   s = a settled search (client debounces 1.5s, dedupes per session)
//   v = a pageview (once per tab session) — the denominator for "% of visits"
// Storage: Workers KV, binding SEARCH_LOG. Every event is ONE key with all its
// data encoded IN THE KEY NAME (values are '1'), so a single
// `wrangler kv key list` reads the whole log — no per-key gets, no race on a
// shared counter. Key shape (':'-separated, query base64url so it can't collide):
//   s:<YYYY-MM-DD>:<ts36><rand>:<lang>:<hits>:<view>:<b64url(q)>
//   v:<YYYY-MM-DD>:<ts36><rand>:<lang>:<mobile 0|1>
// Keys expire after 90 days. Reader: scripts/search-log-report.js.
// Failure posture: same as the rest of this file — never affects the page.
// Unbound SEARCH_LOG (e.g. preview without KV) → 204 and nothing stored.
const PING_TTL = 90 * 24 * 3600;
const PING_MAX_Q = 120;
function b64url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// Automated clients must not count as readers (2026-11-09: cloud-hosted
// headless Chrome on Linux produced ~85% of a day's requests, wrote one `v`
// key per page load and used up the KV free-tier daily writes). First layer is
// navigator.webdriver in app.main.jsx; this catches clients that hide it.
// Desktop Linux is dropped on purpose: for a clinician readership it is almost
// entirely datacenter traffic, and under-counting a few real readers is cheaper
// than a denominator full of bots. Android (also "Linux" in the UA) is kept.
function isAutomatedUA(ua) {
  if (!ua) return true;
  if (/HeadlessChrome|bot\b|crawl|spider|Lighthouse|Playwright|Puppeteer|PhantomJS|Selenium/i.test(ua)) return true;
  if (/X11; Linux/i.test(ua) && !/Android/i.test(ua)) return true;
  return false;
}
async function handlePing(request, env, ctx, url) {
  const no = new Response(null, { status: 204 });
  try {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    // Same-origin only: browsers attach Origin on every POST (sendBeacon
    // included). Anything else is junk — swallow it silently.
    if (request.headers.get('origin') !== url.origin) return no;
    if (!env.SEARCH_LOG) return no;
    if (isAutomatedUA(request.headers.get('user-agent'))) return no;
    const raw = await request.text();
    if (!raw || raw.length > 1024) return no;
    const b = JSON.parse(raw);
    const day = new Date().toISOString().slice(0, 10);
    const uid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const lang = b.lang === 'zh' ? 'zh' : 'en';
    let key;
    if (b.t === 'v') {
      const mobile = b.m ? 1 : 0;
      key = `v:${day}:${uid}:${lang}:${mobile}`;
    } else {
      const q = String(b.q || '').trim().slice(0, PING_MAX_Q);
      if (!q) return no;
      const hits = Number.isFinite(b.hits) ? Math.max(-1, Math.min(9999, Math.trunc(b.hits))) : -1;
      const view = /^[a-z]{1,12}$/.test(b.view || '') ? b.view : 'x';
      key = `s:${day}:${uid}:${lang}:${hits}:${view}:${b64url(q)}`;
    }
    const put = env.SEARCH_LOG.put(key, '1', { expirationTtl: PING_TTL });
    if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
    return no;
  } catch (err) {
    console.error('[cadence-worker] ping failed:', err && err.message);
    return no;
  }
}

export default {
  async fetch(request, env, ctx) {
    // API routes never touch assets. Listed in wrangler.jsonc run_worker_first
    // ("/api/*") — without that entry the asset layer 404s before we run.
    const u0 = new URL(request.url);
    if (u0.pathname === '/api/ping') return handlePing(request, env, ctx, u0);
    const assetResp = await env.ASSETS.fetch(request);
    try {
      const url = new URL(request.url);
      const ct = assetResp.headers.get('content-type') || '';
      if (!ct.includes('text/html')) return assetResp;

      const id = url.searchParams.get('item');
      const daily = url.searchParams.get('daily');
      const lang = url.searchParams.get('lang') === 'zh' ? 'zh' : 'en'; // default en — see header note (2026-08-29)
      // EN full name is "Cadence Evidence" (2026-08-30 naming decision —
      // see PRINCIPLES.md 品牌名分治): "Cadence"-alone SERPs are owned by
      // EDA/clinics; the two-word phrase is the ownable, searchable brand.
      const brand = lang === 'en' ? 'Cadence Evidence' : 'Cadence 步频';

      if (!id && !daily) {
        // Plain EN homepage (?lang=en, no permalink): the only zh leak in its
        // share card is the image alt — fix just that, touch nothing else.
        if (lang !== 'en') return assetResp;
        return new HTMLRewriter()
          .on('meta[property="og:image:alt"]', { element(el) { el.setAttribute('content', 'Cadence Evidence — keeping pace with the evidence'); } })
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

      const meta = await findStoryMeta(id, url, env, lang);
      if (!meta || !meta.title) return assetResp;
      const { title, desc } = meta;
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
