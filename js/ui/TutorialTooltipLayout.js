// js/ui/TutorialTooltipLayout.js — 教程浮层视口定位与监听生命周期

function _clamp(value, min, max) {
  if (max < min) return min;
  return Math.max(min, Math.min(max, value));
}

export function createTutorialTooltipLayout(options) {
  var config = options || {};
  var tooltip = null;
  var target = null;
  var activePosition = 'center';
  var frameId = null;
  var listenersBound = false;
  var positionCount = 0;
  var scheduleCount = 0;
  var disposeCount = 0;

  function _getDocument() {
    return config.document || globalThis.document || null;
  }

  function _getWindow() {
    return config.window || globalThis.window || null;
  }

  function _getViewport() {
    var doc = _getDocument();
    var root = doc && doc.documentElement ? doc.documentElement : {};
    var windowRef = _getWindow() || {};
    var visualViewport = windowRef.visualViewport || null;
    var visualWidth = visualViewport ? Number(visualViewport.width) || 0 : 0;
    var visualHeight = visualViewport ? Number(visualViewport.height) || 0 : 0;
    var width = Math.max(1, visualWidth || Number(root.clientWidth) || Number(windowRef.innerWidth) || 320);
    var height = Math.max(1, visualHeight || Number(root.clientHeight) || Number(windowRef.innerHeight) || 320);
    var left = visualViewport ? Math.max(0, Number(visualViewport.offsetLeft) || 0) : 0;
    var top = visualViewport ? Math.max(0, Number(visualViewport.offsetTop) || 0) : 0;
    return { width: width, height: height, left: left, top: top, right: left + width, bottom: top + height };
  }

  function _getSafeAreaInsets() {
    var doc = _getDocument();
    var getStyle = config.getComputedStyle || globalThis.getComputedStyle;
    if (typeof getStyle !== 'function' || !doc || !doc.documentElement) {
      return { top: 0, right: 0, bottom: 0, left: 0 };
    }
    var rootStyle = getStyle(doc.documentElement);
    function readInset(propertyName) {
      if (!rootStyle || typeof rootStyle.getPropertyValue !== 'function') return 0;
      return Math.max(0, Number.parseFloat(rootStyle.getPropertyValue(propertyName)) || 0);
    }
    return {
      top: readInset('--safe-top'),
      right: readInset('--safe-right'),
      bottom: readInset('--safe-bottom'),
      left: readInset('--safe-left'),
    };
  }

  function _getTooltipSize(availableWidth, availableHeight) {
    var rect = tooltip && typeof tooltip.getBoundingClientRect === 'function' ? tooltip.getBoundingClientRect() : null;
    var measuredWidth = (tooltip && tooltip.offsetWidth) || (rect && rect.width) || 380;
    var measuredHeight = (tooltip && tooltip.offsetHeight) || (rect && rect.height) || 260;
    return {
      width: Math.min(measuredWidth, availableWidth),
      height: Math.min(measuredHeight, availableHeight),
    };
  }

  function _resetPosition() {
    if (!tooltip || !tooltip.style) return;
    tooltip.style.top = '';
    tooltip.style.left = '';
    tooltip.style.right = '';
    tooltip.style.bottom = '';
    tooltip.style.transform = '';
  }

  function position(positionName, targetEl) {
    if (!tooltip) return false;
    activePosition = positionName || 'center';
    target = targetEl || null;
    tooltip.className = 'tutorial-tooltip';
    tooltip.dataset.position = activePosition;
    _resetPosition();

    var viewport = _getViewport();
    var safeArea = _getSafeAreaInsets();
    var margin = viewport.width <= 560 ? 10 : 12;
    var viewportTop = viewport.top + safeArea.top + margin;
    var viewportLeft = viewport.left + safeArea.left + margin;
    var viewportBottom = viewport.bottom - safeArea.bottom - margin;
    var viewportRight = viewport.right - safeArea.right - margin;
    var availableWidth = Math.max(1, viewportRight - viewportLeft);
    var availableHeight = Math.max(1, viewportBottom - viewportTop);
    tooltip.dataset.viewport = viewport.width <= 560 ? 'compact' : 'wide';
    tooltip.style.maxWidth = availableWidth + 'px';
    tooltip.style.maxHeight = availableHeight + 'px';
    positionCount += 1;

    if (activePosition === 'center' || !target || typeof target.getBoundingClientRect !== 'function') {
      tooltip.classList.add('tut-pos-center');
      tooltip.dataset.position = 'center';
      tooltip.style.top = Math.round(viewportTop + (availableHeight / 2)) + 'px';
      tooltip.style.left = Math.round(viewportLeft + (availableWidth / 2)) + 'px';
      tooltip.style.transform = 'translate(-50%, -50%)';
      return true;
    }

    var rect = target.getBoundingClientRect();
    var gap = viewport.width <= 560 ? 8 : 12;
    var tooltipSize = _getTooltipSize(availableWidth, availableHeight);
    var finalPosition = activePosition;
    var top = rect.bottom + gap;
    var left = rect.left + (rect.width / 2) - (tooltipSize.width / 2);

    if (activePosition === 'top') {
      top = rect.top - tooltipSize.height - gap;
    } else if (activePosition === 'left') {
      top = rect.top + (rect.height / 2) - (tooltipSize.height / 2);
      left = rect.left - tooltipSize.width - gap;
    } else if (activePosition === 'right') {
      top = rect.top + (rect.height / 2) - (tooltipSize.height / 2);
      left = rect.right + gap;
    }

    if ((activePosition === 'bottom' && top + tooltipSize.height > viewportBottom) ||
        (activePosition === 'top' && top < viewportTop)) {
      finalPosition = activePosition === 'bottom' ? 'top' : 'bottom';
      top = finalPosition === 'top' ? rect.top - tooltipSize.height - gap : rect.bottom + gap;
      left = rect.left + (rect.width / 2) - (tooltipSize.width / 2);
    } else if ((activePosition === 'right' && left + tooltipSize.width > viewportRight) ||
               (activePosition === 'left' && left < viewportLeft)) {
      finalPosition = activePosition === 'right' ? 'left' : 'right';
      top = rect.top + (rect.height / 2) - (tooltipSize.height / 2);
      left = finalPosition === 'left' ? rect.left - tooltipSize.width - gap : rect.right + gap;
    }

    top = _clamp(top, viewportTop, Math.max(viewportTop, viewportBottom - tooltipSize.height));
    left = _clamp(left, viewportLeft, Math.max(viewportLeft, viewportRight - tooltipSize.width));
    tooltip.classList.add('tut-pos-' + finalPosition);
    tooltip.dataset.position = finalPosition;
    tooltip.style.top = Math.round(top) + 'px';
    tooltip.style.left = Math.round(left) + 'px';
    return true;
  }

  function _schedule() {
    if (!tooltip || tooltip.classList.contains('hidden') || frameId !== null) return;
    var callback = function () {
      frameId = null;
      if (!tooltip || tooltip.classList.contains('hidden')) return;
      position(activePosition, target);
    };
    var requestFrame = config.requestAnimationFrame || globalThis.requestAnimationFrame;
    frameId = typeof requestFrame === 'function'
      ? requestFrame(callback)
      : (config.setTimeout || globalThis.setTimeout)(callback, 16);
    scheduleCount += 1;
  }

  function cancelScheduled() {
    if (frameId === null) return;
    var cancelFrame = config.cancelAnimationFrame || globalThis.cancelAnimationFrame;
    if (typeof cancelFrame === 'function') cancelFrame(frameId);
    else (config.clearTimeout || globalThis.clearTimeout)(frameId);
    frameId = null;
  }

  function _bindListeners() {
    var windowRef = _getWindow();
    if (listenersBound || !windowRef || typeof windowRef.addEventListener !== 'function') return;
    windowRef.addEventListener('resize', _schedule, { passive: true });
    windowRef.addEventListener('scroll', _schedule, { capture: true, passive: true });
    if (windowRef.visualViewport && typeof windowRef.visualViewport.addEventListener === 'function') {
      windowRef.visualViewport.addEventListener('resize', _schedule, { passive: true });
      windowRef.visualViewport.addEventListener('scroll', _schedule, { passive: true });
    }
    listenersBound = true;
  }

  function _unbindListeners() {
    var windowRef = _getWindow();
    if (!listenersBound || !windowRef || typeof windowRef.removeEventListener !== 'function') return;
    windowRef.removeEventListener('resize', _schedule);
    windowRef.removeEventListener('scroll', _schedule, true);
    if (windowRef.visualViewport && typeof windowRef.visualViewport.removeEventListener === 'function') {
      windowRef.visualViewport.removeEventListener('resize', _schedule);
      windowRef.visualViewport.removeEventListener('scroll', _schedule);
    }
    listenersBound = false;
  }

  function bind(tooltipElement) {
    tooltip = tooltipElement || null;
    if (!tooltip) return false;
    _bindListeners();
    return true;
  }

  function dispose() {
    cancelScheduled();
    _unbindListeners();
    tooltip = null;
    target = null;
    activePosition = 'center';
    disposeCount += 1;
  }

  function getDiagnostics() {
    return Object.freeze({
      activePosition: activePosition,
      bound: !!tooltip,
      disposeCount: disposeCount,
      listenersBound: listenersBound,
      positionCount: positionCount,
      scheduleCount: scheduleCount,
      scheduled: frameId !== null,
    });
  }

  return Object.freeze({
    bind: bind,
    cancelScheduled: cancelScheduled,
    dispose: dispose,
    getDiagnostics: getDiagnostics,
    position: position,
  });
}
