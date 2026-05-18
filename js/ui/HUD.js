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
import * as Quest               from '../systems/quest/QuestSystem.js?v=20260412-questroute2';
import * as GalaxyData          from '../systems/galaxy/GalaxyDataLayer.js';
import * as Exploration         from '../systems/galaxy/ExplorationSystem.js';
import { bindBlockingSurfaceDismiss, hideBlockingSurface, showBlockingSurface } from './SurfaceManager.js?v=20260505-surface4';

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
const HUD_WIDGET_COLLAPSED_CLASS = 'hud-widget-collapsed';
const HUD_WIDGET_ACTIVE_CLASS = 'hud-widget-active';
const DEFAULT_HUD_WIDGET_ID = 'galactic-map';
const STARMAP_RAIL_PANEL_OPEN_EVENT = 'starmap-rail:panel-open';
const STARMAP_RAIL_SOURCE_HUD = 'hud';
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

// 缓存最近一次胜利路径进度，避免点击弹窗时重复计算
let _lastProgressList = [];
let _questActions = null;
let _initialized = false;
let _activeHudWidgetId = DEFAULT_HUD_WIDGET_ID;

// ---------------------------------------------------------------------------
// 初始化：订阅 EventBus 日志事件
// ---------------------------------------------------------------------------

export function init() {
  if (_initialized) return;
  _initialized = true;

  EventBus.on('log:message', function (data) {
    addMessage(data.text, data.type);
  });

  EventBus.on(STARMAP_RAIL_PANEL_OPEN_EVENT, function (data) {
    if (data && data.source === STARMAP_RAIL_SOURCE_HUD) return;
    _collapseActiveHudWidget();
  });

  const vpModal = document.getElementById('victory-modal');

  // 胜利进度按钮 → 打开弹窗并渲染
  const vpBtn = document.getElementById('victory-progress-btn');
  if (vpBtn) {
    vpBtn.addEventListener('click', function () {
      _renderVictoryModal(_lastProgressList);
      showBlockingSurface('victory-modal');
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

  _bindHudWidgetControls();
}

export function setQuestActions(actions) {
  _questActions = actions || null;
}

function _bindHudWidgetControls() {
  _bindHudDockControls();

  var widgets = document.querySelectorAll('[data-hud-widget]');
  if (!widgets || typeof widgets.forEach !== 'function') return;

  widgets.forEach(function (widget) {
    var toggleBtn = widget.querySelector('[data-hud-widget-toggle]');
    if (!toggleBtn || toggleBtn.dataset.hudWidgetBound === 'true') return;

    _syncHudWidgetToggle(widget);
    toggleBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      _setHudWidgetCollapsed(widget, true);
    });
    toggleBtn.dataset.hudWidgetBound = 'true';
  });

  _selectHudWidget(_activeHudWidgetId, { notifyRail: false });
  _setHudWidgetCollapsed(_getHudWidget(_activeHudWidgetId), true);
}

function _setHudWidgetCollapsed(widget, collapsed) {
  if (!widget) return;

  widget.classList.toggle(HUD_WIDGET_COLLAPSED_CLASS, !!collapsed);
  widget.setAttribute('data-hud-widget-state', collapsed ? 'collapsed' : 'open');
  _syncHudWidgetToggle(widget);
  _syncHudDockControls();
}

function _syncHudWidgetToggle(widget) {
  if (!widget) return;

  var toggleBtn = widget.querySelector('[data-hud-widget-toggle]');
  if (!toggleBtn) return;

  var label = widget.getAttribute('aria-label') || '窗口';
  var collapsed = widget.classList.contains(HUD_WIDGET_COLLAPSED_CLASS);
  var actionLabel = collapsed ? '通过左侧控制台重新打开' + label : '关闭' + label;

  toggleBtn.textContent = '×';
  toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  toggleBtn.setAttribute('aria-label', actionLabel);
  toggleBtn.setAttribute('title', actionLabel);
}

function _bindHudDockControls() {
  var dockToggle = document.querySelector('[data-hud-dock-toggle]');
  if (dockToggle && dockToggle.dataset.hudDockBound !== 'true') {
    dockToggle.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      _toggleHudDock();
    });
    dockToggle.dataset.hudDockBound = 'true';
  }

  var panelButtons = document.querySelectorAll('[data-hud-dock-panel]');
  if (!panelButtons || typeof panelButtons.forEach !== 'function') return;

  panelButtons.forEach(function (button) {
    if (button.dataset.hudDockBound === 'true') return;

    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      _selectHudWidget(button.dataset.hudDockPanel);
    });
    button.dataset.hudDockBound = 'true';
  });
}

function _getHudWidget(widgetId) {
  if (!widgetId) return null;
  return document.querySelector('[data-hud-widget="' + widgetId + '"]');
}

function _isHudWidgetOpen(widget) {
  return !!(widget && widget.classList.contains(HUD_WIDGET_ACTIVE_CLASS) && !widget.classList.contains(HUD_WIDGET_COLLAPSED_CLASS));
}

