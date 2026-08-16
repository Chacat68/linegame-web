import { describe, expect, it, vi } from 'vitest';
import { createFleetActionController } from '../js/core/FleetActionController.js';
import { DEFAULT_ACTION_DIRTY_REGIONS } from '../js/core/ActionPresentation.js';
import { FLEET_COMMAND } from '../js/core/FleetCommand.js';

function createHarness(options) {
  var config = options || {};
  var trace = [];
  var presentations = [];
  var state = Object.assign({
    activeShipIndex: 0,
    currentSystem: 'sol_prime',
  }, config.state || {});
  var result = typeof config.result === 'undefined' ? { ok: true } : config.result;
  var Fleet = {
    syncShipFromState: function () { trace.push('sync-ship'); },
    syncStateFromShip: function () { trace.push('sync-state'); },
    buyShip: function () { trace.push('buy-ship'); return result; },
    switchShip: function () { trace.push('switch-ship'); return result; },
    isActiveDispatched: function () { return config.activeDispatched === true; },
    upgradeShip: function () { trace.push('upgrade-ship'); return result; },
    assignRoute: function () { trace.push('assign-route'); return result; },
    cancelRoute: function () { trace.push('cancel-route'); return result; },
    buySlot: function () { trace.push('buy-slot'); return result; },
    sellShip: function () { trace.push('sell-ship'); return result; },
    installMod: function () { trace.push('install-mod'); return result; },
    uninstallMod: function () { trace.push('uninstall-mod'); return result; },
    serviceShip: function () { trace.push('service-ship'); return result; },
  };
  var Crew = {
    recruitCrew: function () { trace.push('recruit-crew'); return result; },
    assignCrewToShip: function () { trace.push('assign-crew'); return result; },
    unassignCrewFromShip: function () { trace.push('unassign-crew'); return result; },
    getCrewById: function () { trace.push('get-crew'); return { assignedShipIndex: 0 }; },
    dismissCrew: function () { trace.push('dismiss-crew'); return result; },
  };
  var controller = createFleetActionController({
    getState: function () { trace.push('get-state'); return state; },
    systems: {
      Fleet: Fleet,
      Crew: Crew,
      MidgameTeachingChain: {
        getActiveChain: function () { return config.activeTeachingChain || null; },
      },
    },
    dispatch: function (dispatchedResult, presentation) {
      trace.push('dispatch');
      presentations.push({ result: dispatchedResult, presentation: presentation });
    },
    recordQuestProgress: function (payload) { trace.push('quest:' + payload.action); },
    completeTeachingStep: function (chainId, stepId) { trace.push('teach:' + chainId + ':' + stepId); },
    startDispatchClock: function () { trace.push('start-clock'); },
    stopDispatchClock: function () { trace.push('stop-clock'); },
    resetRealtimeClock: function () { trace.push('reset-clock'); },
    cancelShipFlight: function () { trace.push('cancel-flight'); },
    setRecentModInstallContext: function (context) { trace.push('mod-context:' + context.modId); },
    showCompletion: function (completion) { trace.push('completion:' + completion.message); },
    getRouteGuidance: function () { return config.routeGuidance || null; },
    getDispatchContext: function () { return { shipIndex: 0 }; },
    now: function () { return 123; },
  });
  return {
    controller: controller,
    trace: trace,
    presentations: presentations,
    state: state,
    Fleet: Fleet,
    Crew: Crew,
  };
}

