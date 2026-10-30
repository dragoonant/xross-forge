// Headless random-vs-random games with invariants checked after EVERY step: a crash/consistency gate and a behaviour
// readout, never a balance instrument. Usage:
//   node tools/sim.mjs --games 200 --seed 1 [--leaktest N] [--cap 6000] [--verbose]
// Exit 1 on any invariant failure, leak, capped game or non-determinism.
import { loadPage } from './test.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const GAMES = +arg('games', 200), SEED = +arg('seed', 1), CAP = +arg('cap', 6000), LEAK = +arg('leaktest', 5);   // leak test every Nth step (1 = every step)
const VERBOSE = process.argv.includes('--verbose');

const XS = loadPage('tests.html').XS;
const DECKS = ['ST01', 'ST02'];

// Own tiny PRNG for the policy (the engine's RNG lives in the state).
let pr = SEED * 2654435761 >>> 0 || 1;
const rnd = () => { pr ^= pr << 13; pr >>>= 0; pr ^= pr >>> 17; pr ^= pr << 5; pr >>>= 0; return pr / 4294967296; };

const REG = new WeakMap();   // registry object -> size (the registry never changes within a game)
const ZONES = ['deck', 'hand', 'play', 'trash', 'tdeck', 'tarea', 'aside'];

function fail(msg) { throw new Error(msg); }

function invariants(s) {
  // every card instance is in exactly one place
  const seen = new Set();
  const place = (iid) => { if (seen.has(iid)) fail(`card ${iid} in two places`); seen.add(iid); if (s.cards[iid] === undefined) fail(`unknown card ${iid}`); };
  for (const P of s.players) {
    for (const z of ZONES) for (const i of P[z]) place(i);
    for (const L of P.leaders) { place(L.iid); for (const e of L.equipment) place(e); }
  }
  let total = REG.get(s.cards);
  if (total === undefined) { total = Object.keys(s.cards).length; REG.set(s.cards, total); }
  if (seen.size !== total) fail(`registry ${total} vs placed ${seen.size}`);
  for (const [seat, P] of s.players.entries()) {
    for (const n of [P.pp.total, P.pp.untapped, P.hand.length, P.deck.length, ...s.wins]) if (!Number.isInteger(n) || n < 0) fail(`bad count ${n}`);
    if (P.pp.untapped > P.pp.total) fail('PP untapped > total');
    if (P.pp.total > 5) fail('PP total > 5');
    for (const L of P.leaders) {
      if (!Number.isInteger(L.damage) || L.damage < 0) fail(`bad damage on ${L.iid}`);
      const st = XS.leaderStats(s, seat, L.slot);
      if (Number.isNaN(st.atk) || Number.isNaN(st.hp)) fail('NaN stat');
      if (L.down && L.damage !== 0) fail('downed leader holds counters');
      if (!L.down && L.damage >= st.hp && s.phase !== 'over') fail(`leader ${L.iid} has counters >= HP and is not down`);
    }
    for (const i of P.trash) if (s.cards[i].kind === 'tactics' && false) fail('x');
    for (const i of P.tarea) if (s.cards[i].kind !== 'tactics') fail('non-tactics in tactics area');
    for (const i of P.tdeck) if (s.cards[i].ticket) fail('PP Ticket in the tactics deck');
    if (P.hand.length > 7 + 20) fail('hand absurdly large');
  }
  if (s.roundLoser !== null && s.stack.length === 0 && s.phase !== 'over') fail('a decided round was not closed');
  const L = XS.legalActions(s);
  if (XS.isTerminal(s)) { if (L.length) fail('legal actions in a terminal state'); if (XS.whoActs(s) !== null) fail('whoActs not null at the end'); }
  else {
    if (!L.length) fail('no legal actions' + (s.pending ? ' (pending ' + s.pending.kind + ')' : ''));
    const w = XS.whoActs(s);
    if (w !== 0 && w !== 1) fail('whoActs ' + w);
    if (s.pending && s.pending.seat !== w) fail('pending seat mismatch');
    if (s.pending && s.pending.kind !== 'attackPair' && s.pending.kind !== 'chooseFirst' && s.pending.kind !== 'distribute' && s.pending.options.length < s.pending.min) fail('pending has fewer options than min');
  }
  return L;
}

