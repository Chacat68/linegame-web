// js/systems/galaxy/GalaxyDataLayer.js — 星系数据层
// 依赖：data/systems.js, data/factions.js, core/EventBus.js
// 导出：init, getGalaxyHierarchy, getPlanetData, getSectorData, updatePlanetState, subscribe

/**
 * 星系数据层
 *
 * 职责：
 * - 管理星系的分层数据结构（Galaxy → Sector → Planet）
 * - 维护星球的运行时状态（所属势力、资源状态等）
 * - 提供事件驱动的数据更新机制
 * - 支持数据导出/导入功能
 */

import { GALAXIES, SYSTEMS, findSystem, getSystemsByGalaxy, findGalaxy } from '../../data/systems.js';
import { FACTIONS } from '../../data/factions.js';
import * as EventBus from '../../core/EventBus.js';

// 运行时状态
let _planetStates = new Map(); // planetId -> { owner, resources, status, ... }
let _sectorCache = new Map();  // galaxyId -> sectors[]
let _listeners = [];

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

export function init(gameState) {
  _planetStates.clear();
  _sectorCache.clear();

  // 初始化所有星球的运行时状态
  SYSTEMS.forEach(system => {
    _planetStates.set(system.id, {
      id: system.id,
      owner: _determineInitialOwner(system, gameState),
      resources: _calculateResources(system),
      status: 'normal', // normal, contested, blockaded, etc.
      population: system.details?.totalPopulation || '0亿',
      lastUpdate: Date.now(),
    });
  });

  // 生成星区划分
  _generateSectors();

  console.log('GalaxyDataLayer initialized with', _planetStates.size, 'planets');
}

// ---------------------------------------------------------------------------
// 数据访问
// ---------------------------------------------------------------------------

/**
 * 获取完整的星系层次结构
 * @param {string} galaxyId - 星系ID
 * @returns {Object} 层次化数据结构
 */
export function getGalaxyHierarchy(galaxyId) {
  const galaxy = findGalaxy(galaxyId);
  if (!galaxy) return null;

  const sectors = _sectorCache.get(galaxyId) || [];
  const systems = getSystemsByGalaxy(galaxyId);

  return {
    galaxy: {
      id: galaxy.id,
      name: galaxy.name,
      description: galaxy.description,
      color: galaxy.color,
      icon: galaxy.icon,
      unlocked: galaxy.unlocked,
      position: { x: galaxy.gx, y: galaxy.gy },
    },
    sectors: sectors.map(sector => ({
      id: sector.id,
      name: sector.name,
      center: sector.center,
      radius: sector.radius,
      planets: sector.planetIds.map(pid => {
        const system = findSystem(pid);
        const state = _planetStates.get(pid);
        return system ? _mergePlanetData(system, state) : null;
      }).filter(p => p !== null),
    })),
    allPlanets: systems.map(sys => {
      const state = _planetStates.get(sys.id);
      return _mergePlanetData(sys, state);
    }),
  };
}

/**
 * 获取单个星球的完整数据（静态 + 运行时）
 * @param {string} planetId - 星球ID
 * @returns {Object|null}
 */
export function getPlanetData(planetId) {
  const system = findSystem(planetId);
  if (!system) return null;

  const state = _planetStates.get(planetId);
  return _mergePlanetData(system, state);
}

/**
 * 获取星区数据
 * @param {string} galaxyId - 星系ID
 * @param {string} sectorId - 星区ID
 * @returns {Object|null}
 */
export function getSectorData(galaxyId, sectorId) {
  const sectors = _sectorCache.get(galaxyId) || [];
  return sectors.find(s => s.id === sectorId) || null;
}

/**
 * 获取所有星球状态（用于存档）
 */
export function getAllPlanetStates() {
  const states = {};
  _planetStates.forEach((state, id) => {
    states[id] = { ...state };
  });
  return states;
}

// ---------------------------------------------------------------------------
// 数据更新
// ---------------------------------------------------------------------------

/**
 * 更新星球运行时状态
 * @param {string} planetId - 星球ID
 * @param {Object} updates - 要更新的字段
 */
