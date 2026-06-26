# 发布 Runbook — Cadence 步频

两个渠道都是 **5×/周**（国内周二–周六出刊，分别覆盖美国周一–周五；周日、周一停更，对应美国周末本就缺料）。XHS 半自动（浏览器代填到待发布），公众号纯手动（微信安全限制挡住浏览器自动化）。
两边的最后一步「发布 / 群发」都由 Cindy 本人点击——不可逆动作不交给自动化。

---

## 发布前预检（所有渠道共用）

任何渠道发布前，先校验当天这期日报数据：

```bash
npm run lint-daily            # 默认校验最新一期
npm run lint-daily 2026-06-16 # 或指定某天
```

PASS（exit 0）才继续；报错（exit 1）就停下修——它专抓发布前那类问题：研究类型误标、漏 `curatedReasonEn`、`topScore` 与实际最高分不符等。只报错不自动改，缺内容回生成 / backfill，别手凑。

---

## 小红书（XHS）— 半自动

每天产物在 `xhs/YYYY-MM-DD/`：`cover.png` + `01.png … 0N.png`（每篇一张）+ 尾页 `0(N+1).png`（标签档位说明+关注引导）+ `caption.txt`（首行=标题，其余=正文）。

平台：creator.xiaohongshu.com（桌面端支持图文发布）。首次需 Cindy 短信登录一次，cookie 保留后免登。

**代填流程（Claude 用 Chrome 扩展驱动）：**

1. 打开 `creator.xiaohongshu.com/publish/publish` → 切到「上传图文」tab
2. 找到 file input，一次性上传全部图（8 篇时共 10 张）：`cover.png` 在前，编号图依序，最后一张编号图是尾页
3. 标题 = `caption.txt` 首行，填入标题框
4. **正文 = 整段注入，不要逐字 type**：
   - 已知问题：逐字 `type` 中文会偶发字符损坏（实测「荟萃」被打成「荇萃」）。
   - 正确做法：聚焦正文 contenteditable → 全选删除 → `document.execCommand('insertText', false, body)`。
     execCommand 会触发框架能识别的 input 事件，React 状态同步且字符不丢。
5. **注入后必做错字校验**：读回 `contenteditable.innerText`，对 caption 正文逐字（或抽查易错字）比对，确认 0 差异再继续。
6. 停在「发布」按钮前，截图交 Cindy 确认 → Cindy 点发布。

话题标签 `#xxx` 以纯文本保留即可（自动化触发话题选择器易乱；纯文本话题一样可被搜索到）。

## 公众号 — 纯手动（个人订阅号，无认证 → 无草稿/发布 API）

每天 `wechat-brief.js` 产出三件套：`briefs/YYYY-MM-DD.html`（正文，纯内联样式）、`briefs/YYYY-MM-DD-cover.png`（2.35:1 封面）、`briefs/YYYY-MM-DD.meta.txt`（标题+摘要）。**助推合规（2026-06-25 起）**：正文、页脚、「阅读原文」字段一律零站外指向——不列「参考链接」URL 脚注、不挂 `incadencept.com` 外链、不写「见文末阅读原文」CTA。原因：站外链接 = 《微信公众平台推荐运营规范》5.4 导流内容，会让助推被拒（6.24 那期即如此）。文献只以信源名（PubMed 等）呈现，读者需要原文自行检索。这样每期日报都可直接拿去**助推**。

**每日 checklist：**

1. 双击打开 `briefs/当天.html`（浏览器渲染出排版）
2. `Cmd+A` → `Cmd+C` 全选复制
3. mp.weixin.qq.com 新建图文 → 正文框粘贴（内联样式保留）
4. 标题 + 摘要从 `briefs/当天.meta.txt` 复制；封面用 `briefs/当天-cover.png`
5. **「阅读原文」字段保持留空**（meta.txt 已注明）——挂任何站外链接都会破坏助推合规
6. 自己点「群发」（微信要求人工 + 扫码确认）
7. 要助推：群发后在文章「…」菜单选「助推」，正文已零导流，可正常过审

> 个人订阅号每天 1 次群发限额；5×/周（周二–周六）只用其中 5 天，周日、周一不发。
> 助推前自查：`grep -iE 'http|incadence|阅读原文' briefs/当天.md briefs/当天.html` 应无任何命中。

## X（Twitter）— 半自动（试运行）

面向海外华人 + 英文康复研究读者。内容**不另写**，由日报 `briefs/daily/YYYY-MM-DD.json` 自动转 thread，中英双份。

生成：`node scripts/x-thread.js`（默认最新日报；`node scripts/x-thread.js 2026-06-14` 指定某天；`npm run test-x` 干跑预览）。

每天产物在 `x/YYYY-MM-DD/`：`thread.zh.txt`、`thread.en.txt`（人读版，逐条带字数）+ `thread.json`（结构化）。

**thread 结构（已按 X 习惯设计）：**

- 第 1 条 = 钩子：品牌 + 日期 + 日报主标题 + 「今日 N 条更新…🧵」
- 第 2…N 条 = curatedScore 最高的若干篇（默认 5，可 `N=6 node scripts/x-thread.js`），一篇一条，**正文不放链接**。
  - 原因：X 对带外链的帖子降权，正文保持干净，链接集中到最后一条。
- 末条 = CTA：一条指向当天完整日报的站内链接（`/#daily/日期`，该页已列全部文献）。
- 附录「文献来源」块：若想逐条附 PubMed/期刊链接，可作为 **thread 第一条回复**单独贴出。

**字数**：脚本按 X 加权长度算（中日韩字符记 2，URL 记 23，上限 280），自动裁剪 takeaway（不裁标题），有任何一条超限会以非零码退出并告警。

**发布流程：**

1. 跑脚本生成当天 `x/日期/thread.zh.txt`（或 en）。
2. 打开 x.com/compose/post，把第 1 条粘进去；点「+」加下一条，逐条粘贴成 thread。
   - X 正文框是 Draft.js contenteditable，和 XHS 同一类坑：若日后做 Chrome 扩展代填，**用 `execCommand('insertText')` 整段注入，勿逐字 type 中文**（避免字符损坏），注入后读回 `innerText` 校验。
3. 想要内联文献时，把附录「文献来源」作为第一条回复。
4. 停在「Post all」前，截图交 Cindy → **Cindy 本人点发布**（不可逆动作不交自动化，与 XHS/公众号一致）。

> 配置：`SITE_URL` 默认 `https://incadencept.com`；开了账号后设 `X_HANDLE=@xxx` 会自动在 CTA 加关注引导。
> 试运行建议：先发中文版覆盖海外华人，跑一两周看数据，再决定要不要同步英文版 / 上 Chrome 半自动。

---

## 节奏

XHS + 公众号均 **5×/周**：国内周二–周六出刊，分别覆盖美国周一–周五；周日、周一停更（对应美国周六、周日，本就缺料）。取舍是「宁可降频也要每期足量足质」，不靠 backfill/擦边凑版。美国周五傍晚赶不上周六编排窗口的尾料，顺延到下周二补。
备料由 scheduled task `cadence-daily-social-prep`（cron `0 19 * * 1-5`）在美国工作日晚自动跑。
X 试运行期复用日报，同口径 5×/周（零额外内容成本）。
月度另有「深度专题」与「月度榜单」（聚合脚本待建）。
