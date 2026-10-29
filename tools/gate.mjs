// Every gate, one line each. Exit non-zero if any step fails. Pending steps print a line and
// never fail: they name the milestone that turns them on.
//   node tools/gate.mjs
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const steps = [
  ['tests', ['tools/test.mjs', '--quiet']],
  ['check-pages', ['tools/check-pages.mjs']],
  ['stamp-assets', ['tools/stamp-assets.mjs', '--check']],
  ['build-cards --check', ['tools/build-cards.mjs', '--check']],
  ['validate-data', ['tools/validate-data.mjs']],
  ['validate-data --selftest', ['tools/validate-data.mjs', '--selftest']],
  ['validate-abilities', ['tools/validate-abilities.mjs']],
  ['validate-abilities --selftest', ['tools/validate-abilities.mjs', '--selftest']],
  ['audit-cards', ['tools/audit-cards.mjs']],                 // prints "pending (no docs/sources)" and passes when the gitignored dump is absent (CI)
  ['audit-cards --selftest', ['tools/audit-cards.mjs', '--selftest']],
  ['sim', ['tools/sim.mjs', '--games', '200', '--seed', '1']],
  ['ai-bench --quick', ['tools/ai-bench.mjs', '--quick']],    // normal beats random >= 95% of decisive games in both seats, 0 fallbacks, 0 illegal actions (the full bench stays out of the gate)
  ['art-prompts lint', ['tools/build-art-prompts.mjs', '--check']],
  ['art-prompts --selftest', ['tools/build-art-prompts.mjs', '--selftest']],
  ['check-art', ['tools/check-art.mjs']],                     // "pending (N of 58 faces)" until REQUIRE_ART flips; always fails on corrupt, stray or over-budget art
];
// Ported from lorecannae but not runnable yet. Turn each on by moving it into `steps`.
const pending = [
  ['replay selftest', 'M1/M2'],
];

let bad = 0;
for (const [name, args] of steps) {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  const out = ((r.stdout || '') + (r.stderr || '') + (r.error ? 'ERROR ' + r.error.message : '')).trim().split('\n');
  const isBad = (l) => l.startsWith('FAIL') || l.includes('ERROR');
  // The step's own summary line, minus the "name: " prefix it prints itself.
  const last = (out.filter((l) => !isBad(l)).slice(-1)[0] || '').replace(/^[a-z -]+: /, '');
  console.log(`${r.status === 0 ? 'ok  ' : 'FAIL'} ${name}: ${last}`);
  if (r.status !== 0) { bad++; for (const l of out.filter(isBad).slice(0, 8)) console.log('     ' + l); }
}
for (const [name, when] of pending) console.log(`pend ${name}: pending (${when})`);
console.log(bad ? `gate: ${bad} failing` : `gate: green (${steps.length} ok, ${pending.length} pending)`);
process.exit(bad ? 1 : 0);
