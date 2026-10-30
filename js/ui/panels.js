// js/ui/panels.js: the panels that are not the board: How to play, Settings, the deck list ("View list" on the title),
// and Credits / notice. Reachable from the title and, during a match, from the Menu. Copy is our own words (CLAUDE.md
// rule 10); the rules wording follows docs/rules.md. Escape closes the topmost panel.
(function () {
  'use strict';
  const XS = globalThis.XS;
  const U = XS.ui;
  const { el, $ } = U;
  const P = (U.panels = {});

  // ---- How to play (docs/rules.md §1, §8-§16) ----------------------------------------------------
  P.HOWTO = [
    ['The goal', 'Each side fields four leaders. Down all four of the other side and you win the round. A full match is the best of three rounds; a quick match is a single round.'],
    ['Setting up', 'A coin toss decides who chooses to go first. Each round you pick one tactics card in secret and set it aside face down, and you draw four cards. In round 1 of a full match the second player also gets a PP Ticket.'],
    ['Your turn', 'Start: your PP stand back up and you draw a card (the first player draws too). Main phase: spend PP to play cards, in any order, as many as you can pay for. End: everything in your play area goes to the trash, you draw one card for every PP you left unspent, and you discard down to 7 cards.'],
    ['Attacks', 'Pay the cost, pick one of your standing leaders to attack and one of theirs to hit. The target takes the attacker\'s ATK plus any boosts plus the card\'s own bonus, and the number is shown before you confirm. Effects marked after-attack run next, in an order you choose. A leader can attack many times in a turn, once per attack card.'],
    ['Boosts', 'Memoria cards do their thing when played. Ones marked Attack Boost add damage to your next attack only, and several stack, so play them before the attack card. A boost nobody used is trashed at end of turn.'],
    ['Down and awaken', 'A leader goes down the moment its damage reaches its HP: it turns sideways and can no longer attack, be targeted or take damage. A leader whose attack downs an enemy leader awakens: its stronger flip side shows and its awaken effect fires. It stays awakened for the rest of the match.'],
    ['Rounds and PP', 'You have 3 PP per turn in round 1, 4 in round 2 and 5 in round 3 (a quick match stays at 3). When a round ends every leader is healed and stands back up, and awakened leaders and equipment stay as they are. The loser of a round goes first in the next one.'],
    ['Tactics', 'Your tactics area holds one card per round. You may play one tactics card per turn, and nobody may play one on the first player\'s first turn of a round. A one-use card goes to the trash at end of turn; equipment stays attached to a leader. The PP Ticket gives back 1 PP.'],
    ['Deck-out', 'If a draw needs more cards than your deck holds, your face-down trash is shuffled back in and a random tactics card is burned as the penalty. If there is no tactics card left to burn, you lose the match.'],
    ['On this screen', 'Cards that glow can be played now. Tap one, pick the attacker and the target (the damage number is shown before you commit), then confirm. A card that cannot be played says why under it. Hover a card (or press and hold on a phone) to read it large. The Log button lists everything that happened, and the Menu holds this page, Settings and Credits. Click anywhere during an animation to skip it.'],
  ];

  // ---- Credits and notice (docs/rights.md §7, NOTICE.md) -----------------------------------------
  P.CREDITS = [
    ['What this is', 'xross-forge is an unofficial, non-commercial, fan-made reproduction of the trading card game Xross Stars (クロスタ), published by Brave group and developed by Game & Co. Inc. with SAMURAI KOBO. It is not affiliated with or endorsed by them, or by any talent agency, team or talent named in the game. Nothing here is official, and nothing is sold or monetised.'],
    ['Pictures', 'Illustrations are AI-generated (AIイラスト): depictions made for this project from our own descriptions, not copies of official art. #AIイラスト'],
    ['Sound', 'Any voice is original; no real talent\'s voice is cloned or imitated.'],
    ['Names and text', 'Card, leader and talent names and card numbers follow the publisher\'s public card list so players can recognise the cards; they belong to their owners. Rules text, interface copy and lore are written in our own words. No official art, logos, icons or audio are included.'],
    ['Credit', 'Made by evilgouki.'],
    ['Takedown', 'If you are a rights holder and want anything changed or removed, it will be: see docs/takedown.md in the repository.'],
  ];

  const open = (id) => $(id).classList.add('open');
  const close = (id) => $(id).classList.remove('open');
  const isOpen = (id) => $(id).classList.contains('open');

  function fillRows(boxId, rows) {
    const b = $(boxId);
    b.replaceChildren();
    for (const [h, t] of rows) {
      const d = el('div', 'ht-row');
      d.appendChild(el('h3', 'ht-h', h));
      d.appendChild(el('p', 'ht-p', t));
      b.appendChild(d);
    }
  }

  // ---- Settings ----------------------------------------------------------------------------------
  const AUDIO_ROWS = [['master', 'Master volume'], ['music', 'Music'], ['sfx', 'Sound effects'], ['voice', 'Announcer voice']];

  function group(title) {
    const g = el('fieldset', 'set-group');
    g.appendChild(el('legend', '', title));
    return g;
  }
  function radioRow(name, id, value, label, note, checked, onPick) {
    const l = el('label', 'set-opt');
    const i = el('input'); i.type = 'radio'; i.name = name; i.value = value; i.id = id; i.checked = checked;
    i.addEventListener('change', () => { if (i.checked) onPick(value); });
    const b = el('span', 'set-body');
    b.appendChild(el('b', '', label));
    if (note) b.appendChild(el('i', '', note));
    l.append(i, b);
    return l;
  }
  function checkRow(id, label, note, checked, onToggle) {
    const l = el('label', 'set-opt set-check');
    const i = el('input'); i.type = 'checkbox'; i.id = id; i.checked = checked;
    i.addEventListener('change', () => onToggle(i.checked));
    const b = el('span', 'set-body');
    b.appendChild(el('b', '', label));
    if (note) b.appendChild(el('i', '', note));
    l.append(i, b);
    return l;
  }

  function renderSettings() {
    const S = U.settings;
    const box = $('settings-body');
    box.replaceChildren();

    const play = group('Playback');
    const speedRow = el('div', 'set-row');
    for (const [v, label, note] of [['full', 'Full', 'every beat plays'], ['quick', 'Quick', 'under half the time'], ['instant', 'Instant', 'no animation']]) {
      speedRow.appendChild(radioRow('set-speed', 'set-speed-' + v, v, label, note, U.speed() === v, (x) => { U.setSpeed(x); U.game.redraw(); }));
    }
    play.appendChild(speedRow);
    play.appendChild(checkRow('set-reduce', 'Reduce motion', 'shorter stinger and banners, no shakes or bursts', S.get('reduceMotion'), (c) => S.set('reduceMotion', c)));
    play.appendChild(checkRow('set-autopass', 'Auto-pass when nothing is playable', 'ends your turn by itself, after a short notice you can cancel (off by default)', S.get('autoPass'), (c) => { S.set('autoPass', c); U.game.checkAutoPass(); }));
    box.appendChild(play);

    const names = group('Card titles');
    const nameRow = el('div', 'set-row');
    nameRow.appendChild(radioRow('set-names', 'set-names-en', 'en', 'English names', 'Japanese name beneath', S.get('names') === 'en', (x) => { S.set('names', x); U.game.redraw(); U.title.renderDecks(); }));
    nameRow.appendChild(radioRow('set-names', 'set-names-jp', 'jp', 'Japanese names', 'English name beneath', S.get('names') === 'jp', (x) => { S.set('names', x); U.game.redraw(); U.title.renderDecks(); }));
    names.appendChild(nameRow);
    box.appendChild(names);

    const snd = group('Sound');
    const A = XS.Audio.settings;
    for (const [k, label] of AUDIO_ROWS) {
      const row = el('label', 'set-slider');
      row.appendChild(el('span', 'set-lab', label));
      const r = el('input'); r.type = 'range'; r.min = '0'; r.max = '1'; r.step = '0.05'; r.id = 'set-vol-' + k;
      r.value = String(A[k]);
      const pct = el('span', 'set-pct', Math.round(A[k] * 100) + '%');
      r.addEventListener('input', () => {
        const v = Number(r.value);
        XS.Audio.settings = { [k]: v };          // the getter returns a copy: levels are changed by assigning an object
        S.setAudio(k, v);
        pct.textContent = Math.round(v * 100) + '%';
      });
      row.append(r, pct);
      snd.appendChild(row);
    }
    snd.appendChild(checkRow('set-mute', 'Mute everything', '', A.muted === true, (c) => { XS.Audio.settings = { muted: c }; S.setAudio('muted', c); }));
    box.appendChild(snd);
  }

  // ---- Deck list ---------------------------------------------------------------------------------
  function deckRow(cardId, count) {
    const d = U.card(cardId);
    const r = el('div', 'dk-row col-' + d.color);
    r.setAttribute('data-card', cardId);
    r.tabIndex = 0;
    r.appendChild(el('span', 'dk-n', count === undefined ? '' : '×' + count));
    r.appendChild(el('span', 'dk-cost', d.cost === undefined ? '' : String(d.cost)));
    const names = el('span', 'dk-names');
    names.appendChild(el('b', '', U.cardTitle(cardId)));
    names.appendChild(el('i', '', U.cardTitleAlt(cardId)));
    r.appendChild(names);
    const meta = [];
    if (d.type === 'leader') meta.push('ATK ' + d.atk + ' · HP ' + d.hp);
    if (d.type === 'tactics') meta.push(U.typeLabel(cardId));
    if (d.equip !== undefined) meta.push(U.preview.equipLine(d).replace(/^Equipment: /, '').replace(/\.$/, ''));
    if (d.ace) meta.push('ACE');
    r.appendChild(el('span', 'dk-meta', meta.join(' · ')));
    r.appendChild(el('span', 'dk-col col-' + d.color, U.COLOR_LABEL[d.color]));
    return r;
  }
  function deckSection(title, rows, note) {
    const s = el('section', 'dk-sec');
    s.appendChild(el('h3', 'ht-h', title));
    if (note) s.appendChild(el('p', 'v-note', note));
    const list = el('div', 'dk-list');
    for (const r of rows) list.appendChild(r);
    s.appendChild(list);
    return s;
  }
  P.openDeck = function (id) {
    const d = XS.DECKS[id];
    if (d === undefined) throw new Error('panels: unknown deck ' + id);
    $('deckpeek-title').textContent = d.id + ' ' + d.nameEn + ' · ' + d.name;
    const box = $('deckpeek-body');
    box.replaceChildren();
    if (d.format === 'competitive') {
      const note = el('p', 'v-note');
      note.append(`Tournament list, reproduced card for card. Source: ${d.source.event.replace(/[.\s]+$/, '')}. Read on ${d.source.fetched} (${d.source.method}). `);
      const a = el('a', 'linkish', 'Source page');
      a.href = d.source.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      note.append(a, '. Hover a row to read the card.');
      box.appendChild(note);
    } else box.appendChild(el('p', 'v-note', 'Official starter list, as sold in the box (read from the publisher\'s product page on 2026-10-29). Hover a row to read the card.'));
    box.appendChild(deckSection('Leaders · ' + d.leaders.length, d.leaders.map((c) => deckRow(c))));
    box.appendChild(deckSection('Tactics · ' + d.tactics.length, d.tactics.map((c) => deckRow(c)),
      'Each round you secretly set one aside; the second player of round 1 also gets the PP Ticket.'));
    const byType = { attack: [], memoria: [] };
    let total = 0;
    for (const [c, n] of d.main) { byType[U.card(c).type].push([c, n]); total += n; }
    const sum = (xs) => xs.reduce((a, [, n]) => a + n, 0);
    const order = (a, b) => (U.card(a[0]).cost - U.card(b[0]).cost) || (a[0] < b[0] ? -1 : 1);
    box.appendChild(deckSection('Main deck · ' + total + ' cards', []));
    for (const type of ['attack', 'memoria']) {
      const xs = byType[type].sort(order);
      box.appendChild(deckSection((type === 'attack' ? 'Attack' : 'Memoria') + ' · ' + U.plural(sum(xs), 'card') + ', ' + xs.length + ' different',
        xs.map(([c, n]) => deckRow(c, n))));
    }
    open('deckpeek');
  };

  // ---- wiring ------------------------------------------------------------------------------------
  P.openHowto = () => open('howto');
  P.openSettings = () => { renderSettings(); open('settings'); };
  P.openCredits = () => open('credits');

  P.init = function () {
    fillRows('howto-body', P.HOWTO);
    fillRows('credits-body', P.CREDITS);
    const PANELS = ['howto', 'settings', 'credits', 'deckpeek'];
    for (const id of PANELS) {
      $(id + '-close').addEventListener('click', () => close(id));
      $(id).addEventListener('click', (e) => { if (e.target === $(id)) { close(id); U.sfx.cue('ui-cancel'); } });
    }
    // Menu (during a match) and title entries.
    $('menu-howto').addEventListener('click', P.openHowto);
    $('menu-settings').addEventListener('click', P.openSettings);
    $('menu-credits').addEventListener('click', P.openCredits);
    $('howto-open').addEventListener('click', P.openHowto);
    $('settings-open').addEventListener('click', P.openSettings);
    $('credits-open').addEventListener('click', P.openCredits);
    $('notice-open').addEventListener('click', P.openCredits);
    // The topmost panel closes on Escape (capture: the match's own Escape handling then stays out of it).
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      for (const id of PANELS.slice().reverse()) {
        if (isOpen(id)) { close(id); U.sfx.cue('ui-cancel'); e.stopPropagation(); e.preventDefault(); return; }
      }
    }, true);
  };
})();
