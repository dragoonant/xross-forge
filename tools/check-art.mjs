// The art gate (KB: presence, zero length, magic bytes, truncation, case, git-tracked). Checks
// data/art-manifest.js against the files in art/ and against data/cards.js:
//   - every manifest entry: known key, expected kind and path, file exists with exact case, non-empty,
//     real WebP (RIFF....WEBP), width/height sane for its kind, size sane, tracked by git
//   - no stray .webp in art/cards or art/ui that the manifest omits, no master tracked by git
//   - every emitted card face (58: leaders twice) and every UI plate has an entry
//   - the ledger total stays within the art budget
// Coverage and the git-tracked rule only FAIL when REQUIRE_ART is true in tools/validate-data.mjs (or
// with --require); otherwise this prints `pending (N of 58 faces)` and exits 0. Corrupt or malformed
// files always fail.
//   node tools/check-art.mjs [--require] [--mock | --art-root <dir>]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { ROOT, BUDGET_USD, parseArgs, artPaths, loadModel, faceKeys, uiKeys, kindOf, deliveryRel, keyOfDeliveryRel, isUi, isWebp, webpSize, readHead, readLedger, ledgerTotal } from './art/lib.mjs';

const args = parseArgs(process.argv.slice(2), ['require', 'mock']);
const P = artPaths(args);
const M = loadModel();
const requireArt = args.has('require') || /const\s+REQUIRE_ART\s*=\s*true\b/.test(fs.readFileSync(path.join(ROOT, 'tools', 'validate-data.mjs'), 'utf8'));

const bad = [], soft = [];
const fail = (m) => bad.push(m);
const needed = (m) => (requireArt ? bad : soft).push(m);

// ---- the manifest, loaded under vm like every data file -------------------------------------------
let ART = {};
if (fs.existsSync(P.manifest)) {
  const ctx = { console }; ctx.globalThis = ctx; ctx.window = ctx; vm.createContext(ctx);
  try { vm.runInContext(fs.readFileSync(P.manifest, 'utf8'), ctx, { filename: 'art-manifest.js' }); ART = (ctx.XS && ctx.XS.ART) || null; }
  catch (e) { fail(`art-manifest.js does not run: ${e.message}`); }
  if (!ART || typeof ART !== 'object') { fail('art-manifest.js does not define XS.ART'); ART = {}; }
} else fail('data/art-manifest.js is missing');

const faces = faceKeys(M.CARDS), uis = uiKeys(M.IDENT), known = new Set([...faces, ...uis]);

// git-tracked set (real root only; a scratch root is not in git)
let tracked = null;
if (!P.scratch) {
  const r = spawnSync('git', ['ls-files', '--', 'art'], { cwd: ROOT, encoding: 'utf8' });
  tracked = r.status === 0 ? new Set(r.stdout.split('\n').filter(Boolean)) : null;
  if (tracked) for (const t of tracked) if (t.startsWith('art/masters/') || t.startsWith('art/archive/')) fail(`${t}: a master/archive is tracked by git (only delivery encodes are committed)`);
}

