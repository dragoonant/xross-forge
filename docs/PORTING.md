# Porting map: lorecannae and GRAND LINE to xross-forge

What the M0 scaffold took from the owner's newest card game, what is waiting to be ported, and
what stays behind. Written at M0 so M1 (card data), M2 (engine), M3 (UI) and later milestones port
code deliberately instead of by memory.

Namespace: lorecannae used `LC`, GRAND LINE used `window.OP`, xross-forge uses `XS` on
`globalThis`. Every file is an IIFE; no build step; no npm dependencies (Node 22+ built-ins only).

## Sources, pinned

Both repositories are public. A local clone does not survive a container restart; re-create it:

```
git clone https://github.com/dragoonant/lorecannae
git -C lorecannae checkout 9c8016d52e1de844789bbe953db5597ca42d7ae0   # 9c8016d, 2026-10-27

git clone https://github.com/dragoonant/grandline
git -C grandline checkout b816d3cfccce00666dc2bebd83a58db783989618    # b816d3c, 2026-10-27
```

In the tables below `L` means lorecannae `@ 9c8016d` and `G` means GRAND LINE `@ b816d3c`.

## Verdicts

- **KEEP**: copied (and renamed `LC` to `XS`) in M0. It is in this repository now.
- **ADAPT (Mn)**: the structure or technique is reusable; the content is Lorcana- or One-Piece-specific.
  Port it in milestone `Mn`.
- **DROP**: Lorcana-only (ink, quest, sing, shift, lore, inkwell, per-ink card scripts, Disney art
  direction) or superseded. Do not port; the "target" column says where the Xross Stars equivalent
  will live if there is one.

Milestones are those of the table in `PLAN.md`: M1 card data (schema, `build-cards`, `defects.js`,
art and sound manifests declared empty and failing), M2 engine (plus auditor, sim, rules review),
M3 playable on Pages vs a random bot (board, viewers, prompts, animation director, how to play),
M4 AI, M5 art (Gemini), M6 audio (ElevenLabs), M7 polish (phone/touch, save/continue, settings, bug
report, deck picker). Game facts below (rounds, PP, awaken, tactics, `XS.view`) are from `PLAN.md` and
`CLAUDE.md`; this file does not restate rules.

## 1. lorecannae: `js/`

| Source | Verdict | Reason | Target |
|---|---|---|---|
| `js/ns.js` @ L | KEEP | Namespace, `Illegal`, `clone`; its RNG half was split out; `INKS` dropped (Lorcana ink colours) | `js/ns.js`, `js/rng.js` |
| `js/engine.js` @ L | ADAPT (M2) | Keep the architecture: `apply` clones then runs the action as a job; `settle()` runs state checks, the trigger bag and pending jobs; a job that needs a decision throws an `Ask`, the state rewinds to a snapshot and the answer re-runs the job (PLAN D10); one door each for damage, choices, costs, zone moves, characteristics; `makeTrace`/`replay`; deck-validity check. Everything else (ink, quest, challenge, sing, shift, boost, lore, locations, Lorcana keywords) is DROP and is rewritten from the Xross Stars rules (rounds and best of 3, PP, attacks and boosts, down/awaken, tactics). New in Xross, absent in lorecannae: `XS.view(state, seat)` for hidden information (`CLAUDE.md` rule 7) | `js/engine.js` (split into several files as it grows) |
| `js/abilities.js` @ L | ADAPT (M2) | The pattern is reusable: a context object `x` whose helpers call the engine's doors, so card scripts never touch state directly. The helper set follows the Xross Stars effect vocabulary, not Lorcana's | `js/abilities.js` |
| `js/ai.js` @ L | ADAPT (M4) | Skeleton is generic: enumerate `legalActions`, `apply` each, settle our own follow-up asks greedily, `evaluate()`, compare with the do-nothing baseline, levels easy/normal/hard. Weights and evaluate terms (lore race, ink curve, singers) are DROP; every new weight carries its reason. PLAN M4 runs it in a worker and scores it against do-nothing | `js/ai.js` |

## 2. lorecannae: `js/ui/`

Everything here is view layer. Rule carried over: every affordance derives from `legalActions`, every
number shown comes from an engine function, and a missing module throws (no `if (!XS.x)`).

