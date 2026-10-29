// Namespace and the one error class. Loaded first by index.html and tests.html.
// Plain browser JS, no build step, no dependencies: every file is an IIFE on globalThis.XS and
// index.html's script list is the load order.
(function () {
  const XS = (globalThis.XS = globalThis.XS || {});

  // apply() never mutates its input (the contract carried over from lorecannae's docs/ENGINE-API.md): it
  // clones, then works on the copy. structuredClone is in Node 17+ and every current browser.
  XS.clone = typeof structuredClone === 'function'
    ? (o) => structuredClone(o)
    : (o) => JSON.parse(JSON.stringify(o));

  // Thrown by apply() for an action that is not legal in the state it was given.
  class Illegal extends Error { constructor(msg) { super(msg); this.name = 'Illegal'; } }
  XS.Illegal = Illegal;
})();
