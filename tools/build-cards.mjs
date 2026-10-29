// Build data/cards.js and data/decks.js (ported in spirit from lorecannae's tools/build-cards.mjs).
//
//   node tools/build-cards.mjs           write the two files
//   node tools/build-cards.mjs --check   exit 1 if the committed files differ from a fresh build;
//                                        prints "pending (no docs/sources)" and exits 0 when the
//                                        gitignored API dump is absent (as in CI)
//
// Inputs: docs/sources/api/all-cards.json (official API dump, gitignored; stats and structure),
// data/decklists.json (the registered decks), data/text-en.js (our English names and text, PLAN
// D16) and data/tags.js (every emitted leader must have a tag). The Japanese printed effect text
// is read only to be ignored: it never reaches data/cards.js. Only cards referenced by a
// registered deck are emitted (leaders, main, tactics, PP Ticket and the product's PP card).
// Output is deterministic: sorted keys, one card per line.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'docs/sources/api/all-cards.json';
const FETCHED = 'docs/sources/api/FETCHED.txt';

// Load data/*.js files into one shared node:vm context (the way the pages share globalThis.XS).
export function loadDataFiles(files) {
  const ctx = { console };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.XS || {};
}

const COLORS = { 赤: 'red', 青: 'blue', 緑: 'green', 黄: 'yellow' };

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}
const line = (v) => JSON.stringify(sortKeys(v));

function buildRule(rule) {
  if (!rule) return undefined;
  if (rule.type === 'require_leader') return { type: 'require_leader', family: rule.family_id };
  if (rule.type === 'require_card_color') {
    const m = /^(.)のリーダー(\d+)体以上$/.exec(rule.description || '');
    if (!m || !COLORS[m[1]]) throw new Error(`cannot parse build rule description: ${rule.description}`);
    return { type: 'require_card_color', color: COLORS[m[1]], count: +m[2] };
  }
  throw new Error(`unknown build_rule type: ${rule.type}`);
}

export function build() {
  const api = JSON.parse(fs.readFileSync(path.join(ROOT, API), 'utf8'));
  const fetchedLines = fs.readFileSync(path.join(ROOT, FETCHED), 'utf8').trim().split('\n');
  const decklists = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/decklists.json'), 'utf8'));
  const XS = loadDataFiles(['data/text-en.js', 'data/tags.js']);
  const textEn = XS.TEXT_EN, tags = XS.TAGS;

  const byNum = new Map();
  for (const r of api) {
    const num = r.display_card_number.split('/')[0];
    if (!byNum.has(num) || (byNum.get(num).is_parallel && !r.is_parallel)) byNum.set(num, r);
  }

  const decks = {};
  const wanted = new Set();
  for (const d of decklists.decks) {
    const m = /^(.*?)\s*\((.*)\)\s*$/.exec(d.name);
    if (!m) throw new Error(`deck name "${d.name}" is not "Japanese (English)"`);
    // The product's PP card is the API's pp-type row carrying the deck's code.
    const pp = [...byNum.entries()].filter(([n, r]) => n.startsWith(d.id + '-') && r.card_type.internal_id === 'pp');
    if (pp.length !== 1) throw new Error(`${d.id}: expected exactly one pp card in the API, found ${pp.length}`);
    decks[d.id] = {
      id: d.id,
      leaders: [...d.leaders],
      main: [...d.main].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([n, q]) => [n, q]),
      name: m[1],
      nameEn: m[2],
      ppCard: pp[0][0],
      ppTicket: d.ppTicket,
      tactics: [...d.tactics],
    };
    for (const n of [...d.leaders, ...d.main.map((x) => x[0]), ...d.tactics, d.ppTicket, pp[0][0]]) wanted.add(n);
  }

  const cards = {};
  for (const num of [...wanted].sort()) {
    const r = byNum.get(num);
    if (!r) throw new Error(`${num}: in a deck but not in the API dump`);
    const te = textEn[num];
    if (!te || !te.nameEn || !te.text) throw new Error(`${num}: no data/text-en.js entry (nameEn + text)`);
    const type = r.card_type.internal_id;
    if (type === 'leader' && !(tags[num] && tags[num].length)) throw new Error(`${num}: leader without an entry in data/tags.js`);
    const c = {
      ace: !!r.is_ace,
      color: r.card_color.internal_id,
      family: r.family_id,
      name: r.name,
      nameEn: te.nameEn,
      product: r.card_product.code,
      text: te.text,
      type,
    };
    if (type !== 'leader' && type !== 'pp' && r.cost != null) c.cost = r.cost;
    if (type === 'leader') { c.atk = r.atk; c.hp = r.hp; c.awakenAtk = r.awaken_atk; c.awakenHp = r.awaken_hp; }
    if (r.tactics_type) c.tactics = r.tactics_type;
    const b = buildRule(r.build_rule);
    if (b) c.build = b;
    cards[num] = c;
  }
  for (const n of Object.keys(textEn)) if (!cards[n]) throw new Error(`data/text-en.js has an entry for ${n}, which no registered deck uses`);

  const source = { api: fetchedLines[1] || '', fetched: fetchedLines[0] };
  const header = (what) => `// GENERATED by tools/build-cards.mjs — do not edit; run \`node tools/build-cards.mjs\`.
// ${what}
// Inputs: docs/sources/api/all-cards.json (stats, gitignored), data/decklists.json, data/text-en.js.
// The repo carries our English text, not the printed Japanese text (PLAN D16).
`;
  const cardsJs = header('XS.CARDS: every card used by a registered deck, keyed by card number. XS.CARD_SOURCE: where the stats came from.') +
`(function () {
  const XS = (globalThis.XS = globalThis.XS || {});
  XS.CARD_SOURCE = ${line(source)};
  XS.CARDS = {
${Object.keys(cards).sort().map((n) => `    ${JSON.stringify(n)}: ${line(cards[n])},`).join('\n')}
  };
})();
`;
  const decksJs = header('XS.DECKS: the registered decks (first slice: the two starters). main = [card number, copies].') +
`(function () {
  const XS = (globalThis.XS = globalThis.XS || {});
  XS.DECKS = {
${Object.keys(decks).map((id) => `    ${JSON.stringify(id)}: ${line(decks[id])},`).join('\n')}
  };
})();
`;
  return { 'data/cards.js': cardsJs, 'data/decks.js': decksJs, count: Object.keys(cards).length, decks: Object.keys(decks).length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const check = process.argv.includes('--check');
  if (!fs.existsSync(path.join(ROOT, API)) || !fs.existsSync(path.join(ROOT, FETCHED))) {
    if (check) { console.log('build-cards: pending (no docs/sources)'); process.exit(0); }
    console.error('FAIL build-cards: ' + API + ' is missing; run: node tools/fetch-cards.mjs');
    process.exit(1);
  }
  const out = build();
  if (check) {
    const stale = ['data/cards.js', 'data/decks.js'].filter((f) => !fs.existsSync(path.join(ROOT, f)) || fs.readFileSync(path.join(ROOT, f), 'utf8') !== out[f]);
    if (stale.length) {
      for (const f of stale) console.log(`FAIL build-cards: ${f} differs from a fresh build; run: node tools/build-cards.mjs`);
      process.exit(1);
    }
    console.log(`build-cards: ok (${out.count} cards, ${out.decks} decks; data/cards.js and data/decks.js current)`);
  } else {
    for (const f of ['data/cards.js', 'data/decks.js']) fs.writeFileSync(path.join(ROOT, f), out[f]);
    console.log(`build-cards: wrote data/cards.js (${out.count} cards) and data/decks.js (${out.decks} decks)`);
  }
}
