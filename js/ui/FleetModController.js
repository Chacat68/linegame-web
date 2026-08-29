// js/ui/FleetModController.js — 舰船改装/保养弹层、引导焦点与危险操作

import {
  FLEET_MOD_INTENT,
  buildFleetModModel,
  readFleetModIntent,
  renderFleetMod,
} from './FleetModPresenter.js';

const MOD_MODAL_ID = 'mod-modal';

function _copyContext(context, freeze) {
  if (!context) return null;
  var copy = Object.assign({}, context);
  return freeze ? Object.freeze(copy) : copy;
}

function _getDocument(config) {
  if (typeof config.getDocument === 'function') return config.getDocument();
  return globalThis.document || null;
}

function _focusElement(target) {
  if (!target || typeof target.focus !== 'function' || target.disabled || target.isConnected === false) return false;
  try {
    target.focus({ preventScroll: true });
  } catch (error) {
    target.focus();
  }
  return true;
}

export function createFleetModController(options) {
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
  var focusRequestCount = 0;
  var focusSuccessCount = 0;
  var resetCount = 0;
  var lastIntent = null;
  var lastOpenStatus = 'idle';
  var lastCloseReason = null;

  function _bindProperty(element, property, handler) {
    if (!element) return;
    var existing = activeBindings.find(function (binding) {
      return binding.element === element && binding.property === property;
    });
    if (existing) {
      existing.handler = handler;
    } else {
      activeBindings.push({ element: element, property: property, handler: handler });
    }
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
    if (typeof config.closeSurface === 'function') config.closeSurface(MOD_MODAL_ID);
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

  function _focusGuidedMod(container, focusModId) {
    if (!focusModId) return false;
    focusRequestCount += 1;
    if (!container || typeof container.querySelector !== 'function') return false;
    var target = container.querySelector('[data-focus-mod="item"]')
      || container.querySelector('[data-focus-mod="recommendation"]');
    if (!target) return false;
    if (target.classList && typeof target.classList.add === 'function') {
      target.classList.add('mod-modal-guidance-focus');
    }
    if (typeof target.setAttribute === 'function') target.setAttribute('tabindex', '-1');
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    if (!_focusElement(target)) return false;
    focusSuccessCount += 1;
    return true;
  }

  function _focusGuidedService(container) {
    focusRequestCount += 1;
    if (!container || typeof container.querySelector !== 'function') return false;
    var target = container.querySelector('.ship-repair-card');
    if (!target) return false;
    if (target.classList && typeof target.classList.add === 'function') {
      target.classList.add('mod-modal-guidance-focus');
    }
    if (typeof target.setAttribute === 'function') target.setAttribute('tabindex', '-1');
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    var serviceButton = target.querySelector && target.querySelector('.ship-repair-start-btn:not([disabled])');
    if (!_focusElement(serviceButton || target)) return false;
    focusSuccessCount += 1;
    return true;
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
      focusRequestCount: focusRequestCount,
      focusSuccessCount: focusSuccessCount,
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
    focusRequestCount = 0;
    focusSuccessCount = 0;
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

    var modal = doc.getElementById(MOD_MODAL_ID);
    var body = doc.getElementById('mod-modal-body');
    var title = doc.getElementById('mod-modal-title');
    var closeButton = doc.getElementById('mod-modal-close');
    if (!modal || !body || !title || !closeButton) {
      lastOpenStatus = 'missing-dom';
      return false;
    }

    if (typeof config.closeActiveSurface === 'function') {
      config.closeActiveSurface({ restoreFocus: false });
    }
    clearContext('replace');
    generation += 1;

    var opts = input.options || {};
    var focusModId = opts.focusModId || '';
    var focusService = !!opts.focusService;
    var portalOpened = typeof config.openInlinePortal === 'function' && config.openInlinePortal(MOD_MODAL_ID, function () {
      if (typeof config.hideBlockingSurface === 'function') config.hideBlockingSurface(MOD_MODAL_ID);
    }, {
      labelledBy: 'mod-modal-title',
      describedBy: 'mod-modal-desc mod-modal-body',
      returnFocusSelector: '.fleet-open-mod-btn[data-ship-index="' + shipIndex + '"]',
    });
    if (!portalOpened && typeof config.showBlockingSurface === 'function') {
      config.showBlockingSurface(MOD_MODAL_ID, { focusSelector: '#mod-modal-close' });
    }

    activeContext = {
      shipIndex: shipIndex,
      focusModId: focusModId,
      focusService: focusService,
      recommendedModId: '',
    };
    openCount += 1;
    lastOpenStatus = portalOpened ? 'inline' : 'blocking';
    lastCloseReason = null;

    function renderModal() {
      if (!activeContext) return false;
      var model = buildFleetModModel(state, shipIndex, {
        focusModId: focusModId,
        focusService: focusService,
      });
      var view = model ? renderFleetMod(model) : null;
      if (!model || !view) {
        clearContext('invalid-model');
        if (typeof config.closeSurface === 'function') config.closeSurface(MOD_MODAL_ID);
        return false;
      }
      activeContext = {
        shipIndex: shipIndex,
        focusModId: focusModId,
        focusService: focusService,
        recommendedModId: model.modRecommendation ? model.modRecommendation.modId : '',
      };
      renderCount += 1;
      title.textContent = view.title;
      body.innerHTML = view.html;
      if (focusService) _focusGuidedService(body);
      else _focusGuidedMod(body, focusModId);

      _bindProperty(body, 'onclick', function (event) {
        var intent = readFleetModIntent(event && event.target);
        if (!intent) return;
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        lastIntent = intent.type;
        if (intent.type === FLEET_MOD_INTENT.UPGRADE) {
          commandCount += 1;
          if (typeof input.onUpgradeShip === 'function') input.onUpgradeShip(intent.shipIndex, intent.upgradeId);
          return _scheduleRender(renderModal);
        }
        if (intent.type === FLEET_MOD_INTENT.INSTALL) {
          commandCount += 1;
          if (typeof input.onInstallMod === 'function') input.onInstallMod(intent.shipIndex, intent.modId);
          return _scheduleRender(renderModal);
        }
        if (intent.type === FLEET_MOD_INTENT.UNINSTALL) {
          commandCount += 1;
          if (typeof input.onUninstallMod === 'function') input.onUninstallMod(intent.shipIndex, intent.modId);
          return _scheduleRender(renderModal);
        }
        if (intent.type === FLEET_MOD_INTENT.SERVICE) {
          commandCount += 1;
          if (typeof input.onServiceShip === 'function') input.onServiceShip(intent.shipIndex);
          return _scheduleRender(renderModal);
        }
        if (intent.type !== FLEET_MOD_INTENT.SELL) return;
        confirmationCount += 1;
        var currentShip = model.ship;
        if (typeof config.openConfirmation !== 'function') return;
        config.openConfirmation({
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
            commandCount += 1;
            if (typeof input.onSellShip === 'function') input.onSellShip(intent.shipIndex);
            _scheduleRender(function () {
              if (state.fleet.length <= intent.shipIndex || state.fleet[intent.shipIndex] !== currentShip) {
                _closeAndRender('ship-sold');
                return;
              }
              renderModal();
            });
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
