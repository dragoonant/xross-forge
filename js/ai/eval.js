// js/ai/eval.js: the position evaluator (M4 requirement 5). One number, from one seat's side: bigger is better for
// `me`. Unit: one point of leader HP = 1.0. Every weight carries its WHY (KB card-games §4: "cite a reason or do
// not change it"); the sweeps that justify the numbers are in docs/ai.md.
//
// The evaluator is a pure function of an engine-shaped state (a determinized world, or a view: it reads only fields
// both have). It perceives:
//   leaders      remaining HP, downs, awakened state, equipment, the best standing ATK (a down also awakens the attacker)
//   the race     round score and match point (a round win at match point ends the match)
//   resources    cards in hand (diminishing: PP, not cards, is the bottleneck), PP left this turn as the draws it will
//                buy at end of turn (PM p.06), unplayed tactics cards, armed Attack Boosts
//   the clock    cards left in the deck, tactics cards left (a reshuffle burns one; none left at a reshuffle loses the match)
//   tags         "all your leaders have the tag" (Crossfire / Demon King's Descent) turns a 3 PP attack into a sure down
(function () {
  'use strict';
  const XS = globalThis.XS;
  const AI = (XS.ai = XS.ai || {});

  const HAND_LIMIT = 7;       // PM p.06: the hand is cut to 7 at end of turn

  const FULL = {
    // ---- leaders ----
    hp: 1.0,          // the unit. The round is a race to take every opposing leader's HP to zero.
    alive: 40,        // a standing leader on top of its HP: it still has to be downed (4 downs end the round, PM p.05), a down awakens
                      // the attacker, and overkill is wasted on a leader already dead; keeps the AI finishing leaders instead of chipping all four
    close: 35,        // concave health bonus close*(1-(1-f)^2), f = remaining/maxHP: damage costs the owner more on a wounded leader than a fresh one; focuses fire
    awakened: 10,     // awakening persists into later rounds with +30 HP (PM p.11): a small extra on top of the HP it already added
    teamAtk: 4.0,     // per ATK point above 30 of the best standing attacker: every attack picks its attacker, so ONE awakened leader lifts
                      // every attack by 10 (PM p.07 "any leader may attack any number of times")
    equip: 12,        // equipment stays attached across rounds (PM p.11); its +30 HP is already in `remaining`, this is the persistence
    // ---- the race ----
    round: 3000,      // a round won: must beat ANY position, however dominant (4 leaders * ~180 value + a dumped hand); at 900 the AI once passed on the
                      // winning attack because a leader on 10 HP looked nearly as good as a won round (docs/ai.md, holdout seed 10014)
    match: 1e6,       // the match
    mp: 0.35,         // at match point (one round from winning a best-of-3) the other side's leader terms count this much more: a round decides everything
    // ---- resources ----
    hand: [24, 20, 16, 11, 7, 3, 1],   // SHAPE of the marginal value of the 1st..7th card in hand (times handMul): PP (3-5 a turn) limits plays, so the tail is
                                       // nearly worthless and the hand limit (7) cuts the rest. Flattening it (x5: 24/24/24/24/24/12/6) measured 37.8%, steeper 52.5%: keep
    qual: 0.0,        // weight of WHICH cards are held (AI.keepValue summed over the hand) on top of how many: keep the premium card, spend the junk
    handMul: 5.0,     // scale of the hand curve, in HP. The one weight that moved the result: x0.4 / x1 / x2.5 / x4 / x7 measured 49.5 / (50) / 59.5 / 62.0 / 62.3%
                      // against x1 (400 games, seeds 1-100): cards, not a few points of HP, are the currency (a play spends a card AND the PP; a banked PP buys a
                      // card). 5 sits on the plateau. The mechanism is not proven; the measurement is (docs/ai.md).
    killCard: 30,     // a hand card that downs a leader outright (Crossfire / Demon King's Descent, all leaders tagged) and can be paid for
    shield: 1.0,      // scales how much the secret pick prefers equipment (Light Shield stays on across rounds, PM p.11): see docs/ai.md
    tarea: 22,        // an unplayed tactics card: a free-ish extra play each round (one per turn, PM p.06), kept until it beats this
    boost: 0.8,       // an armed boost is worth this share of its damage while an affordable attack card is in hand (it is wasted at end of turn, R-014)
    boostIdle: 0.1,   // ... and this share when no attack can follow it
    // ---- the clock ----
    tdeck: 16,        // a tactics card still in the tactics deck: next round's pick and the reshuffle penalty buffer
    burn: 45,         // a reshuffle burns one tactics card (PM p.14 Q1) when the deck runs short
    lose: 4000,       // a reshuffle with no tactics card left loses the match (PM p.14 Q1)
    deckSafe: 4,      // decks smaller than this are "about to reshuffle" (the next end-of-turn draws and start draw eat 1 + unspent PP)
  };

  // Easy: same shape, blind to the deep rules (no tag/clock/boost perception, hand counted flat, no match point). It is the
  // "simple evaluator" of the easy tier; its noise is added by the search, not here.
  const EASY = Object.assign({}, FULL, {
    alive: 25, close: 0, awakened: 0, teamAtk: 0, equip: 0, mp: 0, killCard: 0, tarea: 10, boost: 0.5, boostIdle: 0.3,
    hand: [18, 16, 14, 12, 8, 4, 2], tdeck: 0, burn: 0, lose: 0,
  });

  AI.WEIGHTS = { full: FULL, easy: EASY };

  // Value of holding `n` cards (n above the hand limit is cut at end of turn).
  AI.handValue = function (n, W) {
    let v = 0;
    const m = Math.min(n, HAND_LIMIT);
    for (let i = 0; i < m; i++) v += W.hand[i];
    return v * W.handMul;
  };

  // One leader's value to its owner: HP left, a bonus for standing, a concave bonus for health, awakened, equipment.
  // `st` = XS.leaderStats. The health term close * (1 - (1 - f)^2), f = remaining / max HP, has its steepest slope at low f, so a
  // point of damage costs the owner more on a wounded leader than on a fresh one: the attacker is pulled toward finishing a leader.
  AI.leaderValue = function (st, W) {
    if (st.down) return 0;
    const rem = Math.max(0, st.hp - st.damage);
    const f = rem / st.hp;
    return W.hp * rem + W.alive + W.close * (1 - (1 - f) * (1 - f)) + (st.awakened ? W.awakened : 0) + st.equipment.length * W.equip;
  };

  const boostAmount = (s, iid) => {
    let n = 0;
    for (const op of XS.opsFor(s.cards[iid].id, 'boost')) if (op.op === 'dmgPlus') n += XS.val(op.n, { s, seat: s.cards[iid].owner });
    return n;
  };

  // Does a card in `P.hand` down a leader outright right now (Crossfire / Demon King's Descent: its downAttacked op with a true tag condition)?
  const killCache = {};
  AI.isKillCard = function (s, seat, cardId) {
    let ops = killCache[cardId];
    if (ops === undefined) {
      ops = XS.CARDS[cardId].type === 'attack' ? XS.attackEffects(cardId).flatMap((e) => e.ops.filter((o) => o.op === 'downAttacked')) : [];
      killCache[cardId] = ops;
    }
    for (const op of ops) if (op.if === undefined || XS.cond(op.if, { s, seat })) return true;
    return false;
  };

  // The value of one side's non-leader assets. `bank` = this is the side about to pass the turn, so its unspent PP will
  // become cards at end of turn (PM p.06).
  function resources(s, p, W, bank) {
    const P = s.players[p];
    let n = P.hand.length;
    if (bank) n = Math.min(HAND_LIMIT, n + P.pp.untapped);
    let v = AI.handValue(n, W);
    if (W.killCard > 0) {
      for (const iid of P.hand) {
        const id = s.cards[iid].id;
        if (AI.isKillCard(s, p, id) && XS.CARDS[id].cost <= P.pp.total) v += W.killCard;
      }
    }
    if (W.qual > 0 && P.hand.length > 0) {
      let q = 0;
      for (const iid of P.hand) q += AI.keepValue(s, p, s.cards[iid].id, P.hand);
      v += W.qual * q;
    }
    v += P.tarea.length * W.tarea;
    v += P.tdeck.length * W.tdeck;
    if (P.boosts.length > 0 && W.boost > 0) {
      let b = 0;
      for (const iid of P.boosts) b += boostAmount(s, iid);
      let canAttack = false;
      if (bank) for (const iid of P.hand) { const d = XS.CARDS[s.cards[iid].id]; if (d.type === 'attack' && d.cost <= P.pp.untapped) { canAttack = true; break; } }
      v += b * (canAttack ? W.boost : W.boostIdle);
    }
    // The clock: a short deck reshuffles at the next draw, which burns a tactics card (or loses the match with none).
    if (W.burn > 0) {
      const draws = 1 + (bank ? P.pp.untapped : 0);     // the start-of-turn draw and the end-of-turn banked draws
      const short = Math.max(0, draws - P.deck.length);
      if (short > 0 || P.deck.length < W.deckSafe) {
        const near = short > 0 ? 1 : (W.deckSafe - P.deck.length) / W.deckSafe * 0.5;
        v -= near * (P.tdeck.length === 0 ? W.lose : W.burn);
      }
    }
    return v;
  }

  // Leader block of one side: sum of leader values plus the team's best standing ATK.
  function leaders(s, p, W) {
    let v = 0, best = 0, any = false;
    for (const L of s.players[p].leaders) {
      const st = XS.leaderStats(s, p, L.slot);
      v += AI.leaderValue(st, W);
      if (!st.down) { any = true; if (st.atk > best) best = st.atk; }
    }
    if (any) v += W.teamAtk * (best - 30);
    return v;
  }

  // evaluate(s, me, W, o): o.bank = 'me' | 'both' | undefined. 'me' = it is my turn and I may still spend PP (the search);
  // undefined = a position at the start of a turn (the rollouts' horizon), where the PP is about to be spent, not banked.
  AI.evaluate = function (s, me, W, o) {
    if (s.phase === 'over') return s.winner === null ? 0 : (s.winner === me ? W.match : -W.match);
    const op = 1 - me;
    const need = s.needWins;
    const mpMe = need > 1 && s.wins[me] === need - 1;
    const mpOp = need > 1 && s.wins[op] === need - 1;
    const bankMe = o !== undefined && o.bank === true && s.active === me && s.phase === 'main';
    let v = W.round * (s.wins[me] - s.wins[op]);
    v += leaders(s, me, W) * (1 + (mpOp ? W.mp : 0)) - leaders(s, op, W) * (1 + (mpMe ? W.mp : 0));
    v += resources(s, me, W, bankMe) - resources(s, op, W, false);
    return v;
  };
})();
