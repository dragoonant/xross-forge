// Our English rendering of every card in the first slice (ST01 + ST02), in our own words (PLAN D16).
// Hand-written: `nameEn` is an English name we chose, `text` restates the printed effect in plain
// English with the same numbers, targets and conditions. The Japanese printed text is NOT kept in
// the repo; the printed-vs-compiled auditor (M2) reads the gitignored docs/sources/api/all-cards.json.
//
// Vocabulary (docs/card-text-grammar.md): timing tags stay as bracketed keywords [On Play],
// [Attack], [After Attack], [Attack Boost], [On Awaken], [Round]. "Opposing leader" = a leader of the
// opponent; "other opposing leader" = an opposing leader other than the one that received this
// attack. "Heal" = remove damage counters; "Recover N PP" = turn N spent PP upright.
//
// Consumed by tools/build-cards.mjs (it embeds the entries into data/cards.js) and checked by
// tools/validate-data.mjs. Pages do not load this file. No Japanese characters allowed here.
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
  };
})();
