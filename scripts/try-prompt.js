#!/usr/bin/env node
// Throwaway prompt tester — exercises the curation prompt on a few hand-made
// fixtures WITHOUT fetching (Exa) or writing news.json. Use it to eyeball the
// new `limitation` field + action-advice guardrails after editing the prompt
// in news-refresh.js.
//
//   node scripts/try-prompt.js
//
// Needs ANTHROPIC_API_KEY in the environment (it's in .env). This makes ONE
// small Claude call (a few fixtures), so it costs a fraction of a cent.
const fs = require('fs');
const path = require('path');

// load .env (no dotenv dependency assumed)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// A/B switch — pick provider + model from env before requiring the module
// (news-refresh reads LLM_PROVIDER / *_MODEL as top-level consts at load time):
//   PROVIDER=anthropic MODEL=claude-sonnet-4-6   node scripts/try-prompt.js
//   PROVIDER=anthropic MODEL=claude-haiku-4-5-20251001 node scripts/try-prompt.js
//   PROVIDER=deepseek  MODEL=deepseek-v4-flash    node scripts/try-prompt.js
//   PROVIDER=deepseek  MODEL=deepseek-v4-pro      node scripts/try-prompt.js
const PROVIDER = (process.env.PROVIDER || process.env.LLM_PROVIDER || 'deepseek').toLowerCase();
process.env.LLM_PROVIDER = PROVIDER;
if (process.env.MODEL) {
  if (PROVIDER === 'deepseek') process.env.DEEPSEEK_MODEL = process.env.MODEL;
  else if (PROVIDER === 'gemini') process.env.GEMINI_MODEL = process.env.MODEL;
  else process.env.ANTHROPIC_MODEL = process.env.MODEL;
}
const MODEL = { anthropic: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
                deepseek: process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro',
                gemini: process.env.GEMINI_MODEL || 'gemini-2.5-flash' }[PROVIDER];

const { curateWithClaude } = require('./news-refresh.js');

// Three deliberately different evidence levels to probe the guardrails:
const fixtures = [
  { title: 'Early versus delayed weight-bearing after ACL reconstruction: a multicenter randomized controlled trial of 412 patients with 2-year follow-up',
    text: 'In this multicenter RCT (n=412), early weight-bearing was non-inferior to delayed protocols on IKDC at 24 months, with fewer arthrofibrosis cases. Adequately powered, low loss to follow-up.',
    category: 'orthopedic', source: 'JOSPT', url: 'https://example.org/acl-rct', publishedDate: '2026-06-13' },
  { title: 'Telerehabilitation versus in-clinic care for knee osteoarthritis: a single-center retrospective cohort of 64 patients',
    text: 'Retrospective cohort (n=64) found telerehab non-significantly different from in-clinic care on WOMAC at 12 weeks. Observational, single center, no randomization, possible selection bias.',
    category: 'orthopedic', source: 'PTJ', url: 'https://example.org/tele-cohort', publishedDate: '2026-06-13' },
  { title: 'CMS finalizes 2027 outpatient therapy reimbursement cut',
    text: 'CMS announced a 3.5% reduction to outpatient PT reimbursement effective Jan 2027 in the US.',
    category: 'practice', source: 'APTA', url: 'https://example.org/cms', publishedDate: '2026-06-13' },
];

(async () => {
  console.log(`\n▶ provider=${PROVIDER}  model=${MODEL}`);
  const out = await curateWithClaude(fixtures);
  for (const c of out) {
    const f = fixtures[c.index] || {};
    console.log('\n────────────────────────────────────────────────');
    console.log(`[${c.curatedScore}] ${(f.title || '').slice(0, 70)}`);
    console.log('  studyDesign :', c.studyDesign || '(none)');
    console.log('  why         :', c.curatedReason);
    console.log('  limitation  :', c.limitation === undefined ? '(omitted)' : JSON.stringify(c.limitation));
    console.log('  limitEn     :', c.limitationEn === undefined ? '(omitted)' : JSON.stringify(c.limitationEn));
  }
  console.log('\nExpect: RCT → limitation filled (boundary, not empty) + a real take; observational cohort → limitation filled + cautious take, no hard "do X"; CMS news → limitation blank/omitted.\n');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
