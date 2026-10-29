// Composes every art prompt (M5) and REFUSES to write when the lint fails.
//   prompt = STYLE . proportion/subject anchor : identity or scene or object clause . framing
// Subjects: 8 leaders x 2 faces (data/art-identity.js leaders), 28 attack/memoria scenes, 14 objects
// (tactics, PP Ticket, PP card), 4 UI plates, plus the 10-style audition on one subject.
// Prompts use the visual clauses only, never a talent's name (a name invites lettering; D2 allows
// real names in the UI, not in prompts).
//
//   node tools/build-art-prompts.mjs                 lint + write tools/out/art-prompts.json (refuses while STYLE is null)
//   node tools/build-art-prompts.mjs --style A       same, with a PROVISIONAL candidate (file is marked provisional; gen-art refuses it)
//   node tools/build-art-prompts.mjs --check         lint everything, write nothing (the gate step; works while STYLE is null)
//   node tools/build-art-prompts.mjs --selftest      prove the lint bites, then exit
//   node tools/build-art-prompts.mjs --show <key>    print one prompt (key: ST01-001, ST01-001/awakened, ui/title, audition/A)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, parseArgs, loadModel, faceKeys, uiKeys, kindOf, sizeOf, isUi } from './art/lib.mjs';
import { makeLint, lintLength, SELFTEST_BAD, SELFTEST_GOOD } from './art/lint.mjs';
import { CANDIDATES, STYLE, UI_STYLE } from './art/style.mjs';

const OUT_DIR = path.join(ROOT, 'tools', 'out');
export const AUDITION_SUBJECT = 'ST01-001';

// Subject anchors (proportion/subject first, KB: "front-load the proportion anchor").
const ANCHOR = {
  leader: 'A single character, whole figure in frame, centred, facing the viewer',
  'leader-awakened': 'A single character in a powered-up state, whole figure in frame, centred, facing the viewer',
  scene: 'An action scene with the characters large and clear in the foreground',
  object: 'One hero object centred on a dark stage floor, an object-only still life empty of people',
  backdrop: 'An empty place with a calm open centre, wide panoramic composition',
  cardback: 'A single symmetrical vertical design',
};
const FRAMING = {
  portrait: 'full-bleed composition edge to edge, purely pictorial, wordless and untitled, vertical portrait',
  landscape: 'full-bleed composition edge to edge, purely pictorial, wordless and untitled, wide landscape, detail fading softly toward the edges',
};

export function loadSources() { return loadModel(); }

function lintFor(CARDS) {
  const names = new Set();
  for (const c of Object.values(CARDS)) if (c.type === 'leader') for (const w of String(c.nameEn).split(/\s+/)) if (w.length >= 3) names.add(w);
  return makeLint([...names]);
}

