// js/ui/ArchiveExplorationUI.js — 探索档案 Feature 兼容组合门面

import * as ContextInspector from './ContextInspector.js';
import { createArchiveExplorationController } from './ArchiveExplorationController.js';
import { buildArchiveExplorationView } from './ArchiveExplorationPresenter.js';
import {
  buildArchiveReportContextView,
  buildArchiveReportWorkspaceDetailView,
} from './ArchiveReportDetailPresenter.js';
import { createArchiveExplorationSession } from './ArchiveExplorationSession.js';

const _archiveExplorationSession = createArchiveExplorationSession();
const _archiveExplorationController = createArchiveExplorationController({
  inspectReport: _inspectReport,
});

function _inspectReport(reportId, source) {
  if (!reportId) return;
  ContextInspector.replaceContext({
    type: 'report',
    id: String(reportId),
    workspaceId: 'archive',
    source: source || 'archive-report-card',
    revision: ContextInspector.getCurrentRevision(),
  });
}

export function renderContextInspector(request) {
  var container = request && request.container;
  if (!container) return false;
  var view = buildArchiveReportContextView(request);
  if (!view) return false;
  container.innerHTML = view.html;
  return { title: view.title };
}

export function renderWorkspaceDetail(request) {
  var container = request && request.container;
  if (!container) return false;
  var view = buildArchiveReportWorkspaceDetailView(request);
  if (!view) return false;
  container.innerHTML = view.html;
  return { title: view.title };
}

export function setFocus(systemId, chainId) {
  return _archiveExplorationSession.setFocus(systemId, chainId);
}

export function revealFocus(systemId, chainId) {
  _archiveExplorationSession.setFocus(systemId, chainId);
  return _archiveExplorationController.revealFocus(systemId, chainId);
}

export function getDiagnostics() {
  return Object.freeze({
    focus: _archiveExplorationSession.getFocus(),
    session: _archiveExplorationSession.getDiagnostics(),
    controller: _archiveExplorationController.getDiagnostics(),
  });
}

export function resetRuntimeState() {
  _archiveExplorationController.reset();
  _archiveExplorationSession.reset();
  return getDiagnostics();
}

export function render(state) {
  if (!state) return false;
  var doc = typeof globalThis !== 'undefined' ? globalThis.document : null;
  var container = doc && typeof doc.getElementById === 'function'
    ? doc.getElementById('exploration-archive-list')
    : null;
  if (!container) return false;
  var view = buildArchiveExplorationView({ state: state, focus: _archiveExplorationSession.getFocus() });
  if (!view) return false;
  container.innerHTML = view.html;
  _archiveExplorationController.bind(container);
  return true;
}
