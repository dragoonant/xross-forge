// js/ui/targeting.js: the main-phase interaction. Every affordance derives from XS.legalActions;
// every number from an engine function (previewAttackDetail, costToPlay, whyNot, s.pp).
//   S  = the presented snapshot { raw, view, me, legal }  (raw is only handed to engine functions)
//   st = the player's selection { iid, attacker, target }  (UI state, no rules in it)
// model(S, st) -> M describes what is actable / highlighted / confirmable. Never auto-picks: a
// single candidate still has to be clicked (CLAUDE.md rule 4).
(function () {
  'use strict';
  const XS = globalThis.XS;
  const U = XS.ui;
  const T = (U.targeting = {});

  T.fresh = () => ({ iid: null, attacker: null, target: null, note: null });

  const uniq = (xs) => Array.from(new Set(xs));
  const nameOfLeader = (S, iid) => U.cardTitle(U.leaderCardId(S.view, iid));

  // The playable-card map: iid -> legal `play` actions that name it as `iid`.
  T.playMap = function (legal) {
    const m = new Map();
    for (const a of legal) {
      if (a.type !== 'play') continue;
      if (!m.has(a.iid)) m.set(a.iid, []);
      m.get(a.iid).push(a);
    }
    return m;
  };
  T.endTurnAction = (legal) => legal.find((a) => a.type === 'endTurn') || null;

  // "Crossfire: Uruha -> Selly, 30 damage" or "... DOWN" (previewAttackDetail.goesDown).
  T.previewDetail = function (S, action) {
    const d = XS.previewAttackDetail(S.raw, action);
    return d;
  };
  T.previewLine = function (S, action, cardIid) {
    const d = T.previewDetail(S, action);
    const cardName = U.cardTitle(U.cardIdOf(S.view, cardIid === undefined ? action.iid : cardIid));
    const a = nameOfLeader(S, action.attacker), t = nameOfLeader(S, action.target);
    const dmg = d.goesDown ? 'DOWN' : d.total + ' damage';
    return { text: `${cardName}: ${a} → ${t}, ${dmg}`, short: d.goesDown ? 'DOWN' : '−' + d.total, detail: d, total: d.total, goesDown: d.goesDown };
  };
  T.breakdown = function (S, d) {
    const parts = ['ATK ' + d.atk];
    for (const b of d.boosts) parts.push(U.cardTitle(U.cardIdOf(S.view, b.iid)) + ' +' + b.amount);
    if (d.card) parts.push('card +' + d.card);
    return parts.join(' ');
  };

  T.model = function (S, st) {
    const M = {
      canAct: false, actable: new Set(), why: new Map(), selected: null, stage: 'idle',
      leaderRole: new Map(), hint: '', confirm: null, endTurn: null, playMap: new Map(), previews: new Map(),
    };
    const v = S.view;
    const me = S.me;
    const P = v.players[me];
    const handIids = P.hand.filter((x) => typeof x === 'string');
    const tareaIids = P.tarea.filter((x) => typeof x === 'string');
    const cardIids = handIids.concat(tareaIids);

    if (S.spectate) { M.hint = 'Spectating: bot against bot.'; return M; }
    if (!S.live) { M.hint = 'Playing out what just happened. Click anywhere to skip.'; return M; }
    if (v.phase === 'over') { M.hint = 'Match over.'; return M; }
    if (v.pending !== null && v.pending !== undefined) return M;      // prompt.js owns pending decisions
    if (XS.whoActs(S.raw) !== me) {
      M.hint = "Opponent's turn.";
      for (const iid of cardIids) M.why.set(iid, "Opponent's turn.");
      return M;
    }
    M.canAct = true;
    M.playMap = T.playMap(S.legal);
    for (const iid of cardIids) {
      if (M.playMap.has(iid)) M.actable.add(iid);
      else {
        const w = XS.whyNot(S.raw, iid);
        if (w === null) {
          U.diag('Engine says ' + U.cardTitle(U.cardIdOf(v, iid)) + ' can be played (whyNot is null) but legalActions lists no play for it.');
          M.why.set(iid, 'No legal play found for this card.');
        } else M.why.set(iid, w);
      }
    }
    const end = T.endTurnAction(S.legal);
    if (end !== null) {
      const n = P.pp.untapped;
      M.endTurn = { action: end, n, label: n > 0 ? `End turn — draw ${n} for ${n} unused PP` : 'End turn — no unused PP, draw 0' };
    }

    if (st.iid !== null && !M.actable.has(st.iid)) { st.iid = null; st.attacker = null; st.target = null; }
    if (st.iid === null) {
      M.hint = st.note !== null ? st.note : 'Your turn. Tap a glowing card to play it.';
      return M;
    }
    M.selected = st.iid;
    const acts = M.playMap.get(st.iid);
    const cardId = U.cardIdOf(v, st.iid);
    const cname = U.cardTitle(cardId);
    const cost = XS.costToPlay(S.raw, st.iid);
    const hasAttack = acts.some((a) => a.attacker !== undefined);
    const hasTargetOnly = !hasAttack && acts.some((a) => a.target !== undefined);

    if (hasAttack) {
      const attackers = uniq(acts.map((a) => a.attacker));
      if (st.attacker !== null && !attackers.includes(st.attacker)) { st.attacker = null; st.target = null; }
      for (const a of attackers) M.leaderRole.set(a, a === st.attacker ? 'attacker-picked' : 'attacker-option');
      if (st.attacker === null) {
        M.stage = 'attacker';
        M.hint = `${cname} (${cost} PP): choose which of your leaders attacks.`;
        return M;
      }
      const targets = uniq(acts.filter((a) => a.attacker === st.attacker).map((a) => a.target));
      if (st.target !== null && !targets.includes(st.target)) st.target = null;
      for (const t of targets) {
        M.leaderRole.set(t, t === st.target ? 'target-picked' : 'target-option');
        M.previews.set(t, T.previewLine(S, acts.find((a) => a.attacker === st.attacker && a.target === t)));
      }
      M.stage = 'target';
      if (st.target === null) {
        M.hint = `${nameOfLeader(S, st.attacker)} attacks with ${cname} (${cost} PP): choose a target.`;
        return M;
      }
      const action = acts.find((a) => a.attacker === st.attacker && a.target === st.target);
      const pv = M.previews.get(st.target);
      M.stage = 'confirm';
      M.hint = pv.text + '  ·  ' + T.breakdown(S, pv.detail);
      M.confirm = { action, label: `Attack ${nameOfLeader(S, st.target)}: ${pv.goesDown ? 'DOWN' : pv.total + ' damage'}` };
      return M;
    }
    if (hasTargetOnly) {
      const targets = uniq(acts.map((a) => a.target));
      if (st.target !== null && !targets.includes(st.target)) st.target = null;
      for (const t of targets) M.leaderRole.set(t, t === st.target ? 'equip-picked' : 'equip-option');
      if (st.target === null) {
        M.stage = 'target';
        M.hint = `${cname} (${cost} PP): choose one of your leaders to equip.`;
        return M;
      }
      M.stage = 'confirm';
      M.hint = `Equip ${cname} to ${nameOfLeader(S, st.target)}.`;
      M.confirm = { action: acts.find((a) => a.target === st.target), label: `Equip ${cname} to ${nameOfLeader(S, st.target)} (${cost} PP)` };
      return M;
    }
    // A bare play: memoria, a one-use tactics card, the PP Ticket, an attack card whose play-time
    // effects come first (the engine then asks for the attacker and target as a pending decision).
    M.stage = 'confirm';
    M.hint = `${cname}: ${U.card(cardId).text.replace(/\n/g, ' ')}`;
    M.confirm = { action: acts[0], label: `Play ${cname} (${cost} PP)` };
    return M;
  };

  // A click on something. kind: 'card' (hand or tactics area) | 'leader'. Returns true if the
  // selection changed (the caller redraws). Plays nothing: the confirm button does.
  T.click = function (S, st, M, kind, iid) {
    st.note = null;
    if (!M.canAct) return false;
    if (kind === 'card') {
      if (!M.actable.has(iid)) { st.note = M.why.get(iid); st.iid = null; st.attacker = null; st.target = null; return true; }
      if (st.iid === iid) { st.iid = null; st.attacker = null; st.target = null; return true; }
      st.iid = iid; st.attacker = null; st.target = null;
      return true;
    }
    if (kind === 'leader') {
      const role = M.leaderRole.get(iid);
      if (role === undefined) return false;
      if (role.startsWith('attacker')) {
        if (st.attacker === iid) { st.attacker = null; st.target = null; } else { st.attacker = iid; st.target = null; }
        return true;
      }
      if (st.target === iid) st.target = null; else st.target = iid;
      return true;
    }
    return false;
  };
})();
