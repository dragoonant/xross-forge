// The surface (docs/ENGINE-API.md): legalActions, apply, whoActs, isTerminal, view, costToPlay, whyNot, previewAttack,
// actionsFor, replay. apply() copies the state, performs the action, then settle() resolves until the next decision.
(function () {
  'use strict';
  const XS = globalThis.XS;
  const D = XS.doors;
  const { Illegal } = XS;

  XS.isTerminal = (s) => s.phase === 'over';
  XS.whoActs = function (s) {
    if (s.phase === 'over') return null;
    return s.pending !== null ? s.pending.seat : s.active;
  };

  // ---- playing cards ------------------------------------------------------------------------------------
  // PP the card costs now: the printed cost plus the modifiers (the card's own costMod / costFloor / costFree, the costAura of 【ラウンド中】
  // cards in either play area, FAQ #138; XS.costParts lists them), never below 0 (R-034).
  XS.costToPlay = (s, iid) => XS.costParts(s, iid).total;

  const hasOnPlay = (cardId) => XS.hasTiming(cardId, 'onPlay');

  // null when the card can be played now by the active player, else one short sentence.
  XS.whyNot = function (s, iid) {
    if (s.phase === 'over') return 'The match is over.';
    if (s.pending !== null) return 'Answer the pending decision first.';
    if (s.phase !== 'main' || s.stack.length > 0) return 'Wait for the main phase.';
    const c = s.cards[iid];
    if (c === undefined) return 'Unknown card.';
    const seat = s.active, P = s.players[seat];
    if (c.owner !== seat) return 'It is not that player\'s turn.';
    const d = XS.CARDS[c.id];
    if (d.type === 'attack' || d.type === 'memoria') {
      if (!P.hand.includes(iid)) return 'That card is not in your hand.';
    } else if (d.type === 'tactics') {
      if (!P.tarea.includes(iid)) return 'That card is not in your tactics area.';
      if (P.tacPlayed) return 'You already played a tactics card this turn.';
      if (seat === s.first && s.roundTurn === 1) return 'The first player cannot play tactics on their first turn of a round.';   // PM p.10, FAQ #49, R-008
    } else return 'That card cannot be played.';
    const cost = XS.costToPlay(s, iid);
    if (P.pp.untapped < cost) return `Needs ${cost} PP, you have ${P.pp.untapped} untapped.`;
    if (d.type === 'attack' && (XS.aliveLeaders(s, seat).length === 0 || XS.aliveLeaders(s, 1 - seat).length === 0)) return 'No leader can attack.';
    if (d.tactics === 'equipment' && XS.aliveLeaders(s, seat).length === 0) return 'Equipment needs a leader that is not down.';
    for (const op of XS.opsFor(c.id, 'static')) if (op.op === 'playIf' && !XS.cond(op.if, { s, seat, src: iid })) return op.msg;   // 復活ポータル: playable only if ...
    return null;
  };

  // Attack preview: the number the UI shows (every number comes from the engine).
  XS.previewAttackDetail = function (s, action) {
    let seat, card, seg = 0, boosts;
    if (action.type === 'play') {
      card = action.iid; seat = s.cards[card].owner;
      boosts = s.players[seat].boosts;
    } else if (action.type === 'attack') {
      if (s.atk === null) throw new Illegal('no attack is being resolved');
      card = s.atk.card; seat = s.atk.seat; seg = s.atk.seg;
      boosts = seg === 0 ? s.players[seat].boosts : [];
    } else throw new Illegal('previewAttack takes a play or attack action');
    if (s.cards[card].kind !== 'attack') throw new Illegal('not an attack card');
    const parts = XS.damageParts(s, seat, action.attacker, card, seg, boosts);
    const goesDown = XS.attackOps(s.cards[card].id, seg).some((o) => o.op === 'downAttacked' && (o.if === undefined || XS.cond(o.if, { s, seat })));
    return { total: parts.total, atk: parts.atk, boosts: parts.boosts, card: parts.card, goesDown, attackerId: action.attacker, targetId: action.target };
  };
  XS.previewAttack = (s, action) => XS.previewAttackDetail(s, action).total;

  // ---- legal actions ---------------------------------------------------------------------------------------------
  // Deterministic sample of k-subsets (sizes min..max) of `options`, at most `cap` of them.
  function subsets(options, min, max, cap) {
    const out = [];
    const n = options.length;
    for (let k = min; k <= Math.min(max, n) && out.length < cap; k++) {
      const idx = Array.from({ length: k }, (_, i) => i);
      for (;;) {
        out.push(idx.map((i) => options[i]));
        if (out.length >= cap) break;
        let i = k - 1;
        while (i >= 0 && idx[i] === n - k + i) i--;
        if (i < 0) break;
        idx[i]++;
        for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
      }
    }
    return out;
  }

  // Splits of `total` in steps of `unit` over the options, for a random bot: everything on one leader, the even split, then (review fix 2026-10-30)
  // either EVERY split in units when there are at most DIST_ALL of them, or an even-stride sample of the full lexicographic list, uneven ones
  // included (Drain Rod 30+10, FAQ #64). Deterministic; `apply` accepts any valid split, the UI and the AI build their own.
  const DIST_ALL = 48, DIST_SAMPLE = 24, DIST_MAX_ENUM = 5000;
  function distributeActions(p) {
    const keys = p.options, n = keys.length, units = p.total / p.unit;
    const out = [], seen = new Set();
    const add = (parts) => {
      const alloc = {};
      parts.forEach((u, k) => { if (u > 0) alloc[keys[k]] = u * p.unit; });
      const key = JSON.stringify(alloc);
      if (!seen.has(key)) { seen.add(key); out.push({ type: 'distribute', alloc }); }
    };
    keys.forEach((_, i) => add(keys.map((__, k) => (k === i ? units : 0))));
    if (n > 1 && Number.isInteger(units)) add(keys.map((_, k) => Math.floor(units / n) + (k < units % n ? 1 : 0)));
    if (n < 2 || !Number.isInteger(units)) return out;
    let count = 1;   // C(units + n - 1, n - 1) splits
    for (let i = 1; i < n; i++) count = (count * (units + i)) / i;
    if (count > DIST_MAX_ENUM) return out;
    const all = [];
    const rec = (k, left, parts) => {
      if (k === n - 1) { all.push(parts.concat(left)); return; }
      for (let u = left; u >= 0; u--) rec(k + 1, left - u, parts.concat(u));   // the first leader gets the most first
    };
    rec(0, units, []);
    if (all.length <= DIST_ALL) all.forEach(add);
    else for (let i = 0; i < DIST_SAMPLE; i++) add(all[Math.floor((i * all.length) / DIST_SAMPLE)]);
    return out;
  }

  function pendingActions(s) {
    const p = s.pending;
    switch (p.kind) {
      case 'chooseFirst': return [{ type: 'chooseFirst', first: 0 }, { type: 'chooseFirst', first: 1 }];
      case 'pickTactics': return p.options.map((iid) => ({ type: 'pickTactics', iid }));
      case 'choose': {
        if (p.limit === undefined) return subsets(p.options, p.min, p.max, 48).map((ids) => ({ type: 'choose', ids }));
        // a pick under a limit (cost sum, one per type): sample the subsets that satisfy it
        return subsets(p.options, p.min, p.max, 400).filter((ids) => XS.limitOk(p.limit, ids.map((i) => s.cards[i].id))).slice(0, 48).map((ids) => ({ type: 'choose', ids }));
      }
      case 'attackPair': {
        const out = [];
        for (const attacker of p.attackers) for (const target of p.targets) out.push({ type: 'attack', attacker, target });
        return out;
      }
      case 'distribute': return distributeActions(p);
      default: throw new Error('unknown pending kind ' + p.kind);
    }
  }

  XS.legalActions = function (s) {
    if (s.phase === 'over') return [];
    if (s.pending !== null) return pendingActions(s);
    const seat = s.active, P = s.players[seat];
    const out = [];
    const mine = XS.aliveLeaders(s, seat), theirs = XS.attackTargets(s, seat);
    for (const iid of P.hand) {
      if (XS.whyNot(s, iid) !== null) continue;
      const d = XS.CARDS[s.cards[iid].id];
      if (d.type === 'attack' && !hasOnPlay(s.cards[iid].id)) {
        for (const attacker of mine) for (const target of theirs) out.push({ type: 'play', iid, attacker, target });
      } else out.push({ type: 'play', iid });
    }
    for (const iid of P.tarea) {
      if (XS.whyNot(s, iid) !== null) continue;
      if (XS.CARDS[s.cards[iid].id].tactics === 'equipment') for (const target of mine) out.push({ type: 'play', iid, target });
      else out.push({ type: 'play', iid });
    }
    out.push({ type: 'endTurn' });
    return out;
  };

  XS.actionsFor = function (s, iid) {
    return XS.legalActions(s).filter((a) => a.iid === iid || a.attacker === iid || a.target === iid
      || (a.ids !== undefined && a.ids.includes(iid)) || (a.alloc !== undefined && a.alloc[iid] !== undefined));
  };

  // ---- apply -------------------------------------------------------------------------------------------------------
  function answer(t, a) {
    const p = t.pending;
    const bad = (m) => { throw new Illegal(`${m} (pending ${p.kind}: ${p.prompt})`); };
    let value;
    switch (p.kind) {
      case 'chooseFirst':
        if (a.type !== 'chooseFirst' || (a.first !== 0 && a.first !== 1)) bad('answer with chooseFirst {first: 0|1}');
        value = a.first;
        break;
      case 'pickTactics':
        if (a.type !== 'pickTactics' || !p.options.includes(a.iid)) bad('pick one of the offered tactics cards');
        value = a.iid;
        break;
      case 'choose': {
        if (a.type !== 'choose' || !Array.isArray(a.ids)) bad('answer with choose {ids}');
        if (a.ids.length < p.min || a.ids.length > p.max) bad(`choose between ${p.min} and ${p.max}`);
        if (new Set(a.ids).size !== a.ids.length) bad('no repeats');
        for (const i of a.ids) if (!p.options.includes(i)) bad('not an option: ' + i);
        if (p.limit !== undefined && !XS.limitOk(p.limit, a.ids.map((i) => t.cards[i].id))) bad('that pick breaks the limit ' + JSON.stringify(p.limit));
        value = a.ids.slice();
        break;
      }
      case 'attackPair':
        if (a.type !== 'attack' || !p.attackers.includes(a.attacker) || !p.targets.includes(a.target)) bad('answer with attack {attacker, target} from the offered leaders');
        value = { attacker: a.attacker, target: a.target };
        break;
      case 'distribute': {
        if (a.type !== 'distribute' || a.alloc === null || typeof a.alloc !== 'object') bad('answer with distribute {alloc}');
        let sum = 0;
        const alloc = {};
        for (const k of Object.keys(a.alloc)) {
          const v = a.alloc[k];
          if (!p.options.includes(k) || !Number.isInteger(v) || v < 0 || v % p.unit !== 0) bad('bad allocation entry ' + k);
          alloc[k] = v; sum += v;
        }
        if (sum !== p.total) bad(`the allocation must total ${p.total}`);
        value = alloc;
        break;
      }
      default: throw new Error('unknown pending kind ' + p.kind);
    }
    const top = t.stack[t.stack.length - 1];
    top.ans.push(value);
    t.pending = null;
  }

  function play(t, a) {
    const why = XS.whyNot(t, a.iid);
    if (why !== null) throw new Illegal(why);
    const seat = t.active, P = t.players[seat];
    const card = t.cards[a.iid];
    const d = XS.CARDS[card.id];
    const mine = XS.aliveLeaders(t, seat), theirs = XS.attackTargets(t, seat);
    let pre = null, host = null;
    if (d.type === 'attack') {
      // R-061: the attacker/target ride on the play action unless the card has a 【プレイ時】, which resolves first
      if (hasOnPlay(card.id)) { if (a.attacker !== undefined || a.target !== undefined) throw new Illegal('this attack card asks for its attacker after 【プレイ時】'); }
      else {
        if (!mine.includes(a.attacker)) throw new Illegal('attacker must be one of your leaders that is not down');
        if (!theirs.includes(a.target)) throw new Illegal('target must be an opposing leader that is not down');
        pre = { attacker: a.attacker, target: a.target };
      }
    } else if (d.tactics === 'equipment') {
      if (!mine.includes(a.target)) throw new Illegal('equip target must be one of your leaders that is not down');
      host = a.target;
    }
    const cost = XS.costToPlay(t, a.iid);
    D.payPP(t, seat, cost, a.iid);
    // Cards that effects play for free are queued and resolve once everything this play does has finished (R-027, FAQ #70).
    t.stack.push({ k: 'freeQueue', ai: 0, ans: [] });
    if (d.type === 'tactics') {
      P.tacPlayed = true;
      XS.log(t, seat, 'tacticsPlay', { iid: a.iid, cardId: card.id, subtype: d.tactics, cost });
      if (d.tactics === 'equipment') {
        D.moveZone(t, a.iid, { seat, zone: 'equip', leader: host });   // PM p.10: attached, never in the play area (FAQ #74)
        XS.log(t, seat, 'equip', { iid: a.iid, cardId: card.id, leader: host, seat, slot: XS.leaderSlot(host) });
        XS.pushOps(t, XS.opsFor(card.id, 'onPlay'), a.iid, seat, 'onPlay');   // R-039
      } else {
        D.moveZone(t, a.iid, { seat, zone: 'play' });
        XS.resolvePlayed(t, seat, a.iid);
      }
    } else {
      D.moveZone(t, a.iid, { seat, zone: 'play' });
      XS.log(t, seat, 'play', { iid: a.iid, cardId: card.id, type: d.type, cost });
      if (d.type === 'attack') XS.startAttackCard(t, seat, a.iid, pre);
      else XS.resolvePlayed(t, seat, a.iid);
    }
  }

  XS.apply = function (s, action) {
    if (action === null || typeof action !== 'object' || typeof action.type !== 'string') throw new Illegal('an action is an object with a type');
    if (s.phase === 'over') throw new Illegal('the match is over');
    const t = XS.normalize(XS.cloneState(s));
    if (action.type === 'concede') {   // R-060: whole match, either seat, any time
      if (action.seat !== 0 && action.seat !== 1) throw new Illegal('concede needs a seat');
      t.actions.push(XS.deepFreeze(JSON.parse(JSON.stringify(action))));
      XS.endMatch(t, 1 - action.seat, 'concede', [action.seat]);
      return t;
    }
    if (t.pending !== null) answer(t, action);
    else if (t.phase !== 'main' || t.stack.length > 0) throw new Illegal('no action is possible now');
    else if (action.type === 'endTurn') t.stack.push({ k: 'endPhase', ai: 0, ans: [], seat: t.active, step: 'trash' });
    else if (action.type === 'play') play(t, action);
    else throw new Illegal('not a main-phase action: ' + action.type);
    t.actions.push(XS.deepFreeze(JSON.parse(JSON.stringify(action))));
    XS.settle(t);
    return t;
  };

  XS.replay = function (init, actions) {
    let s = XS.newGame(init);
    for (const a of actions) s = XS.apply(s, a);
    return s;
  };

  // ---- view (hidden information) -----------------------------------------------------------------------------------------
  const HIDDEN = Object.freeze({ hidden: true });
  // pending purposes whose options are cards only the chooser may see (hand cards, cards looked at on a deck)
  const HIDDEN_OPTIONS = new Set(['discard', 'handLimit', 'look', 'reveal', 'freePlay']);
  const hiddenArr = (n) => Array.from({ length: n }, () => HIDDEN);

  XS.view = function (s, seat) {
    const vis = {};                       // card registry entries the viewer may see
    const show = (iid) => { vis[iid] = s.cards[iid]; return iid; };
    const players = s.players.map((P, p) => {
      const own = p === seat;
      for (const L of P.leaders) { show(L.iid); for (const e of L.equipment) show(e); }
      for (const i of P.play) show(i);
      for (const i of P.aside) show(i);
      const faceUp = (i) => s.cards[i].kind === 'tactics';
      const sideways = P.sideways === undefined ? [] : P.sideways.slice();   // Echo cards lying sideways (absent in a state the AI rebuilt)
      return {
        name: P.name, deckId: P.deckId, deckName: P.deckName,
        deck: hiddenArr(P.deck.length),
        hand: own ? P.hand.map(show) : hiddenArr(P.hand.length),
        play: P.play.slice(),
        trash: P.trash.map((i) => (faceUp(i) ? show(i) : HIDDEN)),
        tdeck: own ? P.tdeck.map(show) : hiddenArr(P.tdeck.length),
        tarea: P.tarea.map((i) => (own || s.cards[i].ticket === true ? show(i) : HIDDEN)),
        aside: P.aside.slice(),
        pp: { total: P.pp.total, untapped: P.pp.untapped },
        leaders: P.leaders.map((L) => ({ iid: L.iid, cardId: L.cardId, slot: L.slot, damage: L.damage, down: L.down, awakened: L.awakened, equipment: L.equipment.slice() })),
        boosts: P.boosts.slice(),
        sideways,
        tacPlayed: P.tacPlayed,
        // public turn state that ATK / cost / condition numbers read (XS.leaderStats, XS.costParts, XS.cond): face-up effects, no card ids
        buffs: P.buffs === undefined ? [] : P.buffs.map((b) => Object.assign({}, b)),
        discards: P.discards === undefined ? 0 : P.discards,
        counts: { deck: P.deck.length, hand: P.hand.length, trash: P.trash.length, tdeck: P.tdeck.length, tarea: P.tarea.length },
      };
    });
    let pending = null;
    if (s.pending !== null) {
      pending = Object.assign({}, s.pending);
      pending.options = s.pending.options.slice();
      if (s.pending.seat !== seat && (s.pending.kind === 'pickTactics' || HIDDEN_OPTIONS.has(s.pending.purpose))) pending.options = [];
      // the player who chooses among cards may see them, also cards they only looked at on a deck (purpose 'look')
      if (s.pending.seat === seat) for (const i of s.pending.options) if (typeof i === 'string' && s.cards[i] !== undefined && !XS.isLeader(i)) show(i);
    }
    const log = s.log.map((e) => {
      if (e.seat === seat) return e;
      if (e.type === 'tacticsPick') return Object.freeze(Object.assign({}, e, { data: HIDDEN }));
      if (e.type === 'look' && e.data.revealed !== true) return Object.freeze(Object.assign({}, e, { data: Object.freeze({ phase: e.data.phase, from: e.data.from, side: e.data.side, n: e.data.n, revealed: false, hidden: true }) }));
      if (e.type === 'draw') return Object.freeze(Object.assign({}, e, { data: Object.freeze({ cause: e.data.cause, hidden: true }) }));
      if (e.type === 'discard') return Object.freeze(Object.assign({}, e, { data: Object.freeze({ n: e.data.n, cause: e.data.cause, hidden: true }) }));
      return e;
    });
    return {
      viewer: seat, mode: s.mode, phase: s.phase, round: s.round, needWins: s.needWins, wins: s.wins.slice(),
      first: s.first, active: s.active, turn: s.turn, roundTurn: s.roundTurn, roundLoser: s.roundLoser,
      result: s.result === null ? null : { winner: s.result.winner, losers: s.result.losers.slice(), reason: s.result.reason }, winner: s.winner,
      players, cards: vis, pending,
      once: s.once === undefined ? {} : Object.assign({}, s.once),   // equipment-granted once-per-turn effects used up, by '<equipment iid>|<n>' -> turn (the equipment is face up)
      lastLoser: s.lastLoser === undefined ? null : s.lastLoser,
      atk: s.atk === null ? null : Object.assign({}, s.atk),
      log, seq: s.seq,
    };
  };
})();