| Source | Verdict | Reason | Target |
|---|---|---|---|
| `js/ui/main.js` @ L | ADAPT (M3) | Boot that throws loudly on a missing engine function or data module; `js/ui/boot.js` already carries the pattern for the M0 title screen and is replaced by this | `js/ui/main.js` |
| `js/ui/core.js` @ L | ADAPT (M3) | Generic DOM helpers (`el`, `$`, `svgEl`), shared animation phase, wrapped localStorage, one shared tooltip stay; ink colours and rules-text icons are DROP | `js/ui/core.js` |
| `js/ui/title.js` @ L | ADAPT (M3) | Splash, picker (mode, AI skill, Start) and chooser flow; the Start click unlocks audio. Modes become full match (best of 3) and quick match; disclaimer text, deck sources and Lorcana wording are rewritten. Replaces the M0 placeholder in `boot.js` | `js/ui/title.js` |
| `js/ui/game.js` @ L | ADAPT (M3) | Match controller: modes, the one `apply` funnel, the bot loop, redraw, the drag manager (tap reads, drag commits). The drop targets (play area, inkwell, lore track, rival) are Xross-specific | `js/ui/game.js` |
| `js/ui/cardview.js` @ L | ADAPT (M3) | One card renderer, three sizes (board / hand / preview), art fills the face, text on a measured scrim. The frame fields (ink cost, strength, willpower, lore) are DROP; Xross Stars card fields come from M1 data | `js/ui/cardview.js` |
| `js/ui/boardart.js` @ L | ADAPT (M3) | Technique only: ONE geometry table in a fixed board space used both to draw each slot and to place each DOM zone by percentage. The storybook table, inkwell pool and 20-star lore trail are DROP | `js/ui/boardart.js` |
| `js/ui/preview.js` @ L | ADAPT (M3) | Hover preview (PLAN: hover zoom), tap inspector, hold-to-peek, spotlight of every played card, read-only zone browser (PLAN: public-zone viewers). Generic; keyed on `data-card-id`. Must read through `XS.view`, never raw state | `js/ui/preview.js` |
| `js/ui/logtext.js` @ L | ADAPT (M3) | Structured log entries to segment lists (strings and card references). The phrase table is per log type, so it is rewritten for the Xross log types defined in M2 | `js/ui/logtext.js` |
| `js/ui/logpanel.js` @ L | ADAPT (M3) | Prompt line, recently-played strip, newest-first log with card names as hover doorways. Generic | `js/ui/logpanel.js` |
| `js/ui/targeting.js` @ L | ADAPT (M3) | How the game asks: the question lives on `s.ask`, the UI builds the answer; no auto-pick, one candidate or fifty. Ask kinds follow the M2 contract | `js/ui/targeting.js` |
| `js/ui/hud.js` @ L | ADAPT (M3) | Log drawer, turn banner, card action popover, help ("how to play") and results panels. The hot-seat curtain only matters if hot-seat is a mode; the first slice is vs AI | `js/ui/hud.js` |
| `js/ui/touch.js` @ L | ADAPT (M7, phone/touch) | Phone classes, portrait gate, resting hand fan, recent-plays column. The tap/drag/hold engine itself is in `game.js` and `preview.js` here, and in one file in GRAND LINE (section 7); take GRAND LINE's for the gesture code | `js/ui/touch.js` |
| `js/ui/anim.js` @ L | ADAPT (M3, the "animation director") | Pure `plan(prev, next, fresh)` turns new log entries into steps, `run()` plays them on the old board; testable headless. Quest, challenge, song and lore-gain animations are DROP; the awaken stinger (PLAN D7) is new | `js/ui/anim.js` |
| `js/ui/sound.js` @ L | ADAPT (M6; PLAN: SFX on log tags, music director with round and match-point tiers) | SFX ride the structured log (`sound` tag or per-type mapping), rate-limited, with a procedural Web Audio floor. The tag-to-clip mapping is rewritten | `js/ui/sound.js` |
| `js/ui/tutorial.js` @ L | ADAPT (M7, optional) | Coach bubbles triggered by game situations, each once, skippable. Content is Lorcana. PLAN M3 only asks for a "how to play" panel (`hud.js`); tutorial depth is first on the cut order | `js/ui/tutorial.js` |
| `js/ui/deckbuilder.js` @ L | ADAPT (M7, deck picker) | The first slice has two fixed starter decks (PLAN D8), so M7 needs a picker; a full builder (browse, wrapped localStorage, legality from the M2 deck check) waits for more products and is on the cut order | `js/ui/deckbuilder.js` |
| `js/ui/dev-fixture.js` @ L | ADAPT (M3) | Dev-only `?fixture` quick start that skips the title screens; excluded from the silent-fallback gate | `js/ui/dev-fixture.js` |

