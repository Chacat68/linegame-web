import { findSystem } from '../data/systems.js';
import * as Faction from '../systems/faction/FactionSystem.js';
import * as Exploration from '../systems/galaxy/ExplorationSystem.js';

const MARKET_FOCUS_PRESETS = {
  'spot-trade': { workspaceId: 'spot', subworkspaceId: 'trade', label: '现货交易区' },
  'spot-intel': { workspaceId: 'spot', subworkspaceId: 'intel', label: '市场情报区' },
  'spot-black': { workspaceId: 'spot', subworkspaceId: 'black', label: '黑市分区', marketMode: 'black' },
  'capital-local': { workspaceId: 'capital', subworkspaceId: 'local', label: '资本调度区' },
  'operations-local': { workspaceId: 'operations', subworkspaceId: 'local', label: '本地节点经营区' },
  'operations-network': { workspaceId: 'operations', subworkspaceId: 'network', label: '商网总览区' },
  'operations-stations': { workspaceId: 'operations', subworkspaceId: 'stations', label: '站点编排区' },
};

export const MARKET_FOCUS_PRESET_IDS = {
  SPOT_TRADE: 'spot-trade',
  SPOT_INTEL: 'spot-intel',
  SPOT_BLACK: 'spot-black',
  CAPITAL_LOCAL: 'capital-local',
  OPERATIONS_LOCAL: 'operations-local',
  OPERATIONS_NETWORK: 'operations-network',
  OPERATIONS_STATIONS: 'operations-stations',
};

const SYSTEM_TYPE_OPPORTUNITY_FOCUS = {
  commercial: 'market',
  special: 'market',
  military: 'market',
  technology: 'research',
  research: 'research',
};

const MARKET_OPPORTUNITY_PRESET_IDS = {
  logistics: MARKET_FOCUS_PRESET_IDS.SPOT_TRADE,
  market: MARKET_FOCUS_PRESET_IDS.SPOT_INTEL,
  research: MARKET_FOCUS_PRESET_IDS.SPOT_INTEL,
};

export function getMarketFocusPreset(presetId) {
  var preset = MARKET_FOCUS_PRESETS[presetId] || MARKET_FOCUS_PRESETS[MARKET_FOCUS_PRESET_IDS.SPOT_INTEL];
  return Object.assign({}, preset);
}

function _getSystemOpportunityFocus(system, summary) {
  if (summary && typeof summary.opportunityFocus === 'string' && summary.opportunityFocus) {
    return summary.opportunityFocus;
  }
  if (!system) return 'logistics';
  return SYSTEM_TYPE_OPPORTUNITY_FOCUS[system.type] || 'logistics';
}

function _hasLocalTradeInvestment(state, systemId) {
  if (!state || !systemId || !state.tradeInvestments || typeof state.tradeInvestments !== 'object') {
    return false;
  }

  var investment = state.tradeInvestments[systemId];
  return !!(investment && Number(investment.amount || 0) > 0);
}

function _getSystemContextLabel(system) {
  if (!system) return '当前节点';
  if (system.typeLabel) return system.typeLabel + '节点';
  return (system.name || '当前节点') + '节点';
}

