import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import {
  FLEET_SHOP_INTENT,
  buildFleetShopModel,
  readFleetShopIntent,
  renderFleetShop,
} from '../js/ui/FleetShopPresenter.js';
import { createTestState } from './helpers.js';

function createIntentTarget(type, shipTypeId, disabled) {
  var element = {
    dataset: { fleetShopIntent: type, shipTypeId: shipTypeId },
    disabled: !!disabled,
  };
  return {
    closest: function (selector) {
      return selector === '[data-fleet-shop-intent]' ? element : null;
    },
  };
}

describe('FleetShopPresenter', function () {
  it('从最新舰队、预算和席位构造采购模型与稳定焦点', function () {
    var state = createTestState({ credits: 5000 });
    Fleet.init(state);
    state.fleetSlots = 2;

    var model = buildFleetShopModel(state);
    expect(model).toMatchObject({
      credits: 5000,
      fleetLen: 1,
      slotCount: 2,
      hasAvailableSlot: true,
      routeLevel: 2,
    });
    expect(model.entries).toHaveLength(3);
    expect(model.affordableEntries.map(function (entry) { return entry.type.id; })).toEqual(['freighter', 'clipper']);
    expect(model.focusEntry.type.id).toBe('freighter');
    expect(model.focusEntry.roleLabel).toBe('货运主力');
    expect(buildFleetShopModel(null)).toBeNull();
  });

  it('预算不足或席位锁定时输出事实状态并禁用购买', function () {
    var state = createTestState({ credits: 0 });
    Fleet.init(state);
    state.fleetSlots = state.fleet.length;
    var model = buildFleetShopModel(state);
    var html = renderFleetShop(model);

    expect(model.focusEntry).toBeNull();
    expect(html).toContain('采购暂停');
    expect(html).toContain('席位锁定');
    expect(html).toContain('需要先购买席位');
    expect(html).not.toContain('data-fleet-shop-intent');
  });

  it('输出采购摘要、局部焦点、船卡信号和单一购买 intent', function () {
    var state = createTestState({ credits: 5000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    var html = renderFleetShop(buildFleetShopModel(state));

    expect(html).toContain('class="hangar-shop-brief" aria-label="购船决策摘要"');
    expect(html).toContain('class="hangar-shop-focus" aria-label="采购焦点"');
    expect(html).toContain('<span>采购焦点</span>');
    expect(html).toContain('fleet-shop-card--focus');
    expect(html).toContain('fleet-shop-signal-strip');
    expect(html).toContain('data-fleet-shop-intent="shop.ship.buy"');
    expect(html).toContain('data-ship-type-id="freighter"');
  });

  it('规范化嵌套目标并拒绝未知船型、禁用和非法 intent', function () {
    expect(readFleetShopIntent(createIntentTarget(FLEET_SHOP_INTENT.BUY_SHIP, ' freighter '))).toEqual({
      type: FLEET_SHOP_INTENT.BUY_SHIP,
      shipTypeId: 'freighter',
    });
    expect(readFleetShopIntent(createIntentTarget(FLEET_SHOP_INTENT.BUY_SHIP, 'starter'))).toBeNull();
    expect(readFleetShopIntent(createIntentTarget(FLEET_SHOP_INTENT.BUY_SHIP, 'unknown'))).toBeNull();
    expect(readFleetShopIntent(createIntentTarget('shop.unknown', 'freighter'))).toBeNull();
    expect(readFleetShopIntent(createIntentTarget(FLEET_SHOP_INTENT.BUY_SHIP, 'freighter', true))).toBeNull();

    var uiSource = readFileSync('js/ui/FleetUI.js', 'utf8');
    var presenterSource = readFileSync('js/ui/FleetShopPresenter.js', 'utf8');
    expect(uiSource).toContain('container.onclick = function (event)');
    expect(uiSource).toContain('readFleetShopIntent(event && event.target)');
    expect(uiSource).not.toContain("querySelectorAll('.fleet-can-buy')");
    expect(presenterSource).not.toContain('document.');
    expect(presenterSource).not.toContain('.onclick');
  });
});
