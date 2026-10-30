// The doors: one function per rule that changes the game, and the only code allowed to write the
// fields they own (CLAUDE.md rule 3). Damage counters and the down/awaken flags are written here;
// zones are written by moveZone only; PP by payPP/recoverPP only; hands by draw/discard/moveZone.
// Citations: PM p.N = Playing Manual page, (FAQ #id), (R-0NN) = docs/rulings.md.
(function () {
  'use strict';
  const XS = globalThis.XS;
  const D = (XS.doors = {});
  const SUSPEND = (XS.SUSPEND = { suspend: true });   // thrown by ask() to park a decision; caught by settle()

  const cardsOf = (s, ids) => ids.map((i) => s.cards[i].id);

  // ---- zones -------------------------------------------------------------------------------
  // Where a card instance is: { seat, zone, leader? }. Equipment reports zone 'equip' with its host.
  D.where = function (s, iid) {
    const owner = s.cards[iid].owner;
    for (const seat of [owner, 1 - owner]) {
      const P = s.players[seat];
      for (const z of ['deck', 'hand', 'play', 'trash', 'tdeck', 'tarea', 'aside']) if (P[z].includes(iid)) return { seat, zone: z };
      for (const L of P.leaders) if (L.equipment.includes(iid)) return { seat, zone: 'equip', leader: L.iid };
    }
    return null;
  };

  // The one zone door. to = { seat, zone, leader?, pos? } with zone in deck|hand|play|trash|tdeck|tarea|aside|equip.
  // pos 'top' puts the card on top of the deck (index 0); every other destination appends (right / newest).
  D.moveZone = function (s, iid, to) {
    const from = D.where(s, iid);
    if (from === null) throw new Error('moveZone: ' + iid + ' is nowhere');
    const P = s.players[from.seat];
    if (from.zone === 'equip') { const eq = XS.leader(s, from.leader).equipment; eq.splice(eq.indexOf(iid), 1); }
    else P[from.zone].splice(P[from.zone].indexOf(iid), 1);
    if (from.zone === 'play') { const k = P.sideways.indexOf(iid); if (k >= 0) P.sideways.splice(k, 1); }   // Echo: a card that leaves the play area is upright when it comes back
    const Q = s.players[to.seat];
    if (to.zone === 'equip') XS.leader(s, to.leader).equipment.push(iid);
    else if (to.zone === 'deck' && to.pos === 'top') Q.deck.unshift(iid);
    else Q[to.zone].push(iid);
  };

  // ---- PP (PM p.06, p.16 Q9, FAQ #7) -----------------------------------------------------------
  D.payPP = function (s, seat, n, forIid) {
    const pp = s.players[seat].pp;
    if (n < 0 || n > pp.untapped) throw new Error('payPP: cannot pay ' + n + ' with ' + pp.untapped);
    if (n === 0) return;
    pp.untapped -= n;
    XS.log(s, seat, 'ppSpend', { n, for: forIid });
  };
  // Turns up to n sideways PP cards upright; recovering more than there are untaps them all (R-017).
  D.recoverPP = function (s, seat, n, cause) {
    const pp = s.players[seat].pp;
    const k = Math.min(n, pp.total - pp.untapped);
    pp.untapped += k;
    if (k > 0 || cause === 'effect') XS.log(s, seat, 'ppRecover', { n: k, requested: n, cause });
    return k;
  };
  // Round setup: the PP zone holds `total` cards, all upright (PM p.04: 3/4/5 by round; PM p.11 step 2).
  D.setPP = function (s, seat, total) { const pp = s.players[seat].pp; pp.total = total; pp.untapped = total; };
  D.untapAll = (s, seat) => D.recoverPP(s, seat, s.players[seat].pp.total, 'untap');

  // ---- damage, healing, down, awaken (PM p.08, p.12) ------------------------------------------------
  // Deals n damage to a leader that is not down (R-002); 0 damage places no counters (R-016). A leader whose
  // counters reach its HP is downed at once (PM p.12). Returns { dealt, downed, excess } where excess = damage beyond the HP that was left
  // before this damage. `leave` = "if this would down the leader, its remaining HP becomes `leave` instead" (R-042).
  // While an attack is open, damage to the attacked leader accumulates in s.atk.dealt and s.atk.excess = dealt - the remaining HP it
  // had before the attack (FAQ #44, #115, R-005: the 【アタック後】 damage counts too); damage effects during the 【アタック後】 step are
  // counted in s.atk.afterDealt (オートタレット's condition).
  D.dealDamage = function (s, leaderIid, n, kind, leave) {
    const L = XS.leader(s, leaderIid);
    if (L.down || n <= 0) return { dealt: 0, downed: false, excess: 0 };
    const st = XS.leaderStats(s, XS.leaderSeat(leaderIid), L.slot);
    const before = L.damage;
    if (leave !== undefined && before + n >= st.hp) n = Math.max(0, st.hp - leave - before);
    if (n === 0) return { dealt: 0, downed: false, excess: 0 };
    L.damage += n;
    XS.log(s, XS.leaderSeat(leaderIid), 'damage', { leader: leaderIid, amount: n, kind: kind || 'effect', before, after: L.damage });
    const a = s.atk;
    if (a !== null) {
      if (leaderIid === a.target) { a.dealt += n; a.excess = Math.max(0, a.dealt - a.remain); }
      if (a.afterOpen && kind === 'effect') a.afterDealt += n;
    }
    if (L.damage >= st.hp) {
      D.downLeader(s, leaderIid, kind === 'attack' ? 'damage' : 'effect');
      return { dealt: n, downed: true, excess: Math.max(0, n - (st.hp - before)) };
    }
    return { dealt: n, downed: false, excess: 0 };
  };

  // Down: remove all counters and turn the leader sideways (PM p.08). Equipment stays (R-012). The round ends when a
  // team is fully downed; the first team to be fully downed loses it (R-018). A down of an opposing leader while an
  // attack is open counts toward the attacker's awakening (PM p.12; R-006/R-007: only inside the attack).
  D.downLeader = function (s, leaderIid, cause) {
    const L = XS.leader(s, leaderIid);
    if (L.down) return;
    const seat = XS.leaderSeat(leaderIid);
    L.damage = 0;
    L.down = true;
    XS.log(s, seat, 'down', { leader: leaderIid, seat, slot: L.slot, cause });
    if (s.players[seat].leaders.every((x) => x.down) && s.roundLoser === null) s.roundLoser = seat;
    if (s.atk !== null && !s.atk.closed && seat !== s.atk.seat) s.atk.downs++;
  };

  // Round end: remove all damage counters and revive every downed leader (PM p.11 steps 3-4). Awakening and equipment stay.
  D.reviveAll = function (s, seat) { for (const L of s.players[seat].leaders) { L.damage = 0; L.down = false; } };

  // If a leader's HP fell to or below its counters (equipment moved off), it is downed at once (R-013, FAQ #80).
  D.recheckHp = function (s, leaderIid) {
    const L = XS.leader(s, leaderIid);
    if (L.down) return;
    if (L.damage >= XS.leaderStats(s, XS.leaderSeat(leaderIid), L.slot).hp) D.downLeader(s, leaderIid, 'effect');
  };

  // Heal: remove up to n counters from a leader that is not down (R-041); returns the counters actually removed (FAQ #6).
  D.heal = function (s, leaderIid, n) {
    const L = XS.leader(s, leaderIid);
    if (L.down) return 0;
    const k = Math.min(n, L.damage);
    L.damage -= k;
    XS.log(s, XS.leaderSeat(leaderIid), 'heal', { leader: leaderIid, amount: k, requested: n });
    return k;
  };

  // Awaken: flip to the awakened face. Counters stay (R-011). No-op for a leader already awake or down. Returns true if it awakened.
  D.awaken = function (s, leaderIid, cause) {
    const L = XS.leader(s, leaderIid);
    if (L.awakened || L.down) return false;
    L.awakened = true;
    const st = XS.leaderStats(s, XS.leaderSeat(leaderIid), L.slot);
    XS.log(s, st.seat, 'awaken', { leader: leaderIid, seat: st.seat, slot: L.slot, cause, atk: st.atk, hp: st.hp });
    return true;
  };

  // ---- match loss ------------------------------------------------------------------------------------
  // Flags a match loss; settle() closes the match at the next checkpoint, so two losses raised in the same step are both
  // recorded and both players lose (PM p.17 Q11, FAQ #5, R-036).
  D.matchLoss = function (s, seat) { if (!s.losing.includes(seat)) s.losing.push(seat); };

  // ---- draw and deck-out (PM p.14 Q1, FAQ #1, #29, #55, R-035, R-047) ------------------------------------------
  // Deck-out procedure: the remaining deck stays on top, the trash's face-down cards are shuffled under it, then one
  // random card of the tactics deck goes to the trash face up; with no tactics card left the player loses the match.
  D.deckOut = function (s, seat) {
    const P = s.players[seat];
    const down = P.trash.filter((i) => s.cards[i].kind !== 'tactics');   // face-up (tactics) cards never return
    XS.shuffleInPlace(s, down);
    P.trash = P.trash.filter((i) => s.cards[i].kind === 'tactics');
    P.deck.push(...down);
    XS.log(s, seat, 'reshuffle', { seat, n: down.length });
    if (P.tdeck.length === 0) { D.matchLoss(s, seat); return; }
    const iid = P.tdeck[XS.rngInt(s, P.tdeck.length)];
    D.moveZone(s, iid, { seat, zone: 'trash' });
    XS.log(s, seat, 'tacticsBurn', { seat, iid, cardId: s.cards[iid].id });
  };

  // Draw n cards. The deck-out procedure runs when a card is needed and the deck is empty, once per operation (a second
  // shortfall in the same draw is ignored, R-035); cards that can be drawn are drawn first (FAQ #29).
  D.draw = function (s, seat, n, cause) {
    const P = s.players[seat];
    let handled = false, got = 0;
    for (let i = 0; i < n; i++) {
      if (P.deck.length === 0) {
        if (handled) break;
        handled = true;
        D.deckOut(s, seat);
        if (P.deck.length === 0) break;
      }
      const iid = P.deck[0];
      D.moveZone(s, iid, { seat, zone: 'hand' });
      XS.log(s, seat, 'draw', { iid, cardId: s.cards[iid].id, cause });
      got++;
    }
    return got;
  };

  // ---- discard (PM p.04, R-020, R-037, FAQ #4, #47) -----------------------------------------------------------
  // Hand cards go to the trash face down (not revealed).
  D.discard = function (s, seat, iids, cause) {
    if (iids.length === 0) return;
    for (const iid of iids) D.moveZone(s, iid, { seat, zone: 'trash' });
    if (cause !== 'roundEnd') s.players[seat].discards += iids.length;   // "このターン、あなたが手札を1枚以上捨てているなら" (reset at every turn start)
    XS.log(s, seat, 'discard', { iids: iids.slice(), cardIds: cardsOf(s, iids), n: iids.length, cause });
  };

  // ---- looking at the deck, free play, revive, buffs, shuffles (docs/ABILITIES.md) ---------------------------------------------
  // The top n cards of a deck, for 見る / 公開する. A deck that is short runs the deck-out procedure once first (PM p.14 Q1, FAQ #109,
  // #117, #119: the remaining cards stay on top and the shuffled trash goes under them), then as many cards as exist are returned.
  D.peek = function (s, seat, n) {
    const P = s.players[seat];
    if (P.deck.length < n) D.deckOut(s, seat);
    return P.deck.slice(0, n);
  };
  // A card that was looked at leaves the deck of `owner` for `to` ({seat, zone: 'hand'|'trash'}).
  D.takeFromDeck = function (s, owner, iid, to) {
    if (!s.players[owner].deck.includes(iid)) throw new Error('takeFromDeck: ' + iid + ' is not in the deck');
    D.moveZone(s, iid, to);
  };
  // Play a card without paying: it goes to the far right of the play area (FAQ #70) and waits in s.freeQ; its effects resolve when the
  // play that put it there has finished (the 'freeQueue' frame, R-027/R-044). The cost is simply never paid (no ppSpend).
  D.freePlace = function (s, seat, iid) {
    D.moveZone(s, iid, { seat, zone: 'play' });
    s.freeQ.push(iid);
  };
  // Echo (R-024): turn a play-area card sideways / upright.
  D.setSideways = function (s, seat, iid, on) {
    const sw = s.players[seat].sideways;
    const k = sw.indexOf(iid);
    if (on && k < 0) sw.push(iid);
    if (!on && k >= 0) sw.splice(k, 1);
  };
  // Bring a downed leader back (復活ポータル / 復活ビーコン, FAQ #23): not down, no counters, every card it carries to the trash face up.
  // Awakening stays. Nobody awakens (R-006).
  D.reviveLeader = function (s, leaderIid) {
    const L = XS.leader(s, leaderIid);
    if (!L.down) return;
    const seat = XS.leaderSeat(leaderIid);
    const eq = L.equipment.slice();
    L.down = false;
    L.damage = 0;
    for (const e of eq) D.moveZone(s, e, { seat, zone: 'trash' });
    XS.log(s, seat, 'revive', { leader: leaderIid, seat, slot: L.slot, equipment: eq, cardIds: cardsOf(s, eq) });
  };
  // Buffs that end with the turn or the round (先導者の証): { stat: 'atk', n, until: 'turn'|'round' }.
  D.addBuff = function (s, seat, b) { s.players[seat].buffs.push(b); };
  D.endBuffs = function (s, seat, until) { s.players[seat].buffs = s.players[seat].buffs.filter((b) => b.until !== until); };
  // All face-down trash cards go into the deck and the deck is shuffled (アイテムショップ); tactics cards in the trash stay (face up). No
  // tactics penalty (R-019).
  D.shuffleTrashIn = function (s, seat) {
    const P = s.players[seat];
    const down = P.trash.filter((i) => s.cards[i].kind !== 'tactics');
    P.trash = P.trash.filter((i) => s.cards[i].kind === 'tactics');
    P.deck.push(...down);
    XS.shuffleInPlace(s, P.deck);
    XS.log(s, seat, 'reshuffle', { seat, n: down.length });
  };

  // ---- asking (the one choice door, CLAUDE.md rule 4) ----------------------------------------------------------
  // A resolution frame asks by calling ask(): if the frame already holds the answer it is returned, otherwise the
  // decision is parked in s.pending and SUSPEND is thrown. The step then re-runs from its start after the answer, so a
  // step must make every ask BEFORE it changes anything (docs/ABILITIES.md).
  D.ask = function (s, f, spec) {
    const i = f.ai++;
    if (f.ans[i] !== undefined) return f.ans[i];
    s.pending = Object.assign({ source: f.src === undefined ? null : f.src, min: 1, max: 1, options: [] }, spec);
    throw SUSPEND;
  };
})();
