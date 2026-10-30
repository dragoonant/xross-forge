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
  '../../data/tags.js?v=d05e18e233',
  '../../data/cards.js?v=c961b48a5c',
  '../../data/decks.js?v=a23cbc6da5',
  '../../data/abilities.js?v=bafac27c28',
  '../../data/art-manifest.js?v=3f9445dbcb',
  '../../data/sound-manifest.js?v=1f6724961e',
  '../engine/state.js?v=a1a0e7429e',
  '../engine/log.js?v=d7d546723a',
  '../engine/doors.js?v=38d30dbdf5',
  '../engine/abilities.js?v=b3fb7a03d6',
  '../engine/attack.js?v=320a253b66',
  '../engine/flow.js?v=5af106082c',
  '../engine/api.js?v=45ab9532d9',
  './determinize.js?v=0a4954de31',
  './eval.js?v=9abe927716',
  './policies.js?v=ed7f5483be',
  './ai.js?v=3cd8e16f76',
];
importScripts(...SCRIPTS);

self.onmessage = (ev) => {
  globalThis.XS.ai.serve(ev.data, (out) => self.postMessage(out), () => performance.now());
};
self.postMessage({ type: 'ready', scripts: SCRIPTS.length });
