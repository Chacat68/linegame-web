import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createTestState } from './helpers.js';
import * as GameApplication from '../js/core/GameApplication.js';
import { createGameApplicationTestHarness } from '../js/testing/GameApplicationTestHarness.js';

describe('GameManager application shutdown', function () {
  var originalDocument = globalThis.document;

  afterEach(function () {
    globalThis.document = originalDocument;
    vi.resetModules();
  });

  it('释放已经创建的异步 controller、Renderer 和组合根，且重复调用幂等', async function () {
    globalThis.document = undefined;
    createGameApplicationTestHarness().replaceState(createTestState());

    var result = GameApplication.shutdown('test-shutdown');
    expect(result.reason).toBe('test-shutdown');
    expect(result.completedStages).toContain('dialogue');
    expect(result.completedStages).toContain('randomEvent');
    expect(result.completedStages).toContain('renderer');
    expect(result.completedStages).toContain('eventUi');
    expect(result.completedStages.at(-1)).toBe('release');
    expect(result.errors).toEqual([]);
    expect(GameApplication.shutdown('second-call')).toBe(result);
  });

  it('浏览器退出与 HMR 都调用同一 shutdown facade，bfcache 页面不提前释放', function () {
    var source = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
    expect(source).toContain("import { init, shutdown } from './core/GameApplication.js'");
    expect(source).toContain("window.addEventListener('pagehide'");
    expect(source).toContain("event.persisted !== true");
    expect(source).toContain("shutdown('pagehide')");
    expect(source).toContain("import.meta.hot.dispose");
    expect(source).toContain("shutdown('hot-module-reload')");
  });
});
