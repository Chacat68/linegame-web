import { describe, expect, it, vi } from 'vitest';
import {
  GAME_FEATURE_NAMES,
  createGameFeatureFailureReporter,
  createGameFeatureManifest,
} from '../js/core/GameFeatureManifest.js';

describe('GameFeatureManifest', function () {
  it('声明全部延迟功能及唯一依赖拓扑', function () {
    var manifest = createGameFeatureManifest();

    expect(Object.keys(manifest)).toEqual(GAME_FEATURE_NAMES);
    expect(manifest.market.dependencies).toEqual(['commerceRuntime']);
    expect(manifest.advancedGuidance.dependencies).toEqual(['commerceRuntime']);
    expect(manifest.archive.dependencies).toEqual(['achievement']);
    GAME_FEATURE_NAMES.forEach(function (feature) {
      expect(manifest[feature]).toEqual(expect.objectContaining({ load: expect.any(Function) }));
    });
  });

  it('开发查询参数只让指定功能失败一次，随后沿原加载器恢复', async function () {
    var originalLocation = globalThis.location;
    globalThis.location = { search: '?featureFailOnce=market,unknown' };
    try {
      var styles = [];
      var manifest = createGameFeatureManifest({
        loadStylesheet: function (feature) {
          styles.push(feature);
          return Promise.resolve(feature);
        },
      });

      await expect(manifest.market.load()).rejects.toThrow('Injected one-time feature failure: market');
      await expect(manifest.market.load()).resolves.toBeTruthy();
      expect(styles).toEqual(['market-terminal']);
    } finally {
      if (typeof originalLocation === 'undefined') delete globalThis.location;
      else globalThis.location = originalLocation;
    }
  });

  it('把 Feature 生命周期同步到注入端口，不在 manifest 缓存 state', function () {
    var trace = [];
    var state = { id: 'current-state' };
    var provider = vi.fn();
    var resolver = vi.fn();
    var archiveUi = { id: 'archive-ui', resetRuntimeState: vi.fn() };
    var victoryUi = { id: 'victory-ui' };
    var tutorialUi = { destroy: vi.fn() };
    var dialogueUi = { destroy: vi.fn() };
    var marketUi = { resetRuntimeState: vi.fn() };
    var fleetUi = { resetRuntimeState: vi.fn() };
    var saveUi = { resetRuntimeState: vi.fn() };
    var settingsUi = { id: 'settings-ui', dispose: vi.fn() };
    var achievement = { init: vi.fn() };
    var manifest = createGameFeatureManifest({
      hooks: {
        initializeCommerceRuntime: function (module, currentState) {
          trace.push(['commerce', module.id, currentState.id]);
        },
        setAdvancedGuidanceProvider: function (value) { trace.push(['guidance', value]); },
        setQuestRouteResolver: function (value) { trace.push(['route', value]); },
        syncArchiveView: function (module) { trace.push(['archive', module]); },
        syncVictoryView: function (module) { trace.push(['victory', module]); },
        syncTutorialView: function (module) { trace.push(['tutorial', module]); },
        syncSettingsView: function (module) { trace.push(['settings', module]); },
      },
    });

    manifest.commerceRuntime.sync({ id: 'commerce' }, { context: { state: state } });
    manifest.advancedGuidance.sync({ getAdvancedGuidanceSuggestions: provider });
    manifest.routeGuidance.sync({ findQuestRoute: resolver });
    manifest.achievement.sync(achievement, { context: { state: state } });
    manifest.archive.initialize(archiveUi);
    manifest.victory.sync(victoryUi);
    manifest.tutorial.sync(tutorialUi);
    manifest.settings.sync(settingsUi);
    manifest.market.dispose(marketUi);
    manifest.fleet.dispose(fleetUi);
    manifest.archive.dispose(archiveUi);
    manifest.dialogue.dispose({ DialogueUI: dialogueUi });
    manifest.save.dispose(saveUi);
    manifest.tutorial.dispose(tutorialUi);
    manifest.settings.dispose(settingsUi);

    expect(trace).toEqual([
      ['commerce', 'commerce', 'current-state'],
      ['guidance', provider],
      ['route', resolver],
      ['archive', archiveUi],
      ['victory', victoryUi],
      ['tutorial', tutorialUi],
      ['settings', settingsUi],
    ]);
    expect(achievement.init).toHaveBeenCalledWith(state);
    expect(marketUi.resetRuntimeState).toHaveBeenCalledOnce();
    expect(fleetUi.resetRuntimeState).toHaveBeenCalledOnce();
    expect(archiveUi.resetRuntimeState).toHaveBeenCalledOnce();
    expect(dialogueUi.destroy).toHaveBeenCalledOnce();
    expect(saveUi.resetRuntimeState).toHaveBeenCalledOnce();
    expect(tutorialUi.destroy).toHaveBeenCalledOnce();
    expect(settingsUi.dispose).toHaveBeenCalledOnce();
  });

  it('成就与胜利失败先恢复领域状态，再统一报告功能错误', function () {
    var trace = [];
    var error = new Error('load failed');
    var manifest = createGameFeatureManifest({
      reportFailure: function (feature, reportedError) {
        trace.push(['report', feature, reportedError]);
      },
      hooks: {
        resetAchievementRuntime: function () { trace.push(['reset-achievement']); },
        handleVictoryLoadFailure: function () { trace.push(['hide-victory']); },
      },
    });

    manifest.achievement.onError(error);
    manifest.victory.onError(error);
    manifest.market.onError(error);

    expect(trace).toEqual([
      ['reset-achievement'],
      ['report', 'achievement', error],
      ['hide-victory'],
      ['report', 'victory', error],
      ['report', 'market', error],
    ]);
  });

  it('失败报告器提供稳定中文标签与未知功能兜底', function () {
    var errors = [];
    var messages = [];
    var reportFailure = createGameFeatureFailureReporter({
      emitLog: function (message) { messages.push(message); },
      reportError: function (feature, error) { errors.push([feature, error]); },
    });
    var error = new Error('broken');

    reportFailure('market', error);
    reportFailure('futureFeature', error);

    expect(errors).toEqual([
      ['market', error],
      ['futureFeature', error],
    ]);
    expect(messages).toEqual([
      { text: '⚠️ 商业终端加载失败，请稍后重试。', type: 'error' },
      { text: '⚠️ 功能模块加载失败，请稍后重试。', type: 'error' },
    ]);
  });

  it('市场、舰队与档案的延迟 CSS 由 manifest 与模块一起加载', async function () {
    var styles = [];
    var manifest = createGameFeatureManifest({
      loadStylesheet: function (feature, href) {
        styles.push({ feature: feature, href: href });
        return Promise.resolve(href);
      },
    });

    await expect(manifest.market.load()).resolves.toBeTruthy();
    await expect(manifest.fleet.load()).resolves.toBeTruthy();
    await expect(manifest.archive.load()).resolves.toEqual(expect.objectContaining({
      QuestUI: expect.any(Object),
      ArchiveExplorationUI: expect.any(Object),
    }));

    expect(styles.map(function (entry) { return entry.feature; })).toEqual([
      'market-terminal',
      'fleet-base',
      'hangar-terminal',
      'archive-terminal',
    ]);
    styles.forEach(function (entry) {
      expect(entry.href).toContain('/css/');
    });
  });
});
