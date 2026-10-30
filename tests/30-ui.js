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
    'reshuffle', 'tacticsBurn', 'roundEnd', 'matchEnd', 'fizzle', 'overkill', 'echo', 'look', 'freePlay', 'revive'];
  const PENDING_KINDS = ['chooseFirst', 'pickTactics', 'choose', 'attackPair', 'distribute'];
  const PENDING_PURPOSES = ['first', 'tactics', 'target', 'heal', 'discard', 'handLimit', 'order', 'attack', 'distribute',
    'look', 'reveal', 'may', 'freePlay', 'revive', 'awaken'];

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
    overkill: { leader: 'L12', n: 30, excess: 40, card: 'c1' },
    echo: { iid: 'c2', cardId: 'ST01-013', phase: 'sideways' },
    look: { phase: 'see', from: 'deck', side: 0, n: 2, iids: ['c1', 'c2'], cardIds: ['ST01-005', 'ST01-013'], revealed: false },
    freePlay: { iid: 'c1', cardId: 'ST01-005', type: 'attack', from: 'hand' },
    revive: { leader: 'L01', seat: 0, slot: 1, equipment: ['c2'], cardIds: ['ST01-023'] },
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

  test('ui log: the booster log lines say what happened in plain words (Overkill, Echo, look, free play, revive, down by an attack)', () => {
    const v = stubView(0);
    const t = (type, data, seat) => U.logText(entry(type, data, seat === undefined ? 0 : seat), v).text;
    eq(t('overkill', SAMPLE.overkill), 'Overkill 30 met! Cpt took 40 more damage than it had HP left, so the Overkill effect of Crossfire happens.', 'overkill names the threshold, the excess and the card');
    ok(t('echo', SAMPLE.echo).includes('turned sideways') && t('echo', { iid: 'c2', cardId: 'ST01-013', phase: 'replay' }).includes('played again for free'), 'echo: both phases');
    ok(t('look', SAMPLE.look, 0).startsWith('You look at the top 2 cards of your deck: '), 'own look names the cards: ' + t('look', SAMPLE.look, 0));
    eq(t('look', { phase: 'see', from: 'deck', side: 1, n: 3, revealed: false, hidden: true }, 1), "Opponent looks at the top 3 cards of the opponent's deck.", 'the other seat sees a count only');
    ok(t('look', { phase: 'take', from: 'deck', side: 0, n: 1, iids: ['c1'], cardIds: ['ST01-005'], revealed: false }, 0).endsWith('to hand.'), 'take');
    ok(t('freePlay', SAMPLE.freePlay).includes('for free'), 'free play');
    ok(t('revive', SAMPLE.revive).includes('equipment goes to the trash'), 'revive says the equipment goes to the trash');
    ok(t('down', Object.assign({}, SAMPLE.down, { cause: 'attack' })).includes("the attack's own effect"), 'a down by the attack says so');
    ok(t('boost', { iid: 'c2', cardId: 'ST01-013', phase: 'armed', afterOnly: true }).includes('After Attack'), 'an After-Attack-only boost says what it arms');
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

  // ---- the booster purposes: models against real games of the ten competitive decks ----------------------
  const COMP = Object.keys(XS.DECKS).filter((d) => XS.DECKS[d].format === 'competitive');
  const sameAction = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const snapAs = (s, seat) => ({ raw: s, view: XS.view(s, seat), me: seat, live: true, spectate: false, legal: XS.legalActions(s) });
  // Plays the competitive decks against each other with the random bot; calls `visit(s)` at every pending decision. Games that hit an
  // ability the engine does not have yet are skipped (the abilities files are finished by other work); the count of finished games is asserted.
  function eachComp(visit, seeds) {
    let finished = 0;
    for (const a of COMP) for (const seed of seeds) {
      const b = COMP[(COMP.indexOf(a) + 3) % COMP.length];
      let s = XS.newGame({ decks: [a, b], seed, mode: 'full' });
      const bots = [U.makeRandomBot(seed, 0), U.makeRandomBot(seed, 1)];
      try {
        for (let n = 0; n < 6000 && !XS.isTerminal(s); n++) {
          if (s.pending !== null) visit(s);
          s = XS.apply(s, bots[XS.whoActs(s)].choose(s));
        }
        if (XS.isTerminal(s)) finished++;
      } catch (e) { if (!/unimplemented/.test(e.message)) throw e; }
    }
    return finished;
  }

  test('ui prompt: every pending a competitive-deck game produces has a model for the decider (answers are legal actions) and a one-line hint for the other seat', () => {
    const seen = {};
    const finished = eachComp((s) => {
      const p = s.pending;
      const me = p.seat;
      const ps = U.prompt.fresh();
      const PM = U.prompt.model(snapAs(s, me), ps);
      seen[p.purpose] = true;
      eq(PM.mine, true, p.purpose + ': the decider gets controls');
      if (p.kind === 'choose') {
        const legal = XS.legalActions(s);
        if (p.purpose === 'may') {
          eq(PM.confirm.label, 'Use it', 'may: explicit yes');
          eq(PM.decline.label, 'Decline', 'may: explicit no');
          ok(PM.confirm.enabled === true, 'may: both answers are open at once');
          ok(legal.some((a) => sameAction(a, PM.confirm.action)) && legal.some((a) => sameAction(a, PM.decline.action)), 'may: both answers are legal actions');
        } else {
          eq(PM.confirm.enabled, false, p.purpose + ': nothing is picked for the player (no auto-pick, ' + p.options.length + ' candidates)');
          eq(PM.decline === null, p.min > 0, p.purpose + ': a decline exists exactly when min is 0');
          if (PM.decline !== null) ok(legal.some((a) => sameAction(a, PM.decline.action)), p.purpose + ': the decline is a legal action');
          ok(PM.rule.length > 0 && PM.rule[0].startsWith('Pick '), p.purpose + ': says how many to pick: ' + PM.rule);
          // Pick the first legal answer's cards through the click path: the confirm action must be that legal action.
          const first = legal.find((a) => a.type === 'choose' && a.ids.length > 0);
          if (first !== undefined) {
            for (const id of first.ids) U.prompt.click(null, ps, PM, p.options.every((o) => U.isLeaderIid(o)) ? 'leader' : 'option', id);
            const PM2 = U.prompt.model(snapAs(s, me), ps);
            eq(PM2.confirm.enabled, true, p.purpose + ': a legal pick enables the confirm');
            ok(legal.some((a) => sameAction(a, PM2.confirm.action)), p.purpose + ': the confirm action is a legal action');
          }
        }
        const other = U.prompt.model(snapAs(s, 1 - me), U.prompt.fresh());
        eq(other.mine, false, p.purpose + ': the other seat has no controls');
        eq(other.confirm, null, p.purpose + ': and no confirm');
        ok(other.hint.startsWith('Opponent is '), p.purpose + ': one sentence for the other seat: ' + other.hint);
        ok(!/undefined|NaN|\[object/.test(other.hint + PM.hint), p.purpose + ': no placeholder text');
      }
    }, [1, 2]);
    ok(finished >= 10, 'at least ten competitive games ran to the end (' + finished + ')');
    for (const k of ['look', 'reveal', 'may', 'freePlay']) ok(seen[k], 'the games reached a "' + k + '" decision');
  });

  test('ui log: every entry of the competitive-deck games reads as a sentence for both seats and plans into steps (booster log types included)', () => {
    const seen = new Set();
    let games = 0;
    for (const a of COMP) {
      const b = COMP[(COMP.indexOf(a) + 4) % COMP.length], seed = 7;
      let s = XS.newGame({ decks: [a, b], seed, mode: 'full' });
      const bots = [U.makeRandomBot(seed, 0), U.makeRandomBot(seed, 1)];
      try { for (let n = 0; n < 6000 && !XS.isTerminal(s); n++) s = XS.apply(s, bots[XS.whoActs(s)].choose(s)); } catch (e) { if (!/unimplemented/.test(e.message)) throw e; continue; }
      games++;
      for (const viewer of [0, 1]) {
        const v = XS.view(s, viewer);
        for (const e of v.log) {
          seen.add(e.type);
          const r = U.logText(e, v);
          ok(r.text.length > 8 && !/undefined|\[object|NaN|null/.test(r.text), `${a} v ${b} viewer ${viewer} ${e.type}: "${r.text}"`);
        }
        const steps = U.anim.plan(v.log, v, viewer);
        ok(steps.every((x) => U.anim.KINDS.includes(x.kind)), 'plan of a competitive game');
      }
    }
    ok(games >= 8, 'competitive games finished: ' + games);
    for (const t of ['look', 'freePlay', 'overkill']) ok(seen.has(t), 'competitive games produced ' + t);
  });

  test('ui prompt look: the opponent is told only how many cards are looked at; the decider sees all of them, with the pickable ones marked', () => {
    let checked = 0;
    eachComp((s) => {
      const p = s.pending;
      if (p.purpose !== 'look') return;
      const mine = U.prompt.lookInfo(snapAs(s, p.seat), p);
      const theirs = U.prompt.lookInfo(snapAs(s, 1 - p.seat), p);
      ok(mine !== null && theirs !== null, 'a look entry exists for both seats');
      for (const o of p.options) ok(mine.shown.some((x) => x.iid === o), 'every candidate is among the looked-at cards');
      eq(mine.n, theirs.n, 'both seats know the count');
      if (!mine.revealed) { eq(theirs.hidden, true, 'not revealed: the other seat has a count only'); eq(theirs.shown.length, 0, 'and names no card'); }
      const PM = U.prompt.model(snapAs(s, p.seat), U.prompt.fresh());
      ok(PM.notes.some((n) => /hand|trash/.test(n)) && PM.notes.some((n) => /^The rest /.test(n)), 'says where the pick and the rest go: ' + PM.notes.join(' | '));
      eq(U.prompt.oppHint(snapAs(s, 1 - p.seat), p), mine.revealed ? U.prompt.oppHint(snapAs(s, 1 - p.seat), p) : 'Opponent is looking at ' + U.plural(mine.n, 'card') + '.', 'the other seat reads "Opponent is looking at N cards."');
      checked++;
    }, [1, 2, 3]);
    ok(checked > 0, 'some game reached a look decision (' + checked + ')');
  });

  test('ui prompt limit: a pick that breaks the pending limit never enables the confirm; the limit is named in words', () => {
    eq(U.prompt.limitText({ costSumAtMost: 2, perType: { memoria: 1 } }), ['total cost 2 or less', 'at most 1 memoria'], 'words');
    // c1 = Crossfire (attack, cost 3), c2 = Gambit Master (memoria, cost 1); the real games never ask a limited pick of a human, so a stub does.
    const p = pend({ kind: 'choose', purpose: 'reveal', options: ['c1', 'c2'], min: 0, max: 2, limit: { costSumAtMost: 3 }, prompt: 'You may reveal up to 2 cards from your hand.' });
    const ps = U.prompt.fresh();
    let PM = U.prompt.model(fakeS(p), ps);
    ok(PM.rule.includes('limit: total cost 3 or less'), 'the rule line names the limit: ' + PM.rule);
    U.prompt.click(null, ps, PM, 'option', 'c1');
    PM = U.prompt.model(fakeS(p), ps);
    eq(PM.confirm.enabled, true, 'cost 3 is within the limit');
    U.prompt.click(null, ps, PM, 'option', 'c2');
    PM = U.prompt.model(fakeS(p), ps);
    eq([ps.picked, PM.confirm.enabled], [['c1', 'c2'], false], 'cost 3 + 1 breaks it: the confirm stays off');
    ok(PM.hint.includes('over the limit'), 'and the hint says why: ' + PM.hint);
    U.prompt.click(null, ps, PM, 'option', 'c1');
    PM = U.prompt.model(fakeS(p), ps);
    eq(PM.confirm.enabled, true, 'dropping the big card is within the limit again');
    eq(PM.decline.label, 'Reveal none', 'a decline that says what it declines');
  });

  test('ui prompt: the may prompt names the card and shows its own sentence; freePlay shows cost 0; revive and awaken say what happens', () => {
    const want = { may: false, freePlay: false, revive: false };
    eachComp((s) => {
      const p = s.pending;
      if (!(p.purpose in want)) return;
      const S = snapAs(s, p.seat);
      const PM = U.prompt.model(S, U.prompt.fresh());
      if (p.purpose === 'may') ok(PM.hint.includes(p.prompt), 'the hint carries the engine sentence');
      if (p.purpose === 'freePlay') ok(PM.notes.some((n) => n.includes('costs 0 PP') || n.includes('Each costs 0 PP')) && PM.notes.some((n) => n.includes('far right')), 'free play: cost 0 and where it lands: ' + PM.notes);
      if (p.purpose === 'revive') ok(PM.notes.some((n) => n.includes('trash')), 'revive: equipment goes to the trash');
      want[p.purpose] = true;
    }, [1, 2, 3]);
    for (const k of Object.keys(want)) ok(want[k], 'reached ' + k);
    // awaken: not reached by the random games; checked on a stub.
    const aw = pend({ kind: 'choose', purpose: 'awaken', options: ['L00', 'L01'], source: null, prompt: 'Choose one of your leaders to awaken.' });
    const PM = U.prompt.model(fakeS(aw), U.prompt.fresh());
    ok(PM.notes[0].includes('not an attack') && PM.confirm.enabled === false && PM.decline === null, 'awaken: a required pick that explains itself');
  });

  test('ui prompt purposes: PENDING_PURPOSES covers every purpose the engine can produce in the competitive games', () => {
    const seen = new Set();
    eachComp((s) => seen.add(s.pending.purpose), [1]);
    for (const k of seen) ok(PENDING_PURPOSES.includes(k), 'purpose ' + k + ' is listed (and so has a renderer)');
  });

  test('ui core: every card of every registered deck has initials for its placeholder face (a Japanese-only English name included)', () => {
    for (const d of Object.values(XS.DECKS)) for (const c of d.leaders.concat(d.tactics, d.main.map((m) => m[0]))) ok(U.initials(c).length >= 1, 'initials for ' + c + ' ' + U.card(c).nameEn);
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

  // ---- M7: settings, save, stats, art, audio scenes, auto-pass inputs ------------------------------------
  const playOut = (seed, mode) => {
    let s = XS.newGame({ decks: ['ST01', 'ST02'], seed, mode: mode || 'full', first: 0 });
    const bots = [U.makeRandomBot(seed, 0), U.makeRandomBot(seed, 1)];
    for (let n = 0; n < 4000 && !XS.isTerminal(s); n++) s = XS.apply(s, bots[XS.whoActs(s)].choose(s));
    return s;
  };

  test('ui settings: defaults, validation, and every setter rejects a value outside its set', () => {
    U.settings.reload();
    eq([U.settings.get('speed'), U.settings.get('autoPass'), U.settings.get('names')], ['full', false, 'en'], 'defaults: auto-pass is off');
    throws(() => U.settings.set('speed', 'warp'), 'bad speed');
    throws(() => U.settings.set('names', 'fr'), 'bad names');
    throws(() => U.settings.set('autoPass', 'yes'), 'a boolean');
    throws(() => U.settings.set('audio', {}), 'audio goes through setAudio');
    throws(() => U.settings.get('volume'), 'unknown key');
    U.settings.set('names', 'jp');
    eq(U.cardTitle('ST01-001'), '一ノ瀬うるは', 'the Japanese name leads');
    eq(U.cardTitleAlt('ST01-001'), 'Uruha Ichinose', 'the English name sits beneath');
    U.settings.set('names', 'en');
    eq(U.cardTitle('ST01-001'), 'Uruha Ichinose', 'English leads again');
    U.settings.reload();
  });

  test('ui settings: reduce motion shortens the awaken stinger and every overlay', () => {
    U.settings.reload();
    const step = { kind: 'awaken' }, base = U.anim.stepMs(step);
    eq(base, 2000, 'the stinger is 2000 ms at full motion');
    U.settings.set('reduceMotion', true);
    ok(U.anim.stepMs(step) < base / 2, 'the stinger is much shorter under reduce motion: ' + U.anim.stepMs(step));
    for (const k of Object.keys(U.anim.D)) ok(U.anim.DR[k] !== undefined && U.anim.DR[k] <= U.anim.D[k], 'reduced duration for ' + k);
    U.settings.reload();
  });

  test('ui save: the record carries init, actions, version, date; Continue says the round and turn; a foreign value is cleared', () => {
    const s = playOut(3, 'quick');
    const mid = XS.replay(s.init, s.actions.slice(0, 40));
    const rec = U.save.record(mid, { tier: 'easy' });
    eq(Object.keys(rec).sort(), ['actions', 'date', 'init', 'round', 'tier', 'turn', 'version'], 'record shape');
    eq(U.save.label(rec), 'Continue (round ' + mid.round + ', ' + (mid.roundTurn > 0 ? 'turn ' + mid.roundTurn : 'setup') + ')', 'label');
    const again = XS.replay(rec.init, rec.actions);
    eq(JSON.stringify(XS.view(again, 0)), JSON.stringify(XS.view(mid, 0)), 'replaying the record gives the same board');
    eq(U.save.stale(rec), false, 'made with the current data');
    eq(U.save.stale(Object.assign({}, rec, { version: 'old' })), true, 'an older data version is flagged');
    ok(/^[0-9a-z]+$/.test(U.save.version()), 'version is a short hash');
  });

  test('ui save: a save whose actions no longer replay throws in XS.replay (title.js turns that into "can\'t be resumed")', () => {
    const s = playOut(3, 'quick');
    const rec = U.save.record(XS.replay(s.init, s.actions.slice(0, 20)), {});
    rec.actions = rec.actions.concat([{ type: 'play', iid: 'c9999' }]);
    throws(() => XS.replay(rec.init, rec.actions), 'a stale action must throw, never half-load');
  });

  test('ui stats: damage, downs, awakenings, cards played and turns are counted from the log and agree with a recount (6 games)', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const s = playOut(seed, seed % 2 ? 'full' : 'quick');
      const v = XS.view(s, 0);
      const st = U.stats.compute(v.log);
      for (const side of [0, 1]) {
        const other = 1 - side;
        const dmg = v.log.filter((e) => e.type === 'damage' && U.leaderSeat(e.data.leader) === other).reduce((a, e) => a + e.data.amount, 0);
        eq(st.sides[side].damage, dmg, `seed ${seed} side ${side}: damage dealt`);
        eq(st.sides[side].downs, v.log.filter((e) => e.type === 'down' && e.data.seat === other).length, 'downs inflicted');
        eq(st.sides[side].awakenings, v.log.filter((e) => e.type === 'awaken' && e.data.seat === side).length, 'awakenings');
        eq(st.sides[side].played, v.log.filter((e) => (e.type === 'play' || e.type === 'tacticsPlay') && e.seat === side).length, 'cards played');
        eq(st.sides[side].played, st.sides[side].attacks + st.sides[side].memoria + st.sides[side].tactics, 'the card types add up');
      }
      eq(st.turns, v.log.filter((e) => e.type === 'turnStart').length, 'turns');
      ok(st.rounds >= 1 && st.rounds <= 3, 'rounds ' + st.rounds);
      ok(st.sides[0].downs + st.sides[1].downs >= 4, 'a finished game downs at least four leaders');
    }
  });

  test('ui stats: nothing hidden is read: the opponent\'s view of the same game gives the same numbers', () => {
    const s = playOut(5, 'full');
    eq(JSON.stringify(U.stats.compute(XS.view(s, 0).log)), JSON.stringify(U.stats.compute(XS.view(s, 1).log)), 'both seats count the same public events');
  });

  test('ui art: a manifest entry is found by card number and by "/awakened"; UI plates read the pipeline and brief spellings; no entry is null', () => {
    const saved = XS.ART;
    try {
      XS.ART = {};
      eq(U.art.faceEntry('ST01-001', false), null, 'empty manifest: placeholder');
      XS.ART = { 'ST01-001': { file: 'a.webp' }, 'ST01-001/awakened': { file: 'b.webp' }, 'ST01-005': { file: 'c.webp' }, 'ui/card-back': { file: 'd.webp' }, 'ui:title': { file: 'e.webp' } };
      eq(U.art.faceEntry('ST01-001', false).file, 'a.webp', 'front');
      eq(U.art.faceEntry('ST01-001', true).file, 'b.webp', 'awakened');
      eq(U.art.faceEntry('ST01-005', true).file, 'c.webp', 'a non-leader never uses the awakened key');
      eq(U.art.faceEntry('ST01-002', false), null, 'no entry for a card the manifest lacks');
      eq(U.art.uiEntry('cardback').file, 'd.webp', 'ui/card-back is the card-back plate');
      eq(U.art.uiEntry('title').file, 'e.webp', 'ui:title is the title plate');
      eq(U.art.uiEntry('arena'), null, 'absent plate');
      XS.ART['ui/title'] = { file: 'other.webp' };
      throws(() => U.art.uiEntry('title'), 'two spellings, two files: a manifest bug');
    } finally { XS.ART = saved; }
  });

  test('ui audio scene: calm, tense at two leaders or match point, victory/defeat/silent when over', () => {
    const v = (o) => Object.assign({ viewer: 0, phase: 'main', mode: 'full', needWins: 2, wins: [0, 0], winner: null,
      players: [0, 1].map(() => ({ leaders: [{ down: false }, { down: false }, { down: false }, { down: false }] })) }, o);
    eq(U.sfx.sceneFor(v()), 'calm', 'start of a match');
    const down = (n) => ({ leaders: [0, 1, 2, 3].map((i) => ({ down: i < n })) });
    eq(U.sfx.sceneFor(v({ players: [down(1), down(0)] })), 'calm', 'three standing is still calm');
    eq(U.sfx.sceneFor(v({ players: [down(2), down(0)] })), 'tense', 'two standing on my side');
    eq(U.sfx.sceneFor(v({ players: [down(0), down(3)] })), 'tense', 'one standing on theirs');
    eq(U.sfx.sceneFor(v({ wins: [0, 1] })), 'tense', 'match point (best of 3)');
    eq(U.sfx.sceneFor(v({ mode: 'quick', needWins: 1 })), 'calm', 'a quick match has no match point');
    eq(U.sfx.sceneFor(v({ phase: 'over', winner: 0 })), 'victory', 'won');
    eq(U.sfx.sceneFor(v({ phase: 'over', winner: 1 })), 'defeat', 'lost');
    eq(U.sfx.sceneFor(v({ phase: 'over', winner: null })), 'silent', 'nobody won');
    for (const sc of ['calm', 'tense', 'victory', 'defeat', 'silent']) ok(U.sfx.SCENES.includes(sc), sc + ' is a scene XS.Audio knows');
  });

  test('ui audio hooks: every presented log entry belongs to exactly one director step, in log order (the onLog contract)', () => {
    for (const seed of [2, 7]) {
      const s = playOut(seed, 'quick');
      const v = XS.view(s, 0);
      const steps = U.anim.plan(v.log, v, 0);
      const seen = [].concat(...steps.map((x) => x.entries.map((e) => e.seq)));
      eq(seen, v.log.map((e) => e.seq), 'seed ' + seed + ': each entry once, in order (merged draws and quiet steps included)');
    }
  });

  test('ui audio cues: only the five UI cues M6 knows are accepted', () => {
    eq(U.sfx.CUES, ['ui-hover', 'ui-click', 'ui-confirm', 'ui-cancel', 'ui-drawer'], 'cue names');
    throws(() => U.sfx.cue('ui-boom'), 'unknown cue');
    if (XS.AUDIO !== undefined) for (const c of U.sfx.CUES) ok(XS.AUDIO.byTag[c] !== undefined, c + ' is in the cue sheet');
  });

  test('ui auto-pass input: a fresh main phase with no PP and no playable card offers only endTurn; the default setting is off', () => {
    U.settings.reload();
    eq(U.settings.get('autoPass'), false, 'off by default');
    let found = false;
    for (let seed = 1; seed < 60 && !found; seed++) {
      let s = XS.newGame({ decks: ['ST01', 'ST02'], seed, mode: 'quick', first: 0 });
      const bots = [U.makeRandomBot(seed, 0), U.makeRandomBot(seed, 1)];
      for (let n = 0; n < 600 && !XS.isTerminal(s); n++) {
        if (s.phase === 'main' && s.pending === null && XS.whoActs(s) === 0) {
          const legal = XS.legalActions(s);
          if (legal.length === 1) { eq(legal[0].type, 'endTurn', 'the only action is endTurn'); found = true; break; }
        }
        s = XS.apply(s, bots[XS.whoActs(s)].choose(s));
      }
    }
    ok(found, 'some real game reaches a turn with nothing to play');
  });
})();
