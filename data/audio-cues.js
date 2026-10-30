// Audio cue sheet (M6): the one list of every sound the game can play, as data. Read by
//   js/audio/map.js        (log entry -> cue tags; the test asserts every tag below exists)
//   js/audio/audio.js      (gain, loop, delay, voice channel)
//   js/audio/sounds-page.js (the audition page)
//   tools/gen-audio.mjs    (prompts, seconds, takes -> ElevenLabs; credits and the budget guard)
//   tools/measure-audio.mjs (loop seams, loudness targets, crest flags)
// Decisions: PLAN.md D5 (ElevenLabs), D6 (audio may spend at most $17 of the $25 total), D7 (esports
// broadcast: stinger on awakening, crowd swell at match point), D2 (the announcer is an ORIGINAL
// designed voice, never a clone of a real talent), D17 (key: env ELEVENLABS_API_KEY). Rationale: docs/audio.md.
//
// Cue fields
//   tag      unique id; also the file audio/<tag>.mp3 and the key in XS.SOUNDS
//   kind     'sfx' | 'music' | 'voice'
//   prompt   ElevenLabs text (sfx: sound-generation; music: Eleven Music). Describes the MECHANISM of the
//            sound and states exclusions ("no music, no voices"). Voice cues use `text` instead.
//   text     voice only: the spoken line, our own words
//   seconds  planned length (sfx: duration_seconds, 0.5..30; music: music_length_ms / 1000, 3..600)
//   loop     music/sfx that loops (the seam is crossfaded by tools/measure-audio.mjs)
//   gain     playback mix level 0..1, applied by XS.Audio on top of the normalised file
//   takes    how many generations to pay for before keeping the best (default 1)
//   duck     music level (0..1) the music bus drops to while this cue sounds (stingers); announcer lines always duck to 0.55
//   delay    seconds after the triggering entry before playback (lands a line on a stinger's impact)
//   use      'log' (reached through js/audio/map.js), 'ui' (XS.Audio.cue from the interface),
//            'scene' (XS.Audio.setScene)
//   crestMin sfx hits: measure-audio flags a file whose crest factor is below this (AI hits come back near 2;
//            real impacts are 8-20; KB card-games.md section 6)
(function () {
  const XS = (globalThis.XS = globalThis.XS || {});

  // One byte-identical musical brief across every music cue (KB LESSONS-DIGEST: a shared brief keeps a
  // soundtrack one piece), then a short per-track mood. Instrumental only; no franchise or artist names.
  const BRIEF = 'high-energy electronic esports broadcast score, punchy synth bass, tight modern drums, bright arpeggiated synth leads, wide stadium atmosphere, polished and cinematic, instrumental only';
  const NOVOICE = 'no music, no voices, no speech';

  XS.AUDIO = {
    // PLAN D6: of the $25 total for art AND audio, audio may spend at most this. tools/gen-audio.mjs refuses a
    // run whose estimate (plus docs/audio-ledger.json) passes it.
    budgetUSD: 17,
    // ElevenLabs bills plan credits. Price per credit, from the pricing page read 2026-10-29 (docs/audio.md):
    // Starter $6 / 30,000 credits = $0.20 per 1k (the dearest plan per credit, so the estimate is an upper bound);
    // Creator $22 / 121,000 = $0.18 per 1k. Override with --usd-per-1k or ELEVENLABS_USD_PER_1K.
    usdPer1kCredits: 0.20,
    // Credit model used for the ESTIMATE (the ledger records the measured balance change when the key allows it).
    // Assumptions, each from the pricing page: sound effects 200 credits per generation (we also bound it by
    // 40 credits per second so a long clip is not under-counted), music 900 credits per minute (rounded up to
    // 1000), text to speech 1 credit per character on Multilingual v2.
    credits: { sfxPerGeneration: 200, sfxPerSecond: 40, musicPerMinute: 1000, ttsPerChar: 1, voiceDesign: 500 },

    // The announcer. An ORIGINAL voice: designed with ElevenLabs Voice Design (or a library voice named with
    // --voice-id), never a clone and never a real talent (D2). `id` is written here by tools/gen-audio.mjs
    // after the design step (or set from --voice-id), so the voice stays the same across regenerations.
    voice: {
      name: 'Xross Forge Caster',
      design: 'An energetic male esports shoutcaster in his thirties with a clear, punchy mid-range voice, fast confident broadcast delivery, rising excitement on key words, neutral international English accent, studio-clean recording.',
      sample: 'Welcome back to the arena, everyone! What a round that was. The crowd is on its feet, the team is down to its last leader, and this next turn could decide the whole match!',
      model: 'eleven_multilingual_v2',
      settings: { stability: 0.35, similarity_boost: 0.75, style: 0.55, speed: 1.05 },
      // VOICE_ID (rewritten by tools/gen-audio.mjs; keep this on one line)
      id: null,
    },

    brief: BRIEF,

    cues: [
      // ---- interface (XS.Audio.cue) ----------------------------------------------------------------
      { tag: 'ui-hover', kind: 'sfx', use: 'ui', seconds: 0.5, gain: 0.35, prompt: `a tiny soft high digital tick, subtle holographic interface hover, very short and dry, ${NOVOICE}` },
      { tag: 'ui-click', kind: 'sfx', use: 'ui', seconds: 0.5, gain: 0.6, prompt: `a single crisp short digital button click, glassy interface tap, dry, very short, ${NOVOICE}` },
      { tag: 'ui-confirm', kind: 'sfx', use: 'ui', seconds: 1, gain: 0.6, prompt: `a bright two-note rising digital confirmation chime, clean glassy synth blip, short, ${NOVOICE}` },
      { tag: 'ui-cancel', kind: 'sfx', use: 'ui', seconds: 0.8, gain: 0.5, prompt: `a soft low descending two-note muted digital blip, gentle cancel, short and dry, ${NOVOICE}` },
      { tag: 'ui-drawer', kind: 'sfx', use: 'ui', seconds: 0.8, gain: 0.5, prompt: `a sliding holographic panel whoosh ending in a soft mechanical latch click, drawer opening, short, ${NOVOICE}` },

      // ---- cards, PP, tactics (log: draw, play, tacticsPlay, equip, boost, ppSpend, ppRecover, reshuffle, tacticsBurn, discard) ----
      { tag: 'card-draw', kind: 'sfx', use: 'log', seconds: 0.6, gain: 0.55, prompt: `a single playing card slid quickly off the top of a deck, crisp dry paper swish and snap, close up, ${NOVOICE}` },
      { tag: 'play-attack', kind: 'sfx', use: 'log', seconds: 1, gain: 0.75, prompt: `a stiff trading card slapped hard onto a table with a sharp energetic electric crackle, aggressive, close up, dry, ${NOVOICE}` },
      { tag: 'play-memoria', kind: 'sfx', use: 'log', seconds: 1, gain: 0.7, prompt: `a trading card laid down on a table with a soft glowing magical shimmer chime, gentle, close up, ${NOVOICE}` },
      { tag: 'pp-spend', kind: 'sfx', use: 'log', seconds: 0.6, gain: 0.45, prompt: `a short soft electronic energy drain, two quick descending glassy clicks, dry, ${NOVOICE}` },
      { tag: 'pp-recover', kind: 'sfx', use: 'log', seconds: 0.8, gain: 0.5, prompt: `small energy crystals recharging, a quick bright rising electronic sparkle, clean, ${NOVOICE}` },
      { tag: 'tactics-reveal', kind: 'sfx', use: 'log', seconds: 1.2, gain: 0.7, prompt: `a face-down card flipped over with a dramatic whoosh and a sharp bright reveal hit, short, ${NOVOICE}` },
      { tag: 'equip', kind: 'sfx', use: 'log', seconds: 1, gain: 0.7, prompt: `a metal gadget clamped onto armour, solid latch click followed by a short powering-up electric hum, close up, ${NOVOICE}` },
      { tag: 'boost-armed', kind: 'sfx', use: 'log', seconds: 1.2, gain: 0.6, prompt: `a quick electronic charging rise, energy gathering with a climbing hum that ends in a firm lock click, short, ${NOVOICE}` },
      { tag: 'reshuffle', kind: 'sfx', use: 'log', seconds: 1.5, gain: 0.55, prompt: `a deck of playing cards riffle shuffled and bridged, crisp paper fluttering, close up, ${NOVOICE}` },
      { tag: 'tactics-burn', kind: 'sfx', use: 'log', seconds: 1.5, gain: 0.65, prompt: `a card catching fire, sharp flame whoosh with a small crackle of embers, close up, ${NOVOICE}` },
      { tag: 'discard', kind: 'sfx', use: 'log', seconds: 0.6, gain: 0.45, prompt: `a playing card tossed face down onto a pile of cards, light paper flick and soft slide, close up, ${NOVOICE}` },

      // ---- the attack (log: attack, damage, heal, down) ----------------------------------------------------
      { tag: 'attack-whoosh', kind: 'sfx', use: 'log', seconds: 0.8, gain: 0.7, prompt: `a fast powerful strike whoosh passing by, rising air swish with a sharp tail, short, ${NOVOICE}` },
      { tag: 'hit-light', kind: 'sfx', use: 'log', seconds: 0.6, gain: 0.7, takes: 2, crestMin: 4, prompt: `a light sharp impact slap with a small electric zap, a quick tight hit, close up, dry, ${NOVOICE}` },
      { tag: 'hit-medium', kind: 'sfx', use: 'log', seconds: 0.8, gain: 0.8, takes: 2, crestMin: 4, prompt: `a solid heavy punch impact thud with a short crunch and a bright electric crack, close up, dry, ${NOVOICE}` },
      { tag: 'hit-heavy', kind: 'sfx', use: 'log', seconds: 1.2, gain: 0.95, takes: 2, crestMin: 4, prompt: `a massive explosive impact, deep sub-bass boom with a sharp cracking transient and debris scatter, cinematic, dry, ${NOVOICE}` },
      { tag: 'heal', kind: 'sfx', use: 'log', seconds: 1.5, gain: 0.55, prompt: `a warm healing shimmer, soft rising sparkles over a calm glowing tone, gentle, ${NOVOICE}` },
      { tag: 'leader-down', kind: 'sfx', use: 'log', seconds: 1.8, gain: 0.85, prompt: `a fighter knocked out, deep heavy thud with a descending electronic power-down sweep and a short crackle of debris, ${NOVOICE}` },
      { tag: 'overkill', kind: 'sfx', use: 'log', seconds: 1.6, gain: 0.85, prompt: `an overwhelming finishing blow: a huge crunching impact with a crowd's sudden roar swelling behind it, short and explosive, ${NOVOICE}` },
      { tag: 'revive', kind: 'sfx', use: 'log', seconds: 2, gain: 0.7, prompt: `a fighter rising back to their feet: a slow rising power-up hum climbing into a bright crystalline swell and a soft shimmering hit, hopeful, ${NOVOICE}` },
      { tag: 'deck-look', kind: 'sfx', use: 'log', seconds: 0.9, gain: 0.45, prompt: `several playing cards fanned out quickly from the top of a deck, a soft dry riffle with a light flick at the end, close up, ${NOVOICE}` },

      // ---- the signature moment (log: awaken) ----------------------------------------------------------------
      { tag: 'awaken-stinger', kind: 'sfx', use: 'log', seconds: 3, gain: 1, takes: 2, duck: 0.3, prompt: `esports broadcast reveal stinger: a rising cinematic riser with a sweeping whoosh building for two seconds, then a huge deep bass impact boom with a bright shimmering crash, big and energetic, ${NOVOICE}` },

      // ---- rounds and turns (log: roundStart, roundEnd, turnStart) ------------------------------------------------
      { tag: 'round-start', kind: 'sfx', use: 'log', seconds: 1.5, gain: 0.7, prompt: `a short broadcast whoosh into a bright metallic impact hit, stadium match start sting, punchy, ${NOVOICE}` },
      { tag: 'round-win', kind: 'sfx', use: 'log', seconds: 2, gain: 0.8, prompt: `a short triumphant electronic win sting, bright rising synth chords with a shimmering sparkle tail, positive, ${NOVOICE}` },
      { tag: 'round-loss', kind: 'sfx', use: 'log', seconds: 2, gain: 0.75, prompt: `a short subdued descending low synth sting, a point lost, heavy and brief, ${NOVOICE}` },
      { tag: 'turn-start-you', kind: 'sfx', use: 'log', seconds: 1, gain: 0.55, prompt: `a bright confident two-note synth chime announcing your turn, clean and short, ${NOVOICE}` },
      { tag: 'turn-start-opp', kind: 'sfx', use: 'log', seconds: 1, gain: 0.4, prompt: `a lower muted single synth pluck pulse announcing the opponent's turn, soft and short, ${NOVOICE}` },
      { tag: 'crowd-swell', kind: 'sfx', use: 'log', seconds: 4, gain: 0.8, prompt: 'a large arena crowd rising from a murmur into a roaring cheer, stadium atmosphere building tension, no music, no intelligible words' },

      // ---- music (XS.Audio.setScene) ---------------------------------------------------------------------------
      { tag: 'music-title', kind: 'music', use: 'scene', seconds: 45, loop: true, gain: 0.55, prompt: `${BRIEF}, inviting main theme, confident mid tempo around 100 bpm, anticipation before a tournament, seamless loop` },
      { tag: 'music-calm', kind: 'music', use: 'scene', seconds: 50, loop: true, gain: 0.45, prompt: `${BRIEF}, calm focused play, sparse and steady around 92 bpm, light percussion, thinking pace, seamless loop` },
      { tag: 'music-tense', kind: 'music', use: 'scene', seconds: 45, loop: true, gain: 0.55, prompt: `${BRIEF}, rising tension, driving pulse around 124 bpm, urgent bass ostinato, high stakes in a deciding round, seamless loop` },
      { tag: 'music-victory', kind: 'music', use: 'scene', seconds: 10, gain: 0.8, prompt: `${BRIEF}, triumphant victory fanfare, bright rising synth brass and a big finishing chord, celebratory, ends cleanly` },
      { tag: 'music-defeat', kind: 'music', use: 'scene', seconds: 8, gain: 0.8, prompt: `${BRIEF}, defeat, slow descending minor phrase fading to a soft low pad, sombre but respectful, ends cleanly` },

      // ---- announcer (original designed voice, XS.AUDIO.voice) ---------------------------------------------------------
      { tag: 'vo-round-1', kind: 'voice', use: 'log', seconds: 1.5, gain: 0.9, text: 'Round one!' },
      { tag: 'vo-round-2', kind: 'voice', use: 'log', seconds: 1.5, gain: 0.9, text: 'Round two!' },
      { tag: 'vo-final-round', kind: 'voice', use: 'log', seconds: 1.8, gain: 0.95, text: 'Final round!' },
      { tag: 'vo-awakened', kind: 'voice', use: 'log', seconds: 1.5, gain: 1, delay: 1.9, text: 'Awakened!' },
      { tag: 'vo-match-point', kind: 'voice', use: 'log', seconds: 1.8, gain: 0.95, text: 'Match point!' },
      { tag: 'vo-victory', kind: 'voice', use: 'log', seconds: 1.8, gain: 1, delay: 0.4, text: 'Victory!' },
      { tag: 'vo-defeat', kind: 'voice', use: 'log', seconds: 1.8, gain: 0.9, delay: 0.4, text: 'Defeat.' },
    ],
  };

  // Lookup by tag, built once.
  XS.AUDIO.byTag = {};
  for (const c of XS.AUDIO.cues) {
    if (XS.AUDIO.byTag[c.tag]) throw new Error('audio-cues: duplicate tag ' + c.tag);
    XS.AUDIO.byTag[c.tag] = c;
  }
})();
