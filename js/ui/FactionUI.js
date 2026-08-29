// js/ui/FactionUI.js — 派系外交 Feature 兼容组合门面

import * as ContextInspector from './ContextInspector.js';
import { createArchiveActionPorts } from './ArchiveCommandAdapter.js';
import { createFactionBoardController } from './FactionBoardController.js';
import { buildFactionBoardView } from './FactionBoardPresenter.js';
import {
  buildFactionContextView,
  buildFactionWorkspaceDetailView,
} from './FactionDetailPresenter.js';

export { getFactionMarketAction } from './FactionBoardPresenter.js';

const _factionBoardController = createFactionBoardController({
  inspectFaction: _inspectFaction,
});

function _inspectFaction(factionId, source) {
  if (!factionId) return;
  ContextInspector.replaceContext({
    type: 'faction',
    id: String(factionId),
    workspaceId: 'archive',
    source: source || 'archive-faction-card',
    revision: ContextInspector.getCurrentRevision(),
  });
}

export function renderContextInspector(request) {
  var container = request && request.container;
  if (!container) return false;
  var view = buildFactionContextView(request);
  if (!view) return false;
  container.innerHTML = view.html;
  return { title: view.title };
}

export function renderWorkspaceDetail(request) {
  var container = request && request.container;
  if (!container) return false;
  var view = buildFactionWorkspaceDetailView(request);
  if (!view) return false;
  container.innerHTML = view.html;
  return { title: view.title };
}

export function getDiagnostics() {
  return Object.freeze({ controller: _factionBoardController.getDiagnostics() });
}

export function resetRuntimeState() {
  _factionBoardController.reset();
  return getDiagnostics();
}

export function render(request) {
  var input = request || {};
  var state = input.state;
  if (!state) return false;
  var doc = globalThis.document || null;
  var container = doc && typeof doc.getElementById === 'function' ? doc.getElementById('faction-list') : null;
  if (!container) return false;
  var view = buildFactionBoardView({ state: state });
  if (!view) return false;
  container.innerHTML = view.html;
  var actionPorts = typeof input.onCommand === 'function'
    ? createArchiveActionPorts(input.onCommand)
    : {};
  _factionBoardController.bind(container, { onOpenFactionMarket: actionPorts.onOpenFactionMarket });
  return true;
}
