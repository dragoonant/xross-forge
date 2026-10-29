// Shared helpers for the art pipeline (M5): paths, key <-> file naming, the data model, the cost
// table and ledger, the HF key lookup, a pure-JS PNG writer for --mock, and image-header readers.
// Node built-ins only (rule 1: no dependencies). Never prints, logs or writes the API key.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BUDGET_USD = 8;                       // PLAN D6: $25 total for art and audio, art at most $8
export const MOCK_MARK = 'xross-mock';             // tEXt keyword in every mock master; shrink-art refuses it in a real root

// ---- arguments ---------------------------------------------------------------------------------
// parseArgs(argv, ['dry-run', ...booleans]) -> { has(flag), get(opt, default), list }
export function parseArgs(argv, booleans = []) {
  const flags = new Set(), opts = new Map();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    if (booleans.includes(k)) flags.add(k);
    else { opts.set(k, argv[i + 1]); i++; }
  }
  return { has: (k) => flags.has(k), get: (k, d) => (opts.has(k) ? opts.get(k) : d), num: (k, d) => (opts.has(k) ? Number(opts.get(k)) : d) };
}

// ---- paths -------------------------------------------------------------------------------------
// The art root is the repo for real runs. --mock (or --art-root <dir>) redirects art/, data/art-manifest.js
// and the contact sheets into a scratch folder so a mock run can never leave images in art/cards/ or
// entries in data/art-manifest.js. The ledger is docs/art-ledger.json (--ledger <file> only for tests of the real code path against a local server).
export function artPaths(args) {
  const given = args.get('art-root', null);
  const root = given ? path.resolve(ROOT, given) : args.has('mock') ? path.join(ROOT, 'tools', 'out', 'mock') : ROOT;
  const scratch = root !== ROOT;
  return {
    root, scratch,
    masters: path.join(root, 'art', 'masters'),
    audition: path.join(root, 'art', 'masters', 'audition'),
    archive: path.join(root, 'art', 'archive'),
    cards: path.join(root, 'art', 'cards'),
    ui: path.join(root, 'art', 'ui'),
    manifest: path.join(root, 'data', 'art-manifest.js'),
    contact: scratch ? path.join(root, 'contact') : path.join(ROOT, 'tools', 'out', 'contact'),
    ledger: args.get('ledger', null) ? path.resolve(ROOT, args.get('ledger')) : path.join(ROOT, 'docs', 'art-ledger.json'),
  };
}
export const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

