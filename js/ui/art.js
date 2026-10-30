// js/ui/art.js: pictures from the art manifest (data/art-manifest.js, XS.ART). A card face, a leader face (front, and
// "<number>/awakened" for the awakened side) and the UI plates show their picture when the manifest has an entry for the
// key; otherwise the card keeps its labelled "ART PENDING" placeholder (cardview.js). Nothing is guessed: an entry whose
// file fails to load is reported through U.diag and the placeholder takes its place, loudly.
//   Keys: "<card number>", "<card number>/awakened", and the UI plates ui/title, ui/arena, ui/card-back, ui/tactics-back (the
//   pipeline's names; the M7 brief's ui:title, ui:arena, ui:cardback, ui:tacticsback are read as the same plates).
// Headless-safe: the pure parts (keys, lookups) need no DOM.
(function () {
  'use strict';
  const XS = globalThis.XS;
  const U = XS.ui;
  const A = (U.art = {});

  // The four UI plates and the manifest keys each may be filed under: the pipeline's spelling first (ui/card-back, ui/tactics-back),
  // then the M7 brief's (ui:cardback, ui:tacticsback). Two spellings of one plate with different files is a manifest bug and throws.
  A.UI_PLATES = {
    title: ['ui/title', 'ui:title'],
    arena: ['ui/arena', 'ui:arena'],
    cardback: ['ui/card-back', 'ui/cardback', 'ui:cardback'],
    tacticsback: ['ui/tactics-back', 'ui/tacticsback', 'ui:tacticsback'],
  };

  A.keyFor = (cardId, awake) => (awake ? cardId + '/awakened' : cardId);
  // The manifest entry for a key, or null.
  A.entry = (key) => {
    const e = XS.ART[key];
    return e === undefined ? null : e;
  };
  A.uiEntry = (name) => {
    const keys = A.UI_PLATES[name];
    if (keys === undefined) throw new Error('art: unknown UI plate "' + name + '"');
    const found = keys.map((k) => XS.ART[k]).filter((e) => e !== undefined);
    if (found.some((e) => e.file !== found[0].file)) throw new Error('art: the manifest files UI plate "' + name + '" under two spellings with different files');
    return found.length === 0 ? null : found[0];
  };

  // The picture for a card face (leader: pass awake for the flip side), or null.
  A.faceEntry = (cardId, awake) => {
    const d = U.card(cardId);
    return A.entry(A.keyFor(cardId, awake && d.type === 'leader'));
  };

  const cssUrl = (file) => 'url("' + String(file).replace(/["\\]/g, '\\$&') + '")';

  // Fill a .c-art box: the <img> when there is an entry (the card root gets .has-art), otherwise the placeholder.
  // lazy: hand cards and the zoom (the browser fetches them when they scroll or open into view).
  A.fill = function (root, artBox, cardId, entry, lazy) {
    const placeholder = () => {
      artBox.replaceChildren(U.el('span', 'c-init', U.initials(cardId)), U.el('span', 'c-ph', 'ART PENDING'));
      root.classList.remove('has-art');
    };
    if (entry === null) { placeholder(); return; }
    const img = U.el('img', 'c-img');
    img.setAttribute('alt', '');
    img.setAttribute('decoding', 'async');
    if (lazy) img.setAttribute('loading', 'lazy');
    img.setAttribute('draggable', 'false');
    img.addEventListener('error', () => { U.diag('Art did not load: ' + entry.file + ' (card ' + cardId + ').'); placeholder(); });
    img.src = entry.file;
    artBox.replaceChildren(img);
    root.classList.add('has-art');
  };

  // Backdrops and card backs: custom properties on <body> that the CSS reads (--art-title, --art-arena, --art-cardback,
  // --art-tacticsback) plus a body class per plate so the CSS can drop the "?" mark or add a scrim. Called once at boot.
  A.any = () => Object.keys(XS.ART).length > 0;
  A.applyPlates = function () {
    const b = document.body;
    for (const name of Object.keys(A.UI_PLATES)) {
      const e = A.uiEntry(name);
      b.classList.toggle('art-' + name, e !== null);
      if (e === null) b.style.removeProperty('--art-' + name);
      else b.style.setProperty('--art-' + name, cssUrl(e.file));
    }
    b.classList.toggle('has-art-any', A.any());       // shows the AIイラスト label (docs/rights.md §7.1)
  };
})();
