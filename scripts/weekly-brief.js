#!/usr/bin/env node
/**
 * 步频周报 · 策略复盘 (weekly strategic brief)
 * ------------------------------------------------------------------
 * Inspired by Peter Yang's weekly brief: every Monday morning, recap the
 * week just shipped and set up the next one. This is the CURATION/CONTENT
 * side of that idea — built entirely from repo data (news.json + archive/),
 * so it needs no external credentials to run.
 *
 * Optional GSC section: if a GSC_SA_KEY secret (a Google service-account
 * JSON) is present, the brief also pulls Search Console clicks/impressions/
 * queries/pages for incadencept.com. Without it, that section prints a
 * "未配置" note and the rest of the brief still ships.
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
  return {
    items: [...byId.values()],
    hotTopics: news.hotTopics || [],
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
  const s = { total: items.length, tier: { strong: 0, worth: 0, ref: 0, low: 0 }, category: {}, source: {}, studyDesign: {} };
  for (const it of items) {
    s.tier[tierOf(it.curatedScore)]++;
    if (it.category) s.category[it.category] = (s.category[it.category] || 0) + 1;
    if (it.source) s.source[it.source] = (s.source[it.source] || 0) + 1;
    if (it.studyDesign) s.studyDesign[it.studyDesign] = (s.studyDesign[it.studyDesign] || 0) + 1;
  }
  return s;
}
function topN(obj, n) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

// ----------------------------------------------------------------------------
// Optional: Google Search Console (zero-dependency service-account JWT)
// ----------------------------------------------------------------------------

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
  if (!process.env.GSC_SA_KEY) return { skipped: true };
  const site = process.env.GSC_SITE_URL || 'sc-domain:incadencept.com';
  try {
    const sa = JSON.parse(process.env.GSC_SA_KEY);
    const token = await gscToken(sa);
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
  const { win, iso, cur, prev, curItems, hotTopics, categories, journalById, gsc, axis, curCov, prevCov, incomplete } = ctx;
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
  const meanC = categories.length ? cur.total / categories.length : 0;
  const weakThresh = Math.max(2, meanC * 0.5);
  const weak = categories.filter((c) => (cur.category[c] || 0) < weakThresh);
  const present = categories.map((c) => cur.category[c] || 0);
  const maxC = Math.max(1, ...present);
  const minC = Math.min(...present);
  const balanced = weak.length === 0 && minC / maxC >= 0.5;
  const concentrated = topN(cur.category, 2).filter(([, n]) => n > 0).map(([c]) => catLabel(c));

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
      balanced ? '分布较均衡' : `集中在 ${concentrated.join('、') || '—'}，薄弱在 ${weak.map(catLabel).join('、') || '—'}`
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
  L.push(`| 值得读 75–84 | ${cur.tier.worth} | ${prev.tier.worth} | ${delta(cur.tier.worth, prev.tier.worth, showPct)} |`);
  L.push(`| 参考 65–74 | ${cur.tier.ref} | ${prev.tier.ref} | ${delta(cur.tier.ref, prev.tier.ref, showPct)} |`);
  L.push(``);
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
  L.push(`| 方向 | 本周 | 上周 | 环比 |`);
  L.push(`| --- | ---: | ---: | ---: |`);
  for (const c of categories) {
    const n = cur.category[c] || 0;
    const pn = prev.category[c] || 0;
    const flag = weak.includes(c) ? ' ⚠️' : '';
    L.push(`| ${catLabel(c)}${flag} | ${n} | ${pn} | ${delta(n, pn)} |`);
  }
  L.push(``);
  if (weak.length) L.push(`⚠️ = 低于本周方向均量的一半（相对薄弱，阈值 ${weakThresh.toFixed(1)} 篇），可作为补稿方向。`);
  L.push(``);

  // 4) 来源构成
  L.push(`## 来源构成（本周 Top）`);
  L.push(``);
  const srcs = topN(cur.source, 8);
  if (srcs.length) for (const [s, n] of srcs) L.push(`- ${s} · ${n}`);
  else L.push(`- 本周无产出`);
  L.push(``);

  // 5) 研究设计
  const sds = topN(cur.studyDesign, 6);
  if (sds.length) {
    L.push(`## 研究设计分布`);
    L.push(``);
    for (const [s, n] of sds) L.push(`- ${s} · ${n}`);
    L.push(``);
  }

  // 6) 本周最高信号
  L.push(`## 本周最高信号 Top 5`);
  L.push(``);
  const top = [...curItems].sort((a, b) => (b.curatedScore || 0) - (a.curatedScore || 0)).slice(0, 5);
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

  // 7) 当前热点 — explicitly a generation-time snapshot, NOT week-filtered
  if (hotTopics && hotTopics.length) {
    L.push(`## 当前热点（生成时快照，非本周筛选）`);
    L.push(``);
    for (const h of hotTopics.slice(0, 5)) {
      const title = decodeEntities(h.title);
      L.push(`- ${title}${h.sourceCount ? ` · ${h.sourceCount} 源` : ''}${h.sourceUrl ? ` — [链接](${h.sourceUrl})` : ''}`);
    }
    L.push(``);
  }

  // 8) GSC
  L.push(`## 搜索表现（GSC · incadencept.com）`);
  L.push(``);
  if (gsc.skipped) {
    L.push(`_未配置：添加仓库 secret \`GSC_SA_KEY\`（Google service-account JSON）后自动填充本节。_`);
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
  if (weak.length) tips.push(`补稿方向：${weak.map(catLabel).join('、')}（低于方向均量一半）。`);
  // All count-DECLINE alarms are gated to the firstSeen axis. On publishedAt the
  // drop may be pure curation-lag / backfill noise, so never auto-alarm there.
  if (showPct && cur.tier.strong < prev.tier.strong)
    tips.push(`强信号环比下降（${prev.tier.strong}→${cur.tier.strong}），关注高分文献入库节奏。`);
  if (showPct && cur.total < prev.total)
    tips.push(`入库总量环比下降（${prev.total}→${cur.total}），核对抓取链路是否有漏。`);
  const topSrc = topN(cur.source, 1)[0];
  if (topSrc && cur.total && topSrc[1] / cur.total >= 0.5)
    tips.push(`来源集中：${topSrc[0]} 占 ${Math.round((topSrc[1] / cur.total) * 100)}%，可补充其他来源平衡。`);
  if (!tips.length) tips.push(`本周产出与覆盖均衡，保持节奏即可。`);
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
    hotTopics: corpus.hotTopics,
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

main().catch((e) => {
  console.error('weekly-brief failed:', e);
  process.exit(1);
});
