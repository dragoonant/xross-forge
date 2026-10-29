// Test harness: a tiny runner plus action helpers, ported from lorecannae's tests/harness.js
// (9c8016d). Tests build an exact position, act only through XS.apply, and assert the SIDE
// EFFECT, never the log text. The position builders (T.game, T.find, T.zone in lorecannae) are
// NOT ported: they bake in Lorcana's state shape (ink, lore, play zone) and arrive with the
// Xross Stars state in M2.
(function () {
  const XS = globalThis.XS;
  const T = (XS.T = { tests: [] });
  T.test = (name, fn) => T.tests.push({ name, fn });
  T.eq = (a, b, msg) => {
    const sa = JSON.stringify(a), sb = JSON.stringify(b);
    if (sa !== sb) throw new Error(`${msg || 'eq'}: expected ${sb}, got ${sa}`);
  };
  T.ok = (v, msg) => { if (!v) throw new Error(msg || 'expected truthy'); };
  // T.throws(fn, msg?, Cls?): fn must throw; when Cls is given the error must be an instance.
  T.throws = (fn, msg, Cls) => {
    let err = null;
    try { fn(); } catch (e) { err = e; }
    if (!err) throw new Error(msg || 'expected a throw');
    if (Cls && !(err instanceof Cls)) throw new Error(`${msg || 'throws'}: expected ${Cls.name}, got ${err && err.name}: ${err && err.message}`);
  };

  // ---- action helpers (need the M2 engine: XS.legalActions / XS.apply) -------------------
  const need = (k) => { if (typeof XS[k] !== 'function') throw new Error(`XS.${k} is not defined yet (the engine lands in M2)`); };
  const matches = (l, m) => Object.entries(m).every(([k, v]) => l[k] === v);
  // Apply the first legal action matching `m` (partial object). On failure, list what was legal.
  T.act = (s, m) => {
    need('legalActions'); need('apply');
    const legal = XS.legalActions(s);
    const a = legal.find((l) => matches(l, m));
    if (!a) throw new Error(`T.act: no legal action matching ${JSON.stringify(m)}; legal: ${JSON.stringify(legal).slice(0, 600)}; ask: ${JSON.stringify(s.ask)}`);
    return XS.apply(s, a);
  };
  T.legal = (s, m) => { need('legalActions'); return XS.legalActions(s).some((l) => matches(l, m)); };
  // Answer the pending decision (s.ask). The answer action's shape is re-confirmed in M2.
  T.answer = (s, value) => {
    need('apply');
    if (!s.ask) throw new Error(`T.answer: no pending ask (wanted to answer ${JSON.stringify(value)})`);
    return XS.apply(s, { type: 'answer', value });
  };

  T.runAll = function (filter, quiet) {
    let pass = 0, fail = 0;
    const fails = [];
    for (const t of T.tests) {
      if (filter && !t.name.includes(filter)) continue;
      try { t.fn(); pass++; } catch (e) { fail++; fails.push(`FAIL ${t.name}: ${e.message}`); }
    }
    return { pass, fail, fails };
  };
})();
