// js/ui/UIManager.js — 全局面板视图管理器
// 职责：遵循 SOLID 原则，统一管理界面大面板（星图、交易所、机库、个人档案）的显示隐藏、互斥和星图背景高斯模糊状态。

import * as EventBus from '../core/EventBus.js';
import { openSecondarySurface, closeAllSecondarySurfaces } from './SurfaceManager.js';
import { loadSettings } from '../core/SettingsCore.js';

let _stateRef = null;
let _currentView = 'starmap';
let _handlers = {
  onOpenMarket: null,
  onCloseMarket: null,
  onGetMarketOpen: null,
  onOpenHangar: null,
  onOpenQuests: null
};

/**
 * 初始化全局视图管理器
 * @param {Object} stateRef 游戏全局状态的引用
 * @param {Object} handlers 用于和其它UI解耦的动作回调
 */
export function init(stateRef, handlers) {
  _stateRef = stateRef;
  _currentView = 'starmap';
  
  if (handlers) {
    _handlers = Object.assign(_handlers, handlers);
  }

  // 绑定底栏点击事件
  var bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) {
    // 移除旧事件监听器（克隆节点）防止重复绑定
    var newBottomNav = bottomNav.cloneNode(true);
    bottomNav.parentNode.replaceChild(newBottomNav, bottomNav);
    newBottomNav.addEventListener('click', function (e) {
      var btn = e.target.closest('.bottom-nav-btn');
      if (!btn) return;

      var view = btn.dataset.view;
      switchView(view);
    });
    newBottomNav.addEventListener('keydown', _handleBottomNavKeydown);
  }

  // 注册全局事件总线监听，支持以事件形式触发视图切换
  EventBus.on('view:switch', function (view) {
    switchView(view);
  });

  // 监听全息特效开关的变化，并即时更新模糊样式
  EventBus.on('settings:terminalBlur:changed', function (enabled) {
    _getStarmapCanvases().forEach(function (canvas) {
      _applyBlurStyle(canvas, _currentView);
    });
  });

  // 注册挂载到全局
  globalThis.__linegameUIManager = {
    switchView: switchView,
    setBottomNavActiveDirectly: function (view) {
      _currentView = view || 'starmap';
      _syncViewVisualState(_currentView);
      _setBottomNavActive(_currentView);
    },
    getCurrentView: getCurrentView
  };
}

/**
 * 获取当前处于活动状态的视图名称
 */
export function getCurrentView() {
  return _currentView;
}

/**
 * 切换大终端视图（核心互斥和背景高斯模糊逻辑）
 * @param {string} view 目标视图名称
 */
export function switchView(view) {
  var previousView = _currentView;

  if (view === 'logs') {
    EventBus.emit('logs:badge:clear');
    _setBottomNavActive(previousView || 'starmap');
    return;
  }

  // 1. 如果点击的是当前已激活的非星图视图，则代表“再次点击折叠”，返回星图
  if (view !== 'starmap' && view === previousView) {
    view = 'starmap';
  }

  // 2. 清理和关闭所有已打开的面板状态
  if (_handlers.onCloseMarket) {
    _handlers.onCloseMarket();
  }
  closeAllSecondarySurfaces();

  // 3. 驱动 3D 星图 Canvas 容器动态加减模糊样式
  _syncViewVisualState(view);

  // 4. 执行具体 View 的唤起行为
  if (view === 'starmap') {
    _currentView = 'starmap';
  } else if (view === 'market') {
    _currentView = 'market';
    if (_handlers.onOpenMarket && _stateRef) {
      _handlers.onOpenMarket(_stateRef);
    }
  } else if (view === 'hangar') {
    _currentView = 'hangar';
    openSecondarySurface('trade-panel');
    if (_handlers.onOpenHangar && _stateRef) {
      _handlers.onOpenHangar(_stateRef);
    }
  } else if (view === 'quests') {
    _currentView = 'quests';
    if (_handlers.onOpenQuests && _stateRef) {
      _handlers.onOpenQuests(_stateRef);
    } else {
      openSecondarySurface('info-panel');
    }
  }

  // 5. 更新底部导航激活态高亮
  _setBottomNavActive(view);
}

/**
 * 更新底部导航栏高亮，并向 EventBus 广播变化
 * @param {string} view 激活的视图
 */
function _setBottomNavActive(view) {
  document.querySelectorAll('.bottom-nav-btn').forEach(function (btn) {
    var isActive = btn.dataset.view === view;
    if (isActive) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
    _syncBottomNavButtonState(btn, isActive);
  });

  EventBus.emit('navigation:changed', view);
}

function _syncBottomNavButtonState(btn, isActive) {
  if (!btn || typeof btn.setAttribute !== 'function') return;
  btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  if (isActive) {
    btn.setAttribute('aria-current', 'page');
  } else if (typeof btn.removeAttribute === 'function') {
    btn.removeAttribute('aria-current');
  }
}

function _handleBottomNavKeydown(event) {
  if (!event || !event.target || typeof event.target.closest !== 'function') return;
  var btn = event.target.closest('.bottom-nav-btn');
  if (!btn) return;

  var key = event.key;
  if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home' && key !== 'End') return;

  var buttons = Array.prototype.slice.call(document.querySelectorAll('.bottom-nav-btn'));
  var currentIndex = buttons.indexOf(btn);
  if (currentIndex < 0 || buttons.length === 0) return;

  var nextIndex = currentIndex;
  if (key === 'Home') nextIndex = 0;
  else if (key === 'End') nextIndex = buttons.length - 1;
  else if (key === 'ArrowLeft') nextIndex = (currentIndex + buttons.length - 1) % buttons.length;
  else if (key === 'ArrowRight') nextIndex = (currentIndex + 1) % buttons.length;

  if (typeof event.preventDefault === 'function') event.preventDefault();
  if (buttons[nextIndex] && typeof buttons[nextIndex].focus === 'function') {
    buttons[nextIndex].focus();
  }
}

function _syncViewVisualState(view) {
  _getStarmapCanvases().forEach(function (canvas) {
    _applyBlurStyle(canvas, view);
  });
}

function _getStarmapCanvases() {
  if (typeof document === 'undefined') return [];
  if (typeof document.querySelectorAll === 'function') {
    var canvases = Array.prototype.slice.call(document.querySelectorAll('.starmap-canvas'));
    if (canvases.length > 0) return canvases;
  }
  var legacyCanvas = document.getElementById && document.getElementById('map-3d-canvas');
  return legacyCanvas ? [legacyCanvas] : [];
}

/**
 * 驱动星图 3D Canvas 应用特效模糊或低性能降级遮罩
 * @param {HTMLElement} canvas 
 * @param {string} view 
 */
function _applyBlurStyle(canvas, view) {
  if (!canvas) return;
  var settings = loadSettings();
  var useBlur = settings.terminalBlur !== false;

  canvas.classList.remove('starmap-blur-active');
  canvas.classList.remove('starmap-blur-active-lowperf');

  if (view !== 'starmap') {
    if (useBlur) {
      canvas.classList.add('starmap-blur-active');
    } else {
      canvas.classList.add('starmap-blur-active-lowperf');
    }
  }
}
