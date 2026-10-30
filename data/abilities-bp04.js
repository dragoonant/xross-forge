// Card effects for BP04 cards used by the registered decks (data/decks.js). Same shape and rules
// as data/abilities.js (docs/ABILITIES.md): one entry per card number, every printed number written as a
// number (tools/audit-cards.mjs), { unimplemented: 'why' } for anything the engine cannot run.
(function () {
  const XS = globalThis.XS;
  const K = XS.ABIL_KIT;
  Object.assign(XS.ABIL, {
    // ---- leaders: 【覚醒時】 ------------------------------------------------------------------
    'BP04-001': { effects: [K.onAwaken(K.draw(1))] },                                            // うぉっか: カードを1枚引く
    'BP04-002': { effects: [K.onAwaken({ op: 'heal', n: 20, to: K.oneOwn })] },                  // 昏昏アリア: 自分のリーダー1体を20回復する
    'BP04-006': { effects: [K.onAwaken(K.dmg(20, K.oneOpp))] },                                  // 白波らむね: 対戦相手のリーダー1体に20ダメージ
    'BP04-008': { effects: [K.onAwaken({ op: 'heal', n: 20, to: K.oneOwn })] },                  // 夜乃くろむ: 自分のリーダー1体を20回復する
    'BP04-012': { effects: [K.onAwaken(K.dmg(20, K.oneOpp))] },                                  // とおこ: 対戦相手のリーダー1体に20ダメージ
    'BP04-013': { effects: [K.onAwaken(K.dmg(10, K.oneOpp))] },                                  // 乾伸一郎: 対戦相手のリーダー1体に10ダメージ

    // ---- attack cards -------------------------------------------------------------------------
    'BP04-018': K.loot(),                                                                        // 1TAP: 【アタック後】カードを1枚引き、手札を1枚捨てる
    'BP04-020': { effects: [{ timing: 'attack', ops: [{ op: 'dmgPlus', n: -20 }] }] },           // ワールドクラス: 【アタックする】ダメージ-20
    'BP04-024': { effects: [{ timing: 'attack', ops: [                                           // オーバードライブ (FAQ #108, #124)
      { op: 'reveal', n: 2, optional: true },                                                    // 自分の手札のカードを最大2枚公開する (0枚でもよい, FAQ #51)
      { op: 'discard', of: 'revealed' },                                                         // それらのカードを捨てる
      { op: 'dmgPlus', n: { perRevealed: { type: 'attack', each: 30 } } },                                // 捨てたアタックカード1枚につき、ダメージ+30 (the engine counts per card; `each` is the amount)
      { op: 'draw', n: { perRevealed: { type: 'memoria', each: 2 } } },                          // 捨てたメモリアカード1枚につき、カードを2枚引く
    ] }] },
    'BP04-028': { effects: [K.plainAttack, K.after(                                              // シンクロトリニティ (FAQ #119)
      { op: 'look', n: 3 },                                                                      // 自分のデッキの上から3枚を見る
      { op: 'lookPick', to: 'hand', filter: { cost: 0, notAce: true }, min: 0, max: 1, reveal: true },   // エース以外のコスト0のカード1枚を公開し、手札に加えてもよい
      { op: 'lookRest' },                                                                        // 残りのカードをトラッシュに置く
    )] },
    'BP04-030': { effects: [{ timing: 'attack', ops: [{ op: 'dmgPlus', n: 10 }] }] },            // シールドスラム: 【アタックする】ダメージ+10
    'BP04-037': { effects: [K.plainAttack, K.after(                                              // シンリャク開始: このアタックを受けたリーダーがダウンしているなら、カードを1枚引く
      { op: 'draw', n: 1, if: { c: 'attackedDown' } },
    )] },
    'BP04-038': { effects: [                                                                     // アナイアレーション (FAQ #126)
      { timing: 'attack', ops: [{ op: 'dmgPlus', n: 30, if: { c: 'ownColorsDiffer' } }] },       // 【アタックする】自分のリーダーの色がすべて異なるなら、ダメージ+30
      K.after(                                                                                   // 【アタック後】自分のリーダーの色がすべて異なるなら、書かれている順に
        K.dmg(30, K.oneOther, { if: { c: 'ownColorsDiffer' } }),                                 //   対戦相手の他のリーダー1体に30ダメージ
        { op: 'heal', n: 30, to: K.oneOwn, if: { c: 'ownColorsDiffer' } },                       //   自分のリーダー1体を30回復し
        { op: 'draw', n: 1, if: { c: 'ownColorsDiffer' } },                                      //   カードを1枚引く
      ),
    ] },
    'BP04-039': { effects: [{ timing: 'attack', ops: [                                           // 大旋風: 【アタックする】アタッカーが覚醒しているなら、ダメージ+10
      { op: 'dmgPlus', n: 10, if: { c: 'attackerAwakened' } },
    ] }] },
    'BP04-041': { effects: [K.plainAttack, K.after(                                              // アースサーファー: 【アタック後】オーバーキル30：カードを2枚引く
      { op: 'draw', n: 2, if: { c: 'overkill', n: 30 } },
    )] },

    // ---- memoria ------------------------------------------------------------------------------
    'BP04-048': { effects: [K.onPlay(K.draw(2))] },                                              // 入念な準備: 【プレイ時】カードを2枚引く
    'BP04-049': { effects: [                                                                     // なんだコイツ…
      K.onPlay({ op: 'discard', n: 1, who: 'both' }),                                            // 【プレイ時】すべてのプレイヤーは手札を1枚捨てる (R-072)
      K.boost(50),                                                                               // 【アタック強化】次のアタックのダメージ+50
    ] },
    'BP04-053': { effects: [                                                                     // 穏やかな一時
      K.onPlay({ op: 'heal', n: 10, to: K.oneOwn }),                                             // 【プレイ時】自分のリーダー1体を10回復する
      K.boost(10),                                                                               // 【アタック強化】ダメージ+10 (printed without 「次のアタック」: the same effect, FAQ #127)
    ] },
    'BP04-054': { effects: [K.boost(50)] },                                                      // 放課後補習組: 【アタック強化】次のアタックのダメージ+50
    'BP04-056': { effects: [K.onPlay(K.dmg(20, K.oneOpp))] },                                    // でからむち♪: 【プレイ時】対戦相手のリーダー1体に20ダメージ
    'BP04-058': { effects: [K.boost(60)] },                                                      // 「またね」: 【アタック強化】次のアタックのダメージ+60
    'BP04-061': { effects: [K.boost(50)] },                                                      // 通過儀礼: 【アタック強化】次のアタックのダメージ+50
    'BP04-065': { effects: [{ timing: 'boost', ops: [                                            // 雪降る夜に: プレイエリアにメモリアカードが3枚以上あるなら、次のアタックのダメージ+30 (counted when the boost applies, R-051)
      { op: 'dmgPlus', n: 30, if: { c: 'memoriaAtLeast', n: 3 } },
    ] }] },
    'BP04-066': { effects: [                                                                     // 収穫の刻 (FAQ #110, #111, #125, #131)
      K.onPlay(K.dmg(20, K.oneOpp), K.draw(1)),                                                  // 【プレイ時】対戦相手のリーダー1体に20ダメージ。カードを1枚引く
      K.after(                                                                                   // 【アタック後】
        { op: 'freePlay', from: 'hand', filter: { type: 'memoria', cost: 1 }, min: 0, max: 1, if: { c: 'attackerColor', color: 'green' } },   // アタッカーが緑なら、手札のコスト1のメモリアカード1枚を、コストを支払わずにプレイしてもよい
        { op: 'freePlay', from: 'hand', filter: { type: 'attack', cost: 1 }, min: 0, max: 1, if: { c: 'attackerColor', color: 'red' } },       // アタッカーが赤なら、手札のコスト1のアタックカード1枚を、コストを支払わずにプレイしてもよい
      ),
    ] },
    'BP04-067': { effects: [K.boost(50)] },                                                      // リトルエンプレス: 【アタック強化】次のアタックのダメージ+50
    'BP04-069': { effects: [K.boost(60)] },                                                      // 深淵の強者たち: 【アタック強化】次のアタックのダメージ+60

    // ---- tactics ------------------------------------------------------------------------------
    'BP04-076': { effects: [K.onPlay(                                                            // アイテムショップ (R-019, FAQ #128)
      { op: 'shuffleTrash' },                                                                    // 【プレイ時】自分のトラッシュの裏向きのカードすべてを自分のデッキに加え、シャッフルする
      K.draw(2),                                                                                 // カードを2枚引く
    )] },
    'BP04-079': { effects: [K.onPlay(                                                            // 討伐クエスト (FAQ #117)
      { op: 'look', n: 7 },                                                                      // 【プレイ時】自分のデッキの上から7枚を見る
      { op: 'lookPick', to: 'hand', min: 1, max: 1 },                                            // その中からカード1枚を手札に加える
      { op: 'lookRest' },                                                                        // 残りのカードをトラッシュに置く
    )] },
    'BP04-080': { effects: [                                                                     // 呪いの人形
      K.onPlay({ op: 'discard', n: 1, who: 'opp' }),                                             // 【プレイ時】対戦相手は手札を1枚捨てる (the opponent chooses, R-021)
      K.boost(40),                                                                               // 【アタック強化】次のアタックのダメージ+40
    ] },
  });
})();
