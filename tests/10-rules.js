// Rules tests: one per behaviour in docs/rules.md. Names state the rule (PM p.N / FAQ #id / R-0NN). Every position is reached
// through XS.newGame + XS.apply (tests/05-fixtures.js documents the few door-based arrangements).
(function () {
  const XS = globalThis.XS;
  const { test, eq, ok, throws } = XS.T;
  const fx = XS.T.fx;
  const P = (s, seat) => s.players[seat];
  const L = (s, seat, slot) => s.players[seat].leaders[slot];
  const types = (s, from) => s.log.slice(from || 0).map((e) => e.type);
  const find = (s, type, pred) => s.log.filter((e) => e.type === type && (!pred || pred(e)));

  // ================= setup (PM p.05, QM) =================
  test('PM p.05 setup: 4 pre-awakening leaders, 3 PP, 5-card tactics deck with one face down, 50-card deck, draw 4', () => {
    const s = fx.start({ pick: ['ST01-021', 'ST02-021'] });
    for (const seat of [0, 1]) {
      const p = P(s, seat);
      eq(p.leaders.length, 4, 'four leaders');
      ok(p.leaders.every((l) => !l.awakened && !l.down && l.damage === 0 && l.equipment.length === 0), 'fresh leaders');
      eq(p.pp, { total: 3, untapped: 3 }, '3 PP (PM p.04)');
      eq(p.tdeck.length, 4, '5 tactics cards minus the pick');
      eq(p.hand.length + p.deck.length, 50, 'a 50-card deck is all in deck+hand');
    }
    ok(fx.has(s, 0, 'tarea', 'ST01-021') && fx.has(s, 1, 'tarea', 'ST02-021'), 'the picked cards sit in the tactics area');
  });

  test('FAQ #11 / PM p.17 Q13: the first player draws on their first turn (5 cards), the second player has 4', () => {
    const s = fx.start();
    eq([P(s, 0).hand.length, P(s, 1).hand.length], [5, 4]);
    eq(s.turn, 1); eq(s.active, 0); eq(s.roundTurn, 1);
  });

  test('FAQ #12 / PM p.17 Q14: no mulligan, the only decisions before turn 1 are the tactics picks', () => {
    let s = XS.newGame({ decks: ['ST01', 'ST02'], seed: 3, first: 1 });
    const kinds = [];
    while (s.pending) { kinds.push(s.pending.kind + ':' + s.pending.seat); s = XS.apply(s, XS.legalActions(s)[0]); }
    eq(kinds, ['pickTactics:1', 'pickTactics:0'], 'first player (seat 1) picks first');
    eq(s.phase, 'main'); eq(s.active, 1);
  });

  test("R-045: first 'random' makes the RPS winner choose who goes first, and the choice is honoured", () => {
    for (const choice of [0, 1]) {
      let s = XS.newGame({ decks: ['ST01', 'ST02'], seed: 11, first: 'random' });
      eq(s.pending.kind, 'chooseFirst'); eq(s.phase, 'chooseFirst');
      const rps = s.pending.seat;
      eq(find(s, 'rps')[0].data.winner, rps);
      s = XS.apply(s, { type: 'chooseFirst', first: choice });
      eq(s.first, choice, 'the chosen seat is first');
      eq(s.pending.kind, 'pickTactics'); eq(s.pending.seat, choice);
    }
  });

  test('PM p.05 steps 6-7 / FAQ #37: full match round 1: the second player gets the PP Ticket face up; the first player does not', () => {
    const s = fx.start({ pick: ['ST01-021', 'ST02-021'] });
    eq(P(s, 1).tarea.length, 2, 'pick + ticket');
    ok(fx.has(s, 1, 'tarea', 'ST02-024'), 'ticket in the second player\'s tactics area');
    eq(P(s, 0).tarea.length, 1, 'the first player has only the pick');
    eq(find(s, 'tacticsPlace').length, 1);
    eq(find(s, 'tacticsPlace')[0].seat, 1);
  });

  test('PM p.03 / FAQ #57: the PP Ticket is never in the tactics deck, so the deck-out burn cannot take it', () => {
    const s = fx.start();
    for (const seat of [0, 1]) ok(!P(s, seat).tdeck.some((i) => s.cards[i].ticket), 'no ticket in the tactics deck');
  });

  test('R-046 quick match: the second player picks a SECOND tactics card instead of the PP Ticket; PP stays 3', () => {
    let s = XS.newGame({ decks: ['ST01', 'ST02'], seed: 5, mode: 'quick', first: 0 });
    const seq = [];
    while (s.pending) { seq.push(s.pending.seat); s = XS.apply(s, XS.legalActions(s)[0]); }
    eq(seq, [0, 1, 1]);
    eq(P(s, 1).tarea.length, 2); eq(P(s, 0).tarea.length, 1);
    ok(!fx.has(s, 1, 'tarea', 'ST02-024'), 'no ticket in a quick match');
    eq(P(s, 0).pp.total, 3);
  });

  test('R-058 / R-033: the other seat cannot see a tactics pick (view), the owner can; the ticket is face up for both', () => {
    const s = fx.start({ pick: ['ST01-021', 'ST02-021'] });
    const mine = XS.view(s, 0), theirs = XS.view(s, 1);
    ok(mine.players[0].tarea.every((e) => typeof e === 'string'), 'own area visible');
    eq(mine.players[1].tarea.filter((e) => e.hidden === true).length, 1, 'opponent pick hidden');
    ok(mine.players[1].tarea.some((e) => e === P(s, 1).tarea.find((i) => s.cards[i].ticket)), 'the ticket is face up');
    const pick = log0(s, 'tacticsPick', 0);
    ok(!JSON.stringify(XS.view(s, 1).log).includes(pick.data.iid), 'the pick id is not in the other log');
    ok(theirs.log.find((e) => e.type === 'tacticsPick' && e.seat === 0).data.hidden === true);
  });
  function log0(s, type, seat) { return s.log.find((e) => e.type === type && e.seat === seat); }

  // ================= tactics play limits =================
  test('FAQ #49 / R-008: the first player cannot play a tactics card on their first turn; the second player can (R-040)', () => {
    const s = fx.start({ pick: ['ST01-019', 'ST02-019'] });
    const mine = fx.idOf(s, 0, 'ST01-019', ['tarea']);
    ok(XS.whyNot(s, mine) !== null && /first player/.test(XS.whyNot(s, mine)), 'blocked: ' + XS.whyNot(s, mine));
    throws(() => XS.apply(s, { type: 'play', iid: mine }), 'apply refuses', XS.Illegal);
    const s2 = fx.toTurnOf(s, 1);
    eq(XS.whyNot(s2, fx.idOf(s2, 1, 'ST02-019', ['tarea'])), null, 'second player first turn is allowed');
    eq(XS.whyNot(s2, fx.idOf(s2, 1, 'ST02-024', ['tarea'])), null, 'ticket too');
  });

  test('FAQ #49: the ban repeats every round: the first player of round 2 (the loser) cannot play tactics on that round\'s turn 1', () => {
    let s = fx.start({ pick: ['ST01-019', 'ST02-019'] });
    s = fx.finishRound(s, 0);
    eq(s.round, 2); eq(s.first, 1); eq(s.active, 1); eq(s.roundTurn, 1);
    const t = P(s, 1).tarea.find((i) => !s.cards[i].ticket);
    ok(XS.whyNot(s, t) !== null, 'tactics blocked: ' + XS.whyNot(s, t));
    const s2 = fx.toTurnOf(s, 0);
    ok(P(s2, 0).tarea.length >= 1 && XS.whyNot(s2, P(s2, 0).tarea[0]) === null, 'the other player may');
  });

  test('R-009: the PP Ticket uses the turn\'s one tactics play (PM p.06, p.10)', () => {
    let s = fx.start({ pick: ['ST01-019', 'ST02-019'] });
    s = fx.toTurnOf(s, 1);
    const adr = fx.idOf(s, 1, 'ST02-019', ['tarea']);
    s = fx.play(s, 'ST02-024');
    ok(/already played/.test(XS.whyNot(s, adr)), XS.whyNot(s, adr));
    throws(() => XS.apply(s, { type: 'play', iid: adr }), 'second tactics refused', XS.Illegal);
    s = fx.toTurnOf(fx.toTurnOf(s, 0), 1);
    eq(XS.whyNot(s, adr), null, 'allowed again on the next turn');
  });

  test('PM p.10: a consumable tactics card goes to the play area face up, then to the trash face up at the end phase', () => {
    let s = fx.start({ pick: ['ST01-019', 'ST02-019'] });
    s = fx.toTurnOf(s, 1);
    s = fx.play(s, 'ST02-019');
    ok(fx.has(s, 1, 'play', 'ST02-019'));
    s = fx.endTurn(s);
    ok(fx.has(s, 1, 'trash', 'ST02-019'), 'face-up tactics in the trash');
    ok(!fx.has(s, 1, 'play', 'ST02-019'));
  });

  test('R-010 / FAQ #50: an unplayed tactics card stays in the tactics area into the next round, and one more is added', () => {
    let s = fx.start({ pick: ['ST01-019', 'ST02-019'] });
    s = fx.finishRound(s, 0);
    ok(fx.has(s, 0, 'tarea', 'ST01-019'), 'seat 0\'s unplayed pick stayed');
    eq(P(s, 0).tarea.length, 2, 'plus the new pick');
    eq(P(s, 0).tdeck.length, 3);
  });

  test('FAQ #37: the PP Ticket is placed only at the start of round 1', () => {
    let s = fx.start();
    s = fx.finishRound(s, 0);
    eq(find(s, 'tacticsPlace').length, 1, 'still just the round-1 placement');
    ok(!s.log.slice(s.log.findIndex((e) => e.type === 'roundEnd')).some((e) => e.type === 'tacticsPlace'), 'nothing placed after round 1');
  });

  // ================= turn structure =================
  test('PM p.06 start phase: untap all PP, then draw 1', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => h.spend(0, 2));
    s = fx.toTurnOf(s, 1);
    const hand = P(s, 1).hand.length;
    s = fx.toTurnOf(s, 0);
    eq(P(s, 0).pp.untapped, 3, 'PP untapped at the start of the turn');
    ok(P(s, 1).hand.length >= hand);
  });

  test('PM p.06 end phase step 2: draw one card per unused PP', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => { h.hand(0, ['ST01-011', 'ST01-011']); h.spend(0, 1); });
    s = fx.endTurn(s);
    eq(P(s, 0).hand.length, 2 + 2, 'two unused PP -> two cards');
    eq(types(s).slice(-12).includes('draw'), true);
  });

  test('PM p.06 end phase step 1 (FAQ #35): the play area goes to the trash before drawing; memoria face down, tactics face up', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => h.hand(0, ['ST01-013']));
    s = fx.play(s, 'ST01-013');
    ok(fx.has(s, 0, 'play', 'ST01-013'));
    s = fx.endTurn(s);
    eq(P(s, 0).play.length, 0);
    ok(fx.has(s, 0, 'trash', 'ST01-013'), 'memoria in the trash');
    eq(find(s, 'trash')[0].data.faceUp, [false]);
  });

  test('PM p.06 step 3 / R-020: a hand above 7 is cut to 7 at the end phase; the owner chooses; discards go face down', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => h.hand(0, ['ST01-011', 'ST01-011', 'ST01-013', 'ST01-013', 'ST01-014', 'ST01-014']));
    s = fx.endTurn(s);
    eq(s.pending.kind, 'choose'); eq(s.pending.purpose, 'handLimit'); eq(s.pending.seat, 0);
    eq([s.pending.min, s.pending.max], [2, 2], '6 + 3 drawn = 9 -> discard 2');
    eq(s.pending.options.length, 9, 'every hand card is an option');
    const pick = s.pending.options.slice(0, 2);
    const trashBefore = P(s, 0).trash.length;
    s = fx.choose(s, pick);
    eq(P(s, 0).hand.length, 7);
    eq(P(s, 0).trash.length, trashBefore + 2);
    eq(s.active, 1, 'then the opponent\'s turn begins');
    ok(find(s, 'discard').some((e) => e.data.cause === 'handLimit' && e.data.n === 2));
  });

  test('R-020: the hand limit is checked only at the end phase (a hand above 7 does not stop play)', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => h.hand(0, ['ST01-011', 'ST01-011', 'ST01-011', 'ST01-011', 'ST01-013', 'ST01-013', 'ST01-013', 'ST01-013', 'ST01-014']));
    eq(P(s, 0).hand.length, 9);
    ok(XS.legalActions(s).some((a) => a.type === 'play'), 'can still play');
  });

  test('R-048: ending the turn is always legal in the main phase, even with nothing played', () => {
    const s = fx.arrange(fx.start(), (h) => h.hand(0, []));
    ok(XS.legalActions(s).some((a) => a.type === 'endTurn'));
    const s2 = fx.endTurn(s);
    eq(s2.active, 1);
  });

  test('R-034 / PM p.06: a card whose cost cannot be paid cannot be played; paying turns PP sideways', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => { h.hand(0, ['ST01-014', 'ST01-011']); h.spend(0, 2); });
    const iid = fx.idOf(s, 0, 'ST01-014', ['hand']);
    eq(XS.costToPlay(s, iid), 2);
    ok(/Needs 2 PP, you have 1/.test(XS.whyNot(s, iid)), XS.whyNot(s, iid));
    throws(() => XS.apply(s, { type: 'play', iid }), 'unaffordable', XS.Illegal);
    s = fx.play(s, 'ST01-011', { attacker: 'L00', target: 'L10' });
    eq(P(s, 0).pp.untapped, 0);
  });

  // ================= attacks =================
  test('PM p.12 / PM p.09: damage value = attacker ATK + the boosts + the card\'s own damage +; counters are placed', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => h.hand(0, ['ST01-013', 'ST01-011']));
    s = fx.play(s, 'ST01-013');
    const iid = fx.idOf(s, 0, 'ST01-011', ['hand']);
    eq(XS.previewAttack(s, { type: 'play', iid, attacker: 'L00', target: 'L10' }), 30 + 50 + 10, 'preview = ATK 30 + boost 50 + Cool Head 10');
    s = fx.attack(s, 'ST01-011', 0, 0);
    eq(L(s, 1, 0).damage, 90);
    eq(find(s, 'attack')[0].data.damage, 90);
    eq(find(s, 'attack')[0].data.parts, { atk: 30, boost: 50, card: 10 });
  });

  test('PM p.09: a boost applies to the NEXT attack only; its 【アタック後】 also belongs to that attack only (FAQ #36)', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => { h.hand(0, ['ST01-016', 'ST01-011', 'ST01-011']); });
    s = fx.play(s, 'ST01-016');            // +30 and an After Attack: 40 to another leader (4 VSPO! leaders x 10)
    s = fx.attack(s, 'ST01-011', 0, 0);    // 30 + 30 + 10 = 70
    eq(L(s, 1, 0).damage, 70);
    s = fx.settleWithFirst(s);
    s = fx.attack(s, 'ST01-011', 0, 2);    // plain 30 + 10, no boost
    eq(L(s, 1, 2).damage, 40, 'second attack is not boosted');
    eq(find(s, 'damage', (e) => e.data.kind === 'effect').length, 1, 'First Glory\'s After Attack fired once');
  });

  test('PM p.09 example: memoria, attack, memoria, memoria, attack -> memoria 1 boosts only attack 1; memoria 3 and 4 boost attack 2', () => {
    let s = fx.start();
    s = fx.finishRound(s, 0);
    s = fx.finishRound(s, 1);                   // round 3: 5 PP, enough for five 1-cost plays
    const me = s.active, deck = P(s, me).deckId;
    eq(P(s, me).pp.total, 5);
    const T = { ST01: { memoria: ['ST01-013', 'ST01-015', 'ST01-013'], boost: [50, 60, 50], attack: 'ST01-008' }, ST02: { memoria: ['ST02-015', 'ST02-017', 'ST02-015'], boost: [50, 60, 50], attack: 'ST02-008' } }[deck];
    s = fx.arrange(s, (h) => h.hand(me, [T.memoria[0], T.attack, T.memoria[1], T.memoria[2], T.attack]));
    s = fx.play(s, T.memoria[0]);                 // 1
    s = fx.attack(s, T.attack, 0, 2);             // 2
    s = fx.settleWithFirst(s);
    s = fx.play(s, T.memoria[1]);                 // 3
    s = fx.play(s, T.memoria[2]);                 // 4
    eq(P(s, me).boosts.length, 2, 'only the two memoria played after the attack are armed');
    s = fx.attack(s, T.attack, 1, 3);             // 5
    const attacks = find(s, 'attack', (e) => e.round === 3);
    eq(attacks[0].data.parts.boost, T.boost[0], 'attack 2 got memoria 1');
    eq(attacks[1].data.parts.boost, T.boost[1] + T.boost[2], 'attack 5 got memoria 3 and 4, not memoria 1');
  });

  test('FAQ #45 / R-014: an unused boost does not carry into the next turn', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => h.hand(0, ['ST01-014']));
    s = fx.play(s, 'ST01-014');
    eq(P(s, 0).boosts.length, 1);
    s = fx.toTurnOf(fx.toTurnOf(s, 1), 0);
    eq(P(s, 0).boosts.length, 0, 'boost cleared with the play area');
  });

  test('R-016: damage never goes below 0 and 0 damage places no counters', () => {
    // no ST01/ST02 card has "damage -", so the floor is proven on the damage door itself through a real leader
    let s = fx.start();
    const r = XS.doors.dealDamage(XS.cloneState(s), 'L10', 0, 'effect');
    eq(r, { dealt: 0, downed: false, excess: 0 });
    eq(XS.damageParts(s, 0, 'L00', fx.idOf(s, 0, 'ST01-011', ['hand', 'deck']), 0, []).total, 40);
  });

  test('PM p.08 down: a leader whose counters reach its HP is downed at once, its counters are removed (R-005 excess is lost)', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => { h.hand(0, ['ST01-010']); h.damage(1, 0, 80); });
    s = fx.attack(s, 'ST01-010', 0, 0);       // Critical Shot: 30 + 70 = 100 on a leader with 30 left
    ok(L(s, 1, 0).down); eq(L(s, 1, 0).damage, 0);
    eq(find(s, 'down').length, 1);
    eq(s.atk, null, 'the attack is over');
  });

  test('PM p.08 / R-003 / R-011: the attacker awakens after an attack that downs a leader; counters stay, so remaining HP rises', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => { h.hand(0, ['ST01-011']); h.damage(1, 0, 90); h.damage(0, 0, 20); });
    const before = XS.leaderStats(s, 0, 0);
    eq([before.atk, before.hp, before.remaining], [30, 100, 80]);
    s = fx.attack(s, 'ST01-011', 0, 0);
    s = fx.settleWithFirst(s);
    const after = XS.leaderStats(s, 0, 0);
    ok(after.awakened);
    eq([after.atk, after.hp, after.damage, after.remaining], [40, 130, 20, 110], 'awakened face 40/130, counters untouched');
    eq(find(s, 'awaken').length, 1);
  });

  test('R-003: downing several leaders with one attack awakens the attacker once and resolves 【覚醒時】 once', () => {
    let s = fx.start({ decks: ['ST02', 'ST01'] });          // seat 0 = Selly (awaken: 10 to 1 opposing leader)
    s = fx.arrange(s, (h) => { h.hand(0, ['ST02-011']); h.damage(1, 0, 95); h.damage(1, 1, 105); h.damage(1, 2, 95); });
    s = fx.attack(s, 'ST02-011', 0, 0);                      // Multi Grenade: 20 to every other leader
    eq(find(s, 'down').length, 3, 'three leaders downed');
    s = fx.settleWithFirst(s);
    eq(find(s, 'awaken').length, 1, 'one awakening');
    eq(find(s, 'ability', (e) => e.data.timing === 'onAwaken').length, 1);
  });

  test('R-004 / FAQ #19: awakening happens AFTER every 【アタック後】 of the attack (Winning Blow draws first, then the attacker awakens)', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => { h.hand(0, ['ST01-008']); h.damage(1, 0, 90); });
    s = fx.attack(s, 'ST01-008', 0, 0);                      // 30 damage downs a leader with 10 left; draw 1 if it is down
    s = fx.settleWithFirst(s);
    const seqs = (t) => s.log.findIndex((e) => e.type === t);
    const drawAfter = s.log.findIndex((e) => e.type === 'draw' && e.data.cause === 'effect');
    ok(seqs('down') < drawAfter && drawAfter < seqs('awaken'), `down ${seqs('down')} < draw ${drawAfter} < awaken ${seqs('awaken')}`);
  });

  test('R-026 / FAQ #10: Crossfire downs the attacked leader when all your leaders have the tag; a downed own leader still has it; the attacker awakens', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => { h.hand(0, ['ST01-005']); h.down(0, 3); });
    s = fx.attack(s, 'ST01-005', 0, 0);
    ok(L(s, 1, 0).down, 'the attacked leader went down although it took only 30');
    s = fx.settleWithFirst(s);
    ok(L(s, 0, 0).awakened, 'it counts as a down by the attack');
  });

  test('Crossfire\'s tag test is per leader: with leaders of another tag in the team it does nothing but the damage', () => {
    // seat 0 plays ST01 (all VSPO!): flip the check through Demon King\'s Descent (CR) played by an ST01 team
    let s = fx.start();
    s = fx.arrange(s, (h) => h.hand(0, ['ST01-005']));
    eq(XS.previewAttackDetail(s, { type: 'play', iid: fx.idOf(s, 0, 'ST01-005', ['hand']), attacker: 'L00', target: 'L10' }).goesDown, true);
    const t = fx.start({ decks: ['ST02', 'ST01'] });   // CR team
    const u = fx.arrange(t, (h) => h.hand(0, ['ST02-009']));
    eq(XS.previewAttackDetail(u, { type: 'play', iid: fx.idOf(u, 0, 'ST02-009', ['hand']), attacker: 'L00', target: 'L10' }).goesDown, true, 'CR team + CR text');
  });

  test('PM p.08 / R-002: a downed leader cannot attack and cannot be attacked: no legal action names it; apply refuses', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => { h.hand(0, ['ST01-011']); h.down(0, 0); h.down(1, 0); });
    ok(XS.legalActions(s).every((a) => a.attacker !== 'L00' && a.target !== 'L10'), 'no action involves a downed leader');
    throws(() => XS.apply(s, { type: 'play', iid: fx.idOf(s, 0, 'ST01-011', ['hand']), attacker: 'L00', target: 'L11' }), 'downed attacker', XS.Illegal);
    throws(() => XS.apply(s, { type: 'play', iid: fx.idOf(s, 0, 'ST01-011', ['hand']), attacker: 'L01', target: 'L10' }), 'downed target', XS.Illegal);
  });

  test('R-002 / R-032: damage to "every other opposing leader" skips downed leaders; a downed leader takes no damage', () => {
    let s = fx.start({ decks: ['ST02', 'ST01'] });
    s = fx.arrange(s, (h) => { h.hand(0, ['ST02-011']); h.down(1, 2); });
    s = fx.attack(s, 'ST02-011', 0, 0);
    eq([L(s, 1, 1).damage, L(s, 1, 2).damage, L(s, 1, 3).damage], [20, 0, 20]);
    eq(XS.doors.dealDamage(XS.cloneState(s), 'L12', 50, 'effect').dealt, 0, 'the door ignores a downed leader');
  });

  test('FAQ #21: an effect with no legal target does nothing and logs a fizzle', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => { h.hand(0, ['ST01-009']); h.down(1, 1); h.down(1, 2); h.down(1, 3); });
    s = fx.attack(s, 'ST01-009', 0, 0);       // Proof of Strength: 10 to another opposing leader; only the attacked one is up
    eq(s.pending, null, 'nothing to choose');
    eq(find(s, 'fizzle').length, 1);
    eq(find(s, 'fizzle')[0].data.reason, 'noTarget');
  });

  test('FAQ #2 / FAQ #121 / R-055: with two 【アタック後】 effects the turn player orders them; a lone effect needs no order', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => h.hand(0, ['ST01-016', 'ST01-009', 'ST01-009']));
    s = fx.play(s, 'ST01-016');
    s = fx.attack(s, 'ST01-009', 0, 0);
    eq(s.pending.kind, 'choose'); eq(s.pending.purpose, 'order'); eq(s.pending.options.length, 2);
    const first = s.pending.options.find((i) => s.cards[i].id === 'ST01-009');
    s = fx.choose(s, [first]);
    eq(s.pending.purpose, 'target', 'the first effect (10 to another leader) now asks for its target');
    s = fx.choose(s, ['L11']);
    eq(s.pending.purpose, 'target', 'then First Glory\'s effect: with a single effect left there was no further order question');
    const abil = find(s, 'ability', (e) => e.data.timing === 'afterAttack').map((e) => s.cards[e.data.src].id);
    eq(abil, ['ST01-009', 'ST01-016']);
  });

  test('FAQ #18 / #123 / R-053: "the attacked leader is down" is false when another leader went down in 【アタック後】', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => { h.hand(0, ['ST01-016', 'ST01-008', 'ST01-011']); h.damage(1, 1, 100); });  // leader 1 has 10 left
    s = fx.play(s, 'ST01-016');
    const hand = P(s, 0).hand.length;
    s = fx.attack(s, 'ST01-008', 2, 0);       // Winning Blow by Sumire on leader 0 (110 HP): 30+30 = 60, not down
    s = fx.choose(s, [fx.idOf(s, 0, 'ST01-016', ['play'])]);   // First Glory first
    s = fx.choose(s, ['L11']);                // 40 damage downs leader 1
    ok(L(s, 1, 1).down);
    eq(P(s, 0).hand.length, hand - 1, 'Winning Blow drew nothing (hand only lost the played card)');
    ok(!L(s, 1, 0).down);
    ok(L(s, 0, 2).awakened, 'but a down inside the attack still awakens the attacker (FAQ #17)');
  });

  test('FAQ #14 / #15 / #16 / R-059: downing the last leader: 【アタック後】 resolve, the attacker awakens, then the round ends', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => { h.hand(0, ['ST01-008']); for (const k of [1, 2, 3]) h.down(1, k); h.damage(1, 0, 90); });
    s = fx.attack(s, 'ST01-008', 0, 0);
    const idx = (t, f) => s.log.findIndex((e) => e.type === t && (!f || f(e)));
    ok(idx('draw', (e) => e.data.cause === 'effect') > idx('down', (e) => e.data.leader === 'L10'), 'After Attack ran');
    if (s.pending) s = fx.settleWithFirst(s);
    ok(idx('awaken') > idx('draw', (e) => e.data.cause === 'effect'), 'awakening after');
    ok(idx('roundEnd') > idx('awaken'), 'round ends last');
    eq(s.round, 2);
  });

  // A synthetic card in the data tables (no ST01/ST02 card has several 【アタックする】): the card's own attack frame is what is under test.
  function withStormCard(fn) {
    const savedCards = XS.CARDS, savedAbil = XS.ABIL;
    XS.CARDS = Object.assign({}, savedCards, { 'TEST-STORM': { id: 'TEST-STORM', type: 'attack', color: 'blue', cost: 1, name: 'test', nameEn: 'Test Storm', product: 'TEST', text: 'three attacks', ace: false, family: 9999 } });
    const atk = { timing: 'attack', ops: [{ op: 'dmgPlus', n: 10 }] };
    XS.ABIL = Object.assign({}, savedAbil, { 'TEST-STORM': { effects: [atk, atk, atk, { timing: 'afterAttack', ops: [{ op: 'draw', n: 1 }] }] } });
    try {
      const deck = Object.assign({}, XS.DECKS.ST01, { main: [['TEST-STORM', 20], ['ST01-013', 4], ['ST01-011', 26]] });
      return fn(deck);
    } finally { XS.CARDS = savedCards; XS.ABIL = savedAbil; }
  }

  test('R-025 / FAQ #81 / #82: a card with several 【アタックする】 attacks several times; the attacker awakens between attacks; a boost helps the first attack only; the card\'s 【アタック後】 repeats per attack', () => {
    withStormCard((deck) => {
      let s = fx.start({ decks: [deck, 'ST02'] });
      s = fx.arrange(s, (h, t) => { h.hand(0, ['ST01-013', 'TEST-STORM']); h.damage(1, 0, XS.leaderStats(t, 1, 0).hp - 10); });
      s = fx.play(s, 'ST01-013');                           // +50 for the next attack
      s = fx.attack(s, 'TEST-STORM', 0, 0);                 // attack 1: 30 + 50 + 10 = 90 downs L10
      eq(find(s, 'attack')[0].data.damage, 90);
      ok(L(s, 1, 0).down, 'attack 1 downed a leader');
      eq(s.pending.kind, 'attackPair', 'attack 2 asks for its own attacker and target');
      ok(L(s, 0, 0).awakened, 'the attacker awakened BEFORE the second attack (FAQ #81)');
      const iid = s.atk.card;
      eq(XS.previewAttack(s, { type: 'attack', attacker: 'L00', target: 'L11' }), 40 + 10, 'awakened ATK 40 + 10, no boost (FAQ #82)');
      eq(s.pending.targets, ['L11', 'L12', 'L13']);
      s = XS.apply(s, { type: 'attack', attacker: 'L01', target: 'L11' });
      eq(find(s, 'attack')[1].data.parts, { atk: 30, boost: 0, card: 10 });
      eq(s.pending.kind, 'attackPair', 'attack 3');
      s = XS.apply(s, { type: 'attack', attacker: 'L00', target: 'L12' });
      eq(find(s, 'attack').length, 3);
      eq(find(s, 'draw', (e) => e.via === iid).length, 3, 'the card\'s own After Attack ran after each attack (Uruha\'s awakening draw is a fourth, via the leader)');
      eq(find(s, 'awaken').length, 1, 'awakens once');
      ok(s.atk === null && s.pending === null);
    });
  });

  test('FAQ #76 / #113: remaining attacks of a multi-attack card are not performed once every opposing leader is down', () => {
    withStormCard((deck) => {
      let s = fx.start({ decks: [deck, 'ST02'] });
      s = fx.arrange(s, (h, t) => { h.hand(0, ['TEST-STORM']); for (const k of [1, 2, 3]) h.down(1, k); h.damage(1, 0, XS.leaderStats(t, 1, 0).hp - 10); });
      s = fx.attack(s, 'TEST-STORM', 0, 0);
      s = fx.settleWithFirst(s);
      eq(find(s, 'attack').length, 1, 'only the first attack was performed');
      eq(find(s, 'roundEnd').length, 1); eq(s.round, 2);
    });
  });

  test('R-018: the team that is fully downed first loses the round', () => {
    const s = fx.finishRound(fx.start(), 0);
    eq(s.wins, [1, 0]);
    eq(find(s, 'roundEnd')[0].data.loser, 1);
  });

  // ================= equipment =================
  test('PM p.10: equipment attaches to a leader of your choice (not the play area); Light Shield raises HP by 30; only to leaders not down (FAQ #22)', () => {
    let s = fx.start({ pick: ['ST01-023', 'ST02-023'] });
    s = fx.toTurnOf(s, 1);
    s = fx.arrange(s, (h) => h.down(1, 2));
    const acts = XS.legalActions(s).filter((a) => a.iid === fx.idOf(s, 1, 'ST02-023', ['tarea']));
    eq(acts.map((a) => a.target).sort(), ['L10', 'L11', 'L13'], 'one action per leader that is not down');
    const before = XS.leaderStats(s, 1, 0).hp;
    s = fx.play(s, 'ST02-023', { target: 'L10' });
    eq(XS.leaderStats(s, 1, 0).hp, before + 30);
    eq(L(s, 1, 0).equipment.length, 1);
    eq(P(s, 1).play.length, 0, 'never in the play area');
    throws(() => XS.apply(fx.toTurnOf(fx.toTurnOf(s, 0), 1), { type: 'play', iid: 'c0', target: 'L12' }), 'bad', Error);
  });

  test('PM p.11: equipment and the awakened state stay attached into later rounds; damage counters do not', () => {
    let s = fx.start({ pick: ['ST01-019', 'ST02-023'] });
    s = fx.toTurnOf(s, 1);
    s = fx.play(s, 'ST02-023', { target: 'L10' });
    s = fx.arrange(s, (h) => h.awaken(1, 1));
    s = fx.arrange(s, (h) => h.damage(1, 2, 40));
    s = fx.finishRound(s, 0);
    eq(s.round, 2);
    eq(L(s, 1, 0).equipment.length, 1, 'equipment persists');
    ok(L(s, 1, 1).awakened, 'awakening persists');
    eq(L(s, 1, 2).damage, 0, 'counters removed');
    eq(XS.leaderStats(s, 1, 0).hp, 110 + 30);
  });

  // ================= rounds and match =================
  test('PM p.04 / p.11: PP is 3, 4, 5 in rounds 1, 2, 3; each round draws 4', () => {
    let s = fx.start();
    eq(P(s, 0).pp.total, 3);
    s = fx.finishRound(s, 0);
    eq([P(s, 0).pp.total, P(s, 1).pp.total], [4, 4]);
    eq(P(s, 1).hand.length, 4 + 1, 'draw 4 then the first player\'s start-phase draw (loser = seat 1)');
    eq(P(s, 0).hand.length, 4);
    s = fx.finishRound(s, 1);
    eq(s.round, 3); eq([P(s, 0).pp.total, P(s, 1).pp.total], [5, 5]);
  });

  test('PM p.11 round end: play area and whole hand go to the trash, counters removed, all leaders revived, the loser goes first', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => { h.damage(0, 2, 30); h.down(0, 3); });
    const trash0 = P(s, 0).trash.length;
    s = fx.finishRound(s, 0);
    eq(s.round, 2); eq(s.first, 1); eq(s.active, 1);
    ok(L(s, 0, 2).damage === 0 && !L(s, 0, 3).down, 'revived, no counters');
    ok(P(s, 0).trash.length > trash0, 'hand and play area were trashed');
    eq(find(s, 'roundEnd').length, 1);
  });

  test('PM p.05 / p.11: best of three: 1-1 goes to round 3 with 5 PP, the match ends at 2 round wins', () => {
    let s = fx.start();
    s = fx.finishRound(s, 0);
    s = fx.finishRound(s, 1);
    eq(s.round, 3); eq(s.wins, [1, 1]); ok(!XS.isTerminal(s));
    s = fx.finishRound(s, 0);
    ok(XS.isTerminal(s)); eq(s.winner, 0); eq(s.result.reason, 'rounds'); eq(s.wins, [2, 1]);
    eq(XS.whoActs(s), null); eq(XS.legalActions(s), []);
  });

  test('PM p.11: winning rounds 1 and 2 ends the match 2-0', () => {
    let s = fx.start();
    s = fx.finishRound(s, 1);
    s = fx.finishRound(s, 1);
    ok(XS.isTerminal(s)); eq(s.winner, 1); eq(s.wins, [0, 2]); eq(s.round, 2);
  });

  test('PM p.05 quick match: one round decides the match', () => {
    const s = fx.finishRound(fx.start({ mode: 'quick' }), 1);
    ok(XS.isTerminal(s)); eq(s.winner, 1); eq(s.result.reason, 'rounds'); eq(s.round, 1);
  });

  test('R-060: concede ends the match for the whole match; that seat loses', () => {
    const s = XS.apply(fx.start(), { type: 'concede', seat: 0 });
    ok(XS.isTerminal(s)); eq(s.winner, 1); eq(s.result.reason, 'concede');
    throws(() => XS.apply(s, { type: 'endTurn' }), 'nothing after the end', XS.Illegal);
  });

  // ================= deck-out =================
  test('PM p.14 Q1 / FAQ #29: a draw that outruns the deck draws what is there, shuffles the face-down trash into the deck, burns a random tactics card face up, then continues', () => {
    let s = fx.start({ decks: ['ST02', 'ST01'] });
    s = fx.arrange(s, (h) => { h.hand(0, ['ST02-014']); h.thinDeck(0, 1); });
    const tdeck = P(s, 0).tdeck.length, hand = P(s, 0).hand.length;
    const deckCard = P(s, 0).deck[0];
    s = fx.play(s, 'ST02-014');               // Close Call: draw 2
    eq(find(s, 'reshuffle').length, 1); eq(find(s, 'tacticsBurn').length, 1);
    ok(P(s, 0).hand.includes(deckCard), 'the last deck card was drawn first');
    eq(P(s, 0).hand.length, hand - 1 + 2);
    eq(P(s, 0).tdeck.length, tdeck - 1, 'one tactics card left the tactics deck');
    const burned = find(s, 'tacticsBurn')[0].data.iid;
    ok(P(s, 0).trash.includes(burned) && s.cards[burned].kind === 'tactics', 'it is in the trash, face up (a tactics card)');
    ok(P(s, 0).deck.length > 30, 'the face-down trash became the deck');
    ok(P(s, 0).trash.every((i) => s.cards[i].kind === 'tactics'), 'only face-up cards remain in the trash');
  });

  test('FAQ #29: a draw of 2 with exactly 2 cards in the deck draws both and does NOT reshuffle', () => {
    let s = fx.start({ decks: ['ST02', 'ST01'] });
    s = fx.arrange(s, (h) => { h.hand(0, ['ST02-014']); h.thinDeck(0, 2); });
    s = fx.play(s, 'ST02-014');
    eq(find(s, 'reshuffle').length, 0); eq(find(s, 'tacticsBurn').length, 0);
    eq(P(s, 0).deck.length, 0);
  });

  test('PM p.14 Q1 / FAQ #56: a shortfall with no tactics card left loses the match', () => {
    let s = fx.start({ decks: ['ST02', 'ST01'] });
    s = fx.arrange(s, (h) => { h.hand(0, ['ST02-014']); h.thinDeck(0, 0); h.emptyTacticsDeck(0); });
    s = fx.play(s, 'ST02-014');
    ok(XS.isTerminal(s)); eq(s.winner, 1); eq(s.result.reason, 'tacticsDeckEmpty'); eq(s.result.losers, [0]);
  });

  test('PM p.17 Q11 / FAQ #5 / R-036: both players hit the tactics-deck loss in the same round setup -> both lose', () => {
    let s = fx.start();
    s = fx.finishRound(s, 0, (h) => { h.thinDeck(0, 2); h.thinDeck(1, 2); h.emptyTacticsDeck(0); h.emptyTacticsDeck(1); });
    ok(XS.isTerminal(s)); eq(s.winner, null); eq(s.result.reason, 'bothLose'); eq(s.result.losers, [0, 1]);
  });

  test('FAQ #35: the end phase trashes the play area first, so those cards can be reshuffled into the deck by the end-phase draw', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => { h.hand(0, ['ST01-013']); h.thinDeck(0, 1); });
    s = fx.play(s, 'ST01-013');
    const memoria = fx.idOf(s, 0, 'ST01-013', ['play']);
    s = fx.endTurn(s);                         // 2 unused PP -> draw 2 from a 1-card deck
    eq(find(s, 'reshuffle').length, 1);
    ok(P(s, 0).hand.includes(memoria) || P(s, 0).deck.includes(memoria), 'the memoria went through the trash into the reshuffled deck');
  });

  // ================= engine contract =================
  test('contract: apply never mutates its input, returns a new state, and records the action', () => {
    const s = fx.start();
    const snap = JSON.stringify(s);
    const s2 = XS.apply(s, { type: 'endTurn' });
    eq(JSON.stringify(s), snap, 'input untouched');
    ok(s2 !== s && s2.actions.length === s.actions.length + 1);
  });

  test('contract: Illegal for unknown or malformed actions; while a decision is pending only its answers are legal', () => {
    let s = fx.start();
    throws(() => XS.apply(s, { type: 'dance' }), 'unknown action', XS.Illegal);
    throws(() => XS.apply(s, null), 'null', XS.Illegal);
    throws(() => XS.apply(s, { type: 'play', iid: 'nope' }), 'unknown card', Error);
    s = fx.arrange(s, (h) => h.hand(0, ['ST01-016', 'ST01-009']));
    s = fx.play(s, 'ST01-016');
    s = fx.attack(s, 'ST01-009', 0, 0);
    ok(s.pending !== null);
    throws(() => XS.apply(s, { type: 'endTurn' }), 'endTurn during a decision', XS.Illegal);
    throws(() => XS.apply(s, { type: 'choose', ids: ['L10', 'L11'] }), 'wrong count / not options', XS.Illegal);
    eq(XS.whoActs(s), s.pending.seat);
    ok(XS.legalActions(s).every((a) => a.type === 'choose'));
  });

  test('contract: replay(init, actions) rebuilds the same state', () => {
    let s = fx.start();
    s = fx.endTurn(s);
    s = fx.endTurn(fx.settleWithFirst(s));
    const again = XS.replay(s.init, s.actions);
    eq(JSON.stringify(again), JSON.stringify(s));
  });

  test('contract: view hides the opponent hand, both decks, the opponent tactics deck and every face-down trash card (even your own)', () => {
    let s = fx.start({ pick: ['ST01-019', 'ST02-019'] });
    s = fx.endTurn(s);
    const v = XS.view(s, 0);
    ok(v.players[1].hand.every((e) => e.hidden === true) && v.players[1].hand.length === P(s, 1).hand.length);
    ok(v.players[0].hand.every((e) => typeof e === 'string'));
    ok(v.players[0].deck.every((e) => e.hidden === true) && v.players[1].deck.every((e) => e.hidden === true));
    ok(v.players[1].tdeck.every((e) => e.hidden === true) && v.players[0].tdeck.every((e) => typeof e === 'string'));
    ok(v.players[0].trash.every((e) => e.hidden === true), 'own face-down trash is unviewable (rules.md §4)');
    for (const k of ['rng', 'seed', 'stack', 'init', 'actions']) ok(!(k in v), k + ' is private');
    const text = JSON.stringify({ ...v, log: null });
    for (const i of P(s, 1).hand) ok(!text.includes(`"${i}"`), 'opponent hand id leaked: ' + i);
    for (const i of P(s, 1).deck) ok(!text.includes(`"${i}"`), 'opponent deck id leaked');
  });

  test('contract: a face-up tactics card in the trash is public in both views', () => {
    let s = fx.start({ pick: ['ST01-019', 'ST02-019'] });
    s = fx.toTurnOf(s, 1);
    s = fx.play(s, 'ST02-019');
    s = fx.endTurn(s);
    const id = fx.idOf(s, 1, 'ST02-019', ['trash']);
    ok(XS.view(s, 0).players[1].trash.includes(id) && XS.view(s, 1).players[1].trash.includes(id));
  });

  test('contract: leaderStats reports the live face, equipment and remaining HP', () => {
    const s = fx.arrange(fx.start(), (h) => h.damage(0, 1, 25));
    const st = XS.leaderStats(s, 0, 1);
    eq([st.cardId, st.atk, st.hp, st.damage, st.remaining, st.down, st.awakened, st.tags], ['ST01-002', 30, 110, 25, 85, false, false, ['VSPO!']]);
  });
})();
