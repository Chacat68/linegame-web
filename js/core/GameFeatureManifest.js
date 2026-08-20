// js/core/GameFeatureManifest.js — 游戏延迟功能的唯一声明与失败语义
//
// FeatureRegistry 负责通用状态机；本模块只声明游戏有哪些延迟功能、依赖、
// 动态资源和生命周期 hooks。GameManager 只注入运行时端口，不再持有 import/CSS 表。

import { loadDeferredStylesheet } from './FeatureRegistry.js';

const FEATURE_LABELS = Object.freeze({
  achievement: '成就检查',
  advancedGuidance: '高级经营建议',
  archive: '档案中心',
  commerceRuntime: '高级经营运行时',
  dialogue: '剧情演出',
  fleet: '机库',
  guidanceAction: '行动执行器',
  market: '商业终端',
  onboarding: '首次进入引导',
  randomEvent: '随机事件',
  routeGuidance: '自动跑商建议',
  save: '存档终端',
  settings: '设置终端',
  tutorial: '操作教程',
  victory: '结算终端',
});

export const GAME_FEATURE_NAMES = Object.freeze([
  'commerceRuntime',
  'advancedGuidance',
  'routeGuidance',
  'achievement',
  'dialogue',
  'randomEvent',
  'market',
  'fleet',
  'archive',
  'save',
  'victory',
  'onboarding',
  'tutorial',
  'settings',
  'guidanceAction',
]);

const FLEET_STYLES_URL = new URL('../../css/fleet.css', import.meta.url).href;
const HANGAR_TERMINAL_STYLES_URL = new URL('../../css/hangar-terminal.css', import.meta.url).href;
const ARCHIVE_TERMINAL_STYLES_URL = new URL('../../css/archive-terminal.css', import.meta.url).href;
const MARKET_TERMINAL_STYLES_URL = new URL('../../css/market-terminal.css?v=20260717-marketchart1', import.meta.url).href;

function _call(hooks, name, args) {
  if (!hooks || typeof hooks[name] !== 'function') return undefined;
  return hooks[name].apply(null, args || []);
}

function _developmentFailOnceFeatures() {
  if (typeof globalThis === 'undefined' || !globalThis.location) {
    return new Set();
  }
  var params = new URLSearchParams(globalThis.location.search || '');
  var requested = [];
  params.getAll('featureFailOnce').forEach(function (value) {
    String(value || '').split(',').forEach(function (feature) {
      var normalized = feature.trim();
      if (normalized) requested.push(normalized);
    });
  });
  return new Set(requested.filter(function (feature) {
    return GAME_FEATURE_NAMES.indexOf(feature) !== -1;
  }));
}

function _withDevelopmentFailures(manifest) {
  var pending = _developmentFailOnceFeatures();
  if (!pending.size) return manifest;
  pending.forEach(function (feature) {
    var definition = manifest[feature];
    if (!definition || typeof definition.load !== 'function') return;
    var load = definition.load;
    definition.load = function () {
      if (pending.delete(feature)) {
        return Promise.reject(new Error('[dev] Injected one-time feature failure: ' + feature));
      }
      return load.apply(null, arguments);
    };
  });
  return manifest;
}

export function createGameFeatureFailureReporter(options) {
  var opts = options || {};
  var emitLog = typeof opts.emitLog === 'function' ? opts.emitLog : function () {};
  var reportError = typeof opts.reportError === 'function' ? opts.reportError : function () {};

  return function reportFeatureFailure(feature, error) {
    reportError(feature, error);
    emitLog({
      text: '⚠️ ' + (FEATURE_LABELS[feature] || '功能模块') + '加载失败，请稍后重试。',
      type: 'error',
    });
  };
}

