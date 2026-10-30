// One behaviour test per BP03 card number used by a registered deck (data/abilities-bp03.js). Same rules as
// tests/20-cards.js: a real game state, the card played through XS.apply, the side effect asserted, and a
// single-candidate case for every targeted effect (CLAUDE.md rule 4). Positions: tests/05-fixtures.js.
(function () {
  const XS = globalThis.XS;
  const { test, eq, ok, throws } = XS.T;
  const fx = XS.T.fx;
  const P = (s, seat) => s.players[seat];
  const L = (s, seat, slot) => s.players[seat].leaders[slot];
  const find = (s, type, pred) => s.log.filter((e) => e.type === type && (!pred || pred(e)));
  const effDraws = (s) => find(s, 'draw', (e) => e.data.cause === 'effect').length;
  const PLAIN = 'ST01-011';   // Cool Head: cost 1, [Attack] damage +10, nothing else (ST01 attacker ATK 30 -> 40)
  const BOOST_MEM = 'ST01-013';   // Gambit Master: cost 1, boost +50, nothing else

  // Seat 0 plays ST01 extended with `main` ([no, qty]) and `tacs` (tactics replacing the first slots); seat 1 plays ST02.
  const game = (main, tacs, o) => fx.start(Object.assign({ decks: [fx.deckWith('ST01', main, tacs), 'ST02'], pick: [tacs && tacs[0] ? tacs[0] : null, null] }, o));
  // Tactics are played by seat 1 on its first turn (the first player cannot play one on turn 1, FAQ #49): seat 1 plays ST02 with `no` picked.
  function tactical(no, prep, seat0Deck) {
    let s = fx.start({ decks: [seat0Deck || 'ST01', fx.deckWith('ST02', [], [no])], pick: [null, no] });
    s = fx.toTurnOf(s, 1);
    if (prep) s = fx.arrange(s, prep);
    return s;
  }
  // A leader's 【覚醒時】: team ST01 with `no` in `slot`; the attacked leader L10 has 10 HP left so the attack downs it and the attacker awakens.
  function awakening(no, slot, prep) {
    const leaders = XS.DECKS.ST01.leaders.slice();
    leaders[slot] = no;
    let s = fx.start({ decks: [Object.assign({}, XS.DECKS.ST01, { leaders }), 'ST02'] });
    s = fx.arrange(s, (h, t) => { h.hand(0, [PLAIN]); h.damage(1, 0, XS.leaderStats(t, 1, 0).hp - 10); if (prep) prep(h, t); });
    return fx.attack(s, PLAIN, slot, 0);
  }
  // The attack card `no` against L10 with `left` HP remaining (attacker L00, ATK 30).
  function strike(no, left, prep, o) {
    let s = game([[no, 4]], [], o);
    s = fx.arrange(s, (h, t) => { h.hand(0, [no]); if (left !== null) h.damage(1, 0, XS.leaderStats(t, 1, 0).hp - left); if (prep) prep(h, t); });
    return fx.attack(s, no, 0, 0);
  }
  // draws made by the effect of the card played last (a leader's own 【覚醒時】 draw is not counted)
  const cardDraws = (s) => { const iid = find(s, 'play').slice(-1)[0].data.iid; return find(s, 'draw', (e) => e.data.cause === 'effect' && e.via === iid).length; };
  const lastAttack = (s) => find(s, 'attack').slice(-1)[0].data;

  // ============================== leaders: 【覚醒時】 ==============================
  test('BP03-003 Yui Hizuki [On Awaken] draw 2 cards, THEN discard 2 cards from your hand (asked; the drawn cards are among the choices)', () => {
    let s = awakening('BP03-003', 0, (h) => { h.hand(0, [PLAIN, 'ST01-013', 'ST01-015']); h.top(0, ['ST01-014', 'ST01-016']); });
    ok(L(s, 0, 0).awakened, 'awakened');
    eq(effDraws(s), 2, 'drew 2');
    eq(s.pending.purpose, 'discard'); eq([s.pending.min, s.pending.max], [2, 2]); eq(s.pending.seat, 0);
    eq(s.pending.options.length, 4, 'the 2 cards left in hand plus the 2 drawn');
    ok(s.pending.options.includes(fx.idOf(s, 0, 'ST01-014', ['hand'])), 'a drawn card can be discarded: the draw came first');
    const trash = P(s, 0).trash.length;
    s = fx.choose(s, [fx.idOf(s, 0, 'ST01-013', ['hand']), fx.idOf(s, 0, 'ST01-014', ['hand'])]);
    eq(P(s, 0).hand.length, 2); eq(P(s, 0).trash.length, trash + 2);
    ok(fx.has(s, 0, 'trash', 'ST01-013') && fx.has(s, 0, 'trash', 'ST01-014'), 'the chosen cards are in the trash');
    eq(find(s, 'discard').filter((e) => e.data.cause === 'effect').length >= 1, true);
    // a hand that is exactly 2 after the draw: still asked, never auto-discarded (rule 4)
    let t = awakening('BP03-003', 0, (h) => h.hand(0, [PLAIN]));
    eq(P(t, 0).hand.length, 2, 'only the 2 drawn cards');
    eq(t.pending.purpose, 'discard'); eq(t.pending.options.length, 2);
    t = fx.choose(t, t.pending.options.slice());
    eq(P(t, 0).hand.length, 0);
  });

  test('BP03-004 rion [On Awaken] 10 damage to every opposing leader that is not down, nothing asked', () => {
    const s = awakening('BP03-004', 0, (h) => h.down(1, 3));
    eq(s.pending, null, '"every" asks nothing');
    eq([L(s, 1, 1).damage, L(s, 1, 2).damage], [10, 10]);
    ok(L(s, 1, 3).down && L(s, 1, 3).damage === 0, 'a leader already down takes nothing');
    ok(L(s, 1, 0).down, 'the attacked leader went down by the attack');
  });

  for (const [no, slot, name] of [['BP03-005', 1, 'Zuzu'], ['BP03-014', 2, 'Kenki']]) {
    test(`${no} ${name} [On Awaken] draw 1 card`, () => {
      const s = awakening(no, slot);
      ok(L(s, 0, slot).awakened);
      eq(s.pending, null);
      eq(P(s, 0).hand.length, 1, 'the played card left the hand, then 1 drawn');
      eq(find(s, 'draw', (e) => e.data.cause === 'effect').length, 1);
      eq(find(s, 'draw', (e) => e.data.cause === 'effect')[0].via, `L0${slot}`, 'attributed to the leader');
    });
  }

  test('BP03-006 Kokage Tsumugi [On Awaken] 20 damage to 1 opposing leader of your choice; a single candidate is still asked', () => {
    let s = awakening('BP03-006', 3);
    ok(L(s, 0, 3).awakened);
    eq(s.pending.purpose, 'target'); eq(s.pending.seat, 0); eq(s.pending.options, ['L11', 'L12', 'L13'], 'the downed attacked leader is not a candidate');
    ok(/20 damage/.test(s.pending.prompt), s.pending.prompt);
    s = fx.choose(s, ['L12']);
    eq([L(s, 1, 1).damage, L(s, 1, 2).damage, L(s, 1, 3).damage], [0, 20, 0]);
    let t = awakening('BP03-006', 3, (h) => { h.down(1, 2); h.down(1, 3); });
    eq(t.pending.options, ['L11'], 'one candidate'); ok(t.pending.kind === 'choose', 'still asks');
    t = fx.choose(t, ['L11']);
    eq(L(t, 1, 1).damage, 20);
  });

  // ============================== attack cards ==============================
  test('BP03-017 Storm Rush [Attack] x3 (FAQ #81, #82, R-025): three separate attacks, each with its own attacker and target; the attacker awakens after the attack that downed a leader, BEFORE the next attack is chosen', () => {
    let s = game([['BP03-017', 4]]);
    s = fx.arrange(s, (h, t) => { h.hand(0, ['BP03-017']); h.damage(1, 0, XS.leaderStats(t, 1, 0).hp - 10); });
    eq(XS.costToPlay(s, fx.idOf(s, 0, 'BP03-017', ['hand'])), 2);
    s = fx.attack(s, 'BP03-017', 0, 0);                 // attack 1: L00 -> L10 (10 HP left): down
    eq(find(s, 'attack').length, 1, 'one attack so far');
    eq(s.pending.kind, 'attackPair', 'attack 2 is chosen anew: attacker and target');
    ok(L(s, 1, 0).down, 'L10 went down');
    ok(L(s, 0, 0).awakened, 'FAQ #81: L00 awakened before attack 2 was chosen');
    eq(find(s, 'awaken').length, 1);
    eq(s.pending.attackers, ['L00', 'L01', 'L02', 'L03']); eq(s.pending.targets, ['L11', 'L12', 'L13'], 'a downed leader cannot be attacked');
    eq(XS.leaderStats(s, 0, 0).atk, 40, 'the awakened ATK is already in force');
    s = XS.apply(s, { type: 'attack', attacker: 'L01', target: 'L11' });   // attack 2: a different attacker and target
    eq(s.pending.kind, 'attackPair', 'attack 3');
    s = XS.apply(s, { type: 'attack', attacker: 'L00', target: 'L12' });   // attack 3: the awakened L00 again
    eq(s.pending, null);
    const atks = find(s, 'attack').map((e) => [e.data.seg, e.data.attacker, e.data.target, e.data.damage]);
    eq(atks, [[0, 'L00', 'L10', 30], [1, 'L01', 'L11', 30], [2, 'L00', 'L12', 40]], 'three attacks, the third at the awakened ATK 40');
    eq([L(s, 1, 1).damage, L(s, 1, 2).damage], [30, 40]);
    // the awakening line comes before the second attack line
    ok(s.log.findIndex((e) => e.type === 'awaken') < s.log.findIndex((e) => e.type === 'attack' && e.data.seg === 1), 'log order: awaken, then attack 2');
    eq(P(s, 0).pp.untapped, 1, 'cost 2 paid once');
  });

  test('BP03-017 Storm Rush (FAQ #82): a memoria boost and its [After Attack] reach the FIRST attack only', () => {
    let s = game([['BP03-017', 4], ['BP03-051', 4]]);
    s = fx.arrange(s, (h) => h.hand(0, ['BP03-051', 'BP03-017']));
    s = fx.play(s, 'BP03-051');
    s = fx.attack(s, 'BP03-017', 0, 0);                 // attack 1 against L10: 30 + 30
    eq(lastAttack(s).parts, { atk: 30, boost: 30, card: 0 });
    eq(s.pending.purpose, 'target', '051 After Attack after attack 1'); eq(s.pending.options, ['L11', 'L12', 'L13']);
    s = fx.choose(s, ['L13']);
    eq(s.pending.kind, 'attackPair', 'attack 2');
    s = XS.apply(s, { type: 'attack', attacker: 'L01', target: 'L11' });
    eq(s.pending.kind, 'attackPair', 'attack 3');
    s = XS.apply(s, { type: 'attack', attacker: 'L02', target: 'L12' });
    eq(s.pending, null, 'no second 【アタック後】 of the memoria');
    eq(find(s, 'attack').map((e) => e.data.parts.boost), [30, 0, 0], 'only the first attack is boosted');
    eq(find(s, 'boost', (e) => e.data.phase === 'applied').length, 1);
    eq([L(s, 1, 0).damage, L(s, 1, 1).damage, L(s, 1, 2).damage, L(s, 1, 3).damage], [60, 30, 30, 30], '60 + 30 to the other leader once; attacks 2 and 3 are plain 30');
  });

  test('BP03-017 Storm Rush (FAQ #76): when the attack downs the last opposing leader, the remaining attacks are not performed', () => {
    let s = game([['BP03-017', 4]]);
    s = fx.arrange(s, (h, t) => { h.hand(0, ['BP03-017']); for (const k of [1, 2, 3]) h.down(1, k); h.damage(1, 0, XS.leaderStats(t, 1, 0).hp - 10); });
    s = fx.attack(s, 'BP03-017', 0, 0);
    eq(find(s, 'attack').length, 1, 'attacks 2 and 3 are not performed: every opposing leader is down');
    ok(s.pending === null || s.pending.kind !== 'attackPair', 'no attack pair is asked');
    eq(s.round, 2, 'the round was won and closed instead'); eq(s.wins, [1, 0]);
  });

  test('BP03-018 No Escape [After Attack]: on round 3, 20 damage to 1 other opposing leader (asked); rounds 1 and 2 and a quick match do nothing (FAQ #96)', () => {
    const d = fx.deckWith('ST01', [['BP03-018', 4]]);
    const toRound = (n) => {
      let s = fx.start({ decks: [d, d] });
      if (n >= 2) s = fx.finishRound(s, 0);
      if (n >= 3) s = fx.finishRound(s, 1);
      eq(s.round, n); eq(s.pending, null);
      return s;
    };
    const run = (s, prep) => {
      const seat = s.active;
      const t = fx.arrange(s, (h, tt) => { h.hand(seat, ['BP03-018']); if (prep) prep(h, tt); });
      return fx.attack(t, 'BP03-018', 0, 0);
    };
    let s = run(toRound(3));
    const seat = s.active, opp = 1 - seat;
    eq(s.pending.purpose, 'target'); eq(s.pending.options, [`L${opp}1`, `L${opp}2`, `L${opp}3`]); ok(/20 damage/.test(s.pending.prompt), s.pending.prompt);
    s = fx.choose(s, [`L${opp}2`]);
    eq([L(s, opp, 0).damage, L(s, opp, 2).damage], [lastAttack(s).damage, 20], 'the attacked leader took the attack, the chosen one 20');
    let one = run(toRound(3), (h) => { const o = 1 - h.t.active; h.down(o, 1); h.down(o, 2); });
    eq(one.pending.options, [`L${opp}3`], 'one candidate'); ok(one.pending.kind === 'choose', 'still asked');
    for (const n of [1, 2]) {
      const r = run(toRound(n));
      eq(r.pending, null, `round ${n}: nothing`);
      eq([1, 2, 3].map((k) => L(r, 1 - r.active, k).damage), [0, 0, 0]);
    }
    const q = fx.start({ decks: [d, d], mode: 'quick', pick2: null });
    const qr = run(q);
    eq(qr.pending, null, 'quick match: round 1 only, never fires'); eq(qr.round, 1);
  });

  test('BP03-022 Piercing Bullet [Attack] Damage +10: 30 + 10 = 40, cost 1', () => {
    let s = game([['BP03-022', 4]]);
    s = fx.arrange(s, (h) => h.hand(0, ['BP03-022']));
    eq(XS.costToPlay(s, fx.idOf(s, 0, 'BP03-022', ['hand'])), 1);
    s = fx.attack(s, 'BP03-022', 0, 0);
    eq(L(s, 1, 0).damage, 40); eq(lastAttack(s).parts, { atk: 30, boost: 0, card: 10 });
  });

  test('BP03-023 Shadow Companion [After Attack] Overkill 10: 30 damage to 1 other opposing leader (asked) when the attack beat the remaining HP by 10 or more; by 0 does nothing', () => {
    let s = strike('BP03-023', 20);                      // 30 damage against 20 left: 10 over
    eq(find(s, 'overkill').length, 1);
    eq(s.pending.purpose, 'target'); eq(s.pending.options, ['L11', 'L12', 'L13']); ok(/30 damage/.test(s.pending.prompt), s.pending.prompt);
    s = fx.choose(s, ['L11']);
    eq(L(s, 1, 1).damage, 30);
    const miss = strike('BP03-023', 30);                 // exactly enough: 0 over
    eq(miss.pending, null); eq(find(miss, 'overkill').length, 0);
    eq([1, 2, 3].map((k) => L(miss, 1, k).damage), [0, 0, 0]);
    let one = strike('BP03-023', 10, (h) => { h.down(1, 1); h.down(1, 2); });
    eq(one.pending.options, ['L13'], 'single candidate still asked');
    one = fx.choose(one, ['L13']);
    eq(L(one, 1, 3).damage, 30);
  });

  test('BP03-027 Merciless Feud [Attack]: discard 1 card from your hand AT RANDOM (you may) - if you did, damage +30 (FAQ #93, #94, #98)', () => {
    const base = (hand) => { const s = game([['BP03-027', 4]]); return fx.arrange(s, (h) => h.hand(0, ['BP03-027', ...hand])); };
    // yes: one of the two other cards goes, face down, chosen by the engine
    let s = fx.attack(base(['ST01-013', 'ST01-015']), 'BP03-027', 0, 0);
    eq(s.pending.purpose, 'may'); eq(s.pending.kind, 'choose');
    const trash = P(s, 0).trash.length;
    s = fx.choose(s, s.pending.options.slice());
    eq(s.pending, null, 'the random pick asks nothing');
    eq(P(s, 0).hand.length, 1); eq(P(s, 0).trash.length, trash + 1);
    eq(find(s, 'discard')[0].data.cause, 'effect');
    eq(lastAttack(s).parts, { atk: 30, boost: 0, card: 30 }); eq(lastAttack(s).damage, 60);
    eq(L(s, 1, 0).damage, 60);
    // no: nothing discarded, no bonus
    let n = fx.attack(base(['ST01-013', 'ST01-015']), 'BP03-027', 0, 0);
    n = XS.apply(n, { type: 'choose', ids: [] });
    eq(P(n, 0).hand.length, 2); eq(lastAttack(n).damage, 30, 'declined: no +30'); eq(find(n, 'discard').length, 0);
    // an empty hand cannot discard, so there is no bonus and no question (FAQ #94)
    const e = fx.attack(base([]), 'BP03-027', 0, 0);
    eq(e.pending, null); eq(lastAttack(e).damage, 30); eq(find(e, 'discard').length, 0);
    // a one-card hand: yes discards exactly that card (random among one)
    let o = fx.attack(base(['ST01-013']), 'BP03-027', 0, 0);
    eq(o.pending.purpose, 'may');
    o = fx.choose(o, o.pending.options.slice());
    ok(fx.has(o, 0, 'trash', 'ST01-013') && P(o, 0).hand.length === 0); eq(lastAttack(o).damage, 60);
  });

  test('BP03-028 Power Setup [After Attack]: draw 1 card if the attacked leader is down; otherwise nothing', () => {
    const yes = strike('BP03-028', 10);
    eq(cardDraws(yes), 1);
    const no = strike('BP03-028', null);
    eq(cardDraws(no), 0); eq(P(no, 0).hand.length, 0);
  });

  test('BP03-032 Demon Pursuit [After Attack] 10 damage to 1 other opposing leader (asked; a single candidate is still asked)', () => {
    let s = strike('BP03-032', null);
    eq(s.pending.options, ['L11', 'L12', 'L13']); ok(/10 damage/.test(s.pending.prompt), s.pending.prompt);
    s = fx.choose(s, ['L13']);
    eq([L(s, 1, 0).damage, L(s, 1, 3).damage], [30, 10]);
    let t = strike('BP03-032', null, (h) => { h.down(1, 1); h.down(1, 2); });
    eq(t.pending.options, ['L13']); ok(t.pending.kind === 'choose');
    t = fx.choose(t, ['L13']);
    eq(L(t, 1, 3).damage, 10);
  });

  test('BP03-038 Feast of Plunder [After Attack]: if the attacked leader is down, draw 1 and the OPPONENT discards 1 card (they choose; asked even with one card); otherwise nothing', () => {
    let s = strike('BP03-038', 10);
    eq(cardDraws(s), 1, 'drew first'); eq(P(s, 0).hand.length, 1);
    eq(s.pending.purpose, 'discard'); eq(s.pending.seat, 1, 'the opponent chooses'); eq([s.pending.min, s.pending.max], [1, 1]);
    eq(s.pending.options, P(s, 1).hand.slice(), 'any card of the opponent hand');
    const trash = P(s, 1).trash.length, hand = P(s, 1).hand.length;
    s = fx.choose(s, [P(s, 1).hand[0]]);
    eq(P(s, 1).hand.length, hand - 1); eq(P(s, 1).trash.length, trash + 1);
    // a one-card opponent hand is still asked
    let one = strike('BP03-038', 10, (h) => { const keep = P(h.t, 1).hand[0]; for (const i of P(h.t, 1).hand.slice()) if (i !== keep) h.trash(1, i); });
    eq(one.pending.options.length, 1); eq(one.pending.seat, 1);
    one = fx.choose(one, one.pending.options.slice());
    eq(P(one, 1).hand.length, 0);
    // not down: neither half happens
    const no = strike('BP03-038', null);
    eq(cardDraws(no), 0); eq(no.pending, null); eq(find(no, 'discard').length, 0);
  });

  test('BP03-042 Breaching Force [After Attack] Overkill 20: recover 1 PP when the attack beat the remaining HP by 20 or more; by 10 does nothing', () => {
    const run = (left) => strike('BP03-042', left, (h) => h.spend(0, 1));   // 1 PP spent first, so there is something to recover
    const hit = run(10);                                  // 30 against 10 left: 20 over
    eq(P(hit, 0).pp.untapped, 2, '3 - 1 spent - 1 for the card + 1 recovered');
    eq(find(hit, 'ppRecover', (e) => e.data.cause === 'effect').map((e) => e.data.n), [1]);
    eq(find(hit, 'overkill').length, 1);
    const miss = run(20);                                 // 30 against 20 left: 10 over
    eq(P(miss, 0).pp.untapped, 1, 'no recovery'); eq(find(miss, 'overkill').length, 0);
    eq(find(miss, 'ppRecover', (e) => e.data.cause === 'effect').length, 0);
  });

  // ============================== memoria ==============================
  test('BP03-050 Festival Opening [On Play] draw 1 card; [Attack Boost] +30 to the next attack only', () => {
    let s = game([['BP03-050', 4]]);
    s = fx.arrange(s, (h) => h.hand(0, ['BP03-050', PLAIN, PLAIN]));
    const iid = fx.idOf(s, 0, 'BP03-050', ['hand']);
    eq(XS.costToPlay(s, iid), 1);
    s = fx.play(s, 'BP03-050');
    eq(P(s, 0).hand.length, 3, '2 left in hand + 1 drawn'); eq(effDraws(s), 1);
    eq(P(s, 0).boosts, [iid], 'armed');
    s = fx.attack(s, PLAIN, 0, 0);
    eq(lastAttack(s).parts, { atk: 30, boost: 30, card: 10 });
    eq(P(s, 0).boosts, [], 'consumed');
    s = fx.attack(s, PLAIN, 0, 1);
    eq(lastAttack(s).parts.boost, 0, 'the next attack gets nothing');
  });

  test('BP03-051 Blatant Provocation [Attack Boost] +30; [After Attack] 30 damage to 1 other opposing leader of the attack it boosted (asked; a single candidate is still asked)', () => {
    const run = (prep) => {
      let s = game([['BP03-051', 4]]);
      s = fx.arrange(s, (h) => { h.hand(0, ['BP03-051', PLAIN, PLAIN]); if (prep) prep(h); });
      s = fx.play(s, 'BP03-051');
      return fx.attack(s, PLAIN, 0, 0);
    };
    let s = run();
    eq(lastAttack(s).parts.boost, 30); eq(L(s, 1, 0).damage, 70);
    eq(s.pending.options, ['L11', 'L12', 'L13']); ok(/30 damage/.test(s.pending.prompt), s.pending.prompt);
    s = fx.choose(s, ['L12']);
    eq(L(s, 1, 2).damage, 30);
    s = fx.attack(s, PLAIN, 0, 1);
    eq(s.pending, null, 'FAQ #36: the After Attack belongs to that attack only'); eq(L(s, 1, 3).damage, 0);
    let one = run((h) => { h.down(1, 1); h.down(1, 2); });
    eq(one.pending.options, ['L13'], 'single candidate'); ok(one.pending.kind === 'choose');
  });

  for (const [no, name, amount] of [['BP03-053', 'Arena Master', 50], ['BP03-055', '22HZ', 60], ['BP03-070', 'Popular Food Truck', 60]]) {
    test(`${no} ${name} [Attack Boost] the next attack deals +${amount} damage (cost 1), and only the next attack`, () => {
      let s = game([[no, 4]]);
      s = fx.arrange(s, (h) => h.hand(0, [no, PLAIN, PLAIN]));
      const iid = fx.idOf(s, 0, no, ['hand']);
      eq(XS.costToPlay(s, iid), 1);
      s = fx.play(s, no);
      eq(P(s, 0).boosts, [iid]);
      s = fx.attack(s, PLAIN, 0, 1);
      eq(lastAttack(s).parts, { atk: 30, boost: amount, card: 10 }); eq(lastAttack(s).damage, 40 + amount);
      eq(P(s, 0).boosts, [], 'consumed');
      s = fx.attack(s, PLAIN, 0, 2);
      eq(lastAttack(s).parts.boost, 0);
    });
  }

  test('BP03-056 Champagne Call [On Play] draw 1 card if there is 1 or more attack cards in your play area; [Attack Boost] +40', () => {
    let s = game([['BP03-056', 4]]);
    s = fx.arrange(s, (h) => h.hand(0, [PLAIN, 'BP03-056']));
    s = fx.attack(s, PLAIN, 0, 0);                        // an attack card now sits in the play area
    ok(P(s, 0).play.some((i) => s.cards[i].kind === 'attack'), 'an attack card is in the play area');
    s = fx.play(s, 'BP03-056');
    eq(effDraws(s), 1); eq(P(s, 0).hand.length, 1);
    eq(XS.boostParts(s, 0, P(s, 0).boosts).boost, 40);
    // no attack card in the play area: no draw, the boost is armed all the same
    let n = game([['BP03-056', 4]]);
    n = fx.arrange(n, (h) => h.hand(0, ['BP03-056', PLAIN]));
    n = fx.play(n, 'BP03-056');
    eq(effDraws(n), 0); eq(P(n, 0).hand.length, 1); eq(P(n, 0).boosts.length, 1);
    n = fx.attack(n, PLAIN, 0, 0);
    eq(lastAttack(n).parts.boost, 40);
    // another memoria is not an attack card
    let m = game([['BP03-056', 4]]);
    m = fx.arrange(m, (h) => h.hand(0, [BOOST_MEM, 'BP03-056']));
    m = fx.play(m, BOOST_MEM); m = fx.play(m, 'BP03-056');
    eq(effDraws(m), 0, 'a memoria in the play area does not count');
  });

  test('BP03-059 We are...! [On Play] with 2 or more attack cards in your play area: heal 1 of your leaders by 30 (asked) and draw 2; fewer: nothing', () => {
    const base = (attacks, prep) => {
      let s = game([['BP03-059', 4]]);
      s = fx.arrange(s, (h) => { h.hand(0, [PLAIN, PLAIN, 'BP03-059']); h.damage(0, 1, 60); if (prep) prep(h); });
      for (let k = 0; k < attacks; k++) s = fx.attack(s, PLAIN, 0, k);
      return fx.play(s, 'BP03-059');
    };
    let s = base(2);
    eq(s.pending.purpose, 'heal'); eq(s.pending.options, ['L00', 'L01', 'L02', 'L03']); ok(/heal 30/.test(s.pending.prompt), s.pending.prompt);
    eq(effDraws(s), 0, 'asked before anything moves');
    s = fx.choose(s, ['L01']);
    eq(L(s, 0, 1).damage, 30); eq(effDraws(s), 2); eq(P(s, 0).hand.length, 2);
    // single candidate: the other three leaders go down AFTER the two attacks (the attacker L00 must be up to attack)
    let one = (function () {
      let t = game([['BP03-059', 4]]);
      t = fx.arrange(t, (h) => { h.hand(0, [PLAIN, PLAIN, 'BP03-059']); h.damage(0, 1, 60); });
      t = fx.attack(t, PLAIN, 0, 0); t = fx.attack(t, PLAIN, 0, 1);
      t = fx.arrange(t, (h) => { h.down(0, 0); h.down(0, 2); h.down(0, 3); });
      return fx.play(t, 'BP03-059');
    })();
    eq(one.pending.options, ['L01'], 'single candidate still asked'); ok(one.pending.kind === 'choose');
    one = fx.choose(one, ['L01']);
    eq(L(one, 0, 1).damage, 30);
    const few = base(1);
    eq(few.pending, null, 'only 1 attack card: no heal, no draw'); eq(effDraws(few), 0); eq(L(few, 0, 1).damage, 60);
    eq(P(few, 0).boosts.length, 1, 'the boost is armed regardless');
  });

  test('BP03-059 We are...! [Attack Boost] +70 only if there are 3 or more memoria in your play area WHEN the boost is applied (it counts itself; FAQ #43, R-051)', () => {
    const run = (given, extra) => {
      let s = game([['BP03-059', 4], [BOOST_MEM, 4]]);
      s = fx.arrange(s, (h) => {
        h.hand(0, ['BP03-059', PLAIN, ...(extra ? [BOOST_MEM] : [])]);
        for (let k = 0; k < given; k++) h.give(0, BOOST_MEM, 'play');   // memoria already in the play area (as after a free play)
      });
      s = fx.play(s, 'BP03-059');
      if (extra) s = fx.play(s, BOOST_MEM);
      return s;
    };
    // 1 other memoria + this one = 2 when played, 3 when a further one is played before the attack: counted at the attack
    let s = run(1, true);
    eq(P(s, 0).play.filter((i) => s.cards[i].kind === 'memoria').length, 3);
    s = fx.attack(s, PLAIN, 0, 0);
    eq(find(s, 'attack')[0].data.parts.boost, 70 + 50, 'the 3-memoria bonus plus Gambit Master');
    // 2 memoria only: no bonus
    let t = run(1, false);
    t = fx.attack(t, PLAIN, 0, 0);
    eq(find(t, 'attack')[0].data.parts.boost, 0, '2 memoria: nothing');
    eq(find(t, 'boost', (e) => e.data.phase === 'applied')[0].data.amount, 0);
    // 3 memoria from the start (two already in the play area)
    let u = run(2, false);
    u = fx.attack(u, PLAIN, 0, 0);
    eq(find(u, 'attack')[0].data.parts.boost, 70);
  });

  // ============================== tactics ==============================
  test('BP03-077 Power Field [Round] this round every leader of yours gets +10 ATK: the card stays in the play area past the end of the turn, the opponent is unaffected, the round end removes both', () => {
    let s = tactical('BP03-077', (h) => h.hand(1, ['ST02-007']));   // Impact Shot: cost 2, damage +40
    eq(XS.costToPlay(s, fx.idOf(s, 1, 'BP03-077', ['tarea'])), 0);
    eq([0, 1, 2, 3].map((k) => XS.leaderStats(s, 1, k).atk), [30, 30, 30, 30]);
    s = fx.play(s, 'BP03-077');
    const iid = fx.idOf(s, 1, 'BP03-077', ['play']);
    eq([0, 1, 2, 3].map((k) => XS.leaderStats(s, 1, k).atk), [40, 40, 40, 40], 'every leader of the player');
    eq([0, 1, 2, 3].map((k) => XS.leaderStats(s, 0, k).atk), [30, 30, 30, 30], 'not the opponent\'s leaders');
    s = fx.attack(s, 'ST02-007', 2, 0);
    eq(lastAttack(s).parts.atk, 40, 'the damage formula uses the raised ATK');
    s = fx.toTurnOf(fx.endTurn(s), 1);
    ok(P(s, 1).play.includes(iid), 'not trashed at the end of the turn');
    eq(XS.leaderStats(s, 1, 0).atk, 40, 'still in force next turn');
    s = fx.finishRound(s, 1);
    eq(P(s, 1).play.length, 0, 'trashed at the round end'); eq(XS.leaderStats(s, 1, 3).atk, 30);
  });

  test('BP03-078 Fire Cracker [On Play] 10 damage to every opposing leader that is not down (nothing asked), then draw 1 card', () => {
    let s = tactical('BP03-078', (h) => h.down(0, 3));
    eq(XS.costToPlay(s, fx.idOf(s, 1, 'BP03-078', ['tarea'])), 0);
    const hand = P(s, 1).hand.length;
    s = fx.play(s, 'BP03-078');
    eq(s.pending, null, '"every" asks nothing');
    eq([L(s, 0, 0).damage, L(s, 0, 1).damage, L(s, 0, 2).damage], [10, 10, 10]);
    ok(L(s, 0, 3).down && L(s, 0, 3).damage === 0, 'a downed leader takes nothing');
    eq(P(s, 1).hand.length, hand + 1); eq(effDraws(s), 1);
  });

  test('BP03-079 Target Flag (equipment): while the equipped opposing leader can be attacked it is the only legal target; effect targets stay free (FAQ #89); once it is down the others are open', () => {
    let s = tactical('BP03-079');
    const iid = fx.idOf(s, 1, 'BP03-079', ['tarea']);
    eq(XS.legalActions(s).filter((a) => a.iid === iid).map((a) => a.target), ['L10', 'L11', 'L12', 'L13'], 'one action per leader: the owner chooses who carries it');
    s = fx.play(s, 'BP03-079', { target: 'L12' });
    eq(P(s, 1).leaders[2].equipment, [iid]);
    s = fx.toTurnOf(fx.endTurn(s), 0);
    s = fx.arrange(s, (h) => h.hand(0, ['ST01-009']));   // Proof of Strength: [After Attack] 10 damage to 1 other opposing leader
    const targets = (t) => [...new Set(XS.legalActions(t).filter((a) => a.type === 'play' && a.target !== undefined).map((a) => a.target))];
    eq(targets(s), ['L12'], 'only the flagged leader');
    throws(() => XS.apply(s, { type: 'play', iid: fx.idOf(s, 0, 'ST01-009', ['hand']), attacker: 'L00', target: 'L10' }), 'another target refused', XS.Illegal);
    const a = fx.attack(s, 'ST01-009', 0, 2);
    eq(a.pending.options, ['L10', 'L11', 'L13'], 'the After Attack target is a free choice, not forced onto the flag');
    const d = fx.arrange(s, (h) => h.down(1, 2));
    eq(targets(d), ['L10', 'L11', 'L13'], 'the flagged leader is down: no restriction');
  });

  test('BP03-080 Cyber Armor (equipment) base HP becomes 140 (not awakened) / 170 (awakened) instead of the printed HP, and other equipment adds on top (FAQ #90)', () => {
    let s = tactical('BP03-080');
    const iid = fx.idOf(s, 1, 'BP03-080', ['tarea']);
    eq(XS.legalActions(s).filter((a) => a.iid === iid).map((a) => a.target), ['L10', 'L11', 'L12', 'L13'], 'one action per leader');
    eq(XS.leaderStats(s, 1, 2).hp, 100); eq(XS.leaderStats(s, 1, 1).hp, 110);
    s = fx.play(s, 'BP03-080', { target: 'L12' });
    eq(XS.leaderStats(s, 1, 2).hp, 140, 'printed 100 -> 140');
    eq(XS.leaderStats(s, 1, 1).hp, 110, 'other leaders unchanged');
    // the printed 110 is replaced, not added to
    let t = tactical('BP03-080');
    t = fx.play(t, 'BP03-080', { target: 'L11' });
    eq(XS.leaderStats(t, 1, 1).hp, 140, 'a 110 HP leader also gets exactly 140');
    // the FAQ #90 example: 50 damage and Light Shield on a 100 HP leader -> base 140, max 170, remaining 120
    s = fx.arrange(s, (h) => { h.equip(1, 2, 'ST02-023'); h.damage(1, 2, 50); });
    const st = XS.leaderStats(s, 1, 2);
    eq([st.hp, st.damage, st.remaining], [170, 50, 120], 'Light Shield adds on the replaced base');
    // awakened: 170 base
    s = fx.arrange(s, (h) => h.awaken(1, 2));
    eq(XS.leaderStats(s, 1, 2).hp, 200, '170 + 30 once awakened');
    eq(XS.leaderStats(s, 1, 2).remaining, 150);
    // the extra HP is real: 140 damage does not down the unawakened leader
    let u = tactical('BP03-080');
    u = fx.play(u, 'BP03-080', { target: 'L12' });
    u = fx.arrange(u, (h) => h.damage(1, 2, 130));
    ok(!L(u, 1, 2).down, '130 < 140: still up'); eq(XS.leaderStats(u, 1, 2).remaining, 10);
    u = fx.arrange(u, (h) => h.damage(1, 2, 10));
    ok(L(u, 1, 2).down, '140 damage downs it');
  });
})();
