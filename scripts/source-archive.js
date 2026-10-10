/**
 * source-archive.js — 把每次策展的「模型看到的原文 + 原文一致性闸的判定」存进私有 KV（2026-10-09）。
 *
 * 为什么：原文（title + text ≤RAW_TEXT_MAX）从不落盘，事后审计只能拿 LLM 自己写的英文
 * summary 当「原文」——source-check 的离线审计、rescore-consistency 都因此只能给上限 / 近似。
 *
 * 为什么是 KV 而不是仓库（Cindy 2026-10-09 拍板）：GitHub 仓库公开、站点把仓库根目录
 * 当静态资源发布。text 里有 Exa 抓的新闻正文和出版社摘要，提交进去 = 公开转载，进了
 * git 历史撤不回。
 *
 * 隐私不变量：这个 namespace **不绑定到 worker**（wrangler.jsonc 不出现它）——没有任何
 * 公开路由能读到它。写入走 Cloudflare REST API，读取走 source-archive-pull.js（本地）。
 * pipeline-gates Z 段守这条。
 *
 * 失败策略：存档是审计用的旁路，写失败不能拖垮刷新——只大声打日志，不抛。
 * 配置缺失同理（每次运行都会打一行 ⚠️，不会静默）。
 *
 * 环境变量（refresh.yml 的 news-refresh 步骤传入）：
 *   CLOUDFLARE_ACCOUNT_ID  — 复用 deploy 的 secret
 *   CURATION_KV_NS         — repo Variable：namespace id
 *   CURATION_KV_TOKEN      — repo Secret：只有 Workers KV Storage:Edit 权限的 token
 *   CURATION_KV_TTL_DAYS   — 可选，默认 180（控制存储量：每天 ~12 次运行 × 数百 KB）
 */

const KEY_PREFIX = 'run/';
const DEFAULT_TTL_DAYS = 180;

function kvConfig(env = process.env) {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID, ns = env.CURATION_KV_NS, token = env.CURATION_KV_TOKEN;
  const missing = [['CLOUDFLARE_ACCOUNT_ID', accountId], ['CURATION_KV_NS', ns], ['CURATION_KV_TOKEN', token]]
    .filter(([, v]) => !v).map(([k]) => k);
  const ttlDays = Number(env.CURATION_KV_TTL_DAYS) || DEFAULT_TTL_DAYS;
  return { accountId, ns, token, ttlDays, missing };
}

const kvBase = (cfg) => `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/storage/kv/namespaces/${cfg.ns}`;

/** run/2026-10-09T21-34-05Z —— 字典序 = 时间序，list 时按前缀 + 日期过滤。 */
function runKey(date = new Date()) {
  return KEY_PREFIX + date.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
}

/**
 * @param state { items, fidelity, final } —— news-refresh 的 lastCuration()
 * @param meta  { mode, provider }
 */
function buildRecord(state, meta = {}, date = new Date()) {
  const s = state || {};
  return {
    v: 1,
    runAt: date.toISOString(),
    mode: meta.mode || null,
    provider: meta.provider || null,
    // 模型实际看到的输入（与 curateWithClaude 送进 prompt 的完全一致）
    items: (s.items || []).map((i) => ({
      index: i.index, title: i.title, text: i.text || '', source: i.source,
      category: i.category, url: i.url, publishedDate: i.publishedDate,
    })),
    // 闸的判定：被标出的条目、重写前后的字段、最终处置
    fidelity: s.fidelity || [],
    // 最终交给 main 的策展输出（分数 / 标签 / 文本），供日后对照原文审计与重打分
    final: (s.final || []).map((c) => ({
      index: c.index, curatedScore: c.curatedScore, studyDesign: c.studyDesign || null, tags: c.tags,
      summary: c.summary, summaryZh: c.summaryZh, curatedReason: c.curatedReason,
      curatedReasonEn: c.curatedReasonEn, limitation: c.limitation, limitationEn: c.limitationEn,
    })),
  };
}

/** 写一条记录。永不抛：返回 { ok, key?, reason? }。 */
async function putRecord(record, env = process.env, fetchImpl = globalThis.fetch, date = new Date()) {
  const cfg = kvConfig(env);
  if (cfg.missing.length) return { ok: false, reason: `not configured (missing ${cfg.missing.join(', ')})` };
  const key = runKey(date);
  const url = `${kvBase(cfg)}/values/${encodeURIComponent(key)}?expiration_ttl=${cfg.ttlDays * 86400}`;
  try {
    const res = await fetchImpl(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 200); } catch {}
      return { ok: false, key, reason: `HTTP ${res.status} ${detail}` };
    }
    return { ok: true, key };
  } catch (e) {
    return { ok: false, key, reason: e.message };
  }
}

module.exports = { KEY_PREFIX, DEFAULT_TTL_DAYS, kvConfig, kvBase, runKey, buildRecord, putRecord };
