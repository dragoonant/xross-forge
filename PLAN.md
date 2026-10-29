# PLAN

**This file owns every project decision.** No other file states one; they point here. The
Status is rewritten (not appended) every session.

---

## Status — 2026-10-29 (M0 done)

**M0 landed on branch `claude/m0-scaffold`; gate green in a clean worktree.** Nothing is playable
yet (first playable is M3); `index.html` shows the broadcast-style title with Play locked.

- **Sources** (`docs/sources.md`): the official Playing Manual (2026-04-09, image-only, read page
  by page), Quick Manual, floor rules v1.0.4, play sheet, limited/BAN page, and an **official
  JSON card API** (808 cards with stats, printed effect text and awakened stats), **136 official
  FAQ entries** and the restriction list. `node tools/fetch-cards.mjs` refreshes them.
- **Starter lists** (`data/decklists.json`) from the official product-page images; each sums to
  50 and the x2 cards are exactly the API's ACE cards.
- **Rules** (`docs/rules.md`, every line cited), **52 rulings** (`docs/rulings.md`: 3 open after
  the FAQ check — R-007, R-018, R-035), **card-text grammar** (`docs/card-text-grammar.md`).
- **Rights** (`docs/rights.md`, `NOTICE.md`, `docs/takedown.md`): no published policy bans our
  posture; VSPO! allows AI illustrations with a `#AIイラスト` label, no official art as input and
  no sexual content; CR, Neo-Porte and REJECT are silent on AI and on games; the project stands on
  tolerance, stated once in rights.md.
- **Scaffold** from lorecannae (`docs/PORTING.md` maps every donor file), privacy hook, the KB as
  a submodule, CI and a Pages workflow.

**Next: M1 card data** for ST01/ST02 (schema, `build-cards`, English text in our own words, the
affiliation tag table, `defects.js`, empty-but-failing art and sound manifests).

**Owner, when convenient** (defaults are in force meanwhile): D11 (push milestones straight to
`main`?), D15 (starter Energy Charger), and turning on Settings → Pages → Source: GitHub Actions.

---

## Decisions

| # | Decision | By | Date |
|---|---|---|---|
| D1 | The game is **Xross Stars** (クロスタ; Brave group, developed by Game & Co. and SAMURAI KOBO; released 2025-08-22). The owner's working name "Xross Gates" meant this game. | owner | 2026-10-29 |
| D2 | **IP posture: real names, our own art.** Real card, leader and talent names; all rules text, UI copy and lore in our own words; no official art, logos, icons or audio; art is our own generated depiction of each talent's recognisable avatar; no cloned voices of real talents (any announcer voice is original). Official PDFs and API dumps stay in gitignored `docs/sources/`. Takedown-ready (`docs/takedown.md`). Agency fan-work policies are recorded in `docs/rights.md`; any conflict is stated there once. | owner | 2026-10-29 |
| D3 | **Scaffold from lorecannae** (newest card game: frozen engine contract, ability-authoring guide, modular UI, one-command gate, replayable bug traces), plus GRAND LINE's effects layer, arena and bug-report button. Plain browser JS, no build step, no dependencies, namespace `XS`. Porting map: `docs/PORTING.md`. | owner | 2026-10-29 |
| D4 | **Art is generated in the cloud session with the Gemini image API** (key `GEMINI_API_KEY` as an environment secret). Pipeline: style audition, one `STYLE` constant, identity table per talent, prompt lint, `--dry-run`, 3 samples, contact sheets of 16. | owner | 2026-10-29 |
| D5 | **Audio via ElevenLabs** (key `ELEVENLABS_API_KEY`): SFX, music, an original announcer voice. "Not verified by ear" until the owner listens on `sounds.html`. | owner | 2026-10-29 |
| D6 | **Budget: $25** for the first slice's art and audio generation. Every paid run starts with a dry-run plan and 3 samples; cost reported per batch. | owner | 2026-10-29 |
| D7 | **Look: esports broadcast stage** — neon arena, caster-style lower thirds, a big stinger on awakening, crowd swells at match point. | owner | 2026-10-29 |
| D8 | **First slice: the two original starter decks**, ST01 初の栄冠 (VSPO!) vs ST02 魔王降臨 (Crazy Raccoon), full match (best of 3) and quick match, vs AI. More products after the owner's playtest. Lists: `data/decklists.json`. | owner | 2026-10-29 |
| D9 | Card text shown in **English, in our own words**, with the Japanese card name shown alongside. | default | 2026-10-29 |
| D10 | Repo **public**, deployed to GitHub Pages by an Actions workflow (the private KB submodule is never fetched by CI). Needs Settings → Pages → Source: "GitHub Actions" once. | default | 2026-10-29 |
| D11 | Milestone work is pushed to a `claude/` branch; **pending owner:** push straight to `main` after each gated milestone instead (as on Legion Forge). | default | 2026-10-29 |
| D12 | Authority order for rules: Playing Manual (2026-04-09) > official FAQ (API) > floor rules > Quick Manual > third-party summaries. Ambiguities go in `docs/rulings.md` as `RULING`s, never block. | default | 2026-10-29 |
| D13 | Leader affiliation tags (VSPO!, CR, …) are not a field in the card API; for the first slice they come from a hand table sourced from the product pages and card faces (`docs/sources.md`). | default | 2026-10-29 |
| D14 | Credit **evilgouki**. Never the owner's real name or a home path in any file (pre-commit hook). | owner (standing) | 2026-10-29 |
| D15 | **Starters play as sold.** エナジーチャージャー (ST01-020 / ST02-020) has been banned since 2026-07-13 (limited/BAN page), but it is one of exactly five tactics in both starters, so the sanctioned list cannot be built from a starter alone. The first slice plays the starters as printed in the box; a "tournament legal" deck check arrives with the deck picker. | default | 2026-10-29 |

## Milestones

| | Milestone | Where | State |
|---|---|---|---|
| M0 | Hygiene, sources, rights, rules primer, scaffold, porting map | cloud | **done** 2026-10-29 |
| M1 | Card data for ST01/ST02: schema, `build-cards`, English text, validation, `defects.js`, art and sound manifests declared empty and failing | cloud | — |
| M2 | Engine: pure `apply`/`legalActions`, rounds and best of 3, PP, attacks and boosts, down/awaken, tactics, deck-out, quick match; one test per card; auditor; sim with invariants; independent rules review | cloud | — |
| M3 | **Playable on Pages vs a random bot**: board, public-zone viewers, hover zoom, prompts that say what they decide, animation director, how to play | cloud | — |
| M4 | AI (worker, tiers): beats random ≥ 95% in both seats on holdout seeds; scored against do-nothing; empty-turn, awaken and tactics counters | cloud | — |
| M5 | Art (Gemini): audition, both leader sides, every card, playmat, title, UI plates | cloud + key | — |
| M6 | Audio (ElevenLabs): SFX on log tags, music director with round and match-point tiers, victory/defeat | cloud + key | — |
| M7 | Polish: phone/touch, save/continue, settings, bug report, deck picker | cloud | — |

## Cut order (if a session runs short)
Cut first: tutorial depth, music tiers beyond calm/tense/victory/defeat, deck-builder polish,
spectate controls. **Never cut:** per-card behaviour tests, the defects gate, open-information
viewers, the log, prompts that say what they are about, the rulings log.
