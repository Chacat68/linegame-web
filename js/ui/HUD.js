// js/ui/HUD.js — 顶部状态栏与消息日志
// 依赖：core/EventBus.js, data/constants.js
// 导出：init, updateStats, addMessage

import * as EventBus            from '../core/EventBus.js';
import { GOODS } from '../data/goods.js';
import { SYSTEMS, findSystem, findGalaxy } from '../data/systems.js';
import * as Faction             from '../systems/faction/FactionSystem.js';
import * as PlayerLevels        from '../data/playerLevels.js';
import * as Victory             from '../systems/victory/VictorySystem.js';
import * as Economy             from '../systems/economy/Economy.js';
import * as Quest               from '../systems/quest/QuestSystem.js';
import * as GalaxyData          from '../systems/galaxy/GalaxyDataLayer.js';
import * as Exploration         from '../systems/galaxy/ExplorationSystem.js';
import * as Fleet               from '../systems/fleet/FleetSystem.js';
import { getCompanyLevelValue, getCompanyPrivilegeSummary } from '../data/companyAccess.js';
import { bindBlockingSurfaceDismiss, hideBlockingSurface, showBlockingSurface } from './SurfaceManager.js';
import * as ContextInspector from './ContextInspector.js';

const getLevel = PlayerLevels.getLevel;
const getRepRank = PlayerLevels.getRepRank;
const PLAYER_LEVELS = PlayerLevels.PLAYER_LEVELS || [];
const COMPANY_LEVELS = PlayerLevels.COMPANY_LEVELS || [
  { level: 1, title: '新创企业', expRequired: 0, icon: '🏢' },
];
const _goodNameById = GOODS.reduce(function (acc, good) {
  acc[good.id] = good.name;
  return acc;
}, Object.create(null));
const STARMAP_GALAXY_VIEW_TOGGLE_EVENT = 'starmap:galaxy-view-toggle';
const MAX_LOG_HISTORY = 200;
const LOG_TYPE_LABELS = {
  info: '系统',
  tip: '提示',
  trade: '交易',
  travel: '航行',
  buy: '买入',
  sell: '卖出',
  upgrade: '升级',
  danger: '警报',
  error: '警报',
};
const EMPTY_LOG_MESSAGE = '暂无通讯记录。完成航行、交易或系统行动后，记录会显示在这里。';
const getCompanyLevel = PlayerLevels.getCompanyLevel || function (exp) {
  return COMPANY_LEVELS[0];
};

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _setTextWithTitle(element, value) {
  if (!element) return;
  var text = String(value == null ? '' : value);
  element.textContent = text;
  if (text) element.setAttribute('title', text);
  else element.removeAttribute('title');
}

function _clampNumber(value, min, max) {
  var numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return min;
  return Math.max(min, Math.min(max, numberValue));
}

function _setMeterValue(element, value, options) {
  if (!element || typeof element.setAttribute !== 'function') return;

  var opts = options || {};
  var min = opts.min != null ? Number(opts.min) : 0;
  var max = opts.max != null ? Number(opts.max) : 100;
  var normalizedMin = Number.isFinite(min) ? min : 0;
  var normalizedMax = Number.isFinite(max) ? max : 100;
  var now = _clampNumber(value, normalizedMin, normalizedMax);

  element.setAttribute('aria-valuemin', String(normalizedMin));
  element.setAttribute('aria-valuemax', String(normalizedMax));
  element.setAttribute('aria-valuenow', String(Math.round(now)));

  if (opts.valueText) {
    element.setAttribute('aria-valuetext', opts.valueText);
    element.setAttribute('title', opts.valueText);
  } else {
    element.removeAttribute('aria-valuetext');
    element.removeAttribute('title');
  }

  if (element.dataset) {
    element.dataset.meterState = opts.state || 'nominal';
  }
}

function _getResourceMeterState(percent, dangerWhenHigh) {
  if (dangerWhenHigh) {
    if (percent >= 95) return 'critical';
    if (percent >= 75) return 'warning';
    return 'nominal';
  }
  if (percent <= 20) return 'critical';
  if (percent <= 40) return 'warning';
  return 'nominal';
}

// 缓存最近一次胜利路径进度，避免点击弹窗时重复计算
let _lastProgressList = [];
let _questActions = null;
let _initialized = false;
let _logsHistory = [];
let _unreadLogCount = 0;
let _stateRef = null;

// ---------------------------------------------------------------------------
// 初始化：订阅 EventBus 日志事件
// ---------------------------------------------------------------------------

export function init() {
  if (_initialized) return;
  _initialized = true;

  EventBus.on('log:message', function (data) {
    addMessage(data.text, data.type);
  });

  const vpModal = document.getElementById('victory-modal');

  // 胜利进度按钮 → 打开弹窗并渲染
  const vpBtn = document.getElementById('victory-progress-btn');
  if (vpBtn) {
    vpBtn.addEventListener('click', function () {
      _renderVictoryModal(_lastProgressList);
      showBlockingSurface('victory-modal', { focusSelector: '#victory-modal-close' });
    });
  }

  // 关闭弹窗
  const vpClose = document.getElementById('victory-modal-close');
  if (vpClose) {
    vpClose.addEventListener('click', function () {
      hideBlockingSurface('victory-modal');
    });
  }

  if (vpModal) bindBlockingSurfaceDismiss('victory-modal');

  const vpBody = document.getElementById('victory-modal-body');
  if (vpBody) {
    vpBody.addEventListener('click', function (event) {
      const button = event.target && typeof event.target.closest === 'function'
        ? event.target.closest('[data-victory-policy-id]')
        : null;
      if (!button || !_stateRef || button.disabled) return;
      const pathId = button.dataset.victoryPolicyId;
      if (typeof window !== 'undefined' && typeof window.confirm === 'function' &&
          !window.confirm('长期路线会写入存档且不可更改。确认选择？')) return;
      const result = Victory.choosePolicy(_stateRef, pathId);
      (result.msgs || []).forEach(function (msg) { addMessage(msg.text, msg.type); });
      if (result.ok) {
        if (Array.isArray(_stateRef.fleet) && _stateRef.fleet.length > 0) Fleet.syncStateFromShip(_stateRef);
        const questResult = Quest.checkProgress(_stateRef, { action: 'victory_policy', pathId: pathId });
        (questResult.msgs || []).forEach(function (msg) { addMessage(msg.text, msg.type); });
      }
      _lastProgressList = Victory.getProgress(_stateRef);
      _renderVictoryModal(_lastProgressList);
    });
  }

  EventBus.on('logs:badge:clear', function () {
    clearLogUnreadCount();
    refreshLogView();
  });

  var compactInspector = typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 620px)').matches;
  ContextInspector.init({ open: !compactInspector });
  _updateLogsNavBadge();
  refreshLogView();
}

