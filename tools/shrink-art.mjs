// Delivery encodes (PLAN D4; KB card-games.md §7): masters -> WebP with ffmpeg (libwebp).
//   cards / leaders  art/masters/<key>.png -> art/cards/<key with / as __>.webp  560 px wide, q85
//   UI backdrops     art/masters/ui__<name>.png -> art/ui/<name>.webp             up to 1280 px wide, q82
//   UI card backs    same, 560 px wide, q85
// The bottom 5% is cropped first on every plate (models sign their work there). Masters stay in the
// gitignored art/masters/; only the encodes are committed. Skips a delivery file newer than its master.
// Refuses a mock master (tEXt "xross-mock") in a real art root. Never run it while gen-art is rendering.
//   node tools/shrink-art.mjs [--force] [--only <key[,key]>] [--mock | --art-root <dir>]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs, artPaths, loadModel, faceKeys, uiKeys, keyOfStem, isUi, deliveryRel, hasMockMark, pngSize, readHead, rel } from './art/lib.mjs';

const args = parseArgs(process.argv.slice(2), ['force', 'mock']);
const P = artPaths(args);
const M = loadModel();
const known = new Set([...faceKeys(M.CARDS), ...uiKeys(M.IDENT)]);
const only = args.get('only', null) ? args.get('only').split(',') : null;
if (only) for (const o of only) if (!known.has(o)) { console.log(`shrink-art: unknown key "${o}"`); process.exit(2); }

let n = 0, kept = 0, bytes = 0, bad = 0;
const files = fs.existsSync(P.masters) ? fs.readdirSync(P.masters).filter((f) => f.endsWith('.png')).sort() : [];
for (const f of files) {
  const key = keyOfStem(f.slice(0, -4));
  if (!known.has(key)) { console.log(`FAIL shrink-art: master ${f} is not a known key`); bad++; continue; }
  if (only && !only.includes(key)) continue;
  const inF = path.join(P.masters, f);
  if (!P.scratch && hasMockMark(inF)) { console.log(`FAIL shrink-art: ${rel(inF)} is a MOCK master; refusing to encode it into the real art/ folder`); bad++; continue; }
  const sz = pngSize(readHead(inF, 32));
  if (!sz) { console.log(`FAIL shrink-art: ${rel(inF)} is not a PNG`); bad++; continue; }
  const backdrop = isUi(key) && M.IDENT.ui[key.slice(3)].kind === 'backdrop';
  const width = backdrop ? Math.min(1280, sz.w) : 560;
  const q = backdrop ? '82' : '85';
  const outF = path.join(P.root, deliveryRel(key));
  if (!args.has('force') && fs.existsSync(outF) && fs.statSync(outF).mtimeMs >= fs.statSync(inF).mtimeMs) { kept++; bytes += fs.statSync(outF).size; continue; }
  fs.mkdirSync(path.dirname(outF), { recursive: true });
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', inF, '-vf', `crop=iw:trunc(ih*0.95/2)*2:0:0,scale=${width}:-2:flags=lanczos`, '-c:v', 'libwebp', '-quality', q, '-compression_level', '6', outF]);
  n++; bytes += fs.statSync(outF).size;
}
console.log(`shrink-art: ${n} written, ${kept} up to date, ${(bytes / 1048576).toFixed(1)} MB delivered${bad ? `, ${bad} problem(s)` : ''}`);
process.exit(bad ? 1 : 0);
