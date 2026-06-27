// PT / 康复术语校正 —— 对「已知的固定错译/不一致写法」做确定性查找替换。
//
// 为什么不靠 prompt：LLM 是概率性的，今天对明天可能又错。对已确认的固定错误，
// 在拿到模型 JSON 之后做一次确定性替换才是 100% 保证生效。
// 新发现一个错译，往 TERM_FIXES 加一行即可，不用动模型、不用动 prompt。
//
// key = 错译 / 不一致写法；value = 正确写法
const TERM_FIXES = {
  '胕绳肌': '腘绳肌',   // hamstring，模型反复写错的那个（fù → guó）
};

// 防呆：TERM_FIXES 不允许链式（某个 value 又是另一个 key）。Object.entries 按插入序，
// {A:'B', B:'C'} 会把 A 连替成 C。新增条目时这条会在加载时告警，不静默。
for (const v of Object.values(TERM_FIXES)) {
  if (v in TERM_FIXES) {
    console.warn(`[term-fixes] 链式替换风险：「${v}」既是 value 又是 key，可能被连续替换`);
  }
}

// 标识符字段：递归时绝不替换。LHS 目前是中文（不会出现在这些字段里），但 TERM_FIXES
// 会长大、将来可能进拉丁字母/归一化条目——那时盲替会改坏 url/doi/id，造成死链、dedup
// key 错位、主键漂移，且静默。先把这些键挡在外面，让「加一行不用想」这个属性保持成立。
const SKIP_KEYS = new Set([
  'url', 'link', 'href', 'doi', 'id', '_id', 'guid', 'slug',
  'source', 'sourceUrl', 'image', 'imageUrl', 'pdf', 'pdfUrl',
  'embedding', 'embed', 'vector',
]);

// 对单个字符串跑全部替换。非字符串原样返回。
function applyTermFixes(str) {
  if (typeof str !== 'string') return str;
  let out = str;
  for (const [wrong, right] of Object.entries(TERM_FIXES)) {
    out = out.split(wrong).join(right); // 字面量全局替换，无需正则转义
  }
  return out;
}

// 递归遍历整个 item，对每个 string 值跑替换表；跳过 SKIP_KEYS 标识符字段。
// 新增中文字段 / 更深嵌套（如 hotTopics.members[].titleZh）自动覆盖，无字段白名单。
function fixItem(node) {
  if (typeof node === 'string') return applyTermFixes(node);
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) node[i] = fixItem(node[i]);
    return node;
  }
  if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      if (SKIP_KEYS.has(k)) continue; // 标识符字段绝不替换
      node[k] = fixItem(node[k]);
    }
    return node;
  }
  return node; // number / boolean / null 原样
}

module.exports = { TERM_FIXES, SKIP_KEYS, applyTermFixes, fixItem };
