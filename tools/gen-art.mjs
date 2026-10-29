// Renders the art prompts through Hugging Face Inference Providers (PLAN D4: FLUX family; D6: art
// budget $8; D17: the key is an environment variable and is never printed, logged or written).
//
//   node tools/gen-art.mjs --dry-run                 the full plan (audition + 58 faces + UI plates) and the cost estimate; zero network calls
//   node tools/gen-art.mjs --mock                    the same run with generated placeholder PNGs into tools/out/mock/ (no key, no network, no ledger)
//   node tools/gen-art.mjs --probe                   one 256x256 schnell call to verify the key and the route; prints status only
//   node tools/gen-art.mjs --audition                10 STYLE candidates on ONE subject (leader ST01-001, front face), fixed seed
//   node tools/gen-art.mjs [--limit 3]               faces + UI plates (refuses until STYLE is set in tools/art/style.mjs)
// Flags: --only <key[,key]> (exact match; keys: ST01-001, ST01-001/awakened, ui/title, audition/A)
//        --limit N (cap real/mock renders)   --force (archive the old master to art/archive/ first, re-roll the seed)
//        --seed N (seed bump: seed = FNV-1a(key:N); default 0)   --model dev|schnell (default dev = FLUX.1-dev)
//        --provider hf-inference|fal-ai (default hf-inference)   --url <endpoint> (override the route)
//        --budget USD (override the $8 art cap: only on the owner's word)   --style <A..J> (provisional candidate for --dry-run/--mock)
//        --ledger <file> (test only)   --art-root <dir> (redirect art/ and the manifest; --mock implies tools/out/mock)
// Idempotent: a key whose master exists is skipped. 429/502/503/504 back off and retry (model loading).
// Every real call appends {date, key, model, provider, seconds, estCostUSD, ...} to docs/art-ledger.json;
// a run whose estimate would push the art total past the budget is refused before it starts.
// Masters: art/masters/<key with / as __>.png (gitignored); audition: art/masters/audition/<id>.png.
// Next: node tools/art/contact-sheet.mjs, then shrink-art, write-manifest, check-art (docs/art.md).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ROOT, BUDGET_USD, parseArgs, artPaths, rel, stem, masterFile, resolveModel, estCostUSD, COST_SOURCE, readLedger, ledgerTotal,
  appendLedger, apiKey, fnvSeed, AUDITION_SEED, mockPng, isPng, isJpeg, isWebp, sha1,
} from './art/lib.mjs';
import { loadSources, composeAll, composeAudition, resolveStyle } from './build-art-prompts.mjs';

