// Card effects for BP03 cards used by the registered decks (data/decks.js). Same shape and rules
// as data/abilities.js (docs/ABILITIES.md): one entry per card number, every printed number written as a
// number (tools/audit-cards.mjs), { unimplemented: 'why' } for anything the engine cannot run.
(function () {
  const XS = globalThis.XS;
  const K = XS.ABIL_KIT;
  const { oneOpp, allOpp, oneOther, oneOwn, boost, after, plainAttack, onPlay, onAwaken, draw, dmg } = K;
  Object.assign(XS.ABIL, {
    // ---- leaders: 【覚醒時】 --------------------------------------------------------------------------
    'BP03-003': { effects: [onAwaken(draw(2), { op: 'discard', n: 2 })] },   // カードを2枚引き、手札を2枚捨てる (draw first, then the owner discards 2 of the hand)
    'BP03-004': { effects: [onAwaken(dmg(10, allOpp))] },                   // 対戦相手のリーダーすべてに10ダメージ
    'BP03-005': { effects: [onAwaken(draw(1))] },                           // カードを1枚引く
    'BP03-006': { effects: [onAwaken(dmg(20, oneOpp))] },                   // 対戦相手のリーダー1体に20ダメージ
    'BP03-014': { effects: [onAwaken(draw(1))] },                           // カードを1枚引く

    // ---- attack cards ------------------------------------------------------------------------------
    // ストームラッシュ: three 【アタックする】, each its own attack with its own attacker and target; boosts reach the first
    // only (FAQ #82), awakening after each attack that downed a leader, before the next (FAQ #81), R-025.
    'BP03-017': { effects: [plainAttack, plainAttack, plainAttack] },
    // ノーエスケープ: 【アタック後】このラウンドが3ラウンド目なら、対戦相手の他のリーダー1体に20ダメージ (never in a quick match, FAQ #96: the round is 1)
    'BP03-018': { effects: [plainAttack, after(dmg(20, oneOther, { if: { c: 'roundIs', n: 3 } }))] },
    // ピアッシングバレット: 【アタックする】ダメージ+10
    'BP03-022': { effects: [{ timing: 'attack', ops: [{ op: 'dmgPlus', n: 10 }] }] },
    // 影と道連れ: 【アタック後】オーバーキル10：対戦相手の他のリーダー1体に30ダメージ
    'BP03-023': { effects: [plainAttack, after(dmg(30, oneOther, { if: { c: 'overkill', n: 10 } }))] },
    // 仁義なき抗争: 【アタックする】手札を1枚ランダムに捨ててもよい。そうしたならダメージ+30 (FAQ #93, #94, #98)
    'BP03-027': { effects: [{ timing: 'attack', ops: [
      { op: 'discard', n: 1, random: true, optional: true },
      { op: 'dmgPlus', n: 30, if: { c: 'did' } },
    ] }] },
    // パワーセットアップ: 【アタック後】このアタックを受けたリーダーがダウンしているなら、カードを1枚引く
    'BP03-028': { effects: [plainAttack, after(Object.assign(draw(1), { if: { c: 'attackedDown' } }))] },
    // 鬼の猛追: 【アタック後】対戦相手の他のリーダー1体に10ダメージ
    'BP03-032': { effects: [plainAttack, after(dmg(10, oneOther))] },
    // 強奪の宴: 【アタック後】このアタックを受けたリーダーがダウンしているなら、カードを1枚引き、対戦相手は手札を1枚捨てる
    'BP03-038': { effects: [plainAttack, after(
      Object.assign(draw(1), { if: { c: 'attackedDown' } }),
      { op: 'discard', n: 1, who: 'opp', if: { c: 'attackedDown' } },
    )] },
    // ブリーチングフォース: 【アタック後】オーバーキル20：PPを1回復する
    'BP03-042': { effects: [plainAttack, after({ op: 'recoverPP', n: 1, if: { c: 'overkill', n: 20 } })] },

    // ---- memoria ---------------------------------------------------------------------------------
    // 祭典の開幕: 【プレイ時】カードを1枚引く。【アタック強化】次のアタックのダメージ+30
    'BP03-050': { effects: [onPlay(draw(1)), boost(30)] },
    // 露骨な挑発: 【アタック強化】次のアタックのダメージ+30。【アタック後】対戦相手の他のリーダー1体に30ダメージ
    'BP03-051': { effects: [boost(30), after(dmg(30, oneOther))] },
    // 闘技場の主: 【アタック強化】次のアタックのダメージ+50
    'BP03-053': { effects: [boost(50)] },
    // 22HZ♪: 【アタック強化】次のアタックのダメージ+60
    'BP03-055': { effects: [boost(60)] },
    // シャンパンコール！: 【プレイ時】プレイエリアにアタックカードが1枚以上あるなら、カードを1枚引く。【アタック強化】次のアタックのダメージ+40
    'BP03-056': { effects: [
      onPlay(Object.assign(draw(1), { if: { c: 'playCount', type: 'attack', min: 1 } })),
      boost(40),
    ] },
    // We are...!: 【プレイ時】プレイエリアにアタックカードが2枚以上あるなら、自分のリーダー1体を30回復し、カードを2枚引く。
    //   【アタック強化】プレイエリアにメモリアカードが3枚以上あるなら、次のアタックのダメージ+70 (counted when the boost is applied, FAQ #43, R-051)
    'BP03-059': { effects: [
      onPlay(
        { op: 'heal', n: 30, to: oneOwn, if: { c: 'playCount', type: 'attack', min: 2 } },
        Object.assign(draw(2), { if: { c: 'playCount', type: 'attack', min: 2 } }),
      ),
      { timing: 'boost', ops: [{ op: 'dmgPlus', n: 70, if: { c: 'memoriaAtLeast', n: 3 } }] },
    ] },
    // 大人気キッチンカー: 【アタック強化】次のアタックのダメージ+60
    'BP03-070': { effects: [boost(60)] },

    // ---- tactics ---------------------------------------------------------------------------------
    // パワーフィールド: 【ラウンド中】このラウンド、自分のリーダーすべての攻撃力を+10する (stays in the play area, FAQ #91, #99, R-071)
    'BP03-077': { effects: [{ timing: 'round', ops: [{ op: 'atkMod', n: 10 }] }] },
    // ファイヤークラッカー: 【プレイ時】対戦相手のリーダーすべてに10ダメージ。カードを1枚引く
    'BP03-078': { effects: [onPlay(dmg(10, allOpp), draw(1))] },
    // ターゲットフラッグ: 対戦相手がこのリーダーにアタックできるなら、対戦相手はこのリーダーにしかアタックできない (FAQ #89, R-066)
    'BP03-079': { effects: [{ timing: 'static', ops: [{ op: 'mustTarget' }] }] },
    // サイバネアーマー: 基本の体力が覚醒前140 / 覚醒後170になる (FAQ #90): the stats are data on the card, CARDS['BP03-080'].equip = { hpBase: 140, hpBaseAwakened: 170 }
    'BP03-080': { effects: [] },
  });
})();
