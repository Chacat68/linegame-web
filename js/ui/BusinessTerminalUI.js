// js/ui/BusinessTerminalUI.js — 统一商业终端界面
// 依赖：systems/commerce/CommerceFacade.js, systems/trade/TradeSystem.js, systems/finance/*, systems/fleet/*
// 导出：init, render, show, hide
//
// 职责：
//   - 提供统一的商业终端界面，整合所有商业操作
//   - 终端风格的现代化界面设计
//   - 实时数据仪表盘
//   - 快速操作面板
//
// 结构（标签页）：
//   1. 仪表盘 (Dashboard) - 实时数据概览
//   2. 市场 (Market) - 交易市场
//   3. 金融 (Finance) - 贷款、股票、保险
//   4. 期货 (Futures) - 期货合约交易
//   5. 贸易站 (Stations) - 贸易站管理
//   6. 舰队 (Fleet) - 舰队管理

import * as Commerce from '../systems/commerce/CommerceFacade.js';
import * as Trade from '../systems/trade/TradeSystem.js';
import * as Finance from '../systems/finance/FinanceSystem.js';
import * as Futures from '../systems/finance/FuturesSystem.js';
import * as Station from '../systems/trade/TradeStationSystem.js';
import * as Fleet from '../systems/fleet/FleetSystem.js';
import * as Economy from '../systems/economy/Economy.js';
import { GOODS } from '../data/goods.js';
import { SYSTEMS } from '../data/systems.js';
import {
  TRADE_STATION_MANAGERS,
  TRADE_STATION_STRATEGIES,
} from '../data/tradeStations.js';

// ---------------------------------------------------------------------------
// 状态与回调
// ---------------------------------------------------------------------------

let _state = null;
let _callbacks = {};
let _currentTab = 'dashboard';

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

export function init(state, callbacks) {
  _state = state;
  _callbacks = callbacks || {};
  _setupEventListeners();
  _currentTab = 'dashboard';
}

// ---------------------------------------------------------------------------
// 显示/隐藏终端
// ---------------------------------------------------------------------------

export function show() {
  const terminal = document.getElementById('business-terminal');
  if (terminal) {
    terminal.classList.remove('hidden');
    render(_state);
  }
}

export function hide() {
  const terminal = document.getElementById('business-terminal');
  if (terminal) {
    terminal.classList.add('hidden');
  }
}

export function toggle() {
  const terminal = document.getElementById('business-terminal');
  if (terminal) {
    if (terminal.classList.contains('hidden')) {
      show();
    } else {
      hide();
    }
  }
}

// ---------------------------------------------------------------------------
// 主渲染函数
// ---------------------------------------------------------------------------

export function render(state) {
  if (!state) return;
  _state = state;

  const container = document.getElementById('business-terminal-content');
  if (!container) return;

  // 更新标题栏数据
  _updateTerminalHeader(state);

  // 根据当前标签页渲染内容
  switch (_currentTab) {
    case 'dashboard':
      container.innerHTML = _renderDashboard(state);
      break;
    case 'market':
      container.innerHTML = _renderMarket(state);
      break;
    case 'finance':
      container.innerHTML = _renderFinance(state);
      break;
    case 'futures':
      container.innerHTML = _renderFutures(state);
      break;
    case 'stations':
      container.innerHTML = _renderStations(state);
      break;
    case 'fleet':
      container.innerHTML = _renderFleet(state);
      break;
    default:
      container.innerHTML = _renderDashboard(state);
  }

  // 重新绑定事件
  _bindActionButtons(container);
}

// ---------------------------------------------------------------------------
// 标题栏更新
// ---------------------------------------------------------------------------

function _updateTerminalHeader(state) {
  const snap = Commerce.getCommerceSnapshot(state);
  const netWorth = Trade.getNetWorth(state);

  // 更新关键指标
  const indicators = [
    { id: 'bt-credits', value: state.credits.toLocaleString() },
    { id: 'bt-networth', value: netWorth.toLocaleString() },
    { id: 'bt-credit-rating', value: snap.creditRating },
    { id: 'bt-daily-income', value: '+' + snap.stationDailyIncome.toLocaleString() },
  ];

  indicators.forEach(ind => {
    const el = document.getElementById(ind.id);
    if (el) el.textContent = ind.value;
  });

  // 更新信用评级颜色
  const ratingEl = document.getElementById('bt-credit-rating');
  if (ratingEl) {
    ratingEl.className = 'bt-header-value';
    if (snap.creditRating >= 700) ratingEl.classList.add('bt-value-good');
    else if (snap.creditRating < 500) ratingEl.classList.add('bt-value-bad');
  }
}

