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

const EXPLORATION_GALAXY_THEMES = {
  milky_way: {
    anomalyIcon: '🌀', anomalyName: '先驱者轨道阵列', anomalyDescription: '人类航线边缘的先驱者结构仍在周期性发出能量脉冲。',
    routeName: '幽灵航标', archiveName: '地球旧航海库',
    chains: {
      derelict_depot: ['遗忘补给库', ['校验人类制式', '复原物资清单', '归档旧航线']],
      ancient_relic: ['先驱者轨道阵列', ['锁定脉冲源', '采集阵列残片', '归档先驱者样本']],
      lost_beacon: ['幽灵航标网', ['追踪历史回波', '重启幽灵节点', '归档人类暗线']],
    },
  },
  andromeda: {
    anomalyIcon: '🔮', anomalyName: '晶体记忆晶格', anomalyDescription: '先进文明留下的晶体计算网仍在自行重组记忆。',
    routeName: '量子折跃标', archiveName: '遗产观测库',
    chains: {
      derelict_depot: ['遗产数据库', ['识别量子锁', '复原遗产目录', '归档晶格物资']],
      ancient_relic: ['晶体记忆晶格', ['测绘晶格', '读取记忆切片', '归档遗产模型']],
      lost_beacon: ['量子折跃标', ['拟合量子相位', '复位折跃标', '归档瞬时航图']],
    },
  },
  orion_arm: {
    anomalyIcon: '⚔️', anomalyName: '战痕熔炉', anomalyDescription: '古老会战将轨道工厂熔成了一座自我循环的战痕熔炉。',
    routeName: '烬火信号塔', archiveName: '前线战损库',
    chains: {
      derelict_depot: ['战场回收站', ['排查未爆物', '回收军需舱', '归档前线补给']],
      ancient_relic: ['战痕熔炉', ['解析战痕', '切取熔炉芯', '归档军工样本']],
      lost_beacon: ['烬火信号塔', ['过滤战场干扰', '点燃信号塔', '归档前线穿插线']],
    },
  },
  magellanic_cloud: {
    anomalyIcon: '💎', anomalyName: '镏金拍卖残环', anomalyDescription: '失控的轨道拍卖场仍按消亡文明的协议结算藏品。',
    routeName: '珍珠商路浮标', archiveName: '星云商会账本',
    chains: {
      derelict_depot: ['商会密藏库', ['破解商会印记', '清点密藏货单', '归档星云行情']],
      ancient_relic: ['镏金拍卖残环', ['重建拍品编码', '鉴定遗珍', '归档失落藏品']],
      lost_beacon: ['珍珠商路浮标', ['捕捉商队暗语', '复位珍珠浮标', '归档密贸航图']],
    },
  },
  dark_sector: {
    anomalyIcon: '👁️', anomalyName: '虚空低语碑', anomalyDescription: '无法定位边界的黑色碑体向舰船传回不属于当前时间的讯息。',
    routeName: '盲区航标', archiveName: '静默观测录',
    chains: {
      derelict_depot: ['静默补给所', ['确认生命迹象', '无线回收货舱', '归档静默物资']],
      ancient_relic: ['虚空低语碑', ['隔离低语频段', '拓印碑面', '归档虚空讯息']],
      lost_beacon: ['盲区航标', ['探测无光回波', '点亮盲区标', '归档黑域缝隙']],
    },
  },
  phoenix_nebula: {
    anomalyIcon: '🔥', anomalyName: '重生日冕', anomalyDescription: '一枚人工恒星日冕在毁灭与复燃之间不断循环。',
    routeName: '耀斑航标', archiveName: '灰烬资源谱',
    chains: {
      derelict_depot: ['灰烬补给环', ['冷却外层舱', '提取高温物资', '归档星火补给']],
      ancient_relic: ['重生日冕', ['测算复燃周期', '捕获日冕样本', '归档恒星循环']],
      lost_beacon: ['耀斑航标', ['校正耀斑干扰', '重启耀斑标', '归档燃烧航道']],
    },
  },
  jade_expanse: {
    anomalyIcon: '🌿', anomalyName: '活体档案树冠', anomalyDescription: '跨越数十公里的太空菌林用孢子保存了已灭绝物种的记忆。',
    routeName: '孢子引航簇', archiveName: '翠玉基因谱',
    chains: {
      derelict_depot: ['共生种子库', ['筛查活性孢子', '复苏补给菌群', '归档生态物资']],
      ancient_relic: ['活体档案树冠', ['解读树冠信号', '分离记忆孢子', '归档物种谱系']],
      lost_beacon: ['孢子引航簇', ['追踪季风孢子', '唤醒引航簇', '归档生态航路']],
    },
  },
  chrono_rift: {
    anomalyIcon: '⌛', anomalyName: '破碎沙漏阵', anomalyDescription: '同一座阵列同时呈现新建、废弃与毁灭三种状态。',
    routeName: '逆行时标', archiveName: '错位航海日志',
    chains: {
      derelict_depot: ['错位补给站', ['锁定当前相位', '回收未来物资', '归档错位清单']],
      ancient_relic: ['破碎沙漏阵', ['测定时间层', '固化时间切片', '归档时空样本']],
      lost_beacon: ['逆行时标', ['预测迟到回波', '同步逆行标', '归档时序绕路']],
    },
  },
};

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
  const profile = _createExplorationProfile(system);
  const pois = _createExplorationPois(system, secretRoute);
  return {
    scanLevel: 0,
    scanCount: 0,
    lastScannedDay: 0,
    landed: false,
    landingCount: 0,
    lastLandedDay: 0,
    intelLevel: 0,
    threatLevel: profile.threatLevel,
    threatLabel: profile.threatLabel,
    opportunityFocus: profile.opportunityFocus,
    opportunityLabel: profile.opportunityLabel,
    completionRewardKind: profile.completionRewardKind,
    completionRewardLabel: profile.completionRewardLabel,
    completionBonusClaimed: false,
    completedDay: 0,
    reports: [],
    pois: pois,
    chainStates: _createExplorationChainStates(pois),
    secretRoutes: secretRoute ? [secretRoute] : [],
  };
}