export function setQuestActions(actions) {
  _questActions = actions || null;
}

// ---------------------------------------------------------------------------
// 顶部状态栏
// ---------------------------------------------------------------------------

export function updateStats(state, netWorth) {
  _stateRef = state;
  var creditsEl = document.getElementById('credits');
  var galacticDayEl = document.getElementById('galactic-day');
  var netWorthEl = document.getElementById('net-worth');

  if (creditsEl) creditsEl.textContent = Math.floor(state.credits).toLocaleString();
  if (galacticDayEl) galacticDayEl.textContent = '第 ' + state.day + ' 天';
  if (netWorthEl) netWorthEl.textContent = Math.floor(netWorth).toLocaleString();

  // 同步船队面板中的镜像元素（无独立 id，通过 class 更新）
  document.querySelectorAll('.hdr-credits-mirror').forEach(function (el) {
    el.textContent = Math.floor(state.credits).toLocaleString();
  });
  document.querySelectorAll('.hdr-day-mirror').forEach(function (el) {
    el.textContent = '第 ' + state.day + ' 天';
  });

  // 更新状态栏与顶部资源仪表：燃料 / 护盾 / 货舱
  const statusSnapshot = _updateStatusBars(state);

  // 多路径胜利进度 — 更新按钮摘要 & 弹窗内容
  const progressList = Victory.getProgress(state);
  _lastProgressList = progressList;
  const completedCount = progressList.filter(function (p) { return p.completed; }).length;
  const totalPaths = (typeof Victory.getUnlockedPaths === 'function')
    ? Victory.getUnlockedPaths(state).length
    : progressList.length;
  const summaryEl = document.getElementById('victory-progress-summary');
  if (summaryEl) {
    summaryEl.textContent = completedCount > 0
      ? completedCount + '/' + totalPaths + ' 已完成'
      : totalPaths + ' 条路径（章节解锁中）';
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
  const levelPanelEl = document.getElementById('player-level-panel');
  const expCur = (state.experience || 0) - lvl.expRequired;
  const expNext = nextLvl ? (nextLvl.expRequired - lvl.expRequired) : 1;
  const lvlPct = nextLvl ? Math.min(100, (expCur / expNext) * 100) : 100;
  const lvlHtml =
    '<span class="level-icon">' + lvl.icon + '</span>' +
    '<span class="level-title">' + lvl.title + ' Lv.' + lvl.level + '</span>' +
    '<span class="rep-badge" title="声望: ' + (state.reputation || 0) + '">' + repRank.icon + ' ' + repRank.name + '</span>' +
    '<div class="level-bar-track"><div class="level-bar-fill" style="width:' + lvlPct + '%"></div></div>';
  if (levelEl) levelEl.innerHTML = lvlHtml;
  if (levelPanelEl) levelPanelEl.innerHTML = lvlHtml;

  // 当前位置 + 派系信息
  const sys = findSystem(state.currentSystem);
  const gal = findGalaxy(state.currentGalaxy || 'milky_way');
  const faction = Faction.getFactionForSystem(state.currentSystem);
  const factionTag = faction
    ? ' · ' + faction.icon + ' ' + faction.name
    : '';
  const galTag = gal ? gal.icon + ' ' + gal.name + ' > ' : '';
  const locationText = '📍 ' + galTag + sys.name + factionTag;
  const locationEl = document.getElementById('current-location');
  _setTextWithTitle(locationEl, locationText);
  const locationDescEl = document.getElementById('location-desc');
  if (locationDescEl) locationDescEl.textContent = sys.description;
  const mapLegendLocationEl = document.getElementById('map-legend-location');
  if (mapLegendLocationEl) mapLegendLocationEl.textContent = locationText;
  _updateInterstellarHud(state, netWorth, sys, gal, faction, repRank, statusSnapshot);

  // 经济周期指示器
  const cycleEl = document.getElementById('economy-cycle');
  if (cycleEl) {
    const cycle = Economy.getEconomyCycle();
    const nextPhase = Economy.getNextCyclePhase();
    const remaining = cycle.phaseDuration - cycle.dayInPhase;
    const cycleHtml =
      '<span class="cycle-icon">' + cycle.icon + '</span>' +
      '<span class="cycle-name">' + cycle.name + '</span>' +
      '<span class="cycle-remaining" title="距离下一阶段「' + nextPhase.name + '」还有 ' + remaining + ' 天">' + remaining + '天</span>' +
      '<div class="cycle-bar-track"><div class="cycle-bar-fill cycle-' + cycle.phase + '" style="width:' + cycle.progressPercent + '%"></div></div>';
    cycleEl.innerHTML = cycleHtml;
    // 同步船队面板中的镜像元素
    document.querySelectorAll('.hdr-cycle-mirror').forEach(function (el) {
      el.innerHTML = cycleHtml;
    });
  }

  _renderQuestTracker(state);
}

// ---------------------------------------------------------------------------
// 公司名显示
// ---------------------------------------------------------------------------

export function updateCompanyName(state) {
  const el = document.getElementById('company-name-text');
  if (el) el.textContent = state.companyName || '星际信使贸易公司';
  _renderCompanyUnlockRoadmap(state);

  const lvlLineEl = document.getElementById('company-level-line');
  const lvlFillEl = document.getElementById('company-level-fill');
  const lvlTrackEl = document.getElementById('company-level-track');
  if (!lvlLineEl || !lvlFillEl) return;

  const lvl = getCompanyLevel(state.companyExperience || 0);
  const nextLvl = COMPANY_LEVELS.find(function (l) { return l.level === lvl.level + 1; });
  const expCur = (state.companyExperience || 0) - lvl.expRequired;
  const expNeed = nextLvl ? (nextLvl.expRequired - lvl.expRequired) : 1;
  const pct = nextLvl ? Math.min(100, (expCur / expNeed) * 100) : 100;

  if (nextLvl) {
    lvlLineEl.textContent = lvl.icon + ' ' + lvl.title + ' Lv.' + lvl.level + ' · ' + Math.max(0, expCur) + '/' + expNeed;
  } else {
    lvlLineEl.textContent = lvl.icon + ' ' + lvl.title + ' Lv.' + lvl.level + ' · 已满级';
  }
  lvlFillEl.style.width = pct + '%';
  if (lvlTrackEl) {
    const progressNow = nextLvl ? Math.max(0, Math.min(expNeed, expCur)) : 1;
    const progressMax = nextLvl ? expNeed : 1;
    const progressText = nextLvl
      ? ('公司等级 ' + lvl.level + '，' + progressNow + '/' + progressMax)
      : ('公司等级 ' + lvl.level + '，已满级');
    lvlTrackEl.setAttribute('aria-valuemin', '0');
    lvlTrackEl.setAttribute('aria-valuemax', String(progressMax));
    lvlTrackEl.setAttribute('aria-valuenow', String(progressNow));
    lvlTrackEl.setAttribute('aria-valuetext', progressText);
    lvlTrackEl.setAttribute('title', progressText);
  }
}

function _renderCompanyPermissionMetric(label, value, note, toneClass) {
  return '<div class="company-permission-metric' + (toneClass ? ' ' + toneClass : '') + '" role="listitem">' +
    '<span>' + _escapeHtml(label) + '</span>' +
    '<strong>' + _escapeHtml(value) + '</strong>' +
    '<small>' + _escapeHtml(note) + '</small>' +
  '</div>';
}

function _renderCompanyUnlockRoadmap(state) {
  const roadmapEl = document.getElementById('company-unlock-roadmap');
  if (!roadmapEl) return;

  const currentLevel = getCompanyLevelValue(state || {});
  const privilegeSummary = getCompanyPrivilegeSummary(state || {});
  const fleetSlots = privilegeSummary.caps.fleetSlots || {};
  const tradeStations = privilegeSummary.caps.tradeStations || {};
  const stationLevel = privilegeSummary.caps.tradeStationLevel || {};
  const fleetAvailable = Math.max(0, (fleetSlots.max || 0) - (fleetSlots.used || 0));
  const milestone = privilegeSummary.nextMilestone;
  const focusTone = milestone
    ? (privilegeSummary.progressRatio >= 0.75 ? 'near' : 'locked')
    : 'open';
  const focusTitle = milestone
    ? ('Lv.' + milestone.level + ' · ' + milestone.title)
    : '核心权限全部开放';
  const focusNote = milestone
    ? (milestone.items.slice(0, 4).join(' · ') + ' · 还需 ' + privilegeSummary.expToNext + ' 公司经验')
    : _formatCompanyPrivilegeCaps(privilegeSummary);

  roadmapEl.innerHTML =
    '<div class="company-permission-head">' +
      '<div>' +
        '<span class="company-permission-kicker">公司功能</span>' +
        '<strong class="company-permission-title">等级开放功能</strong>' +
      '</div>' +
      '<span class="company-permission-level">Lv.' + _escapeHtml(currentLevel) + '</span>' +
    '</div>' +
    '<div class="company-permission-grid" role="list" aria-label="公司功能容量">' +
      _renderCompanyPermissionMetric('舰船位置', (fleetSlots.used || 0) + '/' + (fleetSlots.max || 0), '还有 ' + fleetAvailable + ' 个位置', fleetAvailable > 0 ? 'tone-open' : 'tone-full') +
      _renderCompanyPermissionMetric('贸易站', tradeStations.label || '未开放', tradeStations.unlocked ? ('空余 ' + (tradeStations.available || 0) + ' 站') : '等级权限未开放', tradeStations.unlocked && !tradeStations.full ? 'tone-open' : 'tone-full') +
      _renderCompanyPermissionMetric('贸易站等级', stationLevel.label || '未开放', '当前等级上限', stationLevel.max > 0 ? 'tone-open' : 'tone-full') +
    '</div>' +
    '<div class="company-permission-focus" data-tone="' + focusTone + '" role="status">' +
      '<span class="company-permission-focus-kicker">' + (milestone ? '下一级开放' : '当前状态') + '</span>' +
      '<strong>' + _escapeHtml(focusTitle) + '</strong>' +
      '<small>' + _escapeHtml(focusNote) + '</small>' +
    '</div>';
}

function _formatCompanyPrivilegeCaps(summary) {
  if (!summary || !summary.caps) return '权限摘要暂不可用';
  var stations = summary.caps.tradeStations || {};
  var stationLevel = summary.caps.tradeStationLevel || {};
  var fleetSlots = summary.caps.fleetSlots || {};
  return '贸易站 ' + (stations.label || '未开放') +
    ' · 贸易站等级 ' + (stationLevel.label || '未开放') +
    ' · 舰船位置 ' + (fleetSlots.used || 1) + '/' + (fleetSlots.max || 1);
}

function _setBadgeValue(id, count, labelPrefix) {
  const el = document.getElementById(id);
  if (!el) return;
  const value = Math.max(0, Number(count) || 0);
  el.hidden = value <= 0;
  el.textContent = value > 99 ? '99+' : String(value);
  el.title = labelPrefix ? (labelPrefix + '：' + value) : String(value);
}

export function updateArchiveBadges(state) {
  const safeState = state || {};
  const activeQuestCount = Array.isArray(safeState.quests) ? safeState.quests.length : 0;
  const availableQuestCount = Quest.getAvailableQuests(safeState).length;
  const researchOptionCount = Array.isArray(safeState.researchOptions) ? safeState.researchOptions.length : 0;
  const researchCount = (safeState.currentResearch && safeState.currentResearch.techId ? 1 : 0) + researchOptionCount;
  const factionWatchCount = Faction.getAllRelations(safeState).filter(function (entry) {
    return entry && entry.level && entry.level.id !== 'neutral';
  }).length;
  const achievementUnlockedCount = Array.isArray(safeState.achievements) ? safeState.achievements.length : 0;
  const exploredSystemIds = new Set(Array.isArray(safeState.visitedSystems) ? safeState.visitedSystems : []);
  if (safeState.currentSystem) exploredSystemIds.add(safeState.currentSystem);
  let explorationReportCount = 0;
  let explorationFollowupCount = 0;
  exploredSystemIds.forEach(function (systemId) {
    const summary = Exploration.getSurveySummary(safeState, systemId);
    if (!summary) return;
    explorationReportCount += summary.reportCount || 0;
    explorationFollowupCount += (summary.anomalyChains || []).filter(function (chain) {
      return chain && chain.followupReady && !chain.followupAcknowledged;
    }).length;
  });
  const navCount = activeQuestCount + availableQuestCount + researchOptionCount + explorationFollowupCount;

  _setBadgeValue('archive-tab-quest-badge', activeQuestCount + availableQuestCount, '任务待处理');
  _setBadgeValue('archive-tab-exploration-badge', explorationReportCount, '已归档探索报告');
  _setBadgeValue('archive-tab-research-badge', researchCount, '科技待处理');
  _setBadgeValue('archive-tab-faction-badge', factionWatchCount, '派系关系变化');
  _setBadgeValue('archive-tab-achievement-badge', achievementUnlockedCount, '已解锁成就');
  _setBadgeValue('archive-nav-badge', navCount, '档案待处理');
}


export function addMessage(text, type) {
  // 存入历史数组，最新记录始终在顶部。
  var normalizedType = _normalizeLogType(type);
  _logsHistory.unshift({ text: String(text == null ? '' : text), type: normalizedType, time: new Date() });
  if (_logsHistory.length > MAX_LOG_HISTORY) {
    _logsHistory.pop();
  }
  _unreadLogCount = Math.min(999, _unreadLogCount + 1);
  _updateLogsNavBadge();
  refreshLogView();
}

/**
 * 从内存历史恢复日志终端。页面结构被重绘后，打开日志仍能看到已接收的记录。
 */
export function refreshLogView() {
  if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return false;
  const log = document.getElementById('message-log');
  if (!log || typeof document.createElement !== 'function') return false;

  if (typeof log.replaceChildren === 'function') {
    log.replaceChildren();
  } else {
    log.innerHTML = '';
  }

  if (_logsHistory.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'msg msg-info log-empty-state';
    empty.textContent = EMPTY_LOG_MESSAGE;
    log.appendChild(empty);
    return true;
  }

  _logsHistory.forEach(function (entry) {
    log.appendChild(_buildLogMessageElement(entry));
  });
  return true;
}

export function clearLogUnreadCount() {
  _unreadLogCount = 0;
  _updateLogsNavBadge();
}

function _updateLogsNavBadge() {
  _setBadgeValue('logs-nav-badge', _unreadLogCount, '未读通讯');
  var logsButton = typeof document.querySelector === 'function'
    ? document.querySelector('.bottom-nav-btn[data-view="logs"]')
    : null;
  if (!logsButton || typeof logsButton.setAttribute !== 'function') return;

  if (_unreadLogCount > 0) {
    var label = '通讯日志，' + _unreadLogCount + ' 条新消息';
    logsButton.title = label;
    logsButton.setAttribute('aria-label', label);
  } else {
    logsButton.title = '通讯日志';
    logsButton.setAttribute('aria-label', '通讯日志');
  }
}

function _normalizeLogType(type) {
  var normalized = typeof type === 'string' ? type.trim().toLowerCase() : 'info';
  return Object.prototype.hasOwnProperty.call(LOG_TYPE_LABELS, normalized) ? normalized : 'info';
}

function _formatLogTime(value) {
  var date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map(function (part) {
    return String(part).padStart(2, '0');
  }).join(':');
}

function _buildLogMessageElement(entry) {
  const div = document.createElement('div');
  div.className = 'msg msg-' + entry.type;

  const meta = document.createElement('span');
  meta.className = 'log-message-meta';

  const time = document.createElement('time');
  time.className = 'log-message-time';
  time.dateTime = entry.time instanceof Date ? entry.time.toISOString() : '';
  time.textContent = _formatLogTime(entry.time);

  const kind = document.createElement('span');
  kind.className = 'log-message-kind';
  kind.textContent = LOG_TYPE_LABELS[entry.type] || LOG_TYPE_LABELS.info;

  const message = document.createElement('span');
  message.className = 'log-message-text';
  message.textContent = entry.text;

  meta.appendChild(time);
  meta.appendChild(kind);
  div.appendChild(meta);
  div.appendChild(message);
  return div;
}

// ---------------------------------------------------------------------------
// 内部：更新底部状态栏（燃料 / 护盾 / 货舱）
// ---------------------------------------------------------------------------

function _updateStatusBars(state) {
  // 燃料
  var fuelPct = state.maxFuel > 0
    ? Math.round((state.fuel / state.maxFuel) * 100)
    : 100;
  fuelPct = Math.max(0, Math.min(100, fuelPct));
  var fuelFillEl = document.getElementById('status-fuel-fill');
  var fuelPctEl  = document.getElementById('status-fuel-pct');
  var fuelMeterEl = document.getElementById('status-fuel-meter');
  var fuelText = '燃料 ' + (state.fuel || 0) + '/' + (state.maxFuel || 0) + '（' + fuelPct + '%）';
  if (fuelFillEl) fuelFillEl.style.width = fuelPct + '%';
  if (fuelPctEl) {
    fuelPctEl.textContent = fuelPct + '%';
    fuelPctEl.setAttribute('title', fuelText);
  }
  _setMeterValue(fuelMeterEl, fuelPct, {
    valueText: fuelText,
    state: _getResourceMeterState(fuelPct, false),
  });

  // 护盾（船体耐久）
  var currentHull = state.shipHull != null ? state.shipHull : state.maxHull;
  var hullPct = state.maxHull > 0
    ? Math.round((currentHull / state.maxHull) * 100)
    : 100;
  hullPct = Math.max(0, Math.min(100, hullPct));
  var shieldFillEl = document.getElementById('status-shield-fill');
  var shieldPctEl  = document.getElementById('status-shield-pct');
  var shieldMeterEl = document.getElementById('status-shield-meter');
  var shieldText = '护盾 ' + (currentHull || 0) + '/' + (state.maxHull || 0) + '（' + hullPct + '%）';
  if (shieldFillEl) shieldFillEl.style.width = hullPct + '%';
  if (shieldPctEl) {
    shieldPctEl.textContent = hullPct + '%';
    shieldPctEl.setAttribute('title', shieldText);
  }
  _setMeterValue(shieldMeterEl, hullPct, {
    valueText: shieldText,
    state: _getResourceMeterState(hullPct, false),
  });

  // 货舱使用率
  var cargoUsed = state.cargo
    ? Object.values(state.cargo).reduce(function (s, q) { return s + q; }, 0)
    : 0;
  var cargoPct = state.maxCargo > 0
    ? Math.round((cargoUsed / state.maxCargo) * 100)
    : 0;
  cargoPct = Math.max(0, Math.min(100, cargoPct));
  var cargoFillEl = document.getElementById('status-cargo-fill');
  var cargoPctEl  = document.getElementById('status-cargo-pct');
  var cargoMeterEl = document.getElementById('status-cargo-meter');
  var cargoText = '货舱 ' + cargoUsed + '/' + (state.maxCargo || 0) + '（' + cargoPct + '%）';
  if (cargoFillEl) cargoFillEl.style.width = cargoPct + '%';
  if (cargoPctEl) {
    cargoPctEl.textContent = cargoPct + '%';
    cargoPctEl.setAttribute('title', cargoText);
  }
  _setMeterValue(cargoMeterEl, cargoPct, {
    valueText: cargoText,
    state: _getResourceMeterState(cargoPct, true),
  });

  return {
    cargoUsed: cargoUsed,
    cargoPct: cargoPct,
    fuelPct: fuelPct,
    hullPct: hullPct,
  };
}

function _updateInterstellarHud(state, netWorth, sys, gal, faction, repRank, statusSnapshot) {
  const activeShip = Array.isArray(state.fleet)
    ? state.fleet[state.activeShipIndex || 0]
    : null;
  const shipNameEl = document.getElementById('hdr-ship-name');
  _setTextWithTitle(
    shipNameEl,
    activeShip
      ? ((activeShip.emoji ? activeShip.emoji + ' ' : '') + activeShip.name)
      : '旗舰未配置'
  );

  const reputation = Number(state.reputation || 0);
  const repPct = Math.max(0, Math.min(100, Math.round((reputation + 100) / 10)));
  const repValueEl = document.getElementById('hdr-reputation-value');
  const repFillEl = document.getElementById('hdr-reputation-fill');
  const repMeterEl = document.getElementById('hdr-reputation-meter');
  const repText = repRank.name + ' ' + reputation.toLocaleString();
  const repMeterText = '公司声望 ' + repRank.name + '：' + reputation.toLocaleString();
  if (repValueEl) {
    repValueEl.textContent = repText;
    repValueEl.setAttribute('title', repMeterText);
  }
  if (repFillEl) repFillEl.style.width = repPct + '%';
  _setMeterValue(repMeterEl, reputation, {
    min: -100,
    max: 900,
    valueText: repMeterText,
    state: reputation < 0 ? 'critical' : (reputation < 200 ? 'warning' : 'nominal'),
  });

  const targetNameEl = document.getElementById('hud-target-name');
  const targetTypeEl = document.getElementById('hud-target-type');
  const targetGalaxyEl = document.getElementById('hud-target-galaxy');
  const targetFactionEl = document.getElementById('hud-target-faction');
  const targetSurveyEl = document.getElementById('hud-target-survey');
  const targetNextEl = document.getElementById('hud-target-next');
  if (sys) {
    if (targetNameEl) targetNameEl.textContent = sys.name;
    if (targetTypeEl) targetTypeEl.textContent = sys.typeLabel || '星球';
    if (targetGalaxyEl) targetGalaxyEl.textContent = gal ? gal.name : '未知星系';
    if (targetFactionEl) targetFactionEl.textContent = faction ? faction.name : '中立地带';
    _renderHudTargetSurvey(state, sys, targetSurveyEl, targetNextEl);
  }

  _renderHudGalacticMapSummary(state, sys, gal);
  _renderHudMarketOverview(state, sys);
  _renderHudNetworkStatus(state, statusSnapshot, netWorth);
}

function _renderHudTargetSurvey(state, sys, targetSurveyEl, targetNextEl) {
  if (!sys) return;

  var planetData = GalaxyData.getPlanetData(sys.id);
  var exploration = planetData && planetData.exploration;
  var summary = Exploration.getSurveySummary(state, sys.id);

  if (!exploration || !summary) {
    _setTextWithTitle(targetSurveyEl, '探索报告同步中');
    _setTextWithTitle(targetNextEl, '档案同步中');
    return;
  }

  var poiText = summary.totalPois > 0
    ? (summary.resolvedCount + '/' + summary.totalPois + ' 探索点')
    : '无探索点';

  _setTextWithTitle(
    targetSurveyEl,
    poiText + ' · 情报 Lv.' + (summary.intelLevel || 0)
  );

  var nextText = '暂无待办 · 可继续贸易';
  if (summary.pendingCount > 0) {
    nextText = '待调查 · ' + summary.pendingCount + ' 个探索点';
  } else if (summary.completed) {
    nextText = '探索完成 · ' + summary.reportCount + ' 份报告';
  }

  _setTextWithTitle(targetNextEl, nextText);
}

function _renderHudGalacticMapSummary(state, sys, gal) {
  const viewEl = document.getElementById('hud-galactic-map-view');
  const focusEl = document.getElementById('hud-galactic-map-focus');
  const captionEl = document.getElementById('hud-galactic-map-caption');
  const toggleBtn = document.getElementById('hud-galactic-map-toggle');
  if (!viewEl && !focusEl && !captionEl && !toggleBtn) return;

  const viewingGalaxy = findGalaxy(state.viewingGalaxy || state.currentGalaxy) || gal;
  const currentGalaxy = findGalaxy(state.currentGalaxy) || gal;
  const isGalaxyView = state.mapView === 'galaxies';
  const viewText = isGalaxyView ? '星系总览' : '星球视图';
  const focusText = isGalaxyView
    ? ((currentGalaxy ? currentGalaxy.name : '当前星系') + ' · 跃迁网络')
    : ((viewingGalaxy ? viewingGalaxy.name : '未知星系') + (sys ? ' · ' + sys.name : ''));
  const captionText = isGalaxyView ? '返回当前星系局部视图' : '切换到跨星系跃迁总览';
  const buttonText = isGalaxyView ? '回到当前星系' : '星系总览';

  if (viewEl) viewEl.textContent = viewText;
  if (focusEl) focusEl.textContent = focusText;
  if (captionEl) captionEl.textContent = captionText;
  if (toggleBtn) {
    toggleBtn.textContent = buttonText;
    toggleBtn.setAttribute('title', captionText);
    if (toggleBtn.dataset.bound !== 'true') {
      toggleBtn.addEventListener('click', function () {
        EventBus.emit(STARMAP_GALAXY_VIEW_TOGGLE_EVENT);
        var currentState = _stateRef || state;
        if (!currentState) return;
        _renderHudGalacticMapSummary(
          currentState,
          findSystem(currentState.currentSystem),
          findGalaxy(currentState.viewingGalaxy || currentState.currentGalaxy),
        );
      });
      toggleBtn.dataset.bound = 'true';
    }
  }
}

function _getOpenMarketGoods() {
  return GOODS.filter(function (good) {
    return !good.marketAccess || good.marketAccess.indexOf('open') !== -1;
  });
}

function _getMarketSnapshot(state, sys) {
  if (!sys) return [];
  return _getOpenMarketGoods().map(function (good) {
    const sd = Economy.getSupplyDemand(sys.id, good.id);
    const buy = Economy.getBuyPrice(sys.id, good.id, state);
    const sell = Economy.getSellPrice(sys.id, good.id, state);
    const drift = Math.round((sd.ratio - 1) * 100);
    return { good: good, buy: buy, sell: sell, ratio: sd.ratio, drift: drift };
  });
}

function _openMarketWorkspace(workspaceId) {
  var marketNavBtn = document.querySelector('.bottom-nav-btn[data-view="market"]');
  if (marketNavBtn) marketNavBtn.click();

  var focusWorkspace = function () {
    var workspaceTab = document.querySelector('[data-market-workspace-tab="' + workspaceId + '"]');
    if (!workspaceTab) return false;
    workspaceTab.click();
    return true;
  };

  if (!focusWorkspace() && typeof setTimeout === 'function') {
    setTimeout(focusWorkspace, 0);
  }
}

function _renderHudMarketOverview(state, sys) {
  const body = document.getElementById('hud-market-overview-body');
  if (!body || !sys) return;

  const rows = _getMarketSnapshot(state, sys)
    .sort(function (a, b) { return Math.abs(b.drift) - Math.abs(a.drift); })
    .slice(0, 3);

  body.innerHTML = rows.map(function (entry) {
    const trendClass = entry.drift > 0 ? 'is-up' : (entry.drift < 0 ? 'is-down' : 'is-flat');
    const trendText = entry.drift > 0
      ? '▲ ' + entry.drift + '%'
      : (entry.drift < 0 ? '▼ ' + Math.abs(entry.drift) + '%' : '◆ 0%');
    const signalText = entry.drift > 0
      ? '供给偏紧'
      : (entry.drift < 0 ? '供给宽松' : '价格稳定');
    return '<tr>' +
      '<td><span class="hud-good-icon">' + _escapeHtml(entry.good.emoji || '') + '</span>' + _escapeHtml(entry.good.name) + '</td>' +
      '<td><span class="hud-market-signal">' + signalText + '</span></td>' +
      '<td><span class="hud-trend ' + trendClass + '">' + trendText + '</span></td>' +
    '</tr>';
  }).join('');

  const updatedEl = document.getElementById('hud-market-updated');
  if (updatedEl) {
    const cycle = Economy.getEconomyCycle();
    updatedEl.textContent = 'DAY ' + (state.day || 1) + (cycle && cycle.name ? (' · ' + cycle.name) : '');
  }

  const openBtn = document.getElementById('hud-market-open');
  if (openBtn && openBtn.dataset.bound !== 'true') {
    openBtn.addEventListener('click', function () {
      _openMarketWorkspace('spot');
    });
    openBtn.dataset.bound = 'true';
  }
}

function _renderHudNetworkStatus(state, statusSnapshot, netWorth) {
  const nodesEl = document.getElementById('hud-network-nodes');
  const routesEl = document.getElementById('hud-network-routes');
  const volatilityEl = document.getElementById('hud-network-volatility');
  const signalEl = document.getElementById('hud-network-signal');
  const updatedEl = document.getElementById('hud-network-updated');
  const openBtn = document.getElementById('hud-network-open');

  const visitedCount = Array.isArray(state.visitedSystems) ? state.visitedSystems.length : 1;
  const fleet = Array.isArray(state.fleet) ? state.fleet : [];
  const activeRoutes = fleet.length > 0
    ? fleet.filter(function (ship) { return !!ship.route; }).length
    : 0;
  const cargoPct = statusSnapshot ? statusSnapshot.cargoPct : 0;
  const volatility = Math.max(
    0,
    Math.min(
      99,
      Math.round((cargoPct * 0.08) + ((state.day || 1) % 9) + ((netWorth || 0) > 5000 ? 4 : 1))
    )
  );
  var routeLoad = fleet.length > 0 ? Math.round((activeRoutes / fleet.length) * 100) : 0;
  var signalTitle = '贸易网络正常';
  var signalNote = activeRoutes + ' 条路线运行中，' + routeLoad + '% 的飞船正在跑商，近期价格变化不大。';
  var signalTone = 'stable';

  if (visitedCount <= 1 && activeRoutes === 0) {
    signalTitle = '贸易网络尚未铺开';
    signalNote = '目前只到过起始地点，还没有跨地点的跑商路线。';
    signalTone = 'idle';
  } else if (activeRoutes === 0) {
    signalTitle = '有空闲飞船';
    signalNote = '已经到过 ' + visitedCount + ' 个地点，但当前没有飞船在自动跑商。';
    signalTone = 'watch';
  } else if (fleet.length > 0 && activeRoutes >= fleet.length) {
    signalTitle = '所有飞船都在跑商';
    signalNote = '全部 ' + fleet.length + ' 艘船都在执行路线，当前没有空闲的自动跑商船位。';
    signalTone = 'watch';
  } else if (volatility >= 15) {
    signalTitle = '价格变化变大';
    signalNote = '近期价格变化 ' + volatility.toFixed(1) + '%，现有 ' + activeRoutes + ' 条航线需要持续观察。';
    signalTone = 'risk';
  } else if (cargoPct >= 85) {
    signalTitle = '货舱压力偏高';
    signalNote = '当前货舱占用 ' + Math.round(cargoPct) + '%，可用运力已经不多。';
    signalTone = 'watch';
  }

  if (nodesEl) nodesEl.textContent = visitedCount + ' / ' + SYSTEMS.length;
  if (routesEl) routesEl.textContent = String(activeRoutes);
  if (volatilityEl) volatilityEl.textContent = volatility.toFixed(1) + '%';
  if (signalEl) {
    signalEl.dataset.tone = signalTone;
    signalEl.innerHTML =
      '<span class="hud-network-signal-kicker">当前建议</span>' +
      '<strong class="hud-network-signal-title">' + _escapeHtml(signalTitle) + '</strong>' +
      '<span class="hud-network-signal-note">' + _escapeHtml(signalNote) + '</span>';
  }
  if (updatedEl) updatedEl.textContent = 'DAY ' + (state.day || 1);
  if (openBtn && openBtn.dataset.bound !== 'true') {
    openBtn.addEventListener('click', function () {
      _openMarketWorkspace('operations');
    });
    openBtn.dataset.bound = 'true';
  }
}


// 内部：渲染胜利路径弹窗内容
// ---------------------------------------------------------------------------

function _renderVictoryModal(progressList) {
  const body = document.getElementById('victory-modal-body');
  if (!body) return;
  var paths = Array.isArray(progressList) ? progressList : [];
  var completedCount = paths.filter(function (p) { return !!p.completed; }).length;
  var totalCount = Math.max(1, paths.length);
  var completionPct = Math.round((completedCount / totalCount) * 100);
  var bestPath = paths.reduce(function (best, current) {
    if (!best) return current;
    return (current.progress || 0) > (best.progress || 0) ? current : best;
  }, null);
  var bestPathNextReq = _getVictoryNextRequirement(bestPath);
  var bestPathNextText = bestPathNextReq
    ? (bestPathNextReq.label + ' · ' + bestPathNextReq.current + '/' + bestPathNextReq.target)
    : (bestPath && bestPath.completed ? '该路径已达成' : '暂无可追踪缺口');

  body.setAttribute('role', 'region');
  body.setAttribute('aria-live', 'polite');
  body.setAttribute('aria-label', '长期路线进度详情');

  let html =
    '<section class="vp-overview" aria-label="长期路线总览">' +
      '<div class="vp-overview-copy">' +
        '<div class="vp-overview-kicker">长期路线</div>' +
        '<div class="vp-overview-title">' + _escapeHtml(completedCount > 0 ? '已有路径达成' : '持续推进多路径胜利') + '</div>' +
        '<div class="vp-overview-desc">' + _escapeHtml(bestPath ? ('当前最接近：' + bestPath.name) : '暂无可追踪路径') + '</div>' +
        '<div class="vp-overview-next"><span>下一缺口</span><strong>' + _escapeHtml(bestPathNextText) + '</strong></div>' +
      '</div>' +
      '<div class="vp-overview-grid" role="list" aria-label="路线统计">' +
        '<div class="vp-overview-stat" role="listitem"><span>路径</span><strong>' + paths.length + '</strong></div>' +
        '<div class="vp-overview-stat" role="listitem"><span>已达成</span><strong>' + completedCount + '</strong></div>' +
        '<div class="vp-overview-stat" role="listitem"><span>达成率</span><strong>' + completionPct + '%</strong></div>' +
        '<div class="vp-overview-stat" role="listitem"><span>最高进度</span><strong>' + (bestPath ? Math.min(100, Math.floor((bestPath.progress || 0) * 100)) : 0) + '%</strong></div>' +
      '</div>' +
    '</section>' +
    '<div class="vp-card-list" role="list" aria-label="长期路线列表">';

  if (paths.length === 0) {
    html += '<div class="vp-empty" role="listitem">暂无长期路线进度，继续完成贸易、探索、研究或任务后再查看。</div>';
  }

  paths.forEach(function (p) {
    const pctVal = Math.min(100, Math.floor((p.progress || 0) * 100));
    const doneClass = p.completed ? ' vp-done' : '';
    const progressText = p.completed
      ? (p.name + ' 已达成')
      : (p.name + ' 当前完成 ' + pctVal + '%');
    const nextReq = _getVictoryNextRequirement(p);
    const nextReqText = nextReq
      ? (nextReq.label + ' · ' + nextReq.current + '/' + nextReq.target)
      : (p.completed ? '所有条件已完成' : '暂无拆分条件');
    let reqsHtml = '';
    (Array.isArray(p.requirements) ? p.requirements : []).forEach(function (r) {
      const doneReq = r.done ? ' done' : '';
      const reqStatus = r.done ? '已完成' : '未完成';
      reqsHtml +=
        '<div class="vp-card-req' + doneReq + '" role="listitem" aria-label="' + _escapeHtml(r.label + '，' + reqStatus + '，' + r.current + '/' + r.target) + '">' +
          '<span class="vp-req-state" aria-hidden="true">' + (r.done ? '✅' : '⬜') + '</span>' +
          '<span class="vp-req-label">' + _escapeHtml(r.label) + '</span>' +
          '<span class="vp-req-count">(' + _escapeHtml(r.current) + '/' + _escapeHtml(r.target) + ')</span>' +
        '</div>';
    });
    if (!reqsHtml) {
      reqsHtml = '<div class="vp-card-req" role="listitem">暂无拆分条件</div>';
    }
    const policy = p.policy;
    let policyHtml = '';
    if (policy) {
      const policyStatus = p.policySelected ? '当前路线' : (p.policyLocked ? '已选择其他路线' : '可选择');
      const policyButtonLabel = p.policySelected ? '当前路线' : (p.policyLocked ? '选择已锁定' : '选择此路线（不可更改）');
      policyHtml =
        '<div class="vp-policy' + (p.policySelected ? ' is-active' : '') + '">' +
          '<div class="vp-policy-head"><strong>' + _escapeHtml(policy.name) + '</strong><span>' + _escapeHtml(policyStatus) + '</span></div>' +
          '<p>' + _escapeHtml(policy.summary) + '</p>' +
          '<div class="vp-policy-effects"><span class="is-benefit">收益：' + _escapeHtml(policy.benefit) + '</span><span class="is-tradeoff">代价：' + _escapeHtml(policy.tradeoff) + '</span></div>' +
          '<button class="vp-policy-btn" type="button" data-victory-policy-id="' + _escapeHtml(p.pathId) + '"' + (p.policySelected || p.policyLocked ? ' disabled' : '') + '>' + _escapeHtml(policyButtonLabel) + '</button>' +
        '</div>';
    }
    html +=
      '<article class="vp-card' + doneClass + '" role="listitem" aria-label="' + _escapeHtml(progressText) + '">' +
        '<div class="vp-card-header">' +
          '<span class="vp-card-icon" aria-hidden="true">' + _escapeHtml(p.icon) + '</span>' +
          '<span class="vp-card-name">' + _escapeHtml(p.name) + '</span>' +
          '<span class="vp-card-pct">' + pctVal + '%</span>' +
        '</div>' +
        '<div class="vp-card-bar-track" role="progressbar" aria-label="' + _escapeHtml(p.name) + '完成度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pctVal + '" aria-valuetext="' + _escapeHtml(progressText) + '">' +
          '<div class="vp-card-bar-fill" style="width:' + pctVal + '%;background:' + _escapeHtml(p.color || 'var(--accent-cyan)') + '"></div>' +
        '</div>' +
        '<div class="vp-card-next"><span>下一条件</span><strong>' + _escapeHtml(nextReqText) + '</strong></div>' +
        policyHtml +
        '<div class="vp-card-reqs" role="list" aria-label="' + _escapeHtml(p.name) + '条件">' + reqsHtml + '</div>' +
      '</article>';
  });
  html += '</div>';
  body.innerHTML = html;
}

function _getVictoryNextRequirement(pathProgress) {
  if (!pathProgress || !Array.isArray(pathProgress.requirements)) return null;
  var pending = pathProgress.requirements.filter(function (req) {
    return req && !req.done;
  });
  if (pending.length === 0) return null;
  return pending.sort(function (left, right) {
    var leftRatio = left.target > 0 ? left.current / left.target : 0;
    var rightRatio = right.target > 0 ? right.current / right.target : 0;
    return rightRatio - leftRatio;
  })[0];
}

function _renderQuestTracker(state) {
  var trackerEl = document.getElementById('quest-tracker');
  if (!trackerEl) return;

  var tracker = Quest.getQuestTracker(state, 2);
  var title = '当前目标';
  var hint = '仅显示任务摘要';

  if (tracker.mode === 'recommended') {
    title = '推荐任务';
    hint = '接取与路线留在任务页';
  } else if (tracker.mode === 'available') {
    title = '可接任务';
    hint = '任务页处理接取';
  } else if (tracker.mode === 'empty') {
    title = '任务状态';
    hint = '暂无可追踪目标';
  }

  var html =
    '<div class="quest-tracker-head">' +
      '<div>' +
        '<div class="quest-tracker-title">' + title + '</div>' +
        '<div class="quest-tracker-hint">' + hint + '</div>' +
      '</div>' +
      '<button id="quest-tracker-open" class="quest-tracker-open-btn" type="button">任务页</button>' +
    '</div>';

  if (tracker.items.length === 0) {
    html += '<div class="quest-tracker-empty">当前没有任务需要处理。继续贸易、探索或等待章节推进。</div>';
  } else {
    var item = tracker.items[0];
    var metaParts = [];

    if (item.progressText) {
      metaParts.push('<span class="quest-tracker-progress-text">' + _escapeHtml(item.progressText) + '</span>');
    }
    if (tracker.items.length > 1) {
      metaParts.push('<span class="quest-tracker-more">另 ' + (tracker.items.length - 1) + ' 项</span>');
    }
    if (metaParts.length === 0) {
      metaParts.push('<span class="quest-tracker-progress-text">前往任务页查看详情</span>');
    }

    html +=
      '<div class="quest-tracker-item quest-tracker-' + _escapeHtml(tracker.mode) + '">' +
        '<div class="quest-tracker-item-head">' +
          '<span class="quest-tracker-item-name">' + _escapeHtml(item.name) + '</span>' +
          '<span class="quest-tracker-badge">' + _escapeHtml(item.statusText) + '</span>' +
        '</div>' +
        '<div class="quest-tracker-summary-line">目标、奖励和路线留在任务页。</div>' +
        '<div class="quest-tracker-meta">' + metaParts.join('') + '</div>' +
      '</div>';
  }

  trackerEl.innerHTML = html;

  var openBtn = document.getElementById('quest-tracker-open');
  if (openBtn) {
    openBtn.addEventListener('click', function () {
      var questNavBtn = document.querySelector('.bottom-nav-btn[data-view="quests"]');
      if (questNavBtn) {
        questNavBtn.click();
        return;
      }

      var questTabBtn = document.querySelector('.tab-btn[data-tab="tab-quest"]');
      if (questTabBtn) questTabBtn.click();
    });
  }
}

function _objectiveText(obj) {
  var targetSystemName = _systemName(obj.targetSystem);
  var goodName = _goodName(obj.goodId);

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
      return '造访不同的星球';
    case 'visit_system':
      return '前往 ' + targetSystemName;
    case 'faction_trade':
      return '在派系区域交易';
    case 'sell_in_faction':
      return '在派系区域卖出 ' + goodName;
    case 'faction_relation':
      return '提升与派系关系';
    case 'survive_days':
      return '保持航行并生存更多天数';
    case 'galaxy_jump':
      return '完成跨星系跃迁';
    default:
      return '完成任务目标';
  }
}

function _systemName(systemId) {
  if (!systemId) return '未知地点';
  var system = findSystem(systemId);
  return system ? system.name : systemId;
}

function _goodName(goodId) {
  if (!goodId) return '货物';
  return _goodNameById[goodId] || goodId;
}
