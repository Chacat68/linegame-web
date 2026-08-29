// js/core/SettingsManager.js — 设置 Feature 兼容组合门面

import { createSettingsModalController } from '../ui/SettingsModalController.js';
import { loadSettings } from './SettingsCore.js';

export { loadSettings, saveSettings } from './SettingsCore.js';

const _settingsModalController = createSettingsModalController({
  getSettings: loadSettings,
});

export function initSettingsModal(callbacks) {
  return _settingsModalController.bind(callbacks || {});
}

export function showSettingsModal() {
  return _settingsModalController.show();
}

export function hideSettingsModal() {
  return _settingsModalController.hide();
}

export function getDiagnostics() {
  return Object.freeze({ controller: _settingsModalController.getDiagnostics() });
}

export function resetRuntimeState() {
  _settingsModalController.reset();
  return getDiagnostics();
}

export function dispose() {
  _settingsModalController.dispose();
  return getDiagnostics();
}
