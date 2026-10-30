// js/ui/cardview.js: the one card renderer. A face shows its picture from the art manifest (js/ui/art.js) when the
// manifest has an entry for it; otherwise it is a placeholder: a colour band by card colour, a type label and initials,
// with an explicit "ART PENDING" label (never a silent fallback). The text sits on a translucent plate (.c-plate /
// .l-plate) so it stays readable over a picture. Sizes come from CSS (container query units), not from here.
// Any element with data-card is a hover-zoom doorway (preview.js).
(function () {
  'use strict';
  const XS = globalThis.XS;
  const U = XS.ui;
  const { el } = U;

  U.COLOR_LABEL = { blue: 'Blue', green: 'Green', red: 'Red', yellow: 'Yellow', colorless: 'Colourless' };

  // opts: { iid, cls, why (string: shown on the card), awake (leader: the awakened face), lazy (hand and zoom: lazy-load the picture) }
  U.cardEl = function (cardId, opts) {
    const o = opts === undefined ? {} : opts;
    const d = U.card(cardId);
    const c = el('div', `card type-${d.type} col-${d.color}${o.cls ? ' ' + o.cls : ''}`);
    c.setAttribute('data-card', cardId);
    if (o.iid !== undefined) c.setAttribute('data-iid', o.iid);
    const art = el('div', 'c-art');
    U.art.fill(c, art, cardId, U.art.faceEntry(cardId, !!o.awake), !!o.lazy);
    c.appendChild(art);
    if (d.cost !== undefined) c.appendChild(el('div', 'c-cost', String(d.cost)));
    c.appendChild(el('div', 'c-type', U.typeLabel(cardId)));
    const plate = el('div', 'c-plate');
    plate.appendChild(el('div', 'c-name', U.cardTitle(cardId)));
    plate.appendChild(el('div', 'c-jp', U.cardTitleAlt(cardId)));
    plate.appendChild(el('div', 'c-text', d.text));
    c.appendChild(plate);
    if (o.why !== undefined && o.why !== null) c.appendChild(el('div', 'c-why', o.why));
    return c;
  };

  // A face-down card. cls 'tactics-back' takes the tactics-back plate (ui/tacticsback), any other the card-back plate (ui/cardback).
  U.backEl = function (cls, label) {
    const c = el('div', 'card back' + (cls ? ' ' + cls : ''));
    if (label !== '') c.appendChild(el('span', 'c-backmark', label === undefined ? 'XF' : label));
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
    U.art.fill(t, art, st.cardId, U.art.faceEntry(st.cardId, st.awakened), false);
    t.appendChild(art);
    const plate = el('div', 'l-plate');
    plate.appendChild(el('div', 'l-name', U.cardTitle(st.cardId)));
    plate.appendChild(el('div', 'l-jp', U.cardTitleAlt(st.cardId)));
    const stats = el('div', 'l-stats');
    const atk = el('span', 'l-atk');
    atk.append(el('span', 'k', 'ATK '), document.createTextNode(String(st.atk)));
    const hp = el('span', 'l-hp');
    hp.append(el('span', 'k', 'HP '), document.createTextNode(String(st.remaining)), el('span', 'mx', '/' + st.hp));
    stats.append(atk, hp);
    plate.appendChild(stats);
    const bar = el('progress', 'l-bar');
    bar.max = st.hp;
    bar.value = st.remaining;
    plate.appendChild(bar);
    t.appendChild(plate);
    if (st.damage > 0) t.appendChild(el('div', 'l-dmg', '−' + st.damage));
    if (st.awakened) t.appendChild(el('div', 'l-awk', 'AWAKENED'));
    if (st.down) t.appendChild(el('div', 'l-stamp', 'DOWN'));
    if (st.equipment.length > 0) {
      const eq = el('div', 'l-eq');
      for (const e of st.equipment) {
        const chip = el('span', 'eq-chip', '✦ ' + U.cardTitle(e.cardId));
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
