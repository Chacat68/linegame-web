import { describe, expect, it } from 'vitest';
import { createFactionBoardController } from '../js/ui/FactionBoardController.js';

function createTarget(selector, dataset, textContent) {
  return {
    dataset: Object.assign({}, dataset || {}),
    textContent: textContent || '',
    closest: function (candidate) { return candidate === selector ? this : null; },
  };
}

function createContainer() {
  return { onclick: null, onkeydown: null };
}

describe('FactionBoardController', function () {
  it('市场按钮发布完整动作并同步检查对应派系', function () {
    var trace = [];
    var container = createContainer();
    var controller = createFactionBoardController({
      inspectFaction: function (factionId, source) { trace.push(['inspect', factionId, source]); },
    });
    controller.bind(container, {
      onOpenFactionMarket: function (action) { trace.push(['market', action]); },
    });
    container.onclick({ target: createTarget('[data-faction-market="true"]', {
      factionId: 'syndicate',
      factionName: '星际辛迪加',
      systemId: 'shadow_haven',
      systemName: '暗影港湾',
      marketWorkspaceId: 'spot',
      marketSubworkspaceId: 'black',
      marketFocusLabel: '黑市交易',
      marketMode: 'black',
      marketHint: '已解锁黑市',
      commandSurface: 'market',
      commandIntent: '黑市交易',
      commandVerb: '查看黑市',
    }) });

    expect(trace[0]).toEqual(['market', expect.objectContaining({
      actionId: 'market',
      factionId: 'syndicate',
      marketSubworkspaceId: 'black',
      commandIntent: '黑市交易',
    })]);
    expect(trace[1]).toEqual(['inspect', 'syndicate', 'archive-faction-card']);
    expect(controller.getDiagnostics()).toEqual(expect.objectContaining({
      bindCount: 1,
      intentCount: 1,
      lastIntent: 'faction.market.open',
      activeContext: { hasMarketAction: true },
    }));
    expect(Object.isFrozen(controller.getDiagnostics())).toBe(true);
    expect(Object.isFrozen(controller.getDiagnostics().activeContext)).toBe(true);
  });

  it('卡片点击与 Enter/Space 使用同一检查端口', function () {
    var inspected = [];
    var container = createContainer();
    var controller = createFactionBoardController({
      inspectFaction: function (factionId) { inspected.push(factionId); },
    });
    controller.bind(container, {});
    container.onclick({ target: createTarget('.faction-card[data-faction-id]', { factionId: 'federation' }) });
    var prevented = false;
    container.onkeydown({
      key: ' ',
      target: createTarget('.faction-card[data-faction-id]', { factionId: 'technocracy' }),
      preventDefault: function () { prevented = true; },
    });
    expect(prevented).toBe(true);
    expect(inspected).toEqual(['federation', 'technocracy']);
    expect(controller.getDiagnostics().intentCount).toBe(2);
  });

  it('重新绑定和 reset 会解绑旧根节点', function () {
    var first = createContainer();
    var second = createContainer();
    var controller = createFactionBoardController({});
    controller.bind(first, {});
    controller.bind(second, {});
    expect(first.onclick).toBeNull();
    expect(first.onkeydown).toBeNull();
    expect(second.onclick).toEqual(expect.any(Function));

    var diagnostics = controller.reset();
    expect(second.onclick).toBeNull();
    expect(second.onkeydown).toBeNull();
    expect(diagnostics).toEqual(expect.objectContaining({ bindCount: 0, resetCount: 1, activeContext: null }));
  });
});
