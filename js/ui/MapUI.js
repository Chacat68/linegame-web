// js/ui/MapUI.js — 星系地图交互事件绑定（支持星系/星球双层视图 + 市场面板）
// 导出：init, initTabs, init3DCallbacks, refreshGalaxyBtn, triggerArrivalScanPanel, openMarket, closeMarket, isMarketOpen,
//        setRefreshMarket, setExplorationActions, getMarketViewSystem, refreshMarketLocation,
//        showMarketOverview, showMarketDetail, refreshPlanetDetail, getMapView, getCurrentGalaxyId
import * as Renderer3D from './Renderer3DAdvanced.js?v=20260406-routefix3';
import * as Faction from '../systems/faction/FactionSystem.js';
import * as GalaxyData from '../systems/galaxy/GalaxyDataLayer.js';
import * as Exploration from '../systems/galaxy/ExplorationSystem.js?v=20260407-landpoi1';
import { GALAXIES, findSystem, findGalaxy }  from '../data/systems.js';

let _tabClickCallback = null;
let _marketOpen = false;
let _smallScreenMql = null;
let _orbitScanPanelOpen = false;

// 市场浏览状态
let _marketViewGalaxy = null;
let _marketViewSystem = null;      // 详情模式时选中的星球
let _marketMode = 'detail';
// 市场刷新回调（由 GameManager 注入）
let _refreshMarket = null;          // (mode) => void
let _stateRef = null;               // 用于内部事件引用
let _explorationActions = null;

function _getScanStatus(stateRef, systemId) {
  if (!stateRef || !systemId) return null;
  if (_explorationActions && typeof _explorationActions.getScanStatus === 'function') {
    return _explorationActions.getScanStatus(systemId);
  }
  return Exploration.getScanStatus(stateRef, systemId);
}

function _getLandingStatus(stateRef, systemId) {
  if (!stateRef || !systemId) return null;
  if (_explorationActions && typeof _explorationActions.getLandingStatus === 'function') {
    return _explorationActions.getLandingStatus(systemId);
  }
  return Exploration.getLandingStatus(stateRef, systemId);
}

function _getPoiStatus(stateRef, systemId, poiId) {
  if (!stateRef || !systemId || !poiId) return null;
  if (_explorationActions && typeof _explorationActions.getPoiStatus === 'function') {
    return _explorationActions.getPoiStatus(systemId, poiId);
  }
  return Exploration.getPoiStatus(stateRef, systemId, poiId);
}

function _appendFlowNote(flow, text) {
  if (!flow || !text) return;
  flow.secondaryNote = flow.secondaryNote ? (flow.secondaryNote + ' ' + text) : text;
}

function _escapeHtmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

function _getCurrentSystemScanTarget(stateRef) {
  if (!stateRef) return null;
  if (stateRef.mapView !== 'planets') return null;
  if (stateRef.viewingGalaxy !== stateRef.currentGalaxy) return null;

  var sys = findSystem(stateRef.currentSystem);
  var planetData = GalaxyData.getPlanetData(stateRef.currentSystem);
  var exploration = planetData && planetData.exploration;
  var scanStatus = _getScanStatus(stateRef, stateRef.currentSystem);

  if (!sys || !exploration) return null;
  if ((exploration.scanLevel || 0) > 0) return null;

  return {
    systemId: sys.id,
    label: scanStatus && scanStatus.buttonLabel ? scanStatus.buttonLabel : '🔭 轨道扫描',
    disabled: !!(scanStatus && !scanStatus.canScan),
    title: scanStatus && scanStatus.blockedReason ? scanStatus.blockedReason : '',
  };
}

function _setOrbitScanPanelOpen(nextOpen, stateRef) {
  var resolvedState = stateRef || _stateRef;
  _orbitScanPanelOpen = !!nextOpen;
  _updateOrbitScanButton(resolvedState);
  _renderCurrentSystemExplorationCard(resolvedState);
}

function _closeOrbitScanPanel(stateRef) {
  _setOrbitScanPanelOpen(false, stateRef);
}

function _updateOrbitScanButton(stateRef) {
  var btn = document.getElementById('orbit-scan-btn');
  if (!btn) return;

  btn.setAttribute('aria-controls', 'current-system-exploration-card');
  btn.hidden = false;
  btn.hidden = true;
  btn.textContent = '📡 扫描';
  btn.disabled = false;
  btn.removeAttribute('aria-disabled');
  btn.classList.remove('active');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-hidden', 'true');
  btn.removeAttribute('title');
  btn.removeAttribute('data-system-id');
}

function _bindOrbitScanPanelControls() {
  var card = document.getElementById('current-system-exploration-card');
  if (!card || card.dataset.closeBound === 'true') return;

  card.addEventListener('click', function (event) {
    var closeBtn = event.target.closest('[data-orbit-scan-close]');
    if (!closeBtn || !card.contains(closeBtn)) return;

    event.preventDefault();
    event.stopPropagation();
    _closeOrbitScanPanel();
  });

  card.dataset.closeBound = 'true';
}

