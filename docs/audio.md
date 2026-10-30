# Audio (M6)

Decisions live in `PLAN.md`: D5 (ElevenLabs, "not verified by ear" until the owner listens on `sounds.html`),
D6 (budget), D7 (esports-broadcast look: stinger on awakening, crowd swell at match point), D2 (the announcer is an
original voice, never a clone), D17 (key in the environment). This file explains how the pieces fit.

Status 2026-10-29 (evening, PLAN D18): **every cue exists**, generated on the owner's PC's local Audio Studio by
`tools/gen-audio-local.mjs` (the chain below is unchanged from `measure-audio.mjs` on). The ElevenLabs generator
stays as the alternative when a key exists (none was ever in the cloud session or on the PC). Earlier that day
the chain had been proven with `--dry-run` and `--mock` only. Every cue is a declared pending state: `data/sound-manifest.js` is empty,
`XS.Audio` reports `audio pending: <tag>` once per tag and plays nothing in its place.

## The pieces

| File | What it is |
|---|---|
| `data/audio-cues.js` | The cue sheet: 41 cues (29 sfx, 5 music, 7 announcer lines), their prompts, lengths, mix gains, the announcer's voice design, the credit model and the budget. |
| `js/audio/map.js` | `XS.AudioMap.cuesFor(entry, view)`: log entry to cue tags (pure); `sceneFor(view)`: calm or tense or victory or defeat; `triggersOf(tag)` for the audition page. |
| `js/audio/audio.js` | `XS.Audio`, the runtime (one AudioContext, lazy buffers, rate limits, announcer queue, music crossfade). |
| `tools/gen-audio.mjs` | ElevenLabs generator with `--dry-run`, `--probe`, `--samples`, `--mock`, ledger and budget guard. |
| `tools/measure-audio.mjs` | Trim, loop seams, loudness, crest, mp3 encode, writes `data/sound-manifest.js`. |
| `sounds.html`, `js/audio/sounds-page.js` | The audition page. |
| `docs/audio-ledger.json` | Every paid call: `{date, tag, kind, credits, estUSD, measured}`. |
| `tests/50-audio.js` | Map coverage against the contract, cue sheet checks, `XS.Audio` over a fake context. |

Masters (`audio/masters/<tag>.mp3`) and archives (`audio/archive/`) are gitignored; the repo carries the delivery
encodes `audio/<tag>.mp3` only.

## Running it (when the key exists)

```
node tools/gen-audio.mjs --probe        # tier and remaining credits; says nothing about music access
node tools/gen-audio.mjs --dry-run      # the plan, credits and dollars, budget check; no key needed
node tools/gen-audio.mjs --samples      # D6: three samples first (hit-medium, awaken-stinger, music-victory)
node tools/measure-audio.mjs            # masters -> audio/*.mp3 + data/sound-manifest.js; flags low-crest hits
# listen on sounds.html, then the rest:
node tools/gen-audio.mjs                # everything still missing (idempotent), then measure-audio again
node tools/gen-audio.mjs --only hit-heavy --force   # re-roll one cue; the old master goes to audio/archive/ first
```

The first voice cue designs the announcer (Voice Design) and writes the new voice id into the `// VOICE_ID` line of
`data/audio-cues.js`; the preview lands in `audio/masters/voice-design-preview.mp3`. To change the voice, edit
`AUDIO.voice.design`, set `id: null`, and rerun with `--force --only vo-round-1,...`. A library voice can be used with
`--voice-id <id>` (it must be an original or stock voice; no cloned voices, D2).

`--mock` writes generated test tones (ffmpeg `sine` / `anoisesrc`) to `audio/masters/mock/`; `measure-audio.mjs --mock`
delivers them to `audio/masters/mock-out/` with a manifest marked `mock:true` (`sounds.html` shows a banner); 
`measure-audio.mjs --clean-mock` removes both and empties the manifest. Mock never touches the ledger or the cue sheet.

## Running it locally (PLAN D18, how the first set was made)

The owner's PC runs an Audio Studio (`node server.js` in the 3D Model Generation repo's `audio-studio`, port 7890,
`AUDIO_STUDIO_URL` to override; it starts the shared ComfyUI on its first job). `tools/gen-audio-local.mjs` reads the
same cue sheet and writes the same masters (`audio/masters/<tag>.mp3`), so everything after it is the same chain:

