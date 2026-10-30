// Printed-vs-compiled auditor (KB lesson: a dropped clause or a wrong amount hides behind green tests).
// For every card in data/cards.js it takes the printed Japanese effect text from docs/sources/api/all-cards.json (gitignored;
// the repo never carries it, PLAN D16), strips reminder text （…）, and checks against the card's entry in data/abilities.js:
//   FAIL  a number printed on the card that appears nowhere in the compiled entry (dropped clause / wrong amount)
//   FAIL  a number in the compiled entry (ignoring structural `unit`) that is not printed (invented amount)
//   FAIL  a timing tag printed on the card (【プレイ時】 ...) with no matching effect, or an effect timing the card does not print
//         (a `grant` op, e.g. 盗賊キット, carries the tag of the ability it gives: its `timing` counts as the effect's tag)
// Printed numbers that an op does not carry are exempt: the N of "N枚につき" / "N体につき" (a per-unit count, the engine counts per
// card; only the amount after it is a number) and the 1体 of a `revive` (one leader is the op itself).
// Prints `pending (no docs/sources)` when the dump is absent (CI). --selftest proves the auditor flags known-bad entries.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPage } from './test.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DUMP = path.join(ROOT, 'docs/sources/api/all-cards.json');
const TAG = { onPlay: 'プレイ時', attack: 'アタックする', afterAttack: 'アタック後', boost: 'アタック強化', onAwaken: '覚醒時', round: 'ラウンド中' };

const selftest = process.argv.includes('--selftest');
if (!fs.existsSync(DUMP) && !selftest) {
  console.log('audit-cards: pending (no docs/sources)');
  process.exit(0);
}
const XS = loadPage('tests.html').XS;

// Keywords with no 【tag】: each must appear in the compiled entry (オーバーキル as an `overkill` condition, エコー as the `echo` op) and vice versa.
const KEYWORDS = ['オーバーキル', 'エコー'];
// Does any op in the entry (nested in grants too) have this op name?
function hasOp(v, name) {
  if (Array.isArray(v)) return v.some((x) => hasOp(x, name));
  if (v && typeof v === 'object') return v.op === name || Object.values(v).some((x) => hasOp(x, name));
  return false;
}
const zen = (t) => t.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
function printed(text, entry) {
  const t = zen(text || '').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '');
  const tags = new Set([...t.matchAll(/【([^】]+)】/g)].map((m) => m[1]));
  let body = t.replace(/【[^】]*】/g, '').replace(/\d+(?=[枚体]につき)/g, '');   // "N枚につき" / "N体につき": a per-unit count, not an amount an op carries
  if (entry && hasOp(entry, 'revive')) body = body.replace(/\b1(?=体)/g, '');   // 「ダウンしているリーダー1体」 is what `revive` is
  const numbers = new Set([...body.matchAll(/\d+/g)].map((m) => +m[0]));
  const keywords = new Set(KEYWORDS.filter((k) => t.includes(k)));
  return { tags, numbers, keywords };
}
// Keys whose numbers are structure, not printed amounts (the step of a split, "may" = min 0).
const STRUCTURAL = new Set(['unit', 'min']);
function compiled(entry, card) {
  const nums = new Set();
  const walk = (v, key) => {
    if (typeof v === 'number') { if (!STRUCTURAL.has(key)) nums.add(Math.abs(v)); }   // ダメージ-20 / コストを-1: the printed digits carry no sign
    else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], k);
  };
  walk(entry.effects, '');
  if (card && card.equip) walk(card.equip, 'equip');   // equipment stats live on the card (CARDS.equip), printed as 体力+30
  const tags = new Set(entry.effects.filter((e) => e.timing !== 'static').map((e) => TAG[e.timing]));
  // 盗賊キット: the printed 【アタック後】 sits in the ability a `grant` op gives, whose `timing` is the tag.
  const grants = (v) => {
    if (Array.isArray(v)) v.forEach(grants);
    else if (v && typeof v === 'object') { if (v.op === 'grant' && TAG[v.timing]) tags.add(TAG[v.timing]); Object.values(v).forEach(grants); }
  };
  grants(entry.effects);
  // keywords printed without a tag: オーバーキルN (a condition `overkill` on an op) and エコー (the static `echo` marker)
  const kw = new Set();
  const scan = (v) => {
    if (Array.isArray(v)) v.forEach(scan);
    else if (v && typeof v === 'object') {
      if (v.c === 'overkill') kw.add('オーバーキル');
      if (v.op === 'echo') kw.add('エコー');
      Object.values(v).forEach(scan);
    }
  };
  scan(entry.effects);
  return { tags, numbers: nums, kw };
}
function audit(text, entry, card) {
  const fails = [];
  const p = printed(text, entry), c = compiled(entry, card);
  for (const n of p.numbers) if (!c.numbers.has(n)) fails.push(`printed number ${n} is missing from the compiled entry`);
  for (const n of c.numbers) if (!p.numbers.has(n)) fails.push(`compiled number ${n} is not printed on the card`);
  for (const t of p.tags) if (!c.tags.has(t)) fails.push(`printed tag 【${t}】 has no effect`);
  for (const t of c.tags) if (!p.tags.has(t)) fails.push(`effect for 【${t}】 is not printed on the card`);
  for (const k of KEYWORDS) {
    if (p.keywords.has(k) && !c.kw.has(k)) fails.push(`printed keyword ${k} has no compiled counterpart`);
    if (c.kw.has(k) && !p.keywords.has(k)) fails.push(`compiled keyword ${k} is not printed on the card`);
  }
  return fails;
}

