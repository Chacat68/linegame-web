import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';

let renderer, canvas, canvasPresent, renderers, controls, lighting, createLighting, webGLConstructor;

beforeEach(() => {
  vi.resetModules();
  renderer = null;
  renderers = [];
  controls = [];
  canvasPresent = true;
  canvas = { style: {}, getContext: vi.fn(() => ({})), addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal('document', { getElementById: () => canvasPresent ? canvas : null });
  vi.stubGlobal('window', { matchMedia: vi.fn(() => ({ matches: false })) });
  lighting = { attach: vi.fn(), dispose: vi.fn() };
  createLighting = vi.fn(() => lighting);
  webGLConstructor = vi.fn(function () {
    this.dispose = vi.fn();
    renderers.push(this);
  });
  vi.doMock('three/src/renderers/WebGLRenderer.js', () => ({ WebGLRenderer: webGLConstructor }));
  vi.doMock('three/addons/controls/OrbitControls.js', () => ({
    OrbitControls: class {
      constructor(camera) {
        this.object = camera;
        this.target = new Vector3();
        this.mouseButtons = {};
        this.touches = {};
        this.dispose = vi.fn();
        controls.push(this);
      }
    },
  }));
  vi.doMock('../js/ui/SceneLighting.js', () => ({ createSceneLighting: createLighting }));
});

afterEach(() => {
  renderer?.dispose();
  vi.doUnmock('three/src/renderers/WebGLRenderer.js');
  vi.doUnmock('three/addons/controls/OrbitControls.js');
  vi.doUnmock('../js/ui/SceneLighting.js');
  vi.unstubAllGlobals();
});

it('灯光初始化中断后能完整清理半成品，并在同一模块重新初始化', async () => {
  createLighting.mockImplementationOnce(() => { throw new Error('测试灯光初始化失败'); });
  renderer = await import('../js/ui/RendererThreeStarmap.js');
  expect(() => renderer.init()).toThrow('测试灯光初始化失败');
  expect(() => renderer.dispose()).not.toThrow();
  expect(renderer.isAvailable()).toBe(false);
  expect(renderers[0].dispose).toHaveBeenCalledOnce();
  expect(controls[0].dispose).toHaveBeenCalledOnce();
  expect(lighting.dispose).not.toHaveBeenCalled();
  expect(() => renderer.dispose()).not.toThrow();
  expect(renderers[0].dispose).toHaveBeenCalledOnce();
  expect(renderer.init()).toBe(true);
  expect(renderer.isAvailable()).toBe(true);
  expect(renderers).toHaveLength(2);
  expect(lighting.attach).toHaveBeenCalledOnce();
  renderer.dispose();
  expect(renderers[1].dispose).toHaveBeenCalledOnce();
  expect(lighting.dispose).toHaveBeenCalledOnce();
  expect(renderer.isAvailable()).toBe(false);
});

it.each(['canvas', 'webgl2'])('缺少 %s 时早期退出，清理幂等，条件恢复后可以初始化', async missing => {
  if (missing === 'canvas') canvasPresent = false;
  else canvas.getContext.mockReturnValue(null);
  renderer = await import('../js/ui/RendererThreeStarmap.js');
  expect(renderer.init()).toBe(false);
  expect(webGLConstructor).not.toHaveBeenCalled();
  expect(() => renderer.dispose()).not.toThrow();
  expect(() => renderer.dispose()).not.toThrow();
  expect(renderer.isAvailable()).toBe(false);
  canvasPresent = true;
  canvas.getContext.mockReturnValue({});
  expect(renderer.init()).toBe(true);
  expect(renderer.isAvailable()).toBe(true);
  expect(webGLConstructor).toHaveBeenCalledOnce();
});
