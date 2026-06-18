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

  const payload = recent.map((i, n) => ({
    n: n + 1, title: i.title, summary: i.summary, take: i.curatedReason,
    category: CAT_ZH[i.category] || i.category, source: i.source,
    score: i.curatedScore, url: i.sourceUrl,
    multiSource: (i.related || []).map(r => r.source),
  }));

  const systemPrompt = `你是「步频」（Cadence 的中文刊名）公众号的编辑。步频是面向物理治疗/康复临床医师的循证新闻品牌，口吻：资深同行，给 take 不给 recap，数字优先于形容词，不夸大单项研究，不用 emoji，不用感叹号堆砌。

先输出两行元信息，再空一行输出正文：
标题：一句话标题，含日期（格式 M.D），≤30 字，点出当天最值得看的方向或最高分研究，不堆数字、不标题党。
摘要：一句话，≤100 字，概括当天看点，用于公众号摘要栏。

然后把输入的条目写成一篇公众号日报正文，纯 Markdown，结构严格如下：

1. 开头 2-3 句导语：今天信号的整体观感（几条、哪个方向值得花时间），口语但专业。
2. ${hot.length ? '一节「## 今日热点」：列出热点条目（编号），每条一行：标题加粗 + 几家信源在报。' : '（今天无热点节，跳过）'}
3. 按分类分节（## 分类名），每条目格式：
   - **中文标题**（英文标题翻译成自然的中文，信息保真，不标题党）
   - 一段 2-3 句：先一句研究/新闻本身（含样本量/效应量等关键数字，输入 summary 里有就用，没有不编造），再给 take（基于输入的 take 润色，保持判断力度，不得弱化为"值得关注"式空话）。
   - 末行小字格式：来源 · 信号分 score${'｜多信源时附'}（另有 X 家信源在报）

不要输出「参考链接」小节，也不要在标题后加 [数字] 编号——原文链接通过文末统一附加的站点链接提供（站内当天页面列出全部文献且可点）。文末的站点链接与署名由系统统一追加，你不用写。

禁止：寒暄、自我介绍、"小编"、互动求关注话术、虚构数字。除开头「标题：」「摘要：」两行外，正文里不要再出现说明性标签或解释文字。`;

  const userPrompt = `日期：${dateStr}\n\n${hot.length ? `今日热点：\n${JSON.stringify(hot.map(h => ({ title: h.title, sourceCount: h.sourceCount, sources: h.sources })), null, 1)}\n\n` : ''}条目：\n${JSON.stringify(payload, null, 1)}`;

  console.log(`  ${recent.length} 条进刊，热点 ${hot.length} 条，LLM: ${LLM_PROVIDER}`);
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
  if (!title) title = `步频日报丨${+mmT}.${+ddT} 康复信号 ${recent.length} 条`;
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
    await renderCover({ headline: title || '今日康复信号', eyebrow: `${+mm}.${+dd} 日报 · ${recent.length} 篇`, out });
    console.log(`  ✅ briefs/${dateStr}-cover.png`);
  } catch (e) {
    console.error('  ⚠️  cover render failed (non-fatal):', e.message);
  }
}

// Minimal md → WeChat-paste HTML. Inline styles only; classes don't survive
// the WeChat editor. Scrubs blue #3D74B8 = locked brand color.
function mdToWechatHtml(md, dateStr) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(\d+)\]/g, '<span style="color:#3D74B8;font-size:12px;">[$1]</span>');
  const blocks = md.trim().split(/\n{2,}/);
  let body = '';
  for (const b of blocks) {
    const lines = b.split('\n');
    if (/^##\s/.test(lines[0])) {
      body += `<h2 style="font-size:17px;color:#3D74B8;border-left:4px solid #3D74B8;padding-left:10px;margin:28px 0 14px;font-weight:600;">${inline(lines[0].replace(/^##\s*/, ''))}</h2>`;
      lines.shift();
    }
    const rest = lines.join('\n').trim();
    if (!rest) continue;
    if (/^[-*]\s/m.test(rest)) {
      const items = rest.split('\n').filter(l => l.trim()).map(l => `<li style="margin:6px 0;line-height:1.8;">${inline(l.replace(/^[-*]\s*/, ''))}</li>`).join('');
      body += `<ul style="padding-left:20px;margin:10px 0;font-size:15px;color:#333;">${items}</ul>`;
    } else {
      body += rest.split('\n').map(l => `<p style="margin:10px 0;line-height:1.85;font-size:15px;color:#333;">${inline(l)}</p>`).join('');
    }
  }
  return `<section style="font-family:-apple-system,'PingFang SC','Noto Sans SC',sans-serif;padding:4px 2px;">
<p style="font-size:13px;color:#8a8f98;letter-spacing:.04em;margin:0 0 4px;">步频日报 · ${dateStr}</p>
${body}
</section>\n`;
}

if (require.main === module) {
  main().catch(e => { console.error('❌', e); process.exit(1); });
}

module.exports = { main, mdToWechatHtml };
