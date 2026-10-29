# Xross Stars — rules authority for xross-forge

xross-forge is an unofficial, non-commercial fan reproduction (credit: evilgouki). This file is the engine's rules contract: the engine implements what is written here and nothing more. Everything is restated in our own words; Japanese terms appear only as glossary keys. Ambiguities are not settled here but in `docs/rulings.md` (referenced as `R-0NN`). The effect-text vocabulary lives in `docs/card-text-grammar.md`.

## Sources and citation keys

| Key | Source | Edition |
|---|---|---|
| **PM p.N** | Official *Playing Manual*, `XrossStars_PlayingManual_260409` (PDF title; cover reads "VER.20260409"), 19 PDF pages. **p.N is the page number printed in the page's top-left box**, which is the PDF page minus 1 (rendered image `pm-(N+1).png`). Printed pp.01–17 hold content; PDF p.1 is the cover and PDF p.19 the back cover (QR code only). | 2026-04-09 |
| **PM toc** | Contents list on printed p.01 | same |
| **QM** | Official *Quick Manual*, single sheet, PDF title `XrossStars_QuickManual_250813` | 2025-08-13 |
| **SHEET** | Official play sheet, PDF title `XrossStars_Playseat_250813` | 2025-08-13 |
| **FR §N** | Tournament *Floor Rules* (フロアルール), section N | v1.0.4, last updated 2026-07-17 |
| **LB** | Official Limited/BAN page | updated 2026-07-13 |
| **API** | `https://api.xross-stars.com/v1/cards` dump, 808 rows | fetched for M0 |
| **TM** | torecamap.co.jp beginner column (third-party, secondary; published 2026-08-28, updated 2026-09-29) | — |

Where the manual does not answer a question, the line says **manual silent** and points to a ruling. The primary authority order is: card text > PM > QM > FR (tournament procedure only) > TM. Card text beats the rules when they conflict (PM p.17 Q10).

---

## 1. Game overview

- Two players. Each fields a team of 4 leaders and fights the opposing team over a series of rounds (PM p.01).
- Leaders attack the opposing leaders by means of attack cards from the 50-card deck; the attacks deal damage (PM p.01).
- Knocking out (downing) every opposing leader wins the round (PM p.01, PM p.05, PM p.11).
- After a round, all leaders are restored and a new round begins. The first player to win 2 rounds wins the match (PM p.01, PM p.05, PM p.11). This is the **full match** (best of three). A one-round **quick match** also exists (§7).
- Equipment needed per player: 4 leader cards, a 5-card tactics deck, a 50-card deck (attack + memoria), 5 Play Point cards, 1 "PP Ticket" card, and damage counters (PM p.03). The QM shows counters in denominations 10, 50 and 100 (QM). PP cards, the PP Ticket and counters may be replaced by any substitute the opponent agrees to (PM p.17 Q12); in sanctioned events only for listed event types (FR §5).

## 2. Card types and printed fields

Card types (PM toc, PM pp.02–03; API `card_type.internal_id`):

| Type (JP) | API id | Where it lives | Count in API |
|---|---|---|---|
| リーダー Leader | `leader` | leader zone, 4 per player | 225 rows |
| アタック Attack | `attack` | deck/hand | 233 |
| メモリア Memoria | `memoria` | deck/hand | 219 |
| タクティクス Tactics | `tactics` | tactics deck/area | 74 |
| プレイポイント Play Point (PP) | `pp` | PP zone | 57 (no effect text) |
| PPチケット PP Ticket | `tactics` (named PPチケット) | tactics area, second player of round 1 only | — |

### 2.1 Leader card (PM p.02)

