// js/ui/ArchiveUI.js — 档案工作区的延迟 Feature 组合与会话生命周期

import * as QuestUiModule from './QuestUI.js';
import * as ArchiveExplorationUiModule from './ArchiveExplorationUI.js';
import * as ResearchUiModule from './ResearchUI.js';
import * as FactionUiModule from './FactionUI.js';
import * as AchievementUiModule from './AchievementUI.js';

export {
  QuestUiModule as QuestUI,
  ArchiveExplorationUiModule as ArchiveExplorationUI,
  ResearchUiModule as ResearchUI,
  FactionUiModule as FactionUI,
  AchievementUiModule as AchievementUI,
};

let _archiveRuntimeResetCount = 0;

function _diagnostics(module) {
  return module && typeof module.getDiagnostics === 'function'
    ? module.getDiagnostics()
    : null;
}

export function getDiagnostics() {
  return Object.freeze({
    quest: _diagnostics(QuestUiModule),
    exploration: _diagnostics(ArchiveExplorationUiModule),
    resetCount: _archiveRuntimeResetCount,
  });
}

export function resetRuntimeState() {
  if (typeof QuestUiModule.resetRuntimeState === 'function') QuestUiModule.resetRuntimeState();
  if (typeof ArchiveExplorationUiModule.resetRuntimeState === 'function') {
    ArchiveExplorationUiModule.resetRuntimeState();
  }
  _archiveRuntimeResetCount += 1;
  return getDiagnostics();
}
