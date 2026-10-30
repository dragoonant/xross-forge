// Build data/cards.js and data/decks.js (ported in spirit from lorecannae's tools/build-cards.mjs).
//
//   node tools/build-cards.mjs           write the two files
//   node tools/build-cards.mjs --check   exit 1 if the committed files differ from a fresh build;
//                                        prints "pending (no docs/sources)" and exits 0 when the
//                                        gitignored API dump is absent (as in CI)
//
// Inputs: docs/sources/api/all-cards.json (official API dump, gitignored; stats and structure),
// data/decklists.json (the starters, format 'starter') and data/decklists-competitive.json (`decks`:
// the ten competitive decks, PLAN D19; `alternates` are ignored), data/text-en.js (our English names
// and text, PLAN D16) and data/tags.js (every emitted leader must have a tag; an empty list is a real
// value for a free agent). The Japanese printed effect text is read only to derive the structured
// `equip` field of equipment cards and is never copied into data/cards.js. Only cards referenced by a
// registered deck are emitted (leaders, main, tactics, PP Ticket and PP card).
// Also writes data/art-pending.js: every emitted card face with no entry in data/art-manifest.js.
// Output is deterministic: sorted keys, one card per line.
//
// Card fields (header of data/cards.js repeats this):
//   ace, atk, awakenAtk, awakenHp, color, cost, family, hp, name, nameEn, product, text, type  as before
//   tactics: 'consumption' | 'equipment'                (API tactics_type)
//   build:   { type: 'require_leader', family, leader } | { type: 'require_card_color', color, count }
//   equip:   { hp } | { atk } | { hpBase, hpBaseAwakened }   only for stat-only equipment (see parseEquip)
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

// build_rule -> { type: 'require_leader', family, leader } (the leader's exact printed name, so an (IGV)
// leader is a different leader from its plain namesake, news 207) or { type: 'require_card_color', color, count }.
function buildRule(rule, leadersByFamily) {
  if (!rule) return undefined;
  if (rule.type === 'require_leader') {
    const m = /^リーダー：(.+)$/.exec(rule.description || '');
    if (!m) throw new Error(`cannot parse build rule description: ${rule.description}`);
    const names = leadersByFamily.get(rule.family_id);
    if (!names || !names.has(m[1])) throw new Error(`build rule "${rule.description}": no leader named ${m[1]} in family ${rule.family_id}`);
    return { type: 'require_leader', family: rule.family_id, leader: m[1] };
  }
  if (rule.type === 'require_card_color') {
    const m = /^(.)のリーダー(\d+)体以上$/.exec(rule.description || '');
    if (!m || !COLORS[m[1]]) throw new Error(`cannot parse build rule description: ${rule.description}`);
    return { type: 'require_card_color', color: COLORS[m[1]], count: +m[2] };
  }
  throw new Error(`unknown build_rule type: ${rule.type}`);
}

// Equipment whose printed effect is not a stat line: it grants an ability or restricts targeting, so it has no
// `equip` field (its behaviour is the ability table's business). Anything else must parse or the build throws.
const ABILITY_EQUIPMENT = new Set(['BP02-078', 'BP03-079']);

// Stat-only equipment text -> { hp: N } (体力+N), { atk: N } (攻撃力+N) or { hpBase, hpBaseAwakened }
// ("if the equipped leader is not awakened its base HP becomes A; if awakened, B", サイバネアーマー).
function parseEquip(num, effect) {
  const out = {};
  const base = /覚醒していないなら、基本の体力は(\d+)になる。.*覚醒しているなら、基本の体力は(\d+)になる。/s.exec(effect);
  if (base) { out.hpBase = +base[1]; out.hpBaseAwakened = +base[2]; }
  const hp = /^体力\+(\d+)$/m.exec(effect);
  if (hp) out.hp = +hp[1];
  const atk = /^攻撃力\+(\d+)$/m.exec(effect);
  if (atk) out.atk = +atk[1];
  if (Object.keys(out).length) return out;
  if (ABILITY_EQUIPMENT.has(num)) return undefined;
  throw new Error(`${num}: equipment text is neither a stat line nor listed in ABILITY_EQUIPMENT: ${effect}`);
}

