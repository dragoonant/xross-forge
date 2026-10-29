#!/usr/bin/env node
// Generates the game's audio with ElevenLabs (PLAN D5), from the cue sheet data/audio-cues.js.
//   SFX    POST /v1/sound-generation          {text, duration_seconds, prompt_influence, model_id}
//   music  POST /v1/music                     {prompt, music_length_ms, model_id, force_instrumental}  (Eleven Music)
//   voice  POST /v1/text-to-speech/{voice_id} {text, model_id, voice_settings}; the voice itself is ORIGINAL:
//          designed with Voice Design (POST /v1/text-to-voice/design, then /v1/text-to-voice) or a library voice
//          named with --voice-id. Never a clone (PLAN D2). The id is written into the cue sheet's `// VOICE_ID` line.
//
//   node tools/gen-audio.mjs --dry-run              the plan and the credit / $ estimate, no network, no key
//   node tools/gen-audio.mjs --probe                GET /v1/user/subscription: tier and remaining credits (never the key)
//   node tools/gen-audio.mjs --samples              the three D6 sample cues only (hit-medium, awaken-stinger, music-victory)
//   node tools/gen-audio.mjs [--only a,b] [--kind sfx|music|voice] [--limit N] [--takes N] [--force]
//   node tools/gen-audio.mjs --mock                 ffmpeg test tones into audio/masters/mock/ (no network, no ledger)
//   other flags: --voice-id <id>  --usd-per-1k <n>  --music-model <id>  --yes (skip the 5 s pause before a paid run)
//
// The key is read from process.env.ELEVENLABS_API_KEY at run time (PLAN D17), never printed, logged or written.
// Masters go to audio/masters/<tag>.mp3 (gitignored). Idempotent: a tag whose master exists is skipped; --force
// archives it to audio/archive/ first. Every paid call is appended to docs/audio-ledger.json with the credits it
// used (the measured change of the account balance when the key may read it, else the estimate) and the
// estimated dollars. A run whose estimate plus the ledger passes the audio budget (PLAN D6: $17 of the $25 total) is
// refused. A 5xx is backed off and retried, at most 3 attempts in all; every attempt that the balance shows as
// charged is recorded (KB: ElevenLabs charged for 502s), and then the run stops.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = process.env.ELEVENLABS_API_BASE || 'https://api.elevenlabs.io';   // the override is for tests against a local fake server
const MASTERS = path.join(ROOT, 'audio/masters');
const ARCHIVE = path.join(ROOT, 'audio/archive');
const LEDGER = path.join(ROOT, 'docs/audio-ledger.json');
const CUES_FILE = path.join(ROOT, 'data/audio-cues.js');
const SAMPLE_TAGS = ['hit-medium', 'awaken-stinger', 'music-victory'];
const OUTPUT_FORMAT = 'mp3_44100_128';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- cue sheet --------------------------------------------------------------------------------------------------
export function loadCues() {
  const ctx = { console };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(CUES_FILE, 'utf8'), ctx, { filename: 'data/audio-cues.js' });
  return ctx.XS.AUDIO;
}

// ---- lint: prompts never carry franchise, agency or artist names, nor ask for imitation (CLAUDE.md rule 11, PLAN D2) -------------
const BANNED = [/\bvspo\b/i, /ぶいすぽ/, /crazy\s*raccoon/i, /\bbrave\s*group\b/i, /game\s*&\s*co/i, /xross\s*stars?/i, /クロスタ/, /nintendo|pok[eé]mon|yu-?gi-?oh|hololive|nijisanji/i];
const IMITATION = /\b(in the style of|sounds? like|voice of|imitat\w*|clone[ds]?|cloning|impersonat\w*|as sung by|by the artist)\b/i;
export function lintCue(c) {
  const text = [c.prompt, c.text, c.tag].filter(Boolean).join(' ');
  const bad = [];
  for (const re of BANNED) if (re.test(text)) bad.push(`names a franchise/agency (${re})`);
  if (IMITATION.test(text)) bad.push('asks for imitation');
  if (c.kind !== 'voice' && !/\bno (music|voices|intelligible|speech)|instrumental|no lyrics/i.test(c.prompt || '')) bad.push('states no exclusions (no music / no voices / instrumental)');
  return bad;
}

