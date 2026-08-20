import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createTestState } from './helpers.js';
import * as GalaxyData from '../js/systems/galaxy/GalaxyDataLayer.js';
import { findSystem } from '../js/data/systems.js';
import {
  buildMapPlanetDetailView,
  buildMapPlanetTravelAction,
} from '../js/ui/MapPlanetDetailPresenter.js';

describe('MapPlanetDetailPresenter', function () {
  it('保持无 DOM 的 presenter 边界，MapUI 不再拥有星球 HTML 与领域 selector', function () {
    var source = readFileSync('js/ui/MapPlanetDetailPresenter.js', 'utf8');
    var mapSource = readFileSync('js/ui/MapUI.js', 'utf8');

    expect(source).not.toMatch(/\bdocument\b|\bwindow\b|addEventListener|innerHTML/);
    expect(source).not.toContain('GameManager');
    expect(mapSource).toContain("from './MapPlanetDetailPresenter.js'");
    expect(mapSource).not.toContain('Faction.getFactionForSystem');
    expect(mapSource).not.toContain('Economy.getFuelCost');
    expect(mapSource).not.toContain('function _buildPlanetDetailSummaryShell');
    expect(mapSource).not.toContain('function _buildNavigationGuideRoutePlan');
  });

  it('统一输出当前停靠、维修阻塞与可出航 intent', function () {
    var state = createTestState({
      currentGalaxy: 'milky_way',
      currentSystem: 'sol_prime',
      playerLevel: 10,
      researchedTechs: [],
    });
    var current = buildMapPlanetTravelAction(state, findSystem('sol_prime'));
    var available = buildMapPlanetTravelAction(state, findSystem('nova_station'));

    expect(current).toMatchObject({ disabled: true, label: '当前停靠中', systemId: 'sol_prime' });
    expect(available).toMatchObject({ disabled: false, label: '前往该星球', systemId: 'nova_station' });
    expect(Object.isFrozen(current)).toBe(true);
    expect(Object.isFrozen(available)).toBe(true);

    state.activeShipIndex = 0;
    state.fleet = [{ repairJob: { remainingDays: 2 } }];
    expect(buildMapPlanetTravelAction(state, findSystem('nova_station'))).toMatchObject({
      disabled: true,
      label: '维修中',
      hint: '剩余 2 天，维修完成后方可出航。',
    });
  });

  it('输出不可变的锁定详情、局部航线焦点、探索 intent 与披露状态', function () {
    var state = createTestState({
      currentGalaxy: 'milky_way',
      currentSystem: 'sol_prime',
      fuel: 100,
      maxFuel: 100,
      playerLevel: 10,
      researchedTechs: [],
    });
    GalaxyData.init(state);
    var view = buildMapPlanetDetailView(state, 'nova_station', {
      selectedSystemId: 'nova_station',
      navigationGuideFocus: { systemId: 'nova_station', goodId: 'food' },
      getPoiStatus: function () { return { actionLabel: '开始调查', canExplore: true }; },
      isDisclosureOpen: function (sectionId) { return sectionId === 'archive'; },
    });

    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.anchor)).toBe(true);
    expect(Object.isFrozen(view.guideFocus)).toBe(true);
    expect(Object.isFrozen(view.travelAction)).toBe(true);
    expect(view).toMatchObject({ isPinned: true, systemId: 'nova_station' });
    expect(view.html).toContain('class="planet-detail-scroll-body"');
    expect(view.html).toContain('航线焦点');
    expect(view.html).toContain('卖出 食物');
    expect(view.html).toContain('data-planet-guide-route');
    expect(view.html).toContain('data-planet-detail-action="travel"');
    expect(view.html).toContain('data-planet-detail-action="open-survey"');
    expect(view.html).toContain('data-detail-section="archive" open');
    expect(view.html).toContain('探索点清单');
    expect(view.html).not.toContain('data-exploration-action="poi"');
    expect(view.html).not.toContain('当前建议');
    expect(view.html).not.toContain('下一步');
  });

  it('转义星球元数据，未锁定的 hover 摘要不复制完整探索终端', function () {
    var state = createTestState({
      currentGalaxy: 'milky_way',
      currentSystem: 'nova_station',
      playerLevel: 10,
      researchedTechs: [],
    });
    var unsafeSystem = Object.assign({}, findSystem('sol_prime'), {
      description: '<script>bad()</script>',
      name: '<img src=x>',
    });
    var view = buildMapPlanetDetailView(state, 'sol_prime', {
      system: unsafeSystem,
      planetData: { exploration: { pois: [], secretRoutes: [] } },
      selectedSystemId: null,
    });

    expect(view.isPinned).toBe(false);
    expect(view.html).toContain('&lt;img src=x&gt;');
    expect(view.html).toContain('&lt;script&gt;bad()&lt;/script&gt;');
    expect(view.html).not.toContain('<script>');
    expect(view.html).not.toContain('data-exploration-action="poi"');
    expect(view.html).not.toContain('planet-detail-archive-launcher');
  });
});
