import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let renderer, canvas, imported, three, availability, moduleRequests;
const snapshot = { viewingGalaxy: 'milky_way' };

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetModules();
  renderer = null;
  moduleRequests = 0;
  imported = deferred();
  canvas = { style: { display: 'none', visibility: 'hidden' }, dataset: {}, getContext: vi.fn() };
  vi.stubGlobal('document', { getElementById: id => id === 'starmap-three-canvas' ? canvas : null });
  let available = true, notifyAvailability = null;
  three = {
    init: vi.fn(() => { available = true; return true; }),
    isAvailable: vi.fn(() => available),
    setVisible: vi.fn(value => { canvas.style.display = value && available ? 'block' : 'none'; }),
    setQuality: vi.fn(), setMotionLevel: vi.fn(), render: vi.fn(), resetCamera: vi.fn(), focusRoute: vi.fn(),
    setAvailabilityHandler: vi.fn(handler => { notifyAvailability = handler; }),
    getRendererInfo: vi.fn(() => ({ renderer: 'three', panOnly: true, pixelRatio: 2, cameraHeight: 105, cameraOffset: [0, 105, 130] })),
    dispose: vi.fn(() => { available = false; canvas.style.display = 'none'; }),
  };
  availability = value => { available = value; notifyAvailability?.(value); };
  vi.doMock('../js/ui/RendererThreeStarmap.js', async () => { moduleRequests += 1; await imported.promise; return three; });
});

afterEach(() => {
  renderer?.dispose();
  vi.useRealTimers();
  vi.doUnmock('../js/ui/RendererThreeStarmap.js');
  vi.unstubAllGlobals();
});

async function start() {
  renderer = await import('../js/ui/StarmapRenderer.js');
  expect(renderer.init()).toBe(true);
}

async function finishImport() {
  imported.resolve();
  await vi.dynamicImportSettled();
}

function expectHiddenWithoutFallback() {
  expect(canvas.style.display).toBe('none');
  expect(canvas.getContext).not.toHaveBeenCalledWith('2d');
  expect(document.getElementById('map-3d-canvas')).toBeNull();
}

it('导入与初始化期间不显示画布，首帧真正绘制成功后才就绪', async () => {
  await start();
  expect(renderer.getLoadState()).toBe('idle');
  expect(renderer.getLoadError()).toBe('');
  expect(three.init).not.toHaveBeenCalled();
  renderer.render(snapshot, 'planets', 'milky_way');
  expect(renderer.getLoadState()).toBe('loading');
  expectHiddenWithoutFallback();
  await finishImport();
  expect(three.init).toHaveBeenCalledOnce();
  expect(three.render).not.toHaveBeenCalled();
  expect(renderer.getLoadState()).toBe('loading');
  expectHiddenWithoutFallback();
  three.render.mockImplementation(() => expect(canvas.style.visibility).toBe('hidden'));
  renderer.render(snapshot, 'planets', 'milky_way');
  expect(three.render).toHaveBeenCalledExactlyOnceWith(snapshot, 'planets', 'milky_way');
  expect(renderer.getLoadState()).toBe('ready');
  expect(renderer.getLoadError()).toBe('');
  expect(canvas.style.display).toBe('block');
  expect(canvas.style.visibility).not.toBe('hidden');
  expect(renderer.getRendererInfo()).toMatchObject({ renderer: 'three', panOnly: true });
});

it.each(['import', 'init', 'render'])('%s 失败时隐藏场景并报告中文原因，重试后可完成首帧', async failure => {
  if (failure === 'init') three.init.mockReturnValueOnce(false);
  if (failure === 'render') three.render.mockImplementationOnce(() => { throw new Error('draw failed'); });
  await start();
  renderer.render(snapshot, 'planets', 'milky_way');
  if (failure === 'import') {
    imported.reject(new Error('chunk failed'));
    await vi.dynamicImportSettled();
  } else {
    await finishImport();
    if (failure === 'render') renderer.render(snapshot, 'planets', 'milky_way');
  }
  expect(renderer.getLoadState()).toBe('error');
  expect(renderer.getLoadError()).toMatch(/[\u4e00-\u9fff]/);
  expectHiddenWithoutFallback();
  const previousInitCount = three.init.mock.calls.length;
  vi.doMock('../js/ui/RendererThreeStarmap.js', () => three);
  renderer.retry();
  expect(renderer.getLoadState()).toBe('idle');
  expect(renderer.getLoadError()).toBe('');
  renderer.render(snapshot, 'planets', 'milky_way');
  expect(renderer.getLoadState()).toBe('loading');
  await vi.dynamicImportSettled();
  expect(three.init.mock.calls.length).toBe(previousInitCount + 1);
  renderer.render(snapshot, 'planets', 'milky_way');
  expect(renderer.getLoadState()).toBe('ready');
  expect(canvas.style.display).toBe('block');
});

