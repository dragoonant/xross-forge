#!/usr/bin/env node
// Generates the cue sheet (data/audio-cues.js) on the owner's LOCAL Audio Studio (PLAN D18) instead of
// ElevenLabs: the same tags, masters and ledger as tools/gen-audio.mjs, so tools/measure-audio.mjs,
// XS.Audio and sounds.html need no change.
//   sfx    Stable Audio Open 1.0   POST /api/jobs {mode:'sfx', prompt, negative, seconds, steps, guidance, batch, seed}
//   music  ACE-Step 1.5 turbo      POST /api/jobs {mode:'music', prompt, lyrics:'[Instrumental]', duration, steps, bpm, key, timesig, language, batch, seed}
//   voice  Qwen3-TTS (Apache-2.0)  the announcer is an ORIGINAL voice (PLAN D2): designed once from AUDIO.voice.design with
//          Voice Design (model 'qwen-design') into audio/masters/voice-design-preview.wav, then every line is spoken by
//          that same designed voice (model 'qwen-clone' with the preview as the reference). Never a real person's voice.
// Studio: AUDIO_STUDIO_URL (default http://localhost:7890); `node server.js` in the 3D Model Generation repo's audio-studio.
//
//   node tools/gen-audio-local.mjs [--dry-run] [--only a,b] [--kind sfx|music|voice] [--limit N] [--force] [--takes N]
//
// Per cue: the studio renders `takes` candidates (sfx: 2-4, music: 2, voice: 1); each is decoded (ffmpeg) and scored by
// numbers only (sfx: crest factor toward the cue's crestMin or 6, length toward `seconds`; music: little silence, steady
// envelope, length), and the best becomes the master audio/masters/<tag>.mp3 (gitignored; 192 kbps, untrimmed:
// measure-audio.mjs trims, loop-crossfades, normalises and encodes the delivery file). Idempotent: an existing master is
// skipped; --force archives it to audio/archive/<tag>-<time>.mp3 first. Every render appends a $0 entry to
// docs/audio-ledger.json (provider "audio-studio-local", credits 0). NOT VERIFIED BY EAR (sounds.html).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUDIO = (process.env.AUDIO_STUDIO_URL || 'http://localhost:7890').replace(/\/$/, '');
const MASTERS = path.join(ROOT, 'audio/masters'), ARCHIVE = path.join(ROOT, 'audio/archive'), LEDGER = path.join(ROOT, 'docs/audio-ledger.json');
const SR = 44100;
const argv = process.argv.slice(2);
const has = (f) => argv.includes('--' + f);
const val = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const dry = has('dry-run'), force = has('force');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadCues() {
  const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'data/audio-cues.js'), 'utf8'), ctx, { filename: 'data/audio-cues.js' });
  return ctx.XS.AUDIO;
}
const AUDIO = loadCues();
function seedOf(tag) { let h = 2166136261; for (const ch of 'audio:' + tag) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) % 2147483647; }
const NEG = 'music, melody, voice, speech, talking, singing, reverb wash, hiss, static noise, distortion';
const NEG_MUSICAL = 'voice, speech, talking, lyrics, hiss, static noise, distortion';
const takesOverride = val('takes', null) ? +val('takes') : null;

function params(c) {
  if (c.kind === 'sfx') {
    const musical = /chime|sting|fanfare|synth|chord|note/i.test(c.prompt);
    const crowd = /crowd|stadium/i.test(c.prompt);
    return { mode: 'sfx', prompt: c.prompt, negative: crowd ? 'music, melody, clear speech, singing, hiss, static noise, distortion' : musical ? NEG_MUSICAL : NEG,
      seconds: Math.max(1, c.seconds + 0.5), steps: 50, guidance: 5, batch: Math.min(4, Math.max(2, takesOverride || c.takes || 2)), seed: seedOf(c.tag) };
  }
  if (c.kind === 'music') {
    const bpm = (/(\d{2,3})\s*bpm/i.exec(c.prompt) || [])[1];
    return { mode: 'music', prompt: c.prompt, lyrics: '[Instrumental]', duration: Math.min(240, c.seconds + (c.loop ? 4 : 2)), steps: 8,
      bpm: bpm ? +bpm : 110, key: /defeat|sombre|minor/i.test(c.prompt) ? 'D minor' : 'A minor', timesig: '4', language: 'en', batch: 2, seed: seedOf(c.tag) };
  }
  return null;   // voice: built in voiceParams once the design preview exists
}

