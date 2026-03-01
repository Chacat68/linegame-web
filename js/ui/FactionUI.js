// js/ui/FactionUI.js — 派系外交界面渲染
// 依赖：systems/faction/FactionSystem.js
// 导出：render

import * as Faction from '../systems/faction/FactionSystem.js';
import { FACTIONS, FACTION_LEVELS } from '../data/factions.js';

/**
 * 渲染派系关系标签页
 * @param {object} state
 */
export function render(state) {
  const container = document.getElementById('faction-list');
  const relations = Faction.getAllRelations(state);

  let html = '';
  relations.forEach(function (r) {
    const f = r.faction;
    const rel = r.relation;
    const level = r.level;

    // 关系进度条颜色
    const barColor = rel >= 30 ? 'var(--accent-green)' :
                     rel >= -10 ? 'var(--accent-blue)' :
                     rel >= -50 ? '#FF9800' : 'var(--accent-red)';

    // 关系百分比 (映射 -100~100 到 0~100%)
    const barPct = ((rel + 100) / 200 * 100).toFixed(0);

    // 控制星系列表
    const systemNames = f.controlledSystems.join('、');

    html +=
      '<div class="faction-card" style="border-left: 3px solid ' + f.color + '">' +
        '<div class="faction-header">' +
          '<span class="faction-icon" style="color:' + f.color + '">' + f.icon + '</span>' +
          '<div class="faction-info">' +
            '<span class="faction-name">' + f.name + '</span>' +
            '<span class="faction-ideology">' + f.ideology + '</span>' +
          '</div>' +
          '<span class="faction-level" style="color:' + f.color + '">' + level.emoji + ' ' + level.name + '</span>' +
        '</div>' +
        '<p class="faction-desc">' + f.description + '</p>' +
        '<div class="faction-relation-bar">' +
          '<span class="faction-rel-label">关系</span>' +
          '<div class="mini-bar-track" style="flex:1">' +
            '<div class="mini-bar-fill" style="width:' + barPct + '%;background:' + barColor + '"></div>' +
          '</div>' +
          '<span class="faction-rel-val" style="color:' + barColor + '">' + (rel >= 0 ? '+' : '') + rel + '</span>' +
        '</div>' +
        '<div class="faction-details">' +
          '<div class="faction-pref">' +
            '<span class="faction-pref-label">偏好商品：</span>' +
            '<span class="faction-pref-liked">' + f.tradePreference.liked.map(_goodEmoji).join(' ') + '</span>' +
            '<span class="faction-pref-label" style="margin-left:8px">厌恶：</span>' +
            '<span class="faction-pref-disliked">' + f.tradePreference.disliked.map(_goodEmoji).join(' ') + '</span>' +
          '</div>' +
          '<div class="faction-tax">' +
            '贸易税修正：<span style="color:' + (level.taxMod <= 1 ? 'var(--accent-green)' : 'var(--accent-red)') + '">' +
            (level.taxMod <= 1 ? '-' : '+') + Math.abs(Math.round((level.taxMod - 1) * 100)) + '%</span>' +
          '</div>' +
          '<div class="faction-bonus">' +
            (level.id === 'friendly' || level.id === 'allied'
              ? '🎁 ' + (f.bonuses[level.id] || '')
              : '<span style="color:var(--text-dim)">提升关系以解锁派系奖励</span>') +
          '</div>' +
        '</div>' +
      '</div>';
  });

  container.innerHTML = html;
}

const _GOOD_EMOJIS = {
  food: '🌾', water: '💧', minerals: '⛏', technology: '🔬',
  luxury: '💎', weapons: '⚔', medicine: '💊', fuel: '⚡',
};

function _goodEmoji(goodId) {
  return (_GOOD_EMOJIS[goodId] || goodId);
}
