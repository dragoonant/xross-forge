// AI bench (M4): head-to-head matches with behaviour counters, run on worker threads.
//   node tools/ai-bench.mjs [--pair "normal:random hard:normal easy:random"] [--seeds 1-200] [--workers 4]
//                           [--budget off|on] [--mode full|quick] [--json file] [--quick] [--verbose]
//                           [--decks ST01,ST02 | C01,C02,...]  (each deck plays the next one in the list, both seats)
// Every pairing is played in BOTH seats with BOTH decks (ST01 vs ST02 and swapped): 4 games per seed. Only decisive games
// enter the win rate (a 95% Wilson interval is printed); draws (both lose) and capped games are listed apart. `--budget off`
// (default) freezes the AI clock so decisions are reproducible and bounded by node counts alone; `--budget on` uses the real
// per-decision time budgets and reports decisions per second. `--quick` is the gate step: normal vs random over a fixed seed
// set, must win >= 95% of decisive games in each seat with 0 fallbacks and 0 illegal actions.
// Tuning seeds are 1-200; the holdout is 10001-10200 and is run once for the final numbers (docs/ai.md).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { loadPage } from './test.mjs';
import os from 'node:os';
import fs from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const QUICK = process.argv.includes('--quick');
const DECKS = arg('decks', 'ST01,ST02').split(',');
if (isMainThread) process.env.BENCH_DECKS = DECKS.join(',');   // worker threads get no argv; they read the list from the inherited environment
const CAP = 3000;

