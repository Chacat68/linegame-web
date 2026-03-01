// js/economy.js — Market price simulation
//
// In a production build, the hot-path arithmetic (calculatePrice) would be
// compiled to a WebAssembly module (e.g. from Rust/C++) for performance.
// Here we use an identical JavaScript implementation that mirrors the
// expected WASM export surface.

'use strict';

const Economy = (function () {
  // Daily price noise per (system, good) pair
  const _modifiers = {};

  // ---------------------------------------------------------------------------
  // "WASM polyfill" — functions whose signatures match the planned wasm exports
  // ---------------------------------------------------------------------------

  /**
   * calculatePrice(basePrice, systemMultiplier, dayModifier) → integer price
   * Would be exported from a compiled WebAssembly module in production.
   */
  function calculatePrice(basePrice, systemMultiplier, dayModifier) {
    return Math.round(basePrice * systemMultiplier * dayModifier);
  }

  /**
   * euclideanDistance(x1, y1, x2, y2) → float
   * Would be a WASM export for performance in large trade graphs.
   */
  function euclideanDistance(x1, y1, x2, y2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  function init() {
    _randomiseModifiers();
  }

  function _randomiseModifiers() {
    SYSTEMS.forEach(function (sys) {
      _modifiers[sys.id] = {};
      GOODS.forEach(function (good) {
        _modifiers[sys.id][good.id] = 0.75 + Math.random() * 0.5; // [0.75, 1.25]
      });
    });
  }

  function advanceDay() {
    SYSTEMS.forEach(function (sys) {
      GOODS.forEach(function (good) {
        let m = _modifiers[sys.id][good.id] + (Math.random() - 0.5) * 0.15;
        _modifiers[sys.id][good.id] = Math.max(0.55, Math.min(1.45, m));
      });
    });

    // Random price spike event (30 % chance per day)
    if (Math.random() < 0.30) {
      const sys  = SYSTEMS[Math.floor(Math.random() * SYSTEMS.length)];
      const good = GOODS[Math.floor(Math.random() * GOODS.length)];
      _modifiers[sys.id][good.id] = 1.8 + Math.random() * 0.6;
    }
  }

  function getBuyPrice(systemId, goodId) {
    const sys  = SYSTEMS.find(function (s) { return s.id === systemId; });
    const good = GOODS.find(function (g) { return g.id === goodId; });
    const m    = _modifiers[systemId][goodId] * sys.prices[goodId];
    return calculatePrice(good.basePrice, m, 1.10); // 10 % buy markup
  }

  function getSellPrice(systemId, goodId) {
    const sys  = SYSTEMS.find(function (s) { return s.id === systemId; });
    const good = GOODS.find(function (g) { return g.id === goodId; });
    const m    = _modifiers[systemId][goodId] * sys.prices[goodId];
    return calculatePrice(good.basePrice, m, 0.95); // 5 % sell discount
  }

  function getFuelCost(fromId, toId, efficiency) {
    const s1   = SYSTEMS.find(function (s) { return s.id === fromId; });
    const s2   = SYSTEMS.find(function (s) { return s.id === toId; });
    const dist = euclideanDistance(s1.x, s1.y, s2.x, s2.y);
    return Math.max(1, Math.ceil(dist * 100 * FUEL_COST_PER_UNIT * efficiency));
  }

  function getSystemMultiplier(systemId, goodId) {
    return SYSTEMS.find(function (s) { return s.id === systemId; }).prices[goodId];
  }

  return { init, advanceDay, getBuyPrice, getSellPrice, getFuelCost, getSystemMultiplier };
}());
