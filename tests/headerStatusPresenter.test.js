import { beforeEach, describe, expect, it } from 'vitest';
import { createTestState } from './helpers.js';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import { renderGalaxyViewSummary, renderHeaderStatus } from '../js/ui/HeaderStatusPresenter.js';

function createElement() {
  var attributes = Object.create(null);
  return {
    dataset: {},
    style: {},
    textContent: '',
    setAttribute: function (name, value) { attributes[name] = String(value); },
    removeAttribute: function (name) { delete attributes[name]; },
    getAttribute: function (name) { return attributes[name]; },
  };
}

function createDocument(ids) {
  var elements = Object.create(null);
  (ids || []).forEach(function (id) { elements[id] = createElement(); });
  return {
    elements: elements,
    getElementById: function (id) { return elements[id] || null; },
  };
}

describe('HeaderStatusPresenter', function () {
  var state;

  beforeEach(function () {
    state = createTestState({
      credits: 4288,
      day: 17,
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      mapView: 'planets',
      fuel: 22,
      maxFuel: 100,
      shipHull: 80,
      maxHull: 100,
      cargo: { food: 18 },
      maxCargo: 20,
      reputation: 350,
      activeShipIndex: 0,
      fleet: [{ emoji: '🚀', name: '远航者' }],
    });
    Faction.init(state);
  });

  it('一次投影 Header 的权威资源、位置、舰船和无障碍 meter', function () {
    var doc = createDocument([
      'credits', 'galactic-day', 'current-location', 'location-desc', 'map-legend-location',
      'hdr-ship-name', 'hdr-reputation-value', 'hdr-reputation-fill', 'hdr-reputation-meter',
      'status-fuel-fill', 'status-fuel-pct', 'status-fuel-meter',
      'status-shield-fill', 'status-shield-pct', 'status-shield-meter',
      'status-cargo-fill', 'status-cargo-pct', 'status-cargo-meter',
      'hud-galactic-map-view', 'hud-galactic-map-focus', 'hud-galactic-map-caption', 'hud-galactic-map-toggle',
    ]);
    var toggleReadyCount = 0;

    var snapshot = renderHeaderStatus(state, doc, function () { toggleReadyCount += 1; });

    expect(doc.elements.credits.textContent).toBe('4,288');
    expect(doc.elements['galactic-day'].textContent).toBe('第 17 天');
    expect(doc.elements['current-location'].textContent).toContain('太阳主星');
    expect(doc.elements['current-location'].getAttribute('title')).toBe(doc.elements['current-location'].textContent);
    expect(doc.elements['hdr-ship-name'].textContent).toBe('🚀 远航者');
    expect(doc.elements['status-fuel-meter'].getAttribute('aria-valuetext')).toBe('燃料 22/100（22%）');
    expect(doc.elements['status-fuel-meter'].dataset.meterState).toBe('warning');
    expect(doc.elements['status-cargo-meter'].dataset.meterState).toBe('warning');
    expect(doc.elements['hdr-reputation-meter'].getAttribute('aria-valuenow')).toBe('350');
    expect(snapshot.cargoUsed).toBe(18);
    expect(snapshot.locationText).toContain('银河系');
    expect(toggleReadyCount).toBe(1);
  });

  it('星系工具投影只描述当前 map view，并交给控制器绑定动作', function () {
    var doc = createDocument([
      'hud-galactic-map-view', 'hud-galactic-map-focus', 'hud-galactic-map-caption', 'hud-galactic-map-toggle',
    ]);
    var toggleReadyCount = 0;
    state.mapView = 'galaxies';

    expect(renderGalaxyViewSummary(state, doc, function () { toggleReadyCount += 1; })).toBe(true);
    expect(doc.elements['hud-galactic-map-view'].textContent).toBe('星系总览');
    expect(doc.elements['hud-galactic-map-focus'].textContent).toContain('跃迁网络');
    expect(doc.elements['hud-galactic-map-toggle'].textContent).toBe('回到当前星系');
    expect(toggleReadyCount).toBe(1);
  });
});
