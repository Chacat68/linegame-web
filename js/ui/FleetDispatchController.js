// js/ui/FleetDispatchController.js — 自动跑商推荐、估算、Surface 与命令用例编排

import { GOODS } from '../data/goods.js';
import { SYSTEMS, getAccessibleGalaxies, getSystemsByGalaxy } from '../data/systems.js';
import * as Fleet from '../systems/fleet/FleetSystem.js';
import * as AutoTrade from '../systems/trade/AutoTradeSystem.js';
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
import { createFleetDispatchSession } from './FleetDispatchSession.js';
import { createFleetDispatchViewAdapter } from './FleetDispatchViewAdapter.js';

const DISPATCH_MODAL_ID = 'dispatch-modal';

export function createFleetDispatchController(options) {
  var config = options || {};
  var session = config.session || createFleetDispatchSession();
  var view = config.viewAdapter || createFleetDispatchViewAdapter(config);

  function clearContext(reason) {
    var hadContext = session.close(reason);
    view.release();
    return hadContext;
  }

  function _closeAndRender(reason) {
    clearContext(reason || 'close');
    if (typeof config.closeSurface === 'function') {
      config.closeSurface(DISPATCH_MODAL_ID);
    }
    if (typeof config.requestHangarRender === 'function') {
      config.requestHangarRender();
    }
  }

  function getDiagnostics() {
    var diagnostics = session.getDiagnostics();
    return Object.freeze(Object.assign({}, diagnostics, {
      view: view.getDiagnostics(),
    }));
  }

  function reset() {
    view.reset();
    session.reset();
    return getDiagnostics();
  }

  function open(request) {
    var input = request || {};
    var state = input.state;
    var shipIndex = input.shipIndex;
    if (typeof config.setInspectedShipIndex === 'function') {
      config.setInspectedShipIndex(shipIndex);
    }
    if (!state || !Number.isInteger(shipIndex) || !state.fleet || !state.fleet[shipIndex]) {
      session.noteOpenStatus('invalid-request');
      return false;
    }
    if (!view.prepare()) {
      var prepareStatus = view.getDiagnostics().lastPrepareStatus;
      session.noteOpenStatus(prepareStatus === 'missing-document' ? 'invalid-request' : 'missing-dom');
      return false;
    }

    if (typeof config.closeActiveSurface === 'function') {
      config.closeActiveSurface({ restoreFocus: false });
    }
    clearContext('replace');
    if (!view.activatePrepared()) {
      session.noteOpenStatus('missing-dom');
      return false;
    }

    var portalOpened = typeof config.openInlinePortal === 'function' && config.openInlinePortal(DISPATCH_MODAL_ID, function () {
      if (typeof config.hideBlockingSurface === 'function') {
        config.hideBlockingSurface(DISPATCH_MODAL_ID);
      }
    }, {
      labelledBy: 'dispatch-title',
      describedBy: 'dispatch-modal-desc dispatch-route-summary dispatch-primary-hint dispatch-policy-status',
      returnFocusSelector: '.fleet-dispatch-btn[data-index="' + shipIndex + '"]',
    });
    if (!portalOpened && typeof config.showBlockingSurface === 'function') {
      config.showBlockingSurface(DISPATCH_MODAL_ID, { focusSelector: '#dispatch-buy-system' });
    }

    var ship = state.fleet[shipIndex];
    var effectiveShipStats = Fleet.getEffectiveShipStats(state, ship);
    var dispatchPreset = input.preset || null;
    var presetRecommendation = dispatchPreset && dispatchPreset.recommendation
      ? dispatchPreset.recommendation
      : null;
    session.open({
      shipIndex: shipIndex,
      buySystemId: (presetRecommendation && presetRecommendation.buySystemId) || (dispatchPreset && dispatchPreset.buySystemId) || '',
      sellSystemId: (presetRecommendation && presetRecommendation.sellSystemId) || (dispatchPreset && dispatchPreset.sellSystemId) || '',
      goodId: (presetRecommendation && presetRecommendation.goodId) || (dispatchPreset && dispatchPreset.goodId) || '',
    }, portalOpened ? 'inline' : 'blocking');

    var isActive = shipIndex === (state.activeShipIndex || 0);
    var routeLevel = Fleet.getDispatchRouteLevel(state);
    var shipLocationSystem = SYSTEMS.find(function (system) { return system.id === ship.location; });
    var currentLocationSystemId = isActive ? state.currentSystem : (ship.location || state.currentSystem);
    var dispatchGalaxyId = isActive
      ? (state.currentGalaxy || 'milky_way')
      : ((shipLocationSystem && shipLocationSystem.galaxyId) || state.currentGalaxy || 'milky_way');
    view.renderTitle((isActive ? '自动跑商' : '设置跑商') + '「' + ship.emoji + ' ' + ship.name + '」');

    var existingPolicy = dispatchPreset && dispatchPreset.tradePolicy
      ? dispatchPreset.tradePolicy
      : (presetRecommendation && presetRecommendation.recommendedTradePolicy
          ? presetRecommendation.recommendedTradePolicy
          : (ship.route && ship.route.tradePolicy ? ship.route.tradePolicy : {}));
    view.renderPolicyInputs(existingPolicy);

    function _readForm() {
      return view.readForm() || {
        advancedOpen: false,
        buySystemId: '',
        sellSystemId: '',
        goodId: '',
        policyInput: {},
      };
    }

    function _readTradePolicy() {
      return parseFleetDispatchPolicy(_readForm().policyInput);
    }

    function _readSelection() {
      var form = _readForm();
      return {
        buySystemId: form.buySystemId,
        sellSystemId: form.sellSystemId,
        goodId: form.goodId,
        tradePolicy: parseFleetDispatchPolicy(form.policyInput),
      };
    }

    function _syncActiveContext() {
      var form = _readForm();
      session.update({
        buySystemId: form.buySystemId,
        sellSystemId: form.sellSystemId,
        goodId: form.goodId,
        tradePolicy: parseFleetDispatchPolicy(form.policyInput),
        advancedOpen: form.advancedOpen,
      });
    }

    function _updateRouteSummary(estimate, warnings, readiness) {
      var summary = buildFleetDispatchRouteSummary(_readSelection(), estimate, warnings, readiness);
      view.renderRouteSummary(summary);
      _syncActiveContext();
    }

    function _updatePrimaryHint(estimate, recommendation, policyValidation, readiness) {
      var projection = buildFleetDispatchPrimaryView({
        estimate: estimate,
        recommendation: recommendation,
        validation: policyValidation,
        readiness: readiness,
        selection: _readSelection(),
        hasExistingRoute: !!(state.fleet[shipIndex] && state.fleet[shipIndex].route),
      });
      view.renderPrimaryView(projection);
      session.update({ status: projection.state });
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
      getSystemsByGalaxy(galaxy.id).forEach(function (system) {
        var minLevel = system.minLevel || 1;
        if (dispatchAccessLevel < minLevel || recommendationPlanetLookup[system.id]) return;
        recommendationPlanets.push(system);
        recommendationPlanetLookup[system.id] = true;
      });
    });

    var allGalaxyPlanets = getSystemsByGalaxy(dispatchGalaxyId).filter(function (system) {
      return dispatchAccessLevel >= (system.minLevel || 1);
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

    function _buildMarketOptions() {
      var marketMode = _readForm().policyInput.marketMode || 'open';
      var buyPlanets = marketMode === 'black'
        ? allGalaxyPlanets.filter(function (system) { return AutoTrade.canUseMarket(state, system.id, 'black'); })
        : allGalaxyPlanets.slice();
      var sellPlanets = allGalaxyPlanets.slice();
      var emptyText = marketMode === 'black'
        ? '当前候选中无可用黑市路线'
        : '需要更多航线（购买席位解锁）';
      var hasRouteOptions = buyPlanets.length > 0 && sellPlanets.length >= 2;
      view.renderMarketOptions({
        buyOptionsHtml: hasRouteOptions
          ? buildFleetDispatchSystemOptions(buyPlanets, dispatchGalaxyId)
          : '<option value="">' + emptyText + '</option>',
        sellOptionsHtml: hasRouteOptions
          ? buildFleetDispatchSystemOptions(sellPlanets, dispatchGalaxyId)
          : '<option value="">' + emptyText + '</option>',
        goodOptionsHtml: buildFleetDispatchGoodOptions(marketMode),
        existingRoute: ship.route || null,
        currentLocationSystemId: currentLocationSystemId,
        preset: dispatchPreset,
      });
    }

    function _validateTradePolicyInputs() {
      var validation = validateFleetDispatchPolicy(_readForm().policyInput);
      var status = buildFleetDispatchPolicyStatus(validation);
      view.renderPolicyValidation(validation, status);
      session.update({ policyStatus: status.state });
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
      view.applyRecommendation(recommendation);
    }

    function _renderEstimate(estimate, recommendation, warnings, readiness) {
      view.renderEstimateHtml(renderFleetDispatchEstimate(dispatchContext, {
        estimate: estimate,
        recommendation: recommendation,
        warnings: warnings,
        readiness: readiness,
      }));
    }

    function _updateEstimate(recommendation) {
      session.markEstimateUpdated();
      var policyValidation = _validateTradePolicyInputs();
      if (!policyValidation.valid) {
        view.renderEstimateMessage('请先修正可选设置中的无效数字，再查看路线估算。');
        _updateRouteSummary(null, []);
        view.renderSummaryPolicy(formatFleetDispatchMarketMode(_readForm().policyInput.marketMode) + ' · '
          + formatFleetDispatchRiskMode(_readForm().policyInput.riskMode) + ' · 输入有误');
        _updatePrimaryHint(null, null, policyValidation);
        return;
      }
      var estimate = _getEstimateData();
      var suggestedRecommendation = recommendation || null;
      if (!estimate) {
        view.renderEstimateMessage(recommendation
          ? '当前推荐路线暂不能开始，可调整设置后再试。'
          : '当前设置无法组成可执行的自动跑商路线。');
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

    function _applySuggestedRoute() {
      var recommendation = _getSuggestedRecommendation();
      if (!recommendation) {
        view.renderEstimateMessage('没有找到符合当前设置的跑商路线。可展开可选设置调整后再试。');
        _updateRouteSummary(null, []);
        _updatePrimaryHint(null, null);
        return null;
      }
      _applyRecommendationSelection(recommendation);
      _updateEstimate(recommendation);
      return recommendation;
    }

    _buildMarketOptions();
    view.setAdvancedOpen(hasCustomFleetDispatchPolicy(existingPolicy));
    var hasPresetRoute = !!(dispatchPreset && dispatchPreset.buySystemId && dispatchPreset.sellSystemId && dispatchPreset.goodId);
    var hasExistingRoute = !!ship.route;
    var initialRecommendation = presetRecommendation || null;
    if (hasPresetRoute && !initialRecommendation) {
      initialRecommendation = {
        buySystemId: dispatchPreset.buySystemId,
        sellSystemId: dispatchPreset.sellSystemId,
        goodId: dispatchPreset.goodId,
        buySystemName: (SYSTEMS.find(function (system) { return system.id === dispatchPreset.buySystemId; }) || {}).name || dispatchPreset.buySystemId,
        sellSystemName: (SYSTEMS.find(function (system) { return system.id === dispatchPreset.sellSystemId; }) || {}).name || dispatchPreset.sellSystemId,
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

    view.bind({
      onSelectionChange: function () { _updateEstimate(); },
      onMarketModeChange: function () {
        _buildMarketOptions();
        _updateEstimate();
      },
      onAdvancedToggle: _syncActiveContext,
      onConfirm: function () {
        var policyValidation = _validateTradePolicyInputs();
        var estimate = _getEstimateData();
        var readiness = _getDispatchReadiness(estimate);
        if (!policyValidation.valid || view.isConfirmDisabled()) {
          _updatePrimaryHint(estimate, initialRecommendation, policyValidation, readiness);
          return;
        }
        session.markCommandSubmitted();
        var selection = _readSelection();
        var result = typeof input.onAssignRoute === 'function'
          ? input.onAssignRoute(
              shipIndex,
              selection.buySystemId,
              selection.sellSystemId,
              selection.goodId,
              selection.tradePolicy
            )
          : false;
        if (result && result.ok === false) {
          var firstMessage = result.msgs && result.msgs[0]
            ? result.msgs[0].text
            : '路线启动失败，请检查飞船状态后重试。';
          view.renderBlocked(firstMessage);
          session.update({ status: 'blocked' });
          return;
        }
        _closeAndRender('confirm');
      },
      onCancel: function () {
        _closeAndRender('cancel');
      },
    });
    return true;
  }

  return Object.freeze({
    clearContext: clearContext,
    getActiveContext: session.getActiveContext,
    getDiagnostics: getDiagnostics,
    open: open,
    reset: reset,
  });
}
