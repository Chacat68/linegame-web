import { describe, expect, it } from 'vitest';
import { createGameStartupProjection } from '../js/core/GameStartupProjection.js';
import { createDefaultSettings } from '../js/core/SettingsCore.js';

function createHarness(overrides) {
  var calls = [];
  var defaultsCreated = 0;
  var loadedSettings = { difficulty: 'hard', motionLevel: 'reduced' };
  var renderer = {
    init: function () {
      calls.push('renderer.init');
      return 'renderer-ready';
    },
  };
  var dependencies = {
    settings: {
      createDefaultSettings: function () {
        defaultsCreated += 1;
        return { difficulty: 'normal', marker: 'default-' + defaultsCreated };
      },
      loadSettings: function () {
        calls.push('settings.load');
        return loadedSettings;
      },
      applySettings: function (settings, rendererPort) {
        calls.push('settings.apply');
        expect(settings).toBe(loadedSettings);
        expect(rendererPort).toBe(renderer);
      },
    },
    audio: {
      init: function (settings) {
        calls.push('audio.init');
        expect(settings).toBe(loadedSettings);
      },
    },
    renderer: renderer,
    resolveStartupState: function (difficulty, settings, options) {
      calls.push('startup.resolve');
      expect(difficulty).toBe('hard');
      expect(settings).toBe(loadedSettings);
      expect(options).toEqual({ restoreAutosave: true });
      return {
        state: { day: 7 },
        restoredAutosave: true,
        loadMessage: 'restored',
      };
    },
  };
  Object.assign(dependencies, overrides || {});
  return {
    calls: calls,
    renderer: renderer,
    loadedSettings: loadedSettings,
    projection: createGameStartupProjection(dependencies),
  };
}

describe('GameStartupProjection', function () {
  it('以 prepare → session transition → scene 的两阶段边界保持启动顺序', function () {
    var harness = createHarness();

    var startup = harness.projection.prepareSession('hard', { restoreAutosave: true });

    expect(startup).toEqual({
      state: { day: 7 },
      restoredAutosave: true,
      loadMessage: 'restored',
    });
    expect(Object.isFrozen(startup)).toBe(true);
    expect(harness.projection.getSettings()).toBe(harness.loadedSettings);
    expect(harness.calls).toEqual(['settings.load', 'startup.resolve', 'audio.init']);

    expect(harness.projection.initializeScene()).toBe('renderer-ready');
    expect(harness.calls).toEqual([
      'settings.load',
      'startup.resolve',
      'audio.init',
      'renderer.init',
      'settings.apply',
    ]);
    expect(harness.projection.getRenderer()).toBe(harness.renderer);
    expect(harness.projection.getDiagnostics()).toMatchObject({
      prepared: true,
      restoredAutosave: true,
      sceneInitialized: true,
      prepareCount: 1,
      sceneInitializationCount: 1,
      releaseCount: 0,
    });
  });

  it('没有准备 session 时拒绝提前初始化场景', function () {
    var harness = createHarness();

    expect(function () { harness.projection.initializeScene(); })
      .toThrow('requires prepareSession first');
    expect(harness.calls).toEqual([]);
  });

  it('无效启动结果不会绑定音频或留下半准备状态', function () {
    var harness = createHarness({
      resolveStartupState: function () {
        harness.calls.push('startup.resolve');
        return { state: null };
      },
    });

    expect(function () {
      harness.projection.prepareSession('hard', { restoreAutosave: true });
    }).toThrow('expected a startup state object');
    expect(harness.calls).toEqual(['settings.load', 'startup.resolve']);
    expect(harness.projection.getDiagnostics().prepared).toBe(false);
  });

  it('release 丢弃启动态引用并恢复一份新的默认设置', function () {
    var harness = createHarness();
    var initialDefaults = harness.projection.getSettings();
    harness.projection.prepareSession('hard', { restoreAutosave: true });
    harness.projection.initializeScene();

    var diagnostics = harness.projection.release();

    expect(diagnostics).toMatchObject({
      prepared: false,
      restoredAutosave: false,
      sceneInitialized: false,
      prepareCount: 1,
      sceneInitializationCount: 1,
      releaseCount: 1,
    });
    expect(harness.projection.getSettings()).not.toBe(initialDefaults);
    expect(harness.projection.getSettings()).not.toBe(harness.loadedSettings);
    expect(harness.projection.getSettings().marker).toBe('default-2');
  });

  it('release 后可以为下一应用会话重新准备并初始化场景', function () {
    var harness = createHarness();
    var first = harness.projection.prepareSession('hard', { restoreAutosave: true });
    harness.projection.initializeScene();
    harness.projection.release();

    var second = harness.projection.prepareSession('hard', { restoreAutosave: true });
    harness.projection.initializeScene();

    expect(second).not.toBe(first);
    expect(second.state).not.toBe(first.state);
    expect(harness.projection.getDiagnostics()).toMatchObject({
      prepared: true,
      sceneInitialized: true,
      prepareCount: 2,
      sceneInitializationCount: 2,
      releaseCount: 1,
    });
  });

  it('SettingsCore 默认值每次返回独立对象，避免跨应用实例串改', function () {
    var first = createDefaultSettings();
    var second = createDefaultSettings();

    first.difficulty = 'hard';
    expect(second.difficulty).toBe('normal');
    expect(first).not.toBe(second);
  });
});