// ---------------------------------------------------------------------------
// 仪表盘渲染
// ---------------------------------------------------------------------------

function _renderDashboard(state) {
  const snap = Commerce.getCommerceSnapshot(state);
  const netWorth = Trade.getNetWorth(state);
  const activeShip = Fleet.getActiveShip(state);
  const cycle = Economy.getEconomyCycle(state);

  let html = '<div class="bt-dashboard">';

  // 核心指标卡片
  html += '<div class="bt-section-title">◈ 核心指标</div>';
  html += '<div class="bt-metrics-grid">';
  html += _metricCard('资产总值', netWorth.toLocaleString(), '💰', 'large');
  html += _metricCard('可用资金', state.credits.toLocaleString(), '💵');
  html += _metricCard('贷款余额', snap.totalLoans.toLocaleString(), '🏦', snap.totalLoans > 0 ? 'warning' : '');
  html += _metricCard('信用评级', snap.creditRating, '⭐', snap.creditRating >= 700 ? 'good' : snap.creditRating < 500 ? 'bad' : '');
  html += _metricCard('贸易站日收益', '+' + snap.stationDailyIncome.toLocaleString(), '🏪', 'good');
  html += _metricCard('股票组合', snap.stockPortfolioValue.toLocaleString(), '📈');
  html += _metricCard('期货盈亏', (snap.futuresUnrealizedPnl >= 0 ? '+' : '') + snap.futuresUnrealizedPnl.toLocaleString(), '📊', snap.futuresUnrealizedPnl >= 0 ? 'good' : 'bad');
  html += _metricCard('经济周期', cycle.label, '⚖️');
  html += '</div>';

  // 舰队概况
  html += '<div class="bt-section-title">◈ 舰队概况</div>';
  html += '<div class="bt-panel">';
  if (activeShip) {
    const cargoUsed = Fleet.getCargoUsed(activeShip);
    const cargoPercent = ((cargoUsed / activeShip.cargoCapacity) * 100).toFixed(0);
    const fuelPercent = ((activeShip.fuel / activeShip.fuelCapacity) * 100).toFixed(0);

    html += '<div class="bt-fleet-status">';
    html += `<div class="bt-fleet-stat"><span class="bt-fleet-label">当前舰船</span><span class="bt-fleet-value">${activeShip.name}</span></div>`;
    html += `<div class="bt-fleet-stat"><span class="bt-fleet-label">货舱使用</span><span class="bt-fleet-value">${cargoUsed}/${activeShip.cargoCapacity} (${cargoPercent}%)</span></div>`;
    html += `<div class="bt-fleet-stat"><span class="bt-fleet-label">燃料</span><span class="bt-fleet-value">${activeShip.fuel.toFixed(0)}/${activeShip.fuelCapacity} (${fuelPercent}%)</span></div>`;
    html += `<div class="bt-fleet-stat"><span class="bt-fleet-label">总舰船数</span><span class="bt-fleet-value">${state.fleet.length}</span></div>`;
    html += '</div>';
  }
  html += '</div>';

  // 快速操作
  html += '<div class="bt-section-title">◈ 快速操作</div>';
  html += '<div class="bt-quick-actions">';
  html += '<button class="bt-quick-btn" data-action="goto-market">🏪 市场交易</button>';
  html += '<button class="bt-quick-btn" data-action="goto-finance">🏦 金融服务</button>';
  html += '<button class="bt-quick-btn" data-action="goto-futures">📊 期货市场</button>';
  html += '<button class="bt-quick-btn" data-action="goto-stations">🏢 贸易站</button>';
  html += '<button class="bt-quick-btn" data-action="goto-fleet">🚢 舰队管理</button>';
  html += '</div>';

  html += '</div>';
  return html;
}

// ---------------------------------------------------------------------------
// 市场渲染
// ---------------------------------------------------------------------------