```
node tools/gen-audio-local.mjs --dry-run            # the plan: model and parameters per cue, no studio
node tools/gen-audio-local.mjs                      # sfx: Stable Audio Open 1.0 (2-4 takes, best by crest and length);
                                                    # music: ACE-Step 1.5 turbo (2 takes, instrumental, bpm parsed from the prompt);
                                                    # voice: Qwen3-TTS Voice Design once from AUDIO.voice.design (the ORIGINAL
                                                    #        announcer, audio/masters/voice-design-preview.wav), then every line
                                                    #        spoken by that designed voice (qwen-clone with the preview as reference)
node tools/measure-audio.mjs                        # masters -> audio/*.mp3 + data/sound-manifest.js, as before
node tools/gen-audio-local.mjs --force --only hit-heavy    # re-roll one cue (the old master goes to audio/archive/)
```

Takes are picked by numbers (crest factor toward `crestMin` or 6, length toward `seconds`; music by silence and envelope
variance). Every render appends a `$0` entry to `docs/audio-ledger.json` (`provider: audio-studio-local`, the studio
job id, the takes' scores) so each clip traces to its prompt and seed. The announcer's voice id line in the cue sheet
stays `null`: locally the voice is the preview file, not an id. Stop the studio when done (owner rule, 2026-10-18).

## Why these cues

- **Hit tiers by damage** (<= 30 light, 40-70 medium, >= 80 heavy): three impacts instead of a pitch shift, because
  damage is the number players watch; the tier carries the stakes. `crestMin` flags a generated hit that came back
  flat (KB: AI hits arrive with crest ~2, real impacts 8-20).
- **Awakening** is the signature moment (D7): `awaken-stinger` is a riser into an impact; the announcer's "Awakened!"
  carries a 1.9 s delay so it lands on the impact, and the stinger ducks the music to 0.3.
- **Match point** (D7): round 2 of a best of 3 is always match point for the side that won round one, so the round-two
  start plays the line, a crowd swell and "Match point!" (announcer lines queue, never overlap). Round 3 is "Final round!"
  with the swell. A quick match has none of that.
- **Music** (`music-title`, `music-calm`, `music-tense` loop; victory and defeat play once). `sceneFor(view)`: tense
  when a side has 2 or fewer live leaders, or on match point from the first lost leader; round one of a full match stays
  calm until then. One shared brief is byte-identical across the five tracks so they sound like one score.
- **Silent on purpose** (the map states why): `start`, `rps`, `chooseFirst`, `tacticsPick` (hidden information, never
  audible), `tacticsPlace`, `turnEnd`, `ability` (its results have their own cues), `trash`, setup draws, applied boosts,
  round-end discards. `fizzle` reuses the soft `ui-cancel` blip.
- **Round win/loss** are skipped when the round decides the match: the victory or defeat music and line own that moment.
- Prompts describe the mechanism of the sound and state exclusions ("no music, no voices"); none names a franchise,
  agency or artist, and none asks for imitation (a lint in `gen-audio.mjs` and in `tests/50-audio.js`).

## Budget and ledger (D6)

Of the $25 total for art and audio, audio may spend at most **$17** (`AUDIO.budgetUSD`). `gen-audio.mjs` refuses a run
whose estimate plus the ledger passes it (exit 3).

ElevenLabs bills in plan credits, not dollars. Price per credit, from the public pricing page read 2026-10-29 (verify;
prices move): Starter $6 for 30,000 credits ($0.20 per 1k), Creator $22 for 121,000 ($0.18 per 1k), Pro $99 for 600,000
($0.165 per 1k), Scale $299 for 1.8 million. The estimate uses the dearest, **$0.20 per 1k credits** (`usdPer1kCredits`;
override with `--usd-per-1k` or `ELEVENLABS_USD_PER_1K`). Credit model (also from that page, also to verify): sound
effects 200 credits per generation (bounded below by 40 per second), music 900 credits per minute (we use 1000), text to
speech 1 credit per character on Multilingual v2, voice design about 500 (assumed). The page's USD-per-minute API rates
(music $0.15, sound effects $0.12 per minute) would be lower still; the ledger does not rely on them.

**Estimate for the full sheet: about 9,800 credits = about $2.0** (sfx 6,600 including 2 takes for the three hit tiers
and the awaken stinger, music 2,600, voice 70 plus design 500). That leaves about $15 of headroom for re-takes.

The ledger's `credits` is the **measured change of the account balance** (`GET /v1/user/subscription`, before and after
every call) when the key may read it, else the estimate (`measured: false`). A failed attempt that the balance shows as
charged is recorded too (KB: ElevenLabs charged for 502s). 5xx and network errors back off (2 s, then 6 s) and the call is
tried at most 3 times; then the run stops.

