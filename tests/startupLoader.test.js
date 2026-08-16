import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('startup scene loader', function () {
  it('首屏提供全屏加载状态、进度语义和失败重试入口', function () {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../css/startup-loader.css', import.meta.url), 'utf8');

    expect(html).toContain('id="startup-loader"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="8"');
    expect(html).toContain('id="startup-loader-retry"');
    expect(css).toMatch(/\.startup-loader\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/s);
    expect(css).toContain('.startup-loader.is-complete');
    expect(css).toContain('.startup-loader.has-error');
  });

  it('主入口等待场景就绪后才完成加载层', function () {
    const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
    const gameManager = readFileSync(new URL('../js/core/GameManager.js', import.meta.url), 'utf8');
    const uiLifecycle = readFileSync(new URL('../js/core/GameUiLifecycleController.js', import.meta.url), 'utf8');
    const uiApplication = readFileSync(new URL('../js/core/GameUiApplicationRuntime.js', import.meta.url), 'utf8');

    expect(main).toContain('const sceneReadyPromise = init();');
    expect(main).toContain('await _withTimeout(sceneReadyPromise, SCENE_READY_TIMEOUT_MS);');
    expect(main).toContain('await StartupLoader.complete();');
    expect(main.indexOf('await _withTimeout(sceneReadyPromise, SCENE_READY_TIMEOUT_MS);'))
      .toBeLessThan(main.indexOf('await StartupLoader.complete();'));
    expect(gameManager).toContain('uiRuntime.whenSceneReady()');
    expect(uiApplication).toContain('return getLifecycle().whenSceneReady();');
    expect(uiLifecycle).toContain('Renderer.whenSceneReady()');
    expect(gameManager).toContain('return sceneReadyPromise;');
  });

  it('星图门面只在 Three 首帧或 2D 回退帧绘制后报告就绪', function () {
    const renderer = readFileSync(new URL('../js/ui/StarmapRenderer.js', import.meta.url), 'utf8');

    expect(renderer).toContain('export function whenSceneReady()');
    expect(renderer).toContain("_markSceneReady('three');");
    expect(renderer).toContain('_fallbackFrameDrawn = true;');
    expect(renderer).toContain("_markSceneReady('2d');");
    expect(renderer).toContain("container.dataset.starmapSceneReady = 'true';");
  });
});
