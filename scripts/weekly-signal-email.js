#!/usr/bin/env node
/**
 * weekly-signal-email.js — 「每周最强信号」订阅邮件（草稿）
 *
 * Builds the reader-facing weekly digest email (top SIGNAL papers of the last
 * completed Beijing week, Mon–Sun) and creates a DRAFT broadcast in Resend.
 * It NEVER sends — per PRINCIPLES.md（发布永远由人）, Cindy reviews the draft
 * in the Resend dashboard (https://resend.com/broadcasts) and clicks Send.
 *
 * Always writes a local preview to briefs/email/YYYY-MM-DD.html (committed by
 * the workflow) so the email can be eyeballed without opening Resend.
 *
 * Usage:
 *   node scripts/weekly-signal-email.js              # last completed Beijing week
 *   node scripts/weekly-signal-email.js 2026-06-22   # the week containing that date
 *   DRY_RUN=true node scripts/weekly-signal-email.js # preview file only, no API call
 *
 * Env:
 *   RESEND_API_KEY     — required to create the draft (else preview-only + warning)
 *   RESEND_SEGMENT_ID  — Resend segment (audience) holding subscribers; required to draft
 *   MAIL_FROM          — verified sender, e.g. "Cadence 步频 <weekly@incadencept.com>"
 *                        (domain must be verified in Resend; the shared
 *                        onboarding@resend.dev sender cannot broadcast to real
 *                        subscribers)
 *   SITE_URL           — defaults to https://incadencept.com
 *
 * Subscriber intake: scripts/add-subscriber.js (manual, from the Formspree
 * kind:'subscribe' notifications). Unsubscribe is handled by Resend via the
 * {{{RESEND_UNSUBSCRIBE_URL}}} merge tag in the footer.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DRY = String(process.env.DRY_RUN || '').toLowerCase() === 'true';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_SEGMENT_ID = process.env.RESEND_SEGMENT_ID || '';
const MAIL_FROM = process.env.MAIL_FROM || 'Cadence 步频 <weekly@incadencept.com>';
const SITE_URL = (process.env.SITE_URL || 'https://incadencept.com').replace(/\/$/, '');

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const BJ_OFFSET = 8 * HOUR; // Beijing = UTC+8, no DST

// How many stories the digest carries.
const TOP_N = 5;

// ── Beijing-week helpers (mirrors scripts/weekly-brief.js) ───────────────────
function bjParts(ms) {
  const d = new Date(ms + BJ_OFFSET);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay() };
}
function bjMidnight(ms) {
  const p = bjParts(ms);
  return Date.UTC(p.y, p.m, p.d) - BJ_OFFSET;
}
function weekWindow(anchorMs, explicit) {
  const midnight = bjMidnight(anchorMs);
  const dow = bjParts(anchorMs).dow;
  const sinceMonday = (dow + 6) % 7;
  const thisMonday = midnight - sinceMonday * DAY;
  const start = explicit ? thisMonday : thisMonday - 7 * DAY;
  return { start, end: start + 7 * DAY };
}
function fmtMD(ms) {
  const p = bjParts(ms);
  return `${p.m + 1}.${p.d}`;
}
function fmtYMD(ms) {
  const p = bjParts(ms);
  return `${p.y}-${String(p.m + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

// ── Data ─────────────────────────────────────────────────────────────────────
function loadItems() {
  // Live feed first, then archive months; dedupe by sourceUrl then id
  // (archive keeps each URL's original identity).
  const seen = new Set();
  const items = [];
  const take = (list) => {
    for (const i of list || []) {
      const key = i.sourceUrl || i.id;
      if (!i || !key || seen.has(key)) continue;
      seen.add(key);
      if (i.id) seen.add(i.id);
      items.push(i);
    }
  };
  try { take(JSON.parse(fs.readFileSync(path.join(ROOT, 'news.json'), 'utf8')).items); } catch {}
  try {
    const dir = path.join(ROOT, 'archive');
    for (const f of fs.readdirSync(dir).sort().reverse()) {
      if (!/^\d{4}-\d{2}\.json$/.test(f)) continue;
      try { take(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).items); } catch {}
    }
  } catch {}
  return items;
}

// ── Email HTML (table-based, inline styles — email-client-safe) ──────────────
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function tierColor(score) {
  return score >= 85 ? '#2F6B4F' : score >= 75 ? '#3D74B8' : '#8A8F98';
}
function tierLabel(score) {
  return score >= 85 ? '强信号' : score >= 75 ? '值得关注' : '参考';
}

function buildHtml({ picks, range }) {
  const rows = picks.map((i, idx) => {
    const url = `${SITE_URL}/?item=${encodeURIComponent(i.id)}`;
    const title = i.titleZh || i.title;
    const src = [i.journal || i.source, (i.publishedAt || '').slice(0, 10)].filter(Boolean).join(' · ');
    const reason = i.curatedReason || i.summary || '';
    return `
      <tr><td style="padding:${idx ? '22px' : '6px'} 0 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td style="vertical-align:top;width:52px;padding-right:14px;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;color:${tierColor(i.curatedScore)};line-height:1;">${i.curatedScore}</div>
              <div style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;font-size:10px;color:${tierColor(i.curatedScore)};margin-top:3px;">${tierLabel(i.curatedScore)}</div>
            </td>
            <td style="vertical-align:top;">
              <a href="${esc(url)}" style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;font-size:16px;font-weight:600;line-height:1.45;color:#1B1E23;text-decoration:none;">${esc(title)}</a>
              <div style="font-family:Menlo,Consolas,monospace;font-size:11px;color:#93A0AC;margin-top:5px;">${esc(src)}</div>
              <div style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;font-size:13.5px;line-height:1.65;color:#4A5058;margin-top:8px;">${esc(reason)}</div>
              <div style="margin-top:8px;"><a href="${esc(url)}" style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;font-size:12.5px;font-weight:600;color:#3D74B8;text-decoration:none;">阅读详情 →</a></div>
            </td>
          </tr>
        </table>
      </td></tr>`;
  }).join('\n');

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF6;border-collapse:collapse;">
    <tr><td align="center" style="padding:28px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-collapse:collapse;">
        <!-- masthead -->
        <tr><td style="padding:0 0 14px;border-bottom:2px solid #1B1E23;">
          <span style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;color:#1B1E23;">Cadence 步频</span>
          <span style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;font-size:12px;color:#93A0AC;">&nbsp;·&nbsp;每周最强信号 · ${esc(range)}</span>
        </td></tr>
        <tr><td style="padding:16px 0 4px;">
          <p style="margin:0;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;font-size:13.5px;line-height:1.7;color:#4A5058;">上周全球康复文献里，信号分最高的 ${picks.length} 篇。每篇附一句「为什么重要」，点标题看完整摘要与原文。</p>
        </td></tr>
        ${rows}
        <!-- footer -->
        <tr><td style="padding:26px 0 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid #E4E2DA;">
            <tr><td style="padding:14px 0 0;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;font-size:12px;line-height:1.8;color:#93A0AC;">
              更多内容：<a href="${SITE_URL}/" style="color:#3D74B8;text-decoration:none;">incadencept.com</a> · 公众号「Cadence步频」 · 小红书 in_cadence<br>
              SIGNAL 分由 AI 基于标题与摘要评出，不构成临床建议。<br>
              不想再收到这封邮件？<a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#93A0AC;">一键退订</a>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ── Resend (draft broadcast — never sends) ───────────────────────────────────
async function createDraftBroadcast({ subject, html }) {
  const res = await fetch('https://api.resend.com/broadcasts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      segment_id: RESEND_SEGMENT_ID,
      from: MAIL_FROM,
      subject,
      html,
      name: subject,
      // send intentionally omitted (defaults false): draft only — Cindy sends
      // from the Resend dashboard after review（发布永远由人）.
    }),
  });
  if (!res.ok) throw new Error(`resend broadcasts ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const argDate = process.argv[2];
  const anchorMs = argDate ? Date.parse(`${argDate}T00:00:00+08:00`) : Date.now();
  const { start, end } = weekWindow(anchorMs, !!argDate);
  const range = `${fmtMD(start)}–${fmtMD(end - DAY)}`;

  const items = loadItems();
  const inWeek = items.filter((i) => {
    const ts = Date.parse(i.firstSeen || i.publishedAt || '');
    return Number.isFinite(ts) && ts >= start && ts < end;
  });
  // Research first (the digest's promise is literature, not industry news);
  // top up with non-research only if research alone can't fill the slate.
  const bySignal = (a, b) => (b.curatedScore - a.curatedScore) || ((b.publishedAt || '').localeCompare(a.publishedAt || ''));
  // Near-duplicate guard: the same study sometimes lands as two PubMed records
  // with near-identical titles (e.g. a CAP synopsis indexed twice). Key on the
  // normalized English title prefix so the digest never runs the same study twice.
  const normTitle = (i) => String(i.title || i.titleZh || '').toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '').slice(0, 80);
  const pickTop = (list, n, seenTitles) => {
    const out = [];
    for (const i of list) {
      if (out.length >= n) break;
      const k = normTitle(i);
      if (k && seenTitles.has(k)) continue;
      if (k) seenTitles.add(k);
      out.push(i);
    }
    return out;
  };
  const research = inWeek.filter((i) => (i.tags || [])[0] === 'research').sort(bySignal);
  const rest = inWeek.filter((i) => (i.tags || [])[0] !== 'research').sort(bySignal);
  const seenTitles = new Set();
  const picks = pickTop(research, TOP_N, seenTitles);
  if (picks.length < 3) picks.push(...pickTop(rest, TOP_N - picks.length, seenTitles));

  if (!picks.length) {
    console.log(`✗ ${range}: no stories in window — nothing to draft.`);
    return;
  }

  const subject = `步频·每周最强信号 | ${range} 高分康复文献`;
  const html = buildHtml({ picks, range });

  // Always write the local preview.
  const outDir = path.join(ROOT, 'briefs', 'email');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${fmtYMD(start)}.html`);
  fs.writeFileSync(outFile, html);
  console.log(`✓ preview → briefs/email/${path.basename(outFile)} (${picks.length} items · ${range})`);

  if (DRY) { console.log('[dry-run] skipping Resend draft.'); return; }
  if (!RESEND_API_KEY || !RESEND_SEGMENT_ID) {
    console.log('⚠ RESEND_API_KEY / RESEND_SEGMENT_ID not set — preview only, no draft created.');
    return;
  }
  const r = await createDraftBroadcast({ subject, html });
  console.log(`✓ Resend draft broadcast created: ${r.id}`);
  console.log('  → Review & send: https://resend.com/broadcasts （发布永远由人）');
})().catch((e) => { console.error('✗ weekly-signal-email failed:', e.message); process.exit(1); });
