// js/ui/title.js: the title screen. Mode (full / quick), the opponent's level, your deck (ST01 / ST02 / Surprise me, with
// a pre-picked default so Play is never greyed, and a "View list" peek per deck), the bot's deck (a different deck from yours by default),
// both chosen from one list of the 12 decks in two groups (Starters, Competitive), Continue when a save exists, and the
// entries to How to play, Settings and Credits (panels.js). The copy is our own words (CLAUDE.md rule 10); the notice
// sentence matches NOTICE.md and must change with it.
(function () {
  'use strict';
  const XS = globalThis.XS;
  const U = XS.ui;
  const { el, $ } = U;
  const Ti = (U.title = {});

  // Same sentence as the first paragraph of NOTICE.md (change both together).
  Ti.NOTICE_SHORT = 'xross-forge is an unofficial, non-commercial, fan-made browser reproduction of the trading card game Xross Stars (クロスタ), published by Brave group and developed by Game & Co. Inc. with SAMURAI KOBO.';
  // ---- decks ---------------------------------------------------------------------------------------------------
  // Where each tournament list comes from, short (the full source sits in XS.DECKS[id].source and the deck list panel). Own words.
  Ti.DECK_SOURCE_SHORT = {
    C01: 'Challengers Cup #3 Osaka · 1st', C02: 'Challengers Cup #3 Osaka · 2nd', C03: 'Challengers Cup #3 Osaka · placed', C04: 'Challengers Cup #3 Osaka · placed',
    C05: 'Yuyu-tei column · 27 Aug 2026', C06: 'Yuyu-tei column · 21 Aug 2026', C07: 'Yuyu-tei column · 10 Sep 2026', A01: 'Challengers Cup #3 Osaka · Top 8',
    A02: 'Yuyu-tei meta list · 30 Jul 2026', A03: 'Yuyu-tei meta list · 30 Jul 2026',
  };
  Ti.GROUPS = [['starter', 'Starters'], ['competitive', 'Competitive']];
  Ti.deckIds = () => Object.keys(XS.DECKS);
  const checkedValue = (name) => document.querySelector(`input[name="${name}"]:checked`).value;
  const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
  // The two decks this Play will use. 'random' = any deck; the bot's 'auto' = a different deck from yours of the same kind (a starter against a starter).
  Ti.resolveDecks = function () {
    const all = Ti.deckIds();
    const mineRaw = checkedValue('deck'), botRaw = checkedValue('deck-bot');
    const mine = mineRaw === 'random' ? pick(all) : mineRaw;
    let bot = botRaw;
    if (botRaw === 'auto') bot = pick(all.filter((id) => id !== mine && XS.DECKS[id].format === XS.DECKS[mine].format));
    else if (botRaw === 'random') bot = pick(all.filter((id) => id !== mine));
    return [mine, bot];
  };
  const leaderPips = (d) => {
    const w = el('span', 'dp-pips');
    const names = [];
    for (const l of d.leaders) {
      const c = U.card(l).color;
      const i = el('i', 'dp-pip col-' + c);
      i.title = U.COLOR_LABEL[c];
      w.appendChild(i);
      names.push(U.COLOR_LABEL[c]);
    }
    w.setAttribute('role', 'img');
    w.setAttribute('aria-label', 'Leader colours: ' + names.join(', '));
    return w;
  };
  function deckRow(name, d, checked) {
    const row = el('div', 'dp-row');
    const lab = el('label', 'opt');
    const inp = el('input'); inp.type = 'radio'; inp.name = name; inp.value = d.id; inp.checked = checked;
    const body = el('span', 'opt-body');
    const top = el('span', 'dp-top');
    top.append(el('b', '', d.id + ' ' + d.nameEn), leaderPips(d));
    body.appendChild(top);
    body.appendChild(el('span', 'dp-leaders', d.leaders.map((l) => U.cardTitle(l)).join(' · ')));
    if (d.format === 'competitive') {
      if (Ti.DECK_SOURCE_SHORT[d.id] === undefined) throw new Error('title: no short source line for deck ' + d.id);
      body.appendChild(el('span', 'dp-src', Ti.DECK_SOURCE_SHORT[d.id]));
    } else body.appendChild(el('span', 'dp-src', d.name + ' · starter deck'));
    lab.append(inp, body);
    const view = el('button', 'linkish view-list', 'View list');
    view.type = 'button'; view.setAttribute('data-deck', d.id); view.setAttribute('data-cue', 'ui-drawer');
    view.setAttribute('aria-label', `View the ${d.id} deck list`);
    row.append(lab, view);
    return row;
  }
  function plainRow(name, value, title, note, checked) {
    const row = el('div', 'dp-row dp-plain');
    const lab = el('label', 'opt');
    const inp = el('input'); inp.type = 'radio'; inp.name = name; inp.value = value; inp.checked = checked;
    const body = el('span', 'opt-body');
    body.append(el('b', '', title), el('span', 'dp-src', note));
    lab.append(inp, body);
    row.appendChild(lab);
    return row;
  }
  // Fill one list. `want` = the value to leave checked (the choice from before a rebuild, the saved one, or the default).
  function fillList(listId, name, plain, want) {
    const box = $(listId);
    box.replaceChildren();
    const ids = Ti.deckIds();
    const known = new Set(plain.map((p) => p[0]).concat(ids));
    const sel = known.has(want) ? want : plain[0][0];
    for (const [value, title, note] of plain) box.appendChild(plainRow(name, value, title, note, value === sel));
    for (const [format, label] of Ti.GROUPS) {
      const decks = ids.map((id) => XS.DECKS[id]).filter((d) => d.format === format);
      box.appendChild(el('div', 'dp-group', `${label} · ${decks.length}`));
      for (const d of decks) box.appendChild(deckRow(name, d, d.id === sel));
    }
    for (const btn of box.querySelectorAll('.view-list')) btn.addEventListener('click', () => U.panels.openDeck(btn.getAttribute('data-deck')));
    for (const inp of box.querySelectorAll('input')) inp.addEventListener('change', Ti.summarise);
  }
  const SUM_LABEL = (value) => (value === 'random' ? 'Surprise me' : value === 'auto' ? 'Different from mine' : value + ' ' + XS.DECKS[value].nameEn);
  Ti.summarise = function () {
    $('dp-sum-mine').textContent = SUM_LABEL(checkedValue('deck'));
    $('dp-sum-bot').textContent = SUM_LABEL(checkedValue('deck-bot'));
  };
  // Build (or rebuild, when the card-name setting changes) both lists; the current choices stay.
  Ti.renderDecks = function (saved) {
    const cur = (name, dflt) => {
      const c = document.querySelector(`input[name="${name}"]:checked`);
      return c !== null ? c.value : (saved !== undefined && saved !== null && saved[name] !== undefined ? saved[name] : dflt);
    };
    const mineWant = cur('deck', 'ST01'), botWant = cur('deck-bot', 'auto');
    fillList('dp-list-mine', 'deck', [['random', 'Surprise me', 'The game picks one of the 12']], mineWant);
    fillList('dp-list-bot', 'deck-bot', [['auto', 'A different deck from mine', 'Starter against starter, tournament list against tournament list'], ['random', 'Surprise me', 'Any deck but yours']], botWant);
    Ti.summarise();
  };
  function wireTabs() {
    const show = (which) => {
      $('deck-pick').setAttribute('data-active', which);
      for (const t of document.querySelectorAll('.dp-tab')) {
        const on = t.getAttribute('data-panel') === which;
        t.classList.toggle('is-on', on);
        t.setAttribute('aria-selected', String(on));
      }
    };
    for (const t of document.querySelectorAll('.dp-tab')) t.addEventListener('click', () => show(t.getAttribute('data-panel')));
  }
  const pickedMode = () => document.querySelector('input[name="mode"]:checked').value;
  // ?tier=easy|normal|hard (tests and links) beats the radio group.
  function pickedTier() {
    const q = U.params().get('tier');
    const v = q !== null ? q : document.querySelector('input[name="tier"]:checked').value;
    if (XS.ai === undefined || XS.ai.TIERS[v] === undefined) throw new Error('title: unknown AI level "' + v + '"');
    return v;
  }

  // The Continue button: shown while a save exists (js/ui/save.js). Rebuilt with XS.replay; if that throws the save is
  // cleared and the player is told, never silently dropped.
  Ti.refreshContinue = function () {
    const rec = U.save.read();
    const b = $('continue');
    b.hidden = rec === null;
    if (rec !== null) b.textContent = U.save.label(rec);
  };
  function resumeSaved() {
    const rec = U.save.read();
    const note = $('continue-note');
    note.hidden = true;
    if (rec === null) { Ti.refreshContinue(); return; }
    let s;
    try { s = XS.replay(rec.init, rec.actions); } catch (e) {
      U.save.clear();
      Ti.refreshContinue();
      note.textContent = 'This save can\'t be resumed, so it has been removed.';
      note.hidden = false;
      if (typeof console !== 'undefined') console.warn('[save] replay failed: ' + e.message);
      return;
    }
    U.game.resumeState(s, { tier: rec.tier });
  }

  Ti.init = function () {
    $('notice-text').textContent = Ti.NOTICE_SHORT;
    // Remember the last choice (a convenience; the default is already checked so Play is never greyed).
    const saved = U.store.get('title', null);
    if (saved !== null) {
      for (const [name, val] of [['mode', saved.mode], ['tier', saved.tier]]) {
        const inp = document.querySelector(`input[name="${name}"][value="${val}"]`);
        if (inp !== null) inp.checked = true;
      }
    }
    Ti.renderDecks(saved === null ? undefined : { deck: saved.deck, 'deck-bot': saved.botDeck });
    wireTabs();
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
    $('continue').addEventListener('click', resumeSaved);
    Ti.refreshContinue();
    $('play').addEventListener('click', () => {
      const mode = pickedMode();
      const tier = pickedTier();
      U.store.set('title', { mode, deck: checkedValue('deck'), botDeck: checkedValue('deck-bot'), tier: document.querySelector('input[name="tier"]:checked').value });
      const decks = Ti.resolveDecks();
      const seedRaw = U.params().get('seed');
      U.game.start({ decks, mode, spectate: false, tier, seed: seedRaw === null ? undefined : Number(seedRaw) });
    });
  };
})();
