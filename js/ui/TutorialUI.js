// js/ui/TutorialUI.js — 新手引导界面
// 依赖：systems/tutorial/TutorialSystem.js, core/EventBus.js
// 导出：init, show, hide, destroy

import * as EventBus from '../core/EventBus.js';
import * as Tutorial from '../systems/tutorial/TutorialSystem.js';

let _overlay   = null;  // 半透明遮罩
let _tooltip   = null;  // 引导提示框
let _spotEl    = null;  // 当前高亮的 DOM 元素
let _onAdvance      = null;  // 推进回调
let _onSkip         = null;  // 跳过回调
let _stepHandler    = null;  // EventBus 监听器引用
let _completeHandler = null;
let _activePosition = 'center';
let _positionFrameId = null;
let _viewportListenersBound = false;
let _returnFocusTarget = null;

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

/**
 * @param {Function} onAdvanceCb  点击"下一步"的回调
 * @param {Function} onSkipCb     点击"跳过教程"的回调
 */
export function init(onAdvanceCb, onSkipCb) {
  _onAdvance = onAdvanceCb;
  _onSkip    = onSkipCb;

  // 创建遮罩与提示框（第一次创建，后续复用）
  _overlay = document.getElementById('tutorial-overlay');
  _tooltip = document.getElementById('tutorial-tooltip');

  if (!_overlay || !_tooltip) return;
  _bindViewportListeners();

  // 防止重复注册（重新开始游戏时 init 会再次调用）
  if (_stepHandler) EventBus.off('tutorial:step', _stepHandler);
  if (_completeHandler) EventBus.off('tutorial:complete', _completeHandler);

  _stepHandler = function (data) {
    _renderStep(data.step, data.index, data.total);
  };
  _completeHandler = function () {
    hide();
  };

  EventBus.on('tutorial:step', _stepHandler);
  EventBus.on('tutorial:complete', _completeHandler);
}

// ---------------------------------------------------------------------------
// 渲染某一教程步骤
// ---------------------------------------------------------------------------

function _renderStep(step, index, total) {
  if (!_overlay || !_tooltip) return;
  step = step || {};
  _rememberTutorialTrigger();

  // 阶段名称
  const phaseNames = { 1: '起步校准', 2: '第一轮交易', 3: '行动接管' };
  const phaseName  = phaseNames[step.phase] || '';

  // 进度
  const safeIndex = Math.max(0, Number(index) || 0);
  const safeTotal = Math.max(1, Number(total) || 1);
  const stepNumber = Math.min(safeTotal, safeIndex + 1);
  const progressPct = Math.round((stepNumber / safeTotal) * 100);

  // 构建提示框 HTML
  const isManual     = step.trigger === 'manual';
  const showNext     = isManual;
  const actionHint   = !isManual
    ? '<div class="tut-action-hint" id="tutorial-action-hint" role="status">请执行上述操作以继续</div>'
    : '';
  const progressText = '第 ' + stepNumber + ' / ' + safeTotal + ' 步';

  _tooltip.innerHTML =
    '<div class="tut-header">' +
      '<span class="tut-phase">阶段' + _escapeHtml(step.phase) + ': ' + _escapeHtml(phaseName) + '</span>' +
      '<span class="tut-progress">' + stepNumber + '/' + safeTotal + '</span>' +
    '</div>' +
    '<div class="tut-progress-bar" role="progressbar" aria-label="教程进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progressPct + '" aria-valuetext="' + _escapeHtml(progressText) + '"><div class="tut-progress-fill" style="width:' + progressPct + '%"></div></div>' +
    '<div class="tut-npc">' +
      '<span class="tut-npc-icon" aria-hidden="true">' + _escapeHtml(step.npcIcon || '📡') + '</span>' +
      '<span class="tut-npc-name">' + _escapeHtml(step.npcName || '导航员') + '</span>' +
    '</div>' +
    '<h3 class="tut-title" id="tutorial-tooltip-title">' + _escapeHtml(step.title || '教程提示') + '</h3>' +
    '<div class="tut-content" id="tutorial-tooltip-content">' + _formatContent(step.content || '') + '</div>' +
    actionHint +
    '<div class="tut-actions">' +
      (showNext ? '<button id="tut-next-btn" class="tut-btn tut-btn-primary" type="button">下一步 →</button>' : '') +
      '<button id="tut-skip-btn" class="tut-btn tut-btn-secondary" type="button">跳过教程</button>' +
    '</div>';

  _tooltip.dataset.step = String(stepNumber);
  _tooltip.dataset.totalSteps = String(safeTotal);
  _tooltip.dataset.trigger = isManual ? 'manual' : 'action';
  _tooltip.setAttribute('aria-describedby', showNext
    ? 'tutorial-tooltip-content'
    : 'tutorial-tooltip-content tutorial-action-hint');
  _tooltip.setAttribute('aria-label', progressText + '：' + (step.title || '教程提示'));

  // 按钮事件
  const nextBtn = document.getElementById('tut-next-btn');
  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      if (_onAdvance) _onAdvance();
    });
  }
  const skipBtn = document.getElementById('tut-skip-btn');
  if (skipBtn) {
    skipBtn.addEventListener('click', function () {
      if (_onSkip) _onSkip();
    });
  }

  // 高亮
  _clearHighlight();
  if (step.highlight) {
    _spotEl = document.querySelector(step.highlight);
    if (_spotEl) {
      _spotEl.classList.add('tut-highlight');
    }
  }

  // 定位提示框
  _activePosition = step.position || 'center';
  _positionTooltip(_activePosition, _spotEl);

  // 显示
  show();
}