/**
 * 注入市场刷新回调（在 GameManager.init 中调用）
 * @param {Function} fn  (mode:'detail') => void  — 刷新市场
 */
export function setRefreshMarket(fn) {
  _refreshMarket = fn;
}

export function setExplorationActions(actions) {
  _explorationActions = actions || null;
  _bindExplorationActionEvents();
}

/**
 * 获取市场当前查看的星球 ID（供 GameManager 传给 MarketUI.render）
 * @param {object} state
 * @returns {string}
 */
export function getMarketViewSystem(state) {
  return _marketViewSystem || state.currentSystem;
}

/** 获取市场当前查看的星系 ID */
export function getMarketViewGalaxy(state) {
  return _marketViewGalaxy || state.currentGalaxy;
}

/** 获取当前市场模式 */
export function getMarketMode() {
  return _marketMode;
}

/** 获取当前地图视图模式 */
export function getMapView() {
  return _stateRef ? _stateRef.mapView : 'planets';
}

/** 获取当前查看的星系ID */
export function getCurrentGalaxyId() {
  return _stateRef ? (_stateRef.viewingGalaxy || _stateRef.currentGalaxy) : 'milky_way';
}

/** 切换到总览模式 */
export function showMarketOverview() {
  _marketMode = 'overview';
  _marketViewSystem = null;
  if (_refreshMarket) _refreshMarket('overview');
}

/** 切换到详情模式 */
export function showMarketDetail(systemId) {
  _marketMode = 'detail';
  _marketViewSystem = systemId;
  if (_refreshMarket) _refreshMarket('detail');
}

/**
 * 绑定星系地图的鼠标交互
 * @param {object}   stateRef    游戏状态对象（引用）
 * @param {Function} onTravel    (systemId: string) => void
 * @param {Function} onGalaxyJump (galaxyId: string) => void  跨星系跳转回调
 */
export function init(stateRef, onTravel, onGalaxyJump) {
  // 保存状态引用供底部导航使用
  _stateRef = stateRef;
  _bindExplorationActionEvents();
  _bindOrbitScanPanelControls();

  // 星系视图切换按钮
  const btn = document.getElementById('galaxy-view-btn');
  if (btn) {
    btn.addEventListener('click', function () {
      // 先关闭市场
      closeMarket();
      _closeOrbitScanPanel(stateRef);
      if (stateRef.mapView === 'galaxies') {
        stateRef.mapView = 'planets';
        stateRef.viewingGalaxy = stateRef.currentGalaxy;
      } else {
        stateRef.mapView = 'galaxies';
      }
      _updateGalaxyBtn(stateRef);
      refreshPlanetDetail(stateRef);
    });
  }

  const secretRoutesBtn = document.getElementById('secret-routes-toggle-btn');
  if (secretRoutesBtn) {
    secretRoutesBtn.addEventListener('click', function () {
      const visible = Renderer3D.isSecretRoutesVisible ? Renderer3D.isSecretRoutesVisible() : true;
      if (Renderer3D.setSecretRoutesVisible) {
        Renderer3D.setSecretRoutesVisible(!visible);
      }
      _updateSecretRoutesToggle();
    });
    _updateSecretRoutesToggle();
  }

  const orbitScanBtn = document.getElementById('orbit-scan-btn');
  if (orbitScanBtn) {
    orbitScanBtn.addEventListener('click', function () {
      var target = _getCurrentSystemScanTarget(_stateRef || stateRef);
      if (!target) {
        _closeOrbitScanPanel(_stateRef || stateRef);
        return;
      }
      _setOrbitScanPanelOpen(!_orbitScanPanelOpen, _stateRef || stateRef);
    });
    _updateOrbitScanButton(stateRef);
  }

  // 市场按钮
  const marketBtn = document.getElementById('market-view-btn');
  const marketCloseBtn = document.getElementById('market-close-btn');
  if (marketBtn) {
    marketBtn.addEventListener('click', function () {
      if (_marketOpen) {
        closeMarket();
        _setBottomNavActive('starmap');
      } else {
        _closeAllOverlayPanels();
        openMarket(stateRef);
        _setBottomNavActive('market');
      }
    });
  }
  if (marketCloseBtn) {
    marketCloseBtn.addEventListener('click', function () {
      closeMarket();
      _setBottomNavActive('starmap');
    });
  }

  // 3D视图默认启用，按钮隐藏
  const toggle3DBtn = document.getElementById('map-3d-toggle-btn');
  if (toggle3DBtn) {
    toggle3DBtn.style.display = 'none';
  }

  refreshPlanetDetail(stateRef);
}

/**
 * 初始化3D地图回调（由 GameManager 在 init 后调用）
 */