// The faces that need a picture: one per card, two per leader (front and awakened).
export function faces(CARDS) {
  const out = [];
  for (const [n, c] of Object.entries(CARDS)) {
    out.push(n);
    if (c.type === 'leader') out.push(n + '/awakened');
  }
  return out;
}

// What the ten competitive decks use for the PP Ticket and the PP card: the generic ones of ST01 (their
// competitive lists omit both, PLAN D19; the cards are identical in every product).
const COMPETITIVE_PP = { ppTicket: 'ST01-024', ppCard: 'ST01-025' };

export function build() {
  const api = JSON.parse(fs.readFileSync(path.join(ROOT, API), 'utf8'));
  const fetchedLines = fs.readFileSync(path.join(ROOT, FETCHED), 'utf8').trim().split('\n');
  const decklists = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/decklists.json'), 'utf8'));
  const competitive = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/decklists-competitive.json'), 'utf8'));
  const XS = loadDataFiles(['data/text-en.js', 'data/tags.js', 'data/art-manifest.js']);
  const textEn = XS.TEXT_EN, tags = XS.TAGS, ART = XS.ART;
  if (ART === undefined) throw new Error('data/art-manifest.js did not define XS.ART');

  const byNum = new Map();
  for (const r of api) {
    const num = r.display_card_number.split('/')[0];
    if (!byNum.has(num) || (byNum.get(num).is_parallel && !r.is_parallel)) byNum.set(num, r);
  }

  // Leader names per family (for the require_leader exact-name check).
  const leadersByFamily = new Map();
  for (const r of api) {
    if (r.card_type.internal_id !== 'leader') continue;
    if (!leadersByFamily.has(r.family_id)) leadersByFamily.set(r.family_id, new Set());
    leadersByFamily.get(r.family_id).add(r.name);
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
      format: 'starter',   // plays as sold (PLAN D15): exempt from the BAN list, explicitly (tools/validate-data.mjs)
    };
    for (const n of [...d.leaders, ...d.main.map((x) => x[0]), ...d.tactics, d.ppTicket, pp[0][0]]) wanted.add(n);
  }
  for (const d of competitive.decks) {
    if (decks[d.id]) throw new Error(`${d.id}: deck id registered twice`);
    if (!d.source || !d.source.url || !d.source.event || !d.source.fetched) throw new Error(`${d.id}: competitive deck without a source {url, event, fetched}`);
    // `name` is the Japanese name and `nameEn` the English one (the shape of the starters, which js/ui/panels.js
    // reads); `nameJa` repeats the Japanese name under the research key.
    decks[d.id] = {
      id: d.id,
      leaders: [...d.leaders],
      main: [...d.main].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([n, q]) => [n, q]),
      name: d.nameJa,
      nameEn: d.name,
      nameJa: d.nameJa,
      ppCard: COMPETITIVE_PP.ppCard,
      ppTicket: COMPETITIVE_PP.ppTicket,
      source: { event: d.source.event, fetched: d.source.fetched, method: d.source.method, url: d.source.url },
      tactics: [...d.tactics],
      format: 'competitive',
      tier: 'competitive',
    };
    for (const n of [...d.leaders, ...d.main.map((x) => x[0]), ...d.tactics, COMPETITIVE_PP.ppTicket, COMPETITIVE_PP.ppCard]) wanted.add(n);
  }

  const cards = {};
  for (const num of [...wanted].sort()) {
    const r = byNum.get(num);
    if (!r) throw new Error(`${num}: in a deck but not in the API dump`);
    const te = textEn[num];
    if (!te || !te.nameEn || !te.text) throw new Error(`${num}: no data/text-en.js entry (nameEn + text)`);
    const type = r.card_type.internal_id;
    if (type === 'leader' && !Array.isArray(tags[num])) throw new Error(`${num}: leader without an entry in data/tags.js (an empty list [] is a valid entry for a free agent)`);
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
    const b = buildRule(r.build_rule, leadersByFamily);
    if (b) c.build = b;
    if (r.tactics_type === 'equipment') {
      const e = parseEquip(num, r.effect || '');
      if (e) c.equip = e;
    }
    cards[num] = c;
  }
  for (const n of Object.keys(textEn)) if (!cards[n]) throw new Error(`data/text-en.js has an entry for ${n}, which no registered deck uses`);

  const source = { api: fetchedLines[1] || '', fetched: fetchedLines[0] };
  const header = (what) => `// GENERATED by tools/build-cards.mjs — do not edit; run \`node tools/build-cards.mjs\`.
// ${what}
// Inputs: docs/sources/api/all-cards.json (stats, gitignored), data/decklists.json, data/decklists-competitive.json, data/text-en.js, data/tags.js.
// The repo carries our English text, not the printed Japanese text (PLAN D16).
`;
  const cardsJs = header('XS.CARDS: every card used by a registered deck, keyed by card number. XS.CARD_SOURCE: where the stats came from.') +
