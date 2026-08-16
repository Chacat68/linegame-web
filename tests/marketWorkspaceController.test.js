import { describe, expect, it, vi } from 'vitest';
import { createMarketWorkspaceController } from '../js/core/MarketWorkspaceController.js';

function createRoot() {
  var listeners = new Map();
  return {
    dataset: {},
    addEventListener: vi.fn(function (type, listener) { listeners.set(type, listener); }),
    removeEventListener: vi.fn(function (type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    }),
    contains: function () { return true; },
    clickMode: function (mode) {
      var button = { dataset: { mode: mode }, disabled: false };
      var listener = listeners.get('click');
      if (listener) {
        listener({
          preventDefault: vi.fn(),
          target: { closest: function () { return button; } },
        });
      }
    },
  };
}

function createHarness(options) {
  var config = options || {};
  var state = config.state || { currentSystem: 'sol_prime', currentGalaxy: 'milky_way' };
  var token = { id: 'session-a' };
  var activeToken = token;
  var pendingFocus = config.pendingFocus || null;
  var root = createRoot();
  var marketUi = {
    setFocusedMarketGood: vi.fn(),
    setMarketWorkspaceFocus: vi.fn(),
    showDetail: vi.fn(),
  };
  var renderMarket = vi.fn();
  var controller = createMarketWorkspaceController({
    getState: function () { return state; },
    getSessionToken: function () { return token; },
    isSessionTokenCurrent: function (requested) { return requested === activeToken; },
    getDocument: function () {
      return { getElementById: function (id) { return id === 'market-overlay' ? root : null; } };
    },
    loadMarket: config.loadMarket || function () { return Promise.resolve(marketUi); },
    renderMarket: renderMarket,
    MapUI: {
      getMarketViewSystem: function () { return 'nova_station'; },
      consumePendingMarketPanelFocus: function () {
        var result = pendingFocus;
        pendingFocus = null;
        return result;
      },
    },
  });
  return {
    controller: controller,
    marketUi: marketUi,
    renderMarket: renderMarket,
    root: root,
    invalidateSession: function () { activeToken = { id: 'session-b' }; },
    replaceState: function (next) { state = next; },
  };
}

describe('MarketWorkspaceController', function () {
  it('恢复 pending market focus、规范化模式并交给 UI coordinator 渲染', async function () {
    var harness = createHarness({
      pendingFocus: { marketMode: 'black', goodId: 'medicine', panel: 'spot' },
    });

    await expect(harness.controller.refresh()).resolves.toBe(true);

    expect(harness.controller.getMode()).toBe('black');
    expect(harness.marketUi.setFocusedMarketGood).toHaveBeenCalledWith('nova_station', 'black', 'medicine');
    expect(harness.marketUi.showDetail).toHaveBeenCalledWith('nova_station', 'black');
    expect(harness.renderMarket).toHaveBeenCalledWith(harness.marketUi, expect.any(Object));
    expect(harness.marketUi.setMarketWorkspaceFocus).toHaveBeenCalledWith({
      marketMode: 'black',
      goodId: 'medicine',
      panel: 'spot',
    });
  });

  it('市场模式使用稳定容器事件委托，不再 clone 每个按钮', async function () {
    var harness = createHarness();

    expect(harness.controller.bindModeEvents()).toBe(true);
    expect(harness.controller.bindModeEvents()).toBe(true);
    expect(harness.root.addEventListener).toHaveBeenCalledOnce();
    expect(harness.root.dataset.marketModeEventsBound).toBe('true');

    harness.root.clickMode('black');
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.controller.getMode()).toBe('black');
    expect(harness.marketUi.showDetail).toHaveBeenCalledWith('nova_station', 'black');
    expect(harness.controller.getDiagnostics().modeChangeCount).toBe(1);
  });

  it('延迟 MarketUI 在 session 替换后不得渲染旧状态', async function () {
    var resolveMarket;
    var harness = createHarness({
      loadMarket: function () { return new Promise(function (resolve) { resolveMarket = resolve; }); },
    });

    var pending = harness.controller.refresh({ mode: 'black' });
    harness.replaceState({ currentSystem: 'earth' });
    harness.invalidateSession();
    resolveMarket(harness.marketUi);

    await expect(pending).resolves.toBe(false);
    expect(harness.marketUi.showDetail).not.toHaveBeenCalled();
    expect(harness.renderMarket).not.toHaveBeenCalled();
  });

  it('reset 重置模式，dispose 释放容器 listener', async function () {
    var harness = createHarness();
    harness.controller.bindModeEvents();
    harness.root.clickMode('black');
    await Promise.resolve();
    await Promise.resolve();

    harness.controller.reset();
    expect(harness.controller.getMode()).toBe('open');
    harness.controller.dispose();

    expect(harness.root.removeEventListener).toHaveBeenCalledOnce();
    expect(harness.root.dataset.marketModeEventsBound).toBeUndefined();
    expect(harness.controller.getDiagnostics().eventsBound).toBe(false);
  });
});
