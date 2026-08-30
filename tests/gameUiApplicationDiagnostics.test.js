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
      contextInspectorDiagnostics: {
        activeWorkspaceId: 'fleet', contextCount: 1, rendererCount: 5,
      },
      registryDiagnostics: {
        fleet: { dependencies: [], generation: 1, loadCount: 1, state: 'ready', syncCount: 2 },
      },
      presentationDiagnostics: { activeFeatures: ['fleet'], loadingCount: 1 },
      settingsDiagnostics: { bound: true, loadState: 'ready', syncCount: 1 },
      lifecycleDiagnostics: { initialized: true },
      marketDiagnostics: { refreshCount: 3 },
      marketEntryDiagnostics: { open: false },
      navigationDiagnostics: { activeWorkspace: 'fleet', activeDetail: null },
      shellProjectionDiagnostics: { renderCount: 4 },
      surfaceManagerDiagnostics: {
        escapeLayerCount: 3, hasBlockingSurfaceOpen: false, visibleBlockingSurfaceIds: [],
      },
      settingsCommandDiagnostics: { commandCount: 2 },
      workspaceDetailDiagnostics: { depth: 0, initialized: true, open: false },
      workspaceSurfaceDiagnostics: {
        activeWorkspace: 'fleet', consistent: true, visibleSurfaceIds: ['trade-panel'],
      },
      workspaceTabDiagnostics: { activeArchiveTab: 'tab-quest' },
    });

    expect(diagnostics).toMatchObject({
      renderAllCount: 2,
      workspaceRenders: { activeWorkspace: 'fleet' },
      workspaceSessions: { fleet: { activeSurface: null } },
      coordinator: { renderAllCount: 2 },
      contextInspector: { activeWorkspaceId: 'fleet', contextCount: 1, rendererCount: 5 },
      lifecycle: { initialized: true },
      market: { refreshCount: 3 },
      marketEntry: { open: false },
      navigation: { activeWorkspace: 'fleet', activeDetail: null },
      shellProjection: { renderCount: 4 },
      surfaceManager: {
        escapeLayerCount: 3, hasBlockingSurfaceOpen: false, visibleBlockingSurfaceIds: [],
      },
      settingsCommands: { commandCount: 2 },
      workspaceDetail: { depth: 0, initialized: true, open: false },
      workspaceSurfaces: {
        activeWorkspace: 'fleet', consistent: true, visibleSurfaceIds: ['trade-panel'],
      },
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
      contextInspector: null,
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
      navigation: null,
      shellProjection: null,
      surfaceManager: null,
      settings: null,
      settingsCommands: null,
      workspaceDetail: null,
      workspaceSurfaces: null,
      workspaceTabs: null,
    });
    expect(function () { JSON.stringify(diagnostics); }).not.toThrow();
  });
});
