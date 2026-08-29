// js/ui/MarketLocalOperationsPresenter.js — 当前地点经营状态与本地操作投影

import { TRADE_STATION_STRATEGIES } from '../data/tradeStations.js';
import { findSystem } from '../data/systems.js';
import {
  escapeMarketOperationsHtml,
  escapeMarketOperationsHtmlAttr,
  renderMarketFinanceRoleMeta,
  renderStrategyRecommendationButton,
  renderStrategyRecommendationMeta,
  renderTradeStationExplorationEffectMeta,
} from './MarketOperationsPresentationSupport.js';
import { renderTradeStationCandidateIntel } from './MarketTradeStationListPresenter.js';

function renderLocalOperationsMetric(label, value, note, toneClass) {
  return '<div class="market-local-operations-item' + (toneClass ? ' ' + toneClass : '') + '" role="listitem">' +
    '<span class="market-local-operations-label">' + escapeMarketOperationsHtml(label) + '</span>' +
    '<strong class="market-local-operations-value">' + escapeMarketOperationsHtml(value) + '</strong>' +
    '<span class="market-local-operations-note">' + escapeMarketOperationsHtml(note) + '</span>' +
  '</div>';
}

function renderLocalOperationsPanel(state, viewingSystem, localStation, buildCandidate, localInvestment, isCurrentSys) {
  var system = findSystem(viewingSystem);
  var systemName = system ? system.name : viewingSystem;
  var credits = Math.floor((state && state.credits) || 0);
  var statusValue = '未开放';
  var statusNote = systemName + ' 暂无可维护站点或建站资格';
  var outputValue = '--';
  var outputNote = '完成前置探索后可评估本地经营产能';
  var configValue = '--';
  var configNote = '当前没有设置经营方式';
  var capitalValue = '--';
  var capitalNote = '可用现金 ' + credits.toLocaleString();
  var statusTone = '';
  var outputTone = '';
  var configTone = '';
  var capitalTone = '';
  var focusTitle = '当前地点暂无可经营内容';
  var focusNote = '该地点还没有贸易站，也暂时不能建站。';
  var focusTone = 'idle';

  if (localStation) {
    var recommendation = localStation.strategyRecommendation;
    var upgradeCost = Math.floor(localStation.nextUpgradeCost || 0);
    var investmentAmount = localInvestment ? Math.floor(localInvestment.suggestedAmount || 0) : 0;
    statusValue = 'Lv.' + localStation.station.level + ' 在线';
    statusNote = systemName + ' · ' + (localStation.role ? localStation.role.name : '未分工');
    outputValue = '+' + Math.floor(localStation.projectedIncome || 0).toLocaleString() + '/日';
    outputNote = '毛收入 ' + Math.floor(localStation.grossIncome || 0).toLocaleString() + ' · 维护 ' + Math.floor(localStation.upkeep || 0).toLocaleString();
    configValue = localStation.strategy ? localStation.strategy.name : '待配置';
    configNote = '当前经营方式';
    statusTone = 'tone-cool';
    outputTone = 'tone-cool';
    configTone = localStation.strategy ? 'tone-cool' : 'tone-warm';

    if (localStation.nextLevel && upgradeCost > 0) {
      capitalValue = '升级 ' + upgradeCost.toLocaleString();
      capitalNote = credits >= upgradeCost ? '当前预算可覆盖升级' : ('尚缺 ' + (upgradeCost - credits).toLocaleString());
      capitalTone = credits >= upgradeCost ? 'tone-cool' : 'tone-warm';
    } else if (localInvestment && investmentAmount > 0) {
      capitalValue = '增投 ' + investmentAmount.toLocaleString();
      capitalNote = credits >= investmentAmount ? '当前预算可覆盖增投' : ('尚缺 ' + (investmentAmount - credits).toLocaleString());
      capitalTone = credits >= investmentAmount ? 'tone-cool' : 'tone-warm';
    } else {
      capitalValue = '已满级';
      capitalNote = '当前没有站点升级成本';
      capitalTone = 'tone-cool';
    }

    if (!isCurrentSys) {
      focusTitle = '远程经营审阅';
      focusNote = '可查看收益与经营方式，抵达后才能升级、投资或调整经营方式。';
      focusTone = 'remote';
    } else if (recommendation && recommendation.shouldSwitch) {
      focusTitle = '经营方式可以调整';
      focusNote = '当前经营方式与本地线索不太匹配，可切换为「' + recommendation.strategy.name + '」。';
      focusTone = 'watch';
    } else if (localStation.nextLevel && upgradeCost > 0 && credits >= upgradeCost) {
      focusTitle = '站点升级窗口已打开';
      focusNote = '现有预算可覆盖 Lv.' + localStation.nextLevel.level + ' 升级成本 ' + upgradeCost.toLocaleString() + '。';
      focusTone = 'ready';
    } else if (localInvestment && investmentAmount > 0 && credits >= investmentAmount) {
      focusTitle = '本地增投具备预算';
      focusNote = '当前可覆盖建议增投 ' + investmentAmount.toLocaleString() + '，预估日分红率 ' + (localInvestment.expectedYieldRate * 100).toFixed(2) + '%。';
      focusTone = 'ready';
    } else {
      focusTitle = '本地站点运行稳定';
      focusNote = '经营方式已设置，当前每天预计收入 +' + Math.floor(localStation.projectedIncome || 0).toLocaleString() + '。';
      focusTone = 'stable';
    }
  } else if (buildCandidate) {
    var buildCost = Math.floor(buildCandidate.buildCost || 0);
    var strategy = buildCandidate.strategyRecommendation && buildCandidate.strategyRecommendation.strategy;
    statusValue = '可建站';
    statusNote = systemName + ' · ' + (buildCandidate.role ? buildCandidate.role.name : '待评估角色');
    outputValue = '市场大小 ' + Math.floor((buildCandidate.system && buildCandidate.system.marketDepth) || 200).toLocaleString();
    outputNote = '建站后进入本地经营与商网收益循环';
    configValue = strategy ? strategy.name : '稳健经营';
    configNote = '默认经营方式 · 建成后可调整';
    capitalValue = '建站 ' + buildCost.toLocaleString();
    capitalNote = buildCandidate.canAfford ? '资金与资格均已满足' : (buildCandidate.lockReason || ('尚缺 ' + Math.max(0, buildCost - credits).toLocaleString()));
    statusTone = 'tone-warm';
    outputTone = 'tone-cool';
    configTone = 'tone-cool';
    capitalTone = buildCandidate.canAfford ? 'tone-cool' : 'tone-hot';

    if (!isCurrentSys) {
      focusTitle = '远程候选审阅';
      focusNote = '该地点可以建站，抵达后即可投资建设。';
      focusTone = 'remote';
    } else if (buildCandidate.canAfford) {
      focusTitle = '建站条件已具备';
      focusNote = '资金、公司权限和站点容量均已满足，当前建站成本 ' + buildCost.toLocaleString() + '。';
      focusTone = 'ready';
    } else if (buildCandidate.lockReason) {
      focusTitle = '建站资格受限';
      focusNote = buildCandidate.lockReason;
      focusTone = 'risk';
    } else {
      focusTitle = '建站预算不足';
      focusNote = '当前现金尚缺 ' + Math.max(0, buildCost - credits).toLocaleString() + '。';
      focusTone = 'risk';
    }
  } else if (!isCurrentSys) {
    focusTitle = '远程地点尚未开放经营';
    focusNote = '该地点还没有贸易站，也暂时不能建站；抵达并完成探索后再查看。';
    focusTone = 'remote';
  }

  return '<section class="market-local-operations-panel" aria-label="本地经营局部状态">' +
    '<div class="market-local-operations-head"><div><div class="market-local-operations-title">本地经营工位</div><div class="market-local-operations-subtitle">集中查看建站条件、每日收入、经营方向和可用资金。</div></div><span class="market-local-operations-badge">' + (isCurrentSys ? '本地可执行' : '远程只读') + '</span></div>' +
    '<div class="market-local-operations-grid" role="list" aria-label="本地经营指标">' +
      renderLocalOperationsMetric('地点状态', statusValue, statusNote, statusTone) +
      renderLocalOperationsMetric('经营产能', outputValue, outputNote, outputTone) +
      renderLocalOperationsMetric('经营方式', configValue, configNote, configTone) +
      renderLocalOperationsMetric('可用资金', capitalValue, capitalNote, capitalTone) +
    '</div>' +
    '<div class="market-local-operations-focus" aria-label="本地经营状态" data-tone="' + escapeMarketOperationsHtmlAttr(focusTone) + '"><span class="market-local-operations-focus-kicker">经营状态</span><strong class="market-local-operations-focus-title">' + escapeMarketOperationsHtml(focusTitle) + '</strong><span class="market-local-operations-focus-note">' + escapeMarketOperationsHtml(focusNote) + '</span></div>' +
  '</section>';
}