## 3. lorecannae: `tools/`

| Source | Verdict | Reason | Target |
|---|---|---|---|
| `tools/serve.mjs` @ L | KEEP | Static server with `no-store`; port 8232; also refuses `docs/sources` and `docs/knowledge-base` | `tools/serve.mjs` |
| `tools/test.mjs` @ L | KEEP | Runs tests.html's script list under `node:vm`; exports `loadPage` for later tools; fails when zero tests ran | `tools/test.mjs` |
| `tools/check-pages.mjs` @ L | KEEP | Shared engine script list, files exist, silent-fallback ban; added: no external script URLs, every `tests/*.js` is loaded | `tools/check-pages.mjs` |
| `tools/stamp-assets.mjs` @ L | KEEP | `?v=<content hash>` on every local script and stylesheet in index.html; `--check` fails when stale | `tools/stamp-assets.mjs` |
| `tools/gate.mjs` @ L | KEEP | One command, one line per step; added: runs from any directory, pending lines that do not fail | `tools/gate.mjs` |
| `tools/build-cards.mjs` @ L | ADAPT (M1) | Generates card data from a cached source dump; Lorcast API, set codes and the championship deck list are DROP. The input is the official card API dump that `tools/fetch-cards.mjs` writes to gitignored `docs/sources/api/`; the starter lists are `data/decklists.json`. Output text is our own English (PLAN D9) | `tools/build-cards.mjs` |
| `tools/audit-cards.mjs` @ L | ADAPT (M2) | See "Nearly verbatim later" below | `tools/audit-cards.mjs` |
| `tools/sim.mjs` @ L | ADAPT (M2 random policy, M4 AI policy) | See below | `tools/sim.mjs` |
| `tools/replay-report.mjs` @ L | ADAPT (M2) | See below | `tools/replay-report.mjs` |
| `tools/build-art-prompts.mjs` @ L | ADAPT (M5) | See below | `tools/build-art-prompts.mjs` |
| `tools/gen-art.mjs` @ L | ADAPT (M5) | See below | `tools/gen-art.mjs` |
| `tools/gen-audio.mjs` @ L | ADAPT (M6) | See below | `tools/gen-audio.mjs` |
| `tools/shrink-art.mjs` @ L | ADAPT (M5) | ffmpeg (libwebp) delivery encodes from masters; card width, crop and quality are re-chosen for the new art source and card aspect | `tools/shrink-art.mjs` |
| `tools/write-manifest.mjs` @ L | ADAPT (M1 declares the empty manifests; M5/M6 fill them) | See below | `tools/write-manifest.mjs` |
| `tools/check-art.mjs` @ L | ADAPT (M1 as a failing gate; passes after M5/M6) | See below | `tools/check-art.mjs` |
| `tools/contact-sheet.ps1` @ L | DROP | Windows PowerShell and `System.Drawing`; this environment is Linux. PLAN D4 wants contact sheets of 16 for art QC: write a Node + ffmpeg or Playwright version in M5 | none |
| `tools/art/gpu.mjs` @ L | DROP | Local GPU lock file and Windows process probes for a local image studio; neither exists for a hosted API | none |
| `tools/art/style.mjs` @ L | ADAPT (M5) | One byte-identical style block per card prompt, linted like any prompt. The MGSD chibi / feature-animation direction was Lorcana's owner pick; Xross Stars needs its own decision | `tools/art/style.mjs` |
| `tools/art/who.mjs` @ L | ADAPT (M5) | Identity table, one clause per character, so every version looks the same (PLAN D4: one entry per talent avatar). Keep the shape; the entries are Lorcana characters (DROP) | `tools/art/who.mjs` |
| `tools/art/scenes.mjs` @ L | ADAPT (M5) | Per-card scene table (act and setting). Keep the shape; the entries are DROP | `tools/art/scenes.mjs` |
| `tools/art/ui.mjs` @ L | ADAPT (M5) | UI plates (title, boards, deck chooser) as prompt table; PLAN M5 lists playmat, title and UI plates. Castle ban (PLAN D16) is a Lorcana trade-dress rule; re-decide for Xross | `tools/art/ui.mjs` |
| `tools/art/audition-mgsd.mjs` @ L | DROP | The MGSD style audition for Lorcana | none |
| `tools/art/art-prompts.json`, `tools/art/audition-prompts.json` @ L | DROP | Generated prompt files keyed on Lorcana card ids | none |

