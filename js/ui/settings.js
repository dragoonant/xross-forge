// js/ui/settings.js: the player's settings, persisted in localStorage (every read and write is wrapped:
// the page works without storage). Headless-safe: nothing touches the DOM until apply() runs.
//   speed         'full' | 'quick' | 'instant'      playback speed of the presentation director
//   reduceMotion  bool (default: the OS preference) shortens the stinger and the other overlays, drops shakes and bursts
//   autoPass      bool (default false)              end the turn alone when legalActions holds nothing but endTurn
//   names         'en' | 'jp'                       which name leads on a card title (the other sits beneath)
//   audio         { master, music, sfx, voice, muted }   saved copy of XS.Audio.settings, re-applied at boot
// The URL can override the speed for one session (?speed=instant, used by tests); the override is never saved.
(function () {
  'use strict';
  const XS = globalThis.XS;
  const U = XS.ui;
  const S = (U.settings = {});

  // Speed: durations are multiplied by RATE[speed]; 0 means "do not animate at all" (tests, autoplay).
  U.RATE = { full: 1, quick: 0.45, instant: 0 };
  S.KEYS = ['speed', 'reduceMotion', 'autoPass', 'names', 'audio'];
  const AUDIO_KEYS = ['master', 'music', 'sfx', 'voice', 'muted'];

  let cur = null;
  const listeners = [];

  function sane(raw) {
    const o = { speed: 'full', reduceMotion: null, autoPass: false, names: 'en', audio: null };
    if (raw === null || typeof raw !== 'object') return o;
    if (U.RATE[raw.speed] !== undefined) o.speed = raw.speed;
    if (typeof raw.reduceMotion === 'boolean') o.reduceMotion = raw.reduceMotion;
    if (typeof raw.autoPass === 'boolean') o.autoPass = raw.autoPass;
    if (raw.names === 'en' || raw.names === 'jp') o.names = raw.names;
    if (raw.audio !== null && typeof raw.audio === 'object') {
      const a = {};
      for (const k of AUDIO_KEYS) {
        if (k === 'muted' ? typeof raw.audio[k] === 'boolean' : (typeof raw.audio[k] === 'number' && raw.audio[k] >= 0 && raw.audio[k] <= 1)) a[k] = raw.audio[k];
      }
      if (Object.keys(a).length > 0) o.audio = a;
    }
    return o;
  }
  function load() {
    if (cur !== null) return cur;
    const saved = U.store.get('settings', null);
    cur = sane(saved);
    if (saved === null) {
      const legacy = U.store.get('speed', null);      // M3 kept the speed alone under xs.speed
      if (U.RATE[legacy] !== undefined) cur.speed = legacy;
    }
    const q = U.params().get('speed');
    if (U.RATE[q] !== undefined) cur.speed = q;       // session override; saved only when the player changes it
    return cur;
  }
  const save = () => U.store.set('settings', cur);

  S.get = (k) => {
    load();
    if (k === 'reduceMotion') return cur.reduceMotion === null ? U.reducedMotion() : cur.reduceMotion;
    if (!S.KEYS.includes(k)) throw new Error('settings: unknown setting "' + k + '"');
    return cur[k];
  };
  S.set = (k, v) => {
    load();
    if (!S.KEYS.includes(k) || k === 'audio') throw new Error('settings: cannot set "' + k + '" here');
    if (k === 'speed' && U.RATE[v] === undefined) throw new Error('settings: bad speed ' + v);
    if (k === 'names' && v !== 'en' && v !== 'jp') throw new Error('settings: bad names ' + v);
    if ((k === 'reduceMotion' || k === 'autoPass') && typeof v !== 'boolean') throw new Error('settings: ' + k + ' is a boolean');
    cur[k] = v;
    save();
    S.apply();
    for (const fn of listeners) fn(k, v);
  };
  // The saved audio levels (null when the player never touched them: XS.Audio keeps its own defaults).
  S.audio = () => { load(); return cur.audio === null ? null : Object.assign({}, cur.audio); };
  S.setAudio = (k, v) => {
    load();
    if (!AUDIO_KEYS.includes(k)) throw new Error('settings: unknown audio setting "' + k + '"');
    if (cur.audio === null) cur.audio = {};
    cur.audio[k] = v;
    save();
    for (const fn of listeners) fn('audio.' + k, v);
  };
  S.onChange = (fn) => { listeners.push(fn); };
  // Test hook: forget the in-memory copy so the next read goes to storage again (and, in tests, back to defaults).
  S.reload = () => { cur = null; };

  // ---- speed (the director reads these) ---------------------------------------------------------
  U.speed = () => load().speed;
  U.setSpeed = (v) => S.set('speed', v);
  U.rate = () => U.RATE[U.speed()];
  U.ms = (n) => Math.round(n * U.rate());
  U.reduceMotion = () => S.get('reduceMotion');

  // DOM side: the body class the CSS keys on.
  S.apply = () => {
    if (typeof document === 'undefined' || document.body === null) return;
    document.body.classList.toggle('reduce-motion', S.get('reduceMotion'));
  };
})();
