// Cadence feed categories — shared config consumed by CategoryTag,
// CategoryTabs and NewsCard. Colors resolve to --cat-<accent>* tokens.
// Slug authority for the whole system; scripts/news-refresh.js must match.
export const CATEGORIES = [
  { id: 'orthopedic',      label: 'Orthopedic',                  labelZh: '骨科康复',   short: 'Ortho',      shortZh: '骨科', icon: 'bone',            accent: 'ortho' },
  { id: 'neurological',    label: 'Neurological',                labelZh: '神经康复',   short: 'Neuro',      shortZh: '神经', icon: 'brain',           accent: 'neuro' },
  { id: 'sports',          label: 'Sports & Athletic',           labelZh: '运动康复',   short: 'Sports',     shortZh: '运动', icon: 'activity',        accent: 'sports' },
  { id: 'pediatric',       label: 'Pediatric',                   labelZh: '儿童康复',   short: 'Pediatric',  shortZh: '儿科', icon: 'baby',            accent: 'pediatric' },
  { id: 'geriatric',       label: 'Geriatric',                   labelZh: '老年康复',   short: 'Geriatric',  shortZh: '老年', icon: 'person-standing', accent: 'geriatric' },
  { id: 'cardiopulmonary', label: 'Cardiopulmonary',             labelZh: '心肺康复',   short: 'Cardiopulm', shortZh: '心肺', icon: 'heart-pulse',     accent: 'cardiopulm' },
  { id: 'manual-modality', label: 'Manual Therapy & Modalities', labelZh: '手法与理疗', short: 'Manual',     shortZh: '手法', icon: 'hand',            accent: 'manual' },
  { id: 'practice',        label: 'Practice & Profession',       labelZh: '行业与执业', short: 'Practice',   shortZh: '执业', icon: 'briefcase',       accent: 'practice' },
];

// Language-aware label pickers — read window.CD_LANG (set by app.data.jsx) at
// render time, so a language toggle re-render flips every tag/tab in place.
export function catLabel(cat) {
  return (typeof window !== 'undefined' && window.CD_LANG === 'zh' && cat.labelZh) || cat.label;
}
export function catShort(cat) {
  return (typeof window !== 'undefined' && window.CD_LANG === 'zh' && cat.shortZh) || cat.short;
}

export const CATEGORY_MAP = CATEGORIES.reduce((m, c) => { m[c.id] = c; return m; }, {});

// Taxonomy index (1-based) — the catalogue position shown as 01–08 on tags.
export function catIndex(id) {
  const i = CATEGORIES.findIndex((c) => c.id === id);
  return i >= 0 ? i + 1 : null;
}

export function getCategory(id) {
  return CATEGORY_MAP[id] || { id, label: id, short: id, icon: 'circle', accent: 'practice' };
}

// CSS custom-property names for a category's accent trio.
export function catVars(accent) {
  return {
    solid: `var(--cat-${accent})`,
    soft:  `var(--cat-${accent}-soft)`,
    ink:   `var(--cat-${accent}-ink)`,
  };
}

// ── Cross-cutting overlays (横切维度) ────────────────────────────────────────
// Not specialties: an item keeps its single clinical `category` AND may carry
// a boolean overlay flag (e.g. tech:true, set by scripts/news-refresh.js
// keyword rules). Overlays get a filter pill, a card chip and a pulse row,
// but never appear in specialty groupings (daily brief sections etc.).
export const XCUTS = [
  { id: 'rehab-tech', flag: 'tech', label: 'Rehab Tech', labelZh: '康复科技', short: 'Tech', shortZh: '科技', icon: 'cpu', accent: 'tech' },
];
