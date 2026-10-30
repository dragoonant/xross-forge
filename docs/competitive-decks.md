# Competitive decklists (post-ban, Oct 2026)

## Selection (implemented decks) — 2026-10-30

The game implements the **ten decks with a competitive source**: **C01-C07** below plus
**A01** (Challengers Cup 2026 #3 OSAKA Top 8), **A02** and **A03** (Yuyu-tei meta column, 2026-07-30),
listed in `data/decklists-competitive.json` under `decks`. C08-C10 are undated shop sample recipes
built on BP05 (no BP05 tournament list existed on 2026-10-30); they moved to `alternates` with
A04-A07 (PLAN D19). Union of the ten: 100 card numbers, 92 of them new to the game.
The sections below keep the research numbering.

Research note for the engine work; all lists are legal under `docs/rules.md` section 3 as of 2026-10-30 (BAN list: エナジーチャージャー only, restrictions API id 90, official notice news 202; no Limited cards yet). Raw files are in the gitignored `docs/sources/decks/`. Card numbers are the earliest printing of each name by release date (starter numbers in `data/cards.js` win), because effect, cost, colour, ACE and build rule were checked identical across every printing of a name. Leader agencies come from the shop card pages (所属 field; no tag in the API, R-031); "-" means the card has no printed agency (free agents such as nqrse, けんき, ハセシン).

Findings in one place: the only post-ban tournament lists reachable were the four Challengers Cup 2026 #3 OSAKA (2026-08-08/09) placings from the retailer CB Torecolo; no Leaders Open, shop-battle or later event list was found. BP05 cards went on sale 2026-10-30 (the API release_date field says 2026-10-23), so no BP05 tournament list exists yet; C08-C10 are the only BP05 lists found and are retailer samples. The official site's news and event pages carry no deck images or deck links (photo reports only).

Legality table (tools/out/validate-competitive.py):

| id | main | ACE | colours | agencies | check |
|---|---|---|---|---|---|
| C01 | 50 | 8 | bgry | CR / VSPO! / CR / - | OK |
| C02 | 50 | 8 | gr | VSPO! / CR / CR / - | OK |
| C03 | 50 | 8 | ry | VSPO! / Neo-Porte / CR / VSPO! | OK |
| C04 | 50 | 8 | bg | REJECT / - / - / REJECT | OK |
| C05 | 50 | 8 | gr | VSPO! / CR / Neo-Porte / Neo-Porte | OK |
| C06 | 50 | 8 | gr | VSPO! / CR / VSPO! / CR | OK |
| C07 | 50 | 8 | bgry | CR / CR / VSPO! / REJECT | OK |
| C08 | 50 | 8 | bry | VSPO! / REJECT / CR / REJECT | OK |
| C09 | 50 | 8 | gr | VSPO! / CR / CR / - | OK |
| C10 | 50 | 8 | gy | VSPO! / VSPO! / VSPO! / VSPO! | OK |

## C01 Four-colour Overdrive-Annihilation assault  (4cODアナイアアサルト)

- **Leaders:** Mondo (ST02-002, 赤/red, CR); 夜乃くろむ (BP04-008, 青/blue, VSPO!); Ras (ST02-004, 黄/yellow, CR); けんき (BP03-014, 緑/green, -)
- **Tactics:** ジャミングパルス (BP01-093), アドレナリン (ST01-019), ターゲットフラッグ (BP03-079), サイバネアーマー (BP03-080), 盗賊キット (BP02-078)
- **Main (50, ACE 8):** ブービートラップ x4 (BP01-043), リンク・アサルト x1 (BP01-044), 逃走成功 x4 (BP01-061), ドレッドフォーム x1 (BP02-026), アンストッパブル x2 (BP02-032), いただきま～す！ x1 (BP02-046), Just Eat Chicken! x4 (BP02-068), 鬼の猛追 x1 (BP03-032), ブリーチングフォース x4 (BP03-042), 闘技場の主 x1 (BP03-053), 大人気キッチンカー x4 (BP03-070), オーバードライブ x4 (BP04-024), シールドスラム x4 (BP04-030), アナイアレーション x3 (BP04-038), 「またね」 x4 (BP04-058), キリングスプリー x4 (ST02-008), 小さなビデオレター x4 (ST02-018)
- **Game plan:** Four colours, one leader each, built around the blue ACE that discards up to two cards for damage and draws, one copy of the free-play chain ACE, and three of the colour-spread ACE (live only because all four leaders differ in colour). Round 1 is taken with the draw/boost tactic or the base-HP shield; a discard tactic and an attack-redirect flag slow the opponent down.
- **Notes:** Named winner of the 2026-08-08/09 full-match event per the retailer page title. The leader mix (Mondo, Ras, 夜乃くろむ, けんき) keeps the Mondo and Ras exclusive cards, the けんき 60-boost memoria and the colour-spread ACE all live at once.
- **Source:** https://www.torecolo.jp/shop/pg/1xsdeck046/ ; fetched 2026-10-30 ; Xross Stars Challengers Cup 2026 #3 OSAKA (full match), 2026-08-08/09, 1st place (retailer page titled 優勝レシピ; the official photo report https://xross-stars.com/news/208 names the champion only as ぜけみ and links no list) ; method: page text (product-number image tags + counts)
- **Transcription doubt:** Transcribed from the retailer page text (card images tagged by product number with counts), not from an image; totals checked: 50 main (ACE 8), 4 leaders, 5 tactics. The page header calls it 優勝; the official photo report (https://xross-stars.com/news/208) names the winner only as ぜけみ and does not link the list. Parallel printings of the same name were merged to one number.

## C02 Assault-Storm (rion)  (アサルトストーム)

- **Leaders:** 橘ひなの (BP01-003, 赤/red, VSPO!); Mondo (ST02-002, 赤/red, CR); rion (BP03-004, 赤/red, CR); nqrse (BP01-016, 緑/green, -)
- **Tactics:** ストラテジックレーダー (BP01-092), 復活ポータル (BP01-094), 救急キット (ST01-021), アドレナリン (ST01-019), サイバネアーマー (BP03-080)
- **Main (50, ACE 8):** エレガントドミネート x4 (BP01-018), だまし討ち x4 (BP01-023), リンク・アサルト x4 (BP01-044), 笑ってはいけない x4 (BP01-059), 逃走成功 x4 (BP01-061), モラルからのハミダシ x4 (BP01-088), サイコフォートレス x1 (BP02-018), Just Eat Chicken! x4 (BP02-068), ストームラッシュ x4 (BP03-017), ノーエスケープ x3 (BP03-018), 影と道連れ x4 (BP03-023), 露骨な挑発 x4 (BP03-051), 強さの証明 x2 (ST01-009), キリングスプリー x4 (ST02-008)
- **Game plan:** Red core with one green leader: cost-1 attacks and 60-point memoria from every red leader, the three-hit storm ACE and the free-play chain ACE for the finish. Round 1 goes to the draw/boost tactic; in round 3 on the play the revive tactic is insurance for a three-turn win.
- **Notes:** Runner-up of the same event. The report on the Top 8 rion list says the runner-up played almost the same deck.
- **Source:** https://www.torecolo.jp/shop/pg/1xsdeck047/ ; fetched 2026-10-30 ; Challengers Cup 2026 #3 OSAKA, 2026-08-08/09, 2nd place (準優勝) ; method: page text (product-number image tags + counts)
- **Transcription doubt:** As C01. The yuyu-tei report calls a friend of the author runner-up with "almost the same deck" as the rion list (A01), consistent with this page.

## C03 Pioneer Storm  (先導者ストーム)

- **Leaders:** 橘ひなの (BP01-003, 赤/red, VSPO!); 緋月ゆい (BP03-003, 赤/red, Neo-Porte); うぉっか (BP04-001, 赤/red, CR); 神成きゅぴ (BP02-010, 黄/yellow, VSPO!)
- **Tactics:** ストラテジックレーダー (BP01-092), ジャミングパルス (BP01-093), サイバネアーマー (BP03-080), アイテムショップ (BP04-076), 討伐クエスト (BP04-079)
- **Main (50, ACE 8):** エレガントドミネート x4 (BP01-018), だまし討ち x4 (BP01-023), 笑ってはいけない x4 (BP01-059), 先導者の証 x4 (BP01-071), アンストッパブル x4 (BP02-032), デッドリーキャンプ x4 (BP02-035), ギャルスタイル x4 (BP02-063), ストームラッシュ x4 (BP03-017), ノーエスケープ x2 (BP03-018), ピアッシングバレット x4 (BP03-022), 祭典の開幕 x4 (BP03-050), ワールドクラス x4 (BP04-020), 通過儀礼 x4 (BP04-061)
- **Game plan:** Red-heavy storm: the three-hit storm ACE and the memoria ACE that raises every leader's attack by 30 for the turn, backed by 0-cost minus-20 attacks and 1-cost boosters. Two newer tactics (shuffle the face-down trash back and draw; look 7 deep for one card) make the ACE memoria easier to reach.
- **Notes:** Prize-winning list from the same event.
- **Source:** https://www.torecolo.jp/shop/pg/1xsdeck048/ ; fetched 2026-10-30 ; Challengers Cup 2026 #3 OSAKA, 2026-08-08/09, prize-winning finish (入賞) ; method: page text (product-number image tags + counts)
- **Transcription doubt:** As C01.

## C04 Overdrive Assault (REJECT + free agents)  (ODアサルト)

- **Leaders:** ズズ (BP03-005, 青/blue, REJECT); nqrse (BP01-016, 緑/green, -); けんき (BP03-014, 緑/green, -); 乾伸一郎 (BP04-013, 緑/green, REJECT)
- **Tactics:** 救急キット (ST01-021), ストラテジックレーダー (BP01-092), 復活ポータル (BP01-094), ライトシールド (ST01-023), サイバネアーマー (BP03-080)
- **Main (50, ACE 8):** リンク・アサルト x4 (BP01-044), クレイジーバースト x4 (BP01-045), モラルからのハミダシ x4 (BP01-088), Just Eat Chicken! x4 (BP02-068), 仁義なき抗争 x4 (BP03-027), ブリーチングフォース x4 (BP03-042), 22HZ♪ x4 (BP03-055), 大人気キッチンカー x4 (BP03-070), オーバードライブ x4 (BP04-024), 大旋風 x4 (BP04-039), アースサーファー x4 (BP04-041), 放課後補習組 x1 (BP04-054), 深淵の強者たち x4 (BP04-069), 強さの証明 x1 (ST01-009)
- **Game plan:** Green/blue ACE-chain assault: four each of the blue discard-for-damage ACE and the free-play chain ACE, a block of cost-1 attacks with overkill draw/PP riders, and 60-boost memoria for three of the four leaders. Tactics are a sturdy toolbox: heal, a draw tool, revive and two shields.
- **Notes:** Prize-winning list from the same event; the leaders match the blue-3/green-3 lists in the alternates.
- **Source:** https://www.torecolo.jp/shop/pg/1xsdeck049/ ; fetched 2026-10-30 ; Challengers Cup 2026 #3 OSAKA, 2026-08-08/09, prize-winning finish (入賞) ; method: page text (product-number image tags + counts)
- **Transcription doubt:** As C01. Two printings each of オーバードライブ (BP04-024/BP04-106) and リンク・アサルト (BP01-044/BP01-136) were merged into 4 copies each.

## C05 Red-3 Feast Rush  (赤3宴ラッシュ)

- **Leaders:** 蝶屋はなび (BP02-004, 赤/red, VSPO!); どぐら (BP02-014, 緑/green, CR); 緋月ゆい (BP03-003, 赤/red, Neo-Porte); 昏昏アリア (BP04-002, 赤/red, Neo-Porte)
- **Tactics:** アドレナリン (ST01-019), ジャミングパルス (BP01-093), パワーフィールド (BP03-077), サイバネアーマー (BP03-080), 呪いの人形 (BP04-080)
- **Main (50, ACE 8):** エレガントドミネート x4 (BP01-018), 圧倒的わたし！！ x3 (BP02-023), 大将の威厳 x4 (BP02-042), 初めての歓声 x4 (BP02-051), Just Eat Chicken! x4 (BP02-068), 1先の悪魔 x4 (BP02-070), ストームラッシュ x4 (BP03-017), ノーエスケープ x4 (BP03-018), ピアッシングバレット x4 (BP03-022), 強奪の宴 x4 (BP03-038), 祭典の開幕 x4 (BP03-050), 大旋風 x3 (BP04-039), なんだコイツ… x4 (BP04-049)
- **Game plan:** Red-3 plus どぐら hand-disruption rush: twelve cards that make the opponent discard, the storm ACE and the draw-and-discard ACE, and tactics that add damage for the whole round or force a discard. The author says it wins by hitting hard, with the discards as a by-product.
- **Notes:** Written up as the deck that left the strongest impression at the 2026-08-08/09 event; no placing is claimed. Leaders: two Neo-Porte, one VSPO!, one Crazy Raccoon.
- **Source:** https://xross-stars.com/deck/8b809aae-ce09-4703-ab3c-548c01da6764 ; fetched 2026-10-30 ; Yuyu-tei deck column "赤3宴ラッシュデッキ" (https://yuyu-tei.jp/show/xs/content/27347), 2026-08-27; author notes the archetype stood out at CC#3 OSAKA; deck-site list, not a placing ; method: official deck API
- **Transcription doubt:** Official deck API, exact. Not a placing; the column says only that it was met at the event.

## C06 Harvest Assault  (収穫アサルト)

- **Leaders:** 空澄セナ (BP01-013, 緑/green, VSPO!); Mondo (ST02-002, 赤/red, CR); 蝶屋はなび (BP02-004, 赤/red, VSPO!); うぉっか (BP04-001, 赤/red, CR)
- **Tactics:** ストラテジックレーダー (BP01-092), アドレナリン (ST01-019), ジャミングパルス (BP01-093), サイバネアーマー (BP03-080), 盗賊キット (BP02-078)
- **Main (50, ACE 8):** エレガントドミネート x4 (BP01-018), リンク・アサルト x4 (BP01-044), いたずらドローン x3 (BP01-047), 逃走成功 x4 (BP01-061), バトンを繋いで x4 (BP01-083), 圧倒的わたし！！ x4 (BP02-023), 初めての歓声 x4 (BP02-051), Just Eat Chicken! x4 (BP02-068), ワールドクラス x4 (BP04-020), 大旋風 x3 (BP04-039), 収穫の刻 x4 (BP04-066), リトルエンプレス x1 (BP04-067), 強さの証明 x3 (ST01-009), キリングスプリー x4 (ST02-008)
- **Game plan:** Harvest assault: the free-play chain ACE and the harvest ACE memoria (a free play of a cost-1 card after the attack, chosen by the attacker colour), with 空澄セナ's exclusive attack that wants two memoria in play. Aims for a two-turn win in round 3 by drawing heavily on turn one.
- **Notes:** Described as an archetype that sent many players to the playoffs at the 2026-08-08/09 event.
- **Source:** https://xross-stars.com/deck/fa624b09-99ac-433b-844e-139b46a895d0 ; fetched 2026-10-30 ; Yuyu-tei deck column "2キルの王・収穫アサルトデッキ" (https://yuyu-tei.jp/show/xs/content/27295), 2026-08-21; archetype met repeatedly in the CC#3 OSAKA day-2 rounds (https://yuyu-tei.jp/show/xs/content/27253); deck-site list, not a placing ; method: official deck API
- **Transcription doubt:** Official deck API, exact. Not a placing.

## C07 Zero-cost We-are Overdrive  (ODWe are...)

- **Leaders:** ありさか (BP01-014, 緑/green, CR); うぉっか (BP04-001, 赤/red, CR); 白波らむね (BP04-006, 青/blue, VSPO!); とおこ (BP04-012, 黄/yellow, REJECT)
- **Tactics:** ストラテジックレーダー (BP01-092), 復活ポータル (BP01-094), 救急キット (ST01-021), サイバネアーマー (BP03-080), 討伐クエスト (BP04-079)
- **Main (50, ACE 8):** スリフティプレイ x4 (BP01-048), 先導者の証 x2 (BP01-071), マシンガントーク x2 (BP02-040), 焦土の王者 x2 (BP02-054), Just Eat Chicken! x4 (BP02-068), We are...! x3 (BP03-059), 1TAP x4 (BP04-018), ワールドクラス x4 (BP04-020), オーバードライブ x3 (BP04-024), シンクロトリニティ x4 (BP04-028), シンリャク開始 x4 (BP04-037), 入念な準備 x4 (BP04-048), 穏やかな一時 x2 (BP04-053), でからむち♪ x4 (BP04-056), 雪降る夜に x4 (BP04-065)
- **Game plan:** Zero-cost chain deck: the We-are ACE, the blue discard ACE and Pioneer's Mark chain 0-cost cards, and about 28 cards draw. The plan is to find an ACE every turn and down three or more leaders in one turn; round 1 may be given up.
- **Notes:** Described as emerging at the 2026-08-08/09 event.
- **Source:** https://xross-stars.com/deck/53b7af20-d5d5-4d2a-a47c-a188f7ad442b ; fetched 2026-10-30 ; Yuyu-tei deck column "0コスでぶん回せ! ODWe are...!デッキ" (https://yuyu-tei.jp/show/xs/content/27451), 2026-09-10; column says the archetype emerged at CC#3 OSAKA; deck-site list, not a placing ; method: official deck API
- **Transcription doubt:** Official deck API, exact. Not a placing.

## C08 Absolute Dominion (BP05 sample)  (アブソ再臨)

- **Leaders:** 夢野あかり (BP04-003, 赤/red, VSPO!); 秋雪こはく (BP05-001, 赤/red, REJECT); かずのこ (BP02-006, 青/blue, CR); とおこ (BP04-012, 黄/yellow, REJECT)
- **Tactics:** アドレナリン (ST01-019), ストラテジックレーダー (BP01-092), サイバネアーマー (BP03-080), 電磁スモーク (BP05-076), 復活ビーコン (BP05-078)
- **Main (50, ACE 8):** 逆境の1ドット x4 (BP02-028), 美味しいよね x4 (BP02-056), 鬼の猛追 x4 (BP03-032), 1TAP x2 (BP04-018), タレットマスタリー x4 (BP04-022), シンリャク開始 x4 (BP04-037), ヤー！ x4 (BP04-050), 穏やかな一時 x4 (BP04-053), 雪降る夜に x4 (BP04-065), 対空射撃 x4 (BP05-020), アブソリュートドミニオン x4 (BP05-024), 超大型新人 x4 (BP05-048), 魔王再臨 x4 (BP05-059)
- **Game plan:** BP05 look-and-draw: the new blue ACE digs five deep for up to three 0-cost memoria, the yellow ACE is an echo memoria that replays free each turn, and the 3+-memoria boosts stack. Tactics include the new revive with a cost reduction and the new round-long tax on opposing tactics.
- **Notes:** Shop sample list built on BP05 cards; undated; not a tournament result.
- **Source:** https://www.torecolo.jp/shop/pg/1xsdeck050/ ; fetched 2026-10-30 ; CB Torecolo undated sample recipe built on BP05 cards (page exists on 2026-10-30; no tournament placing) ; method: page text (product-number image tags + counts)
- **Transcription doubt:** As C01. Undated. The sample page does not state an author or an event.

## C09 Hazard Climax (BP05 sample, LEO)  (ハザード極致)

- **Leaders:** 橘ひなの (BP01-003, 赤/red, VSPO!); LEO (BP05-004, 赤/red, CR); Mondo (ST02-002, 赤/red, CR); ハセシン (BP05-016, 緑/green, -)
- **Tactics:** アドレナリン (ST01-019), 救急キット (ST01-021), サイバネアーマー (BP03-080), 復活ビーコン (BP05-078), フォールダウンシールド (BP05-079)
- **Main (50, ACE 8):** エレガントドミネート x4 (BP01-018), だまし討ち x4 (BP01-023), 笑ってはいけない x4 (BP01-059), 逃走成功 x4 (BP01-061), ケーキのおうち x2 (BP02-047), Just Eat Chicken! x4 (BP02-068), デュアルハザード x4 (BP05-017), デアデビルラッシュ x4 (BP05-023), ロングレンジスナイプ x4 (BP05-044), 共に至る極致 x4 (BP05-045), ショッピングスプリー x4 (BP05-051), 一般通過 x4 (BP05-072), キリングスプリー x4 (ST02-008)
- **Game plan:** BP05 hazard rush: the new red ACE hits +40 and +40 more when the attacker is nearly dead, the memoria ACE trades 30 of your own damage for two cards, and LEO's exclusive cards refund a PP on an empty play area. Self-damage and low HP are the engine.
- **Notes:** Shop sample list built on BP05 cards; undated; not a tournament result.
- **Source:** https://www.torecolo.jp/shop/pg/1xsdeck051/ ; fetched 2026-10-30 ; CB Torecolo undated sample recipe built on BP05 cards (page exists on 2026-10-30; no tournament placing) ; method: page text (product-number image tags + counts)
- **Transcription doubt:** As C01. Undated.

## C10 Apex Double-Down (BP05 sample, VSPO!)  (頂点DD)

- **Leaders:** 神成きゅぴ (IGV) (BP05-009, 黄/yellow, VSPO!); 胡桃のあ (IGV) (BP05-010, 黄/yellow, VSPO!); Arya Kuroha (BP05-013, 緑/green, VSPO!); 花芽すみれ (IGV) (BP05-014, 緑/green, VSPO!)
- **Tactics:** 盗賊キット (BP02-078), サイバネアーマー (BP03-080), ライトシールド (ST01-023), アイテムショップ (BP04-076), フォールダウンシールド (BP05-079)
- **Main (50, ACE 8):** ダブルダウン x4 (BP05-031), 決闘開始 x4 (BP05-033), ジャンプスケア x4 (BP05-034), レイジングスラッシュ x4 (BP05-035), 頂点捕食者 x4 (BP05-038), 怒涛の勢い x2 (BP05-040), コールドスモーカー x4 (BP05-041), ブライトホーリー x4 (BP05-042), 起死回生 x4 (BP05-062), ミッドナイトトーク x4 (BP05-063), 二連覇の称号 x4 (BP05-068), 伝えたい想い x4 (BP05-069), ハイリスク・ハイリターン x4 (BP05-070)
- **Game plan:** Pure VSPO!, BP05 only: the new double-down ACE deals 100 to another leader when two memoria are out, the apex ACE chains another cheap attack for free, and each (IGV) leader has its own exclusive cards. The memoria-count (2+) condition is everywhere.
- **Notes:** Shop sample list built on BP05 cards; undated; not a tournament result. Uses the same-talent-different-leader-name rule (official news 207).
- **Source:** https://www.torecolo.jp/shop/pg/1xsdeck052/ ; fetched 2026-10-30 ; CB Torecolo undated sample recipe built on BP05 cards (page exists on 2026-10-30; no tournament placing) ; method: page text (product-number image tags + counts)
- **Transcription doubt:** As C01. Undated.

## Alternates (verified, not in the ten)

Same schema in `data/decklists-competitive.json` under `alternates`; all pass the same legality checks. Kept as spares because they duplicate an archetype or are older shop samples.

- **A01 Assault-Storm / rion Top-8** (もんなるりおん型アサルトラッシュ): leaders 橘ひなの, nqrse, Mondo, rion; Challengers Cup 2026 #3 OSAKA, 2026-08-08/09, Top 8 (Yuyu-tei report https://yuyu-tei.jp/show/xs/content/27253, 2026-08-13; the report author own list); https://xross-stars.com/deck/bf676adf-359b-4a6c-8367-fd8fdda17e09
- **A02 Blue-3 Overdrive Assault** (青3ODアサルト): leaders nqrse, ズズ, 紡木こかげ, 夜乃くろむ; Yuyu-tei column "クロスタ4弾環境デッキ分析" (https://yuyu-tei.jp/show/xs/content/27144), 2026-07-30; deck-site meta list; https://xross-stars.com/deck/09437d85-6168-4313-97c2-e0b12c769bac
- **A03 Green-3 Overdrive Assault** (緑3ODアサルト): leaders nqrse, ズズ, けんき, 乾伸一郎; Yuyu-tei column 27144, 2026-07-30; deck-site meta list; https://xross-stars.com/deck/161012f4-d8b9-4745-9df9-b831b0e91974
- **A04 Pioneer Storm (Okka)** (先導者ストーム): leaders Mondo, 蝶屋はなび, kinako, うぉっか; Yuyu-tei column 27144, 2026-07-30; deck-site meta list; https://xross-stars.com/deck/6307f7e6-e206-40ce-9890-56110c4aa3c1
- **A05 REJECT sample** (REJECT): leaders ズズ, とおこ, 天鬼ぷるる, 乾伸一郎; CB Torecolo undated sample recipe (BP04 era); https://www.torecolo.jp/shop/pg/1xsdeck044/
- **A06 Neo-Porte sample** (Neo-Porte): leaders 緋月ゆい, 柊ツルギ, 鬼ヶ谷テン, 絲依とい; CB Torecolo undated sample recipe (BP03 era); https://www.torecolo.jp/shop/pg/1xsdeck042/
- **A07 Farmer Storm sample** (ファーマーストーム): leaders うぉっか, 甘結もか, 藍沢エマ, 龍巻ちせ; CB Torecolo undated sample recipe (BP04 era); https://www.torecolo.jp/shop/pg/1xsdeck045/

## Union of card numbers across C01-C10

134 distinct card numbers (names are distinct too, because each name is mapped to one number). `data/cards.js` holds the 50 starter numbers; 8 of the union are already there (ST01-009, ST01-019, ST01-021, ST01-023, ST02-002, ST02-004, ST02-008, ST02-018); **126 are new**.

| type | total | already in cards.js | new | by product (new) |
|---|---|---|---|---|
| leader | 28 | 2 | 26 | BP01 4, BP02 4, BP03 4, BP04 7, BP05 7 |
| attack | 48 | 2 | 46 | BP01 7, BP02 8, BP03 8, BP04 10, BP05 13 |
| memoria | 42 | 1 | 41 | BP01 5, BP02 8, BP03 6, BP04 12, BP05 10 |
| tactics | 16 | 3 | 13 | BP01 3, BP02 1, BP03 3, BP04 3, BP05 3 |

All cards by product: BP01 19, BP02 21, BP03 21, BP04 32, BP05 33, ST01 4, ST02 4.

**leader** — BP01-003 橘ひなの, BP01-013 空澄セナ, BP01-014 ありさか, BP01-016 nqrse, BP02-004 蝶屋はなび, BP02-006 かずのこ, BP02-010 神成きゅぴ, BP02-014 どぐら, BP03-003 緋月ゆい, BP03-004 rion, BP03-005 ズズ, BP03-014 けんき, BP04-001 うぉっか, BP04-002 昏昏アリア, BP04-003 夢野あかり, BP04-006 白波らむね, BP04-008 夜乃くろむ, BP04-012 とおこ, BP04-013 乾伸一郎, BP05-001 秋雪こはく, BP05-004 LEO, BP05-009 神成きゅぴ (IGV), BP05-010 胡桃のあ (IGV), BP05-013 Arya Kuroha, BP05-014 花芽すみれ (IGV), BP05-016 ハセシン, ST02-002 Mondo*, ST02-004 Ras*

**attack** — BP01-018 エレガントドミネート, BP01-023 だまし討ち, BP01-043 ブービートラップ, BP01-044 リンク・アサルト, BP01-045 クレイジーバースト, BP01-047 いたずらドローン, BP01-048 スリフティプレイ, BP02-018 サイコフォートレス, BP02-023 圧倒的わたし！！, BP02-026 ドレッドフォーム, BP02-028 逆境の1ドット, BP02-032 アンストッパブル, BP02-035 デッドリーキャンプ, BP02-040 マシンガントーク, BP02-042 大将の威厳, BP03-017 ストームラッシュ, BP03-018 ノーエスケープ, BP03-022 ピアッシングバレット, BP03-023 影と道連れ, BP03-027 仁義なき抗争, BP03-032 鬼の猛追, BP03-038 強奪の宴, BP03-042 ブリーチングフォース, BP04-018 1TAP, BP04-020 ワールドクラス, BP04-022 タレットマスタリー, BP04-024 オーバードライブ, BP04-028 シンクロトリニティ, BP04-030 シールドスラム, BP04-037 シンリャク開始, BP04-038 アナイアレーション, BP04-039 大旋風, BP04-041 アースサーファー, BP05-017 デュアルハザード, BP05-020 対空射撃, BP05-023 デアデビルラッシュ, BP05-024 アブソリュートドミニオン, BP05-031 ダブルダウン, BP05-033 決闘開始, BP05-034 ジャンプスケア, BP05-035 レイジングスラッシュ, BP05-038 頂点捕食者, BP05-040 怒涛の勢い, BP05-041 コールドスモーカー, BP05-042 ブライトホーリー, BP05-044 ロングレンジスナイプ, ST01-009 強さの証明*, ST02-008 キリングスプリー*

**memoria** — BP01-059 笑ってはいけない, BP01-061 逃走成功, BP01-071 先導者の証, BP01-083 バトンを繋いで, BP01-088 モラルからのハミダシ, BP02-046 いただきま～す！, BP02-047 ケーキのおうち, BP02-051 初めての歓声, BP02-054 焦土の王者, BP02-056 美味しいよね, BP02-063 ギャルスタイル, BP02-068 Just Eat Chicken!, BP02-070 1先の悪魔, BP03-050 祭典の開幕, BP03-051 露骨な挑発, BP03-053 闘技場の主, BP03-055 22HZ♪, BP03-059 We are...!, BP03-070 大人気キッチンカー, BP04-048 入念な準備, BP04-049 なんだコイツ…, BP04-050 ヤー！, BP04-053 穏やかな一時, BP04-054 放課後補習組, BP04-056 でからむち♪, BP04-058 「またね」, BP04-061 通過儀礼, BP04-065 雪降る夜に, BP04-066 収穫の刻, BP04-067 リトルエンプレス, BP04-069 深淵の強者たち, BP05-045 共に至る極致, BP05-048 超大型新人, BP05-051 ショッピングスプリー, BP05-059 魔王再臨, BP05-062 起死回生, BP05-063 ミッドナイトトーク, BP05-068 二連覇の称号, BP05-069 伝えたい想い, BP05-070 ハイリスク・ハイリターン, BP05-072 一般通過, ST02-018 小さなビデオレター*

**tactics** — BP01-092 ストラテジックレーダー, BP01-093 ジャミングパルス, BP01-094 復活ポータル, BP02-078 盗賊キット, BP03-077 パワーフィールド, BP03-079 ターゲットフラッグ, BP03-080 サイバネアーマー, BP04-076 アイテムショップ, BP04-079 討伐クエスト, BP04-080 呪いの人形, BP05-076 電磁スモーク, BP05-078 復活ビーコン, BP05-079 フォールダウンシールド, ST01-019 アドレナリン*, ST01-021 救急キット*, ST01-023 ライトシールド*

(* = already in data/cards.js.) Tactics carry the PP Ticket and PP card separately; neither is counted.

Per-deck new-card load (cards not in cards.js): C01 21, C02 18, C03 22, C04 20, C05 21, C06 19, C07 23, C08 21, C09 18, C10 21.

## Effect patterns and keywords the starter set does not cover

Counted over the new cards only. "cards" = distinct new card numbers using the pattern; "decks" = how many of C01-C10 contain one. Patterns are text families; the engine work list is `docs/ABILITIES.md` (not implemented: Overkill, Echo, 【ラウンド中】, free play, equipment-granted 【アタック後】, look-at-deck) and `docs/card-text-grammar.md` section 3. Rows marked "in ABILITIES gap list" are known gaps; the others are not listed there.

| pattern | cards | decks | cards using it |
|---|---|---|---|
| Equipment base-HP override that depends on awakened state (サイバネアーマー) | 1 | 10 | サイバネアーマー |
| Optional "may" effect (してもよい) | 8 | 8 | リンク・アサルト, 仁義なき抗争, 収穫の刻, シンクロトリニティ, 対空射撃, 共に至る極致… |
| Look at top N of deck, take/play some, rest to trash (in ABILITIES gap list) | 5 | 8 | リンク・アサルト, 討伐クエスト, シンクロトリニティ, アブソリュートドミニオン, 頂点捕食者 |
| Condition: round number (このラウンドが3ラウンド目) | 3 | 8 | アンストッパブル, Just Eat Chicken!, ノーエスケープ |
| Free play (コストを支払わずにプレイ) (in ABILITIES gap list) | 4 | 6 | リンク・アサルト, 収穫の刻, 魔王再臨, 頂点捕食者 |
| Both players draw / both discard (すべてのプレイヤーは) | 3 | 6 | 逃走成功, モラルからのハミダシ, なんだコイツ… |
| Colour-count build rule (赤のリーダー3体以上) | 2 | 6 | エレガントドミネート, クレイジーバースト |
| Overkill N (オーバーキル) (in ABILITIES gap list) | 5 | 5 | ブリーチングフォース, 影と道連れ, デッドリーキャンプ, アースサーファー, ジャンプスケア |
| Reveal-and-discard from own hand for effect (公開し…捨て) | 3 | 5 | オーバードライブ, 対空射撃, 頂点捕食者 |
| Damage scaled per discarded card (捨てたアタック/メモリア1枚につき) | 2 | 5 | オーバードライブ, 復活ビーコン |
| Revive a downed leader (ダウンしていない状態に戻す) + trash its equipment | 2 | 5 | 復活ポータル, 復活ビーコン |
| Opponent discards from hand (hand-disruption) | 4 | 4 | ジャミングパルス, 大将の威厳, 強奪の宴, 呪いの人形 |
| Negative damage modifier (ダメージ-N, cost-0 attack) | 3 | 4 | ワールドクラス, スリフティプレイ, デアデビルラッシュ |
| Condition: attacker awakened (アタッカーが覚醒している) | 2 | 4 | サイコフォートレス, 大旋風 |
| Cost modifier (own/opp tactics cost +/-N, floor) | 3 | 3 | 電磁スモーク, 復活ビーコン, フォールダウンシールド |
| Flat damage to one opposing leader on play (【プレイ時】…ダメージ) | 3 | 3 | 収穫の刻, でからむち♪, 超大型新人 |
| Leader ATK +N for the turn (攻撃力を+30; ATK modifier on leaders) | 2 | 3 | 先導者の証, パワーフィールド |
| Condition: opponent has fewer downed leaders (play restriction, 復活) | 1 | 3 | 復活ポータル |
| Equipment granting a once-per-turn 【アタック後】 (盗賊キット) (in ABILITIES gap list) | 1 | 3 | 盗賊キット |
| Multi-attack card (several 【アタックする】, ストームラッシュ) | 1 | 3 | ストームラッシュ |
| Boost scaled by play-area memoria count | 4 | 2 | We are...!, 雪降る夜に, 美味しいよね, ヤー！ |
| Condition: play area attack-card count (アタックカードがN枚以上) | 2 | 2 | We are...!, ミッドナイトトーク |
| Random discard as optional cost (ランダムに捨ててもよい) | 2 | 2 | 仁義なき抗争, レイジングスラッシュ |
| Search deck for cost-0 non-ACE card to hand (look + reveal + add) | 2 | 2 | シンクロトリニティ, アブソリュートドミニオン |
| 【ラウンド中】 round-long effect (card stays in play) (in ABILITIES gap list) | 2 | 2 | パワーフィールド, 電磁スモーク |
| Condition: previous round lost (cost reduction -5) | 1 | 2 | フォールダウンシールド |
| Shuffle trash face-down cards back into deck (アイテムショップ) | 1 | 2 | アイテムショップ |
| IGV-variant leader name in build rule | 6 | 1 | ジャンプスケア, レイジングスラッシュ, ブライトホーリー, 起死回生, ミッドナイトトーク, ハイリスク・ハイリターン |
| Draw + opp discard on down (強奪の宴 etc.) | 2 | 1 | 大将の威厳, 強奪の宴 |
| Attack-after play of a hand card at cost 1 by attacker colour (収穫の刻) | 1 | 1 | 収穫の刻 |
| Attack-target restriction (アタックできるのは…だけ, ターゲットフラッグ) | 1 | 1 | ターゲットフラッグ |
| Condition: all own leader colours differ (リーダーの色がすべて異なる) | 1 | 1 | アナイアレーション |
| Condition: attacker colour (アタッカーが緑/赤なら) | 1 | 1 | 収穫の刻 |
| Condition: attacker damaged / remaining HP (アタッカーがダメージを受けている, 残り体力が10) | 1 | 1 | デュアルハザード |
| Condition: play area has no other cards (プレイエリアに他のカードがない) | 1 | 1 | デアデビルラッシュ |
| Echo (エコー: replay free each turn) (in ABILITIES gap list) | 1 | 1 | 魔王再臨 |
| Opponent tactics cost +1 for the round (電磁スモーク) | 1 | 1 | 電磁スモーク |
| Pay-with-own-leader-damage optional cost (体力40以上のリーダー…ダメージを与えてもよい) | 1 | 1 | 共に至る極致 |
| Round-long leader ATK +10 (パワーフィールド) | 1 | 1 | パワーフィールド |
| Self-damage to attacker with replacement (down -> HP 10) | 1 | 1 | ロングレンジスナイプ |

Already covered by the starter set (listed so nothing is double-counted): leader-name build rules (51 cards), the equipment +HP stat, memoria-count conditions on damage (2+), PP recovery (PP Ticket), plain boost/draw/damage/heal/loot. Needs a data check rather than a new op: colour-count build rules (エレガントドミネート, クレイジーバースト; rules.md section 3 defines them), build rules naming an (IGV) leader (6 cards, C10 only; exact-name matching per official news 207), 0-cost attacks and memoria, cost-2 attacks.

Extra single-card behaviours worth a test of their own: サイバネアーマー (base HP 140/170 depending on awakened state, in all ten decks), ストームラッシュ (three separate attacks, each choosing attacker and target), リンク・アサルト and 頂点捕食者 (look at the top 3/4, play one free, rest to trash; the played card resolves after the attack ends), 収穫の刻 (free play chosen by the attacker colour), 魔王再臨 (echo), 復活ポータル / 復活ビーコン (revive a downed leader; the cost-reduction variant needs cost modifiers), フォールダウンシールド (cost -5 if the previous round was lost), パワーフィールド / 電磁スモーク (round-long effects that stay in the play area).