// ---------------------------------------------------------------------------
// 提示框定位
// ---------------------------------------------------------------------------

function _positionTooltip(position, targetEl) {
  _tooltip.className = 'tutorial-tooltip';
  _tooltip.dataset.position = position || 'center';
  _resetTooltipPosition();

  const viewport = _getViewportSize();
  const safeArea = _getSafeAreaInsets();
  const margin = viewport.width <= 560 ? 10 : 12;
  const viewportTop = viewport.top + safeArea.top + margin;
  const viewportLeft = viewport.left + safeArea.left + margin;
  const viewportBottom = viewport.bottom - safeArea.bottom - margin;
  const viewportRight = viewport.right - safeArea.right - margin;
  const availableWidth = Math.max(1, viewportRight - viewportLeft);
  const availableHeight = Math.max(1, viewportBottom - viewportTop);
  _tooltip.dataset.viewport = viewport.width <= 560 ? 'compact' : 'wide';
  _tooltip.style.maxWidth = availableWidth + 'px';
  _tooltip.style.maxHeight = availableHeight + 'px';

  if (position === 'center' || !targetEl || typeof targetEl.getBoundingClientRect !== 'function') {
    _tooltip.classList.add('tut-pos-center');
    _tooltip.dataset.position = 'center';
    _tooltip.style.top = Math.round(viewportTop + (availableHeight / 2)) + 'px';
    _tooltip.style.left = Math.round(viewportLeft + (availableWidth / 2)) + 'px';
    _tooltip.style.transform = 'translate(-50%, -50%)';
    return;
  }

  // 根据目标元素位置，放置提示框
  const rect = targetEl.getBoundingClientRect();
  const gap = viewport.width <= 560 ? 8 : 12;
  const tooltipSize = _getTooltipSize(availableWidth, availableHeight);
  let finalPosition = position;
  let top = rect.bottom + gap;
  let left = rect.left + (rect.width / 2) - (tooltipSize.width / 2);

  if (position === 'top') {
    top = rect.top - tooltipSize.height - gap;
  } else if (position === 'left') {
    top = rect.top + (rect.height / 2) - (tooltipSize.height / 2);
    left = rect.left - tooltipSize.width - gap;
  } else if (position === 'right') {
    top = rect.top + (rect.height / 2) - (tooltipSize.height / 2);
    left = rect.right + gap;
  }

  if ((position === 'bottom' && top + tooltipSize.height > viewportBottom) ||
      (position === 'top' && top < viewportTop)) {
    finalPosition = position === 'bottom' ? 'top' : 'bottom';
    top = finalPosition === 'top' ? rect.top - tooltipSize.height - gap : rect.bottom + gap;
    left = rect.left + (rect.width / 2) - (tooltipSize.width / 2);
  } else if ((position === 'right' && left + tooltipSize.width > viewportRight) ||
             (position === 'left' && left < viewportLeft)) {
    finalPosition = position === 'right' ? 'left' : 'right';
    top = rect.top + (rect.height / 2) - (tooltipSize.height / 2);
    left = finalPosition === 'left' ? rect.left - tooltipSize.width - gap : rect.right + gap;
  }

  top = _clamp(top, viewportTop, Math.max(viewportTop, viewportBottom - tooltipSize.height));
  left = _clamp(left, viewportLeft, Math.max(viewportLeft, viewportRight - tooltipSize.width));

  _tooltip.classList.add('tut-pos-' + finalPosition);
  _tooltip.dataset.position = finalPosition;
  _tooltip.style.top = Math.round(top) + 'px';
  _tooltip.style.left = Math.round(left) + 'px';
}

