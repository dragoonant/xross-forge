// The one log door. Every state-visible event is written here and nowhere else (CLAUDE.md rule 3).
// Entries are frozen so cloneState can share them between states. The UI and the audio read these;
// the engine never writes prose. Types and data fields: docs/ENGINE-API.md "Log".
(function () {
  'use strict';
  const XS = globalThis.XS;

  XS.log = function (s, seat, type, data, via) {
    const d = data || {};
    for (const k in d) { const v = d[k]; if (v !== null && typeof v === 'object') XS.deepFreeze(v); }
    const e = Object.freeze({
      seq: s.seq++, round: s.round, turn: s.turn, seat, type,
      data: Object.freeze(d),
      via: via === undefined ? s._via : via,
    });
    s.log.push(e);
    return e;
  };
})();
