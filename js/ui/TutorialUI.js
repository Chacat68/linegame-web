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

  // 阶段名称
  const phaseNames = { 1: '星际初航', 2: '第一桶金', 3: '自由探索' };
  const phaseName  = phaseNames[step.phase] || '';

  // 进度
  const progressPct = Math.round(((index + 1) / total) * 100);

  // 构建提示框 HTML
  const isManual     = step.trigger === 'manual';
  const showNext     = isManual;
  const actionHint   = !isManual
    ? '<div class="tut-action-hint">👆 请执行上述操作以继续</div>'
    : '';

  _tooltip.innerHTML =
    '<div class="tut-header">' +
      '<span class="tut-phase">阶段' + step.phase + ': ' + phaseName + '</span>' +
      '<span class="tut-progress">' + (index + 1) + '/' + total + '</span>' +
    '</div>' +
    '<div class="tut-progress-bar"><div class="tut-progress-fill" style="width:' + progressPct + '%"></div></div>' +
    '<div class="tut-npc">' +
      '<span class="tut-npc-icon">' + step.npcIcon + '</span>' +
      '<span class="tut-npc-name">' + step.npcName + '</span>' +
    '</div>' +
    '<h3 class="tut-title">' + step.title + '</h3>' +
    '<div class="tut-content">' + _formatContent(step.content) + '</div>' +
    actionHint +
    '<div class="tut-actions">' +
      (showNext ? '<button id="tut-next-btn" class="tut-btn tut-btn-primary">下一步 →</button>' : '') +
      '<button id="tut-skip-btn" class="tut-btn tut-btn-secondary">跳过教程</button>' +
    '</div>';

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
  _positionTooltip(step.position, _spotEl);

  // 显示
  show();
}

// ---------------------------------------------------------------------------
// 提示框定位
// ---------------------------------------------------------------------------

function _positionTooltip(position, targetEl) {
  _tooltip.className = 'tutorial-tooltip';

  if (position === 'center' || !targetEl) {
    _tooltip.classList.add('tut-pos-center');
    _tooltip.style.top    = '';
    _tooltip.style.left   = '';
    _tooltip.style.right  = '';
    _tooltip.style.bottom = '';
    return;
  }

  // 根据目标元素位置，放置提示框
  const rect = targetEl.getBoundingClientRect();

  _tooltip.classList.add('tut-pos-' + position);

  switch (position) {
    case 'bottom':
      _tooltip.style.top  = (rect.bottom + 12) + 'px';
      _tooltip.style.left = Math.max(12, rect.left) + 'px';
      _tooltip.style.right  = '';
      _tooltip.style.bottom = '';
      break;
    case 'top':
      _tooltip.style.bottom = (window.innerHeight - rect.top + 12) + 'px';
      _tooltip.style.left   = Math.max(12, rect.left) + 'px';
      _tooltip.style.top    = '';
      _tooltip.style.right  = '';
      break;
    case 'left':
      _tooltip.style.top   = Math.max(12, rect.top) + 'px';
      _tooltip.style.right = (window.innerWidth - rect.left + 12) + 'px';
      _tooltip.style.left  = '';
      _tooltip.style.bottom = '';
      break;
    case 'right':
      _tooltip.style.top  = Math.max(12, rect.top) + 'px';
      _tooltip.style.left = (rect.right + 12) + 'px';
      _tooltip.style.right  = '';
      _tooltip.style.bottom = '';
      break;
  }
}

// ---------------------------------------------------------------------------
// 文本格式化
// ---------------------------------------------------------------------------

function _formatContent(text) {
  // 将 【xxx】 高亮
  return text
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

// ---------------------------------------------------------------------------
// 显示 / 隐藏
// ---------------------------------------------------------------------------

export function show() {
  if (_overlay) _overlay.classList.remove('hidden');
  if (_tooltip) _tooltip.classList.remove('hidden');
}

export function hide() {
  if (_overlay) _overlay.classList.add('hidden');
  if (_tooltip) _tooltip.classList.add('hidden');
  _clearHighlight();
}

export function destroy() {
  hide();
  _onAdvance = null;
  _onSkip    = null;
}