if (selftest) {
  const GRANT_TXT = 'これを装備しているリーダーは以下の能力を持つ。「【アタック後】ダウンしているなら、カードを1枚引く。この効果はターンに1回しか発動しない。」';
  const grantEntry = (f) => { const e = { effects: [{ timing: 'static', ops: [{ op: 'grant', timing: 'afterAttack', oncePerTurn: true, ops: [{ op: 'draw', n: 1 }] }] }] }; if (f) f(e.effects[0].ops[0]); return e; };
  const PER_TXT = '【アタックする】捨てたアタックカード1枚につき、ダメージ+30。';
  const REVIVE_TXT = '【プレイ時】ダウンしている自分のリーダー1体を、ダウンしていない状態に戻す。';
  const base = XS.ABIL['ST01-007'];                      // 【アタック後】 40 damage to 1 other opposing leader
  const text = '【アタックする】\n【アタック後】(effect words) 1 (more words) 40 (words).';   // tags and numbers only: no printed text is kept in the repo (PLAN D16)
  const mut = (f) => { const e = JSON.parse(JSON.stringify(base)); f(e); return e; };
  const cases = [
    ['good entry', base, 0],
    ['wrong amount', mut((e) => { e.effects[1].ops[0].n = 41; }), 2],
    ['dropped tag', mut((e) => { e.effects.pop(); }), 2],
    ['extra tag', mut((e) => { e.effects.push({ timing: 'boost', ops: [] }); }), 1],
    ['dropped clause', mut((e) => { e.effects[1].ops = []; }), 1],
  ];
  // keywords (no tag): the printed text names オーバーキル30 / エコー; the entry must carry them, and only then
  const ok = { effects: [{ timing: 'attack', ops: [] }, { timing: 'afterAttack', ops: [{ op: 'draw', n: 2, if: { c: 'overkill', n: 30 } }] }] };
  const okText = '【アタックする】\n【アタック後】オーバーキル30：カードを2枚引く。（reminder 30 words）';
  const kwCases = [
    ['overkill compiled', okText, ok, 0],
    ['overkill printed, condition dropped', okText, { effects: [ok.effects[0], { timing: 'afterAttack', ops: [{ op: 'draw', n: 2 }] }] }, 1],
    ['overkill compiled but not printed', '【アタックする】\n【アタック後】カードを2枚引く。 30', ok, 1],
    ['overkill with a wrong N', okText, { effects: [ok.effects[0], { timing: 'afterAttack', ops: [{ op: 'draw', n: 2, if: { c: 'overkill', n: 20 } }] }] }, 2],
    ['echo printed, op missing', '【プレイ時】カードを1枚引く。\nエコー（reminder）', { effects: [{ timing: 'onPlay', ops: [{ op: 'draw', n: 1 }] }] }, 1],
    ['echo compiled', '【プレイ時】カードを1枚引く。\nエコー（reminder）', { effects: [{ timing: 'onPlay', ops: [{ op: 'draw', n: 1 }] }, { timing: 'static', ops: [{ op: 'echo' }] }] }, 0],
    ['negative cost modifier prints without a sign', 'このカードのコストを-1する。', { effects: [{ timing: 'static', ops: [{ op: 'costMod', n: -1 }] }] }, 0],
    ['equipment stat read from CARDS.equip', '体力+30', { effects: [] }, 0, { equip: { hp: 30 } }],
    // grant: the printed 【アタック後】 of 盗賊キット lives in the ability the equipment gives
    ['grant carries the printed tag', GRANT_TXT, grantEntry(), 0],
    ['grant timing changed (printed 【アタック後】 has no effect)', GRANT_TXT, grantEntry((g) => { g.timing = 'boost'; }), 2],
    ['grant dropped (printed tag has no effect)', GRANT_TXT, { effects: [{ timing: 'static', ops: [] }, { timing: 'onPlay', ops: [{ op: 'draw', n: 1 }] }] }, 1],
    ['grant draws the wrong amount', GRANT_TXT, grantEntry((g) => { g.ops[0].n = 2; }), 2],
    // N枚につき / N体につき: the unit count is not a number an op carries; the amount after it is
    ['per-card count needs only the amount', PER_TXT, { effects: [{ timing: 'attack', ops: [{ op: 'dmgPlus', n: { perRevealed: { type: 'attack', each: 30 } } }] }] }, 0],
    ['per-card count with a wrong amount', PER_TXT, { effects: [{ timing: 'attack', ops: [{ op: 'dmgPlus', n: { perRevealed: { type: 'attack', each: 20 } } }] }] }, 2],
    ['per-card count carried as a workaround field', PER_TXT, { effects: [{ timing: 'attack', ops: [{ op: 'dmgPlus', n: { perRevealed: { type: 'attack', per: 1, each: 30 } } }] }] }, 1],
    ['per-leader count (体につき) needs only the amount', '【アタック後】自分のリーダー2体につき10ダメージ。', { effects: [{ timing: 'afterAttack', ops: [{ op: 'damage', n: { perOwnTag: { tag: 'X', each: 10 } }, to: { side: 'opp', count: 'all' } }] }] }, 0],
    ['per-leader count carried as a workaround field', '【アタック後】自分のリーダー2体につき10ダメージ。', { effects: [{ timing: 'afterAttack', ops: [{ op: 'damage', n: { perOwnTag: { tag: 'X', per: 2, each: 10 } }, to: { side: 'opp', count: 'all' } }] }] }, 1],
    ['a separate printed 1 is still required next to a per-card count', PER_TXT + 'カードを1枚引く。', { effects: [{ timing: 'attack', ops: [{ op: 'dmgPlus', n: { perRevealed: { type: 'attack', each: 30 } } }] }] }, 1],
    // 「1体」 on revive is the op itself
    ['revive needs no count', REVIVE_TXT, { effects: [{ timing: 'onPlay', ops: [{ op: 'revive' }] }] }, 0],
    ['revive carried with a workaround n', REVIVE_TXT, { effects: [{ timing: 'onPlay', ops: [{ op: 'revive', n: 1 }] }] }, 1],
    ['revive does not hide a missing number', REVIVE_TXT.replace('戻す。', '戻す。カードを2枚引く。'), { effects: [{ timing: 'onPlay', ops: [{ op: 'revive' }] }] }, 1],
    ['1体 without a revive is still a number', '【プレイ時】対戦相手のリーダー1体に10ダメージ。', { effects: [{ timing: 'onPlay', ops: [{ op: 'damage', n: 10, to: { side: 'opp' } }] }] }, 1],
  ];
  let bad = 0;
  for (const [name, entry, min] of cases) {
    const n = audit(text, entry).length;
    const ok = min === 0 ? n === 0 : n >= min;
    if (!ok) { bad++; console.log(`FAIL selftest ${name}: ${n} findings, wanted ${min === 0 ? 0 : '>= ' + min}`); }
  }
  for (const [name, txt, entry, min, card] of kwCases) {
    const n = audit(txt, entry, card).length;
    const okk = min === 0 ? n === 0 : n >= min;
    if (!okk) { bad++; console.log(`FAIL selftest ${name}: ${n} findings, wanted ${min === 0 ? 0 : '>= ' + min}`); }
  }
  console.log(bad ? 'audit-cards: selftest FAILED' : `audit-cards: selftest ok (${cases.length + kwCases.length} cases)`);
  process.exit(bad ? 1 : 0);
}

const rows = JSON.parse(fs.readFileSync(DUMP, 'utf8'));
const byNo = new Map();
for (const r of rows) {
  if (r.is_parallel) continue;
  byNo.set(`${r.card_product.code}-${r.card_number}`, r);
}
let fails = 0, nums = 0, tags = 0;
for (const no of Object.keys(XS.CARDS)) {
  const r = byNo.get(no);
  const entry = XS.ABIL[no];
  if (!r) { console.log(`FAIL ${no}: not in the card dump`); fails++; continue; }
  if (!entry) { console.log(`FAIL ${no}: no entry in data/abilities.js`); fails++; continue; }
  const f = audit(r.effect, entry, XS.CARDS[no]);
  for (const m of f) { console.log(`FAIL ${no} ${XS.CARDS[no].nameEn}: ${m}`); fails++; }
  const p = printed(r.effect, entry);
  nums += p.numbers.size; tags += p.tags.size;
}
console.log(`audit-cards: ${fails ? fails + ' failure(s)' : 'ok'} (${Object.keys(XS.CARDS).length} cards, ${nums} printed numbers and ${tags} timing tags checked)`);
process.exit(fails ? 1 : 0);
