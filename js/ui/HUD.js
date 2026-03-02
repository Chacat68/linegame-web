// js/ui/HUD.js — 顶部状态栏与消息日志
// 依赖：core/EventBus.js, data/constants.js
// 导出：init, updateStats, addMessage

import * as EventBus            from '../core/EventBus.js';
import { SYSTEMS, findSystem, findGalaxy } from '../data/systems.js';
import * as Faction             from '../systems/faction/FactionSystem.js';
import { getLevel, getRepRank, PLAYER_LEVELS } from '../data/playerLevels.js';
import * as Victory             from '../systems/victory/VictorySystem.js';

// 缓存最近一次胜利路径进度，避免点击弹窗时重复计算
let _lastProgressList = [];

// ---------------------------------------------------------------------------
// 初始化：订阅 EventBus 日志事件
// ---------------------------------------------------------------------------

export function init() {
  EventBus.on('log:message', function (data) {
    addMessage(data.text, data.type);
  });

  const vpModal = document.getElementById('victory-modal');

  // 胜利进度按钮 → 打开弹窗并渲染
  const vpBtn = document.getElementById('victory-progress-btn');
  if (vpBtn) {
    vpBtn.addEventListener('click', function () {
      _renderVictoryModal(_lastProgressList);
      vpModal.classList.remove('hidden');
    });
  }

  // 关闭弹窗
  const vpClose = document.getElementById('victory-modal-close');
  if (vpClose) {
    vpClose.addEventListener('click', function () {
      vpModal.classList.add('hidden');
    });
  }

  // 点击遮罩关闭弹窗
  if (vpModal) {
    vpModal.addEventListener('click', function (e) {
      if (e.target === vpModal) vpModal.classList.add('hidden');
    });
  }
}

// ---------------------------------------------------------------------------
// 顶部状态栏
// ---------------------------------------------------------------------------

export function updateStats(state, netWorth) {
  document.getElementById('credits').textContent      = Math.floor(state.credits).toLocaleString();
  document.getElementById('galactic-day').textContent = '第 ' + state.day + ' 天';
  document.getElementById('net-worth').textContent    = Math.floor(netWorth).toLocaleString();

  // 多路径胜利进度 — 更新按钮摘要 & 弹窗内容
  const progressList = Victory.getProgress(state);
  _lastProgressList = progressList;
  const completedCount = progressList.filter(function (p) { return p.completed; }).length;
  const summaryEl = document.getElementById('victory-progress-summary');
  if (summaryEl) {
    summaryEl.textContent = completedCount > 0
      ? completedCount + '/' + progressList.length + ' 已完成'
      : progressList.length + ' 条路径';
  }

  // 更新弹窗内容（如果弹窗已打开）
  const vpModal = document.getElementById('victory-modal');
  if (vpModal && !vpModal.classList.contains('hidden')) {
    _renderVictoryModal(progressList);
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

// ---------------------------------------------------------------------------
// 内部：渲染胜利路径弹窗内容
// ---------------------------------------------------------------------------

function _renderVictoryModal(progressList) {
  const body = document.getElementById('victory-modal-body');
  if (!body) return;
  let html = '';
  progressList.forEach(function (p) {
    const pctVal = Math.min(100, Math.floor(p.progress * 100));
    const doneClass = p.completed ? ' vp-done' : '';
    let reqsHtml = '';
    p.requirements.forEach(function (r) {
      const doneReq = r.done ? ' done' : '';
      reqsHtml +=
        '<div class="vp-card-req' + doneReq + '">' +
          (r.done ? '✅' : '⬜') + ' ' +
          r.label + ' <span class="vp-req-count">(' + r.current + '/' + r.target + ')</span>' +
        '</div>';
    });
    html +=
      '<div class="vp-card' + doneClass + '">' +
        '<div class="vp-card-header">' +
          '<span class="vp-card-icon">' + p.icon + '</span>' +
          '<span class="vp-card-name">' + p.name + '</span>' +
          '<span class="vp-card-pct">' + pctVal + '%</span>' +
        '</div>' +
        '<div class="vp-card-bar-track">' +
          '<div class="vp-card-bar-fill" style="width:' + pctVal + '%;background:' + p.color + '"></div>' +
        '</div>' +
        '<div class="vp-card-reqs">' + reqsHtml + '</div>' +
      '</div>';
  });
  body.innerHTML = html;
}
