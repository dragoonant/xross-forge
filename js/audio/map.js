// Log entry -> cue tags (M6). Pure: no DOM, no AudioContext, no clock. XS.AudioMap.cuesFor(entry, view) is
// what XS.Audio.onLog calls when the director SHOWS an entry; tests/50-audio.js drives it headless.
//
// The log is the engine's structured event stream (docs/ENGINE-API.md "Log"). Every log type has an entry in
// TYPES below: either `tags` + `fn` (the cues it can produce, and the rule that picks them) or `none` (a reason
// the type is silent on purpose). tests/50-audio.js fails when the contract grows a type this table lacks,
// when a tag is not in data/audio-cues.js, and when a cue in the sheet can never be reached.
//
// `view` is the presented view for the viewing seat (XS.view(state, seat)): we read view.viewer, view.mode,
// view.needWins, view.wins and, for sceneFor, view.players[p].leaders[i].down.
(function () {
  'use strict';
  const XS = (globalThis.XS = globalThis.XS || {});

  // Music scenes (XS.Audio.setScene) -> cue tag. 'silent' stops the music.
  const SCENES = { title: 'music-title', calm: 'music-calm', tense: 'music-tense', victory: 'music-victory', defeat: 'music-defeat', silent: null };

  // Damage tiers: <= 30 light, 40-70 medium, >= 80 heavy (damage is dealt in multiples of 10, PM p.8).
  function hitTier(amount) {
    if (!(amount > 0)) return null;
    if (amount <= 30) return 'hit-light';
    if (amount < 80) return 'hit-medium';
    return 'hit-heavy';
  }

  const viewer = (view) => (view && Number.isInteger(view.viewer) ? view.viewer : 0);
  // Perspective of the seat that sees the view (hot seat: whoever the view was made for).
  const mine = (entry, view) => entry.seat === viewer(view);

  // The match is decided by this roundEnd (needWins reached): matchEnd owns the fanfare, so no round sting.
  function endsMatch(data, view) {
    const need = view && view.needWins ? view.needWins : 2;
    return Math.max(data.wins[0], data.wins[1]) >= need;
  }

  const none = (why) => ({ none: why });

  const TYPES = {
    start: none('the title music scene is switched by the interface, not by the log'),
    rps: none('rock-paper-scissors has no picture of its own'),
    chooseFirst: none('a prompt, answered by the player; the round-start line covers it'),
    roundStart: {
      tags: ['round-start', 'vo-round-1', 'vo-round-2', 'vo-final-round', 'vo-match-point', 'crowd-swell'],
      // Round 2 of a best of 3 is always match point for the side that won round 1; round 3 is the final round.
      fn(e, view) {
        const round = e.data.round, full = !view || view.mode !== 'quick';
        if (round <= 1 || !full) return ['round-start', 'vo-round-1'];
        if (round === 2) return ['round-start', 'vo-round-2', 'crowd-swell', 'vo-match-point'];
        return ['round-start', 'vo-final-round', 'crowd-swell'];
      },
    },
    tacticsPick: none('hidden pick; nothing may be heard that the other seat should not know'),
    tacticsPlace: none('the PP Ticket is placed face up during setup, under the round-start sting'),
    draw: {
      tags: ['card-draw'],
      fn: (e) => (e.data.cause === 'setup' ? [] : ['card-draw']),   // the opening hand is dealt under the round-start sting
    },
    turnStart: { tags: ['turn-start-you', 'turn-start-opp'], fn: (e, v) => [mine(e, v) ? 'turn-start-you' : 'turn-start-opp'] },
    turnEnd: none('the next turnStart answers it'),
    ppRecover: { tags: ['pp-recover'], fn: (e) => (e.data.n > 0 ? ['pp-recover'] : []) },
    ppSpend: { tags: ['pp-spend'], fn: (e) => (e.data.n > 0 ? ['pp-spend'] : []) },
    play: { tags: ['play-attack', 'play-memoria'], fn: (e) => [e.data.type === 'attack' ? 'play-attack' : 'play-memoria'] },
    tacticsPlay: { tags: ['tactics-reveal'], fn: () => ['tactics-reveal'] },
    equip: { tags: ['equip'], fn: () => ['equip'] },
    boost: {
      tags: ['boost-armed'],
      fn: (e) => (e.data.phase === 'armed' ? ['boost-armed'] : []),   // 'applied' is heard as the hit that follows
    },
    attack: { tags: ['attack-whoosh'], fn: () => ['attack-whoosh'] },
    damage: { tags: ['hit-light', 'hit-medium', 'hit-heavy'], fn: (e) => { const t = hitTier(e.data.amount); return t ? [t] : []; } },
    heal: { tags: ['heal'], fn: (e) => (e.data.amount > 0 ? ['heal'] : []) },
    down: { tags: ['leader-down'], fn: () => ['leader-down'] },
    awaken: { tags: ['awaken-stinger', 'vo-awakened'], fn: () => ['awaken-stinger', 'vo-awakened'] },   // the voice carries delay 1.9 s: it lands on the impact
    ability: none('an effect group starting; what it does is heard from the entries it produces (damage, heal, draw)'),
    discard: { tags: ['discard'], fn: (e) => (e.data.cause === 'roundEnd' ? [] : ['discard']) },
    trash: none('bulk clean-up of the play area; heard as the round-end sting'),
    reshuffle: { tags: ['reshuffle'], fn: () => ['reshuffle'] },
    tacticsBurn: { tags: ['tactics-burn'], fn: () => ['tactics-burn'] },
    roundEnd: {
      tags: ['round-win', 'round-loss'],
      fn(e, view) {
        if (endsMatch(e.data, view)) return [];
        if (e.data.winner === null || e.data.winner === undefined) return [];
        return [e.data.winner === viewer(view) ? 'round-win' : 'round-loss'];
      },
    },
    matchEnd: {
      tags: ['music-victory', 'music-defeat', 'vo-victory', 'vo-defeat'],
      fn: (e, view) => (e.data.winner === viewer(view) ? ['music-victory', 'vo-victory'] : ['music-defeat', 'vo-defeat']),
    },
    overkill: { tags: ['overkill'], fn: () => ['overkill'] },   // the crowd reacts to the excess; the effect it unlocks makes its own sound
    echo: none('a card turning sideways or being played again for free; the effects it repeats make their own sounds'),
    look: { tags: ['deck-look'], fn: () => ['deck-look'] },   // a soft riffle; a card added to the hand is heard as the next draw or play
    freePlay: { tags: ['play-attack', 'play-memoria'], fn: (e) => [e.data.type === 'attack' ? 'play-attack' : 'play-memoria'] },
    revive: { tags: ['revive'], fn: () => ['revive'] },   // a downed leader standing up again
    fizzle: { tags: ['ui-cancel'], fn: () => ['ui-cancel'] },   // an effect that could do nothing: the soft "no" blip
  };

  // The log types this module covers (tests/50-audio.js compares with the contract's list).
  const LOG_TYPES = Object.keys(TYPES);

  function cuesFor(entry, view) {
    if (!entry || typeof entry.type !== 'string') throw new Error('AudioMap.cuesFor: not a log entry');
    const m = TYPES[entry.type];
    if (!m) return [];                 // unmapped type: XS.Audio.onLog reports it once; the table is gated by tests/50-audio.js
    if (m.none) return [];
    return m.fn(entry, view);
  }

  // Which music scene fits the presented state? calm | tense | victory | defeat. The interface calls
  // XS.Audio.setScene(XS.AudioMap.sceneFor(view)) after each presented step; the title scene is its own call.
  // Tense: a side is down to 1-2 live leaders; on match point (best of 3, a side one round from the win) from the
  // first lost leader (3 or fewer alive). Round 1 of a full match and a quick match stay calm until a side is at 2.
  function sceneFor(view) {
    if (view.phase === 'over') return view.winner === view.viewer ? 'victory' : 'defeat';
    const alive = (p) => view.players[p].leaders.filter((l) => !l.down).length;
    const low = Math.min(alive(0), alive(1));
    const matchPoint = view.mode !== 'quick' && (view.wins[0] === view.needWins - 1 || view.wins[1] === view.needWins - 1);
    return low <= 2 || (matchPoint && low <= 3) ? 'tense' : 'calm';
  }

  // For the audition page: every log type that can produce `tag`, with the rule in words.
  function triggersOf(tag) {
    const out = [];
    for (const type of LOG_TYPES) { const m = TYPES[type]; if (m.tags && m.tags.includes(tag)) out.push(type); }
    for (const [scene, t] of Object.entries(SCENES)) if (t === tag) out.push('scene:' + scene);
    return out;
  }

  XS.AudioMap = { SCENES, TYPES, LOG_TYPES, cuesFor, sceneFor, hitTier, triggersOf, has: (type) => !!TYPES[type] };
})();
