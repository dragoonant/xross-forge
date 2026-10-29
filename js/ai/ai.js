// js/ai/ai.js: the AI. A pure function of (view, options): AI.choose(view, opts) -> { action, info }. It reads ONLY the view of the
// seat it plays (CLAUDE.md rule 7); where hidden cards matter it samples consistent worlds from that view (js/ai/determinize.js).
// Three tiers share one machine:
//   easy    one ply: every candidate first play (and "end the turn"), a simple evaluator, noise.
//   normal  one ply over the WHOLE TURN: a best-first search over sequences of plays (boost, then attack, then ...) on one sampled
//           world, every sequence scored against ending the turn now with the same evaluator.
//   hard    normal's shortlist, each candidate then played out through the rest of the turn AND the opponent's whole reply on K
//           sampled worlds (common random numbers: every candidate sees the same worlds), scored at the start of our next turn.
// "End the turn" is a candidate like any other, not a fallback: PP left over becomes cards at end of turn (PM p.06), and the
// evaluator prices that (js/ai/eval.js), so spend-versus-bank is one comparison.
//
// Clock (M4 requirement 6): opts.now() is the only source of time. A test freezes it (() => 0) and the search is then bounded by
// node counts alone, so a decision is reproducible; the page passes performance.now and the budget is a hard stop.
(function () {
  'use strict';
  const XS = globalThis.XS;
  const AI = (XS.ai = XS.ai || {});

  // ---- tiers -------------------------------------------------------------------------------------------------------------------
  // pairs: attack (attacker, target) pairs kept per attack card; nodes: search node cap; ms: default time budget (hard stop);
  // branch: children expanded below the root; worlds/cands: hard's rollout width.
  AI.TIERS = {
    easy:   { weights: 'easy', mode: 'greedy', pairs: 3, noise: 20, nodes: 0, ms: 60 },
    normal: { weights: 'full', mode: 'search', pairs: 5, nodes: 1400, branch: 7, depth: 7, ms: 150 },
    hard:   { weights: 'full', mode: 'rollout', pairs: 5, nodes: 700, branch: 6, depth: 7, ms: 600, worlds: 3, cands: 4, rolloutNodes: 250, lambda: 1, clip: 300, margin: 80, critical: true },
  };
  AI.TIER_NAMES = Object.keys(AI.TIERS);

  // ---- candidate plays ------------------------------------------------------------------------------------------------------
  // The legal main-phase plays, deduplicated (four copies of one card are one candidate) and with each attack card's
  // (attacker, target) pairs cut to the K best by AI.pairGain. Returns plays only; endTurn is always implicit.
  function candidatePlays(s, W, K) {
    const legal = XS.legalActions(s);
    const out = [];
    const seen = new Set();
    const groups = new Map();
    for (const a of legal) {
      if (a.type === 'endTurn') continue;
      const id = s.cards[a.iid].id;
      if (a.attacker !== undefined) {
        let g = groups.get(id);
        if (g === undefined) { g = { iid: a.iid, items: [] }; groups.set(id, g); }
        if (a.iid === g.iid) g.items.push(a);
      } else {
        const key = id + '|' + (a.target === undefined ? '' : a.target);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(a);
      }
    }
    for (const g of groups.values()) {
      const scored = g.items.map((a) => {
        const pv = XS.previewAttackDetail(s, a);
        return { a, k: AI.pairGain(s, W, a.attacker, a.target, pv.total, pv.goesDown) };
      });
      scored.sort((x, y) => y.k - x.k);
      for (const x of scored.slice(0, K)) out.push(x.a);
    }
    return out;
  }
  AI.candidatePlays = candidatePlays;

  // ---- settling pendings inside a simulation ------------------------------------------------------------------------------
  // Answer every pending decision with the same policies the live game uses, each from the view of the seat that must answer.
  // Stops at a round boundary (pickTactics / chooseFirst): the search treats those as leaves.
  function settle(s, ctx) {
    let guard = 0;
    while (s.pending !== null && s.phase !== 'over') {
      const k = s.pending.kind;
      if (k === 'pickTactics' || k === 'chooseFirst') break;
      s = XS.apply(s, AI.answerPending(XS.view(s, s.pending.seat), ctx));
      if (++guard > 60) throw new Error('ai: a simulation asked more than 60 questions in a row');
    }
    return s;
  }
  const END = Object.freeze({ type: 'endTurn' });

  // The evaluation every tier shares. `bank`: the seat is still in its main phase (unspent PP will draw cards).
  function value(s, me, W, bank) { return AI.evaluate(s, me, W, bank ? { bank: true } : undefined); }

  // ---- one greedy step (easy's whole decision; the rollouts' policy) ------------------------------------------------------
  // Score every candidate first play with one apply + evaluate and compare with ending the turn now. `noise` > 0 adds
  // seeded noise to each score (easy). Returns { action, value, base }.
  function greedyStep(s, seat, W, T, ctx, rg, noise) {
    const base = value(s, seat, W, true) + (noise > 0 ? noise * gauss(rg) : 0);
    let best = { action: END, value: base - 1e-9 };        // ending the turn is a candidate, scored with the others
    for (const a of candidatePlays(s, W, T.pairs)) {
      const c = settle(XS.apply(s, a), ctx);
      const v = value(c, seat, W, true) + (noise > 0 ? noise * gauss(rg) : 0);
      if (v > best.value) best = { action: a, value: v };
    }
    return { action: best.action, value: best.value, base };
  }
  // Approximately normal, unit variance (three uniforms sum to variance 1/4; doubled), seeded.
  function gauss(rg) { return (XS.rngNext(rg) + XS.rngNext(rg) + XS.rngNext(rg) - 1.5) * 2; }

  // Play out the rest of `seat`'s turn greedily, then end it. Returns the state at the start of the other seat's turn (or a round/match end).
  function greedyRest(s, seat, W, T, ctx, deadline) {
    const r0 = s.round;
    for (let i = 0; i < 12; i++) {
      if (s.phase !== 'main' || s.pending !== null || s.active !== seat) return s;
      const st = greedyStep(s, seat, W, T, ctx, null, 0);
      s = settle(XS.apply(s, st.action), ctx);
      if (st.action.type === 'endTurn' || s.round !== r0) return s;
      if (deadline.hit()) break;
    }
    if (s.phase === 'main' && s.pending === null && s.active === seat) s = settle(XS.apply(s, END), ctx);
    return s;
  }

  // ---- deadline -----------------------------------------------------------------------------------------------------------------
  function makeDeadline(now, budget) {
    const t0 = now();
    let hit = false;
    return {
      hit() { if (!hit && budget !== Infinity && now() - t0 > budget) hit = true; return hit; },
      force() { hit = true; },
      get stopped() { return hit; },
    };
  }

  // ---- the turn search (normal; also hard's shortlist) --------------------------------------------------------------------
  function signature(s, me) {
    const P = s.players[me], O = s.players[1 - me];
    const ids = (zone) => zone.map((i) => s.cards[i].id).sort().join(',');
    const lead = (X) => X.leaders.map((L) => (L.down ? 'D' : L.damage) + (L.awakened ? 'a' : '') + L.equipment.length).join(',');
    let memoria = 0;
    for (const i of P.play) if (s.cards[i].kind === 'memoria') memoria++;
    return [ids(P.hand), P.pp.untapped, P.tacPlayed ? 1 : 0, ids(P.boosts), memoria, ids(P.tarea), lead(P), lead(O), P.deck.length, O.hand.length, s.wins.join(''), P.tdeck.length].join('|');
  }

  // Best-first search over sequences of plays from `root`. Every visited state is scored with value(..., bank=true), i.e. "stop here and
  // pass the turn" (leftover PP draws). The root is the do-nothing baseline. Returns the table of first actions with their best
  // sequence, plus the baseline and bookkeeping.
  function searchTurn(root, me, W, T, ctx, deadline, onBest) {
    const baseline = value(root, me, W, true);
    const firsts = new Map();           // JSON(first action) -> { action, score, seq }
    let best = { score: baseline - 1, seq: [] };      // doing nothing gets a one-point handicap: ties go to action (KB "empty turns")
    let nodes = 0, depthMax = 0;
    const seen = new Set();
    const r0 = root.round;

    function record(score, seq) {
      const key = JSON.stringify(seq[0]);
      const f = firsts.get(key);
      if (f === undefined || score > f.score) firsts.set(key, { action: seq[0], score, seq });
      if (score > best.score) { best = { score, seq }; if (onBest !== undefined) onBest(seq[0]); }
    }

    function dfs(s, seq, depth) {
      if (depth > depthMax) depthMax = depth;
      const kids = [];
      for (const a of candidatePlays(s, W, T.pairs)) {
        const c = settle(XS.apply(s, a), ctx);
        nodes++;
        if ((nodes & 15) === 0) deadline.hit();
        kids.push({ a, s: c, v: value(c, me, W, true) });
      }
      kids.sort((x, y) => y.v - x.v);
      const lim = depth === 0 ? kids.length : Math.min(kids.length, T.branch);
      for (let i = 0; i < kids.length; i++) {
        const k = kids[i];
        const sq = seq.concat([k.a]);
        record(k.v, sq);                                  // "play this and pass" is scored for every kid, even those not expanded
      }
      for (let i = 0; i < lim; i++) {
        if (nodes >= T.nodes || (depth > 0 && deadline.stopped)) return;
        const k = kids[i];
        const c = k.s;
        if (c.phase !== 'main' || c.pending !== null || c.round !== r0 || depth + 1 >= T.depth) continue;
        const sg = signature(c, me);
        if (seen.has(sg)) continue;
        seen.add(sg);
        dfs(c, seq.concat([k.a]), depth + 1);
      }
    }
    seen.add(signature(root, me));
    dfs(root, [], 0);
    return { best, baseline, firsts, nodes, depthMax };
  }

  // Play a whole turn for `seat` in an exact (sampled) world: search once, replay the best sequence, end the turn. The world is exact
  // for both seats, so the replay reproduces the search's own simulation. Returns the state at the start of the other seat's turn
  // (or wherever a round or the match ended).
  function playTurn(s, seat, W, T, ctx, deadline) {
    if (s.phase !== 'main' || s.pending !== null || s.active !== seat) return s;
    const r0 = s.round;
    const res = searchTurn(s, seat, W, T, ctx, deadline, undefined);
    for (const a of res.best.seq) {
      s = settle(XS.apply(s, a), ctx);
      if (s.phase !== 'main' || s.pending !== null || s.round !== r0) return s;
    }
    return settle(XS.apply(s, END), ctx);
  }

  // Is the round close to being decided for either side? (Hard's rollouts only run then.)
  function isCritical(s, me) {
    const mine = XS.aliveLeaders(s, me), theirs = XS.aliveLeaders(s, 1 - me);
    if (mine.length <= 2 || theirs.length <= 2) return true;
    return mine.some((iid) => XS.leaderStatsOf(s, iid).remaining <= 70);
  }

  // ---- hard: rollouts on K sampled worlds with common random numbers ---------------------------------------------------------
  function rolloutScores(view, me, W, T, ctx, deadline, cands, seed, decks) {
    const sums = cands.map(() => 0);
    const TR = Object.assign({}, T, { nodes: T.rolloutNodes });      // the rollouts' own, smaller, search
    let done = 0;
    for (let j = 0; j < T.worlds; j++) {
      const world = AI.determinize(view, AI.mixSeed(seed, 'world', j), { decks });
      const scores = [];
      for (const c of cands) {
        let s = settle(XS.apply(world, c.action), ctx);          // first action
        const r0 = world.round;
        if (c.action.type !== 'endTurn') s = playTurn(s, me, W, TR, ctx, deadline);     // the rest of our turn, searched in this world
        // the opponent's whole reply, searched from the world they hold
        if (s.phase === 'main' && s.pending === null && s.active !== me && s.round === r0) s = playTurn(s, 1 - me, W, TR, ctx, deadline);
        scores.push(value(s, me, W, false));
      }
      for (let i = 0; i < cands.length; i++) sums[i] += scores[i];
      done++;
      if (deadline.hit()) break;
    }
    return { means: sums.map((x) => (done === 0 ? -Infinity : x / done)), worlds: done };
  }

  // ---- the entry point ---------------------------------------------------------------------------------------------------------
  // opts: { tier, seed, now, budgetMs (Infinity = no clock), decks, stats, onBest }
  AI.choose = function (view, opts) {
    const T0 = AI.TIERS[opts.tier];
    if (T0 === undefined) throw new Error('ai: unknown tier ' + JSON.stringify(opts.tier));
    const T = opts.tierOpts === undefined ? T0 : Object.assign({}, T0, opts.tierOpts);      // tuning only (tools/ai-bench.mjs)
    const me = view.viewer;
    if (XS.whoActs(view) !== me) throw new Error('ai: asked to act but it is seat ' + XS.whoActs(view) + "'s move");
    const W = Object.assign({}, AI.WEIGHTS[T.weights], { goFirst: AI.GO_FIRST }, opts.weights);
    const stats = opts.stats === undefined ? {} : opts.stats;
    const ctx = { W, stats };
    if (view.pending !== null) {
      return { action: AI.answerPending(view, ctx), info: { how: 'policy', kind: view.pending.kind, purpose: view.pending.purpose } };
    }
    if (view.phase !== 'main') throw new Error('ai: phase ' + view.phase + ' with no pending decision');
    const now = opts.now === undefined ? (() => 0) : opts.now;
    const budget = opts.budgetMs === undefined ? T.ms : opts.budgetMs;
    const deadline = makeDeadline(now, budget);
    const seed = AI.mixSeed(opts.seed === undefined ? 0 : opts.seed, me, view.seq, view.turn, opts.tier);
    const world = AI.determinize(view, AI.mixSeed(seed, 'world', 0), { decks: opts.decks });
    const rg = AI.rngOf(AI.mixSeed(seed, 'noise'));

    if (T.mode === 'greedy') {
      const st = greedyStep(world, me, W, T, ctx, rg, T.noise);
      return { action: st.action, info: { how: 'greedy', value: st.value, base: st.base } };
    }
    const res = searchTurn(world, me, W, T, ctx, deadline, opts.onBest);
    const info = { how: T.mode, nodes: res.nodes, depth: res.depthMax, base: res.baseline, best: res.best.score, plan: res.best.seq.length };
    if (T.mode === 'search') {
      return { action: res.best.seq.length > 0 ? res.best.seq[0] : END, info };
    }
    // hard: shortlist the best first actions of the search, add "end the turn", and score all of them on the same K worlds.
    // The rollouts are spent where they can change the answer: a round that is about to be decided (a team down to two leaders, or a
    // standing leader of ours within reach of one big turn); elsewhere the searched plan is already the best reading of the position.
    if (T.critical && !isCritical(world, me)) return { action: res.best.seq.length > 0 ? res.best.seq[0] : END, info: Object.assign(info, { skipped: 'quiet position' }) };
    // Only plans within T.margin of the best compete: the rollouts arbitrate between near-equal plans (which one leaves us safer), they
    // never veto a clearly better one (unrestricted, hard passed on an available down 23 times in 800 games, docs/ai.md).
    const topPlan = res.best.score;
    const ranked = Array.from(res.firsts.values()).sort((a, b) => b.score - a.score).filter((f) => f.score >= topPlan - T.margin).slice(0, T.cands);
    const cands = ranked.map((f) => ({ action: f.action, plan: f.score, seq: f.seq }));
    if (res.baseline >= topPlan - T.margin) cands.push({ action: END, plan: res.baseline, seq: [END] });     // ending the turn competes only when it is close too
    else cands.push({ action: END, plan: -Infinity, seq: [END] });      // kept as the reference the rollout deltas are measured against, never chosen
    if (cands.filter((c) => c.plan > -Infinity).length <= 1 || deadline.stopped) {         // a single contender: nothing for the rollouts to arbitrate
      return { action: res.best.seq.length > 0 ? res.best.seq[0] : END, info };
    }
    const r = rolloutScores(view, me, W, T, ctx, deadline, cands, seed, opts.decks);
    // Nothing completed (deadline before the first world finished): keep the search's answer.
    if (r.worlds === 0) return { action: res.best.seq.length > 0 ? res.best.seq[0] : END, info };
    // Each candidate's score is its searched plan value plus the rollouts' verdict on it RELATIVE to ending the turn now, clipped so one
    // unlucky sampled world (a lost match is -1e6) cannot outvote the plan (docs/ai.md: unclipped rollouts alone measured no better than normal).
    const endIx = cands.length - 1;
    const total = cands.map((c, i) => (c.plan === -Infinity ? -Infinity : c.plan + T.lambda * Math.max(-T.clip, Math.min(T.clip, r.means[i] - r.means[endIx]))));
    let bi = 0;
    total.forEach((v, i) => { if (v > total[bi] + 1e-9) bi = i; });
    info.worlds = r.worlds; info.rollout = cands.map((c, i) => ({ a: c.action, plan: Math.round(c.plan * 10) / 10, m: Math.round(r.means[i] * 10) / 10, total: Math.round(total[i] * 10) / 10 }));
    if (opts.onBest !== undefined) opts.onBest(cands[bi].action);
    return { action: cands[bi].action, info };
  };

  // The message loop of the Web Worker, kept here so node tests drive the same code (js/ai/worker.js only wires it to postMessage).
  //   in:  { type: 'decide', id, view, tier, seed, budgetMs?, decks? }
  //   out: { type: 'partial', id, action }  the best answer so far (so the page's watchdog never has to guess)
  //        { type: 'result', id, action, info } | { type: 'error', id, message, stack }
  AI.serve = function (m, post, clock) {
    if (m.type !== 'decide') throw new Error('ai worker: unknown message type ' + JSON.stringify(m.type));
    let last = -Infinity;
    try {
      const r = AI.choose(m.view, {
        tier: m.tier, seed: m.seed, now: clock, budgetMs: m.budgetMs, decks: m.decks,
        onBest(action) { const t = clock(); if (t - last >= 20) { last = t; post({ type: 'partial', id: m.id, action }); } },
      });
      post({ type: 'result', id: m.id, action: r.action, info: r.info });
    } catch (e) {
      post({ type: 'error', id: m.id, message: String(e && e.message), stack: String(e && e.stack) });
    }
  };

  // A bot for node tools and tests: choose(rawState) -> action, deciding from XS.view(s, seat) alone.
  AI.makeBot = function (opts) {
    const stats = { decisions: 0, fallbacks: 0, nodes: 0, ms: 0, maxMs: 0 };
    return {
      seat: opts.seat, name: 'AI ' + opts.tier, stats,
      choose(s) {
        const seat = XS.whoActs(s);
        if (seat !== opts.seat) throw new Error('bot: asked to act but it is seat ' + seat + "'s move");
        const view = XS.view(s, seat);
        const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
        const r = AI.choose(view, Object.assign({}, opts, { stats }));
        const dt = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
        stats.decisions++; stats.ms += dt; if (dt > stats.maxMs) stats.maxMs = dt;
        if (r.info.nodes !== undefined) stats.nodes += r.info.nodes;
        return r.action;
      },
    };
  };
})();