function _createExplorationProfile(system) {
  const level = system.minLevel || 1;
  const marketTypes = ['commercial', 'special', 'military'];
  const researchTypes = ['technology', 'research'];
  const logisticsTypes = ['agricultural', 'mining', 'industrial', 'energy', 'medical'];

  let threatLevel = 'low';
  if (level >= 4 || marketTypes.indexOf(system.type) !== -1) threatLevel = 'high';
  else if (level >= 2 || ['mining', 'industrial'].indexOf(system.type) !== -1) threatLevel = 'medium';

  let opportunityFocus = 'logistics';
  if (researchTypes.indexOf(system.type) !== -1) opportunityFocus = 'research';
  else if (marketTypes.indexOf(system.type) !== -1) opportunityFocus = 'market';
  else if (logisticsTypes.indexOf(system.type) !== -1) opportunityFocus = 'logistics';

  const threatLabelMap = {
    low: '低风险',
    medium: '中风险',
    high: '高风险',
  };
  const opportunityLabelMap = {
    logistics: '补给回收',
    market: '贸易情报',
    research: '科研样本',
  };
  const completionRewardLabelMap = {
    logistics: '补给回收包',
    market: '贸易综述',
    research: '研究线索',
  };

  return {
    threatLevel: threatLevel,
    threatLabel: threatLabelMap[threatLevel],
    opportunityFocus: opportunityFocus,
    opportunityLabel: opportunityLabelMap[opportunityFocus],
    completionRewardKind: opportunityFocus,
    completionRewardLabel: completionRewardLabelMap[opportunityFocus],
  };
}

function _createExplorationPois(system, secretRoute) {
  const theme = _getExplorationTheme(system);
  const resourcePoi = _createResourcePoi(system);
  const anomalyPoi = _createAnomalyPoi(system);
  const routePoi = secretRoute ? {
    id: system.id + '_poi_route',
    kind: 'route_beacon',
    icon: theme.routeIcon || '🛰️',
    name: theme.routeName,
    description: theme.routeName + '发出失真回波，似乎指向「' + secretRoute.targetSystemName + '」附近的暗线跳点。',
    discovered: false,
    resolved: false,
    chain: _createPoiChain(system, 'lost_beacon'),
    secretRouteId: secretRoute.id,
    rewards: { credits: 110, reputation: 2 },
  } : {
    id: system.id + '_poi_archive',
    kind: 'resource_cache',
    icon: theme.archiveIcon || '📚',
    name: theme.archiveName,
    description: theme.archiveName + '保存着当地文明的航路残片，仍可提取有价值的商网情报。',
    discovered: false,
    resolved: false,
    chain: _createPoiChain(system, 'derelict_depot'),
    rewards: { credits: 90, fuel: 0, reputation: 1 },
  };
  return [resourcePoi, anomalyPoi, routePoi];
}

