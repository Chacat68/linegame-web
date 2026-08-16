// js/core/MarketCommand.js — MarketUI 与市场工作区控制器共享的 typed command 契约

export const MARKET_COMMAND = Object.freeze({
  OPEN_TRADE: 'market.trade.open',
  REFUEL: 'market.trade.refuel',
  FOCUS_REMOTE_SYSTEM: 'market.navigation.focus-remote-system',
  TAKE_LOAN: 'market.capital.take-loan',
  REPAY_LOAN: 'market.capital.repay-loan',
  INVEST_STATION: 'market.operations.invest-station',
  REDEEM_STATION_INVESTMENT: 'market.operations.redeem-station-investment',
  BATCH_INVEST_STATIONS: 'market.operations.batch-invest-stations',
  BUILD_STATION: 'market.operations.build-station',
  UPGRADE_STATION: 'market.operations.upgrade-station',
  SET_STATION_STRATEGY: 'market.operations.set-station-strategy',
  BATCH_UPGRADE_STATIONS: 'market.operations.batch-upgrade-stations',
  BATCH_SET_STATION_STRATEGY: 'market.operations.batch-set-station-strategy',
});

function _normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function _normalizeSystemIds(value) {
  var source = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(',') : []);
  return source.map(_normalizeId).filter(function (id, index, all) {
    return !!id && all.indexOf(id) === index;
  });
}

function _freeze(type, payload) {
  return Object.freeze(Object.assign({ type: type }, payload || {}));
}

function _normalizeSystemCommand(type, command) {
  var systemId = _normalizeId(command.systemId);
  return systemId ? _freeze(type, { systemId: systemId }) : null;
}

export function normalizeMarketCommand(command) {
  if (!command || typeof command !== 'object') return null;
  var type = command.type;

  if (type === MARKET_COMMAND.OPEN_TRADE) {
    var action = command.action === 'sell' ? 'sell' : (command.action === 'buy' ? 'buy' : '');
    var good = command.good;
    if (!action || !good || typeof good !== 'object' || !_normalizeId(good.id)) return null;
    return _freeze(type, {
      action: action,
      marketMode: command.marketMode === 'black' ? 'black' : 'open',
      good: good,
    });
  }

  if (type === MARKET_COMMAND.REFUEL) return _freeze(type);
  if (type === MARKET_COMMAND.FOCUS_REMOTE_SYSTEM ||
      type === MARKET_COMMAND.INVEST_STATION ||
      type === MARKET_COMMAND.REDEEM_STATION_INVESTMENT ||
      type === MARKET_COMMAND.BUILD_STATION ||
      type === MARKET_COMMAND.UPGRADE_STATION) {
    return _normalizeSystemCommand(type, command);
  }

  if (type === MARKET_COMMAND.TAKE_LOAN) {
    var loanOfferId = _normalizeId(command.loanOfferId);
    return loanOfferId ? _freeze(type, { loanOfferId: loanOfferId }) : null;
  }
  if (type === MARKET_COMMAND.REPAY_LOAN) {
    var loanId = _normalizeId(command.loanId);
    return loanId ? _freeze(type, { loanId: loanId }) : null;
  }

  if (type === MARKET_COMMAND.BATCH_INVEST_STATIONS) {
    var investmentSystemIds = _normalizeSystemIds(command.systemIds);
    if (investmentSystemIds.length === 0) return null;
    var amount = Number(command.amount);
    return _freeze(type, {
      systemIds: Object.freeze(investmentSystemIds),
      amount: Number.isFinite(amount) && amount > 0 ? amount : undefined,
    });
  }

  if (type === MARKET_COMMAND.BATCH_UPGRADE_STATIONS) {
    var upgradeSystemIds = _normalizeSystemIds(command.systemIds);
    return upgradeSystemIds.length > 0
      ? _freeze(type, { systemIds: Object.freeze(upgradeSystemIds) })
      : null;
  }

  if (type === MARKET_COMMAND.SET_STATION_STRATEGY) {
    var strategySystemId = _normalizeId(command.systemId);
    var strategyId = _normalizeId(command.strategyId);
    return strategySystemId && strategyId
      ? _freeze(type, { systemId: strategySystemId, strategyId: strategyId })
      : null;
  }

  if (type === MARKET_COMMAND.BATCH_SET_STATION_STRATEGY) {
    var batchStrategyId = _normalizeId(command.strategyId);
    var strategySystemIds = _normalizeSystemIds(command.systemIds);
    return batchStrategyId && strategySystemIds.length > 0
      ? _freeze(type, {
        strategyId: batchStrategyId,
        systemIds: Object.freeze(strategySystemIds),
      })
      : null;
  }

  return null;
}

export function createMarketCommand(type, payload) {
  var command = normalizeMarketCommand(Object.assign({}, payload || {}, { type: type }));
  if (!command) throw new TypeError('Invalid market command: ' + String(type));
  return command;
}
