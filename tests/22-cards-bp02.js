// One behaviour test per BP02 card number used by a registered deck (data/abilities-bp02.js). Same rules as
// tests/20-cards.js: a real game state, the card played through XS.apply, the side effect asserted, and a
// single-candidate case for every targeted effect (CLAUDE.md rule 4). Positions: tests/05-fixtures.js.
(function () {
  const XS = globalThis.XS;
  const { test, eq, ok, throws } = XS.T;
  const fx = XS.T.fx;
  const P = (s, seat) => s.players[seat];
  const L = (s, seat, slot) => s.players[seat].leaders[slot];
  const find = (s, type, pred) => s.log.filter((e) => e.type === type && (!pred || pred(e)));
  const effectDraws = (s) => find(s, 'draw', (e) => e.data.cause === 'effect').length;
  // seat 0 plays the ST01 deck extended with the BP02 cards [[no, qty]], the tactics `tacs` and (optionally) other leaders; seat 1 plays ST02
  const deck = (main, tacs, leaders) => {
    const d = fx.deckWith('ST01', main, tacs);
    return leaders === undefined ? d : Object.assign({}, d, { leaders });
  };
  const game = (main, o) => fx.start({ decks: [deck(main, o && o.tacs, o && o.leaders), 'ST02'] });
  const PLAIN = 'ST01-011';   // cost 1, +10, no After Attack of its own
  const FLAT = 'ST01-008';   // cost 1, no damage bonus; its After Attack only draws when the attacked leader is down
  const left = (t, seat, slot, n) => XS.leaderStats(t, seat, slot).hp - n;   // damage that leaves n HP
  const toRound3 = (s) => fx.toTurnOf(fx.finishRound(fx.finishRound(s, 0), 1), 0);
  const dmgOf = (s) => find(s, 'damage', (e) => e.data.kind === 'attack').at(-1).data.amount;

  // ============================== leaders: 【覚醒時】 ==============================
  // The attacked L10 has 10 HP left, so the attack downs it and the attacker (slot `slot`) awakens.
  function awakenScenario(leaders, slot, prep) {
    let s = game([], { leaders });
    s = fx.arrange(s, (h, t) => { h.hand(0, ['ST01-011']); h.damage(1, 0, left(t, 1, 0, 10)); if (prep) prep(h, t); });
    return fx.attack(s, 'ST01-011', slot, 0);
  }
  const mix = (no) => [no, 'ST01-003', 'ST01-004', 'ST01-002'];

  test('BP02-004 Hanabi Chouya [On Awaken]: draw 1 card when it awakens (nothing to choose)', () => {
    const s = awakenScenario(mix('BP02-004'), 0);
    ok(L(s, 0, 0).awakened, 'awakened');
    eq(s.pending, null);
    eq(P(s, 0).hand.length, 1, 'the played card left the hand, then 1 card was drawn');
    eq(find(s, 'draw', (e) => e.data.cause === 'effect')[0].via, 'L00', 'the draw is attributed to the leader');
    eq(effectDraws(s), 1);
  });

  for (const [no, name] of [['BP02-010', 'Cupi Kaminari'], ['BP02-014', 'Dogura']]) {
    test(`${no} ${name} [On Awaken]: 10 damage to every opposing leader that is not down, asked nothing`, () => {
      const s = awakenScenario(mix(no), 0, (h) => h.down(1, 3));
      eq(s.pending, null, '"every" asks nothing');
      eq([L(s, 1, 1).damage, L(s, 1, 2).damage], [10, 10]);
      ok(L(s, 1, 3).down && L(s, 1, 3).damage === 0, 'the leader that was already down takes nothing');
      ok(L(s, 1, 0).down, 'the attacked leader went down by the attack');
    });
  }

  // ============================== attack cards ==============================
  test('BP02-018 Psycho Fortress [Attack]: damage +10 only if the attacker is awakened', () => {
    let s = game([['BP02-018', 4]]);
    s = fx.arrange(s, (h) => h.hand(0, ['BP02-018']));
    const iid = fx.idOf(s, 0, 'BP02-018', ['hand']);
    eq(XS.costToPlay(s, iid), 1);
    const plain = XS.leaderStats(s, 0, 0).atk;
    eq(XS.previewAttack(s, { type: 'play', iid, attacker: 'L00', target: 'L11' }), plain, 'not awakened: no bonus');
    eq(dmgOf(fx.attack(s, 'BP02-018', 0, 1)), plain);
    const t = fx.arrange(s, (h) => h.awaken(0, 0));
    const awake = XS.leaderStats(t, 0, 0).atk;
    ok(awake > plain, 'an awakened leader has more ATK');
    eq(XS.previewAttack(t, { type: 'play', iid, attacker: 'L00', target: 'L11' }), awake + 10, 'awakened: +10');
    eq(dmgOf(fx.attack(t, 'BP02-018', 0, 1)), awake + 10);
    // the condition reads the attacker, not the team: another (unawakened) leader attacking gets nothing
    eq(dmgOf(fx.attack(t, 'BP02-018', 1, 1)), XS.leaderStats(t, 0, 1).atk, 'a different, unawakened attacker');
  });

  test('BP02-023 Overwhelming Me!! [After Attack]: draw 1 card only if the attacked leader is down', () => {
    // attacker slot 2 (its own awakening draws nothing)
    let s = game([['BP02-023', 4]]);
    s = fx.arrange(s, (h, t) => { h.hand(0, ['BP02-023']); h.damage(1, 0, left(t, 1, 0, 10)); });
    s = fx.attack(s, 'BP02-023', 2, 0);
    ok(L(s, 1, 0).down);
    eq(s.pending, null);
    eq(P(s, 0).hand.length, 1, 'down -> drew 1');
    eq(effectDraws(s), 1);
    let t = game([['BP02-023', 4]]);
    t = fx.arrange(t, (h) => h.hand(0, ['BP02-023']));
    t = fx.attack(t, 'BP02-023', 2, 0);
    ok(!L(t, 1, 0).down);
    eq(P(t, 0).hand.length, 0, 'not down -> nothing');
    eq(effectDraws(t), 0);
    // another leader going down does not count (FAQ #18): the attacked one survives
    let u = game([['BP02-023', 4]]);
    u = fx.arrange(u, (h, t2) => { h.hand(0, ['BP02-023']); h.down(1, 1); });
    u = fx.attack(u, 'BP02-023', 2, 0);
    eq(effectDraws(u), 0, 'a leader that was already down elsewhere does not count');
  });

  test('BP02-026 Dread Form [After Attack]: 10 damage to 1 other opposing leader (asked; the attacked one is not a candidate; one candidate is still asked)', () => {
    let s = game([['BP02-026', 4]]);
    s = fx.arrange(s, (h) => h.hand(0, ['BP02-026']));
    s = fx.attack(s, 'BP02-026', 0, 0);
    eq(s.pending.purpose, 'target'); eq(s.pending.options, ['L11', 'L12', 'L13']); ok(/10 damage/.test(s.pending.prompt), s.pending.prompt);
    s = fx.choose(s, ['L12']);
    eq([L(s, 1, 0).damage, L(s, 1, 1).damage, L(s, 1, 2).damage, L(s, 1, 3).damage], [30, 0, 10, 0]);
    let t = game([['BP02-026', 4]]);
    t = fx.arrange(t, (h) => { h.hand(0, ['BP02-026']); h.down(1, 1); h.down(1, 3); });
    t = fx.attack(t, 'BP02-026', 0, 0);
    eq(t.pending.options, ['L12'], 'one candidate'); ok(t.pending.min === 1, 'still a question');
    t = fx.choose(t, ['L12']); eq(L(t, 1, 2).damage, 10);
  });

  test('BP02-032 Unstoppable [Attack]: damage +20 only in round 3', () => {
    let s = game([['BP02-032', 4]]);
    s = fx.arrange(s, (h) => h.hand(0, ['BP02-032']));
    const atk = XS.leaderStats(s, 0, 0).atk;
    eq(s.round, 1);
    eq(dmgOf(fx.attack(s, 'BP02-032', 0, 1)), atk, 'round 1: no bonus');
    let r2 = fx.finishRound(s, 0);
    r2 = fx.arrange(fx.toTurnOf(r2, 0), (h) => h.hand(0, ['BP02-032']));
    eq(r2.round, 2);
    eq(dmgOf(fx.attack(r2, 'BP02-032', 0, 1)), XS.leaderStats(r2, 0, 0).atk, 'round 2: no bonus');
    let r3 = toRound3(s);
    eq(r3.round, 3);
    r3 = fx.arrange(r3, (h) => h.hand(0, ['BP02-032']));
    const iid = fx.idOf(r3, 0, 'BP02-032', ['hand']);
    const atk3 = XS.leaderStats(r3, 0, 0).atk;   // the leader that won the earlier rounds is awakened by now
    eq(XS.previewAttack(r3, { type: 'play', iid, attacker: 'L00', target: 'L11' }), atk3 + 20);
    eq(dmgOf(fx.attack(r3, 'BP02-032', 0, 1)), atk3 + 20, 'round 3: +20');
  });

  test('BP02-035 Deadly Camp [After Attack]: Overkill 20 -> recover 1 PP; 10 short of that recovers nothing', () => {
    // ATK 30 against a leader with 10 left: excess 20
    let s = game([['BP02-035', 4]]);
    s = fx.arrange(s, (h, t) => { h.hand(0, ['BP02-035']); h.damage(1, 0, left(t, 1, 0, 10)); });
    const before = P(s, 0).pp.untapped;
    s = fx.attack(s, 'BP02-035', 2, 0);
    ok(L(s, 1, 0).down);
    eq(find(s, 'overkill').length, 1, 'the keyword fired');
    eq(P(s, 0).pp.untapped, before, 'paid 1, recovered 1');
    // 20 left: excess 10, below 20
    let t = game([['BP02-035', 4]]);
    t = fx.arrange(t, (h, t2) => { h.hand(0, ['BP02-035']); h.damage(1, 0, left(t2, 1, 0, 20)); });
    const b2 = P(t, 0).pp.untapped;
    t = fx.attack(t, 'BP02-035', 2, 0);
    ok(L(t, 1, 0).down, 'it is down, but the excess is only 10');
    eq(find(t, 'overkill').length, 0);
    eq(P(t, 0).pp.untapped, b2 - 1, 'no PP back');
    // no kill at all
    let u = game([['BP02-035', 4]]);
    u = fx.arrange(u, (h) => h.hand(0, ['BP02-035']));
    const b3 = P(u, 0).pp.untapped;
    u = fx.attack(u, 'BP02-035', 2, 0);
    eq(P(u, 0).pp.untapped, b3 - 1);
  });

  test('BP02-040 Machine-Gun Talk [After Attack]: draw 1 card, then discard 1 card from your hand (asked, face down), even with a one-card hand', () => {
    let s = game([['BP02-040', 4]]);
    s = fx.arrange(s, (h) => { h.hand(0, ['BP02-040']); h.top(0, ['ST01-014']); });
    s = fx.attack(s, 'BP02-040', 0, 1);
    eq(P(s, 0).hand.length, 1, 'drew 1');
    eq(s.pending.purpose, 'discard'); eq(s.pending.options.length, 1, 'one candidate, still asked');
    eq([s.pending.min, s.pending.max], [1, 1]);
    const trash = P(s, 0).trash.length;
    s = fx.choose(s, [fx.idOf(s, 0, 'ST01-014', ['hand'])]);
    eq(P(s, 0).hand.length, 0); eq(P(s, 0).trash.length, trash + 1);
    ok(fx.has(s, 0, 'trash', 'ST01-014') && XS.view(s, 0).players[0].trash.at(-1).hidden === true, 'face down');
  });

  test('BP02-042 Captain\'s Dignity [After Attack]: if the attacked leader is down the OPPONENT discards 1 card of their choice; otherwise nothing', () => {
    let s = game([['BP02-042', 4]]);
    s = fx.arrange(s, (h, t) => { h.hand(0, ['BP02-042']); h.damage(1, 0, left(t, 1, 0, 10)); });
    const oppHand = P(s, 1).hand.length;
    s = fx.attack(s, 'BP02-042', 2, 0);
    ok(L(s, 1, 0).down);
    eq(s.pending.purpose, 'discard'); eq(s.pending.seat, 1, 'the opponent chooses');
    eq(s.pending.options.length, oppHand); eq([s.pending.min, s.pending.max], [1, 1]);
    const pick = s.pending.options[0];
    s = fx.choose(s, [pick]);
    eq(P(s, 1).hand.length, oppHand - 1); ok(P(s, 1).trash.includes(pick));
    eq(P(s, 0).hand.length, 0, 'the attacker discarded nothing');
    // a one-card hand is still a question
    let t = game([['BP02-042', 4]]);
    t = fx.arrange(t, (h, t2) => { h.hand(0, ['BP02-042']); h.hand(1, ['ST02-007']); h.damage(1, 0, left(t2, 1, 0, 10)); });
    t = fx.attack(t, 'BP02-042', 2, 0);
    eq(t.pending.seat, 1); eq(t.pending.options.length, 1, 'one candidate, still asked');
    t = fx.choose(t, t.pending.options);
    eq(P(t, 1).hand.length, 0);
    // not down: the opponent keeps every card
    let u = game([['BP02-042', 4]]);
    u = fx.arrange(u, (h) => h.hand(0, ['BP02-042']));
    const n = P(u, 1).hand.length;
    u = fx.attack(u, 'BP02-042', 2, 0);
    ok(!L(u, 1, 0).down); eq(u.pending, null); eq(P(u, 1).hand.length, n);
  });

  // ============================== memoria ==============================
  // Play the memoria, then attack with the flat card: the boost shows in the attack's damage and is used up by that attack.
  function boostScenario(no, plus) {
    let s = game([[no, 4], [FLAT, 4]]);
    s = fx.arrange(s, (h) => h.hand(0, [no, FLAT, FLAT]));
    const atk = XS.leaderStats(s, 0, 0).atk;
    eq(XS.costToPlay(s, fx.idOf(s, 0, no, ['hand'])), 1);
    s = fx.play(s, no);
    eq(s.pending, null);
    const iid = fx.idOf(s, 0, FLAT, ['hand']);
    eq(XS.previewAttack(s, { type: 'play', iid, attacker: 'L00', target: 'L11' }), atk + plus);
    s = fx.attack(s, FLAT, 0, 1);
    eq(dmgOf(s), atk + plus, `${no}: next attack +${plus}`);
    s = fx.attack(s, FLAT, 0, 2);
    eq(dmgOf(s), atk, 'the boost is used up by the first attack');
    return s;
  }
  test('BP02-046 Dig In! [Attack Boost]: the next attack deals +50 (only that one)', () => { boostScenario('BP02-046', 50); });
  test('BP02-051 First Cheer [Attack Boost]: the next attack deals +60 (only that one)', () => { boostScenario('BP02-051', 60); });
  test('BP02-070 First-Strike Demon [Attack Boost]: the next attack deals +60 (only that one)', () => { boostScenario('BP02-070', 60); });

  test('BP02-054 King of the Scorched Earth [On Play]: draw 1 card, then discard 1 card from your hand (asked), cost 0', () => {
    let s = game([['BP02-054', 4]]);
    s = fx.arrange(s, (h) => { h.hand(0, ['BP02-054']); h.top(0, ['ST01-014']); });
    eq(XS.costToPlay(s, fx.idOf(s, 0, 'BP02-054', ['hand'])), 0);
    const ppBefore = P(s, 0).pp.untapped;
    s = fx.play(s, 'BP02-054');
    eq(P(s, 0).hand.length, 1, 'drew 1');
    eq(s.pending.purpose, 'discard'); eq(s.pending.options.length, 1, 'one candidate, still asked');
    s = fx.choose(s, [fx.idOf(s, 0, 'ST01-014', ['hand'])]);
    eq(P(s, 0).hand.length, 0);
    ok(fx.has(s, 0, 'trash', 'ST01-014'));
    eq(P(s, 0).pp.untapped, ppBefore, 'cost 0: no PP spent');
  });

  test('BP02-063 Gal Style [On Play] draw 1 card; [Attack Boost] the next attack +30', () => {
    let s = game([['BP02-063', 4], [FLAT, 4]]);
    s = fx.arrange(s, (h) => h.hand(0, ['BP02-063', FLAT]));
    const atk = XS.leaderStats(s, 0, 0).atk;
    s = fx.play(s, 'BP02-063');
    eq(s.pending, null);
    eq(P(s, 0).hand.length, 2, 'played 1, drew 1');
    eq(effectDraws(s), 1);
    s = fx.attack(s, FLAT, 0, 1);
    eq(dmgOf(s), atk + 30);
  });

  test('BP02-068 Just Eat Chicken! [On Play]: draw 1 only in round 3 (round 1 and 2: nothing); [Attack Boost] the next attack +40', () => {
    let s = game([['BP02-068', 4], [FLAT, 4]]);
    s = fx.arrange(s, (h) => h.hand(0, ['BP02-068', FLAT]));
    const atk = XS.leaderStats(s, 0, 0).atk;
    s = fx.play(s, 'BP02-068');
    eq(P(s, 0).hand.length, 1, 'round 1: no draw'); eq(effectDraws(s), 0);
    s = fx.attack(s, FLAT, 0, 1);
    eq(dmgOf(s), atk + 40, 'the boost applies in any round');
    let r2 = fx.toTurnOf(fx.finishRound(game([['BP02-068', 4]]), 0), 0);
    r2 = fx.arrange(r2, (h) => h.hand(0, ['BP02-068']));
    eq(r2.round, 2);
    const d2 = effectDraws(r2);
    r2 = fx.play(r2, 'BP02-068');
    eq(effectDraws(r2), d2, 'round 2: no draw');
    let r3 = toRound3(game([['BP02-068', 4]]));
    r3 = fx.arrange(r3, (h) => h.hand(0, ['BP02-068']));
    eq(r3.round, 3);
    const d3 = effectDraws(r3);
    r3 = fx.play(r3, 'BP02-068');
    eq(P(r3, 0).hand.length, 1, 'round 3: played 1, drew 1');
    eq(effectDraws(r3), d3 + 1);
  });

  // ============================== tactics ==============================
  // BP02-076 Drain Rod: heal 40 in total, then damage to 1 opposing leader equal to the amount ACTUALLY healed (FAQ #64).
  const rod = (prep) => {
    let s = fx.start({ decks: ['ST02', deck([], ['BP02-076'])], pick: [null, 'BP02-076'] });
    s = fx.toTurnOf(s, 1);
    return prep ? fx.arrange(s, prep) : s;
  };
  const rodHeals = (s) => find(s, 'heal').map((e) => e.data.amount);

  test('BP02-076 Drain Rod [On Play]: healing 40 on a leader with 40 damage deals 40 to the chosen opposing leader (cost 0)', () => {
    let s = rod((h) => h.damage(1, 0, 40));
    eq(XS.costToPlay(s, fx.idOf(s, 1, 'BP02-076', ['tarea'])), 0);
    s = fx.play(s, 'BP02-076');
    eq(s.pending.kind, 'distribute'); eq([s.pending.total, s.pending.unit], [40, 10]);
    s = XS.apply(s, { type: 'distribute', alloc: { L10: 40 } });
    eq(L(s, 1, 0).damage, 0);
    eq(rodHeals(s), [40]);
    eq([s.pending.kind, s.pending.purpose, s.pending.seat], ['choose', 'target', 1]);
    eq(s.pending.options, ['L00', 'L01', 'L02', 'L03']);
    s = XS.apply(s, { type: 'choose', ids: ['L02'] });
    eq(L(s, 0, 2).damage, 40);
    eq(find(s, 'damage', (e) => e.data.kind === 'effect' && e.data.leader[1] === '0').map((e) => [e.data.leader, e.data.amount]), [['L02', 40]], 'one damage event on the chosen opposing leader');
  });

  test('BP02-076 Drain Rod: FAQ #64 - a leader with 30 damage heals 30 of the 40, so the damage is 30, not 40', () => {
    let s = rod((h) => h.damage(1, 0, 30));
    s = fx.play(s, 'BP02-076');
    s = XS.apply(s, { type: 'distribute', alloc: { L10: 40 } });
    eq(rodHeals(s), [30], 'the heal door reports what it removed');
    eq(L(s, 1, 0).damage, 0);
    s = XS.apply(s, { type: 'choose', ids: ['L01'] });
    eq(L(s, 0, 1).damage, 30);
  });

  test('BP02-076 Drain Rod: the healed amount is the sum over the leaders chosen (20 + 10 of 20 + 20 requested = 30)', () => {
    let s = rod((h) => { h.damage(1, 0, 20); h.damage(1, 1, 10); });
    s = fx.play(s, 'BP02-076');
    s = XS.apply(s, { type: 'distribute', alloc: { L10: 20, L11: 20 } });
    eq(rodHeals(s), [20, 10]);
    s = XS.apply(s, { type: 'choose', ids: ['L00'] });
    eq(L(s, 0, 0).damage, 30);
  });

  test('BP02-076 Drain Rod: nothing healed (no own damage) deals 0 damage and asks nothing more (R-062)', () => {
    let s = rod();
    s = fx.play(s, 'BP02-076');
    eq(s.pending.kind, 'distribute', 'still asked how to split the healing');
    s = XS.apply(s, { type: 'distribute', alloc: { L11: 40 } });
    eq(rodHeals(s), [0]);
    eq(s.pending, null, 'no target is asked for 0 damage');
    eq(find(s, 'damage', (e) => e.data.kind === 'effect' && e.data.leader[1] === '0').length, 0);
    eq([0, 1, 2, 3].map((k) => L(s, 0, k).damage), [0, 0, 0, 0]);
  });

  test('BP02-076 Drain Rod: a downed leader is not a heal candidate, and one candidate on each side is still a question', () => {
    let s = rod((h) => { h.down(1, 0); h.down(1, 1); h.down(1, 2); h.damage(1, 3, 50); h.down(0, 0); h.down(0, 1); h.down(0, 2); });
    s = fx.play(s, 'BP02-076');
    eq(s.pending.options, ['L13'], 'one own leader: still asked');
    s = XS.apply(s, { type: 'distribute', alloc: { L13: 40 } });
    eq(rodHeals(s), [40]); eq(L(s, 1, 3).damage, 10);
    eq(s.pending.purpose, 'target'); eq(s.pending.options, ['L03'], 'one opposing leader: still asked');
    s = XS.apply(s, { type: 'choose', ids: ['L03'] });
    eq(L(s, 0, 3).damage, 40);
  });

  test('BP02-076 Drain Rod: 30 healed deals 30, which downs an opposing leader with 20 HP left', () => {
    let s = rod((h, t) => { h.damage(1, 0, 30); h.damage(0, 2, left(t, 0, 2, 20)); });
    s = fx.play(s, 'BP02-076');
    s = XS.apply(s, { type: 'distribute', alloc: { L10: 40 } });
    s = XS.apply(s, { type: 'choose', ids: ['L02'] });
    ok(L(s, 0, 2).down, '30 damage on a leader with 20 HP left downs it');
    eq(find(s, 'down', (e) => e.data.leader === 'L02').length, 1);
  });

  test('BP02-078 Thief Kit (equipment): the equipped leader draws 1 when the attacked leader is down - once per turn, and a non-down attack does not use it up (FAQ #63)', () => {
    let s = game([], { tacs: ['BP02-078'] });
    s = fx.arrange(s, (h, t) => {
      h.equip(0, 2, 'BP02-078');
      h.hand(0, [PLAIN, PLAIN, PLAIN, PLAIN]);
      h.damage(1, 1, left(t, 1, 1, 30)); h.damage(1, 2, left(t, 1, 2, 30)); h.damage(1, 3, left(t, 1, 3, 30));
    });
    const kit = () => P(s, 0).leaders[2].equipment[0];
    const kitDraws = (t) => find(t, 'draw', (e) => e.data.cause === 'effect' && e.via === kit()).length;
    s = fx.attack(s, PLAIN, 2, 0);
    ok(!L(s, 1, 0).down);
    eq(kitDraws(s), 0, 'the attacked leader is not down: nothing drawn, nothing used up (FAQ #63)');
    s = fx.attack(s, PLAIN, 2, 1);
    ok(L(s, 1, 1).down);
    eq(kitDraws(s), 1, 'equipped leader downs a leader -> draw 1');
    s = fx.settleWithFirst(s);
    s = fx.attack(s, PLAIN, 2, 2);
    ok(L(s, 1, 2).down);
    eq(kitDraws(s), 1, 'a second down in the same turn: once per turn');
    // the grant belongs to the equipped leader only: another leader downing a target draws nothing from the kit
    let t = game([], { tacs: ['BP02-078'] });
    t = fx.arrange(t, (h, t2) => { h.equip(0, 2, 'BP02-078'); h.hand(0, [PLAIN]); h.damage(1, 1, left(t2, 1, 1, 30)); });
    t = fx.attack(t, PLAIN, 3, 1);
    ok(L(t, 1, 1).down);
    eq(find(t, 'draw', (e) => e.data.cause === 'effect' && e.via === P(t, 0).leaders[2].equipment[0]).length, 0, 'slot 3 is not equipped');
  });
})();
