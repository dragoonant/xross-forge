// Card effects for BP02 cards used by the registered decks (data/decks.js). Same shape and rules
// as data/abilities.js (docs/ABILITIES.md): one entry per card number, every printed number written as a
// number (tools/audit-cards.mjs), { unimplemented: 'why' } for anything the engine cannot run.
(function () {
  const XS = globalThis.XS;
  const K = XS.ABIL_KIT;
  Object.assign(XS.ABIL, {
    // ---- leaders: 【覚醒時】 ----------------------------------------------------------------
    'BP02-004': { effects: [K.onAwaken(K.draw(1))] },                                   // カードを1枚引く
    'BP02-010': { effects: [K.onAwaken(K.dmg(10, K.allOpp))] },                         // 対戦相手のリーダーすべてに10ダメージ
    'BP02-014': { effects: [K.onAwaken(K.dmg(10, K.allOpp))] },                         // 対戦相手のリーダーすべてに10ダメージ

    // ---- attack cards ------------------------------------------------------------------------
    'BP02-018': { effects: [{ timing: 'attack', ops: [                                  // 【アタックする】アタッカーが覚醒しているなら、ダメージ+10
      { op: 'dmgPlus', n: 10, if: { c: 'attackerAwakened' } },
    ] }] },
    'BP02-023': { effects: [K.plainAttack, K.after(                                     // 【アタック後】このアタックを受けたリーダーがダウンしているなら、カードを1枚引く
      { op: 'draw', n: 1, if: { c: 'attackedDown' } },
    )] },
    'BP02-026': { effects: [K.plainAttack, K.after(K.dmg(10, K.oneOther))] },           // 【アタック後】対戦相手の他のリーダー1体に10ダメージ
    'BP02-032': { effects: [{ timing: 'attack', ops: [                                  // 【アタックする】このラウンドが3ラウンド目なら、ダメージ+20
      { op: 'dmgPlus', n: 20, if: { c: 'roundIs', n: 3 } },
    ] }] },
    'BP02-035': { effects: [K.plainAttack, K.after(                                     // 【アタック後】オーバーキル20：PPを1回復する
      { op: 'recoverPP', n: 1, if: { c: 'overkill', n: 20 } },
    )] },
    'BP02-040': K.loot(),                                                               // 【アタック後】カードを1枚引き、手札を1枚捨てる
    'BP02-042': { effects: [K.plainAttack, K.after(                                     // 【アタック後】このアタックを受けたリーダーがダウンしているなら、対戦相手は手札を1枚捨てる
      { op: 'discard', n: 1, who: 'opp', if: { c: 'attackedDown' } },
    )] },

    // ---- memoria -----------------------------------------------------------------------------
    'BP02-046': { effects: [K.boost(50)] },                                             // 【アタック強化】次のアタックのダメージ+50
    'BP02-051': { effects: [K.boost(60)] },                                             // 【アタック強化】次のアタックのダメージ+60
    'BP02-054': { effects: [K.onPlay(K.draw(1), { op: 'discard', n: 1 })] },            // 【プレイ時】カードを1枚引き、手札を1枚捨てる
    'BP02-063': { effects: [K.onPlay(K.draw(1)), K.boost(30)] },                        // 【プレイ時】カードを1枚引く。【アタック強化】+30
    'BP02-068': { effects: [                                                            // 【プレイ時】このラウンドが3ラウンド目なら、カードを1枚引く。【アタック強化】+40
      K.onPlay({ op: 'draw', n: 1, if: { c: 'roundIs', n: 3 } }),
      K.boost(40),
    ] },
    'BP02-070': { effects: [K.boost(60)] },                                             // 【アタック強化】次のアタックのダメージ+60

    // ---- tactics -----------------------------------------------------------------------------
    // 【プレイ時】自分のリーダーを合計40回復する。対戦相手のリーダー1体に、このカードの効果で回復した数値と同じダメージ。
    // FAQ #64: the damage is the amount ACTUALLY healed (30 on a leader with 30 damage), not 40.
    'BP02-076': { effects: [K.onPlay({ op: 'healTotal', n: 40, unit: 10 }, { op: 'damage', n: { healed: true }, to: K.oneOpp })] },
    // これを装備しているリーダーは以下の能力を持つ。「【アタック後】このアタックを受けたリーダーがダウンしているなら、カードを1枚引く。この効果はターンに1回しか発動しない。」 (R-028, R-029)
    'BP02-078': { effects: [{ timing: 'static', ops: [
      { op: 'grant', timing: 'afterAttack', oncePerTurn: true, ops: [{ op: 'draw', n: 1, if: { c: 'attackedDown' } }] },
    ] }] },
  });
})();
