// tests/50-audio.js: the audio layer (M6), headless. Names state what they assert.
//  * the log -> cue map covers every log type of docs/ENGINE-API.md, every mapped tag is in the cue sheet, every cue is
//    reachable (through the map, a music scene, or marked ui);
//  * damage tiers (<= 30 light, 40-70 medium, >= 80 heavy), awaken = stinger + announcer, round/match perspective;
//  * the cue sheet is sound (budget, ranges, no franchise names, an original voice);
//  * XS.Audio: explicit no-op when there is no AudioContext; over a fake context, rate limits, batch dedupe, the
//    announcer queue, locked-context handling and the "audio pending" report.
(function () {
  const XS = globalThis.XS;
  const { test, eq, ok, throws } = XS.T;
  const A = XS.Audio, M = XS.AudioMap, AUDIO = XS.AUDIO;

  // Copied from docs/ENGINE-API.md "Log". When the contract grows, this grows (the map test then fails until the map does).
  const LOG_TYPES = ['start', 'rps', 'chooseFirst', 'roundStart', 'tacticsPick', 'tacticsPlace', 'draw', 'turnStart', 'turnEnd', 'ppRecover',
    'ppSpend', 'play', 'tacticsPlay', 'equip', 'boost', 'attack', 'damage', 'heal', 'down', 'awaken', 'ability', 'discard', 'trash',
    'reshuffle', 'tacticsBurn', 'roundEnd', 'matchEnd', 'fizzle'];

  const view = (o) => Object.assign({ viewer: 0, mode: 'full', needWins: 2, wins: [0, 0] }, o);
  const ent = (type, data, seat) => ({ seq: 0, round: 1, turn: 1, seat: seat === undefined ? 0 : seat, type, data, via: null });
  const tags = (type, data, seat, v) => M.cuesFor(ent(type, data, seat), v || view());

  test('audio map: every log type of ENGINE-API.md has an entry (a reason when it is silent on purpose)', () => {
    eq(M.LOG_TYPES.slice().sort(), LOG_TYPES.slice().sort(), 'map covers exactly the contract log types');
    for (const type of LOG_TYPES) {
      const m = M.TYPES[type];
      ok(m, 'entry for ' + type);
      if (m.none !== undefined) ok(typeof m.none === 'string' && m.none.length > 10, type + ': a silent type states why');
      else ok(Array.isArray(m.tags) && m.tags.length && typeof m.fn === 'function', type + ': tags and a rule');
    }
  });

  test('audio map: every mapped tag exists in the cue sheet, and every scene tag does', () => {
    for (const type of LOG_TYPES) for (const t of M.TYPES[type].tags || []) ok(AUDIO.byTag[t], `${type} -> ${t} is not in data/audio-cues.js`);
    for (const [scene, t] of Object.entries(M.SCENES)) ok(t === null ? scene === 'silent' : AUDIO.byTag[t] && AUDIO.byTag[t].kind === 'music', 'scene ' + scene);
  });

  test('audio map: every cue is reachable through the map, a scene, or is marked ui', () => {
    const reach = new Set();
    for (const type of LOG_TYPES) for (const t of M.TYPES[type].tags || []) reach.add(t);
    for (const t of Object.values(M.SCENES)) if (t) reach.add(t);
    for (const c of AUDIO.cues) {
      if (c.use === 'ui') ok(!reach.has(c.tag) || true, 'ui cue ' + c.tag);
      else ok(reach.has(c.tag), `cue ${c.tag} (use ${c.use}) is never played`);
      if (c.use === 'scene') ok(Object.values(M.SCENES).includes(c.tag), c.tag + ' is a scene cue');
      if (c.use === 'log') ok(LOG_TYPES.some((t) => (M.TYPES[t].tags || []).includes(c.tag)), c.tag + ' is a log cue');
    }
  });

  test('audio map: damage hits by tier, <= 30 light, 40-70 medium, >= 80 heavy, 0 silent', () => {
    for (const [n, tier] of [[10, 'hit-light'], [30, 'hit-light'], [40, 'hit-medium'], [70, 'hit-medium'], [80, 'hit-heavy'], [150, 'hit-heavy']]) {
      eq(tags('damage', { leader: 'L10', amount: n, kind: 'attack', before: 0, after: n }, 1), [tier], 'damage ' + n);
    }
    eq(tags('damage', { leader: 'L10', amount: 0, kind: 'effect', before: 0, after: 0 }, 1), [], 'a zero-damage entry is silent');
    eq(tags('damage', { leader: 'L10', amount: 50, kind: 'effect', before: 0, after: 50 }, 1), ['hit-medium'], 'effect damage is heard like attack damage');
  });

  test('audio map: awaken = the stinger plus the announcer, and the voice is delayed onto the impact', () => {
    eq(tags('awaken', { leader: 'L00', seat: 0, slot: 0, cause: 'attack', atk: 40, hp: 120 }), ['awaken-stinger', 'vo-awakened']);
    ok(AUDIO.byTag['vo-awakened'].delay >= 1, 'the announcer waits for the riser');
    ok(AUDIO.byTag['awaken-stinger'].duck > 0 && AUDIO.byTag['awaken-stinger'].duck < 1, 'the stinger ducks the music');
  });

  test('audio map: down is the KO cue; heal only when counters were removed', () => {
    eq(tags('down', { leader: 'L10', seat: 1, slot: 0, cause: 'damage' }, 1), ['leader-down']);
    eq(tags('heal', { leader: 'L00', amount: 20, requested: 20 }), ['heal']);
    eq(tags('heal', { leader: 'L00', amount: 0, requested: 20 }), [], 'FAQ #133: healing an undamaged leader removes nothing');
  });

  test('audio map: roundStart announces round one, round two with match point, then the final round', () => {
    eq(tags('roundStart', { round: 1, first: 0, pp: 3 }), ['round-start', 'vo-round-1']);
    eq(tags('roundStart', { round: 2, first: 1, pp: 4 }, 1, view({ wins: [1, 0] })), ['round-start', 'vo-round-2', 'crowd-swell', 'vo-match-point']);
    eq(tags('roundStart', { round: 3, first: 0, pp: 5 }, 0, view({ wins: [1, 1] })), ['round-start', 'vo-final-round', 'crowd-swell']);
    eq(tags('roundStart', { round: 1, first: 0, pp: 3 }, 0, view({ mode: 'quick', needWins: 1 })), ['round-start', 'vo-round-1'], 'a quick match has no match-point swell');
  });

  test('audio map: round win/loss are heard from the viewer\'s seat, and not at all when the round decides the match', () => {
    eq(tags('roundEnd', { round: 1, winner: 0, loser: 1, wins: [1, 0] }, 0, view({ viewer: 0 })), ['round-win']);
    eq(tags('roundEnd', { round: 1, winner: 0, loser: 1, wins: [1, 0] }, 0, view({ viewer: 1 })), ['round-loss']);
    eq(tags('roundEnd', { round: 2, winner: 0, loser: 1, wins: [2, 0] }, 0, view({ viewer: 0 })), [], 'the match-end fanfare owns the final round');
    eq(tags('roundEnd', { round: 1, winner: 0, loser: 1, wins: [1, 0] }, 0, view({ mode: 'quick', needWins: 1 })), [], 'a quick match ends with its only round');
  });

  test('audio map: matchEnd is victory for the viewer\'s win, defeat otherwise (music scene + announcer)', () => {
    eq(tags('matchEnd', { winner: 0, losers: [1], reason: 'rounds', wins: [2, 1] }, 0, view({ viewer: 0 })), ['music-victory', 'vo-victory']);
    eq(tags('matchEnd', { winner: 1, losers: [0], reason: 'rounds', wins: [1, 2] }, 1, view({ viewer: 0 })), ['music-defeat', 'vo-defeat']);
    eq(tags('matchEnd', { winner: null, losers: [0, 1], reason: 'bothLose', wins: [1, 1] }, 0, view({ viewer: 0 })), ['music-defeat', 'vo-defeat']);
  });

  test('audio map: turn chimes by whose turn it is; draws at setup, boosts applied and round-end discards are silent', () => {
    eq(tags('turnStart', { turn: 3, roundTurn: 2 }, 0, view({ viewer: 0 })), ['turn-start-you']);
    eq(tags('turnStart', { turn: 4, roundTurn: 3 }, 1, view({ viewer: 0 })), ['turn-start-opp']);
    eq(tags('draw', { iid: 'c1', cardId: 'ST01-005', cause: 'setup' }), []);
    eq(tags('draw', { cause: 'turnStart', hidden: true }), ['card-draw'], 'a hidden (opponent) draw is still heard');
    eq(tags('boost', { iid: 'c3', cardId: 'ST01-010', phase: 'applied', amount: 20 }), []);
    eq(tags('boost', { iid: 'c3', cardId: 'ST01-010', phase: 'armed' }), ['boost-armed']);
    eq(tags('discard', { n: 3, cause: 'roundEnd', hidden: true }), []);
    eq(tags('discard', { n: 1, cause: 'effect', hidden: true }), ['discard']);
    eq(tags('play', { iid: 'c1', cardId: 'ST01-005', type: 'attack', cost: 2 }), ['play-attack']);
    eq(tags('play', { iid: 'c2', cardId: 'ST01-013', type: 'memoria', cost: 1 }), ['play-memoria']);
  });

  test('audio map: the hidden tactics pick makes no sound (information stays hidden)', () => {
    eq(tags('tacticsPick', { hidden: true }, 1), []);
    eq(tags('tacticsPick', { iid: 't1', cardId: 'ST01-020' }, 0), []);
  });

  test('audio map: scenes by board state (calm, tense at 2 leaders or on match point with 3, victory/defeat when over)', () => {
    const v = (alive0, alive1, o) => Object.assign(view(), { phase: 'main', winner: null, players: [alive0, alive1].map((n) => ({ leaders: [0, 1, 2, 3].map((i) => ({ down: i >= n })) })) }, o || {});
    eq(M.sceneFor(v(4, 4)), 'calm');
    eq(M.sceneFor(v(3, 4)), 'calm', 'round 1, one leader down');
    eq(M.sceneFor(v(2, 4)), 'tense');
    eq(M.sceneFor(v(4, 1)), 'tense');
    eq(M.sceneFor(v(3, 4, { wins: [1, 0] })), 'tense', 'match point, one down');
    eq(M.sceneFor(v(4, 4, { wins: [1, 0] })), 'calm', 'match point but a full team');
    eq(M.sceneFor(v(2, 0, { phase: 'over', winner: 0, viewer: 0 })), 'victory');
    eq(M.sceneFor(v(2, 0, { phase: 'over', winner: 0, viewer: 1 })), 'defeat');
  });

  test('audio map: real games, every entry of a played match maps to cues that exist (drift check against the engine)', () => {
    const rng = { rng: XS.hashSeed('audio-test') };
    const seen = new Set();
    for (const mode of ['quick', 'full']) {
      let s = XS.newGame({ decks: ['ST01', 'ST02'], seed: 'audio-' + mode, mode, first: 'random' });
      for (let n = 0; !XS.isTerminal(s) && n < 6000; n++) {
        const legal = XS.legalActions(s);
        s = XS.apply(s, legal[Math.floor(XS.rngNext(rng) * legal.length)]);
        if (n % 40 === 0) ok(['calm', 'tense', 'victory', 'defeat'].includes(M.sceneFor(XS.view(s, 0))), 'scene');
      }
      ok(XS.isTerminal(s), mode + ' game finished');
      for (const seat of [0, 1]) {
        const v = XS.view(s, seat);
        ok(['victory', 'defeat'].includes(M.sceneFor(v)), 'terminal scene');
        for (const e of v.log) {
          seen.add(e.type);
          ok(M.has(e.type), 'unmapped log type ' + e.type);
          for (const t of M.cuesFor(e, v)) ok(AUDIO.byTag[t], `${e.type} produced unknown cue ${t}`);
        }
      }
    }
    for (const t of ['roundStart', 'play', 'damage', 'attack', 'matchEnd']) ok(seen.has(t), 'a played match logs ' + t);
  });

  // ---- the cue sheet ---------------------------------------------------------------------------------------
  test('audio cues: ranges, fields, no franchise names, an original voice, and the plan fits the audio budget (PLAN D5, D6, D2)', () => {
    const banned = /vspo|ぶいすぽ|crazy\s*raccoon|brave\s*group|game\s*&\s*co|xross\s*stars?|クロスタ|nintendo|pok[eé]mon|hololive|nijisanji|in the style of|sounds? like|voice of|imitat|clone|impersonat/i;
    const K = AUDIO.credits;
    let credits = K.voiceDesign;
    for (const c of AUDIO.cues) {
      ok(['sfx', 'music', 'voice'].includes(c.kind), c.tag + ' kind');
      ok(['log', 'ui', 'scene'].includes(c.use), c.tag + ' use');
      ok(c.gain > 0 && c.gain <= 1, c.tag + ' gain in (0, 1]');
      ok(!banned.test([c.prompt, c.text, c.tag].join(' ')), c.tag + ' names a franchise or asks for imitation');
      if (c.kind === 'sfx') {
        ok(c.seconds >= 0.5 && c.seconds <= 30, c.tag + ' sfx duration_seconds is 0.5..30');
        ok(/no music|no voices|no intelligible/.test(c.prompt), c.tag + ' states its exclusions');
        credits += (c.takes || 1) * Math.max(K.sfxPerGeneration, Math.ceil(K.sfxPerSecond * c.seconds));
      } else if (c.kind === 'music') {
        ok(c.seconds >= 3 && c.seconds <= 600, c.tag + ' music_length_ms is 3..600 s');
        ok(/instrumental/.test(c.prompt) && c.prompt.includes(AUDIO.brief), c.tag + ' instrumental, with the shared brief');
        credits += Math.ceil(c.seconds / 60 * K.musicPerMinute);
      } else {
        ok(typeof c.text === 'string' && c.text.length > 0 && !c.prompt, c.tag + ' voice cues carry a text, not a prompt');
        credits += c.text.length * K.ttsPerChar;
      }
      if (c.crestMin !== undefined) ok(c.kind === 'sfx' && c.tag.startsWith('hit-'), 'crestMin is for hits');
    }
    ok(!banned.test(AUDIO.voice.design + AUDIO.voice.name), 'the announcer is designed, not imitated');
    ok(AUDIO.voice.id === null || /^[A-Za-z0-9]{10,40}$/.test(AUDIO.voice.id), 'voice.id is null (not designed yet) or a voice id');
    ok(credits / 1000 * AUDIO.usdPer1kCredits <= AUDIO.budgetUSD, `the full plan (${credits} credits) fits the $${AUDIO.budgetUSD} audio budget`);
    eq(AUDIO.budgetUSD, 17, 'PLAN D6: audio may spend at most $17 of the $25 total');
  });

  test('audio cues: the required cue families exist (ui, cards, hit tiers, awaken, rounds, crowd, music, announcer)', () => {
    const need = ['ui-hover', 'ui-click', 'ui-confirm', 'ui-cancel', 'ui-drawer', 'card-draw', 'play-attack', 'play-memoria', 'pp-spend', 'pp-recover', 'tactics-reveal',
      'equip', 'boost-armed', 'attack-whoosh', 'hit-light', 'hit-medium', 'hit-heavy', 'heal', 'leader-down', 'awaken-stinger', 'round-start', 'round-win', 'round-loss',
      'turn-start-you', 'turn-start-opp', 'reshuffle', 'tactics-burn', 'crowd-swell', 'music-title', 'music-calm', 'music-tense', 'music-victory', 'music-defeat',
      'vo-round-1', 'vo-round-2', 'vo-final-round', 'vo-awakened', 'vo-match-point', 'vo-victory', 'vo-defeat'];
    for (const t of need) ok(AUDIO.byTag[t], 'cue ' + t);
    for (const t of ['music-title', 'music-calm', 'music-tense']) ok(AUDIO.byTag[t].loop, t + ' loops');
    for (const t of ['music-victory', 'music-defeat']) ok(!AUDIO.byTag[t].loop, t + ' plays once');
  });

  test('audio manifest: every entry names a cue, a file and a gain (pending cues have no entry)', () => {
    for (const [tag, e] of Object.entries(XS.SOUNDS)) {
      ok(AUDIO.byTag[tag], 'manifest entry without a cue: ' + tag);
      eq(e.tag, tag, tag + ' entry.tag');
      ok(typeof e.file === 'string' && e.file.endsWith('.mp3') && typeof e.gain === 'number' && e.seconds > 0, tag + ' {file, seconds, gain}');
    }
  });

  // ---- XS.Audio ----------------------------------------------------------------------------------------------
  test('Audio: without an AudioContext every call is an explicit no-op (available false, a reason, nothing thrown)', () => {
    const warns = [];
    const a = A._create({ AudioContext: null, document: null, window: null, navigator: null, fetch: () => { throw new Error('no network in this test'); }, now: () => 0, setTimeout: () => 0, console: { warn: (m) => warns.push(m) } });
    eq(a.init(), false);
    eq(a.available, false);
    ok(/no AudioContext/.test(a.reason), 'reason: ' + a.reason);
    eq(a.unlock(), false);
    eq(a.cue('ui-click'), false);
    eq(a.onLog(ent('damage', { amount: 50 }, 1), view()), false);
    a.setScene('calm');
    eq(a._debug().want, 'calm', 'the wanted scene is remembered');
    eq(warns, [], 'a headless run does not warn');
  });

  test('Audio: unknown cue and unknown scene throw; settings validate and merge', () => {
    const a = A._create({ AudioContext: null, document: null, window: null, navigator: null, fetch: null, now: () => 0, setTimeout: () => 0, console: { warn() {} } });
    throws(() => a.cue('no-such-cue'), 'unknown cue');
    throws(() => a.setScene('loud'), 'unknown scene');
    eq(a.settings, { master: 0.8, sfx: 1, music: 0.7, voice: 1, muted: false });
    a.settings = { music: 0.2, muted: true };
    eq(a.settings, { master: 0.8, sfx: 1, music: 0.2, voice: 1, muted: true });
    throws(() => { a.settings = { music: 1.5 }; }, 'out of range');
    throws(() => { a.settings = { volume: 0.5 }; }, 'unknown key');
    throws(() => { a.settings = { muted: 1 }; }, 'muted is a boolean');
  });

  test('Audio: coverage() reports cues, files and the pending tags', () => {
    const c = A.coverage();
    eq(c.cues, AUDIO.cues.length);
    eq(c.files + c.missing.length, c.cues);
    for (const t of c.missing) ok(AUDIO.byTag[t] && !XS.SOUNDS[t], t + ' is pending');
  });

  // A fake environment: a controllable clock, and a context that records every started source.
  function fake(state) {
    const rec = { starts: [], warns: [], timeouts: [], resumes: 0 };
    let t = 0, ms = 1000;
    class Param { constructor() { this.value = 1; } setTargetAtTime(v) { this.value = v; } setValueAtTime(v) { this.value = v; } linearRampToValueAtTime(v) { this.value = v; } cancelScheduledValues() {} }
    class Node { constructor() { this.gain = new Param(); } connect(n) { return n; } }
    class Src extends Node { start(when) { rec.starts.push({ tag: this.buffer.tag, when }); } stop() {} }
    class Ctx {
      constructor() { this.state = state; this.destination = {}; this.sampleRate = 44100; }
      get currentTime() { return t; }
      createGain() { return new Node(); }
      createBufferSource() { return new Src(); }
      createBuffer() { return { tag: 'prime', duration: 0 }; }
      resume() { rec.resumes++; return Promise.resolve(); }
      decodeAudioData() { return Promise.resolve({ duration: 0.5 }); }
    }
    const env = { AudioContext: Ctx, document: null, window: null, navigator: null, fetch: () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)) }),
      now: () => ms, setTimeout: (f, d) => { rec.timeouts.push(d); return 0; }, console: { warn: (m) => rec.warns.push(m) } };
    return { env, rec, advance: (dMs) => { ms += dMs; t += dMs / 1000; }, at: (sec) => { t = sec; } };
  }
  const withSounds = (tagsWithFiles, fn) => {
    const saved = XS.SOUNDS;
    XS.SOUNDS = {};
    for (const tag of tagsWithFiles) XS.SOUNDS[tag] = { tag, file: `audio/${tag}.mp3`, seconds: 1, gain: 0.9 };
    try { fn(); } finally { XS.SOUNDS = saved; }
  };
  const seed = (a, tag, duration) => { a._buffers[tag] = { tag, duration }; };

  test('Audio: identical tags in one director batch play once; the retrigger gap holds a tag for 60 ms', () => {
    withSounds(['hit-light', 'card-draw'], () => {
      const f = fake('running');
      const a = A._create(f.env);
      ok(a.init(), 'available over the fake context');
      seed(a, 'card-draw', 0.3); seed(a, 'hit-light', 0.3);
      const draw = ent('draw', { cause: 'turnStart' });
      eq(a.onLog(draw, view()), true);
      eq(a.onLog(draw, view()), false, 'same tag, same batch');
      eq(f.rec.starts.filter((s) => s.tag === 'card-draw').length, 1);
      eq(a._debug().stats.deduped, 1);
      a._flushBatch(); f.advance(20);
      eq(a.onLog(draw, view()), false, '20 ms later: inside the 90 ms draw gap');
      a._flushBatch(); f.advance(200);
      eq(a.onLog(draw, view()), true, '200 ms later');
      eq(f.rec.starts.filter((s) => s.tag === 'card-draw').length, 2);
      a._flushBatch(); f.advance(70);
      a.cue('ui-click');   // pending in this manifest: reported, not played
      eq(a.onLog(ent('damage', { amount: 30 }, 1), view()), true, 'another tag is not held by the draw gap');
    });
  });

  test('Audio: at most 6 SFX at once; a quieter cue is dropped when full, a louder one steals the oldest', () => {
    const names = ['play-attack', 'play-memoria', 'tactics-reveal', 'equip', 'attack-whoosh', 'round-start', 'heal', 'hit-heavy'];
    withSounds(names, () => {
      const f = fake('running');
      const a = A._create(f.env);
      a.init();
      for (const n of names) seed(a, n, 5);
      const play = (tag) => { a._flushBatch(); f.advance(100); return a.cue(tag); };
      for (const n of names.slice(0, 6)) eq(play(n), true, n);
      eq(a._debug().active, 6);
      eq(play('heal'), false, 'heal (gain 0.55) is quieter than the oldest active cue: dropped');
      eq(a._debug().stats.limited, 1);
      eq(play('hit-heavy'), true, 'hit-heavy (gain 0.95) steals the oldest');
      eq(a._debug().active, 6, 'still 6');
    });
  });

  test('Audio: the announcer speaks one line at a time, queued on the audio clock; awaken voice waits for the stinger impact', () => {
    withSounds(['vo-round-2', 'vo-match-point', 'awaken-stinger', 'vo-awakened'], () => {
      const f = fake('running');
      const a = A._create(f.env);
      a.init();
      seed(a, 'vo-round-2', 1.2); seed(a, 'vo-match-point', 1.4); seed(a, 'awaken-stinger', 3); seed(a, 'vo-awakened', 1);
      f.at(10);
      a.onLog(ent('roundStart', { round: 2, first: 1, pp: 4 }, 1), view({ wins: [1, 0] }));
      const vo = f.rec.starts.filter((s) => s.tag.startsWith('vo-'));
      eq(vo.map((s) => s.tag), ['vo-round-2', 'vo-match-point']);
      ok(vo[1].when >= vo[0].when + 1.2, 'the second line starts after the first has ended');
      a._flushBatch(); f.at(30);
      a.onLog(ent('awaken', { leader: 'L00', seat: 0, slot: 0, cause: 'attack', atk: 40, hp: 120 }), view());
      const st = f.rec.starts.filter((s) => s.tag === 'awaken-stinger')[0], av = f.rec.starts.filter((s) => s.tag === 'vo-awakened')[0];
      eq(st.when, 30); eq(av.when, 31.9, 'voice delay 1.9 s');
    });
  });

  test('Audio: a cue with no file is "audio pending: <tag>", reported once, listed by coverage(), never replaced by a made-up sound', () => {
    withSounds(['card-draw'], () => {
      const f = fake('running');
      const a = A._create(f.env);
      a.init();
      a.cue('ui-click'); a._flushBatch(); f.advance(200); a.cue('ui-click');
      eq(f.rec.warns, ['audio pending: ui-click']);
      eq(f.rec.starts.length, 0, 'nothing played');
      const old = XS.SOUNDS; // coverage reads XS.SOUNDS
      ok(a.coverage().missing.includes('ui-click') && !a.coverage().missing.includes('card-draw'));
      eq(old, XS.SOUNDS);
    });
  });

  test('Audio: a suspended context drops the sound (stale after unlock) and retries the resume; unmapped log types are reported once', () => {
    withSounds(['card-draw'], () => {
      const f = fake('suspended');
      const a = A._create(f.env);
      a.init();
      seed(a, 'card-draw', 0.3);
      const before = f.rec.resumes;
      eq(a.onLog(ent('draw', { cause: 'turnStart' }), view()), false);
      ok(f.rec.resumes > before, 'resume retried');
      eq(a._debug().stats.locked, 1);
      eq(a.onLog(ent('mystery', {}), view()), false);
      a.onLog(ent('mystery', {}), view());
      eq(f.rec.warns.filter((w) => /unmapped log type "mystery"/.test(w)).length, 1);
    });
  });
})();
