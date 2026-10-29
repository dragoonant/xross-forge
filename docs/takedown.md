# Takedown runbook

If any rights holder (Game & Co. / Brave group, an agency or team, a talent, an illustrator) asks for
anything to come down, it comes down first and is discussed after. This file is the how. Paths marked
**(planned)** do not exist yet (checked 2026-10-29: `art/`, `data/cards.js`, `data/agencies.js` and
`tools/build-cards.mjs` are absent; `data/decklists.json`, `NOTICE.md`, `.github/workflows/pages.yml` and
`tools/fetch-cards.mjs` exist).

Context: the site is deployed by `.github/workflows/pages.yml` on every push to `main` (it publishes a
staged copy of the repository root). So removing files and pushing `main` redeploys the site without them.

## 1. Stop everything now (two minutes)

Do either or both. The browser steps are the primary route; the CLI lines do the same.

1. **Unpublish the site.** GitHub repo `dragoonant/xross-forge` -> **Settings -> Pages -> Unpublish site**.
   CLI: `gh api -X DELETE repos/dragoonant/xross-forge/pages`
2. **Stop it redeploying.** Settings -> Actions -> disable workflows, or `gh workflow disable pages`.
3. **Make the repo private.** **Settings -> General -> Danger Zone -> Change repository visibility ->
   Make private.** CLI: `gh repo edit dragoonant/xross-forge --visibility private --accept-visibility-change-consequences`
4. Check that the Pages address returns 404, and check Settings -> Pages shows no live site.

Note: forks, clones and web-cache copies made while the repo was public are outside our control; step 3 does
not recall them.

## 2. Withdraw specific assets and keep the rest up

Run from a clean checkout of `main`. Replace the placeholders. Art lives at `art/cards/<card-id>.webp`
(planned) and names and text live in `data/cards.js` (planned).

```
# one talent's art, by slug or by card id prefix (planned paths)
git rm -r art/cards/<talent-slug>*
git rm art/cards/<card-id>.webp

# the talent's name and fields: edit data/cards.js (planned), replacing the name with the placeholder
# "Unnamed Talent <card-number>" and removing any portrait field, then:
node tools/test.mjs --quiet && node tools/gate.mjs
node tools/stamp-assets.mjs
git add -A -- art data index.html
git commit -m "Withdraw <talent-slug> art and name (data/cards.js, art/cards) at the request of <holder>" -- art data index.html
git push origin main        # pages.yml redeploys without the files
```

Rules: commit with explicit paths, and run the gate before pushing (the project rule). Masters stay in the
gitignored `art/masters/` and `art/archive/`; delete the local copies for that talent too.

### Remove them from history as well (only if the holder asks, or the material was official)

```
# needs git-filter-repo installed; run on a fresh clone, then force-push all branches and tags
git clone https://github.com/dragoonant/xross-forge.git purge && cd purge
git filter-repo --path-glob 'art/cards/<talent-slug>*' --invert-paths
git push --force --all origin && git push --force --tags origin
```

Then add a history note: one line in the repo's `docs/rights.md` under a "Withdrawn" heading (date, what,
holder, no personal details) so the rewrite is explained. Old forks and caches may still hold the files; ask
GitHub Support to clear cached views if a holder requires it.

## 3. Per-holder withdrawal path

The API dump has no agency field per card (it appears only in rules text such as "VSPO!" and "CR", and in
product names), so the card-to-agency list must be built by us as `data/agencies.js` (planned): one entry per
card id with its agency. A holder's withdrawal is then "every card id mapped to that agency".

| Holder | Their published fan-work page (read 2026-10-29) | What to remove first | Contact |
|---|---|---|---|
| Game & Co. / Brave group (the game) | No fan-content policy; the Media Kit terms (https://xross-stars.com/other/media-kit) cover kit material only | Everything: do step 1; then withdraw whatever they name | Form at https://xross-stars.com/contact |
| VSPO! | https://vspo.jp/guide/ | `art/cards/<id>.webp` for VSPO! ids; their names in `data/cards.js` if asked | vspo-guide@virtual-entertainment.co.jp (fan-work questions) |
| Crazy Raccoon | https://crazyraccoon.jp/terms/ | The same, for CR ids | Contact page on https://crazyraccoon.jp/ |
| Neo-Porte | https://neo-porte.jp/guideline/ | The same, for Neo-Porte ids; a single talent's wishes may differ from the group's | info@neo-porte.jp |
| REJECT | https://reject.jp/brandguidelines/ | The same, for REJECT ids | Contact page on https://reject.jp/ |

Per-agency command, using the planned map (adjust to its final shape):

```
# list that agency's card ids (planned data/agencies.js), then remove their art
node -e "const a=require('./data/agencies.js'); console.log(Object.keys(a).filter(k=>a[k]==='<AGENCY>').join('\n'))" \
  | xargs -I{} git rm -f art/cards/{}.webp
```

Two lighter fallbacks that keep the game playable with that agency's cards (planned switches, see the
"Concern stated once" options in docs/rights.md): swap that agency's art for non-likeness art
(`data/art-policy.js`, `art/cards-neutral/`), or show original names (`data/names-original.js`).

## 4. Reply to the rights holder

Acknowledge the same day, say what was removed and when, do not argue, and do not republish. A short template:

> Thank you for letting us know. This is an unofficial, non-commercial fan project. We have removed
> <what> as of <date> and will not restore it. Please tell us if anything else should change.
>
> ご連絡ありがとうございます。本プロジェクトは非公式・非営利のファン活動です。<対象>を<日付>に削除しました。
> 今後も再公開いたしません。他にも対応が必要な点がございましたらお知らせください。

Record the request (date, holder, what was withdrawn, commit hash) in a "Withdrawn" list in `docs/rights.md`.
