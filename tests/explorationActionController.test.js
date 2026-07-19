import { describe, expect, it } from 'vitest';
import {
  getProcessingMessage,
  handleExplorationAction,
  isExplorationAction,
} from '../js/core/ExplorationActionController.js';

function createContext(extra) {
  var calls = [];
  var state = { currentSystem: 'sol_prime' };
  var context = Object.assign({
    getState: function () { return state; },
    prepareDirectExecution: function () { calls.push(['prepareDirectExecution']); },
    explorePoi: function (systemId, poiId) { calls.push(['explorePoi', systemId, poiId]); },
    refreshActionGuide: function () { calls.push(['refreshActionGuide']); },
  }, extra || {});
  context.calls = calls;
  context.state = state;
  return context;
}

describe('ExplorationActionController', function () {
  it('识别探索行动并返回稳定处理提示', function () {
    expect(isExplorationAction('exploration.poi')).toBe(true);
    expect(isExplorationAction('exploration.land')).toBe(false);
    expect(isExplorationAction('exploration.scan')).toBe(false);
    expect(isExplorationAction('market.open')).toBe(false);
    expect(getProcessingMessage()).toBe('已执行探索指令，正在刷新现场建议');
  });

  it('探索点 行动会转发目标星系和探索点', function () {
    var context = createContext();

    handleExplorationAction({
      actionType: 'exploration.poi',
      payload: { systemId: 'alpha_centauri', poiId: 'poi_1' },
    }, context);

    expect(context.calls).toEqual([
      ['prepareDirectExecution'],
      ['explorePoi', 'alpha_centauri', 'poi_1'],
    ]);
  });

  it('探索点 行动缺少 poiId 时只刷新行动条', function () {
    var context = createContext();

    handleExplorationAction({
      actionType: 'exploration.poi',
      payload: { systemId: 'sol_prime' },
    }, context);

    expect(context.calls).toEqual([
      ['refreshActionGuide'],
    ]);
  });
});
