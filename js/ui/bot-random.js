// js/ui/bot-random.js: the M3 opponent. Uniform choice among XS.legalActions. legalActions takes the
// raw state (contract), but the decision uses only what XS.view(s, seat) shows the bot: a uniform
// pick needs nothing else. It also answers its own pending decisions (pickTactics, choose,
// distribute, attackPair, order, chooseFirst): legalActions lists a deterministic sample for the
// multi-pick ones, and that list is what it picks from. The RNG is seeded, so a seed replays.
(function () {
  'use strict';
  const XS = globalThis.XS;
  const U = XS.ui;

  // makeBot(seed, seat) -> { seat, choose(s) -> action }
  U.makeRandomBot = function (seed, seat) {
    const rng = { rng: XS.hashSeed('bot:' + seat + ':' + seed) };
    return {
      seat,
      name: 'Random bot',
      choose(s) {
        if (XS.whoActs(s) !== seat) throw new Error('bot: asked to act but it is seat ' + XS.whoActs(s) + "'s move");
        const v = XS.view(s, seat);
        if (v.viewer !== seat) throw new Error('bot: view is not for the bot seat');
        const legal = XS.legalActions(s);
        if (legal.length === 0) throw new Error('bot: legalActions is empty while the game is not over');
        const i = Math.floor(XS.rngNext(rng) * legal.length);
        return legal[i];
      },
    };
  };
})();
