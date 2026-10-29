// Headless test runner: loads tests.html's <script src> list in order under node:vm with a bare
// window shim, then runs XS.T tests. Flags: --quiet (summary + failures), --filter <text>.
// Exported loadPage(page) is shared by later tools (sim, audit-cards, replay-report).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const fi = args.indexOf('--filter');
const filter = fi >= 0 ? args[fi + 1] : null;

export function loadPage(page, extra = []) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"?]+)(?:\?[^"]*)?"><\/script>/g)].map((m) => m[1]);
  const ctx = { console, structuredClone, setTimeout, clearTimeout, performance };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const src of [...srcs, ...extra]) {
    const code = fs.readFileSync(path.join(ROOT, src), 'utf8');
    vm.runInContext(code, ctx, { filename: src });
  }
  return ctx;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const t0 = Date.now();
  const ctx = loadPage('tests.html');
  const r = ctx.XS.T.runAll(filter, quiet);
  for (const f of r.fails) console.log(f);
  console.log(`tests: ${r.pass} passed, ${r.fail} failed (${Date.now() - t0} ms)`);
  // A run that executed nothing is a broken harness, not a green one.
  process.exit(r.fail || r.pass + r.fail === 0 ? 1 : 0);
}
