# PLAN

**This file owns every project decision.** No other file states one; they point here. The
Status is rewritten (not appended) every session.

---

## Status — 2026-10-30 (M0-M7 built; art and audio waiting on keys)

**Live:** https://dragoonant.github.io/xross-forge/ (deployed from `main`, D11). Playable vs the AI
(Easy / Normal / Hard), full or quick match, ST01 vs ST02.

- **M7 polish (done):** layout fixes (TODO 8/9 closed), settings (speed, reduce motion, volumes,
  auto-pass, EN/JP titles), autosave + Continue, deck list peek, credits/notice screen with the
  AIイラスト label, How to play, end-screen stats. e2e 283/283, tests 209/209.
- **M5 art pipeline (built, nothing generated):** Hugging Face FLUX, 10 audition styles, identity
  table for the 8 leaders, 62 linted prompts, `$8` art cap with a ledger. Dry run: 72 renders,
  about $3.55. `STYLE` is null until the owner picks from the audition.
- **M6 audio pipeline (built, nothing generated):** ElevenLabs, 41 cues (29 SFX, 5 music, 7
  announcer lines in an original voice), log→cue map, `XS.Audio` wired into the presentation
  director, `sounds.html`. Dry run about 9,800 credits (~$2) under the $17 audio cap.

**Next, once the keys reach the session** (environment variables load when the VM restarts):
`gen-art --probe` and `gen-audio --probe`, the 10-style art audition for the owner to pick, then
3 samples and the batches; audio samples on `sounds.html` for the owner's ear.

**Owner, when convenient:** playtest notes; D15 (starter Energy Charger); delete the stale
`claude/wip-backup` branch (the session's git proxy refuses branch deletion).

---

## Decisions

| # | Decision | By | Date |
|---|---|---|---|
| D1 | The game is **Xross Stars** (クロスタ; Brave group, developed by Game & Co. and SAMURAI KOBO; released 2025-08-22). The owner's working name "Xross Gates" meant this game. | owner | 2026-10-29 |
| D2 | **IP posture: real names, our own art.** Real card, leader and talent names; all rules text, UI copy and lore in our own words; no official art, logos, icons or audio; art is our own generated depiction of each talent's recognisable avatar; no cloned voices of real talents (any announcer voice is original). Official PDFs and API dumps stay in gitignored `docs/sources/`. Takedown-ready (`docs/takedown.md`). Agency fan-work policies are recorded in `docs/rights.md`; any conflict is stated there once. | owner | 2026-10-29 |
| D3 | **Scaffold from lorecannae** (newest card game: frozen engine contract, ability-authoring guide, modular UI, one-command gate, replayable bug traces), plus GRAND LINE's effects layer, arena and bug-report button. Plain browser JS, no build step, no dependencies, namespace `XS`. Porting map: `docs/PORTING.md`. | owner | 2026-10-29 |
| D4 | **Art is generated with Hugging Face** (Inference Providers, FLUX family) from the cloud session, replacing Gemini for now; the key is an environment variable (the tools accept `HF_TOKEN`, `HUGGINGFACE_API_KEY`, `HUGGINGFACE_TOKEN` or `HF_API_KEY`). Pipeline: style audition, one `STYLE` constant, identity table per talent, prompt lint, `--dry-run`, 3 samples, contact sheets of 16. | owner | 2026-10-29 |
| D5 | **Audio via ElevenLabs** (`ELEVENLABS_API_KEY` environment variable): SFX, music, an original announcer voice. "Not verified by ear" until the owner listens on `sounds.html`. | owner | 2026-10-29 |
| D6 | **Budget: $25** for the first slice's art and audio generation. Every paid run starts with a dry-run plan and 3 samples; cost reported per batch. | owner | 2026-10-29 |
| D7 | **Look: esports broadcast stage** — neon arena, caster-style lower thirds, a big stinger on awakening, crowd swells at match point. | owner | 2026-10-29 |
| D8 | **First slice: the two original starter decks**, ST01 初の栄冠 (VSPO!) vs ST02 魔王降臨 (Crazy Raccoon), full match (best of 3) and quick match, vs AI. More products after the owner's playtest. Lists: `data/decklists.json`. | owner | 2026-10-29 |
| D9 | Card text shown in **English, in our own words**, with the Japanese card name shown alongside. | default | 2026-10-29 |
| D10 | Repo **public**, deployed to GitHub Pages by an Actions workflow (the private KB submodule is never fetched by CI). Needs Settings → Pages → Source: "GitHub Actions" once. | default | 2026-10-29 |
| D11 | **Milestones merge to `main`** (fast-forward from the working branch) once gated, so Pages deploys them. First merge for the owner's playtest. | owner | 2026-10-29 |
| D12 | Authority order for rules: Playing Manual (2026-04-09) > official FAQ (API) > floor rules > Quick Manual > third-party summaries. Ambiguities go in `docs/rulings.md` as `RULING`s, never block. | default | 2026-10-29 |
| D13 | Leader affiliation tags (VSPO!, CR, …) are not a field in the card API; for the first slice they come from a hand table sourced from the product pages and card faces (`docs/sources.md`). | default | 2026-10-29 |
| D14 | Credit **evilgouki**. Never the owner's real name or a home path in any file (pre-commit hook). | owner (standing) | 2026-10-29 |
| D15 | **Starters play as sold.** エナジーチャージャー (ST01-020 / ST02-020) has been banned since 2026-07-13 (limited/BAN page), but it is one of exactly five tactics in both starters, so the sanctioned list cannot be built from a starter alone. The first slice plays the starters as printed in the box; a "tournament legal" deck check arrives with the deck picker. | default | 2026-10-29 |
| D16 | **The repo carries our English text, not the printed Japanese text.** `data/cards.js` holds card number, Japanese name (names are allowed, D2), an English name in our own words, type, colour, cost, ATK/HP, awakened ATK/HP, is_ace, tactics type, family id, product, and `text` = our English rendering in our own words (hand-written in `data/text-en.js`). The Japanese printed effect text stays in gitignored `docs/sources/`. Anything that needs the printed text (the printed-vs-compiled auditor, M2) reads `docs/sources/api/all-cards.json` locally and reports `pending (no docs/sources)` when it is absent, as in CI. | default | 2026-10-29 |
| D17 | API keys live in the cloud environment's **environment variables** (owner's choice over network secrets); tools read them from `process.env` at run time and never write or log them. | owner | 2026-10-29 |

