import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import { createFleetShipDetailController } from '../js/ui/FleetShipDetailController.js';
import { createTestState } from './helpers.js';

function createHarness() {
  var state = createTestState();
  Fleet.init(state);
  state.fleet[0].cargo = { food: 2 };
  return {
    contextHost: { innerHTML: '' },
    controller: createFleetShipDetailController(),
    detailHost: { innerHTML: '' },
    state: state,
  };
}

describe('FleetShipDetailController', function () {
  it('组合 Fleet/Crew selector 并投影舰船 Context 摘要', function () {
    var harness = createHarness();
    expect(harness.controller.renderContextInspector({
      context: { type: 'ship', id: '0' },
      container: harness.contextHost,
      state: harness.state,
    })).toEqual({ title: '舰船检查' });

    expect(harness.contextHost.innerHTML).toContain('workspace-context-card--ship');
    expect(harness.contextHost.innerHTML).toContain('当前操控舰');
    expect(harness.contextHost.innerHTML).toContain('<small>货舱</small><strong>2/');
    expect(harness.contextHost.innerHTML).toContain('data-context-action="open-detail"');
    expect(harness.controller.getDiagnostics()).toEqual({ contextRenderCount: 1, detailRenderCount: 0 });
  });

  it('投影 L4 舰船详情并拒绝错误类型或越界索引', function () {
    var harness = createHarness();
    expect(harness.controller.renderWorkspaceDetail({
      container: harness.detailHost,
      detail: { type: 'fleet-ship', id: '0' },
      state: harness.state,
    })).toEqual({ title: harness.state.fleet[0].name + ' · 舰船详情' });
    expect(harness.detailHost.innerHTML).toContain('workspace-detail-section--ship');
    expect(harness.detailHost.innerHTML).toContain('舰队工作区内确认');

    expect(harness.controller.renderContextInspector({
      context: { type: 'commodity', id: '0' }, container: harness.contextHost, state: harness.state,
    })).toBe(false);
    expect(harness.controller.renderWorkspaceDetail({
      container: harness.detailHost, detail: { type: 'fleet-ship', id: '999' }, state: harness.state,
    })).toBe(false);
    expect(harness.controller.getDiagnostics()).toEqual({ contextRenderCount: 0, detailRenderCount: 1 });
  });

  it('FleetUI 只委托 Context/L4 端口，不再直接读取 Fleet/Crew selector', function () {
    var fleetUi = readFileSync('js/ui/FleetUI.js', 'utf8');
    expect(fleetUi).toContain("from './FleetShipDetailController.js'");
    expect(fleetUi).not.toContain("from '../systems/fleet/FleetSystem.js'");
    expect(fleetUi).not.toContain("from '../systems/fleet/CrewSystem.js'");
    expect(fleetUi).not.toContain('buildFleetShipContextView(');
    expect(fleetUi).not.toContain('buildFleetShipDetailView(');
    expect(fleetUi.split('\n').length).toBeLessThan(450);
    expect(Object.isFrozen(createFleetShipDetailController().getDiagnostics())).toBe(true);
  });
});
