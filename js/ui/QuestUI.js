// js/ui/QuestUI.js — 任务面板 UI
// 依赖：systems/quest/QuestSystem.js, data/quests.js
// 导出：render

import { QUEST_TYPES } from '../data/quests.js';
import * as Quest      from '../systems/quest/QuestSystem.js';

/**
 * 渲染任务面板
 * @param {object}   state
 * @param {Function} onAccept   (questId) => void
 * @param {Function} onAbandon  (questId) => void
 */
export function render(state, onAccept, onAbandon) {
  const container = document.getElementById('quest-list');
  if (!container) return;

  let html = '';

  // ---- 当前任务 ----
  const active = Quest.getActiveQuests(state);
  html += '<div class="quest-section-title">📋 进行中 (' + active.length + '/5)</div>';

  if (active.length === 0) {
    html += '<div class="quest-empty">暂无进行中的任务。前往下方接取任务！</div>';
  } else {
    active.forEach(function (quest) {
      const typeInfo = QUEST_TYPES[quest.type] || {};
      const timeleft = quest.timeLimit > 0
        ? '⏰ 剩余 ' + Math.max(0, quest.timeLimit - (state.day - quest.startDay)) + ' 天'
        : '';

      html += '<div class="quest-card active-quest">' +
        '<div class="quest-card-header">' +
          '<span class="quest-type-badge" style="background:' + (typeInfo.color || '#666') + '">' +
            (typeInfo.icon || '📋') + ' ' + (typeInfo.name || quest.type) + '</span>' +
          '<span class="quest-time">' + timeleft + '</span>' +
        '</div>' +
        '<div class="quest-name">' + quest.name + '</div>' +
        '<div class="quest-desc">' + quest.description + '</div>';

      // 目标进度
      quest.objectives.forEach(function (obj) {
        const pct = Math.min(100, Math.round((obj.current / (obj.amount || 1)) * 100));
        html += '<div class="quest-objective">' +
          '<div class="quest-obj-text">' + _objectiveText(obj) + '</div>' +
          '<div class="quest-progress-track">' +
            '<div class="quest-progress-fill" style="width:' + pct + '%"></div>' +
          '</div>' +
          '<span class="quest-obj-count">' + obj.current + '/' + (obj.amount || 1) + '</span>' +
          '</div>';
      });

      // 奖励
      html += '<div class="quest-rewards">' +
        '<span>🎁 奖励:</span>' +
        '<span>💰 ' + quest.rewards.credits + '</span>' +
        '<span>⭐ ' + quest.rewards.exp + ' 经验</span>' +
        '<span>🏅 ' + quest.rewards.reputation + ' 声望</span>' +
        '</div>';

      html += '<button class="btn-action quest-abandon-btn" data-id="' + quest.id + '">放弃</button>';
      html += '</div>';
    });
  }

  // ---- 可接取任务 ----
  const available = Quest.getAvailableQuests(state);
  html += '<div class="quest-section-title" style="margin-top:12px">📜 可接取 (' + available.length + ')</div>';

  if (available.length === 0) {
    html += '<div class="quest-empty">暂时没有新任务。继续贸易和探索解锁更多！</div>';
  } else {
    available.forEach(function (quest) {
      const typeInfo = QUEST_TYPES[quest.type] || {};
      html += '<div class="quest-card available-quest">' +
        '<div class="quest-card-header">' +
          '<span class="quest-type-badge" style="background:' + (typeInfo.color || '#666') + '">' +
            (typeInfo.icon || '📋') + ' ' + (typeInfo.name || quest.type) + '</span>' +
          (quest.timeLimit > 0 ? '<span class="quest-time">⏰ ' + quest.timeLimit + ' 天限制</span>' : '') +
        '</div>' +
        '<div class="quest-name">' + quest.name + '</div>' +
        '<div class="quest-desc">' + quest.description + '</div>' +
        '<div class="quest-rewards">' +
          '<span>🎁</span>' +
          '<span>💰 ' + quest.rewards.credits + '</span>' +
          '<span>⭐ ' + quest.rewards.exp + '</span>' +
          '<span>🏅 ' + quest.rewards.reputation + '</span>' +
        '</div>' +
        '<button class="btn-action quest-accept-btn" data-id="' + quest.id + '">接取</button>' +
        '</div>';
    });
  }

  container.innerHTML = html;

  // 绑定事件
  container.querySelectorAll('.quest-accept-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      onAccept(btn.dataset.id);
    });
  });
  container.querySelectorAll('.quest-abandon-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (confirm('确定放弃此任务？')) onAbandon(btn.dataset.id);
    });
  });
}

// ---------------------------------------------------------------------------
// 生成目标描述文本
// ---------------------------------------------------------------------------
function _objectiveText(obj) {
  switch (obj.type) {
    case 'deliver':
      return '运送 ' + obj.goodId + ' 到 ' + obj.targetSystem;
    case 'buy_at':
      return '在 ' + obj.targetSystem + ' 购买 ' + obj.goodId;
    case 'earn_profit':
      return '累计赚取利润';
    case 'trade_count':
      return '完成交易次数';
    case 'trade_good':
      return '交易 ' + obj.goodId;
    case 'visit_systems':
      return '造访不同星系';
    case 'visit_system':
      return '前往 ' + obj.targetSystem;
    case 'faction_trade':
      return '在派系区域交易';
    case 'sell_in_faction':
      return '在派系区域卖出 ' + obj.goodId;
    default:
      return '完成目标';
  }
}
