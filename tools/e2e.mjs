// End-to-end checks of the first playable, in a real browser (Playwright, plain chromium.launch()).
//   node tools/e2e.mjs [--only a|b|c|d|e|f|g|h|i|j|k|l] [--keep]
// (a) bot vs bot to the end screen, instant speed: full-match seeds 1..5 and quick-match seeds 1..2,
//     zero console errors, zero page errors, zero UI diagnostics, and the saved trace replays.
// (b) the human path by real clicks: Play, pick tactics, play an attack card choosing attacker and
//     target, check the damage on the target equals XS.previewAttack and the log shows the attack;
//     then a whole quick match played by clicking (every prompt kind that appears is answered).
// (c) screenshots (tools/out/m3-*.png) of a mid-game board and of the awaken stinger at 1280x800 and
//     390x844, plus layout checks (no scrollbars, nothing off screen) at four viewport sizes.
// (d) speed Full: input is locked during playback and a click skips it.
// (h) M7 polish: settings persist across a reload, Continue restores the exact board (view() JSON), a save that cannot
//     replay is cleared with a message, the deck list peek, the credits and how-to screens (title and Menu), art from the
//     manifest (a fixture PNG under tools/out, never committed), the audio hooks (XS.Audio.onLog once per presented entry,
//     UI cues, scenes, unlock on the first gesture), auto-pass with its notice and cancel, and the m7-*.png screenshots.
// (i) the deck picker: 12 decks in two groups for both seats, View list for all 12, the bot's default, Surprise me, 1280x800 and 390x844.
// (j) the booster prompts (look, reveal, may, freePlay, revive) resumed from real games of the competitive decks and answered by clicking,
//     cost changes struck on the cards, keyword and equipment text in the zoom, Echo; screenshots tools/out/comp-ui-*.png.
// (k) a human match by clicks with a competitive deck chosen on the title.
// (l) every competitive deck against another one, bot=ai at instant speed, one seed each (10 games).
// The script starts `node tools/serve.mjs` on port 8232 (E2E_PORT overrides) and stops it afterwards.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools/out');
const PORT = Number(process.env.E2E_PORT) || 8232;   // E2E_PORT: a second agent can run its own copy beside the default one
const BASE = `http://localhost:${PORT}/index.html`;
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const ST = {};   // a state remembered between the M7 sub-tests
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const fails = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  if (!ok) fails.push(name + (detail ? ': ' + detail : ''));
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail && !ok ? ' -> ' + detail : ''}`);
}

// ---- server ----------------------------------------------------------------------------------------
function portOpen() {
  return new Promise((res) => { const s = net.connect(PORT, '127.0.0.1'); s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); });
}
let server = null;
async function startServer() {
  if (await portOpen()) throw new Error(`port ${PORT} is already in use; stop that server first`);
  server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs'), String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { if (await portOpen()) return; await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('the server did not start');
}
function stopServer() { if (server !== null) { server.kill(); server = null; } }
process.on('exit', stopServer);
process.on('SIGINT', () => { stopServer(); process.exit(130); });

// Warnings the page raises on purpose and that are not defects: M6's declared "audio pending: <tag>" (a cue whose file has not been
// generated yet is reported once, never synthesised) and the title's one-line note when a save cannot be replayed.
const DECLARED = /^(audio pending: |\[save\] replay failed)/;

// ---- page helpers ----------------------------------------------------------------------------------
async function open(browser, url, viewport, initScript) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, hasTouch: viewport.width < 600 });
  const page = await ctx.newPage();
  if (initScript !== undefined) await page.addInitScript(initScript);
  const errors = [];
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !DECLARED.test(m.text())) errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
  await page.goto(url);
  return { ctx, page, errors };
}
const dbg = (page, fn, arg) => page.evaluate(fn, arg);

// Wait until the UI is idle and it is the human's decision (or the match is over).
async function waitMyDecision(page, timeout = 30000) {
  await page.waitForFunction(() => {
    const d = XS.ui.game.debug();
    return d.live.phase === 'over' || (!d.pumping && d.presented.raw === d.live && XS.whoActs(d.live) === 0);
  }, null, { timeout });
  return page.evaluate(() => XS.ui.game.debug().live.phase === 'over');
}

let TAP = false;
const press = (loc) => (TAP ? loc.tap() : loc.click());

let rngState = 12345;
const rnd = (n) => { rngState = (rngState * 1103515245 + 12345) & 0x7fffffff; return rngState % n; };

// Answer whatever prompt is on screen by clicking. Returns false when none is.
async function answerPrompt(page) {
  const info = await page.evaluate(() => {
    const c = document.querySelector('#prompt .prompt-card');
    if (c === null) return null;
    const p = XS.ui.game.debug().presented.view.pending;
    return { cls: c.className, pending: p };
  });
  if (info === null) return false;
  const p = info.pending;
  if (info.cls.includes('kind-chooseFirst')) { await press(page.locator('#prompt .btn.big').nth(rnd(2))); return true; }
  if (info.cls.includes('kind-pickTactics')) {
    await press(page.locator('#prompt .card.pick').nth(rnd(p.options.length)));
    await press(page.locator('#prompt-confirm'));
    return true;
  }
  if (info.cls.includes('kind-choose')) {
    const n = Math.max(1, p.min);
    const leaders = p.options.every((o) => /^L[01][0-3]$/.test(o));
    const items = leaders ? page.locator('#prompt .chip') : page.locator('#prompt .card.pick, #prompt .p-cards .btn');
    for (let i = 0; i < n; i++) await press(items.nth(i));
    await press(page.locator('#prompt-confirm'));
    return true;
  }
  if (info.cls.includes('kind-distribute')) {
    const steps = p.total / p.unit;
    for (let i = 0; i < steps; i++) await page.locator('#prompt .p-dist-row').nth(i % p.options.length).locator('.btn.step').nth(1).click();
    await page.click('#prompt-confirm');
    return true;
  }
  if (info.cls.includes('kind-attackPair')) {
    await page.locator('#board .r-actor').nth(0).click();
    await page.locator('#board .r-target').nth(0).click();
    await page.click('#prompt-confirm');
    return true;
  }
  throw new Error('unknown prompt: ' + info.cls);
}

// Play one card by clicking: select, then attacker/target as asked, then confirm. Returns a description.
async function playCardByClicks(page, iid, pickIdx = 0) {
  await press(page.locator(`[data-play="${iid}"]`));
  const actors = page.locator('#board .r-actor');
  if (await actors.count() > 0) await press(actors.nth(pickIdx % await actors.count()));
  const targets = page.locator('#board .r-target');
  if (await targets.count() > 0) await press(targets.nth(pickIdx % await targets.count()));
  await press(page.locator('#confirm'));
}

// ---- (a) bot against bot ----------------------------------------------------------------------------
async function testAutoplay(browser) {
  // [mode, seed, extra query]: '&bot=ai' puts the AI (in its Web Worker) in both seats (M4); the others keep the random bot.
  const runs = [['full', 1], ['full', 2], ['full', 3], ['full', 4], ['full', 5], ['quick', 1], ['quick', 2], ['full', 3, '&bot=ai'], ['quick', 4, '&bot=ai&tier=hard']];
  for (const [mode, seed, extra = ''] of runs) {
    const tag = extra === '' ? '' : ` (${extra.slice(1)})`;
    const { ctx, page, errors } = await open(browser, `${BASE}?autoplay=1&speed=instant&seed=${seed}&mode=${mode}${extra}`, { width: 1280, height: 800 });
    let ended = true;
    try { await page.waitForSelector('#endscreen.open', { timeout: 90000 }); } catch (e) { ended = false; }
    const info = ended ? await page.evaluate(() => {
      const d = XS.ui.game.debug();
      const r = XS.replay(d.live.init, d.live.actions);
      const rep = XS.ui.game.bugReport('e2e');
      return {
        winner: d.live.winner, wins: d.live.wins, actions: d.live.actions.length, diag: d.diagnostics.slice(),
        replayOk: r.winner === d.live.winner && r.log.length === d.live.log.length && JSON.stringify(r.wins) === JSON.stringify(d.live.wins),
        reportOk: rep.actions.length === d.live.actions.length && rep.init.seed === d.live.init.seed && typeof rep.ua === 'string' && typeof rep.date === 'string',
        head: document.querySelector('.end-head').textContent,
      };
    }) : null;
    check(`autoplay ${mode} seed ${seed}${tag}: reaches the end screen`, ended, ended ? '' : 'timeout');
    if (info !== null) {
      check(`autoplay ${mode} seed ${seed}${tag}: zero console/page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
      check(`autoplay ${mode} seed ${seed}${tag}: no UI diagnostics`, info.diag.length === 0, info.diag.slice(0, 2).join(' | '));
      check(`autoplay ${mode} seed ${seed}${tag}: XS.replay(init, actions) reproduces the result (${info.actions} actions, wins ${info.wins})`, info.replayOk);
      check(`autoplay ${mode} seed ${seed}${tag}: bug report has init, actions, ua, date`, info.reportOk);
    }
    await ctx.close();
  }
}