it('加载时离开页面不会显示场景，重新进入后才绘制首帧', async () => {
  await start();
  renderer.render(snapshot, 'planets', 'milky_way');
  renderer.toggleView();
  expect(renderer.isActive()).toBe(false);
  await finishImport();
  expect(three.render).not.toHaveBeenCalled();
  expectHiddenWithoutFallback();
  renderer.render(snapshot, 'planets', 'milky_way');
  expect(three.render).not.toHaveBeenCalled();
  renderer.toggleView();
  renderer.render(snapshot, 'planets', 'milky_way');
  expect(renderer.getLoadState()).toBe('ready');
  expect(three.render).toHaveBeenCalledOnce();
});

it('销毁后的旧导入不能点亮新会话，新会话需重新请求并绘制', async () => {
  await start();
  renderer.render(snapshot, 'planets', 'milky_way');
  renderer.dispose();
  expect(renderer.isActive()).toBe(false);
  expect(renderer.init()).toBe(true);
  await finishImport();
  expect(three.init).not.toHaveBeenCalled();
  expect(three.render).not.toHaveBeenCalled();
  expect(renderer.getLoadState()).toBe('idle');
  expectHiddenWithoutFallback();
  renderer.render(snapshot, 'planets', 'milky_way');
  await vi.dynamicImportSettled();
  renderer.render(snapshot, 'planets', 'milky_way');
  expect(renderer.getLoadState()).toBe('ready');
  expect(three.init).toHaveBeenCalledOnce();
});

it('上下文丢失后隐藏并报错，恢复通知只进入加载态，下一帧成功才重现', async () => {
  await start();
  renderer.render(snapshot, 'planets', 'milky_way');
  await finishImport();
  renderer.render(snapshot, 'planets', 'milky_way');
  availability(false);
  expect(renderer.getLoadState()).toBe('error');
  expect(renderer.getLoadError()).toMatch(/[\u4e00-\u9fff]/);
  expectHiddenWithoutFallback();
  const renderedFrames = three.render.mock.calls.length;
  availability(true);
  expect(renderer.getLoadState()).toBe('loading');
  expect(three.render.mock.calls.length).toBe(renderedFrames);
  expectHiddenWithoutFallback();
  renderer.render(snapshot, 'planets', 'milky_way');
  expect(renderer.getLoadState()).toBe('ready');
  expect(renderer.getLoadError()).toBe('');
  expect(three.render.mock.calls.length).toBe(renderedFrames + 1);
});

it('预加载与进入星图共用请求，预加载本身不创建场景或改变加载状态', async () => {
  renderer = await import('../js/ui/StarmapRenderer.js');
  const prepared = renderer.preload();
  const sameRequest = renderer.preload();
  expect(renderer.getLoadState()).toBe('idle');
  expect(renderer.isActive()).toBe(false);
  expect(three.init).not.toHaveBeenCalled();
  renderer.init();
  renderer.render(snapshot, 'planets', 'milky_way');
  await finishImport();
  expect(await prepared).toBe(true);
  expect(await sameRequest).toBe(true);
  expect(moduleRequests).toBe(1);
  expect(three.init).toHaveBeenCalledOnce();
  expect(renderer.getLoadState()).toBe('loading');
  renderer.render(snapshot, 'planets', 'milky_way');
  expect(renderer.getLoadState()).toBe('ready');
});

it('未进入星图的会话销毁后会取消空闲准备，迟到的预加载也不会创建场景', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  renderer = await import('../js/ui/StarmapRenderer.js');
  renderer.schedulePreload();
  renderer.dispose();
  await vi.advanceTimersByTimeAsync(200);
  expect(moduleRequests).toBe(0);
  const prepared = renderer.preload();
  renderer.dispose();
  await finishImport();
  expect(await prepared).toBe(true);
  expect(renderer.getLoadState()).toBe('idle');
  expect(renderer.isActive()).toBe(false);
  expect(three.init).not.toHaveBeenCalled();
  expect(three.render).not.toHaveBeenCalled();
});

it('背景预加载失败不影响经营，真正进入时可以重新请求资源', async () => {
  renderer = await import('../js/ui/StarmapRenderer.js');
  const prepared = renderer.preload();
  imported.reject(new Error('prefetch failed'));
  await vi.dynamicImportSettled();
  expect(await prepared).toBe(false);
  expect(renderer.getLoadState()).toBe('idle');
  expect(renderer.getLoadError()).toBe('');
  vi.doMock('../js/ui/RendererThreeStarmap.js', () => three);
  renderer.init();
  renderer.render(snapshot, 'planets', 'milky_way');
  await vi.dynamicImportSettled();
  renderer.render(snapshot, 'planets', 'milky_way');
  expect(renderer.getLoadState()).toBe('ready');
});
