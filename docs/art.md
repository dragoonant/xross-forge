# Art pipeline (M5)

Our own generated art for every card face, the UI plates and the card backs. Decisions live in
`PLAN.md` (D2 real names and our own art, D4 Hugging Face, D6 budget, D7 broadcast look, D17 keys as
environment variables); the rights reading is `docs/rights.md` §2 and §7. This file is the how.

## Hard limits

- **Never use official art as any input**: no reference image, no image-to-image, no fine-tune data.
  The identity table was written once by looking at each official leader card as a reference
  (downloaded to the gitignored `docs/sources/card-images/`), then describing it in words. Nothing
  official is ever sent to the generator and nothing official is committed.
- **Prompts use visual clauses, never names.** No talent, agency, team, franchise, studio or artist
  name (a proper noun invites lettering). The lint refuses them, Japanese characters, and any
  photo or "realistic face" wording: the Crazy Raccoon members are real players and streamers, and
  only their cartoon avatar persona is described.
- **Nothing sexual, nothing gory** (VSPO! prohibition 6). Weapon scenes are toy-like blasters, light
  bolts, target drones and confetti.
- **Label every place the art appears** as an AI illustration (see "Labelling").

## Files

| File | Role |
|---|---|
| `tools/art/style.mjs` | The 10 STYLE candidates (the audition) and the chosen `STYLE` / `UI_STYLE` (both `null` until the owner picks) |
| `data/art-identity.js` | Identity table: per leader `head / outfit / pose / palette / awakened`; one scene per attack and memoria card; objects for tactics, PP Ticket and PP card; the four UI plates |
| `tools/art/lint.mjs` | The prompt lint (vocabulary and rules) |
| `tools/build-art-prompts.mjs` | Composes `STYLE . anchor : clause . framing` for 62 keys plus the audition; refuses on any lint problem; `--check` and `--selftest` are the gate steps |
| `tools/gen-art.mjs` | Renders through Hugging Face; ledger, budget, audition, probe, dry-run, mock |
| `tools/gen-art-local.mjs` | The same prompts, masters and ledger rendered on the owner's PC's Flux Studio (FLUX.2 klein 4B, port 7880; PLAN D18): `--audition`, `--only`, `--force`, `--seed`, `--dry-run`. How the first set was made. |
| `tools/art/contact-sheet.mjs` (+ `.py`, PIL) | Labelled 4x4 contact sheets into `tools/out/contact/` |
| `tools/shrink-art.mjs` | Masters to 560 px WebP, bottom 5% cropped |
| `tools/write-manifest.mjs` | Fills `data/art-manifest.js` from the files present |
| `tools/check-art.mjs` | Presence, zero length, magic bytes, truncation, dimensions, case, git-tracked, ledger |
| `docs/art-ledger.json` | Cost ledger, committed |
| `art/masters/` | Gitignored masters (PNG, 832x1216 or 1280x768); `art/archive/` holds replaced masters |
| `art/cards/`, `art/ui/` | The delivery WebPs (committed) |

Keys: a card number (`ST01-005`), a leader's awakened face `ST01-001/awakened`, UI plates `ui/title`,
`ui/arena`, `ui/card-back`, `ui/tactics-back`. 58 faces (50 cards, 8 leaders twice) plus 4 plates = 62.
A key's master is `art/masters/<key with / as __>.png`; its delivery file is
`art/cards/<key with / as __>.webp` (`art/cards/ST01-001__awakened.webp`) or `art/ui/<name>.webp`.

## The pipeline, in order

1. **Audition.** `node tools/gen-art.mjs --audition --dry-run`, then `--audition`: the 10 candidates
   on one subject (leader ST01-001, front face), the same seed, about $0.50. Then
   `node tools/art/contact-sheet.mjs --set audition` and look at `tools/out/contact/audition-1.jpg`.
2. **The owner picks.** Record the pick in `PLAN.md` (a Decision), then paste the candidate's `style`
   and `ui` strings, byte for byte, into `STYLE` and `UI_STYLE` in `tools/art/style.mjs`. Changing one
   character later starts a new set. Until both are set every non-audition run refuses.
