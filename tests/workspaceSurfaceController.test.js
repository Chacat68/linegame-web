import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createWorkspaceSurfaceController } from '../js/ui/WorkspaceSurfaceController.js';

function createClassList(initialValues) {
  var values = new Set(initialValues || []);
  return {
    contains: function (value) { return values.has(value); },
    toggle: function (value, force) {
      if (force === true) values.add(value);
      else if (force === false) values.delete(value);
      else if (values.has(value)) values.delete(value);
      else values.add(value);
      return values.has(value);
    },
  };
}

function createElement(id, classes) {
  var attributes = Object.create(null);
  return {
    id: id,
    children: [],
    classList: createClassList(classes),
    dataset: {},
    focusCount: 0,
    inert: false,
    focus: function () { this.focusCount += 1; },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    setAttribute: function (name, value) { attributes[name] = String(value); },
  };
}

function createHarness(options) {
  var config = options || {};
  var main = createElement('game-main');
  var map = createElement('map-section', ['is-active']);
  var mapContainer = createElement('map-container');
  var canvas = createElement('map-3d-canvas');
  var tools = createElement('map-tools');
  var legend = createElement('map-legend');
  var market = createElement('market-overlay');
  var fleet = createElement('trade-panel');
  var archive = createElement('info-panel');
  var logs = createElement('console-panel');
  mapContainer.children = [canvas, tools];
  var elements = {
    'game-main': main,
    'map-section': map,
    'map-container': mapContainer,
    'map-3d-canvas': canvas,
    'map-legend': legend,
    'market-overlay': market,
    'trade-panel': fleet,
    'info-panel': archive,
    'console-panel': logs,
  };
  var doc = {
    defaultView: config.defaultView,
    getElementById: function (id) { return elements[id] || null; },
  };
  return {
    archive: archive,
    canvas: canvas,
    controller: createWorkspaceSurfaceController({ document: doc }),
    doc: doc,
    elements: elements,
    fleet: fleet,
    legend: legend,
    logs: logs,
    main: main,
    map: map,
    market: market,
    tools: tools,
  };
}

