// js/core/SettingsUiController.js — 延迟设置终端与 launcher DOM 生命周期
//
// FeatureRegistry 负责模块加载；本 controller 负责首击 loader、统一状态呈现、
// 最新 provider 回调和会话失效。入口不再保留第二套 Settings fallback 逻辑。

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('SettingsUiController requires ' + label + '.');
  return value;
}

export function createSettingsUiController(dependencies) {
  var deps = dependencies || {};
  var features = deps.features || {};
  var callbacks = deps.callbacks || {};
  var featureStatus = deps.featureStatus || {};
  var getSettings = _requiredFunction(deps.getSettings, 'getSettings');
  var bindStatusSurfaceDismiss = _requiredFunction(
    deps.bindStatusSurfaceDismiss,
    'bindStatusSurfaceDismiss'
  );
  var showStatusSurface = _requiredFunction(deps.showStatusSurface, 'showStatusSurface');
  var hideSurface = _requiredFunction(deps.hideSurface, 'hideSurface');
  var getSessionToken = typeof deps.getSessionToken === 'function'
    ? deps.getSessionToken
    : function () { return null; };
  var isSessionTokenCurrent = typeof deps.isSessionTokenCurrent === 'function'
    ? deps.isSessionTokenCurrent
    : function () { return true; };
  var getDocument = typeof deps.getDocument === 'function'
    ? deps.getDocument
    : function () { return typeof document === 'undefined' ? null : document; };

  var launcherButton = null;
  var launcherHandler = null;
  var boundModule = null;
  var openPromise = null;
  var loadState = 'idle';
  var loadAttempts = 0;
  var loadFailures = 0;
  var syncCount = 0;
  var openCount = 0;
  var generation = 0;
  var disposed = false;

  function _getFeature() {
    return typeof features.get === 'function' ? features.get('settings') : null;
  }

  function _loadFeature() {
    return Promise.resolve().then(function () {
      return typeof features.load === 'function'
        ? features.load('settings')
        : _getFeature();
    });
  }

  function _showLoadingStatus() {
    if (typeof featureStatus.showLoading === 'function') featureStatus.showLoading('settings');
    showStatusSurface();
  }

  function _clearStatus(shouldHideSurface) {
    if (typeof featureStatus.clear === 'function') featureStatus.clear('settings');
    if (shouldHideSurface) hideSurface();
  }

  function _showLoadError() {
    loadState = 'error';
    loadFailures += 1;
    if (typeof featureStatus.showError === 'function') {
      featureStatus.showError('settings', open, hide);
    }
    showStatusSurface();
    return false;
  }

  function releaseLauncher() {
    if (launcherButton && launcherHandler && typeof launcherButton.removeEventListener === 'function') {
      launcherButton.removeEventListener('click', launcherHandler);
    }
    if (launcherButton && launcherButton.dataset) {
      delete launcherButton.dataset.settingsLoaderBound;
    }
    launcherButton = null;
    launcherHandler = null;
  }

  function sync(SettingsUI) {
    if (disposed) return false;
    if (!SettingsUI || typeof SettingsUI.initSettingsModal !== 'function') return false;
    releaseLauncher();
    boundModule = SettingsUI;
    SettingsUI.initSettingsModal({
      getSettings: getSettings,
      onOpen: callbacks.onOpen,
      onCommand: callbacks.onCommand,
    });
    loadState = 'ready';
    if (typeof featureStatus.clear === 'function') featureStatus.clear('settings');
    syncCount += 1;
    return true;
  }

  function _showLoaded(SettingsUI, requestedToken) {
    if (disposed || !SettingsUI || !isSessionTokenCurrent(requestedToken)) return false;
    if (boundModule !== SettingsUI) sync(SettingsUI);
    if (typeof SettingsUI.showSettingsModal !== 'function') return false;
    if (typeof callbacks.onOpen === 'function') callbacks.onOpen();
    SettingsUI.showSettingsModal();
    loadState = 'ready';
    openCount += 1;
    return true;
  }

  function _trackOpenPromise(promise) {
    var tracked = Promise.resolve(promise).finally(function () {
      if (openPromise === tracked) openPromise = null;
    });
    openPromise = tracked;
    return tracked;
  }

  function _abandonRequest(requestedGeneration, requestedToken) {
    if (requestedGeneration !== generation) return true;
    if (isSessionTokenCurrent(requestedToken)) return false;
    loadState = boundModule ? 'ready' : 'idle';
    _clearStatus(true);
    return true;
  }

  function open() {
    if (disposed) return Promise.resolve(false);
    if (openPromise) return openPromise;
    var loaded = _getFeature();
    var requestedToken = getSessionToken();
    var requestedGeneration = generation;
    if (loaded) {
      return _trackOpenPromise(Promise.resolve()
        .then(function () {
          if (_abandonRequest(requestedGeneration, requestedToken)) return false;
          if (typeof features.sync === 'function') features.sync('settings');
          else sync(loaded);
          return _showLoaded(loaded, requestedToken) || _showLoadError();
        })
        .catch(function () {
          return _abandonRequest(requestedGeneration, requestedToken) ? false : _showLoadError();
        }));
    }

    loadState = 'loading';
    loadAttempts += 1;
    _showLoadingStatus();
    return _trackOpenPromise(_loadFeature()
      .then(function (SettingsUI) {
        if (_abandonRequest(requestedGeneration, requestedToken)) return false;
        if (!SettingsUI || !_showLoaded(SettingsUI, requestedToken)) return _showLoadError();
        _clearStatus(false);
        return true;
      })
      .catch(function () {
        return _abandonRequest(requestedGeneration, requestedToken) ? false : _showLoadError();
      }));
  }

  function bindLauncher() {
    if (disposed) return false;
    bindStatusSurfaceDismiss(hide);
    var loaded = _getFeature();
    if (loaded) {
      try {
        if (typeof features.sync === 'function') features.sync('settings');
        else sync(loaded);
        return true;
      } catch (error) {
        _showLoadError();
        return false;
      }
    }

    var doc = getDocument();
    var button = doc && typeof doc.getElementById === 'function'
      ? doc.getElementById('settings-btn')
      : null;
    if (!button || typeof button.addEventListener !== 'function') return false;
    if (button.dataset && button.dataset.settingsLoaderBound === 'true') return true;

    releaseLauncher();
    launcherButton = button;
    launcherHandler = function (event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      return open();
    };
    if (button.dataset) button.dataset.settingsLoaderBound = 'true';
    button.addEventListener('click', launcherHandler);
    return true;
  }

  function hide() {
    var SettingsUI = _getFeature() || boundModule;
    if (typeof featureStatus.clear === 'function') featureStatus.clear('settings');
    if (SettingsUI && typeof SettingsUI.hideSettingsModal === 'function') {
      SettingsUI.hideSettingsModal();
      return true;
    }
    hideSurface();
    return true;
  }

  function reset() {
    generation += 1;
    openPromise = null;
    _clearStatus(true);
    loadState = boundModule ? 'ready' : 'idle';
    return getDiagnostics();
  }

  function dispose() {
    reset();
    releaseLauncher();
    boundModule = null;
    loadState = 'idle';
    disposed = true;
  }

  function getDiagnostics() {
    return Object.freeze({
      bound: !!boundModule,
      disposed: disposed,
      launcherBound: !!launcherButton,
      loadAttempts: loadAttempts,
      loadFailures: loadFailures,
      loadState: loadState,
      openCount: openCount,
      pending: !!openPromise,
      syncCount: syncCount,
    });
  }

  return Object.freeze({
    bindLauncher: bindLauncher,
    dispose: dispose,
    getDiagnostics: getDiagnostics,
    hide: hide,
    open: open,
    releaseLauncher: releaseLauncher,
    reset: reset,
    sync: sync,
  });
}
