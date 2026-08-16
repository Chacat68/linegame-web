// js/ui/FleetDispatchPresenter.js — 自动跑商路线评估、策略验证与呈现模型

import { GOODS } from '../data/goods.js';
import { GALAXIES, SYSTEMS } from '../data/systems.js';
import * as Economy from '../systems/economy/Economy.js';
import * as AutoTrade from '../systems/trade/AutoTradeSystem.js';
import * as Faction from '../systems/faction/FactionSystem.js';

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function hasCustomFleetDispatchPolicy(policy) {
  if (!policy || typeof policy !== 'object') return false;
  return Number.isFinite(policy.maxBuyPrice)
    || Number.isFinite(policy.minSellPrice)
    || Number.isFinite(policy.minProfitRate)
    || (policy.riskMode && policy.riskMode !== 'balanced')
    || (policy.marketMode && policy.marketMode !== 'open');
}

export function formatFleetDispatchRiskMode(riskMode) {
  if (riskMode === 'safe') return '保守';
  if (riskMode === 'aggressive') return '激进';
  return '平衡';
}

export function formatFleetDispatchMarketMode(marketMode) {
  return marketMode === 'black' ? '黑市' : '公开市场';
}

function _formatRouteRisk(level) {
  if (level === 'high') return '高';
  if (level === 'medium') return '中';
  return '低';
}

function _formatEnforcement(level) {
  if (level === 'high') return '高执法区';
  if (level === 'medium') return '中执法区';
  return '低执法区';
}

function _findSystem(systemId) {
  return SYSTEMS.find(function (system) { return system.id === systemId; });
}

function _findGood(goodId) {
  return GOODS.find(function (good) { return good.id === goodId; });
}

export function parseFleetDispatchPolicy(values) {
  var input = values || {};
  var maxBuyPrice = parseFloat(input.maxBuyPrice);
  var minSellPrice = parseFloat(input.minSellPrice);
  var minProfitRatePercent = parseFloat(input.minProfitRatePercent);
  return Object.freeze({
    maxBuyPrice: Number.isFinite(maxBuyPrice) ? maxBuyPrice : null,
    minSellPrice: Number.isFinite(minSellPrice) ? minSellPrice : null,
    minProfitRate: Number.isFinite(minProfitRatePercent) ? minProfitRatePercent / 100 : null,
    riskMode: input.riskMode || 'balanced',
    marketMode: input.marketMode || 'open',
  });
}

export function validateFleetDispatchPolicy(values) {
  var input = values || {};
  var fields = [
    { key: 'maxBuyPrice', label: '最高买入价' },
    { key: 'minSellPrice', label: '最低卖出价' },
    { key: 'minProfitRatePercent', label: '最低利润率' },
  ];
  var errors = [];
  var thresholdCount = 0;
  var fieldValidity = Object.create(null);
  fields.forEach(function (field) {
    var raw = String(input[field.key] == null ? '' : input[field.key]).trim();
    var numeric = raw === '' ? null : Number(raw);
    var valid = raw === '' || (Number.isFinite(numeric) && numeric >= 0);
    if (raw !== '') thresholdCount += 1;
    if (!valid) errors.push(field.label + '需填写 0 或更大的数字');
    fieldValidity[field.key] = valid;
  });
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    thresholdCount: thresholdCount,
    fieldValidity: Object.freeze(fieldValidity),
  });
}

export function buildFleetDispatchPolicyStatus(validation) {
  var result = validation || { valid: true, errors: [], thresholdCount: 0 };
  var active = result.valid && result.thresholdCount > 0;
  return Object.freeze({
    state: result.valid ? (active ? 'active' : 'neutral') : 'invalid',
    className: 'dispatch-policy-status' + (result.valid ? (active ? ' dispatch-policy-status--active' : '') : ' dispatch-policy-status--error'),
    text: result.valid
      ? (active ? '已启用 ' + result.thresholdCount + ' 项价格限制；留空字段不限制。' : '价格与利润均未设置额外限制。')
      : result.errors.join('；') + '。',
  });
}