export function init3DCallbacks(stateRef, onTravel, onGalaxyJump) {
  // 确保3D渲染器已激活
  if (!Renderer3D.isActive()) {
    Renderer3D.toggleView();
  }
  window._mapHoverCallback = function(data) {
    if (data) {
      if (data.type === 'system') {
        stateRef.hoveredSystem = data.id;
      } else {
        stateRef.hoveredSystem = null;
      }
      refreshPlanetDetail(stateRef);
    } else {
      stateRef.hoveredSystem = null;
      refreshPlanetDetail(stateRef);
    }
  };
  window._mapClickCallback = function(systemId) {
    const sys = findSystem(systemId);
    if (sys && sys.id !== stateRef.currentSystem) {
      const playerLevel = stateRef.playerLevel || 1;
      if (playerLevel < (sys.minLevel || 1)) return;
      if (sys.galaxyId !== stateRef.currentGalaxy) {
        if (onGalaxyJump) onGalaxyJump(sys.id);
      } else {
        if (onTravel) onTravel(sys.id);
      }
    }
  };
  window._galaxyClickCallback = function(galaxyId) {
    const gal = findGalaxy(galaxyId);
    if (gal) {
      const unlocked = gal.unlocked ||
        (stateRef.researchedTechs && stateRef.researchedTechs.includes(gal.techRequired));
      if (unlocked) {
        stateRef.viewingGalaxy = gal.id;
        stateRef.mapView = 'planets';
        _updateGalaxyBtn(stateRef);
        refreshPlanetDetail(stateRef);
      }
    }
  };
  window._switchToGalaxyView = function() {
    stateRef.mapView = 'galaxies';
    _updateGalaxyBtn(stateRef);
    refreshPlanetDetail(stateRef);
  };
}

function _updateGalaxyBtn(stateRef) {
  const btn = document.getElementById('galaxy-view-btn');
  if (!btn) return;
  if (stateRef.mapView === 'galaxies') {
    btn.textContent = '📍 返回星球';
  } else if (stateRef.viewingGalaxy !== stateRef.currentGalaxy) {
    btn.textContent = '🏠 返回当前星系';
  } else {
    btn.textContent = '🌌 星系总览';
  }
}

/** 外部调用刷新按钮状态 */
export function refreshGalaxyBtn(stateRef) {
  _updateGalaxyBtn(stateRef);
  _updateSecretRoutesToggle();
  _updateOrbitScanButton(stateRef);
}

export function triggerArrivalScanPanel(stateRef) {
  if (!stateRef) return false;

  _stateRef = stateRef;
  stateRef.hoveredSystem = null;
  _orbitScanPanelOpen = !!_getCurrentSystemScanTarget(stateRef);
  _updateOrbitScanButton(stateRef);
  _renderCurrentSystemExplorationCard(stateRef);
  return _orbitScanPanelOpen;
}

function _getSafetyLabel(score) {
  if (score >= 80) return '安定';
  if (score >= 60) return '可控';
  if (score >= 40) return '紧张';
  return '危险';
}

function _bindExplorationActionContainer(containerId) {
  var container = document.getElementById(containerId);
  if (!container || container.dataset.bound === 'true') return;

  container.addEventListener('click', function (event) {
    var button = event.target.closest('[data-exploration-action]');
    if (!button || button.disabled || !_explorationActions || !container.contains(button)) return;

    var action = button.dataset.explorationAction;
    var systemId = button.dataset.systemId;
    var poiId = button.dataset.poiId;

    event.preventDefault();
    event.stopPropagation();

    if (action === 'scan' && _explorationActions.onScan) {
      var scanResult = _explorationActions.onScan(systemId);
      if (containerId === 'current-system-exploration-card' && scanResult && scanResult.ok) {
        _closeOrbitScanPanel(_stateRef);
      }
      return;
    }
    if (action === 'land' && _explorationActions.onLand) {
      _explorationActions.onLand(systemId);
      return;
    }
    if (action === 'poi' && _explorationActions.onExplorePoi) {
      _explorationActions.onExplorePoi(systemId, poiId);
    }
  });

  container.dataset.bound = 'true';
}

function _bindExplorationActionEvents() {
  _bindExplorationActionContainer('planet-detail-panel');
  _bindExplorationActionContainer('current-system-exploration-card');
  _bindOrbitScanPanelControls();
}

