// js/ui/MapUI.js — 星系地图交互事件绑定（支持星系/星球双层视图 + 市场面板）
// 依赖：ui/Renderer.js, systems/economy/Economy.js
// 导出：init, initTabs, refreshGalaxyBtn, openMarket, closeMarket, isMarketOpen,
//        setRefreshMarket, getMarketViewSystem, refreshMarketLocation

import * as Renderer from './Renderer.js';
import * as Economy  from '../systems/economy/Economy.js';
import { GALAXIES, findSystem }  from '../data/systems.js';

let _tabClickCallback = null;
let _marketOpen = false;
let _smallScreenMql = null;

// 市场浏览状态
let _marketViewGalaxy = null;
let _marketViewSystem = null;
// 市场表格刷新回调（由 GameManager 注入）
let _refreshMarket = null;

/**
 * 注入市场刷新回调（在 GameManager.init 中调用）
 * @param {Function} fn  () => void  — 刷新市场表格
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

/**
 * 绑定星系地图的鼠标交互
 * @param {object}   stateRef    游戏状态对象（引用）
 * @param {Function} onTravel    (systemId: string) => void
 * @param {Function} onGalaxyJump (galaxyId: string) => void  跨星系跳转回调
 */
export function init(stateRef, onTravel, onGalaxyJump) {
  const mapCanvas = document.getElementById('map-canvas');

  mapCanvas.addEventListener('mousemove', function (e) {
    const r = mapCanvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;

    if (stateRef.mapView === 'galaxies') {
      const gal = Renderer.getGalaxyAtPoint(mx, my, r.width, r.height);
      mapCanvas.title = gal ? gal.name : '';
      stateRef.hoveredSystem = null;
    } else {
      const sys = Renderer.getSystemAtPoint(mx, my, r.width, r.height,
        stateRef.viewingGalaxy || stateRef.currentGalaxy);
      const newId = sys ? sys.id : null;
      if (newId !== stateRef.hoveredSystem) {
        stateRef.hoveredSystem = newId;
        if (newId && newId !== stateRef.currentSystem) {
          const playerLevel = stateRef.playerLevel || 1;
          const sysLocked = playerLevel < (sys.minLevel || 1);
          if (sysLocked) {
            mapCanvas.title = '🔒 ' + sys.name + ' — 需要等级 ' + (sys.minLevel || 1) + ' 解锁（当前 Lv.' + playerLevel + '）';
          } else if (sys.galaxyId === stateRef.currentGalaxy) {
            // 同星系燃料消耗提示
            const cost = Economy.getFuelCost(stateRef.currentSystem, newId, stateRef.fuelEfficiency);
            mapCanvas.title = '前往 ' + sys.name + '（需要 ' + cost + ' 燃料）';
          } else {
            mapCanvas.title = '跨星系跳转到 ' + sys.name + '（需要超空间跃迁）';
          }
        } else {
          mapCanvas.title = '';
        }
      }
    }
  });

  mapCanvas.addEventListener('mouseleave', function () {
    stateRef.hoveredSystem = null;
  });

  mapCanvas.addEventListener('click', function (e) {
    const r = mapCanvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;

    if (stateRef.mapView === 'galaxies') {
      // 星系总览 — 点击星系切换到该星系的星球视图
      const gal = Renderer.getGalaxyAtPoint(mx, my, r.width, r.height);
      if (gal) {
        const unlocked = gal.unlocked ||
          (stateRef.researchedTechs && stateRef.researchedTechs.includes(gal.techRequired));
        if (unlocked) {
          stateRef.viewingGalaxy = gal.id;
          stateRef.mapView = 'planets';
          _updateGalaxyBtn(stateRef);
        }
      }
    } else {
      // 星球视图 — 点击星球旅行
      const sys = Renderer.getSystemAtPoint(mx, my, r.width, r.height,
        stateRef.viewingGalaxy || stateRef.currentGalaxy);
      if (sys && sys.id !== stateRef.currentSystem) {
        // 等级锁定检查
        const playerLevel = stateRef.playerLevel || 1;
        if (playerLevel < (sys.minLevel || 1)) {
          // 星球未解锁，不允许旅行
          return;
        }
        if (sys.galaxyId !== stateRef.currentGalaxy) {
          // 跨星系旅行
          if (onGalaxyJump) onGalaxyJump(sys.id);
        } else {
          onTravel(sys.id);
        }
      }
    }
  });

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
    });
  }

  // 市场按钮
  const marketBtn = document.getElementById('market-view-btn');
  const marketCloseBtn = document.getElementById('market-close-btn');
  if (marketBtn) {
    marketBtn.addEventListener('click', function () {
      if (_marketOpen) {
        closeMarket();
      } else {
        openMarket(stateRef);
      }
    });
  }
  if (marketCloseBtn) {
    marketCloseBtn.addEventListener('click', function () {
      closeMarket();
    });
  }
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