### Nearly verbatim later: what each tool must change

These are generic enough to port with a rename (`LC` to `XS`) plus the changes listed. Gemini image
API and ElevenLabs replace lorecannae's local studios; this is a note only, nothing is built in M0.

| Tool | Change when porting |
|---|---|
| `gen-art.mjs` | Replace the local Flux Studio calls (`/api/settings`, `/api/jobs`, poll, `/files/...`) with a call to the Gemini image API; the key is the environment secret `GEMINI_API_KEY` (PLAN D4), never in the repo. PLAN D6: every paid run starts with a dry-run plan and 3 samples. Drop the GPU-sharing flags (`--yield`, `--lock`, `--max-seconds`) and `gpu.mjs`. Keep: idempotent (an id with a master is skipped), `--only`, `--force` archives the old master, `--dry-run` makes no network call, masters under gitignored `art/masters/`. The FNV seed per id only helps if the API takes a seed; check, do not assume reproducibility |
| `gen-audio.mjs` | Replace Stable Audio Open and ACE-Step (local Audio Studio) with ElevenLabs (PLAN D5: SFX, music and an original announcer voice, never a cloned voice of a real talent), subject to what the account's plan offers. Keep the ffmpeg half: decode, trim silence, fade-out, loop crossfade, peak normalise, MP3 encode, gain written to `audio/gains.json`. The multi-take scoring and `--repick` only matter if the API returns several takes. Output was chosen by numbers, not by ear; say so again |
| `build-art-prompts.mjs` | Keep the lint and `--selftest`: it refuses to write on any violation (text-magnet words, negations, counts above two, over-length). Replace the banned-name list (Lorcana franchise, studio, film, artist and character names) with the franchise, agency, studio and artist names of `CLAUDE.md` rule 11, and re-decide whether a talent's name may appear in a prompt (PLAN D2: art is our own depiction of the recognisable avatar). Style and scene inputs come from `tools/art/*` |
| `check-art.mjs` | Keep: every card id has a manifest entry whose file exists with exact case, is non-empty and has real WebP (`RIFF....WEBP`) or MP3 magic; every manifest entry points at a known card. Swap the data globals (`XS.CARDS`, `XS.ART`, `XS.AUDIO`); `--allow-missing` stays. PLAN M1 declares the manifests empty and failing, so this step turns on in the gate in M1 |
| `write-manifest.mjs` | Writes `data/art-manifest.js` and `data/audio-manifest.js` from what is on disk, never from a wish list. Only the global (`XS.ART`, `XS.AUDIO`) and the card-id-to-path rule change |
| `replay-report.mjs` | Replays a saved trace headlessly and reports ILLEGAL / THREW / DIVERGED. Needs the M2 engine's `XS.makeTrace` and `XS.replay`; the `--selftest` game uses `XS.ai.choose` in lorecannae, so it uses a random-legal-action policy until M4 |
| `sim.mjs` | Headless games with invariants after every step (a crash gate, not a balance instrument). The invariants walk the state shape (zones, damage, "under" cards), so they are rewritten for the Xross state; the script loader and the policy/seed/games flags carry over. Random policy in M2, AI policy in M4; add a hidden-information leak test (`CLAUDE.md` rule 7: only `XS.view(state, seat)` may expose hand, deck order and the face-down tactics pick) |
| `audit-cards.mjs` | Printed-vs-scripted auditor: FAIL when a number in the printed text is absent from the card's script, WARN when an ability name is not used. The keyword regex and the ALL CAPS ability-name regex are Lorcana's and must be rewritten against the Xross Stars text format. The official API's `effect` text is Japanese with bracketed trigger tags (for example the awaken tag 【覚醒時】) and may use full-width digits, so number matching needs full-width digit and kanji-numeral handling; check against the M1 data. Keep `--selftest` |

## 4. lorecannae: `tests/`

