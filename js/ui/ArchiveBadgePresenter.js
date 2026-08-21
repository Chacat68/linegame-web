// js/ui/ArchiveBadgePresenter.js — 档案分类与主导航待处理角标的纯投影

import * as Faction from '../systems/faction/FactionSystem.js';
import * as Quest from '../systems/quest/QuestSystem.js';
import * as Exploration from '../systems/galaxy/ExplorationSystem.js';

function _resolveDocument(source) {
  if (source && typeof source.getElementById === 'function') return source;
  return typeof document === 'undefined' ? null : document;
}

function _setBadge(element, count, labelPrefix) {
  if (!element) return;
  var value = Math.max(0, Number(count) || 0);
  element.hidden = value <= 0;
  element.textContent = value > 99 ? '99+' : String(value);
  element.title = labelPrefix ? labelPrefix + '：' + value : String(value);
}

export function buildArchiveBadgeSnapshot(state) {
  var safeState = state || {};
  var activeQuestCount = Array.isArray(safeState.quests) ? safeState.quests.length : 0;
  var availableQuestCount = Quest.getAvailableQuests(safeState).length;
  var researchOptionCount = Array.isArray(safeState.researchOptions) ? safeState.researchOptions.length : 0;
  var researchCount = (safeState.currentResearch && safeState.currentResearch.techId ? 1 : 0) + researchOptionCount;
  var factionWatchCount = Faction.getAllRelations(safeState).filter(function (entry) {
    return entry && entry.level && entry.level.id !== 'neutral';
  }).length;
  var achievementUnlockedCount = Array.isArray(safeState.achievements) ? safeState.achievements.length : 0;
  var exploredSystemIds = new Set(Array.isArray(safeState.visitedSystems) ? safeState.visitedSystems : []);
  if (safeState.currentSystem) exploredSystemIds.add(safeState.currentSystem);

  var explorationReportCount = 0;
  var explorationFollowupCount = 0;
  exploredSystemIds.forEach(function (systemId) {
    var summary = Exploration.getSurveySummary(safeState, systemId);
    if (!summary) return;
    explorationReportCount += summary.reportCount || 0;
    explorationFollowupCount += (summary.anomalyChains || []).filter(function (chain) {
      return chain && chain.followupReady && !chain.followupAcknowledged;
    }).length;
  });

  return Object.freeze({
    achievement: achievementUnlockedCount,
    exploration: explorationReportCount,
    faction: factionWatchCount,
    nav: activeQuestCount + availableQuestCount + researchOptionCount + explorationFollowupCount,
    quest: activeQuestCount + availableQuestCount,
    research: researchCount,
  });
}

export function renderArchiveBadges(state, documentSource) {
  var doc = _resolveDocument(documentSource);
  if (!doc) return null;
  var snapshot = buildArchiveBadgeSnapshot(state);
  _setBadge(doc.getElementById('archive-tab-quest-badge'), snapshot.quest, '任务待处理');
  _setBadge(doc.getElementById('archive-tab-exploration-badge'), snapshot.exploration, '已归档探索报告');
  _setBadge(doc.getElementById('archive-tab-research-badge'), snapshot.research, '科技待处理');
  _setBadge(doc.getElementById('archive-tab-faction-badge'), snapshot.faction, '派系关系变化');
  _setBadge(doc.getElementById('archive-tab-achievement-badge'), snapshot.achievement, '已解锁成就');
  _setBadge(doc.getElementById('archive-nav-badge'), snapshot.nav, '档案待处理');
  return snapshot;
}
