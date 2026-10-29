// M1 data tests: the shipped card data is what the deck rules (docs/rules.md §3, PM p.13) and
// PLAN D16 say it is. The failure rules themselves are proved by `node tools/validate-data.mjs --selftest`.
(function () {
  const XS = globalThis.XS;
  const { test, eq, ok } = XS.T;
  const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
  const decks = () => Object.values(XS.DECKS);

  test('data: ST01 and ST02 are registered decks', () => {
    eq(Object.keys(XS.DECKS), ['ST01', 'ST02'], 'deck ids');
    eq(Object.keys(XS.CARDS).length, 50, '48 deck cards + 2 PP cards');
    ok(XS.CARD_SOURCE.fetched && XS.CARD_SOURCE.api, 'CARD_SOURCE');
  });

  test('deck rules (PM p.13): 4 leaders, 50 main cards, 5 tactics, every id a known card', () => {
    for (const d of decks()) {
      eq(d.leaders.length, 4, d.id + ' leaders');
      eq(d.main.reduce((s, [, q]) => s + q, 0), 50, d.id + ' main');
      eq(d.tactics.length, 5, d.id + ' tactics');
      for (const n of [...d.leaders, ...d.main.map((x) => x[0]), ...d.tactics, d.ppTicket, d.ppCard]) ok(XS.CARDS[n], d.id + ' unknown ' + n);
    }
  });

  test('deck rules (PM p.13): at most 4 copies per name and 8 ACE cards; colours match a leader', () => {
    for (const d of decks()) {
      const byName = {};
      let aces = 0;
      const lcol = new Set(d.leaders.map((n) => XS.CARDS[n].color));
      for (const [n, q] of d.main) {
        const c = XS.CARDS[n];
        byName[c.name] = (byName[c.name] || 0) + q;
        if (c.ace) aces += q;
        ok(lcol.has(c.color), `${d.id} ${n} colour ${c.color} has no leader`);
      }
      for (const q of Object.values(byName)) ok(q <= 4, d.id + ' copy limit');
      ok(aces <= 8, d.id + ' ACE limit');
    }
  });

  test('leaders: stats, awakened stats and a tag each (PM p.02)', () => {
    for (const d of decks()) for (const n of d.leaders) {
      const c = XS.CARDS[n];
      eq(c.type, 'leader', n);
      eq(c.atk, 30, n + ' atk');
      ok([100, 110].includes(c.hp), n + ' hp');
      eq(c.awakenAtk, 40, n + ' awakened atk');
      eq(c.awakenHp, c.hp + 30, n + ' awakened hp');
      ok(XS.TAGS[n] && XS.TAGS[n].length, n + ' tag');
    }
    eq(XS.TAGS['ST01-003'], ['VSPO!'], 'ST01 leaders are VSPO!');
    eq(XS.TAGS['ST02-001'], ['CR'], 'ST02 leaders are CR');
  });

  test('ST01-005 Crossfire and ST02-009: the tag the text checks is the tag the leaders carry', () => {
    ok(XS.CARDS['ST01-005'].text.includes('"VSPO!"'));
    ok(XS.CARDS['ST02-009'].text.includes('"CR"'));
    for (const n of XS.DECKS.ST01.leaders) ok(XS.TAGS[n].includes('VSPO!'), n);
    for (const n of XS.DECKS.ST02.leaders) ok(XS.TAGS[n].includes('CR'), n);
  });

  test('cards: costs on attack/memoria/tactics, none on leaders; tactics carry a subtype', () => {
    for (const [n, c] of Object.entries(XS.CARDS)) {
      if (['attack', 'memoria', 'tactics'].includes(c.type)) ok(Number.isInteger(c.cost) && c.cost >= 0, n + ' cost');
      if (c.type === 'leader') ok(!('cost' in c), n + ' has no cost');
      if (c.type === 'tactics') ok(['consumption', 'equipment'].includes(c.tactics), n + ' tactics type');
    }
    eq(XS.CARDS['ST01-023'].tactics, 'equipment', 'ST01-023 Light Shield');
    eq(XS.CARDS['ST01-024'].cost, 0, 'ST01-024 PP Ticket');
  });

  test('text: every card has English text and name, with no Japanese characters (PLAN D16)', () => {
    for (const [n, c] of Object.entries(XS.CARDS)) {
      ok(c.text && c.text.trim(), n + ' text');
      ok(c.nameEn && c.nameEn.trim(), n + ' nameEn');
      ok(!JAPANESE.test(c.text) && !JAPANESE.test(c.nameEn), n + ' Japanese in English fields');
      ok(JAPANESE.test(c.name) || /^[A-Za-z]+$/.test(c.name), n + ' keeps its own name');
    }
  });

  test('text: timing tags are the bracketed keywords, and every leader has exactly one [On Awaken]', () => {
    const ok_tags = new Set(['On Play', 'Attack', 'After Attack', 'Attack Boost', 'On Awaken', 'Round']);
    for (const [n, c] of Object.entries(XS.CARDS)) {
      for (const m of c.text.matchAll(/\[([^\]]+)\]/g)) ok(ok_tags.has(m[1]), n + ' tag ' + m[1]);
      if (c.type === 'leader') eq((c.text.match(/\[On Awaken\]/g) || []).length, 1, n);
      else ok(!c.text.includes('[On Awaken]'), n + ' only leaders awaken');
    }
  });

  test('defects and manifests: declared, defects empty and unused by decks', () => {
    eq(XS.DEFECTS, {}, 'no defects today');
    eq(typeof XS.ART, 'object'); eq(typeof XS.SOUNDS, 'object');
    for (const d of decks()) for (const [n] of d.main) ok(!XS.DEFECTS[n], n);
  });
})();
