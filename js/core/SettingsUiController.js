// js/core/SettingsUiController.js — 延迟设置终端与 launcher DOM 生命周期
//
// FeatureRegistry 负责模块加载；本 controller 负责首击 loader、最新 provider
// 回调、会话失效和 fallback hide。GameManager 不再直接管理 DOM listener。

function _noop() {}

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('SettingsUiController requires ' + label + '.');
  return value;
}

export function createSettingsUiController(dependencies) {
  var deps = dependencies || {};
  var features = deps.features || {};
  var callbacks = deps.callbacks || {};
  var getSettings = _requiredFunction(deps.getSettings, 'getSettings');
  var getSessionToken = typeof deps.getSessionToken === 'function'
    ? deps.getSessionToken
    : function () { return null; };
  var isSessionTokenCurrent = typeof deps.isSessionTokenCurrent === 'function'
    ? deps.isSessionTokenCurrent
    : function () { return true; };
  var getDocument = typeof deps.getDocument === 'function'
    ? deps.getDocument
    : function () { return typeof document === 'undefined' ? null : document; };
  var hideFallback = typeof deps.hideFallback === 'function' ? deps.hideFallback : _noop;

  var launcherButton = null;
  var launcherHandler = null;
  var boundModule = null;
  var syncCount = 0;
  var openCount = 0;

  function _getFeature() {
    return typeof features.get === 'function' ? features.get('settings') : null;
  }

  function _loadFeature() {
    return typeof features.load === 'function'
      ? Promise.resolve(features.load('settings'))
      : Promise.resolve(_getFeature());
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
    if (!SettingsUI || typeof SettingsUI.initSettingsModal !== 'function') return false;
    releaseLauncher();
    boundModule = SettingsUI;
    SettingsUI.initSettingsModal({
      getSettings: getSettings,
      onOpen: callbacks.onOpen,
      onCommand: callbacks.onCommand,
    });
    syncCount += 1;
    return true;
  }

  function _showLoaded(SettingsUI, requestedToken) {
    if (!SettingsUI || !isSessionTokenCurrent(requestedToken)) return false;
    if (boundModule !== SettingsUI) sync(SettingsUI);
    if (typeof callbacks.onOpen === 'function') callbacks.onOpen();
    if (typeof SettingsUI.showSettingsModal !== 'function') return false;
    SettingsUI.showSettingsModal();
    openCount += 1;
    return true;
  }

  function bindLauncher() {
    var loaded = _getFeature();
    if (loaded) {
      if (typeof features.sync === 'function') features.sync('settings');
      else sync(loaded);
      return true;
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
      var requestedToken = getSessionToken();
      _loadFeature().then(function (SettingsUI) {
        _showLoaded(SettingsUI, requestedToken);
      });
    };
    if (button.dataset) button.dataset.settingsLoaderBound = 'true';
    button.addEventListener('click', launcherHandler);
    return true;
  }

  function hide() {
    var SettingsUI = _getFeature() || boundModule;
    if (SettingsUI && typeof SettingsUI.hideSettingsModal === 'function') {
      SettingsUI.hideSettingsModal();
      return true;
    }
    hideFallback('settings-modal');
    return false;
  }

  function dispose() {
    releaseLauncher();
    boundModule = null;
  }

  function getDiagnostics() {
    return Object.freeze({
      bound: !!boundModule,
      launcherBound: !!launcherButton,
      openCount: openCount,
      syncCount: syncCount,
    });
  }

  return Object.freeze({
    bindLauncher: bindLauncher,
    dispose: dispose,
    getDiagnostics: getDiagnostics,
    hide: hide,
    releaseLauncher: releaseLauncher,
    sync: sync,
  });
}
