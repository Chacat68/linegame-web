// js/core/GameUiApplicationDiagnostics.js — UI 应用层复合诊断的纯快照投影

import { buildGameFeatureRecoveryDiagnostics } from './GameFeatureRecoveryDiagnostics.js';

function _snapshot(value) {
  return value && typeof value === 'object' ? value : null;
}

export function buildGameUiApplicationDiagnostics(input) {
  var source = input || {};
  var coordinator = _snapshot(source.coordinatorDiagnostics);
  var settings = _snapshot(source.settingsDiagnostics);
  var featureRecovery = buildGameFeatureRecoveryDiagnostics({
    registryDiagnostics: source.registryDiagnostics,
    presentationDiagnostics: source.presentationDiagnostics,
    settingsDiagnostics: settings,
  });

  return Object.freeze(Object.assign({}, coordinator || {}, {
    coordinator: coordinator,
    featureRecovery: featureRecovery,
    lifecycle: _snapshot(source.lifecycleDiagnostics),
    market: _snapshot(source.marketDiagnostics),
    marketEntry: _snapshot(source.marketEntryDiagnostics),
    shellProjection: _snapshot(source.shellProjectionDiagnostics),
    settings: settings,
    settingsCommands: _snapshot(source.settingsCommandDiagnostics),
    workspaceTabs: _snapshot(source.workspaceTabDiagnostics),
  }));
}
