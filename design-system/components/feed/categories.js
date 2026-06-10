// Cadence feed categories — shared config consumed by CategoryTag,
// CategoryTabs and NewsCard. Colors resolve to --cat-<accent>* tokens.
// Slug authority for the whole system; scripts/news-refresh.js must match.
export const CATEGORIES = [
  { id: 'orthopedic',      label: 'Orthopedic',                  short: 'Ortho',      icon: 'bone',            accent: 'ortho' },
  { id: 'neurological',    label: 'Neurological',                short: 'Neuro',      icon: 'brain',           accent: 'neuro' },
  { id: 'sports',          label: 'Sports & Athletic',           short: 'Sports',     icon: 'activity',        accent: 'sports' },
  { id: 'pediatric',       label: 'Pediatric',                   short: 'Pediatric',  icon: 'baby',            accent: 'pediatric' },
  { id: 'geriatric',       label: 'Geriatric',                   short: 'Geriatric',  icon: 'person-standing', accent: 'geriatric' },
  { id: 'cardiopulmonary', label: 'Cardiopulmonary',             short: 'Cardiopulm', icon: 'heart-pulse',     accent: 'cardiopulm' },
  { id: 'manual-modality', label: 'Manual Therapy & Modalities', short: 'Manual',     icon: 'hand',            accent: 'manual' },
  { id: 'practice',        label: 'Practice & Profession',       short: 'Practice',   icon: 'briefcase',       accent: 'practice' },
];

export const CATEGORY_MAP = CATEGORIES.reduce((m, c) => { m[c.id] = c; return m; }, {});

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
