// js/ui/MapUI.js — 星系地图交互事件绑定（支持星系/星球双层视图 + 市场面板）
// 导出：init, initTabs, init3DCallbacks, refreshGalaxyBtn, triggerArrivalScanPanel, showCurrentSystemScanReveal, openMarket, closeMarket, isMarketOpen,
//        setRefreshMarket, setExplorationActions, getMarketViewSystem, refreshMarketLocation,
//        showMarketOverview, showMarketDetail, refreshPlanetDetail, getMapView, getCurrentGalaxyId
import * as Renderer3D from './Renderer3DAdvanced.js?v=20260513-navguide1';
import * as Faction from '../systems/faction/FactionSystem.js';
import * as GalaxyData from '../systems/galaxy/GalaxyDataLayer.js';
import * as Exploration from '../systems/galaxy/ExplorationSystem.js?v=20260417-exploration20';
import * as Quest from '../systems/quest/QuestSystem.js?v=20260412-questroute2';
import * as EventBus from '../core/EventBus.js';
import * as EventUI from './EventUI.js?v=20260421-scanevent2';
import { GOODS } from '../data/goods.js';
import {
  buildContextualMarketAction,
  getContextualMarketFocus,
} from './MarketFocus.js?v=20260419-marketcta2';
import { getCommandActionAttributes, normalizeCommandAction, renderCommandActionContent } from './CommandAction.js?v=20260510-command1';
import {
  closeAllSecondarySurfaces,
  closePrimarySurface,
  closeSecondarySurface,
  hasBlockingSurfaceOpen,
  isPrimarySurfaceVisible,
  openPrimarySurface,
  openSecondarySurface,
} from './SurfaceManager.js?v=20260510-surfaces1';
import {
  GALAXIES,
  findSystem,
  findGalaxy,
  getSystemsByGalaxy,
  getAccessibleGalaxies,
  getAccessibleSystems,
  getGalaxyAccessState,
}  from '../data/systems.js?v=20260420-balance3';

const _goodsById = GOODS.reduce(function (lookup, good) {
  lookup[good.id] = good;
  return lookup;
}, Object.create(null));

let _tabClickCallback = null;
let _navigationChangeCallback = null;
let _navigationGuideFocus = null;
let _marketOpen = false;
let _smallScreenMql = null;
let _orbitScanPanelOpen = false;
const CURRENT_SYSTEM_SCAN_REVEAL_STEP_2_DELAY = 420;
const CURRENT_SYSTEM_SCAN_REVEAL_STEP_3_DELAY = 980;
const STARMAP_RAIL_PANEL_OPEN_EVENT = 'starmap-rail:panel-open';
const STARMAP_RAIL_SOURCE_ORBIT_SCAN = 'orbit-scan';

// 市场浏览状态
let _marketViewGalaxy = null;
let _marketViewSystem = null;      // 详情模式时选中的星球
let _marketMode = 'detail';
let _pendingMarketPanelFocus = null;
// 市场刷新回调（由 GameManager 注入）
let _refreshMarket = null;          // (mode) => void
let _stateRef = null;               // 用于内部事件引用
let _explorationActions = null;
let _currentSystemScanReveal = null;
let _planetDetailDisclosureState = Object.create(null);
let _selectedPlanetDetailSystem = null;
let _travelActionHandler = null;
let _galaxyJumpActionHandler = null;
let _hoveredGalaxyId = null;
let _mainBindingsInitialized = false;
let _tabBindingsInitialized = false;
let _railMutualExclusionBound = false;

function _normalizeMarketPanelFocus(focus) {
  if (!focus || typeof focus !== 'object') return null;

  var workspaceId = typeof focus.workspaceId === 'string' ? focus.workspaceId.trim() : '';
  if (!workspaceId) return null;

  var subworkspaceId = typeof focus.subworkspaceId === 'string' ? focus.subworkspaceId.trim() : '';
  var marketMode = typeof focus.marketMode === 'string' ? focus.marketMode.trim() : '';
  var goodId = typeof focus.goodId === 'string' ? focus.goodId.trim() : '';
  var tradeAction = typeof focus.tradeAction === 'string' ? focus.tradeAction.trim() : '';
  return {
    workspaceId: workspaceId,
    subworkspaceId: subworkspaceId,
    marketMode: marketMode,
    goodId: goodId,
    tradeAction: tradeAction,
  };
}

function _getScanStatus(stateRef, systemId) {
  if (!stateRef || !systemId) return null;
  if (_explorationActions && typeof _explorationActions.getScanStatus === 'function') {
    return _explorationActions.getScanStatus(systemId);
  }
  return Exploration.getScanStatus(stateRef, systemId);
}

function _getLandingStatus(stateRef, systemId) {
  if (!stateRef || !systemId) return null;
  if (_explorationActions && typeof _explorationActions.getLandingStatus === 'function') {
    return _explorationActions.getLandingStatus(systemId);
  }
  return Exploration.getLandingStatus(stateRef, systemId);
}

function _getPoiStatus(stateRef, systemId, poiId) {
  if (!stateRef || !systemId || !poiId) return null;
  if (_explorationActions && typeof _explorationActions.getPoiStatus === 'function') {
    return _explorationActions.getPoiStatus(systemId, poiId);
  }
  return Exploration.getPoiStatus(stateRef, systemId, poiId);
}

function _appendFlowNote(flow, text) {
  if (!flow || !text) return;
  flow.secondaryNote = flow.secondaryNote ? (flow.secondaryNote + ' ' + text) : text;
}

function _escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _escapeHtmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

function _prefersReducedMotion() {
  return !!(document && document.body && document.body.dataset.motion === 'reduced');
}

function _clearSelectedPlanetDetail(shouldRefresh) {
  _selectedPlanetDetailSystem = null;
  _navigationGuideFocus = null;
  if (Renderer3D.clearSelection) Renderer3D.clearSelection();
  if (shouldRefresh && _stateRef) refreshPlanetDetail(_stateRef);
}

function _setSelectedPlanetDetail(systemId) {
  _selectedPlanetDetailSystem = systemId || null;
}

function _getDefaultArchiveTab(stateRef) {
  var safeState = stateRef || {};
  var activeQuestCount = Array.isArray(safeState.quests) ? safeState.quests.length : 0;
  var availableQuestCount = 0;
  try {
    availableQuestCount = Quest.getAvailableQuests(safeState).length;
  } catch (err) {
    availableQuestCount = 0;
  }
  if (activeQuestCount > 0 || availableQuestCount > 0) return 'tab-quest';
  if ((safeState.currentResearch && safeState.currentResearch.techId) || (safeState.researchOptions || []).length > 0) return 'tab-research';
  return 'tab-quest';
}

function _getGoodName(goodId) {
  var good = goodId ? _goodsById[goodId] : null;
  return good ? good.name : goodId;
}

function _getPlanetDetailDisplayId(stateRef) {
  if (_selectedPlanetDetailSystem) return _selectedPlanetDetailSystem;
  return stateRef ? stateRef.hoveredSystem : null;
}

function _buildPlanetTravelAction(stateRef, sys) {
  if (!stateRef || !sys) return null;

  var playerLevel = stateRef.playerLevel || 1;
  var requiredLevel = sys.minLevel || 1;
  if (playerLevel < requiredLevel) {
    return {
      type: 'travel',
      systemId: sys.id,
      label: '等级不足',
      disabled: true,
      title: '需 Lv.' + requiredLevel + '（当前 Lv.' + playerLevel + '）',
      hint: '达到对应等级后才能前往这颗星球。',
    };
  }

  if (sys.id === stateRef.currentSystem) {
    return {
      type: 'travel',
      systemId: sys.id,
      label: '当前停靠中',
      disabled: true,
      title: '你已经停靠在这颗星球。',
      hint: '这里的详细探索信息已展开，可以直接执行扫描、着陆或 POI 调查。',
    };
  }

  var activeShip = Array.isArray(stateRef.fleet)
    ? stateRef.fleet[stateRef.activeShipIndex || 0]
    : null;
  if (activeShip && activeShip.repairJob && activeShip.repairJob.remainingDays > 0) {
    return {
      type: 'travel',
      systemId: sys.id,
      label: '维修中',
      disabled: true,
      title: '当前飞船仍在维修中',
      hint: '剩余 ' + activeShip.repairJob.remainingDays + ' 天，维修完成后方可出航。',
    };
  }

  var crossGalaxy = sys.galaxyId !== stateRef.currentGalaxy;
  if (crossGalaxy) {
    var galaxyAccess = getGalaxyAccessState(sys.galaxyId, playerLevel, stateRef.researchedTechs || []);
    if (!galaxyAccess.unlocked) {
      var galaxyName = galaxyAccess.galaxy ? galaxyAccess.galaxy.name : '目标星系';
      return {
        type: 'travel',
        systemId: sys.id,
        label: '星系未开放',
        disabled: true,
        title: galaxyName + ' 需 Lv.' + galaxyAccess.requiredLevel + ' 解锁',
        hint: galaxyAccess.techRequired
          ? ('达到 Lv.' + galaxyAccess.requiredLevel + ' 或研究超空间跃迁后，才可切换到该星系。')
          : ('达到 Lv.' + galaxyAccess.requiredLevel + ' 后，才可切换到该星系。'),
      };
    }
  }

  return {
    type: 'travel',
    systemId: sys.id,
    label: crossGalaxy ? '跃迁前往' : '前往该星球',
    disabled: false,
    title: crossGalaxy ? '跨星系跳转到该星球' : '前往该星球',
    hint: crossGalaxy
      ? '单击先看详情，再次点击同一星球或按钮可立即跃迁。'
      : '单击先看详情，再次点击同一星球或按钮可立即前往。',
  };
}

function _travelToPlanet(systemId) {
  if (!_stateRef || !systemId) return false;

  var sys = findSystem(systemId);
  var travelAction = _buildPlanetTravelAction(_stateRef, sys);
  if (!sys || !travelAction || travelAction.disabled) return false;

  _clearSelectedPlanetDetail(false);
  _stateRef.hoveredSystem = null;
  _hoveredGalaxyId = null;

  if (sys.galaxyId !== _stateRef.currentGalaxy) {
    if (_galaxyJumpActionHandler) {
      _galaxyJumpActionHandler(sys.id);
      return true;
    }
    return false;
  }

  if (_travelActionHandler) {
    _travelActionHandler(sys.id);
    return true;
  }
  return false;
}

function _switchToGalaxy(galaxyId) {
  if (!_stateRef || !galaxyId) return false;

  var accessState = getGalaxyAccessState(galaxyId, _stateRef.playerLevel || 1, _stateRef.researchedTechs || []);
  if (!accessState.unlocked) return false;

  _clearSelectedPlanetDetail(false);
  _closeOrbitScanPanel(_stateRef);
  _stateRef.hoveredSystem = null;
  _hoveredGalaxyId = null;
  _stateRef.viewingGalaxy = galaxyId;
  _stateRef.mapView = 'planets';
  _updateGalaxyBtn(_stateRef);
  refreshPlanetDetail(_stateRef);
  return true;
}

