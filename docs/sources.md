# Sources

Where every fact in this repo comes from. Official files are downloaded into gitignored
`docs/sources/` (never committed; see `docs/rights.md`). Authority order for rules is in
`PLAN.md` D12.

## Official (primary)

| Source | URL | Fetched | Notes |
|---|---|---|---|
| Playing Manual `XrossStars_PlayingManual_260409` | https://assets.xross-stars.com/rules/playing-manual/document.pdf | 2026-10-29 | 19 pages, dated 2026-04-09. **No usable text layer** (CID fonts without a Unicode map); rendered to `docs/sources/manual-pages/pm-NN.png` at 160 dpi with `pdftoppm` and read by eye. Cited as `(PM p.N)`. |
| Quick Manual `XrossStars_QuickManual_250813` | https://assets.xross-stars.com/rules/quick-manual/document.pdf | 2026-10-29 | 1 page, 2025-08-13. `(QM)` |
| Play sheet `XrossStars_Playseat_250813` | https://assets.xross-stars.com/rules/play-sheet/document.pdf | 2026-10-29 | Zone layout. |
| Floor rules v1.0.4 | https://assets.xross-stars.com/rules/floor-rule/document.pdf | 2026-10-29 | 4 pages, 2026-07-17, has a text layer. `(FR §N)` |
| Limited / BAN page | https://xross-stars.com/rules/limited-ban | 2026-10-29 | Saved as HTML. |
| **Card API** | https://api.xross-stars.com/v1/cards (`?limit=100&page=N`; filters `product=ST01`, `color=red`) | 2026-10-29 | 808 cards. Fields: card_type (leader / attack / memoria / tactics / pp), cost, atk, hp, awaken_atk, awaken_hp, effect (printed Japanese text), is_ace, build_rule, tactics_type, rarity, product, family_id, illustrator, image URLs. `node tools/fetch-cards.mjs` refreshes it. |
| FAQ API | https://api.xross-stars.com/v1/faq | 2026-10-29 | 136 Q&A entries; rulings authority after the manual. `(FAQ #id)` |
| Restrictions API | https://api.xross-stars.com/v1/cards/restrictions | 2026-10-29 | 1 entry on this date (card family 90, max 0 copies). |
| Starter lists ST01 / ST02 | https://xross-stars.com/product/st01-02 | 2026-10-29 | Quantities read by eye from the two card-list images on the page (`uploads/1788415266-404340-GxFhXbGbUAEToi6`, `uploads/1788415333-395518-GxFhXxdbUAErgHW`); the images are captioned as development images that may differ slightly from the product. Each list sums to 50; every API `is_ace` card is ×2, and two non-ACE cards are also ×2 (ST01-010 クリティカルショット, ST02-016 福男), both confirmed on full-size crops 2026-10-29. Recorded in `data/decklists.json`. |
| EX starter lists ST03 / ST04 | https://xross-stars.com/product/ST03 , /product/ST04 | 2026-10-29 | Same image format (ST03: 26 attack / 24 memoria; ST04: 30 / 20); release 2026-10-30. Not transcribed yet (not in the first slice). |

## API notes
- Leader **affiliation tags** (VSPO!, CR, Neo-Porte, REJECT) exist in the API's tag list but are
  not a field on each card, and no tag filter parameter was found (`tag`, `tags`, `tag_id` and
  others are ignored). First slice: ST01's four leaders are VSPO! talents and ST02's four are
  Crazy Raccoon members (product page; PLAN D13).
- `/v1/decks/{id}` reads shared decks by an opaque id; `/v1/decks` is POST-only (405 on GET).
- `/v1/owners` is the store locator, not talent owners.
- The Wayback Machine (web.archive.org) resets the connection from the cloud session (2026-10-29).

## Secondary
| Source | URL | Use |
|---|---|---|
| torecamap rules column (Japanese) | https://torecamap.co.jp/column/xross-stars-rule/ | Cross-check only; the manual wins. |
