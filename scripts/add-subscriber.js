#!/usr/bin/env node
/**
 * add-subscriber.js — add subscriber email(s) to the Resend segment.
 *
 * Intake flow: the site's subscribe card posts to Formspree (kind:'subscribe');
 * Cindy copies new addresses from the Formspree notification emails and runs:
 *
 *   RESEND_API_KEY=re_xxx RESEND_SEGMENT_ID=xxx \
 *   node scripts/add-subscriber.js a@x.com b@y.com
 *
 * Duplicates are safe: Resend keys contacts by email. Unsubscribed contacts
 * stay unsubscribed (this script never flips unsubscribed back to false for
 * an existing contact — it only creates).
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_SEGMENT_ID = process.env.RESEND_SEGMENT_ID || '';

const emails = process.argv.slice(2).map((e) => e.trim().toLowerCase()).filter(Boolean);
if (!RESEND_API_KEY || !RESEND_SEGMENT_ID) {
  console.error('✗ set RESEND_API_KEY and RESEND_SEGMENT_ID env vars.');
  process.exit(1);
}
if (!emails.length) {
  console.error('usage: node scripts/add-subscriber.js email [email …]');
  process.exit(1);
}
const RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

(async () => {
  let ok = 0, fail = 0;
  for (const email of emails) {
    if (!RE.test(email)) { console.log(`✗ ${email} — not a valid address, skipped`); fail++; continue; }
    try {
      const res = await fetch('https://api.resend.com/contacts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, unsubscribed: false, segments: [{ id: RESEND_SEGMENT_ID }] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`${res.status} ${body.message || ''}`.trim());
      console.log(`✓ ${email} (${body.id || 'ok'})`);
      ok++;
    } catch (e) {
      console.log(`✗ ${email} — ${e.message}`);
      fail++;
    }
  }
  console.log(`\n${ok} added, ${fail} failed/skipped.`);
  if (fail) process.exit(1);
})();
