// js/ui/FleetUI.js — 船队管理 UI（含席位系统）
// 依赖：data/ships.js, data/systems.js, data/goods.js, systems/fleet/FleetSystem.js
// 导出：render

import { SYSTEMS, getAccessibleGalaxies, getSystemsByGalaxy } from '../data/systems.js';
import { GOODS } from '../data/goods.js';
import * as Fleet from '../systems/fleet/FleetSystem.js';
import * as Crew from '../systems/fleet/CrewSystem.js';
import * as AutoTrade from '../systems/trade/AutoTradeSystem.js';
import { hideBlockingSurface, showBlockingSurface } from './SurfaceManager.js';
import * as EventBus from '../core/EventBus.js';
import * as ActionConfirmUI from './ActionConfirmUI.js';
import * as ContextInspector from './ContextInspector.js';
import { FLEET_COMMAND, normalizeFleetCommand } from '../core/FleetCommand.js';
import {
  FLEET_HANGAR_INTENT,
  buildFleetHangarModel,
  getFleetCargoUsed,
  readFleetHangarIntent,
  renderFleetHangar,
} from './FleetHangarPresenter.js';
import {
  FLEET_CREW_INTENT,
  buildFleetCrewModel,
  readFleetCrewIntent,
  renderFleetCrew,
} from './FleetCrewPresenter.js';
import {
  FLEET_MOD_INTENT,
  buildFleetModModel,
  readFleetModIntent,
  renderFleetMod,
} from './FleetModPresenter.js';
import {
  buildFleetDispatchEstimate,
  buildFleetDispatchGoodOptions,
  buildFleetDispatchPolicyStatus,
  buildFleetDispatchPrimaryView,
  buildFleetDispatchRouteSummary,
  buildFleetDispatchSystemOptions,
  buildFleetDispatchWarnings,
  findFleetDispatchRecommendation,
  formatFleetDispatchMarketMode,
  formatFleetDispatchRiskMode,
  getFleetDispatchReadiness,
  hasCustomFleetDispatchPolicy,
  parseFleetDispatchPolicy,
  renderFleetDispatchEstimate,
  validateFleetDispatchPolicy,
} from './FleetDispatchPresenter.js';
import {
  buildFleetShopModel,
  readFleetShopIntent,
  renderFleetShop,
} from './FleetShopPresenter.js';
import {
  buildFleetShipContextView,
  buildFleetShipDetailView,
} from './FleetShipDetailPresenter.js';

let _activeInlineModalId = null;
let _currentPortalCleanup = null;
let _activeModModalContext = null;
let _activeCrewModalContext = null;
let _activeDispatchModalContext = null;
let _activeFleetConfirmation = null;
let _inspectedHangarShipIndex = null;
let _lifecycleActions = null;
let _fleetRuntimeResetCount = 0;

function _copyFleetSessionContext(context) {
  if (!context) return null;
  var copy = Object.assign({}, context);
  if (copy.tradePolicy && typeof copy.tradePolicy === 'object') {
    copy.tradePolicy = Object.freeze(Object.assign({}, copy.tradePolicy));
  }
  return Object.freeze(copy);
}

function _activeFleetSurfaceId() {
  if (_activeInlineModalId) return _activeInlineModalId;
  if (_activeModModalContext) return 'mod-modal';
  if (_activeCrewModalContext) return 'crew-modal';
  if (_activeDispatchModalContext) return 'dispatch-modal';
  return null;
}

function _clearFleetSurfaceContext(modalId) {
  if (modalId === 'mod-modal') _activeModModalContext = null;
  else if (modalId === 'crew-modal') _activeCrewModalContext = null;
  else if (modalId === 'dispatch-modal') _activeDispatchModalContext = null;
}

function _closeFleetSurface(modalId, options) {
  if (_activeInlineModalId === modalId && _currentPortalCleanup) {
    _currentPortalCleanup(options);
    return true;
  }
  hideBlockingSurface(modalId);
  _clearFleetSurfaceContext(modalId);
  return true;
}

function _closeActiveFleetSurface(options) {
  var modalId = _activeFleetSurfaceId();
  return modalId ? _closeFleetSurface(modalId, options) : false;
}

function _openFleetConfirmation(context, options) {
  var request = options || {};
  var onConfirm = request.onConfirm;
  var onCancel = request.onCancel;
  _activeFleetConfirmation = Object.assign({}, context || {});
  var opened = ActionConfirmUI.open(Object.assign({}, request, {
    onConfirm: function () {
      _activeFleetConfirmation = null;
      if (typeof onConfirm === 'function') onConfirm();
    },
    onCancel: function () {
      _activeFleetConfirmation = null;
      if (typeof onCancel === 'function') onCancel();
    },
  }));
  if (!opened) _activeFleetConfirmation = null;
  return opened;
}

function _publishFleetCommand(onCommand, type, payload) {
  if (typeof onCommand !== 'function') return false;
  var command = normalizeFleetCommand(Object.assign({}, payload || {}, { type: type }));
  return command ? onCommand(command) : false;
}

function _createFleetActionPorts(onCommand) {
  return Object.freeze({
    onBuyShip: function (shipTypeId) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.BUY_SHIP, { shipTypeId: shipTypeId });
    },
    onSwitchShip: function (shipIndex) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.SWITCH_SHIP, { shipIndex: shipIndex });
    },
    onUpgradeShip: function (shipIndex, upgradeId) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.UPGRADE_SHIP, { shipIndex: shipIndex, upgradeId: upgradeId });
    },
    onAssignRoute: function (shipIndex, buySystemId, sellSystemId, goodId, tradePolicy) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.ASSIGN_ROUTE, {
        shipIndex: shipIndex,
        buySystemId: buySystemId,
        sellSystemId: sellSystemId,
        goodId: goodId,
        tradePolicy: tradePolicy,
      });
    },
    onCancelRoute: function (shipIndex) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.CANCEL_ROUTE, { shipIndex: shipIndex });
    },
    onBuySlot: function () {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.BUY_SLOT);
    },
    onSellShip: function (shipIndex) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.SELL_SHIP, { shipIndex: shipIndex });
    },
    onInstallMod: function (shipIndex, modId) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.INSTALL_MOD, { shipIndex: shipIndex, modId: modId });
    },
    onUninstallMod: function (shipIndex, modId) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.UNINSTALL_MOD, { shipIndex: shipIndex, modId: modId });
    },
    onServiceShip: function (shipIndex, tierId) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.SERVICE_SHIP, { shipIndex: shipIndex, tierId: tierId });
    },
    onRecruitCrew: function (offerId) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.RECRUIT_CREW, { offerId: offerId });
    },
    onAssignCrew: function (shipIndex, crewId) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.ASSIGN_CREW, { shipIndex: shipIndex, crewId: crewId });
    },
    onUnassignCrew: function (shipIndex, crewId) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.UNASSIGN_CREW, { shipIndex: shipIndex, crewId: crewId });
    },
    onDismissCrew: function (crewId) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.DISMISS_CREW, { crewId: crewId });
    },
  });
}

