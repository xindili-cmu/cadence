#!/usr/bin/env node
/**
 * Backfill studyDesign field on all research items.
 *
 * studyDesign is a short Chinese label for the research design badge shown on
 * XHS cards. Only items where tags[0] === 'research' get this field; news /
 * guideline / policy items are skipped.
 *
 * Label set (stored as-is, displayed directly on badge):
 *   RCT       — randomized (controlled) trial
 *   系统综述   — systematic review ± meta-analysis
 *   观察研究   — cohort / cross-sectional / case-control / prospective / retrospective
 *   综述       — narrative review / scoping review / literature review
 *   述评       — editorial / commentary / expert opinion / perspective
 *
 * Strategy: regex first (fast, free), then LLM for anything unmatched.
 * Idempotent — already-labelled items are skipped unless FORCE=true.
 *
 * Usage:
 *   node scripts/backfill-study-design.js           — write
 *   DRY_RUN=true node scripts/backfill-study-design.js — print only
 *   FORCE=true node scripts/backfill-study-design.js   — re-label everything
 */

const fs   = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '..', '.env');
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const { callAnthropic, callGemini, LLM_PROVIDER } = require('./news-refresh.js');

const DRY_RUN = process.env.DRY_RUN === 'true';
const FORCE   = process.env.FORCE   === 'true';

// ── Regex classifier ──────────────────────────────────────────────────────────
const RULES = [
  { label: 'RCT',    re: /\b(randomized|randomised).{0,40}(trial|study)\b|(?<!\w)RCT(?!\w)|\bpilot\s+(RCT|trial)\b/i },
  { label: '系统综述', re: /systematic\s+review|meta[\s-]?analysis/i },
  { label: '综述',    re: /narrative\s+review|scoping\s+review|literature\s+review|integrative\s+review/i },
  { label: '述评',    re: /\beditorial\b|\bcommentary\b|\bexpert\s+opinion\b|\bperspective\b|\bviewpoint\b/i },
  { label: '观察研究', re: /\bcohort\b|cross[\s-]?sectional|case[\s-]?control|retrospective|prospective/i },
];

function classifyByRegex(item) {
  const text = (item.title || '') + ' ' + (item.summary || '');
  for (const { label, re } of RULES) {
    if (re.test(text)) return label;
  }
  return null;
}

// ── LLM classifier ────────────────────────────────────────────────────────────
const SYSTEM = `You are a research-design classifier for a physical therapy literature feed.
Given a list of article objects (id, title, summary), return a JSON array where each element
has "id" and "studyDesign" — one of exactly these values:
  "RCT"        — any randomized (controlled) trial, including pilot RCTs
  "系统综述"    — systematic review and/or meta-analysis
  "观察研究"    — cohort, cross-sectional, case-control, prospective or retrospective observational study
  "综述"        — narrative review, scoping review, literature review (NOT systematic)
  "述评"        — editorial, commentary, expert opinion, perspective, viewpoint
If none fits or unclear, use "观察研究" as the default.
Return ONLY the JSON array, no markdown fences.`;

function parseArray(raw) {
  let text = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const start = text.indexOf('[');
  if (start === -1) return [];
  text = text.slice(start);
  try { return JSON.parse(text); } catch {
    for (let cut = text.lastIndexOf('}'); cut > 0; cut = text.lastIndexOf('}', cut - 1)) {
      try { return JSON.parse(text.slice(0, cut + 1) + ']'); } catch { /* keep cutting */ }
    }
    return [];
  }
}

async function llmClassify(batch) {
  const input = batch.map(i => ({ id: i.id, title: i.title, summary: (i.summary || '').slice(0, 200) }));
  const user  = JSON.stringify(input, null, 2);
  const raw   = LLM_PROVIDER === 'gemini'
    ? await callGemini(SYSTEM, user)
    : await callAnthropic(SYSTEM, user);
  return parseArray(raw);
}

// ── File processor ────────────────────────────────────────────────────────────
async function processFile(filePath) {
  const data  = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const items = data.items || [];

  // Only research items need a study-design label
  const researchItems = items.filter(i => (i.tags || [])[0] === 'research');
  const todo = FORCE
    ? researchItems
    : researchItems.filter(i => !i.studyDesign);

  console.log(`${path.basename(filePath)}: ${researchItems.length} research items, ${todo.length} to label`);
  if (!todo.length) return;

  // Pass 1: regex
  const needLLM = [];
  const byId    = {};
  for (const i of todo) {
    const label = classifyByRegex(i);
    if (label) byId[i.id] = label;
    else needLLM.push(i);
  }
  console.log(`  regex: ${todo.length - needLLM.length} matched, ${needLLM.length} → LLM`);

  // Pass 2: LLM for remainder
  const BATCH = 10;
  for (let off = 0; off < needLLM.length; off += BATCH) {
    const batch = needLLM.slice(off, off + BATCH);
    const out   = await llmClassify(batch);
    out.forEach(o => { if (o.id && o.studyDesign) byId[o.id] = o.studyDesign; });
    console.log(`  LLM batch ${Math.floor(off / BATCH) + 1}: ${out.length}/${batch.length} classified`);
  }

  if (DRY_RUN) {
    for (const i of todo) console.log(`  [dry] ${i.id}: ${byId[i.id] || '?'}`);
    return;
  }

  let patched = 0;
  for (const i of items) {
    if (byId[i.id] !== undefined) { i.studyDesign = byId[i.id]; patched++; }
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`  ✓ ${patched} items patched → ${path.basename(filePath)}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const ROOT    = path.join(__dirname, '..');
  const archDir = path.join(ROOT, 'archive');

  await processFile(path.join(ROOT, 'news.json'));

  if (fs.existsSync(archDir)) {
    const months = fs.readdirSync(archDir)
      .filter(f => f.endsWith('.json') && f !== 'index.json')
      .sort();
    for (const f of months) await processFile(path.join(archDir, f));
  }

  console.log('\nDone.');
})().catch(e => { console.error('❌', e); process.exit(1); });