// ---- every manifest entry --------------------------------------------------------------------------
for (const [key, e] of Object.entries(ART)) {
  if (!known.has(key)) { fail(`${key}: manifest entry for a key that is not an emitted face or ui plate`); continue; }
  if (!e || !e.file || !e.kind || !e.prompt) { fail(`${key}: entry lacks file, kind or prompt`); continue; }
  if (e.kind !== kindOf(key, M.CARDS)) fail(`${key}: kind "${e.kind}" should be "${kindOf(key, M.CARDS)}"`);
  if (e.file !== deliveryRel(key)) fail(`${key}: file "${e.file}" should be "${deliveryRel(key)}"`);
  if (e.prompt !== key) fail(`${key}: prompt id "${e.prompt}" should be the key`);
  const f = path.join(P.root, e.file);
  if (!fs.existsSync(f)) { fail(`${key}: missing file ${e.file}`); continue; }
  if (!fs.readdirSync(path.dirname(f)).includes(path.basename(f))) { fail(`${key}: case mismatch for ${e.file}`); continue; }
  const sz = fs.statSync(f).size;
  if (!sz) { fail(`${key}: zero-length ${e.file}`); continue; }
  const head = readHead(f, 40);
  if (!isWebp(head)) { fail(`${key}: not a WebP (magic bytes) ${e.file}`); continue; }
  if (head.readUInt32LE(4) + 8 !== sz) fail(`${key}: truncated ${e.file} (RIFF says ${head.readUInt32LE(4) + 8} bytes, file has ${sz})`);
  const d = webpSize(head);
  const backdrop = isUi(key) && M.IDENT.ui[key.slice(3)].kind === 'backdrop';
  if (!d) fail(`${key}: cannot read the WebP dimensions of ${e.file}`);
  else if (backdrop) {
    if (d.w < 960 || d.w > 1920 || d.h / d.w < 0.45 || d.h / d.w > 0.65) fail(`${key}: ${d.w}x${d.h} is not a landscape backdrop (width 960-1920, ratio 0.45-0.65)`);
  } else if (d.w !== 560 || d.h / d.w < 1.3 || d.h / d.w > 1.5) fail(`${key}: ${d.w}x${d.h} should be 560 wide with a portrait ratio 1.3-1.5`);
  if (sz < 3000 || sz > (backdrop ? 900000 : 400000)) fail(`${key}: ${sz} bytes is outside the sane range for ${e.file}`);
  if (tracked && !tracked.has(e.file)) needed(`${key}: ${e.file} is not tracked by git (git add it with the manifest)`);
}
// stray delivery files the manifest does not list
for (const dir of ['cards', 'ui']) {
  const d = path.join(P.root, 'art', dir);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) {
    const r = `art/${dir}/${f}`;
    if (f.endsWith('.webp') && !ART[keyOfDeliveryRel(r)]) fail(`${r}: delivery file with no manifest entry (run node tools/write-manifest.mjs)`);
    else if (!f.endsWith('.webp')) fail(`${r}: unexpected non-WebP file in the delivery folder`);
  }
}
// ---- coverage ---------------------------------------------------------------------------------------
const missFaces = faces.filter((k) => !ART[k]), missUi = uis.filter((k) => !ART[k]);
if (requireArt) for (const k of [...missFaces, ...missUi]) fail(`${k}: no art entry (REQUIRE_ART is true)`);

// ---- ledger -----------------------------------------------------------------------------------------
let spent = 0;
try { spent = ledgerTotal(readLedger(P.ledger)); } catch (e) { fail('docs/art-ledger.json: ' + e.message); }
if (spent > BUDGET_USD) fail(`docs/art-ledger.json: art spend $${spent.toFixed(2)} is over the $${BUDGET_USD} budget (PLAN D6)`);

for (const m of bad) console.log('FAIL check-art: ' + m);
for (const m of soft.slice(0, 6)) console.log('warn check-art (REQUIRE_ART is false): ' + m);
if (soft.length > 6) console.log(`warn check-art: ... and ${soft.length - 6} more`);
const have = faces.length - missFaces.length, haveUi = uis.length - missUi.length;
const cover = `${have} of ${faces.length} faces, ${haveUi} of ${uis.length} ui plates; ledger $${spent.toFixed(2)} of $${BUDGET_USD}`;
if (bad.length) console.log(`check-art: ${bad.length} problem(s) (${cover})`);
else if (missFaces.length || missUi.length) console.log(`check-art: pending (${missFaces.length} of ${faces.length} faces, ${missUi.length} of ${uis.length} ui plates not yet in the manifest; REQUIRE_ART is ${requireArt}; ledger $${spent.toFixed(2)} of $${BUDGET_USD})`);
else console.log(`check-art: ok (${cover}${soft.length ? '; ' + soft.length + ' warning(s)' : ''})`);
process.exit(bad.length ? 1 : 0);
