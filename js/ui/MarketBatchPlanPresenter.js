// js/ui/MarketBatchPlanPresenter.js — 商网批量计划、预算覆盖与排序投影

import { TRADE_STATION_STRATEGIES } from '../data/tradeStations.js';
import * as Finance from '../systems/finance/FinanceSystem.js';

const MARKET_BATCH_PLAN_SORT_OPTIONS = {
  investment: [
    { id: 'yield', label: '回报优先' },
    { id: 'stake', label: '低基数优先' },
    { id: 'name', label: '地点名' },
  ],
  upgrade: [
    { id: 'income', label: '收益优先' },
    { id: 'cost', label: '低成本优先' },
    { id: 'name', label: '地点名' },
  ],
  strategy: [
    { id: 'income', label: '收益优先' },
    { id: 'name', label: '地点名' },
  ],
};

export function getMarketBatchAffordablePlan(targets, budget, getCost) {
  var remaining = budget || 0;
  var affordableCount = 0;
  var affordableCost = 0;
  var totalCost = 0;
  var plannedTargets = [];
  var affordableTargets = [];
  var deferredTargets = [];

  targets.forEach(function (target) {
    var cost = Math.max(0, getCost(target) || 0);
    var targetWithCost = Object.assign({}, target, { planCost: cost });
    plannedTargets.push(targetWithCost);
    totalCost += cost;
    if (cost <= 0) {
      affordableTargets.push(targetWithCost);
      return;
    }
    if (remaining >= cost) {
      remaining -= cost;
      affordableCount += 1;
      affordableCost += cost;
      affordableTargets.push(targetWithCost);
      return;
    }
    deferredTargets.push(targetWithCost);
  });

  return {
    targetCount: targets.length,
    affordableCount: affordableCount,
    affordableCost: affordableCost,
    totalCost: totalCost,
    targets: plannedTargets,
    affordableTargets: affordableTargets,
    deferredTargets: deferredTargets,
  };
}

function getStrategyBatchPlan(ownedStations, strategy) {
  var targets = ownedStations.filter(function (entry) {
    return entry.station.strategyId !== strategy.id;
  });
  return {
    targetCount: targets.length,
    affordableCount: targets.length,
    affordableCost: 0,
    totalCost: 0,
    targets: targets.slice(),
    affordableTargets: targets.slice(),
    deferredTargets: [],
  };
}

export function getMarketInvestmentBatchPlan(state, ownedStations, finance) {
  var financePort = finance || Finance;
  var targets = financePort.getTradeInvestmentOptions(state, ownedStations.map(function (entry) {
    return entry.station.systemId;
  }));
  var plan = getMarketBatchAffordablePlan(targets, state.credits || 0, function (entry) {
    return entry.suggestedAmount || 0;
  });

  plan.suggestedAmount = targets[0] ? Math.max(1000, targets[0].suggestedAmount || 0) : 0;
  plan.amountPerTarget = plan.suggestedAmount;
  return plan;
}

function serializeBatchSystemIds(systemIds) {
  return (systemIds || []).filter(Boolean).join(',');
}

export function parseMarketBatchSystemIds(value) {
  if (!value) return [];
  return Array.from(new Set(value.split(',').map(function (entry) {
    return entry.trim();
  }).filter(Boolean)));
}

function getBatchPlanSortOptions(scope) {
  return MARKET_BATCH_PLAN_SORT_OPTIONS[scope] || [];
}

function resolveBatchPlanSortMode(scope, sortModes) {
  var options = getBatchPlanSortOptions(scope);
  if (options.length === 0) return '';
  var current = sortModes && sortModes[scope];
  return options.some(function (entry) { return entry.id === current; })
    ? current
    : options[0].id;
}

export function updateMarketOperationsSortModes(current, scope, mode) {
  var next = {
    investment: resolveBatchPlanSortMode('investment', current),
    upgrade: resolveBatchPlanSortMode('upgrade', current),
    strategy: resolveBatchPlanSortMode('strategy', current),
  };
  if (!scope) return next;
  if (getBatchPlanSortOptions(scope).some(function (entry) { return entry.id === mode; })) {
    next[scope] = mode;
  }
  return next;
}

