#!/usr/bin/env node
/**
 * 步频周报 · 策略复盘 (weekly strategic brief)
 * ------------------------------------------------------------------
 * Inspired by Peter Yang's weekly brief: every Monday morning, recap the
 * week just shipped and set up the next one. This is the CURATION/CONTENT
 * side of that idea — built entirely from repo data (news.json + archive/),
 * so it needs no external credentials to run.
 *
 * Optional GSC section: with a `GSC_OAUTH_JSON` secret (OAuth refresh token —
 * make one with `node scripts/gsc-oauth-setup.js`) or the legacy `GSC_SA_KEY`
 * (service-account JSON), the brief also pulls Search Console clicks/
 * impressions/queries/pages for incadencept.com. Without either, that section
 * prints a "未配置" note and the rest of the brief still ships.
 *
 * Output: briefs/weekly/YYYY-Www.md  (+ briefs/weekly/index.json manifest)
 *
 * Runs on Node 22 (global fetch + crypto). No new npm dependencies.
 *
 * ── Comparison axis (important) ────────────────────────────────────
 * `firstSeen` (when WE caught a paper) is the semantically-right axis for a
 * throughput brief, but archive/ history is sparse on it (legacy items were
 * archived before firstSeen existed; news-refresh.js even backfills carried
 * items' firstSeen FROM publishedAt, so an "all-firstSeen" old week would mix
 * real and manufactured values). `publishedAt` is the only field present and
 * real on 100% of items. So the week-over-week table uses ONE axis for BOTH
 * weeks, chosen by data: firstSeen only when both weeks clear a coverage bar,
 * else publishedAt. Never mix axes across the two weeks — that produced the
 * old apples-vs-oranges "环比 -54" false alarm.
 *
 * Usage:
 *   node scripts/weekly-brief.js            # cover the just-completed Beijing week
 *   node scripts/weekly-brief.js 2026-06-15 # cover the Beijing week containing that date
 *   DRY_RUN=true node scripts/weekly-brief.js   # print to stdout, do not write files
 */

'use strict';

const fs = require('fs');
const { isEvidence } = require('./lane');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'briefs', 'weekly');
const DRY = String(process.env.DRY_RUN || '').toLowerCase() === 'true';

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const BJ_OFFSET = 8 * HOUR; // Beijing = UTC+8, no DST

// Use firstSeen for the WoW comparison only when BOTH weeks have at least this
// share of items carrying a real firstSeen; otherwise fall back to publishedAt.
const FS_COVERAGE_MIN = 0.9;

// GSC finalization lag: Search Console data isn't final for ~2–3 days, so both
// GSC windows are shifted back this many days to compare two finalized weeks.
const GSC_LAG_DAYS = Number(process.env.GSC_LAG_DAYS || 3);

// Optional email delivery (Resend). When RESEND_API_KEY is set, a finished brief
// is emailed to MAIL_TO. MAIL_FROM defaults to Resend's shared onboarding sender,
// which can ONLY reach the Resend account owner's own address without domain
// verification; set MAIL_FROM to a verified address (e.g. brief@incadencept.com)
// after verifying the domain in Resend. Incomplete/DRY runs never email.
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const MAIL_TO = process.env.MAIL_TO || 'cindylips2001@gmail.com';
const MAIL_FROM = process.env.MAIL_FROM || 'Cadence 步频 <onboarding@resend.dev>';

// Signal tiers (curatedScore, presentation bands): ≥85 强信号 · 75–84 值得读 · 65–74 参考
const TIER = { strong: 85, worth: 75, ref: 65 };

const CATEGORY_LABELS = {
  orthopedic: '骨科',
  neurological: '神经',
  sports: '运动',
  pediatric: '儿科',
  geriatric: '老年',
  cardiopulmonary: '心肺',
  'manual-modality': '手法/理疗',
  practice: '行业/实践',
};

// ----------------------------------------------------------------------------
// Date helpers — everything bucketed by Beijing wall-clock weeks (Mon–Sun)
// ----------------------------------------------------------------------------

