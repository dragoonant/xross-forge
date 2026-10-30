// js/ui/anim.js: the presentation director. Two halves.
//   XS.ui.anim.plan(entries, nextView, me) -> steps      PURE: no DOM, no clock (tests/30-ui.js).
//   XS.ui.anim.play(steps, ctx) -> Promise                DOM: plays the steps on the OLD board (the
//     caller renders the new state only afterwards), so a downed leader is still on screen to go
//     down. Input is locked under #fx-lock while it runs; any click or key skips to the end.
// Speeds (settings): full / quick / instant; instant (and tests) does no DOM work at all. "Reduce motion" (settings, default
// the OS preference) swaps in the shorter A.DR durations (the awaken stinger 2000 -> 700 ms) and drops bursts and shakes.
// Audio: every log entry the director shows reaches ctx.onLog(entry) exactly once, at the moment its step starts, whether the
// step plays, is skipped, or runs at Instant speed (XS.Audio.onLog rate-limits; see game.js).
// Two rules from the donor effects layer: flush start states with a forced layout read (never
// requestAnimationFrame: it does not fire in a background tab), and remove every transient node by
// timer, not by animationend, so nothing strands under reduced motion.
(function () {
  'use strict';
  const XS = globalThis.XS;
  const U = XS.ui;
  const A = (U.anim = {});

  // Base durations in ms at Full speed (U.ms scales them). The spotlight is the KB's:
  // travel 500, hold 1200, fade 250.
  A.D = {
    say: 700, quiet: 0, draw: 380, play: 700, spotTravel: 500, spotHold: 1200, spotFade: 250,
    attack: 850, damage: 600, heal: 560, down: 650, awaken: 2000, ribbon: 1200, banner: 1900, notice: 1700, matchEnd: 2400, equip: 700,
  };
  // The same beats under "reduce motion": every overlay is shorter, the stinger most of all.
  A.DR = {
    say: 450, quiet: 0, draw: 200, play: 350, spotTravel: 200, spotHold: 900, spotFade: 150,
    attack: 450, damage: 350, heal: 300, down: 350, awaken: 700, ribbon: 600, banner: 900, notice: 1000, matchEnd: 1400, equip: 350,
  };
  const d = (k) => {
    const t = U.reduceMotion() ? A.DR : A.D;
    if (t[k] === undefined) throw new Error('anim: no duration for "' + k + '"');
    return t[k];
  };
  A.dur = d;

  // ---- plan (pure) ----------------------------------------------------------------------------
  const QUIET = new Set(['ppSpend', 'turnEnd', 'ability', 'boost', 'trash', 'tacticsPick']);
  A.plan = function (entries, view, me) {
    const steps = [];
    for (const e of entries) {
      const d = e.data;
      const mine = e.seat === me;
      const before = steps.length;
      switch (e.type) {
        case 'turnStart':
          steps.push({ kind: 'ribbon', entry: e, mine, turn: d.turn });
          break;
        case 'roundStart':
          steps.push({ kind: 'banner', entry: e, main: 'ROUND ' + d.round, sub: (d.first === me ? 'You go first' : 'Opponent goes first') + ' · ' + d.pp + ' PP', tone: 'round' });
          break;
        case 'roundEnd':
          steps.push({ kind: 'banner', entry: e, main: d.winner === null ? 'ROUND ' + d.round + ' — DRAW' : 'ROUND ' + d.round + (d.winner === me ? ' — YOURS' : ' — THEIRS'),
            sub: 'Score ' + d.wins[me] + ' – ' + d.wins[1 - me], tone: d.winner === me ? 'win' : 'lose' });
          break;
        case 'matchEnd':
          steps.push({ kind: 'matchEnd', entry: e, winner: d.winner, win: d.winner === me });
          break;
        case 'play': case 'tacticsPlay':
          steps.push({ kind: 'play', entry: e, seat: e.seat, mine, iid: d.iid, cardId: d.cardId });
          break;
        case 'equip':
          steps.push({ kind: 'equip', entry: e, leader: d.leader });
          break;
        case 'attack':
          steps.push({ kind: 'attack', entry: e, attacker: d.attacker, target: d.target, damage: d.damage, mine });
          break;
        case 'damage':
          steps.push({ kind: 'damage', entry: e, leader: d.leader, amount: d.amount });
          break;
        case 'heal':
          steps.push({ kind: 'heal', entry: e, leader: d.leader, amount: d.amount });
          break;
        case 'down':
          steps.push({ kind: 'down', entry: e, leader: d.leader });
          break;
        case 'awaken':
          steps.push({ kind: 'awaken', entry: e, leader: d.leader, cardId: U.leaderCardId(view, d.leader), atk: d.atk, hp: d.hp, mine });
          break;
        case 'draw': {
          // Consecutive draws by one seat are one beat (setup draws four cards in a row).
          const prev = steps[steps.length - 1];
          if (prev !== undefined && prev.kind === 'draw' && prev.seat === e.seat) { prev.entry = e; prev.n++; prev.entries.push(e); break; }
          steps.push({ kind: 'draw', entry: e, seat: e.seat, hidden: !!d.hidden, n: 1 });
          break;
        }
        case 'ppRecover':
          steps.push({ kind: d.cause === 'untap' ? 'quiet' : 'say', entry: e });
          break;
        case 'reshuffle':
          steps.push({ kind: 'notice', entry: e, main: 'RESHUFFLE', sub: (mine ? 'Your' : "Opponent's") + ' trash goes back into the deck', tone: 'warn' });
          break;
        case 'tacticsBurn':
          steps.push({ kind: 'notice', entry: e, main: 'TACTICS LOST', sub: (mine ? 'Your' : "Opponent's") + ' deck ran short: a tactics card is burned', tone: 'warn' });
          break;
        case 'fizzle':
          steps.push({ kind: 'notice', entry: e, main: 'NO EFFECT', sub: '', tone: 'dim' });
          break;
        case 'overkill':
          steps.push({ kind: 'notice', entry: e, main: 'OVERKILL ' + d.n, sub: '+' + d.excess + ' beyond the leader\'s HP', tone: 'warn' });
          break;
        default:
          steps.push({ kind: QUIET.has(e.type) ? 'quiet' : 'say', entry: e });
      }
      // Every step lists the log entries it presents (a merged run of draws lists them all): the audio hook is per entry.
      if (steps.length > before) steps[steps.length - 1].entries = [e];
    }
    return steps;
  };
  A.stepMs = function (s) {
    switch (s.kind) {
      case 'play': return s.mine ? d('play') : d('spotTravel') + d('spotHold') + d('spotFade');
      case 'say': return d('say');
      default: return d(s.kind);
    }
  };

  // ---- play (DOM) -------------------------------------------------------------------------------
  let job = null;
  A.busy = () => job !== null;
  A.skip = function () {
    if (job === null) return;
    job.skipped = true;
    for (const t of job.timers.splice(0)) t();       // resolve every pending sleep now
    for (const n of job.nodes.splice(0)) n.remove();
  };

  function later(ms, fn) {
    // A sleep: resolved by its timer, or at once by skip().
    return new Promise((resolve) => {
      if (job.skipped || ms <= 0) { resolve(); if (fn) fn(); return; }
      let done = false;
      const fin = () => { if (done) return; done = true; clearTimeout(t); if (fn) fn(); resolve(); };
      const t = setTimeout(fin, ms);
      job.timers.push(fin);
    });
  }
  const sleep = (base) => later(U.ms(base));
  function keep(node, ms) {
    job.nodes.push(node);
    setTimeout(() => node.remove(), ms);
    return node;
  }
  const layer = () => U.$('fx-layer');
  const q = (sel) => document.querySelector(sel);
  const leaderNode = (iid) => q('#board [data-leader="' + iid + '"]');
  function centre(n) { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }; }

  function caption(step, ctx) {
    if (step.kind === 'quiet') return;
    ctx.setCaption(step.entry);
  }

  function floatText(node, text, cls) {
    if (node === null) return;
    const c = centre(node);
    const f = keep(U.el('div', 'fx-float ' + cls, text), U.ms(1300) + 50);
    f.style.left = c.x + 'px'; f.style.top = c.y + 'px';
    f.style.setProperty('--dur', U.ms(1100) + 'ms');
    layer().appendChild(f);
  }
  function pulse(node, cls, ms) {
    if (node === null) return;
    node.classList.add(cls);
    setTimeout(() => node.classList.remove(cls), ms);
  }
  function burst(node, cls) {
    if (node === null) return;
    const c = centre(node);
    const b = keep(U.el('div', 'fx-burst ' + cls), U.ms(900) + 50);
    b.style.left = c.x + 'px'; b.style.top = c.y + 'px';
    b.style.setProperty('--size', Math.max(c.r.width, c.r.height) * 1.5 + 'px');
    for (let i = 0; i < 10; i++) { const s = U.el('span', 'fx-shard'); s.style.setProperty('--a', (i * 36 + (i % 2) * 14) + 'deg'); b.appendChild(s); }
    layer().appendChild(b);
  }
  function arrow(from, to, mine) {
    if (from === null || to === null) return;
    const a = centre(from), b = centre(to);
    const svg = keep(U.svgEl('svg', { class: 'fx-arrow' + (mine ? '' : ' is-theirs'), width: window.innerWidth, height: window.innerHeight }), U.ms(1200) + 50);
    const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.12, my = (a.y + b.y) / 2 - (b.x - a.x) * 0.12;
    svg.appendChild(U.svgEl('path', { d: `M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`, class: 'fx-arrow-path' }));
    const ang = Math.atan2(b.y - my, b.x - mx), L = 24;
    svg.appendChild(U.svgEl('path', { class: 'fx-arrow-head', d: `M${b.x},${b.y} L${b.x - L * Math.cos(ang - 0.45)},${b.y - L * Math.sin(ang - 0.45)} L${b.x - L * Math.cos(ang + 0.45)},${b.y - L * Math.sin(ang + 0.45)} Z` }));
    layer().appendChild(svg);
  }
  function overlay(id, build, holdBase) {
    const box = U.$(id);
    box.replaceChildren(build());
    void box.offsetWidth;                         // flush the start state
    box.classList.add('show');
    return later(U.ms(holdBase)).then(() => { box.classList.remove('show'); });
  }

  const STEP = {
    quiet() { return Promise.resolve(); },
    say() { return sleep(d('say')); },
    draw(s) {
      const z = q('#deck-' + s.seat);
      pulse(z, 'fx-pulse', U.ms(500));
      return sleep(d('draw'));
    },
    ribbon(s) {
      return overlay('ribbon', () => {
        const r = U.el('div', 'ribbon-in ' + (s.mine ? 'is-mine' : 'is-theirs'));
        r.appendChild(U.el('span', 'rb-main', s.mine ? 'YOUR TURN' : 'OPPONENT'));
        r.appendChild(U.el('span', 'rb-sub', 'Turn ' + s.turn));
        return r;
      }, d('ribbon'));
    },
    banner(s) {
      return overlay('banner', () => {
        const r = U.el('div', 'banner-in tone-' + s.tone);
        r.appendChild(U.el('div', 'bn-main', s.main));
        r.appendChild(U.el('div', 'bn-sub', s.sub));
        return r;
      }, d('banner'));
    },
    notice(s) {
      return overlay('notice', () => {
        const r = U.el('div', 'notice-in tone-' + s.tone);
        r.appendChild(U.el('span', 'nt-main', s.main));
        if (s.sub) r.appendChild(U.el('span', 'nt-sub', s.sub));
        return r;
      }, d('notice'));
    },
    matchEnd(s) {
      return overlay('banner', () => {
        const r = U.el('div', 'banner-in tone-' + (s.win ? 'win' : 'lose') + ' is-final');
        r.appendChild(U.el('div', 'bn-main', s.winner === null ? 'NO WINNER' : (s.win ? 'VICTORY' : 'DEFEAT')));
        r.appendChild(U.el('div', 'bn-sub', 'Match over'));
        return r;
      }, d('matchEnd'));
    },
    play(s, ctx) {
      if (s.mine) {
        const src = q('#hand [data-iid="' + s.iid + '"]') || q('#tactics-0 [data-iid="' + s.iid + '"]');
        const dst = U.$('play-' + s.seat);
        if (src === null) return sleep(d('play'));
        const a = centre(src), b = centre(dst);
        const ghost = keep(src.cloneNode(true), U.ms(d('play')) + 100);
        ghost.classList.add('fly');
        ghost.style.left = a.r.left + 'px'; ghost.style.top = a.r.top + 'px';
        ghost.style.width = a.r.width + 'px'; ghost.style.height = a.r.height + 'px';
        layer().appendChild(ghost);
        src.classList.add('is-lifting');
        void ghost.offsetWidth;
        ghost.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${b.x - a.x}px, ${b.y - a.y}px) scale(.82)` }],
          { duration: U.ms(d('play') - 120), easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
        return sleep(d('play'));
      }
      // The opponent's card: spotlight (travel 500, hold 1200, fade 250).
      const box = U.$('spot');
      box.replaceChildren(U.cardEl(s.cardId, { cls: 'spotcard' }));
      box.style.setProperty('--travel', U.ms(d('spotTravel')) + 'ms');
      box.style.setProperty('--fade', U.ms(d('spotFade')) + 'ms');
      box.classList.remove('fade');
      void box.offsetWidth;
      box.classList.add('show');
      return sleep(d('spotTravel') + d('spotHold')).then(() => {
        box.classList.add('fade');
        return sleep(d('spotFade'));
      }).then(() => { box.classList.remove('show', 'fade'); box.replaceChildren(); });
    },
    equip(s) {
      pulse(leaderNode(s.leader), 'fx-equip', U.ms(900));
      return sleep(d('equip'));
    },
    attack(s) {
      const a = leaderNode(s.attacker), t = leaderNode(s.target);
      arrow(a, t, s.mine);
      pulse(a, 'fx-attacker', U.ms(900));
      pulse(t, 'fx-target', U.ms(1100));
      return sleep(d('attack'));
    },
    damage(s) {
      const n = leaderNode(s.leader);
      pulse(n, 'fx-hit', U.ms(700));
      if (!U.reduceMotion()) burst(n, 'is-hit');
      floatText(n, '−' + s.amount, 'is-dmg');
      return sleep(d('damage'));
    },
    heal(s) {
      const n = leaderNode(s.leader);
      pulse(n, 'fx-heal', U.ms(800));
      floatText(n, '+' + s.amount, 'is-heal');
      return sleep(d('heal'));
    },
    down(s) {
      const n = leaderNode(s.leader);
      if (n !== null) { n.classList.add('is-down'); if (!U.reduceMotion()) burst(n, 'is-ko'); floatText(n, 'DOWN', 'is-ko'); }
      return sleep(d('down'));
    },
    awaken(s) {
      const n = leaderNode(s.leader);
      if (n !== null) { n.classList.add('is-awake', 'fx-awake'); }
      return overlay('stinger', () => {
        const r = U.el('div', 'stinger-in ' + (s.mine ? 'is-mine' : 'is-theirs'));
        r.appendChild(U.el('div', 'st-kicker', s.mine ? 'YOUR LEADER' : "OPPONENT'S LEADER"));
        r.appendChild(U.el('div', 'st-name', U.cardTitle(s.cardId)));
        r.appendChild(U.el('div', 'st-jp', U.cardTitleAlt(s.cardId)));
        r.appendChild(U.el('div', 'st-word', 'AWAKENED'));
        r.appendChild(U.el('div', 'st-stats', 'ATK ' + s.atk + '  ·  HP ' + s.hp));
        return r;
      }, d('awaken'));
    },
  };

  A.KINDS = Object.keys(STEP);

  // ctx: { setCaption(entry), onLog(entry), me }. Resolves when every step has played (or was skipped).
  A.play = function (steps, ctx) {
    if (job !== null) throw new Error('anim: a playback is already running');
    if (U.rate() === 0 || steps.length === 0) {
      // Instant: no DOM work. Still narrate the last visible event, and still hand every entry to the audio hook.
      for (const s of steps) for (const e of s.entries) ctx.onLog(e);
      const last = steps.filter((s) => s.kind !== 'quiet').pop();
      if (last !== undefined) ctx.setCaption(last.entry);
      return Promise.resolve();
    }
    job = { skipped: false, timers: [], nodes: [] };
    const lock = U.$('fx-lock');
    lock.classList.add('open');
    document.body.classList.add('is-animating');
    const onKey = (e) => { if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); A.skip(); } };
    document.addEventListener('keydown', onKey, true);
    const cleanup = () => {
      document.removeEventListener('keydown', onKey, true);
      lock.classList.remove('open');
      document.body.classList.remove('is-animating');
      for (const id of ['ribbon', 'banner', 'notice', 'stinger', 'spot']) U.$(id).classList.remove('show', 'fade');
      for (const n of job.nodes.splice(0)) n.remove();
      job = null;
    };
    return (async () => {
      try {
        for (const s of steps) {
          for (const e of s.entries) ctx.onLog(e);
          caption(s, ctx);
          if (job.skipped) continue;
          await STEP[s.kind](s, ctx);
        }
      } finally { cleanup(); }
    })();
  };

  A.init = function () {
    U.$('fx-lock').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); A.skip(); });
  };
})();
