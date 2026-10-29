// Leader affiliation tags (the word printed under a leader's name). The card API has no tag field
// (docs/card-text-grammar.md §7.1, PLAN D13), so this is a hand table.
// source: the product page https://xross-stars.com/product/st01-02 (ST01 = four VSPO! talents,
// ST02 = four Crazy Raccoon members) and the card faces, which show the tag under the name
// ("VSPO!" under 花芽すみれ, "CR" under Mondo / Selly: PM p.02, p.08, p.10; ruling R-031).
// Only leaders have an entry. Every emitted leader must have one (tools/validate-data.mjs).
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
  };
})();