export function buildFleetDispatchEstimate(context, selection) {
  var ctx = context || {};
  var state = ctx.state;
  var ship = ctx.ship;
  var stats = ctx.effectiveShipStats;
  var route = selection || {};
  if (!state || !ship || !stats || !route.buySystemId || !route.sellSystemId || !route.goodId) return null;
  var policy = route.tradePolicy || parseFleetDispatchPolicy({});
  var black = policy.marketMode === 'black';
  var good = _findGood(route.goodId);
  var buyPrice = black
    ? Economy.getBlackMarketBuyPrice(route.buySystemId, route.goodId, state)
    : Economy.getBuyPrice(route.buySystemId, route.goodId, state);
  var sellPrice = black && Faction.canAccessBlackMarket(state, route.sellSystemId) && AutoTrade.isGoodAllowedInMarket(good, 'black')
    ? Economy.getBlackMarketSellPrice(route.sellSystemId, route.goodId, state)
    : Economy.getSellPrice(route.sellSystemId, route.goodId, state);
  var cargoUsed = Object.values(ship.cargo || {}).reduce(function (sum, quantity) { return sum + quantity; }, 0);
  var cargoSpace = stats.maxCargo - cargoUsed;
  var maxQty = Math.min(cargoSpace, Math.floor(state.credits / buyPrice));
  var selectedCargoQty = Number(ship.cargo && ship.cargo[route.goodId]) || 0;
  var deliveryOnly = maxQty <= 0 && selectedCargoQty > 0;
  var currentSystem = ctx.currentLocationSystemId || state.currentSystem;
  var travelToBuyFuel = currentSystem === route.buySystemId ? 0 : Economy.getFuelCost(currentSystem, route.buySystemId, stats.fuelEff, state);
  var travelToSellFuel = route.buySystemId === route.sellSystemId ? 0 : Economy.getFuelCost(route.buySystemId, route.sellSystemId, stats.fuelEff, state);
  var fuelCost = travelToBuyFuel + travelToSellFuel;
  var fuelUnitPrice = Economy.getBuyPrice(currentSystem, 'fuel', state);
  var profit = deliveryOnly
    ? sellPrice * selectedCargoQty - fuelCost * fuelUnitPrice
    : (sellPrice - buyPrice) * maxQty - fuelCost * fuelUnitPrice;
  var dispatchProfile = stats.dispatchProfile || null;
  return Object.freeze({
    buyId: route.buySystemId,
    sellId: route.sellSystemId,
    goodId: route.goodId,
    buyPrice: buyPrice,
    sellPrice: sellPrice,
    maxQty: maxQty,
    cargoSpace: cargoSpace,
    selectedCargoQty: selectedCargoQty,
    deliveryOnly: deliveryOnly,
    fuelCost: fuelCost,
    profit: profit,
    profitRate: deliveryOnly ? null : (buyPrice > 0 ? (sellPrice - buyPrice) / buyPrice : 0),
    tradePolicy: policy,
    routeRisk: AutoTrade.assessTradeRisk(good, route.buySystemId, route.sellSystemId, policy.marketMode),
    inspectionRisk: AutoTrade.estimateDispatchInspectionRisk(state, good, maxQty, route.sellSystemId, policy.marketMode, {
      checkChanceMultiplier: dispatchProfile && dispatchProfile.inspectionRiskMultiplier,
    }),
    dispatchProfile: dispatchProfile,
  });
}