function _renderMarket(state) {
  let html = '<div class="bt-market">';
  html += '<div class="bt-section-title">◈ 商品市场</div>';

  const currentSystem = SYSTEMS.find(s => s.id === state.currentSystem);
  if (!currentSystem) {
    html += '<div class="bt-empty">未知星系</div></div>';
    return html;
  }

  html += `<div class="bt-panel"><div class="bt-panel-header">当前位置：${currentSystem.name}</div>`;

  // 公开市场
  html += '<div class="bt-subsection-title">公开市场</div>';
  html += '<table class="bt-table">';
  html += '<thead><tr><th>商品</th><th>买入价</th><th>卖出价</th><th>持有</th><th>操作</th></tr></thead>';
  html += '<tbody>';

  Object.values(GOODS).forEach(good => {
    if (good.legality === 'illegal') return; // 非法商品不在公开市场

    const buyPrice = Economy.getBuyPrice(state, good.id);
    const sellPrice = Economy.getSellPrice(state, good.id);
    const held = state.cargo[good.id] || 0;

    html += '<tr>';
    html += `<td>${good.emoji || ''} ${good.name}</td>`;
    html += `<td class="bt-price">${buyPrice.toLocaleString()}</td>`;
    html += `<td class="bt-price">${sellPrice.toLocaleString()}</td>`;
    html += `<td>${held}</td>`;
    html += `<td class="bt-actions">`;
    html += `<button class="bt-action-btn" data-action="buy" data-good="${good.id}" data-market="open">买入</button>`;
    if (held > 0) {
      html += `<button class="bt-action-btn" data-action="sell" data-good="${good.id}" data-market="open">卖出</button>`;
    }
    html += `</td></tr>`;
  });

  html += '</tbody></table>';

  // 黑市
  html += '<div class="bt-subsection-title">黑市交易</div>';
  html += '<table class="bt-table">';
  html += '<thead><tr><th>商品</th><th>买入价</th><th>卖出价</th><th>持有</th><th>操作</th></tr></thead>';
  html += '<tbody>';

  Object.values(GOODS).forEach(good => {
    if (good.legality === 'legal' && good.market !== 'black') return;

    const buyPrice = Economy.getBlackMarketBuyPrice(state, good.id);
    const sellPrice = Economy.getBlackMarketSellPrice(state, good.id);
    const held = state.cargo[good.id] || 0;

    html += '<tr>';
    html += `<td>${good.emoji || ''} ${good.name}</td>`;
    html += `<td class="bt-price bt-price-black">${buyPrice.toLocaleString()}</td>`;
    html += `<td class="bt-price bt-price-black">${sellPrice.toLocaleString()}</td>`;
    html += `<td>${held}</td>`;
    html += `<td class="bt-actions">`;
    html += `<button class="bt-action-btn bt-action-btn-danger" data-action="buy" data-good="${good.id}" data-market="black">买入</button>`;
    if (held > 0) {
      html += `<button class="bt-action-btn bt-action-btn-danger" data-action="sell" data-good="${good.id}" data-market="black">卖出</button>`;
    }
    html += `</td></tr>`;
  });

  html += '</tbody></table>';
  html += '</div>'; // panel
  html += '</div>'; // bt-market
  return html;
}

// ---------------------------------------------------------------------------
// 金融渲染
// ---------------------------------------------------------------------------

