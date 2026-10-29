// The effect runtime: card effects are DATA (data/abilities.js) run by a small interpreter. An effect group is a list of
// ops executed top to bottom (PM p.07, FAQ #126) inside an 'ops' frame on the resolution stack, so a choice can park
// in the middle and resume (docs/ABILITIES.md). All state changes go through the doors (js/engine/doors.js).
(function () {
  'use strict';
  const XS = globalThis.XS;
  const D = XS.doors;

  XS.TIMINGS = ['onPlay', 'attack', 'afterAttack', 'boost', 'onAwaken', 'round', 'static'];

  // ---- reading the data -------------------------------------------------------------------------
  const opsCache = {};
  // All ops of the card's effects with this timing, in printed order (concatenated).
  XS.opsFor = function (cardId, timing) {
    const k = cardId + '|' + timing;
    let r = opsCache[k];
    if (r === undefined) {
      const a = XS.ABIL[cardId];
      r = [];
      if (a !== undefined) for (const e of a.effects) if (e.timing === timing) r.push(...e.ops);
      opsCache[k] = Object.freeze(r);
    }
    return r;
  };
  XS.hasTiming = function (cardId, timing) {
    const a = XS.ABIL[cardId];
    return a !== undefined && a.effects.some((e) => e.timing === timing);
  };
  // The 【アタックする】 effects of an attack card, one per attack (a card with several has several, R-025).
  XS.attackEffects = (cardId) => XS.ABIL[cardId].effects.filter((e) => e.timing === 'attack');
  const modCache = {};
  XS.staticMods = function (cardId) {
    let r = modCache[cardId];
    if (r === undefined) { r = XS.opsFor(cardId, 'static').filter((o) => o.op === 'statMod'); modCache[cardId] = r; }
    return r;
  };

  // ---- values and conditions (x = { s, seat }) -----------------------------------------------------
  XS.val = function (v, x) {
    if (typeof v === 'number') return v;
    if (v !== null && typeof v === 'object' && v.perOwnTag !== undefined) {
      // "自分の「X」を持つリーダー1体につき N": downed leaders count (FAQ #10, R-031).
      let c = 0;
      for (const L of x.s.players[x.seat].leaders) if (XS.hasTag(L.cardId, v.perOwnTag.tag)) c++;
      return c * v.perOwnTag.each;
    }
    throw new Error('bad value ' + JSON.stringify(v));
  };

  const COND = {
    // このアタックを受けたリーダーがダウンしているなら: the attacked leader is down when the effect resolves, however it
    // went down (FAQ #115); a different leader going down does not count (FAQ #18, #123). See R-053.
    attackedDown: (c, x) => x.s.atk !== null && x.s.atk.target !== null && XS.leader(x.s, x.s.atk.target).down,
    // 自分の手札がN枚以下なら: checked when the effect resolves, so ordering matters (FAQ #2).
    handAtMost: (c, x) => x.s.players[x.seat].hand.length <= c.n,
    // プレイエリアにメモリアカードがN枚以上あるなら: own play area, the card itself counts (FAQ #43, #67, R-022).
    memoriaAtLeast: (c, x) => x.s.players[x.seat].play.filter((i) => x.s.cards[i].kind === 'memoria').length >= c.n,
    // 自分のリーダーがN体ダウンしているなら
    ownDownAtLeast: (c, x) => x.s.players[x.seat].leaders.filter((L) => L.down).length >= c.n,
    // 自分のリーダーすべてが「X」を持つなら: downed leaders count (FAQ #10).
    allOwnTag: (c, x) => x.s.players[x.seat].leaders.every((L) => XS.hasTag(L.cardId, c.tag)),
  };
  XS.COND = COND;
  XS.cond = function (c, x) {
    const f = COND[c.c];
    if (f === undefined) throw new Error('unknown condition ' + c.c);
    return f(c, x);
  };

  // ---- targeting -------------------------------------------------------------------------------------
  // Legal targets for an effect: leaders that are not down (R-002, FAQ #22); "other" excludes the leader that received the
  // current attack (R-023, FAQ #21).
  function candidates(x, to) {
    let c = XS.aliveLeaders(x.s, to.side === 'own' ? x.seat : 1 - x.seat);
    if (to.other === true && x.s.atk !== null) c = c.filter((i) => i !== x.s.atk.target);
    return c;
  }
  function fizzle(x, reason) {
    XS.log(x.s, x.seat, 'fizzle', { src: x.src, cardId: x.src === null ? null : x.s.cards[x.src].id, reason });
  }
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  // ---- ops -----------------------------------------------------------------------------------------------
  const OPS = (XS.OPS = {});
  // Every op: (x, op) with x = { s, f, seat, src }. Asks first, then changes (the step re-runs after an answer).

  // Damage +N is part of the damage value (PM p.12) and is summed by attack.js before damage; nothing to run.
  OPS.dmgPlus = () => {};
  OPS.statMod = () => {};       // static: read by XS.leaderStats
  OPS.ticketRule = () => {};    // static: read by flow.js round setup (PM p.05, FAQ #37)

  // 対戦相手のリーダー1体/すべてにNダメージ. count 1 = the player chooses (never auto-picked), 'all' = every candidate.
  OPS.damage = function (x, op) {
    const n = XS.val(op.n, x);
    if (n <= 0) return;   // R-062: 0 damage does nothing and asks nothing
    const c = candidates(x, op.to);
    if (c.length === 0) return fizzle(x, 'noTarget');
    let targets = c;
    if (op.to.count !== 'all') {
      const who = op.to.other ? 'another opposing leader' : 'an opposing leader';
      targets = D.ask(x.s, x.f, { kind: 'choose', seat: x.seat, purpose: 'target', options: c, min: 1, max: 1, prompt: `Choose ${who} to take ${n} damage.` });
    }
    for (const t of targets) D.dealDamage(x.s, t, n, 'effect');
  };

  // 自分のリーダー1体をN回復する. A non-downed own leader must be chosen even if undamaged; no declining (FAQ #133, R-054).
  OPS.heal = function (x, op) {
    const c = candidates(x, op.to);
    if (c.length === 0) return fizzle(x, 'noTarget');
    const [t] = D.ask(x.s, x.f, { kind: 'choose', seat: x.seat, purpose: 'heal', options: c, min: 1, max: 1, prompt: `Choose one of your leaders to heal ${op.n}.` });
    D.heal(x.s, t, op.n);
  };

  // 自分のリーダーを合計N回復する: the player splits N among their leaders in steps of `unit` (damage counters are 10s), R-057.
  OPS.healTotal = function (x, op) {
    const c = candidates(x, { side: 'own' });
    if (c.length === 0) return fizzle(x, 'noTarget');
    const alloc = D.ask(x.s, x.f, { kind: 'distribute', seat: x.seat, purpose: 'distribute', options: c, total: op.n, unit: op.unit, prompt: `Split ${op.n} healing among your leaders.` });
    for (const i of c) if (alloc[i] > 0) D.heal(x.s, i, alloc[i]);
  };

  OPS.draw = (x, op) => { D.draw(x.s, x.seat, op.n, 'effect'); };

  // 手札をN枚捨てる: the hand's owner chooses (FAQ #47); with fewer cards than N all of them go, otherwise they are asked even if
  // that leaves no alternative (R-056); face down (FAQ #4, R-037).
  OPS.discard = function (x, op) {
    const hand = x.s.players[x.seat].hand;
    if (hand.length === 0) return fizzle(x, 'emptyHand');
    if (hand.length < op.n) return D.discard(x.s, x.seat, hand.slice(), 'effect');
    const ids = D.ask(x.s, x.f, { kind: 'choose', seat: x.seat, purpose: 'discard', options: hand.slice(), min: op.n, max: op.n, prompt: `Choose ${plural(op.n, 'card')} from your hand to discard.` });
    D.discard(x.s, x.seat, ids, 'effect');
  };

  OPS.recoverPP = (x, op) => { D.recoverPP(x.s, x.seat, op.n, 'effect'); };

  // このアタックを受けたリーダーはダウンする (R-026): a down by the attack, so the attacker awakens; no overkill excess.
  OPS.downAttacked = function (x) {
    if (x.s.atk !== null && x.s.atk.target !== null) D.downLeader(x.s, x.s.atk.target, 'effect');
  };

  // ---- the 'ops' frame ---------------------------------------------------------------------------------------
  XS.STEP = {};
  XS.STEP.ops = function (s, f) {
    if (f.pc >= f.ops.length) { s.stack.pop(); return; }
    const op = f.ops[f.pc];
    if (op.unimplemented !== undefined) throw new Error('unimplemented op reached the engine: ' + op.unimplemented);
    const x = { s, f, seat: f.seat, src: f.src };
    if (op.if === undefined || XS.cond(op.if, x)) {
      const fn = OPS[op.op];
      if (fn === undefined) throw new Error('unknown op ' + op.op);
      fn(x, op);
    }
    f.pc++;
    f.ans = [];
  };

  // Push an effect group (a card's ops of one timing) onto the resolution stack. It runs next, top to bottom.
  XS.pushOps = function (s, ops, src, seat, timing) {
    if (ops.length === 0) return;
    XS.log(s, seat, 'ability', { src, cardId: s.cards[src].id, timing }, src);
    s.stack.push({ k: 'ops', ops, pc: 0, ai: 0, ans: [], src, seat, timing });
  };
})();
