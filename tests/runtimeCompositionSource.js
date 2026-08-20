import { readFileSync } from 'node:fs';

export const RUNTIME_FACTORY_SOURCE_FILES = Object.freeze([
  'js/core/GameRuntimeNodeFactories.js',
  'js/core/GameSessionRuntimeFactories.js',
  'js/core/GameFeatureRuntimeFactories.js',
  'js/core/GameActionRuntimeFactory.js',
  'js/core/GameGuidanceRuntimeFactory.js',
  'js/core/GameUiRuntimeFactory.js',
]);

export function readRuntimeFactoryComposition() {
  return RUNTIME_FACTORY_SOURCE_FILES.map(function (file) {
    return readFileSync(file, 'utf8');
  }).join('\n');
}

export function readApplicationComposition() {
  return readFileSync('js/core/GameApplication.js', 'utf8') + '\n' +
    readRuntimeFactoryComposition();
}
