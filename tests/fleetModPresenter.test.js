import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import {
  FLEET_MOD_INTENT,
  buildFleetModModel,
  readFleetModIntent,
  renderFleetMod,
} from '../js/ui/FleetModPresenter.js';
import { createTestState } from './helpers.js';

function createIntentTarget(type, options) {
  var opts = options || {};
  var element = {
    dataset: { fleetModIntent: type },
    disabled: !!opts.disabled,
  };
  if (opts.shipIndex !== undefined) element.dataset.shipIndex = String(opts.shipIndex);
  if (opts.modId !== undefined) element.dataset.modId = opts.modId;
  if (opts.upgradeId !== undefined) element.dataset.upgradeId = opts.upgradeId;
  return {
    closest: function (selector) {
      return selector === '[data-fleet-mod-intent]' ? element : null;
    },
  };
}

describe('FleetModPresenter', function () {
  it('构造最新改装模型，并统一结构、组件、保养与资产限制', function () {
    var state = createTestState({ credits: 50000 });
    Fleet.init(state);
    state.fleet[0].maintenance = 42;

    var model = buildFleetModModel(state, 0, {
      focusModId: 'mod_service_bay',
      focusService: true,
    });

    expect(model.ship).toBe(state.fleet[0]);
    expect(model.focusModId).toBe('mod_service_bay');
    expect(model.focusService).toBe(true);
    expect(model.structureModules).toHaveLength(4);
    expect(model.componentGroups).toHaveLength(4);
    expect(model.repairQuote).toBeTruthy();
    expect(model.maintenance.value).toBe(42);
    expect(model.modRecommendation.modId).toBe('mod_service_bay');
    expect(model.sellDisabledReason).toBe('至少保留一艘船。');
    expect(buildFleetModModel(state, -1)).toBeNull();
    expect(buildFleetModModel(state, 99)).toBeNull();
  });

  it('输出完整详情分区、焦点标记和五类单一 intent', function () {
    var state = createTestState({ credits: 50000 });
    Fleet.init(state);
    state.fleet[0].maintenance = 42;
    state.fleet[0].typeId = 'freighter';
    state.fleet[0].mods = ['mod_cargo_rack'];
    state.fleet[0].modSlots = 2;

    var view = renderFleetMod(buildFleetModModel(state, 0, { focusModId: 'mod_service_bay' }));

    expect(view.title).toContain('模块改装 / 维修');
    expect(view.html).toContain('class="mod-modal-overview"');
    expect(view.html).toContain('class="mod-modal-signal-panel"');
    expect(view.html).toContain('<h4 class="mod-modal-section-title">结构模块</h4>');
    expect(view.html).toContain('<h4 class="mod-modal-section-title">功能组件</h4>');
    expect(view.html).toContain('<h4 class="mod-modal-section-title">港口保养</h4>');
    expect(view.html).toContain('<h4 class="mod-modal-section-title">资产处置</h4>');
    expect(view.html).toContain('data-focus-mod="recommendation"');
    expect(view.html).toContain('data-fleet-mod-intent="mod.structure.upgrade"');
    expect(view.html).toContain('data-fleet-mod-intent="mod.component.install"');
    expect(view.html).toContain('data-fleet-mod-intent="mod.component.uninstall"');
    expect(view.html).toContain('data-fleet-mod-intent="mod.service.start"');
    expect(view.html).toContain('data-fleet-mod-intent="mod.ship.sell"');
  });

  it('从嵌套目标规范化读取 intent，并拒绝非法、缺参和禁用入口', function () {
    expect(readFleetModIntent(createIntentTarget(FLEET_MOD_INTENT.UPGRADE, {
      shipIndex: 1,
      upgradeId: ' ship_cargo_i ',
    }))).toEqual({ type: FLEET_MOD_INTENT.UPGRADE, shipIndex: 1, upgradeId: 'ship_cargo_i' });
    expect(readFleetModIntent(createIntentTarget(FLEET_MOD_INTENT.INSTALL, {
      shipIndex: 2,
      modId: 'mod_cargo_rack',
    }))).toEqual({ type: FLEET_MOD_INTENT.INSTALL, shipIndex: 2, modId: 'mod_cargo_rack' });
    expect(readFleetModIntent(createIntentTarget(FLEET_MOD_INTENT.UNINSTALL, {
      shipIndex: 0,
      modId: 'mod_fuel_cell',
    }))).toEqual({ type: FLEET_MOD_INTENT.UNINSTALL, shipIndex: 0, modId: 'mod_fuel_cell' });
    expect(readFleetModIntent(createIntentTarget(FLEET_MOD_INTENT.SERVICE, {
      shipIndex: 0,
    }))).toEqual({ type: FLEET_MOD_INTENT.SERVICE, shipIndex: 0 });
    expect(readFleetModIntent(createIntentTarget(FLEET_MOD_INTENT.SELL, {
      shipIndex: 3,
    }))).toEqual({ type: FLEET_MOD_INTENT.SELL, shipIndex: 3 });
    expect(readFleetModIntent(createIntentTarget('mod.unknown', { shipIndex: 0 }))).toBeNull();
    expect(readFleetModIntent(createIntentTarget(FLEET_MOD_INTENT.INSTALL, { shipIndex: -1, modId: 'x' }))).toBeNull();
    expect(readFleetModIntent(createIntentTarget(FLEET_MOD_INTENT.UPGRADE, { shipIndex: 0, upgradeId: '' }))).toBeNull();
    expect(readFleetModIntent(createIntentTarget(FLEET_MOD_INTENT.SERVICE, { shipIndex: 0, disabled: true }))).toBeNull();
  });

  it('由 FleetUI 的改装内容根节点统一委托，Presenter 不绑定 DOM', function () {
    var uiSource = readFileSync('js/ui/FleetUI.js', 'utf8');
    var presenterSource = readFileSync('js/ui/FleetModPresenter.js', 'utf8');

    expect(uiSource).toContain('body.onclick = function (event)');
    expect(uiSource).toContain('readFleetModIntent(event && event.target)');
    expect(uiSource).not.toContain("body.querySelectorAll('.upg-modal-buy-btn");
    expect(uiSource).not.toContain("body.querySelectorAll('.mod-modal-buy-btn");
    expect(uiSource).not.toContain("body.querySelectorAll('.ship-repair-start-btn");
    expect(presenterSource).not.toContain('document.');
    expect(presenterSource).not.toContain('.onclick');
  });
});
