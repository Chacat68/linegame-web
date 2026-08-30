import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import {
  FLEET_HANGAR_INTENT,
  buildFleetHangarModel,
  getFleetCargoUsed,
  readFleetHangarIntent,
  renderFleetHangar,
} from '../js/ui/FleetHangarPresenter.js';
import { createTestState } from './helpers.js';

function createIntentTarget(type, shipIndex, options) {
  var opts = options || {};
  var element = {
    dataset: { hangarIntent: type },
    disabled: !!opts.disabled,
  };
  if (shipIndex !== undefined) element.dataset.shipIndex = String(shipIndex);
  return {
    closest: function (selector) {
      return selector === '[data-hangar-intent]' ? element : null;
    },
  };
}

describe('FleetHangarPresenter', function () {
  it('构造最新机库只读模型，并把查看舰与操控舰分离', function () {
    var state = createTestState({ credits: 50000 });
    Fleet.init(state);
    var secondShip = JSON.parse(JSON.stringify(state.fleet[0]));
    secondShip.name = '远航 & 测试舰';
    secondShip.cargo = { food: 3 };
    state.fleet.push(secondShip);
    state.fleetSlots = 2;
    state.activeShipIndex = 0;
    state.lastSwitchedShipIndex = 1;
    state.lastShipSwitchAt = 1000;

    var model = buildFleetHangarModel(state, 1, { now: 1500 });

    expect(model.activeIdx).toBe(0);
    expect(model.inspectedIdx).toBe(1);
    expect(model.inspectedSnapshot.ship).toBe(secondShip);
    expect(model.inspectedSnapshot.cargoUsed).toBe(3);
    expect(model.canFlash).toBe(true);
    expect(model.slotCount).toBe(2);
    expect(model.nextSlot.slot.id).toBe(3);
  });

  it('输出稳定语义结构与单一 intent 标记，并转义玩家可编辑名称', function () {
    var state = createTestState({ credits: 50000 });
    Fleet.init(state);
    state.fleet[0].name = '<script>bad</script>';
    state.fleet[0].maintenance = 62;

    var html = renderFleetHangar(buildFleetHangarModel(state, 0, { now: 0 }));

    expect(html).toContain('class="hangar-operations-deck"');
    expect(html).toContain('class="hangar-fleet-selector"');
    expect(html).toContain('class="hangar-ship-workspace"');
    expect(html).toContain('class="hangar-support-panel"');
    expect(html).toContain('data-hangar-intent="hangar.ship.inspect"');
    expect(html).toContain('data-hangar-intent="hangar.mods.open"');
    expect(html).toContain('data-hangar-intent="hangar.crew.open"');
    expect(html).toContain('data-hangar-intent="hangar.dispatch.open"');
    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(html).not.toContain('<script>bad</script>');
  });

  it('从嵌套点击目标读取规范化 intent，并拒绝非法或禁用入口', function () {
    expect(readFleetHangarIntent(createIntentTarget(FLEET_HANGAR_INTENT.OPEN_MODS, 2))).toEqual({
      type: FLEET_HANGAR_INTENT.OPEN_MODS,
      shipIndex: 2,
    });
    expect(readFleetHangarIntent(createIntentTarget(FLEET_HANGAR_INTENT.BUY_SLOT))).toEqual({
      type: FLEET_HANGAR_INTENT.BUY_SLOT,
    });
    expect(readFleetHangarIntent(createIntentTarget(FLEET_HANGAR_INTENT.SWITCH_SHIP, -1))).toBeNull();
    expect(readFleetHangarIntent(createIntentTarget('hangar.unknown', 0))).toBeNull();
    expect(readFleetHangarIntent(createIntentTarget(FLEET_HANGAR_INTENT.OPEN_DISPATCH, 0, { disabled: true }))).toBeNull();
  });

  it('货舱汇总容忍空值，并由 FleetHangarController 使用单一容器委托', function () {
    expect(getFleetCargoUsed(null)).toBe(0);
    expect(getFleetCargoUsed({ food: 2, ore: 5 })).toBe(7);

    var uiSource = readFileSync('js/ui/FleetUI.js', 'utf8');
    var controllerSource = readFileSync('js/ui/FleetHangarController.js', 'utf8');
    expect(uiSource).toContain("from './FleetHangarController.js'");
    expect(uiSource).not.toContain('readFleetHangarIntent(');
    expect(uiSource).not.toContain("getElementById('fleet-list')");
    expect(controllerSource).toContain('container.onclick = handler');
    expect(controllerSource).toContain('readFleetHangarIntent(event && event.target)');
    expect(controllerSource).not.toContain("container.querySelectorAll('[data-inspect-ship-index]')");
    expect(controllerSource).not.toContain("container.querySelectorAll('.fleet-open-mod-btn')");
  });
});