// ---- credit model ---------------------------------------------------------------------------------------------------
export function estimate(c, AUDIO, takesOverride) {
  const k = AUDIO.credits;
  const takes = takesOverride || c.takes || 1;
  if (c.kind === 'sfx') return takes * Math.max(k.sfxPerGeneration, Math.ceil(k.sfxPerSecond * c.seconds));
  if (c.kind === 'music') return Math.ceil((c.seconds / 60) * k.musicPerMinute);
  return c.text.length * k.ttsPerChar;
}
const usd = (credits, per1k) => +(credits / 1000 * per1k).toFixed(4);

// ---- ledger ------------------------------------------------------------------------------------------------------------
function readLedger() {
  if (!fs.existsSync(LEDGER)) return { note: '', usdPer1kCredits: null, entries: [] };
  return JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
}
function appendLedger(entry, per1k) {
  const L = readLedger();
  L.usdPer1kCredits = per1k;
  L.entries.push(entry);
  fs.writeFileSync(LEDGER, JSON.stringify(L, null, 2) + '\n');
}
const ledgerUSD = (L) => L.entries.reduce((a, e) => a + (e.estUSD || 0), 0);

// ---- HTTP -----------------------------------------------------------------------------------------------------------------
let KEY = '';
class ApiError extends Error { constructor(status, msg, detail) { super(msg); this.status = status; this.detail = detail; } }
async function http(method, p, body, { binary = true } = {}) {
  const r = await fetch(API + p, { method, headers: { 'xi-api-key': KEY, 'content-type': 'application/json', accept: binary ? 'audio/mpeg, application/json' : 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const ct = r.headers.get('content-type') || '';
  if (!r.ok) {
    let detail = null, msg = '';
    try { detail = ct.includes('json') ? await r.json() : await r.text(); } catch { /* no body */ }
    const d = detail && typeof detail === 'object' ? detail.detail : detail;
    msg = d && typeof d === 'object' ? [d.status, d.message].filter(Boolean).join(': ') : String(d || '').slice(0, 200);
    throw new ApiError(r.status, `HTTP ${r.status} ${p.split('?')[0]}${msg ? ' (' + msg + ')' : ''}`, d);
  }
  if (!binary || ct.includes('json')) return r.json();
  return Buffer.from(await r.arrayBuffer());
}
async function balance() {   // credits used so far this period, or null when the key cannot read the subscription
  try { const s = await http('GET', '/v1/user/subscription', undefined, { binary: false }); return { used: s.character_count, limit: s.character_limit, tier: s.tier, reset: s.next_character_count_reset_unix }; } catch { return null; }
}

// ---- the work -------------------------------------------------------------------------------------------------------------
function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('ffmpeg: ' + (r.stderr || r.error || '').toString().slice(0, 200));
}

// Mock: short generated test tones, so the whole chain (measure, manifest, sounds page) runs without the API.
function mockCue(c, out) {
  let h = 2166136261;
  for (const ch of c.tag) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const f = 220 + ((h >>> 0) % 660);
  const d = Math.min(c.seconds, c.kind === 'music' ? 6 : 4);
  const fade = (st, len) => `afade=t=out:st=${Math.max(0, st).toFixed(2)}:d=${len.toFixed(2)}`;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (c.tag.startsWith('hit-') || c.tag === 'leader-down') {   // a transient: noise burst with a fast decay (high crest)
    ffmpeg(['-f', 'lavfi', '-i', `anoisesrc=d=${d}:c=brown:a=0.9`, '-af', `afade=t=in:d=0.002,afade=t=out:st=0.01:d=${Math.min(0.4, d - 0.02)}`, '-ar', '44100', '-b:a', '128k', out]);
  } else if (c.kind === 'sfx' && /whoosh|swell|burn|shuffle|draw|discard|stinger/.test(c.tag)) {
    ffmpeg(['-f', 'lavfi', '-i', `anoisesrc=d=${d}:c=pink:a=0.35`, '-af', `afade=t=in:d=${(d * 0.4).toFixed(2)},${fade(d * 0.7, d * 0.3)}`, '-ar', '44100', '-b:a', '128k', out]);
  } else {
    ffmpeg(['-f', 'lavfi', '-i', `sine=frequency=${f}:duration=${d}`, '-af', `volume=0.5,${fade(d - 0.25, 0.25)}`, '-ar', '44100', '-b:a', '128k', out]);
  }
}

async function callWithRetry(label, fn, { tag, kind, estCredits, per1k, record }) {
  let before = await balance();
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await fn();
      return { result, before };
    } catch (e) {
      const retryable = e instanceof ApiError ? e.status >= 500 || e.status === 429 : /fetch failed|network|ECONN|ETIMEDOUT/i.test(e.message);
      // a failed attempt may still have been charged: record what the balance says
      const after = await balance();
      if (before && after && after.used > before.used) {
        const credits = after.used - before.used;
        if (record) appendLedger({ date: new Date().toISOString(), tag, kind, credits, estUSD: usd(credits, per1k), measured: true, note: `failed attempt ${attempt}: ${e.message}` }, per1k);
        console.log(`  ${label}: attempt ${attempt} failed but the balance shows ${credits} credits charged (recorded)`);
      }
      before = after || before;
      if (!retryable || attempt >= 3) { e.attempts = attempt; throw e; }
      const wait = attempt === 1 ? 2000 : 6000;
      console.log(`  ${label}: ${e.message}; backing off ${wait / 1000} s (attempt ${attempt} of 3)`);
      await sleep(wait);
    }
  }
}

