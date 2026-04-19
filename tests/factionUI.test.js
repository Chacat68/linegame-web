import { beforeEach, describe, expect, it } from 'vitest';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import * as GalaxyData from '../js/systems/galaxy/GalaxyDataLayer.js';
import { getFactionMarketAction } from '../js/ui/FactionUI.js?v=20260419-marketcta2';
import { createTestState } from './helpers.js';

describe('FactionUI market CTA helper', function () {
  let state;

  beforeEach(function () {
    state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
    });

    Faction.init(state);
    GalaxyData.init(state);
  });

  it('辛迪加解锁后返回黑市 CTA', function () {
    state.factionRelations.syndicate = 45;

    const action = getFactionMarketAction(state, 'syndicate');

    expect(action).toMatchObject({
      factionId: 'syndicate',
      factionName: '星际辛迪加',
      systemId: 'shadow_haven',
      systemName: '暗影港湾',
      label: '查看黑市通路',
      marketWorkspaceId: 'spot',
      marketSubworkspaceId: 'black',
      marketFocusLabel: '黑市分区',
      marketMode: 'black',
    });
    expect(action.hint).toContain('暗影港湾');
    expect(action.hint).toContain('黑市通路');
  });

  it('辛迪加未解锁时返回黑市条件 CTA', function () {
    const action = getFactionMarketAction(state, 'syndicate');

    expect(action).toMatchObject({
      factionId: 'syndicate',
      systemId: 'shadow_haven',
      label: '查看黑市条件',
      marketWorkspaceId: 'spot',
      marketSubworkspaceId: 'intel',
      marketFocusLabel: '市场情报区',
      marketMode: '',
    });
    expect(action.contextHint).toContain('辛迪加黑市尚未开放');
    expect(action.hint).toContain('公开情报');
  });

  it('非黑市派系默认返回代表市场 CTA', function () {
    const action = getFactionMarketAction(state, 'federation');

    expect(action).toMatchObject({
      factionId: 'federation',
      systemId: 'sol_prime',
      systemName: '太阳主星',
      label: '查看代表市场',
      marketWorkspaceId: 'spot',
      marketSubworkspaceId: 'trade',
      marketFocusLabel: '现货交易区',
      marketMode: '',
    });
    expect(action.hint).toContain('太阳主星');
    expect(action.hint).toContain('现货交易区');
  });
});