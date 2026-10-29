// js/ui/title.js: the title screen. Mode (full / quick), your deck (ST01 / ST02 / Surprise me, with
// a pre-picked default so Play is never greyed), How to play, and the unofficial notice. The copy is
// our own words (CLAUDE.md rule 10); the notice sentence matches NOTICE.md and must change with it.
(function () {
  'use strict';
  const XS = globalThis.XS;
  const U = XS.ui;
  const { el, $ } = U;
  const Ti = (U.title = {});

  // Same sentence as the first paragraph of NOTICE.md (change both together).
  Ti.NOTICE_SHORT = 'xross-forge is an unofficial, non-commercial, fan-made browser reproduction of the trading card game Xross Stars (クロスタ), published by Brave group and developed by Game & Co. Inc. with SAMURAI KOBO.';
  Ti.NOTICE_LINE = Ti.NOTICE_SHORT + ' It is not affiliated with, endorsed by or connected to Brave group, Game & Co. Inc., SAMURAI KOBO, or any talent agency, team or talent named in the game. Nothing here is official, and nothing is sold or monetised.';
  Ti.NOTICE_POINTS = [
    'No official material is included: no official card art, logos, icons, key visuals or audio. Rules text, interface copy and lore are written in our own words.',
    'Card, leader and talent names and card numbers follow the publisher\'s public card list so players can recognise the cards. They belong to their owners.',
    'Illustrations are AI-generated depictions made for this project from our own descriptions, not copies of official art (AIイラスト). Any voice is original; no real talent\'s voice is cloned or imitated.',
    'Credit: this project is made by evilgouki.',
    'Takedown: if you are a rights holder and want anything changed or removed, it will be (see docs/takedown.md in the repository).',
  ];

  Ti.HOWTO = [
    ['The goal', 'Each side fields four leaders. Knock out all four of the other side and you win the round. A full match is the best of three rounds; a quick match is a single round.'],
    ['Your turn', 'Start: your Play Points (PP) stand up again and you draw a card. Main phase: spend PP to play cards, in any order, as often as you can pay. End: everything you played goes to the trash, you draw one card for every PP you did not spend, and you discard down to 7 cards.'],
    ['Attack cards', 'Pay the cost, pick one of your leaders to attack and one of theirs to hit. The hit deals the attacker\'s ATK plus any boost plus the card\'s own bonus. Some cards do more after the hit. A leader can attack many times in a turn, once per attack card.'],
    ['Memoria and boosts', 'Memoria cards do their thing when played. Cards marked Attack Boost make your next attack hit harder, so play them first. A boost lasts for one attack only and fades at end of turn if you never attack.'],
    ['Tactics', 'Each round you secretly set aside one tactics card. You may play one from your tactics area per turn (never on the first player\'s first turn). The second player in round 1 also gets a PP Ticket that recovers 1 PP.'],
    ['Down and awaken', 'A leader goes down when its damage reaches its HP: it turns sideways and can no longer attack or be targeted. A leader that downs an opposing leader awakens: its flip side is stronger and its awaken effect fires. Awakening stays for the rest of the match.'],
    ['Between rounds', 'Everyone is healed and stood back up; awakened leaders and equipment stay. PP per turn goes 3, 4, 5 over the rounds. The loser of a round goes first in the next.'],
    ['Running out of cards', 'If your deck is too short for a draw, your face-down trash is shuffled back in and a random tactics card is burned. If there is no tactics card left to burn, you lose the match.'],
    ['This screen', 'Cards that glow can be played now. Tap one, pick the attacker and the target (the damage number is shown before you commit), then confirm. A card that cannot be played says why under it. Hover a card (or press and hold on a phone) to read it large. The Log button lists everything that happened. Click anywhere during an animation to skip it.'],
  ];

  function pickedDeck() {
    const v = document.querySelector('input[name="deck"]:checked').value;
    if (v !== 'random') return v;
    return Math.random() < 0.5 ? 'ST01' : 'ST02';
  }
  const pickedMode = () => document.querySelector('input[name="mode"]:checked').value;
  // ?tier=easy|normal|hard (tests and links) beats the radio group.
  function pickedTier() {
    const q = U.params().get('tier');
    const v = q !== null ? q : document.querySelector('input[name="tier"]:checked').value;
    if (XS.ai === undefined || XS.ai.TIERS[v] === undefined) throw new Error('title: unknown AI level "' + v + '"');
    return v;
  }

  function fill(id, rows) {
    const b = $(id);
    b.replaceChildren();
    for (const [h, t] of rows) {
      const d = el('div', 'ht-row');
      d.appendChild(el('h3', 'ht-h', h));
      d.appendChild(el('p', 'ht-p', t));
      b.appendChild(d);
    }
  }

  Ti.init = function () {
    $('notice-text').textContent = Ti.NOTICE_SHORT;
    // Remember the last choice (a convenience; the default is already checked so Play is never greyed).
    const saved = U.store.get('title', null);
    if (saved !== null) {
      for (const [name, val] of [['mode', saved.mode], ['deck', saved.deck], ['tier', saved.tier]]) {
        const inp = document.querySelector(`input[name="${name}"][value="${val}"]`);
        if (inp !== null) inp.checked = true;
      }
    }
    // The AI opponent lives in a Web Worker. Start it now so a failure shows here, before a match, instead of as a bot that never moves.
    if (U.params().get('bot') === 'random') $('lt-status').textContent = 'vs a random bot';
    else {
      if (U.aiClient === undefined) throw new Error('title: js/ui/bot-ai.js did not load');
      $('lt-status').textContent = 'vs the AI';
      const show = (st, err) => {
        const note = $('ai-status'), why = $('play-why');
        note.hidden = st !== 'loading';
        note.textContent = 'Loading the opponent…';
        why.hidden = st !== 'failed';
        why.textContent = st === 'failed' ? 'The AI opponent did not load: ' + err : '';
        $('play').disabled = st === 'failed';
      };
      U.aiClient.onChange(show);
      U.aiClient.start().catch(() => { /* shown by the banner and the Play lock */ });
    }
    const nb = $('notice-body');
    nb.replaceChildren(el('p', 'ht-p', Ti.NOTICE_LINE));
    const ul = el('ul', 'ht-list');
    for (const t of Ti.NOTICE_POINTS) ul.appendChild(el('li', '', t));
    nb.appendChild(ul);
    fill('howto-body', Ti.HOWTO);
    const open = (id) => $(id).classList.add('open');
    const close = (id) => $(id).classList.remove('open');
    $('howto-open').addEventListener('click', () => open('howto'));
    $('howto-close').addEventListener('click', () => close('howto'));
    $('notice-open').addEventListener('click', () => open('notice-full'));
    $('notice-close').addEventListener('click', () => close('notice-full'));
    for (const id of ['howto', 'notice-full']) $(id).addEventListener('click', (e) => { if (e.target === $(id)) close(id); });
    $('play').addEventListener('click', () => {
      const mode = pickedMode();
      const raw = document.querySelector('input[name="deck"]:checked').value;
      const tier = pickedTier();
      U.store.set('title', { mode, deck: raw, tier: document.querySelector('input[name="tier"]:checked').value });
      const mine = pickedDeck();
      const other = mine === 'ST01' ? 'ST02' : 'ST01';
      const seedRaw = U.params().get('seed');
      U.game.start({ decks: [mine, other], mode, spectate: false, tier, seed: seedRaw === null ? undefined : Number(seedRaw) });
    });
  };
})();
