// Card effects as data (docs/ABILITIES.md). One entry per card number in data/cards.js.
// Shape: XS.ABIL[number] = { effects: [ { timing, ops: [ op, ... ] }, ... ] }
//   timing: 'onPlay' (【プレイ時】) | 'attack' (【アタックする】) | 'afterAttack' (【アタック後】)
//         | 'boost' (【アタック強化】) | 'onAwaken' (【覚醒時】) | 'round' (【ラウンド中】) | 'static'.
//   An op that the engine cannot run is written { unimplemented: 'why' }; tools/validate-abilities.mjs
//   refuses it for any card in a registered deck (CLAUDE.md rule 8).
// Ops, conditions, and targets: js/engine/abilities.js. Numbers and tags here are audited against the
// printed text by tools/audit-cards.mjs, so every printed number is written as a number below.
// Booster cards live in data/abilities-bp01.js .. -bp04.js (same shape, helpers from XS.ABIL_KIT); the data
// is deep-frozen by data/abilities-end.js so resolution frames can share it (apply never mutates).
(function () {
  const XS = (globalThis.XS = globalThis.XS || {});

  // ---- reusable pieces ---------------------------------------------------------------------
  const oneOpp = { side: 'opp', count: 1 };                       // 対戦相手のリーダー1体
  const allOpp = { side: 'opp', count: 'all' };                   // 対戦相手のリーダーすべて
  const oneOther = { side: 'opp', count: 1, other: true };        // 対戦相手の他のリーダー1体
  const allOther = { side: 'opp', count: 'all', other: true };    // 対戦相手の他のリーダーすべて
  const oneOwn = { side: 'own', count: 1 };                       // 自分のリーダー1体
  const boost = (n) => ({ timing: 'boost', ops: [{ op: 'dmgPlus', n }] });               // 【アタック強化】次のアタックのダメージ+N
  const after = (...ops) => ({ timing: 'afterAttack', ops });
  const plainAttack = { timing: 'attack', ops: [] };                                      // a bare 【アタックする】
  const onPlay = (...ops) => ({ timing: 'onPlay', ops });
  const onAwaken = (...ops) => ({ timing: 'onAwaken', ops });
  const draw = (n) => ({ op: 'draw', n });
  const dmg = (n, to, extra) => Object.assign({ op: 'damage', n, to }, extra);
  const summit = () => ({ effects: [
    onPlay({ op: 'draw', n: 1, if: { c: 'ownDownAtLeast', n: 3 } }),   // 自分のリーダーが3体ダウンしているなら、カードを1枚引く
    boost(40),
  ] });
  const adrenaline = () => ({ effects: [onPlay(draw(1)), boost(40)] });
  const energyCharger = () => ({ effects: [onPlay({ op: 'recoverPP', n: 1 }, draw(1))] });
  const firstAid = () => ({ effects: [onPlay({ op: 'healTotal', n: 80, unit: 10 })] });
  const specialRound = () => ({ effects: [boost(80)] });
  const lightShield = () => ({ effects: [] });   // 体力+30 (PM p.10): the stat is data on the card, CARDS['ST01-023'].equip = { hp: 30 }, read by XS.leaderStats
  const ppTicket = () => ({ effects: [
    { timing: 'static', ops: [{ op: 'ticketRule', round: 1 }] },        // 1ラウンド目…後攻のプレイヤーはこのカードをタクティクスエリアに置く (setup rule, PM p.05)
    onPlay({ op: 'recoverPP', n: 1 }),
  ] });
  const ppCard = () => ({ effects: [], pp: true });                      // a Play Point card: no effect (PM p.03)
  const perTag = (tag) => ({ op: 'damage', n: { perOwnTag: { tag, each: 10 } }, to: oneOther });   // 他のリーダー1体に、自分の「X」を持つリーダー1体につき10ダメージ
  const downIfAllTag = (tag) => ({ effects: [{ timing: 'attack', ops: [{ op: 'downAttacked', if: { c: 'allOwnTag', tag } }] }] });   // R-026
  const loot = () => ({ effects: [plainAttack, after(draw(1), { op: 'discard', n: 1 })] });            // カードを1枚引き、手札を1枚捨てる

  XS.ABIL = {
    // ---- ST01 First Glory (VSPO!) ----------------------------------------------------------
    'ST01-001': { effects: [onAwaken(draw(1))] },
    'ST01-002': { effects: [onAwaken(dmg(10, oneOpp))] },
    'ST01-003': { effects: [onAwaken(dmg(10, allOpp))] },
    'ST01-004': { effects: [onAwaken({ op: 'heal', n: 20, to: oneOwn })] },
    'ST01-005': downIfAllTag('VSPO!'),
    'ST01-006': loot(),
    'ST01-007': { effects: [plainAttack, after(dmg(40, oneOther))] },
    'ST01-008': { effects: [plainAttack, after(Object.assign(draw(1), { if: { c: 'attackedDown' } }))] },
    'ST01-009': { effects: [plainAttack, after(dmg(10, oneOther))] },
    'ST01-010': { effects: [{ timing: 'attack', ops: [{ op: 'dmgPlus', n: 70 }] }] },
    'ST01-011': { effects: [{ timing: 'attack', ops: [{ op: 'dmgPlus', n: 10 }] }] },
    'ST01-012': { effects: [plainAttack, after(dmg(10, allOther, { if: { c: 'memoriaAtLeast', n: 2 } }))] },
    'ST01-013': { effects: [boost(50)] },
    'ST01-014': { effects: [boost(80)] },
    'ST01-015': { effects: [boost(60)] },
    'ST01-016': { effects: [boost(30), after(perTag('VSPO!'))] },
    'ST01-017': summit(),
    'ST01-018': { effects: [onPlay({ op: 'heal', n: 30, to: oneOwn }), boost(30)] },
    'ST01-019': adrenaline(),
    'ST01-020': energyCharger(),
    'ST01-021': firstAid(),
    'ST01-022': specialRound(),
    'ST01-023': lightShield(),
    'ST01-024': ppTicket(),
    'ST01-025': ppCard(),

    // ---- ST02 Advent of the Demon King (CR) ------------------------------------------------
    'ST02-001': { effects: [onAwaken(dmg(10, oneOpp))] },
    'ST02-002': { effects: [onAwaken({ op: 'heal', n: 20, to: oneOwn })] },
    'ST02-003': { effects: [onAwaken(draw(1))] },
    'ST02-004': { effects: [onAwaken(dmg(10, allOpp))] },
    'ST02-005': { effects: [plainAttack, after(dmg(10, oneOther))] },
    'ST02-006': loot(),
    'ST02-007': { effects: [{ timing: 'attack', ops: [{ op: 'dmgPlus', n: 40 }] }] },
    'ST02-008': { effects: [plainAttack, after(dmg(20, oneOther, { if: { c: 'attackedDown' } }))] },
    'ST02-009': downIfAllTag('CR'),
    'ST02-010': { effects: [plainAttack, after(dmg(20, oneOther, { if: { c: 'handAtMost', n: 2 } }))] },
    'ST02-011': { effects: [plainAttack, after(dmg(20, allOther))] },
    'ST02-012': { effects: [boost(30), after(perTag('CR'))] },
    'ST02-013': { effects: [boost(80)] },
    'ST02-014': { effects: [onPlay(draw(2))] },
    'ST02-015': { effects: [boost(50)] },
    'ST02-016': summit(),
    'ST02-017': { effects: [boost(60)] },
    'ST02-018': { effects: [boost(50), after(dmg(10, oneOther))] },
    'ST02-019': adrenaline(),
    'ST02-020': energyCharger(),
    'ST02-021': firstAid(),
    'ST02-022': specialRound(),
    'ST02-023': lightShield(),
    'ST02-024': ppTicket(),
    'ST02-025': ppCard(),
  };

  // Shared helpers for the per-product files (data/abilities-bp0N.js). The data is deep-frozen
  // by data/abilities-end.js, which loads after every abilities file.
  XS.ABIL_KIT = { oneOpp, allOpp, oneOther, allOther, oneOwn, boost, after, plainAttack, onPlay, onAwaken,
    draw, dmg, summit, adrenaline, firstAid, specialRound, lightShield, ppTicket, ppCard, perTag, downIfAllTag, loot };
})();
