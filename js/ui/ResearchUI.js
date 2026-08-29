// js/ui/ResearchUI.js — 科技研究 Feature 兼容组合门面

import * as ActionConfirmUI from './ActionConfirmUI.js';
import * as ContextInspector from './ContextInspector.js';
import { createArchiveActionPorts } from './ArchiveCommandAdapter.js';
import { createResearchBoardController } from './ResearchBoardController.js';
import { buildResearchBoardView } from './ResearchBoardPresenter.js';
import {
  buildResearchContextView,
  buildResearchWorkspaceDetailView,
} from './ResearchDetailPresenter.js';

export { getResearchDispatchBlockerState } from './ResearchGuidance.js';
export { getResearchDispatchBlockerActions } from './ResearchDispatchPresenter.js';

const _researchBoardController = createResearchBoardController({
  inspectTechnology: _inspectTechnology,
  openConfirmation: function (options) { return ActionConfirmUI.open(options); },
});

function _inspectTechnology(techId, source) {
  if (!techId) return;
  ContextInspector.replaceContext({
    type: 'technology',
    id: String(techId),
    workspaceId: 'archive',
    source: source || 'archive-technology',
    revision: ContextInspector.getCurrentRevision(),
  });
}

export function renderContextInspector(request) {
  var container = request && request.container;
  if (!container) return false;
  var view = buildResearchContextView(request);
  if (!view) return false;
  container.innerHTML = view.html;
  return { title: view.title };
}

export function renderWorkspaceDetail(request) {
  var container = request && request.container;
  if (!container) return false;
  var view = buildResearchWorkspaceDetailView(request);
  if (!view) return false;
  container.innerHTML = view.html;
  return { title: view.title };
}

export function getDiagnostics() {
  return Object.freeze({
    controller: _researchBoardController.getDiagnostics(),
  });
}

export function resetRuntimeState() {
  _researchBoardController.reset();
  return getDiagnostics();
}

export function render(request) {
  var input = request || {};
  var state = input.state;
  if (!state) return false;
  var doc = globalThis.document || null;
  if (!doc || typeof doc.getElementById !== 'function') return false;
  var statusContainer = doc.getElementById('research-status');
  var optionsContainer = doc.getElementById('research-options');
  var completedContainer = doc.getElementById('research-completed');
  if (!statusContainer && !optionsContainer && !completedContainer) return false;
  var canPublishCommand = typeof input.onCommand === 'function';
  var actionPorts = canPublishCommand ? createArchiveActionPorts(input.onCommand) : {};

  var view = buildResearchBoardView({
    state: state,
    researchDispatchContext: input.dispatchContext,
    canApplyResearchDispatch: canPublishCommand,
    canResolveResearchBlocker: canPublishCommand,
  });
  if (!view) return false;

  if (statusContainer) statusContainer.innerHTML = view.statusHtml;
  if (optionsContainer) optionsContainer.innerHTML = view.optionsHtml;
  if (completedContainer) completedContainer.innerHTML = view.completedHtml;
  _researchBoardController.bind({
    optionsContainer: optionsContainer,
    completedContainer: completedContainer,
    researchRecommendation: view.researchRecommendation,
    onStartResearch: actionPorts.onStartResearch,
    onCancelQueuedResearch: actionPorts.onCancelQueuedResearch,
    onMoveQueuedResearchUp: actionPorts.onMoveQueuedResearchUp,
    onMoveQueuedResearchDown: actionPorts.onMoveQueuedResearchDown,
    onClearResearchQueue: actionPorts.onClearResearchQueue,
    onApplyResearchDispatch: actionPorts.onApplyResearchDispatch,
    onResolveResearchBlocker: actionPorts.onResolveResearchBlocker,
  });
  return true;
}
