#!/usr/bin/env node
// One-time backfill: add `journal` field to existing feed/archive items that
// have a PubMed sourceUrl but were curated before news-refresh.js started
// capturing journal names (PR adding <Title> parse). Idempotent — skips items
// that already have `journal`. Usage: node scripts/backfill-journals.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const xmlTag = (s, tag) => {
  const m = s.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : '';
};
const stripTags = (s) => s.replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ' '; } })
  .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(parseInt(n, 10)); } catch { return ' '; } })
  .replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();

const pmidOf = (item) => {
  const m = String(item.sourceUrl || item.url || '').match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/);
  return m ? m[1] : null;
};

async function fetchJournals(pmids) {
  const map = {}; // pmid -> journal title
  for (let i = 0; i < pmids.length; i += 50) {
    const batch = pmids.slice(i, i + 50);
    const res = await fetch(`${BASE}/efetch.fcgi?db=pubmed&retmode=xml&rettype=abstract&id=${batch.join(',')}`);
    if (!res.ok) { console.error(`efetch ${res.status} for batch @${i}`); continue; }
    const xml = await res.text();
    for (const art of xml.split(/<PubmedArticle\b[^>]*>/).slice(1)) {
      const pmid = stripTags(xmlTag(art, 'PMID'));
      const journal = stripTags(xmlTag(art, 'Title')); // <Journal><Title> — same parse as news-refresh.js
      if (pmid && journal) map[pmid] = journal;
    }
    console.log(`  efetch batch ${i / 50 + 1}: ${batch.length} pmids`);
    await sleep(400);
  }
  return map;
}

function collectItems(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { data, items: Array.isArray(data) ? data : data.items || [] };
}

(async () => {
  const files = [path.join(ROOT, 'news.json'),
    ...fs.readdirSync(path.join(ROOT, 'archive'))
      .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
      .map((f) => path.join(ROOT, 'archive', f))];

  const targets = []; // {file, item}
  for (const file of files) {
    const { items } = collectItems(file);
    for (const it of items) if (!it.journal && pmidOf(it)) targets.push(pmidOf(it));
  }
  const pmids = [...new Set(targets)];
  console.log(`Need journal for ${pmids.length} unique PMIDs`);
  const map = await fetchJournals(pmids);
  console.log(`PubMed returned journal for ${Object.keys(map).length}`);

  for (const file of files) {
    const { data, items } = collectItems(file);
    let n = 0;
    for (const it of items) {
      const pmid = pmidOf(it);
      if (!it.journal && pmid && map[pmid]) { it.journal = map[pmid]; n++; }
    }
    if (n) {
      fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
      console.log(`${path.basename(file)}: +${n} journal fields`);
    }
  }
})();
