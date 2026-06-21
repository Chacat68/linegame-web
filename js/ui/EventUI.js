// js/ui/EventUI.js — 随机事件弹窗界面 + 非阻塞通知
// 依赖：无
// 导出：showEvent, hideEvent, showEventNotification, hasPendingEvent,
//       forcePendingEvent, hidePendingNotification

import { bindBlockingSurfaceDismiss, hasBlockingSurfaceOpen, hideBlockingSurface, hideEventNotificationBar, observeBlockingSurfaceState, showBlockingSurface, showEventNotificationBar } from './SurfaceManager.js?v=20260621-settingsfallback1';

let _pendingEvent = null;
let _pendingOnChoice = null;
let _surfaceObserverBound = false;

function _ensureSurfaceObserver() {
  if (_surfaceObserverBound) return;
  _surfaceObserverBound = true;

  observeBlockingSurfaceState(function (snapshot) {
    if (!snapshot || snapshot.hasBlockingSurfaceOpen || !_pendingEvent) return;
    _renderPendingNotification();
  });
}

/**
 * 显示随机事件模态框
 * @param {object}   event      事件定义对象
 * @param {Function} onChoice   (choiceIndex: number) => void
 */
export function showEvent(event, onChoice) {
  _ensureSurfaceObserver();
  bindBlockingSurfaceDismiss('event-modal');
  // 如果有通知条，先隐藏
  hideEventNotificationBar();
  _pendingEvent = null;
  _pendingOnChoice = null;

  const modal = document.getElementById('event-modal');
  if (modal) {
    modal.dataset.eventRisk = event.risk || 'risky';
    modal.dataset.eventStage = event.stage || 'mid';
    modal.dataset.eventState = 'ready';
  }

  document.getElementById('event-icon').textContent  = event.icon || '📡';
  document.getElementById('event-title').textContent = event.title || '事件';
  document.getElementById('event-desc').textContent  = event.description || '';
  _renderMeta(event);

  const choicesDiv = document.getElementById('event-choices');
  choicesDiv.innerHTML = '';
  choicesDiv.setAttribute('role', 'list');
  choicesDiv.setAttribute('aria-label', '事件处置选项');
  choicesDiv.setAttribute('aria-busy', 'false');

  const choices = Array.isArray(event.choices) ? event.choices : [];
  const renderedChoices = choices.length > 0
    ? choices
    : [{ text: '确认', tooltip: '关闭事件简报', _fallbackClose: true }];

  _renderEventSummary(event, renderedChoices.length);
  _renderEventImpact(event, renderedChoices);

  const choiceButtons = [];
  let choiceCommitted = false;

  renderedChoices.forEach(function (choice, index) {
    const item = document.createElement('article');
    const btn = document.createElement('button');
    const choiceText = document.createElement('span');
    const choiceLabel = _getChoiceText(choice, index);
    const labelId = 'event-choice-' + index + '-label';
    const hintId = 'event-choice-' + index + '-hint';

    item.className = 'event-choice-item';
    item.setAttribute('role', 'listitem');
    btn.type = 'button';
    btn.className = 'event-choice-btn';
    btn.dataset.eventChoiceIndex = String(index);
    btn.setAttribute('aria-label', _getChoiceAriaLabel(choice, index));
    btn.setAttribute('aria-labelledby', labelId);
    btn.setAttribute('data-event-choice-card', 'true');
    _bindChoiceNavigation(btn, index, choiceButtons);

    choiceText.className = 'choice-text';
    choiceText.id = labelId;
    choiceText.textContent = choiceLabel;
    btn.appendChild(choiceText);

    if (choice.tooltip) {
      const tooltip = document.createElement('span');
      tooltip.className = 'choice-tooltip';
      tooltip.id = hintId;
      tooltip.textContent = choice.tooltip;
      btn.appendChild(tooltip);
      btn.setAttribute('aria-describedby', hintId);
    }

    btn.addEventListener('click', function () {
      if (choiceCommitted) return;
      choiceCommitted = true;
      choicesDiv.setAttribute('aria-busy', 'true');
      if (modal) modal.dataset.eventState = 'resolving';
      choiceButtons.forEach(function (choiceButton) {
        choiceButton.disabled = true;
        choiceButton.setAttribute('aria-disabled', 'true');
      });
      hideBlockingSurface('event-modal');
      if (!choice._fallbackClose && typeof onChoice === 'function') onChoice(index);
    });
    choiceButtons.push(btn);
    item.appendChild(btn);
    choicesDiv.appendChild(item);
  });

  showBlockingSurface('event-modal');
  _focusElement(choiceButtons[0]);
}

