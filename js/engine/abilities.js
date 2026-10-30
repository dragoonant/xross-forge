// The effect runtime: card effects are DATA (data/abilities.js) run by a small interpreter. An effect group is a list of
// ops executed top to bottom (PM p.07, FAQ #126) inside an 'ops' frame on the resolution stack, so a choice can park
// in the middle and resume (docs/ABILITIES.md). All state changes go through the doors (js/engine/doors.js).
(function () {
  'use strict';
  const XS = globalThis.XS;
  const D = XS.doors;

  XS.TIMINGS = ['onPlay', 'attack', 'afterAttack', 'boost', 'onAwaken', 'round', 'static'];

  // ---- reading the data -------------------------------------------------------------------------
  // Caches hang off the card's effect entry (a WeakMap), so a test that redefines a card id gets fresh answers.
  const cache = new WeakMap();
  const slot = (cardId) => {
    const a = XS.ABIL[cardId];
    if (a === undefined) return null;
    let m = cache.get(a);
    if (m === undefined) { m = {}; cache.set(a, m); }
    return { a, m };
  };
  // All ops of the card's effects with this timing, in printed order (concatenated).
  XS.opsFor = function (cardId, timing) {
    const sl = slot(cardId);
    if (sl === null) return EMPTY;
    let r = sl.m[timing];
    if (r === undefined) {
      r = [];
      for (const e of sl.a.effects) if (e.timing === timing) r.push(...e.ops);
      sl.m[timing] = Object.freeze(r);
    }
    return r;
  };
  const EMPTY = Object.freeze([]);
  XS.hasTiming = function (cardId, timing) {
    const a = XS.ABIL[cardId];
    return a !== undefined && a.effects.some((e) => e.timing === timing);
  };
  // The 【アタックする】 effects of an attack card, one per attack (a card with several has several, R-025).
  XS.attackEffects = (cardId) => XS.ABIL[cardId].effects.filter((e) => e.timing === 'attack');
  // Static stat ops read by XS.leaderStats: statMod (hp / atk bonus; the older form of equipment stats, see leaderStats).
  XS.staticMods = function (cardId) {
    const sl = slot(cardId);
    if (sl === null) return EMPTY;
    let r = sl.m['#mods'];
    if (r === undefined) { r = Object.freeze(XS.opsFor(cardId, 'static').filter((o) => o.op === 'statMod')); sl.m['#mods'] = r; }
    return r;
  };
  // The opposing leaders `seat` may attack: those that are not down, but only the ones carrying a mustTarget card (ターゲットフラッグ: "対戦相手が
  // このリーダーにアタックできるなら、このリーダーにしかアタックできない") when any of them does. R-066.
  XS.attackTargets = function (s, seat) {
    const alive = XS.aliveLeaders(s, 1 - seat);
    const flagged = alive.filter((i) => XS.leader(s, i).equipment.some((e) => XS.opsFor(s.cards[e].id, 'static').some((o) => o.op === 'mustTarget')));
    return flagged.length > 0 ? flagged : alive;
  };
  XS.hasEcho = (cardId) => XS.opsFor(cardId, 'static').some((o) => o.op === 'echo');
  // 【ラウンド中】 cards stay in the play area at the end of the turn (card reminder text: ターン終了時にトラッシュに置かない).
  XS.staysInPlay = (cardId) => XS.hasTiming(cardId, 'round');

  // ---- card filters (ops that pick cards: reveal, look, free play) -----------------------------------------------------
  // filter: { type?, cost?, maxCost?, minCost?, notAce?, color?, notSameName? }  Pure on card numbers (the AI reads it from a view).
  XS.matchesFilter = function (cardId, flt, srcCardId) {
    if (flt === undefined) return true;
    const d = XS.CARDS[cardId];
    if (flt.type !== undefined && d.type !== flt.type) return false;
    const cost = d.cost || 0;
    if (flt.cost !== undefined && cost !== flt.cost) return false;
    if (flt.maxCost !== undefined && cost > flt.maxCost) return false;
    if (flt.minCost !== undefined && cost < flt.minCost) return false;
    if (flt.notAce === true && d.ace === true) return false;
    if (flt.color !== undefined && d.color !== flt.color) return false;
    if (flt.notSameName === true && srcCardId !== undefined && srcCardId !== null && d.name === XS.CARDS[srcCardId].name) return false;
    return true;
  };
  // A multi-pick against a pending decision's `limit` ({costSumAtMost?, costSumAtLeast?, perType?: {memoria: 1, attack: 1}}).
  XS.limitOk = function (limit, cardIds) {
    if (limit === undefined || limit === null) return true;
    let sum = 0;
    const per = {};
    for (const id of cardIds) { const d = XS.CARDS[id]; sum += d.cost || 0; per[d.type] = (per[d.type] || 0) + 1; }
    if (limit.costSumAtMost !== undefined && sum > limit.costSumAtMost) return false;
    if (limit.costSumAtLeast !== undefined && sum < limit.costSumAtLeast) return false;
    if (limit.perType !== undefined) for (const t of Object.keys(limit.perType)) if ((per[t] || 0) > limit.perType[t]) return false;
    return true;
  };

  // ---- values and conditions (x = { s, seat, src?, f?, attacker? }) -----------------------------------------------------
  // The cards of the seat's play area that match a counting spec { type?, cost?, other?, sameName? } ("other" = not the source card).
  function playMatches(x, spec) {
    const P = x.s.players[x.seat];
    const srcId = x.src !== undefined && x.src !== null ? x.s.cards[x.src].id : null;
    const srcName = srcId !== null ? XS.CARDS[srcId].name : null;
    return P.play.filter((i) => {
      if (spec.other === true && i === x.src) return false;
      const d = XS.CARDS[x.s.cards[i].id];
      if (spec.type !== undefined && d.type !== spec.type) return false;
      if (spec.cost !== undefined && (d.cost || 0) !== spec.cost) return false;
      if (spec.sameName === true && d.name !== srcName) return false;
      return true;
    });
  }
  const revealedOf = (x) => (x.f !== undefined && x.f.revealed !== undefined ? x.f.revealed : []);

  XS.val = function (v, x) {
    if (typeof v === 'number') return v;
    if (v !== null && typeof v === 'object') {
      if (v.perOwnTag !== undefined) {
        // "自分の「X」を持つリーダー1体につき N": downed leaders count (FAQ #10, R-031).
        let c = 0;
        for (const L of x.s.players[x.seat].leaders) if (XS.hasTag(L.cardId, v.perOwnTag.tag)) c++;
        return c * v.perOwnTag.each;
      }
      // "プレイエリアの<type>カード1枚につき N" (the card itself counts unless other:true).
      if (v.perPlay !== undefined) return playMatches(x, v.perPlay).length * v.perPlay.each;
      // "プレイエリアにある<type>カードのコストの合計と同じ数": the sum of the costs of the matching play-area cards.
      if (v.playCostSum !== undefined) return playMatches(x, v.playCostSum).reduce((n, i) => n + (XS.CARDS[x.s.cards[i].id].cost || 0), 0);
      // "公開した/捨てた<type>カード1枚につき N" and "公開したカードのコストと同じ数".
      if (v.perRevealed !== undefined) return revealedOf(x).filter((i) => v.perRevealed.type === undefined || x.s.cards[i].kind === v.perRevealed.type).length * v.perRevealed.each;
      // "このカードの効果で回復した数値と同じダメージ" (ドレインロッド): the counters the heals of this effect group actually removed (FAQ #64).
      if (v.healed === true) return x.f !== undefined && x.f.healed !== undefined ? x.f.healed : 0;
      if (v.revealedCost === true) return revealedOf(x).reduce((n, i) => n + (XS.CARDS[x.s.cards[i].id].cost || 0), 0);
    }
    throw new Error('bad value ' + JSON.stringify(v));
  };

  const attackerOf = (x) => (x.attacker !== undefined ? x.attacker : (x.s.atk !== null ? x.s.atk.attacker : null));
  const attackerLeader = (x) => { const a = attackerOf(x); return a === null || a === undefined ? null : XS.leader(x.s, a); };

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

    // プレイエリアに(他の)<type>カードがN枚以上/以下あるなら: { type?, cost?, other?, sameName?, min?, max? } (R-022: own play area).
    // "プレイエリアに他のカードがないなら" = { other: true, max: 0 }; "コスト2のカードがあるなら" = { cost: 2, min: 1 }.
    playCount: (c, x) => { const n = playMatches(x, c).length; return n >= (c.min === undefined ? 0 : c.min) && (c.max === undefined || n <= c.max); },
    // Nラウンド目なら
    roundIs: (c, x) => x.s.round === c.n,
    // 直前のラウンドであなたが負けているなら (round 1 has no previous round)
    lostLastRound: (c, x) => x.s.lastLoser === x.seat,
    // 対戦相手よりダウンしているリーダーが多いなら
    downMoreThanOpp: (c, x) => x.s.players[x.seat].leaders.filter((L) => L.down).length > x.s.players[1 - x.seat].leaders.filter((L) => L.down).length,
    // アタッカーが覚醒している / ダメージを受けている / カードを装備している / 残り体力がNなら / 色が<color>なら
    attackerAwakened: (c, x) => { const L = attackerLeader(x); return L !== null && L.awakened; },
    attackerDamaged: (c, x) => { const L = attackerLeader(x); return L !== null && L.damage > 0; },
    attackerEquipped: (c, x) => { const L = attackerLeader(x); return L !== null && L.equipment.length > 0; },
    attackerRemaining: (c, x) => { const a = attackerOf(x); return a !== null && a !== undefined && XS.leaderStatsOf(x.s, a).remaining === c.n; },
    attackerColor: (c, x) => { const L = attackerLeader(x); return L !== null && XS.CARDS[L.cardId].color === c.color; },
    // 自分のリーダーの色がすべて異なるなら
    ownColorsDiffer: (c, x) => new Set(x.s.players[x.seat].leaders.map((L) => XS.CARDS[L.cardId].color)).size === 4,
    // このターン、あなたが手札を1枚以上捨てているなら (counted by D.discard, reset at every turn start)
    discardedThisTurn: (c, x) => x.s.players[x.seat].discards >= 1,
    // 自分のトラッシュに「X」があるなら
    trashHasName: (c, x) => x.s.players[x.seat].trash.some((i) => XS.CARDS[x.s.cards[i].id].name === c.name),
    // オーバーキルN: the attacked leader took at least N more than the remaining HP it had before the attack (FAQ #44), counting
    // the damage of this attack's earlier effects, 【アタック後】 included (FAQ #115, R-005). Written as `if` on the effect's ops.
    overkill: (c, x) => x.s.atk !== null && x.s.atk.excess >= c.n,
    // そうしたなら: the optional action of an earlier op of this effect group was done (discard / reveal / free play / damage).
    did: (c, x) => x.f !== undefined && x.f.did === true,
    // 公開した/見たカードが<type>なら: any card looked at or revealed earlier in this effect group is of that type.
    seenType: (c, x) => x.f !== undefined && x.f.seen !== undefined && x.f.seen.some((i) => x.s.cards[i].kind === c.type),
    // このアタックの【アタック後】効果でダメージを与えているなら (オートタレット)
    afterDealt: (c, x) => x.s.atk !== null && x.s.atk.afterDealt > 0,
  };
  XS.COND = COND;
  XS.cond = function (c, x) {
    const f = COND[c.c];
    if (f === undefined) throw new Error('unknown condition ' + c.c);
    return f(c, x);
  };

  // ---- cost and ATK modifiers (read by XS.costToPlay and XS.leaderStats) --------------------------------------------------
  // The cost of a card now: printed cost + its own static costMod ops + the costAura ops of 【ラウンド中】 cards in either play
  // area. costFloor limits how far REDUCTIONS may go (復活ビーコン: "コストは1までしか下がらない"); the floor applies after every
  // modifier, the opponent's +1 included (FAQ #138: 電磁スモーク +1, five cards in play: 1, not 2). costFree makes it 0.
  XS.costParts = function (s, iid) {
    const c = s.cards[iid];
    const d = XS.CARDS[c.id];
    const base = d.cost || 0;
    const x = { s, seat: c.owner, src: iid };
    const mods = [];
    let floor = null, free = false;
    for (const op of XS.opsFor(c.id, 'static')) {
      if (op.op === 'costMod' && (op.if === undefined || XS.cond(op.if, x))) mods.push({ src: iid, n: XS.val(op.n, x) });
      else if (op.op === 'costFloor') floor = op.n;
      else if (op.op === 'costFree' && (op.if === undefined || XS.cond(op.if, x))) free = true;
    }
    for (const seat of [0, 1]) {
      for (const p of s.players[seat].play) {
        for (const op of XS.opsFor(s.cards[p].id, 'round')) {
          if (op.op !== 'costAura') continue;
          if ((op.who === 'opp' ? 1 - seat : seat) === c.owner && (op.cardType === undefined || op.cardType === d.type)) mods.push({ src: p, n: op.n });
        }
      }
    }
    const sum = mods.reduce((n, m) => n + m.n, 0);
    let total = base + sum;
    if (floor !== null && sum < 0) total = Math.max(total, Math.min(base, floor));
    if (free) total = 0;
    return { base, mods, total: Math.max(0, total) };
  };
  // The ATK bonus every leader of the seat has now: 【ラウンド中】 atkMod cards in its play area (パワーフィールド) and "this turn /
  // this round" buffs (先導者の証). R-043. (`buffs` is absent in a state rebuilt by the AI, see XS.normalize.)
  XS.seatAtkBonus = function (s, seat) {
    const P = s.players[seat];
    let n = 0;
    for (const i of P.play) for (const op of XS.opsFor(s.cards[i].id, 'round')) if (op.op === 'atkMod') n += op.n;
    if (P.buffs !== undefined) for (const b of P.buffs) if (b.stat === 'atk') n += b.n;
    return n;
  };

  // ---- targeting -------------------------------------------------------------------------------------
  // Legal targets for an effect: leaders that are not down (R-002, FAQ #22); "other" excludes the leader that received the
  // current attack (R-023, FAQ #21).
  function candidates(x, to) {
    let c = XS.aliveLeaders(x.s, to.side === 'own' ? x.seat : 1 - x.seat);
    if (to.other === true && x.s.atk !== null) c = c.filter((i) => i !== x.s.atk.target);
    if (to.remainingAtLeast !== undefined) c = c.filter((i) => XS.leaderStatsOf(x.s, i).remaining >= to.remainingAtLeast);   // 体力N以上 (R-067)
    return c;
  }
  function fizzle(x, reason) {
    XS.log(x.s, x.seat, 'fizzle', { src: x.src, cardId: x.src === null ? null : x.s.cards[x.src].id, reason });
  }
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const cardIdOf = (x, iid) => x.s.cards[iid].id;
  const srcCardId = (x) => (x.src === null || x.src === undefined ? null : x.s.cards[x.src].id);
  const cardIds = (x, iids) => iids.map((i) => x.s.cards[i].id);

  // ---- ops -----------------------------------------------------------------------------------------------
  const OPS = (XS.OPS = {});
  // Every op: (x, op) with x = { s, f, seat, src }. Asks first, then changes (the step re-runs after an answer).

  // Static markers: read by the engine where they matter (leaderStats, costParts, trashPlayArea, flow), never run.
  for (const k of ['statMod', 'ticketRule', 'echo', 'costMod', 'costFloor', 'costFree', 'costAura', 'atkMod', 'grant', 'playIf', 'mustTarget']) OPS[k] = () => {};

  // 【アタックする】 ダメージ+N: part of the damage value (PM p.12 2-2); conditions are read when the op's turn comes in the
  // printed order, so a draw or a discard before it changes what it sees (FAQ #8). Boost dmgPlus ops are summed by XS.boostParts.
  OPS.dmgPlus = function (x, op) {
    if (x.f.timing === 'attack') x.s.atk.plus += XS.val(op.n, x);
  };

  // 対戦相手のリーダー1体/すべてにNダメージ. count 1 = the player chooses (never auto-picked), 'all' = every candidate,
  // 'attacker' = the attacking leader (アタッカーにNダメージ; `leave: 10` = "if that would down it, its remaining HP becomes 10
  // instead", R-042). `optional` = "…ダメージを与えてもよい" (choose none to decline; sets `did`).
  OPS.damage = function (x, op) {
    const n = XS.val(op.n, x);
    if (n <= 0) return;   // R-062: 0 damage does nothing and asks nothing
    let targets;
    if (op.to.count === 'attacker') {
      const a = x.s.atk;
      targets = a !== null && a.attacker !== null && !XS.leader(x.s, a.attacker).down ? [a.attacker] : [];
      if (targets.length === 0) return fizzle(x, 'noTarget');
    } else {
      const c = candidates(x, op.to);
      if (c.length === 0) return fizzle(x, 'noTarget');
      targets = c;
      if (op.to.count !== 'all') {
        // count 1 = exactly one; a number N > 1 with upTo = 最大N体 (zero to N, ヴァリアブルピック); optional = してもよい
        const max = op.to.count === 1 ? 1 : Math.min(op.to.count, c.length);
        const min = op.optional || op.to.upTo === true ? 0 : Math.min(max, c.length);
        const who = op.to.side === 'own' ? 'one of your leaders' : op.to.other ? 'another opposing leader' : 'an opposing leader';
        targets = D.ask(x.s, x.f, { kind: 'choose', seat: x.seat, purpose: 'target', options: c, min, max,
          prompt: max === 1 ? `Choose ${who} to take ${n} damage${min === 0 ? ' (or none)' : ''}.` : `Choose up to ${max} opposing leaders to take ${n} damage each.` });
      }
    }
    for (const t of targets) D.dealDamage(x.s, t, n, 'effect', op.leave);
    if (op.optional) x.f.did = targets.length > 0;
  };

  // 自分のリーダー1体をN回復する. A non-downed own leader must be chosen even if undamaged; no declining (FAQ #133, R-054).
  OPS.heal = function (x, op) {
    const c = candidates(x, op.to);
    if (c.length === 0) return fizzle(x, 'noTarget');
    const [t] = D.ask(x.s, x.f, { kind: 'choose', seat: x.seat, purpose: 'heal', options: c, min: 1, max: 1, prompt: `Choose one of your leaders to heal ${op.n}.` });
    x.f.healed = (x.f.healed || 0) + D.heal(x.s, t, op.n);   // the amount actually removed (FAQ #64), read by {healed: true}
  };

  // 自分のリーダーを合計N回復する: the player splits N among their leaders in steps of `unit` (damage counters are 10s), R-057.
  OPS.healTotal = function (x, op) {
    const c = candidates(x, { side: 'own' });
    if (c.length === 0) return fizzle(x, 'noTarget');
    const alloc = D.ask(x.s, x.f, { kind: 'distribute', seat: x.seat, purpose: 'distribute', options: c, total: op.n, unit: op.unit, prompt: `Split ${op.n} healing among your leaders.` });
    let healed = 0;
    for (const i of c) if (alloc[i] > 0) healed += D.heal(x.s, i, alloc[i]);   // the sum of what was actually removed (FAQ #64)
    x.f.healed = (x.f.healed || 0) + healed;
  };

  // カードをN枚引く. n may be a value ({playCostSum..}, {revealedCost}).
    // `who: 'both'` = すべてのプレイヤーはカードをN枚引く: the turn player first, then the opponent (R-021).
  OPS.draw = function (x, op) {
    const n = XS.val(op.n, x);
    D.draw(x.s, x.seat, n, 'effect');
    if (op.who === 'both') D.draw(x.s, 1 - x.seat, n, 'effect');
  };

  // 手札をN枚捨てる: the hand's owner chooses (FAQ #47; `who: 'opp'` = 対戦相手は手札をN枚捨てる, the opponent chooses, R-021); with
  // fewer cards than N all of them go, otherwise they are asked even if that leaves no alternative (R-056); face down (FAQ #4,
  // R-037). `optional` = "捨ててもよい" (min 0, sets `did`); `random` = ランダムに (engine RNG, R-047; optional + random asks a
  // yes/no first, purpose 'may'); `of: 'revealed'` = discard the cards revealed earlier in this effect (CLUTCH!!!, FAQ #8).
  OPS.discard = function (x, op) {
    if (op.of === 'revealed') {
      const hand = x.s.players[x.seat].hand;
      const ids = revealedOf(x).filter((i) => hand.includes(i));
      if (ids.length > 0) D.discard(x.s, x.seat, ids, 'effect');
      return;
    }
    // すべてのプレイヤーは手札をN枚捨てる (`who: 'both'`): the turn player chooses first, then the opponent; both are asked before any card moves.
    const seats = op.who === 'opp' ? [1 - x.seat] : op.who === 'both' ? [x.seat, 1 - x.seat] : [x.seat];
    const n = op.n;
    const picks = [];
    for (const seat of seats) {
      const hand = x.s.players[seat].hand;
      const cands = op.filter === undefined ? hand.slice() : hand.filter((i) => XS.matchesFilter(cardIdOf(x, i), op.filter, srcCardId(x)));
      if (cands.length === 0) { if (op.optional) x.f.did = false; fizzle(x, 'emptyHand'); continue; }
      let ids;
      if (op.random === true) {
        if (op.optional) {
          const yes = D.ask(x.s, x.f, { kind: 'choose', seat: x.seat, purpose: 'may', options: [x.src], min: 0, max: 1, prompt: `Discard ${plural(n, 'card')} at random from your hand?` });
          if (yes.length === 0) { x.f.did = false; return; }
        }
        ids = { random: true, cands };
      } else if (op.optional) {
        ids = D.ask(x.s, x.f, { kind: 'choose', seat, purpose: 'discard', options: cands, min: 0, max: Math.min(n, cands.length), prompt: `You may discard up to ${plural(n, 'card')} from your hand.` });
      } else if (cands.length < n) ids = cands.slice();
      else ids = D.ask(x.s, x.f, { kind: 'choose', seat, purpose: 'discard', options: cands, min: n, max: n, prompt: `Choose ${plural(n, 'card')} from your hand to discard.` });
      picks.push([seat, ids]);
    }
    let did = false;
    for (const [seat, ids] of picks) {
      let chosen = ids;
      if (ids.random === true) {
        const pool = ids.cands.slice();
        chosen = [];
        for (let k = 0; k < Math.min(n, pool.length); k++) chosen.push(pool.splice(XS.rngInt(x.s, pool.length), 1)[0]);
      }
      D.discard(x.s, seat, chosen, 'effect');
      if (chosen.length > 0) did = true;
    }
    if (op.optional) x.f.did = did;
  };

  // 手札の<filter>のカード(最大)N枚を公開する(してもよい): the cards named become public (log `look` phase 'reveal'); they stay in hand
  // until a later op moves them (`discard {of: 'revealed'}`), and feed {perRevealed}, {revealedCost} and cond seenType (FAQ #8).
  OPS.reveal = function (x, op) {
    const hand = x.s.players[x.seat].hand;
    const cands = hand.filter((i) => XS.matchesFilter(cardIdOf(x, i), op.filter, srcCardId(x)));
    if (cands.length === 0) { x.f.revealed = []; x.f.did = false; return; }
    const min = op.optional ? 0 : Math.min(op.min === undefined ? 1 : op.min, cands.length);
    const ids = D.ask(x.s, x.f, { kind: 'choose', seat: x.seat, purpose: 'reveal', options: cands, min, max: Math.min(op.n, cands.length), limit: op.limit,
      prompt: `${op.optional ? 'You may reveal' : 'Reveal'} ${op.n === 1 ? 'a card' : `up to ${op.n} cards`} from your hand.` });
    x.f.revealed = ids.slice();
    x.f.seen = ids.slice();
    x.f.did = ids.length > 0;
    if (ids.length > 0) XS.log(x.s, x.seat, 'look', { phase: 'reveal', from: 'hand', side: x.seat, n: ids.length, iids: ids.slice(), cardIds: cardIds(x, ids), revealed: true });
  };

  // 自分/対戦相手のデッキの上からN枚を見る/公開する. The cards stay on the deck until a later op moves them; this effect group
  // remembers them (`f.look`). Shortfall: the deck-out procedure runs once and the look goes on (PM p.14 Q1, FAQ #109/#117/#119).
  // A look at your own deck is private (the opponent sees only the count); `reveal: true` shows the cards to both players.
  OPS.look = function (x, op) {
    const owner = op.side === 'opp' ? 1 - x.seat : x.seat;
    const iids = D.peek(x.s, owner, op.n);
    x.f.look = { owner, iids: iids.slice(), revealed: op.reveal === true };
    x.f.seen = iids.slice();
    XS.log(x.s, x.seat, 'look', { phase: op.reveal === true ? 'reveal' : 'see', from: 'deck', side: owner, n: iids.length, iids: iids.slice(), cardIds: cardIds(x, iids), revealed: op.reveal === true });
  };

  // その中からカードN枚を手札に加える / トラッシュに置いてもよい: choose among the looked cards that match `filter`. `to`: 'hand' (add
  // to your hand; `reveal: true` shows it, 公開し、手札に加える) or 'trash'. min 0 = "してもよい" (explicit decline); sets `did`.
  OPS.lookPick = function (x, op) {
    const lk = x.f.look;
    if (lk === undefined) throw new Error('lookPick without a look');
    const cands = lk.iids.filter((i) => XS.matchesFilter(cardIdOf(x, i), op.filter, srcCardId(x)));
    if (cands.length === 0) { x.f.did = false; return; }
    const min = Math.min(op.min === undefined ? 1 : op.min, cands.length);
    const max = Math.min(op.max === undefined ? 1 : op.max, cands.length);
    const ids = D.ask(x.s, x.f, { kind: 'choose', seat: x.seat, purpose: 'look', to: op.to, options: cands, min, max, limit: op.limit,
      prompt: op.to === 'trash' ? 'You may put the card you looked at into the trash.' : `Choose ${max === 1 ? 'a card' : `up to ${max} cards`} from the cards you looked at to add to your hand.` });
    if (ids.length > 0) {
      const revealed = op.reveal === true || (op.to === 'trash' && lk.revealed);
      for (const i of ids) D.takeFromDeck(x.s, lk.owner, i, op.to === 'trash' ? { seat: lk.owner, zone: 'trash' } : { seat: x.seat, zone: 'hand' });
      XS.log(x.s, x.seat, 'look', { phase: op.to === 'trash' ? 'trash' : 'take', from: 'deck', side: lk.owner, n: ids.length, iids: ids.slice(), cardIds: cardIds(x, ids), revealed });
      lk.iids = lk.iids.filter((i) => !ids.includes(i));
    }
    x.f.did = ids.length > 0;
  };

  // 残りのカードをトラッシュに置く: every looked card that is still on the deck goes to the trash of the deck's owner (face down).
  OPS.lookRest = function (x) {
    const lk = x.f.look;
    if (lk === undefined) throw new Error('lookRest without a look');
    if (lk.iids.length === 0) return;
    const ids = lk.iids.slice();
    for (const i of ids) D.takeFromDeck(x.s, lk.owner, i, { seat: lk.owner, zone: 'trash' });
    XS.log(x.s, x.seat, 'look', { phase: 'trash', from: 'deck', side: lk.owner, n: ids.length, iids: ids.slice(), cardIds: cardIds(x, ids), revealed: lk.revealed });
    lk.iids = [];
  };

  // …コストを支払わずにプレイする(してもよい): from your hand or from the cards you looked at, choose cards (in the order to play them,
  // 好きな順番で). They go to the far right of the play area now (FAQ #70) and RESOLVE after the current play has finished, left to right
  // (R-027, R-044). `limit` = {costSumAtMost, perType}; `min`/`max` = how many; sets `did`.
  OPS.freePlay = function (x, op) {
    const pool = op.from === 'look' ? (x.f.look === undefined ? [] : x.f.look.iids) : x.s.players[x.seat].hand;
    const cands = pool.filter((i) => XS.matchesFilter(cardIdOf(x, i), op.filter, srcCardId(x)));
    if (cands.length === 0) { x.f.did = false; return; }
    const min = Math.min(op.min === undefined ? 0 : op.min, cands.length);
    const ids = D.ask(x.s, x.f, { kind: 'choose', seat: x.seat, purpose: 'freePlay', options: cands, min, max: Math.min(op.max, cands.length), limit: op.limit,
      prompt: `Choose ${op.max === 1 ? 'a card' : `up to ${op.max} cards`} to play without paying its cost${op.max > 1 ? ', in the order you want them played' : ''}.` });
    for (const i of ids) {
      D.freePlace(x.s, x.seat, i);
      const d = XS.CARDS[cardIdOf(x, i)];
      XS.log(x.s, x.seat, 'freePlay', { iid: i, cardId: d.id, type: d.type, from: op.from === 'look' ? 'deck' : 'hand' });
    }
    if (x.f.look !== undefined) x.f.look.iids = x.f.look.iids.filter((i) => !ids.includes(i));
    x.f.did = ids.length > 0;
  };

  OPS.recoverPP = (x, op) => { D.recoverPP(x.s, x.seat, op.n, 'effect'); };

  // このアタックを受けたリーダーはダウンする (R-026): a down BY THE ATTACK (the attacker awakens, cause 'attack'); no overkill excess.
  OPS.downAttacked = function (x) {
    if (x.s.atk !== null && x.s.atk.target !== null) D.downLeader(x.s, x.s.atk.target, 'attack');
  };

  // 自分のリーダー1体を覚醒させる (名誉のバッジ). Not an attack: nobody else awakens (R-006).
  OPS.awaken = function (x) {
    const c = XS.aliveLeaders(x.s, x.seat).filter((i) => !XS.leader(x.s, i).awakened);
    if (c.length === 0) return fizzle(x, 'noTarget');
    const [t] = D.ask(x.s, x.f, { kind: 'choose', seat: x.seat, purpose: 'awaken', options: c, min: 1, max: 1, prompt: 'Choose one of your leaders to awaken.' });
    D.awaken(x.s, t, 'effect');
    const L = XS.leader(x.s, t);
    if (L.awakened) XS.pushOps(x.s, XS.opsFor(L.cardId, 'onAwaken'), t, x.seat, 'onAwaken');
  };

  // ダウンしている自分のリーダー1体を、ダウンしていない状態に戻す。そのリーダーが装備しているカードすべてを表向きにトラッシュに置く
  // (復活ポータル / 復活ビーコン). Targets a DOWNED leader, which the card text allows (FAQ #23, R-002); equipment goes to the trash
  // face up; awakening stays; nobody awakens (R-006).
  OPS.revive = function (x) {
    const c = x.s.players[x.seat].leaders.filter((L) => L.down).map((L) => L.iid);
    if (c.length === 0) return fizzle(x, 'noTarget');
    const [t] = D.ask(x.s, x.f, { kind: 'choose', seat: x.seat, purpose: 'revive', options: c, min: 1, max: 1, prompt: 'Choose one of your downed leaders to bring back.' });
    D.reviveLeader(x.s, t);
  };

  // このターン/このラウンド、自分のリーダーすべての攻撃力を+Nする (先導者の証): a buff on the seat that ends with the turn / round (R-043).
  OPS.atkBuff = function (x, op) { D.addBuff(x.s, x.seat, { stat: 'atk', n: op.n, until: op.until }); };

  // 自分のトラッシュの裏向きのカードをすべてデッキに加えてシャッフルする (アイテムショップ): no tactics penalty (R-019).
  OPS.shuffleTrash = function (x) { D.shuffleTrashIn(x.s, x.seat); };

  // A memoria / consumable tactics card that was played arms its 【アタック強化】 and/or its 【アタック後】 for the next attack (PM p.09;
  // FAQ #65: a card with only a 【アタック後】 attaches it to the next attack as well, FAQ #36: it resolves with that attack only).
  XS.armAttach = function (s, seat, iid) {
    const id = s.cards[iid].id;
    const hasBoost = XS.hasTiming(id, 'boost');
    if (!hasBoost && !XS.hasTiming(id, 'afterAttack')) return;
    s.players[seat].boosts.push(iid);
    XS.log(s, seat, 'boost', hasBoost ? { iid, cardId: id, phase: 'armed' } : { iid, cardId: id, phase: 'armed', afterOnly: true });
  };
  // A card that was placed in the play area without being played from the hand (free play, an Echo replay) now does what playing it does:
  // arm its attachments and run its 【プレイ時】. (An attack card is started with XS.startAttackCard instead.)
  XS.resolvePlayed = function (s, seat, iid) {
    XS.armAttach(s, seat, iid);
    XS.pushOps(s, XS.opsFor(s.cards[iid].id, 'onPlay'), iid, seat, 'onPlay');
  };

  // ---- the 'ops' frame ---------------------------------------------------------------------------------------
  XS.STEP = {};
  XS.STEP.ops = function (s, f) {
    if (f.pc >= f.ops.length) {
      // R-029: an equipment-granted "once per turn" effect is used up only if it actually did something
      if (f.onceKey !== undefined && f.fired === true) s.once[f.onceKey] = s.turn;
      s.stack.pop();
      return;
    }
    const op = f.ops[f.pc];
    if (op.unimplemented !== undefined) throw new Error('unimplemented op reached the engine: ' + op.unimplemented);
    const x = { s, f, seat: f.seat, src: f.src };
    if (op.if === undefined || XS.cond(op.if, x)) {
      const fn = OPS[op.op];
      if (fn === undefined) throw new Error('unknown op ' + op.op);
      // オーバーキルN: one log line when the keyword's condition holds (once: not again when the op resumes after an answer)
      if (op.if !== undefined && op.if.c === 'overkill' && f.ans.length === 0) {
        XS.log(s, f.seat, 'overkill', { leader: s.atk.target, n: op.if.n, excess: s.atk.excess, card: f.src });
      }
      f.fired = true;
      fn(x, op);
    }
    f.pc++;
    f.ans = [];
  };

  // Push an effect group (a card's ops of one timing) onto the resolution stack. It runs next, top to bottom.
  // extra: { quiet: true } = no `ability` log line; { onceKey } = a once-per-turn effect (R-029).
  XS.pushOps = function (s, ops, src, seat, timing, extra) {
    if (ops.length === 0) return;
    if (extra === undefined || extra.quiet !== true) XS.log(s, seat, 'ability', { src, cardId: s.cards[src].id, timing }, src);
    const f = { k: 'ops', ops, pc: 0, ai: 0, ans: [], src, seat, timing };
    if (extra !== undefined && extra.onceKey !== undefined) f.onceKey = extra.onceKey;
    s.stack.push(f);
  };
})();
