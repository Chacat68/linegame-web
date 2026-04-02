// js/ui/MapUI.js — 星系地图交互事件绑定（支持星系/星球双层视图 + 市场面板）
// 导出：init, initTabs, init3DCallbacks, refreshGalaxyBtn, openMarket, closeMarket, isMarketOpen,
//        setRefreshMarket, getMarketViewSystem, refreshMarketLocation,
//        showMarketOverview, showMarketDetail, refreshPlanetDetail, getMapView, getCurrentGalaxyId
import * as Renderer3D from './Renderer3DAdvanced.js';
import * as Faction from '../systems/faction/FactionSystem.js';
import { GALAXIES, findSystem, findGalaxy }  from '../data/systems.js';

let _tabClickCallback = null;
let _marketOpen = false;
let _smallScreenMql = null;

// 市场浏览状态
let _marketViewGalaxy = null;
let _marketViewSystem = null;      // 详情模式时选中的星球
let _marketMode = 'detail';
// 市场刷新回调（由 GameManager 注入）
let _refreshMarket = null;          // (mode) => void
let _stateRef = null;               // 用于内部事件引用

/**
 * 注入市场刷新回调（在 GameManager.init 中调用）
 * @param {Function} fn  (mode:'detail') => void  — 刷新市场
 */
export function setRefreshMarket(fn) {
  _refreshMarket = fn;
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

  // 星系视图切换按钮
  const btn = document.getElementById('galaxy-view-btn');
  if (btn) {
    btn.addEventListener('click', function () {
      // 先关闭市场
      closeMarket();
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
}

function _getSafetyLabel(score) {
  if (score >= 80) return '安定';
  if (score >= 60) return '可控';
  if (score >= 40) return '紧张';
  return '危险';
}

export function refreshPlanetDetail(stateRef) {
  const panel = document.getElementById('planet-detail-panel');
  const mapCanvas = document.getElementById('map-canvas');
  const mapContainer = document.getElementById('map-container');
  if (!panel) return;
  if (!mapCanvas || !mapContainer) return;

  const displayId = stateRef.hoveredSystem;
  if (stateRef.mapView !== 'planets' || !displayId) {
    panel.classList.remove('visible');
    return;
  }
  const sys = findSystem(displayId);
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
    '<div class="planet-detail-item"><span class="planet-detail-label">解锁</span>' + lockText + '</div>';

  panel.classList.add('visible');

  const canvasW = mapCanvas.clientWidth;
  const canvasH = mapCanvas.clientHeight;
  const nodeX = sys.x * canvasW;
  const nodeY = sys.y * canvasH;
  const offset = 14;

  const panelW = Math.min(320, Math.max(200, canvasW - 16));
  panel.style.width = panelW + 'px';

  const maxLeft = Math.max(8, canvasW - panelW - 8);
  const placeRight = nodeX < (canvasW * 0.58);
  let left = placeRight ? (nodeX + offset) : (nodeX - panelW - offset);
  left = Math.max(8, Math.min(maxLeft, left));

  const approxH = 160;
  const maxTop = Math.max(8, canvasH - approxH - 8);
  let top = nodeY - approxH * 0.5;
  top = Math.max(8, Math.min(maxTop, top));

  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
}

/** 打开市场面板（默认当前节点功能页） */
export function openMarket(stateRef) {
  const overlay = document.getElementById('market-overlay');
  const marketBtn = document.getElementById('market-view-btn');
  if (!overlay) return;
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

  if (view === 'business-terminal') {
    // 商业终端是全屏覆盖，需要通知 GameManager 打开
    if (window.GameManagerAPI && window.GameManagerAPI.openBusinessTerminal) {
      window.GameManagerAPI.openBusinessTerminal();
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