function _collapseActiveHudWidget() {
  var activeWidget = _getHudWidget(_activeHudWidgetId);
  if (!activeWidget) {
    _syncHudDockControls();
    return;
  }

  _setHudWidgetCollapsed(activeWidget, true);
}

function _toggleHudDock() {
  var activeWidget = _getHudWidget(_activeHudWidgetId);
  if (activeWidget && _isHudWidgetOpen(activeWidget)) {
    _setHudWidgetCollapsed(activeWidget, true);
    return;
  }

  _selectHudWidget(_activeHudWidgetId || DEFAULT_HUD_WIDGET_ID);
}

function _selectHudWidget(widgetId, options) {
  var widgets = document.querySelectorAll('[data-hud-widget]');
  if (!widgets || typeof widgets.forEach !== 'function' || widgets.length === 0) return;
  var shouldNotifyRail = !options || options.notifyRail !== false;

  var nextActiveId = widgetId;
  if (!_getHudWidget(nextActiveId)) {
    nextActiveId = widgets[0].dataset.hudWidget || DEFAULT_HUD_WIDGET_ID;
  }
  _activeHudWidgetId = nextActiveId;

  widgets.forEach(function (widget) {
    var isActive = widget.dataset.hudWidget === _activeHudWidgetId;
    widget.classList.toggle(HUD_WIDGET_ACTIVE_CLASS, isActive);
    if (isActive) {
      _setHudWidgetCollapsed(widget, false);
      return;
    }

    widget.classList.remove(HUD_WIDGET_ACTIVE_CLASS);
    widget.classList.add(HUD_WIDGET_COLLAPSED_CLASS);
    widget.setAttribute('data-hud-widget-state', 'collapsed');
    _syncHudWidgetToggle(widget);
  });

  _syncHudDockControls();

  if (shouldNotifyRail && _isHudWidgetOpen(_getHudWidget(_activeHudWidgetId))) {
    EventBus.emit(STARMAP_RAIL_PANEL_OPEN_EVENT, {
      source: STARMAP_RAIL_SOURCE_HUD,
      panelId: _activeHudWidgetId,
    });
  }
}

function _syncHudDockControls() {
  var activeWidget = _getHudWidget(_activeHudWidgetId);
  var dockOpen = _isHudWidgetOpen(activeWidget);
  var dockToggle = document.querySelector('[data-hud-dock-toggle]');
  if (dockToggle) {
    dockToggle.classList.toggle('is-active', dockOpen);
    dockToggle.setAttribute('aria-pressed', dockOpen ? 'true' : 'false');
    dockToggle.setAttribute('aria-label', dockOpen ? '收起 HUD 面板' : '展开 HUD 面板');
    dockToggle.setAttribute('title', dockOpen ? '收起 HUD 面板' : '展开 HUD 面板');
  }

  var panelButtons = document.querySelectorAll('[data-hud-dock-panel]');
  if (!panelButtons || typeof panelButtons.forEach !== 'function') return;

  panelButtons.forEach(function (button) {
    var panelId = button.dataset.hudDockPanel;
    var isSelected = panelId === _activeHudWidgetId;
    var isOpen = isSelected && dockOpen;
    button.classList.toggle('is-selected', isSelected);
    button.classList.toggle('is-active', isOpen);
    button.setAttribute('aria-pressed', isOpen ? 'true' : 'false');
  });
}

// ---------------------------------------------------------------------------
// 顶部状态栏
// ---------------------------------------------------------------------------

export function updateStats(state, netWorth) {
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
  var hdrFuelFillEl = document.getElementById('hdr-fuel-fill');
  var hdrFuelPctEl  = document.getElementById('hdr-fuel-pct');
  if (hdrFuelFillEl) hdrFuelFillEl.style.width = fuelPct + '%';
  if (hdrFuelPctEl)  hdrFuelPctEl.textContent  = fuelPct + '%';

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
  var hdrCargoFillEl = document.getElementById('hdr-cargo-fill');
  var hdrCargoPctEl  = document.getElementById('hdr-cargo-pct');
  if (hdrCargoFillEl) hdrCargoFillEl.style.width = cargoPct + '%';
  if (hdrCargoPctEl)  hdrCargoPctEl.textContent  = cargoPct + '%';

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
  if (repValueEl) repValueEl.textContent = repRank.name + ' ' + reputation.toLocaleString();
  if (repFillEl) repFillEl.style.width = repPct + '%';

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
  _renderHudTargetAction();
  _renderHudNetworkStatus(state, statusSnapshot, netWorth);
}

