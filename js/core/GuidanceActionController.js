import { buildCommandFeedback } from '../ui/CommandAction.js?v=20260510-command1';
import * as CommerceAction from './CommerceActionController.js?v=20260524-action2';
import * as ExplorationAction from './ExplorationActionController.js?v=20260524-action2';

export { getMarketActionDestination } from './CommerceActionController.js?v=20260524-action2';

function _getState(context) {
  if (context && typeof context.getState === 'function') return context.getState();
  return context && context.state ? context.state : {};
}

function _call(context, name) {
  if (!context || typeof context[name] !== 'function') return undefined;
  return context[name].apply(null, Array.prototype.slice.call(arguments, 2));
}

export function getProcessingMessage(suggestion) {
  if (!suggestion) return '已执行，正在生成下一条建议';
  if (suggestion.actionType === 'trade.buy' || suggestion.actionType === 'trade.sell') {
    var questName = suggestion.payload && suggestion.payload.questName ? suggestion.payload.questName : '';
    return questName
      ? '已打开交易确认，完成后将推进「' + questName + '」'
      : '已打开交易确认，完成后会刷新下一步';
  }
  if (suggestion.actionType === 'quest.accept') return '已接入任务档案，正在衔接下一步';
  if (suggestion.actionType === 'map.focus') return '已定位航点，查看详情后可起航';
  if (suggestion.actionType === 'travel.execute') return '已执行航行指令，抵达后刷新建议';
  if (suggestion.actionType === 'trade.refuel') return '已执行燃料补给，正在刷新下一步';
  if (suggestion.actionType === 'event.open') return '已打开待处理事件，完成后继续刷新建议';
  if (suggestion.actionType === 'fleet.dispatch.prefill') return '已载入派遣草案，确认后执行路线';
  if (suggestion.actionType === 'fleet.service.open') return '已切到机库，检查维修方案';
  if (ExplorationAction.isExplorationAction(suggestion.actionType)) return ExplorationAction.getProcessingMessage(suggestion);
  return '已执行，正在生成下一条建议';
}

export function handleGuidanceAction(suggestion, context) {
  if (!suggestion || !suggestion.actionType) return;

  var ctx = context || {};
  var state = _getState(ctx);
  var payload = suggestion.payload || {};

  if (CommerceAction.handleCommerceAction(suggestion, ctx)) return;
  if (ExplorationAction.handleExplorationAction(suggestion, ctx)) return;

  switch (suggestion.actionType) {
    case 'quest.accept':
      if (payload.questId) {
        _call(ctx, 'prepareDirectExecution');
        _call(ctx, 'acceptQuest', payload.questId);
      } else {
        _call(ctx, 'refreshActionGuide');
      }
      return;

    case 'quest.open':
      if (payload.questId) {
        _call(ctx, 'selectAvailableQuest', payload.questId);
      }
      _call(ctx, 'activateTab', 'tab-quest');
      _call(ctx, 'updateUI');
      return;

    case 'trade.buy':
      _call(ctx, 'prepareDirectExecution');
      _call(ctx, 'openTradeConfirmation', 'buy', payload);
      return;

    case 'trade.sell':
      _call(ctx, 'prepareDirectExecution');
      _call(ctx, 'openTradeConfirmation', 'sell', payload);
      return;

    case 'trade.refuel':
      _call(ctx, 'prepareDirectExecution');
      _call(ctx, 'refuel');
      return;

    case 'event.open':
      _call(ctx, 'forcePendingEvent');
      _call(ctx, 'refreshActionGuide');
      return;

    case 'fleet.dispatch.prefill':
      if (payload.recommendation) {
        _call(ctx, 'prepareDirectExecution');
        _call(ctx, 'openRecommendedDispatch', payload.recommendation, payload.sourceLabel || '派遣建议', '🛰️');
      } else {
        _call(ctx, 'refreshActionGuide');
      }
      return;

    case 'fleet.service.open':
      _call(ctx, 'activateTab', 'tab-fleet');
      _call(ctx, 'emitLog', {
        text: buildCommandFeedback({
          actionId: 'service',
          commandSurface: 'fleet',
          commandIntent: '维修船坞',
          label: suggestion.actionLabel || '打开机库',
        }, {
          icon: '🔧',
          openedVerb: '已切到',
          destination: '机库 · 维修船坞',
          nextStep: payload.repairCost
            ? ('确认维修方案，预计花费 ' + Number(payload.repairCost || 0).toLocaleString() + ' 积分')
            : '检查激活飞船状态并安排维修',
          returnTo: '维修完成后继续派遣或航行',
        }),
        type: 'tip',
      });
      _call(ctx, 'updateUI');
      return;

    case 'travel.execute':
      var directDestinationSystemId = payload.destinationSystemId || '';
      if (directDestinationSystemId) {
        _call(ctx, 'prepareDirectExecution');
        _call(ctx, 'travel', directDestinationSystemId);
      } else if (typeof ctx.focusStarmap === 'function') {
        _call(ctx, 'focusStarmap');
        _call(ctx, 'updateUI');
      } else {
        _call(ctx, 'refreshActionGuide');
      }
      return;

    case 'map.focus':
      var destinationSystemId = payload.destinationSystemId || '';
      var navigationFocused = false;
      if (destinationSystemId && typeof ctx.focusNavigationTarget === 'function') {
        navigationFocused = !!_call(ctx, 'focusNavigationTarget', state, destinationSystemId, {
          goodId: payload.goodId || '',
          title: suggestion.title || '',
        });
      }
      if (!navigationFocused) {
        _call(ctx, 'focusStarmap');
      }
      _call(ctx, 'emitLog', {
        text: buildCommandFeedback({
          actionId: 'navigation',
          commandSurface: 'navigation',
          commandIntent: navigationFocused ? '卖货航点' : '星图',
          label: suggestion.actionLabel || '查看星图',
        }, {
          icon: '🧭',
          destination: navigationFocused && payload.destinationSystemName
            ? ('星图 · ' + payload.destinationSystemName)
            : '星图 · 航线判断',
          nextStep: suggestion.title,
          returnTo: navigationFocused ? '目标详情面板的“前往卖货点”' : '选择目的地后继续贸易循环',
        }),
        type: 'tip',
      });
      _call(ctx, 'updateUI');
      return;

    default:
      _call(ctx, 'refreshActionGuide');
  }
}