// The clause for one key (placeholders resolved). Pushes problems; returns null when there is none.
function clauseFor(key, S, problems) {
  const { CARDS, IDENT } = S;
  const person = (m, id, head) => {
    const L = IDENT.leaders[id];
    if (!L) { problems.push(`${key}: scene names leader ${id} with no identity entry`); return m; }
    return head ? L.head : `${L.head}, wearing ${L.outfit}, who`;
  };
  if (isUi(key)) { const u = IDENT.ui[key.slice(3)]; return { text: u.clause, anchor: ANCHOR[u.kind], kind: u.kind }; }
  const base = key.replace(/\/awakened$/, '');
  const c = CARDS[base];
  if (!c) { problems.push(`${key}: not a card in data/cards.js`); return null; }
  if (c.type === 'leader') {
    const L = IDENT.leaders[base];
    if (!L) { problems.push(`${key}: no identity entry (a subject without one fails the build)`); return null; }
    for (const f of ['head', 'outfit', 'pose', 'palette', 'awakened']) if (!L[f]) problems.push(`${base}: identity field "${f}" is empty`);
    const front = `${L.head}, wearing ${L.outfit}, ${L.pose}, palette of ${L.palette}`;
    return key.endsWith('/awakened') ? { text: `${front}, ${L.awakened}`, anchor: ANCHOR['leader-awakened'] } : { text: front, anchor: ANCHOR.leader };
  }
  if (c.type === 'attack' || c.type === 'memoria') {
    const raw = IDENT.scenes[base];
    if (!raw) { problems.push(`${key}: no scene clause (a subject without one fails the build)`); return null; }
    const deck = base.slice(0, 4);
    const ids = new Set();
    const text = raw.replace(/\{(ST0\d-\d{3})(:head)?\}/g, (m, id, head) => {
      ids.add(id);
      if (id.slice(0, 4) !== deck) problems.push(`${key}: scene uses leader ${id} from another deck`);
      return person(m, id, !!head);
    });
    if (ids.size < 1) problems.push(`${key}: scene names no leader of the deck`);
    if (ids.size > 2) problems.push(`${key}: scene names ${ids.size} leaders (at most two)`);
    return { text, anchor: ANCHOR.scene };
  }
  if (c.type === 'tactics' || c.type === 'pp') {
    const raw = IDENT.objects[base.slice(5)];
    const accent = IDENT.accents[base.slice(0, 4)];
    if (!raw) { problems.push(`${key}: no object clause for suffix ${base.slice(5)}`); return null; }
    if (!accent) { problems.push(`${key}: no accent colours for deck ${base.slice(0, 4)}`); return null; }
    return { text: raw.replace(/\{accent\}/g, accent), anchor: ANCHOR.object };
  }
  problems.push(`${key}: card type "${c.type}" has no clause rule`);
  return null;
}

// style/uiStyle are strings; sources S = loadSources(). Returns { problems, prompts } for the 62 keys.
export function composeAll(style, uiStyle, S) {
  const lint = lintFor(S.CARDS);
  const problems = [];
  const prompts = {};
  const keys = [...faceKeys(S.CARDS), ...uiKeys(S.IDENT)];
  // Identity entries that name no deck card, scenes/objects for nothing: the table must match the data.
  for (const id of Object.keys(S.IDENT.leaders)) if (!S.CARDS[id] || S.CARDS[id].type !== 'leader') problems.push(`identity leader ${id} is not a leader in data/cards.js`);
  for (const id of Object.keys(S.IDENT.scenes)) if (!S.CARDS[id] || !['attack', 'memoria'].includes(S.CARDS[id].type)) problems.push(`scene ${id} is not an attack/memoria card in data/cards.js`);
  for (const k of Object.keys(S.IDENT.objects)) if (!Object.keys(S.CARDS).some((n) => n.endsWith('-' + k) && ['tactics', 'pp'].includes(S.CARDS[n].type))) problems.push(`object clause ${k} matches no tactics/pp card`);
  for (const key of keys) {
    const cl = clauseFor(key, S, problems);
    if (!cl) continue;
    const ui = isUi(key);
    const sub = ui ? S.IDENT.ui[key.slice(3)].kind : null;
    const sz = sizeOf(key, S.IDENT);
    const framing = sz.w > sz.h ? FRAMING.landscape : FRAMING.portrait;
    const lead = ui ? uiStyle : style;
    const prompt = `${lead}. ${cl.anchor}: ${cl.text}. ${framing}.`;
    problems.push(...lint(key, prompt), ...lintLength(key, prompt));
    prompts[key] = { kind: kindOf(key, S.CARDS), w: sz.w, h: sz.h, nameEn: ui ? key : (S.CARDS[key.replace(/\/awakened$/, '')].nameEn + (key.endsWith('/awakened') ? ' (awakened)' : '')), prompt };
    void sub;
  }
  return { problems, prompts };
}

