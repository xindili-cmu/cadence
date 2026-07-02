#!/usr/bin/env node
// Regenerates design-system/app/components.bundle.jsx from components/**.
// Strips import lines and `export ` keywords, appends Object.assign(window, …).
// Usage: node scripts/build-bundle.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'design-system');
const FILES = [
  'components/feed/categories.js',
  'components/core/Icon.jsx',
  'components/brand/Logo.jsx',
  'components/core/Button.jsx',
  'components/core/Input.jsx',
  'components/feed/SignalScore.jsx',
  'components/feed/CategoryTag.jsx',
  'components/feed/CategoryTabs.jsx',
  'components/feed/NewsCard.jsx',
];
const GLOBALS = ['Logo', 'Button', 'Input', 'Icon', 'CategoryTag', 'CategoryTabs', 'SignalScore', 'NewsCard', 'CATEGORIES', 'CATEGORY_MAP', 'getCategory', 'catVars', 'catLabel', 'catShort', 'XCUTS', 'cdCopyText'];

let out = `// AUTO-GENERATED from components/** — do not edit by hand.
// Regenerate: node scripts/build-bundle.js. Exposes all components as globals.
const { useState, useRef, useEffect } = React;
`;

for (const f of FILES) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
    .split('\n')
    .filter(l => !/^\s*import\s/.test(l))
    .map(l => l.replace(/^export\s+(default\s+)?/, ''))
    .join('\n')
    .replace(/React\.useState/g, 'useState')
    .replace(/React\.useRef/g, 'useRef')
    .replace(/React\.useEffect/g, 'useEffect');
  out += `\n\n/* ===== ${f} ===== */\n` + src.trim() + '\n';
}

out += `\n\nObject.assign(window, { ${GLOBALS.join(', ')} });\n`;
fs.writeFileSync(path.join(ROOT, 'app', 'components.bundle.jsx'), out);
console.log('✓ components.bundle.jsx regenerated');