function _bindPlanetDetailPanelEvents() {
  var panel = document.getElementById('planet-detail-panel');
  if (!panel || panel.dataset.detailUiBound === 'true') return;

  panel.addEventListener('click', function (event) {
    var galaxyButton = event.target.closest('[data-galaxy-action]');
    if (galaxyButton && panel.contains(galaxyButton)) {
      var galaxyAction = galaxyButton.dataset.galaxyAction;
      var galaxyId = galaxyButton.dataset.galaxyId;

      event.preventDefault();
      event.stopPropagation();

      if (galaxyAction === 'open') {
        _switchToGalaxy(galaxyId);
      }
      return;
    }

    var actionButton = event.target.closest('[data-planet-detail-action]');
    if (!actionButton || !panel.contains(actionButton)) return;

    var action = actionButton.dataset.planetDetailAction;
    var systemId = actionButton.dataset.systemId;

    event.preventDefault();
    event.stopPropagation();

    if (action === 'close-detail') {
      _clearSelectedPlanetDetail(true);
      return;
    }

    if (action === 'travel') {
      _travelToPlanet(systemId);
    }
  });

  panel.addEventListener('click', function (event) {
    var summary = event.target.closest('summary');
    if (!summary || !panel.contains(summary)) return;

    var detail = summary.parentElement;
    if (!detail || detail.tagName !== 'DETAILS') return;

    var sectionId = detail.dataset.detailSection;
    if (!sectionId) return;
    _planetDetailDisclosureState[sectionId] = !detail.open;
  }, true);

  panel.addEventListener('toggle', function (event) {
    var target = event.target;
    if (!target || target.tagName !== 'DETAILS') return;

    var sectionId = target.dataset.detailSection;
    if (!sectionId) return;
    _planetDetailDisclosureState[sectionId] = target.open;
  }, true);

  panel.dataset.detailUiBound = 'true';
}

function _isPlanetDetailSectionOpen(sectionId, defaultOpen) {
  if (Object.prototype.hasOwnProperty.call(_planetDetailDisclosureState, sectionId)) {
    return !!_planetDetailDisclosureState[sectionId];
  }
  return !!defaultOpen;
}

function _buildPlanetDetailChip(text, tone) {
  if (!text) return '';

  var className = 'planet-detail-chip';
  if (tone) className += ' planet-detail-chip--' + tone;
  return '<span class="' + className + '">' + _escapeHtml(text) + '</span>';
}

function _buildPlanetDetailKeyCard(label, value, options) {
  if (!label || !value) return '';

  var opts = options || {};
  var className = 'planet-detail-key-card';
  if (opts.wide) className += ' planet-detail-key-card--wide';
  if (opts.tone) className += ' planet-detail-key-card--' + opts.tone;

  return '<div class="' + className + '">' +
    '<div class="planet-detail-key-label">' + _escapeHtml(label) + '</div>' +
    '<div class="planet-detail-key-value">' + _escapeHtml(value) + '</div>' +
  '</div>';
}

function _buildPlanetDetailField(label, value) {
  if (!label || !value) return '';
  return '<div class="planet-detail-item planet-detail-item--wrap">' +
    '<span class="planet-detail-label">' + _escapeHtml(label) + '</span>' + _escapeHtml(value) +
  '</div>';
}

function _formatTradeGoods(goodIds) {
  if (!Array.isArray(goodIds) || goodIds.length === 0) return '综合供需';
  return goodIds.map(function (goodId) {
    var good = _goodsById[goodId];
    if (!good) return goodId;
    return good.emoji + ' ' + good.name;
  }).join(' · ');
}

function _buildGalaxyTradeProfileRows(galaxy) {
  var tradeProfile = galaxy && galaxy.tradeProfile;
  if (!tradeProfile) return '';

  return '<div class="planet-detail-list">' +
    '<div class="planet-detail-list-row"><span class="planet-detail-badge">主供货物</span><span>' + _escapeHtml(_formatTradeGoods(tradeProfile.exports)) + '</span></div>' +
    '<div class="planet-detail-list-row"><span class="planet-detail-badge">高价收购</span><span>' + _escapeHtml(_formatTradeGoods(tradeProfile.imports)) + '</span></div>' +
  '</div>';
}

function _buildGalaxyTradeProfileSummary(galaxy) {
  var tradeProfile = galaxy && galaxy.tradeProfile;
  if (!tradeProfile) return '综合供需，适合作为中转市场';
  return '主供 ' + _formatTradeGoods(tradeProfile.exports) + '；高价收 ' + _formatTradeGoods(tradeProfile.imports);
}

function _buildPlanetDetailDisclosure(sectionId, title, bodyHtml, options) {
  if (!bodyHtml) return '';

  var opts = options || {};
  var className = 'planet-detail-disclosure';
  if (opts.compact) className += ' planet-detail-disclosure--compact';
  var openAttr = _isPlanetDetailSectionOpen(sectionId, opts.defaultOpen) ? ' open' : '';
  var previewHtml = opts.preview
    ? '<span class="planet-detail-disclosure-preview">' + _escapeHtml(opts.preview) + '</span>'
    : '';

  return '<details class="' + className + '" data-detail-section="' + _escapeHtmlAttr(sectionId) + '"' + openAttr + '>' +
    '<summary class="planet-detail-disclosure-summary">' +
      '<span class="planet-detail-disclosure-title">' + _escapeHtml(title) + '</span>' +
      previewHtml +
      '<span class="planet-detail-disclosure-caret" aria-hidden="true">▾</span>' +
    '</summary>' +
    '<div class="planet-detail-disclosure-body">' + bodyHtml + '</div>' +
  '</details>';
}

function _clearCurrentSystemScanReveal() {
  if (_currentSystemScanReveal && Array.isArray(_currentSystemScanReveal.timerIds)) {
    _currentSystemScanReveal.timerIds.forEach(function (timerId) {
      clearTimeout(timerId);
    });
  }
  _currentSystemScanReveal = null;
}

function _getCurrentSystemScanReveal(stateRef) {
  if (!_currentSystemScanReveal) return null;
  if (!stateRef || stateRef.currentSystem !== _currentSystemScanReveal.systemId) {
    _clearCurrentSystemScanReveal();
    return null;
  }
  return _currentSystemScanReveal;
}

function _setCurrentSystemScanRevealStage(systemId, stage, stateRef) {
  if (!_currentSystemScanReveal || _currentSystemScanReveal.systemId !== systemId) return;
  if (stage <= _currentSystemScanReveal.stage) return;
  _currentSystemScanReveal.stage = stage;
  _renderCurrentSystemExplorationCard(stateRef || _stateRef);
}

function _queueCurrentSystemScanRevealStage(systemId, stage, delay, stateRef) {
  if (!_currentSystemScanReveal || _currentSystemScanReveal.systemId !== systemId) return;
  if (delay <= 0) {
    _setCurrentSystemScanRevealStage(systemId, stage, stateRef);
    return;
  }

  var timerId = setTimeout(function () {
    _setCurrentSystemScanRevealStage(systemId, stage, stateRef);
  }, delay);

  _currentSystemScanReveal.timerIds.push(timerId);
}

function _startCurrentSystemScanReveal(stateRef, systemId, scanResult) {
  if (!stateRef || !systemId || !scanResult || !scanResult.ok) return;

  var planetData = GalaxyData.getPlanetData(systemId);
  var exploration = planetData && planetData.exploration;
  if (!exploration) return;

  _clearCurrentSystemScanReveal();
  _currentSystemScanReveal = {
    systemId: systemId,
    stage: 1,
    messages: (scanResult.msgs || []).slice(0, 4).map(function (message) {
      return {
        text: message && message.text ? message.text : '',
        type: message && message.type ? message.type : 'info',
      };
    }).filter(function (message) {
      return !!message.text;
    }),
    meta: scanResult.meta || {},
    timerIds: [],
  };

  _orbitScanPanelOpen = true;
  _updateOrbitScanButton(stateRef);
  _renderCurrentSystemExplorationCard(stateRef);
  _notifyOrbitScanPanelOpened();

  if (_currentSystemScanReveal.messages.length > 1) {
    _queueCurrentSystemScanRevealStage(
      systemId,
      2,
      _prefersReducedMotion() ? 0 : CURRENT_SYSTEM_SCAN_REVEAL_STEP_2_DELAY,
      stateRef
    );
  }

  _queueCurrentSystemScanRevealStage(
    systemId,
    3,
    _prefersReducedMotion() ? 0 : CURRENT_SYSTEM_SCAN_REVEAL_STEP_3_DELAY,
    stateRef
  );
}

function _getCurrentSystemScanTarget(stateRef) {
  if (!stateRef) return null;
  if (stateRef.mapView !== 'planets') return null;
  if (stateRef.viewingGalaxy !== stateRef.currentGalaxy) return null;

  var sys = findSystem(stateRef.currentSystem);
  var planetData = GalaxyData.getPlanetData(stateRef.currentSystem);
  var exploration = planetData && planetData.exploration;

  if (!sys || !exploration) return null;

  var isUnlocked = (stateRef.playerLevel || 1) >= (sys.minLevel || 1);
  var flow = _getExplorationFlow(stateRef, sys, planetData, true, isUnlocked);
  if (!flow) return null;

  var label = '航点终端';
  var title = flow.title || '打开当前航点终端';

  if (!isUnlocked) {
    label = '🔒 航点锁定';
  } else if ((exploration.scanLevel || 0) <= 0) {
    var scanStatus = _getScanStatus(stateRef, stateRef.currentSystem);
    label = scanStatus && scanStatus.buttonLabel ? scanStatus.buttonLabel : '🔭 轨道扫描';
    title = scanStatus && scanStatus.blockedReason
      ? (flow.title + ' · ' + scanStatus.blockedReason)
      : flow.title;
  } else if (!exploration.landed) {
    label = '🛬 着陆终端';
  } else if (flow.unresolvedPois && flow.unresolvedPois.length > 0) {
    label = '🧭 探索终端 · ' + flow.unresolvedPois.length;
  } else {
    label = '📘 航点档案';
  }

  return {
    systemId: sys.id,
    label: label,
    disabled: false,
    title: title,
  };
}

function _getOrbitScanBadge(label) {
  var match = String(label || '').match(/(\d+)\s*燃料/);
  return match ? match[1] : '';
}

function _setOrbitScanButtonPresentation(btn, label, title) {
  var displayLabel = String(label || '轨道扫描');
  var titleText = title ? (displayLabel + ' · ' + title) : displayLabel;
  var labelEl = typeof btn.querySelector === 'function'
    ? btn.querySelector('[data-starmap-rail-label]')
    : null;

  if (labelEl) {
    labelEl.textContent = displayLabel;
  } else {
    btn.textContent = displayLabel;
  }
  btn.dataset.scanBadge = _getOrbitScanBadge(displayLabel);
  btn.setAttribute('aria-label', displayLabel);
  btn.setAttribute('title', titleText);
}

function _bindStarmapRailMutualExclusion() {
  if (_railMutualExclusionBound) return;
  _railMutualExclusionBound = true;

  EventBus.on(STARMAP_RAIL_PANEL_OPEN_EVENT, function (data) {
    if (data && data.source === STARMAP_RAIL_SOURCE_ORBIT_SCAN) return;
    if (!_orbitScanPanelOpen) return;
    _closeOrbitScanPanel(_stateRef);
  });
}

function _notifyOrbitScanPanelOpened() {
  EventBus.emit(STARMAP_RAIL_PANEL_OPEN_EVENT, {
    source: STARMAP_RAIL_SOURCE_ORBIT_SCAN,
    panelId: 'orbit-scan',
  });
}

_bindStarmapRailMutualExclusion();

function _setOrbitScanPanelOpen(nextOpen, stateRef) {
  var resolvedState = stateRef || _stateRef;
  _orbitScanPanelOpen = !!nextOpen;
  if (!_orbitScanPanelOpen) _clearCurrentSystemScanReveal();
  _updateOrbitScanButton(resolvedState);
  _renderCurrentSystemExplorationCard(resolvedState);
  if (_orbitScanPanelOpen) _notifyOrbitScanPanelOpened();
}