describe('FleetActionController', function () {
  it('激活船派遣在发布 UI 刷新前完成任务与教学进度', function () {
    var harness = createHarness({
      activeTeachingChain: { chain: { id: 'dispatch-ops' } },
    });

    var result = harness.controller.onAssignRoute(0, 'sol_prime', 'vega_port', 'ore', {});

    expect(result).toEqual({ ok: true });
    expect(harness.trace).toEqual([
      'get-state',
      'sync-ship',
      'assign-route',
      'cancel-flight',
      'quest:dispatch_route',
      'teach:dispatch-ops:prefill-profitable-dispatch',
      'dispatch',
      'start-clock',
      'completion:已确认自动跑商路线',
    ]);
    expect(harness.presentations[0].presentation.dirtyRegions).toEqual(DEFAULT_ACTION_DIRTY_REGIONS);
  });

  it('科研补给只在推荐路线完全匹配时推进教学步骤', function () {
    var findResearchSupplyRoute = vi.fn(function () {
      return { goodId: 'technology', buySystemId: 'sol_prime', sellSystemId: 'vega_port' };
    });
    var harness = createHarness({
      activeTeachingChain: { chain: { id: 'research-supply' } },
      routeGuidance: { findResearchSupplyRoute: findResearchSupplyRoute },
    });

    harness.controller.onAssignRoute(1, 'sol_prime', 'vega_port', 'technology', {});

    expect(findResearchSupplyRoute).toHaveBeenCalledWith(harness.state, { shipIndex: 0 });
    expect(harness.trace).toContain('teach:research-supply:prefill-research-supply-dispatch');
    expect(harness.trace).not.toContain('start-clock');
    expect(harness.trace).not.toContain('cancel-flight');
  });

  it('失败派遣只提交结果，不启动计时器或记录进度', function () {
    var harness = createHarness({ result: { ok: false } });

    harness.controller.onAssignRoute(0, 'sol_prime', 'vega_port', 'ore', {});

    expect(harness.trace).toEqual(['get-state', 'sync-ship', 'assign-route', 'dispatch']);
  });

  it('切船先停止旧派遣，成功后按新船状态恢复派遣并重置实时时钟', function () {
    var harness = createHarness({ activeDispatched: true });

    harness.controller.onSwitchShip(1);

    expect(harness.trace).toEqual([
      'get-state',
      'stop-clock',
      'sync-ship',
      'switch-ship',
      'dispatch',
      'start-clock',
      'reset-clock',
    ]);
    expect(harness.state.lastSwitchedShipIndex).toBe(1);
    expect(harness.state.lastShipSwitchAt).toEqual(expect.any(Number));
  });

  it('取消激活船路线即使系统返回失败也停止旧派遣时钟', function () {
    var harness = createHarness({ result: { ok: false } });

    harness.controller.onCancelRoute(0);

    expect(harness.trace).toEqual(['get-state', 'cancel-route', 'dispatch', 'stop-clock']);
  });

  it('改装和保养成功后发布对应完成反馈', function () {
    var harness = createHarness();

    harness.controller.onInstallMod(0, 'mod_cargo_rack');
    harness.controller.onServiceShip(0, 'standard');

    expect(harness.trace).toContain('mod-context:mod_cargo_rack');
    expect(harness.trace).toContain('completion:已安装「扩展货架」');
    expect(harness.trace).toContain('completion:已完成港口保养');
  });

  it('船员变更只在影响激活船时同步扁平 state', function () {
    var harness = createHarness();

    harness.controller.onAssignCrew(1, 'crew-a');
    harness.controller.onUnassignCrew(0, 'crew-b');
    harness.controller.onDismissCrew('crew-c');

    expect(harness.trace.filter(function (entry) { return entry === 'sync-state'; })).toHaveLength(2);
    expect(harness.trace).not.toContain('quest:recruit_crew');
  });

  it('每个动作重新读取 provider，不缓存旧会话 state', function () {
    var currentState = { activeShipIndex: 0, currentSystem: 'one' };
    var seen = [];
    var controller = createFleetActionController({
      getState: function () { return currentState; },
      systems: {
        Fleet: {
          syncShipFromState: function (state) { seen.push(state); },
          buyShip: function () { return { ok: true }; },
        },
      },
      dispatch: function () {},
    });

    controller.onBuyShip('freighter');
    currentState = { activeShipIndex: 0, currentSystem: 'two' };
    controller.onBuyShip('clipper');

    expect(seen.map(function (state) { return state.currentSystem; })).toEqual(['one', 'two']);
  });

  it('单一 command 端口复用既有领域动作时序并拒绝非法 payload', function () {
    var harness = createHarness();

    expect(harness.controller.handleCommand({
      type: FLEET_COMMAND.BUY_SHIP,
      shipTypeId: 'freighter',
    })).toEqual({ ok: true });
    expect(harness.controller.handleCommand({
      type: FLEET_COMMAND.SERVICE_SHIP,
      shipIndex: 0,
      tierId: 'standard',
    })).toEqual({ ok: true });
    expect(harness.controller.handleCommand({
      type: FLEET_COMMAND.DISMISS_CREW,
      crewId: 'crew-a',
    })).toEqual({ ok: true });
    expect(harness.controller.handleCommand({
      type: FLEET_COMMAND.SWITCH_SHIP,
      shipIndex: -1,
    })).toBe(false);

    expect(harness.trace).toContain('buy-ship');
    expect(harness.trace).toContain('service-ship');
    expect(harness.trace).toContain('dismiss-crew');
  });
});
