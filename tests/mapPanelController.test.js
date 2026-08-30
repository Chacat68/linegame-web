import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createMapPanelController } from '../js/ui/MapPanelController.js';

function eventFor(target, type) {
  return {
    type: type || 'click',
    target: target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

function targetFor(selector, dataset, options) {
  return {
    dataset: dataset || {},
    disabled: !!(options && options.disabled),
    closest: function (candidate) {
      return candidate === selector ? this : null;
    },
  };
}

describe('MapPanelController', function () {
  it('独占星系、星球与探索 intent 解析，MapUI 只注入动作端口', function () {
    var controllerSource = readFileSync('js/ui/MapPanelController.js', 'utf8');
    var mapSource = readFileSync('js/ui/MapUI.js', 'utf8');

    expect(controllerSource).not.toMatch(/GameManager|ExplorationSystem/);
    expect(controllerSource).toContain("getElementById('planet-detail-panel')");
    expect(mapSource).toContain("from './MapPanelController.js'");
    expect(mapSource).not.toMatch(/\bdocument\b|getElementById\('planet-detail-panel'\)/);
    expect(mapSource).not.toContain("closest('[data-exploration-action]')");
    expect(mapSource).not.toContain("closest('[data-planet-detail-action]')");
    expect(mapSource).not.toContain("closest('[data-galaxy-action]')");
  });

  it('把星系和星球按钮路由到显式动作端口', function () {
    var calls = [];
    var controller = createMapPanelController({
      closeDetail: function () { calls.push(['close']); },
      openGalaxy: function (id) { calls.push(['galaxy', id]); },
      openSurvey: function (id, origin) { calls.push(['survey', id, origin]); },
      returnToPlanets: function () { calls.push(['return']); },
      travel: function (id) { calls.push(['travel', id]); },
    });
    var panel = { contains: function () { return true; } };

    controller.handleClick(eventFor(targetFor('[data-galaxy-action]', {
      galaxyAction: 'open',
      galaxyId: 'andromeda',
    })), panel);
    controller.handleClick(eventFor(targetFor('[data-galaxy-action]', {
      galaxyAction: 'return-planets',
    })), panel);
    controller.handleClick(eventFor(targetFor('[data-planet-detail-action]', {
      planetDetailAction: 'travel',
      systemId: 'nova_station',
    })), panel);
    var surveyButton = targetFor('[data-planet-detail-action]', {
      planetDetailAction: 'open-survey',
      systemId: 'sol_prime',
    });
    controller.handleClick(eventFor(surveyButton), panel);
    controller.handleClick(eventFor(targetFor('[data-planet-detail-action]', {
      planetDetailAction: 'close-detail',
    })), panel);

    expect(calls).toEqual([
      ['galaxy', 'andromeda'],
      ['return'],
      ['travel', 'nova_station'],
      ['survey', 'sol_prime', surveyButton],
      ['close'],
    ]);
  });

  it('把市场焦点与 POI 调查委派给当前探索端口，禁用按钮无副作用', function () {
    var openMarket = vi.fn();
    var explorePoi = vi.fn();
    var controller = createMapPanelController({ openMarket: openMarket, explorePoi: explorePoi });
    var panel = { contains: function () { return true; } };

    var marketEvent = eventFor(targetFor('[data-exploration-action]', {
      explorationAction: 'market',
      marketMode: 'detail',
      marketSubworkspaceId: 'local',
      marketWorkspaceId: 'trade',
      systemId: 'sol_prime',
    }));
    controller.handleClick(marketEvent, panel);
    controller.handleClick(eventFor(targetFor('[data-exploration-action]', {
      explorationAction: 'poi',
      poiId: 'ancient_signal',
      systemId: 'sol_prime',
    })), panel);
    var disabledEvent = eventFor(targetFor('[data-exploration-action]', {
      explorationAction: 'poi',
      poiId: 'blocked',
      systemId: 'sol_prime',
    }, { disabled: true }));
    controller.handleClick(disabledEvent, panel);

    expect(openMarket).toHaveBeenCalledWith('sol_prime', {
      marketMode: 'detail',
      subworkspaceId: 'local',
      workspaceId: 'trade',
    });
    expect(explorePoi).toHaveBeenCalledTimes(1);
    expect(explorePoi).toHaveBeenCalledWith('sol_prime', 'ancient_signal');
    expect(marketEvent.preventDefault).toHaveBeenCalledOnce();
    expect(disabledEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('同步 disclosure、统一 Escape，并只绑定一次生命周期 listener', function () {
    var changes = [];
    var closeDetail = vi.fn(function () { return true; });
    var listeners = [];
    var panel = {
      dataset: {},
      contains: function () { return true; },
    };
    var getElementById = vi.fn(function (id) {
      return id === 'planet-detail-panel' ? panel : null;
    });
    var controller = createMapPanelController({
      closeDetail: closeDetail,
      getDocument: function () { return { getElementById: getElementById }; },
      hasSelectedSystem: function () { return true; },
      setDisclosure: function (id, open) { changes.push([id, open]); },
    });
    var listen = function () { listeners.push(Array.from(arguments)); };

    expect(controller.bindRoot(listen)).toBe(true);
    expect(controller.bindRoot(listen)).toBe(false);
    expect(getElementById).toHaveBeenCalledWith('planet-detail-panel');
    expect(listeners).toHaveLength(4);

    var details = { tagName: 'DETAILS', dataset: { detailSection: 'archive' }, open: false };
    var summary = targetFor('summary', {});
    summary.parentElement = details;
    controller.handleDisclosureClick(eventFor(summary), panel);
    details.open = true;
    controller.handleToggle({ target: details, type: 'toggle' });
    expect(changes).toEqual([['archive', true], ['archive', true]]);

    var escapeEvent = eventFor(null, 'keydown');
    escapeEvent.key = 'Escape';
    expect(controller.handleKeydown(escapeEvent)).toBe(true);
    expect(closeDetail).toHaveBeenCalledOnce();
    expect(escapeEvent.preventDefault).toHaveBeenCalledOnce();
    expect(escapeEvent.stopPropagation).toHaveBeenCalledOnce();
  });
});
