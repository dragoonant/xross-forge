// js/ui/game.js: the match controller. ONE apply funnel; a presented-state cursor over the log; the
// bot loop; the redraw path (one path, always repaints roles and re-wires nothing: events are
// delegated on #game). Rendering reads XS.view only; engine queries get the raw presented state.
//   live       the engine state after the latest action
//   presented  { raw, view } the board the player sees; behind `live` while the director plays the
//              new log entries on the old board (so a downed leader is still there to go down)
(function () {
  'use strict';
  const XS = globalThis.XS;
  const U = XS.ui;
  const { el, $ } = U;
  const G = (U.game = {});

  const ME = 0;     // the human always sits in seat 0 (top of the screen is seat 1)
  let run = null;   // the running match: { id, live, presented, cursor, bots, spectate, init, ... }
  let st = U.targeting.fresh();
  let ps = U.prompt.fresh();
  let drawerOpen = false;
  let drawerLen = -1;
  let endShown = false;

  G.running = () => run !== null;
  // Test hook (e2e): the raw engine state and the presented snapshot. Not used by the UI itself.
  G.debug = () => ({ live: run.live, presented: run.presented, pumping: run.pumping, diagnostics: U.diagnostics, opts: run.opts, bots: Object.keys(run.bots).map((k) => run.bots[k].name) });

  // ---- start / stop ---------------------------------------------------------------------------
  // opts: { decks:[id,id], mode, seed, spectate, tier }   tier: 'easy' | 'normal' | 'hard' (the AI's level; default normal)
  G.start = function (opts) {
    const seed = opts.seed === undefined ? (Math.floor(Math.random() * 1e9) + 1) : opts.seed;
    const init = { decks: opts.decks, seed, mode: opts.mode, first: 'random', names: opts.spectate ? ['Bot A', 'Bot B'] : ['You', 'Bot'] };
    const s = XS.newGame(init);
    if (!opts.spectate) U.save.write(s, { tier: opts.tier });       // a new match replaces any older save at once
    begin(opts, init, s, 0);
  };
  // Continue a saved match from a state the caller rebuilt with XS.replay (title.js; a save that will not replay never gets here).
  G.resumeState = function (s, extra) {
    begin({ decks: s.init.decks, mode: s.init.mode, seed: s.init.seed, spectate: false, tier: extra === undefined ? undefined : extra.tier }, s.init, s, s.log.length);
  };
  // A bug report's { init, actions } rebuilt by XS.replay, shown as it stood (the e2e resumes real positions this way).
  G.resume = function (report, extra) { G.resumeState(XS.replay(report.init, report.actions), extra); };

  // Who plays the bot seats. The opponent is the AI (js/ai, in a Web Worker) unless the URL says ?bot=random (the e2e and the
  // fuzz path). Bot-vs-bot autoplay (the e2e) keeps the random bot unless ?bot=ai. There is no fallback from one to the other.
  function makeBots(opts, seed) {
    const kind = U.params().get('bot');
    if (kind !== null && kind !== 'ai' && kind !== 'random') throw new Error('game: ?bot= is "ai" or "random", got "' + kind + '"');
    const useAi = kind === 'ai' || (kind === null && !opts.spectate);
    const tier = opts.tier === undefined ? 'normal' : opts.tier;
    if (useAi && XS.ai === undefined) throw new Error('game: js/ai did not load');
    if (useAi && XS.ai.TIERS[tier] === undefined) throw new Error('game: unknown AI level "' + tier + '"');
    const mk = (seat) => (useAi ? U.makeAiBot({ seat, tier, seed }) : U.makeRandomBot(seed, seat));
    return opts.spectate ? { 0: mk(0), 1: mk(1) } : { 1: mk(1) };
  }

  function begin(opts, init, s, cursor) {
    if (run !== null) G.stop();
    const seed = init.seed;
    const view = XS.view(s, ME);
    run = {
      id: Math.random(), live: s, presented: { raw: s, view }, cursor, pumping: false, opts, init,
      spectate: !!opts.spectate, timer: null,
      bots: makeBots(opts, seed),
    };
    st = U.targeting.fresh(); ps = U.prompt.fresh();
    endShown = false; drawerLen = -1;
    U.preview.ctx = { stats: (iid) => XS.leaderStats(run.presented.raw, U.leaderSeat(iid), U.leaderSlot(iid)) };
    document.body.classList.add('in-game');
    $('title-screen').hidden = true;
    $('game').hidden = false;
    $('endscreen').classList.remove('open'); $('end-pill').hidden = true;
    $('prompt').replaceChildren(); $('prompt-pill').hidden = true;
    $('caption').replaceChildren();
    if (cursor > 0) setCaption(view.log[cursor - 1], view);
    render();
    pump();
  }

  G.stop = function () {
    if (run === null) return;
    clearTimeout(run.timer);
    clearAutoPass();
    U.anim.skip();
    run = null;
    document.body.classList.remove('in-game', 'match-point');
    $('game').hidden = true;
    $('title-screen').hidden = false;
    $('endscreen').classList.remove('open'); $('end-pill').hidden = true;
    $('viewer').classList.remove('open');
    $('prompt').replaceChildren();
    U.sfx.scene('title');
    U.title.refreshContinue();
  };
  // Settings changed (names, speed): repaint the board. Nothing to do on the title.
  G.redraw = () => { if (run !== null) { drawerLen = -1; render(); } };

  // ---- the snapshot the UI paints -------------------------------------------------------------
  function snapshot() {
    const p = run.presented;
    const live = !run.pumping && p.raw === run.live && !XS.isTerminal(p.raw);
    const mine = live && !run.spectate && XS.whoActs(p.raw) === ME;
    return { raw: p.raw, view: p.view, me: ME, live, spectate: run.spectate, legal: mine ? XS.legalActions(p.raw) : [] };
  }

  // ---- apply funnel ---------------------------------------------------------------------------
  function act(action, bot) {
    if (run === null) return;
    let next;
    try { next = XS.apply(run.live, action); } catch (e) {
      if (e instanceof XS.Illegal) {
        U.diag('The engine rejected ' + JSON.stringify(action) + ': ' + e.message);
        if (bot !== undefined && bot.think !== undefined) U.aiClient.fail('the AI answered with an action the engine rejected (' + e.message + ').');
        render();
        return;
      }
      throw e;
    }
    run.live = next;
    clearAutoPass();
    // Autosave: every applied action. A finished match is not a save any more.
    if (!run.spectate) { if (XS.isTerminal(next)) U.save.clear(); else U.save.write(next, { tier: run.opts.tier }); }
    st = U.targeting.fresh();
    pump();
  }

  // Play every log entry the player has not seen on the old board, then show the new state.
  async function pump() {
    if (run === null || run.pumping) return;
    const id = run.id;
    run.pumping = true;
    try {
      while (run !== null && run.id === id && run.cursor < run.live.log.length) {
        const raw = run.live;
        const view = XS.view(raw, ME);
        if (view.log.length !== raw.log.length) U.diag('view.log and state.log differ in length.');
        const entries = view.log.slice(run.cursor);
        const steps = U.anim.plan(entries, view, ME);
        render();       // the old board, locked
        await U.anim.play(steps, { me: ME, setCaption: (entry) => setCaption(entry, view), onLog: (entry) => XS.Audio.onLog(entry, view) });
        if (run === null || run.id !== id) return;
        run.cursor = raw.log.length;
        run.presented = { raw, view };
      }
    } finally { if (run !== null && run.id === id) run.pumping = false; }
    if (run === null || run.id !== id) return;
    render();
    after();
  }

  function setCaption(entry, view) {
    const { segs } = U.logText(entry, view);
    const node = U.segsToNode(segs, 'span');
    const cap = $('caption');
    cap.replaceChildren(node);
    $('cap-tag').textContent = 'R' + entry.round + ' · T' + entry.turn;
  }

  // After the board is current: end of match, a bot's move, or the human's turn.
  function after() {
    const s = run.live;
    if (XS.isTerminal(s)) { showEnd(); return; }
    const who = XS.whoActs(s);
    const bot = run.bots[who];
    if (bot === undefined) { maybeAutoPass(); return; }       // the human decides
    const id = run.id;
    clearTimeout(run.timer);
    const think = U.ms(600);
    // An AI bot answers asynchronously (a Web Worker): start the request now, so it thinks while the director plays and during the
    // think beat. The bot then waits for the director to be idle AND the think beat AND its answer. Past 5 s without an answer the
    // watchdog takes the AI's best so far; with none it reports the failure (never a random move).
    const req = bot.think === undefined ? null : bot.think(s);
    let waited = 0, aiWaited = 0;
    const go = () => {
      if (run === null || run.id !== id) return;
      if (U.anim.busy() || run.pumping) {
        waited += 50;
        if (waited > 5000) { U.anim.skip(); waited = 0; }       // watchdog
        run.timer = setTimeout(go, 50);
        return;
      }
      if (req === null) { act(bot.choose(run.live), bot); return; }
      if (req.error !== null) { U.aiClient.fail(req.error); return; }
      if (req.answer === null) {
        aiWaited += 50;
        if (aiWaited > 5000) {
          if (req.partial === null) { U.aiClient.fail('no answer within 5 s and no partial result.'); return; }
          U.aiClient.cancel(req);
          act(req.partial, bot);
          return;
        }
        run.timer = setTimeout(go, 50);
        return;
      }
      act(req.answer, bot);
    };
    run.timer = setTimeout(go, run.spectate && U.rate() === 0 ? 0 : think);
  }

  // ---- auto-pass ------------------------------------------------------------------------------
  // Off by default (settings). When it is the human's main phase and legalActions holds nothing but endTurn, a notice says
  // so for 1.2 s and then ends the turn through the same funnel as a click; Cancel (or any action) stops it.
  const AUTOPASS_MS = 1200;
  let apTimer = null;
  function clearAutoPass() {
    clearTimeout(apTimer);
    apTimer = null;
    $('autopass').hidden = true;
  }
  function maybeAutoPass() {
    clearAutoPass();
    if (run === null || run.spectate || !U.settings.get('autoPass')) return;
    const s = run.live;
    if (run.pumping || run.presented.raw !== s || XS.isTerminal(s) || s.phase !== 'main' || s.pending !== null || XS.whoActs(s) !== ME) return;
    if (run.apCancelled === s.actions.length) return;
    const legal = XS.legalActions(s);
    if (legal.length !== 1 || legal[0].type !== 'endTurn') return;
    const at = s.actions.length;
    $('autopass').hidden = false;
    apTimer = setTimeout(() => {
      apTimer = null;
      $('autopass').hidden = true;
      if (run !== null && run.live === s && run.live.actions.length === at) act(legal[0]);
    }, AUTOPASS_MS);
  }
  G.checkAutoPass = () => { if (run === null) return; if (U.settings.get('autoPass')) maybeAutoPass(); else clearAutoPass(); };

  // ---- render ---------------------------------------------------------------------------------
  function render() {
    if (run === null) return;
    const S = snapshot();
    const M = U.targeting.model(S, st);
    const PM = U.prompt.model(S, ps);
    U.board.render(S, M, PM, st, ps);
    const box = $('prompt'), pill = $('prompt-pill');
    if (PM !== null && PM.mine && !ps.hidden) {
      box.replaceChildren(U.prompt.render(S, ps, PM, render, act));
      box.classList.add('open'); pill.hidden = true;
    } else {
      box.replaceChildren(); box.classList.remove('open');
      pill.hidden = !(PM !== null && PM.mine && ps.hidden);
      if (!pill.hidden) pill.textContent = 'Decision pending — ' + PM.purposeLabel + ': show';
    }
    renderDrawer(S);
    run.model = { S, M, PM };
    $('btn-speed').textContent = 'Speed: ' + U.speed();
    U.sfx.scene(U.sfx.sceneFor(S.view));
  }

  // ---- log drawer -----------------------------------------------------------------------------
  function renderDrawer(S) {
    $('drawer').classList.toggle('open', drawerOpen);
    if (!drawerOpen || drawerLen === S.view.log.length) return;
    drawerLen = S.view.log.length;
    const list = $('log-list');
    list.replaceChildren();
    for (let i = S.view.log.length - 1; i >= 0; i--) {
      const e = S.view.log[i];
      const { segs } = U.logText(e, S.view);
      const row = el('li', 'log-row type-' + e.type + (e.via !== null && e.via !== undefined ? ' via' : '') + (e.seat === S.me ? ' mine' : ' theirs'));
      row.appendChild(el('span', 'log-tag', 'R' + e.round + '·T' + e.turn));
      row.appendChild(U.segsToNode(segs, 'span'));
      list.appendChild(row);
    }
  }

  // ---- viewers (public zones) -----------------------------------------------------------------
  function openViewer(spec) {
    const [kind, seatS] = spec.split(':');
    const seat = Number(seatS);
    const v = run.presented.view;
    const P = v.players[seat];
    const box = $('viewer-body');
    box.replaceChildren();
    const row = el('div', 'v-cards');
    if (kind === 'trash') {
      const up = P.trash.filter((x) => typeof x === 'string');
      const down = P.trash.length - up.length;
      $('viewer-title').textContent = `${U.whose(v, seat)} trash — ${U.plural(P.trash.length, 'card')}`;
      box.appendChild(el('p', 'v-note', `${U.plural(up.length, 'card')} face up (tactics, open to both players), listed oldest first. ` +
        `${U.plural(down, 'card')} face down: nobody may look at face-down trash, not even its owner (rule PM p.16 Q7), so only the count is shown.`));
      for (const iid of up) row.appendChild(U.cardEl(U.cardIdOf(v, iid), { iid, cls: 'mini big' }));
      if (up.length === 0) row.appendChild(el('span', 'pa-empty', 'No face-up cards'));
    } else {
      $('viewer-title').textContent = 'Your tactics deck — ' + U.plural(P.tdeck.length, 'card');
      box.appendChild(el('p', 'v-note', 'Only you may look at these (rule PM p.05). Each round you move one into your tactics area.'));
      for (const iid of P.tdeck) row.appendChild(U.cardEl(U.cardIdOf(v, iid), { iid, cls: 'mini big' }));
      if (P.tdeck.length === 0) row.appendChild(el('span', 'pa-empty', 'Empty'));
    }
    box.appendChild(row);
    $('viewer').classList.add('open');
  }

  // ---- bug report -----------------------------------------------------------------------------
  G.bugReport = function (note) {
    if (run === null) throw new Error('bug report: no match');
    const s = run.live;
    return { init: s.init, actions: s.actions, at: s.actions.length, note: note === undefined ? null : note, ua: navigator.userAgent, date: new Date().toISOString() };
  };
  function saveBug(note) {
    const rep = G.bugReport(note);
    const blob = new Blob([JSON.stringify(rep, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `xross-forge-bug-${rep.init.seed}-a${rep.at}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    U.toast(`Saved a bug report (action ${rep.at}). Attach it when you tell the owner.`);
  }

  // ---- end screen -----------------------------------------------------------------------------
  // The numbers come from the viewer's log alone (js/ui/stats.js).
  function endStats(v, spectate) {
    const stats = U.stats.compute(v.log);
    const wrap = el('div', 'end-stats');
    wrap.id = 'end-stats';
    const t = el('table', 'es-table');
    const head = el('tr');
    head.append(el('th', '', ''), el('th', '', spectate ? 'Bot A' : 'You'), el('th', '', spectate ? 'Bot B' : 'Bot'));
    t.appendChild(head);
    for (const [label, a, b] of U.stats.rows(stats, ME)) {
      const r = el('tr');
      r.setAttribute('data-stat', label);
      r.append(el('th', '', label), el('td', '', String(a)), el('td', '', String(b)));
      t.appendChild(r);
    }
    wrap.appendChild(t);
    wrap.appendChild(el('p', 'es-line', U.plural(stats.rounds, 'round') + ' · ' + U.plural(stats.turns, 'turn')));
    return wrap;
  }
  function showEnd() {
    if (endShown) return;
    endShown = true;
    const s = run.live;
    const v = run.presented.view;
    const r = s.result;
    const box = $('end-body');
    box.replaceChildren();
    const win = s.winner === ME;
    const head = s.winner === null ? 'NO WINNER' : (run.spectate ? 'BOT ' + (s.winner === 0 ? 'A' : 'B') + ' WINS' : (win ? 'VICTORY' : 'DEFEAT'));
    box.appendChild(el('h2', 'end-head ' + (s.winner === null ? 'is-draw' : win ? 'is-win' : 'is-lose'), head));
    const reason = { rounds: 'Won the rounds.', tacticsDeckEmpty: 'A tactics deck ran out at a reshuffle.', bothLose: 'Both players met a losing condition at once.', concede: 'A player conceded.' }[r.reason];
    box.appendChild(el('p', 'end-reason', reason));
    const sc = el('div', 'end-score');
    sc.appendChild(el('span', 'es-side', run.spectate ? 'Bot A' : 'You'));
    sc.appendChild(el('span', 'es-n', String(v.wins[0])));
    sc.appendChild(el('span', 'es-dash', '–'));
    sc.appendChild(el('span', 'es-n', String(v.wins[1])));
    sc.appendChild(el('span', 'es-side', run.spectate ? 'Bot B' : 'Bot'));
    box.appendChild(sc);
    box.appendChild(el('p', 'end-mode', (s.mode === 'quick' ? 'Quick match' : 'Full match (best of 3)') + ' · ' + run.opts.decks.join(' vs ')));
    box.appendChild(endStats(XS.view(s, ME), run.spectate));
    U.save.clear();
    $('endscreen').classList.add('open');
    $('endscreen').dataset.result = s.winner === null ? 'none' : String(s.winner);
  }

  // ---- input (delegated, once) ------------------------------------------------------------------
  function onClick(e) {
    if (run === null) return;
    const t = e.target;
    if (t.closest('#fx-lock')) return;
    const M = run.model.M, PM = run.model.PM, S = run.model.S;
    const viewer = t.closest('[data-viewer]');
    if (viewer !== null) { openViewer(viewer.getAttribute('data-viewer')); return; }
    if (t.closest('#confirm') && M.confirm !== null) { act(M.confirm.action); return; }
    if (t.closest('#cancel')) { st = U.targeting.fresh(); render(); return; }
    if (t.closest('#endturn')) { if (M.endTurn !== null && PM === null) act(M.endTurn.action); return; }
    if (t.closest('#prompt-pill')) { ps.hidden = false; render(); return; }
    const play = t.closest('[data-play]');
    if (play !== null && PM === null) {
      if (U.targeting.click(S, st, M, 'card', play.getAttribute('data-play'))) render();
      return;
    }
    const lead = t.closest('#board [data-leader]');
    if (lead !== null && !t.closest('.eq-chip')) {
      const iid = lead.getAttribute('data-leader');
      const changed = PM !== null ? U.prompt.click(S, ps, PM, 'leader', iid) : U.targeting.click(S, st, M, 'leader', iid);
      if (changed) render();
    }
  }
  function onKey(e) {
    if (run === null) return;
    if (e.key === 'Escape') {
      if ($('viewer').classList.contains('open')) { $('viewer').classList.remove('open'); U.sfx.cue('ui-cancel'); return; }
      if ($('confirm-exit').classList.contains('open')) { $('confirm-exit').classList.remove('open'); U.sfx.cue('ui-cancel'); return; }
      if (run.model.PM !== null && run.model.PM.mine && !ps.hidden) { ps.hidden = true; render(); U.sfx.cue('ui-cancel'); return; }
      if (st.iid !== null) { st = U.targeting.fresh(); render(); U.sfx.cue('ui-cancel'); }
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"][tabindex]') && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      e.target.click();
    }
  }
  // Hovering a candidate target shows the engine's previewAttack in the hint line (no repaint).
  function onOver(e) {
    if (run === null || run.model === undefined) return;
    const lead = e.target.closest ? e.target.closest('#board [data-leader]') : null;
    const h = $('hint');
    const { M, PM } = run.model;
    const previews = PM !== null ? PM.previews : M.previews;
    if (lead !== null) {
      const pv = previews.get(lead.getAttribute('data-leader'));
      if (pv !== undefined) { h.textContent = pv.text + '  ·  ' + U.targeting.breakdown(run.model.S, pv.detail); h.classList.add('is-preview'); return; }
    }
    const hov = e.target.closest ? e.target.closest('[data-leader-hover]') : null;
    document.querySelectorAll('.is-hovered').forEach((n) => n.classList.remove('is-hovered'));
    if (hov !== null) {
      const n = document.querySelector('#board [data-leader="' + hov.getAttribute('data-leader-hover') + '"]');
      if (n !== null) n.classList.add('is-hovered');
    }
    h.classList.remove('is-preview');
    h.textContent = PM !== null ? PM.hint : M.hint;
  }

  G.init = function () {
    const game = $('game');
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mouseover', onOver);
    $('btn-log').addEventListener('click', () => { drawerOpen = !drawerOpen; drawerLen = -1; render(); });
    $('log-close').addEventListener('click', () => { drawerOpen = false; render(); });
    $('btn-flag').addEventListener('click', () => { if (run !== null) saveBug('flagged during play'); });
    $('btn-speed').addEventListener('click', () => {
      const order = ['full', 'quick', 'instant'];
      U.setSpeed(order[(order.indexOf(U.speed()) + 1) % order.length]);
      render();
    });
    $('btn-exit').addEventListener('click', () => $('confirm-exit').classList.add('open'));
    $('autopass-cancel').addEventListener('click', () => {
      if (run !== null) run.apCancelled = run.live.actions.length;
      clearAutoPass();
    });
    $('exit-keep').addEventListener('click', () => $('confirm-exit').classList.remove('open'));
    $('exit-quit').addEventListener('click', () => { $('confirm-exit').classList.remove('open'); G.stop(); });
    $('exit-concede').addEventListener('click', () => {
      $('confirm-exit').classList.remove('open');
      if (run !== null && !XS.isTerminal(run.live) && !run.spectate) {
        U.anim.skip();
        act({ type: 'concede', seat: ME });
      }
    });
    $('viewer-close').addEventListener('click', () => $('viewer').classList.remove('open'));
    $('viewer').addEventListener('click', (e) => { if (e.target === $('viewer')) $('viewer').classList.remove('open'); });
    $('end-rematch').addEventListener('click', () => {
      const o = run.opts;
      G.start({ decks: o.decks, mode: o.mode, spectate: o.spectate, tier: o.tier });
    });
    $('end-title').addEventListener('click', () => G.stop());
    $('end-bug').addEventListener('click', () => saveBug('end of match'));
    $('end-look').addEventListener('click', () => { $('endscreen').classList.remove('open'); $('end-pill').hidden = false; });
    $('end-pill').addEventListener('click', () => { $('endscreen').classList.add('open'); $('end-pill').hidden = true; });
    void game;
  };
})();