const args = parseArgs(process.argv.slice(2), ['dry-run', 'mock', 'probe', 'audition', 'force']);
const dry = args.has('dry-run'), mock = args.has('mock'), audition = args.has('audition'), force = args.has('force'), probe = args.has('probe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const die = (msg, code = 2) => { console.log(msg); process.exit(code); };

const P = artPaths(args);
if (mock && !P.scratch) die('gen-art: --mock with an art root equal to the repo would put placeholder images in art/ (refused).');
const model = (() => { try { return resolveModel(args.get('model', 'dev')); } catch (e) { return die(e.message); } })();
const provider = args.get('provider', 'hf-inference');
if (!['hf-inference', 'fal-ai'].includes(provider)) die(`gen-art: unknown provider "${provider}" (hf-inference | fal-ai)`);
const budget = args.num('budget', BUDGET_USD);

// ---- providers ---------------------------------------------------------------------------------
// hf-inference: POST https://router.huggingface.co/hf-inference/models/<model> with
//   {inputs, parameters:{width,height,seed,num_inference_steps,guidance_scale}} -> image bytes.
// fal-ai (the router's fal route; use it if hf-inference refuses the model):
//   POST https://router.huggingface.co/fal-ai/<fal model path> with
//   {prompt, image_size:{width,height}, seed, num_inference_steps, guidance_scale, num_images:1, output_format:'png', sync_mode:true}
//   -> JSON {images:[{url}]} (a URL or a data: URI).
const ROUTES = {
  'hf-inference': {
    url: (m) => `https://router.huggingface.co/hf-inference/models/${m.id}`,
    body: (m, j) => ({ inputs: j.prompt, parameters: { width: j.w, height: j.h, seed: j.seed, num_inference_steps: j.steps ?? m.steps, guidance_scale: m.guidance } }),
  },
  'fal-ai': {
    url: (m) => `https://router.huggingface.co/fal-ai/${m.fal}`,
    body: (m, j) => ({ prompt: j.prompt, image_size: { width: j.w, height: j.h }, seed: j.seed, num_inference_steps: j.steps ?? m.steps, guidance_scale: m.guidance, num_images: 1, output_format: 'png', sync_mode: true }),
  },
};
const endpoint = args.get('url', null) || ROUTES[provider].url(model);

// ---- the plan ----------------------------------------------------------------------------------
const S = loadSources();
const rs = resolveStyle(args.get('style', null) || ((dry || mock) && !audition ? 'A' : null));
function plan() {
  const jobs = [];
  const aud = composeAudition(S);
  if (aud.problems.length) die('gen-art: REFUSED, the audition prompts fail the lint:\n  ' + aud.problems.slice(0, 20).join('\n  '), 1);
  const wantAudition = audition || ((dry || mock) && !args.get('only', null));
  if (wantAudition) for (const [key, p] of Object.entries(aud.prompts)) jobs.push({ section: 'audition', key, file: path.join(P.audition, key.slice('audition/'.length) + '.png'), seed: AUDITION_SEED, ...p });
  if (!audition) {
    if (rs.error) die('gen-art: REFUSED - ' + rs.error, 2);
    if (rs.provisional && !(dry || mock)) die('gen-art: REFUSED - a provisional --style candidate may only plan (--dry-run) or mock; set STYLE in tools/art/style.mjs once the owner picks.', 2);
    const all = composeAll(rs.style, rs.uiStyle, S);
    if (all.problems.length) die('gen-art: REFUSED, the prompts fail the lint:\n  ' + all.problems.slice(0, 30).join('\n  '), 1);
    const bump = args.has('seed') ? args.num('seed', 0) : null;
    for (const [key, p] of Object.entries(all.prompts)) {
      const prior = !dry && !mock && force ? readLedger(P.ledger).entries.filter((e) => e.key === key).length : 0;
      jobs.push({ section: key.startsWith('ui/') ? 'ui' : 'faces', key, file: masterFile(P, key), seed: fnvSeed(`${key}:${bump ?? prior}`), ...p });
    }
  }
  const only = args.get('only', null);
  if (only) {
    const want = only.split(',');
    for (const w of want) if (!jobs.some((j) => j.key === w)) die(`gen-art: unknown key "${w}" (--only is an exact match; keys look like ST01-001, ST01-001/awakened, ui/title, audition/A)`);
    return jobs.filter((j) => want.includes(j.key));
  }
  return jobs;
}

// ---- image bytes -> PNG master -----------------------------------------------------------------
function toPng(buf, outFile) {
  if (isPng(buf)) { fs.writeFileSync(outFile, buf); return; }
  if (!(isJpeg(buf) || isWebp(buf))) throw new Error('the response is not an image (' + buf.length + ' bytes)');
  const tmp = outFile + '.tmp.' + (isJpeg(buf) ? 'jpg' : 'webp');
  fs.writeFileSync(tmp, buf);
  try { execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', tmp, outFile]); } finally { fs.rmSync(tmp, { force: true }); }
}

// ---- one real call -----------------------------------------------------------------------------
class Fatal extends Error {}
async function callOnce(job, token) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'image/png, application/json' },
    body: JSON.stringify(ROUTES[provider].body(model, job)),
    signal: AbortSignal.timeout(240000),
  });
  const ct = r.headers.get('content-type') || '';
  if (r.ok) {
    if (ct.startsWith('image/')) return Buffer.from(await r.arrayBuffer());
    const j = await r.json();
    const u = j && j.images && j.images[0] && (j.images[0].url || j.images[0]);
    if (typeof u !== 'string') throw new Fatal('HTTP 200 but the JSON has no images[0].url (provider ' + provider + ')');
    if (u.startsWith('data:')) return Buffer.from(u.slice(u.indexOf(',') + 1), 'base64');
    const img = await fetch(u, { signal: AbortSignal.timeout(120000) });
    if (!img.ok) throw new Error('image download HTTP ' + img.status);
    return Buffer.from(await img.arrayBuffer());
  }
  let detail = ''; try { detail = (await r.text()).slice(0, 240).replace(/\s+/g, ' '); } catch { /* ignore */ }
  const err = new Error(`HTTP ${r.status} ${detail}`); err.status = r.status; err.retryAfter = Number(r.headers.get('retry-after')) || 0;
  try { err.estimated = Number(JSON.parse(detail).estimated_time) || 0; } catch { /* not JSON */ }
  throw err;
}
async function render(job, token) {
  let last;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try { return await callOnce(job, token); }
    catch (e) {
      last = e;
      if (e instanceof Fatal) throw e;
      const st = e.status;
      if (st === 401 || st === 403) throw new Fatal(`${e.message}\n  The key was refused. Check the token has the "Make calls to Inference Providers" permission and that the FLUX.1-dev licence was accepted on huggingface.co (or use --model schnell).`);
      if (st === 402) throw new Fatal(`${e.message}\n  Credits are used up for this provider. Stop and tell the owner; do not raise --budget on your own.`);
      if (st === 404) throw new Fatal(`${e.message}\n  The route does not serve this model. Try --provider fal-ai (docs/art.md), or run --probe.`);
      if (st === 400 || st === 422) throw new Fatal(e.message);
      const wait = Math.min(90, Math.max(e.retryAfter || 0, e.estimated || 0, 6 * 2 ** (attempt - 1)));
      console.log(`  retry ${job.key} (${attempt}/6) after ${wait}s: ${st ? 'HTTP ' + st : e.name + ' ' + e.message.slice(0, 80)}`);
      await sleep(wait * 1000);
    }
  }
  throw last;
}

