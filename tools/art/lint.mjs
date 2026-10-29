// The prompt lint (CLAUDE.md rule 11, KB card-games.md §7). Pure functions; no I/O.
// build-art-prompts.mjs refuses to write the prompts file when any rule fires, and lints the STYLE
// candidates too ("three-quarter" once tripped the count rule: 160 violations before 147 paid renders).
//
// Rules, each reported as `<what>: "<token>" (<rule>)`:
//   text magnet      nouns the model fills with lettering (sign, banner, logo, emblem, book, map, screen,
//                    magazine, poster, title, caption, ticket, label, letters, words, ...)
//   negation         diffusion reads the noun, not the "no" (no, not, never, without, none, ...)
//   count above two  three..hundred, digits above 2, "quarter", "third", "triple", ...
//   franchise/agency/team/artist/studio/talent name  (VSPO, ぶいすぽ, Crazy Raccoon, CR, Neo-Porte,
//                    REJECT, Xross, Brave group, Game & Co, studios, artists, other games) and the
//                    eight leaders' own names (a name in a prompt invites lettering)
//   photoreal        photo, photoreal, realistic, hyperreal, lifelike, "real face": no talent prompt may
//                    drift toward a real person's face
//   CJK              Japanese text in a prompt invites Japanese lettering
//   unresolved       a "{placeholder}" that was never filled
//   length           prompts over 900 characters

export const MAX_LEN = 900;

const MAGNETS = ['sign', 'signs', 'signpost', 'signboard', 'banner', 'banners', 'logo', 'logos', 'emblem', 'emblems', 'crest', 'crests', 'insignia',
  'book', 'books', 'spellbook', 'scroll', 'scrolls', 'letter', 'letters', 'lettering', 'label', 'labels', 'map', 'maps',
  'screen', 'screens', 'monitor', 'monitors', 'magazine', 'magazines', 'poster', 'posters', 'title', 'titles', 'caption', 'captions',
  'ticket', 'tickets', 'word', 'words', 'text', 'writing', 'written', 'newspaper', 'glyph', 'glyphs', 'rune', 'runes', 'plaque',
  'inscription', 'inscribed', 'calligraphy', 'nameplate', 'name', 'names', 'named', 'watermark', 'signature', 'billboard', 'marquee',
  'keyboard', 'jersey', 'badge', 'badges', 'tag', 'tags', 'scoreboard', 'leaderboard', 'phone', 'smartphone', 'laptop', 'television',
  'menu', 'page', 'pages', 'flag', 'flags', 'note', 'notes', 'clock', 'numeral', 'numerals', 'number', 'numbers', 'alphabet',
  'typography', 'font', 'stamp', 'receipt', 'chalkboard', 'blackboard', 'clipboard', 'storybook', 'manuscript', 'parchment'];
const NEGATIONS = ['no', 'not', 'never', 'without', 'lack', 'lacking', 'none', 'nothing', 'nobody', 'nor', 'neither', 'cannot', 'cant', 'dont',
  'isnt', 'doesnt', 'wont', 'avoid', 'avoiding'];
const COUNTS = ['three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'twenty', 'thirty', 'forty',
  'fifty', 'hundred', 'hundreds', 'thousand', 'thousands', 'dozen', 'dozens', 'trio', 'triplet', 'triplets', 'triple', 'quartet', 'third',
  'quarter', 'several', 'multiple'];
// Franchise / agency / team / game names and studios / artists. Matched as whole tokens (after
// lower-casing, dropping apostrophes and turning every other non-alphanumeric run into a space).
const NAME_TOKENS = ['vspo', 'cr', 'neoporte', 'reject', 'xross', 'xrossstars', 'crazyraccoon', 'gco', 'bravegroup', 'samurai', 'kobo',
  'aquastar', 'tscr', 'hololive', 'nijisanji', 'valorant', 'apex', 'overwatch', 'fortnite', 'minecraft', 'pokemon', 'disney', 'pixar',
  'ghibli', 'miyazaki', 'shinkai', 'ufotable', 'mappa', 'kyoani', 'artstation', 'pixiv', 'rutkowski', 'wlop', 'twitch', 'youtube'];
