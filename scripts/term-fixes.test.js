// term-fixes 测试 —— 纯 node，无框架。运行：npm test  或  node scripts/term-fixes.test.js
//
// 重点不是「替换能跑」，而是「判别力」：测试里故意放了旧白名单实现会漏掉的字段
// （noteZh 不在旧 TEXT_FIELDS 里；members[].summaryZh 比旧手写的 members 处理更深一层）。
// 旧实现在这些字段上 fail、新递归实现 pass —— 这才证明递归确实买到了东西。
// 集成段走真实 curateWithClaude（注入 llm stub，无网络），覆盖 `curated.map(fixItem)` 接线。

const assert = require('assert');
const { fixItem, applyTermFixes } = require('./term-fixes');

const WRONG = '胕绳肌';
const RIGHT = '腘绳肌';
let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); console.log('  ✓', msg); passed++; };

// 一条「脏」curated item：每个内容字段都含错字，url 也含错字（应被保护、不替换）。
// 每次调用返回全新对象，避免用例间互相污染。
const makeDirty = () => ({
  curatedScore: 85,
  curatedReason: `这项${WRONG}系统综述给出重返运动标准`,   // 旧白名单字段（基线）
  titleZh: `近端${WRONG}撕脱伤康复`,                       // 旧白名单字段（基线）
  noteZh: `${WRONG}补充说明`,                              // ★判别：不在旧 TEXT_FIELDS
  url: `https://example.com/${WRONG}-path`,               // ★SKIP：标识符，必须保留
  members: [
    { source: 'x', title: 'hamstring RTS', titleZh: `${WRONG}研究`, summaryZh: `深层${WRONG}摘要` },
    //                                       旧能修 ↑                ★判别：嵌套更深一层 ↑
  ],
});

// 旧白名单实现的精确复刻 —— 仅用于「证明本测试有判别力」。
const OLD_TEXT_FIELDS = ['title', 'titleZh', 'titleEn', 'summary', 'summaryZh',
  'curatedReason', 'curatedReasonEn', 'limitation', 'limitationEn'];
function oldWhitelistFix(item) {
  for (const f of OLD_TEXT_FIELDS) if (f in item) item[f] = applyTermFixes(item[f]);
  if (Array.isArray(item.members)) item.members.forEach((m) => {
    if (m && typeof m === 'object') {
      if ('title' in m) m.title = applyTermFixes(m.title);
      if ('titleZh' in m) m.titleZh = applyTermFixes(m.titleZh);
    }
  });
  return item;
}

(async () => {
  console.log('A. 单元：applyTermFixes / fixItem 递归 / SKIP');
  ok(applyTermFixes(`${WRONG}损伤`) === `${RIGHT}损伤`, 'applyTermFixes 替换字符串');
  ok(applyTermFixes(42) === 42, 'applyTermFixes 非字符串原样');
  {
    const d = makeDirty();
    fixItem(d);
    ok(!d.curatedReason.includes(WRONG), 'fixItem 清理 curatedReason');
    ok(!d.titleZh.includes(WRONG), 'fixItem 清理 titleZh');
    ok(!d.noteZh.includes(WRONG), 'fixItem 清理 noteZh（白名单外字段）');
    ok(!d.members[0].titleZh.includes(WRONG), 'fixItem 清理 members[].titleZh');
    ok(!d.members[0].summaryZh.includes(WRONG), 'fixItem 清理 members[].summaryZh（更深一层）');
    ok(d.url.includes(WRONG), 'fixItem 保留 url（SKIP 标识符）');
    ok(d.curatedScore === 85, 'fixItem 不动 number');
  }

  console.log('B. 判别力：旧白名单实现必须在这些字段上 fail');
  {
    const old = makeDirty();
    oldWhitelistFix(old);
    ok(old.noteZh.includes(WRONG), '旧实现漏掉 noteZh（证明用例有判别力）');
    ok(old.members[0].summaryZh.includes(WRONG), '旧实现漏掉 members[].summaryZh（证明用例有判别力）');
  }

  console.log('C. 集成：真实 curateWithClaude 走 fixItem 接线（注入 llm stub，无网络）');
  {
    const { curateWithClaude } = require('./news-refresh');
    const mockJSON = JSON.stringify([makeDirty()]);          // 模型返回的脏 JSON
    const rawItems = [{ title: 'Hamstring RTS', text: 'x', category: 'orthopedic', source: 'x', url: 'https://e.com/a', publishedDate: '2026-06-27' }];
    const out = await curateWithClaude(rawItems, async () => mockJSON); // 注入 stub
    assert.ok(Array.isArray(out) && out.length === 1, 'curateWithClaude 返回 1 条');
    const c = out[0];
    ok(!c.curatedReason.includes(WRONG), '接线后 curatedReason 干净');
    ok(!c.noteZh.includes(WRONG), '接线后 noteZh 干净（白名单外）');
    ok(!c.members[0].summaryZh.includes(WRONG), '接线后 members[].summaryZh 干净（嵌套）');
    ok(c.url.includes(WRONG), '接线后 url 保留');
    // 内容字段（排除受保护的 url）整体 0 处错字
    const { url, ...content } = c;
    ok(!JSON.stringify(content).includes(WRONG), '接线后内容字段整体 0 处错字');
  }

  console.log(`\n✅ all ${passed} assertions passed`);
})().catch((e) => { console.error('\n❌ FAIL:', e.message); process.exit(1); });
