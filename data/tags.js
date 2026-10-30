// Leader affiliation tags (the word printed under a leader's name). The card API has no tag field
// (docs/card-text-grammar.md §7.1, PLAN D13), so this is a hand table.
// source: the product page https://xross-stars.com/product/st01-02 (ST01 = four VSPO! talents,
// ST02 = four Crazy Raccoon members) and the card faces, which show the tag under the name
// ("VSPO!" under 花芽すみれ, "CR" under Mondo / Selly: PM p.02, p.08, p.10; ruling R-031).
// Only leaders have an entry. Every emitted leader must have one (tools/validate-data.mjs).
//
// Competitive-deck leaders (PLAN D19, docs/competitive-decks.md): the agency/team is the 所属 (affiliation)
// field of the shop card page, recorded per leader below with the page it came from (yuyu-tei card pages;
// the same table is in docs/competitive-decks.md "Leaders:" lines). A free agent (no printed affiliation,
// shown as "-" on the shop page) gets an EMPTY list [] — that is a real value ("this leader has no tag"),
// not a missing entry; the validator requires the key to be present and the value to be an array.
(function () {
  const XS = (globalThis.XS = globalThis.XS || {});
  XS.TAGS = {
    'ST01-001': ['VSPO!'],
    'ST01-002': ['VSPO!'],
    'ST01-003': ['VSPO!'],
    'ST01-004': ['VSPO!'],
    'ST02-001': ['CR'],
    'ST02-002': ['CR'],
    'ST02-003': ['CR'],
    'ST02-004': ['CR'],
    'BP01-003': ['VSPO!'], // 橘ひなの: VSPO!; https://yuyu-tei.jp/sell/xs/card/xsbp01/10108
    'BP01-013': ['VSPO!'], // 空澄セナ: VSPO!; https://yuyu-tei.jp/sell/xs/card/xsbp01/10125
    'BP01-014': ['CR'], // ありさか: CR; https://yuyu-tei.jp/sell/xs/card/xsbp01/10131
    'BP01-016': [], // nqrse: free agent (no affiliation printed); https://yuyu-tei.jp/sell/xs/card/xsbp01/10130
    'BP02-004': ['VSPO!'], // 蝶屋はなび: VSPO!; https://yuyu-tei.jp/sell/xs/card/xsbp02/10086
    'BP02-010': ['VSPO!'], // 神成きゅぴ: VSPO!; https://yuyu-tei.jp/sell/xs/card/xsbp02/10095
    'BP02-014': ['CR'], // どぐら: CR; https://yuyu-tei.jp/sell/xs/card/xsbp02/10101
    'BP03-003': ['Neo-Porte'], // 緋月ゆい: Neo-Porte; https://yuyu-tei.jp/sell/xs/card/xsbp03/10084
    'BP03-004': ['CR'], // rion: CR; https://yuyu-tei.jp/sell/xs/card/xsbp03/10087
    'BP03-005': ['REJECT'], // ズズ: REJECT; https://yuyu-tei.jp/sell/xs/card/xsbp03/10088
    'BP03-006': ['VSPO!'], // 紡木こかげ: VSPO!; https://yuyu-tei.jp/sell/xs/card/xsbp03/10089
    'BP03-014': [], // けんき: free agent (no affiliation printed); https://yuyu-tei.jp/sell/xs/card/xsbp03/10101
    'BP04-001': ['CR'], // うぉっか: CR; https://yuyu-tei.jp/sell/xs/card/xsbp04/10082
    'BP04-002': ['Neo-Porte'], // 昏昏アリア: Neo-Porte; https://yuyu-tei.jp/sell/xs/card/xsbp04/10083
    'BP04-006': ['VSPO!'], // 白波らむね: VSPO!; https://yuyu-tei.jp/sell/xs/card/xsbp04/10089
    'BP04-008': ['VSPO!'], // 夜乃くろむ: VSPO!; https://yuyu-tei.jp/sell/xs/card/xsbp04/10092
    'BP04-012': ['REJECT'], // とおこ: REJECT; https://yuyu-tei.jp/sell/xs/card/xsbp04/10097
    'BP04-013': ['REJECT'], // 乾伸一郎: REJECT; https://yuyu-tei.jp/sell/xs/card/xsbp04/10100
  };
})();
