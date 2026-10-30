// The attack sequence, exactly as PM p.12 / docs/rules.md §9.2, as a resolution frame ('attackCard') on the stack:
//   1 【プレイ時】  2 【アタックする】 (2-1 choose attacker + attacked leader; 2-2 the effects written right of 【アタックする】 in printed
//   order, "ダメージ+" among them (FAQ #8, #20); damage value = ATK + boosts + the card's "damage +"; 2-3 give the damage)
//   3 【アタック後】 in the turn player's order, one at a time (FAQ #121)  4 awaken the attacker once if >= 1 opposing leader went down
//   and it is not awake (R-003, FAQ #19).
// A card with several 【アタックする】 repeats 2-4 per attack; boosts and their 【アタック後】 belong to the first attack only
// (FAQ #81, #82, R-025). When every opposing leader is already down a remaining attack is not performed (FAQ #76).
(function () {
  'use strict';
  const XS = globalThis.XS;
  const D = XS.doors;

  // The ops of attack number `seg` of a card: all of them (XS.attackStepOps) or without "damage +" (XS.attackOps, which is what a
  // preview or an AI reads as "what else does it do").
  const stepCache = new WeakMap();
  const effectOf = (cardId, seg) => { const effs = XS.attackEffects(cardId); return effs[Math.min(seg, effs.length - 1)]; };
  function stepOps(cardId, seg) {
    const e = effectOf(cardId, seg);
    let r = stepCache.get(e);
    if (r === undefined) { r = { all: Object.freeze(e.ops.slice()), rest: Object.freeze(e.ops.filter((o) => o.op !== 'dmgPlus')) }; stepCache.set(e, r); }
    return r;
  }
  XS.attackStepOps = (cardId, seg) => stepOps(cardId, seg).all;
  XS.attackOps = (cardId, seg) => stepOps(cardId, seg).rest;

  // The boosts' share of the damage (PM p.09; conditions are checked now, R-051): { boost, boosts: [{iid, amount}] }.
  XS.boostParts = function (s, seat, boostIids) {
    const x = { s, seat };
    const boosts = [];
    let boost = 0;
    for (const b of boostIids) {
      let n = 0;
      for (const op of XS.opsFor(s.cards[b].id, 'boost')) if (op.op === 'dmgPlus' && (op.if === undefined || XS.cond(op.if, x))) n += XS.val(op.n, x);
      boosts.push({ iid: b, amount: n });
      boost += n;
    }
    return { boost, boosts };
  };

  // Damage value by READING the data (PM p.12): ATK + every armed boost + the card's own "damage +" whose conditions hold now; never
  // below 0 (R-016). Pure: this is the preview (previewAttack). The attack itself adds the card's "damage +" op by op as the printed
  // order reaches it, so a bonus that depends on a choice ("そうしたなら") or on an earlier draw is only known then.
  XS.damageParts = function (s, seat, attacker, card, seg, boostIids) {
    const x = { s, seat, attacker, src: card };
    const atk = XS.leaderStatsOf(s, attacker).atk;
    const bp = XS.boostParts(s, seat, boostIids);
    let cardPlus = 0;
    for (const op of effectOf(s.cards[card].id, seg).ops) if (op.op === 'dmgPlus' && (op.if === undefined || XS.cond(op.if, x))) cardPlus += XS.val(op.n, x);
    return { atk, boost: bp.boost, boosts: bp.boosts, card: cardPlus, total: Math.max(0, atk + bp.boost + cardPlus) };
  };

  // Begin resolving a played attack card. `pre` = the attacker/target chosen with the play action, or null.
  XS.startAttackCard = function (s, seat, iid, pre) {
    s.atk = { id: ++s.atkSeq, seat, card: iid, seg: 0, attacker: null, target: null, downs: 0, excess: 0, dealt: 0, remain: 0, plus: 0, afterOpen: false, afterDealt: 0, closed: false };
    s.stack.push({ k: 'attackCard', ai: 0, ans: [], src: iid, seat, step: 'onPlay', seg: 0, nSegs: XS.attackEffects(s.cards[iid].id).length, pre, pool: [], boostSrc: [], announced: false, total: 0 });
  };

  // The attack line of the log: written when the damage value is final.
  function announce(s, f, a, parts) {
    for (const b of parts.boosts) XS.log(s, f.seat, 'boost', { iid: b.iid, cardId: s.cards[b.iid].id, phase: 'applied', amount: b.amount });
    XS.log(s, f.seat, 'attack', { attackId: a.id, seg: f.seg, card: f.src, attacker: a.attacker, target: a.target, damage: parts.total, parts: { atk: parts.atk, boost: parts.boost, card: parts.card } });
  }

  XS.STEP.attackCard = function (s, f) {
    const a = s.atk;
    const cid = s.cards[f.src].id;
    switch (f.step) {
      case 'onPlay':   // 1: 【プレイ時】 (a down here counts for the awakening, R-007)
        f.step = 'choose';
        XS.pushOps(s, XS.opsFor(cid, 'onPlay'), f.src, f.seat, 'onPlay');
        return;

      case 'choose': { // 2-1: attacker and attacked leader (FAQ #20, #27)
        const ownAlive = XS.aliveLeaders(s, f.seat), oppAlive = XS.attackTargets(s, f.seat);
        if (oppAlive.length === 0 || ownAlive.length === 0) { f.step = 'finish'; return; }   // FAQ #76
        const pre = f.pre;
        const pair = (pre !== null && ownAlive.includes(pre.attacker) && oppAlive.includes(pre.target)) ? pre
          : D.ask(s, f, { kind: 'attackPair', seat: f.seat, purpose: 'attack', attackers: ownAlive, targets: oppAlive, card: f.src, options: [], prompt: 'Choose your attacker and the leader it attacks.' });
        f.pre = null;
        a.attacker = pair.attacker; a.target = pair.target; a.seg = f.seg;
        a.excess = 0; a.dealt = 0; a.plus = 0; a.afterOpen = false; a.afterDealt = 0;
        a.remain = XS.leaderStatsOf(s, a.target).remaining;   // FAQ #44: the remaining HP before the attack is what overkill measures
        f.announced = false;
        f.step = 'effects';
        return;
      }

      case 'effects': { // 2-2: the effects right of 【アタックする】, in printed order, BEFORE the damage (PM p.12, FAQ #8, #20, #132)
        const P = s.players[f.seat];
        f.boostSrc = f.seg === 0 ? P.boosts.splice(0) : [];   // PM p.09: a boost applies to the next attack only; FAQ #82: first attack only
        const all = XS.attackStepOps(cid, f.seg);
        // When nothing in the card can change the number (only "damage +" and the down), the damage value is final right now and the
        // attack line is written first, as the players expect; otherwise it is written when the effects are done.
        if (all.every((o) => o.op === 'dmgPlus' || o.op === 'downAttacked')) {
          const parts = XS.damageParts(s, f.seat, a.attacker, f.src, f.seg, f.boostSrc);
          announce(s, f, a, parts);
          f.announced = true;
          f.total = parts.total;
          f.step = 'damage';
          XS.pushOps(s, XS.attackOps(cid, f.seg), f.src, f.seat, 'attack');   // e.g. the attacked leader goes down (R-026)
        } else {
          f.step = 'damage';
          XS.pushOps(s, all, f.src, f.seat, 'attack');
        }
        return;
      }

      case 'damage': { // 2-3: give the damage (a leader that is already down takes none, PM p.08)
        let total = f.total;
        if (!f.announced) {
          const bp = XS.boostParts(s, f.seat, f.boostSrc);
          const atk = XS.leaderStatsOf(s, a.attacker).atk;
          total = Math.max(0, atk + bp.boost + a.plus);
          announce(s, f, a, { atk, boost: bp.boost, boosts: bp.boosts, card: a.plus, total });
        }
        D.dealDamage(s, a.target, total, 'attack');
        f.step = 'afterPool';
        return;
      }

      case 'afterPool': { // 3: collect the 【アタック後】 effects of this attack (FAQ #36: only the attack they belong to)
        f.pool = [];
        const own = XS.opsFor(cid, 'afterAttack');
        if (own.length) f.pool.push({ src: f.src, ops: own });
        for (const b of f.boostSrc) {
          const ops = XS.opsFor(s.cards[b].id, 'afterAttack');
          if (ops.length) f.pool.push({ src: b, ops });
        }
        // Equipment on the attacker grants 【アタック後】 abilities (R-028); "ターンに1回しか発動しない" is per equipment card (R-029)
        for (const e of XS.leader(s, a.attacker).equipment) {
          XS.opsFor(s.cards[e].id, 'static').filter((o) => o.op === 'grant' && o.timing === 'afterAttack').forEach((g, k) => {
            const key = `${e}|${k}`;
            if (g.oncePerTurn === true && s.once[key] === s.turn) return;
            f.pool.push({ src: e, ops: g.ops, onceKey: g.oncePerTurn === true ? key : undefined });
          });
        }
        a.afterOpen = true;
        f.step = 'after';
        return;
      }

      case 'after': { // 3: the turn player orders them, one at a time (FAQ #2, #121); conditions are read at resolution
        if (f.pool.length === 0) { f.step = 'awaken'; return; }
        let item = f.pool[0];   // R-055: a lone effect is not an ordering choice
        if (f.pool.length > 1) {
          const [id] = D.ask(s, f, { kind: 'choose', seat: f.seat, purpose: 'order', options: f.pool.map((p) => p.src), min: 1, max: 1, prompt: 'Choose which After Attack effect resolves next.' });
          item = f.pool.find((p) => p.src === id);
        }
        f.pool = f.pool.filter((p) => p !== item);
        XS.pushOps(s, item.ops, item.src, f.seat, 'afterAttack', item.onceKey === undefined ? undefined : { onceKey: item.onceKey });
        return;
      }

      case 'awaken': { // 4: after every 【アタック後】 (FAQ #19); once per attack (R-003)
        const L = XS.leader(s, a.attacker);
        const wake = a.downs >= 1 && !L.awakened && !L.down;
        a.closed = true;   // downs from the 【覚醒時】 effect do not awaken anyone (R-006)
        a.afterOpen = false;
        if (wake) {
          D.awaken(s, a.attacker, 'attack');
          XS.pushOps(s, XS.opsFor(L.cardId, 'onAwaken'), a.attacker, f.seat, 'onAwaken');
        }
        f.step = 'nextSeg';
        return;
      }

      case 'nextSeg':
        f.seg++;
        f.boostSrc = [];
        if (f.seg < f.nSegs) { a.downs = 0; a.closed = false; a.attacker = null; a.target = null; f.step = 'choose'; }
        else f.step = 'finish';
        return;

      case 'finish':
        s.stack.pop();
        s.atk = null;
        return;

      default: throw new Error('attackCard: bad step ' + f.step);
    }
  };
})();
