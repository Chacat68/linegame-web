// js/ui/QuestWorkspaceSession.js — 档案任务候选焦点的纯会话状态

function _normalizeQuestId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function createQuestWorkspaceSession() {
  var selectedAvailableQuestId = null;
  var selectionCount = 0;
  var resetCount = 0;

  function getDiagnostics() {
    return Object.freeze({
      selectedAvailableQuestId: selectedAvailableQuestId,
      selectionCount: selectionCount,
      resetCount: resetCount,
    });
  }

  return Object.freeze({
    getDiagnostics: getDiagnostics,
    getSelectedAvailableQuest: function () {
      return selectedAvailableQuestId;
    },
    reset: function () {
      selectedAvailableQuestId = null;
      selectionCount = 0;
      resetCount += 1;
      return getDiagnostics();
    },
    setSelectedAvailableQuest: function (questId) {
      var nextQuestId = _normalizeQuestId(questId);
      if (nextQuestId !== selectedAvailableQuestId) selectionCount += 1;
      selectedAvailableQuestId = nextQuestId;
      return selectedAvailableQuestId;
    },
  });
}