function _getExplorationFlow(stateRef, sys, planetData, isCurrentSystem, isUnlocked) {
  var exploration = planetData && planetData.exploration;
  if (!exploration) return null;

  var discoveredPois = (exploration.pois || []).filter(function (poi) { return poi.discovered; });
  var unresolvedPois = discoveredPois.filter(function (poi) { return !poi.resolved; });
  var resolvedPois = discoveredPois.filter(function (poi) { return poi.resolved; });
  var discoveredRoutes = (exploration.secretRoutes || []).filter(function (route) { return route.discovered; });
  var scanProgressStatus = exploration.scanLevel > 1 ? '完成' : (exploration.scanLevel > 0 ? '已扫描' : '未扫描');
  var landingProgressStatus = exploration.landed ? '已着陆' : '未着陆';
  var totalPois = (exploration.pois || []).length;
  var flow = {
    exploration: exploration,
    discoveredPois: discoveredPois,
    unresolvedPois: unresolvedPois,
    resolvedPois: resolvedPois,
    discoveredRoutes: discoveredRoutes,
    resolvedCount: resolvedPois.length,
    totalPois: totalPois,
    scanStatus: scanProgressStatus,
    landingStatus: landingProgressStatus,
    roleTag: isCurrentSystem ? '当前停靠' : '悬停预览',
    phase: '',
    title: '',
    detail: '',
    nextAction: null,
    secondaryNote: '',
  };

  if (!isUnlocked) {
    flow.phase = '尚未解锁';
    flow.title = '等级不足，暂时无法展开本地探索';
    flow.detail = '达到 Lv.' + (sys.minLevel || 1) + ' 后才能在这颗星球执行扫描、着陆与 POI 调查。';
    return flow;
  }

  if (!isCurrentSystem) {
    flow.phase = '抵达后可继续';
    if (exploration.scanLevel <= 0) {
      flow.title = '抵达后先执行轨道扫描';
      flow.detail = '扫描会揭示地表探索点，帮助你判断这颗星球是否值得投入时间。';
    } else if (!exploration.landed) {
      flow.title = '扫描已完成，抵达后可申请首次着陆';
      flow.detail = '当前已发现 ' + discoveredPois.length + ' 个探索点，着陆后才能展开地面调查。';
    } else if (unresolvedPois.length > 0) {
      flow.title = '抵达后可继续调查 ' + unresolvedPois.length + ' 个 POI';
      flow.detail = '这颗星球还有未完成的探索内容，靠近后即可继续推进。';
    } else if (discoveredRoutes.length > 0) {
      flow.title = '本地探索已完成';
      flow.detail = '这里已解锁 ' + discoveredRoutes.length + ' 条秘密航线，后续航行会自动享受燃料折扣。';
    } else {
      flow.title = '本地探索已完成';
      flow.detail = '当前没有待处理的探索行动，抵达后可直接前往市场或继续航行。';
    }
    return flow;
  }

  if (exploration.scanLevel <= 0) {
    var scanPreview = _getScanStatus(stateRef, sys.id);
    flow.phase = '步骤 1 / 3';
    flow.title = '先执行轨道扫描';
    flow.detail = scanPreview && scanPreview.detailText
      ? scanPreview.detailText
      : '扫描会揭示全部地表 POI，并决定是否值得继续着陆。';
    flow.nextAction = {
      type: 'scan',
      systemId: sys.id,
      label: scanPreview && scanPreview.actionLabel ? scanPreview.actionLabel : '执行轨道扫描',
      disabled: !!(scanPreview && !scanPreview.canScan),
      title: scanPreview && scanPreview.blockedReason ? scanPreview.blockedReason : '',
    };
    if (scanPreview && scanPreview.blockedReason && !scanPreview.canScan) {
      flow.secondaryNote = scanPreview.blockedReason;
    }
    return flow;
  }

  if (!exploration.landed) {
    var landingPreview = _getLandingStatus(stateRef, sys.id);
    flow.phase = '步骤 2 / 3';
    flow.title = '扫描完成，准备首次着陆';
    flow.detail = landingPreview && landingPreview.detailText
      ? landingPreview.detailText
      : ('已发现 ' + discoveredPois.length + ' 个探索点，着陆后即可展开地面调查。');
    flow.nextAction = {
      type: 'land',
      systemId: sys.id,
      label: landingPreview && landingPreview.actionLabel ? landingPreview.actionLabel : '申请首次着陆',
      disabled: !!(landingPreview && !landingPreview.canLand),
      title: landingPreview && landingPreview.blockedReason ? landingPreview.blockedReason : '',
    };
    if (landingPreview && landingPreview.blockedReason && !landingPreview.canLand) {
      flow.secondaryNote = landingPreview.blockedReason;
    }
    return flow;
  }

  if (unresolvedPois.length > 0) {
    var nextPoi = unresolvedPois[0];
    var nextPoiPreview = _getPoiStatus(stateRef, sys.id, nextPoi.id);
    flow.phase = '步骤 3 / 3';
    flow.title = '继续调查地表探索点';
    flow.detail = nextPoiPreview && nextPoiPreview.detailText
      ? (nextPoi.icon + ' ' + nextPoi.name + '：' + nextPoiPreview.detailText)
      : ('优先处理 ' + nextPoi.icon + ' ' + nextPoi.name + '，完成后会自动切换到下一个待办。');
    flow.nextAction = {
      type: 'poi',
      systemId: sys.id,
      poiId: nextPoi.id,
      label: nextPoiPreview && nextPoiPreview.actionLabel ? nextPoiPreview.actionLabel : ('调查 ' + nextPoi.icon + ' ' + nextPoi.name),
      disabled: !!(nextPoiPreview && !nextPoiPreview.canExplore),
      title: nextPoiPreview && nextPoiPreview.blockedReason ? nextPoiPreview.blockedReason : '',
    };
    if (nextPoiPreview && nextPoiPreview.blockedReason && !nextPoiPreview.canExplore) {
      _appendFlowNote(flow, nextPoiPreview.blockedReason);
    }
    if (unresolvedPois.length > 1) {
      _appendFlowNote(flow, '当前还有 ' + unresolvedPois.length + ' 个 POI 待调查，悬停面板中可直接挑选具体目标。');
    }
    return flow;
  }

  flow.phase = '探索完成';
  if (discoveredRoutes.length > 0) {
    flow.title = '本地探索完成，暗线已接入航图';
    flow.detail = '当前已解锁 ' + discoveredRoutes.length + ' 条秘密航线，之后从这里出发会自动应用燃料折扣。';
  } else {
    flow.title = '本地探索完成';
    flow.detail = '当前星球没有待处理的探索行动，可以继续贸易或前往下一颗星球。';
  }
  return flow;
}

