import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as Crew from '../js/systems/fleet/CrewSystem.js';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import {
  FLEET_CREW_INTENT,
  buildFleetCrewModel,
  readFleetCrewIntent,
  renderFleetCrew,
} from '../js/ui/FleetCrewPresenter.js';
import { createTestState } from './helpers.js';

function createOffer(state, overrides) {
  var market = Crew.getCrewMarket(state, state.currentSystem);
  return Object.assign({}, market.offers[0], overrides || {});
}

function createIntentTarget(type, options) {
  var opts = options || {};
  var element = {
    dataset: { fleetCrewIntent: type },
    disabled: !!opts.disabled,
  };
  if (opts.shipIndex !== undefined) element.dataset.shipIndex = String(opts.shipIndex);
  if (opts.crewId !== undefined) element.dataset.crewId = opts.crewId;
  if (opts.offerId !== undefined) element.dataset.offerId = opts.offerId;
  return {
    closest: function (selector) {
      return selector === '[data-fleet-crew-intent]' ? element : null;
    },
  };
}

function prepareCrewState() {
  var state = createTestState({ credits: 12000, currentSystem: 'sol_prime' });
  Fleet.init(state);
  state.fleet[0].crewCapacity = 2;
  state.crewMarket.sol_prime = {
    systemId: 'sol_prime',
    refreshDay: 1,
    nextRefreshDay: 4,
    themeLabel: '综合港',
    offers: [
      createOffer(state, {
        id: 'offer_assigned',
        name: '<领航员>',
        role: 'pilot',
        roleName: '领航员',
        specialtyId: 'route_savant',
        specialtyName: '主航路算师',
        branchLabel: '航路派',
        hireCost: 420,
        wage: 95,
      }),
      createOffer(state, {
        id: 'offer_reserve',
        name: '预备货运',
        role: 'quartermaster',
        roleName: '货运主管',
        specialtyId: 'container_architect',
        specialtyName: '集装架构师',
        branchLabel: '仓储派',
        hireCost: 460,
        wage: 110,
      }),
      createOffer(state, {
        id: 'offer_market',
        name: '市场经纪',
        role: 'broker',
        roleName: '交易掮客',
        specialtyId: 'market_maker',
        specialtyName: '行情做市人',
        branchLabel: '做市派',
        hireCost: 500,
        wage: 120,
      }),
    ],
  };
  Crew.recruitCrew(state, 'offer_assigned', 'sol_prime');
  Crew.recruitCrew(state, 'offer_reserve', 'sol_prime');
  Crew.assignCrewToShip(state, state.crewRoster[0].id, 0);
  return state;
}

describe('FleetCrewPresenter', function () {
  it('构造船员详情模型，并区分席位、预备队和港口候选', function () {
    var state = prepareCrewState();
    var model = buildFleetCrewModel(state, 0);

    expect(model.ship).toBe(state.fleet[0]);
    expect(model.isActive).toBe(true);
    expect(model.shipCrew).toHaveLength(1);
    expect(model.reserveCrew).toHaveLength(1);
    expect(model.marketCrew).toHaveLength(1);
    expect(model.capacity).toBe(2);
    expect(model.remaining).toBe(1);
    expect(model.seatTone).toBe('ready');
    expect(model.rosterHint).toContain('还有 1 个空席位');
    expect(buildFleetCrewModel(state, -1)).toBeNull();
    expect(buildFleetCrewModel(state, 99)).toBeNull();
  });

  it('输出稳定分区与单一 intent 标记，并转义玩家可编辑名称', function () {
    var state = prepareCrewState();
    state.fleet[0].name = '<script>bad</script>';
    var view = renderFleetCrew(buildFleetCrewModel(state, 0));
    var html = [view.summary, view.assigned, view.reserve, view.market].join('\n');

    expect(view.title).toContain('<script>bad</script>');
    expect(view.dataset).toEqual({
      crewShipIndex: '0',
      crewSeatState: 'ready',
      crewReserveState: 'ready',
      crewMarketState: 'ready',
    });
    expect(html).toContain('data-fleet-crew-intent="crew.member.unassign"');
    expect(html).toContain('data-fleet-crew-intent="crew.member.assign"');
    expect(html).toContain('data-fleet-crew-intent="crew.member.dismiss"');
    expect(html).toContain('data-fleet-crew-intent="crew.offer.recruit"');
    expect(html).toContain('&lt;领航员&gt;');
    expect(html).not.toContain('<领航员>');
    expect(view.assignedStatus).toContain('1/2');
    expect(view.marketStatus).toContain('1 人');
  });

  it('从嵌套目标规范化读取 intent，并拒绝非法、缺参和禁用入口', function () {
    expect(readFleetCrewIntent(createIntentTarget(FLEET_CREW_INTENT.ASSIGN, {
      shipIndex: 2,
      crewId: ' crew_2 ',
    }))).toEqual({ type: FLEET_CREW_INTENT.ASSIGN, shipIndex: 2, crewId: 'crew_2' });
    expect(readFleetCrewIntent(createIntentTarget(FLEET_CREW_INTENT.RECRUIT, {
      offerId: 'offer_1',
    }))).toEqual({ type: FLEET_CREW_INTENT.RECRUIT, offerId: 'offer_1' });
    expect(readFleetCrewIntent(createIntentTarget(FLEET_CREW_INTENT.DISMISS, {
      crewId: 'crew_3',
    }))).toEqual({ type: FLEET_CREW_INTENT.DISMISS, crewId: 'crew_3' });
    expect(readFleetCrewIntent(createIntentTarget(FLEET_CREW_INTENT.SWITCH_SHIP, {
      shipIndex: 1,
    }))).toEqual({ type: FLEET_CREW_INTENT.SWITCH_SHIP, shipIndex: 1 });
    expect(readFleetCrewIntent(createIntentTarget('crew.unknown', { shipIndex: 0 }))).toBeNull();
    expect(readFleetCrewIntent(createIntentTarget(FLEET_CREW_INTENT.ASSIGN, { shipIndex: -1, crewId: 'x' }))).toBeNull();
    expect(readFleetCrewIntent(createIntentTarget(FLEET_CREW_INTENT.RECRUIT, { offerId: '' }))).toBeNull();
    expect(readFleetCrewIntent(createIntentTarget(FLEET_CREW_INTENT.DISMISS, { crewId: 'x', disabled: true }))).toBeNull();
  });

  it('由 FleetUI 的船员内容根节点统一委托，不在 Presenter 中绑定 DOM', function () {
    var uiSource = readFileSync('js/ui/FleetUI.js', 'utf8');
    var presenterSource = readFileSync('js/ui/FleetCrewPresenter.js', 'utf8');

    expect(uiSource).toContain('modalBox.onclick = function (event)');
    expect(uiSource).toContain('readFleetCrewIntent(event && event.target)');
    expect(uiSource).not.toContain("modalBox.querySelectorAll('.crew-unassign-btn')");
    expect(uiSource).not.toContain("modalBox.querySelectorAll('.crew-dismiss-btn')");
    expect(presenterSource).not.toContain('document.');
    expect(presenterSource).not.toContain('.onclick');
  });
});
