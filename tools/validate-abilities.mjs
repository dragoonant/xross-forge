// Structural check of data/abilities.js (docs/ABILITIES.md). Fails when:
//  - a card in data/cards.js has no entry (or an entry has no card);
//  - an effect has an unknown timing, a timing its card type cannot have, or an op the engine does not know / that lacks fields;
//  - a condition or target is malformed;
//  - any `{unimplemented: 'why'}` op sits on a card of a registered deck (CLAUDE.md rule 8; such a card goes in data/defects.js).
// --selftest proves each check fires on a deliberately broken entry.
import { loadPage } from './test.mjs';

const XS = loadPage('tests.html').XS;
const TYPE_TIMINGS = {
  leader: ['onAwaken'],
  attack: ['onPlay', 'attack', 'afterAttack', 'round', 'static'],
  memoria: ['onPlay', 'boost', 'afterAttack', 'round', 'static'],
  tactics: ['onPlay', 'boost', 'afterAttack', 'static', 'round'],
  pp: [],
};
const REQUIRED = {
  dmgPlus: ['n'], damage: ['n', 'to'], heal: ['n', 'to'], healTotal: ['n', 'unit'], draw: ['n'], discard: [], recoverPP: ['n'],
  statMod: ['stat', 'n'], downAttacked: [], ticketRule: ['round'],
  reveal: ['n'], look: ['n'], lookPick: ['to'], lookRest: [], freePlay: ['from', 'max'], awaken: [], revive: [], atkBuff: ['n', 'until'],
  shuffleTrash: [], echo: [], costMod: ['n'], costFloor: ['n'], costFree: [], costAura: ['n'], atkMod: ['n'], grant: ['timing', 'ops'],
  playIf: ['if', 'msg'], mustTarget: [],
};
// Ops that are data for the engine to read, never run: they belong to a card's `static` effects (or `round` for the two auras).
const STATIC_OPS = new Set(['statMod', 'ticketRule', 'echo', 'costMod', 'costFloor', 'costFree', 'grant', 'playIf', 'mustTarget']);
const ROUND_OPS = new Set(['costAura', 'atkMod']);
// Conditions that only make sense while an attack is being resolved.
const ATTACK_CONDS = new Set(['attackedDown', 'overkill', 'attackerAwakened', 'attackerDamaged', 'attackerEquipped', 'attackerRemaining', 'attackerColor', 'afterDealt']);

function checkCond(no, cond, timing, err) {
  if (XS.COND[cond.c] === undefined) { err(no, `unknown condition ${cond.c}`); return; }
  if (ATTACK_CONDS.has(cond.c) && !['attack', 'afterAttack', 'boost'].includes(timing)) err(no, `condition ${cond.c} is only meaningful in an attack effect`);
  if (cond.c === 'overkill' && timing !== 'afterAttack') err(no, 'オーバーキル belongs to an 【アタック後】 effect');
}

