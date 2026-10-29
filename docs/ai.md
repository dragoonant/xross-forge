# AI notes (M4)

The opponent is `js/ai/`: a pure function of a seat's `XS.view`, run in a Web Worker in the page and synchronously in node
tools and tests. The arena (`tools/ai-bench.mjs`) is a behaviour check and tuner, never a reason to change a card (PLAN D2/D3,
KB card-games §4). Every number below was measured by the bench; "seeds 1-200" is the tuning set, "seeds 10001-10200" the holdout.

## Files

| File | What |
|---|---|
| `js/ai/determinize.js` | view -> one consistent full state (hidden cards sampled, seeded) |
| `js/ai/eval.js` | the evaluator and every weight (each with its WHY) |
| `js/ai/policies.js` | `POLICIES[kind][purpose]`: answers to pending decisions; throws on an unknown pair |
| `js/ai/ai.js` | tiers, the turn search, hard's rollouts, `AI.choose(view, opts)`, `AI.makeBot`, `AI.serve` |
| `js/ai/worker.js` | the Worker: `importScripts` of the engine block + the ai block (kept equal by `tools/check-pages.mjs`) |
| `js/ui/bot-ai.js` | the page side: worker lifecycle, requests, the error banner. **No fallback to the random bot** |
| `tools/ai-bench.mjs` | the bench; `--quick` is the gate step |
| `tests/40-ai.js` | 29 tests, named for the requirement each asserts |

## How a decision is made

1. **View only.** `AI.choose(view, opts)` never sees raw state. `AI.makeBot(...).choose(s)` (node) builds `XS.view(s, seat)` first. A test
   builds two raw states with the same view and different hidden cards (opponent hand/deck swapped, both decks reordered, hidden
   trash and tactics swapped) and requires the same choice at every tier, for main-phase and pending decisions.
2. **Determinize.** Unseen cards of a seat = its decklist (`view.players[p].deckId`) minus what the view shows minus the face-down trash
   cards the log already revealed (a card played is public until it is trashed; a reshuffle clears the memory). They are dealt uniformly
   into the hidden slots: the opponent's hand, both decks, the face-down trash, the opponent's tactics. Same view + same seed = same world.
   The count must balance exactly or it throws (3,485 sampled states in a sweep: 0 mismatches, legal actions identical to the real state's).
3. **Pending decisions** (target, heal, discard, hand limit, order, attack pair, distribute, tactics pick, who goes first) are answered by
   `POLICIES` straight from the view: the engine keeps its resolution stack private, so a pending state cannot be rebuilt and searched.
   The search settles the same pendings inside its simulations with the same policies. An unknown kind/purpose throws.
4. **Main phase = score every candidate against doing nothing.** `endTurn` is scored by the same evaluator as every play: leftover PP
   becomes cards at end of turn (PM p.06), priced as the marginal cards it buys (nothing once the hand is at 7). The baseline gets a
   one-point handicap so a tie goes to action (KB: empty turns).

| Tier | Search | Evaluator | Budget (hard stop) |
|---|---|---|---|
| easy | one ply: every candidate first play + end turn, one apply each | simple (`EASY`: no tag/clock/health terms), Gaussian noise sd 20 | 60 ms |
| normal | best-first search over whole-turn play sequences (7 deep, 1,400 nodes, 5 attacker/target pairs per attack card, transposition table) on one sampled world | full | 150 ms |
| hard | normal's search (700 nodes), then **only when the round is close to decided** (a team down to 2 leaders, or one of ours within 70 HP): the plans within 80 points of the best, plus end-turn as reference, each played out on 3 sampled worlds (rest of our turn searched, then the opponent's whole reply searched from the world they hold) and scored at the start of our next turn; **common random numbers** (every candidate sees the same worlds); the rollout verdict is relative to ending the turn, clipped to +-300, added to the plan value | full | 600 ms |

The clock is injected (`opts.now`); the node tools and tests freeze it (`() => 0`) so a decision is reproducible and bounded by node caps
alone. A test shows a ticking clock with an 8 ms budget cuts the search and still answers legally.

## The evaluator (`js/ai/eval.js`), unit = 1 HP

