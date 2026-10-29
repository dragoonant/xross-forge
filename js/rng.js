// Seeded RNG, ported from lorecannae's js/ns.js (9c8016d). The generator's whole state is ONE
// 32-bit integer stored on the game state as `s.rng`, so every random event happens inside
// apply() and a game is a pure function of its seed and its action list (replays reproduce,
// apply stays pure). Nothing in here owns state; every function takes the game state `s`.
// Never call Math.random() anywhere in the engine.
(function () {
  const XS = globalThis.XS;

  // mulberry32: tiny, fast, good enough for shuffles. Advances s.rng, returns [0, 1).
  XS.rngNext = function (s) {
    let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Integer in [0, n).
  XS.rngInt = (s, n) => Math.floor(XS.rngNext(s) * n);
  // Fisher-Yates in place, consuming from the state's stream.
  XS.shuffleInPlace = function (s, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = XS.rngInt(s, i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  // String seed -> 32-bit int (FNV-1a), so "seed=abc" in a URL reproduces a game.
  XS.hashSeed = function (str) {
    let h = 0x811c9dc5;
    for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193); }
    return h | 0;
  };
})();