function _renderHudTargetSurvey(state, sys, targetSurveyEl, targetNextEl) {
  if (!sys) return;

  var planetData = GalaxyData.getPlanetData(sys.id);
  var exploration = planetData && planetData.exploration;
  var summary = Exploration.getSurveySummary(state, sys.id);

  if (!exploration || !summary) {
    _setTextWithTitle(targetSurveyEl, '勘探档案同步中');
    _setTextWithTitle(targetNextEl, '等待航图同步');
    return;
  }

  var scanText = (exploration.scanLevel || 0) > 1
    ? '深度扫描'
    : ((exploration.scanLevel || 0) > 0 ? '已扫描' : '未扫描');
  var poiText = summary.totalPois > 0
    ? (summary.resolvedCount + '/' + summary.totalPois + ' POI')
    : '无 POI';

  _setTextWithTitle(
    targetSurveyEl,
    scanText + ' · ' + poiText + ' · 情报 Lv.' + (summary.intelLevel || 0)
  );

  var nextText = '等待轨道扫描';
  if ((exploration.scanLevel || 0) <= 0) {
    nextText = '下一步：轨道扫描';
  } else if (!exploration.landed) {
    nextText = '下一步：首次着陆';
  } else if (summary.pendingCount > 0) {
    nextText = '下一步：调查 ' + summary.pendingCount + ' 个 POI';
  } else if (summary.completed) {
    nextText = '探索完成 · ' + summary.reportCount + ' 份报告';
  } else {
    nextText = '暂无待办 · 可继续贸易';
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
        var galaxyViewBtn = document.getElementById('galaxy-view-btn');
        if (galaxyViewBtn) galaxyViewBtn.click();
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
      var marketNavBtn = document.querySelector('.bottom-nav-btn[data-view="market"]');
      if (marketNavBtn) marketNavBtn.click();
    });
    openBtn.dataset.bound = 'true';
  }
}

function _renderHudTargetAction() {
  const openBtn = document.getElementById('hud-target-detail-open');
  if (!openBtn) return;

  const orbitScanBtn = document.getElementById('orbit-scan-btn');
  const isPanelOpen = !!(orbitScanBtn && orbitScanBtn.getAttribute('aria-expanded') === 'true');
  const hasTargetAction = !!(
    orbitScanBtn &&
    orbitScanBtn.hidden !== true &&
    orbitScanBtn.getAttribute('aria-hidden') !== 'true' &&
    !isPanelOpen
  );
  const isDisabled = !hasTargetAction || !!orbitScanBtn.disabled;
  const buttonLabel = hasTargetAction
    ? ((orbitScanBtn.textContent || '').trim() || '扫描终端')
    : '扫描终端';
  const buttonTitle = hasTargetAction
    ? (orbitScanBtn.getAttribute('title') || '打开当前航点的扫描终端')
    : '当前航点暂无可打开的扫描终端';

  openBtn.hidden = !hasTargetAction;
  openBtn.textContent = buttonLabel;
  openBtn.disabled = isDisabled;
  openBtn.setAttribute('title', buttonTitle);
  openBtn.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');

  if (openBtn.dataset.bound !== 'true') {
    openBtn.addEventListener('click', function () {
      var scanBtn = document.getElementById('orbit-scan-btn');
      if (!scanBtn || scanBtn.hidden || scanBtn.disabled) return;
      scanBtn.click();
      _renderHudTargetAction();
    });
    openBtn.dataset.bound = 'true';
  }
}

function _renderHudNetworkStatus(state, statusSnapshot, netWorth) {
  const nodesEl = document.getElementById('hud-network-nodes');
  const routesEl = document.getElementById('hud-network-routes');
  const volatilityEl = document.getElementById('hud-network-volatility');

  const visitedCount = Array.isArray(state.visitedSystems) ? state.visitedSystems.length : 1;
  const activeRoutes = Array.isArray(state.fleet)
    ? state.fleet.filter(function (ship) { return !!ship.route; }).length
    : 0;
  const volatility = Math.max(
    0,
    Math.min(
      99,
      Math.round(((statusSnapshot ? statusSnapshot.cargoPct : 0) * 0.08) + ((state.day || 1) % 9) + ((netWorth || 0) > 5000 ? 4 : 1))
    )
  );

  if (nodesEl) nodesEl.textContent = visitedCount + ' / ' + SYSTEMS.length;
  if (routesEl) routesEl.textContent = String(activeRoutes);
  if (volatilityEl) volatilityEl.textContent = volatility.toFixed(1) + '%';
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
    var item = tracker.items[0];
    var metaParts = [];

    if (item.progressText) {
      metaParts.push('<span class="quest-tracker-progress-text">' + item.progressText + '</span>');
    }
    if (tracker.items.length > 1) {
      metaParts.push('<span class="quest-tracker-more">另 ' + (tracker.items.length - 1) + ' 项</span>');
    }
    if (metaParts.length === 0) {
      metaParts.push('<span class="quest-tracker-progress-text">前往任务页查看详情</span>');
    }

    html +=
      '<div class="quest-tracker-item quest-tracker-' + tracker.mode + '">' +
        '<div class="quest-tracker-item-head">' +
          '<span class="quest-tracker-item-name">' + item.name + '</span>' +
          '<span class="quest-tracker-badge">' + item.statusText + '</span>' +
        '</div>' +
        '<div class="quest-tracker-summary-line">完整目标、奖励和路线留在任务页。</div>' +
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
