// GreenStack feed categories — shared config consumed by CategoryTag,
// CategoryTabs and NewsCard. Colors resolve to --cat-<accent>* tokens.
export const CATEGORIES = [
  { id: 'clean-power',     label: 'Clean Power',                 short: 'Clean Power',     icon: 'sun',              accent: 'power' },
  { id: 'electrification', label: 'Electrification & Efficiency', short: 'Electrification', icon: 'battery-charging', accent: 'electric' },
  { id: 'industrial',      label: 'Industrial Decarbonization',  short: 'Industrial',      icon: 'factory',          accent: 'industrial' },
  { id: 'grid',            label: 'Grid Tech',                   short: 'Grid Tech',       icon: 'waypoints',        accent: 'grid' },
  { id: 'robotics',        label: 'Robotics & Physical AI',      short: 'Robotics',        icon: 'bot',              accent: 'robotics' },
  { id: 'agriculture',     label: 'Agriculture & Food',          short: 'Agriculture',     icon: 'sprout',           accent: 'agri' },
  { id: 'social',          label: 'Social',                      short: 'Social',          icon: 'users',            accent: 'social' },
  { id: 'governance',      label: 'Governance',                  short: 'Governance',      icon: 'scale',            accent: 'governance' },
];

export const CATEGORY_MAP = CATEGORIES.reduce((m, c) => { m[c.id] = c; return m; }, {});

export function getCategory(id) {
  return CATEGORY_MAP[id] || { id, label: id, short: id, icon: 'circle', accent: 'electric' };
}

// CSS custom-property names for a category's accent trio.
export function catVars(accent) {
  return {
    solid: `var(--cat-${accent})`,
    soft:  `var(--cat-${accent}-soft)`,
    ink:   `var(--cat-${accent}-ink)`,
  };
}
