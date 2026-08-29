// js/ui/QuestBoardController.js — 任务首页 DOM 委托、危险确认与焦点协调

function _findTarget(event, selector) {
  var target = event && event.target;
  return target && typeof target.closest === 'function' ? target.closest(selector) : null;
}

function _copyContext(context) {
  return context ? Object.freeze(Object.assign({}, context)) : null;
}

export function createQuestBoardController(options) {
  var config = options || {};
  var activeContainer = null;
  var activeContext = null;
  var generation = 0;
  var bindCount = 0;
  var intentCount = 0;
  var confirmationCount = 0;
  var droppedConfirmationCount = 0;
  var focusRequestCount = 0;
  var focusSuccessCount = 0;
  var resetCount = 0;
  var lastIntent = null;

  function _releaseBindings() {
    if (!activeContainer) return;
    if (activeContainer.onclick === _handleClick) activeContainer.onclick = null;
    if (activeContainer.onkeydown === _handleKeydown) activeContainer.onkeydown = null;
    activeContainer = null;
  }

  function clearContext() {
    var hadContext = !!activeContext;
    generation += 1;
    _releaseBindings();
    activeContext = null;
    return hadContext;
  }

  function _requestRender() {
    if (!activeContext || typeof activeContext.onRequestRender !== 'function') return false;
    activeContext.onRequestRender();
    return true;
  }

  function _inspectQuest(questId, source) {
    if (!questId || typeof config.inspectQuest !== 'function') return false;
    config.inspectQuest(questId, source);
    return true;
  }

  function _focusFallback(action) {
    if (!activeContext || !action.targetQuestId || !config.session) return false;
    config.session.setSelectedAvailableQuest(action.targetQuestId);
    _requestRender();
    var container = activeContainer;
    if (!container || typeof container.querySelector !== 'function') return false;
    focusRequestCount += 1;
    var acceptHub = container.querySelector('[data-quest-accept-hub]');
    if (acceptHub && typeof acceptHub.scrollIntoView === 'function') {
      acceptHub.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    var selectedCard = container.querySelector('[data-quest-select-id="' + action.targetQuestId + '"]');
    if (!selectedCard) return false;
    if (typeof selectedCard.scrollIntoView === 'function') {
      selectedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (typeof selectedCard.focus === 'function') {
      selectedCard.focus();
      focusSuccessCount += 1;
    }
    return true;
  }

  function _readBlockerAction(button) {
    return {
      actionId: button.dataset.actionId,
      reasonId: button.dataset.reasonId,
      questId: button.dataset.questId,
      questName: button.dataset.questName,
      targetQuestId: button.dataset.targetQuestId,
      targetQuestName: button.dataset.targetQuestName,
      marketWorkspaceId: button.dataset.marketWorkspaceId,
      marketSubworkspaceId: button.dataset.marketSubworkspaceId,
      marketFocusLabel: button.dataset.marketFocusLabel,
    };
  }

  function _handleClick(event) {
    if (!activeContext) return;
    var selectButton = _findTarget(event, '[data-quest-select-id]');
    if (selectButton) {
      intentCount += 1;
      lastIntent = 'quest.select';
      var selectedQuestId = config.session
        ? config.session.setSelectedAvailableQuest(selectButton.dataset.questSelectId)
        : selectButton.dataset.questSelectId;
      _inspectQuest(selectedQuestId, 'archive-quest-picker');
      _requestRender();
      return;
    }

    var acceptButton = _findTarget(event, '.quest-accept-btn');
    if (acceptButton) {
      if (acceptButton.disabled) return;
      intentCount += 1;
      lastIntent = 'quest.accept';
      if (typeof activeContext.onAccept === 'function') activeContext.onAccept(acceptButton.dataset.id);
      return;
    }

    var abandonButton = _findTarget(event, '.quest-abandon-btn');
    if (abandonButton) {
      intentCount += 1;
      confirmationCount += 1;
      lastIntent = 'quest.abandon';
      var confirmationGeneration = generation;
      if (typeof config.openConfirmation !== 'function') return;
      config.openConfirmation({
        kicker: '任务终止',
        title: '放弃「' + (abandonButton.dataset.name || '当前任务') + '」？',
        message: '当前任务进度会被移除，需要重新接取后才能继续推进。',
        confirmLabel: '确认放弃任务',
        details: [
          { label: '当前进度', value: '全部丢失', tone: 'danger' },
          { label: '后续处理', value: '可在条件允许时重新接取' },
        ],
        onConfirm: function () {
          if (confirmationGeneration !== generation || !activeContext) {
            droppedConfirmationCount += 1;
            return;
          }
          if (typeof activeContext.onAbandon === 'function') activeContext.onAbandon(abandonButton.dataset.id);
        },
      });
      return;
    }

    var dispatchButton = _findTarget(event, '.quest-dispatch-apply-btn');
    if (dispatchButton && activeContext.activeQuestRecommendation) {
      intentCount += 1;
      lastIntent = 'quest.dispatch.apply';
      if (typeof activeContext.onApplyQuestDispatch === 'function') {
        activeContext.onApplyQuestDispatch(activeContext.activeQuestRecommendation);
      }
      return;
    }

    var blockerButton = _findTarget(event, '.quest-dispatch-blocker-btn');
    if (blockerButton) {
      intentCount += 1;
      lastIntent = 'quest.blocker.resolve';
      var action = _readBlockerAction(blockerButton);
      if (action.actionId === 'quest-focus') _focusFallback(action);
      if (activeContext && typeof activeContext.onResolveQuestBlocker === 'function') {
        activeContext.onResolveQuestBlocker(action);
      }
      return;
    }

    var questCard = _findTarget(event, '.quest-card[data-quest-id]');
    if (!questCard) return;
    intentCount += 1;
    lastIntent = 'quest.inspect';
    _inspectQuest(questCard.dataset.questId, 'archive-quest-card');
  }

  function _handleKeydown(event) {
    if (!event || (event.key !== 'Enter' && event.key !== ' ')) return;
    var questCard = _findTarget(event, '.quest-card[data-quest-id]');
    if (!questCard) return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    intentCount += 1;
    lastIntent = 'quest.inspect';
    _inspectQuest(questCard.dataset.questId, 'archive-quest-card');
  }

  function bind(container, request) {
    var input = request || {};
    if (!container || !input.state) return false;
    clearContext();
    generation += 1;
    activeContainer = container;
    activeContext = {
      activeQuestId: input.activeQuestRecommendation && input.activeQuestRecommendation.questId
        ? input.activeQuestRecommendation.questId
        : null,
      activeQuestRecommendation: input.activeQuestRecommendation || null,
      onAccept: input.onAccept,
      onAbandon: input.onAbandon,
      onApplyQuestDispatch: input.onApplyQuestDispatch,
      onResolveQuestBlocker: input.onResolveQuestBlocker,
      onRequestRender: input.onRequestRender,
    };
    container.onclick = _handleClick;
    container.onkeydown = _handleKeydown;
    bindCount += 1;
    return true;
  }

  function getDiagnostics() {
    return Object.freeze({
      bindCount: bindCount,
      intentCount: intentCount,
      confirmationCount: confirmationCount,
      droppedConfirmationCount: droppedConfirmationCount,
      focusRequestCount: focusRequestCount,
      focusSuccessCount: focusSuccessCount,
      resetCount: resetCount,
      lastIntent: lastIntent,
      activeContext: _copyContext(activeContext && { activeQuestId: activeContext.activeQuestId }),
    });
  }

  function reset() {
    clearContext();
    bindCount = 0;
    intentCount = 0;
    confirmationCount = 0;
    droppedConfirmationCount = 0;
    focusRequestCount = 0;
    focusSuccessCount = 0;
    lastIntent = null;
    resetCount += 1;
    return getDiagnostics();
  }

  return Object.freeze({
    bind: bind,
    clearContext: clearContext,
    getDiagnostics: getDiagnostics,
    reset: reset,
  });
}