function _renderFinance(state) {
  let html = '<div class="bt-finance">';

  // 贷款
  html += '<div class="bt-section-title">◈ 银行贷款</div>';
  const loanOffers = Finance.getLoanOffers(state);
  const activeLoans = (state.loans || []).filter(l => l.status === 'active' && l.balance > 0);

  html += '<div class="bt-panel">';
  if (loanOffers.length > 0) {
    html += '<div class="bt-loan-offers">';
    loanOffers.forEach(offer => {
      const available = offer.available;
      html += `<div class="bt-loan-card ${!available ? 'bt-loan-card-disabled' : ''}">`;
      html += `<div class="bt-loan-name">${offer.name}</div>`;
      html += `<div class="bt-loan-amount">+${offer.principal.toLocaleString()}</div>`;
      html += `<div class="bt-loan-terms">期限: ${offer.termDays}天 | 利率: ${(offer.dailyInterestRate * 100).toFixed(2)}%/天</div>`;
      html += `<button class="bt-action-btn ${!available ? 'disabled' : ''}" data-action="take-loan" data-offer="${offer.id}" ${!available ? 'disabled' : ''}>申请贷款</button>`;
      html += `</div>`;
    });
    html += '</div>';
  }

  if (activeLoans.length > 0) {
    html += '<div class="bt-subsection-title">当前贷款</div>';
    activeLoans.forEach(loan => {
      html += `<div class="bt-loan-active">`;
      html += `<span class="bt-loan-name">${loan.name}</span>`;
      html += `<span>余额: ${Math.floor(loan.balance).toLocaleString()}</span>`;
      html += `<span>剩余: ${loan.remainingDays}天</span>`;
      html += `<span>日扣: ${Math.floor(loan.dailyPayment).toLocaleString()}</span>`;
      html += `<button class="bt-action-btn bt-action-btn-small" data-action="repay-loan" data-loan="${loan.id}">还款</button>`;
      html += `</div>`;
    });
  }
  html += '</div>';

  // 股票
  html += '<div class="bt-section-title">◈ 股票市场</div>';
  const stockListings = Finance.getStockListings(state);
  html += '<div class="bt-panel">';
  if (stockListings.length > 0) {
    html += '<table class="bt-table">';
    html += '<thead><tr><th>股票</th><th>股价</th><th>持仓</th><th>成本</th><th>盈亏</th><th>操作</th></tr></thead>';
    html += '<tbody>';
    stockListings.forEach(stock => {
      const pnl = (stock.price - (stock.avgCost || stock.price)) * stock.shares;
      const pnlClass = pnl >= 0 ? 'bt-value-good' : 'bt-value-bad';
      html += '<tr>';
      html += `<td>${stock.name}</td>`;
      html += `<td>${stock.price.toLocaleString()}</td>`;
      html += `<td>${stock.shares}</td>`;
      html += `<td>${Math.floor(stock.avgCost || 0).toLocaleString()}</td>`;
      html += `<td class="${pnlClass}">${pnl >= 0 ? '+' : ''}${Math.floor(pnl).toLocaleString()}</td>`;
      html += `<td class="bt-actions">`;
      html += `<button class="bt-action-btn bt-action-btn-small" data-action="buy-stock" data-stock="${stock.id}">买入</button>`;
      if (stock.shares > 0) {
        html += `<button class="bt-action-btn bt-action-btn-small" data-action="sell-stock" data-stock="${stock.id}">卖出</button>`;
      }
      html += `</td></tr>`;
    });
    html += '</tbody></table>';
  } else {
    html += '<div class="bt-empty">探索更多星球以解锁股票</div>';
  }
  html += '</div>';

  // 保险
  html += '<div class="bt-section-title">◈ 保险服务</div>';
  const insuranceProducts = Finance.getInsuranceProducts(state);
  html += '<div class="bt-panel">';
  html += '<div class="bt-insurance-grid">';
  insuranceProducts.forEach(product => {
    html += `<div class="bt-insurance-card ${product.active ? 'bt-insurance-active' : ''}">`;
    html += `<div class="bt-insurance-name">${product.name}</div>`;
    html += `<div class="bt-insurance-coverage">保额: ${Math.floor(product.coverage).toLocaleString()}</div>`;
    html += `<div class="bt-insurance-premium">保费: ${Math.floor(product.premium).toLocaleString()}</div>`;
    html += `<div class="bt-insurance-deductible">免赔: ${Math.round(product.deductibleRate * 100)}%</div>`;
    if (!product.active) {
      html += `<button class="bt-action-btn bt-action-btn-small" data-action="buy-insurance" data-policy="${product.id}">投保</button>`;
    } else {
      html += `<div class="bt-insurance-status">已生效</div>`;
      if (product.claimableAmount > 0) {
        html += `<button class="bt-action-btn bt-action-btn-small" data-action="claim-insurance" data-policy="${product.id}">理赔</button>`;
      }
    }
    html += `</div>`;
  });
  html += '</div>';
  html += '</div>';

  html += '</div>';
  return html;
}

// ---------------------------------------------------------------------------
// 期货渲染
// ---------------------------------------------------------------------------