// ---- main --------------------------------------------------------------------------------------
const fmt = (n) => '$' + (n > 0 && n < 0.1 ? n.toFixed(3) : n.toFixed(2));
async function main() {
  if (probe) {
    const key = dry ? null : apiKey();
    const job = { key: 'probe', prompt: 'a small blue circle on a plain pale background, wordless', w: 256, h: 256, seed: 1, steps: 4 };
    const m = resolveModel('schnell');
    const est = estCostUSD(m.id, 256, 256);
    const url = args.get('url', null) || ROUTES[provider].url(m);
    if (dry) { console.log(`probe (dry-run): would POST one 256x256 ${m.id} call to ${url} (est ${fmt(est)}); zero network calls made`); return; }
    const t0 = Date.now();
    try {
      const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${key.value}`, 'Content-Type': 'application/json', Accept: 'image/png, application/json' }, body: JSON.stringify(ROUTES[provider].body(m, job)), signal: AbortSignal.timeout(120000) });
      const secs = Math.round((Date.now() - t0) / 100) / 10;
      const ct = r.headers.get('content-type') || '?';
      if (r.ok) appendLedger(P.ledger, { date: new Date().toISOString(), key: 'probe', model: m.id, provider, seconds: secs, estCostUSD: est });
      console.log(`probe: ${r.ok ? 'OK' : 'FAILED'} HTTP ${r.status} ${ct} in ${secs}s (provider ${provider}, model ${m.short}, key from ${key.name})`);
      if (!r.ok) process.exitCode = 1;
    } catch (e) { console.log(`probe: FAILED ${e.name}: ${String(e.message).slice(0, 120)} (provider ${provider})`); process.exitCode = 1; }
    return;
  }

  const jobs = plan();
  const todo = jobs.filter((j) => force || !fs.existsSync(j.file));
  const limit = args.num('limit', Infinity);
  const run = todo.slice(0, limit);
  const unit = (j) => estCostUSD(model.id, j.w, j.h);
  const runCost = run.reduce((s, j) => s + unit(j), 0);
  const ledger = readLedger(P.ledger);
  const spent = ledgerTotal(ledger);

  const real = !dry && !mock;
  if (dry) {
    console.log('gen-art plan (dry-run: zero network calls, nothing written)');
    console.log(`  style  : ${audition ? 'the 10 audition candidates' : rs.label}`);
    console.log(`  model  : ${model.id} via ${provider}: ${endpoint}`);
    console.log(`  steps  : ${model.steps}, guidance ${model.guidance}; cards 832x1216, backdrops 1280x768`);
    console.log(`  cost   : ${COST_SOURCE}`);
    for (const sec of ['audition', 'faces', 'ui']) {
      const js = jobs.filter((j) => j.section === sec);
      if (!js.length) continue;
      const need = js.filter((j) => !fs.existsSync(j.file));
      const cost = need.reduce((s, j) => s + unit(j), 0);
      const title = sec === 'audition' ? `audition: 10 STYLE candidates on ${'ST01-001'} (front face), seed ${AUDITION_SEED} (--audition)` : sec === 'faces' ? 'card faces (leaders twice, every card once)' : 'UI plates';
      console.log(`\n[${sec}] ${title}: ${js.length} planned, ${js.length - need.length} master(s) already present, ${need.length} to render, est ${fmt(cost)}`);
      for (const j of js) console.log(`  ${fs.existsSync(j.file) ? 'have' : 'todo'} ${j.key.padEnd(20)} ${j.w}x${j.h} seed ${String(j.seed).padStart(10)} ${fmt(unit(j))} len ${String(j.prompt.length).padStart(3)}  ${j.prompt.slice(0, 70).replace(/\s+/g, ' ')}...`);
    }
    const all = todo.reduce((s, j) => s + unit(j), 0);
    const total = spent + all;
    console.log(`\nestimate: ${todo.length} render(s) = ${fmt(all)} (${audition ? 'audition only' : 'audition + faces + UI plates'}); ledger so far ${fmt(spent)}; total ${fmt(total)} of the ${fmt(budget)} art budget -> ${total > budget ? 'REFUSED (over budget)' : 'within budget'}`);
    console.log(`        each re-roll adds about ${fmt(estCostUSD(model.id, 832, 1216))}; --model schnell would cost about ${fmt(todo.reduce((s, j) => s + estCostUSD('black-forest-labs/FLUX.1-schnell', j.w, j.h), 0))} for the same plan`);
    if (rs.provisional && !audition) console.log('note: STYLE is not set; this plan uses a provisional candidate. Real runs refuse until the owner picks (docs/art.md).');
    return;
  }

  if (real) {
    if (spent + runCost > budget) die(`gen-art: REFUSED - this run is estimated at ${fmt(runCost)}; with ${fmt(spent)} already in docs/art-ledger.json that is ${fmt(spent + runCost)}, over the ${fmt(budget)} art budget (PLAN D6). Use --limit, or --budget only on the owner's word.`, 1);
  }
  const key = real ? apiKey() : null;
  fs.mkdirSync(P.audition, { recursive: true }); fs.mkdirSync(P.archive, { recursive: true });
  let done = 0, failed = [], running = spent;
  console.log(`gen-art: ${mock ? 'MOCK (placeholder PNGs, no network, no ledger)' : 'REAL'} run: ${run.length} of ${todo.length} pending, est ${fmt(runCost)}, model ${model.short} via ${provider}, root ${P.scratch ? rel(P.root) : 'repo'}${key ? ', key from ' + key.name : ''}`);
  for (const j of run) {
    if (real && running + unit(j) > budget) { console.log(`gen-art: stopping, the next call would pass the ${fmt(budget)} budget`); break; }
    fs.mkdirSync(path.dirname(j.file), { recursive: true });
    if (fs.existsSync(j.file)) {
      if (!force) continue;
      fs.renameSync(j.file, path.join(P.archive, `${stem(j.key)}-${Date.now()}.png`));
    }
    const t0 = Date.now();
    try {
      if (mock) { fs.writeFileSync(j.file, mockPng(j.key, j.w, j.h)); }
      else {
        const buf = await render(j, key.value);
        toPng(buf, j.file);
        const secs = Math.round((Date.now() - t0) / 100) / 10;
        appendLedger(P.ledger, { date: new Date().toISOString(), key: j.key, model: model.id, provider, seconds: secs, estCostUSD: unit(j), seed: j.seed, promptSha1: sha1(j.prompt).slice(0, 12) });
        running += unit(j);
      }
      done++;
      console.log(`[${done}] ${j.key} ${Math.round((Date.now() - t0) / 100) / 10}s -> ${rel(j.file)}`);
    } catch (e) {
      failed.push(j.key);
      console.log(`  FAILED ${j.key}: ${String(e.message).split('\n')[0].slice(0, 200)}`);
      if (e instanceof Fatal) { console.log(String(e.message).split('\n').slice(1).join('\n')); break; }
    }
  }
  const left = todo.length - done;
  console.log(`gen-art: ${done} rendered, ${jobs.length - todo.length} already present, ${left} still pending${failed.length ? '; FAILED: ' + failed.join(', ') : ''}${real ? `; ledger ${fmt(running)} of ${fmt(budget)}` : ''}`);
  if (failed.length) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.log(String(e.message || e)); process.exit(e instanceof Fatal ? 1 : 2); });
}
