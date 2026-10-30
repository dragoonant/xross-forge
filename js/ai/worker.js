// js/ai/worker.js: the AI in a Web Worker (M4 requirement 7). It loads the SAME engine, data and AI scripts as index.html and
// tests.html through importScripts; the list below is kept equal to the pages' <!-- engine --> and <!-- ai --> blocks by
// tools/check-pages.mjs (a worker missing one script is an AI that never loads). Paths are relative to this file. Each path
// carries its own ?v=<content hash> (tools/stamp-assets.mjs rewrites them, and the page's worker URL too), so a deploy busts the
// cache of exactly the files that changed.
//
//   page -> worker  { type: 'decide', id, view, tier, seed, budgetMs?, decks? }   (a seat's XS.view: the worker never sees raw state)
//   worker -> page  { type: 'ready' } once, then per request 'partial' (best so far), then 'result' or 'error'
'use strict';
const SCRIPTS = [
  '../ns.js?v=d16e124dae',
  '../rng.js?v=dc20b6eb4a',
  '../../data/defects.js?v=e51ead7472',
  '../../data/tags.js?v=cbca268f59',
  '../../data/cards.js?v=624b1253ff',
  '../../data/decks.js?v=25122f7da8',
  '../../data/abilities.js?v=299f1d3e82',
  '../../data/abilities-bp01.js?v=a504220b53',
  '../../data/abilities-bp02.js?v=bd2a103de3',
  '../../data/abilities-bp03.js?v=75a9203880',
  '../../data/abilities-bp04.js?v=0ef4e13bff',
  '../../data/abilities-end.js?v=1db2b35959',
  '../../data/art-manifest.js?v=639e33f29a',
  '../../data/sound-manifest.js?v=74a9ad4523',
  '../engine/state.js?v=2c07dc3124',
  '../engine/log.js?v=d7d546723a',
  '../engine/doors.js?v=834beb9b3c',
  '../engine/abilities.js?v=145e481f71',
  '../engine/attack.js?v=c27d4a9a14',
  '../engine/flow.js?v=dbed6f084c',
  '../engine/api.js?v=57e240ac8b',
  './determinize.js?v=4ceeca1c72',
  './eval.js?v=9abe927716',
  './policies.js?v=96d82cd09e',
  './ai.js?v=3cd8e16f76',
];
importScripts(...SCRIPTS);

self.onmessage = (ev) => {
  globalThis.XS.ai.serve(ev.data, (out) => self.postMessage(out), () => performance.now());
};
self.postMessage({ type: 'ready', scripts: SCRIPTS.length });
