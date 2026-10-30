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
//       Starter cards are keyed by suffix ("019"); the competitive-deck tactics by full number
//       ("BP03-080") because suffixes repeat across products. Scene placeholders accept any card number.
//   accents[<deck>]   = the two glow colours of a deck.
//   ui[<name>]        = { kind: 'backdrop' | 'cardback', clause }  (UI plates, key "ui/<name>").
(function () {
  const XS = (globalThis.XS = globalThis.XS || {});

  const AWAKEN_VSPO = 'bathed in a prismatic aura of silver crystal shards, drifting pink glints and a golden glow, the outfit shining brighter';
  const AWAKEN_CR = 'bathed in a prismatic aura of silver crystal shards, red-orange glints and a golden glow';
  // The competitive-deck leaders use this shorter form of the same aura (their face clauses are longer).
  const GLOW = (colour) => `bathed in a prismatic aura of silver crystal shards, drifting ${colour} glints and a golden glow`;
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


      // ---- Competitive decks (PLAN D19), 18 new leaders, looked at 2026-10-30 as REFERENCE ONLY ----
      // On every one of these cards the awakened side repeats the same person over a silver crystal
      // background, so the awakened clause is the same figure plus the prismatic aura (glint colour
      // follows the card's own sparkle colour: pink VSPO!, red CR, blue Neo-Porte, amber REJECT).
      // BP01-003 Hinano Tachibana (VSPO!): half pink, half chocolate-brown long hair, black bow braids.
      'BP01-003': {
        head: 'a young woman with long wavy hair split half pink and half chocolate brown, two braided side locks with black ribbon bows, violet-blue eyes',
        outfit: 'a white blouse with a frilled collar and a black bow with a blue gem, a dark plaid suspender skirt with a plush bunny charm',
        pose: 'one hand making a two-finger V gesture by her eye, a wide grin',
        palette: 'pink, chocolate brown, white and black with a blue gem accent',
        awakened: GLOW('pink'),
      },
      // BP01-013 Sena Asumi (VSPO!): silver-grey short twin tails, pink eyes, bat-wing beret, gothic dress.
      'BP01-013': {
        head: 'a young woman with silver-grey hair in two short twin tails with pink streaks, pink eyes, a black beret with a tiny bat wing and a heart, a cross-shaped hairpin',
        outfit: 'a black gothic dress with sheer puffed sleeves, a laced corset waist, a red choker and a layered grey tulle skirt',
        pose: 'both hands clasped low in front, a quiet shy look',
        palette: 'black, silver-grey and pink with a red choker accent',
        awakened: GLOW('pink'),
      },
      // BP01-014 Arisaka (CR): cartoon avatar, auburn hair with red streaks, oni half-mask, yellow jacket, katana.
      'BP01-014': {
        head: CHIBI + ', swept auburn hair with red streaks over one amber eye, a white and red horned oni half-mask on the side of his head',
        outfit: 'a yellow-orange bomber jacket with a pink scribble patch over a grey tee, dark trousers, a black katana across his back',
        pose: 'one hand raised to his brow in a lazy salute',
        palette: 'yellow-orange, auburn, black and navy',
        awakened: GLOW('red'),
      },
      // BP01-016 nqrse (free agent): cartoon avatar, pink fluffy bob, big red-pink eyes, grey hoodie, white cat.
      'BP01-016': {
        head: CHIBI + ', a fluffy short pink bob with pale highlighted bangs, big round red-pink eyes, rosy cheeks, a small open mouth',
        outfit: 'a grey zip hoodie, a pink skirt, dark sneakers, and a small smiling white cat floating at one side',
        pose: 'one arm stretched out with a two-finger V gesture, one foot kicked up',
        palette: 'pink, grey, white and soft blue',
        awakened: GLOW('blue'),
      },
      // BP02-004 Hanabi Chouya (VSPO!): black bob with orange streaks, long low twin tails, orange haori.
      'BP02-004': {
        head: 'a young woman with a black blunt-fringe bob with orange streaks and long low twin tails with big orange bows, yellow-green eyes, a blue flower hairpin, tassel earrings',
        outfit: 'a wide-sleeved orange floral jacket over a short black top, a black pleated skirt with a butterfly belt buckle, black fingerless gloves',
        pose: 'one fist raised, an open-mouthed cheerful smile',
        palette: 'orange, black and navy with teal accents',
        awakened: GLOW('pink'),
      },
      // BP02-010 Kyupi Kaminari (VSPO!): tanned, blonde low twin tails, amber eyes, black denim jacket.
      'BP02-010': {
        head: 'a tanned young woman with long wavy blonde hair in two low twin tails tied with black ribbons, amber eyes, a spiked choker',
        outfit: 'a black cropped denim jacket over a white lace-up top, black denim shorts with a studded belt and a chain, a lightning-bolt charm',
        pose: 'one hand raised to her brow in a salute, the other on her hip, a big open-mouthed grin',
        palette: 'black, gold, white and amber',
        awakened: GLOW('pink'),
      },
      // BP02-014 Dogura (CR): cartoon avatar, indigo messy hair, bat wings, mantis on his head, black hoodie.
      'BP02-014': {
        head: CHIBI + ', messy indigo hair over closed eyes, silver ear piercings, a gentle smirk, small purple bat wings on his back, a bright green praying mantis perched on top of his head',
        outfit: 'a black hoodie with a purple lining, loose blue jeans and white sneakers',
        pose: 'crouched low with his forearms resting on his knees',
        palette: 'indigo, black, lime green and purple',
        awakened: GLOW('red'),
      },
      // BP03-003 Yui Hizuki (Neo-Porte): dark brown hair with red inner colour, green eyes, penguin pin, black jacket.
      'BP03-003': {
        head: 'a young woman with long straight dark brown hair with a red inner layer, green eyes, two cross-shaped hairclips, wired earbuds at her neck',
        outfit: 'a cream hoodie with a penguin plush clipped on, an oversized black jacket lined in red off one shoulder, a red pleated skirt with a ring-buckle belt',
        pose: 'standing calmly, a faint gentle smile',
        palette: 'black, crimson, cream and soft green',
        awakened: GLOW('blue'),
      },
      // BP03-004 rion (CR): cartoon avatar, spiky red hair, red eyes, panda-ear hood, striped white hoodie.
      'BP03-004': {
        head: CHIBI + ', spiky red hair under a white panda hood with round black ears and pink cheek spots, sharp red eyes, a toothy grin',
        outfit: 'a white hoodie with black sleeve stripes, black trousers and black and red sneakers',
        pose: 'squatting low, one finger hooked in the corner of his mouth',
        palette: 'white, black and red with pink spots',
        awakened: GLOW('red'),
      },
      // BP03-005 Zuzu (REJECT): mascot, chubby orange cat-like creature, red eyes, toothy grin, arms crossed.
      'BP03-005': {
        head: 'a chubby round orange cartoon cat-like mascot with big pointed ears with white fluffy tufts, a small tuft on its forehead, sharp red eyes, a wide toothy grin and a dark squiggle mark on one cheek',
        outfit: 'a plump orange furry body with a cream belly, white mitten paws and a short thick tail',
        pose: 'arms crossed over its chest in a proud confident stance',
        palette: 'orange, cream, white and red',
        awakened: GLOW('amber'),
      },
      // BP03-006 Kokage Tsumugi (VSPO!): navy bob with teal tips, grey eyes, pale-blue hooded jacket, white overalls.
      'BP03-006': {
        head: 'a young woman with a navy-blue bob fading to teal at the tips, grey eyes, a white triangle hairclip and a black bow clip, a white flower earring, a black choker',
        outfit: 'a pale blue striped hooded jacket worn off one shoulder over a navy ribbon tie, white denim overalls',
        pose: 'one hand holding the front of her jacket, a soft closed-mouth smile',
        palette: 'navy, sky blue, teal and white',
        awakened: GLOW('pink'),
      },
      // BP03-014 Kenki (free agent): the card is a PHOTO of the player, so this is a generic stylised
      // cartoon esports player, not a likeness: nothing of the face or any team marking is described.
      'BP03-014': {
        head: 'a stylised cartoon esports player, a young man with tousled black hair with a centre parting, calm serious dark eyes, a steady stoic look',
        outfit: 'a black short-sleeved team training shirt with a subtle wave pattern and white shoulder trim, black trousers',
        pose: 'standing tall with his arms relaxed at his sides',
        palette: 'black, charcoal and white with a green glow',
        awakened: GLOW('green'),
      },
      // BP04-001 Wokka (CR): cartoon avatar, brown hair, amber eyes, plaster on nose, red spiked collar, teal jacket.
      'BP04-001': {
        head: CHIBI + ', tousled brown hair fading lighter at the tips, bright amber eyes, a small green plaster across the nose, a cheeky fanged grin, a red spiked collar',
        outfit: 'a turquoise zip track jacket with a white paw print, black trousers and white sneakers',
        pose: 'one hand raised with the fingers curled like a claw, the other in a pocket',
        palette: 'turquoise, brown, black and red',
        awakened: GLOW('red'),
      },
      // BP04-002 Aria Konkon (Neo-Porte): red-pink long hair, violet eyes, black veil, wing sleeves, white bird.
      'BP04-002': {
        head: 'a young woman with long crimson-pink hair with dark streaks and a side braid, violet eyes, a black nun-style veil, a tiny white long-tailed bird on her raised hand',
        outfit: 'a black high-collared dress with a silver chain, a short grey cape and wide layered black wing-like sleeves lined in red',
        pose: 'one hand raised with the bird, an open-mouthed happy smile',
        palette: 'black, crimson, silver and white',
        awakened: GLOW('blue'),
      },
      // BP04-006 Ramune Shiranami (VSPO!): teal short hair with white streak, orange eyes, cropped denim jacket.
      'BP04-006': {
        head: 'a young woman with short wavy aqua-teal hair with a white streak and a small side braid, an ahoge, orange-red eyes, a black choker with a blue gem',
        outfit: 'a pale blue cropped denim jacket with rainbow holographic panels over a white camisole, white shorts with a ring buckle',
        pose: 'one hand shading her brow in a playful salute, an open-mouthed smile',
        palette: 'aqua, white and pastel rainbow with orange accents',
        awakened: GLOW('pink'),
      },
      // BP04-008 Kuromu Yono (VSPO!): very long lavender-blue hair, military cap, black gothic dress.
      'BP04-008': {
        head: 'a young woman with very long lavender-blue hair with two short tied side tufts, pale blue-green eyes, a black military-style cap with a small silver skull ornament, star hairclips',
        outfit: 'a black sleeveless gothic dress with a ragged hem and a high chained collar, long black studded arm sleeves',
        pose: 'one open hand reaching toward the viewer, a surprised open-mouthed look',
        palette: 'black, lavender-blue and silver',
        awakened: GLOW('pink'),
      },
      // BP04-012 Tooko (REJECT): very long blonde hair, two buns with a tiny crown, red eyes, white hoodie, red skirt.
      'BP04-012': {
        head: 'a young woman with extremely long blonde hair in two top buns with a tiny crown and a floating cyan halo ring, red eyes, a star on her cheek',
        outfit: 'a white sleeveless cropped hoodie with orange suspenders and teal trim, a layered red ruffle skirt, a brown belt with a gold star, black gloves',
        pose: 'standing with her arms straight at her sides, a calm small smile',
        palette: 'white, red, gold and teal',
        awakened: GLOW('amber'),
      },
      // BP04-013 Inui Shinichirou (REJECT): ninja, spiky brown hair, headband, red scarf, navy wave-print top.
      'BP04-013': {
        head: 'a young man with spiky brown hair, a plain navy cloth headband tied across his forehead, light green eyes, light stubble and a confident wide grin',
        outfit: 'a navy short-sleeved ninja top with a blue wave pattern over mesh, a long red scarf, black fingerless gloves and arm guards, a sword hilt over one shoulder',
        pose: 'two fingers raised in a ninja hand seal, leaning into a ready stance',
        palette: 'navy, red, brown and blue',
        awakened: GLOW('red'),
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
      // (2026-10-29 QC: "neon night market street" drew shop fronts with lettering twice; lanterns and string lights do not.)
      'ST02-015': '{ST02-002} strolls down a festival lane at night hung with plain paper lanterns and string lights, raising his gold hook cane like a guide pointer, a friendly grin, a small crowd of silhouettes following behind him',
      // Lucky Man
      'ST02-016': '{ST02-003} sprints first across a glowing finish line with both arms wide, gold coins and clover leaves raining down around him, confetti, a huge delighted grin',
      // Champion for Hire
      'ST02-017': '{ST02-002} lounges in an arena corridor with a golden trophy tucked under one arm, flicking a glowing gold coin into the air with his thumb, a confident smirk',
      // Little Video Letter
      'ST02-018': '{ST02-001} grins and waves into a small floating camera drone, holding up a tiny glowing heart, a cosy backstage room hung with fairy lights',

      // ---- Competitive decks (PLAN D19): 61 new attack / memoria scenes ----
      // [Cxx/Axx] = the deck whose leaders appear; a card used by several decks is drawn for the deck
      // where it is most central, and the leaders are spread so every new leader appears.
      // ---- Attacks ----
      // Elegant Dominate [C03 Hinano]
      'BP01-018': '{BP01-003} descends a grand staircase in an elegant sweeping pose, one hand lifting her skirt hem, glowing target orbs bursting into pink petals on every step below her, a crystal chandelier overhead',
      // Sneak Attack [C02 rion]
      'BP01-023': '{BP03-004} tiptoes out from behind a stack of crates in a dim warehouse arena with a mischievous grin, a toy-like blaster raised, a glowing target drone turned the other way, one shaft of light through the dust',
      // Flashbang [A02 Kokage]
      'BP01-027': '{BP03-006} tosses a glowing capsule over her shoulder while a blinding white burst of light fills the dark corridor behind her, one arm raised to shield her eyes, lens flare rays and fleeing target drones',
      // Booby Trap [C01 Ras]
      'BP01-043': '{ST02-004} grins from a tree branch over a jungle obstacle course, pulling a rope so that a snare yanks a glowing target drone into the air, confetti popping out of a hidden trapdoor below',
      // Link Assault [A03 nqrse + Inui]
      'BP01-044': '{BP01-016:head} and {BP04-013:head} dash side by side across a bridge of floating neon hexagon tiles over a night skyline, a long chain of glowing links passing from one to the other',
      // Crazy Burst [C04 Zuzu]
      'BP01-045': '{BP03-005} bounces wildly through the night sky above a dark open field of cheering silhouettes, a ring of rainbow fireworks bursting outward in every direction, streamers swirling around a manic grin',
      // Prank Drone [C06 Sena]
      'BP01-047': '{BP01-013} giggles behind one hand in a moonlit mansion hallway while a small round drone zooms off trailing pink streamers and dropping confetti on a gloomy party',
      // Thrifty Play [C07 Arisaka]
      'BP01-048': '{BP01-014} crouches in a half-lit arcade aisle with a tiny stack of gold coins in his palm, lining up one careful shot at a glowing prize capsule, neon light on the floor',
      // Psycho Fortress [C02 rion]
      'BP02-018': '{BP03-004} sits cross-legged with a mad grin inside a towering fortress built from cushions and crates, glowing toy-like blasters poking out of its windows, a violet twilight sky behind',
      // Overwhelming Me [C05 Hanabi]
      'BP02-023': '{BP02-004} strikes a huge confident pose in the centre of a stage under a wall of beaming spotlights, arms wide, the crowd of lightstick silhouettes leaning back from the force of her presence',
      // Dread Form [C01 Kuromu]
      'BP02-026': '{BP04-008} transforms in a swirling column of violet shadow, huge black wings unfurling behind her, pale glowing eyes, her long hair floating upward above a cracked dark platform',
      // Unstoppable [C03 Wokka]
      'BP02-032': '{BP04-001} charges straight through a wall of crumbling neon bricks with his shoulder forward and a clenched claw hand, chunks of light flying outward, a fanged grin',
      // Deadly Camp [C03 Yui]
      'BP02-035': '{BP03-003} crouches beside a small glowing campfire in a dark forest clearing, a lit tent behind her, a sly smile and a toy-like blaster across her lap, embers floating up into the starry sky',
      // Machine-gun Talk [C07 Tooko]
      'BP02-040': '{BP04-012} chatters excitedly with both hands waving while a rapid stream of glowing sparkles shoots from her toward the viewer like gunfire, her long tail swaying, a pastel pop stage',
      // General's Dignity [C05 Dogura]
      'BP02-042': '{BP02-014} sits slumped yet regal on an oversized cushion throne with the green mantis on his head like a crown, one raised hand commanding a row of silhouette target drones, deep violet spotlights',
      // Storm Rush [C02 rion + Mondo]
      'BP03-017': '{BP03-004:head} and {ST02-002:head} charge side by side through a whirlwind of confetti and neon rain, both toy-like blasters firing in rapid bursts, streaks of coloured light behind',
      // No Escape [C05 Aria]
      'BP03-018': '{BP04-002} stands at the end of a long narrow arena hallway with her black wings spread wide to fill the passage, arms open, glowing doors sliding shut along both walls, a calm smile',
      // Piercing Bullet [C03 Kyupi]
      'BP03-022': '{BP02-010} fires a sleek blaster while a single glowing bullet drills in a long spiral through a row of floating glass panes that shatter into sparkles one after another, her hair whipping back',
      // Taken Down with Shadow [C02 Mondo]
      'BP03-023': '{ST02-002} stands under a single lamp in a dim arena, his long shadow on the floor stretching into a second figure that drags a target drone down with it, the gold hook cane in his hand',
      // Ruthless Feud [A02 Zuzu + Kuromu]
      'BP03-027': '{BP03-005:head} and {BP04-008:head} glare at each other across a rain-slick dark alley lit only by bare neon tubes, lightning cracking between their raised fists, steam rising from the pavement',
      // Power Setup [A02 Kokage]
      'BP03-028': '{BP03-006} kneels beside a glass-sided gaming PC tower glowing blue, tightening a cable with a screwdriver, a headset around her neck, glowing cables looping across a tidy practice-room floor',
      // Demon's Pursuit [C01 Mondo]
      'BP03-032': '{ST02-002} chases a glowing target drone along a rooftop at red dusk, hook cane extended, a feral grin, a faint demonic afterimage of horns and wings in the clouds behind him',
      // Looting Feast [C05 Dogura + Aria]
      'BP03-038': '{BP02-014:head} and {BP04-002:head} laugh and grab at a banquet table piled with glowing gold food and gems, warm chandelier light',
      // Breaching Force [C04 Inui]
      'BP03-042': '{BP04-013} kicks open a heavy door in a burst of splinters and white light, scarf streaming, a stunned target drone inside the dark room, a ready stance',
      // 1TAP [C07 Wokka]
      'BP04-018': '{BP04-001} flicks one finger like a trigger pull toward a single glowing target far down a shooting range, a perfect bullseye ring flaring, one brass casing spinning in the air',
      // World Class [C07 Ramune]
      'BP04-020': '{BP04-006} spins a glowing glass globe on one fingertip with an easy smile, constellations of stars wheeling around her over a polished dark stage, a spotlit master pose',
      // Overdrive [C04 Kenki]
      'BP04-024': '{BP03-014} enters overdrive on a night racetrack, a ring of speed dials and rev-light arcs blazing green around him, hair blown back, narrowed eyes, long motion streaks',
      // Synchro Trinity [C07 Ramune + Tooko]
      'BP04-028': '{BP04-006:head} and {BP04-012:head} strike mirrored poses on a glowing platform, interlocking rings of light linking their hands, a ripple of pastel light spreading at their feet',
      // Shield Slam [A02 Zuzu]
      'BP04-030': '{BP03-005} charges forward behind a big round glowing shield and slams through a wall of target drones, shockwave rings spreading, a toothy grin',
      // Invasion Begins [C07 Tooko]
      'BP04-037': '{BP04-012} marches across a plain pastel carpet at the head of a parade of chunky toy soldiers toward a toy castle, bare soft-coloured walls, one arm pointing forward, a confident smile',
      // Annihilation [C01 Kuromu + Ras]
      'BP04-038': '{BP04-008:head} kneels on one knee beside {ST02-004:head}, the tiny cat avatar at her side at half her height, looking up as an enormous column of multicoloured light erupts from the stage behind them, shockwave rings and flying sparkles',
      // Great Whirlwind [A03 Inui]
      'BP04-039': '{BP04-013} spins like a top on a sunset rooftop with his red scarf and a swirling tornado of leaves and petals around him, arms spread wide',
      // Earth Surfer [A03 nqrse]
      'BP04-041': '{BP01-016} surfs down a giant curve of earth on a rolling slab of cracked ground, the white cat clinging on, dust clouds and rocks flying, a canyon sunset behind',

      // ---- Memoria ----
      // Must Not Laugh [A01 Hinano]
      'BP01-059': '{BP01-003} presses both hands over her mouth with puffed cheeks and eyes squeezed shut, tears of suppressed laughter, trembling in a spotlit comedy studio while confetti pops around her',
      // Escape Successful [C02 Mondo]
      'BP01-061': '{ST02-002} slides under a closing neon shutter at the last second with a gold trophy under one arm and a triumphant grin, dust kicked up, a bright glow left behind',
      // Pioneer's Mark [C03 Wokka]
      'BP01-071': '{BP04-001} leaps first across a gap between floating rock islands holding a lantern of golden light high to light the path for silhouettes waiting behind, wind in his jacket',
      // Pass the Baton [C06 Sena + Hanabi]
      'BP01-083': '{BP01-013:head} and {BP02-004:head} hand off a glowing relay baton mid-stride on a curving neon track, their hands meeting, streaks of light connecting them',
      // Beyond Morals [A03 nqrse]
      'BP01-088': '{BP01-016} bursts out of a shattering frame of glowing glass with a mischievous grin, one foot over the edge, shards of pink light flying, the white cat swooping past',
      // Itadakimasu [A01 rion]
      'BP02-046': '{BP03-004} presses his palms together happily before a counter piled with giant glowing dumplings and fried treats, steam curling up, warm lantern light in a cosy night food stall',
      // First Cheer [C05 Hanabi]
      'BP02-051': '{BP02-004} steps to the stage edge for the first time with wide delighted eyes and hands clasped to her chest, a sea of glowing lightsticks waving in the dark crowd, a soft orange spotlight',
      // King of Scorched Earth [C07 Ramune]
      'BP02-054': '{BP04-006} stands on a smoking cracked plateau with a cool smirk, one foot on a toppled target drone, embers and ash drifting, glowing lava seams in the ground',
      // Gal Style [C03 Kyupi]
      'BP02-063': '{BP02-010} poses for a selfie with a small glittery camera held at arm\'s length, tongue peeking out, pastel glitter and heart-shaped bokeh lights in a bright pink-lit dressing room',
      // Just Eat Chicken! (in all ten decks; drawn for nqrse, who is in four) [A01 nqrse]
      'BP02-068': '{BP01-016} hoists a giant golden fried drumstick overhead like a championship trophy, the white cat dancing at one side, confetti and sparkles, a triumphant grin',
      // Devil of First Strike [C05 Aria]
      'BP02-070': '{BP04-002} summons a swirl of small playful imp-like shadows with a sly smile, dark wings flared, crimson light rising from below, one finger raised',
      // Festival Opening [C05 Hanabi + Yui]
      'BP03-050': '{BP02-004:head} and {BP03-003:head} pull the cord of a giant firework launcher together at dusk while the first huge firework bursts overhead, plain paper lanterns lining a festival path',
      // Blatant Provocation [A01 Mondo]
      'BP03-051': '{ST02-002} beckons toward the viewer with one finger and a smirk, leaning back with one boot on a glowing platform, the gold hook cane twirling, a red spotlight',
      // Master of the Arena [C01 Kuromu]
      'BP03-053': '{BP04-008} sits on a throne at the centre of a vast circular arena with one leg crossed and her chin on her hand, tiers of crowd silhouettes all around, dark lavender light',
      // 22Hz [A02 Kokage]
      'BP03-055': '{BP03-006} sits with large headphones on and eyes closed, a deep bass wave drawn as rings of blue light rippling across a dark room, floating speakers pulsing',
      // Champagne Call [A02 nqrse + Zuzu]
      'BP03-056': '{BP01-016:head} and {BP03-005:head} cheer with tall glasses of golden fizzing soda beside a glittering tower of glasses, sparkling bubbles rising, warm lounge lights',
      // We are...! [C07 Arisaka + Tooko]
      'BP03-059': '{BP01-014:head} and {BP04-012:head} stand on the bow of a big ship at sunrise, each thrusting one fist toward the sky, wind in their hair, a golden sea below',
      // Popular Food Truck [C04 Zuzu]
      'BP03-070': '{BP03-005} cheerfully serves steaming skewers through the window of a small food truck with a striped awning, a long queue of silhouettes under glowing string lights on a warm night street',
      // Careful Preparation [C07 Wokka]
      'BP04-048': '{BP04-001} sits on a bench tying his sneaker beside neat rows of gadgets laid out on a plain dark floor before a match, bare walls, a calm focused look, warm backstage light',
      // What is This Guy... [C05 Hanabi + Dogura]
      'BP04-049': '{BP02-004:head} gapes in confused shock with a sweat drop at {BP02-014:head}, who sits placidly with the mantis on his head sipping a drink, a bright stage corner',
      // Peaceful Moment [C07 Ramune]
      'BP04-053': '{BP04-006} sips a warm drink on a sunny balcony garden with her eyes closed and a content smile, petals drifting in the breeze under a quiet blue sky',
      // After-school Remedial Class [A03 nqrse + Kenki]
      'BP04-054': '{BP01-016:head} and {BP03-014:head} doze and yawn at neighbouring school desks in an empty classroom lit gold by the sunset, a paper plane gliding past',
      // Big Whip (name unclear) [C07 Ramune]
      'BP04-056': '{BP04-006} cracks an enormous glowing ribbon-like whip of aqua light in a wide arc across a pastel stage, a cheeky smile, sparkles scattering',
      // See You Again [C01 Kuromu]
      'BP04-058': '{BP04-008} waves goodbye with a soft smile and one lifted hand at the end of a long glowing platform at dusk, a sunset city beyond, her long hair drifting, a trail of petals',
      // Rite of Passage [C03 Yui]
      'BP04-061': '{BP03-003} steps quietly through a tall glowing gateway arch hung with petals, a small calm smile, a path of plain lanterns behind her',
      // On a Snowy Night [C07 Tooko]
      'BP04-065': '{BP04-012} stands in falling snow on a quiet street at night holding a glowing lantern, her breath visible, wrapped in a thick red scarf, soft blue and gold light',
      // Harvest Time [C06 Sena]
      'BP04-066': '{BP01-013} gathers glowing pumpkins into a wicker basket in a moonlit field with a gentle smile, a scarecrow silhouette and drifting fireflies, harvest-gold light',
      // Little Empress [C06 Hanabi]
      'BP04-067': '{BP02-004} sits proudly on a tall velvet cushion throne wearing a tiny golden crown, legs swinging, a toy sceptre in one hand, a short red carpet, a mock-solemn look',
      // Strongest of the Abyss [C04 Inui + Zuzu]
      'BP04-069': '{BP04-013:head} and {BP03-005:head} stand shoulder to shoulder on the lip of a vast glowing chasm, backs to the viewer, a pale light rising from the depths and lifting their scarf and fur',
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
      // (2026-10-29 QC: "geometric patterns" drew an emblem with glyph-like marks in the centre; plain stripes do not.)
      '024': 'a glowing holographic pass card floating at a slight angle, a rainbow foil sheen and plain shimmering diagonal stripes, edges lit with {accent} light',
      // PP card
      '025': 'a radiant faceted crystal power gem floating above a small round pedestal with orbiting sparks, shining with {accent} light',

      // ---- Competitive decks (PLAN D19): 13 new tactics, keyed by the full card number (the
      // suffixes 076-080 repeat across products, so the starter suffix keys cannot hold them).
      // Equipment is drawn as wearable / attachable gear. Colourless cards share one clause.
      // Strategic Radar
      'BP01-092': 'a sleek round radar dish on a slim tripod sweeping a fan of glowing light across a dark stage floor, soft ping rings rippling outward, shining with {accent} light',
      // Jamming Pulse
      'BP01-093': 'a chunky pulse emitter with a glowing dome, concentric shockwave rings spreading from it and jagged sparks of static crackling at the edges, on a dark stage floor, shining with {accent} light',
      // Revival Portal
      'BP01-094': 'a tall arched ring-shaped gateway of glowing light standing on a dark stage floor, swirling radiance inside it and a small crystal heart floating up through the centre, shining with {accent} light',
      // Drain Rod
      'BP02-076': 'a slender metal rod wrapped in a glowing coil, ribbons of green healing light flowing into one end and a streak of sharp magenta energy shooting out of the other, shining with {accent} light',
      // Thief Kit (equipment)
      'BP02-078': 'a wearable black utility belt with a rolled pouch of slim lockpicks, a small grappling hook and a glowing clasp ready to attach to a harness, laid on a dark stage floor, touches of {accent} light',
      // Power Field
      'BP03-077': 'a round field projector disc on a dark stage floor casting a tall translucent dome of shimmering energy with soft hexagon patterns, shining with {accent} light',
      // Firecracker
      'BP03-078': 'a fat bundle of red cartoon firecrackers with a short sparking fuse, bursting stars of colour and smoke puffs around it, floating over a dark stage floor, shining with {accent} light',
      // Target Flag
      'BP03-079': 'a tall slim marker pole topped with a glowing bullseye disc and a long ribbon of light streaming from it, planted on a dark stage floor, shining with {accent} light',
      // Cyber Armor (equipment)
      'BP03-080': 'a sleek segmented chest armour with glowing seams, rounded shoulder plates and a clasp ring for attaching to a harness, hovering over a dark stage floor, shining with {accent} light',
      // Item Shop
      'BP04-076': 'an open treasure crate overflowing with shimmering gadgets, bottled potions, gems and a small gold coin purse, soft sparkles drifting above it, on a dark stage floor, shining with {accent} light',
      // Subjugation Quest
      'BP04-079': 'a huge curved monster horn mounted on a polished wooden plinth with a small glowing sword leaning beside it, rays of light rising behind, shining with {accent} light',
      // Cursed Doll
      'BP04-080': 'a small stitched plush doll with button eyes and a crooked grin, dark purple wisps curling around it and glowing red threads trailing from its hands, on a dark stage floor, touches of {accent} light',
    },
    accents: {
      ST01: 'cyan and pink',
      ST02: 'red and gold',
      // The tactics of the competitive decks are keyed by product (BP01..BP04), one glow pair each.
      BP01: 'amber and cyan',
      BP02: 'violet and gold',
      BP03: 'lime and magenta',
      BP04: 'teal and coral',
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
