// js/ui/sfx.js: the interface's side of the audio (M6 owns js/audio/*; this file only calls its contract):
//   XS.Audio.init()  .unlock()  .onLog(entry, view)  .cue(tag)  .setScene(name)  .settings {master, sfx, music, voice, muted}  .coverage()
// There is no fallback: when XS.Audio is missing the page throws at boot (boot.js), and every call here would throw too.
//   U.sfx.sceneFor(view)  pure: 'calm' | 'tense' | 'victory' | 'defeat' | 'silent' for a presented view (the title scene is set by the title)
//   U.sfx.scene(name)     setScene, sent only when the scene changes
//   U.sfx.cue(tag)        a UI cue: ui-hover, ui-click, ui-confirm, ui-cancel, ui-drawer
//   U.sfx.init()          unlocks audio on the first user gesture and wires the delegated hover / click cues
// Headless-safe at load (no DOM, no XS.Audio until a function is called).
(function () {
  'use strict';
  const XS = globalThis.XS;
  const U = XS.ui;
  const F = (U.sfx = {});

  F.CUES = ['ui-hover', 'ui-click', 'ui-confirm', 'ui-cancel', 'ui-drawer'];
  F.SCENES = ['title', 'calm', 'tense', 'victory', 'defeat', 'silent'];

  // Tense: either side has two or fewer leaders still standing, or a player is at match point (a full match, one round
  // from the win). A finished match is victory (the viewer won), defeat (the viewer lost) or silent (nobody won).
  F.sceneFor = function (view) {
    if (view.phase === 'over') {
      if (view.winner === null || view.winner === undefined) return 'silent';
      return view.winner === view.viewer ? 'victory' : 'defeat';
    }
    const alive = (seat) => view.players[seat].leaders.filter((l) => !l.down).length;
    if (alive(0) <= 2 || alive(1) <= 2) return 'tense';
    const matchPoint = view.mode === 'full' && (view.wins[0] === view.needWins - 1 || view.wins[1] === view.needWins - 1);
    return matchPoint ? 'tense' : 'calm';
  };

  let lastScene = null;
  F.scene = (name) => {
    if (!F.SCENES.includes(name)) throw new Error('sfx: unknown scene "' + name + '"');
    if (name === lastScene) return;
    lastScene = name;
    XS.Audio.setScene(name);
  };
  F.lastScene = () => lastScene;
  F.cue = (tag) => {
    if (!F.CUES.includes(tag)) throw new Error('sfx: unknown UI cue "' + tag + '"');
    XS.Audio.cue(tag);
  };

  // What a click on this element sounds like. data-cue on the element (or an ancestor) names it; any other button-like
  // thing is a plain click; a card that cannot be played right now is the soft "no".
  const CLICKABLE = 'button, .opt, .linkish, [role="button"], [data-play]';
  F.cueFor = function (target) {
    const tagged = target.closest('[data-cue]');
    if (tagged !== null) return tagged.getAttribute('data-cue');
    const t = target.closest(CLICKABLE);
    if (t === null) return null;
    if (t.disabled) return null;
    if (t.getAttribute('aria-disabled') === 'true') return 'ui-cancel';
    return 'ui-click';
  };

  const HOVERABLE = 'button:not(:disabled), .opt, .linkish, [role="button"]:not([aria-disabled="true"]), [data-viewer]';
  F.init = function () {
    // Browsers keep audio locked until a gesture, and warn in the console about a context made before one. So the audio
    // starts on the first gesture: init() then unlock(), once. Until then setScene/onLog/cue only record what is wanted.
    const events = ['pointerdown', 'keydown', 'touchend'];
    const unlock = () => {
      for (const ev of events) document.removeEventListener(ev, unlock, true);
      XS.Audio.init();
      XS.Audio.unlock();
    };
    for (const ev of events) document.addEventListener(ev, unlock, true);

    let hovered = null, lastAt = 0;
    document.addEventListener('mouseover', (e) => {
      const t = e.target.closest ? e.target.closest(HOVERABLE) : null;
      if (t === hovered) return;
      hovered = t;
      if (t === null || document.getElementById('fx-lock').classList.contains('open')) return;
      const now = performance.now();
      if (now - lastAt < 70) return;               // sweeping across a row of cards is one tick, not eight
      lastAt = now;
      F.cue('ui-hover');
    });
    document.addEventListener('click', (e) => {
      if (e.target.closest('#fx-lock')) return;      // a click that only skips an animation makes no UI sound
      const tag = F.cueFor(e.target);
      if (tag !== null) F.cue(tag);
    }, true);
  };
})();
