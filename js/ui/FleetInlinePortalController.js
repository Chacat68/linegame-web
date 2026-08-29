// js/ui/FleetInlinePortalController.js — 机库内联二级界面 DOM、滚动与焦点生命周期

function _resolveDocument(getDocument) {
  if (typeof getDocument === 'function') return getDocument() || null;
  return typeof document !== 'undefined' ? document : null;
}

function _focusElement(target) {
  if (!target || typeof target.focus !== 'function' || target.disabled || target.isConnected === false) return;
  try {
    target.focus({ preventScroll: true });
  } catch (err) {
    target.focus();
  }
}

function _scrollViewport(inlineContainer) {
  if (!inlineContainer || typeof inlineContainer.closest !== 'function') return null;
  return inlineContainer.closest('.workspace-terminal-content');
}

function _setScrollPosition(viewport, top) {
  if (!viewport) return;
  var nextTop = Number.isFinite(top) ? top : 0;
  if (typeof viewport.scrollTo === 'function') {
    try {
      viewport.scrollTo({ top: nextTop, left: 0, behavior: 'auto' });
      return;
    } catch (err) {
      // Older WebViews may only support direct scrollTop assignment.
    }
  }
  viewport.scrollTop = nextTop;
}

export function createFleetInlinePortalController(options) {
  var ports = options || {};
  var clearSurfaceContext = typeof ports.clearSurfaceContext === 'function'
    ? ports.clearSurfaceContext
    : function () {};
  var requestRender = typeof ports.requestRender === 'function'
    ? ports.requestRender
    : function () { return false; };
  var activeModalId = null;
  var currentCleanup = null;
  var openCount = 0;
  var closeCount = 0;

  function _scheduleFocusRestore(selector, fallbackTarget) {
    Promise.resolve().then(function () {
      var documentRef = _resolveDocument(ports.getDocument);
      var target = selector && documentRef && typeof documentRef.querySelector === 'function'
        ? documentRef.querySelector(selector)
        : null;
      _focusElement(target || fallbackTarget);
    });
  }

  function open(modalId, onCloseCallback, optionsRef) {
    var portalOptions = optionsRef || {};
    if (currentCleanup) currentCleanup({ restoreFocus: false });

    var documentRef = _resolveDocument(ports.getDocument);
    if (!documentRef || typeof documentRef.getElementById !== 'function' || typeof documentRef.createElement !== 'function') {
      return false;
    }
    var listContainer = documentRef.getElementById('fleet-list');
    var inlineContainer = documentRef.getElementById('fleet-inline-container');
    var modal = documentRef.getElementById(modalId);
    if (!listContainer || !inlineContainer || !modal) return false;

    var modalBox = typeof modal.querySelector === 'function' ? modal.querySelector('.modal-box') : null;
    if (!modalBox) return false;
    var returnFocusTarget = documentRef.activeElement || null;
    var scrollViewport = _scrollViewport(inlineContainer);
    var returnScrollTop = scrollViewport && Number.isFinite(scrollViewport.scrollTop)
      ? scrollViewport.scrollTop
      : 0;

    activeModalId = modalId;
    listContainer.classList.add('hidden');
    listContainer.setAttribute('aria-hidden', 'true');
    listContainer.inert = true;
    inlineContainer.classList.remove('hidden');
    inlineContainer.setAttribute('aria-hidden', 'false');
    inlineContainer.setAttribute('role', 'region');
    inlineContainer.setAttribute('tabindex', '-1');
    inlineContainer.setAttribute('data-inline-surface', modalId);
    inlineContainer.inert = false;
    if (portalOptions.labelledBy) inlineContainer.setAttribute('aria-labelledby', portalOptions.labelledBy);
    if (portalOptions.describedBy) inlineContainer.setAttribute('aria-describedby', portalOptions.describedBy);
    inlineContainer.innerHTML = '';

    var backBar = documentRef.createElement('div');
    backBar.className = 'inline-portal-back-bar';
    var backButton = documentRef.createElement('button');
    backButton.className = 'inline-portal-back-btn';
    backButton.type = 'button';
    backButton.textContent = '← 返回机库列表';
    backButton.setAttribute('aria-label', '返回机库列表');
    backBar.appendChild(backButton);
    inlineContainer.appendChild(backBar);
    inlineContainer.appendChild(modalBox);
    modalBox.setAttribute('data-surface-mode', 'inline');
    _setScrollPosition(scrollViewport, 0);

    function handlePortalKeydown(event) {
      if (!event || event.key !== 'Escape' || activeModalId !== modalId) return;
      event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
      cleanup();
      requestRender();
    }

    function cleanup(cleanupOptions) {
      if (activeModalId !== modalId) return false;
      var shouldRestoreFocus = !cleanupOptions || cleanupOptions.restoreFocus !== false;
      if (typeof inlineContainer.removeEventListener === 'function') {
        inlineContainer.removeEventListener('keydown', handlePortalKeydown);
      }
      modal.appendChild(modalBox);
      modalBox.removeAttribute('data-surface-mode');
      inlineContainer.classList.add('hidden');
      inlineContainer.setAttribute('aria-hidden', 'true');
      inlineContainer.removeAttribute('role');
      inlineContainer.removeAttribute('tabindex');
      inlineContainer.removeAttribute('aria-labelledby');
      inlineContainer.removeAttribute('aria-describedby');
      inlineContainer.removeAttribute('data-inline-surface');
      inlineContainer.inert = true;
      inlineContainer.innerHTML = '';
      listContainer.classList.remove('hidden');
      listContainer.setAttribute('aria-hidden', 'false');
      listContainer.inert = false;
      _setScrollPosition(scrollViewport, returnScrollTop);
      activeModalId = null;
      currentCleanup = null;
      closeCount += 1;
      clearSurfaceContext(modalId);
      if (typeof onCloseCallback === 'function') onCloseCallback();
      if (shouldRestoreFocus) _scheduleFocusRestore(portalOptions.returnFocusSelector, returnFocusTarget);
      return true;
    }

    currentCleanup = cleanup;
    backButton.onclick = function (event) {
      event.preventDefault();
      cleanup();
      requestRender();
    };
    if (typeof inlineContainer.addEventListener === 'function') {
      inlineContainer.addEventListener('keydown', handlePortalKeydown);
    }
    Promise.resolve().then(function () {
      if (activeModalId !== modalId) return;
      _setScrollPosition(scrollViewport, 0);
      _focusElement(backButton);
    });
    openCount += 1;
    return true;
  }

  function close(modalId, optionsRef) {
    if (activeModalId !== modalId || typeof currentCleanup !== 'function') return false;
    return currentCleanup(optionsRef);
  }

  function closeActive(optionsRef) {
    return activeModalId ? close(activeModalId, optionsRef) : false;
  }

  function getDiagnostics() {
    return Object.freeze({
      activeModalId: activeModalId,
      closeCount: closeCount,
      openCount: openCount,
    });
  }

  return Object.freeze({
    close: close,
    closeActive: closeActive,
    getActiveModalId: function () { return activeModalId; },
    getDiagnostics: getDiagnostics,
    open: open,
  });
}