function getBatchPlanTargetName(target) {
  if (!target || typeof target !== 'object') return '';
  if (target.name) return target.name;
  if (target.system && target.system.name) return target.system.name;
  return '';
}

function sortBatchPlanTargets(scope, targets, sortModes) {
  var activeMode = resolveBatchPlanSortMode(scope, sortModes);
  return (targets || []).slice().sort(function (a, b) {
    var diff = 0;
    if (scope === 'investment') {
      if (activeMode === 'yield') {
        diff = (b.expectedYieldRate || 0) - (a.expectedYieldRate || 0);
        if (diff !== 0) return diff;
        diff = (a.investedAmount || 0) - (b.investedAmount || 0);
      } else if (activeMode === 'stake') {
        diff = (a.investedAmount || 0) - (b.investedAmount || 0);
        if (diff !== 0) return diff;
        diff = (b.expectedYieldRate || 0) - (a.expectedYieldRate || 0);
      }
    } else if (scope === 'upgrade') {
      if (activeMode === 'income') {
        diff = (b.projectedIncome || 0) - (a.projectedIncome || 0);
        if (diff !== 0) return diff;
        diff = (a.planCost || 0) - (b.planCost || 0);
      } else if (activeMode === 'cost') {
        diff = (a.planCost || 0) - (b.planCost || 0);
        if (diff !== 0) return diff;
        diff = (b.projectedIncome || 0) - (a.projectedIncome || 0);
      }
    } else if (scope === 'strategy' && activeMode === 'income') {
      diff = (b.projectedIncome || 0) - (a.projectedIncome || 0);
    }
    if (diff !== 0) return diff;
    return getBatchPlanTargetName(a).localeCompare(getBatchPlanTargetName(b));
  });
}

function getSortedBatchPlan(scope, plan, budget, sortModes) {
  var sortedTargets = sortBatchPlanTargets(scope, plan.targets || [], sortModes);
  if (scope === 'strategy') {
    return Object.assign({}, plan, {
      targets: sortedTargets,
      affordableTargets: sortedTargets.slice(),
      deferredTargets: [],
      affordableCount: sortedTargets.length,
      targetCount: sortedTargets.length,
    });
  }

  var sortedPlan = getMarketBatchAffordablePlan(sortedTargets, budget || 0, function (target) {
    return target.planCost || 0;
  });
  if (typeof plan.suggestedAmount !== 'undefined') sortedPlan.suggestedAmount = plan.suggestedAmount;
  if (typeof plan.amountPerTarget !== 'undefined') sortedPlan.amountPerTarget = plan.amountPerTarget;
  return sortedPlan;
}

function renderBatchPlanSortToolbar(scope, label, sortModes) {
  var options = getBatchPlanSortOptions(scope);
  if (options.length <= 1) return '';
  var activeMode = resolveBatchPlanSortMode(scope, sortModes);
  return '<div class="market-batch-plan-sort-row">' +
    '<span class="market-batch-plan-sort-label">' + (label || '排序视角') + '</span>' +
    '<div class="market-batch-plan-sort-options">' + options.map(function (option) {
      return '<button class="market-batch-plan-sort-btn' + (option.id === activeMode ? ' active' : '') + '" data-action="market-batch-set-sort" data-batch-sort-scope="' + scope + '" data-batch-sort-mode="' + option.id + '">' + option.label + '</button>';
    }).join('') + '</div>' +
  '</div>';
}

function renderBatchPlanMetric(label, value, note) {
  return '<div class="market-batch-plan-metric"><span class="market-batch-plan-metric-label">' + label + '</span><strong class="market-batch-plan-metric-value">' + value + '</strong><span class="market-batch-plan-metric-note">' + note + '</span></div>';
}

