// One behaviour test per BP04 card number used by a registered deck (data/abilities-bp04.js). Same rules as
// tests/20-cards.js: a real game state, the card played through XS.apply, the side effect asserted, and a
// single-candidate case for every targeted effect (CLAUDE.md rule 4). Positions: tests/05-fixtures.js.
(function () {
  const XS = globalThis.XS;
  const { test, eq, ok, throws } = XS.T;
  const fx = XS.T.fx;
  const P = (s, seat) => s.players[seat];
  const L = (s, seat, slot) => s.players[seat].leaders[slot];
  const find = (s, type, pred) => s.log.filter((e) => e.type === type && (!pred || pred(e)));
  const lastAttack = (s) => find(s, 'attack').slice(-1)[0].data;
  const drawsBy = (s, iid) => find(s, 'draw', (e) => e.data.cause === 'effect' && e.via === iid).length;
  const idsOf = (s, nos, zone) => nos.map((n) => fx.idOf(s, 0, n, [zone]));
  const nameOf = (s, iid) => s.cards[iid].id;
  const FLAT = 'ST01-008';    // cost 1, 30 damage with no bonus of its own (its After Attack only fires on a down)
  const PLAIN = 'ST01-011';   // Cool Head: cost 1, +10

  // Seat 0 plays ST01 (L00 blue, L01 blue, L02 green, L03 green) extended with BP04 copies `main` ([no, qty]) and tactics `tacs`; seat 1 plays ST02.
  const game = (main, tacs, o) => fx.start(Object.assign({ decks: [fx.deckWith('ST01', main, tacs), 'ST02'], pick: [tacs && tacs[0] ? tacs[0] : null, null] }, o));
  // Seat 0 plays ST02 (L00 red, L01 red, L02 yellow, L03 yellow) extended with `main`; seat 1 plays ST01.
  const gameRed = (main) => fx.start({ decks: [fx.deckWith('ST02', main), 'ST01'] });
  // Seat 1 holds the tactics card `no` (the first player cannot play a tactics card on turn 1, FAQ #49) and it is seat 1's main phase.
  function tactical(no, prep) {
    let s = fx.start({ decks: ['ST02', fx.deckWith('ST01', [], [no])], pick: [null, no] });
    s = fx.toTurnOf(s, 1);
    return prep ? fx.arrange(s, prep) : s;
  }

  // ============================== leaders: 【覚醒時】 ==============================
  // Seat 0's leader `slot` is the BP04 leader; it attacks L10 with 10 HP left, so it goes down and the attacker awakens.
  const leaderDeck = (no, slot) => {
    const leaders = ['ST01-001', 'ST01-002', 'ST01-003', 'ST01-004'];
    leaders[slot] = no;
    return Object.assign({}, XS.DECKS.ST01, { leaders });
  };
  function awakenScenario(no, slot, prep) {
    let s = fx.start({ decks: [leaderDeck(no, slot), 'ST02'] });
    s = fx.arrange(s, (h, t) => {
      h.hand(0, [PLAIN]);
      h.damage(1, 0, XS.leaderStats(t, 1, 0).hp - 10);
      if (prep) prep(h, t);
    });
    return fx.attack(s, PLAIN, slot, 0);
  }

  test('BP04-001 うぉっか [On Awaken] draws 1 card when it awakens', () => {
    const s = awakenScenario('BP04-001', 0);
    ok(L(s, 0, 0).awakened, 'awakened');
    eq(s.pending, null, 'nothing to choose');
    eq(P(s, 0).hand.length, 1, 'the played card left the hand, then 1 card drawn');
    const d = find(s, 'draw', (e) => e.data.cause === 'effect');
    eq(d.length, 1); eq(d[0].via, 'L00', 'attributed to the leader');
    // negative: another leader awakening does not run this leader's effect
    const t = awakenScenario('BP04-001', 0, null);
    eq(find(t, 'draw', (e) => e.data.cause === 'effect').length, 1);
    let u = fx.start({ decks: [leaderDeck('BP04-001', 0), 'ST02'] });
    u = fx.arrange(u, (h, st) => { h.hand(0, [PLAIN]); h.damage(1, 0, XS.leaderStats(st, 1, 0).hp - 10); });
    u = fx.attack(u, PLAIN, 1, 0);
    eq(find(u, 'draw', (e) => e.data.cause === 'effect').length, 0, 'L01 awakened, not the BP04 leader: no draw');
  });

  for (const [no, slot, name] of [['BP04-002', 0, '昏昏アリア'], ['BP04-008', 1, '夜乃くろむ']]) {
    test(`${no} ${name} [On Awaken] heals 1 of your leaders by 20 (any leader that is not down, even undamaged); one candidate is still asked`, () => {
      let s = awakenScenario(no, slot, (h) => h.damage(0, 2, 50));
      eq(s.pending.purpose, 'heal'); eq(s.pending.seat, 0);
      eq(s.pending.options, ['L00', 'L01', 'L02', 'L03'], 'undamaged leaders are legal choices (FAQ #133)');
      ok(/heal 20/.test(s.pending.prompt), s.pending.prompt);
      s = fx.choose(s, ['L02']);
      eq(L(s, 0, 2).damage, 30);
      eq(find(s, 'heal')[0].data, { leader: 'L02', amount: 20, requested: 20 });
      let t = awakenScenario(no, slot, (h) => { for (const k of [0, 1, 2, 3]) if (k !== slot) h.down(0, k); });
      eq(t.pending.options, [`L0${slot}`], 'a single candidate is still a question');
      t = fx.choose(t, [`L0${slot}`]);
      eq(find(t, 'heal')[0].data.amount, 0, 'healing an undamaged leader removes nothing (R-017)');
    });
  }

  for (const [no, slot, amount, name] of [['BP04-006', 0, 20, '白波らむね'], ['BP04-012', 1, 20, 'とおこ'], ['BP04-013', 2, 10, '乾伸一郎']]) {
    test(`${no} ${name} [On Awaken] deals ${amount} damage to 1 opposing leader of your choice; one candidate is still asked`, () => {
      let s = awakenScenario(no, slot);
      ok(L(s, 0, slot).awakened);
      eq([s.pending.kind, s.pending.purpose, s.pending.seat], ['choose', 'target', 0]);
      eq(s.pending.options, ['L11', 'L12', 'L13'], 'the leader just downed is not a candidate');
      ok(new RegExp(`${amount} damage`).test(s.pending.prompt), s.pending.prompt);
      s = fx.choose(s, ['L12']);
      eq([L(s, 1, 1).damage, L(s, 1, 2).damage, L(s, 1, 3).damage], [0, amount, 0]);
      let t = awakenScenario(no, slot, (h) => { h.down(1, 2); h.down(1, 3); });
      eq(t.pending.options, ['L11'], 'exactly one candidate');
      t = fx.choose(t, ['L11']);
      eq(L(t, 1, 1).damage, amount, 'still asked, then dealt');
    });
  }

  // ============================== attack cards ==============================
  test('BP04-018 1TAP [After Attack]: draw 1 card, then discard 1 card from your hand (asked, face down) even when the drawn card is the only one', () => {
    let s = game([['BP04-018', 4]]);
    s = fx.arrange(s, (h) => { h.hand(0, ['BP04-018']); h.top(0, ['ST01-014']); });
    eq(XS.costToPlay(s, fx.idOf(s, 0, 'BP04-018', ['hand'])), 1);
    s = fx.attack(s, 'BP04-018', 0, 0);
    eq(P(s, 0).hand.length, 1, 'drew 1');
    eq(s.pending.purpose, 'discard'); eq(s.pending.options.length, 1, 'one candidate, still asked');
    eq([s.pending.min, s.pending.max], [1, 1]);
    const trash = P(s, 0).trash.length;
    s = fx.choose(s, [fx.idOf(s, 0, 'ST01-014', ['hand'])]);
    eq(P(s, 0).hand.length, 0); eq(P(s, 0).trash.length, trash + 1);
    ok(XS.view(s, 0).players[0].trash.at(-1).hidden === true, 'face down');
    eq(find(s, 'discard')[0].data.cause, 'effect');
  });

  test('BP04-020 ワールドクラス [Attack] Damage -20: costs 0, deals ATK 30 - 20 = 10; it lowers the sum of the other bonuses (a +60 boost gives 70), floor 0 (R-016)', () => {
    let s = game([['BP04-020', 4], ['BP04-058', 4]]);
    s = fx.arrange(s, (h) => h.hand(0, ['BP04-020', 'BP04-058']));
    eq(XS.costToPlay(s, fx.idOf(s, 0, 'BP04-020', ['hand'])), 0);
    const a = fx.attack(s, 'BP04-020', 0, 0);
    eq(lastAttack(a).damage, 10); eq(L(a, 1, 0).damage, 10);
    let b = fx.play(s, 'BP04-058');
    b = fx.attack(b, 'BP04-020', 0, 0);
    eq(lastAttack(b).damage, 30 + 60 - 20, 'ATK 30 + boost 60 - 20');
    // a lower ATK than 20 cannot happen with real leaders; the floor itself is covered by tests/15-ops.js
  });

  test('BP04-024 オーバードライブ [Attack]: reveal up to 2 hand cards and discard them; +30 per attack card, draw 2 per memoria discarded (FAQ #108, #124); revealing none is allowed', () => {
    let s = game([['BP04-024', 4]]);
    s = fx.arrange(s, (h) => h.hand(0, ['BP04-024', PLAIN, 'ST01-013', 'ST01-014']));
    eq(XS.costToPlay(s, fx.idOf(s, 0, 'BP04-024', ['hand'])), 1);
    s = fx.attack(s, 'BP04-024', 0, 0);
    const a = fx.idOf(s, 0, PLAIN, ['hand']), m1 = fx.idOf(s, 0, 'ST01-013', ['hand']), m2 = fx.idOf(s, 0, 'ST01-014', ['hand']);
    eq([s.pending.purpose, s.pending.seat, s.pending.min, s.pending.max], ['reveal', 0, 0, 2]);
    eq(s.pending.options.slice().sort(), [a, m1, m2].sort(), 'the three other hand cards');
    throws(() => fx.choose(s, [a, m1, m2]), 'at most 2', XS.Illegal);
    // one attack card + one memoria: +30, draw 2
    const t = fx.choose(s, [a, m1]);
    eq(lastAttack(t).damage, 30 + 30, 'ATK 30 + 30 for the attack card');
    eq(drawsBy(t, find(t, 'play')[0].data.iid), 2, 'one memoria: 2 cards');
    eq(P(t, 0).hand.length, 1 + 2, 'two discarded, two drawn, one card kept');
    ok(fx.has(t, 0, 'trash', PLAIN) && fx.has(t, 0, 'trash', 'ST01-013'), 'both went to the trash');
    ok(find(t, 'look', (e) => e.data.phase === 'reveal' && e.data.from === 'hand').length === 1, 'revealed to everybody');
    // two memoria: no bonus, draw 4
    const u = fx.choose(s, [m1, m2]);
    eq(lastAttack(u).damage, 30); eq(drawsBy(u, find(u, 'play')[0].data.iid), 4);
    // none: the card still attacks for plain ATK, nothing discarded or drawn
    const v = fx.choose(s, []);
    eq(lastAttack(v).damage, 30); eq(drawsBy(v, find(v, 'play')[0].data.iid), 0); eq(P(v, 0).hand.length, 3);
    // two attack cards: +60
    let w = game([['BP04-024', 4]]);
    w = fx.arrange(w, (h) => h.hand(0, ['BP04-024', PLAIN, 'ST01-009']));
    w = fx.attack(w, 'BP04-024', 0, 0);
    w = fx.choose(w, w.pending.options);
    eq(lastAttack(w).damage, 30 + 60); eq(drawsBy(w, find(w, 'play')[0].data.iid), 0);
  });

  test('BP04-028 シンクロトリニティ [After Attack]: look at the top 3; you may reveal 1 non-ACE card with cost 0 and add it to your hand; the rest go to the trash (FAQ #119)', () => {
    const run = (top, answerFn, withAce) => {
      const body = () => {
        let s = game([['BP04-028', 4], ['BP04-020', 4], ['BP04-056', 4], ['BP04-053', 4]].concat(withAce ? [['T-ACE0', 4]] : []));
        s = fx.arrange(s, (h) => { h.hand(0, ['BP04-028']); h.top(0, top); });
        const deck = P(s, 0).deck.length, trash = P(s, 0).trash.length;
        s = fx.attack(s, 'BP04-028', 0, 0);
        return answerFn(s, deck, trash);
      };
      return withAce ? fx.withCards([{ id: 'T-ACE0', type: 'memoria', cost: 0, ace: true, effects: [] }], body) : body();
    };
    // two cost-0 candidates among three: only they are offered, with an explicit decline
    run(['BP04-020', PLAIN, 'BP04-056'], (s, deck, trash) => {
      eq(XS.costToPlay(s, find(s, 'play')[0].data.iid), 1);
      eq([s.pending.purpose, s.pending.to, s.pending.min, s.pending.max], ['look', 'hand', 0, 1]);
      eq(s.pending.options.map((i) => nameOf(s, i)).sort(), ['BP04-020', 'BP04-056']);
      const mine = XS.view(s, 0), theirs = XS.view(s, 1);
      ok(s.pending.options.every((i) => mine.cards[i] !== undefined) && theirs.pending.options.length === 0, 'only the chooser sees the options');
      const pick = s.pending.options.find((i) => nameOf(s, i) === 'BP04-056');
      const t = fx.choose(s, [pick]);
      ok(P(t, 0).hand.includes(pick), 'added to the hand');
      eq(P(t, 0).deck.length, deck - 3, 'all three left the deck'); eq(P(t, 0).trash.length, trash + 2, 'the other two are in the trash');
      eq(find(t, 'look', (e) => e.data.phase === 'take')[0].data.revealed, true, 'the taken card is revealed');
      eq(XS.view(t, 1).log.find((e) => e.type === 'look' && e.data.phase === 'take').data.cardIds, ['BP04-056'], 'the opponent sees which one');
      const no = fx.choose(s, []);
      eq(P(no, 0).hand.length, 0, 'declined: nothing added'); eq(P(no, 0).trash.length, trash + 3, 'all three trashed');
    });
    // a single candidate is still asked
    run([PLAIN, 'BP04-053', 'ST01-012'], (s, deck, trash) => {
      eq(s.pending.options.map((i) => nameOf(s, i)), ['BP04-053'], 'one candidate');
      const t = fx.choose(s, s.pending.options);
      eq(P(t, 0).hand.length, 1); eq(P(t, 0).trash.length, trash + 2);
    });
    // no cost-0 card among the three: nothing to choose, all three are trashed
    run([PLAIN, 'ST01-012', 'ST01-013'], (s, deck, trash) => {
      eq([s.pending.purpose, s.pending.min, s.pending.options], ['look', 0, []], 'the looked-at cards are hidden: asked with an empty pick (FAQ #95)');
      s = fx.choose(s, []);
      eq(s.pending, null);
      eq(P(s, 0).trash.length, trash + 3); eq(P(s, 0).hand.length, 0);
    });
    // an ACE with cost 0 is not a candidate (synthetic: no real ACE card costs 0)
    run(['T-ACE0', PLAIN, 'ST01-012'], (s, deck, trash) => {
      eq(s.pending.options, [], 'the ACE is not offered');
      s = fx.choose(s, []);
      eq(P(s, 0).trash.length, trash + 3);
    }, true);
  });

  test('BP04-030 シールドスラム [Attack] Damage +10: costs 1, ATK 30 + 10 = 40', () => {
    let s = game([['BP04-030', 4]]);
    s = fx.arrange(s, (h) => h.hand(0, ['BP04-030']));
    eq(XS.costToPlay(s, fx.idOf(s, 0, 'BP04-030', ['hand'])), 1);
    s = fx.attack(s, 'BP04-030', 0, 0);
    eq(lastAttack(s).damage, 40); eq(L(s, 1, 0).damage, 40);
  });

  test('BP04-037 シンリャク開始 [After Attack]: if the attacked leader is down, draw 1 card; otherwise nothing', () => {
    let s = game([['BP04-037', 4]]);
    s = fx.arrange(s, (h, t) => { h.hand(0, ['BP04-037']); h.damage(1, 0, XS.leaderStats(t, 1, 0).hp - 20); });
    eq(XS.costToPlay(s, fx.idOf(s, 0, 'BP04-037', ['hand'])), 1);
    const card037 = fx.idOf(s, 0, 'BP04-037', ['hand']);
    s = fx.attack(s, 'BP04-037', 3, 0);                  // L03 awakens afterwards (its heal is a question of its own); the card's own draw is counted by source
    ok(L(s, 1, 0).down, 'the attacked leader went down');
    eq(drawsBy(s, card037), 1, 'drew 1');
    let t = game([['BP04-037', 4]]);
    t = fx.arrange(t, (h) => h.hand(0, ['BP04-037']));
    t = fx.attack(t, 'BP04-037', 0, 0);
    ok(!L(t, 1, 0).down);
    eq(P(t, 0).hand.length, 0, 'not down: no draw'); eq(find(t, 'draw', (e) => e.data.cause === 'effect').length, 0);
    // a different leader going down does not count (FAQ #18): L10 survives, L11 is already down
    let u = game([['BP04-037', 4]]);
    u = fx.arrange(u, (h) => { h.hand(0, ['BP04-037']); h.down(1, 1); });
    u = fx.attack(u, 'BP04-037', 0, 0);
    eq(P(u, 0).hand.length, 0);
  });

  const rainbow = (main) => Object.assign({}, fx.deckWith('ST01', main), { leaders: ['ST01-001', 'ST01-003', 'ST02-001', 'ST02-003'] });
  test('BP04-038 アナイアレーション [Attack] / [After Attack]: when your leaders are all different colours: damage +30; then 30 damage to 1 other opposing leader, heal 1 of your leaders by 30, draw 1 (in that order, FAQ #126)', () => {
    const start = (prep) => {
      let s = fx.start({ decks: [rainbow([['BP04-038', 4]]), 'ST02'] });
      s = fx.arrange(s, (h, t) => { h.hand(0, ['BP04-038']); h.damage(0, 1, 40); if (prep) prep(h, t); });
      return s;
    };
    let s = start();
    eq(XS.costToPlay(s, fx.idOf(s, 0, 'BP04-038', ['hand'])), 2);
    const atk = XS.leaderStats(s, 0, 0).atk;
    s = fx.attack(s, 'BP04-038', 0, 0);
    eq(lastAttack(s).damage, atk + 30, 'ATK + 30');
    eq(s.pending.purpose, 'target'); eq(s.pending.options, ['L11', 'L12', 'L13']); ok(/30 damage/.test(s.pending.prompt), s.pending.prompt);
    eq(P(s, 0).hand.length, 0);
    s = fx.choose(s, ['L12']);
    eq(L(s, 1, 2).damage, 30);
    eq(s.pending.purpose, 'heal'); eq(s.pending.options, ['L00', 'L01', 'L02', 'L03']); ok(/heal 30/.test(s.pending.prompt), s.pending.prompt);
    eq(P(s, 0).hand.length, 0, 'the draw comes last');
    s = fx.choose(s, ['L01']);
    eq(L(s, 0, 1).damage, 10, '40 - 30');
    eq(P(s, 0).hand.length, 1, 'drew 1');
    // single candidates are still asked
    let t = start((h) => { h.down(1, 2); h.down(1, 3); h.down(0, 1); h.down(0, 2); h.down(0, 3); });
    t = fx.attack(t, 'BP04-038', 0, 0);
    eq(t.pending.options, ['L11'], 'one other opposing leader'); t = fx.choose(t, ['L11']);
    eq(L(t, 1, 1).damage, 30);
    eq(t.pending.options, ['L00'], 'one leader of ours left to heal'); t = fx.choose(t, ['L00']);
    eq(P(t, 0).hand.length, 1);
    // negative: two leaders share a colour (ST01: blue, blue, green, green): plain ATK, nothing after
    let u = game([['BP04-038', 4]]);
    u = fx.arrange(u, (h) => { h.hand(0, ['BP04-038']); h.damage(0, 1, 40); });
    u = fx.attack(u, 'BP04-038', 0, 0);
    eq(lastAttack(u).damage, XS.leaderStats(u, 0, 0).atk, 'no bonus');
    eq(u.pending, null, 'nothing after'); eq(L(u, 0, 1).damage, 40); eq(P(u, 0).hand.length, 0);
    eq(L(u, 1, 1).damage + L(u, 1, 2).damage + L(u, 1, 3).damage, 0);
  });

  test('BP04-039 大旋風 [Attack]: if the attacker is awakened, damage +10 (the attacking leader, not any leader)', () => {
    let s = game([['BP04-039', 4]]);
    s = fx.arrange(s, (h) => { h.hand(0, ['BP04-039']); h.awaken(0, 0); });
    eq(XS.costToPlay(s, fx.idOf(s, 0, 'BP04-039', ['hand'])), 1);
    const awake = XS.leaderStats(s, 0, 0).atk;
    const a = fx.attack(s, 'BP04-039', 0, 0);
    eq(lastAttack(a).damage, awake + 10, 'awakened attacker');
    const b = fx.attack(s, 'BP04-039', 1, 0);
    eq(lastAttack(b).damage, XS.leaderStats(s, 0, 1).atk, 'L01 is not awakened: no bonus, although L00 is');
    let c = game([['BP04-039', 4]]);
    c = fx.arrange(c, (h) => h.hand(0, ['BP04-039']));
    eq(lastAttack(fx.attack(c, 'BP04-039', 0, 0)).damage, 30, 'nobody awakened');
  });

  test('BP04-041 アースサーファー [After Attack] Overkill 30: draw 2 cards when the damage beat the remaining HP by 30 or more; 20 over is not enough (FAQ #44)', () => {
    const run = (over) => {
      let s = game([['BP04-041', 4]]);
      s = fx.arrange(s, (h, t) => {
        h.hand(0, ['BP04-041']); h.awaken(0, 0);
        h.damage(1, 0, XS.leaderStats(t, 1, 0).hp - (XS.leaderStats(t, 0, 0).atk - over));
      });
      const card = fx.idOf(s, 0, 'BP04-041', ['hand']);
      eq(XS.costToPlay(s, card), 1);
      return fx.attack(s, 'BP04-041', 0, 0);
    };
    const hit = run(30);
    eq(drawsBy(hit, find(hit, 'play')[0].data.iid), 2, '30 over: 2 cards'); eq(P(hit, 0).hand.length, 2);
    eq(find(hit, 'overkill')[0].data.excess, 30);
    const miss = run(20);
    eq(drawsBy(miss, find(miss, 'play')[0].data.iid), 0, '20 over: nothing'); eq(P(miss, 0).hand.length, 0);
    ok(L(miss, 1, 0).down, 'the leader went down either way');
  });

  // ============================== memoria ==============================
  test('BP04-048 入念な準備 [On Play] draw 2 cards (cost 1)', () => {
    let s = game([['BP04-048', 4]]);
    s = fx.arrange(s, (h) => h.hand(0, ['BP04-048']));
    const iid = fx.idOf(s, 0, 'BP04-048', ['hand']);
    eq(XS.costToPlay(s, iid), 1);
    s = fx.play(s, 'BP04-048');
    eq(P(s, 0).hand.length, 2); eq(drawsBy(s, iid), 2);
    ok(fx.has(s, 0, 'play', 'BP04-048'), 'in the play area'); eq(P(s, 0).boosts, [], 'no boost on this card');
  });

  test('BP04-049 なんだコイツ… [On Play] all players discard 1 card (the turn player first, each chooses their own); [Attack Boost] +50', () => {
    let s = game([['BP04-049', 4]]);
    s = fx.arrange(s, (h) => h.hand(0, ['BP04-049', FLAT, 'ST01-013']));
    const iid = fx.idOf(s, 0, 'BP04-049', ['hand']);
    eq(XS.costToPlay(s, iid), 1);
    const h1 = P(s, 1).hand.length;
    s = fx.play(s, 'BP04-049');
    eq([s.pending.seat, s.pending.purpose, s.pending.min], [0, 'discard', 1]);
    eq(s.pending.options.length, 2, 'FLAT and the memoria');
    s = fx.choose(s, [fx.idOf(s, 0, 'ST01-013', ['hand'])]);
    eq([s.pending.seat, s.pending.purpose], [1, 'discard'], 'then the opponent');
    eq(XS.view(s, 0).pending.options, [], 'the turn player cannot see the opponent\'s hand');
    s = fx.choose(s, [s.pending.options[0]]);
    eq(P(s, 0).hand.length, 1); eq(P(s, 1).hand.length, h1 - 1);
    eq(find(s, 'discard').map((e) => e.seat), [0, 1]);
    eq(P(s, 0).boosts, [iid], 'armed');
    s = fx.attack(s, FLAT, 0, 0);
    eq(lastAttack(s).parts.boost, 50); eq(lastAttack(s).damage, 80);
    // the turn player's hand holds only this card: after playing it nothing is left to discard, the opponent still discards
    let t = game([['BP04-049', 4]]);
    t = fx.arrange(t, (h) => h.hand(0, ['BP04-049']));
    t = fx.play(t, 'BP04-049');
    eq([t.pending.seat, t.pending.purpose], [1, 'discard'], 'an empty hand discards nothing and is not asked');
    t = fx.choose(t, [t.pending.options[0]]);
    eq(P(t, 0).hand.length, 0);
  });

  test('BP04-053 穏やかな一時 [On Play] heal 1 of your leaders by 10 (asked, cost 0); [Attack Boost] "+10" printed without 「次のアタック」 is the same boost (FAQ #127)', () => {
    let s = game([['BP04-053', 4]]);
    s = fx.arrange(s, (h) => { h.hand(0, ['BP04-053', FLAT]); h.damage(0, 1, 30); });
    const iid = fx.idOf(s, 0, 'BP04-053', ['hand']);
    eq(XS.costToPlay(s, iid), 0);
    s = fx.play(s, 'BP04-053');
    eq(s.pending.purpose, 'heal'); eq(s.pending.options, ['L00', 'L01', 'L02', 'L03']); ok(/heal 10/.test(s.pending.prompt), s.pending.prompt);
    s = fx.choose(s, ['L01']);
    eq(L(s, 0, 1).damage, 20);
    eq(P(s, 0).boosts, [iid]);
    s = fx.attack(s, FLAT, 0, 0);
    eq(lastAttack(s).parts.boost, 10); eq(lastAttack(s).damage, 40);
    // single candidate is still asked
    let t = game([['BP04-053', 4]]);
    t = fx.arrange(t, (h) => { h.hand(0, ['BP04-053']); h.down(0, 0); h.down(0, 2); h.down(0, 3); });
    t = fx.play(t, 'BP04-053');
    eq(t.pending.options, ['L01'], 'one leader left'); t = fx.choose(t, ['L01']);
    eq(find(t, 'heal')[0].data.amount, 0);
  });

  test('BP04-056 でからむち♪ [On Play] 20 damage to 1 opposing leader (asked, cost 0); one candidate is still asked', () => {
    let s = game([['BP04-056', 4]]);
    s = fx.arrange(s, (h) => h.hand(0, ['BP04-056']));
    eq(XS.costToPlay(s, fx.idOf(s, 0, 'BP04-056', ['hand'])), 0);
    s = fx.play(s, 'BP04-056');
    eq([s.pending.purpose, s.pending.seat], ['target', 0]); eq(s.pending.options, ['L10', 'L11', 'L12', 'L13']); ok(/20 damage/.test(s.pending.prompt), s.pending.prompt);
    s = fx.choose(s, ['L13']);
    eq([L(s, 1, 0).damage, L(s, 1, 3).damage], [0, 20]);
    eq(P(s, 0).boosts, [], 'no boost on this card');
    let t = game([['BP04-056', 4]]);
    t = fx.arrange(t, (h) => { h.hand(0, ['BP04-056']); h.down(1, 0); h.down(1, 1); h.down(1, 3); });
    t = fx.play(t, 'BP04-056');
    eq(t.pending.options, ['L12'], 'one candidate'); t = fx.choose(t, ['L12']);
    eq(L(t, 1, 2).damage, 20);
  });

  for (const [no, amount, name] of [['BP04-054', 50, '放課後補習組'], ['BP04-058', 60, '「またね」'], ['BP04-061', 50, '通過儀礼'], ['BP04-067', 50, 'リトルエンプレス'], ['BP04-069', 60, '深淵の強者たち']]) {
    test(`${no} ${name} [Attack Boost] your next attack deals +${amount} damage (cost 1), and only the next attack`, () => {
      let s = game([[no, 4]]);
      s = fx.arrange(s, (h) => h.hand(0, [no, FLAT, FLAT]));
      const iid = fx.idOf(s, 0, no, ['hand']);
      eq(XS.costToPlay(s, iid), 1);
      s = fx.play(s, no);
      eq(P(s, 0).boosts, [iid], 'armed');
      eq(s.pending, null, 'no [On Play] to answer');
      const atk = fx.idOf(s, 0, FLAT, ['hand']);
      eq(XS.previewAttack(s, { type: 'play', iid: atk, attacker: 'L00', target: 'L12' }), 30 + amount);
      s = fx.attack(s, FLAT, 0, 2);
      eq(lastAttack(s).damage, 30 + amount); eq(lastAttack(s).parts.boost, amount);
      eq(P(s, 0).boosts, [], 'consumed');
      s = fx.settleWithFirst(s);
      s = fx.attack(s, FLAT, 0, 1);
      eq(lastAttack(s).parts.boost, 0, 'the next attack gets no boost');
    });
  }

  test('BP04-065 雪降る夜に [Attack Boost] +30 if you have 3 or more memoria in your play area, counted when the boost is carried out (R-051), the card itself included', () => {
    const arm = (others, then) => {
      let s = game([['BP04-065', 4]]);
      s = fx.arrange(s, (h) => { h.hand(0, ['BP04-065', FLAT]); for (const n of others) h.give(0, n, 'play'); });
      const iid = fx.idOf(s, 0, 'BP04-065', ['hand']);
      eq(XS.costToPlay(s, iid), 0);
      s = fx.play(s, 'BP04-065');
      eq(P(s, 0).boosts, [iid]);
      if (then) s = fx.arrange(s, then);
      return fx.attack(s, FLAT, 0, 0);
    };
    eq(lastAttack(arm(['ST01-013', 'ST01-015'])).parts.boost, 30, 'this card + 2 others = 3');
    eq(lastAttack(arm(['ST01-013'])).parts.boost, 0, 'this card + 1 other = 2: no boost');
    eq(lastAttack(arm(['ST01-013'], (h) => h.give(0, 'ST01-015', 'play'))).parts.boost, 30, 'a third memoria arrived before the attack: counted then');
    eq(lastAttack(arm(['ST01-013', 'ST01-015'], (h, t) => h.trash(0, fx.idOf(t, 0, 'ST01-015', ['play'])))).parts.boost, 0, 'one left before the attack: counted then');
    // attack cards in the play area are not memoria
    eq(lastAttack(arm(['ST01-013', PLAIN])).parts.boost, 0, 'an attack card does not count');
  });

  test('BP04-066 収穫の刻 [On Play] 20 damage to 1 opposing leader (asked), then draw 1', () => {
    let s = game([['BP04-066', 4]]);
    s = fx.arrange(s, (h) => h.hand(0, ['BP04-066']));
    const iid = fx.idOf(s, 0, 'BP04-066', ['hand']);
    eq(XS.costToPlay(s, iid), 1);
    s = fx.play(s, 'BP04-066');
    eq([s.pending.purpose, s.pending.seat], ['target', 0]); eq(s.pending.options, ['L10', 'L11', 'L12', 'L13']); ok(/20 damage/.test(s.pending.prompt), s.pending.prompt);
    eq(P(s, 0).hand.length, 0, 'the draw comes after the damage');
    s = fx.choose(s, ['L11']);
    eq(L(s, 1, 1).damage, 20); eq(P(s, 0).hand.length, 1); eq(drawsBy(s, iid), 1);
    eq(P(s, 0).boosts, [iid], 'its After Attack waits for the next attack');
    let t = game([['BP04-066', 4]]);
    t = fx.arrange(t, (h) => { h.hand(0, ['BP04-066']); h.down(1, 1); h.down(1, 2); h.down(1, 3); });
    t = fx.play(t, 'BP04-066');
    eq(t.pending.options, ['L10'], 'one candidate'); t = fx.choose(t, ['L10']);
    eq(L(t, 1, 0).damage, 20);
  });

  test('BP04-066 収穫の刻 [After Attack] green attacker: you may play 1 cost-1 memoria from your hand free (FAQ #110, #111: its [On Play] resolves after the attack); a cost-2 memoria and attack cards are not offered', () => {
    let s = game([['BP04-066', 4], ['BP04-048', 4]]);
    s = fx.arrange(s, (h) => { h.hand(0, ['BP04-066', PLAIN, 'BP04-048', 'ST01-014', FLAT]); h.top(0, ['ST01-012']); });   // the card [On Play] draws is an attack card
    s = fx.play(s, 'BP04-066');
    s = fx.choose(s, ['L10']);
    const pp = P(s, 0).pp.untapped;
    const cheap = fx.idOf(s, 0, 'BP04-048', ['hand']);
    s = fx.attack(s, PLAIN, 2, 0);                       // L02 (ST01-003 Sumire Kaga) is green
    eq(XS.CARDS[L(s, 0, 2).cardId].color, 'green');
    eq(P(s, 0).pp.untapped, pp - 1, 'only the attack card is paid for');
    eq([s.pending.purpose, s.pending.min, s.pending.max], ['freePlay', 0, 1]);
    eq(s.pending.options, [cheap], 'only the cost-1 memoria (a cost-2 memoria and two attack cards are in the hand)');
    const decline = fx.choose(s, []);
    eq(decline.pending, null); ok(fx.has(decline, 0, 'hand', 'BP04-048'), 'declining plays nothing');
    const t = fx.choose(s, [cheap]);
    eq(P(t, 0).play.slice(-1)[0], cheap, 'far right of the play area');
    eq(P(t, 0).pp.untapped, pp - 1, 'no PP for the free card');
    eq(find(t, 'freePlay')[0].data.type, 'memoria');
    eq(drawsBy(t, cheap), 2, 'its [On Play] resolved');
    ok(find(t, 'ability', (e) => e.data.src === cheap)[0] !== undefined);
    // nothing to offer: no question
    let u = game([['BP04-066', 4]]);
    u = fx.arrange(u, (h) => { h.hand(0, ['BP04-066', PLAIN, 'ST01-014', FLAT]); h.top(0, ['ST01-012']); });
    u = fx.play(u, 'BP04-066'); u = fx.choose(u, ['L10']);
    u = fx.attack(u, PLAIN, 2, 0);
    eq([u.pending.purpose, u.pending.min, u.pending.options], ['freePlay', 0, []], 'no cost-1 memoria in hand: still asked, nothing to pick (hand is hidden, FAQ #4)');
    eq(fx.choose(u, []).pending, null);
  });

  test('BP04-066 収穫の刻 [After Attack] red attacker: you may play 1 cost-1 attack card from your hand free (a full attack afterwards, FAQ #131); a cost-2 attack and memoria are not offered', () => {
    let s = gameRed([['BP04-066', 4]]);
    s = fx.arrange(s, (h) => { h.hand(0, ['BP04-066', 'ST02-007', 'ST02-008', 'ST02-011', 'ST02-014']); h.top(0, ['ST02-011']); });
    s = fx.play(s, 'BP04-066'); s = fx.choose(s, ['L10']);
    const free = fx.idOf(s, 0, 'ST02-008', ['hand']);
    s = fx.attack(s, 'ST02-007', 0, 0);                  // L00 (ST02-001 Selly) is red
    eq(XS.CARDS[L(s, 0, 0).cardId].color, 'red');
    eq([s.pending.purpose, s.pending.min, s.pending.max], ['freePlay', 0, 1]);
    eq(s.pending.options, [free], 'only the cost-1 attack card');
    const decline = fx.choose(s, []);
    eq(decline.pending, null); eq(find(decline, 'attack').length, 1);
    s = fx.choose(s, [free]);
    eq(s.pending.kind, 'attackPair', 'the free attack asks for its attacker and target');
    eq(find(s, 'attack').length, 1, 'the first attack is over');
    s = XS.apply(s, { type: 'attack', attacker: 'L01', target: 'L11' });
    eq(find(s, 'attack').length, 2); eq(lastAttack(s).damage, 30);
    eq(find(s, 'ppSpend').length, 2, 'the memoria and the first attack card were paid for, the free attack card was not');
    // blue and yellow attackers get nothing
    let b = game([['BP04-066', 4], ['BP04-048', 4]]);
    b = fx.arrange(b, (h) => { h.hand(0, ['BP04-066', PLAIN, 'BP04-048', FLAT]); h.top(0, ['ST01-012']); });
    b = fx.play(b, 'BP04-066'); b = fx.choose(b, ['L10']);
    b = fx.attack(b, PLAIN, 0, 0);
    eq(b.pending, null, 'blue attacker: neither branch applies');
    let y = gameRed([['BP04-066', 4]]);
    y = fx.arrange(y, (h) => h.hand(0, ['BP04-066', 'ST02-007', 'ST02-008', 'ST02-014']));
    y = fx.play(y, 'BP04-066'); y = fx.choose(y, ['L10']);
    y = fx.attack(y, 'ST02-007', 2, 0);
    eq(XS.CARDS[L(y, 0, 2).cardId].color, 'yellow');
    eq(y.pending, null, 'yellow attacker: neither branch applies');
  });

  // ============================== tactics ==============================
  test('BP04-076 アイテムショップ [On Play] put every face-down card in your trash into the deck, shuffle, then draw 2 (cost 0, no tactics penalty R-019); playable with an empty trash (FAQ #128)', () => {
    let s = tactical('BP04-076', (h, t) => { for (const i of t.players[1].deck.slice(0, 3)) h.trash(1, i); });
    const iid = fx.idOf(s, 1, 'BP04-076', ['tarea']);
    eq(XS.costToPlay(s, iid), 0);
    const down = P(s, 1).trash.filter((i) => s.cards[i].kind !== 'tactics').length;
    eq(down, 3);
    const deck = P(s, 1).deck.length, hand = P(s, 1).hand.length;
    s = fx.play(s, 'BP04-076');
    eq(P(s, 1).trash.filter((i) => s.cards[i].kind !== 'tactics').length, 0, 'no face-down card left in the trash');
    eq(P(s, 1).deck.length, deck + 3 - 2, 'three came back, two were drawn');
    eq(P(s, 1).hand.length, hand + 2); eq(drawsBy(s, iid), 2);
    eq(find(s, 'reshuffle').length, 1, 'shuffled'); eq(find(s, 'tacticsBurn').length, 0, 'no penalty');
    ok(fx.has(s, 1, 'play', 'BP04-076'), 'face up in the play area');
    // empty trash: still playable, still draws 2
    let t = tactical('BP04-076');
    eq(P(t, 1).trash.length, 0);
    const h2 = P(t, 1).hand.length;
    t = fx.play(t, 'BP04-076');
    eq(P(t, 1).hand.length, h2 + 2); eq(find(t, 'tacticsBurn').length, 0);
  });

  test('BP04-079 討伐クエスト [On Play] look at the top 7 cards, add 1 of them to your hand (not optional), the rest go to the trash face down (FAQ #117)', () => {
    const seven = ['ST01-006', 'ST01-007', 'ST01-008', 'ST01-009', 'ST01-010', 'ST01-011', 'ST01-012'];
    let s = tactical('BP04-079', (h) => h.top(1, seven));
    const iid = fx.idOf(s, 1, 'BP04-079', ['tarea']);
    eq(XS.costToPlay(s, iid), 0);
    const deck = P(s, 1).deck.length, trash = P(s, 1).trash.length, hand = P(s, 1).hand.length;
    s = fx.play(s, 'BP04-079');
    eq([s.pending.purpose, s.pending.to, s.pending.seat, s.pending.min, s.pending.max], ['look', 'hand', 1, 1, 1]);
    eq(s.pending.options.map((i) => nameOf(s, i)), seven, 'all seven are candidates');
    eq(XS.view(s, 0).pending.options, [], 'the opponent cannot see them');
    throws(() => fx.choose(s, []), 'adding a card is not optional', XS.Illegal);
    throws(() => fx.choose(s, s.pending.options.slice(0, 2)), 'only one', XS.Illegal);
    const pick = s.pending.options[3];
    s = fx.choose(s, [pick]);
    ok(P(s, 1).hand.includes(pick), 'in hand'); eq(P(s, 1).hand.length, hand + 1);
    eq(P(s, 1).deck.length, deck - 7); eq(P(s, 1).trash.filter((i) => s.cards[i].kind !== 'tactics').length, trash + 6, 'six trashed');
    ok(!JSON.stringify(XS.view(s, 0)).includes('"' + pick + '"'), 'the opponent\'s view never names the taken card');
    eq(XS.view(s, 0).log.filter((e) => e.type === 'look').map((e) => e.data.phase), ['see', 'take', 'trash']);
  });

  test('BP04-080 呪いの人形 [On Play] your opponent discards 1 card from their hand (they choose, face down); [Attack Boost] +40', () => {
    let s = tactical('BP04-080', (h) => h.hand(1, [FLAT]));
    const iid = fx.idOf(s, 1, 'BP04-080', ['tarea']);
    eq(XS.costToPlay(s, iid), 0);
    const opp = P(s, 0).hand.length;
    s = fx.play(s, 'BP04-080');
    eq([s.pending.seat, s.pending.purpose, s.pending.min, s.pending.max], [0, 'discard', 1, 1]);
    eq(XS.whoActs(s), 0);
    eq(XS.view(s, 1).pending.options, [], 'the player of the card does not see the opponent\'s hand');
    s = fx.choose(s, [s.pending.options[0]]);
    eq(P(s, 0).hand.length, opp - 1); eq(find(s, 'discard')[0].seat, 0);
    eq(P(s, 1).boosts, [iid], 'armed');
    s = fx.attack(s, FLAT, 0, 0);
    eq(lastAttack(s).parts.boost, 40); eq(lastAttack(s).damage, 70);
    // an empty hand: nothing to discard, nobody is asked, the boost still arms
    let t = tactical('BP04-080', (h, st) => { h.hand(1, [FLAT]); for (const i of st.players[0].hand.slice()) h.trash(0, i); });
    eq(P(t, 0).hand.length, 0);
    t = fx.play(t, 'BP04-080');
    eq(t.pending, null); eq(find(t, 'fizzle').length, 1); eq(P(t, 1).boosts.length, 1);
  });

  // ============================== review fixes (2026-10-30): hidden pools always ask, one fizzle ==============================
  // What the OTHER seat is shown: its view of the pending decision and of the whole log. Two positions that differ only in a hidden card must give
  // the same string (FAQ #95, #4; CLAUDE.md rule 7).
  const oppSees = (s) => { const v = XS.view(s, 1); return JSON.stringify({ pending: v.pending, log: v.log }); };

  test('BP04-066 収穫の刻 (FAQ #4, rule 7): the free-play question is asked whether or not the hand holds an eligible card, so the opponent\'s view and log are the same', () => {
    const run = (extra) => {
      let s = gameRed([['BP04-066', 4]]);
      s = fx.arrange(s, (h) => { h.hand(0, ['BP04-066', 'ST02-007', extra]); h.top(0, ['ST02-011']); });
      s = fx.play(s, 'BP04-066'); s = fx.choose(s, ['L10']);
      return fx.attack(s, 'ST02-007', 0, 0);                  // L00 is red: the attack-card branch
    };
    const yes = run('ST02-008'), no = run('ST02-011');      // a cost-1 attack card in hand / only a cost-2 attack card
    eq(yes.pending.options.length, 1);
    eq(oppSees(no), oppSees(yes), 'the other seat cannot tell the two hands apart');
    eq([no.pending.purpose, no.pending.seat, no.pending.min, no.pending.max], ['freePlay', 0, 0, 1]);
    eq(no.pending.options, [], 'the owner is asked with nothing to pick');
    eq(XS.legalActions(no), [{ type: 'choose', ids: [] }]);
    const t = fx.choose(no, []);
    eq(t.pending, null); eq(find(t, 'freePlay').length, 0);
    eq(oppSees(fx.choose(yes, [])), oppSees(t), 'declining a real candidate looks the same afterwards');
  });

  test('BP04-028 シンクロトリニティ (FAQ #95, rule 7): the pick from the looked-at cards is asked whether or not a cost-0 card is among them', () => {
    const run = (top) => {
      let s = game([['BP04-028', 4], ['BP04-020', 4], ['BP04-056', 4]]);
      s = fx.arrange(s, (h) => { h.hand(0, ['BP04-028']); h.top(0, top); });
      return fx.attack(s, 'BP04-028', 0, 0);
    };
    const yes = run(['BP04-020', PLAIN, 'ST01-012']), no = run([PLAIN, 'ST01-012', 'ST01-013']);
    eq(oppSees(no), oppSees(yes), 'the other seat cannot tell the two decks apart');
    eq([no.pending.purpose, no.pending.to, no.pending.min, no.pending.max, no.pending.options], ['look', 'hand', 0, 1, []]);
    const t = fx.choose(no, []);
    eq(t.pending, null); eq(P(t, 0).hand.length, 0); eq(find(t, 'look', (e) => e.data.phase === 'trash')[0].data.n, 3, 'all three go to the trash');
  });

  test('BP04-049 なんだコイツ… (R-072): playing it as the last card logs exactly one fizzle for the empty hand, however often the op re-runs', () => {
    let s = game([['BP04-049', 4]]);
    s = fx.arrange(s, (h) => { h.hand(0, ['BP04-049']); h.hand(1, ['ST02-007', 'ST02-008']); });
    const seq = s.seq;
    s = fx.play(s, 'BP04-049');
    eq([s.pending.seat, s.pending.purpose], [1, 'discard'], 'only the opponent is asked');
    s = fx.choose(s, [s.pending.options[0]]);
    eq(s.log.filter((e) => e.seq >= seq && e.type === 'fizzle').length, 1, 'one fizzle');
    eq(P(s, 1).hand.length, 1);
    // both hands empty: still one fizzle per seat and no question
    let t = game([['BP04-049', 4]]);
    t = fx.arrange(t, (h) => { h.hand(0, ['BP04-049']); h.hand(1, []); });
    const seq2 = t.seq;
    t = fx.play(t, 'BP04-049');
    eq(t.pending, null); eq(t.log.filter((e) => e.seq >= seq2 && e.type === 'fizzle').length, 2, 'one for each empty hand');
  });
})();
