// js/ai/policies.js: answers to the engine's pending decisions (M4 requirement 3). POLICIES is keyed by the pending
// `kind`, then its `purpose` (docs/ENGINE-API.md "Pending decision"); an unknown kind or purpose THROWS, so a decision the
// AI was never taught shows up as a test failure, never as a random move. Every policy reads only the VIEW of the seat that
// must answer (the real pending state keeps its resolution stack private, so the AI cannot search these: it answers them by
// rule, and the main-phase search settles the same pendings inside its simulations with the same functions).
//
// `ctx` = { W: weights, stats: counters }. A policy returns a legal action; `stats.fallbacks` counts the times none could be
// computed and the caller had to pick randomly (the bench demands 0).
(function () {
  'use strict';
  const XS = globalThis.XS;
  const AI = (XS.ai = XS.ai || {});

  // Value of the awakening that follows a down by the attacker (D: +10 ATK for the team if nobody stands awakened, +30 HP kept for the
  // match, the awaken effect). Used only to rank targets; the search's simulation applies the real effect.
  const AWAKEN_GAIN = 60;
  AI.GO_FIRST = true;      // see docs/ai.md "Going first"

  // The item with the largest key; on a tie the EARLIEST item wins (deterministic, never a coin flip: KB "ties are where stupid
  // moves come from"; the options arrive in the engine's order, which is the order of the cards on the table).
  const byKey = (items, key) => {
    let best = null, bk = null;
    for (const it of items) {
      const k = key(it);
      if (best === null || k > bk) { best = it; bk = k; }
    }
    return best;
  };

  // ---- shared heuristics ----------------------------------------------------------------------------------------
  // How much owner-side value (of `target`) an attack of `dmg` removes, plus the awakening if it downs.
  AI.pairGain = function (s, W, attacker, target, dmg, goesDown) {
    const tst = XS.leaderStatsOf(s, target);
    const before = AI.leaderValue(tst, W);
    const down = goesDown || dmg >= tst.hp - tst.damage;
    const after = down ? 0 : AI.leaderValue(Object.assign({}, tst, { damage: tst.damage + dmg }), W);
    let g = before - after;
    if (down && !XS.leaderStatsOf(s, attacker).awakened) g += AWAKEN_GAIN;
    return g;
  };

  // The damage a pending effect does or heals: read from the source card's data (docs/ABILITIES.md), never from the prompt text.
  function pendingAmount(v, pend, opName) {
    const src = pend.source;
    if (src === null || v.cards[src] === undefined) throw new Error('ai: pending ' + pend.purpose + ' has no visible source card');
    const id = v.cards[src].id;
    const a = XS.ABIL[id];
    for (const e of a.effects) {
      for (const op of e.ops) {
        if (op.op === opName && (opName !== 'damage' || (op.to.count !== 'all'))) return XS.val(op.n, { s: v, seat: pend.seat });
      }
    }
    throw new Error('ai: card ' + id + ' has no ' + opName + ' op to read the amount from');
  }

  // keepValue(cardId, hand context): what a card in hand is worth when choosing which to throw away. Power is in damage-equivalents,
  // minus the PP it costs (PP is the bottleneck, ~35 damage per PP).
  AI.keepValue = function (s, seat, cardId, handIds) {
    const d = XS.CARDS[cardId];
    let power = 0;
    const hasAttack = handIds.some((i) => XS.CARDS[s.cards[i].id].type === 'attack');
    if (d.type === 'attack') {
      power = 30;
      for (const e of XS.attackEffects(cardId)) for (const op of e.ops) if (op.op === 'dmgPlus') power += XS.val(op.n, { s, seat });
      for (const op of XS.opsFor(cardId, 'afterAttack')) {
        if (op.op === 'damage') power += (op.to.count === 'all' ? 2.2 : 1) * XS.val(op.n, { s, seat }) * 0.8;
        else if (op.op === 'draw') power += 12 * op.n;
      }
      if (AI.isKillCard(s, seat, cardId)) power += 120;
    } else if (d.type === 'memoria') {
      for (const op of XS.opsFor(cardId, 'boost')) if (op.op === 'dmgPlus') power += (hasAttack ? 0.8 : 0.3) * XS.val(op.n, { s, seat });
      for (const op of XS.opsFor(cardId, 'onPlay')) {
        if (op.op === 'draw') power += 22 * op.n;
        else if (op.op === 'heal') power += 0.5 * op.n;
      }
      for (const op of XS.opsFor(cardId, 'afterAttack')) if (op.op === 'damage') power += XS.val(op.n, { s, seat }) * 0.8;
    }
    return power - 25 * d.cost;
  };

  // The tactics card to put face down: its worth when played, minus the PP it costs; equipment is permanent, so it grows with the rounds left.
  AI.tacticsValue = function (v, cardId, W) {
    const left = Math.max(0, v.needWins === 1 ? 0 : 3 - v.round);
    let val = 0;
    for (const e of XS.ABIL[cardId].effects) {
      for (const op of e.ops) {
        if (op.op === 'dmgPlus' && e.timing === 'boost') val += 0.9 * XS.val(op.n, { s: v, seat: v.viewer });
        else if (op.op === 'draw') val += 24 * op.n;
        else if (op.op === 'recoverPP') val += 35 * op.n;
        else if (op.op === 'healTotal') val += 0.55 * op.n;
        else if (op.op === 'statMod' && op.stat === 'hp') val += (op.n * (1 + 0.7 * left) + 12) * W.shield;
        else if (op.op === 'statMod' && op.stat === 'atk') val += op.n * 6 * (1 + left);
      }
    }
    // equipment stats as data on the card (CARDS[no].equip, tools/out/card-fields.md)
    const q = XS.CARDS[cardId].equip;
    if (q !== undefined) {
      const hp = (q.hp || 0) + (q.hpBase !== undefined ? q.hpBase - 100 : 0);   // a replaced base HP is worth its gain over the usual 100
      val += (hp * (1 + 0.7 * left) + (hp > 0 ? 12 : 0)) * W.shield + (q.atk || 0) * 6 * (1 + left);
    }
    return val - 35 * XS.CARDS[cardId].cost;
  };

  // ---- the table -----------------------------------------------------------------------------------------------------
  const POLICIES = {
    chooseFirst: {
      // Measured in docs/ai.md ("Going first"). The constant is the seat preference of the RPS winner.
      first(v, pend, ctx) {
        const me = pend.seat;
        return { type: 'chooseFirst', first: ctx.W.goFirst ? me : 1 - me };
      },
    },

    pickTactics: {
      tactics(v, pend, ctx) {
        const best = byKey(pend.options, (iid) => AI.tacticsValue(v, v.cards[iid].id, ctx.W));
        return { type: 'pickTactics', iid: best };
      },
    },

    choose: {
      // An opposing leader to damage (an effect's single target): the largest drop in the leader's value; a down counts in full.
      target(v, pend, ctx) {
        const n = pendingAmount(v, pend, 'damage');
        // damage to one of OUR leaders (an optional cost such as 共に至る極致): pay it from the healthiest leader, and only if it stays far from down
        if (XS.leaderSeat(pend.options[0]) === pend.seat) {
          const healthy = byKey(pend.options, (iid) => XS.leaderStatsOf(v, iid).remaining);
          return { type: 'choose', ids: pend.min === 0 && XS.leaderStatsOf(v, healthy).remaining < n + 40 ? [] : [healthy] };
        }
        const key = (iid) => {
          const st = XS.leaderStatsOf(v, iid);
          const down = n >= st.hp - st.damage;
          const after = down ? 0 : AI.leaderValue(Object.assign({}, st, { damage: st.damage + n }), ctx.W);
          return (AI.leaderValue(st, ctx.W) - after) * 1e3 - (st.hp - st.damage);
        };
        // 最大N体: the N best (a pick of up to N never needs fewer when each one is hurt)
        const ids = pend.options.slice().sort((a, b) => key(b) - key(a)).slice(0, pend.max);
        return { type: 'choose', ids };
      },
      // Cards looked at on a deck: take the best into the hand (as many as allowed), or decline the optional trash of the top card.
      look(v, pend, ctx) {
        if (pend.options.length === 0) return { type: 'choose', ids: [] };   // a hidden pool is always asked, also when nothing qualifies (FAQ #95): the empty pick
        if (pend.to === 'trash') return { type: 'choose', ids: pend.options.slice(0, pend.min) };
        const hand = v.players[pend.seat].hand;
        const ranked = pend.options.slice().sort((a, b) => AI.keepValue(v, pend.seat, v.cards[b].id, hand) - AI.keepValue(v, pend.seat, v.cards[a].id, hand));
        return { type: 'choose', ids: pickWithin(v, pend, ranked, pend.max, pend.min) };
      },
      // Cards of the hand to reveal for an effect: the ones we would sooner lose (they are usually thrown away or only shown for a bonus).
      reveal(v, pend, ctx) {
        const hand = v.players[pend.seat].hand;
        const ranked = pend.options.slice().sort((a, b) => AI.keepValue(v, pend.seat, v.cards[a].id, hand) - AI.keepValue(v, pend.seat, v.cards[b].id, hand));
        const cheap = ranked.filter((i) => AI.keepValue(v, pend.seat, v.cards[i].id, hand) <= 20);
        return { type: 'choose', ids: pickWithin(v, pend, pend.min > 0 ? ranked : cheap, pend.max, pend.min) };
      },
      // "Do it? (random discard for a bonus)": yes while the hand can spare a card.
      may(v, pend, ctx) { return { type: 'choose', ids: v.players[pend.seat].hand.length >= 3 ? pend.options.slice(0, 1) : [] }; },
      // Cards to play for free, in play order: memoria first (their boost must be armed before an attack card starts), the strongest first.
      freePlay(v, pend, ctx) {
        if (pend.options.length === 0) return { type: 'choose', ids: [] };   // asked with nothing to play (FAQ #4, #95): the empty pick
        const hand = v.players[pend.seat].hand;
        const rank = (i) => (v.cards[i].kind === 'memoria' ? 1000 : 0) + AI.keepValue(v, pend.seat, v.cards[i].id, hand);
        const ranked = pend.options.slice().sort((a, b) => rank(b) - rank(a));
        return { type: 'choose', ids: pickWithin(v, pend, ranked, pend.max, pend.min) };
      },
      // A downed leader to bring back: the one worth the most (awakened first, then HP).
      revive(v, pend, ctx) {
        const best = byKey(pend.options, (iid) => { const L = v.players[pend.seat].leaders.find((l) => l.iid === iid); const d = XS.CARDS[L.cardId]; return (L.awakened ? 1000 : 0) + d.hp + 3 * d.atk; });
        return { type: 'choose', ids: [best] };
      },
      // A leader to awaken: the largest gain in HP and ATK.
      awaken(v, pend, ctx) {
        const best = byKey(pend.options, (iid) => { const d = XS.CARDS[XS.leaderStatsOf(v, iid).cardId]; return (d.awakenHp - d.hp) + 3 * (d.awakenAtk - d.atk); });
        return { type: 'choose', ids: [best] };
      },
      // One of our leaders to heal (a leader must be named even if undamaged, FAQ #133): the largest gain; the wounded first.
      heal(v, pend, ctx) {
        const n = pendingAmount(v, pend, 'heal');
        const best = byKey(pend.options, (iid) => {
          const st = XS.leaderStatsOf(v, iid);
          const after = Object.assign({}, st, { damage: Math.max(0, st.damage - n) });
          return (AI.leaderValue(after, ctx.W) - AI.leaderValue(st, ctx.W)) * 1e3 + st.damage;
        });
        return { type: 'choose', ids: [best] };
      },
      // Hand cards to throw away: the least valuable. (effect discard and the hand-limit discard are the same question.)
      discard(v, pend, ctx) { return discardAnswer(v, pend); },
      handLimit(v, pend, ctx) { return discardAnswer(v, pend); },
      // Which After Attack effect resolves next. Damage first (it can change what the later, conditional effects see), by size.
      order(v, pend, ctx) {
        const me = pend.seat;
        const worth = (iid) => {
          let w = 0;
          for (const op of XS.opsFor(v.cards[iid].id, 'afterAttack')) {
            if (op.op === 'damage') w += XS.val(op.n, { s: v, seat: me }) * (op.to.count === 'all' ? 3 : 1);
            else if (op.op === 'draw') w += 1;
          }
          return w;
        };
        const best = byKey(pend.options, worth);
        return { type: 'choose', ids: [best] };
      },
    },

    // The second and later attacks of one card (and a bare play): the best (attacker, target) pair.
    attackPair: {
      attack(v, pend, ctx) {
        let best = null, bk = null;
        for (const attacker of pend.attackers) {
          for (const target of pend.targets) {
            const pv = XS.previewAttackDetail(v, { type: 'attack', attacker, target });
            const k = AI.pairGain(v, ctx.W, attacker, target, pv.total, pv.goesDown);
            if (best === null || k > bk) { best = { type: 'attack', attacker, target }; bk = k; }
          }
        }
        return best;
      },
    },

    // Healing split in units: each unit to the leader that gains the most from it.
    distribute: {
      distribute(v, pend, ctx) {
        const units = pend.total / pend.unit;
        const alloc = {};
        const dmg = {};
        for (const iid of pend.options) { alloc[iid] = 0; dmg[iid] = XS.leaderStatsOf(v, iid).damage; }
        for (let k = 0; k < units; k++) {
          const best = byKey(pend.options, (iid) => {
            const st = XS.leaderStatsOf(v, iid);
            const was = Object.assign({}, st, { damage: Math.max(0, dmg[iid]) });
            const now = Object.assign({}, st, { damage: Math.max(0, dmg[iid] - pend.unit) });
            return (AI.leaderValue(now, ctx.W) - AI.leaderValue(was, ctx.W)) * 1e3 + dmg[iid];
          });
          alloc[best] += pend.unit;
          dmg[best] = Math.max(0, dmg[best] - pend.unit);
        }
        for (const k of Object.keys(alloc)) if (alloc[k] === 0) delete alloc[k];
        return { type: 'distribute', alloc };
      },
    },
  };

  // The first `want` of `ranked` that together respect the pending decision's limit; at least `min` (a limit never blocks the minimum:
  // the engine builds min 0 for every limited pick).
  function pickWithin(v, pend, ranked, want, min) {
    const chosen = [];
    for (const iid of ranked) {
      if (chosen.length >= want) break;
      if (XS.limitOk(pend.limit, chosen.concat(iid).map((i) => v.cards[i].id))) chosen.push(iid);
    }
    if (chosen.length < min) throw new Error('ai: cannot satisfy the minimum of the pending ' + pend.purpose + ' under its limit');
    return chosen;
  }

  function discardAnswer(v, pend) {
    const me = pend.seat;
    const hand = pend.options;
    if (pend.min === 0) {   // "you may discard": pay with the least valuable card, if it is cheap and the hand has more to give
      const worst = hand.slice().sort((a, b) => AI.keepValue(v, me, v.cards[a].id, hand) - AI.keepValue(v, me, v.cards[b].id, hand))[0];
      return { type: 'choose', ids: worst !== undefined && v.players[me].hand.length >= 2 && AI.keepValue(v, me, v.cards[worst].id, hand) < 15 ? [worst] : [] };
    }
    const ranked = hand.slice().sort((a, b) => {
      const ka = AI.keepValue(v, me, v.cards[a].id, hand), kb = AI.keepValue(v, me, v.cards[b].id, hand);
      return ka - kb;
    });
    return { type: 'choose', ids: ranked.slice(0, pend.min) };
  }

  AI.POLICIES = POLICIES;
  AI.PENDING_KINDS = Object.keys(POLICIES);
  AI.pendingPolicy = function (kind, purpose) {
    const k = POLICIES[kind];
    if (k === undefined) throw new Error('ai: no policy table for pending kind ' + JSON.stringify(kind));
    const p = k[purpose];
    if (p === undefined) throw new Error('ai: no policy for pending ' + kind + '/' + JSON.stringify(purpose));
    return p;
  };

  // Answer the pending decision shown in view `v` (the view of the seat that must answer).
  AI.answerPending = function (v, ctx) {
    const pend = v.pending;
    if (pend === null) throw new Error('ai: no pending decision to answer');
    const a = AI.pendingPolicy(pend.kind, pend.purpose)(v, pend, ctx);
    if (a === null || a === undefined) throw new Error('ai: the ' + pend.kind + '/' + pend.purpose + ' policy returned no answer');
    return a;
  };
})();
