// Art manifest: one entry per picture the page shows. Declared empty in M1; M5 fills it
// (tools/validate-data.mjs reports coverage as "pending (M5)" until REQUIRE_ART flips).
// Key: the card number for a card face ("ST01-005") and for a leader's front face; a leader's
// awakened face is "<number>/awakened" ("ST01-001/awakened"); UI plates use "ui/<name>".
// Shape: XS.ART = { "<key>": { file: "art/cards/ST01-005.webp", kind: "leader" | "leader-awakened" | "card" | "ui", prompt: "<prompt id>" } }
// `prompt` is the id of the generation prompt in the art pipeline (M5), so every picture can be
// traced to what made it. Delivery encodes only: masters stay in gitignored art/masters/.
(function () {
  const XS = (globalThis.XS = globalThis.XS || {});
  XS.ART = {};
})();
