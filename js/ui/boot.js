// js/ui/boot.js: the M0 title screen, and nothing else. Loaded last by index.html.
// The markup is static in index.html (it reads fine without JS); this file only
//   * checks the modules it depends on and THROWS when one is missing (no silent fallbacks:
//     a missing module is a broken build, check-pages enforces the same for js/ui),
//   * derives the Play button's state and its reason from what actually loaded, the same
//     way the engine's whyNot will in M2: the reason is a sentence, or null when playable.
// The game UI (board, hand, log, targeting) lands in M3 and takes this file's place as the
// entry point.
(function () {
  'use strict';
  const XS = globalThis.XS;
  if (XS === undefined) throw new Error('boot: js/ns.js did not load (no globalThis.XS)');
  for (const k of ['Illegal', 'rngNext', 'shuffleInPlace', 'hashSeed']) {
    if (XS[k] === undefined) throw new Error('boot: XS.' + k + ' is missing (check the <!-- engine --> block)');
  }

  // null when the game can be started, else why not. Mirrors XS.whyNot's contract (M2).
  function playWhyNot() {
    if (typeof XS.newGame !== 'function') return 'Engine lands in M2';
    if (XS.ui === undefined || typeof XS.ui.start !== 'function') return 'Game UI lands in M3';
    return null;
  }

  function byId(id) {
    const e = document.getElementById(id);
    if (e === null) throw new Error('boot: #' + id + ' is missing from index.html');
    return e;
  }

  const btn = byId('play');
  const note = byId('play-why');
  const status = byId('lt-status');
  const why = playWhyNot();
  btn.disabled = why !== null;
  note.hidden = why === null;
  if (why !== null) note.textContent = why;
  if (why === null) btn.addEventListener('click', () => XS.ui.start());

  const ok = document.createElement('span');
  ok.className = 'ok';
  ok.textContent = 'XS ready';
  const rest = document.createElement('span');
  rest.textContent = 'Engine M2 · Game UI M3';
  status.replaceChildren(ok, rest);
})();
