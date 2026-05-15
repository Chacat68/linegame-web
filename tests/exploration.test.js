import { beforeEach, describe, expect, it } from 'vitest';
import * as Economy from '../js/systems/economy/Economy.js';
import * as GalaxyData from '../js/systems/galaxy/GalaxyDataLayer.js';
import * as Exploration from '../js/systems/galaxy/ExplorationSystem.js';
import { createTestState } from './helpers.js';

describe('ExplorationSystem', function () {
  let state;

  beforeEach(function () {
    state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      fuel: 100,
      maxFuel: 100,
      credits: 2000,
      shipHull: 100,
      maxHull: 100,
      researchedTechs: [],
    });

    Economy.init();
    GalaxyData.init(state);
  });

  it('扫描后应揭示当前星球的 POI 并生成测绘收益', function () {
    const startingCredits = state.credits;
    const beforeScan = GalaxyData.getPlanetData('sol_prime');
    expect(beforeScan.exploration.scanLevel).toBe(0);
    expect(beforeScan.exploration.pois.every(function (poi) { return poi.discovered === false; })).toBe(true);

    const result = Exploration.scanSystem(state, 'sol_prime');

    expect(result.ok).toBe(true);
    expect(result.meta.scanSignalGrade).toBeTruthy();
    expect(result.meta.scanLandingFeeDiscount).toBeGreaterThan(0);
    expect(result.meta.scanYield.credits).toBeGreaterThan(0);
    expect(result.meta.scanDirective.poiId).toBeTruthy();
    const afterScan = GalaxyData.getPlanetData('sol_prime');
    expect(afterScan.exploration.scanLevel).toBeGreaterThan(0);
    expect(afterScan.exploration.pois.every(function (poi) { return poi.discovered === true; })).toBe(true);
    expect(afterScan.exploration.scanPriorityPoiId).toBeTruthy();
    expect(afterScan.exploration.reports.some(function (report) {
      return report.id === 'sol_prime_report_scan';
    })).toBe(true);
    expect(state.fuel).toBeLessThan(100);
    expect(state.credits).toBeGreaterThan(startingCredits);
  });

  it('扫描预览应反映深度扫描折扣与可执行性', function () {
    const planet = GalaxyData.getPlanetData('sol_prime');
    const preview = Exploration.getScanStatus(state, 'sol_prime', {
      scanFuelDiscount: 0.5,
      forceDeepScan: true,
    });

    expect(preview.canScan).toBe(true);
    expect(preview.scanMode).toBe('deep');
    expect(preview.scanFuelCost).toBe(2);
    expect(preview.poiCount).toBe(planet.exploration.pois.length);
    expect(preview.scanLandingFeeDiscount).toBeGreaterThan(0.2);
    expect(preview.scanSignalGrade).toBeTruthy();
    expect(preview.actionLabel).toContain('2 燃料');
  });

  it('扫描预览应在燃料不足时给出阻塞原因', function () {
    state.fuel = 1;

    const preview = Exploration.getScanStatus(state, 'sol_prime');

    expect(preview.canScan).toBe(false);
    expect(preview.reason).toBe('insufficient-fuel');
    expect(preview.blockedReason).toContain('燃料不足');
  });

  it('着陆预览应反映折扣费用与可调查 POI 数量', function () {
    expect(Exploration.scanSystem(state, 'sol_prime').ok).toBe(true);

    const preview = Exploration.getLandingStatus(state, 'sol_prime', {
      landingFeeDiscount: 0.25,
    });

    expect(preview.canLand).toBe(true);
    expect(preview.landingFee).toBeLessThan(45);
    expect(preview.unresolvedPoiCount).toBe(3);
    expect(preview.detailText).toContain('扫描校准');
  });

  it('POI 预览应说明调查收益或风险', function () {
    const basePlanet = GalaxyData.getPlanetData('sol_prime');
    const anomalyPoi = basePlanet.exploration.pois.find(function (poi) {
      return poi.kind === 'anomaly_site';
    });

    expect(Exploration.scanSystem(state, 'sol_prime').ok).toBe(true);
    expect(Exploration.landOnSystem(state, 'sol_prime').ok).toBe(true);

    const preview = Exploration.getPoiStatus(state, 'sol_prime', anomalyPoi.id);

    expect(preview.canExplore).toBe(true);
    expect(preview.actionLabel).toContain('无成本');
    expect(preview.detailText).toContain('舰体');
  });

  it('探索摘要应提供威胁评级、机会焦点与完探奖励说明', function () {
    const summary = Exploration.getSurveySummary(state, 'sol_prime');

    expect(summary).toBeTruthy();
    expect(summary.threatLabel).toBeTruthy();
    expect(summary.opportunityLabel).toBeTruthy();
    expect(summary.completionRewardLabel).toBeTruthy();
    expect(summary.intelLevel).toBe(0);
    expect(summary.reportCount).toBe(0);
  });

  it('着陆前必须先完成扫描', function () {
    const result = Exploration.landOnSystem(state, 'sol_prime');

    expect(result.ok).toBe(false);
    expect(result.msgs[0].text).toContain('请先完成轨道扫描');
  });

  it('调查资源点后应生成勘探报告并提升情报等级', function () {
    const basePlanet = GalaxyData.getPlanetData('sol_prime');
    const resourcePoi = basePlanet.exploration.pois.find(function (poi) {
      return poi.kind === 'resource_cache';
    });

    expect(Exploration.scanSystem(state, 'sol_prime').ok).toBe(true);
    expect(Exploration.landOnSystem(state, 'sol_prime').ok).toBe(true);

    const result = Exploration.explorePoi(state, 'sol_prime', resourcePoi.id);
    const summary = Exploration.getSurveySummary(state, 'sol_prime');

    expect(result.ok).toBe(true);
    expect(summary.reportCount).toBe(2);
    expect(summary.intelLevel).toBeGreaterThan(0);
    expect(summary.reports.some(function (report) {
      return report.title.indexOf('清单') !== -1;
    })).toBe(true);
  });

  it('调查秘密航线信标后应降低对应航线燃料消耗', function () {
    const basePlanet = GalaxyData.getPlanetData('sol_prime');
    const routePoi = basePlanet.exploration.pois.find(function (poi) {
      return poi.kind === 'route_beacon';
    });
    const targetSystemId = basePlanet.exploration.secretRoutes[0].targetSystemId;

    expect(routePoi).toBeTruthy();
    expect(targetSystemId).toBeTruthy();

    const baseCost = Economy.getFuelCost('sol_prime', targetSystemId, 1, state);

    expect(Exploration.scanSystem(state, 'sol_prime').ok).toBe(true);
    expect(Exploration.landOnSystem(state, 'sol_prime').ok).toBe(true);
    expect(Exploration.explorePoi(state, 'sol_prime', routePoi.id).ok).toBe(true);

    const routeInfo = Exploration.getTravelRouteInfo(state, 'sol_prime', targetSystemId);
    const discountedCost = Economy.getFuelCost('sol_prime', targetSystemId, 1, state);

    expect(routeInfo.active).toBe(true);
    expect(discountedCost).toBeLessThan(baseCost);
  });

  it('当前星球应返回可用于地图渲染的已发现暗线摘要', function () {
    const basePlanet = GalaxyData.getPlanetData('sol_prime');
    const routePoi = basePlanet.exploration.pois.find(function (poi) {
      return poi.kind === 'route_beacon';
    });

    expect(Exploration.getCurrentSystemSecretRoutes(state)).toEqual([]);

    Exploration.scanSystem(state, 'sol_prime');
    Exploration.landOnSystem(state, 'sol_prime');
    Exploration.explorePoi(state, 'sol_prime', routePoi.id);

    const routes = Exploration.getCurrentSystemSecretRoutes(state);

    expect(routes).toHaveLength(1);
    expect(routes[0].sourceSystemId).toBe('sol_prime');
    expect(routes[0].targetSystemId).toBeTruthy();
    expect(routes[0].discountPercent).toBeGreaterThan(0);
  });

  it('完成全部 POI 后应发放完探奖励并归档完成报告', function () {
    const startingCredits = state.credits;

    expect(Exploration.scanSystem(state, 'sol_prime').ok).toBe(true);
    expect(Exploration.landOnSystem(state, 'sol_prime').ok).toBe(true);

    GalaxyData.getPlanetData('sol_prime').exploration.pois.forEach(function (poi) {
      const result = Exploration.explorePoi(state, 'sol_prime', poi.id);
      expect(result.ok).toBe(true);
    });

    const summary = Exploration.getSurveySummary(state, 'sol_prime');

    expect(summary.completed).toBe(true);
    expect(summary.completionBonusClaimed).toBe(true);
    expect(summary.reportCount).toBe(5);
    expect(summary.reports.some(function (report) {
      return report.id === 'sol_prime_report_completion';
    })).toBe(true);
    expect(state.credits).toBeGreaterThan(startingCredits);
  });

  it('科研型星球完探后应缩短当前研究进度', function () {
    state = createTestState({
      currentSystem: 'nova_station',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      fuel: 100,
      maxFuel: 100,
      credits: 2000,
      shipHull: 100,
      maxHull: 100,
      researchedTechs: [],
      currentResearch: { techId: 'deep_scanner', daysLeft: 3 },
      researchQueue: [],
      researchOptions: [],
    });

    Economy.init();
    GalaxyData.init(state);

    expect(Exploration.scanSystem(state, 'nova_station').ok).toBe(true);
    expect(Exploration.landOnSystem(state, 'nova_station').ok).toBe(true);

    GalaxyData.getPlanetData('nova_station').exploration.pois.forEach(function (poi) {
      const result = Exploration.explorePoi(state, 'nova_station', poi.id);
      expect(result.ok).toBe(true);
    });

    const summary = Exploration.getSurveySummary(state, 'nova_station');

    expect(state.currentResearch.daysLeft).toBe(2);
    expect(summary.completionBonusClaimed).toBe(true);
    expect(summary.reports.some(function (report) {
      return report.id === 'nova_station_report_completion';
    })).toBe(true);
  });

  it('恢复旧存档时应补齐默认探索状态', function () {
    GalaxyData.restorePlanetStates({
      sol_prime: {
        id: 'sol_prime',
        owner: 'player',
        status: 'normal',
      },
    });

    const restoredPlanet = GalaxyData.getPlanetData('sol_prime');

    expect(restoredPlanet.exploration).toBeTruthy();
    expect(Array.isArray(restoredPlanet.exploration.pois)).toBe(true);
    expect(Array.isArray(restoredPlanet.exploration.secretRoutes)).toBe(true);
    expect(Array.isArray(restoredPlanet.exploration.reports)).toBe(true);
    expect(restoredPlanet.exploration.completionRewardLabel).toBeTruthy();
  });
});
