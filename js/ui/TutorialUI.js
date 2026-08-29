// js/ui/TutorialUI.js — 教程 Feature 兼容组合门面

import { createTutorialOverlayController } from './TutorialOverlayController.js';

const _tutorialOverlayController = createTutorialOverlayController();

export function init(onAdvance, onSkip, onHelperAction) {
  return _tutorialOverlayController.init(onAdvance, onSkip, onHelperAction);
}

export function show() {
  return _tutorialOverlayController.show();
}

export function hide() {
  return _tutorialOverlayController.hide();
}

export function destroy() {
  return _tutorialOverlayController.destroy();
}

export function getDiagnostics() {
  return _tutorialOverlayController.getDiagnostics();
}
