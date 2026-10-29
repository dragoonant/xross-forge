// The art identity table (M5, PLAN D2/D4, KB card-games.md §7 "identity table + per-item scene clause").
// One visual clause per talent, written ONCE, from looking at each official card as REFERENCE ONLY
// (2026-10-29): hair, eyes, species traits, accessories, outfit, palette, in our own words. No
// official image is ever passed to the generator (docs/rights.md §2, §7 item 2), and no composition
// is copied: the poses below are our own.
//
// Prompts use these visual clauses and NEVER a talent's name, an agency, a team or a franchise
// name: a proper noun in a prompt invites lettering (KB), and the lint refuses them
// (tools/art/lint.mjs). Names stay in data/cards.js for the UI (D2).
//
// The Crazy Raccoon members are real players and streamers; the card shows a cartoon avatar
// persona, and only that persona is described here (never a real face). The lint refuses
// "photo", "photoreal" and "realistic face" in every prompt.
//
// Shape (read by tools/build-art-prompts.mjs; this file is tooling data and is not loaded by
// index.html):
//   leaders[<number>] = { head, outfit, pose, palette, awakened }
//       front face  = head + outfit + pose + palette;  awakened face = the same + awakened.
//       Scenes use "{<number>}" (head + outfit) or "{<number>:head}" (head only, for two-person
//       scenes and for scenes that change the outfit).
//   scenes[<number>]  = one scene clause per attack / memoria card: who appears, doing what, in the
//       spirit of the card's name. At most two people. No weapons used on a person: arena play,
//       light bolts, target drones, confetti (nothing sexual or gory, docs/rights.md §7 item 4).
//   objects[<suffix>] = one object clause per tactics card, the PP Ticket and the PP card (objects
//       only, no people); "{accent}" is replaced by the deck's accent colours.
//   accents[<deck>]   = the two glow colours of a deck.
//   ui[<name>]        = { kind: 'backdrop' | 'cardback', clause }  (UI plates, key "ui/<name>").
(function () {
  const XS = (globalThis.XS = globalThis.XS || {});

  const AWAKEN_VSPO = 'bathed in a prismatic aura of silver crystal shards, drifting pink glints and a golden glow, the outfit shining brighter';
  const AWAKEN_CR = 'bathed in a prismatic aura of silver crystal shards, red-orange glints and a golden glow';
  const CHIBI = 'a chibi cartoon avatar with a big head, small body';

  XS.ART_IDENTITY = {
    leaders: {
      // ST01-001 Uruha Ichinose (VSPO!): black hair, blue streak, violet eyes, green jacket.
      'ST01-001': {
        head: 'a young woman with long straight black hair with one blue streak by her face and a small side braid, violet eyes, a black choker',
        outfit: 'an open olive-green hooded bomber jacket lined in orange over a white oversized hoodie',
        pose: 'one hand on her hip, a calm gentle closed-mouth smile',
        palette: 'olive green, orange, white and black with pink accents',
        awakened: AWAKEN_VSPO,
      },
      // ST01-002 Toto Kogara (VSPO!): blonde twin tails, red eyes, gothic blouse and lace skirt.
      'ST01-002': {
        head: 'a young woman with long wavy blonde hair in two low twin tails tied with black ribbons, red eyes, a black choker, small drop earrings',
        outfit: 'a white blouse with lace off-the-shoulder sleeves, a wide black corset belt with a gold buckle and a long layered black lace skirt',
        pose: 'one finger raised to her lips with a coy smile',
        palette: 'black, white and gold with red eyes',
        awakened: AWAKEN_VSPO,
      },
      // ST01-003 Sumire Kaga (VSPO!): silver bob, aqua eyes, white cat-ear hood and tail.
      'ST01-003': {
        head: 'a young woman with a short silver-grey bob and straight bangs, aqua-blue eyes, a small black hair clip, a white hood with two cat ears and a fluffy white cat tail',
        outfit: 'a white cape-coat with blue lining and a grey bow, a black fur-trimmed scarf and a dark patterned skirt',
        pose: 'both hands held near her chest, a soft shy smile',
        palette: 'white, silver-grey, ice blue and black',
        awakened: AWAKEN_VSPO,
      },
      // ST01-004 Nazuna Kaga (VSPO!): plum-to-pink long hair, blue eyes, pale pink dress.
      'ST01-004': {
        head: 'a young woman with long dark plum hair fading to pink at the ends, half pinned up in a braided crown with a small cross-shaped hairpin, bright blue eyes',
        outfit: 'a pale pink striped sleeveless ruffled dress with a big waist ribbon and a thin neck ribbon',
        pose: 'an open-mouthed cheerful smile, one hand raised in a small fist',
        palette: 'pale pink, white, deep plum and sky blue',
        awakened: AWAKEN_VSPO,
      },
      // ST02-001 Selly (CR): cartoon avatar, pink hair with blue streaks, red devil horns, headphones.
      'ST02-001': {
        head: CHIBI + ', long pink-lavender ponytail with sky-blue streaks, two red devil horns, black headphones, purple eyes, a huge toothy grin',
        outfit: 'white gloves, a black tee with a yellow star, a layered blue-violet skirt with a short cape, black and yellow boots',
        pose: 'one arm thrust up with a pointing finger',
        palette: 'pink, lavender, blue and black with yellow and red accents',
        awakened: AWAKEN_CR,
      },
      // ST02-002 Mondo (CR): cartoon avatar pirate, black hair, blue tricorn hat, eye patch, hook cane.
      'ST02-002': {
        head: CHIBI + ', messy black hair, a blue tricorn pirate hat with white fur trim, one red eye, a white eye patch with a bone-cross mark over the other, a sharp-toothed grin',
        outfit: 'a long black military-style coat with gold trim, a white cravat and a curved gold hook cane in one hand',
        pose: 'one hand tucked behind him in a cocky lean',
        palette: 'black, royal blue, gold and white',
        awakened: AWAKEN_CR,
      },
      // ST02-003 Cpt (CR): cartoon avatar, spiky red hair with a yellow bolt streak, black jacket.
      'ST02-003': {
        head: CHIBI + ', short spiky red hair with a yellow lightning-bolt streak, amber eyes, a stud earring, a calm half-smile',
        outfit: 'a black jacket over a blue shirt, black trousers and black and orange sneakers',
        pose: 'holding a big grey toy-like handgun upright beside his face',
        palette: 'black, red, blue and amber',
        awakened: AWAKEN_CR,
      },
      // ST02-004 Ras (CR): cartoon avatar of a fluffy white cat, odd-coloured eyes, purple jacket.
      'ST02-004': {
        head: 'a chibi cartoon avatar of a fluffy white cat with a big head, small body, pink inner ears, one red eye and one green eye, a cheeky tongue-out grin',
        outfit: 'a black neck scarf, a purple jacket with a lime-yellow chevron panel, black trousers and white paw gloves',
        pose: 'holding a chunky cartoon blaster with yellow and black hazard stripes, a small ring-handled throwing blade at the belt',
        palette: 'white, purple, lime-yellow and black',
        awakened: AWAKEN_CR,
      },
    },

    // One scene per attack / memoria card, inspired by the card's name (English name in brackets).
    scenes: {
      // ---- ST01 (VSPO! leaders ST01-001 .. 004) ----
      // Crossfire
      'ST01-005': '{ST01-001:head} and {ST01-003:head} stand back to back on a neon arena stage, each aiming a glowing toy-like blaster outward so that two bright beams cross in the centre of the frame, stage lights sweeping, confetti in the air',
      // Risky Entry
      'ST01-006': '{ST01-002} sprints boldly through a doorway of sliding neon light panels into a dim arena, one foot off the ground, a cheeky determined grin, a toy-like blaster held low, stage dust lit by a single spotlight',
      // Bounty Hunter
      'ST01-007': '{ST01-004:head} in a wide-brimmed hunter hat and a dusty long coat, crouched on a neon-lit rooftop at dusk, looking through a long scope toward the glittering city while a glowing target ring hovers in the air ahead of her',
      // Winning Blow
      'ST01-008': '{ST01-003} leaps forward in a victorious finishing strike with her arm thrust out, a burst of white light behind her, a glowing target orb bursting into sparkles, confetti falling over a cheering arena',
      // Proof of Strength
      'ST01-009': '{ST01-001} proudly lifts a huge glowing dumbbell overhead with one hand on a training stage, a bright smile, spotlight beams and sparkles around her',
      // Critical Shot
      'ST01-010': '{ST01-004} fires one powerful shot from a sleek long-barrelled toy-like blaster, a bright comet of pink light streaking toward the viewer, shockwave rings, hair and dress blown back',
      // Cool Head
      'ST01-011': '{ST01-002} stands perfectly still with her arms crossed and a calm face on a dark stage while streaks of coloured light whip around her and fade into a quiet blue glow',
      // Blind Shot
      'ST01-012': '{ST01-003} faces away from the target with her chin lifted to the sky, firing a toy-like blaster backward over her shoulder while a glowing target ring far behind her bursts into sparkles',
      // Gambit Master
      'ST01-013': '{ST01-002} sits at a polished table with a sly smile, sliding a glowing chess piece forward with one finger, a board of glowing pieces between her and a shadowy rival seat, dim arena lounge',
      // In the Zone
      'ST01-014': '{ST01-001:head} in a gaming headset with intensely focused eyes, hands on a glowing game controller, the world around her slowed into streaks of light and floating frozen sparkles, the crowd blurred into colour',
      // Messy Room Dweller
      'ST01-015': '{ST01-004:head} in a cosy pink hoodie sits cross-legged in a cheerful bedroom piled with soft cushions, plush toys, snack boxes and tangled cables, a headset around her neck, giving a thumbs up under a warm lamp glow',
      // First Glory
      'ST01-016': '{ST01-003:head} and {ST01-004:head} lift a big golden trophy together high above a winners podium, happy tears, confetti and spotlights raining down on a roaring arena',
      // Summit Reached
      'ST01-017': '{ST01-001} stands on a snowy mountain peak at sunrise with both arms spread wide, a glowing crystal pickaxe planted in the snow beside her, a sea of golden clouds far below',
      // Interviewer
      'ST01-018': '{ST01-002:head} in a sharp tailored black suit sits across an interview desk, leaning forward with a warm professional smile and a glowing microphone in hand, a soft backstage spotlight',

      // ---- ST02 (CR leaders ST02-001 .. 004) ----
      // Otherworldly Kick
      'ST02-005': '{ST02-001} bursts through a swirling purple portal of crystal shards in a flying kick, one boot thrust forward, her short cape flaring, a trail of star glints behind her',
      // Wild Prank
      'ST02-006': '{ST02-004} laughs with the tongue out while tipping a huge bucket of rainbow confetti and balloons across a stage, a mischievous grin, streamers flying',
      // Impact Shot
      'ST02-007': '{ST02-003} fires his big grey toy-like handgun, a huge shockwave ring and a flash of orange light bursting from the barrel, his jacket whipping back, floating sparks',
      // Killing Spree
      'ST02-008': '{ST02-004} sprints along a neon obstacle arena firing bolts of bright light left and right, many glowing target drones bursting into colourful sparks all around, speed streaks behind him',
      // Demon King's Descent
      'ST02-009': '{ST02-001} descends from a stormy red-lit sky with arms spread wide, enormous wings of shadow, glowing red horns and a huge ring of crimson light behind her, a regal confident grin',
      // Counter Snipe
      'ST02-010': '{ST02-003} lies on a neon rooftop at night looking through a long scope, a spent shell gleaming beside him, a tiny glowing target ring far away, calm focused eyes',
      // Multi Grenade
      'ST02-011': '{ST02-002} flings a cluster of glowing round capsules in a wide arc with a grin, firework-like bursts of colour in the distance, the gold hook cane in his other hand',
      // Unchanging Bond
      'ST02-012': '{ST02-003:head} and {ST02-004:head} bump fists on a sunset rooftop as old friends, matching smirks, warm orange light and drifting city lights behind them',
      // Great Glory
      'ST02-013': '{ST02-001} raises a radiant golden laurel crown high above her head on a stage podium, stage fireworks bursting, crowd silhouettes cheering below',
      // Close Call
      'ST02-014': '{ST02-004} leans far back with wide eyes and a startled grin as streaks of light zip just past his head, one sweat drop, motion lines',
      // Tour Guide
      'ST02-015': '{ST02-002} strolls through a neon night market street raising his gold hook cane like a guide pointer, a friendly grin, a small crowd of silhouettes following behind him, lantern glow',
      // Lucky Man
      'ST02-016': '{ST02-003} sprints first across a glowing finish line with both arms wide, gold coins and clover leaves raining down around him, confetti, a huge delighted grin',
      // Champion for Hire
      'ST02-017': '{ST02-002} lounges in an arena corridor with a golden trophy tucked under one arm, flicking a glowing gold coin into the air with his thumb, a confident smirk',
      // Little Video Letter
      'ST02-018': '{ST02-001} grins and waves into a small floating camera drone, holding up a tiny glowing heart, a cosy backstage room hung with fairy lights',
    },

    // Tactics (5 per deck), the PP Ticket and the PP card: objects only, no people.
    objects: {
      // Adrenaline
      '019': 'a glowing crystal heart crackling with bolts of lightning, shining with {accent} light, floating above a dark stage floor',
      // Energy Charger
      '020': 'a chunky rounded power cell with a glowing core, a bright cable looped around it and ripples of energy, shining with {accent} light, on a dark stage floor',
      // First Aid Kit
      '021': 'a white hard-shell medical case with a glowing green plus-shaped clasp, soft healing sparkles drifting up from it, touches of {accent} light',
      // Special Round
      '022': 'a single oversized glowing energy cartridge standing upright with swirling light trails around it, shining with {accent} light',
      // Light Shield
      '023': 'a sleek kite-shaped shield of translucent glowing glass hovering in the air, bright rim light and soft hexagon patterns, shining with {accent} light',
      // PP Ticket
      '024': 'a glowing holographic pass card floating at a slight angle, a rainbow foil sheen and shimmering geometric patterns, edges lit with {accent} light',
      // PP card
      '025': 'a radiant faceted crystal power gem floating above a small round pedestal with orbiting sparks, shining with {accent} light',
    },
    accents: {
      ST01: 'cyan and pink',
      ST02: 'red and gold',
    },

    // UI plates (key "ui/<name>"). Backdrops are empty places; card backs are symmetrical patterns.
    ui: {
      title: {
        kind: 'backdrop',
        clause: 'a vast empty esports arena just before a grand final, a huge glowing stage in the centre under towering light rigs, swirling neon beams of cyan, magenta and gold through haze, tiers of seats fading into darkness at the edges',
      },
      arena: {
        kind: 'backdrop',
        clause: 'a polished dark stage floor seen from above at a slight angle, glowing neon lane lines, soft pools of coloured light, a calm open centre and distant arena lights fading around the edges',
      },
      'card-back': {
        kind: 'cardback',
        clause: 'the back face of a collectible game card, a symmetrical design of nested neon rings and radiating light beams around a glowing orb in the centre, a deep navy field with cyan and magenta edge glow',
      },
      'tactics-back': {
        kind: 'cardback',
        clause: 'the back face of a collectible game card, a symmetrical honeycomb of hexagon cells around a golden lightning-bolt shape in the centre, a dark charcoal field with an amber edge glow',
      },
    },
  };
})();
