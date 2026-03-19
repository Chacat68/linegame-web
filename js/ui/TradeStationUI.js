// js/ui/TradeStationUI.js — 贸易站标签页渲染
// 依赖：systems/trade/TradeStationSystem.js
// 导出：render

import {
  TRADE_STATION_MANAGERS,
  TRADE_STATION_STRATEGIES,
} from '../data/tradeStations.js';
import * as TradeStation from '../systems/trade/TradeStationSystem.js';

export function render(state, onBuild, onUpgrade, onHireManager, onSetStrategy) {
  const container = document.getElementById('trade-station-list');
  if (!container) return;

  const summary = TradeStation.getSummary(state);
  const ownedStations = TradeStation.getOwnedStations(state);
  const buildCandidates = TradeStation.getBuildCandidates(state);

  let html = '';

  html += '<div class="trade-station-summary-card">' +
    '<div class="trade-station-summary-head">' +
      '<span class="trade-station-summary-title">🏪 商业版图</span>' +
      '<span class="trade-station-summary-sub">已建 ' + summary.count + ' 座贸易站</span>' +
    '</div>' +
    '<div class="trade-station-summary-grid">' +
      '<div class="trade-station-metric"><span class="trade-station-metric-label">预计日收益</span><span class="trade-station-metric-value">+' + Math.floor(summary.projectedIncome).toLocaleString() + '</span></div>' +
      '<div class="trade-station-metric"><span class="trade-station-metric-label">累计收益</span><span class="trade-station-metric-value">' + Math.floor(summary.totalIncome).toLocaleString() + '</span></div>' +
      '<div class="trade-station-metric"><span class="trade-station-metric-label">管理员</span><span class="trade-station-metric-value">' + summary.managedCount + '/' + summary.count + '</span></div>' +
    '</div>' +
    '<div class="trade-station-summary-tip">每日收益会随当地市场深度、重点商品行情与经济周期自动波动。</div>' +
    '</div>';

  html += '<div class="trade-station-section-title">🏗 建站候选</div>';
  if (buildCandidates.length === 0) {
    html += '<div class="trade-station-empty">先探索更多星球，才能解锁新的建站候选。</div>';
  } else {
    buildCandidates.forEach(function (candidate) {
      html += '<div class="trade-station-build-card">' +
        '<div class="trade-station-card-head">' +
          '<span class="trade-station-card-name">' + candidate.system.name + '</span>' +
          '<span class="trade-station-card-badge">' + candidate.system.typeLabel + '</span>' +
        '</div>' +
        '<div class="trade-station-card-meta">市场深度 ' + (candidate.system.marketDepth || 200) + ' · ' +
          (candidate.isCurrent ? '当前停靠中，可立即投资' : '已访问，可远程规划投资') +
        '</div>' +
        '<div class="trade-station-card-desc">' + candidate.system.description + '</div>' +
        '<button class="btn-action trade-station-build-btn' + (candidate.canAfford ? '' : ' disabled') + '"' +
          ' data-action="build" data-system-id="' + candidate.system.id + '"' +
          (candidate.canAfford ? '' : ' disabled') + '>投资 ' + candidate.buildCost.toLocaleString() + ' 积分</button>' +
      '</div>';
    });
  }

  html += '<div class="trade-station-section-title">📡 已建贸易站</div>';
  if (ownedStations.length === 0) {
    html += '<div class="trade-station-empty">还没有贸易站。先完成第一笔长期投资，建立你的商业节点网络。</div>';
  } else {
    ownedStations.forEach(function (entry) {
      var station = entry.station;
      html += '<div class="trade-station-card">' +
        '<div class="trade-station-card-head">' +
          '<span class="trade-station-card-name">' + entry.system.name + ' 贸易站</span>' +
          '<span class="trade-station-card-badge">Lv.' + station.level + ' · ' + entry.levelConfig.name + '</span>' +
        '</div>' +
        '<div class="trade-station-income-row">' +
          '<span>预计日收益 <b>+' + Math.floor(entry.projectedIncome).toLocaleString() + '</b></span>' +
          '<span>上一日 +' + Math.floor(station.lastIncome || 0).toLocaleString() + '</span>' +
          '<span>累计 ' + Math.floor(station.totalIncome || 0).toLocaleString() + '</span>' +
        '</div>' +
        '<div class="trade-station-card-meta">经济系数 ×' + entry.economicFactor.toFixed(2) + ' · 累计投资 ' + Math.floor(station.investment || 0).toLocaleString() + ' · 建于第 ' + (station.buildDay || 1) + ' 天</div>' +
        '<div class="trade-station-card-meta">管理员：' + (entry.manager ? (entry.manager.name + '（日薪 ' + entry.manager.dailySalary + '）') : '未雇佣') +
          ' · 策略：' + entry.strategy.name + '</div>' +
        '<div class="trade-station-actions">' +
          '<button class="btn-action trade-station-upgrade-btn' + (entry.nextLevel ? '' : ' disabled') + '"' +
            ' data-action="upgrade" data-system-id="' + station.systemId + '"' +
            (entry.nextLevel ? '' : ' disabled') + '>' +
            (entry.nextLevel ? ('升级至 Lv.' + entry.nextLevel.level + '（+' + entry.nextUpgradeCost.toLocaleString() + '）') : '已达满级') +
          '</button>' +
        '</div>' +
        '<div class="trade-station-subsection">👤 管理员</div>' +
        '<div class="trade-station-choice-row">' +
          TRADE_STATION_MANAGERS.map(function (manager) {
            var activeClass = station.managerId === manager.id ? ' active' : '';
            return '<button class="trade-station-choice-btn' + activeClass + '"' +
              ' data-action="hire-manager" data-system-id="' + station.systemId + '" data-manager-id="' + manager.id + '">' +
              manager.name + '<span>' + manager.hireCost.toLocaleString() + '</span></button>';
          }).join('') +
        '</div>' +
        '<div class="trade-station-subsection">📈 经营策略</div>' +
        '<div class="trade-station-choice-row">' +
          TRADE_STATION_STRATEGIES.map(function (strategy) {
            var activeClass = station.strategyId === strategy.id ? ' active' : '';
            return '<button class="trade-station-choice-btn' + activeClass + '"' +
              ' data-action="set-strategy" data-system-id="' + station.systemId + '" data-strategy-id="' + strategy.id + '">' +
              strategy.name + '<span>' + Math.round(strategy.incomeMultiplier * 100) + '%</span></button>';
          }).join('') +
        '</div>' +
      '</div>';
    });
  }

  container.innerHTML = html;

  container.querySelectorAll('[data-action="build"]').forEach(function (button) {
    button.addEventListener('click', function () {
      onBuild(button.dataset.systemId);
    });
  });

  container.querySelectorAll('[data-action="upgrade"]').forEach(function (button) {
    button.addEventListener('click', function () {
      onUpgrade(button.dataset.systemId);
    });
  });

  container.querySelectorAll('[data-action="hire-manager"]').forEach(function (button) {
    button.addEventListener('click', function () {
      onHireManager(button.dataset.systemId, button.dataset.managerId);
    });
  });

  container.querySelectorAll('[data-action="set-strategy"]').forEach(function (button) {
    button.addEventListener('click', function () {
      onSetStrategy(button.dataset.systemId, button.dataset.strategyId);
    });
  });
}