function _renderFutures(state) {
  let html = '<div class="bt-futures">';
  html += '<div class="bt-section-title">◈ 期货市场</div>';
  html += '<div class="bt-panel">';
  html += `<div class="bt-panel-hint">期货合约允许您锁定商品价格，${Futures.DEFAULT_TERM_DAYS}天后按市价结算。做多预测涨价，做空预测跌价。</div>`;

  const listings = Futures.getFuturesListings(state);
  html += '<table class="bt-table">';
  html += '<thead><tr><th>商品</th><th>当前价</th><th>合约规模</th><th>保证金</th><th>持多</th><th>持空</th><th>操作</th></tr></thead>';
  html += '<tbody>';

  listings.forEach(listing => {
    html += '<tr>';
    html += `<td>${listing.emoji || ''} ${listing.name}</td>`;
    html += `<td class="bt-price">${listing.currentPrice.toLocaleString()}</td>`;
    html += `<td>${listing.contractUnit}</td>`;
    html += `<td>${listing.margin.toLocaleString()}</td>`;
    html += `<td>${listing.heldLong}</td>`;
    html += `<td>${listing.heldShort}</td>`;
    html += `<td class="bt-actions">`;
    html += `<button class="bt-action-btn bt-action-btn-small" data-action="futures-long" data-good="${listing.goodId}">做多</button>`;
    html += `<button class="bt-action-btn bt-action-btn-small" data-action="futures-short" data-good="${listing.goodId}">做空</button>`;
    html += `</td></tr>`;
  });

  html += '</tbody></table>';

  // 持仓合约
  const openContracts = Futures.getOpenContracts(state);
  if (openContracts.length > 0) {
    html += '<div class="bt-subsection-title">持仓合约</div>';
    html += '<table class="bt-table">';
    html += '<thead><tr><th>商品</th><th>方向</th><th>锁定价</th><th>当前价</th><th>剩余天数</th><th>未实现盈亏</th><th>操作</th></tr></thead>';
    html += '<tbody>';
    openContracts.forEach(c => {
      const pnlClass = c.unrealizedPnl >= 0 ? 'bt-value-good' : 'bt-value-bad';
      html += '<tr>';
      html += `<td>${c.goodName}</td>`;
      html += `<td>${c.direction === 'long' ? '做多 📈' : '做空 📉'}</td>`;
      html += `<td>${c.lockedPrice.toLocaleString()}</td>`;
      html += `<td>${c.currentPrice.toLocaleString()}</td>`;
      html += `<td>${c.daysLeft}</td>`;
      html += `<td class="${pnlClass}">${c.unrealizedPnl >= 0 ? '+' : ''}${c.unrealizedPnl.toLocaleString()}</td>`;
      html += `<td class="bt-actions">`;
      html += `<button class="bt-action-btn bt-action-btn-small" data-action="futures-close" data-contract="${c.id}">平仓</button>`;
      html += `</td></tr>`;
    });
    html += '</tbody></table>';
  }

  html += '</div>';
  html += '</div>';
  return html;
}

// ---------------------------------------------------------------------------
// 贸易站渲染
// ---------------------------------------------------------------------------

