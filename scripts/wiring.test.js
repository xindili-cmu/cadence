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

    // 上面豁免 *.test.js 的理由是「由 npm test 直接点名」—— 这里闭环验证这个
    // 理由本身，否则豁免就是个洞：「两个断言文件写好后从没被跑过」正是本仓库
    // 五次「写好没接上」事故之一。npm test 已接进全部 workflow，所以「被 test
    // script 点名」对测试文件而言就是「已接线」。
    const testFiles = scriptFiles.filter((f) => /\.test\.js$/.test(f));
    const testScript = (JSON.parse(pkgText).scripts || {}).test || '';
    const unnamed = testFiles.filter((f) => !testScript.includes(`scripts/${f}`));
    ok(unnamed.length === 0,
      `每个 *.test.js 都被 npm test 点名（${testFiles.length} 个）`
      + (unnamed.length ? ` —— 漏掉：${unnamed.join(', ')}，加进 package.json 的 test script` : ''));
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

  // 同一个不变量换个族群：scripts/ 靠 workflow 与 _wiring.json 接线，UI 组件靠
  // build-bundle.js 的 FILES 清单接线。写了个组件却没写进清单 —— 构建成功、
  // npm test 全绿、页面上就是没有那个东西。
  //
  // build-bundle.js 是**纯拼接**不是打包器：它按 FILES 顺序读文件、剥掉所有
  // import 行、首尾相接。两个后果决定了下面断言什么：
  //   · 不在 FILES 里的文件根本不存在于产物中（→ C1）
  //   · 符号能不能用完全取决于顺序，依赖必须排在使用者前面（→ C3）
  console.log('C. UI 组件都接进了 bundle 清单');
  {
    const DS = path.join(ROOT, 'design-system');
    const CMP = path.join(DS, 'components');

    // FILES 是 build-bundle.js 里的字面量数组，直接解析源码而不是 require —— 那个
    // 脚本一被 require 就会执行并覆写 bundle。
    const bundleSrc = fs.readFileSync(path.join(__dirname, 'build-bundle.js'), 'utf8');
    const FILES = bundleSrc.match(/const FILES = \[([\s\S]*?)\];/)[1]
      .split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    const idx = new Map(FILES.map((f, i) => [f, i]));

    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    // .d.ts 是类型声明，不参与拼接，排除。
    const onDisk = walk(CMP)
      .filter((f) => /\.(jsx|js)$/.test(f) && !f.endsWith('.d.ts'))
      .map((f) => path.relative(DS, f).split(path.sep).join('/'));

    // C1：磁盘上的组件必须在清单里。反过来（清单指向不存在的文件）不用断言 ——
    // build-bundle.js 的 readFileSync 会直接抛，而删组件正好命中 build-app 的触发
    // 路径，CI 当场就红。这里仍加一条，只为把 ENOENT 堆栈换成人话。
    const missing = onDisk.filter((f) => !idx.has(f));
    ok(missing.length === 0,
      `components/ 下 ${onDisk.length} 个组件都在 build-bundle.js 的 FILES 里`
      + (missing.length ? ` —— 漏了 ${missing.length} 个：${missing.join(', ')}（不加进 FILES 就永远不会出现在页面上）` : ''));

    const ghosts = FILES.filter((f) => !fs.existsSync(path.join(DS, f)));
    ok(ghosts.length === 0,
      `FILES 里每条都存在于磁盘`
      + (ghosts.length ? ` —— 文件已不存在：${ghosts.join(', ')}` : ''));

    // C3：import 行会被剥掉，所以依赖必须先于使用者出现，否则拼出来的 bundle 语法
    // 合法、esbuild 不报错、CI 全绿，而读者打开网站是白屏（TDZ）。对 CI 静默、对
    // 读者响 —— 正是要守的那一类。
    // 只断言「依赖在前」，不断言「顺序完全正确」：同层组件谁先谁后无所谓，不可判定。
    const badOrder = [];
    for (const f of FILES) {
      const src = fs.readFileSync(path.join(DS, f), 'utf8');
      for (const m of src.matchAll(/^import\s.*?\sfrom\s+['"](\.[^'"]+)['"]/gm)) {
        const dep = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1]));
        if (!idx.has(dep)) badOrder.push(`${f} 依赖 ${dep}，但它不在 FILES 里`);
        else if (idx.get(dep) > idx.get(f)) badOrder.push(`${f}(#${idx.get(f)}) 依赖 ${dep}(#${idx.get(dep)})，依赖排在后面了`);
      }
    }
    ok(badOrder.length === 0,
      `FILES 的顺序满足依赖在前`
      + (badOrder.length ? ` —— ${badOrder.join('；')}` : ''));
  }

  console.log(`\n✅ all ${passed} assertions passed`);
}

try { run(); } catch (e) { console.error('\n❌ FAIL:', e.message); process.exit(1); }