function _buildExplorationActionButton(action, extraClass) {
  if (!action) return '';

  var classes = 'planet-detail-action';
  if (extraClass) classes += ' ' + extraClass;
  var disabledAttr = action.disabled ? ' disabled aria-disabled="true"' : '';
  var titleAttr = action.title ? ' title="' + _escapeHtmlAttr(action.title) + '"' : '';

  return '<button class="' + classes + '" data-exploration-action="' + action.type + '" data-system-id="' + action.systemId + '"' +
    (action.poiId ? ' data-poi-id="' + action.poiId + '"' : '') + disabledAttr + titleAttr + '>' + action.label + '</button>';
}

function _buildExplorationFlowCard(flow, options) {
  if (!flow) return '';

  var className = (options && options.cardClass) || 'planet-detail-flow-card';
  var includeAction = !options || options.includeAction !== false;
  var actionHtml = includeAction && flow.nextAction
    ? '<div class="planet-detail-actions">' + _buildExplorationActionButton(flow.nextAction, options && options.actionClass) + '</div>'
    : '';
  var noteHtml = flow.secondaryNote
    ? '<div class="planet-detail-note">' + flow.secondaryNote + '</div>'
    : '';

  return '<div class="' + className + '">' +
    '<div class="planet-detail-flow-kicker">' + flow.phase + '</div>' +
    '<div class="planet-detail-flow-title">' + flow.title + '</div>' +
    '<div class="planet-detail-flow-text">' + flow.detail + '</div>' +
    actionHtml +
    noteHtml +
  '</div>';
}

function _buildExplorationProgressRow(flow) {
  return '<div class="planet-detail-progress-row">' +
    '<span class="planet-detail-progress-pill">扫描：' + flow.scanStatus + '</span>' +
    '<span class="planet-detail-progress-pill">着陆：' + flow.landingStatus + '</span>' +
    '<span class="planet-detail-progress-pill">POI：' + flow.resolvedCount + '/' + flow.totalPois + '</span>' +
    '<span class="planet-detail-progress-pill">暗线：' + flow.discoveredRoutes.length + '</span>' +
  '</div>';
}

function _buildExplorationActionBlock(flow, sys, isCurrentSystem, stateRef) {
  if (!flow || !isCurrentSystem || !flow.nextAction) return '';

  if (flow.nextAction.type !== 'poi' || flow.unresolvedPois.length <= 1) {
    return '<div class="planet-detail-actions">' + _buildExplorationActionButton(flow.nextAction) + '</div>';
  }

  return '<div class="planet-detail-actions">' + flow.unresolvedPois.map(function (poi) {
    var poiPreview = _getPoiStatus(stateRef, sys.id, poi.id);
    return _buildExplorationActionButton({
      type: 'poi',
      systemId: sys.id,
      poiId: poi.id,
      label: poiPreview && poiPreview.actionLabel ? poiPreview.actionLabel : ('调查 ' + poi.icon + ' ' + poi.name),
      disabled: !!(poiPreview && !poiPreview.canExplore),
      title: poiPreview && poiPreview.blockedReason ? poiPreview.blockedReason : '',
    });
  }).join('') + '</div>';
}

function _buildExplorationSection(stateRef, sys, planetData, isCurrentSystem, isUnlocked) {
  var flow = _getExplorationFlow(stateRef, sys, planetData, isCurrentSystem, isUnlocked);
  if (!flow) return '';

  var poiList = flow.exploration.scanLevel > 0
    ? flow.discoveredPois.slice().sort(function (left, right) {
      if (left.resolved === right.resolved) return 0;
      return left.resolved ? 1 : -1;
    })
    : [];

  var poiHtml = poiList.length > 0
    ? poiList.map(function (poi) {
      var badgeText = poi.resolved ? '已调查' : '待调查';
      if (!poi.resolved && flow.unresolvedPois.length > 0 && flow.unresolvedPois[0].id === poi.id) {
        badgeText = '下一步';
      }
      return '<div class="planet-detail-list-row">' +
        '<span>' + poi.icon + ' ' + poi.name + '</span>' +
        '<span class="planet-detail-badge">' + badgeText + '</span>' +
      '</div>';
    }).join('')
    : '';

  var routeHtml = flow.discoveredRoutes.length > 0
    ? flow.discoveredRoutes.map(function (route) {
      var routeInfo = Exploration.getTravelRouteInfo(stateRef, sys.id, route.targetSystemId);
      var fuelMultiplier = routeInfo.active ? routeInfo.fuelMultiplier : (route.fuelMultiplier || 1);
      var discount = Math.round((1 - fuelMultiplier) * 100);
      return '<div class="planet-detail-list-row">' +
        '<span>🛰️ ' + route.targetSystemName + '</span>' +
        '<span class="planet-detail-badge">燃料 -' + discount + '%</span>' +
      '</div>';
    }).join('')
    : '';

  return '<div class="planet-detail-section planet-detail-wide">' +
    '<div class="planet-detail-section-head">' +
      '<div class="planet-detail-section-title">探索流程</div>' +
      '<span class="planet-detail-chip">' + flow.roleTag + '</span>' +
    '</div>' +
    _buildExplorationFlowCard(flow, { includeAction: false }) +
    _buildExplorationProgressRow(flow) +
    _buildExplorationActionBlock(flow, sys, isCurrentSystem, stateRef) +
    (poiHtml
      ? '<div class="planet-detail-subsection">' +
          '<div class="planet-detail-subtitle">探索点清单</div>' +
          '<div class="planet-detail-list">' + poiHtml + '</div>' +
        '</div>'
      : '') +
    (routeHtml
      ? '<div class="planet-detail-subsection">' +
          '<div class="planet-detail-subtitle">秘密航线</div>' +
          '<div class="planet-detail-list">' + routeHtml + '</div>' +
        '</div>'
      : '') +
  '</div>';
}

