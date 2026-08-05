#!/usr/bin/env node
/**
 * lint-daily.js — pre-publish validator for ONE daily edition.
 *
 * Validates the current edition (newest by default, or a YYYY-MM-DD arg).
 * Forward-only by design: it never re-lints archives, because editions are
 * immutable and older ones predate fields like limitation / studyDesign.
 *
 * Reports only — it never edits or "fixes" anything. Missing content (e.g. a
 * blank curatedReasonEn) must be regenerated/backfilled, not synthesized here.
 * Exit code is 1 if any check FAILS, so it can gate a publish step. Warnings
 * are printed but do not change the exit code.
 *
 * Checks:
 *   1. topScore === max(curatedScore) over section items
 *   2. field completeness:
 *        - always required (non-empty): title, titleZh, summary, summaryZh,
 *          curatedReason, curatedReasonEn   ← catches the 06-16 missing En
 *        - pairing invariant: limitation and limitationEn are both non-empty or
 *          both blank/absent (no half-translated limitation). limitation is
 *          intentionally blank for news/guideline/policy/述评 per news-refresh.js
 *          (:559), so it is NOT required — only paired.
 *        - warn (not fail): a research item (studyDesign set, not 述评) with a
 *          blank limitation — the generator says these should usually have one.
 *   3. stats match content: events, specialties, sources
 *   4. every curatedScore is a number in [0, 100]
 *   5. lead paragraphs' study-type words are supported by some item's
 *      studyDesign (inclusion check; items without studyDesign are skipped).
 *      This is a regression NET, not a precise label checker — the real guard
 *      against mislabels is feeding studyDesign into the lead prompt.
 *
 * Usage:
 *   node scripts/lint-daily.js               — lint newest edition
 *   node scripts/lint-daily.js 2026-06-16    — lint a specific edition
 */
const fs   = require('fs');
const path = require('path');

const DAILY_DIR = path.join(__dirname, '..', 'briefs', 'daily');
const isEdition = f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f);

const fails = [];
const warns = [];
const fail  = m => fails.push(m);
const warn  = m => warns.push(m);
const present = v => v != null && v !== '';

// ---------------------------------------------------------------------------
// 把结论写进当天的 meta.txt —— 那是 Cindy 每天发布时一定会打开的文件
// (wechat-clip.sh 会 cat 它,她从里面复制标题和摘要)。
//
// 为什么需要这条:这个脚本的退出码在 CI 里被 continue-on-error 吞掉,结论只留在
// Actions 界面。而这个仓库的历史反复证明,只活在 Actions 里的信号会被漏掉 ——
// sitemap 冻结 12 天、本脚本自己 07-26 写好空转到 07-28,都没人当场发现。所以不是
// 在「阻塞管线」和「静音」之间二选一,而是把信号送到注意力已经在的地方。
//
// 三条约束:
//   1. 通过也写。只写失败的话,「没有那一行」有二义性(全好 / lint 根本没跑),
//      而后者正是要防的故障类。写了之后,那一行消失本身就是信号 —— 这个功能
//      因此自带监控,不需要再给它套一层检查。
//   2. 幂等。重复跑只替换同前缀的旧行,不往下堆。
//   3. 只有 CI 那次写。路径靠 LINT_META 传入,没传就什么都不做 —— 手动
//      `npm run lint-daily` 保持这个脚本「只报告、不碰任何文件」的原状。
//
// 路径为什么必须由外部传:meta.txt 用 **UTC 日期**命名(wechat-brief.js),日刊用
// **北京日期**(daily-brief.js),cron 在 21:30 UTC = 次日 05:30 北京跑,两者差一天
// (磁盘上就是 briefs/daily/2026-08-05.json 对 briefs/2026-08-04.meta.txt)。这个
// 差异是刻意的 —— 公众号刊头的日期指美国日期。所以别在这里推算,让 workflow 用
// 与 wechat-brief 相同的口径给出路径。
//
// 行内不放 http / 「阅读原文」字样:助推合规自检只扫 .html 和 .md 不扫 meta.txt,
// 但这行会被 cat 出来给她看,保持干净免得混淆。
const META_PREFIX = 'lint：';
function writeMetaLine(line) {
  const target = process.env.LINT_META;
  if (!target) return;                      // 手动跑:不碰任何文件
  if (!fs.existsSync(target)) {             // 非 full run 时 meta.txt 可能就不存在
    console.log(`  ⊘ LINT_META=${target} 不存在,跳过写入`);
    return;
  }
  const kept = fs.readFileSync(target, 'utf8')
    .split('\n')
    .filter((l) => !l.startsWith(META_PREFIX));
  while (kept.length && kept[kept.length - 1] === '') kept.pop();
  kept.push(META_PREFIX + line, '');
  fs.writeFileSync(target, kept.join('\n'));
  console.log(`  ✎ 已写入 ${target}`);
}

