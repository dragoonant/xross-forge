// js/ui/logtext.js: ONE function turns a log entry into the player-facing line.
//   XS.ui.logText(entry, view) -> { text, segs }
//     text: the plain sentence; segs: strings and card references { card, iid? } so the drawer and
//     the lower third can make card names hover-zoom doorways. `view` is XS.view(s, viewer).
// The phrase table is keyed on the log types of docs/ENGINE-API.md "Log". tests/30-ui.js fails when
// a type has no line. Copy is our own words (CLAUDE.md rule 10). Headless-safe (no DOM).
(function () {
  'use strict';
  const XS = globalThis.XS;
  const U = XS.ui;

  const FIRST_WORD = (view, seat) => (seat === view.viewer ? 'you' : 'the opponent');
  const CAUSE_DRAW = { setup: 'at setup', turnStart: 'at the start of the turn', endPhase: 'for unused PP', effect: 'from an effect' };
  const CAUSE_DISCARD = { effect: 'to an effect', handLimit: 'over the hand limit (7)', roundEnd: 'at the end of the round' };
  const REASON = {
    rounds: 'won the rounds',
    tacticsDeckEmpty: 'a tactics deck ran out',
    bothLose: 'both players met a losing condition',
    concede: 'conceded',
  };

  // Builders. A line is an array of strings and { card, iid } refs.
  function cardRef(view, iid, cardIdHint) {
    const id = cardIdHint !== undefined && cardIdHint !== null ? cardIdHint : U.cardIdOf(view, iid);
    if (id === null) return 'a card';
    return { card: id, iid: iid };
  }
  function leaderRef(view, iid) {
    const id = U.leaderCardId(view, iid);
    return { card: id, iid: iid };
  }
  function cardList(view, iids, cardIds) {
    const out = [];
    iids.forEach((iid, i) => {
      if (i > 0) out.push(i === iids.length - 1 ? ' and ' : ', ');
      out.push(cardRef(view, iid, cardIds ? cardIds[i] : undefined));
    });
    return out;
  }

  const LINES = {
    start: (e, v) => [`Match start: ${e.data.mode === 'quick' ? 'quick match (one round)' : 'full match (best of 3)'}, ` +
      `${deckName(e.data.decks[0])} against ${deckName(e.data.decks[1])}.`],
    rps: (e, v) => [`Rock-paper-scissors: ${e.data.winner === v.viewer ? 'you win' : 'the opponent wins'}.`],
    chooseFirst: (e, v) => [`${U.who(v, e.data.by)} chose to go ${e.data.first === e.data.by ? 'first' : 'second'}` +
      ` (${U.seatWord(v, e.data.first)} will take the first turn).`],
    roundStart: (e, v) => [`Round ${e.data.round} begins. ${e.data.first === v.viewer ? 'You go first' : 'The opponent goes first'}. ${e.data.pp} PP per turn.`],
    tacticsPick: (e, v) => (e.data.hidden
      ? [`${U.who(v, e.seat)} picked a tactics card, face down.`]
      : [`${U.who(v, e.seat)} picked `, cardRef(v, e.data.iid, e.data.cardId), ' for the tactics area (face down).']),
    tacticsPlace: (e, v) => [`${U.whose(v, e.seat)} `, cardRef(v, e.data.iid, e.data.cardId), ' is placed face up in the tactics area.'],
    draw: (e, v) => (e.data.hidden
      ? [`${U.who(v, e.seat)} draw${e.seat === v.viewer ? '' : 's'} a card ${CAUSE_DRAW[e.data.cause]}.`]
      : [`${U.who(v, e.seat)} draw${e.seat === v.viewer ? '' : 's'} `, cardRef(v, e.data.iid, e.data.cardId), ` ${CAUSE_DRAW[e.data.cause]}.`]),
    turnStart: (e, v) => [`Turn ${e.data.turn}: ${e.seat === v.viewer ? 'your' : "the opponent's"} turn.`],
    turnEnd: (e, v) => [`${U.whose(v, e.seat)} turn ${e.data.turn} ends.`],
    ppRecover: (e, v) => [e.data.n === 0
      ? `${U.who(v, e.seat)} recover${e.seat === v.viewer ? '' : 's'} no PP (all were already ready).`
      : `${U.who(v, e.seat)} get${e.seat === v.viewer ? '' : 's'} ${e.data.n} PP back ` +
        `${e.data.cause === 'untap' ? 'at the start of the turn' : 'from an effect'}.`],
    ppSpend: (e, v) => [`${U.who(v, e.seat)} spend${e.seat === v.viewer ? '' : 's'} ${e.data.n} PP on `, cardRef(v, e.data.for), '.'],
    play: (e, v) => [`${U.who(v, e.seat)} play${e.seat === v.viewer ? '' : 's'} `, cardRef(v, e.data.iid, e.data.cardId),
      ` (${e.data.type}, ${e.data.cost} PP).`],
    tacticsPlay: (e, v) => [`${U.who(v, e.seat)} play${e.seat === v.viewer ? '' : 's'} `, cardRef(v, e.data.iid, e.data.cardId),
      ` from the tactics area (${e.data.subtype === 'equipment' ? 'equipment' : 'one-use'}, ${e.data.cost} PP).`],
    equip: (e, v) => [cardRef(v, e.data.iid, e.data.cardId), ' is equipped to ', leaderRef(v, e.data.leader), '.'],
    boost: (e, v) => (e.data.phase === 'armed'
      ? [cardRef(v, e.data.iid, e.data.cardId), e.data.afterOnly === true
        ? ` is armed: ${e.seat === v.viewer ? 'your' : "the opponent's"} next attack gets its After Attack effect.`
        : ` is armed: ${e.seat === v.viewer ? 'your' : "the opponent's"} next attack gets stronger.`]
      : [cardRef(v, e.data.iid, e.data.cardId), e.data.amount === 0 ? ' adds its effect to the attack.' : ` adds ${e.data.amount} damage to the attack.`]),
    attack: (e, v) => {
      const p = e.data.parts;
      const bits = [`ATK ${p.atk}`];
      if (p.boost) bits.push(`boosts ${p.boost}`);
      if (p.card) bits.push(`card ${p.card}`);
      return [leaderRef(v, e.data.attacker), ' attacks ', leaderRef(v, e.data.target), ' with ', cardRef(v, e.data.card),
        `: ${e.data.damage} damage (${bits.join(' + ')}).`];
    },
    damage: (e, v) => [leaderRef(v, e.data.leader), ` takes ${e.data.amount} damage${e.data.kind === 'effect' ? ' from an effect' : ''} ` +
      `(damage ${e.data.before} to ${e.data.after}).`],
    heal: (e, v) => [leaderRef(v, e.data.leader), e.data.amount === 0
      ? ' had nothing to heal.'
      : ` heals ${e.data.amount}${e.data.amount < e.data.requested ? ` (of ${e.data.requested})` : ''}.`],
    down: (e, v) => [leaderRef(v, e.data.leader), e.data.cause === 'attack' ? " goes down (the attack's own effect)." : ' goes down.'],
    awaken: (e, v) => [leaderRef(v, e.data.leader), ` AWAKENS! Now ATK ${e.data.atk}, HP ${e.data.hp}.`],
    ability: (e, v) => [cardRef(v, e.data.src, e.data.cardId), ` triggers its ${timingWord(e.data.timing)} effect.`],
    discard: (e, v) => (e.data.hidden
      ? [`${U.who(v, e.seat)} discard${e.seat === v.viewer ? '' : 's'} ${U.plural(e.data.n, 'card')} from hand ${CAUSE_DISCARD[e.data.cause]}, face down.`]
      : [`${U.who(v, e.seat)} discard${e.seat === v.viewer ? '' : 's'} `, ...cardList(v, e.data.iids, e.data.cardIds),
          ` ${CAUSE_DISCARD[e.data.cause]} (face down in the trash).`]),
    trash: (e, v) => [`${e.data.cause === 'roundEnd' ? 'Round over' : 'End of turn'}: ${e.seat === v.viewer ? 'your' : "the opponent's"} `,
      ...cardList(v, e.data.iids, e.data.cardIds), ' go to the trash (tactics face up, the rest face down).'],
    reshuffle: (e, v) => [`${U.whose(v, e.seat)} deck ran short: the ${U.plural(e.data.n, 'face-down trash card')} are shuffled back in.`],
    tacticsBurn: (e, v) => [`Reshuffle penalty: ${e.seat === v.viewer ? 'your' : "the opponent's"} `,
      cardRef(v, e.data.iid, e.data.cardId), ' leaves the tactics deck and lands face up in the trash.'],
    roundEnd: (e, v) => [`Round ${e.data.round} goes to ${e.data.winner === null ? 'nobody' : FIRST_WORD(v, e.data.winner)}. ` +
      `Score ${e.data.wins[v.viewer]} to ${e.data.wins[1 - v.viewer]} (you first).`],
    matchEnd: (e, v) => [e.data.winner === null
      ? `Match over: nobody wins (${REASON[e.data.reason]}).`
      : `Match over: ${e.data.winner === v.viewer ? 'you win' : 'the opponent wins'} (${REASON[e.data.reason]}). ` +
        `Rounds ${e.data.wins[v.viewer]} to ${e.data.wins[1 - v.viewer]}.`],
    overkill: (e, v) => [`Overkill ${e.data.n} met! `, leaderRef(v, e.data.leader), ` took ${e.data.excess} more damage than it had HP left, so the Overkill effect of `, cardRef(v, e.data.card), ' happens.'],
    echo: (e, v) => [cardRef(v, e.data.iid, e.data.cardId), e.data.phase === 'sideways'
      ? ' echoes: it stays in the play area, turned sideways.'
      : ' echoes: it is played again for free.'],
    look: (e, v) => lookLine(e, v),
    freePlay: (e, v) => [`${U.who(v, e.seat)} play${e.seat === v.viewer ? '' : 's'} `, cardRef(v, e.data.iid, e.data.cardId),
      ` for free (${e.data.type}, from the ${e.data.from === 'deck' ? 'cards looked at' : 'hand'}).`],
    revive: (e, v) => [leaderRef(v, e.data.leader), ' is back on its feet' + (e.data.equipment.length ? ', and its equipment goes to the trash: ' : '.'),
      ...cardList(v, e.data.equipment, e.data.cardIds)],
    fizzle: (e, v) => [cardRef(v, e.data.src, e.data.cardId), e.data.reason === 'emptyHand'
      ? ': there was no card in hand, so nothing happened.'
      : ': there was nothing to target, so nothing happened.'],
  };
  // `look` entries: looking at / revealing / taking / trashing cards of a deck or the hand. The other seat gets only counts when the cards
  // were not revealed (data.hidden), so no card is named for them.
  function lookLine(e, v) {
    const d = e.data;
    const me = e.seat === v.viewer;
    const who = U.who(v, e.seat), s = me ? '' : 's';
    const deckOf = d.side === v.viewer ? 'your deck' : "the opponent's deck";
    const cards = d.hidden === true ? [U.plural(d.n, 'card')] : cardList(v, d.iids, d.cardIds);
    switch (d.phase) {
      case 'see': return d.hidden === true
        ? [`${who} look${s} at the top ${U.plural(d.n, 'card')} of ${deckOf}.`]
        : [`${who} look${s} at the top ${U.plural(d.n, 'card')} of ${deckOf}: `, ...cards, '.'];
      case 'reveal': return d.from === 'hand'
        ? [`${who} reveal${s} `, ...cards, ' from hand.']
        : [`${who} reveal${s} the top ${U.plural(d.n, 'card')} of ${deckOf}: `, ...cards, '.'];
      case 'take': return [`${who} add${s} `, ...cards, ' to hand.'];
      case 'trash': return [`${who} put${me ? '' : 's'} `, ...cards, ` from ${deckOf} into the trash.`];
      default: throw new Error('ui/logtext: unknown look phase ' + d.phase);
    }
  }
  const TIMING = { onPlay: 'play', attack: 'attack', afterAttack: 'after-attack', boost: 'boost', onAwaken: 'awaken', round: 'round', static: 'passive' };

  function timingWord(t) {
    if (TIMING[t] === undefined) throw new Error('ui/logtext: unknown effect timing ' + t);
    return TIMING[t];
  }
  function deckName(id) {
    const d = XS.DECKS[id];
    return d === undefined ? id : `${id} ${d.nameEn}`;
  }

  U.LOG_TYPES = Object.keys(LINES);

  U.logText = function (entry, view) {
    const f = LINES[entry.type];
    if (f === undefined) throw new Error('ui/logtext: no player-facing line for log type "' + entry.type + '"');
    const segs = f(entry, view);
    let text = '';
    for (const s of segs) text += typeof s === 'string' ? s : U.cardTitle(s.card);
    return { text, segs };
  };

  // Segments -> DOM (card names become hover-zoom doorways: data-card / data-iid).
  U.segsToNode = function (segs, tag) {
    const root = U.el(tag || 'span', 'lt');
    for (const s of segs) {
      if (typeof s === 'string') { root.appendChild(document.createTextNode(s)); continue; }
      const a = U.el('span', 'cardref', U.cardTitle(s.card));
      a.setAttribute('data-card', s.card);
      if (s.iid !== undefined) a.setAttribute('data-iid', s.iid);
      root.appendChild(a);
    }
    return root;
  };
})();
