// One behaviour test per card number in data/cards.js (50). Each puts the card in a real game state, plays it through XS.apply and
// asserts the side effect (damage numbers, draws, heals, downs, PP). Every targeted effect also gets its single-candidate case to
// prove nothing is auto-picked (CLAUDE.md rule 4). Positions: tests/05-fixtures.js (door-based arrangements only).
(function () {
  const XS = globalThis.XS;
  const { test, eq, ok, throws } = XS.T;
  const fx = XS.T.fx;
  const P = (s, seat) => s.players[seat];
  const L = (s, seat, slot) => s.players[seat].leaders[slot];
  const find = (s, type, pred) => s.log.filter((e) => e.type === type && (!pred || pred(e)));
  const other = (deck) => (deck === 'ST01' ? 'ST02' : 'ST01');
  // a cheap attack with no effect of its own: Cool Head adds 10 (so ST01 is 40), Impact Shot adds 40 (cost 2)
  const PLAIN = { ST01: 'ST01-011', ST02: 'ST02-007' };
  // an attack with no damage bonus whose After Attack only fires on a down (cost 1)
  const FLAT = { ST01: 'ST01-008', ST02: 'ST02-008' };

  // Seat 0 (team `deck`) attacks with leader `slot`; the attacked leader L10 has 10 HP left, so it goes down and the attacker awakens.
  function awakenScenario(deck, slot, prep) {
    let s = fx.start({ decks: [deck, other(deck)] });
    s = fx.arrange(s, (h, t) => {
      h.hand(0, [PLAIN[deck]]);
      h.damage(1, 0, XS.leaderStats(t, 1, 0).hp - 10);
      if (prep) prep(h, t);
    });
    return fx.attack(s, PLAIN[deck], slot, 0);
  }
  const alive = (s, seat) => XS.aliveLeaders(s, seat);

  // ============================== leaders: 【覚醒時】 ==============================
  for (const [no, deck, slot, name] of [['ST01-001', 'ST01', 0, 'Uruha Ichinose'], ['ST02-003', 'ST02', 2, 'Cpt']]) {
    test(`${no} ${name} [On Awaken] draws 1 card when it awakens`, () => {
      const s = awakenScenario(deck, slot);
      ok(L(s, 0, slot).awakened, 'awakened');
      eq(s.pending, null, 'no decision, nothing to choose');
      eq(P(s, 0).hand.length, 1, 'the played card left the hand, then 1 card drawn');
      eq(find(s, 'draw', (e) => e.data.cause === 'effect').length, 1);
      eq(find(s, 'draw', (e) => e.data.cause === 'effect')[0].via, `L0${slot}`, 'the draw is attributed to the leader');
    });
  }

  for (const [no, deck, slot, name] of [['ST01-002', 'ST01', 1, 'Toto Kogara'], ['ST02-001', 'ST02', 0, 'Selly']]) {
    test(`${no} ${name} [On Awaken] deals 10 damage to 1 opposing leader of your choice; one candidate is still asked`, () => {
      let s = awakenScenario(deck, slot);
      ok(L(s, 0, slot).awakened);
      eq(s.pending.kind, 'choose'); eq(s.pending.purpose, 'target'); eq(s.pending.seat, 0);
      eq(s.pending.options, ['L11', 'L12', 'L13'], 'the leader just downed is not a candidate');
      ok(/10 damage/.test(s.pending.prompt), s.pending.prompt);
      eq(s.pending.source, `L0${slot}`);
      s = fx.choose(s, ['L12']);
      eq([L(s, 1, 1).damage, L(s, 1, 2).damage, L(s, 1, 3).damage], [0, 10, 0]);
      // single candidate
      let t = awakenScenario(deck, slot, (h) => { h.down(1, 2); h.down(1, 3); });
      eq(t.pending.options, ['L11'], 'exactly one candidate');
      ok(t.pending !== null, 'still asks with one candidate (rule 4)');
      t = fx.choose(t, ['L11']);
      eq(L(t, 1, 1).damage, 10);
    });
  }

  for (const [no, deck, slot, name] of [['ST01-003', 'ST01', 2, 'Sumire Kaga'], ['ST02-004', 'ST02', 3, 'Ras']]) {
    test(`${no} ${name} [On Awaken] deals 10 damage to every opposing leader that is not down, without asking`, () => {
      const s = awakenScenario(deck, slot, (h) => h.down(1, 3));
      eq(s.pending, null, '"every" asks nothing');
      eq([L(s, 1, 1).damage, L(s, 1, 2).damage], [10, 10]);
      ok(L(s, 1, 3).down && L(s, 1, 3).damage === 0, 'the leader that was already down takes nothing');
      ok(L(s, 1, 0).down, 'the attacked leader went down by the attack');
    });
  }

  for (const [no, deck, slot, name] of [['ST01-004', 'ST01', 3, 'Nazuna Kaga'], ['ST02-002', 'ST02', 1, 'Mondo']]) {
    test(`${no} ${name} [On Awaken] heals 1 of your leaders by 20 (any leader that is not down, even undamaged); one candidate is still asked`, () => {
      let s = awakenScenario(deck, slot, (h) => h.damage(0, 2, 50));
      eq(s.pending.purpose, 'heal');
      eq(s.pending.options, ['L00', 'L01', 'L02', 'L03'], 'undamaged leaders are legal choices (FAQ #133)');
      s = fx.choose(s, ['L02']);
      eq(L(s, 0, 2).damage, 30);
      eq(find(s, 'heal')[0].data, { leader: 'L02', amount: 20, requested: 20 });
      let t = awakenScenario(deck, slot, (h) => { for (const k of [0, 1, 2, 3]) if (k !== slot) h.down(0, k); });
      eq(t.pending.options, [`L0${slot}`], 'a single candidate is still a question');
      t = fx.choose(t, [`L0${slot}`]);
      eq(find(t, 'heal')[0].data.amount, 0, 'healing an undamaged leader removes nothing (R-017)');
    });
  }

  // ============================== attack cards ==============================
  test('ST01-005 Crossfire [Attack]: all your leaders have "VSPO!" -> the attacked leader goes down (a down by the attack: the attacker awakens); a leader with another tag stops it', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => h.hand(0, ['ST01-005']));
    const iid = fx.idOf(s, 0, 'ST01-005', ['hand']);
    eq(XS.costToPlay(s, iid), 3);
    eq(XS.previewAttackDetail(s, { type: 'play', iid, attacker: 'L00', target: 'L10' }).goesDown, true);
    s = fx.attack(s, 'ST01-005', 0, 0);
    ok(L(s, 1, 0).down, 'down although it took only 30');
    s = fx.settleWithFirst(s);
    ok(L(s, 0, 0).awakened);
    // a mixed team: three VSPO! leaders and one CR leader
    const mixed = Object.assign({}, XS.DECKS.ST01, { leaders: ['ST01-001', 'ST01-002', 'ST01-003', 'ST02-001'] });
    let t = fx.start({ decks: [mixed, 'ST02'] });
    t = fx.arrange(t, (h) => h.hand(0, ['ST01-005']));
    eq(XS.previewAttackDetail(t, { type: 'play', iid: fx.idOf(t, 0, 'ST01-005', ['hand']), attacker: 'L00', target: 'L10' }).goesDown, false);
    t = fx.attack(t, 'ST01-005', 0, 0);
    ok(!L(t, 1, 0).down && L(t, 1, 0).damage === 30, 'only the 30 damage');
    // FAQ #10: the CR leader still has its tag when it is down, so the team is still not all "VSPO!"
    let u = fx.start({ decks: [mixed, 'ST02'] });
    u = fx.arrange(u, (h) => { h.hand(0, ['ST01-005']); h.down(0, 3); });
    u = fx.attack(u, 'ST01-005', 0, 0);
    ok(!L(u, 1, 0).down, 'a downed leader with another tag still counts');
  });

  test('ST01-006 Risky Entry [After Attack]: draw 1 card, then discard 1 card from your hand (asked, face down), even with a one-card hand', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => { h.hand(0, ['ST01-006']); h.top(0, ['ST01-014']); });
    s = fx.attack(s, 'ST01-006', 0, 0);
    eq(P(s, 0).hand.length, 1, 'drew 1');
    eq(s.pending.purpose, 'discard'); eq(s.pending.options.length, 1, 'one candidate, still asked');
    eq([s.pending.min, s.pending.max], [1, 1]);
    const trash = P(s, 0).trash.length;
    s = fx.choose(s, [fx.idOf(s, 0, 'ST01-014', ['hand'])]);
    eq(P(s, 0).hand.length, 0); eq(P(s, 0).trash.length, trash + 1);
    ok(fx.has(s, 0, 'trash', 'ST01-014') && XS.view(s, 0).players[0].trash.at(-1).hidden === true, 'face down');
    eq(find(s, 'discard')[0].data.cause, 'effect');
  });

  test('ST01-007 Bounty Hunter [After Attack]: 40 damage to 1 other opposing leader (chosen; the attacked one is not a candidate; one candidate is still asked)', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => h.hand(0, ['ST01-007']));
    s = fx.attack(s, 'ST01-007', 0, 0);
    eq(s.pending.options, ['L11', 'L12', 'L13']); ok(/40 damage/.test(s.pending.prompt));
    s = fx.choose(s, ['L13']);
    eq([L(s, 1, 0).damage, L(s, 1, 3).damage], [30, 40]);
    let t = fx.start();
    t = fx.arrange(t, (h) => { h.hand(0, ['ST01-007']); h.down(1, 1); h.down(1, 2); });
    t = fx.attack(t, 'ST01-007', 0, 0);
    eq(t.pending.options, ['L13'], 'one candidate'); t = fx.choose(t, ['L13']); eq(L(t, 1, 3).damage, 40);
  });

  test('ST01-008 Winning Blow [After Attack]: if the attacked leader is down, draw 1 card; otherwise nothing', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => { h.hand(0, ['ST01-008']); h.damage(1, 0, 90); });
    s = fx.attack(s, 'ST01-008', 1, 0);       // Toto
    s = fx.settleWithFirst(s);
    eq(find(s, 'draw', (e) => e.data.cause === 'effect').length, 1, 'down -> drew');
    let t = fx.start();
    t = fx.arrange(t, (h) => h.hand(0, ['ST01-008']));
    t = fx.attack(t, 'ST01-008', 1, 0);
    eq(find(t, 'draw', (e) => e.data.cause === 'effect').length, 0, 'not down -> no draw');
    eq(P(t, 0).hand.length, 0);
  });

  test('ST01-009 Proof of Strength [After Attack]: 10 damage to 1 other opposing leader (asked)', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => h.hand(0, ['ST01-009']));
    s = fx.attack(s, 'ST01-009', 0, 0);
    eq(s.pending.options, ['L11', 'L12', 'L13']); ok(/10 damage/.test(s.pending.prompt));
    s = fx.choose(s, ['L11']);
    eq(L(s, 1, 1).damage, 10);
    let t = fx.arrange(fx.start(), (h) => { h.hand(0, ['ST01-009']); h.down(1, 1); h.down(1, 2); });
    t = fx.attack(t, 'ST01-009', 0, 0);
    eq(t.pending.options, ['L13'], 'single candidate still asked');
    ok(t.pending.kind === 'choose');
  });

  test('ST01-010 Critical Shot [Attack] Damage +70: costs 3, deals ATK 30 + 70 = 100', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => h.hand(0, ['ST01-010']));
    const iid = fx.idOf(s, 0, 'ST01-010', ['hand']);
    eq(XS.costToPlay(s, iid), 3);
    eq(XS.previewAttack(s, { type: 'play', iid, attacker: 'L00', target: 'L12' }), 100);
    s = fx.attack(s, 'ST01-010', 0, 2);     // Cpt, 100 HP
    ok(L(s, 1, 2).down, '100 damage downs a 100 HP leader');
    eq(find(s, 'damage')[0].data.amount, 100);
    eq(P(s, 0).pp.untapped, 0);
  });

  test('ST01-011 Cool Head [Attack] Damage +10: 30 + 10 = 40', () => {
    let s = fx.arrange(fx.start(), (h) => h.hand(0, ['ST01-011']));
    s = fx.attack(s, 'ST01-011', 0, 0);
    eq(L(s, 1, 0).damage, 40); eq(find(s, 'attack')[0].data.parts, { atk: 30, boost: 0, card: 10 });
  });

  test('ST01-012 Blind Shot [After Attack]: with 2 or more memoria in your play area, 10 damage to every other opposing leader; with fewer, nothing', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => h.hand(0, ['ST01-013', 'ST01-015', 'ST01-012']));
    s = fx.play(s, 'ST01-013'); s = fx.play(s, 'ST01-015');
    s = fx.attack(s, 'ST01-012', 0, 0);
    eq(s.pending, null, '"every" asks nothing');
    eq([L(s, 1, 1).damage, L(s, 1, 2).damage, L(s, 1, 3).damage], [10, 10, 10]);
    eq(find(s, 'attack')[0].data.damage, 30 + 50 + 60, 'the attacked leader took the boosted attack');
    let t = fx.arrange(fx.start(), (h) => h.hand(0, ['ST01-013', 'ST01-012']));
    t = fx.play(t, 'ST01-013'); t = fx.attack(t, 'ST01-012', 0, 0);
    eq([L(t, 1, 1).damage, L(t, 1, 2).damage, L(t, 1, 3).damage], [0, 0, 0], 'one memoria is not enough');
  });

  // ============================== memoria: boosts ==============================
  const BOOSTS = [
    ['ST01-013', 'ST01', 'Gambit Master', 50, 1], ['ST01-014', 'ST01', 'In the Zone', 80, 2], ['ST01-015', 'ST01', 'Messy Room Dweller', 60, 1],
    ['ST02-013', 'ST02', 'Great Glory', 80, 2], ['ST02-015', 'ST02', 'Tour Guide', 50, 1], ['ST02-017', 'ST02', 'Champion for Hire', 60, 1],
  ];
  for (const [no, deck, name, amount, cost] of BOOSTS) {
    test(`${no} ${name} [Attack Boost] your next attack deals +${amount} damage (cost ${cost}), and only the next attack`, () => {
      let s = fx.start({ decks: [deck, other(deck)] });
      s = fx.arrange(s, (h) => h.hand(0, [no, FLAT[deck], FLAT[deck]]));
      const iid = fx.idOf(s, 0, no, ['hand']);
      eq(XS.costToPlay(s, iid), cost);
      s = fx.play(s, no);
      eq(P(s, 0).boosts, [iid], 'armed');
      const atk = fx.idOf(s, 0, FLAT[deck], ['hand']);
      eq(XS.previewAttack(s, { type: 'play', iid: atk, attacker: 'L00', target: 'L12' }), 30 + amount);
      s = fx.attack(s, FLAT[deck], 0, 2);
      eq(find(s, 'attack')[0].data.damage, 30 + amount);
      eq(find(s, 'attack')[0].data.parts.boost, amount);
      eq(P(s, 0).boosts, [], 'consumed');
      eq(find(s, 'boost', (e) => e.data.phase === 'applied')[0].data.amount, amount);
      s = fx.settleWithFirst(s);
      if (P(s, 0).pp.untapped >= 1) {
        const before = find(s, 'attack').length;
        s = fx.attack(s, FLAT[deck], 0, 1);
        eq(find(s, 'attack')[before].data.parts.boost, 0, 'the next attack gets no boost');
      }
    });
  }

  for (const [no, deck, name, tag] of [['ST01-016', 'ST01', 'First Glory', 'VSPO!'], ['ST02-012', 'ST02', 'Unchanging Bond', 'CR']]) {
    test(`${no} ${name} [Attack Boost] +30; [After Attack] damage to 1 other opposing leader: 10 for each of your leaders with the "${tag}" tag, downed ones included`, () => {
      let s = fx.start({ decks: [deck, other(deck)] });
      s = fx.arrange(s, (h) => { h.hand(0, [no, PLAIN[deck]]); h.down(0, 3); h.damage(0, 2, 10); });
      s = fx.play(s, no);
      s = fx.attack(s, PLAIN[deck], 0, 0);
      eq(find(s, 'attack')[0].data.parts.boost, 30);
      eq(s.pending.purpose, 'target'); eq(s.pending.options, ['L11', 'L12', 'L13']);
      ok(/40 damage/.test(s.pending.prompt), 'a downed own leader still counts (FAQ #10): ' + s.pending.prompt);
      s = fx.choose(s, ['L12']);
      eq(L(s, 1, 2).damage, 40);
      let t = fx.arrange(fx.start({ decks: [deck, other(deck)] }), (h) => { h.hand(0, [no, PLAIN[deck]]); h.down(1, 1); h.down(1, 2); });
      t = fx.play(t, no); t = fx.attack(t, PLAIN[deck], 0, 0);
      eq(t.pending.options, ['L13'], 'single candidate still asked');
    });
  }

  for (const [no, deck, name] of [['ST01-017', 'ST01', 'Summit Reached'], ['ST02-016', 'ST02', 'Lucky Man']]) {
    test(`${no} ${name} [On Play] draw 1 card if 3 of your leaders are down; [Attack Boost] +40`, () => {
      let s = fx.start({ decks: [deck, other(deck)] });
      s = fx.arrange(s, (h) => { h.hand(0, [no, FLAT[deck]]); h.down(0, 1); h.down(0, 2); h.down(0, 3); });
      s = fx.play(s, no);
      eq(P(s, 0).hand.length, 2, 'played 1, drew 1 (hand held 2)');
      eq(find(s, 'draw', (e) => e.data.cause === 'effect').length, 1);
      s = fx.attack(s, FLAT[deck], 0, 0);
      eq(find(s, 'attack')[0].data.parts.boost, 40);
      let t = fx.start({ decks: [deck, other(deck)] });
      t = fx.arrange(t, (h) => { h.hand(0, [no]); h.down(0, 1); h.down(0, 2); });
      t = fx.play(t, no);
      eq(P(t, 0).hand.length, 0, 'only 2 leaders down: no draw');
      eq(P(t, 0).boosts.length, 1, 'the boost is armed either way');
    });
  }

  test('ST01-018 Interviewer [On Play] heal 1 of your leaders by 30 (asked, any leader that is not down); [Attack Boost] +30', () => {
    let s = fx.start();
    s = fx.arrange(s, (h) => { h.hand(0, ['ST01-018', 'ST01-008']); h.damage(0, 1, 60); });
    s = fx.play(s, 'ST01-018');
    eq(s.pending.purpose, 'heal'); eq(s.pending.options, ['L00', 'L01', 'L02', 'L03']); ok(/heal 30/.test(s.pending.prompt));
    s = fx.choose(s, ['L01']);
    eq(L(s, 0, 1).damage, 30);
    s = fx.attack(s, 'ST01-008', 0, 0);
    eq(find(s, 'attack')[0].data.parts.boost, 30);
    let t = fx.arrange(fx.start(), (h) => { h.hand(0, ['ST01-018']); h.down(0, 0); h.down(0, 1); h.down(0, 2); });
    t = fx.play(t, 'ST01-018');
    eq(t.pending.options, ['L03'], 'single candidate still asked');
  });

  test('ST02-014 Close Call [On Play] draw 2 cards', () => {
    let s = fx.start({ decks: ['ST02', 'ST01'] });
    s = fx.arrange(s, (h) => h.hand(0, ['ST02-014']));
    s = fx.play(s, 'ST02-014');
    eq(P(s, 0).hand.length, 2); eq(find(s, 'draw', (e) => e.data.cause === 'effect').length, 2);
    eq(P(s, 0).boosts, [], 'no boost on this card');
  });

  test('ST02-018 Little Video Letter [Attack Boost] +50; [After Attack] 10 damage to 1 other opposing leader (asked)', () => {
    let s = fx.start({ decks: ['ST02', 'ST01'] });
    s = fx.arrange(s, (h) => h.hand(0, ['ST02-018', 'ST02-007']));
    s = fx.play(s, 'ST02-018');
    s = fx.attack(s, 'ST02-007', 0, 0);
    eq(find(s, 'attack')[0].data.parts.boost, 50);
    eq(s.pending.options, ['L11', 'L12', 'L13']); ok(/10 damage/.test(s.pending.prompt));
    s = fx.choose(s, ['L11']);
    eq(L(s, 1, 1).damage, 10);
    let t = fx.arrange(fx.start({ decks: ['ST02', 'ST01'] }), (h) => { h.hand(0, ['ST02-018', 'ST02-007']); h.down(1, 1); h.down(1, 2); });
    t = fx.play(t, 'ST02-018'); t = fx.attack(t, 'ST02-007', 0, 0);
    eq(t.pending.options, ['L13']);
  });

  // ============================== ST02 attacks ==============================
  test('ST02-005 Otherworldly Kick [After Attack]: 10 damage to 1 other opposing leader (asked)', () => {
    let s = fx.start({ decks: ['ST02', 'ST01'] });
    s = fx.arrange(s, (h) => h.hand(0, ['ST02-005']));
    s = fx.attack(s, 'ST02-005', 0, 0);
    eq(s.pending.options, ['L11', 'L12', 'L13']); s = fx.choose(s, ['L13']);
    eq([L(s, 1, 0).damage, L(s, 1, 3).damage], [30, 10]);
    let t = fx.arrange(fx.start({ decks: ['ST02', 'ST01'] }), (h) => { h.hand(0, ['ST02-005']); h.down(1, 1); h.down(1, 2); });
    t = fx.attack(t, 'ST02-005', 0, 0);
    eq(t.pending.options, ['L13'], 'single candidate still asked');
  });

  test('ST02-006 Wild Prank [After Attack]: draw 1 card, then discard 1 card from your hand', () => {
    let s = fx.start({ decks: ['ST02', 'ST01'] });
    s = fx.arrange(s, (h) => { h.hand(0, ['ST02-006', 'ST02-013']); h.top(0, ['ST02-015']); });
    s = fx.attack(s, 'ST02-006', 0, 0);
    eq(s.pending.purpose, 'discard'); eq(s.pending.options.length, 2, 'the old card and the drawn one');
    s = fx.choose(s, [fx.idOf(s, 0, 'ST02-013', ['hand'])]);
    eq(P(s, 0).hand.length, 1); ok(fx.has(s, 0, 'hand', 'ST02-015'));
  });

  test('ST02-007 Impact Shot [Attack] Damage +40: costs 2, deals 30 + 40 = 70', () => {
    let s = fx.arrange(fx.start({ decks: ['ST02', 'ST01'] }), (h) => h.hand(0, ['ST02-007']));
    eq(XS.costToPlay(s, fx.idOf(s, 0, 'ST02-007', ['hand'])), 2);
    s = fx.attack(s, 'ST02-007', 0, 0);
    eq(L(s, 1, 0).damage, 70); eq(P(s, 0).pp.untapped, 1);
  });

  test('ST02-008 Killing Spree [After Attack]: if the attacked leader is down, 20 damage to 1 other opposing leader; otherwise nothing', () => {
    let s = fx.start({ decks: ['ST02', 'ST01'] });
    s = fx.arrange(s, (h) => { h.hand(0, ['ST02-008']); h.damage(1, 0, 90); });
    s = fx.attack(s, 'ST02-008', 0, 0);
    eq(s.pending.options, ['L11', 'L12', 'L13']); ok(/20 damage/.test(s.pending.prompt));
    s = fx.choose(s, ['L11']);
    eq(L(s, 1, 1).damage, 20);
    let t = fx.arrange(fx.start({ decks: ['ST02', 'ST01'] }), (h) => h.hand(0, ['ST02-008']));
    t = fx.attack(t, 'ST02-008', 0, 0);
    eq(t.pending, null, 'attacked leader not down: nothing happens'); eq(L(t, 1, 1).damage, 0);
    let u = fx.arrange(fx.start({ decks: ['ST02', 'ST01'] }), (h) => { h.hand(0, ['ST02-008']); h.damage(1, 0, 90); h.down(1, 2); h.down(1, 3); });
    u = fx.attack(u, 'ST02-008', 0, 0);
    eq(u.pending.options, ['L11'], 'single candidate still asked');
  });

  test('ST02-009 Demon King\'s Descent [Attack]: all your leaders have "CR" -> the attacked leader goes down (cost 3)', () => {
    let s = fx.start({ decks: ['ST02', 'ST01'] });
    s = fx.arrange(s, (h) => h.hand(0, ['ST02-009']));
    eq(XS.costToPlay(s, fx.idOf(s, 0, 'ST02-009', ['hand'])), 3);
    s = fx.attack(s, 'ST02-009', 2, 3);
    ok(L(s, 1, 3).down, 'down'); s = fx.settleWithFirst(s);
    ok(L(s, 0, 2).awakened, 'the attacker awakens');
    // the VSPO! team cannot use the CR text: a mixed team with one VSPO! leader
    const mixed = Object.assign({}, XS.DECKS.ST02, { leaders: ['ST02-001', 'ST02-002', 'ST02-003', 'ST01-001'] });
    let t = fx.arrange(fx.start({ decks: [mixed, 'ST01'] }), (h) => h.hand(0, ['ST02-009']));
    t = fx.attack(t, 'ST02-009', 0, 0);
    ok(!L(t, 1, 0).down);
  });

  test('ST02-010 Counter Snipe [After Attack]: with 2 or fewer cards in hand, 20 damage to 1 other opposing leader', () => {
    let s = fx.start({ decks: ['ST02', 'ST01'] });
    s = fx.arrange(s, (h) => h.hand(0, ['ST02-010', 'ST02-013', 'ST02-015']));
    s = fx.attack(s, 'ST02-010', 0, 0);
    eq(s.pending.options, ['L11', 'L12', 'L13']); ok(/20 damage/.test(s.pending.prompt));
    s = fx.choose(s, ['L12']); eq(L(s, 1, 2).damage, 20);
    let t = fx.arrange(fx.start({ decks: ['ST02', 'ST01'] }), (h) => h.hand(0, ['ST02-010', 'ST02-013', 'ST02-015', 'ST02-017']));
    t = fx.attack(t, 'ST02-010', 0, 0);
    eq(t.pending, null, '3 cards left in hand: nothing'); eq([L(t, 1, 1).damage, L(t, 1, 2).damage, L(t, 1, 3).damage], [0, 0, 0]);
    let u = fx.arrange(fx.start({ decks: ['ST02', 'ST01'] }), (h) => { h.hand(0, ['ST02-010']); h.down(1, 1); h.down(1, 2); });
    u = fx.attack(u, 'ST02-010', 0, 0);
    eq(u.pending.options, ['L13']);
  });

  test('ST02-011 Multi Grenade [After Attack]: 20 damage to every other opposing leader (cost 2), downed leaders skipped, nothing asked', () => {
    let s = fx.start({ decks: ['ST02', 'ST01'] });
    s = fx.arrange(s, (h) => { h.hand(0, ['ST02-011']); h.down(1, 3); });
    eq(XS.costToPlay(s, fx.idOf(s, 0, 'ST02-011', ['hand'])), 2);
    s = fx.attack(s, 'ST02-011', 0, 0);
    eq(s.pending, null);
    eq([L(s, 1, 0).damage, L(s, 1, 1).damage, L(s, 1, 2).damage], [30, 20, 20]);
    eq(L(s, 1, 3).damage, 0);
  });

  // ============================== tactics ==============================
  // Tactics are played by seat 1 on its first turn (the first player cannot play one on turn 1, FAQ #49).
  function tactical(no, deck1, prep) {
    const decks = [other(deck1), deck1];
    let s = fx.start({ decks, pick: [null, no] });
    s = fx.toTurnOf(s, 1);
    if (prep) s = fx.arrange(s, prep);
    return s;
  }

  for (const [no, deck, name] of [['ST01-019', 'ST01', 'Adrenaline'], ['ST02-019', 'ST02', 'Adrenaline']]) {
    test(`${no} ${name} [On Play] draw 1 card; [Attack Boost] +40 (cost 0, one tactics play)`, () => {
      let s = tactical(no, deck, (h) => h.hand(1, [FLAT[deck]]));
      eq(XS.costToPlay(s, fx.idOf(s, 1, no, ['tarea'])), 0);
      s = fx.play(s, no);
      eq(P(s, 1).hand.length, 2); eq(P(s, 1).pp.untapped, 3, 'cost 0');
      ok(fx.has(s, 1, 'play', no), 'face up in the play area');
      s = fx.attack(s, FLAT[deck], 0, 0);
      eq(find(s, 'attack')[0].data.parts.boost, 40);
      s = fx.endTurn(fx.settleWithFirst(s));
      ok(fx.has(s, 1, 'trash', no), 'trashed face up at the end phase');
    });
  }

  for (const [no, deck, name] of [['ST01-020', 'ST01', 'Energy Charger'], ['ST02-020', 'ST02', 'Energy Charger']]) {
    test(`${no} ${name} [On Play] recover 1 PP and draw 1 card`, () => {
      let s = tactical(no, deck, (h) => h.spend(1, 2));
      eq(P(s, 1).pp.untapped, 1);
      const hand = P(s, 1).hand.length;
      s = fx.play(s, no);
      eq(P(s, 1).pp.untapped, 2); eq(P(s, 1).hand.length, hand + 1);
      eq(find(s, 'ppRecover', (e) => e.data.cause === 'effect')[0].data, { n: 1, requested: 1, cause: 'effect' });
    });
  }

  for (const [no, deck, name] of [['ST01-021', 'ST01', 'First Aid Kit'], ['ST02-021', 'ST02', 'First Aid Kit']]) {
    test(`${no} ${name} [On Play] heal your leaders by 80 in total, split as you choose in tens (asked); one candidate is still asked`, () => {
      let s = tactical(no, deck, (h) => { h.damage(1, 0, 50); h.damage(1, 1, 60); h.damage(1, 2, 20); });
      s = fx.play(s, no);
      eq(s.pending.kind, 'distribute'); eq([s.pending.total, s.pending.unit], [80, 10]);
      eq(s.pending.options, ['L10', 'L11', 'L12', 'L13'], 'every leader that is not down');
      throws(() => XS.apply(s, { type: 'distribute', alloc: { L10: 70 } }), 'total must be 80', XS.Illegal);
      throws(() => XS.apply(s, { type: 'distribute', alloc: { L10: 45, L11: 35 } }), 'multiples of 10', XS.Illegal);
      throws(() => XS.apply(s, { type: 'distribute', alloc: { L19: 80 } }), 'only leaders offered', XS.Illegal);
      s = XS.apply(s, { type: 'distribute', alloc: { L10: 50, L11: 30 } });
      eq([L(s, 1, 0).damage, L(s, 1, 1).damage, L(s, 1, 2).damage], [0, 30, 20]);
      let t = tactical(no, deck, (h) => { h.damage(1, 3, 40); h.down(1, 0); h.down(1, 1); h.down(1, 2); });
      t = fx.play(t, no);
      eq(t.pending.options, ['L13'], 'a single candidate is still a question');
      t = XS.apply(t, { type: 'distribute', alloc: { L13: 80 } });
      eq(L(t, 1, 3).damage, 0, 'capped at the counters present');
    });
  }

  for (const [no, deck, name] of [['ST01-022', 'ST01', 'Special Round'], ['ST02-022', 'ST02', 'Special Round']]) {
    test(`${no} ${name} [Attack Boost] your next attack deals +80 damage (cost 1)`, () => {
      let s = tactical(no, deck, (h) => h.hand(1, [FLAT[deck]]));
      eq(XS.costToPlay(s, fx.idOf(s, 1, no, ['tarea'])), 1);
      s = fx.play(s, no);
      eq(P(s, 1).pp.untapped, 2);
      const iid = fx.idOf(s, 1, FLAT[deck], ['hand']);
      eq(XS.previewAttack(s, { type: 'play', iid, attacker: 'L10', target: 'L02' }), 110);
      s = fx.attack(s, FLAT[deck], 0, 2);
      eq(find(s, 'attack')[0].data.parts.boost, 80);
    });
  }

  for (const [no, deck, name] of [['ST01-023', 'ST01', 'Light Shield'], ['ST02-023', 'ST02', 'Light Shield']]) {
    test(`${no} ${name} (equipment) HP +30 on the leader you choose; stays attached; one leader to choose from is still a choice`, () => {
      let s = tactical(no, deck);
      const iid = fx.idOf(s, 1, no, ['tarea']);
      const acts = XS.legalActions(s).filter((a) => a.iid === iid);
      eq(acts.map((a) => a.target), ['L10', 'L11', 'L12', 'L13'], 'one action per leader: nothing is chosen for you');
      const hp = XS.leaderStats(s, 1, 2).hp;
      s = fx.play(s, no, { target: 'L12' });
      eq(XS.leaderStats(s, 1, 2).hp, hp + 30); eq(L(s, 1, 2).equipment, [iid]);
      eq(find(s, 'equip')[0].data.leader, 'L12');
      eq(XS.leaderStats(s, 1, 0).hp, XS.CARDS[L(s, 1, 0).cardId].hp, 'other leaders unchanged');
      let t = tactical(no, deck, (h) => { h.down(1, 0); h.down(1, 1); h.down(1, 3); });
      eq(XS.legalActions(t).filter((a) => a.iid === fx.idOf(t, 1, no, ['tarea'])).map((a) => a.target), ['L12'], 'a single leader is still an action to pick');
      // the extra HP is real: damage past the printed HP no longer downs it
      s = fx.arrange(s, (h) => h.damage(1, 2, hp + 20));
      ok(!L(s, 1, 2).down, 'HP +30 keeps it up');
      eq(XS.leaderStats(s, 1, 2).remaining, 10);
    });
  }

  for (const [no, deck, name] of [['ST01-024', 'ST01', 'PP Ticket'], ['ST02-024', 'ST02', 'PP Ticket']]) {
    test(`${no} ${name} [On Play] recover 1 PP: only the second player gets it (round 1), it is a tactics play; with every PP upright nothing happens (FAQ #7)`, () => {
      let s = fx.start({ decks: [other(deck), deck] });
      const ticket = fx.idOf(s, 1, no, ['tarea']);
      ok(s.cards[ticket].ticket === true && !P(s, 0).tarea.some((i) => s.cards[i].ticket), 'only seat 1 has one');
      s = fx.toTurnOf(s, 1);
      s = fx.arrange(s, (h) => h.spend(1, 2));
      s = fx.play(s, no);
      eq(P(s, 1).pp.untapped, 2);
      let t = fx.toTurnOf(fx.start({ decks: [other(deck), deck] }), 1);
      t = fx.play(t, no);
      eq(P(t, 1).pp.untapped, 3, 'already full');
      eq(find(t, 'ppRecover', (e) => e.data.cause === 'effect')[0].data.n, 0);
    });
  }

  for (const [no, deck] of [['ST01-025', 'ST01'], ['ST02-025', 'ST02']]) {
    test(`${no} PP Card: the Play Point cards are the PP counter (3/4/5 by round), never a deck card: none is drawn, played, or in a registered deck`, () => {
      const s = fx.start({ decks: [deck, other(deck)] });
      ok(!Object.values(s.cards).some((c) => c.id === no), 'no instance exists');
      ok(!XS.DECKS[deck].main.some(([id]) => id === no) && !XS.DECKS[deck].tactics.includes(no));
      eq(XS.CARDS[no].type, 'pp'); eq(XS.ABIL[no].effects, []);
      eq(XS.DECKS[deck].ppCard, no);
      eq(P(s, 0).pp, { total: 3, untapped: 3 });
      eq(XS.view(s, 0).players[0].pp, { total: 3, untapped: 3 });
    });
  }
})();
