// js/ui/MapUI.js — 星系地图交互事件绑定（支持星系/星球双层视图）
// 依赖：ui/Renderer.js, systems/economy/Economy.js
// 导出：init

import * as Renderer from './Renderer.js';
import * as Economy  from '../systems/economy/Economy.js';
import { GALAXIES }  from '../data/systems.js';

let _tabClickCallback = null;

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
          // 同星系燃料消耗提示
          if (sys.galaxyId === stateRef.currentGalaxy) {
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
      if (stateRef.mapView === 'galaxies') {
        stateRef.mapView = 'planets';
        stateRef.viewingGalaxy = stateRef.currentGalaxy;
      } else {
        stateRef.mapView = 'galaxies';
      }
      _updateGalaxyBtn(stateRef);
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

/**
 * 绑定标签页按钮切换
 * @param {Function} [onTabClick]  可选回调 (tabId:string) => void
 */
export function initTabs(onTabClick) {
  _tabClickCallback = onTabClick || null;
  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-pane').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
      // 通知回调（用于教程触发等）
      if (_tabClickCallback) _tabClickCallback(btn.dataset.tab);
    });
  });
}