function bjParts(ms) {
  const d = new Date(ms + BJ_OFFSET);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay() };
}
function bjMidnight(ms) {
  const p = bjParts(ms);
  return Date.UTC(p.y, p.m, p.d) - BJ_OFFSET;
}
function weekWindows(anchorMs, explicit) {
  const midnight = bjMidnight(anchorMs);
  const dow = bjParts(anchorMs).dow;
  const sinceMonday = (dow + 6) % 7;
  const thisMonday = midnight - sinceMonday * DAY;
  const coveredStart = explicit ? thisMonday : thisMonday - 7 * DAY;
  const coveredEnd = coveredStart + 7 * DAY;
  const prevStart = coveredStart - 7 * DAY;
  const prevEnd = coveredStart;
  return { coveredStart, coveredEnd, prevStart, prevEnd };
}
function isoWeek(ms) {
  const p = bjParts(ms);
  const d = new Date(Date.UTC(p.y, p.m, p.d));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThu) / DAY - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return { year: d.getUTCFullYear(), week };
}
function fmtMD(ms) {
  const p = bjParts(ms);
  return `${p.m + 1}.${p.d}`;
}
function fmtYMD(ms) {
  const p = bjParts(ms);
  return `${p.y}-${String(p.m + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

// ----------------------------------------------------------------------------
// Text helpers
// ----------------------------------------------------------------------------

/** Decode HTML entities: hex (&#xa0;), decimal (&#39;), and common named ones. */
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCp(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCp(parseInt(d, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&(?:apos|#39);/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function safeCp(n) {
  try {
    return String.fromCodePoint(n);
  } catch {
    return ' ';
  }
}
const pctOf = (x) => `${(x * 100).toFixed(1)}%`;

/** Signed delta, optionally with a percentage of the previous value. */
function delta(now, prev, withPct) {
  const d = now - prev;
  const core = d === 0 ? '±0' : d > 0 ? `+${d}` : `${d}`;
  if (!withPct || prev === 0) return core;
  const p = Math.round((d / prev) * 100);
  return `${core} (${p > 0 ? '+' : ''}${p}%)`;
}

// ----------------------------------------------------------------------------
// Corpus loading — merge news.json (current) with archive/ months, dedupe by id
// ----------------------------------------------------------------------------

function readJSON(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}
function loadCorpus() {
  const news = readJSON(path.join(ROOT, 'news.json')) || { items: [], hotTopics: [], meta: {} };
  const newsItems = news.items || [];
  const journalById = new Map();
  for (const it of newsItems) if (it.journal) journalById.set(it.id, it.journal);

  const byId = new Map();
  const add = (it) => {
    if (!it || !it.id) return;
    const prev = byId.get(it.id);
    if (!prev || (!prev.firstSeen && it.firstSeen)) byId.set(it.id, { ...prev, ...it });
  };
  newsItems.forEach(add);

  const idx = readJSON(path.join(ROOT, 'archive', 'index.json'));
  if (idx && Array.isArray(idx.months)) {
    for (const m of idx.months) {
      const data = readJSON(path.join(ROOT, 'archive', m.file));
      const arr = Array.isArray(data) ? data : data && data.items ? data.items : [];
      arr.forEach(add);
    }
  }
  // Enabled-source roster: a source missing here was retired on purpose, so its
  // silence is a decision, not a breakage (see silentSources).
  const srcCfg = readJSON(path.join(ROOT, 'sources.json'));
  const srcArr = Array.isArray(srcCfg) ? srcCfg : (srcCfg && (srcCfg.sources || Object.values(srcCfg).find(Array.isArray))) || [];
  const enabledSources = new Set(srcArr.map((s) => s && s.name).filter(Boolean));

  return {
    items: [...byId.values()],
    enabledSources,
    meta: news.meta || {},
    categories: (news.meta && news.meta.categories) || Object.keys(CATEGORY_LABELS),
    journalById,
  };
}

/** Timestamp on a chosen axis ('firstSeen' | 'publishedAt'); null if absent. */
function axisMs(it, axis) {
  const v = axis === 'firstSeen' ? it.firstSeen : it.publishedAt;
  const t = Date.parse(v || '');
  return Number.isFinite(t) ? t : null;
}
function bucket(items, a, b, axis) {
  return items.filter((it) => {
    const t = axisMs(it, axis);
    return t !== null && t >= a && t < b;
  });
}
function firstSeenCoverage(items) {
  if (!items.length) return 1;
  return items.filter((i) => i.firstSeen).length / items.length;
}

// ----------------------------------------------------------------------------
// Stats
// ----------------------------------------------------------------------------

function tierOf(score) {
  const s = Number(score) || 0;
  if (s >= TIER.strong) return 'strong';
  if (s >= TIER.worth) return 'worth';
  if (s >= TIER.ref) return 'ref';
  return 'low';
}
function statsFor(items) {
  const s = { total: items.length, tier: { strong: 0, worth: 0, ref: 0, low: 0 }, category: {}, source: {} };
  for (const it of items) {
    s.tier[tierOf(it.curatedScore)]++;
    if (it.category) s.category[it.category] = (s.category[it.category] || 0) + 1;
    if (it.source) s.source[it.source] = (s.source[it.source] || 0) + 1;
  }
  return s;
}
function topN(obj, n) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

// ----------------------------------------------------------------------------
// Pipeline-health probes (2026-08-10 audit)
// ----------------------------------------------------------------------------
// These replaced the old `总量环比下降 → 核对抓取链路` tip, which fired in 4 of
// the first 8 issues (W26 65→47, W28 147→143, W29 143→101, W32 112→58) and was
// wrong all 4 times. W28 fired on -2.7% — the rule had NO threshold. W32 fired
// on -48% while every single day of W32 ingested 5–13 items from 4–7 distinct
// sources; the drop was an artifact of W31's three burst days (27/21/27).
//
// The lesson generalises: a weekly TOTAL is a spiky series, so inferring
// breakage from it is guaranteed to cry wolf, and a tip that cries wolf trains
// you to skip the whole 提示 section. A broken crawler, by contrast, leaves a
// direct fingerprint — a day with zero ingestion, or a source that was
// reliably producing and then went silent. Alarm on the fingerprint, never on
// the aggregate. Both probes below are false-positive-free by construction:
// they describe the failure rather than infer it.

/** Per-day ingest counts across [start,end) on the given axis (Beijing days). */
function dailyCounts(items, start, end, axis) {
  const out = [];
  for (let d = start; d < end; d += DAY) out.push({ day: d, n: bucket(items, d, d + DAY, axis).length });
  return out;
}
function median(ns) {
  if (!ns.length) return 0;
  const s = [...ns].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Sources that were producing on a regular rhythm and then went quiet — the
 *  fingerprint of a crawler that broke silently.
 *
 *  Calibrated against each source's OWN cadence, because a fixed "N days quiet"
 *  threshold cannot work here: over the trailing 90 days the real sources range
 *  from PubMed (54 producing days, max gap 2) to AHPRA (4 days, max gap 35).
 *  A rule strict enough to stay quiet for AHPRA would never notice PubMed dying,
 *  and a rule loose enough to catch PubMed would flag every low-cadence journal
 *  every single week — which is what the first cut of this function did (it
 *  fired 2–3 times per week on AHPRA / JOSPT / Gait & Posture, i.e. exactly the
 *  alarm fatigue it was written to remove).
 *
 *  Three gates, each killing one false-positive class:
 *   - `enabled`: the source is still in sources.json. Modern Healthcare had 23
 *     items then went silent for 39 days — because it was deliberately dropped
 *     (STRATEGY-US §7 keeps it for a future intel lane only). A removal is not
 *     a breakage.
 *   - `minDays`: enough distinct producing days for "its max gap" to mean
 *     anything. JOSPT's 13 items arrived on 3 days — batchy by nature, nothing
 *     to calibrate against.
 *   - `gapFactor`: current silence must exceed twice the source's own worst
 *     historical gap. Archives of PM&R (33 items / 21 days / max gap 6) going
 *     17 days quiet clears this; BJSM at 11 days against a 6-day max does not.
 */
function silentSources(items, end, axis, enabled, { lookbackDays = 90, minDays = 8, gapFactor = 2, minQuiet = 10 } = {}) {
  const byS = new Map();
  for (const it of bucket(items, end - lookbackDays * DAY, end, axis)) {
    const t = axisMs(it, axis);
    if (!it.source || t === null) continue;
    if (!byS.has(it.source)) byS.set(it.source, new Set());
    byS.get(it.source).add(bjMidnight(t));
  }
  const out = [];
  for (const [source, daySet] of byS) {
    if (enabled && enabled.size && !enabled.has(source)) continue;
    const days = [...daySet].sort((a, b) => a - b);
    if (days.length < minDays) continue;
    let maxGap = 0;
    for (let i = 1; i < days.length; i++) maxGap = Math.max(maxGap, Math.round((days[i] - days[i - 1]) / DAY));
    const quiet = Math.round((end - days[days.length - 1]) / DAY);
    if (quiet >= minQuiet && quiet > maxGap * gapFactor) out.push({ source, quiet, maxGap, days: days.length, lookbackDays });
  }
  return out.sort((a, b) => b.quiet - a.quiet);
}

// PubMed is a pipeline, not a journal (the same reason DECISIONS-pending exempts
// it from the per-journal cap). Its share swings mechanically whenever other
// sources come or go — W25 saw 40%→62% purely because the rest thinned out —
// and "check whether PubMed's journal attribution is mislabelled" is nonsense
// advice, since attribution there is per-article.
const SHIFT_EXEMPT = new Set(['PubMed']);

/** Structural changes in the source mix. This is what would have NAMED the
 *  2026-07-26 Springer mislabel (W30: "Sports Medicine" 66 items / 52% of the
 *  week, up from 23% — every Springer item wrongly attributed to one journal).
 *  The old rule saw the same number and prescribed "来源集中，可补充其他来源平衡"
 *  — right signal, wrong diagnosis, because a share ranking cannot tell
 *  "we over-collected from X" apart from "X's name is now on everything". A
 *  step change in share can, and it also catches the repair (W31: the label
 *  vanishes, BMC* appear) instead of silently returning to normal. */
function sourceShifts(curSrc, prevSrc, curTotal, prevTotal, { minN = 5, goneN = 8, jump = 0.15, exclude = SHIFT_EXEMPT } = {}) {
  const out = [];
  for (const s of new Set([...Object.keys(curSrc), ...Object.keys(prevSrc)])) {
    if (exclude.has(s)) continue;
    const c = curSrc[s] || 0;
    const p = prevSrc[s] || 0;
    const cShare = curTotal ? c / curTotal : 0;
    const pShare = prevTotal ? p / prevTotal : 0;
    if (c >= minN && p === 0) out.push({ source: s, kind: 'new', c, p, cShare, pShare });
    else if (p >= goneN && c === 0) out.push({ source: s, kind: 'gone', c, p, cShare, pShare });
    else if (c >= minN && cShare - pShare >= jump) out.push({ source: s, kind: 'surge', c, p, cShare, pShare });
  }
  return out.sort((a, b) => b.c - a.c || b.p - a.p);
}

/** Each category's own trailing weekly median, ending at `end` (exclusive) so a
 *  week is never part of its own baseline.
 *
 *  This replaced the old 薄弱 rule, which compared each category against the
 *  MEAN ACROSS CATEGORIES that week. That rule fired in 6 of the first 8 issues
 *  and named 心肺 5 times, 儿科/老年/手法 4 times each — because it was not
 *  measuring news at all, it was measuring specialty size. Over W25–W32 the
 *  per-week medians are 神经 23 and 骨科 15.5 against 儿科 3 and 心肺 3.5, so the
 *  small specialties sit under any cross-category mean permanently, and a
 *  permanently-lit warning carries no information.
 *
 *  Against its own median, W32's 儿科 2 (median 3) is an ordinary week and stays
 *  silent, while W28's 行业/实践 1 (median 13) stands out — which is the only
 *  kind of thinness anyone can act on. `minMedian` keeps categories whose normal
 *  week is 2–3 items from tripping on ±1 noise, and `minWeeks` refuses to judge
 *  before there is enough history. */
function categoryBaseline(items, end, axis, cats, { weeks = 8, minWeeks = 4 } = {}) {
  // Only weeks in which the pipeline actually produced something count. Before
  // ~2026-06-11 the corpus is simply empty, and letting those weeks in as zeros
  // drags every median toward 0, which silently disables the rule: a first cut
  // of this function padded with zeros and never flagged anything. With the
  // padding removed, W29's 行业/实践 (7 vs a median of 16) trips correctly.
  // Weeks that still lack `minWeeks` of real history get NO baseline and are
  // reported as `—` rather than judged — W28, four weeks after launch, is one.
  const live = [];
  for (let i = 1; i <= weeks; i++) {
    const a = end - i * 7 * DAY;
    const wk = bucket(items, a, a + 7 * DAY, axis);
    if (wk.length) live.push(wk);
  }
  const out = {};
  if (live.length < minWeeks) return out;
  for (const c of cats) out[c] = median(live.map((wk) => wk.filter((it) => it.category === c).length));
  return out;
}

// ----------------------------------------------------------------------------
// Optional: Google Search Console (zero-dependency, two auth paths)
//
// Preferred: OAuth refresh token (GSC_OAUTH_JSON) — 2026-08-31. The original
// service-account path is blocked for this account: Google's "Secure by
// default" org policy (iam.disableServiceAccountKeyCreation) refuses to mint
// SA keys, on the CMU account AND the personal Gmail. A refresh token needs no
// SA key, so it sidesteps the policy entirely.
// Legacy: GSC_SA_KEY (service-account JSON) still works where key creation is
// allowed — kept so this doesn't become a one-way door.
// Both are read-only (webmasters.readonly) and expire into a 401, never a
// silent empty result — a broken credential shows up as `_GSC 查询失败_` in
// the brief, not as a zero week that reads like a traffic collapse.
// ----------------------------------------------------------------------------

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// OAuth installed-app flow: exchange a long-lived refresh token for a 1h access
// token. Refresh tokens for apps in "Testing" publish status expire after 7
// days — scripts/gsc-oauth-setup.js tells Cindy to publish the app first.
async function gscTokenOAuth(o) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: o.client_id,
      client_secret: o.client_secret,
      refresh_token: o.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`oauth token ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}
