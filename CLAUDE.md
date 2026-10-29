# xross-forge — Xross Stars in the browser

Unofficial, non-commercial fan reproduction of the Japanese TCG **Xross Stars** (Brave group /
Game & Co.), played vs AI in the browser. **Decisions live in `PLAN.md` (read it first).** The
shared knowledge base from the owner's earlier ports is the submodule `docs/knowledge-base/`
(`git submodule update --init`; private): start with its `README.md` and `card-games.md`.

## Hard rules
1. Plain browser JS, no build step, no dependencies. Every file is an IIFE on `globalThis.XS`.
   `index.html`'s script list is the load order; `tests.html` loads the same engine files in the
   same order (`tools/check-pages.mjs`).
2. Engine surface (contract frozen in M2, `docs/ENGINE-API.md`): `XS.legalActions` /
   `XS.apply` (never mutates) / `XS.isTerminal` / `XS.whoActs` / `XS.view(state, seat)`. Every UI
   affordance derives from `legalActions`; every number the UI shows comes from an engine function.
3. One door per rule (damage, healing, draw, PP payment, zone moves, characteristics, choices).
   Never write a leader's damage or a card's zone outside its door.
4. Never assume a choice: no auto-pick for a single candidate.
5. No silent fallbacks: no `if (!XS.x)` and no `XS.x || {}` in UI code; a missing module throws.
6. Seeded RNG; every shuffle and random pick happens inside `apply`.
7. Hidden information (hand, deck order, face-down tactics pick) is only visible through
   `XS.view(state, seat)`; the sim runs a leak test.
8. A card that doesn't play as printed goes in `data/defects.js`, never quietly into a deck.
9. Cite the source in engine comments: `(PM p.7)` Playing Manual page, `(FAQ #138)`,
   `(R-012)` ruling. Tests are named for the rule or card number they assert.
10. Rules text, UI copy and lore are **our own words**. Official PDFs, API dumps and card images
    stay in gitignored `docs/sources/`; never commit official art, logos or audio.
11. Art prompts never contain franchise, agency, studio or artist names or text-magnet words
    (lint in the art pipeline, M5).
12. Commit messages describe the mechanism by card number, page or ruling. UI commits say what
    was checked in the real page. Commit with explicit paths while agents run
    (`git commit -m … -- <paths>`), and gate the commit, not the working tree.
13. Never put the owner's real name or a home path in any file; credit **evilgouki**. Enable the
    hook once per clone: `git config core.hooksPath .githooks` (private patterns go in
    `$(git rev-parse --git-common-dir)/privacy-patterns`, never in the repo).
14. Before committing a document, `ls` every path it claims exists.

## Commands
```
node tools/fetch-cards.mjs      # official card pool, FAQ, restrictions -> docs/sources/api (gitignored)
node tools/serve.mjs            # http://localhost:8232 (no-store cache)
node tools/test.mjs --quiet     # headless tests (tests.html's script list under node:vm)
node tools/gate.mjs             # every gate, one line each
node tools/stamp-assets.mjs     # re-stamp index.html ?v= hashes before every deploy commit
```

## Layout
```
index.html / tests.html   entry points
js/                       engine (ns, rng, …), then js/ui/
data/decklists.json       official starter lists (ST01, ST02) by card number, with source
tools/*.mjs               fetch-cards, serve, test, gate, check-pages, stamp-assets
tests/*.js                behaviour tests (loaded by tests.html)
docs/                     rules.md, rulings.md, card-text-grammar.md, sources.md, rights.md,
                          takedown.md, PORTING.md; knowledge-base/ (submodule)
docs/sources/             gitignored: official PDFs, rendered manual pages, API dumps
```
