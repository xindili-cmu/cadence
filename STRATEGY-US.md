# 美国市场策略页

> 一页纸,过期即改。决策:**双市场并行**(Cindy 2026-07-02)——大陆(公众号/小红书)照旧,美国作为第二增长曲线认真投入。
> 本页与 PRINCIPLES.md 并读;冲突时以 PRINCIPLES.md 的底线(人来收尾/发布由人/不反噬产品)为准。

---

## 1. 核心结论

**美国侧几乎零新增内容成本。** 策展管线、SIGNAL 打分、英文字段(title/summary/curatedReasonEn)、英文界面(浏览器语言自动切换)全部已存在——差异只在**分发层**:美国 PT 活在 email 和 LinkedIn 里,不在公众号里。所以打法是 email-first + SEO 长尾,不是做第二个产品。

## 2. 市场事实(2026-07 检索)

- 美国持照 PT 约 **60 万**(FSBPT 2024 census:602,095;2025 预估 62 万+),BLS 预测 2024–34 就业 +11%。
- "跟上文献"是被验证的付费级痛点:付费产品活得很好(见下表)。
- 行业信息习惯:APTA 会员靠 Friday Focus / APTA Weekly 等**邮件通讯** + PTJ/JOSPT 期刊权益——email 是这个人群的原生媒介。

## 3. 竞品与空位

| 产品 | 价格 | 节奏 | 形态 |
|---|---|---|---|
| Physio Network Research Reviews | $119/年 | 12 篇/月 | 专家人写深评 + CEU + 音频,1000+ 库 |
| Physiotutors 会员 | €149.99/年 | 月度 reviews | 教育平台(课程/masterclass/AI 助手) |
| PT Crab | 免费 | 周更 | 单人手写摘要,"15 分钟读完" |
| APTA 官方通讯 | 会员权益 | 周更 | 协会新闻 + 期刊入口 |

**空位:免费 × 每日 × 全刊扫描 × 可操作评分。** 付费位被"专家人写深评+CEU"占住;免费位只有 PT Crab(周更、单人产能、无评分、无库)。Cadence 的组合——39 本白名单期刊每日扫描、SIGNAL 分、每篇一句 "why it matters"、全库可搜可链——在免费区间没有直接对手。

**诚实的劣势**(对抗式自查):
- **无 CEU**——美国 PT 为竞品付费的主要动机是 CEU 学分,我们不做(合规成本高),所以只能打"免费+每日"而非替代付费产品;
- **AI 信任门槛**——竞品的信任来源是署名专家,我们的是透明方法页(已上线)+ 人工把关的推送,需要时间积累;
- **品牌零认知**——冷启动全靠内容质量和渠道执行。

## 4. 定位一句话

> **Your daily signal from 39 rehab journals — free, scored, honest about its limits.**

对比锚:比 PubMed alert 会筛,比 PT Crab 快且全,比 Physio Network 免费——不承诺替代深评,承诺"5 分钟不漏重要的"。

## 5. 渠道优先级(前 4–6 周)

1. **EN 邮件周报**(本次上线)——Weekly Signal 英文版,复用中文版管线,独立 Resend segment,发布仍由人点;
2. **LinkedIn daily**(已有 Mon–Fri cron)——分享链接改带 `&lang=en` 的 permalink,承接到英文详情页;
3. **SEO 长尾**——313 条 permalink 已提交 GSC;worker og 按 `lang` 参数出英文卡(本次上线);长尾词形态 "\<condition\> physical therapy evidence";
4. **社区试水**(手动、低频)——Reddit r/physicaltherapy、X;每周 ≤2 次,只发单篇高分文献 permalink + 一句 takeaway,守 PRINCIPLES(发布由人、不 spam)。

## 6. 资源规则与止损锚点

- 内容管线 100% 共用,5×/周节奏不变,大陆北极星指标不变;
- 美国侧独立锚点(6 周内):**EN 邮件订阅 ≥50,或单期打开率 ≥40%,或 GSC 英文长尾展示出现明确爬升**;三项全不达标 → 美国侧降级为 SEO-only 被动增长,人力撤回主线。

## 7. Practice Intel lane(spec,暂不建)

之前的对抗式审查结论:美国行业/支付新闻(CMS、APTA 政策、payer 动态)对美国 PT 有价值,但 SIGNAL rubric 量不了新闻——混进证据流是范畴错误。若做,形态必须是:

- `item.lane = 'intel'`,news-refresh 独立 leg 抓取;源:CMS/APTA(已在)+ AJMC/Modern Healthcare(重新接入但**只进 intel**);
- **不参与 SIGNAL 打分**,UI 上独立栏目或 EN 周报附录一节,永不进 Curated 主 feed;
- **触发条件:先验证再建**——EN 邮件跑 4 周后,若订阅者点击/回复表现出对 payment/policy 内容的需求,再动工。不预建。

## 8. 风险

- **主线分散**(PRINCIPLES: keep the main thing)→ 用第 6 节锚点强制止损;
- **口径毛边**:sources.json 恰好 50 个,宣传写 "50+" → 改文案为 "50" 或补 1–2 个真实源;
- **EN 邮件冷启动**:目前订阅者以中文用户为主,EN segment 从零开始——预期前几期个位数,别被吓到。

---

*Sources: [FSBPT 2025 Census](https://www.fsbpt.org/Portals/0/documents/2025%20for%20FSBPT%20Census%20of%20Licensed%20PTs%20and%20PTAs%20in%20the%20USA.pdf) · [BLS OOH: Physical Therapists](https://www.bls.gov/ooh/healthcare/physical-therapists.htm) · [Physio Network Research Reviews](https://www.physio-network.com/research-reviews/) · [Physiotutors Membership](https://www.physiotutors.com/membership/) · [PT Crab](https://ptcrab.org/) · [APTA News & Publications](https://www.apta.org/apta-and-you/news-publications)*
