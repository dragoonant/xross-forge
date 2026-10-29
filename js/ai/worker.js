// js/ai/worker.js: the AI in a Web Worker (M4 requirement 7). It loads the SAME engine, data and AI scripts as index.html and
// tests.html through importScripts; the list below is kept equal to the pages' <!-- engine --> and <!-- ai --> blocks by
// tools/check-pages.mjs (a worker missing one script is an AI that never loads). Paths are relative to this file. The page
// opens the worker as js/ai/worker.js?v=<stamp> and every import repeats that query, so a deploy busts the cache of all of them.
//
//   page -> worker  { type: 'decide', id, view, tier, seed, budgetMs?, decks? }   (a seat's XS.view: the worker never sees raw state)
//   worker -> page  { type: 'ready' } once, then per request 'partial' (best so far), then 'result' or 'error'
'use strict';
const SCRIPTS = [
  '../ns.js',
  '../rng.js',
  '../../data/defects.js',
  '../../data/tags.js',
  '../../data/cards.js',
  '../../data/decks.js',
  '../../data/abilities.js',
  '../../data/art-manifest.js',
  '../../data/sound-manifest.js',
  '../engine/state.js',
  '../engine/log.js',
  '../engine/doors.js',
  '../engine/abilities.js',
  '../engine/attack.js',
  '../engine/flow.js',
  '../engine/api.js',
  './determinize.js',
  './eval.js',
  './policies.js',
  './ai.js',
];
importScripts(...SCRIPTS.map((u) => u + self.location.search));

self.onmessage = (ev) => {
  globalThis.XS.ai.serve(ev.data, (out) => self.postMessage(out), () => performance.now());
};
self.postMessage({ type: 'ready', scripts: SCRIPTS.length });