export function setLifecycleActions(actions) {
  _lifecycleActions = actions || null;
}

export function getInspectedShipIndex() {
  return Number.isInteger(_inspectedHangarShipIndex) ? _inspectedHangarShipIndex : null;
}

export function getDiagnostics() {
  var activeSurfaceId = _activeFleetSurfaceId();
  return Object.freeze({
    activeSurface: activeSurfaceId ? activeSurfaceId.replace('-modal', '') : null,
    surfaceMode: activeSurfaceId ? (_activeInlineModalId === activeSurfaceId ? 'inline' : 'blocking') : null,
    inspectedShipIndex: getInspectedShipIndex(),
    mod: _copyFleetSessionContext(_activeModModalContext),
    crew: _copyFleetSessionContext(_activeCrewModalContext),
    dispatch: _copyFleetSessionContext(_activeDispatchModalContext),
    confirmation: _copyFleetSessionContext(_activeFleetConfirmation),
    resetCount: _fleetRuntimeResetCount,
  });
}

export function resetRuntimeState() {
  if (_activeFleetConfirmation) ActionConfirmUI.cancel();
  _closeActiveFleetSurface({ restoreFocus: false });
  ['mod-modal', 'crew-modal', 'dispatch-modal'].forEach(function (modalId) {
    hideBlockingSurface(modalId);
  });
  _activeInlineModalId = null;
  _currentPortalCleanup = null;
  _activeModModalContext = null;
  _activeCrewModalContext = null;
  _activeDispatchModalContext = null;
  _activeFleetConfirmation = null;
  _inspectedHangarShipIndex = null;
  _fleetRuntimeResetCount += 1;
  return getDiagnostics();
}

function _buildFleetShipDetailModel(state, shipIndex) {
  var ship = state && Number.isInteger(shipIndex) ? (state.fleet || [])[shipIndex] : null;
  if (!ship) return null;
  var shipType = Fleet.getShipType(ship.typeId) || {};
  var stats = Fleet.getEffectiveShipStats(state, ship);
  var routeDisplay = ship.route && Fleet.getRouteDisplayInfo
    ? Fleet.getRouteDisplayInfo(state, ship, shipIndex)
    : null;
  var routeLabel = ship.route
    ? ((routeDisplay && routeDisplay.statusLabel) || ship.route.status || '自动跑商中')
    : '停靠待命';
  return {
    ship: ship,
    shipIndex: shipIndex,
    shipType: shipType,
    role: stats.roleProfile || Fleet.getShipRoleProfile(state, ship),
    maintenance: stats.maintenance || Fleet.getShipMaintenanceSummary(state, ship),
    operating: Fleet.getShipOperatingSummary(state, ship),
    cargoUsed: getFleetCargoUsed(ship.cargo),
    maxCargo: Math.max(1, stats.maxCargo || ship.maxCargo || 1),
    maxFuel: Math.max(1, stats.maxFuel || ship.maxFuel || 1),
    maxHull: Math.max(1, stats.maxHull || ship.maxHull || 1),
    crewCount: Crew.getShipCrew(state, ship).length,
    modCount: (ship.mods || []).length,
    skillCount: Fleet.getShipSkills(ship).length,
    faultCount: Fleet.getShipFaultSummaries(ship).length,
    active: shipIndex === (state.activeShipIndex || 0),
    routeLabel: routeLabel,
  };
}

export function renderContextInspector(request) {
  var context = request && request.context;
  var state = request && request.state;
  var container = request && request.container;
  var shipIndex = context ? Number(context.id) : NaN;
  if (!context || context.type !== 'ship' || !state || !container) return false;
  var view = buildFleetShipContextView(_buildFleetShipDetailModel(state, shipIndex));
  if (!view) return false;
  container.innerHTML = view.html;
  return { title: view.title };
}

export function renderWorkspaceDetail(request) {
  var detail = request && request.detail;
  var state = request && request.state;
  var container = request && request.container;
  var shipIndex = detail ? Number(detail.id) : NaN;
  if (!detail || detail.type !== 'fleet-ship' || !state || !container || !Number.isInteger(shipIndex)) return false;
  var view = buildFleetShipDetailView(_buildFleetShipDetailModel(state, shipIndex));
  if (!view) return false;
  container.innerHTML = view.html;
  return { title: view.title };
}

// 全局监听重置事件（用于视图切换时自动归还节点）
EventBus.on('hangar:reset', function() {
  resetRuntimeState();
});

function _focusInlineElement(target) {
  if (!target || typeof target.focus !== 'function' || target.disabled) return;
  if (target.isConnected === false) return;
  try {
    target.focus({ preventScroll: true });
  } catch (err) {
    target.focus();
  }
}

function _scheduleInlineFocusRestore(selector, fallbackTarget) {
  Promise.resolve().then(function () {
    var target = null;
    if (selector && globalThis.document && typeof document.querySelector === 'function') {
      target = document.querySelector(selector);
    }
    _focusInlineElement(target || fallbackTarget);
  });
}

function _getInlineScrollViewport(inlineContainer) {
  if (!inlineContainer || typeof inlineContainer.closest !== 'function') return null;
  return inlineContainer.closest('.workspace-terminal-content');
}

function _setInlineScrollPosition(viewport, top) {
  if (!viewport) return;
  var nextTop = Number.isFinite(top) ? top : 0;
  if (typeof viewport.scrollTo === 'function') {
    try {
      viewport.scrollTo({ top: nextTop, left: 0, behavior: 'auto' });
      return;
    } catch (err) {
      // Older WebViews may only support direct scrollTop assignment.
    }
  }
  viewport.scrollTop = nextTop;
}

function _renderHangarAfterInlineClose() {
  if (_lifecycleActions && typeof _lifecycleActions.requestRender === 'function') {
    return _lifecycleActions.requestRender();
  }
  return false;
}

/**
 * 核心 Portal 函数：将弹窗中的 .modal-box 搬移至内联容器
 * @param {string} modalId 弹窗元素的ID（如 'mod-modal'）
 * @param {Function} onCloseCallback 当点击返回或关闭时调用的额外回调
 * @param {Object} options 内联区域语义和焦点恢复配置
 */
