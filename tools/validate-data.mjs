// Data validation (ported in spirit from lorecannae's validate step). Loads data/*.js under
// node:vm, exactly as a page would, and fails on any broken rule below.
//
//   node tools/validate-data.mjs             validate the committed data
//   node tools/validate-data.mjs --selftest  mutate an in-memory copy once per rule and assert the
//                                            rule bites (and that the clean data passes)
//
// Rules (each error line starts with FAIL and carries its rule id): unknown-card, main-size,
// leaders-count, leaders-dup-name, tactics-count, tactics-dup-name, copy-limit, ace-limit,
// colour-rule, build-rule, wrong-type, ticket, pp-card, defect-in-deck, defect-unknown,
// text-missing, text-empty, text-orphan, name-consistency, leader-tag, tag-on-non-leader,
// leader-awaken, null-number, japanese-text, name-kept-ja, text-tag, tactics-type, equip-shape,
// build-shape, deck-format, deck-source, banned-card (every deck except format 'starter', PLAN D15; the
// list is data/restrictions.js), restrictions-api, art-unknown, art-pending-unknown, sound-unknown,
// art-missing (a face in neither data/art-manifest.js nor data/art-pending.js), sound-missing (the last
// two only once REQUIRE_ART / REQUIRE_SOUND flip). Faces listed in data/art-pending.js pass with a
// "pending art: N faces" line (the UI shows its labelled placeholder meanwhile).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataFiles, faces, ROOT } from './build-cards.mjs';

// Art and sound coverage is reported, not enforced, until M5 / M6 flip these.
const REQUIRE_ART = true;    // M5 done 2026-10-29 (PLAN D18)
const REQUIRE_SOUND = true;  // M6 done 2026-10-29 (PLAN D18)

// Limits (docs/rules.md §3, PM p.13).
const LEADERS = 4, MAIN = 50, TACTICS = 5, COPIES = 4, ACES = 8;
const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const FILES = ['data/defects.js', 'data/tags.js', 'data/text-en.js', 'data/restrictions.js', 'data/cards.js', 'data/decks.js', 'data/art-manifest.js', 'data/art-pending.js', 'data/sound-manifest.js', 'data/audio-cues.js'];
const FORMATS = ['starter', 'competitive'];
// Bracketed keywords our English text may use (data/text-en.js header); [Overkill N] carries its number.
const TEXT_TAGS = /^(?:On Play|Attack|After Attack|Attack Boost|On Awaken|Round|Echo|Overkill \d+)$/;
const EQUIP_KEYS = ['hp', 'atk', 'hpBase', 'hpBaseAwakened'];

export function loadData() {
  const XS = loadDataFiles(FILES);
  return { CARDS: XS.CARDS, DECKS: XS.DECKS, TAGS: XS.TAGS, DEFECTS: XS.DEFECTS, ART: XS.ART, ART_PENDING: XS.ART_PENDING, SOUNDS: XS.SOUNDS, TEXT_EN: XS.TEXT_EN, NAME_KEPT_JA: XS.NAME_KEPT_JA, RESTRICTIONS: XS.RESTRICTIONS, AUDIO: XS.AUDIO };
}