function _closeOrbitScanPanel(stateRef) {
  _setOrbitScanPanelOpen(false, stateRef);
}

function _updateOrbitScanButton(stateRef) {
  var btn = document.getElementById('orbit-scan-btn');
  if (!btn) return;

  var target = _getCurrentSystemScanTarget(stateRef);
  var reveal = _getCurrentSystemScanReveal(stateRef);
  var shouldShow = !!target || (!!reveal && _orbitScanPanelOpen);

  btn.setAttribute('aria-controls', 'current-system-exploration-card');
  btn.hidden = !shouldShow;
  btn.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
  _setOrbitScanButtonPresentation(btn, '轨道扫描', '打开当前轨道扫描终端');
  btn.disabled = false;
  btn.removeAttribute('aria-disabled');
  btn.classList.toggle('active', !!_orbitScanPanelOpen);
  btn.classList.toggle('is-active', !!_orbitScanPanelOpen);
  btn.setAttribute('aria-pressed', _orbitScanPanelOpen ? 'true' : 'false');
  btn.setAttribute('aria-expanded', _orbitScanPanelOpen ? 'true' : 'false');
  btn.removeAttribute('data-system-id');

  if (!shouldShow) return;

  if (target) {
    _setOrbitScanButtonPresentation(btn, target.label || '轨道扫描', target.title || '打开当前轨道扫描终端');
    btn.dataset.systemId = target.systemId || '';
    if (target.disabled) {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
    }
    return;
  }

  _setOrbitScanButtonPresentation(btn, '扫描终端', '查看当前轨道扫描结果');
  if (reveal && reveal.systemId) btn.dataset.systemId = reveal.systemId;
}

function _hideCurrentSystemExplorationCard() {
  var card = document.getElementById('current-system-exploration-card');
  if (!card) return;
  card.innerHTML = '';
  card.classList.remove('visible');
}

function _buildCurrentSystemExplorationCard(flow, sys, reveal) {
  if (!flow || !sys) return '';
  var terminalState = reveal
    ? (reveal.stage >= 3 ? '已同步' : '同步中')
    : flow.phase;

  var flowHtml = reveal
    ? _buildCurrentSystemScanRevealCard(flow, reveal)
    : _buildExplorationFlowCard(flow, {
      cardClass: 'planet-detail-flow-card current-system-flow-card',
      actionClass: 'current-system-action',
    }) + _buildExplorationProgressRow(flow);

  return '<div class="current-system-card-head">' +
    '<div class="current-system-card-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="#rail-icon-scan"></use></svg></div>' +
    '<div class="current-system-card-head-main">' +
      '<div class="current-system-card-kicker">ORBIT SCAN TERMINAL</div>' +
      '<div class="current-system-card-name">' + _escapeHtml(sys.name) + '</div>' +
    '</div>' +
    '<div class="current-system-card-state">' + _escapeHtml(terminalState) + '</div>' +
    '<button class="current-system-card-close hud-widget-close" type="button" data-orbit-scan-close aria-label="关闭轨道扫描终端" title="关闭轨道扫描终端">×</button>' +
  '</div><div class="current-system-card-body">' + flowHtml + '</div>';
}

export function showCurrentSystemScanReveal(stateRef, systemId, scanResult) {
  if (stateRef) _stateRef = stateRef;
  _startCurrentSystemScanReveal(stateRef || _stateRef, systemId, scanResult);
}