function _resetTooltipPosition() {
  _tooltip.style.top = '';
  _tooltip.style.left = '';
  _tooltip.style.right = '';
  _tooltip.style.bottom = '';
  _tooltip.style.transform = '';
}

function _getViewportSize() {
  const doc = document.documentElement || {};
  const windowRef = typeof window !== 'undefined' ? window : {};
  const visualViewport = windowRef.visualViewport || null;
  const visualWidth = visualViewport ? Number(visualViewport.width) || 0 : 0;
  const visualHeight = visualViewport ? Number(visualViewport.height) || 0 : 0;
  const width = Math.max(1, visualWidth || Number(doc.clientWidth) || Number(windowRef.innerWidth) || 320);
  const height = Math.max(1, visualHeight || Number(doc.clientHeight) || Number(windowRef.innerHeight) || 320);
  const left = visualViewport ? Math.max(0, Number(visualViewport.offsetLeft) || 0) : 0;
  const top = visualViewport ? Math.max(0, Number(visualViewport.offsetTop) || 0) : 0;
  return {
    width: width,
    height: height,
    left: left,
    top: top,
    right: left + width,
    bottom: top + height,
  };
}

function _getSafeAreaInsets() {
  if (typeof globalThis.getComputedStyle !== 'function' || !document.documentElement) {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  var rootStyle = globalThis.getComputedStyle(document.documentElement);
  function readInset(propertyName) {
    if (!rootStyle || typeof rootStyle.getPropertyValue !== 'function') return 0;
    return Math.max(0, Number.parseFloat(rootStyle.getPropertyValue(propertyName)) || 0);
  }

  return {
    top: readInset('--safe-top'),
    right: readInset('--safe-right'),
    bottom: readInset('--safe-bottom'),
    left: readInset('--safe-left'),
  };
}

function _getTooltipSize(availableWidth, availableHeight) {
  const rect = typeof _tooltip.getBoundingClientRect === 'function'
    ? _tooltip.getBoundingClientRect()
    : null;
  const measuredWidth = rect && rect.width ? rect.width : (_tooltip.offsetWidth || 380);
  const measuredHeight = rect && rect.height ? rect.height : (_tooltip.offsetHeight || 260);
  return {
    width: Math.min(measuredWidth, availableWidth),
    height: Math.min(measuredHeight, availableHeight),
  };
}

function _clamp(value, min, max) {
  if (max < min) return min;
  return Math.max(min, Math.min(max, value));
}

function _scheduleTooltipPosition() {
  if (!_tooltip || _tooltip.classList.contains('hidden') || _positionFrameId !== null) return;
  const callback = function () {
    _positionFrameId = null;
    if (!_tooltip || _tooltip.classList.contains('hidden')) return;
    _positionTooltip(_activePosition, _spotEl);
  };
  _positionFrameId = typeof globalThis.requestAnimationFrame === 'function'
    ? globalThis.requestAnimationFrame(callback)
    : globalThis.setTimeout(callback, 16);
}

function _cancelScheduledPosition() {
  if (_positionFrameId === null) return;
  if (typeof globalThis.cancelAnimationFrame === 'function') {
    globalThis.cancelAnimationFrame(_positionFrameId);
  } else {
    globalThis.clearTimeout(_positionFrameId);
  }
  _positionFrameId = null;
}

function _bindViewportListeners() {
  if (_viewportListenersBound || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  window.addEventListener('resize', _scheduleTooltipPosition, { passive: true });
  window.addEventListener('scroll', _scheduleTooltipPosition, { capture: true, passive: true });
  if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
    window.visualViewport.addEventListener('resize', _scheduleTooltipPosition, { passive: true });
    window.visualViewport.addEventListener('scroll', _scheduleTooltipPosition, { passive: true });
  }
  _viewportListenersBound = true;
}

function _unbindViewportListeners() {
  if (!_viewportListenersBound || typeof window === 'undefined' || typeof window.removeEventListener !== 'function') return;
  window.removeEventListener('resize', _scheduleTooltipPosition);
  window.removeEventListener('scroll', _scheduleTooltipPosition, true);
  if (window.visualViewport && typeof window.visualViewport.removeEventListener === 'function') {
    window.visualViewport.removeEventListener('resize', _scheduleTooltipPosition);
    window.visualViewport.removeEventListener('scroll', _scheduleTooltipPosition);
  }
  _viewportListenersBound = false;
}

function _escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _formatContent(text) {
  // 将 【xxx】 高亮
  return _escapeHtml(text)
    .replace(/【(.+?)】/g, '<span class="tut-keyword">$1</span>')
    .replace(/\n/g, '<br>');
}

// ---------------------------------------------------------------------------
// 高亮控制
// ---------------------------------------------------------------------------

function _clearHighlight() {
  if (_spotEl) {
    _spotEl.classList.remove('tut-highlight');
    _spotEl = null;
  }
  // 清除所有残留高亮
  document.querySelectorAll('.tut-highlight').forEach(function (el) {
    el.classList.remove('tut-highlight');
  });
}

function _rememberTutorialTrigger() {
  if (_returnFocusTarget || !globalThis.document) return;
  var activeElement = document.activeElement;
  if (!activeElement || activeElement === _tooltip || typeof activeElement.focus !== 'function') return;
  if (_tooltip && typeof _tooltip.contains === 'function' && _tooltip.contains(activeElement)) return;
  _returnFocusTarget = activeElement;
}

function _restoreTutorialTrigger() {
  var target = _returnFocusTarget;
  _returnFocusTarget = null;
  if (!target || target.disabled || target.hidden || typeof target.focus !== 'function') return;
  if (typeof target.getAttribute === 'function' && target.getAttribute('aria-hidden') === 'true') return;

  try {
    target.focus({ preventScroll: true });
  } catch (err) {
    target.focus();
  }
}

// ---------------------------------------------------------------------------
// 显示 / 隐藏
// ---------------------------------------------------------------------------

export function show() {
  if (_overlay) {
    _overlay.classList.remove('hidden');
    _overlay.setAttribute('aria-hidden', 'false');
  }
  if (_tooltip) {
    _tooltip.classList.remove('hidden');
    _tooltip.setAttribute('aria-hidden', 'false');
    _tooltip.setAttribute('tabindex', '-1');
    if (typeof _tooltip.focus === 'function') {
      try {
        _tooltip.focus({ preventScroll: true });
      } catch (err) {
        _tooltip.focus();
      }
    }
  }
}

export function hide() {
  _cancelScheduledPosition();
  var activeElement = globalThis.document ? document.activeElement : null;
  var shouldRestoreFocus = !!(_tooltip && (
    activeElement === _tooltip ||
    (typeof _tooltip.contains === 'function' && _tooltip.contains(activeElement))
  ));
  if (_overlay) {
    _overlay.classList.add('hidden');
    _overlay.setAttribute('aria-hidden', 'true');
  }
  if (_tooltip) {
    _tooltip.classList.add('hidden');
    _tooltip.setAttribute('aria-hidden', 'true');
    _tooltip.removeAttribute('aria-label');
  }
  _clearHighlight();
  if (shouldRestoreFocus) {
    _restoreTutorialTrigger();
  } else {
    _returnFocusTarget = null;
  }
}

export function destroy() {
  hide();
  _unbindViewportListeners();
  if (_stepHandler) EventBus.off('tutorial:step', _stepHandler);
  if (_completeHandler) EventBus.off('tutorial:complete', _completeHandler);
  _stepHandler = null;
  _completeHandler = null;
  _onAdvance = null;
  _onSkip    = null;
}
