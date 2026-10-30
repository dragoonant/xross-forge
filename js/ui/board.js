// js/ui/board.js: paints the board from the PRESENTED snapshot. Hidden information is only ever
// read from `S.view` (= XS.view(s, viewer)); `S.raw` goes to engine functions (leaderStats,
// costToPlay) and nowhere else. Roles (actable / target / picked...) come from targeting.js and
// prompt.js models, themselves built from legalActions and s.pending.
(function () {
  'use strict';
  const XS = globalThis.XS;
  const U = XS.ui;
  const { el, $ } = U;
  const B = (U.board = {});

  const isCard = (x) => typeof x === 'string';

  const ROLE_CLASS = {
    'attacker-option': 'r-actor', 'attacker-picked': 'r-actor r-picked',
    'target-option': 'r-target', 'target-picked': 'r-target r-picked',
    'equip-option': 'r-actor', 'equip-picked': 'r-actor r-picked',
    'choose-option': 'r-choose', 'choose-picked': 'r-choose r-picked',
  };

  function leaders(S, seat, roles, previews) {
    const wrap = el('div', 'leaders');
    const P = S.view.players[seat];
    for (let slot = 0; slot < 4; slot++) {
      const st = XS.leaderStats(S.raw, seat, slot);
      const role = roles.get(st.iid);
      const slotEl = U.leaderEl(st, { cls: role === undefined ? '' : ROLE_CLASS[role] });
      const tile = slotEl.firstChild;
      if (role !== undefined) {
        tile.style.setProperty('--pd', U.phase(1400));
        tile.setAttribute('role', 'button'); tile.tabIndex = 0;
        tile.setAttribute('aria-label', U.cardTitle(st.cardId) + (role.includes('target') ? ', target' : ', choose'));
      }
      const pv = previews.get(st.iid);
      if (pv !== undefined) {
        const b = el('div', 'l-preview' + (pv.goesDown ? ' is-down' : ''), pv.short);
        b.setAttribute('data-preview', pv.goesDown ? 'DOWN' : String(pv.total));
        tile.appendChild(b);
      }
      wrap.appendChild(slotEl);
    }
    return wrap;
  }

  function miniCard(S, iid, roles, M, extraCls) {
    const id = U.cardIdOf(S.view, iid);
    const role = roles.cards.get(iid);
    return U.cardEl(id, { iid, cls: 'mini' + (extraCls ? ' ' + extraCls : '') + (role === 'source' ? ' is-source' : '') });
  }

  function playArea(S, seat, roles, M) {
    const P = S.view.players[seat];
    const wrap = el('div', 'playarea');
    wrap.id = 'play-' + seat;
    wrap.setAttribute('aria-label', U.whose(S.view, seat) + ' play area');
    if (P.play.length === 0) wrap.appendChild(el('span', 'pa-empty', 'PLAY AREA'));
    for (const iid of P.play) {
      const armed = P.boosts.includes(iid);
      const side = P.sideways.includes(iid);      // an Echo card lying sideways: it is replayed free at the start of the next main phase (R-024)
      const c = miniCard(S, iid, roles, M, (armed ? 'armed' : '') + (side ? ' is-sideways' : ''));
      if (armed) c.appendChild(el('div', 'c-armed', 'ARMED'));
      if (side) c.appendChild(el('div', 'c-echo', 'ECHO'));
      wrap.appendChild(c);
    }
    return wrap;
  }

  function zone(id, label, count, cls) {
    const z = el(cls && cls.btn ? 'button' : 'div', 'zone ' + (cls ? cls.cls : ''));
    if (cls && cls.btn) z.type = 'button';
    z.id = id;
    z.appendChild(el('span', 'z-label', label));
    z.appendChild(el('span', 'z-count', String(count)));
    return z;
  }

  function zones(S, seat) {
    const P = S.view.players[seat];
    const w = el('div', 'zones');
    const dk = zone('deck-' + seat, 'DECK', P.deck.length, { cls: 'z-deck' });
    dk.prepend(U.backEl('z-pile', ''));
    w.appendChild(dk);
    const td = zone('tdeck-' + seat, 'T-DECK', P.tdeck.length, { cls: 'z-tdeck', btn: seat === S.me });
    if (seat === S.me) { td.setAttribute('data-viewer', 'tdeck:' + seat); td.setAttribute('data-cue', 'ui-drawer'); td.setAttribute('aria-label', 'Look at your tactics deck'); }
    w.appendChild(td);
    const tr = zone('trash-' + seat, 'TRASH', P.trash.length, { cls: 'z-trash', btn: true });
    tr.setAttribute('data-viewer', 'trash:' + seat);
    tr.setAttribute('data-cue', 'ui-drawer');
    tr.setAttribute('aria-label', U.whose(S.view, seat) + ' trash: ' + P.trash.length + ' cards, open the viewer');
    w.appendChild(tr);
    if (seat !== S.me) w.appendChild(zone('handcount-' + seat, 'HAND', P.hand.length, { cls: 'z-hand' }));
    const pp = el('div', 'zone z-pp');
    pp.id = 'pp-' + seat;
    pp.setAttribute('aria-label', `${P.pp.untapped} of ${P.pp.total} PP ready`);
    pp.appendChild(el('span', 'z-label', 'PP'));
    const pips = el('span', 'pips');
    for (let i = 0; i < P.pp.total; i++) pips.appendChild(el('i', 'pip' + (i < P.pp.untapped ? ' on' : '')));
    pp.appendChild(pips);
    pp.appendChild(el('span', 'z-count', `${P.pp.untapped}/${P.pp.total}`));
    w.appendChild(pp);
    return w;
  }

  function tacticsArea(S, seat, roles, M) {
    const P = S.view.players[seat];
    const w = el('div', 'tactics');
    w.id = 'tactics-' + seat;
    w.appendChild(el('span', 'z-label', 'TACTICS AREA'));
    const row = el('div', 'tac-row');
    if (P.tarea.length === 0) row.appendChild(el('span', 'pa-empty', 'empty'));
    for (const x of P.tarea) {
      if (!isCard(x)) { row.appendChild(U.backEl('mini tactics-back', '?')); continue; }
      const id = U.cardIdOf(S.view, x);
      const mine = seat === S.me;
      const o = { iid: x, cls: 'mini tac' };
      if (mine) decorate(S, o, x, M);
      const c = U.cardEl(id, o);
      if (mine) mark(S, c, x, M);
      row.appendChild(c);
    }
    w.appendChild(row);
    return w;
  }

  // Interaction classes for a card the viewer may play (hand or tactics area).
  function decorate(S, o, iid, M) {
    if (M.actable.has(iid)) o.cls += ' is-actable' + (M.selected === iid ? ' is-selected' : '');
    else if (M.why.has(iid)) { o.cls += ' is-disabled'; o.why = M.why.get(iid); }
  }
  function mark(S, c, iid, M) {
    c.setAttribute('data-play', iid);
    c.setAttribute('role', 'button'); c.tabIndex = 0;
    if (M.actable.has(iid)) {
      c.style.setProperty('--pd', U.phase(1400));
      c.setAttribute('aria-label', 'Play ' + U.cardTitle(U.cardIdOf(S.view, iid)));
    } else if (M.why.has(iid)) c.setAttribute('aria-disabled', 'true');
    if (M.canAct) {
      const cost = XS.costToPlay(S.raw, iid);
      const badge = c.querySelector('.c-cost');
      if (badge !== null) U.fillCostBadge(badge, U.card(U.cardIdOf(S.view, iid)).cost, cost);
    }
  }

  function side(S, seat, roles, M, previews) {
    const root = $('side-' + seat);
    root.replaceChildren();
    root.classList.toggle('is-active', S.view.phase === 'main' && S.view.active === seat);
    const field = el('div', 'field');
    const lead = leaders(S, seat, roles.leaders, previews);
    const play = playArea(S, seat, roles, M);
    if (seat === S.me) field.append(play, lead); else field.append(lead, play);
    const tac = tacticsArea(S, seat, roles, M);
    root.append(zones(S, seat), field, tac);
  }

  function hand(S, M) {
    const root = $('hand');
    root.replaceChildren();
    const P = S.view.players[S.me];
    root.style.setProperty('--n', String(P.hand.length));
    for (const iid of P.hand) {
      const id = U.cardIdOf(S.view, iid);
      const o = { iid, cls: 'handcard', lazy: true };
      decorate(S, o, iid, M);
      const c = U.cardEl(id, o);
      mark(S, c, iid, M);
      const wrap = el('div', 'hand-slot');
      wrap.appendChild(c);
      root.appendChild(wrap);
    }
  }

  function scorebug(S) {
    const v = S.view;
    const bug = $('scorebug');
    bug.replaceChildren();
    const mk = (seat, cls) => {
      const P = v.players[seat];
      const s = el('div', 'sb-side ' + cls + (v.phase === 'main' && v.active === seat ? ' is-turn' : ''));
      s.appendChild(el('span', 'sb-name', seat === S.me ? 'YOU' : 'BOT'));
      s.appendChild(el('span', 'sb-deck', P.deckId + ' ' + P.deckName));
      const pips = el('span', 'sb-pips');
      for (let i = 0; i < v.needWins; i++) pips.appendChild(el('i', 'sb-pip' + (i < v.wins[seat] ? ' on' : '')));
      s.appendChild(pips);
      s.appendChild(el('span', 'sb-score', String(v.wins[seat])));
      return s;
    };
    const mid = el('div', 'sb-mid');
    mid.appendChild(el('span', 'sb-round', 'ROUND ' + v.round));
    mid.appendChild(el('span', 'sb-mode', v.mode === 'quick' ? 'QUICK · 1 ROUND' : 'FULL · BEST OF 3'));
    const matchPoint = v.mode === 'full' && (v.wins[0] === v.needWins - 1 || v.wins[1] === v.needWins - 1);
    if (matchPoint) mid.appendChild(el('span', 'sb-mp', 'MATCH POINT'));
    document.body.classList.toggle('match-point', matchPoint && v.phase !== 'over');
    bug.append(mk(S.me, 'sb-you'), mid, mk(1 - S.me, 'sb-opp'));
  }

  function mid(S, M, PM, st, ps) {
    const v = S.view;
    const chip = $('turnchip');
    let txt;
    if (v.phase === 'over') txt = 'MATCH OVER';
    else if (v.phase === 'main') txt = (v.active === S.me ? 'YOUR TURN' : 'OPPONENT') + ' · T' + v.roundTurn;
    else txt = v.phase === 'chooseFirst' ? 'COIN TOSS' : 'SETUP';
    chip.textContent = txt;
    chip.classList.toggle('is-mine', v.phase === 'main' && v.active === S.me);
    $('hint').textContent = PM !== null ? PM.hint : M.hint;

    const slot = $('confirm-slot');
    slot.replaceChildren();
    if (PM === null && M.confirm !== null) {
      const c = el('button', 'btn primary', M.confirm.label);
      c.type = 'button'; c.id = 'confirm'; c.setAttribute('data-cue', 'ui-confirm');
      slot.appendChild(c);
    }
    if (PM === null && M.selected !== null) {
      const x = el('button', 'btn ghost', 'Cancel'); x.type = 'button'; x.id = 'cancel'; x.setAttribute('data-cue', 'ui-cancel');
      slot.appendChild(x);
    }
    const end = $('endturn');
    end.disabled = M.endTurn === null || PM !== null;
    end.querySelector('.et-num').textContent = M.endTurn !== null ? '+' + M.endTurn.n : '';
    end.setAttribute('aria-label', M.endTurn !== null ? M.endTurn.label : 'End turn (not available now)');
    $('endturn-label').textContent = M.endTurn !== null ? M.endTurn.label : '';
    $('endturn-label').hidden = M.endTurn === null;
  }

  // roles = { leaders: Map(iid -> role), cards: Map(iid -> 'source') }
  B.render = function (S, M, PM, st, ps) {
    const roles = { leaders: new Map(M.leaderRole), cards: new Map() };
    const previews = new Map();
    if (PM !== null) {
      for (const [k, r] of PM.leaderRole) roles.leaders.set(k, r);
      for (const [k, r] of PM.cardRole) roles.cards.set(k, r);
      for (const [k, p] of PM.previews) previews.set(k, p);
    } else for (const [k, p] of M.previews) previews.set(k, p);
    side(S, 1 - S.me, roles, M, previews);
    side(S, S.me, roles, M, previews);
    hand(S, M);
    scorebug(S);
    mid(S, M, PM, st, ps);
    $('board').classList.toggle('is-locked', !S.live);
  };
})();
