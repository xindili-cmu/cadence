/*
 * Cadence 步频 — 刊名短名解析（poster 的 journal 列，≤34 字符）。
 *
 * 为什么存在：2026-09 的 daily-poster 设计交付（design_handoff_daily_poster）
 * 把 journal 定成 `white-space:nowrap` 的单行，schema 写死 maxLength=34。
 * 超了不会报错，会**静默把幻灯片编号顶出画布** —— 正是本仓库反复踩的那类
 * 「对 CI 静默、对读者响」的故障。所以这里只做一件事：把入库的 journal 全名
 * 解析成 ≤34 的展示短名，解析不出来就让调用方炸掉，绝不截断。
 *
 * ⚠️ 这里不发明缩写。全部短名来自仓库里已有的两张人工维护的表：
 *
 *   1. sources.json —— roster 刊的 { name, journalName } 本来就是
 *      「短名 ↔ 全名」一对。news-refresh.js 的 ROSTER_JOURNAL_BY_NAME 走的是
 *      短名→全名，这里走反方向，同一份数据，不新增第三张表（CLAUDE.md 第 4 条：
 *      只写指针，不写值 —— 值会漂移）。48 条，覆盖语料里 29 个超长刊名中的 27 个。
 *   2. journals.json 的 aliases —— 补上 roster 没收的 2 条。aliases 是小写的，
 *      展示前按词首大写还原成 NLM 形态（pediatr phys ther → Pediatr Phys Ther）。
 *
 * 另有一步纯机械变换，不算「表」：PubMed 的刊名常带 ISO-4 副标题
 *   "European spine journal : official publication of the European Spine Society, …" (179)
 * 在 " : " 处截断得到的是刊名本身，不是猜测。语料里最长的一条靠这一步从 179 降到 22。
 *
 * 匹配口径照抄 journals.json 自己写的 alias 规则（小写、去括号注释、去开头 the、
 * & 视为 and），所以 "Clinical biomechanics (Bristol, Avon)"（PubMed 带地名括号）
 * 和 "Clinical Biomechanics"（RSS）命中同一行。
 *
 * 用法：
 *   const { shortJournal } = require('./journal-short');
 *   shortJournal('Journal of NeuroEngineering and Rehabilitation')
 *     // → { short: 'J NeuroEng Rehabil', via: 'roster', ok: true }
 *
 *   node scripts/journal-short.js            # 审计最新一期
 *   node scripts/journal-short.js --all      # 审计 briefs/daily/ 全部期次
 *   node scripts/journal-short.js 2026-09-16 # 审计某一期
 * 审计发现无法解析的刊名时 exit 1（fail loud，交付文档要求的就是这个）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// 来自 design_handoff_daily_poster/poster.day.schema.json 的 journal.maxLength。
// 它不是拍脑袋的数：是 72px padding 下 19px IBM Plex Mono 单行的实测容量。
// 改版面宽度或字号 → 这个数要跟着重算，否则又变成静默溢出。
const JOURNAL_MAX = 34;

// journals.json 的 _comment 里写明的 alias 匹配规则，这里是它的可执行版本。
// 两边口径必须一致，否则同一个刊在文章卡片能查到 IF、在 poster 上查不到短名。
function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')   // 去括号注释："(Bristol, Avon)" "(2001)"
    .replace(/^the\s+/, '')         // 去开头 the
    .replace(/&/g, ' and ')         // & 视为 and
    .replace(/[^\w\s]/g, ' ')       // 标点归一（逗号、连字符…）
    .replace(/\s+/g, ' ')
    .trim();
}

// PubMed 的 " : 副标题" —— 截断得到刊名本身，不是猜测。
// 用 /\s+:\s+/ 而不是裸冒号：刊名里的 "PM & R" 不受影响，而 "Vol 12:3" 这类
// 无空格冒号也不会被误切。
function stripSubtitle(s) {
  return String(s || '').split(/\s+:\s+/)[0].trim();
}

function titleCaseAbbrev(s) {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

let _tables = null;
function tables() {
  if (_tables) return _tables;

  // ① roster 反向表：journalName(全名) → name(短名)
  const roster = new Map();
  const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'sources.json'), 'utf8'));
  for (const s of sources) {
    if (s.kind === 'journal' && s.journalName && s.name) {
      roster.set(normKey(s.journalName), s.name);
    }
  }

  // ② journals.json aliases：取 ≤MAX 里词数最多的那条 —— 词数最多 = 信息最全。
  // 只按长度取会选中 'jospt' 这种裸首字母缩写，而 'j orthop sports phys ther'
  // 在海报上可读得多。
  const byAlias = new Map();
  const jj = JSON.parse(fs.readFileSync(path.join(ROOT, 'journals.json'), 'utf8')).journals || [];
  for (const e of jj) {
    const aliases = e.aliases || [];
    const cands = aliases.filter((a) => a.length <= JOURNAL_MAX);
    if (!cands.length) continue;
    const pick = cands.slice().sort((a, b) =>
      (b.split(' ').length - a.split(' ').length) || (a.length - b.length))[0];
    const display = titleCaseAbbrev(pick);
    for (const k of [...aliases, e.name]) {
      const nk = normKey(k);
      if (!byAlias.has(nk)) byAlias.set(nk, display);
    }
  }

  _tables = { roster, byAlias };
  return _tables;
}

/**
 * 解析一个刊名的展示短名。
 * @returns {{short: string, via: string, ok: boolean}}
 *   via ∈ 'as-is' | 'subtitle' | 'roster' | 'journals.json' | 'unresolved'
 *   ok=false 时 short 是原值 —— 调用方必须炸掉或降级，**不要截断**：
 *   截断出来的 "Journal of NeuroEngineering and Reha" 比溢出更难发现。
 */
