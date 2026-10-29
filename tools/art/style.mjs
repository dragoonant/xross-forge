// The style audition (PLAN D4, KB card-games.md §7). Ten candidate looks, one sentence each, in our
// own words: no artist, studio, franchise or product names (rule 11). `node tools/gen-art.mjs
// --audition` renders all ten on ONE subject (leader ST01-001, front face) with a fixed seed; the
// owner picks one; the pick is recorded in PLAN.md and pasted here as STYLE (and UI_STYLE).
//
// Until STYLE is set every non-audition run refuses (build-art-prompts, gen-art). `--dry-run` and
// `--mock` may plan with a provisional candidate (`--style <ID>`, default A) and say so.
//
// STYLE must stay byte-identical on every generation: changing one character starts a new set.
// Both strings are linted like any prompt (tools/art/lint.mjs): no negations, no counts above two,
// no text-magnet nouns, no banned names.
//
//   STYLE    : how characters, objects and scenes are drawn (the sentence leads every prompt)
//   UI_STYLE : the same look applied to an empty-place backdrop or a card back (no figures)

export const CANDIDATES = {
  A: {
    label: 'neon cel-shading',
    style: 'bold anime cel-shaded illustration with crisp dark outlines, flat saturated colour blocks, a vivid neon rim light and sparkling highlights, esports broadcast key-visual energy',
    ui: 'bold anime cel-shaded backdrop painting with crisp shapes, flat saturated colour blocks, vivid neon rim light and soft haze, esports broadcast stage energy',
  },
  B: {
    label: 'chibi SD',
    style: 'super-deformed chibi figures about two and a half heads tall with oversized heads, big sparkling eyes and short stubby limbs, glossy cel shading, bright arena colours and a neon rim light',
    ui: 'cheerful chibi-world backdrop painting with clean rounded shapes, glossy cel shading, bright arena colours and a neon glow',
  },
  C: {
    label: 'painterly splash art',
    style: 'dynamic painterly splash art with confident loose brushwork, rich layered colour glazes, dramatic light flares and a strong sense of motion',
    ui: 'painterly environment art with confident loose brushwork, rich layered colour glazes, dramatic light flares and atmospheric depth',
  },
  D: {
    label: 'flat graphic',
    style: 'flat graphic vector illustration built from bold geometric shapes, a tight palette of a few vivid colours, hard clean edges and strong contrast',
    ui: 'flat graphic vector backdrop built from bold geometric shapes, a tight palette of a few vivid colours, hard clean edges and strong contrast',
  },
  E: {
    label: '3D toon render',
    style: 'stylised 3D toon render with smooth sculpted shapes, soft studio lighting, a subtle outline shader and a polished vinyl-toy sheen',
    ui: 'stylised 3D toon environment render with smooth sculpted shapes, soft studio lighting, subtle outline shading and a polished sheen',
  },
  F: {
    label: 'ink and halftone',
    style: 'punchy black ink linework with halftone dot shading and spot-colour accents in two neon tones, high-energy graphic composition',
    ui: 'punchy black ink backdrop linework with halftone dot shading and spot-colour accents in two neon tones, high-energy graphic composition',
  },
  G: {
    label: 'soft watercolour',
    style: 'soft watercolour illustration with gentle colour washes, delicate pencil linework, a pastel glow and visible paper grain',
    ui: 'soft watercolour backdrop with gentle colour washes, a pastel glow, delicate bleeding edges and visible paper grain',
  },
  H: {
    label: 'pixel crisp',
    style: 'crisp high-resolution pixel art with a bright limited palette, clean dithering, chunky sprite shapes and glowing neon highlights',
    ui: 'crisp high-resolution pixel-art backdrop with a bright limited palette, clean dithering, chunky shapes and glowing neon highlights',
  },
  I: {
    label: 'glossy idol stage',
    style: 'glossy idol-stage illustration with airbrushed gradients, sparkling glints, lens-flare stars and candy-bright colours',
    ui: 'glossy idol-stage backdrop with airbrushed gradients, sparkling glints, lens-flare stars and candy-bright colours',
  },
  J: {
    label: 'gritty esports key art',
    style: 'gritty esports key art with high-contrast dramatic lighting, hard edges, smoky atmosphere, a teal and orange neon glow and painterly texture',
    ui: 'gritty esports arena concept art with high-contrast dramatic lighting, hard edges, smoky atmosphere, a teal and orange neon glow and painterly texture',
  },
};

// Set both once the owner picks (copy the candidate's two strings here byte for byte, and record
// the pick in PLAN.md). Left null on purpose: every non-audition generation refuses until then.
export const STYLE = null;
export const UI_STYLE = null;