async function gscToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/webmasters.readonly',
      aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const sig = b64url(signer.sign(sa.private_key));
  const res = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claim}.${sig}` }),
  });
  if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}
async function gscQuery(token, site, body) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`query ${res.status}: ${await res.text()}`);
  return res.json();
}
async function getGSC(win) {
  // OAuth first (the path that works under the SA-key org policy), SA as legacy.
  const oauthRaw = process.env.GSC_OAUTH_JSON;
  const saRaw = process.env.GSC_SA_KEY;
  if (!oauthRaw && !saRaw) return { skipped: true };
  const site = process.env.GSC_SITE_URL || 'sc-domain:incadencept.com';
  try {
    const token = oauthRaw
      ? await gscTokenOAuth(JSON.parse(oauthRaw))
      : await gscToken(JSON.parse(saRaw));
    // Anchor to the REVIEWED week (win.coveredEnd), not generation time, so a
    // back-filled run (`weekly-brief.js 2026-06-15`) reports that week's search
    // data — not the week around the run date. Shift back GSC_LAG_DAYS so both
    // 7-day windows are finalized (the partial-data → false-negative trap).
    const end = win.coveredEnd - GSC_LAG_DAYS * DAY; // exclusive
    const cur = { startDate: fmtYMD(end - 7 * DAY), endDate: fmtYMD(end - DAY) };
    const prv = { startDate: fmtYMD(end - 14 * DAY), endDate: fmtYMD(end - 8 * DAY) };

    const totals = async (range) => {
      const r = await gscQuery(token, site, { ...range, dimensions: [] });
      const row = (r.rows && r.rows[0]) || {};
      return { clicks: row.clicks || 0, impressions: row.impressions || 0, ctr: row.ctr || 0, position: row.position || 0 };
    };
    const [curT, prvT] = [await totals(cur), await totals(prv)];
    const q = await gscQuery(token, site, { ...cur, dimensions: ['query'], rowLimit: 10 });
    const p = await gscQuery(token, site, { ...cur, dimensions: ['page'], rowLimit: 10 });
    return {
      site,
      lag: GSC_LAG_DAYS,
      cur,
      prv,
      curT,
      prvT,
      queries: (q.rows || []).map((r) => ({ key: r.keys[0], clicks: r.clicks, impressions: r.impressions })),
      pages: (p.rows || []).map((r) => ({ key: r.keys[0], clicks: r.clicks, impressions: r.impressions })),
    };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

// ----------------------------------------------------------------------------
// Optional email delivery (Resend HTTP API; zero dependency)
// ----------------------------------------------------------------------------

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/** Inline markdown → HTML on already-escaped text (markup chars are ASCII-safe). */
function inlineMd(s) {
  return escHtml(s)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
/** Minimal markdown → HTML covering exactly what this brief emits: h1/h2,
 *  pipe tables, blockquotes, bullet lists, paragraphs, links, bold. */
function mdToHtml(md) {
  const lines = String(md).split('\n');
  const out = [];
  const isRow = (s) => /^\|.*\|\s*$/.test(s);
  const isSep = (s) => /^\|[\s:|-]+\|\s*$/.test(s);
  const cells = (s) => s.slice(1, s.lastIndexOf('|')).split('|').map((c) => c.trim());
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }
    if (/^#\s+/.test(line)) { out.push(`<h1 style="font-size:20px;margin:16px 0 4px">${inlineMd(line.replace(/^#\s+/, ''))}</h1>`); i++; continue; }
    if (/^##\s+/.test(line)) { out.push(`<h2 style="font-size:16px;margin:18px 0 4px">${inlineMd(line.replace(/^##\s+/, ''))}</h2>`); i++; continue; }
    if (isRow(line) && i + 1 < lines.length && isSep(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && isRow(lines[i])) { body.push(cells(lines[i])); i++; }
      const th = head.map((h) => `<th style="border:1px solid #ddd;padding:5px 9px;text-align:left;background:#f6f6f6">${inlineMd(h)}</th>`).join('');
      const rows = body.map((r) => '<tr>' + r.map((c) => `<td style="border:1px solid #ddd;padding:5px 9px">${inlineMd(c)}</td>`).join('') + '</tr>').join('');
      out.push(`<table style="border-collapse:collapse;margin:6px 0;font-size:13px"><tr>${th}</tr>${rows}</table>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(inlineMd(lines[i].replace(/^>\s?/, ''))); i++; }
      out.push(`<blockquote style="margin:8px 0;padding:6px 12px;border-left:3px solid #ccc;color:#555;font-size:13px">${q.join('<br>')}</blockquote>`);
      continue;
    }
    if (/^-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^-\s+/.test(lines[i])) { items.push(`<li>${inlineMd(lines[i].replace(/^-\s+/, ''))}</li>`); i++; }
      out.push(`<ul style="margin:6px 0;padding-left:20px">${items.join('')}</ul>`);
      continue;
    }
    out.push(`<p style="margin:6px 0">${inlineMd(line)}</p>`);
    i++;
  }
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#222;max-width:700px">${out.join('\n')}</div>`;
}
async function sendEmail({ subject, md }) {
  if (!RESEND_API_KEY) return { skipped: true };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to: [MAIL_TO], subject, text: md, html: mdToHtml(md) }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
  return { id: (await res.json()).id };
}

// ----------------------------------------------------------------------------
// Render markdown
// ----------------------------------------------------------------------------

function catLabel(c) {
  return CATEGORY_LABELS[c] || c;
}

function render(ctx) {
  const { win, iso, cur, prev, curItems, allItems, enabledSources, categories, journalById, gsc, axis, curCov, prevCov, incomplete } = ctx;
  const L = [];
  const range = `${fmtMD(win.coveredStart)}–${fmtMD(win.coveredEnd - DAY)}`;
  const tag = `${iso.year}-W${String(iso.week).padStart(2, '0')}`;
  const axisLabel = axis === 'firstSeen' ? 'firstSeen 入库日' : 'publishedAt 发表日';
  const verb = axis === 'firstSeen' ? '入库' : '收录(按发表日)';
  const elapsedDays = Math.min(7, Math.max(0, Math.ceil((Date.now() - win.coveredStart) / DAY)));
  // Trust WoW (show %, allow decline alarms) ONLY on the firstSeen axis AND when
  // the reviewed week has actually finished. publishedAt baseline is contaminated
  // (curation-lag / launch backfill); an unfinished week is just partial data —
  // both produce the same spurious "下降→查链路" alarms we keep killing.
  const showPct = axis === 'firstSeen' && !incomplete;
  const wowHdr = showPct ? '环比' : '环比(仅参考)';

  // Relative balance: weak = below half the per-direction mean; balanced needs
  // a tight min/max spread AND no weak direction. (Absolute "≤1" was too low.)
  // 薄弱 = below HALF THIS CATEGORY'S OWN trailing median (see categoryBaseline
  // for why the old cross-category mean was measuring specialty size instead).
  const baseline = categoryBaseline(allItems, win.coveredStart, axis, categories);
  const MIN_MEDIAN = 4;
  const weak = categories.filter((c) => {
    const med = baseline[c];
    return med != null && med >= MIN_MEDIAN && (cur.category[c] || 0) < med * 0.5;
  });
  const present = categories.map((c) => cur.category[c] || 0);
  const maxC = Math.max(1, ...present);
  const minC = Math.min(...present);
  const balanced = weak.length === 0 && minC / maxC >= 0.5;
  const concentrated = topN(cur.category, 2).filter(([, n]) => n > 0).map(([c]) => catLabel(c));

  // Pipeline-health probes. Daily/silence detection is only meaningful on the
  // firstSeen axis (publishedAt days are the world's publishing calendar, not
  // ours) and on a finished week (a partial week trivially has "zero days").
  const probeOk = axis === 'firstSeen' && !incomplete;
  const daily = probeOk ? dailyCounts(curItems, win.coveredStart, win.coveredEnd, axis) : [];
  const prevDaily = probeOk ? dailyCounts(allItems, win.prevStart, win.prevEnd, axis) : [];
  const zeroDays = daily.filter((d) => d.n === 0);
  const silent = probeOk ? silentSources(allItems, win.coveredEnd, axis, enabledSources) : [];
  const shifts = sourceShifts(cur.source, prev.source, cur.total, prev.total);
  // Rate, not count: the strong-signal COUNT rides on weekly volume, which is
  // spiky (W31 112 → W32 58 on three burst days). The share is what actually
  // says whether curation quality moved — W32's 15/58 = 25.9% vs W31's
  // 14/112 = 12.5% is a doubling that the count row alone reads as "+1".
  const strongPct = (s) => (s.total ? s.tier.strong / s.total : 0);

  L.push(`# 步频周报 · 策略复盘`);
  L.push(``);
  L.push(`**${range}（${tag}）** · 生成于 ${fmtYMD(Date.now())}`);
  L.push(``);
  if (incomplete) {
    L.push(`> 🚧 **本周尚未结束（已过 ${elapsedDays}/7 天）** —— 数据不完整，本期已抑制百分比与所有「下降」告警，环比仅供参考。`);
    L.push(``);
  }
  L.push(`> 周环比按「${axisLabel}」单一口径统计，两周一致。信号分档：≥85 强信号 · 75–84 值得读 · 65–74 参考。`);
  if (axis === 'publishedAt') {
    L.push(`>`);
    L.push(
      `> ⚠️ 本周 firstSeen 覆盖 ${pctOf(curCov)}、上周 ${pctOf(prevCov)}（archive 历史条目普遍缺 firstSeen），故两周统一用 publishedAt，待两周均 ≥${pctOf(
        FS_COVERAGE_MIN
      )} 自动切回入库日口径。`
    );
    L.push(`>`);
    L.push(
      `> publishedAt 口径下**环比仅供参考**，勿据此判断真实增减：① 入库滞后——部分文献发表数天后才入库，使最近结算的本周被系统性低估；② 历史回填——早期批量回填会把所覆盖的发表周计数撑高，形成离群峰。`
    );
  }
  L.push(``);

  // 1) 一句话概览
  L.push(`## 一句话概览`);
  L.push(``);
  const wowClause = showPct ? `（环比 ${delta(cur.total, prev.total, true)}）` : `（上周 ${prev.total}，仅作参考）`;
  L.push(
    `本周${verb} **${cur.total}** 篇${wowClause}，其中强信号 **${cur.tier.strong}** 篇、值得读 ${
      cur.tier.worth
    } 篇；覆盖 ${Object.keys(cur.category).length} 个方向，${
      weak.length ? `集中在 ${concentrated.join('、') || '—'}，${weak.map(catLabel).join('、')} 低于自身常态` : balanced ? '分布较均衡' : `集中在 ${concentrated.join('、') || '—'}`
    }。`
  );
  L.push(``);

  // 2) 产出与质量
  L.push(`## 产出与质量（本周 vs 上周）`);
  L.push(``);
  L.push(`| 指标 | 本周 | 上周 | ${wowHdr} |`);
  L.push(`| --- | ---: | ---: | ---: |`);
  L.push(`| ${verb}总量 | ${cur.total} | ${prev.total} | ${delta(cur.total, prev.total, showPct)} |`);
  L.push(`| 强信号 ≥85 | ${cur.tier.strong} | ${prev.tier.strong} | ${delta(cur.tier.strong, prev.tier.strong, showPct)} |`);
  const sp = strongPct(cur);
  const spPrev = strongPct(prev);
  L.push(
    `| 强信号占比 | ${pctOf(sp)} | ${pctOf(spPrev)} | ${(sp - spPrev >= 0 ? '+' : '') + ((sp - spPrev) * 100).toFixed(1)}pp |`
  );
  L.push(`| 值得读 75–84 | ${cur.tier.worth} | ${prev.tier.worth} | ${delta(cur.tier.worth, prev.tier.worth, showPct)} |`);
  L.push(`| 参考 65–74 | ${cur.tier.ref} | ${prev.tier.ref} | ${delta(cur.tier.ref, prev.tier.ref, showPct)} |`);
  L.push(``);
  // Show the daily series, not just the total. A week's total hides whether a
  // decline is "every day a bit thinner" (worth a look) or "three burst days
  // last week" (nothing happened) — the exact confusion that made the old
  // 总量 alarm useless. With the series printed, the reader can see it.
  if (probeOk && daily.length) {
    const med = median(daily.map((d) => d.n));
    const medPrev = median(prevDaily.map((d) => d.n));
    L.push(`逐日入库：${daily.map((d) => d.n).join(' · ')} —— 中位 ${med}／天（上周 ${medPrev}）`);
  }
  // Note precedence: an unfinished week is partial data (worst case); else the
  // publishedAt baseline is contaminated by curation-lag / launch backfill; a
  // finished firstSeen week is the only clean case (no note — see comment above:
  // a closed firstSeen week is immutable, so its decline alarms are legitimate).
  if (incomplete) L.push(`> 注：本周尚未结束（已过 ${elapsedDays}/7 天），各行计数随天数累积，环比与告警本期不可信，仅供参考。`);
  else if (!showPct) L.push(`> 注：${wowHdr} 在 publishedAt 口径下基线含入库滞后与上线回填，仅供参考（见上）。`);
  L.push(``);

  // 3) 方向覆盖
  L.push(`## 方向覆盖`);
  L.push(``);
  L.push(`| 方向 | 本周 | 上周 | 自身中位 | 环比 |`);
  L.push(`| --- | ---: | ---: | ---: | ---: |`);
  for (const c of categories) {
    const n = cur.category[c] || 0;
    const pn = prev.category[c] || 0;
    const med = baseline[c];
    const flag = weak.includes(c) ? ' ⚠️' : '';
    L.push(`| ${catLabel(c)}${flag} | ${n} | ${pn} | ${med == null ? '—' : med} | ${delta(n, pn)} |`);
  }
  L.push(``);
  L.push(`「自身中位」= 该方向前 8 周的每周中位数。**各方向只跟自己比** —— 儿科的常态是每周 2–3 篇、神经是 20+，拿它们互比只会得出「儿科永远薄弱」这种改不动的结论。`);
  if (weak.length) L.push(`⚠️ = 低于自身中位的一半，即这个方向本周确实反常（而非它本来就小）。`);
  L.push(``);

  // 4) 来源构成
  L.push(`## 来源构成（本周 Top）`);
  L.push(``);
  const srcs = topN(cur.source, 8);
  if (srcs.length) {
    L.push(`| 来源 | 本周 | 占比 | 上周 | 环比 |`);
    L.push(`| --- | ---: | ---: | ---: | ---: |`);
    for (const [s, n] of srcs) {
      const p = prev.source[s] || 0;
      L.push(`| ${s} | ${n} | ${pctOf(cur.total ? n / cur.total : 0)} | ${p} | ${delta(n, p)} |`);
    }
    L.push(``);
    // Structure > ranking. See sourceShifts() for why (the W30 Springer mislabel).
    if (shifts.length) {
      const KIND = { new: '新出现', gone: '消失', surge: '占比跳升' };
      L.push(`**结构变化**`);
      L.push(``);
      for (const sh of shifts.slice(0, 5)) {
        const detail =
          sh.kind === 'surge'
            ? `${pctOf(sh.pShare)} → ${pctOf(sh.cShare)}（${sh.p} → ${sh.c} 篇）`
            : `${sh.p} → ${sh.c} 篇`;
        L.push(`- ${KIND[sh.kind]}：**${sh.source}** ${detail}`);
      }
      L.push(``);
      L.push(`> 单源占比跳升 / 突然消失，先怀疑**归属标注**（同一出版商被错标成同一刊名），再怀疑抓取量 —— 2026-07-26 的 Springer 错标就是前者。`);
      L.push(``);
    }
  } else {
    L.push(`- 本周无产出`);
    L.push(``);
  }

  // 5) 本周最高信号
  L.push(`## 本周最高信号 Top 5`);
  L.push(``);
  // 最高信号只从 evidence lane 取——intel(news/policy)分数是内部取舍用,
  // 不是 SIGNAL(lane split 2026-08-29, scripts/lane.js)。
  const top = [...curItems].filter(isEvidence).sort((a, b) => (b.curatedScore || 0) - (a.curatedScore || 0)).slice(0, 5);
  if (top.length) {
    for (const it of top) {
      const j = journalById.get(it.id);
      const title = decodeEntities(it.titleZh || it.title || '(无标题)');
      const meta = [catLabel(it.category), it.source, j].filter(Boolean).join(' · ');
      L.push(`- **${it.curatedScore}** · ${title}`);
      L.push(`  ${meta}${it.sourceUrl ? ` — [原文](${it.sourceUrl})` : ''}`);
    }
  } else {
    L.push(`- 本周无产出`);
  }
  L.push(``);

  // 「当前热点」板块删于 2026-08-10 审计：它的标题自己就承认是「生成时快照，非本周
  // 筛选」—— 一份周报里放一段与本周正交的数据，读者无法用它做任何时间相关的判断。
  // 8 期里跨周重复可见（Decision support 在 W25+W26、Patient Engagement 在
  // W28+W29、Cost-effectiveness 在 W30+W31），而网站已有热点栏目承担这个信息。

  // 6) GSC
  L.push(`## 搜索表现（GSC · incadencept.com）`);
  L.push(``);
  if (gsc.skipped) {
    L.push(`_未配置：跑 \`node scripts/gsc-oauth-setup.js\` 拿到 JSON，存为仓库 secret \`GSC_OAUTH_JSON\` 后自动填充本节。_`);
  } else if (gsc.error) {
    L.push(`_GSC 查询失败：${gsc.error}_`);
  } else {
    L.push(`窗口：${gsc.cur.startDate} – ${gsc.cur.endDate}（上周对照 ${gsc.prv.startDate} – ${gsc.prv.endDate}）`);
    L.push(`_窗口贴合复盘周并整体回移 ${gsc.lag} 天以规避 GSC ~2–3 天定版延迟（故日期较内容周早约 ${gsc.lag} 天），两周等长且均已定版、可比。_`);
    L.push(``);
    L.push(`| 指标 | 本周 | 上周 | 环比 |`);
    L.push(`| --- | ---: | ---: | ---: |`);
    L.push(`| 点击 | ${gsc.curT.clicks} | ${gsc.prvT.clicks} | ${delta(gsc.curT.clicks, gsc.prvT.clicks, true)} |`);
    L.push(`| 曝光 | ${gsc.curT.impressions} | ${gsc.prvT.impressions} | ${delta(gsc.curT.impressions, gsc.prvT.impressions, true)} |`);
    L.push(`| CTR | ${pctOf(gsc.curT.ctr)} | ${pctOf(gsc.prvT.ctr)} | — |`);
    L.push(`| 平均排名 | ${gsc.curT.position.toFixed(1)} | ${gsc.prvT.position.toFixed(1)} | — |`);
    L.push(``);
    if (gsc.queries.length) {
      L.push(`**热门 query**`);
      L.push(``);
      for (const q of gsc.queries) L.push(`- ${decodeEntities(q.key)} · ${q.clicks} 点击 / ${q.impressions} 曝光`);
      L.push(``);
    }
    if (gsc.pages.length) {
      L.push(`**热门落地页**`);
      L.push(``);
      for (const p of gsc.pages) L.push(`- ${p.key} · ${p.clicks} 点击`);
      L.push(``);
    }
  }
  L.push(``);

  // 9) 给本周的提示（规则生成）— same axis caveat applies, so phrase carefully
  L.push(`## 给本周的提示`);
  L.push(``);
  const tips = [];

  // — 管线：只报直接证据，绝不从总量推断（见 statsFor 上方那段注释）。
  if (zeroDays.length)
    tips.push(
      `**管线**：本周有 ${zeroDays.length} 天零入库（${zeroDays.map((d) => fmtMD(d.day)).join('、')}）—— 查这几天 news-refresh 的 Actions run 是否失败。`
    );
  for (const s of silent.slice(0, 3))
    tips.push(
      `**管线**：来源 **${s.source}** 已静默 ${s.quiet} 天，而它近 ${s.lookbackDays} 天在 ${s.days} 个日子有产出、最长间隔仅 ${s.maxGap} 天 —— 抓取可能已失效，核对该源 feed。`
    );

  // — 来源结构：跳变先怀疑标注，再怀疑抓取量。
  for (const sh of shifts.slice(0, 2)) {
    if (sh.kind === 'surge')
      tips.push(`**来源**：${sh.source} 占比 ${pctOf(sh.pShare)}→${pctOf(sh.cShare)} —— 核对该源的期刊归属是否错标（对照 2026-07-26 Springer）。`);
    else if (sh.kind === 'gone') tips.push(`**来源**：${sh.source} 本周 0 篇（上周 ${sh.p}）—— 确认是改名/归属修复，还是抓取断了。`);
  }

  // — 覆盖：处方指向白名单，不是「补稿」（那是 Cindy 拉不动的杆）。
  for (const c of weak)
    tips.push(`**覆盖**：${catLabel(c)} ${cur.category[c] || 0} 篇 vs 自身中位 ${baseline[c]} —— 这个方向本周反常，查是不是喂它的源断了。`);

  // — 质量：用占比不用计数（计数骑在周产量上，而周产量是尖峰序列）。
  if (showPct && prev.total >= 30 && spPrev - sp >= 0.05)
    tips.push(`**质量**：强信号占比 ${pctOf(spPrev)}→${pctOf(sp)}（-${((spPrev - sp) * 100).toFixed(1)}pp）—— 看是选源变差还是打分漂移。`);

  if (!tips.length) tips.push(`无异常：管线逐日有产出、来源结构稳定、无方向断供。保持节奏即可。`);
  for (const t of tips) L.push(`- ${t}`);
  L.push(``);

  return { md: L.join('\n'), tag, range, axis };
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main() {
  const argDate = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2]) ? process.argv[2] : null;
  const anchorMs = argDate ? Date.parse(`${argDate}T00:00:00+08:00`) : Date.now();
  const win = weekWindows(anchorMs, Boolean(argDate));
  const iso = isoWeek(win.coveredStart);
  const corpus = loadCorpus();

  // Pick ONE axis for BOTH weeks. Estimate firstSeen coverage on the always-
  // present publishedAt membership, then commit to firstSeen only if both weeks
  // clear the bar — otherwise publishedAt (consistent, 100% real).
  const curPub = bucket(corpus.items, win.coveredStart, win.coveredEnd, 'publishedAt');
  const prevPub = bucket(corpus.items, win.prevStart, win.prevEnd, 'publishedAt');
  const curCov = firstSeenCoverage(curPub);
  const prevCov = firstSeenCoverage(prevPub);
  const axis = curCov >= FS_COVERAGE_MIN && prevCov >= FS_COVERAGE_MIN ? 'firstSeen' : 'publishedAt';

  const curItems = bucket(corpus.items, win.coveredStart, win.coveredEnd, axis);
  const prevItems = bucket(corpus.items, win.prevStart, win.prevEnd, axis);
  const cur = statsFor(curItems);
  const prev = statsFor(prevItems);
  // Always record BOTH axis counts for the covered week, so the index.json
  // trend series stays consistent even after the headline axis auto-switches.
  const totalPub = curPub.length;
  const totalFS = bucket(corpus.items, win.coveredStart, win.coveredEnd, 'firstSeen').length;
  // The reviewed week hasn't finished yet (only reachable via an explicit/manual
  // date pointing into the current week; the scheduled no-arg run always reviews
  // the previous, completed week).
  const incomplete = win.coveredEnd > Date.now();
  const gsc = await getGSC(win);

  const { md, tag, range } = render({
    win,
    iso,
    cur,
    prev,
    curItems,
    allItems: corpus.items,
    enabledSources: corpus.enabledSources,
    categories: corpus.categories,
    journalById: corpus.journalById,
    gsc,
    axis,
    curCov,
    prevCov,
    incomplete,
  });

  if (DRY) {
    console.log(md);
    // MAIL_PREVIEW=true prints the HTML email body to stderr for eyeballing.
    if (String(process.env.MAIL_PREVIEW || '').toLowerCase() === 'true') console.error(mdToHtml(md));
    console.error(`\n[dry-run] ${tag} (${range}) · axis=${axis}${incomplete ? ' · INCOMPLETE' : ''} · ${cur.total} vs ${prev.total} · gsc=${gsc.skipped ? 'skipped' : gsc.error ? 'error' : 'ok'} · mail=${RESEND_API_KEY ? 'on' : 'off'}`);
    return;
  }

  // Never commit a partial week to history. Print the preview so a manual peek
  // still works, but skip the file/manifest write unless explicitly forced.
  if (incomplete && String(process.env.ALLOW_INCOMPLETE || '').toLowerCase() !== 'true') {
    console.log(md);
    console.error(`\n[skip-write] 复盘周 ${range}（${tag}）尚未结束 — 未写入 briefs/weekly。如需强制：ALLOW_INCOMPLETE=true。`);
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = `${tag}.md`;
  fs.writeFileSync(path.join(OUT_DIR, file), md);

  const idxPath = path.join(OUT_DIR, 'index.json');
  const idx = readJSON(idxPath) || { weeks: [] };
  idx.generatedAt = new Date().toISOString();
  idx.weeks = (idx.weeks || []).filter((w) => w.tag !== tag);
  idx.weeks.unshift({ tag, range, file, axis, total: cur.total, totalPub, totalFS, strong: cur.tier.strong });
  idx.weeks.sort((a, b) => (a.tag < b.tag ? 1 : -1));
  fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2));

  // Email the finished brief (optional; never fatal — the brief is already saved).
  let mail = RESEND_API_KEY ? 'pending' : 'off';
  if (RESEND_API_KEY) {
    try {
      const r = await sendEmail({ subject: `步频周报 · ${range}（${tag}）`, md });
      mail = r.id ? `sent ${r.id}` : 'sent';
    } catch (e) {
      mail = 'FAILED';
      console.error(`✗ 邮件发送失败（周报已写入，不影响提交）：${e.message || e}`);
    }
  }

  console.log(`✓ briefs/weekly/${file} · axis=${axis} · ${cur.total} vs ${prev.total} · gsc=${gsc.skipped ? 'skipped' : gsc.error ? 'error' : 'ok'} · mail=${mail}`);
}

// Export the probe functions so pipeline-gates.test.js can assert on them
// directly (they are pure — no fs, no network), and keep the CLI behaviour when
// run as a script. Without the require.main guard, requiring this file would
// generate a brief as a side effect of the test run.
module.exports = { dailyCounts, median, silentSources, sourceShifts, categoryBaseline, statsFor, SHIFT_EXEMPT };

if (require.main === module) {
  main().catch((e) => {
    console.error('weekly-brief failed:', e);
    process.exit(1);
  });
}
