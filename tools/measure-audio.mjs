#!/usr/bin/env node
// Masters -> delivery files + the sound manifest (M6). Needs ffmpeg and ffprobe on PATH. Not verified by ear.
//   node tools/measure-audio.mjs [--only a,b] [--force] [--mock] [--report]
//
// Per cue with a master in audio/masters/<tag>.mp3 (gitignored):
//   1. decode to float PCM (48 kHz; stereo for music, mono for sfx and voice);
//   2. trim leading silence (5 ms pre-roll kept) and trailing silence (60 ms tail kept);
//   3. sfx/voice: 2 ms fade-in, fade-out of 12% of the clip (15..250 ms); music stings: 400 ms fade-out;
//      music loops: a 1.5 s equal-power crossfade of the tail into the head, so the seam cannot click;
//   4. loudness-normalise to a common target per kind (K-weighted, BS.1770 filters, UNGATED over the whole clip,
//      because most sfx are shorter than the 400 ms gating block): sfx -18 LUFS, voice -18, music loops -22,
//      music stings -18; the gain is capped so the sample peak stays at or under -1.5 dBFS (high-crest hits
//      therefore end up quieter than the target, which is how real impacts behave; `capped` is reported);
//   5. encode: sfx and voice mono 96 kbps, music stereo 128 kbps, mp3 (iOS Safari decodes it everywhere);
//   6. measure the delivered file and report LUFS, peak, crest factor (peak / RMS, linear). KB card-games.md section 6:
//      AI-generated hits come back with a crest factor near 2 where real impacts are 8-20, so a cue with `crestMin`
//      below its minimum is flagged `low-crest` (the audition page shows it).
// Then data/sound-manifest.js is rewritten (GENERATED) from every delivery file present:
//   XS.SOUNDS[tag] = {tag, file, seconds, gain, lufs, peak, crest, flags}. `gain` is the cue sheet's mix gain.
// A cue with no master is pending: it has no manifest entry, XS.Audio reports it once, sounds.html lists it.
// --mock reads audio/masters/mock/ (tools/gen-audio.mjs --mock) and writes under audio/masters/mock-out/ and a
// manifest marked mock:true; remove those with --clean-mock.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SR = 48000;
const PEAK_CEIL = Math.pow(10, -1.5 / 20);
const TARGET = { sfx: -18, voice: -18, musicLoop: -22, musicOnce: -18 };
const MANIFEST = path.join(ROOT, 'data/sound-manifest.js');

function run(cmd, args, input) {
  const r = spawnSync(cmd, args, { input, maxBuffer: 1 << 29 });
  if (r.error) throw new Error(`${cmd}: ${r.error.message} (is it installed?)`);
  if (r.status !== 0) throw new Error(`${cmd} ${r.status}: ${String(r.stderr).slice(0, 300)}`);
  return r.stdout;
}
function decode(file, channels) {
  const b = run('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', String(channels), '-ar', String(SR), 'pipe:1']);
  const all = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const n = Math.floor(all.length / channels), ch = [];
  for (let c = 0; c < channels; c++) { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = all[i * channels + c]; ch.push(a); }
  return ch;
}
function encode(chs, out, kbps) {
  const n = chs[0].length, ic = chs.length, inter = new Float32Array(n * ic);
  for (let c = 0; c < ic; c++) for (let i = 0; i < n; i++) inter[i * ic + c] = chs[c][i];
  fs.mkdirSync(path.dirname(out), { recursive: true });
  run('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', String(ic), '-i', 'pipe:0', '-c:a', 'libmp3lame', '-b:a', kbps + 'k', '-ar', '44100', '-ac', String(ic), out], Buffer.from(inter.buffer));
}

// ---- measurement ------------------------------------------------------------------------------------------------
function kWeight(x) {   // ITU-R BS.1770 pre-filter then RLB high-pass, 48 kHz coefficients
  const bq = (b, a, v) => { const o = new Float32Array(v.length); let z1 = 0, z2 = 0; for (let i = 0; i < v.length; i++) { const y = b[0] * v[i] + z1; z1 = b[1] * v[i] - a[1] * y + z2; z2 = b[2] * v[i] - a[2] * y; o[i] = y; } return o; };
  return bq([1, -2, 1], [1, -1.99004745483398, 0.99007225036621], bq([1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585], x));
}
export function measure(chs) {
  let peak = 0, sumSq = 0, n = 0, k = 0;
  for (const c of chs) {
    for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > peak) peak = a; sumSq += c[i] * c[i]; }
    n += c.length;
    const w = kWeight(c); let s = 0; for (let i = 0; i < w.length; i++) s += w[i] * w[i];
    k += s / Math.max(1, w.length);
  }
  const rms = Math.sqrt(sumSq / Math.max(1, n));
  return { seconds: chs[0].length / SR, peak, rms, crest: rms > 0 ? peak / rms : 0, lufs: k > 0 ? -0.691 + 10 * Math.log10(k) : -Infinity };
}
// Decode a file and measure it (mono mixdown is not used: channels are summed as BS.1770 does).
export function analyse(file) {
  const ch = decode(file, 1);
  return measure(ch);
}