// Study-type label -> keywords acceptable in the lead for that design.
// Bare English "review" is deliberately omitted (it matches "systematic
// review"); the Chinese 综述 uses a negative lookbehind so it doesn't fire on
// "系统综述".
const TYPE_KEYWORDS = {
  'RCT':      [/\bRCT\b/i, /randomi[sz]ed/i, /随机/],
  '系统综述': [/systematic\s+review/i, /meta[\s-]?analysis/i, /系统综述/, /系统评价/, /荟萃/],
  '综述':     [/narrative\s+review/i, /scoping\s+review/i, /literature\s+review/i, /integrative\s+review/i, /(?<![系])综述/],
  '述评':     [/\beditorial\b/i, /\bcommentary\b/i, /\bperspective\b/i, /\bviewpoint\b/i, /述评/],
  '观察研究': [/\bcohort\b/i, /cross[\s-]?sectional/i, /case[\s-]?control/i, /retrospective/i, /prospective/i, /队列/, /观察研究/, /回顾性/, /前瞻性/],
};

function resolveDate(arg) {
  if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) return arg;
  const files = fs.readdirSync(DAILY_DIR).filter(isEdition).sort();
  if (!files.length) { console.error('No editions found in', DAILY_DIR); process.exit(2); }
  return files[files.length - 1].replace('.json', '');
}

function main() {
  const date = resolveDate(process.argv[2]);
  const fp   = path.join(DAILY_DIR, `${date}.json`);
  if (!fs.existsSync(fp)) { console.error(`Edition not found: ${fp}`); process.exit(2); }
  const ed = JSON.parse(fs.readFileSync(fp, 'utf8'));

  const sections = ed.sections || [];
  const items    = sections.flatMap(s => s.items || []);
  const flashes  = ed.flashes || [];
  const stats    = ed.stats || {};

  // 1. topScore
  const wantTop = items.length ? Math.max(...items.map(i => i.curatedScore)) : null;
  if (stats.topScore !== wantTop)
    fail(`topScore=${stats.topScore} but max(curatedScore)=${wantTop}`);

  // 2. field completeness
  const ALWAYS = ['title', 'titleZh', 'summary', 'summaryZh', 'curatedReason', 'curatedReasonEn'];
  items.forEach((it, n) => {
    const id = it.id || `#${n}`;
    for (const k of ALWAYS) if (!present(it[k])) fail(`item[${id}] missing ${k}`);

    // limitation pairing invariant
    const hasL = present(it.limitation), hasLEn = present(it.limitationEn);
    if (hasL !== hasLEn)
      fail(`item[${id}] limitation/limitationEn half-filled (limitation=${hasL}, limitationEn=${hasLEn})`);

    // soft: research item should usually carry a limitation
    const isResearch = (it.tags || [])[0] === 'research' && present(it.studyDesign) && it.studyDesign !== '述评';
    if (isResearch && !hasL)
      warn(`item[${id}] research (${it.studyDesign}) has blank limitation`);
  });

  // 3. stats vs content (mirror daily-brief.js definitions)
  if (stats.events !== items.length + flashes.length)
    fail(`stats.events=${stats.events} but section+flash items=${items.length + flashes.length}`);
  if (stats.specialties !== sections.length)
    fail(`stats.specialties=${stats.specialties} but sections=${sections.length}`);
  const srcSet = new Set([...items, ...flashes].map(x => x.source).filter(Boolean));
  if (stats.sources !== srcSet.size)
    fail(`stats.sources=${stats.sources} but unique sources=${srcSet.size}`);

  // 4. score range
  items.forEach((it, n) => {
    const s = it.curatedScore;
    if (typeof s !== 'number' || s < 0 || s > 100)
      fail(`item[${it.id || `#${n}`}] curatedScore out of range: ${s}`);
  });

  // 5. lead study-type inclusion (paragraphs only; titles legitimately quote
  // article study types). Skip items without studyDesign.
  const leadText = [ed.lead && ed.lead.paragraphZh, ed.lead && ed.lead.paragraphEn]
    .filter(Boolean).join('\n');
  const presentDesigns = new Set(items.map(i => i.studyDesign).filter(Boolean));
  if (leadText && presentDesigns.size) {
    for (const [design, res] of Object.entries(TYPE_KEYWORDS)) {
      const mentioned = res.some(re => re.test(leadText));
      if (mentioned && !presentDesigns.has(design))
        fail(`lead mentions "${design}" but no item has that studyDesign (present: ${[...presentDesigns].join(', ')})`);
    }
  }

  // Report
  warns.forEach(w => console.warn(`  ⚠ ${w}`));
  const warnTail = warns.length ? `，${warns.length} 条提示` : '';
  if (fails.length) {
    console.error(`✗ lint-daily ${date}: ${fails.length} error(s), ${warns.length} warning(s)`);
    fails.forEach(f => console.error(`  ✗ ${f}`));
    // 摘前两条就够 —— 这行是给人扫一眼的，全量在 Actions 日志里。
    const head = fails.slice(0, 2).join('；');
    const more = fails.length > 2 ? `；另有 ${fails.length - 2} 条` : '';
    writeMetaLine(`✗ ${date} 有 ${fails.length} 个问题${warnTail} —— ${head}${more}`);
    process.exit(1);
  }
  writeMetaLine(`✓ ${date} ${items.length} 条全过${warnTail}`);
  console.log(`✓ lint-daily ${date}: ${items.length} items, ${sections.length} sections, ${warns.length} warning(s) — all checks pass`);
}

main();
