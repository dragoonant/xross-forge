// Deep-freeze XS.ABIL after every abilities file has loaded, so cloneState can share the effect data
// between states (apply never mutates). Must be the last abilities script in every page's list.
(function () {
  const XS = globalThis.XS;
  (function freeze(o) {
    if (o === null || typeof o !== 'object' || Object.isFrozen(o)) return;
    Object.freeze(o);
    for (const k of Object.keys(o)) freeze(o[k]);
  })(XS.ABIL);
})();
