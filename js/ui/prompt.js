// js/ui/prompt.js: pending decisions (s.pending) through ONE prompt component. It shows the source
// card, the engine's own `prompt` sentence, what kind of decision it is, the options (highlighted on
// the board for leaders, a picker for cards), min/max, +/- steppers for `distribute`, and never
// answers by itself, not even with a single candidate. "Hide - check the board" parks the prompt
// as a pill; the decision stays pending. Decline exists only when min === 0.
// Contract: docs/ENGINE-API.md "Pending decision". Headless-safe at load (no DOM until called).
(function () {
  'use strict';
  const XS = globalThis.XS;
  const U = XS.ui;
  const { el } = U;
  const Pr = (U.prompt = {});

  // purpose -> short heading. Every purpose of the contract must be here (tests/30-ui.js).
  U.PURPOSE_LABEL = {
    first: 'Who goes first', tactics: 'Pick a tactics card', target: 'Choose a target', heal: 'Choose who to heal',
    discard: 'Discard', handLimit: 'Hand limit', order: 'Order the effects', attack: 'Choose the attack', distribute: 'Split it up',
  };
  // pending.kind -> renderer. Every kind of the contract must be here (tests/30-ui.js).
  U.PROMPT_KIND = {};
  // pending.purpose -> the kind its renderer lives under (a purpose always arrives with one kind).
  U.PROMPT_PURPOSE = {
    first: 'chooseFirst', tactics: 'pickTactics', target: 'choose', heal: 'choose', discard: 'choose',
    handLimit: 'choose', order: 'choose', attack: 'attackPair', distribute: 'distribute',
  };

  Pr.fresh = () => ({ key: null, picked: [], attacker: null, target: null, alloc: {}, hidden: false });

  const isLeaderOpt = (pend) => pend.options.length > 0 && pend.options.every((o) => U.isLeaderIid(o));
  const nameOfLeader = (S, iid) => U.cardTitle(U.leaderCardId(S.view, iid));
  const pendKey = (p) => JSON.stringify([p.kind, p.seat, p.source, p.purpose, p.options, p.min, p.max, p.total, p.unit, p.attackers, p.targets, p.card]);

  // ---- model ---------------------------------------------------------------------------------
  // Returns null when nothing is pending. PM.mine is false while the OTHER seat decides.
  Pr.model = function (S, ps) {
    const pend = S.view.pending;
    if (pend === null || pend === undefined) { ps.key = null; return null; }
    const key = pendKey(pend);
    if (ps.key !== key) { Object.assign(ps, Pr.fresh()); ps.key = key; }
    const PM = {
      pending: pend, mine: pend.seat === S.me, kind: pend.kind, leaderRole: new Map(), cardRole: new Map(),
      title: pend.prompt, purposeLabel: U.PURPOSE_LABEL[pend.purpose], hint: '', confirm: null, decline: null, previews: new Map(),
    };
    if (PM.purposeLabel === undefined) throw new Error('ui/prompt: no label for pending purpose "' + pend.purpose + '"');
    if (U.PROMPT_KIND[pend.kind] === undefined) throw new Error('ui/prompt: no renderer for pending kind "' + pend.kind + '"');
    if (pend.source !== null && pend.source !== undefined) PM.cardRole.set(pend.source, 'source');
    if (S.spectate) { PM.mine = false; PM.hint = 'Spectating: ' + pend.prompt; return PM; }
    if (!PM.mine) { PM.hint = 'Opponent is deciding: ' + pend.prompt; return PM; }
    if (!S.live) { PM.mine = false; PM.hint = 'Playing out what just happened. Click anywhere to skip.'; return PM; }
    U.PROMPT_KIND[pend.kind].model(S, ps, PM, pend);
    return PM;
  };

  Pr.click = function (S, ps, PM, kind, iid) {
    if (PM === null || !PM.mine) return false;
    const h = U.PROMPT_KIND[PM.kind];
    return h.click === undefined ? false : h.click(S, ps, PM, kind, iid);
  };

  // ---- the kinds -----------------------------------------------------------------------------
  U.PROMPT_KIND.chooseFirst = {
    model(S, ps, PM, pend) {
      const acts = S.legal.filter((a) => a.type === 'chooseFirst');
      PM.options = acts.map((a) => ({ action: a, label: a.first === S.me ? 'Go first' : 'Go second' }));
      PM.hint = pend.prompt;
    },
    body(S, ps, PM, redraw, act) {
      const row = el('div', 'p-big');
      for (const o of PM.options) {
        const b = el('button', 'btn big', o.label);
        b.type = 'button'; b.setAttribute('data-cue', 'ui-confirm');
        b.addEventListener('click', () => act(o.action));
        row.appendChild(b);
      }
      return row;
    },
  };

  U.PROMPT_KIND.pickTactics = {
    model(S, ps, PM, pend) {
      const legalIids = S.legal.filter((a) => a.type === 'pickTactics').map((a) => a.iid);
      PM.optionIids = pend.options.filter((o) => legalIids.includes(o));
      if (PM.optionIids.length !== pend.options.length) U.diag('pickTactics: pending.options and legalActions disagree.');
      const name = ps.picked.length ? U.cardTitle(U.cardIdOf(S.view, ps.picked[0])) : null;
      PM.hint = pend.prompt;
      if (name !== null) PM.confirm = { enabled: true, label: 'Pick ' + name, action: { type: 'pickTactics', iid: ps.picked[0] } };
      else PM.confirm = { enabled: false, label: 'Pick a card', action: null };
    },
    click(S, ps, PM, kind, iid) {
      if (kind !== 'option') return false;
      ps.picked = ps.picked[0] === iid ? [] : [iid];
      return true;
    },
    body(S, ps, PM, redraw) { return cardPicker(S, ps, PM, redraw, 1, 1, true); },
  };

  U.PROMPT_KIND.choose = {
    model(S, ps, PM, pend) {
      const leaders = isLeaderOpt(pend);
      PM.leaders = leaders;
      for (const o of pend.options) {
        if (leaders) PM.leaderRole.set(o, ps.picked.includes(o) ? 'choose-picked' : 'choose-option');
      }
      const n = ps.picked.length;
      const names = ps.picked.map((i) => (leaders ? nameOfLeader(S, i) : nameOfCard(S, i)));
      const verb = { target: 'Target', heal: 'Heal', discard: 'Discard', handLimit: 'Discard', order: 'Resolve first:' }[pend.purpose];
      const range = pend.min === pend.max ? `exactly ${pend.max}` : `${pend.min} to ${pend.max}`;
      PM.hint = `${pend.prompt}  (choose ${range}; picked ${n})`;
      PM.confirm = {
        enabled: n >= pend.min && n <= pend.max && n > 0,
        label: n === 0 ? (pend.min === pend.max ? `Choose ${pend.max === 1 ? 'one' : pend.max}` : `Choose up to ${pend.max}`)
          : (n > 2 ? `${verb} ${n} cards` : `${verb} ${names.join(', ')}`),
        action: { type: 'choose', ids: ps.picked.slice() },
      };
      if (pend.min === 0) PM.decline = { label: 'Choose none (skip this)', action: { type: 'choose', ids: [] } };
    },
    click(S, ps, PM, kind, iid) {
      const pend = PM.pending;
      if (kind !== 'leader' && kind !== 'option') return false;
      if (!pend.options.includes(iid)) return false;
      const i = ps.picked.indexOf(iid);
      if (i >= 0) ps.picked.splice(i, 1);
      else if (pend.max === 1) ps.picked = [iid];
      else if (ps.picked.length < pend.max) ps.picked.push(iid);
      else U.toast(`You can pick at most ${pend.max}. Tap a picked one to remove it.`);
      return true;
    },
    body(S, ps, PM, redraw) {
      const pend = PM.pending;
      if (PM.leaders) return leaderChips(S, ps, PM, redraw);
      return cardPicker(S, ps, PM, redraw, pend.min, pend.max, pend.purpose === 'order');
    },
  };

  U.PROMPT_KIND.attackPair = {
    model(S, ps, PM, pend) {
      const acts = S.legal.filter((a) => a.type === 'attack');
      const attackers = Array.from(new Set(acts.map((a) => a.attacker)));
      if (ps.attacker !== null && !attackers.includes(ps.attacker)) { ps.attacker = null; ps.target = null; }
      const cname = pend.card ? U.cardTitle(U.cardIdOf(S.view, pend.card)) : 'the attack';
      for (const a of attackers) PM.leaderRole.set(a, a === ps.attacker ? 'attacker-picked' : 'attacker-option');
      if (ps.attacker === null) { PM.hint = `${pend.prompt} Choose which of your leaders attacks with ${cname}.`; PM.stage = 'attacker'; return; }
      const targets = Array.from(new Set(acts.filter((a) => a.attacker === ps.attacker).map((a) => a.target)));
      if (ps.target !== null && !targets.includes(ps.target)) ps.target = null;
      for (const t of targets) {
        PM.leaderRole.set(t, t === ps.target ? 'target-picked' : 'target-option');
        PM.previews.set(t, U.targeting.previewLine(S, { type: 'attack', attacker: ps.attacker, target: t }, pend.card));
      }
      PM.stage = 'target';
      if (ps.target === null) { PM.hint = `${nameOfLeader(S, ps.attacker)} attacks with ${cname}: choose a target.`; return; }
      const pv = PM.previews.get(ps.target);
      PM.hint = pv.text + '  ·  ' + U.targeting.breakdown(S, pv.detail);
      PM.confirm = {
        enabled: true, label: `Attack ${nameOfLeader(S, ps.target)} — ${pv.goesDown ? 'DOWN' : pv.total + ' damage'}`,
        action: acts.find((a) => a.attacker === ps.attacker && a.target === ps.target),
      };
    },
    click(S, ps, PM, kind, iid) {
      if (kind !== 'leader') return false;
      const role = PM.leaderRole.get(iid);
      if (role === undefined) return false;
      if (role.startsWith('attacker')) { ps.attacker = ps.attacker === iid ? null : iid; ps.target = null; return true; }
      ps.target = ps.target === iid ? null : iid;
      return true;
    },
    body(S, ps, PM) {
      const d = el('div', 'p-note', PM.hint);
      return d;
    },
  };

  U.PROMPT_KIND.distribute = {
    model(S, ps, PM, pend) {
      let sum = 0;
      for (const k in ps.alloc) sum += ps.alloc[k];
      PM.sum = sum;
      PM.hint = `${pend.prompt}  (${sum} of ${pend.total} assigned, in steps of ${pend.unit})`;
      for (const o of pend.options) PM.leaderRole.set(o, (ps.alloc[o] || 0) > 0 ? 'choose-picked' : 'choose-option');
      const alloc = {};
      for (const k in ps.alloc) if (ps.alloc[k] > 0) alloc[k] = ps.alloc[k];
      PM.confirm = { enabled: sum === pend.total, label: sum === pend.total ? 'Confirm split' : `Assign ${pend.total - sum} more`, action: { type: 'distribute', alloc } };
    },
    click(S, ps, PM, kind, iid) {
      if (kind !== 'leader' || !PM.pending.options.includes(iid)) return false;
      step(ps, PM.pending, iid, +1);
      return true;
    },
    body(S, ps, PM, redraw) {
      const pend = PM.pending;
      const box = el('div', 'p-dist');
      box.appendChild(el('div', 'p-total', `${PM.sum} / ${pend.total}`));
      for (const o of pend.options) {
        const st = XS.leaderStats(S.raw, U.leaderSeat(o), U.leaderSlot(o));
        const row = el('div', 'p-dist-row');
        row.setAttribute('data-leader-hover', o);
        const nm = el('span', 'p-dist-name', U.cardTitle(st.cardId));
        nm.setAttribute('data-card', st.cardId); nm.setAttribute('data-iid', o);
        row.appendChild(nm);
        row.appendChild(el('span', 'p-dist-hp', `HP ${st.remaining}/${st.hp}`));
        const minus = el('button', 'btn step', '−'); minus.type = 'button';
        minus.setAttribute('aria-label', 'Less for ' + U.cardTitle(st.cardId));
        minus.disabled = (ps.alloc[o] || 0) <= 0;
        minus.addEventListener('click', () => { step(ps, pend, o, -1); redraw(); });
        const val = el('span', 'p-dist-n', String(ps.alloc[o] || 0));
        const plus = el('button', 'btn step', '+'); plus.type = 'button';
        plus.setAttribute('aria-label', 'More for ' + U.cardTitle(st.cardId));
        plus.disabled = PM.sum >= pend.total;
        plus.addEventListener('click', () => { step(ps, pend, o, +1); redraw(); });
        row.append(minus, val, plus);
        box.appendChild(row);
      }
      return box;
    },
  };

  function step(ps, pend, iid, dir) {
    let sum = 0;
    for (const k in ps.alloc) sum += ps.alloc[k];
    const cur = ps.alloc[iid] || 0;
    if (dir > 0 && sum + pend.unit > pend.total) return;
    if (dir < 0 && cur - pend.unit < 0) return;
    ps.alloc[iid] = cur + dir * pend.unit;
  }

  function nameOfCard(S, iid) {
    const id = U.cardIdOf(S.view, iid);
    return id === null ? 'effect ' + iid : U.cardTitle(id);
  }

  // Leader options as chips (the board highlights them too; both click paths do the same thing).
  function leaderChips(S, ps, PM, redraw) {
    const row = el('div', 'p-chips');
    for (const o of PM.pending.options) {
      const st = XS.leaderStats(S.raw, U.leaderSeat(o), U.leaderSlot(o));
      const picked = ps.picked.includes(o);
      const b = el('button', 'chip' + (picked ? ' is-picked' : ''), '');
      b.type = 'button';
      b.setAttribute('data-leader-hover', o);
      b.appendChild(el('span', 'chip-side', U.leaderSeat(o) === S.me ? 'YOURS' : 'THEIRS'));
      b.appendChild(el('span', 'chip-name', U.cardTitle(st.cardId)));
      b.appendChild(el('span', 'chip-hp', `HP ${st.remaining}/${st.hp}`));
      b.addEventListener('click', () => { if (U.PROMPT_KIND.choose.click(S, ps, PM, 'option', o)) redraw(); });
      row.appendChild(b);
    }
    return row;
  }

  // Cards the player picks among (tactics deck, hand discards, ordering). Options are drawn from the
  // viewer's own registry; an option that is not a visible card is shown as a plain labelled button.
  function cardPicker(S, ps, PM, redraw, min, max, withText) {
    const pend = PM.pending;
    const wrap = el('div', 'p-cards' + (withText ? ' with-text' : ''));
    const list = pend.kind === 'pickTactics' ? PM.optionIids : pend.options;
    for (const o of list) {
      const id = U.cardIdOf(S.view, o);
      const picked = ps.picked.includes(o);
      let node;
      if (id === null) {
        node = el('button', 'btn' + (picked ? ' is-picked' : ''), 'Effect ' + o);
        node.type = 'button';
      } else {
        node = U.cardEl(id, { iid: o, cls: 'pick' + (picked ? ' is-picked' : '') });
        node.setAttribute('role', 'button');
        node.tabIndex = 0;
      }
      const go = () => { if (U.PROMPT_KIND[pend.kind].click(S, ps, PM, 'option', o)) redraw(); };
      node.addEventListener('click', go);
      node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      wrap.appendChild(node);
    }
    return wrap;
  }

  // ---- DOM -----------------------------------------------------------------------------------
  // Builds the prompt panel. `act(action)` applies an answer; `redraw()` repaints (selection changes).
  Pr.render = function (S, ps, PM, redraw, act) {
    const pend = PM.pending;
    const modal = PM.kind === 'pickTactics' || PM.kind === 'distribute' || (PM.kind === 'choose' && !PM.leaders) || PM.kind === 'chooseFirst';
    const card = el('div', 'prompt-card ' + (modal ? 'is-modal' : 'is-bar') + ' kind-' + PM.kind);
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', PM.purposeLabel);
    const head = el('div', 'p-head');
    if (pend.source !== null && pend.source !== undefined) {
      const sid = U.cardIdOf(S.view, pend.source);
      if (sid !== null) {
        const src = el('div', 'p-source');
        src.appendChild(U.cardEl(sid, { iid: pend.source, cls: 'mini' }));
        head.appendChild(src);
      }
    }
    const titles = el('div', 'p-titles');
    const tag = el('div', 'p-purpose');
    tag.appendChild(el('span', 'p-tag', PM.purposeLabel.toUpperCase()));
    if (pend.source !== null && pend.source !== undefined && U.cardIdOf(S.view, pend.source) !== null) {
      tag.appendChild(el('span', 'p-from', ' from ' + U.cardTitle(U.cardIdOf(S.view, pend.source))));
    }
    titles.appendChild(tag);
    titles.appendChild(el('div', 'p-text', pend.prompt));
    if (pend.kind === 'choose' || pend.kind === 'distribute') {
      const bits = [];
      if (pend.kind === 'choose') bits.push(pend.min === pend.max ? `Pick exactly ${pend.max}` : `Pick ${pend.min} to ${pend.max}`);
      else bits.push(`Assign ${pend.total} in steps of ${pend.unit}`);
      if (pend.min === 0 && pend.kind === 'choose') bits.push('you may choose none');
      titles.appendChild(el('div', 'p-rule', bits.join(' · ')));
    }
    head.appendChild(titles);
    card.appendChild(head);
    const body = U.PROMPT_KIND[PM.kind].body(S, ps, PM, redraw, act);
    if (body) { body.classList.add('p-body'); card.appendChild(body); }
    const foot = el('div', 'p-foot');
    const hide = el('button', 'btn ghost', 'Hide — check the board');
    hide.type = 'button'; hide.setAttribute('data-cue', 'ui-cancel');
    hide.addEventListener('click', () => { ps.hidden = true; redraw(); });
    foot.appendChild(hide);
    if (PM.decline !== null) {
      const d = el('button', 'btn', PM.decline.label); d.type = 'button'; d.setAttribute('data-cue', 'ui-cancel');
      d.addEventListener('click', () => act(PM.decline.action));
      foot.appendChild(d);
    }
    if (PM.confirm !== null) {
      const c = el('button', 'btn primary', PM.confirm.label); c.type = 'button';
      c.disabled = !PM.confirm.enabled;
      c.id = 'prompt-confirm'; c.setAttribute('data-cue', 'ui-confirm');
      c.addEventListener('click', () => act(PM.confirm.action));
      foot.appendChild(c);
    }
    card.appendChild(foot);
    return card;
  };

  Pr.pill = function (PM, redraw) {
    const b = el('button', 'pill', 'Decision pending — ' + PM.purposeLabel + ': show');
    b.type = 'button';
    b.id = 'prompt-pill';
    return b;
  };
})();