## Milestones

| | Milestone | Where | State |
|---|---|---|---|
| M0 | Hygiene, sources, rights, rules primer, scaffold, porting map | cloud | **done** 2026-10-29 |
| M1 | Card data for ST01/ST02: schema, `build-cards`, English text, validation, `defects.js`, art and sound manifests declared empty and failing | cloud | **done** 2026-10-29 |
| M2 | Engine: pure `apply`/`legalActions`, rounds and best of 3, PP, attacks and boosts, down/awaken, tactics, deck-out, quick match; one test per card; auditor; sim with invariants; independent rules review | cloud | **done** 2026-10-29 |
| M3 | **Playable on Pages vs a random bot**: board, public-zone viewers, hover zoom, prompts that say what they decide, animation director, how to play | cloud | **done** 2026-10-29 |
| M4 | AI (worker, tiers): beats random ≥ 95% in both seats on holdout seeds; scored against do-nothing; empty-turn, awaken and tactics counters | cloud | **done** 2026-10-29 |
| M5 | Art (Gemini): audition, both leader sides, every card, playmat, title, UI plates | cloud + key | **pipeline done** 2026-10-30; generation waits on the key |
| M6 | Audio (ElevenLabs): SFX on log tags, music director with round and match-point tiers, victory/defeat | cloud + key | **pipeline done** 2026-10-30; generation waits on the key |
| M7 | Polish: phone/touch, save/continue, settings, bug report, deck picker | cloud | **done** 2026-10-30 |

## Cut order (if a session runs short)
Cut first: tutorial depth, music tiers beyond calm/tense/victory/defeat, deck-builder polish,
spectate controls. **Never cut:** per-card behaviour tests, the defects gate, open-information
viewers, the log, prompts that say what they are about, the rulings log.
