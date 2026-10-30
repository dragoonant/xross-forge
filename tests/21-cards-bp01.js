// One behaviour test per BP01 card number used by a registered deck (data/abilities-bp01.js). Same rules as
// tests/20-cards.js: a real game state, the card played through XS.apply, the side effect asserted, and a
// single-candidate case for every targeted effect (CLAUDE.md rule 4). Positions: tests/05-fixtures.js.
(function () {
  const XS = globalThis.XS;
  const { test, eq, ok, throws } = XS.T;
  const fx = XS.T.fx;
  const P = (s, seat) => s.players[seat];
  const L = (s, seat, slot) => s.players[seat].leaders[slot];
  const find = (s, type, pred) => s.log.filter((e) => e.type === type && (!pred || pred(e)));
  const idx = (s, type, pred) => s.log.findIndex((e) => e.type === type && (!pred || pred(e)));
  const drawsBy = (s, iid) => find(s, 'draw', (e) => e.data.cause === 'effect' && e.via === iid).length;
  const FLAT = 'ST01-008';    // cost 1, no damage bonus, After Attack only on a down
  const PLAIN = 'ST01-011';   // cost 1, Damage +10

  // Seat 0 plays ST01 with `extra` ([no, qty] main cards) and, optionally, BP01 leader `lead` in slot `slot`; seat 1 plays `opp`.
  function game(extra, o) {
    o = o || {};
    const d = fx.deckWith('ST01', extra, o.tactics);
    if (o.lead) d.leaders = XS.DECKS.ST01.leaders.map((l, i) => (i === o.slot ? o.lead : l));
    return fx.start({ decks: [d, o.opp || 'ST02'], pick: o.pick || [null, null] });
  }
  // Seat 1 holds the tactics card `no` in its tactics area and it is seat 1's first turn (the first player cannot play a tactics card on turn 1, FAQ #49).
  function tactical(no, prep) {
    let s = fx.start({ decks: ['ST02', fx.deckWith('ST01', [], [no])], pick: [null, no] });
    s = fx.toTurnOf(s, 1);
    return prep ? fx.arrange(s, prep) : s;
  }
  // Leader `no` sits in `slot`; it attacks L10, which has 10 HP left, so it goes down and the attacker awakens (PM p.13).
  function awakened(no, slot, prep) {
    let s = game([], { lead: no, slot });
    s = fx.arrange(s, (h, t) => {
      h.hand(0, [PLAIN]);
      h.damage(1, 0, XS.leaderStats(t, 1, 0).hp - 10);
      if (prep) prep(h, t);
    });
    return fx.attack(s, PLAIN, slot, 0);
  }

  // ============================== leaders: 【覚醒時】 ==============================
  for (const [no, slot] of [['BP01-003', 0], ['BP01-013', 1]]) {
    test(`${no} [On Awaken] draw 2 cards, then discard 2 cards from your hand (asked, even when the hand is exactly 2; face down)`, () => {
      let s = awakened(no, slot, (h) => { h.hand(0, [PLAIN, 'ST01-013']); h.top(0, ['ST01-014', 'ST01-015']); });
      ok(L(s, 0, slot).awakened);
      eq(P(s, 0).hand.map((i) => s.cards[i].id), ['ST01-013', 'ST01-014', 'ST01-015'], 'drew 2 first');
      eq(find(s, 'draw', (e) => e.data.cause === 'effect').length, 2);
      eq([s.pending.purpose, s.pending.min, s.pending.max, s.pending.seat], ['discard', 2, 2, 0]);
      eq(s.pending.options.length, 3);
      const trash = P(s, 0).trash.length;
      s = fx.choose(s, [fx.idOf(s, 0, 'ST01-013', ['hand']), fx.idOf(s, 0, 'ST01-015', ['hand'])]);
      eq(P(s, 0).hand.map((i) => s.cards[i].id), ['ST01-014']);
      eq(P(s, 0).trash.length, trash + 2);
      ok(XS.view(s, 1).players[0].trash.slice(-2).every((c) => c.hidden === true), 'discarded face down (FAQ #47)');
      // the hand is exactly 2 after the draws: still a question, never an automatic discard (rule 4)
      let t = awakened(no, slot, (h) => h.hand(0, [PLAIN]));
      eq(P(t, 0).hand.length, 2);
      eq([t.pending.purpose, t.pending.options.length, t.pending.min], ['discard', 2, 2]);
      t = fx.choose(t, t.pending.options);
      eq(P(t, 0).hand.length, 0);
    });
  }

  test('BP01-014 [On Awaken] draw 1 card', () => {
    const s = awakened('BP01-014', 2);
    ok(L(s, 0, 2).awakened);
    eq(s.pending, null, 'nothing to choose');
    eq(P(s, 0).hand.length, 1, 'the played card left the hand, then 1 card drawn');
    eq(find(s, 'draw', (e) => e.data.cause === 'effect').length, 1);
    eq(find(s, 'draw', (e) => e.data.cause === 'effect')[0].via, 'L02', 'attributed to the leader');
  });

  test('BP01-016 [On Awaken] 10 damage to 1 opposing leader of your choice; one candidate is still asked', () => {
    let s = awakened('BP01-016', 3);
    ok(L(s, 0, 3).awakened);
    eq([s.pending.kind, s.pending.purpose, s.pending.seat], ['choose', 'target', 0]);
    eq(s.pending.options, ['L11', 'L12', 'L13'], 'the leader just downed is not a candidate');
    ok(/10 damage/.test(s.pending.prompt), s.pending.prompt);
    s = fx.choose(s, ['L12']);
    eq([L(s, 1, 1).damage, L(s, 1, 2).damage, L(s, 1, 3).damage], [0, 10, 0]);
    let t = awakened('BP01-016', 3, (h) => { h.down(1, 2); h.down(1, 3); });
    eq(t.pending.options, ['L11'], 'exactly one candidate');
    t = fx.choose(t, ['L11']);
    eq(L(t, 1, 1).damage, 10);
  });

  // ============================== attack cards ==============================
  for (const no of ['BP01-018', 'BP01-027']) {
    test(`${no} [After Attack] 20 damage to 1 other opposing leader (chosen; the attacked leader is not a candidate; one candidate is still asked)`, () => {
      let s = game([[no, 2]]);
      s = fx.arrange(s, (h) => h.hand(0, [no]));
      eq(XS.costToPlay(s, fx.idOf(s, 0, no, ['hand'])), 1);
      s = fx.attack(s, no, 0, 0);
      eq(s.pending.options, ['L11', 'L12', 'L13']); ok(/20 damage/.test(s.pending.prompt), s.pending.prompt);
      s = fx.choose(s, ['L13']);
      eq([L(s, 1, 0).damage, L(s, 1, 1).damage, L(s, 1, 3).damage], [30, 0, 20]);
      let t = game([[no, 2]]);
      t = fx.arrange(t, (h) => { h.hand(0, [no]); h.down(1, 1); h.down(1, 2); });
      t = fx.attack(t, no, 0, 0);
      eq(t.pending.options, ['L13'], 'one candidate'); ok(t.pending.kind === 'choose');
      t = fx.choose(t, ['L13']); eq(L(t, 1, 3).damage, 20);
    });
  }

  test('BP01-023 [Attack] Damage +10: ATK 30 + 10 = 40 (cost 1)', () => {
    let s = fx.arrange(game([['BP01-023', 2]]), (h) => h.hand(0, ['BP01-023']));
    eq(XS.costToPlay(s, fx.idOf(s, 0, 'BP01-023', ['hand'])), 1);
    s = fx.attack(s, 'BP01-023', 0, 0);
    eq(L(s, 1, 0).damage, 40); eq(find(s, 'attack')[0].data.parts, { atk: 30, boost: 0, card: 10 });
  });

  test('BP01-043 [After Attack] if the leader that received this attack is down, draw 1 card; otherwise nothing', () => {
    let s = fx.arrange(game([['BP01-043', 2]]), (h) => { h.hand(0, ['BP01-043']); h.damage(1, 0, 90); });
    const iid = fx.idOf(s, 0, 'BP01-043', ['hand']);
    s = fx.attack(s, 'BP01-043', 0, 0);       // 30 on top of 90: down
    ok(L(s, 1, 0).down);
    s = fx.settleWithFirst(s);
    eq(drawsBy(s, iid), 1, 'down -> drew 1');
    let t = fx.arrange(game([['BP01-043', 2]]), (h) => h.hand(0, ['BP01-043']));
    const iid2 = fx.idOf(t, 0, 'BP01-043', ['hand']);
    t = fx.attack(t, 'BP01-043', 0, 0);
    ok(!L(t, 1, 0).down);
    eq(drawsBy(t, iid2), 0, 'not down -> no draw'); eq(P(t, 0).hand.length, 0);
    // a different leader going down does not count (FAQ #18): the attacked leader stays up
    let u = fx.arrange(game([['BP01-043', 2]]), (h) => { h.hand(0, ['BP01-043']); h.down(1, 2); });
    const iid3 = fx.idOf(u, 0, 'BP01-043', ['hand']);
    u = fx.attack(u, 'BP01-043', 0, 0);
    eq(drawsBy(u, iid3), 0);
  });

  test('BP01-044 [After Attack] look at the top 3; play 1 memoria of cost 1 or less from them free (asked, a cost-2 memoria is not offered); the rest go to the trash', () => {
    let s = game([['BP01-044', 2], ['BP01-059', 2]]);
    s = fx.arrange(s, (h) => { h.hand(0, ['BP01-044']); h.top(0, [FLAT, 'BP01-059', 'ST01-014']); });   // ST01-014 is a cost-2 memoria
    const pp = P(s, 0).pp.untapped, deck = P(s, 0).deck.length;
    s = fx.attack(s, 'BP01-044', 0, 0);
    eq(s.pending.purpose, 'freePlay');
    eq(s.pending.options.map((i) => s.cards[i].id), ['BP01-059'], 'one candidate, still asked; the attack and the cost-2 memoria are not offered');
    eq([s.pending.min, s.pending.max], [0, 1]);
    s = fx.choose(s, s.pending.options);
    const free = fx.idOf(s, 0, 'BP01-059', ['play']);
    eq(P(s, 0).play.slice(-1)[0], free, 'far right of the play area');
    eq(P(s, 0).pp.untapped, pp - 1, 'only the attack card was paid for');
    eq(P(s, 0).deck.length, deck - 3, 'three cards left the deck');
    ok(fx.has(s, 0, 'trash', FLAT) && fx.has(s, 0, 'trash', 'ST01-014'), 'the rest went to the trash');
    eq(find(s, 'look', (e) => e.data.phase === 'trash')[0].data.n, 2);
    eq(P(s, 0).boosts, [free], 'its Attack Boost is armed for the next attack');
    // you may decline: all three go to the trash
    let t = fx.arrange(game([['BP01-044', 2], ['BP01-059', 2]]), (h) => { h.hand(0, ['BP01-044']); h.top(0, [FLAT, 'BP01-059', 'ST01-014']); });
    t = fx.attack(t, 'BP01-044', 0, 0);
    t = XS.apply(t, { type: 'choose', ids: [] });
    eq(P(t, 0).play.length, 1, 'only the attack card is in the play area'); eq(find(t, 'freePlay').length, 0);
    eq(find(t, 'look', (e) => e.data.phase === 'trash')[0].data.n, 3);
    // no memoria of cost 1 or less among the three: the owner is still asked (an empty, declinable pick), all trashed
    let u = fx.arrange(game([['BP01-044', 2]]), (h) => { h.hand(0, ['BP01-044']); h.top(0, [FLAT, 'ST01-014', 'ST01-012']); });
    u = fx.attack(u, 'BP01-044', 0, 0);
    eq([u.pending.purpose, u.pending.min, u.pending.options], ['freePlay', 0, []], 'the question is still asked (hidden pool, FAQ #95)');
    u = fx.choose(u, []);
    eq(u.pending, null); eq(find(u, 'look', (e) => e.data.phase === 'trash')[0].data.n, 3);
  });

  test('BP01-044 リンク・アサルト (FAQ #95, rule 7): the free-play question is asked whether or not the top 3 hold a memoria of cost 1 or less, so the opponent cannot tell', () => {
    const run = (top) => fx.attack(fx.arrange(game([['BP01-044', 2], ['BP01-059', 2]]), (h) => { h.hand(0, ['BP01-044']); h.top(0, top); }), 'BP01-044', 0, 0);
    const oppSees = (s) => { const v = XS.view(s, 1); return JSON.stringify({ pending: v.pending, log: v.log }); };
    const yes = run([FLAT, 'BP01-059', 'ST01-014']), no = run([FLAT, 'ST01-014', 'ST01-012']);
    eq(oppSees(no), oppSees(yes));
    eq([no.pending.purpose, no.pending.min, no.pending.max, no.pending.options], ['freePlay', 0, 1, []]);
    const t = fx.choose(no, []);
    eq(t.pending, null); eq(find(t, 'look', (e) => e.data.phase === 'trash')[0].data.n, 3);
  });

  test('BP01-044 FAQ #25 / #40: the memoria played by it resolves only after the attack ended and the attacker awakened', () => {
    let s = game([['BP01-044', 2], ['BP01-061', 2]]);
    s = fx.arrange(s, (h, t) => { h.hand(0, ['BP01-044']); h.top(0, ['BP01-061', FLAT, 'ST01-012']); h.damage(1, 0, XS.leaderStats(t, 1, 0).hp - 10); });
    s = fx.attack(s, 'BP01-044', 0, 0);
    s = fx.choose(s, s.pending.options);
    s = fx.settleWithFirst(s);
    const free = find(s, 'freePlay')[0].data.iid;
    ok(idx(s, 'awaken') !== -1 && idx(s, 'awaken') < idx(s, 'ability', (e) => e.data.src === free), 'awakening first (FAQ #25)');
    eq(drawsBy(s, free), 2, 'then its [On Play] drew for both players (the card drew for both seats)');
  });

  test('BP01-045 [After Attack] 10 damage to every other opposing leader that is not down, nothing asked', () => {
    let s = fx.arrange(game([['BP01-045', 2]]), (h) => { h.hand(0, ['BP01-045']); h.down(1, 3); });
    s = fx.attack(s, 'BP01-045', 0, 0);
    eq(s.pending, null, '"every" asks nothing');
    eq([L(s, 1, 0).damage, L(s, 1, 1).damage, L(s, 1, 2).damage, L(s, 1, 3).damage], [30, 10, 10, 0]);
  });

  test('BP01-047 [After Attack] with 2 or more memoria in your play area, 20 damage to 1 other opposing leader (asked); with fewer, nothing', () => {
    const run = (memoria, prep) => {
      let s = game([['BP01-047', 2], ['BP01-059', 2], ['BP01-083', 2]]);
      s = fx.arrange(s, (h) => { h.hand(0, memoria.concat(['BP01-047'])); if (prep) prep(h); });
      for (const m of memoria) s = fx.play(s, m);
      return fx.attack(s, 'BP01-047', 0, 0);
    };
    let s = run(['BP01-059', 'BP01-083']);
    eq(s.pending.options, ['L11', 'L12', 'L13']); ok(/20 damage/.test(s.pending.prompt), s.pending.prompt);
    s = fx.choose(s, ['L12']);
    eq([L(s, 1, 1).damage, L(s, 1, 2).damage, L(s, 1, 3).damage], [0, 20, 0]);
    const t = run(['BP01-059']);
    eq(t.pending, null, 'one memoria is not enough');
    eq([L(t, 1, 1).damage, L(t, 1, 2).damage, L(t, 1, 3).damage], [0, 0, 0]);
    const u = run([]);
    eq(u.pending, null); eq([L(u, 1, 1).damage, L(u, 1, 2).damage, L(u, 1, 3).damage], [0, 0, 0], 'no memoria at all');
    let v = run(['BP01-059', 'BP01-083'], (h) => { h.down(1, 1); h.down(1, 2); });
    eq(v.pending.options, ['L13'], 'one candidate is still asked'); v = fx.choose(v, ['L13']); eq(L(v, 1, 3).damage, 20);
  });

  test('BP01-048 [Attack] Damage -20 (FAQ #53): cost 0, ATK 30 - 20 = 10', () => {
    let s = fx.arrange(game([['BP01-048', 2]]), (h) => h.hand(0, ['BP01-048']));
    eq(XS.costToPlay(s, fx.idOf(s, 0, 'BP01-048', ['hand'])), 0);
    s = fx.attack(s, 'BP01-048', 0, 0);
    eq(L(s, 1, 0).damage, 10); eq(find(s, 'attack')[0].data.parts, { atk: 30, boost: 0, card: -20 });
    eq(P(s, 0).pp.untapped, 3, 'free');
  });

  // ============================== memoria ==============================
  for (const no of ['BP01-059', 'BP01-083']) {
    test(`${no} [Attack Boost] your next attack deals +60 damage (cost 1), and only the next attack`, () => {
      let s = fx.arrange(game([[no, 2]]), (h) => h.hand(0, [no, FLAT, FLAT]));
      const iid = fx.idOf(s, 0, no, ['hand']);
      eq(XS.costToPlay(s, iid), 1);
      s = fx.play(s, no);
      eq(P(s, 0).boosts, [iid], 'armed');
      eq(XS.previewAttack(s, { type: 'play', iid: fx.idOf(s, 0, FLAT, ['hand']), attacker: 'L00', target: 'L12' }), 90);
      s = fx.attack(s, FLAT, 0, 2);
      eq(find(s, 'attack')[0].data.damage, 90); eq(find(s, 'attack')[0].data.parts.boost, 60);
      eq(P(s, 0).boosts, [], 'consumed');
      s = fx.settleWithFirst(s);
      s = fx.attack(s, FLAT, 0, 1);
      eq(find(s, 'attack')[1].data.parts.boost, 0, 'the next attack gets no boost');
    });
  }

  for (const no of ['BP01-061', 'BP01-088']) {
    test(`${no} [On Play] all players draw 1 card (turn player first); [Attack Boost] +50`, () => {
      let s = fx.arrange(game([[no, 2]]), (h) => { h.hand(0, [no, FLAT]); h.top(0, ['ST01-014']); h.top(1, ['ST02-013']); });
      const iid = fx.idOf(s, 0, no, ['hand']);
      eq(XS.costToPlay(s, iid), 1);
      s = fx.play(s, no);
      eq(P(s, 0).hand.map((i) => s.cards[i].id), [FLAT, 'ST01-014'], 'you drew 1');
      ok(fx.has(s, 1, 'hand', 'ST02-013'), 'the opponent drew the top of their deck');
      eq(find(s, 'draw', (e) => e.data.cause === 'effect').map((e) => e.seat), [0, 1], 'turn player first (R-072)');
      eq(drawsBy(s, iid), 2);
      eq(P(s, 0).boosts, [iid]);
      s = fx.attack(s, FLAT, 0, 0);
      eq(find(s, 'attack')[0].data.parts.boost, 50);
    });
  }

  test('BP01-071 [On Play] this turn every leader of yours gets +30 ATK (ace, cost 1); it ends with the turn and never touches the opponent', () => {
    let s = fx.arrange(game([['BP01-071', 2]]), (h) => h.hand(0, ['BP01-071', PLAIN]));
    eq(XS.CARDS['BP01-071'].ace, true);
    eq(XS.costToPlay(s, fx.idOf(s, 0, 'BP01-071', ['hand'])), 1);
    s = fx.play(s, 'BP01-071');
    eq([0, 1, 2, 3].map((k) => XS.leaderStats(s, 0, k).atk), [60, 60, 60, 60]);
    eq(XS.leaderStats(s, 1, 0).atk, 30, 'not the opponent\'s');
    eq(P(s, 0).boosts, [], 'no Attack Boost on this card');
    s = fx.attack(s, PLAIN, 1, 0);
    eq(find(s, 'attack')[0].data.parts, { atk: 60, boost: 0, card: 10 }, 'the damage formula uses the buffed ATK');
    s = fx.toTurnOf(fx.settleWithFirst(fx.endTurn(fx.settleWithFirst(s))), 0);
    eq(XS.leaderStats(s, 0, 1).atk, 30, 'gone next turn');
  });

  test('BP01-071 先導者の証 (review fix 2026-10-30): the +30 ATK is public turn state, so ATK read from either seat\'s XS.view equals the raw number', () => {
    let s = fx.arrange(game([['BP01-071', 2]]), (h) => h.hand(0, ['BP01-071', PLAIN]));
    s = fx.play(s, 'BP01-071');
    eq(XS.leaderStats(s, 0, 0).atk, 60);
    for (const seat of [0, 1]) {
      const v = XS.view(s, seat);
      eq(XS.leaderStats(v, 0, 0).atk, 60, `seat ${seat} view: ATK with the buff`);
      eq(XS.leaderStats(v, 1, 0).atk, 30);
      eq(v.players[0].buffs, [{ stat: 'atk', n: 30, until: 'turn' }]);
    }
    ok(!JSON.stringify(XS.view(s, 1).players[0].buffs).includes('ST01-'), 'no card ids in the buffs');
  });

  // ============================== tactics ==============================
  test('BP01-092 [On Play] draw 2 cards (cost 0)', () => {
    let s = tactical('BP01-092', (h) => h.top(1, ['ST01-014', 'ST01-015']));
    const iid = fx.idOf(s, 1, 'BP01-092', ['tarea']);
    eq(XS.costToPlay(s, iid), 0);
    const hand = P(s, 1).hand.length;
    s = fx.play(s, 'BP01-092');
    eq(P(s, 1).hand.length, hand + 2);
    eq(P(s, 1).hand.slice(-2).map((i) => s.cards[i].id), ['ST01-014', 'ST01-015']);
    eq(drawsBy(s, iid), 2); eq(P(s, 1).pp.untapped, 3, 'cost 0');
  });

  test('BP01-093 [On Play] the opponent discards 2 cards from their hand: they choose (cost 1); with 1 card they discard it, with none nothing', () => {
    let s = tactical('BP01-093');
    eq(XS.costToPlay(s, fx.idOf(s, 1, 'BP01-093', ['tarea'])), 1);
    const hand = P(s, 0).hand.length, trash = P(s, 0).trash.length;
    s = fx.play(s, 'BP01-093');
    eq([s.pending.seat, s.pending.purpose, s.pending.min, s.pending.max], [0, 'discard', 2, 2], 'the opponent decides');
    eq(XS.whoActs(s), 0);
    eq(XS.view(s, 1).pending.options, [], 'the card\'s owner does not see the opponent\'s hand');
    eq(s.pending.options.length, hand);
    throws(() => XS.apply(s, { type: 'choose', ids: [s.pending.options[0]] }), 'exactly 2 must be chosen', XS.Illegal);
    const keep = s.pending.options.slice(2);
    s = fx.choose(s, s.pending.options.slice(0, 2));
    eq(P(s, 0).hand, keep); eq(P(s, 0).trash.length, trash + 2);
    ok(XS.view(s, 1).players[0].trash.slice(-2).every((c) => c.hidden === true), 'face down');
    eq(find(s, 'discard').map((e) => e.seat), [0, 0]);
    // FAQ #47: with 1 card in hand, that card goes and nothing is asked
    let t = tactical('BP01-093', (h) => h.hand(0, ['ST02-013']));
    t = fx.play(t, 'BP01-093');
    eq(t.pending, null, 'nothing to choose'); eq(P(t, 0).hand.length, 0); ok(fx.has(t, 0, 'trash', 'ST02-013'));
    // an empty hand: a fizzle
    let u = tactical('BP01-093', (h) => h.hand(0, []));
    u = fx.play(u, 'BP01-093');
    eq(u.pending, null); eq(find(u, 'fizzle').length, 1);
  });

  test('BP01-094 [Play condition] only while more of your leaders are down than your opponent\'s; [On Play] revive 1 downed leader (asked), its equipment goes to the trash face up (FAQ #23)', () => {
    // equal numbers of downs, none, and fewer: not playable
    let n = tactical('BP01-094');
    let gate = fx.idOf(n, 1, 'BP01-094', ['tarea']);
    eq(XS.costToPlay(n, gate), 2);
    ok(XS.whyNot(n, gate) !== null && !XS.legalActions(n).some((a) => a.iid === gate), 'no downs at all');
    n = fx.arrange(n, (h) => { h.down(1, 1); h.down(0, 1); });
    ok(XS.whyNot(n, gate) !== null && !XS.legalActions(n).some((a) => a.iid === gate), 'equal numbers');
    n = fx.arrange(n, (h) => { h.down(0, 2); });
    ok(XS.whyNot(n, gate) !== null, 'the opponent has more down');
    throws(() => fx.play(n, 'BP01-094'), 'cannot be played', XS.Illegal);
    // more of ours down: playable
    let s = tactical('BP01-094', (h) => { h.awaken(1, 2); h.equip(1, 2, 'ST01-023'); h.down(1, 1); h.down(1, 2); h.down(0, 3); });
    ok(XS.whyNot(s, gate = fx.idOf(s, 1, 'BP01-094', ['tarea'])) === null && XS.legalActions(s).some((a) => a.iid === gate));
    const gear = L(s, 1, 2).equipment[0];
    const pp = P(s, 1).pp.untapped;
    s = fx.play(s, 'BP01-094');
    eq(P(s, 1).pp.untapped, pp - 2, 'cost 2');
    eq([s.pending.purpose, s.pending.options], ['revive', ['L11', 'L12']], 'only downed own leaders, chosen by the player');
    s = fx.choose(s, ['L12']);
    eq([L(s, 1, 2).down, L(s, 1, 2).damage, L(s, 1, 2).awakened, L(s, 1, 2).equipment], [false, 0, true, []], 'back up, awakening stays');
    ok(L(s, 1, 1).down, 'the other downed leader stays down');
    ok(P(s, 1).trash.includes(gear) && XS.view(s, 0).players[1].trash.includes(gear), 'the equipment is in the trash, face up');
    eq(find(s, 'revive')[0].data.equipment, [gear]);
    // one downed leader: still a question
    let t = tactical('BP01-094', (h) => h.down(1, 3));
    t = fx.play(t, 'BP01-094');
    eq([t.pending.purpose, t.pending.options], ['revive', ['L13']]);
    t = fx.choose(t, ['L13']);
    ok(!L(t, 1, 3).down);
  });
})();