function patchVoiceId(id) {
  const src = fs.readFileSync(CUES_FILE, 'utf8');
  const re = /(\/\/ VOICE_ID[^\n]*\n\s*id: )(null|'[^']*')/;
  if (!re.test(src)) throw new Error('data/audio-cues.js: the "// VOICE_ID" line with `id:` is missing');
  fs.writeFileSync(CUES_FILE, src.replace(re, `$1'${id}'`));
}

async function designVoice(AUDIO, per1k) {
  const v = AUDIO.voice;
  console.log(`voice: designing an original voice "${v.name}" (Voice Design, not a clone)`);
  const b0 = await balance();
  const { result: prev } = await callWithRetry('voice-design', async () => {
    try { return await http('POST', '/v1/text-to-voice/design', { voice_description: v.design, text: v.sample, model_id: 'eleven_multilingual_ttv_v2' }, { binary: false }); }
    catch (e) { if (e.status !== 404) throw e; return http('POST', '/v1/text-to-voice/create-previews', { voice_description: v.design, text: v.sample }, { binary: false }); }
  }, { tag: 'voice-design', kind: 'voice', per1k, record: true });
  const p = (prev.previews || [])[0];
  if (!p || !p.generated_voice_id) throw new Error('voice design returned no preview');
  if (p.audio_base_64) { fs.mkdirSync(MASTERS, { recursive: true }); fs.writeFileSync(path.join(MASTERS, 'voice-design-preview.mp3'), Buffer.from(p.audio_base_64, 'base64')); }
  const { result: made } = await callWithRetry('voice-create', async () => {
    try { return await http('POST', '/v1/text-to-voice', { voice_name: v.name, voice_description: v.design, generated_voice_id: p.generated_voice_id }, { binary: false }); }
    catch (e) { if (e.status !== 404) throw e; return http('POST', '/v1/text-to-voice/create-voice-from-preview', { voice_name: v.name, voice_description: v.design, generated_voice_id: p.generated_voice_id }, { binary: false }); }
  }, { tag: 'voice-create', kind: 'voice', per1k, record: false });
  if (!made.voice_id) throw new Error('voice creation returned no voice_id');
  patchVoiceId(made.voice_id);
  console.log(`voice: created, id recorded in data/audio-cues.js (the id is not a secret)`);
  const b1 = await balance();
  const measured = !!(b0 && b1 && b1.used >= b0.used);
  const credits = measured ? b1.used - b0.used : AUDIO.credits.voiceDesign;
  appendLedger({ date: new Date().toISOString(), tag: 'voice-design', kind: 'voice', credits, estUSD: usd(credits, per1k), measured }, per1k);
  return made.voice_id;
}

