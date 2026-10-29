// sounds.html: the audition page (M6). Every cue with play/stop, its measured loudness and crest, and the log
// events that trigger it; the music scenes; the real onLog path. Not verified by ear: the owner judges here.
// Cue rows audition the delivered file with an <audio> element at the manifest gain (so Stop works); the scene
// buttons and the event buttons go through XS.Audio, i.e. the code the game runs.
(function () {
  'use strict';
  const XS = globalThis.XS;
  for (const k of ['AUDIO', 'SOUNDS', 'AudioMap', 'Audio']) if (!XS[k]) throw new Error('sounds.html: XS.' + k + ' is not loaded');
  const A = XS.Audio, M = XS.AudioMap, CUES = XS.AUDIO.cues, S = XS.SOUNDS;

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const $ = (id) => document.getElementById(id);

  A.init();
  const gesture = () => A.unlock();
  document.addEventListener('pointerup', gesture, { capture: true, passive: true });   // XS.Audio keeps its own session-long listeners too

  if (XS.SOUNDS_META && XS.SOUNDS_META.mock) $('mock').hidden = false;

  function status() {
    const cov = A.coverage();
    $('coverage').textContent = `${cov.files} of ${cov.cues} cues have a file` + (cov.missing.length ? `; pending: ${cov.missing.join(', ')}` : '') + (cov.orphans.length ? `; files without a cue: ${cov.orphans.join(', ')}` : '') + '.';
    const d = A._debug();
    $('audio-state').textContent = d.available ? `AudioContext: ${d.state}; scene: ${d.scene || 'none'}; ${d.active} sfx playing; limited ${d.stats.limited}, deduped ${d.stats.deduped}, late ${d.stats.late}.` : `Audio unavailable here: ${d.reason}.`;
  }
  setInterval(status, 500);

  // ---- mix ---------------------------------------------------------------------------------------------------------
  const mix = $('mix');
  for (const k of ['master', 'sfx', 'music', 'voice']) {
    const lab = el('label', '', k + ' ');
    const r = el('input'); r.type = 'range'; r.min = 0; r.max = 1; r.step = 0.05; r.value = A.settings[k];
    r.addEventListener('input', () => { A.settings = { [k]: +r.value }; });
    lab.appendChild(r); mix.appendChild(lab);
  }
  { const lab = el('label', '', 'muted '); const c = el('input'); c.type = 'checkbox'; c.addEventListener('change', () => { A.settings = { muted: c.checked }; }); lab.appendChild(c); mix.appendChild(lab); }

  // ---- scenes ------------------------------------------------------------------------------------------------------
  const scenes = $('scenes');
  const sceneBtns = {};
  for (const name of Object.keys(M.SCENES)) {
    const b = el('button', '', name);
    b.addEventListener('click', () => { A.unlock(); A.setScene(name); for (const [n, x] of Object.entries(sceneBtns)) x.classList.toggle('on', n === name); });
    sceneBtns[name] = b; scenes.appendChild(b);
  }

  // ---- onLog simulator ---------------------------------------------------------------------------------------------
  const view = (o) => Object.assign({ viewer: 0, mode: 'full', needWins: 2, wins: [0, 0] }, o);
  const e = (type, data, seat) => ({ seq: 0, round: 1, turn: 1, seat: seat === undefined ? 0 : seat, type, data, via: null });
  const EVENTS = [
    ['draw', e('draw', { iid: 'c1', cardId: 'ST01-005', cause: 'turnStart' }), view()],
    ['play attack', e('play', { iid: 'c1', cardId: 'ST01-005', type: 'attack', cost: 2 }), view()],
    ['play memoria', e('play', { iid: 'c2', cardId: 'ST01-013', type: 'memoria', cost: 1 }), view()],
    ['pp spend', e('ppSpend', { n: 2, for: 'c1' }), view()],
    ['pp recover', e('ppRecover', { n: 3, requested: 3, cause: 'untap' }), view()],
    ['tactics reveal', e('tacticsPlay', { iid: 't1', cardId: 'ST01-020', subtype: 'consumption', cost: 0 }), view()],
    ['equip', e('equip', { iid: 't2', cardId: 'ST01-019', leader: 'L00', seat: 0, slot: 0 }), view()],
    ['boost armed', e('boost', { iid: 'c3', cardId: 'ST01-010', phase: 'armed' }), view()],
    ['attack', e('attack', { attackId: 1, seg: 0, card: 'c1', attacker: 'L00', target: 'L10', damage: 50, parts: { atk: 20, boost: 0, card: 30 } }), view()],
    ['damage 30', e('damage', { leader: 'L10', amount: 30, kind: 'attack', before: 0, after: 30 }, 1), view()],
    ['damage 60', e('damage', { leader: 'L10', amount: 60, kind: 'attack', before: 30, after: 90 }, 1), view()],
    ['damage 90', e('damage', { leader: 'L10', amount: 90, kind: 'effect', before: 0, after: 90 }, 1), view()],
    ['heal', e('heal', { leader: 'L00', amount: 20, requested: 20 }), view()],
    ['leader down', e('down', { leader: 'L10', seat: 1, slot: 0, cause: 'damage' }, 1), view()],
    ['AWAKEN', e('awaken', { leader: 'L00', seat: 0, slot: 0, cause: 'attack', atk: 40, hp: 120 }), view()],
    ['your turn', e('turnStart', { turn: 3, roundTurn: 2 }, 0), view()],
    ['opponent turn', e('turnStart', { turn: 4, roundTurn: 3 }, 1), view()],
    ['reshuffle', e('reshuffle', { seat: 0, n: 12 }), view()],
    ['tactics burn', e('tacticsBurn', { seat: 0, iid: 't3', cardId: 'ST01-018' }), view()],
    ['round 1 start', e('roundStart', { round: 1, first: 0, pp: 3 }), view()],
    ['round 2 start (match point)', e('roundStart', { round: 2, first: 1, pp: 4 }), view({ wins: [1, 0] })],
    ['final round', e('roundStart', { round: 3, first: 0, pp: 5 }), view({ wins: [1, 1] })],
    ['round won', e('roundEnd', { round: 1, winner: 0, loser: 1, wins: [1, 0] }), view({ wins: [1, 0] })],
    ['round lost', e('roundEnd', { round: 1, winner: 1, loser: 0, wins: [0, 1] }), view({ wins: [0, 1] })],
    ['match won', e('matchEnd', { winner: 0, losers: [1], reason: 'rounds', wins: [2, 1] }), view({ wins: [2, 1] })],
    ['match lost', e('matchEnd', { winner: 1, losers: [0], reason: 'rounds', wins: [1, 2] }), view({ wins: [1, 2] })],
  ];
  const sim = $('sim');
  for (const [label, entry, v] of EVENTS) {
    const b = el('button', '', label);
    b.addEventListener('click', () => { A.unlock(); A.onLog(entry, v); });
    sim.appendChild(b);
  }

  // ---- cue rows ------------------------------------------------------------------------------------------------------
  const out = $('out');
  let playing = null;
  function stop() { if (playing) { playing.a.pause(); playing.btn.textContent = '▶'; playing.btn.classList.remove('playing'); playing = null; } }
  const KIND = { sfx: 'Sound effects', music: 'Music', voice: 'Announcer (original designed voice)' };
  for (const kind of ['sfx', 'music', 'voice']) {
    const list = CUES.filter((c) => c.kind === kind);
    out.appendChild(el('h2', '', `${KIND[kind]} (${list.length})`));
    const grid = el('div', 'grid'); out.appendChild(grid);
    for (const c of list) {
      const m = S[c.tag];
      const row = el('div', 'cue' + (m ? '' : ' pending') + (m && m.flags.length ? ' flagged' : ''));
      const btn = el('button', 'play', '▶'); btn.setAttribute('aria-label', 'Play ' + c.tag);
      const head = el('div');
      head.appendChild(el('span', 'tag', c.tag)); head.appendChild(el('span', 'kind', c.kind + (c.loop ? ' loop' : '')));
      row.appendChild(btn); row.appendChild(head);
      const meta = el('div', 'meta');
      if (m) {
        meta.innerHTML = '';
        meta.append(`planned ${c.seconds} s · delivered `, el('b', '', m.seconds + ' s'), ` · `, el('b', '', m.lufs + ' LUFS'), ` · peak ${m.peak} · crest `, el('b', '', String(m.crest)), ` · mix gain ${m.gain}`);
        if (m.flags.length) meta.appendChild(el('span', 'flag', ' · ' + m.flags.join('; ')));
      } else {
        meta.appendChild(el('span', 'pend', 'pending: no file yet'));
        meta.append(` · planned ${c.seconds} s · mix gain ${c.gain}`);
      }
      row.appendChild(meta);
      const trig = M.triggersOf(c.tag);
      row.appendChild(el('div', 'trig', 'heard on: ' + (c.use === 'ui' ? 'interface (XS.Audio.cue)' : trig.length ? trig.join(', ') : 'nothing (unreachable)')));
      const det = el('details'); det.appendChild(el('summary', '', c.kind === 'voice' ? 'line' : 'prompt'));
      det.appendChild(el('div', '', c.kind === 'voice' ? `"${c.text}" (delay ${c.delay || 0} s)` : c.prompt)); row.appendChild(det);
      if (!m) btn.disabled = true;
      else {
        const a = new Audio(m.file); a.preload = 'none';
        a.addEventListener('ended', () => { if (playing && playing.a === a) stop(); });
        btn.addEventListener('click', () => {
          if (playing && playing.a === a) return stop();
          stop();
          a.volume = Math.min(1, m.gain);
          a.loop = !!c.loop;
          a.currentTime = 0;
          const p = a.play(); if (p && p.catch) p.catch((err) => { meta.append(' · play failed: ' + err.message); });
          btn.textContent = '■'; btn.classList.add('playing'); playing = { a, btn };
        });
      }
      grid.appendChild(row);
    }
  }
  status();
})();
