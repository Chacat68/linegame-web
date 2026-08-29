// js/ui/SaveUI.js — 存档 Feature 兼容组合门面

import { createSaveWorkspaceController } from './SaveWorkspaceController.js';

const _saveWorkspaceController = createSaveWorkspaceController();

export function render(request) {
  return _saveWorkspaceController.render(request);
}

export function getDiagnostics() {
  return Object.freeze({ controller: _saveWorkspaceController.getDiagnostics() });
}

export function resetRuntimeState() {
  _saveWorkspaceController.reset();
  return getDiagnostics();
}
