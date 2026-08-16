// js/core/OnboardingUiController.js — 首次进入、教程视图与公司身份入口生命周期
//
// FeatureRegistry 负责延迟模块；controller 负责 latest-session 校验、教程
// 回调、首次进入决策和公司身份入口。GameManager 只注入系统与动作端口。

function _noop() {}

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('OnboardingUiController requires ' + label + '.');
  return value;
}

export function createOnboardingUiController(dependencies) {
  var deps = dependencies || {};
  var features = deps.features || {};
  var callbacks = deps.callbacks || {};
  var Tutorial = deps.Tutorial || {};
  var getState = _requiredFunction(deps.getState, 'getState');
  var getSessionToken = typeof deps.getSessionToken === 'function'
    ? deps.getSessionToken
    : function () { return null; };
  var isSessionTokenCurrent = typeof deps.isSessionTokenCurrent === 'function'
    ? deps.isSessionTokenCurrent
    : function () { return true; };
  var getDocument = typeof deps.getDocument === 'function'
    ? deps.getDocument
    : function () { return typeof document === 'undefined' ? null : document; };

  var companyLauncher = null;
  var companyLauncherHandler = null;
  var boundTutorialView = null;
  var tutorialSyncCount = 0;
  var tutorialStartCount = 0;
  var renameCount = 0;

  function _loadFeature(feature) {
    return typeof features.load === 'function'
      ? Promise.resolve(features.load(feature))
      : Promise.resolve(null);
  }

  function _isCurrent(state, token) {
    return state === getState() && isSessionTokenCurrent(token);
  }

  function _invalidate() {
    if (typeof callbacks.invalidate === 'function') callbacks.invalidate();
  }

  function _refreshActionGuide() {
    if (typeof callbacks.refreshActionGuide === 'function') callbacks.refreshActionGuide();
  }

  function syncTutorialView(TutorialUI) {
    if (!TutorialUI || typeof TutorialUI.init !== 'function') return false;
    boundTutorialView = TutorialUI;
    TutorialUI.init(
      function () {
        if (typeof Tutorial.advance === 'function') Tutorial.advance();
        _invalidate();
      },
      function () {
        if (typeof Tutorial.skip === 'function') Tutorial.skip();
        _invalidate();
      },
      callbacks.onHelperAction
    );
    tutorialSyncCount += 1;
    return true;
  }

  function _startTutorial(state, token) {
    if (!_isCurrent(state, token)) return Promise.resolve(false);
    return _loadFeature('tutorial').then(function (TutorialUI) {
      if (!TutorialUI || !_isCurrent(state, token)) return false;
      if (boundTutorialView !== TutorialUI) syncTutorialView(TutorialUI);
      if (typeof Tutorial.start !== 'function') return false;
      Tutorial.start();
      tutorialStartCount += 1;
      _refreshActionGuide();
      return true;
    });
  }

  function showTutorialStart() {
    var state = getState();
    var token = getSessionToken();
    _refreshActionGuide();
    return _loadFeature('onboarding').then(function (OnboardingUI) {
      if (!OnboardingUI || typeof OnboardingUI.showTutorialStart !== 'function' || !_isCurrent(state, token)) {
        return false;
      }
      var shown = OnboardingUI.showTutorialStart({
        onStart: function () { return _startTutorial(state, token); },
        onSkip: function () {
          if (!_isCurrent(state, token)) return false;
          if (typeof Tutorial.skip === 'function') Tutorial.skip();
          if (typeof callbacks.showWelcomeMessages === 'function') callbacks.showWelcomeMessages();
          _invalidate();
          return true;
        },
      });
      _refreshActionGuide();
      return shown !== false;
    });
  }

  function showCompanyRename() {
    var state = getState();
    var token = getSessionToken();
    _refreshActionGuide();
    return _loadFeature('onboarding').then(function (OnboardingUI) {
      if (!OnboardingUI || typeof OnboardingUI.showCompanyRename !== 'function' || !_isCurrent(state, token)) {
        return false;
      }
      var currentName = state && state.companyName ? state.companyName : '';
      var shown = OnboardingUI.showCompanyRename({
        currentName: currentName,
        fallbackName: currentName || '测试公司',
        onConfirm: function (name) {
          if (!_isCurrent(state, token)) return false;
          if (typeof callbacks.renameCompany === 'function') callbacks.renameCompany(state, name);
          renameCount += 1;
          _invalidate();
          if (typeof callbacks.emitMessage === 'function') {
            callbacks.emitMessage({
              text: '🏢 公司已正式更名为「' + name + '」！愿财富与你同行！',
              type: 'upgrade',
            });
          }
          return true;
        },
        onSkip: _refreshActionGuide,
      });
      _refreshActionGuide();
      return shown !== false;
    });
  }

  function releaseCompanyLauncher() {
    if (companyLauncher && companyLauncherHandler && typeof companyLauncher.removeEventListener === 'function') {
      companyLauncher.removeEventListener('click', companyLauncherHandler);
    }
    if (companyLauncher && companyLauncher.dataset) {
      delete companyLauncher.dataset.onboardingCompanyLauncherBound;
    }
    companyLauncher = null;
    companyLauncherHandler = null;
  }

  function bindCompanyLauncher() {
    var doc = getDocument();
    var button = doc && typeof doc.getElementById === 'function'
      ? doc.getElementById('company-name-display')
      : null;
    if (!button || typeof button.addEventListener !== 'function') return false;
    if (button === companyLauncher && companyLauncherHandler) return true;

    releaseCompanyLauncher();
    companyLauncher = button;
    companyLauncherHandler = function (event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      showCompanyRename();
    };
    if (button.dataset) button.dataset.onboardingCompanyLauncherBound = 'true';
    button.addEventListener('click', companyLauncherHandler);
    return true;
  }

  function dispose() {
    releaseCompanyLauncher();
    boundTutorialView = null;
  }

  function getDiagnostics() {
    return Object.freeze({
      companyLauncherBound: !!companyLauncher,
      renameCount: renameCount,
      tutorialStartCount: tutorialStartCount,
      tutorialSyncCount: tutorialSyncCount,
      tutorialViewBound: !!boundTutorialView,
    });
  }

  return Object.freeze({
    bindCompanyLauncher: bindCompanyLauncher,
    dispose: dispose,
    getDiagnostics: getDiagnostics,
    releaseCompanyLauncher: releaseCompanyLauncher,
    showCompanyRename: showCompanyRename,
    showTutorialStart: showTutorialStart,
    syncTutorialView: syncTutorialView,
  });
}