function _renderCurrentSystemExplorationCard(stateRef) {
  var card = document.getElementById('current-system-exploration-card');
  if (!card) return;

  var canUseCurrentSystemCard = !!stateRef &&
    stateRef.mapView === 'planets' &&
    stateRef.viewingGalaxy === stateRef.currentGalaxy;
  var scanTarget = _getCurrentSystemScanTarget(stateRef);

  if (!canUseCurrentSystemCard || !scanTarget) {
    _orbitScanPanelOpen = false;
    card.classList.remove('visible');
    return;
  }

  if (stateRef.hoveredSystem) {
    card.classList.remove('visible');
    return;
  }

  if (!_orbitScanPanelOpen) {
    card.classList.remove('visible');
    return;
  }

  var sys = findSystem(stateRef.currentSystem);
  var planetData = GalaxyData.getPlanetData(stateRef.currentSystem);
  if (!sys || !planetData || !planetData.exploration) {
    _orbitScanPanelOpen = false;
    card.classList.remove('visible');
    return;
  }

  var playerLevel = stateRef.playerLevel || 1;
  var isUnlocked = playerLevel >= (sys.minLevel || 1);
  var flow = _getExplorationFlow(stateRef, sys, planetData, true, isUnlocked);
  if (!flow) {
    card.classList.remove('visible');
    return;
  }

  card.innerHTML = '<div class="current-system-card-head">' +
    '<div class="current-system-card-head-main">' +
      '<div class="current-system-card-kicker">扫描终端</div>' +
      '<div class="current-system-card-name">🪐 ' + sys.name + '</div>' +
    '</div>' +
    '<button class="current-system-card-close" type="button" aria-label="关闭扫描面板" data-orbit-scan-close="true">✕</button>' +
    '</div>' +
    _buildExplorationFlowCard(flow, {
      cardClass: 'planet-detail-flow-card current-system-flow-card',
      actionClass: 'current-system-action',
    }) +
    _buildExplorationProgressRow(flow);

  card.classList.add('visible');
}

