// js/ui/FleetCrewController.js — 船员弹层、名单委托与危险解雇确认

import {
  FLEET_CREW_INTENT,
  buildFleetCrewModel,
  readFleetCrewIntent,
  renderFleetCrew,
} from './FleetCrewPresenter.js';

const CREW_MODAL_ID = 'crew-modal';

function _copyContext(context, freeze) {
  if (!context) return null;
  var copy = Object.assign({}, context);
  return freeze ? Object.freeze(copy) : copy;
}

function _getDocument(config) {
  if (typeof config.getDocument === 'function') return config.getDocument();
  return globalThis.document || null;
}

export function createFleetCrewController(options) {
  var config = options || {};
  var activeContext = null;
  var activeBindings = [];
  var generation = 0;
  var openCount = 0;
  var closeCount = 0;
  var renderCount = 0;
  var commandCount = 0;
  var confirmationCount = 0;
  var scheduledRenderCount = 0;
  var droppedRenderCount = 0;
  var droppedConfirmationCount = 0;
  var resetCount = 0;
  var lastIntent = null;
  var lastOpenStatus = 'idle';
  var lastCloseReason = null;

  function _bindProperty(element, property, handler) {
    if (!element) return;
    var existing = activeBindings.find(function (binding) {
      return binding.element === element && binding.property === property;
    });
    if (existing) existing.handler = handler;
    else activeBindings.push({ element: element, property: property, handler: handler });
    element[property] = handler;
  }

  function _clearBindings() {
    activeBindings.forEach(function (binding) {
      if (binding.element[binding.property] === binding.handler) {
        binding.element[binding.property] = null;
      }
    });
    activeBindings = [];
  }

  function clearContext(reason) {
    var hadContext = !!activeContext;
    generation += 1;
    _clearBindings();
    activeContext = null;
    if (hadContext) closeCount += 1;
    if (reason) lastCloseReason = reason;
    return hadContext;
  }

  function _closeAndRender(reason) {
    clearContext(reason || 'close');
    if (typeof config.closeSurface === 'function') config.closeSurface(CREW_MODAL_ID);
    if (typeof config.requestHangarRender === 'function') config.requestHangarRender();
  }

  function _scheduleRender(callback) {
    var scheduledGeneration = generation;
    var schedule = typeof config.schedule === 'function'
      ? config.schedule
      : function (task) { return setTimeout(task, 50); };
    scheduledRenderCount += 1;
    schedule(function () {
      if (scheduledGeneration !== generation || !activeContext) {
        droppedRenderCount += 1;
        return;
      }
      callback();
    }, 50);
  }

  function getActiveContext() {
    return _copyContext(activeContext, false);
  }

  function getDiagnostics() {
    return Object.freeze({
      openCount: openCount,
      closeCount: closeCount,
      renderCount: renderCount,
      commandCount: commandCount,
      confirmationCount: confirmationCount,
      scheduledRenderCount: scheduledRenderCount,
      droppedRenderCount: droppedRenderCount,
      droppedConfirmationCount: droppedConfirmationCount,
      resetCount: resetCount,
      lastIntent: lastIntent,
      lastOpenStatus: lastOpenStatus,
      lastCloseReason: lastCloseReason,
      activeContext: _copyContext(activeContext, true),
    });
  }

  function reset() {
    clearContext('reset');
    openCount = 0;
    closeCount = 0;
    renderCount = 0;
    commandCount = 0;
    confirmationCount = 0;
    scheduledRenderCount = 0;
    droppedRenderCount = 0;
    droppedConfirmationCount = 0;
    lastIntent = null;
    lastOpenStatus = 'idle';
    lastCloseReason = null;
    resetCount += 1;
    return getDiagnostics();
  }

  function open(request) {
    var input = request || {};
    var state = input.state;
    var shipIndex = input.shipIndex;
    var doc = _getDocument(config);
    if (typeof config.setInspectedShipIndex === 'function') config.setInspectedShipIndex(shipIndex);
    if (!doc || !state || !Number.isInteger(shipIndex) || !state.fleet || !state.fleet[shipIndex]) {
      lastOpenStatus = 'invalid-request';
      return false;
    }

    var modal = doc.getElementById(CREW_MODAL_ID);
    var modalBox = modal && typeof modal.querySelector === 'function' ? modal.querySelector('.modal-box') : null;
    var titleEl = doc.getElementById('crew-modal-title');
    var summaryEl = doc.getElementById('crew-modal-summary');
    var assignedStatusEl = doc.getElementById('crew-assigned-status');
    var reserveStatusEl = doc.getElementById('crew-reserve-status');
    var marketStatusEl = doc.getElementById('crew-market-status');
    var assignedEl = doc.getElementById('crew-assigned-list');
    var reserveEl = doc.getElementById('crew-reserve-list');
    var marketEl = doc.getElementById('crew-market-list');
    var closeButton = doc.getElementById('crew-modal-close');
    var requiredNodes = [
      modal,
      modalBox,
      titleEl,
      summaryEl,
      assignedStatusEl,
      reserveStatusEl,
      marketStatusEl,
      assignedEl,
      reserveEl,
      marketEl,
      closeButton,
    ];
    if (requiredNodes.some(function (node) { return !node; })) {
      lastOpenStatus = 'missing-dom';
      return false;
    }

    if (typeof config.closeActiveSurface === 'function') {
      config.closeActiveSurface({ restoreFocus: false });
    }
    clearContext('replace');
    generation += 1;

    var portalOpened = typeof config.openInlinePortal === 'function' && config.openInlinePortal(CREW_MODAL_ID, function () {
      if (typeof config.hideBlockingSurface === 'function') config.hideBlockingSurface(CREW_MODAL_ID);
    }, {
      labelledBy: 'crew-modal-title',
      describedBy: 'crew-modal-desc crew-modal-summary',
      returnFocusSelector: '.fleet-open-crew-btn[data-ship-index="' + shipIndex + '"]',
    });
    if (!portalOpened && typeof config.showBlockingSurface === 'function') {
      config.showBlockingSurface(CREW_MODAL_ID, { focusSelector: '#crew-modal-close' });
    }

    activeContext = { shipIndex: shipIndex };
    openCount += 1;
    lastOpenStatus = portalOpened ? 'inline' : 'blocking';
    lastCloseReason = null;

    function renderModal() {
      if (!activeContext) return false;
      var model = buildFleetCrewModel(state, shipIndex);
      var view = model ? renderFleetCrew(model) : null;
      if (!model || !view) {
        clearContext('invalid-model');
        if (typeof config.closeSurface === 'function') config.closeSurface(CREW_MODAL_ID);
        return false;
      }
      activeContext = {
        shipIndex: shipIndex,
        seatState: view.dataset.crewSeatState || '',
        reserveState: view.dataset.crewReserveState || '',
        marketState: view.dataset.crewMarketState || '',
      };
      renderCount += 1;
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

      _bindProperty(modalBox, 'onclick', function (event) {
        var intent = readFleetCrewIntent(event && event.target);
        if (!intent) return;
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        lastIntent = intent.type;
        if (intent.type === FLEET_CREW_INTENT.UNASSIGN) {
          commandCount += 1;
          if (typeof input.onUnassignCrew === 'function') input.onUnassignCrew(intent.shipIndex, intent.crewId);
          return renderModal();
        }
        if (intent.type === FLEET_CREW_INTENT.ASSIGN) {
          commandCount += 1;
          if (typeof input.onAssignCrew === 'function') input.onAssignCrew(intent.shipIndex, intent.crewId);
          return renderModal();
        }
        if (intent.type === FLEET_CREW_INTENT.RECRUIT) {
          commandCount += 1;
          if (typeof input.onRecruitCrew === 'function') input.onRecruitCrew(intent.offerId);
          return renderModal();
        }
        if (intent.type === FLEET_CREW_INTENT.SWITCH_SHIP) {
          commandCount += 1;
          if (typeof input.onSwitchShip === 'function') input.onSwitchShip(intent.shipIndex);
          _scheduleRender(renderModal);
          return;
        }
        if (intent.type !== FLEET_CREW_INTENT.DISMISS) return;
        confirmationCount += 1;
        var crewMember = model.reserveCrew.find(function (member) { return member.id === intent.crewId; });
        var confirmationGeneration = generation;
        if (typeof config.openConfirmation !== 'function') return;
        config.openConfirmation({
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
            if (confirmationGeneration !== generation || !activeContext) {
              droppedConfirmationCount += 1;
              return;
            }
            commandCount += 1;
            if (typeof input.onDismissCrew === 'function') input.onDismissCrew(intent.crewId);
            renderModal();
          },
        });
      });
      return true;
    }

    if (!renderModal()) return false;
    _bindProperty(closeButton, 'onclick', function () {
      _closeAndRender('close-button');
    });
    return true;
  }

  return Object.freeze({
    clearContext: clearContext,
    getActiveContext: getActiveContext,
    getDiagnostics: getDiagnostics,
    open: open,
    reset: reset,
  });
}