function _updateSecretRoutesToggle() {
  var btn = document.getElementById('secret-routes-toggle-btn');
  if (!btn) return;

  var visible = Renderer3D.isSecretRoutesVisible ? Renderer3D.isSecretRoutesVisible() : true;
  btn.classList.toggle('active', !!visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
  btn.textContent = visible ? '🛰 暗线已显示' : '🛰 显示暗线';
  btn.title = visible ? '点击隐藏已发现暗线' : '点击显示已发现暗线';
}

function _bindOrbitScanPanelControls() {
  var card = document.getElementById('current-system-exploration-card');
  if (!card || card.dataset.closeBound === 'true') return;

  card.addEventListener('click', function (event) {
    var closeBtn = event.target.closest('[data-orbit-scan-close]');
    if (!closeBtn || !card.contains(closeBtn)) return;

    event.preventDefault();
    event.stopPropagation();
    _closeOrbitScanPanel();
  });

  card.dataset.closeBound = 'true';
}

/**
 * 注入市场刷新回调（在 GameManager.init 中调用）
 * @param {Function} fn  (mode:'detail') => void  — 刷新市场
 */
export function setRefreshMarket(fn) {
  _refreshMarket = fn;
}

export function setExplorationActions(actions) {
  _explorationActions = actions || null;
  _bindExplorationActionEvents();
}

/**
 * 获取市场当前查看的星球 ID（供 GameManager 传给 MarketUI.render）
 * @param {object} state
 * @returns {string}
 */
export function getMarketViewSystem(state) {
  return _marketViewSystem || state.currentSystem;
}

/** 获取市场当前查看的星系 ID */
export function getMarketViewGalaxy(state) {
  return _marketViewGalaxy || state.currentGalaxy;
}

/** 获取当前市场模式 */
export function getMarketMode() {
  return _marketMode;
}

export function consumePendingMarketPanelFocus() {
  var focus = _pendingMarketPanelFocus;
  _pendingMarketPanelFocus = null;
  return focus;
}

/** 获取当前地图视图模式 */
export function getMapView() {
  return _stateRef ? _stateRef.mapView : 'planets';
}

/** 获取当前查看的星系ID */
export function getCurrentGalaxyId() {
  return _stateRef ? (_stateRef.viewingGalaxy || _stateRef.currentGalaxy) : 'milky_way';
}

/** 切换到总览模式 */
export function showMarketOverview() {
  _marketMode = 'overview';
  _marketViewSystem = null;
  if (_refreshMarket) _refreshMarket('overview');
}

/** 切换到详情模式 */
export function showMarketDetail(systemId) {
  _marketMode = 'detail';
  _marketViewSystem = systemId;
  if (_refreshMarket) _refreshMarket('detail');
}

/**
 * 绑定星系地图的鼠标交互
 * @param {object}   stateRef    游戏状态对象（引用）
 * @param {Function} onTravel    (systemId: string) => void
 * @param {Function} onGalaxyJump (galaxyId: string) => void  跨星系跳转回调
 */
export function init(stateRef, onTravel, onGalaxyJump) {
  // 保存状态引用供底部导航使用
  _stateRef = stateRef;
  _clearSelectedPlanetDetail(false);
  _bindStarmapRailMutualExclusion();
  _bindExplorationActionEvents();
  _bindOrbitScanPanelControls();

  if (!_mainBindingsInitialized) {
    _mainBindingsInitialized = true;

    // 星系视图切换按钮
    const btn = document.getElementById('galaxy-view-btn');
    if (btn) {
      btn.addEventListener('click', function () {
        var currentState = _stateRef || stateRef;
        if (!currentState) return;

        closeMarket();
        _clearSelectedPlanetDetail(false);
        _closeOrbitScanPanel(currentState);
        if (currentState.mapView === 'galaxies') {
          currentState.mapView = 'planets';
          currentState.viewingGalaxy = currentState.currentGalaxy;
        } else {
          currentState.mapView = 'galaxies';
        }
        _updateGalaxyBtn(currentState);
        refreshPlanetDetail(currentState);
      });
    }

    const secretRoutesBtn = document.getElementById('secret-routes-toggle-btn');
    if (secretRoutesBtn) {
      secretRoutesBtn.addEventListener('click', function () {
        const visible = Renderer3D.isSecretRoutesVisible ? Renderer3D.isSecretRoutesVisible() : true;
        if (Renderer3D.setSecretRoutesVisible) {
          Renderer3D.setSecretRoutesVisible(!visible);
        }
        _updateSecretRoutesToggle();
      });
    }

    const orbitScanBtn = document.getElementById('orbit-scan-btn');
    if (orbitScanBtn) {
      orbitScanBtn.addEventListener('click', function () {
        var currentState = _stateRef || stateRef;
        var target = _getCurrentSystemScanTarget(currentState);
        if (!target) {
          _closeOrbitScanPanel(currentState);
          return;
        }
        _setOrbitScanPanelOpen(!_orbitScanPanelOpen, currentState);
      });
    }

    // 市场按钮
    const marketBtn = document.getElementById('market-view-btn');
    const marketCloseBtn = document.getElementById('market-close-btn');
    if (marketBtn) {
      marketBtn.addEventListener('click', function () {
        var currentState = _stateRef || stateRef;
        if (_marketOpen) {
          closeMarket();
          _setBottomNavActive('starmap');
        } else if (currentState) {
          _closeAllOverlayPanels();
          openMarket(currentState);
          _setBottomNavActive('market');
        }
      });
    }
    if (marketCloseBtn) {
      marketCloseBtn.addEventListener('click', function () {
        closeMarket();
        _setBottomNavActive('starmap');
      });
    }

    // 3D视图默认启用，按钮隐藏
    const toggle3DBtn = document.getElementById('map-3d-toggle-btn');
    if (toggle3DBtn) {
      toggle3DBtn.style.display = 'none';
    }
  }

  _updateSecretRoutesToggle();
  _updateOrbitScanButton(stateRef);
  refreshPlanetDetail(stateRef);
}

/**
 * 初始化3D地图回调（由 GameManager 在 init 后调用）
 */
export function init3DCallbacks(stateRef, onTravel, onGalaxyJump) {
  // 确保3D渲染器已激活
  if (!Renderer3D.isActive()) {
    Renderer3D.toggleView();
  }
  _travelActionHandler = onTravel || null;
  _galaxyJumpActionHandler = onGalaxyJump || null;
  window._mapHoverCallback = function(data) {
    var nextHoveredSystem = null;
    var nextHoveredGalaxy = null;
    if (data) {
      if (data.type === 'system') nextHoveredSystem = data.id;
      if (data.type === 'galaxy') nextHoveredGalaxy = data.id;
    }

    var changed = stateRef.hoveredSystem !== nextHoveredSystem || _hoveredGalaxyId !== nextHoveredGalaxy;
    stateRef.hoveredSystem = nextHoveredSystem;
    _hoveredGalaxyId = nextHoveredGalaxy;

    if (changed) {
      refreshPlanetDetail(stateRef);
    }
  };
  window._mapClickCallback = function(systemId) {
    const sys = findSystem(systemId);
    if (!sys) return;
    _hoveredGalaxyId = null;

    if (_selectedPlanetDetailSystem !== systemId) {
      _setSelectedPlanetDetail(systemId);
      stateRef.hoveredSystem = systemId;
      refreshPlanetDetail(stateRef);
      return;
    }

    _travelToPlanet(systemId);
  };
  window._mapBackgroundClickCallback = function() {
    if (!_selectedPlanetDetailSystem) return;
    _clearSelectedPlanetDetail(true);
  };
  window._galaxyClickCallback = function(galaxyId) {
    _switchToGalaxy(galaxyId);
  };
  window._switchToGalaxyView = function() {
    _clearSelectedPlanetDetail(false);
    _hoveredGalaxyId = null;
    stateRef.mapView = 'galaxies';
    _updateGalaxyBtn(stateRef);
    refreshPlanetDetail(stateRef);
  };
}

function _updateGalaxyBtn(stateRef) {
  const btn = document.getElementById('galaxy-view-btn');
  if (!btn) return;
  if (stateRef.mapView === 'galaxies') {
    btn.textContent = '📍 返回星球';
  } else if (stateRef.viewingGalaxy !== stateRef.currentGalaxy) {
    btn.textContent = '🏠 返回当前星系';
  } else {
    btn.textContent = '🌌 星系总览';
  }
}

function _showArrivalScanPrompt(stateRef) {
  if (!stateRef || !_explorationActions || typeof _explorationActions.onScan !== 'function') return false;

  var systemId = stateRef.currentSystem;
  var sys = findSystem(systemId);
  var scanStatus = _getScanStatus(stateRef, systemId);
  if (!sys || !scanStatus) return false;

  var canScan = !!scanStatus.canScan;
  var description = '已进入「' + sys.name + '」轨道。\n' +
    (scanStatus.detailText || '确认后会立即完成本地扫描。');

  if (!canScan && scanStatus.blockedReason) {
    description += '\n' + scanStatus.blockedReason;
  } else if (canScan) {
    description += '\n确认后会直接写入扫描结果，不再展开独立探索面板。';
  }

  EventUI.showEvent({
    icon: scanStatus.scanMode === 'deep' ? '🔭' : '📡',
    title: sys.name + ' · ' + (scanStatus.scanModeLabel || '轨道扫描'),
    description: description,
    metaHidden: true,
    choices: [{
      text: canScan
        ? (scanStatus.actionLabel || '执行轨道扫描')
        : '知道了',
      tooltip: canScan
        ? '确认后立即完成扫描。'
        : (scanStatus.blockedReason || '当前无法执行扫描。'),
    }],
  }, function () {
    if (canScan) {
      _explorationActions.onScan(systemId);
    }
  });

  return true;
}

/** 外部调用刷新按钮状态 */
export function refreshGalaxyBtn(stateRef) {
  _updateGalaxyBtn(stateRef);
  _updateSecretRoutesToggle();
  _updateOrbitScanButton(stateRef);
}

export function triggerArrivalScanPanel(stateRef) {
  if (!stateRef) return false;

  _stateRef = stateRef;
  _clearSelectedPlanetDetail(false);
  stateRef.hoveredSystem = null;
  _clearCurrentSystemScanReveal();
  _orbitScanPanelOpen = false;
  _updateOrbitScanButton(stateRef);
  _renderCurrentSystemExplorationCard(stateRef);

  if (!_getCurrentSystemScanTarget(stateRef)) return false;
  return _showArrivalScanPrompt(stateRef);
}

function _getSafetyLabel(score) {
  if (score >= 80) return '安定';
  if (score >= 60) return '可控';
  if (score >= 40) return '紧张';
  return '危险';
}

function _bindExplorationActionContainer(containerId) {
  var container = document.getElementById(containerId);
  if (!container || container.dataset.bound === 'true') return;

  container.addEventListener('click', function (event) {
    var button = event.target.closest('[data-exploration-action]');
    if (!button || button.disabled || !_explorationActions || !container.contains(button)) return;

    var action = button.dataset.explorationAction;
    var systemId = button.dataset.systemId;
    var poiId = button.dataset.poiId;

    event.preventDefault();
    event.stopPropagation();

    if (action === 'scan' && _explorationActions.onScan) {
      _explorationActions.onScan(systemId);
      return;
    }
    if (action === 'land' && _explorationActions.onLand) {
      _clearCurrentSystemScanReveal();
      _explorationActions.onLand(systemId);
      return;
    }
    if (action === 'market') {
      openMarketSystemPanel(_stateRef, systemId, {
        workspaceId: button.dataset.marketWorkspaceId,
        subworkspaceId: button.dataset.marketSubworkspaceId,
        marketMode: button.dataset.marketMode || '',
      });
      return;
    }
    if (action === 'poi' && _explorationActions.onExplorePoi) {
      _clearCurrentSystemScanReveal();
      _explorationActions.onExplorePoi(systemId, poiId);
    }
  });

  container.dataset.bound = 'true';
}

function _bindExplorationActionEvents() {
  _bindExplorationActionContainer('planet-detail-panel');
  _bindExplorationActionContainer('current-system-exploration-card');
  _bindPlanetDetailPanelEvents();
  _bindOrbitScanPanelControls();
}

function _getExplorationFlow(stateRef, sys, planetData, isCurrentSystem, isUnlocked) {
  var exploration = planetData && planetData.exploration;
  if (!exploration) return null;

  var discoveredPois = (exploration.pois || []).filter(function (poi) { return poi.discovered; });
  var unresolvedPois = _orderPoisForExploration(exploration, discoveredPois.filter(function (poi) { return !poi.resolved; }));
  var resolvedPois = discoveredPois.filter(function (poi) { return poi.resolved; });
  var discoveredRoutes = (exploration.secretRoutes || []).filter(function (route) { return route.discovered; });
  var scanProgressStatus = exploration.scanLevel > 1 ? '完成' : (exploration.scanLevel > 0 ? '已扫描' : '未扫描');
  var landingProgressStatus = exploration.landed ? '已着陆' : '未着陆';
  var totalPois = (exploration.pois || []).length;
  var flow = {
    exploration: exploration,
    discoveredPois: discoveredPois,
    unresolvedPois: unresolvedPois,
    resolvedPois: resolvedPois,
    discoveredRoutes: discoveredRoutes,
    resolvedCount: resolvedPois.length,
    totalPois: totalPois,
    scanStatus: scanProgressStatus,
    landingStatus: landingProgressStatus,
    roleTag: isCurrentSystem ? '当前停靠' : '悬停预览',
    phase: '',
    title: '',
    detail: '',
    nextAction: null,
    secondaryNote: '',
  };

  if (!isUnlocked) {
    flow.phase = '尚未解锁';
    flow.title = '等级不足，暂时无法展开本地探索';
    flow.detail = '达到 Lv.' + (sys.minLevel || 1) + ' 后才能在这颗星球执行扫描、着陆与 POI 调查。';
    return flow;
  }

  if (!isCurrentSystem) {
    flow.phase = '抵达后可继续';
    if (exploration.scanLevel <= 0) {
      flow.title = '抵达后先执行轨道扫描';
      flow.detail = '扫描会揭示地表探索点，帮助你判断这颗星球是否值得投入时间。';
    } else if (!exploration.landed) {
      flow.title = '扫描已完成，抵达后可申请首次着陆';
      flow.detail = '当前已发现 ' + discoveredPois.length + ' 个探索点，着陆后才能展开地面调查。';
    } else if (unresolvedPois.length > 0) {
      flow.title = '抵达后可继续调查 ' + unresolvedPois.length + ' 个 POI';
      flow.detail = '这颗星球还有未完成的探索内容，靠近后即可继续推进。';
    } else if (discoveredRoutes.length > 0) {
      flow.title = '本地探索已完成';
      flow.detail = '这里已解锁 ' + discoveredRoutes.length + ' 条秘密航线，后续航行会自动享受燃料折扣。';
    } else {
      flow.title = '本地探索已完成';
      flow.detail = '当前没有待处理的探索行动，抵达后可直接前往市场或继续航行。';
    }
    return flow;
  }

  if (exploration.scanLevel <= 0) {
    var scanPreview = _getScanStatus(stateRef, sys.id);
    flow.phase = '步骤 1 / 3';
    flow.title = '先执行轨道扫描';
    flow.detail = scanPreview && scanPreview.detailText
      ? scanPreview.detailText
      : '扫描会揭示全部地表 POI，并决定是否值得继续着陆。';
    flow.nextAction = {
      type: 'scan',
      systemId: sys.id,
      label: scanPreview && scanPreview.actionLabel ? scanPreview.actionLabel : '执行轨道扫描',
      disabled: !!(scanPreview && !scanPreview.canScan),
      title: scanPreview && scanPreview.blockedReason ? scanPreview.blockedReason : '',
    };
    if (scanPreview && scanPreview.blockedReason && !scanPreview.canScan) {
      flow.secondaryNote = scanPreview.blockedReason;
    }
    return flow;
  }

  if (!exploration.landed) {
    var landingPreview = _getLandingStatus(stateRef, sys.id);
    flow.phase = '步骤 2 / 3';
    flow.title = '扫描完成，准备首次着陆';
    flow.detail = landingPreview && landingPreview.detailText
      ? landingPreview.detailText
      : ('已发现 ' + discoveredPois.length + ' 个探索点，着陆后即可展开地面调查。');
    flow.nextAction = {
      type: 'land',
      systemId: sys.id,
      label: landingPreview && landingPreview.actionLabel ? landingPreview.actionLabel : '申请首次着陆',
      disabled: !!(landingPreview && !landingPreview.canLand),
      title: landingPreview && landingPreview.blockedReason ? landingPreview.blockedReason : '',
    };
    if (landingPreview && landingPreview.blockedReason && !landingPreview.canLand) {
      flow.secondaryNote = landingPreview.blockedReason;
    }
    return flow;
  }

  if (unresolvedPois.length > 0) {
    var nextPoi = unresolvedPois[0];
    var nextPoiPreview = _getPoiStatus(stateRef, sys.id, nextPoi.id);
    flow.phase = '步骤 3 / 3';
    flow.title = '继续调查地表探索点';
    flow.detail = nextPoiPreview && nextPoiPreview.detailText
      ? (nextPoi.icon + ' ' + nextPoi.name + '：' + nextPoiPreview.detailText)
      : ('优先处理 ' + nextPoi.icon + ' ' + nextPoi.name + '，完成后会自动切换到下一个待办。');
    flow.nextAction = {
      type: 'poi',
      systemId: sys.id,
      poiId: nextPoi.id,
      label: nextPoiPreview && nextPoiPreview.actionLabel ? nextPoiPreview.actionLabel : ('调查 ' + nextPoi.icon + ' ' + nextPoi.name),
      disabled: !!(nextPoiPreview && !nextPoiPreview.canExplore),
      title: nextPoiPreview && nextPoiPreview.blockedReason ? nextPoiPreview.blockedReason : '',
    };
    if (nextPoiPreview && nextPoiPreview.blockedReason && !nextPoiPreview.canExplore) {
      _appendFlowNote(flow, nextPoiPreview.blockedReason);
    }
    if (unresolvedPois.length > 1) {
      _appendFlowNote(flow, '当前还有 ' + unresolvedPois.length + ' 个 POI 待调查，悬停面板中可直接挑选具体目标。');
    }
    return flow;
  }

  flow.phase = '探索完成';
  if (discoveredRoutes.length > 0) {
    flow.title = '本地探索完成，暗线已接入航图';
    flow.detail = '当前已解锁 ' + discoveredRoutes.length + ' 条秘密航线，之后从这里出发会自动应用燃料折扣。';
  } else {
    flow.title = '本地探索完成';
    flow.detail = '当前星球没有待处理的探索行动，可以继续贸易或前往下一颗星球。';
  }
  return flow;
}

function _orderPoisForExploration(exploration, pois) {
  if (!Array.isArray(pois) || pois.length <= 1) return pois || [];

  var priorityPoiId = exploration && exploration.scanPriorityPoiId;
  return pois.slice().sort(function (left, right) {
    if (priorityPoiId) {
      if (left.id === priorityPoiId && right.id !== priorityPoiId) return -1;
      if (right.id === priorityPoiId && left.id !== priorityPoiId) return 1;
    }
    if (left.resolved !== right.resolved) return left.resolved ? 1 : -1;
    return 0;
  });
}

function _buildExplorationActionButton(action, extraClass) {
  if (!action) return '';

  var commandAction = normalizeCommandAction(action);
  var classes = 'planet-detail-action planet-detail-action--command command-action-btn';
  if (extraClass) classes += ' ' + extraClass;
  var disabledAttr = commandAction.disabled ? ' disabled aria-disabled="true"' : '';
  var titleAttr = commandAction.title ? ' title="' + _escapeHtmlAttr(commandAction.title) + '"' : '';
  var commandAttrs = getCommandActionAttributes(commandAction, _escapeHtmlAttr);
  var marketDataset = '';

  if (commandAction.marketWorkspaceId) {
    marketDataset += ' data-market-workspace-id="' + _escapeHtmlAttr(commandAction.marketWorkspaceId) + '"';
  }
  if (commandAction.marketSubworkspaceId) {
    marketDataset += ' data-market-subworkspace-id="' + _escapeHtmlAttr(commandAction.marketSubworkspaceId) + '"';
  }
  if (commandAction.marketFocusLabel) {
    marketDataset += ' data-market-focus-label="' + _escapeHtmlAttr(commandAction.marketFocusLabel) + '"';
  }
  if (commandAction.marketMode) {
    marketDataset += ' data-market-mode="' + _escapeHtmlAttr(commandAction.marketMode) + '"';
  }

  return '<button class="' + classes + '" data-exploration-action="' + _escapeHtmlAttr(commandAction.type || '') + '" data-system-id="' + _escapeHtmlAttr(commandAction.systemId || '') + '"' +
    (commandAction.poiId ? ' data-poi-id="' + _escapeHtmlAttr(commandAction.poiId) + '"' : '') + marketDataset + commandAttrs + disabledAttr + titleAttr + '>' +
    renderCommandActionContent(commandAction, _escapeHtml) +
  '</button>';
}

function _buildExplorationFlowCard(flow, options) {
  if (!flow) return '';

  var className = (options && options.cardClass) || 'planet-detail-flow-card';
  var includeAction = !options || options.includeAction !== false;
  var actionHtml = includeAction && flow.nextAction
    ? '<div class="planet-detail-actions">' + _buildExplorationActionButton(flow.nextAction, options && options.actionClass) + '</div>'
    : '';
  var noteHtml = flow.secondaryNote
    ? '<div class="planet-detail-note">' + flow.secondaryNote + '</div>'
    : '';

  return '<div class="' + className + '">' +
    '<div class="planet-detail-flow-kicker">' + flow.phase + '</div>' +
    '<div class="planet-detail-flow-title">' + flow.title + '</div>' +
    '<div class="planet-detail-flow-text">' + flow.detail + '</div>' +
    actionHtml +
    noteHtml +
  '</div>';
}

function _buildCurrentSystemScanRevealCard(flow, reveal) {
  if (!flow || !reveal) return '';

  var visibleMessageCount = reveal.stage >= 2 ? reveal.messages.length : Math.min(1, reveal.messages.length);
  var messageHtml = reveal.messages.slice(0, visibleMessageCount).map(function (message) {
    return '<div class="current-system-scan-reveal-line current-system-scan-reveal-line--' + (message.type || 'info') + '">' +
      _escapeHtml(message.text) +
    '</div>';
  }).join('');
  var detailText = reveal.stage >= 3
    ? flow.detail
    : '扫描结果会自动写入探索终端，无需手动继续点击。';
  var statusText = '';
  if (reveal.stage === 1) {
    statusText = '正在解包第一批轨道回传数据…';
  } else if (reveal.stage === 2) {
    statusText = '着陆窗口正在建立，下一步入口即将开放。';
  } else if (flow.secondaryNote) {
    statusText = flow.secondaryNote;
  }
  var statusHtml = statusText
    ? '<div class="current-system-scan-reveal-status">' + _escapeHtml(statusText) + '</div>'
    : '';
  var actionHtml = reveal.stage >= 3 && flow.nextAction
    ? '<div class="planet-detail-actions current-system-scan-reveal-actions">' +
        _buildExplorationActionButton(flow.nextAction, 'current-system-action current-system-scan-reveal-action') +
      '</div>'
    : '';
  var progressHtml = reveal.stage >= 2
    ? _buildExplorationProgressRow(flow)
    : '';
  var scanMetaHtml = reveal.stage >= 1
    ? _buildCurrentSystemScanMeta(reveal.meta || {})
    : '';

  return '<div class="current-system-scan-dashboard">' +
    '<section class="planet-detail-flow-card current-system-flow-card current-system-flow-card--reveal current-system-scan-primary">' +
      '<div class="planet-detail-flow-kicker">' + (reveal.stage >= 3 ? flow.phase : '扫描结果同步中') + '</div>' +
      '<div class="planet-detail-flow-title">' + (reveal.stage >= 3 ? flow.title : '轨道扫描完成') + '</div>' +
      '<div class="planet-detail-flow-text">' + detailText + '</div>' +
      statusHtml +
      actionHtml +
    '</section>' +
    '<aside class="current-system-scan-side">' +
      scanMetaHtml +
      (progressHtml ? '<div class="current-system-scan-progress">' + progressHtml + '</div>' : '') +
    '</aside>' +
    '<section class="current-system-scan-log">' +
      '<div class="current-system-scan-log-head">' +
        '<span>扫描日志</span>' +
        '<strong>' + visibleMessageCount + '/' + reveal.messages.length + '</strong>' +
      '</div>' +
      '<div class="current-system-scan-reveal-list">' + messageHtml + '</div>' +
    '</section>' +
  '</div>';
}

function _buildCurrentSystemScanMetric(label, value, note, tone) {
  var className = 'current-system-scan-metric' + (tone ? (' current-system-scan-metric--' + tone) : '');
  return '<div class="' + className + '">' +
    '<span class="current-system-scan-metric-label">' + _escapeHtml(label) + '</span>' +
    '<strong class="current-system-scan-metric-value">' + _escapeHtml(value) + '</strong>' +
    (note ? '<span class="current-system-scan-metric-note">' + _escapeHtml(note) + '</span>' : '') +
  '</div>';
}

function _buildCurrentSystemScanMeta(meta) {
  if (!meta) return '';

  var chips = [];
  if (meta.scanSignalGrade) {
    chips.push(_buildCurrentSystemScanMetric('扫描评级', meta.scanSignalGrade, '轨道回传质量', 'grade'));
  }
  if (meta.scanYield) {
    var yieldParts = [];
    if (meta.scanYield.credits) yieldParts.push('+' + meta.scanYield.credits + ' 积分');
    if (meta.scanYield.fuel) yieldParts.push('+' + meta.scanYield.fuel + ' 燃料');
    if (meta.scanYield.reputation) yieldParts.push('+' + meta.scanYield.reputation + ' 声望');
    if (meta.scanYield.researchDays) yieldParts.push('科研 +' + meta.scanYield.researchDays + ' 天');
    if (yieldParts.length > 0) {
      chips.push(_buildCurrentSystemScanMetric('回收收益', yieldParts.join(' / '), '已自动入账', 'gain'));
    }
  }
  if (meta.scanLandingFeeDiscount) {
    chips.push(_buildCurrentSystemScanMetric('着陆窗口', '-' + Math.round(meta.scanLandingFeeDiscount * 100) + '%', '费用校准', 'discount'));
  }
  if (meta.scanDirective && meta.scanDirective.poiName) {
    chips.push(_buildCurrentSystemScanMetric('优先目标', meta.scanDirective.poiName, '建议优先跟进', 'priority'));
  }

  return chips.length > 0
    ? '<div class="current-system-scan-metric-grid">' + chips.join('') + '</div>'
    : '';
}

function _buildExplorationProgressRow(flow) {
  return '<div class="planet-detail-progress-row">' +
    '<span class="planet-detail-progress-pill">扫描：' + flow.scanStatus + '</span>' +
    '<span class="planet-detail-progress-pill">着陆：' + flow.landingStatus + '</span>' +
    '<span class="planet-detail-progress-pill">POI：' + flow.resolvedCount + '/' + flow.totalPois + '</span>' +
    '<span class="planet-detail-progress-pill">暗线：' + flow.discoveredRoutes.length + '</span>' +
  '</div>';
}

function _buildSurveyMetricCard(label, value, note, extraClass) {
  var className = 'planet-detail-survey-card' + (extraClass ? (' ' + extraClass) : '');
  var noteHtml = note
    ? '<div class="planet-detail-survey-note">' + _escapeHtml(note) + '</div>'
    : '';
  return '<div class="' + className + '">' +
    '<div class="planet-detail-survey-label">' + _escapeHtml(label) + '</div>' +
    '<div class="planet-detail-survey-value">' + _escapeHtml(value) + '</div>' +
    noteHtml +
  '</div>';
}

function _buildSurveySummaryBlock(summary, systemId, options) {
  if (!summary) return '';

  var opts = options || {};

  var threatClass = summary.threatLevel === 'high'
    ? 'planet-detail-survey-card--danger'
    : (summary.threatLevel === 'medium' ? 'planet-detail-survey-card--warning' : 'planet-detail-survey-card--stable');
  var rewardValue = summary.completionBonusClaimed ? '已领取' : summary.completionRewardLabel;
  var rewardNote = summary.completionBonusClaimed
    ? '本地完探奖励已结算'
    : '完成全部 POI 后自动发放';
  var scanMetricHtml = summary.scanSignalGrade
    ? _buildSurveyMetricCard(
      '扫描评级',
      summary.scanSignalGrade,
      summary.scanLandingFeeDiscount > 0 ? ('着陆费 -' + Math.round(summary.scanLandingFeeDiscount * 100) + '%') : '已完成轨道测绘'
    )
    : '';
  var marketActionHtml = '';

  if (_stateRef && systemId) {
    var marketAction = buildContextualMarketAction(_stateRef, systemId, {
      context: 'survey',
    });
    marketAction.type = 'market';
    marketAction.title = '打开 ' + (marketAction.systemName || '当前节点') + ' 的 ' + (marketAction.marketFocusLabel || '市场页');
    marketActionHtml = '<div class="planet-detail-actions planet-detail-survey-actions">' +
      _buildExplorationActionButton(marketAction) +
      (marketAction.contextHint ? '<div class="planet-detail-note">' + _escapeHtml(marketAction.contextHint) + '</div>' : '') +
    '</div>';
  }

  return '<div class="planet-detail-subsection">' +
    (opts.hideHeading ? '' : '<div class="planet-detail-subtitle">探索简报</div>') +
    '<div class="planet-detail-survey-grid">' +
      _buildSurveyMetricCard('威胁评级', summary.threatLabel, '决定行动节奏', threatClass) +
      _buildSurveyMetricCard('机会焦点', summary.opportunityLabel, '决定收益侧重') +
      _buildSurveyMetricCard('情报等级', 'Lv.' + summary.intelLevel, '已归档 ' + summary.reportCount + ' 份') +
      scanMetricHtml +
      _buildSurveyMetricCard('完探奖励', rewardValue, rewardNote) +
    '</div>' +
    marketActionHtml +
  '</div>';
}

function _buildSurveyReportsBlock(summary, options) {
  if (!summary || !Array.isArray(summary.reports) || summary.reports.length === 0) return '';

  var opts = options || {};

  var reportHtml = summary.reports.map(function (report) {
    var metaParts = [];
    if (report.badge) metaParts.push(report.badge);
    if (report.day) metaParts.push('D' + report.day);
    return '<div class="planet-detail-report-card">' +
      '<div class="planet-detail-report-head">' +
        '<span class="planet-detail-report-title">' + _escapeHtml((report.icon || '📘') + ' ' + (report.title || '勘探报告')) + '</span>' +
        '<span class="planet-detail-report-badge">' + _escapeHtml(metaParts.join(' · ') || '勘探报告') + '</span>' +
      '</div>' +
      '<div class="planet-detail-report-text">' + _escapeHtml(report.detail || '') + '</div>' +
    '</div>';
  }).join('');

  return '<div class="planet-detail-subsection">' +
    (opts.hideHeading ? '' : '<div class="planet-detail-subtitle">调查结论</div>') +
    '<div class="planet-detail-report-list">' + reportHtml + '</div>' +
  '</div>';
}

function _buildPlanetArchiveDisclosure(info) {
  if (!info) return '';

  var archiveHtml = '<div class="planet-detail-archive-grid">' +
    _buildPlanetDetailField('居民', info.races) +
    _buildPlanetDetailField('人口', info.population) +
    _buildPlanetDetailField('政体', info.government) +
    _buildPlanetDetailField('治安', info.safety) +
    _buildPlanetDetailField('解锁', info.lockText) +
  '</div>';

  return _buildPlanetDetailDisclosure('archive', '星球档案', archiveHtml, {
    preview: info.population,
    defaultOpen: false,
  });
}

function _buildNavigationGuideBanner(guideFocus, sys) {
  if (!guideFocus || !sys) return '';

  var goodName = guideFocus.goodId ? _getGoodName(guideFocus.goodId) : '';
  return '<div class="planet-detail-guide-banner">' +
    '<span class="planet-detail-guide-kicker">当前指引</span>' +
    '<strong class="planet-detail-guide-title">前往 ' + _escapeHtml(sys.name) + '</strong>' +
    '<span class="planet-detail-guide-text">' +
      (goodName ? ('抵达后打开市场，卖出「' + _escapeHtml(goodName) + '」。') : '抵达后继续当前贸易目标。') +
    '</span>' +
  '</div>';
}

function _buildPinnedPlanetDetailActions(travelAction, guideFocus) {
  var buttons = [];
  if (travelAction) {
    var disabledAttr = travelAction.disabled ? ' disabled aria-disabled="true"' : '';
    var titleAttr = travelAction.title ? ' title="' + _escapeHtmlAttr(travelAction.title) + '"' : '';
    var actionClass = 'planet-detail-action' + (guideFocus ? ' planet-detail-action--guide-target' : '');
    var actionLabel = guideFocus && !travelAction.disabled ? '前往卖货点' : travelAction.label;
    buttons.push(
      '<button class="' + actionClass + '" data-planet-detail-action="travel" data-system-id="' + _escapeHtmlAttr(travelAction.systemId) + '"' + disabledAttr + titleAttr + '>' +
        _escapeHtml(actionLabel) +
      '</button>'
    );
  }
  buttons.push('<button class="planet-detail-action planet-detail-action--quiet" data-planet-detail-action="close-detail">收起详情</button>');

  return '<div class="planet-detail-actions planet-detail-actions--panel">' + buttons.join('') + '</div>' +
    (guideFocus
      ? '<div class="planet-detail-note planet-detail-note--hint">点击“前往卖货点”出航；抵达后行动条会继续提示卖出步骤。</div>'
      : (travelAction && travelAction.hint ? '<div class="planet-detail-note planet-detail-note--hint">' + _escapeHtml(travelAction.hint) + '</div>' : ''));
}

function _buildPlanetHoverSummaryNote(travelAction, isCurrentSystem) {
  var message = '';
  if (isCurrentSystem) {
    message = '点击锁定本地探索详情。';
  } else if (travelAction && !travelAction.disabled) {
    message = travelAction.hint;
  } else if (travelAction && travelAction.hint) {
    message = travelAction.hint;
  } else {
    message = '点击锁定这颗星球的详细信息。';
  }

  return '<div class="planet-detail-note planet-detail-note--hint">' + _escapeHtml(message) + '</div>';
}

function _buildExplorationActionBlock(flow, sys, isCurrentSystem, stateRef) {
  if (!flow || !isCurrentSystem || !flow.nextAction) return '';

  if (flow.nextAction.type !== 'poi' || flow.unresolvedPois.length <= 1) {
    return '<div class="planet-detail-actions">' + _buildExplorationActionButton(flow.nextAction) + '</div>';
  }

  return '<div class="planet-detail-actions">' + flow.unresolvedPois.map(function (poi) {
    var poiPreview = _getPoiStatus(stateRef, sys.id, poi.id);
    return _buildExplorationActionButton({
      type: 'poi',
      systemId: sys.id,
      poiId: poi.id,
      label: poiPreview && poiPreview.actionLabel ? poiPreview.actionLabel : ('调查 ' + poi.icon + ' ' + poi.name),
      disabled: !!(poiPreview && !poiPreview.canExplore),
      title: poiPreview && poiPreview.blockedReason ? poiPreview.blockedReason : '',
    });
  }).join('') + '</div>';
}

function _buildExplorationSection(stateRef, sys, planetData, isCurrentSystem, isUnlocked) {
  var flow = _getExplorationFlow(stateRef, sys, planetData, isCurrentSystem, isUnlocked);
  if (!flow) return '';
  var surveySummary = Exploration.getSurveySummary(stateRef, sys.id);

  var poiList = flow.exploration.scanLevel > 0
    ? _orderPoisForExploration(flow.exploration, flow.discoveredPois).sort(function (left, right) {
      if (left.resolved === right.resolved) return 0;
      return left.resolved ? 1 : -1;
    })
    : [];

  var poiHtml = poiList.length > 0
    ? poiList.map(function (poi) {
      var badgeText = poi.resolved ? '已调查' : '待调查';
      if (!poi.resolved && flow.unresolvedPois.length > 0 && flow.unresolvedPois[0].id === poi.id) {
        badgeText = '下一步';
      }
      return '<div class="planet-detail-list-row">' +
        '<span>' + poi.icon + ' ' + poi.name + '</span>' +
        '<span class="planet-detail-badge">' + badgeText + '</span>' +
      '</div>';
    }).join('')
    : '';

  var routeHtml = flow.discoveredRoutes.length > 0
    ? flow.discoveredRoutes.map(function (route) {
      var routeInfo = Exploration.getTravelRouteInfo(stateRef, sys.id, route.targetSystemId);
      var fuelMultiplier = routeInfo.active ? routeInfo.fuelMultiplier : (route.fuelMultiplier || 1);
      var discount = Math.round((1 - fuelMultiplier) * 100);
      return '<div class="planet-detail-list-row">' +
        '<span>🛰️ ' + route.targetSystemName + '</span>' +
        '<span class="planet-detail-badge">燃料 -' + discount + '%</span>' +
      '</div>';
    }).join('')
    : '';

  var actionHtml = _buildExplorationActionBlock(flow, sys, isCurrentSystem, stateRef);
  var surveyPreview = surveySummary
    ? (surveySummary.threatLabel + ' · ' + surveySummary.opportunityLabel)
    : '暂无简报';
  var reportsPreview = surveySummary && Array.isArray(surveySummary.reports) && surveySummary.reports.length > 0
    ? (surveySummary.reports.length + ' 份归档')
    : '暂无报告';
  var poiPreview = poiList.length > 0
    ? (flow.unresolvedPois.length > 0
      ? ('待处理 ' + flow.unresolvedPois.length + ' / 已发现 ' + poiList.length)
      : ('已处理 ' + poiList.length + ' 个'))
    : '暂无探索点';
  var routePreview = flow.discoveredRoutes.length > 0
    ? (flow.discoveredRoutes.length + ' 条已录入')
    : '未发现';

  return '<div class="planet-detail-section planet-detail-wide">' +
    '<div class="planet-detail-section-head">' +
      '<div class="planet-detail-section-title">探索流程</div>' +
      '<span class="planet-detail-chip">' + flow.roleTag + '</span>' +
    '</div>' +
    _buildExplorationFlowCard(flow, { includeAction: false }) +
    _buildExplorationProgressRow(flow) +
    actionHtml +
    _buildPlanetDetailDisclosure('intel', '勘探简报', _buildSurveySummaryBlock(surveySummary, sys.id, {
      hideHeading: true,
    }), {
      preview: surveyPreview,
      defaultOpen: false,
      compact: true,
    }) +
    _buildPlanetDetailDisclosure('reports', '调查结论', _buildSurveyReportsBlock(surveySummary, {
      hideHeading: true,
    }), {
      preview: reportsPreview,
      defaultOpen: false,
    }) +
    _buildPlanetDetailDisclosure('poi', '探索点清单', poiHtml ? '<div class="planet-detail-list">' + poiHtml + '</div>' : '', {
      preview: poiPreview,
      defaultOpen: false,
    }) +
    _buildPlanetDetailDisclosure('routes', '秘密航线', routeHtml ? '<div class="planet-detail-list">' + routeHtml + '</div>' : '', {
      preview: routePreview,
      defaultOpen: false,
    }) +
  '</div>';
}

function _buildGalaxyHubCard(stateRef, galaxy, focusGalaxyId) {
  var playerLevel = stateRef.playerLevel || 1;
  var accessState = getGalaxyAccessState(galaxy.id, playerLevel, stateRef.researchedTechs || []);
  var allSystems = getSystemsByGalaxy(galaxy.id);
  var accessibleSystems = getAccessibleSystems(galaxy.id, playerLevel, stateRef.researchedTechs || []);
  var visitedGalaxies = stateRef.visitedGalaxies && stateRef.visitedGalaxies.length > 0
    ? stateRef.visitedGalaxies
    : [stateRef.currentGalaxy];
  var isVisited = visitedGalaxies.indexOf(galaxy.id) !== -1;
  var isCurrentGalaxy = galaxy.id === stateRef.currentGalaxy;
  var isFocusGalaxy = focusGalaxyId === galaxy.id;
  var cardClass = 'galaxy-switcher-card';
  if (!accessState.unlocked) cardClass += ' galaxy-switcher-card--locked';
  if (isCurrentGalaxy) cardClass += ' galaxy-switcher-card--current';
  if (isFocusGalaxy) cardClass += ' galaxy-switcher-card--focus';

  var chipRow = [
    accessState.unlocked
      ? _buildPlanetDetailChip(isCurrentGalaxy ? '当前星系' : '已开放', isCurrentGalaxy ? 'accent' : 'stable')
      : _buildPlanetDetailChip('Lv.' + accessState.requiredLevel + ' 开放', 'warning'),
    _buildPlanetDetailChip(isVisited ? '已访问' : '未访问', 'muted'),
  ].join('');

  var note = accessState.unlocked
    ? (accessState.unlockedBy === 'tech' && playerLevel < accessState.requiredLevel
      ? '已通过超空间跃迁提前开放，可直接查看与跃迁。'
      : (isCurrentGalaxy ? '当前航线已驻留此星系，可返回本地星图继续移动。' : '已开放，可直接查看星图并挑选目标星球跃迁。'))
    : (accessState.techRequired
      ? ('达到 Lv.' + accessState.requiredLevel + ' 或研究超空间跃迁后即可开放。')
      : ('达到 Lv.' + accessState.requiredLevel + ' 后即可开放。'));
  var tradeProfileRows = _buildGalaxyTradeProfileRows(galaxy);

  var disabledAttr = accessState.unlocked ? '' : ' disabled aria-disabled="true"';
  var buttonLabel = accessState.unlocked
    ? (isCurrentGalaxy ? '查看当前星系' : '进入该星系')
    : ('Lv.' + accessState.requiredLevel + ' 开放');

  return '<div class="' + cardClass + '">' +
    '<div class="galaxy-switcher-card-head">' +
      '<div class="galaxy-switcher-card-title">' + _escapeHtml(galaxy.icon + ' ' + galaxy.name) + '</div>' +
      '<div class="galaxy-switcher-card-meta">可探索 ' + accessibleSystems.length + ' / ' + allSystems.length + '</div>' +
    '</div>' +
    '<div class="planet-detail-chip-row">' + chipRow + '</div>' +
    '<div class="planet-detail-desc galaxy-switcher-desc">' + _escapeHtml(galaxy.description || '') + '</div>' +
    tradeProfileRows +
    '<div class="planet-detail-note galaxy-switcher-note">' + _escapeHtml(note) + '</div>' +
    '<div class="planet-detail-actions galaxy-switcher-actions">' +
      '<button class="planet-detail-action" data-galaxy-action="open" data-galaxy-id="' + _escapeHtmlAttr(galaxy.id) + '"' + disabledAttr + '>' + _escapeHtml(buttonLabel) + '</button>' +
    '</div>' +
  '</div>';
}

function _buildGalaxyHubPanel(stateRef) {
  var playerLevel = stateRef.playerLevel || 1;
  var currentGalaxy = findGalaxy(stateRef.currentGalaxy || 'milky_way') || GALAXIES[0];
  var focusGalaxy = findGalaxy(_hoveredGalaxyId || stateRef.currentGalaxy || 'milky_way') || currentGalaxy;
  var focusAccess = getGalaxyAccessState(focusGalaxy.id, playerLevel, stateRef.researchedTechs || []);
  var accessibleGalaxies = getAccessibleGalaxies(playerLevel, stateRef.researchedTechs || []);
  var galaxyList = GALAXIES.slice().sort(function (left, right) {
    var leftLevel = left.minLevel || 1;
    var rightLevel = right.minLevel || 1;
    if (leftLevel !== rightLevel) return leftLevel - rightLevel;
    return left.name.localeCompare(right.name, 'zh-CN');
  });
  var visitedGalaxies = stateRef.visitedGalaxies && stateRef.visitedGalaxies.length > 0
    ? stateRef.visitedGalaxies
    : [stateRef.currentGalaxy];
  var focusSystems = getSystemsByGalaxy(focusGalaxy.id);
  var focusAccessibleSystems = getAccessibleSystems(focusGalaxy.id, playerLevel, stateRef.researchedTechs || []);
  var focusUnlockText = focusAccess.unlocked
    ? (focusAccess.unlockedBy === 'tech' && playerLevel < focusAccess.requiredLevel ? '科技提前开放' : '已开放')
    : ('Lv.' + focusAccess.requiredLevel + ' 开放');

  return '<div class="planet-detail-hero planet-detail-wide">' +
      '<div class="planet-detail-title">🌌 星系航标 · ' + _escapeHtml(focusGalaxy.icon + ' ' + focusGalaxy.name) + '</div>' +
      '<div class="planet-detail-chip-row">' +
        _buildPlanetDetailChip('Lv.' + playerLevel, 'accent') +
        _buildPlanetDetailChip('已开放 ' + accessibleGalaxies.length + ' / ' + GALAXIES.length, 'stable') +
        _buildPlanetDetailChip('已访问 ' + visitedGalaxies.length + ' 个', 'muted') +
        _buildPlanetDetailChip(focusUnlockText, focusAccess.unlocked ? 'stable' : 'warning') +
      '</div>' +
      '<div class="planet-detail-desc">' + _escapeHtml(focusGalaxy.description || '') + '</div>' +
      '<div class="planet-detail-key-grid">' +
        _buildPlanetDetailKeyCard('当前驻留', currentGalaxy.icon + ' ' + currentGalaxy.name) +
        _buildPlanetDetailKeyCard('焦点星系', focusGalaxy.icon + ' ' + focusGalaxy.name) +
        _buildPlanetDetailKeyCard('可探索星球', focusAccessibleSystems.length + ' / ' + focusSystems.length) +
        _buildPlanetDetailKeyCard('切换方式', '点击星云或使用目录按钮进入', { wide: true }) +
        _buildPlanetDetailKeyCard('套利线索', _buildGalaxyTradeProfileSummary(focusGalaxy), { wide: true }) +
      '</div>' +
      '<div class="planet-detail-note planet-detail-note--hint">点击星系总览里的星云模型，或直接使用下方目录按钮，即可切换到已开放的新星系。</div>' +
    '</div>' +
    '<div class="planet-detail-section planet-detail-wide">' +
      '<div class="planet-detail-section-head">' +
        '<div class="planet-detail-section-title">星系跃迁目录</div>' +
        _buildPlanetDetailChip(_hoveredGalaxyId ? '悬停焦点' : '当前导航', 'muted') +
      '</div>' +
      '<div class="galaxy-switcher-list">' +
          galaxyList.map(function (galaxy) {
          return _buildGalaxyHubCard(stateRef, galaxy, focusGalaxy.id);
        }).join('') +
      '</div>' +
    '</div>';
}

function _renderCurrentSystemExplorationCard(stateRef) {
  var card = document.getElementById('current-system-exploration-card');
  if (!card) return;

  var resolvedState = stateRef || _stateRef;
  var reveal = _getCurrentSystemScanReveal(resolvedState);

  if (!resolvedState || resolvedState.mapView !== 'planets' || resolvedState.viewingGalaxy !== resolvedState.currentGalaxy) {
    if (!reveal) _orbitScanPanelOpen = false;
    _hideCurrentSystemExplorationCard();
    return;
  }

  if (!_orbitScanPanelOpen && !reveal) {
    _hideCurrentSystemExplorationCard();
    return;
  }

  var sys = findSystem(resolvedState.currentSystem);
  var planetData = GalaxyData.getPlanetData(resolvedState.currentSystem);
  if (!sys || !planetData) {
    _hideCurrentSystemExplorationCard();
    return;
  }

  var isUnlocked = (resolvedState.playerLevel || 1) >= (sys.minLevel || 1);
  var flow = _getExplorationFlow(resolvedState, sys, planetData, true, isUnlocked);
  if (!flow) {
    _hideCurrentSystemExplorationCard();
    return;
  }

  card.innerHTML = _buildCurrentSystemExplorationCard(flow, sys, reveal);
  card.classList.add('visible');
}

export function refreshPlanetDetail(stateRef) {
  const panel = document.getElementById('planet-detail-panel');
  const mapCanvas = document.getElementById('map-canvas');
  const mapContainer = document.getElementById('map-container');
  if (!panel) return;
  if (!mapCanvas || !mapContainer) return;

  _updateOrbitScanButton(stateRef);
  _renderCurrentSystemExplorationCard(stateRef);

  if (stateRef.mapView === 'galaxies') {
    if (_selectedPlanetDetailSystem) {
      _clearSelectedPlanetDetail(false);
    }

    panel.classList.remove('planet-detail-panel--summary', 'planet-detail-panel--pinned', 'planet-detail-panel--guide-target');
    panel.classList.add('planet-detail-panel--galaxy-hub');
    panel.innerHTML = _buildGalaxyHubPanel(stateRef);
    panel.classList.add('visible');

    const canvasW = mapContainer.clientWidth;
    const panelW = Math.min(360, Math.max(260, canvasW - 16));
    panel.style.width = panelW + 'px';
    panel.style.left = Math.max(8, canvasW - panelW - 12) + 'px';
    panel.style.top = '12px';
    return;
  }

  const displayId = _getPlanetDetailDisplayId(stateRef);
  if (stateRef.mapView !== 'planets' || !displayId) {
    if (stateRef.mapView !== 'planets' && _selectedPlanetDetailSystem) {
      _clearSelectedPlanetDetail(false);
    }
    panel.classList.remove('planet-detail-panel--galaxy-hub');
    panel.classList.remove('planet-detail-panel--guide-target');
    panel.classList.remove('visible');
    return;
  }
  const sys = findSystem(displayId);
  const planetData = GalaxyData.getPlanetData(displayId);
  if (!sys) {
    panel.classList.remove('visible');
    return;
  }

  const gal = findGalaxy(sys.galaxyId);
  const details = sys.details || {};
  const races = (details.population || []).map(function (p) {
    return p.icon + p.name + '(' + p.percentage + '%)';
  }).join('、') || '未知';
  const government = details.government
    ? (details.government.name + ' · ' + details.government.style)
    : '未知政体';
  const specialties = (details.specialties || []).join('、') || '暂无';
  const safety = typeof details.safety === 'number'
    ? (details.safety + ' / 100（' + _getSafetyLabel(details.safety) + '）')
    : '未知';

  const faction = Faction.getFactionForSystem(sys.id);
  let factionText = '🛰️ 独立星区';
  let relationText = '🙂 中立 (0)';
  if (faction) {
    const rel = Faction.getRelation(stateRef, faction.id);
    const level = Faction.getLevel(stateRef, faction.id);
    factionText = faction.icon + ' ' + faction.name;
    relationText = level.emoji + ' ' + level.name + ' (' + (rel >= 0 ? '+' : '') + rel + ')';
  }

  const playerLevel = stateRef.playerLevel || 1;
  const isUnlocked = playerLevel >= (sys.minLevel || 1);
  const isCurrentSystem = displayId === stateRef.currentSystem;
  const isPinned = _selectedPlanetDetailSystem === displayId;
  const guideFocus = _navigationGuideFocus && _navigationGuideFocus.systemId === displayId
    ? _navigationGuideFocus
    : null;
  const lockText = playerLevel >= (sys.minLevel || 1)
    ? '已解锁'
    : ('需 Lv.' + (sys.minLevel || 1) + '（当前 Lv.' + playerLevel + '）');
  const safetyChipText = typeof details.safety === 'number'
    ? ('治安 ' + _getSafetyLabel(details.safety))
    : '治安未知';
  const safetyTone = typeof details.safety === 'number'
    ? (details.safety >= 80 ? 'stable' : (details.safety >= 60 ? 'accent' : (details.safety >= 40 ? 'warning' : 'danger')))
    : 'muted';
  const lockTone = isUnlocked ? 'stable' : 'warning';
  const roleTone = isCurrentSystem ? 'accent' : 'muted';
  var heroChipParts = [
    _buildPlanetDetailChip(sys.typeLabel, 'accent'),
    _buildPlanetDetailChip(isCurrentSystem ? '当前停靠' : '悬停预览', roleTone),
    _buildPlanetDetailChip(safetyChipText, safetyTone),
    _buildPlanetDetailChip(lockText, lockTone),
  ];
  if (guideFocus) {
    heroChipParts.push(_buildPlanetDetailChip(guideFocus.goodId ? ('卖出 ' + _getGoodName(guideFocus.goodId)) : '当前指引', 'warning'));
  }
  const heroChips = heroChipParts.join('');
  const heroGrid = '<div class="planet-detail-key-grid">' +
    _buildPlanetDetailKeyCard('势力', factionText) +
    _buildPlanetDetailKeyCard('友好度', relationText) +
    _buildPlanetDetailKeyCard('特产', specialties, { wide: true }) +
  '</div>';
  const travelAction = _buildPlanetTravelAction(stateRef, sys);
  const archiveDisclosure = _buildPlanetArchiveDisclosure({
    races: races,
    population: details.totalPopulation || '未知',
    government: government,
    safety: safety,
    lockText: lockText,
  });

  panel.classList.remove('planet-detail-panel--galaxy-hub');
  panel.classList.toggle('planet-detail-panel--pinned', isPinned);
  panel.classList.toggle('planet-detail-panel--summary', !isPinned);
  panel.classList.toggle('planet-detail-panel--guide-target', !!guideFocus);

  panel.innerHTML =
    '<div class="planet-detail-hero planet-detail-wide">' +
      '<div class="planet-detail-title">🪐 ' + sys.name + ' · ' + (gal ? (gal.icon + ' ' + gal.name) : '未知星系') + '</div>' +
      '<div class="planet-detail-chip-row">' + heroChips + '</div>' +
      '<div class="planet-detail-desc">' + sys.description + '</div>' +
      heroGrid +
      _buildNavigationGuideBanner(guideFocus, sys) +
      (isPinned
        ? _buildPinnedPlanetDetailActions(travelAction, guideFocus)
        : _buildPlanetHoverSummaryNote(travelAction, isCurrentSystem)) +
    '</div>' +
    (isPinned ? (_buildExplorationSection(stateRef, sys, planetData, isCurrentSystem, isUnlocked) + archiveDisclosure) : '');

  panel.classList.add('visible');

  const container = mapContainer;
  const canvasW = container.clientWidth;
  const canvasH = container.clientHeight;

  // 优先使用3D投影坐标
  let nodeX, nodeY;
  const screenPos = Renderer3D.getPlanetScreenPosition(displayId);
  if (screenPos) {
    nodeX = screenPos.x;
    nodeY = screenPos.y;
  } else {
    nodeX = sys.x * canvasW;
    nodeY = sys.y * canvasH;
  }
  const offset = 14;

  const preferredWidth = isPinned ? 360 : 300;
  const minimumWidth = isPinned ? 240 : 220;
  const panelW = Math.min(preferredWidth, Math.max(minimumWidth, canvasW - 16));
  panel.style.width = panelW + 'px';

  const maxLeft = Math.max(8, canvasW - panelW - 8);
  const placeRight = nodeX < (canvasW * 0.58);
  let left = placeRight ? (nodeX + offset) : (nodeX - panelW - offset);
  left = Math.max(8, Math.min(maxLeft, left));

  const panelH = Math.max(160, panel.offsetHeight || 0);
  const maxTop = Math.max(8, canvasH - panelH - 8);
  let top = nodeY - panelH * 0.5;
  top = Math.max(8, Math.min(maxTop, top));

  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
}

/** 打开市场面板（默认当前节点功能页） */
export function openMarket(stateRef, marketFocus) {
  const overlay = document.getElementById('market-overlay');
  const marketBtn = document.getElementById('market-view-btn');
  if (!overlay) return;
  _closeOrbitScanPanel(stateRef);
  _stateRef = stateRef;
  _pendingMarketPanelFocus = _normalizeMarketPanelFocus(marketFocus || getContextualMarketFocus(stateRef));
  _marketViewGalaxy = stateRef.currentGalaxy;
  _marketViewSystem = stateRef.currentSystem;
  _marketMode = 'detail';
  _marketOpen = true;
  openPrimarySurface('market-overlay');
  if (marketBtn) marketBtn.classList.add('active');
  _buildMarketGalaxyNav(stateRef);
  _bindMarketDetailEvents(stateRef);
  if (_refreshMarket) _refreshMarket('detail');
}

/** 以正式导航状态打开市场面板 */
export function openMarketPanel(stateRef, marketFocus) {
  _stateRef = stateRef || _stateRef;
  if (!_stateRef) return;
  _closeAllOverlayPanels();
  closeMarket();
  _setBottomNavActive('market');
  openMarket(_stateRef, marketFocus);
}

export function openMarketSystemPanel(stateRef, systemId, marketFocus) {
  if (!stateRef) return;

  openMarketPanel(stateRef, marketFocus);
  if (systemId && systemId !== stateRef.currentSystem) {
    showMarketDetail(systemId);
  }
}

/** 关闭市场面板 */
export function closeMarket() {
  const overlay = document.getElementById('market-overlay');
  const marketBtn = document.getElementById('market-view-btn');
  if (!overlay) return;
  _marketOpen = false;
  closePrimarySurface('market-overlay');
  if (marketBtn) marketBtn.classList.remove('active');
}

/** 市场是否打开 */
export function isMarketOpen() {
  return _marketOpen && isPrimarySurfaceVisible('market-overlay');
}

/** 旅行后刷新市场（保持当前节点功能页） */
export function refreshMarketLocation(stateRef) {
  if (!_marketOpen) return;
  _stateRef = stateRef;
  _marketViewGalaxy = stateRef.currentGalaxy;
  _marketViewSystem = stateRef.currentSystem;
  _marketMode = 'detail';
  _buildMarketGalaxyNav(stateRef);
  if (_refreshMarket) _refreshMarket('detail');
}

/** 绑定详情模式中的表格开关 */
function _bindMarketDetailEvents(state) {
  const sellToggle = document.getElementById('market-show-sell');
  if (sellToggle) {
    sellToggle.onchange = function () {
      if (_refreshMarket) _refreshMarket('detail');
    };
  }
}

/**
 * 构建星系选择导航栏（仅显示已访问星系）
 */
function _buildMarketGalaxyNav(state) {
  const nav = document.getElementById('market-galaxy-nav');
  if (!nav) return;
  nav.innerHTML = '';
  const visited = state.visitedGalaxies || [state.currentGalaxy];
  GALAXIES.forEach(function (g) {
    if (visited.indexOf(g.id) === -1) return;
    const btn = document.createElement('button');
    btn.className = 'market-galaxy-btn' + (g.id === _marketViewGalaxy ? ' active' : '');
    btn.textContent = g.icon + ' ' + g.name;
    btn.addEventListener('click', function () {
      _marketViewGalaxy = g.id;
      _buildMarketGalaxyNav(state);
      if (_refreshMarket) _refreshMarket(_marketMode || 'detail');
    });
    nav.appendChild(btn);
  });
}

/**
 * 绑定标签页按钮切换
 * @param {Function} [onTabClick]  可选回调 (tabId:string) => void
 */
export function initTabs(onTabClick) {
  _tabClickCallback = onTabClick || null;
  if (_tabBindingsInitialized) return;
  _tabBindingsInitialized = true;

  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      activateTab(btn.dataset.tab);
    });
  });

  // 面板关闭按钮（新设计：覆盖层关闭按钮）
  var infoPanelToggle = document.getElementById('info-panel-toggle');
  if (infoPanelToggle) {
    infoPanelToggle.addEventListener('click', function () {
      _closeOverlayPanel('info-panel');
      _setBottomNavActive('starmap');
    });
  }

  var consolePanelClose = document.getElementById('console-panel-close');
  if (consolePanelClose) {
    consolePanelClose.addEventListener('click', function () {
      _closeOverlayPanel('console-panel');
      _setBottomNavActive('starmap');
    });
  }

  // 底部导航按钮
  var bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) {
    bottomNav.addEventListener('click', function (e) {
      var btn = e.target.closest('.bottom-nav-btn');
      if (!btn) return;
      if (hasBlockingSurfaceOpen()) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        return;
      }
      var view = btn.dataset.view;
      _handleBottomNav(view);
    });
  }
}