// Multi-word names (matched on the normalised phrase).
const NAME_PHRASES = ['crazy raccoon', 'neo porte', 'xross stars', 'brave group', 'game and co', 'game co', 'g and c', 'virtual entertainment',
  'league of legends', 'counter strike', 'studio ghibli', 'in the style of', 'style of', 'trending on', 'samurai kobo', 'in the manner of'];
const PHOTOREAL = ['photo', 'photos', 'photograph', 'photographic', 'photography', 'photoreal', 'photorealistic', 'photorealism', 'realistic',
  'realism', 'hyperrealistic', 'hyperreal', 'hyperrealism', 'lifelike', 'cinematic photo', 'dslr', 'portrait photo', 'real'];
const PHOTOREAL_PHRASES = ['real face', 'real person', 'real people', 'real human', 'realistic face', 'photo of', 'live action'];

const normalise = (s) => ' ' + String(s).toLowerCase().replace(/[’']/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
const CJK = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}　-〿＀-￯]/u;

// `extraNames`: more words to refuse as names (the leaders' own names, from data/cards.js).
export function makeLint(extraNames = []) {
  const banned = new Map();
  for (const w of MAGNETS) banned.set(w, 'text magnet');
  for (const w of NEGATIONS) banned.set(w, 'negation');
  for (const w of COUNTS) banned.set(w, 'count above two');
  for (const w of NAME_TOKENS) banned.set(w, 'franchise/agency/team/artist/studio name');
  for (const w of PHOTOREAL) banned.set(w, 'photoreal word');
  for (const w of extraNames) banned.set(String(w).toLowerCase(), 'a talent name (names invite lettering)');

  // Returns the list of problems for one text (empty when clean).
  return function lintText(what, text) {
    const problems = [];
    const s = String(text);
    if (CJK.test(s)) problems.push(`${what}: Japanese characters (invite Japanese lettering)`);
    if (/\{[^}]*\}/.test(s)) problems.push(`${what}: unresolved placeholder ${s.match(/\{[^}]*\}/)[0]}`);
    if (/\bn['’]t\b/i.test(s)) problems.push(`${what}: contraction negation`);
    const n = normalise(s);
    const seen = new Set();
    for (const w of n.trim().split(' ')) {
      if (!w || seen.has(w)) continue;
      if (banned.has(w)) { seen.add(w); problems.push(`${what}: "${w}" (${banned.get(w)})`); }
      else if (/^\d+$/.test(w) && +w > 2) { seen.add(w); problems.push(`${what}: "${w}" (count above two)`); }
    }
    for (const p of [...NAME_PHRASES, ...PHOTOREAL_PHRASES]) {
      if (n.includes(' ' + p + ' ')) problems.push(`${what}: "${p}" (${PHOTOREAL_PHRASES.includes(p) ? 'photoreal phrase' : 'franchise/agency/studio phrase'})`);
    }
    return problems;
  };
}

export function lintLength(what, prompt) {
  return prompt.length > MAX_LEN ? [`${what}: prompt is ${prompt.length} characters (over ${MAX_LEN})`] : [];
}

// Strings the self-test proves the lint refuses (and one the lint must accept).
export const SELFTEST_BAD = [
  'a sign over the door', 'a glowing logo', 'a plain banner', 'a thick book', 'an old map', 'a glowing screen', 'a magazine cover',
  'the poster title', 'a caption', 'a ticket', 'a name label', 'letters in the air', 'many words',
  'there is no light', 'a room without windows', 'she is not smiling', 'never blinking', 'it isn\'t here',
  'three wolves', '7 stars', 'a hundred lanterns', 'about three-quarter view',
  'a VSPO talent', 'ぶいすぽ', 'Crazy Raccoon stage', 'a CR member', 'Neo-Porte fans', 'REJECT team', 'Xross Stars card', 'Brave group', 'Game & Co',
  'in the style of a famous studio', 'a photo of a streamer', 'photorealistic lighting', 'a realistic face', 'a real person',
  'a {placeholder} left over',
];
export const SELFTEST_GOOD = [
  'a young woman with long black hair and violet eyes, an olive-green jacket, two bright beams crossing',
  'two characters on a neon stage, about two and a half heads tall',
];