// ---- keys --------------------------------------------------------------------------------------
// A key is a card number ("ST01-005"), "<number>/awakened" for a leader's awakened face, or "ui/<name>".
export const stem = (key) => key.replace(/\//g, '__');
export const keyOfStem = (s) => s.replace(/__/g, '/');
export const isUi = (key) => key.startsWith('ui/');
export const masterFile = (paths, key) => path.join(paths.masters, stem(key) + '.png');
// Delivery file (relative to the art root, as the manifest states it): cards and leaders live in
// art/cards/<key with / as __>.webp, UI plates in art/ui/<name>.webp.
export const deliveryRel = (key) => (isUi(key) ? 'art/ui/' + key.slice(3) + '.webp' : 'art/cards/' + stem(key) + '.webp');
export const keyOfDeliveryRel = (r) => { const m = /^art\/(cards|ui)\/(.+)\.webp$/.exec(r); return m ? (m[1] === 'ui' ? 'ui/' + m[2] : keyOfStem(m[2])) : null; };

// ---- the data model (read like tools/validate-data.mjs does: the data files under vm) ------------
export function loadModel() {
  const ctx = { console };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['data/cards.js', 'data/decks.js', 'data/art-identity.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  const XS = ctx.XS || {};
  if (!XS.CARDS || !XS.DECKS || !XS.ART_IDENTITY) throw new Error('art: data/cards.js, data/decks.js or data/art-identity.js did not define XS.CARDS / XS.DECKS / XS.ART_IDENTITY');
  return { CARDS: XS.CARDS, DECKS: XS.DECKS, IDENT: XS.ART_IDENTITY };
}

// Every face that needs a picture: one per card, two per leader (same rule as validate-data faces()).
export function faceKeys(CARDS) {
  const out = [];
  for (const [n, c] of Object.entries(CARDS)) { out.push(n); if (c.type === 'leader') out.push(n + '/awakened'); }
  return out;
}
export const uiKeys = (IDENT) => Object.keys(IDENT.ui).map((n) => 'ui/' + n);
export function kindOf(key, CARDS) {
  if (isUi(key)) return 'ui';
  if (key.endsWith('/awakened')) return 'leader-awakened';
  return CARDS[key] && CARDS[key].type === 'leader' ? 'leader' : 'card';
}

// Image sizes (multiples of 16 for FLUX). Cards are portrait 832x1216; the title and arena backdrops are
// landscape 1280x768 (under one megapixel); the two card backs are portrait like the faces.
export function sizeOf(key, IDENT) {
  if (isUi(key) && IDENT.ui[key.slice(3)].kind === 'backdrop') return { w: 1280, h: 768 };
  return { w: 832, h: 1216 };
}

// ---- models, providers and the cost table --------------------------------------------------------
export const MODELS = {
  dev: { id: 'black-forest-labs/FLUX.1-dev', fal: 'fal-ai/flux/dev', steps: 28, guidance: 3.5 },
  schnell: { id: 'black-forest-labs/FLUX.1-schnell', fal: 'fal-ai/flux/schnell', steps: 4, guidance: 0 },
};
export function resolveModel(name) {
  if (MODELS[name]) return { short: name, ...MODELS[name] };
  const hit = Object.entries(MODELS).find(([, m]) => m.id === name);
  if (hit) return { short: hit[0], ...hit[1] };
  throw new Error(`gen-art: unknown model "${name}" (use dev, schnell, or a full id from tools/art/lib.mjs MODELS)`);
}
// Estimated USD per megapixel, rounded UP to a whole megapixel per image (conservative).
// SOURCE (recalled, to be checked against the provider dashboard after the first --limit 3 sample):
// fal.ai's public price list: FLUX.1 [dev] 0.025 USD / megapixel, FLUX.1 [schnell] 0.003 USD / megapixel.
// Hugging Face passes a routed provider's cost through at the provider's rate with no markup. The
// hf-inference route is billed by GPU seconds and HF publishes no per-image price, so the fal rate is
// used there as a conservative proxy. Replace these numbers the moment a real invoice differs.
export const COST_PER_MP = { 'black-forest-labs/FLUX.1-dev': 0.025, 'black-forest-labs/FLUX.1-schnell': 0.003 };
export const COST_SOURCE = 'fal.ai price list (FLUX.1 dev 0.025, schnell 0.003 USD per megapixel, rounded up per image); HF passes provider cost through; hf-inference priced by the same rate as a conservative proxy';
export function estCostUSD(modelId, w, h) {
  const rate = COST_PER_MP[modelId];
  if (rate === undefined) throw new Error('gen-art: no cost entry for model ' + modelId + ' (tools/art/lib.mjs COST_PER_MP)');
  return Math.round(rate * Math.max(1, Math.ceil((w * h) / 1e6)) * 10000) / 10000;
}

// ---- the cost ledger (docs/art-ledger.json, committed) -------------------------------------------
export function readLedger(p) {
  if (!fs.existsSync(p)) return { budgetUSD: BUDGET_USD, entries: [] };
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(j.entries)) throw new Error('art-ledger.json has no entries array');
  return j;
}
export const ledgerTotal = (j) => Math.round(j.entries.reduce((s, e) => s + (Number(e.estCostUSD) || 0), 0) * 10000) / 10000;
export function appendLedger(p, entry) {
  const j = readLedger(p);
  j.entries.push(entry);
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
}

// ---- the API key (environment variables only; PLAN D17) ------------------------------------------
export const KEY_VARS = ['HF_TOKEN', 'HUGGINGFACE_API_KEY', 'HUGGINGFACE_TOKEN', 'HF_API_KEY', 'HUGGING_FACE_HUB_TOKEN'];
export function apiKey(env = process.env) {
  for (const name of KEY_VARS) if (env[name] && env[name].trim()) return { name, value: env[name].trim() };
  throw new Error('gen-art: no Hugging Face API key in the environment. Set one of: ' + KEY_VARS.join(', ') +
    ' (the owner adds it as an environment variable; it appears after the session VM restarts). Nothing was sent.');
}

// ---- hashes, seeds -------------------------------------------------------------------------------
export const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
export function fnvSeed(text) { let h = 2166136261; for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) % 2147483647; }
export const AUDITION_SEED = 20261029;

