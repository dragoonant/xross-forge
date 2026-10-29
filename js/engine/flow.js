// Game flow: newGame, the resolution loop (settle), round setup, turns, round end, match end.
// Everything here runs inside apply() on a private copy of the state.
// Rules: docs/rules.md §5 setup, §7 modes, §8 turn, §15 round end, §16 deck-out.
(function () {
  'use strict';
  const XS = globalThis.XS;
  const D = XS.doors;
  const STEP = XS.STEP;

  // ---- match end ----------------------------------------------------------------------------------
  function endMatch(s, winner, reason, losers) {
    s.phase = 'over';
    s.pending = null;
    s.stack = [];
    s.atk = null;
    s.result = { winner, losers, reason };
    s.winner = winner;
    XS.log(s, winner === null ? 0 : winner, 'matchEnd', { winner, losers, reason, wins: s.wins.slice() }, null);
  }
  XS.endMatch = endMatch;

  // A tactics-deck exhaustion (PM p.14 Q1): the player who raised it loses; if both raised it in the same step both lose (PM p.17 Q11, FAQ #5).
  function endByLoss(s) {
    const losers = s.losing.slice().sort();
    if (losers.length === 2) endMatch(s, null, 'bothLose', losers);
    else endMatch(s, 1 - losers[0], 'tacticsDeckEmpty', losers);
  }

  // ---- the resolution loop --------------------------------------------------------------------------
  // Runs the top frame of the stack until a decision is pending, the stack is empty (the active player is to act), or the
  // match is over. A round that has been decided closes only when the stack is empty: pending effects still resolve (FAQ #15, #16, R-059).
  XS.settle = function (s) {
    let guard = 0;
    while (s.pending === null && s.phase !== 'over') {
      if (++guard > 50000) throw new Error('settle: runaway resolution');
      if (s.losing.length > 0) { endByLoss(s); break; }
      const f = s.stack.length > 0 ? s.stack[s.stack.length - 1] : null;
      if (f !== null) {
        f.ai = 0;
        s._via = f.k === 'ops' ? f.src : null;
        try { STEP[f.k](s, f); f.ans = []; }   // a step that returns has consumed its answers
        catch (e) { if (e !== XS.SUSPEND) throw e; }
        finally { s._via = null; }
        continue;
      }
      if (s.roundLoser !== null) { finishRound(s); continue; }
      break;
    }
  };

  // ---- turns ------------------------------------------------------------------------------------------
  // Start phase (PM p.06): untap all PP, draw 1. The first player draws on their first turn too (PM p.17 Q13, FAQ #11).
  function startTurn(s, seat) {
    s.phase = 'main';
    s.active = seat;
    s.turn++;
    s.roundTurn++;
    s.players[seat].tacPlayed = false;
    XS.log(s, seat, 'turnStart', { turn: s.turn, roundTurn: s.roundTurn });
    D.untapAll(s, seat);
    D.draw(s, seat, 1, 'turnStart');
  }
  XS.startTurn = startTurn;

  // End phase (PM p.06, FAQ #35): 1 play-area cards to the trash (tactics face up), 2 draw one per upright PP, 3 hand limit 7.
  STEP.endPhase = function (s, f) {
    const P = s.players[f.seat];
    switch (f.step) {
      case 'trash': {
        trashPlayArea(s, f.seat, 'endPhase');
        f.step = 'draw';
        return;
      }
      case 'draw':
        D.draw(s, f.seat, P.pp.untapped, 'endPhase');
        f.step = 'limit';
        return;
      case 'limit': {
        if (P.hand.length > 7) {   // R-020: the hand's owner chooses; checked only here
          const n = P.hand.length - 7;
          const ids = D.ask(s, f, { kind: 'choose', seat: f.seat, purpose: 'handLimit', options: P.hand.slice(), min: n, max: n, prompt: `Choose ${n} card${n === 1 ? '' : 's'} to discard down to 7.` });
          D.discard(s, f.seat, ids, 'handLimit');
        }
        f.step = 'next';
        return;
      }
      case 'next':
        s.stack.pop();
        XS.log(s, f.seat, 'turnEnd', { turn: s.turn });
        startTurn(s, 1 - f.seat);
        return;
      default: throw new Error('endPhase: bad step ' + f.step);
    }
  };

  // Play area -> trash, left to right: tactics face up, the rest face down (PM p.06, p.11). Unused boosts end (R-014, FAQ #45).
  function trashPlayArea(s, seat, cause) {
    const P = s.players[seat];
    const iids = P.play.slice();
    P.boosts = [];
    if (iids.length === 0) return;
    for (const iid of iids) D.moveZone(s, iid, { seat, zone: 'trash' });
    XS.log(s, seat, 'trash', { iids, cardIds: iids.map((i) => s.cards[i].id), faceUp: iids.map((i) => s.cards[i].kind === 'tactics'), cause });
  }

  // ---- rounds ---------------------------------------------------------------------------------------------
  function roundSetupFrame() { return { k: 'roundSetup', ai: 0, ans: [], step: 'begin', idx: 0, picks: [] }; }

  // Round setup (PM p.05 setup, PM p.11 next-round setup, FAQ #55 order): 1 each player picks a tactics card face down (the
  // second player of a quick match picks two; round-1 second player of a full match gets the PP Ticket), 2 PP, 3 draw 4
  // (first player first, R-036), then the first player's first turn.
  STEP.roundSetup = function (s, f) {
    const first = s.first, second = 1 - first;
    switch (f.step) {
      case 'begin':
        s.phase = 'setup';
        s.active = first;
        s.roundTurn = 0;
        f.picks = s.mode === 'quick' && s.round === 1 ? [first, second, second] : [first, second];
        f.idx = 0;
        XS.log(s, first, 'roundStart', { round: s.round, first, pp: s.mode === 'quick' ? 3 : 2 + s.round });
        f.step = 'picks';
        return;

      case 'picks': {
        if (f.idx >= f.picks.length) { f.step = 'rest'; return; }
        const seat = f.picks[f.idx];
        const P = s.players[seat];
        if (P.tdeck.length === 0) { f.idx++; return; }   // PM p.11: an empty tactics deck -> do nothing
        // R-058: the first player picks first; every pick is hidden from the other seat in XS.view
        const nth = f.picks.slice(0, f.idx).filter((x) => x === seat).length;
        const iid = D.ask(s, f, { kind: 'pickTactics', seat, purpose: 'tactics', options: P.tdeck.slice(), min: 1, max: 1, prompt: nth === 0 ? 'Choose a tactics card to place face down.' : 'Choose your second tactics card to place face down.' });
        D.moveZone(s, iid, { seat, zone: 'tarea' });
        XS.log(s, seat, 'tacticsPick', { iid, cardId: s.cards[iid].id });
        f.idx++;
        f.ans = [];
        return;
      }

      case 'rest': {
        // PM p.05 step 7, FAQ #37: the second player of round 1 of a full match places the PP Ticket face up.
        if (s.mode === 'full' && s.round === 1) {
          const t = s.players[second].aside.find((i) => s.cards[i].ticket === true);
          if (t !== undefined) {
            D.moveZone(s, t, { seat: second, zone: 'tarea' });
            XS.log(s, second, 'tacticsPlace', { iid: t, cardId: s.cards[t].id, why: 'ppTicket' });
          }
        }
        const total = s.mode === 'quick' ? 3 : 2 + s.round;   // PM p.04: 3 / 4 / 5 by round; R-046
        D.setPP(s, 0, total);
        D.setPP(s, 1, total);
        D.draw(s, first, 4, 'setup');
        D.draw(s, second, 4, 'setup');
        f.step = 'turn';
        return;
      }

      case 'turn':
        s.stack.pop();
        startTurn(s, first);
        return;

      default: throw new Error('roundSetup: bad step ' + f.step);
    }
  };

  // Which seat chooses to go first when first = 'random': the engine's RPS winner (R-045, PM p.05 step 5).
  STEP.start = function (s, f) {
    const first = D.ask(s, f, { kind: 'chooseFirst', seat: f.rps, purpose: 'first', options: [0, 1], min: 1, max: 1, prompt: 'You won the draw. Who goes first?' });
    s.first = first;
    s.active = first;
    XS.log(s, f.rps, 'chooseFirst', { by: f.rps, first });
    s.stack.pop();
    s.stack.push(roundSetupFrame());
  };

  // Round end (PM p.11/p.12, QM): the team that was fully downed first lost (R-018). Both players trash the play area and the
  // whole hand, remove all counters, revive all leaders; awakening, equipment, the trash and the tactics area stay (R-010).
  function finishRound(s) {
    const loser = s.roundLoser, winner = 1 - loser;
    s.wins[winner]++;
    XS.log(s, winner, 'roundEnd', { round: s.round, winner, loser, wins: s.wins.slice() });
    for (const seat of [0, 1]) {
      const P = s.players[seat];
      trashPlayArea(s, seat, 'roundEnd');
      D.discard(s, seat, P.hand.slice(), 'roundEnd');
      D.reviveAll(s, seat);
      P.tacPlayed = false;
    }
    s.roundLoser = null;
    s.atk = null;
    if (s.wins[winner] >= s.needWins) { endMatch(s, winner, 'rounds', [loser]); return; }
    s.round++;
    s.first = loser;   // PM p.11: the loser of the round goes first
    s.stack.push(roundSetupFrame());
  }

  // ---- newGame ---------------------------------------------------------------------------------------------
  XS.newGame = function (opts) {
    if (!opts || !Array.isArray(opts.decks) || opts.decks.length !== 2) throw new Error('newGame: decks must be [a, b]');
    const s = XS.buildState(opts);
    const first = opts.first === undefined ? 'random' : opts.first;
    if (first !== 0 && first !== 1 && first !== 'random') throw new Error("newGame: first is 0, 1 or 'random'");
    s.init = XS.deepFreeze(JSON.parse(JSON.stringify({ decks: opts.decks, seed: opts.seed === undefined ? 1 : opts.seed, mode: s.mode, first, names: opts.names || null })));
    XS.log(s, 0, 'start', { mode: s.mode, decks: [s.players[0].deckId, s.players[1].deckId], first: first === 'random' ? null : first });
    if (first === 'random') {
      const rps = XS.rngInt(s, 2);
      XS.log(s, rps, 'rps', { winner: rps });
      s.stack.push({ k: 'start', ai: 0, ans: [], rps });
    } else {
      s.first = first;
      s.active = first;
      XS.log(s, first, 'chooseFirst', { by: null, first });
      s.stack.push(roundSetupFrame());
    }
    XS.settle(s);
    return s;
  };
})();
