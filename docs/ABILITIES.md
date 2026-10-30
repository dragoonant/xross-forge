# Writing card abilities

Every card in `data/cards.js` has an entry in `XS.ABIL[cardNumber]` in `data/abilities.js` (the PP card
too, with no effects). Effects are **data**, run by the interpreter in `js/engine/abilities.js`; the
engine never reads English text. Read `js/engine/abilities.js` (ops, conditions) and
`js/engine/attack.js` (where each timing runs) before adding an op. Rules cited as `(PM p.N)`,
`(FAQ #id)`, `(R-0NN)` (`docs/rulings.md`).

## Shape

```js
XS.ABIL['ST01-007'] = { effects: [
  { timing: 'attack',      ops: [] },                                              // a bare 【アタックする】
  { timing: 'afterAttack', ops: [ { op: 'damage', n: 40, to: { side: 'opp', count: 1, other: true } } ] },
] };
```

| timing | printed tag | when it runs |
|---|---|---|
| `onPlay` | 【プレイ時】 | when the card is played (memoria, tactics, attack; equipment when attached, R-039) |
| `attack` | 【アタックする】 | the attack step: the ops run top to bottom BEFORE the damage (PM p.12 2-2, FAQ #8, R-065); `dmgPlus` ops add to the damage value as their turn comes, so a draw or discard above them changes what their condition sees. A card with several 【アタックする】 has several `attack` effects (R-025) |
| `afterAttack` | 【アタック後】 | after the damage, in the turn player's order (FAQ #121). A memoria/tactics card's runs for the attack it is attached to only (FAQ #36); a memoria with only an 【アタック後】 attaches to the next attack as well (FAQ #65). オーバーキルN is an `if: {c:'overkill', n}` on the ops |
| `boost` | 【アタック強化】 | a memoria/tactics card arms it when played (or when it resolves, if it was played free); the next attack consumes it. Only `dmgPlus` belongs here; conditions are read when the attack applies it (R-051) |
| `onAwaken` | 【覚醒時】 | a leader, right after it awakens (exactly one per leader) |
| `round` | 【ラウンド中】 | the card stays in the play area at the end of the turn and is trashed at the round end (R-071); its ops are auras read by the engine: `atkMod`, `costAura` |
| `static` | none | markers read by the engine, never run: `echo`, `costMod`/`costFloor`/`costFree`, `playIf`, `grant`, `mustTarget`, `ticketRule` (and the older `statMod`). Equipment STATS are not here: they are `CARDS[no].equip` |

The printed tags and numbers must match: `node tools/audit-cards.mjs` compares each entry with the
printed Japanese text in the gitignored dump (every printed number appears in the entry, no number
appears that is not printed, tags equal timings). Write every printed number as a number; do not
compute them from other numbers. What the audit does NOT ask for: the N of "N枚につき" / "N体につき" (a per-unit count; the value
(`perPlay`, `perRevealed`, `perOwnTag`) counts per card and only `each` is the amount: write no `per`) and the 1体 of a `revive`
(the op itself; write no `n`). A `grant` op gives its `timing` as the card's tag (盗賊キット: the printed 【アタック後】 is inside
the granted ability). A number that is printed anywhere else still has to be in the entry.

## Ops, conditions, targets

Every op may carry `if: { c: ... }` (skipped when false; conditions are read **when the op resolves**,
so ordering matters, FAQ #2). Fields marked `?` are optional. Prefix `x.f` below = the effect group's frame:
it remembers `did` (the last optional action was done), `look` (the cards looked at), `revealed`/`seen`, `healed` (counters removed by this group's heals).

| op | fields | does |
|---|---|---|
| `dmgPlus` | `n`, `if?` | damage + N (attack / boost timings only). Summed with ATK and boosts; `n` may be negative (ダメージ-N); floor 0 (R-016) |
| `downAttacked` | `if?` | the attacked leader goes down, logged as a down by the attack (Crossfire, R-026/R-065) |
| `damage` | `n`, `to`, `optional?`, `leave?` | N damage to `to` (below). `n` may be a value (below). N <= 0 does nothing (R-062). `optional`: choose none to decline, sets `did`. `leave: 10`: if it would down the leader its remaining HP becomes 10 instead (R-042) |
| `heal` | `n`, `to` | remove up to N counters from the chosen leader (not down; undamaged is allowed, FAQ #133); the counters actually removed are added to the frame's `healed` |
| `healTotal` | `n`, `unit` | split exactly N among your leaders in multiples of `unit` (R-057); the counters actually removed are added to the frame's `healed` (FAQ #64) |
| `draw` | `n`, `who?` | draw N (`n` may be a value); `who: 'both'` = すべてのプレイヤー, turn player first (R-072) |
| `discard` | `n`, `who?`, `optional?`, `random?`, `filter?`, `of?` | the hand's owner discards N (asked; all of it if fewer, R-056). `who: 'opp'`: the opponent chooses; `'both'`: both, asked before anything moves (R-072). `optional`: min 0, sets `did`. `random`: engine RNG; with `optional` a yes/no (purpose `may`) comes first (R-070). `of: 'revealed'`: discard the cards revealed earlier in this group |
| `reveal` | `n`, `filter?`, `optional?`, `limit?` | reveal up to N hand cards (public, log `look`); remembered in `revealed`/`seen`; sets `did` (FAQ #8) |
| `look` | `n`, `side?`, `reveal?` | look at (or, with `reveal`, show) the top N of your deck (`side: 'opp'`: theirs). Deck-out procedure on shortfall (R-064) |
| `lookPick` | `to`, `filter?`, `min?`, `max?`, `reveal?`, `limit?` | choose from the looked cards (purpose `look`): `to: 'hand'` or `'trash'`. `min: 0` = "してもよい" with a decline; sets `did`. Always asked, also with no candidate (options `[]`, min 0; the looked-at cards are hidden, R-077) |
| `lookRest` | – | the looked cards that are still on the deck go to the trash, face down |
| `freePlay` | `from`, `max`, `min?`, `filter?`, `limit?` | choose cards from `'hand'` or `'look'` to play without paying (purpose `freePlay`, the answer order is the play order). Placed at the far right now, resolved after the current play (R-074). Always asked, also with no candidate (hand and looked-at cards are hidden, R-077); `max` is the printed number |
| `recoverPP` | `n` | turn up to N sideways PP upright (FAQ #7) |
| `awaken` | – | awaken a leader of yours that is not awake (purpose `awaken`); its 【覚醒時】 runs (R-073) |
| `revive` | – | bring back a downed own leader (purpose `revive`); its equipment goes to the trash face up (FAQ #23, R-073) |
| `atkBuff` | `n`, `until` | all own leaders +N ATK until the end of the `'turn'` / `'round'` (先導者の証, R-043) |
| `shuffleTrash` | – | face-down trash into the deck, shuffled; no penalty (R-019) |
| `statMod` | `stat`, `n` | static, older form of an equipment stat (now `CARDS.equip`) |
| `echo` | – | static marker: エコー (R-024, R-071) |
| `costMod` | `n`, `if?` | static: this card's cost changes by N (`n` may be `{perPlay:{each:-1}}`) |
| `costFloor` | `n` | static: reductions stop at N (復活ビーコン: 1). Applied after every modifier (FAQ #138, R-069) |
| `costFree` | `if?` | static: the cost is 0 (壁ジャンプ: `if playCount {sameName, other, min 1, max 1}`) |
| `costAura` | `n`, `who`, `cardType?` | 【ラウンド中】: `who: 'opp'`/'own' tactics (or `cardType`) cost N more (電磁スモーク) |
| `atkMod` | `n` | 【ラウンド中】: every own leader's ATK +N while the card is in the play area (パワーフィールド) |
| `grant` | `timing: 'afterAttack'`, `ops`, `oncePerTurn?` | static, on equipment: the equipped attacker has this 【アタック後】 (盗賊キット, R-028); `oncePerTurn` is per equipment card and used only when it did something (R-029, R-068) |
| `playIf` | `if`, `msg` | static: the card can only be played while the condition holds (復活ポータル); `msg` is the `whyNot` sentence |
| `mustTarget` | – | static, on equipment: opponents must attack this leader if they can (ターゲットフラッグ, R-066) |
| `ticketRule` | `round` | static marker of the PP Ticket's setup rule (flow.js places it) |

Equipment stats are data on the card, `CARDS[no].equip = { hp?, atk?, hpBase?, hpBaseAwakened? }` (tools/out/card-fields.md):
`hp`/`atk` add, `hpBase`/`hpBaseAwakened` replace the printed HP of the face showing (サイバネアーマー), additions of other
equipment come after. A card must not carry both `equip` and a `statMod` (validate-abilities).

Values (`n`): a number, or `{perOwnTag:{tag, each}}` (downed leaders count, FAQ #10), `{perPlay:{type?, each, other?}}`,
`{playCostSum:{type?}}`, `{perRevealed:{type?, each}}`, `{revealedCost:true}`, `{healed:true}` (the counters the earlier `heal` / `healTotal` of the same effect group actually removed, 0 if none: ドレインロッド, FAQ #64, R-076; `validate-abilities` wants a heal op above it).

Card filters (`filter`): `type`, `cost`, `maxCost`, `minCost`, `notAce`, `color`, `notSameName` (not the source card's name).
`limit` on a multi-pick: `costSumAtMost`, `costSumAtLeast`, `perType: {memoria: 1, attack: 1}` (checked by `apply`).

Conditions (`c`): `attackedDown` (R-053), `handAtMost {n}`, `memoriaAtLeast {n}` (FAQ #43), `ownDownAtLeast {n}`, `allOwnTag {tag}`
(FAQ #10); and `playCount {type?, cost?, other?, sameName?, min?, max?}` (own play area, R-022; "no other card" = `{other:true, max:0}`),
`roundIs {n}`, `lostLastRound`, `downMoreThanOpp`, `attackerAwakened`, `attackerDamaged`, `attackerRemaining {n}`, `attackerColor {color}`,
`ownColorsDiffer`, `discardedThisTurn`, `trashHasName {name}`, `overkill {n}` (R-063), `did` (そうしたなら, R-070), `seenType {type}`,
`afterDealt` (the attack's After Attack effects have dealt damage).

Targets (`to`): `{ side: 'own'|'opp', count: 1 | 'all' | 'attacker' | N, other?, upTo?, remainingAtLeast? }`. `count: 1` is a **choice**: the
player is always asked, even with one candidate (CLAUDE.md rule 4). `'all'` takes every leader that is not down, without asking.
`'attacker'` is your attacking leader (no question). A number N needs `upTo: true` (最大N体, zero allowed, R-075). `other: true` excludes
the leader that received this attack (R-023). `remainingAtLeast` keeps leaders with at least that much HP left (R-067). With no legal
target the op does nothing and logs `fizzle` (FAQ #21).

## How a choice works (read before adding an op)

Effects run on a stack of frames in `s.stack`. An op that needs a decision calls `D.ask(s, f, spec)`:
if the frame already holds the answer it is returned, otherwise `s.pending` is set and the step is
abandoned; after the answer the **same op runs again from its start** with the answers it asked for.
Therefore: **ask first, change the game second**. All asks of an op come before its first change
(draw/damage/move). An op that asked, then changed, would repeat the change on resume.

```js
OPS.damage = function (x, op) {
  const n = XS.val(op.n, x);
  const c = candidates(x, op.to);               // read-only
  if (c.length === 0) return fizzle(x, 'noTarget');
  const targets = op.to.count === 'all' ? c
    : D.ask(x.s, x.f, { kind: 'choose', seat: x.seat, purpose: 'target', options: c, min: 1, max: 1,
                         prompt: `Choose an opposing leader to take ${n} damage.` });   // may suspend here
  for (const t of targets) D.dealDamage(x.s, t, n, 'effect');                           // changes only after
};
```

Prompts name the effect and its number ("Choose another opposing leader to take 40 damage."). Every
state change goes through a door in `js/engine/doors.js` (damage, heal, down, awaken, draw, discard,
PP, zone moves); never write a leader's `damage` or a card's zone from an op.

## Worked examples (all from data/abilities.js)

- **ST01-007 Bounty Hunter**: `afterAttack` -> `damage` 40, `to {opp, 1, other}`. Test: asks among the three other
  leaders, then a single-candidate case that still asks (`tests/20-cards.js`).
- **ST01-016 First Glory**: `boost` +30 and `afterAttack` -> `damage` with `n {perOwnTag {tag 'VSPO!', each 10}}`; a downed own leader
  still counts (FAQ #10).
- **ST01-008 Winning Blow**: `afterAttack` -> `draw 1` with `if {c: 'attackedDown'}`; fires only when the attacked leader is down.
- **ST01-017 Summit Reached**: `onPlay` -> `draw 1` with `if {c: 'ownDownAtLeast', n: 3}` plus `boost` +40.
- **ST01-005 Crossfire**: `attack` -> `downAttacked` with `if {c: 'allOwnTag', tag: 'VSPO!'}`.
- **ST01-021 First Aid Kit**: `onPlay` -> `healTotal` 80 in units of 10 (pending kind `distribute`).
- **ST01-023 Light Shield**: no effect entry; `CARDS['ST01-023'].equip = { hp: 30 }` is read by `XS.leaderStats`, so HP, remaining HP and "goes down" all see it.
- **ST01-024 PP Ticket**: `static` `ticketRule` (round 1, second player) plus `onPlay` -> `recoverPP 1`.

### Booster-pool examples (synthetic cards in `tests/15-ops.js`; the real entries come with the per-card scripts)

```js
// オーバーキル30: 影と道連れ-style
{ timing: 'afterAttack', ops: [{ op: 'damage', n: 50, to: { side: 'opp', count: 1, other: true }, if: { c: 'overkill', n: 30 } }] }
// CLUTCH!!! (FAQ #8): reveal a cost-0 card (may), discard it, then draw and +40 - only if it did
{ timing: 'attack', ops: [ { op: 'reveal', n: 1, optional: true, filter: { cost: 0 } }, { op: 'discard', of: 'revealed' },
                           { op: 'draw', n: 1, if: { c: 'did' } }, { op: 'dmgPlus', n: 40, if: { c: 'did' } } ] }
// リンク・アサルト: look at 3, play a cost-1 memoria free (resolves after the attack), the rest to the trash
{ timing: 'afterAttack', ops: [ { op: 'look', n: 3 }, { op: 'freePlay', from: 'look', filter: { type: 'memoria', maxCost: 1 }, max: 1 }, { op: 'lookRest' } ] }
// エコー memoria: [{timing:'onPlay',...}, {timing:'boost',...}, { timing: 'static', ops: [{ op: 'echo' }] }]
// 電磁スモーク: 【ラウンド中】 { timing: 'round', ops: [{ op: 'costAura', who: 'opp', cardType: 'tactics', n: 1 }] }
// 復活ビーコン: static { op: 'costMod', n: { perPlay: { each: -1 } } }, { op: 'costFloor', n: 1 } + onPlay { op: 'revive' }
// 盗賊キット: static { op: 'grant', timing: 'afterAttack', oncePerTurn: true, ops: [{ op: 'draw', n: 1, if: { c: 'attackedDown' } }] }
```

Test cards are built with `XS.T.fx.withCards(defs, fn)` and `fx.deckWith('ST01', [[id, qty]], [tacticsIds])` (tests/05-fixtures.js);
a def is `{ id, type, cost?, color?, name?, ace?, tactics?, equip?, tags?, effects }` with `effects` exactly as in `data/abilities.js`.

## Adding an op or a condition

1. Add the handler to `XS.OPS` (or `XS.COND`) in `js/engine/abilities.js`, ask-first.
2. Add its required fields to `REQUIRED` in `tools/validate-abilities.mjs` (and `STATIC_OPS`/`ROUND_OPS` if it is a marker); teach `tools/audit-cards.mjs` a new keyword.
3. Write the entries; run `node tools/validate-abilities.mjs` and `node tools/audit-cards.mjs`.
4. One behaviour test per op in `tests/15-ops.js` (synthetic cards) and per card number in `tests/20-cards.js`, driven through `XS.apply` (positions via `XS.T.fx`, which edits only
   through the engine's doors). Include the single-candidate case for every targeted effect.
5. Break the ability on purpose and watch the test fail before you trust it.

## When a card cannot be done faithfully

Do not approximate. Write `{ unimplemented: 'why' }` for the op and list the card in `data/defects.js`
(CLAUDE.md rule 8); `validate-abilities` refuses an `unimplemented` op on any card of a registered deck,
and `validate-data` refuses a defective card in a deck. An `unimplemented` op that reaches resolution throws.

No card of a registered deck is `unimplemented` (2026-10-30). Not implemented (each needs a rule or a UI the engine does not have): 【プレイし直す】 replay (三銃士, グレイトフルファーマー:
FAQ #106/#107/#112 ordering), ジェイルブレイク (damage split by cards drawn this turn), メカニカルエキスパート (moving equipment, R-052),
運命のルーレット (declaring a card type), 追加マガジン (replacement: back to the tactics area), テラーエンゲージ (costs "per kind"),
the sanctioned BAN check (R-030, TODO 7).
