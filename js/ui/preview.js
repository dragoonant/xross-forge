// js/ui/preview.js: hover zoom. ONE delegated document listener keyed on [data-card] shows any
// visible card large: EN name, JP name, type, colour, cost, stats and the full English text.
// Phones: press and hold a card (without moving 8 px) to peek; a tap on a log card name pins it.
// Face-down cards carry no data-card, so nothing hidden can ever be zoomed.
(function () {
  'use strict';
  const XS = globalThis.XS;
  const U = XS.ui;
  const { el } = U;
  const P = (U.preview = {});

  // Set by the game controller: { stats(iid) -> XS.leaderStats for a leader iid in the presented state }.
  P.ctx = null;

  let box = null;
  let pinned = false;

  function zoomNode(cardId, iid) {
    const d = U.card(cardId);
    const root = el('div', 'zoom-in');
    root.appendChild(U.cardEl(cardId, { cls: 'zoomcard' }));
    const info = el('div', 'zoom-info');
    const names = el('div', 'z-names');
    names.appendChild(el('div', 'z-en', d.nameEn));
    names.appendChild(el('div', 'z-jp', d.name));
    info.appendChild(names);
    const bits = [U.typeLabel(cardId), U.COLOR_LABEL[d.color]];
    if (d.cost !== undefined) bits.push('Cost ' + d.cost + ' PP');
    if (d.ace) bits.push('ACE');
    info.appendChild(el('div', 'z-meta', bits.join(' · ')));
    if (d.type === 'leader') {
      info.appendChild(el('div', 'z-stat', `Printed: ATK ${d.atk} / HP ${d.hp}. Awakened: ATK ${d.awakenAtk} / HP ${d.awakenHp}.`));
      if (iid !== null && P.ctx !== null && U.isLeaderIid(iid)) {
        const st = P.ctx.stats(iid);
        let line = `Now: ATK ${st.atk}, HP ${st.remaining} of ${st.hp}` + (st.damage > 0 ? ` (${st.damage} damage)` : '') +
          (st.awakened ? ', awakened' : ', not awakened') + (st.down ? ', DOWN' : '') + '.';
        if (st.equipment.length > 0) line += ' Equipped: ' + st.equipment.map((e) => U.nameEn(e.cardId)).join(', ') + '.';
        info.appendChild(el('div', 'z-stat z-now', line));
        if (st.tags.length > 0) info.appendChild(el('div', 'z-stat', 'Tag: ' + st.tags.join(', ')));
      }
    }
    info.appendChild(el('div', 'z-text', d.text));
    info.appendChild(el('div', 'z-note', 'Placeholder face: the artwork arrives in a later milestone.'));
    root.appendChild(info);
    return root;
  }

  function show(target, x, y, pin) {
    const cardId = target.getAttribute('data-card');
    const iid = target.getAttribute('data-iid');
    box.replaceChildren(zoomNode(cardId, iid));
    box.classList.add('open');
    box.classList.toggle('pinned', !!pin);
    pinned = !!pin;
    if (pin) {
      box.style.left = '50%'; box.style.top = '50%';
      return;
    }
    const w = box.offsetWidth, h = box.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = x + 22;
    if (left + w > vw - 8) left = x - 22 - w;
    left = Math.max(8, Math.min(left, vw - w - 8));
    let top = y - h / 2;
    top = Math.max(8, Math.min(top, vh - h - 8));
    box.style.left = left + 'px';
    box.style.top = top + 'px';
  }
  function hide() {
    if (box === null) return;
    box.classList.remove('open', 'pinned');
    pinned = false;
  }
  P.hide = hide;

  P.init = function () {
    box = U.$('zoom');
    let current = null;
    document.addEventListener('mouseover', (e) => {
      if (pinned) return;
      const t = e.target.closest ? e.target.closest('[data-card]') : null;
      if (t === current) return;
      current = t;
      if (t === null) { hide(); return; }
      show(t, e.clientX, e.clientY, false);
    });
    document.addEventListener('mousemove', (e) => {
      if (current === null || pinned) return;
      show(current, e.clientX, e.clientY, false);
    });
    document.addEventListener('mouseleave', () => { current = null; if (!pinned) hide(); });

    // Touch: hold to peek (8 px of movement cancels it; distance, never time, separates tap from drag).
    // The click that follows a peek or a dismissing tap is swallowed once (flag + timestamp, capture phase).
    let hold = null;
    let swallowNext = false, swallowExpire = 0;
    document.addEventListener('pointerdown', (e) => {
      if (pinned) { hide(); swallowNext = true; swallowExpire = 0; e.preventDefault(); return; }
      if (e.pointerType === 'mouse') return;
      const t = e.target.closest ? e.target.closest('[data-card]') : null;
      if (t === null) return;
      hold = { t, x: e.clientX, y: e.clientY, timer: setTimeout(() => {
        show(t, e.clientX, e.clientY, true);
        swallowNext = true; swallowExpire = 0;
        hold = null;
      }, 450) };
    }, true);
    document.addEventListener('pointermove', (e) => {
      if (hold !== null && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 8) { clearTimeout(hold.timer); hold = null; }
    }, true);
    const end = () => {
      if (hold !== null) { clearTimeout(hold.timer); hold = null; }
      if (swallowNext) swallowExpire = performance.now() + 400;
    };
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', end, true);

    document.addEventListener('click', (e) => {
      if (swallowNext) {
        const live = swallowExpire === 0 || performance.now() < swallowExpire;
        swallowNext = false; swallowExpire = 0;
        if (live) { e.stopPropagation(); e.preventDefault(); return; }
      }
      const ref = e.target.closest ? e.target.closest('.cardref') : null;
      if (ref !== null) { show(ref, e.clientX, e.clientY, true); e.stopPropagation(); }
    }, true);
    document.addEventListener('contextmenu', (e) => {
      if (e.target.closest && e.target.closest('[data-card]') && e.pointerType !== 'mouse') e.preventDefault();
    });
  };
})();
