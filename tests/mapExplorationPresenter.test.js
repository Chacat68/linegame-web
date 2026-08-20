import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildMapExplorationFlow,
  buildMapExplorationSection,
} from '../js/ui/MapExplorationPresenter.js';

function createPlanetData(overrides) {
  return {
    exploration: Object.assign({
      pois: [
        { id: 'ruins', icon: '🏛️', name: '古代遗迹', resolved: false },
        { id: 'beacon', icon: '📡', name: '航线信标', resolved: false },
      ],
      secretRoutes: [],
    }, overrides || {}),
  };
}

function createSurveySummary(overrides) {
  return Object.assign({
    anomalyChainCount: 0,
    anomalyChains: [],
    completionBonusClaimed: false,
    completionRewardLabel: '100 积分',
    intelLevel: 1,
    opportunityLabel: '本地机会',
    reportCount: 0,
    reports: [],
    resolvedAnomalyChainCount: 0,
    threatLabel: '低风险',
  }, overrides || {});
}

describe('MapExplorationPresenter', function () {
  it('保持无 DOM 的纯 presenter 边界，并由 MapUI 单向依赖', function () {
    var source = readFileSync('js/ui/MapExplorationPresenter.js', 'utf8');
    var mapSource = readFileSync('js/ui/MapUI.js', 'utf8');
    var planetSource = readFileSync('js/ui/MapPlanetDetailPresenter.js', 'utf8');

    expect(source).not.toMatch(/\bdocument\b|\bwindow\b|addEventListener|innerHTML/);
    expect(source).not.toContain('GameManager');
    expect(planetSource).toContain("from './MapExplorationPresenter.js'");
    expect(mapSource).toContain("from './MapPlanetDetailPresenter.js'");
    expect(mapSource).not.toContain("from './MapExplorationPresenter.js'");
    expect(mapSource).not.toContain('function _getExplorationFlow');
    expect(mapSource).not.toContain('function _buildExplorationActionButton');
  });

  it('组合多探索点阻塞状态，但不修改输入数据', function () {
    var state = { currentSystem: 'sol_prime' };
    var system = { id: 'sol_prime', minLevel: 1 };
    var planetData = createPlanetData();
    var before = JSON.stringify(planetData);
    var calls = [];

    var flow = buildMapExplorationFlow(state, system, planetData, {
      isCurrentSystem: true,
      isUnlocked: true,
      getPoiStatus: function (_state, systemId, poiId) {
        calls.push([systemId, poiId]);
        return poiId === 'ruins'
          ? { actionLabel: '需要修复', blockedReason: '护盾不足', canExplore: false, detailText: '辐射过强' }
          : { actionLabel: '调查信标', canExplore: true };
      },
    });

    expect(flow.phase).toBe('待调查');
    expect(flow.nextAction).toEqual(expect.objectContaining({
      disabled: true,
      poiId: 'ruins',
      systemId: 'sol_prime',
      title: '护盾不足',
    }));
    expect(flow.detail).toContain('辐射过强');
    expect(flow.secondaryNote).toContain('护盾不足');
    expect(flow.secondaryNote).toContain('2 个探索点待调查');
    expect(calls).toEqual([['sol_prime', 'ruins']]);
    expect(JSON.stringify(planetData)).toBe(before);
  });

  it('输出稳定 POI intent、披露状态和安全转义后的探索详情', function () {
    var state = { currentSystem: 'sol_prime' };
    var system = { id: 'sol_prime', name: '太阳系', minLevel: 1 };
    var planetData = createPlanetData({
      pois: [
        { id: 'unsafe', icon: '⚠️', name: '<script>危险</script>', resolved: false },
        { id: 'done', icon: '✅', name: '已完成', resolved: true },
      ],
      secretRoutes: [
        { discovered: true, fuelMultiplier: 0.75, targetSystemId: 'nova', targetSystemName: '<b>新星</b>' },
      ],
    });

    var html = buildMapExplorationSection(state, system, planetData, {
      isCurrentSystem: true,
      isUnlocked: true,
      getPoiStatus: function () {
        return { actionLabel: '调查危险点', canExplore: true };
      },
      getSurveySummary: function () {
        return createSurveySummary();
      },
      getTravelRouteInfo: function () {
        return { active: true, fuelMultiplier: 0.75 };
      },
      isDisclosureOpen: function (sectionId) {
        return sectionId === 'poi';
      },
    });

    expect(html).toContain('data-exploration-action="poi"');
    expect(html).toContain('data-system-id="sol_prime"');
    expect(html).toContain('data-poi-id="unsafe"');
    expect(html).toContain('data-detail-section="poi" open');
    expect(html).toContain('data-detail-section="routes"');
    expect(html).toContain('燃料 -25%');
    expect(html).toContain('&lt;script&gt;危险&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;新星&lt;/b&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>新星</b>');
  });

  it('区分远程、锁定和完成状态，不为非当前地点发布 POI intent', function () {
    var state = { currentSystem: 'sol_prime' };
    var system = { id: 'nova', name: '新星站', minLevel: 4 };
    var remote = buildMapExplorationFlow(state, system, createPlanetData(), {
      isCurrentSystem: false,
      isUnlocked: true,
    });
    var locked = buildMapExplorationFlow(state, system, createPlanetData(), {
      isCurrentSystem: false,
      isUnlocked: false,
    });
    var completed = buildMapExplorationFlow(state, system, createPlanetData({
      pois: [{ id: 'done', icon: '✅', name: '已完成', resolved: true }],
      secretRoutes: [{ discovered: true, targetSystemId: 'sol_prime', targetSystemName: '太阳系' }],
    }), { isCurrentSystem: true, isUnlocked: true });

    expect(remote.phase).toBe('抵达后可继续');
    expect(remote.nextAction).toBeNull();
    expect(locked.phase).toBe('尚未解锁');
    expect(locked.detail).toContain('Lv.4');
    expect(completed.phase).toBe('探索完成');
    expect(completed.title).toContain('隐藏航线已加入地图');
    expect(completed.nextAction).toBeNull();
  });
});
