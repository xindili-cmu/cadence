// card-headline 断言 —— 纯 node，无框架。运行：node scripts/card-headline.test.js
//
// 守的是 linkedin-daily-card.js 的头条适配不变量：**任何**标题的最终渲染
// 要么完整放进 2 行，要么带显式省略号 —— 「静默截断」是唯一被禁止的状态。
//
// 事故背景（2026-08-10 审计）：旧 headSize() 用字符数猜字号（开环），叠加
// 2 行 overflow:hidden 硬 clamp，且无任何损耗信号 —— 58 期里 34 期头条被
// 静默截断，最狠一期（2026-06-12，174 字符）丢掉大半句，当天卡片断在
// "and" 上仍像完整短语。修复 = 用 TTF hmtx 真实字形宽度做闭环换行预测
// （fitHeadline），装不下则词边界截断 + 省略号。
//
// 判别力：D 段把当天真实标题喂给旧实现的 42px 底档，断言换行模型判它
// >2 行 —— 把旧代码接回来，本文件必须变红。

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { fitHeadline, headWrap, headTextW, HEAD_LADDER } =
  require('./linkedin-daily-card.js');

const ok = (cond, msg) => { assert(cond, msg); console.log(`  ✓ ${msg}`); };

// 历史极端标题（真实 edition 数据，不是构造用例）：
const T174 = 'Randomised three-armed trial investigation of the Copenhagen Achilles tendon Rupture Treatment Algorithm (CARTA) for individualised treatment of acute Achilles tendon rupture'; // 2026-06-12，旧实现丢大半句
const T104 = 'Sportsmetrics Training for ACL Injury Risk: A Systematic Review of Biomechanical and Functional Outcomes'; // 2026-08-10，旧实现断在 "and"

console.log('A. 宽度表本身可用（fitHeadline 的测量基础）');
{
  const W = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'vendor', 'fonts-ttf', 'spectral-500-widths.json'), 'utf8'));
  ok(W._unitsPerEm > 0 && Object.keys(W.widths).length > 200,
    `spectral-500-widths.json 存在且非空（${Object.keys(W.widths).length} 字形 / upm ${W._unitsPerEm}）`);
  const missing = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 …:—()-,.'].filter(c => !(c in W.widths));
  ok(missing.length === 0,
    `头条会用到的字符都有真实宽度（缺失即回退 0.5em 估算，测量就不闭环了）`
    + (missing.length ? ` —— 缺：${JSON.stringify(missing)}` : ''));
  ok(headTextW('i', 42) < headTextW('W', 42),
    '宽度来自 hmtx 而非等宽假设（i 窄于 W）');
}

console.log('B. 核心不变量：任何输入 → 完整 2 行 ∨ 显式省略号');
{
  // 真实极端 + 构造扫描（40–220 字符，词长混合），全部必须满足不变量。
  const cases = [T174, T104];
  const words = ['Effects', 'of', 'individualised', 'rehabilitation', 'a', 'randomised', 'controlled', 'trial', 'in', 'chronic', 'musculoskeletal', 'ACL'];
  for (let len = 40; len <= 220; len += 9) {
    let t = ''; let i = 0;
    while (t.length < len) t += (t ? ' ' : '') + words[i++ % words.length];
    cases.push(t);
  }
  for (const t of cases) {
    const r = fitHeadline(t);
    assert(headWrap(r.text, r.px).length <= 2,
      `渲染文本必须 ≤2 行：len=${t.length} px=${r.px}`);
    assert(r.truncated === (r.text !== t),
      `truncated 标志必须诚实：len=${t.length}`);
    assert(!r.truncated || r.text.endsWith(' …'),
      `截断必须带显式省略号：len=${t.length}`);
    assert(HEAD_LADDER.includes(r.px),
      `字号必须在梯子上（焦点层级下限 34px > 条目标题 26px）：得到 ${r.px}`);
  }
  ok(true, `${cases.length} 个用例（2 真实极端 + 21 扫描）全部满足不变量`);
}

console.log('C. 行为锚点：已知输入的已知输出（防止梯子/常量被无意改动）');
{
  const r104 = fitHeadline(T104);
  ok(!r104.truncated && r104.px === 34,
    `2026-08-10 的 104 字符标题完整放下（34px，旧实现在 42px 丢 " Functional Outcomes"）`);
  const r174 = fitHeadline(T174);
  ok(r174.truncated && r174.px === 34 && r174.text.endsWith(' …'),
    `2026-06-12 的 174 字符标题触发显式截断（34px + …）`);
  const short = fitHeadline('Daily evidence');
  ok(!short.truncated && short.px === 60,
    '短标题拿满 60px（缩放只在需要时发生）');
}

console.log('D. 判别力：旧实现的失败在本模型下可复现');
{
  // 旧 headSize(T104)=42（len>88 一律 42px 底档）。换行模型必须判 42px 下
  // >2 行 —— 这正是当天静默截断的几何事实（预测截断点与实际 PNG 逐字一致）。
  // 若此断言失败，说明换行模型失真，上面 B/C 的绿色不可信。
  ok(headWrap(T104, 42).length > 2,
    '104 字符标题在旧 42px 底档下确实装不进 2 行（旧 bug 可复现，模型有判别力）');
}

// E. 产物断言：当天 edition 的真实头条走一遍完整路径。依赖 briefs/daily/
// 的数据状态，照 pipeline-gates.test.js F 段的约定挂 SKIP_ARTIFACT_ASSERTS。
if (process.env.SKIP_ARTIFACT_ASSERTS) {
  console.log('E. ⊘ SKIP_ARTIFACT_ASSERTS=1 —— 跳过当天 edition 头条断言');
} else {
  console.log('E. 当天 edition 的头条满足不变量');
  const DAILY = path.join(__dirname, '..', 'briefs', 'daily');
  const files = fs.readdirSync(DAILY).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const ed = JSON.parse(fs.readFileSync(path.join(DAILY, files[files.length - 1]), 'utf8'));
  const t = (ed.lead && ed.lead.titleEn) || 'Daily evidence';
  const r = fitHeadline(t);
  ok(headWrap(r.text, r.px).length <= 2 && (!r.truncated || r.text.endsWith(' …')),
    `${files[files.length - 1]}：len=${t.length} → ${r.px}px${r.truncated ? '（显式截断）' : '（完整）'}`);
}

console.log('card-headline: all green');
