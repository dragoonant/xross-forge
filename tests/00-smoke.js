// M0 smoke tests: the scaffold runs green on an empty game. Names say what they assert.
(function () {
  const XS = globalThis.XS;
  const { test, eq, ok, throws } = XS.T;

  test('namespace: XS exists on globalThis and has the Illegal error class', () => {
    ok(globalThis.XS === XS, 'globalThis.XS');
    ok(typeof XS.Illegal === 'function', 'XS.Illegal');
    const e = new XS.Illegal('nope');
    ok(e instanceof Error && e.name === 'Illegal' && e.message === 'nope', 'Illegal is a named Error');
    throws(() => { throw new XS.Illegal('x'); }, 'throws Illegal', XS.Illegal);
  });

  test('namespace: XS.clone deep-copies, so apply can stay pure', () => {
    const a = { n: [1, { k: 2 }] };
    const b = XS.clone(a);
    b.n[1].k = 3;
    eq(a.n[1].k, 2, 'original untouched');
  });

  test('rng: the same seed gives the same sequence', () => {
    const run = (seed) => { const s = { rng: XS.hashSeed(seed) }; return Array.from({ length: 8 }, () => XS.rngNext(s)); };
    eq(run('xross'), run('xross'), 'same seed');
    ok(JSON.stringify(run('xross')) !== JSON.stringify(run('forge')), 'different seeds differ');
    for (const v of run('xross')) ok(v >= 0 && v < 1, 'in [0, 1)');
  });

  test('rng: hashSeed is a stable 32-bit integer (FNV-1a)', () => {
    eq(XS.hashSeed(''), 0x811c9dc5 | 0, 'empty string is the FNV offset basis');
    eq(XS.hashSeed('a'), 0xe40c292c | 0, 'FNV-1a("a")');
    ok(Number.isInteger(XS.hashSeed('anything')) && XS.hashSeed('anything') === (XS.hashSeed('anything') | 0), 'int32');
  });

  test('rng: rngInt stays in [0, n)', () => {
    const s = { rng: 7 };
    for (let i = 0; i < 200; i++) { const v = XS.rngInt(s, 5); ok(Number.isInteger(v) && v >= 0 && v < 5, 'rngInt ' + v); }
  });

  test('rng: shuffleInPlace is deterministic for a seed and keeps every element', () => {
    const deal = (seed) => XS.shuffleInPlace({ rng: XS.hashSeed(seed) }, Array.from({ length: 20 }, (_, i) => i));
    eq(deal('s'), deal('s'), 'same seed, same order');
    ok(JSON.stringify(deal('s')) !== JSON.stringify(deal('t')), 'different seed, different order');
    eq([...deal('s')].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i), 'a permutation');
  });

  test('rng: state round-trips through JSON and continues the same stream', () => {
    const s = { rng: XS.hashSeed('round-trip'), other: 'x' };
    for (let i = 0; i < 5; i++) XS.rngNext(s);
    const copy = JSON.parse(JSON.stringify(s));
    eq(copy.rng, s.rng, 'rng field survives JSON');
    ok(Number.isInteger(copy.rng), 'still an integer');
    const a = Array.from({ length: 6 }, () => XS.rngNext(s));
    const b = Array.from({ length: 6 }, () => XS.rngNext(copy));
    eq(b, a, 'the restored state continues the same stream');
    const t1 = { rng: 5 }, t2 = JSON.parse(JSON.stringify(t1));
    eq(XS.shuffleInPlace(t1, [1, 2, 3, 4, 5, 6]), XS.shuffleInPlace(t2, [1, 2, 3, 4, 5, 6]), 'shuffle after round-trip');
  });

  test('harness: eq / ok / throws report failures', () => {
    throws(() => XS.T.eq(1, 2), 'eq must throw on a mismatch');
    throws(() => XS.T.ok(false), 'ok must throw on false');
    throws(() => XS.T.throws(() => {}), 'throws must throw when nothing throws');
  });
})();