describe('WorkspaceSurfaceController', function () {
  it('五个 L3 的生产代码不再保留 primary/secondary 双轨入口', function () {
    var managerSource = readFileSync(new URL('../js/ui/UIManager.js', import.meta.url), 'utf8');
    var mapSource = readFileSync(new URL('../js/ui/MapUI.js', import.meta.url), 'utf8');
    var surfaceSource = readFileSync(new URL('../js/ui/SurfaceManager.js', import.meta.url), 'utf8');
    var workspaceSource = readFileSync(new URL('../js/ui/WorkspaceSurfaceController.js', import.meta.url), 'utf8');
    expect(managerSource).toContain('createWorkspaceSurfaceController');
    expect(managerSource).not.toContain('setBottomNavActiveDirectly');
    [managerSource, mapSource, surfaceSource].forEach(function (source) {
      expect(source).not.toContain('openPrimarySurface');
      expect(source).not.toContain('openSecondarySurface');
      expect(source).not.toContain('closeAllSecondarySurfaces');
    });
    expect(workspaceSource).toContain("classList.toggle('is-active'");
    expect(workspaceSource).not.toContain('visibilityClass');
    expect(workspaceSource).not.toContain('_setMapSceneInert');
  });

  it('用同一 is-active 协议激活五个同级 workspace surface', function () {
    var harness = createHarness();

    expect(harness.controller.activate('hangar')).toBe(true);

    expect(harness.fleet.classList.contains('is-active')).toBe(true);
    expect(harness.archive.classList.contains('is-active')).toBe(false);
    expect(harness.logs.classList.contains('is-active')).toBe(false);
    expect(harness.market.classList.contains('is-active')).toBe(false);
    expect(harness.map.classList.contains('is-active')).toBe(false);
    expect(harness.fleet.inert).toBe(false);
    expect(harness.archive.inert).toBe(true);
    expect(harness.map.inert).toBe(true);
    expect(harness.map.getAttribute('aria-hidden')).toBe('true');
    expect(harness.fleet.getAttribute('aria-hidden')).toBe('false');
    expect(harness.main.dataset.activeWorkspace).toBe('fleet');
    expect(harness.fleet.focusCount).toBe(1);
    expect(harness.controller.getSnapshot()).toMatchObject({
      activeWorkspace: 'fleet',
      consistent: true,
      visibleSurfaceIds: ['trade-panel'],
    });
  });

  it('trade 与 map 作为同级 surface 互斥激活，返回 map 后完整恢复', function () {
    var harness = createHarness();

    harness.controller.activate('market');
    expect(harness.market.classList.contains('is-active')).toBe(true);
    expect(harness.market.inert).toBe(false);
    expect(harness.map.inert).toBe(true);
    expect(harness.map.classList.contains('is-active')).toBe(false);
    expect(harness.map.dataset.workspaceActive).toBe('false');
    expect(harness.market.focusCount).toBe(1);
    expect(harness.controller.getSnapshot().visibleSurfaceIds).toEqual(['market-overlay']);

    harness.controller.activate('starmap');
    expect(harness.market.classList.contains('is-active')).toBe(false);
    expect(harness.map.classList.contains('is-active')).toBe(true);
    expect(harness.map.dataset.workspaceActive).toBe('true');
    expect(harness.controller.getSnapshot()).toMatchObject({
      activeWorkspace: 'map',
      consistent: true,
      visibleSurfaceIds: ['map-section'],
    });
  });

  it('快速连续切换时下一帧只允许最新工作区提交焦点', async function () {
    var harness = createHarness();
    harness.controller.activate('fleet');
    harness.controller.activate('archive');

    await Promise.resolve();

    expect(harness.fleet.focusCount).toBe(1);
    expect(harness.archive.focusCount).toBe(2);
    expect(harness.controller.getSnapshot().activeWorkspace).toBe('archive');
  });

  it('程序化进入在异步渲染后的双帧提交 canonical entry focus', function () {
    var frames = [];
    var harness = createHarness({
      defaultView: {
        requestAnimationFrame: function (callback) { frames.push(callback); },
      },
    });

    harness.controller.activate('fleet');
    expect(harness.fleet.focusCount).toBe(1);
    expect(frames).toHaveLength(1);

    frames.shift()();
    expect(harness.fleet.focusCount).toBe(1);
    expect(frames).toHaveLength(1);

    frames.shift()();
    expect(harness.fleet.focusCount).toBe(2);
    expect(harness.controller.getSnapshot()).toMatchObject({
      focusCommitCount: 2,
      lastFocusedWorkspace: 'fleet',
    });
    expect(harness.main.dataset.workspaceFocusOwner).toBe('fleet');
  });

  it('跳过隐藏或 inert 的选中页签，只聚焦当前工作区里的可见候选', async function () {
    var harness = createHarness();
    var hiddenTab = createElement('hidden-tab');
    var visibleTab = createElement('visible-tab');
    hiddenTab.closest = function () { return {}; };
    visibleTab.closest = function () { return null; };
    harness.archive.querySelectorAll = function () { return [hiddenTab, visibleTab]; };

    harness.controller.activate('archive');
    await Promise.resolve();

    expect(hiddenTab.focusCount).toBe(0);
    expect(visibleTab.focusCount).toBe(2);
    expect(harness.archive.focusCount).toBe(0);
  });

  it('目标 DOM 缺失时不篡改已激活工作区，dispose 会释放全部状态', function () {
    var harness = createHarness();
    harness.controller.activate('archive');
    delete harness.elements['console-panel'];

    expect(harness.controller.activate('logs')).toBe(false);
    expect(harness.controller.getSnapshot().activeWorkspace).toBe('archive');
    expect(harness.archive.classList.contains('is-active')).toBe(true);

    expect(harness.controller.dispose()).toBe(true);
    expect(harness.controller.dispose()).toBe(false);
    expect(harness.archive.classList.contains('is-active')).toBe(false);
    expect(harness.map.classList.contains('is-active')).toBe(true);
    expect(harness.map.inert).toBe(false);
    expect(harness.main.dataset.activeWorkspace).toBeUndefined();
    expect(harness.controller.getSnapshot().disposed).toBe(true);
  });
});