function _getExplorationTheme(system) {
  return EXPLORATION_GALAXY_THEMES[system && system.galaxyId] || EXPLORATION_GALAXY_THEMES.milky_way;
}

function _createPoiChain(system, chainKind) {
  const templates = {
    derelict_depot: {
      label: '废弃补给站',
      badge: '补给链',
      signal: 'logistics',
      stageLabels: ['扫描残骸', '复原库存', '归档补给信号'],
    },
    ancient_relic: {
      label: '古代遗迹',
      badge: '遗迹链',
      signal: 'research',
      stageLabels: ['定位遗迹', '提取样本', '归档科研线索'],
    },
    lost_beacon: {
      label: '失落航标',
      badge: '航标链',
      signal: 'route',
      stageLabels: ['校准回波', '重启航标', '归档暗线航图'],
    },
  };
  const template = templates[chainKind] || templates.derelict_depot;
  const themedChain = _getExplorationTheme(system).chains[chainKind];
  return {
    id: system.id + '_chain_' + chainKind,
    kind: chainKind,
    label: themedChain ? themedChain[0] : template.label,
    badge: template.badge,
    signal: template.signal,
    stageLabels: themedChain ? themedChain[1] : template.stageLabels,
  };
}

function _createExplorationChainStates(pois) {
  const chainStates = {};
  (Array.isArray(pois) ? pois : []).forEach(function (poi) {
    if (!poi || !poi.chain || !poi.chain.id) return;
    chainStates[poi.chain.id] = _createExplorationChainState(poi);
  });
  return chainStates;
}

function _createExplorationChainState(poi) {
  const chain = poi && poi.chain ? poi.chain : {};
  const progress = _getExplorationChainProgress(poi);
  return {
    id: chain.id || ((poi && poi.id ? poi.id : 'poi') + '_chain'),
    kind: chain.kind || '',
    label: chain.label || '探索链',
    badge: chain.badge || '探索链',
    signal: chain.signal || '',
    stage: progress.stage,
    stageIndex: progress.stageIndex,
    stageLabel: _getExplorationChainStageLabel(chain, progress.stageIndex),
    poiId: poi && poi.id ? poi.id : '',
    poiName: poi && poi.name ? poi.name : '探索点',
    discovered: !!(poi && poi.discovered),
    resolved: !!(poi && poi.resolved),
    discoveredDay: poi && poi.discovered ? (poi.discoveredDay || 0) : 0,
    resolvedDay: poi && poi.resolved ? (poi.resolvedDay || 0) : 0,
    followupReady: false,
    followupLabel: '',
    reportId: '',
  };
}

function _getExplorationChainProgress(poi) {
  if (poi && poi.resolved) return { stage: 'archived', stageIndex: 2 };
  if (poi && poi.discovered) return { stage: 'discovered', stageIndex: 1 };
  return { stage: 'locked', stageIndex: 0 };
}

function _getExplorationChainStageLabel(chain, stageIndex) {
  const stageLabels = chain && Array.isArray(chain.stageLabels) ? chain.stageLabels : [];
  if (stageLabels[stageIndex]) return stageLabels[stageIndex];
  if (stageIndex === 2) return '已归档';
  if (stageIndex === 1) return '待调查';
  return '待扫描';
}

function _getExplorationChainFollowupLabel(chainKind) {
  if (chainKind === 'lost_beacon') return '打开市场情报区确认暗线航图与派遣评分。';
  if (chainKind === 'ancient_relic') return '打开市场情报区确认科研补给与风险剖面。';
  if (chainKind === 'derelict_depot') return '打开市场情报区确认商网和派遣整备价值。';
  return '打开市场情报区查看后续经营影响。';
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
    chain: _createPoiChain(system, 'derelict_depot'),
    rewards: template.rewards,
  };
}