| Source | Verdict | Reason | Target |
|---|---|---|---|
| `tests/harness.js` @ L | KEEP | Runner plus `eq`/`ok`/`throws` and the `act`/`legal`/`answer` helpers. The position builders (`T.game`, `T.find`, `T.zone`) hard-code Lorcana's state and are ADAPT (M2) once the Xross state exists | `tests/harness.js` |
| `tests/01-rules.js` @ L | ADAPT (M2) | Method is the keeper: name each test for the rule or card number it asserts (`CLAUDE.md` rule 9), build an exact position, act only through `apply`, assert the side effect. The tests themselves are DROP | `tests/01-rules.js` |
| `tests/02-review-regressions.js` @ L | DROP | Regressions from a Lorcana card review; the habit (a regression test per review finding) is ADAPT (M2 onward) | `tests/02-review-regressions.js` |
| `tests/cards-amber.js`, `cards-amethyst.js`, `cards-emerald.js`, `cards-steel.js` @ L | DROP | One behaviour test per Lorcana card, grouped by ink; the one-test-per-scripted-card rule is ADAPT (M2 onward) | `tests/cards-<group>.js` |
| `tests/99-content.js` @ L | ADAPT (M2) | Content gates: every deck card is scripted or listed in the defects file; every deck is legal. Rewritten for the Xross deck rules | `tests/99-content.js` |

## 5. lorecannae: `docs/`

| Source | Verdict | Reason | Target |
|---|---|---|---|
| `docs/ENGINE-API.md` @ L | ADAPT (M2) | Keep the shape: surface table, state, actions, `Ask`, `chars`, log-entry table, "additions allowed, renames not". All content (ink, quest, sing, shift, lore) is rewritten with the Xross engine | `docs/ENGINE-API.md` |
| `docs/ABILITIES.md` @ L | ADAPT (M2) | Authoring guide for card scripts; written after `js/abilities.js` exists | `docs/ABILITIES.md` |
| `docs/ai.md` @ L | ADAPT (M4) | AI weights with their reasons and measurements; Lorcana numbers are DROP | `docs/ai.md` |
| `docs/rights.md` @ L | ADAPT (M0, exists) | Rights-holder findings, written before engine code; the Disney, Ravensburger, Pixelborn and Duels.ink findings are DROP. xross-forge's own `docs/rights.md` was written in M0 | `docs/rights.md` |
| `docs/rules.md` @ L | ADAPT (M0, written in parallel) | Citation index to the official rules, so engine comments and tests cite a source. Lorecannae cites `CR x.y.z`; xross-forge cites `(PM p.7)`, `(FAQ #138)`, `(R-012)` per `CLAUDE.md` rule 9. Adopt the citation style, not the content | `docs/rules.md` |
| `docs/sources.md` @ L | ADAPT (M0, exists) | Provenance of every input (what, when, how to fetch again); entries are DROP | `docs/sources.md` |
| `docs/takedown.md` @ L | ADAPT (M0, exists; PLAN D2 asks for takedown-ready) | Takedown as commands, in levels (end the hosted copy, withdraw names and text, make it unplayable, remove everything derived). Rewrite the commands for this repository and this deploy | `docs/takedown.md` |

## 6. lorecannae: everything else

| Source | Verdict | Reason | Target |
|---|---|---|---|
| `index.html`, `tests.html` @ L | KEEP (shell) | Engine block between `<!-- engine -->` markers shared by both pages; `index.html` is stamped, `tests.html` is not. The board DOM (zones, hand bar, log drawer, rotate gate) is ADAPT (M3) | `index.html`, `tests.html` |
| `styles.css` @ L | DROP | 1299 lines of storybook styling for the Lorcana board; M0 has its own esports-broadcast stylesheet; board CSS is written in M3 | `styles.css` |
| `.claude/launch.json`, `.nojekyll`, `.gitignore` @ L | KEEP | Port 8232; no Jekyll; secrets, raw research and art/audio masters ignored | same paths |
| `CLAUDE.md`, `PLAN.md` @ L | ADAPT (M0, exist) | Hard rules and the decision table were the model for this repository's own | `CLAUDE.md`, `PLAN.md` |
| `DEVIATIONS.md`, `TODO.md`, `HANDOFF.md` @ L | ADAPT | Rules not yet kept, improvements, session hand-off; start empty when needed | same paths |
| `NOTICE.md` @ L | ADAPT (M0, exists; the in-game disclaimer string in `title.js` lands in M3 and must match) | Notice plus the verbatim in-game disclaimer (`title.js` carries the same string; change both together); rights-holder names are DROP | `NOTICE.md` |
| `manifest.webmanifest`, `sounds.html` @ L | ADAPT (M7, M6) | Add-to-home-screen manifest (names, colours, orientation re-decided) and the sound audition page (PLAN D5: the owner listens there). The Pages workflow stages both only if present | same paths |
| `data/cards.js`, `data/decks.js` @ L | DROP | Generated Lorcana data; the Xross equivalents come from the M1 builder (`data/cards.js`) and `data/decklists.json` | `data/cards.js` |
| `data/abilities/*.js`, `data/raw/nacc-decks.txt` @ L | DROP | Per-ink Lorcana scripts; championship decklists | `data/abilities/*.js` |
| `data/defects.js` @ L | ADAPT (M1) | The list of cards that do not play as printed, kept out of decks | `data/defects.js` |
| `data/art-manifest.js`, `data/audio-manifest.js` @ L | ADAPT (M1) | Written by `write-manifest.mjs`; declared empty in M1 so a missing module throws at boot, filled in M5/M6 | same paths |
| `kb/*` @ L | DROP | lorecannae's snapshot of the shared knowledge base. xross-forge mounts the owner's private knowledge base as a submodule at `docs/knowledge-base` instead; it is never fetched by CI or deployed | `docs/knowledge-base` |

