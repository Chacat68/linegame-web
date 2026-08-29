// js/ui/FleetDispatchViewAdapter.js — 自动跑商表单 DOM、投影与处理器生命周期

const NODE_IDS = Object.freeze({
  modal: 'dispatch-modal',
  title: 'dispatch-title',
  primaryHint: 'dispatch-primary-hint',
  routeSummary: 'dispatch-route-summary',
  summaryBuy: 'dispatch-summary-buy',
  summarySell: 'dispatch-summary-sell',
  summaryGood: 'dispatch-summary-good',
  summaryPolicy: 'dispatch-summary-policy',
  buySelect: 'dispatch-buy-system',
  sellSelect: 'dispatch-sell-system',
  goodSelect: 'dispatch-good',
  marketModeSelect: 'dispatch-market-mode',
  riskModeSelect: 'dispatch-risk-mode',
  maxBuyInput: 'dispatch-max-buy-price',
  minSellInput: 'dispatch-min-sell-price',
  minProfitInput: 'dispatch-min-profit-rate',
  policyStatus: 'dispatch-policy-status',
  estimate: 'dispatch-estimate',
  confirmButton: 'dispatch-confirm',
  cancelButton: 'dispatch-cancel',
  advancedPanel: 'dispatch-advanced-panel',
});

const REQUIRED_KEYS = Object.freeze([
  'modal',
  'title',
  'primaryHint',
  'buySelect',
  'sellSelect',
  'goodSelect',
  'marketModeSelect',
  'riskModeSelect',
  'maxBuyInput',
  'minSellInput',
  'minProfitInput',
  'estimate',
  'confirmButton',
  'cancelButton',
]);

function _getDocument(config) {
  if (typeof config.getDocument === 'function') return config.getDocument();
  return globalThis.document || null;
}

function _hasOption(select, value) {
  if (!select || value == null || value === '') return false;
  var options = select.options || [];
  for (var index = 0; index < options.length; index += 1) {
    if (String(options[index].value) === String(value)) return true;
  }
  return false;
}

function _setIfAvailable(select, value) {
  if (!_hasOption(select, value)) return false;
  select.value = value;
  return true;
}

