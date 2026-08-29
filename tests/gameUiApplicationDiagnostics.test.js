import { describe, expect, it } from 'vitest';
import { buildGameUiApplicationDiagnostics } from '../js/core/GameUiApplicationDiagnostics.js';

describe('GameUiApplicationDiagnostics', function () {
  it('把 Coordinator 渲染会话、Feature recovery 与子控制器合成冻结顶层快照', function () {
    var diagnostics = buildGameUiApplicationDiagnostics({
      coordinatorDiagnostics: {
        renderAllCount: 2,
        workspaceRenders: { activeWorkspace: 'fleet', lastRenderedRegions: ['fleet.hangar'] },
        workspaceSessions: { fleet: { activeSurface: null } },
      },
      registryDiagnostics: {
        fleet: { dependencies: [], generation: 1, loadCount: 1, state: 'ready', syncCount: 2 },
      },
      presentationDiagnostics: { activeFeatures: ['fleet'], loadingCount: 1 },
      settingsDiagnostics: { bound: true, loadState: 'ready', syncCount: 1 },
      lifecycleDiagnostics: { initialized: true },
      marketDiagnostics: { refreshCount: 3 },
      marketEntryDiagnostics: { open: false },
      shellProjectionDiagnostics: { renderCount: 4 },
      settingsCommandDiagnostics: { commandCount: 2 },
      workspaceTabDiagnostics: { activeArchiveTab: 'tab-quest' },
    });

    expect(diagnostics).toMatchObject({
      renderAllCount: 2,
      workspaceRenders: { activeWorkspace: 'fleet' },
      workspaceSessions: { fleet: { activeSurface: null } },
      coordinator: { renderAllCount: 2 },
      lifecycle: { initialized: true },
      market: { refreshCount: 3 },
      marketEntry: { open: false },
      shellProjection: { renderCount: 4 },
      settingsCommands: { commandCount: 2 },
      workspaceTabs: { activeArchiveTab: 'tab-quest' },
      featureRecovery: {
        registry: { registeredCount: 1, totalLoadCount: 1, totalSyncCount: 2 },
        presentation: { activeFeatures: ['fleet'], loadingCount: 1 },
        settings: { bound: true, loadState: 'ready', syncCount: 1 },
      },
    });
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics.featureRecovery)).toBe(true);
  });

  it('缺少惰性 controller 时仍返回稳定的可序列化空快照', function () {
    var diagnostics = buildGameUiApplicationDiagnostics();

    expect(diagnostics).toEqual({
      coordinator: null,
      featureRecovery: {
        presentation: { activeFeatures: [], errorCount: 0, loadingCount: 0, retryCount: 0 },
        registry: {
          counts: { error: 0, idle: 0, loading: 0, ready: 0 },
          features: {},
          registeredCount: 0,
          totalLoadCount: 0,
          totalSyncCount: 0,
        },
        settings: null,
      },
      lifecycle: null,
      market: null,
      marketEntry: null,
      shellProjection: null,
      settings: null,
      settingsCommands: null,
      workspaceTabs: null,
    });
    expect(function () { JSON.stringify(diagnostics); }).not.toThrow();
  });
});