export function refreshPlanetDetail(stateRef) {
  const panel = document.getElementById('planet-detail-panel');
  const mapCanvas = document.getElementById('map-canvas');
  const mapContainer = document.getElementById('map-container');
  if (!panel) return;
  if (!mapCanvas || !mapContainer) return;

  _updateOrbitScanButton(stateRef);
  _renderCurrentSystemExplorationCard(stateRef);

  const displayId = stateRef.hoveredSystem;
  if (stateRef.mapView !== 'planets' || !displayId) {
    panel.classList.remove('visible');
    return;
  }
  const sys = findSystem(displayId);
  const planetData = GalaxyData.getPlanetData(displayId);
  if (!sys) {
    panel.classList.remove('visible');
    return;
  }

  const gal = findGalaxy(sys.galaxyId);
  const details = sys.details || {};
  const races = (details.population || []).map(function (p) {
    return p.icon + p.name + '(' + p.percentage + '%)';
  }).join('、') || '未知';
  const government = details.government
    ? (details.government.name + ' · ' + details.government.style)
    : '未知政体';
  const specialties = (details.specialties || []).join('、') || '暂无';
  const safety = typeof details.safety === 'number'
    ? (details.safety + ' / 100（' + _getSafetyLabel(details.safety) + '）')
    : '未知';

  const faction = Faction.getFactionForSystem(sys.id);
  let factionText = '🛰️ 独立星区';
  let relationText = '🙂 中立 (0)';
  if (faction) {
    const rel = Faction.getRelation(stateRef, faction.id);
    const level = Faction.getLevel(stateRef, faction.id);
    factionText = faction.icon + ' ' + faction.name;
    relationText = level.emoji + ' ' + level.name + ' (' + (rel >= 0 ? '+' : '') + rel + ')';
  }

  const playerLevel = stateRef.playerLevel || 1;
  const isUnlocked = playerLevel >= (sys.minLevel || 1);
  const isCurrentSystem = displayId === stateRef.currentSystem;
  const lockText = playerLevel >= (sys.minLevel || 1)
    ? '已解锁'
    : ('需 Lv.' + (sys.minLevel || 1) + '（当前 Lv.' + playerLevel + '）');

  panel.innerHTML =
    '<div class="planet-detail-title">🪐 ' + sys.name + ' · ' + (gal ? (gal.icon + ' ' + gal.name) : '未知星系') + '</div>' +
    '<div class="planet-detail-desc">' + sys.description + '</div>' +
    '<div class="planet-detail-item"><span class="planet-detail-label">类型</span>' + sys.typeLabel + '</div>' +
    '<div class="planet-detail-item"><span class="planet-detail-label">势力</span>' + factionText + '</div>' +
    '<div class="planet-detail-item"><span class="planet-detail-label">友好度</span>' + relationText + '</div>' +
    '<div class="planet-detail-item"><span class="planet-detail-label">居民</span>' + races + '</div>' +
    '<div class="planet-detail-item"><span class="planet-detail-label">人口</span>' + (details.totalPopulation || '未知') + '</div>' +
    '<div class="planet-detail-item"><span class="planet-detail-label">政体</span>' + government + '</div>' +
    '<div class="planet-detail-item"><span class="planet-detail-label">治安</span>' + safety + '</div>' +
    '<div class="planet-detail-item"><span class="planet-detail-label">特产</span>' + specialties + '</div>' +
    '<div class="planet-detail-item"><span class="planet-detail-label">解锁</span>' + lockText + '</div>' +
    _buildExplorationSection(stateRef, sys, planetData, isCurrentSystem, isUnlocked);

  panel.classList.add('visible');

  const container = mapContainer;
  const canvasW = container.clientWidth;
  const canvasH = container.clientHeight;

  // 优先使用3D投影坐标
  let nodeX, nodeY;
  const screenPos = Renderer3D.getPlanetScreenPosition(displayId);
  if (screenPos) {
    nodeX = screenPos.x;
    nodeY = screenPos.y;
  } else {
    nodeX = sys.x * canvasW;
    nodeY = sys.y * canvasH;
  }
  const offset = 14;

  const panelW = Math.min(360, Math.max(220, canvasW - 16));
  panel.style.width = panelW + 'px';

  const maxLeft = Math.max(8, canvasW - panelW - 8);
  const placeRight = nodeX < (canvasW * 0.58);
  let left = placeRight ? (nodeX + offset) : (nodeX - panelW - offset);
  left = Math.max(8, Math.min(maxLeft, left));

  const panelH = Math.max(160, panel.offsetHeight || 0);
  const maxTop = Math.max(8, canvasH - panelH - 8);
  let top = nodeY - panelH * 0.5;
  top = Math.max(8, Math.min(maxTop, top));

  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
}

/** 打开市场面板（默认当前节点功能页） */
export function openMarket(stateRef) {
  const overlay = document.getElementById('market-overlay');
  const marketBtn = document.getElementById('market-view-btn');
  if (!overlay) return;
  _closeOrbitScanPanel(stateRef);
  _stateRef = stateRef;
  _marketViewGalaxy = stateRef.currentGalaxy;
  _marketViewSystem = stateRef.currentSystem;
  _marketMode = 'detail';
  _marketOpen = true;
  overlay.classList.remove('hidden');
  if (marketBtn) marketBtn.classList.add('active');
  _buildMarketGalaxyNav(stateRef);
  _bindMarketDetailEvents(stateRef);
  if (_refreshMarket) _refreshMarket('detail');
}

/** 关闭市场面板 */
export function closeMarket() {
  const overlay = document.getElementById('market-overlay');
  const marketBtn = document.getElementById('market-view-btn');
  if (!overlay) return;
  _marketOpen = false;
  overlay.classList.add('hidden');
  if (marketBtn) marketBtn.classList.remove('active');
}

/** 市场是否打开 */
export function isMarketOpen() {
  return _marketOpen;
}

/** 旅行后刷新市场（保持当前节点功能页） */
export function refreshMarketLocation(stateRef) {
  if (!_marketOpen) return;
  _stateRef = stateRef;
  _marketViewGalaxy = stateRef.currentGalaxy;
  _marketViewSystem = stateRef.currentSystem;
  _marketMode = 'detail';
  _buildMarketGalaxyNav(stateRef);
  if (_refreshMarket) _refreshMarket('detail');
}

/** 绑定详情模式中的表格开关 */
function _bindMarketDetailEvents(state) {
  const sellToggle = document.getElementById('market-show-sell');
  if (sellToggle) {
    sellToggle.onchange = function () {
      if (_refreshMarket) _refreshMarket('detail');
    };
  }
}

/**
 * 构建星系选择导航栏（仅显示已访问星系）
 */
