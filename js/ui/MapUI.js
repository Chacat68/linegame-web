// js/ui/MapUI.js — 星系地图交互事件绑定
// 依赖：ui/Renderer.js, systems/economy/Economy.js
// 导出：init

import * as Renderer from './Renderer.js';
import * as Economy  from '../systems/economy/Economy.js';

let _tabClickCallback = null;

/**
 * 绑定星系地图的鼠标交互
 * @param {object}   stateRef    游戏状态对象（引用，直接读写 hoveredSystem）
 * @param {Function} onTravel    (systemId: string) => void
 */
export function init(stateRef, onTravel) {
  const mapCanvas = document.getElementById('map-canvas');

  mapCanvas.addEventListener('mousemove', function (e) {
    const r   = mapCanvas.getBoundingClientRect();
    const sys = Renderer.getSystemAtPoint(
      e.clientX - r.left, e.clientY - r.top,
      mapCanvas.width, mapCanvas.height
    );
    const newId = sys ? sys.id : null;
    if (newId !== stateRef.hoveredSystem) {
      stateRef.hoveredSystem = newId;
      if (newId && newId !== stateRef.currentSystem) {
        const cost = Economy.getFuelCost(stateRef.currentSystem, newId, stateRef.fuelEfficiency);
        mapCanvas.title = '前往 ' + sys.name + '（需要 ' + cost + ' 燃料）';
      } else {
        mapCanvas.title = '';
      }
    }
  });

  mapCanvas.addEventListener('mouseleave', function () {
    stateRef.hoveredSystem = null;
  });

  mapCanvas.addEventListener('click', function (e) {
    const r   = mapCanvas.getBoundingClientRect();
    const sys = Renderer.getSystemAtPoint(
      e.clientX - r.left, e.clientY - r.top,
      mapCanvas.width, mapCanvas.height
    );
    if (sys && sys.id !== stateRef.currentSystem) {
      onTravel(sys.id);
    }
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
      document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-pane').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
      // 通知回调（用于教程触发等）
      if (_tabClickCallback) _tabClickCallback(btn.dataset.tab);
    });
  });
}
