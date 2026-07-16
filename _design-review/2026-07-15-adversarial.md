# 对抗式审查 — 2026-07-15

线上(incadencept.com,zh/EN 双版)+ 代码双向审查。以陌生访客、专业读者、红队三视角审。
提交:`90f4123`(前端 bundle 由 CI 在其后自动重建)。

审查范围:定位与价值主张、内容可信度与打分、UX 与转化、技术与 SEO、机制层(代码对照)。

---

## 发现与处置一览

| # | 严重度 | 问题 | 处置 | 状态 |
|---|---|---|---|---|
| 1 | 高 | EN 版今日头条标题是爬取残留「Read more about …」(CMS newsroom 用锚文本当标题),AI Briefing 原样引用 | `normalizeTitle` 加前缀剥离 + 一次性修历史 9 条 | 已修 |
| 2 | 高 | SIGNAL 假精度:0–100 实为 5 分一档的三档制,首页三条并列 85 排序失效 | 呈现层去 /100、档位主导;About 口径改为如实三档(不动 rubric) | 已修 |
| 3 | 高 | 每日简报页搜索静默失效(改 URL 不改页面) | 输入时自动跳 All stories 带 q | 已修 |
| 4 | 高 | 404 是裸错误页(wrangler 配了 404-page 但无文件) | 新建双语品牌 404.html | 已修 |
| 5 | 中 | 订阅流程无隐私说明(邮箱经 Formspree→Resend) | 订阅卡两处 + About 加隐私文案 | 已修 |
| 6 | 中 | EN 版一致性破口:简报头 practice 混排、tab 标题硬编码中文品牌、og alt 中文 | practice→行业与执业、title 按 lang、worker EN alt 英文化 | 已修 |
| 7 | 中 | 「为什么重要」空话漏网(IOC 那条违反 About 承诺) | slop 正则强化,覆盖两个 IOC 变体 | 已修(管线);历史待 backfill |
| 8 | 中 | archive 跨月重复 78 组(前端/sitemap 各自兜底) | 一次性去重 + 追加跨月守卫 | 已修 |
| 9 | 低 | 3 个信源 logo 近白不可见 | 删除 + 字母兜底 + fetch 脚本 skip 名单 | 已修 |
| 10 | 低 | hash 路由不可索引;每日简报分享只有通用卡 | worker 加 ?daily= permalink + 进 sitemap | 已修 |
| 11 | 低 | 移动端布局这轮未测(工具限制),流量大头是微信/小红书 webview | 建议真机过一遍 | 待你验 |
| 12 | 备注 | 审查时本地落后 origin 44 commit | 已 pull 对齐后开工 | — |

---

## 改动文件

**数据卫生**
- `scripts/news-refresh.js` — `normalizeTitle` 剥离 "Read more about/：" 前缀;archive 追加改为跨全月去重(原只查当月);slop 正则强化 + 导出 `isReasonSlop` 作单一检测源
- `scripts/fix-title-artifacts.js`(新) — 幂等一次性修复:清历史标题前缀 + 删 archive 跨月重复,重建 index.json
- `news.json` / `archive/2026-06.json` / `archive/2026-07.json` / `archive/index.json` — 修复结果

**前端(真源,CI 重建 bundle)**
- `design-system/components/feed/SignalScore.jsx` — 去 /100,档位词主导;tip 去「0–100」
- `design-system/app/app.main.jsx` — 简报搜索跳转、document.title 按 lang、practice 标签补全、SIGNAL/About 档位口径、订阅卡+About 隐私文案、?daily= 真 URL 引导进 hash、logo 兜底(SourceFavicon 已有,近白 logo 走此路)
- `design-system/app/app.data.jsx` — SIGNAL 帮助文案、About step 文案改档位口径、sub.privacy 串(zh/en)

**worker / SEO**
- `worker.js` — 新增 ?daily=YYYY-MM-DD permalink head 改写;EN 分享卡 og:image:alt 英文化;抽出 `rewriteHead` 复用
- `404.html`(新) — 自包含双语页,无 app JS 依赖
- `scripts/build-sitemap.js` — 收录每日简报 permalink