export function setNavigationChangeCallback(callback) {
  _navigationChangeCallback = typeof callback === 'function' ? callback : null;
}

export function focusNavigationTarget(stateRef, systemId, options) {
  var resolvedState = stateRef || _stateRef;
  var sys = findSystem(systemId);
  if (!resolvedState || !sys) return false;

  var accessState = getGalaxyAccessState(sys.galaxyId, resolvedState.playerLevel || 1, resolvedState.researchedTechs || []);
  if (!accessState.unlocked) return false;

  _stateRef = resolvedState;
  _closeAllOverlayPanels();
  closeMarket();
  _hoveredGalaxyId = null;
  resolvedState.mapView = 'planets';
  resolvedState.viewingGalaxy = sys.galaxyId;
  resolvedState.hoveredSystem = sys.id;
  _setSelectedPlanetDetail(sys.id);
  _navigationGuideFocus = {
    systemId: sys.id,
    goodId: options && options.goodId ? options.goodId : '',
    title: options && options.title ? options.title : '',
  };
  _setBottomNavActive('starmap');
  _updateGalaxyBtn(resolvedState);
  refreshPlanetDetail(resolvedState);

  if (Renderer3D.selectPlanet) {
    Renderer3D.selectPlanet(sys.id, { focus: true, smooth: true });
  } else if (Renderer3D.focusPlanet) {
    Renderer3D.focusPlanet(sys.id, true);
  }

  return true;
}

