// js/ui/core.js: shared UI plumbing. DOM helpers, settings, card/leader lookups that need no DOM.
// Load-safe headless: nothing here touches `document` until a function is called, so tests.html
// (and the node:vm runner) can load this file.
(function () {
  'use strict';
  const XS = globalThis.XS;
  if (XS === undefined) throw new Error('ui/core: js/ns.js did not load');
  const U = (XS.ui = XS.ui || {});

  // ---- DOM ----------------------------------------------------------------------------------
  U.$ = (id) => {
    const e = document.getElementById(id);
    if (e === null) throw new Error('ui: #' + id + ' is missing from index.html');
    return e;
  };
  U.el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  };
  U.clear = (node) => { node.replaceChildren(); return node; };
  const SVGNS = 'http://www.w3.org/2000/svg';
  U.svgEl = (tag, attrs) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };
  // A rebuilt node restarts its CSS animation; every pulse starts at the same wall-clock phase.
  U.phase = (periodMs) => '-' + ((performance.now() % periodMs) / 1000).toFixed(3) + 's';

  // localStorage can throw (private mode, blocked): a failure only loses a convenience.
  U.store = {
    get(key, dflt) {
      try { const v = localStorage.getItem('xs.' + key); return v === null ? dflt : JSON.parse(v); } catch (e) { return dflt; }
    },
    set(key, value) { try { localStorage.setItem('xs.' + key, JSON.stringify(value)); } catch (e) { /* convenience only */ } },
  };

  // Diagnostics: contract mismatches the UI refuses to hide. Shown as a toast, kept for tests (e2e asserts none).
  U.diagnostics = [];
  U.diag = (msg) => {
    U.diagnostics.push(msg);
    if (typeof console !== 'undefined') console.warn('[ui] ' + msg);
    if (typeof document !== 'undefined' && document.getElementById('toast') !== null) U.toast(msg);
  };
  let toastTimer = null;
  U.toast = (msg) => {
    const t = document.getElementById('toast');
    if (t === null) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3600);
  };

  // ---- text ---------------------------------------------------------------------------------
  U.plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many === undefined ? one + 's' : many));
  U.cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  U.who = (view, seat) => (seat === view.viewer ? 'You' : 'Opponent');
  U.whose = (view, seat) => (seat === view.viewer ? 'Your' : "Opponent's");
  U.seatWord = (view, seat) => (seat === view.viewer ? 'you' : 'the opponent');

  // ---- card data ----------------------------------------------------------------------------
  U.card = (cardId) => {
    const d = XS.CARDS[cardId];
    if (d === undefined) throw new Error('ui: unknown card number ' + cardId);
    return d;
  };
  U.nameEn = (cardId) => U.card(cardId).nameEn;
  U.initials = (cardId) => {
    const words = U.card(cardId).nameEn.replace(/[^A-Za-z0-9' -]/g, '').split(/\s+/).filter(Boolean);
    // Some leaders are known by a Japanese-only name (nameEn has no Latin letter): their first characters stand in.
    if (words.length === 0) return Array.from(U.card(cardId).nameEn).slice(0, 2).join('');
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  };
  U.TYPE_LABEL = { leader: 'LEADER', attack: 'ATTACK', memoria: 'MEMORIA', tactics: 'TACTICS', pp: 'PP' };
  U.typeLabel = (cardId) => {
    const d = U.card(cardId);
    if (d.type === 'tactics') return d.tactics === 'equipment' ? 'TACTICS · EQUIP' : 'TACTICS';
    return U.TYPE_LABEL[d.type];
  };

  // Leader iids are 'L<seat><slot>' (docs/ENGINE-API.md "State").
  U.isLeaderIid = (iid) => typeof iid === 'string' && /^L[01][0-3]$/.test(iid);
  U.leaderSeat = (iid) => iid.charCodeAt(1) - 48;
  U.leaderSlot = (iid) => iid.charCodeAt(2) - 48;
  U.leaderOf = (view, iid) => view.players[U.leaderSeat(iid)].leaders[U.leaderSlot(iid)];
  U.leaderCardId = (view, iid) => U.leaderOf(view, iid).cardId;

  // iid -> card number for an instance the viewer may have lost sight of (a card that is now
  // face down in the trash): the registry first, then any log entry that named it.
  const logIdx = new WeakMap();
  U.cardIdOf = (view, iid) => {
    const c = view.cards[iid];
    if (c !== undefined) return c.id;
    let m = logIdx.get(view.log);
    if (m === undefined || m.n !== view.log.length) {
      m = { n: view.log.length, map: Object.create(null) };
      for (const e of view.log) {
        const d = e.data;
        if (d.hidden) continue;
        if (d.iid !== undefined && d.cardId !== undefined) m.map[d.iid] = d.cardId;
        if (Array.isArray(d.iids) && Array.isArray(d.cardIds)) d.iids.forEach((x, i) => { m.map[x] = d.cardIds[i]; });
        if (d.src !== undefined && d.cardId !== undefined) m.map[d.src] = d.cardId;
      }
      logIdx.set(view.log, m);
    }
    return m.map[iid] === undefined ? null : m.map[iid];
  };

  // ---- names --------------------------------------------------------------------------------
  // The card title the player sees: English first (Japanese beneath) or the reverse, by the "names" setting
  // (js/ui/settings.js). U.nameEn stays the canonical English name (initials, tests); everything the player reads
  // goes through U.cardTitle / U.cardTitleAlt.
  U.nameJp = (cardId) => U.card(cardId).name;
  U.cardTitle = (cardId) => (U.settings.get('names') === 'jp' ? U.card(cardId).name : U.card(cardId).nameEn);
  U.cardTitleAlt = (cardId) => (U.settings.get('names') === 'jp' ? U.card(cardId).nameEn : U.card(cardId).name);
  const NO_PARAMS = { get: () => null };      // headless (node:vm): no location, no URLSearchParams
  U.params = () => (typeof location === 'undefined' || typeof URLSearchParams === 'undefined' ? NO_PARAMS : new URLSearchParams(location.search));
  U.reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
})();
