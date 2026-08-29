import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { UI_REGION } from '../js/core/ActionPresentation.js';
import { createGameUiWorkspaceRenderer } from '../js/ui/GameUiWorkspaceRenderer.js';

function createRenderer(overrides) {
  var config = overrides || {};
  return createGameUiWorkspaceRenderer(Object.assign({
    getState: function () { return { currentSystem: 'sol', currentGalaxy: 'milky-way' }; },
    getLoadedFeature: function () { return null; },
    recordRender: vi.fn(),
  }, config));
}

describe('GameUiWorkspaceRenderer', function () {
  it('用最新市场视图和单一 command 构造请求并记录完整区域', function () {
    var onCommand = vi.fn();
    var onAfterRender = vi.fn();
    var connectMarket = vi.fn();
    var recordRender = vi.fn();
    var render = vi.fn();
    var renderer = createRenderer({
      actions: { market: { getMode: function () { return 'black'; }, onCommand: onCommand, onAfterRender: onAfterRender } },
      contextAdapters: { connectMarket: connectMarket },
      marketWorkspace: {
        getViewSystem: function () { return 'alpha'; },
        getViewGalaxy: function () { return 'andromeda'; },
      },
      recordRender: recordRender,
    });

    expect(renderer.renderMarket({ render: render })).toBe(true);
    expect(render).toHaveBeenCalledWith({
      state: { currentSystem: 'sol', currentGalaxy: 'milky-way' },
      systemId: 'alpha',
      marketMode: 'black',
      galaxyId: 'andromeda',
      onCommand: onCommand,
    });
    expect(connectMarket).toHaveBeenCalledOnce();
    expect(onAfterRender).toHaveBeenCalledOnce();
    expect(recordRender).toHaveBeenCalledWith([
      UI_REGION.MARKET_CHROME,
      UI_REGION.MARKET_SPOT,
      UI_REGION.MARKET_CAPITAL,
      UI_REGION.MARKET_OPERATIONS,
    ]);
  });

  it('Fleet 区域共享 typed command，只渲染请求的局部区域', function () {
    var command = vi.fn();
    var render = vi.fn();
    var renderShop = vi.fn();
    var connectFleet = vi.fn();
    var recordRender = vi.fn();
    var module = { render: render, renderShop: renderShop, setLifecycleActions: vi.fn() };
    var renderer = createRenderer({
      actions: { fleet: { handleCommand: command } },
      contextAdapters: { connectFleet: connectFleet },
      recordRender: recordRender,
    });

    expect(renderer.renderFleetRegions(module, { id: 'state' }, [UI_REGION.FLEET_SHOP])).toBe(true);
    expect(render).not.toHaveBeenCalled();
    expect(renderShop).toHaveBeenCalledWith({ state: { id: 'state' }, onCommand: command });
    expect(connectFleet).toHaveBeenCalledWith(module);
    expect(recordRender).toHaveBeenCalledWith([UI_REGION.FLEET_SHOP]);
  });

  it('Archive 只为任务/科研解析派遣上下文，并由薄 Coordinator 路由', function () {
    var getDispatchContext = vi.fn(function () { return { shipIndex: 2 }; });
    var handleCommand = vi.fn();
    var questRender = vi.fn();
    var factionRender = vi.fn();
    var renderer = createRenderer({
      actions: { archive: { getDispatchContext: getDispatchContext, handleCommand: handleCommand } },
    });

    renderer.renderArchiveRegions({ QuestUI: { render: questRender }, FactionUI: { render: factionRender } }, { id: 'state' }, [UI_REGION.ARCHIVE_FACTION]);
    expect(getDispatchContext).not.toHaveBeenCalled();
    expect(factionRender).toHaveBeenCalledWith({ state: { id: 'state' }, onCommand: handleCommand });

    renderer.renderArchiveRegions({ QuestUI: { render: questRender } }, { id: 'state' }, [UI_REGION.ARCHIVE_QUEST]);
    expect(getDispatchContext).toHaveBeenCalledOnce();
    expect(questRender).toHaveBeenCalledWith({
      state: { id: 'state' },
      dispatchContext: { shipIndex: 2 },
      onCommand: handleCommand,
    });

    var coordinator = readFileSync('js/ui/GameUiCoordinator.js', 'utf8');
    expect(coordinator).toContain("from './GameUiWorkspaceRenderer.js'");
    expect(coordinator).toContain("from './GameUiRenderSession.js'");
    expect(coordinator.split('\n').length).toBeLessThan(450);
  });
});