/**
 * 底部导航按钮处理
 * @param {string} view  按钮对应的视图名
 */
function _handleBottomNav(view) {
  var currentActive = document.querySelector('.bottom-nav-btn.active');
  var currentView = currentActive ? currentActive.dataset.view : 'starmap';

  if (view === 'starmap') {
    _closeAllOverlayPanels();
    closeMarket();
    _setBottomNavActive('starmap');
    return;
  }

  if (view === 'market') {
    // If already open, close it
    if (currentView === 'market' && _marketOpen) {
      closeMarket();
      _setBottomNavActive('starmap');
    } else {
      _closeAllOverlayPanels();
      _setBottomNavActive('market');
      if (_stateRef) {
        openMarket(_stateRef);
      }
      // If _stateRef is not set yet, skip opening market (will be set on init)
    }
    return;
  }

  if (view === 'hangar') {
    if (currentView === 'hangar') {
      _closeOverlayPanel('trade-panel');
      _setBottomNavActive('starmap');
    } else {
      _closeAllOverlayPanels();
      closeMarket();
      _openOverlayPanel('trade-panel');
      _setBottomNavActive('hangar');
    }
    return;
  }

  if (view === 'quests') {
    if (currentView === 'quests') {
      _closeOverlayPanel('info-panel');
      _setBottomNavActive('starmap');
    } else {
      _closeAllOverlayPanels();
      closeMarket();
      var archiveTabId = _getDefaultArchiveTab(_stateRef);
      if (document.querySelector('.tab-btn[data-tab="' + archiveTabId + '"]')) {
        activateTab(archiveTabId);
      } else {
        _openOverlayPanel('info-panel');
        _setBottomNavActive('quests');
      }
    }
    return;
  }

  if (view === 'console') {
    if (currentView === 'console') {
      _closeOverlayPanel('console-panel');
      _setBottomNavActive('starmap');
    } else {
      _closeAllOverlayPanels();
      closeMarket();
      _openOverlayPanel('console-panel');
      _setBottomNavActive('console');
    }
    return;
  }


}

