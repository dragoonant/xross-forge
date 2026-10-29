// js/ui/cardview.js: the one card renderer. Every card face is a placeholder until the art lands
// (M5): a colour band by card colour, a type label and initials, with an explicit "ART PENDING"
// label (never a silent fallback). Sizes come from CSS (container query units), not from here.
// Any element with data-card is a hover-zoom doorway (preview.js).
(function () {
  'use strict';
  const XS = globalThis.XS;
  const U = XS.ui;
  const { el } = U;

  U.COLOR_LABEL = { blue: 'Blue', green: 'Green', red: 'Red', yellow: 'Yellow', colorless: 'Colourless' };

  // opts: { iid, cls, why (string: shown on the card), text (bool: force the text plate) }
  U.cardEl = function (cardId, opts) {
    const o = opts === undefined ? {} : opts;
    const d = U.card(cardId);
    const c = el('div', `card type-${d.type} col-${d.color}${o.cls ? ' ' + o.cls : ''}`);
    c.setAttribute('data-card', cardId);
    if (o.iid !== undefined) c.setAttribute('data-iid', o.iid);
    const art = el('div', 'c-art');
    art.appendChild(el('span', 'c-init', U.initials(cardId)));
    art.appendChild(el('span', 'c-ph', 'ART PENDING'));
    c.appendChild(art);
    if (d.cost !== undefined) c.appendChild(el('div', 'c-cost', String(d.cost)));
    c.appendChild(el('div', 'c-type', U.typeLabel(cardId)));
    c.appendChild(el('div', 'c-name', d.nameEn));
    c.appendChild(el('div', 'c-jp', d.name));
    c.appendChild(el('div', 'c-text', d.text));
    if (o.why !== undefined && o.why !== null) c.appendChild(el('div', 'c-why', o.why));
    return c;
  };

  U.backEl = function (cls, label) {
    const c = el('div', 'card back' + (cls ? ' ' + cls : ''));
    c.appendChild(el('span', 'c-backmark', label === undefined ? 'XF' : label));
    return c;
  };

  // A leader tile. `st` is XS.leaderStats(...) for this leader (the only source of its numbers).
  U.leaderEl = function (st, o) {
    const d = U.card(st.cardId);
    const opts = o === undefined ? {} : o;
    const cls = `leader col-${d.color}` + (st.down ? ' is-down' : '') + (st.awakened ? ' is-awake' : '') + (opts.cls ? ' ' + opts.cls : '');
    const slot = el('div', 'l-slot');
    const t = el('div', cls);
    t.setAttribute('data-card', st.cardId);
    t.setAttribute('data-iid', st.iid);
    t.setAttribute('data-leader', st.iid);
    const art = el('div', 'c-art');
    art.appendChild(el('span', 'c-init', U.initials(st.cardId)));
    art.appendChild(el('span', 'c-ph', 'ART PENDING'));
    t.appendChild(art);
    t.appendChild(el('div', 'l-name', d.nameEn));
    t.appendChild(el('div', 'l-jp', d.name));
    const stats = el('div', 'l-stats');
    const atk = el('span', 'l-atk');
    atk.append(el('span', 'k', 'ATK '), document.createTextNode(String(st.atk)));
    const hp = el('span', 'l-hp');
    hp.append(el('span', 'k', 'HP '), document.createTextNode(String(st.remaining)), el('span', 'mx', '/' + st.hp));
    stats.append(atk, hp);
    t.appendChild(stats);
    const bar = el('progress', 'l-bar');
    bar.max = st.hp;
    bar.value = st.remaining;
    t.appendChild(bar);
    if (st.damage > 0) t.appendChild(el('div', 'l-dmg', '−' + st.damage));
    if (st.awakened) t.appendChild(el('div', 'l-awk', 'AWAKENED'));
    if (st.down) t.appendChild(el('div', 'l-stamp', 'DOWN'));
    if (st.equipment.length > 0) {
      const eq = el('div', 'l-eq');
      for (const e of st.equipment) {
        const chip = el('span', 'eq-chip', '✦ ' + U.nameEn(e.cardId));
        chip.setAttribute('data-card', e.cardId);
        chip.setAttribute('data-iid', e.iid);
        eq.appendChild(chip);
      }
      t.appendChild(eq);
    }
    slot.appendChild(t);
    return slot;
  };
})();
