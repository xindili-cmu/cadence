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
2. ${hotIndex.length ? '一节「## 今日热点」：仅作中文索引，每个热点一行，格式「**中文标题**（X 家信源在报）」（中文标题取输入 hotIndex 的 titleZh）。这些热点已并入下面的「条目」、会在分类节里展开详细写作，本节只给一行中文标题作导引，不在本节写研究内容、数字或 take。' : '（今天无热点节，跳过）'}
3. 按分类分节（## 分类名）——把「条目」数组里的每一条都写成详细段落（已含上面热点对应的条目，它们都带 summary/take）。所有细节只能来自该条目自己的 summary/take，输入里没有的一律不编造（样本量、效应量、人群、剂量、术语都一样）。每条目格式：
   - **中文标题**（英文标题翻译成自然的中文，信息保真，不标题党）
   - 一段 2-3 句：先一句研究/新闻本身（含样本量/效应量等关键数字，输入 summary 里有就用，没有不编造），再给 take（基于输入的 take 润色，保持判断力度，不得弱化为"值得关注"式空话）。
   - 「临床落地」行有条件才写：仅当该条目的 summary/take 里确实写到了适用人群或具体干预/剂量时，才以「**临床落地**：」开头补一句临床 PT 的用法。硬约束：只能复述 summary/take 里已经出现的人群、干预、剂量、谨慎点，禁止引入输入中没出现过的术语、亚组、工具名或自创建议（例如输入没提到「盆底训练」「症状日记」就绝不能写，也不得把"特定亚组"自行具体化）。summary/take 里没有可落地的人群或干预细节时，直接省略这一行，不要硬凑、不要泛化成空话。
   - 末行小字格式：「{该条目 source 字段的实际值，如 PubMed、medRxiv} · 信号分 {该条目 score}」；当该条目 multiSource 非空时，再接「｜另有 X 家信源在报」（X = multiSource 的条数）。务必填入真实信源名，不要照抄「来源」「source」这类字面占位词。