// ---- shaping ------------------------------------------------------------------------------------------------------
const peakOf = (chs) => { let m = 0; for (const c of chs) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > m) m = a; } return m; };
function trim(chs) {
  const pk = peakOf(chs), thr = Math.max(0.0015, pk * 0.003), n = chs[0].length;
  let a = 0; while (a < n && chs.every((c) => Math.abs(c[a]) < thr)) a++;
  a = Math.max(0, a - Math.round(SR * 0.005));
  const w = Math.round(SR * 0.02), et = Math.max(0.001, pk * 0.0056);
  let end = n;
  for (let i = n - w; i > a; i -= w) { let s = 0; for (const c of chs) for (let j = i; j < i + w; j++) s += c[j] * c[j]; if (Math.sqrt(s / (w * chs.length)) > et) { end = i + w; break; } }
  end = Math.min(n, end + Math.round(SR * 0.06));
  return chs.map((c) => c.slice(a, end));
}
function fade(chs, inMs, outMs) {
  return chs.map((c) => {
    const o = Float32Array.from(c), fi = Math.min(o.length, Math.round(SR * inMs / 1000)), fo = Math.min(o.length, Math.round(SR * outMs / 1000));
    for (let i = 0; i < fi; i++) o[i] *= i / fi;
    for (let i = 0; i < fo; i++) o[o.length - 1 - i] *= i / fo;
    return o;
  });
}
function loopSeam(chs, sec = 1.5) {   // equal-power crossfade of the tail into the head
  return chs.map((p) => {
    const xf = Math.min(Math.round(SR * sec), Math.floor(p.length / 3)), n = p.length - xf, o = new Float32Array(n);
    o.set(p.subarray(0, n));
    for (let i = 0; i < xf; i++) { const t = i / xf; o[i] = p[i] * Math.sin(t * Math.PI / 2) + p[n + i] * Math.cos(t * Math.PI / 2); }
    return o;
  });
}
function scale(chs, g) { return chs.map((c) => c.map((v) => v * g)); }

// ---- main -----------------------------------------------------------------------------------------------------------
function loadCues() {
  const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'data/audio-cues.js'), 'utf8'), ctx, { filename: 'data/audio-cues.js' });
  return ctx.XS.AUDIO;
}
const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '-inf');