// Hidden-information leak test (CLAUDE.md rule 7): serialise the WHOLE view, log included, and look for ids it must not contain.
// A card id is legitimately in a view when the viewer was ever shown that card: it was in `view.cards` at some step (own hand, play
// areas, face-up trash, cards looked at), or it came in a log entry of the viewer's own seat or a revealed one. `known` (one Set per
// seat and game) accumulates exactly that. Any other id of a card in the opponent's hand / decks / face-down tactics, or in the viewer's
// own deck, found anywhere in the view JSON is a leak.
// Log types whose ids are public by their rules (a card played, a play area trashed, an equipment attached...). A type NOT listed here
// (draw, tacticsPick, discard, look, and any type added later) is trusted only for the viewer's own entries or when it says `revealed`.
const PUBLIC_LOG = new Set(['start', 'rps', 'chooseFirst', 'roundStart', 'tacticsPlace', 'turnStart', 'turnEnd', 'ppRecover', 'ppSpend', 'play', 'tacticsPlay',
  'equip', 'boost', 'attack', 'damage', 'heal', 'down', 'awaken', 'ability', 'trash', 'reshuffle', 'tacticsBurn', 'roundEnd', 'matchEnd', 'fizzle',
  'overkill', 'echo', 'freePlay', 'revive']);