function renderBatchPlanTargets(targets, renderTargetMeta) {
  if (!targets || targets.length === 0) return '<div class="market-batch-plan-empty">本轮暂无可覆盖站点。</div>';
  var previewTargets = targets.slice(0, 5);
  var hiddenCount = Math.max(0, targets.length - previewTargets.length);
  return '<div class="market-batch-plan-target-list">' + previewTargets.map(function (target) {
    var meta = renderTargetMeta(target);
    return '<div class="market-batch-plan-target"><div class="market-batch-plan-target-name">' + meta.title + '</div><div class="market-batch-plan-target-note">' + meta.note + '</div></div>';
  }).join('') + (hiddenCount > 0 ? '<div class="market-batch-plan-target market-batch-plan-target-more">+' + hiddenCount + ' 站仍在本轮计划中</div>' : '') + '</div>';
}

function renderBatchPlanDeferredNote(targets, renderTargetMeta, prefix) {
  if (!targets || targets.length === 0) return '';
  var previewTargets = targets.slice(0, 3);
  var hiddenCount = Math.max(0, targets.length - previewTargets.length);
  return '<div class="market-batch-plan-deferred-block">' +
    '<div class="market-batch-plan-deferred-head"><span class="market-batch-plan-section-label">' + (prefix || '预算后置') + '</span><span class="market-batch-plan-deferred-count">' + targets.length + ' 站</span></div>' +
    '<div class="market-batch-plan-deferred-copy">本轮预算或排序优先级会把这些站点留到下一波执行。</div>' +
    '<div class="market-batch-plan-deferred-list">' + previewTargets.map(function (target) {
      var meta = renderTargetMeta(target);
      return '<div class="market-batch-plan-deferred-item"><div class="market-batch-plan-deferred-item-name">' + meta.title + '</div><div class="market-batch-plan-deferred-item-note">' + meta.note + '</div></div>';
    }).join('') + (hiddenCount > 0 ? '<div class="market-batch-plan-deferred-item market-batch-plan-deferred-item-more">+' + hiddenCount + ' 站仍在等待下一波预算</div>' : '') + '</div></div>';
}

function renderBatchPlanCard(options) {
  var actionableSystemIds = options.actionableSystemIds || [];
  var disabled = actionableSystemIds.length === 0;
  return '<article class="market-batch-plan-card' + (options.toneClass ? ' ' + options.toneClass : '') + '">' +
    '<div class="market-batch-plan-card-head"><div><div class="market-batch-plan-card-title">' + options.title + '</div><div class="market-batch-plan-card-subtitle">' + options.subtitle + '</div></div><span class="market-batch-plan-card-badge">' + options.badge + '</span></div>' +
    '<div class="market-batch-plan-card-desc">' + options.description + '</div>' + (options.sortMarkup || '') +
    '<div class="market-batch-plan-metrics">' + options.metrics.join('') + '</div><div class="market-batch-plan-section-label">覆盖清单</div>' +
    renderBatchPlanTargets(options.coverageTargets, options.renderTargetMeta) + (options.deferredMarkup || '') +
    '<div class="market-batch-plan-card-footer"><div class="market-batch-plan-footer-note">' + options.footerNote + '</div><button class="btn-action trade-station-build-btn' + (disabled ? ' disabled' : '') + '" data-action="' + options.action + '" data-system-ids="' + serializeBatchSystemIds(actionableSystemIds) + '"' + (options.buttonAttrs || '') + (disabled ? ' disabled' : '') + '>' + options.actionLabel + '</button></div></article>';
}

