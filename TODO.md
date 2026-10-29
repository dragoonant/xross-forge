# TODO

What exists today, the constraint, and done-when, per item. Decisions live in `PLAN.md`; rules
ambiguities in `docs/rulings.md`. Items here are **not** bugs in the shipped starters (the M2
rules review, 2026-10-29, found 0 wrong behaviours for ST01/ST02); they are paths the first
booster cards will need.

## Before the first booster batch (from the M2 rules review, `tools/out/m2-review.md`)
1. **Overkill excess** — today `js/engine/attack.js` records excess only from the attack's own
   damage. FAQ #115: an 【アタック後】 that downs the attacked leader triggers later オーバーキル.
   Done when: excess also counts 【アタック後】 damage to the attacked leader (R-005), with a test
   driven through `apply`.
2. **Order inside 【アタックする】** — damage is dealt first, then the card's other attack-step
   effects. PM p.12 ②-② and FAQ #8 put damage-bonus conditions and extra effects before the
   damage. Same final state for Crossfire/魔王降臨; wrong for draw/discard-then-bonus cards.
   Done when: the attack step resolves the card's effects in printed order before damage (R-026
   revised), with a test per pattern.
3. **Crossfire / 魔王降臨 down cause** — logged `cause:'effect'`; R-026 treats it as a down by the
   attack (awakening is already correct). Done when: logged as the attack's down.
4. **Memoria with 【アタック後】 but no 【アタック強化】** (FAQ #65) — `js/engine/api.js` arms only
   boost cards, so it would never attach to an attack. Done when: any memoria with an
   【アタック後】 attaches to the next attack.
5. **Sim leak scan skips the log** (`tools/sim.mjs`) — the review's stricter probe scanned the log
   too (0 leaks in ~14,500 views). Done when: the sim scans `view().log` for hidden ids.
6. **Test hygiene** — `tests/10-rules.js` mixed-tag test asserts only the positive case; some
   fixtures use damage values that real play never produces (95, 105, 25). Done when: negative
   case added and fixtures use multiples of 10.
7. Unimplemented ops listed in `docs/ABILITIES.md` (Overkill, Echo, 【ラウンド中】, free play,
   look at deck, cost modifiers, "may" choices, sanctioned BAN check R-030).