**其他**
- `scripts/fetch-favicons.js` — NEAR_WHITE skip 名单 + 清理旧文件
- `scripts/backfill-reasons.js` — 复用 `isReasonSlop`,消除重复正则漂移
- 删除:`link.springer.com.png` / `content.iospress.com.png` / `medrxiv.org.png`(近白 logo)

---

## 决策记录(你拍板的)

- SIGNAL:去 /100、档位主导(不动打分 rubric,遵 7-10「分数区分度不改」决定)
- 分享图:只修 EN alt 文案,不做 per-item 卡
- 订阅合规:加隐私说明文案,暂不做 double opt-in
- hash 路由 SEO:worker 支持日报 permalink(不做全面真路径改造)

## 未决 / 待办

- **历史空话 backfill**:`backfill-reasons.js` 命中 news.json 3 条 / archive 195 条。需 LLM key、只能本地终端跑。建议先只洗 news.json,archive churn 较大自行权衡。
- **移动端**:本轮工具未覆盖,建议微信/小红书 webview 真机验。
- **CI 后线上抽验**:SIGNAL 无 /100、简报搜索跳转、品牌 404、?daily= 直开。

## 验证

- `npm test`(term-fixes)16/16 通过
- 全部 JS/JSON 语法校验通过;`fix-title-artifacts.js` 幂等自检干净(二次 dry-run 0 改动)
- 构建产物(app.min.js / components.bundle.jsx)交 CI,未在沙箱跑 esbuild

---

## 07-16 追加(初版上线后的后续发现)

| # | 严重度 | 问题 | 处置 | 提交 |
|---|---|---|---|---|
| 13 | 高(回归) | B4 重构删掉局部 `isSlop` 定义,漏改 `repairBoilerplateReasons` 末尾一处引用 → 下次 cron 洗空话时 ReferenceError,整条每日刷新崩 | 末尾引用改 `isReasonSlop` | `bfb4f69` |
| 14 | 中 | 同分排序次级键是 `publishedAt`(仅到日,当天条目全 T00:00:00Z)→ 同分同天退化成不稳定数组序,首页三条 85「看着没排序」 | `bySignal` 次级键改 firstSeen(ms)→ publishedAt → id,完全确定 | `ad7c29a` |
| 15 | 中 | AI 速读把最高分论文的完整长标题原样嵌进句子,标题与概览糊成一坨、论文尾句号渗进分数后缀 | 标题加引号 + 去尾句号 + 截断(zh 22 字/en 10 词) | 待 |
| 16 | 低 | rail 头条(app.shell.jsx top)同分次级键仍 `publishedAt`,与 `bySignal` 漂移,可能 rail 头条 ≠ 精选头条 | 对齐成 firstSeen → publishedAt → id | 待(同 15) |
| 17 | 中 | 精选/All 页顶部「Signal score」是**死按钮**(有排序图标却没绑点击,伪装成可选);且它旁边的 info-i 与下方信号滑块的 i 重复(同一段说明) | 改成真的「信号分 ⇄ 最新收录」切换(?sort=recent 可 deep-link,All 视图 recent 时按收录日分组);去掉重复的 i,只留滑块那个 | 待 |
| — | 呈现 | 档位词加到列表卡 badge 上太长 | badge 去档位词,只留 hero block | 已修 |

### 教训 / 流程改进

- **`isSlop` 回归的根因**:改脚本时只做 `node --check`(语法)不够,它抓不到「引用已删除标识符」这类运行期错误。`news-refresh.js` 这类 cron 核心脚本,改后应 `DRY_RUN=true node scripts/news-refresh.js` 实跑一遍确认整条链通。
- **单一定义原则的收益**:`isReasonSlop` 导出后 backfill 复用,消除了重复正则漂移;但重构「收敛为单一定义」的过程本身要把所有旧引用点找全(这次就漏了一处)。

### 仍未做(需你 / 另开一轮)

- 历史 archive 空话 backfill(news.json 已由 Cindy `ded28fe` 洗净;archive ~195 条可选,建议不管)
- 移动端真机验(微信/小红书 webview)
- 未审角落:无障碍/键盘可达性、加载性能(app.min.js ~182KB + embeddings.json + vendor)
