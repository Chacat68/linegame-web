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
    _planetStates.set(system.id, _buildDefaultPlanetState(system, gameState));
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
    states[id] = _clonePlainObject(state);
  });
  return states;
}

// ---------------------------------------------------------------------------
// 数据更新
// ---------------------------------------------------------------------------

function _getNextLastUpdate(previousValue) {
  const now = Date.now();
  const previous = typeof previousValue === 'number' ? previousValue : 0;
  return now > previous ? now : previous + 1;
}

/**
 * 更新星球运行时状态
 * @param {string} planetId - 星球ID
 * @param {Object} updates - 要更新的字段
 */
export function updatePlanetState(planetId, updates) {
  const state = _planetStates.get(planetId);
  if (!state) return;

  const oldState = { ...state };
  Object.assign(state, updates, { lastUpdate: _getNextLastUpdate(state.lastUpdate) });

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
      Object.assign(state, upd, { lastUpdate: _getNextLastUpdate(state.lastUpdate) });
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
    const system = findSystem(planetId);
    if (!system) return;
    const defaults = _buildDefaultPlanetState(system, null);
    const restored = Object.assign({}, defaults, state || {});
    restored.exploration = _mergeExplorationState(defaults.exploration, state && state.exploration);
    _planetStates.set(planetId, restored);
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
    exploration: _clonePlainObject(state?.exploration || _createExplorationState(system)),
  };
}

function _buildDefaultPlanetState(system, gameState) {
  return {
    id: system.id,
    owner: _determineInitialOwner(system, gameState),
    resources: _calculateResources(system),
    status: 'normal',
    population: system.details?.totalPopulation || '0亿',
    exploration: _createExplorationState(system),
    lastUpdate: Date.now(),
  };
}

function _createExplorationState(system) {
  const secretRoute = _createSecretRoute(system);
  return {
    scanLevel: 0,
    scanCount: 0,
    lastScannedDay: 0,
    landed: false,
    landingCount: 0,
    lastLandedDay: 0,
    pois: _createExplorationPois(system, secretRoute),
    secretRoutes: secretRoute ? [secretRoute] : [],
  };
}

function _createExplorationPois(system, secretRoute) {
  const resourcePoi = _createResourcePoi(system);
  const anomalyPoi = _createAnomalyPoi(system);
  const routePoi = secretRoute ? {
    id: system.id + '_poi_route',
    kind: 'route_beacon',
    icon: '🛰️',
    name: '隐秘折跃信标',
    description: '一次失真的导航回波，似乎指向「' + secretRoute.targetSystemName + '」附近的暗线跳点。',
    discovered: false,
    resolved: false,
    secretRouteId: secretRoute.id,
    rewards: { credits: 110, reputation: 2 },
  } : {
    id: system.id + '_poi_archive',
    kind: 'resource_cache',
    icon: '📚',
    name: '遗落航海档案',
    description: '旧时代航海数据库残片，仍可从中提取有价值的航路情报。',
    discovered: false,
    resolved: false,
    rewards: { credits: 90, fuel: 0, reputation: 1 },
  };
  return [resourcePoi, anomalyPoi, routePoi];
}

