# Cadence 步频 — 给 agent 的操作约束

日更的 PT / 康复文献策展。管线由 GitHub Actions 的 cron 驱动，产出发到网站、公众号、小红书、LinkedIn。
项目结构看 `README.md`，发布流程看 `PUBLISHING.md`，产品取舍看 `PRINCIPLES.md`。

本文件只写**不知道就会出事、代码里又看不出来**的东西。收录门槛：违反后对 agent 静默 ∧ 代价不可逆或难修 ∧ agent 的默认行为倾向于违反它 —— 三条全中才写。能变成断言的都已经变成断言了，见下。

---

## 先理解这个系统的失败模式

**开发的执行入口和生产的执行入口不相交。** 你在本地 `node scripts/x.js` 跑通，证明的是"代码对"；生产要的是"代码在跑" —— 那是 5 个 workflow 的 cron。两个独立事件，只有第一个会给你反馈。叠加 cron 一天一次，**这里的故障不是崩溃，是静默漂移**。

已经因此踩过 5 次：`lint-daily.js` 写好后空转两天（3 行脏数据上线）· sitemap 每天生成却漏了 `git add`（线上冻结 12 天）· journal 回落修复写好没提交（cron 连灌 5 天空 journal）· 两个断言文件写好后从没被跑过 · `npm run linkedin-card` 长期指着废弃脚本。

下面每条规则都是这个模式的一个切面。

---

## 硬约束

### 1. cron 跑的是 HEAD，不是你的工作区

代码正确、注释详尽、本地跑通 —— 只要没提交，cron 眼里它不存在。2026-08-02 的空 journal 事故就是这样：映射表对、回落代码写好了，但那次修复从没提交。

**改完管线代码，确认改动进了远端 HEAD。** 沙箱里的 `git status` 干净 ≠ 已推送。

### 2. 新写的检查要进 `npm test`，不要在 workflow 里点名脚本

`npm test` = `term-fixes.test.js` + `pipeline-gates.test.js` + `wiring.test.js`，已接进全部四个 workflow。**新增断言只要进这个 script，就自动被所有 cron 消费** —— 这是刻意设计的「默认包含、显式排除」：反过来做（在某个 workflow 里单独点名）会立刻重现上面那 5 次故障。

唯一的例外是依赖产物状态的断言，用 `SKIP_ARTIFACT_ASSERTS` 挂开关（见 `pipeline-gates.test.js` F 段）：`build-app` 由前端改动触发，走 `npm run test:code` 跳过这类断言，免得一个数据问题挡住无关的前端修复。

新增 `scripts/*.js` 必须能被 `wiring.test.js` 分类：接进 workflow、或写进 `scripts/_wiring.json`。**只加 package.json 别名不算数** —— 那是"怎么跑"，不是"谁会跑"。

### 3. 沙箱里能跑什么

- **能**：`node scripts/build-bundle.js`（纯 fs/path）、各类断言、不联网的分析脚本
- **不能**：`npm install` / `npm run build-app` —— 共享 node_modules，esbuild 的平台二进制会装成 Linux 版，坏掉 Cindy 本地的 Mac 构建。`app.min.js` 的重建交给 CI 或她本地
- **不能**：任何调 LLM API 的脚本（`backfill-*`、`rescore-consistency`、`score-calibration` 等）—— 沙箱到 API 不通。这类只能输出 bash block 让 Cindy 在自己终端跑

### 4. 生产的真值不在代码里

`news-refresh.js` 第 23 行注释说 `LLM_PROVIDER` 默认 `anthropic`，第 45 行代码写的是 `deepseek` —— **两者已经互相矛盾，而生产实际用的是第三个值**（GitHub repo 的 Variable）。

要判断线上在跑什么，看 GitHub repo 的 Variables / Secrets，别信代码默认值，更别信文件头注释。同理适用于 cron 时刻、启用的源、密钥是否配齐。

