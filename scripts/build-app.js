#!/usr/bin/env node
// Pre-compiles the four design-system/app/*.jsx files into one minified
// design-system/app/app.min.js so the browser no longer ships Babel-standalone
// or compiles JSX at runtime (was ~1.5MB of script + on-device compile per visit).
//
// Each source file is compiled with esbuild (classic JSX runtime → React global)
// and wrapped in an IIFE — this mirrors how Babel-standalone evaluated each
// <script type="text/babel"> in its own scope, so top-level `const` name reuse
// across files (e.g. Button/Icon destructured in both app.shell and app.main)
// keeps working. Cross-file references already go through window.* globals.
//
// Usage: node scripts/build-app.js   (or: npm run build-app)
// Run after ANY edit to design-system/app/*.jsx or components/** (via
// build-bundle.js first), then commit the regenerated app.min.js.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const APP = path.join(__dirname, '..', 'design-system', 'app');
const FILES = [
  'components.bundle.jsx', // window.NewsCard, CategoryTabs, …
  'app.data.jsx',          // fetch news.json → window.CD_* + CD_DATA_READY
  'app.shell.jsx',         // window.AppHeader, NavRail, DigestRail
  'app.main.jsx',          // FeedApp + ReactDOM render
];

(async () => {
  let out = '';
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(APP, f), 'utf8');
    const { code } = await esbuild.transform(src, {
      loader: 'jsx',
      jsx: 'transform', // classic runtime: React.createElement (React is a UMD global)
    });
    out += `/* ===== ${f} ===== */\n;(() => {\n${code}\n})();\n`;
  }
  const min = await esbuild.transform(out, { minify: true });
  const banner = '// AUTO-GENERATED — do not edit. Source: design-system/app/*.jsx · Regenerate: npm run build-app\n';
  fs.writeFileSync(path.join(APP, 'app.min.js'), banner + min.code);
  const kb = (Buffer.byteLength(banner + min.code) / 1024).toFixed(1);
  console.log(`✓ design-system/app/app.min.js written (${kb} KB)`);
})().catch((err) => { console.error(err); process.exit(1); });
