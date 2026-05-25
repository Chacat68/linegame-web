import { describe, expect, it } from 'vitest';
import { handleGuidanceAction } from '../js/core/GuidanceActionController.js';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import * as Guidance from '../js/systems/guidance/GuidanceSystem.js';
import * as Quest from '../js/systems/quest/QuestSystem.js';
import * as Trade from '../js/systems/trade/TradeSystem.js';
import { createTestState } from './helpers.js';

function initSmokeState() {
  var state = createTestState({
    credits: 5000,
    fuel: 100,
    maxFuel: 100,
  });

  Economy.init();
  Fleet.init(state);
  Faction.init(state);
  Quest.init(state);

  return state;
}

function createGuidanceContext(state) {
  return {
    getState: function () { return state; },
    prepareDirectExecution: function () {},
    acceptQuest: function (questId) {
      var result = Quest.acceptQuest(state, questId);
      expect(result.ok).toBe(true);
    },
    openTradeConfirmation: function (action, payload) {
      var goodId = payload.goodId;
      var quantity = action === 'sell' ? (state.cargo[goodId] || 0) : 1;
      var result = action === 'sell'
        ? Trade.sellGood(state, goodId, quantity)
        : Trade.buyGood(state, goodId, quantity);

      expect(result.ok).toBe(true);
      Quest.checkProgress(state, Object.assign({
        action: action,
        systemId: state.currentSystem,
      }, result.meta || {}));
    },
    travel: function (systemId) {
      var result = Trade.travelTo(state, systemId);
      expect(result.ok).toBe(true);

      if (!state.visitedSystems.includes(state.currentSystem)) {
        state.visitedSystems.push(state.currentSystem);
      }

      var faction = Faction.getFactionForSystem(state.currentSystem);
      Quest.checkProgress(state, {
        action: 'travel',
        systemId: state.currentSystem,
        factionId: faction ? faction.id : null,
      });
    },
    refreshActionGuide: function () {},
  };
}

function runCurrentGuidance(state, context) {
  var suggestion = Guidance.getCurrentSuggestion(state);
  expect(suggestion).toBeTruthy();
  handleGuidanceAction(suggestion, context);
  return suggestion;
}

describe('core gameplay smoke', function () {
  it('runs the action guide through quest, buy, travel, and sell actions', function () {
    var state = initSmokeState();
    var context = createGuidanceContext(state);

    var acceptSuggestion = runCurrentGuidance(state, context);
    expect(acceptSuggestion.actionType).toBe('quest.accept');
    expect(Quest.getActiveQuests(state).map(function (quest) { return quest.id; })).toContain('starter_first_trade');

    var buySuggestion = runCurrentGuidance(state, context);
    expect(buySuggestion.actionType).toBe('trade.buy');
    expect(state.completedQuests).toContain('starter_first_trade');
    expect(state.cargo[buySuggestion.payload.goodId]).toBeGreaterThan(0);

    var travelSuggestion = runCurrentGuidance(state, context);
    expect(travelSuggestion.actionType).toBe('travel.execute');
    expect(state.currentSystem).toBe(travelSuggestion.payload.destinationSystemId);

    var sellSuggestion = Guidance.getCurrentSuggestion(state);
    expect(sellSuggestion.actionType).toBe('trade.sell');
    handleGuidanceAction(sellSuggestion, context);
    expect(state.cargo[sellSuggestion.payload.goodId] || 0).toBe(0);
    expect(state.totalProfit).toBeGreaterThan(0);
  });
});