### 5. 数据文件归 cron 所有

`news.json` · `archive/` · `briefs/` · `xhs/` · `sitemap.xml` · `rss.xml` —— 这些由 workflow 每天提交。**不要手改**：你的改动会被下一次 cron 覆盖，或者在 pull 时变成冲突。

拉取冲突用 `git pull --no-rebase`（干净地合进 cron 的 feed）。需要修历史数据就写幂等脚本（照 `fix-title-artifacts.js` 的样子），让 Cindy 本地跑，别手工编辑 JSON。

### 6. 展示档 ≠ 打分 rubric，别"统一"它们

展示分三档 **85 / 75 / 65**（`curatedScore`，读者看到的），策展 prompt 里的 rubric 仍是 **90 / 80**。数字不一致是 2026-07-01 的决策，不是 bug —— 顶档「90+ 可改变实践」恒空，所以展示档下移，但打分标准不动。

`SignalScore.jsx` 第 4 行写着 `do NOT re-unify with the cron rubric`。看到两处数字对不上时，默认动作不该是抹平它。

**要改档位的话：阈值硬编在多个文件里，形态还各不相同**——比较式 `s >= 85`、字面量 `'85+'`、区间串 `'75-84'`、注释 `≥85`。动手前先自己找一遍：

```bash
rg -n "(>=|≥) ?85|'85\+'|75-84|75–84" scripts/ design-system/components/
```

这里不列文件清单，因为清单会过期——写这份文档时我凭印象列了 5 个文件，grep 一跑发现是 7 个。2026-07-01 那次改档位就漏了一半，补救提交的标题直接叫 `ship the other half of shipped decisions`。目前没有断言守这条一致性。

### 7. UI 的真源是 `design-system/components/**`

`design-system/app/components.bundle.jsx` 和 `app.min.js` 都是生成物，第 1 行就写着 AUTO-GENERATED —— 但用 grep 定位再直接编辑时看不见那一行。改了生成物会被下一次重建静默覆盖。

改组件后跑 `node scripts/build-bundle.js`（纯 node，不用装依赖）。`build-app.yml` 会拦截"只改了 bundle 没改源"的推送。

### 8. 不可逆的动作交给人

**发布 / 群发 / 发送订阅邮件的最后一步永远是 Cindy 点。** agent 做到发布前一步就停：小红书传图填 caption 停在发布键、公众号排版好停在群发前、LinkedIn 注入正文传图停在 Post。

同理适用于任何撤不回的操作：删数据、改线上配置、动付费/账号设置。

---

## 真值在哪

| 要找什么 | 看哪里 |
|---|---|
| 项目结构 / 各脚本干什么 | `README.md` |
| 谁在跑某个脚本 | `scripts/_wiring.json` |
| 发布流程与渠道癖好 | `PUBLISHING.md` |
| 产品取舍 / 止损锚点 | `PRINCIPLES.md` · `STRATEGY-US.md` · `DECISIONS-pending.md` |
| 线上实际配置 | GitHub repo 的 Variables / Secrets（不是代码默认值） |
| 期刊白名单（PubMed `[ta]` 闸门） | `journals.json` |
| 入库不变量与已修故障 | `scripts/pipeline-gates.test.js` 的注释 |

---

## 维护这个文件

每条都带了触发它的事故和日期，**可追溯、可证伪**。规则腐烂比没有规则更糟，因为它自信地错。

- 只写指针和不变量，**不写值** —— 值会漂移（见第 4 条那个三方矛盾的反面教材）
- 一条规则被违反时，先问"为什么它没生效"，通常是位置不对或写得不可判定。**加 ⚠️、加"必须"、加粗是最无效的修复**：稀释了其他条目，拦截率几乎不变
- 能变成断言的就去写断言，这里只留机器管不了的。第 6 条一旦有了断言，就该从这里删掉
- 定期问每条"过去三个月它拦住过什么" —— 答不上来就删