export function updatePlanetState(planetId, updates) {
  const state = _planetStates.get(planetId);
  if (!state) return;

  const oldState = { ...state };
  Object.assign(state, updates, { lastUpdate: Date.now() });

  // 触发事件
  _notifyListeners({
    type: 'planet_state_changed',
    planetId,
    oldState,
    newState: { ...state },
    changes: updates,
  });

  EventBus.emit('galaxy:planet_updated', { planetId, state });
}

/**
 * 批量更新多个星球状态
 * @param {Object} updates - planetId -> updates 映射
 */
export function batchUpdatePlanetStates(updates) {
  const changes = [];

  Object.entries(updates).forEach(([planetId, upd]) => {
    const state = _planetStates.get(planetId);
    if (state) {
      const oldState = { ...state };
      Object.assign(state, upd, { lastUpdate: Date.now() });
      changes.push({ planetId, oldState, newState: { ...state } });
    }
  });

  if (changes.length > 0) {
    _notifyListeners({
      type: 'planets_batch_updated',
      changes,
    });

    EventBus.emit('galaxy:planets_batch_updated', { changes });
  }
}

/**
 * 恢复星球状态（从存档）
 * @param {Object} savedStates - planetId -> state 映射
 */
export function restorePlanetStates(savedStates) {
  Object.entries(savedStates).forEach(([planetId, state]) => {
    _planetStates.set(planetId, { ...state });
  });

  console.log('Restored', Object.keys(savedStates).length, 'planet states');
}

// ---------------------------------------------------------------------------
// 事件订阅
// ---------------------------------------------------------------------------

/**
 * 订阅数据层事件
 * @param {Function} callback - 回调函数 (event) => void
 * @returns {Function} 取消订阅函数
 */
export function subscribe(callback) {
  _listeners.push(callback);
  return () => {
    const idx = _listeners.indexOf(callback);
    if (idx >= 0) _listeners.splice(idx, 1);
  };
}

function _notifyListeners(event) {
  _listeners.forEach(cb => {
    try {
      cb(event);
    } catch (err) {
      console.error('GalaxyDataLayer listener error:', err);
    }
  });
}

// ---------------------------------------------------------------------------
// 查询辅助
// ---------------------------------------------------------------------------

/**
 * 获取指定势力控制的所有星球
 * @param {string} factionId - 势力ID
 * @returns {Array} 星球ID列表
 */
export function getPlanetsByFaction(factionId) {
  const planets = [];
  _planetStates.forEach((state, id) => {
    if (state.owner === factionId) {
      planets.push(id);
    }
  });
  return planets;
}

/**
 * 获取星系中指定状态的星球
 * @param {string} galaxyId - 星系ID
 * @param {string} status - 状态值
 * @returns {Array}
 */
export function getPlanetsByStatus(galaxyId, status) {
  const systems = getSystemsByGalaxy(galaxyId);
  return systems
    .filter(sys => {
      const state = _planetStates.get(sys.id);
      return state && state.status === status;
    })
    .map(sys => sys.id);
}

/**
 * 计算星系中各势力的星球数量
 * @param {string} galaxyId
 * @returns {Object} factionId -> count
 */
export function getFactionDistribution(galaxyId) {
  const systems = getSystemsByGalaxy(galaxyId);
  const dist = {};

  systems.forEach(sys => {
    const state = _planetStates.get(sys.id);
    if (state && state.owner) {
      dist[state.owner] = (dist[state.owner] || 0) + 1;
    }
  });

  return dist;
}

// ---------------------------------------------------------------------------
// 内部辅助
// ---------------------------------------------------------------------------

function _mergePlanetData(system, state) {
  return {
    // 静态数据
    id: system.id,
    name: system.name,
    type: system.type,
    typeLabel: system.typeLabel,
    description: system.description,
    color: system.color,
    icon: system.icon,
    position: { x: system.x, y: system.y },
    galaxyId: system.galaxyId,
    prices: system.prices,
    details: system.details,

    // 运行时状态
    owner: state?.owner || null,
    resources: state?.resources || {},
    status: state?.status || 'normal',
    population: state?.population || '0亿',
    lastUpdate: state?.lastUpdate || Date.now(),
  };
}