// The audition: ten candidate styles on one subject (leader ST01-001 front face), fixed seed.
export function composeAudition(S) {
  const lint = lintFor(S.CARDS);
  const problems = [];
  const prompts = {};
  const base = {}; const cl = clauseFor(AUDITION_SUBJECT, S, problems);
  void base;
  for (const [id, c] of Object.entries(CANDIDATES)) {
    problems.push(...lint(`style ${id}`, c.style), ...lint(`style ${id} (ui)`, c.ui));
    if (!cl) continue;
    const key = 'audition/' + id;
    const sz = sizeOf(AUDITION_SUBJECT, S.IDENT);
    const prompt = `${c.style}. ${cl.anchor}: ${cl.text}. ${FRAMING.portrait}.`;
    problems.push(...lint(key, prompt), ...lintLength(key, prompt));
    prompts[key] = { kind: 'audition', w: sz.w, h: sz.h, nameEn: c.label, prompt };
  }
  if (Object.keys(CANDIDATES).length !== 10) problems.push(`the audition needs exactly 10 candidates, found ${Object.keys(CANDIDATES).length}`);
  return { problems, prompts };
}

// Resolve the style pair for a run. `provisional` is set when a candidate stands in for the unset STYLE.
export function resolveStyle(styleArg) {
  if (STYLE && UI_STYLE && !styleArg) return { style: STYLE, uiStyle: UI_STYLE, provisional: false, label: 'STYLE (chosen)' };
  if (STYLE && !UI_STYLE && !styleArg) return { error: 'UI_STYLE is null while STYLE is set: set both in tools/art/style.mjs' };
  const id = styleArg || null;
  if (id) {
    const c = CANDIDATES[id];
    if (!c) return { error: `unknown candidate "${id}" (A..J)` };
    return { style: c.style, uiStyle: c.ui, provisional: true, label: `candidate ${id} "${c.label}" (PROVISIONAL, planning only)` };
  }
  return { error: 'STYLE is not set (tools/art/style.mjs): the owner picks one of the 10 audition candidates first (node tools/gen-art.mjs --audition). Nothing was written.' };
}

function selftest() {
  let ok = true; let n = 0;
  const S = loadSources();
  const lint = lintFor(S.CARDS);
  for (const t of SELFTEST_BAD) { n++; if (!lint('t', t).length) { ok = false; console.log(`FAIL selftest: lint MISSED "${t}"`); } }
  for (const t of SELFTEST_GOOD) { const p = lint('t', t); if (p.length) { ok = false; console.log(`FAIL selftest: false positive on "${t}": ${p.join('; ')}`); } }
  for (const nm of ['Uruha', 'Kogara', 'Selly', 'Mondo']) { n++; if (!lint('t', `a portrait of ${nm}`).length) { ok = false; console.log(`FAIL selftest: talent name ${nm} not refused`); } }
  const A = CANDIDATES.A;
  const clean = composeAll(A.style, A.ui, S);
  if (clean.problems.length) { ok = false; console.log('FAIL selftest: the clean table does not compose: ' + clean.problems[0]); }
  const mutate = (name, fn, want) => {
    n++; const T = structuredClone(S); fn(T);
    const r = composeAll(A.style, A.ui, T);
    if (!r.problems.some((p) => p.includes(want))) { ok = false; console.log(`FAIL selftest: mutation "${name}" did not produce "${want}"`); }
  };
  mutate('leader without identity', (T) => { delete T.IDENT.leaders['ST02-004']; }, 'no identity entry');
  mutate('scene removed', (T) => { delete T.IDENT.scenes['ST01-010']; }, 'no scene clause');
  mutate('object removed', (T) => { delete T.IDENT.objects['022']; }, 'no object clause');
  mutate('text magnet in a scene', (T) => { T.IDENT.scenes['ST01-006'] += ', a glowing sign on the wall'; }, 'text magnet');
  mutate('negation in an identity clause', (T) => { T.IDENT.leaders['ST01-001'].pose = 'smiling without a care'; }, 'negation');
  mutate('franchise name', (T) => { T.IDENT.scenes['ST02-005'] += ', a Crazy Raccoon fan'; }, 'franchise');
  mutate('talent name', (T) => { T.IDENT.scenes['ST01-009'] += ', Uruha'; }, 'talent name');
  mutate('photoreal word', (T) => { T.IDENT.leaders['ST02-001'].head += ', a realistic face'; }, 'photoreal');
  mutate('three people', (T) => { T.IDENT.scenes['ST01-005'] = '{ST01-001:head}, {ST01-002:head} and {ST01-003:head} pose together'; }, 'at most two');
  mutate('leader of the other deck', (T) => { T.IDENT.scenes['ST01-006'] = '{ST02-001:head} runs through a doorway'; }, 'another deck');
  mutate('overlong prompt', (T) => { T.IDENT.scenes['ST01-007'] += ' ' + 'wide '.repeat(200); }, 'over 900');
  mutate('count above two', (T) => { T.IDENT.scenes['ST01-008'] += ', five lanterns'; }, 'count above two');
  mutate('Japanese text', (T) => { T.IDENT.objects['020'] += ' クロス'; }, 'Japanese');
  // The audition candidates are linted too.
  n++; { const saved = CANDIDATES.C.style; CANDIDATES.C.style = 'a loose painting with a hidden sign'; const r = composeAudition(S); CANDIDATES.C.style = saved; if (!r.problems.some((p) => p.includes('style C'))) { ok = false; console.log('FAIL selftest: a bad STYLE candidate was not refused'); } }
  console.log(ok ? `build-art-prompts --selftest: ok (${n} checks: the lint bites on every rule, a missing subject fails, candidates are linted)` : 'build-art-prompts --selftest: FAILED');
  process.exit(ok ? 0 : 1);
}

