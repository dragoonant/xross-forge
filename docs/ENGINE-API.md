# Engine API contract (frozen shape; additions allowed, renames not)

Namespace `XS` (`globalThis.XS`). Plain browser JS, no build step; every file is an IIFE. The
engine never touches the DOM and never writes UI copy: it emits structured log entries and
short imperative prompts; the UI phrases the rest. Rules: `docs/rules.md` (PM = Playing Manual),
rulings: `docs/rulings.md` (`R-0NN`), official FAQ cited `(FAQ #id)`. Structure ported from
lorecannae (`docs/PORTING.md`); the rules are Xross Stars only.

Files (load order in `index.html` / `tests.html`, after `js/ns.js`, `js/rng.js`, `data/*`):
`js/engine/state.js` (state, clone, leader stats), `log.js` (the one `log()` door),
`doors.js` (damage, heal, down, awaken, draw + deck-out, discard, PP, zone moves),
`abilities.js` (effect runtime), `attack.js` (the attack sequence), `flow.js` (setup, turns,
rounds, match), `api.js` (the surface below). Card effects are data in `data/abilities.js`.

## Surface

| Function | Returns |
|---|---|
| `XS.newGame({decks:[a, b], seed, mode, first, names?})` | A fresh state, already settled up to the first decision (see "Opening"). `a`/`b`: a deck id from `XS.DECKS` (`'ST01'`) or a deck object of the same shape `{id?, name?, leaders:[4 card numbers], main:[[cardNumber, qty],…], tactics:[5 card numbers], ppTicket:cardNumber}`. `mode`: `'full'` (best of 3, default) or `'quick'` (one round). `first`: `0`, `1`, or `'random'` (default `'random'`): a seat number is the round-1 first player; `'random'` makes the engine's RPS winner (seeded) answer a `chooseFirst` decision (R-045). `seed`: number or string. |
| `XS.legalActions(s)` | Array of actions for `XS.whoActs(s)`. Never empty while not terminal. For multi-pick decisions (`choose`, `distribute`) it returns a deterministic **sample** (the bot and the sim use it); the UI builds its own picker from `s.pending`. |
| `XS.apply(s, action)` | A **new** state. `s` is never mutated. Throws `XS.Illegal` for an action that is not legal in `s` (wrong seat, wrong shape, not enough PP, bad ids…). |
| `XS.whoActs(s)` | `0`, `1`, or `null` when the game is over. During a pending decision it is `s.pending.seat`; otherwise `s.active`. |
| `XS.isTerminal(s)` | `s.phase === 'over'`. |
| `XS.view(s, seat)` | The state as `seat` may see it (see "Hidden information"). Pure; returns a new object. The UI must render from `view`, never from raw `s`. |
| `XS.leaderStats(s, seat, slot)` | `{iid, cardId, seat, slot, atk, hp, damage, remaining, down, awakened, tags, equipment:[{iid, cardId}]}`. `atk`/`hp` are the live values for the face showing, with equipment and modifiers; `remaining = hp - damage`. |
| `XS.costToPlay(s, iid)` | PP that playing the card would cost right now (after modifiers; integer ≥ 0). |
| `XS.whyNot(s, iid)` | `null` when the card can be played now by the seat that must act, else one short sentence ("Needs 3 PP, you have 2 untapped."). |
| `XS.previewAttack(s, action)` | The damage number the attack would deal. `action` is `{type:'play', iid, attacker, target}` or `{type:'attack', attacker, target}` (the pending `attackPair` answer). Includes the seat's armed boosts, the attack card's own "damage +" (conditions evaluated now) and the attacker's ATK; floor 0 (R-016). |
| `XS.previewAttackDetail(s, action)` | `{total, atk, boosts:[{iid, amount}], card, goesDown, attackerId, targetId}`; `goesDown` is true when the card text downs the attacked leader outright (Crossfire / Demon King's Descent) and its condition holds now. |
| `XS.actionsFor(s, iid)` | The legal actions that mention this card id (as `iid`, `attacker`, `target`, or inside `ids`/`alloc`). |
| `XS.def(iidOrCardNumber, s?)` | The card record from `XS.CARDS`. |
| `XS.replay(init, actions)` | Rebuild a state: `newGame(init)` then each action. `s.init` and `s.actions` hold the pair for any state (bug reports, traces). |

Errors: `XS.Illegal` (an `Error` subclass, `name === 'Illegal'`). Anything else thrown is an engine bug.

## State (read-only for the UI; the UI uses `view`)

```js
s = {
  mode: 'full' | 'quick',
  seed, rng,                 // engine-private; absent from view
  phase: 'chooseFirst' | 'setup' | 'main' | 'over',
  round: 1,                  // 1-based; always 1 in quick
  needWins: 2 | 1,
  wins: [0, 0],              // rounds won per seat
  first: null | 0 | 1,       // first player of the CURRENT round (loser of the previous round, PM p.11)
  active: 0 | 1,             // whose turn (during setup: the round's first player)
  turn: 0,                   // global turn counter, +1 at every turn start (first turn = 1)
  roundTurn: 0,              // turns taken this round; the first player's first turn is 1
  roundLoser: null | 0 | 1,  // set the moment a team is fully downed; the round closes when resolution ends
  result: null | { winner: null|0|1, losers: [seat…], reason: 'rounds'|'tacticsDeckEmpty'|'bothLose'|'concede' },
  winner: null | 0 | 1,      // copy of result.winner
  players: [P0, P1],
  cards: { [iid]: { iid, id, owner, kind } },   // registry of every card instance; never changes after newGame
  pending: null | Pending,   // the one choice door; when set only answers to it are legal
  atk: null | { id, seat, card, seg, attacker, target, downs, excess, … },  // the attack being resolved
  log: [LogEntry…],          // append-only, oldest first
  seq: 0,                    // next log seq
  init: {…}, actions: […],   // newGame options and every action applied (replay)
  stack: [...]               // engine-private resolution frames; absent from view
}
P = {
  name, deckId, deckName,
  deck:  [iid…],     // index 0 = top. Hidden (count only) in view, for both seats.
  hand:  [iid…],     // hidden from the other seat
  play:  [iid…],     // play area, left → right in play order (PM p.04); public
  trash: [iid…],     // oldest first. Tactics cards are face up (public); every other card is face down
                     // and unviewable by anyone, owner included (PM p.16 Q7, FAQ #3). Face up <=> card type 'tactics'.
  tdeck: [iid…],     // tactics deck (5 at the start; never holds the PP Ticket, FAQ #57). Owner may look (PM p.05).
  tarea: [iid…],     // tactics area; face down (owner sees it, opponent sees placeholders) except the PP Ticket (face up, public)
  pp: { total: 3, untapped: 3 },      // PP cards: total in the zone, upright count
  leaders: [ L, L, L, L ],            // 4 slots, unordered for rules purposes (R-049)
  boosts: [iid…],    // armed 【アタック強化】 cards in the play area, in play order; consumed by the next attack
  tacPlayed: false   // a tactics card was already played this turn
}
L = { iid, cardId, slot, damage, down, awakened, equipment: [iid…] }   // iid like 'L03' (seat 0, slot 3)
```

Card instance ids: leaders `'L<seat><slot>'`; everything else `'c<n>'`. `s.cards[iid].kind` is the card type
(`leader|attack|memoria|tactics`); the PP Ticket has `ticket:true`. PP cards are counters, not instances.

Every card is in exactly one place: a player's `deck/hand/play/trash/tdeck/tarea`, or attached as equipment on a leader.

## Opening

`newGame` settles to the first decision:
1. `first: 'random'`: `phase:'chooseFirst'`, `pending.kind:'chooseFirst'`, `pending.seat` = the RPS winner (R-045). Answer `{type:'chooseFirst', first}` (`first` = the seat that will go first).
2. Round setup (`phase:'setup'`): `pending.kind:'pickTactics'` for the first player, then the second player (then, in a quick match, the second player once more: their second tactics card, PM p.05). Answer `{type:'pickTactics', iid}`.
   - **Hidden simultaneous pick.** The picks are secret and simultaneous in the real game. The engine asks one seat after another; the pick is hidden from the other seat in `view` (their `tarea` shows a placeholder; the `tacticsPick` log entry carries `{hidden:true}`) and is only revealed when the card is played (`tacticsPlay`).
   - **Bot:** `XS.legalActions(s)` lists one `pickTactics` per tactics-deck card; it chooses among them from `view(s, seat)`.
   - **Hot-seat UI:** read `XS.whoActs(s)`; before showing seat k's picker, show a "pass the device" screen; render `XS.view(s, k)`; after the answer, hide the board again until the next seat's turn to act.
3. Round 1 of a full match: the second player's PP Ticket is placed face up in their tactics area (log `tacticsPlace`). PP total set (3/4/5 by round; 3 in quick). Each player draws 4 (first player first, R-036). The first player's first turn starts: untap PP, draw 1 (PM p.17 Q13).
4. `phase:'main'`, no pending: the active player acts.

## Actions

All actions are plain objects.

```js
{type:'chooseFirst', first: 0|1}          // answers pending 'chooseFirst'
{type:'pickTactics', iid}                 // answers pending 'pickTactics' (iid in pending.options)
{type:'play', iid, attacker, target}      // ATTACK card from hand. attacker = own non-downed leader iid,
                                          // target = opposing non-downed leader iid (chosen at the play, = step 2.1 of PM p.12)
{type:'play', iid}                        // MEMORIA from hand; consumable TACTICS from the tactics area
{type:'play', iid, target}                // EQUIPMENT from the tactics area; target = own non-downed leader iid
{type:'play', iid}                        // ATTACK card whose text has a 【プレイ時】 (none in ST01/ST02): bare; the
                                          // attacker/target are then asked via a pending 'attackPair' after 【プレイ時】 resolves
{type:'attack', attacker, target}         // answers pending 'attackPair' (second and later 【アタックする】 of one card, or the bare case)
{type:'choose', ids:[iid…]}               // answers pending 'choose': ids ⊆ pending.options, min ≤ length ≤ max, no repeats
{type:'distribute', alloc:{[iid]: n}}     // answers pending 'distribute': sum(alloc) === pending.total, each value a multiple of pending.unit, keys ⊆ options
{type:'endTurn'}                          // leave the main phase (always legal in the main phase, R-048)
{type:'concede', seat}                    // either seat, any time; never listed in legalActions. Ends the match: that seat loses.
```

`legalActions` in the main phase lists: every playable hand card (`play` with the fields above; an attack card
appears once per (attacker, target) pair), every playable tactics-area card, and `endTurn`.
The tactics rules (one per turn; none on the first player's first turn of each round, FAQ #49; PP cost) are applied by `whyNot`.

## Pending decision (the one choice door)

`s.pending` is `null` or:

```js
{
  kind: 'chooseFirst' | 'pickTactics' | 'choose' | 'attackPair' | 'distribute',
  seat: 0 | 1,             // who must answer
  source: iid | null,      // the card whose effect asks (show it); null for rules-level decisions
  prompt: 'Choose a leader to take 10 damage.',   // short engine-authored imperative that names the effect and its numbers
  purpose: 'first'|'tactics'|'target'|'heal'|'discard'|'handLimit'|'order'|'attack'|'distribute'
         | 'look'|'reveal'|'may'|'freePlay'|'revive'|'awaken',   // the last six: 2026-10-30, see "Changes after freeze"
  options: [iid…],         // candidates (choose / pickTactics); leader iids or hand iids; [0,1] for chooseFirst
  min: 1, max: 1,          // choose: answer length bounds
  // attackPair:  attackers:[leader iid…], targets:[leader iid…], card: iid
  // distribute:  total: 80, unit: 10   (options = leaders that may receive)
}
```

Rules for decisions: **no auto-pick**. A choice is asked even with exactly one candidate (CLAUDE.md rule 4). The engine
decides alone only where the rules say "all" (every opposing leader; a hand smaller than the discard count: FAQ #47 — discard all of it)
or where there is nothing to choose (no legal target: the effect does nothing, FAQ #21, and a `fizzle` is logged).
When two or more 【アタック後】 effects wait, the turn player orders them one at a time (`purpose:'order'`, FAQ #121); the last one needs no order.
A mandatory target must be chosen if one exists (FAQ #133: "heal 1 leader" must pick a non-downed own leader, damaged or not).
Hand-limit discards (`purpose:'handLimit'`) are chosen by the hand's owner (R-020).

## Hidden information: `XS.view(s, seat)`

Same shape as the state with these changes:
- `rng`, `seed`, `stack`, `init`, `actions` are removed.
- **Decks (both seats)**: `deck` = `[{hidden:true}, …]` (length = count; order and contents unknown).
- **Opponent hand**: `[{hidden:true}, …]`. Own hand: iids.
- **Opponent tactics deck and tactics area**: placeholders, except the PP Ticket, which is face up in the area (iid shown). Own `tdeck` and `tarea`: iids.
- **Trash (both seats)**: face-down cards are `{hidden:true}` placeholders **even for the owner** (docs/rules.md §4: nobody may look at face-down trash, PM p.16 Q7, FAQ #3); tactics cards in the trash show their iid.
  The order of `trash` is preserved so counts and the face-up cards' positions are real.
- `cards`: only the registry entries for cards the viewer may see (leaders, play areas, equipment, face-up trash, own hand/tdeck/tarea, the Ticket). A hidden card's id never appears anywhere in the view.
- `pending`: for the other seat it keeps `kind, seat, source, prompt, purpose, min, max, total, unit` but `options` is `[]` when `kind` is `pickTactics` or `purpose` is `discard`/`handLimit`.
- `log`: entries redacted per type (below). `atk`: kept (attacker/target are public).
- `viewer`: the seat the view was made for.

## Log

`s.log` entries: `{seq, round, turn, seat, type, data, via}` (frozen objects). `seq` is the index. `seat` = the seat the
entry is about (acting or owning). `via` = iid of the card whose effect produced the entry (the UI indents it under that card), else `null`.
One entry point: `XS.log(s, seat, type, data, via?)`; nothing else writes `s.log`. Types and `data`:

| type | data | hidden in the other seat's view |
|---|---|---|
| `start` | `{mode, decks:[id0,id1], first}` | – |
| `rps` | `{winner}` | – |
| `chooseFirst` | `{by, first}` | – |
| `roundStart` | `{round, first, pp}` | – |
| `tacticsPick` | `{iid, cardId}` | `{hidden:true}` |
| `tacticsPlace` | `{iid, cardId, why:'ppTicket'}` (face up) | – |
| `draw` | `{iid, cardId, cause:'setup'\|'turnStart'\|'endPhase'\|'effect'}` | `{cause, hidden:true}` |
| `turnStart` | `{turn, roundTurn}` | – |
| `turnEnd` | `{turn}` | – |
| `ppRecover` | `{n, requested, cause:'untap'\|'effect'}` (`n` = cards actually turned upright) | – |
| `ppSpend` | `{n, for}` (`for` = the card iid) | – |
| `play` | `{iid, cardId, type:'attack'\|'memoria', cost}` (hand card played) | – |
| `tacticsPlay` | `{iid, cardId, subtype:'consumption'\|'equipment', cost}` (tactics-area card turned face up) | – |
| `equip` | `{iid, cardId, leader, seat, slot}` | – |
| `boost` | `{iid, cardId, phase:'armed'\|'applied', amount?}` (`applied` when an attack consumes it) | – |
| `attack` | `{attackId, seg, card, attacker, target, damage, parts:{atk, boost, card}}` | – |
| `damage` | `{leader, amount, kind:'attack'\|'effect', before, after}` (counters on the leader) | – |
| `heal` | `{leader, amount, requested}` (`amount` = counters actually removed) | – |
| `down` | `{leader, seat, slot, cause:'damage'\|'effect'\|'attack'}` | – |
| `awaken` | `{leader, seat, slot, cause:'attack'\|'effect', atk, hp}` | – |
| `ability` | `{src, cardId, timing}` (an effect group starts resolving; `via` of what follows) | – |
| `discard` | `{iids, cardIds, n, cause:'effect'\|'handLimit'\|'roundEnd'}` (face down to the trash) | `{n, cause, hidden:true}` |
| `trash` | `{iids, cardIds, faceUp:[bool…], cause:'endPhase'\|'roundEnd'}` (play area → trash) | – |
| `reshuffle` | `{seat, n}` (face-down trash shuffled into the deck; count only) | – |
| `tacticsBurn` | `{seat, iid, cardId}` (random tactics card to the trash face up, PM p.14 Q1) | – |
| `roundEnd` | `{round, winner, loser, wins:[a,b]}` | – |
| `matchEnd` | `{winner, losers, reason, wins:[a,b]}` | – |
| `fizzle` | `{src, cardId, reason:'noTarget'\|'emptyHand'}` (notice: an effect that could do nothing) | – |
| `overkill` | `{leader, n, excess, card}` (an オーバーキル condition held, R-063) | – |
| `echo` | `{iid, cardId, phase:'sideways'\|'replay'}` (R-071) | – |
| `look` | `{phase:'see'\|'reveal'\|'take'\|'trash', from:'deck'\|'hand', side, n, iids, cardIds, revealed}` | unless `revealed`: `{phase, from, side, n, revealed:false, hidden:true}` |
| `freePlay` | `{iid, cardId, type, from:'hand'\|'deck'}` (placed at the far right, R-074) | – |
| `revive` | `{leader, seat, slot, equipment:[iid], cardIds}` | – |

## Rules the numbers come from

Every number the UI shows: `leaderStats` (ATK, HP, damage, remaining), `costToPlay`, `previewAttack`,
`s.pp`, `s.wins`, counts from `view`. The UI computes nothing.

## Changes after freeze

(Additions only; each line dated and says what was added.)

- 2026-10-29 (M2, before the first UI use): `players[seat].aside: [iid…]` — the zone where a PP Ticket waits before it is placed (and for good in a quick match); public, present in `view`. Every card is in exactly one of `deck/hand/play/trash/tdeck/tarea/aside` or attached as equipment. (The contract text above listed the other zones only.)
- 2026-10-29: `view(s, seat).players[p].counts = {deck, hand, trash, tdeck, tarea}` (true counts, so the UI need not count placeholders) and `view(s, seat).seq` (= `s.seq`).
- 2026-10-29: engine-private state fields not in `view`: `losing`, `atkSeq`, `_via`. `s.arranged` appears only in test fixtures (positions edited through the doors; such a state is not replayable).
- 2026-10-29: helpers exported on `XS` and safe for the UI to call (pure): `XS.opp(seat)`, `XS.leaderStatsOf(s, leaderIid)`, `XS.aliveLeaders(s, seat)` (iids of leaders not down), `XS.hasTag(cardId, tag)`, `XS.cloneState(s)`, `XS.isLeader(iid)`, `XS.leaderSeat(iid)`, `XS.leaderSlot(iid)`.
- 2026-10-29: pending `purpose` values in use: `first`, `tactics`, `target` (leader to damage), `heal` (leader to heal; options include undamaged leaders, FAQ #133), `discard` (hand cards, effect), `handLimit` (hand cards, end phase), `order` (options are the iids of the cards whose 【アタック後】 may resolve next), `attack` (kind `attackPair`), `distribute`.
- 2026-10-29: `s.atk` while an attack resolves: `{id, seat, card, seg, attacker, target, downs, excess, closed}` (`seg` = which 【アタックする】 of the card, 0-based).
- 2026-10-29: a 【アタック後】 `ability` log entry is written even when its condition then turns out false (the entry means "this effect group started resolving"); read `damage` / `draw` / `heal` entries with the same `via` for what happened.
- 2026-10-29: rulings added with the engine: R-053 … R-062 (`docs/rulings.md`).
- 2026-10-30 (booster engine groundwork; details in docs/ABILITIES.md and R-063 ... R-075):
  - **Pending purposes** (all `kind:'choose'`, answered with `{type:'choose', ids}`; `min:0` means the player may decline with `ids:[]`): `look` (cards looked at on a deck; extra field `to:'hand'|'trash'` says where the pick goes), `reveal` (hand cards to reveal), `may` (yes/no: `options:[source]`, answer `[source]` = yes, `[]` = no), `freePlay` (cards to play for free; the order of `ids` is the play order), `revive` (a downed own leader), `awaken` (an own leader). Existing purposes may now carry `min:0` (`discard`, `target`) and `max > 1` (`target` for 最大N体). A pending may carry `limit: {costSumAtMost?, costSumAtLeast?, perType?}`; `apply` refuses a pick that breaks it and `legalActions` only samples picks that respect it. `discard` and the new card-choosing purposes hide `options` from the other seat: `HIDDEN_OPTIONS = discard, handLimit, look, reveal, freePlay` (+ `pickTactics`). The chooser's `view.cards` includes the options, also cards that are on a deck (`look`).
  - **Log types** (frozen entries, `seat` = the acting player): `overkill {leader, n, excess, card}` (an オーバーキル condition held; public); `echo {iid, cardId, phase:'sideways'|'replay'}` (public); `look {phase:'see'|'reveal'|'take'|'trash', from:'deck'|'hand', side, n, iids, cardIds, revealed}` - **hidden rule**: when `revealed` is false and the viewer is not `seat`, the entry becomes `{phase, from, side, n, revealed:false, hidden:true}` (no ids); `reveal` entries and a `trash` of revealed cards are public; `freePlay {iid, cardId, type, from:'hand'|'deck'}` (public: the card is in the play area); `revive {leader, seat, slot, equipment:[iid], cardIds}` (public). `boost` may carry `afterOnly:true` (armed, a memoria with only an 【アタック後】) and `amount:0` (applied). `down.cause` may be `'attack'` (a down by the attack's own effect, Crossfire/魔王降臨). `fizzle.reason` is unchanged. Cards looked at from a deck are never named to the other seat unless revealed.
  - **State** (engine-private, absent from `view` except `players[].sideways`): `s.freeQ [iid]` (free-played cards waiting to resolve), `s.once {key: turn}` (once-per-turn marks), `s.lastLoser` (loser of the previous round or null), `players[].sideways [iid]` (Echo cards lying sideways; also in `view`), `players[].buffs [{stat, n, until}]`, `players[].discards` (hand cards discarded this turn). `XS.normalize(s)` gives a state built outside `newGame` the empty value of each (called by `apply` on its copy). `s.atk` also holds `dealt, remain, plus, afterOpen, afterDealt` (`excess` = `dealt - remain`, floor 0, updated by every damage to the attacked leader, R-063).
  - **Resolution frames** `freeQueue` and `echoStart`; every `play` action first pushes a `freeQueue` frame so effects that play cards for free resolve after the whole play (R-074).
  - **Functions** (pure, safe for the UI): `XS.costParts(s, iid)` -> `{base, mods:[{src, n}], total}` (`XS.costToPlay` returns `total`; it now includes cost modifiers, FAQ #138), `XS.seatAtkBonus(s, seat)`, `XS.attackTargets(s, seat)` (the legal attack targets after ターゲットフラッグ), `XS.matchesFilter(cardId, filter, srcCardId)`, `XS.limitOk(limit, cardIds)`, `XS.attackStepOps(cardId, seg)`, `XS.boostParts`. `XS.whyNot` also reports a `playIf` restriction. `previewAttack` is unchanged in meaning: it reads the card's "damage +" ops whose conditions hold now; a bonus that depends on a choice made during the attack (そうしたなら) or on an earlier draw is not in the preview.
  - **Attack step order** (R-065): the card's effects run before the damage; the `attack` log line is written when the damage value is final (before the effects when they cannot change it, as before; otherwise after them).
  - **Equipment stats** are `CARDS[no].equip` (`hp`, `atk`, `hpBase`, `hpBaseAwakened`), read by `leaderStats`; the Light Shield `statMod` op is gone from `data/abilities.js`.
- 2026-10-30 (engine gaps, no contract change): effect-group frames gain `healed` (counters removed by `heal` / `healTotal` of the group, from the return value of `doors.heal`); value `{healed:true}` reads it (BP02-076 ドレインロッド, FAQ #64, R-076). `doors.heal` already returned the counters actually removed and logs them as `heal.amount` (`requested` = the asked N). Nothing in `view`, `legalActions` or the log changed.