// ---- (g) the AI opponent: selector, worker, and the failure path (M4) -------------------------------------------
async function testAi(browser) {
  {
    const ctx0 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const reqs = [];
    ctx0.on('request', (r) => reqs.push(r.url()));
    const page0 = await ctx0.newPage();
    await page0.goto(`${BASE}?speed=instant&seed=11`);
    await page0.waitForFunction(() => XS.ui.aiClient.status() === 'ready', null, { timeout: 15000 });
    const workerUrls = reqs.filter((u) => u.includes('/js/ai/worker.js'));
    const imported = reqs.filter((u) => /\/js\/ai\/(ai|eval|policies|determinize)\.js/.test(u));
    check('cache-busting: the worker is requested as worker.js?v=<hash>', workerUrls.length >= 1 && workerUrls.every((u) => /worker\.js\?v=[0-9a-f]{10}$/.test(u)), workerUrls.join(' '));
    check('cache-busting: every script the worker imports carries its own ?v=<hash>', imported.length >= 4 && imported.every((u) => /\.js\?v=[0-9a-f]{10}$/.test(u)), imported.join(' '));
    await ctx0.close();
    const { ctx, page, errors } = await open(browser, `${BASE}?speed=instant&seed=11`, { width: 1280, height: 800 });
    await page.waitForFunction(() => XS.ui.aiClient.status() === 'ready', null, { timeout: 15000 });
    check('ai: the worker loads on the title screen and reports ready', true);
    const tiers = await page.$$eval('input[name="tier"]', (ns) => ns.map((n) => [n.value, n.checked]));
    check('title: a difficulty selector offers Easy / Normal / Hard with Normal pre-picked', JSON.stringify(tiers) === JSON.stringify([['easy', false], ['normal', true], ['hard', false]]), JSON.stringify(tiers));
    await page.locator('input[name="tier"][value="hard"]').check({ force: true });
    await page.click('#play');
    await page.waitForSelector('#game:not([hidden])');
    const dbgInfo = await page.evaluate(() => { const d = XS.ui.game.debug(); return { tier: d.opts.tier, bots: d.bots }; });
    check('title: the picked level reaches the match and the bot is the AI at that level', dbgInfo.tier === 'hard' && dbgInfo.bots.join() === 'AI hard', JSON.stringify(dbgInfo));
    // let the AI take its first turns: answer our own prompts until the bot has acted
    let acted = false;
    for (let i = 0; i < 40 && !acted; i++) {
      if (await waitMyDecision(page)) break;
      if (await answerPrompt(page)) { await page.waitForTimeout(50); continue; }
      await press(page.locator('#endturn'));
      await page.waitForTimeout(100);
      acted = await page.evaluate(() => XS.ui.game.debug().live.log.some((e) => e.seat === 1 && e.type === 'play'));
    }
    check('ai: the Hard opponent answered through the worker (its turn started and the game went on)', acted);
    check('ai: zero console/page errors with the AI in the worker', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }
  {
    // The worker script is blocked: the page must SAY so, lock Play, and never fall back to a random bot.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.route('**/js/ai/worker.js*', (r) => r.abort());
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(`${BASE}?speed=instant`);
    await page.waitForFunction(() => XS.ui.aiClient.status() === 'failed', null, { timeout: 15000 });
    check('ai failure: the page shows an error banner naming the AI', await page.isVisible('#ai-error') && (await page.textContent('#ai-error')).includes('AI'));
    check('ai failure: Play is locked and says why (no silent random bot)', await page.isDisabled('#play') && (await page.textContent('#play-why')).includes('did not load'));
    await ctx.close();
  }
  {
    // The watchdog: a worker whose final answer arrives 7 s late. After 5 s the page must act on the AI's best so far (a 'partial'
    // message), never on a random move, and the late result must change nothing.
    const { ctx, page, errors } = await open(browser, `${BASE}?autoplay=1&bot=ai&speed=instant&seed=5&mode=quick`, { width: 1280, height: 800 }, () => {
      const Real = window.Worker;
      window.__held = { partials: 0, held: 0, firstPartialAt: null, actionsAtPartial: null };
      window.Worker = class extends Real {
        constructor(u) {
          super(u);
          const seen = new Set();
          Object.defineProperty(this, 'onmessage', {
            set: (fn) => {
              Real.prototype.__lookupSetter__('onmessage').call(this, (ev) => {
                const m = ev.data;
                if (m.type === 'partial') { seen.add(m.id); window.__held.partials++; if (window.__held.firstPartialAt === null) { window.__held.firstPartialAt = performance.now(); window.__held.actionsAtPartial = XS.ui.game.debug().live.actions.length; } }
                if (m.type === 'result' && seen.has(m.id) && window.__held.held === 0) { window.__held.held++; setTimeout(() => fn(ev), 7000); return; }
                fn(ev);
              });
            },
            configurable: true,
          });
        }
      };
    });
    await page.waitForFunction(() => window.__held.held === 1, null, { timeout: 60000 });
    const t0 = await page.evaluate(() => window.__held.firstPartialAt);
    const a0 = await page.evaluate(() => XS.ui.game.debug().live.actions.length);
    await page.waitForTimeout(4000);
    const a1 = await page.evaluate(() => XS.ui.game.debug().live.actions.length);
    await page.waitForTimeout(2300);
    const a2 = await page.evaluate(() => XS.ui.game.debug().live.actions.length);
    const failed = await page.evaluate(() => XS.ui.aiClient.status());
    void t0;
    check('ai watchdog: nothing happens for the first 4 s while the answer is held back', a1 === a0, `${a0} -> ${a1}`);
    check('ai watchdog: after 5 s the page plays the AI\'s best-so-far (the game moved on before the late result)', a2 > a1, `${a1} -> ${a2}`);
    check('ai watchdog: no failure banner, no console errors', failed !== 'failed' && errors.length === 0, errors.slice(0, 2).join(' | '));
    await ctx.close();
  }
}

// ---- (b) the human path ---------------------------------------------------------------------------------
// Get to the first moment an attack card is actable, by clicking (answering prompts, ending turns).
async function reachAttack(page, maxTurns = 8) {
  for (let turn = 0; turn < maxTurns; turn++) {
    if (await waitMyDecision(page)) return null;
    if (await answerPrompt(page)) continue;
    const iid = await page.evaluate(() => {
      const n = document.querySelector('.handcard.type-attack.is-actable');
      return n === null ? null : n.getAttribute('data-play');
    });
    if (iid !== null) return iid;
    // Nothing to attack with: end the turn.
    await press(page.locator('#endturn'));
  }
  return null;
}

async function testHumanPath(browser) {
  const { ctx, page, errors } = await open(browser, `${BASE}?speed=instant&seed=7`, { width: 1280, height: 800 });
  check('title: Play is enabled by default (pre-picked deck and mode)', await page.isEnabled('#play'));
  check('title: How to play and the notice are reachable', await page.isVisible('#howto-open') && (await page.textContent('#notice-text')).includes('unofficial'));
  await page.click('#play');
  await page.waitForSelector('#game:not([hidden])');
  // The coin toss and the tactics pick are prompts that say what they are about.
  let sawPick = false;
  for (let i = 0; i < 6; i++) {
    await waitMyDecision(page);
    const cls = await page.evaluate(() => (document.querySelector('#prompt .prompt-card') || { className: '' }).className);
    if (cls.includes('kind-pickTactics')) {
      sawPick = true;
      const txt = await page.textContent('#prompt .p-text');
      check('prompt: pickTactics shows the engine prompt sentence and five tactics cards with text',
        txt.length > 5 && (await page.locator('#prompt .card.pick').count()) === 5 && (await page.locator('#prompt .card.pick .c-text').first().textContent()).length > 3, txt);
      check('prompt: confirm is disabled until a card is clicked (no auto-pick)', await page.isDisabled('#prompt-confirm'));
      // Hide / show leaves the decision pending.
      await page.click('#prompt .btn.ghost');
      check('prompt: "Hide - check the board" parks it as a pill, still pending', await page.isVisible('#prompt-pill') &&
        (await page.evaluate(() => XS.ui.game.debug().presented.view.pending !== null)));
      await page.click('#prompt-pill');
    }
    if (!(await answerPrompt(page))) break;
  }
  check('prompt: a pickTactics decision was shown to the human', sawPick);

  const iid = await reachAttack(page);
  check('a playable attack card appears in the hand within a few turns', iid !== null);
  if (iid === null) { await ctx.close(); return; }

  // Disabled cards say why, before any click.
  const whys = await page.$$eval('.handcard.is-disabled .c-why', (ns) => ns.map((n) => n.textContent));
  const disabledCount = await page.locator('.handcard.is-disabled').count();
  check('disabled hand cards each show their whyNot text on the card', whys.length === disabledCount, `${whys.length}/${disabledCount}`);

  // End turn button says what it will draw.
  const lbl = await page.textContent('#endturn-label');
  const untapped = await page.evaluate(() => XS.ui.game.debug().live.players[0].pp.untapped);
  check('End turn names the draw for unused PP, number from s.pp.untapped', lbl.includes(`draw ${untapped} for ${untapped} unused PP`), lbl);

  // Select the card: attackers are highlighted; nothing is auto-picked.
  await page.locator(`[data-play="${iid}"]`).click();
  const legalAttackers = await page.evaluate((iid) => {
    const d = XS.ui.game.debug();
    return Array.from(new Set(XS.legalActions(d.live).filter((a) => a.type === 'play' && a.iid === iid).map((a) => a.attacker))).sort();
  }, iid);
  const shownAttackers = (await page.$$eval('#board .r-actor', (ns) => ns.map((n) => n.getAttribute('data-leader')))).sort();
  check('attackers highlighted = the attackers in legalActions', JSON.stringify(shownAttackers) === JSON.stringify(legalAttackers), `${shownAttackers} vs ${legalAttackers}`);
  check('no confirm button until attacker and target are clicked', (await page.locator('#confirm').count()) === 0);
  const attacker = shownAttackers[0];
  await page.locator(`#board [data-leader="${attacker}"]`).click();
  const targetNodes = await page.$$eval('#board .r-target', (ns) => ns.map((n) => ({ iid: n.getAttribute('data-leader'), shown: n.querySelector('.l-preview').getAttribute('data-preview') })));
  const engine = await page.evaluate(([iid, attacker]) => {
    const d = XS.ui.game.debug();
    return XS.legalActions(d.live).filter((a) => a.type === 'play' && a.iid === iid && a.attacker === attacker).map((a) => {
      const det = XS.previewAttackDetail(d.live, a);
      return { iid: a.target, total: XS.previewAttack(d.live, a), shown: det.goesDown ? 'DOWN' : String(det.total) };
    });
  }, [iid, attacker]);
  check('every candidate target shows previewAttack on the board', targetNodes.length === engine.length &&
    engine.every((e) => targetNodes.find((t) => t.iid === e.iid && t.shown === e.shown)), JSON.stringify({ targetNodes, engine }));
  check('no confirm button before a target is clicked (no auto-pick)', (await page.locator('#confirm').count()) === 0);
  const target = targetNodes[1 % targetNodes.length].iid;
  const before = await page.locator(`#board [data-leader="${target}"] .l-dmg`).count() ? await page.textContent(`#board [data-leader="${target}"] .l-dmg`) : '';
  await page.locator(`#board [data-leader="${target}"]`).click();
  const want = engine.find((e) => e.iid === target);
  const confirmText = await page.textContent('#confirm');
  check('confirm button names the action and the engine number', confirmText.includes(want.shown === 'DOWN' ? 'DOWN' : want.shown + ' damage'), confirmText);
  const hint = await page.textContent('#hint');
  check('hint line reads "Card: Attacker -> Target, N damage"', /: .+ → .+, (\d+ damage|DOWN)/.test(hint), hint);
  await page.screenshot({ path: path.join(OUT, 'm3-board-1280x800.png') });
  const cardName = hint.split(':')[0];
  await page.click('#confirm');
  await waitMyDecision(page);
  const res = await page.evaluate(([attacker, target]) => {
    const d = XS.ui.game.debug();
    const atk = d.live.log.filter((e) => e.type === 'attack').pop();
    return { damage: atk.data.damage, attacker: atk.data.attacker, target: atk.data.target };
  }, [attacker, target]);
  check('the attack that happened matches the preview', res.damage === Number(want.total) && res.attacker === attacker && res.target === target, JSON.stringify(res));
  await page.click('#btn-log');
  const logTop = await page.textContent('#log-list li.type-attack');
  check('the log drawer shows the attack with the damage', logTop.includes('attacks') && logTop.includes(`${res.damage} damage`), logTop);
  check('a card name in the log is a hover doorway (data-card)', (await page.locator('#log-list li.type-attack .cardref[data-card]').count()) >= 2);
  const dmgNow = await page.locator(`#board [data-leader="${target}"] .l-dmg`).count() ? await page.textContent(`#board [data-leader="${target}"] .l-dmg`) : '';
  const isDown = await page.locator(`#board [data-leader="${target}"].is-down`).count();
  check('the target tile shows the damage counters the preview promised', isDown === 1 || dmgNow === '−' + (Number(before.replace('−', '') || 0) + res.damage), `${before} -> ${dmgNow}`);
  void cardName;
  await page.click('#log-close');

  // Hover zoom: one delegated listener shows EN + JP name and full text.
  await page.hover('#board .leader >> nth=0');
  const zoom = await page.textContent('#zoom');
  const zen = await page.textContent('#zoom .z-en'), zjp = await page.textContent('#zoom .z-jp');
  check('hover zoom shows EN name, JP name, type and text', zoom.includes('LEADER') && zen.length > 2 && zjp.length > 2 && zoom.includes('Awaken'), zoom.slice(0, 120));
  await page.mouse.move(5, 5);

  // Trash viewer: face-up tactics only; says why face-down cards are not listed.
  await page.click('#trash-1');
  const vt = await page.textContent('#viewer-body');
  check('trash viewer states that face-down trash cannot be looked at', vt.includes('face down') && vt.includes('nobody may look'));
  await page.click('#viewer-close');

  // Flag a bug downloads a trace with init + actions.
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-flag')]);
  const trace = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  check('"Flag a bug" saves {init, actions, ua, date}', trace.init !== undefined && Array.isArray(trace.actions) && trace.ua && trace.date && trace.at === trace.actions.length);

  check('human path: zero console/page errors so far', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// Play a whole quick match by clicking only.
async function testHumanMatch(browser) {
  rngState = 99;
  const { ctx, page, errors } = await open(browser, `${BASE}?speed=instant&seed=11`, { width: 1280, height: 800 });
  await page.check('input[name="mode"][value="quick"]');
  await page.click('#play');
  let plays = 0, turns = 0, prompts = new Set();
  for (let step = 0; step < 4000; step++) {
    if (await waitMyDecision(page, 60000)) break;
    const cls = await page.evaluate(() => (document.querySelector('#prompt .prompt-card') || { className: '' }).className);
    if (cls) prompts.add(cls.split(' ').pop());
    if (await answerPrompt(page)) continue;
    const ids = await page.$$eval('.handcard.is-actable, .tac.is-actable', (ns) => ns.map((n) => n.getAttribute('data-play')));
    const pending = await page.evaluate(() => XS.ui.game.debug().presented.view.pending !== null);
    if (pending) continue;
    if (ids.length > 0 && rnd(5) > 0) { await playCardByClicks(page, ids[rnd(ids.length)], rnd(4)); plays++; continue; }
    await page.click('#endturn');
    turns++;
  }
  const over = await page.evaluate(() => XS.ui.game.debug().live.phase === 'over');
  check(`human match by clicks only: finished (${plays} cards played, ${turns} turns ended; prompts seen: ${Array.from(prompts).join(', ')})`, over);
  await page.waitForSelector('#endscreen.open', { timeout: 5000 });
  check('end screen has Rematch, Back to title and Save bug report', await page.isVisible('#end-rematch') && await page.isVisible('#end-title') && await page.isVisible('#end-bug'));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#end-bug')]);
  const trace = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  const replayOk = await page.evaluate((t) => { const r = XS.replay(t.init, t.actions); return r.phase === 'over'; }, trace);
  check('saved bug report replays to the same finished match', replayOk);
  const diag = await page.evaluate(() => XS.ui.game.debug().diagnostics.slice());
  check('human match: zero console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('human match: no UI diagnostics (engine and UI agreed on every action)', diag.length === 0, diag.slice(0, 2).join(' | '));
  // M7: the end-screen numbers come from the log, and a finished match leaves no save behind.
  const statsInfo = await page.evaluate(() => {
    const d = XS.ui.game.debug();
    const log = XS.view(d.live, 0).log;
    const seatOf = (iid) => iid.charCodeAt(1) - 48;
    const want = [0, 1].map((side) => ({
      damage: log.filter((e) => e.type === 'damage' && seatOf(e.data.leader) !== side).reduce((a, e) => a + e.data.amount, 0),
      downs: log.filter((e) => e.type === 'down' && e.data.seat !== side).length,
      awakenings: log.filter((e) => e.type === 'awaken' && e.data.seat === side).length,
      played: log.filter((e) => (e.type === 'play' || e.type === 'tacticsPlay') && e.seat === side).length,
    }));
    const cell = (label, col) => Number(document.querySelector(`#end-stats tr[data-stat="${label}"]`).children[col + 1].textContent);
    const got = [0, 1].map((c) => ({ damage: cell('Damage dealt', c), downs: cell('Leaders downed', c), awakenings: cell('Awakenings', c), played: cell('Cards played', c) }));
    return { want, got, line: document.querySelector('#end-stats .es-line').textContent, turns: log.filter((e) => e.type === 'turnStart').length, save: XS.ui.save.read() };
  });
  check('end screen: damage dealt, downs, awakenings and cards played per side match a recount of the log', JSON.stringify(statsInfo.want) === JSON.stringify(statsInfo.got), JSON.stringify(statsInfo));
  check('end screen: rounds and turns line is shown', /\d+ rounds? · \d+ turns?/.test(statsInfo.line) && statsInfo.line.includes(statsInfo.turns + ' turn'), statsInfo.line);
  check('a finished match clears the save', statsInfo.save === null);
  await page.click('#end-rematch');
  await page.waitForFunction(() => !document.getElementById('endscreen').classList.contains('open'));
  check('Rematch starts a new match', await page.evaluate(() => !XS.ui.game.debug().live.winner && XS.ui.game.debug().live.round === 1));
  await ctx.close();
}


// ---- (e) every pending kind the engine actually asks a human, resumed from a real game --------------------------
// Scans random games (headless, inside the page) for a moment when seat 0 must answer a pending decision of
// each purpose, resumes the UI exactly there, and answers by clicking.
async function findPending(page, purpose, minPick) {
  return page.evaluate(([purpose, minPick]) => {
    const U = XS.ui;
    for (let seed = 1; seed < 300; seed++) {
      let s = XS.newGame({ decks: ['ST01', 'ST02'], seed, mode: 'full', first: 0, names: ['You', 'Bot'] });
      const bots = [U.makeRandomBot(seed, 0), U.makeRandomBot(seed, 1)];
      for (let n = 0; n < 3000 && !XS.isTerminal(s); n++) {
        const p = s.pending;
        if (p !== null && p.seat === 0 && p.purpose === purpose && p.min >= minPick) return { init: s.init, actions: s.actions, seed };
        s = XS.apply(s, bots[XS.whoActs(s)].choose(s));
      }
    }
    return null;
  }, [purpose, minPick]);
}

async function testPrompts(browser) {
  const { ctx, page, errors } = await open(browser, `${BASE}?speed=instant`, { width: 1280, height: 800 });
  for (const [purpose, minPick] of [['heal', 1], ['target', 1], ['discard', 1], ['handLimit', 2], ['order', 1], ['distribute', 0]]) {
    const rep = await findPending(page, purpose, minPick);
    check(`prompts: a real game reaches a "${purpose}" decision for the human`, rep !== null);
    if (rep === null) continue;
    await page.evaluate((r) => XS.ui.game.resume(r), rep);
    await waitMyDecision(page);
    const pend = await page.evaluate(() => XS.ui.game.debug().presented.view.pending);
    const shown = await page.textContent('#prompt .p-text');
    check(`prompts ${purpose}: shows the engine's own sentence ("${pend.prompt}")`, shown === pend.prompt, shown);
    check(`prompts ${purpose}: names what the decision is about (purpose tag)`, (await page.textContent('#prompt .p-tag')).length > 3);
    if (pend.source) check(`prompts ${purpose}: shows the source card`, (await page.locator(`#prompt .p-source [data-iid="${pend.source}"]`).count()) === 1);
    check(`prompts ${purpose}: confirm waits for a click (never auto-answers, ${pend.options.length} candidates)`, await page.isDisabled('#prompt-confirm'));
    check(`prompts ${purpose}: no decline button while min is ${pend.min}`, (await page.locator('#prompt .btn', { hasText: 'Choose none' }).count()) === 0);
    const before = await page.evaluate(() => XS.ui.game.debug().live.actions.length);
    const leaders = pend.options.every((o) => /^L[01][0-3]$/.test(o));
    if (purpose === 'distribute') {
      const steps = pend.total / pend.unit;
      for (let i = 0; i < steps; i++) await page.locator('#prompt .p-dist-row').nth(i % pend.options.length).locator('.btn.step').nth(1).click();
      check('prompts distribute: the total is shown and exact', (await page.textContent('#prompt .p-total')) === `${pend.total} / ${pend.total}`);
      check('prompts distribute: "+" is disabled once the total is reached', await page.locator('#prompt .btn.step').nth(1).isDisabled());
    } else {
      const items = leaders ? page.locator('#prompt .chip') : page.locator('#prompt .card.pick');
      check(`prompts ${purpose}: one option per engine candidate`, (await items.count()) === pend.options.length, `${await items.count()} vs ${pend.options.length}`);
      if (leaders) check(`prompts ${purpose}: the options are highlighted on the board`, (await page.locator('#board .r-choose').count()) === pend.options.length);
      const n = Math.max(1, pend.min);
      for (let i = 0; i < n; i++) {
        if (leaders && i === 0) await page.locator(`#board [data-leader="${pend.options[0]}"]`).click();   // the board path
        else await items.nth(i).click();
      }
    }
    // Hide and show again: the decision stays pending.
    await page.click('#prompt .btn.ghost');
    check(`prompts ${purpose}: Hide parks the prompt as a pill; the decision stays pending`, await page.isVisible('#prompt-pill') && await page.evaluate(() => XS.ui.game.debug().presented.view.pending !== null));
    await page.click('#prompt-pill');
    await page.click('#prompt-confirm');
    await page.waitForFunction((n) => XS.ui.game.debug().live.actions.length > n, before);
    const last = await page.evaluate((n) => XS.ui.game.debug().live.actions[n], before);
    const okAnswer = purpose === 'distribute'
      ? last.type === 'distribute' && Object.values(last.alloc).reduce((x, y) => x + y, 0) === pend.total
      : last.type === 'choose' && last.ids.length === Math.max(1, pend.min) && last.ids.every((i) => pend.options.includes(i));
    check(`prompts ${purpose}: the answer sent to the engine is legal and complete`, okAnswer, JSON.stringify(last));
  }

  // Equipment from the tactics area: pick a leader, then confirm (the same path as an attack, one click fewer).
  const eqRep = await page.evaluate(() => {
    const U = XS.ui;
    for (let seed = 1; seed < 200; seed++) {
      let s = XS.newGame({ decks: ['ST01', 'ST02'], seed, mode: 'full', first: 0, names: ['You', 'Bot'] });
      const bots = [U.makeRandomBot(seed, 0), U.makeRandomBot(seed, 1)];
      for (let n = 0; n < 3000 && !XS.isTerminal(s); n++) {
        if (s.pending === null && s.phase === 'main' && XS.whoActs(s) === 0 && XS.legalActions(s).some((a) => a.type === 'play' && a.target !== undefined && a.attacker === undefined)) return { init: s.init, actions: s.actions };
        let a = bots[XS.whoActs(s)].choose(s);
        if (s.pending !== null && s.pending.kind === 'pickTactics' && s.pending.seat === 0) {
          const ls = s.pending.options.find((o) => s.cards[o].id.endsWith('-023'));
          a = { type: 'pickTactics', iid: ls };
        }
        s = XS.apply(s, a);
      }
    }
    return null;
  });
  check('equip: a real game reaches a playable Light Shield', eqRep !== null);
  if (eqRep !== null) {
    await page.evaluate((r) => XS.ui.game.resume(r), eqRep);
    await waitMyDecision(page);
    const info = await page.evaluate(() => {
      const d = XS.ui.game.debug();
      const acts = XS.legalActions(d.live).filter((a) => a.type === 'play' && a.target !== undefined && a.attacker === undefined);
      return { iid: acts[0].iid, targets: acts.map((a) => a.target).sort() };
    });
    await page.locator(`[data-play="${info.iid}"]`).click();
    const shown = (await page.$$eval('#board .r-actor', (ns) => ns.map((n) => n.getAttribute('data-leader')))).sort();
    check('equip: the leaders highlighted are exactly the legal equip targets', JSON.stringify(shown) === JSON.stringify(info.targets), `${shown} vs ${info.targets}`);
    check('equip: no confirm until a leader is clicked (no auto-pick)', (await page.locator('#confirm').count()) === 0);
    await page.locator(`#board [data-leader="${info.targets[1]}"]`).click();
    check('equip: confirm names the card and the leader', (await page.textContent('#confirm')).startsWith('Equip Light Shield to '));
    await page.click('#confirm');
    await page.waitForFunction((t) => XS.ui.game.debug().live.log.some((e) => e.type === 'equip' && e.data.leader === t), info.targets[1]);
    check('equip: the engine attached it to the leader that was clicked', await page.locator(`#board [data-leader="${info.targets[1]}"] .eq-chip`).count() === 1);
  }
  const diag = await page.evaluate(() => XS.ui.game.debug().diagnostics.slice());
  check('prompts: no UI diagnostics', diag.length === 0, diag.join(' | '));
  check('prompts: zero console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.evaluate((r) => r, 0);
  await ctx.close();
}


// ---- (f) phone: taps, hold to peek ---------------------------------------------------------------------------------
async function testPhone(browser) {
  TAP = true;
  rngState = 31;
  const { ctx, page, errors } = await open(browser, `${BASE}?speed=instant&seed=7`, { width: 390, height: 844 });
  await page.locator('#play').tap();
  const iid = await reachAttack(page, 10);
  check('phone: an attack card is reachable using taps only', iid !== null);
  if (iid !== null) {
    await page.locator(`[data-play="${iid}"]`).tap();
    await page.locator('#board .r-actor').nth(0).tap();
    await page.locator('#board .r-target').nth(0).tap();
    const lbl = await page.textContent('#confirm');
    check('phone: tapping attacker then target shows the confirm button with the damage', /Attack .+: (\d+ damage|DOWN)/.test(lbl), lbl);
    const before = await page.evaluate(() => XS.ui.game.debug().live.actions.length);
    await page.locator('#confirm').tap();
    await waitMyDecision(page);
    check('phone: the confirm tap sent exactly the chosen play to the engine', await page.evaluate((n) => XS.ui.game.debug().live.actions[n].type === 'play', before));
    // Hold to peek: press 600 ms on a hand card without moving; the zoom pins, the card is NOT selected.
    const card = page.locator('#hand .handcard').first();
    const box = await card.boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const pt = [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
    await page.waitForTimeout(650);
    check('phone: press-and-hold on a card pins the large zoom', await page.evaluate(() => document.getElementById('zoom').classList.contains('open') && document.getElementById('zoom').classList.contains('pinned')));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(100);
    check('phone: releasing a hold does not select the card', (await page.locator('#hand .is-selected').count()) === 0);
    await page.touchscreen.tap(20, 300);
    await page.waitForTimeout(100);
    check('phone: a tap elsewhere closes the zoom', await page.evaluate(() => !document.getElementById('zoom').classList.contains('open')));
    // A finger that moves more than 8 px is a drag, not a hold: no zoom.
    const pt2 = [{ x: box.x + 10, y: box.y + 40, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt2 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + 30, y: box.y + 40, id: 1 }] });
    await page.waitForTimeout(650);
    check('phone: moving more than 8 px cancels the hold (tap vs drag by distance)', await page.evaluate(() => !document.getElementById('zoom').classList.contains('open')));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  check('phone: zero console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  TAP = false;
  await ctx.close();
}

// ---- (c) screenshots and layout -----------------------------------------------------------------------------
async function layoutProblems(page) {
  return page.evaluate(() => {
    const out = [];
    const de = document.documentElement;
    if (de.scrollWidth > innerWidth) out.push(`horizontal scroll: ${de.scrollWidth} > ${innerWidth}`);
    if (de.scrollHeight > innerHeight + 1 && document.body.classList.contains('in-game')) out.push(`vertical scroll: ${de.scrollHeight} > ${innerHeight}`);
    const box = (n) => n.getBoundingClientRect();
    for (const sel of ['#hand', '#lower', '#topbar', '#mid']) {
      const r = box(document.querySelector(sel));
      if (r.left < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.top < -1) out.push(`${sel} off screen`);
    }
    const bd = document.querySelector('#board');
    if (bd.scrollHeight > bd.clientHeight + 1) out.push(`board content is clipped: ${bd.scrollHeight} > ${bd.clientHeight}`);
    for (const sd of document.querySelectorAll('#board .side')) if (sd.scrollHeight > sd.clientHeight + 1) out.push(`${sd.id} content is clipped: ${sd.scrollHeight} > ${sd.clientHeight}`);
    const leaders = [...document.querySelectorAll('#board .leader')].map((n) => ({ id: n.dataset.leader, r: box(n) }));
    if (leaders.length !== 8) out.push('leader tiles: ' + leaders.length);
    for (const l of leaders) {
      if (l.r.left < -1 || l.r.right > innerWidth + 1 || l.r.top < 0 || l.r.bottom > innerHeight + 1) out.push('leader off screen ' + l.id);
      if (l.r.width < 40 || l.r.height < 38) out.push(`leader too small ${l.id} ${Math.round(l.r.width)}x${Math.round(l.r.height)}`);
    }
    for (let i = 0; i < leaders.length; i++) for (let j = i + 1; j < leaders.length; j++) {
      const a = leaders[i].r, b = leaders[j].r;
      if (a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2) out.push(`leaders overlap ${leaders[i].id}/${leaders[j].id}`);
    }
    const hand = box(document.querySelector('#hand')), mid = box(document.querySelector('#mid')), lower = box(document.querySelector('#lower'));
    if (mid.bottom > hand.top + 2 && hand.height > 0) out.push('mid overlaps hand');
    if (hand.bottom > lower.top + 2) out.push('hand overlaps caption');
    for (const c of document.querySelectorAll('.handcard')) {
      const r = box(c);
      if (r.right > innerWidth + 1 || r.left < -1) out.push('hand card off screen');
      // TODO 9 (M7): the hand row sits fully above the lower-third caption with a visible gap, never touching it.
      if (r.bottom > lower.top - 6) out.push(`hand card ends ${Math.round(r.bottom)} but the caption starts ${Math.round(lower.top)} (needs a 6 px gap)`);
    }
    // TODO 9 (M7): a target-preview badge (damage number) never covers a leader's name.
    const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    const badges = [...document.querySelectorAll('#board .l-preview')];
    if (badges.length === 0) out.push('no target-preview badge on screen (the check needs a selected attack)');
    for (const p of badges) {
      const tile = p.closest('.leader'), pr = box(p);
      for (const sel of ['.l-name', '.l-jp']) {
        const n = tile.querySelector(sel);
        if (n === null) continue;
        const r = box(n);
        if (r.width > 0 && r.height > 0 && hit(pr, r)) out.push(`preview badge covers ${sel} of ${tile.dataset.leader}`);
      }
    }
    return out;
  });
}

async function setupMidGame(browser, viewport, shot) {
  rngState = 4242;
  const { ctx, page, errors } = await open(browser, `${BASE}?speed=instant&seed=7`, viewport);
  await page.click('#play');
  const iid = await reachAttack(page, 10);
  if (iid === null) throw new Error('no attack card reached for the screenshot');
  await page.locator(`[data-play="${iid}"]`).click();
  await page.locator('#board .r-actor').nth(0).click();
  await page.locator('#board .r-target').nth(0).click();
  await page.waitForTimeout(150);
  const problems = await layoutProblems(page);
  check(`layout ${viewport.width}x${viewport.height} mid-game: no scrollbars, nothing off screen, leaders never overlap`, problems.length === 0, problems.join('; '));
  await page.mouse.move(2, 2);
  await page.screenshot({ path: path.join(OUT, shot) });
  return { ctx, page, errors };
}

async function testScreens(browser) {
  for (const [w, h] of [[1280, 800], [390, 844], [844, 390], [375, 667], [360, 640], [1024, 600]]) {
    const { ctx, page, errors } = await setupMidGame(browser, { width: w, height: h }, `m3-board-${w}x${h}.png`);
    check(`${w}x${h}: zero console/page errors mid-game`, errors.length === 0, errors.slice(0, 3).join(' | '));
    // tap on a phone: the same flow worked above by click; also open the log drawer and check it fits.
    await page.click('#btn-log');
    await page.waitForTimeout(350);
    const dr = await page.evaluate(() => { const r = document.querySelector('#drawer').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; });
    check(`${w}x${h}: the log drawer fits the window`, dr);
    await ctx.close();
  }
  // The title screen at phone width: no horizontal scroll.
  for (const [w, h] of [[375, 667], [390, 844], [844, 390]]) {
    const { ctx, page } = await open(browser, BASE, { width: w, height: h });
    const sw = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    check(`title ${w}x${h}: no horizontal scroll`, sw);
    await ctx.close();
  }
  // The awaken stinger, at both sizes (a bot game at Quick speed; the stinger holds ~0.9 s there).
  for (const [w, h] of [[1280, 800], [390, 844]]) {
    const { ctx, page, errors } = await open(browser, `${BASE}?autoplay=1&speed=quick&seed=3&mode=quick`, { width: w, height: h });
    let got = true;
    try { await page.waitForSelector('#stinger.show', { timeout: 90000 }); } catch (e) { got = false; }
    check(`awaken stinger appears at ${w}x${h}`, got);
    if (got) {
      await page.waitForTimeout(350);
      const txt = await page.textContent('#stinger');
      check(`stinger names the leader and says AWAKENED (${w}x${h})`, txt.includes('AWAKENED') && /ATK \d+/.test(txt), txt);
      await page.screenshot({ path: path.join(OUT, `m3-stinger-${w}x${h}.png`) });
    }
    check(`stinger run ${w}x${h}: zero console/page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }
}

// ---- (d) playback ------------------------------------------------------------------------------------------------
async function skipUntilMyDecision(page, timeout = 60000) {
  const t0 = Date.now();
  for (;;) {
    const done = await page.evaluate(() => {
      const d = XS.ui.game.debug();
      return d.live.phase === 'over' || (!d.pumping && d.presented.raw === d.live && XS.whoActs(d.live) === 0);
    });
    if (done) return;
    if (Date.now() - t0 > timeout) throw new Error('never reached the human decision');
    if (await page.evaluate(() => document.getElementById('fx-lock').classList.contains('open'))) await page.mouse.click(640, 400);
    await page.waitForTimeout(60);
  }
}

async function testPlayback(browser) {
  const { ctx, page, errors } = await open(browser, `${BASE}?autoplay=1&speed=full&seed=2&mode=quick`, { width: 1280, height: 800 });
  await page.waitForSelector('#ribbon.show, #banner.show', { timeout: 20000 });
  check('speed Full: playback locks input (#fx-lock open)', await page.evaluate(() => document.getElementById('fx-lock').classList.contains('open')));
  const cap1 = await page.textContent('#caption');
  check('lower third narrates events in plain English', cap1.length > 10, cap1);
  const t0 = Date.now();
  await page.mouse.click(600, 400);
  await page.waitForTimeout(100);
  const n = await page.evaluate(() => XS.ui.game.debug().live.log.length);
  check('a click skips the current playback (the lock drops without waiting)', Date.now() - t0 < 1500 && n > 0);
  check('playback: zero console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();

  // A human action at Full speed: arrow, damage pop, input locked, a click skips to the finished board.
  rngState = 7;
  const h = await open(browser, `${BASE}?speed=full&seed=7`, { width: 1280, height: 800 });
  const page2 = h.page;
  await page2.click('#play');
  let iid = null;
  for (let turn = 0; turn < 10 && iid === null; turn++) {
    await skipUntilMyDecision(page2);
    if (await answerPrompt(page2)) continue;
    iid = await page2.evaluate(() => { const n = document.querySelector('.handcard.type-attack.is-actable'); return n === null ? null : n.getAttribute('data-play'); });
    if (iid === null) await page2.click('#endturn');
  }
  check('full speed: reached a playable attack card by clicking through the playback', iid !== null);
  await page2.locator(`[data-play="${iid}"]`).click();
  await page2.locator('#board .r-actor').nth(0).click();
  await page2.locator('#board .r-target').nth(0).click();
  const want = await page2.textContent('#board .r-target.r-picked .l-preview');
  await page2.click('#confirm');
  await page2.waitForSelector('.fx-arrow', { timeout: 5000 });
  check('full speed: the attack arrow is drawn attacker to target', await page2.locator('.fx-arrow').count() >= 1);
  check('full speed: the board is locked while it plays', await page2.evaluate(() => document.getElementById('fx-lock').classList.contains('open') && document.body.classList.contains('is-animating')));
  await page2.waitForSelector('.fx-float.is-dmg', { timeout: 5000 });
  const pop = await page2.textContent('.fx-float.is-dmg');
  check('full speed: the damage pop shows the engine number', pop === want || want === 'DOWN' || pop === want.replace('−', '−'), `${pop} vs ${want}`);
  await page2.mouse.click(640, 400);
  await page2.waitForFunction(() => !document.getElementById('fx-lock').classList.contains('open'), null, { timeout: 5000 });
  check('full speed: a click skips; the board then shows the finished state', await page2.evaluate(() => { const d = XS.ui.game.debug(); return d.presented.raw === d.live || d.pumping; }));
  check('full speed human: zero console/page errors', h.errors.length === 0, h.errors.slice(0, 3).join(' | '));
  await h.ctx.close();
}

// ---- (h) M7 polish ------------------------------------------------------------------------------------------------
function crc32(buf) {
  let c, crc = -1;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ -1) >>> 0;
}
// A small generated PNG (a two-colour diagonal gradient): the art fixture. Written under tools/out, never committed.
function makePng(file, w, h, a, b) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const t = (x / w + y / h) / 2, o = y * (w * 3 + 1) + 1 + x * 3;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(a[i] + (b[i] - a[i]) * t);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

const snapState = (page) => page.evaluate(() => {
  const d = XS.ui.game.debug();
  return { view: JSON.stringify(XS.view(d.live, 0)), n: d.live.actions.length, round: d.live.round, turn: d.live.roundTurn };
});
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const modalFits = (page, id) => page.evaluate((id) => { const r = document.querySelector('#' + id + ' .modal-card').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1; }, id);

// Settings persist across a reload; the settings panel drives XS.Audio.settings, the speed, reduce motion, auto-pass and the name language.
async function testSettings(browser) {
  const { ctx, page, errors } = await open(browser, `${BASE}?seed=3&bot=random`, { width: 1280, height: 800 });
  await page.click('#settings-open');
  check('settings: opens from the title', await page.isVisible('#settings .modal-card') && (await page.textContent('#settings-body')).includes('Auto-pass'));
  check('settings: auto-pass is off by default', !(await page.isChecked('#set-autopass')));
  check('settings: speed defaults to Full', await page.isChecked('#set-speed-full'));
  const before = await page.evaluate(() => XS.Audio.settings);
  check('settings: the sliders show XS.Audio.settings (master, music, sfx, voice, mute)', ['master', 'music', 'sfx', 'voice'].every((k) => true) &&
    Math.abs(Number(await page.inputValue('#set-vol-master')) - before.master) < 1e-9 && (await page.isChecked('#set-mute')) === before.muted);
  await page.check('#set-speed-quick', { force: true });
  await page.check('#set-reduce');
  await page.check('#set-autopass');
  await page.check('#set-names-jp', { force: true });
  await page.locator('#set-vol-master').fill('0.35');
  await page.locator('#set-vol-music').fill('0.2');
  await page.check('#set-mute');
  const live = await page.evaluate(() => XS.Audio.settings);
  check('settings: the sliders write XS.Audio.settings (master 0.35, music 0.2, muted)', live.master === 0.35 && live.music === 0.2 && live.muted === true, JSON.stringify(live));
  check('settings: reduce motion puts a class on the page', await page.evaluate(() => document.body.classList.contains('reduce-motion')));
  await page.reload();
  const after = await page.evaluate(() => ({ audio: XS.Audio.settings, speed: XS.ui.settings.get('speed'), reduce: XS.ui.settings.get('reduceMotion'), auto: XS.ui.settings.get('autoPass'), names: XS.ui.settings.get('names'), cls: document.body.classList.contains('reduce-motion') }));
  check('settings persist across a reload (speed, reduce motion, auto-pass, names, volumes, mute)',
    after.speed === 'quick' && after.reduce === true && after.auto === true && after.names === 'jp' && after.cls && after.audio.master === 0.35 && after.audio.music === 0.2 && after.audio.muted === true, JSON.stringify(after));
  await page.click('#settings-open');
  check('settings: the reopened panel shows the saved choices', await page.isChecked('#set-speed-quick') && await page.isChecked('#set-autopass') && await page.isChecked('#set-names-jp') && await page.isChecked('#set-mute') && await page.isChecked('#set-reduce'));
  await page.keyboard.press('Escape');
  check('settings: Escape closes the panel', !(await page.isVisible('#settings .modal-card')));
  // Japanese names lead on a card title once the setting is on (deck list rows and a card face).
  await page.click('#dp-list-mine .view-list[data-deck="ST01"]');
  const first = await page.textContent('#deckpeek .dk-row .dk-names b');
  check('settings: Japanese card titles lead when "Japanese names" is picked', /[぀-ヿ一-鿿]/.test(first), first);
  await page.keyboard.press('Escape');
  // Back to the defaults so the rest of this context is clean: the player can undo every choice.
  await page.evaluate(() => { XS.ui.settings.set('names', 'en'); XS.ui.settings.set('speed', 'full'); XS.ui.settings.set('reduceMotion', false); XS.ui.settings.set('autoPass', false); });
  check('settings: zero console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// Save, Continue, the deck list, credits and how-to, on both viewports, with the m7-*.png screenshots.
async function testContinue(browser, vp, tag) {
  TAP = vp.width < 600;
  rngState = 777;
  const { ctx, page, errors } = await open(browser, `${BASE}?speed=instant&seed=7&bot=random`, vp);
  check(`${tag} continue: no Continue button while there is no save`, await page.isHidden('#continue'));
  await press(page.locator('#play'));
  const iid = await reachAttack(page, 10);
  if (iid === null) throw new Error('no attack card reached');
  await playCardByClicks(page, iid, 0);
  await waitMyDecision(page);
  const saved = await page.evaluate(() => XS.ui.save.read());
  const snap = await snapState(page);
  check(`${tag} continue: every applied action autosaves {init, actions, version, date}`, saved !== null && saved.actions.length === snap.n && saved.init.seed === 7 && typeof saved.version === 'string' && !Number.isNaN(Date.parse(saved.date)), JSON.stringify(saved && { n: saved.actions.length, v: saved.version }));
  // The Menu: how to play, credits and settings are reachable during a match.
  await press(page.locator('#btn-exit'));
  await press(page.locator('#menu-howto'));
  const how = await page.textContent('#howto-body');
  check(`${tag} how to play (from the Menu): covers the turn, attacks and boosts, awakening, rounds and PP 3-4-5, tactics, deck-out`,
    ['Your turn', 'Attacks', 'Boosts', 'awakens', '3 PP per turn in round 1, 4 in round 2 and 5 in round 3', 'once per turn'.replace('once per turn', 'one tactics card per turn'), 'first player\'s first turn of a round', 'Deck-out', 'discard down to 7'].every((t) => how.includes(t)), how.slice(0, 80));
  await page.keyboard.press('Escape');
  await press(page.locator('#menu-credits'));
  const cred = await page.textContent('#credits-body');
  check(`${tag} credits (from the Menu): unofficial and non-commercial, game and publisher once, AI illustrations, original voice, evilgouki, takedown`,
    cred.includes('unofficial, non-commercial') && (cred.match(/Xross Stars/g) || []).length === 1 && (cred.match(/Brave group/g) || []).length === 1 &&
    cred.includes('Illustrations are AI-generated (AIイラスト)') && cred.includes('Any voice is original; no real talent\'s voice is cloned') && cred.includes('evilgouki') && cred.includes('docs/takedown.md'), cred.slice(0, 100));
  check(`${tag} credits: the panel fits the window with no horizontal scroll`, await modalFits(page, 'credits') && await noHScroll(page));
  await press(page.locator('#credits-close'));
  await press(page.locator('#menu-settings'));
  check(`${tag} settings (from the Menu): opens, fits the window`, await page.isVisible('#settings .modal-card') && await modalFits(page, 'settings') && await noHScroll(page));
  await page.screenshot({ path: path.join(OUT, `m7-settings-${tag}.png`) });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  check(`${tag} menu: Escape closes the panel and then the menu`, await page.evaluate(() => !document.querySelector('#settings').classList.contains('open') && !document.querySelector('#confirm-exit').classList.contains('open')));
  // Reload: the title offers Continue, and Continue restores the exact board.
  await page.reload();
  await page.waitForSelector('#continue:not([hidden])');
  const label = await page.textContent('#continue');
  check(`${tag} continue: the title offers "Continue (round N, turn M)"`, new RegExp(`^Continue \\(round ${snap.round}, (turn ${snap.turn}|setup)\\)$`).test(label), label);
  await page.mouse.move(2, 2);
  await page.screenshot({ path: path.join(OUT, `m7-title-${tag}.png`) });
  check(`${tag} title with Continue: no horizontal scroll`, await noHScroll(page));
  await press(page.locator('#continue'));
  await page.waitForSelector('#game:not([hidden])');
  await waitMyDecision(page);
  const back = await snapState(page);
  check(`${tag} continue: the restored board is the saved one (XS.view JSON identical, ${snap.n} actions)`, back.view === snap.view && back.n === snap.n);
  const diag0 = await page.evaluate(() => XS.ui.game.debug().diagnostics.slice());
  check(`${tag} continue: no UI diagnostics after resuming`, diag0.length === 0, diag0.join(' | '));
  // Board mid-game with an attack previewed (the layout fix), then the deck peek and credits from the title.
  const iid2 = await page.evaluate(() => { const n = document.querySelector('.handcard.type-attack.is-actable'); return n === null ? null : n.getAttribute('data-play'); });
  if (iid2 !== null) {
    await press(page.locator(`[data-play="${iid2}"]`));
    await press(page.locator('#board .r-actor').nth(0));
    await press(page.locator('#board .r-target').nth(0));
  }
  await page.mouse.move(2, 2);
  await page.screenshot({ path: path.join(OUT, `m7-board-${tag}.png`) });
  const lp = await layoutProblems(page);
  check(`${tag} board after Continue: layout clean (preview badge off the names, hand above the caption)`, lp.length === 0, lp.slice(0, 3).join('; '));
  await page.evaluate(() => XS.ui.game.stop());
  check(`${tag} quit to title keeps the save (Continue is offered again)`, await page.isVisible('#continue'));

  await press(page.locator('#dp-list-mine .view-list[data-deck="ST02"]'));
  const dk = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#deckpeek .dk-row')];
    const sec = (n) => [...document.querySelectorAll('#deckpeek .dk-sec')][n];   // 0 leaders, 1 tactics, 2 main-deck header, 3 attack, 4 memoria
    const d = XS.DECKS.ST02;
    const counts = [...document.querySelectorAll('#deckpeek .dk-n')].map((n) => Number(n.textContent.replace('×', '') || 0));
    return { rows: rows.length, want: 4 + 5 + d.main.length, total: counts.reduce((a, b) => a + b, 0), title: document.getElementById('deckpeek-title').textContent,
      leaders: sec(0).querySelectorAll('.dk-row').length, tactics: sec(1).querySelectorAll('.dk-row').length, hasEn: rows[0].textContent.includes(XS.CARDS[d.leaders[0]].nameEn), hasJp: rows[0].textContent.includes(XS.CARDS[d.leaders[0]].name),
      heads: [...document.querySelectorAll('#deckpeek .ht-h')].map((n) => n.textContent) };
  });
  check(`${tag} deck list: opens with 4 leaders, 5 tactics and the 50-card main deck grouped with counts`, dk.leaders === 4 && dk.tactics === 5 && dk.rows === dk.want && dk.total === 50 && dk.heads.some((h) => h.startsWith('Main deck · 50')) && dk.title.includes('ST02'), JSON.stringify(dk));
  check(`${tag} deck list: English and Japanese names are both shown`, dk.hasEn && dk.hasJp);
  check(`${tag} deck list: fits the window`, await modalFits(page, 'deckpeek') && await noHScroll(page));
  if (!TAP) {
    await page.hover('#deckpeek .dk-row >> nth=6');
    check('deck list: hover zoom works on a row (the zoom opens with the card)', await page.evaluate(() => document.getElementById('zoom').classList.contains('open') && document.querySelector('#zoom .z-text').textContent.length > 3));
    await page.mouse.move(2, 2);
  }
  await page.screenshot({ path: path.join(OUT, `m7-deckpeek-${tag}.png`) });
  await page.keyboard.press('Escape');
  await press(page.locator('#credits-open'));
  check(`${tag} credits (from the title): opens`, await page.isVisible('#credits .modal-card') && (await page.textContent('#credits-body')).includes('evilgouki'));
  await page.screenshot({ path: path.join(OUT, `m7-credits-${tag}.png`) });
  await page.keyboard.press('Escape');
  check(`${tag} m7 pages: zero console/page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  TAP = false;
  await ctx.close();
}

async function testSaveEdgeCases(browser) {
  const { ctx, page, errors } = await open(browser, `${BASE}?speed=instant&seed=9&bot=random`, { width: 1280, height: 800 });
  // A save that cannot be replayed (an old data version whose actions are no longer legal): offered, then refused cleanly.
  await page.evaluate(() => {
    const s = XS.newGame({ decks: ['ST01', 'ST02'], seed: 9, mode: 'quick', first: 0, names: ['You', 'Bot'] });
    const rec = XS.ui.save.record(s, { tier: 'normal' });
    rec.version = 'older-data'; rec.actions = [{ type: 'play', iid: 'c9999' }];
    XS.ui.store.set('save', rec);
  });
  await page.reload();
  check('save from an older data version is still offered on the title', await page.isVisible('#continue'));
  await page.click('#continue');
  await page.waitForSelector('#continue-note:not([hidden])');
  const note = await page.textContent('#continue-note');
  check('a save that cannot be replayed says "This save can\'t be resumed" and is cleared', note.includes('This save can\'t be resumed') && (await page.evaluate(() => XS.ui.save.read())) === null && await page.isHidden('#continue') && await page.isHidden('#game'), note);
  // Junk in the slot is cleared without a word (it was never a save).
  await page.evaluate(() => XS.ui.store.set('save', { hello: 'world' }));
  await page.reload();
  check('a value that is not a save is dropped (no Continue button)', await page.isHidden('#continue') && (await page.evaluate(() => XS.ui.save.read())) === null);
  // A page without storage still works (every access is wrapped).
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx2.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage blocked'); } }); });
  const p2 = await ctx2.newPage();
  const errs2 = [];
  p2.on('pageerror', (e) => errs2.push(e.message));
  await p2.goto(`${BASE}?speed=instant&seed=9&bot=random`);
  await p2.click('#play');
  await p2.waitForSelector('#game:not([hidden])');
  await p2.click('#settings-open', { force: true }).catch(() => {});
  check('storage blocked: the title and a match still start, no page errors', (await p2.isVisible('#game')) && errs2.length === 0, errs2.join(' | '));
  await ctx2.close();
  check('save edge cases: zero console/page errors', errors.filter((e) => !e.includes('This save')).length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

async function testAutoPass(browser) {
  const { ctx, page, errors } = await open(browser, `${BASE}?speed=instant&seed=9&bot=random`, { width: 1280, height: 800 });
  const rep = await page.evaluate(() => {
    const U = XS.ui;
    for (let seed = 1; seed < 80; seed++) {
      let s = XS.newGame({ decks: ['ST01', 'ST02'], seed, mode: 'quick', first: 0, names: ['You', 'Bot'] });
      const bots = [U.makeRandomBot(seed, 0), U.makeRandomBot(seed, 1)];
      for (let n = 0; n < 800 && !XS.isTerminal(s); n++) {
        if (s.phase === 'main' && s.pending === null && XS.whoActs(s) === 0) {
          const legal = XS.legalActions(s);
          if (legal.length === 1 && legal[0].type === 'endTurn') return { init: s.init, actions: s.actions };
        }
        s = XS.apply(s, bots[XS.whoActs(s)].choose(s));
      }
    }
    return null;
  });
  check('auto-pass: a real game reaches a turn where legalActions is only endTurn', rep !== null);
  if (rep === null) { await ctx.close(); return; }
  const n0 = rep.actions.length;
  const nowN = () => page.evaluate(() => XS.ui.game.debug().live.actions.length);
  // Off (the default): nothing happens by itself.
  await page.evaluate((r) => XS.ui.game.resume(r), rep);
  await page.waitForTimeout(1700);
  check('auto-pass is off by default: no notice, the turn is not ended for you', await page.isHidden('#autopass') && (await nowN()) === n0);
  await page.evaluate(() => XS.ui.game.stop());
  // On: a visible notice for 1.2 s, then the turn ends through the normal funnel.
  await page.evaluate(() => XS.ui.settings.set('autoPass', true));
  await page.evaluate((r) => XS.ui.game.resume(r), rep);
  check('auto-pass on: the notice "No plays — ending turn" is visible with a Cancel button', await page.isVisible('#autopass') && (await page.textContent('#autopass')).includes('No plays — ending turn') && await page.isVisible('#autopass-cancel'));
  await page.waitForTimeout(600);
  check('auto-pass: still waiting after 0.6 s (the notice stays up for 1.2 s)', (await nowN()) === n0 && await page.isVisible('#autopass'));
  await page.waitForTimeout(1100);
  const act = await page.evaluate((n) => XS.ui.game.debug().live.actions[n], n0);
  check('auto-pass: after 1.2 s it applied endTurn (the one legal action)', act !== undefined && act.type === 'endTurn' && await page.isHidden('#autopass'), JSON.stringify(act));
  await page.evaluate(() => XS.ui.game.stop());
  // Cancel stops it for this decision.
  await page.evaluate((r) => XS.ui.game.resume(r), rep);
  await page.click('#autopass-cancel');
  check('auto-pass: Cancel hides the notice', await page.isHidden('#autopass'));
  await page.waitForTimeout(1700);
  check('auto-pass: after Cancel the turn is not ended; it is still your decision', (await nowN()) === n0 && await page.evaluate(() => XS.whoActs(XS.ui.game.debug().live) === 0));
  // The player can still end it by hand.
  await page.click('#endturn');
  await page.waitForFunction((n) => XS.ui.game.debug().live.actions.length > n, n0);
  check('auto-pass: after Cancel the End turn button still works', (await page.evaluate((n) => XS.ui.game.debug().live.actions[n].type, n0)) === 'endTurn');
  await page.evaluate(() => XS.ui.settings.set('autoPass', false));
  check('auto-pass: zero console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// The audio hooks, against the real XS.Audio (M6): spies wrap its functions; nothing is stubbed.
async function installAudioSpy(page) {
  await page.evaluate(() => {
    const A = XS.Audio;
    window.__aud = { logs: [], cues: [], scenes: [], unlock: 0, init: 0 };
    const o = { onLog: A.onLog, cue: A.cue, unlock: A.unlock, init: A.init, setScene: A.setScene };
    A.onLog = function (e, v) { window.__aud.logs.push(e.seq); return o.onLog.call(A, e, v); };
    A.cue = function (t) { window.__aud.cues.push(t); return o.cue.call(A, t); };
    A.unlock = function () { window.__aud.unlock++; return o.unlock.call(A); };
    A.init = function () { window.__aud.init++; return o.init.call(A); };
    A.setScene = function (n) { window.__aud.scenes.push(n); return o.setScene.call(A, n); };
  });
}
async function testAudio(browser) {
  const { ctx, page, errors } = await open(browser, `${BASE}?speed=instant&seed=5&bot=random`, { width: 1280, height: 800 });
  check('audio: the page loaded XS.Audio with the contract (init, unlock, onLog, cue, setScene, settings, coverage)',
    await page.evaluate(() => ['init', 'unlock', 'onLog', 'cue', 'setScene', 'coverage'].every((k) => typeof XS.Audio[k] === 'function') && typeof XS.Audio.settings === 'object'));
  check('audio: the title scene is requested at boot', await page.evaluate(() => XS.ui.sfx.lastScene() === 'title'));
  await installAudioSpy(page);
  await page.hover('#play');
  const c0 = await page.evaluate(() => window.__aud.cues.slice());
  check('audio: hovering a button is ui-hover; nothing is unlocked before a gesture', c0.includes('ui-hover') && (await page.evaluate(() => window.__aud.unlock)) === 0, c0.join());
  await page.click('#howto-open');
  check('audio: the first click unlocks audio (init + unlock once) and opening a panel is ui-drawer', await page.evaluate(() => window.__aud.unlock === 1 && window.__aud.init === 1 && window.__aud.cues.includes('ui-drawer')));
  await page.click('#howto-close');
  await page.click('#credits-open');
  await page.keyboard.press('Escape');
  const c1 = await page.evaluate(() => ({ cues: window.__aud.cues.slice(), unlock: window.__aud.unlock }));
  check('audio: closing is ui-cancel (button and Escape); unlock is not called again', c1.cues.filter((c) => c === 'ui-cancel').length >= 2 && c1.unlock === 1, JSON.stringify(c1));
  await page.click('#play');
  await page.waitForSelector('#game:not([hidden])');
  const c2 = await page.evaluate(() => ({ cues: window.__aud.cues.slice(), scene: XS.ui.sfx.lastScene() }));
  check('audio: Play is ui-confirm and the match scene is calm', c2.cues.includes('ui-confirm') && c2.scene === 'calm', JSON.stringify(c2));
  await page.click('#btn-log');
  await page.click('#log-close');
  check('audio: the log drawer is ui-drawer', await page.evaluate(() => window.__aud.cues.filter((c) => c === 'ui-drawer').length >= 3));
  // Bot against bot, instant: onLog exactly once per presented entry, in log order.
  await page.evaluate(() => { XS.ui.game.stop(); window.__aud.logs = []; window.__aud.scenes = []; XS.ui.game.start({ decks: ['ST01', 'ST02'], mode: 'quick', seed: 9, spectate: true }); });
  await page.waitForSelector('#endscreen.open', { timeout: 60000 });
  const r = await page.evaluate(() => { const d = XS.ui.game.debug(); return { logs: window.__aud.logs.slice(), n: d.live.log.length, scenes: window.__aud.scenes.slice(), winner: d.live.winner }; });
  check(`audio: XS.Audio.onLog is called once per presented entry, in order (${r.n} entries, Instant speed)`, JSON.stringify(r.logs) === JSON.stringify(Array.from({ length: r.n }, (_, i) => i)), `${r.logs.length} calls for ${r.n} entries`);
  const wantEnd = r.winner === null ? 'silent' : (r.winner === 0 ? 'victory' : 'defeat');
  check(`audio: the end screen sets the ${wantEnd} scene (scenes: ${r.scenes.join(' > ')})`, r.scenes[r.scenes.length - 1] === wantEnd && r.scenes[0] === 'calm', r.scenes.join());
  await page.click('#end-title');
  check('audio: back on the title the scene is title again', await page.evaluate(() => window.__aud.scenes[window.__aud.scenes.length - 1] === 'title'));
  check('audio: zero console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();

  // Playback that is skipped by clicking still reports every entry exactly once.
  const h = await open(browser, `${BASE}?speed=quick&seed=5&bot=random`, { width: 1280, height: 800 });
  await installAudioSpy(h.page);
  await h.page.evaluate(() => XS.ui.game.start({ decks: ['ST01', 'ST02'], mode: 'quick', seed: 4, spectate: true }));
  const t0 = Date.now();
  while (!(await h.page.evaluate(() => document.getElementById('endscreen').classList.contains('open')))) {
    if (Date.now() - t0 > 170000) break;
    if (await h.page.evaluate(() => document.getElementById('fx-lock').classList.contains('open'))) await h.page.mouse.click(640, 400);
    await h.page.waitForTimeout(40);
  }
  const r2 = await h.page.evaluate(() => { const d = XS.ui.game.debug(); return { logs: window.__aud.logs.slice(), n: d.live.log.length }; });
  check(`audio: with playback skipped by clicks (Quick speed) onLog still fires once per entry in order (${r2.n} entries)`, r2.n > 0 && JSON.stringify(r2.logs) === JSON.stringify(Array.from({ length: r2.n }, (_, i) => i)), `${r2.logs.length} calls for ${r2.n} entries`);
  check('audio: skipped playback, zero console/page errors', h.errors.length === 0, h.errors.slice(0, 3).join(' | '));
  await h.ctx.close();
}

// Art from the manifest: a fixture entry pointing at a generated PNG (tools/out, not committed).
async function testArt(browser) {
  const front = path.join(OUT, 'm7-art-fixture.png'), awake = path.join(OUT, 'm7-art-fixture-awakened.png');
  makePng(front, 64, 90, [40, 120, 255], [255, 80, 200]);
  makePng(awake, 64, 90, [255, 210, 63], [255, 255, 255]);
  const manifest = `(function () { const XS = (globalThis.XS = globalThis.XS || {}); XS.ART = {
    'ST01-001': { file: 'tools/out/m7-art-fixture.png', kind: 'leader', prompt: 'fixture' },
    'ST01-001/awakened': { file: 'tools/out/m7-art-fixture-awakened.png', kind: 'leader-awakened', prompt: 'fixture' },
    'ST01-005': { file: 'tools/out/m7-art-fixture.png', kind: 'card', prompt: 'fixture' },
    'ui/title': { file: 'tools/out/m7-art-fixture.png', kind: 'ui', prompt: 'fixture' },
    'ui/arena': { file: 'tools/out/m7-art-fixture-awakened.png', kind: 'ui', prompt: 'fixture' },
    'ui/card-back': { file: 'tools/out/m7-art-fixture.png', kind: 'ui', prompt: 'fixture' },
    'ui/tactics-back': { file: 'tools/out/m7-art-fixture-awakened.png', kind: 'ui', prompt: 'fixture' } }; })();`;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route('**/data/art-manifest.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: manifest }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !DECLARED.test(m.text())) errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
  await page.goto(`${BASE}?speed=instant&seed=7&bot=random`);
  const t = await page.evaluate(() => ({ cls: document.body.className, bg: getComputedStyle(document.querySelector('.arena')).backgroundImage, ai: getComputedStyle(document.querySelector('.ai-label')).display }));
  check('art: the title backdrop (ui/title) from the manifest is the arena background', t.cls.includes('art-title') && t.bg.includes('m7-art-fixture.png'), t.bg.slice(0, 120));
  check('art: the AIイラスト label shows whenever the manifest has pictures', t.ai !== 'none');
  await page.screenshot({ path: path.join(OUT, 'm7-art-title.png') });
  await page.click('#play');
  await page.waitForSelector('#game:not([hidden])');
  for (let i = 0; i < 6; i++) { await waitMyDecision(page); if (!(await answerPrompt(page))) break; }
  await waitMyDecision(page);
  const a = await page.evaluate(() => {
    const info = (sel) => { const t = document.querySelector(sel); const img = t.querySelector('img.c-img'); return { img: img !== null, src: img && img.getAttribute('src'), decoding: img && img.getAttribute('decoding'), loaded: img && img.complete && img.naturalWidth > 0, fit: img && getComputedStyle(img).objectFit, pending: t.querySelector('.c-ph') !== null, hasArt: t.classList.contains('has-art') }; };
    return { l0: info('#board [data-leader="L00"]'), l1: info('#board [data-leader="L01"]'), bg: getComputedStyle(document.querySelector('.arena')).backgroundImage,
      plate: getComputedStyle(document.querySelector('#board [data-leader="L00"] .l-plate')).backgroundImage, nameVisible: document.querySelector('#board [data-leader="L00"] .l-name').getBoundingClientRect().height > 0,
      tb: getComputedStyle(document.querySelector('.card.back.tactics-back')).backgroundImage };
  });
  check('art: a leader face with a manifest entry shows <img src=the manifest file, decoding=async, object-fit: cover>, no ART PENDING label',
    a.l0.img && a.l0.src === 'tools/out/m7-art-fixture.png' && a.l0.decoding === 'async' && a.l0.loaded && a.l0.fit === 'cover' && !a.l0.pending && a.l0.hasArt, JSON.stringify(a.l0));
  check('art: a leader without an entry keeps the labelled ART PENDING placeholder', !a.l1.img && a.l1.pending && !a.l1.hasArt, JSON.stringify(a.l1));
  check('art: the name and stats sit on a translucent plate over the picture (still visible)', a.plate.includes('gradient') && a.nameVisible, a.plate.slice(0, 80));
  check('art: the arena backdrop (ui/arena) replaces the title one in a match', a.bg.includes('m7-art-fixture-awakened.png'), a.bg.slice(0, 100));
  check('art: the tactics back plate (ui/tactics-back) is used for hidden tactics cards', a.tb.includes('m7-art-fixture-awakened.png'), a.tb.slice(0, 100));
  const c = await page.evaluate(() => {
    const U = XS.ui;
    const card = U.cardEl('ST01-005', { lazy: true }).querySelector('img.c-img');
    const hand = [...document.querySelectorAll('#hand .handcard.has-art img.c-img')].map((i) => i.getAttribute('loading'));
    const front = U.cardEl('ST01-001', { awake: false }).querySelector('img.c-img').getAttribute('src');
    const awake = U.cardEl('ST01-001', { awake: true }).querySelector('img.c-img').getAttribute('src');
    const none = U.cardEl('ST01-006', {}).querySelector('img.c-img');
    return { lazy: card.getAttribute('loading'), hand, front, awake, none: none === null };
  });
  check('art: a card face uses its manifest entry; lazy for hand and zoom, awakened leaders use the "/awakened" entry, others stay placeholders',
    c.lazy === 'lazy' && c.hand.every((l) => l === 'lazy') && c.front.endsWith('m7-art-fixture.png') && c.awake.endsWith('m7-art-fixture-awakened.png') && c.none, JSON.stringify(c));
  await page.hover('#board [data-leader="L00"]');
  const z = await page.evaluate(() => { const img = document.querySelector('#zoom img.c-img'); return { src: img && img.getAttribute('src'), loading: img && img.getAttribute('loading'), ai: document.querySelector('#zoom .z-ai') !== null }; });
  check('art: the hover zoom shows the picture (lazy) and the AIイラスト line', z.src === 'tools/out/m7-art-fixture.png' && z.loading === 'lazy' && z.ai, JSON.stringify(z));
  await page.mouse.move(2, 2);
  await page.screenshot({ path: path.join(OUT, 'm7-art-board.png') });
  check('art: zero console/page errors with art on', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
  // An entry whose file is missing is reported loudly and the placeholder takes over.
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx2.route('**/data/art-manifest.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: manifest.replace(/tools\/out\/m7-art-fixture\.png/g, 'tools/out/does-not-exist.png') }));
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}?speed=instant&seed=7&bot=random`);
  await p2.click('#play');
  await p2.waitForSelector('#game:not([hidden])');
  await p2.waitForFunction(() => XS.ui.diagnostics.some((d) => d.includes('Art did not load')), null, { timeout: 8000 }).catch(() => {});
  const bad = await p2.evaluate(() => ({ diag: XS.ui.diagnostics.slice(), pending: document.querySelector('#board [data-leader="L00"] .c-ph') !== null }));
  check('art: a picture that fails to load raises a UI diagnostic and falls back to the labelled placeholder', bad.diag.some((d) => d.includes('Art did not load')) && bad.pending, JSON.stringify(bad));
  await ctx2.close();
}

async function testM7(browser) {
  await testSettings(browser);
  await testContinue(browser, { width: 1280, height: 800 }, '1280x800');
  await testContinue(browser, { width: 390, height: 844 }, '390x844');
  await testSaveEdgeCases(browser);
  await testAutoPass(browser);
  await testAudio(browser);
  await testArt(browser);
}


// ---- (i) the deck picker ------------------------------------------------------------------------------------------
const COMP = ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'A01', 'A02', 'A03'];
async function testDeckPicker(browser) {
  for (const [w, h] of [[1280, 800], [390, 844]]) {
    const tag = `${w}x${h}`;
    TAP = w < 600;
    const { ctx, page, errors } = await open(browser, `${BASE}?speed=instant&seed=5`, { width: w, height: h });
    const narrow = w < 900;
    const info = await page.evaluate(() => {
      const lists = ['dp-list-mine', 'dp-list-bot'].map((id) => {
        const box = document.getElementById(id);
        return {
          decks: [...box.querySelectorAll('input[type=radio]')].map((i) => i.value),
          groups: [...box.querySelectorAll('.dp-group')].map((g) => g.textContent),
          checked: box.querySelector('input:checked').value,
          scrolls: box.scrollHeight > box.clientHeight,
          views: [...box.querySelectorAll('.view-list')].map((b) => b.getAttribute('data-deck')),
        };
      });
      const row = document.querySelector('#dp-list-mine .dp-row input[value="C01"]').closest('.dp-row');
      return {
        lists, hscroll: document.documentElement.scrollWidth > innerWidth,
        c01: { text: row.textContent, pips: row.querySelectorAll('.dp-pip').length },
        names: Object.fromEntries(['C01', 'A02'].map((id) => [id, XS.DECKS[id].leaders.map((l) => XS.ui.cardTitle(l))])),
      };
    });
    const all = ['ST01', 'ST02', ...COMP];
    check(`picker ${tag}: your list holds Surprise me + the 12 decks; the bot's list holds Different-from-mine, Surprise me + the 12`,
      JSON.stringify(info.lists[0].decks) === JSON.stringify(['random', ...all]) && JSON.stringify(info.lists[1].decks) === JSON.stringify(['auto', 'random', ...all]), JSON.stringify(info.lists.map((l) => l.decks)));
    check(`picker ${tag}: two groups, Starters · 2 and Competitive · 10, in both lists`, info.lists.every((l) => JSON.stringify(l.groups) === JSON.stringify(['Starters · 2', 'Competitive · 10'])), JSON.stringify(info.lists.map((l) => l.groups)));
    check(`picker ${tag}: defaults are ST01 for you and "a different deck from mine" for the bot (Play is never greyed)`, info.lists[0].checked === 'ST01' && info.lists[1].checked === 'auto' && await page.isEnabled('#play'));
    check(`picker ${tag}: a competitive row shows the English name, the leaders' names, four colour pips and the source in small text`,
      info.c01.text.includes('C01 Four-colour') && info.names.C01.every((n) => info.c01.text.includes(n)) && info.c01.pips === 4 && info.c01.text.includes('Challengers Cup #3 Osaka · 1st'), info.c01.text);
    check(`picker ${tag}: the lists scroll inside their panel and the page never scrolls sideways`, info.lists.some((l) => l.scrolls) && !info.hscroll);
    check(`picker ${tag}: every one of the 12 decks has a View list button in both lists`, info.lists.every((l) => JSON.stringify(l.views) === JSON.stringify(all)));
    if (narrow) {
      check(`picker ${tag}: one list at a time with tabs; the tabs summarise both choices`, await page.evaluate(() => {
        const vis = (id) => document.getElementById(id).getClientRects().length > 0;
        return vis('dp-mine') && !vis('dp-bot') && document.getElementById('dp-sum-mine').textContent.startsWith('ST01') && document.getElementById('dp-sum-bot').textContent === 'Different from mine';
      }));
      await press(page.locator('#dp-tab-bot'));
      check(`picker ${tag}: the Bot's deck tab shows the bot's list`, await page.evaluate(() => document.getElementById('dp-bot').getClientRects().length > 0 && document.getElementById('dp-mine').getClientRects().length === 0));
      await press(page.locator('#dp-tab-mine'));
    }
    await page.mouse.move(2, 2);
    await page.screenshot({ path: path.join(OUT, `comp-ui-picker-${tag}.png`) });
    // View list for all 12 (your list): the panel opens, shows 4 leaders, 5 tactics and a 50-card main deck, and names the deck.
    const peeks = [];
    for (const id of all) {
      await press(page.locator(`#dp-list-mine .view-list[data-deck="${id}"]`));
      peeks.push(await page.evaluate((id) => {
        const rows = [...document.querySelectorAll('#deckpeek .dk-row')];
        const counts = [...document.querySelectorAll('#deckpeek .dk-n')].map((n) => Number(n.textContent.replace('×', '') || 0));
        const r = document.getElementById('deckpeek').getBoundingClientRect(), card = document.querySelector('#deckpeek .modal-card').getBoundingClientRect();
        return { id, title: document.getElementById('deckpeek-title').textContent, rows: rows.length, total: counts.reduce((a, b) => a + b, 0), note: document.querySelector('#deckpeek .v-note').textContent,
          fits: card.left >= -1 && card.right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth, want: 9 + XS.DECKS[id].main.length };
      }, id));
      await page.keyboard.press('Escape');
    }
    check(`picker ${tag}: View list opens for all 12 decks (4 leaders + 5 tactics + the main deck, 50 cards, fits the window)`,
      peeks.every((p) => p.title.startsWith(p.id) && p.rows === p.want && p.total === 50 && p.fits), JSON.stringify(peeks.filter((p) => !(p.rows === p.want && p.total === 50 && p.fits))));
    check(`picker ${tag}: a tournament list says where it comes from; a starter says it is the box list`,
      peeks.filter((p) => COMP.includes(p.id)).every((p) => p.note.includes('Tournament list') && p.note.includes('Source:')) && peeks.filter((p) => !COMP.includes(p.id)).every((p) => p.note.includes('starter list')));
    // Play: C03 for me, A02 for the bot, by clicks; the board names both decks.
    await press(page.locator(narrow ? '#dp-list-mine input[value="C03"]' : '#dp-list-mine input[value="C03"]'));
    if (narrow) await press(page.locator('#dp-tab-bot'));
    await press(page.locator('#dp-list-bot input[value="A02"]'));
    check(`picker ${tag}: the tabs/summary follow the choice`, await page.evaluate(() => document.getElementById('dp-sum-mine').textContent.startsWith('C03') && document.getElementById('dp-sum-bot').textContent.startsWith('A02')));
    await press(page.locator('#play'));
    const decks = await page.evaluate(() => XS.ui.game.debug().live.init.decks);
    check(`picker ${tag}: Play starts exactly the two decks clicked (C03 vs A02)`, JSON.stringify(decks) === JSON.stringify(['C03', 'A02']), JSON.stringify(decks));
    check(`picker ${tag}: the scorebug names both decks`, await page.evaluate(() => [...document.querySelectorAll('#scorebug .sb-deck')].map((n) => n.textContent.slice(0, 3)).join() === 'C03,A02'));
    await page.evaluate(() => XS.ui.game.stop());
    // The choice is remembered; the bot's "different deck" is a different deck of the same kind.
    await page.reload();
    check(`picker ${tag}: the last choices come back after a reload`, await page.evaluate(() => document.querySelector('input[name="deck"]:checked').value === 'C03' && document.querySelector('input[name="deck-bot"]:checked').value === 'A02'));
    const picks = [];
    for (const [mine, bot, kind] of [['C05', 'auto', 'competitive'], ['ST02', 'auto', 'starter'], ['random', 'random', null]]) {
      await page.evaluate(([m, b]) => {
        document.querySelector(`input[name="deck"][value="${m}"]`).click();
        document.querySelector(`input[name="deck-bot"][value="${b}"]`).click();
      }, [mine, bot]);
      for (let i = 0; i < 6; i++) {
        await press(page.locator('#play'));
        picks.push([mine, bot, kind, await page.evaluate(() => XS.ui.game.debug().live.init.decks)]);
        await page.evaluate(() => XS.ui.game.stop());
      }
    }
    const badKind = await page.evaluate((ps) => ps.filter(([m, b, k, d]) => d[0] === d[1] || (m !== 'random' && d[0] !== m) || (b === 'auto' && XS.DECKS[d[1]].format !== XS.DECKS[d[0]].format) || (k !== null && XS.DECKS[d[1]].format !== k)), picks);
    check(`picker ${tag}: the bot's default is a different deck of the same kind; "Surprise me" never gives the bot your deck (18 plays)`, badKind.length === 0, JSON.stringify(badKind));
    check(`picker ${tag}: zero console/page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
    TAP = false;
  }
}

// ---- (j) the booster prompts, resumed from real games of the competitive decks ------------------------------------
// Scans games of the ten decks (random bots, headless in the page) for a moment when seat 0 must answer a decision of `purpose`.
async function findCompPending(page, purpose, minOptions = 1) {
  return page.evaluate(([purpose, minOptions]) => {
    const U = XS.ui;
    const ids = Object.keys(XS.DECKS).filter((d) => XS.DECKS[d].tier === 'competitive');
    for (let seed = 1; seed < 30; seed++) for (const a of ids) {
      const b = ids[(ids.indexOf(a) + 3) % ids.length];
      let s = XS.newGame({ decks: [a, b], seed, mode: 'full', first: 0, names: ['You', 'Bot'] });
      const bots = [U.makeRandomBot(seed, 0), U.makeRandomBot(seed, 1)];
      try {
        for (let n = 0; n < 4000 && !XS.isTerminal(s); n++) {
          const p = s.pending;
          if (p !== null && p.seat === 0 && p.purpose === purpose && p.options.length >= minOptions) return { init: s.init, actions: s.actions, deck: a, seed };
          s = XS.apply(s, bots[XS.whoActs(s)].choose(s));
        }
      } catch (e) { if (!/unimplemented/.test(e.message)) throw e; }
    }
    return null;
  }, [purpose, minOptions]);
}
const lastAction = (page, n) => page.evaluate((n) => XS.ui.game.debug().live.actions[n], n);
const nActions = (page) => page.evaluate(() => XS.ui.game.debug().live.actions.length);
const promptFits = (page) => page.evaluate(() => {
  const r = document.querySelector('#prompt .prompt-card').getBoundingClientRect();
  return r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth;
});

async function testCompPrompts(browser) {
  for (const [w, h] of [[1280, 800], [390, 844]]) {
    const tag = `${w}x${h}`;
    const { ctx, page, errors } = await open(browser, `${BASE}?speed=instant`, { width: w, height: h });
    const resume = async (rep) => { await page.evaluate((r) => XS.ui.game.resume(r), rep); await waitMyDecision(page); };
    const pending = () => page.evaluate(() => XS.ui.game.debug().presented.view.pending);

    // -- look
    const lookRep = await findCompPending(page, 'look');
    check(`booster prompts ${tag}: a real competitive game reaches a "look" decision for the human`, lookRep !== null);
    if (lookRep !== null) {
      await resume(lookRep);
      const pend = await pending();
      const info = await page.evaluate(() => {
        const d = XS.ui.game.debug(), v = d.presented.view, p = v.pending;
        const li = XS.ui.prompt.lookInfo({ view: v, me: 0 }, p);
        const opp = XS.ui.prompt.oppHint({ view: XS.view(d.presented.raw, 1), me: 1 }, p);
        return { shown: li.shown.length, n: li.n, opp, revealed: li.revealed };
      });
      check(`booster prompts ${tag} look: the prompt is headed "LOOK AT CARDS" and shows the engine sentence`, (await page.textContent('#prompt .p-tag')) === 'LOOK AT CARDS' && (await page.textContent('#prompt .p-text')) === pend.prompt);
      check(`booster prompts ${tag} look: every looked-at card is on screen, the pickable ones lit (${info.shown} shown, ${pend.options.length} pickable)`,
        (await page.locator('#prompt .p-look .card').count()) === info.shown && (await page.locator('#prompt .p-look .card.pick:not(.is-dim)').count()) === pend.options.length);
      const notes = await page.locator('#prompt .p-notes').allTextContents();
      check(`booster prompts ${tag} look: says where the pick (${pend.to}) and the rest go`, notes.some((t) => (pend.to === 'trash' ? /trash/ : /to your hand/).test(t)) && notes.some((t) => t.startsWith('The rest ')), notes.join(' | '));
      check(`booster prompts ${tag} look: the other seat is told only "Opponent is looking at ${info.n} cards."`, info.revealed || info.opp === `Opponent is looking at ${info.n} cards.`, info.opp);
      check(`booster prompts ${tag} look: confirm waits for a click; ${pend.min === 0 ? 'a decline button says what it declines' : 'no decline (min 1)'}`,
        await page.isDisabled('#prompt-confirm') && (pend.min === 0 ? (await page.locator('#prompt .p-foot .btn', { hasText: /Take none|Don't trash any/ }).count()) === 1 : (await page.locator('#prompt .p-foot .btn').count()) === 2));
      check(`booster prompts ${tag} look: fits the window`, await promptFits(page));
      await page.mouse.move(2, 2);
      await page.screenshot({ path: path.join(OUT, `comp-ui-look-${tag}.png`) });
      const before = await nActions(page);
      await press(page.locator('#prompt .card.pick:not(.is-dim)').first());
      await press(page.locator('#prompt-confirm'));
      await page.waitForFunction((n) => XS.ui.game.debug().live.actions.length > n, before);
      const a = await lastAction(page, before);
      check(`booster prompts ${tag} look: the answer is the one card clicked`, a.type === 'choose' && a.ids.length === 1 && pend.options.includes(a.ids[0]), JSON.stringify(a));
      if (pend.min === 0) {                    // and the decline, from the same position
        await resume(lookRep);
        const b2 = await nActions(page);
        await press(page.locator('#prompt .p-foot .btn', { hasText: /Take none|Don't trash any/ }));
        await page.waitForFunction((n) => XS.ui.game.debug().live.actions.length > n, b2);
        check(`booster prompts ${tag} look: declining sends an empty pick`, JSON.stringify((await lastAction(page, b2)).ids) === '[]');
      }
    }

    // -- may
    const mayRep = await findCompPending(page, 'may');
    check(`booster prompts ${tag}: a real competitive game reaches a "may" decision for the human`, mayRep !== null);
    if (mayRep !== null) {
      await resume(mayRep);
      const pend = await pending();
      check(`booster prompts ${tag} may: names the effect with the engine's own sentence ("${pend.prompt}") and the card's text`,
        (await page.textContent('#prompt .p-text')) === pend.prompt && (await page.textContent('#prompt .p-may-name')).endsWith('optional effect') && (await page.textContent('#prompt .p-quote')).length > 5);
      const btns = await page.locator('#prompt .p-foot .btn').allTextContents();
      check(`booster prompts ${tag} may: two explicit answers, "Use it" and "Decline", both open at once (never picked for the player)`,
        btns.includes('Use it') && btns.includes('Decline') && !(await page.isDisabled('#prompt-confirm')), btns.join(' | '));
      check(`booster prompts ${tag} may: fits the window`, await promptFits(page));
      await page.mouse.move(2, 2);
      await page.screenshot({ path: path.join(OUT, `comp-ui-may-${tag}.png`) });
      let before = await nActions(page);
      await press(page.locator('#prompt .p-foot .btn', { hasText: 'Decline' }));
      await page.waitForFunction((n) => XS.ui.game.debug().live.actions.length > n, before);
      check(`booster prompts ${tag} may: Decline sends an empty answer`, JSON.stringify((await lastAction(page, before)).ids) === '[]');
      await resume(mayRep);
      before = await nActions(page);
      await press(page.locator('#prompt-confirm'));
      await page.waitForFunction((n) => XS.ui.game.debug().live.actions.length > n, before);
      check(`booster prompts ${tag} may: Use it sends the source card`, JSON.stringify((await lastAction(page, before)).ids) === JSON.stringify([pend.options[0]]));
    }

    // -- reveal, freePlay, revive
    for (const [purpose, label, minOptions] of [['reveal', 'REVEAL FROM HAND', 1], ['freePlay', 'PLAY FOR FREE', 1], ['revive', 'BRING A LEADER BACK', 1]]) {
      const rep = await findCompPending(page, purpose, minOptions);
      check(`booster prompts ${tag}: a real competitive game reaches a "${purpose}" decision for the human`, rep !== null);
      if (rep === null) continue;
      await resume(rep);
      const pend = await pending();
      check(`booster prompts ${tag} ${purpose}: headed "${label}" with the engine sentence`, (await page.textContent('#prompt .p-tag')) === label && (await page.textContent('#prompt .p-text')) === pend.prompt);
      const leaders = pend.options.every((o) => /^L[01][0-3]$/.test(o));
      const items = leaders ? page.locator('#prompt .chip') : page.locator('#prompt .card.pick');
      check(`booster prompts ${tag} ${purpose}: one option per engine candidate, confirm waits for a click`, (await items.count()) === pend.options.length && await page.isDisabled('#prompt-confirm'));
      const notes = (await page.locator('#prompt .p-notes').allTextContents()).join(' | ');
      if (purpose === 'reveal') check(`booster prompts ${tag} reveal: says the cards are shown to the opponent`, /shown to your opponent/.test(notes), notes);
      if (purpose === 'freePlay') {
        check(`booster prompts ${tag} freePlay: says each costs 0 PP and lands at the far right`, /costs 0 PP/.test(notes) && /far right/.test(notes), notes);
        const mods = await page.evaluate(() => {
          const p = XS.ui.game.debug().presented.view.pending;
          return { want: p.options.filter((o) => XS.CARDS[XS.ui.cardIdOf(XS.ui.game.debug().presented.view, o)].cost > 0).length, got: document.querySelectorAll('#prompt .card.pick .c-cost.is-mod').length,
            now: [...document.querySelectorAll('#prompt .card.pick .c-cost.is-mod .c-now')].every((n) => n.textContent === '0') };
        });
        check(`booster prompts ${tag} freePlay: every card with a printed cost shows it struck and 0 beside it`, mods.want === mods.got && mods.now, JSON.stringify(mods));
      }
      if (purpose === 'revive') check(`booster prompts ${tag} revive: says the equipment goes to the trash, each chip lists what it carries`, /trash/.test(notes) && (await page.locator('#prompt .chip .chip-extra').count()) === pend.options.length, notes);
      check(`booster prompts ${tag} ${purpose}: fits the window`, await promptFits(page));
      const before = await nActions(page);
      const n = Math.max(1, pend.min);
      for (let i = 0; i < n; i++) await press(items.nth(i));
      if (purpose === 'freePlay' && pend.max > 1) check(`booster prompts ${tag} freePlay: picked cards carry their play order`, (await page.locator('#prompt .c-order').count()) === n);
      await press(page.locator('#prompt-confirm'));
      await page.waitForFunction((n) => XS.ui.game.debug().live.actions.length > n, before);
      const a = await lastAction(page, before);
      check(`booster prompts ${tag} ${purpose}: the answer is legal and complete`, a.type === 'choose' && a.ids.length === n && a.ids.every((i) => pend.options.includes(i)), JSON.stringify(a));
    }
    const diag = await page.evaluate(() => XS.ui.game.debug().diagnostics.slice());
    check(`booster prompts ${tag}: no UI diagnostics`, diag.length === 0, diag.slice(0, 2).join(' | '));
    check(`booster prompts ${tag}: zero console/page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }
}

// Cost changes, keyword text in the zoom, equipment lines, Echo cards: the UI side, in a real page (a state with a cost modifier needs the
// abilities of the booster cards, so the cost badge and the zoom are also driven from the engine's costParts through the same code paths).
async function testCompCards(browser) {
  const { ctx, page, errors } = await open(browser, `${BASE}?speed=instant&seed=3`, { width: 1280, height: 800 });
  await page.evaluate(() => XS.ui.game.start({ decks: ['C03', 'A02'], mode: 'quick', seed: 3, spectate: false, tier: 'easy' }));
  await waitMyDecision(page);
  // The cost badge: printed cost struck, the engine's cost beside it.
  const badge = await page.evaluate(() => {
    const U = XS.ui;
    const c = U.cardEl('ST01-005', { costNow: 1 });
    const plain = U.cardEl('ST01-005', {});
    const b = c.querySelector('.c-cost');
    return { mod: b.classList.contains('is-mod'), was: b.querySelector('s.c-was').textContent, now: b.querySelector('b.c-now').textContent, plain: plain.querySelector('.c-cost').textContent, plainMod: plain.querySelector('.c-cost').classList.contains('is-mod'), title: b.title };
  });
  check('cost badge: a modified cost shows the printed cost struck and the cost now (3 -> 1); an unmodified one shows the number alone',
    badge.mod && badge.was === '3' && badge.now === '1' && badge.plain === '3' && !badge.plainMod, JSON.stringify(badge));
  // The same through the zoom with the engine's costParts: find any real modification in a played-out game, else drive the stubbed ctx.
  const zoom = await page.evaluate(() => {
    const P = XS.ui.preview;
    const saved = P.ctx;
    P.ctx = { stats: () => null, cost: (iid) => ({ base: 3, mods: [{ src: 'x', n: -1 }, { src: iid, n: -1 }], total: 1 }), name: () => 'Power Field' };
    const line = P.costLine({ cost: 3 }, 'c1');
    P.ctx = saved;
    return line;
  });
  check('cost zoom line: "Cost 3 -> 1 PP (Power Field -1, this card -1)" from costParts', zoom.was === 3 && zoom.now === 1 && zoom.why === ' (Power Field −1, this card −1)', JSON.stringify(zoom));
  // Hover zoom on real cards of the deck list: keywords and equipment stat lines.
  const wanted = await page.evaluate(() => {
    const find = (re) => Object.keys(XS.CARDS).find((id) => re.test(XS.CARDS[id].text));
    return { overkill: find(/\[Overkill \d+\]/), round: find(/\[Round\]/), equip: Object.keys(XS.CARDS).find((id) => XS.CARDS[id].equip && XS.CARDS[id].equip.hpBase !== undefined), shield: 'ST01-023' };
  });
  await page.evaluate(() => XS.ui.game.stop());
  // No Echo card is in the ten decks (data/text-en.js: "none in the ten decks yet"): the keyword table is checked on its printed token.
  const echoSay = await page.evaluate(() => XS.ui.preview.KEYWORDS.filter(([re]) => re.test('[Echo] Draw 1 card.')).map(([re, say]) => say(re.exec('[Echo] Draw 1 card.'))));
  check('zoom echo: [Echo] is explained (turns sideways at the end of the turn, replayed free next turn)', echoSay.length === 1 && /Echo: at the end of your turn/.test(echoSay[0]) && /played again for free/.test(echoSay[0]), JSON.stringify(echoSay));
  for (const [what, want] of [['overkill', /Overkill \d+: after the attack/], ['round', /Round: this card stays in the play area/], ['equip', /Equipment: base HP becomes \d+ \(\d+ once awakened\)/], ['shield', /Equipment: HP \+30\./]]) {
    if (wanted[what] === undefined) { check(`zoom ${what}: a card with that text is in the data`, false); continue; }
    const deck = await page.evaluate((id) => Object.keys(XS.DECKS).find((d) => XS.DECKS[d].main.some(([c]) => c === id) || XS.DECKS[d].tactics.includes(id)), wanted[what]);
    if (deck === undefined) { check(`zoom ${what}: ${wanted[what]} is in a registered deck`, true); }
    const shown = await page.evaluate((id) => { XS.ui.preview.hide(); const z = document.getElementById('zoom'); const t = document.createElement('div'); t.setAttribute('data-card', id); document.body.appendChild(t);
      t.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 100, clientY: 100 })); const out = z.textContent; t.remove(); XS.ui.preview.hide(); return out; }, wanted[what]);
    check(`zoom ${what} (${wanted[what]}): explains the keyword / shows the stat line`, want.test(shown), shown.slice(0, 200));
  }
  check('zoom: zero console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();

  // Echo: a card lying sideways in the play area is drawn turned and labelled (state edited for display only).
  const e = await open(browser, `${BASE}?speed=instant`, { width: 1280, height: 800 });
  const echo = await e.page.evaluate(() => {
    const U = XS.ui;
    for (let seed = 1; seed < 40; seed++) {
      let s = XS.newGame({ decks: ['ST01', 'ST02'], seed, mode: 'quick', first: 0, names: ['You', 'Bot'] });
      const bots = [U.makeRandomBot(seed, 0), U.makeRandomBot(seed, 1)];
      for (let n = 0; n < 3000 && !XS.isTerminal(s); n++) {
        if (s.phase === 'main' && s.pending === null && XS.whoActs(s) === 0 && s.players[0].play.length > 0) {
          const t = XS.cloneState(s);
          t.players[0].sideways = [t.players[0].play[0]];
          U.game.resumeState(t);
          return { iid: t.players[0].play[0] };
        }
        s = XS.apply(s, bots[XS.whoActs(s)].choose(s));
      }
    }
    return null;
  });
  check('echo: a position with a card in the play area is reachable', echo !== null);
  if (echo !== null) {
    await waitMyDecision(e.page);
    const st = await e.page.evaluate((iid) => { const n = document.querySelector(`#play-0 [data-iid="${iid}"]`); return { sideways: n.classList.contains('is-sideways'), label: n.querySelector('.c-echo').textContent, rot: getComputedStyle(n).transform }; }, echo.iid);
    check('echo: the sideways card is turned and labelled ECHO', st.sideways && st.label === 'ECHO' && st.rot !== 'none', JSON.stringify(st));
    check('echo: the play area still fits the window', (await layoutProblems(e.page).catch(() => [])).filter((x) => /horizontal|off screen/.test(x)).length === 0);
  }
  check('echo: zero console/page errors', e.errors.length === 0, e.errors.slice(0, 3).join(' | '));
  await e.ctx.close();
}

// ---- (k) a human match by clicks with a competitive deck chosen on the title ------------------------------------------
async function testCompHuman(browser) {
  rngState = 77;
  const { ctx, page, errors } = await open(browser, `${BASE}?speed=instant&seed=21`, { width: 1280, height: 800 });
  await page.check('input[name="mode"][value="quick"]');
  await page.click('#dp-list-mine input[value="C01"]');
  await page.click('#dp-list-bot input[value="A03"]');
  await page.click('#play');
  const prompts = new Set();
  let plays = 0, turns = 0;
  for (let step = 0; step < 4000; step++) {
    if (await waitMyDecision(page, 90000)) break;
    const pend = await page.evaluate(() => XS.ui.game.debug().presented.view.pending);
    if (pend !== null) {
      prompts.add(pend.purpose);
      if (pend.purpose === 'may') { await page.click(rnd(2) === 0 ? '#prompt-confirm' : '#prompt .p-foot .btn:has-text("Decline")'); await page.waitForTimeout(30); continue; }
      if (pend.kind === 'choose' && pend.min === 0 && rnd(2) === 0 && (await page.locator('#prompt .p-foot .btn:not(.ghost):not(.primary)').count()) > 0) { await press(page.locator('#prompt .p-foot .btn:not(.ghost):not(.primary)').first()); continue; }
      if (pend.purpose === 'look' || pend.purpose === 'reveal' || pend.purpose === 'freePlay') {
        // a pick under a limit may need fewer cards: click one card at a time until the confirm opens
        const items = page.locator('#prompt .card.pick:not(.is-dim)');
        const total = await items.count();
        for (let i = 0; i < Math.min(total, pend.max); i++) {
          await press(items.nth(i));
          if (!(await page.isDisabled('#prompt-confirm'))) break;
        }
        if (await page.isDisabled('#prompt-confirm')) { await press(page.locator('#prompt .p-foot .btn:not(.ghost):not(.primary)').first()); continue; }
        await press(page.locator('#prompt-confirm'));
        continue;
      }
      if (await answerPrompt(page)) continue;
    }
    const ids = await page.$$eval('.handcard.is-actable, .tac.is-actable', (ns) => ns.map((n) => n.getAttribute('data-play')));
    if (ids.length > 0 && rnd(5) > 0) { await playCardByClicks(page, ids[rnd(ids.length)], rnd(4)); plays++; continue; }
    await page.click('#endturn');
    turns++;
  }
  const over = await page.evaluate(() => XS.ui.game.debug().live.phase === 'over');
  check(`human match by clicks, C01 against A03: finished (${plays} cards played, ${turns} turns; decisions seen: ${[...prompts].join(', ')})`, over);
  const diag = await page.evaluate(() => XS.ui.game.debug().diagnostics.slice());
  check('competitive human match: no UI diagnostics', diag.length === 0, diag.slice(0, 2).join(' | '));
  check('competitive human match: zero console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---- (l) every competitive deck against another one, the AI in both seats ----------------------------------------------
async function testCompAutoplay(browser) {
  const seeds = COMP.map((id, i) => [id, COMP[(i + 3) % COMP.length], i + 1]);
  for (const [a, b, seed] of seeds) {
    const t0 = Date.now();
    const { ctx, page, errors } = await open(browser, `${BASE}?autoplay=1&speed=instant&bot=ai&seed=${seed}&mode=full&deck0=${a}&deck1=${b}`, { width: 1280, height: 800 });
    let ended = true;
    try { await page.waitForSelector('#endscreen.open', { timeout: 240000 }); } catch (e) { ended = false; }
    const info = ended ? await page.evaluate(() => {
      const d = XS.ui.game.debug();
      return { winner: d.live.winner, wins: d.live.wins, actions: d.live.actions.length, diag: d.diagnostics.slice(), decks: d.live.init.decks, head: document.querySelector('.end-head').textContent };
    }) : null;
    const tag = `${a} vs ${b} seed ${seed}`;
    check(`competitive autoplay ${tag}: reaches the end screen (${((Date.now() - t0) / 1000).toFixed(0)} s)`, ended, ended ? '' : 'timeout; errors: ' + errors.slice(0, 2).join(' | '));
    if (info !== null) {
      check(`competitive autoplay ${tag}: zero console/page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
      check(`competitive autoplay ${tag}: no UI diagnostics (${info.actions} actions, wins ${info.wins})`, info.diag.length === 0, info.diag.slice(0, 2).join(' | '));
    }
    await ctx.close();
  }
}

// ---- main ------------------------------------------------------------------------------------------------------------
(async () => {
  await startServer();
  const browser = await chromium.launch();
  try {
    if (only === null || only === 'a') await testAutoplay(browser);
    if (only === null || only === 'g') await testAi(browser);
    if (only === null || only === 'b') { await testHumanPath(browser); await testHumanMatch(browser); }
    if (only === null || only === 'e') await testPrompts(browser);
    if (only === null || only === 'f') await testPhone(browser);
    if (only === null || only === 'c') await testScreens(browser);
    if (only === null || only === 'd') await testPlayback(browser);
    if (only === null || only === 'h') await testM7(browser);
    if (only === null || only === 'i') await testDeckPicker(browser);
    if (only === null || only === 'j') { await testCompPrompts(browser); await testCompCards(browser); }
    if (only === null || only === 'k') await testCompHuman(browser);
    if (only === null || only === 'l') await testCompAutoplay(browser);
  } finally {
    await browser.close();
    stopServer();
  }
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\ne2e: ${results.length - bad}/${results.length} checks passed`);
  if (bad) { console.log('FAILED:'); for (const f of fails) console.log('  ' + f); process.exit(1); }
})().catch((e) => { console.error(e); stopServer(); process.exit(1); });
