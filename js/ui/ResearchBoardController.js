// js/ui/ResearchBoardController.js — 科技首页 DOM 委托、队列确认与释放生命周期

function _findTarget(event, selector) {
  var target = event && event.target;
  return target && typeof target.closest === 'function' ? target.closest(selector) : null;
}

function _copyContext(context) {
  return context ? Object.freeze({ hasRecommendation: !!context.researchRecommendation }) : null;
}

export function createResearchBoardController(options) {
  var config = options || {};
  var optionsContainer = null;
  var completedContainer = null;
  var activeContext = null;
  var generation = 0;
  var bindCount = 0;
  var intentCount = 0;
  var confirmationCount = 0;
  var droppedConfirmationCount = 0;
  var resetCount = 0;
  var lastIntent = null;

  function _releaseBindings() {
    if (optionsContainer) {
      if (optionsContainer.onclick === _handleOptionsClick) optionsContainer.onclick = null;
      if (optionsContainer.onkeydown === _handleOptionsKeydown) optionsContainer.onkeydown = null;
    }
    if (completedContainer && completedContainer.onclick === _handleCompletedClick) {
      completedContainer.onclick = null;
    }
    optionsContainer = null;
    completedContainer = null;
  }

  function clearContext() {
    var hadContext = !!activeContext;
    generation += 1;
    _releaseBindings();
    activeContext = null;
    return hadContext;
  }

  function _inspectTechnology(techId, source) {
    if (!techId || typeof config.inspectTechnology !== 'function') return false;
    config.inspectTechnology(techId, source);
    return true;
  }

  function _readBlockerAction(button) {
    return {
      actionId: button.dataset.actionId,
      reasonId: button.dataset.reasonId,
      targetQuestId: button.dataset.targetQuestId,
      targetQuestName: button.dataset.targetQuestName,
      marketWorkspaceId: button.dataset.marketWorkspaceId,
      marketSubworkspaceId: button.dataset.marketSubworkspaceId,
      marketFocusLabel: button.dataset.marketFocusLabel,
      focusTechId: button.dataset.focusTechId,
      focusTechName: button.dataset.focusTechName,
    };
  }

  function _recordIntent(intent) {
    intentCount += 1;
    lastIntent = intent;
  }

  function _handleQueueClear(button) {
    if (!activeContext || typeof activeContext.onClearResearchQueue !== 'function') return;
    _recordIntent('research.queue.clear');
    confirmationCount += 1;
    var confirmationGeneration = generation;
    var queuedCount = Math.max(0, Number(button.dataset.queuedCount) || 0);
    if (typeof config.openConfirmation !== 'function') return;
    config.openConfirmation({
      kicker: '研究队列',
      title: '清空全部待研究项目？',
      message: '正在进行的首个项目会保留，其余未开始项目将从队列移除。',
      confirmLabel: '确认清空队列',
      tone: 'warning',
      details: [
        { label: '队列项目', value: queuedCount + ' 项' },
        { label: '未开始项目', value: '移除并返还积分', tone: 'safe' },
      ],
      onConfirm: function () {
        if (confirmationGeneration !== generation || !activeContext) {
          droppedConfirmationCount += 1;
          return;
        }
        activeContext.onClearResearchQueue();
      },
    });
  }

  function _handleOptionsClick(event) {
    if (!activeContext) return;
    var startButton = _findTarget(event, '.btn-research');
    if (startButton) {
      if (startButton.disabled || typeof activeContext.onStartResearch !== 'function') return;
      var startTechId = startButton.dataset.tech;
      if (!startTechId) {
        var startCard = typeof startButton.closest === 'function' ? startButton.closest('.research-card[data-tech]') : null;
        startTechId = startCard && startCard.dataset.tech;
      }
      if (!startTechId) return;
      _recordIntent('research.start');
      activeContext.onStartResearch(startTechId);
      return;
    }

    var cancelButton = _findTarget(event, '.queue-cancel-btn');
    if (cancelButton) {
      if (typeof activeContext.onCancelQueuedResearch !== 'function') return;
      _recordIntent('research.queue.cancel');
      activeContext.onCancelQueuedResearch(cancelButton.dataset.tech);
      return;
    }

    var upButton = _findTarget(event, '.queue-up-btn');
    if (upButton) {
      if (upButton.disabled || upButton.classList && upButton.classList.contains('disabled') || typeof activeContext.onMoveQueuedResearchUp !== 'function') return;
      _recordIntent('research.queue.up');
      activeContext.onMoveQueuedResearchUp(upButton.dataset.tech);
      return;
    }

    var downButton = _findTarget(event, '.queue-down-btn');
    if (downButton) {
      if (downButton.disabled || downButton.classList && downButton.classList.contains('disabled') || typeof activeContext.onMoveQueuedResearchDown !== 'function') return;
      _recordIntent('research.queue.down');
      activeContext.onMoveQueuedResearchDown(downButton.dataset.tech);
      return;
    }

    var clearButton = _findTarget(event, '.queue-clear-btn');
    if (clearButton) {
      _handleQueueClear(clearButton);
      return;
    }

    var applyButton = _findTarget(event, '.research-route-apply-btn');
    if (applyButton) {
      if (!activeContext.researchRecommendation || typeof activeContext.onApplyResearchDispatch !== 'function') return;
      _recordIntent('research.dispatch.apply');
      activeContext.onApplyResearchDispatch(activeContext.researchRecommendation);
      return;
    }

    var blockerButton = _findTarget(event, '.research-route-blocker-btn');
    if (blockerButton) {
      if (typeof activeContext.onResolveResearchBlocker !== 'function') return;
      _recordIntent('research.blocker.resolve');
      activeContext.onResolveResearchBlocker(_readBlockerAction(blockerButton));
      return;
    }

    var card = _findTarget(event, '.research-card[data-tech]');
    if (!card) return;
    _recordIntent('research.inspect');
    _inspectTechnology(card.dataset.tech, 'archive-research-card');
  }

  function _handleOptionsKeydown(event) {
    if (!event || (event.key !== 'Enter' && event.key !== ' ')) return;
    var card = _findTarget(event, '.research-card[data-tech]');
    if (!card) return;
    if (_findTarget(event, 'button')) return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    _recordIntent('research.inspect');
    _inspectTechnology(card.dataset.tech, 'archive-research-card');
  }

  function _handleCompletedClick(event) {
    if (!activeContext) return;
    var button = _findTarget(event, '[data-completed-tech]');
    if (!button) return;
    _recordIntent('research.completed.inspect');
    _inspectTechnology(button.dataset.completedTech, 'archive-research-completed');
  }

  function bind(request) {
    var input = request || {};
    if (!input.optionsContainer && !input.completedContainer) return false;
    clearContext();
    generation += 1;
    optionsContainer = input.optionsContainer || null;
    completedContainer = input.completedContainer || null;
    activeContext = {
      researchRecommendation: input.researchRecommendation || null,
      onStartResearch: input.onStartResearch,
      onCancelQueuedResearch: input.onCancelQueuedResearch,
      onMoveQueuedResearchUp: input.onMoveQueuedResearchUp,
      onMoveQueuedResearchDown: input.onMoveQueuedResearchDown,
      onClearResearchQueue: input.onClearResearchQueue,
      onApplyResearchDispatch: input.onApplyResearchDispatch,
      onResolveResearchBlocker: input.onResolveResearchBlocker,
    };
    if (optionsContainer) {
      optionsContainer.onclick = _handleOptionsClick;
      optionsContainer.onkeydown = _handleOptionsKeydown;
    }
    if (completedContainer) completedContainer.onclick = _handleCompletedClick;
    bindCount += 1;
    return true;
  }

  function getDiagnostics() {
    return Object.freeze({
      bindCount: bindCount,
      intentCount: intentCount,
      confirmationCount: confirmationCount,
      droppedConfirmationCount: droppedConfirmationCount,
      resetCount: resetCount,
      lastIntent: lastIntent,
      activeContext: _copyContext(activeContext),
    });
  }

  function reset() {
    clearContext();
    bindCount = 0;
    intentCount = 0;
    confirmationCount = 0;
    droppedConfirmationCount = 0;
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