function _getContextualMarketDecision(state, systemId) {
  var targetSystemId = systemId || (state && state.currentSystem);
  var system = findSystem(targetSystemId);
  var fallbackDecision = {
    presetId: MARKET_FOCUS_PRESET_IDS.SPOT_TRADE,
    system: system,
    contextHint: '当前节点默认回到现货交易区。',
    opportunityFocus: 'logistics',
  };

  if (!state || !targetSystemId || !system) {
    return fallbackDecision;
  }

  var hasStation = !!(
    state.tradeStations &&
    typeof state.tradeStations === 'object' &&
    state.tradeStations[targetSystemId]
  );
  var hasInvestment = _hasLocalTradeInvestment(state, targetSystemId);
  if (hasStation || hasInvestment) {
    return {
      presetId: MARKET_FOCUS_PRESET_IDS.OPERATIONS_LOCAL,
      system: system,
      opportunityFocus: 'operations',
      contextHint: hasStation && hasInvestment
        ? '当前节点已有贸易站和本地投资，优先回到本地节点经营区处理资产动作。'
        : hasStation
          ? '当前节点已有贸易站，优先回到本地节点经营区处理站点动作。'
          : '当前节点已有本地投资，优先回到本地节点经营区查看增配与分红。',
    };
  }

  var surveySummary = Exploration.getSurveySummary(state, targetSystemId);
  var surveyIntel = Exploration.getSurveyDecisionIntel(state, targetSystemId);
  var opportunityFocus = _getSystemOpportunityFocus(system, surveySummary);
  var contextLabel = _getSystemContextLabel(system);
  var hasReportIntel = !!(surveyIntel && surveyIntel.hasIntel);
  var marketHint = hasReportIntel ? surveyIntel.marketHint : '';
  if (opportunityFocus === 'market' && system.type === 'special' && Faction.canAccessBlackMarket(state, targetSystemId)) {
    return {
      presetId: MARKET_FOCUS_PRESET_IDS.SPOT_BLACK,
      system: system,
      opportunityFocus: opportunityFocus,
      contextHint: hasReportIntel
        ? (marketHint + ' 该节点也已解锁黑市通路，可切到黑市分区验证特殊价格。')
        : contextLabel + '已解锁黑市通路，优先落到黑市分区。',
    };
  }

  if (hasReportIntel && surveyIntel.primarySignal === 'route') {
    return {
      presetId: MARKET_FOCUS_PRESET_IDS.SPOT_INTEL,
      system: system,
      opportunityFocus: opportunityFocus,
      contextHint: marketHint,
    };
  }

  if (opportunityFocus === 'research') {
    return {
      presetId: MARKET_FOCUS_PRESET_IDS.SPOT_INTEL,
      system: system,
      opportunityFocus: opportunityFocus,
      contextHint: hasReportIntel
        ? marketHint
        : contextLabel + '更偏科研线索，先看市场情报区再决定补给或交易。',
    };
  }

  if (opportunityFocus === 'market') {
    return {
      presetId: MARKET_FOCUS_PRESET_IDS.SPOT_INTEL,
      system: system,
      opportunityFocus: opportunityFocus,
      contextHint: hasReportIntel
        ? marketHint
        : contextLabel + '更偏机会侦察，先看市场情报区再决定是否进场。',
    };
  }

  if (hasReportIntel && surveyIntel.marketSignal) {
    return {
      presetId: MARKET_FOCUS_PRESET_IDS.SPOT_INTEL,
      system: system,
      opportunityFocus: opportunityFocus,
      contextHint: marketHint,
    };
  }

  return {
    presetId: MARKET_FOCUS_PRESET_IDS.SPOT_TRADE,
    system: system,
    opportunityFocus: opportunityFocus,
    contextHint: hasReportIntel
      ? marketHint
      : contextLabel + '更适合补给与现货周转，先落到现货交易区。',
  };
}

export function getContextualMarketPresetId(state, systemId) {
  return _getContextualMarketDecision(state, systemId).presetId;
}

export function getContextualMarketFocus(state, systemId) {
  return getMarketFocusPreset(getContextualMarketPresetId(state, systemId));
}

export function getMarketFocusCtaLabel(marketFocus, context) {
  if (!marketFocus) {
    return context === 'faction' ? '查看代表市场' : '查看市场';
  }

  if (marketFocus.marketMode === 'black' || marketFocus.subworkspaceId === 'black') {
    return '查看黑市通路';
  }

  if (marketFocus.workspaceId === 'operations') {
    return '查看本地经营';
  }

  if (marketFocus.workspaceId === 'capital') {
    return '查看资本调度';
  }

  if (marketFocus.subworkspaceId === 'intel') {
    return '查看市场情报';
  }

  return context === 'faction' ? '查看代表市场' : '查看现货交易';
}

export function buildContextualMarketAction(state, systemId, options) {
  var targetSystemId = systemId || (state && state.currentSystem) || '';
  var marketDecision = _getContextualMarketDecision(state, targetSystemId);
  var marketFocus = getMarketFocusPreset(marketDecision.presetId);
  var targetSystem = marketDecision.system || findSystem(targetSystemId);
  var context = options && options.context ? options.context : '';

  return {
    actionId: 'market',
    reasonId: options && options.reasonId ? options.reasonId : '',
    label: options && options.label ? options.label : getMarketFocusCtaLabel(marketFocus, context),
    hint: options && options.hint ? options.hint : marketDecision.contextHint,
    variant: options && options.variant ? options.variant : 'primary',
    commandSurface: 'market',
    commandIntent: marketFocus.label,
    commandVerb: options && options.label ? options.label : getMarketFocusCtaLabel(marketFocus, context),
    systemId: targetSystemId,
    systemName: targetSystem ? targetSystem.name : targetSystemId,
    marketWorkspaceId: marketFocus.workspaceId,
    marketSubworkspaceId: marketFocus.subworkspaceId,
    marketFocusLabel: marketFocus.label,
    marketMode: marketFocus.marketMode || '',
    contextHint: options && options.contextHint ? options.contextHint : marketDecision.contextHint,
  };
}

export function buildMarketFocusAction(reasonId, label, hint, presetId, variant) {
  var marketFocus = getMarketFocusPreset(presetId);
  return {
    actionId: 'market',
    reasonId: reasonId,
    label: label,
    hint: hint,
    variant: variant || 'primary',
    commandSurface: 'market',
    commandIntent: marketFocus.label,
    commandVerb: label,
    marketWorkspaceId: marketFocus.workspaceId,
    marketSubworkspaceId: marketFocus.subworkspaceId,
    marketFocusLabel: marketFocus.label,
    marketMode: marketFocus.marketMode || '',
  };
}