function _createAnomalyPoi(system) {
  const theme = _getExplorationTheme(system);
  return {
    id: system.id + '_poi_anomaly',
    kind: 'anomaly_site',
    icon: theme.anomalyIcon,
    name: theme.anomalyName,
    description: theme.anomalyDescription + '样本价值可观，但存在舰体受损风险。',
    discovered: false,
    resolved: false,
    chain: _createPoiChain(system, 'ancient_relic'),
    rewards: {
      credits: 150 + (system.minLevel || 1) * 20,
      hullDamage: 6 + (system.minLevel || 1) * 2,
      researchDays: (['technology', 'research', 'medical'].indexOf(system.type) !== -1) ? 1 : 0,
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
    const merged = Object.assign({}, poi, savedPoiById[poi.id] || {});
    // 探索进度来自存档；内容元数据始终跟随当前版本，避免旧存档永久留在重复文案。
    merged.kind = poi.kind;
    merged.icon = poi.icon;
    merged.name = poi.name;
    merged.description = poi.description;
    merged.chain = _clonePlainObject(poi.chain);
    merged.rewards = _clonePlainObject(poi.rewards);
    if (poi.secretRouteId) merged.secretRouteId = poi.secretRouteId;
    return merged;
  });

  const savedRouteById = Object.create(null);
  (savedState && Array.isArray(savedState.secretRoutes) ? savedState.secretRoutes : []).forEach(function (route) {
    savedRouteById[route.id] = route;
  });
  next.secretRoutes = (defaultState.secretRoutes || []).map(function (route) {
    return Object.assign({}, route, savedRouteById[route.id] || {});
  });

  next.reports = Array.isArray(savedState && savedState.reports)
    ? savedState.reports.map(function (report) { return _clonePlainObject(report); })
    : _clonePlainObject(defaultState.reports || []);
  next.chainStates = _mergeExplorationChainStates(defaultState.chainStates, savedState && savedState.chainStates, next.pois, next.reports);

  return next;
}

function _mergeExplorationChainStates(defaultChainStates, savedChainStates, pois, reports) {
  const saved = savedChainStates && typeof savedChainStates === 'object' ? savedChainStates : {};
  const defaults = defaultChainStates && typeof defaultChainStates === 'object' ? defaultChainStates : {};
  const reportByChainKind = _getReportIdByChainKind(reports);
  const next = {};

  (Array.isArray(pois) ? pois : []).forEach(function (poi) {
    if (!poi || !poi.chain || !poi.chain.id) return;
    const chainId = poi.chain.id;
    const progress = _getExplorationChainProgress(poi);
    const savedChain = saved[chainId] || {};
    const base = Object.assign(
      {},
      defaults[chainId] || _createExplorationChainState(poi),
      savedChain
    );
    const hasSavedFollowupReady = Object.prototype.hasOwnProperty.call(savedChain, 'followupReady');

    base.id = chainId;
    base.kind = poi.chain.kind || base.kind || '';
    base.label = poi.chain.label || base.label || '探索链';
    base.badge = poi.chain.badge || base.badge || '探索链';
    base.signal = poi.chain.signal || base.signal || '';
    base.poiId = poi.id || base.poiId || '';
    base.poiName = poi.name || base.poiName || '探索点';
    base.stage = progress.stage;
    base.stageIndex = progress.stageIndex;
    base.stageLabel = _getExplorationChainStageLabel(poi.chain, progress.stageIndex);
    base.discovered = !!poi.discovered;
    base.resolved = !!poi.resolved;
    base.discoveredDay = poi.discovered ? (poi.discoveredDay || base.discoveredDay || 0) : 0;
    base.resolvedDay = poi.resolved ? (poi.resolvedDay || base.resolvedDay || 0) : 0;

    if (base.resolved) {
      if (!base.reportId && reportByChainKind[base.kind]) base.reportId = reportByChainKind[base.kind];
      if (!hasSavedFollowupReady) base.followupReady = true;
      if (!base.followupLabel) base.followupLabel = _getExplorationChainFollowupLabel(base.kind);
    } else {
      base.followupReady = false;
      base.followupLabel = '';
      base.reportId = '';
    }

    next[chainId] = base;
  });

  return next;
}

function _getReportIdByChainKind(reports) {
  const reportByChainKind = {};
  (Array.isArray(reports) ? reports : []).forEach(function (report) {
    if (!report || !report.chainKind || reportByChainKind[report.chainKind]) return;
    reportByChainKind[report.chainKind] = report.id || '';
  });
  return reportByChainKind;
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

    EventBus.emit('galaxy:config_imported', { galaxyId: config.galaxy.id });

    return true;
  } catch (err) {
    console.error('Failed to import galaxy config:', err);
    return false;
  }
}
