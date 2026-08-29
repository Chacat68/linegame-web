// js/ui/MarketTradeStationListPresenter.js — 建站候选、探索情报与已建站列表投影

import { TRADE_STATION_STRATEGIES } from '../data/tradeStations.js';
import * as Exploration from '../systems/galaxy/ExplorationSystem.js';
import {
  escapeMarketOperationsHtml,
  escapeMarketOperationsHtmlAttr,
  getTradeStationDomId,
  renderStrategyRecommendationButton,
  renderStrategyRecommendationMeta,
  renderTradeStationExplorationEffectMeta,
  renderTradeStationRoleMeta,
} from './MarketOperationsPresentationSupport.js';

function renderTradeStationListBriefItem(label, value, note, toneClass) {
  return '<div class="trade-station-list-brief-item' + (toneClass ? ' ' + toneClass : '') + '" role="listitem">' +
    '<span class="trade-station-list-brief-label">' + escapeMarketOperationsHtml(label) + '</span>' +
    '<strong class="trade-station-list-brief-value">' + escapeMarketOperationsHtml(value) + '</strong>' +
    '<span class="trade-station-list-brief-note">' + escapeMarketOperationsHtml(note) + '</span>' +
  '</div>';
}

function renderTradeStationListBrief(ownedStations, buildCandidates, localStation, buildCandidate, networkInvestmentPlan, networkUpgradePlan) {
  var candidateCount = buildCandidates.length;
  var ownedCount = ownedStations.length;
  var investmentReady = networkInvestmentPlan && networkInvestmentPlan.affordableCount ? networkInvestmentPlan.affordableCount : 0;
  var investmentTotal = networkInvestmentPlan && networkInvestmentPlan.targetCount ? networkInvestmentPlan.targetCount : 0;
  var upgradeReady = networkUpgradePlan && networkUpgradePlan.affordableCount ? networkUpgradePlan.affordableCount : 0;
  var upgradeTotal = networkUpgradePlan && networkUpgradePlan.targetCount ? networkUpgradePlan.targetCount : 0;
  var localStatus = localStation
    ? '本地站点'
    : (buildCandidate ? '当前可建' : '待解锁');
  var localNote = localStation
    ? '当前地点可维护配置'
    : (buildCandidate ? '当前地点可建站' : '当前地点暂时不能建站');
  var candidateNote = buildCandidate
    ? '包含当前查看地点'
    : (candidateCount > 0 ? '已访问地点等待查看' : '继续探索以解锁新地点');
  var signalTitle = '等待第一个建站地点';
  var signalNote = '目前没有候选地点，先访问和探索更多地方。';
  var signalTone = 'trade-station-list-signal--idle';

  if (buildCandidate) {
    signalTitle = '当前地点可以建站';
    signalNote = buildCandidate.system.name + ' 已进入建站候选，投资门槛 ' + Math.floor(buildCandidate.buildCost || 0).toLocaleString() + '。';
    signalTone = buildCandidate.canAfford ? 'trade-station-list-signal--ready' : 'trade-station-list-signal--watch';
  } else if (localStation) {
    signalTitle = '本地站点可维护';
    signalNote = localStation.system.name + ' 已建站，适合先检查升级与经营方式。';
    signalTone = 'trade-station-list-signal--ready';
  } else if (upgradeReady > 0) {
    signalTitle = '升级批量操作待命';
    signalNote = '当前预算可覆盖 ' + upgradeReady + ' / ' + upgradeTotal + ' 个升级目标。';
    signalTone = 'trade-station-list-signal--ready';
  } else if (investmentReady > 0) {
    signalTitle = '追加投资待命';
    signalNote = '当前预算可覆盖 ' + investmentReady + ' / ' + investmentTotal + ' 个增配目标。';
    signalTone = 'trade-station-list-signal--ready';
  } else if (candidateCount > 0) {
    signalTitle = '候选地点等待查看';
    signalNote = '先比较候选地点的市场大小、用途和探索信息，再决定建站顺序。';
    signalTone = 'trade-station-list-signal--watch';
  } else if (ownedCount > 0) {
    signalTitle = '全网保持观察';
    signalNote = '当前没有候选或可执行批量操作，已建站列表用于复核收益和配置。';
    signalTone = 'trade-station-list-signal--watch';
  }

  return '<div class="trade-station-list-brief" role="group" aria-label="商网列表摘要">' +
    '<div class="trade-station-list-brief-head">' +
      '<div>' +
        '<div class="trade-station-list-brief-title">商网列表摘要</div>' +
        '<div class="trade-station-list-brief-subtitle">把候选、已建站点和可执行批量操作压成局部状态，进入列表前先确定关注点。</div>' +
      '</div>' +
      '<span class="market-finance-chip">站点分区</span>' +
    '</div>' +
    '<div class="trade-station-list-brief-grid" role="list">' +
      renderTradeStationListBriefItem('可建站地点', String(candidateCount), candidateNote, buildCandidate ? 'tone-hot' : '') +
      renderTradeStationListBriefItem('已建站点', String(ownedCount), ownedCount > 0 ? '可维护收益与配置' : '等待第一座贸易站', ownedCount > 0 ? 'tone-cool' : '') +
      renderTradeStationListBriefItem('本地状态', localStatus, localNote, localStation ? 'tone-cool' : (buildCandidate ? 'tone-warm' : '')) +
      renderTradeStationListBriefItem('可执行批量操作', upgradeReady + ' 升级 / ' + investmentReady + ' 增配', '目标池 ' + (upgradeTotal + investmentTotal) + ' 项', (upgradeReady + investmentReady) > 0 ? 'tone-warm' : '') +
    '</div>' +
    '<div class="trade-station-list-signal ' + signalTone + '">' +
      '<span class="trade-station-list-signal-kicker">站点状态</span>' +
      '<strong class="trade-station-list-signal-title">' + escapeMarketOperationsHtml(signalTitle) + '</strong>' +
      '<span class="trade-station-list-signal-note">' + escapeMarketOperationsHtml(signalNote) + '</span>' +
    '</div>' +
  '</div>';
}

