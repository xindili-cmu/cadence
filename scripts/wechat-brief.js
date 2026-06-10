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
const { callAnthropic, callGemini, LLM_PROVIDER } = require('./news-refresh.js');

const DRY_RUN = process.env.DRY_RUN === 'true';
const NEWS_PATH = path.join(__dirname, '..', 'news.json');
const BRIEFS_DIR = path.join(__dirname, '..', 'briefs');
const WINDOW_HOURS = 26; // daily 07:00 UTC run + slack

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

把输入的条目写成一篇公众号日报，纯 Markdown 输出，结构严格如下：

1. 开头 2-3 句导语：今天信号的整体观感（几条、哪个方向值得花时间），口语但专业。
2. ${hot.length ? '一节「## 今日热点」：列出热点条目（编号），每条一行：标题加粗 + 几家信源在报。' : '（今天无热点节，跳过）'}
3. 按分类分节（## 分类名），每条目格式：
   - **中文标题**（英文标题翻译成自然的中文，信息保真，不标题党）[编号n]
   - 一段 2-3 句：先一句研究/新闻本身（含样本量/效应量等关键数字，输入 summary 里有就用，没有不编造），再给 take（基于输入的 take 润色，保持判断力度，不得弱化为"值得关注"式空话）。
   - 末行小字格式：来源 · 信号分 score${'｜多信源时附'}（另有 X 家信源在报）
4. 结尾一节「## 参考链接」：按编号列出 [n] url（纯文本，每行一条）。
5. 最后一行：—— 步频 · Evidence in motion · 每日为临床 PT 筛信号

禁止：寒暄、自我介绍、"小编"、互动求关注话术、虚构数字、输出 Markdown 之外的任何说明文字。`;

  const userPrompt = `日期：${dateStr}\n\n${hot.length ? `今日热点：\n${JSON.stringify(hot.map(h => ({ title: h.title, sourceCount: h.sourceCount, sources: h.sources })), null, 1)}\n\n` : ''}条目：\n${JSON.stringify(payload, null, 1)}`;

  console.log(`  ${recent.length} 条进刊，热点 ${hot.length} 条，LLM: ${LLM_PROVIDER}`);
  const md = LLM_PROVIDER === 'gemini'
    ? await callGemini(systemPrompt, userPrompt)
    : await callAnthropic(systemPrompt, userPrompt);
  if (!md || md.length < 200) { console.error('  ❌ 生成失败或过短，今日不写文件。'); process.exit(1); }

  fs.mkdirSync(BRIEFS_DIR, { recursive: true });
  const mdPath = path.join(BRIEFS_DIR, `${dateStr}.md`);
  fs.writeFileSync(mdPath, md.trim() + '\n');
  fs.writeFileSync(path.join(BRIEFS_DIR, `${dateStr}.html`), mdToWechatHtml(md, dateStr));
  console.log(`  ✅ briefs/${dateStr}.md + .html`);
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