function getLocalInvestmentPositionMeta(localInvestment) {
  if (!localInvestment || localInvestment.investedAmount <= 0) return '';
  return '已投 ' + Math.floor(localInvestment.investedAmount).toLocaleString() +
    ' · 每天预计 +' + Math.floor(localInvestment.expectedDailyDividend || 0).toLocaleString() +
    ' · 约 ' + Math.floor(localInvestment.estimatedPaybackDays || 0) + ' 天回本 · 累计分红 ' + Math.floor(localInvestment.totalDividends || 0).toLocaleString() +
    (localInvestment.canRedeem ? (' · 现在退出预计收回 ' + Math.floor(localInvestment.estimatedExitValue || 0).toLocaleString()) : (' · 第 ' + localInvestment.redeemableDay + ' 天可退出'));
}

export function renderMarketLocalOperations(request) {
  var input = request || {};
  var state = input.state || {};
  var localStation = input.localStation || null;
  var buildCandidate = input.buildCandidate || null;
  var localInvestment = input.localInvestment || null;
  var ownedStations = input.ownedStations || [];
  var isCurrentSys = !!input.isCurrentSystem;
  var hasLocalInvestment = !!(localInvestment && localInvestment.investedAmount > 0);
  var positionMeta = getLocalInvestmentPositionMeta(localInvestment);
  var html = '<section class="market-finance-section">' +
    '<div class="market-finance-section-head"><div><div class="market-finance-title">🏪 本地经营</div><div class="market-finance-subtitle">在当前地点决定是否建站、升级或调整经营方式。</div></div><span class="market-finance-chip">商网 ' + input.tradeSummary.count + ' 站</span></div>' +
    renderLocalOperationsPanel(state, input.viewingSystem, localStation, buildCandidate, localInvestment, isCurrentSys);

  if (localStation) {
    html += '<div class="market-finance-card is-featured"><div class="market-finance-card-head"><span class="market-finance-card-title">' + localStation.system.name + ' 贸易站</span><span class="market-finance-chip">Lv.' + localStation.station.level + ' · ' + localStation.levelConfig.name + '</span></div>' +
      '<div class="market-finance-card-meta">预计日收益 +' + Math.floor(localStation.projectedIncome).toLocaleString() + ' · 累计 ' + Math.floor(localStation.station.totalIncome || 0).toLocaleString() + ' · 经济系数 ×' + localStation.economicFactor.toFixed(2) + '</div>' +
      renderMarketFinanceRoleMeta(localStation.role, localStation.regionalSynergy, '站点角色') + renderStrategyRecommendationMeta(localStation.strategyRecommendation, 'market-finance-card-meta') + renderTradeStationExplorationEffectMeta(localStation.explorationEffect, 'market-finance-card-meta') +
      '<div class="market-finance-card-meta">经营方式：' + localStation.strategy.name + '</div>' +
      (localInvestment ? '<div class="market-finance-card-meta">站点投资：' + (hasLocalInvestment ? positionMeta : ('参考投入 ' + localInvestment.suggestedAmount.toLocaleString() + ' · 每天预计回报率 ' + (localInvestment.expectedYieldRate * 100).toFixed(2) + '%')) + '</div>' : '') +
      (isCurrentSys
        ? '<div class="market-finance-actions" role="group" aria-label="' + escapeMarketOperationsHtmlAttr(localStation.system.name + ' 贸易站操作') + '">' + renderStrategyRecommendationButton(localStation, 'market-finance-btn') +
          '<button class="btn-action market-finance-btn' + (localStation.nextLevel ? '' : ' disabled') + '" data-action="market-upgrade-station" data-system-id="' + escapeMarketOperationsHtmlAttr(localStation.station.systemId) + '" aria-label="' + escapeMarketOperationsHtmlAttr(localStation.system.name + (localStation.nextLevel ? (' 升级至 Lv.' + localStation.nextLevel.level) : ' 已满级')) + '"' + (localStation.nextLevel ? '' : ' disabled aria-disabled="true"') + '>' + (localStation.nextLevel ? ('升级 +' + localStation.nextUpgradeCost.toLocaleString()) : (localStation.nextLevelLockLabel || '已满级')) + '</button>' +
          (localInvestment ? '<button class="btn-action market-finance-btn" data-action="market-invest-trade-station" data-system-id="' + escapeMarketOperationsHtmlAttr(localInvestment.systemId) + '" aria-label="' + escapeMarketOperationsHtmlAttr(localStation.system.name + ' 追加站点投资') + '">追加投资</button>' : '') +
          (hasLocalInvestment ? '<button class="btn-action market-finance-btn' + (localInvestment.canRedeem ? '' : ' disabled') + '" data-action="market-redeem-trade-station" data-system-id="' + escapeMarketOperationsHtmlAttr(localInvestment.systemId) + '" aria-label="' + escapeMarketOperationsHtmlAttr(localInvestment.canRedeem ? (localStation.system.name + ' 退出站点投资，预计收回 ' + localInvestment.estimatedExitValue) : (localStation.system.name + ' 站点投资第 ' + localInvestment.redeemableDay + ' 天可退出')) + '"' + (localInvestment.canRedeem ? '' : ' disabled aria-disabled="true"') + '>' + (localInvestment.canRedeem ? ('退出并收回 ' + Math.floor(localInvestment.estimatedExitValue || 0).toLocaleString()) : ('第 ' + localInvestment.redeemableDay + ' 天可退出')) + '</button>' : '') +
          '</div><div class="market-finance-station-stack"><div class="market-finance-subsection">🧭 经营方式</div><div class="trade-station-choice-row" role="group" aria-label="' + escapeMarketOperationsHtmlAttr(localStation.system.name + ' 经营方式选择') + '">' + TRADE_STATION_STRATEGIES.map(function (strategy) {
            var active = localStation.station.strategyId === strategy.id;
            return '<button class="trade-station-choice-btn' + (active ? ' active' : '') + '" data-action="market-set-strategy" data-system-id="' + escapeMarketOperationsHtmlAttr(localStation.station.systemId) + '" data-strategy-id="' + escapeMarketOperationsHtmlAttr(strategy.id) + '" aria-pressed="' + (active ? 'true' : 'false') + '" aria-label="' + escapeMarketOperationsHtmlAttr(localStation.system.name + ' 经营方式 ' + strategy.name + '，预计收益 ' + Math.round(strategy.incomeMultiplier * 100) + '%，' + (strategy.riskLabel || '稳健')) + '">' + strategy.name + '<span>' + Math.round(strategy.incomeMultiplier * 100) + '% · ' + (strategy.riskLabel || '稳健') + '</span></button>';
          }).join('') + '</div></div>'
        : '<div class="market-finance-locked">📡 远程查看模式：可查看该站点收益与经营方式，抵达后才能升级或调整。</div>') + '</div>';
  } else if (buildCandidate) {
    html += '<div class="market-finance-card"><div class="market-finance-card-head"><span class="market-finance-card-title">在 ' + buildCandidate.system.name + ' 建立贸易站</span><span class="market-finance-chip">' + buildCandidate.system.typeLabel + '</span></div>' +
      '<div class="market-finance-card-meta">市场大小 ' + (buildCandidate.system.marketDepth || 200) + ' · ' + buildCandidate.system.description + '</div>' +
      renderMarketFinanceRoleMeta(buildCandidate.role, buildCandidate.prospectiveRegionalSynergy, '预期角色') + renderStrategyRecommendationMeta(buildCandidate.strategyRecommendation, 'market-finance-card-meta') + renderTradeStationExplorationEffectMeta(buildCandidate.explorationEffect, 'market-finance-card-meta') + renderTradeStationCandidateIntel(state, buildCandidate.system.id, 'is-local', input.exploration) +
      '<div class="market-finance-card-meta">' + (buildCandidate.lockReason || '建站后可持续利用本地价格和市场状态赚钱。') + '</div>' +
      (localInvestment ? '<div class="market-finance-card-meta">站点投资：' + (hasLocalInvestment ? positionMeta : ('参考投入 ' + localInvestment.suggestedAmount.toLocaleString() + '；投入后锁定 30 天，退出成本 12%')) + '</div>' : '') +
      (isCurrentSys ? '<div class="market-finance-actions"><button class="btn-action market-finance-btn' + (buildCandidate.canAfford ? '' : ' disabled') + '" data-action="market-build-station" data-system-id="' + escapeMarketOperationsHtmlAttr(buildCandidate.system.id) + '" aria-label="' + escapeMarketOperationsHtmlAttr('在 ' + buildCandidate.system.name + ' 建立贸易站，投资 ' + buildCandidate.buildCost.toLocaleString()) + '"' + (buildCandidate.canAfford ? '' : ' disabled aria-disabled="true"') + '>' + (buildCandidate.canAfford ? ('投资 ' + buildCandidate.buildCost.toLocaleString()) : (buildCandidate.lockReason || ('投资 ' + buildCandidate.buildCost.toLocaleString()))) + '</button>' +
        (localInvestment ? '<button class="btn-action market-finance-btn" data-action="market-invest-trade-station" data-system-id="' + escapeMarketOperationsHtmlAttr(localInvestment.systemId) + '" aria-label="' + escapeMarketOperationsHtmlAttr(buildCandidate.system.name + ' 先做财务投资') + '">先做财务投资</button>' : '') +
        (hasLocalInvestment ? '<button class="btn-action market-finance-btn' + (localInvestment.canRedeem ? '' : ' disabled') + '" data-action="market-redeem-trade-station" data-system-id="' + escapeMarketOperationsHtmlAttr(localInvestment.systemId) + '"' + (localInvestment.canRedeem ? '' : ' disabled aria-disabled="true"') + '>' + (localInvestment.canRedeem ? ('退出并收回 ' + Math.floor(localInvestment.estimatedExitValue || 0).toLocaleString()) : ('第 ' + localInvestment.redeemableDay + ' 天可退出')) + '</button>' : '') + '</div>' : '<div class="market-finance-locked">📡 这里可以建站。抵达后可直接投资建设。</div>') + '</div>';
  } else {
    html += '<div class="market-finance-empty">该地点暂时不能建设贸易站，或尚未完成前置探索。</div>';
  }

  if (ownedStations.length > 0) {
    html += '<div class="market-finance-subsection">📡 商网快照</div><div class="market-finance-action-list">' + ownedStations.slice(0, 4).map(function (entry) {
      return '<div class="market-finance-network-row"><div class="market-finance-network-main"><div class="market-finance-action-title">' + entry.system.name + ' · Lv.' + entry.station.level + '</div><div class="market-finance-action-meta">日收益 +' + Math.floor(entry.projectedIncome).toLocaleString() + ' · ' + (entry.role ? entry.role.name : '未分工') + ' · 经营方式 ' + entry.strategy.name + '</div></div><div class="market-finance-network-note">累计 ' + Math.floor(entry.station.totalIncome || 0).toLocaleString() + '</div></div>';
    }).join('') + '</div>';
  }
  return html + '</section>';
}
