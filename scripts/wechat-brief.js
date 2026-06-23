/**
 * Cadence 步频 — 公众号日报生成器
 *
 * Reads news.json (last 24-26h window) and produces a paste-ready WeChat
 * Official Account article in briefs/YYYY-MM-DD.{md,html}.
 *
 * Why this exists: Cindy's HCP interviews (design-input/HCP_audience_insights_
 * from_derm_interviews.md) — Chinese clinicians live in 公众号/垂类App, not
 * websites. The site serves EN readers + archive; this feeds the zh channel.
 *
 * WeChat constraints baked in:
 * - Body hyperlinks get stripped for unverified accounts → sources appear as
 *   plain-text 参考链接 footnotes, numbered to match items.
 * - The editor keeps inline styles only → the .html uses inline styles
 *   exclusively (scrubs blue #3D74B8 headers), paste straight in.
 *
 * Usage:
 *   node scripts/wechat-brief.js            (skips when REFRESH_MODE=direct)
 *   DRY_RUN=true node scripts/wechat-brief.js
 */

const fs = require('fs');
const path = require('path');
// callLLM routes to whichever provider news-refresh is configured for
// (deepseek default · gemini · anthropic), so the 公众号 article uses the SAME
// model as curation instead of silently falling back to Anthropic.
const { callLLM, LLM_PROVIDER } = require('./news-refresh.js');

const DRY_RUN = process.env.DRY_RUN === 'true';
const NEWS_PATH = path.join(__dirname, '..', 'news.json');
const BRIEFS_DIR = path.join(__dirname, '..', 'briefs');
const WINDOW_HOURS = 26; // daily 07:00 UTC run + slack
// Single clickable destination for原文 (WeChat strips inline links; the站内
// 当天页 lists every item with working links). Mirrors x-thread.js.
const SITE_URL = (process.env.SITE_URL || 'https://incadencept.com').replace(/\/$/, '');

const CAT_ZH = {
  orthopedic: '骨科与肌骨', neurological: '神经康复', sports: '运动康复',
  pediatric: '儿童康复', geriatric: '老年康复', cardiopulmonary: '心肺康复',
  'manual-modality': '手法与理疗', practice: '行业与执业',
};

