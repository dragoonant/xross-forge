// M1 data tests: the shipped card data is what the deck rules (docs/rules.md §3, PM p.13) and
// PLAN D16 say it is. The failure rules themselves are proved by `node tools/validate-data.mjs --selftest`.
(function () {
  const XS = globalThis.XS;
  const { test, eq, ok } = XS.T;
  const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
  const decks = () => Object.values(XS.DECKS);
  const competitive = () => decks().filter((d) => d.format === 'competitive');
  const deckCards = (d) => [...d.leaders, ...d.main.map((x) => x[0]), ...d.tactics];
  const COMP_IDS = ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'A01', 'A02', 'A03'];

  test('data: the two starters and the ten competitive decks are registered (PLAN D15, D19)', () => {
    eq(Object.keys(XS.DECKS), ['ST01', 'ST02', ...COMP_IDS], 'deck ids');
    eq(Object.keys(XS.CARDS).length, 142, '50 starter-deck numbers + 92 numbers only the competitive decks use');
    ok(XS.CARD_SOURCE.fetched && XS.CARD_SOURCE.api, 'CARD_SOURCE');
    eq(decks().filter((d) => d.format === 'starter').map((d) => d.id), ['ST01', 'ST02'], 'starters play as sold (PLAN D15)');
    eq(competitive().map((d) => d.id), COMP_IDS, 'competitive decks');
  });

  test('competitive decks (PLAN D19): English and Japanese name, tier, and a source with url, event and fetch date', () => {
    for (const d of competitive()) {
      eq(d.tier, 'competitive', d.id + ' tier');
      ok(d.nameEn && !JAPANESE.test(d.nameEn), d.id + ' English name');
      ok(d.nameJa && d.name === d.nameJa && JAPANESE.test(d.nameJa + 'ア') , d.id + ' Japanese name (name = nameJa, as the starters keep the Japanese in name)');
      ok(/^https:\/\//.test(d.source.url), d.id + ' source url');
      ok(d.source.event && /^\d{4}-\d{2}-\d{2}$/.test(d.source.fetched), d.id + ' source event and fetch date');
    }
    for (const d of decks().filter((x) => x.format === 'starter')) eq(d.tier, undefined, d.id + ' is not tiered');
  });

  test('competitive decks: 100 distinct card numbers, 92 of them not in a starter; by type 18 leaders, 33 attack, 29 memoria, 12 tactics', () => {
    const all = new Set(), starter = new Set();
    for (const d of competitive()) for (const n of deckCards(d)) all.add(n);
    for (const d of decks().filter((x) => x.format === 'starter')) for (const n of [...deckCards(d), d.ppTicket, d.ppCard]) starter.add(n);
    eq(all.size, 100, 'union');
    const fresh = [...all].filter((n) => !starter.has(n));
    eq(fresh.length, 92, 'new numbers');
    const by = {};
    for (const n of fresh) by[XS.CARDS[n].type] = (by[XS.CARDS[n].type] || 0) + 1;
    eq(by, { leader: 18, attack: 33, memoria: 29, tactics: 12 }, 'new cards by type');
    // Every emitted card is used by some deck (nothing stray), and the shared PP cards are the starter's.
    const used = new Set(decks().flatMap((d) => [...deckCards(d), d.ppTicket, d.ppCard]));
    eq(Object.keys(XS.CARDS).filter((n) => !used.has(n)), [], 'unused cards');
    for (const d of competitive()) { eq(d.ppTicket, 'ST01-024', d.id + ' PP Ticket'); eq(d.ppCard, 'ST01-025', d.id + ' PP card'); }
  });

  test('competitive decks: 8 ACE each, leader colours as researched, no banned family (data/restrictions.js: family 90, エナジーチャージャー)', () => {
    for (const d of competitive()) {
      eq(d.main.reduce((s, [n, q]) => s + (XS.CARDS[n].ace ? q : 0), 0), 8, d.id + ' ACE cards');
      for (const n of deckCards(d)) ok(XS.CARDS[n].family !== 90, d.id + ' contains the banned Energy Charger ' + n);
    }
    // The starters are exempt (PLAN D15): they still carry it.
    ok(XS.DECKS.ST01.tactics.includes('ST01-020') && XS.DECKS.ST02.tactics.includes('ST02-020'), 'starters play as sold');
    const colours = (id) => XS.DECKS[id].leaders.map((n) => XS.CARDS[n].color).sort().join(',');
    eq(colours('C01'), 'blue,green,red,yellow', 'C01 four colours');
    eq(colours('C02'), 'green,red,red,red', 'C02 red-3');
    eq(colours('C04'), 'blue,green,green,green', 'C04 green-3');
    eq(colours('A02'), 'blue,blue,blue,green', 'A02 blue-3');
  });

  test('build rules: exact leader name plus family, and colour-count rules, are satisfied by every deck', () => {
    let nameRules = 0, colourRules = 0;
    for (const d of decks()) for (const [n] of d.main) {
      const b = XS.CARDS[n].build;
      if (!b) continue;
      if (b.type === 'require_leader') {
        nameRules++;
        ok(d.leaders.some((l) => XS.CARDS[l].family === b.family && XS.CARDS[l].name === b.leader), `${d.id} ${n} needs leader ${b.leader}`);
      } else {
        colourRules++;
        eq(b.type, 'require_card_color', n);
        ok(d.leaders.filter((l) => XS.CARDS[l].color === b.color).length >= b.count, `${d.id} ${n} needs ${b.count} ${b.color} leaders`);
      }
    }
    ok(nameRules > 0 && colourRules > 0, 'both kinds are exercised');
    eq(JSON.stringify(XS.CARDS['BP01-018'].build), JSON.stringify({ color: 'red', count: 3, type: 'require_card_color' }), 'BP01-018 Elegant Domination: 3+ red leaders');
    eq(JSON.stringify(XS.CARDS['BP01-045'].build), JSON.stringify({ color: 'green', count: 3, type: 'require_card_color' }), 'BP01-045 Crazy Burst: 3+ green leaders');
    eq(JSON.stringify(XS.CARDS['BP01-023'].build), JSON.stringify({ family: 3, leader: '橘ひなの', type: 'require_leader' }), 'BP01-023 needs the leader named 橘ひなの');
    eq(XS.CARDS['BP01-043'].build.leader, 'Ras', 'BP01-043');
  });

  test('equipment (BP03-080, ST01-023, BP02-078, BP03-079): stat fields are exactly what the text says', () => {
    eq(XS.CARDS['ST01-023'].equip, { hp: 30 }, 'Light Shield: HP +30');
    eq(XS.CARDS['ST02-023'].equip, { hp: 30 }, 'Light Shield (ST02)');
    eq(XS.CARDS['BP03-080'].equip, { hpBase: 140, hpBaseAwakened: 170 }, 'Cyber Armor: base HP 140 / 170 awakened');
    eq(XS.CARDS['BP02-078'].equip, undefined, 'Thief Kit grants an ability, no stat');
    eq(XS.CARDS['BP03-079'].equip, undefined, 'Target Flag restricts targeting, no stat');
    for (const [n, c] of Object.entries(XS.CARDS)) {
      if (c.equip !== undefined) eq(c.tactics, 'equipment', n + ' equip only on equipment');
      if (c.type === 'tactics' && c.tactics === 'equipment') ok(c.equip !== undefined || ['BP02-078', 'BP03-079'].includes(n), n + ' equipment without equip or an ability');
    }
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
      ok(Array.isArray(XS.TAGS[n]), n + ' has a tag entry (an empty list is a free agent)');
    }
    eq(XS.TAGS['ST01-003'], ['VSPO!'], 'ST01 leaders are VSPO!');
    eq(XS.TAGS['ST02-001'], ['CR'], 'ST02 leaders are CR');
  });

  test('tags of the competitive leaders: agency as printed on the shop page, free agents have an explicit []', () => {
    const want = {
      'BP01-003': ['VSPO!'], 'BP01-013': ['VSPO!'], 'BP01-014': ['CR'], 'BP01-016': [], 'BP02-004': ['VSPO!'], 'BP02-010': ['VSPO!'],
      'BP02-014': ['CR'], 'BP03-003': ['Neo-Porte'], 'BP03-004': ['CR'], 'BP03-005': ['REJECT'], 'BP03-006': ['VSPO!'], 'BP03-014': [],
      'BP04-001': ['CR'], 'BP04-002': ['Neo-Porte'], 'BP04-006': ['VSPO!'], 'BP04-008': ['VSPO!'], 'BP04-012': ['REJECT'], 'BP04-013': ['REJECT'],
    };
    for (const [n, tags] of Object.entries(want)) eq(XS.TAGS[n], tags, n);
    const leaders = new Set(competitive().flatMap((d) => d.leaders));
    for (const n of leaders) ok(Array.isArray(XS.TAGS[n]), n + ' tag entry');
    eq(Object.keys(XS.TAGS).sort(), Object.keys(XS.CARDS).filter((n) => XS.CARDS[n].type === 'leader').sort(), 'a tag entry for every leader and nothing else');
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
    let kept = 0;
    for (const [n, c] of Object.entries(XS.CARDS)) {
      ok(c.text && c.text.trim(), n + ' text');
      ok(c.nameEn && c.nameEn.trim(), n + ' nameEn');
      ok(!JAPANESE.test(c.text), n + ' Japanese in the English text');
      // Only a leader may keep its Japanese printed name in nameEn (no sourced romanisation); tools/validate-data.mjs
      // checks the explicit list XS.NAME_KEPT_JA in data/text-en.js, which pages do not load.
      if (JAPANESE.test(c.nameEn)) { eq(c.type, 'leader', n + ' only leaders keep a Japanese nameEn'); eq(c.nameEn, c.name, n + ' nameEn is the printed name'); kept++; }
      ok(JAPANESE.test(c.name) || /^[A-Za-z0-9]/.test(c.name), n + ' keeps its own name');
    }
    eq(kept, 14, 'leaders whose nameEn stays Japanese (XS.NAME_KEPT_JA)');
    eq(XS.CARDS['BP01-003'].nameEn, 'Hinano Tachibana', 'BP01-003');
    eq(XS.CARDS['BP04-008'].nameEn, 'Kuromu Yano', 'BP04-008');
  });

  test('text: timing tags are the bracketed keywords, and every leader has exactly one [On Awaken]', () => {
    // [Overkill N] and [Echo] are the keyword tags added for the competitive decks (header of data/text-en.js).
    const ok_tags = /^(?:On Play|Attack|After Attack|Attack Boost|On Awaken|Round|Echo|Overkill \d+)$/;
    for (const [n, c] of Object.entries(XS.CARDS)) {
      for (const m of c.text.matchAll(/\[([^\]]+)\]/g)) ok(ok_tags.test(m[1]), n + ' tag ' + m[1]);
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
