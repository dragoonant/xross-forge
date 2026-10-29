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
  attack: ['onPlay', 'attack', 'afterAttack', 'round'],
  memoria: ['onPlay', 'boost', 'afterAttack', 'round'],
  tactics: ['onPlay', 'boost', 'afterAttack', 'static', 'round'],
  pp: [],
};
const REQUIRED = {
  dmgPlus: ['n'], damage: ['n', 'to'], heal: ['n', 'to'], healTotal: ['n', 'unit'], draw: ['n'], discard: ['n'], recoverPP: ['n'],
  statMod: ['stat', 'n'], downAttacked: [], ticketRule: ['round'],
};

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
      for (const op of e.ops) {
        if (op.unimplemented !== undefined) {
          if (registered.has(no)) err(no, `unimplemented op in a registered deck: ${op.unimplemented}`);
          continue;
        }
        if (REQUIRED[op.op] === undefined || XS.OPS[op.op] === undefined) { err(no, `unknown op ${op.op}`); continue; }
        for (const f of REQUIRED[op.op]) if (op[f] === undefined) err(no, `${op.op} needs field ${f}`);
        if (op.op === 'dmgPlus' && !['attack', 'boost'].includes(e.timing)) err(no, 'dmgPlus only belongs to 【アタックする】 / 【アタック強化】');
        if (op.if !== undefined && XS.COND[op.if.c] === undefined) err(no, `unknown condition ${op.if && op.if.c}`);
        if (op.to !== undefined) {
          if (!['own', 'opp'].includes(op.to.side)) err(no, `${op.op}: target side must be own or opp`);
          if (!(op.to.count === 1 || op.to.count === 'all')) err(no, `${op.op}: target count must be 1 or 'all'`);
          if (op.to.other && e.timing !== 'afterAttack' && e.timing !== 'attack') err(no, `${op.op}: "other" only makes sense inside an attack`);
        }
        for (const k of ['n']) if (op[k] !== undefined && !(typeof op[k] === 'number' || (op[k] && op[k].perOwnTag))) err(no, `${op.op}: bad ${k}`);
      }
    }
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
  ];
  let bad = 0;
  if (check(XS.CARDS, XS.ABIL, XS.DECKS).length) { console.log('FAIL selftest: the real data is not clean'); bad++; }
  for (const [name, mutate] of cases) {
    const a = clone(XS.ABIL);
    mutate(a);
    if (check(XS.CARDS, a, XS.DECKS).length === 0) { bad++; console.log(`FAIL selftest: "${name}" was not flagged`); }
  }
  console.log(bad ? 'validate-abilities: selftest FAILED' : `validate-abilities: selftest ok (${cases.length} mutations flagged)`);
  process.exit(bad ? 1 : 0);
}

const errs = check(XS.CARDS, XS.ABIL, XS.DECKS);
for (const e of errs) console.log('FAIL ' + e);
const n = Object.values(XS.ABIL).reduce((s, a) => s + a.effects.reduce((t, e) => t + e.ops.length, 0), 0);
console.log(`validate-abilities: ${errs.length ? errs.length + ' failure(s)' : 'ok'} (${Object.keys(XS.CARDS).length} cards, ${n} ops)`);
process.exit(errs.length ? 1 : 0);