export function getFleetDispatchReadiness(context, estimate) {
  var ctx = context || {};
  if (!estimate) return Object.freeze({ ok: false, code: 'no_route', buttonLabel: '暂不可启动', reason: '当前设置无法组成可执行路线。' });
  var currentShip = ctx.state && ctx.state.fleet ? (ctx.state.fleet[ctx.shipIndex] || ctx.ship) : ctx.ship;
  if (currentShip && Number(currentShip.maintenance) < 15) {
    return Object.freeze({ ok: false, code: 'maintenance', buttonLabel: '需先保养', reason: '当前飞船维护度低于 15%，先在舰船管理中完成保养，再开始自动跑商。' });
  }
  if (estimate.buyId === estimate.sellId) {
    return Object.freeze({ ok: false, code: 'same_system', buttonLabel: '路线无效', reason: '买入地和卖出地不能相同，请选择一个有明确价差的卖出地。' });
  }
  if (estimate.maxQty <= 0 && estimate.selectedCargoQty <= 0) {
    var good = _findGood(estimate.goodId);
    if (estimate.cargoSpace <= 0) {
      return Object.freeze({ ok: false, code: 'cargo_full', buttonLabel: '货舱已满', reason: '当前货舱没有可用空间，先出售或转移库存，再开始新的自动跑商路线。' });
    }
    return Object.freeze({
      ok: false,
      code: 'insufficient_credits',
      buttonLabel: '积分不足',
      reason: '启动资金不足：买入 1 单位' + (good ? '「' + good.name + '」' : '商品') + '至少需要 ' + Math.ceil(estimate.buyPrice).toLocaleString() + ' 积分，当前只有 ' + Math.max(0, Math.floor(Number(ctx.state && ctx.state.credits) || 0)).toLocaleString() + '。先完成委托或出售库存筹措资金。',
    });
  }
  if (!estimate.deliveryOnly && estimate.profitRate <= 0) {
    return Object.freeze({ ok: false, code: 'no_margin', buttonLabel: '路线无价差', reason: '当前卖价不高于买价，这条路线不会形成贸易收益。请更换买入地、卖出地或商品。' });
  }
  if (estimate.profit <= 0) {
    return Object.freeze({ ok: false, code: 'no_profit', buttonLabel: '路线会亏损', reason: '扣除航程燃料后，当前路线预计单次亏损 ' + Math.ceil(Math.abs(estimate.profit)).toLocaleString() + ' 积分。请改用净收益为正的路线。' });
  }
  return Object.freeze({ ok: true, code: 'ready', buttonLabel: '开始跑商', reason: '' });
}

export function buildFleetDispatchWarnings(state, estimate) {
  if (!estimate) return Object.freeze([]);
  var warnings = [];
  var policy = estimate.tradePolicy;
  if (Number.isFinite(policy.maxBuyPrice) && estimate.buyPrice > policy.maxBuyPrice) warnings.push('买入价高于上限');
  if (Number.isFinite(policy.minSellPrice) && estimate.sellPrice < policy.minSellPrice) warnings.push('卖出价低于下限');
  if (!estimate.deliveryOnly && Number.isFinite(policy.minProfitRate) && estimate.profitRate < policy.minProfitRate) warnings.push('利润率低于要求');
  if (policy.riskMode === 'safe' && estimate.routeRisk.riskLevel !== 'low') warnings.push('谨慎模式会避开这条路线');
  if (policy.marketMode === 'black' && !Faction.canAccessBlackMarket(state, estimate.buyId)) warnings.push('黑市买入权限不足');
  return Object.freeze(warnings);
}

function _buildRiskSummary(estimate) {
  var routeRisk = estimate.routeRisk || { riskLevel: 'low', buyEnforcement: 'low', sellEnforcement: 'low' };
  var inspection = estimate.inspectionRisk || { hasContraband: false, protectedByBlackMarket: false, checkChancePercent: 0, contrabandGoods: [] };
  var highEnforcementParts = [];
  if (routeRisk.buyEnforcement === 'high') highEnforcementParts.push('买入地');
  if (routeRisk.sellEnforcement === 'high') highEnforcementParts.push('卖出地');
  return {
    highEnforcementParts: highEnforcementParts,
    buyEnforcementLabel: _formatEnforcement(routeRisk.buyEnforcement),
    sellEnforcementLabel: _formatEnforcement(routeRisk.sellEnforcement),
    contrabandLabel: inspection.hasContraband ? inspection.contrabandGoods.join('、') : '无',
    riskLabel: inspection.protectedByBlackMarket ? '0%（辛迪加庇护）' : inspection.checkChancePercent + '%',
    isHighEnforcement: highEnforcementParts.length > 0,
    isHighInspectionRisk: !inspection.protectedByBlackMarket && inspection.checkChancePercent >= 10,
    hasContraband: inspection.hasContraband,
  };
}

