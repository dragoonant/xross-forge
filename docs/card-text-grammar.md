# Card-text grammar — Xross Stars effect vocabulary

What the engine's effect parser/authoring must cover. Counted over the full official card API dump (808 rows = 450 distinct card names; name and effect are 1:1, so parallels and reprints never differ in text) (API). Counting script: `tools/out/grammar.py` (gitignored), run as `python3 -I tools/out/grammar.py docs/sources/api/all-cards.json tools/out`; its TSV outputs (`grammar-tags.tsv`, `grammar-sentences.tsv`, `grammar-patterns.tsv`, `grammar-unmatched.txt`) are the raw tables behind this page.

Columns: **unique** = distinct card names using it; **rows** = API rows (incl. parallels/reprints); **ST** = appears in starter deck ST01 or ST02 (the first playable slice). Numbers in patterns are normalised to N. Meanings cite the manual where it defines the term, otherwise the card's own reminder text. Rule references are to `docs/rules.md` (§) and `docs/rulings.md` (R-).

## 1. Timing / keyword tags 【…】

| Tag | rows | unique | ST names | Meaning |
|---|---|---|---|---|
| 【アタックする】 | 237 | 158 | 15 | The attack: choose attacker + attacked leader, compute ATK + boosts + "damage ±", place counters (PM p.07, p.12). Text after it modifies the damage or adds an attack-step effect. 101 cards have nothing after it. Every attack card has it and only attack cards do; ストームラッシュ (BP03-017) has it 3 times (3 attacks; R-025), which is why rows = 233 attack rows + 4. |
| 【覚醒時】 | 225 | 92 | 8 | Resolves when this leader awakens (PM p.08). Every leader has exactly one, and no other card type has it (API). |
| 【アタック後】 | 201 | 132 | 13 | Resolves after the attack's damage; multiple ones are ordered by the turn player (PM p.07, p.12, Q6). On memoria/tactics it applies to the attack that card boosted (PM p.15 Q6). Can be granted by equipment (R-028). |
| 【アタック強化】 | 200 | 130 | 14 | Attack Boost: adds damage to your next attack only; stacks (PM p.09). On memoria and consumable tactics. |
| 【プレイ時】 | 155 | 91 | 8 | Resolves when the card is played, top to bottom (PM p.07, p.09, p.10). Also on equipment (ヒーリングオーブ; R-039). |
| 【ラウンド中】 | 2 | 2 | 0 | Continuous for the rest of the round; the card stays in the play area ("not trashed at end of turn") (パワーフィールド BP03-077, 電磁スモーク BP05-076). **Not defined in the manual.** |

Untagged ability lines (no 【】): static/continuous text — equipment stat lines, play/deckbuilding restrictions, cost modifiers, Echo, replacement effects (§3 families `stat-mod`, `cost-mod`, `free-play-cond`, `echo`, `equip-grant`, and the 9 one-offs in §6).

## 2. Keywords and conventions in card text

