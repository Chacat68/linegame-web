// js/ui/MarketOperationsPresentationSupport.js — 商网投影共享的安全格式化与站点语义

export function escapeMarketOperationsHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeMarketOperationsHtmlAttr(value) {
  return escapeMarketOperationsHtml(value).replace(/`/g, '&#96;');
}

function formatSynergyBonus(synergy) {
  if (!synergy || !synergy.bonusMultiplier) return '';
  return '+' + Math.round((synergy.bonusMultiplier || 0) * 100) + '%';
}

function renderRoleMeta(role, synergy, prefix, className) {
  if (!role) return '';
  var label = prefix || '角色';
  var bonus = formatSynergyBonus(synergy);
  var synergyText = bonus
    ? ((synergy.galaxyName ? (synergy.galaxyName + ' · ') : '') + synergy.label + ' ' + bonus)
    : '区域协同待补齐';
  return '<div class="' + className + '">' +
    escapeMarketOperationsHtml(label + '：' + role.name + ' · ' + synergyText) +
  '</div>';
}

export function renderTradeStationRoleMeta(role, synergy, prefix) {
  return renderRoleMeta(role, synergy, prefix, 'trade-station-card-meta');
}

export function renderMarketFinanceRoleMeta(role, synergy, prefix) {
  return renderRoleMeta(role, synergy, prefix, 'market-finance-card-meta');
}

function formatStrategyConfidence(confidence) {
  if (confidence === 'high') return '高置信';
  if (confidence === 'medium') return '中置信';
  return '低置信';
}

export function renderStrategyRecommendationMeta(recommendation, className) {
  if (!recommendation || !recommendation.strategy) return '';
  var metaClass = className || 'trade-station-card-meta';
  var status = recommendation.shouldSwitch ? '可切换' : '当前匹配';
  return '<div class="' + metaClass + '">' +
    escapeMarketOperationsHtml('匹配方式：' + recommendation.strategy.name + ' · ' + status + ' · ' + formatStrategyConfidence(recommendation.confidence) + ' · ' + recommendation.reason) +
  '</div>';
}

export function renderStrategyRecommendationButton(entry, className) {
  if (!entry || !entry.station || !entry.strategyRecommendation || !entry.strategyRecommendation.shouldSwitch) return '';
  var recommendation = entry.strategyRecommendation;
  var buttonClass = className || 'trade-station-upgrade-btn';
  var stationLabel = entry.system && entry.system.name ? entry.system.name : entry.station.systemId;
  return '<button class="btn-action ' + buttonClass + '" data-action="market-set-strategy" data-system-id="' + escapeMarketOperationsHtmlAttr(entry.station.systemId) + '" data-strategy-id="' + escapeMarketOperationsHtmlAttr(recommendation.strategyId) + '" aria-label="' + escapeMarketOperationsHtmlAttr(stationLabel + ' 切换为匹配方式 ' + recommendation.strategy.name) + '">' +
    '采用匹配方式' +
  '</button>';
}

export function renderTradeStationExplorationEffectMeta(effect, className) {
  if (!effect || !effect.summary) return '';
  var metaClass = className || 'trade-station-card-meta';
  return '<div class="' + metaClass + '">' +
    escapeMarketOperationsHtml('连续任务加成：' + effect.summary) +
  '</div>';
}

export function getTradeStationDomId(prefix, systemId) {
  var safeId = String(systemId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-');
  return prefix + '-' + safeId;
}
