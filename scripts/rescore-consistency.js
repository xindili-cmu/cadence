#!/usr/bin/env node
/**
 * rescore-consistency.js — SIGNAL 分数重测一致性（test–retest）。
 *
 * 干什么：从当前 feed 分层抽样（每个展示档取几条），用生产环境同一套
 * 策展 prompt + 模型重打 N 遍分，量化同一条目的分数抖动。
 * 抖动大 = 分数里噪声成分高，档位边界（85/75/65）附近的条目不可信。
 *
 * ⚠️ 只能在 Cindy 本地终端跑（沙箱连不上 LLM API）：
 *   LLM_PROVIDER=gemini GEMINI_API_KEY=xxx node scripts/rescore-consistency.js
 *   可选：--runs 3（默认 3 遍）--per-tier 4（默认每档 4 条）
 *
 * 诚实声明（写进输出）：生产打分的输入是抓取时的正文前 800 字；
 * 归档条目不存正文，这里用 title+summary 代替。因此本脚本测的是
 * 「同输入下模型的自身抖动」，与生产分数的绝对差只作参考。
 *
 * 输出：控制台 + briefs/rescore-consistency-YYYY-MM-DD.md
 */

const fs = require('fs');
const path = require('path');
const { curateWithClaude, LLM_PROVIDER } = require('./news-refresh');

const ROOT = path.join(__dirname, '..');
const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? +process.argv[i + 1] : dflt;
};
const RUNS = arg('runs', 3);
const PER_TIER = arg('per-tier', 4);

function hasKey() {
  if (LLM_PROVIDER === 'gemini') return !!process.env.GEMINI_API_KEY;
  if (LLM_PROVIDER === 'anthropic') return !!process.env.ANTHROPIC_API_KEY;
  return !!process.env.DEEPSEEK_API_KEY;
}

async function main() {
  if (!hasKey()) {
    console.error(`缺 API key（LLM_PROVIDER=${LLM_PROVIDER}）。本脚本要在有 key 的本地终端跑：`);
    console.error('  LLM_PROVIDER=gemini GEMINI_API_KEY=xxx node scripts/rescore-consistency.js');
    process.exit(1);
  }

  // 分层抽样：每个展示档取 PER_TIER 条 research 条目（news/policy 的分数
  // 语义不同，先只测 research）。取最新的，保证 summary 质量。
  const live = JSON.parse(fs.readFileSync(path.join(ROOT, 'news.json'), 'utf8')).items
    .filter((i) => (i.tags || [])[0] === 'research' && i.summary);
  const tierOf = (s) => (s >= 85 ? '85+' : s >= 75 ? '75-84' : '65-74');
  const byTier = { '85+': [], '75-84': [], '65-74': [] };
  for (const i of live) byTier[tierOf(i.curatedScore)].push(i);
  const sample = Object.values(byTier).flatMap((a) =>
    a.sort((x, y) => (y.firstSeen || '').localeCompare(x.firstSeen || '')).slice(0, PER_TIER));
  if (!sample.length) { console.error('feed 里没有可抽样的 research 条目'); process.exit(1); }

  console.log(`重测 ${sample.length} 条 × ${RUNS} 遍（provider=${LLM_PROVIDER}）`);
  console.log('注意：输入为 title+summary（非生产用的正文前 800 字），结论只看抖动，不看绝对差。\n');

  // 喂给生产策展函数的 raw 形状（news-refresh.js curateWithClaude 的入参）
  const raw = sample.map((i) => ({
    title: i.title,
    text: i.summary,
    category: i.category,
    source: i.source,
    url: i.sourceUrl,
    publishedDate: i.publishedAt,
  }));

  const runs = []; // runs[r][sampleIdx] = score | null(被相关性门丢弃)
  for (let r = 0; r < RUNS; r++) {
    process.stdout.write(`run ${r + 1}/${RUNS}… `);
    const curated = await curateWithClaude(raw);
    const scores = new Array(sample.length).fill(null);
    for (const c of curated || []) {
      if (typeof c.index === 'number' && typeof c.curatedScore === 'number') scores[c.index] = c.curatedScore;
    }
    runs.push(scores);
    console.log(`拿到 ${scores.filter((s) => s != null).length}/${sample.length} 个分数`);
  }

  // 汇总
  const rows = sample.map((item, idx) => {
    const scores = runs.map((r) => r[idx]).filter((s) => s != null);
    const dropped = RUNS - scores.length;
    const range = scores.length ? Math.max(...scores) - Math.min(...scores) : null;
    const crossesTier = scores.length ? new Set(scores.map(tierOf)).size > 1 : null;
    return { stored: item.curatedScore, title: item.title, scores, dropped, range, crossesTier };
  });

  const scored = rows.filter((r) => r.scores.length >= 2);
  const stable5 = scored.filter((r) => r.range <= 5).length;
  const tierFlips = scored.filter((r) => r.crossesTier).length;
  const anyDropped = rows.filter((r) => r.dropped > 0).length;

  console.log('\n结果：');
  for (const r of rows) {
    console.log(`  存档 ${r.stored} → 重测 [${r.scores.join(',') || '全部被丢弃'}]${r.dropped ? ` (丢弃×${r.dropped})` : ''} range=${r.range ?? '—'}${r.crossesTier ? ' ⚠️跨档' : ''}  ${r.title.slice(0, 60)}`);
  }
  console.log(`\n汇总：range≤5 的条目 ${stable5}/${scored.length}；跨展示档 ${tierFlips}/${scored.length}；出现过被丢弃 ${anyDropped}/${rows.length}`);
  console.log('判读：跨档比例 >20% ⇒ 档位边界不可信，考虑 prompt 固化打分锚点或多次采样取中位数。');

  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(ROOT, 'briefs', `rescore-consistency-${day}.md`);
  fs.writeFileSync(file, [
    `# SIGNAL 重测一致性 — ${day}`,
    `provider=${LLM_PROVIDER} · ${sample.length} 条 × ${RUNS} 遍 · 输入为 title+summary（非生产正文，结论只看抖动）`, '',
    `- range≤5：${stable5}/${scored.length}`,
    `- 跨展示档：${tierFlips}/${scored.length}`,
    `- 被相关性门丢弃过：${anyDropped}/${rows.length}`, '',
    '| 存档分 | 重测分 | range | 跨档 | 标题 |',
    '|--------|--------|-------|------|------|',
    ...rows.map((r) => `| ${r.stored} | ${r.scores.join(', ') || '（丢弃）'} | ${r.range ?? '—'} | ${r.crossesTier ? '⚠️' : ''} | ${r.title.replace(/\s+/g, ' ').replace(/\|/g, '\\|').slice(0, 80)} |`),
  ].join('\n') + '\n');
  console.log(`已写 ${path.relative(ROOT, file)}`);
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
