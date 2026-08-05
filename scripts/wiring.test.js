// wiring 检查 —— 纯 node，无框架。运行：node scripts/wiring.test.js
//
// 守的不是「没有孤儿脚本」——那个不变量是假的：42 个脚本里 23 个没有仓库内的
// 引用，而其中绝大多数（backfill-* 之类）本来就该是一次性的。55% 的违反率说明
// 规则本身错了，不是数据错了。
//
// 真正的不变量是「**没有未分类的脚本**」：每个脚本必须属于三类之一 ——
//   1. 已接线：被 workflow / package.json / 其他脚本 require（检查自己看得见）
//   2. 外部驱动：消费者在仓库外（Cowork 定时任务、Cindy 手动），登记在 _wiring.json
//   3. 一次性：数据修复 / 诊断 / 实验，登记在 _wiring.json 或命中豁免前缀
//
// 价值不在「检测出孤儿」，在于**逼你在脚本出生的那一刻做一次分类**。lint-daily
// 那次（07-26 写好、07-28 才接 CI，3 行 raw-scrape 静默上线）会被这条抓住，不是
// 因为「孤儿=坏」，而是作者得把它写进 oneoff，写的时候就会发现「等等，这不是
// 一次性的，这是每天该跑的门禁」。强制决策，而不是强制接线。
//
// 副产品比主产品值钱：第 2 类的登记把「谁在跑这个脚本」从某人脑子里搬进了仓库。
// 而执行路径不可见，正是「写好了但没接上」这整类故障的根因。
//
// 已知局限：只认直接引用，不做传递可达性。A 被一次性脚本 require、而没有任何
// 常驻入口能到达 A，这种情况查不出来。够用，因为主要价值在出生时的强制分类。

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WF = path.join(ROOT, '.github', 'workflows');

// 一次性前缀：约定已确立，新增同类不必逐个登记。刻意只放这两个 ——
// 前缀豁免是「静默放行未来的文件」，滥用会重现本检查要防的故障。
const EXEMPT_PREFIX = [/^backfill-/, /^try-/];

let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); console.log(`  ✓ ${msg}`); passed++; };

function run() {
  const wiring = JSON.parse(fs.readFileSync(path.join(__dirname, '_wiring.json'), 'utf8'));
  const declared = new Set([
    ...Object.keys(wiring.external || {}),
    ...Object.keys(wiring.oneoff || {}),
  ].filter((k) => k !== '_note'));

  // 检查自己看得见的引用面：workflow 里的 `scripts/x.js`、package.json 的 script、
  // 以及脚本之间的 require('./x')。刻意用精确 pattern 而不是「文件名出现过」——
  // 把注释里的一句「见 xxx.js」误判成已接线，正是本检查最危险的失效方向。
  const wfText = fs.existsSync(WF)
    ? fs.readdirSync(WF).map((f) => fs.readFileSync(path.join(WF, f), 'utf8')).join('\n')
    : '';
  const pkgText = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
  const scriptFiles = fs.readdirSync(__dirname).filter((f) => /\.(js|sh)$/.test(f));
  const srcText = scriptFiles
    .map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8'))
    .join('\n');

  // package.json 的别名**不算**已接线。`npm run x` 只说明「怎么跑」，不说明
  // 「谁会跑」——而这整类故障的定义就是没有任何东西真的跑它。lint-daily 那次正是
  // 如此：脚本在、npm 别名在、就是没有 CI 调用它，于是 3 行脏数据静默上线。把别名
  // 当成消费者，会让本检查在它最该报警的那一刻保持绿色。
  const isWired = (file) => {
    const bare = file.replace(/\.(js|sh)$/, '');
    const esc = bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`scripts/${esc}\\.(js|sh)`).test(wfText)
        || new RegExp(`require\\(['"]\\./${esc}(\\.js)?['"]`).test(srcText);
  };
  void pkgText; // 见上：故意不参与 isWired 判定

  console.log('A. 每个脚本都有归属（已接线 / 外部驱动 / 一次性）');
  {
    const unclassified = scriptFiles
      .filter((f) => !/\.test\.js$/.test(f))          // 测试文件由 npm test 直接点名
      .filter((f) => !EXEMPT_PREFIX.some((re) => re.test(f)))
      .filter((f) => !declared.has(f))
      .filter((f) => !isWired(f));

    ok(unclassified.length === 0,
      `scripts/ 下 ${scriptFiles.length} 个脚本没有未分类的`
      + (unclassified.length
        ? ` —— 未登记 ${unclassified.length} 个：${unclassified.join(', ')}\n`
          + `      谁会跑它？接进某个 .github/workflow，或写进 scripts/_wiring.json 的 external/oneoff。\n`
          + `      注意：只加 package.json 别名不算数 —— 那是「怎么跑」，不是「谁会跑」。`
        : ''));
  }

  console.log('B. 登记表本身不腐烂');
  {
    // 登记了但文件没了 → 表在说谎，删条目。
    const ghosts = [...declared].filter((f) => !scriptFiles.includes(f));
    ok(ghosts.length === 0,
      `_wiring.json 里每条都对应一个真实文件`
      + (ghosts.length ? ` —— 文件已不存在：${ghosts.join(', ')}` : ''));

    // 登记成一次性、却已经被接进 workflow → 分类过期，该挪出去。放任不管的话，
    // 这张表会慢慢变成「一份谁也不信的旧名单」，那时它比不存在更糟。
    const stale = Object.keys(wiring.oneoff || {})
      .filter((k) => k !== '_note')
      .filter((f) => isWired(f));
    ok(stale.length === 0,
      `oneoff 里没有其实已经接线的条目`
      + (stale.length ? ` —— 已被引用，请移出 oneoff：${stale.join(', ')}` : ''));

    // 前缀豁免不该被用来绕过登记：命中豁免前缀却又登记了，说明约定和表在打架。
    const both = [...declared].filter((f) => EXEMPT_PREFIX.some((re) => re.test(f)));
    ok(both.length === 0,
      `没有既命中豁免前缀、又重复登记的条目`
      + (both.length ? ` —— 重复：${both.join(', ')}` : ''));
  }

  console.log(`\n✅ all ${passed} assertions passed`);
}

try { run(); } catch (e) { console.error('\n❌ FAIL:', e.message); process.exit(1); }