// ---------------------------------------------------------------------------------------------------------------------------
if (!isMainThread) {
  const XS = loadPage('tests.html').XS;
  // Each listed deck faces the next one in the list (the starters: ST01 <-> ST02).
  const DL = (process.env.BENCH_DECKS || 'ST01,ST02').split(',');
  const OTHER = Object.fromEntries(DL.map((d, i) => [d, DL[(i + 1) % DL.length]]));
  // A bot kind is 'random', a tier name, or a tier with overrides for tuning: 'normal{alive=60,t.pairs=4}' (t. = tier option; an array is written 24/20/16).
  const parseKind = (kind) => {
    const m = /^([a-z]+)(?:\{(.*)\})?$/.exec(kind);
    const o = { tier: m[1] };
    if (m[2]) for (const kv of m[2].split(',')) {
      const [k, v] = kv.split('=');
      if (k.startsWith('t.')) (o.tierOpts = o.tierOpts || {})[k.slice(2)] = +v; else (o.weights = o.weights || {})[k] = v.includes('/') ? v.split('/').map(Number) : +v;
    }
    return o;
  };
  const makeBot = (kind, seat, seed, budget) => {
    if (kind === 'random') return XS.ui.makeRandomBot(seed, seat);
    const o = Object.assign({ seat, seed }, parseKind(kind));
    if (budget) o.now = () => performance.now(); else o.now = () => 0;
    if (!budget) o.budgetMs = Infinity;
    return XS.ai.makeBot(o);
  };

  function playGame(job) {
    const { a, b, seed, aSeat, aDeck, mode, budget } = job;
    const decks = aSeat === 0 ? [aDeck, OTHER[aDeck]] : [OTHER[aDeck], aDeck];
    const kinds = aSeat === 0 ? [a, b] : [b, a];
    let s = XS.newGame({ decks, seed, mode, first: 'random' });
    const bots = [makeBot(kinds[0], 0, seed, budget), makeBot(kinds[1], 1, seed, budget)];
    const C = (kind) => ({ kind, lat: [], decisions: 0, ms: 0, maxMs: 0, turns: 0, empty: 0, missed: 0, ppLeft: 0, plays: 0, tactics: 0, awaken: 0, downs: 0, rounds: 0, illegal: 0, fallbacks: 0 });
    const cnt = [C(kinds[0]), C(kinds[1])];
    const turn = [{ n: -1, plays: 0, lethal: false }, { n: -1, plays: 0, lethal: false }];
    let steps = 0, illegal = 0, err = null;
    try {
      while (!XS.isTerminal(s) && steps < CAP) {
        const who = XS.whoActs(s);
        const main = s.pending === null && s.phase === 'main';
        if (main && turn[who].n !== s.turn) {
          turn[who] = { n: s.turn, plays: 0, lethal: false };
          // missed-lethal bookkeeping: does any PP-affordable attack at the start of this turn down a leader outright?
          for (const l of XS.legalActions(s)) {
            if (l.type !== 'play' || l.attacker === undefined) continue;
            const pv = XS.previewAttackDetail(s, l);
            const t = XS.leaderStatsOf(s, l.target);
            if (pv.goesDown || pv.total >= t.hp - t.damage) { turn[who].lethal = true; break; }
          }
        }
        const t0 = performance.now();
        const act = bots[who].choose(s);
        const dt = performance.now() - t0;
        const c = cnt[who];
        c.decisions++; c.ms += dt; if (dt > c.maxMs) c.maxMs = dt;
        if (kinds[who] !== 'random') c.lat.push(Math.round(dt * 10) / 10);
        let next;
        try { next = XS.apply(s, act); } catch (e) {
          if (e.name === 'Illegal') { illegal++; c.illegal++; err = 'illegal ' + JSON.stringify(act) + ': ' + e.message; break; }
          throw e;
        }
        if (main) {
          if (act.type === 'endTurn') {
            c.turns++; c.ppLeft += s.players[who].pp.untapped;
            if (turn[who].plays === 0) { c.empty++; if (turn[who].lethal) c.missed++; }
          } else if (act.type === 'play') { turn[who].plays++; c.plays++; }
        }
        for (let i = s.seq; i < next.seq; i++) {
          const e = next.log[i];
          if (e.type === 'awaken') cnt[e.seat].awaken++;
          else if (e.type === 'tacticsPlay') cnt[e.seat].tactics++;
          else if (e.type === 'down') cnt[e.seat].downs++;
          else if (e.type === 'roundEnd') { cnt[0].rounds++; cnt[1].rounds++; }
        }
        s = next; steps++;
      }
    } catch (e) { err = String(e.stack || e).split('\n').slice(0, 4).join(' | '); }
    for (const q of [0, 1]) if (bots[q].stats !== undefined) cnt[q].fallbacks = bots[q].stats.fallbacks;
    let winner = 'cap';
    if (err !== null) winner = 'error';
    else if (XS.isTerminal(s)) winner = s.winner === null ? 'draw' : (s.winner === aSeat ? 'A' : 'B');
    return { job, winner, reason: s.result ? s.result.reason : null, wins: s.wins.slice(), steps, turns: s.turn, cnt: aSeat === 0 ? cnt : [cnt[1], cnt[0]], illegal, err };
  }

  parentPort.on('message', (m) => {
    if (m.type === 'job') parentPort.postMessage({ type: 'result', r: playGame(m.job) });
    else if (m.type === 'stop') process.exit(0);
  });
  parentPort.postMessage({ type: 'ready' });
} else {
  // -------------------------------------------------------------------------------------------------------------------------
  const parseSeeds = (t) => {
    const out = [];
    for (const part of t.split(',')) {
      const [lo, hi] = part.split('-').map(Number);
      for (let i = lo; i <= (hi === undefined ? lo : hi); i++) out.push(i);
    }
    return out;
  };
  const pairs = (QUICK ? 'normal:random' : arg('pair', 'normal:random hard:normal easy:random')).split(/[\s;]+/).filter(Boolean).map((p) => p.split(':'));
  const seeds = parseSeeds(QUICK ? arg('seeds', '1-24') : arg('seeds', '1-200'));
  const workers = +arg('workers', String(Math.min(4, os.cpus().length)));
  const mode = arg('mode', 'full');
  const budget = arg('budget', 'off') === 'on';
  const jsonOut = arg('json', null);
  const verbose = process.argv.includes('--verbose');

  const jobs = [];
  if (arg('from', null) === null) for (const [a, b] of pairs) for (const seed of seeds) for (const aSeat of [0, 1]) for (const aDeck of DECKS) jobs.push({ a, b, seed, aSeat, aDeck, mode, budget });

  const wilson = (w, n) => {
    if (n === 0) return [0, 0];
    const z = 1.96, p = w / n, d = 1 + z * z / n;
    const c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return [Math.max(0, c - h), Math.min(1, c + h)];
  };
  const pct = (x) => (100 * x).toFixed(1) + '%';

  let results = [];
  const t0 = Date.now();
  const from = arg('from', null);          // --from a.json,b.json: render the report from saved runs (--json) instead of playing
  if (from !== null) for (const f of from.split(',')) results = results.concat(JSON.parse(fs.readFileSync(f, 'utf8')));
  if (from === null) await new Promise((resolve, reject) => {
    let next = 0, live = workers;
    const pool = [];
    for (let i = 0; i < workers; i++) {
      const w = new Worker(new URL(import.meta.url), { workerData: {} });
      pool.push(w);
      const feed = () => { if (next < jobs.length) w.postMessage({ type: 'job', job: jobs[next++] }); else { w.postMessage({ type: 'stop' }); if (--live === 0) resolve(); } };
      w.on('message', (m) => { if (m.type === 'ready') feed(); else { results.push(m.r); if (verbose && m.r.err) console.log('GAME ERROR', JSON.stringify(m.r.job), m.r.err); feed(); } });
      w.on('error', reject);
    }
  });
  const secs = (Date.now() - t0) / 1000;
  const seedsSeen = Array.from(new Set(results.map((r) => r.job.seed))).sort((x, y) => x - y);

  // ---- report ----------------------------------------------------------------------------------------------------------------
  let bad = 0;
  const out = [];
  const lines = (s) => { out.push(s); console.log(s); };
  for (const [a, b] of pairs) {
    const R = results.filter((r) => r.job.a === a && r.job.b === b);
    const dec = R.filter((r) => r.winner === 'A' || r.winner === 'B');
    const aw = dec.filter((r) => r.winner === 'A').length;
    const [lo, hi] = wilson(aw, dec.length);
    const draws = R.filter((r) => r.winner === 'draw').length, caps = R.filter((r) => r.winner === 'cap').length, errs = R.filter((r) => r.winner === 'error').length;
    lines(`\n${a} vs ${b}: ${R.length} games (${R.length / (2 * DECKS.length)} seeds x 2 seats x ${DECKS.length} decks, ${mode} match), decisive ${dec.length}, draws ${draws}, capped ${caps}, errors ${errs}`);
    lines(`  ${a} wins ${aw}/${dec.length} = ${pct(dec.length ? aw / dec.length : 0)}  (95% CI ${pct(lo)} to ${pct(hi)})`);
    for (const [label, f] of [['as seat 0', (r) => r.job.aSeat === 0], ['as seat 1', (r) => r.job.aSeat === 1], ...DECKS.map((d) => [`with ${d}`, (r) => r.job.aDeck === d])]) {
      const d = dec.filter(f), w = d.filter((r) => r.winner === 'A').length;
      const [l, h] = wilson(w, d.length);
      lines(`    ${label.padEnd(10)} ${w}/${d.length} = ${pct(d.length ? w / d.length : 0)}  (${pct(l)} to ${pct(h)})`);
    }
    // behaviour counters per tier
    const kinds = a === b ? [a] : [a, b];
    for (const [side, kind] of [[0, a], [1, b]]) {
      const t = { decisions: 0, ms: 0, maxMs: 0, turns: 0, empty: 0, missed: 0, ppLeft: 0, plays: 0, tactics: 0, awaken: 0, rounds: 0, illegal: 0, fallbacks: 0, n: 0 };
      let lat = [];
      for (const r of R) { const c = r.cnt[side]; for (const k of Object.keys(t)) if (k !== 'n' && k !== 'maxMs') t[k] += c[k]; t.maxMs = Math.max(t.maxMs, c.maxMs); t.n++; lat = lat.concat(c.lat); }
      lat.sort((x, y) => x - y);
      const q = (p) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] : 0);
      const per = (x, d) => (d ? (x / d).toFixed(2) : 'n/a');
      lines(`  [${kind}${a === b ? ' ' + 'AB'[side] : ''}] turns/game ${per(t.turns, t.n)}  empty turns ${per(100 * t.empty, t.turns)}%  missed lethal ${t.missed}  PP unspent/turn ${per(t.ppLeft, t.turns)}  plays/turn ${per(t.plays, t.turns)}  tactics/round ${per(t.tactics, t.rounds)}  awakenings/game ${per(t.awaken, t.n)}  decisions/s ${per(t.decisions * 1000, t.ms)}  ms p50/p95/max ${q(0.5).toFixed(0)}/${q(0.95).toFixed(0)}/${t.maxMs.toFixed(0)}  fallbacks ${t.fallbacks}  illegal ${t.illegal}`);
      if (kind !== 'random') { bad += t.fallbacks + t.illegal; }
    }
    void kinds;
    bad += errs;
    for (const r of R.filter((x) => x.winner === 'error').slice(0, 3)) lines('  ERROR ' + JSON.stringify(r.job) + ' ' + r.err);
    if (QUICK) {
      for (const seat of [0, 1]) {
        const d = dec.filter((r) => r.job.aSeat === seat), w = d.filter((r) => r.winner === 'A').length;
        if (d.length === 0 || w / d.length < 0.95) { bad++; lines(`FAIL ${a} won only ${w}/${d.length} decisive games as seat ${seat} (gate: >= 95%)`); }
      }
    }
  }
  lines(`\nai-bench: ${results.length} games in ${secs.toFixed(1)} s on ${workers} threads, seeds ${seedsSeen[0]}-${seedsSeen[seedsSeen.length - 1]} (${seedsSeen.length} seeds)${budget ? ', real budgets' : ', clock frozen'}${from !== null ? ' (merged from ' + from + ')' : ''}`);
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results));
  if (QUICK) {
    const R = results, dec = R.filter((r) => r.winner === 'A' || r.winner === 'B'), aw = dec.filter((r) => r.winner === 'A').length;
    const fb = R.reduce((n, r) => n + r.cnt[0].fallbacks + r.cnt[1].fallbacks, 0), il = R.reduce((n, r) => n + r.illegal, 0);
    console.log(`ai-bench --quick: normal beat random ${aw}/${dec.length} decisive (${pct(dec.length ? aw / dec.length : 0)}) in both seats, ${fb} fallbacks, ${il} illegal actions`);
  }
  process.exit(bad ? 1 : 0);
}