function main() {
  const args = parseArgs(process.argv.slice(2), ['check', 'selftest']);
  if (args.has('selftest')) selftest();
  const S = loadSources();
  const check = args.has('check');
  const rs = resolveStyle(args.get('style', null) || (check ? 'A' : null));
  if (rs.error) { console.log('art-prompts: REFUSED - ' + rs.error); process.exit(2); }
  const aud = composeAudition(S);
  const all = composeAll(rs.style, rs.uiStyle, S);
  const problems = [...aud.problems, ...all.problems];
  // --check proves that ANY candidate the owner picks composes clean and fits 900 characters.
  if (check) for (const [id, c] of Object.entries(CANDIDATES)) for (const p of composeAll(c.style, c.ui, S).problems) problems.push(`[if candidate ${id} is picked] ${p}`);
  const show = args.get('show', null);
  if (show) console.log((all.prompts[show] || aud.prompts[show] || { prompt: 'no such key ' + show }).prompt);
  if (problems.length) {
    console.log(`art-prompts: REFUSED to write - ${problems.length} lint problem(s)\n  ` + problems.slice(0, 60).join('\n  ') + (problems.length > 60 ? `\n  ... and ${problems.length - 60} more` : ''));
    process.exit(1);
  }
  const lens = Object.values(all.prompts).map((p) => p.prompt.length);
  const stats = `${Object.keys(all.prompts).length} prompts + ${Object.keys(aud.prompts).length} audition, length ${Math.min(...lens)}-${Math.max(...lens)} of 900`;
  if (check) {
    console.log(`art-prompts: lint clean (${stats}; all 10 style candidates linted; ${STYLE ? 'STYLE chosen' : 'STYLE not chosen yet, composed with candidate A'})`);
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, 'art-prompts.json');
  fs.writeFileSync(file, JSON.stringify({ style: rs.style, uiStyle: rs.uiStyle, provisional: rs.provisional, prompts: all.prompts, audition: aud.prompts }, null, 1));
  console.log(`art-prompts: lint clean; wrote tools/out/art-prompts.json (${stats}; ${rs.label})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
