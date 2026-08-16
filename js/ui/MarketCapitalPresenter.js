// js/ui/MarketCapitalPresenter.js — 市场资金工作区的无状态视图投影
// 资金页拥有现金结构与经营贷款；站点投资动作归贸易站工作区所有。

import { findSystem as findSystemDefault } from '../data/systems.js';
import * as Commerce from '../systems/commerce/CommerceFacade.js';
import * as Finance from '../systems/finance/FinanceSystem.js';

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _escapeHtmlAttr(value) {
  return _escapeHtml(value).replace(/`/g, '&#96;');
}

function _getDomId(prefix, value) {
  var safeId = String(value || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-');
  return prefix + '-' + safeId;
}

function _renderDeckMetric(label, value, note, toneClass) {
  return '<div class="market-workspace-deck-metric' + (toneClass ? ' ' + toneClass : '') + '">' +
    '<span>' + _escapeHtml(label) + '</span>' +
    '<strong>' + _escapeHtml(value) + '</strong>' +
    '<small>' + _escapeHtml(note) + '</small>' +
  '</div>';
}

function _renderLoanMetric(label, value, note, toneClass) {
  return '<div class="market-capital-local-item' + (toneClass ? ' ' + toneClass : '') + '" role="listitem">' +
    '<span class="market-capital-local-label">' + _escapeHtml(label) + '</span>' +
    '<strong class="market-capital-local-value">' + _escapeHtml(value) + '</strong>' +
    '<span class="market-capital-local-note">' + _escapeHtml(note) + '</span>' +
  '</div>';
}

export function buildMarketCapitalModel(request) {
  var input = request || {};
  var state = input.state || {};
  var finance = input.finance || Finance;
  var commerce = input.commerce || Commerce;
  var findSystem = input.findSystem || findSystemDefault;
  var financeOverview = input.financeOverview || finance.getOverview(state);
  var commerceSnapshot = input.commerceSnapshot || commerce.getCommerceSnapshot(state);
  var loanOffers = Array.isArray(input.loanOffers)
    ? input.loanOffers.slice(0, 3)
    : finance.getLoanOffers(state).slice(0, 3);
  var activeLoans = Array.isArray(input.activeLoans)
    ? input.activeLoans.slice()
    : (state.loans || []).filter(function (loan) {
        return loan && loan.status === 'active' && loan.balance > 0;
      });
  var system = findSystem(input.systemId);
  var credits = Math.floor(Number(state.credits) || 0);
  var loanBalance = activeLoans.reduce(function (sum, loan) {
    return sum + Math.max(0, Number(loan.balance) || 0);
  }, 0);
  var dailyPayment = activeLoans.reduce(function (sum, loan) {
    return sum + Math.max(0, Number(loan.dailyPayment) || 0);
  }, 0);
  var runwayDays = dailyPayment > 0 ? Math.floor(credits / dailyPayment) : null;

  return {
    state: state,
    systemId: input.systemId,
    systemLabel: system ? (system.name + ' · ' + system.typeLabel) : input.systemId,
    isCurrentSystem: !!input.isCurrentSystem,
    credits: credits,
    investmentValue: Math.floor(Number(financeOverview.tradeInvestmentValue) || 0),
    overviewLoanBalance: Math.floor(Number(financeOverview.outstandingLoanBalance) || 0),
    activeLoanCount: Math.max(0, Number(financeOverview.activeLoanCount) || activeLoans.length),
    creditRating: Number(commerceSnapshot.creditRating || financeOverview.creditRating) || 0,
    activeLoans: activeLoans,
    loanOffers: loanOffers,
    loanBalance: loanBalance,
    dailyPayment: dailyPayment,
    runwayDays: runwayDays,
    availableOfferCount: loanOffers.filter(function (offer) { return !!offer.available; }).length,
  };
}

function _renderCapitalOverview(model) {
  return '<section class="market-workspace-deck market-capital-deck">' +
    '<div class="market-workspace-deck-hero">' +
      '<div class="market-workspace-deck-copy">' +
        '<div class="market-workspace-deck-kicker">Capital Control</div>' +
        '<div class="market-workspace-deck-title">资金管理 · ' + (model.isCurrentSystem ? '本地可操作' : '远程查看') + '</div>' +
        '<div class="market-workspace-deck-summary">资金页集中查看现金、贷款与站点投资总额；具体建站和追加投资统一在贸易站页处理。</div>' +
      '</div>' +
      '<div class="market-workspace-deck-emphasis">' +
        '<span class="market-workspace-deck-emphasis-label">当前地点</span>' +
        '<strong>' + _escapeHtml(model.systemLabel) + '</strong>' +
        '<span class="market-workspace-deck-emphasis-note">' + (model.isCurrentSystem ? '可申请或偿还经营贷款。' : '抵达后开放本地贷款办理。') + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="market-workspace-deck-grid">' +
      _renderDeckMetric('可用现金', model.credits.toLocaleString(), '用于补给、舰队与商网扩张。', 'tone-cool') +
      _renderDeckMetric('未还贷款', model.overviewLoanBalance.toLocaleString(), model.activeLoanCount + ' 笔未结清贷款。', model.overviewLoanBalance > 0 ? 'tone-warm' : '') +
      _renderDeckMetric('站点投资', model.investmentValue.toLocaleString(), '只读汇总；具体操作归贸易站页。', model.investmentValue > 0 ? 'tone-cool' : '') +
      _renderDeckMetric('信用分', String(model.creditRating), '分数越高，可申请的贷款越多。') +
    '</div>' +
  '</section>';
}

function _renderLoanGuard(model) {
  var debtPressure = model.loanBalance > model.credits && model.loanBalance > 0;
  var focusTitle = !model.isCurrentSystem
    ? '远程只读观察'
    : (debtPressure ? '债务现金流承压' : '经营贷款可控');
  var focusNote = !model.isCurrentSystem
    ? '抵达该地点后才能申请或偿还经营贷款。'
    : (model.loanBalance > 0
        ? ('贷款余额 ' + Math.floor(model.loanBalance).toLocaleString() + '，每日偿付 ' + Math.floor(model.dailyPayment).toLocaleString() + '。')
        : '当前没有贷款，可按扩张需要选择周转额度。');

  return '<section class="market-capital-local-panel" aria-label="经营贷款状态">' +
    '<div class="market-capital-local-head"><div><div class="market-capital-local-title">经营贷款</div>' +
      '<div class="market-capital-local-subtitle">贷款用于跨越扩张资金缺口；证券和手动保险不属于这个工作区。</div></div>' +
      '<span class="market-capital-local-badge">' + (model.isCurrentSystem ? '本地可执行' : '远程只读') + '</span></div>' +
    '<div class="market-capital-local-grid" role="list" aria-label="经营贷款指标">' +
      _renderLoanMetric('贷款余额', Math.floor(model.loanBalance).toLocaleString(), model.activeLoans.length + ' 笔未结清') +
      _renderLoanMetric('每日偿付', Math.floor(model.dailyPayment).toLocaleString(), model.runwayDays === null ? '没有固定扣款' : ('现金约覆盖 ' + model.runwayDays + ' 天')) +
      _renderLoanMetric('可用现金', model.credits.toLocaleString(), '扩张前保留偿付余量') +
      _renderLoanMetric('可用报价', String(model.availableOfferCount), '按公司信用评级调整额度') +
    '</div>' +
    '<div class="market-capital-local-focus" data-tone="' + (debtPressure ? 'debt' : 'stable') + '">' +
      '<span class="market-capital-local-focus-kicker">资金状态</span><strong class="market-capital-local-focus-title">' + focusTitle + '</strong>' +
      '<span class="market-capital-local-focus-note">' + focusNote + '</span></div>' +
  '</section>';
}

function _renderLoanActions(model) {
  if (!model.isCurrentSystem) {
    return '<div class="market-finance-locked">📡 当前是远程查看模式。抵达该地点后，可在这里申请或偿还经营贷款。</div>';
  }

  return '<div class="market-finance-layout"><div class="market-finance-column">' +
    '<div class="market-finance-subsection">🏦 贷款席位</div>' +
    (model.activeLoans.length > 0
      ? '<div class="market-finance-action-list" role="list" aria-label="未结清贷款列表">' + model.activeLoans.map(function (loan) {
          var loanKey = loan.id || loan.name;
          var loanTitleId = _getDomId('market-loan-title', loanKey);
          var loanMetaId = _getDomId('market-loan-meta', loanKey);
          return '<article class="market-finance-action-row" role="listitem" tabindex="0" aria-labelledby="' + _escapeHtmlAttr(loanTitleId) + '" aria-describedby="' + _escapeHtmlAttr(loanMetaId) + '">' +
            '<div class="market-finance-action-main"><div id="' + _escapeHtmlAttr(loanTitleId) + '" class="market-finance-action-title">' + _escapeHtml(loan.name) + '</div>' +
            '<div id="' + _escapeHtmlAttr(loanMetaId) + '" class="market-finance-action-meta">余额 ' + Math.floor(loan.balance).toLocaleString() + ' · 日扣款 ' + Math.floor(loan.dailyPayment).toLocaleString() + ' · 剩余 ' + loan.remainingDays + ' 天</div></div>' +
            '<div class="market-finance-inline-actions" role="group" aria-label="' + _escapeHtmlAttr(loan.name + ' 贷款操作') + '"><button class="btn-action market-finance-btn" data-action="market-repay-loan" data-loan-id="' + _escapeHtmlAttr(loan.id) + '" aria-describedby="' + _escapeHtmlAttr(loanMetaId) + '" aria-label="' + _escapeHtmlAttr('偿还 ' + loan.name) + '">还款</button></div>' +
          '</article>';
        }).join('') + '</div>'
      : '<div class="market-finance-empty">暂无未结清贷款。</div>') +
    (model.loanOffers.length > 0
      ? '<div class="trade-station-choice-row market-finance-offer-row" role="group" aria-label="贷款报价选择">' + model.loanOffers.map(function (offer) {
          return '<button class="trade-station-choice-btn' + (offer.available ? '' : ' disabled') + '" data-action="market-take-loan" data-loan-offer-id="' + _escapeHtmlAttr(offer.id) + '" aria-label="' + _escapeHtmlAttr('申请 ' + offer.name + '，到账 ' + offer.principal.toLocaleString() + '，期限 ' + offer.termDays + ' 天') + '"' + (offer.available ? '' : ' disabled aria-disabled="true"') + '>' + _escapeHtml(offer.name) + '<span>+' + offer.principal.toLocaleString() + ' / ' + offer.termDays + '天</span></button>';
        }).join('') + '</div>'
      : '') +
  '</div></div>';
}

function _renderCapitalLocal(model) {
  return '<section class="market-finance-section">' +
    '<div class="market-finance-section-head"><div><div class="market-finance-title">🏦 本地贷款管理</div>' +
      '<div class="market-finance-subtitle">贷款申请和偿还只在停靠地点办理；站点投资操作归入贸易站页。</div></div></div>' +
    _renderLoanGuard(model) +
    _renderLoanActions(model) +
  '</section>';
}

export function renderMarketCapitalWorkspace(request) {
  var model = buildMarketCapitalModel(request);
  return {
    model: model,
    overviewHtml: _renderCapitalOverview(model),
    localHtml: _renderCapitalLocal(model),
  };
}
