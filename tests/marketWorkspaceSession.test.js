import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createMarketWorkspaceSession,
} from '../js/ui/MarketWorkspaceSession.js';

describe('MarketWorkspaceSession', function () {
  it('MarketUI 只通过会话端口读写工作区选择，不再复制全局状态', function () {
    var source = readFileSync('js/ui/MarketUI.js', 'utf8');
    expect(source).toContain("from './MarketWorkspaceSession.js'");
    [
      '_focusedMarketGood',
      '_activeMarketContext',
      '_marketChartRange',
      '_marketBatchPlanSortModes',
      '_activeMarketWorkspaceTab',
      '_activeMarketSubworkspaceTabs',
      '_lastMarketProgression',
      '_marketOverviewPriceMode',
    ].forEach(function (legacyOwner) {
      expect(source).not.toContain(legacyOwner);
    });
  });

  it('独立持有工作区、商品、图表和经营排序会话状态', function () {
    var session = createMarketWorkspaceSession();
    var other = createMarketWorkspaceSession();
    var progression = { workspace: { spot: { unlocked: true } } };

    session.setActiveContext({ systemId: 'sol_prime', mode: 'black' });
    session.setWorkspace('operations');
    session.setSubworkspace('operations', 'stations');
    session.setFocusedGood('sol_prime:black', 'medicine');
    session.setChartRange('sol_prime:black', 30);
    session.setOverviewPriceMode('sell');
    session.setOperationsSortModes({ investment: 'cost', upgrade: 'level', strategy: 'strategy' });
    session.setProgression(progression);

    var diagnostics = session.getDiagnostics();
    expect(diagnostics).toEqual({
      activeContext: { systemId: 'sol_prime', mode: 'black' },
      activeWorkspace: 'operations',
      activeSubworkspace: 'stations',
      subworkspaces: { spot: 'trade', capital: 'local', operations: 'stations' },
      focusedGoodId: 'medicine',
      chartRange: 30,
      overviewPriceMode: 'sell',
      operationsSortModes: { investment: 'cost', upgrade: 'level', strategy: 'strategy' },
      resetCount: 0,
    });
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics.activeContext)).toBe(true);
    expect(Object.isFrozen(diagnostics.subworkspaces)).toBe(true);
    expect(Object.isFrozen(diagnostics.operationsSortModes)).toBe(true);
    expect(session.getProgression()).toBe(progression);
    expect(other.getDiagnostics().focusedGoodId).toBeNull();
  });

  it('reset 清空所有跨存档选择并恢复稳定默认值', function () {
    var session = createMarketWorkspaceSession();
    session.setActiveContext({ systemId: 'sol_prime', mode: 'black' });
    session.setWorkspace('capital');
    session.setSubworkspace('spot', 'black');
    session.setFocusedGood('sol_prime:black', 'medicine');
    session.setChartRange('sol_prime:black', 7);
    session.setOverviewPriceMode('sell');
    session.setProgression({ id: 'old-session' });

    var reset = session.reset();

    expect(reset).toEqual({
      activeContext: null,
      activeWorkspace: 'spot',
      activeSubworkspace: 'trade',
      subworkspaces: { spot: 'trade', capital: 'local', operations: 'local' },
      focusedGoodId: null,
      chartRange: null,
      overviewPriceMode: 'buy',
      operationsSortModes: { investment: 'yield', upgrade: 'income', strategy: 'income' },
      resetCount: 1,
    });
    expect(session.getFocusedGood('sol_prime:black')).toBeNull();
    expect(session.getChartRange('sol_prime:black')).toBe(14);
    expect(session.getProgression()).toBeNull();
  });
});
