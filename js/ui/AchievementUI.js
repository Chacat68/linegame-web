// js/ui/AchievementUI.js — 成就 Feature 兼容组合门面

import * as ContextInspector from './ContextInspector.js';
import { createAchievementBoardController } from './AchievementBoardController.js';
import { buildAchievementBoardView } from './AchievementBoardPresenter.js';
import {
  buildAchievementContextView,
  buildAchievementWorkspaceDetailView,
} from './AchievementDetailPresenter.js';

const _achievementBoardController = createAchievementBoardController({
  inspectAchievement: _inspectAchievement,
});

function _inspectAchievement(achievementId, source) {
  if (!achievementId) return;
  ContextInspector.replaceContext({
    type: 'achievement',
    id: String(achievementId),
    workspaceId: 'archive',
    source: source || 'archive-achievement-card',
    revision: ContextInspector.getCurrentRevision(),
  });
}

export function renderContextInspector(request) {
  var container = request && request.container;
  if (!container) return false;
  var view = buildAchievementContextView(request);
  if (!view) return false;
  container.innerHTML = view.html;
  return { title: view.title };
}

export function renderWorkspaceDetail(request) {
  var container = request && request.container;
  if (!container) return false;
  var view = buildAchievementWorkspaceDetailView(request);
  if (!view) return false;
  container.innerHTML = view.html;
  return { title: view.title };
}

export function getDiagnostics() {
  return Object.freeze({ controller: _achievementBoardController.getDiagnostics() });
}

export function resetRuntimeState() {
  _achievementBoardController.reset();
  return getDiagnostics();
}

export function render(state) {
  if (!state) return false;
  var doc = globalThis.document || null;
  var container = doc && typeof doc.getElementById === 'function' ? doc.getElementById('achievement-list') : null;
  if (!container) return false;
  var view = buildAchievementBoardView({ state: state });
  if (!view) return false;
  container.innerHTML = view.html;
  _achievementBoardController.bind(container);
  return true;
}