// One effect's ops. `seen` tracks what earlier ops of the same group provide (a look window, revealed cards, an optional action).
function checkOps(no, c, timing, ops, err, registered, inGrant) {
  const seen = { look: false, reveal: false, optional: false };
  for (const op of ops) {
    if (op.unimplemented !== undefined) {
      if (registered.has(no)) err(no, `unimplemented op in a registered deck: ${op.unimplemented}`);
      continue;
    }
    if (REQUIRED[op.op] === undefined || XS.OPS[op.op] === undefined) { err(no, `unknown op ${op.op}`); continue; }
    for (const f of REQUIRED[op.op]) if (op[f] === undefined) err(no, `${op.op} needs field ${f}`);
    if (op.op === 'dmgPlus' && !['attack', 'boost'].includes(timing)) err(no, 'dmgPlus only belongs to 【アタックする】 / 【アタック強化】');
    if (STATIC_OPS.has(op.op) && timing !== 'static' && !inGrant) err(no, `${op.op} is a static marker: it belongs to a static effect`);
    if (ROUND_OPS.has(op.op) && timing !== 'round') err(no, `${op.op} belongs to a 【ラウンド中】 (round) effect`);
    if (!STATIC_OPS.has(op.op) && !ROUND_OPS.has(op.op) && (timing === 'static' || timing === 'round') && !inGrant) err(no, `${op.op} cannot sit in a ${timing} effect`);
    if (op.if !== undefined) {
      checkCond(no, op.if, timing, err);
      if (op.if.c === 'did' && !seen.optional) err(no, 'cond did (そうしたなら) needs an earlier optional op in the same effect');
      if (op.if.c === 'seenType' && !seen.look && !seen.reveal) err(no, 'cond seenType needs an earlier look or reveal');
    }
    if (op.op === 'lookPick' || op.op === 'lookRest' || (op.op === 'freePlay' && op.from === 'look')) { if (!seen.look) err(no, `${op.op} needs an earlier look in the same effect`); }
    if (op.op === 'freePlay' && !['hand', 'look'].includes(op.from)) err(no, 'freePlay from hand or look');
    if (op.op === 'lookPick' && !['hand', 'trash'].includes(op.to)) err(no, 'lookPick to hand or trash');
    if (op.op === 'discard' && op.of === 'revealed' && !seen.reveal) err(no, 'discard of revealed needs an earlier reveal');
    if (op.op === 'discard' && op.of !== 'revealed' && typeof op.n !== 'number') err(no, 'discard needs a number n');
    if (op.op === 'atkBuff' && !['turn', 'round'].includes(op.until)) err(no, 'atkBuff until turn or round');
    if (op.op === 'look') seen.look = true;
    if (op.op === 'reveal') seen.reveal = true;
    if (op.optional === true || op.op === 'reveal' || op.op === 'freePlay' || op.op === 'lookPick') seen.optional = true;
    if (op.op === 'grant') {
      if (op.timing !== 'afterAttack') err(no, 'grant only supports afterAttack');
      if (Array.isArray(op.ops)) checkOps(no, c, 'afterAttack', op.ops, err, registered, true);
    }
    if (op.to !== undefined) {
      if (!['own', 'opp'].includes(op.to.side)) err(no, `${op.op}: target side must be own or opp`);
      const k = op.to.count;
      if (!(k === 1 || k === 'all' || k === 'attacker' || (Number.isInteger(k) && k >= 2 && op.to.upTo === true))) err(no, `${op.op}: target count must be 1, 'all', 'attacker' or N with upTo`);
      if (op.to.other && timing !== 'afterAttack' && timing !== 'attack') err(no, `${op.op}: "other" only makes sense inside an attack`);
    }
    const valOk = (v) => typeof v === 'number' || (v && typeof v === 'object' && (v.perOwnTag || v.perPlay || v.playCostSum || v.perRevealed || v.revealedCost));
    for (const k of ['n']) if (op[k] !== undefined && !valOk(op[k])) err(no, `${op.op}: bad ${k}`);
  }
}

function check(cards, abil, decks) {
  const errs = [];
  const err = (no, m) => errs.push(`${no}: ${m}`);
  for (const no of Object.keys(cards)) if (abil[no] === undefined) err(no, 'no entry in data/abilities.js');
  for (const no of Object.keys(abil)) if (cards[no] === undefined) err(no, 'entry for an unknown card');
  const registered = new Set();
  for (const d of Object.values(decks)) for (const id of [...d.leaders, ...d.main.map((m) => m[0]), ...d.tactics, d.ppTicket, d.ppCard]) if (id) registered.add(id);
  for (const [no, a] of Object.entries(abil)) {
    const c = cards[no];
    if (c === undefined) continue;
    if (!Array.isArray(a.effects)) { err(no, 'effects must be an array'); continue; }
    const allowed = TYPE_TIMINGS[c.type];
    if (c.type === 'leader' && a.effects.filter((e) => e.timing === 'onAwaken').length !== 1) err(no, 'a leader has exactly one 【覚醒時】 effect');
    if (c.type === 'attack' && !a.effects.some((e) => e.timing === 'attack')) err(no, 'an attack card needs a 【アタックする】 effect (an empty one is fine)');
    for (const e of a.effects) {
      if (!XS.TIMINGS.includes(e.timing)) { err(no, `unknown timing ${e.timing}`); continue; }
      if (allowed && !allowed.includes(e.timing)) err(no, `a ${c.type} card cannot have timing ${e.timing}`);
      if (!Array.isArray(e.ops)) { err(no, `${e.timing}: ops must be an array`); continue; }
      checkOps(no, c, e.timing, e.ops, err, registered, false);
    }
    if (c.equip !== undefined && a.effects.some((e) => e.ops.some((o) => o.op === 'statMod'))) err(no, 'equipment stats are given twice: CARDS.equip and a statMod op');
  }
  return errs;
}