export function getTradeStationCandidateIntel(state, systemId, exploration) {
  var explorationPort = exploration || Exploration;
  var intel = explorationPort.getSurveyDecisionIntel(state || {}, systemId);
  if (!intel || !intel.hasIntel) return null;

  if (intel.depotSignal) {
    return { systemId: systemId, signal: 'logistics', label: '废弃补给站', note: intel.anomalyHint || intel.dispatchHint || intel.marketHint || '探索报告显示这里适合作为补给点。' };
  }
  if (intel.routeSignal) {
    return { systemId: systemId, signal: 'route', label: '隐藏航线图', note: intel.dispatchHint || '探索报告包含航线情报，可用于规划贸易站路线。' };
  }
  if (intel.researchSignal) {
    return { systemId: systemId, signal: 'research', label: intel.relicSignal ? '古代遗迹' : '科研样本', note: intel.researchHint || '探索报告显示这里能为研究提供帮助。' };
  }
  if (intel.marketSignal) {
    return { systemId: systemId, signal: 'market', label: '贸易窗口', note: intel.marketHint || '探索报告显示这里可能有交易机会。' };
  }
  if (intel.logisticsSignal) {
    return { systemId: systemId, signal: 'logistics', label: '补给点', note: intel.dispatchHint || intel.marketHint || '探索报告显示这里适合作为补给点。' };
  }

  return {
    systemId: systemId,
    signal: intel.primarySignal || 'survey',
    label: intel.primaryLabel || '探索线索',
    note: intel.marketHint || intel.dispatchHint || '该地点已有探索报告，可用来判断是否适合建站。',
  };
}

export function renderTradeStationCandidateIntel(state, systemId, className, exploration) {
  var intel = getTradeStationCandidateIntel(state, systemId, exploration);
  if (!intel) return '';
  var extraClass = className ? (' ' + className) : '';
  return '<div class="trade-station-intel-note' + extraClass + '">' +
    '<span class="market-finance-chip">探索支持 · ' + escapeMarketOperationsHtml(intel.label) + '</span>' +
    '<span>' + escapeMarketOperationsHtml(intel.note) + '</span>' +
  '</div>';
}

