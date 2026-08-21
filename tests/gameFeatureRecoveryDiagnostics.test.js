import { describe, expect, it } from 'vitest';
import { buildGameFeatureRecoveryDiagnostics } from '../js/core/GameFeatureRecoveryDiagnostics.js';

describe('GameFeatureRecoveryDiagnostics', function () {
  it('合并 Registry、恢复呈现与 Settings 状态为冻结且可序列化的快照', function () {
    var diagnostics = buildGameFeatureRecoveryDiagnostics({
      registryDiagnostics: {
        market: {
          dependencies: ['commerce'],
          generation: 2,
          loadCount: 1,
          state: 'ready',
          syncCount: 3,
        },
        fleet: {
          dependencies: [],
          error: new Error('fleet chunk failed'),
          generation: 1,
          loadCount: 2,
          state: 'error',
          syncCount: 0,
        },
      },
      presentationDiagnostics: {
        activeFeatures: ['fleet', 'fleet'],
        errorCount: 1,
        loadingCount: 2,
        retryCount: 1,
      },
      settingsDiagnostics: {
        bound: false,
        disposed: false,
        launcherBound: true,
        loadAttempts: 2,
        loadFailures: 1,
        loadState: 'loading',
        openCount: 0,
        pending: true,
        syncCount: 0,
      },
    });

    expect(diagnostics).toEqual({
      presentation: {
        activeFeatures: ['fleet'],
        errorCount: 1,
        loadingCount: 2,
        retryCount: 1,
      },
      registry: {
        counts: { error: 1, idle: 0, loading: 0, ready: 1 },
        features: {
          fleet: {
            dependencies: [],
            errorMessage: 'fleet chunk failed',
            generation: 1,
            loadCount: 2,
            state: 'error',
            syncCount: 0,
          },
          market: {
            dependencies: ['commerce'],
            errorMessage: null,
            generation: 2,
            loadCount: 1,
            state: 'ready',
            syncCount: 3,
          },
        },
        registeredCount: 2,
        totalLoadCount: 3,
        totalSyncCount: 3,
      },
      settings: {
        bound: false,
        disposed: false,
        launcherBound: true,
        loadAttempts: 2,
        loadFailures: 1,
        loadState: 'loading',
        openCount: 0,
        pending: true,
        syncCount: 0,
      },
    });
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics.registry.features.fleet)).toBe(true);
    expect(function () { JSON.stringify(diagnostics); }).not.toThrow();
  });

  it('缺失或畸形输入稳定归一化为空快照', function () {
    var diagnostics = buildGameFeatureRecoveryDiagnostics({
      registryDiagnostics: {
        invalid: { loadCount: -3, state: 'unknown', syncCount: 'bad' },
      },
      presentationDiagnostics: { activeFeatures: [null, '', 'save'] },
    });

    expect(diagnostics.registry).toMatchObject({
      counts: { error: 0, idle: 1, loading: 0, ready: 0 },
      registeredCount: 1,
      totalLoadCount: 0,
      totalSyncCount: 0,
    });
    expect(diagnostics.presentation.activeFeatures).toEqual(['save']);
    expect(diagnostics.settings).toBe(null);
  });
});