export function renderFleetDispatchEstimate(context, options) {
  var opts = options || {};
  var estimate = opts.estimate;
  if (!estimate) return '';
  var recommendation = opts.recommendation || null;
  var warnings = opts.warnings || [];
  var readiness = opts.readiness || null;
  var risk = _buildRiskSummary(estimate);
  var profile = estimate.dispatchProfile || (recommendation && recommendation.dispatchProfile) || (context.effectiveShipStats && context.effectiveShipStats.dispatchProfile) || {};
  var invalidRoute = readiness && !readiness.ok && (readiness.code === 'same_system' || readiness.code === 'no_route');
  var marketLabel = estimate.tradePolicy.marketMode === 'black' ? '黑市' : '公开';
  var loadingLabel = estimate.deliveryOnly ? '运送现有 ' + estimate.selectedCargoQty + ' 单位' : marketLabel + '买 ' + estimate.maxQty + ' 单位';
  var valueLabel = estimate.deliveryOnly ? '预计回款' : '单次利润';
  var profitRateLabel = estimate.deliveryOnly ? '库存变现' : Math.round(estimate.profitRate * 100) + '%';
  var recommendationHtml = recommendation ? '<div class="dispatch-estimate-head">推荐：' + _escapeHtml(recommendation.buySystemName) + ' → ' + _escapeHtml(recommendation.sellSystemName) + '（' + _escapeHtml(recommendation.goodName) + '）</div>' : '';
  var strategyHtml = profile.strategyLabel ? '<div class="dispatch-estimate-note">' + _escapeHtml((profile.roleLabel || '默认跑商') + ' · ' + profile.strategyLabel + '：' + (recommendation && recommendation.strategySummary ? recommendation.strategySummary.replace(/^.*：/, '') : (profile.strategyNote || '按当前利润与避险程度筛选路线。'))) + '</div>' : '';
  var surveyHtml = recommendation && recommendation.surveyIntelSummary ? '<div class="dispatch-estimate-note">' + _escapeHtml(recommendation.surveyIntelSummary) + '</div>' : '';
  var detailsHtml = invalidRoute ? '' : '<div class="dispatch-estimate-main" role="list" aria-label="自动跑商估算"><span class="dispatch-estimate-metric dispatch-estimate-highlight" role="listitem"><em>装载计划</em><strong>' + loadingLabel + '</strong></span><span class="dispatch-estimate-metric" role="listitem"><em>' + valueLabel + '</em><strong>≈ ' + Math.floor(estimate.profit) + '</strong><small>积分</small></span><span class="dispatch-estimate-metric" role="listitem"><em>收益判断</em><strong>' + profitRateLabel + '</strong></span><span class="dispatch-estimate-metric" role="listitem"><em>航程燃料</em><strong>' + estimate.fuelCost + '</strong><small>单位</small></span><span class="dispatch-estimate-metric" role="listitem"><em>路线风险</em><strong>' + _escapeHtml(_formatRouteRisk(estimate.routeRisk.riskLevel)) + '</strong></span><span class="dispatch-estimate-metric" role="listitem"><em>避险程度</em><strong>' + formatFleetDispatchRiskMode(estimate.tradePolicy.riskMode) + '</strong></span></div>' +
    '<div class="dispatch-risk-grid" role="list" aria-label="路线风险明细"><div class="dispatch-risk-item ' + (risk.isHighEnforcement ? 'dispatch-risk-item--danger' : '') + '" role="listitem"><span class="dispatch-risk-label">高执法区</span><span class="dispatch-risk-value">' + _escapeHtml(risk.highEnforcementParts.length ? risk.highEnforcementParts.join('、') : '无') + '</span></div><div class="dispatch-risk-item" role="listitem"><span class="dispatch-risk-label">执法分布</span><span class="dispatch-risk-value">买入 ' + _escapeHtml(risk.buyEnforcementLabel) + ' / 卖出 ' + _escapeHtml(risk.sellEnforcementLabel) + '</span></div><div class="dispatch-risk-item ' + (risk.hasContraband ? 'dispatch-risk-item--warning' : '') + '" role="listitem"><span class="dispatch-risk-label">违禁品</span><span class="dispatch-risk-value">' + _escapeHtml(risk.contrabandLabel) + '</span></div><div class="dispatch-risk-item ' + (risk.isHighInspectionRisk ? 'dispatch-risk-item--danger' : '') + '" role="listitem"><span class="dispatch-risk-label">预计查获风险</span><span class="dispatch-risk-value">' + _escapeHtml(risk.riskLabel) + '</span></div></div>';
  return recommendationHtml + strategyHtml + surveyHtml + detailsHtml +
    (!invalidRoute && estimate.profit <= 0 ? '<div class="dispatch-estimate-note dispatch-estimate-note--danger">亏损路线</div>' : '') +
    (readiness && !readiness.ok ? '<div class="dispatch-estimate-note dispatch-estimate-note--danger">无法启动：' + _escapeHtml(readiness.reason) + '</div>' : '') +
    (profile.faultPressure > 0 ? '<div class="dispatch-estimate-note dispatch-estimate-note--warning">船况压力 ' + _escapeHtml(profile.faultPressure) + '，系统会下调高风险与高执法路线优先级。</div>' : '') +
    (warnings.length ? '<div class="dispatch-estimate-note dispatch-estimate-note--warning">当前设置会等待：' + _escapeHtml(warnings.join('、')) + '</div>' : '');
}

