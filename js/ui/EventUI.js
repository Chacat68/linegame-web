// js/ui/EventUI.js — 随机事件弹窗界面 + 非阻塞通知
// 依赖：无
// 导出：showEvent, hideEvent, showEventNotification, hasPendingEvent,
//       forcePendingEvent, hidePendingNotification

let _pendingEvent = null;
let _pendingOnChoice = null;

/**
 * 显示随机事件模态框
 * @param {object}   event      事件定义对象
 * @param {Function} onChoice   (choiceIndex: number) => void
 */
export function showEvent(event, onChoice) {
  // 如果有通知条，先隐藏
  _hideNotification();
  _pendingEvent = null;
  _pendingOnChoice = null;

  document.getElementById('event-icon').textContent  = event.icon;
  document.getElementById('event-title').textContent = event.title;
  document.getElementById('event-desc').textContent  = event.description;
  _renderMeta(event);

  const choicesDiv = document.getElementById('event-choices');
  choicesDiv.innerHTML = '';

  event.choices.forEach(function (choice, index) {
    const btn = document.createElement('button');
    btn.className = 'event-choice-btn';
    btn.innerHTML =
      '<span class="choice-text">' + choice.text + '</span>' +
      (choice.tooltip ? '<span class="choice-tooltip">' + choice.tooltip + '</span>' : '');
    btn.addEventListener('click', function () {
      document.getElementById('event-modal').classList.add('hidden');
      onChoice(index);
    });
    choicesDiv.appendChild(btn);
  });

  document.getElementById('event-modal').classList.remove('hidden');
}

/**
 * 隐藏事件模态框
 */
export function hideEvent() {
  document.getElementById('event-modal').classList.add('hidden');
}

/**
 * 显示非阻塞事件通知条（玩家可延后处理）
 * @param {object}   event      事件定义对象
 * @param {Function} onChoice   (choiceIndex: number) => void
 */
export function showEventNotification(event, onChoice) {
  _pendingEvent = event;
  _pendingOnChoice = onChoice;

  var notifEl = document.getElementById('event-notification');
  document.getElementById('event-notif-icon').textContent = event.icon;
  document.getElementById('event-notif-text').textContent = event.title + ' — 点击查看详情';

  // 绑定点击整个通知条或按钮来弹出完整事件
  var openBtn = document.getElementById('event-notif-open');

  function _openPending() {
    if (_pendingEvent) {
      showEvent(_pendingEvent, _pendingOnChoice);
    }
  }

  // 移除旧监听（用克隆节点的方式）
  var newBtn = openBtn.cloneNode(true);
  openBtn.parentNode.replaceChild(newBtn, openBtn);
  newBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    _openPending();
  });

  // 点击通知条本身也能打开
  notifEl.onclick = _openPending;

  notifEl.classList.remove('hidden');
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
  _hideNotification();
  _pendingEvent = null;
  _pendingOnChoice = null;
}

function _hideNotification() {
  var notifEl = document.getElementById('event-notification');
  if (notifEl) {
    notifEl.classList.add('hidden');
    notifEl.onclick = null;
  }
}

function _renderMeta(event) {
  const metaDiv = document.getElementById('event-meta');
  if (!metaDiv) return;

  metaDiv.innerHTML = '';

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
    metaDiv.appendChild(badge);
  });
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