| Weight | Value | Why |
|---|---|---|
| `hp` | 1.0 | the round is a race to take every opposing leader's HP to zero |
| `alive` | 40 | a standing leader must still be downed (4 downs end the round); a down awakens the attacker; overkill is wasted |
| `close` | 35 | concave health bonus: damage costs the owner more on a wounded leader; focuses fire |
| `awakened` | 10 | persists into later rounds (+30 HP is already in `remaining`) |
| `teamAtk` | 4.0 / ATK above 30 | every attack picks its attacker, so one standing awakened leader lifts every attack by 10 |
| `equip` | 12 | equipment stays across rounds |
| `round` | 3000 | a round won beats any position (see the bug below) |
| `mp` | 0.35 | at match point the other side's leader terms count more |
| `hand` x `handMul` | [24,20,16,11,7,3,1] x 5 | marginal value of the n-th card; PP, not cards, limits plays; the hand limit cuts at 7 |
| bank | by `hand` | unspent PP -> cards at end of turn, only while the seat is in its main phase |
| `killCard` | 30 | Crossfire / Demon King's Descent: with every leader tagged (always true in the starters) 3 PP downs any leader |
| `tarea` / `tdeck` | 22 / 16 | an unplayed tactics card; a card still in the tactics deck |
| `boost` / `boostIdle` | 0.8 / 0.1 | an armed boost is worth that share of its damage while an affordable attack is in hand (it expires at end of turn) |
| `burn` / `lose` | 45 / 4000 | a reshuffle burns a tactics card; with none left it loses the match (the clock) |

Perceived and unit-tested (`tests/40-ai.js`, "AI eval"): remaining HP, downs, awakened, round score and match point, hand with
diminishing returns, PP bank, tactics-deck clock and a lethal reshuffle, armed boosts, equipment, tag conditions (including switching
the kill card off when one leader lacks the tag).

## Measurement

`node tools/ai-bench.mjs [--pair "normal:random hard:normal easy:random"] [--seeds 1-200] [--budget off|on] [--json f] [--from a.json,b.json]`.
Every pairing is played in both seats with both decks (ST01 vs ST02 and swapped): 4 full matches per seed. Only decisive games enter the
win rate (95% Wilson interval); draws and capped games are listed apart (there were none). A variant is written
`normal{handMul=4,t.pairs=3}` (`t.` = a tier option). `--quick` is the gate step: normal vs random, seeds 1-24 (96 games, ~12 s), must win
>= 95% of decisive games in each seat with 0 fallbacks and 0 illegal actions.

### Holdout, seeds 10001-10200 (800 games per pairing, final code, clock frozen)

| Pairing | Result (decisive 800/800) | 95% CI | Seat 0 / seat 1 | ST01 / ST02 |
|---|---|---|---|---|
| normal vs random | **800 / 800 = 100.0%** | 99.5 - 100 | 100 / 100 | 100 / 100 |
| easy vs random | 799 / 800 = 99.9% | 99.3 - 100 | 99.8 / 100 | 100 / 99.8 |
| hard vs normal | **427 / 800 = 53.4%** | 49.9 - 56.8 | 55.5 / 51.2 | 51.0 / 55.8 |

Tuning set, seeds 1-200 for comparison: normal vs random 800/800, easy vs random 795/800 (99.4%), hard vs normal 441/800 = 55.1%
(51.7 - 58.5). **Hard is stronger than normal by a small margin that the interval does not exclude from zero**; it is the same
evaluator plus a risk check in decided positions, not a new level of play (see "What did not help").

Disclosure: after the first holdout run I inspected one holdout game (seed 10014) to debug a "missed lethal" counter, found the
round-win weight too small (below), fixed it, and regenerated every holdout number with the final code. No other holdout game was read.

### Behaviour counters (holdout; per decision-maker)

| | turns/game | empty turns | missed lethal | PP unspent/turn | plays/turn | tactics/round | awakenings/game | decisions/s | ms p50/p95/max | fallbacks |
|---|---|---|---|---|---|---|---|---|---|---|
| easy (vs random) | 9.92 | 1.03% | 0 | 0.88 | 2.50 | 1.11 | 3.85 | 1,932 | 0/1/12 | 0 |
| normal (vs random) | 5.80 | 1.36% | 0 | 0.55 | 3.37 | 1.12 | 3.95 | 128 | 1/43/353 | 0 |
| normal (vs hard) | 8.62 | 1.80% | 2 | 0.72 | 3.21 | 1.18 | 3.82 | 118 | 1/53/272 | 0 |
| hard | 8.57 | 1.66% | 2 | 0.70 | 3.27 | 1.18 | 3.83 | 21 | 2/248/819 | 0 |
| random (control, vs normal) | 7.03 | 8.04% | 96 | 0.84 | 2.44 | 1.20 | 1.19 | 23,857 | 0/0/9 | 0 |

"Missed lethal" = a turn with zero plays that began with a PP-affordable attack that would have downed a leader (the 2 + 2 remaining cases were not inspected). Illegal actions: 0 in every run. **Fallbacks are 0 by construction:** the AI has
no random path (an unknown pending kind throws, and the bench counts a thrown game as an error: 0). With the real budgets
(`--budget on`, 48 games, 2 threads) normal's slowest decision was 157-166 ms (budget 150) and hard's 614 ms (budget 600); p95 51-60 ms and 270 ms.

Games are short: a normal-vs-random full match is about 6 own turns, hard-vs-normal about 9. The deck-out clock (the 50-card deck, then a
tactics card burned) is perceived by the evaluator but almost never decides a game at this length.

