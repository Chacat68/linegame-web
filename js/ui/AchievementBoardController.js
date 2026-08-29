// js/ui/AchievementBoardController.js — 成就卡片检查 DOM 委托与释放

function _findTarget(event, selector) {
  var target = event && event.target;
  return target && typeof target.closest === 'function' ? target.closest(selector) : null;
}

export function createAchievementBoardController(options) {
  var config = options || {};
  var activeContainer = null;
  var bindCount = 0;
  var inspectCount = 0;
  var resetCount = 0;
  var lastAchievementId = null;

  function _releaseBindings() {
    if (!activeContainer) return;
    if (activeContainer.onclick === _handleClick) activeContainer.onclick = null;
    if (activeContainer.onkeydown === _handleKeydown) activeContainer.onkeydown = null;
    activeContainer = null;
  }

  function _inspect(achievementId) {
    if (!achievementId || typeof config.inspectAchievement !== 'function') return false;
    inspectCount += 1;
    lastAchievementId = achievementId;
    config.inspectAchievement(achievementId, 'archive-achievement-card');
    return true;
  }

  function _handleClick(event) {
    var card = _findTarget(event, '.ach-card[data-achievement-id]');
    if (card) _inspect(card.dataset.achievementId);
  }

  function _handleKeydown(event) {
    if (!event || (event.key !== 'Enter' && event.key !== ' ')) return;
    var card = _findTarget(event, '.ach-card[data-achievement-id]');
    if (!card) return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    _inspect(card.dataset.achievementId);
  }

  function bind(container) {
    if (!container) return false;
    _releaseBindings();
    activeContainer = container;
    container.onclick = _handleClick;
    container.onkeydown = _handleKeydown;
    bindCount += 1;
    return true;
  }

  function getDiagnostics() {
    return Object.freeze({
      bindCount: bindCount,
      inspectCount: inspectCount,
      resetCount: resetCount,
      lastAchievementId: lastAchievementId,
      active: !!activeContainer,
    });
  }

  function reset() {
    _releaseBindings();
    bindCount = 0;
    inspectCount = 0;
    lastAchievementId = null;
    resetCount += 1;
    return getDiagnostics();
  }

  return Object.freeze({ bind: bind, getDiagnostics: getDiagnostics, reset: reset });
}
