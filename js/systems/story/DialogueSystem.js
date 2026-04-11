// js/systems/story/DialogueSystem.js — 轻量剧情对话调度
// 依赖：data/dialogues.js
// 导出：init, getScenesForTrigger, markSceneSeen, finalizeScene

import { DIALOGUE_SCENES } from '../../data/dialogues.js';

export function init(state) {
  _ensureStoryFlags(state);
  _ensureStoryDecisions(state);
}

export function getScenesForTrigger(state, triggerType, context) {
  _ensureStoryFlags(state);
  _ensureStoryDecisions(state);
  var nextContext = context || {};

  return DIALOGUE_SCENES.filter(function (scene) {
    if (!scene || !scene.trigger || scene.trigger.type !== triggerType) return false;
    if (scene.trigger.questId && scene.trigger.questId !== nextContext.questId) return false;
    if (scene.trigger.phaseId && scene.trigger.phaseId !== nextContext.phaseId) return false;
    if (typeof scene.when === 'function' && !scene.when(state, nextContext)) return false;
    if (scene.once !== false && state.storyFlags[scene.id]) return false;
    return true;
  }).map(function (scene) {
    return _resolveScene(scene, state, nextContext);
  });
}

export function markSceneSeen(state, sceneId) {
  if (!sceneId) return;
  _ensureStoryFlags(state);
  state.storyFlags[sceneId] = state.day || 1;
}

export function finalizeScene(state, sceneId, result) {
  if (!sceneId) return;
  markSceneSeen(state, sceneId);
  if (result && result.choiceId) {
    _ensureStoryDecisions(state);
    state.storyDecisions[sceneId] = result.choiceId;
  }
}

function _resolveScene(scene, state, context) {
  return {
    id: scene.id,
    label: _resolveValue(scene.label, state, context),
    title: _resolveValue(scene.title, state, context),
    footer: _resolveValue(scene.footer, state, context),
    lines: (scene.lines || []).map(function (line) {
      return {
        speaker: _resolveValue(line.speaker, state, context),
        icon: _resolveValue(line.icon, state, context),
        text: _resolveValue(line.text, state, context),
      };
    }),
    choices: (scene.choices || []).filter(function (choice) {
      return typeof choice.when !== 'function' || choice.when(state, context);
    }).map(function (choice) {
      return {
        id: choice.id,
        text: _resolveValue(choice.text, state, context),
        hint: _resolveValue(choice.hint, state, context),
        responseFooter: _resolveValue(choice.responseFooter, state, context),
        responseLines: (choice.responseLines || []).map(function (line) {
          return {
            speaker: _resolveValue(line.speaker, state, context),
            icon: _resolveValue(line.icon, state, context),
            text: _resolveValue(line.text, state, context),
          };
        }),
      };
    }),
  };
}

function _resolveValue(value, state, context) {
  return typeof value === 'function' ? value(state, context) : value;
}

function _ensureStoryFlags(state) {
  if (!state || typeof state !== 'object') return {};
  if (!state.storyFlags || typeof state.storyFlags !== 'object' || Array.isArray(state.storyFlags)) {
    state.storyFlags = {};
  }
  return state.storyFlags;
}

function _ensureStoryDecisions(state) {
  if (!state || typeof state !== 'object') return {};
  if (!state.storyDecisions || typeof state.storyDecisions !== 'object' || Array.isArray(state.storyDecisions)) {
    state.storyDecisions = {};
  }
  return state.storyDecisions;
}