export function createFleetDispatchViewAdapter(options) {
  var config = options || {};
  var preparedNodes = null;
  var activeNodes = null;
  var activeBindings = [];
  var prepareCount = 0;
  var bindCount = 0;
  var releaseCount = 0;
  var resetCount = 0;
  var lastPrepareStatus = 'idle';

  function _clearBindings() {
    activeBindings.forEach(function (binding) {
      if (binding.element[binding.property] === binding.handler) {
        binding.element[binding.property] = null;
      }
    });
    activeBindings = [];
  }

  function _bind(element, property, handler) {
    if (!element || typeof handler !== 'function') return;
    element[property] = handler;
    activeBindings.push({ element: element, property: property, handler: handler });
  }

  function prepare() {
    var doc = _getDocument(config);
    if (!doc || typeof doc.getElementById !== 'function') {
      preparedNodes = null;
      lastPrepareStatus = 'missing-document';
      return false;
    }
    var nodes = {};
    Object.keys(NODE_IDS).forEach(function (key) {
      nodes[key] = doc.getElementById(NODE_IDS[key]);
    });
    if (REQUIRED_KEYS.some(function (key) { return !nodes[key]; })) {
      preparedNodes = null;
      lastPrepareStatus = 'missing-dom';
      return false;
    }
    preparedNodes = nodes;
    prepareCount += 1;
    lastPrepareStatus = 'ready';
    return true;
  }

  function release() {
    var hadActiveView = !!activeNodes || activeBindings.length > 0;
    _clearBindings();
    activeNodes = null;
    if (hadActiveView) releaseCount += 1;
    return hadActiveView;
  }

  function activatePrepared() {
    if (!preparedNodes) return false;
    var nextNodes = preparedNodes;
    preparedNodes = null;
    release();
    activeNodes = nextNodes;
    return true;
  }

  function bind(handlers) {
    if (!activeNodes) return false;
    var intents = handlers || {};
    _clearBindings();
    _bind(activeNodes.buySelect, 'onchange', intents.onSelectionChange);
    _bind(activeNodes.sellSelect, 'onchange', intents.onSelectionChange);
    _bind(activeNodes.goodSelect, 'onchange', intents.onSelectionChange);
    _bind(activeNodes.maxBuyInput, 'oninput', intents.onSelectionChange);
    _bind(activeNodes.minSellInput, 'oninput', intents.onSelectionChange);
    _bind(activeNodes.minProfitInput, 'oninput', intents.onSelectionChange);
    _bind(activeNodes.riskModeSelect, 'onchange', intents.onSelectionChange);
    _bind(activeNodes.marketModeSelect, 'onchange', intents.onMarketModeChange);
    _bind(activeNodes.advancedPanel, 'ontoggle', intents.onAdvancedToggle);
    _bind(activeNodes.confirmButton, 'onclick', intents.onConfirm);
    _bind(activeNodes.cancelButton, 'onclick', intents.onCancel);
    bindCount += 1;
    return true;
  }

  function readForm() {
    if (!activeNodes) return null;
    return Object.freeze({
      advancedOpen: !!(activeNodes.advancedPanel && activeNodes.advancedPanel.open),
      buySystemId: activeNodes.buySelect.value || '',
      sellSystemId: activeNodes.sellSelect.value || '',
      goodId: activeNodes.goodSelect.value || '',
      policyInput: Object.freeze({
        maxBuyPrice: activeNodes.maxBuyInput.value,
        minSellPrice: activeNodes.minSellInput.value,
        minProfitRatePercent: activeNodes.minProfitInput.value,
        riskMode: activeNodes.riskModeSelect.value || 'balanced',
        marketMode: activeNodes.marketModeSelect.value || 'open',
      }),
    });
  }

  function renderTitle(text) {
    if (!activeNodes) return false;
    activeNodes.title.textContent = text || '';
    return true;
  }

  function renderPolicyInputs(policy) {
    if (!activeNodes) return false;
    var value = policy || {};
    activeNodes.maxBuyInput.value = Number.isFinite(value.maxBuyPrice) ? value.maxBuyPrice : '';
    activeNodes.minSellInput.value = Number.isFinite(value.minSellPrice) ? value.minSellPrice : '';
    activeNodes.minProfitInput.value = Number.isFinite(value.minProfitRate)
      ? Math.round(value.minProfitRate * 100)
      : '';
    activeNodes.riskModeSelect.value = value.riskMode || 'balanced';
    activeNodes.marketModeSelect.value = value.marketMode || 'open';
    return true;
  }

  function renderMarketOptions(request) {
    if (!activeNodes) return false;
    var input = request || {};
    var previousBuy = activeNodes.buySelect.value;
    var previousSell = activeNodes.sellSelect.value;
    var previousGood = activeNodes.goodSelect.value;
    activeNodes.buySelect.innerHTML = input.buyOptionsHtml || '';
    activeNodes.sellSelect.innerHTML = input.sellOptionsHtml || '';
    activeNodes.goodSelect.innerHTML = input.goodOptionsHtml || '';

    var route = input.existingRoute || null;
    if (route) {
      _setIfAvailable(activeNodes.buySelect, route.buySystemId);
      _setIfAvailable(activeNodes.sellSelect, route.sellSystemId);
      _setIfAvailable(activeNodes.goodSelect, route.goodId);
    }
    if (!activeNodes.buySelect.value) _setIfAvailable(activeNodes.buySelect, previousBuy);
    if (!activeNodes.sellSelect.value) _setIfAvailable(activeNodes.sellSelect, previousSell);
    if (!activeNodes.goodSelect.value) _setIfAvailable(activeNodes.goodSelect, previousGood);
    if (!activeNodes.buySelect.value) {
      _setIfAvailable(activeNodes.buySelect, input.currentLocationSystemId);
    }
    if ((!activeNodes.sellSelect.value || activeNodes.sellSelect.value === activeNodes.buySelect.value)
      && activeNodes.sellSelect.options && activeNodes.sellSelect.options.length > 1) {
      activeNodes.sellSelect.selectedIndex = activeNodes.sellSelect.options[0].value === activeNodes.buySelect.value ? 1 : 0;
    }
    var preset = input.preset || null;
    if (preset) {
      _setIfAvailable(activeNodes.buySelect, preset.buySystemId);
      _setIfAvailable(activeNodes.sellSelect, preset.sellSystemId);
      _setIfAvailable(activeNodes.goodSelect, preset.goodId);
    }
    return true;
  }

  function applyRecommendation(recommendation) {
    if (!activeNodes || !recommendation) return false;
    activeNodes.buySelect.value = recommendation.buySystemId || '';
    activeNodes.sellSelect.value = recommendation.sellSystemId || '';
    activeNodes.goodSelect.value = recommendation.goodId || '';
    return true;
  }

  function renderPolicyValidation(validation, status) {
    if (!activeNodes || !validation) return false;
    [
      { element: activeNodes.maxBuyInput, key: 'maxBuyPrice' },
      { element: activeNodes.minSellInput, key: 'minSellPrice' },
      { element: activeNodes.minProfitInput, key: 'minProfitRatePercent' },
    ].forEach(function (field) {
      if (validation.fieldValidity[field.key]) field.element.removeAttribute('aria-invalid');
      else field.element.setAttribute('aria-invalid', 'true');
    });
    if (status) {
      activeNodes.modal.dataset.dispatchPolicyState = status.state;
      if (activeNodes.policyStatus) {
        activeNodes.policyStatus.className = status.className;
        activeNodes.policyStatus.textContent = status.text;
      }
    }
    return true;
  }

  function renderRouteSummary(summary) {
    if (!activeNodes || !summary) return false;
    if (activeNodes.summaryBuy) activeNodes.summaryBuy.textContent = summary.buyLabel;
    if (activeNodes.summarySell) activeNodes.summarySell.textContent = summary.sellLabel;
    if (activeNodes.summaryGood) activeNodes.summaryGood.textContent = summary.goodLabel;
    if (activeNodes.summaryPolicy) activeNodes.summaryPolicy.textContent = summary.policyLabel;
    if (activeNodes.routeSummary) activeNodes.routeSummary.dataset.routeState = summary.state;
    return true;
  }

  function renderPrimaryView(view) {
    if (!activeNodes || !view) return false;
    activeNodes.confirmButton.textContent = view.buttonLabel;
    activeNodes.confirmButton.disabled = view.disabled;
    activeNodes.confirmButton.setAttribute('aria-disabled', view.disabled ? 'true' : 'false');
    activeNodes.modal.dataset.dispatchState = view.state;
    activeNodes.primaryHint.className = view.className;
    activeNodes.primaryHint.textContent = view.text;
    return true;
  }

  function renderEstimateHtml(html) {
    if (!activeNodes) return false;
    activeNodes.estimate.innerHTML = html || '';
    return true;
  }

  function renderEstimateMessage(text) {
    if (!activeNodes) return false;
    activeNodes.estimate.textContent = text || '';
    return true;
  }

  function renderSummaryPolicy(text) {
    if (!activeNodes || !activeNodes.summaryPolicy) return false;
    activeNodes.summaryPolicy.textContent = text || '';
    return true;
  }

  function renderBlocked(message) {
    if (!activeNodes) return false;
    activeNodes.modal.dataset.dispatchState = 'blocked';
    activeNodes.primaryHint.className = 'dispatch-primary-hint dispatch-primary-hint--danger';
    activeNodes.primaryHint.textContent = message || '';
    return true;
  }

  function reset() {
    preparedNodes = null;
    release();
    resetCount += 1;
    return getDiagnostics();
  }

  function getDiagnostics() {
    return Object.freeze({
      active: !!activeNodes,
      bindingCount: activeBindings.length,
      bindCount: bindCount,
      lastPrepareStatus: lastPrepareStatus,
      prepareCount: prepareCount,
      releaseCount: releaseCount,
      resetCount: resetCount,
    });
  }

  return Object.freeze({
    activatePrepared: activatePrepared,
    applyRecommendation: applyRecommendation,
    bind: bind,
    getDiagnostics: getDiagnostics,
    isConfirmDisabled: function () {
      return !activeNodes || !!activeNodes.confirmButton.disabled;
    },
    prepare: prepare,
    readForm: readForm,
    release: release,
    renderBlocked: renderBlocked,
    renderEstimateHtml: renderEstimateHtml,
    renderEstimateMessage: renderEstimateMessage,
    renderMarketOptions: renderMarketOptions,
    renderPolicyInputs: renderPolicyInputs,
    renderPolicyValidation: renderPolicyValidation,
    renderPrimaryView: renderPrimaryView,
    renderRouteSummary: renderRouteSummary,
    renderSummaryPolicy: renderSummaryPolicy,
    renderTitle: renderTitle,
    reset: reset,
    setAdvancedOpen: function (open) {
      if (!activeNodes || !activeNodes.advancedPanel) return false;
      activeNodes.advancedPanel.open = open === true;
      return true;
    },
  });
}
