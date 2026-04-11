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
import * as Quest               from '../systems/quest/QuestSystem.js?v=20260412-questroute1';

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
const getCompanyLevel = PlayerLevels.getCompanyLevel || function (exp) {
  return COMPANY_LEVELS[0];
};

// 缓存最近一次胜利路径进度，避免点击弹窗时重复计算
let _lastProgressList = [];
let _questActions = null;

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

export function setQuestActions(actions) {
  _questActions = actions || null;
}

// ---------------------------------------------------------------------------
// 顶部状态栏
// ---------------------------------------------------------------------------

export function updateStats(state, netWorth) {
  document.getElementById('credits').textContent      = Math.floor(state.credits).toLocaleString();
  document.getElementById('galactic-day').textContent = '第 ' + state.day + ' 天';
  document.getElementById('net-worth').textContent    = Math.floor(netWorth).toLocaleString();

  // 同步船队面板中的镜像元素（无独立 id，通过 class 更新）
  document.querySelectorAll('.hdr-credits-mirror').forEach(function (el) {
    el.textContent = Math.floor(state.credits).toLocaleString();
  });

  // 更新底部状态栏：燃料 / 护盾 / 货舱
  _updateStatusBars(state);

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
  if (locationEl) locationEl.textContent = locationText;
  const locationDescEl = document.getElementById('location-desc');
  if (locationDescEl) locationDescEl.textContent = sys.description;
  const mapLegendLocationEl = document.getElementById('map-legend-location');
  if (mapLegendLocationEl) mapLegendLocationEl.textContent = locationText;

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

  const lvlLineEl = document.getElementById('company-level-line');
  const lvlFillEl = document.getElementById('company-level-fill');
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
}


export function addMessage(text, type) {
  const log = document.getElementById('message-log');
  if (!log) return;
  const div = document.createElement('div');
  div.className   = 'msg msg-' + (type || 'info');
  div.textContent = text;
  log.insertBefore(div, log.firstChild);
  while (log.children.length > 10) log.removeChild(log.lastChild);
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
  if (fuelFillEl) fuelFillEl.style.width = fuelPct + '%';
  if (fuelPctEl)  fuelPctEl.textContent  = fuelPct + '%';

  // 护盾（船体耐久）
  var hullPct = state.maxHull > 0
    ? Math.round(((state.shipHull != null ? state.shipHull : state.maxHull) / state.maxHull) * 100)
    : 100;
  hullPct = Math.max(0, Math.min(100, hullPct));
  var shieldFillEl = document.getElementById('status-shield-fill');
  var shieldPctEl  = document.getElementById('status-shield-pct');
  if (shieldFillEl) shieldFillEl.style.width = hullPct + '%';
  if (shieldPctEl)  shieldPctEl.textContent  = hullPct + '%';

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
  if (cargoFillEl) cargoFillEl.style.width = cargoPct + '%';
  if (cargoPctEl)  cargoPctEl.textContent  = cargoPct + '%';
}


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

function _renderQuestTracker(state) {
  var trackerEl = document.getElementById('quest-tracker');
  if (!trackerEl) return;

  var tracker = Quest.getQuestTracker(state, 2);
  var title = '当前目标';
  var hint = '优先推进进行中的任务';

  if (tracker.mode === 'recommended') {
    title = '下一步建议';
    hint = '先接取一项入门任务，保持成长节奏';
  } else if (tracker.mode === 'available') {
    title = '可接任务';
    hint = '当前没有激活任务，可从任务页接新委托';
  } else if (tracker.mode === 'empty') {
    title = '任务状态';
    hint = '当前章节暂无可追踪目标';
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
    tracker.items.forEach(function (item) {
      var objectiveText = item.primaryObjective ? _objectiveText(item.primaryObjective) : '查看任务详情';
      var progressBar = tracker.mode === 'active'
        ? '<div class="quest-tracker-progress"><div class="quest-tracker-progress-fill" style="width:' + item.progressPercent + '%"></div></div>'
        : '';
      var progressMeta = item.progressText ? '<span class="quest-tracker-progress-text">' + item.progressText + '</span>' : '';
      var actionHtml = '';

      if (tracker.mode !== 'active' && _questActions && typeof _questActions.onAcceptQuest === 'function') {
        actionHtml = '<div class="quest-tracker-actions">' +
          '<button class="quest-tracker-accept-btn" type="button" data-quest-tracker-accept="' + item.id + '">立即接取</button>' +
        '</div>';
      }

      html +=
        '<div class="quest-tracker-item quest-tracker-' + tracker.mode + '">' +
          '<div class="quest-tracker-item-head">' +
            '<span class="quest-tracker-item-name">' + item.name + '</span>' +
            '<span class="quest-tracker-badge">' + item.statusText + '</span>' +
          '</div>' +
          '<div class="quest-tracker-objective">' + objectiveText + '</div>' +
          '<div class="quest-tracker-meta">' +
            '<span class="quest-tracker-reward">💰 ' + (item.rewardSummary.credits || 0) + '</span>' +
            progressMeta +
          '</div>' +
          actionHtml +
          progressBar +
        '</div>';
    });
  }

  trackerEl.innerHTML = html;

  var openBtn = document.getElementById('quest-tracker-open');
  if (openBtn) {
    openBtn.addEventListener('click', function () {
      var questTabBtn = document.querySelector('.tab-btn[data-tab="tab-quest"]');
      if (questTabBtn) questTabBtn.click();
    });
  }

  trackerEl.querySelectorAll('[data-quest-tracker-accept]').forEach(function (btn) {
    btn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (_questActions && typeof _questActions.onAcceptQuest === 'function') {
        _questActions.onAcceptQuest(btn.dataset.questTrackerAccept);
      }
    });
  });
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