不要输出「参考链接」小节，也不要在标题后加 [数字] 编号——原文链接通过文末统一附加的站点链接提供（站内当天页面列出全部文献且可点）。文末的站点链接与署名由系统统一追加，你不用写。

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
  // 回退：模型没按格式给时，标题用模板、摘要取正文首段，绝不让这俩为空。
  const [, mmT, ddT] = dateStr.split('-');
  if (!title) title = `步频日报丨${+mmT}.${+ddT} 康复信号 ${writeups.length} 条`;
  if (!digest) {
    const firstPara = article.split(/\n{2,}/).find(b => b.trim() && !b.trim().startsWith('#')) || '';
    digest = firstPara.replace(/\s+/g, ' ').trim().slice(0, 100);
  }

  // 文末统一附加可点的站点链接（站内当天页列出全部文献、链接可点）+ 署名。
  // 微信会剥掉正文内联链接，所以不再逐条列 URL 脚注（与站点链接重复且点不动）。
  // 先清掉模型可能仍残留的「参考链接」小节或自带署名，避免重复。
  article = article
    .replace(/\n#{1,6}\s*参考链接[\s\S]*$/m, '')
    .replace(/\n*——\s*步频[^\n]*\s*$/m, '')
    .trim();
  article += `\n\n原文与完整文献列表 → ${SITE_URL}/#daily/${dateStr}\n\n—— 步频 · Evidence in motion · 每日为临床 PT 筛信号`;

  fs.mkdirSync(BRIEFS_DIR, { recursive: true });
  const mdPath = path.join(BRIEFS_DIR, `${dateStr}.md`);
  fs.writeFileSync(mdPath, article + '\n');
  fs.writeFileSync(path.join(BRIEFS_DIR, `${dateStr}.html`), mdToWechatHtml(article, dateStr));
  // 标题 + 摘要 写到 sidecar，公众号「标题栏 / 摘要栏」直接复制。
  fs.writeFileSync(path.join(BRIEFS_DIR, `${dateStr}.meta.txt`), `标题：${title}\n摘要：${digest}\n`);
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
// 逐行分类渲染：拉开「分类标题 / 条目标题 / 正文 / 临床落地 / 末行小字」的层级。
// WeChat 编辑器只保留内联样式，故每个元素都自带 style；蓝 #3D74B8 = 锁定品牌色。
function mdToWechatHtml(md, dateStr) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(\d+)\]/g, '<span style="color:#3D74B8;font-size:12px;">[$1]</span>');

  const lines = md.trim().split('\n');
  let body = '';
  let listBuf = [];
  const flushList = () => {
    if (!listBuf.length) return;
    body += `<ul style="padding-left:20px;margin:8px 0 14px;font-size:15px;color:#555;">`
      + listBuf.map(l => `<li style="margin:5px 0;line-height:1.75;">${inline(l)}</li>`).join('')
      + `</ul>`;
    listBuf = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushList(); continue; }

    // 分类 / 今日热点 标题
    if (/^##\s/.test(line)) {
      flushList();
      body += `<h2 style="font-size:17px;color:#3D74B8;border-left:4px solid #3D74B8;padding-left:10px;margin:30px 0 12px;font-weight:600;line-height:1.4;">${inline(line.replace(/^##\s*/, ''))}</h2>`;
      continue;
    }
    // 列表项（如「今日热点」若用 - 列出）
    if (/^[-*]\s/.test(line)) { listBuf.push(line.replace(/^[-*]\s*/, '')); continue; }
    flushList();

    // 末行小字：信源 · 信号分 X（｜另有 N 家信源在报）
    if (/信号分/.test(line)) {
      body += `<p style="margin:4px 0 0;font-size:13px;color:#9aa0a8;line-height:1.6;">${inline(line)}</p>`;
      continue;
    }
    // 临床落地 → 浅蓝高亮块，作为「能用上」的视觉锚点
    if (/^\*{0,2}临床落地/.test(line)) {
      body += `<p style="margin:8px 0 2px;padding:9px 12px;background:#eef3f9;border-left:3px solid #3D74B8;border-radius:3px;font-size:15px;color:#2b2b2b;line-height:1.75;">${inline(line)}</p>`;
      continue;
    }
    // 今日热点中文索引行：**标题**（X 家信源在报）→ 紧凑
    if (/^\*\*.+\*\*[（(]\d+\s*家信源在报[）)]\s*$/.test(line)) {
      body += `<p style="margin:6px 0;font-size:15px;color:#333;line-height:1.7;">${inline(line)}</p>`;
      continue;
    }
    // 文末 CTA（站点链接）→ 顶部分隔线
    if (/^原文与完整文献列表/.test(line)) {
      body += `<p style="margin:24px 0 4px;padding-top:12px;border-top:1px solid #ececec;font-size:14px;color:#555;line-height:1.7;">${inline(line)}</p>`;
      continue;
    }
    // 署名小字
    if (/^——/.test(line)) {
      body += `<p style="margin:2px 0 0;font-size:13px;color:#9aa0a8;line-height:1.6;">${inline(line)}</p>`;
      continue;
    }
    // 条目标题：整行被 ** 包裹 → 独立小标题 + 条目间留白
    if (/^\*\*[^*].*\*\*$/.test(line)) {
      body += `<p style="margin:22px 0 6px;font-size:16px;font-weight:600;color:#222;line-height:1.55;">${inline(line)}</p>`;
      continue;
    }
    // 普通正文（含导语）
    body += `<p style="margin:9px 0;line-height:1.85;font-size:16px;color:#333;">${inline(line)}</p>`;
  }
  flushList();

  return `<section style="font-family:-apple-system,'PingFang SC','Noto Sans SC',sans-serif;padding:4px 2px;color:#333;">
<p style="font-size:13px;color:#9aa0a8;letter-spacing:.04em;margin:0 0 6px;">步频日报 · ${dateStr}</p>
${body}
</section>\n`;
}

if (require.main === module) {
  main().catch(e => { console.error('❌', e); process.exit(1); });
}

module.exports = { main, mdToWechatHtml };