function _renderStations(state) {
  let html = '<div class="bt-stations">';
  html += '<div class="bt-section-title">◈ 贸易站网络</div>';

  const summary = Station.getSummary(state);
  const ownedStations = Station.getOwnedStations(state);
  const buildCandidates = Station.getBuildCandidates(state);

  // 概况
  html += '<div class="bt-panel">';
  html += '<div class="bt-metrics-grid">';
  html += _metricCard('已建站点', summary.count, '🏪');
  html += _metricCard('预计日收益', '+' + Math.floor(summary.projectedIncome).toLocaleString(), '💰', 'good');
  html += _metricCard('累计收益', Math.floor(summary.totalIncome).toLocaleString(), '📊');
  html += _metricCard('配置管理员', `${summary.managedCount}/${summary.count}`, '👔');
  html += '</div>';
  html += '</div>';

  // 已建站点
  if (ownedStations.length > 0) {
    html += '<div class="bt-subsection-title">已建站点</div>';
    ownedStations.forEach(entry => {
      const station = entry.station;
      html += '<div class="bt-station-card">';
      html += `<div class="bt-station-header">`;
      html += `<span class="bt-station-name">${entry.system.name} 贸易站</span>`;
      html += `<span class="bt-station-level">Lv.${station.level} · ${entry.levelConfig.name}</span>`;
      html += `</div>`;
      html += `<div class="bt-station-income">`;
      html += `<span>预计日收益: <strong>+${Math.floor(entry.projectedIncome).toLocaleString()}</strong></span>`;
      html += `<span>上日: +${Math.floor(station.lastIncome || 0).toLocaleString()}</span>`;
      html += `<span>累计: ${Math.floor(station.totalIncome || 0).toLocaleString()}</span>`;
      html += `</div>`;
      html += `<div class="bt-station-meta">`;
      html += `管理员: ${entry.manager ? entry.manager.name : '未雇佣'} | `;
      html += `策略: ${entry.strategy.name}`;
      html += `</div>`;
      html += `<div class="bt-station-actions">`;
      if (entry.nextLevel) {
        html += `<button class="bt-action-btn bt-action-btn-small" data-action="upgrade-station" data-system="${station.systemId}">升级 (${entry.nextUpgradeCost.toLocaleString()})</button>`;
      }
      html += `</div>`;

      // 管理员选择
      html += `<div class="bt-station-managers">`;
      TRADE_STATION_MANAGERS.forEach(mgr => {
        const active = station.managerId === mgr.id ? ' active' : '';
        html += `<button class="bt-choice-btn${active}" data-action="hire-manager" data-system="${station.systemId}" data-manager="${mgr.id}">${mgr.name} (${mgr.hireCost})</button>`;
      });
      html += `</div>`;

      // 策略选择
      html += `<div class="bt-station-strategies">`;
      TRADE_STATION_STRATEGIES.forEach(strat => {
        const active = station.strategyId === strat.id ? ' active' : '';
        html += `<button class="bt-choice-btn${active}" data-action="set-strategy" data-system="${station.systemId}" data-strategy="${strat.id}">${strat.name}</button>`;
      });
      html += `</div>`;

      html += '</div>';
    });
  }

  // 建站候选
  if (buildCandidates.length > 0) {
    html += '<div class="bt-subsection-title">建站候选</div>';
    html += '<div class="bt-candidates-grid">';
    buildCandidates.forEach(candidate => {
      html += `<div class="bt-candidate-card">`;
      html += `<div class="bt-candidate-name">${candidate.system.name}</div>`;
      html += `<div class="bt-candidate-type">${candidate.system.typeLabel}</div>`;
      html += `<div class="bt-candidate-desc">${candidate.system.description}</div>`;
      html += `<div class="bt-candidate-depth">市场深度: ${candidate.system.marketDepth || 200}</div>`;
      html += `<button class="bt-action-btn ${!candidate.canAfford ? 'disabled' : ''}" data-action="build-station" data-system="${candidate.system.id}" ${!candidate.canAfford ? 'disabled' : ''}>建造 (${candidate.buildCost.toLocaleString()})</button>`;
      html += `</div>`;
    });
    html += '</div>';
  }

  html += '</div>';
  return html;
}

// ---------------------------------------------------------------------------
// 舰队渲染
// ---------------------------------------------------------------------------