async function generate(c, AUDIO, voiceId, opts) {
  if (c.kind === 'sfx') {
    return http('POST', `/v1/sound-generation?output_format=${OUTPUT_FORMAT}`, { text: c.prompt, duration_seconds: c.seconds, prompt_influence: c.influence ?? 0.5, model_id: 'eleven_text_to_sound_v2', loop: !!c.loop });
  }
  if (c.kind === 'music') {
    return http('POST', `/v1/music?output_format=${OUTPUT_FORMAT}`, { prompt: c.prompt, music_length_ms: Math.round(c.seconds * 1000), model_id: opts.musicModel, force_instrumental: true });
  }
  return http('POST', `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${OUTPUT_FORMAT}`, { text: c.text, model_id: AUDIO.voice.model, voice_settings: AUDIO.voice.settings });
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (k) => argv.includes('--' + k);
  const val = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
  const AUDIO = loadCues();
  const per1k = +(val('usd-per-1k', process.env.ELEVENLABS_USD_PER_1K || AUDIO.usdPer1kCredits));
  const mock = flag('mock'), dry = flag('dry-run'), force = flag('force');
  const takesOverride = val('takes') ? +val('takes') : 0;
  const masterDir = mock ? path.join(MASTERS, 'mock') : MASTERS;

  // lint first: a prompt that names a franchise or asks for imitation is a defect in the sheet, not a warning
  let lintBad = 0;
  for (const c of AUDIO.cues) for (const why of lintCue(c)) { console.log(`LINT ${c.tag}: ${why}`); lintBad++; }
  if (lintBad) { console.log('gen-audio: fix the cue sheet first'); process.exit(2); }

  if (flag('probe')) {
    if (!process.env.ELEVENLABS_API_KEY) { console.log('probe: ELEVENLABS_API_KEY is not set in this environment (PLAN D17)'); process.exit(2); }
    KEY = process.env.ELEVENLABS_API_KEY;
    const s = await http('GET', '/v1/user/subscription', undefined, { binary: false });
    const left = s.character_limit - s.character_count;
    const plan = AUDIO.cues.reduce((a, c) => a + estimate(c, AUDIO, takesOverride), 0) + AUDIO.credits.voiceDesign;
    console.log(`probe: tier ${s.tier}, status ${s.status}; credits used ${s.character_count} of ${s.character_limit} (${left} left)` + (s.next_character_count_reset_unix ? `; resets ${new Date(s.next_character_count_reset_unix * 1000).toISOString().slice(0, 10)}` : ''));
    console.log(`probe: the full cue sheet needs about ${plan} credits (${plan <= left ? 'fits' : 'DOES NOT fit'} the credits left); list price per 1k credits by tier: starter 0.20, creator 0.18, pro 0.165 (docs/audio.md)`);
    console.log(`probe: music access is not shown here; the first music call says so`);
    return;
  }

  // ---- select ---------------------------------------------------------------------------------------------------------------
  let cues = AUDIO.cues.slice();
  const kind = val('kind');
  if (kind) cues = cues.filter((c) => c.kind === kind);
  const only = flag('samples') ? SAMPLE_TAGS : val('only') ? val('only').split(',') : null;
  if (only) {
    for (const t of only) if (!AUDIO.byTag[t]) { console.log(`gen-audio: unknown tag ${t}`); process.exit(2); }
    cues = cues.filter((c) => only.includes(c.tag));
  }
  const have = (c) => fs.existsSync(path.join(masterDir, c.tag + '.mp3')) && fs.statSync(path.join(masterDir, c.tag + '.mp3')).size > 0;
  let todo = cues.filter((c) => force || !have(c));
  if (val('limit')) todo = todo.slice(0, +val('limit'));

  // ---- plan -------------------------------------------------------------------------------------------------------------------
  const voiceId = val('voice-id') || process.env.ELEVENLABS_VOICE_ID || AUDIO.voice.id;
  const needDesign = !mock && !voiceId && todo.some((c) => c.kind === 'voice');
  const rows = todo.map((c) => ({ c, credits: estimate(c, AUDIO, takesOverride) }));
  const designCredits = needDesign ? AUDIO.credits.voiceDesign : 0;
  const total = rows.reduce((a, r) => a + r.credits, 0) + designCredits;
  const L = readLedger();
  const spent = ledgerUSD(L);
  console.log(`gen-audio ${mock ? '[mock] ' : ''}${dry ? '[dry-run] ' : ''}plan: ${todo.length} of ${cues.length} cues to make (${cues.length - todo.length} already have a master)`);
  for (const { c, credits } of rows) {
    const what = c.kind === 'voice' ? `"${c.text}"` : `${c.seconds}s${c.loop ? ' loop' : ''}`;
    console.log(`  ${c.kind.padEnd(5)} ${c.tag.padEnd(16)} ${what.padEnd(14)} ${String(credits).padStart(6)} cr  $${usd(credits, per1k).toFixed(3)}${(takesOverride || c.takes) > 1 && c.kind === 'sfx' ? `  (${takesOverride || c.takes} takes)` : ''}`);
  }
  if (needDesign) console.log(`  voice design for the announcer (original voice)   ${String(designCredits).padStart(6)} cr  $${usd(designCredits, per1k).toFixed(3)}`);
  const byKind = {};
  for (const r of rows) byKind[r.c.kind] = (byKind[r.c.kind] || 0) + r.credits;
  const estUSD = usd(total, per1k);
  console.log(`  total: ${total} credits = $${estUSD.toFixed(2)} at $${per1k.toFixed(3)} per 1k credits (` + Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(', ') + ')');
  console.log(`  ledger so far $${spent.toFixed(2)} + this run $${estUSD.toFixed(2)} = $${(spent + estUSD).toFixed(2)} of the $${AUDIO.budgetUSD} audio budget (PLAN D6)`);
  if (!mock && spent + estUSD > AUDIO.budgetUSD) { console.log(`REFUSED: the estimate passes the audio budget of $${AUDIO.budgetUSD}`); process.exit(3); }
  if (dry) { console.log('dry-run: nothing was sent' + (process.env.ELEVENLABS_API_KEY ? '' : ' (no key needed)')); return; }
  if (!todo.length) { console.log('nothing to do'); return; }

  // ---- mock ---------------------------------------------------------------------------------------------------------------------
  if (mock) {
    for (const c of todo) {
      const out = path.join(masterDir, c.tag + '.mp3');
      mockCue(c, out);
      console.log(`mock ${c.tag} -> ${path.relative(ROOT, out)}`);
    }
    console.log(`mock: ${todo.length} test tones written; ledger and cue sheet untouched; MOCK TONES ARE NOT THE GAME'S AUDIO`);
    return;
  }

  // ---- paid run -------------------------------------------------------------------------------------------------------------------
  if (!process.env.ELEVENLABS_API_KEY) { console.log('gen-audio: ELEVENLABS_API_KEY is not set in this environment (PLAN D17). Use --dry-run or --mock until it is.'); process.exit(2); }
  KEY = process.env.ELEVENLABS_API_KEY;
  if (!flag('yes')) { console.log('paid run starts in 5 s (Ctrl-C to stop; --yes skips this)'); await sleep(5000); }
  const opts = { musicModel: val('music-model', 'music_v1') };
  fs.mkdirSync(MASTERS, { recursive: true });
  let vid = voiceId;
  const failed = [], pendingNote = [];
  let made = 0;

  for (const c of todo) {
    if (c.kind === 'voice' && !vid) {
      try { vid = await designVoice(AUDIO, per1k); } catch (e) { console.log(`FAILED voice design: ${e.message}`); failed.push('voice-design'); break; }
    }
    const out = path.join(MASTERS, c.tag + '.mp3');
    if (force && fs.existsSync(out)) {   // never throw a paid take away: archive it
      fs.mkdirSync(ARCHIVE, { recursive: true });
      fs.renameSync(out, path.join(ARCHIVE, `${c.tag}.${new Date().toISOString().replace(/[:.]/g, '-')}.mp3`));
    }
    const takes = c.kind === 'sfx' ? (takesOverride || c.takes || 1) : 1;
    const est = estimate(c, AUDIO, takesOverride);
    const files = [];
    try {
      for (let i = 0; i < takes; i++) {
        const { result: buf, before } = await callWithRetry(`${c.tag}${takes > 1 ? ' take ' + (i + 1) : ''}`, () => generate(c, AUDIO, vid, opts), { tag: c.tag, kind: c.kind, per1k, record: true });
        const after = await balance();
        const measured = before && after && after.used >= before.used;
        const credits = measured ? after.used - before.used : Math.round(est / takes);
        const f = takes > 1 ? path.join(MASTERS, `${c.tag}.take${i + 1}.mp3`) : out;
        fs.writeFileSync(f, buf);
        files.push(f);
        appendLedger({ date: new Date().toISOString(), tag: c.tag, kind: c.kind, credits, estUSD: usd(credits, per1k), measured: !!measured }, per1k);
        console.log(`made ${c.tag}${takes > 1 ? ' take ' + (i + 1) : ''}: ${credits} credits${measured ? '' : ' (estimated)'}`);
      }
      if (takes > 1) {   // keep the take with the most transient (highest crest factor); the rest stay as take files
        const { analyse } = await import('./measure-audio.mjs');
        const scored = files.map((f) => ({ f, crest: analyse(f).crest }));
        scored.sort((a, b) => b.crest - a.crest);
        fs.copyFileSync(scored[0].f, out);
        console.log(`  ${c.tag}: kept ${path.basename(scored[0].f)} (crest ${scored[0].crest.toFixed(1)}; others ${scored.slice(1).map((s) => s.crest.toFixed(1)).join(', ')})`);
      }
      made++;
    } catch (e) {
      if (c.kind === 'music' && e instanceof ApiError && [400, 402, 403, 404, 422].includes(e.status)) {
        console.log(`PENDING ${c.tag}: Eleven Music refused the request (${e.message}). This plan may lack music access (or the model id is wrong: --music-model). The cue stays pending; nothing was charged for it.`);
        pendingNote.push(c.tag);
        continue;
      }
      console.log(`FAILED ${c.tag}: ${e.message}${e.attempts ? ` (after ${e.attempts} attempt${e.attempts > 1 ? 's' : ''})` : ''}`);
      failed.push(c.tag);
      if (!(e instanceof ApiError) || e.status >= 500 || e.status === 401 || e.status === 429) { console.log('stopping the run: a failing service or key is not retried across cues'); break; }
    }
  }
  const L2 = readLedger();
  console.log(`gen-audio: ${made} made, ${pendingNote.length} pending (${pendingNote.join(', ') || '-'}), ${failed.length} failed (${failed.join(', ') || '-'}). Ledger total $${ledgerUSD(L2).toFixed(2)} of $${AUDIO.budgetUSD}. Next: node tools/measure-audio.mjs. Not verified by ear.`);
  if (failed.length) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.log('gen-audio: ' + (e && e.message ? e.message : e)); process.exit(1); });
}
