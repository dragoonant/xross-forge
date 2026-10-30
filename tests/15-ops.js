// Engine operations for the booster pool (docs/ABILITIES.md "Ops"). Booster cards are not registered yet, so every test builds SYNTHETIC cards
// with fx.withCards (tests/05-fixtures.js), plays them through XS.newGame / XS.apply, and asserts the side effect. One test (or a few) per
// op; each would fail on an engine without that op (the op is unknown, or the rule it carries is missing).
(function () {
  const XS = globalThis.XS;
  const { test, eq, ok, throws } = XS.T;
  const fx = XS.T.fx;
  const P = (s, seat) => s.players[seat];
  const L = (s, seat, slot) => s.players[seat].leaders[slot];
  const find = (s, type, pred) => s.log.filter((e) => e.type === type && (!pred || pred(e)));
  const idx = (s, type, pred) => s.log.findIndex((e) => e.type === type && (!pred || pred(e)));
  const none = { timing: 'attack', ops: [] };
  const atk = (...ops) => ({ timing: 'attack', ops });
  const after = (...ops) => ({ timing: 'afterAttack', ops });
  const onPlay = (...ops) => ({ timing: 'onPlay', ops });
  const boost = (n) => ({ timing: 'boost', ops: [{ op: 'dmgPlus', n }] });
  const stat = (...ops) => ({ timing: 'static', ops });
  const round = (...ops) => ({ timing: 'round', ops });
  const mem = (id, cost, ...effects) => ({ id, type: 'memoria', cost, effects });
  const att = (id, cost, ...effects) => ({ id, type: 'attack', cost, effects });
  const tac = (id, cost, kind, ...effects) => ({ id, type: 'tactics', cost, tactics: kind, effects });
  const oneOpp = { side: 'opp', count: 1 };
  const other = { side: 'opp', count: 1, other: true };
  const allOther = { side: 'opp', count: 'all', other: true };
  const ownOne = { side: 'own', count: 1 };

  // A game where seat 0 plays a ST01 deck extended with the synthetic main cards `main` ([id, qty]) and the tactics `tacs` (ids), seat 1 ST02
  // (or `o.opp`). o.first is 0 unless given.
  const game = (main, tacs, o) => fx.start(Object.assign({ decks: [fx.deckWith('ST01', main, tacs), (o && o.opp) || 'ST02'], pick: [tacs && tacs[0] ? tacs[0] : null, null] }, o));
  const drawsBy = (s, iid) => find(s, 'draw', (e) => e.data.cause === 'effect' && e.via === iid).length;
  const dmgOf = (s) => find(s, 'attack').slice(-1)[0].data.parts.card;
  const answer = (s, ids) => fx.choose(s, ids);
  const decline = (s) => XS.apply(s, { type: 'choose', ids: [] });
  const leftOf = (t, seat, slot) => XS.leaderStats(t, seat, slot).remaining;

  // ================= オーバーキルN =================
  test('Overkill N (FAQ #44, #115, R-005): the 【アタック後】 effect fires when the damage beat the remaining HP BEFORE the attack by N or more; 20 over is not enough for Overkill 30', () => {
    fx.withCards([att('T-OVK', 1, atk({ op: 'dmgPlus', n: 40 }), after({ op: 'draw', n: 1, if: { c: 'overkill', n: 30 } }))], () => {
      const run = (remaining) => {
        let s = game([['T-OVK', 8]]);
        s = fx.arrange(s, (h, t) => { h.hand(0, ['T-OVK']); h.damage(1, 0, XS.leaderStats(t, 1, 0).hp - remaining); });
        return fx.attack(s, 'T-OVK', 0, 0);      // 30 + 40 = 70 damage
      };
      const hit = run(40);                       // 70 against 40 left: 30 over
      const card = find(hit, 'play')[0].data.iid;
      eq(drawsBy(hit, card), 1, 'Overkill 30 triggered');
      eq(find(hit, 'overkill').length, 1); eq(find(hit, 'overkill')[0].data, { leader: 'L10', n: 30, excess: 30, card });
      const miss = run(50);                      // 70 against 50 left: 20 over
      eq(drawsBy(miss, find(miss, 'play')[0].data.iid), 0, '20 over does not trigger Overkill 30');
      eq(find(miss, 'overkill').length, 0);
    });
  });

  // ================= エコー =================
  test('Echo (R-024): at the end of the turn an upright Echo card turns sideways instead of being trashed; at the next main-phase start it is played again for free (【プレイ時】, a fresh boost) and stays sideways; one turn later it is trashed', () => {
    fx.withCards([mem('T-ECHO', 0, onPlay({ op: 'draw', n: 1 }), boost(20), stat({ op: 'echo' }))], () => {
      let s = game([['T-ECHO', 8]]);
      s = fx.arrange(s, (h) => h.hand(0, ['T-ECHO']));
      s = fx.play(s, 'T-ECHO');
      const iid = fx.idOf(s, 0, 'T-ECHO', ['play']);
      eq(P(s, 0).boosts, [iid], 'boost armed by the first play');
      s = fx.toTurnOf(fx.endTurn(s), 1);
      ok(P(s, 0).play.includes(iid), 'not trashed at the end of the turn');
      eq(P(s, 0).sideways, [iid], 'lying sideways');
      eq(P(s, 0).boosts, [], 'the unused boost ended with the turn (R-014)');
      eq(find(s, 'echo').map((e) => e.data.phase), ['sideways']);
      const draws = find(s, 'draw', (e) => e.data.cause === 'effect').length;
      s = fx.toTurnOf(s, 0);
      eq(find(s, 'draw', (e) => e.data.cause === 'effect').length, draws + 1, 'played again for free: 【プレイ時】 resolved');
      eq(P(s, 0).boosts, [iid], 'and the boost is armed again');
      eq(P(s, 0).sideways, [iid], 'still sideways');
      eq(find(s, 'ppSpend').filter((e) => e.data.for === iid).length, 0, 'no PP paid');
      eq(find(s, 'echo').map((e) => e.data.phase), ['sideways', 'replay']);
      s = fx.toTurnOf(fx.endTurn(s), 1);
      ok(!P(s, 0).play.includes(iid) && P(s, 0).trash.includes(iid), 'the sideways card is trashed at the next end of turn');
      eq(P(s, 0).sideways, []);
    });
  });

  test('Echo: the card counts in the play area while it lies there, and a round end trashes it like everything else', () => {
    fx.withCards([mem('T-ECHO2', 0, stat({ op: 'echo' })), att('T-CNT', 0, atk({ op: 'dmgPlus', n: 10, if: { c: 'playCount', type: 'memoria', min: 1 } }))], () => {
      let s = game([['T-ECHO2', 8], ['T-CNT', 8]]);
      s = fx.arrange(s, (h) => h.hand(0, ['T-ECHO2']));
      s = fx.play(s, 'T-ECHO2');
      s = fx.toTurnOf(fx.endTurn(s), 0);
      s = fx.arrange(s, (h) => h.hand(0, ['T-CNT']));
      s = fx.attack(s, 'T-CNT', 0, 0);
      eq(dmgOf(s), 10, 'the sideways Echo card counts as a memoria in the play area');
      let r = fx.arrange(fx.toTurnOf(fx.endTurn(fx.start({ decks: [fx.deckWith('ST01', [['T-ECHO2', 8]]), 'ST02'] })), 0), (h) => h.hand(0, ['T-ECHO2']));
      r = fx.play(r, 'T-ECHO2');
      r = fx.finishRound(r, 0);
      eq(P(r, 0).play.length, 0, 'round end empties the play area');
      eq(P(r, 0).sideways, []);
    });
  });

  // ================= 【ラウンド中】 =================
  test('【ラウンド中】 (card text: not trashed at the end of the turn): a round card stays in the play area, its ATK +10 applies to every own leader while it does, and the round end removes both', () => {
    fx.withCards([mem('T-FIELD', 0, round({ op: 'atkMod', n: 10 }))], () => {
      let s = game([['T-FIELD', 8]]);
      s = fx.arrange(s, (h) => h.hand(0, ['T-FIELD']));
      eq(XS.leaderStats(s, 0, 2).atk, 30);
      s = fx.play(s, 'T-FIELD');
      const iid = fx.idOf(s, 0, 'T-FIELD', ['play']);
      eq([0, 1, 2, 3].map((k) => XS.leaderStats(s, 0, k).atk), [40, 40, 40, 40], 'all own leaders');
      eq(XS.leaderStats(s, 1, 0).atk, 30, 'not the opponent\'s');
      s = fx.toTurnOf(fx.endTurn(s), 0);
      ok(P(s, 0).play.includes(iid), 'still in the play area two turns later');
      eq(XS.leaderStats(s, 0, 0).atk, 40);
      s = fx.finishRound(s, 0);
      eq(P(s, 0).play.length, 0, 'trashed at the round end');
      eq(XS.leaderStats(s, 0, 3).atk, 30);
    });
  });

  test('先導者の証 (atkBuff, R-043): "this turn" +30 ATK to every own leader ends with the turn', () => {
    fx.withCards([mem('T-BUFF', 0, onPlay({ op: 'atkBuff', n: 30, until: 'turn' }))], () => {
      let s = game([['T-BUFF', 8]]);
      s = fx.arrange(s, (h) => h.hand(0, ['T-BUFF', 'ST01-011']));
      s = fx.play(s, 'T-BUFF');
      eq(XS.leaderStats(s, 0, 1).atk, 60);
      s = fx.attack(s, 'ST01-011', 0, 0);
      eq(find(s, 'attack')[0].data.parts.atk, 60, 'the damage formula uses the buffed ATK');
      s = fx.toTurnOf(fx.endTurn(s), 0);
      eq(XS.leaderStats(s, 0, 1).atk, 30, 'gone next turn');
    });
  });

  // ================= cost modifiers =================
  test('Cost modifiers (FAQ #138, R-034): 復活ビーコン costs 1 per card in your play area less, never below 1, and 電磁スモーク in the opponent\'s play area adds 1 BEFORE that floor: five cards in play is 1, not 2', () => {
    fx.withCards([
      tac('T-BEACON', 4, 'consumption', stat({ op: 'costMod', n: { perPlay: { each: -1 } } }, { op: 'costFloor', n: 1 })),
      tac('T-SMOKE', 1, 'consumption', round({ op: 'costAura', who: 'opp', cardType: 'tactics', n: 1 })),
    ], () => {
      let s = fx.start({ decks: [fx.deckWith('ST01', [], ['T-BEACON']), fx.deckWith('ST02', [], ['T-SMOKE'])], pick: ['T-BEACON', 'T-SMOKE'] });
      const beacon = fx.idOf(s, 0, 'T-BEACON', ['tarea']);
      eq(XS.costToPlay(s, beacon), 4, 'nothing in play');
      s = fx.arrange(s, (h) => { for (const no of ['ST01-013', 'ST01-014']) { h.give(0, no, 'play'); h.give(0, no, 'play'); } h.give(0, 'ST01-015', 'play'); });
      eq(P(s, 0).play.length, 5);
      eq(XS.costToPlay(s, beacon), 1, 'five cards: 4 - 5 floors at 1');
      s = fx.arrange(s, (h) => h.give(1, 'T-SMOKE', 'play'));
      eq(XS.costToPlay(s, beacon), 1, 'FAQ #138: with the opponent\'s smoke it is still 1');
      let t = fx.arrange(fx.start({ decks: [fx.deckWith('ST01', [], ['T-BEACON']), fx.deckWith('ST02', [], ['T-SMOKE'])], pick: ['T-BEACON', 'T-SMOKE'] }), (h) => { h.give(0, 'ST01-013', 'play'); h.give(0, 'ST01-013', 'play'); h.give(1, 'T-SMOKE', 'play'); });
      eq(XS.costToPlay(t, fx.idOf(t, 0, 'T-BEACON', ['tarea'])), 3, 'two cards in play, smoke: 4 + 1 - 2');
      t = fx.arrange(t, (h) => h.trash(1, fx.idOf(t, 1, 'T-SMOKE', ['play'])));
      eq(XS.costToPlay(t, fx.idOf(t, 0, 'T-BEACON', ['tarea'])), 2, 'smoke gone: 4 - 2');
    });
  });

  test('Cost modifiers: the cost shown is the cost paid (whyNot and the PP spent come from costToPlay), and a 電磁スモーク-style aura makes a tactics card too dear', () => {
    fx.withCards([
      tac('T-SMOKE2', 1, 'consumption', round({ op: 'costAura', who: 'opp', cardType: 'tactics', n: 1 })),
      tac('T-TAC', 1, 'consumption', onPlay({ op: 'draw', n: 1 })),
    ], () => {
      let s = fx.start({ decks: [fx.deckWith('ST01', [], ['T-TAC']), fx.deckWith('ST02', [], ['T-SMOKE2'])], pick: ['T-TAC', 'T-SMOKE2'] });
      s = fx.toTurnOf(s, 0);
      s = fx.toTurnOf(fx.endTurn(s), 0);   // seat 0's second turn: tactics are allowed
      s = fx.arrange(s, (h) => { h.give(1, 'T-SMOKE2', 'play'); h.spend(0, 2); });
      const tid = fx.idOf(s, 0, 'T-TAC', ['tarea']);
      eq(XS.costToPlay(s, tid), 2);
      ok(XS.whyNot(s, tid) !== null, 'one upright PP is not enough for a cost of 2: ' + XS.whyNot(s, tid));
      s = fx.arrange(s, (h) => h.t.players[0].pp.untapped++ && 0);
      eq(P(s, 0).pp.untapped, 2);
      s = fx.play(s, 'T-TAC');
      eq(find(s, 'ppSpend').slice(-1)[0].data.n, 2, 'paid the modified cost');
    });
  });

  test('Cost modifiers: 壁ジャンプ is free while exactly one other copy is in the play area (two or more: pay); フォールダウンシールド costs 5 less after a lost round', () => {
    fx.withCards([
      att('T-WALL', 3, stat({ op: 'costFree', if: { c: 'playCount', sameName: true, other: true, min: 1, max: 1 } }), none),
      tac('T-SHIELD', 5, 'equipment', stat({ op: 'costMod', n: -5, if: { c: 'lostLastRound' } })),
    ], () => {
      let s = game([['T-WALL', 8]]);
      s = fx.arrange(s, (h) => h.hand(0, ['T-WALL', 'T-WALL', 'T-WALL']));
      const walls = P(s, 0).hand.slice();
      eq(XS.costToPlay(s, walls[0]), 3, 'none in play');
      s = fx.arrange(s, (h) => h.t.players[0].play.push(...[]));
      const one = fx.arrange(s, (h, t) => { const w = h.give(0, 'T-WALL', 'play'); void w; });
      eq(XS.costToPlay(one, P(one, 0).hand[0]), 0, 'one other copy in play');
      const two = fx.arrange(one, (h) => h.give(0, 'T-WALL', 'play'));
      eq(XS.costToPlay(two, P(two, 0).hand[0]), 3, 'two others: the cost is paid');
      let r = fx.start({ decks: [fx.deckWith('ST01', [], ['T-SHIELD']), 'ST02'], pick: ['T-SHIELD', null] });
      eq(XS.costToPlay(r, fx.idOf(r, 0, 'T-SHIELD', ['tarea'])), 5, 'round 1: no previous round');
      r = fx.finishRound(r, 1);              // seat 0 lost round 1
      eq(XS.costToPlay(r, fx.idOf(r, 0, 'T-SHIELD', ['tarea'])), 0, 'the loser of the last round');
      ok(r.lastLoser === 0);
    });
  });

  // ================= may / optional =================
  test('"May" choices (FAQ #8): CLUTCH!!! reveals a cost-0 card (min 0: an explicit decline is a legal answer), discards it, then draws and gets +40 - only if it did', () => {
    fx.withCards([att('T-CLUTCH', 1, atk(
      { op: 'reveal', n: 1, optional: true, filter: { cost: 0 } }, { op: 'discard', of: 'revealed' },
      { op: 'draw', n: 1, if: { c: 'did' } }, { op: 'dmgPlus', n: 40, if: { c: 'did' } }), none), mem('T-ZERO', 0, onPlay())], () => {
      const setup = () => fx.arrange(game([['T-CLUTCH', 8], ['T-ZERO', 8]]), (h) => h.hand(0, ['T-CLUTCH', 'T-ZERO', 'ST01-013']));
      let s = fx.play(setup(), 'T-CLUTCH', { attacker: 'L00', target: 'L10' });
      eq([s.pending.kind, s.pending.purpose, s.pending.min, s.pending.max], ['choose', 'reveal', 0, 1]);
      eq(s.pending.options.map((i) => s.cards[i].id), ['T-ZERO'], 'only the cost-0 card is offered (ST01-013 costs more)');
      ok(XS.legalActions(s).some((a) => a.type === 'choose' && a.ids.length === 0), 'declining is a legal action');
      ok(XS.view(s, 1).pending.options.length === 0, 'the opponent does not see the offered hand cards');
      const hand = P(s, 0).hand.length;
      const yes = answer(s, s.pending.options);
      eq(P(yes, 0).hand.length, hand, 'revealed card discarded, one drawn');
      eq(dmgOf(yes), 40, '+40 because it did');
      const rev = find(yes, 'look', (e) => e.data.phase === 'reveal')[0];
      eq(rev.data.revealed, true); eq(rev.data.cardIds, ['T-ZERO']);
      eq(XS.view(yes, 1).log.find((e) => e.type === 'look').data.cardIds, ['T-ZERO'], 'the reveal is public');
      const no = decline(s);
      eq(P(no, 0).hand.length, hand, 'nothing discarded, nothing drawn');
      eq(dmgOf(no), 0, 'no bonus');
      eq(find(no, 'draw', (e) => e.data.cause === 'effect').length, 0);
    });
  });

  test('"May" choices: 大黒柱 (discard up to 1, then +20) and 仁義なき抗争 (a yes/no, then a RANDOM discard, then +30)', () => {
    fx.withCards([
      att('T-PILLAR', 1, atk({ op: 'discard', n: 1, optional: true }, { op: 'dmgPlus', n: 20, if: { c: 'did' } })),
      att('T-RANDOM', 1, atk({ op: 'discard', n: 1, optional: true, random: true }, { op: 'dmgPlus', n: 30, if: { c: 'did' } })),
    ], () => {
      const base = (no) => fx.arrange(game([['T-PILLAR', 8], ['T-RANDOM', 8]]), (h) => h.hand(0, [no, 'ST01-013', 'ST01-014']));
      let s = fx.play(base('T-PILLAR'), 'T-PILLAR', { attacker: 'L00', target: 'L10' });
      eq([s.pending.purpose, s.pending.min, s.pending.max, s.pending.options.length], ['discard', 0, 1, 2]);
      const paid = answer(s, [s.pending.options[0]]);
      eq(dmgOf(paid), 20); eq(P(paid, 0).hand.length, 1); eq(find(paid, 'discard').length, 1);
      eq(dmgOf(decline(s)), 0, 'declined: no bonus, hand untouched');
      let r = fx.play(base('T-RANDOM'), 'T-RANDOM', { attacker: 'L00', target: 'L10' });
      eq([r.pending.purpose, r.pending.min, r.pending.options.length], ['may', 0, 1], 'a yes/no first; the discard itself is not chosen');
      const yes = answer(r, r.pending.options);
      eq(dmgOf(yes), 30); eq(P(yes, 0).hand.length, 1, 'one card discarded at random');
      eq(dmgOf(decline(r)), 0);
      const again = answer(fx.play(base('T-RANDOM'), 'T-RANDOM', { attacker: 'L00', target: 'L10' }), [r.pending.options[0]]);
      eq(find(again, 'discard')[0].data.cardIds, find(yes, 'discard')[0].data.cardIds, 'same position, same seed: same random card (engine RNG)');
    });
  });

  test('"May" choices: "…ダメージを与えてもよい。そうしたなら…" - a leader with 40 or more left may take 30 for 2 cards; leaders with less are not offered; declining is free', () => {
    fx.withCards([mem('T-PACT', 0, onPlay({ op: 'damage', n: 30, to: { side: 'own', count: 1, remainingAtLeast: 40 }, optional: true }, { op: 'draw', n: 2, if: { c: 'did' } }))], () => {
      let s = fx.arrange(game([['T-PACT', 8]]), (h, t) => { h.hand(0, ['T-PACT']); h.damage(0, 0, XS.leaderStats(t, 0, 0).hp - 30); });
      s = fx.play(s, 'T-PACT');
      eq(s.pending.options, ['L01', 'L02', 'L03'], 'the leader with 30 left is not offered');
      eq(s.pending.min, 0);
      const hand = P(s, 0).hand.length;
      const paid = answer(s, ['L02']);
      eq(L(paid, 0, 2).damage, 30); eq(P(paid, 0).hand.length, hand + 2);
      const no = decline(s);
      eq(L(no, 0, 2).damage, 0); eq(P(no, 0).hand.length, hand);
    });
  });

  test('Reveal values: オーバードライブ (reveal up to 2, discard them, +30 per attack card and draw 2 per memoria discarded) and キャプテンズ・リターン (reveal a card of cost 3 or less, draw as many cards as its cost)', () => {
    fx.withCards([
      att('T-DRIVE', 1, atk(
        { op: 'reveal', n: 2, optional: true }, { op: 'discard', of: 'revealed' },
        { op: 'dmgPlus', n: { perRevealed: { type: 'attack', each: 30 } } }, { op: 'draw', n: { perRevealed: { type: 'memoria', each: 2 } } })),
      mem('T-CAPT', 0, onPlay({ op: 'reveal', n: 1, optional: true, filter: { maxCost: 3 } }, { op: 'draw', n: { revealedCost: true }, if: { c: 'did' } })),
    ], () => {
      let s = fx.arrange(game([['T-DRIVE', 8], ['T-CAPT', 8]]), (h) => h.hand(0, ['T-DRIVE', 'ST01-011', 'ST01-013', 'ST01-014']));
      s = fx.play(s, 'T-DRIVE', { attacker: 'L00', target: 'L10' });
      const a = fx.idOf(s, 0, 'ST01-011', ['hand']), m1 = fx.idOf(s, 0, 'ST01-013', ['hand']), m2 = fx.idOf(s, 0, 'ST01-014', ['hand']);
      throws(() => answer(s, [a, m1, m2]), 'at most 2', XS.Illegal);
      const t = answer(s, [a, m1]);
      eq(dmgOf(t), 30, 'one attack card revealed: +30');
      eq(find(t, 'draw', (e) => e.data.cause === 'effect' && e.via === find(t, 'play')[0].data.iid).length, 2, 'one memoria revealed: 2 cards');
      eq(P(t, 0).hand.length, 1 + 2, 'two discarded, two drawn, one card kept');
      let c = fx.arrange(game([['T-CAPT', 8]]), (h) => h.hand(0, ['T-CAPT', 'ST01-015']));
      const cost = XS.CARDS['ST01-015'].cost;
      c = fx.play(c, 'T-CAPT');
      const hand = P(c, 0).hand.length;
      c = answer(c, c.pending.options);
      eq(find(c, 'draw', (e) => e.data.cause === 'effect').length, cost, 'as many cards as the revealed card costs (' + cost + ')');
      eq(P(c, 0).hand.length, hand + cost);
    });
  });

  // ================= look at the top of the deck =================
  const lookDefs = () => [
    mem('T-LOOK', 0, onPlay({ op: 'look', n: 3 }, { op: 'lookPick', to: 'hand', filter: { type: 'memoria', maxCost: 1 }, min: 1, max: 1 }, { op: 'lookRest' })),
    mem('T-SEE', 0, onPlay({ op: 'look', n: 1 }, { op: 'lookPick', to: 'trash', min: 0, max: 1 }, { op: 'draw', n: 1, if: { c: 'did' } })),
    mem('T-M0', 0), mem('T-M1', 1), mem('T-M2', 2),
  ];
  test('Look at the top N (PM p.14 Q1): choose a matching card into the hand, the rest go to the trash face down; the opponent sees only counts and the chooser alone sees the options', () => {
    fx.withCards(lookDefs(), () => {
      let s = game([['T-LOOK', 4], ['T-M0', 4], ['T-M1', 4], ['T-M2', 4]]);
      s = fx.arrange(s, (h) => { h.hand(0, ['T-LOOK']); h.top(0, ['T-M2', 'T-M1', 'T-M0']); });
      const deck = P(s, 0).deck.length, trash = P(s, 0).trash.length;
      s = fx.play(s, 'T-LOOK');
      eq([s.pending.kind, s.pending.purpose, s.pending.to, s.pending.min, s.pending.max], ['choose', 'look', 'hand', 1, 1]);
      eq(s.pending.options.map((i) => s.cards[i].id), ['T-M1', 'T-M0'], 'memoria of cost 1 or less among the three');
      const mine = XS.view(s, 0), theirs = XS.view(s, 1);
      ok(s.pending.options.every((i) => mine.cards[i] !== undefined), 'the chooser can see the cards');
      eq(theirs.pending.options, [], 'the opponent cannot');
      ok(s.pending.options.every((i) => theirs.cards[i] === undefined), 'nor in view.cards');
      const lookEntry = theirs.log.find((e) => e.type === 'look');
      eq(lookEntry.data, { phase: 'see', from: 'deck', side: 0, n: 3, revealed: false, hidden: true });
      const pick = s.pending.options.find((i) => s.cards[i].id === 'T-M0');
      s = answer(s, [pick]);
      ok(P(s, 0).hand.includes(pick), 'in hand');
      eq(P(s, 0).deck.length, deck - 3, 'all three looked-at cards left the deck');
      eq(P(s, 0).trash.length, trash + 2, 'two of them are in the trash');
      const v1 = XS.view(s, 1);
      ok(!JSON.stringify(v1).includes('"' + pick + '"'), 'the opponent\'s view never names the taken card');
      eq(v1.log.filter((e) => e.type === 'look').map((e) => e.data.phase), ['see', 'take', 'trash']);
    });
  });

  test('Look: "may put it into the trash" is an optional choice with a decline; the follow-up reads whether it did', () => {
    fx.withCards(lookDefs(), () => {
      let s = fx.arrange(game([['T-SEE', 4], ['T-M0', 4]]), (h) => { h.hand(0, ['T-SEE']); h.top(0, ['T-M0']); });
      const top = P(s, 0).deck[0];
      s = fx.play(s, 'T-SEE');
      eq([s.pending.min, s.pending.max, s.pending.to], [0, 1, 'trash']);
      const yes = answer(s, [top]);
      ok(P(yes, 0).trash.includes(top)); eq(find(yes, 'draw', (e) => e.data.cause === 'effect').length, 1);
      const no = decline(s);
      eq(P(no, 0).deck[0], top, 'still on top'); eq(find(no, 'draw', (e) => e.data.cause === 'effect').length, 0);
    });
  });

  test('Look with a short deck (PM p.14 Q1, FAQ #109/#117/#119): the deck-out procedure runs once, the remaining card stays on top and is part of the cards looked at', () => {
    fx.withCards(lookDefs(), () => {
      let s = game([['T-LOOK', 4], ['T-M0', 20], ['T-M1', 4]]);
      s = fx.arrange(s, (h) => { h.hand(0, ['T-LOOK']); h.thinDeck(0, 1); });
      const only = P(s, 0).deck[0];
      ok(P(s, 0).trash.length > 5);
      s = fx.play(s, 'T-LOOK');
      eq(find(s, 'reshuffle').length, 1, 'one reshuffle'); eq(find(s, 'tacticsBurn').length, 1, 'one tactics card lost');
      ok(find(s, 'look')[0].data.iids[0] === only, 'the card that was left is the first one looked at');
      eq(find(s, 'look')[0].data.n, 3);
    });
  });

  test('Look at the OPPONENT\'s deck and reveal it (神速フリック): the top card goes to their trash, both players see it, and an attack card gives +20', () => {
    fx.withCards([att('T-FLICK', 1, atk({ op: 'look', n: 1, side: 'opp', reveal: true }, { op: 'lookRest' }, { op: 'dmgPlus', n: 20, if: { c: 'seenType', type: 'attack' } }))], () => {
      const run = (top) => {
        let s = game([['T-FLICK', 8]]);
        s = fx.arrange(s, (h) => { h.hand(0, ['T-FLICK']); h.top(1, [top]); });
        const iid = P(s, 1).deck[0];
        s = fx.attack(s, 'T-FLICK', 0, 0);
        ok(P(s, 1).trash.includes(iid), 'trashed from the opponent\'s deck');
        eq(find(s, 'look')[0].data.revealed, true);
        eq(XS.view(s, 1).log.find((e) => e.type === 'look').data.cardIds, [top], 'both sides see which card it was');
        return dmgOf(s);
      };
      eq(run('ST02-011'), 20, 'an attack card');
      eq(run('ST02-014'), 0, 'a memoria');
    });
  });

  // ================= free play =================
  test('Free play from the cards looked at (リンク・アサルト, R-044, FAQ #70): a cost-1 memoria is placed at the far right of the play area without PP, its 【プレイ時】 resolves only AFTER the attack (and the awakening) is over, and its boost then waits for the next attack', () => {
    fx.withCards([
      att('T-LINK', 1, none, after({ op: 'look', n: 3 }, { op: 'freePlay', from: 'look', filter: { type: 'memoria', maxCost: 1 }, min: 0, max: 1 }, { op: 'lookRest' })),
      mem('T-FREE', 1, onPlay({ op: 'draw', n: 1 }), boost(30)),
    ], () => {
      let s = game([['T-LINK', 8], ['T-FREE', 8]]);
      s = fx.arrange(s, (h, t) => { h.hand(0, ['T-LINK']); h.top(0, ['ST01-011', 'T-FREE', 'ST01-012']); h.damage(1, 0, XS.leaderStats(t, 1, 0).hp - 10); });
      const pp = P(s, 0).pp.untapped;
      s = fx.attack(s, 'T-LINK', 0, 0);
      eq(s.pending.purpose, 'freePlay');
      eq(s.pending.options.map((i) => s.cards[i].id), ['T-FREE']);
      s = answer(s, s.pending.options);
      const free = fx.idOf(s, 0, 'T-FREE', ['play']);
      eq(P(s, 0).play.slice(-1)[0], free, 'far right of the play area');
      eq(P(s, 0).pp.untapped, pp - 1, 'only the attack card was paid for');
      eq(find(s, 'freePlay').length, 1);
      ok(idx(s, 'awaken') !== -1 && idx(s, 'awaken') < idx(s, 'ability', (e) => e.data.src === free), 'its effect resolves after the attack ended and the attacker awakened');
      eq(drawsBy(s, free), 1, 'then it drew');
      eq(P(s, 0).boosts, [free], 'its boost is armed for the next attack');
      eq(find(s, 'look', (e) => e.data.phase === 'trash')[0].data.n, 2, 'the other two looked-at cards were trashed');
    });
  });

  test('Free play from the hand in a chosen order under a limit (一騎当千 / 巡り合う二人): cost sum at most 3, one memoria and one attack at most; the order of the answer is the order of the cards in the play area and of their resolution; a pick over the limit is refused', () => {
    fx.withCards([
      mem('T-HAND', 0, onPlay(
        { op: 'freePlay', from: 'hand', filter: { maxCost: 2 }, min: 0, max: 5, limit: { costSumAtMost: 3, perType: { memoria: 2, attack: 1 } } })),
      mem('T-A', 1, onPlay({ op: 'draw', n: 1 })), mem('T-B', 2, onPlay({ op: 'recoverPP', n: 1 })), mem('T-C', 2, onPlay()),
      att('T-AT', 1, none),
    ], () => {
      let s = game([['T-HAND', 4], ['T-A', 4], ['T-B', 4], ['T-C', 4], ['T-AT', 4]]);
      s = fx.arrange(s, (h) => h.hand(0, ['T-HAND', 'T-A', 'T-B', 'T-C', 'T-AT']));
      s = fx.play(s, 'T-HAND');
      const a = fx.idOf(s, 0, 'T-A', ['hand']), b = fx.idOf(s, 0, 'T-B', ['hand']), c = fx.idOf(s, 0, 'T-C', ['hand']), at = fx.idOf(s, 0, 'T-AT', ['hand']);
      eq(s.pending.purpose, 'freePlay');
      throws(() => answer(s, [a, b, c]), 'cost 1+2+2 = 5 is over the limit of 3', XS.Illegal);
      throws(() => answer(s, [b, c]), 'cost 4', XS.Illegal);
      ok(XS.legalActions(s).every((x) => x.type !== 'choose' || x.ids.reduce((n, i) => n + (XS.CARDS[s.cards[i].id].cost || 0), 0) <= 3), 'the sampled legal actions respect the limit');
      const t = answer(s, [b, a]);          // 2 + 1 = 3: B first, then A
      eq(P(t, 0).play.slice(-2), [b, a], 'play-area order = answer order');
      const ab = find(t, 'ability', (e) => e.data.timing === 'onPlay').map((e) => e.data.src);
      eq(ab, [find(t, 'play')[0].data.iid, b, a], 'resolved left to right after the card that played them');
      eq(find(t, 'ppSpend').filter((e) => e.data.for === a || e.data.for === b).length, 0, 'no PP for the free cards');
    });
  });

  test('Free play order (FAQ #70): a card placed while the queue resolves joins the far right: X plays Y and Z, Y plays W: resolution X, Y, Z, W', () => {
    fx.withCards([
      mem('T-X', 0, onPlay({ op: 'freePlay', from: 'hand', filter: { notSameName: true }, min: 2, max: 2 })),
      mem('T-Y', 0, onPlay({ op: 'freePlay', from: 'hand', filter: { type: 'memoria' }, min: 1, max: 1 })),
      mem('T-Z', 0, onPlay({ op: 'draw', n: 1 })), mem('T-W', 0, onPlay({ op: 'draw', n: 1 })),
    ], () => {
      let s = game([['T-X', 4], ['T-Y', 4], ['T-Z', 4], ['T-W', 4]]);
      s = fx.arrange(s, (h) => h.hand(0, ['T-X', 'T-Y', 'T-Z', 'T-W']));
      s = fx.play(s, 'T-X');
      const y = fx.idOf(s, 0, 'T-Y', ['hand']), z = fx.idOf(s, 0, 'T-Z', ['hand']);
      s = answer(s, [y, z]);
      eq(s.pending.purpose, 'freePlay', 'Y asks for its card when it resolves, after X is done');
      const w = fx.idOf(s, 0, 'T-W', ['hand']);
      s = answer(s, [w]);
      const order = find(s, 'ability', (e) => e.data.timing === 'onPlay').map((e) => s.cards[e.data.src].id);
      eq(order, ['T-X', 'T-Y', 'T-Z', 'T-W']);
      eq(P(s, 0).play.slice(-4).map((i) => s.cards[i].id), ['T-X', 'T-Y', 'T-Z', 'T-W']);
    });
  });

  test('Free play of an attack card (頂点捕食者): the attack card is placed at once and runs as a full attack (attacker and target asked) after the first one has finished (R-044)', () => {
    fx.withCards([
      att('T-APEX', 1, none, after({ op: 'freePlay', from: 'hand', filter: { type: 'attack', maxCost: 2, notSameName: true }, min: 0, max: 1 })),
      att('T-SMALL', 2, atk({ op: 'dmgPlus', n: 10 })),
    ], () => {
      let s = game([['T-APEX', 8], ['T-SMALL', 8]]);
      s = fx.arrange(s, (h) => h.hand(0, ['T-APEX', 'T-SMALL']));
      s = fx.attack(s, 'T-APEX', 0, 0);
      s = answer(s, s.pending.options);
      eq(s.pending.kind, 'attackPair', 'the free attack asks for its attacker and target');
      eq(find(s, 'attack').length, 1, 'the first attack is over, the second has not started');
      s = XS.apply(s, { type: 'attack', attacker: 'L01', target: 'L11' });
      eq(find(s, 'attack').length, 2);
      eq(find(s, 'attack')[1].data.damage, 40, 'ATK 30 + 10 of the free card');
      eq(L(s, 1, 1).damage, 40);
      eq(find(s, 'ppSpend').length, 1, 'only the first card cost PP');
    });
  });

  test('Multi-attack (R-025, FAQ #114): a free-played card from the 【アタック後】 of a three-attack card resolves after the THIRD attack (synthetic ストームラッシュ; no booster card is registered yet)', () => {
    fx.withCards([
      att('T-STORM', 1, atk({ op: 'dmgPlus', n: 10 }), atk({ op: 'dmgPlus', n: 10 }), atk({ op: 'dmgPlus', n: 10 }), after({ op: 'freePlay', from: 'hand', filter: { type: 'memoria' }, min: 0, max: 1 })),
      mem('T-LATE', 0, onPlay({ op: 'draw', n: 1 })),
    ], () => {
      let s = game([['T-STORM', 8], ['T-LATE', 8]]);
      s = fx.arrange(s, (h) => h.hand(0, ['T-STORM', 'T-LATE', 'T-LATE', 'T-LATE']));
      s = fx.attack(s, 'T-STORM', 0, 0);
      let guard = 0;
      while (s.pending !== null && guard++ < 20) {
        if (s.pending.kind === 'attackPair') s = XS.apply(s, { type: 'attack', attacker: 'L0' + (guard % 4), target: 'L1' + (guard % 4) });
        else if (s.pending.purpose === 'freePlay') s = answer(s, [s.pending.options[0]]);
        else s = XS.apply(s, XS.legalActions(s)[0]);
      }
      eq(find(s, 'attack').length, 3, 'three attacks');
      const lastAtk = find(s, 'attack')[2].seq;
      const lateAbility = find(s, 'ability', (e) => s.cards[e.data.src].id === 'T-LATE');
      ok(lateAbility.length >= 1 && lateAbility.every((e) => e.seq > lastAtk), 'every free memoria effect came after the third attack');
    });
  });

  // ================= conditions =================
  const condBonus = (cond, arrange, atkSlot) => {
    const id = 'T-CND';
    return fx.withCards([att(id, 0, atk({ op: 'dmgPlus', n: 10, if: cond }))], () => {
      let s = game([[id, 8], ['ST01-013', 4], ['ST01-014', 4]]);
      s = fx.arrange(s, (h, t) => { h.hand(0, [id]); if (arrange) arrange(h, t); });
      const iid = fx.idOf(s, 0, id, ['hand']);
      const prev = XS.previewAttackDetail(s, { type: 'play', iid, attacker: 'L0' + (atkSlot || 0), target: 'L10' }).card;   // the preview reads the same condition
      s = fx.attack(s, id, atkSlot || 0, 0);
      eq(prev, dmgOf(s), 'preview and attack agree');
      return dmgOf(s);
    });
  };
  test('Conditions: playCount - other cards in the play area ("プレイエリアに他のカードがない", "他のアタックカードがN枚以上", "コスト2のカードがある")', () => {
    eq(condBonus({ c: 'playCount', other: true, max: 0 }), 10, 'empty apart from itself');
    eq(condBonus({ c: 'playCount', other: true, max: 0 }, (h) => h.give(0, 'ST01-013', 'play')), 0, 'a memoria is there');
    eq(condBonus({ c: 'playCount', type: 'attack', other: true, min: 2 }, (h) => { h.give(0, 'ST01-011', 'play'); h.give(0, 'ST01-011', 'play'); }), 10, 'two other attack cards');
    eq(condBonus({ c: 'playCount', type: 'attack', other: true, min: 2 }, (h) => h.give(0, 'ST01-011', 'play')), 0, 'one is not enough');
    eq(condBonus({ c: 'playCount', cost: 2, min: 1 }, (h) => h.give(0, 'ST01-015', 'play')), XS.CARDS['ST01-015'].cost === 2 ? 10 : 0, 'a card of cost 2 (ST01-015 costs ' + XS.CARDS['ST01-015'].cost + ')');
    eq(condBonus({ c: 'playCount', type: 'memoria', min: 1 }, (h) => h.give(0, 'ST01-013', 'play')), 10, 'type filter');
  });
  test('Conditions: roundIs, attackerAwakened, attackerDamaged, attackerRemaining, attackerColor, ownColorsDiffer', () => {
    eq(condBonus({ c: 'roundIs', n: 1 }), 10); eq(condBonus({ c: 'roundIs', n: 3 }), 0);
    eq(condBonus({ c: 'attackerAwakened' }, (h) => h.awaken(0, 0)), 10); eq(condBonus({ c: 'attackerAwakened' }), 0);
    eq(condBonus({ c: 'attackerAwakened' }, (h) => h.awaken(0, 0), 1), 0, 'a different leader attacks: its own face counts');
    eq(condBonus({ c: 'attackerDamaged' }, (h) => h.damage(0, 0, 10)), 10); eq(condBonus({ c: 'attackerDamaged' }), 0);
    eq(condBonus({ c: 'attackerRemaining', n: 10 }, (h, t) => h.damage(0, 0, XS.leaderStats(t, 0, 0).hp - 10)), 10);
    eq(condBonus({ c: 'attackerRemaining', n: 10 }), 0);
    eq(condBonus({ c: 'attackerColor', color: 'blue' }, null, 0), 10, 'ST01-001 is blue'); eq(condBonus({ c: 'attackerColor', color: 'blue' }, null, 2), 0, 'ST01-003 is green');
    eq(condBonus({ c: 'ownColorsDiffer' }), 0, 'blue, blue, green, green');
    const rainbow = Object.assign({}, XS.DECKS.ST01, { leaders: ['ST01-001', 'ST01-003', 'ST02-001', 'ST02-003'], main: XS.DECKS.ST01.main.concat([['T-CND', 8]]) });
    fx.withCards([att('T-CND', 0, atk({ op: 'dmgPlus', n: 10, if: { c: 'ownColorsDiffer' } }))], () => {
      let s = fx.start({ decks: [rainbow, 'ST02'] });
      s = fx.arrange(s, (h) => h.hand(0, ['T-CND']));
      eq(dmgOf(fx.attack(s, 'T-CND', 0, 0)), 10, 'blue, green, red, yellow');
    });
  });
  test('Conditions: discardedThisTurn, trashHasName, and a play restriction (復活ポータル: more downed leaders than the opponent)', () => {
    fx.withCards([
      mem('T-DISC', 0, onPlay({ op: 'discard', n: 1 })),
      att('T-AFTERDISC', 0, atk({ op: 'dmgPlus', n: 10, if: { c: 'discardedThisTurn' } })),
      att('T-NAME', 0, atk({ op: 'dmgPlus', n: 10, if: { c: 'trashHasName', name: 'T-DISC' } })),
      tac('T-GATE', 0, 'consumption', stat({ op: 'playIf', if: { c: 'downMoreThanOpp' }, msg: 'You need more downed leaders than the opponent.' }), onPlay()),
    ], () => {
      let s = game([['T-DISC', 8], ['T-AFTERDISC', 8], ['T-NAME', 8]], ['T-GATE']);
      s = fx.arrange(s, (h) => h.hand(0, ['T-DISC', 'T-AFTERDISC', 'ST01-013']));
      const noDiscard = fx.attack(s, 'T-AFTERDISC', 0, 0);
      eq(dmgOf(noDiscard), 0, 'no discard yet this turn');
      s = fx.play(s, 'T-DISC');
      s = answer(s, [s.pending.options.find((i) => s.cards[i].id === 'ST01-013')]);
      eq(dmgOf(fx.attack(s, 'T-AFTERDISC', 0, 0)), 10, 'after a discard');
      let n = fx.arrange(game([['T-NAME', 8], ['T-DISC', 8]]), (h) => { h.hand(0, ['T-NAME']); h.give(0, 'T-DISC', 'trash'); });
      eq(dmgOf(fx.attack(n, 'T-NAME', 0, 0)), 10, 'a card named T-DISC in the trash');
      // the play restriction: the PP Ticket-style tactics card can only be played with more downed leaders (seat 1 holds it so it may play on turn 1)
      let g = fx.toTurnOf(game([], [], { opp: fx.deckWith('ST02', [], ['T-GATE']), pick: [null, 'T-GATE'] }), 1);
      const gate = fx.idOf(g, 1, 'T-GATE', ['tarea']);
      eq(XS.whyNot(g, gate), 'You need more downed leaders than the opponent.');
      ok(!XS.legalActions(g).some((a) => a.iid === gate));
      g = fx.arrange(g, (h) => { h.down(1, 0); });
      eq(XS.whyNot(g, gate), null, 'one more of ours down'); ok(XS.legalActions(g).some((a) => a.iid === gate));
      g = fx.arrange(g, (h) => { h.down(0, 0); });
      ok(XS.whyNot(g, gate) !== null, 'equal numbers: not playable');
    });
  });
  test('Damage - N (R-016): a negative "damage +" lowers the damage and stops at 0', () => {
    fx.withCards([att('T-NEG20', 0, atk({ op: 'dmgPlus', n: -20 })), att('T-NEG40', 0, atk({ op: 'dmgPlus', n: -40 }))], () => {
      let s = fx.arrange(game([['T-NEG20', 8], ['T-NEG40', 8]]), (h) => h.hand(0, ['T-NEG20', 'T-NEG40']));
      const a = fx.attack(s, 'T-NEG20', 0, 0);
      eq(find(a, 'attack')[0].data.damage, 10); eq(L(a, 1, 0).damage, 10);
      const b = fx.attack(s, 'T-NEG40', 0, 0);
      eq(find(b, 'attack')[0].data.damage, 0); eq(find(b, 'damage').length, 0, 'no counters for 0');
    });
  });

  // ================= both / opponent =================
  test('Opponent and both-player effects (R-021): "対戦相手は手札を1枚捨てる" - the OPPONENT chooses and sees their own hand; "すべてのプレイヤーは…" asks the turn player first', () => {
    fx.withCards([
      mem('T-OPPDISC', 0, onPlay({ op: 'discard', n: 1, who: 'opp' })),
      mem('T-BOTH', 0, onPlay({ op: 'discard', n: 1, who: 'both' }, { op: 'draw', n: 1, who: 'both' })),
    ], () => {
      let s = fx.arrange(game([['T-OPPDISC', 8], ['T-BOTH', 8]]), (h) => h.hand(0, ['T-OPPDISC', 'T-BOTH', 'ST01-013']));
      let t = fx.play(s, 'T-OPPDISC');
      eq([t.pending.seat, t.pending.purpose, t.pending.min], [1, 'discard', 1]);
      eq(XS.whoActs(t), 1);
      eq(XS.view(t, 0).pending.options, [], 'the effect\'s owner does not see the opponent\'s hand');
      ok(XS.view(t, 1).pending.options.length === P(t, 1).hand.length);
      t = answer(t, [t.pending.options[0]]);
      eq(find(t, 'discard')[0].seat, 1);
      let b = fx.play(s, 'T-BOTH');
      eq(b.pending.seat, 0, 'the turn player first');
      b = answer(b, [b.pending.options[0]]);
      eq(b.pending.seat, 1, 'then the opponent');
      const h0 = P(b, 0).hand.length, h1 = P(b, 1).hand.length;
      b = answer(b, [b.pending.options[0]]);
      eq([P(b, 0).hand.length, P(b, 1).hand.length], [h0, h1], 'both discarded one and both drew one: hands unchanged (both asked before any card moved)');
      eq(find(b, 'draw', (e) => e.data.cause === 'effect').map((e) => e.seat), [0, 1]);
    });
  });

  // ================= equipment =================
  test('Equipment stats as data (CARDS.equip): attack +10 reaches the damage; サイバネアーマー replaces the base HP by awakened state (140 / 170) and other equipment adds on top', () => {
    fx.withCards([
      tac('T-KNUCKLE', 0, 'equipment', { timing: 'static', ops: [] }),
      tac('T-ARMOR', 0, 'equipment'),
    ], () => {
      XS.CARDS['T-KNUCKLE'].equip = { atk: 10 };
      XS.CARDS['T-ARMOR'].equip = { hpBase: 140, hpBaseAwakened: 170 };
      let s = game([['ST01-011', 4]], ['T-KNUCKLE', 'T-ARMOR']);
      s = fx.arrange(s, (h) => { h.equip(0, 0, 'T-KNUCKLE'); h.equip(0, 1, 'T-ARMOR'); h.hand(0, ['ST01-011']); });
      eq(XS.leaderStats(s, 0, 0).atk, 40);
      eq(XS.leaderStats(s, 0, 1).hp, 140, 'ST01-002 prints 110; the armor sets 140');
      const t = fx.arrange(s, (h) => { h.awaken(0, 1); });
      eq(XS.leaderStats(t, 0, 1).hp, 170, 'awakened: 170');
      const u = fx.arrange(t, (h) => h.equip(0, 1, 'ST01-023'));
      eq(XS.leaderStats(u, 0, 1).hp, 200, 'the +30 of Light Shield stacks on the replaced base');
      s = fx.attack(s, 'ST01-011', 0, 0);
      eq(find(s, 'attack')[0].data.parts.atk, 40, 'the attack uses the equipment ATK');
    });
  });

  test('Equipment granting 【アタック後】 (盗賊キット, R-028, R-029): the equipped attacker draws when the attacked leader is down - once per turn; an effect whose condition fails does not use the turn up', () => {
    fx.withCards([tac('T-KIT', 0, 'equipment', stat({ op: 'grant', timing: 'afterAttack', oncePerTurn: true, ops: [{ op: 'draw', n: 1, if: { c: 'attackedDown' } }] }))], () => {
      let s = game([['ST01-011', 8]], ['T-KIT']);
      s = fx.arrange(s, (h, t) => { h.equip(0, 0, 'T-KIT'); h.hand(0, ['ST01-011', 'ST01-011', 'ST01-011']); h.damage(1, 1, XS.leaderStats(t, 1, 1).hp - 30); h.damage(1, 2, XS.leaderStats(t, 1, 2).hp - 30); });
      const kit = () => P(s, 0).leaders[0].equipment[0];
      const draws = (t) => find(t, 'draw', (e) => e.data.cause === 'effect' && e.via === kit()).length;
      s = fx.attack(s, 'ST01-011', 0, 0);
      eq(draws(s), 0, 'the leader is not down: nothing drawn, nothing used');
      s = fx.attack(s, 'ST01-011', 0, 1);
      eq(draws(s), 1, 'down -> draw');
      s = fx.settleWithFirst(s);
      s = fx.attack(s, 'ST01-011', 0, 2);
      eq(draws(s), 1, 'a second down in the same turn: the equipment is used up (R-029)');
      s = fx.toTurnOf(fx.endTurn(s), 0);
      s = fx.arrange(s, (h, t) => { h.hand(0, ['ST01-011']); h.damage(1, 3, XS.leaderStats(t, 1, 3).hp - 30); });
      s = fx.attack(s, 'ST01-011', 0, 3);
      eq(draws(s), 2, 'a new turn: usable again');
    });
  });

  test('Equipment granting an effect with a condition on the 【アタック後】 step (オートタレット): splash only if the attack\'s own After Attack effects dealt damage; it joins the turn player\'s ordering', () => {
    fx.withCards([
      tac('T-TURRET', 0, 'equipment', stat({ op: 'grant', timing: 'afterAttack', oncePerTurn: true, ops: [{ op: 'damage', n: 10, to: allOther, if: { c: 'afterDealt' } }] })),
      att('T-SPLASH', 0, none, after({ op: 'damage', n: 10, to: other })),
    ], () => {
      const base = () => fx.arrange(game([['T-SPLASH', 8], ['ST01-011', 8]], ['T-TURRET']), (h) => { h.equip(0, 0, 'T-TURRET'); h.hand(0, ['T-SPLASH', 'ST01-011']); });
      let s = fx.attack(base(), 'T-SPLASH', 0, 0);
      eq(s.pending.purpose, 'order', 'two After Attack effects: the turn player orders them');
      ok(s.pending.options.some((i) => s.cards[i].id === 'T-TURRET'), 'the equipment is one of the sources');
      s = answer(s, [s.pending.options.find((i) => s.cards[i].id === 'T-SPLASH')]);
      s = answer(s, ['L11']);                  // the card's own splash: 10 to leader 1; then the turret: 10 to every other leader
      eq([L(s, 1, 0).damage, L(s, 1, 1).damage, L(s, 1, 2).damage, L(s, 1, 3).damage], [30, 20, 10, 10]);
      let t = fx.attack(base(), 'ST01-011', 0, 0);   // no After Attack damage: the turret's condition is false
      eq(t.pending, null); eq([L(t, 1, 1).damage, L(t, 1, 2).damage], [0, 0]);
    });
  });

  test('ターゲットフラッグ (mustTarget, R-066): while an equipped opposing leader can be attacked it is the only legal target; once it is down the others are open again', () => {
    fx.withCards([tac('T-FLAG', 0, 'equipment', stat({ op: 'mustTarget' }))], () => {
      let s = game([['ST01-011', 4]], [], { opp: fx.deckWith('ST02', [], ['T-FLAG']) });
      s = fx.arrange(s, (h) => { h.equip(1, 2, 'T-FLAG'); h.hand(0, ['ST01-011']); });
      const targets = (t) => [...new Set(XS.legalActions(t).filter((a) => a.type === 'play' && a.target !== undefined).map((a) => a.target))];
      eq(targets(s), ['L12']);
      throws(() => XS.apply(s, { type: 'play', iid: fx.idOf(s, 0, 'ST01-011', ['hand']), attacker: 'L00', target: 'L10' }), 'other target refused', XS.Illegal);
      const d = fx.arrange(s, (h) => h.down(1, 2));
      eq(targets(d), ['L10', 'L11', 'L13']);
    });
  });

  // ================= revive, awaken, shuffle, targets =================
  test('Revive (復活ポータル, FAQ #23, R-002, R-012): a downed own leader comes back with no counters, its equipment goes to the trash face up, its awakening stays, and nobody awakens', () => {
    fx.withCards([
      tac('T-PORTAL', 0, 'consumption', stat({ op: 'playIf', if: { c: 'downMoreThanOpp' }, msg: 'Needs more downed leaders than the opponent.' }), onPlay({ op: 'revive' })),
      tac('T-GEAR', 0, 'equipment'),
    ], () => {
      let s = game([], [], { opp: fx.deckWith('ST02', [], ['T-PORTAL', 'T-GEAR']), pick: [null, 'T-PORTAL'] });
      s = fx.toTurnOf(s, 1);
      s = fx.arrange(s, (h) => { h.awaken(1, 1); h.equip(1, 1, 'T-GEAR'); h.down(1, 1); });
      const gear = P(s, 1).leaders[1].equipment[0];
      s = fx.play(s, 'T-PORTAL');
      eq([s.pending.purpose, s.pending.options], ['revive', ['L11']]);
      s = answer(s, ['L11']);
      eq([L(s, 1, 1).down, L(s, 1, 1).damage, L(s, 1, 1).awakened, L(s, 1, 1).equipment], [false, 0, true, []]);
      ok(XS.view(s, 0).players[1].trash.includes(gear), 'the equipment is in the trash, face up');
      const rev = find(s, 'revive')[0].data;
      eq([rev.leader, rev.equipment], ['L11', [gear]]);
      eq(find(s, 'awaken').length, 1, 'only the arranged awakening of the fixture: a revive awakens nobody');
    });
  });

  test('Revive with no downed leader of yours does nothing and logs a fizzle', () => {
    fx.withCards([mem('T-REV', 0, onPlay({ op: 'revive' }))], () => {
      let s = fx.arrange(game([['T-REV', 8]]), (h) => h.hand(0, ['T-REV']));
      s = fx.play(s, 'T-REV');
      eq(s.pending, null); eq(find(s, 'fizzle').length, 1);
    });
  });

  test('Awaken by effect (名誉のバッジ): the chosen leader awakens and its 【覚醒時】 resolves; nobody else does', () => {
    fx.withCards([mem('T-BADGE', 0, onPlay({ op: 'awaken' }))], () => {
      let s = fx.arrange(game([['T-BADGE', 8]]), (h) => { h.hand(0, ['T-BADGE']); h.awaken(0, 0); });
      s = fx.play(s, 'T-BADGE');
      eq([s.pending.purpose, s.pending.options], ['awaken', ['L01', 'L02', 'L03']], 'only leaders that are not awakened');
      const hand = P(s, 0).hand.length;
      s = answer(s, ['L02']);   // ST01-003: 10 damage to every opposing leader on awaken
      ok(L(s, 0, 2).awakened);
      eq([0, 1, 2, 3].map((k) => L(s, 1, k).damage), [10, 10, 10, 10], '【覚醒時】 resolved');
      eq(find(s, 'awaken').map((e) => [e.data.leader, e.data.cause]), [['L00', 'effect'], ['L02', 'effect']], 'the arranged one and the new one; no attack awakening');
      void hand;
    });
  });

  test('アイテムショップ (shuffleTrash, R-019): all face-down trash cards go into the deck, no tactics penalty', () => {
    fx.withCards([mem('T-SHOP', 0, onPlay({ op: 'shuffleTrash' }))], () => {
      let t = fx.arrange(game([['T-SHOP', 8]]), (h, st) => { h.hand(0, ['T-SHOP']); for (const i of st.players[0].deck.slice(0, 3)) h.trash(0, i); });
      const tr = P(t, 0).trash.filter((i) => t.cards[i].kind !== 'tactics').length;
      eq(tr, 3);
      const deck = P(t, 0).deck.length;
      t = fx.play(t, 'T-SHOP');
      eq(P(t, 0).trash.filter((i) => t.cards[i].kind !== 'tactics').length, 0, 'face-down trash is empty');
      eq(P(t, 0).deck.length, deck + tr, 'the cards are in the deck');
      eq(find(t, 'tacticsBurn').length, 0, 'no penalty'); eq(find(t, 'reshuffle').length, 1);
    });
  });

  test('Targets: "最大2体" - up to two opposing leaders (0 to 2 chosen); damage to the attacker with "remaining HP becomes 10 instead" (R-042)', () => {
    fx.withCards([
      mem('T-UPTO', 0, onPlay({ op: 'damage', n: 30, to: { side: 'opp', count: 2, upTo: true } })),
      att('T-SNIPE', 0, none, after({ op: 'damage', n: 20, to: { side: 'own', count: 'attacker' }, leave: 10 })),
    ], () => {
      let s = fx.arrange(game([['T-UPTO', 8], ['T-SNIPE', 8]]), (h) => h.hand(0, ['T-UPTO', 'T-SNIPE']));
      let t = fx.play(s, 'T-UPTO');
      eq([t.pending.min, t.pending.max], [0, 2]);
      t = answer(t, ['L10', 'L12']);
      eq([L(t, 1, 0).damage, L(t, 1, 1).damage, L(t, 1, 2).damage], [30, 0, 30]);
      eq(L(decline(fx.play(s, 'T-UPTO')), 1, 0).damage, 0, 'zero chosen is allowed');
      const full = fx.attack(s, 'T-SNIPE', 0, 0);
      eq(L(full, 0, 0).damage, 20, 'a healthy attacker simply takes 20');
      const low = fx.arrange(s, (h, st) => h.damage(0, 0, XS.leaderStats(st, 0, 0).hp - 20));
      const safe = fx.attack(low, 'T-SNIPE', 0, 0);
      ok(!L(safe, 0, 0).down, 'not downed'); eq(leftOf(safe, 0, 0), 10, 'its remaining HP is 10 instead');
      eq(find(safe, 'down').length, 0);
    });
  });

  // ================= refusal, views, texts =================
  test('An op the engine cannot run is refused: an {unimplemented} op that reaches resolution throws (and validate-abilities refuses it for any registered deck)', () => {
    fx.withCards([mem('T-NOPE', 0, onPlay({ unimplemented: 'a made-up effect' }))], () => {
      const s = fx.arrange(game([['T-NOPE', 8]]), (h) => h.hand(0, ['T-NOPE']));
      throws(() => fx.play(s, 'T-NOPE'), 'refused', Error);
    });
  });

  test('Views and texts: every new log type reads as a sentence for both seats, the opponent\'s unrevealed look names no card', () => {
    const U = XS.ui;
    const v = (viewer) => ({ viewer, log: [], cards: {}, players: [{ leaders: [{ iid: 'L00', cardId: 'ST01-001', slot: 0 }, { iid: 'L01', cardId: 'ST01-002', slot: 1 }] }, { leaders: [{ iid: 'L10', cardId: 'ST02-001', slot: 0 }] }] });
    const e = (type, data, seat) => ({ seq: 0, round: 1, turn: 1, seat, type, data, via: null });
    const cases = [
      e('look', { phase: 'see', from: 'deck', side: 0, n: 3, iids: ['c1'], cardIds: ['ST01-005'], revealed: false }, 0),
      e('look', { phase: 'see', from: 'deck', side: 0, n: 3, revealed: false, hidden: true }, 0),
      e('look', { phase: 'reveal', from: 'hand', side: 0, n: 1, iids: ['c1'], cardIds: ['ST01-005'], revealed: true }, 0),
      e('look', { phase: 'reveal', from: 'deck', side: 1, n: 1, iids: ['c1'], cardIds: ['ST01-005'], revealed: true }, 0),
      e('look', { phase: 'take', from: 'deck', side: 0, n: 1, revealed: false, hidden: true }, 1),
      e('look', { phase: 'trash', from: 'deck', side: 1, n: 2, iids: ['c1', 'c2'], cardIds: ['ST01-005', 'ST01-013'], revealed: true }, 0),
      e('overkill', { leader: 'L10', n: 30, excess: 40, card: 'c1' }, 0),
      e('echo', { iid: 'c1', cardId: 'ST01-013', phase: 'replay' }, 0), e('echo', { iid: 'c1', cardId: 'ST01-013', phase: 'sideways' }, 1),
      e('freePlay', { iid: 'c1', cardId: 'ST01-013', type: 'memoria', from: 'deck' }, 0),
      e('revive', { leader: 'L01', seat: 0, slot: 1, equipment: [], cardIds: [] }, 0), e('revive', { leader: 'L01', seat: 0, slot: 1, equipment: ['c1'], cardIds: ['ST01-023'] }, 0),
      e('boost', { iid: 'c1', cardId: 'ST01-013', phase: 'armed', afterOnly: true }, 0), e('boost', { iid: 'c1', cardId: 'ST01-013', phase: 'applied', amount: 0 }, 0),
    ];
    for (const viewer of [0, 1]) for (const c of cases) {
      const t = U.logText(c, v(viewer)).text;
      ok(t.length > 10 && !/undefined|\[object|NaN|null/.test(t), 'line for ' + c.type + '/' + (c.data.phase || '') + ': ' + t);
    }
    ok(!U.logText(cases[1], v(1)).text.includes('Dumb'));
  });

  test('Pending purposes of the new ops have an AI policy and a legal answer (look, reveal, may, freePlay, revive, awaken)', () => {
    const AI = XS.ai;
    for (const p of ['look', 'reveal', 'may', 'freePlay', 'revive', 'awaken']) ok(typeof AI.pendingPolicy('choose', p) === 'function', 'policy for ' + p);
    fx.withCards(lookDefs().concat([att('T-LK', 0, none, after({ op: 'look', n: 3 }, { op: 'freePlay', from: 'look', filter: { type: 'memoria', maxCost: 1 }, max: 1 }, { op: 'lookRest' }))]), () => {
      let s = game([['T-LK', 4], ['T-M0', 8], ['T-M1', 8]]);
      s = fx.arrange(s, (h) => { h.hand(0, ['T-LK']); h.top(0, ['T-M0', 'T-M1', 'ST01-013']); });
      s = fx.attack(s, 'T-LK', 0, 0);
      const W = AI.WEIGHTS.full;
      const a = AI.answerPending(XS.view(s, 0), { W, stats: {} });
      XS.apply(s, a);   // legal
      eq(a.type, 'choose');
    });
  });

  // ================= {healed: true} (FAQ #64) =================
  test('value {healed:true} (FAQ #64): a heal op feeds the damage op with the counters it actually removed, summed over the effect group', () => {
    fx.withCards([tac('T-HEAL', 0, 'consumption', onPlay({ op: 'heal', n: 40, to: ownOne }, { op: 'heal', n: 40, to: ownOne }, { op: 'damage', n: { healed: true }, to: oneOpp }))], () => {
      let s = game([], ['T-HEAL'], { first: 1 });
      s = fx.toTurnOf(s, 0);
      s = fx.arrange(s, (h) => { h.damage(0, 0, 30); h.damage(0, 1, 50); });
      s = fx.play(s, 'T-HEAL');
      s = answer(s, ['L00']);   // 30 of 40 removed
      s = answer(s, ['L01']);   // 40 of 40 removed
      eq(find(s, 'heal').map((e) => e.data.amount), [30, 40]);
      s = answer(s, ['L12']);
      eq([L(s, 0, 0).damage, L(s, 0, 1).damage, L(s, 1, 2).damage], [0, 10, 70], 'damage = 30 + 40 actually healed');
    });
  });
})();
