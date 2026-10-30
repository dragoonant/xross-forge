// One behaviour test per BP04 card number used by a registered deck (data/abilities-bp04.js). Same rules as
// tests/20-cards.js: a real game state, the card played through XS.apply, the side effect asserted, and a
// single-candidate case for every targeted effect (CLAUDE.md rule 4). Positions: tests/05-fixtures.js.
(function () {
  const XS = globalThis.XS;
  const { test, eq, ok, throws } = XS.T;
  const fx = XS.T.fx;
})();
