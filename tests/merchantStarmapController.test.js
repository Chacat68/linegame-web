import { beforeEach, expect, it, vi } from 'vitest';
import { createMerchantStarmapController } from '../js/ui/MerchantStarmapController.js';

const surface = vi.hoisted(() => ({ blocked: false }));
vi.mock('../js/ui/SurfaceManager.js', () => ({ hasBlockingSurfaceOpen: () => surface.blocked }));
vi.mock('../js/ui/MerchantStarmapProjection.js', () => ({
  buildMerchantStarmapProjection: () => ({ viewingGalaxy: 'milky_way', merchantStarmapRoutes: [{ id: 'merchant-ship-1' }] }),
}));

function element() {
  const classes = new Set(), attributes = new Map(), listeners = new Map(), slots = new Map();
  return {
    dataset: {}, hidden: false, textContent: '', children: [], removed: false,
    classList: { contains: name => classes.has(name), toggle: (name, value) => value ? classes.add(name) : classes.delete(name) },
    setAttribute: (key, value) => attributes.set(key, value), getAttribute: key => attributes.get(key), removeAttribute: key => attributes.delete(key),
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
    fire: name => listeners.get(name)?.(), appendChild(child) { this.children.push(child); }, remove() { this.removed = true; },
    querySelector: selector => { if (!slots.has(selector)) slots.set(selector, element()); return slots.get(selector); },
  };
}

function harness() {
  let active = false, loadState = 'loading', now = 100;
  const map = element(), onReturn = vi.fn();
  const doc = { hidden: false, getElementById: () => map, createElement: () => element(), defaultView: { performance: { now: () => now } } };
  const renderer = {
    init: vi.fn(() => { active = true; return true; }), isActive: () => active,
    toggleView: vi.fn(() => { active = !active; }), render: vi.fn(), getLoadState: () => loadState,
    getLoadError: () => '星系场景加载失败，请重试。', retry: vi.fn(() => { loadState = 'loading'; }),
    focusRoute: vi.fn(), resetCamera: vi.fn(), dispose: vi.fn(),
  };
  const controller = createMerchantStarmapController({ renderer, doc, onReturn });
  const [overview, loader] = map.children;
  const state = { merchant: { ships: [{ id: 'ship-1', taskId: 'task-1' }] } };
  const paint = () => { now += 40; controller.renderFrame(state); };
  return { map, doc, renderer, controller, loader, overview, onReturn, paint, setState: value => { loadState = value; } };
}

beforeEach(() => { surface.blocked = false; });

it('进入星图时显示加载层，只有实际渲染就绪后才退出', () => {
  const h = harness(); h.paint();
  expect(h.renderer.init).not.toHaveBeenCalled(); expect(h.loader.hidden).toBe(true);
  h.map.classList.toggle('is-active', true); h.paint();
  expect(h.renderer.init).toHaveBeenCalledOnce(); expect(h.loader.hidden).toBe(false);
  expect(h.overview.hidden).toBe(true); expect(h.map.getAttribute('aria-busy')).toBe('true');
  h.setState('ready'); h.paint();
  expect(h.renderer.render).toHaveBeenCalledTimes(2); expect(h.loader.hidden).toBe(true);
  expect(h.overview.hidden).toBe(false); expect(h.map.getAttribute('aria-busy')).toBe('false');
  h.controller.dispose();
});

it('加载失败有原因、重试与返回入口，不一直停留在进度动画', () => {
  const h = harness(); h.map.classList.toggle('is-active', true); h.setState('error'); h.paint();
  expect(h.loader.hidden).toBe(false);
  expect(h.loader.querySelector('[data-scene-loading-status]').textContent).toContain('加载失败');
  expect(h.loader.querySelector('[data-scene-loading-progress]').hidden).toBe(true);
  expect(h.loader.querySelector('[data-scene-retry]').hidden).toBe(false);
  h.loader.querySelector('[data-scene-retry]').fire('click'); h.paint();
  expect(h.renderer.retry).toHaveBeenCalledOnce(); expect(h.map.dataset.sceneState).toBe('loading');
  h.loader.querySelector('[data-scene-return]').fire('click'); expect(h.onReturn).toHaveBeenCalledOnce();
  h.controller.dispose();
});

it('切出、隐藏页面和阻塞弹窗都会收起加载层，回来使用当前场景', () => {
  const h = harness(); h.map.classList.toggle('is-active', true); h.paint();
  h.map.classList.toggle('is-active', false); h.paint();
  expect(h.loader.hidden).toBe(true); expect(h.renderer.toggleView).toHaveBeenCalledOnce();
  h.map.classList.toggle('is-active', true); h.doc.hidden = true; h.paint();
  expect(h.loader.hidden).toBe(true);
  h.doc.hidden = false; surface.blocked = true; h.paint(); expect(h.loader.hidden).toBe(true);
  surface.blocked = false; h.setState('ready'); h.paint();
  expect(h.renderer.init).toHaveBeenCalledOnce(); expect(h.overview.hidden).toBe(false);
  expect(h.map.dataset.sceneState).toBe('ready'); h.controller.dispose();
});

it('待加载时不提前聚焦航路，就绪后只处理一次', () => {
  const h = harness(); h.map.classList.toggle('is-active', true); h.controller.focusTask('task-1'); h.paint();
  expect(h.renderer.focusRoute).not.toHaveBeenCalled();
  h.setState('ready'); h.paint(); h.paint();
  expect(h.renderer.focusRoute).toHaveBeenCalledExactlyOnceWith({ id: 'merchant-ship-1' }); h.controller.dispose();
});

it('销毁后释放加载层、状态属性和按钮监听', () => {
  const h = harness(); h.map.classList.toggle('is-active', true); h.paint(); h.controller.dispose();
  expect(h.renderer.dispose).toHaveBeenCalledOnce(); expect(h.loader.removed).toBe(true);
  expect(h.overview.removed).toBe(true); expect(h.map.dataset.sceneState).toBeUndefined();
  expect(h.map.getAttribute('aria-busy')).toBeUndefined();
  h.loader.querySelector('[data-scene-retry]').fire('click'); h.overview.fire('click');
  expect(h.renderer.retry).not.toHaveBeenCalled(); expect(h.renderer.resetCamera).not.toHaveBeenCalled();
});