function _determineInitialOwner(system, gameState) {
  // 根据星球类型和位置确定初始控制势力
  // 这里可以基于游戏状态或配置来决定

  // 玩家起始系统
  if (system.id === gameState?.currentSystem) {
    return 'player';
  }

  // 特殊系统归属特定势力
  const specialOwners = {
    'nova_station': 'federation',
    'war_front': 'federation',
    'luxury_port': 'syndicate',
    'shadow_haven': 'syndicate',
    'gene_lab': 'technocracy',
  };

  if (specialOwners[system.id]) {
    return specialOwners[system.id];
  }

  // 其他系统基于类型分配
  const typeToFaction = {
    'military': 'federation',
    'commercial': 'syndicate',
    'technology': 'technocracy',
    'research': 'technocracy',
  };

  // 30%的星球有势力控制，70%中立
  const hash = _hashString(system.id);
  if (hash % 10 < 3) {
    return typeToFaction[system.type] || null;
  }

  return null; // 中立
}

function _calculateResources(system) {
  // 基于星球类型计算资源产出
  const resourceMap = {
    'agricultural': { food: 100, water: 80 },
    'mining': { minerals: 120 },
    'technology': { technology: 90 },
    'medical': { medicine: 85 },
    'industrial': { minerals: 60, technology: 40 },
    'energy': { fuel: 100 },
    'commercial': { luxury: 70 },
  };

  return resourceMap[system.type] || {};
}

function _generateSectors() {
  // 为每个星系生成星区划分（基于 k-means 聚类或简单网格）
  GALAXIES.forEach(galaxy => {
    const systems = getSystemsByGalaxy(galaxy.id);
    const sectors = _clusterIntoPlanets(systems, galaxy.id);
    _sectorCache.set(galaxy.id, sectors);
  });
}

function _clusterIntoPlanets(systems, galaxyId) {
  // 简单的网格划分（3x3）
  const gridSize = 3;
  const sectors = [];

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const minX = i / gridSize;
      const maxX = (i + 1) / gridSize;
      const minY = j / gridSize;
      const maxY = (j + 1) / gridSize;

      const planetsInSector = systems.filter(sys =>
        sys.x >= minX && sys.x < maxX && sys.y >= minY && sys.y < maxY
      );

      if (planetsInSector.length > 0) {
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        sectors.push({
          id: `${galaxyId}_sector_${i}_${j}`,
          name: `星区 ${String.fromCharCode(65 + i)}${j + 1}`,
          center: { x: centerX, y: centerY },
          radius: Math.sqrt(2) / (gridSize * 2),
          planetIds: planetsInSector.map(p => p.id),
          bounds: { minX, maxX, minY, maxY },
        });
      }
    }
  }

  return sectors;
}

function _hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// ---------------------------------------------------------------------------
// 数据导出/导入
// ---------------------------------------------------------------------------

/**
 * 导出完整的星系配置（用于策划编辑）
 * @param {string} galaxyId
 * @returns {string} JSON字符串
 */
export function exportGalaxyConfig(galaxyId) {
  const hierarchy = getGalaxyHierarchy(galaxyId);
  if (!hierarchy) return null;

  const config = {
    version: '1.0',
    galaxy: hierarchy.galaxy,
    planets: hierarchy.allPlanets.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      position: p.position,
      owner: p.owner,
      resources: p.resources,
    })),
    sectors: hierarchy.sectors.map(s => ({
      id: s.id,
      name: s.name,
      center: s.center,
      planetIds: s.planets.map(p => p.id),
    })),
    exportDate: new Date().toISOString(),
  };

  return JSON.stringify(config, null, 2);
}

/**
 * 导入星系配置（覆盖运行时状态）
 * @param {string} configJson - JSON字符串
 * @returns {boolean} 是否成功
 */
export function importGalaxyConfig(configJson) {
  try {
    const config = JSON.parse(configJson);

    if (!config.version || !config.planets) {
      throw new Error('Invalid config format');
    }

    // 更新星球状态
    config.planets.forEach(planetConfig => {
      const state = _planetStates.get(planetConfig.id);
      if (state) {
        Object.assign(state, {
          owner: planetConfig.owner,
          resources: planetConfig.resources,
          lastUpdate: Date.now(),
        });
      }
    });

    console.log('Imported galaxy config:', config.galaxy.name);

    EventBus.emit('galaxy:config_imported', { galaxyId: config.galaxy.id });

    return true;
  } catch (err) {
    console.error('Failed to import galaxy config:', err);
    return false;
  }
}