// ---- image headers -------------------------------------------------------------------------------
export const isPng = (b) => b.length > 24 && b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG';
export const isJpeg = (b) => b.length > 4 && b[0] === 0xff && b[1] === 0xd8;
export const isWebp = (b) => b.length > 16 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
export function pngSize(b) { return isPng(b) ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null; }
export function webpSize(b) {
  if (!isWebp(b)) return null;
  const fmt = b.toString('ascii', 12, 16);
  if (fmt === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (fmt === 'VP8L') { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
  if (fmt === 'VP8X') return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
  return null;
}
export function readHead(file, n = 64) {
  const b = Buffer.alloc(n); const fd = fs.openSync(file, 'r');
  const got = fs.readSync(fd, b, 0, n, 0); fs.closeSync(fd); return b.subarray(0, got);
}
export const hasMockMark = (file) => readHead(file, 128).includes(MOCK_MARK);

// ---- a tiny pure-JS PNG writer for --mock --------------------------------------------------------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function encodePng(w, h, rgb, textKeyword) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    ...(textKeyword ? [chunk('tEXt', Buffer.from(textKeyword + '\0mock placeholder, not generated art', 'latin1'))] : []),
    chunk('IDAT', zlib.deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))]);
}
// A wordless placeholder: a hue per key, a vertical gradient, soft glows and a simple figure or object.
export function mockPng(key, w, h) {
  const hs = fnvSeed(key); const hue = (hs % 360) / 360;
  const hsl = (hh, s, l) => { const a = s * Math.min(l, 1 - l); const f = (n) => { const k = (n + hh * 12) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)); };
  const top = hsl(hue, 0.65, 0.22), bot = hsl((hue + 0.12) % 1, 0.7, 0.45), fig = hsl((hue + 0.5) % 1, 0.6, 0.62), glow = hsl((hue + 0.33) % 1, 0.9, 0.7);
  const rgb = Buffer.alloc(w * h * 3);
  const cx = w * (0.4 + ((hs >> 3) % 20) / 50), cy = h * 0.55;
  for (let y = 0; y < h; y++) {
    const t = y / h;
    for (let x = 0; x < w; x++) {
      let r = top[0] + (bot[0] - top[0]) * t, g = top[1] + (bot[1] - top[1]) * t, b = top[2] + (bot[2] - top[2]) * t;
      const d = Math.hypot(x - cx, (y - cy) * 0.8) / (w * 0.45);
      if (d < 1) { const k = (1 - d) * 0.55; r += (glow[0] - r) * k; g += (glow[1] - g) * k; b += (glow[2] - b) * k; }
      const dh = Math.hypot(x - cx, y - h * 0.3), dbody = Math.hypot((x - cx) * 1.0, (y - h * 0.62) * 0.55);
      if (dh < w * 0.11 || dbody < w * 0.2) { r = fig[0]; g = fig[1]; b = fig[2]; }
      if (((x + y) % 96) < 3) { r += 14; g += 14; b += 14; }
      const o = (y * w + x) * 3; rgb[o] = r > 255 ? 255 : r; rgb[o + 1] = g > 255 ? 255 : g; rgb[o + 2] = b > 255 ? 255 : b;
    }
  }
  return encodePng(w, h, rgb, MOCK_MARK);
}
