// js/ui/QuestBoardPresenter.js — 任务章节指挥台、分诊与生命周期子投影组合

import * as AutoTrade from '../systems/trade/AutoTradeSystem.js';
import * as Quest from '../systems/quest/QuestSystem.js';
import { buildQuestActiveView } from './QuestActivePresenter.js';
import { buildQuestAvailableView } from './QuestAvailablePresenter.js';
import { buildQuestLockedView } from './QuestLockedPresenter.js';
import { escapeQuestHtml, escapeQuestHtmlAttr } from './QuestPresentationSupport.js';
import { getQuestTargetSystems, questHasCurrentSystemTarget } from './QuestRoutePresenter.js';

export { getPreferredAvailableQuest } from './QuestAvailablePresenter.js';

function _getQuestLocalStatus(quest, state) {
  if (!quest) {
    return { label: '待选择', tone: 'idle', detail: '当前没有可展示任务。' };
  }
  var targets = getQuestTargetSystems(quest);
  if (targets.length === 0) {
    return {
      label: '现在就能做',
      tone: 'ready',
      detail: '不需要指定目的地，可在现有贸易或航行节奏中累计进度。',
    };
  }
  if (questHasCurrentSystemTarget(quest, state)) {
    return {
      label: '当前航点命中',
      tone: 'current',
      detail: '当前停靠点就是任务目标，可优先查看这条线。',
    };
  }
  if (targets.length === 1) {
    return {
      label: targets[0].name,
      tone: 'travel',
      detail: '目标星球为 ' + targets[0].name + '，适合在航线规划前先确认燃料与距离。',
    };
  }
  return {
    label: '多目标路线',
    tone: 'travel',
    detail: '包含多个目的地，适合先看路程和燃料，再决定推进顺序。',
  };
}

function _getQuestTriageItems(state, active, sortedAvailable, selectedAvailableQuest) {
  var seen = Object.create(null);
  var candidates = [];
  function pushQuest(quest, sourceLabel, stateLabel) {
    if (!quest || seen[quest.id]) return;
    seen[quest.id] = true;
    candidates.push({
      quest: quest,
      sourceLabel: sourceLabel,
      stateLabel: stateLabel,
      localStatus: _getQuestLocalStatus(quest, state),
    });
  }
  active.filter(function (quest) {
    var status = _getQuestLocalStatus(quest, state);
    return status.tone === 'current' || status.tone === 'ready';
  }).forEach(function (quest) { pushQuest(quest, '进行中', '可推进'); });
  active.forEach(function (quest) { pushQuest(quest, '进行中', '追踪中'); });
  pushQuest(selectedAvailableQuest, '可接取', '待确认');
  sortedAvailable.slice(0, 3).forEach(function (quest) { pushQuest(quest, '可接取', '待接取'); });
  return candidates.slice(0, 3);
}

