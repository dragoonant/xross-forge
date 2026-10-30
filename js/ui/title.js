// js/ui/title.js: the title screen. Mode (full / quick), the opponent's level, your deck (ST01 / ST02 / Surprise me, with
// a pre-picked default so Play is never greyed, and a "View list" peek per starter), Continue when a save exists, and the
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
    for (const btn of document.querySelectorAll('.view-list')) btn.addEventListener('click', () => U.panels.openDeck(btn.getAttribute('data-deck')));
    $('continue').addEventListener('click', resumeSaved);
    Ti.refreshContinue();
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
