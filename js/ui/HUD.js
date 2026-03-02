// js/ui/HUD.js — 顶部状态栏与消息日志
// 依赖：core/EventBus.js, data/constants.js
// 导出：init, updateStats, addMessage

import * as EventBus            from '../core/EventBus.js';
import { SYSTEMS, findSystem, findGalaxy } from '../data/systems.js';
import * as Faction             from '../systems/faction/FactionSystem.js';
import { getLevel, getRepRank, PLAYER_LEVELS } from '../data/playerLevels.js';
import * as Victory             from '../systems/victory/VictorySystem.js';

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

  // 多路径胜利进度
  const progressList = Victory.getProgress(state);
  const wrap = document.getElementById('victory-paths-wrap');
  if (wrap) {
    let html = '';
    progressList.forEach(function (p) {
      const pctVal = Math.min(100, Math.floor(p.progress * 100));
      const done = p.completed ? ' vp-done' : '';
      // 构建 tooltip 内容
      let tipParts = [];
      p.requirements.forEach(function (r) {
        tipParts.push((r.done ? '✅' : '⬜') + ' ' + r.label + ' (' + r.current + '/' + r.target + ')');
      });
      const tip = p.name + '\\n' + tipParts.join('\\n');
      html +=
        '<div class="vp-item' + done + '" title="' + tip + '">' +
          '<span class="vp-icon">' + p.icon + '</span>' +
          '<div class="vp-bar-track">' +
            '<div class="vp-bar-fill" style="width:' + pctVal + '%;background:' + p.color + '"></div>' +
          '</div>' +
          '<span class="vp-pct">' + pctVal + '%</span>' +
        '</div>';
    });
    wrap.innerHTML = html;
  }

  // 玩家等级 & 声望
  const lvl = getLevel(state.experience || 0);
  const nextLvl = PLAYER_LEVELS.find(function (l) { return l.level === lvl.level + 1; });
  const repRank = getRepRank(state.reputation || 0);

  const levelEl = document.getElementById('player-level');
  if (levelEl) {
    const expCur = (state.experience || 0) - lvl.expRequired;
    const expNext = nextLvl ? (nextLvl.expRequired - lvl.expRequired) : 1;
    const lvlPct = nextLvl ? Math.min(100, (expCur / expNext) * 100) : 100;
    levelEl.innerHTML =
      '<span class="level-icon">' + lvl.icon + '</span>' +
      '<span class="level-title">' + lvl.title + ' Lv.' + lvl.level + '</span>' +
      '<span class="rep-badge" title="声望: ' + (state.reputation || 0) + '">' + repRank.icon + ' ' + repRank.name + '</span>' +
      '<div class="level-bar-track"><div class="level-bar-fill" style="width:' + lvlPct + '%"></div></div>';
  }

  // 当前位置 + 派系信息
  const sys = findSystem(state.currentSystem);
  const gal = findGalaxy(state.currentGalaxy || 'milky_way');
  const faction = Faction.getFactionForSystem(state.currentSystem);
  const factionTag = faction
    ? ' · ' + faction.icon + ' ' + faction.name
    : '';
  const galTag = gal ? gal.icon + ' ' + gal.name + ' > ' : '';
  document.getElementById('current-location').textContent = '📍 ' + galTag + sys.name + factionTag;
  document.getElementById('location-desc').textContent    = sys.description;
}

// ---------------------------------------------------------------------------
// 公司名显示
// ---------------------------------------------------------------------------

export function updateCompanyName(state) {
  const el = document.getElementById('company-name-text');
  if (el) el.textContent = state.companyName || '星际信使贸易公司';
}


export function addMessage(text, type) {
  const log = document.getElementById('message-log');
  const div = document.createElement('div');
  div.className   = 'msg msg-' + (type || 'info');
  div.textContent = text;
  log.insertBefore(div, log.firstChild);
  while (log.children.length > 10) log.removeChild(log.lastChild);
}
