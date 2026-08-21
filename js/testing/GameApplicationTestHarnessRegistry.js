// js/testing/GameApplicationTestHarnessRegistry.js
//
// GameApplication owns the real singleton runtime graph. Tests may request a
// controlled harness for that singleton, but production modules must not expose
// test-only commands as part of the application API.

let _harnessFactory = null;

export function registerGameApplicationTestHarness(factory) {
  if (import.meta.env.MODE !== 'test') return false;
  if (typeof factory !== 'function') {
    throw new TypeError('GameApplication test harness factory must be a function.');
  }
  _harnessFactory = factory;
  return true;
}

export function getRegisteredGameApplicationTestHarness() {
  if (import.meta.env.MODE !== 'test') {
    throw new Error('GameApplication test harness is unavailable outside test mode.');
  }
  if (!_harnessFactory) {
    throw new Error('GameApplication test harness has not been registered.');
  }
  return _harnessFactory();
}
