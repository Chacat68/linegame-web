import { describe, expect, it } from 'vitest';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import * as GalaxyData from '../js/systems/galaxy/GalaxyDataLayer.js';
import * as MarketUI from '../js/ui/MarketUI.js';
import * as FleetUI from '../js/ui/FleetUI.js';
import { createTestState } from './helpers.js';

function createHost() {
  return { innerHTML: '' };
}

describe('workspace Context Inspector presenters', function () {
  it('市场商品 presenter 从最新 state 和经济投影生成事实摘要', function () {
    var state = createTestState({ currentSystem: 'sol_prime', cargo: { food: 3 } });
    GalaxyData.init(state);
    Economy.init(state);
    var host = createHost();

    expect(MarketUI.renderContextInspector({
      context: { type: 'commodity', id: 'food', source: 'test' },
      state: state,
      container: host,
    })).toEqual({ title: '商品检查' });
    expect(host.innerHTML).toContain('食物');
    expect(host.innerHTML).toContain('太阳主星');
    expect(host.innerHTML).toContain('<small>货舱</small><strong>3</strong>');
    expect(MarketUI.renderContextInspector({
      context: { type: 'commodity', id: 'missing' }, state: state, container: host,
    })).toBe(false);
  });

  it('舰船 presenter 解析索引并呈现船况、货舱和运行状态', function () {
    var state = createTestState();
    Fleet.init(state);
    state.fleet[0].cargo = { food: 2 };
    var host = createHost();

    expect(FleetUI.renderContextInspector({
      context: { type: 'ship', id: '0' },
      state: state,
      container: host,
    })).toEqual({ title: '舰船检查' });
    expect(host.innerHTML).toContain('workspace-context-card--ship');
    expect(host.innerHTML).toContain('当前操控舰');
    expect(host.innerHTML).toContain('<small>货舱</small><strong>2/');
    expect(FleetUI.renderContextInspector({
      context: { type: 'ship', id: '999' }, state: state, container: host,
    })).toBe(false);
  });
});
