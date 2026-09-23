/*
 * Daily poster carousel — invariants that are silent if broken (runs in npm test).
 *
 * P1  every specialty has a pigment + on-pigment tint in colors.css, and both the
 *     tint and white clear 4.5:1 on the LIVE pigment (the handoff verified its tints
 *     on a different palette — 2026-09-17 decision kept ours).
 * P2  the day.json validator rejects the overflow/format failures the fixed canvas
 *     can't show (length, middot, glyphs the latin-subset fonts lack, schema extras).
 * P3  the source check rejects invented numbers, unstated study designs and
 *     title-as-claim — handoff content rule 1/2 ("never fabricate study data").
 * P4  the PDF writer produces a structurally valid N-page PDF (LinkedIn document
 *     post = the only swipeable carousel).
 * P5  both scripts are actually run by the daily cron (written ≠ wired — 5 times).
 *
 * Pure node: no satori/resvg, no network — safe in every workflow.
 */
const fs = require('fs');
const path = require('path');
const { loadTaxonomy, validateDay, contrast, buildPdf } = require('./linkedin-poster');
const { checkAgainstSource } = require('./linkedin-poster-claims');

let fail = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) fail++; };

console.log('\nP1. taxonomy × colors.css × contrast');
const TAX = loadTaxonomy();
ok(Object.keys(TAX).length === 8, `8 specialties loaded (got ${Object.keys(TAX).length})`);
for (const c of Object.values(TAX)) {
  const t = contrast(c.tint, c.pigment), w = contrast('#FFFFFF', c.pigment);
  ok(t >= 4.5 && w >= 4.5, `${c.idx} ${c.id}: tint ${t.toFixed(2)}:1, white ${w.toFixed(2)}:1 on ${c.pigment}`);
}

console.log('\nP2. day.json validator');
const paper = (o = {}) => ({ categoryId: 'neurological', claim: 'A plain clinical claim.', context: 'What the study looked at.', journal: 'Clinical Rehabilitation', signal: 75, ...o });
const day = (lead, sup = [paper(), paper(), paper(), paper()]) => ({ date: '2026-09-22', lead, supporting: sup });
ok(validateDay(day(paper()), TAX).length === 0, 'a clean day passes');
ok(validateDay(day(paper({ claim: 'x'.repeat(96) })), TAX).some((e) => /claim is 96 chars/.test(e)), 'claim > 95 chars is rejected');
ok(validateDay(day(paper({ journal: 'Neurorehabilitation & Neural Repair' })), TAX).some((e) => /journal is 35 chars/.test(e)), 'journal > 34 chars is rejected (the handoff\'s own example is 35)');
ok(validateDay(day(paper({ claim: 'Neuro · Rehab' })), TAX).some((e) => /middot/.test(e)), 'middot is rejected');
ok(validateDay(day(paper({ claim: 'Scores ≥ 85 → better' })), TAX).some((e) => /can't draw/.test(e)), 'characters missing from the font subset are rejected');
ok(validateDay(day(paper({ categoryId: 'rehab-tech' })), TAX).some((e) => /categoryId/.test(e)), 'rehab-tech is an overlay, not a ground');
ok(validateDay(day(paper({ title: 'raw' })), TAX).some((e) => /not in the schema/.test(e)), 'fields outside the schema are rejected');
ok(validateDay(day(paper(), [paper(), paper(), paper(), paper(), paper()]), TAX).some((e) => /max 4/.test(e)), 'more than 4 supporting papers is rejected');
ok(validateDay(day(paper(), [paper()]), TAX).length === 0, 'a short day (1 supporting) is allowed — renders 2 slides');

console.log('\nP3. copy vs source');
const src = {
  title: 'Implementation of group-based health education and exercise for individuals with knee osteoarthritis in brazilian primary health care: a mixed-methods study.',
  summary: 'A mixed-methods implementation study found high recruitment (87.3%), retention (83%), and adherence.',
};
ok(checkAgainstSource({ claim: 'Group classes for knee arthritis can run inside public primary care.', context: 'A mixed-methods study found retention of 83%.' }, src).length === 0, 'faithful copy passes (numbers and design present in source)');
ok(checkAgainstSource({ claim: 'Group classes help 120 patients.', context: 'x' }, src).some((e) => /"120"/.test(e)), 'invented number is rejected');
ok(checkAgainstSource({ claim: 'Group classes help knees.', context: 'An RCT in Brazil.' }, src).some((e) => /RCT/.test(e)), 'unstated study design is rejected');
ok(checkAgainstSource({ claim: 'Implementation of group-based health education and exercise for knee osteoarthritis', context: 'x' }, src).some((e) => /raw title/.test(e)), 'title-as-claim is rejected');

console.log('\nP4. PDF writer');
const px = (w, h) => ({ width: w, height: h, rgba: Buffer.alloc(w * h * 4, 255) });
const pdf = buildPdf([px(4, 5), px(4, 5), px(4, 5)]).toString('latin1');
ok(pdf.startsWith('%PDF-1.4') && pdf.trimEnd().endsWith('%%EOF'), 'header and EOF present');
ok(/\/Type \/Pages \/Kids \[[^\]]+\] \/Count 3/.test(pdf), '3 pages declared');
const sx = +pdf.match(/startxref\n(\d+)/)[1];
ok(pdf.slice(sx, sx + 4) === 'xref', 'startxref points at the xref table');

console.log('\nP5. wired into the daily cron');
const wf = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'refresh.yml'), 'utf8');
ok(/node scripts\/linkedin-poster-claims\.js/.test(wf), 'refresh.yml runs linkedin-poster-claims.js');
ok(/node scripts\/linkedin-poster\.js/.test(wf), 'refresh.yml runs linkedin-poster.js');

if (fail) { console.error(`\n✗ linkedin-poster.test: ${fail} failure(s)`); process.exit(1); }
console.log('\n✓ linkedin-poster.test: all passed');
