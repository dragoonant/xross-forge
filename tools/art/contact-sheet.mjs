// Labelled 4x4 contact sheets for the QC pass (KB: "QC with contact sheets of 16 and a checklist").
// Node picks the tiles, python3 + PIL (installed) draws them (tools/art/contact-sheet.py).
//   node tools/art/contact-sheet.mjs                 sheets for every deck and the UI plates -> tools/out/contact/
//   node tools/art/contact-sheet.mjs --set ST01      one deck (ST01 | ST02 | ui | audition | all)
//   node tools/art/contact-sheet.mjs --mock          read the mock masters under tools/out/mock/ and write there
// Output: <set>-<n>.jpg, 16 tiles each in key order; a tile without a master shows "missing".
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT, parseArgs, artPaths, loadModel, faceKeys, uiKeys, masterFile, rel } from './lib.mjs';
import { CANDIDATES } from './style.mjs';

const args = parseArgs(process.argv.slice(2), ['mock']);
const P = artPaths(args);
const M = loadModel();
const which = args.get('set', 'all');
const py = path.join(path.dirname(fileURLToPath(import.meta.url)), 'contact-sheet.py');

const faces = faceKeys(M.CARDS);
const sets = {
  ST01: faces.filter((k) => k.startsWith('ST01-')),
  ST02: faces.filter((k) => k.startsWith('ST02-')),
  ui: uiKeys(M.IDENT),
};
const nameOf = (k) => (k.startsWith('ui/') ? '' : M.CARDS[k.replace(/\/awakened$/, '')].nameEn + (k.endsWith('/awakened') ? ' (awakened)' : ''));
const tiles = {
  ...Object.fromEntries(Object.entries(sets).map(([s, ks]) => [s, ks.map((k) => ({ path: masterFile(P, k), label: k, sub: nameOf(k) }))])),
  audition: Object.entries(CANDIDATES).map(([id, c]) => ({ path: path.join(P.audition, id + '.png'), label: id + '  ' + c.label, sub: 'leader ST01-001, front face' })),
};
const want = which === 'all' ? ['audition', 'ST01', 'ST02', 'ui'] : [which];
if (want.some((w) => !tiles[w])) { console.log(`contact-sheet: unknown set "${which}" (ST01 | ST02 | ui | audition | all)`); process.exit(2); }

fs.mkdirSync(P.contact, { recursive: true });
let n = 0, shown = 0;
for (const s of want) {
  const list = tiles[s];
  const have = list.filter((t) => fs.existsSync(t.path)).length;
  if (s === 'audition' && !have) continue;           // no audition rendered yet: no sheet
  for (let i = 0; i < list.length; i += 16) {
    const out = path.join(P.contact, `${s}-${i / 16 + 1}.jpg`);
    const spec = { out, cols: 4, rows: 4, title: `${s} sheet ${i / 16 + 1}  (${list.slice(i, i + 16).filter((t) => fs.existsSync(t.path)).length}/${list.slice(i, i + 16).length} masters)`, tiles: list.slice(i, i + 16) };
    // Windows installs expose `python` (the `python3` name is the Store's install alias); PYTHON overrides either.
    const r = spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-I', py], { input: JSON.stringify(spec), encoding: 'utf8' });
    if (r.status !== 0) { console.log('contact-sheet: python failed: ' + (r.stderr || '').slice(-300)); process.exit(1); }
    n++; shown += spec.tiles.filter((t) => fs.existsSync(t.path)).length;
  }
}
console.log(`contact-sheet: ${n} sheet(s), ${shown} master tile(s) shown, written to ${P.scratch ? rel(P.contact) : 'tools/out/contact'}/`);
void ROOT;
