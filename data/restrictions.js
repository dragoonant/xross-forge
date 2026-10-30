// Limited / BAN list for sanctioned play (docs/rules.md §3 item 4 and the "Edition and leak list" at the end).
// Source: the official Limited/BAN page "Limited・BANカードについて（2026年7月13日更新）" and the restrictions
// endpoint of the card API (docs/sources/api/restrictions.json: one row, card_family_id 90, max_copies 0),
// current on 2026-10-30; official notice news 202. No card is Limited (max 2) today.
// Keyed by card family id (the API's family_id: every printing of a name shares it). max 0 = BAN.
// Used by tools/validate-data.mjs only (like data/text-en.js, pages do not load it). The starter decks
// (format 'starter') are exempt by PLAN D15 ("play as sold"); every other deck must respect this list.
(function () {
  const XS = (globalThis.XS = globalThis.XS || {});
  XS.RESTRICTIONS = {
    asOf: '2026-07-13',
    checked: '2026-10-30',
    source: 'https://xross-stars.com (Limited/BAN page, updated 2026-07-13); API cards/restrictions',
    families: {
      // エナジーチャージャー: BP01-090, BP02-073, ST01-020, ST02-020 (the PP-and-draw tactic in both starters)
      90: { max: 0, name: 'エナジーチャージャー' },
    },
  };
})();