function _renderFleet(state) {
  let html = '<div class="bt-fleet">';
  html += '<div class="bt-section-title">◈ 舰队管理</div>';

  const fleet = state.fleet || [];
  const activeShip = Fleet.getActiveShip(state);

  html += '<div class="bt-panel">';
  fleet.forEach((ship, idx) => {
    const isActive = idx === state.activeShipIndex;
    const cargoUsed = Fleet.getCargoUsed(ship);
    const cargoPercent = ((cargoUsed / ship.cargoCapacity) * 100).toFixed(0);
    const fuelPercent = ((ship.fuel / ship.fuelCapacity) * 100).toFixed(0);

    html += `<div class="bt-ship-card ${isActive ? 'bt-ship-active' : ''}">`;
    html += `<div class="bt-ship-header">`;
    html += `<span class="bt-ship-name">${ship.name}</span>`;
    html += `<span class="bt-ship-type">${ship.type}</span>`;
    if (isActive) html += `<span class="bt-ship-badge">当前</span>`;
    html += `</div>`;
    html += `<div class="bt-ship-stats">`;
    html += `<div class="bt-ship-stat"><span>货舱</span><span>${cargoUsed}/${ship.cargoCapacity} (${cargoPercent}%)</span></div>`;
    html += `<div class="bt-ship-stat"><span>燃料</span><span>${ship.fuel.toFixed(0)}/${ship.fuelCapacity} (${fuelPercent}%)</span></div>`;
    html += `<div class="bt-ship-stat"><span>航速</span><span>${ship.speed}</span></div>`;
    html += `</div>`;
    if (!isActive) {
      html += `<button class="bt-action-btn bt-action-btn-small" data-action="switch-ship" data-ship="${idx}">切换</button>`;
    }
    html += `</div>`;
  });
  html += '</div>';

  html += '</div>';
  return html;
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

function _metricCard(label, value, icon = '', variant = '') {
  let className = 'bt-metric-card';
  if (variant === 'large') className += ' bt-metric-large';
  if (variant === 'good') className += ' bt-metric-good';
  if (variant === 'bad') className += ' bt-metric-bad';
  if (variant === 'warning') className += ' bt-metric-warning';

  return `<div class="${className}">
    <div class="bt-metric-icon">${icon}</div>
    <div class="bt-metric-content">
      <div class="bt-metric-label">${label}</div>
      <div class="bt-metric-value">${value}</div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// 事件监听
// ---------------------------------------------------------------------------

function _setupEventListeners() {
  // 标签页切换
  document.addEventListener('click', e => {
    if (e.target.matches('[data-tab-target]')) {
      _currentTab = e.target.dataset.tabTarget;
      _updateTabButtons();
      render(_state);
    }
  });

  // 关闭按钮
  const closeBtn = document.getElementById('business-terminal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => hide());
  }
}

function _updateTabButtons() {
  document.querySelectorAll('[data-tab-target]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tabTarget === _currentTab);
  });
}

function _bindActionButtons(container) {
  // 快速导航
  container.querySelectorAll('[data-action^="goto-"]').forEach(btn => {
    btn.addEventListener('click', () => {
      _currentTab = btn.dataset.action.replace('goto-', '');
      _updateTabButtons();
      render(_state);
    });
  });

  // 市场操作
  container.querySelectorAll('[data-action="buy"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_callbacks.onOpenBuy) {
        _callbacks.onOpenBuy(btn.dataset.good, btn.dataset.market);
      }
    });
  });

  container.querySelectorAll('[data-action="sell"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_callbacks.onOpenSell) {
        _callbacks.onOpenSell(btn.dataset.good, btn.dataset.market);
      }
    });
  });

  // 贷款操作
  container.querySelectorAll('[data-action="take-loan"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_callbacks.onTakeLoan) _callbacks.onTakeLoan(btn.dataset.offer);
    });
  });

  container.querySelectorAll('[data-action="repay-loan"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_callbacks.onRepayLoan) _callbacks.onRepayLoan(btn.dataset.loan);
    });
  });

  // 股票操作
  container.querySelectorAll('[data-action="buy-stock"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_callbacks.onBuyStock) _callbacks.onBuyStock(btn.dataset.stock);
    });
  });

  container.querySelectorAll('[data-action="sell-stock"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_callbacks.onSellStock) _callbacks.onSellStock(btn.dataset.stock);
    });
  });

  // 保险操作
  container.querySelectorAll('[data-action="buy-insurance"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_callbacks.onPurchaseInsurance) _callbacks.onPurchaseInsurance(btn.dataset.policy);
    });
  });

  container.querySelectorAll('[data-action="claim-insurance"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_callbacks.onSubmitInsuranceClaim) _callbacks.onSubmitInsuranceClaim(btn.dataset.policy);
    });
  });

  // 期货操作
  container.querySelectorAll('[data-action="futures-long"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_callbacks.onFuturesLong) _callbacks.onFuturesLong(btn.dataset.good);
    });
  });

  container.querySelectorAll('[data-action="futures-short"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_callbacks.onFuturesShort) _callbacks.onFuturesShort(btn.dataset.good);
    });
  });

  container.querySelectorAll('[data-action="futures-close"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_callbacks.onFuturesClose) _callbacks.onFuturesClose(btn.dataset.contract);
    });
  });

  // 贸易站操作
  container.querySelectorAll('[data-action="build-station"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_callbacks.onBuildStation) _callbacks.onBuildStation(btn.dataset.system);
    });
  });

  container.querySelectorAll('[data-action="upgrade-station"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_callbacks.onUpgradeStation) _callbacks.onUpgradeStation(btn.dataset.system);
    });
  });

  container.querySelectorAll('[data-action="hire-manager"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_callbacks.onHireManager) _callbacks.onHireManager(btn.dataset.system, btn.dataset.manager);
    });
  });

  container.querySelectorAll('[data-action="set-strategy"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_callbacks.onSetStrategy) _callbacks.onSetStrategy(btn.dataset.system, btn.dataset.strategy);
    });
  });

  // 舰队操作
  container.querySelectorAll('[data-action="switch-ship"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_callbacks.onSwitchShip) _callbacks.onSwitchShip(parseInt(btn.dataset.ship));
    });
  });
}
