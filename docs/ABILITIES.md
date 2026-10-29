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
| `attack` | 【アタックする】 | the attack itself; `dmgPlus` ops are summed into the damage value, other ops run right after the damage is dealt. A card with several 【アタックする】 has several `attack` effects (R-025) |
| `afterAttack` | 【アタック後】 | after the damage, in the turn player's order (FAQ #121). A memoria/tactics card's runs for the attack it boosted only (FAQ #36) |
| `boost` | 【アタック強化】 | a memoria/tactics card arms it when played; the next attack consumes it. Only `dmgPlus` belongs here |
| `onAwaken` | 【覚醒時】 | a leader, right after it awakens (exactly one per leader) |
| `round` | 【ラウンド中】 | reserved (no first-slice card) |
| `static` | none | read by the engine, never run: `statMod` (equipment stats), `ticketRule` (setup) |

The printed tags and numbers must match: `node tools/audit-cards.mjs` compares each entry with the
printed Japanese text in the gitignored dump (every printed number appears in the entry, no number
appears that is not printed, tags equal timings). Write every printed number as a number; do not
compute them from other numbers.

## Ops, conditions, targets

Every op may carry `if: { c: ... }` (skipped when false; conditions are read **when the op resolves**,
so ordering matters, FAQ #2).

| op | fields | does |
|---|---|---|
| `dmgPlus` | `n`, `if?` | damage + N (attack / boost timings only). Summed with ATK and boosts; floor 0 (R-016) |
| `downAttacked` | `if?` | the attacked leader goes down (Crossfire; counts as a down by the attack, R-026) |
| `damage` | `n`, `to` | N damage to `to` (below). `n` may be `{perOwnTag: {tag, each}}` (downed leaders count, FAQ #10). N <= 0 does nothing (R-062) |
| `heal` | `n`, `to` | remove up to N counters from the chosen leader (a leader that is not down; undamaged is allowed, FAQ #133) |
| `healTotal` | `n`, `unit` | the player splits exactly N among their leaders in multiples of `unit` (R-057) |
| `draw` | `n` | draw N (deck-out procedure inside the door, PM p.14 Q1) |
| `discard` | `n` | the player discards N from their hand (asked; all of it if fewer than N, R-056) |
| `recoverPP` | `n` | turn up to N sideways PP upright (FAQ #7) |
| `statMod` | `stat`, `n` | static: `hp` / `atk` bonus of an equipment card |
| `ticketRule` | `round` | static marker of the PP Ticket's setup rule (flow.js places it) |

Conditions (`c`): `attackedDown` (the attacked leader is down now, R-053), `handAtMost {n}`,
`memoriaAtLeast {n}` (own play area, the card itself counts, FAQ #43), `ownDownAtLeast {n}`,
`allOwnTag {tag}` (downed leaders count, FAQ #10).

Targets (`to`): `{ side: 'own'|'opp', count: 1 | 'all', other?: true }`. `count: 1` is a **choice**: the
player is always asked, even with one candidate (CLAUDE.md rule 4). `count: 'all'` takes every
leader that is not down, without asking. `other: true` excludes the leader that received this attack
(R-023). With no legal target the op does nothing and logs `fizzle` (FAQ #21).

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
- **ST01-023 Light Shield**: `static` -> `statMod hp +30`; read by `XS.leaderStats`, so HP, remaining HP and "goes down" all see it.
- **ST01-024 PP Ticket**: `static` `ticketRule` (round 1, second player) plus `onPlay` -> `recoverPP 1`.

## Adding an op or a condition

1. Add the handler to `XS.OPS` (or `XS.COND`) in `js/engine/abilities.js`, ask-first.
2. Add its required fields to `REQUIRED` in `tools/validate-abilities.mjs`.
3. Write the entries; run `node tools/validate-abilities.mjs` and `node tools/audit-cards.mjs`.
4. One behaviour test per card number in `tests/20-cards.js`, driven through `XS.apply` (positions via `XS.T.fx`, which edits only
   through the engine's doors). Include the single-candidate case for every targeted effect.
5. Break the ability on purpose and watch the test fail before you trust it.

## When a card cannot be done faithfully

Do not approximate. Write `{ unimplemented: 'why' }` for the op and list the card in `data/defects.js`
(CLAUDE.md rule 8); `validate-abilities` refuses an `unimplemented` op on any card of a registered deck,
and `validate-data` refuses a defective card in a deck. Not implemented today (no first-slice card needs
them): Overkill, Echo, 【ラウンド中】, free play, replay, equipment-granted 【アタック後】 (R-028), look-at-deck effects.
