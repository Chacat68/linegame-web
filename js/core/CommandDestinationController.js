// js/core/CommandDestinationController.js — Command Slot 与局部 CTA 的 UI 落点
//
// 领域 action 只描述“要去哪里/执行什么”。本 controller 负责把命令落到
// 交易确认、档案焦点、市场商品、派遣草稿或改装弹窗，并隔离延迟 UI 的旧会话。

import { buildCommandFeedback } from '../ui/CommandAction.js';
import { getDispatchDraftCompletion } from './ActionGuideCompletion.js';

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('CommandDestinationController requires ' + label + '.');
  return value;
}

function _call(target, name, args) {
  if (!target || typeof target[name] !== 'function') return undefined;
  return target[name].apply(target, args || []);
}

export function createCommandDestinationController(dependencies) {
  var deps = dependencies || {};
  var systems = deps.systems || {};
  var ui = deps.ui || {};
  var data = deps.data || {};
  var Economy = systems.Economy || {};
  var Fleet = systems.Fleet || {};
  var MapUI = ui.MapUI || {};
  var Modal = ui.Modal || {};
  var goods = Array.isArray(data.goods) ? data.goods : [];
  var getState = _requiredFunction(deps.getState, 'getState');
  var loadArchive = _requiredFunction(deps.loadArchive, 'loadArchive');
  var loadFleet = _requiredFunction(deps.loadFleet, 'loadFleet');
  var loadMarket = _requiredFunction(deps.loadMarket, 'loadMarket');
  var getLoadedArchive = typeof deps.getLoadedArchive === 'function'
    ? deps.getLoadedArchive
    : function () { return null; };
  var getFleetActions = _requiredFunction(deps.getFleetActions, 'getFleetActions');
  var renderFleet = _requiredFunction(deps.renderFleet, 'renderFleet');
  var getSessionToken = typeof deps.getSessionToken === 'function'
    ? deps.getSessionToken
    : function () { return null; };
  var isSessionTokenCurrent = typeof deps.isSessionTokenCurrent === 'function'
    ? deps.isSessionTokenCurrent
    : function () { return true; };
  var emitLog = typeof deps.emitLog === 'function' ? deps.emitLog : function () {};
  var invalidate = typeof deps.invalidate === 'function' ? deps.invalidate : function () {};
  var refreshActionGuide = typeof deps.refreshActionGuide === 'function'
    ? deps.refreshActionGuide
    : function () {};
  var showCompletion = typeof deps.showCompletion === 'function'
    ? deps.showCompletion
    : function () {};

  var generation = 0;
  var pendingQuestSelectionId = null;
  var staleDropCount = 0;

  function _snapshot() {
    return {
      generation: generation,
      state: getState(),
      token: getSessionToken(),
    };
  }

  function _isCurrent(snapshot) {
    var current = !!snapshot &&
      snapshot.generation === generation &&
      snapshot.state === getState() &&
      isSessionTokenCurrent(snapshot.token);
    if (!current) staleDropCount += 1;
    return current;
  }

  function _good(goodId) {
    return goods.find(function (item) { return item.id === goodId; }) || null;
  }

  function _goodName(goodId) {
    var good = _good(goodId);
    return good ? good.name : (goodId || '商品');
  }

  function _tradeQuantity(state, action, goodId, marketType) {
    _call(Fleet, 'syncStateFromShip', [state]);
    if (action === 'sell') {
      return Math.max(0, Number((state.cargo || {})[goodId] || 0));
    }

    var price = marketType === 'black'
      ? _call(Economy, 'getBlackMarketBuyPrice', [state.currentSystem, goodId, state])
      : _call(Economy, 'getBuyPrice', [state.currentSystem, goodId, state]);
    if (!Number.isFinite(price) || price <= 0) return 0;

    var cargoUsed = Object.values(state.cargo || {}).reduce(function (sum, quantity) {
      return sum + Number(quantity || 0);
    }, 0);
    var cargoSpace = Math.max(0, Number(state.maxCargo || 0) - cargoUsed);
    var canAfford = Math.floor(Number(state.credits || 0) / price);
    return Math.max(0, Math.min(cargoSpace, canAfford));
  }

  function openTradeConfirmation(action, payload) {
    var state = getState();
    if (!state || typeof state !== 'object') return false;
    var goodId = payload && payload.goodId ? payload.goodId : '';
    var marketType = payload && payload.marketType === 'black' ? 'black' : 'open';
    if (!goodId) {
      emitLog({ text: '⚠️ 当前行动缺少商品目标，无法自动交易。', type: 'error' });
      refreshActionGuide();
      return false;
    }

    var good = _good(goodId);
    if (!good) {
      emitLog({ text: '⚠️ 当前行动指向的商品不存在，无法打开交易确认。', type: 'error' });
      refreshActionGuide();
      return false;
    }

    var quantity = _tradeQuantity(state, action, goodId, marketType);
    if (quantity <= 0) {
      emitLog({
        text: action === 'sell'
          ? '⚠️ 货舱中没有可卖出的「' + _goodName(goodId) + '」。'
          : '⚠️ 当前积分或货舱空间不足，无法打开「' + _goodName(goodId) + '」买入确认。',
        type: 'error',
      });
      refreshActionGuide();
      return false;
    }

    emitLog({
      text: buildCommandFeedback({
        actionId: 'market',
        commandSurface: 'market',
        commandIntent: action === 'buy' ? '买入确认' : '卖出确认',
        label: action === 'buy' ? '确认买入' : '确认卖出',
      }, {
        icon: '📊',
        destination: '当前市场 · ' + (action === 'buy' ? '买入确认' : '卖出确认'),
        nextStep: payload && payload.questName
          ? '检查数量并确认成交，完成后将推进「' + payload.questName + '」'
          : '检查数量后确认成交',
        returnTo: '关闭弹窗可继续查看行情',
      }),
      type: 'tip',
    });
    _call(Modal, 'openTradeModal', [action, good, state, marketType, { initialQuantity: quantity }]);
    refreshActionGuide();
    return true;
  }

  function syncArchiveView(ArchiveUI) {
    if (!pendingQuestSelectionId || !ArchiveUI || !ArchiveUI.QuestUI ||
        typeof ArchiveUI.QuestUI.setSelectedAvailableQuest !== 'function') {
      return false;
    }
    ArchiveUI.QuestUI.setSelectedAvailableQuest(pendingQuestSelectionId);
    pendingQuestSelectionId = null;
    return true;
  }

  function selectAvailableQuest(questId) {
    pendingQuestSelectionId = questId || null;
    if (!pendingQuestSelectionId) return Promise.resolve(false);
    var loaded = getLoadedArchive();
    if (syncArchiveView(loaded)) return Promise.resolve(true);

    var snapshot = _snapshot();
    return Promise.resolve().then(loadArchive).then(function (ArchiveUI) {
      if (!_isCurrent(snapshot)) return false;
      return syncArchiveView(ArchiveUI);
    });
  }

  function revealMarketGoodFocus(goodId, options) {
    var snapshot = _snapshot();
    return Promise.resolve().then(loadMarket).then(function (MarketUI) {
      if (!_isCurrent(snapshot) || !MarketUI || typeof MarketUI.revealMarketGoodFocus !== 'function') {
        return false;
      }
      return MarketUI.revealMarketGoodFocus(goodId, options) !== false;
    });
  }

  function revealArchiveReportFocus(systemId, chainId) {
    var snapshot = _snapshot();
    return Promise.resolve().then(loadArchive).then(function (ArchiveUI) {
      if (!_isCurrent(snapshot) || !ArchiveUI || !ArchiveUI.ArchiveExplorationUI) return false;
      var ExplorationUI = ArchiveUI.ArchiveExplorationUI;
      _call(ExplorationUI, 'setFocus', [systemId, chainId]);
      _call(ExplorationUI, 'render', [snapshot.state]);
      _call(ExplorationUI, 'revealFocus', [systemId, chainId]);
      return true;
    });
  }

  function openRecommendedDispatch(recommendation, sourceLabel, icon) {
    var snapshot = _snapshot();
    if (!snapshot.state || typeof snapshot.state !== 'object') return Promise.resolve(false);
    var activeShip = _call(Fleet, 'getActiveShip', [snapshot.state]);
    var activeShipIndex = snapshot.state && snapshot.state.activeShipIndex || 0;
    if (!activeShip || !recommendation) return Promise.resolve(false);

    _call(MapUI, 'activateTab', ['tab-fleet']);
    return Promise.resolve().then(loadFleet).then(function (FleetUI) {
      if (!_isCurrent(snapshot) || !FleetUI) return false;
      var fleetActions = getFleetActions();
      renderFleet(FleetUI);
      _call(FleetUI, 'openDispatchModal', [
        snapshot.state,
        activeShipIndex,
        fleetActions.onAssignRoute,
        fleetActions.onCancelRoute,
        {
          buySystemId: recommendation.buySystemId,
          sellSystemId: recommendation.sellSystemId,
          goodId: recommendation.goodId,
          tradePolicy: recommendation.recommendedTradePolicy || {
            maxBuyPrice: null,
            minSellPrice: null,
            minProfitRate: null,
            riskMode: 'balanced',
            marketMode: 'open',
          },
          recommendation: recommendation,
        },
      ]);

      emitLog({
        text: buildCommandFeedback({
          actionId: 'dispatch',
          commandSurface: 'fleet',
          commandIntent: sourceLabel,
          label: '载入推荐路线',
        }, {
          icon: icon,
          destination: '「' + activeShip.emoji + ' ' + activeShip.name + '」 · ' + sourceLabel,
          nextStep: '检查 ' + (recommendation.buySystemName || recommendation.buySystemId) + ' → ' +
            (recommendation.sellSystemName || recommendation.sellSystemId) + ' · ' +
            (recommendation.goodName || recommendation.goodId),
          returnTo: '确认“开始跑商”后执行路线',
        }),
        type: 'info',
      });
      refreshActionGuide();
      showCompletion(getDispatchDraftCompletion());
      return true;
    });
  }

  function openRecommendedMod(payload) {
    var data = payload || {};
    var snapshot = _snapshot();
    var state = snapshot.state;
    if (!state || typeof state !== 'object') return Promise.resolve(false);
    var shipIndex = Number.isFinite(Number(data.shipIndex))
      ? Number(data.shipIndex)
      : (state.activeShipIndex || 0);

    if (!state.fleet || !state.fleet[shipIndex]) shipIndex = state.activeShipIndex || 0;
    if (!state.fleet || !state.fleet[shipIndex]) return Promise.resolve(false);

    invalidate();
    return Promise.resolve().then(loadFleet).then(function (FleetUI) {
      if (!_isCurrent(snapshot) || !FleetUI) return false;
      var fleetActions = getFleetActions();
      renderFleet(FleetUI);
      _call(FleetUI, 'openModModal', [
        state,
        shipIndex,
        fleetActions.onInstallMod,
        fleetActions.onUninstallMod,
        fleetActions.onUpgradeShip,
        fleetActions.onServiceShip,
        fleetActions.onSellShip,
        { focusModId: data.modId || '', focusService: !!data.focusService },
      ]);
      refreshActionGuide();
      return true;
    });
  }

  function reset() {
    generation += 1;
    pendingQuestSelectionId = null;
  }

  function getDiagnostics() {
    return Object.freeze({
      generation: generation,
      hasPendingQuestSelection: !!pendingQuestSelectionId,
      staleDropCount: staleDropCount,
    });
  }

  return Object.freeze({
    getDiagnostics: getDiagnostics,
    openRecommendedDispatch: openRecommendedDispatch,
    openRecommendedMod: openRecommendedMod,
    openTradeConfirmation: openTradeConfirmation,
    reset: reset,
    revealArchiveReportFocus: revealArchiveReportFocus,
    revealMarketGoodFocus: revealMarketGoodFocus,
    selectAvailableQuest: selectAvailableQuest,
    syncArchiveView: syncArchiveView,
  });
}
