// State helpers: card lookup, the fast state clone, leader references and live leader stats, and
// the construction of a fresh game state (cards are instantiated here, once; the registry never
// changes afterwards). Contract: docs/ENGINE-API.md. Rules: docs/rules.md (PM = Playing Manual).
(function () {
  'use strict';
  const XS = globalThis.XS;
  const { Illegal } = XS;

  XS.opp = (seat) => 1 - seat;

  // States rebuilt outside newGame (the AI's determinized worlds, js/ai/determinize.js) predate the fields added after the
  // freeze (docs/ENGINE-API.md "Changes after freeze", 2026-10-30). apply() calls this on its private copy so such a state
  // gets the empty value of every missing field; a state from newGame already has them all and is untouched.
  XS.normalize = function (s) {
    if (s.freeQ === undefined) s.freeQ = [];
    if (s.once === undefined) s.once = {};
    if (s.lastLoser === undefined) s.lastLoser = null;
    for (const P of s.players) {
      if (P.sideways === undefined) P.sideways = [];
      if (P.buffs === undefined) P.buffs = [];
      if (P.discards === undefined) P.discards = 0;
    }
    return s;
  };

  // The card record for a card number, or for an instance id when the state is given.
  XS.def = function (idOrIid, s) {
    if (s && s.cards[idOrIid]) return XS.CARDS[s.cards[idOrIid].id];
    const d = XS.CARDS[idOrIid];
    if (d === undefined) throw new Error('unknown card ' + idOrIid);
    return d;
  };

  // ---- clone -------------------------------------------------------------------------------
  // apply() never mutates its input. A full structuredClone would copy the log and the registry on
  // every step, so: frozen objects (log entries, the card registry, effect data, recorded actions)
  // are SHARED between states and everything else is copied. Never mutate a frozen object.
  function cl(v) {
    if (v === null || typeof v !== 'object' || Object.isFrozen(v)) return v;
    if (Array.isArray(v)) {
      if (v.length === 0 || typeof v[0] !== 'object') return v.slice();   // arrays of ids / numbers (every array in the state is homogeneous)
      const n = new Array(v.length);
      for (let i = 0; i < v.length; i++) n[i] = cl(v[i]);
      return n;
    }
    const o = {};
    for (const k in v) o[k] = cl(v[k]);
    return o;
  }
  XS.cloneState = function (s) {
    const o = {};
    for (const k in s) o[k] = (k === 'log' || k === 'actions') ? s[k].slice() : cl(s[k]);
    return o;
  };
  XS.deepFreeze = function freeze(o) {
    if (o === null || typeof o !== 'object' || Object.isFrozen(o)) return o;
    Object.freeze(o);
    for (const k of Object.keys(o)) freeze(o[k]);
    return o;
  };

  // ---- leaders -------------------------------------------------------------------------------
  // Leader instance ids are 'L<seat><slot>'.
  XS.isLeader = (iid) => iid.charCodeAt(0) === 76 && iid.length === 3;
  XS.leaderSeat = (iid) => iid.charCodeAt(1) - 48;
  XS.leaderSlot = (iid) => iid.charCodeAt(2) - 48;
  XS.leader = (s, iid) => s.players[iid.charCodeAt(1) - 48].leaders[iid.charCodeAt(2) - 48];

  XS.hasTag = (cardId, tag) => { const t = XS.TAGS[cardId]; return t !== undefined && t.includes(tag); };

  // Live ATK/HP of a leader: the face showing, plus the static stat modifiers of its equipment (ライトシールド HP+30, PM p.10;
  // サイバネアーマー sets the base HP, the stat bonus comes after), plus the seat-wide ATK bonuses (XS.seatAtkBonus: 【ラウンド中】
  // cards in the play area, "this turn" buffs; R-043). Every number the UI shows about a leader comes from here.
  XS.leaderStats = function (s, seat, slot) {
    const L = s.players[seat].leaders[slot];
    const d = XS.CARDS[L.cardId];
    let atk = L.awakened ? d.awakenAtk : d.atk;
    let hp = L.awakened ? d.awakenHp : d.hp;
    // Equipment stats are data on the card: CARDS[no].equip = { hp?, atk?, hpBase?, hpBaseAwakened? } (tools/out/card-fields.md); hpBase /
    // hpBaseAwakened REPLACE the printed HP of the face showing (サイバネアーマー), the additive bonuses of all equipment come after.
    // The older form, a static statMod op on the card's effects, is still read (ST01-023 until its cards.js entry carries `equip`);
    // validate-abilities refuses a card that has both.
    for (const e of L.equipment) {
      const q = XS.CARDS[s.cards[e].id].equip;
      if (q !== undefined && (q.hpBase !== undefined || q.hpBaseAwakened !== undefined)) hp = L.awakened ? q.hpBaseAwakened : q.hpBase;
    }
    for (const e of L.equipment) {
      const q = XS.CARDS[s.cards[e].id].equip;
      if (q !== undefined) { hp += q.hp || 0; atk += q.atk || 0; }
      for (const m of XS.staticMods(s.cards[e].id)) { if (m.stat === 'hp') hp += m.n; else if (m.stat === 'atk') atk += m.n; }
    }
    atk += XS.seatAtkBonus(s, seat);
    return {
      iid: L.iid, cardId: L.cardId, seat, slot, atk, hp, damage: L.damage, remaining: hp - L.damage,
      down: L.down, awakened: L.awakened, tags: XS.TAGS[L.cardId] || [],
      equipment: L.equipment.map((e) => ({ iid: e, cardId: s.cards[e].id })),
    };
  };
  XS.leaderStatsOf = (s, iid) => XS.leaderStats(s, XS.leaderSeat(iid), XS.leaderSlot(iid));

  XS.aliveLeaders = (s, seat) => s.players[seat].leaders.filter((L) => !L.down).map((L) => L.iid);

  // ---- new state -----------------------------------------------------------------------------
  function resolveDeck(d) {
    if (typeof d === 'string') {
      const f = XS.DECKS[d];
      if (f === undefined) throw new Error('unknown deck ' + d);
      return f;
    }
    if (d === null || typeof d !== 'object') throw new Error('a deck is an id or an object');
    return d;
  }

  XS.buildState = function (opts) {
    const seedIn = opts.seed === undefined ? 1 : opts.seed;
    const seed = typeof seedIn === 'number' ? seedIn | 0 : XS.hashSeed(seedIn);
    const mode = opts.mode === 'quick' ? 'quick' : 'full';
    const s = {
      mode, seed, rng: seed,
      phase: 'chooseFirst', round: 1, needWins: mode === 'quick' ? 1 : 2, wins: [0, 0],
      first: null, active: 0, turn: 0, roundTurn: 0, roundLoser: null,
      result: null, winner: null, losing: [],
      players: [], cards: {}, pending: null, atk: null, atkSeq: 0, stack: [],
      log: [], seq: 0, _via: null,
      freeQ: [], once: {}, lastLoser: null,
      init: null, actions: [],
    };
    const registry = {};
    let n = 1;
    const mk = (iid, id, owner, extra) => {
      const d = XS.CARDS[id];
      if (d === undefined) throw new Error('unknown card ' + id);
      registry[iid] = Object.freeze(Object.assign({ iid, id, owner, kind: d.type }, extra));
      return iid;
    };
    for (let p = 0; p < 2; p++) {
      const deck = resolveDeck(opts.decks[p]);
      if (!Array.isArray(deck.leaders) || deck.leaders.length !== 4) throw new Error('a deck needs exactly 4 leaders');
      const P = {
        name: (opts.names && opts.names[p]) || `Player ${p + 1}`, deckId: deck.id || null, deckName: deck.nameEn || deck.name || deck.id || 'Deck',
        deck: [], hand: [], play: [], trash: [], tdeck: [], tarea: [], aside: [],
        pp: { total: 3, untapped: 3 }, leaders: [], boosts: [], tacPlayed: false,
        sideways: [], buffs: [], discards: 0,
      };
      s.players.push(P);
      deck.leaders.forEach((id, slot) => {
        const iid = mk(`L${p}${slot}`, id, p, { slot });
        P.leaders.push({ iid, cardId: id, slot, damage: 0, down: false, awakened: false, equipment: [] });
      });
      for (const [id, qty] of deck.main) for (let i = 0; i < qty; i++) P.deck.push(mk('c' + n++, id, p));
      XS.shuffleInPlace(s, P.deck);   // PM p.05 step 3
      for (const id of deck.tactics) P.tdeck.push(mk('c' + n++, id, p));
      // The PP Ticket is a card instance that never enters the tactics deck (PM p.03, FAQ #57). It waits in the 'aside'
      // zone (out of play) and is placed in the tactics area in round 1 of a full match only (FAQ #37).
      if (deck.ppTicket) P.aside.push(mk('c' + n++, deck.ppTicket, p, { ticket: true }));
    }
    s.cards = Object.freeze(registry);
    return s;
  };
})();