// ---------------------------------------------------------------- studio
async function postJob(p) {
  for (let i = 0; i < 60; i++) {
    const r = await fetch(STUDIO + '/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) });
    if ([409, 429, 503].includes(r.status)) { await sleep(5000); continue; }
    const j = await r.json(); if (!r.ok) throw new Error('POST /api/jobs ' + r.status + ' ' + (j.error || '')); return j;
  }
  throw new Error('studio stayed busy');
}
async function waitJob(id) {
  const q0 = Date.now(); let r0 = 0;
  for (;;) {
    await sleep(1500);
    const j = await (await fetch(STUDIO + '/api/jobs/' + id)).json();
    if (j.status === 'done') return j;
    if (j.status === 'failed' || j.status === 'cancelled') throw new Error('job ' + j.status + ': ' + (j.error || (j.log || []).slice(-2).join(' | ')));
    if (j.status === 'running') { if (!r0) r0 = Date.now(); if (Date.now() - r0 > 6 * 60 * 1000) { await fetch(STUDIO + '/api/jobs/' + id + '/cancel', { method: 'POST' }).catch(() => {}); throw new Error('running > 6 min, cancelled'); } }
    else if (Date.now() - q0 > 15 * 60 * 1000) { await fetch(STUDIO + '/api/jobs/' + id + '/cancel', { method: 'POST' }).catch(() => {}); throw new Error('queued > 15 min, cancelled'); }
  }
}
async function runJob(p) {
  for (let attempt = 1; ; attempt++) {
    try {
      const j = await waitJob((await postJob(p)).id);
      const files = [];
      for (const name of j.audios || []) { const r = await fetch(STUDIO + '/files/' + j.id + '/' + name); if (!r.ok) throw new Error('download ' + name + ' ' + r.status); files.push({ name, buf: Buffer.from(await r.arrayBuffer()) }); }
      if (!files.length) throw new Error('job returned no audio');
      return { job: j.id, files };
    } catch (e) { if (attempt >= 2) throw e; console.log('  retrying once: ' + e.message); await sleep(5000); }
  }
}

// ---------------------------------------------------------------- dsp (scoring only; measure-audio does the delivery)
function ff(args, input) {
  return new Promise((res, rej) => {
    const p = spawn('ffmpeg', ['-v', 'error', ...args]); const out = []; let err = '';
    p.stdout.on('data', (c) => out.push(c)); p.stderr.on('data', (c) => { err += c; }); p.on('error', rej);
    p.on('exit', (code) => code === 0 ? res(Buffer.concat(out)) : rej(new Error('ffmpeg ' + code + ' ' + err.slice(0, 200))));
    if (input) p.stdin.end(input); else p.stdin.end();
  });
}
async function decode(buf) { const b = await ff(['-i', 'pipe:0', '-f', 'f32le', '-ac', '1', '-ar', String(SR), 'pipe:1'], buf); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); }
async function toMp3(buf, out) { fs.mkdirSync(path.dirname(out), { recursive: true }); await ff(['-i', 'pipe:0', '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', String(SR), '-y', out], buf); }
const peakOf = (p) => { let m = 0; for (const v of p) { const a = Math.abs(v); if (a > m) m = a; } return m; };
const rmsOf = (p) => { let s = 0; for (const v of p) s += v * v; return Math.sqrt(s / Math.max(1, p.length)); };
function trimmed(p) { const thr = Math.max(0.0015, peakOf(p) * 0.003); let a = 0, b = p.length; while (a < b && Math.abs(p[a]) < thr) a++; while (b > a && Math.abs(p[b - 1]) < thr) b--; return p.subarray(a, b); }
function silentFrac(p) { const w = Math.round(SR * 0.25); let s = 0, n = 0; const pk = peakOf(p); for (let i = 0; i + w <= p.length; i += w, n++) if (rmsOf(p.subarray(i, i + w)) < pk * 0.01) s++; return n ? s / n : 1; }
function envVar(p) { const w = SR, env = []; for (let i = 0; i + w <= p.length; i += w) env.push(rmsOf(p.subarray(i, i + w))); const m = env.reduce((a, b) => a + b, 0) / Math.max(1, env.length); return m ? Math.sqrt(env.reduce((a, b) => a + (b - m) ** 2, 0) / env.length) / m : 9; }
function score(pcm, c) {
  const p = trimmed(pcm), pk = peakOf(p), r = rmsOf(p), crest = r ? pk / r : 99, len = p.length / SR;
  if (c.kind === 'sfx') {
    const target = Math.max(6, (c.crestMin || 0) * 1.5);
    let s = Math.abs(Math.log(crest / target)) + 0.6 * Math.abs(Math.log(Math.max(0.05, len) / Math.max(0.3, c.seconds)));
    if (c.crestMin && crest < c.crestMin) s += 3;
    if (pk < 0.01) s += 9;
    return { s, crest, len };
  }
  return { s: silentFrac(p) * 4 + envVar(p) + Math.abs(len - c.seconds) / c.seconds, crest, len };
}

// ---------------------------------------------------------------- ledger
function appendLedger(entry) {
  const L = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : { note: '', usdPer1kCredits: null, entries: [] };
  L.entries.push(entry);
  fs.writeFileSync(LEDGER, JSON.stringify(L, null, 2) + '\n');
}