async function main() {
  console.log(`\n📮 步频公众号日报 — ${new Date().toISOString()}`);
  if (process.env.REFRESH_MODE === 'direct') { console.log('  direct mode — brief is a daily-full-run product, skipping.'); return; }
  if (DRY_RUN) { console.log('  DRY_RUN mode\n'); return; }

  const data = JSON.parse(fs.readFileSync(NEWS_PATH, 'utf8'));
  const cutoff = Date.now() - WINDOW_HOURS * 3600 * 1000;
  const recent = (data.items || [])
    .filter(i => new Date(i.publishedAt).getTime() >= cutoff)
    .sort((a, b) => b.curatedScore - a.curatedScore)
    .slice(0, 12); // 公众号一屏读完，不做无限长文

  if (!recent.length) { console.log('  近 24h 无新条目，今日不发刊。'); return; }

  const hot = (data.hotTopics || []).slice(0, 3);
  const dateStr = new Date().toISOString().slice(0, 10);

  // (b) 把每条热点解析成 data.items 里的完整条目，用真实 summary/take 写作，
  // 而不是只把标题丢给模型让它脑补——既堵住凭标题编造，又能把最强的双信源研究
  // 写实。热点条目并入「详写集合」，与进刊条目按 id 去重、按分数排序。
  const byId = new Map((data.items || []).map(i => [i.id, i]));
  const hotResolved = hot
    .map(h => ({ h, item: byId.get(h.id) || (data.items || []).find(i => i.title === h.title) }))
    .filter(x => x.item);
  const hotById = new Map(hotResolved.map(x => [x.item.id, x.h]));
  const seen = new Set();
  const writeups = [...recent, ...hotResolved.map(x => x.item)]
    .filter(i => { if (!i || seen.has(i.id)) return false; seen.add(i.id); return true; })
    .sort((a, b) => b.curatedScore - a.curatedScore)
    .slice(0, 12);

  const payload = writeups.map((i, n) => {
    const ht = hotById.get(i.id);
    return {
      n: n + 1, title: i.title, summary: i.summary, take: i.curatedReason,
      category: CAT_ZH[i.category] || i.category, source: i.source,
      score: i.curatedScore, url: i.sourceUrl,
      multiSource: ht ? (ht.sources || []).filter(s => s !== i.source) : (i.related || []).map(r => r.source),
    };
  });
  // 「## 今日热点」中文索引——指向下面已写实的同一批条目。
  const hotIndex = hotResolved.map(x => ({ titleZh: x.item.titleZh || x.item.title, sourceCount: x.h.sourceCount }));

  const systemPrompt = `你是「步频」（Cadence 的中文刊名）公众号的编辑。步频是面向物理治疗/康复临床医师的循证新闻品牌，口吻：资深同行，给 take 不给 recap，数字优先于形容词，不夸大单项研究，不用 emoji，不用感叹号堆砌。

先输出两行元信息，再空一行输出正文：
标题：一句话标题，含日期（格式 M.D，放在标题最前面，如「6.18 …」，不要塞进结尾括号），≤30 字。写成「临床痛点解决型」——先点出临床 PT 会碰到的问题或处置决策，再带出当天最值得看的证据抓手，让人一看就觉得「这是我门诊会遇到的事」，而不是复述论文标题或只报方向。不堆数字、不标题党、不夸大；当天若没有明显能落地的研究，再退回点出最高分方向。
摘要：一句话，≤100 字，概括当天看点，用于公众号摘要栏。

然后把输入的条目写成一篇公众号日报正文，纯 Markdown，结构严格如下：

1. 开头 2-3 句导语：今天信号的整体观感（几条、哪个方向值得花时间），优先点出「能改下周处置」的条目，口语但专业。
2. ${hotIndex.length ? '一节「## 今日热点」：仅作中文索引，每个热点一行，格式「**中文标题**（X 家期刊在报）」（中文标题取输入 hotIndex 的 titleZh）。这些热点已并入下面的「条目」、会在分类节里展开详细写作，本节只给一行中文标题作导引，不在本节写研究内容、数字或 take。' : '（今天无热点节，跳过）'}
3. 按分类分节（## 分类名）——把「条目」数组里的每一条都写成详细段落（已含上面热点对应的条目，它们都带 summary/take）。所有细节只能来自该条目自己的 summary/take，输入里没有的一律不编造（样本量、效应量、人群、剂量、术语都一样）。每条目格式：
   - **中文标题**（英文标题翻译成自然的中文，信息保真，不标题党）
   - 一段 2-3 句：先一句研究/新闻本身（含样本量/效应量等关键数字，输入 summary 里有就用，没有不编造），再给 take（基于输入的 take 润色，保持判断力度，不得弱化为"值得关注"式空话）。
   - 「临床落地」行有条件才写：仅当该条目的 summary/take 里确实写到了适用人群或具体干预/剂量时，才以「**临床落地**：」开头补一句临床 PT 的用法。硬约束：只能复述 summary/take 里已经出现的人群、干预、剂量、谨慎点，禁止引入输入中没出现过的术语、亚组、工具名或自创建议（例如输入没提到「盆底训练」「症状日记」就绝不能写，也不得把"特定亚组"自行具体化）。summary/take 里没有可落地的人群或干预细节时，直接省略这一行，不要硬凑、不要泛化成空话。
   - 末行小字格式：「{该条目 source 字段的实际值，如 PubMed、medRxiv} · 信号分 {该条目 score}」；当该条目 multiSource 非空时，再接「｜另有 X 家信源在报」（X = multiSource 的条数）。务必填入真实信源名，不要照抄「来源」「source」这类字面占位词。

不要输出「参考链接」小节，也不要在标题后加 [数字] 编号——可点原文统一走文末「阅读原文」（站内当天页列出全部文献且可点）。文末的「阅读原文」指引与署名由系统统一追加，你不用写，正文里也不要出现任何 http 链接。

禁止：寒暄、自我介绍、"小编"、互动求关注话术、虚构数字。除开头「标题：」「摘要：」两行外，正文里不要再出现说明性标签或解释文字。`;

  const userPrompt = `日期：${dateStr}\n\n${hotIndex.length ? `今日热点（中文索引，正文详写在下方「条目」里）：\n${JSON.stringify(hotIndex, null, 1)}\n\n` : ''}条目：\n${JSON.stringify(payload, null, 1)}`;

  console.log(`  ${recent.length} 条进刊，热点 ${hot.length} 条 → 详写 ${writeups.length} 条，LLM: ${LLM_PROVIDER}`);
  // 公众号文章要 Markdown 散文，必须用文本模式调 LLM。若走 JSON 响应模式
  // （curation 用的那套），模型会吐出一个 JSON 对象而不是文章。
  const md = await callLLM(systemPrompt, userPrompt, { json: false });
  if (!md || md.length < 200) { console.error('  ❌ 生成失败或过短，今日不写文件。'); process.exit(1); }
  // 守卫：若返回的是 JSON 对象/数组（疑似响应被强制成 JSON 模式），宁可今天不发，
  // 也不要把 JSON 当正文写进 .md/.html（那会得到一篇“原始 JSON”的废文）。
  const head = md.trim().replace(/^```(?:json)?\s*/i, '');
  if (head.startsWith('{') || head.startsWith('[')) {
    console.error('  ❌ 生成结果像 JSON 而非 Markdown 正文，疑似响应被强制成 JSON 模式；今日不写文件。');
    process.exit(1);
  }

  // 从生成结果里抽出开头的「标题：」「摘要：」两行；其余为正文 Markdown。
  let title = '', digest = '', article = md.trim();
  {
    const kept = [];
    for (const line of article.split('\n')) {
      const mt = line.match(/^\s*标题[:：]\s*(.+)$/);
      const mz = line.match(/^\s*摘要[:：]\s*(.+)$/);
      if (!title && mt) { title = mt[1].trim(); continue; }
      if (!digest && mz) { digest = mz[1].trim(); continue; }
      kept.push(line);
    }
    article = kept.join('\n').trim();
  }
  // 标题固定为品牌格式（含日期 M.D），不采用模型即兴标题；封面用同一 title，两处统一。
  // 摘要仍取模型生成（内容型），回退取正文首段，绝不让其为空。
  const [, mmT, ddT] = dateStr.split('-');
  title = `步频日报丨${+mmT}.${+ddT} 高分康复文献速读`;
  if (!digest) {
    const firstPara = article.split(/\n{2,}/).find(b => b.trim() && !b.trim().startsWith('#')) || '';
    digest = firstPara.replace(/\s+/g, ' ').trim().slice(0, 100);
  }

  // 文末不再放站外 URL：未认证号正文外链点不动，且每期都贴站外链接会被判“导流”、
  // 拖累账号助推资格。改为正文只留文字指引，真正可点的站点链接放进微信编辑器底部
  // 「阅读原文」字段（未认证号唯一可点的站外位），URL 写到 .meta.txt 供复制。
  // 先清掉模型可能仍残留的「参考链接」小节、旧的站外链接行或自带署名，避免重复。
  article = article
    .replace(/\n#{1,6}\s*参考链接[\s\S]*$/m, '')
    .replace(/\n*原文与完整文献列表[^\n]*$/m, '')
    .replace(/\n*——\s*步频[^\n]*\s*$/m, '')
    .trim();
  const readMoreUrl = `${SITE_URL}/#daily/${dateStr}`;
  article += `\n\n全部文献与可点原文 → 见文末「阅读原文」\n\n—— 步频 · Evidence in motion · 每日为临床 PT 筛信号`;

  fs.mkdirSync(BRIEFS_DIR, { recursive: true });
  const mdPath = path.join(BRIEFS_DIR, `${dateStr}.md`);
  fs.writeFileSync(mdPath, article + '\n');
  fs.writeFileSync(path.join(BRIEFS_DIR, `${dateStr}.html`), mdToWechatHtml(article, dateStr));
  // 标题 + 摘要 + 阅读原文 URL 写到 sidecar，公众号「标题栏 / 摘要栏 / 阅读原文」直接复制。
  fs.writeFileSync(path.join(BRIEFS_DIR, `${dateStr}.meta.txt`), `标题：${title}\n摘要：${digest}\n阅读原文（粘到编辑器底部「阅读原文」字段）：${readMoreUrl}\n`);
  console.log(`  ✅ briefs/${dateStr}.md + .html + .meta.txt`);
  console.log(`     标题：${title}`);
  console.log(`     摘要：${digest}`);

  // 2.35:1 WeChat cover banner — same satori pipeline. Non-fatal: a cover
  // failure must never block the brief itself.
  try {
    const { renderCover } = require('./wechat-cover.js');
    const [, mm, dd] = dateStr.split('-');
    const out = path.join(BRIEFS_DIR, `${dateStr}-cover.png`);
    await renderCover({ headline: title || '今日康复信号', eyebrow: `${+mm}.${+dd} 日报 · ${writeups.length} 篇`, out });
    console.log(`  ✅ briefs/${dateStr}-cover.png`);
  } catch (e) {
    console.error('  ⚠️  cover render failed (non-fatal):', e.message);
  }
}

// Minimal md → WeChat-paste HTML. Inline styles only; classes don't survive
// the WeChat editor. Scrubs blue #3D74B8 = locked brand color.
// md → 「秀米风」公众号正文：渐变标题条 + 圆角投影卡片 + 分类分隔 + 临床落地高亮 + 关注模块。
// 全内联样式（WeChat 编辑器只保留 inline style）；蓝 #3D74B8 = 锁定品牌色。
// 渐变一律配 background-color 实色回退：万一微信剥掉 gradient，标题条/徽标仍可读，不会白底白字。
function mdToWechatHtml(md, dateStr) {
  const C = { blue: '#3D74B8', blue2: '#6fa0d8', tint: '#f2f6fb', tint2: '#eaf1f9',
    ink: '#1c2530', body: '#4a5663', mute: '#9aa6b2', warm: '#c2410c', warmbg: '#fdeede' };
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const stripBold = (s) => s.replace(/^\*\*\s*/, '').replace(/\s*\*\*$/, '').trim();
  const fmtDate = dateStr.replace(/-/g, '.');
  const gradBg = (c1, c2, deg) => `background-color:${c1};background-image:linear-gradient(${deg || '135deg'},${c1},${c2});`;

  // ---- 1) 解析 md → 结构化块 ----
  const lines = md.trim().split('\n');
  const intro = [];
  const items = []; // {cat, title, body[], land, src, multi}
  let cur = null, curCat = '', skip = false;
  const pushCur = () => { if (cur) { items.push(cur); cur = null; } };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (/^##\s/.test(line)) {
      pushCur();
      const h = line.replace(/^##\s*/, '').trim();
      skip = /今日热点/.test(h); // 卡片自带「多源」徽标，索引节弃用
      if (!skip) curCat = h;
      continue;
    }
    if (skip) continue; // 「今日热点」索引节整段丢弃

    if (/^全部文献与可点原文/.test(line) || /^原文与完整文献列表/.test(line)) { pushCur(); continue; }
    if (/^——/.test(line)) { pushCur(); continue; } // 署名由关注模块统一替代

    // 末行小字：来源 · 信号分 X｜另有 N 家 —— 信号分对读者隐藏，只取信源名 + 多源数
    if (/信号分/.test(line)) {
      if (cur) {
        cur.src = line.split('·')[0].trim();
        const m = line.match(/另有\s*(\d+)\s*家/);
        cur.multi = m ? parseInt(m[1], 10) + 1 : 0;
      }
      continue;
    }
    if (/^\*{0,2}临床落地/.test(line)) {
      if (cur) cur.land = line.replace(/^\*{0,2}临床落地\*{0,2}\s*[:：]?\s*/, '').trim();
      continue;
    }
    if (/^\*\*[^*].*\*\*$/.test(line)) { // 条目标题：整行 ** 包裹
      pushCur();
      cur = { cat: curCat, title: stripBold(line), body: [], land: '', src: '', multi: 0 };
      continue;
    }
    // 其余：条目正文，或（任何条目之前）导语
    if (cur) cur.body.push(line); else intro.push(line);
  }
  pushCur();

  // ---- 2) 渲染 ----
  // 回退：解析不到任何条目（LLM 格式异常）→ 朴素渲染，绝不出空文。
  if (!items.length) {
    const plain = lines.filter(l => l.trim())
      .map(l => `<p style="margin:9px 0;line-height:1.85;font-size:16px;color:#333;">${inline(l.replace(/^#+\s*/, '').trim())}</p>`).join('');
    return `<section style="font-family:-apple-system,'PingFang SC','Noto Sans SC',sans-serif;padding:4px 2px;color:#333;">${plain}</section>\n`;
  }

  const ICON = { '神经康复': '🧠', '手法与理疗': '🤲', '骨科与肌骨': '🦴', '运动康复': '🏃',
    '儿童康复': '🧒', '老年康复': '🧓', '心肺康复': '🫁', '行业与执业': '📋' };
  const deep = '#2f5d99', canvas = '#eef2f7', gold = '#a9760a', goldbg = '#fbf0d4';

  let h = '';
  // 顶部渐变标题条
  h += `<div style="${gradBg(deep, C.blue2)}border-radius:18px;padding:22px 20px 18px;color:#fff;box-shadow:0 6px 20px rgba(47,93,153,.22);">`
    + `<div style="font-size:11px;letter-spacing:.26em;opacity:.82;">EVIDENCE IN MOTION</div>`
    + `<div style="font-size:22px;font-weight:800;margin:8px 0 0;letter-spacing:.02em;">步频 · 康复信号日报</div>`
    + `<div style="height:2px;width:40px;background:rgba(255,255,255,.55);border-radius:2px;margin:9px 0;"></div>`
    + `<div style="font-size:12px;opacity:.9;">${fmtDate}　·　今日 ${items.length} 条精选</div></div>`;

  // 导读（悬浮白卡）
  if (intro.length) {
    h += `<div style="margin:16px 0 4px;padding:14px 16px;background:#fff;border-radius:13px;box-shadow:0 4px 16px rgba(31,46,64,.06);">`
      + `<div style="font-size:11px;color:${C.blue};font-weight:800;letter-spacing:.16em;margin-bottom:7px;">导读 · DAILY BRIEF</div>`
      + `<p style="margin:0;font-size:15px;color:#3a4654;line-height:1.9;">${inline(intro.join(' '))}</p></div>`;
  }

  // 卡片（分类用图标 + 短下划线分组）
  let lastCat = '';
  items.forEach((it, i) => {
    if (it.cat && it.cat !== lastCat) {
      const ic = ICON[it.cat] || '🔹';
      h += `<div style="margin:26px 0 13px;">`
        + `<div style="font-size:15px;font-weight:800;color:${deep};letter-spacing:.04em;margin-bottom:7px;">${ic}　${esc(it.cat)}</div>`
        + `<div style="height:3px;width:42px;${gradBg(C.blue, C.blue2, '90deg')}border-radius:2px;"></div></div>`;
      lastCat = it.cat;
    }
    h += `<div style="margin:0 0 13px;background:#fff;border-radius:16px;box-shadow:0 4px 18px rgba(31,46,64,.08);overflow:hidden;">`
      + `<div style="padding:15px 16px 14px;">`
      + `<div style="margin-bottom:9px;">`
      + `<span style="display:inline-block;height:24px;line-height:24px;text-align:center;${gradBg(deep, C.blue2)}color:#fff;border-radius:7px;font-size:12px;font-weight:700;letter-spacing:.06em;padding:0 8px;vertical-align:middle;">No.${String(i + 1).padStart(2, '0')}</span>`
      + (it.multi ? `<span style="display:inline-block;font-size:12px;color:${gold};background:${goldbg};padding:2px 10px;border-radius:11px;margin-left:8px;vertical-align:middle;">✦ ${it.multi} 源共振</span>` : '')
      + `</div>`
      + `<p style="margin:0 0 8px;font-size:17px;font-weight:700;color:${C.ink};line-height:1.5;">${inline(it.title)}</p>`
      + `<p style="margin:0 0 ${it.land ? '12px' : '2px'};font-size:15px;color:${C.body};line-height:1.85;">${inline(it.body.join(' '))}</p>`
      + (it.land ? `<div style="margin:0;background:${C.tint};border-radius:10px;padding:11px 13px;border-left:3px solid ${C.blue};">`
          + `<div style="font-size:11px;font-weight:800;color:${C.blue};letter-spacing:.12em;margin-bottom:4px;">💡 临床落地</div>`
          + `<div style="font-size:14px;color:#2b3a4a;line-height:1.72;">${inline(it.land)}</div></div>` : '')
      + (it.src ? `<p style="margin:11px 0 0;font-size:11px;color:${C.mute};letter-spacing:.04em;">SOURCE · ${esc(it.src)}</p>` : '')
      + `</div></div>`;
  });

  // 关注模块（不放站外 URL；可点原文统一走文末「阅读原文」）
  h += `<div style="margin:24px 0 0;padding:18px 16px;background:#fff;border-radius:15px;box-shadow:0 4px 16px rgba(31,46,64,.06);text-align:center;">`
    + `<div style="display:inline-block;${gradBg(deep, C.blue2)}color:#fff;font-size:13px;font-weight:700;padding:7px 20px;border-radius:18px;margin-bottom:10px;">▍步频 · Evidence in motion</div>`
    + `<p style="margin:0 0 8px;font-size:12px;color:#7a8694;line-height:1.7;">每日为临床 PT 筛信号</p>`
    + `<p style="margin:0;font-size:12px;color:#9aa6b2;line-height:1.6;">全部文献与可点原文 → 见文末「阅读原文」</p>`
    + `</div>`;

  // 免责声明（医疗/康复内容必备：面向专业人员、非诊疗建议、版权归原作者）
  h += `<div style="margin:14px 0 0;padding:13px 4px 0;border-top:1px solid #dfe5ec;">`
    + `<p style="margin:0;font-size:11px;color:${C.mute};line-height:1.7;">内容仅供康复专业人员参考，不构成对患者的诊疗建议。本文为文献中文摘要导读，各文献版权归原作者及发表平台所有，完整内容请查阅原文。</p></div>`;

  // 根治：微信会剥 <div> 背景/阴影，统一转成 <section>（正文已 esc，不会误伤内容里的 <）。
  const hSafe = h.replace(/<div(\s|>)/g, '<section$1').replace(/<\/div>/g, '</section>');
  return `<section style="font-family:-apple-system,'PingFang SC','Noto Sans SC',sans-serif;background:${canvas};padding:18px 14px 22px;color:${C.ink};">${hSafe}</section>\n`;
}

if (require.main === module) {
  main().catch(e => { console.error('❌', e); process.exit(1); });
}

module.exports = { main, mdToWechatHtml };
