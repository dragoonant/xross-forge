// js/ui/bot-ai.js: the page's side of the AI (M4). The AI runs in a Web Worker (js/ai/worker.js); this file owns the worker, the
// request/answer plumbing and the error banner. There is NO fallback: if the worker cannot start, or a request fails, the page shows
// the error and the opponent does not move. (A sibling project shipped "AI never loaded" for days behind a silent random bot.)
//
// The worker URL below carries a ?v= content hash that tools/stamp-assets.mjs rewrites (the worker's own imports carry theirs), so a
// change to the worker or anything it imports is a URL the browser has never cached.
//   U.aiClient.start()                       -> Promise that resolves when the worker has loaded every script (rejects, and shows the banner, if not)
//   U.aiClient.status()                      -> 'idle' | 'loading' | 'ready' | 'failed'
//   U.makeAiBot({ seat, tier, seed })        -> { seat, name, think(rawState) -> request }
//   request = { answer, partial, error }     answer is null until the worker answers; partial is its best so far (the watchdog uses it)
(function () {
  'use strict';
  const XS = globalThis.XS;
  const U = XS.ui;
  const Cl = (U.aiClient = {});

  const READY_TIMEOUT_MS = 10000;
  let worker = null;
  let status = 'idle';
  let failure = null;
  let readyP = null;
  let nextId = 1;
  const waiting = new Map();           // request id -> request
  const listeners = [];

  Cl.status = () => status;
  Cl.error = () => failure;
  Cl.onChange = (fn) => { listeners.push(fn); };
  const changed = () => { for (const fn of listeners) fn(status, failure); };

  // Show a failure where the player cannot miss it, and fail every request that is waiting.
  Cl.fail = function (message) {
    status = 'failed';
    failure = message;
    const box = U.$('ai-error');
    box.textContent = 'The AI opponent stopped: ' + message + ' The match cannot continue; reload the page. (There is no random-bot fallback.)';
    box.hidden = false;
    for (const req of waiting.values()) req.error = message;
    waiting.clear();
    if (typeof console !== 'undefined') console.error('[ai] ' + message);
    changed();
  };

  Cl.start = function () {
    if (readyP !== null) return readyP;
    if (typeof Worker !== 'function') { readyP = Promise.reject(new Error('this browser has no Web Worker')); Cl.fail('this browser has no Web Worker.'); return readyP; }
    status = 'loading';
    changed();
    readyP = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { const m = 'the worker did not report ready within ' + READY_TIMEOUT_MS / 1000 + ' s.'; Cl.fail(m); reject(new Error(m)); }, READY_TIMEOUT_MS);
      try { worker = new Worker('js/ai/worker.js?v=8a15a6d568'); } catch (e) { clearTimeout(timer); const m = 'cannot create the worker (' + e.message + ').'; Cl.fail(m); reject(new Error(m)); return; }
      worker.onerror = (ev) => {
        clearTimeout(timer);
        const m = 'the worker failed (' + (ev.message || 'script error, probably a script that did not load') + (ev.filename ? ' in ' + ev.filename : '') + ').';
        if (ev.preventDefault) ev.preventDefault();
        Cl.fail(m);
        reject(new Error(m));
      };
      worker.onmessage = (ev) => {
        const m = ev.data;
        if (m.type === 'ready') { clearTimeout(timer); status = 'ready'; changed(); resolve(); return; }
        const req = waiting.get(m.id);
        if (req === undefined) return;                 // answered after the page gave up on it
        if (m.type === 'partial') req.partial = m.action;
        else if (m.type === 'result') { req.answer = m.action; req.info = m.info; waiting.delete(m.id); }
        else if (m.type === 'error') { waiting.delete(m.id); Cl.fail('the AI threw: ' + m.message); }
      };
    });
    readyP.catch(() => { /* already reported by Cl.fail; keep the rejection from surfacing twice */ });
    return readyP;
  };

  // Ask for a decision. The view is made here, from the raw state the page holds: the worker only ever sees what the seat sees.
  Cl.decide = function (view, tier, seed) {
    const req = { id: nextId++, answer: null, partial: null, error: null, info: null };
    Cl.start().then(() => {
      if (status !== 'ready') return;
      waiting.set(req.id, req);
      worker.postMessage({ type: 'decide', id: req.id, view, tier, seed });
    }, () => { req.error = failure; });
    return req;
  };
  Cl.cancel = function (req) { waiting.delete(req.id); };

  U.makeAiBot = function (opts) {
    return {
      seat: opts.seat,
      name: 'AI ' + opts.tier,
      tier: opts.tier,
      think(s) {
        if (XS.whoActs(s) !== opts.seat) throw new Error('ai bot: asked to act but it is seat ' + XS.whoActs(s) + "'s move");
        return Cl.decide(XS.view(s, opts.seat), opts.tier, opts.seed);
      },
    };
  };
})();
