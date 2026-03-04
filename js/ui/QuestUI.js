// js/ui/QuestUI.js — 任务面板 UI（支持进度阶段与解锁条件）
// 依赖：systems/quest/QuestSystem.js, data/quests.js
// 导出：render

import { QUEST_TYPES } from '../data/quests.js';
import { GOODS } from '../data/goods.js';
import { findSystem } from '../data/systems.js';
import * as Quest      from '../systems/quest/QuestSystem.js';

const _goodNameById = GOODS.reduce(function (acc, good) {
  acc[good.id] = good.name;
  return acc;
}, Object.create(null));

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

  // ---- 当前章节 ----
  const currentPhaseProgress = Quest.getCurrentQuestPhaseProgress(state);
  const currentPhase = currentPhaseProgress.phase;
  html += '<div class="quest-phase-overview">' +
    '<div class="quest-phase-chip active" title="' + _escapeHtml(currentPhase ? currentPhase.description : '') + '">' +
    '<span class="phase-icon">' + (currentPhase ? currentPhase.icon : '📖') + '</span>' +
    '<span class="phase-name">当前章节：' + (currentPhase ? currentPhase.name : '未知章节') + '</span>' +
    '<span class="phase-progress">' + currentPhaseProgress.completed + '/' + currentPhaseProgress.total + '</span>' +
    '</div>' +
    '</div>';

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
        '<div class="quest-name">' + _escapeHtml(quest.name) + '</div>' +
        '<div class="quest-desc">' + _escapeHtml(quest.description) + '</div>';

      // 目标进度
      quest.objectives.forEach(function (obj) {
        const pct = Math.min(100, Math.round((obj.current / (obj.amount || 1)) * 100));
        html += '<div class="quest-objective">' +
          '<div class="quest-obj-text">' + _escapeHtml(_objectiveText(obj)) + '</div>' +
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
    html += '<div class="quest-empty">当前章节暂无可接任务。请先推进进行中任务。</div>';
  } else {
    available.forEach(function (quest) {
      const typeInfo = QUEST_TYPES[quest.type] || {};
      html += '<div class="quest-card available-quest">' +
        '<div class="quest-card-header">' +
          '<span class="quest-type-badge" style="background:' + (typeInfo.color || '#666') + '">' +
            (typeInfo.icon || '📋') + ' ' + (typeInfo.name || quest.type) + '</span>' +
          (quest.timeLimit > 0 ? '<span class="quest-time">⏰ ' + quest.timeLimit + ' 天限制</span>' : '') +
        '</div>' +
        '<div class="quest-name">' + _escapeHtml(quest.name) + '</div>' +
        '<div class="quest-desc">' + _escapeHtml(quest.description) + '</div>' +
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

  // ---- 未解锁任务 ----
  const locked = Quest.getLockedQuests(state);
  if (locked.length > 0) {
    html += '<div class="quest-section-title" style="margin-top:12px">🔒 未解锁 (' + locked.length + ')</div>';
    locked.forEach(function (quest) {
      const typeInfo = QUEST_TYPES[quest.type] || {};
      html += '<div class="quest-card locked-quest">' +
        '<div class="quest-card-header">' +
          '<span class="quest-type-badge" style="background:' + (typeInfo.color || '#666') + '; opacity:0.6">' +
            (typeInfo.icon || '📋') + ' ' + (typeInfo.name || quest.type) + '</span>' +
        '</div>' +
        '<div class="quest-name" style="opacity:0.7">🔒 ' + _escapeHtml(quest.name) + '</div>' +
        '<div class="quest-desc" style="opacity:0.5">' + _escapeHtml(quest.description) + '</div>' +
        '<div class="quest-lock-reasons">';
      quest.lockReasons.forEach(function (reason) {
        html += '<div class="quest-lock-reason">⚠️ ' + _escapeHtml(reason) + '</div>';
      });
      html += '</div>' +
        '<div class="quest-rewards" style="opacity:0.5">' +
          '<span>🎁</span>' +
          '<span>💰 ' + quest.rewards.credits + '</span>' +
          '<span>⭐ ' + quest.rewards.exp + '</span>' +
          '<span>🏅 ' + quest.rewards.reputation + '</span>' +
        '</div>' +
        '</div>';
    });
  } else {
    if (currentPhaseProgress.isFinalPhase && currentPhaseProgress.completed === currentPhaseProgress.total && currentPhaseProgress.total > 0) {
      html += '<div class="quest-empty" style="margin-top:12px">🏁 所有章节任务已完成，全部胜利条件已开放。</div>';
    } else if (currentPhaseProgress.completed === currentPhaseProgress.total && currentPhaseProgress.total > 0) {
      html += '<div class="quest-empty" style="margin-top:12px">✅ 当前章节任务已全部完成，下一次任务结算后将进入新章节。</div>';
    }
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
  const targetSystemName = _systemName(obj.targetSystem);
  const goodName = _goodName(obj.goodId);

  switch (obj.type) {
    case 'deliver':
      return '运送 ' + goodName + ' 到 ' + targetSystemName;
    case 'buy_at':
      return '在 ' + targetSystemName + ' 购买 ' + goodName;
    case 'sell_at':
      return '在 ' + targetSystemName + ' 卖出 ' + goodName;
    case 'earn_profit':
      return '累计赚取利润';
    case 'trade_count':
      return '完成交易次数';
    case 'trade_good':
      return '交易 ' + goodName;
    case 'visit_systems':
      return '造访不同星系';
    case 'visit_system':
      return '前往 ' + targetSystemName;
    case 'faction_trade':
      return '在派系区域交易';
    case 'sell_in_faction':
      return '在派系区域卖出 ' + goodName;
    case 'faction_relation':
      return '提升与派系关系';
    case 'survive_days':
      return '星际航行天数';
    case 'galaxy_jump':
      return '跨星系跃迁';
    default:
      return '完成目标';
  }
}

function _systemName(systemId) {
  if (!systemId) return '未知地点';
  const system = findSystem(systemId);
  return system ? system.name : systemId;
}

function _goodName(goodId) {
  if (!goodId) return '货物';
  return _goodNameById[goodId] || goodId;
}

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