## What did not help (numbers; do not re-run these)

Win rate of the variant against the default `normal` of the moment, 400 games on seeds 1-100 (95% interval about +-4.8 points).

| Change | Result | Verdict |
|---|---|---|
| `handMul` 0.4 / 2.5 / 4 / 7 (from 1.0) | 49.5 / 59.5 / **62.0 / 62.3**; 4 vs 2.5: 53.5 | the one weight that mattered; 5 chosen on the plateau |
| hand curve flat (x5: 24/24/24/24/24/12/6) / steeper (40/30/20/10/5/2/0) | 37.8 / 52.5 | keep the shape |
| `alive` 15 / 80 | 49.3 / 51.5 (47.0 at `handMul` 5) | noise |
| `teamAtk` 0 / 9 | 51.5 / 48.8 | noise |
| `close` 0 / 80 | 50.5 / 52.3 | noise |
| `hp` 0.6 / 1.6 (at `handMul` 5) | 48.8 / 49.3 | noise |
| `tarea` 100 | 34.0 | hoarding the tactics card loses; 0 / 8 measured 53.0 / 51.0 (noise), 22 kept |
| `boost` 0.4 / 1.3 | 47.5 / 44.5 | noise-to-worse |
| `tdeck` = `burn` = 0 (no clock) | 50.0 | the clock does not decide games this short |
| hand quality term `qual` 0.15 / 0.5 | 53.3 / 47.5 | noise; left at 0 |
| `shield` 0 / 2.5 (how much the secret pick wants Light Shield) | 53.8 / 50.0 | noise |
| `t.pairs` 3 (instead of 5) | 51.5 | a cheaper search is as good |
| a far larger search (16 pairs, 4,000 nodes, branch 12), seeds 1-50 | 46.5 | the search is saturated; the evaluator is the limit |
| going second (`goFirst` off) | 40.0 | go first. (Round-1 first player won 71 of 120 normal-vs-normal rounds, 65 of 120 matches.) |
| `round` 900 -> 3000 | 50.2 | no weight effect, but it fixed a rule-perception bug (below) |
| normal vs easy | 99.0% (noise 9), 98.8% (noise 0, seeds 1-100) | the whole-turn plan is worth far more than one-ply greedy |
| easy noise 25 / 50 / 100 vs random | 99.3 / 98.8 / 96.8 | random is too weak to tell them apart; sd 20 kept |

Hard, against normal (all with 3 worlds; sample sizes differ, so read the interval):

| Version | Result |
|---|---|
| rollouts on every decision, opponent replied by a one-ply greedy bot | 43.8% (80 games) |
| + follow the searched plan in each world | 50.8% (240) |
| opponent's reply searched like normal's turn (the greedy model missed combos, so danger was misjudged) | 50.4% (240), 9 missed lethals |
| + rollout verdict added to the plan value, clipped | 47.9% (240) |
| + rollouts only in decided positions | 52.9% (240) |
| rollouts alone vs the plan, unrestricted candidates | 53.3% (800, seeds 1-200) but **23 missed lethals** in 800 games: a sampled reply vetoed a clearly better plan |
| **final: only plans within 80 points of the best compete** | 55.1% (800, seeds 1-200), 2 missed lethals; **53.4% on the holdout** |

Why hard cannot do much more here: the game has almost no defence (a down changes the opponent's ATK only when it removes their only
awakened leader; the remaining defensive cards are First Aid Kit and Light Shield), so what the opponent can do next turn barely depends
on our play. The rollouts mostly arbitrate near-equal plans and catch the occasional "they can finish us" turn.

### The round-win bug (rule perception)

With `round` = 900 the AI once ended its turn instead of playing the attack that downed the opponent's last leader (it held 5 cards
and a leader on 10 HP was scored about as high as a won round: the won round resets both teams and dumps both hands). The evaluator now
values a won round at 3000, above any position. The same pass confirmed the bench counter that exposed it ("missed lethal") reads 0-2
per 800 games afterwards.

## Known limits

- Pending decisions are answered by rule, not searched (the engine's resolution stack is private; `docs/ENGINE-API.md`). The starters'
  pendings are few and small (target 10-40 damage, heal, discard one, order).
- A deck must be in `XS.DECKS` (the view carries `deckId`, not the list); a custom deck needs `opts.decks`. The sim's 12-card "thin"
  decks have no id, so the AI cannot play them.
- The worker is opened as `js/ai/worker.js?v=<stamp>` and every import repeats the query; the stamp folds the page's own script
  hashes, which do not include `worker.js` itself (only a change to that one file, with nothing else changing, can be served stale for
  Pages' 10-minute cache).
- Hard's 3 worlds make its rollout verdict noisy; that is why it is clipped and restricted to near-equal plans.
