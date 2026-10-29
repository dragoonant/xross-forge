// tests/40-ai.js: the AI (M4). Named for the requirement each one asserts (docs/ai.md):
//   view-only decisions, determinization, exhaustive POLICIES, the evaluator perceives each rule, the search scores plays against
//   doing nothing, the clock is injected, the worker protocol. The AI is exercised through XS.apply only; no test reads an
//   answer out of the engine's private state.
(function () {
  const XS = globalThis.XS;
  const { test, eq, ok, throws } = XS.T;
  const AI = XS.ai;
  const fx = XS.T.fx;

  const FROZEN = () => 0;                         // the injected clock: time never advances, so only node caps bound a search
  const opts = (tier, seat, seed, extra) => Object.assign({ tier, seat, seed, now: FROZEN, budgetMs: Infinity }, extra);
  const W = AI.WEIGHTS.full;
  const ev = (s, seat, bank) => AI.evaluate(s, seat, W, bank ? { bank: true } : undefined);

  // The contract's pending kinds and purposes (docs/ENGINE-API.md "Pending decision"); POLICIES must be exactly this table.
  const CONTRACT = { chooseFirst: ['first'], pickTactics: ['tactics'], choose: ['target', 'heal', 'discard', 'handLimit', 'order'], attackPair: ['attack'], distribute: ['distribute'] };

  // Play random legal actions until `pred(s)` holds (or the game ends); returns the state.
  function randomUntil(seed, pred, decks) {
    let s = XS.newGame({ decks: decks || ['ST01', 'ST02'], seed, mode: 'full', first: 'random' });
    let r = seed * 7919 + 13;
    const rnd = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
    for (let i = 0; i < 4000 && !XS.isTerminal(s); i++) {
      if (pred(s)) return s;
      const L = XS.legalActions(s);
      s = XS.apply(s, L[Math.floor(rnd() * L.length)]);
    }
    return s;
  }
  // The first player's turn 1, ST01 (seat 0) against ST02.
  const base = () => fx.toTurnOf(fx.start({ decks: ['ST01', 'ST02'], first: 0 }), 0);
  const inMain = (s) => s.pending === null && s.phase === 'main';

  // ---- POLICIES -----------------------------------------------------------------------------------------------------------------
  test('AI policies: the table is exactly the contract\'s pending kinds x purposes', () => {
    eq(Object.keys(AI.POLICIES).sort(), Object.keys(CONTRACT).sort(), 'kinds');
    for (const k of Object.keys(CONTRACT)) eq(Object.keys(AI.POLICIES[k]).sort(), CONTRACT[k].slice().sort(), 'purposes of ' + k);
  });
  test('AI policies: an unknown pending kind or purpose throws (never a random move)', () => {
    throws(() => AI.pendingPolicy('mulligan', 'first'), 'unknown kind');
    throws(() => AI.pendingPolicy('choose', 'sacrifice'), 'unknown purpose');
    throws(() => AI.pendingPolicy('chooseFirst', 'target'), 'purpose of another kind');
    const view = XS.view(fx.start({}), 0);
    view.pending = { kind: 'choose', purpose: 'mystery', seat: 0, options: [], min: 1, max: 1, source: null };
    throws(() => AI.answerPending(view, { W, stats: {} }), 'answerPending with an unknown purpose');
  });
  test('AI policies: every pending decision of 40 random games has a policy and a LEGAL answer', () => {
    const seen = {};
    for (let g = 0; g < 40; g++) {
      let s = XS.newGame({ decks: g % 2 ? ['ST01', 'ST02'] : ['ST02', 'ST01'], seed: 500 + g, mode: g % 4 === 3 ? 'quick' : 'full', first: 'random' });
      let r = g + 1;
      const rnd = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
      for (let i = 0; i < 4000 && !XS.isTerminal(s); i++) {
        if (s.pending !== null) {
          const v = XS.view(s, s.pending.seat);
          const a = AI.answerPending(v, { W, stats: {} });
          seen[s.pending.kind + '/' + s.pending.purpose] = true;
          XS.apply(s, a);                                         // throws XS.Illegal if the policy's answer is not legal
        }
        const L = XS.legalActions(s);
        s = XS.apply(s, L[Math.floor(rnd() * L.length)]);
      }
    }
    for (const k of ['chooseFirst/first', 'pickTactics/tactics', 'choose/target', 'choose/heal', 'choose/discard', 'choose/handLimit', 'choose/order']) ok(seen[k], 'never met ' + k);
  });
  test('AI policies: attackPair picks the pair that downs a leader (a hand-built pending: the starters have no On Play attack card)', () => {
    let s = fx.arrange(base(), (h, t) => { h.hand(0, ['ST01-009']); h.damage(1, 2, XS.leaderStats(t, 1, 2).hp - 20); });
    const v = XS.view(s, 0);
    const card = v.players[0].hand[0];
    v.pending = { kind: 'attackPair', purpose: 'attack', seat: 0, source: null, card, attackers: ['L00', 'L01', 'L02', 'L03'], targets: ['L10', 'L11', 'L12', 'L13'], options: [], min: 1, max: 1, prompt: '' };
    v.atk = { id: 1, seat: 0, card, seg: 0, attacker: null, target: null, downs: 0, excess: 0, closed: false };
    const a = AI.answerPending(v, { W, stats: {} });
    eq(a.type, 'attack'); eq(a.target, 'L12', 'the leader on 20 HP');
  });
  test('AI policies: First Aid Kit (distribute) splits the healing over the wounded leaders, in whole units', () => {
    let s = fx.start({ decks: ['ST01', 'ST02'], first: 0, pick: ['ST01-021', null] });
    s = fx.toTurnOf(s, 0).turn === s.turn ? s : fx.toTurnOf(s, 0);
    // turn 1 of the first player cannot play tactics (FAQ #49): pass a turn each, then heal
    s = fx.toTurnOf(fx.toTurnOf(s, 1), 0);
    s = fx.arrange(s, (h) => { h.damage(0, 0, 60); h.damage(0, 1, 30); h.spend(0, 0); });
    s = fx.play(s, 'ST01-021');
    eq(s.pending.kind, 'distribute');
    const a = AI.answerPending(XS.view(s, 0), { W, stats: {} });
    eq(Object.values(a.alloc).reduce((x, y) => x + y, 0), 80, 'the whole 80 is allocated');
    ok(Object.values(a.alloc).every((n) => n % 10 === 0), 'whole units');
    const t = XS.apply(s, a);
    eq(t.players[0].leaders[0].damage + t.players[0].leaders[1].damage, 10, 'heals 80 of the 90 damage');
  });

  // ---- decide from the view only -------------------------------------------------------------------------------------------------
  // A raw state with the SAME view for `seat` but different hidden cards: the other seat's hand and deck swapped around, both
  // decks reordered, face-down trash reordered, the other seat's hidden tactics swapped.
  function twin(s, seat) {
    const t = XS.cloneState(s);
    const rev = (arr) => arr.reverse();
    for (const p of [0, 1]) {
      const P = t.players[p];
      if (p !== seat) {
        const all = P.hand.concat(P.deck);
        const n = P.hand.length;
        const swapped = all.slice(n).concat(all.slice(0, n));          // hand <-> deck contents rotated
        P.hand = swapped.slice(0, n);
        P.deck = swapped.slice(n);
        const hid = P.tdeck.concat(P.tarea.filter((i) => !t.cards[i].ticket));
        const mix = hid.slice().reverse();
        let k = 0;
        P.tdeck = P.tdeck.map(() => mix[k++]);
        P.tarea = P.tarea.map((i) => (t.cards[i].ticket ? i : mix[k++]));
      } else P.deck = rev(P.deck.slice());
      // face-down trash cards swap places among the face-down positions
      const pos = P.trash.map((i, ix) => (t.cards[i].kind !== 'tactics' ? ix : -1)).filter((x) => x >= 0);
      const ids = pos.map((x) => P.trash[x]).reverse();
      pos.forEach((x, j) => { P.trash[x] = ids[j]; });
    }
    return t;
  }
  test('AI view-only: two raw states with the same view get the same choice, at every tier', () => {
    let checked = 0, differ = 0;
    for (const seed of [3, 11, 24]) {
      for (const tier of ['easy', 'normal', 'hard']) {
        const s = randomUntil(seed, (x) => inMain(x) && x.turn >= 6 + (seed % 5));
        if (!inMain(s)) continue;
        const seat = s.active;
        const t = twin(s, seat);
        eq(JSON.stringify(XS.view(t, seat)), JSON.stringify(XS.view(s, seat)), 'the twin must have the same view');
        if (JSON.stringify(t.players[1 - seat].hand) !== JSON.stringify(s.players[1 - seat].hand)) differ++;
        const o = opts(tier, seat, seed, tier === 'hard' ? { tierOpts: { nodes: 200, rolloutNodes: 60, worlds: 2 } } : {});
        const a = AI.makeBot(o).choose(s), b = AI.makeBot(o).choose(t);
        eq(a, b, `${tier} seed ${seed}`);
        checked++;
      }
    }
    ok(checked >= 6, 'enough states were checked: ' + checked);
    ok(differ >= 3, 'the twins really differ in the hidden cards (else the test proves nothing): ' + differ);
  });
  test('AI view-only: a pending decision is answered from the view too (twin states, same policy answer)', () => {
    let n = 0;
    for (const seed of [2, 5, 9, 17, 23, 31]) {
      const s = randomUntil(seed, (x) => x.pending !== null && x.pending.kind === 'choose' && x.turn > 3);
      if (s.pending === null) continue;
      const seat = s.pending.seat, t = twin(s, seat);
      const o = opts('normal', seat, seed);
      eq(AI.makeBot(o).choose(s), AI.makeBot(o).choose(t), 'pending ' + s.pending.purpose);
      n++;
    }
    ok(n >= 3, 'pending states found: ' + n);
  });
  test('AI view-only: choose() never mutates the view it is given (a frozen view works)', () => {
    const deepFreeze = (o) => { if (o !== null && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); } return o; };
    const s = randomUntil(8, (x) => inMain(x) && x.turn >= 5);
    for (const tier of ['easy', 'normal', 'hard']) {
      const v = deepFreeze(XS.view(s, s.active));
      AI.choose(v, opts(tier, s.active, 1, tier === 'hard' ? { tierOpts: { nodes: 100, rolloutNodes: 40, worlds: 2 } } : {}));
    }
  });

  // ---- determinization -----------------------------------------------------------------------------------------------------------
  test('AI determinize: a world shows the same view to the seat it was sampled for, with the same legal actions', () => {
    for (const seed of [4, 12, 29]) {
      const s = randomUntil(seed, (x) => inMain(x) && x.turn >= 8);
      if (!inMain(s)) continue;
      for (const seat of [0, 1]) {
        const v = XS.view(s, seat);
        const w = AI.determinize(v, 99 + seed);
        const wv = XS.view(w, seat);
        eq(JSON.stringify(wv.players), JSON.stringify(v.players), 'players, seat ' + seat);
        eq(wv.wins, v.wins);
        eq(wv.turn, v.turn);
        if (seat === s.active) eq(JSON.stringify(XS.legalActions(w)), JSON.stringify(XS.legalActions(s)), 'the legal actions of the real state');
      }
    }
  });
  test('AI determinize: every card of both decklists is in exactly one place in a sampled world', () => {
    const s = randomUntil(6, (x) => inMain(x) && x.turn >= 9);
    const w = AI.determinize(XS.view(s, s.active), 5);
    for (const p of [0, 1]) {
      const P = w.players[p], def = XS.DECKS[P.deckId];
      const have = {};
      for (const z of ['deck', 'hand', 'play', 'trash']) for (const i of P[z]) if (w.cards[i].kind !== 'tactics') have[w.cards[i].id] = (have[w.cards[i].id] || 0) + 1;
      const want = {};
      for (const [id, q] of def.main) want[id] = q;
      eq(Object.entries(have).sort(), Object.entries(want).sort(), 'main-deck cards of seat ' + p);
      const tac = [];
      for (const z of ['tdeck', 'tarea', 'trash', 'play']) for (const i of P[z]) if (w.cards[i].kind === 'tactics' && !w.cards[i].ticket) tac.push(w.cards[i].id);
      for (const L of P.leaders) for (const e of L.equipment) tac.push(w.cards[e].id);
      eq(tac.sort(), def.tactics.slice().sort(), 'tactics of seat ' + p);
    }
  });
  test('AI determinize: same view + same seed = same world; a different seed deals the hidden cards differently', () => {
    const s = randomUntil(10, (x) => inMain(x) && x.turn >= 6);
    const v = XS.view(s, s.active);
    const j = (w) => JSON.stringify(w.players[1 - s.active].hand.map((i) => w.cards[i].id));
    eq(j(AI.determinize(v, 1)), j(AI.determinize(v, 1)));
    ok(j(AI.determinize(v, 1)) !== j(AI.determinize(v, 2)) || j(AI.determinize(v, 1)) !== j(AI.determinize(v, 3)), 'the hidden hand varies with the seed');
  });
  test('AI determinize: refuses a view with a pending decision, and a deck it cannot find', () => {
    const s = randomUntil(3, (x) => x.pending !== null && x.pending.kind === 'pickTactics');
    throws(() => AI.determinize(XS.view(s, s.pending.seat), 1), 'pending');
    const m = randomUntil(3, (x) => inMain(x));
    const v = XS.view(m, m.active);
    v.players[1 - m.active].deckId = null;
    throws(() => AI.determinize(v, 1), 'unknown deck');
  });

  // ---- the evaluator perceives every rule ------------------------------------------------------------------------------------------
  test('AI eval: remaining HP, a down, an awakened leader (each moves the number the right way)', () => {
    const s = base();
    const hurt = fx.arrange(s, (h) => h.damage(1, 0, 50));
    ok(ev(hurt, 0) > ev(s, 0), 'damage to the opponent helps me');
    const nearly = fx.arrange(s, (h, t) => h.damage(1, 0, XS.leaderStats(t, 1, 0).hp - 10));
    const down = fx.arrange(s, (h) => h.down(1, 0));
    ok(ev(down, 0) > ev(nearly, 0), 'a down beats a leader on 10 HP');
    const awake = fx.arrange(s, (h) => h.awaken(0, 0));
    ok(ev(awake, 0) > ev(s, 0), 'an awakened leader of mine helps me');
    const theirAwake = fx.arrange(s, (h) => h.awaken(1, 0));
    ok(ev(theirAwake, 0) < ev(s, 0), 'an awakened leader of theirs hurts me');
    const mineDown = fx.arrange(s, (h) => h.down(0, 0));
    ok(ev(mineDown, 0) < ev(s, 0), 'my own down hurts');
  });
  test('AI eval: round score and match point (one round from winning counts for more)', () => {
    const s = base();
    const w10 = Object.assign({}, s, { wins: [1, 0] }), w00 = s;
    ok(ev(w10, 0) > ev(w00, 0) + 500, 'a round won is worth far more than any position');
    // match point: the same damage on the opponent's leader is worth more when I am one round from the match
    const dmg = (st, wins) => ev(fx.arrange(Object.assign({}, st, { wins }), (h) => h.damage(1, 0, 60)), 0) - ev(Object.assign({}, st, { wins }), 0);
    ok(dmg(s, [1, 0]) > dmg(s, [0, 0]), 'damage at match point is worth more');
    const over = Object.assign({}, s, { phase: 'over', winner: 0 });
    ok(ev(over, 0) > 1e5 && ev(over, 1) < -1e5, 'a won match is decisive');
  });
  test('AI eval: cards in hand count, with diminishing returns', () => {
    const s = base();
    const hand = (n) => fx.arrange(s, (h, t) => { const P = t.players[0]; for (const i of P.hand.slice(n)) h.t.players[0].deck.push(i), P.hand.splice(P.hand.indexOf(i), 1); });
    const v = (n) => ev(hand(n), 0);
    ok(v(3) > v(2) && v(2) > v(1), 'more cards, more value');
    ok(AI.handValue(2, W) - AI.handValue(1, W) > AI.handValue(7, W) - AI.handValue(6, W), 'the 7th card is worth less than the 2nd');
    eq(AI.handValue(9, W), AI.handValue(7, W), 'cards beyond the hand limit are discarded: worth nothing');
  });
  test('AI eval: unspent PP is priced as the cards it draws at end of turn (PM p.06)', () => {
    const s = fx.arrange(base(), (h, t) => { const P = t.players[0]; while (P.hand.length > 2) h.t.players[0].deck.push(P.hand.pop()); });
    const spent = fx.arrange(s, (h) => h.spend(0, 3));
    ok(ev(s, 0, true) > ev(spent, 0, true), 'with bank=true 3 unspent PP are worth more than 0');
    eq(ev(s, 0, false), ev(spent, 0, false), 'without bank (the start of a turn) PP is not counted');
    const full = fx.arrange(base(), (h, t) => { while (t.players[0].hand.length < 7) h.give(0, t.players[0].deck.map((i) => t.cards[i].id)[0]); });
    ok(ev(full, 0, true) === ev(fx.arrange(full, (h) => h.spend(0, 3)), 0, true), 'with a full hand banked PP buys nothing (the hand limit)');
  });
  test('AI eval: tactics deck size is the deck-out clock; an empty one next to a short deck is a lost match', () => {
    const s = base();
    const none = fx.arrange(s, (h) => h.emptyTacticsDeck(0));
    ok(ev(none, 0) < ev(s, 0), 'fewer tactics cards left is worse');
    const short = fx.arrange(s, (h) => h.thinDeck(0, 1));
    ok(ev(short, 0) < ev(s, 0), 'a one-card deck costs a tactics card at the next draw');
    const doomed = fx.arrange(s, (h) => { h.thinDeck(0, 1); h.emptyTacticsDeck(0); });
    ok(ev(doomed, 0) < ev(short, 0) - 1000, 'a reshuffle with no tactics card left loses the match: priced as such');
  });
  test('AI eval: an armed Attack Boost counts while an attack can follow, and is worth less with none in hand', () => {
    let s = fx.arrange(base(), (h) => h.hand(0, ['ST01-014', 'ST01-009', 'ST01-013']));
    const armed = fx.play(s, 'ST01-013');
    const noBoost = fx.arrange(armed, (h, t) => { t.players[0].boosts = []; });
    ok(armed.players[0].boosts.length === 1, 'the boost is armed');
    ok(ev(armed, 0, true) > ev(noBoost, 0, true) + 30, 'a +50 boost with an attack in hand is worth about 40');
    const noAttack = fx.arrange(armed, (h, t) => { const P = t.players[0]; for (const i of P.hand.slice()) if (t.cards[i].kind === 'attack') { P.hand.splice(P.hand.indexOf(i), 1); P.deck.push(i); } });
    ok(ev(armed, 0, true) - ev(noBoost, 0, true) > ev(noAttack, 0, true) - ev(fx.arrange(noAttack, (h, t) => { t.players[0].boosts = []; }), 0, true) + 20, 'with no attack card to follow, the boost is worth little');
  });
  test('AI eval: equipment (Light Shield, HP +30) raises the number', () => {
    const s = fx.arrange(fx.toTurnOf(fx.toTurnOf(fx.start({ decks: ['ST01', 'ST02'], first: 0, pick: ['ST01-023', null] }), 1), 0), () => {});
    const eq2 = fx.play(s, 'ST01-023', { target: 'L00' });
    ok(ev(eq2, 0) > ev(s, 0), 'equipping helps');
  });
  test('AI eval: all-your-leaders-tagged turns Crossfire into a kill card (Demon King\'s Descent likewise); a mixed team loses it', () => {
    const s = base();
    ok(AI.isKillCard(s, 0, 'ST01-005'), 'Crossfire with four VSPO! leaders');
    ok(!AI.isKillCard(s, 0, 'ST01-009'), 'an ordinary attack');
    ok(AI.isKillCard(fx.start({ decks: ['ST02', 'ST01'], first: 0 }), 0, 'ST02-009'), 'Demon King\'s Descent with four CR leaders');
    const was = XS.TAGS['ST01-002'];
    XS.TAGS['ST01-002'] = ['OTHER'];
    try { ok(!AI.isKillCard(s, 0, 'ST01-005'), 'a leader without the tag switches it off'); } finally { XS.TAGS['ST01-002'] = was; }
    const withKill = fx.arrange(s, (h) => h.hand(0, ['ST01-005', 'ST01-009']));
    const without = fx.arrange(s, (h) => h.hand(0, ['ST01-009', 'ST01-009']));
    ok(ev(withKill, 0) > ev(without, 0) + 20, 'holding the kill card is worth more');
  });

  // ---- search: plans are scored against doing nothing ----------------------------------------------------------------------------------
  const decide = (tier, s, seed, extra) => AI.makeBot(opts(tier, s.active, seed === undefined ? 1 : seed, extra)).choose(s);
  test('AI search: with PP and an attack in hand the normal AI spends instead of banking', () => {
    // a full hand: banking PP buys no card (the hand limit), so the PP is spent on the attacks
    const s = fx.arrange(base(), (h) => h.hand(0, ['ST01-009', 'ST01-006', 'ST01-007', 'ST01-011', 'ST01-008', 'ST01-012', 'ST01-010']));
    const a = decide('normal', s);
    eq(a.type, 'play', 'it plays');
    ok(s.cards[a.iid] !== undefined && XS.CARDS[s.cards[a.iid].id].type === 'attack', 'an attack card');
  });
  test('AI search: boost then attack to down a leader that no single card can (a two-card combination)', () => {
    // Opponent leader L10 has 80 left. In the Zone (+80, 2 PP) then Proof of Strength (30 + 80 = 110, 1 PP) downs any leader on <= 110; the attack alone does 30.
    let s = fx.arrange(base(), (h, t) => { h.hand(0, ['ST01-014', 'ST01-009']); const st = XS.leaderStats(t, 1, 0); h.damage(1, 0, st.hp - 80); for (const k of [1, 2, 3]) h.damage(1, k, 0); });
    const first = decide('normal', s);
    eq(s.cards[first.iid].id, 'ST01-014', 'the boost goes first');
    let t = XS.apply(s, first);
    const second = decide('normal', t);
    eq(t.cards[second.iid].id, 'ST01-009', 'then the attack');
    t = XS.apply(t, second);
    while (t.pending !== null) t = XS.apply(t, decide('normal', t));          // Proof of Strength's After Attack asks for a target
    ok(t.players[1].leaders.some((L) => L.down), 'a leader is down (the AI may prefer the fresh 110 HP leader to the one on 80: a bigger kill)');
    ok(t.players[0].leaders.some((L) => L.awakened), 'and the attacker awakened');
  });
  test('AI search: a boost with no attack card behind it is not played (the bank beats a wasted card)', () => {
    const s = fx.arrange(base(), (h) => h.hand(0, ['ST01-014', 'ST01-013']));
    eq(decide('normal', s).type, 'endTurn', 'bank the PP');
  });
  test('AI search: it takes the sure kill (Crossfire) when it is affordable', () => {
    const s = fx.arrange(base(), (h) => h.hand(0, ['ST01-005', 'ST01-006']));
    const a = decide('normal', s);
    eq(s.cards[a.iid].id, 'ST01-005');
  });
  test('AI search: spend versus bank is one comparison: with a full hand and nothing worth casting it passes', () => {
    const s = fx.arrange(base(), (h) => h.hand(0, ['ST01-013', 'ST01-013', 'ST01-013', 'ST01-015', 'ST01-015', 'ST01-018', 'ST01-018']));
    ok(decide('normal', s).type !== undefined);
  });
  test('AI clock: a frozen clock makes a decision reproducible; a ticking clock with a small budget stops the search early but still answers', () => {
    const s = randomUntil(13, (x) => inMain(x) && x.turn >= 6 && XS.legalActions(x).length > 6);
    ok(inMain(s));
    const v = XS.view(s, s.active);
    const full = AI.choose(v, opts('normal', s.active, 3));
    eq(AI.choose(v, opts('normal', s.active, 3)), full, 'same view, same seed, same frozen clock: same decision and bookkeeping');
    let t = 0;
    const ticking = AI.choose(v, { tier: 'normal', seed: 3, now: () => (t += 1), budgetMs: 8 });
    ok(ticking.info.nodes < full.info.nodes, `the deadline cut the search (${ticking.info.nodes} < ${full.info.nodes} nodes)`);
    ok(XS.legalActions(s).some((l) => JSON.stringify(l) === JSON.stringify(ticking.action)), 'a cut search still answers with a legal action');
  });
  test('AI tiers: easy, normal and hard each answer with a legal action in 12 mid-game positions', () => {
    for (const seed of [1, 2, 3, 4]) {
      const s = randomUntil(seed * 31, (x) => inMain(x) && x.turn >= 4 + seed);
      if (!inMain(s)) continue;
      for (const tier of ['easy', 'normal', 'hard']) {
        const a = decide(tier, s, seed, tier === 'hard' ? { tierOpts: { nodes: 150, rolloutNodes: 50, worlds: 2 } } : {});
        XS.apply(s, a);
        ok(XS.legalActions(s).some((l) => JSON.stringify(l) === JSON.stringify(a)), tier + ' seed ' + seed + ' action is in legalActions');
      }
    }
    throws(() => AI.choose(XS.view(fx.start({}), 0), { tier: 'impossible', seed: 1 }), 'unknown tier');
  });
  test('AI play: AI against AI finishes games with zero fallbacks and only legal actions (easy, normal, hard)', () => {
    for (const [ta, tb, seed] of [['normal', 'easy', 1], ['easy', 'normal', 2], ['hard', 'normal', 3]]) {
      let s = XS.newGame({ decks: seed % 2 ? ['ST01', 'ST02'] : ['ST02', 'ST01'], seed, mode: 'quick', first: 'random' });
      const hard = { nodes: 120, rolloutNodes: 40, worlds: 2, cands: 3 };
      const bots = [AI.makeBot(opts(ta, 0, seed, ta === 'hard' ? { tierOpts: hard } : {})), AI.makeBot(opts(tb, 1, seed, tb === 'hard' ? { tierOpts: hard } : {}))];
      let n = 0;
      while (!XS.isTerminal(s) && n++ < 2000) s = XS.apply(s, bots[XS.whoActs(s)].choose(s));   // XS.Illegal would throw here
      ok(XS.isTerminal(s), 'the game ended');
      eq(bots[0].stats.fallbacks + bots[1].stats.fallbacks, 0, 'fallbacks');
    }
  });

  // ---- worker protocol --------------------------------------------------------------------------------------------------------------------
  test('AI worker: the message loop answers decide with partial/result, reports errors as messages, rejects unknown types', () => {
    const s = randomUntil(14, (x) => inMain(x) && x.turn >= 5);
    const out = [];
    let t = 0;
    AI.serve({ type: 'decide', id: 7, view: XS.view(s, s.active), tier: 'normal', seed: 2 }, (m) => out.push(m), () => (t += 50));
    const last = out[out.length - 1];
    eq(last.type, 'result'); eq(last.id, 7);
    ok(XS.legalActions(s).some((l) => JSON.stringify(l) === JSON.stringify(last.action)), 'a legal action');
    ok(out.every((m) => m.id === 7), 'every message carries the request id');
    const bad = [];
    AI.serve({ type: 'decide', id: 8, view: XS.view(s, s.active), tier: 'nonesuch', seed: 2 }, (m) => bad.push(m), () => 0);
    eq(bad[0].type, 'error'); ok(/unknown tier/.test(bad[0].message));
    throws(() => AI.serve({ type: 'ping' }, () => {}, () => 0), 'unknown message');
  });
})();