function _createResourcePoi(system) {
  const templates = {
    agricultural: { icon: '🌾', name: '轨道种子库', description: '废弃农业补给舱里仍保存着可兑换的种子资产。', rewards: { credits: 140, fuel: 5, reputation: 1 } },
    technology:   { icon: '💾', name: '失落数据站', description: '无人维护的数据站残留了可打包出售的技术快照。', rewards: { credits: 180, fuel: 3, reputation: 2 } },
    mining:       { icon: '⛏️', name: '废弃采掘井', description: '矿层旁的采掘平台遗留了可回收的工业票据与补给。', rewards: { credits: 170, fuel: 4, reputation: 1 } },
    commercial:   { icon: '📦', name: '黑箱货仓', description: '一座漂流货仓仍保留着可回收的账本与押运燃料。', rewards: { credits: 150, fuel: 6, reputation: 1 } },
    military:     { icon: '🧰', name: '战备补给舱', description: '前线后勤留下的封存箱仍包含可折现的军需物资。', rewards: { credits: 160, fuel: 5, reputation: 1 } },
    medical:      { icon: '🧪', name: '冷链药品仓', description: '一处失联冷链仓库中仍有完好的药品结算单与应急燃料。', rewards: { credits: 155, fuel: 5, reputation: 2 } },
    industrial:   { icon: '🏭', name: '制造线残片', description: '废弃产线边缘仍堆放着未登记的工业票据。', rewards: { credits: 165, fuel: 4, reputation: 1 } },
    energy:       { icon: '⚡', name: '储能模块群', description: '一组遗落储能模块可直接转化为舰船补给。', rewards: { credits: 130, fuel: 10, reputation: 1 } },
    research:     { icon: '🔬', name: '观测站缓存', description: '研究站缓存中存放着一批仍可出售的数据样本。', rewards: { credits: 175, fuel: 2, reputation: 2 } },
    special:      { icon: '🪙', name: '边境藏匿点', description: '隐秘储物点内遗留了一批未登记资产。', rewards: { credits: 190, fuel: 3, reputation: 0 } },
  };
  const template = templates[system.type] || templates.special;
  return {
    id: system.id + '_poi_resource',
    kind: 'resource_cache',
    icon: template.icon,
    name: template.name,
    description: template.description,
    discovered: false,
    resolved: false,
    rewards: template.rewards,
  };
}

function _createAnomalyPoi(system) {
  return {
    id: system.id + '_poi_anomaly',
    kind: 'anomaly_site',
    icon: '🌀',
    name: '异常读数区',
    description: '局部时空与能量读数持续异常，回收收益可观，但存在舰体受损风险。',
    discovered: false,
    resolved: false,
    rewards: {
      credits: 150 + (system.minLevel || 1) * 20,
      hullDamage: 6 + (system.minLevel || 1) * 2,
    },
  };
}

function _createSecretRoute(system) {
  const systems = getSystemsByGalaxy(system.galaxyId)
    .filter(function (entry) {
      return entry.id !== system.id;
    })
    .sort(function (a, b) {
      return _distance(system, b) - _distance(system, a);
    });
  if (systems.length === 0) return null;

  const preferred = systems.slice(0, Math.min(6, systems.length));
  const idx = _hashString(system.id + '_secret_route') % preferred.length;
  const target = preferred[idx];
  return {
    id: system.id + '_route_' + target.id,
    sourceSystemId: system.id,
    targetSystemId: target.id,
    targetSystemName: target.name,
    label: '暗线 · ' + system.name + ' → ' + target.name,
    fuelMultiplier: 0.65,
    discovered: false,
    discoveredDay: 0,
  };
}

function _mergeExplorationState(defaultState, savedState) {
  const next = Object.assign({}, _clonePlainObject(defaultState), savedState || {});

  const savedPoiById = Object.create(null);
  (savedState && Array.isArray(savedState.pois) ? savedState.pois : []).forEach(function (poi) {
    savedPoiById[poi.id] = poi;
  });
  next.pois = (defaultState.pois || []).map(function (poi) {
    return Object.assign({}, poi, savedPoiById[poi.id] || {});
  });

  const savedRouteById = Object.create(null);
  (savedState && Array.isArray(savedState.secretRoutes) ? savedState.secretRoutes : []).forEach(function (route) {
    savedRouteById[route.id] = route;
  });
  next.secretRoutes = (defaultState.secretRoutes || []).map(function (route) {
    return Object.assign({}, route, savedRouteById[route.id] || {});
  });

  return next;
}

function _clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

function _distance(a, b) {
  const dx = (a.x || 0) - (b.x || 0);
  const dy = (a.y || 0) - (b.y || 0);
  return Math.sqrt(dx * dx + dy * dy);
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