export { faces };

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Returns { errors: [{rule, msg}], art: {missing, total}, sound: {missing, total} }.
export function validate(d, opts = { requireArt: REQUIRE_ART, requireSound: REQUIRE_SOUND }) {
  const errors = [];
  const err = (rule, msg) => errors.push({ rule, msg });
  const { CARDS, DECKS, TAGS, DEFECTS, ART, ART_PENDING, SOUNDS, TEXT_EN, NAME_KEPT_JA, RESTRICTIONS, AUDIO } = d;
  const card = (n) => CARDS[n];

  // ---- per card -------------------------------------------------------------------------
  for (const [n, c] of Object.entries(CARDS)) {
    const te = TEXT_EN[n];
    if (!te) err('text-missing', `${n}: no data/text-en.js entry`);
    if (!c.text || !String(c.text).trim()) err('text-empty', `${n}: empty text`);
    // A leader's nameEn may stay the Japanese printed name only when XS.NAME_KEPT_JA lists the number (no sourced romanisation).
    const keptJa = (nameEn) => Object.prototype.hasOwnProperty.call(NAME_KEPT_JA, n) && c.type === 'leader' && nameEn === c.name;
    for (const k of ['text', 'nameEn']) {
      if (typeof c[k] === 'string' && JAPANESE.test(c[k]) && !(k === 'nameEn' && keptJa(c.nameEn))) err('japanese-text', `${n}.${k} contains Japanese characters`);
    }
    if (te) for (const k of ['text', 'nameEn']) {
      if (typeof te[k] === 'string' && JAPANESE.test(te[k]) && !(k === 'nameEn' && keptJa(te.nameEn))) err('japanese-text', `${n}: text-en ${k} contains Japanese characters`);
    }
    if (typeof c.text === 'string') for (const m of c.text.matchAll(/\[([^\]]+)\]/g)) if (!TEXT_TAGS.test(m[1])) err('text-tag', `${n}: unknown bracketed tag [${m[1]}]`);
    if (!c.nameEn || !String(c.nameEn).trim()) err('text-empty', `${n}: empty nameEn`);
    const need = c.type === 'leader' ? ['atk', 'hp', 'awakenAtk', 'awakenHp']
      : c.type === 'attack' || c.type === 'memoria' || c.type === 'tactics' ? ['cost'] : [];
    for (const f of need) if (!isNum(c[f])) err('null-number', `${n}: ${f} is ${c[f] === null ? 'null' : String(c[f])} but ${c.type} requires a number`);
    if (c.type === 'tactics' && !['consumption', 'equipment'].includes(c.tactics)) err('tactics-type', `${n}: tactics card without tactics: 'consumption' | 'equipment'`);
    if (c.type !== 'tactics' && c.tactics !== undefined) err('tactics-type', `${n}: ${c.type} card carries a tactics type`);
    if (c.equip !== undefined) {
      const e = c.equip;
      const keys = e && typeof e === 'object' ? Object.keys(e) : [];
      if (c.tactics !== 'equipment') err('equip-shape', `${n}: equip on a card that is not equipment`);
      else if (!keys.length || keys.some((k) => !EQUIP_KEYS.includes(k) || !isNum(e[k]))) err('equip-shape', `${n}: equip must hold only numeric ${EQUIP_KEYS.join('/')}`);
      else if ((e.hpBase === undefined) !== (e.hpBaseAwakened === undefined)) err('equip-shape', `${n}: hpBase and hpBaseAwakened come as a pair`);
    }
    if (c.build !== undefined) {
      const b = c.build;
      const ok = b && ((b.type === 'require_leader' && isNum(b.family) && typeof b.leader === 'string' && b.leader)
        || (b.type === 'require_card_color' && ['red', 'blue', 'green', 'yellow'].includes(b.color) && Number.isInteger(b.count) && b.count >= 1 && b.count <= LEADERS));
      if (!ok) err('build-shape', `${n}: malformed build rule ${JSON.stringify(b)}`);
    }
    if (c.type === 'leader') {
      // An empty list is a real value (a free agent has no affiliation); a missing key or a non-array is not.
      if (!(Array.isArray(TAGS[n]) && TAGS[n].every((t) => typeof t === 'string' && t))) err('leader-tag', `${n}: leader without a tag entry (a free agent needs an explicit [])`);
      if (!isNum(c.awakenAtk) || !isNum(c.awakenHp)) err('leader-awaken', `${n}: leader without awakened stats`);
    }
  }
  for (const n of Object.keys(NAME_KEPT_JA)) {
    const c = CARDS[n];
    if (!c || c.type !== 'leader') err('name-kept-ja', `${n}: NAME_KEPT_JA entry for a card that is not an emitted leader`);
    else if (c.nameEn !== c.name || !JAPANESE.test(c.nameEn)) err('name-kept-ja', `${n}: NAME_KEPT_JA entry, but nameEn is not the Japanese printed name (delete the entry)`);
  }
  for (const n of Object.keys(TEXT_EN)) if (!CARDS[n]) err('text-orphan', `${n}: text-en entry for a card that is not emitted`);
  for (const n of Object.keys(TAGS)) if (!CARDS[n] || CARDS[n].type !== 'leader') err('tag-on-non-leader', `${n}: tag entry for a card that is not an emitted leader`);
  for (const n of Object.keys(DEFECTS)) if (!CARDS[n]) err('defect-unknown', `${n}: defect for a card that is not emitted`);
  const byName = {};
  for (const [n, c] of Object.entries(CARDS)) {
    const p = byName[c.name];
    if (p && (p.c.nameEn !== c.nameEn || p.c.text !== c.text)) err('name-consistency', `${p.n} and ${n} share a name but differ in nameEn/text`);
    else if (!p) byName[c.name] = { n, c };
  }

  // ---- per deck -------------------------------------------------------------------------
  for (const [id, k] of Object.entries(DECKS)) {
    const refs = [...k.leaders, ...k.main.map((x) => x[0]), ...k.tactics, k.ppTicket, k.ppCard];
    for (const n of refs) if (!card(n)) err('unknown-card', `${id}: unknown card ${n}`);
    // Format: 'starter' decks play as sold (PLAN D15) and are the only ones exempt from the BAN list; competitive decks
    // are tournament decks (PLAN D19) and need a source.
    if (!FORMATS.includes(k.format)) err('deck-format', `${id}: format ${JSON.stringify(k.format)} is not one of ${FORMATS.join(', ')}`);
    if (k.format === 'competitive') {
      if (k.tier !== 'competitive') err('deck-format', `${id}: competitive deck without tier: 'competitive'`);
      const s = k.source;
      if (!(s && typeof s.url === 'string' && /^https:\/\//.test(s.url) && s.event && /^\d{4}-\d{2}-\d{2}$/.test(s.fetched || ''))) err('deck-source', `${id}: competitive deck needs source {url, event, fetched}`);
      if (JAPANESE.test(k.nameEn || '')) err('japanese-text', `${id}: nameEn contains Japanese characters`);
    }
    const known = (n) => !!card(n);

    const total = k.main.reduce((s, [, q]) => s + q, 0);
    if (total !== MAIN) err('main-size', `${id}: main deck has ${total} cards, needs ${MAIN}`);
    if (k.leaders.length !== LEADERS) err('leaders-count', `${id}: ${k.leaders.length} leaders, needs ${LEADERS}`);
    const lnames = k.leaders.filter(known).map((n) => card(n).name);
    if (new Set(lnames).size !== lnames.length) err('leaders-dup-name', `${id}: duplicate leader names`);
    if (k.tactics.length !== TACTICS) err('tactics-count', `${id}: ${k.tactics.length} tactics, needs ${TACTICS}`);
    const tnames = k.tactics.filter(known).map((n) => card(n).name);
    if (new Set(tnames).size !== tnames.length) err('tactics-dup-name', `${id}: duplicate tactics names`);

    for (const n of k.leaders) if (known(n) && card(n).type !== 'leader') err('wrong-type', `${id}: ${n} is not a leader`);
    for (const [n] of k.main) if (known(n) && !['attack', 'memoria'].includes(card(n).type)) err('wrong-type', `${id}: main-deck card ${n} is not attack or memoria`);
    for (const n of k.tactics) if (known(n) && card(n).type !== 'tactics') err('wrong-type', `${id}: tactics-deck card ${n} is not tactics`);

    const copies = {};
    let aces = 0;
    for (const [n, q] of k.main) {
      if (!known(n)) continue;
      copies[card(n).name] = (copies[card(n).name] || 0) + q;
      if (card(n).ace) aces += q;
    }
    for (const [name, q] of Object.entries(copies)) if (q > COPIES) err('copy-limit', `${id}: ${q} copies of ${name}, max ${COPIES}`);
    if (aces > ACES) err('ace-limit', `${id}: ${aces} ACE cards, max ${ACES}`);

    // Colour rule (PM p.13): a main-deck card shares a colour with at least one leader; colourless is allowed.
    const lcolors = new Set(k.leaders.filter(known).map((n) => card(n).color));
    for (const [n] of k.main) {
      if (!known(n)) continue;
      const col = card(n).color;
      if (col !== 'colorless' && !lcolors.has(col)) err('colour-rule', `${id}: ${n} is ${col} but no leader is`);
    }
    // Build rules (PM p.13): require_leader / require_card_color.
    for (const [n] of k.main) {
      const b = known(n) && card(n).build;
      if (!b) continue;
      // Exact printed name AND family: "Selly (IGV)" is not "Selly" (official news 207).
      if (b.type === 'require_leader' && !k.leaders.some((l) => known(l) && card(l).family === b.family && card(l).name === b.leader)) err('build-rule', `${id}: ${n} needs leader ${b.leader} (family ${b.family})`);
      if (b.type === 'require_card_color' && k.leaders.filter((l) => known(l) && card(l).color === b.color).length < b.count) err('build-rule', `${id}: ${n} needs ${b.count} ${b.color} leaders`);
    }

    // Limited / BAN (data/restrictions.js): every deck except a starter.
    if (k.format !== 'starter') {
      const copiesByFamily = {};
      for (const [n, q] of [...k.leaders.map((x) => [x, 1]), ...k.main, ...k.tactics.map((x) => [x, 1])]) {
        if (known(n)) copiesByFamily[card(n).family] = (copiesByFamily[card(n).family] || 0) + q;
      }
      for (const [fam, q] of Object.entries(copiesByFamily)) {
        const r = RESTRICTIONS.families[fam];
        if (r && q > r.max) err('banned-card', `${id}: ${q} cop${q === 1 ? 'y' : 'ies'} of family ${fam} (${r.name}), the list allows ${r.max}`);
      }
    }

    // PP Ticket and PP card.
    if (known(k.ppTicket) && (card(k.ppTicket).type !== 'tactics' || k.tactics.includes(k.ppTicket))) err('ticket', `${id}: ${k.ppTicket} must be a tactics-type card outside the 5-card tactics deck`);
    if (known(k.ppCard) && card(k.ppCard).type !== 'pp') err('pp-card', `${id}: ${k.ppCard} is not a pp card`);

    for (const n of refs) if (DEFECTS[n]) err('defect-in-deck', `${id}: ${n} is listed in XS.DEFECTS (${DEFECTS[n]})`);
  }

  // ---- art / sound manifests ------------------------------------------------------------
  const need = faces(CARDS);
  for (const [key, a] of Object.entries(ART)) {
    const base = key.replace(/\/awakened$/, '');
    if (!key.startsWith('ui/') && !CARDS[base]) err('art-unknown', `art entry ${key} names no emitted card`);
    if (!a || !a.file || !a.kind || !a.prompt) err('art-unknown', `art entry ${key} lacks file, kind or prompt`);
  }
  const soundTags = new Set(Object.values(SOUNDS).map((s) => s && s.tag));
  for (const [id, s] of Object.entries(SOUNDS)) if (!s || !s.file || !s.tag) err('sound-unknown', `sound entry ${id} lacks file or tag`);
  // Faces in data/art-pending.js are known to have no art yet (generated by tools/build-cards.mjs); a face in neither the
  // manifest nor the pending list is a hole.
  const pendingSet = new Set(ART_PENDING);
  const needSet = new Set(need);
  for (const f of ART_PENDING) if (!needSet.has(f)) err('art-pending-unknown', `art-pending entry ${f} names no emitted card face`);
  const noArt = need.filter((f) => !ART[f]);
  const art = { missing: noArt.filter((f) => !pendingSet.has(f)), pending: noArt.filter((f) => pendingSet.has(f)).length, total: need.length };
  // Sound coverage is per cue tag (data/audio-cues.js): the director fires on log tags, never per card face (M6).
  const cueTags = AUDIO && Array.isArray(AUDIO.cues) ? AUDIO.cues.map((c) => c.tag) : [];
  const sound = { missing: cueTags.filter((t) => !soundTags.has(t)), total: cueTags.length };
  if (opts.requireArt) for (const f of art.missing) err('art-missing', `no art for ${f}`);
  if (opts.requireSound) for (const f of sound.missing) err('sound-missing', `no sound for ${f}`);

  return { errors, art, sound };
}

// ---- self-test: one mutation per rule --------------------------------------------------------
const first = (o) => Object.keys(o)[0];
const MUTATIONS = {
  'unknown-card': (d) => { d.DECKS.ST01.main[0][0] = 'ZZ99-001'; },
  'main-size': (d) => { d.DECKS.ST01.main[0][1] += 1; },
  'leaders-count': (d) => { d.DECKS.ST01.leaders.pop(); },
  'leaders-dup-name': (d) => { d.DECKS.ST01.leaders[1] = d.DECKS.ST01.leaders[0]; },
  'tactics-count': (d) => { d.DECKS.ST01.tactics.pop(); },
  'tactics-dup-name': (d) => { d.DECKS.ST01.tactics[1] = d.DECKS.ST01.tactics[0]; },
  'copy-limit': (d) => { d.DECKS.ST01.main[0][1] = 5; d.DECKS.ST01.main[1][1] -= 1; },
  'ace-limit': (d) => { for (const [n] of d.DECKS.ST01.main) d.CARDS[n].ace = true; },
  'colour-rule': (d) => { d.CARDS['ST01-005'].color = 'red'; },
  'build-rule': (d) => { d.DECKS.ST01.leaders[1] = 'ST02-001'; d.DECKS.ST01.leaders[2] = 'ST02-002'; d.DECKS.ST01.leaders[3] = 'ST02-003'; },
  'wrong-type': (d) => { d.DECKS.ST01.main[0][0] = 'ST01-019'; },
  'ticket': (d) => { d.DECKS.ST01.tactics[0] = d.DECKS.ST01.ppTicket; },
  'pp-card': (d) => { d.DECKS.ST01.ppCard = 'ST01-005'; },
  'defect-in-deck': (d) => { d.DEFECTS['ST01-005'] = 'does not play as printed'; },
  'defect-unknown': (d) => { d.DEFECTS['ZZ99-001'] = 'x'; },
  'text-missing': (d) => { delete d.TEXT_EN['ST01-005']; },
  'text-empty': (d) => { d.CARDS['ST01-005'].text = ''; },
  'text-orphan': (d) => { d.TEXT_EN['ZZ99-001'] = { nameEn: 'x', text: 'x' }; },
  'name-consistency': (d) => { d.CARDS['ST02-019'].text = 'something else'; },
  'leader-tag': (d) => { delete d.TAGS['ST01-001']; },
  'leader-tag (free agent without its explicit [])': (d) => { delete d.TAGS['BP01-016']; },
  'leader-tag (not an array)': (d) => { d.TAGS['BP01-003'] = 'VSPO!'; },
  'tag-on-non-leader': (d) => { d.TAGS['ST01-005'] = ['VSPO!']; },
  'leader-awaken': (d) => { delete d.CARDS['ST01-001'].awakenAtk; },
  'null-number': (d) => { d.CARDS['ST01-005'].cost = null; },
  'japanese-text': (d) => { d.CARDS['ST01-005'].text += ' クロス'; },
  'japanese-text (nameEn)': (d) => { d.CARDS['ST01-005'].nameEn = '漢字'; },
  'japanese-text (leader name not in NAME_KEPT_JA)': (d) => { delete d.NAME_KEPT_JA['BP01-013']; },
  'name-kept-ja': (d) => { d.NAME_KEPT_JA['ST01-005'] = 'x'; },
  'name-kept-ja (romanised but still listed)': (d) => { d.CARDS['BP01-013'].nameEn = 'Sena'; },
  'text-tag': (d) => { d.CARDS['ST01-005'].text += ' [Foo]'; },
  'tactics-type': (d) => { delete d.CARDS['BP03-080'].tactics; },
  'equip-shape': (d) => { d.CARDS['BP03-080'].equip = { hpBase: 140 }; },
  'equip-shape (on a non-equipment card)': (d) => { d.CARDS['ST01-005'].equip = { hp: 10 }; },
  'build-shape': (d) => { d.CARDS['BP01-023'].build = { type: 'require_leader', family: 3 }; },
  'build-rule (colour count: 3+ red leaders)': (d) => { d.CARDS['ST02-002'].color = 'blue'; },
  'build-rule (exact leader name, not family only)': (d) => { d.CARDS['BP01-003'].name = '橘ひなの (IGV)'; },
  'deck-format': (d) => { d.DECKS.C01.format = 'casual'; },
  'deck-format (competitive without tier)': (d) => { delete d.DECKS.C01.tier; },
  'deck-source': (d) => { delete d.DECKS.C01.source.url; },
  'banned-card': (d) => { d.DECKS.C01.tactics[0] = 'ST01-020'; },
  'banned-card (a starter flagged competitive loses the exemption)': (d) => { d.DECKS.ST01.format = 'competitive'; d.DECKS.ST01.tier = 'competitive'; d.DECKS.ST01.source = { url: 'https://example.invalid', event: 'x', fetched: '2026-10-30' }; },
  'art-pending-unknown': (d) => { d.ART_PENDING.push('ZZ99-001'); },
  'art-unknown': (d) => { d.ART['ZZ99-001'] = { file: 'a.webp', kind: 'card', prompt: 'p' }; },
  'sound-unknown': (d) => { d.SOUNDS.x = { file: 'a.mp3' }; },
};

// data/restrictions.js against the API's restriction rows ({card_family_id, max_copies}); a family is restricted iff it is in both.
export function restrictionsVsApi(R, rows) {
  const out = [];
  const want = Object.fromEntries(rows.map((r) => [String(r.card_family_id), r.max_copies]));
  for (const [fam, v] of Object.entries(want)) {
    if (!R.families[fam]) out.push({ rule: 'restrictions-api', msg: `API restricts family ${fam} (max ${v}) but data/restrictions.js does not` });
    else if (R.families[fam].max !== v) out.push({ rule: 'restrictions-api', msg: `family ${fam}: max ${R.families[fam].max} in data/restrictions.js, ${v} in the API` });
  }
  for (const fam of Object.keys(R.families)) if (!(fam in want)) out.push({ rule: 'restrictions-api', msg: `data/restrictions.js restricts family ${fam}, the API does not` });
  return out;
}

function selftest() {
  const base = loadData();
  const clean = validate(base);
  let bad = 0;
  if (clean.errors.length) { bad++; console.log('FAIL selftest: the clean data does not validate: ' + clean.errors[0].msg); }
  for (const [name, mutate] of Object.entries(MUTATIONS)) {
    const rule = name.split(' ')[0];
    const d = structuredClone(base);
    mutate(d);
    const r = validate(d);
    if (!r.errors.some((e) => e.rule === rule)) { bad++; console.log(`FAIL selftest: rule ${name} did not bite`); }
  }
  // The art / sound switches: with coverage required, a manifest missing one entry must fail (a hole is punched in
  // each, so the check means the same before and after the manifests are filled).
  const holed = structuredClone(base);
  const firstFace = Object.keys(holed.ART).find((k) => !k.startsWith('ui/'));
  if (firstFace !== undefined) { delete holed.ART[firstFace]; holed.ART_PENDING = holed.ART_PENDING.filter((f) => f !== firstFace); }
  const firstCue = Object.keys(holed.SOUNDS)[0];
  if (firstCue !== undefined) delete holed.SOUNDS[firstCue];
  const strict = validate(holed, { requireArt: true, requireSound: true });
  for (const rule of ['art-missing', 'sound-missing']) {
    if (!strict.errors.some((e) => e.rule === rule)) { bad++; console.log(`FAIL selftest: rule ${rule} did not bite when required`); }
  }
  // A face missing from the manifest but listed in art-pending passes; dropping it from the pending list makes it a hole.
  // Once every face has art the clean data has no pending entry, so move one face from the manifest to the pending list.
  const pend = structuredClone(base);
  if (!pend.ART_PENDING.length && firstFace !== undefined) { delete pend.ART[firstFace]; pend.ART_PENDING.push(firstFace); }
  if (!pend.ART_PENDING.length) { bad++; console.log('FAIL selftest: no card face to prove the art-pending allowance with'); }
  else {
    if (validate(pend).errors.some((e) => e.rule === 'art-missing')) { bad++; console.log('FAIL selftest: a face listed in art-pending still failed art-missing'); }
    const dropped = structuredClone(pend);
    dropped.ART_PENDING.shift();
    if (!validate(dropped).errors.some((e) => e.rule === 'art-missing')) { bad++; console.log('FAIL selftest: a face in neither the manifest nor art-pending did not fail art-missing'); }
  }
  // The BAN exemption is explicit: the clean starters carry the banned tactic and pass; the same cards in a competitive deck fail (mutation above).
  if (!base.DECKS.ST01.tactics.includes('ST01-020') || base.DECKS.ST01.format !== 'starter') { bad++; console.log('FAIL selftest: the starter exemption is not exercised by the clean data'); }
  // A free agent with an explicit [] passes (the clean data has them).
  if (!Array.isArray(base.TAGS['BP01-016']) || base.TAGS['BP01-016'].length !== 0) { bad++; console.log('FAIL selftest: BP01-016 should be the free-agent [] example'); }
  // restrictions-api: the committed list against (synthetic) API rows.
  const rows = [{ id: 1, card_family_id: 90, max_copies: 0 }];
  if (restrictionsVsApi(base.RESTRICTIONS, rows).length) { bad++; console.log('FAIL selftest: data/restrictions.js does not match the API rows'); }
  const wrongR = structuredClone(base.RESTRICTIONS); wrongR.families[91] = { max: 0, name: 'x' };
  if (!restrictionsVsApi(wrongR, rows).length) { bad++; console.log('FAIL selftest: rule restrictions-api did not bite (extra family)'); }
  if (!restrictionsVsApi(base.RESTRICTIONS, []).length) { bad++; console.log('FAIL selftest: rule restrictions-api did not bite (missing family)'); }
  const n = Object.keys(MUTATIONS).length + 8;
  console.log(bad ? `validate-data --selftest: ${bad} problem(s)` : `validate-data --selftest: ok (${n} mutations, each rule bites)`);
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.includes('--selftest')) selftest();
  const d = loadData();
  const r = validate(d);
  // Against the API dump when it is present (gitignored; absent in CI, where the committed list stands alone).
  const apiR = path.join(ROOT, 'docs/sources/api/restrictions.json');
  if (fs.existsSync(apiR)) r.errors.push(...restrictionsVsApi(d.RESTRICTIONS, JSON.parse(fs.readFileSync(apiR, 'utf8'))));
  for (const e of r.errors) console.log(`FAIL validate-data [${e.rule}]: ${e.msg}`);
  const pend = [];
  if (!REQUIRE_ART) { console.log(`pending (M5): ${r.art.missing.length} of ${r.art.total} card faces (leaders count twice) have no art entry`); pend.push('art pending (M5)'); }
  else {
    pend.push(`art ${r.art.total - r.art.missing.length - r.art.pending}/${r.art.total} faces`);
    if (r.art.pending) pend.push(`pending art: ${r.art.pending} faces`);
  }
  if (!REQUIRE_SOUND) { console.log(`pending (M6): ${r.sound.missing.length} of ${r.sound.total} cue tags have no delivered clip`); pend.push('sound pending (M6)'); }
  else pend.push(`sound ${r.sound.total - r.sound.missing.length}/${r.sound.total} cues`);
  const nc = Object.keys(d.CARDS).length, nd = Object.keys(d.DECKS).length;
  console.log(r.errors.length
    ? `validate-data: ${r.errors.length} failure(s)`
    : `validate-data: ok (${nc} cards, ${nd} decks${pend.length ? '; ' + pend.join(', ') : ''})`);
  process.exit(r.errors.length ? 1 : 0);
}
