import { describe, expect, it } from 'vitest';
import {
  getAccessibleGalaxies,
  getGalaxyAccessState,
  getAccessibleSystems,
  getSystemsByGalaxy,
  getSystemsByGalaxy,
  isSystemAccessible,
} from '../js/data/systems.js';

describe('Galaxy access rules', function () {
  it('按等级逐步开放外域星系', function () {
    expect(getGalaxyAccessState('andromeda', 1, []).unlocked).toBe(false);
    expect(getGalaxyAccessState('andromeda', 2, []).unlocked).toBe(true);
    expect(getGalaxyAccessState('chrono_rift', 8, []).unlocked).toBe(false);
    expect(getGalaxyAccessState('chrono_rift', 9, []).unlocked).toBe(true);
  });

  it('超空间跃迁可提前解锁未达等级的外域', function () {
    const access = getGalaxyAccessState('chrono_rift', 1, ['hyperspace_jump']);
    expect(access.unlocked).toBe(true);
    expect(access.unlockedBy).toBe('tech');
  });

  it('星球可达性会同时受星系与星球等级影响', function () {
    expect(isSystemAccessible('citadel_prime', 1, [])).toBe(false);
    expect(isSystemAccessible('citadel_prime', 2, [])).toBe(true);
  });

  it('可访问星系列表会随等级扩大', function () {
    expect(getAccessibleGalaxies(1, []).map(function (galaxy) { return galaxy.id; })).toEqual(['milky_way']);
    expect(getAccessibleGalaxies(4, []).map(function (galaxy) { return galaxy.id; })).toEqual([
      'milky_way',
      'andromeda',
      'orion_arm',
    ]);
  });

  it('新开放星系内部星球也会继续分级释放', function () {
    var andromedaAll = getSystemsByGalaxy('andromeda').length;
    var andromedaAtUnlock = getAccessibleSystems('andromeda', 2, []).length;
    var andromedaMidgame = getAccessibleSystems('andromeda', 5, []).length;

    expect(andromedaAtUnlock).toBeGreaterThan(0);
    expect(andromedaAtUnlock).toBeLessThan(andromedaAll / 2);
    expect(andromedaMidgame).toBeGreaterThan(andromedaAtUnlock);
  });

  it('后期外域的价格偏离度高于早期外域', function () {
    function averageDeviation(galaxyId) {
      var systems = getSystemsByGalaxy(galaxyId);
      var total = 0;
      var count = 0;
      systems.forEach(function (system) {
        Object.keys(system.prices || {}).forEach(function (goodId) {
          total += Math.abs((system.prices[goodId] || 1) - 1);
          count += 1;
        });
      });
      return count > 0 ? total / count : 0;
    }

    expect(averageDeviation('dark_sector')).toBeGreaterThan(averageDeviation('andromeda'));
    expect(averageDeviation('chrono_rift')).toBeGreaterThan(averageDeviation('milky_way'));
  });

  it('星系主题会形成更清晰的主供与收购差异', function () {
    function averagePrice(galaxyId, goodId) {
      var systems = getSystemsByGalaxy(galaxyId);
      var total = systems.reduce(function (sum, system) {
        return sum + ((system.prices && system.prices[goodId]) || 1);
      }, 0);
      return total / systems.length;
    }

    expect(averagePrice('andromeda', 'technology')).toBeLessThan(averagePrice('milky_way', 'technology'));
    expect(averagePrice('orion_arm', 'minerals')).toBeLessThan(averagePrice('milky_way', 'minerals'));
    expect(averagePrice('orion_arm', 'food')).toBeGreaterThan(averagePrice('milky_way', 'food'));
    expect(averagePrice('magellanic_cloud', 'luxury')).toBeLessThan(averagePrice('milky_way', 'luxury'));
    expect(averagePrice('jade_expanse', 'medicine')).toBeLessThan(averagePrice('milky_way', 'medicine'));
    expect(averagePrice('phoenix_nebula', 'fuel')).toBeLessThan(averagePrice('milky_way', 'fuel'));
    expect(averagePrice('dark_sector', 'weapons')).toBeLessThan(averagePrice('milky_way', 'weapons'));
    expect(averagePrice('chrono_rift', 'technology')).toBeLessThan(averagePrice('andromeda', 'technology'));
  });
});