// The attack sequence, exactly as PM p.12 / docs/rules.md §9.2, as a resolution frame ('attackCard') on the stack:
//   1 【プレイ時】  2 【アタックする】 (choose attacker + attacked leader; damage value = boosts + card "damage +" + ATK;
//   give the damage; the effects written right of 【アタックする】)  3 【アタック後】 in the turn player's order, one at a
//   time (FAQ #121)  4 awaken the attacker once if >= 1 opposing leader went down and it is not awake (R-003, FAQ #19).
// A card with several 【アタックする】 repeats 2-4 per attack; boosts and their 【アタック後】 belong to the first attack only
// (FAQ #81, #82, R-025). When every opposing leader is already down a remaining attack is not performed (FAQ #76).
(function () {
  'use strict';
  const XS = globalThis.XS;
  const D = XS.doors;

  // The effect ops of attack number `seg` of a card, minus "damage +" (that is part of the damage value).
  const atkOpsCache = {};
  XS.attackOps = function (cardId, seg) {
    const effs = XS.attackEffects(cardId);
    const e = effs[Math.min(seg, effs.length - 1)];
    const k = cardId + '|' + seg;
    let r = atkOpsCache[k];
    if (r === undefined) { r = Object.freeze(e.ops.filter((o) => o.op !== 'dmgPlus')); atkOpsCache[k] = r; }
    return r;
  };

  // Damage value (PM p.12): ATK + every armed boost + the card's own "damage +"; never below 0 (R-016); conditions are
  // checked now (R-051). Pure: used by the attack and by previewAttack.
  XS.damageParts = function (s, seat, attacker, card, seg, boostIids) {
    const x = { s, seat };
    const atk = XS.leaderStatsOf(s, attacker).atk;
    const boosts = [];
    let boost = 0;
    for (const b of boostIids) {
      let n = 0;
      for (const op of XS.opsFor(s.cards[b].id, 'boost')) if (op.op === 'dmgPlus' && (op.if === undefined || XS.cond(op.if, x))) n += XS.val(op.n, x);
      boosts.push({ iid: b, amount: n });
      boost += n;
    }
    let cardPlus = 0;
    const effs = XS.attackEffects(s.cards[card].id);
    for (const op of effs[Math.min(seg, effs.length - 1)].ops) if (op.op === 'dmgPlus' && (op.if === undefined || XS.cond(op.if, x))) cardPlus += XS.val(op.n, x);
    return { atk, boost, boosts, card: cardPlus, total: Math.max(0, atk + boost + cardPlus) };
  };

  // Begin resolving a played attack card. `pre` = the attacker/target chosen with the play action, or null.
  XS.startAttackCard = function (s, seat, iid, pre) {
    s.atk = { id: ++s.atkSeq, seat, card: iid, seg: 0, attacker: null, target: null, downs: 0, excess: 0, closed: false };
    s.stack.push({ k: 'attackCard', ai: 0, ans: [], src: iid, seat, step: 'onPlay', seg: 0, nSegs: XS.attackEffects(s.cards[iid].id).length, pre, pool: [], boostSrc: [] });
  };

  XS.STEP.attackCard = function (s, f) {
    const a = s.atk;
    const cid = s.cards[f.src].id;
    switch (f.step) {
      case 'onPlay':   // 1: 【プレイ時】 (a down here counts for the awakening, R-007)
        f.step = 'choose';
        XS.pushOps(s, XS.opsFor(cid, 'onPlay'), f.src, f.seat, 'onPlay');
        return;

      case 'choose': { // 2.1: attacker and attacked leader (FAQ #20, #27)
        const ownAlive = XS.aliveLeaders(s, f.seat), oppAlive = XS.aliveLeaders(s, 1 - f.seat);
        if (oppAlive.length === 0 || ownAlive.length === 0) { f.step = 'finish'; return; }   // FAQ #76
        const pre = f.pre;
        const pair = (pre !== null && ownAlive.includes(pre.attacker) && oppAlive.includes(pre.target)) ? pre
          : D.ask(s, f, { kind: 'attackPair', seat: f.seat, purpose: 'attack', attackers: ownAlive, targets: oppAlive, card: f.src, options: [], prompt: 'Choose your attacker and the leader it attacks.' });
        f.pre = null;
        a.attacker = pair.attacker; a.target = pair.target; a.seg = f.seg; a.excess = 0;
        f.step = 'resolve';
        return;
      }

      case 'resolve': { // 2.2 - 2.3 and the effects right of 【アタックする】
        const P = s.players[f.seat];
        const boosts = f.seg === 0 ? P.boosts.splice(0) : [];   // PM p.09: a boost applies to the next attack only; FAQ #82: first attack only
        const parts = XS.damageParts(s, f.seat, a.attacker, f.src, f.seg, boosts);
        for (const b of parts.boosts) XS.log(s, f.seat, 'boost', { iid: b.iid, cardId: s.cards[b.iid].id, phase: 'applied', amount: b.amount });
        XS.log(s, f.seat, 'attack', { attackId: a.id, seg: f.seg, card: f.src, attacker: a.attacker, target: a.target, damage: parts.total, parts: { atk: parts.atk, boost: parts.boost, card: parts.card } });
        const r = D.dealDamage(s, a.target, parts.total, 'attack');
        a.excess = r.excess;
        f.boostSrc = boosts;
        f.step = 'afterPool';
        XS.pushOps(s, XS.attackOps(cid, f.seg), f.src, f.seat, 'attack');   // e.g. the attacked leader goes down (R-026)
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
        XS.pushOps(s, item.ops, item.src, f.seat, 'afterAttack');
        return;
      }

      case 'awaken': { // 4: after every 【アタック後】 (FAQ #19); once per attack (R-003)
        const L = XS.leader(s, a.attacker);
        const wake = a.downs >= 1 && !L.awakened && !L.down;
        a.closed = true;   // downs from the 【覚醒時】 effect do not awaken anyone (R-006)
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
