// js/systems/trade/TradePolicy.js — 派遣与自动贸易共享的轻量策略判断

import * as Economy from '../economy/Economy.js';
import * as Faction from '../faction/FactionSystem.js';

export function normalizeTradePolicy(policy) {
  if (policy && policy._normalized === true) return policy;

  var normalized = {
    maxBuyPrice: null,
    minSellPrice: null,
    minProfitRate: null,
    riskMode: 'balanced',
    marketMode: 'open',
  };

  if (!policy || typeof policy !== 'object') return normalized;
  if (Number.isFinite(policy.maxBuyPrice) && policy.maxBuyPrice >= 0) normalized.maxBuyPrice = policy.maxBuyPrice;
  if (Number.isFinite(policy.minSellPrice) && policy.minSellPrice >= 0) normalized.minSellPrice = policy.minSellPrice;
  if (Number.isFinite(policy.minProfitRate) && policy.minProfitRate >= 0) {
    normalized.minProfitRate = policy.minProfitRate > 1 ? policy.minProfitRate / 100 : policy.minProfitRate;
  }
  if (policy.riskMode === 'safe' || policy.riskMode === 'balanced' || policy.riskMode === 'aggressive') {
    normalized.riskMode = policy.riskMode;
  }
  if (policy.marketMode === 'black' || policy.marketMode === 'open') normalized.marketMode = policy.marketMode;

  Object.defineProperty(normalized, '_normalized', {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return normalized;
}

export function hasTradePolicy(policy) {
  var normalized = normalizeTradePolicy(policy);
  return normalized.maxBuyPrice != null || normalized.minSellPrice != null || normalized.minProfitRate != null;
}

export function getUnitProfitRate(buyPrice, sellPrice) {
  if (!Number.isFinite(buyPrice) || buyPrice <= 0 || !Number.isFinite(sellPrice)) return 0;
  return (sellPrice - buyPrice) / buyPrice;
}

export function evaluateTradePolicy(buyPrice, sellPrice, policy) {
  var normalized = normalizeTradePolicy(policy);
  var reasons = [];
  var profitRate = getUnitProfitRate(buyPrice, sellPrice);
  if (normalized.maxBuyPrice != null && buyPrice > normalized.maxBuyPrice) reasons.push('买入价高于上限');
  if (normalized.minSellPrice != null && sellPrice < normalized.minSellPrice) reasons.push('卖出价低于下限');
  if (normalized.minProfitRate != null && profitRate < normalized.minProfitRate) reasons.push('利润率低于要求');
  // 即使玩家没有填写价格限制，自动跑商也不应明知货差为负仍继续买入。
  // 这只是基本止损；燃料、养护和维修仍会让低毛利路线承担真实风险。
  if (normalized.minProfitRate == null && profitRate < 0) reasons.push('当前卖价低于买价');
  return {
    ok: reasons.length === 0,
    reasons: reasons,
    profitRate: profitRate,
    policy: normalized,
  };
}

export function isOpenMarketGood(good) {
  return !!(good && Array.isArray(good.marketAccess) && good.marketAccess.indexOf('open') !== -1);
}

export function isGoodAllowedInMarket(good, marketMode) {
  if (!good) return false;
  if (marketMode === 'black') return Economy.isBlackMarketGood(good.id);
  return isOpenMarketGood(good);
}

export function canUseMarket(state, systemId, marketMode) {
  if (marketMode === 'black') return Faction.canAccessBlackMarket(state, systemId);
  return true;
}
