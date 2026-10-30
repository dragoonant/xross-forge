// Our English rendering of every card of a registered deck (ST01, ST02 and the ten competitive decks, PLAN D19), in our own words (PLAN D16).
// Hand-written: `nameEn` is an English name we chose, `text` restates the printed effect in plain
// English with the same numbers, targets and conditions. The Japanese printed text is NOT kept in
// the repo; the printed-vs-compiled auditor (M2) reads the gitignored docs/sources/api/all-cards.json.
//
// Vocabulary (docs/card-text-grammar.md): timing tags stay as bracketed keywords [On Play],
// [Attack], [After Attack], [Attack Boost], [On Awaken], [Round]. Keyword tags added for the competitive
// decks: [Overkill N] (a rider on an [After Attack] line: "[After Attack] [Overkill 20] Recover 1 PP." with the
// reminder in parentheses) and [Echo] (reserved for echo memoria; none in the ten decks yet). The full
// bracket list the data tests accept: On Play, Attack, After Attack, Attack Boost, On Awaken, Round,
// Overkill N, Echo. "Opposing leader" = a leader of the
// opponent; "other opposing leader" = an opposing leader other than the one that received this
// attack. "Heal" = remove damage counters; "Recover N PP" = turn N spent PP upright.
//
// Consumed by tools/build-cards.mjs (it embeds the entries into data/cards.js) and checked by
// tools/validate-data.mjs. Pages do not load this file. No Japanese characters allowed here, except the
// nameEn of the leaders listed in XS.NAME_KEPT_JA at the bottom (explicit, per card number).
(function () {
  const XS = (globalThis.XS = globalThis.XS || {});

  // Shared entries: the same card printed in both starters has one rendering.
  const ADRENALINE = { nameEn: 'Adrenaline', text: '[On Play] Draw 1 card.\n[Attack Boost] Your next attack deals +40 damage.' };
  const ENERGY_CHARGER = { nameEn: 'Energy Charger', text: '[On Play] Recover 1 PP and draw 1 card.' };
  const FIRST_AID = { nameEn: 'First Aid Kit', text: '[On Play] Heal your leaders by 80 in total. (You may choose more than one leader.)' };
  const SPECIAL_ROUND = { nameEn: 'Special Round', text: '[Attack Boost] Your next attack deals +80 damage.' };
  const LIGHT_SHIELD = { nameEn: 'Light Shield', text: 'HP +30' };
  const PP_TICKET = {
    nameEn: 'PP Ticket',
    text: 'This card cannot be put in a tactics deck.\nAfter the tactics cards for round 1 have been chosen, the player going second places this card in their tactics area.\n\n[On Play] Recover 1 PP.',
  };
  const PP_CARD = { nameEn: 'PP Card', text: 'A Play Point card. Upright, it is 1 PP you can spend; sideways, it has been spent.' };
  const SUMMIT = { nameEn: 'Summit Reached', text: '[On Play] If 3 of your leaders are down, draw 1 card.\n[Attack Boost] Your next attack deals +40 damage.' };
  const LUCKY_MAN = { nameEn: 'Lucky Man', text: '[On Play] If 3 of your leaders are down, draw 1 card.\n[Attack Boost] Your next attack deals +40 damage.' };

  XS.TEXT_EN = {
    // ---- ST01 First Glory (VSPO!) --------------------------------------------------------
    'ST01-001': { nameEn: 'Uruha Ichinose', text: '[On Awaken] Draw 1 card.' },
    'ST01-002': { nameEn: 'Toto Kogara', text: '[On Awaken] Deal 10 damage to 1 opposing leader.' },
    'ST01-003': { nameEn: 'Sumire Kaga', text: '[On Awaken] Deal 10 damage to every opposing leader.' },
    'ST01-004': { nameEn: 'Nazuna Kaga', text: '[On Awaken] Heal 1 of your leaders by 20.' },
    'ST01-005': { nameEn: 'Crossfire', text: '[Attack] If all your leaders have the "VSPO!" tag, the leader that received this attack goes down.' },
    'ST01-006': { nameEn: 'Risky Entry', text: '[Attack]\n[After Attack] Draw 1 card, then discard 1 card from your hand.' },
    'ST01-007': { nameEn: 'Bounty Hunter', text: '[Attack]\n[After Attack] Deal 40 damage to 1 other opposing leader.' },
    'ST01-008': { nameEn: 'Winning Blow', text: '[Attack]\n[After Attack] If the leader that received this attack is down, draw 1 card.' },
    'ST01-009': { nameEn: 'Proof of Strength', text: '[Attack]\n[After Attack] Deal 10 damage to 1 other opposing leader.' },
    'ST01-010': { nameEn: 'Critical Shot', text: '[Attack] Damage +70.' },
    'ST01-011': { nameEn: 'Cool Head', text: '[Attack] Damage +10.' },
    'ST01-012': { nameEn: 'Blind Shot', text: '[Attack]\n[After Attack] If you have 2 or more memoria cards in your play area, deal 10 damage to every other opposing leader.' },
    'ST01-013': { nameEn: 'Gambit Master', text: '[Attack Boost] Your next attack deals +50 damage.' },
    'ST01-014': { nameEn: 'In the Zone', text: '[Attack Boost] Your next attack deals +80 damage.' },
    'ST01-015': { nameEn: 'Messy Room Dweller', text: '[Attack Boost] Your next attack deals +60 damage.' },
    'ST01-016': {
      nameEn: 'First Glory',
      text: '[Attack Boost] Your next attack deals +30 damage.\n[After Attack] Deal damage to 1 other opposing leader: 10 for each of your leaders that has the "VSPO!" tag.',
    },
    'ST01-017': SUMMIT,
    'ST01-018': { nameEn: 'Interviewer', text: '[On Play] Heal 1 of your leaders by 30.\n[Attack Boost] Your next attack deals +30 damage.' },
    'ST01-019': ADRENALINE,
    'ST01-020': ENERGY_CHARGER,
    'ST01-021': FIRST_AID,
    'ST01-022': SPECIAL_ROUND,
    'ST01-023': LIGHT_SHIELD,
    'ST01-024': PP_TICKET,
    'ST01-025': PP_CARD,

    // ---- ST02 Advent of the Demon King (CR) ------------------------------------------------
    'ST02-001': { nameEn: 'Selly', text: '[On Awaken] Deal 10 damage to 1 opposing leader.' },
    'ST02-002': { nameEn: 'Mondo', text: '[On Awaken] Heal 1 of your leaders by 20.' },
    'ST02-003': { nameEn: 'Cpt', text: '[On Awaken] Draw 1 card.' },
    'ST02-004': { nameEn: 'Ras', text: '[On Awaken] Deal 10 damage to every opposing leader.' },
    'ST02-005': { nameEn: 'Otherworldly Kick', text: '[Attack]\n[After Attack] Deal 10 damage to 1 other opposing leader.' },
    'ST02-006': { nameEn: 'Wild Prank', text: '[Attack]\n[After Attack] Draw 1 card, then discard 1 card from your hand.' },
    'ST02-007': { nameEn: 'Impact Shot', text: '[Attack] Damage +40.' },
    'ST02-008': { nameEn: 'Killing Spree', text: '[Attack]\n[After Attack] If the leader that received this attack is down, deal 20 damage to 1 other opposing leader.' },
    'ST02-009': { nameEn: "Demon King's Descent", text: '[Attack] If all your leaders have the "CR" tag, the leader that received this attack goes down.' },
    'ST02-010': { nameEn: 'Counter Snipe', text: '[Attack]\n[After Attack] If you have 2 or fewer cards in your hand, deal 20 damage to 1 other opposing leader.' },
    'ST02-011': { nameEn: 'Multi Grenade', text: '[Attack]\n[After Attack] Deal 20 damage to every other opposing leader.' },
    'ST02-012': {
      nameEn: 'Unchanging Bond',
      text: '[Attack Boost] Your next attack deals +30 damage.\n[After Attack] Deal damage to 1 other opposing leader: 10 for each of your leaders that has the "CR" tag.',
    },
    'ST02-013': { nameEn: 'Great Glory', text: '[Attack Boost] Your next attack deals +80 damage.' },
    'ST02-014': { nameEn: 'Close Call', text: '[On Play] Draw 2 cards.' },
    'ST02-015': { nameEn: 'Tour Guide', text: '[Attack Boost] Your next attack deals +50 damage.' },
    'ST02-016': LUCKY_MAN,
    'ST02-017': { nameEn: 'Champion for Hire', text: '[Attack Boost] Your next attack deals +60 damage.' },
    'ST02-018': { nameEn: 'Little Video Letter', text: '[Attack Boost] Your next attack deals +50 damage.\n[After Attack] Deal 10 damage to 1 other opposing leader.' },
    'ST02-019': ADRENALINE,
    'ST02-020': ENERGY_CHARGER,
    'ST02-021': FIRST_AID,
    'ST02-022': SPECIAL_ROUND,
    'ST02-023': LIGHT_SHIELD,
    'ST02-024': PP_TICKET,
    'ST02-025': PP_CARD,

    // ---- Competitive decks (PLAN D19): cards that appear in C01-C07 / A01-A03 ---------------------
    // Leaders (BP01-BP04). The talent's own Latin spelling is kept where the name is Latin (nqrse, rion);
    // Hinano Tachibana and Kuromu Yano are the spellings the owner gave. Every other Japanese leader name
    // is listed in XS.NAME_KEPT_JA below and keeps the Japanese name in nameEn (no romanisation is sourced).
    'BP01-003': { nameEn: 'Hinano Tachibana', text: '[On Awaken] Draw 2 cards, then discard 2 cards from your hand.' },
    'BP01-013': { nameEn: '空澄セナ', text: '[On Awaken] Draw 2 cards, then discard 2 cards from your hand.' },
    'BP01-014': { nameEn: 'ありさか', text: '[On Awaken] Draw 1 card.' },
    'BP01-016': { nameEn: 'nqrse', text: '[On Awaken] Deal 10 damage to 1 opposing leader.' },
    'BP02-004': { nameEn: '蝶屋はなび', text: '[On Awaken] Draw 1 card.' },
    'BP02-010': { nameEn: '神成きゅぴ', text: '[On Awaken] Deal 10 damage to every opposing leader.' },
    'BP02-014': { nameEn: 'どぐら', text: '[On Awaken] Deal 10 damage to every opposing leader.' },
    'BP03-003': { nameEn: '緋月ゆい', text: '[On Awaken] Draw 2 cards, then discard 2 cards from your hand.' },
    'BP03-004': { nameEn: 'rion', text: '[On Awaken] Deal 10 damage to every opposing leader.' },
    'BP03-005': { nameEn: 'ズズ', text: '[On Awaken] Draw 1 card.' },
    'BP03-006': { nameEn: '紡木こかげ', text: '[On Awaken] Deal 20 damage to 1 opposing leader.' },
    'BP03-014': { nameEn: 'けんき', text: '[On Awaken] Draw 1 card.' },
    'BP04-001': { nameEn: 'うぉっか', text: '[On Awaken] Draw 1 card.' },
    'BP04-002': { nameEn: '昏昏アリア', text: '[On Awaken] Heal 1 of your leaders by 20.' },
    'BP04-006': { nameEn: '白波らむね', text: '[On Awaken] Deal 20 damage to 1 opposing leader.' },
    'BP04-008': { nameEn: 'Kuromu Yano', text: '[On Awaken] Heal 1 of your leaders by 20.' },
    'BP04-012': { nameEn: 'とおこ', text: '[On Awaken] Deal 20 damage to 1 opposing leader.' },
    'BP04-013': { nameEn: '乾伸一郎', text: '[On Awaken] Deal 10 damage to 1 opposing leader.' },

    // Attack cards.
    'BP01-018': { nameEn: 'Elegant Domination', text: '[Attack]\n[After Attack] Deal 20 damage to 1 other opposing leader.' },
    'BP01-023': { nameEn: 'Sneak Strike', text: '[Attack] Damage +10.' },
    'BP01-027': { nameEn: 'Flashbang', text: '[Attack]\n[After Attack] Deal 20 damage to 1 other opposing leader.' },
    'BP01-043': { nameEn: 'Booby Trap', text: '[Attack]\n[After Attack] If the leader that received this attack is down, draw 1 card.' },
    'BP01-044': {
      nameEn: 'Link Assault',
      text: '[Attack]\n[After Attack] Look at the top 3 cards of your deck. You may play 1 memoria card with cost 1 or less from among them without paying its cost. Put the rest into the trash. (The effect of the played card is carried out after this attack ends.)',
    },
    'BP01-045': { nameEn: 'Crazy Burst', text: '[Attack]\n[After Attack] Deal 10 damage to every other opposing leader.' },
    'BP01-047': { nameEn: 'Prank Drone', text: '[Attack]\n[After Attack] If you have 2 or more memoria cards in your play area, deal 20 damage to 1 other opposing leader.' },
    'BP01-048': { nameEn: 'Thrifty Play', text: '[Attack] Damage -20.' },
    'BP02-018': { nameEn: 'Psycho Fortress', text: '[Attack] If the attacker is awakened, damage +10.' },
    'BP02-023': { nameEn: 'Overwhelming Me!!', text: '[Attack]\n[After Attack] If the leader that received this attack is down, draw 1 card.' },
    'BP02-026': { nameEn: 'Dread Form', text: '[Attack]\n[After Attack] Deal 10 damage to 1 other opposing leader.' },
    'BP02-032': { nameEn: 'Unstoppable', text: '[Attack] If this is round 3, damage +20.' },
    'BP02-035': {
      nameEn: 'Deadly Camp',
      text: '[Attack]\n[After Attack] [Overkill 20] Recover 1 PP. (If the damage dealt to the leader that received this attack exceeded its remaining HP by 20 or more, recover 1 PP.)',
    },
    'BP02-040': { nameEn: 'Machine-Gun Talk', text: '[Attack]\n[After Attack] Draw 1 card, then discard 1 card from your hand.' },
    'BP02-042': { nameEn: "Captain's Dignity", text: '[Attack]\n[After Attack] If the leader that received this attack is down, your opponent discards 1 card from their hand.' },
    'BP03-017': { nameEn: 'Storm Rush', text: '[Attack]\n[Attack]\n[Attack]\n(For each attack, choose the attacker and the leader that will receive it.)' },
    'BP03-018': { nameEn: 'No Escape', text: '[Attack]\n[After Attack] If this is round 3, deal 20 damage to 1 other opposing leader.' },
    'BP03-022': { nameEn: 'Piercing Bullet', text: '[Attack] Damage +10.' },
    'BP03-023': {
      nameEn: 'Shadow Companion',
      text: '[Attack]\n[After Attack] [Overkill 10] Deal 30 damage to 1 other opposing leader. (If the damage dealt to the leader that received this attack exceeded its remaining HP by 10 or more, deal 30 damage to 1 other opposing leader.)',
    },
    'BP03-027': { nameEn: 'Ruthless Feud', text: '[Attack] You may discard 1 card from your hand at random. If you do, damage +30.' },
    'BP03-028': { nameEn: 'Power Setup', text: '[Attack]\n[After Attack] If the leader that received this attack is down, draw 1 card.' },
    'BP03-032': { nameEn: "Ogre's Pursuit", text: '[Attack]\n[After Attack] Deal 10 damage to 1 other opposing leader.' },
    'BP03-038': { nameEn: 'Feast of Plunder', text: '[Attack]\n[After Attack] If the leader that received this attack is down, draw 1 card and your opponent discards 1 card from their hand.' },
    'BP03-042': {
      nameEn: 'Breaching Force',
      text: '[Attack]\n[After Attack] [Overkill 20] Recover 1 PP. (If the damage dealt to the leader that received this attack exceeded its remaining HP by 20 or more, recover 1 PP.)',
    },
    'BP04-018': { nameEn: '1TAP', text: '[Attack]\n[After Attack] Draw 1 card, then discard 1 card from your hand.' },
    'BP04-020': { nameEn: 'World Class', text: '[Attack] Damage -20.' },
    'BP04-024': {
      nameEn: 'Overdrive',
      text: '[Attack] Reveal up to 2 cards from your hand and discard them. For each attack card discarded this way, damage +30. For each memoria card discarded this way, draw 2 cards.',
    },
    'BP04-028': {
      nameEn: 'Synchro Trinity',
      text: '[Attack]\n[After Attack] Look at the top 3 cards of your deck. You may reveal 1 non-ACE card with cost 0 from among them and add it to your hand. Put the rest into the trash.',
    },
    'BP04-030': { nameEn: 'Shield Slam', text: '[Attack] Damage +10.' },
    'BP04-037': { nameEn: 'Invasion Begins', text: '[Attack]\n[After Attack] If the leader that received this attack is down, draw 1 card.' },
    'BP04-038': {
      nameEn: 'Annihilation',
      text: '[Attack] If all your leaders are different colours, damage +30.\n[After Attack] If all your leaders are different colours, deal 30 damage to 1 other opposing leader, heal 1 of your leaders by 30, and draw 1 card.',
    },
    'BP04-039': { nameEn: 'Great Whirlwind', text: '[Attack] If the attacker is awakened, damage +10.' },
    'BP04-041': {
      nameEn: 'Earth Surfer',
      text: '[Attack]\n[After Attack] [Overkill 30] Draw 2 cards. (If the damage dealt to the leader that received this attack exceeded its remaining HP by 30 or more, draw 2 cards.)',
    },

    // Memoria cards.
    'BP01-059': { nameEn: 'No Laughing Allowed', text: '[Attack Boost] Your next attack deals +60 damage.' },
    'BP01-061': { nameEn: 'Clean Getaway', text: '[On Play] All players draw 1 card.\n[Attack Boost] Your next attack deals +50 damage.' },
    'BP01-071': { nameEn: "Pioneer's Mark", text: '[On Play] For this turn, every leader of yours gets +30 ATK.' },
    'BP01-083': { nameEn: 'Pass the Baton', text: '[Attack Boost] Your next attack deals +60 damage.' },
    'BP01-088': { nameEn: 'Breaking Morals', text: '[On Play] All players draw 1 card.\n[Attack Boost] Your next attack deals +50 damage.' },
    'BP02-046': { nameEn: 'Dig In!', text: '[Attack Boost] Your next attack deals +50 damage.' },
    'BP02-051': { nameEn: 'First Cheer', text: '[Attack Boost] Your next attack deals +60 damage.' },
    'BP02-054': { nameEn: 'King of the Scorched Earth', text: '[On Play] Draw 1 card, then discard 1 card from your hand.' },
    'BP02-063': { nameEn: 'Gal Style', text: '[On Play] Draw 1 card.\n[Attack Boost] Your next attack deals +30 damage.' },
    'BP02-068': { nameEn: 'Just Eat Chicken!', text: '[On Play] If this is round 3, draw 1 card.\n[Attack Boost] Your next attack deals +40 damage.' },
    'BP02-070': { nameEn: 'First-Strike Demon', text: '[Attack Boost] Your next attack deals +60 damage.' },
    'BP03-050': { nameEn: 'Festival Opening', text: '[On Play] Draw 1 card.\n[Attack Boost] Your next attack deals +30 damage.' },
    'BP03-051': { nameEn: 'Blatant Taunt', text: '[Attack Boost] Your next attack deals +30 damage.\n[After Attack] Deal 30 damage to 1 other opposing leader.' },
    'BP03-053': { nameEn: 'Lord of the Arena', text: '[Attack Boost] Your next attack deals +50 damage.' },
    'BP03-055': { nameEn: '22HZ♪', text: '[Attack Boost] Your next attack deals +60 damage.' },
    'BP03-056': { nameEn: 'Champagne Call!', text: '[On Play] If you have 1 or more attack cards in your play area, draw 1 card.\n[Attack Boost] Your next attack deals +40 damage.' },
    'BP03-059': {
      nameEn: 'We are...!',
      text: '[On Play] If you have 2 or more attack cards in your play area, heal 1 of your leaders by 30 and draw 2 cards.\n[Attack Boost] If you have 3 or more memoria cards in your play area, your next attack deals +70 damage. (Count the memoria cards when this [Attack Boost] is carried out.)',
    },
    'BP03-070': { nameEn: 'Popular Food Truck', text: '[Attack Boost] Your next attack deals +60 damage.' },
    'BP04-048': { nameEn: 'Careful Preparation', text: '[On Play] Draw 2 cards.' },
    'BP04-049': { nameEn: 'Who Is This Guy...', text: '[On Play] All players discard 1 card from their hand.\n[Attack Boost] Your next attack deals +50 damage.' },
    'BP04-053': { nameEn: 'Calm Moment', text: '[On Play] Heal 1 of your leaders by 10.\n[Attack Boost] Your next attack deals +10 damage.' },
    'BP04-054': { nameEn: 'After-School Remedial Class', text: '[Attack Boost] Your next attack deals +50 damage.' },
    'BP04-056': { nameEn: 'Whip-Crack Tune', text: '[On Play] Deal 20 damage to 1 opposing leader.' },
    'BP04-058': { nameEn: 'See You Again', text: '[Attack Boost] Your next attack deals +60 damage.' },
    'BP04-061': { nameEn: 'Rite of Passage', text: '[Attack Boost] Your next attack deals +50 damage.' },
    'BP04-065': {
      nameEn: 'On a Snowy Night',
      text: '[Attack Boost] If you have 3 or more memoria cards in your play area, your next attack deals +30 damage. (Count the memoria cards when this [Attack Boost] is carried out.)',
    },
    'BP04-066': {
      nameEn: 'Harvest Hour',
      text: '[On Play] Deal 20 damage to 1 opposing leader. Draw 1 card.\n[After Attack] If the attacker is green, you may play 1 cost-1 memoria card from your hand without paying its cost. If the attacker is red, you may play 1 cost-1 attack card from your hand without paying its cost.',
    },
    'BP04-067': { nameEn: 'Little Empress', text: '[Attack Boost] Your next attack deals +50 damage.' },
    'BP04-069': { nameEn: 'Champions of the Abyss', text: '[Attack Boost] Your next attack deals +60 damage.' },

    // Tactics cards.
    'BP01-092': { nameEn: 'Strategic Radar', text: '[On Play] Draw 2 cards.' },
    'BP01-093': { nameEn: 'Jamming Pulse', text: '[On Play] Your opponent discards 2 cards from their hand.' },
    'BP01-094': {
      nameEn: 'Revival Portal',
      text: 'You can play this card only if more of your leaders are down than your opponent\'s.\n\n[On Play] Revive 1 of your down leaders (it is no longer down). Put every card that leader has equipped into the trash, face up.',
    },
    'BP02-076': {
      nameEn: 'Drain Rod',
      text: '[On Play] Heal your leaders by 40 in total. (You may choose more than one leader.) Deal damage to 1 opposing leader equal to the amount healed by this card\'s effect.',
    },
    'BP02-078': {
      nameEn: 'Thief Kit',
      text: 'The leader equipped with this has the following ability:\n"[After Attack] If the leader that received this attack is down, draw 1 card. This effect can trigger only once per turn."',
    },
    'BP03-077': { nameEn: 'Power Field', text: '[Round] For this round, every leader of yours gets +10 ATK.\n(This card is not put into the trash at the end of the turn.)' },
    'BP03-078': { nameEn: 'Firecracker', text: '[On Play] Deal 10 damage to every opposing leader. Draw 1 card.' },
    'BP03-079': { nameEn: 'Target Flag', text: 'If your opponent can attack the leader equipped with this, your opponent can attack only that leader.' },
    'BP03-080': {
      nameEn: 'Cyber Armor',
      text: 'If the leader equipped with this is not awakened, its base HP becomes 140. If the leader equipped with this is awakened, its base HP becomes 170.',
    },
    'BP04-076': { nameEn: 'Item Shop', text: '[On Play] Put every face-down card in your trash into your deck and shuffle your deck. Draw 2 cards.' },
    'BP04-079': { nameEn: 'Subjugation Quest', text: '[On Play] Look at the top 7 cards of your deck. Add 1 of them to your hand. Put the rest into the trash.' },
    'BP04-080': { nameEn: 'Cursed Doll', text: '[On Play] Your opponent discards 1 card from their hand.\n[Attack Boost] Your next attack deals +40 damage.' },
  };

  // Leaders whose nameEn deliberately stays the Japanese printed name: no romanisation of the talent's
  // name is sourced in the repo or the research (the owner gave only Hinano Tachibana and Kuromu Yano),
  // and the rule is never to invent one. tools/validate-data.mjs accepts Japanese in nameEn for exactly
  // these card numbers, and only when nameEn equals the printed name. Replace the entry (and delete the
  // number here) once the talent's own spelling is known.
  XS.NAME_KEPT_JA = {
    'BP01-013': 'no sourced romanisation',
    'BP01-014': 'no sourced romanisation',
    'BP02-004': 'no sourced romanisation',
    'BP02-010': 'no sourced romanisation',
    'BP02-014': 'no sourced romanisation',
    'BP03-003': 'no sourced romanisation',
    'BP03-005': 'no sourced romanisation',
    'BP03-006': 'no sourced romanisation',
    'BP03-014': 'no sourced romanisation',
    'BP04-001': 'no sourced romanisation',
    'BP04-002': 'no sourced romanisation',
    'BP04-006': 'no sourced romanisation',
    'BP04-012': 'no sourced romanisation',
    'BP04-013': 'no sourced romanisation',
  };
})();