export function renderMarketTradeStationList(request) {
  var input = request || {};
  var state = input.state || {};
  var ownedStations = input.ownedStations || [];
  var buildCandidates = input.buildCandidates || [];
  var localStation = input.localStation || null;
  var buildCandidate = input.buildCandidate || null;
  var exploration = input.exploration || Exploration;
  var html = '<section class="market-finance-section">' +
    renderTradeStationListBrief(ownedStations, buildCandidates, localStation, buildCandidate, input.networkInvestmentPlan, input.networkUpgradePlan) +
    '<div class="trade-station-section-title">🏗 建站候选</div>';

  if (buildCandidate || buildCandidates.length > 0) {
    html += '<div class="trade-station-card-list trade-station-card-list--candidates" role="list" aria-label="建站候选列表">';
    buildCandidates.forEach(function (candidate) {
      var cardId = getTradeStationDomId('trade-station-candidate-card', candidate.system.id);
      var titleId = getTradeStationDomId('trade-station-candidate-title', candidate.system.id);
      var metaId = getTradeStationDomId('trade-station-candidate-meta', candidate.system.id);
      var descId = getTradeStationDomId('trade-station-candidate-desc', candidate.system.id);
      html += '<article id="' + escapeMarketOperationsHtmlAttr(cardId) + '" class="trade-station-build-card" role="listitem" tabindex="0" aria-labelledby="' + escapeMarketOperationsHtmlAttr(titleId) + '" aria-describedby="' + escapeMarketOperationsHtmlAttr(metaId + ' ' + descId) + '">' +
        '<div class="trade-station-card-head">' +
          '<span id="' + escapeMarketOperationsHtmlAttr(titleId) + '" class="trade-station-card-name">' + candidate.system.name + '</span>' +
          '<span class="trade-station-card-badge">' + candidate.system.typeLabel + '</span>' +
        '</div>' +
        '<div id="' + escapeMarketOperationsHtmlAttr(metaId) + '" class="trade-station-card-meta">市场大小 ' + (candidate.system.marketDepth || 200) + ' · ' + (candidate.isCurrent ? '当前停靠中，可立即投资' : '已访问，可先加入建站计划') + '</div>' +
        renderTradeStationRoleMeta(candidate.role, candidate.prospectiveRegionalSynergy, '预期角色') +
        renderStrategyRecommendationMeta(candidate.strategyRecommendation, 'trade-station-card-meta') +
        renderTradeStationExplorationEffectMeta(candidate.explorationEffect, 'trade-station-card-meta') +
        renderTradeStationCandidateIntel(state, candidate.system.id, 'is-candidate', exploration) +
        '<div id="' + escapeMarketOperationsHtmlAttr(descId) + '" class="trade-station-card-desc">' + candidate.system.description + '</div>' +
        '<button class="btn-action trade-station-build-btn' + (candidate.canAfford ? '' : ' disabled') + '" data-action="market-build-station" data-system-id="' + escapeMarketOperationsHtmlAttr(candidate.system.id) + '" aria-describedby="' + escapeMarketOperationsHtmlAttr(metaId + ' ' + descId) + '" aria-label="' + escapeMarketOperationsHtmlAttr('在 ' + candidate.system.name + ' 建立贸易站，投资 ' + candidate.buildCost.toLocaleString() + ' 积分') + '"' + (candidate.canAfford ? '' : ' disabled aria-disabled="true"') + '>' + (candidate.canAfford ? ('投资 ' + candidate.buildCost.toLocaleString() + ' 积分') : (candidate.lockReason || ('投资 ' + candidate.buildCost.toLocaleString() + ' 积分'))) + '</button>' +
      '</article>';
    });
    html += '</div>';
  } else {
    html += '<div class="trade-station-empty">先探索更多星球，才能解锁新的建站候选。</div>';
  }

  html += '</section><section class="market-finance-section"><div class="trade-station-section-title">📡 已建贸易站</div>';
  if (ownedStations.length === 0) {
    html += '<div class="trade-station-empty">还没有贸易站。先在当前停靠地点完成第一笔长期投资。</div>';
  } else {
    html += '<div class="trade-station-card-list trade-station-card-list--owned" role="list" aria-label="已建贸易站列表">';
    ownedStations.forEach(function (entry) {
      var station = entry.station;
      var cardId = getTradeStationDomId('trade-station-owned-card', station.systemId);
      var titleId = getTradeStationDomId('trade-station-owned-title', station.systemId);
      var incomeId = getTradeStationDomId('trade-station-owned-income', station.systemId);
      var strategyGroupId = getTradeStationDomId('trade-station-strategy-group', station.systemId);
      html += '<article id="' + escapeMarketOperationsHtmlAttr(cardId) + '" class="trade-station-card" role="listitem" tabindex="0" aria-labelledby="' + escapeMarketOperationsHtmlAttr(titleId) + '" aria-describedby="' + escapeMarketOperationsHtmlAttr(incomeId) + '">' +
        '<div class="trade-station-card-head"><span id="' + escapeMarketOperationsHtmlAttr(titleId) + '" class="trade-station-card-name">' + entry.system.name + ' 贸易站</span><span class="trade-station-card-badge">Lv.' + station.level + ' · ' + entry.levelConfig.name + '</span></div>' +
        '<div id="' + escapeMarketOperationsHtmlAttr(incomeId) + '" class="trade-station-income-row" role="group" aria-label="' + escapeMarketOperationsHtmlAttr(entry.system.name + ' 收益指标') + '"><span>预计日收益 <b>+' + Math.floor(entry.projectedIncome).toLocaleString() + '</b></span><span>上一日 +' + Math.floor(station.lastIncome || 0).toLocaleString() + '</span><span>累计 ' + Math.floor(station.totalIncome || 0).toLocaleString() + '</span></div>' +
        renderTradeStationRoleMeta(entry.role, entry.regionalSynergy, '站点角色') +
        renderStrategyRecommendationMeta(entry.strategyRecommendation, 'trade-station-card-meta') +
        renderTradeStationExplorationEffectMeta(entry.explorationEffect, 'trade-station-card-meta') +
        '<div class="trade-station-card-meta">经济系数 ×' + entry.economicFactor.toFixed(2) + ' · 累计投资 ' + Math.floor(station.investment || 0).toLocaleString() + ' · 建于第 ' + (station.buildDay || 1) + ' 天</div>' +
        '<div class="trade-station-card-meta">经营方式：' + entry.strategy.name + '</div>' +
        '<div class="trade-station-actions" role="group" aria-label="' + escapeMarketOperationsHtmlAttr(entry.system.name + ' 贸易站操作') + '">' +
          renderStrategyRecommendationButton(entry, 'trade-station-upgrade-btn') +
          '<button class="btn-action trade-station-upgrade-btn' + (entry.nextLevel ? '' : ' disabled') + '" data-action="market-upgrade-station" data-system-id="' + escapeMarketOperationsHtmlAttr(station.systemId) + '" aria-label="' + escapeMarketOperationsHtmlAttr(entry.system.name + (entry.nextLevel ? (' 升级至 Lv.' + entry.nextLevel.level) : ' 已达满级')) + '"' + (entry.nextLevel ? '' : ' disabled aria-disabled="true"') + '>' + (entry.nextLevel ? ('升级至 Lv.' + entry.nextLevel.level + '（+' + entry.nextUpgradeCost.toLocaleString() + '）') : (entry.nextLevelLockLabel || '已达满级')) + '</button>' +
        '</div>' +
        '<div id="' + escapeMarketOperationsHtmlAttr(strategyGroupId) + '" class="trade-station-subsection">🧭 经营方式</div>' +
        '<div class="trade-station-choice-row" role="group" aria-labelledby="' + escapeMarketOperationsHtmlAttr(strategyGroupId) + '">' + TRADE_STATION_STRATEGIES.map(function (strategy) {
          var active = station.strategyId === strategy.id;
          return '<button class="trade-station-choice-btn' + (active ? ' active' : '') + '" data-action="market-set-strategy" data-system-id="' + escapeMarketOperationsHtmlAttr(station.systemId) + '" data-strategy-id="' + escapeMarketOperationsHtmlAttr(strategy.id) + '" aria-pressed="' + (active ? 'true' : 'false') + '" aria-label="' + escapeMarketOperationsHtmlAttr(entry.system.name + ' 经营方式 ' + strategy.name + '，预计收益 ' + Math.round(strategy.incomeMultiplier * 100) + '%，' + (strategy.riskLabel || '稳健')) + '">' + strategy.name + '<span>' + Math.round(strategy.incomeMultiplier * 100) + '% · ' + (strategy.riskLabel || '稳健') + '</span></button>';
        }).join('') + '</div>' +
      '</article>';
    });
    html += '</div>';
  }
  return html + '</section>';
}