function _openInlinePortal(modalId, onCloseCallback, options) {
  var portalOptions = options || {};
  // 如果之前已经有活动的 portal，先静默归还
  if (_currentPortalCleanup) {
    _currentPortalCleanup({ restoreFocus: false });
  }

  const listContainer = document.getElementById('fleet-list');
  const inlineContainer = document.getElementById('fleet-inline-container');
  const modal = document.getElementById(modalId);
  if (!listContainer || !inlineContainer || !modal) return false;

  const modalBox = modal.querySelector('.modal-box');
  if (!modalBox) return false;
  const returnFocusTarget = globalThis.document ? document.activeElement : null;
  const scrollViewport = _getInlineScrollViewport(inlineContainer);
  const returnScrollTop = scrollViewport && Number.isFinite(scrollViewport.scrollTop)
    ? scrollViewport.scrollTop
    : 0;

  _activeInlineModalId = modalId;

  // 1. 隐藏原主列表，显示内嵌容器
  listContainer.classList.add('hidden');
  listContainer.setAttribute('aria-hidden', 'true');
  listContainer.inert = true;
  inlineContainer.classList.remove('hidden');
  inlineContainer.setAttribute('aria-hidden', 'false');
  inlineContainer.setAttribute('role', 'region');
  inlineContainer.setAttribute('tabindex', '-1');
  inlineContainer.setAttribute('data-inline-surface', modalId);
  inlineContainer.inert = false;
  if (portalOptions.labelledBy) inlineContainer.setAttribute('aria-labelledby', portalOptions.labelledBy);
  if (portalOptions.describedBy) inlineContainer.setAttribute('aria-describedby', portalOptions.describedBy);
  inlineContainer.innerHTML = '';

  // 2. 创建可被键盘稳定访问的返回栏
  const backBar = document.createElement('div');
  backBar.className = 'inline-portal-back-bar';
  const backButton = document.createElement('button');
  backButton.className = 'inline-portal-back-btn';
  backButton.type = 'button';
  backButton.textContent = '← 返回机库列表';
  backButton.setAttribute('aria-label', '返回机库列表');
  backBar.appendChild(backButton);
  
  // 3. 将返回条和搬移过来的 modalBox 插入到内联容器
  inlineContainer.appendChild(backBar);
  inlineContainer.appendChild(modalBox);
  modalBox.setAttribute('data-surface-mode', 'inline');
  _setInlineScrollPosition(scrollViewport, 0);

  // 4. 定义清理（还原）函数
  const cleanup = function(cleanupOptions) {
    if (_activeInlineModalId !== modalId) return; // 避免重复清理
    var shouldRestoreFocus = !cleanupOptions || cleanupOptions.restoreFocus !== false;

    if (typeof inlineContainer.removeEventListener === 'function') {
      inlineContainer.removeEventListener('keydown', handlePortalKeydown);
    }

    // 把 .modal-box 移回原 modal 容器
    modal.appendChild(modalBox);
    modalBox.removeAttribute('data-surface-mode');
    
    // 隐藏并清空内嵌容器，重新展现列表
    inlineContainer.classList.add('hidden');
    inlineContainer.setAttribute('aria-hidden', 'true');
    inlineContainer.removeAttribute('role');
    inlineContainer.removeAttribute('tabindex');
    inlineContainer.removeAttribute('aria-labelledby');
    inlineContainer.removeAttribute('aria-describedby');
    inlineContainer.removeAttribute('data-inline-surface');
    inlineContainer.inert = true;
    inlineContainer.innerHTML = '';
    listContainer.classList.remove('hidden');
    listContainer.setAttribute('aria-hidden', 'false');
    listContainer.inert = false;
    _setInlineScrollPosition(scrollViewport, returnScrollTop);
    
    _activeInlineModalId = null;
    _currentPortalCleanup = null;
    _clearFleetSurfaceContext(modalId);

    if (onCloseCallback) {
      onCloseCallback();
    }
    if (shouldRestoreFocus) {
      _scheduleInlineFocusRestore(portalOptions.returnFocusSelector, returnFocusTarget);
    }
  };

  _currentPortalCleanup = cleanup;

  // 5. 绑定返回按钮事件
  backButton.onclick = function(e) {
    e.preventDefault();
    cleanup();
    _renderHangarAfterInlineClose();
  };

  function handlePortalKeydown(event) {
    if (!event || event.key !== 'Escape' || _activeInlineModalId !== modalId) return;
    event.preventDefault();
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
    cleanup();
    _renderHangarAfterInlineClose();
  }

  if (typeof inlineContainer.addEventListener === 'function') {
    inlineContainer.addEventListener('keydown', handlePortalKeydown);
  }
  Promise.resolve().then(function () {
    if (_activeInlineModalId !== modalId) return;
    _setInlineScrollPosition(scrollViewport, 0);
    _focusInlineElement(backButton);
  });

  return true;
}

/**
 * 渲染机库主视图。Presenter 拥有只读投影与 HTML，FleetUI 只协调选择、弹层与 command。
 * @param {{state:object, onCommand?:Function}} request
 */
export function render(request) {
  var input = request || {};
  var state = input.state;
  if (!state || _activeInlineModalId !== null) return false;
  var container = document.getElementById('fleet-list');
  if (!container) return false;

  var actions = _createFleetActionPorts(input.onCommand);
  var model = buildFleetHangarModel(state, _inspectedHangarShipIndex);
  if (!model) return false;
  _inspectedHangarShipIndex = model.inspectedIdx;

  if (model.inspectedIdx !== null) {
    ContextInspector.replaceContext({
      type: 'ship',
      id: String(model.inspectedIdx),
      workspaceId: 'fleet',
      source: 'hangar-selection',
      revision: ContextInspector.getCurrentRevision(),
    }, { render: false });
  }

  container.innerHTML = renderFleetHangar(model);
  container.onclick = function (event) {
    var intent = readFleetHangarIntent(event && event.target);
    if (!intent) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();

    if (intent.type === FLEET_HANGAR_INTENT.INSPECT_SHIP) {
      if (!model.fleet[intent.shipIndex] || intent.shipIndex === _inspectedHangarShipIndex) return;
      _inspectedHangarShipIndex = intent.shipIndex;
      ContextInspector.replaceContext({
        type: 'ship',
        id: String(intent.shipIndex),
        workspaceId: 'fleet',
        source: 'hangar-ship-selector',
        revision: ContextInspector.getCurrentRevision(),
      });
      render(input);
      Promise.resolve().then(function () {
        if (!container || typeof container.querySelector !== 'function') return;
        _focusInlineElement(container.querySelector('.hangar-ship-select[data-ship-index="' + intent.shipIndex + '"]'));
      });
      return;
    }
    if (intent.type === FLEET_HANGAR_INTENT.BUY_SLOT) return actions.onBuySlot();
    if (intent.type === FLEET_HANGAR_INTENT.SWITCH_SHIP) return actions.onSwitchShip(intent.shipIndex);
    if (intent.type === FLEET_HANGAR_INTENT.OPEN_MODS) {
      return _openModModal(state, intent.shipIndex, actions.onInstallMod, actions.onUninstallMod, actions.onUpgradeShip, actions.onServiceShip, actions.onSellShip);
    }
    if (intent.type === FLEET_HANGAR_INTENT.OPEN_CREW) {
      return _openCrewModal(state, intent.shipIndex, actions.onRecruitCrew, actions.onAssignCrew, actions.onUnassignCrew, actions.onDismissCrew, actions.onSwitchShip);
    }
    if (intent.type === FLEET_HANGAR_INTENT.OPEN_DISPATCH) {
      return _openDispatchModal(state, intent.shipIndex, actions.onAssignRoute, actions.onCancelRoute);
    }
    if (intent.type === FLEET_HANGAR_INTENT.CANCEL_ROUTE) return actions.onCancelRoute(intent.shipIndex);
  };

  return true;
}

