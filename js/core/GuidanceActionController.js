import { buildCommandFeedback } from '../ui/CommandAction.js';
import * as CommerceAction from './CommerceActionController.js';
import { getNavigationFocusCompletion, showContextCompletion } from './ActionGuideCompletion.js';
import * as ExplorationAction from './ExplorationActionController.js';
import { getProcessingMessage } from './GuidanceActionFeedback.js';

export { getMarketActionDestination } from './CommerceActionController.js';
export { getProcessingMessage } from './GuidanceActionFeedback.js';

function _getState(context) {
  if (context && typeof context.getState === 'function') return context.getState();
  return context && context.state ? context.state : {};
}

function _call(context, name) {
  if (!context || typeof context[name] !== 'function') return undefined;
  return context[name].apply(null, Array.prototype.slice.call(arguments, 2));
}

export function handleGuidanceAction(suggestion, context) {
  if (!suggestion || !suggestion.actionType) return;

  var ctx = context || {};
  var state = _getState(ctx);
  var payload = suggestion.payload || {};

  if (CommerceAction.handleCommerceAction(suggestion, ctx)) return;
  if (ExplorationAction.handleExplorationAction(suggestion, ctx)) return;

  switch (suggestion.actionType) {
    case 'guidance.chain.start':
      if (payload.chainId) {
        _call(ctx, 'startTeachingChain', payload.chainId);
      } else {
        _call(ctx, 'refreshActionGuide');
      }
      return;

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
      _call(ctx, 'activateTab', payload.tabId || 'tab-quest');
      _call(ctx, 'updateUI');
      _call(ctx, 'emitLog', {
        text: buildCommandFeedback({
          actionId: 'quest',
          commandSurface: 'quest',
          commandIntent: suggestion.commandIntent || '可接委托',
          label: suggestion.actionLabel || '查看任务',
        }, {
          icon: '📋',
          destination: '档案 · 任务',
          nextStep: suggestion.title || '选择当前条件下可完成的委托',
          returnTo: '接取后当前行动会按目标继续引导',
        }),
        type: 'tip',
      });
      showContextCompletion(ctx, {
        message: '已打开任务档案',
        detail: '选择可完成委托后继续',
      });
      return;

    case 'archive.open':
      if (payload.chainId && typeof ctx.acknowledgeSurveyChainFollowup === 'function') {
        _call(ctx, 'acknowledgeSurveyChainFollowup', payload.systemId || state.currentSystem, payload.chainId);
      }
      if (payload.reportId && typeof ctx.acknowledgeSurveyReport === 'function') {
        _call(ctx, 'acknowledgeSurveyReport', payload.systemId || state.currentSystem, payload.reportId);
      }
      _call(ctx, 'activateTab', payload.tabId || 'tab-exploration');
      _call(ctx, 'updateUI');
      if (typeof ctx.revealArchiveReportFocus === 'function') {
        _call(ctx, 'revealArchiveReportFocus', payload.systemId || state.currentSystem, payload.chainId || '');
      }
      _call(ctx, 'emitLog', {
        text: buildCommandFeedback({
          actionId: 'archive',
          commandSurface: 'archive',
          commandIntent: '探索报告',
          label: suggestion.actionLabel || '打开档案确认',
        }, {
          icon: '📘',
          destination: '档案 · 探索报告',
          nextStep: suggestion.title,
          returnTo: '关闭档案后，当前行动会自动刷新为下一条可执行建议',
        }),
        type: 'tip',
      });
      showContextCompletion(ctx, {
        message: '报告用途已确认',
        detail: '关闭档案后将继续给出下一条行动',
      });
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
        _call(ctx, 'openRecommendedDispatch', payload.recommendation, payload.sourceLabel || '跑商建议', '🛰️');
      } else {
        _call(ctx, 'refreshActionGuide');
      }
      return;

    case 'fleet.service.open':
      _call(ctx, 'activateTab', 'tab-fleet');
      if (typeof ctx.openRecommendedMod === 'function') {
        _call(ctx, 'openRecommendedMod', Object.assign({}, payload, { focusService: true }));
      } else {
        _call(ctx, 'updateUI');
      }
      _call(ctx, 'emitLog', {
        text: buildCommandFeedback({
          actionId: 'service',
          commandSurface: 'fleet',
          commandIntent: '维修船坞',
          label: suggestion.actionLabel || '打开维修方案',
        }, {
          icon: '🔧',
          openedVerb: '已切到',
          destination: '机库 · 维修船坞',
          nextStep: payload.repairCost
            ? ('确认维修方案，预计花费 ' + Number(payload.repairCost || 0).toLocaleString() + ' 积分')
            : '检查激活飞船状态并安排维修',
          returnTo: '维修完成后继续自动跑商或亲自航行',
        }),
        type: 'tip',
      });
      return;

    case 'fleet.mod.open':
      _call(ctx, 'activateTab', 'tab-fleet');
      if (typeof ctx.openRecommendedMod === 'function') {
        _call(ctx, 'openRecommendedMod', payload);
      } else {
        _call(ctx, 'updateUI');
      }
      _call(ctx, 'emitLog', {
        text: buildCommandFeedback({
          actionId: 'mod',
          commandSurface: 'fleet',
          commandIntent: '模块改装',
          label: suggestion.actionLabel || '打开机库',
        }, {
          icon: '🧩',
          openedVerb: '已切到',
          destination: '机库 · 模块改装',
          nextStep: payload.modName
            ? ('优先查看「' + payload.modName + '」' + (payload.modCost ? ('，安装成本 ' + Number(payload.modCost || 0).toLocaleString() + ' 积分') : ''))
            : '查看推荐组件并确认是否安装',
          returnTo: '安装后继续自动跑商、探索或经营',
        }),
        type: 'tip',
      });
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
      showContextCompletion(ctx, getNavigationFocusCompletion(navigationFocused));
      return;

    default:
      _call(ctx, 'refreshActionGuide');
  }
}
