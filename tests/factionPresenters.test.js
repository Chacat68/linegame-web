import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import { buildFactionBoardView, getFactionMarketAction } from '../js/ui/FactionBoardPresenter.js';
import { buildFactionContextView, buildFactionWorkspaceDetailView } from '../js/ui/FactionDetailPresenter.js';
import { createTestState } from './helpers.js';

describe('Faction presenters', function () {
  it('纯投影外交总览、关系信号、卡片与市场 intent', function () {
    var state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      factionRelations: { federation: 42, syndicate: -20, technocracy: 0 },
    });
    Faction.init(state);
    var view = buildFactionBoardView({ state: state });

    expect(Object.isFrozen(view)).toBe(true);
    expect(view.relationCount).toBeGreaterThan(0);
    expect(view.html).toContain('archive-faction-console');
    expect(view.html).toContain('关系信号');
    expect(view.html).toContain('data-faction-id="federation"');
    expect(view.html).toContain('data-faction-market="true"');
    expect(view.html).toContain('role="progressbar"');
  });

  it('Context 与 L4 详情由独立 Presenter 生成并拒绝错误类型', function () {
    var state = createTestState({ factionRelations: { federation: 42 } });
    Faction.init(state);
    var contextView = buildFactionContextView({ context: { type: 'faction', id: 'federation' }, state: state });
    var detailView = buildFactionWorkspaceDetailView({ detail: { type: 'archive-faction', id: 'federation' }, state: state });

    expect(contextView.html).toContain('workspace-context-card--faction');
    expect(contextView.html).toContain('查看完整派系详情');
    expect(detailView.html).toContain('控制地点');
    expect(Object.isFrozen(contextView)).toBe(true);
    expect(Object.isFrozen(detailView)).toBe(true);
    expect(buildFactionContextView({ context: { type: 'quest', id: 'federation' }, state: state })).toBeNull();
  });

  it('市场 CTA helper 保持兼容并且不修改派系定义', function () {
    var state = createTestState({ currentSystem: 'sol_prime', factionRelations: { syndicate: 45 } });
    Faction.init(state);
    var action = getFactionMarketAction(state, 'syndicate');
    expect(action).toEqual(expect.objectContaining({
      factionId: 'syndicate',
      actionId: 'market',
      commandSurface: 'market',
    }));
    expect(getFactionMarketAction(state, 'missing')).toBeNull();
  });

  it('源码所有权阻止 DOM、listener 和领域 selector 回流兼容门面', function () {
    var facade = readFileSync('js/ui/FactionUI.js', 'utf8');
    var board = readFileSync('js/ui/FactionBoardPresenter.js', 'utf8');
    var detail = readFileSync('js/ui/FactionDetailPresenter.js', 'utf8');
    var controller = readFileSync('js/ui/FactionBoardController.js', 'utf8');

    expect(facade).toContain("from './FactionBoardController.js'");
    expect(facade).toContain("from './FactionBoardPresenter.js'");
    expect(facade).toContain("from './FactionDetailPresenter.js'");
    expect(facade).not.toContain('querySelectorAll');
    expect(facade).not.toContain('addEventListener');
    expect(facade).not.toContain('FactionSystem');
    expect(board).not.toContain('document.');
    expect(board).not.toContain('onclick');
    expect(detail).not.toContain('document.');
    expect(controller).not.toContain('innerHTML');
  });
});
