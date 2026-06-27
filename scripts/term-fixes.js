// PT / 康复术语校正 —— 对「已知的固定错译/不一致写法」做确定性查找替换。
//
// 为什么不靠 prompt：LLM 是概率性的，今天对明天可能又错。对已确认的固定错误，
// 在拿到模型 JSON 之后做一次确定性替换才是 100% 保证生效。
// 新发现一个错译，往 TERM_FIXES 加一行即可，不用动模型、不用动 prompt。
//
// key   = 错译 / 不一致写法
// value = 正确写法
const TERM_FIXES = {
  '胕绳肌': '腘绳肌',   // hamstring，模型反复写错的那个（fù → guó）
};

// 对单个字符串跑全部替换。非字符串原样返回。
function applyTermFixes(str) {
  if (typeof str !== 'string') return str;
  let out = str;
  for (const [wrong, right] of Object.entries(TERM_FIXES)) {
    out = out.split(wrong).join(right); // 全局替换，字面量，无需正则转义
  }
  return out;
}

// 一条 curated / news item 里所有可能含中文的文本字段。
const TEXT_FIELDS = [
  'title', 'titleZh', 'titleEn',
  'summary', 'summaryZh',
  'curatedReason', 'curatedReasonEn',
  'limitation', 'limitationEn',
];

// 就地校正一条 item 的所有文本字段（含 hotTopics 的 members[].titleZh）。
function fixItem(item) {
  if (!item || typeof item !== 'object') return item;
  for (const f of TEXT_FIELDS) {
    if (f in item) item[f] = applyTermFixes(item[f]);
  }
  if (Array.isArray(item.members)) {
    item.members.forEach((m) => {
      if (m && typeof m === 'object') {
        if ('title' in m) m.title = applyTermFixes(m.title);
        if ('titleZh' in m) m.titleZh = applyTermFixes(m.titleZh);
      }
    });
  }
  return item;
}

module.exports = { TERM_FIXES, applyTermFixes, fixItem, TEXT_FIELDS };