export function buildFleetDispatchRouteSummary(selection, estimate, warnings, readiness) {
  var route = selection || {};
  var policy = estimate && estimate.tradePolicy ? estimate.tradePolicy : (route.tradePolicy || parseFleetDispatchPolicy({}));
  var blocked = !!(readiness && !readiness.ok);
  var waiting = Array.isArray(warnings) && warnings.length > 0;
  var systemBuy = _findSystem(route.buySystemId);
  var systemSell = _findSystem(route.sellSystemId);
  var good = _findGood(route.goodId);
  return Object.freeze({
    state: estimate ? (blocked ? 'blocked' : (waiting ? 'waiting' : 'ready')) : 'blocked',
    buyLabel: systemBuy ? systemBuy.name : (route.buySystemId || '待选择'),
    sellLabel: systemSell ? systemSell.name : (route.sellSystemId || '待选择'),
    goodLabel: good ? good.emoji + ' ' + good.name : (route.goodId || '待选择'),
    policyLabel: formatFleetDispatchMarketMode(policy.marketMode) + ' · ' + formatFleetDispatchRiskMode(policy.riskMode) + (blocked ? ' · 暂不可启动' : (waiting ? ' · 等待设置调整' : '')),
  });
}

export function buildFleetDispatchPrimaryView(options) {
  var opts = options || {};
  var estimate = opts.estimate;
  var validation = opts.validation || { valid: true };
  var readiness = opts.readiness || null;
  var recommendation = opts.recommendation || null;
  var selection = opts.selection || {};
  var hasExistingRoute = !!opts.hasExistingRoute;
  var customPolicy = hasCustomFleetDispatchPolicy(selection.tradePolicy);
  var matchesRecommendation = !!estimate && !!recommendation && selection.buySystemId === recommendation.buySystemId && selection.sellSystemId === recommendation.sellSystemId && selection.goodId === recommendation.goodId;
  var buttonLabel = readiness && !readiness.ok ? readiness.buttonLabel : '开始跑商';
  var disabled = !estimate || !validation.valid || !!(readiness && !readiness.ok);
  if (!validation.valid) return Object.freeze({ state: 'invalid', className: 'dispatch-primary-hint dispatch-primary-hint--danger', text: '可选设置里有无效数字，修正后才能开始。', buttonLabel: buttonLabel, disabled: true });
  if (!estimate) {
    return Object.freeze({
      state: 'blocked',
      className: 'dispatch-primary-hint dispatch-primary-hint--warning',
      text: recommendation ? '当前推荐路线暂不可用，可展开可选设置调整后再试。' : (hasExistingRoute ? '当前路线缺少可用估算；可关闭窗口，或调整设置后重新计算。' : '当前没有可直接使用的推荐路线，可展开可选设置调整后再试。'),
      buttonLabel: buttonLabel,
      disabled: true,
    });
  }
  if (readiness && !readiness.ok) return Object.freeze({ state: 'blocked', className: 'dispatch-primary-hint dispatch-primary-hint--danger', text: readiness.reason, buttonLabel: buttonLabel, disabled: true });
  if (matchesRecommendation) return Object.freeze({ state: 'ready', className: 'dispatch-primary-hint dispatch-primary-hint--ready', text: hasExistingRoute ? '已载入当前最优路线，点击“开始跑商”可直接改派。' : '已载入当前最优路线，点击“开始跑商”即可启动。', buttonLabel: buttonLabel, disabled: false });
  return Object.freeze({
    state: customPolicy ? 'custom' : 'manual',
    className: 'dispatch-primary-hint',
    text: customPolicy ? '当前使用手动设置，点击“开始跑商”将按这些设置执行。' : (hasExistingRoute ? '当前显示正在使用的路线；修改后点击“开始跑商”即可改派。' : '当前显示手动路线；点击“开始跑商”即可执行。'),
    buttonLabel: buttonLabel,
    disabled: disabled,
  });
}

