// js/core/GameStartupProjection.js — 应用冷启动投影端口
//
// 把设置读取、启动状态解析、音频绑定和渲染器初始化从组合根移出。
// prepareSession() 可在 session transition 前运行；initializeScene() 必须在
// 系统 restore 后、UI 壳绑定前运行，以保持现有启动顺序。

import * as Settings from './SettingsCore.js';
import * as Audio from './AudioManager.js';
import * as Renderer from '../ui/StarmapRenderer.js';
import { resolveStartupState } from './StartupState.js';

function _requireFunction(owner, key, label) {
  var fn = owner && owner[key];
  if (typeof fn !== 'function') {
    throw new TypeError('GameStartupProjection requires ' + label + '.');
  }
  return fn;
}

function _validateStartup(startup) {
  if (!startup || !startup.state || typeof startup.state !== 'object') {
    throw new TypeError('GameStartupProjection expected a startup state object.');
  }
  return startup;
}

export function createGameStartupProjection(dependencies) {
  var deps = dependencies || {};
  var settingsPort = deps.settings || Settings;
  var audioPort = deps.audio || Audio;
  var rendererPort = deps.renderer || Renderer;
  var resolveStartup = deps.resolveStartupState || resolveStartupState;
  var createDefaults = _requireFunction(settingsPort, 'createDefaultSettings', 'settings.createDefaultSettings');
  var loadSettings = _requireFunction(settingsPort, 'loadSettings', 'settings.loadSettings');
  var applySettings = _requireFunction(settingsPort, 'applySettings', 'settings.applySettings');
  var initializeAudio = _requireFunction(audioPort, 'init', 'audio.init');
  var initializeRenderer = _requireFunction(rendererPort, 'init', 'renderer.init');

  if (typeof resolveStartup !== 'function') {
    throw new TypeError('GameStartupProjection requires resolveStartupState.');
  }

  var currentSettings = createDefaults();
  var lastPreparation = null;
  var prepareCount = 0;
  var sceneInitializationCount = 0;
  var releaseCount = 0;
  var sceneInitialized = false;

  function prepareSession(difficulty, options) {
    // 新一轮 prepare 先丢弃旧引用；失败时不能继续暴露上一会话为“已准备”。
    lastPreparation = null;
    sceneInitialized = false;
    var loadedSettings = loadSettings();
    if (!loadedSettings || typeof loadedSettings !== 'object') {
      throw new TypeError('GameStartupProjection expected settings.loadSettings() to return an object.');
    }

    currentSettings = loadedSettings;
    var startup = _validateStartup(resolveStartup(difficulty, currentSettings, options));
    initializeAudio(currentSettings);
    prepareCount += 1;
    lastPreparation = Object.freeze({
      state: startup.state,
      restoredAutosave: startup.restoredAutosave === true,
      loadMessage: typeof startup.loadMessage === 'string' ? startup.loadMessage : '',
    });
    return lastPreparation;
  }

  function initializeScene() {
    if (!lastPreparation) {
      throw new Error('GameStartupProjection.initializeScene requires prepareSession first.');
    }
    var initialized = initializeRenderer();
    applySettings(currentSettings, rendererPort);
    sceneInitializationCount += 1;
    sceneInitialized = true;
    return initialized;
  }

  function release() {
    lastPreparation = null;
    currentSettings = createDefaults();
    sceneInitialized = false;
    releaseCount += 1;
    return getDiagnostics();
  }

  function getSettings() {
    return currentSettings;
  }

  function getRenderer() {
    return rendererPort;
  }

  function getDiagnostics() {
    return Object.freeze({
      prepared: !!lastPreparation,
      restoredAutosave: !!(lastPreparation && lastPreparation.restoredAutosave),
      sceneInitialized: sceneInitialized,
      prepareCount: prepareCount,
      sceneInitializationCount: sceneInitializationCount,
      releaseCount: releaseCount,
    });
  }

  return Object.freeze({
    prepareSession: prepareSession,
    initializeScene: initializeScene,
    release: release,
    getSettings: getSettings,
    getRenderer: getRenderer,
    getDiagnostics: getDiagnostics,
  });
}
