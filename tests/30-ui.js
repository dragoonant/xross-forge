// tests/30-ui.js: headless checks on the view layer (no DOM). Names state what they assert.
//  * every log type of docs/ENGINE-API.md has a player-facing line (and a presentation step);
//  * every pending kind and purpose has a prompt renderer;
//  * the interaction models derive from legalActions / the pending decision and never auto-pick.
(function () {
  const XS = globalThis.XS;
  const U = XS.ui;
  const { test, eq, ok, throws } = XS.T;

  // Copied from docs/ENGINE-API.md "Log" and "Pending decision". When the contract grows, this grows.
  const LOG_TYPES = ['start', 'rps', 'chooseFirst', 'roundStart', 'tacticsPick', 'tacticsPlace', 'draw', 'turnStart', 'turnEnd', 'ppRecover',
    'ppSpend', 'play', 'tacticsPlay', 'equip', 'boost', 'attack', 'damage', 'heal', 'down', 'awaken', 'ability', 'discard', 'trash',
    'reshuffle', 'tacticsBurn', 'roundEnd', 'matchEnd', 'fizzle'];
  const PENDING_KINDS = ['chooseFirst', 'pickTactics', 'choose', 'attackPair', 'distribute'];
  const PENDING_PURPOSES = ['first', 'tactics', 'target', 'heal', 'discard', 'handLimit', 'order', 'attack', 'distribute'];

  // A stub view: seat 0 holds the ST01 leaders, seat 1 the ST02 leaders.
  function stubView(viewer) {
    const L = (seat, ids) => ids.map((id, slot) => ({ iid: 'L' + seat + slot, cardId: id, slot }));
    return {
      viewer, log: [], cards: { c1: { iid: 'c1', id: 'ST01-005' }, c2: { iid: 'c2', id: 'ST01-013' } },
      players: [{ leaders: L(0, ['ST01-001', 'ST01-002', 'ST01-003', 'ST01-004']) }, { leaders: L(1, ['ST02-001', 'ST02-002', 'ST02-003', 'ST02-004']) }],
    };
  }
  // One sample data object per log type (shape from the contract table).
  const SAMPLE = {
    start: { mode: 'full', decks: ['ST01', 'ST02'], first: 0 },
    rps: { winner: 0 },
    chooseFirst: { by: 0, first: 1 },
    roundStart: { round: 2, first: 1, pp: 4 },
    tacticsPick: { iid: 'c1', cardId: 'ST01-019' },
    tacticsPlace: { iid: 'c1', cardId: 'ST01-024', why: 'ppTicket' },
    draw: { iid: 'c1', cardId: 'ST01-005', cause: 'turnStart' },
    turnStart: { turn: 3, roundTurn: 2 },
    turnEnd: { turn: 3 },
    ppRecover: { n: 1, requested: 1, cause: 'effect' },
    ppSpend: { n: 2, for: 'c1' },
    play: { iid: 'c1', cardId: 'ST01-005', type: 'attack', cost: 3 },
    tacticsPlay: { iid: 'c2', cardId: 'ST01-023', subtype: 'equipment', cost: 0 },
    equip: { iid: 'c2', cardId: 'ST01-023', leader: 'L01', seat: 0, slot: 1 },
    boost: { iid: 'c2', cardId: 'ST01-013', phase: 'applied', amount: 50 },
    attack: { attackId: 1, seg: 0, card: 'c1', attacker: 'L00', target: 'L12', damage: 80, parts: { atk: 30, boost: 50, card: 0 } },
    damage: { leader: 'L12', amount: 10, kind: 'effect', before: 0, after: 10 },
    heal: { leader: 'L01', amount: 20, requested: 30 },
    down: { leader: 'L12', seat: 1, slot: 2, cause: 'damage' },
    awaken: { leader: 'L00', seat: 0, slot: 0, cause: 'attack', atk: 40, hp: 130 },
    ability: { src: 'c2', cardId: 'ST01-013', timing: 'afterAttack' },
    discard: { iids: ['c1', 'c2'], cardIds: ['ST01-005', 'ST01-013'], n: 2, cause: 'handLimit' },
    trash: { iids: ['c1', 'c2'], cardIds: ['ST01-005', 'ST01-013'], faceUp: [false, false], cause: 'endPhase' },
    reshuffle: { seat: 0, n: 12 },
    tacticsBurn: { seat: 0, iid: 'c1', cardId: 'ST01-019' },
    roundEnd: { round: 1, winner: 0, loser: 1, wins: [1, 0] },
    matchEnd: { winner: 1, losers: [0], reason: 'rounds', wins: [0, 2] },
    fizzle: { src: 'c2', cardId: 'ST01-013', reason: 'noTarget' },
  };
  const entry = (type, data, seat, via) => ({ seq: 0, round: 1, turn: 1, seat: seat === undefined ? 0 : seat, type, data, via: via === undefined ? null : via });

  test('ui log: the contract list and the samples cover the same log types', () => {
    eq(Object.keys(SAMPLE).sort(), LOG_TYPES.slice().sort(), 'every contract log type has a sample');
  });

  test('ui log: every log type has a player-facing line, for both seats, with no placeholder text', () => {
    for (const type of LOG_TYPES) {
      ok(U.LOG_TYPES.includes(type), 'logText has a phrase for ' + type);
      for (const viewer of [0, 1]) for (const seat of [0, 1]) {
        const v = stubView(viewer);
        const r = U.logText(entry(type, SAMPLE[type], seat), v);
        ok(typeof r.text === 'string' && r.text.length > 8, `${type}: a real sentence, got "${r.text}"`);
        ok(!/undefined|\[object|NaN|null/.test(r.text), `${type}: no placeholder text in "${r.text}"`);
        ok(Array.isArray(r.segs) && r.segs.every((s) => typeof s === 'string' || (typeof s === 'object' && typeof s.card === 'string')), type + ': segments');
      }
    }
  });

  test('ui log: hidden variants of draw, discard and tacticsPick never name a card', () => {
    const v = stubView(0);
    const draw = U.logText(entry('draw', { cause: 'effect', hidden: true }, 1), v);
    ok(!draw.segs.some((s) => typeof s === 'object'), 'hidden draw has no card reference');
    eq(draw.text.startsWith('Opponent draws a card'), true, 'opponent draw line');
    const disc = U.logText(entry('discard', { n: 2, cause: 'effect', hidden: true }, 1), v);
    ok(!disc.segs.some((s) => typeof s === 'object') && disc.text.includes('2 cards'), 'hidden discard shows a count only: ' + disc.text);
    const pick = U.logText(entry('tacticsPick', { hidden: true }, 1), v);
    ok(!pick.segs.some((s) => typeof s === 'object'), 'hidden pick names no card');
  });

  test('ui log: card names in a line are hover-zoom references carrying the card number and leader iid', () => {
    const r = U.logText(entry('attack', SAMPLE.attack, 0), stubView(0));
    const refs = r.segs.filter((s) => typeof s === 'object');
    eq(refs.map((x) => x.card), ['ST01-001', 'ST02-003', 'ST01-005'], 'attacker, target, attack card');
    eq(refs[0].iid, 'L00', 'leader ref keeps its iid so the zoom can show live stats');
  });

  test('ui log: an unknown log type throws instead of printing nothing', () => {
    throws(() => U.logText(entry('mystery', {}, 0), stubView(0)), 'unknown type must throw');
  });


  test('ui log: every entry of real games reads as a sentence for both seats, and plans into steps (8 seeds, both modes)', () => {
    const seen = new Set();
    for (let seed = 1; seed <= 8; seed++) {
      const mode = seed % 2 === 0 ? 'quick' : 'full';
      let s = XS.newGame({ decks: ['ST01', 'ST02'], seed, mode });
      const bots = [U.makeRandomBot(seed, 0), U.makeRandomBot(seed, 1)];
      for (let n = 0; n < 4000 && !XS.isTerminal(s); n++) s = XS.apply(s, bots[XS.whoActs(s)].choose(s));
      ok(XS.isTerminal(s), 'game ended');
      for (const viewer of [0, 1]) {
        const v = XS.view(s, viewer);
        for (const e of v.log) {
          seen.add(e.type);
          const r = U.logText(e, v);
          ok(r.text.length > 8 && !/undefined|\[object|NaN|null/.test(r.text), `seed ${seed} viewer ${viewer} ${e.type}: "${r.text}"`);
        }
        const steps = U.anim.plan(v.log, v, viewer);
        ok(steps.length > 0 && steps.every((x) => U.anim.KINDS.includes(x.kind)), 'plan of a whole game');
      }
    }
    for (const t of ['start', 'roundStart', 'turnStart', 'play', 'attack', 'damage', 'down', 'awaken', 'draw', 'trash', 'roundEnd', 'matchEnd']) ok(seen.has(t), 'real games produced ' + t);
  });

  test('ui log: the lines never leak a hidden card: the other seat\'s draw, discard and pick carry no card name', () => {
    let s = XS.newGame({ decks: ['ST01', 'ST02'], seed: 4, mode: 'full' });
    const bots = [U.makeRandomBot(4, 0), U.makeRandomBot(4, 1)];
    for (let n = 0; n < 400 && !XS.isTerminal(s); n++) s = XS.apply(s, bots[XS.whoActs(s)].choose(s));
    const v = XS.view(s, 0);
    for (const e of v.log) {
      if (e.seat === 1 && (e.type === 'draw' || e.type === 'tacticsPick' || e.type === 'discard') && e.data.hidden) {
        const r = U.logText(e, v);
        ok(!r.segs.some((x) => typeof x === 'object'), `${e.type} by the opponent names a card: ${r.text}`);
      }
    }
  });

  test('ui anim: every log type plans to at least one step of a kind the director can play', () => {
    for (const type of LOG_TYPES) {
      const steps = U.anim.plan([entry(type, SAMPLE[type], 0)], stubView(0), 0);
      eq(steps.length, 1, type + ' plans exactly one step');
      ok(U.anim.KINDS.includes(steps[0].kind), `${type}: step kind ${steps[0].kind} has a player`);
      ok(U.anim.stepMs(steps[0]) >= 0, type + ': a duration');
    }
  });

  test('ui anim: plan keeps log order and the awaken stinger carries the leader and the engine numbers', () => {
    const es = [entry('attack', SAMPLE.attack, 0), entry('damage', Object.assign({}, SAMPLE.damage, { kind: 'attack' }), 1), entry('down', SAMPLE.down, 1), entry('awaken', SAMPLE.awaken, 0)];
    const steps = U.anim.plan(es, stubView(0), 0);
    eq(steps.map((s) => s.kind), ['attack', 'damage', 'down', 'awaken'], 'order preserved');
    eq([steps[3].leader, steps[3].atk, steps[3].hp, steps[3].cardId], ['L00', 40, 130, 'ST01-001'], 'awaken step');
  });

  test('ui anim: the opponent spotlight is travel 500 + hold 1200 + fade 250 ms', () => {
    const steps = U.anim.plan([entry('play', SAMPLE.play, 1)], stubView(0), 0);
    eq(U.anim.stepMs(steps[0]), 1950, 'spotlight total');
  });

  test('ui prompt: every pending kind and purpose in the contract has a renderer and a heading', () => {
    for (const k of PENDING_KINDS) {
      const h = U.PROMPT_KIND[k];
      ok(h !== undefined && typeof h.model === 'function' && typeof h.body === 'function', 'renderer for kind ' + k);
    }
    for (const p of PENDING_PURPOSES) {
      ok(typeof U.PURPOSE_LABEL[p] === 'string' && U.PURPOSE_LABEL[p].length > 3, 'heading for purpose ' + p);
      ok(U.PROMPT_KIND[U.PROMPT_PURPOSE[p]] !== undefined, 'purpose ' + p + ' maps to a kind with a renderer');
    }
  });

  // ---- models against the real engine ------------------------------------------------------
  function toMain(seed, mode) {
    let s = XS.newGame({ decks: ['ST01', 'ST02'], seed, mode: mode || 'full', first: 0 });
    const bots = [U.makeRandomBot(seed, 0), U.makeRandomBot(seed, 1)];
    for (let i = 0; i < 400; i++) {
      if (s.phase === 'main' && s.pending === null && XS.whoActs(s) === 0) return s;
      s = XS.apply(s, bots[XS.whoActs(s)].choose(s));
    }
    throw new Error('never reached the human main phase');
  }
  const snap = (s) => ({ raw: s, view: XS.view(s, 0), me: 0, live: true, spectate: false, legal: XS.legalActions(s) });

  test('ui targeting: actable cards are exactly the cards legalActions plays; the rest carry whyNot text', () => {
    const s = toMain(3);
    const S = snap(s);
    const M = U.targeting.model(S, U.targeting.fresh());
    const fromLegal = new Set(S.legal.filter((a) => a.type === 'play').map((a) => a.iid));
    eq(Array.from(M.actable).sort(), Array.from(fromLegal).sort(), 'actable set');
    const owned = S.view.players[0].hand.concat(S.view.players[0].tarea).filter((x) => typeof x === 'string');
    for (const iid of owned) if (!fromLegal.has(iid)) eq(M.why.get(iid), XS.whyNot(s, iid), 'why text for ' + iid);
    ok(S.legal.some((a) => a.type === 'endTurn') && M.endTurn !== null, 'end turn available');
    ok(M.endTurn.label.includes(`draw ${s.players[0].pp.untapped} for ${s.players[0].pp.untapped} unused PP`) || s.players[0].pp.untapped === 0, 'End turn names the unused-PP draw: ' + M.endTurn.label);
  });

  test('ui targeting: an attack card needs a clicked attacker and a clicked target (no auto-pick), then confirms with the engine preview', () => {
    let found = false;
    for (let seed = 1; seed < 40 && !found; seed++) {
      const s = toMain(seed);
      const S = snap(s);
      const atk = S.legal.find((a) => a.type === 'play' && a.attacker !== undefined);
      if (atk === undefined) continue;
      found = true;
      const st = U.targeting.fresh();
      let M = U.targeting.model(S, st);
      ok(U.targeting.click(S, st, M, 'card', atk.iid), 'selecting the card changes state');
      M = U.targeting.model(S, st);
      eq(M.stage, 'attacker', 'stage: attacker');
      const attackers = Array.from(new Set(S.legal.filter((a) => a.iid === atk.iid).map((a) => a.attacker)));
      eq(Array.from(M.leaderRole.keys()).sort(), attackers.sort(), 'highlighted attackers = legal attackers');
      ok(M.confirm === null, 'no confirm before choosing');
      U.targeting.click(S, st, M, 'leader', attackers[0]);
      M = U.targeting.model(S, st);
      eq(M.stage, 'target', 'stage: target');
      const targets = Array.from(new Set(S.legal.filter((a) => a.iid === atk.iid && a.attacker === attackers[0]).map((a) => a.target)));
      eq(Array.from(M.previews.keys()).sort(), targets.sort(), 'preview on every legal target');
      ok(M.confirm === null, 'no auto-pick of the target');
      U.targeting.click(S, st, M, 'leader', targets[0]);
      M = U.targeting.model(S, st);
      const want = { type: 'play', iid: atk.iid, attacker: attackers[0], target: targets[0] };
      eq(M.confirm.action, want, 'confirm applies the chosen legal action');
      ok(S.legal.some((a) => JSON.stringify(a) === JSON.stringify(want)), 'and it is in legalActions');
      const d = XS.previewAttackDetail(s, want);
      eq(M.previews.get(targets[0]).total, d.total, 'preview number is the engine number');
      ok(M.confirm.label.includes(d.goesDown ? 'DOWN' : d.total + ' damage'), 'confirm label names the number: ' + M.confirm.label);
    }
    ok(found, 'some seed offers an attack card in the first main phase');
  });

  function fakeS(pending, extra) {
    return Object.assign({ raw: null, view: Object.assign(stubView(0), { pending, phase: 'main' }), me: 0, live: true, spectate: false, legal: [] }, extra);
  }
  const pend = (o) => Object.assign({ seat: 0, source: null, prompt: 'Choose a leader to take 10 damage.', purpose: 'target', options: ['L10', 'L11'], min: 1, max: 1 }, o);

  test('ui prompt: choose never auto-picks one candidate, respects min/max, and declines only when min is 0', () => {
    const ps = U.prompt.fresh();
    let PM = U.prompt.model(fakeS(pend({ kind: 'choose', options: ['L10'] })), ps);
    eq(PM.confirm.enabled, false, 'a single candidate still needs a click');
    eq(PM.decline, null, 'no decline when min is 1');
    U.prompt.click(null, ps, PM, 'leader', 'L10');
    PM = U.prompt.model(fakeS(pend({ kind: 'choose', options: ['L10'] })), ps);
    eq(PM.confirm.enabled, true, 'enabled after the click');
    eq(PM.confirm.action, { type: 'choose', ids: ['L10'] }, 'answer');
    const ps2 = U.prompt.fresh();
    PM = U.prompt.model(fakeS(pend({ kind: 'choose', min: 0, max: 2, options: ['L10', 'L11', 'L12'] })), ps2);
    eq(PM.decline.action, { type: 'choose', ids: [] }, 'min 0 offers a decline');
    U.prompt.click(null, ps2, PM, 'leader', 'L10'); U.prompt.click(null, ps2, PM, 'leader', 'L11');
    eq(ps2.picked, ['L10', 'L11'], 'two picked');
    PM = U.prompt.model(fakeS(pend({ kind: 'choose', min: 0, max: 2, options: ['L10', 'L11', 'L12'] })), ps2);
    eq(PM.confirm.enabled, true, 'within range');
  });

  test('ui prompt: distribute is steppers in units; confirm only when the total is exact', () => {
    const ps = U.prompt.fresh();
    const p = pend({ kind: 'distribute', purpose: 'distribute', total: 80, unit: 10, options: ['L00', 'L01'], min: 0, max: 0 });
    let PM = U.prompt.model(fakeS(p), ps);
    eq(PM.confirm.enabled, false, 'nothing assigned yet');
    for (let i = 0; i < 5; i++) U.prompt.click(null, ps, PM, 'leader', 'L00');
    for (let i = 0; i < 3; i++) U.prompt.click(null, ps, PM, 'leader', 'L01');
    PM = U.prompt.model(fakeS(p), ps);
    eq(PM.sum, 80, 'sum');
    eq(PM.confirm.enabled, true, 'exact total confirms');
    eq(PM.confirm.action, { type: 'distribute', alloc: { L00: 50, L01: 30 } }, 'alloc in units');
    U.prompt.click(null, ps, PM, 'leader', 'L00');
    eq(ps.alloc.L00, 50, 'cannot exceed the total');
  });

  test('ui prompt: attackPair derives attackers and targets from legalActions and previews the engine number', () => {
    // A real attackPair needs a 【プレイ時】 attack card (none in ST01/ST02), so the model is checked on a stub.
    const ps = U.prompt.fresh();
    const legal = [{ type: 'attack', attacker: 'L00', target: 'L10' }, { type: 'attack', attacker: 'L00', target: 'L11' }, { type: 'attack', attacker: 'L01', target: 'L10' }];
    const p = pend({ kind: 'attackPair', purpose: 'attack', card: 'c1', attackers: ['L00', 'L01'], targets: ['L10', 'L11'], options: [] });
    const PM = U.prompt.model(fakeS(p, { legal }), ps);
    eq(Array.from(PM.leaderRole.keys()).sort(), ['L00', 'L01'], 'attackers from legal actions');
    eq(PM.confirm, null, 'no confirm before a pick');
  });

  test('ui prompt: while the opponent decides the prompt is a hint only, with no controls', () => {
    const ps = U.prompt.fresh();
    const PM = U.prompt.model(fakeS(pend({ kind: 'choose', seat: 1, options: [] })), ps);
    eq(PM.mine, false, 'not mine');
    eq(PM.confirm, null, 'no confirm');
    ok(PM.hint.startsWith('Opponent is deciding'), PM.hint);
  });

  test('ui bot: the random bot answers every decision from legalActions and a seed repeats', () => {
    const play = (seed) => {
      let s = XS.newGame({ decks: ['ST01', 'ST02'], seed, mode: 'quick' });
      const bots = [U.makeRandomBot(seed, 0), U.makeRandomBot(seed, 1)];
      let n = 0;
      while (!XS.isTerminal(s) && n < 3000) { const a = bots[XS.whoActs(s)].choose(s); ok(XS.legalActions(s).some((l) => JSON.stringify(l) === JSON.stringify(a)), 'bot action is legal'); s = XS.apply(s, a); n++; }
      ok(XS.isTerminal(s), 'game ended');
      return JSON.stringify(s.actions);
    };
    eq(play(5), play(5), 'same seed, same game');
  });
})();