function shortJournal(name) {
  const raw = String(name || '').trim();
  if (!raw) return { short: '', via: 'as-is', ok: true };
  if (raw.length <= JOURNAL_MAX) return { short: raw, via: 'as-is', ok: true };

  const stripped = stripSubtitle(raw);
  const key = normKey(stripped);
  const { roster, byAlias } = tables();

  if (roster.has(key)) return { short: roster.get(key), via: 'roster', ok: true };
  if (byAlias.has(key)) return { short: byAlias.get(key), via: 'journals.json', ok: true };
  if (stripped.length <= JOURNAL_MAX) return { short: stripped, via: 'subtitle', ok: true };

  return { short: raw, via: 'unresolved', ok: false };
}

// ── 审计 CLI ────────────────────────────────────────────────────────────
function editionFiles(arg) {
  const dir = path.join(ROOT, 'briefs', 'daily');
  const all = fs.readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  if (arg === '--all') return all.map((f) => path.join(dir, f));
  if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) return [path.join(dir, `${arg}.json`)];
  return all.length ? [path.join(dir, all[all.length - 1])] : [];
}

function main() {
  const files = editionFiles(process.argv[2]);
  if (!files.length) { console.error('没有找到 briefs/daily/*.json'); process.exit(1); }

  const seen = new Map();   // journal → { n, r }
  for (const f of files) {
    if (!fs.existsSync(f)) { console.error(`不存在：${f}`); process.exit(1); }
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const sec of d.sections || []) {
      for (const it of sec.items || []) {
        const j = (it.journal || '').trim();
        if (!j) continue;
        if (!seen.has(j)) seen.set(j, { n: 0, r: shortJournal(j) });
        seen.get(j).n++;
      }
    }
  }

  const rows = [...seen.entries()].sort((a, b) => b[1].n - a[1].n);
  const bad = rows.filter(([, v]) => !v.r.ok);
  // 短名短到只剩首字母缩写时，海报上读者认不出是哪本刊。不是错误，是给人看的提醒：
  // 要改就去改 sources.json 的 name（那是全站短名，动它会连带影响文章卡片）。
  const opaque = rows.filter(([, v]) => v.r.ok && v.r.via !== 'as-is' && v.r.short.length <= 6);

  console.log(`审计 ${files.length} 期，${rows.length} 个刊名（上限 ${JOURNAL_MAX}）\n`);
  for (const [j, v] of rows) {
    if (v.r.via === 'as-is') continue;
    console.log(`  ${String(v.n).padStart(3)}×  ${String(j.length).padStart(3)}→${String(v.r.short.length).padEnd(2)} [${v.r.via}]`);
    console.log(`        ${j.slice(0, 92)}`);
    console.log(`     →  ${v.r.short}`);
  }
  if (opaque.length) {
    console.log(`\n⚠️  ${opaque.length} 个短名是裸缩写（海报上可读性存疑，要改改 sources.json 的 name）：`);
    for (const [j, v] of opaque) console.log(`     ${v.r.short.padEnd(8)} ← ${j}`);
  }
  if (bad.length) {
    console.error(`\n❌ ${bad.length} 个刊名无法解析到 ≤${JOURNAL_MAX}：`);
    for (const [j] of bad) console.error(`     ${j.length} 字符  ${j}`);
    console.error(`\n   修法：把这本刊加进 sources.json（kind:"journal" + name + journalName），`);
    console.error(`   或加进 journals.json 的 aliases。不要在渲染端截断。`);
    process.exit(1);
  }
  console.log(`\n✅ 全部可解析到 ≤${JOURNAL_MAX}`);
}

if (require.main === module) main();

module.exports = { shortJournal, normKey, stripSubtitle, JOURNAL_MAX };
