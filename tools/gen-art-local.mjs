// Renders tools/out/art-prompts.json through the owner's LOCAL Flux Studio (PLAN D18: the same prompts,
// keys, masters and ledger as tools/gen-art.mjs, with FLUX.2 klein on this PC instead of Hugging Face).
//   Studio: FLUX_URL (default http://localhost:7880); `node server.js` in the 3D Model Generation repo's
//   flux-studio folder. POST /api/jobs {model, prompt, aspect, megapixels, batch:1, seed} -> {id};
//   GET /api/jobs/<id> until done; GET /files/<id>/<image>.
//
//   node tools/gen-art-local.mjs --audition            the 10 STYLE candidates on ST01-001 -> art/masters/audition/<ID>.png
//   node tools/gen-art-local.mjs [--only k,k] [--limit N] [--force] [--seed N] [--dry-run]   faces + UI plates
// Refuses a provisional prompt file (STYLE not set) for everything but the audition, like gen-art.mjs.
// Masters: art/masters/<key with / as __>.png (gitignored). Idempotent: an existing master is skipped;
// --force archives it to art/archive/ and bumps the seed (seed = FNV-1a(key:N); N = --seed, default 0).
// Sizes: 832x1216 prompts render at aspect 2:3 (the studio's 832x1216); 1280x768 at 16:9 (1344x768,
// shrink-art scales it to 1280). Every render appends a $0 entry to docs/art-ledger.json (provider
// "flux-studio-local") so each picture still traces to its prompt hash and seed.
// Then: node tools/art/contact-sheet.mjs, shrink-art, write-manifest, check-art (docs/art.md).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, parseArgs, artPaths, rel, masterFile, appendLedger, fnvSeed, AUDITION_SEED, sha1 } from './art/lib.mjs';

const args = parseArgs(process.argv.slice(2), ['audition', 'force', 'dry-run']);
const audition = args.has('audition'), force = args.has('force'), dry = args.has('dry-run');
const P = artPaths(args);
const FLUX_URL = (process.env.FLUX_URL || 'http://localhost:7880').replace(/\/$/, '');
const MODEL = args.get('model', 'klein');
const planFile = path.join(ROOT, 'tools', 'out', 'art-prompts.json');
if (!fs.existsSync(planFile)) { console.log('gen-art-local: no tools/out/art-prompts.json (run node tools/build-art-prompts.mjs first)'); process.exit(2); }
const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
if (!audition && plan.provisional) { console.log('gen-art-local: the prompt file is PROVISIONAL (STYLE is not set in tools/art/style.mjs); only --audition may run'); process.exit(2); }
const table = audition ? plan.audition : plan.prompts;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const aspectOf = (e) => (e.w > e.h ? '16:9' : '2:3');
const outFile = (key) => (audition ? path.join(P.audition, key.slice('audition/'.length) + '.png') : masterFile(P, key));
const seedOf = (key) => (audition ? AUDITION_SEED : fnvSeed(key + ':' + args.get('seed', '0')));

async function settings(freeAfter) { await fetch(FLUX_URL + '/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ freeAfter }) }).catch(() => {}); }
async function flux(key, e) {
  const body = { model: MODEL, prompt: e.prompt, aspect: aspectOf(e), megapixels: 1, batch: 1, seed: seedOf(key) };
  const r = await fetch(FLUX_URL + '/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const job = await r.json();
  if (!r.ok) throw new Error('flux ' + r.status + ' ' + (job.error || ''));
  const t0 = Date.now();
  for (;;) {
    await sleep(1500);
    const j = await (await fetch(FLUX_URL + '/api/jobs/' + job.id)).json();
    if (j.status === 'done') return Buffer.from(await (await fetch(FLUX_URL + '/files/' + j.id + '/' + j.images[0])).arrayBuffer());
    if (j.status === 'failed' || j.status === 'cancelled') throw new Error('flux job ' + j.status + ': ' + (j.error || ''));
    if (Date.now() - t0 > 15 * 60 * 1000) { await fetch(FLUX_URL + '/api/jobs/' + job.id + '/cancel', { method: 'POST' }).catch(() => {}); throw new Error('flux: timed out after 15 min'); }
  }
}

const only = args.get('only', null) ? args.get('only').split(',') : null;
if (only) for (const o of only) if (!table[o]) { console.log('gen-art-local: unknown key "' + o + '"'); process.exit(2); }
const keys = Object.keys(table).filter((k) => !only || only.includes(k));
const limit = args.num('limit', 9999);
let done = 0, skipped = 0; const failed = []; const t0 = Date.now();
if (!dry) { fs.mkdirSync(audition ? P.audition : P.masters, { recursive: true }); fs.mkdirSync(P.archive, { recursive: true }); await settings(false); }
try {
  for (const key of keys) {
    if (done >= limit) break;
    const e = table[key], out = outFile(key);
    if (fs.existsSync(out) && !force) { skipped++; continue; }
    if (dry) { console.log('[dry-run] ' + key + ' ' + aspectOf(e) + ' seed ' + seedOf(key) + ': ' + e.prompt.slice(0, 100) + '...'); done++; continue; }
    if (force && fs.existsSync(out)) fs.renameSync(out, path.join(P.archive, path.basename(out, '.png') + '-' + Date.now() + '.png'));
    const t1 = Date.now(); let buf = null;
    for (let attempt = 1; attempt <= 3 && !buf; attempt++) {
      try { buf = await flux(key, e); } catch (err) { console.log('  retry ' + key + ' (' + attempt + '): ' + err.message.slice(0, 160)); await sleep(4000 * attempt); }
    }
    if (!buf) { failed.push(key); console.log('  FAILED ' + key + ' (rerun to retry)'); continue; }
    fs.writeFileSync(out, buf); done++;
    const secs = Math.round((Date.now() - t1) / 1000);
    appendLedger(P.ledger, { date: new Date().toISOString(), key, model: 'FLUX.2-klein-4B', provider: 'flux-studio-local', seconds: secs, estCostUSD: 0, seed: seedOf(key), promptSha1: sha1(e.prompt) });
    console.log('[' + done + '] ' + key + ' ' + secs + 's -> ' + rel(out));
  }
} finally {
  if (!dry) { await settings(true); await fetch(FLUX_URL + '/api/backend/free', { method: 'POST' }).catch(() => {}); }
}
console.log('gen-art-local: ' + (dry ? 'dry-run ' : '') + done + ' rendered, ' + skipped + ' present' + (failed.length ? ', FAILED ' + failed.join(', ') : '') + ', ' + Math.round((Date.now() - t0) / 1000) + ' s, ' + FLUX_URL + ' (' + MODEL + ')');
console.log('REMAINING ' + keys.filter((k) => !fs.existsSync(outFile(k))).length);
if (failed.length) process.exitCode = 1;