function _renderQuestTriagePanel(request) {
  var input = request || {};
  var state = input.state;
  var active = input.active;
  var sortedAvailable = input.sortedAvailable;
  var locked = input.locked;
  var currentLocalActive = active.filter(function (quest) {
    var status = _getQuestLocalStatus(quest, state);
    return status.tone === 'current' || status.tone === 'ready';
  });
  var availableLocal = sortedAvailable.filter(function (quest) {
    var status = _getQuestLocalStatus(quest, state);
    return status.tone === 'current' || status.tone === 'ready';
  });
  var timedCount = active.concat(sortedAvailable).filter(function (quest) {
    return (quest.timeLimit || 0) > 0;
  }).length;
  var phase = input.currentPhaseProgress;
  var phaseProgressLabel = phase.total > 0 ? (phase.completed + '/' + phase.total) : '0/0';
  var focusQuest = currentLocalActive[0] || active[0] || input.selectedAvailableQuest || sortedAvailable[0] || null;
  var focusStatus = _getQuestLocalStatus(focusQuest, state);
  var signalTitle = focusQuest ? (focusStatus.label + ' · ' + focusQuest.name) : '等待新委托';
  var signalNote = focusQuest ? focusStatus.detail : '当前没有可追踪任务，等待章节推进或新委托解锁。';
  var triageItems = _getQuestTriageItems(state, active, sortedAvailable, input.selectedAvailableQuest);
  var storyRoute = input.storyRoute;

  return '<section class="quest-triage-panel" aria-label="详细任务状态">' +
    '<div class="quest-triage-grid" role="list" aria-label="任务状态概览">' +
      '<div class="quest-triage-cell quest-triage-cell--active" role="listitem"><span>当前航点</span><strong>' + currentLocalActive.length + '</strong><em>进行中可推进</em></div>' +
      '<div class="quest-triage-cell quest-triage-cell--available" role="listitem"><span>可接取</span><strong>' + availableLocal.length + '/' + sortedAvailable.length + '</strong><em>本地或无目标</em></div>' +
      '<div class="quest-triage-cell quest-triage-cell--timed" role="listitem"><span>限时任务</span><strong>' + timedCount + '</strong><em>注意剩余天数</em></div>' +
      '<div class="quest-triage-cell quest-triage-cell--locked" role="listitem"><span>未解锁</span><strong>' + locked.length + '</strong><em>章节 ' + phaseProgressLabel + '</em></div>' +
    '</div>' +
    '<div class="quest-focus-panel" aria-label="任务处理状态">' +
      '<div class="quest-focus-copy"><span class="quest-focus-kicker">任务状态</span>' +
        '<strong class="quest-focus-title">' + escapeQuestHtml(signalTitle) + '</strong>' +
        '<span class="quest-focus-note">' + escapeQuestHtml(signalNote) + '</span></div>' +
      '<div class="quest-focus-list" role="list" aria-label="重点任务">' +
        (triageItems.length > 0 ? triageItems.map(function (item) {
          var reward = Quest.getQuestRewardSummary(state, item.quest);
          return '<article class="quest-focus-card quest-focus-card--' + escapeQuestHtmlAttr(item.localStatus.tone) + '" role="listitem">' +
            '<span class="quest-focus-state">' + escapeQuestHtml(item.stateLabel) + '</span>' +
            '<span class="quest-focus-main"><strong>' + escapeQuestHtml(item.quest.name) + '</strong>' +
              '<em>' + escapeQuestHtml(item.sourceLabel + ' · ' + item.localStatus.label + ' · ' + reward.credits.toLocaleString() + ' 积分') + '</em></span>' +
          '</article>';
        }).join('') : '<div class="quest-focus-empty" role="listitem">暂无重点任务。</div>') +
      '</div>' +
      '<div class="quest-route-signal" aria-label="长期方向"><span>长期方向</span>' +
        '<strong>' + escapeQuestHtml(storyRoute ? storyRoute.label : '自由贸易路线') + '</strong>' +
        '<em>' + escapeQuestHtml(storyRoute && storyRoute.rewardHint ? storyRoute.rewardHint : '按当前任务池自由推进') + '</em></div>' +
    '</div>' +
  '</section>';
}

