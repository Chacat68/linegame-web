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
    contextInspector: _snapshot(source.contextInspectorDiagnostics),
    featureRecovery: featureRecovery,
    lifecycle: _snapshot(source.lifecycleDiagnostics),
    market: _snapshot(source.marketDiagnostics),
    marketEntry: _snapshot(source.marketEntryDiagnostics),
    navigation: _snapshot(source.navigationDiagnostics),
    shellProjection: _snapshot(source.shellProjectionDiagnostics),
    surfaceManager: _snapshot(source.surfaceManagerDiagnostics),
    settings: settings,
    settingsCommands: _snapshot(source.settingsCommandDiagnostics),
    workspaceDetail: _snapshot(source.workspaceDetailDiagnostics),
    workspaceSurfaces: _snapshot(source.workspaceSurfaceDiagnostics),
    workspaceTabs: _snapshot(source.workspaceTabDiagnostics),
  }));
}