function _buildMarketGalaxyNav(state) {
  const nav = document.getElementById('market-galaxy-nav');
  if (!nav) return;
  nav.innerHTML = '';
  const visited = state.visitedGalaxies || [state.currentGalaxy];
  GALAXIES.forEach(function (g) {
    if (visited.indexOf(g.id) === -1) return;
    const btn = document.createElement('button');
    btn.className = 'market-galaxy-btn' + (g.id === _marketViewGalaxy ? ' active' : '');
    btn.textContent = g.icon + ' ' + g.name;
    btn.addEventListener('click', function () {
      _marketViewGalaxy = g.id;
      _buildMarketGalaxyNav(state);
      if (_refreshMarket) _refreshMarket(_marketMode || 'detail');
    });
    nav.appendChild(btn);
  });
}

/**
 * 绑定标签页按钮切换
 * @param {Function} [onTabClick]  可选回调 (tabId:string) => void
 */
export function initTabs(onTabClick) {
  _tabClickCallback = onTabClick || null;
  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      activateTab(btn.dataset.tab);
    });
  });

  // 面板关闭按钮（新设计：覆盖层关闭按钮）
  var infoPanelToggle = document.getElementById('info-panel-toggle');
  if (infoPanelToggle) {
    infoPanelToggle.addEventListener('click', function () {
      _closeOverlayPanel('info-panel');
      _setBottomNavActive('starmap');
    });
  }

  var consolePanelClose = document.getElementById('console-panel-close');
  if (consolePanelClose) {
    consolePanelClose.addEventListener('click', function () {
      _closeOverlayPanel('console-panel');
      _setBottomNavActive('starmap');
    });
  }

  // 底部导航按钮
  var bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) {
    bottomNav.addEventListener('click', function (e) {
      var btn = e.target.closest('.bottom-nav-btn');
      if (!btn) return;
      var view = btn.dataset.view;
      _handleBottomNav(view);
    });
  }
}

/**
 * 底部导航按钮处理
 * @param {string} view  按钮对应的视图名
 */
function _handleBottomNav(view) {
  var currentActive = document.querySelector('.bottom-nav-btn.active');
  var currentView = currentActive ? currentActive.dataset.view : 'starmap';

  if (view === 'starmap') {
    _closeAllOverlayPanels();
    closeMarket();
    _setBottomNavActive('starmap');
    return;
  }

  if (view === 'market') {
    // If already open, close it
    if (currentView === 'market' && _marketOpen) {
      closeMarket();
      _setBottomNavActive('starmap');
    } else {
      _closeAllOverlayPanels();
      _setBottomNavActive('market');
      if (_stateRef) {
        openMarket(_stateRef);
      }
      // If _stateRef is not set yet, skip opening market (will be set on init)
    }
    return;
  }

  if (view === 'hangar') {
    if (currentView === 'hangar') {
      _closeOverlayPanel('trade-panel');
      _setBottomNavActive('starmap');
    } else {
      _closeAllOverlayPanels();
      closeMarket();
      _openOverlayPanel('trade-panel');
      _setBottomNavActive('hangar');
    }
    return;
  }

  if (view === 'quests') {
    if (currentView === 'quests') {
      _closeOverlayPanel('info-panel');
      _setBottomNavActive('starmap');
    } else {
      _closeAllOverlayPanels();
      closeMarket();
      _openOverlayPanel('info-panel');
      _setBottomNavActive('quests');
    }
    return;
  }

  if (view === 'console') {
    if (currentView === 'console') {
      _closeOverlayPanel('console-panel');
      _setBottomNavActive('starmap');
    } else {
      _closeAllOverlayPanels();
      closeMarket();
      _openOverlayPanel('console-panel');
      _setBottomNavActive('console');
    }
    return;
  }


}

function _openOverlayPanel(id) {
  var el = document.getElementById(id);
  if (el) el.classList.add('panel-open');
}

function _closeOverlayPanel(id) {
  var el = document.getElementById(id);
  if (el) el.classList.remove('panel-open');
}

function _closeAllOverlayPanels() {
  _closeOrbitScanPanel();
  ['info-panel', 'trade-panel', 'console-panel'].forEach(function (id) {
    _closeOverlayPanel(id);
  });
}

function _setBottomNavActive(view) {
  document.querySelectorAll('.bottom-nav-btn').forEach(function (btn) {
    if (btn.dataset.view === view) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

export function activateTab(tabId) {
  var btn = document.querySelector('.tab-btn[data-tab="' + tabId + '"]');
  if (!btn) return;

  var group = btn.dataset.tabGroup || '';
  document.querySelectorAll('.tab-btn[data-tab-group="' + group + '"]').forEach(function (b) { b.classList.remove('active'); });
  document.querySelectorAll('.tab-pane[data-tab-group="' + group + '"]').forEach(function (p) { p.classList.remove('active'); });
  btn.classList.add('active');

  var pane = document.getElementById(tabId);
  if (pane) pane.classList.add('active');

  // 如果所属面板是隐藏的覆盖层，则自动打开它并更新底部导航
  if (group === 'info') {
    _openOverlayPanel('info-panel');
    _setBottomNavActive('quests');
  } else if (group === 'trade') {
    _openOverlayPanel('trade-panel');
    _setBottomNavActive('hangar');
  }

  if (_tabClickCallback) _tabClickCallback(tabId);
}