export function createGameFeatureManifest(options) {
  var opts = options || {};
  var hooks = opts.hooks || {};
  var reportFailure = typeof opts.reportFailure === 'function'
    ? opts.reportFailure
    : function () {};
  var loadStylesheet = typeof opts.loadStylesheet === 'function'
    ? opts.loadStylesheet
    : loadDeferredStylesheet;

  function onError(feature, beforeReport) {
    return function (error) {
      if (typeof beforeReport === 'function') beforeReport(error);
      reportFailure(feature, error);
    };
  }

  var manifest = {
    commerceRuntime: {
      load: function () { return import('../systems/commerce/CommerceFacade.js'); },
      sync: function (module, lifecycle) {
        _call(hooks, 'initializeCommerceRuntime', [module, lifecycle.context && lifecycle.context.state]);
      },
      onError: onError('commerceRuntime'),
    },
    advancedGuidance: {
      dependencies: ['commerceRuntime'],
      load: function () { return import('../systems/guidance/AdvancedGuidanceSystem.js'); },
      sync: function (module) {
        _call(hooks, 'setAdvancedGuidanceProvider', [module.getAdvancedGuidanceSuggestions]);
      },
      onError: onError('advancedGuidance'),
    },
    routeGuidance: {
      load: function () { return import('../systems/trade/AutoTradeSystem.js'); },
      sync: function (module) { _call(hooks, 'setQuestRouteResolver', [module.findQuestRoute]); },
      onError: onError('routeGuidance'),
    },
    achievement: {
      load: function () { return import('../systems/achievement/AchievementSystem.js'); },
      sync: function (module, lifecycle) {
        var context = lifecycle.context;
        if (context && context.state) module.init(context.state);
      },
      onError: onError('achievement', function () { _call(hooks, 'resetAchievementRuntime'); }),
    },
    dialogue: {
      load: function () {
        return Promise.all([
          import('../systems/story/DialogueSystem.js'),
          import('../ui/DialogueUI.js'),
        ]).then(function (modules) {
          return { Dialogue: modules[0], DialogueUI: modules[1] };
        });
      },
    },
    randomEvent: {
      load: function () { return import('../systems/event/RandomEvent.js'); },
    },
    market: {
      dependencies: ['commerceRuntime'],
      load: function () {
        return Promise.all([
          import('../ui/MarketUI.js'),
          loadStylesheet('market-terminal', MARKET_TERMINAL_STYLES_URL),
        ]).then(function (results) { return results[0]; });
      },
      dispose: function (module) {
        if (module && typeof module.resetRuntimeState === 'function') module.resetRuntimeState();
      },
      onError: onError('market'),
    },
    fleet: {
      load: function () {
        return Promise.all([
          import('../ui/FleetUI.js'),
          loadStylesheet('fleet-base', FLEET_STYLES_URL),
          loadStylesheet('hangar-terminal', HANGAR_TERMINAL_STYLES_URL),
        ]).then(function (results) { return results[0]; });
      },
      onError: onError('fleet'),
    },
    archive: {
      dependencies: ['achievement'],
      load: function () {
        return Promise.all([
          import('../ui/QuestUI.js'),
          import('../ui/ArchiveExplorationUI.js'),
          import('../ui/ResearchUI.js'),
          import('../ui/FactionUI.js'),
          import('../ui/AchievementUI.js'),
          loadStylesheet('archive-terminal', ARCHIVE_TERMINAL_STYLES_URL),
        ]).then(function (modules) {
          return {
            QuestUI: modules[0],
            ArchiveExplorationUI: modules[1],
            ResearchUI: modules[2],
            FactionUI: modules[3],
            AchievementUI: modules[4],
          };
        });
      },
      initialize: function (ArchiveUI) { _call(hooks, 'syncArchiveView', [ArchiveUI]); },
      onError: onError('archive'),
    },
    save: {
      load: function () { return import('../ui/SaveUI.js'); },
      onError: onError('save'),
    },
    victory: {
      load: function () { return import('../ui/VictoryResultUI.js'); },
      sync: function (module) { _call(hooks, 'syncVictoryView', [module]); },
      onError: onError('victory', function () { _call(hooks, 'handleVictoryLoadFailure'); }),
    },
    onboarding: {
      load: function () { return import('../ui/OnboardingUI.js'); },
      onError: onError('onboarding'),
    },
    tutorial: {
      load: function () { return import('../ui/TutorialUI.js'); },
      sync: function (module) { _call(hooks, 'syncTutorialView', [module]); },
      dispose: function (module) { if (module.destroy) module.destroy(); },
      onError: onError('tutorial'),
    },
    settings: {
      load: function () { return import('./SettingsManager.js'); },
      sync: function (module) { _call(hooks, 'syncSettingsView', [module]); },
      onError: onError('settings'),
    },
    guidanceAction: {
      load: function () { return import('./GuidanceActionController.js'); },
      onError: onError('guidanceAction'),
    },
  };
  if (import.meta.env.DEV) return _withDevelopmentFailures(manifest);
  return manifest;
}