3. **Build the prompts.** `node tools/build-art-prompts.mjs` lints and writes
   `tools/out/art-prompts.json` (gitignored). `--show <key>` prints one prompt.
4. **Sample.** `node tools/gen-art.mjs --limit 3`, then look at the three masters at native size
   (`art/masters/`). Pick the three to cover a leader, a scene and an object
   (`--only ST01-001,ST01-005,ST01-019`).
5. **Batch.** `node tools/gen-art.mjs` (idempotent, skips existing masters). Stop and report on a 402,
   401 or 404.
6. **Contact sheets per deck.** `node tools/art/contact-sheet.mjs` writes `ST01-1/2`, `ST02-1/2` and
   `ui-1` (16 tiles each, labelled by key and card name, with the bottom 5% already cropped).
7. **Re-roll failures.** `node tools/gen-art.mjs --only <key> --force` archives the old master to
   `art/archive/` and re-rolls the seed (it uses the number of earlier ledger entries for that key; or
   pass `--seed N`). Regenerate only failures; regeneration is not monotonic, so look again.
8. **Shrink.** `node tools/shrink-art.mjs`.
9. **Manifest.** `node tools/write-manifest.mjs`.
10. **Check.** `node tools/check-art.mjs` (prints `pending (N of 58 faces, ...)` until complete).
11. **Flip `REQUIRE_ART`** to `true` in `tools/validate-data.mjs` once `check-art` is `ok`, then commit
    the manifest, the WebPs and `docs/art-ledger.json` together (explicit paths, rule 12).

## Running it locally (PLAN D18, how the first set was made)

With the Flux Studio up (`node server.js` in the 3D Model Generation repo's `flux-studio`, port 7880; `FLUX_URL`
to override), the same steps run with `tools/gen-art-local.mjs` in place of `tools/gen-art.mjs`:
`--audition` (the 10 candidates, fixed seed, about 90 s), then the batch (62 plates in about 7 minutes; 832x1216
prompts render at the studio's 2:3 = 832x1216, 1280x768 ones at 16:9 = 1344x768 and `shrink-art` scales them to
1280), then contact sheets, re-rolls (`--force --only <key>`, `--seed N`), shrink, manifest, check. Every render
appends a `$0` ledger entry (`provider: flux-studio-local`) with the seed and the prompt hash. The 2026-10-29 set:
STYLE = candidate A, QC on `tools/out/contact/ST01-*.jpg`, `ST02-*.jpg`, `ui-1.jpg`. Stop the studio when done.

## QC checklist (per tile; borderline tiles get one native-size look)

- No text, letters, numerals, logos or watermark anywhere (including on clothing, the trophy base, the
  card back and any signature in the bottom strip the encode crops).
- Recognisable from the identity clause: hair colour and style, eye colour, the species trait (cat ears
  and tail for ST01-003, devil horns for ST02-001, a white cat for ST02-004), the signature accessory.
  Two faces of one leader read as the same person; the awakened face is heightened, not redesigned.
- Hands: five fingers, holding what they should. No extra or missing limbs or heads.
- Cropping: the head and the key prop are not cut off by the frame or by the 5% bottom crop.
- IP drift: nothing that looks like the official card art (the same pose, the same backdrop, a card
  frame, a four-point-star emblem) and no franchise or team marks.
- Nothing sexual or gory; the Crazy Raccoon faces are cartoon avatars, never a real face.
- Objects and card backs: symmetrical where asked, one hero object, no people.
- Style: matches the chosen STYLE; a tile that drifts to another look is a re-roll.

## Labelling (AIイラスト)

Every place our art appears must say it is an AI illustration: the in-game credits screen and the
README (`AIイラスト` / "AI-generated illustration"), and any page or post that shows it. Announcements
carry `#AIイラスト` and never a fan-art tag (VSPO! guideline, `docs/rights.md` §2 and §7). The manifest
header repeats this; the UI owner (M7) renders the label.

## Providers

