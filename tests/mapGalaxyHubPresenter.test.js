import { describe, expect, it } from 'vitest';
import {
  buildGalaxyHubModel,
  buildGalaxyHubPanel,
  renderGalaxyHub,
} from '../js/ui/MapGalaxyHubPresenter.js';
import { GALAXIES } from '../js/data/systems.js';

function createState(overrides) {
  return Object.assign({
    currentGalaxy: 'milky_way',
    playerLevel: 1,
    researchedTechs: [],
    visitedGalaxies: ['milky_way'],
  }, overrides || {});
}

describe('MapGalaxyHubPresenter', function () {
  it('构建当前/聚焦星系、访问记录与等级解锁模型', function () {
    var model = buildGalaxyHubModel(createState(), { focusGalaxyId: 'andromeda' });
    var current = model.cards.find(function (card) { return card.id === 'milky_way'; });
    var focused = model.cards.find(function (card) { return card.id === 'andromeda'; });

    expect(model.currentGalaxy.id).toBe('milky_way');
    expect(model.focusGalaxy.id).toBe('andromeda');
    expect(model.accessibleGalaxyCount).toBe(1);
    expect(model.cards).toHaveLength(GALAXIES.length);
    expect(current).toMatchObject({ current: true, visited: true, unlocked: true });
    expect(focused).toMatchObject({ focused: true, visited: false, unlocked: false, requiredLevel: 2 });
    expect(focused.tradeSummary).toContain('主供');
  });

  it('超空间跃迁可提前解锁星系，且模型不修改输入 state', function () {
    var state = createState({ researchedTechs: ['hyperspace_jump'] });
    var before = JSON.stringify(state);
    var model = buildGalaxyHubModel(state, { focusGalaxyId: 'andromeda' });
    var andromeda = model.cards.find(function (card) { return card.id === 'andromeda'; });

    expect(andromeda).toMatchObject({ unlocked: true, unlockedByTech: true });
    expect(andromeda.note).toContain('提前开放');
    expect(model.focusGalaxy.unlockText).toBe('科技提前开放');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('渲染稳定的返回/进入 intent，锁定星系不可交互', function () {
    var model = buildGalaxyHubModel(createState(), { focusGalaxyId: 'andromeda' });
    var html = renderGalaxyHub(model);

    expect(html).toContain('data-galaxy-action="return-planets"');
    expect(html).toContain('data-galaxy-action="open" data-galaxy-id="milky_way"');
    expect(html).toContain('data-galaxy-id="andromeda" disabled aria-disabled="true"');
    expect(html).toContain('galaxy-switcher-card--focus');
    expect(html).toContain('鼠标所指');
    expect(buildGalaxyHubPanel(createState())).toContain('当前导航');
  });
});