New in xross-forge, not in lorecannae: `.github/workflows/ci.yml` (gate on every push and pull
request) and `pages.yml` (gate, then deploy a staged `_site` on push to `main`; checkout without
submodules; `docs/`, `tools/`, `tests/` and `.github/` never ship). lorecannae deployed straight
from the `main` root with no workflow.

## 7. GRAND LINE (`G`)

| Source | Verdict | Reason | Target |
|---|---|---|---|
| `js/fx.js` @ G | ADAPT (M3, animation director; awaken stinger) | Effects layer, view only: turn ribbon, opponent's played card in the spotlight, attack arrow, hit and K.O. bursts, floating numbers. Two rules to keep: flush start states with a forced layout read, never `requestAnimationFrame` (does not fire in a background tab); remove transient nodes by timer, not `animationend`, so nothing strands under reduced motion. Rewrite against `XS` and `js/ui/core.js` (it uses `NS.render.el` and needs a `#fx-layer`); overlaps lorecannae's `anim.js`, so merge the ideas, not the files | `js/ui/fx.js` |
| `tools/arena.mjs` @ G | ADAPT (M4) | AI against AI, for tuning the AI only: play both seats, count only decisive results, report behaviour counters (turns with no action, declined windows) that win rate hides. Depends on `tools/lib/load.mjs` (engine loader); use `loadPage` from `tools/test.mjs` instead. Complements `sim.mjs` (crash gate) | `tools/arena.mjs` |
| `js/bugreport.js` @ G | ADAPT (M7, bug report; engine half in M2) | The black box built before the first playtest: records seed, decks and every applied action plus the crash, offers a JSON download, so `replay-report.mjs` replays a real browser game. lorecannae's `makeTrace`/`replay` in `engine.js` is the engine half (M2); this is the recorder and download half | `js/ui/bugreport.js` |
| `js/touch.js` @ G | ADAPT (M7, phone/touch) | The whole touch model in one file: a tap reads (card full height, legal actions as buttons), a drag commits (drop targets are legal actions handed in), a hold peeks; phone and portrait classes, resting hand fan, recent-plays column. Drop targets (Leader, DON!!) are One Piece; the rest is generic. M3 on desktop needs only click and hover Prefer this over lorecannae's `touch.js` for the gesture code | `js/ui/touch.js` |
| `CARD-PRESENTATION-SPEC.md` @ G | ADAPT (M3) | Transferable spec for how cards look and behave: DOM structure, sizing, art under a scrim, text plate, blow-up view, interaction rules, the flicker fix, remove-content-not-shrink responsiveness, build order. Read before `cardview.js`; copy into the repository at M3 | `docs/specs/CARD-PRESENTATION-SPEC.md` |
| `CARD-LOG-AND-TARGETING-SPEC.md` @ G | ADAPT (M3) | Transferable spec for the log (structured entries, card names as hover targets, the fizzle notice, audio riding the log) and targeting (a pending choice on state, three UIs, role colours, attack arrow, prompt line). Read before `logtext.js` and `targeting.js`; the M2 log and ask shapes must satisfy section 1 and section 9 | `docs/specs/CARD-LOG-AND-TARGETING-SPEC.md` |
