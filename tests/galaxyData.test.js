// tests/galaxyData.test.js — 星系数据层测试
import { describe, it, expect, beforeEach } from 'vitest';
import * as GalaxyData from '../js/systems/galaxy/GalaxyDataLayer.js';
import { INITIAL_STATE } from '../js/data/constants.js';
import { GALAXIES, SYSTEMS } from '../js/data/systems.js';

describe('GalaxyDataLayer', () => {
  beforeEach(() => {
    GalaxyData.init(INITIAL_STATE);
  });

  describe('init', () => {
    it('应该初始化所有星球状态', () => {
      const allStates = GalaxyData.getAllPlanetStates();
      expect(Object.keys(allStates).length).toBeGreaterThan(0);
    });

    it('应该为起始系统设置正确的所有者', () => {
      const solPrime = GalaxyData.getPlanetData('sol_prime');
      expect(solPrime).toBeTruthy();
      expect(solPrime.owner).toBe('player');
    });
  });

  describe('getGalaxyHierarchy', () => {
    it('应该返回完整的银河系层次结构', () => {
      const hierarchy = GalaxyData.getGalaxyHierarchy('milky_way');
      expect(hierarchy).toBeTruthy();
      expect(hierarchy.galaxy).toBeTruthy();
      expect(hierarchy.galaxy.id).toBe('milky_way');
      expect(hierarchy.sectors).toBeInstanceOf(Array);
      expect(hierarchy.allPlanets).toBeInstanceOf(Array);
      expect(hierarchy.allPlanets.length).toBeGreaterThan(0);
    });

    it('应该返回所有星球的运行时状态', () => {
      const hierarchy = GalaxyData.getGalaxyHierarchy('milky_way');
      const planet = hierarchy.allPlanets[0];
      expect(planet).toHaveProperty('id');
      expect(planet).toHaveProperty('name');
      expect(planet).toHaveProperty('owner');
      expect(planet).toHaveProperty('resources');
      expect(planet).toHaveProperty('status');
    });

    it('应该为不存在的星系返回 null', () => {
      const hierarchy = GalaxyData.getGalaxyHierarchy('invalid_galaxy');
      expect(hierarchy).toBeNull();
    });
  });

  describe('getPlanetData', () => {
    it('应该返回单个星球的完整数据', () => {
      const planet = GalaxyData.getPlanetData('sol_prime');
      expect(planet).toBeTruthy();
      expect(planet.id).toBe('sol_prime');
      expect(planet.name).toBe('太阳主星');
      expect(planet).toHaveProperty('type');
      expect(planet).toHaveProperty('position');
      expect(planet).toHaveProperty('owner');
      expect(planet).toHaveProperty('resources');
    });

    it('应该为不存在的星球返回 null', () => {
      const planet = GalaxyData.getPlanetData('invalid_planet');
      expect(planet).toBeNull();
    });

    it('8 个银河使用各自的异常点与探索链主题', () => {
      const sampledPlanets = GALAXIES.map(function (galaxy) {
        const system = SYSTEMS.find(function (entry) { return entry.galaxyId === galaxy.id; });
        return GalaxyData.getPlanetData(system.id);
      });
      const anomalyNames = new Set();
      const chainLabels = new Set();

      sampledPlanets.forEach(function (planet) {
        expect(planet.exploration.pois).toHaveLength(3);
        const anomaly = planet.exploration.pois.find(function (poi) { return poi.kind === 'anomaly_site'; });
        anomalyNames.add(anomaly.name);
        planet.exploration.pois.forEach(function (poi) { chainLabels.add(poi.chain.label); });
      });

      expect(anomalyNames.size).toBe(GALAXIES.length);
      expect(chainLabels.size).toBe(GALAXIES.length * 3);
    });
  });

  describe('updatePlanetState', () => {
    it('应该更新星球的运行时状态', () => {
      const planetId = 'sol_prime';
      const beforeUpdate = GalaxyData.getPlanetData(planetId);

      GalaxyData.updatePlanetState(planetId, {
        owner: 'federation',
        status: 'contested',
      });

      const afterUpdate = GalaxyData.getPlanetData(planetId);
      expect(afterUpdate.owner).toBe('federation');
      expect(afterUpdate.status).toBe('contested');
      expect(afterUpdate.lastUpdate).toBeGreaterThan(beforeUpdate.lastUpdate);
    });

    it('应该触发数据更新事件', () => {
      let eventFired = false;
      const unsubscribe = GalaxyData.subscribe(event => {
        if (event.type === 'planet_state_changed') {
          eventFired = true;
          expect(event.planetId).toBe('sol_prime');
          expect(event.changes.owner).toBe('syndicate');
        }
      });

      GalaxyData.updatePlanetState('sol_prime', { owner: 'syndicate' });
      expect(eventFired).toBe(true);

      unsubscribe();
    });
  });

  describe('batchUpdatePlanetStates', () => {
    it('应该批量更新多个星球', () => {
      const updates = {
        'sol_prime': { owner: 'federation' },
        'nova_station': { owner: 'technocracy' },
        'mineral_belt': { status: 'blockaded' },
      };

      GalaxyData.batchUpdatePlanetStates(updates);

      expect(GalaxyData.getPlanetData('sol_prime').owner).toBe('federation');
      expect(GalaxyData.getPlanetData('nova_station').owner).toBe('technocracy');
      expect(GalaxyData.getPlanetData('mineral_belt').status).toBe('blockaded');
    });

    it('应该触发批量更新事件', () => {
      let eventFired = false;
      const unsubscribe = GalaxyData.subscribe(event => {
        if (event.type === 'planets_batch_updated') {
          eventFired = true;
          expect(event.changes.length).toBeGreaterThan(0);
        }
      });

      GalaxyData.batchUpdatePlanetStates({
        'sol_prime': { owner: 'federation' },
      });

      expect(eventFired).toBe(true);
      unsubscribe();
    });
  });

  describe('getPlanetsByFaction', () => {
    it('应该返回指定势力控制的所有星球', () => {
      // 设置一些星球为 federation 控制
      GalaxyData.updatePlanetState('nova_station', { owner: 'federation' });
      GalaxyData.updatePlanetState('war_front', { owner: 'federation' });

      const federationPlanets = GalaxyData.getPlanetsByFaction('federation');
      expect(federationPlanets.length).toBeGreaterThan(0);
      expect(federationPlanets).toContain('nova_station');
      expect(federationPlanets).toContain('war_front');
    });

    it('应该为没有星球的势力返回空数组', () => {
      const planets = GalaxyData.getPlanetsByFaction('nonexistent_faction');
      expect(planets).toBeInstanceOf(Array);
      expect(planets.length).toBe(0);
    });
  });

  describe('getFactionDistribution', () => {
    it('应该计算星系中各势力的星球数量', () => {
      // 设置一些星球归属
      GalaxyData.batchUpdatePlanetStates({
        'nova_station': { owner: 'federation' },
        'war_front': { owner: 'federation' },
        'luxury_port': { owner: 'syndicate' },
        'gene_lab': { owner: 'technocracy' },
      });

      const distribution = GalaxyData.getFactionDistribution('milky_way');
      expect(distribution).toHaveProperty('federation');
      expect(distribution).toHaveProperty('syndicate');
      expect(distribution).toHaveProperty('technocracy');
      expect(distribution.federation).toBeGreaterThanOrEqual(2);
      expect(distribution.syndicate).toBeGreaterThanOrEqual(1);
      expect(distribution.technocracy).toBeGreaterThanOrEqual(1);
    });
  });

  describe('exportGalaxyConfig', () => {
    it('应该导出完整的星系配置', () => {
      const configJson = GalaxyData.exportGalaxyConfig('milky_way');
      expect(configJson).toBeTruthy();

      const config = JSON.parse(configJson);
      expect(config.version).toBe('1.0');
      expect(config.galaxy).toBeTruthy();
      expect(config.galaxy.id).toBe('milky_way');
      expect(config.planets).toBeInstanceOf(Array);
      expect(config.sectors).toBeInstanceOf(Array);
      expect(config.exportDate).toBeTruthy();
    });

    it('应该为不存在的星系返回 null', () => {
      const config = GalaxyData.exportGalaxyConfig('invalid_galaxy');
      expect(config).toBeNull();
    });
  });

  describe('importGalaxyConfig', () => {
    it('应该导入并应用星系配置', () => {
      const originalConfig = GalaxyData.exportGalaxyConfig('milky_way');
      const config = JSON.parse(originalConfig);

      // 修改配置
      config.planets[0].owner = 'test_faction';
      config.planets[0].resources = { test: 999 };

      const success = GalaxyData.importGalaxyConfig(JSON.stringify(config));
      expect(success).toBe(true);

      const planet = GalaxyData.getPlanetData(config.planets[0].id);
      expect(planet.owner).toBe('test_faction');
      expect(planet.resources.test).toBe(999);
    });

    it('应该拒绝无效的配置', () => {
      const success = GalaxyData.importGalaxyConfig('invalid json');
      expect(success).toBe(false);
    });

    it('应该拒绝缺少必要字段的配置', () => {
      const invalidConfig = JSON.stringify({ version: '1.0' });
      const success = GalaxyData.importGalaxyConfig(invalidConfig);
      expect(success).toBe(false);
    });
  });

  describe('subscribe/unsubscribe', () => {
    it('应该允许订阅和取消订阅事件', () => {
      let eventCount = 0;
      const unsubscribe = GalaxyData.subscribe(() => {
        eventCount++;
      });

      GalaxyData.updatePlanetState('sol_prime', { status: 'test1' });
      expect(eventCount).toBe(1);

      GalaxyData.updatePlanetState('sol_prime', { status: 'test2' });
      expect(eventCount).toBe(2);

      unsubscribe();

      GalaxyData.updatePlanetState('sol_prime', { status: 'test3' });
      expect(eventCount).toBe(2); // 应该保持不变
    });
  });

  describe('restorePlanetStates', () => {
    it('应该从存档恢复星球状态', () => {
      const savedStates = {
        'sol_prime': {
          id: 'sol_prime',
          owner: 'restored_faction',
          resources: { restored: 1 },
          status: 'restored_status',
          population: '999亿',
          lastUpdate: 12345,
        },
      };

      GalaxyData.restorePlanetStates(savedStates);

      const planet = GalaxyData.getPlanetData('sol_prime');
      expect(planet.owner).toBe('restored_faction');
      expect(planet.resources.restored).toBe(1);
      expect(planet.status).toBe('restored_status');
    });

    it('旧存档保留探索进度但更新为当前版本的主题内容', () => {
      GalaxyData.restorePlanetStates({
        sol_prime: {
          id: 'sol_prime',
          exploration: {
            pois: [{
              id: 'sol_prime_poi_anomaly',
              name: '古代遗迹阵列',
              description: '旧版重复文案',
              discovered: true,
              resolved: true,
              resolvedDay: 12,
            }],
          },
        },
      });

      const anomaly = GalaxyData.getPlanetData('sol_prime').exploration.pois.find(function (poi) {
        return poi.kind === 'anomaly_site';
      });
      expect(anomaly.name).toBe('先驱者轨道阵列');
      expect(anomaly.description).not.toBe('旧版重复文案');
      expect(anomaly.discovered).toBe(true);
      expect(anomaly.resolved).toBe(true);
      expect(anomaly.resolvedDay).toBe(12);
    });
  });

  describe('getSectorData', () => {
    it('应该返回星区数据', () => {
      const hierarchy = GalaxyData.getGalaxyHierarchy('milky_way');
      expect(hierarchy.sectors.length).toBeGreaterThan(0);

      const firstSector = hierarchy.sectors[0];
      const sectorData = GalaxyData.getSectorData('milky_way', firstSector.id);

      expect(sectorData).toBeTruthy();
      expect(sectorData.id).toBe(firstSector.id);
      expect(sectorData).toHaveProperty('name');
      expect(sectorData).toHaveProperty('center');
      expect(sectorData).toHaveProperty('planetIds');
    });

    it('应该为不存在的星区返回 null', () => {
      const sectorData = GalaxyData.getSectorData('milky_way', 'invalid_sector');
      expect(sectorData).toBeNull();
    });
  });

  describe('getPlanetsByStatus', () => {
    it('应该返回指定状态的星球列表', () => {
      GalaxyData.batchUpdatePlanetStates({
        'sol_prime': { status: 'contested' },
        'nova_station': { status: 'contested' },
        'mineral_belt': { status: 'normal' },
      });

      const contestedPlanets = GalaxyData.getPlanetsByStatus('milky_way', 'contested');
      expect(contestedPlanets.length).toBeGreaterThanOrEqual(2);
      expect(contestedPlanets).toContain('sol_prime');
      expect(contestedPlanets).toContain('nova_station');
      expect(contestedPlanets).not.toContain('mineral_belt');
    });
  });
});
