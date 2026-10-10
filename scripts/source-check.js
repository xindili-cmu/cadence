/**
 * source-check.js — 策展输出对原文的确定性核对（2026-10-09）。
 *
 * 为什么：策展 prompt 里写着「绝不编造数字」，但只是请求，没有代码强制。
 * 一个不在原文里的样本量 / 百分比会安静地上线、再被下游原样转述——
 * linkedin-poster-claims.js 的数字校验把 curatedReasonEn/limitationEn 当「原文」，
 * 所以策展层编出来的数字到了海报层反而是「有出处」的。只能在源头拦。
 *
 * 「原文」= 模型当时实际看到的东西：title + text（≤RAW_TEXT_MAX）+ source + publishedDate。
 * 模型没见过的数字，按定义就是它写出来的。
 *
 * 两条规则：
 *   1. 数字：CHECKED_FIELDS 里出现的每个数字都必须出现在原文里。
 *   2. 研究设计：只守「强证据」标签（RCT / 系统综述）——它们解锁顶档和
 *      prompt 里的行动建议护栏（RCT/系统综述 且 ≥80 才许下动作指令）。
 *      往上错标有害，往下错标（观察研究/综述/述评）代价小且原文常不写设计词，
 *      硬查会大量误伤，故不查。
 *
 * 纯函数，无 IO，无 LLM —— 断言见 pipeline-gates.test.js Z 段。
 */

const CHECKED_FIELDS = [
  'summaryZh', 'summary',
  'curatedReason', 'curatedReasonEn',
  'limitation', 'limitationEn',
];

const FULLWIDTH = /[０-９．，]/g;
const toAscii = (s) => s.replace(FULLWIDTH, (ch) => ({ '．': '.', '，': ',' }[ch] || String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)));

// 英文数字词 → 阿拉伯数字（标题写 "Eight weeks"、摘要写「8 周」是合法转述）。
const WORD_NUMS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40,
  fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
  single: 1, double: 2, twice: 2, half: 0.5, dozen: 12,
};
// 量级后缀：中英互译会换量级（$342M ↔ 3.42亿美元，4M ↔ 400万）。
const MAGNITUDE = { '万': 1e4, '亿': 1e8, k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9, '千': 1e3, '百万': 1e6 };

const canon = (x) => {
  const r = Math.round(x * 1e6) / 1e6;                 // 吃掉浮点尾巴（3.42*1e8）
  return String(r);
};

/**
 * 抽出文本里的数字，归一化：全角→半角、千分位去逗号、".5"→"0.5"、去尾零。
 * 带量级后缀的数（342M / 3.42亿 / 4 million）额外产出一个换算后的值，
 * 让 "$342M" 与 "3.42亿" 在比较时相遇。
 */
function numbersIn(text) {
  const s = toAscii(String(text == null ? '' : text))
    .replace(/(\d),(?=\d{3}\b)/g, '$1');        // 1,234 → 1234（只吃千分位，不吃 "3,4" 列表）
  const out = [];
  const re = /(?<![\d.])(\.?\d+(?:\.\d+)?)\s*(万|亿|百万|千|thousand|million|billion|bn|mn|[kKmMbB](?![a-zA-Z]))?/g;
  for (const m of s.matchAll(re)) {
    let n = m[1];
    if (n.startsWith('.')) n = '0' + n;
    const val = parseFloat(n);
    out.push(canon(val));
    const mag = m[2] && MAGNITUDE[m[2].toLowerCase()];
    if (mag) out.push(canon(val * mag));
  }
  return out;
}

/** 原文的数字集合：numbersIn + 英文数字词。只用在原文侧——输出侧写数字词不算「数字」。 */
function sourceNumbers(text) {
  const set = new Set(numbersIn(text));
  for (const w of String(text || '').toLowerCase().match(/[a-z]+/g) || []) {
    if (WORD_NUMS[w] != null) set.add(canon(WORD_NUMS[w]));
  }
  return set;
}

/**
 * 输出侧：一个数「有出处」= 原文里有它本身，或（带量级时）有它的换算值。
 * numbersIn 对带量级的数会连续产出 [raw, scaled] 两个值，这里按组判断。
 */
function unsupportedNumbers(text, srcNums) {
  const s = toAscii(String(text == null ? '' : text)).replace(/(\d),(?=\d{3}\b)/g, '$1');
  const bad = [];
  const re = /(?<![\d.])(\.?\d+(?:\.\d+)?)\s*(万|亿|百万|千|thousand|million|billion|bn|mn|[kKmMbB](?![a-zA-Z]))?/g;
  for (const m of s.matchAll(re)) {
    let n = m[1];
    if (n.startsWith('.')) n = '0' + n;
    const val = parseFloat(n);
    const mag = m[2] && MAGNITUDE[m[2].toLowerCase()];
    const cands = [canon(val)];
    if (mag) cands.push(canon(val * mag));
    if (cands.some((x) => srcNums.has(x))) continue;
    // 带量级的数允许「末位一个单位」的取整：135,881 → 「13.5 万」（单位 0.1万=1000）。
    // 不带量级的不放宽——35 vs 35.4 这种该让模型照抄原文。
    if (mag) {
      const decimals = (n.split('.')[1] || '').length;
      const unit = Math.pow(10, -decimals) * mag;
      const scaled = val * mag;
      if ([...srcNums].some((x) => Math.abs(parseFloat(x) - scaled) < unit)) continue;
    }
    bad.push(canon(val) + (m[2] || ''));
  }
  return bad;
}

// [label, 原文须出现的证据]。中英都认（中国源的原文是中文）。
const STRONG_DESIGNS = {
  'RCT': /randomi[sz]ed|randomly (assigned|allocated)|\bRCTs?\b|controlled trial|随机/i,
  '系统综述': /systematic(ally)? review|meta-?analy|umbrella review|系统(评价|综述)|荟萃|meta分析/i,
};

function sourceTextOf(src) {
  return [src.title, src.text, src.source, src.publishedDate].filter(Boolean).join(' ');
}

/**
 * @param c   一条策展输出（模型返回的对象）
 * @param src 模型看到的输入 {title, text, source, publishedDate}
 * @returns { numbers: [{field, n}], design: string|null } —— 空 = 通过
 */
function checkCuratedItem(c, src) {
  const srcText = sourceTextOf(src || {});
  const srcNums = sourceNumbers(srcText);
  const numbers = [];
  for (const field of CHECKED_FIELDS) {
    for (const n of unsupportedNumbers(c[field], srcNums)) {
      if (!numbers.some((v) => v.field === field && v.n === n)) numbers.push({ field, n });
    }
  }
  const re = STRONG_DESIGNS[c.studyDesign];
  const design = re && !re.test(srcText) ? c.studyDesign : null;
  return { numbers, design };
}

const hasViolation = (v) => v.numbers.length > 0 || !!v.design;

/** 给模型看的违规清单（重试 prompt 用）。 */
function describeViolations(v) {
  const lines = v.numbers.map(({ field, n }) => `${field} 里的数字 "${n}" 原文中没有——删掉它，或换成原文里确实出现的数字`);
  if (v.design) lines.push(`studyDesign 标成了 "${v.design}"，但原文没有写明这一设计（没有 randomized / systematic review / meta-analysis 等字样）——改成原文支持的标签`);
  return lines;
}

module.exports = { CHECKED_FIELDS, STRONG_DESIGNS, numbersIn, sourceNumbers, unsupportedNumbers, checkCuratedItem, hasViolation, describeViolations, sourceTextOf };
