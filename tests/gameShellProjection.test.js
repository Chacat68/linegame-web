import { describe, expect, it, vi } from 'vitest';
import { createGameShellProjection } from '../js/ui/GameShellProjection.js';

describe('GameShellProjection', function () {
  it('以单一事务投影 Header、公司、Archive 与长期路线摘要', function () {
    var state = { id: 'session-current' };
    var calls = [];
    var progress = [{ pathId: 'wealth', progress: 0.4 }];
    var interactions = {
      ensureGalaxyToggle: vi.fn(function () { calls.push('galaxy.bind'); }),
      syncVictoryProgress: vi.fn(function () { calls.push('victory.sync'); }),
    };
    var projection = createGameShellProjection({
      documentSource: { id: 'document-port' },
      interactions: interactions,
      presenters: {
        renderHeaderStatus: function (nextState, doc, onToggleReady) {
          calls.push('header');
          expect(nextState).toBe(state);
          expect(doc).toEqual({ id: 'document-port' });
          onToggleReady();
          return { credits: 4200 };
        },
        renderCompanyNetWorth: function (netWorth) {
          calls.push('company.net-worth');
          expect(netWorth).toBe(8100);
          return true;
        },
        renderCompanyOverview: function (nextState) {
          calls.push('company.overview');
          expect(nextState).toBe(state);
          return true;
        },
        renderArchiveBadges: function (nextState) {
          calls.push('archive.badges');
          expect(nextState).toBe(state);
          return { nav: 3 };
        },
      },
      victory: {
        getProgress: function (nextState) {
          calls.push('victory.progress');
          expect(nextState).toBe(state);
          return progress;
        },
        getUnlockedPaths: function () {
          calls.push('victory.paths');
          return [{ id: 'wealth' }, { id: 'exploration' }];
        },
      },
    });

    var snapshot = projection.render(state, 8100);

    expect(calls).toEqual([
      'header',
      'galaxy.bind',
      'company.net-worth',
      'company.overview',
      'archive.badges',
      'victory.progress',
      'victory.paths',
      'victory.sync',
    ]);
    expect(interactions.syncVictoryProgress).toHaveBeenCalledWith(progress, 2);
    expect(snapshot).toEqual({
      archiveBadges: { nav: 3 },
      companyNetWorthRendered: true,
      companyOverviewRendered: true,
      header: { credits: 4200 },
      netWorth: 8100,
      victoryPathCount: 1,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(projection.getDiagnostics()).toEqual({ lastSnapshot: snapshot, renderCount: 1 });
  });

  it('不持有 state 快照，并规范化无效净资产输入', function () {
    var seenStates = [];
    var projection = createGameShellProjection({
      presenters: {
        renderHeaderStatus: function (state) { seenStates.push(state); return null; },
        renderCompanyNetWorth: vi.fn(),
        renderCompanyOverview: vi.fn(),
        renderArchiveBadges: vi.fn(),
      },
      victory: { getProgress: function () { return []; } },
    });
    var stateA = { id: 'A' };
    var stateB = { id: 'B' };

    expect(projection.render(null, 500)).toBeNull();
    expect(projection.render(stateA, Number.NaN).netWorth).toBe(0);
    expect(projection.render(stateB, '1200').netWorth).toBe(1200);
    expect(seenStates).toEqual([stateA, stateB]);
    expect(projection.getDiagnostics().renderCount).toBe(2);
  });
});
