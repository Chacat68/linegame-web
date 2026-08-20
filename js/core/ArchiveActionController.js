// js/core/ArchiveActionController.js — 科研、任务与派系档案动作编排

import { buildCommandFeedback } from '../ui/CommandAction.js';
import {
  ARCHIVE_QUEST_ACTION_PRESENTATION,
  ARCHIVE_RESEARCH_ACTION_PRESENTATION,
} from './ActionPresentation.js';

function _noop() {}

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('ArchiveActionController requires ' + label + '.');
  return value;
}

function _call(target, name, args) {
  if (!target || typeof target[name] !== 'function') return undefined;
  return target[name].apply(target, args || []);
}

export function createArchiveActionController(dependencies) {
  var deps = dependencies || {};
  var systems = deps.systems || {};
  var Research = systems.Research || {};
  var Quest = systems.Quest || {};
  var Tutorial = systems.Tutorial || {};
  var getState = _requiredFunction(deps.getState, 'getState');
  var dispatch = _requiredFunction(deps.dispatch, 'dispatch');
  var updateUI = typeof deps.updateUI === 'function' ? deps.updateUI : _noop;
  var emitLog = typeof deps.emitLog === 'function' ? deps.emitLog : _noop;
  var activateArchiveTab = typeof deps.activateArchiveTab === 'function' ? deps.activateArchiveTab : _noop;
  var openMarketPanel = typeof deps.openMarketPanel === 'function' ? deps.openMarketPanel : _noop;
  var openMarketSystemPanel = typeof deps.openMarketSystemPanel === 'function' ? deps.openMarketSystemPanel : _noop;
  var selectAvailableQuest = typeof deps.selectAvailableQuest === 'function' ? deps.selectAvailableQuest : _noop;
  var openRecommendedDispatch = typeof deps.openRecommendedDispatch === 'function' ? deps.openRecommendedDispatch : _noop;
  var queueQuestDialogueResult = typeof deps.queueQuestDialogueResult === 'function' ? deps.queueQuestDialogueResult : _noop;
  var playTriggerDialogue = typeof deps.playTriggerDialogue === 'function' ? deps.playTriggerDialogue : _noop;

  function _state() {
    var state = getState();
    if (!state || typeof state !== 'object') throw new Error('ArchiveActionController requires an active state.');
    return state;
  }

  function _researchAction(methodName, techId) {
    var result = _call(Research, methodName, [_state()].concat(typeof techId === 'undefined' ? [] : [techId]));
    dispatch(result, ARCHIVE_RESEARCH_ACTION_PRESENTATION);
    return result;
  }

  function onStartResearch(techId) {
    return _researchAction('startResearch', techId);
  }

  function onCancelQueuedResearch(techId) {
    return _researchAction('cancelQueuedResearch', techId);
  }

  function onMoveQueuedResearchUp(techId) {
    return _researchAction('moveQueuedResearchUp', techId);
  }

  function onMoveQueuedResearchDown(techId) {
    return _researchAction('moveQueuedResearchDown', techId);
  }

  function onClearResearchQueue() {
    return _researchAction('clearResearchQueue');
  }

  function onApplyResearchDispatch(recommendation) {
    return openRecommendedDispatch(recommendation, '科研补给建议', '🛰️');
  }

  function onApplyQuestDispatch(recommendation) {
    return openRecommendedDispatch(recommendation, '任务路线建议', '📋');
  }

  function onOpenFactionMarket(action) {
    if (!action || action.actionId !== 'market') return false;
    openMarketSystemPanel(_state(), action.systemId, {
      workspaceId: action.marketWorkspaceId,
      subworkspaceId: action.marketSubworkspaceId,
      marketMode: action.marketMode || '',
    });

    var factionName = action.factionName || '该派系';
    var nextStep = action.label === '查看黑市条件'
      ? '查看开放条件与公开情报'
      : action.marketMode === 'black'
        ? '沿着' + factionName + '的地下通路继续找机会'
        : '观察' + factionName + '代表地点行情';
    emitLog({
      text: buildCommandFeedback(action, {
        icon: action.label === '查看黑市条件' ? '🔒' : (action.marketMode === 'black' ? '🕶' : '🏛'),
        destination: (action.systemName || '代表地点') + ' · ' + (action.marketFocusLabel || '市场页'),
        nextStep: nextStep,
        returnTo: '派系页继续调整关系方向',
      }),
      type: 'tip',
    });
    return true;
  }

  function onResolveResearchBlocker(action) {
    if (!action || !action.actionId) return false;
    if (action.actionId === 'quest-focus') {
      selectAvailableQuest(action.targetQuestId);
      activateArchiveTab('tab-quest');
      updateUI(ARCHIVE_QUEST_ACTION_PRESENTATION);
      emitLog({
        text: buildCommandFeedback(action, {
          openedVerb: '已切到',
          destination: '任务页 · 替代任务',
          nextStep: '先推进「' + (action.targetQuestName || '推荐任务') + '」',
          returnTo: '科研页继续规划补给',
        }),
        type: 'tip',
      });
      return true;
    }
    if (action.actionId !== 'market') return false;
    openMarketPanel(_state(), {
      workspaceId: action.marketWorkspaceId,
      subworkspaceId: action.marketSubworkspaceId,
    });
    var nextStep = action.reasonId === 'cargo'
      ? '清理货舱腾出科研补给舱位'
      : action.reasonId === 'credits'
        ? '做一笔周转补足科研资金'
        : action.reasonId === 'level'
          ? '补一轮升级节奏，扩大可达补给池'
          : '观察本地行情，等待稳定科研补给线';
    emitLog({
      text: buildCommandFeedback(action, {
        icon: action.reasonId === 'cargo' ? '📦' : (action.reasonId === 'credits' ? '💰' : (action.reasonId === 'level' ? '📈' : '📊')),
        destination: '当前市场 · ' + (action.marketFocusLabel || '市场页'),
        nextStep: nextStep,
        returnTo: '科研页继续规划补给',
      }),
      type: 'tip',
    });
    return true;
  }

  function onResolveQuestBlocker(action) {
    if (!action || !action.actionId) return false;
    if (action.actionId === 'quest-focus') {
      emitLog({
        text: buildCommandFeedback(action, {
          openedVerb: '已找到',
          destination: '任务页 · 替代任务',
          nextStep: '先推进「' + (action.targetQuestName || '推荐任务') + '」补成长',
          returnTo: '任务页继续处理「' + (action.questName || '当前任务') + '」',
        }),
        type: 'tip',
      });
      return true;
    }
    if (action.actionId === 'research') {
      activateArchiveTab('tab-research');
      emitLog({
        text: buildCommandFeedback(action, {
          openedVerb: '已切到',
          destination: '科技页 · 跃迁科技',
          nextStep: '优先补出关键跃迁科技',
          returnTo: '任务页继续推进「' + (action.questName || '当前任务') + '」',
        }),
        type: 'tip',
      });
      return true;
    }
    if (action.actionId !== 'market') return false;
    openMarketPanel(_state(), {
      workspaceId: action.marketWorkspaceId,
      subworkspaceId: action.marketSubworkspaceId,
    });
    emitLog({
      text: buildCommandFeedback(action, {
        icon: action.reasonId === 'fuel' ? '⛽' : '💰',
        destination: '当前市场 · ' + (action.marketFocusLabel || '买卖货物'),
        nextStep: action.reasonId === 'fuel' ? '补足燃料或调整补给' : '跑几笔交易抬升等级',
        returnTo: '任务页继续推进「' + (action.questName || '当前任务') + '」',
      }),
      type: 'tip',
    });
    return true;
  }

  function onAcceptQuest(questId) {
    var state = _state();
    var result = _call(Quest, 'acceptQuest', [state, questId]);
    dispatch(result, ARCHIVE_QUEST_ACTION_PRESENTATION);
    if (!result || !result.ok) return result;

    var finish = function () {
      _call(Tutorial, 'checkTrigger', ['accept_quest']);
      updateUI(ARCHIVE_QUEST_ACTION_PRESENTATION);
    };
    if (result.completedImmediately && result.completedQuest) {
      queueQuestDialogueResult({
        completedQuests: [{ id: result.completedQuest.id, failed: false, quest: result.completedQuest }],
        phaseAdvanced: result.phaseAdvanced,
        newPhase: result.newPhase,
      }, finish);
    } else if (result.quest) {
      playTriggerDialogue('quest_accept', { questId: result.quest.id, quest: result.quest }, finish);
    } else {
      finish();
    }
    return result;
  }

  function onAbandonQuest(questId) {
    var result = _call(Quest, 'abandonQuest', [_state(), questId]);
    dispatch(result, ARCHIVE_QUEST_ACTION_PRESENTATION);
    return result;
  }

  return Object.freeze({
    onStartResearch: onStartResearch,
    onCancelQueuedResearch: onCancelQueuedResearch,
    onMoveQueuedResearchUp: onMoveQueuedResearchUp,
    onMoveQueuedResearchDown: onMoveQueuedResearchDown,
    onClearResearchQueue: onClearResearchQueue,
    onApplyResearchDispatch: onApplyResearchDispatch,
    onOpenFactionMarket: onOpenFactionMarket,
    onResolveResearchBlocker: onResolveResearchBlocker,
    onApplyQuestDispatch: onApplyQuestDispatch,
    onResolveQuestBlocker: onResolveQuestBlocker,
    onAcceptQuest: onAcceptQuest,
    onAbandonQuest: onAbandonQuest,
  });
}
