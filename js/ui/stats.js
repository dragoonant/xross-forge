// js/ui/stats.js: the end-screen numbers, counted from the log alone (the viewer's own XS.view log, so nothing hidden is
// read). Pure and headless-safe. tests/30-ui.js recounts a few of them independently from the raw state.
//   U.stats.compute(log) -> { sides: [side0, side1], rounds, turns }
//   side = { damage, downs, awakenings, played, attacks, memoria, tactics, bestHit }
//     damage       counters this side put on the other side's leaders (every `damage` entry, attack or effect)
//     downs        opposing leaders this side knocked down (a `down` entry for a leader of the other seat)
//     awakenings   this side's leaders that awakened
//     played       cards played from hand or the tactics area (attack + memoria + tactics)
//     bestHit      the biggest single `attack` entry by this side's leaders
//   rounds       the highest round number in the log; turns: how many turns were started
(function () {
  'use strict';
  const XS = globalThis.XS;
  const U = XS.ui;
  const St = (U.stats = {});

  St.compute = function (log) {
    const side = () => ({ damage: 0, downs: 0, awakenings: 0, played: 0, attacks: 0, memoria: 0, tactics: 0, bestHit: 0 });
    const sides = [side(), side()];
    let rounds = 0, turns = 0;
    for (const e of log) {
      const d = e.data;
      if (e.round > rounds) rounds = e.round;
      switch (e.type) {
        case 'damage': sides[1 - U.leaderSeat(d.leader)].damage += d.amount; break;
        case 'down': sides[1 - d.seat].downs++; break;
        case 'awaken': sides[d.seat].awakenings++; break;
        case 'play':
          sides[e.seat].played++;
          if (d.type === 'attack') sides[e.seat].attacks++; else sides[e.seat].memoria++;
          break;
        case 'tacticsPlay': sides[e.seat].played++; sides[e.seat].tactics++; break;
        case 'attack': {
          const s = sides[U.leaderSeat(d.attacker)];
          if (d.damage > s.bestHit) s.bestHit = d.damage;
          break;
        }
        case 'turnStart': turns++; break;
        default: break;
      }
    }
    return { sides, rounds, turns };
  };

  // [label, per-side values] rows for the table; `me` is the seat shown on the left.
  St.rows = function (stats, me) {
    const a = stats.sides[me], b = stats.sides[1 - me];
    return [
      ['Damage dealt', a.damage, b.damage],
      ['Leaders downed', a.downs, b.downs],
      ['Awakenings', a.awakenings, b.awakenings],
      ['Cards played', a.played, b.played],
      ['Biggest hit', a.bestHit, b.bestHit],
    ];
  };
})();
