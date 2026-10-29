# Rights research (day one)

Researched and fetched on **2026-10-29**. Every "fetched" date below is that day. This is a reading of
published policies in our own words, not legal advice; Japanese key phrases are quoted only where the
exact wording matters. Raw pages were kept outside the repo (nothing official is committed).

Project posture (owner's decision, recorded not argued): real card, leader and talent names; all rules
text, UI copy and lore in our own words; no official card art, logos, icons or audio; art is our own
AI-generated depiction of each talent's recognisable avatar/persona; no cloned voices; official PDFs
and API dumps stay in gitignored `docs/sources/`; README and an in-game screen say "unofficial,
non-commercial fan project"; credited to "evilgouki"; takedown-ready.

## At a glance

| Holder | Published fan-work policy? | Non-commercial fan works | AI-generated depictions | Games / apps / tools named? |
|---|---|---|---|---|
| Game & Co. / Xross Stars (Brave group) | No. None found | No statement | No statement | No statement |
| VSPO! (ぶいすぽっ！) | Yes, `vspo.jp/guide/` (last revised 2026-09-17) | Allowed for individuals / unincorporated groups, within limits | **Allowed, with conditions** (must carry `#AIイラスト`, must not use the fan-art tag) | Not named (list is open-ended) |
| Crazy Raccoon (CR) | Yes, `crazyraccoon.jp/terms/` (undated) | Allowed for individuals / unincorporated groups | Silent | Not named |
| Neo-Porte (ネオポルテ) | Yes, `neo-porte.jp/guideline/` (undated) | Allowed, no inquiry needed if compliant | Silent | Not named, but a fallback clause sends any unlisted kind of fan work to the general guideline |
| REJECT | Yes, `reject.jp/brandguidelines/` (undated) | Allowed for individual fans | Silent | Not named |

No agency prohibits AI-generated depictions or says anything about AI training in its published text as
of today. One (VSPO!) expressly permits AI illustrations under conditions. Three are silent. Silence is
neither permission nor a ban.

## 1. Xross Stars: Game & Co. Inc. / Brave group

**URLs fetched (2026-10-29):**
- https://xross-stars.com (home), `/about`, `/rules`, `/rules/faq`, `/contact`, `/news`, `/card`, `/deck`
- https://xross-stars.com/other/media-kit (the only page with usage terms)
- https://api.xross-stars.com/v1/cards (the card API)
- Footer links: Privacy Policy (https://gameandco.co.jp/privacy-policy/), Information Security Policy
  (https://bravegroup.co.jp/information-security-policy), MediaKit.

**What the official site says about use of its material.**
- The footer carries only Contact, Privacy Policy, Information Security Policy and MediaKit. I probed
  `/terms`, `/terms-of-use`, `/guideline(s)`, `/policy`, `/privacy`, `/legal`, `/license`, `/copyright`,
  `/fan`, `/fan-content`, `/faq`, `/simulator`, `/download`: all 404 (the working ones are `/about`,
  `/contact`, `/news`, `/rules`, `/rules/faq`, `/card`, `/deck`, `/other/media-kit`). `robots.txt` is 404.
  **No terms of use, no fan-content (二次創作) guideline and no statement about digital or online
  simulators exist on the site.** The news list (items to 2026-10-23) has no fan-content item, and the
  Q&A at `/rules/faq` has no fan-content entry.
- The only usage terms are the **Media Kit terms** (メディアキット利用規約), which cover the downloadable
  logos, key visuals and product images only. In our words: kit material must be shown unaltered (scaling
  with the aspect ratio kept is fine); use is limited to introducing Xross Stars on outside media or SNS,
  or other purposes Game & Co. separately approves; use that damages the brand is banned; the user must
  show correct copyright and trademark notices (the page says "Xross Stars" and its logo are Game & Co.
  trademarks and gives "©G&CO. 2022" as an example); making or handing out goods from the kit or other Game
  & Co. IP, free or paid, is banned; Game & Co. can withdraw permission at any time for any reason.
- The floor rules (`floor-rule.pdf`, in `docs/sources/official/`) require tournament players to use
  official cards that Game & Co. recognises. That governs sanctioned events, not an unofficial browser game.

**The card API.** `https://api.xross-stars.com/v1/cards` answers 200 with JSON, with no authentication
and no terms page; `/`, `/v1`, `/docs`, `/openapi.json` and `/terms` on that host all return 404. It is
undocumented. A HEAD request returns 405, so CORS behaviour is unknown. The JSON has no talent or agency
field (checked against our 808-card dump): the agency link appears only in rules text as the tags
"VSPO!" and "CR" (e.g. ST01-005, ST02-009) and in product names (EXスタートデッキ『ぶいすぽっ！』 and
『Crazy Raccoon』). The card images sit on `assets.xross-stars.com`.

**Consequence for this project.**
- Game & Co. has granted nothing and forbidden nothing about fan simulators. We act on tolerance, not on
  permission. The posture (own-words rules text, no art, logos or audio) keeps us clear of the one text
  that does restrict (the Media Kit terms) because we use none of the kit, and we make no goods.
- Do not copy anything from the Media Kit (logos, key visuals, product shots). Use the title "Xross Stars"
  only to say what the project is a fan version of; never as our own logo or lock-up.
- Use the API at build time only, into gitignored `docs/sources/api/`, as `tools/fetch-cards.mjs` does
  (one request per second). The deployed page must not call `api.xross-stars.com` or hotlink
  `assets.xross-stars.com`: the API has no published terms, and we cannot show we may load from it.
- Card illustrators are credited by name in the API (`illustrator_name`). Our art must not imitate a
  named illustrator's work or be generated from it.
- Concretely state "not affiliated with or endorsed by" Game & Co. / Brave group in `NOTICE.md`, the
  README and the in-game screen, and never use a name, domain or style that reads as official.
- Open question for the owner, not blocking: the official contact form
  (https://xross-stars.com/contact, "その他お問い合わせ") is the only channel to ask Game & Co.

## 2. VSPO! (ぶいすぽっ！) — operated by 株式会社バーチャルエンターテイメント (Brave group)

**URL:** https://vspo.jp/guide/ ("二次創作・動画転載ガイドライン"), fetched 2026-10-29. Revision log on the
page: established 2020-12-15, revised 2021-10-22, 2023-07-07, 2023-07-11, 2023-09-25, 2025-02-20,
**2026-09-17** (the log does not say what changed, so I cannot say which revision added the AI section).
FAQ https://vspo.jp/faq/ only points back to the guideline. Footer notice: reproduction of site
content without permission is banned.

**What it allows.**
- The project says it actively supports fan works by **individuals** and says it will not assert
  copyright against them if they follow the guideline and stay within the scope of personal doujin activity.
- Scope: works by individuals or groups with no legal personality (circles). **Corporate use is outside
  the guideline**, including a person's own name if a company pays for it; companies must write to the
  company contact.
- Listed forms: illustrations, doujinshi, manga, novels, "etc." (など), and cosplay. Games, apps and tools are
  **not named**, and not excluded either.
- "Non-profit fan activity" means all of: no aim of profit; free, or only a small amount covering costs; a
  hobby use that is not advertising for other content or products. Sales caps are given for doujin goods and
  small-income activity (for example, 200,000 yen a year for small non-publication income).
- Original-design illustrators of the members have their own separate rules.

**AI illustrations (AIイラスト).** The guideline has a section for them. In our words: when you post AI
illustrations of the project on SNS or a website, (1) do **not** use the fan-art tag, (2) **always** use
`#AIイラスト`. The reason given: the project sometimes picks fan art for stream thumbnails or SNS, so it
wants fan-art tags limited to hand-made work and wants AI work identifiable. The text does **not** ban AI
illustrations, and says nothing about AI training.

**What it prohibits (numbered as on the page).** 1 commercial use; 2 using the project's own primary
content (official art, logos, video, voice, music) directly, "or in a form that goes no further than a
non-creative modification" (「創作性のない単なる改変」); 3 anything that harms the project's image; 4 breaking law
or public order; 5 infringing third parties; 6 violent, grotesque or **sexual** depiction (added
2024-07-01); 7 anything that could be taken as official; 8 discrimination; 9 serving a creed, religion or
politics; 10 reposting primary content to video sites; 11 anything members or staff judge inappropriate;
12 anything else the project judges outside fan activity. It reserves the right to ask any person to stop,
case by case, and disclaims all liability for trouble caused by fan works. Governing law is Japan, courts
Tokyo District Court.

**Enforcement context (secondary source, not the policy).** GameBusiness.jp, 2026-02-17,
https://www.gamebusiness.jp/article/2026/02/17/26217.html, reports that the operator settled with a person
who sold sexual illustrations of its talent, with at least a 10,000,000 yen payment obligation. It is not our
case, but it shows the guideline is enforced.

**Consequence for this project.**
- AI-generated depiction of VSPO! talents is **permitted if labelled**. Every place our art appears
  (in-game credits screen, README, any page or post that shows it) must say it is an AI illustration
  (AIイラスト / "AI-generated illustration"), and any SNS announcement of it must carry `#AIイラスト` and must
  not carry a fan-art tag.
- Art must be generated from our own text description of the persona. Official card art, key visuals or
  model sheets must never be used as an input, reference image, image-to-image source or training/fine-tune
  data. Otherwise prohibition 2 ("mere modification") applies and it also breaks the posture.
- Keep it non-commercial in a way the guideline's own test recognises: no ads, no sponsors, no donation
  or paid-tier link, no use to advertise another product, published under the owner's personal name or
  handle, not a company. Prohibition 6 means no sexual or gory art in any card, at any rarity.
- The unofficial / non-affiliation statement serves prohibition 7.
- Games, apps and tools are not named in the permitted list, so we rely on a reading of "etc." (など). The
  guideline lists contact points (vspo-guide@virtual-entertainment.co.jp for fan-work questions) and says
  fully compliant works need no reply, so a question may go unanswered.
- The operator can still ask any person to stop (prohibitions 11 and 12): that is the takedown path.

## 3. Crazy Raccoon (CR)

**URL:** https://crazyraccoon.jp/terms/ (page title "DERIVATIVE WORK GUIDELINE"; footer links it as
"DERIVATIVE WORK GUIDELINE"), fetched 2026-10-29. Page is undated. FAQ https://crazyraccoon.jp/faq/ has no
fan-work entry. English and Korean versions are linked from the home page but their addresses
(`/en/guideline`, `/ko/guideline`, `/guideline`) returned 404; I used the Japanese page. Secondary: KAI-YOU
reported the guideline's announcement on 2024-05-27, https://kai-you.net/article/89700 (paywalled in part).

**What it says, in our words.**
- Fan work ("二次創作") means a new work of creative effort by an **individual or an unincorporated group**
  that adds to CR content. A straight copy, or a change that adds no creativity, is not fan work and the
  guideline does not apply to it.
- Prohibited: creative work that **CR members find unpleasant** (CRメンバーが不快と感じる); anything judged
  commercial; **use by a corporation**; expression that passes as, or is mistaken for, official; against public
  order or antisocial; carrying a creed, religious or political message; seriously damaging the image of
  members, the company or its content; infringing a third party; anything else CR finds inappropriate.
- CR can change the guideline without notice, takes no responsibility for trouble, and the work is made at
  the maker's own risk. Japanese law, Tokyo District Court.
- **Nothing on AI, AI training, games, apps or tools.** The page has no list of permitted forms.

**Consequence for this project.**
- Fits the same non-commercial, individual, no-ads shape as VSPO!. The tests that bite are "members find it
  unpleasant" and "could be mistaken for official": the first is a unilateral veto, the second needs the
  unofficial label.
- CR's roster (https://crazyraccoon.jp/member/, filters PLAYER, STREAMER, STAR and game teams) includes real
  esports players and streamers. A generated image that reads as a real person's face is a different matter
  from a VTuber avatar; this guideline does not address it (see "Concern stated once").
- Because the page is silent on AI, there is no CR rule to follow beyond the general ones. We apply the
  VSPO! labelling to all agencies anyway, since it costs nothing.

## 4. Neo-Porte (ネオポルテ)

**URL:** https://neo-porte.jp/guideline/ ("全般ガイドライン", issued by Neo-Porte実行委員会), fetched 2026-10-29.
Undated. Also holds a cheering-ad guideline (応援広告) that does not apply to us. Music and clip
(切り抜き) guidelines are mentioned as separate add-ons.

**What it says, in our words.**
- If a fan work follows the general guideline, **no individual enquiry to the company is needed**, and the
  company will not exercise its rights against it. Fan work must rely on the company's content and add the
  maker's own creativity; copies or mere modifications are not fan work and are not covered.
- A clause says that where no add-on guideline exists for a kind of fan work, the general guideline applies.
  That is the closest any of the four comes to covering a game, though a game is not named.
- Requests ("お願い"): do not make things the talents would find unpleasant; stay within doujin or hobby
  activity (commercial use and corporate use are refused, even under a personal name if a company funds it);
  follow law and the platform's rules; avoid passing as official, public-order breaches, creed or political
  content, content that badly damages the image of talents, the company or its content, harm to third
  parties, and anything the company judges inappropriate.
- Talents may use fan works as stream thumbnails or in their posts. Individual talents ("ライバー") may have
  their own stated wishes about fan works, which the guideline asks you to check as well.
- Copyright is reserved; no warranty; no liability; the text can change without notice.
- **Nothing on AI or AI training.**

**Consequence for this project.**
- Safest reading of the four for a game: the fallback clause makes the general guideline apply.
- Neo-Porte talents' personal wishes are not collected here. Before the art for a Neo-Porte talent ships,
  look at that talent's own channel profile or pinned post for a fan-work note (planned, per talent).
- Same non-commercial and "not official" duties as above. Contact if the owner chooses to ask:
  info@neo-porte.jp (listed on that page for cheering ads; not stated for fan-work questions).

## 5. REJECT

**URL:** https://reject.jp/brandguidelines/ (Logo, Clipping and Fan work guidelines on one page), fetched
2026-10-29. Footer ©2026 REJECT Inc. The page promises to print a revision date on any change but shows
none for the fan-work section.

**What it says, in our words (fan-work section: 二次創作ガイドライン).**
- Applies to **individual fans** creating new works from REJECT's copyrights or published content. Examples
  given: fan-art illustrations and cheering boards. Mere modifications are excluded.
- Work that follows the guideline and stays within personal fan activity needs no enquiry or permission.
- Banned: profit-making beyond personal fan activity (for example, giving out copies beyond covering
  production cost); excessive violence or cruelty; discrimination by race, gender, religion, orientation
  etc.; expression for or against a party or policy; portraying cheating or crime favourably; anything
  that badly damages the image of players, streamers or REJECT. The company may ask you to stop showing a
  work, may share works with players and streamers, and may reuse them in events and ads with minimal editing.
- The same page has a **logo guideline** (never alter the logo; no commercial use; nothing that looks
  official; no logo merchandise) and a **clipping guideline** (video clips; not relevant). Its clipping
  guideline's roster of covered streamers names 秋雪こはく, who is a leader card in the API
  (BP05-001, LR): this is a clipping roster, not a fan-art permission list, but it confirms the page is the
  right holder for that card.
- **Nothing on AI or AI training. Nothing on games, apps or tools.**

**Consequence for this project.**
- Never use the REJECT logo (also in the owner's posture). The name "REJECT" appears only as text where a
  card's affiliation is stated.
- Same individual, non-commercial, no-ads, not-official duties. REJECT players include real people
  (IdentityV division players are listed on the same page), so the real-face point under CR applies here too.
- The enquiry address on the page is obfuscated in the HTML I fetched; use the "Fan Letter" or contact
  link on https://reject.jp/ if the owner chooses to ask.

## 6. Precedent: fan-made Xross Stars tools

- Searched on 2026-10-29 (WebSearch, English and Japanese, four queries, including "非公式", "シミュレーター",
  "削除", "公開停止", "takedown"): **found no report of any fan-made Xross Stars tool being taken down or
  objected to, and no official statement about third-party simulators.** An absence in search results does
  not prove that no tool has been removed; a deleted repo would not show.
- GitHub repository search (GitHub connector, 2026-10-29, "xross stars" and "クロスタ OR XrossStars OR
  xross-stars") returned 16 public repos, all with 0 stars, including `wamo812/xross-stars-simple-deck-builder`
  (created 2025-08-23, still public), `hhakuri/xross-stars-deck`, `charu-hue/xross-stars-tool`,
  `megumi4150/xrossstars-log-tool` (match log maker) with `megumi4150/xrossstars-card-assets` ("card image
  assets", updated today, so a project that hosts card images is up), `megumi4150/xross-stars-log` (a PWA
  that imports official deck codes), `Argonauts-inc/xross-stars-go-kit`, `fuwap513/xrossstars`. I did not
  open them; their licences and contents are unchecked.
- A third-party site, XrossStars情報局 (https://xrossstars-info.com/, "©2025 XrossStars情報局"), runs a
  deck-recipe creator (card search, save, image export) and a blog on how to use it. It is live today.
- No fan-made full-rules battle simulator turned up in any search, so there is no closer precedent. The
  official site has its own deck page (`/deck`); a search result also shows the official X account
  promoting user deck recipes under `#クロスタデッキレシピ` (seen in a search snippet; X cannot be fetched
  here).
- Reading: Game & Co. has not been seen acting against fan tools in ten-odd public repos and a deck site.
  That is tolerance, not permission, and says nothing about a tool that shows talent likenesses.

## 7. Build obligations that follow

1. Label every AI illustration (in-game credits, README, any page showing art); announce with `#AIイラスト`,
   never a fan-art tag.
2. No official art, logo, icon or audio, and no official art as any input to image generation.
3. No ads, sponsors, donations, paid tiers or merchandise; published under the owner's handle, not a company.
4. No sexual or gory art; nothing that suggests official status; the unofficial notice in `NOTICE.md`, the
   README and an in-game screen.
5. Build-time use of the API only; no runtime calls and no hotlinked official images.
6. Keep `docs/takedown.md` working and the per-agency and per-talent asset layout in it (planned paths).

## Concern stated once

The owner's posture and the published policies do not collide head on: nothing published today bans
AI-generated depictions of talents or AI use in fan works, and VSPO! expressly allows AI illustrations when
labelled. The real conflicts are these, stated plainly:

1. **VSPO! sets conditions the posture did not mention** (the `#AIイラスト` label, no fan-art tag, no
   official art as a generation input, no sexual content). They bind us; they are met only if the
   obligations in section 7 are built in.
2. **Nobody has authorised a game.** None of the five holders names games, apps or tools. Game & Co. has
   published no fan-content policy at all. The agencies' guidelines cover individuals' non-commercial fan
   works and give each company, and each talent, a standing right to object (CR "members find it
   unpleasant"; VSPO! prohibitions 11 and 12; REJECT's "badly damages the image"; Neo-Porte's "talents
   find unpleasant"). The project stands on tolerance, and takedown readiness is its only protection.
3. **AI likeness of real people is unaddressed by every holder.** For VTuber talents a "recognisable avatar"
   is a character. CR and REJECT also manage real esports players and streamers; an AI image that reads as
   their real face is not a fan-art question these guidelines answer, and the agencies may not hold the
   individual's portrait or publicity rights to grant at all (their contracts are not public).
4. **Silence on AI from CR, Neo-Porte and REJECT** can change with one revision, and VSPO!'s section is
   already recent (the guideline was revised on 2026-09-17).

Options, if the owner wants to change course (none is required):
- **A. Keep the posture as is**, with the section-7 obligations. This is the baseline.
- **B. A per-agency art switch**: a build-time setting that replaces likeness art for a chosen agency (or
  for real-face talents only) with non-likeness art (an emblem, silhouette, colour field or original
  mascot), keeping names and stats. Path: a planned `data/art-policy.js` and `art/cards-neutral/`.
- **C. An original-name file** for any agency: show an original name in place of the real talent name
  while keeping the card numbers, a planned `data/names-original.js` read at build time.
- **D. Ask** by the contact points above (VSPO! fan-work address; Neo-Porte; REJECT and CR contact forms;
  Game & Co. contact form). A "no" would come on the record, so this is the owner's call.

**The owner's decision stands until the owner changes it.**
