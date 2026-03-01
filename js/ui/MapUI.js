// js/ui/MapUI.js — 星系地图交互事件绑定（支持星系/星球双层视图 + 市场面板）
// 依赖：ui/Renderer.js, systems/economy/Economy.js
// 导出：init, initTabs, refreshGalaxyBtn, openMarket, closeMarket, isMarketOpen

import * as Renderer from './Renderer.js';
import * as Economy  from '../systems/economy/Economy.js';
import { GALAXIES, findSystem }  from '../data/systems.js';

let _tabClickCallback = null;
let _marketOpen = false;

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
      const gal = Renderer.getGalaxyAtPoint(mx, my, mapCanvas.width, mapCanvas.height);
      mapCanvas.title = gal ? gal.name : '';
      stateRef.hoveredSystem = null;
    } else {
      const sys = Renderer.getSystemAtPoint(mx, my, mapCanvas.width, mapCanvas.height,
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
      const gal = Renderer.getGalaxyAtPoint(mx, my, mapCanvas.width, mapCanvas.height);
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
      const sys = Renderer.getSystemAtPoint(mx, my, mapCanvas.width, mapCanvas.height,
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
  _marketOpen = true;
  overlay.classList.remove('hidden');
  if (marketBtn) marketBtn.classList.add('active');
  // 更新市场位置信息
  _updateMarketLocation(stateRef);
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

/** 更新市场面板的位置信息 */
function _updateMarketLocation(stateRef) {
  const el = document.getElementById('market-overlay-location');
  if (!el) return;
  const sys = findSystem(stateRef.currentSystem);
  if (sys) {
    el.textContent = '📍 ' + sys.name + ' [' + sys.typeLabel + '] — ' + sys.description;
  }
}

/** 刷新市场位置（旅行后调用） */
export function refreshMarketLocation(stateRef) {
  if (_marketOpen) _updateMarketLocation(stateRef);
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
    toggleBtn.addEventListener('click', function () {
      var collapsed = infoPanel.classList.toggle('collapsed');
      toggleBtn.textContent = collapsed ? '▶' : '◀';
      toggleBtn.title = collapsed ? '展开面板' : '收起面板';
    });
  }
}