| Keyword / phrase | unique | ST | Meaning (source) |
|---|---|---|---|
| 対戦相手の**他の**リーダー | 84 | 10 | opposing leaders other than the one that received this attack (PM p.14 Q2–Q3, p.16 Q8) |
| このアタックを受けたリーダー | 44 | 4 | the attacked leader of the current attack; "…がダウンしているなら" is true only if downed by 【アタックする】 damage (PM p.14 Q3) |
| オーバーキルN： | 15 | 0 | bonus if the attacked leader was dealt damage ≥ N more than its remaining HP (card reminder text; R-005). Not in manual. |
| エコー | 4 | 0 | at turn end an upright copy turns sideways instead of trashing; next main-phase start, a sideways copy is replayed free (reminder text; R-024). Not in manual. |
| この効果はターンに1回しか発動しない | 3 | 0 | once per turn per source (equipment-granted; R-029). Not in manual. |
| エース以外の | 3 | 0 | "non-ACE" filter (ACE defined PM p.13) |
| ダメージ-N | 5 | 0 | negative damage term (PM p.12; floor R-016) |
| 「VSPO!」を持つ / 「CR」を持つ | 2+2 | 4 | leader has that tag (tag field PM p.02; **not in API**, R-031) |
| 色 (アタッカーが青なら, 同じ色を持つ, 色がすべて異なる) | 3 | 0 | leader colour checks (`card_color`) |
| Nラウンド目なら | 4 | 1* | current round number (*ST: the PP Ticket's deck text "1ラウンド目") |
| 対戦相手は… | 10 | 0 | the opponent performs/chooses (R-021) |
| すべてのプレイヤーは… | 4 | 0 | both players, turn player first (R-021) |
| ランダムに | 2 | 0 | engine RNG |
| 横向き / 縦向き (of a play-area card) | 4 | 0 | Echo state |
| 装備 / これを装備しているリーダー | 10 | 0 | equipment and its host |
| 覚醒させる | 1 | 0 | awaken by effect (名誉のバッジ BP05-077) |
| （…） reminder text | 46 sentences | yes | non-rules explanation; parse only for disambiguation |
| N体 | — | — | always "1体" (265 uses) except "3体" (4, a down-count condition) and "最大2体" (2) |

## 3. Effect sentence patterns, by frequency

Each card effect is split into clauses by tag and sentences by 。(outside 「」/（）). 167 distinct normalised sentence templates; grouped into families below (first-match regex order in the script).

| # | Family | unique | rows | ST | Template(s) | Gloss |
|---|---|---|---|---|---|---|
| 1 | boost | 121 | 173 | ✔ | 【アタック強化】次のアタックのダメージ+N。 | next attack +N |
| 2 | empty-attack | 101 | 155 | ✔ | 【アタックする】 (nothing) | plain attack |
| 3 | draw | 53 | 97 | ✔ | カードをN枚引く。 (【プレイ時】29, 【覚醒時】20, 【アタック後】4) | draw N |
| 4 | dmg-opp-1 | 38 | 79 | ✔ | 対戦相手のリーダー1体にNダメージ。 (【覚醒時】26, 【プレイ時】12) | N damage to one opposing leader |
| 5 | dmg-cond | 36 | 47 | ✔ | 【アタック後】<cond>なら、対戦相手の他のリーダー(1体/すべて)にNダメージ。 | conditional splash; conds: memoria count in play area (24), attacked leader downed (7), hand ≤ N (1), round N, attacker colour, card of cost N in play area, 「攻撃要請」 in trash, all leader colours differ |
| 6 | dmg-any | 29 | 39 | | conditional "ダメージ+N" variants on 【アタックする】/【アタック強化】 (さらに…, そうしたなら…, アタッカーが覚醒している/装備している/ダメージを受けている, プレイエリアに他のアタックカード/タクティクス, 捨てた/公開した…につき), ダメージ-N, 対戦相手のダメージを受けている他のリーダーすべてに | misc damage modifiers |
| 7 | draw-any | 29 | 42 | ✔ | このアタックを受けたリーダーがダウンしているなら、カードをN枚引く。 (12, ST); 自分のリーダーがN体ダウンしているなら…引く (2, ST); プレイエリアにアタックカードがN枚以上あるなら…引く (5); Nラウンド目なら…; 公開したカードのコストと同じ数…; メモリアのコスト合計と同じ数… | conditional draw |
| 8 | dmg-plus | 28 | 37 | ✔ | 【アタックする】ダメージ+N。 | this attack +N |
| 9 | loot | 27 | 53 | ✔ | カードをN枚引き、手札をN枚捨てる。 (【覚醒時】18, 【アタック後】5 ST, 【プレイ時】4) | draw then discard |
| 10 | heal-1 | 27 | 64 | ✔ | 自分のリーダー1体をN回復する。 (【覚醒時】19, 【プレイ時】8) | heal one own leader N (capped, PM Q9) |
| 11 | dmg-other-1 | 26 | 43 | ✔ | 【アタック後】対戦相手の他のリーダー1体にNダメージ。 | splash to one other opposing leader |
| 12 | reminder | 24 | 41 | ✔ | （…） | reminder text |
| 13 | overkill | 15 | 18 | | 【アタック後】オーバーキルN：<effect>。 (他のリーダー1体にN ×6, PPをN回復 ×5, カードをN枚引く ×2, 自分のリーダー1体をN回復 ×2) | Overkill bonus |
| 14 | overkill-reminder | 15 | 18 | | （このアタックを受けたリーダーに、そのリーダーの残り体力よりもN以上大きいダメージを与えていたなら、…） | Overkill definition |
| 15 | dmg-plus-cond | 15 | 25 | | 【アタックする】<cond>なら、ダメージ+N。 (アタッカーが覚醒している ×4, そのカードがメモリア/アタック, Nラウンド目, プレイエリアに…) | conditional +N |
| 16 | look | 14 | 21 | | 自分の/対戦相手のデッキの上からN枚を見る/公開する。 | look/reveal top N (deck-shortfall rule PM Q1) |
| 17 | to-trash | 14 | 22 | | 残りのカードを/公開したカードを/それらのカードをトラッシュに置く。 | follow-up to look/reveal |
| 18 | discard | 13 | 19 | | 対戦相手は手札をN枚捨てる (5), すべてのプレイヤーは手札をN枚捨てる (2), 手札をN枚捨てる, …公開し、捨ててもよい | discard |
| 19 | reveal | 12 | 19 | | 自分の手札の…を公開する/公開してもよい; その中から…を公開し、手札に加える | reveal from hand/looked cards |
| 20 | dmg-opp-all | 11 | 30 | ✔ | 対戦相手のリーダーすべてにNダメージ。 (【覚醒時】9, 【プレイ時】2) | N to every opposing leader |
| 21 | dmg-other-all | 10 | 21 | ✔ | 【アタック後】対戦相手の他のリーダーすべてにNダメージ。 | splash to all other opposing leaders |
| 22 | boost-other | 7 | 9 | | 【アタック強化】プレイエリアにメモリアカードがN枚以上あるなら、次のアタックのダメージ+N。 | conditional boost (checked at boost time, R-051) |
| 23 | pp-any | 5 | 8 | | プレイエリアに他のカードがないなら、PPをN回復する (3); 公開したカードのコストがすべて異なるなら、PP…; このアタックを受けたリーダーがダウンしているなら、PPをN回復し、カードをN枚引く | conditional PP untap |
| 24 | free-play | 4 | 9 | | …コストを支払わずにプレイ(する/してもよい) | free play from hand/deck (R-044) |
| 25 | stat-mod | 4 | 7 | ✔ | 体力+N (3, ST ライトシールド), 攻撃力+N (1) | equipment static stat |
| 26 | echo | 4 | 8 | | エコー（…） | Echo keyword |
| 27 | cost-mod | 4 | 4 | | このカードのコストを-N/+N; コストはNまでしか下がらない; 対戦相手のタクティクスカードのコストを+N | cost modifiers (R-034) |
| 28 | free-play-cond | 3 | 3 | | プレイエリアに別の「X」がN枚あるなら、コストを支払わずにこのカードをプレイしてもよい。（N枚以上あるときはコストを支払う。） | self free-play (壁ジャンプ, 引っ張り合い, ロケットシャワー) |
| 29 | equip-grant / grant | 3+3 | 7 | | これを装備しているリーダーは以下の能力を持つ。「【アタック後】…」 | equipment grants an ability (R-028) |
| 30 | atk-mod | 2 | 4 | | このターン/このラウンド、自分のリーダーすべての攻撃力を+Nする。 | temporary ATK (R-043) |
| 31 | heal-total | 2 | 8 | ✔ | 自分のリーダーを合計N回復する。（複数のリーダーを選んでもよい。） | distribute N healing |
| 32 | revive | 2 | 4 | | ダウンしている自分のリーダー1体を、ダウンしていない状態に戻す。 | revive (targets a downed leader; PM Q10) |
| 33 | down | 2 | 2 | ✔ | 自分のリーダーすべてが「X」を持つなら、このアタックを受けたリーダーはダウンする。 | instant down (R-026) |
| 34 | dmg-per | 2 | 2 | ✔ | 対戦相手の他のリーダー1体に、自分の「X」を持つリーダー1体につき10ダメージ。 | per-tag damage |
| 35 | replay | 2 | 5 | | プレイし直す (三銃士, グレイトフルファーマー) | replay a play-area card |
| 36 | distribute | 2 | 4 | | …Nダメージを、対戦相手のリーダーに好きなように割り振って与える。 / このカードは、Nダメージまでしか割り振れない。 | distribute damage |
| 37 | base-hp | 2 | 8 | | これを装備しているリーダーが覚醒して(いない/いる)なら、基本の体力はNになる。 | set base HP (サイバネアーマー) |
| 38 | dmg-plus-per | 2 | 4 | | …につき、ダメージ+N | per-X damage + |
| 39 | self-damage | 2 | 3 | | アタッカーにNダメージ。（このダメージによってアタッカーがダウンするなら、代わりに残り体力をNにする。）; 自分の体力N以上のリーダー1体にNダメージを与えてもよい。 | damage own leader (R-042) |
| 40 | pp-draw | 1 | 4 | ✔ | PPをN回復し、カードをN枚引く。 (エナジーチャージャー — BANNED) | untap + draw |
| 41 | pp | 1 | 9 | ✔ | PPをN回復する。 (PPチケット) | untap N PP (capped, PM Q9) |
| 42 | heal-any | 2 | 3 | | other healing wordings | |
| 43 | to-hand | 1 | 1 | | その中からカードN枚を手札に加える。 | tutor |
| 44 | awaken | 1 | 1 | | 自分のリーダー1体を覚醒させる。 | awaken by effect |
| — | UNMATCHED | 11 | 32 | ✔ | see §6 | one-offs |

## 4. Conditional prefixes and modifiers

| Condition | unique sentences | ST | Gloss |
|---|---|---|---|
| …なら、 (generic "if") | 128 | ✔ | condition checked when that sentence resolves (PM p.15 Q6) |
| （…） reminder text | 46 | ✔ | — |
| プレイエリアに<type>カードがN枚以上あるなら | 43 | ✔ | count cards of a type in (own) play area (R-022); for boosts counted at boost time (R-051) |
| このアタックを受けたリーダーがダウンしているなら | 24 | ✔ | PM p.14 Q3 |
| …してもよい ("may") | 21 | | optional — the engine must offer a yes/no choice, never auto-pick |
| …につき ("per") | 7 | ✔ | multiplier |
| アタッカーが覚醒しているなら | 5 | | attacker state |
| コストN以下の | 4 | | cost filter |
| 「X」を持つ (tag) | 4 | ✔ | tag check (R-031) |
| 自分のリーダーがN体ダウンしているなら | 2 | ✔ | own down count (ST 登頂成功 / 福男: "3体") |
| 自分のリーダーすべてが「X」を持つなら | 2 | ✔ | all-tag check (クロスファイア, 魔王降臨) |
| 自分の手札がN枚以下なら | 1 | ✔ | hand size at resolution (カウンタースナイプ, the PM Q6 example) |
| そうしたなら ("if you did") | 10 occurrences | | follows an optional cost (discard/reveal/self-damage) |
| さらに ("additionally") | 8 occurrences | | stacks a second +N on the same line |

## 5. Starter slice (ST01 + ST02) — what the first playable build needs

ST01 『初の栄冠』 (VSPO!: blue 一ノ瀬うるは, 小雀とと; green 花芽すみれ, 花芽なずな) and ST02 『魔王降臨』 (CR: red Selly, Mondo; yellow Cpt, Ras), 25 numbers each incl. 5 tactics, the PP Ticket and a PP card (API). Tags used: 【アタックする】, 【アタック後】, 【アタック強化】, 【プレイ時】, 【覚醒時】 (no 【ラウンド中】, no Overkill, no Echo). Families needed (✔ in §3): boost, empty-attack, draw, dmg-plus, dmg-opp-1, dmg-opp-all, dmg-other-1, dmg-other-all, dmg-cond (memoria count ≥ N; attacked leader downed; hand ≤ N), draw-any (attacked leader downed; own leaders downed = 3), loot, heal-1, heal-total (救急キット, distribute 80), stat-mod (ライトシールド 体力+30, equipment), down (クロスファイア / 魔王降臨 tag check), dmg-per (初の栄冠 / 変わらない関係 per-tag), pp (PPチケット), pp-draw (エナジーチャージャー, BANNED in sanctioned play), plus the PP Ticket's two deck/setup rule lines.

Every ST effect: see `tools/out/grammar-sentences.tsv` rows marked `ST` (28 templates).

## 6. Unmatched one-offs (need bespoke code)

| Card | Text gist |
|---|---|
| 大黒柱 BP01-020 (2 names) | 【アタックする】 may discard N; そうしたなら damage +N |
| 仁義なき抗争 BP03-027 (2 names) | 【アタックする】 may discard N at random; そうしたなら … |
| 復活ポータル BP01-094 | playable only if you have more downed leaders than the opponent |
| PPチケット BP01-097/ST01-024/ST02-024 | can't be put in a tactics deck; placed by the round-1 second player (setup rule, rules §5) |
| 巡り合う二人 BP02-045 | play up to N memoria and N attack (cost ≤ N) free in any order |
| メカニカルエキスパート BP03-045 | move 1 equipment to another own leader (treated as a new card, R-052) |
| ターゲットフラッグ BP03-079 | equipped leader must be attacked if it can be (attack-target restriction) |
| アイテムショップ BP04-076 | shuffle all face-down trash into the deck (no penalty, R-019) |
| 追加マガジン BP03-076 | replacement: returns to the tactics area instead of the trash |

## 7. API data gaps the engine must fill elsewhere

1. **Tags / affiliation** (「VSPO!」, 「CR」, printed under the leader name, PM p.02): **no API field**. Needed by 4 ST cards (クロスファイア, 初の栄冠, 魔王降臨, 変わらない関係). Source: hand-maintained `data/` table keyed by leader `family_id`, verified against card images (ST01 leaders = VSPO!, ST02 leaders = CR per PM p.02/p.08/p.10 images showing "VSPO!" under 花芽すみれ and "CR" under Mondo/Selly). Other leaders' tags must be read from card images (R-031).
2. **Equipment stats**: printed ATK/HP boxes (PM p.10) are `null` in `atk`/`hp`; the value is only in `effect` text ("体力+30", "攻撃力+10"). Parse from text.
3. **PP cards** (`card_type` `pp`, 57 rows) have no `effect` key at all (not empty string) — handle the missing key.
4. **Leader effect per face**: API gives one `effect`; the manual images show the same text on both faces (PM p.02, p.08). If a future leader differs per face, the API cannot express it.
5. **Colour**: single `card_color` per card; text like "同じ色を持つ" anticipates multi-colour cards that the API cannot represent today.
6. **ACE**: `is_ace` boolean (no icon data needed). **Build rules**: `build_rule.type` ∈ {`require_leader` (210 rows; `family_id` matches the leader's `family_id`, verified 0 mismatches), `require_card_color` (18 rows; colour only in Japanese `description`, parse "赤/青/緑/黄のリーダー3体以上")}.
7. **Keyword definitions** (オーバーキル, エコー, 【ラウンド中】, once-per-turn) exist only as card reminder text; there is no keyword field.
8. **Limited/BAN status** is not in the API; it comes from the LB page (rules.md, Edition and leak list).
9. **Rulings/FAQ**: no API field; the official online FAQ was not among M0 sources.
10. **Release dates**: `release_date` is a data timestamp, not necessarily the street date (rules.md, Edition and leak list).