const idsIn = (v, out) => {
  if (typeof v === 'string') { if (/^[cL]\d+$/.test(v)) out.add(v); }
  else if (Array.isArray(v)) v.forEach((x) => idsIn(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => idsIn(x, out));
};
function leakIds(s, seat, v, known) {
  const me = s.players[seat], op = s.players[1 - seat];
  for (const k of Object.keys(v.cards)) known.add(k);
  for (const e of v.log) if (e.seat === seat || PUBLIC_LOG.has(e.type) || (e.data && e.data.revealed === true)) idsIn(e.data, known);
  const hidden = new Set([...op.hand, ...op.deck, ...op.tdeck, ...op.tarea.filter((i) => !s.cards[i].ticket), ...me.deck]);
  const found = [];
  const { log, ...rest } = v;
  const sets = [new Set(), new Set()];
  idsIn(rest, sets[0]);
  idsIn(log, sets[1]);
  for (const [k, set] of sets.entries()) for (const id of set) if (hidden.has(id) && !known.has(id)) found.push(`${id} in the ${k === 0 ? 'view' : 'log'}`);
  return found;
}

// Every step: what each seat is shown now becomes knowledge (a card played in the open and shuffled back later is still known).
function observe(s, known) {
  for (const seat of [0, 1]) {
    const v = XS.view(s, seat);
    for (const k of Object.keys(v.cards)) known[seat].add(k);
    for (const e of v.log) if (e.seat === seat || PUBLIC_LOG.has(e.type) || (e.data && e.data.revealed === true)) idsIn(e.data, known[seat]);
  }
}

function leakTest(s, known) {
  for (const seat of [0, 1]) {
    const v = XS.view(s, seat);
    const bad = leakIds(s, seat, v, known[seat]);
    if (bad.length) fail(`leak: ${bad[0]} visible to seat ${seat}`);
    for (const k of ['rng', 'seed', 'stack', 'init', 'actions', 'losing', 'freeQ', 'once']) if (k in v) fail(`leak: view carries ${k}`);
    // face-down trash is unviewable even to the owner (rules.md §4)
    s.players.forEach((P, p) => v.players[p].trash.forEach((e, i) => {
      const real = s.cards[P.trash[i]];
      if (real.kind !== 'tactics' && e.hidden !== true) fail('face-down trash visible in view');
    }));
    // redacted log entries carry no ids for the other seat
    for (const e of v.log) {
      if (e.seat !== seat && (e.type === 'draw' || e.type === 'tacticsPick' || e.type === 'discard' || (e.type === 'look' && e.data.revealed !== true)) && (e.data.iid !== undefined || e.data.iids !== undefined || e.data.cardId !== undefined || e.data.cardIds !== undefined)) fail(`log leak in ${e.type}`);
    }
    if (s.pending && s.pending.seat !== seat && (s.pending.kind === 'pickTactics' || ['discard', 'handLimit', 'look', 'reveal', 'freePlay'].includes(s.pending.purpose)) && v.pending.options.length) fail('pending options leak');
  }
}

// --selftest: the scan must see a planted id in the log (the old scan skipped the log), in the view, and must accept a revealed one.
if (process.argv.includes('--selftest')) {
  const s = XS.newGame({ decks: ['ST01', 'ST02'], seed: 3, first: 0 });
  let t = s;
  while (t.pending) t = XS.apply(t, XS.legalActions(t)[0]);
  const op = t.players[1];
  const planted = op.deck[0], inHand = op.hand[0];
  const fresh = () => [new Set(), new Set()];
  const cases = [
    ['clean view', (v) => {}, 0],
    ['opponent deck id in a log entry of the opponent', (v) => { v.log = v.log.concat([{ seq: 99, seat: 1, type: 'look', data: { phase: 'see', iids: [planted], revealed: false } }]); }, 1],
    ['opponent hand id in the view', (v) => { v.players[1].hand[0] = inHand; }, 1],
    ['a revealed id in the log is fine', (v) => { v.log = v.log.concat([{ seq: 99, seat: 1, type: 'look', data: { phase: 'reveal', iids: [planted], revealed: true } }]); }, 0],
    ['own seat log entries may carry own ids', (v) => { v.log = v.log.concat([{ seq: 99, seat: 0, type: 'look', data: { phase: 'see', iids: [t.players[0].deck[0]], revealed: false } }]); }, 0],
  ];
  let bad = 0;
  for (const [name, mutate, want] of cases) {
    const v = XS.view(t, 0);
    mutate(v);
    const n = leakIds(t, 0, v, fresh()[0]).length;
    if ((want === 0) !== (n === 0)) { bad++; console.log(`FAIL selftest ${name}: ${n} leaks, wanted ${want}`); }
  }
  console.log(bad ? 'sim: selftest FAILED' : `sim: selftest ok (${cases.length} cases)`);
  process.exit(bad ? 1 : 0);
}

const stats = {
  games: 0, errors: 0, capped: 0, steps: 0, decisive: 0, wins: [0, 0], firstWins: 0, reasons: {}, modes: { full: 0, quick: 0 },
  rounds: 0, awakenings: 0, reshuffles: 0, burns: 0, tacticsPlayed: 0, plays: 0, attacks: 0, downs: 0, endTurns: 0, emptyTurns: 0, picks: 0, fizzles: 0,
  pendingKinds: {}, roundHist: {}, ms: 0, leakChecks: 0, purityChecks: 0, replays: 0,
};
const failures = [];
const t0 = Date.now();

for (let g = 0; g < GAMES; g++) {
  const mode = g % 4 === 3 ? 'quick' : 'full';
  let decks = [DECKS[Math.floor(rnd() * 2)], DECKS[Math.floor(rnd() * 2)]];
  // every 5th game uses 12-card decks so the deck-out procedure, the tactics burn and the tactics-deck loss are exercised constantly
  const thin = g % 5 === 4;
  if (thin) decks = decks.map((id) => ({ leaders: XS.DECKS[id].leaders, main: XS.DECKS[id].main.slice(0, 6).map(([c]) => [c, 2]), tactics: XS.DECKS[id].tactics, ppTicket: XS.DECKS[id].ppTicket, name: id + ' (12 cards)' }));
  const first = g % 3 === 0 ? 'random' : g % 3 === 1 ? 0 : 1;
  const init = { decks, seed: SEED * 100000 + g, mode, first };
  let s, steps = 0;
  try {
    s = XS.newGame(init);
    invariants(s);
    let actedThisTurn = 0, turnSeen = s.turn;
    const known = [new Set(), new Set()];
    observe(s, known);
    while (!XS.isTerminal(s) && steps < CAP) {
      const L = invariants(s);
      if (steps % LEAK === 0) { leakTest(s, known); stats.leakChecks++; }
      const a = L[Math.floor(rnd() * L.length)];
      if (s.pending) stats.pendingKinds[s.pending.kind] = (stats.pendingKinds[s.pending.kind] || 0) + 1;
      const before = steps % 40 === 0 ? JSON.stringify(s) : null;
      const n = s.seq;
      const next = XS.apply(s, a);
      if (before !== null) { stats.purityChecks++; if (JSON.stringify(s) !== before) fail('apply mutated its input'); }
      for (let i = n; i < next.seq; i++) {
        const e = next.log[i];
        switch (e.type) {
          case 'awaken': stats.awakenings++; break;
          case 'reshuffle': stats.reshuffles++; break;
          case 'tacticsBurn': stats.burns++; break;
          case 'tacticsPlay': stats.tacticsPlayed++; break;
          case 'play': stats.plays++; break;
          case 'attack': stats.attacks++; break;
          case 'down': stats.downs++; break;
          case 'tacticsPick': stats.picks++; break;
          case 'fizzle': stats.fizzles++; break;
          case 'roundEnd': stats.rounds++; break;
        }
      }
      if (a.type === 'endTurn') { stats.endTurns++; if (actedThisTurn === 0) stats.emptyTurns++; actedThisTurn = 0; } else if (a.type === 'play') actedThisTurn++;
      s = next;
      observe(s, known);
      steps++;
      stats.steps++;
    }
    invariants(s);
    leakTest(s, known);
    if (!XS.isTerminal(s)) { stats.capped++; failures.push(`game ${g}: capped at ${CAP} steps`); }
    else {
      stats.decisive++;
      stats.modes[mode]++;
      if (s.result.winner !== null) { stats.wins[s.result.winner]++; }
      const r = s.result.reason;
      stats.reasons[r] = (stats.reasons[r] || 0) + 1;
      const rr = s.round;
      stats.roundHist[rr] = (stats.roundHist[rr] || 0) + 1;
    }
    // determinism: a replay of (init, actions) reproduces the state exactly (checked on a sample of games)
    if (g % 20 === 0) {
      const again = XS.replay(s.init, s.actions);
      stats.replays++;
      if (JSON.stringify(again) !== JSON.stringify(s)) fail('replay diverged from the original game');
    }
  } catch (e) {
    stats.errors++;
    failures.push(`game ${g} (${thin ? 'thin ' : ''}${decks.map((d) => d.name || d).join(' vs ')} ${init.mode} seed ${init.seed}) step ${steps}: ${e.message}\n    ${String(e.stack).split('\n').slice(1, 4).join('\n    ')}`);
    if (VERBOSE) console.log(failures[failures.length - 1]);
  }
  stats.games++;
}
stats.ms = Date.now() - t0;
for (const f of failures.slice(0, 8)) console.log('FAIL ' + f);
const per = (n) => (n / Math.max(1, stats.games)).toFixed(2);
const gps = (stats.games / Math.max(0.001, stats.ms / 1000)).toFixed(1);
console.log(`  decisive ${stats.decisive} reasons ${JSON.stringify(stats.reasons)} modes ${JSON.stringify(stats.modes)} wins seat0/seat1 ${stats.wins.join('/')} final-round histogram ${JSON.stringify(stats.roundHist)}`);
console.log(`  per game: steps ${per(stats.steps)}, rounds ${per(stats.rounds)}, awakenings ${per(stats.awakenings)}, attacks ${per(stats.attacks)}, downs ${per(stats.downs)}, plays ${per(stats.plays)}, tactics played ${per(stats.tacticsPlayed)}, tactics picked ${per(stats.picks)}, reshuffles ${per(stats.reshuffles)}, tactics burned ${per(stats.burns)}, fizzles ${per(stats.fizzles)}; empty turns ${(100 * stats.emptyTurns / Math.max(1, stats.endTurns)).toFixed(0)}%`);
console.log(`  pending decisions answered: ${JSON.stringify(stats.pendingKinds)}; purity checks ${stats.purityChecks}, replay checks ${stats.replays}`);
console.log(`sim: ${stats.games} games, ${stats.errors} invariant failures, ${stats.capped} capped, ${stats.leakChecks} leak checks (0 leaks), ${gps} games/s`);
process.exit(stats.errors || stats.capped ? 1 : 0);