The key is read at run time from the first of `HF_TOKEN`, `HUGGINGFACE_API_KEY`, `HUGGINGFACE_TOKEN`,
`HF_API_KEY`, `HUGGING_FACE_HUB_TOKEN`; the tool fails naming them when none is set and never prints,
logs or writes the value. FLUX.1-dev is licensed for non-commercial use, which fits this free fan
project (PLAN D2, D6); the token must be allowed to call Inference Providers and the licence must be
accepted on the model page.

- **`--provider hf-inference`** (default): `POST https://router.huggingface.co/hf-inference/models/<model>`
  with `{inputs, parameters:{width, height, seed, num_inference_steps, guidance_scale}}`; the response
  is the image bytes.
- **`--provider fal-ai`** (the router's fal route, if hf-inference refuses the model):
  `POST https://router.huggingface.co/fal-ai/fal-ai/flux/dev` (`.../flux/schnell` for schnell) with
  `{prompt, image_size:{width,height}, seed, num_inference_steps, guidance_scale, num_images:1,
  output_format:"png", sync_mode:true}`; the response is JSON `{images:[{url}]}` (a URL or a data URI).
- `--model dev` (FLUX.1-dev, 28 steps, guidance 3.5, default) or `--model schnell` (FLUX.1-schnell,
  4 steps). `--url <endpoint>` overrides the route.

**Both routes are written from the public documentation and have not been run against the live API
in this session** (the key arrived after the tools were written). The first real step is
`node tools/gen-art.mjs --probe` (one 256x256 schnell call, prints the status only); if it says 404,
rerun it with `--provider fal-ai`. A 429/502/503/504 (model loading) backs off and retries up to six
times; 401/403, 402, 404 and 400/422 stop with a message.

## Budget and the ledger

D6: $25 for art and audio together; **art may spend at most $8.** `gen-art` appends one entry per real
call to `docs/art-ledger.json` (`date, key, model, provider, seconds, estCostUSD`, plus `seed` and a
hash of the prompt) and refuses to start a run whose estimate would push the art total past $8
(`--budget N` overrides it, only on the owner's word). `check-art` fails if the ledger is over.

The estimate is a per-model table in `tools/art/lib.mjs` (`COST_PER_MP`): FLUX.1-dev 0.025 and
FLUX.1-schnell 0.003 USD per megapixel, rounded up to a whole megapixel per image (a 832x1216 card is
2 megapixels, so $0.05 on dev). Source: the fal.ai public price list as recalled; Hugging Face passes a
routed provider's cost through, and hf-inference is billed by GPU seconds with no published per-image
price, so the same rate is a conservative proxy. After the first `--limit 3` sample, compare the
provider dashboard with the ledger and correct the table if they differ.

Plan (`--dry-run`): audition 10 plates about $0.50, 58 faces about $2.90, 4 UI plates about $0.15:
about $3.55 on dev, about $0.43 on schnell, leaving room for roughly 80 re-rolls. Mock runs never write
the ledger.

## Mock chain (no key, no network)

`node tools/gen-art.mjs --mock` writes generated placeholder PNGs (carrying a `xross-mock` tag) into
`tools/out/mock/`; the other tools take `--mock` to read and write there too, so the whole chain runs
end to end without touching `art/` or `data/art-manifest.js`:

```
node tools/gen-art.mjs --mock && node tools/art/contact-sheet.mjs --mock && node tools/shrink-art.mjs --mock \
  && node tools/write-manifest.mjs --mock && node tools/check-art.mjs --mock --require
```

`shrink-art` refuses a mock master in the real art root. Delete `tools/out/mock/` when done.

## The identity table

`data/art-identity.js` is the one place a talent's look is written. To change one: edit the clause, run
`node tools/build-art-prompts.mjs --check` (lint, every subject covered, every candidate fits 900
characters), and re-render only the affected keys (`--only ... --force`). A subject without an entry
fails the build. Scenes name at most two leaders of the same deck with `{ST01-001}` (head and outfit)
or `{ST01-001:head}` (head only, when the scene changes the outfit or has two people).

## Gate steps

`node tools/build-art-prompts.mjs --check` (prompt lint on every candidate and the whole table),
`node tools/build-art-prompts.mjs --selftest` (the lint bites on every rule) and
`node tools/check-art.mjs` (pending until the art lands, then it enforces).