/**
 * 隐藏事件模态框
 */
export function hideEvent() {
  hideBlockingSurface('event-modal');
}

/**
 * 显示非阻塞事件通知条（玩家可延后处理）
 * @param {object}   event      事件定义对象
 * @param {Function} onChoice   (choiceIndex: number) => void
 */
export function showEventNotification(event, onChoice) {
  _ensureSurfaceObserver();
  _pendingEvent = event;
  _pendingOnChoice = onChoice;

  if (hasBlockingSurfaceOpen()) {
    hideEventNotificationBar();
    return;
  }

  _renderPendingNotification();
}

function _renderPendingNotification() {
  if (!_pendingEvent || hasBlockingSurfaceOpen()) {
    hideEventNotificationBar();
    return;
  }

  var notifEl = document.getElementById('event-notification');
  if (!notifEl) return;
  if (notifEl.dataset) notifEl.dataset.eventRisk = _pendingEvent.risk || 'risky';
  var title = _pendingEvent.title || '待处理事件';
  var iconEl = document.getElementById('event-notif-icon');
  var kickerEl = document.getElementById('event-notif-kicker');
  var textEl = document.getElementById('event-notif-text');
  var metaEl = document.getElementById('event-notif-meta');
  var riskLabel = _getRiskLabel(_pendingEvent.risk);
  var stageLabel = _getStageLabel(_pendingEvent.stage);
  var followUpLabel = _pendingEvent.stage === 'chain' || _pendingEvent.chainFollowUp
    ? '可能延续'
    : '单次处置';
  if (iconEl) iconEl.textContent = _pendingEvent.icon || '📡';
  if (kickerEl) kickerEl.textContent = riskLabel + ' · ' + stageLabel;
  if (textEl) textEl.textContent = title;
  if (metaEl) metaEl.textContent = followUpLabel + ' · 打开后选择处置方案';

  function _openPending() {
    if (_pendingEvent) {
      showEvent(_pendingEvent, _pendingOnChoice);
    }
  }

  // 通知条本身是唯一按钮，避免可点击容器内再嵌套按钮。
  notifEl.onclick = _openPending;
  notifEl.onkeydown = null;
  notifEl.tabIndex = 0;
  if (typeof notifEl.setAttribute === 'function') {
    notifEl.setAttribute('tabindex', '0');
    notifEl.setAttribute('aria-hidden', 'false');
    notifEl.setAttribute('aria-label', '待处理事件：' + title + '，' + riskLabel + '，' + stageLabel + '。查看事件详情');
  }

  showEventNotificationBar(notifEl);
}

/**
 * 是否有待处理的事件
 * @returns {boolean}
 */
export function hasPendingEvent() {
  return _pendingEvent != null;
}

/**
 * 强制弹出待处理事件（在旅行前调用）
 * @returns {boolean} 是否有事件被强制弹出
 */
export function forcePendingEvent() {
  if (!_pendingEvent) return false;
  showEvent(_pendingEvent, _pendingOnChoice);
  return true;
}

/**
 * 隐藏通知条并清除待处理事件
 */
export function hidePendingNotification() {
  hideEventNotificationBar();
  _pendingEvent = null;
  _pendingOnChoice = null;
}

function _hideNotification() {
  hideEventNotificationBar();
}

function _renderEventSummary(event, choiceCount) {
  const summaryEl = document.getElementById('event-summary');
  if (!summaryEl) return;

  summaryEl.innerHTML = '';
  if (Array.isArray(summaryEl.children)) summaryEl.children.length = 0;
  summaryEl.setAttribute('role', 'list');
  summaryEl.setAttribute('aria-label', '事件状态摘要');

  [
    { label: '风险', value: _getRiskLabel(event && event.risk) },
    { label: '阶段', value: _getStageLabel(event && event.stage) },
    { label: '处置', value: String(Math.max(1, choiceCount || 0)) + ' 项' },
  ].forEach(function (item) {
    const card = document.createElement('span');
    const label = document.createElement('span');
    const value = document.createElement('strong');

    card.className = 'event-summary-item';
    card.setAttribute('role', 'listitem');
    label.textContent = item.label;
    value.textContent = item.value;

    card.appendChild(label);
    card.appendChild(value);
    summaryEl.appendChild(card);
  });
}

