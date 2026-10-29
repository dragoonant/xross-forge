// Cards that do not play as printed. Rule 8 (CLAUDE.md): such a card is listed here with a reason
// and kept out of every deck; tools/validate-data.mjs fails when a deck contains one.
// Shape: XS.DEFECTS = { "ST01-001": "why it does not play as printed" }.
// Empty today: every card in the first slice (ST01 + ST02) is expected to play as printed.
(function () {
  const XS = (globalThis.XS = globalThis.XS || {});
  XS.DEFECTS = {};
})();