export function buildQuestBoardView(request) {
  var input = request || {};
  var state = input.state;
  if (!state) return null;

  var storyRoute = Quest.getStoryRouteProfile(state);
  var active = Quest.getActiveQuests(state);
  var locked = Quest.getLockedQuests(state);
  var availableView = buildQuestAvailableView({
    activeCount: active.length,
    selectedAvailableQuestId: input.selectedAvailableQuestId,
    state: state,
    storyRoute: storyRoute,
  });
  var sortedAvailable = availableView.sortedAvailable;
  var selectedAvailableQuest = availableView.selectedQuest;
  var fallbackQuest = sortedAvailable[0] || null;
  var activeQuestRecommendation = active.length > 0
    ? AutoTrade.findQuestRoute(state, Object.assign({ cargo: state.cargo || {} }, input.questDispatchContext || {}))
    : null;
  var recommendedActiveQuest = activeQuestRecommendation
    ? active.find(function (quest) { return quest.id === activeQuestRecommendation.questId; }) || null
    : null;
  var activeView = buildQuestActiveView({
    active: active,
    activeQuestRecommendation: activeQuestRecommendation,
    canApplyQuestDispatch: input.canApplyQuestDispatch,
    canResolveQuestBlocker: input.canResolveQuestBlocker,
    fallbackQuest: fallbackQuest,
    recommendedActiveQuest: recommendedActiveQuest,
    state: state,
  });

  var phase = Quest.getCurrentQuestPhaseProgress(state);
  var currentPhase = phase.phase;
  var phaseProgressPct = phase.total > 0 ? Math.min(100, phase.percent || 0) : 0;
  var phaseName = currentPhase ? currentPhase.name : '未知章节';
  var phaseDesc = currentPhase ? currentPhase.description : '正在等待新的星际任务。';
  var commandFocusQuest = selectedAvailableQuest || recommendedActiveQuest || active[0] || fallbackQuest;
  var commandFocusLabel = commandFocusQuest
    ? (selectedAvailableQuest ? '建议接取：' : '当前目标：') + commandFocusQuest.name
    : '等待新委托';
  var commandRouteLabel = storyRoute ? storyRoute.label : '自由贸易路线';

  var html = '<section class="quest-command-deck" role="region" aria-label="任务首页">' +
    '<div class="quest-command-visual" aria-hidden="true">' +
      '<span class="quest-command-orbit quest-command-orbit-a"></span>' +
      '<span class="quest-command-orbit quest-command-orbit-b"></span>' +
      '<span class="quest-command-pulse"></span>' +
      '<span class="quest-command-icon">' + escapeQuestHtml(currentPhase ? currentPhase.icon : '📖') + '</span>' +
    '</div>' +
    '<div class="quest-command-copy"><div class="quest-command-kicker">当前章节</div>' +
      '<h2>' + escapeQuestHtml(phaseName) + '</h2><p>' + escapeQuestHtml(phaseDesc) + '</p>' +
      '<div class="quest-command-tags">' +
        (storyRoute ? '<span>长期方向 · ' + escapeQuestHtml(commandRouteLabel) + '</span>' : '') +
        '<span>' + escapeQuestHtml(commandFocusLabel) + '</span></div>' +
    '</div>' +
  '</section>';
  html += '<details class="quest-secondary-details"><summary>查看章节进度与全部任务状态</summary>' +
    '<div class="quest-secondary-details-body">' + _renderQuestTriagePanel({
      active: active,
      currentPhaseProgress: phase,
      locked: locked,
      selectedAvailableQuest: selectedAvailableQuest,
      sortedAvailable: sortedAvailable,
      state: state,
      storyRoute: storyRoute,
    }) +
    '<div class="quest-phase-overview" aria-label="当前章节进度"><div class="quest-phase-chip active" title="' + escapeQuestHtmlAttr(currentPhase ? currentPhase.description : '') + '">' +
      '<span class="phase-icon">' + escapeQuestHtml(currentPhase ? currentPhase.icon : '📖') + '</span>' +
      '<span class="phase-name">当前章节：' + escapeQuestHtml(phaseName) + '</span>' +
      '<span class="phase-bar" role="progressbar" aria-label="章节进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + phaseProgressPct + '">' +
        '<span class="phase-bar-fill" style="width:' + phaseProgressPct + '%"></span></span>' +
      '<span class="phase-progress">主线 ' + phase.coreCompleted + '/' + phase.coreTotal +
        ' · 支线 ' + Math.min(phase.optionalCompleted, phase.optionalRequired) + '/' + phase.optionalRequired + '</span>' +
    '</div></div></div></details>';
  html += activeView.html;
  html += availableView.html;
  html += buildQuestLockedView({ currentPhaseProgress: phase, locked: locked, state: state }).html;

  return Object.freeze({
    activeQuestRecommendation: activeQuestRecommendation,
    html: html,
    selectedAvailableQuestId: availableView.selectedAvailableQuestId,
  });
}