`// Card fields: ace (bool); atk, hp, awakenAtk, awakenHp (leaders); cost (attack, memoria, tactics); color; family (the
// API family id: all printings of a name); name (printed) and nameEn/text (our English, PLAN D16); product; type.
//   tactics: 'consumption' | 'equipment'   (tactics cards only)
//   build:   deck-building rule (PM p.13), either
//              { type: 'require_leader', family, leader }   one of the 4 leaders has this family AND this exact printed name
//                                                           (an "(IGV)" leader is a different leader from its namesake, news 207)
//              { type: 'require_card_color', color, count }  at least count of the 4 leaders have this colour
//   equip:   stat-only equipment, read from its printed text: { hp: +N } (体力+N), { atk: +N }, or
//              { hpBase: A, hpBaseAwakened: B } (base HP becomes A if the equipped leader is not awakened, B if it is).
//            Equipment that grants an ability or restricts targeting (BP02-078, BP03-079) has no equip field.
(function () {
  const XS = (globalThis.XS = globalThis.XS || {});
  XS.CARD_SOURCE = ${line(source)};
  XS.CARDS = {
${Object.keys(cards).sort().map((n) => `    ${JSON.stringify(n)}: ${line(cards[n])},`).join('\n')}
  };
})();
`;
  const decksJs = header('XS.DECKS: the registered decks: the two starters (format starter) and the ten competitive decks (format and tier competitive, with a source {url, event, fetched, method}). main = [card number, copies]. name = Japanese, nameEn = English.') +
`(function () {
  const XS = (globalThis.XS = globalThis.XS || {});
  XS.DECKS = {
${Object.keys(decks).map((id) => `    ${JSON.stringify(id)}: ${line(decks[id])},`).join('\n')}
  };
})();
`;
  // Faces with no manifest entry yet: validate-data passes with a "pending art" line while a face is in this list and
  // fails only if it is in neither the manifest nor this list; the UI shows its labelled placeholder meanwhile.
  const pending = faces(cards).filter((f) => !ART[f]).sort();
  const pendingJs = header('XS.ART_PENDING: card faces (a leader has two: "N" and "N/awakened") that have no entry in data/art-manifest.js yet.') +
`(function () {
  const XS = (globalThis.XS = globalThis.XS || {});
  XS.ART_PENDING = [
${pending.map((f) => `    ${JSON.stringify(f)},`).join('\n')}
  ];
})();
`;
  return { 'data/cards.js': cardsJs, 'data/decks.js': decksJs, 'data/art-pending.js': pendingJs, pending: pending.length, count: Object.keys(cards).length, decks: Object.keys(decks).length };
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
    const FILES_OUT = ['data/cards.js', 'data/decks.js', 'data/art-pending.js'];
    const stale = FILES_OUT.filter((f) => !fs.existsSync(path.join(ROOT, f)) || fs.readFileSync(path.join(ROOT, f), 'utf8') !== out[f]);
    if (stale.length) {
      for (const f of stale) console.log(`FAIL build-cards: ${f} differs from a fresh build; run: node tools/build-cards.mjs`);
      process.exit(1);
    }
    console.log(`build-cards: ok (${out.count} cards, ${out.decks} decks; data/cards.js, data/decks.js and data/art-pending.js current; ${out.pending} faces pending art)`);
  } else {
    for (const f of ['data/cards.js', 'data/decks.js', 'data/art-pending.js']) fs.writeFileSync(path.join(ROOT, f), out[f]);
    console.log(`build-cards: wrote data/cards.js (${out.count} cards), data/decks.js (${out.decks} decks) and data/art-pending.js (${out.pending} faces)`);
  }
}
