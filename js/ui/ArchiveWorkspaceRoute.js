// js/ui/ArchiveWorkspaceRoute.js — 档案工作区程序化入口的默认分类选择

import * as Quest from '../systems/quest/QuestSystem.js';
import * as Exploration from '../systems/galaxy/ExplorationSystem.js';

export function resolveDefaultArchiveTab(state) {
  var safeState = state || {};
  var activeQuestCount = Array.isArray(safeState.quests) ? safeState.quests.length : 0;
  var availableQuestCount = 0;
  try {
    availableQuestCount = Quest.getAvailableQuests(safeState).length;
  } catch (error) {
    availableQuestCount = 0;
  }
  if (activeQuestCount > 0 || availableQuestCount > 0) return 'tab-quest';

  try {
    var surveySummary = safeState.currentSystem
      ? Exploration.getSurveySummary(safeState, safeState.currentSystem)
      : null;
    if (surveySummary && surveySummary.reportCount > 0) return 'tab-exploration';
  } catch (error) {
    // 探索数据未初始化时继续选择其它档案分类。
  }

  if ((safeState.currentResearch && safeState.currentResearch.techId)
    || (safeState.researchOptions || []).length > 0) {
    return 'tab-research';
  }
  return 'tab-quest';
}