function _openOverlayPanel(id) {
  if (_marketOpen) closeMarket();
  openSecondarySurface(id);
}

function _closeOverlayPanel(id) {
  closeSecondarySurface(id);
}

function _closeAllOverlayPanels() {
  _closeOrbitScanPanel();
  closeAllSecondarySurfaces();
}

function _setBottomNavActive(view) {
  document.querySelectorAll('.bottom-nav-btn').forEach(function (btn) {
    if (btn.dataset.view === view) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  if (_navigationChangeCallback) _navigationChangeCallback(view);
}

export function focusStarmap() {
  _handleBottomNav('starmap');
}

export function activateTab(tabId) {
  var btn = document.querySelector('.tab-btn[data-tab="' + tabId + '"]');
  if (!btn) return;

  var group = btn.dataset.tabGroup || '';
  document.querySelectorAll('.tab-btn[data-tab-group="' + group + '"]').forEach(function (b) { b.classList.remove('active'); });
  document.querySelectorAll('.tab-pane[data-tab-group="' + group + '"]').forEach(function (p) { p.classList.remove('active'); });
  btn.classList.add('active');

  var pane = document.getElementById(tabId);
  if (pane) pane.classList.add('active');

  // 如果所属面板是隐藏的覆盖层，则自动打开它并更新底部导航
  if (group === 'info') {
    _openOverlayPanel('info-panel');
    _setBottomNavActive('quests');
  } else if (group === 'trade') {
    _openOverlayPanel('trade-panel');
    _setBottomNavActive('hangar');
  }

  if (_tabClickCallback) _tabClickCallback(tabId);
}