function _escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _focusGuidedMod(container, focusModId) {
  if (!container || !focusModId || typeof container.querySelector !== 'function') return;

  var target = container.querySelector('[data-focus-mod="item"]')
    || container.querySelector('[data-focus-mod="recommendation"]');
  if (!target) return;

  if (target.classList && typeof target.classList.add === 'function') {
    target.classList.add('mod-modal-guidance-focus');
  }
  if (typeof target.setAttribute === 'function') {
    target.setAttribute('tabindex', '-1');
  }
  if (typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  _focusInlineElement(target);
}

function _focusGuidedService(container) {
  if (!container || typeof container.querySelector !== 'function') return;
  var target = container.querySelector('.ship-repair-card');
  if (!target) return;
  if (target.classList && typeof target.classList.add === 'function') {
    target.classList.add('mod-modal-guidance-focus');
  }
  if (typeof target.setAttribute === 'function') target.setAttribute('tabindex', '-1');
  if (typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  var serviceButton = target.querySelector && target.querySelector('.ship-repair-start-btn:not([disabled])');
  _focusInlineElement(serviceButton || target);
}

function _openCrewModal(state, shipIndex, onRecruitCrew, onAssignCrew, onUnassignCrew, onDismissCrew, onSwitchShip) {
  _inspectedHangarShipIndex = shipIndex;
  var modal = document.getElementById('crew-modal');
  if (!modal) return false;
  var modalBox = modal.querySelector('.modal-box');
  if (!modalBox || !state.fleet || !state.fleet[shipIndex]) return false;
  _closeActiveFleetSurface({ restoreFocus: false });

  var portalOpened = _openInlinePortal('crew-modal', function () {
    hideBlockingSurface('crew-modal');
  }, {
    labelledBy: 'crew-modal-title',
    describedBy: 'crew-modal-desc crew-modal-summary',
    returnFocusSelector: '.fleet-open-crew-btn[data-ship-index="' + shipIndex + '"]',
  });
  if (!portalOpened) showBlockingSurface('crew-modal', { focusSelector: '#crew-modal-close' });
  _activeCrewModalContext = { shipIndex: shipIndex };

  var titleEl = document.getElementById('crew-modal-title');
  var summaryEl = document.getElementById('crew-modal-summary');
  var assignedStatusEl = document.getElementById('crew-assigned-status');
  var reserveStatusEl = document.getElementById('crew-reserve-status');
  var marketStatusEl = document.getElementById('crew-market-status');
  var assignedEl = document.getElementById('crew-assigned-list');
  var reserveEl = document.getElementById('crew-reserve-list');
  var marketEl = document.getElementById('crew-market-list');

  function renderCrewModal() {
    var model = buildFleetCrewModel(state, shipIndex);
    var view = renderFleetCrew(model);
    if (!model || !view) return false;
    _activeCrewModalContext = {
      shipIndex: shipIndex,
      seatState: view.dataset.crewSeatState || '',
      reserveState: view.dataset.crewReserveState || '',
      marketState: view.dataset.crewMarketState || '',
    };
    Object.keys(view.dataset).forEach(function (key) {
      if (modal.dataset) modal.dataset[key] = view.dataset[key];
      if (modalBox.dataset) modalBox.dataset[key] = view.dataset[key];
    });
    titleEl.textContent = view.title;
    summaryEl.innerHTML = view.summary;
    assignedStatusEl.innerHTML = view.assignedStatus;
    reserveStatusEl.innerHTML = view.reserveStatus;
    marketStatusEl.innerHTML = view.marketStatus;
    assignedEl.innerHTML = view.assigned;
    reserveEl.innerHTML = view.reserve;
    marketEl.innerHTML = view.market;

    modalBox.onclick = function (event) {
      var intent = readFleetCrewIntent(event && event.target);
      if (!intent) return;
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      if (intent.type === FLEET_CREW_INTENT.UNASSIGN) {
        onUnassignCrew(intent.shipIndex, intent.crewId);
        return renderCrewModal();
      }
      if (intent.type === FLEET_CREW_INTENT.ASSIGN) {
        onAssignCrew(intent.shipIndex, intent.crewId);
        return renderCrewModal();
      }
      if (intent.type === FLEET_CREW_INTENT.RECRUIT) {
        onRecruitCrew(intent.offerId);
        return renderCrewModal();
      }
      if (intent.type === FLEET_CREW_INTENT.SWITCH_SHIP) {
        onSwitchShip(intent.shipIndex);
        setTimeout(renderCrewModal, 50);
        return;
      }
      if (intent.type === FLEET_CREW_INTENT.DISMISS) {
        var crewMember = model.reserveCrew.find(function (member) { return member.id === intent.crewId; });
        _openFleetConfirmation({
          type: 'crew-dismiss',
          shipIndex: shipIndex,
          crewId: intent.crewId,
        }, {
          kicker: '船员合同',
          title: '解雇「' + (crewMember ? crewMember.name : '该船员') + '」？',
          message: '该船员会从预备队永久移除，已积累的等级和经验无法恢复。',
          confirmLabel: '确认解雇',
          details: [
            { label: '当前岗位', value: crewMember ? (crewMember.roleName || crewMember.title || '未指定') : '预备队', tone: 'neutral' },
            { label: '人员记录', value: '永久移除', tone: 'danger' },
          ],
          onConfirm: function () {
            onDismissCrew(intent.crewId);
            renderCrewModal();
          },
        });
      }
    };
    return true;
  }

  renderCrewModal();
  document.getElementById('crew-modal-close').onclick = function () {
    _closeFleetSurface('crew-modal');
    _renderHangarAfterInlineClose();
  };
  return true;
}

// ---------------------------------------------------------------------------
// 船只商店（独立标签页）
// ---------------------------------------------------------------------------

/**
 * 渲染船只商店标签页
 * @param {{state:object, onCommand?:Function}} request
 */
export function renderShop(request) {
  var input = request || {};
  if (!input.state) return false;
  var container = document.getElementById('shop-list');
  if (!container) return false;
  var actions = _createFleetActionPorts(input.onCommand);
  container.innerHTML = renderFleetShop(buildFleetShopModel(input.state));
  container.onclick = function (event) {
    var intent = readFleetShopIntent(event && event.target);
    if (!intent) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    actions.onBuyShip(intent.shipTypeId);
  };
  return true;
}
export function openDispatchModal(request) {
  var input = request || {};
  if (!input.state || !Number.isInteger(input.shipIndex)) return false;
  var actions = _createFleetActionPorts(input.onCommand);
  return _openDispatchModal(input.state, input.shipIndex, actions.onAssignRoute, actions.onCancelRoute, input.preset) !== false;
}

export function openCrewModal(request) {
  var input = request || {};
  if (!input.state || !Number.isInteger(input.shipIndex)) return false;
  var actions = _createFleetActionPorts(input.onCommand);
  return _openCrewModal(input.state, input.shipIndex, actions.onRecruitCrew, actions.onAssignCrew, actions.onUnassignCrew, actions.onDismissCrew, actions.onSwitchShip) !== false;
}

export function openModModal(request) {
  var input = request || {};
  if (!input.state || !Number.isInteger(input.shipIndex)) return false;
  var actions = _createFleetActionPorts(input.onCommand);
  return _openModModal(input.state, input.shipIndex, actions.onInstallMod, actions.onUninstallMod, actions.onUpgradeShip, actions.onServiceShip, actions.onSellShip, input.options) !== false;
}

export function getActiveModModalContext() {
  if (!_activeModModalContext) return null;
  return Object.assign({}, _activeModModalContext);
}

export function getActiveDispatchModalContext() {
  if (!_activeDispatchModalContext) return null;
  return Object.assign({}, _activeDispatchModalContext);
}

// ---------------------------------------------------------------------------
// 改装弹窗
// ---------------------------------------------------------------------------

function _openModModal(state, shipIndex, onInstallMod, onUninstallMod, onUpgradeShip, onServiceShip, onSellShip, options) {
  _inspectedHangarShipIndex = shipIndex;
  var modal = document.getElementById('mod-modal');
  if (!modal) return false;
  var body = document.getElementById('mod-modal-body');
  var title = document.getElementById('mod-modal-title');
  if (!body || !title) return false;
  _closeActiveFleetSurface({ restoreFocus: false });
  var opts = options || {};
  var focusModId = opts.focusModId || '';
  var focusService = !!opts.focusService;
  var portalOpened = _openInlinePortal('mod-modal', function () {
    hideBlockingSurface('mod-modal');
  }, {
    labelledBy: 'mod-modal-title',
    describedBy: 'mod-modal-desc mod-modal-body',
    returnFocusSelector: '.fleet-open-mod-btn[data-ship-index="' + shipIndex + '"]',
  });
  if (!portalOpened) showBlockingSurface('mod-modal', { focusSelector: '#mod-modal-close' });
  _activeModModalContext = {
    shipIndex: shipIndex,
    focusModId: focusModId,
    focusService: focusService,
    recommendedModId: '',
  };

  function renderModModal() {
    var model = buildFleetModModel(state, shipIndex, {
      focusModId: focusModId,
      focusService: focusService,
    });
    var view = renderFleetMod(model);
    if (!model || !view) {
      _closeFleetSurface('mod-modal');
      return false;
    }
    _activeModModalContext = {
      shipIndex: shipIndex,
      focusModId: focusModId,
      focusService: focusService,
      recommendedModId: model.modRecommendation ? model.modRecommendation.modId : '',
    };
    title.textContent = view.title;
    body.innerHTML = view.html;
    if (focusService) _focusGuidedService(body);
    else _focusGuidedMod(body, focusModId);

    body.onclick = function (event) {
      var intent = readFleetModIntent(event && event.target);
      if (!intent) return;
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      if (intent.type === FLEET_MOD_INTENT.UPGRADE) {
        onUpgradeShip(intent.shipIndex, intent.upgradeId);
        return setTimeout(renderModModal, 50);
      }
      if (intent.type === FLEET_MOD_INTENT.INSTALL) {
        onInstallMod(intent.shipIndex, intent.modId);
        return setTimeout(renderModModal, 50);
      }
      if (intent.type === FLEET_MOD_INTENT.UNINSTALL) {
        onUninstallMod(intent.shipIndex, intent.modId);
        return setTimeout(renderModModal, 50);
      }
      if (intent.type === FLEET_MOD_INTENT.SERVICE) {
        onServiceShip(intent.shipIndex);
        return setTimeout(renderModModal, 50);
      }
      if (intent.type !== FLEET_MOD_INTENT.SELL) return;
      var currentShip = model.ship;
      _openFleetConfirmation({
        type: 'ship-sell',
        shipIndex: intent.shipIndex,
      }, {
        kicker: '舰船处置',
        title: '卖出「' + currentShip.emoji + ' ' + currentShip.name + '」？',
        message: '舰船会从船队永久移除，货舱中的全部货物也会一并清空。',
        confirmLabel: '确认卖出舰船',
        details: [
          { label: '预计回收', value: model.sellQuote.minPrice.toLocaleString() + ' ~ ' + model.sellQuote.maxPrice.toLocaleString() + ' 积分', tone: 'safe' },
          { label: '舰船货舱', value: '全部清空', tone: 'danger' },
        ],
        onConfirm: function () {
          onSellShip(intent.shipIndex);
          setTimeout(function () {
            if (state.fleet.length <= intent.shipIndex || state.fleet[intent.shipIndex] !== currentShip) {
              _closeFleetSurface('mod-modal');
              _renderHangarAfterInlineClose();
              return;
            }
            renderModModal();
          }, 50);
        },
      });
    };
    return true;
  }

  renderModModal();
  document.getElementById('mod-modal-close').onclick = function () {
    _closeFleetSurface('mod-modal');
    _renderHangarAfterInlineClose();
  };
  return true;
}

// ---------------------------------------------------------------------------
// 派遣配置弹窗
// ---------------------------------------------------------------------------

function _openDispatchModal(state, shipIndex, onAssignRoute, onCancelRoute, preset) {
  _inspectedHangarShipIndex = shipIndex;
  const modal = document.getElementById('dispatch-modal');
  if (!modal || !state.fleet || !state.fleet[shipIndex]) return false;
  _closeActiveFleetSurface({ restoreFocus: false });

  var portalOpened = _openInlinePortal('dispatch-modal', function() {
    hideBlockingSurface('dispatch-modal');
  }, {
    labelledBy: 'dispatch-title',
    describedBy: 'dispatch-modal-desc dispatch-route-summary dispatch-primary-hint dispatch-policy-status',
    returnFocusSelector: '.fleet-dispatch-btn[data-index="' + shipIndex + '"]',
  });
  if (!portalOpened) showBlockingSurface('dispatch-modal', { focusSelector: '#dispatch-buy-system' });

  const ship = state.fleet[shipIndex];
  const effectiveShipStats = Fleet.getEffectiveShipStats(state, ship);
  const dispatchPreset = preset || null;
  const presetRecommendation = dispatchPreset && dispatchPreset.recommendation ? dispatchPreset.recommendation : null;
  _activeDispatchModalContext = {
    shipIndex: shipIndex,
    buySystemId: (presetRecommendation && presetRecommendation.buySystemId) || (dispatchPreset && dispatchPreset.buySystemId) || '',
    sellSystemId: (presetRecommendation && presetRecommendation.sellSystemId) || (dispatchPreset && dispatchPreset.sellSystemId) || '',
    goodId: (presetRecommendation && presetRecommendation.goodId) || (dispatchPreset && dispatchPreset.goodId) || '',
  };
  const isActive = shipIndex === (state.activeShipIndex || 0);
  const routeLevel = Fleet.getDispatchRouteLevel(state);
  const shipLocationSystem = SYSTEMS.find(function (sys) { return sys.id === ship.location; });
  const currentLocationSystemId = isActive ? state.currentSystem : (ship.location || state.currentSystem);
  const dispatchGalaxyId = isActive
    ? (state.currentGalaxy || 'milky_way')
    : ((shipLocationSystem && shipLocationSystem.galaxyId) || state.currentGalaxy || 'milky_way');

  document.getElementById('dispatch-title').textContent =
    (isActive ? '自动跑商' : '设置跑商') + '「' + ship.emoji + ' ' + ship.name + '」';

  // 填充星系选择
  const buySelect  = document.getElementById('dispatch-buy-system');
  const sellSelect = document.getElementById('dispatch-sell-system');
  const goodSelect = document.getElementById('dispatch-good');
  const maxBuyInput = document.getElementById('dispatch-max-buy-price');
  const minSellInput = document.getElementById('dispatch-min-sell-price');
  const minProfitInput = document.getElementById('dispatch-min-profit-rate');
  const riskModeSelect = document.getElementById('dispatch-risk-mode');
  const marketModeSelect = document.getElementById('dispatch-market-mode');
  const estimateEl = document.getElementById('dispatch-estimate');
  const confirmBtn = document.getElementById('dispatch-confirm');
  const cancelBtn = document.getElementById('dispatch-cancel');
  const primaryHintEl = document.getElementById('dispatch-primary-hint');
  const policyStatusEl = document.getElementById('dispatch-policy-status');
  const advancedPanel = document.getElementById('dispatch-advanced-panel');
  const routeSummaryEl = document.getElementById('dispatch-route-summary');
  const summaryBuyEl = document.getElementById('dispatch-summary-buy');
  const summarySellEl = document.getElementById('dispatch-summary-sell');
  const summaryGoodEl = document.getElementById('dispatch-summary-good');
  const summaryPolicyEl = document.getElementById('dispatch-summary-policy');
  var existingPolicy = dispatchPreset && dispatchPreset.tradePolicy
    ? dispatchPreset.tradePolicy
    : (presetRecommendation && presetRecommendation.recommendedTradePolicy
        ? presetRecommendation.recommendedTradePolicy
        : (ship.route && ship.route.tradePolicy ? ship.route.tradePolicy : {}));
  function _syncActiveDispatchContext() {
    if (!_activeDispatchModalContext) return;
    _activeDispatchModalContext.buySystemId = buySelect.value || '';
    _activeDispatchModalContext.sellSystemId = sellSelect.value || '';
    _activeDispatchModalContext.goodId = goodSelect.value || '';
    _activeDispatchModalContext.tradePolicy = _readTradePolicy();
    _activeDispatchModalContext.advancedOpen = !!(advancedPanel && advancedPanel.open);
  }

  function _updateRouteSummary(estimate, warnings, readiness) {
    var summary = buildFleetDispatchRouteSummary(_readSelection(), estimate, warnings, readiness);
    if (summaryBuyEl) summaryBuyEl.textContent = summary.buyLabel;
    if (summarySellEl) summarySellEl.textContent = summary.sellLabel;
    if (summaryGoodEl) summaryGoodEl.textContent = summary.goodLabel;
    if (summaryPolicyEl) summaryPolicyEl.textContent = summary.policyLabel;
    if (routeSummaryEl) routeSummaryEl.dataset.routeState = summary.state;
    _syncActiveDispatchContext();
  }

  function _updatePrimaryHint(estimate, recommendation, policyValidation, readiness) {
    if (!confirmBtn || !primaryHintEl) return;
    var view = buildFleetDispatchPrimaryView({
      estimate: estimate,
      recommendation: recommendation,
      validation: policyValidation,
      readiness: readiness,
      selection: _readSelection(),
      hasExistingRoute: !!(state.fleet[shipIndex] && state.fleet[shipIndex].route),
    });
    confirmBtn.textContent = view.buttonLabel;
    confirmBtn.disabled = view.disabled;
    confirmBtn.setAttribute('aria-disabled', confirmBtn.disabled ? 'true' : 'false');
    modal.dataset.dispatchState = view.state;
    if (_activeDispatchModalContext) _activeDispatchModalContext.status = view.state;
    primaryHintEl.className = view.className;
    primaryHintEl.textContent = view.text;
  }

  var playerLevel = state.playerLevel || 1;
  var dispatchContext = {
    state: state,
    ship: ship,
    shipIndex: shipIndex,
    effectiveShipStats: effectiveShipStats,
    currentLocationSystemId: currentLocationSystemId,
    dispatchGalaxyId: dispatchGalaxyId,
    playerLevel: playerLevel,
  };
  var dispatchAccessLevel = isActive ? playerLevel : routeLevel;
  var recommendationPlanets = [];
  var recommendationPlanetLookup = Object.create(null);
  getAccessibleGalaxies(playerLevel, state.researchedTechs || []).forEach(function (galaxy) {
    getSystemsByGalaxy(galaxy.id).forEach(function (sys) {
      var minLvl = sys.minLevel || 1;
      if (dispatchAccessLevel < minLvl || recommendationPlanetLookup[sys.id]) return;
      recommendationPlanets.push(sys);
      recommendationPlanetLookup[sys.id] = true;
    });
  });

  // 默认仍展示当前星系航线，打开弹窗时会主动搜索全部已开放星系的最优路线
  var allGalaxyPlanets = getSystemsByGalaxy(dispatchGalaxyId).filter(function (sys) {
    var minLvl = sys.minLevel || 1;
    return dispatchAccessLevel >= minLvl;
  });
  var planetLookup = Object.create(null);
  allGalaxyPlanets.forEach(function (system) {
    planetLookup[system.id] = true;
  });

  function _appendPresetSystem(systemId) {
    var system = SYSTEMS.find(function (entry) { return entry.id === systemId; });
    if (!system || planetLookup[system.id]) return;
    allGalaxyPlanets.push(system);
    planetLookup[system.id] = true;
  }

  if (dispatchPreset) {
    _appendPresetSystem(dispatchPreset.buySystemId);
    _appendPresetSystem(dispatchPreset.sellSystemId);
  }
  if (presetRecommendation) {
    _appendPresetSystem(presetRecommendation.buySystemId);
    _appendPresetSystem(presetRecommendation.sellSystemId);
  }

  maxBuyInput.value = Number.isFinite(existingPolicy.maxBuyPrice) ? existingPolicy.maxBuyPrice : '';
  minSellInput.value = Number.isFinite(existingPolicy.minSellPrice) ? existingPolicy.minSellPrice : '';
  minProfitInput.value = Number.isFinite(existingPolicy.minProfitRate) ? Math.round(existingPolicy.minProfitRate * 100) : '';
  riskModeSelect.value = existingPolicy.riskMode || 'balanced';
  marketModeSelect.value = existingPolicy.marketMode || 'open';

  function _buildMarketOptions() {
    var marketMode = marketModeSelect.value || 'open';
    var buyPlanets = marketMode === 'black'
      ? allGalaxyPlanets.filter(function (sys) { return AutoTrade.canUseMarket(state, sys.id, 'black'); })
      : allGalaxyPlanets.slice();
    var sellPlanets = allGalaxyPlanets.slice();
    var previousBuy = buySelect.value;
    var previousSell = sellSelect.value;
    var previousGood = goodSelect.value;

    buySelect.innerHTML = '';
    sellSelect.innerHTML = '';
    goodSelect.innerHTML = '';

    if (buyPlanets.length === 0 || sellPlanets.length < 2) {
      var emptyText = marketMode === 'black' ? '当前候选中无可用黑市路线' : '需要更多航线（购买席位解锁）';
      buySelect.innerHTML = '<option value="">' + emptyText + '</option>';
      sellSelect.innerHTML = '<option value="">' + emptyText + '</option>';
    } else {
      buySelect.innerHTML = buildFleetDispatchSystemOptions(buyPlanets, dispatchGalaxyId);
      sellSelect.innerHTML = buildFleetDispatchSystemOptions(sellPlanets, dispatchGalaxyId);
    }

    goodSelect.innerHTML = buildFleetDispatchGoodOptions(marketMode);

    if (ship.route) {
      if (buySelect.querySelector('option[value="' + ship.route.buySystemId + '"]')) buySelect.value = ship.route.buySystemId;
      if (sellSelect.querySelector('option[value="' + ship.route.sellSystemId + '"]')) sellSelect.value = ship.route.sellSystemId;
      if (goodSelect.querySelector('option[value="' + ship.route.goodId + '"]')) goodSelect.value = ship.route.goodId;
    }

    if (!buySelect.value && previousBuy && buySelect.querySelector('option[value="' + previousBuy + '"]')) buySelect.value = previousBuy;
    if (!sellSelect.value && previousSell && sellSelect.querySelector('option[value="' + previousSell + '"]')) sellSelect.value = previousSell;
    if (!goodSelect.value && previousGood && goodSelect.querySelector('option[value="' + previousGood + '"]')) goodSelect.value = previousGood;

    if (!buySelect.value && buySelect.querySelector('option[value="' + currentLocationSystemId + '"]')) {
      buySelect.value = currentLocationSystemId;
    }
    if ((!sellSelect.value || sellSelect.value === buySelect.value) && sellSelect.options.length > 1) {
      sellSelect.selectedIndex = sellSelect.options[0].value === buySelect.value ? 1 : 0;
    }

    if (dispatchPreset) {
      if (dispatchPreset.buySystemId && buySelect.querySelector('option[value="' + dispatchPreset.buySystemId + '"]')) buySelect.value = dispatchPreset.buySystemId;
      if (dispatchPreset.sellSystemId && sellSelect.querySelector('option[value="' + dispatchPreset.sellSystemId + '"]')) sellSelect.value = dispatchPreset.sellSystemId;
      if (dispatchPreset.goodId && goodSelect.querySelector('option[value="' + dispatchPreset.goodId + '"]')) goodSelect.value = dispatchPreset.goodId;
    }
  }

  function _readTradePolicy() {
    return parseFleetDispatchPolicy({
      maxBuyPrice: maxBuyInput.value,
      minSellPrice: minSellInput.value,
      minProfitRatePercent: minProfitInput.value,
      riskMode: riskModeSelect.value || 'balanced',
      marketMode: marketModeSelect.value || 'open',
    });
  }

  function _readSelection() {
    return {
      buySystemId: buySelect.value,
      sellSystemId: sellSelect.value,
      goodId: goodSelect.value,
      tradePolicy: _readTradePolicy(),
    };
  }

  function _validateTradePolicyInputs() {
    var validation = validateFleetDispatchPolicy({
      maxBuyPrice: maxBuyInput.value,
      minSellPrice: minSellInput.value,
      minProfitRatePercent: minProfitInput.value,
    });
    [
      { element: maxBuyInput, key: 'maxBuyPrice' },
      { element: minSellInput, key: 'minSellPrice' },
      { element: minProfitInput, key: 'minProfitRatePercent' },
    ].forEach(function (field) {
      if (validation.fieldValidity[field.key]) field.element.removeAttribute('aria-invalid');
      else field.element.setAttribute('aria-invalid', 'true');
    });
    var status = buildFleetDispatchPolicyStatus(validation);
    modal.dataset.dispatchPolicyState = status.state;
    if (_activeDispatchModalContext) _activeDispatchModalContext.policyStatus = status.state;
    if (policyStatusEl) {
      policyStatusEl.className = status.className;
      policyStatusEl.textContent = status.text;
    }
    return validation;
  }

  function _getEstimateData() {
    return buildFleetDispatchEstimate(dispatchContext, _readSelection());
  }

  function _getDispatchReadiness(estimate) {
    return getFleetDispatchReadiness(dispatchContext, estimate);
  }

  function _getSuggestedRecommendation() {
    return findFleetDispatchRecommendation(
      dispatchContext,
      _readTradePolicy(),
      recommendationPlanets.map(function (system) { return system.id; })
    );
  }

  function _applyRecommendationSelection(recommendation) {
    if (!recommendation) return;

    if (!planetLookup[recommendation.buySystemId] || !planetLookup[recommendation.sellSystemId]) {
      _appendPresetSystem(recommendation.buySystemId);
      _appendPresetSystem(recommendation.sellSystemId);
      _buildMarketOptions();
    }

    buySelect.value = recommendation.buySystemId;
    sellSelect.value = recommendation.sellSystemId;
    goodSelect.value = recommendation.goodId;
  }

  function _renderEstimate(estimate, recommendation, warnings, readiness) {
    estimateEl.innerHTML = renderFleetDispatchEstimate(dispatchContext, {
      estimate: estimate,
      recommendation: recommendation,
      warnings: warnings,
      readiness: readiness,
    });
  }

  function _applySuggestedRoute() {
    var recommendation = _getSuggestedRecommendation();

    if (!recommendation) {
      estimateEl.textContent = '没有找到符合当前设置的跑商路线。可展开可选设置调整后再试。';
      _updateRouteSummary(null, []);
      _updatePrimaryHint(null, null);
      return null;
    }

    _applyRecommendationSelection(recommendation);
    _updateEstimate(recommendation);
    return recommendation;
  }

  // 预估利润
  function _updateEstimate(recommendation) {
    var policyValidation = _validateTradePolicyInputs();
    if (!policyValidation.valid) {
      estimateEl.textContent = '请先修正可选设置中的无效数字，再查看路线估算。';
      _updateRouteSummary(null, []);
      if (summaryPolicyEl) {
        summaryPolicyEl.textContent =
          formatFleetDispatchMarketMode(marketModeSelect.value) + ' · ' +
          formatFleetDispatchRiskMode(riskModeSelect.value) + ' · 输入有误';
      }
      _updatePrimaryHint(null, null, policyValidation);
      return;
    }
    var estimate = _getEstimateData();
    var suggestedRecommendation = recommendation || null;
    if (!estimate) {
      estimateEl.textContent = recommendation
        ? '当前推荐路线暂不能开始，可调整设置后再试。'
        : '当前设置无法组成可执行的自动跑商路线。';
      _updateRouteSummary(null, []);
      _updatePrimaryHint(null, suggestedRecommendation, policyValidation);
      return;
    }
    var readiness = _getDispatchReadiness(estimate);
    var warnings = buildFleetDispatchWarnings(state, estimate);

    _updateRouteSummary(estimate, warnings, readiness);
    _renderEstimate(estimate, recommendation, warnings, readiness);
    _updatePrimaryHint(estimate, suggestedRecommendation, policyValidation, readiness);
  }

  _buildMarketOptions();
  if (advancedPanel) advancedPanel.open = hasCustomFleetDispatchPolicy(existingPolicy);
  buySelect.onchange  = function () { _updateEstimate(); };
  sellSelect.onchange = function () { _updateEstimate(); };
  goodSelect.onchange = function () { _updateEstimate(); };
  maxBuyInput.oninput = function () { _updateEstimate(); };
  minSellInput.oninput = function () { _updateEstimate(); };
  minProfitInput.oninput = function () { _updateEstimate(); };
  riskModeSelect.onchange = function () { _updateEstimate(); };
  marketModeSelect.onchange = function () {
    _buildMarketOptions();
    _updateEstimate();
  };

  var hasPresetRoute = !!(dispatchPreset && dispatchPreset.buySystemId && dispatchPreset.sellSystemId && dispatchPreset.goodId);
  var hasExistingRoute = !!ship.route;
  var initialRecommendation = presetRecommendation || null;

  if (hasPresetRoute && !initialRecommendation) {
    initialRecommendation = {
      buySystemId: dispatchPreset.buySystemId,
      sellSystemId: dispatchPreset.sellSystemId,
      goodId: dispatchPreset.goodId,
      buySystemName: (SYSTEMS.find(function (sys) { return sys.id === dispatchPreset.buySystemId; }) || {}).name || dispatchPreset.buySystemId,
      sellSystemName: (SYSTEMS.find(function (sys) { return sys.id === dispatchPreset.sellSystemId; }) || {}).name || dispatchPreset.sellSystemId,
      goodName: (GOODS.find(function (good) { return good.id === dispatchPreset.goodId; }) || {}).name || dispatchPreset.goodId,
      recommendedTradePolicy: dispatchPreset.tradePolicy || _readTradePolicy(),
    };
  }
  if (!initialRecommendation && !hasExistingRoute) {
    initialRecommendation = _applySuggestedRoute();
  }

  if (initialRecommendation) {
    _applyRecommendationSelection(initialRecommendation);
    _updateEstimate(initialRecommendation);
  } else {
    _updateEstimate(presetRecommendation);
  }

  // 确认
  confirmBtn.onclick = function () {
    var policyValidation = _validateTradePolicyInputs();
    var estimate = _getEstimateData();
    var readiness = _getDispatchReadiness(estimate);
    if (!policyValidation.valid || confirmBtn.disabled) {
      _updatePrimaryHint(estimate, initialRecommendation, policyValidation, readiness);
      return;
    }
    var result = onAssignRoute(shipIndex, buySelect.value, sellSelect.value, goodSelect.value, _readTradePolicy());
    if (result && result.ok === false) {
      var firstMessage = result.msgs && result.msgs[0] ? result.msgs[0].text : '路线启动失败，请检查飞船状态后重试。';
      modal.dataset.dispatchState = 'blocked';
      primaryHintEl.className = 'dispatch-primary-hint dispatch-primary-hint--danger';
      primaryHintEl.textContent = firstMessage;
      return;
    }
    _closeFleetSurface('dispatch-modal');
    _renderHangarAfterInlineClose();
  };

  cancelBtn.onclick = function () {
    _closeFleetSurface('dispatch-modal');
    _renderHangarAfterInlineClose();
  };
  return true;
}
