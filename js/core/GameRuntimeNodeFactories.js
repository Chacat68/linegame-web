// js/core/GameRuntimeNodeFactories.js — Runtime Graph 节点工厂注册表
//
// 这里只校验组合根端口、合并职责工厂簇并保证 12 个节点唯一归属。
// 领域系统、UI 端口和控制器装配分别留在对应的 Runtime Factory 模块。

import * as GameTime from '../systems/time/GameTimeSystem.js';
import { createGameSessionRuntimeFactories } from './GameSessionRuntimeFactories.js';
import { createGameFeatureRuntimeFactories } from './GameFeatureRuntimeFactories.js';
import { createGameActionRuntimeFactory } from './GameActionRuntimeFactory.js';
import { createGameGuidanceRuntimeFactory } from './GameGuidanceRuntimeFactory.js';
import { createGameUiRuntimeFactory } from './GameUiRuntimeFactory.js';

export const GAME_RUNTIME_NODE_IDS = Object.freeze([
  'features',
  'ui',
  'systems',
  'gameLoop',
  'sessionLifecycle',
  'actions',
  'dialogue',
  'randomEvent',
  'guidance',
  'victory',
  'achievement',
  'persistence',
]);

const REQUIRED_CONTEXT_FUNCTIONS = Object.freeze([
  'resolve',
  'getState',
  'getSettings',
  'getRevision',
  'getSessionToken',
  'isSessionTokenCurrent',
  'replaceState',
  'resetSessionTransients',
  'updateUI',
  'startFreshSession',
  'emitLog',
  'emitAudio',
  'reportDeferredUiFailure',
]);

export function releaseGameRuntimeStaticPorts() {
  GameTime.setAdvancedDayProcessor(null);
}

function _createFactoryContext(context) {
  var source = context || {};
  var normalized = { events: source.events || {} };

  REQUIRED_CONTEXT_FUNCTIONS.forEach(function (name) {
    if (typeof source[name] !== 'function') {
      throw new TypeError('GameRuntimeNodeFactories requires context.' + name + '().');
    }
    normalized[name] = source[name];
  });

  return Object.freeze(normalized);
}

function _mergeRuntimeFactoryClusters(clusters) {
  var knownIds = new Set(GAME_RUNTIME_NODE_IDS);
  var assembled = {};

  clusters.forEach(function (cluster) {
    if (!cluster || typeof cluster !== 'object') {
      throw new TypeError('Runtime factory cluster must be an object.');
    }
    Object.keys(cluster).forEach(function (id) {
      if (!knownIds.has(id)) throw new Error('Unknown Runtime Graph factory: ' + id);
      if (Object.prototype.hasOwnProperty.call(assembled, id)) {
        throw new Error('Duplicate Runtime Graph factory: ' + id);
      }
      if (typeof cluster[id] !== 'function') {
        throw new TypeError('Runtime Graph factory must be a function: ' + id);
      }
      assembled[id] = cluster[id];
    });
  });

  var ordered = {};
  GAME_RUNTIME_NODE_IDS.forEach(function (id) {
    if (!Object.prototype.hasOwnProperty.call(assembled, id)) {
      throw new Error('Missing Runtime Graph factory: ' + id);
    }
    ordered[id] = assembled[id];
  });
  return Object.freeze(ordered);
}

export function createGameRuntimeNodeFactories(context) {
  var ports = _createFactoryContext(context);
  return _mergeRuntimeFactoryClusters([
    createGameFeatureRuntimeFactories(ports),
    createGameUiRuntimeFactory(ports),
    createGameSessionRuntimeFactories(ports),
    createGameActionRuntimeFactory(ports),
    createGameGuidanceRuntimeFactory(ports),
  ]);
}
