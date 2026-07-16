import { buildCommandFeedback } from '../ui/CommandAction.js';
import { getMarketNavigationCompletion, showContextCompletion } from './ActionGuideCompletion.js';

function _getState(context) {
  if (context && typeof context.getState === 'function') return context.getState();
  return context && context.state ? context.state : {};
}

function _call(context, name) {
  if (!context || typeof context[name] !== 'function') return undefined;
  return context[name].apply(null, Array.prototype.slice.call(arguments, 2));
}

export function isCommerceAction(actionType) {
  return actionType === 'market.open' || actionType === 'market.focus';
}

export function getMarketActionDestination(payload, fallbackIntent) {
  var workspaceId = payload && payload.workspaceId ? payload.workspaceId : 'spot';
  var subworkspaceId = payload && payload.subworkspaceId ? payload.subworkspaceId : 'trade';
  if (workspaceId === 'operations') {
    if (subworkspaceId === 'network') return '经营页 · 商网总览区';
    if (subworkspaceId === 'stations') return '经营页 · 站点编排区';
    return '经营页 · 本地节点经营区';
  }
  if (workspaceId === 'capital') {
    return '商业终端 · 资本调度区';
  }
  if (subworkspaceId === 'intel') return '当前市场 · 市场情报区';
  if (subworkspaceId === 'black') return '当前市场 · 黑市分区';
  return '当前市场 · ' + (fallbackIntent || '现货交易区');
}

export function handleCommerceAction(suggestion, context) {
  if (!suggestion || !isCommerceAction(suggestion.actionType)) return false;

  var state = _getState(context || {});
  var payload = suggestion.payload || {};
  var marketFocusGoodId = payload.goodId || '';
  var marketFocusTradeAction = payload.tradeAction || '';
  var marketFocus = {
    workspaceId: payload.workspaceId || 'spot',
    subworkspaceId: payload.subworkspaceId || 'trade',
    goodId: marketFocusGoodId,
    tradeAction: marketFocusTradeAction,
  };
  if (payload.systemId) marketFocus.systemId = payload.systemId;

  if (payload.chainId && typeof context.acknowledgeSurveyChainFollowup === 'function') {
    _call(context, 'acknowledgeSurveyChainFollowup', payload.systemId || state.currentSystem, payload.chainId);
  }
  if (payload.systemId && typeof context.openMarketSystemPanel === 'function') {
    _call(context, 'openMarketSystemPanel', state, payload.systemId, marketFocus);
  } else {
    _call(context, 'openMarketPanel', state, marketFocus);
  }
  _call(context, 'emitLog', {
    text: buildCommandFeedback({
      actionId: 'market',
      commandSurface: 'market',
      commandIntent: suggestion.commandIntent || '现货交易区',
      label: suggestion.actionLabel || '打开市场',
    }, {
      icon: '📊',
      destination: getMarketActionDestination(payload, suggestion.commandIntent || '现货交易区'),
      nextStep: suggestion.title,
      returnTo: '底部指挥条会继续提示下一步',
    }),
    type: 'tip',
  });
  _call(context, 'updateUI');
  if (marketFocusGoodId) {
    _call(context, 'revealMarketGoodFocus', marketFocusGoodId, { tradeAction: marketFocusTradeAction });
  } else if (payload.chainId && typeof context.revealSurveyChainFocus === 'function') {
    _call(context, 'revealSurveyChainFocus', payload.chainId);
  }
  showContextCompletion(context, getMarketNavigationCompletion());

  return true;
}
