// js/ui/QuestUI.js — 任务面板 UI（支持进度阶段与解锁条件）
// 依赖：systems/quest/QuestSystem.js, data/quests.js
// 导出：render

import * as ActionConfirmUI from './ActionConfirmUI.js';
import * as ContextInspector from './ContextInspector.js';
import { createArchiveActionPorts } from './ArchiveCommandAdapter.js';
import { createQuestWorkspaceSession } from './QuestWorkspaceSession.js';
import { createQuestBoardController } from './QuestBoardController.js';
import { buildQuestBoardView } from './QuestBoardPresenter.js';
import { buildQuestContextView, buildQuestWorkspaceDetailView } from './QuestDetailPresenter.js';

export { getQuestBlockerActions } from './QuestRoutePresenter.js';
export { getPreferredAvailableQuest } from './QuestAvailablePresenter.js';

const _questSession = createQuestWorkspaceSession();
const _questBoardController = createQuestBoardController({
  inspectQuest: _inspectQuest,
  openConfirmation: function (options) { return ActionConfirmUI.open(options); },
  session: _questSession,
});


function _inspectQuest(questId, source) {
  if (!questId) return;
  ContextInspector.replaceContext({
    type: 'quest',
    id: String(questId),
    workspaceId: 'archive',
    source: source || 'archive-quest',
    revision: ContextInspector.getCurrentRevision(),
  });
}

export function renderContextInspector(request) {
  var container = request && request.container;
  if (!container) return false;
  var view = buildQuestContextView(request);
  if (!view) return false;
  container.innerHTML = view.html;
  return { title: view.title };
}

export function renderWorkspaceDetail(request) {
  var container = request && request.container;
  if (!container) return false;
  var view = buildQuestWorkspaceDetailView(request);
  if (!view) return false;
  container.innerHTML = view.html;
  return { title: view.title };
}


export function setSelectedAvailableQuest(questId) {
  return _questSession.setSelectedAvailableQuest(questId);
}

export function getDiagnostics() {
  return Object.freeze({
    selectedAvailableQuestId: _questSession.getSelectedAvailableQuest(),
    session: _questSession.getDiagnostics(),
    controller: _questBoardController.getDiagnostics(),
  });
}

export function resetRuntimeState() {
  _questSession.reset();
  _questBoardController.reset();
  return getDiagnostics();
}


export function render(request) {
  var input = request || {};
  var state = input.state;
  var doc = globalThis.document || null;
  var container = doc && doc.getElementById('quest-list');
  if (!container || !state) return false;
  var canPublishCommand = typeof input.onCommand === 'function';
  var actionPorts = canPublishCommand ? createArchiveActionPorts(input.onCommand) : {};
  var view = buildQuestBoardView({
    state: state,
    selectedAvailableQuestId: _questSession.getSelectedAvailableQuest(),
    questDispatchContext: input.dispatchContext,
    canApplyQuestDispatch: canPublishCommand,
    canResolveQuestBlocker: canPublishCommand,
  });
  if (!view) return false;
  _questSession.setSelectedAvailableQuest(view.selectedAvailableQuestId);
  container.innerHTML = view.html;
  _questBoardController.bind(container, {
    state: state,
    activeQuestRecommendation: view.activeQuestRecommendation,
    onAccept: actionPorts.onAcceptQuest,
    onAbandon: actionPorts.onAbandonQuest,
    onApplyQuestDispatch: actionPorts.onApplyQuestDispatch,
    onResolveQuestBlocker: actionPorts.onResolveQuestBlocker,
    onRequestRender: function () {
      render(input);
    },
  });
  return true;
}
