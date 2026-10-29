// js/ai/determinize.js: from a seat's XS.view, build ONE complete engine state that is consistent with
// everything that seat can see, sampling the hidden part (CLAUDE.md rule 7; M4 requirement 1).
//
// What is hidden from the viewer, and where the sample comes from:
//   * the opponent's hand, deck order, tactics deck and face-down tactics pick;
//   * the viewer's own deck order and the identity of the viewer's own face-down trash (nobody may look at
//     face-down trash, PM p.16 Q7, FAQ #3; ENGINE-API "Hidden information").
// The unseen cards of a seat are its decklist (XS.DECKS[view.players[p].deckId], public: both players see the
// other's deck name on the table) minus every card the view shows plus the cards the log already revealed on
// their way to the face-down trash (a card the opponent played is public while it sits in the play area; a
// human remembers it, so the AI may too). Unseen cards are dealt uniformly into the hidden slots with a seeded
// RNG: same view + same seed = same world.
//
// Only a state with NO pending decision is rebuilt (the main phase, nothing parked on the engine's private
// resolution stack). A pending decision is answered by js/ai/policies.js straight from the view.
(function () {
  'use strict';
  const XS = globalThis.XS;
  const AI = (XS.ai = XS.ai || {});

  // mulberry32 over a plain { rng } object, so XS.rngNext / XS.shuffleInPlace work on it.
  AI.rngOf = (seed) => ({ rng: seed | 0 });
  // Mix integers/strings into one 32-bit seed (FNV-1a over the joined string).
  AI.mixSeed = (...parts) => XS.hashSeed(parts.join(':'));

  function deckOf(view, p, decks) {
    if (decks !== undefined && decks !== null && decks[p] !== undefined && decks[p] !== null) {
      const d = decks[p];
      return typeof d === 'string' ? XS.DECKS[d] : d;
    }
    const id = view.players[p].deckId;
    const d = id === null ? undefined : XS.DECKS[id];
    if (d === undefined) throw new Error('ai.determinize: seat ' + p + ' plays a deck that is not registered in XS.DECKS (deckId ' + id + '); pass opts.decks');
    return d;
  }

  // Card numbers of face-down trash cards the log has already shown the viewer, per seat, since that seat's last reshuffle.
  function knownTrash(view) {
    const known = [[], []];
    for (const e of view.log) {
      const d = e.data;
      if (e.type === 'trash') {
        d.iids.forEach((_, i) => { if (!d.faceUp[i]) known[e.seat].push(d.cardIds[i]); });
      } else if (e.type === 'discard') {
        if (d.hidden !== true) for (const c of d.cardIds) known[e.seat].push(c);        // own discards only (the other seat's are redacted)
      } else if (e.type === 'reshuffle') known[e.data.seat] = [];
    }
    return known;
  }

  // AI.determinize(view, seed, opts) -> a raw engine state (log empty, no pending, no stack).
  AI.determinize = function (view, seed, opts) {
    if (view.pending !== null) throw new Error('ai.determinize: the view has a pending decision; policies answer those');
    if (view.phase !== 'main') throw new Error('ai.determinize: phase ' + view.phase);
    const me = view.viewer;
    const decks = opts === undefined ? undefined : opts.decks;
    const rg = AI.rngOf(seed);
    const known = knownTrash(view);
    const cards = Object.assign({}, view.cards);
    let mint = 0;
    const make = (p, id, extra) => {
      const iid = 'h' + p + '_' + (mint++);
      cards[iid] = Object.freeze(Object.assign({ iid, id, owner: p, kind: XS.CARDS[id].type }, extra));
      return iid;
    };
    const take = (arr, n) => arr.splice(0, n);

    const players = view.players.map((V, p) => {
      const deckDef = deckOf(view, p, decks);
      const own = p === me;
      // ---- main-deck cards (attack / memoria) ----
      const pool = [];
      for (const [id, qty] of deckDef.main) for (let i = 0; i < qty; i++) pool.push(id);
      const strike = (id) => {
        const k = pool.indexOf(id);
        if (k < 0) throw new Error('ai.determinize: seat ' + p + ' shows ' + id + ' more often than its decklist allows');
        pool.splice(k, 1);
      };
      const isMain = (iid) => { const t = cards[iid].kind; return t === 'attack' || t === 'memoria'; };
      if (own) for (const iid of V.hand) strike(cards[iid].id);
      for (const iid of V.play) if (isMain(iid)) strike(cards[iid].id);
      for (const id of known[p]) strike(id);
      const hiddenTrash = V.trash.filter((x) => typeof x !== 'string').length;
      const unknownTrash = hiddenTrash - known[p].length;
      const need = V.counts.deck + (own ? 0 : V.counts.hand) + unknownTrash;
      if (unknownTrash < 0 || pool.length !== need) {
        throw new Error(`ai.determinize: seat ${p} has ${pool.length} unseen main cards for ${need} hidden slots (deck ${V.counts.deck}, hand ${own ? 0 : V.counts.hand}, unknown trash ${unknownTrash})`);
      }
      XS.shuffleInPlace(rg, pool);
      const hand = own ? V.hand.slice() : take(pool, V.counts.hand).map((id) => make(p, id));
      const deck = take(pool, V.counts.deck).map((id) => make(p, id));
      const trashIds = known[p].concat(pool);                 // known ones + the rest of the pool
      XS.shuffleInPlace(rg, trashIds);
      let ti = 0;
      const trash = V.trash.map((x) => (typeof x === 'string' ? x : make(p, trashIds[ti++])));

      // ---- tactics cards ----
      let tdeck, tarea;
      if (own) { tdeck = V.tdeck.slice(); tarea = V.tarea.slice(); }
      else {
        const tpool = deckDef.tactics.slice();
        const seenT = [];
        for (const L of V.leaders) for (const e of L.equipment) seenT.push(cards[e].id);
        for (const iid of V.trash) if (typeof iid === 'string') seenT.push(cards[iid].id);
        for (const iid of V.play) if (cards[iid].kind === 'tactics') seenT.push(cards[iid].id);
        for (const id of seenT) { const k = tpool.indexOf(id); if (k >= 0) tpool.splice(k, 1); }
        const hiddenArea = V.tarea.filter((x) => typeof x !== 'string').length;
        if (tpool.length !== V.counts.tdeck + hiddenArea) {
          throw new Error(`ai.determinize: seat ${p} has ${tpool.length} unseen tactics for ${V.counts.tdeck} + ${hiddenArea} hidden slots`);
        }
        XS.shuffleInPlace(rg, tpool);
        tarea = V.tarea.map((x) => (typeof x === 'string' ? x : make(p, tpool.shift())));
        tdeck = tpool.map((id) => make(p, id));
      }
      return {
        name: V.name, deckId: V.deckId, deckName: V.deckName,
        deck, hand, play: V.play.slice(), trash, tdeck, tarea, aside: V.aside.slice(),
        pp: { total: V.pp.total, untapped: V.pp.untapped },
        leaders: V.leaders.map((L) => ({ iid: L.iid, cardId: L.cardId, slot: L.slot, damage: L.damage, down: L.down, awakened: L.awakened, equipment: L.equipment.slice() })),
        boosts: V.boosts.slice(), tacPlayed: V.tacPlayed,
      };
    });
    return {
      mode: view.mode, seed: 0, rng: rg.rng,
      phase: view.phase, round: view.round, needWins: view.needWins, wins: view.wins.slice(),
      first: view.first, active: view.active, turn: view.turn, roundTurn: view.roundTurn, roundLoser: view.roundLoser,
      result: null, winner: null, losing: [],
      players, cards: Object.freeze(cards), pending: null, atk: null, atkSeq: 0, stack: [],
      log: [], seq: view.seq, _via: null,
      init: null, actions: [],
    };
  };
})();