function main() {
  const argv = process.argv.slice(2);
  const flag = (k) => argv.includes('--' + k);
  const val = (k) => { const i = argv.indexOf('--' + k); return i < 0 ? null : argv[i + 1]; };
  const mock = flag('mock');
  const mastersDir = path.join(ROOT, 'audio/masters', mock ? 'mock' : '.');
  const outDir = mock ? path.join(ROOT, 'audio/masters/mock-out') : path.join(ROOT, 'audio');
  const webDir = mock ? 'audio/masters/mock-out' : 'audio';

  if (flag('clean-mock')) {
    for (const d of ['audio/masters/mock', 'audio/masters/mock-out']) fs.rmSync(path.join(ROOT, d), { recursive: true, force: true });
    writeManifest({}, false);
    console.log('measure-audio: mock masters and outputs removed, manifest reset to empty');
    return;
  }

  const AUDIO = loadCues();
  const only = val('only') ? val('only').split(',') : null;
  const manifest = {};
  const rows = [], pending = [], flagged = [];
  for (const c of AUDIO.cues) {
    const master = path.join(mastersDir, c.tag + '.mp3');
    const out = path.join(outDir, c.tag + '.mp3');
    const hasMaster = fs.existsSync(master) && fs.statSync(master).size > 0;
    if (!hasMaster && !fs.existsSync(out)) { pending.push(c.tag); continue; }
    if (hasMaster && (!only || only.includes(c.tag))) {
      const fresh = fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(master).mtimeMs;
      if (flag('force') || !fresh) {
        const stereo = c.kind === 'music';
        let p = trim(decode(master, stereo ? 2 : 1));
        if (c.kind === 'music') p = c.loop ? loopSeam(p) : fade(p, 5, 400);
        else p = fade(p, 2, Math.max(15, Math.min(250, p[0].length / SR * 120)));
        const m = measure(p);
        const target = c.kind === 'music' ? (c.loop ? TARGET.musicLoop : TARGET.musicOnce) : TARGET[c.kind];
        let g = Math.pow(10, (target - m.lufs) / 20);
        const gCap = m.peak > 0 ? PEAK_CEIL / m.peak : 1;
        const capped = g > gCap;
        if (capped) g = gCap;
        if (!Number.isFinite(g)) throw new Error(`${c.tag}: silent master`);
        encode(scale(p, g), out, c.kind === 'music' ? 128 : 96);
        c._capped = capped;
      }
    }
    // measure what is delivered, not what was intended
    const dm = measure(decode(out, c.kind === 'music' ? 2 : 1));
    const flags = [];
    if (dm.peak < 0.01) flags.push('silent');
    if (c.crestMin && dm.crest < c.crestMin) flags.push(`low-crest (${fmt(dm.crest)} < ${c.crestMin})`);
    if (c._capped) flags.push('peak-capped');
    const planned = c.kind === 'voice' ? null : c.seconds;
    if (planned && !c.loop && (dm.seconds < planned * 0.25 || dm.seconds > planned * 2.5)) flags.push(`length ${fmt(dm.seconds, 2)} s vs planned ${planned} s`);
    if (c.loop && dm.seconds < 8) flags.push('short loop');
    manifest[c.tag] = { tag: c.tag, file: `${webDir}/${c.tag}.mp3`, seconds: +dm.seconds.toFixed(2), gain: c.gain, lufs: +fmt(dm.lufs, 1), peak: +dm.peak.toFixed(3), crest: +dm.crest.toFixed(1), flags };
    rows.push({ tag: c.tag, kind: c.kind, ...manifest[c.tag] });
    if (flags.length) flagged.push(`${c.tag}: ${flags.join(', ')}`);
  }
  writeManifest(manifest, mock);

  console.log(`measure-audio${mock ? ' [mock]' : ''}: ${rows.length} delivered, ${pending.length} pending`);
  console.log('  tag               kind  secs   LUFS  peak  crest  flags');
  for (const r of rows) console.log(`  ${r.tag.padEnd(17)} ${r.kind.padEnd(5)} ${String(r.seconds).padStart(5)} ${String(r.lufs).padStart(6)} ${String(r.peak).padStart(5)} ${String(r.crest).padStart(6)}  ${r.flags.join('; ')}`);
  if (pending.length) console.log(`  pending (no master): ${pending.join(', ')}`);
  if (flagged.length) console.log(`flagged ${flagged.length}: needs an ear or a re-take (--force in gen-audio archives the old master)`);
  console.log('Not verified by ear: judge on sounds.html.');
}

function writeManifest(entries, mock) {
  const body = Object.keys(entries).sort().map((t) => `    ${JSON.stringify(t)}: ${JSON.stringify(entries[t])},`).join('\n');
  const src = `// GENERATED by tools/measure-audio.mjs from audio/masters/ (gitignored); do not edit by hand.
// One entry per audio file the page plays: XS.SOUNDS[tag] = {tag, file, seconds, gain, lufs, peak, crest, flags}.
//   tag     the cue tag in data/audio-cues.js (the cue sheet owns prompts, kinds and mix gain)
//   file    delivery mp3 (mono 96 kbps sfx/voice, stereo 128 kbps music), loudness-normalised
//   gain    mix level XS.Audio applies (the cue sheet's gain)
//   lufs, peak, crest, flags   measured on the delivered file (K-weighted, ungated; crest = peak / RMS, linear)
// A cue with no entry is pending: XS.Audio reports "audio pending: <tag>" once and coverage() lists it.
(function () {
  const XS = (globalThis.XS = globalThis.XS || {});
  XS.SOUNDS_META = { mock: ${mock ? 'true' : 'false'} };
  XS.SOUNDS = ${body ? '{\n' + body + '\n  }' : '{}'};
})();
`;
  fs.writeFileSync(MANIFEST, src);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { main(); } catch (e) { console.log('measure-audio: ' + e.message); process.exit(1); }
}
