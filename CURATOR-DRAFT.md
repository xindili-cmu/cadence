# Curator 署名层初稿

> 定位:不是新页面,是 About 页的署名升级——把现有「Why I built this」从匿名第一人称变成署名的 curator 区块,并把「人工把关」从一句话变成可检验的承诺。
> 文案键名按现有 CD_DICT 模式起为 `curator.*`,zh/en 分开,方便直接接入 app.data.jsx。
> 所有 **[待填]** 处没有依据,需 Cindy 本人补充,未擅自编造。事实性内容(PT 本科/两年临床/转数据/2026-06 建站)全部取自站上已公开的 about.why 文案。

---

## 对抗性一致点(动手前先拍)

1. **「我和团队」vs 匿名落款。** about.why.p3 写"我和团队一起做了步频",落款却是"— 步频团队"。若实际是一人项目,"团队"表述在署名后会变成可被戳破的点——建议改为署名第一人称("我做了步频,AI 是我的管线,把关的是我"),这比虚指的"团队"更可信,也更符合去 AI 感原则。若确有他人参与:**[待确认]**。
2. **资历只写真的。** 下面凡涉及资质的句子只复述站上已有内容;执照/学位/机构名等一律 [待填],宁可短,不包装。

---

## 新增区块 §01.5「谁在把关」(插在 Why I built this 之后、方法之前)

### zh

**`curator.title`**
> 谁在把关

**`curator.name`**
> **[待填:署名,如 Cindy Li / 中文名]** — 步频创办人、每日策展人

**`curator.bio`**
> 物理治疗本科,两年临床,后转做数据。**[待填:可选补充一句——学位/执照/现所在机构,没有就删]** 步频的抓取和评分由机器完成,但每一期对外推送的选稿、标题和摘要,由我审定后才发出。

**`curator.promise.title`**
> 我的把关具体做什么

**`curator.promise.body`**
> 每个发布日,我在推送前过一遍当期全部条目:摘要是否忠实原文、评分是否明显失当、有没有混进无关内容。发现问题就改或撤,改不完就晚发。步频可以出错,但不会没人负责——每一期都有我的名字。

**`curator.limits.title`**
> 我不承诺什么

**`curator.limits.body`**
> 我不逐篇精读全文——那是深评产品(收费的那种)做的事,步频承诺的是"5 分钟不漏重要的",不是替代你读文献。评分模型的局限写在下方「评分方法与局限」,我不替它辩护。

**`curator.sign`**
> — [待填:署名],步频

### en

**`curator.title`**
> Who's accountable

**`curator.name`**
> **[待填]** — Founder & daily curator, Cadence

**`curator.bio`**
> Trained as a physical therapist, two years in the clinic, then moved into data. **[待填:optional one-line credential]** Machines do the crawling and scoring at Cadence — but every issue that goes out is selected, titled, and reviewed by me before it ships.

**`curator.promise.title`**
> What my review actually covers

**`curator.promise.body`**
> On every publishing day, before anything goes out, I go through the full issue: are the summaries faithful to the source, are any scores obviously off, has anything off-topic slipped in. If something's wrong I fix it or pull it; if I can't fix it in time, the issue ships late. Cadence can be wrong — but never unaccountable. Every issue carries my name.

**`curator.limits.title`**
> What I don't promise

**`curator.limits.body`**
> I don't deep-read every paper — that's what paid expert-review products are for. Cadence promises you won't miss what matters in five minutes; it doesn't replace reading the research. The scoring model's limits are documented below, and I won't defend it past them.

**`curator.sign`**
> — [待填], Cadence

---

## 连带改动(同批,小)

1. **about.why 落款**:"— 步频团队 / The Cadence team" → 署名(同 `curator.sign`)。
2. **about.why.p3**:"我和团队一起做了步频" → 按上面对抗性一致点 1 的拍板结果改。
3. **about.how.3**:"经人工审定后发出" 句末可加锚链接跳到 curator 区块——让"人工"两个字有名有姓。
4. **(可选,第 4b 条的入口)** 日报/周报模板落款加一行署名 curator's note 位——本稿不做,单独批。

---

## 不在本稿范围

- 头像/照片(要不要放、放什么,Cindy 拍板后再进组件层)
- 组件实现(改 design-system 真源 + Cindy 本地重建 app.min.js,文案定稿后我出 diff)
