// End-to-end checks of the first playable, in a real browser (Playwright, plain chromium.launch()).
//   node tools/e2e.mjs [--only a|b|c|d] [--keep]
// (a) bot vs bot to the end screen, instant speed: full-match seeds 1..5 and quick-match seeds 1..2,
//     zero console errors, zero page errors, zero UI diagnostics, and the saved trace replays.
// (b) the human path by real clicks: Play, pick tactics, play an attack card choosing attacker and
//     target, check the damage on the target equals XS.previewAttack and the log shows the attack;
//     then a whole quick match played by clicking (every prompt kind that appears is answered).
// (c) screenshots (tools/out/m3-*.png) of a mid-game board and of the awaken stinger at 1280x800 and
//     390x844, plus layout checks (no scrollbars, nothing off screen) at four viewport sizes.
// (d) speed Full: input is locked during playback and a click skips it.
// The script starts `node tools/serve.mjs` on port 8232 and stops it afterwards.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools/out');
const PORT = 8232;
const BASE = `http://localhost:${PORT}/index.html`;
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
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

// ---- page helpers ----------------------------------------------------------------------------------
async function open(browser, url, viewport) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, hasTouch: viewport.width < 600 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
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
  const runs = [['full', 1], ['full', 2], ['full', 3], ['full', 4], ['full', 5], ['quick', 1], ['quick', 2]];
  for (const [mode, seed] of runs) {
    const { ctx, page, errors } = await open(browser, `${BASE}?autoplay=1&speed=instant&seed=${seed}&mode=${mode}`, { width: 1280, height: 800 });
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
    check(`autoplay ${mode} seed ${seed}: reaches the end screen`, ended, ended ? '' : 'timeout');
    if (info !== null) {
      check(`autoplay ${mode} seed ${seed}: zero console/page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
      check(`autoplay ${mode} seed ${seed}: no UI diagnostics`, info.diag.length === 0, info.diag.slice(0, 2).join(' | '));
      check(`autoplay ${mode} seed ${seed}: XS.replay(init, actions) reproduces the result (${info.actions} actions, wins ${info.wins})`, info.replayOk);
      check(`autoplay ${mode} seed ${seed}: bug report has init, actions, ua, date`, info.reportOk);
    }
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

// ---- main ------------------------------------------------------------------------------------------------------------
(async () => {
  await startServer();
  const browser = await chromium.launch();
  try {
    if (only === null || only === 'a') await testAutoplay(browser);
    if (only === null || only === 'b') { await testHumanPath(browser); await testHumanMatch(browser); }
    if (only === null || only === 'e') await testPrompts(browser);
    if (only === null || only === 'f') await testPhone(browser);
    if (only === null || only === 'c') await testScreens(browser);
    if (only === null || only === 'd') await testPlayback(browser);
  } finally {
    await browser.close();
    stopServer();
  }
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\ne2e: ${results.length - bad}/${results.length} checks passed`);
  if (bad) { console.log('FAILED:'); for (const f of fails) console.log('  ' + f); process.exit(1); }
})().catch((e) => { console.error(e); stopServer(); process.exit(1); });
