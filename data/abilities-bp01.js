// Card effects for BP01 cards used by the registered decks (data/decks.js). Same shape and rules
// as data/abilities.js (docs/ABILITIES.md): one entry per card number, every printed number written as a
// number (tools/audit-cards.mjs), { unimplemented: 'why' } for anything the engine cannot run.
(function () {
  const XS = globalThis.XS;
  const K = XS.ABIL_KIT;
  // 【覚醒時】カードを2枚引き、手札を2枚捨てる。(BP01-003, BP01-013)
  const drawTwoDiscardTwo = () => ({ effects: [K.onAwaken(K.draw(2), { op: 'discard', n: 2 })] });
  // 【アタックする】/【アタック後】対戦相手の他のリーダー1体に20ダメージ。(BP01-018, BP01-027)
  const afterTwentyToOther = () => ({ effects: [K.plainAttack, K.after(K.dmg(20, K.oneOther))] });
  // 【アタック強化】次のアタックのダメージ+60。(BP01-059, BP01-083)
  const boostSixty = () => ({ effects: [K.boost(60)] });
  // 【プレイ時】すべてのプレイヤーはカードを1枚引く。【アタック強化】次のアタックのダメージ+50。(BP01-061, BP01-088)
  const bothDrawBoostFifty = () => ({ effects: [
    K.onPlay({ op: 'draw', n: 1, who: 'both' }),     // すべてのプレイヤーはカードを1枚引く (turn player first, FAQ #84, R-072)
    K.boost(50),                                      // 次のアタックのダメージ+50
  ] });

  Object.assign(XS.ABIL, {
    // ---- leaders: 【覚醒時】 -------------------------------------------------------------------
    'BP01-003': drawTwoDiscardTwo(),                  // 【覚醒時】カードを2枚引き、手札を2枚捨てる。
    'BP01-013': drawTwoDiscardTwo(),                  // 【覚醒時】カードを2枚引き、手札を2枚捨てる。
    'BP01-014': { effects: [K.onAwaken(K.draw(1))] }, // 【覚醒時】カードを1枚引く。
    'BP01-016': { effects: [K.onAwaken(K.dmg(10, K.oneOpp))] },   // 【覚醒時】対戦相手のリーダー1体に10ダメージ。

    // ---- attack cards --------------------------------------------------------------------------
    'BP01-018': afterTwentyToOther(),                 // エレガントドミネート: 【アタック後】対戦相手の他のリーダー1体に20ダメージ。
    'BP01-023': { effects: [{ timing: 'attack', ops: [{ op: 'dmgPlus', n: 10 }] }] },   // だまし討ち: 【アタックする】ダメージ+10。
    'BP01-027': afterTwentyToOther(),                 // フラッシュバン: 【アタック後】対戦相手の他のリーダー1体に20ダメージ。
    'BP01-043': { effects: [                          // ブービートラップ
      K.plainAttack,
      K.after(Object.assign(K.draw(1), { if: { c: 'attackedDown' } })),   // 【アタック後】このアタックを受けたリーダーがダウンしているなら、カードを1枚引く。
    ] },
    'BP01-044': { effects: [                          // リンク・アサルト
      K.plainAttack,
      K.after(
        { op: 'look', n: 3 },                                                                                    // 自分のデッキの上から3枚を見る。
        { op: 'freePlay', from: 'look', filter: { type: 'memoria', maxCost: 1 }, min: 0, max: 1 },               // その中からコスト1以下のメモリアカード1枚を、コストを支払わずにプレイしてもよい。(効果はこのアタックが終わってから, FAQ #25/#40, R-074)
        { op: 'lookRest' },                                                                                      // 残りのカードをトラッシュに置く。
      ),
    ] },
    'BP01-045': { effects: [K.plainAttack, K.after(K.dmg(10, K.allOther))] },   // クレイジーバースト: 【アタック後】対戦相手の他のリーダーすべてに10ダメージ。
    'BP01-047': { effects: [                          // いたずらドローン
      K.plainAttack,
      K.after(K.dmg(20, K.oneOther, { if: { c: 'memoriaAtLeast', n: 2 } })),   // 【アタック後】プレイエリアにメモリアカードが2枚以上あるなら、対戦相手の他のリーダー1体に20ダメージ。
    ] },
    'BP01-048': { effects: [{ timing: 'attack', ops: [{ op: 'dmgPlus', n: -20 }] }] },   // スリフティプレイ: 【アタックする】ダメージ-20。(R-016, FAQ #53)

    // ---- memoria -------------------------------------------------------------------------------
    'BP01-059': boostSixty(),                         // 笑ってはいけない: 【アタック強化】次のアタックのダメージ+60。
    'BP01-061': bothDrawBoostFifty(),                 // 逃走成功
    'BP01-071': { effects: [K.onPlay({ op: 'atkBuff', n: 30, until: 'turn' })] },   // 先導者の証: 【プレイ時】このターン、自分のリーダーすべての攻撃力を+30する。(R-043)
    'BP01-083': boostSixty(),                         // バトンを繋いで: 【アタック強化】次のアタックのダメージ+60。
    'BP01-088': bothDrawBoostFifty(),                 // モラルからのハミダシ

    // ---- tactics -------------------------------------------------------------------------------
    'BP01-092': { effects: [K.onPlay(K.draw(2))] },   // ストラテジックレーダー: 【プレイ時】カードを2枚引く。
    'BP01-093': { effects: [K.onPlay({ op: 'discard', n: 2, who: 'opp' })] },   // ジャミングパルス: 【プレイ時】対戦相手は手札を2枚捨てる。(the opponent chooses, FAQ #47, R-021)
    'BP01-094': { effects: [                          // 復活ポータル
      { timing: 'static', ops: [{ op: 'playIf', if: { c: 'downMoreThanOpp' }, msg: 'You can only play this while more of your leaders are down than your opponent\'s.' }] },   // このカードは、対戦相手よりダウンしているリーダーが多いなら、プレイできる。
      K.onPlay({ op: 'revive' }),                     // 【プレイ時】ダウンしている自分のリーダー1体を、ダウンしていない状態に戻す。そのリーダーが装備しているカードすべてを表向きにトラッシュに置く。(FAQ #23)
    ] },
  });
})();
