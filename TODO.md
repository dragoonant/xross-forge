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

## Client
8. ~~**AI worker cache-busting**~~ **done 2026-10-30 (M7)** — — `js/ai/worker.js` and its `importScripts` list are not `?v=`-stamped (only `index.html` assets are), so a change to the worker alone can be served stale for up to Pages' 10-minute cache. Done when: `tools/stamp-assets.mjs` stamps the worker URL and its imports, and `--check` covers them.
9. ~~**Polish seen in M3 screenshots**~~ **done 2026-10-30 (M7, with e2e assertions that failed first)** — — target-preview damage badges cover the leader names; on a 390x844 phone the hand row sits partly under the lower-third caption. Done when: the M7 layout pass fixes both and the layout test asserts them.
10. ~~**Audio not verified by ear**~~ **owner approved 2026-10-29 ("the art and sound are fine as they are"; mix gains untouched)** — (M6, D18) — every take was chosen by numbers (crest factor, length, silence). Done when: the owner has listened on `sounds.html` and the rejects are re-rolled (`node tools/gen-audio-local.mjs --force --only <tag>` then `node tools/measure-audio.mjs`), and the mix gains in `data/audio-cues.js` have been set by ear.
11. ~~**Art QC is by contact sheet only**~~ **owner approved 2026-10-29 (the style pick stands)** — (M5, D18) — the plates were checked against `docs/art.md`'s checklist on `tools/out/contact/*.jpg`; the owner has not seen them, and STYLE (candidate A) was the session's pick. Done when: the owner has played with them, confirmed or re-picked the style, and named the re-rolls (`node tools/gen-art-local.mjs --force --only <key> --seed 1`).
13. **A reload mid-prefetch warns** — `XS.Audio` decodes every clip after the first gesture; the e2e's settings check reloads the page while those fetches are in flight, and once in three runs one was reported as `audio load failed: vo-round-2 (Failed to fetch)` and failed the "zero console errors" check (2026-10-29; the file exists and every other run passed). Done when: a fetch aborted by navigation is not reported as a load failure (check `document.visibilityState` / `pagehide` before warning), with the e2e run three times clean.
12. **Plates and clips are not `?v=`-stamped** — `art/**/*.webp` and `audio/*.mp3` are reached through the manifests, not `index.html`, so a re-rolled file under the same name can be served stale for up to Pages' 10-minute cache. Done when: the manifest writers put a content hash in each `file` (`?v=`) and the checkers strip it.