/** 打开市场面板 */
export function openMarket(stateRef) {
  const overlay = document.getElementById('market-overlay');
  const marketBtn = document.getElementById('market-view-btn');
  if (!overlay) return;
  // 每次打开时默认显示当前星球
  _marketViewGalaxy = stateRef.currentGalaxy;
  _marketViewSystem = stateRef.currentSystem;
  _marketOpen = true;
  overlay.classList.remove('hidden');
  if (marketBtn) marketBtn.classList.add('active');
  _buildMarketGalaxyNav(stateRef);
  _buildMarketPlanetSelect(stateRef);
  _updateMarketLocation(stateRef);
  if (_refreshMarket) _refreshMarket();
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

/** 旅行后刷新市场（重置为当前星球并重建导航） */
export function refreshMarketLocation(stateRef) {
  if (!_marketOpen) return;
  _marketViewGalaxy = stateRef.currentGalaxy;
  _marketViewSystem = stateRef.currentSystem;
  _buildMarketGalaxyNav(stateRef);
  _buildMarketPlanetSelect(stateRef);
  _updateMarketLocation(stateRef);
  if (_refreshMarket) _refreshMarket();
}

/** 更新市场面板的位置信息 */
function _updateMarketLocation(stateRef) {
  const el = document.getElementById('market-overlay-location');
  if (!el) return;
  const sysId = _marketViewSystem || stateRef.currentSystem;
  const sys = findSystem(sysId);
  if (sys) {
    const isCurrentSys = sysId === stateRef.currentSystem;
    el.textContent = (isCurrentSys ? '📍 ' : '🔍 ') + sys.name + ' [' + sys.typeLabel + '] — ' + sys.description;
  }
}

/**
 * 将已访问星球按星系分组（避免在每个点击处理器中重复查找）
 */
function _groupVisitedByGalaxy(state) {
  const map = Object.create(null);
  (state.visitedSystems || []).forEach(function (sid) {
    const s = findSystem(sid);
    if (!s) return;
    if (!map[s.galaxyId]) map[s.galaxyId] = [];
    map[s.galaxyId].push(sid);
  });
  return map;
}

/**
 * 构建星系选择导航栏（仅显示已访问星系）
 */
function _buildMarketGalaxyNav(state) {
  const nav = document.getElementById('market-galaxy-nav');
  if (!nav) return;
  nav.innerHTML = '';
  const visited = state.visitedGalaxies || [state.currentGalaxy];
  const visitedByGalaxy = _groupVisitedByGalaxy(state);
  GALAXIES.forEach(function (g) {
    if (visited.indexOf(g.id) === -1) return;
    const btn = document.createElement('button');
    btn.className = 'market-galaxy-btn' + (g.id === _marketViewGalaxy ? ' active' : '');
    btn.textContent = g.icon + ' ' + g.name;
    btn.addEventListener('click', function () {
      _marketViewGalaxy = g.id;
      // 优先选中当前星球（若在该星系），否则选第一个已访问星球
      const planetsInGalaxy = visitedByGalaxy[g.id] || [];
      const curInGalaxy = planetsInGalaxy.indexOf(state.currentSystem) !== -1;
      _marketViewSystem = curInGalaxy ? state.currentSystem : (planetsInGalaxy[0] || null);
      _buildMarketGalaxyNav(state);
      _buildMarketPlanetSelect(state);
      _updateMarketLocation(state);
      if (_refreshMarket) _refreshMarket();
    });
    nav.appendChild(btn);
  });
}

/**
 * 构建星球下拉选择器（仅显示当前星系中已访问的星球）
 */
function _buildMarketPlanetSelect(state) {
  const sel = document.getElementById('market-planet-select');
  if (!sel) return;
  sel.innerHTML = '';
  const visitedByGalaxy = _groupVisitedByGalaxy(state);
  const planetsInGalaxy = visitedByGalaxy[_marketViewGalaxy] || [];
  let viewSystemFound = false;
  planetsInGalaxy.forEach(function (sid) {
    const s = findSystem(sid);
    if (!s) return;
    const opt = document.createElement('option');
    opt.value = sid;
    const isCurrent = sid === state.currentSystem;
    opt.textContent = (isCurrent ? '📍 ' : '') + s.name + ' [' + s.typeLabel + ']';
    if (sid === _marketViewSystem) { opt.selected = true; viewSystemFound = true; }
    sel.appendChild(opt);
  });
  // 若目标星球不在列表中，默认选第一个
  if (!viewSystemFound && sel.options.length > 0) {
    sel.options[0].selected = true;
    _marketViewSystem = sel.options[0].value;
  }
  sel.onchange = function () {
    _marketViewSystem = sel.value;
    _updateMarketLocation(state);
    if (_refreshMarket) _refreshMarket();
  };
}

/**
 * 绑定标签页按钮切换
 * @param {Function} [onTabClick]  可选回调 (tabId:string) => void
 */
export function initTabs(onTabClick) {
  _tabClickCallback = onTabClick || null;
  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var group = btn.dataset.tabGroup || '';
      // 只切换同组标签
      document.querySelectorAll('.tab-btn[data-tab-group="' + group + '"]').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-pane[data-tab-group="' + group + '"]').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
      // 通知回调（用于教程触发等）
      if (_tabClickCallback) _tabClickCallback(btn.dataset.tab);
    });
  });

  // 左侧面板收起/展开
  var toggleBtn = document.getElementById('info-panel-toggle');
  var infoPanel = document.getElementById('info-panel');
  if (toggleBtn && infoPanel) {
    if (!_smallScreenMql) {
      _smallScreenMql = window.matchMedia('(max-width: 1024px)');
    }
    toggleBtn.addEventListener('click', function () {
      if (_smallScreenMql.matches) {
        var expanded = infoPanel.classList.toggle('expanded-sm');
        toggleBtn.textContent = expanded ? '◀' : '▶';
        toggleBtn.title = expanded ? '收起面板' : '展开面板';
      } else {
        var collapsed = infoPanel.classList.toggle('collapsed');
        toggleBtn.textContent = collapsed ? '▶' : '◀';
        toggleBtn.title = collapsed ? '展开面板' : '收起面板';
      }
    });
  }
}