if (process.argv.includes('--selftest')) {
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const cases = [
    ['missing entry', (a) => { delete a['ST01-007']; }],
    ['unknown timing', (a) => { a['ST01-007'].effects[1].timing = 'whenever'; }],
    ['unknown op', (a) => { a['ST01-007'].effects[1].ops[0].op = 'explode'; }],
    ['missing field', (a) => { delete a['ST01-007'].effects[1].ops[0].n; }],
    ['unimplemented in a registered deck', (a) => { a['ST01-007'].effects[1].ops[0] = { unimplemented: 'not done' }; }],
    ['leader with an attack timing', (a) => { a['ST01-001'].effects.push({ timing: 'attack', ops: [] }); }],
    ['bad condition', (a) => { a['ST01-008'].effects[1].ops[0].if = { c: 'moonPhase' }; }],
    ['bad target', (a) => { a['ST01-007'].effects[1].ops[0].to.count = 3; }],
    ['lookPick without a look', (a) => { a['ST01-007'].effects[1].ops.push({ op: 'lookPick', to: 'hand' }); }],
    ['"そうしたなら" without an optional op', (a) => { a['ST01-007'].effects[1].ops.push({ op: 'draw', n: 1, if: { c: 'did' } }); }],
    ['overkill outside an 【アタック後】', (a) => { a['ST01-014'].effects.push({ timing: 'onPlay', ops: [{ op: 'draw', n: 1, if: { c: 'overkill', n: 30 } }] }); }],
    ['a static marker in an onPlay effect', (a) => { a['ST01-014'].effects.push({ timing: 'onPlay', ops: [{ op: 'echo' }] }); }],
    ['equipment stats given twice (CARDS.equip and statMod)', (a) => { a['ST01-023'].effects.push({ timing: 'static', ops: [{ op: 'statMod', stat: 'hp', n: 30 }] }); }],
    ['a count of 2 without upTo', (a) => { a['ST01-007'].effects[1].ops[0].to.count = 2; }],
    ['freePlay without a source', (a) => { a['ST01-007'].effects[1].ops.push({ op: 'freePlay', max: 1 }); }],
  ];
  let bad = 0;
  // Cards registered without an ability entry yet (the booster cards before their scripts are written) are an expected finding of the real run;
  // everything else in the real data must be clean, and every mutation must add a finding on top of the baseline.
  const baseline = check(XS.CARDS, XS.ABIL, XS.DECKS).filter((e) => !e.endsWith('no entry in data/abilities.js'));
  if (baseline.length) { console.log('FAIL selftest: the real data is not clean'); bad++; }
  const base = check(XS.CARDS, XS.ABIL, XS.DECKS).length;
  for (const [name, mutate] of cases) {
    const a = clone(XS.ABIL), cards = clone(XS.CARDS);
    mutate(a, cards);
    if (check(cards, a, XS.DECKS).length <= base) { bad++; console.log(`FAIL selftest: "${name}" was not flagged`); }
  }
  console.log(bad ? 'validate-abilities: selftest FAILED' : `validate-abilities: selftest ok (${cases.length} mutations flagged)`);
  process.exit(bad ? 1 : 0);
}

const errs = check(XS.CARDS, XS.ABIL, XS.DECKS);
for (const e of errs) console.log('FAIL ' + e);
const n = Object.values(XS.ABIL).reduce((s, a) => s + a.effects.reduce((t, e) => t + e.ops.length, 0), 0);
console.log(`validate-abilities: ${errs.length ? errs.length + ' failure(s)' : 'ok'} (${Object.keys(XS.CARDS).length} cards, ${n} ops)`);
process.exit(errs.length ? 1 : 0);
