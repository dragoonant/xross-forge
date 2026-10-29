// js/ui/boot.js: the entry point, loaded last by index.html. It checks that every module the UI
// depends on loaded and THROWS when one is missing (no silent fallbacks: a missing module is a
// broken build; tools/check-pages.mjs enforces the same for js/ui), wires the delegated listeners,
// and starts a match straight away for the test URLs:
//   ?autoplay=1&speed=instant&seed=N[&mode=quick|full][&deck0=ST01&deck1=ST02]   bot against bot
(function () {
  'use strict';
  const XS = globalThis.XS;
  if (XS === undefined) throw new Error('boot: js/ns.js did not load (no globalThis.XS)');
  for (const k of ['Illegal', 'rngNext', 'shuffleInPlace', 'hashSeed']) {
    if (XS[k] === undefined) throw new Error('boot: XS.' + k + ' is missing (check the <!-- engine --> block)');
  }
  for (const k of ['newGame', 'legalActions', 'apply', 'whoActs', 'isTerminal', 'view', 'leaderStats', 'costToPlay', 'whyNot',
    'previewAttack', 'previewAttackDetail', 'replay']) {
    if (typeof XS[k] !== 'function') throw new Error('boot: XS.' + k + ' is missing (engine not loaded or the contract changed)');
  }
  for (const k of ['CARDS', 'DECKS', 'TAGS']) if (XS[k] === undefined) throw new Error('boot: XS.' + k + ' is missing (data block)');
  const U = XS.ui;
  for (const k of ['core', 'logtext', 'cardview', 'preview', 'anim', 'targeting', 'prompt', 'board', 'bot-random', 'game', 'title']) {
    const probe = { core: 'el', logtext: 'logText', cardview: 'cardEl', preview: 'preview', anim: 'anim', targeting: 'targeting', prompt: 'prompt',
      board: 'board', 'bot-random': 'makeRandomBot', game: 'game', title: 'title' }[k];
    if (U[probe] === undefined) throw new Error('boot: js/ui/' + k + '.js did not load');
  }

  U.preview.init();
  U.anim.init();
  U.game.init();
  U.title.init();

  const p = U.params();
  if (p.get('autoplay') === '1') {
    const seedRaw = p.get('seed');
    U.game.start({
      decks: [p.get('deck0') || 'ST01', p.get('deck1') || 'ST02'],
      mode: p.get('mode') === 'quick' ? 'quick' : 'full',
      seed: seedRaw === null ? undefined : Number(seedRaw),
      spectate: true,
    });
  }
})();