export function renderMarketBatchPlanningPanel(state, ownedStations, networkInvestmentPlan, networkUpgradePlan, sortModes) {
  var investmentPlan = getSortedBatchPlan('investment', networkInvestmentPlan, state.credits || 0, sortModes);
  var upgradePlan = getSortedBatchPlan('upgrade', networkUpgradePlan, state.credits || 0, sortModes);
  var renderInvestmentTargetMeta = function (target) {
    return { title: target.name, note: '每天预计回报 ' + ((target.expectedYieldRate || 0) * 100).toFixed(2) + '% · 已投 ' + Math.floor(target.investedAmount || 0).toLocaleString() + ' · 本轮 +' + Math.floor(target.planCost || 0).toLocaleString() };
  };
  var renderUpgradeTargetMeta = function (target) {
    return { title: target.system.name + ' · Lv.' + target.station.level, note: '升级 +' + Math.floor(target.planCost || 0).toLocaleString() + ' · 日收益 +' + Math.floor(target.projectedIncome || 0).toLocaleString() + ' · 下一档 ' + (target.nextLevel ? target.nextLevel.name : '已满级') };
  };
  var strategyPlans = TRADE_STATION_STRATEGIES.map(function (strategy) {
    return { strategy: strategy, plan: getSortedBatchPlan('strategy', getStrategyBatchPlan(ownedStations, strategy), 0, sortModes) };
  });
  var readyWaveCount = [investmentPlan.affordableTargets.length > 0, upgradePlan.affordableTargets.length > 0].filter(Boolean).length + strategyPlans.filter(function (entry) { return entry.plan.affordableTargets.length > 0; }).length;

  return '<section class="market-finance-section market-batch-plan-panel">' +
    '<div class="market-finance-section-head market-batch-plan-head"><div><div class="market-finance-title">🧭 批量计划面板</div><div class="market-finance-subtitle">先审阅覆盖站点、单站成本和预算缺口，再决定是否执行批量操作。所有按钮都会按当前计划中的系统清单下发，而不是对全网盲发广播。</div></div><span class="market-finance-chip">待命批量操作 ' + readyWaveCount + '</span></div>' +
    '<div class="market-batch-plan-summary-strip"><span class="market-batch-plan-summary-pill">可用信用积分<strong>' + Math.floor(state.credits || 0).toLocaleString() + '</strong></span><span class="market-batch-plan-summary-pill">可控站点<strong>' + ownedStations.length + '</strong></span><span class="market-batch-plan-summary-pill">可投资<strong>' + investmentPlan.affordableTargets.length + '</strong></span><span class="market-batch-plan-summary-pill">升级待命<strong>' + upgradePlan.affordableTargets.length + '</strong></span></div>' +
    '<div class="market-batch-plan-grid market-batch-plan-grid-major">' +
      renderBatchPlanCard({
        title: '批量追加投资', subtitle: '优先投向回报较高的站点', badge: investmentPlan.affordableTargets.length > 0 ? '可执行' : '待预算', description: '按每天预计回报从高到低排序，预算会先投向更划算的站点。',
        sortMarkup: renderBatchPlanSortToolbar('investment', '排序视角', sortModes),
        metrics: [renderBatchPlanMetric('覆盖', investmentPlan.affordableCount + '/' + investmentPlan.targetCount, '候选 ' + investmentPlan.targetCount + ' 站，本轮可覆盖 ' + investmentPlan.affordableCount + ' 站。'), renderBatchPlanMetric('单站标准', Math.floor(investmentPlan.amountPerTarget || 0).toLocaleString(), '当前每站按统一金额增配，执行清单与实际扣款保持一致。'), renderBatchPlanMetric('预算', Math.floor(investmentPlan.affordableCost || 0).toLocaleString(), '全量需求 ' + Math.floor(investmentPlan.totalCost || 0).toLocaleString() + '，超出部分自动后置。')],
        coverageTargets: investmentPlan.affordableTargets, renderTargetMeta: renderInvestmentTargetMeta, deferredMarkup: renderBatchPlanDeferredNote(investmentPlan.deferredTargets, renderInvestmentTargetMeta, '预算后置'),
        footerNote: investmentPlan.affordableTargets.length > 0 ? '将按预计顺序依次向这些贸易站追加资金。' : '当前预算不足以向任何贸易站追加投资。', actionLabel: investmentPlan.affordableTargets.length > 0 ? ('执行 ' + investmentPlan.affordableTargets.length + ' 站增配') : '暂无可执行增配', action: 'market-batch-invest-trade-stations', actionableSystemIds: investmentPlan.affordableTargets.map(function (target) { return target.systemId; }), buttonAttrs: ' data-batch-amount="' + Math.floor(investmentPlan.amountPerTarget || 0) + '"', toneClass: 'tone-cool',
      }) +
      renderBatchPlanCard({
        title: '商网升级批量操作', subtitle: '收益优先', badge: upgradePlan.affordableTargets.length > 0 ? '可执行' : '待预算', description: '按预计日收益从高到低排序，先给最能放大现金流的站点做等级升级。',
        sortMarkup: renderBatchPlanSortToolbar('upgrade', '排序视角', sortModes),
        metrics: [renderBatchPlanMetric('覆盖', upgradePlan.affordableCount + '/' + upgradePlan.targetCount, '待升级 ' + upgradePlan.targetCount + ' 站，本轮可升级 ' + upgradePlan.affordableCount + ' 站。'), renderBatchPlanMetric('已预留', Math.floor(upgradePlan.affordableCost || 0).toLocaleString(), '当前可覆盖升级成本。'), renderBatchPlanMetric('全量需求', Math.floor(upgradePlan.totalCost || 0).toLocaleString(), '超出预算的站点会留在下轮批量操作。')],
        coverageTargets: upgradePlan.affordableTargets, renderTargetMeta: renderUpgradeTargetMeta, deferredMarkup: renderBatchPlanDeferredNote(upgradePlan.deferredTargets, renderUpgradeTargetMeta, '预算后置'),
        footerNote: upgradePlan.affordableTargets.length > 0 ? '按钮只会对预估列表中的站点下发升级。' : '当前预算不足以覆盖任何升级目标。', actionLabel: upgradePlan.affordableTargets.length > 0 ? ('执行 ' + upgradePlan.affordableTargets.length + ' 站升级') : '暂无可执行升级', action: 'market-batch-upgrade-stations', actionableSystemIds: upgradePlan.affordableTargets.map(function (target) { return target.station.systemId; }), toneClass: 'tone-warm',
      }) +
    '</div><div class="market-batch-plan-lane"><div class="market-batch-plan-lane-title">🧭 批量调整经营方式</div>' + renderBatchPlanSortToolbar('strategy', '排序视角', sortModes) + '<div class="market-batch-plan-grid">' +
      strategyPlans.map(function (entry) {
        var strategy = entry.strategy;
        var plan = entry.plan;
        return renderBatchPlanCard({
          title: strategy.name, subtitle: '全网经营方式同步', badge: plan.targetCount > 0 ? '可执行' : '已同步', description: '切换经营方式不消耗积分，但会立即改变整张商网的收益重点。',
          metrics: [renderBatchPlanMetric('覆盖', String(plan.targetCount), '本轮需要切换的站点数量。'), renderBatchPlanMetric('收益 / 风险', Math.round((strategy.incomeMultiplier || 1) * 100) + '% · ' + (strategy.riskLabel || '稳健'), strategy.desc || '用于判断这种经营方式是否合适。'), renderBatchPlanMetric('预算', '0', '同步经营方式不占用额外信用积分。')],
          coverageTargets: plan.affordableTargets,
          renderTargetMeta: function (target) { return { title: target.system.name, note: '当前 ' + target.strategy.name + ' · 预计日收益 +' + Math.floor(target.projectedIncome || 0).toLocaleString() + ' · 切换后同步为「' + strategy.name + '」' }; },
          footerNote: plan.targetCount > 0 ? '执行后会只同步预览中的站点。' : '所有贸易站都已经采用这套经营方式。', actionLabel: plan.targetCount > 0 ? ('同步 ' + plan.targetCount + ' 站经营方式') : '无需重复同步', action: 'market-batch-set-strategy', actionableSystemIds: plan.affordableTargets.map(function (target) { return target.station.systemId; }), buttonAttrs: ' data-strategy-id="' + strategy.id + '"',
        });
      }).join('') + '</div></div></section>';
}