- Double-sided: a **pre-awakening** face and an **awakened** face (PM p.02). The awakened face carries an awakening icon; the pre-awakening face does not (PM p.02).
- Printed fields: card type label; card effect (the leader's ability); card name; colour; **tag** (affiliation, e.g. "VSPO!", "CR", printed under the name); **HP** (体力: the leader is downed by damage equal to or above it); **ATK** (攻撃力: the damage dealt when it attacks an opposing leader) (PM p.02).
- API: `atk`/`hp` (pre-awakening), `awaken_atk`/`awaken_hp`, `effect`, `card_color`, `family_id` (one per leader name). Every leader in the API is either 30/100 → 40/130 (95 rows) or 30/110 → 40/140 (130 rows), and every leader's effect is a single 【覚醒時】 ability (API). **The tag is not in the API** (see card-text-grammar.md §5).
- The effect text is the same on both faces (PM p.02 and p.08 show identical text on both faces of 花芽すみれ and Mondo).

### 2.2 Attack and memoria cards (PM p.02)

- Printed fields: card type; card name; colour; **cost** (PP needed to play it); card effect (what happens when used); **build rule** (deck-inclusion condition, only on some cards) (PM p.02).
- Some carry an **ACE icon**; ACE cards are capped at 8 per deck (PM p.13).
- API: `cost`, `effect`, `card_color`, `is_ace`, `build_rule {type, description, family_id}`.

### 2.3 Tactics cards (PM p.03, p.10)

- Printed fields: cost; **subtype** icon (消費 consumable / 装備 equipment); card type; card name; effect (PM p.03, PM p.10).
- API: `tactics_type` = `consumption` (56 rows) or `equipment` (19 rows); all tactics are colourless (API).
- Equipment stat bonuses (e.g. ライトシールド's HP +30) are printed as ATK/HP boxes on the card (PM p.10) but the API has `atk`/`hp` = null for equipment; the bonus appears only as text in `effect` ("体力+30", "攻撃力+10") (API).

### 2.4 Play Point card (PM p.03, p.06)

- No effect. Upright = available PP; sideways = spent (PM p.06). The number of PP cards in your PP zone is your PP for the turn (PM p.04, PM p.11).

### 2.5 PP Ticket (PM p.03, p.05; API ST01-024)

- A special tactics card usable only by the player going second (PM p.03).
- Card text: cannot be put in a tactics deck; after round-1 tactics selection, the second player places it in the tactics area; 【プレイ時】 untap 1 PP (API ST01-024 / PM p.03).
- Cost 0, consumable (API).

## 3. Deck construction (PM p.13)

1. **Leaders:** choose exactly 4 leader cards, all with different names (PM p.13).
2. **Deck:** exactly 50 cards, attack and memoria only (PM p.02, PM p.13).
   - **Colour rule:** a card may be included only if it shares a colour with at least one of your leaders (PM p.13). All attack/memoria cards in the API have a colour (none are colourless) (API).
   - **Copy limit:** at most 4 copies of the same card, "same card" meaning same name (PM p.13).
   - **ACE limit:** at most 8 ACE cards in total (PM p.13). API flags 94 ACE rows (49 attack, 45 memoria); no leader or tactics card is ACE (API).
   - **Build rules:** a card whose build rule is not met cannot be included (PM p.13). Two kinds exist (API):
     - `require_leader` "リーダー：X" — one of your leaders must be X (210 rows) (PM p.13 example 1).
     - `require_card_color` "C のリーダー3体以上" — at least 3 of your leaders must be colour C (18 rows) (PM p.13 example 2).
3. **Tactics deck:** exactly 5 tactics cards, all different names (PM p.03, PM p.13). The PP Ticket cannot be included (PM p.03 card text).
4. **Limited / BAN** (LB, sanctioned events): a *Limited* card may appear at most 2 times in the deck; a *BAN* card may not be included. Only ACE cards, neutral cards and tactics cards can be designated; leader cards and leader-specific cards never are (LB). Current list: see *Edition and leak list* at the end.
5. A deck-construction violation in a sanctioned event is a match loss (FR §8).
6. Sleeves: deck and tactics deck must use visually distinct sleeves; at most triple-sleeved; leaders, PP and tactics may use toploaders (FR §5). Engine: n/a.

## 4. Zones and the play sheet

Per player (PM p.04; SHEET; QM). Layout, top row left→right then bottom:

```
+-------+----------------------------------+-------+
| TRASH |           PLAY AREA              | DECK  |
| (04)  | (03) cards placed left -> right  | (01)  |
+-------+----------------------------------+-------+
   [LEADER 02] [LEADER 02] [LEADER 02] [LEADER 02]   (upright; a landscape outline behind each slot = downed position)
+---------+--------------------------------+--------+
| TACTICS |         PLAY POINT (07)        |TACTICS |
| AREA(06)| R1: 3PP / R2: 4PP / R3: 5PP     |DECK(05)|
+---------+--------------------------------+--------+
```

| # | Zone | Rules |
|---|---|---|
| 01 | Deck | face down (PM p.04) |
| 02 | Leaders | one card per slot, 4 slots (PM p.04). Downed leaders are turned sideways (PM p.08). Equipment is attached to a leader (PM p.10). |
| 03 | Play area | cards being played go here, ordered left to right in play order (PM p.04, PM p.06, PM p.07, PM p.09) |
| 04 | Trash | cards go here face **down**, except tactics cards, which go face **up** (PM p.04, PM p.06) |
| 05 | Tactics deck | face down (PM p.04) |
| 06 | Tactics area | one card placed at the start of each round (PM p.04, SHEET) |
| 07 | Play points | PP cards; 3 in round 1, 4 in round 2, 5 in round 3 (PM p.04, SHEET) |
| — | Hand | hidden from the opponent (PM p.04) |

Visibility:
- Face-down trash cards may not be looked at by anyone, owner included; face-up trash cards (tactics) are open to both players (PM p.16 Q7, PM p.06).
- A player may look at their own face-down tactics cards (tactics deck and, by the same wording, the tactics area) at any time (PM p.05). The opponent may not (manual silent on opponent; implied by face-down). See R-033.
- Trash pile is laid out so the opponent can see the face-up cards (PM p.06).

## 5. Setup (PM p.05; QM)

In this order (PM p.05):
1. Place the 4 leaders pre-awakening side up.
2. Place the tactics deck (5) face down.
3. Shuffle the deck and place it face down. (Tournament: opponent then cuts or lightly shuffles, FR §6.)
4. Place 3 PP cards.
5. Rock-paper-scissors; the winner chooses to go first or second in round 1.
6. Each player secretly picks 1 card from their tactics deck and places it face down in their tactics area.
7. The second player additionally places the PP Ticket face up in their tactics area.
8. Each player draws 4 cards.

- No mulligan (PM p.17 Q14).
- Round 1 begins with the first player's turn (PM p.05).

## 6. Win conditions

- **Round:** reduce all of the opponent's leaders to downed (PM p.05, PM p.11). The round ends the moment either player's leaders are all downed (PM p.11), via the procedure in §12.
- **Match (full):** first to 2 round wins (PM p.05, PM p.11).
- **Match loss by tactics-deck exhaustion:** if a reshuffle penalty must take a tactics card and the tactics deck is empty, that player loses the match (PM p.14 Q1; QM).
- If both players meet a match-loss condition at the same time, both lose (PM p.17 Q11).
- Concession: always for the whole match, never a single round (FR §7).
- Tournament time limit: when time is called and the match is unfinished, both players lose regardless of rounds won, unless the event defines otherwise (FR §7). Recommended limits: quick match 15 min; full match 35–40 min depending on event (FR §7). Engine: optional.

## 7. Full match vs quick match

| | Full match | Quick match |
|---|---|---|
| Rounds | best of 3; first to 2 (PM p.05) | 1 round; its winner wins the match (PM p.05) |
| Second player's extra card | PP Ticket face up in tactics area (PM p.05) | a **second** tactics card from the tactics deck instead; PP Ticket unused (PM p.05) |
| PP | 3 / 4 / 5 by round (PM p.04) | 3 (only round 1 exists; PM p.04; R-046) |

## 8. Turn structure (PM p.06; QM; SHEET)

Players alternate turns. Each turn has three phases.

### 8.1 Start phase
1. Untap all PP cards (turn them upright) (PM p.06).
2. Draw 1 card (PM p.06). The first player **does** draw on their first turn (PM p.17 Q13).

Echo (エコー) cards left sideways in the play area are replayed at the start of the main phase (card reminder text; see §14 and R-024).

### 8.2 Main phase
In any order and any number of times, as PP allows (PM p.06):
- play an attack card from hand (§9);
- play a memoria card from hand (§10);
- play a card from the tactics area (§11) — **at most one per turn**, and **not on the first player's first turn** (PM p.06, PM p.10; see R-008 for "first turn" per round).

Playing = using a card (PM p.06). To play a card you pay PP equal to its cost; each PP card turned sideways pays 1 (PM p.06). A card whose cost you cannot pay cannot be played (implied; manual silent on the exact prohibition — R-034).

### 8.3 End phase (PM p.06)
1. Move every card in your play area to your trash face down, except tactics cards, which go face up (PM p.06). Exceptions written on cards (e.g. "not trashed at end of turn", Echo) apply (PM p.17 Q10; card text).
2. **Draw cards equal to your unused PP** (the number of PP cards still upright) (PM p.06; QM; SHEET).
3. If your hand has more than 7 cards, discard to your trash until you have exactly 7 (PM p.06). The hand limit is checked only here (manual silent on any other time — R-020).

Then the opponent's turn begins (PM p.06). There is no obligation to attack or to spend PP; ending the main phase is always allowed (manual silent — R-048).

### 8.4 Does the opponent ever act on your turn?
- The manual describes no response window, no interrupts and no opponent-side timing: only the turn player plays cards (PM p.06; manual silent on responses). Equipment and other static texts apply continuously (PM p.10).
- The opponent only makes choices when an effect explicitly tells them to (e.g. "対戦相手は手札をN枚捨てる"), and in physically drawing a random tactics card for you during a reshuffle penalty if you use that method (PM p.14 Q1). Engine: R-021.
- Card choices of the turn player include ordering simultaneous 【アタック後】 effects (PM p.12, PM p.15 Q6).

## 9. Playing an attack card and the exact order of an attack

### 9.1 Basic procedure (PM p.07)
1. Pay PP equal to the cost.
2. Put the card face up in the play area, to the right of any cards already played this turn.
3. Resolve its 【プレイ時】 effects, top to bottom, if it has any (skip otherwise — QM).
4. Resolve 【アタックする】: choose one of your leaders as the **attacker** and one opposing leader to be **attacked**.
5. Give the attacked leader the damage (place counters).
6. Resolve its 【アタック後】 effects, if any.
7. If an opposing leader was downed, awaken the attacker (§13.2) (PM p.07 artwork; QM step 7; PM p.12).

- **Any leader may attack any number of times per turn**, one attack per attack card played (PM p.07; QM).

### 9.2 Detailed procedure (PM p.12) — the engine's canonical sequence
When an attack card is played, the attack card's effects and those of the memoria/tactics boosting it resolve as follows:

1. Attack card's **【プレイ時】** effects.
2. Attack card's **【アタックする】**:
   1. Choose the attacker (one of your own non-downed leaders) and the attacked leader (one non-downed opposing leader) (PM p.12, PM p.08).
   2. Compute the damage value = **(sum of the "damage +" of every 【アタック強化】 effect boosting this attack, from memoria and tactics) + (the attack card's own "damage +") + (the attacker's ATK)**. Any "damage −" is also applied here. Conditions or extras attached to the attack card's "damage +" are checked and resolved at this point (PM p.12). Example: ATK 30 with a +60 boost = 90 damage (PM p.09).
   3. Give that damage to the attacked leader (PM p.12).
3. **【アタック後】** effects. If the attack card and the boosting memoria/tactics (and other sources) have several, the **turn player chooses the order** and resolves them one at a time (PM p.12, PM p.15 Q6). Conditions are checked when each effect resolves, so the order can change outcomes (PM p.15 Q6 example).
4. If at least one opposing leader is downed (during this attack) and the attacker is not yet awakened, awaken the attacker and resolve its 【覚醒時】 (PM p.12).

- A leader whose damage counters reach or exceed its HP is downed **immediately** (PM p.12), i.e. mid-sequence, not at a check point.
- An attack card with a bare 【アタックする】 and no other text simply performs steps 2.1–2.3 (API pattern; PM p.07).
- Some attack cards have several 【アタックする】 lines (e.g. ストームラッシュ: three); each is a separate attack with its own attacker and target choice (card reminder text; API BP03-017). See R-025 for boosts and awakening across them.
- "Damage +" from Attack Boost uses a total; minimum damage after "damage −" is manual silent (R-016).

### 9.3 Targeting legality
- A downed leader cannot be the attacker, cannot be targeted by attacks or card effects, and cannot be dealt damage (PM p.08; QM).
- Card text that says otherwise wins (e.g. 復活ポータル targets a downed leader) (PM p.17 Q10).
- If an effect has no legal choice, it does nothing (PM p.16 Q8).
- "対戦相手の他のリーダー" ("the opponent's *other* leader(s)") means opposing leaders other than the one that received this attack (PM p.14 Q2–Q3, PM p.16 Q8). If the only non-downed opposing leader is the attacked one, such an effect does nothing (PM p.16 Q8).
- "このアタックを受けたリーダーがダウンしているなら" is true when **the leader that received the attack** is down at the moment the effect resolves, however it went down (including an earlier 【アタック後】 of the same attack that damaged that same leader); it is false when only a different opposing leader went down (PM p.14 Q3; FAQ #18, #115, #123; R-053).

## 10. Playing a memoria card; Attack Boost duration (PM p.09; QM)

1. Pay PP equal to the cost; put it face up in the play area, left to right in play order (PM p.09).
2. Resolve its 【プレイ時】 effects, top to bottom (PM p.09).
3. **【アタック強化】 (Attack Boost)** boosts the **next attack you perform** (PM p.09). Its "damage +" is applied when that attack card's 【アタックする】 is executed (PM p.09, PM p.12).

Duration and scope (PM p.09 example):
- A boost affects only the next attack, never a later one. With play order ①memoria ②attack ③memoria ④memoria ⑤attack: ① boosts ②; ③ and ④ both boost ⑤; ① does **not** boost ⑤ (PM p.09).
- Several boosts can stack on one attack (PM p.09).
- To boost an attack, play the memoria (or tactics) **before** the attack card (PM p.09; QM).
- Play-area attack/memoria cards go to the trash at end phase (PM p.09), so an unused boost ends with the turn (inference; manual silent — R-014).
- A memoria with both 【アタック強化】 and 【アタック後】 contributes its 【アタック後】 to the attack it boosted (PM p.15 Q6 example 超新星).

## 11. Tactics cards (PM p.10; PM p.03; QM)

- At each round start, each player places 1 card from their tactics deck face down in their tactics area (PM p.05, PM p.10, PM p.11).
- Cards in the tactics area may be played in the main phase, **at most 1 per turn**; the **first player cannot play one on their first turn** (PM p.06, PM p.10).
- Pay PP equal to its cost (PM p.10).
- **Consumable (消費):** put face up in the play area. Being face up there is what makes its 【プレイ時】 and 【アタック強化】 work (PM p.10). It goes to the trash face up at end phase (PM p.10).
- **Equipment (装備):** when played, turn it face up and attach it to any one of your leaders of your choice; its effect works while attached (PM p.10). Example: ライトシールド "HP +30" raises the equipped leader's HP by 30 just by being attached (PM p.10). Equipment stays attached across rounds (PM p.11). A leader may carry several equipment cards (manual silent — R-038).
- Equipment attached to a downed leader stays attached (implied by 復活ポータル text "trash all cards that leader is equipped with", PM p.17 Q10; manual silent otherwise — R-012).
- **PP Ticket:** see §2.5; it is played from the tactics area like any tactics card (PM p.03, PM p.05), so it counts toward the one-per-turn limit (R-009).
- Tactics cards in the play area go to the trash face up at end of turn (PM p.10), unless card text says otherwise (e.g. パワーフィールド, 電磁スモーク: "not trashed at end of turn"; 追加マガジン returns to the tactics area instead) (API).
- What LB means by "neutral cards" (ニュートラルカード) is not defined anywhere we have; no attack/memoria card is colourless in the API, so it most likely means cards without a leader-specific build rule (manual silent — R-030).

## 12. Damage, healing, down

- **Damage** is tracked with damage counters on the leader (PM p.07, PM p.12). A leader with counters ≥ its current HP is downed immediately (PM p.08, PM p.12).
- **Down (ダウン):** remove all damage counters from it and turn it sideways (PM p.08). A downed leader cannot attack, cannot be targeted by attacks or effects, and takes no damage (PM p.08).
- **Overkill:** excess damage beyond remaining HP has no rules effect in the manual (manual silent). Card keyword オーバーキルN reads it (§14; R-005).
- **Healing (回復) HP:** remove that many damage counters; healing more than the counters present removes them all (no excess, no HP above maximum) (PM p.16 Q9).
- **Healing PP:** turn that many sideways PP cards upright; recovering more PP than there are sideways cards simply untaps them all (no extra PP) (PM p.16 Q9). E.g. PP Ticket with every PP upright does nothing (PM p.16 Q9).
- **Current HP** = printed HP of the face showing (pre-awakening or awakened), modified by equipment and card effects (PM p.02, PM p.10). Damage counters are not removed on awakening (manual silent — R-011).
- HP reduction while damaged (equipment removal etc.): manual silent — R-013.

## 13. Awakening (覚醒)

### 13.1 Who awakens and when
- The **attacker** awakens when the attack downs an opposing leader (PM p.08; QM).
- This includes downs caused by the attack's 【アタック後】 effects (PM p.08, PM p.14 Q2) and downs of the opponent's last leader (PM p.15 Q4, PM p.12).
- It happens once, after all 【アタック後】 effects, if at least one opposing leader was downed and the attacker is not already awakened (PM p.12). Downing several leaders in one attack still awakens the attacker once (PM p.12 "1体以上").
- An already-awakened leader does not awaken again (PM p.12).
- Leaders awaken only by this rule or by card text (e.g. 名誉のバッジ "awaken 1 of your leaders") (API BP05-077). Downs caused outside an attack (e.g. a tactics 【プレイ時】 damage) do not awaken anyone (manual silent — R-006). Whether a down caused by the attack card's own 【プレイ時】 (step 1 of §9.2) counts: manual silent — R-007.

### 13.2 What awakening does
- Flip the leader to its awakened face (PM p.08; QM).
- Then resolve that leader's 【覚醒時】 effect (PM p.08, PM p.12).
- Stats change to the awakened face (e.g. Mondo ATK 30/HP 110 → ATK 40/HP 140) (PM p.08).

### 13.3 What persists
- Awakened leaders stay awakened into later rounds (PM p.11; QM).
- Equipment stays attached into later rounds (PM p.11; QM).

## 14. Card-text conventions and keywords

Defined in the manual:

| Term | Meaning | Source |
|---|---|---|
| プレイする | to use a card (pay cost, put it in the play area / attach it) | PM p.06 |
| 【プレイ時】 | resolves when the card is played, top to bottom | PM p.07, PM p.09 |
| 【アタックする】 | the attack itself: choose attacker and target, compute and deal damage | PM p.07, PM p.12 |
| 【アタック後】 | resolves after the attack's damage; turn player orders multiple | PM p.07, PM p.12, PM p.15 Q6 |
| 【アタック強化】 | Attack Boost: adds to the damage of your next attack | PM p.09 |
| 【覚醒時】 | resolves when this leader awakens | PM p.08 |
| ダメージ+ / ダメージ− | added to / subtracted from the damage value | PM p.12 |
| 回復 | remove damage counters / untap PP, capped | PM p.16 Q9 |
| ダウン | downed state (§12) | PM p.08 |
| 対戦相手の他のリーダー | opposing leaders other than the attacked one | PM p.14 Q2–Q3, PM p.16 Q8 |
| このアタックを受けたリーダーがダウンしているなら | the attacked leader itself is down when the effect resolves (not another leader) | PM p.14 Q3; FAQ #18, #115, #123; R-053 |
| 消費 / 装備 | tactics subtypes consumable / equipment | PM p.03, PM p.10 |
| ACE (エース) | ACE-icon cards, 8 per deck | PM p.13 |
| ビルドルール | deck-inclusion condition | PM p.02, PM p.13 |
| Card text vs rules | card text wins | PM p.17 Q10 |
| No legal target | effect does nothing | PM p.16 Q8 |

Used on cards but **not defined in the manual** (meanings come from card reminder text; see card-text-grammar.md):
- 【ラウンド中】 (2 cards) — continuous for the rest of the round; such cards stay in the play area (API BP03-077, BP05-076). Manual silent.
- オーバーキルN (15 cards) — "if the attacked leader was dealt damage at least N greater than its remaining HP" (card reminder text, API). Manual silent.
- エコー Echo (4 cards) — at your turn end, instead of trashing an upright Echo card turn it sideways; at your next main-phase start, replay it sideways for free (card reminder text, API BP04-045). Manual silent.
- 「この効果はターンに1回しか発動しない」 once-per-turn (3 cards, API). Manual silent.
- Tag checks 「「VSPO!」を持つ」 / 「「CR」を持つ」 (4 cards, all in ST01/ST02, API). The tag field is defined on PM p.02; tags are not in the API (R-031).

Unqualified "プレイエリア" in card text: manual silent on whose play area — R-022.

## 15. Round end and next-round setup

### 15.1 The round-end trigger (PM p.12)
When either player's leaders are all downed:
1. Resolve every effect of cards in the play area that has not yet been resolved (PM p.12, PM p.15 Q5).
2. If the opponent's last leader was downed by an attack or a 【アタック後】 effect, and the attacker is not awakened, awaken it and resolve its 【覚醒時】 (PM p.12, PM p.15 Q4).
3. If any play-area card still has unresolved effects, keep resolving until none remain (PM p.12).
4. Perform the round-end procedure (§15.2) (PM p.12).

- The winner of the round is the player whose opponent has all leaders downed (PM p.11). Both teams fully downed at once: manual silent — R-018.

### 15.2 Round-end procedure (both players, PM p.11; QM)
1. Play-area cards to the trash face down; tactics cards face up.
2. Whole hand to the trash face down.
3. Remove all damage counters.
4. Revive all downed leaders (turn upright).

Carried into the next round: awakened state, attached equipment (PM p.11; QM), the trash as-is with **no** deck reshuffle (PM p.11), and the tactics area (QM only — "tactics area, trash, equipment and awakened state stay as they are"; PM p.11 does not list the tactics area) — R-010.

### 15.3 Next-round setup (PM p.11; QM)
1. Each player picks 1 card from their tactics deck and places it face down in the tactics area. If the tactics deck is empty, do nothing (PM p.11).
2. Add 1 PP card: round 2 = 4 PP per turn, round 3 = 5 PP per turn (PM p.11, PM p.04).
3. Each player draws 4. The **loser of the previous round** takes the first turn and is the first player for that round (PM p.11).

- The PP Ticket is placed only in round 1 (PM p.05; card text "1ラウンド目").

## 16. Deck-out, reshuffle and tactics-deck loss (PM p.05, PM p.14 Q1; QM)

- Whenever an action needs cards from the deck (draw, look at, reveal…) and the deck does not have enough, shuffle the face-down cards of your trash to form the deck (PM p.14 Q1). The QM's narrower wording is "when you try to draw and the deck is empty" (QM); PM supersedes.
- Then choose 1 card at random from your tactics deck and put it face up into the trash (e.g. shuffle it and let the opponent pick one face down) (PM p.14 Q1, PM p.05).
- If the tactics deck has no cards when this choice is required, you **lose the match** (PM p.14 Q1; QM).
- Worked example (PM p.14 Q1), deck of 1 when an effect says "look at the top 3": set the 1 card aside face down; shuffle the trash's face-down cards into the deck; trash a random tactics card face up; look at the top 2 plus the set-aside card.
- Face-up trash cards (tactics, including the PP Ticket) are never shuffled back (PM p.14 Q1 "face-down cards").
- Card effects may also return trash to the deck (アイテムショップ, API BP04-076); that is not a deck-out and carries no penalty (card text; R-019).

## 17. Timing, priority and simultaneity — summary

- There is no stack and no response window; the turn player does everything on their turn (PM p.06; manual silent on responses).
- Within one card, effects resolve top to bottom (PM p.07, PM p.09).
- Cards played this turn sit in play order left→right; cards played by an effect during an attack are placed to the right of the source card and their effects resolve after the attack ends, left to right (card reminder text on 一騎当千, 三銃士, リンク・アサルト; PM p.14 Q1 example).
- Multiple 【アタック後】: turn player's choice of order (PM p.12, PM p.15 Q6).
- Downs are immediate on damage (PM p.12). Awakening is deferred to after all 【アタック後】 (PM p.12).
- Round end triggers immediately on a full team down, but pending play-area effects still resolve first (PM p.12, PM p.15 Q5).
- Simultaneous match loss: both lose (PM p.17 Q11).
- Actions cannot be taken back once performed (FR §2).

## 18. Differences vs the third-party summary (TM)

TM agrees with PM on every point checked (deck 50/4 copies/8 ACE, 5 tactics, PP 3/4/5, end-phase PP draw, hand limit 7, first player draws turn 1, no mulligan, tactics 1/turn and first-player restriction, awakening incl. 【アタック後】 downs, carry-over of awakening and equipment, loser goes first, quick match). Minor gaps: TM states deck-out as "when the deck runs out", while PM Q1 triggers on any shortfall for a draw/look/reveal; TM gives the damage formula without the "damage −" term (PM p.12). PM wins in both cases (TM, PM p.14, PM p.12).

---

## Edition and leak list

Pinned editions (as of 2026-10-29):

| Document | Version / date | Notes |
|---|---|---|
| Playing Manual | `XrossStars_PlayingManual_260409`, cover "VER.20260409", PDF created 2026-04-09 | 19 PDF pages; printed pp.01–17 |
| Quick Manual | `XrossStars_QuickManual_250813` (PDF created 2025-08-14 UTC) | one sheet |
| Play sheet | `XrossStars_Playseat_250813` | zone layout identical to PM p.04 |
| Floor Rules | v1.0.4, last updated 2026-07-17 (PDF title "フロアルールver.20260717") | §1–§8 |
| Limited/BAN | page "Limited・BANカードについて（2026年7月13日更新）" | see below |
| Card data | API dump, 808 rows / 450 distinct names | effect text as printed |

**Limited/BAN list (LB, current on 2026-10-29; last change 2026-07-13):**
- Limited (max 2): none.
- BAN: tactics card **エナジーチャージャー** (BP01-090, BP02-073, ST01-020, ST02-020) — banned 2026-07-13 (LB).
- Consequence: each starter deck (ST01, ST02) ships exactly 5 distinct tactics including エナジーチャージャー, so an out-of-the-box starter tactics deck is not tournament-legal; for sanctioned play it needs one replacement tactics card (API, LB). Casual/engine default: enforce BAN only in "sanctioned" mode (R-030).

**Products to date (API `card_product`, rows incl. parallels; dates are API `release_date`, UTC):**

| Code | Product | Rows | API release_date |
|---|---|---|---|
| ST01 | Starter deck 『初の栄冠』 (VSPO!) | 25 | 2025-08-12 15:00Z (= 2025-08-13 JST) |
| ST02 | Starter deck 『魔王降臨』 (Crazy Raccoon) | 25 | 2025-08-12 15:00Z |
| BP01 | Booster 1 『Luminous Daybreak』 (/100) | 140 | 2025-08-12 15:00Z |
| BP02 | Booster 2 『Exceed Rampage』 (/082) | 112 | 2025-12-17 15:00Z |
| BP03 | Booster 3 『Broken Neonlights』 (/110 label; numbers to 081 + parallels) | 115 | 2026-03-11 15:00Z |
| BP04 | Booster 4 『Grand Resonance』 (/081) | 116 | 2026-07-12 15:00Z |
| AN01 | 1st Anniv. Collection PREMIUM SET (/024) | 24 | 2026-08-25 16:00Z |
| ST03 | EX start deck 『ぶいすぽっ！』 | 25 | 2026-10-23 01:50Z |
| ST04 | EX start deck 『Crazy Raccoon』 | 25 | 2026-10-23 01:50Z |
| BP05 | Booster 5 『Ignition Vortex』 (/080) | 114 | 2026-10-23 02:00Z |
| PR | Promotion cards | 85 | 2025-08-12 … 2026-08-25 (14 dates) |
| LO | Leaders Open promo | 2 | 2026-06-12 15:00Z |

The API `release_date` for the launch wave (2025-08-12 15:00Z) does not match the retail launch date of 2025-08-22 given in the M0 brief; we treat API dates as data-publication dates, not street dates (API; brief).

**What changed from the 2025 Quick Manual to the 2026 Playing Manual:**
1. Damage formula: QM = ATK + "damage +"; PM adds Attack Boost from memoria **and tactics**, and "damage −" (QM; PM p.12).
2. Awakening: QM "if an opposing leader went down, awaken the attacker"; PM adds "at least one", "only if not already awakened", the explicit 【アタック後】 case and the order (after all 【アタック後】) (QM; PM p.08, p.12, Q2).
3. Round-end trigger procedure (resolve pending effects, last-leader awakening, then cleanup) is new in PM (PM p.12).
4. Deck-out: QM triggers on draw from an empty deck; PM triggers on any draw/look/reveal shortfall and gives the set-aside procedure and a method for the random tactics pick (QM; PM p.14 Q1).
5. Round carry-over: QM lists tactics area, trash, equipment and awakened state as staying; PM lists awakened state and equipment, adds "trash stays, deck is not reshuffled", and **omits the tactics area** (QM; PM p.11) — R-010.
6. Next-round tactics: PM adds "if the tactics deck is empty, do nothing" (PM p.11).
7. New in PM: card anatomy (pp.02–03), deck construction incl. ACE and build rules (p.13), FAQ Q1–Q14 (pp.14–17: deck-out, 他のリーダー, 【アタック後】 ordering, no-target, healing caps, card-over-rules, simultaneous loss, substitutes, first-turn draw, no mulligan).
8. Unchanged: setup order, PP 3/4/5, start/main/end phase steps, hand limit 7, tactics 1/turn and first-turn restriction, quick match.
9. Not in QM or PM but now in force: BAN of エナジーチャージャー (LB 2026-07-13); floor-rule time limits and concession rules (FR v1.0.4).