export function buildFleetDispatchSystemOptions(systems, dispatchGalaxyId) {
  var galaxyNames = Object.create(null);
  GALAXIES.forEach(function (galaxy) { galaxyNames[galaxy.id] = galaxy.name; });
  var grouped = Object.create(null);
  var order = [];
  (systems || []).forEach(function (system) {
    var galaxyId = system.galaxyId || 'unknown';
    if (!grouped[galaxyId]) { grouped[galaxyId] = []; order.push(galaxyId); }
    grouped[galaxyId].push(system);
  });
  return order.map(function (galaxyId) {
    var label = galaxyNames[galaxyId] || galaxyId;
    if (galaxyId === dispatchGalaxyId) label += ' · 当前星系';
    return '<optgroup label="' + _escapeHtml(label) + '">' + grouped[galaxyId].map(function (system) {
      return '<option value="' + _escapeHtml(system.id) + '">' + _escapeHtml(system.name + ' [' + system.typeLabel + ']') + '</option>';
    }).join('') + '</optgroup>';
  }).join('');
}

export function buildFleetDispatchGoodOptions(marketMode) {
  return GOODS.filter(function (good) {
    return good.id !== 'fuel' && AutoTrade.isGoodAllowedInMarket(good, marketMode || 'open');
  }).map(function (good) {
    return '<option value="' + _escapeHtml(good.id) + '">' + _escapeHtml(good.emoji + ' ' + good.name) + '</option>';
  }).join('');
}

export function findFleetDispatchRecommendation(context, policy, systemIds) {
  var ctx = context || {};
  var ship = ctx.ship;
  var stats = ctx.effectiveShipStats;
  if (!ctx.state || !ship || !stats) return null;
  var cargoUsed = Object.values(ship.cargo || {}).reduce(function (sum, quantity) { return sum + quantity; }, 0);
  return AutoTrade.findBestDispatchRoute(ctx.state, {
    currentSystem: ctx.currentLocationSystemId,
    currentGalaxy: ctx.dispatchGalaxyId,
    fuelEfficiency: stats.fuelEff,
    cargoFree: stats.maxCargo - cargoUsed,
    credits: ctx.state.credits,
    playerLevel: ctx.playerLevel,
    systemIds: systemIds || [],
    allowCrossGalaxy: true,
    dispatchProfile: stats.dispatchProfile || null,
  }, policy || parseFleetDispatchPolicy({}));
}
