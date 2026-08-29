// js/ui/ArchiveCommandAdapter.js — Archive UI action 到 typed command 的唯一转换边界

import { ARCHIVE_COMMAND, normalizeArchiveCommand } from '../core/ArchiveCommand.js';

function _publish(onCommand, type, payload) {
  if (typeof onCommand !== 'function') return false;
  var command = normalizeArchiveCommand(Object.assign({}, payload || {}, { type: type }));
  return command ? onCommand(command) : false;
}

export function createArchiveActionPorts(onCommand) {
  return Object.freeze({
    onStartResearch: function (techId) {
      return _publish(onCommand, ARCHIVE_COMMAND.START_RESEARCH, { techId: techId });
    },
    onCancelQueuedResearch: function (techId) {
      return _publish(onCommand, ARCHIVE_COMMAND.CANCEL_QUEUED_RESEARCH, { techId: techId });
    },
    onMoveQueuedResearchUp: function (techId) {
      return _publish(onCommand, ARCHIVE_COMMAND.MOVE_QUEUED_RESEARCH_UP, { techId: techId });
    },
    onMoveQueuedResearchDown: function (techId) {
      return _publish(onCommand, ARCHIVE_COMMAND.MOVE_QUEUED_RESEARCH_DOWN, { techId: techId });
    },
    onClearResearchQueue: function () {
      return _publish(onCommand, ARCHIVE_COMMAND.CLEAR_RESEARCH_QUEUE);
    },
    onApplyResearchDispatch: function (recommendation) {
      return _publish(onCommand, ARCHIVE_COMMAND.APPLY_RESEARCH_DISPATCH, { recommendation: recommendation });
    },
    onResolveResearchBlocker: function (action) {
      return _publish(onCommand, ARCHIVE_COMMAND.RESOLVE_RESEARCH_BLOCKER, { action: action });
    },
    onOpenFactionMarket: function (action) {
      return _publish(onCommand, ARCHIVE_COMMAND.OPEN_FACTION_MARKET, { action: action });
    },
    onAcceptQuest: function (questId) {
      return _publish(onCommand, ARCHIVE_COMMAND.ACCEPT_QUEST, { questId: questId });
    },
    onAbandonQuest: function (questId) {
      return _publish(onCommand, ARCHIVE_COMMAND.ABANDON_QUEST, { questId: questId });
    },
    onApplyQuestDispatch: function (recommendation) {
      return _publish(onCommand, ARCHIVE_COMMAND.APPLY_QUEST_DISPATCH, { recommendation: recommendation });
    },
    onResolveQuestBlocker: function (action) {
      return _publish(onCommand, ARCHIVE_COMMAND.RESOLVE_QUEST_BLOCKER, { action: action });
    },
  });
}
