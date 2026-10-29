// Fixture helpers (XS.T.fx). Positions come from the REAL engine: newGame, then actions through XS.apply. Where a test needs a
// specific hand/damage/down position, `arrange` edits a copy of a legitimately reached state ONLY through the engine's own
// doors (XS.doors.moveZone / dealDamage / downLeader / payPP / awaken), so every arranged position is one the game itself
// can produce (a card in hand, a leader with damage, a leader down, PP spent). Arranged states are not replayable
// (their history no longer explains them) and are marked `arranged`. A test never writes s.pending, s.stack or a zone array by hand.
(function () {
  const XS = globalThis.XS;
  const T = XS.T;
  const D = XS.doors;
  const fx = (T.fx = {});

  // Answer the pending decision / take a main-phase action: the first LEGAL action that matches the partial object.
  const matches = (a, m) => Object.entries(m).every(([k, v]) => (Array.isArray(v) ? JSON.stringify(a[k]) === JSON.stringify(v) : a[k] === v));
  fx.do = function (s, m) {
    const legal = XS.legalActions(s);
    const a = legal.find((l) => matches(l, m));
    if (a === undefined) throw new Error(`fx.do: no legal action matching ${JSON.stringify(m)}; legal: ${JSON.stringify(legal).slice(0, 500)}; pending: ${JSON.stringify(s.pending)}`);
    return XS.apply(s, a);
  };
  // Answer a pending 'choose' with exact ids (apply validates them; legalActions only samples).
  fx.choose = (s, ids) => XS.apply(s, { type: 'choose', ids });
  fx.idOf = function (s, seat, cardNo, zones) {
    for (const z of zones || ['hand', 'play', 'tarea', 'tdeck', 'deck', 'trash']) {
      const i = s.players[seat][z].find((x) => s.cards[x].id === cardNo);
      if (i !== undefined) return i;
    }
    throw new Error(`no ${cardNo} for seat ${seat} in ${zones || 'any zone'}`);
  };
  fx.card = (s, seat, cardNo, zone) => fx.idOf(s, seat, cardNo, [zone]);
  fx.has = (s, seat, zone, cardNo) => s.players[seat][zone].some((x) => s.cards[x].id === cardNo);
  fx.count = (s, seat, zone, cardNo) => s.players[seat][zone].filter((x) => s.cards[x].id === cardNo).length;
  fx.leader = (seat, slot) => `L${seat}${slot}`;

  // newGame with a fixed first player, then answer the tactics picks: opts.pick = [cardNo|null for seat 0, ... seat 1] (null = first
  // offered). Quick mode: opts.pick2 = seat 1's second pick. Returns the state at the first player's turn 1 main phase.
  fx.start = function (opts) {
    const o = Object.assign({ decks: ['ST01', 'ST02'], seed: 7, mode: 'full', first: 0, pick: [null, null], pick2: null }, opts);
    let s = XS.newGame({ decks: o.decks, seed: o.seed, mode: o.mode, first: o.first });
    const wanted = { 0: [o.pick[0]], 1: [o.pick[1], o.pick2] };
    while (s.pending !== null) {
      if (s.pending.kind === 'chooseFirst') { s = XS.apply(s, { type: 'chooseFirst', first: o.first === 'random' ? 0 : o.first }); continue; }
      if (s.pending.kind !== 'pickTactics') throw new Error('fx.start: unexpected pending ' + s.pending.kind);
      const seat = s.pending.seat;
      const want = wanted[seat].shift();
      const iid = want ? s.pending.options.find((i) => s.cards[i].id === want) : s.pending.options[0];
      if (iid === undefined) throw new Error(`fx.start: ${want} is not offered to seat ${seat}`);
      s = XS.apply(s, { type: 'pickTactics', iid });
    }
    return s;
  };
  fx.endTurn = (s) => XS.apply(s, { type: 'endTurn' });
  // End turns (answering a hand-limit discard with the first cards offered) until it is `seat`'s main phase.
  fx.toTurnOf = function (s, seat) {
    let guard = 0;
    while (!(s.phase === 'main' && s.pending === null && s.active === seat)) {
      if (++guard > 20) throw new Error('fx.toTurnOf: stuck');
      if (s.pending !== null) {
        if (s.pending.purpose !== 'handLimit') throw new Error('fx.toTurnOf: unexpected pending ' + s.pending.purpose);
        s = fx.choose(s, s.pending.options.slice(0, s.pending.min));
      } else s = fx.endTurn(s);
    }
    return s;
  };

  // ---- arrange ------------------------------------------------------------------------------------------
  // fx.arrange(s, (h, t) => { ... }) -> a new state. h: door-based edits.
  fx.arrange = function (s, fn) {
    const t = XS.cloneState(s);
    const h = {
      // put the cards (card numbers) into the seat's hand, first returning the current hand to the deck (bottom)
      hand(seat, nos) {
        for (const i of t.players[seat].hand.slice()) D.moveZone(t, i, { seat, zone: 'deck' });
        for (const no of nos) h.give(seat, no);
      },
      give(seat, no, zone) {
        const P = t.players[seat];
        const dest = zone || 'hand';
        const i = P.deck.concat(P.hand, P.trash, P.tdeck).find((x) => t.cards[x].id === no && !P[dest].includes(x));
        if (i === undefined) throw new Error(`arrange.give: no ${no} left for seat ${seat}`);
        D.moveZone(t, i, { seat, zone: dest });
        return i;
      },
      // put cards on top of the deck so the next draws are known (nos[0] is drawn first)
      top(seat, nos) {
        for (const no of nos.slice().reverse()) {
          const P = t.players[seat];
          const i = P.deck.find((x) => t.cards[x].id === no);
          if (i === undefined) throw new Error(`arrange.top: no ${no} in the deck of seat ${seat}`);
          D.moveZone(t, i, { seat, zone: 'deck', pos: 'top' });
        }
      },
      // spend n PP (cards turned sideways), as paying a cost would
      spend(seat, n) { D.payPP(t, seat, n, null); },
      damage(seat, slot, n) { return D.dealDamage(t, `L${seat}${slot}`, n, 'effect'); },
      down(seat, slot) { D.downLeader(t, `L${seat}${slot}`, 'effect'); },
      awaken(seat, slot) { D.awaken(t, `L${seat}${slot}`, 'effect'); },
      // move a card from wherever to the trash (face down unless tactics)
      trash(seat, iid) { D.moveZone(t, iid, { seat, zone: 'trash' }); },
      // leave `n` cards in the deck: the rest go to the trash (face down)
      thinDeck(seat, n) { for (const i of t.players[seat].deck.slice(n)) D.moveZone(t, i, { seat, zone: 'trash' }); },
      emptyTacticsDeck(seat) { for (const i of t.players[seat].tdeck.slice()) D.moveZone(t, i, { seat, zone: 'trash' }); },
      t,
    };
    fn(h, t);
    t.arranged = (t.arranged || 0) + 1;
    return t;
  };

  // Play the attack card `no` (must be in hand) with attacker slot a of the active seat against target slot b.
  fx.attack = function (s, no, a, b) {
    const seat = s.active;
    const iid = fx.idOf(s, seat, no, ['hand']);
    return XS.apply(s, { type: 'play', iid, attacker: `L${seat}${a}`, target: `L${1 - seat}${b}` });
  };
  fx.play = function (s, no, extra) {
    const seat = s.active;
    const iid = fx.idOf(s, seat, no, ['hand', 'tarea']);
    return XS.apply(s, Object.assign({ type: 'play', iid }, extra));
  };
  // Answer any pending decision with its first legal answer (for tests that do not care).
  fx.settleWithFirst = function (s) {
    let guard = 0;
    while (s.pending !== null) { if (++guard > 30) throw new Error('settleWithFirst: stuck'); s = XS.apply(s, XS.legalActions(s)[0]); }
    return s;
  };
  // Finish the round in favour of `winner` with real actions: arrange the other team down except one leader with 10 HP left,
  // pass turns until the winner is to act, then play a cheap attack. Returns the state after the round was closed.
  fx.finishRound = function (s, winner, pre) {
    s = fx.toTurnOf(s, winner);
    const loser = 1 - winner;
    const atkNo = s.players[winner].hand.concat(s.players[winner].deck).map((i) => s.cards[i].id).find((id) => XS.CARDS[id].type === 'attack' && XS.CARDS[id].cost <= 2 && XS.opsFor(id, 'afterAttack').length === 0 && XS.attackOps(id, 0).length === 0);
    s = fx.arrange(s, (h, t) => {
      h.hand(winner, [atkNo]);
      for (let k = 1; k < 4; k++) h.down(loser, k);
      const st = XS.leaderStats(t, loser, 0);
      h.damage(loser, 0, st.hp - st.damage - 10);
      if (pre) pre(h, t);
    });
    s = fx.attack(s, atkNo, 0, 0);
    // the next round (if any) opens with the secret tactics picks: answer them with the first card offered
    while (s.pending !== null && s.pending.kind === 'pickTactics') s = XS.apply(s, { type: 'pickTactics', iid: s.pending.options[0] });
    return s;
  };
})();