// ---------------------------------------------------------------- the announcer
const PREVIEW_WAV = path.join(MASTERS, 'voice-design-preview.wav');
async function ensureVoice() {
  if (fs.existsSync(PREVIEW_WAV) && !force) return;
  const v = AUDIO.voice;
  console.log('[gen-audio-local] designing the announcer voice (Qwen3-TTS Voice Design, original; PLAN D2)');
  const { job, files } = await runJob({ mode: 'voice', model: 'qwen-design', text: v.sample, instruct: v.design, language: 'en', seed: seedOf('voice-design') });
  const wav = files.find((f) => /\.wav$/i.test(f.name)) || files[0];
  fs.mkdirSync(MASTERS, { recursive: true });
  fs.writeFileSync(PREVIEW_WAV, wav.buf);
  await toMp3(wav.buf, path.join(MASTERS, 'voice-design-preview.mp3'));
  appendLedger({ date: new Date().toISOString(), tag: 'voice-design', kind: 'voice', credits: 0, estUSD: 0, measured: false, provider: 'audio-studio-local', model: 'qwen-design', job });
}
const voiceParams = (c) => ({ mode: 'voice', model: 'qwen-clone', text: c.text, language: 'en', refText: AUDIO.voice.sample,
  ref: 'data:audio/wav;base64,' + fs.readFileSync(PREVIEW_WAV).toString('base64'), seed: seedOf(c.tag) });

// ---------------------------------------------------------------- main
const kind = val('kind', null), only = val('only', null) ? val('only').split(',') : null, limit = val('limit', null) ? +val('limit') : 9999;
let cues = AUDIO.cues.filter((c) => !kind || c.kind === kind).filter((c) => !only || only.includes(c.tag));
if (only) for (const t of only) if (!AUDIO.byTag[t]) { console.log('gen-audio-local: unknown tag ' + t); process.exit(2); }
let made = 0, skipped = 0; const failed = []; const t0 = Date.now();
for (const c of cues) {
  if (made >= limit) break;
  const master = path.join(MASTERS, c.tag + '.mp3');
  if (fs.existsSync(master) && !force) { skipped++; continue; }
  if (dry) { console.log('[dry-run] ' + c.kind + '/' + c.tag + ' ' + JSON.stringify(c.kind === 'voice' ? { mode: 'voice', model: 'qwen-clone', text: c.text } : params(c)).slice(0, 220)); made++; continue; }
  const t1 = Date.now();
  try {
    if (c.kind === 'voice') await ensureVoice();
    if (force && fs.existsSync(master)) { fs.mkdirSync(ARCHIVE, { recursive: true }); fs.renameSync(master, path.join(ARCHIVE, c.tag + '-' + Date.now() + '.mp3')); }
    const p = c.kind === 'voice' ? voiceParams(c) : params(c);
    const { job, files } = await runJob(p);
    let best = null; const takes = [];
    for (const [i, f] of files.entries()) {
      const sc = c.kind === 'voice' ? { s: 0, crest: 0, len: 0 } : score(await decode(f.buf), c);
      takes.push({ take: i, score: +sc.s.toFixed(3), crest: +sc.crest.toFixed(2), seconds: +sc.len.toFixed(2) });
      if (!best || sc.s < best.sc.s) best = { i, f, sc };
    }
    await toMp3(best.f.buf, master);
    made++;
    appendLedger({ date: new Date().toISOString(), tag: c.tag, kind: c.kind, credits: 0, estUSD: 0, measured: false, provider: 'audio-studio-local',
      model: c.kind === 'sfx' ? 'stable-audio-open-1.0' : c.kind === 'music' ? 'ace-step-1.5-turbo' : 'qwen3-tts-clone-of-designed-voice', job, take: best.i, takes, seed: p.seed });
    console.log('[gen-audio-local] ' + c.kind + '/' + c.tag + ': take ' + best.i + '/' + files.length + (c.kind === 'voice' ? '' : ', ' + best.sc.len.toFixed(2) + ' s, crest ' + best.sc.crest.toFixed(1)) + ', ' + ((Date.now() - t1) / 1000).toFixed(0) + ' s wall');
  } catch (e) { failed.push(c.tag); console.log('[gen-audio-local] FAILED ' + c.tag + ': ' + e.message); }
}
console.log('[gen-audio-local] ' + (dry ? 'dry-run: ' : '') + made + ' made, ' + skipped + ' present, ' + failed.length + ' failed' + (failed.length ? ' [' + failed.join(', ') + ']' : '') + ', ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s. Not verified by ear.');
console.log('REMAINING ' + AUDIO.cues.filter((c) => !fs.existsSync(path.join(MASTERS, c.tag + '.mp3'))).length);
if (failed.length) process.exitCode = 1;