Music access depends on the plan: if Eleven Music refuses the request (402/403/422) the tool says so, the cue stays
pending, and the rest of the run continues. The music endpoint and parameters (`POST /v1/music`, `prompt`,
`music_length_ms`, `force_instrumental`, `model_id: music_v1`) are from the API reference read 2026-10-29 and have
**not been exercised against the real service** (no key); a local fake server was used to test the call paths.

## Measuring (what the numbers mean)

`measure-audio.mjs` trims silence, fades, crossfades loop seams (1.5 s equal power), normalises loudness per kind
(sfx and voice -18 LUFS, music loops -22, music stings -18) with a -1.5 dBFS peak cap, and encodes mp3 (sfx and voice mono
96 kbps, music stereo 128 kbps). LUFS is K-weighted but **ungated over the whole clip** (most sfx are shorter than the 400 ms
gating block). Crest is peak/RMS, linear. The manifest carries `lufs`, `peak`, `crest`, `flags` for the audition page.
All of this is numbers; **none of it is verified by ear.**

## iOS and browser notes

- One `AudioContext` for everything. `unlock()` starts it from a gesture and plays a one-sample silent buffer inside the
  gesture. The listeners (`pointerup`, `touchend`, `click`, `keydown`) are never removed: iOS only resumes a context from
  those events, and a call or app switch suspends it again (KB lessons-since-2026-10-17, Mallet M12).
  Also retried on `visibilitychange`, `pageshow`, `focus` and on every `statechange`.
- `navigator.audioSession.type = 'playback'` (iOS 17+) so sound plays with the silent switch on.
- A sound requested while the context is not running is dropped (it would be stale after unlock); the wanted music scene
  is kept and starts when the context runs.
- A sound whose file was not decoded yet when its moment came plays only if it decodes within 500 ms; all sfx and voice
  files are decoded in the background after the first unlock, so this is the first-seconds case only.
- Loops are mp3 with a baked crossfade seam; gapless mp3 looping depends on the decoder honouring the LAME header.
  Check the loops on a phone on `sounds.html` (the "loop" tracks repeat there).

## How M7 hooks in

Scripts (after `js/ns.js`, `data/sound-manifest.js`; before the `js/ui/*` that call them):
`data/audio-cues.js`, `js/audio/map.js`, `js/audio/audio.js`. `tests.html` loads the same three (outside its engine
block) plus `tests/50-audio.js`.

```
XS.Audio.init();                         // at boot; returns false (and .reason says why) without Web Audio
XS.Audio.unlock();                       // from the first tap (Play, a menu click); keeps its own listeners
XS.Audio.setScene('title');              // title screen
XS.Audio.onLog(entry, view);             // the director calls this when it SHOWS the entry, not when apply() runs
XS.Audio.setScene(XS.AudioMap.sceneFor(view));   // after each presented step: calm / tense / victory / defeat
XS.Audio.cue('ui-click');                // ui-hover, ui-click, ui-confirm, ui-cancel, ui-drawer
XS.Audio.settings = { master, sfx, music, voice, muted };   // persist in the settings store; apply at boot
XS.Audio.coverage();                     // {cues, files, missing, orphans}
```

`view` must be the presented view for the viewing seat (`XS.view(state, seat)` of the state the director is showing):
the map reads `viewer`, `mode`, `needWins` and, for the scene, `players[p].leaders[i].down`, `wins`, `phase`, `winner`.
`onLog` also plays the music-scene cues of `matchEnd` (`music-victory` / `music-defeat`), so calling `setScene` for the
end is optional. Identical tags inside one tick (one director batch) play once.
