import { describe, expect, it, vi } from 'vitest';
import { createMarketWorkspaceEntrySession } from '../js/ui/MarketWorkspaceEntrySession.js';
import { createMarketWorkspaceEntryController } from '../js/ui/MarketWorkspaceEntryController.js';

function createClassList() {
  var values = new Set();
  return {
    contains: function (value) { return values.has(value); },
    toggle: function (value, force) {
      if (force) values.add(value);
      else values.delete(value);
    },
  };
}

function createElement(ownerDocument) {
  var listeners = Object.create(null);
  var attributes = Object.create(null);
  var children = [];
  return {
    ownerDocument: ownerDocument,
    classList: createClassList(),
    dataset: {},
    children: children,
    appendChild: function (child) { children.push(child); },
    addEventListener: function (name, handler) {
      if (!listeners[name]) listeners[name] = [];
      listeners[name].push(handler);
    },
    removeEventListener: function (name, handler) {
      listeners[name] = (listeners[name] || []).filter(function (item) { return item !== handler; });
    },
    dispatch: function (name, event) {
      (listeners[name] || []).forEach(function (handler) { handler(event || { target: this }); }, this);
    },
    listenerCount: function (name) { return (listeners[name] || []).length; },
    setAttribute: function (name, value) { attributes[name] = String(value); },
    getAttribute: function (name) { return attributes[name] || null; },
    set innerHTML(value) {
      if (value === '') children.splice(0);
    },
  };
}

function createDocument() {
  var elements = Object.create(null);
  var doc = {
    createElement: function () { return createElement(doc); },
    getElementById: function (id) { return elements[id] || null; },
  };
  ['market-view-btn', 'market-close-btn', 'market-show-sell', 'market-galaxy-nav'].forEach(function (id) {
    elements[id] = createElement(doc);
  });
  return { document: doc, elements: elements };
}

describe('MarketWorkspaceEntry', function () {
  it('入口会话独立持有打开状态、浏览地点和一次性聚焦请求', function () {
    var session = createMarketWorkspaceEntrySession();
    session.open();
    session.setMode('overview');
    session.setViewGalaxy('andromeda');
    session.setViewSystem('nova_station');
    session.setPendingFocus({ workspaceId: 'spot', goodId: 'medicine' });

    expect(session.getDiagnostics()).toEqual({
      mode: 'overview',
      open: true,
      pendingFocus: {
        workspaceId: 'spot',
        subworkspaceId: '',
        marketMode: '',
        goodId: 'medicine',
        tradeAction: '',
      },
      resetCount: 0,
      viewingGalaxyId: 'andromeda',
      viewingSystemId: 'nova_station',
    });
    expect(Object.isFrozen(session.getPendingFocus())).toBe(true);
    expect(session.takePendingFocus().goodId).toBe('medicine');
    expect(session.getPendingFocus()).toBeNull();
    expect(session.reset()).toMatchObject({ mode: 'detail', open: false, resetCount: 1 });
  });

  it('controller 统一入口按钮、星系导航、刷新和释放，不依赖 MapUI', function () {
    var harness = createDocument();
    var state = {
      currentGalaxy: 'milky_way',
      currentSystem: 'sol_prime',
      visitedGalaxies: ['milky_way', 'andromeda'],
    };
    var navigate = vi.fn(function () { return true; });
    var refresh = vi.fn();
    var controller = createMarketWorkspaceEntryController({
      getState: function () { return state; },
      getDocument: function () { return harness.document; },
      navigate: navigate,
      refresh: refresh,
      galaxies: [
        { id: 'milky_way', name: '银河系', icon: '◎' },
        { id: 'andromeda', name: '仙女座', icon: '◇' },
      ],
      getContextualMarketFocus: function () { return { workspaceId: 'spot', goodId: 'water' }; },
    });

    expect(controller.init()).toBe(true);
    expect(controller.init()).toBe(false);
    harness.elements['market-view-btn'].dispatch('click');
    expect(navigate).toHaveBeenCalledWith('trade');

    expect(controller.open(state)).toBe(true);
    expect(controller.isOpen()).toBe(true);
    expect(harness.elements['market-view-btn'].classList.contains('active')).toBe(true);
    expect(harness.elements['market-view-btn'].getAttribute('aria-pressed')).toBe('true');
    expect(harness.elements['market-galaxy-nav'].children).toHaveLength(2);
    expect(controller.consumePendingFocus()).toMatchObject({ workspaceId: 'spot', goodId: 'water' });

    var remoteButton = harness.elements['market-galaxy-nav'].children[1];
    harness.elements['market-galaxy-nav'].dispatch('click', {
      target: { closest: function () { return remoteButton; } },
    });
    expect(controller.getViewGalaxy(state)).toBe('andromeda');
    expect(refresh).toHaveBeenCalled();

    state = Object.assign({}, state, { currentGalaxy: 'andromeda', currentSystem: 'nova_station' });
    expect(controller.refreshLocation()).toBe(true);
    expect(controller.getViewSystem(state)).toBe('nova_station');
    expect(controller.close()).toBe(true);
    expect(harness.elements['market-view-btn'].getAttribute('aria-pressed')).toBe('false');
    expect(controller.dispose()).toBe(true);
    expect(harness.elements['market-view-btn'].listenerCount('click')).toBe(0);
  });
});
