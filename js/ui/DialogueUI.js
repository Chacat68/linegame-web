// js/ui/DialogueUI.js — 剧情 Feature 兼容组合门面

import { createDialogueModalController } from './DialogueModalController.js';

const _dialogueModalController = createDialogueModalController();

export function init() {
  return _dialogueModalController.init();
}

export function showScene(scene, onComplete) {
  return _dialogueModalController.showScene(scene, onComplete);
}

export function hideScene() {
  return _dialogueModalController.hideScene();
}

export function isOpen() {
  return _dialogueModalController.isOpen();
}

export function destroy() {
  return _dialogueModalController.destroy();
}

export function getDiagnostics() {
  return _dialogueModalController.getDiagnostics();
}
