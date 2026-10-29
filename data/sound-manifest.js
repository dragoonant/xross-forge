// Sound manifest: one entry per audio file the page plays. Declared empty in M1; M6 fills it
// (tools/validate-data.mjs reports coverage as "pending (M6)" until REQUIRE_SOUND flips).
// Shape: XS.SOUNDS = { "<id>": { file: "audio/sfx/attack-hit.mp3", tag: "<log tag>" } }
// `tag` is the log/event tag that triggers the sound (e.g. "attack", "awaken"). A cue for one
// particular card face uses the tag "card:<key>" with the same keys as data/art-manifest.js
// ("card:ST01-005", "card:ST01-001/awakened"). Delivery encodes only; masters stay in audio/masters/.
(function () {
  const XS = (globalThis.XS = globalThis.XS || {});
  XS.SOUNDS = {};
})();
