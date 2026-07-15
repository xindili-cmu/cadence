#!/usr/bin/env node
// Fetches a favicon for every source in sources.json and saves it to
// design-system/assets/favicons/<host>.png, so the Sources wall serves icons
// from our own origin. Why self-hosted: the card previously hot-linked
// google.com/s2, which is unreachable for readers in China — a primary
// audience — so the whole wall degraded to letter avatars there.
//
// Run from a network where Google is reachable (laptop / CI):
//   node scripts/fetch-favicons.js          # fetch missing icons only
//   node scripts/fetch-favicons.js --force  # re-fetch everything
//
// Re-run after adding sources to sources.json, then commit the new PNGs.
// Failures are non-fatal: a missing file just means the card falls back to
// its letter avatar (SourceFavicon onError path).
const fs = require('fs');
const path = require('path');

const SOURCES = require(path.join(__dirname, '..', 'sources.json'));
const OUT_DIR = path.join(__dirname, '..', 'design-system', 'assets', 'favicons');
const FORCE = process.argv.includes('--force');

// Hosts whose real favicon is near-white and invisible on the white source
// card — worse than no icon (2026-07-15 adversarial review). Skipped so the
// letter-avatar fallback renders instead; also delete any previously fetched
// copy. Re-check before removing an entry.
const NEAR_WHITE = new Set(['link.springer.com', 'content.iospress.com', 'medrxiv.org']);

const hosts = [...new Set(SOURCES.map((s) => (s.domain || '').split('/')[0]).filter(Boolean))]
  .filter((h) => {
    if (!NEAR_WHITE.has(h)) return true;
    const stale = path.join(OUT_DIR, `${h}.png`);
    if (fs.existsSync(stale)) { fs.unlinkSync(stale); console.log(`  ✂ ${h} (near-white icon — letter avatar instead)`); }
    return false;
  });

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let ok = 0, skipped = 0, failed = [];
  for (const host of hosts) {
    const file = path.join(OUT_DIR, `${host}.png`);
    if (!FORCE && fs.existsSync(file)) { skipped++; continue; }
    try {
      const res = await fetch(`https://www.google.com/s2/favicons?domain=${host}&sz=64`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (cadence-favicon-fetch)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100) throw new Error(`suspiciously small (${buf.length}B)`); // s2 error stubs
      fs.writeFileSync(file, buf);
      console.log(`  ✓ ${host} (${buf.length}B)`);
      ok++;
    } catch (e) {
      failed.push(host);
      console.error(`  ✗ ${host}: ${e.message}`);
    }
  }
  console.log(`\nDone: ${ok} fetched, ${skipped} already present, ${failed.length} failed.`);
  if (failed.length) console.log('Failed hosts (cards will use letter avatars):', failed.join(', '));
})();
