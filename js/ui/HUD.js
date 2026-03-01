// js/ui/HUD.js — 顶部状态栏与消息日志
// 依赖：core/EventBus.js, data/constants.js
// 导出：init, updateStats, addMessage

import * as EventBus            from '../core/EventBus.js';
import { VICTORY_NET_WORTH }    from '../data/constants.js';
import { SYSTEMS }              from '../data/systems.js';

// ---------------------------------------------------------------------------
// 初始化：订阅 EventBus 日志事件
// ---------------------------------------------------------------------------

export function init() {
  EventBus.on('log:message', function (data) {
    addMessage(data.text, data.type);
  });
}

// ---------------------------------------------------------------------------
// 顶部状态栏
// ---------------------------------------------------------------------------

export function updateStats(state, netWorth) {
  document.getElementById('credits').textContent      = Math.floor(state.credits).toLocaleString();
  document.getElementById('galactic-day').textContent = '第 ' + state.day + ' 天';
  document.getElementById('net-worth').textContent    = Math.floor(netWorth).toLocaleString();

  // 帝国进度条
  const pct = Math.min(100, (netWorth / VICTORY_NET_WORTH) * 100);
  document.getElementById('empire-progress').style.width = pct + '%';
  document.getElementById('empire-pct').textContent      = Math.floor(pct) + '%';

  // 当前位置
  const sys = SYSTEMS.find(function (s) { return s.id === state.currentSystem; });
  document.getElementById('current-location').textContent = '📍 ' + sys.name;
  document.getElementById('location-desc').textContent    = sys.description;
}

// ---------------------------------------------------------------------------
// 消息日志（最多保留 10 条）
// ---------------------------------------------------------------------------

export function addMessage(text, type) {
  const log = document.getElementById('message-log');
  const div = document.createElement('div');
  div.className   = 'msg msg-' + (type || 'info');
  div.textContent = text;
  log.insertBefore(div, log.firstChild);
  while (log.children.length > 10) log.removeChild(log.lastChild);
}
