// js/ui/save.js: autosave and continue. After every applied action the match is saved as
//   { init, actions, version, date, tier, round, turn }
// (init + actions are what XS.replay rebuilds from; version is a hash of the card, deck and ability data the save was
// made with; round/turn only label the Continue button). The title offers "Continue (round N, turn M)" while a save
// exists. A finished match clears it. A save from older data is still offered; game.js rebuilds it with XS.replay and,
// if that throws, says "This save can't be resumed" and clears it. Every storage access is wrapped (U.store).
// Headless-safe.
(function () {
  'use strict';
  const XS = globalThis.XS;
  const U = XS.ui;
  const V = (U.save = {});

  V.KEY = 'save';

  // A short hash of the data the engine plays from: when it changes, an old save may no longer replay the same way.
  let version = null;
  V.version = () => {
    if (version === null) {
      let h = 5381;
      const src = JSON.stringify([XS.CARDS, XS.DECKS, XS.ABIL]);
      for (let i = 0; i < src.length; i++) h = ((h * 33) ^ src.charCodeAt(i)) >>> 0;
      version = h.toString(36);
    }
    return version;
  };

  // live: the engine state after the latest action; extra: { tier }.
  V.record = (live, extra) => ({
    init: live.init, actions: live.actions, version: V.version(), date: new Date().toISOString(),
    tier: extra !== undefined && extra.tier !== undefined ? extra.tier : 'normal', round: live.round, turn: live.roundTurn,
  });
  V.write = (live, extra) => { U.store.set(V.KEY, V.record(live, extra)); };
  V.clear = () => { U.store.set(V.KEY, null); };

  // The saved record, or null (nothing saved, or the stored value is not a save at all: it is cleared).
  V.read = () => {
    const r = U.store.get(V.KEY, null);
    if (r === null) return null;
    const ok = typeof r === 'object' && r.init !== null && typeof r.init === 'object' && Array.isArray(r.init.decks) &&
      Array.isArray(r.actions) && typeof r.version === 'string' && Number.isInteger(r.round) && Number.isInteger(r.turn);
    if (!ok) { V.clear(); return null; }
    return r;
  };

  V.label = (r) => 'Continue (round ' + r.round + ', ' + (r.turn > 0 ? 'turn ' + r.turn : 'setup') + ')';
  V.stale = (r) => r.version !== V.version();
})();