function _renderEventImpact(event, choices) {
  const impactEl = document.getElementById('event-impact');
  if (!impactEl) return;

  const safeChoices = Array.isArray(choices) ? choices : [];
  const pressureCount = safeChoices.filter(_isPressureChoice).length;
  const chainLabel = event && (event.stage === 'chain' || event.chainFollowUp)
    ? '可能延续'
    : '单次处置';
  const pressureLabel = pressureCount > 0
    ? String(pressureCount) + ' 项承压'
    : '低压力';
  const firstHint = safeChoices.find(function (choice) { return choice && choice.tooltip; });

  impactEl.innerHTML = '';
  if (Array.isArray(impactEl.children)) impactEl.children.length = 0;
  impactEl.setAttribute('role', 'list');
  impactEl.setAttribute('aria-label', '事件影响预览');

  [
    { label: '风险信号', value: _getRiskLabel(event && event.risk), note: _getStageLabel(event && event.stage) },
    { label: '后续', value: chainLabel, note: event && event.chainDelay ? String(event.chainDelay) + ' 天窗口' : '即时结算' },
    { label: '资源压力', value: pressureLabel, note: firstHint ? firstHint.tooltip : '无明确资源消耗' },
    { label: '处置数量', value: String(Math.max(1, safeChoices.length)) + ' 项', note: '选择后关闭事件简报' },
  ].forEach(function (item) {
    const card = document.createElement('article');
    const label = document.createElement('span');
    const value = document.createElement('strong');
    const note = document.createElement('small');

    card.className = 'event-impact-item';
    card.setAttribute('role', 'listitem');
    label.textContent = item.label;
    value.textContent = item.value;
    note.textContent = item.note;

    card.appendChild(label);
    card.appendChild(value);
    card.appendChild(note);
    impactEl.appendChild(card);
  });
}

function _renderMeta(event) {
  const metaDiv = document.getElementById('event-meta');
  if (!metaDiv) return;

  metaDiv.innerHTML = '';
  if (event && event.metaHidden) {
    metaDiv.hidden = true;
    metaDiv.setAttribute('aria-hidden', 'true');
    return;
  }
  metaDiv.hidden = false;
  metaDiv.setAttribute('aria-hidden', 'false');
  metaDiv.setAttribute('role', 'list');
  metaDiv.setAttribute('aria-label', '事件标签');

  const tags = [
    {
      text: _getRiskLabel(event.risk),
      className: 'event-tag event-tag-risk-' + (event.risk || 'risky'),
    },
    {
      text: _getStageLabel(event.stage),
      className: 'event-tag',
    },
  ];

  if (event.stage === 'chain' || event.chainFollowUp) {
    tags.push({
      text: event.stage === 'chain' ? '事件链后续' : '可能引发后续事件',
      className: 'event-tag event-tag-chain',
    });
  }

  tags.forEach(function (tag) {
    const badge = document.createElement('span');
    badge.className = tag.className;
    badge.textContent = tag.text;
    badge.setAttribute('role', 'listitem');
    metaDiv.appendChild(badge);
  });
}

function _isPressureChoice(choice) {
  if (!choice) return false;
  const text = String((choice.text || '') + ' ' + (choice.tooltip || ''));
  return /花费|消耗|失去|损失|受损|风险|概率|失败|扣|减少|下降|高风险|触发|后续|调查/.test(text);
}

function _getChoiceText(choice, index) {
  if (choice && choice.text) return choice.text;
  return '选项 ' + (index + 1);
}

function _getChoiceAriaLabel(choice, index) {
  var label = _getChoiceText(choice, index);
  if (choice && choice.tooltip) return label + '，' + choice.tooltip;
  return label;
}

function _bindChoiceNavigation(button, index, buttons) {
  button.addEventListener('keydown', function (event) {
    var key = event && event.key;
    var targetIndex = index;

    if (key === 'ArrowRight' || key === 'ArrowDown') targetIndex = Math.min(buttons.length - 1, index + 1);
    else if (key === 'ArrowLeft' || key === 'ArrowUp') targetIndex = Math.max(0, index - 1);
    else if (key === 'Home') targetIndex = 0;
    else if (key === 'End') targetIndex = buttons.length - 1;
    else return;

    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    _focusElement(buttons[targetIndex]);
  });
}

function _focusElement(element) {
  if (!element || typeof element.focus !== 'function') return;
  try {
    element.focus({ preventScroll: true });
  } catch (err) {
    element.focus();
  }
}

function _getRiskLabel(risk) {
  if (risk === 'safe') return '低风险';
  if (risk === 'dangerous') return '高风险';
  return '中风险';
}

function _getStageLabel(stage) {
  if (stage === 'early') return '前期事件';
  if (stage === 'late') return '后期事件';
  if (stage === 'chain') return '连续事件';
  return '中期事件';
}
