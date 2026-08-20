import { describe, expect, it } from 'vitest';
import {
  buildFleetShipContextView,
  buildFleetShipDetailView,
} from '../js/ui/FleetShipDetailPresenter.js';

function createModel(overrides) {
  return Object.assign({
    ship: { name: '先锋号', emoji: '🚀', hull: 84, fuel: 60 },
    shipIndex: 1,
    shipType: { name: '货运舰', icon: '🚛', description: '稳定货运平台' },
    role: { label: '贸易运输', summary: '适合稳定跑商。' },
    maintenance: { value: 76 },
    operating: {
      revenue: 1200,
      cargoCost: 500,
      fuelCost: 80,
      upkeepCost: 40,
      serviceCost: 30,
      tradeCycles: 4,
      net: 550,
    },
    cargoUsed: 8,
    maxCargo: 24,
    maxFuel: 100,
    maxHull: 100,
    crewCount: 2,
    modCount: 1,
    skillCount: 3,
    faultCount: 0,
    active: false,
    routeLabel: '太阳主星 → 新北京站',
  }, overrides || {});
}

describe('FleetShipDetailPresenter', function () {
  it('Context 摘要发布舰船局部详情 intent', function () {
    var view = buildFleetShipContextView(createModel());

    expect(view.title).toBe('舰船检查');
    expect(view.html).toContain('先锋号');
    expect(view.html).toContain('<small>货舱</small><strong>8/24</strong>');
    expect(view.html).toContain('data-context-action="open-detail" data-ship-index="1"');
    expect(view.html).toContain('data-workspace-action-slot');
    expect(view.html).toContain('data-action-scope="local"');
    expect(view.html).toContain('data-workspace-id="fleet"');
    expect(view.html).toContain('查看完整舰船详情');
  });

  it('L4 汇总运行与配置事实，不复制舰队领域动作', function () {
    var view = buildFleetShipDetailView(createModel());

    expect(view.title).toBe('先锋号 · 舰船详情');
    expect(view.html).toContain('data-fleet-ship-detail="1"');
    expect(view.html).toContain('<small>累计净额</small><strong>+550</strong>');
    expect(view.html).toContain('4 次贸易循环');
    expect(view.html).toContain('1 模块 · 2 船员');
    expect(view.html).toContain('切换、改装、派遣和维护仍在舰队工作区内确认');
    expect(view.html).not.toContain('data-fleet-command');
  });

  it('转义玩家舰名、路线和描述，缺少舰船时拒绝投影', function () {
    var model = createModel({
      ship: { name: '<script>bad</script>', hull: 1, fuel: 1 },
      role: { label: 'A&B', summary: '<img src=x>' },
      routeLabel: '" onclick="bad',
    });
    var context = buildFleetShipContextView(model);
    var detail = buildFleetShipDetailView(model);

    expect(context.html).not.toContain('<script>');
    expect(context.html).not.toContain('<img');
    expect(context.html).toContain('A&amp;B');
    expect(detail.html).toContain('&quot; onclick=&quot;bad');
    expect(buildFleetShipContextView({})).toBe(null);
    expect(buildFleetShipDetailView(null)).toBe(null);
  });
});
