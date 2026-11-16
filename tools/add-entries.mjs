// node tools/add-entries.mjs <additions.json>  -> merge {en: zh} into dict/hub.json (overrides existing)
import fs from 'node:fs';
const f = new URL('../dict/hub.json', import.meta.url);
const d = JSON.parse(fs.readFileSync(f, 'utf8'));
const add = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let n = 0, changed = 0;
for (const [k, v] of Object.entries(add)) { if (d.entries[k] === undefined) n++; else if (d.entries[k] !== v) changed++; d.entries[k] = v; }
const sorted = {}; for (const k of Object.keys(d.entries).sort((a, b) => a.localeCompare(b))) sorted[k] = d.entries[k];
d.entries = sorted;
fs.writeFileSync(f, JSON.stringify(d, null, 1) + '\n');
console.log('added', n, 'changed', changed, 'total', Object.keys(sorted).length);
